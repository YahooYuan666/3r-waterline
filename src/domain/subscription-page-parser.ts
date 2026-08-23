import {
  SchemaMismatchError,
  type Money,
  type PeriodQuota,
  type Subscription,
  type SubscriptionReadResult,
  type SubscriptionsPageReader
} from "./quota-monitor";

const currencySymbols: Record<string, string> = {
  $: "USD",
  "€": "EUR",
  "£": "GBP",
  "¥": "JPY",
  "￥": "CNY"
};

const moneyNumberPattern = "((?:0|[1-9]\\d{0,2}(?:,\\d{3})*|[1-9]\\d*)(?:\\.\\d{1,2})?)";
const symbolMoneyPattern = new RegExp(`^([\$€£¥￥])\\s*${moneyNumberPattern}$`);
const codeMoneyPattern = new RegExp(`^([A-Z]{3})\\s+${moneyNumberPattern}$`);
const resetCountdownPattern = /(\d+)d\s+(\d{1,2})h/i;
const remainingDaysPattern = /(?:剩余|remaining)\s*(\d+)\s*(?:天|days?)/i;
const resetDatePattern = /(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})(?:\s+|T)(\d{1,2}):(\d{2})/;

export interface SubscriptionPeriodCapture {
  amounts: string;
  reset?: string;
}

export interface SubscriptionPageCapture {
  cards: Array<{
    id?: string;
    name: string;
    status: "active" | "inactive" | "unknown";
    weekly?: SubscriptionPeriodCapture;
    monthly?: SubscriptionPeriodCapture;
  }>;
}

function textOf(element: Element | null | undefined) {
  return element?.textContent?.replaceAll("\u00a0", " ").trim();
}

function parseMoney(rawValue: string | undefined): Money | undefined {
  if (rawValue == null) {
    return undefined;
  }

  const match = rawValue.match(symbolMoneyPattern) ?? rawValue.match(codeMoneyPattern);

  if (match == null) {
    return undefined;
  }

  const currency = currencySymbols[match[1]] ?? match[1];
  const amount = Number(match[2].replaceAll(",", ""));

  if (!Number.isFinite(amount) || amount < 0) {
    return undefined;
  }

  return { amount, currency };
}

function parseResetCountdown(rawValue: string | undefined) {
  if (rawValue == null) {
    return undefined;
  }

  const normalized = rawValue.replaceAll("\u00a0", " ").trim();
  const match = normalized.match(resetCountdownPattern);

  if (match != null) {
    const days = Number(match[1]);
    const hours = Number(match[2]);

    if (!Number.isSafeInteger(days) || !Number.isSafeInteger(hours) || hours >= 24) {
      return undefined;
    }

    return `${days}d ${hours}h`;
  }

  const remainingDays = normalized.match(remainingDaysPattern);
  if (remainingDays != null) {
    const days = Number(remainingDays[1]);
    return Number.isSafeInteger(days) ? `${days}d 0h` : undefined;
  }

  const dateMatch = normalized.match(resetDatePattern);
  if (dateMatch != null) {
    const [, year, month, day, hour, minute] = dateMatch;
    const resetAt = new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute)
    );
    const totalHours = Math.max(0, Math.floor((resetAt.getTime() - Date.now()) / 3_600_000));
    return `${Math.floor(totalHours / 24)}d ${totalHours % 24}h`;
  }

  return undefined;
}

function normalizePeriod(card: Element, period: "weekly" | "monthly"): PeriodQuota | undefined {
  const periodElement = card.querySelector(`[data-quota-period="${period}"]`);
  const used = parseMoney(textOf(periodElement?.querySelector("[data-quota-used]")));
  const limit = parseMoney(textOf(periodElement?.querySelector("[data-quota-limit]")));
  const resetCountdown = parseResetCountdown(textOf(periodElement?.querySelector("[data-quota-reset]")));

  if (
    used == null ||
    limit == null ||
    used.currency !== limit.currency ||
    limit.amount <= 0 ||
    used.amount > limit.amount
  ) {
    return undefined;
  }

  const remainingAmount = Math.round((limit.amount - used.amount) * 100) / 100;

  return {
    remainingAmount: { amount: remainingAmount, currency: limit.currency },
    limit,
    ...(resetCountdown == null ? {} : { resetCountdown })
  };
}

