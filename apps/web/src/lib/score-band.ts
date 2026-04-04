export enum ScoreBand {
  TOP = "TOP",
  MID = "MID",
  LOW = "LOW",
}

export function getScoreBand(score: number): ScoreBand {
  if (score >= 90) return ScoreBand.TOP;
  if (score >= 70) return ScoreBand.MID;
  return ScoreBand.LOW;
}

