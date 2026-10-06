export interface GeminiWindow {
  remainingFraction: number;
  resetTime?: string;
}

export interface AntigravityReading {
  queriedAt: string;
  fiveHour?: GeminiWindow;
  weekly?: GeminiWindow;
  failure?: string;
}

export const GEMINI_READING_KEY = "3r-waterline-gemini-reading";
export const SITE_KEY = "3r-waterline-site";

export function resetCountdown(resetTime: string, now: Date) {
  const resetAt = new Date(resetTime).getTime();

  if (!Number.isFinite(resetAt)) {
    return undefined;
  }

  const totalMinutes = Math.max(0, Math.floor((resetAt - now.getTime()) / 60_000));

  // A five-hour window is usually under a day, where "0d 0h" hides the remaining minutes.
  if (totalMinutes < 24 * 60) {
    return `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`;
  }

  const totalHours = Math.floor(totalMinutes / 60);
  return `${Math.floor(totalHours / 24)}d ${totalHours % 24}h`;
}

export function queryAgeLabel(queriedAt: string, now: Date) {
  const queried = new Date(queriedAt).getTime();

  if (!Number.isFinite(queried)) {
    return "上次查询";
  }

  const minutes = Math.max(0, Math.floor((now.getTime() - queried) / 60_000));

  if (minutes < 1) {
    return "刚刚查询";
  }

  if (minutes < 60) {
    return `${minutes} 分钟前查询`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 48) {
    return `${hours} 小时前查询`;
  }

  return `${Math.floor(hours / 24)} 天前查询`;
}

export function formatRemainingPercent(fraction: number) {
  const percent = Math.max(0, Math.min(100, fraction * 100));
  return `${percent.toFixed(1)}%`;
}

export function loadGeminiReading(storage: Pick<Storage, "getItem"> = localStorage): AntigravityReading | null {
  const raw = storage.getItem(GEMINI_READING_KEY);

  if (raw == null || raw.trim() === "") {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<AntigravityReading>;

    if (typeof parsed.queriedAt !== "string") {
      return null;
    }

    return {
      queriedAt: parsed.queriedAt,
      ...(isGeminiWindow(parsed.fiveHour) ? { fiveHour: parsed.fiveHour } : {}),
      ...(isGeminiWindow(parsed.weekly) ? { weekly: parsed.weekly } : {}),
      ...(typeof parsed.failure === "string" && parsed.failure.trim() !== "" ? { failure: parsed.failure } : {})
    };
  } catch {
    return null;
  }
}

export function saveGeminiReading(
  reading: AntigravityReading | null,
  storage: Pick<Storage, "setItem" | "removeItem"> = localStorage
) {
  if (reading == null) {
    storage.removeItem(GEMINI_READING_KEY);
    return;
  }

  storage.setItem(GEMINI_READING_KEY, JSON.stringify(reading));
}

export function readingHasWindows(reading: AntigravityReading | null | undefined): reading is AntigravityReading {
  return reading?.fiveHour != null || reading?.weekly != null;
}

function isGeminiWindow(value: unknown): value is GeminiWindow {
  if (typeof value !== "object" || value == null || !("remainingFraction" in value)) {
    return false;
  }

  const candidate = value as Partial<GeminiWindow>;
  return typeof candidate.remainingFraction === "number" &&
    Number.isFinite(candidate.remainingFraction) &&
    (candidate.resetTime == null || typeof candidate.resetTime === "string");
}
