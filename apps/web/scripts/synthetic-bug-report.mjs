#!/usr/bin/env node

import { chromium } from "playwright";

const ROOT_URL = (process.env.BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
const API_URL = (process.env.API_BASE_URL || ROOT_URL).replace(/\/+$/, "");
const SYNTHETIC_EMAIL = process.env.SYNTHETIC_USER_EMAIL || "synthetic-core-loop@targetthisrole.local";
const SYNTHETIC_PASSWORD = process.env.SYNTHETIC_USER_PASSWORD || "SyntheticUserPass!123";

function log(message, extra) {
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      message,
      ...(extra ? extra : {}),
    }),
  );
}

async function readJson(response) {
  const text = await response.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function parseCookieHeader(setCookieHeader) {
  const firstPair = (setCookieHeader || "").split(";")[0] || "";
  const separatorIndex = firstPair.indexOf("=");
  if (separatorIndex <= 0) return null;
  return {
    name: firstPair.slice(0, separatorIndex),
    value: firstPair.slice(separatorIndex + 1),
  };
}

async function login() {
  const response = await fetch(`${ROOT_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: SYNTHETIC_EMAIL, password: SYNTHETIC_PASSWORD }),
  });
  const body = await readJson(response);
  assert(response.ok, `login failed: ${body?.message ?? body?.error ?? response.status}`);
  const cookie = parseCookieHeader(response.headers.get("set-cookie"));
  assert(cookie, "login did not return an auth cookie");
  return cookie;
}

async function main() {
  const startedAt = new Date().toISOString();
  log("synthetic-bug-report-start", { baseUrl: ROOT_URL, apiUrl: API_URL, startedAt });

  const cookie = await login();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.addCookies([
    {
      name: cookie.name,
      value: cookie.value,
      url: ROOT_URL,
      path: "/",
    },
  ]);

  const page = await context.newPage();
  const payloads = [];
  const responses = [];

  page.on("response", async (response) => {
    if (response.url().includes("/api/support/report-bug")) {
      responses.push({ status: response.status(), ok: response.ok() });
    }
  });

  await page.route("**/api/support/report-bug", async (route) => {
    const request = route.request();
    const body = request.postDataJSON?.() ?? JSON.parse(request.postData() || "{}");
    payloads.push(body);
    await route.continue();
  });

  await page.goto(`${ROOT_URL}/settings`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Report a bug" }).click();
  await page.getByPlaceholder("What went wrong?").fill("Synthetic test bug report submission");
  await page
    .getByPlaceholder("Steps, expected result, what you saw")
    .fill("Triggered from synthetic transaction");

  await page.getByRole("button", { name: "Send issue report" }).click();

  await page.getByText("Thanks. Your report was submitted successfully.").waitFor({ timeout: 15000 });

  assert(payloads.length === 1, `expected one bug report request, saw ${payloads.length}`);
  const payload = payloads[0];
  assert(payload?.message === "Synthetic test bug report submission", "payload message contract mismatch");
  assert(payload?.details === "Triggered from synthetic transaction", "payload details contract mismatch");
  assert(payload?.message?.length >= 10 && payload?.message?.length <= 4000, "message length invalid");
  assert(responses.some((entry) => entry.ok && entry.status >= 200 && entry.status < 300), "bug report response was not successful");

  const statusText = await page.getByRole("status").textContent();
  assert(!String(statusText ?? "").includes("Please enter"), "validation error was shown for valid input");

  await browser.close();

  log("synthetic-bug-report-success", {
    requestCount: payloads.length,
    successCount: responses.filter((entry) => entry.ok).length,
    failureCount: responses.filter((entry) => !entry.ok).length,
    successRatePct: 100,
    payload: {
      message: payload.message,
      details: payload.details,
    },
    finishedAt: new Date().toISOString(),
  });
}

main().catch((error) => {
  log("synthetic-bug-report-failure", {
    error: error instanceof Error ? error.message : String(error),
    finishedAt: new Date().toISOString(),
  });
  process.exitCode = 1;
});
