"use client";

export const ANALYTICS_EVENT_NAMES = [
  "landing_viewed",
  "resume_upload_initiated",
  "resume_upload_completed",
  "job_description_focused",
  "compatibility_analysis_started",
  "compatibility_analysis_completed",
  "role_analysis_started",
  "role_analysis_completed",
  "opportunity_saved",
  "resume_studio_opened",
  "resume_generation_attempted",
  "resume_generation_succeeded",
  "resume_generation_limited",
  "resume_generation_blocked_compliance",
  "cover_letter_generation_attempted",
  "cover_letter_generation_succeeded",
  "cover_letter_generation_limited",
  "cover_letter_generation_blocked_compliance",
  "analysis_load_failed",
  "scroll_depth_reached",
  "target_generation_blocked",
  "studio_generation_state_viewed",
  "studio_generate_blocked",
  "studio_generate_limited",
  "target_generation_state_viewed",
  "target_cta_clicked",
  "target_generation_blocked_redirect",
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENT_NAMES)[number];

export type ScoreBucket = "under_60" | "60s" | "70s" | "80s" | "90_plus";
export type ScrollDepth = 25 | 50 | 75 | 100;

export type AnalyticsEventMap = {
  landing_viewed: {
    referrer: string | null;
    deviceType: "mobile" | "tablet" | "desktop";
  };
  resume_upload_initiated: {
    source: "landing";
  };
  resume_upload_completed: {
    source: "landing";
    fileType: string;
  };
  job_description_focused: {
    source: "landing";
  };
  compatibility_analysis_started: {
    source: "landing" | "app" | "unknown";
    jobDescriptionLength: number;
    hasResume: boolean;
    analysisNumber: number;
  };
  compatibility_analysis_completed: {
    source: "landing";
    score: number;
    scoreBucket: ScoreBucket;
  };
  role_analysis_started: {
    source: "landing" | "app" | "unknown";
    roleInputLength: number;
  };
  role_analysis_completed: {
    source: "results" | "unknown";
    score?: number;
    scoreBucket?: ScoreBucket;
    jobId?: string;
    baselineId?: string;
  };
  opportunity_saved: {
    source: "results" | "workspace" | "unknown";
    score?: number;
    scoreBucket?: ScoreBucket;
    jobId?: string;
    baselineId?: string;
  };
  resume_studio_opened: {
    entrySource: "results" | "nav" | "direct" | "unknown";
    baselineId?: string;
  };
  resume_generation_attempted: {
    source: "studio" | "unknown";
    analysisId?: string;
  };
  resume_generation_succeeded: {
    source: "studio" | "unknown";
    analysisId?: string;
  };
  resume_generation_limited: {
    source: "studio" | "unknown";
    analysisId?: string;
    reasonCode?: string;
  };
  resume_generation_blocked_compliance: {
    source: "studio" | "unknown";
    analysisId?: string;
    reasonCode?: string;
  };
  cover_letter_generation_attempted: {
    source: "studio" | "unknown";
    analysisId?: string;
  };
  cover_letter_generation_succeeded: {
    source: "studio" | "unknown";
    analysisId?: string;
  };
  cover_letter_generation_limited: {
    source: "studio" | "unknown";
    analysisId?: string;
    reasonCode?: string;
  };
  cover_letter_generation_blocked_compliance: {
    source: "studio" | "unknown";
    analysisId?: string;
    reasonCode?: string;
  };
  analysis_load_failed: {
    source: "results" | "unknown";
    status?: string;
  };
  scroll_depth_reached: {
    depthPercent: ScrollDepth;
  };
  target_generation_blocked: {
    score: number;
    blockers: string[];
  };
  studio_generation_state_viewed: {
    state: "READY" | "LIMITED" | "BLOCKED";
    score: number | null;
    blockerCount: number;
  };
  studio_generate_blocked: {
    score: number | null;
    blockerCodes: string[];
    documentType: "resume" | "cover_letter" | "application";
  };
  studio_generate_limited: {
    score: number | null;
    blockerCodes: string[];
    documentType: "resume" | "cover_letter" | "application";
  };
  target_generation_state_viewed: {
    state: "READY" | "LIMITED" | "BLOCKED";
    score: number;
    baselineId: string;
    jobId: string;
  };
  target_cta_clicked: {
    state: "READY" | "LIMITED" | "BLOCKED";
    score: number | null;
    actionType: "open_studio_generate" | "open_studio_limited" | "blocked_redirect" | "resolve_gaps";
  };
  target_generation_blocked_redirect: {
    score: number | null;
    blockerCodes: string[];
  };
};

