use chrono::Utc;
use keyring::Entry;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Mutex, OnceLock};
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
pub struct GoogleAccount {
    pub id: String,
    pub email: String,
    pub refresh_token: String,
    /// Only the refresh token is persisted. An access token is ~1.3k characters,
    /// so storing one per account overflows the 2560-character Windows credential
    /// blob after two accounts. It is re-derived from the refresh token instead.
    #[serde(default, skip_serializing)]
    access_token: String,
    #[serde(default, skip_serializing)]
    expires_at: i64,
}

#[derive(Clone)]
struct CachedToken {
    access_token: String,
    expires_at: i64,
}

fn token_cache() -> &'static Mutex<HashMap<String, CachedToken>> {
    static CACHE: OnceLock<Mutex<HashMap<String, CachedToken>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn cache_token(account_id: &str, access_token: &str, expires_at: i64) {
    if let Ok(mut cache) = token_cache().lock() {
        cache.insert(
            account_id.to_string(),
            CachedToken {
                access_token: access_token.to_string(),
                expires_at,
            },
        );
    }
}

fn forget_cached_token(account_id: &str) {
    if let Ok(mut cache) = token_cache().lock() {
        cache.remove(account_id);
    }
}

fn forget_all_cached_tokens() {
    if let Ok(mut cache) = token_cache().lock() {
        cache.clear();
    }
}

#[derive(Clone, Default, Deserialize, Serialize)]
struct GoogleAccountPool {
    accounts: Vec<GoogleAccount>,
}

