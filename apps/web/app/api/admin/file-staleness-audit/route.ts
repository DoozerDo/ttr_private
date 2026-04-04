import { NextRequest, NextResponse } from "next/server";

import { requireAuthToken } from "../../baselines/helpers";
import {
  buildPersistedSnapshot,
  readPersistedFileStalenessAuditSnapshot,
  runFileStalenessAudit,
  writePersistedFileStalenessAuditSnapshot,
} from "@/src/lib/fileStalenessAudit";

export const runtime = "nodejs";

function repoRoot() {
  return process.cwd();
}

export async function GET(req: NextRequest) {
  const auth = requireAuthToken(req);
  if (!auth.token) return auth.error;
  const snapshot = await readPersistedFileStalenessAuditSnapshot();
  return NextResponse.json(snapshot);
}

export async function POST(req: NextRequest) {
  const auth = requireAuthToken(req);
  if (!auth.token) return auth.error;
  const result = await runFileStalenessAudit(repoRoot());
  const snapshot = buildPersistedSnapshot(result);
  await writePersistedFileStalenessAuditSnapshot(snapshot);
  return NextResponse.json({ result, snapshot });
}
