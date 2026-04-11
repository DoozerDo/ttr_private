export const CLIENT_REQUEST_TIMEOUT_MS = 10_000;
export const CLIENT_TIMEOUT_MESSAGE =
  "This is taking longer than expected. Please try again.";

export type ClientTimeoutOperation =
  | "analysis"
  | "generation"
  | "compute-expanded-fit"
  | "request";

export type ClientTimeoutPayload = {
  status: "timeout";
  operation: ClientTimeoutOperation;
  message: string;
  retryable: true;
};

export class ClientRequestTimeoutError extends Error {
  status = 504;
  payload: ClientTimeoutPayload;

  constructor(operation: ClientTimeoutOperation) {
    super(CLIENT_TIMEOUT_MESSAGE);
    this.name = "ClientRequestTimeoutError";
    this.payload = {
      status: "timeout",
      operation,
      message: CLIENT_TIMEOUT_MESSAGE,
      retryable: true,
    };
  }
}

function resolveOperation(input: RequestInfo | URL): ClientTimeoutOperation {
  const raw =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input?.url ?? "";

  const normalized = raw.toLowerCase();
  if (normalized.includes("/compute-expanded-fit")) {
    return "compute-expanded-fit";
  }
  if (normalized.includes("/analysis")) {
    return "analysis";
  }
  if (
    normalized.includes("/generate") ||
    normalized.includes("/resume/") ||
    normalized.includes("/cover-letters/")
  ) {
    return "generation";
  }
  return "request";
}

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  options?: {
    timeoutMs?: number;
    operation?: ClientTimeoutOperation;
    fetchImpl?: typeof fetch;
  },
): Promise<Response> {
  const operation = options?.operation ?? resolveOperation(input);
  const timeoutMs = options?.timeoutMs ?? CLIENT_REQUEST_TIMEOUT_MS;
  const fetchImpl = options?.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const inputSignal = init.signal;
  const abortInputSignal = () => controller.abort();

  if (inputSignal) {
    if (inputSignal.aborted) {
      controller.abort();
    } else {
      inputSignal.addEventListener("abort", abortInputSignal, { once: true });
    }
  }

  try {
    return await fetchImpl(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    const timeoutHit = controller.signal.aborted && !(inputSignal?.aborted ?? false);
    if (timeoutHit) {
      throw new ClientRequestTimeoutError(operation);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    if (inputSignal) {
      inputSignal.removeEventListener("abort", abortInputSignal);
    }
  }
}
