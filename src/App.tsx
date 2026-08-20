import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";
import {
  createQuotaMonitor,
  type Money,
  type PeriodQuota,
  type QuotaMonitorState,
  type Subscription,
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

function formatMoney(money: Money) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: money.currency,
    minimumFractionDigits: 2
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

function statusText(state: QuotaMonitorState, subscription: Subscription | undefined) {
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

  if (subscription?.status === "unsupported") {
    return "此订阅暂不支持";
  }

  if (subscription?.status === "inactive") {
    return "订阅已失效";
  }

  return "模拟额度";
}

interface WaterlineOverlayProps {
  state: QuotaMonitorState;
  onNavigate: (offset: -1 | 1) => void;
}

export function WaterlineOverlay({ state, onNavigate }: WaterlineOverlayProps) {
  const subscriptions = state.subscriptions;
  const selectedIndex = Math.max(
    0,
    subscriptions.findIndex((subscription) => subscription.id === state.selectedSubscriptionId)
  );
  const selectedSubscription = subscriptions[selectedIndex];
  const quotaSnapshot =
    selectedSubscription?.status === "supported" ? selectedSubscription.quotaSnapshot : undefined;

  return (
    <main className="waterline-stage">
      <section className="waterline-overlay" aria-label="3R 剩余额度悬浮窗预览">
        <header className="overlay-header">
          <div>
            <p className="product-name">3R 水位</p>
            <p className="status-copy" aria-live="polite">
              {statusText(state, selectedSubscription)}
            </p>
          </div>
        </header>

        <div className="subscription-nav">
          <button
            className="icon-button"
            type="button"
            title="上一项订阅"
            aria-label="上一项订阅"
            onClick={() => onNavigate(-1)}
            disabled={subscriptions.length < 2}
          >
            <ChevronLeft size={18} aria-hidden="true" />
          </button>
          <div className="subscription-name">
            <span>{selectedSubscription?.name ?? "读取中"}</span>
            {subscriptions.length > 1 && <small>{selectedIndex + 1} / {subscriptions.length}</small>}
          </div>
          <button
            className="icon-button"
            type="button"
            title="下一项订阅"
            aria-label="下一项订阅"
            onClick={() => onNavigate(1)}
            disabled={subscriptions.length < 2}
          >
            <ChevronRight size={18} aria-hidden="true" />
          </button>
        </div>

        {quotaSnapshot ? (
          <>
            <div className="quota-vessel" aria-label="周额度和月额度的剩余水位">
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
            </div>

            <div className="quota-values">
              <div className="quota-value weekly-value">
                <span>周</span>
                <strong>{formatMoney(quotaSnapshot.weekly.remainingAmount)}</strong>
                <small>剩余 / {formatMoney(quotaSnapshot.weekly.limit)}</small>
                <em>{quotaSnapshot.weekly.resetCountdown} 后重置</em>
              </div>
              <div className="quota-value monthly-value">
                <span>月</span>
                <strong>{formatMoney(quotaSnapshot.monthly.remainingAmount)}</strong>
                <small>剩余 / {formatMoney(quotaSnapshot.monthly.limit)}</small>
                <em>{quotaSnapshot.monthly.resetCountdown} 后重置</em>
              </div>
            </div>
          </>
        ) : (
          <div className="empty-vessel">
            <MoreHorizontal size={30} aria-hidden="true" />
            <p>{statusText(state, selectedSubscription)}</p>
          </div>
        )}
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
      onNavigate={(offset) => monitor.selectAdjacentSubscription(offset)}
    />
  );
}
