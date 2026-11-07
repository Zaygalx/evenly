import type { DecisionEvent } from "./types";

/**
 * The learning chart, computed only from real decision events.
 *
 * A proposal "accepted without an edit" is an accept decision (the user did
 * not change the shares). A correction counts as an edit. The chart shows,
 * per ISO week, what share of decided proposals needed no edit — the visible
 * sign that Evenly's memory is learning the household.
 */
export interface LearningWeek {
  week: string;
  total: number;
  unedited: number;
  /** 0..1, or null when there were no decisions that week. */
  pctUnedited: number | null;
}

export function learningByWeek(decisions: DecisionEvent[]): LearningWeek[] {
  const byWeek = new Map<string, { total: number; unedited: number }>();
  for (const d of decisions) {
    const bucket = byWeek.get(d.week) ?? { total: 0, unedited: 0 };
    bucket.total += 1;
    if (!d.edited) bucket.unedited += 1;
    byWeek.set(d.week, bucket);
  }
  return [...byWeek.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, b]) => ({
      week,
      total: b.total,
      unedited: b.unedited,
      pctUnedited: b.total === 0 ? null : b.unedited / b.total,
    }));
}
