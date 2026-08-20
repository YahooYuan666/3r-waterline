import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, LogIn, MoreHorizontal } from "lucide-react";
import {
  AuthenticationRequiredError,
  createQuotaMonitor,
  type Money,
  type PeriodQuota,
  type QuotaMonitorState,
  type SupportedSubscription
} from "./domain/quota-monitor";
import {
  createHtmlSubscriptionsPageReader,
  parseSubscriptionPageCapture,
  type SubscriptionPageCapture
} from "./domain/subscription-page-parser";
import { previewSubscriptionsPageHtml } from "./domain/subscription-page-preview";

function formatMoney(money: Money, fractionDigits = 2) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: money.currency,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits
  }).format(money.amount);
}

function remainingPercentage(period: PeriodQuota) {
  return Math.max(0, Math.min(100, (period.remainingAmount.amount / period.limit.amount) * 100));
}

function statusText(state: QuotaMonitorState) {
  if (state.kind === "unverified") {
    if (state.reason === "authentication-required") {
      return "尚未登录 3R";
    }

    if (state.reason === "starting") {
      return "正在校验额度";
    }

    if (state.reason === "read-failed") {
      return "暂时无法验证额度";
    }

    if (state.reason === "schema-mismatch") {
      return "订阅页面格式已变更";
    }
  }

  if (state.kind === "verified" && state.freshness === "update-failed") {
    if (state.updateFailure === "schema-mismatch") {
      return "订阅页面格式已变更";
    }

    return state.updateFailure === "authentication-required" ? "需要重新登录 3R" : "上次更新失败";
  }

  return "额度暂不可用";
}

interface WaterlineOverlayProps {
  state: QuotaMonitorState;
  onNavigate: (offset: -1 | 1) => void;
  onLogin?: () => void;
}

export function WaterlineOverlay({ state, onNavigate, onLogin }: WaterlineOverlayProps) {
  const supportedSubscriptions = state.subscriptions.filter(
    (subscription): subscription is SupportedSubscription => subscription.status === "supported"
  );
  const selectedSubscription =
    supportedSubscriptions.find((subscription) => subscription.id === state.selectedSubscriptionId) ??
    supportedSubscriptions[0];
  const quotaSnapshot = selectedSubscription?.quotaSnapshot;
  const stateNotice =
    state.kind === "verified" && state.freshness === "update-failed"
      ? statusText(state)
      : undefined;
  const canLogin = state.kind === "unverified" && onLogin != null;

  return (
    <main className="waterline-stage">
      <section className="waterline-overlay" aria-label="3R 剩余额度悬浮窗预览">
        <div
          className="quota-vessel"
          aria-label={quotaSnapshot ? "周额度和月额度的剩余水位" : statusText(state)}
        >
          {quotaSnapshot ? (
            <>
              <div
                className="water-fill weekly-fill"
                style={{ height: `${remainingPercentage(quotaSnapshot.weekly)}%` }}
              />
              <div
                className="water-fill monthly-fill"
                style={{ height: `${remainingPercentage(quotaSnapshot.monthly)}%` }}
              />
              <div className="vessel-divider" />
              <div className="vessel-gloss" />
              <div className="quota-content">
                <div className="quota-period weekly-period">
                  <span>周</span>
                  <p className="amount-line">
                    <strong>{formatMoney(quotaSnapshot.weekly.remainingAmount)}</strong>
                    <small>/{formatMoney(quotaSnapshot.weekly.limit, 0)}</small>
                  </p>
                  <em>{quotaSnapshot.weekly.resetCountdown} 后重置</em>
                </div>
                <div className="quota-period monthly-period">
                  <span>月</span>
                  <p className="amount-line">
                    <strong>{formatMoney(quotaSnapshot.monthly.remainingAmount)}</strong>
                    <small>/{formatMoney(quotaSnapshot.monthly.limit, 0)}</small>
                  </p>
                  <em>{quotaSnapshot.monthly.resetCountdown} 后重置</em>
                </div>
              </div>
              {stateNotice && (
                <p className="state-notice" aria-live="polite">
                  {stateNotice}
                </p>
              )}
            </>
          ) : (
            <div className="empty-vessel">
              {canLogin ? <LogIn size={30} aria-hidden="true" /> : <MoreHorizontal size={30} aria-hidden="true" />}
              <p aria-live="polite">{statusText(state)}</p>
              {canLogin && onLogin && (
                <button className="empty-vessel-login" type="button" onClick={onLogin}>
                  <LogIn size={15} aria-hidden="true" />
                  <span>登录 3R</span>
                </button>
              )}
            </div>
          )}

          {supportedSubscriptions.length > 1 && (
            <>
              <button
                className="vessel-nav vessel-nav-previous"
                type="button"
                title="上一项订阅"
                aria-label="上一项订阅"
                onClick={() => onNavigate(-1)}
              >
                <ChevronLeft size={16} aria-hidden="true" />
              </button>
              <button
                className="vessel-nav vessel-nav-next"
                type="button"
                title="下一项订阅"
                aria-label="下一项订阅"
                onClick={() => onNavigate(1)}
              >
                <ChevronRight size={16} aria-hidden="true" />
              </button>
            </>
          )}
        </div>
      </section>
    </main>
  );
}

function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function createNativeSubscriptionsPageReader() {
  return {
    async read() {
      let capture: SubscriptionPageCapture;

      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const encodedCapture = await invoke<string>("request_subscription_capture");
        capture = JSON.parse(encodedCapture) as SubscriptionPageCapture;
      } catch {
        throw new AuthenticationRequiredError();
      }

      return parseSubscriptionPageCapture(capture);
    }
  };
}

export default function App() {
  const nativeRuntime = useMemo(isTauriRuntime, []);
  const monitor = useMemo(
    () =>
      createQuotaMonitor({
        reader: nativeRuntime
          ? createNativeSubscriptionsPageReader()
          : createHtmlSubscriptionsPageReader(async () => previewSubscriptionsPageHtml)
      }),
    [nativeRuntime]
  );
  const [state, setState] = useState<QuotaMonitorState>(() => monitor.getState());

  const openOfficialLogin = useCallback(async () => {
    if (!nativeRuntime) {
      return;
    }

    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("open_official_login");
  }, [nativeRuntime]);

  useEffect(() => {
    const unsubscribe = monitor.subscribe(setState);
    void monitor.start();

    return unsubscribe;
  }, [monitor]);

  useEffect(() => {
    if (!nativeRuntime) {
      return;
    }

    let disposed = false;
    let unlisten: (() => void) | undefined;

    void import("@tauri-apps/api/event").then(async ({ listen }) => {
      const stopListening = await listen("subscriptions-captured", () => {
        void monitor.refresh();
      });

      if (disposed) {
        stopListening();
      } else {
        unlisten = stopListening;
      }
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [monitor, nativeRuntime]);

  return (
    <WaterlineOverlay
      state={state}
      onNavigate={(offset) => monitor.selectAdjacentSupportedSubscription(offset)}
      onLogin={nativeRuntime ? () => void openOfficialLogin() : undefined}
    />
  );
}
