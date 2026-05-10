export type BaselineCardActionFlags = {
  showArchive: boolean;
  showSetCurrent: boolean;
  showTargetRole: boolean;
  showViewDetails: boolean;
};

export function getBaselineCardActionFlags({
  isCurrentBaseline,
  isEditable,
  targetReady,
  isArchived,
}: {
  isCurrentBaseline: boolean;
  isEditable: boolean;
  targetReady: boolean;
  isArchived: boolean;
}): BaselineCardActionFlags {
  const showViewDetails = true;
  // Capability eligibility is independent of archived/current organizational state.
  const showTargetRole = targetReady;
  const showSetCurrent = !isCurrentBaseline && isEditable && !isArchived;

  return {
    showArchive: isEditable && !isCurrentBaseline && !isArchived,
    showSetCurrent,
    showTargetRole,
    showViewDetails,
  };
}
