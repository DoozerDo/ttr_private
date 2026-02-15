const API_UNAVAILABLE_ERROR = "API_UNAVAILABLE";

function looksLikeConnectionFailure(error: unknown) {
  const candidate = error as {
    cause?: { code?: string };
    code?: string;
    message?: string;
  };
  const message = String(candidate?.message ?? "");

  return (
    candidate?.cause?.code === "ECONNREFUSED" ||
    candidate?.code === "ECONNREFUSED" ||
    message.includes("ECONNREFUSED") ||
    message.includes("fetch failed")
  );
}

/**
 * Guard against Docker/API startup races by turning connection failures into a friendly 503.
 * Only network-level failures (ECONNREFUSED/fetch failed) are converted; other errors still bubble.
 */
export async function backendFetch(
  input: RequestInfo,
  init?: RequestInit,
): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch (error) {
    if (looksLikeConnectionFailure(error)) {
      return Response.json(
        {
          error: API_UNAVAILABLE_ERROR,
          message: "Backend service is starting. Please retry shortly.",
        },
        { status: 503 },
      );
    }

    throw error;
  }
}

/**
 * Detects the friendly 503 that indicates the backend is still warming up.
 */
export async function isBackendUnavailableResponse(response: Response) {
  if (response.status !== 503) {
    return false;
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return false;
  }

  try {
    const payload = await response.clone().json();
    return payload?.error === API_UNAVAILABLE_ERROR;
  } catch {
    return false;
  }
}
