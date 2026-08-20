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
  monthlyReset = "6d 1h 后重置"
}: {
  name: string;
  status?: "active" | "expired" | "invalid";
  weeklyUsage?: string;
  weeklyLimit?: string;
  weeklyReset?: string;
  monthlyUsage?: string;
  monthlyLimit?: string;
  monthlyReset?: string;
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
      { id: "bad-limit", status: "unsupported" },
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

  it("rejects an invalid period instead of guessing a Quota Snapshot", () => {
    const result = parseSubscriptionsPageHtml(
      subscriptionsPage(
        supportedCard({
          id: "currency-mismatch",
          name: "Currency Mismatch",
          monthlyLimit: "EUR 1,600.00",
          weeklyReset: "4 hours"
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
        name: "Whitelisted",
        status: "supported",
        quotaSnapshot: expect.objectContaining({
          weekly: expect.objectContaining({ remainingAmount: { amount: 326.54, currency: "USD" } })
        })
      }),
      expect.objectContaining({ name: "Inactive", status: "inactive" })
    ]);
  });

  it("rejects an empty or malformed native capture", () => {
    expect(() => parseSubscriptionPageCapture({ cards: [] })).toThrow(SchemaMismatchError);
    expect(() => parseSubscriptionPageCapture({ cards: "not-an-array" })).toThrow(SchemaMismatchError);
  });
});
