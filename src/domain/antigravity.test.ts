import { describe, expect, it } from "vitest";

import {
  accountShortName,
  aggregateGeminiPool,
  formatRemainingPercent,
  loadGeminiPool,
  loadGeminiReading,
  queryAgeLabel,
  resetCountdown,
  saveGeminiPool,
  saveGeminiReading,
  type AccountGeminiReading,
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

  it("extracts short account name from email", () => {
    expect(accountShortName("user1@gmail.com")).toBe("user1");
    expect(accountShortName("developer@corp.net")).toBe("developer");
    expect(accountShortName("Google 账号")).toBe("Google 账号");
  });

  it("aggregates multiple accounts into equal-weighted pool average and earliest reset", () => {
    const accounts: AccountGeminiReading[] = [
      {
        id: "acc1",
        email: "user1@gmail.com",
        queriedAt: "2026-10-04T04:00:00.000Z",
        fiveHour: { remainingFraction: 0.4, resetTime: "2026-10-04T08:00:00.000Z" },
        weekly: { remainingFraction: 0.8, resetTime: "2026-10-10T10:00:00.000Z" }
      },
      {
        id: "acc2",
        email: "user2@gmail.com",
        queriedAt: "2026-10-04T04:10:00.000Z",
        fiveHour: { remainingFraction: 0.6, resetTime: "2026-10-04T06:00:00.000Z" },
        weekly: { remainingFraction: 1.0, resetTime: "2026-10-09T10:00:00.000Z" }
      }
    ];

    const pool = aggregateGeminiPool(accounts, now);
    expect(pool).not.toBeNull();
    // (0.4 + 0.6) / 2 = 0.5
    expect(pool?.fiveHour?.remainingFraction).toBeCloseTo(0.5);
    // Earliest 5h reset is 06:00 (acc2)
    expect(pool?.fiveHour?.resetTime).toBe("2026-10-04T06:00:00.000Z");
    // (0.8 + 1.0) / 2 = 0.9
    expect(pool?.weekly?.remainingFraction).toBeCloseTo(0.9);
    // Earliest weekly reset is 10-09 (acc2)
    expect(pool?.weekly?.resetTime).toBe("2026-10-09T10:00:00.000Z");
    // Latest query time is 04:10
    expect(pool?.queriedAt).toBe("2026-10-04T04:10:00.000Z");
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

  it("saves and loads multi-account pool storage with legacy migration", () => {
    const storage = new MemoryStorage();
    // Legacy single session in storage
    storage.setItem(
      "3r-waterline-gemini-reading",
      JSON.stringify({
        queriedAt: "2026-10-04T01:00:00.000Z",
        fiveHour: { remainingFraction: 0.5 }
      })
    );

    const loaded = loadGeminiPool(storage);
    expect(loaded.length).toBe(1);
    expect(loaded[0].fiveHour?.remainingFraction).toBe(0.5);

    // Save multi accounts
    const newAccounts: AccountGeminiReading[] = [
      { id: "1", email: "a@gmail.com", queriedAt: "2026-10-04T01:00:00.000Z" },
      { id: "2", email: "b@gmail.com", queriedAt: "2026-10-04T01:00:00.000Z" }
    ];
    saveGeminiPool(newAccounts, storage);
    expect(loadGeminiPool(storage).length).toBe(2);
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