function parseMoneyPair(rawValue: string | undefined) {
  if (rawValue == null) {
    return undefined;
  }

  const parts = rawValue.split("/");

  if (parts.length !== 2) {
    return undefined;
  }

  const used = parseMoney(parts[0].trim());
  const limit = parseMoney(parts[1].trim());

  if (used == null || limit == null) {
    return undefined;
  }

  return { used, limit };
}

function normalizeRenderedPeriod(block: Element): { period: "weekly" | "monthly"; quota: PeriodQuota } | undefined {
  const header = Array.from(block.children).find(
    (child) => child.classList.contains("flex") && child.classList.contains("justify-between")
  );
  const label = textOf(header?.children[0])?.toLowerCase();
  const pair = parseMoneyPair(textOf(header?.children[1]));
  const resetText = textOf(
    Array.from(block.children).find((child) => child.tagName.toLowerCase() === "p")
  );
  const resetCountdown = parseResetCountdown(resetText);

  const period =
    label != null && /(?:周|week)/i.test(label)
      ? "weekly"
      : label != null && /(?:月|month)/i.test(label)
        ? "monthly"
        : undefined;

  if (
    period == null ||
    pair == null ||
    pair.used.currency !== pair.limit.currency ||
    pair.limit.amount <= 0 ||
    pair.used.amount > pair.limit.amount
  ) {
    return undefined;
  }

  return {
    period,
    quota: {
      remainingAmount: {
        amount: Math.round((pair.limit.amount - pair.used.amount) * 100) / 100,
        currency: pair.limit.currency
      },
      limit: pair.limit,
      ...(resetCountdown == null ? {} : { resetCountdown })
    }
  };
}

function fallbackIdentity(card: Element, position: number) {
  const id = card.getAttribute("data-subscription-id")?.trim() || `unsupported-${position + 1}`;
  const name = card.getAttribute("data-subscription-name")?.trim() || `未知订阅 ${position + 1}`;

  return { id, name };
}

function normalizeCard(card: Element, position: number): Subscription {
  const { id, name } = fallbackIdentity(card, position);
  const status = card.getAttribute("data-subscription-status");

  if (status === "inactive") {
    return { id, name, status: "inactive" };
  }

  if (status !== "active" || card.getAttribute("data-subscription-id") == null || card.getAttribute("data-subscription-name") == null) {
    return { id, name, status: "unsupported" };
  }

  const weekly = normalizePeriod(card, "weekly");
  const monthly = normalizePeriod(card, "monthly");

  if (weekly == null && monthly == null) {
    return { id, name, status: "unsupported" };
  }

  return {
    id,
    name,
    status: "supported",
    quotaSnapshot: { weekly, monthly }
  };
}

function stableSubscriptionId(name: string, position: number) {
  let hash = 2166136261;

  for (const character of name) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }

  return `subscription-${position + 1}-${(hash >>> 0).toString(36)}`;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    };

    return entities[character];
  });
}

function renderedCapturePeriod(period: SubscriptionPeriodCapture | undefined, name: "weekly" | "monthly") {
  if (period == null) {
    return "";
  }

  const reset = period.reset == null ? "" : `<time data-quota-reset>${escapeHtml(period.reset)}</time>`;

  return `
    <section data-quota-period="${name}">
      <span data-quota-used>${escapeHtml(period.amounts.split("/")[0] ?? "")}</span>
      <span data-quota-limit>${escapeHtml(period.amounts.split("/")[1] ?? "")}</span>
      ${reset}
    </section>
  `;
}

