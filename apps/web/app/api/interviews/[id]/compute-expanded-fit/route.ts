import { NextRequest, NextResponse } from "next/server";

import { getApiBaseUrl, relayApiResponse, requireAuthToken } from "../../../baselines/helpers";
import { UpstreamApiConfigError } from "../../../_lib/serverApiConfig";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const { token, error } = requireAuthToken(req);

  if (!token) {
    return error;
  }

  try {
    const baseUrl = getApiBaseUrl();
    const response = await fetchWithTimeout(`${baseUrl}/interview-records/${id}/compute-expanded-fit`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });
    console.log("SCORING RESPONSE:", response);

    return relayApiResponse(response);
  } catch (error) {
    if (error instanceof UpstreamApiConfigError) {
      return NextResponse.json(
        {
          status: "temporarily_unavailable",
          code: error.code,
          message:
            "Expanded fit is unavailable in this environment right now. Save your interview and try again later.",
        },
        { status: 503 },
      );
    }

    throw error;
  }
}
