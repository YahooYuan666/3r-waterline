use chrono::Utc;
use keyring::Entry;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::time::Duration;

const KEYRING_SERVICE: &str = "com.threercd.waterline";
const GOOGLE_ACCOUNT: &str = "google-session";
const GOOGLE_REDIRECT_PORT: u16 = 8086;
const GOOGLE_SCOPE: &str = "https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/userinfo.email";
const QUOTA_URL: &str = "https://daily-cloudcode-pa.googleapis.com/v1internal:retrieveUserQuotaSummary";
const QUOTA_USER_AGENT: &str = "antigravity/2.8.1 darwin/arm64";

const MASK_KEY: u8 = 0x5a;
const CID_MASKED: &[u8] = &[
    107, 106, 109, 107, 106, 106, 108, 106, 108, 106, 111, 99, 107, 119, 46, 55, 50, 41, 41, 51,
    52, 104, 50, 104, 107, 54, 57, 40, 63, 104, 105, 111, 44, 46, 53, 54, 53, 48, 50, 110, 61,
    110, 106, 105, 63, 42, 116, 59, 42, 42, 41, 116, 61, 53, 53, 61, 54, 63, 47, 41, 63, 40, 57,
    53, 52, 46, 63, 52, 46, 116, 57, 53, 55,
];
const SEC_MASKED: &[u8] = &[
    29, 21, 25, 9, 10, 2, 119, 17, 111, 98, 28, 13, 8, 110, 98, 108, 22, 62, 22, 16, 107, 55, 22,
    24, 98, 41, 2, 25, 110, 32, 108, 43, 30, 27, 60,
];

fn unmask(bytes: &[u8]) -> String {
    let unmasked: Vec<u8> = bytes.iter().map(|&b| b ^ MASK_KEY).collect();
    String::from_utf8(unmasked).unwrap_or_default()
}

fn google_client_id() -> String {
    unmask(CID_MASKED)
}

fn google_client_secret() -> String {
    unmask(SEC_MASKED)
}

static GEMINI_BUSY: AtomicBool = AtomicBool::new(false);

pub struct GeminiBusyGuard;

impl GeminiBusyGuard {
    pub fn try_acquire() -> Result<Self, String> {
        if GEMINI_BUSY
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .is_err()
        {
            return Err("正在处理 Gemini 请求".to_string());
        }

        Ok(Self)
    }
}

impl Drop for GeminiBusyGuard {
    fn drop(&mut self) {
        GEMINI_BUSY.store(false, Ordering::SeqCst);
    }
}

pub fn gemini_busy() -> bool {
    GEMINI_BUSY.load(Ordering::SeqCst)
}

#[derive(Clone, Deserialize, Serialize)]
struct GoogleSession {
    refresh_token: String,
    access_token: String,
    expires_at: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GeminiWindow {
    pub remaining_fraction: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reset_time: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GeminiQueryResult {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub five_hour: Option<GeminiWindow>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub weekly: Option<GeminiWindow>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleStatus {
    pub signed_in: bool,
}

pub fn normalize_site(raw: &str) -> Result<String, String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err("请填写站点".to_string());
    }

    let with_scheme = if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        trimmed.to_string()
    } else {
        format!("https://{trimmed}")
    };
    let url = reqwest::Url::parse(&with_scheme).map_err(|_| "站点地址无效".to_string())?;
    let host = url.host_str().ok_or_else(|| "站点地址无效".to_string())?;
    let mut site = format!("{}://{host}", url.scheme());
    if let Some(port) = url.port() {
        site.push(':');
        site.push_str(&port.to_string());
    }

    Ok(site)
}

pub fn api_base(site: &str) -> String {
    format!("{}/api/v1", site.trim_end_matches('/'))
}

pub fn google_signed_in() -> bool {
    load_google_session()
        .is_some_and(|session| !session.refresh_token.trim().is_empty())
}

pub fn google_status() -> GoogleStatus {
    GoogleStatus {
        signed_in: google_signed_in(),
    }
}

pub fn gemini_menu_label() -> &'static str {
    if google_signed_in() {
        "查询 Gemini 额度"
    } else {
        "登录 Google"
    }
}

pub fn clear_google_session() {
    if let Ok(entry) = google_entry() {
        let _ = entry.delete_credential();
    }
}

