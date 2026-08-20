import { describe, expect, it, vi } from "vitest";
import {
  createQuotaMonitor,
  SchemaMismatchError,
  type SubscriptionReadResult
} from "./quota-monitor";

const supportedRead: SubscriptionReadResult = {
  subscriptions: [
    {
      id: "gpt-4x",
      name: "GPT 4x",
      status: "supported",
      quotaSnapshot: {
        weekly: {
          remainingAmount: { amount: 326.54, currency: "USD" },
          limit: { amount: 400, currency: "USD" },
          resetCountdown: "4d 1h"
        },
        monthly: {
          remainingAmount: { amount: 800.57, currency: "USD" },
          limit: { amount: 1600, currency: "USD" },
          resetCountdown: "6d 1h"
        }
      }
    }
  ]
};

describe("Quota Monitor", () => {
  it("publishes a Verified Snapshot from a simulated subscriptions-page read", async () => {
    const reader = {
      read: vi.fn().mockResolvedValue(supportedRead)
    };
    const now = new Date("2026-08-21T01:00:00.000Z");

    const monitor = createQuotaMonitor({ reader, clock: { now: () => now } });
    const state = await monitor.start();

    expect(reader.read).toHaveBeenCalledTimes(1);
    expect(state).toEqual({
      kind: "verified",
      selectedSubscriptionId: "gpt-4x",
      subscriptions: supportedRead.subscriptions,
      lastAttemptAt: now,
      lastVerifiedAt: now,
      freshness: "current",
      updateFailure: undefined
    });
  });

  it("starts in Unverified State and does not surface a previous-lifecycle snapshot before the first read", async () => {
    let finishRead: (value: SubscriptionReadResult) => void;
    const reader = {
      read: vi.fn().mockImplementation(
        () => new Promise<SubscriptionReadResult>((resolve) => (finishRead = resolve))
      )
    };
    const monitor = createQuotaMonitor({ reader });
    const publishedStates: string[] = [];
    monitor.subscribe((state) => publishedStates.push(state.kind));

    const starting = monitor.start();

    expect(monitor.getState()).toEqual({
      kind: "unverified",
      reason: "starting",
      subscriptions: [],
      selectedSubscriptionId: undefined,
      lastAttemptAt: undefined
    });
    expect(publishedStates).toEqual(["unverified"]);

    finishRead!(supportedRead);
    await starting;
  });

  it("publishes Unverified State when the first subscriptions-page read fails", async () => {
    const reader = {
      read: vi.fn().mockRejectedValue(new Error("network unavailable"))
    };

    const monitor = createQuotaMonitor({ reader });
    const state = await monitor.start();

    expect(state).toEqual({
      kind: "unverified",
      reason: "read-failed",
      subscriptions: [],
      selectedSubscriptionId: undefined,
      lastAttemptAt: expect.any(Date)
    });
  });

  it("publishes Schema Mismatch without inventing quota values", async () => {
    const reader = {
      read: vi.fn().mockRejectedValue(new SchemaMismatchError())
    };
    const monitor = createQuotaMonitor({ reader });

    await expect(monitor.start()).resolves.toMatchObject({
      kind: "unverified",
      reason: "schema-mismatch",
      subscriptions: []
    });
  });

  it("keeps the latest Verified Snapshot visible and marks it stale if a later update fails", async () => {
    const firstReadAt = new Date("2026-08-21T01:00:00.000Z");
    const failedRefreshAt = new Date("2026-08-21T01:05:00.000Z");
    const clock = { now: vi.fn().mockReturnValueOnce(firstReadAt).mockReturnValueOnce(failedRefreshAt) };
    const reader = {
      read: vi.fn().mockResolvedValueOnce(supportedRead).mockRejectedValueOnce(new Error("offline"))
    };
    const monitor = createQuotaMonitor({ reader, clock });

    await monitor.start();
    const state = await monitor.refresh();

    expect(state).toEqual({
      kind: "verified",
      selectedSubscriptionId: "gpt-4x",
      subscriptions: supportedRead.subscriptions,
      lastAttemptAt: failedRefreshAt,
      lastVerifiedAt: firstReadAt,
      freshness: "update-failed",
      updateFailure: "read-failed"
    });
  });

  it("keeps Unsupported and Inactive Subscriptions identifiable when no Supported Subscription exists", async () => {
    const reader = {
      read: vi.fn().mockResolvedValue({
        subscriptions: [
          { id: "unknown", name: "其他方案", status: "unsupported" as const },
          { id: "old", name: "历史订阅", status: "inactive" as const }
        ]
      })
    };
    const monitor = createQuotaMonitor({ reader });

    await expect(monitor.start()).resolves.toMatchObject({
      kind: "unverified",
      reason: "no-supported-subscription",
      selectedSubscriptionId: "unknown",
      subscriptions: [
        { id: "unknown", status: "unsupported" },
        { id: "old", status: "inactive" }
      ]
    });
  });

  it("publishes the selected Subscription after navigation instead of leaving selection in the overlay", async () => {
    const reader = {
      read: vi.fn().mockResolvedValue({
        subscriptions: [
          supportedRead.subscriptions[0],
          { id: "unknown", name: "其他方案", status: "unsupported" as const },
          { id: "old", name: "历史订阅", status: "inactive" as const }
        ]
      })
    };
    const monitor = createQuotaMonitor({ reader });

    await monitor.start();

    expect(monitor.selectAdjacentSubscription(1)).toMatchObject({
      selectedSubscriptionId: "unknown"
    });
    expect(monitor.selectAdjacentSubscription(1)).toMatchObject({
      selectedSubscriptionId: "old"
    });
  });
});
