import { describe, expect, it } from "vitest";

import {
  formatRemainingPercent,
  loadGeminiReading,
  queryAgeLabel,
  resetCountdown,
  saveGeminiReading,
  type AntigravityReading
} from "./antigravity";

describe("antigravity reading", () => {
  const now = new Date("2026-10-04T04:40:00.000Z");

  it("keeps a countdown moving from the stored reset time and stops at zero", () => {
    expect(resetCountdown("2026-10-04T07:10:00.000Z", now)).toBe("2h 30m");
    expect(resetCountdown("2026-10-04T05:09:00.000Z", now)).toBe("0h 29m");
    expect(resetCountdown("2026-10-10T17:19:42.000Z", now)).toBe("6d 12h");
    expect(resetCountdown("2026-10-03T22:19:42.000Z", now)).toBe("0h 0m");
  });

  it("labels how long ago the reading was fetched", () => {
    expect(queryAgeLabel("2026-10-04T04:39:30.000Z", now)).toBe("刚刚查询");
    expect(queryAgeLabel("2026-10-04T01:40:00.000Z", now)).toBe("3 小时前查询");
  });

  it("formats a remaining fraction as a percentage", () => {
    expect(formatRemainingPercent(0.489)).toBe("48.9%");
    expect(formatRemainingPercent(1.4)).toBe("100.0%");
  });

  it("reloads the last reading and drops a malformed one", () => {
    const storage = new MemoryStorage();
    const reading: AntigravityReading = {
      queriedAt: "2026-10-04T01:40:00.000Z",
      fiveHour: { remainingFraction: 0.489, resetTime: "2026-10-04T07:10:00.000Z" },
      weekly: { remainingFraction: 0.908, resetTime: "2026-10-10T17:19:42.000Z" },
      failure: "无法连接 Google"
    };

    saveGeminiReading(reading, storage);

    expect(loadGeminiReading(storage)).toEqual(reading);
    storage.setItem("3r-waterline-gemini-reading", "{");
    expect(loadGeminiReading(storage)).toBeNull();
  });
});

class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}
