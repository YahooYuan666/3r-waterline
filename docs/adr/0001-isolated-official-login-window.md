# Use an isolated official login window

3R Waterline owns an embedded login session whose top-level navigation is restricted to the official 3R site. It does not read or reuse credentials, cookies, or session data from a user's external browser; this keeps password submission direct to 3R and gives the application a stable cross-platform authentication boundary. If 3R does not support its login flow in an embedded WebView, the application must use an official API or OAuth callback instead of extracting external-browser authentication data.
