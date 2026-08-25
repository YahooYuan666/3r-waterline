# 3R Waterline MVP

Status: ready-for-agent

## Problem Statement

3R users need a lightweight, trustworthy way to see the current remaining weekly and monthly subscription quota without repeatedly opening the 3R subscriptions page. The application must start with the computer, retain only a reusable Login State rather than a password, and present current values in a compact overlay without putting extra load on 3R or exposing the previous user's information when the application is copied to another operating-system user.

## Solution

Build 3R Waterline as a Tauri 2 desktop application for Windows and macOS. A user authenticates through an isolated Official Login Window hosted by 3R, then sees the remaining amounts for their active 3R Account in a compact, topmost dual-chamber water vessel. The left green chamber represents weekly Remaining Amount and the right blue chamber represents monthly Remaining Amount. The application reads the user's subscriptions page at the start of every Boot Lifecycle, then at the selected Refresh Interval, normalizes every Supported Subscription, and drives the overlay from a single quota-monitoring state.

The application is read-only. It never captures a password, reads a default browser's Login State, accesses non-subscription account pages, or sends account data to an application-operated server.

## User Stories

1. As a 3R user, I want to authenticate through a 3R-hosted login page, so that my password is submitted only to 3R.
2. As a 3R user, I want the application to use a reusable Login State after a successful login, so that I do not need to enter my password after every computer startup.
3. As a 3R user, I want the application to ignore my existing Chrome, Safari, and other browser sessions, so that it does not depend on or expose authentication data from another browser.
4. As a 3R user, I want the application to start automatically after I sign in to my operating-system account, so that quota information is available without a separate launch step.
5. As a 3R user, I want Auto-start removed when I clear my account from the device, so that a signed-out application does not run needlessly at future startups.
6. As a 3R user, I want a new Boot Lifecycle to read the subscriptions page before showing current quota values, so that yesterday's values are not presented as current after startup.
7. As a 3R user, I want the first Boot Lifecycle read to occur immediately, so that a normal computer startup begins with the latest available quota information.
8. As a 3R user, I want subsequent reads to follow my selected Refresh Interval, so that I can balance freshness against load on 3R.
9. As a 3R user, I want to choose only 5, 10, 15, 30, or 60 minute Refresh Intervals, so that the application never creates an accidental high-frequency polling setting.
10. As a 3R user, I want a sleep-resume read only when the selected Refresh Interval has elapsed, so that resuming the computer avoids unnecessary requests.
11. As a 3R user, I want to see the real Remaining Amount rather than the source page's Used Amount, so that the prominent number and water height answer the question I care about.
12. As a 3R user, I want weekly and monthly Remaining Amounts to be visually distinct, so that I can scan both quota periods without misreading one for the other.
13. As a 3R user, I want the weekly green and monthly blue water levels to scale from each period's own limit, so that unequal limits remain meaningful.
14. As a 3R user, I want the total limit shown as secondary context beside each Remaining Amount, so that I can judge the water height against the full allowance.
15. As a 3R user, I want Reset Countdown values to update locally between page reads, so that the overlay remains informative without extra traffic.
16. As a 3R user, I want Reset Countdown precision limited to the source page's day-and-hour precision, so that the application does not imply false second-level accuracy.
17. As a 3R user with several Subscriptions, I want one page read to update all Supported Subscriptions, so that adding subscriptions does not multiply network requests.
18. As a 3R user with several Subscriptions, I want to navigate one Selected Subscription at a time in the overlay, so that the compact window remains small.
19. As a 3R user, I want incomplete or unknown subscription cards labeled as Unsupported Subscriptions, so that I do not see guessed quota values and valid cards continue to refresh.
20. As a 3R user, I want an Inactive Subscription to remain identifiable without a water-level display, so that expiration or invalid status is clear without offering purchase actions.
21. As a 3R user, I want a clear Unverified State if the first read, authentication, or page validation fails, so that stale data is never disguised as current after startup.
22. As a 3R user, I want a later failure in the same Boot Lifecycle to keep the last Verified Snapshot visibly marked as failed to update, so that I retain context without mistaking it for fresh data.
23. As a 3R user, I want an obvious Schema Mismatch state when 3R changes the required page structure, so that the application fails safely instead of inventing data.
24. As a 3R user, I want to drag the overlay to a display edge and have it collapse to a small content-free tab, so that the desktop stays uncluttered without losing access to the application.
25. As a 3R user, I want a collapsed edge tab to expand on hover or click, so that I can recover the overlay predictably.
26. As a 3R user, I want the overlay to remain visible unless I explicitly drag it to an edge, so that idle time does not make the application disappear unexpectedly.
27. As a 3R user, I want a tray or menu-bar entry for full application controls, so that I can recover and manage the application when the overlay is hidden.
28. As a 3R user, I want a right-click Overlay Context Menu for Auto-start, Edge Hide, Refresh Interval, and other basic settings, so that common changes do not require a separate settings window.
29. As a 3R user, I want a Clear This Device command, so that I can remove the current Login State, session data, subscription content, Quota Snapshots, and Auto-start entry before giving the application or computer to someone else.
30. As a 3R user who receives a copied application, I want it to start without another user's Login State, so that I must sign in to my own 3R Account rather than seeing private quota data.
31. As a 3R user, I want Windows and macOS behavior to have the same core login, refresh, overlay, settings, and clearing guarantees, so that platform choice does not change the security model.
32. As a privacy-conscious user, I want the application to access only the official authentication flow, subscriptions page, and the single available-balance field from my authenticated 3R account, so that API keys, orders, payments, account profile details, and unrelated personal data remain outside its reach.
33. As a privacy-conscious user, I want the application to operate without an application-operated backend or telemetry pipeline, so that quota data does not leave my device except when communicating with 3R.
34. As a user, I want no low-quota, reset, or expiration notifications in the first release, so that the application remains a quiet status tool rather than a source of background interruptions.