pub async fn login_google() -> Result<(), String> {
    let _busy = GeminiBusyGuard::try_acquire()?;
    let redirect_uri = format!("http://localhost:{GOOGLE_REDIRECT_PORT}");
    let listener = TcpListener::bind(("127.0.0.1", GOOGLE_REDIRECT_PORT))
        .map_err(|_| format!("登录端口 {GOOGLE_REDIRECT_PORT} 被占用"))?;
    let client_id = google_client_id();
    let auth_url = format!(
        "https://accounts.google.com/o/oauth2/v2/auth?{}",
        form_encode(&[
            ("client_id", client_id.as_str()),
            ("redirect_uri", redirect_uri.as_str()),
            ("response_type", "code"),
            ("scope", GOOGLE_SCOPE),
            ("access_type", "offline"),
            ("prompt", "select_account"),
        ])
    );
    open_system_browser(&auth_url)?;

    let (sender, receiver) = mpsc::channel();
    std::thread::spawn(move || {
        let _ = sender.send(listener.accept());
    });
    let (mut stream, _) = receiver
        .recv_timeout(Duration::from_secs(180))
        .map_err(|_| "登录超时，请重新登录 Google".to_string())?
        .map_err(|error| format!("没有收到 Google 登录回调: {error}"))?;
    stream
        .set_read_timeout(Some(Duration::from_secs(10)))
        .map_err(|error| error.to_string())?;
    let mut request = String::new();
    let mut buffer = [0_u8; 4096];
    while !request.contains("\r\n\r\n") && request.len() < 16_384 {
        match stream.read(&mut buffer) {
            Ok(0) | Err(_) => break,
            Ok(size) => request.push_str(&String::from_utf8_lossy(&buffer[..size])),
        }
    }
    let code = authorization_code(&request);
    let page = match &code {
        Ok(_) => "登录成功，可以关闭这个页面。",
        Err(error) => error.as_str(),
    };
    let body = format!("<html><body><p>{page}</p></body></html>");
    let response = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    let _ = stream.write_all(response.as_bytes());
    let code = code?;
    let session = exchange_authorization_code(&code, &redirect_uri).await?;
    save_google_session(&session)
}

pub async fn query_gemini() -> Result<GeminiQueryResult, String> {
    let _busy = GeminiBusyGuard::try_acquire()?;
    let mut session = load_google_session().ok_or_else(|| "AUTHENTICATION_REQUIRED".to_string())?;
    if session.expires_at <= Utc::now().timestamp() + 60 {
        session = match refresh_google_session(&session).await {
            Ok(refreshed) => refreshed,
            Err(error) => {
                if error == "AUTHENTICATION_REQUIRED" {
                    clear_google_session();
                }
                return Err(error);
            }
        };
        save_google_session(&session)?;
    }

    let client = http_client()?;
    let response = client
        .post(QUOTA_URL)
        .bearer_auth(&session.access_token)
        .header("User-Agent", QUOTA_USER_AGENT)
        .json(&serde_json::json!({}))
        .send()
        .await
        .map_err(|_| "无法连接 Google，请确认梯子已接管系统代理".to_string())?;
    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|_| "Google 额度响应无法读取".to_string())?;
    if status == reqwest::StatusCode::UNAUTHORIZED || status == reqwest::StatusCode::FORBIDDEN {
        clear_google_session();
        return Err("AUTHENTICATION_REQUIRED".to_string());
    }
    if !status.is_success() {
        return Err("Google 额度查询失败".to_string());
    }

    let value: Value = serde_json::from_str(&body).map_err(|_| "Google 额度响应不是有效 JSON".to_string())?;
    let result = extract_gemini_windows(&value);
    if result.five_hour.is_none() && result.weekly.is_none() {
        return Err("没有返回 Gemini 额度".to_string());
    }

    Ok(result)
}

fn google_entry() -> Result<Entry, String> {
    Entry::new(KEYRING_SERVICE, GOOGLE_ACCOUNT).map_err(|error| format!("无法访问系统安全存储: {error}"))
}

fn load_google_session() -> Option<GoogleSession> {
    let entry = google_entry().ok()?;
    let serialized = entry.get_password().ok()?;
    serde_json::from_str(&serialized).ok()
}

