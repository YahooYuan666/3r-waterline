import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent } from "react";
import { ChevronLeft, ChevronRight, LogIn, MoreHorizontal, Settings } from "lucide-react";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  AuthenticationRequiredError,
  createQuotaMonitor,
  type Money,
  type PeriodQuota,
  type QuotaSnapshot,
  type QuotaMonitorState,
  type SupportedSubscription
} from "./domain/quota-monitor";
import {
  createHtmlSubscriptionsPageReader,
  parseSubscriptionPageCapture,
  type SubscriptionPageCapture
} from "./domain/subscription-page-parser";
import { previewSubscriptionsPageHtml } from "./domain/subscription-page-preview";
import { isPointerNearEdge, resolveEdgeHidePlacement, type EdgeHidePlacement } from "./domain/edge-hide";
import { clampWindowPosition, fitWindowSize, resolveTrafficOverlayHeight } from "./domain/window-geometry";

function formatMoney(money: Money, fractionDigits = 2) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: money.currency,
    useGrouping: false,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits
  }).format(money.amount);
}

function formatResetLabel(resetCountdown: string, compact: boolean) {
  return compact
    ? `${resetCountdown.replace(/\s+/g, "")}后重置`
    : `${resetCountdown} 后重置`;
}

function remainingPercentage(period: PeriodQuota) {
  return Math.max(0, Math.min(100, (period.remainingAmount.amount / period.limit.amount) * 100));
}

type DisplayMode = "vessel" | "traffic";
type UiScale = "large" | "medium" | "small";
type EdgeHideEdge = "left" | "right" | "top" | "bottom";

const DISPLAY_MODE_KEY = "3r-waterline-display-mode";
const UI_SCALE_KEY = "3r-waterline-ui-scale";
const EDGE_HIDE_KEY = "3r-waterline-edge-hide";
const AUTO_CYCLE_KEY = "3r-waterline-auto-cycle-ms";
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const AUTO_CYCLE_OPTIONS = [0, 30_000, 60_000, 300_000, 600_000] as const;
const EDGE_METER_SEGMENTS = 10;

function readDisplayMode(): DisplayMode {
  if (typeof window === "undefined") {
    return "vessel";
  }

  return window.localStorage.getItem(DISPLAY_MODE_KEY) === "traffic" ? "traffic" : "vessel";
}

function readBooleanPreference(key: string, fallback: boolean) {
  if (typeof window === "undefined") {
    return fallback;
  }

  const value = window.localStorage.getItem(key);
  return value == null ? fallback : value === "true";
}

function readUiScale(): UiScale {
  if (typeof window === "undefined") {
    return "large";
  }

  const value = window.localStorage.getItem(UI_SCALE_KEY);
  return value === "small" || value === "medium" ? value : "large";
}

function readAutoCycleInterval() {
  if (typeof window === "undefined") {
    return 0;
  }

  const value = Number(window.localStorage.getItem(AUTO_CYCLE_KEY));
  return AUTO_CYCLE_OPTIONS.includes(value as (typeof AUTO_CYCLE_OPTIONS)[number]) ? value : 0;
}

function autoCycleLabel(intervalMs: number) {
  if (intervalMs === 0) {
    return "关闭";
  }

  if (intervalMs < 60_000) {
    return `${intervalMs / 1000} 秒`;
  }

  return `${intervalMs / 60_000} 分钟`;
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
  onOpenSettings?: () => void;
  onHide?: () => void;
  onDisplayModeChange?: (mode: DisplayMode) => void;
  onRestoreEdgeHide?: () => void;
  onDragStart?: (event: MouseEvent<HTMLElement>) => void;
  onOpenNativeContextMenu?: () => void;
  displayMode?: DisplayMode;
  uiScale?: UiScale;
  edgeHidden?: boolean;
  edgeHideEdge?: EdgeHideEdge;
  onEdgeMouseLeave?: () => void;
  onEdgeMouseEnter?: () => void;
  autoCycleIntervalMs?: number;
  loginError?: string;
}