## Implementation Decisions

- Use Tauri 2 as the native desktop host. Windows uses the system WebView2 and macOS uses WKWebView; both platforms must independently prove the official 3R login works before support is claimed.
- Use an Official Login Window with an allowlisted official 3R top-level origin. Do not render a locally controlled password form, read a default-browser profile, import external-browser cookies, or expose a native bridge to untrusted remote page content.
- Keep exactly one active 3R Account per local operating-system user configuration. A replacement account is a Clear This Device operation followed by a fresh official login.
- Persist only the application's Login State through operating-system-user-bound secure storage. Keep session/profile material outside the executable or portable application directory; never write plaintext passwords, raw session values, raw page HTML, subscription content, or quota data to application logs.
- Treat each automatic computer startup as a new Boot Lifecycle. Its first subscriptions-page read occurs immediately; after that successful or attempted start read, all recurring reads are scheduled by the selected Refresh Interval. Ordinary repeated window opens and menu actions do not create an extra read path.
- Support only Refresh Interval values of 5, 10, 15, 30, and 60 minutes, defaulting to 5. There is no manual or background path that bypasses the currently selected interval after the initial Boot Lifecycle read.
- On operating-system wake, schedule a Wake Refresh only when the elapsed time since the last successful subscriptions-page read meets the selected Refresh Interval.
- Use a single quota-monitoring coordinator as the feature's principal seam. It receives a subscriptions-page reader, a clock, persisted non-secret preferences, and lifecycle events; it publishes the complete overlay state, including its next eligible read time. The overlay, tray/menu-bar controls, and settings consume this state rather than independently scheduling requests or interpreting HTML.
- Normalize a subscriptions page into a collection of Subscriptions. A Supported Subscription requires at least one valid period; weekly and monthly Used Amounts and limits are normalized independently, while reset countdowns are optional because top-up cards may expose only remaining days or an expiry date. A period removed by the server is omitted from the overlay rather than guessed. The amount shown for each present period is Remaining Amount, calculated as limit minus Used Amount; each value is rejected if parsing or arithmetic is invalid.
- Derive water height from Remaining Amount divided by the matching period limit. Use a single circular dual-chamber vessel: weekly on the left in green and monthly on the right in blue. Show each Remaining Amount prominently and its total limit as secondary text; show the source-currency amount without conversion.
- A source-page number such as `$73.46 / $400.00` is a Used Amount, as verified by the source page's matching `18.3643%` usage fill. The application must not display that source value as the remaining value.
- Locally advance Reset Countdown values only at the day-and-hour precision supplied by the page; recognize remaining-day/expiry-date text when present, and omit the reset line when the source supplies no reset information.
- Parse every discovered Subscription independently. A valid Supported Subscription produces its own Quota Snapshot; an Unsupported Subscription is labeled without blocking valid siblings; an Inactive Subscription retains its identity but has no quota vessel or purchase action.
- A page read produces a Verified Snapshot only after complete structural and value validation. A Schema Mismatch produces no guessed values. On the initial Boot Lifecycle failure, present Unverified State; after a successful read in the current Boot Lifecycle, preserve the last Verified Snapshot with an explicit failure state until a new valid read succeeds.
- Enable Auto-start by default after the first successful login, with an explicit setting. Remove it as part of Clear This Device. Start without elevation and use only the current operating-system user's startup integration.
- Enable Edge Hide by default. It activates only when a user drags the overlay to the nearest left, right, top, or bottom work-area edge of the current display, leaves a clearly visible fourteen-pixel tab with point tracks for present weekly/monthly remaining percentages, expands on hover or click, and re-collapses after the pointer leaves while remaining docked. Dragging away cancels the docked state; a later drag to any edge can trigger Edge Hide again. Persist account-independent overlay dimensions and placement preferences per display when feasible; recover to the primary display if a saved display is absent.
- Show the selected Subscription name in a compact header with previous/next controls. An optional local auto-cycle setting may advance among Supported Subscriptions without causing network reads.
- **2026-08-25 scope update:** Read the single monetary available-balance field from the authenticated official `/auth/me` response together with the ordinary scheduled subscription read. Normalize only a finite non-negative balance into one synthetic selectable Supported Subscription named `Grok 直充余额`; it has no quota limit, water-height percentage, or reset claim. The overlay must show it as a USD available amount, never as a guessed quota or a cached current balance. A failed non-auth balance read omits this one item but must not invalidate valid subscription cards; an authentication failure continues to invalidate the Login State as before. The raw account response and all unrelated profile fields remain process-local and must never be logged or persisted.
- **2026-08-25 visual refresh:** Keep the two display modes and every current interaction unchanged, but replace the pale dual-chamber treatment with the approved `Graphite Rail` visual system: charcoal translucent base, white tabular figures, emerald weekly fill, cobalt monthly fill, low-contrast consumed areas, compact square corners, and a restrained single-border treatment. In Traffic Monitor, regular subscription views retain exactly two progress rails; the synthetic direct-balance view uses a single non-progress balance rail. In vessel mode the direct-balance view is a single centered amount with no fabricated fill. This is a visual-only re-layout of existing controls, settings, and edge tab behavior.
- Keep Traffic Monitor height intrinsic to its two bars and header; medium and small scales use regular-weight text with ellipsis-safe columns. The settings header is a native drag region.
- Provide a System Menu in the Windows tray and macOS menu bar, and an Overlay Context Menu on right-click. The menus expose show/hide, settings, Auto-start, Edge Hide, Refresh Interval, re-login, Clear This Device, and quit behavior without adding a refresh bypass.
- Clear This Device deletes Login State, isolated session/profile data, Subscription names, Quota Snapshots, account-linked preferences, and Auto-start. It retains only account-independent window geometry and Edge Hide preferences. It does not claim to revoke a server-side 3R session unless a documented official logout flow is later adopted.
- The frozen visual source is the user's approved brief: a compact circular water vessel with green weekly and blue monthly water height, monetary Remaining Amounts, reset countdowns, single-subscription paging, and no dashboard or marketing layout.

