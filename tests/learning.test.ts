import { describe, expect, it } from "vitest";
import { learningByWeek } from "../src/lib/learning";
import type { DecisionEvent } from "../src/lib/types";

function decision(week: string, edited: boolean): DecisionEvent {
  return {
    id: Math.random().toString(36),
    householdId: "h",
    expenseId: "e",
    action: edited ? "corrected" : "accepted",
    edited,
    at: new Date().toISOString(),
    week,
  };
}

describe("learningByWeek", () => {
  it("is empty with no decisions — the chart never fakes data", () => {
    expect(learningByWeek([])).toEqual([]);
  });

  it("computes the unedited share per week", () => {
    const weeks = learningByWeek([
      decision("2026-W44", false),
      decision("2026-W44", false),
      decision("2026-W44", true),
      decision("2026-W44", false),
      decision("2026-W45", true),
      decision("2026-W45", true),
    ]);
    expect(weeks).toEqual([
      { week: "2026-W44", total: 4, unedited: 3, pctUnedited: 0.75 },
      { week: "2026-W45", total: 2, unedited: 0, pctUnedited: 0 },
    ]);
  });

  it("sorts weeks chronologically", () => {
    const weeks = learningByWeek([decision("2026-W45", false), decision("2026-W44", false)]);
    expect(weeks.map((w) => w.week)).toEqual(["2026-W44", "2026-W45"]);
  });
});
