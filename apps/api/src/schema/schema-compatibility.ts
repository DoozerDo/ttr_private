import type { ConfigService } from '@nestjs/config';
import type { DataSource } from 'typeorm';

export async function assertUsersBetaAccessApprovedColumnCompatible(input: {
  dataSource: Pick<DataSource, 'query'>;
  config: Pick<ConfigService, 'get'>;
  logger?: Pick<Console, 'log' | 'error'>;
}) {
  const logger = input.logger ?? console;
  const columns = (await input.dataSource.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'betaAccessApproved'`,
  )) as Array<{ column_name: string }>;

  const hasBetaAccessApproved = columns.length > 0;
  if (hasBetaAccessApproved) {
    logger.log('[SCHEMA CHECK] users.betaAccessApproved column present.');
    return;
  }

  logger.error(
    '[SCHEMA CHECK] users.betaAccessApproved column is missing. The database is behind required migrations for this API version.',
  );

  const allowDriftRaw =
    input.config.get<string>('ALLOW_SCHEMA_DRIFT_COMPAT') ??
    process.env.ALLOW_SCHEMA_DRIFT_COMPAT;
  const allowSchemaDrift =
    typeof allowDriftRaw === 'string' &&
    ['1', 'true', 'yes'].includes(allowDriftRaw.trim().toLowerCase());

  if (!allowSchemaDrift) {
    throw new Error(
      'Schema incompatible: missing users.betaAccessApproved (set ALLOW_SCHEMA_DRIFT_COMPAT=true only as a temporary bridge).',
    );
  }
}

