#!/usr/bin/env node
const tag = "[verify-interview-toolkit]";
const BASE_URL =
  (process.env.BASE_URL || "http://localhost:3000").replace(/\/+$/, "") ||
  "http://localhost:3000";
const jobId = (process.env.INTERVIEW_TOOLKIT_JOB_ID || "").trim();
const authToken = (process.env.AUTH_TOKEN || "").trim();
const authCookie = (process.env.AUTH_COOKIE || "").trim();

if (!jobId) {
  console.error(`${tag} Missing required INTERVIEW_TOOLKIT_JOB_ID environment variable.`);
  process.exit(1);
}

console.log(`${tag} BASE_URL=${BASE_URL}`);
console.log(`${tag} INTERVIEW_TOOLKIT_JOB_ID=${jobId}`);
console.log(`${tag} AUTH_TOKEN present: ${Boolean(authToken)}`);
console.log(`${tag} AUTH_COOKIE present: ${Boolean(authCookie)}`);

function buildHeaders() {
  const headers = {};
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  } else if (authCookie) {
    headers.Cookie = authCookie;
  }
  return headers;
}

async function main() {
  const path = `/api/interview-toolkit/${encodeURIComponent(jobId)}/study-packet`;
  const url = `${BASE_URL}${path}`;

  let response;

  try {
    response = await fetch(url, {
      cache: "no-store",
      headers: buildHeaders(),
    });
  } catch (error) {
    console.error(
      `${tag} FAIL ${url} Request error: ${
        error instanceof Error ? error.message : error
      }`,
    );
    process.exitCode = 1;
    return;
  }

  const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
  const text = await response.text();
  const isHtml = contentType.includes("text/html");

  if (!response.ok) {
    console.error(
      `${tag} FAIL ${response.status} ${response.statusText} ${url}`,
    );
    process.exitCode = 1;
    return;
  }

  if (isHtml) {
    console.error(
      `${tag} FAIL Received HTML instead of JSON (status ${response.status}) from ${url}`,
    );
    process.exitCode = 1;
    return;
  }

  try {
    JSON.parse(text || "{}");
  } catch {
    console.error(`${tag} FAIL Study packet response is not valid JSON from ${url}`);
    process.exitCode = 1;
    return;
  }

  console.log(`${tag} PASS ${url}`);
}
main().catch((error) => {
  console.error(
    `${tag} FAIL Unexpected error: ${
      error instanceof Error ? error.message : error
    }`,
  );
  process.exitCode = 1;
});
