export const previewSubscriptionsPageHtml = `
  <main data-3r-subscriptions="v1" data-3r-available-balance="¥298.69">
    <article
      data-3r-subscription-card
      data-subscription-id="gpt-4x"
      data-subscription-name="GPT 4x"
      data-subscription-status="active"
    >
      <section data-quota-period="weekly">
        <span data-quota-used>$73.46</span>
        <span data-quota-limit>$400.00</span>
        <time data-quota-reset>4d 1h</time>
      </section>
      <section data-quota-period="monthly">
        <span data-quota-used>$799.43</span>
        <span data-quota-limit>$1,600.00</span>
        <time data-quota-reset>6d 1h</time>
      </section>
    </article>
    <article
      data-3r-subscription-card
      data-subscription-id="future-plan"
      data-subscription-name="其他方案"
      data-subscription-status="future"
    ></article>
    <article
      data-3r-subscription-card
      data-subscription-id="expired-plan"
      data-subscription-name="历史订阅"
      data-subscription-status="inactive"
    ></article>
  </main>
`;