fn save_google_session(session: &GoogleSession) -> Result<(), String> {
    let entry = google_entry()?;
    let serialized = serde_json::to_string(session).map_err(|error| error.to_string())?;
    entry
        .set_password(&serialized)
        .map_err(|error| format!("无法写入系统安全存储: {error}"))
}

async fn exchange_authorization_code(code: &str, redirect_uri: &str) -> Result<GoogleSession, String> {
    let client = http_client()?;
    let client_id = google_client_id();
    let client_secret = google_client_secret();
    let response = client
        .post("https://oauth2.googleapis.com/token")
        .header("Content-Type", "application/x-www-form-urlencoded")
        .body(form_encode(&[
            ("client_id", client_id.as_str()),
            ("client_secret", client_secret.as_str()),
            ("code", code),
            ("redirect_uri", redirect_uri),
            ("grant_type", "authorization_code"),
        ]))
        .send()
        .await
        .map_err(|_| "无法连接 Google，请确认梯子已接管系统代理".to_string())?;
    let body = response
        .json::<Value>()
        .await
        .map_err(|_| "Google 登录响应不是有效 JSON".to_string())?;
    google_session_from_token(&body, None)
}

async fn refresh_google_session(session: &GoogleSession) -> Result<GoogleSession, String> {
    let client = http_client()?;
    let client_id = google_client_id();
    let client_secret = google_client_secret();
    let response = client
        .post("https://oauth2.googleapis.com/token")
        .header("Content-Type", "application/x-www-form-urlencoded")
        .body(form_encode(&[
            ("client_id", client_id.as_str()),
            ("client_secret", client_secret.as_str()),
            ("refresh_token", session.refresh_token.as_str()),
            ("grant_type", "refresh_token"),
        ]))
        .send()
        .await
        .map_err(|_| "无法连接 Google，请确认梯子已接管系统代理".to_string())?;
    let status = response.status();
    let body = response
        .json::<Value>()
        .await
        .map_err(|_| "Google 登录响应不是有效 JSON".to_string())?;
    if status == reqwest::StatusCode::UNAUTHORIZED || status == reqwest::StatusCode::BAD_REQUEST {
        return Err("AUTHENTICATION_REQUIRED".to_string());
    }
    if !status.is_success() {
        return Err("Google 登录已失效，请重新登录".to_string());
    }

    google_session_from_token(&body, Some(session.refresh_token.as_str()))
}

fn google_session_from_token(body: &Value, previous_refresh_token: Option<&str>) -> Result<GoogleSession, String> {
    if body.get("error").and_then(Value::as_str).is_some() {
        return Err("Google 登录未完成".to_string());
    }

    let access_token = body
        .get("access_token")
        .and_then(Value::as_str)
        .filter(|token| !token.trim().is_empty())
        .ok_or_else(|| "Google 登录响应中没有访问令牌".to_string())?
        .to_string();
    let refresh_token = body
        .get("refresh_token")
        .and_then(Value::as_str)
        .map(str::to_string)
        .or_else(|| previous_refresh_token.map(str::to_string))
        .ok_or_else(|| "Google 登录响应中没有刷新令牌".to_string())?;
    let expires_in = body.get("expires_in").and_then(Value::as_i64).unwrap_or(3600);

    Ok(GoogleSession {
        refresh_token,
        access_token,
        expires_at: Utc::now().timestamp() + expires_in,
    })
}

fn extract_gemini_windows(value: &Value) -> GeminiQueryResult {
    let mut five_hour = None;
    let mut weekly = None;
    let groups = value.get("groups").and_then(Value::as_array);
    for group in groups.into_iter().flatten() {
        let buckets = group.get("buckets").and_then(Value::as_array);
        for bucket in buckets.into_iter().flatten() {
            let bucket_id = bucket.get("bucketId").and_then(Value::as_str).unwrap_or("");
            if !bucket_id.starts_with("gemini-") {
                continue;
            }
            let window = gemini_window(bucket);
            if bucket_id.contains("5h") {
                five_hour = window;
            } else if bucket_id.contains("weekly") {
                weekly = window;
            }
        }
    }

    GeminiQueryResult { five_hour, weekly }
}