export function WaterlineOverlay({
  state,
  onNavigate,
  onLogin,
  onOpenSettings,
  onHide,
  onDisplayModeChange,
  onRestoreEdgeHide,
  onDragStart,
  onOpenNativeContextMenu,
  displayMode = "vessel",
  uiScale = "large",
  edgeHidden = false,
  edgeHideEdge = "right",
  onEdgeMouseLeave,
  onEdgeMouseEnter,
  loginError
}: WaterlineOverlayProps) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number }>();
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
  const canLogin =
    state.kind === "unverified" &&
    (state.reason === "starting" || state.reason === "authentication-required") &&
    onLogin != null;

  const closeContextMenu = (action?: () => void) => {
    setContextMenu(undefined);
    action?.();
  };

  const openContextMenu = (event: MouseEvent<HTMLElement>) => {
    event.preventDefault();
    if (onOpenNativeContextMenu != null) {
      onOpenNativeContextMenu();
      return;
    }

    setContextMenu({ x: event.clientX, y: event.clientY });
  };

  return (
    <main
      className={`waterline-stage display-mode-${displayMode} ui-scale-${uiScale}${edgeHidden ? ` edge-hidden edge-hidden-${edgeHideEdge}` : ""}`}
      onContextMenu={edgeHidden ? undefined : openContextMenu}
      onClick={() => setContextMenu(undefined)}
      onMouseEnter={onEdgeMouseEnter}
      onMouseLeave={edgeHidden ? undefined : onEdgeMouseLeave}
    >
      <section
        className={displayMode === "traffic" ? "waterline-overlay traffic-mode" : "waterline-overlay"}
        aria-label={edgeHidden ? "3R 剩余额度贴边标签" : "3R 剩余额度悬浮窗预览"}
      >
        {edgeHidden ? (
          <button
            type="button"
            className="edge-hide-tab"
            aria-label="展开悬浮窗"
            onMouseEnter={onRestoreEdgeHide}
            onClick={onRestoreEdgeHide}
          >
            <EdgeHideMeter quotaSnapshot={quotaSnapshot} />
          </button>
        ) : (
          <>
            <SubscriptionHeader
              name={selectedSubscription?.name}
              showNavigation={supportedSubscriptions.length > 1}
              onNavigate={onNavigate}
            />
            <div
              className={`${displayMode === "traffic" ? "quota-vessel traffic-monitor" : "quota-vessel"}${quotaSnapshot == null ? " empty-quota-state" : ""} ui-scale-${uiScale}`}
              aria-label={
                quotaSnapshot
                  ? displayMode === "traffic"
                    ? "周额度和月额度的剩余额度"
                    : "周额度和月额度的剩余水位"
                  : statusText(state)
              }
              onMouseDown={onDragStart}
            >
            {quotaSnapshot ? (
              displayMode === "traffic" ? (
                <div className="traffic-bars">
                  {quotaSnapshot.weekly && (
                    <TrafficBar periodLabel="周" period={quotaSnapshot.weekly} tone="weekly" compact={uiScale !== "large"} />
                  )}
                  {quotaSnapshot.monthly && (
                    <TrafficBar periodLabel="月" period={quotaSnapshot.monthly} tone="monthly" compact={uiScale !== "large"} />
                  )}
                  {stateNotice && <p className="traffic-notice">{stateNotice}</p>}
                </div>
              ) : (
                <>
                  {quotaSnapshot.weekly && (
                    <div
                      className={`water-fill weekly-fill${quotaSnapshot.monthly ? "" : " single-fill"}`}
                      style={{ height: `${remainingPercentage(quotaSnapshot.weekly)}%` }}
                    />
                  )}
                  {quotaSnapshot.monthly && (
                    <div
                      className={`water-fill monthly-fill${quotaSnapshot.weekly ? "" : " single-fill"}`}
                      style={{ height: `${remainingPercentage(quotaSnapshot.monthly)}%` }}
                    />
                  )}
                  {quotaSnapshot.weekly && quotaSnapshot.monthly && <div className="vessel-divider" />}
                  <div className="vessel-gloss" />
                  <div className={`quota-content${quotaSnapshot.weekly && quotaSnapshot.monthly ? "" : " single-period"}`}>
                    {quotaSnapshot.weekly && (
                      <QuotaPeriod periodLabel="周" period={quotaSnapshot.weekly} tone="weekly" compact={uiScale !== "large"} />
                    )}
                    {quotaSnapshot.monthly && (
                      <QuotaPeriod periodLabel="月" period={quotaSnapshot.monthly} tone="monthly" compact={uiScale !== "large"} />
                    )}
                  </div>
                  {stateNotice && (
                    <p className="state-notice" aria-live="polite">
                      {stateNotice}
                    </p>
                  )}
                </>
              )
            ) : (
              <div className="empty-vessel">
                {canLogin ? <LogIn size={30} aria-hidden="true" /> : <MoreHorizontal size={30} aria-hidden="true" />}
                <p aria-live="polite">{loginError ?? statusText(state)}</p>
                {canLogin && onLogin && (
                  <button className="empty-vessel-login" type="button" onClick={onLogin}>
                    <LogIn size={15} aria-hidden="true" />
                    <span>登录 3R</span>
                  </button>
                )}
              </div>
            )}

            </div>
          </>
        )}
      </section>
      {contextMenu && (
        <div
          className="context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          role="menu"
          onClick={(event) => event.stopPropagation()}
        >
          <button type="button" role="menuitem" onClick={() => closeContextMenu(onOpenSettings)}>
            <Settings size={14} aria-hidden="true" />
            <span>设置</span>
          </button>
          <div className="context-menu-separator" role="separator" />
          <button
            type="button"
            role="menuitem"
            onClick={() => closeContextMenu(() => onDisplayModeChange?.("vessel"))}
          >
            <span>圆形水瓶</span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => closeContextMenu(() => onDisplayModeChange?.("traffic"))}
          >
            <span>Traffic Monitor 横条</span>
          </button>
          <div className="context-menu-separator" role="separator" />
          <button
            type="button"
            role="menuitem"
            onClick={() => closeContextMenu(onHide)}
          >
            <span>隐藏悬浮窗</span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => closeContextMenu(async () => {
              const { invoke } = await import("@tauri-apps/api/core");
              await invoke("quit_app");
            })}
          >
            <span>退出 3R 水位</span>
          </button>
        </div>
      )}
    </main>
  );
}

