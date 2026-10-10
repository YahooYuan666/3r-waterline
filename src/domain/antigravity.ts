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

export interface AccountGeminiReading {
  id: string;
  email: string;
  queriedAt: string;
  fiveHour?: GeminiWindow;
  weekly?: GeminiWindow;
  failure?: string;
}

export const GEMINI_READING_KEY = "3r-waterline-gemini-reading";
export const GEMINI_POOL_KEY = "3r-waterline-gemini-pool";
export const SHOW_INDIVIDUAL_GEMINI_KEY = "3r-waterline-show-individual-gemini";
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

export function accountShortName(email: string): string {
  const trimmed = email.trim();
  if (trimmed.includes("@")) {
    const user = trimmed.split("@")[0].trim();
    if (user.length > 0) {
      return user;
    }
  }
  return trimmed || "Gemini";
}

/**
 * Calculates equal-weighted average pool quota across all accounts.
 * Reset times take the earliest upcoming reset time among accounts.
 */
export function aggregateGeminiPool(
  accounts: AccountGeminiReading[],
  _now: Date = new Date()
): AntigravityReading | null {
  if (accounts.length === 0) {
    return null;
  }

  const fiveHourAccounts = accounts.filter(
    (acc): acc is AccountGeminiReading & { fiveHour: GeminiWindow } => acc.fiveHour != null
  );
  const weeklyAccounts = accounts.filter(
    (acc): acc is AccountGeminiReading & { weekly: GeminiWindow } => acc.weekly != null
  );

  let fiveHourWindow: GeminiWindow | undefined;
  if (fiveHourAccounts.length > 0) {
    const total = fiveHourAccounts.reduce((sum, acc) => sum + acc.fiveHour.remainingFraction, 0);
    const avgFraction = total / fiveHourAccounts.length;
    // Earliest reset time
    const earliestReset = findEarliestResetTime(
      fiveHourAccounts.map((acc) => acc.fiveHour.resetTime)
    );
    fiveHourWindow = {
      remainingFraction: avgFraction,
      ...(earliestReset ? { resetTime: earliestReset } : {})
    };
  }

  let weeklyWindow: GeminiWindow | undefined;
  if (weeklyAccounts.length > 0) {
    const total = weeklyAccounts.reduce((sum, acc) => sum + acc.weekly.remainingFraction, 0);
    const avgFraction = total / weeklyAccounts.length;
    const earliestReset = findEarliestResetTime(
      weeklyAccounts.map((acc) => acc.weekly.resetTime)
    );
    weeklyWindow = {
      remainingFraction: avgFraction,
      ...(earliestReset ? { resetTime: earliestReset } : {})
    };
  }

  // Latest query timestamp across all accounts
  const validTimes = accounts
    .map((a) => a.queriedAt)
    .filter((t) => t && Number.isFinite(new Date(t).getTime()));
  validTimes.sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
  const latestQueriedAt = validTimes[0] || new Date().toISOString();

  // If no account returned valid windows, find common or first error
  let failure: string | undefined;
  if (fiveHourWindow == null && weeklyWindow == null) {
    const failedAccount = accounts.find((a) => a.failure);
    failure = failedAccount?.failure ?? "所有账号查询均未返回额度";
  }

  return {
    queriedAt: latestQueriedAt,
    ...(fiveHourWindow ? { fiveHour: fiveHourWindow } : {}),
    ...(weeklyWindow ? { weekly: weeklyWindow } : {}) ,
    ...(failure ? { failure } : {})
  };
}

function findEarliestResetTime(resetTimes: Array<string | undefined>): string | undefined {
  const valid = resetTimes
    .filter((t): t is string => typeof t === "string" && Number.isFinite(new Date(t).getTime()));
  if (valid.length === 0) {
    return undefined;
  }
  valid.sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
  return valid[0];
}

export function loadGeminiPool(
  storage: Pick<Storage, "getItem"> = localStorage
): AccountGeminiReading[] {
  const rawPool = storage.getItem(GEMINI_POOL_KEY);
  if (rawPool && rawPool.trim() !== "") {
    try {
      const parsed = JSON.parse(rawPool) as unknown[];
      if (Array.isArray(parsed)) {
        return parsed.filter(isAccountGeminiReading);
      }
    } catch {
      // Fall through to legacy check
    }
  }

  // Migration from single legacy reading
  const legacy = loadGeminiReading(storage);
  if (legacy) {
    return [
      {
        id: "default",
        email: "Google 账号",
        queriedAt: legacy.queriedAt,
        fiveHour: legacy.fiveHour,
        weekly: legacy.weekly,
        failure: legacy.failure
      }
    ];
  }

  return [];
}

export function saveGeminiPool(
  accounts: AccountGeminiReading[],
  storage: Pick<Storage, "setItem" | "removeItem"> = localStorage
) {
  if (accounts.length === 0) {
    storage.removeItem(GEMINI_POOL_KEY);
    storage.removeItem(GEMINI_READING_KEY);
    return;
  }
  storage.setItem(GEMINI_POOL_KEY, JSON.stringify(accounts));
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

function isAccountGeminiReading(value: unknown): value is AccountGeminiReading {
  if (typeof value !== "object" || value == null) {
    return false;
  }
  const candidate = value as Partial<AccountGeminiReading>;
  return typeof candidate.id === "string" &&
    typeof candidate.email === "string" &&
    typeof candidate.queriedAt === "string";
}
