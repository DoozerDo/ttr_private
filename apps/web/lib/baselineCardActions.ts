export type BaselineCardActionFlags = {
  showArchive: boolean;
  showSetCurrent: boolean;
  showTargetRole: boolean;
  showViewDetails: boolean;
};

export function getBaselineCardActionFlags({
  isCurrentBaseline,
  isEditable,
  isReady,
  isArchived,
}: {
  isCurrentBaseline: boolean;
  isEditable: boolean;
  isReady: boolean;
  isArchived: boolean;
}): BaselineCardActionFlags {
  const showViewDetails = true;
  const showTargetRole = isReady && !isArchived;
  const showSetCurrent = !isCurrentBaseline && isEditable && !isArchived;

  return {
    showArchive: isEditable && !isCurrentBaseline && !isArchived,
    showSetCurrent,
    showTargetRole,
    showViewDetails,
  };
}