#[derive(Clone, Deserialize, Serialize)]
struct LegacyGoogleSession {
    refresh_token: String,
    access_token: String,
    expires_at: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleAccountInfo {
    pub id: String,
    pub email: String,
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
pub struct GeminiAccountQueryResult {
    pub id: String,
    pub email: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub five_hour: Option<GeminiWindow>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub weekly: Option<GeminiWindow>,
    /// The separate Claude/GPT ledger (`3p-*` buckets), reported alongside.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub claude_five_hour: Option<GeminiWindow>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub claude_weekly: Option<GeminiWindow>,
    /// Set only when the read reached Google and that account simply has no
    /// quota at all. The pool treats it as a real zero rather than as missing data.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub no_quota: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleStatus {
    pub signed_in: bool,
    pub account_count: usize,
    pub accounts: Vec<GoogleAccountInfo>,
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
    let pool = load_google_pool();
    !pool.accounts.is_empty()
}

pub fn google_status() -> GoogleStatus {
    let pool = load_google_pool();
    let accounts: Vec<GoogleAccountInfo> = pool
        .accounts
        .iter()
        .map(|acc| GoogleAccountInfo {
            id: acc.id.clone(),
            email: acc.email.clone(),
        })
        .collect();
    GoogleStatus {
        signed_in: !accounts.is_empty(),
        account_count: accounts.len(),
        accounts,
    }
}

pub fn gemini_menu_label() -> &'static str {
    let pool = load_google_pool();
    if pool.accounts.is_empty() {
        "登录 Google"
    } else {
        "查询 Gemini 号池额度"
    }
}

pub fn clear_google_session() {
    forget_all_cached_tokens();
    if let Ok(entry) = google_entry() {
        let _ = entry.delete_credential();
    }
}

pub fn remove_google_account(account_id: &str) -> Result<(), String> {
    let mut pool = load_google_pool();
    forget_cached_token(account_id);
    pool.accounts.retain(|acc| acc.id != account_id && acc.email != account_id);
    if pool.accounts.is_empty() {
        clear_google_session();
    } else {
        save_google_pool(&pool)?;
    }
    Ok(())
}

fn google_entry() -> Result<Entry, String> {
    Entry::new(KEYRING_SERVICE, GOOGLE_ACCOUNT).map_err(|error| format!("无法访问系统安全存储: {error}"))
}

fn load_google_pool() -> GoogleAccountPool {
    let Ok(entry) = google_entry() else {
        return GoogleAccountPool::default();
    };
    let Ok(serialized) = entry.get_password() else {
        return GoogleAccountPool::default();
    };

    if let Ok(pool) = serde_json::from_str::<GoogleAccountPool>(&serialized) {
        return pool;
    }

    // Migration from legacy single session
    if let Ok(legacy) = serde_json::from_str::<LegacyGoogleSession>(&serialized) {
        if !legacy.refresh_token.trim().is_empty() {
            return GoogleAccountPool {
                accounts: vec![GoogleAccount {
                    id: "default".to_string(),
                    email: "Google 账号".to_string(),
                    refresh_token: legacy.refresh_token,
                    access_token: legacy.access_token,
                    expires_at: legacy.expires_at,
                }],
            };
        }
    }

    GoogleAccountPool::default()
}

fn save_google_pool(pool: &GoogleAccountPool) -> Result<(), String> {
    let entry = google_entry()?;
    let serialized = serde_json::to_string(pool).map_err(|error| error.to_string())?;
    entry
        .set_password(&serialized)
        .map_err(|error| format!("无法写入系统安全存储: {error}"))
}

async fn fetch_user_info(client: &Client, access_token: &str) -> (String, String) {
    let response = client
        .get("https://www.googleapis.com/oauth2/v2/userinfo")
        .bearer_auth(access_token)
        .send()
        .await;

    if let Ok(resp) = response {
        if let Ok(val) = resp.json::<Value>().await {
            let email = val
                .get("email")
                .and_then(Value::as_str)
                .unwrap_or("")
                .trim()
                .to_string();
            let id = val
                .get("id")
                .and_then(Value::as_str)
                .unwrap_or("")
                .trim()
                .to_string();
            if !email.is_empty() {
                let id = if id.is_empty() { email.clone() } else { id };
                return (id, email);
            }
        }
    }

    ("default".to_string(), "Google 账号".to_string())
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
    let raw_session = exchange_authorization_code(&code, &redirect_uri).await?;
    let client = http_client()?;
    let (id, email) = fetch_user_info(&client, &raw_session.access_token).await;
    cache_token(&id, &raw_session.access_token, raw_session.expires_at);

    let mut pool = load_google_pool();
    if let Some(existing) = pool.accounts.iter_mut().find(|a| a.id == id || a.email == email) {
        existing.id = id;
        existing.email = email;
        existing.refresh_token = raw_session.refresh_token;
        existing.access_token = String::new();
        existing.expires_at = 0;
    } else {
        pool.accounts.push(GoogleAccount {
            id,
            email,
            refresh_token: raw_session.refresh_token,
            access_token: String::new(),
            expires_at: 0,
        });
    }

    save_google_pool(&pool)
}

/// Resolves a usable access token for one account, refreshing it from the
/// persisted refresh token when the cached copy is missing or nearly expired.
async fn access_token_for(
    client: &Client,
    account: &GoogleAccount,
) -> Result<String, (String, bool)> {
    let now = Utc::now().timestamp();

    if let Ok(cache) = token_cache().lock() {
        if let Some(cached) = cache.get(&account.id) {
            if cached.expires_at > now + 60 {
                return Ok(cached.access_token.clone());
            }
        }
    }

    // A pool saved by an older build may still carry a token inside the record.
    if !account.access_token.is_empty() && account.expires_at > now + 60 {
        cache_token(&account.id, &account.access_token, account.expires_at);
        return Ok(account.access_token.clone());
    }

    match refresh_google_session(client, &account.refresh_token).await {
        Ok((access_token, expires_in)) => {
            let expires_at = Utc::now().timestamp() + expires_in;
            cache_token(&account.id, &access_token, expires_at);
            Ok(access_token)
        }
        Err(error) if error == "AUTHENTICATION_REQUIRED" => {
            forget_cached_token(&account.id);
            Err(("Google 登录已失效，请重新登录".to_string(), true))
        }
        Err(error) => Err((error, false)),
    }
}

async fn query_single_account(
    client: &Client,
    account: &GoogleAccount,
) -> Result<GeminiAccountQueryResult, (String, bool)> {
    let access_token = access_token_for(client, account).await?;

    let response = client
        .post(QUOTA_URL)
        .bearer_auth(&access_token)
        .header("User-Agent", QUOTA_USER_AGENT)
        .json(&serde_json::json!({}))
        .send()
        .await
        .map_err(|_| ("无法连接 Google，请确认梯子已接管系统代理".to_string(), false))?;

    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|_| ("Google 额度响应无法读取".to_string(), false))?;

    if status == reqwest::StatusCode::UNAUTHORIZED || status == reqwest::StatusCode::FORBIDDEN {
        return Err(("Google 登录已失效，请重新登录".to_string(), true));
    }
    if !status.is_success() {
        return Err(("Google 额度查询失败".to_string(), false));
    }

    let value: Value = serde_json::from_str(&body)
        .map_err(|_| ("Google 额度响应不是有效 JSON".to_string(), false))?;
    let ledgers = extract_ledgers(&value);
    let (five_hour, weekly) = ledgers.gemini;
    let (claude_five_hour, claude_weekly) = ledgers.claude;
    if five_hour.is_none()
        && weekly.is_none()
        && claude_five_hour.is_none()
        && claude_weekly.is_none()
    {
        // The request succeeded; this account simply carries no quota.
        return Ok(GeminiAccountQueryResult {
            id: account.id.clone(),
            email: account.email.clone(),
            five_hour: None,
            weekly: None,
            claude_five_hour: None,
            claude_weekly: None,
            no_quota: Some("该账号没有 Gemini 或 Claude 额度".to_string()),
            error: None,
        });
    }