type TrackEventInput<TName extends AnalyticsEventName> = {
  eventName: TName;
  properties: AnalyticsEventMap[TName];
  path?: string | null;
  userId?: string | null;
};

const ANALYTICS_SESSION_KEY = "ttr-analytics-session-id";
const USER_ID_ENDPOINT = "/api/users/me";

let cachedUserId: string | null = null;
let userIdLookupInFlight: Promise<string | null> | null = null;

function safeStorageGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeStorageSet(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // no-op
  }
}

function createSessionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getOrCreateAnalyticsSessionId(): string {
  if (typeof window === "undefined") {
    return "server-render";
  }
  const existing = safeStorageGet(ANALYTICS_SESSION_KEY);
  if (existing) {
    return existing;
  }
  const next = createSessionId();
  safeStorageSet(ANALYTICS_SESSION_KEY, next);
  return next;
}

export function resolveScoreBucket(score: number): ScoreBucket {
  if (score >= 90) return "90_plus";
  if (score >= 80) return "80s";
  if (score >= 70) return "70s";
  if (score >= 60) return "60s";
  return "under_60";
}

export function detectDeviceType(): "mobile" | "tablet" | "desktop" {
  if (typeof window === "undefined") {
    return "desktop";
  }
  const width = window.innerWidth;
  if (width < 768) {
    return "mobile";
  }
  if (width < 1024) {
    return "tablet";
  }
  return "desktop";
}

function pathFromWindow(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return `${window.location.pathname}${window.location.search}`;
}

function parseUserId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const record = payload as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id.trim() : "";
  return id || null;
}

async function getUserIdBestEffort(): Promise<string | null> {
  if (typeof window === "undefined") {
    return null;
  }
  if (cachedUserId) {
    return cachedUserId;
  }
  if (userIdLookupInFlight) {
    return userIdLookupInFlight;
  }

  userIdLookupInFlight = (async () => {
    try {
      const response = await fetch(USER_ID_ENDPOINT, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });
      if (!response.ok) {
        return null;
      }
      const payload = await response.json().catch(() => null);
      const userId = parseUserId(payload);
      if (userId) {
        cachedUserId = userId;
      }
      return userId;
    } catch {
      return null;
    } finally {
      userIdLookupInFlight = null;
    }
  })();

  return userIdLookupInFlight;
}

export function trackEvent<TName extends AnalyticsEventName>(
  eventName: TName,
  properties: AnalyticsEventMap[TName],
  options?: { path?: string | null; userId?: string | null },
): void {
  if (typeof window === "undefined") {
    return;
  }

  const sessionId = getOrCreateAnalyticsSessionId();
  const createdAt = new Date().toISOString();
  const path = options?.path ?? pathFromWindow();

  void (async () => {
    const resolvedUserId =
      options?.userId === undefined ? await getUserIdBestEffort() : options.userId;
    const payload: TrackEventInput<TName> & {
      sessionId: string;
      createdAt: string;
    } = {
      eventName,
      sessionId,
      userId: resolvedUserId ?? null,
      path,
      createdAt,
      properties,
    };

    void fetch("/api/analytics/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {
      // Fire-and-forget: analytics must never break UX.
    });
  })();
}
