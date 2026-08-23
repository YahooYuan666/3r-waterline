use chrono::{DateTime, Duration as ChronoDuration, Utc};
use keyring::Entry;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{
    image::Image,
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, Runtime, State, WebviewWindow,
};
use tauri_plugin_autostart::ManagerExt as AutoLaunchManagerExt;

const API_BASE_URL: &str = "https://ai.3rcd.com/api/v1";
const KEYRING_SERVICE: &str = "com.threercd.waterline";
const KEYRING_ACCOUNT: &str = "3r-session";

type AuthStore = Arc<Mutex<Option<AuthSession>>>;

#[derive(Clone)]
struct AuthenticationState(AuthStore);

#[derive(Clone, Deserialize, Serialize)]
struct AuthSession {
    access_token: String,
    refresh_token: Option<String>,
    expires_at: i64,
}

#[derive(Deserialize)]
struct LoginCredentials {
    email: String,
    password: String,
}

#[derive(Serialize)]
struct LoginResult {
    auto_start_enabled: bool,
}

#[derive(Serialize)]
struct ClearDeviceResult {
    auto_start_disabled: bool,
}

fn session_entry() -> Result<Entry, String> {
    Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT)
        .map_err(|error| format!("无法访问系统安全存储: {error}"))
}

fn load_session() -> Option<AuthSession> {
    let entry = session_entry().ok()?;
    let serialized = entry.get_password().ok()?;
    serde_json::from_str(&serialized).ok()
}

fn save_session(session: &AuthSession) -> Result<(), String> {
    let entry = session_entry()?;
    let serialized = serde_json::to_string(session).map_err(|error| error.to_string())?;
    entry
        .set_password(&serialized)
        .map_err(|error| format!("无法写入系统安全存储: {error}"))
}

fn clear_session() {
    if let Ok(entry) = session_entry() {
        let _ = entry.delete_credential();
    }
}

fn response_data(body: Value) -> Result<Value, String> {
    if body.get("code").and_then(Value::as_i64) == Some(0) {
        return body
            .get("data")
            .cloned()
            .ok_or_else(|| "官方接口返回了空数据".to_string());
    }

    if body.get("access_token").and_then(Value::as_str).is_some() || body.is_array() {
        return Ok(body);
    }

    if body
        .get("data")
        .and_then(|data| data.get("access_token"))
        .and_then(Value::as_str)
        .is_some()
    {
        return body
            .get("data")
            .cloned()
            .ok_or_else(|| "官方接口返回了空数据".to_string());
    }

    Err(body
        .get("message")
        .and_then(Value::as_str)
        .unwrap_or("官方接口请求失败")
        .to_string())
}

fn numeric_value(item: &Value) -> Option<f64> {
    item.as_f64()
        .or_else(|| item.as_i64().map(|number| number as f64))
        .or_else(|| {
            item.as_str()
                .and_then(|text| text.trim().parse::<f64>().ok())
        })
}

fn numeric_field_any(value: &Value, keys: &[&str]) -> Option<f64> {
    keys.iter()
        .find_map(|key| value.get(*key).and_then(numeric_value))
}

fn text_field_any<'a>(value: &'a Value, keys: &[&str]) -> Option<&'a str> {
    keys.iter().find_map(|key| {
        value
            .get(*key)
            .and_then(Value::as_str)
            .filter(|text| !text.trim().is_empty())
    })
}

fn subscription_status(row: &Value) -> &'static str {
    match row.get("status").and_then(Value::as_str) {
        Some("active" | "valid" | "enabled") => "active",
        Some("expired" | "inactive" | "invalid" | "cancelled") => "inactive",
        _ => {
            let expires_at = text_field_any(row, &["expires_at", "expire_at", "expiration_at"])
                .and_then(|value| DateTime::parse_from_rfc3339(value).ok())
                .map(|value| value.with_timezone(&Utc));
            if expires_at.is_some_and(|value| value <= Utc::now()) {
                "inactive"
            } else {
                // The public /subscriptions response omits status for valid rows.
                "active"
            }
        }
    }
}

fn reset_countdown(start: Option<&str>, end: Option<&str>, window_hours: i64) -> Option<String> {
    let end_time = end
        .and_then(|value| DateTime::parse_from_rfc3339(value).ok())
        .map(|value| value.with_timezone(&Utc));
    let start_time = start
        .and_then(|value| DateTime::parse_from_rfc3339(value).ok())
        .map(|value| value.with_timezone(&Utc));
    let reset_at =
        end_time.or_else(|| start_time.map(|value| value + ChronoDuration::hours(window_hours)))?;
    let remaining = reset_at - Utc::now();
    let total_hours = remaining.num_hours().max(0);
    Some(format!("{}d {}h", total_hours / 24, total_hours % 24))
}

