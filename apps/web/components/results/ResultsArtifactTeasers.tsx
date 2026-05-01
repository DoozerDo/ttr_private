import type { ResultsCoverLetterTeaser, ResultsResumeTeaser } from "@/lib/resultsArtifactPreview";

type ResumeProps = {
  teaser: ResultsResumeTeaser;
  studioHref: string | null;
};

export function ResultsResumeTeaser({ teaser, studioHref }: ResumeProps) {
  if (teaser.renderer === "none") return null;

  return (
    <div className="space-y-3" data-testid="results-resume-preview">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
        Preview of tailored resume
      </p>

      {teaser.renderer === "role_teaser" ? (
        <div className="space-y-2 rounded-xl border border-white/10 bg-slate-950/40 p-4">
          <p className="text-sm font-semibold text-slate-100" data-testid="results-resume-teaser-role">
            {teaser.role.company} - {teaser.role.roleTitle}
          </p>
          {teaser.role.location || teaser.role.dateRange ? (
            <p className="text-xs text-slate-400" data-testid="results-resume-teaser-meta">
              {[teaser.role.location, teaser.role.dateRange].filter(Boolean).join(" - ")}
            </p>
          ) : null}
          {teaser.summarySnippet ? (
            <p className="text-sm text-slate-200" data-testid="results-resume-teaser-summary">
              {teaser.summarySnippet}
            </p>
          ) : null}
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-200" data-testid="results-resume-teaser-bullets">
            {teaser.role.bullets.map((bullet, index) => (
              <li key={`results-resume-teaser-bullet-${index}`}>{bullet}</li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="rounded-xl border border-white/10 bg-slate-950/40 p-4">
          <p className="text-sm text-slate-200" data-testid="results-resume-teaser-excerpt">
            {teaser.excerpt}
          </p>
        </div>
      )}

      <p className="text-xs text-slate-400" data-testid="results-resume-preview-truncated">
        Preview truncated.{" "}
        {studioHref ? (
          <a href={studioHref} className="underline underline-offset-2 hover:text-slate-200">
            Open Studio
          </a>
        ) : (
          "Open Studio"
        )}{" "}
        to view and refine the full resume.
      </p>
    </div>
  );
}

type CoverProps = {
  teaser: ResultsCoverLetterTeaser;
  studioHref: string | null;
};

export function ResultsCoverLetterTeaser({ teaser, studioHref }: CoverProps) {
  if (teaser.renderer === "none") return null;

  return (
    <div className="space-y-3" data-testid="cover-letter-preview">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
        Preview of tailored cover letter
      </p>
      <div className="space-y-2 rounded-xl border border-white/10 bg-slate-950/40 p-4">
        <div className="max-h-64 overflow-auto" data-testid="results-cover-letter-preview-body">
          <p className="text-sm leading-7 text-slate-100">{teaser.paragraph}</p>
        </div>
      </div>
      <p className="text-xs text-slate-400" data-testid="results-cover-letter-preview-truncated">
        Preview truncated.{" "}
        {studioHref ? (
          <a href={studioHref} className="underline underline-offset-2 hover:text-slate-200">
            Open Studio
          </a>
        ) : (
          "Open Studio"
        )}{" "}
        to view and refine the full cover letter.
      </p>
    </div>
  );
}
