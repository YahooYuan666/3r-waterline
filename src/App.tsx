import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";
import {
  createQuotaMonitor,
  type Money,
  type PeriodQuota,
  type QuotaMonitorState,
  type SupportedSubscription,
  type SubscriptionsPageReader,
  type SubscriptionReadResult
} from "./domain/quota-monitor";

const simulatedSubscriptions: SubscriptionReadResult = {
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
    },
    {
      id: "future-plan",
      name: "其他方案",
      status: "unsupported"
    },
    {
      id: "expired-plan",
      name: "历史订阅",
      status: "inactive"
    }
  ]
};

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

function createSimulatedSubscriptionsPageReader(): SubscriptionsPageReader {
  return {
    async read() {
      return simulatedSubscriptions;
    }
  };
}

function statusText(state: QuotaMonitorState) {
  if (state.kind === "unverified") {
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
    return state.updateFailure === "schema-mismatch" ? "订阅页面格式已变更" : "上次更新失败";
  }

  return "额度暂不可用";
}

interface WaterlineOverlayProps {
  state: QuotaMonitorState;
  onNavigate: (offset: -1 | 1) => void;
}

export function WaterlineOverlay({ state, onNavigate }: WaterlineOverlayProps) {
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
              <MoreHorizontal size={30} aria-hidden="true" />
              <p aria-live="polite">{statusText(state)}</p>
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

export default function App() {
  const monitor = useMemo(
    () => createQuotaMonitor({ reader: createSimulatedSubscriptionsPageReader() }),
    []
  );
  const [state, setState] = useState<QuotaMonitorState>(() => monitor.getState());

  useEffect(() => {
    const unsubscribe = monitor.subscribe(setState);
    void monitor.start();

    return unsubscribe;
  }, [monitor]);

  return (
    <WaterlineOverlay
      state={state}
      onNavigate={(offset) => monitor.selectAdjacentSupportedSubscription(offset)}
    />
  );
}
