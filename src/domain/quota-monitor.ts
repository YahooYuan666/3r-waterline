export type SubscriptionStatus = "supported" | "unsupported" | "inactive";

export interface Money {
  amount: number;
  currency: string;
}

export interface PeriodQuota {
  remainingAmount: Money;
  limit: Money;
  resetCountdown: string;
}

export interface QuotaSnapshot {
  weekly: PeriodQuota;
  monthly: PeriodQuota;
}

interface SubscriptionBase {
  id: string;
  name: string;
}

export interface SupportedSubscription extends SubscriptionBase {
  status: "supported";
  quotaSnapshot: QuotaSnapshot;
}

export interface UnsupportedSubscription extends SubscriptionBase {
  status: "unsupported";
}

export interface InactiveSubscription extends SubscriptionBase {
  status: "inactive";
}

export type Subscription =
  | SupportedSubscription
  | UnsupportedSubscription
  | InactiveSubscription;

export interface SubscriptionReadResult {
  subscriptions: Subscription[];
}

export interface SubscriptionsPageReader {
  read(): Promise<SubscriptionReadResult>;
}

export class SchemaMismatchError extends Error {
  constructor() {
    super("The subscriptions page does not match the expected schema.");
    this.name = "SchemaMismatchError";
  }
}

export class AuthenticationRequiredError extends Error {
  constructor() {
    super("A valid 3R login is required before reading subscriptions.");
    this.name = "AuthenticationRequiredError";
  }
}

export interface Clock {
  now(): Date;
}

export type QuotaMonitorState =
  | {
      kind: "verified";
      selectedSubscriptionId: string;
      subscriptions: Subscription[];
      lastAttemptAt: Date;
      lastVerifiedAt: Date;
      freshness: "current" | "update-failed";
      updateFailure: "authentication-required" | "read-failed" | "schema-mismatch" | undefined;
    }
  | {
      kind: "unverified";
      reason:
        | "starting"
        | "authentication-required"
        | "no-supported-subscription"
        | "read-failed"
        | "schema-mismatch";
      subscriptions: Subscription[];
      selectedSubscriptionId: string | undefined;
      lastAttemptAt: Date | undefined;
    };

export interface QuotaMonitor {
  getState(): QuotaMonitorState;
  subscribe(listener: (state: QuotaMonitorState) => void): () => void;
  start(): Promise<QuotaMonitorState>;
  refresh(): Promise<QuotaMonitorState>;
  selectAdjacentSupportedSubscription(offset: -1 | 1): QuotaMonitorState;
}

const systemClock: Clock = {
  now: () => new Date()
};

export function createQuotaMonitor({
  reader,
  clock = systemClock
}: {
  reader: SubscriptionsPageReader;
  clock?: Clock;
}): QuotaMonitor {
  let state: QuotaMonitorState = {
    kind: "unverified",
    reason: "starting",
    subscriptions: [],
    selectedSubscriptionId: undefined,
    lastAttemptAt: undefined
  };
  const listeners = new Set<(nextState: QuotaMonitorState) => void>();
  let readInFlight: Promise<QuotaMonitorState> | undefined;

  function publish(nextState: QuotaMonitorState) {
    state = nextState;
    listeners.forEach((listener) => listener(state));
    return state;
  }

  function selectSubscriptionId(subscriptions: Subscription[], defaultToSupported: boolean) {
    const existingSelection = state.selectedSubscriptionId;

    if (existingSelection != null && subscriptions.some((item) => item.id === existingSelection)) {
      return existingSelection;
    }

    if (defaultToSupported) {
      return subscriptions.find((item) => item.status === "supported")?.id;
    }

    return subscriptions[0]?.id;
  }

  async function performRead(): Promise<QuotaMonitorState> {
    const attemptedAt = clock.now();

    try {
      const { subscriptions } = await reader.read();
      const selectedSubscription = subscriptions.find(
        (subscription) => subscription.status === "supported"
      );

      if (selectedSubscription == null) {
        return publish({
          kind: "unverified",
          reason: "no-supported-subscription",
          subscriptions,
          selectedSubscriptionId: selectSubscriptionId(subscriptions, false),
          lastAttemptAt: attemptedAt
        });
      }

      return publish({
        kind: "verified",
        selectedSubscriptionId: selectSubscriptionId(subscriptions, true) ?? selectedSubscription.id,
        subscriptions,
        lastAttemptAt: attemptedAt,
        lastVerifiedAt: attemptedAt,
        freshness: "current",
        updateFailure: undefined
      });
    } catch (error) {
      const failureReason =
        error instanceof SchemaMismatchError
          ? "schema-mismatch"
          : error instanceof AuthenticationRequiredError
            ? "authentication-required"
            : "read-failed";

      if (state.kind === "verified") {
        return publish({
          ...state,
          lastAttemptAt: attemptedAt,
          freshness: "update-failed",
          updateFailure: failureReason
        });
      }

      return publish({
        kind: "unverified",
        reason: failureReason,
        subscriptions: state.subscriptions,
        selectedSubscriptionId: state.selectedSubscriptionId,
        lastAttemptAt: attemptedAt
      });
    }
  }

  function readSubscriptions(): Promise<QuotaMonitorState> {
    if (readInFlight != null) {
      return readInFlight;
    }

    readInFlight = performRead().finally(() => {
      readInFlight = undefined;
    });

    return readInFlight;
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      listener(state);

      return () => listeners.delete(listener);
    },
    start: readSubscriptions,
    refresh: readSubscriptions,
    selectAdjacentSupportedSubscription(offset) {
      const supportedSubscriptions = state.subscriptions.filter(
        (subscription): subscription is SupportedSubscription => subscription.status === "supported"
      );

      if (supportedSubscriptions.length < 2) {
        return state;
      }

      const currentIndex = Math.max(
        0,
        supportedSubscriptions.findIndex(
          (subscription) => subscription.id === state.selectedSubscriptionId
        )
      );
      const nextIndex =
        (currentIndex + offset + supportedSubscriptions.length) % supportedSubscriptions.length;

      return publish({
        ...state,
        selectedSubscriptionId: supportedSubscriptions[nextIndex].id
      });
    }
  };
}
