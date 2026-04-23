export type WorkflowSurfaceCanonicalState =
  | "hard_blocked"
  | "unlock_required"
  | "post_unlock_outcome"
  | "generation_ready"
  | "generation_in_progress"
  | "documents_ready"
  | "partial_documents"
  | "generation_failed";

export type WorkflowSurfaceTrustTone =
  | "blocked"
  | "recovery"
  | "ready"
  | "in_progress"
  | "complete"
  | "failure";

export type WorkflowSurfacePrimaryDestination =
  | "fit_review"
  | "studio_unlock"
  | "studio_generate"
  | "studio_workspace"
  | "results";

export type WorkflowSurfaceAuthorityModel = {
  canonicalState: WorkflowSurfaceCanonicalState;
  headline: string;
  body: string;
  primaryAction: {
    label: string;
    destination: WorkflowSurfacePrimaryDestination;
  };
  secondaryAction?: {
    label: string;
    destination: WorkflowSurfacePrimaryDestination;
  };
  trustTone: WorkflowSurfaceTrustTone;
};

