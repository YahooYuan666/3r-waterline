import { describe, expect, it, vi } from "vitest";
import {
  createHtmlSubscriptionsPageReader,
  parseSubscriptionPageCapture,
  parseSubscriptionsPageHtml
} from "./subscription-page-parser";
import { SchemaMismatchError } from "./quota-monitor";

function subscriptionsPage(cards: string) {
  return `
    <main data-3r-subscriptions="v1">
      ${cards}
    </main>
  `;
}

function supportedCard({
  id,
  name,
  weeklyUsed = "$73.46",
  weeklyLimit = "$400.00",
  weeklyReset = "4d 1h",
  monthlyUsed = "$799.43",
  monthlyLimit = "$1,600.00",
  monthlyReset = "6d 1h"
}: {
  id: string;
  name: string;
  weeklyUsed?: string;
  weeklyLimit?: string;
  weeklyReset?: string;
  monthlyUsed?: string;
  monthlyLimit?: string;
  monthlyReset?: string;
}) {
  return `
    <article data-3r-subscription-card data-subscription-id="${id}" data-subscription-name="${name}" data-subscription-status="active">
      <section data-quota-period="weekly">
        <span data-quota-used>${weeklyUsed}</span>
        <span data-quota-limit>${weeklyLimit}</span>
        <time data-quota-reset>${weeklyReset}</time>
      </section>
      <section data-quota-period="monthly">
        <span data-quota-used>${monthlyUsed}</span>
        <span data-quota-limit>${monthlyLimit}</span>
        <time data-quota-reset>${monthlyReset}</time>
      </section>
    </article>
  `;
}

function officialRenderedCard({
  name,
  status = "active",
  weeklyUsage = "$73.46",
  weeklyLimit = "$400.00",
  weeklyReset = "4d 1h 后重置",
  monthlyUsage = "$799.43",
  monthlyLimit = "$1,600.00",
  monthlyReset = "6d 1h 后重置",
  expiryText
}: {
  name: string;
  status?: "active" | "expired" | "invalid";
  weeklyUsage?: string;
  weeklyLimit?: string;
  weeklyReset?: string;
  monthlyUsage?: string;
  monthlyLimit?: string;
  monthlyReset?: string;
  expiryText?: string;
}) {
  const statusClass =
    status === "active"
      ? "bg-emerald-100 text-emerald-700"
      : status === "expired"
        ? "bg-gray-100 text-gray-600"
        : "bg-red-100 text-red-700";

  return `
    <div class="overflow-hidden rounded-2xl border bg-white">
      <div class="flex items-center justify-between border-b"><h3>${name}</h3><span class="rounded-full ${statusClass}">${status}</span></div>
      <div class="space-y-4 p-4">
        ${expiryText == null ? "" : `<div class="flex items-center justify-between text-sm"><span>到期时间</span><span>${expiryText}</span></div>`}
        <div class="space-y-2">
          <div class="flex items-center justify-between"><span>周额度</span><span>${weeklyUsage} / ${weeklyLimit}</span></div>
          <div class="relative h-2 overflow-hidden rounded-full bg-gray-200"><div style="width: 20%"></div></div>
          <p>${weeklyReset}</p>
        </div>
        <div class="space-y-2">
          <div class="flex items-center justify-between"><span>月额度</span><span>${monthlyUsage} / ${monthlyLimit}</span></div>
          <div class="relative h-2 overflow-hidden rounded-full bg-gray-200"><div style="width: 20%"></div></div>
          <p>${monthlyReset}</p>
        </div>
      </div>
    </div>
  `;
}