fn remaining_days_countdown(value: Option<f64>) -> Option<String> {
    let days = value?.floor();
    if !days.is_finite() || days < 0.0 || days > i64::MAX as f64 {
        return None;
    }

    Some(format!("{}d 0h", days as i64))
}

fn usd_pair(used: Option<f64>, limit: Option<f64>) -> Option<String> {
    let used = used?;
    let limit = limit?;
    if !used.is_finite() || !limit.is_finite() || limit <= 0.0 || used < 0.0 || used > limit {
        return None;
    }
    Some(format!("${used:.2} / ${limit:.2}"))
}

fn subscriptions_to_capture(value: Value) -> Result<String, String> {
    let rows = value
        .as_array()
        .cloned()
        .or_else(|| {
            value
                .get("subscriptions")
                .and_then(Value::as_array)
                .cloned()
        })
        .ok_or_else(|| "订阅接口返回格式无法识别".to_string())?;

    let cards = rows
        .iter()
        .enumerate()
        .map(|(index, row)| {
            let group = row.get("group").cloned().unwrap_or(Value::Null);
            let name = text_field_any(&group, &["name", "title", "display_name"])
                .filter(|name| !name.trim().is_empty())
                .map(str::to_string)
                .or_else(|| {
                    row.get("group_id")
                        .and_then(Value::as_i64)
                        .map(|id| format!("Group #{id}"))
                })
                .unwrap_or_else(|| format!("订阅 {}", index + 1));
            let status = subscription_status(row);
            let weekly_limit = numeric_field_any(
                &group,
                &[
                    "weekly_limit_usd",
                    "weekly_limit",
                    "weekly_total_usd",
                    "weekly_quota_usd",
                ],
            );
            let monthly_limit = numeric_field_any(
                &group,
                &[
                    "monthly_limit_usd",
                    "monthly_limit",
                    "monthly_total_usd",
                    "monthly_quota_usd",
                ],
            );
            let weekly_reset = reset_countdown(
                text_field_any(row, &["weekly_window_start", "weekly_start"]),
                text_field_any(
                    row,
                    &["weekly_window_end", "weekly_reset_at", "weekly_next_reset"],
                ),
                168,
            )
            .or_else(|| {
                remaining_days_countdown(numeric_field_any(
                    row,
                    &["weekly_remaining_days", "remaining_days"],
                ))
            });
            let weekly = usd_pair(
                numeric_field_any(
                    row,
                    &[
                        "weekly_usage_usd",
                        "weekly_used_usd",
                        "weekly_usage",
                        "weekly_used",
                    ],
                ),
                weekly_limit,
            )
            .map(|amounts| json!({ "amounts": amounts, "reset": weekly_reset }));
            let monthly_reset = reset_countdown(
                text_field_any(row, &["monthly_window_start", "monthly_start"]),
                text_field_any(
                    row,
                    &[
                        "monthly_window_end",
                        "monthly_reset_at",
                        "monthly_next_reset",
                    ],
                ),
                720,
            )
            .or_else(|| {
                remaining_days_countdown(numeric_field_any(
                    row,
                    &["monthly_remaining_days", "remaining_days"],
                ))
            });
            let monthly = usd_pair(
                numeric_field_any(
                    row,
                    &[
                        "monthly_usage_usd",
                        "monthly_used_usd",
                        "monthly_usage",
                        "monthly_used",
                    ],
                ),
                monthly_limit,
            )
            .map(|amounts| json!({ "amounts": amounts, "reset": monthly_reset }));
            let id = text_field_any(row, &["id", "subscription_id"]);
            json!({
                "id": id,
                "name": name,
                "status": status,
                "weekly": weekly,
                "monthly": monthly
            })
        })
        .collect::<Vec<_>>();

    serde_json::to_string(&json!({ "cards": cards })).map_err(|error| error.to_string())
}

