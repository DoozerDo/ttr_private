type AnalysisRunTrace = {
  assessmentId: string;
  baselineId: string;
  score: number;
  createdAt: string;
};

type AnalysisRunTraceStore = Map<string, AnalysisRunTrace>;

const TRACE_STORE_KEY = "__ttrBaselineAnalysisRunTraceStore";

function getStore(): AnalysisRunTraceStore {
  const globalRef = globalThis as typeof globalThis & {
    [TRACE_STORE_KEY]?: AnalysisRunTraceStore;
  };
  if (!globalRef[TRACE_STORE_KEY]) {
    globalRef[TRACE_STORE_KEY] = new Map<string, AnalysisRunTrace>();
  }
  return globalRef[TRACE_STORE_KEY] as AnalysisRunTraceStore;
}

function buildKey(userId: string, baselineId: string) {
  return `${userId}::${baselineId}`;
}

export function saveAnalysisRunTraceForDebug(
  userId: string,
  trace: AnalysisRunTrace,
) {
  getStore().set(buildKey(userId, trace.baselineId), trace);
}

export function getAnalysisRunTraceForDebug(userId: string, baselineId: string) {
  return getStore().get(buildKey(userId, baselineId));
}