fn gemini_window(bucket: &Value) -> Option<GeminiWindow> {
    let fraction = bucket.get("remainingFraction")?.as_f64()?;
    if !fraction.is_finite() {
        return None;
    }

    Some(GeminiWindow {
        remaining_fraction: fraction.clamp(0.0, 1.0),
        reset_time: bucket
            .get("resetTime")
            .and_then(Value::as_str)
            .map(str::to_string),
    })
}

fn authorization_code(request: &str) -> Result<String, String> {
    let path = request
        .lines()
        .next()
        .and_then(|line| line.split_whitespace().nth(1))
        .ok_or_else(|| "浏览器没有返回授权码".to_string())?;
    let url = reqwest::Url::parse(&format!("http://localhost{path}"))
        .map_err(|_| "无法识别授权回调".to_string())?;
    if let Some(error) = url
        .query_pairs()
        .find(|(key, _)| key == "error")
        .map(|(_, value)| value.into_owned())
    {
        return Err(format!("Google 登录未完成: {error}"));
    }

    url.query_pairs()
        .find(|(key, _)| key == "code")
        .map(|(_, value)| value.into_owned())
        .filter(|code| !code.trim().is_empty())
        .ok_or_else(|| "浏览器没有返回授权码".to_string())
}

fn open_system_browser(url: &str) -> Result<(), String> {
    let result = if cfg!(windows) {
        Command::new("rundll32")
            .args(["url.dll,FileProtocolHandler", url])
            .spawn()
    } else if cfg!(target_os = "macos") {
        Command::new("open").arg(url).spawn()
    } else {
        Command::new("xdg-open").arg(url).spawn()
    };

    result
        .map(|_| ())
        .map_err(|error| format!("无法打开系统浏览器: {error}"))
}

fn parse_windows_proxy_server(raw: &str) -> Option<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }

    if trimmed.contains(';') || trimmed.contains('=') {
        let mut https_target = None;
        let mut http_target = None;
        let mut socks_target = None;

        for part in trimmed.split(';') {
            let part = part.trim();
            if let Some((scheme, addr)) = part.split_once('=') {
                let scheme = scheme.trim().to_ascii_lowercase();
                let addr = addr.trim();
                if addr.is_empty() {
                    continue;
                }
                match scheme.as_str() {
                    "https" => https_target = Some(addr),
                    "http" => http_target = Some(addr),
                    "socks" | "socks5" => socks_target = Some(addr),
                    _ => {}
                }
            }
        }

        if let Some(target) = https_target.or(http_target) {
            return Some(if target.starts_with("http://") || target.starts_with("https://") {
                target.to_string()
            } else {
                format!("http://{target}")
            });
        }

        if let Some(target) = socks_target {
            return Some(if target.starts_with("socks5://") || target.starts_with("socks5h://") {
                target.to_string()
            } else {
                format!("socks5://{target}")
            });
        }
    }

    Some(if trimmed.starts_with("http://") || trimmed.starts_with("https://") || trimmed.starts_with("socks5://") {
        trimmed.to_string()
    } else {
        format!("http://{trimmed}")
    })
}

fn detect_system_or_local_proxy() -> Option<String> {
    #[cfg(windows)]
    {
        if let Ok(settings) = windows_registry::CURRENT_USER
            .open("Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings")
        {
            if settings.get_u32("ProxyEnable").unwrap_or(0) == 1 {
                if let Ok(server) = settings.get_string("ProxyServer") {
                    if let Some(parsed) = parse_windows_proxy_server(&server) {
                        return Some(parsed);
                    }
                }
            }
        }
    }

    for env_var in &["HTTPS_PROXY", "https_proxy", "ALL_PROXY", "all_proxy", "HTTP_PROXY", "http_proxy"] {
        if let Ok(val) = std::env::var(env_var) {
            let val = val.trim();
            if !val.is_empty() {
                return Some(if val.starts_with("http://") || val.starts_with("https://") || val.starts_with("socks5://") {
                    val.to_string()
                } else {
                    format!("http://{val}")
                });
            }
        }
    }

    // Common local proxy ports (NiuBi/Clash: 7890, Clash Verge: 7897, v2rayN: 10809, etc.)
    for port in [7890, 7897, 10808, 10809, 20170] {
        let addr = format!("127.0.0.1:{port}");
        if let Ok(socket_addr) = addr.parse() {
            if std::net::TcpStream::connect_timeout(&socket_addr, Duration::from_millis(60)).is_ok() {
                return Some(format!("http://127.0.0.1:{port}"));
            }
        }
    }

    None
}