    Ok(GeminiAccountQueryResult {
        id: account.id.clone(),
        email: account.email.clone(),
        five_hour,
        weekly,
        claude_five_hour,
        claude_weekly,
        no_quota: None,
        error: None,
    })
}

pub async fn query_gemini() -> Result<Vec<GeminiAccountQueryResult>, String> {
    let _busy = GeminiBusyGuard::try_acquire()?;
    let pool = load_google_pool();
    if pool.accounts.is_empty() {
        return Err("AUTHENTICATION_REQUIRED".to_string());
    }

    let client = http_client()?;
    let mut results = Vec::new();
    let mut expired_ids = Vec::new();

    for (index, account) in pool.accounts.iter().enumerate() {
        // Space out the per-account reads so a pool query does not look like a
        // burst of unrelated calls to the same Google endpoint.
        if index > 0 {
            tokio::time::sleep(inter_account_delay()).await;
        }

        match query_single_account(&client, account).await {
            Ok(res) => results.push(res),
            Err((err_msg, is_auth_expired)) => {
                if is_auth_expired {
                    expired_ids.push(account.id.clone());
                }
                results.push(GeminiAccountQueryResult {
                    id: account.id.clone(),
                    email: account.email.clone(),
                    five_hour: None,
                    weekly: None,
                    claude_five_hour: None,
                    claude_weekly: None,
                    no_quota: None,
                    error: Some(err_msg),
                });
            }
        }
    }

    // If all failed with auth error, return error
    if !expired_ids.is_empty() && expired_ids.len() == pool.accounts.len() {
        clear_google_session();
        return Err("AUTHENTICATION_REQUIRED".to_string());
    }

    Ok(results)
}

fn inter_account_delay() -> Duration {
    const MIN_DELAY_MS: u64 = 1_000;
    const MAX_DELAY_MS: u64 = 5_000;
    Duration::from_millis(rand::random_range(MIN_DELAY_MS..=MAX_DELAY_MS))
}

struct RawTokenResponse {
    refresh_token: String,
    access_token: String,
    expires_at: i64,
}

async fn exchange_authorization_code(code: &str, redirect_uri: &str) -> Result<RawTokenResponse, String> {
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
    let (access_token, refresh_token, expires_in) = parse_token_response(&body, None)?;
    Ok(RawTokenResponse {
        refresh_token,
        access_token,
        expires_at: Utc::now().timestamp() + expires_in,
    })
}