function TrafficBar({
  periodLabel,
  period,
  tone,
  compact
}: {
  periodLabel: string;
  period: PeriodQuota;
  tone: "weekly" | "monthly";
  compact: boolean;
}) {
  return (
    <div className={`traffic-bar-row ${tone}-traffic`}>
      <div className="traffic-bar-fill" style={{ width: `${remainingPercentage(period)}%` }} />
      <div className={`traffic-bar-copy${compact ? " compact" : ""}`}>
        <strong>{periodLabel}</strong>
        <span>
          {formatMoney(period.remainingAmount)} /{formatMoney(period.limit, 0)}
        </span>
        {period.resetCountdown && <em>{formatResetLabel(period.resetCountdown, compact)}</em>}
      </div>
    </div>
  );
}

function SubscriptionHeader({
  name,
  showNavigation,
  onNavigate
}: {
  name?: string;
  showNavigation: boolean;
  onNavigate: (offset: -1 | 1) => void;
}) {
  return (
    <div className="subscription-header" aria-label={name ? `当前订阅：${name}` : "当前订阅"}>
      {showNavigation ? (
        <button
          className="subscription-nav subscription-nav-previous"
          type="button"
          title="上一项订阅"
          aria-label="上一项订阅"
          onClick={() => onNavigate(-1)}
        >
          <ChevronLeft size={14} aria-hidden="true" />
        </button>
      ) : (
        <span className="subscription-nav-placeholder" aria-hidden="true" />
      )}
      <strong>{name ?? "未选择订阅"}</strong>
      {showNavigation ? (
        <button
          className="subscription-nav subscription-nav-next"
          type="button"
          title="下一项订阅"
          aria-label="下一项订阅"
          onClick={() => onNavigate(1)}
        >
          <ChevronRight size={14} aria-hidden="true" />
        </button>
      ) : (
        <span className="subscription-nav-placeholder" aria-hidden="true" />
      )}
    </div>
  );
}

function QuotaPeriod({
  periodLabel,
  period,
  tone,
  compact
}: {
  periodLabel: string;
  period: PeriodQuota;
  tone: "weekly" | "monthly";
  compact: boolean;
}) {
  return (
    <div className={`quota-period ${tone}-period`}>
      <span>{periodLabel}</span>
      <p className="amount-line">
        <strong>{formatMoney(period.remainingAmount)}</strong>
        <small>/{formatMoney(period.limit, 0)}</small>
      </p>
      {period.resetCountdown && <em>{formatResetLabel(period.resetCountdown, compact)}</em>}
    </div>
  );
}

function EdgeHideMeter({ quotaSnapshot }: { quotaSnapshot?: QuotaSnapshot }) {
  const tracks = [
    { period: quotaSnapshot?.weekly, tone: "weekly" },
    { period: quotaSnapshot?.monthly, tone: "monthly" }
  ].filter((track): track is { period: PeriodQuota; tone: "weekly" | "monthly" } => track.period != null);

  return (
    <span className="edge-hide-meter" aria-hidden="true">
      {tracks.map(({ period, tone }) => {
        const activeDots = Math.max(
          0,
          Math.min(EDGE_METER_SEGMENTS, Math.ceil((remainingPercentage(period) / 100) * EDGE_METER_SEGMENTS))
        );
        return (
          <span className={`edge-meter-track ${tone}`} key={tone}>
            {Array.from({ length: EDGE_METER_SEGMENTS }, (_, index) => (
              <i className={index < activeDots ? "edge-meter-dot active" : "edge-meter-dot"} key={index} />
            ))}
          </span>
        );
      })}
    </span>
  );
}

