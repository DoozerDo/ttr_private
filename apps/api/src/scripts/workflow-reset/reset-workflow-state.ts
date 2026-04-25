import 'reflect-metadata';
import { Client } from 'pg';
import { buildWorkflowResetPlan } from './reset-plan';

type Mode = 'dry-run' | 'execute';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function parseArgs(argv: string[]): { mode: Mode } {
  const mode = argv[2] as Mode | undefined;
  if (mode !== 'dry-run' && mode !== 'execute') {
    throw new Error(`Usage: reset-workflow-state <dry-run|execute>`);
  }
  return { mode };
}

function parseDatabaseUrl(databaseUrl: string): { host: string; database: string; sslmode: string | null } {
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error('DATABASE_URL is not a valid URL.');
  }

  const host = url.host;
  const database = url.pathname?.replace(/^\//, '') ?? '';
  const sslmode = url.searchParams.get('sslmode');

  if (!host) throw new Error('DATABASE_URL host is empty.');
  if (!database) throw new Error('DATABASE_URL database name is empty.');

  return { host, database, sslmode };
}

async function fetchPublicTables(client: Client): Promise<string[]> {
  const { rows } = await client.query<{
    table_name: string;
  }>(
    `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
      ORDER BY table_name ASC
    `,
  );
  return rows.map((r) => r.table_name);
}

async function fetchEstimatedRowCount(client: Client, tableName: string): Promise<number> {
  const { rows } = await client.query<{ estimate: string }>(
    `
      SELECT COALESCE(c.reltuples, 0)::bigint AS estimate
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = $1
        AND c.relkind = 'r'
      LIMIT 1
    `,
    [tableName],
  );
  if (rows.length === 0) return 0;
  return Number(rows[0].estimate);
}

async function fetchExactRowCount(client: Client, tableName: string): Promise<number> {
  const { rows } = await client.query<{ count: string }>(`SELECT COUNT(*)::bigint AS count FROM "${tableName}"`);
  return Number(rows[0].count);
}

type ForeignKeyEdge = { referencing: string; referenced: string };

async function fetchForeignKeys(client: Client): Promise<ForeignKeyEdge[]> {
  const { rows } = await client.query<ForeignKeyEdge>(
    `
      SELECT
        conrelid::regclass::text AS referencing,
        confrelid::regclass::text AS referenced
      FROM pg_constraint
      WHERE contype = 'f'
    `,
  );

  // Normalize to bare table names in public schema when possible.
  return rows
    .map((r) => ({
      referencing: r.referencing.replace(/^public\./, '').replace(/"/g, ''),
      referenced: r.referenced.replace(/^public\./, '').replace(/"/g, ''),
    }))
    .filter((r) => r.referencing.length > 0 && r.referenced.length > 0);
}

function computeCascadeSpillover(fks: ForeignKeyEdge[], clearSet: Set<string>, preserveSet: Set<string>): string[] {
  const offenders = new Set<string>();
  for (const fk of fks) {
    if (!clearSet.has(fk.referenced)) continue;
    if (clearSet.has(fk.referencing)) continue;
    if (preserveSet.has(fk.referencing)) offenders.add(fk.referencing);
    else offenders.add(fk.referencing);
  }
  return Array.from(offenders).sort();
}

async function main() {
  const { mode } = parseArgs(process.argv);

  // Strong guardrails (always required, even for dry-run).
  if (process.env.ENABLE_WORKFLOW_RESET !== 'true') {
    throw new Error('Refusing to run: set ENABLE_WORKFLOW_RESET=true');
  }
  if (process.env.WORKFLOW_RESET_CONFIRM !== 'RESET_WORKFLOW_STATE') {
    throw new Error('Refusing to run: set WORKFLOW_RESET_CONFIRM=RESET_WORKFLOW_STATE');
  }

  const databaseUrl = requireEnv('DATABASE_URL');
  const { host, database, sslmode } = parseDatabaseUrl(databaseUrl);
  console.log(`[workflow-reset] Target DB: host=${host} db=${database} sslmode=${sslmode ?? 'n/a'}`);

  const client = new Client({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
    application_name: 'workflow-reset',
  });

  await client.connect();
  try {
    const discoveredTables = await fetchPublicTables(client);
    const plan = buildWorkflowResetPlan(discoveredTables);

    const preserveSet = new Set(plan.preserve);
    const clearSet = new Set(plan.clear);

    const fks = await fetchForeignKeys(client);
    const spillover = computeCascadeSpillover(fks, clearSet, preserveSet);

    console.log(`[workflow-reset] Mode: ${mode}`);
    console.log(`[workflow-reset] Discovered public tables: ${discoveredTables.length}`);

    if (spillover.length > 0) {
      console.log(
        `[workflow-reset] Refusing to proceed: TRUNCATE ... CASCADE would also truncate tables not in the clear list: ${spillover.join(
          ', ',
        )}`,
      );
      console.log(`[workflow-reset] Move those tables to clear list intentionally OR keep them preserved.`);
      process.exitCode = 2;
      return;
    }

    console.log(`\n[workflow-reset] Preserve (will not be modified):`);
    for (const t of plan.preserve.sort()) console.log(`  - ${t}`);

    console.log(`\n[workflow-reset] Manual review required (preserved by default):`);
    for (const t of [...plan.manualReview, ...plan.unknownDiscovered].sort()) console.log(`  - ${t}`);

    console.log(`\n[workflow-reset] Clear (workflow/product state):`);
    for (const t of plan.clear.sort()) console.log(`  - ${t}`);

    console.log(`\n[workflow-reset] Estimated row counts (pg_class.reltuples):`);
    const estimateTargets = [...plan.preserve, ...plan.manualReview, ...plan.unknownDiscovered, ...plan.clear].sort();
    for (const t of estimateTargets) {
      const estimate = await fetchEstimatedRowCount(client, t);
      console.log(`  - ${t}: ~${estimate}`);
    }

    if (mode === 'dry-run') {
      console.log(`\n[workflow-reset] Dry-run complete. No changes made.`);
      return;
    }

    if (plan.clear.length === 0) {
      console.log(`\n[workflow-reset] Nothing to clear (clear list empty).`);
      return;
    }

    console.log(`\n[workflow-reset] Executing reset in a single transaction...`);
    await client.query('BEGIN');
    try {
      // Transaction-safe in Postgres: TRUNCATE is transactional.
      const truncateSql = `TRUNCATE TABLE ${plan.clear
        .map((t) => `"public"."${t}"`)
        .join(', ')} RESTART IDENTITY CASCADE`;
      await client.query(truncateSql);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    }

    console.log(`\n[workflow-reset] Post-reset verification (exact row counts):`);
    const verifyPreserve = plan.preserve.slice().sort();
    const verifyClear = plan.clear.slice().sort();
    const verifyReview = [...plan.manualReview, ...plan.unknownDiscovered].sort();

    for (const t of verifyPreserve) {
      const count = await fetchExactRowCount(client, t);
      console.log(`  - PRESERVE ${t}: ${count}`);
    }
    for (const t of verifyReview) {
      const count = await fetchExactRowCount(client, t);
      console.log(`  - REVIEW   ${t}: ${count}`);
    }
    for (const t of verifyClear) {
      const count = await fetchExactRowCount(client, t);
      console.log(`  - CLEARED  ${t}: ${count}`);
    }

    console.log(`\n[workflow-reset] Summary: preserved identity/auth/admin continuity; cleared workflow/product state.`);
    console.log(`[workflow-reset] Rollback expectation: restore from DB backup only.`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(`[workflow-reset] ERROR: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
