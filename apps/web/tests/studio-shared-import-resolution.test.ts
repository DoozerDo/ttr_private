import { readFileSync } from "fs";
import path from "path";

import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(process.cwd(), "..", "..");

const studioDependencyFiles = [
  "apps/web/app/(app)/studio/page.tsx",
  "apps/web/app/(app)/studio/ResumePreview.tsx",
  "apps/web/app/(app)/studio/StudioCritiquePanel.tsx",
  "apps/web/app/(app)/studio/StudioRefinementPanel.tsx",
  "apps/web/app/(app)/studio/StudioRoleMatchPanel.tsx",
  "apps/web/components/DocumentStrategyPlanSummary.tsx",
  "apps/web/lib/documentCritique.ts",
  "apps/web/lib/documentStrategyPlan.ts",
  "apps/web/lib/roleMatchFinalPass.ts",
  "apps/web/lib/languageStylePass.ts",
  "apps/web/lib/calibrationFeedback.ts",
  "apps/web/lib/goldStandardCalibration.ts",
  "apps/web/lib/resumeModel.ts",
];

describe("Studio shared import resolution", () => {
  it("does not use hard-coded relative shared imports in the Studio dependency tree", () => {
    for (const relativeFile of studioDependencyFiles) {
      const absoluteFile = path.join(repoRoot, relativeFile);
      const contents = readFileSync(absoluteFile, "utf8");

      expect(contents, `${relativeFile} should use @shared imports, not relative packages/shared paths`).not.toMatch(
        /\.\.\/\.\.\/\.\.\/packages\/shared/,
      );
      expect(contents, `${relativeFile} should use @shared imports, not relative packages/shared paths`).not.toMatch(
        /\.\.\/\.\.\/packages\/shared/,
      );
    }
  });
});
