import { test, expect } from "@playwright/test";
import { computeCategoryBuckets } from "../lib/categories";
import type { Entry, Registrant } from "../lib/db";

// Pure-function tests — no page, no server.

const rider = (bib: string, gender: string, age: string): Registrant => ({
  bib,
  name: `Rider ${bib}`,
  wave: "A",
  age,
  gender,
});

const finish = (bib: string, elapsedMs: number | null): Entry => ({
  id: Number(bib),
  bib,
  wave: elapsedMs === null ? null : "A",
  name: `Rider ${bib}`,
  finishTime: "",
  finishTimeMs: 0,
  elapsedTime: "",
  elapsedMs,
  timestamp: "",
});

function boardsFor(riders: Registrant[], times: Record<string, number>) {
  const registrants = new Map(riders.map((r) => [r.bib, r]));
  const entries = riders.map((r) => finish(r.bib, times[r.bib] ?? null));
  const buckets = computeCategoryBuckets(entries, registrants);
  return Object.fromEntries(
    buckets.map((b) => [b.id, b.entries.map((e) => e.bib)])
  );
}

test.describe("category boards", () => {
  test("lists the five boards in display order with their limits", () => {
    const buckets = computeCategoryBuckets([], new Map());
    expect(
      buckets.map((b) => [b.name, b.displayLimit, b.expandLimit])
    ).toEqual([
      ["Men's Overall", 3, 25],
      ["Women's Overall", 3, 25],
      ["50+ Men", 1, 10],
      ["50+ Women", 1, 10],
      ["18U", 1, 10],
    ]);
  });

  test("18U includes 18 and excludes 19, and takes any gender", () => {
    const boards = boardsFor(
      [
        rider("1", "male", "17"),
        rider("2", "male", "18"),
        rider("3", "male", "19"),
        rider("4", "nonbinary", "16"),
        rider("5", "female", "15"),
      ],
      { "1": 100, "2": 200, "3": 50, "4": 300, "5": 400 }
    );
    expect(boards.junior).toEqual(["1", "2", "4", "5"]);
  });

  test("50+ starts at 50, not 49, and splits by gender", () => {
    const boards = boardsFor(
      [
        rider("1", "male", "49"),
        rider("2", "male", "50"),
        rider("3", "female", "50"),
        rider("4", "female", "49"),
        rider("5", "nonbinary", "60"),
      ],
      { "1": 100, "2": 200, "3": 300, "4": 400, "5": 500 }
    );
    expect(boards.mastersMen).toEqual(["2"]);
    expect(boards.mastersWomen).toEqual(["3"]);
  });

  test("nonbinary and undisclosed riders appear on 18U only", () => {
    const boards = boardsFor(
      [
        rider("1", "nonbinary", "14"),
        rider("2", "undisclosed", "55"),
        rider("3", "nonbinary", "30"),
      ],
      { "1": 100, "2": 200, "3": 300 }
    );
    expect(boards.junior).toEqual(["1"]);
    expect(boards.men).toEqual([]);
    expect(boards.women).toEqual([]);
    expect(boards.mastersMen).toEqual([]);
    expect(boards.mastersWomen).toEqual([]);
  });

  test("a rider appears on every board they qualify for", () => {
    const boards = boardsFor(
      [rider("1", "male", "16"), rider("2", "male", "52")],
      { "1": 100, "2": 200 }
    );
    expect(boards.men).toEqual(["1", "2"]);
    expect(boards.junior).toEqual(["1"]);
    expect(boards.mastersMen).toEqual(["2"]);
  });

  test("a missing or invalid age keeps a rider off the age boards only", () => {
    const boards = boardsFor(
      [
        rider("1", "male", ""),
        rider("2", "female", "unknown"),
        rider("3", "male", "-5"),
      ],
      { "1": 100, "2": 200, "3": 300 }
    );
    expect(boards.men).toEqual(["1", "3"]);
    expect(boards.women).toEqual(["2"]);
    expect(boards.junior).toEqual([]);
    expect(boards.mastersMen).toEqual([]);
    expect(boards.mastersWomen).toEqual([]);
  });

  test("ranks by elapsed time and leaves out unresolved finishers", () => {
    const boards = boardsFor(
      [
        rider("1", "male", "30"),
        rider("2", "male", "30"),
        rider("3", "male", "30"),
        rider("4", "male", "30"),
      ],
      { "1": 300, "2": 100, "3": 200 } // bib 4 has no time
    );
    expect(boards.men).toEqual(["2", "3", "1"]);
  });
});
