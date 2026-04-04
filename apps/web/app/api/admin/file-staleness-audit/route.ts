import fs from "node:fs/promises";
import path from "node:path";

import { NextRequest, NextResponse } from "next/server";

import { requireAuthToken } from "../../baselines/helpers";
import {
  buildPersistedSnapshot,
  runFileStalenessAudit,
  type PersistedFileStalenessAuditSnapshot,
} from "@/src/lib/fileStalenessAudit";

export const runtime = "nodejs";

const SNAPSHOT_PATH = path.resolve(process.cwd(), ".data", "file-staleness-audit.json");

function repoRoot() {
  return path.resolve(process.cwd(), "..", "..");
}

async function readSnapshot(): Promise<PersistedFileStalenessAuditSnapshot | null> {
  try {
    const raw = await fs.readFile(SNAPSHOT_PATH, "utf8");
    return JSON.parse(raw) as PersistedFileStalenessAuditSnapshot;
  } catch {
    return null;
  }
}

async function writeSnapshot(snapshot: PersistedFileStalenessAuditSnapshot) {
  await fs.mkdir(path.dirname(SNAPSHOT_PATH), { recursive: true });
  await fs.writeFile(SNAPSHOT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
}

export async function GET(req: NextRequest) {
  const auth = requireAuthToken(req);
  if (!auth.token) return auth.error;
  const snapshot = await readSnapshot();
  return NextResponse.json(snapshot);
}

export async function POST(req: NextRequest) {
  const auth = requireAuthToken(req);
  if (!auth.token) return auth.error;
  const result = await runFileStalenessAudit(repoRoot());
  const snapshot = buildPersistedSnapshot(result);
  await writeSnapshot(snapshot);
  return NextResponse.json({ result, snapshot });
}