async fn refresh_session(session: &AuthSession) -> Result<AuthSession, String> {
    let refresh_token = session
        .refresh_token
        .as_deref()
        .ok_or_else(|| "AUTHENTICATION_REQUIRED".to_string())?;
    let response = Client::new()
        .post(format!("{API_BASE_URL}/auth/refresh"))
        .json(&json!({ "refresh_token": refresh_token }))
        .send()
        .await
        .map_err(|error| format!("无法连接 3R 官方接口: {error}"))?;
    let status = response.status();
    let body = response
        .json::<Value>()
        .await
        .map_err(|error| format!("官方接口响应不是有效 JSON: {error}"))?;
    if !status.is_success() {
        return Err("AUTHENTICATION_REQUIRED".to_string());
    }
    let data = response_data(body)?;
    let access_token = data
        .get("access_token")
        .and_then(Value::as_str)
        .filter(|token| !token.trim().is_empty())
        .ok_or_else(|| "AUTHENTICATION_REQUIRED".to_string())?
        .to_string();
    let expires_in = data
        .get("expires_in")
        .and_then(Value::as_i64)
        .unwrap_or(3600);
    Ok(AuthSession {
        access_token,
        refresh_token: data
            .get("refresh_token")
            .and_then(Value::as_str)
            .map(str::to_string)
            .or_else(|| session.refresh_token.clone()),
        expires_at: Utc::now().timestamp() + expires_in,
    })
}

async fn fetch_subscription_capture(token: &str) -> Result<String, String> {
    let response = Client::new()
        // Match the page shown to the user. The /active variant omits short
        // top-up subscriptions that only expose expires_at.
        .get(format!("{API_BASE_URL}/subscriptions"))
        .bearer_auth(token)
        .send()
        .await
        .map_err(|error| format!("无法连接 3R 官方接口: {error}"))?;
    let status = response.status();
    let body = response
        .json::<Value>()
        .await
        .map_err(|error| format!("官方接口响应不是有效 JSON: {error}"))?;
    if status == reqwest::StatusCode::UNAUTHORIZED {
        return Err("AUTHENTICATION_REQUIRED".to_string());
    }
    if !status.is_success() {
        return Err(body
            .get("message")
            .and_then(Value::as_str)
            .unwrap_or("订阅读取失败")
            .to_string());
    }
    subscriptions_to_capture(response_data(body)?)
}

#[tauri::command]
async fn login_3r(
    credentials: LoginCredentials,
    auth: State<'_, AuthenticationState>,
    app: tauri::AppHandle,
) -> Result<LoginResult, String> {
    if credentials.email.trim().is_empty() || credentials.password.is_empty() {
        return Err("请输入邮箱和密码".to_string());
    }

    let response = Client::new()
        .post(format!("{API_BASE_URL}/auth/login"))
        .json(&json!({ "email": credentials.email.trim(), "password": credentials.password }))
        .send()
        .await
        .map_err(|error| format!("无法连接 3R 官方接口: {error}"))?;
    let status = response.status();
    let body = response
        .json::<Value>()
        .await
        .map_err(|error| format!("官方接口响应不是有效 JSON: {error}"))?;
    if !status.is_success() {
        return Err(body
            .get("message")
            .and_then(Value::as_str)
            .unwrap_or("登录失败，请检查账号密码或验证码")
            .to_string());
    }

    let data = response_data(body)?;
    let session = AuthSession {
        access_token: data
            .get("access_token")
            .and_then(Value::as_str)
            .filter(|token| !token.trim().is_empty())
            .ok_or_else(|| "登录响应中没有访问令牌".to_string())?
            .to_string(),
        refresh_token: data
            .get("refresh_token")
            .and_then(Value::as_str)
            .map(str::to_string),
        expires_at: Utc::now().timestamp()
            + data
                .get("expires_in")
                .and_then(Value::as_i64)
                .unwrap_or(3600),
    };
    save_session(&session)?;
    if let Ok(mut current) = auth.0.lock() {
        *current = Some(session);
    }
    let auto_start_enabled = app.autolaunch().enable().is_ok();
    Ok(LoginResult { auto_start_enabled })
}

#[tauri::command]
async fn request_subscription_capture(
    auth: State<'_, AuthenticationState>,
) -> Result<String, String> {
    let mut session = auth
        .0
        .lock()
        .ok()
        .and_then(|current| current.clone())
        .or_else(load_session)
        .ok_or_else(|| "AUTHENTICATION_REQUIRED".to_string())?;

    if session.expires_at <= Utc::now().timestamp() {
        session = match refresh_session(&session).await {
            Ok(refreshed) => refreshed,
            Err(error) => {
                clear_session();
                if let Ok(mut current) = auth.0.lock() {
                    *current = None;
                }
                return Err(error);
            }
        };
        save_session(&session)?;
        if let Ok(mut current) = auth.0.lock() {
            *current = Some(session.clone());
        }
    }

    match fetch_subscription_capture(&session.access_token).await {
        Ok(capture) => Ok(capture),
        Err(error) if error == "AUTHENTICATION_REQUIRED" => {
            clear_session();
            if let Ok(mut current) = auth.0.lock() {
                *current = None;
            }
            Err(error)
        }
        Err(error) => Err(error),
    }
}