describe("subscription page parser", () => {
  it("converts Used Amounts from every valid card into Remaining Amounts and water limits", () => {
    const result = parseSubscriptionsPageHtml(
      subscriptionsPage(
        supportedCard({ id: "gpt-4x", name: "GPT 4x" }) +
          supportedCard({
            id: "claude-pro",
            name: "Claude Pro",
            weeklyUsed: "EUR 120.50",
            weeklyLimit: "EUR 500.00",
            monthlyUsed: "EUR 950.00",
            monthlyLimit: "EUR 2,000.00",
            monthlyReset: "10d 3h"
          })
      )
    );

    expect(result.subscriptions).toEqual([
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
        id: "claude-pro",
        name: "Claude Pro",
        status: "supported",
        quotaSnapshot: {
          weekly: {
            remainingAmount: { amount: 379.5, currency: "EUR" },
            limit: { amount: 500, currency: "EUR" },
            resetCountdown: "4d 1h"
          },
          monthly: {
            remainingAmount: { amount: 1050, currency: "EUR" },
            limit: { amount: 2000, currency: "EUR" },
            resetCountdown: "10d 3h"
          }
        }
      }
    ]);
  });

  it("isolates malformed, unknown, and inactive cards without blocking valid siblings", () => {
    const malformed = supportedCard({
      id: "bad-limit",
      name: "Bad Limit",
      weeklyUsed: "$401.00"
    });
    const unknown = `
      <article data-3r-subscription-card data-subscription-id="unknown" data-subscription-name="Unknown" data-subscription-status="future">
      </article>
    `;
    const inactive = `
      <article data-3r-subscription-card data-subscription-id="expired" data-subscription-name="Expired" data-subscription-status="inactive">
      </article>
    `;

    const result = parseSubscriptionsPageHtml(
      subscriptionsPage(supportedCard({ id: "valid", name: "Valid" }) + malformed + unknown + inactive)
    );

    expect(result.subscriptions.map(({ id, status }) => ({ id, status }))).toEqual([
      { id: "valid", status: "supported" },
      { id: "bad-limit", status: "supported" },
      { id: "unknown", status: "unsupported" },
      { id: "expired", status: "inactive" }
    ]);
  });

  it("normalizes the fixed public 3R subscription-card structure without broad page scraping", () => {
    const result = parseSubscriptionsPageHtml(`
      <main>
        <div class="grid gap-6 lg:grid-cols-2">
          ${officialRenderedCard({ name: "Fictional One" })}
          ${officialRenderedCard({ name: "Fictional Expired", status: "expired" })}
          ${officialRenderedCard({ name: "Fictional Invalid", status: "invalid" })}
        </div>
      </main>
    `);

    expect(result.subscriptions).toEqual([
      expect.objectContaining({
        id: expect.stringMatching(/^subscription-/),
        name: "Fictional One",
        status: "supported",
        quotaSnapshot: expect.objectContaining({
          weekly: expect.objectContaining({
            remainingAmount: { amount: 326.54, currency: "USD" },
            resetCountdown: "4d 1h"
          }),
          monthly: expect.objectContaining({
            remainingAmount: { amount: 800.57, currency: "USD" },
            resetCountdown: "6d 1h"
          })
        })
      }),
      expect.objectContaining({ name: "Fictional Expired", status: "inactive" }),
      expect.objectContaining({ name: "Fictional Invalid", status: "unsupported" })
    ]);
  });

  it("rejects malformed amounts instead of guessing a Quota Snapshot", () => {
    const result = parseSubscriptionsPageHtml(
      subscriptionsPage(
        supportedCard({
          id: "currency-mismatch",
          name: "Currency Mismatch",
          weeklyUsed: "EUR 120.00",
          monthlyLimit: "EUR 1,600.00"
        })
      )
    );

    expect(result.subscriptions).toEqual([
      { id: "currency-mismatch", name: "Currency Mismatch", status: "unsupported" }
    ]);
  });

  it("enters Schema Mismatch when the required page contract is absent", () => {
    expect(() => parseSubscriptionsPageHtml("<main><article>Changed page</article></main>")).toThrow(
      SchemaMismatchError
    );
    expect(() => parseSubscriptionsPageHtml(subscriptionsPage(""))).toThrow(SchemaMismatchError);
  });

  it("exposes the parser through the SubscriptionsPageReader seam without retaining raw HTML", async () => {
    const readHtml = vi.fn().mockResolvedValue(
      subscriptionsPage(supportedCard({ id: "reader", name: "Reader" }))
    );
    const reader = createHtmlSubscriptionsPageReader(readHtml);

    await expect(reader.read()).resolves.toMatchObject({
      subscriptions: [{ id: "reader", status: "supported" }]
    });
    expect(readHtml).toHaveBeenCalledTimes(1);
  });

  it("accepts only the native capture's whitelisted subscription fields", () => {
    const result = parseSubscriptionPageCapture({
      cards: [
        {
          id: "subscription-42",
          name: "Whitelisted",
          status: "active",
          weekly: { amounts: "$73.46 / $400.00", reset: "4d 1h" },
          monthly: { amounts: "$799.43 / $1,600.00", reset: "6d 1h" },
          ignoredRawHtml: "<script>never parsed</script>"
        },
        { name: "Inactive", status: "inactive" }
      ]
    });

    expect(result.subscriptions).toEqual([
      expect.objectContaining({
        id: "subscription-42",
        name: "Whitelisted",
        status: "supported",
        quotaSnapshot: expect.objectContaining({
          weekly: expect.objectContaining({ remainingAmount: { amount: 326.54, currency: "USD" } })
        })
      }),
      expect.objectContaining({ name: "Inactive", status: "inactive" })
    ]);
  });

  it("keeps a supported subscription when the server removes the weekly quota", () => {
    const result = parseSubscriptionsPageHtml(
      subscriptionsPage(`
        <article data-3r-subscription-card data-subscription-id="monthly-only" data-subscription-name="GPT 4x" data-subscription-status="active">
          <section data-quota-period="monthly">
            <span data-quota-used>$799.43</span>
            <span data-quota-limit>$2,000.00</span>
            <time data-quota-reset>6d 1h</time>
          </section>
        </article>
      `)
    );

    expect(result.subscriptions).toEqual([
      {
        id: "monthly-only",
        name: "GPT 4x",
        status: "supported",
        quotaSnapshot: {
          monthly: {
            remainingAmount: { amount: 1200.57, currency: "USD" },
            limit: { amount: 2000, currency: "USD" },
            resetCountdown: "6d 1h"
          }
        }
      }
    ]);
  });

  it("recognizes a top-up that exposes remaining days without a reset countdown", () => {
    const result = parseSubscriptionsPageHtml(
      subscriptionsPage(`
        <article data-3r-subscription-card data-subscription-id="top-up" data-subscription-name="小加油包" data-subscription-status="active">
          <section data-quota-period="monthly">
            <span data-quota-used>$0.00</span>
            <span data-quota-limit>$100.00</span>
            <time data-quota-reset>剩余 7 天 (2026/08/30 20:56)</time>
          </section>
        </article>
      `)
    );

    expect(result.subscriptions).toEqual([
      {
        id: "top-up",
        name: "小加油包",
        status: "supported",
        quotaSnapshot: {
          monthly: {
            remainingAmount: { amount: 100, currency: "USD" },
            limit: { amount: 100, currency: "USD" },
            resetCountdown: "7d 0h"
          }
        }
      }
    ]);
  });

  it("recognizes the rendered top-up card when expiry is outside the quota period", () => {
    const result = parseSubscriptionsPageHtml(`
      <main>
        <div class="grid gap-6 lg:grid-cols-2">
          ${officialRenderedCard({
            name: "小加油包",
            weeklyUsage: "",
            monthlyUsage: "$0.00",
            monthlyLimit: "$50.00",
            monthlyReset: "",
            expiryText: "剩余 7 天 (2026/08/30 20:56)"
          })}
        </div>
      </main>
    `);

    expect(result.subscriptions).toEqual([
      expect.objectContaining({
        name: "小加油包",
        status: "supported",
        quotaSnapshot: {
          weekly: undefined,
          monthly: {
            remainingAmount: { amount: 50, currency: "USD" },
            limit: { amount: 50, currency: "USD" }
          }
        }
      })
    ]);
  });

  it("rejects an empty or malformed native capture", () => {
    expect(() => parseSubscriptionPageCapture({ cards: [] })).toThrow(SchemaMismatchError);
    expect(() => parseSubscriptionPageCapture({ cards: "not-an-array" })).toThrow(SchemaMismatchError);
  });

  it("keeps a native period when reset is absent", () => {
    const result = parseSubscriptionPageCapture({
      cards: [
        {
          name: "小加油包",
          status: "active",
          monthly: { amounts: "$0.00 / $100.00" }
        }
      ]
    });

    expect(result.subscriptions).toEqual([
      {
        id: expect.stringMatching(/^subscription-/),
        name: "小加油包",
        status: "supported",
        quotaSnapshot: {
          monthly: {
            remainingAmount: { amount: 100, currency: "USD" },
            limit: { amount: 100, currency: "USD" }
          }
        }
      }
    ]);
  });

  it("adds a selectable Grok direct-balance display item only for a valid USD balance", () => {
    const result = parseSubscriptionPageCapture({
      availableBalance: "$297.46",
      cards: [
        {
          name: "GPT 4x",
          status: "active",
          monthly: { amounts: "$1.00 / $100.00" }
        }
      ]
    });

    expect(result.subscriptions).toContainEqual({
      id: "grok-direct-balance",
      name: "Grok 直充余额",
      status: "supported",
      kind: "direct-balance",
      availableBalance: { amount: 297.46, currency: "USD" }
    });

    const withoutBalance = parseSubscriptionPageCapture({
      availableBalance: "$-1.00",
      cards: [
        {
          name: "GPT 4x",
          status: "active",
          monthly: { amounts: "$1.00 / $100.00" }
        }
      ]
    });
    expect(withoutBalance.subscriptions).toHaveLength(1);
  });
});