fn http_client() -> Result<Client, String> {
    let mut builder = Client::builder()
        .timeout(Duration::from_secs(20));

    if let Some(proxy_addr) = detect_system_or_local_proxy() {
        if let Ok(proxy) = reqwest::Proxy::all(&proxy_addr) {
            builder = builder.proxy(proxy);
        }
    }

    builder.build().map_err(|error| format!("无法创建网络客户端: {error}"))
}

fn form_encode(pairs: &[(&str, &str)]) -> String {
    pairs
        .iter()
        .map(|(key, value)| format!("{}={}", url_encode(key), url_encode(value)))
        .collect::<Vec<_>>()
        .join("&")
}

fn url_encode(value: &str) -> String {
    let mut encoded = String::new();
    for byte in value.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                encoded.push(byte as char);
            }
            _ => encoded.push_str(&format!("%{byte:02X}")),
        }
    }
    encoded
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn unmasks_client_credentials_correctly() {
        let cid = google_client_id();
        let sec = google_client_secret();
        assert_eq!(cid.len(), 73);
        assert!(cid.ends_with(".apps.googleusercontent.com"));
        assert_eq!(sec.len(), 35);
        assert!(sec.starts_with("GOCSPX-"));
    }

    #[test]
    fn parses_windows_proxy_server_formats() {
        assert_eq!(
            parse_windows_proxy_server("http=127.0.0.1:7890;https=127.0.0.1:7890;socks=127.0.0.1:7890"),
            Some("http://127.0.0.1:7890".to_string())
        );
        assert_eq!(
            parse_windows_proxy_server("https=127.0.0.1:7890;http=127.0.0.1:7890"),
            Some("http://127.0.0.1:7890".to_string())
        );
        assert_eq!(
            parse_windows_proxy_server("127.0.0.1:7890"),
            Some("http://127.0.0.1:7890".to_string())
        );
        assert_eq!(
            parse_windows_proxy_server("socks=127.0.0.1:1080"),
            Some("socks5://127.0.0.1:1080".to_string())
        );
        assert_eq!(parse_windows_proxy_server("   "), None);
    }

    #[test]
    fn accepts_a_bare_host_and_keeps_an_explicit_port() {
        assert_eq!(normalize_site(" code.3rcd.com ").unwrap(), "https://code.3rcd.com");
        assert_eq!(
            normalize_site("https://code.3rcd.com/api/v1").unwrap(),
            "https://code.3rcd.com"
        );
        assert_eq!(normalize_site("http://127.0.0.1:8787").unwrap(), "http://127.0.0.1:8787");
        assert!(normalize_site("   ").is_err());
    }

    #[test]
    fn keeps_only_the_two_gemini_windows() {
        let result = extract_gemini_windows(&json!({
            "groups": [
                {
                    "buckets": [
                        { "bucketId": "gemini-weekly", "remainingFraction": 0.9076349, "resetTime": "2026-10-10T17:19:42Z" },
                        { "bucketId": "gemini-5h", "remainingFraction": 1.4, "resetTime": "2026-10-04T07:10:00Z" }
                    ]
                },
                {
                    "buckets": [
                        { "bucketId": "3p-weekly", "remainingFraction": 0.2, "resetTime": "2026-10-10T20:48:53Z" },
                        { "bucketId": "3p-5h", "remainingFraction": 0.2, "resetTime": "2026-10-04T01:48:53Z" }
                    ]
                }
            ]
        }));

        assert_eq!(result.five_hour.unwrap().remaining_fraction, 1.0);
        assert_eq!(result.weekly.unwrap().remaining_fraction, 0.9076349);
    }

    #[test]
    fn reports_a_missing_gemini_window_without_inventing_it() {
        let result = extract_gemini_windows(&json!({
            "groups": [{ "buckets": [{ "bucketId": "gemini-weekly", "remainingFraction": 0.5, "resetTime": "2026-10-10T17:19:42Z" }] }]
        }));

        assert!(result.five_hour.is_none());
        assert!(result.weekly.is_some());
    }
}

