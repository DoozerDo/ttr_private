import { chromium } from 'playwright';
import fs from 'node:fs';

const baseUrl = 'http://localhost:3000';
const artifactDir = 'artifacts/live-baseline-verify';
fs.mkdirSync(artifactDir, { recursive: true });

const founderEmail = 'liveverify-founder@example.com';
const founderPassword = 'Test1234!';
const resumePath = 'C:/dev/ttr_private/apps/api/storage/baselines/1772996214704-114538495.pdf';

const out = { startedAt: new Date().toISOString(), submissions: [], checks: {}, notes: [] };
const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();

async function ensureAccount() {
  const payload = {
    firstName: 'Live',
    lastName: 'Founder',
    email: founderEmail,
    password: founderPassword,
    confirmPassword: founderPassword,
  };
  await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => {});
}

async function loginAndReachBaseline(page) {
  await page.goto(`${baseUrl}/auth/login`, { waitUntil: 'networkidle' });
  await page.fill('#email', founderEmail);
  await page.fill('#password', founderPassword);
  await page.getByRole('button', { name: /Log in/i }).click();

  await page.waitForTimeout(2500);
  if (page.url().includes('/onboarding/profile')) {
    const role = page.locator('#role-title');
    if (await role.count()) {
      await role.fill('Support Operations Lead');
      await page.locator('#company').fill('TTR Dev');
      await page.locator('#intended-use').fill('Baseline strengthening verification');
      await page.getByRole('button', { name: 'Continue' }).click();
      await page.waitForTimeout(2500);
    } else {
      out.notes.push('Onboarding route loaded without profile form controls; bypassing to /baseline');
    }
  }

  await page.goto(`${baseUrl}/baseline`, { waitUntil: 'networkidle' });
  if (page.url().includes('/auth/login')) {
    throw new Error('Still blocked at auth/login when trying to reach /baseline');
  }
}

async function ensureStrengtheningAvailable(page) {
  const hasStrengthening = await page.getByText('Baseline Strengthening').first().isVisible().catch(() => false);
  if (hasStrengthening) return;

  const fileInput = page.locator('input[type="file"]').first();
  if (!(await fileInput.count())) {
    throw new Error(`No file input found on baseline page (url=${page.url()})`);
  }

  await fileInput.setInputFiles(resumePath);
  await page.waitForTimeout(2500);
  const analyzeBtn = page.getByRole('button', { name: 'ANALYZE' }).first();
  if (await analyzeBtn.count()) {
    await analyzeBtn.click();
  }
  await page.waitForSelector('text=Baseline Strengthening', { timeout: 120000 });
}

async function readMetrics(page) {
  const body = clean(await page.locator('body').innerText());
  const section = page.locator('section', { hasText: 'Baseline Strength' }).first();
  let mainStrength = null;
  if (await section.count()) {
    const text = clean(await section.innerText());
    const m = text.match(/(\d+)%/);
    if (m) mainStrength = Number(m[1]);
  }
  const currentMatch = body.match(/(\d+)% current/i);
  const originalMatch = body.match(/(\d+)% original/i);
  return {
    mainStrength,
    recordCurrent: currentMatch ? Number(currentMatch[1]) : null,
    recordOriginal: originalMatch ? Number(originalMatch[1]) : null,
    body,
  };
}

async function submit(page, signalLabel, rawText) {
  const row = {
    signalType: signalLabel,
    status: null,
    saved: false,
    visibleAfterSave: false,
    scoreChanged: false,
    confirmationShown: false,
    modalClosed: false,
    before: null,
    after: null,
    unchangedSavedMessageShown: false,
  };

  row.before = await readMetrics(page);

  let patchStatus = null;
  page.on('response', (resp) => {
    if (resp.request().method() === 'PATCH' && resp.url().includes('/strengthening-additions')) {
      patchStatus = resp.status();
    }
  });

  const button = page.getByRole('button', { name: new RegExp(signalLabel, 'i') }).first();
  if (!(await button.count())) {
    out.notes.push(`Signal button not found: ${signalLabel}`);
    out.submissions.push(row);
    return;
  }

  await button.click();
  await page.waitForSelector('[role="dialog"][aria-label="Strengthen Signal"]', { timeout: 15000 });
  await page.locator('textarea').fill(rawText);
  await page.getByRole('button', { name: 'Generate Proposed Update' }).click();
  await page.getByRole('button', { name: 'Approve and Apply' }).click();
  await page.waitForTimeout(2500);

  row.status = patchStatus;
  row.saved = patchStatus === 200;
  row.modalClosed = !(await page.locator('[role="dialog"][aria-label="Strengthen Signal"]').isVisible().catch(() => false));

  const after = await readMetrics(page);
  row.after = {
    mainStrength: after.mainStrength,
    recordCurrent: after.recordCurrent,
    recordOriginal: after.recordOriginal,
    mainEqualsRecordCurrent:
      typeof after.mainStrength === 'number' && typeof after.recordCurrent === 'number' && after.mainStrength === after.recordCurrent,
  };

  row.scoreChanged =
    typeof row.before.mainStrength === 'number' &&
    typeof after.mainStrength === 'number' &&
    row.before.mainStrength !== after.mainStrength;

  row.confirmationShown = /Baseline updated\./i.test(after.body);
  row.unchangedSavedMessageShown = /Saved successfully\. Strength unchanged at \d+%\./i.test(after.body);
  const snippet = clean(rawText).slice(0, 35).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  row.visibleAfterSave = new RegExp(snippet, 'i').test(after.body);

  out.submissions.push(row);
}

(async () => {
  await ensureAccount();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  try {
    await loginAndReachBaseline(page);
    await ensureStrengtheningAvailable(page);

    await submit(
      page,
      'Organizational Scale',
      'Supported a 60+ person support organization serving 12,000+ customers across multi-region operations.',
    );

    await submit(
      page,
      'Platform Ownership Scope',
      'Owned support platform roadmap decisions, workflow governance, and escalation policy standards across teams.',
    );

    out.checks.final = await readMetrics(page);
    await page.screenshot({ path: `${artifactDir}/baseline-live-final.png`, fullPage: true });
  } finally {
    await context.close();
    await browser.close();
  }

  out.finishedAt = new Date().toISOString();
  fs.writeFileSync(`${artifactDir}/result.json`, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
