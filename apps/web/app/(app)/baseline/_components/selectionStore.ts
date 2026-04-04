type SelectionState = {
  baselineName: string | null;
  jobTitle: string | null;
};

const state: SelectionState = {
  baselineName: null,
  jobTitle: null,
};

const listeners = new Set<() => void>();

export function subscribeSelection(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify() {
  listeners.forEach((listener) => listener());
}

export function setBaselineName(name: string | null) {
  if (state.baselineName === name) return;
  state.baselineName = name;
  notify();
}

export function setJobTitle(name: string | null) {
  if (state.jobTitle === name) return;
  state.jobTitle = name;
  notify();
}

export function getSelectionState(): SelectionState {
  return state;
}
