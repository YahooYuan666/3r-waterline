import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WaterlineOverlay } from "./App";
import type { QuotaMonitorState, Subscription } from "./domain/quota-monitor";

const supportedSubscription: Subscription = {
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
};

afterEach(cleanup);

function renderOverlay(state: QuotaMonitorState) {
  return render(<WaterlineOverlay state={state} onNavigate={vi.fn()} />);
}

describe("WaterlineOverlay", () => {
  it("renders Remaining Amounts from the published Verified Snapshot", () => {
    renderOverlay({
      kind: "verified",
      selectedSubscriptionId: "gpt-4x",
      subscriptions: [supportedSubscription],
      lastAttemptAt: new Date("2026-08-21T01:00:00.000Z"),
      lastVerifiedAt: new Date("2026-08-21T01:00:00.000Z"),
      freshness: "current",
      updateFailure: undefined
    });

    const vessel = screen.getByLabelText("周额度和月额度的剩余水位");

    expect(vessel.textContent).toContain("周");
    expect(vessel.textContent).toContain("$326.54");
    expect(vessel.textContent).toContain("/$400");
    expect(vessel.textContent).toContain("4d 1h 后重置");
    expect(vessel.textContent).toContain("月");
    expect(vessel.textContent).toContain("$800.57");
    expect(vessel.textContent).toContain("/$1,600");
    expect(vessel.textContent).toContain("6d 1h 后重置");
    expect(screen.queryByText("3R 水位")).toBeNull();
    expect(screen.queryByText("模拟额度")).toBeNull();
  });

  it("renders failure states but keeps unrelated Subscription cards out of the vessel", () => {
    const { rerender } = renderOverlay({
      kind: "unverified",
      reason: "read-failed",
      subscriptions: [],
      selectedSubscriptionId: undefined,
      lastAttemptAt: new Date("2026-08-21T01:00:00.000Z")
    });

    expect(screen.getByText("暂时无法验证额度")).toBeTruthy();

    rerender(
      <WaterlineOverlay
        state={{
          kind: "unverified",
          reason: "schema-mismatch",
          subscriptions: [],
          selectedSubscriptionId: undefined,
          lastAttemptAt: new Date("2026-08-21T01:00:00.000Z")
        }}
        onNavigate={vi.fn()}
      />
    );
    expect(screen.getByText("订阅页面格式已变更")).toBeTruthy();

    rerender(
      <WaterlineOverlay
        state={{
          kind: "verified",
          selectedSubscriptionId: "gpt-4x",
          subscriptions: [supportedSubscription],
          lastAttemptAt: new Date("2026-08-21T01:05:00.000Z"),
          lastVerifiedAt: new Date("2026-08-21T01:00:00.000Z"),
          freshness: "update-failed",
          updateFailure: "read-failed"
        }}
        onNavigate={vi.fn()}
      />
    );
    expect(screen.getByText("上次更新失败")).toBeTruthy();

    rerender(
      <WaterlineOverlay
        state={{
          kind: "verified",
          selectedSubscriptionId: "gpt-4x",
          subscriptions: [supportedSubscription],
          lastAttemptAt: new Date("2026-08-21T01:05:00.000Z"),
          lastVerifiedAt: new Date("2026-08-21T01:00:00.000Z"),
          freshness: "update-failed",
          updateFailure: "schema-mismatch"
        }}
        onNavigate={vi.fn()}
      />
    );
    expect(screen.getByText("订阅页面格式已变更")).toBeTruthy();

    rerender(
      <WaterlineOverlay
        state={{
          kind: "verified",
          selectedSubscriptionId: "gpt-4x",
          subscriptions: [
            supportedSubscription,
            { id: "unsupported", name: "其他方案", status: "unsupported" },
            { id: "inactive", name: "历史订阅", status: "inactive" }
          ],
          lastAttemptAt: new Date("2026-08-21T01:00:00.000Z"),
          lastVerifiedAt: new Date("2026-08-21T01:00:00.000Z"),
          freshness: "current",
          updateFailure: undefined
        }}
        onNavigate={vi.fn()}
      />
    );
    expect(screen.queryByRole("button", { name: "上一项订阅" })).toBeNull();
    expect(screen.queryByText("其他方案")).toBeNull();
    expect(screen.queryByText("历史订阅")).toBeNull();

    rerender(
      <WaterlineOverlay
        state={{
          kind: "unverified",
          reason: "no-supported-subscription",
          selectedSubscriptionId: "unsupported",
          subscriptions: [
            { id: "unsupported", name: "其他方案", status: "unsupported" },
            { id: "inactive", name: "历史订阅", status: "inactive" }
          ],
          lastAttemptAt: new Date("2026-08-21T01:00:00.000Z")
        }}
        onNavigate={vi.fn()}
      />
    );
    expect(screen.getByText("额度暂不可用")).toBeTruthy();
    expect(screen.queryByText("此订阅暂不支持")).toBeNull();
    expect(screen.queryByText("订阅已失效")).toBeNull();
  });

  it("offers the official 3R login command only when no Login State is available", () => {
    const onLogin = vi.fn();

    render(
      <WaterlineOverlay
        state={{
          kind: "unverified",
          reason: "authentication-required",
          subscriptions: [],
          selectedSubscriptionId: undefined,
          lastAttemptAt: new Date("2026-08-21T01:00:00.000Z")
        }}
        onNavigate={vi.fn()}
        onLogin={onLogin}
      />
    );

    screen.getByRole("button", { name: "登录 3R" }).click();

    expect(screen.getByText("尚未登录 3R")).toBeTruthy();
    expect(onLogin).toHaveBeenCalledTimes(1);
  });
});