#[tauri::command]
fn auto_start_enabled(app: tauri::AppHandle) -> Result<bool, String> {
    app.autolaunch()
        .is_enabled()
        .map_err(|error| format!("无法读取开机启动状态: {error}"))
}

#[tauri::command]
fn set_auto_start(enabled: bool, app: tauri::AppHandle) -> Result<bool, String> {
    let auto_start = app.autolaunch();
    if enabled {
        auto_start
            .enable()
            .map_err(|error| format!("无法启用开机自动启动: {error}"))?;
    } else {
        auto_start
            .disable()
            .map_err(|error| format!("无法关闭开机自动启动: {error}"))?;
    }

    auto_start
        .is_enabled()
        .map_err(|error| format!("无法读取开机启动状态: {error}"))
}

#[tauri::command]
fn clear_saved_session(
    auth: State<'_, AuthenticationState>,
    app: tauri::AppHandle,
) -> Result<ClearDeviceResult, String> {
    clear_session();
    if let Ok(mut current) = auth.0.lock() {
        *current = None;
    }
    let auto_start_disabled = app.autolaunch().disable().is_ok();
    Ok(ClearDeviceResult {
        auto_start_disabled,
    })
}

#[tauri::command]
fn hide_overlay(app: tauri::AppHandle) -> Result<(), String> {
    hide_main_overlay(&app)
}

#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}

fn show_main_overlay<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn restore_main_overlay<R: Runtime>(app: &AppHandle<R>) {
    show_main_overlay(app);
    emit_to_main_overlay(app, "restore-overlay", ());
}

fn open_settings_from_system_menu<R: Runtime>(app: &AppHandle<R>) {
    restore_main_overlay(app);
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(250));
        emit_to_main_overlay(&app, "open-settings", ());
    });
}

fn emit_to_main_overlay<R: Runtime, S: Serialize + Clone>(
    app: &AppHandle<R>,
    event: &str,
    payload: S,
) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.emit(event, payload);
    }
}

fn hide_main_overlay<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "找不到悬浮窗".to_string())?;
    window
        .hide()
        .map_err(|error| format!("无法隐藏悬浮窗: {error}"))
}

fn handle_menu_action<R: Runtime>(app: &AppHandle<R>, id: &str) {
    match id {
        "show" => restore_main_overlay(app),
        "hide" | "overlay-hide" => {
            let _ = hide_main_overlay(app);
        }
        "settings" | "overlay-settings" => {
            open_settings_from_system_menu(app);
        }
        "display-vessel" | "overlay-display-vessel" => {
            restore_main_overlay(app);
            emit_to_main_overlay(app, "select-display-mode", "vessel");
        }
        "display-traffic" | "overlay-display-traffic" => {
            restore_main_overlay(app);
            emit_to_main_overlay(app, "select-display-mode", "traffic");
        }
        "quit" | "overlay-quit" => app.exit(0),
        _ => {}
    }
}