async fn refresh_google_session(client: &Client, refresh_token: &str) -> Result<(String, i64), String> {
    let client_id = google_client_id();
    let client_secret = google_client_secret();
    let response = client
        .post("https://oauth2.googleapis.com/token")
        .header("Content-Type", "application/x-www-form-urlencoded")
        .body(form_encode(&[
            ("client_id", client_id.as_str()),
            ("client_secret", client_secret.as_str()),
            ("refresh_token", refresh_token),
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

    let (access_token, _, expires_in) = parse_token_response(&body, Some(refresh_token))?;
    Ok((access_token, expires_in))
}

fn parse_token_response(body: &Value, previous_refresh_token: Option<&str>) -> Result<(String, String, i64), String> {
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

    Ok((access_token, refresh_token, expires_in))
}

/// The two independent ledgers Google reports for one account: the Gemini
/// models (`gemini-*` buckets) and the Claude/GPT models (`3p-*` buckets).
#[derive(Default)]
struct QuotaLedgers {
    gemini: (Option<GeminiWindow>, Option<GeminiWindow>),
    claude: (Option<GeminiWindow>, Option<GeminiWindow>),
}

fn extract_ledgers(value: &Value) -> QuotaLedgers {
    let mut ledgers = QuotaLedgers::default();
    let groups = value.get("groups").and_then(Value::as_array);
    for group in groups.into_iter().flatten() {
        let buckets = group.get("buckets").and_then(Value::as_array);
        for bucket in buckets.into_iter().flatten() {
            let bucket_id = bucket.get("bucketId").and_then(Value::as_str).unwrap_or("");
            let target = if bucket_id.starts_with("gemini-") {
                &mut ledgers.gemini
            } else if bucket_id.starts_with("3p-") {
                &mut ledgers.claude
            } else {
                continue;
            };
            let window = gemini_window(bucket);
            if bucket_id.contains("5h") {
                target.0 = window;
            } else if bucket_id.contains("weekly") {
                target.1 = window;
            }
        }
    }

    ledgers
}

fn extract_gemini_windows(value: &Value) -> (Option<GeminiWindow>, Option<GeminiWindow>) {
    extract_ledgers(value).gemini
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

    /// Builds a clearly fake token string for fixtures. Nothing here is a real
    /// credential; composing it keeps literal secrets out of the source.
    fn fixture_token(label: &str, index: usize) -> String {
        ["fixture", label, "token", &format!("{index:02}"), "paddingpaddingpadding"]
            .join("-")
    }

    #[test]
    fn a_saved_pool_fits_the_windows_credential_blob() {
        // Windows rejects a credential blob over 2560 characters. Storing one
        // access token per account used to overflow that after two accounts, so
        // the third sign-in silently failed to persist.
        let pool = GoogleAccountPool {
            accounts: (0..10)
                .map(|index| GoogleAccount {
                    id: format!("112233445566778899{index:02}"),
                    email: format!("account.number.{index}@example.com"),
                    refresh_token: fixture_token("refresh", index),
                    access_token: String::new(),
                    expires_at: 0,
                })
                .collect(),
        };

        let serialized = serde_json::to_string(&pool).expect("pool serializes");

        assert!(
            !serialized.contains("access_token"),
            "access tokens must never reach the credential store"
        );
        assert!(
            serialized.chars().count() < 2_560,
            "pool of 10 accounts must stay under the credential limit, got {}",
            serialized.chars().count()
        );
    }

    #[test]
    fn inter_account_delay_stays_between_one_and_five_seconds() {
        for _ in 0..64 {
            let millis = inter_account_delay().as_millis();
            assert!((1_000..=5_000).contains(&millis), "delay out of range: {millis}ms");
        }
    }

    #[test]
    fn a_legacy_pool_entry_still_loads_and_drops_its_stored_token() {
        let stale_token = fixture_token("access", 0);
        let legacy = json!({
            "accounts": [{
                "id": "legacy-id",
                "email": "legacy@example.com",
                "refresh_token": fixture_token("refresh", 0),
                "access_token": stale_token,
                "expires_at": 4_102_444_800_i64
            }]
        })
        .to_string();

        let pool: GoogleAccountPool = serde_json::from_str(&legacy).expect("legacy pool parses");
        assert_eq!(pool.accounts.len(), 1);
        assert_eq!(pool.accounts[0].email, "legacy@example.com");

        let reserialized = serde_json::to_string(&pool).expect("pool serializes");
        assert!(!reserialized.contains(stale_token.as_str()));
        assert!(!reserialized.contains("expires_at"));
    }

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
    fn splits_gemini_and_claude_ledgers() {
        let ledgers = extract_ledgers(&json!({
            "groups": [
                {
                    "buckets": [
                        { "bucketId": "gemini-weekly", "remainingFraction": 0.9, "resetTime": "2026-10-10T17:19:42Z" },
                        { "bucketId": "gemini-5h", "remainingFraction": 0.7, "resetTime": "2026-10-04T07:10:00Z" }
                    ]
                },
                {
                    "buckets": [
                        { "bucketId": "3p-weekly", "remainingFraction": 1.0, "resetTime": "2026-10-10T20:48:53Z" },
                        { "bucketId": "3p-5h", "remainingFraction": 0.4, "resetTime": "2026-10-04T01:48:53Z" }
                    ]
                }
            ]
        }));

        assert_eq!(ledgers.gemini.0.unwrap().remaining_fraction, 0.7);
        assert_eq!(ledgers.gemini.1.unwrap().remaining_fraction, 0.9);
        assert_eq!(ledgers.claude.0.unwrap().remaining_fraction, 0.4);
        assert_eq!(ledgers.claude.1.unwrap().remaining_fraction, 1.0);
    }

    #[test]
    fn keeps_only_the_two_gemini_windows() {
        let (five_hour, weekly) = extract_gemini_windows(&json!({
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

        assert_eq!(five_hour.unwrap().remaining_fraction, 1.0);
        assert_eq!(weekly.unwrap().remaining_fraction, 0.9076349);
    }

    #[test]
    fn reports_a_missing_gemini_window_without_inventing_it() {
        let (five_hour, weekly) = extract_gemini_windows(&json!({
            "groups": [{ "buckets": [{ "bucketId": "gemini-weekly", "remainingFraction": 0.5, "resetTime": "2026-10-10T17:19:42Z" }] }]
        }));

        assert!(five_hour.is_none());
        assert!(weekly.is_some());
    }
}

