# Use Tauri for the desktop host

3R Waterline uses Tauri 2 as its Windows and macOS desktop host because the product needs a lightweight overlay, native startup integration, display-edge positioning, and platform credential storage. The application will use each platform's system WebView for the isolated official login window, so real 3R authentication must be validated independently on Windows and macOS before either platform is considered supported.