#[tauri::command]
fn show_overlay_context_menu(window: WebviewWindow) -> Result<(), String> {
    let app = window.app_handle();
    let settings = MenuItem::with_id(app, "overlay-settings", "设置", true, None::<&str>)
        .map_err(|error| format!("无法创建菜单: {error}"))?;
    let vessel = MenuItem::with_id(
        app,
        "overlay-display-vessel",
        "圆形水瓶",
        true,
        None::<&str>,
    )
    .map_err(|error| format!("无法创建菜单: {error}"))?;
    let traffic = MenuItem::with_id(
        app,
        "overlay-display-traffic",
        "Traffic Monitor 横条",
        true,
        None::<&str>,
    )
    .map_err(|error| format!("无法创建菜单: {error}"))?;
    let hide = MenuItem::with_id(app, "overlay-hide", "隐藏悬浮窗", true, None::<&str>)
        .map_err(|error| format!("无法创建菜单: {error}"))?;
    let quit = MenuItem::with_id(app, "overlay-quit", "退出 3R 水位", true, None::<&str>)
        .map_err(|error| format!("无法创建菜单: {error}"))?;
    let separator =
        PredefinedMenuItem::separator(app).map_err(|error| format!("无法创建菜单: {error}"))?;
    let menu = Menu::with_items(
        app,
        &[
            &settings, &separator, &vessel, &traffic, &separator, &hide, &quit,
        ],
    )
    .map_err(|error| format!("无法创建菜单: {error}"))?;

    window
        .popup_menu(&menu)
        .map_err(|error| format!("无法显示右键菜单: {error}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let auth_store: AuthStore = Arc::new(Mutex::new(load_session()));
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            restore_main_overlay(app);
        }))
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .on_menu_event(|app, event| handle_menu_action(app, event.id().as_ref()))
        .manage(AuthenticationState(auth_store))
        .invoke_handler(tauri::generate_handler![
            login_3r,
            request_subscription_capture,
            auto_start_enabled,
            set_auto_start,
            clear_saved_session,
            hide_overlay,
            show_overlay_context_menu,
            quit_app
        ])
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_skip_taskbar(true);
            }

            let show = MenuItem::with_id(app, "show", "显示 3R 水位", true, None::<&str>)?;
            let hide = MenuItem::with_id(app, "hide", "隐藏悬浮窗", true, None::<&str>)?;
            let settings = MenuItem::with_id(app, "settings", "设置", true, None::<&str>)?;
            let vessel = MenuItem::with_id(app, "display-vessel", "圆形水瓶", true, None::<&str>)?;
            let traffic = MenuItem::with_id(
                app,
                "display-traffic",
                "Traffic Monitor 横条",
                true,
                None::<&str>,
            )?;
            let separator = PredefinedMenuItem::separator(app)?;
            let quit = MenuItem::with_id(app, "quit", "退出 3R 水位", true, None::<&str>)?;
            let menu = Menu::with_items(
                app,
                &[
                    &show, &hide, &settings, &separator, &vessel, &traffic, &separator, &quit,
                ],
            )?;

            TrayIconBuilder::with_id("3r-tray")
                .icon(Image::from_bytes(include_bytes!("../icons/32x32.png"))?)
                .tooltip("3R 水位")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        restore_main_overlay(&tray.app_handle());
                    }
                })
                .build(app)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running 3R Waterline");
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn omits_removed_weekly_period_and_keeps_changed_monthly_limit() {
        let capture = subscriptions_to_capture(json!([
            {
                "id": "gpt-4x",
                "status": "active",
                "group": {
                    "name": "GPT 4x",
                    "monthly_limit_usd": 2000.0
                },
                "monthly_usage_usd": 799.43,
                "monthly_window_end": "2099-01-01T00:00:00Z"
            }
        ]))
        .expect("capture should normalize");

        let value: Value = serde_json::from_str(&capture).expect("capture should be JSON");
        let card = &value["cards"][0];
        assert!(card["weekly"].is_null());
        assert_eq!(card["monthly"]["amounts"], "$799.43 / $2000.00");
        assert!(card["monthly"]["reset"].as_str().is_some());
        assert_eq!(card["id"], "gpt-4x");
    }

    #[test]
    fn keeps_period_when_server_does_not_supply_a_reset() {
        let capture = subscriptions_to_capture(json!([
            {
                "status": "active",
                "group": { "name": "No Reset", "monthly_limit_usd": 100.0 },
                "monthly_usage_usd": 1.0
            }
        ]))
        .expect("capture should normalize");

        let value: Value = serde_json::from_str(&capture).expect("capture should be JSON");
        assert_eq!(value["cards"][0]["monthly"]["amounts"], "$1.00 / $100.00");
        assert!(value["cards"][0]["monthly"]["reset"].is_null());
    }

    #[test]
    fn treats_an_unexpired_top_up_without_status_as_active() {
        let capture = subscriptions_to_capture(json!([
            {
                "id": "top-up",
                "expires_at": "2099-08-30T12:56:00Z",
                "group": { "name": "小加油包", "monthly_limit_usd": 50.0 },
                "monthly_usage_usd": 0.0
            }
        ]))
        .expect("capture should normalize");

        let value: Value = serde_json::from_str(&capture).expect("capture should be JSON");
        let card = &value["cards"][0];
        assert_eq!(card["status"], "active");
        assert_eq!(card["monthly"]["amounts"], "$0.00 / $50.00");
        assert!(card["monthly"]["reset"].is_null());
    }

    #[test]
    fn marks_an_expired_row_without_status_inactive() {
        let capture = subscriptions_to_capture(json!([
            {
                "expires_at": "2000-01-01T00:00:00Z",
                "group": { "name": "过期加油包", "monthly_limit_usd": 50.0 },
                "monthly_usage_usd": 0.0
            }
        ]))
        .expect("capture should normalize");

        let value: Value = serde_json::from_str(&capture).expect("capture should be JSON");
        assert_eq!(value["cards"][0]["status"], "inactive");
    }
}
