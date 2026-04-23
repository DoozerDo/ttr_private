const BANNED_IMPORT_SOURCES = new Set([
  "@/lib/workflowSurfaceAuthority",
  "@/lib/workflowArtifactStateNormalizer",
  "@/lib/studioUnlockResolver",
  "@/lib/postUnlockOutcomeResolver",
  "@/lib/studioGenerationReadyResolver",
]);

function normalizeFilename(value) {
  if (typeof value !== "string") return "";
  return value.replaceAll("\\", "/");
}

function isOrchestratorFile(filename) {
  const normalized = normalizeFilename(filename);
  return normalized.endsWith("/apps/web/lib/workflowOrchestrator.ts");
}

export default {
  rules: {
    "no-direct-workflow-resolver-imports": {
      meta: {
        type: "problem",
        docs: {
          description:
            "Disallow importing lower-level workflow resolvers outside the workflow orchestrator.",
        },
        schema: [],
        messages: {
          banned:
            "Import workflow resolvers via `@/lib/workflowOrchestrator` only; direct imports from '{{source}}' are prohibited outside `apps/web/lib/workflowOrchestrator.ts`.",
        },
      },
      create(context) {
        const filename = context.filename ?? context.getFilename?.() ?? "";
        if (isOrchestratorFile(filename)) return {};

        return {
          ImportDeclaration(node) {
            const source = node.source?.value;
            if (typeof source !== "string") return;
            if (!BANNED_IMPORT_SOURCES.has(source)) return;

            context.report({
              node,
              messageId: "banned",
              data: { source },
            });
          },
        };
      },
    },
  },
};

