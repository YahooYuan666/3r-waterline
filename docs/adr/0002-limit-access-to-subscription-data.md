# Limit access to subscription data

3R Waterline may use only the official 3R authentication flow and the subscriptions page, and it normalizes only subscription names, period usage, limits, and reset times. It must not access API keys, orders, payments, account balances, or other account pages, and it sends no user data to an application-operated server; this keeps the desktop quota display within a minimal, auditable permission boundary.
