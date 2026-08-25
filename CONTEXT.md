# 3R Waterline

3R Waterline presents the remaining subscription quota for one authenticated 3R account as a compact desktop overlay. It reads a user's own subscription page without retaining their password.

## Language

**3R Account**:
The single user-visible 3R account authenticated by one local application profile. Only one 3R Account may be active in that profile at a time.
_Avoid_: Local account, profile

**Boot Lifecycle**:
The automatic run that begins when the computer starts and 3R Waterline launches. It starts with one balance read using an existing valid login state, then follows the five-minute polling schedule until the application exits.
_Avoid_: Browser session, polling cycle

**Auto-start**:
The user-controlled operating-system login entry that starts 3R Waterline for a valid Login State. It is enabled after the first successful login and removed when the user signs out or clears that Login State.
_Avoid_: System service, background daemon

**Edge Hide**:
The compact overlay state entered only after a user drags the window to any edge of its current display. It exposes a clearly visible fourteen-pixel edge tab whose weekly/monthly point tracks encode remaining quota and which expands on hover or click, then re-collapses when the pointer leaves unless the user drags away.
_Avoid_: Idle hide, minimized window

**System Menu**:
The Windows tray or macOS menu-bar menu that exposes the full set of 3R Waterline controls when the overlay is hidden.
_Avoid_: Overlay menu, application window

**Overlay Context Menu**:
The right-click menu on the compact overlay that exposes basic settings without opening the System Menu.
_Avoid_: System Menu, manual refresh

**Clear This Device**:
The user command that removes the Login State, isolated login-session data, subscription content, Quota Snapshots, and Auto-start entry from the current operating-system user. It retains only account-independent window placement preferences.
_Avoid_: Server logout, cache reset

**Login State**:
The reusable authenticated state issued by 3R for the application's isolated login session. It enables a balance read without collecting or retaining the user's password.
_Avoid_: Password, account data

**Official Login Window**:
An isolated embedded browser window restricted to the 3R official site, where a user submits credentials directly to 3R. It is not the user's default browser and never reads that browser's credentials or session data.
_Avoid_: Default browser login, credential harvesting

**Subscription**:
One subscription card belonging to the active 3R Account. A 3R Account may have multiple Subscriptions, each with its own quota values and reset times.
_Avoid_: Subaccount, plan data

**Direct Balance**:
The single current USD available-balance amount issued for the active 3R Account, presented in the application as `Grok 直充余额`. It is an optional selectable display item, not a quota period: it has no limit, water-level percentage, reset time, or inferred expiry.
_Avoid_: Monthly quota, subscription limit, cached account balance

**Supported Subscription**:
A Subscription whose card has at least one valid usage/limit period. Reset text is optional because top-up cards may expose only remaining days or an expiry date. It is eligible for a Quota Snapshot and the water-level display.
_Avoid_: Parsed card, available plan

**Unsupported Subscription**:
A Subscription card with an unknown type, missing quota period, or malformed quota data. It is identified to the user but never blocks updates to Supported Subscriptions or produces a guessed value.
_Avoid_: Failed account, broken refresh

**Inactive Subscription**:
A Subscription that the 3R page reports as expired or invalid. It remains identifiable in navigation but has no quota display and exposes no purchase or renewal action.
_Avoid_: Supported Subscription, renewal target

**Selected Subscription**:
The one Subscription currently represented by the compact desktop overlay. A user changes it with the overlay's subscription navigation.
_Avoid_: Active account, selected account

**Quota Snapshot**:
The normalized weekly and monthly Used Amounts and limits, with optional reset countdowns, for one Subscription obtained from one subscription-page read.
_Avoid_: HTML data, balance cache

**Used Amount**:
The monetary amount from the subscription page that is represented by its usage progress fill.
_Avoid_: Remaining amount, available quota

**Remaining Amount**:
The monetary quota still available for a period, calculated as its limit minus its Used Amount. It determines the corresponding water height and is the amount presented in the overlay.
_Avoid_: Usage amount, source amount

**Verified Snapshot**:
A Quota Snapshot successfully obtained during the current Boot Lifecycle. Only a Verified Snapshot may be presented as current quota data.
_Avoid_: Cached balance, last known data

**Unverified State**:
The overlay state before the current Boot Lifecycle has a Verified Snapshot, or after its Login State becomes invalid. It does not show previous-lifecycle quota values as current.
_Avoid_: Empty quota, stale current data

**Schema Mismatch**:
The safe failure state in which a subscription-page read does not contain a complete, valid set of fields needed for a Quota Snapshot. It never produces a guessed quota value.
_Avoid_: Partial snapshot, parser fallback

**Reset Countdown**:
The locally updated day-and-hour display derived from a Subscription's reset interval, remaining-day text, or expiry date. It is recalibrated on each subscription-page read and may be omitted when the source supplies no reset information.
_Avoid_: Server timer, second-precision reset time

**Refresh Interval**:
The user-selected delay between completed subscription-page reads. It defaults to five minutes and may be set only to 5, 10, 15, 30, or 60 minutes.
_Avoid_: Manual refresh, timer animation

**Wake Refresh**:
The immediate subscription-page read scheduled after the operating system resumes from sleep, only when the elapsed time since the last successful read reaches the selected Refresh Interval.
_Avoid_: Resume polling, forced refresh
