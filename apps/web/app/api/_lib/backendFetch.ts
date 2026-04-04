const API_UNAVAILABLE_ERROR = "UPSTREAM_UNAVAILABLE";

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
 * Convert upstream network-level failures into a controlled 503 for API proxy routes.
 * We keep user-facing text neutral and log root cause server-side.
 */
export async function backendFetch(
  input: RequestInfo,
  init?: RequestInit,
): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch (error) {
    if (looksLikeConnectionFailure(error)) {
      const inputUrl = typeof input === "string" ? input : input?.url ?? "<unknown>";
      console.error("Proxy upstream fetch failed", {
        input: inputUrl,
        method: init?.method ?? "GET",
        error:
          error instanceof Error
            ? { name: error.name, message: error.message }
            : String(error),
      });
      return Response.json(
        {
          error: API_UNAVAILABLE_ERROR,
          message: "Service temporarily unavailable. Please retry shortly.",
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