## Testing Decisions

- Test observable behavior through the quota-monitoring coordinator seam, not its internal timers, storage calls, or parser implementation details. The coordinator must accept a fake subscriptions-page reader and a controllable clock so tests can prove externally visible states without a live 3R account.
- Test initial Boot Lifecycle behavior: a first immediate read, no previous-lifecycle quota shown as current before success, and an Unverified State on initial transport, authentication, or Schema Mismatch failure.
- Test every configured Refresh Interval, including the 5-minute minimum, ensuring no recurring read occurs earlier than its selected interval and ordinary overlay/menu interaction does not trigger a request.
- Test Wake Refresh behavior both before and after the selected Refresh Interval has elapsed.
- Test normalization from sanitized subscription-page fixtures. Include the observed Used Amount and limit relationship, multi-Subscription pages, independent Unsupported Subscriptions, Inactive Subscriptions, malformed amounts, invalid limits, missing reset values, and source structure changes.
- Test Remaining Amount arithmetic, water-height ratios, day-and-hour Reset Countdown recalibration, and the refusal to publish partial or guessed Quota Snapshots.
- Test overlay behavior from published coordinator state: money and total-limit text, green/blue period mapping, subscription paging, Unverified State, stale-update indication, unsupported and inactive status, edge-hide transitions, and right-click setting actions.
- Test Clear This Device as an externally visible privacy guarantee: subsequent launch requires login, Auto-start is removed, and the application directory contains no account data. Use test secrets only; never store or assert real passwords, session values, or live subscription data in fixtures, logs, screenshots, or source control.
- Test Auto-start registration/removal, tray or menu-bar controls, and display-edge recovery with platform adapters or platform-level integration tests as each environment permits.
- Run platform acceptance checks on both Windows and macOS with a dedicated authorized 3R test account: complete official login in the system WebView, restart the application and computer, confirm fresh Boot Lifecycle reads, verify clearing data requires re-login, and validate Edge Hide, System Menu, and Overlay Context Menu behavior.
- Treat the real 3R login flow in WebView as an integration gate. If it cannot complete on a platform, fail that platform's release validation and use only an official API or OAuth callback alternative; never fall back to external-browser credential extraction.
- The repository has no existing application tests or implementation seams. This specification establishes the coordinator seam and fixture-based testing as the initial prior art.