function isTauriRuntime() {
  return isTauri();
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
  const [loginError, setLoginError] = useState<string>();
  const [loginOpen, setLoginOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsOpenRef = useRef(false);
  const loginOpenRef = useRef(false);
  const [displayMode, setDisplayMode] = useState<DisplayMode>(readDisplayMode);
  const [uiScale, setUiScale] = useState<UiScale>(readUiScale);
  const [autoCycleIntervalMs, setAutoCycleIntervalMs] = useState(readAutoCycleInterval);
  const [autoStartEnabled, setAutoStartEnabled] = useState(false);
  const [autoStartBusy, setAutoStartBusy] = useState(false);
  const [autoStartError, setAutoStartError] = useState<string>();
  const [edgeHideEnabled, setEdgeHideEnabled] = useState(() => readBooleanPreference(EDGE_HIDE_KEY, true));
  const [edgeHidden, setEdgeHidden] = useState(false);
  const [edgeHideEdge, setEdgeHideEdge] = useState<EdgeHideEdge>("right");
  const edgeHideRef = useRef<{
    hidden: boolean;
    placement?: EdgeHidePlacement;
    restoredFromEdge: boolean;
    suppressMovedUntil: number;
  }>({ hidden: false, restoredFromEdge: false, suppressMovedUntil: 0 });
  const edgeRestorePromiseRef = useRef<Promise<void> | undefined>(undefined);
  const edgeLeaveTimerRef = useRef<number | undefined>(undefined);
  const edgeDockPollTimerRef = useRef<number | undefined>(undefined);
  const edgeDockGraceUntilRef = useRef(0);
  const windowClampTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    window.localStorage.setItem(DISPLAY_MODE_KEY, displayMode);
  }, [displayMode]);

  useEffect(() => {
    window.localStorage.setItem(UI_SCALE_KEY, uiScale);
  }, [uiScale]);

  useEffect(() => {
    window.localStorage.setItem(EDGE_HIDE_KEY, String(edgeHideEnabled));
  }, [edgeHideEnabled]);

  useEffect(() => {
    window.localStorage.setItem(AUTO_CYCLE_KEY, String(autoCycleIntervalMs));
  }, [autoCycleIntervalMs]);

  const resizeOverlay = useCallback(async (mode: DisplayMode, scale: UiScale = uiScale) => {
    if (!nativeRuntime) {
      return;
    }

    const { getCurrentWindow, LogicalSize } = await import("@tauri-apps/api/window");
    const window = getCurrentWindow();
    const sizes: Record<UiScale, { width: number; height: number }> = mode === "traffic"
      ? {
          large: { width: 240, height: 116 },
          medium: { width: 200, height: 100 },
          small: { width: 164, height: 84 }
        }
      : {
          large: { width: 224, height: 248 },
          medium: { width: 180, height: 200 },
          small: { width: 144, height: 162 }
        };
    const size = sizes[scale];
    await window.setSize(new LogicalSize(size.width, size.height));
  }, [nativeRuntime, uiScale]);

  const keepWindowInsideWorkArea = useCallback(async () => {
    if (!nativeRuntime) {
      return;
    }

    const { currentMonitor, getCurrentWindow, PhysicalPosition, PhysicalSize, primaryMonitor } = await import("@tauri-apps/api/window");
    const window = getCurrentWindow();
    const [monitor, position, size] = await Promise.all([
      currentMonitor().then((monitor) => monitor ?? primaryMonitor()),
      window.outerPosition(),
      window.outerSize()
    ]);
    if (monitor == null) {
      return;
    }

    const fittedSize = fitWindowSize(size, monitor.workArea);
    if (fittedSize.width !== size.width || fittedSize.height !== size.height) {
      await window.setSize(new PhysicalSize(fittedSize.width, fittedSize.height));
    }

    const clamped = clampWindowPosition(position, fittedSize, monitor.workArea);
    if (clamped.x !== position.x || clamped.y !== position.y) {
      await window.setPosition(new PhysicalPosition(clamped.x, clamped.y));
    }
  }, [nativeRuntime]);

  const stopEdgeDockPolling = useCallback(() => {
    if (edgeDockPollTimerRef.current != null) {
      window.clearInterval(edgeDockPollTimerRef.current);
      edgeDockPollTimerRef.current = undefined;
    }
  }, []);

  const hideDockedEdgeIfStillAttached = useCallback(async () => {
    const edgeHide = edgeHideRef.current;
    const placement = edgeHide.placement;
    if (
      !nativeRuntime ||
      !edgeHideEnabled ||
      settingsOpenRef.current ||
      loginOpenRef.current ||
      edgeHide.hidden ||
      !edgeHide.restoredFromEdge ||
      placement == null ||
      Date.now() < edgeDockGraceUntilRef.current
    ) {
      return;
    }

    const stage = document.querySelector(".waterline-stage");
    if (stage?.matches(":hover")) {
      return;
    }

    const { currentMonitor, cursorPosition, getCurrentWindow, PhysicalPosition } = await import("@tauri-apps/api/window");
    const appWindow = getCurrentWindow();
    const [monitor, position, size] = await Promise.all([
      currentMonitor(),
      appWindow.outerPosition(),
      appWindow.outerSize()
    ]);
    if (monitor != null) {
      try {
        const pointer = await cursorPosition();
        if (isPointerNearEdge(pointer, monitor.workArea, placement.edge, undefined, {
          position,
          size
        })) {
          // Keep the expanded window visible while the pointer is still in
          // the screen-edge activation corridor. Hiding here would place the
          // tab directly under the pointer and cause a visible flash loop.
          return;
        }
      } catch {
        // Cursor position is an optional guard; the existing DOM hover check
        // remains sufficient on platforms that do not expose it.
      }
    }
    const stillAttached =
      Math.abs(position.x - placement.restoredPosition.x) <= 8 &&
      Math.abs(position.y - placement.restoredPosition.y) <= 8;

    if (!stillAttached) {
      edgeHide.restoredFromEdge = false;
      stopEdgeDockPolling();
      return;
    }

    edgeHide.hidden = true;
    edgeHide.restoredFromEdge = false;
    stopEdgeDockPolling();
    setEdgeHideEdge(placement.edge);
    setEdgeHidden(true);
    await appWindow.setPosition(new PhysicalPosition(placement.hiddenPosition.x, placement.hiddenPosition.y));
  }, [edgeHideEnabled, loginOpen, nativeRuntime, settingsOpen, stopEdgeDockPolling]);

  const startEdgeDockPolling = useCallback(() => {
    stopEdgeDockPolling();
    edgeDockPollTimerRef.current = window.setInterval(() => {
      void hideDockedEdgeIfStillAttached();
    }, 180);
  }, [hideDockedEdgeIfStillAttached, stopEdgeDockPolling]);

  const restoreEdgeHide = useCallback(async (dockAfterRestore = true) => {
    if (edgeRestorePromiseRef.current != null) {
      await edgeRestorePromiseRef.current;
      return;
    }

    const placement = edgeHideRef.current.placement;
    if (!nativeRuntime || !edgeHideRef.current.hidden || placement == null) {
      return;
    }

    const restorePromise = (async () => {
      const { getCurrentWindow, PhysicalPosition } = await import("@tauri-apps/api/window");
      const edgeHide = edgeHideRef.current;
      stopEdgeDockPolling();
      edgeHide.restoredFromEdge = dockAfterRestore;
      edgeHide.suppressMovedUntil = Date.now() + 500;
      edgeDockGraceUntilRef.current = dockAfterRestore ? Date.now() + 500 : 0;
      // Keep the hidden state until the native move completes. This prevents
      // a concurrent system-menu action from resizing the still-hidden tab.
      await getCurrentWindow().setPosition(new PhysicalPosition(
        placement.restoredPosition.x,
        placement.restoredPosition.y
      ));
      edgeHide.hidden = false;
      edgeHide.restoredFromEdge = dockAfterRestore;
      setEdgeHidden(false);
      if (dockAfterRestore) {
        startEdgeDockPolling();
      }
    })();
    edgeRestorePromiseRef.current = restorePromise;
    try {
      await restorePromise;
    } finally {
      if (edgeRestorePromiseRef.current === restorePromise) {
        edgeRestorePromiseRef.current = undefined;
      }
    }
  }, [nativeRuntime, startEdgeDockPolling, stopEdgeDockPolling]);

  const hideAtEdgeIfNeeded = useCallback(async () => {
    if (
      !nativeRuntime ||
      settingsOpenRef.current ||
      loginOpenRef.current ||
      edgeHideRef.current.hidden ||
      Date.now() < edgeHideRef.current.suppressMovedUntil
    ) {
      return;
    }

    if (!edgeHideEnabled) {
      edgeHideRef.current.restoredFromEdge = false;
      return;
    }

    const { currentMonitor, getCurrentWindow, PhysicalPosition } = await import("@tauri-apps/api/window");
    const window = getCurrentWindow();
    const [monitor, position, size] = await Promise.all([
      currentMonitor(),
      window.outerPosition(),
      window.outerSize()
    ]);
    if (monitor == null) {
      return;
    }

    const placement = resolveEdgeHidePlacement(position, size, monitor.workArea);
    if (edgeHideRef.current.restoredFromEdge) {
      const restoredPlacement = edgeHideRef.current.placement;
      const stillAttached =
        restoredPlacement != null &&
        Math.abs(position.x - restoredPlacement.restoredPosition.x) <= 8 &&
        Math.abs(position.y - restoredPlacement.restoredPosition.y) <= 8;
      if (stillAttached) {
        return;
      }

      // The user has moved the restored overlay clear of the edge. A later
      // drag back to an edge is now eligible to enter Edge Hide again.
      edgeHideRef.current.restoredFromEdge = false;
    }
    if (placement == null) {
      return;
    }

    edgeHideRef.current.hidden = true;
    edgeHideRef.current.placement = placement;
    edgeHideRef.current.restoredFromEdge = false;
    stopEdgeDockPolling();
    setEdgeHideEdge(placement.edge);
    setEdgeHidden(true);
    await window.setPosition(new PhysicalPosition(placement.hiddenPosition.x, placement.hiddenPosition.y));
  }, [edgeHideEnabled, loginOpen, nativeRuntime, settingsOpen, stopEdgeDockPolling]);

  const onEdgeMouseEnter = useCallback(() => {
    if (edgeLeaveTimerRef.current != null) {
      window.clearTimeout(edgeLeaveTimerRef.current);
      edgeLeaveTimerRef.current = undefined;
    }
  }, []);

  const onEdgeMouseLeave = useCallback(() => {
    if (edgeLeaveTimerRef.current != null) {
      window.clearTimeout(edgeLeaveTimerRef.current);
    }

    edgeLeaveTimerRef.current = window.setTimeout(() => {
      edgeLeaveTimerRef.current = undefined;
      void hideDockedEdgeIfStillAttached();
    }, 280);
  }, [hideDockedEdgeIfStillAttached]);

  const closeLogin = useCallback(async () => {
    loginOpenRef.current = false;
    setLoginOpen(false);
    await resizeOverlay(displayMode, uiScale);
  }, [displayMode, resizeOverlay, uiScale]);

  const openSettings = useCallback(async () => {
    settingsOpenRef.current = true;
    await restoreEdgeHide(false);
    edgeHideRef.current.restoredFromEdge = false;
    setSettingsOpen(true);
    if (nativeRuntime) {
      const { getCurrentWindow, LogicalSize } = await import("@tauri-apps/api/window");
      const window = getCurrentWindow();
      await window.setSize(new LogicalSize(400, 460));
      await keepWindowInsideWorkArea();
    }
  }, [keepWindowInsideWorkArea, nativeRuntime, restoreEdgeHide]);

  const closeSettings = useCallback(async () => {
    settingsOpenRef.current = false;
    setSettingsOpen(false);
    await resizeOverlay(displayMode, uiScale);
  }, [displayMode, resizeOverlay, uiScale]);

  const openOfficialLogin = useCallback(async () => {
    if (!nativeRuntime) {
      return;
    }

    await restoreEdgeHide(false);
    edgeHideRef.current.restoredFromEdge = false;
    loginOpenRef.current = true;
    setLoginError(undefined);
    setLoginOpen(true);
    const { getCurrentWindow, LogicalSize } = await import("@tauri-apps/api/window");
    const window = getCurrentWindow();
    await window.setSize(new LogicalSize(400, 340));
    await keepWindowInsideWorkArea();
  }, [keepWindowInsideWorkArea, nativeRuntime, restoreEdgeHide]);

  const updateAutoStart = useCallback(async (enabled: boolean) => {
    if (!nativeRuntime || autoStartBusy) {
      return;
    }

    setAutoStartBusy(true);
    setAutoStartError(undefined);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const actual = await invoke<boolean>("set_auto_start", { enabled });
      setAutoStartEnabled(actual);
    } catch (error) {
      setAutoStartError(typeof error === "string" ? error : "无法更新开机自动启动");
    } finally {
      setAutoStartBusy(false);
    }
  }, [autoStartBusy, nativeRuntime]);

  const hideOverlay = useCallback(async () => {
    if (!nativeRuntime) {
      return;
    }

    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("hide_overlay");
  }, [nativeRuntime]);

  const startOverlayDrag = useCallback((event: MouseEvent<HTMLElement>) => {
    if (!nativeRuntime || event.button !== 0) {
      return;
    }

    const target = event.target;
    if (target instanceof HTMLElement && target.closest("button, input")) {
      return;
    }

    void getCurrentWindow().startDragging();
  }, [nativeRuntime]);

  const openNativeContextMenu = useCallback(() => {
    if (!nativeRuntime) {
      return;
    }

    void import("@tauri-apps/api/core").then(({ invoke }) => invoke("show_overlay_context_menu"));
  }, [nativeRuntime]);

  useEffect(() => {
    if (!settingsOpen && !loginOpen) {
      void resizeOverlay(displayMode, uiScale);
    }
  }, [displayMode, loginOpen, resizeOverlay, settingsOpen, uiScale]);

  useEffect(() => {
    if (!nativeRuntime || displayMode !== "traffic" || settingsOpen || loginOpen || edgeHidden) {
      return;
    }

    const overlay = document.querySelector<HTMLElement>(".waterline-overlay");
    if (overlay == null || typeof ResizeObserver === "undefined") {
      return;
    }

    let resizeInFlight = false;
    let disposed = false;
    const width = uiScale === "large" ? 240 : uiScale === "medium" ? 200 : 164;
    const emptyStateHeight = uiScale === "large" ? 164 : uiScale === "medium" ? 136 : 116;
    const hasVisibleQuota = state.kind === "verified" && state.subscriptions.some(
      (subscription) => subscription.status === "supported" &&
        (subscription.quotaSnapshot.weekly != null || subscription.quotaSnapshot.monthly != null)
    );
    const resizeToIntrinsicContent = async () => {
      if (disposed || resizeInFlight) {
        return;
      }

      const rect = overlay.getBoundingClientRect();
      const height = resolveTrafficOverlayHeight(rect.height, hasVisibleQuota ? 1 : emptyStateHeight);
      if (height <= 0) {
        return;
      }

      resizeInFlight = true;
      try {
        const { getCurrentWindow, LogicalSize } = await import("@tauri-apps/api/window");
        await getCurrentWindow().setSize(new LogicalSize(width, height));
      } finally {
        resizeInFlight = false;
      }
    };

    const observer = new ResizeObserver(() => void resizeToIntrinsicContent());
    observer.observe(overlay);
    void resizeToIntrinsicContent();

    return () => {
      disposed = true;
      observer.disconnect();
    };
  }, [displayMode, edgeHidden, loginOpen, nativeRuntime, settingsOpen, state, uiScale]);

  useEffect(() => {
    if (autoCycleIntervalMs <= 0) {
      return;
    }

    const timer = window.setInterval(() => {
      if (settingsOpenRef.current || loginOpenRef.current || edgeHideRef.current.hidden) {
        return;
      }

      const supportedCount = monitor
        .getState()
        .subscriptions.filter((subscription) => subscription.status === "supported").length;
      if (supportedCount > 1) {
        monitor.selectAdjacentSupportedSubscription(1);
      }
    }, autoCycleIntervalMs);

    return () => window.clearInterval(timer);
  }, [autoCycleIntervalMs, monitor]);

  const submitLogin = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!nativeRuntime || loginBusy) {
      return;
    }

    setLoginError(undefined);
    setLoginBusy(true);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const result = await invoke<{ auto_start_enabled: boolean }>("login_3r", { credentials: { email, password } });
      setAutoStartEnabled(result.auto_start_enabled);
      if (!result.auto_start_enabled) {
        setAutoStartError("登录成功，但无法启用开机自动启动");
      }
      setPassword("");
      loginOpenRef.current = false;
      setLoginOpen(false);
      await monitor.refresh();
      await resizeOverlay(displayMode);
    } catch (error) {
      console.error("Unable to sign in to 3R", error);
      setLoginError(typeof error === "string" ? error : "登录失败，请检查账号密码");
    } finally {
      setLoginBusy(false);
    }
  }, [displayMode, email, loginBusy, monitor, nativeRuntime, password, resizeOverlay]);

  useEffect(() => {
    const unsubscribe = monitor.subscribe(setState);
    void monitor.start();

    return unsubscribe;
  }, [monitor]);

  useEffect(() => {
    if (!nativeRuntime) {
      return;
    }

    const refreshIfDue = () => void monitor.refreshIfDue(REFRESH_INTERVAL_MS);
    const timer = window.setInterval(() => {
      refreshIfDue();
    }, REFRESH_INTERVAL_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshIfDue();
      }
    };

    window.addEventListener("focus", refreshIfDue);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshIfDue);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [monitor, nativeRuntime]);

  useEffect(() => {
    if (!nativeRuntime) {
      return;
    }

    let disposed = false;
    void import("@tauri-apps/api/core").then(async ({ invoke }) => {
      try {
        const enabled = await invoke<boolean>("auto_start_enabled");
        if (!disposed) {
          setAutoStartEnabled(enabled);
        }
      } catch {
        if (!disposed) {
          setAutoStartError("无法读取开机自动启动状态");
        }
      }
    });

    return () => {
      disposed = true;
    };
  }, [nativeRuntime]);

  useEffect(() => {
    if (!nativeRuntime) {
      return;
    }

    let disposed = false;
    let unlisten: (() => void) | undefined;
    let edgeTimer: number | undefined;

    void import("@tauri-apps/api/window").then(async ({ getCurrentWindow }) => {
      const stopListening = await getCurrentWindow().onMoved(() => {
        if (settingsOpenRef.current || loginOpenRef.current) {
          if (windowClampTimerRef.current != null) {
            window.clearTimeout(windowClampTimerRef.current);
          }
          windowClampTimerRef.current = window.setTimeout(() => {
            windowClampTimerRef.current = undefined;
            void keepWindowInsideWorkArea();
          }, 45);
          return;
        }

        if (!edgeHideEnabled) {
          edgeHideRef.current.restoredFromEdge = false;
          return;
        }

        if (Date.now() < edgeHideRef.current.suppressMovedUntil) {
          return;
        }

        if (edgeTimer != null) {
          window.clearTimeout(edgeTimer);
        }
        edgeTimer = window.setTimeout(() => void hideAtEdgeIfNeeded(), 250);
      });

      if (disposed) {
        stopListening();
      } else {
        unlisten = stopListening;
      }
    });

    return () => {
      disposed = true;
      if (edgeTimer != null) {
        window.clearTimeout(edgeTimer);
      }
      if (windowClampTimerRef.current != null) {
        window.clearTimeout(windowClampTimerRef.current);
        windowClampTimerRef.current = undefined;
      }
      if (edgeLeaveTimerRef.current != null) {
        window.clearTimeout(edgeLeaveTimerRef.current);
      }
      stopEdgeDockPolling();
      unlisten?.();
    };
  }, [edgeHideEnabled, hideAtEdgeIfNeeded, keepWindowInsideWorkArea, nativeRuntime, stopEdgeDockPolling]);

  useEffect(() => {
    if (!nativeRuntime) {
      return;
    }

    let disposed = false;
    let unlisten: (() => void) | undefined;

    void import("@tauri-apps/api/event").then(async ({ listen }) => {
      const stopListening = await listen<string>("open-settings", () => void openSettings());
      const stopRestoring = await listen<string>("restore-overlay", () => void restoreEdgeHide(false));
      const stopDisplayMode = await listen<DisplayMode>("select-display-mode", (event) => {
        if (event.payload === "vessel" || event.payload === "traffic") {
          setDisplayMode(event.payload);
        }
      });

      if (disposed) {
        stopListening();
        stopRestoring();
        stopDisplayMode();
      } else {
        unlisten = () => {
          stopListening();
          stopRestoring();
          stopDisplayMode();
        };
      }
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [nativeRuntime, openSettings, restoreEdgeHide]);

  return (
    <>
      <WaterlineOverlay
        state={state}
        onNavigate={(offset) => monitor.selectAdjacentSupportedSubscription(offset)}
        onLogin={nativeRuntime ? () => void openOfficialLogin() : undefined}
        onOpenSettings={() => void openSettings()}
        onHide={() => void hideOverlay()}
        onDisplayModeChange={setDisplayMode}
        onRestoreEdgeHide={() => void restoreEdgeHide()}
        onDragStart={startOverlayDrag}
        onOpenNativeContextMenu={nativeRuntime ? openNativeContextMenu : undefined}
        onEdgeMouseEnter={onEdgeMouseEnter}
        onEdgeMouseLeave={onEdgeMouseLeave}
        displayMode={displayMode}
        uiScale={uiScale}
        edgeHidden={edgeHidden}
        edgeHideEdge={edgeHideEdge}
        loginError={loginError}
      />
      {nativeRuntime && loginOpen && (
        <div className="login-backdrop" role="presentation">
          <form className="login-dialog" onSubmit={submitLogin}>
            <div className="login-dialog-heading" onMouseDown={startOverlayDrag}>
              <h1>登录 3R</h1>
              <button
                type="button"
                className="login-close"
                aria-label="关闭登录窗口"
                onClick={() => void closeLogin()}
              >
                ×
              </button>
            </div>
            <p>账号信息只用于本次向 3R 官方接口验证额度。</p>
            <label className="login-field">
              邮箱
              <input
                type="email"
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                disabled={loginBusy}
              />
            </label>
            <label className="login-field">
              密码
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                disabled={loginBusy}
              />
            </label>
            {loginError && <div className="login-error">{loginError}</div>}
            <button className="login-submit" type="submit" disabled={loginBusy}>
              {loginBusy ? "验证中…" : "登录并读取额度"}
            </button>
          </form>
        </div>
      )}
      {nativeRuntime && settingsOpen && (
        <div className="settings-backdrop" role="presentation" onClick={() => void closeSettings()}>
          <section className="settings-dialog" role="dialog" aria-modal="true" aria-label="3R 水位设置" onClick={(event) => event.stopPropagation()}>
            <div className="login-dialog-heading" onMouseDown={startOverlayDrag}>
              <h1>设置</h1>
              <button type="button" className="login-close" aria-label="关闭设置" onClick={() => void closeSettings()}>
                ×
              </button>
            </div>
            <div className="settings-row">
              <span>刷新间隔</span>
              <strong>5 分钟（固定）</strong>
            </div>
            <div className="settings-row">
              <span>启动时读取</span>
              <strong>已启用</strong>
            </div>
            <label className="settings-toggle">
              <span>开机自动启动</span>
              <input
                type="checkbox"
                checked={autoStartEnabled}
                disabled={autoStartBusy}
                onChange={(event) => void updateAutoStart(event.target.checked)}
              />
            </label>
            <label className="settings-toggle">
              <span>贴边隐藏</span>
              <input
                type="checkbox"
                checked={edgeHideEnabled}
                onChange={(event) => setEdgeHideEnabled(event.target.checked)}
              />
            </label>
            <label className="settings-row settings-select-row">
              <span>订阅自动切换</span>
              <select
                value={autoCycleIntervalMs}
                onChange={(event) => setAutoCycleIntervalMs(Number(event.target.value))}
              >
                {AUTO_CYCLE_OPTIONS.map((interval) => (
                  <option value={interval} key={interval}>
                    {autoCycleLabel(interval)}
                  </option>
                ))}
              </select>
            </label>
            <div className="settings-mode-group">
              <span>悬浮样式</span>
                <div className="settings-mode-options" role="group" aria-label="悬浮样式">
                <button
                  type="button"
                  className={displayMode === "vessel" ? "mode-option active" : "mode-option"}
                  onClick={() => setDisplayMode("vessel")}
                >
                  圆形水瓶
                </button>
                <button
                  type="button"
                  className={displayMode === "traffic" ? "mode-option active" : "mode-option"}
                  onClick={() => setDisplayMode("traffic")}
                >
                  Traffic Monitor
                </button>
                </div>
            </div>
            <div className="settings-mode-group">
              <span>界面大小</span>
              <div className="settings-mode-options settings-size-options" role="group" aria-label="界面大小">
                {([
                  ["large", "大"],
                  ["medium", "中"],
                  ["small", "小"]
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={uiScale === value ? "mode-option active" : "mode-option"}
                    onClick={() => setUiScale(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <button
              type="button"
              className="settings-danger"
              onClick={async () => {
                const { invoke } = await import("@tauri-apps/api/core");
                const result = await invoke<{ auto_start_disabled: boolean }>("clear_saved_session");
                setAutoStartEnabled(false);
                if (!result.auto_start_disabled) {
                  setAutoStartError("登录信息已清除，但无法移除开机自动启动");
                }
                monitor.reset();
                await closeSettings();
                await monitor.refresh();
              }}
            >
              清除本机登录信息
            </button>
            {autoStartError && <p className="settings-error">{autoStartError}</p>}
          </section>
        </div>
      )}
    </>
  );
}