function normalizeRenderedCard(card: Element, position: number): Subscription {
  const header = Array.from(card.children).find(
    (child) => child.classList.contains("flex") && child.classList.contains("justify-between")
  );
  const name = textOf(header?.querySelector("h3")) || `未知订阅 ${position + 1}`;
  const id = stableSubscriptionId(name, position);
  const status = Array.from(header?.querySelectorAll("span") ?? []).find((badge) =>
    badge.classList.contains("rounded-full")
  );

  if (status?.classList.contains("bg-gray-100")) {
    return { id, name, status: "inactive" };
  }

  if (!status?.classList.contains("bg-emerald-100")) {
    return { id, name, status: "unsupported" };
  }

  const content = Array.from(card.children).find(
    (child) => child.classList.contains("space-y-4") && child.classList.contains("p-4")
  );
  const periods = Array.from(content?.children ?? [])
    .filter((child) => child.classList.contains("space-y-2"))
    .map(normalizeRenderedPeriod)
    .filter((period): period is NonNullable<typeof period> => period != null);
  const weekly = periods.find((period) => period.period === "weekly")?.quota;
  const monthly = periods.find((period) => period.period === "monthly")?.quota;

  if (weekly == null && monthly == null) {
    return { id, name, status: "unsupported" };
  }

  return {
    id,
    name,
    status: "supported",
    quotaSnapshot: { weekly, monthly }
  };
}

/**
 * Parses only the declared subscription-card contract. Missing page-level
 * structure is a schema mismatch; malformed individual cards remain isolated.
 */
export function parseSubscriptionsPageHtml(html: string): SubscriptionReadResult {
  const document = new DOMParser().parseFromString(html, "text/html");
  const page = document.querySelector('[data-3r-subscriptions="v1"]');

  if (page != null) {
    const cards = Array.from(page.querySelectorAll("[data-3r-subscription-card]"));

    if (cards.length === 0) {
      throw new SchemaMismatchError();
    }

    return {
      subscriptions: cards.map(normalizeCard)
    };
  }

  const grid = Array.from(document.querySelectorAll("div")).find(
    (element) =>
      element.classList.contains("grid") &&
      element.classList.contains("gap-6") &&
      element.classList.contains("lg:grid-cols-2")
  );
  const cards = Array.from(grid?.children ?? []).filter(
    (element) =>
      element.classList.contains("overflow-hidden") &&
      element.classList.contains("rounded-2xl") &&
      element.classList.contains("border") &&
      element.classList.contains("bg-white")
  );

  if (cards.length === 0) {
    throw new SchemaMismatchError();
  }

  return { subscriptions: cards.map(normalizeRenderedCard) };
}

/**
 * Converts the native WebView's field-whitelisted capture into the same strict
 * parser contract used by fixtures. The original page and its session never
 * enter the frontend process or persistent storage.
 */
export function parseSubscriptionPageCapture(capture: unknown): SubscriptionReadResult {
  if (
    typeof capture !== "object" ||
    capture == null ||
    !("cards" in capture) ||
    !Array.isArray(capture.cards) ||
    capture.cards.length === 0
  ) {
    throw new SchemaMismatchError();
  }

  const cards = capture.cards.map((rawCard, position) => {
    const card = rawCard as Partial<SubscriptionPageCapture["cards"][number]>;
    const name = typeof card.name === "string" ? card.name : `未知订阅 ${position + 1}`;
    const id = typeof card.id === "string" && card.id.trim() !== ""
      ? card.id.trim()
      : stableSubscriptionId(name, position);
    const status = card.status === "active" || card.status === "inactive" ? card.status : "unknown";
    const isCapturePeriod = (period: unknown): period is SubscriptionPeriodCapture => {
      if (typeof period !== "object" || period == null || !("amounts" in period)) {
        return false;
      }

      const candidate = period as Partial<SubscriptionPeriodCapture>;
      return typeof candidate.amounts === "string" &&
        (candidate.reset == null || typeof candidate.reset === "string");
    };
    const weekly = isCapturePeriod(card.weekly) ? card.weekly : undefined;
    const monthly = isCapturePeriod(card.monthly) ? card.monthly : undefined;

    return `
      <article
        data-3r-subscription-card
        data-subscription-id="${escapeHtml(id)}"
        data-subscription-name="${escapeHtml(name)}"
        data-subscription-status="${status}"
      >
        ${renderedCapturePeriod(weekly, "weekly")}
        ${renderedCapturePeriod(monthly, "monthly")}
      </article>
    `;
  });

  return parseSubscriptionsPageHtml(`
    <main data-3r-subscriptions="v1">
      ${cards.join("\n")}
    </main>
  `);
}

export function createHtmlSubscriptionsPageReader(
  readHtml: () => Promise<string>
): SubscriptionsPageReader {
  return {
    async read() {
      return parseSubscriptionsPageHtml(await readHtml());
    }
  };
}