## Out of Scope

- Supporting multiple active 3R Accounts in one local application profile.
- Reading, importing, or sharing data from any external/default browser profile.
- Storing passwords, raw session values, raw HTML, API keys, order data, payment data, account balances, or telemetry.
- Accessing 3R API key, order, purchase, recharge, payment, profile, or non-subscription pages, except the narrow authenticated `/auth/me` available-balance field authorized above.
- Running an application-operated backend, account synchronization service, analytics pipeline, or telemetry service.
- Purchasing, renewing, recharging, redeeming, or otherwise changing a 3R account from the application.
- Low-quota, reset, expiration, or other push notifications.
- Guessing quotas after a Schema Mismatch or displaying a partial Subscription as a valid quota vessel.
- Currency conversion, historical usage analytics, charts, dashboards, or data export.
- Server-side logout or session revocation without a documented official 3R capability.
- Claiming production distribution signing, notarization, or a cross-platform release until the required platform-specific signing credentials and acceptance checks are available.

## Further Notes

- The project follows the accepted decisions in the isolated-login, minimal-access, and Tauri-host ADRs.
- The only authoritative data source for the MVP is the authenticated subscriptions page. The parser must remain read-only and must use a known structural contract rather than broad text scraping.
- The display is intentionally a compact operational tool. The user-provided visual brief is the source of truth; it is not a redesign of the 3R website.
- Portable distribution means the executable or application bundle carries no user state. It does not make an already unlocked operating-system user account safe from someone with access to that same account; operating-system account security remains the trust boundary.
- A successful implementation still requires a separate approved execution plan and a user-selected code-writing execution mode before implementation begins.
