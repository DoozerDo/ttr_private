import Link from "next/link";

import {
  SECONDARY_ACTION_BUTTON_CLASSES,
} from "@/components/FormButton";

function getDiscordUrl() {
  return process.env.NEXT_PUBLIC_BETA_DISCORD_URL?.trim() ?? "";
}

type BetaFocusCardProps = {
  title: string;
  description: string;
};

function BetaFocusCard({ title, description }: BetaFocusCardProps) {
  return (
    <article className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
      <h3 className="text-base font-semibold text-[var(--text-primary)]">{title}</h3>
      <p className="mt-2 text-sm text-[var(--text-secondary)]">{description}</p>
    </article>
  );
}

type TestScenarioCardProps = {
  title: string;
  description: string;
  outcomes: string[];
};

function TestScenarioCard({ title, description, outcomes }: TestScenarioCardProps) {
  return (
    <article className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
      <h3 className="text-base font-semibold text-[var(--text-primary)]">{title}</h3>
      <p className="mt-2 text-sm text-[var(--text-secondary)]">{description}</p>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-[var(--text-secondary)]">
        {outcomes.map((outcome) => (
          <li key={outcome}>{outcome}</li>
        ))}
      </ul>
    </article>
  );
}

function ChecklistSection({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 text-sm text-[var(--text-secondary)]">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-3">
          <span aria-hidden="true" className="mt-0.5 text-[var(--accent-primary)]">
            [ ]
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function BugTemplateBlock() {
  return (
    <pre className="overflow-x-auto rounded-xl border border-[var(--border-subtle)] bg-black/30 p-4 text-xs leading-6 text-slate-200 sm:text-sm">
{`Bug Title:
Short description of the issue

Where:
Page and action taken

What happened:
What you saw

What you expected:
What should have happened

Severity:
Blocker / Major / Minor

Screenshot or video:
Attach if possible

Job Description used:
Paste or link

Notes:
Anything else that helps reproduce it`}
    </pre>
  );
}

function ExpectationColumn({ title, items }: { title: string; items: string[] }) {
  return (
    <article className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5">
      <h3 className="text-base font-semibold text-[var(--text-primary)]">{title}</h3>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-[var(--text-secondary)]">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </article>
  );
}

function DiscordCta({ label }: { label: string }) {
  const discordUrl = getDiscordUrl();

  if (!discordUrl) {
    return (
      <div className="inline-flex flex-col gap-2">
        <span
          aria-disabled="true"
          className="inline-flex items-center justify-center rounded-[var(--button-radius)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-2 text-sm font-semibold text-[var(--text-muted)]"
        >
          {label}
        </span>
        <p className="text-xs text-[var(--text-muted)]">Discord support link is not configured yet.</p>
      </div>
    );
  }

  return (
    <a
      href={discordUrl}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center justify-center rounded-[var(--button-radius)] border-0 bg-[var(--accent-primary)] px-4 py-2 text-sm font-semibold text-[var(--verdict-apply-text)] transition-colors duration-150 hover:bg-[var(--accent-primary-hover)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
    >
      {label}
    </a>
  );
}

const FOCUS_AREAS = [
  {
    title: "Scoring accuracy",
    description: "Check whether scores are directionally correct for clear-fit vs low-fit roles.",
  },
  {
    title: "Evidence integrity",
    description: "Confirm the system does not invent background, tools, or achievements.",
  },
  {
    title: "Resume and cover letter quality",
    description: "Verify generated materials stay credible, useful, and role-relevant.",
  },
  {
    title: "Product clarity and usability",
    description: "Ensure each page makes the next action obvious and practical.",
  },
];

const TEST_SCENARIOS = [
  {
    title: "A. Overqualified",
    description: "Use a role where you clearly exceed most requirements.",
    outcomes: [
      "Score usually around 85 to 100",
      "Strong match narrative",
      "Clean confident generation",
      "No fake gaps",
    ],
  },
  {
    title: "B. Qualified",
    description: "Use a role where you meet most requirements and would reasonably apply.",
    outcomes: [
      "Score usually around 70 to 85",
      "Honest strengths and a few real gaps",
      "Credible generated materials",
    ],
  },
  {
    title: "C. Reach",
    description: "Use a role that is close but has meaningful missing signals.",
    outcomes: [
      "Score usually around 50 to 70",
      "Missing signals explained clearly",
      "Fit improvement guidance feels useful",
      "No invented experience",
    ],
  },
  {
    title: "D. Ridiculous stretch",
    description: "Use a role you obviously do not qualify for.",
    outcomes: [
      "Score usually below 50",
      "Honest feedback",
      "No false confidence",
      "No misleading material generation",
    ],
  },
];

const CHECKLIST_ITEMS = [
  "Score feels obviously too high or too low",
  "Important baseline experience is missing",
  "Fake or invented experience appears",
  "Resume formatting breaks",
  "Cover letter echoes the JD instead of synthesizing it",
  "The next step is unclear",
  "A button leads somewhere confusing",
  "A page loads but gives no actionable direction",
  "Results, baseline, and studio contradict each other",
];

export default function BetaGuidePage() {
  return (
    <main className="mx-auto w-full max-w-6xl space-y-8">
      <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--text-muted)]">Beta</p>
        <h1 className="mt-2 text-3xl font-semibold text-[var(--text-primary)] sm:text-4xl">Beta Testing Guide</h1>
        <p className="mt-4 max-w-3xl text-sm text-[var(--text-secondary)] sm:text-base">
          Use this page to test Target This Role the right way, report bugs clearly, and get support through Discord.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <DiscordCta label="Join Discord Support" />
          <Link href="/analyze" className={SECONDARY_ACTION_BUTTON_CLASSES}>
            Start Testing
          </Link>
        </div>
        <p className="mt-4 text-xs text-[var(--text-muted)]">
          This beta is focused on scoring accuracy, evidence integrity, output quality, and product clarity.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold text-[var(--text-primary)]">What this beta is for</h2>
        <p className="text-sm text-[var(--text-secondary)]">
          This beta is for pressure-testing truthfulness, fit accuracy, evidence integrity, output quality, and overall usability.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {FOCUS_AREAS.map((item) => (
            <BetaFocusCard key={item.title} title={item.title} description={item.description} />
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold text-[var(--text-primary)]">How to test</h2>
        <p className="text-sm text-[var(--text-secondary)]">
          Run exactly four job descriptions through the platform, one for each scenario below.
        </p>
        <div className="grid gap-4 lg:grid-cols-2">
          {TEST_SCENARIOS.map((item) => (
            <TestScenarioCard
              key={item.title}
              title={item.title}
              description={item.description}
              outcomes={item.outcomes}
            />
          ))}
        </div>
        <p className="text-sm text-[var(--text-secondary)]">
          The exact score matters less than whether the reasoning is honest and directionally correct.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold text-[var(--text-primary)]">What to look for</h2>
        <ChecklistSection items={CHECKLIST_ITEMS} />
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold text-[var(--text-primary)]">How to report a bug</h2>
        <p className="text-sm text-[var(--text-secondary)]">
          Report support requests and bug details in Discord first so the team can triage quickly and follow up in one place.
        </p>
        <DiscordCta label="Join Discord Support" />
        <BugTemplateBlock />
        <p className="text-sm font-semibold text-amber-200">
          Bug reports without clear steps or the job description used may not be investigated.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold text-[var(--text-primary)]">Beta expectations</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <ExpectationColumn
            title="What we expect from testers"
            items={[
              "Run all four test scenarios",
              "Report bugs clearly",
              "Separate bugs from preferences",
              "Use Discord for support",
            ]}
          />
          <ExpectationColumn
            title="What you should expect from us"
            items={[
              "Fast iteration",
              "Direct responses",
              "Prioritization by impact",
              "Visible product changes during beta",
            ]}
          />
        </div>
        <p className="text-sm text-[var(--text-secondary)]">
          This is a beta. You are expected to find broken, confusing, or incomplete things. That is the point.
        </p>
      </section>

      <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-6 sm:p-8">
        <h2 className="text-2xl font-semibold text-[var(--text-primary)]">Ready to run your tests?</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href="/analyze" className="inline-flex items-center justify-center rounded-[var(--button-radius)] border-0 bg-[var(--accent-primary)] px-4 py-2 text-sm font-semibold text-[var(--verdict-apply-text)] transition-colors duration-150 hover:bg-[var(--accent-primary-hover)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]">
            Start Testing
          </Link>
          <DiscordCta label="Join Discord Support" />
        </div>
      </section>
    </main>
  );
}
