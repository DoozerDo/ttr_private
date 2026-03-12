export type ReleaseAnnotation = {
  date: string;
  title: string;
  note?: string;
};

export const RELEASE_ANNOTATIONS: ReleaseAnnotation[] = [
  {
    date: "2026-03-11",
    title: "Landing clarity refactor",
  },
  {
    date: "2026-03-12",
    title: "Results conversion pass",
  },
  {
    date: "2026-03-13",
    title: "Sample role quick start added",
  },
];
