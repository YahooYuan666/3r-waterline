import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
  const directBalanceSubscription: Subscription = {
    id: "grok-direct-balance",
    name: "Grok 直充余额",
    status: "supported",
    kind: "direct-balance",
    availableBalance: { amount: 298.69, currency: "USD" }
  };

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
    expect(vessel.textContent).toContain("/$1600");
    expect(vessel.textContent).toContain("6d 1h 后重置");
    expect(screen.queryByText("3R 水位")).toBeNull();
    expect(screen.queryByText("模拟额度")).toBeNull();
  });

  it("renders the compact Traffic Monitor bars when selected", () => {
    render(
      <WaterlineOverlay
        state={{
          kind: "verified",
          selectedSubscriptionId: "gpt-4x",
          subscriptions: [supportedSubscription],
          lastAttemptAt: new Date("2026-08-21T01:00:00.000Z"),
          lastVerifiedAt: new Date("2026-08-21T01:00:00.000Z"),
          freshness: "current",
          updateFailure: undefined
        }}
        onNavigate={vi.fn()}
        displayMode="traffic"
      />
    );

    const monitor = screen.getByLabelText("周额度和月额度的剩余额度");
    expect(monitor.className).toContain("traffic-monitor");
    expect(monitor.textContent).toContain("$326.54 /$400");
    expect(monitor.textContent).toContain("$800.57 /$1600");
    expect(monitor.textContent).toContain("4d 1h 后重置");
  });

  it("renders Grok direct balance as a non-quota rail without reset or denominator", () => {
    render(
      <WaterlineOverlay
        state={{
          kind: "verified",
          selectedSubscriptionId: "grok-direct-balance",
          subscriptions: [supportedSubscription, directBalanceSubscription],
          lastAttemptAt: new Date("2026-08-25T01:00:00.000Z"),
          lastVerifiedAt: new Date("2026-08-25T01:00:00.000Z"),
          freshness: "current",
          updateFailure: undefined
        }}
        onNavigate={vi.fn()}
        displayMode="traffic"
      />
    );

    const balance = screen.getByLabelText("Grok 直充余额");
    expect(balance.textContent).toContain("可用余额");
    expect(balance.textContent).toContain("$298.69");
    expect(balance.textContent).not.toContain("后重置");
    expect(balance.textContent).not.toContain("/");
  });

  it("uses a two-row compact copy layout for the small Traffic Monitor", () => {
    render(
      <WaterlineOverlay
        state={{
          kind: "verified",
          selectedSubscriptionId: "gpt-4x",
          subscriptions: [supportedSubscription],
          lastAttemptAt: new Date("2026-08-21T01:00:00.000Z"),
          lastVerifiedAt: new Date("2026-08-21T01:00:00.000Z"),
          freshness: "current",
          updateFailure: undefined
        }}
        onNavigate={vi.fn()}
        displayMode="traffic"
        uiScale="small"
      />
    );

    const copies = screen.getByLabelText("周额度和月额度的剩余额度").querySelectorAll(".traffic-bar-copy");
    expect(copies).toHaveLength(2);
    expect(Array.from(copies).every((copy) => copy.classList.contains("compact"))).toBe(true);
    expect(screen.getByText("$800.57 /$1600")).toBeTruthy();
  });

  it("shows the selected subscription name with navigation controls", () => {
    const onNavigate = vi.fn();
    const secondSubscription: Subscription = {
      ...supportedSubscription,
      id: "claude-pro",
      name: "Claude Pro"
    };

    render(
      <WaterlineOverlay
        state={{
          kind: "verified",
          selectedSubscriptionId: "gpt-4x",
          subscriptions: [supportedSubscription, secondSubscription],
          lastAttemptAt: new Date("2026-08-21T01:00:00.000Z"),
          lastVerifiedAt: new Date("2026-08-21T01:00:00.000Z"),
          freshness: "current",
          updateFailure: undefined
        }}
        onNavigate={onNavigate}
      />
    );

    expect(screen.getByLabelText("当前订阅：GPT 4x")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "上一项订阅" }));
    fireEvent.click(screen.getByRole("button", { name: "下一项订阅" }));
    expect(onNavigate).toHaveBeenNthCalledWith(1, -1);
    expect(onNavigate).toHaveBeenNthCalledWith(2, 1);
  });

  it("hides a removed weekly period instead of showing a guessed value", () => {
    render(
      <WaterlineOverlay
        state={{
          kind: "verified",
          selectedSubscriptionId: "gpt-4x",
          subscriptions: [
            {
              ...supportedSubscription,
              quotaSnapshot: { monthly: supportedSubscription.quotaSnapshot.monthly }
            }
          ],
          lastAttemptAt: new Date("2026-08-21T01:00:00.000Z"),
          lastVerifiedAt: new Date("2026-08-21T01:00:00.000Z"),
          freshness: "current",
          updateFailure: undefined
        }}
        onNavigate={vi.fn()}
      />
    );

    expect(screen.getByText("月")).toBeTruthy();
    expect(screen.queryByText("周")).toBeNull();
    expect(screen.getByText("/$1600")).toBeTruthy();
  });

  it("delegates a primary-button press on the quota surface to the native drag handler", () => {
    const onDragStart = vi.fn();
    render(
      <WaterlineOverlay
        state={{
          kind: "verified",
          selectedSubscriptionId: "gpt-4x",
          subscriptions: [supportedSubscription],
          lastAttemptAt: new Date("2026-08-21T01:00:00.000Z"),
          lastVerifiedAt: new Date("2026-08-21T01:00:00.000Z"),
          freshness: "current",
          updateFailure: undefined
        }}
        onNavigate={vi.fn()}
        onDragStart={onDragStart}
      />
    );

    fireEvent.mouseDown(screen.getByLabelText("周额度和月额度的剩余水位"), { button: 0 });

    expect(onDragStart).toHaveBeenCalledTimes(1);
  });

  it("uses the Windows native menu route when the desktop host provides it", () => {
    const onOpenNativeContextMenu = vi.fn();
    render(
      <WaterlineOverlay
        state={{
          kind: "verified",
          selectedSubscriptionId: "gpt-4x",
          subscriptions: [supportedSubscription],
          lastAttemptAt: new Date("2026-08-21T01:00:00.000Z"),
          lastVerifiedAt: new Date("2026-08-21T01:00:00.000Z"),
          freshness: "current",
          updateFailure: undefined
        }}
        onNavigate={vi.fn()}
        onOpenNativeContextMenu={onOpenNativeContextMenu}
      />
    );

    fireEvent.contextMenu(screen.getByLabelText("周额度和月额度的剩余水位"));

    expect(onOpenNativeContextMenu).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("closes the overlay context menu before opening settings", () => {
    const onOpenSettings = vi.fn();
    render(
      <WaterlineOverlay
        state={{
          kind: "verified",
          selectedSubscriptionId: "gpt-4x",
          subscriptions: [supportedSubscription],
          lastAttemptAt: new Date("2026-08-21T01:00:00.000Z"),
          lastVerifiedAt: new Date("2026-08-21T01:00:00.000Z"),
          freshness: "current",
          updateFailure: undefined
        }}
        onNavigate={vi.fn()}
        onOpenSettings={onOpenSettings}
      />
    );

    fireEvent.contextMenu(screen.getByLabelText("周额度和月额度的剩余水位"), {
      clientX: 20,
      clientY: 20
    });
    expect(screen.getByRole("menuitem", { name: "Traffic Monitor 横条" })).toBeTruthy();
    fireEvent.click(screen.getByRole("menuitem", { name: "设置" }));

    expect(onOpenSettings).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).toBeNull();
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

  it("reserves a real traffic container for the unauthenticated login action", () => {
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
        onLogin={vi.fn()}
        displayMode="traffic"
      />
    );

    expect(document.querySelector(".traffic-monitor.empty-quota-state")).toBeTruthy();
    expect(screen.getByRole("button", { name: "登录 3R" })).toBeTruthy();
  });

  it("offers login immediately while the initial quota check is starting", () => {
    const onLogin = vi.fn();

    render(
      <WaterlineOverlay
        state={{
          kind: "unverified",
          reason: "starting",
          subscriptions: [],
          selectedSubscriptionId: undefined,
          lastAttemptAt: undefined
        }}
        onNavigate={vi.fn()}
        onLogin={onLogin}
      />
    );

    expect(screen.getByText("正在校验额度")).toBeTruthy();
    screen.getByRole("button", { name: "登录 3R" }).click();
    expect(onLogin).toHaveBeenCalledTimes(1);
  });

  it("does not offer login for unrelated unverified states", () => {
    for (const reason of ["read-failed", "schema-mismatch", "no-supported-subscription"] as const) {
      const { unmount } = render(
        <WaterlineOverlay
          state={{
            kind: "unverified",
            reason,
            subscriptions: [],
            selectedSubscriptionId: undefined,
            lastAttemptAt: undefined
          }}
          onNavigate={vi.fn()}
          onLogin={vi.fn()}
        />
      );

      expect(screen.queryByRole("button", { name: "登录 3R" })).toBeNull();
      unmount();
    }
  });

  it("shows a compact edge tab that can restore the overlay after edge hide", () => {
    const onRestoreEdgeHide = vi.fn();

    render(
      <WaterlineOverlay
        state={{
          kind: "verified",
          selectedSubscriptionId: "gpt-4x",
          subscriptions: [supportedSubscription],
          lastAttemptAt: new Date("2026-08-21T01:00:00.000Z"),
          lastVerifiedAt: new Date("2026-08-21T01:00:00.000Z"),
          freshness: "current",
          updateFailure: undefined
        }}
        onNavigate={vi.fn()}
        onRestoreEdgeHide={onRestoreEdgeHide}
        edgeHidden
      />
    );

    const tab = screen.getByRole("button", { name: "展开悬浮窗" });
    expect(tab.className).toContain("edge-hide-tab");

    fireEvent.mouseEnter(tab);
    fireEvent.click(tab);

    expect(onRestoreEdgeHide).toHaveBeenCalledTimes(2);
    expect(screen.getAllByRole("button", { name: "展开悬浮窗" })[0].querySelectorAll(".edge-meter-dot")).toHaveLength(20);
  });

  it("asks the host to re-hide a docked overlay after the pointer leaves", () => {
    const onEdgeMouseLeave = vi.fn();
    render(
      <WaterlineOverlay
        state={{
          kind: "verified",
          selectedSubscriptionId: "gpt-4x",
          subscriptions: [supportedSubscription],
          lastAttemptAt: new Date("2026-08-21T01:00:00.000Z"),
          lastVerifiedAt: new Date("2026-08-21T01:00:00.000Z"),
          freshness: "current",
          updateFailure: undefined
        }}
        onNavigate={vi.fn()}
        onEdgeMouseLeave={onEdgeMouseLeave}
      />
    );

    fireEvent.mouseLeave(screen.getByRole("main"));
    expect(onEdgeMouseLeave).toHaveBeenCalledTimes(1);
  });
});
