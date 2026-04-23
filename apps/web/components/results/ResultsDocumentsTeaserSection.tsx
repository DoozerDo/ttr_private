import { devLogArtifactRendererSelection } from "@/lib/artifactRendererDebug";
import { getResultsCoverLetterTeaser, getResultsResumeTeaser } from "@/lib/resultsArtifactPreview";
import { ResultsCoverLetterTeaser, ResultsResumeTeaser } from "@/components/results/ResultsArtifactTeasers";

type Props = {
  resumePayload: unknown | null;
  coverLetterPayload: unknown | null;
  studioHref: string;
  confidence: string | null;
  generationPhase: string | null;
  pairStatus: string | null;
};

export function ResultsDocumentsTeaserSection({
  resumePayload,
  coverLetterPayload,
  studioHref,
  confidence,
  generationPhase,
  pairStatus,
}: Props) {
  const resumeTeaser = resumePayload ? getResultsResumeTeaser(resumePayload) : null;
  const coverTeaser = coverLetterPayload ? getResultsCoverLetterTeaser(coverLetterPayload) : null;

  if (resumeTeaser) {
    devLogArtifactRendererSelection({
      page: "results",
      artifactType: "resume",
      confidence,
      generationPhase,
      pairStatus,
      renderer: resumeTeaser.renderer,
      previewLength: resumeTeaser.previewLength,
      totalBodyLength: resumeTeaser.totalBodyLength,
      truncated: resumeTeaser.truncated,
      reason: resumeTeaser.reason,
    });
  }

  if (coverTeaser) {
    devLogArtifactRendererSelection({
      page: "results",
      artifactType: "cover_letter",
      confidence,
      generationPhase,
      pairStatus,
      renderer: coverTeaser.renderer,
      previewLength: coverTeaser.previewLength,
      totalBodyLength: coverTeaser.totalBodyLength,
      truncated: coverTeaser.truncated,
      reason: coverTeaser.reason,
    });
  }

  return (
    <div data-testid="results-documents-teaser-section" className="space-y-5">
      {resumeTeaser ? <ResultsResumeTeaser teaser={resumeTeaser} studioHref={studioHref} /> : null}
      {coverTeaser ? <ResultsCoverLetterTeaser teaser={coverTeaser} studioHref={studioHref} /> : null}
    </div>
  );
}

