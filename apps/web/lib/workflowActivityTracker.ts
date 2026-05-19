import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { AnalyticsEventMap, AnalyticsEventName } from "@/src/lib/analytics";

export type WorkflowActivityOperation =
  | "analysis_running"
  | "unlock_reanalysis_running"
  | "generation_running";

export type WorkflowActivityOutcome = "success" | "failure";

export type WorkflowActivitySnapshot = {
  isActive: boolean;
  activeOperations: WorkflowActivityOperation[];
  startedAt?: number;
};

type WorkflowActivityTrackerOptions = {
  surface: "results" | "studio";
  trackEvent?: <TEvent extends AnalyticsEventName>(
    eventName: TEvent,
    properties: AnalyticsEventMap[TEvent],
  ) => void;
  transitionMs?: number;
};

type OperationState = {
  count: number;
  startedAt: number;
};

function pickEarliestStartedAt(ops: Record<WorkflowActivityOperation, OperationState | null>): number | undefined {
  const times = Object.values(ops)
    .map((value) => value?.startedAt)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!times.length) return undefined;
  return Math.min(...times);
}

export function useWorkflowActivityTracker(options: WorkflowActivityTrackerOptions) {
  const transitionMs = typeof options.transitionMs === "number" ? options.transitionMs : 200;
  const trackEvent = options.trackEvent;
  const surface = options.surface;

  const mountedRef = useRef(true);
  const stateRef = useRef<Record<WorkflowActivityOperation, OperationState | null>>({
    analysis_running: null,
    unlock_reanalysis_running: null,
    generation_running: null,
  });
  const cooldownOperationRef = useRef<WorkflowActivityOperation | null>(null);
  const cooldownTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (cooldownTimeoutRef.current) {
        clearTimeout(cooldownTimeoutRef.current);
        cooldownTimeoutRef.current = null;
      }
    };
  }, []);

  const bump = useCallback(() => {
    if (!mountedRef.current) return;
    setVersion((value) => value + 1);
  }, []);

  const snapshot: WorkflowActivitySnapshot = useMemo(() => {
    void version;
    const activeOperations = (Object.keys(stateRef.current) as WorkflowActivityOperation[]).filter(
      (op) => (stateRef.current[op]?.count ?? 0) > 0,
    );
    if (!activeOperations.length && cooldownOperationRef.current) {
      activeOperations.push(cooldownOperationRef.current);
    }
    const startedAt = pickEarliestStartedAt(stateRef.current);
    return {
      isActive: activeOperations.length > 0,
      activeOperations,
      startedAt,
    };
  }, [version]);

  const isOperationActive = useCallback((operation: WorkflowActivityOperation) => {
    return (stateRef.current[operation]?.count ?? 0) > 0;
  }, []);

  const start = useCallback(
    (operation: WorkflowActivityOperation) => {
      if (cooldownTimeoutRef.current) {
        clearTimeout(cooldownTimeoutRef.current);
        cooldownTimeoutRef.current = null;
      }
      cooldownOperationRef.current = null;

      const now = Date.now();
      const existing = stateRef.current[operation];
      const next: OperationState = existing
        ? { count: existing.count + 1, startedAt: existing.startedAt }
        : { count: 1, startedAt: now };
      stateRef.current[operation] = next;

      if (existing?.count) {
        bump();
        return;
      }

      if (process.env.NODE_ENV !== "production" && operation === "generation_running") {
        const activeOperations = (Object.keys(stateRef.current) as WorkflowActivityOperation[]).filter(
          (op) => (stateRef.current[op]?.count ?? 0) > 0,
        );
        console.log("[WORKFLOW][ACTIVITY_START]", {
          operation: "generation_running",
          activeOperations,
        });
      }

      trackEvent?.("workflow_activity_started", {
        surface,
        operation_type: operation,
      });
      bump();
    },
    [bump, surface, trackEvent],
  );

  const stop = useCallback(
    async (operation: WorkflowActivityOperation, outcome: WorkflowActivityOutcome) => {
      const existing = stateRef.current[operation];
      if (!existing) return;

      const nextCount = Math.max(0, existing.count - 1);
      if (nextCount > 0) {
        stateRef.current[operation] = { ...existing, count: nextCount };
        bump();
        return;
      }

      const startedAt = existing.startedAt;
      stateRef.current[operation] = null;
      bump();

      const durationMs = Math.max(0, Date.now() - startedAt);
      trackEvent?.("workflow_activity_completed", {
        surface,
        operation_type: operation,
        outcome,
        duration_ms: durationMs,
      });

      const stillActive = (Object.keys(stateRef.current) as WorkflowActivityOperation[]).some(
        (op) => (stateRef.current[op]?.count ?? 0) > 0,
      );

      if (process.env.NODE_ENV !== "production" && operation === "generation_running") {
        const activeOperations = (Object.keys(stateRef.current) as WorkflowActivityOperation[]).filter(
          (op) => (stateRef.current[op]?.count ?? 0) > 0,
        );
        console.log("[WORKFLOW][ACTIVITY_END]", {
          activeOperations,
        });
      }

      if (stillActive || transitionMs <= 0) return;

      cooldownOperationRef.current = operation;
      bump();
      await new Promise<void>((resolve) => {
        cooldownTimeoutRef.current = setTimeout(() => {
          cooldownTimeoutRef.current = null;
          cooldownOperationRef.current = null;
          bump();
          resolve();
        }, transitionMs);
      });
    },
    [bump, trackEvent, surface, transitionMs],
  );

  const run = useCallback(
    async <TResult,>(
      operation: WorkflowActivityOperation,
      fn: () => Promise<TResult>,
      opts?: { outcomeFromResult?: (result: TResult) => WorkflowActivityOutcome },
    ): Promise<TResult> => {
      start(operation);
      try {
        const result = await fn();
        const outcome = opts?.outcomeFromResult ? opts.outcomeFromResult(result) : "success";
        await stop(operation, outcome);
        return result;
      } catch (error) {
        await stop(operation, "failure");
        throw error;
      }
    },
    [start, stop],
  );

  return {
    snapshot,
    isOperationActive,
    start,
    stop,
    run,
  };
}
