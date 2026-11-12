import { describe, expect, it } from "vitest";
import { monthRange, monthsAgo } from "@/lib/admin-month";

describe("集計の月", () => {
  it("日本時間の月初から翌月初までを返す", () => {
    expect(monthRange("2026-11")).toMatchObject({ label: "2026年11月", prev: "2026-10", next: "2026-12", start: "2026-11-01T00:00:00+09:00", end: "2026-12-01T00:00:00+09:00" });
  });

  it("年をまたぐ", () => {
    expect(monthRange("2026-12")).toMatchObject({ next: "2027-01", end: "2027-01-01T00:00:00+09:00" });
    expect(monthRange("2027-01")).toMatchObject({ prev: "2026-12" });
  });

  it("形式が違えば null", () => {
    for (const m of ["2026-13", "2026-1", "202611", "abc"]) expect(monthRange(m)).toBeNull();
  });

  it("今月から何か月前か（日本時間で数える）", () => {
    const now = new Date("2026-10-31T16:00:00Z"); // 日本時間 11/1 1:00
    expect(monthsAgo("2026-11", now)).toBe(0);
    expect(monthsAgo("2026-10", now)).toBe(1);
    expect(monthsAgo("2025-11", now)).toBe(12);
    expect(monthsAgo("2026-12", now)).toBe(-1);
  });
});
