/**
 * Simulated household personas for the Evenly simulation harness.
 *
 * Each persona has HIDDEN split rules per category (weights by member name).
 * The app never sees these rules. It only sees the purchases the agents log
 * and the accepts or corrections they make, exactly like real users. Any
 * learning in the results comes from Walrus Memory recall inside the app,
 * never from this file.
 *
 * Categories match the app's deterministic parser categories.
 */

export interface PersonaMember {
  name: string;
  /** Hidden weights per category, keyed by member name. Missing category = equal split. */
  rules: Record<string, Record<string, number>>;
}

export interface Persona {
  householdName: string;
  members: PersonaMember[];
  /** Purchases per simulated day: raw one line strings, exactly as a user would type. */
  days: string[][];
}

export const PERSONAS: Persona[] = [
  {
    householdName: "Simulated Household 1, Night Owls",
    members: [
      {
        name: "Adaeze",
        rules: {
          groceries: { Adaeze: 0.7, Chidi: 0.3 },
          rent: { Adaeze: 0.5, Chidi: 0.5 },
          utilities: { Adaeze: 0.6, Chidi: 0.4 },
          fun: { Adaeze: 0.5, Chidi: 0.5 },
        },
      },
      {
        name: "Chidi",
        rules: {
          groceries: { Adaeze: 0.7, Chidi: 0.3 },
          rent: { Adaeze: 0.5, Chidi: 0.5 },
          utilities: { Adaeze: 0.6, Chidi: 0.4 },
          fun: { Adaeze: 0.5, Chidi: 0.5 },
        },
      },
    ],
    days: [
      [
        "groceries 4200 paid by Adaeze",
        "rent 15000 paid by Chidi",
        "electricity 3000 paid by Adaeze",
        "groceries 3650 paid by Chidi",
        "movie tickets 5000 paid by Adaeze",
        "detergent 1800 paid by Chidi",
      ],
      [
        "groceries 5100 paid by Adaeze",
        "electricity 3400 paid by Chidi",
        "groceries 2900 paid by Chidi",
        "netflix 4500 paid by Adaeze",
        "rent 15000 paid by Adaeze",
        "pharmacy 2600 paid by Chidi",
      ],
    ],
  },
  {
    householdName: "Simulated Household 2, Marble Arch Flat",
    members: [
      { name: "Funmi", rules: { groceries: { Funmi: 0.34, Tunde: 0.33, Sara: 0.33 }, dining: { Funmi: 0.4, Tunde: 0.3, Sara: 0.3 }, transport: { Funmi: 0.5, Tunde: 0.25, Sara: 0.25 } } },
      { name: "Tunde", rules: { groceries: { Funmi: 0.34, Tunde: 0.33, Sara: 0.33 }, dining: { Funmi: 0.4, Tunde: 0.3, Sara: 0.3 }, transport: { Funmi: 0.5, Tunde: 0.25, Sara: 0.25 } } },
      { name: "Sara", rules: { groceries: { Funmi: 0.34, Tunde: 0.33, Sara: 0.33 }, dining: { Funmi: 0.4, Tunde: 0.3, Sara: 0.3 }, transport: { Funmi: 0.5, Tunde: 0.25, Sara: 0.25 } } },
    ],
    days: [
      [
        "groceries 6900 paid by Funmi",
        "pizza 5400 paid by Tunde",
        "uber 2300 paid by Sara",
        "groceries 4800 paid by Tunde",
        "lunch 3600 paid by Funmi",
        "bolt 1900 paid by Funmi",
      ],
      [
        "groceries 7200 paid by Sara",
        "pizza 6100 paid by Funmi",
        "uber 2600 paid by Tunde",
        "groceries 5300 paid by Funmi",
        "dinner 8800 paid by Sara",
        "taxi 2100 paid by Sara",
      ],
    ],
  },
  {
    householdName: "Simulated Household 3, Garden Flat",
    members: [
      { name: "Ibrahim", rules: { groceries: { Ibrahim: 0.5, Halima: 0.5 }, utilities: { Ibrahim: 0.8, Halima: 0.2 }, rent: { Ibrahim: 0.65, Halima: 0.35 }, health: { Ibrahim: 0.5, Halima: 0.5 } } },
      { name: "Halima", rules: { groceries: { Ibrahim: 0.5, Halima: 0.5 }, utilities: { Ibrahim: 0.8, Halima: 0.2 }, rent: { Ibrahim: 0.65, Halima: 0.35 }, health: { Ibrahim: 0.5, Halima: 0.5 } } },
    ],
    days: [
      [
        "groceries 4500 paid by Ibrahim",
        "water bill 2200 paid by Halima",
        "rent 12000 paid by Ibrahim",
        "groceries 3900 paid by Halima",
        "electricity 2800 paid by Ibrahim",
        "pharmacy 3100 paid by Halima",
      ],
      [
        "groceries 4700 paid by Halima",
        "internet 9000 paid by Ibrahim",
        "rent 12000 paid by Halima",
        "groceries 4100 paid by Ibrahim",
        "water bill 2400 paid by Ibrahim",
        "pharmacy 2900 paid by Ibrahim",
      ],
    ],
  },
  {
    householdName: "Simulated Household 4, Harbour View",
    members: [
      { name: "Ngozi", rules: { groceries: { Ngozi: 0.45, Emeka: 0.35, Yetunde: 0.2 }, fun: { Ngozi: 0.34, Emeka: 0.33, Yetunde: 0.33 }, household: { Ngozi: 0.6, Emeka: 0.2, Yetunde: 0.2 } } },
      { name: "Emeka", rules: { groceries: { Ngozi: 0.45, Emeka: 0.35, Yetunde: 0.2 }, fun: { Ngozi: 0.34, Emeka: 0.33, Yetunde: 0.33 }, household: { Ngozi: 0.6, Emeka: 0.2, Yetunde: 0.2 } } },
      { name: "Yetunde", rules: { groceries: { Ngozi: 0.45, Emeka: 0.35, Yetunde: 0.2 }, fun: { Ngozi: 0.34, Emeka: 0.33, Yetunde: 0.33 }, household: { Ngozi: 0.6, Emeka: 0.2, Yetunde: 0.2 } } },
    ],
    days: [
      [
        "groceries 5800 paid by Ngozi",
        "cinema 6600 paid by Emeka",
        "cleaning supplies 2400 paid by Yetunde",
        "groceries 4900 paid by Emeka",
        "movie night 4200 paid by Ngozi",
        "toiletries 2700 paid by Ngozi",
      ],
      [
        "groceries 6100 paid by Yetunde",
        "games 7500 paid by Ngozi",
        "detergent 2100 paid by Emeka",
        "groceries 5600 paid by Ngozi",
        "cinema 6900 paid by Yetunde",
        "cleaning supplies 2500 paid by Ngozi",
      ],
    ],
  },
];

/** Accept when the proposed weights are within this distance of the hidden weights. */
export const ACCEPT_TOLERANCE = 0.1;
/** Random jitter applied to corrections, and the noise band on acceptance. */
export const NOISE = 0.04;
