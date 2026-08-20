use serde::{Deserialize, Serialize};
use std::{
    sync::{Arc, Mutex},
    thread,
    time::Duration,
};
use tauri::{
    AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
};

const OFFICIAL_HOST: &str = "ai.3rcd.com";
const SUBSCRIPTIONS_URL: &str = "https://ai.3rcd.com/subscriptions";
const LOGIN_WINDOW_LABEL: &str = "official-login";

type CaptureStore = Arc<Mutex<Option<String>>>;

#[derive(Clone)]
struct SubscriptionCaptureState(CaptureStore);

#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct SubscriptionPeriodCapture {
    amounts: String,
    reset: String,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct SubscriptionCardCapture {
    name: String,
    status: String,
    weekly: Option<SubscriptionPeriodCapture>,
    monthly: Option<SubscriptionPeriodCapture>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct SubscriptionCapture {
    cards: Vec<SubscriptionCardCapture>,
}

fn is_official_3r_url(url: &tauri::Url) -> bool {
    url.scheme() == "https" && url.host_str() == Some(OFFICIAL_HOST)
}

fn is_subscriptions_url(url: &tauri::Url) -> bool {
    is_official_3r_url(url) && url.path() == "/subscriptions"
}

fn valid_text(value: &str, maximum_length: usize) -> bool {
    !value.trim().is_empty() && value.len() <= maximum_length
}

fn sanitize_capture(encoded_script_result: &str) -> Option<String> {
    let serialized_capture = serde_json::from_str::<String>(encoded_script_result).ok()?;
    let capture = serde_json::from_str::<SubscriptionCapture>(&serialized_capture).ok()?;

    if capture.cards.is_empty() || capture.cards.len() > 16 {
        return None;
    }

    let cards = capture
        .cards
        .into_iter()
        .map(|card| {
            if !valid_text(&card.name, 160) {
                return None;
            }

            let status = match card.status.as_str() {
                "active" | "inactive" | "unknown" => card.status,
                _ => "unknown".to_string(),
            };
            let period = |period: Option<SubscriptionPeriodCapture>| {
                let period = period?;

                if valid_text(&period.amounts, 64) && valid_text(&period.reset, 64) {
                    Some(period)
                } else {
                    None
                }
            };

            Some(SubscriptionCardCapture {
                name: card.name.trim().to_string(),
                status,
                weekly: period(card.weekly),
                monthly: period(card.monthly),
            })
        })
        .collect::<Option<Vec<_>>>()?;

    serde_json::to_string(&SubscriptionCapture { cards }).ok()
}

fn store_capture(capture_store: CaptureStore, app: AppHandle, encoded_script_result: String) {
    let Some(capture) = sanitize_capture(&encoded_script_result) else {
        return;
    };

    if let Ok(mut current_capture) = capture_store.lock() {
        *current_capture = Some(capture);
        let _ = app.emit_to("main", "subscriptions-captured", ());
    }
}

#[cfg(windows)]
fn capture_subscriptions_page(window: WebviewWindow, capture_store: CaptureStore, app: AppHandle) {
    use webview2_com::{CoTaskMemPWSTR, ExecuteScriptCompletedHandler};

    const CAPTURE_SCRIPT: &str = r#"
      (() => {
        const has = (element, ...classes) => classes.every((className) => element.classList.contains(className));
        const grid = Array.from(document.querySelectorAll("div")).find((element) =>
          has(element, "grid", "gap-6", "lg:grid-cols-2")
        );
        if (!grid) return JSON.stringify({ cards: [] });

        const periodFor = (block) => {
          const header = Array.from(block.children).find((child) => has(child, "flex", "justify-between"));
          const label = header?.children[0]?.textContent?.trim().toLowerCase() ?? "";
          const amounts = header?.children[1]?.textContent?.trim() ?? "";
          const reset = Array.from(block.children).find((child) => child.tagName === "P")?.textContent?.trim() ?? "";
          if (/(?:周|week)/i.test(label)) return ["weekly", { amounts, reset }];
          if (/(?:月|month)/i.test(label)) return ["monthly", { amounts, reset }];
          return undefined;
        };

        const cards = Array.from(grid.children)
          .filter((card) => has(card, "overflow-hidden", "rounded-2xl", "border", "bg-white"))
          .map((card) => {
            const header = Array.from(card.children).find((child) => has(child, "flex", "justify-between"));
            const badge = Array.from(header?.querySelectorAll("span") ?? []).find((span) => span.classList.contains("rounded-full"));
            const status = badge?.classList.contains("bg-emerald-100")
              ? "active"
              : badge?.classList.contains("bg-gray-100")
                ? "inactive"
                : "unknown";
            const content = Array.from(card.children).find((child) => has(child, "space-y-4", "p-4"));
            const periods = Array.from(content?.children ?? [])
              .filter((child) => child.classList.contains("space-y-2"))
              .map(periodFor)
              .filter(Boolean);
            const capture = {
              name: header?.querySelector("h3")?.textContent?.trim() ?? "",
              status,
            };
            for (const [period, value] of periods) capture[period] = value;
            return capture;
          });

        return JSON.stringify({ cards });
      })();
    "#;

    let _ = window.with_webview(move |webview| unsafe {
        let Ok(core_webview) = webview.controller().CoreWebView2() else {
            return;
        };
        let script = CoTaskMemPWSTR::from(CAPTURE_SCRIPT);
        let handler = ExecuteScriptCompletedHandler::create(Box::new(move |error_code, result| {
            if error_code.is_ok() {
                store_capture(capture_store, app, result);
            }
            Ok(())
        }));
        let _ = core_webview.ExecuteScript(*script.as_ref().as_pcwstr(), &handler);
    });
}

#[cfg(not(windows))]
fn capture_subscriptions_page(_: WebviewWindow, _: CaptureStore, _: AppHandle) {}

fn schedule_capture(window: WebviewWindow, capture_store: CaptureStore, app: AppHandle) {
    for delay in [Duration::from_millis(750), Duration::from_secs(2)] {
        let window = window.clone();
        let capture_store = capture_store.clone();
        let app = app.clone();

        thread::spawn(move || {
            thread::sleep(delay);
            capture_subscriptions_page(window, capture_store, app);
        });
    }
}

fn ensure_official_login_window(
    app: &AppHandle,
    capture_store: CaptureStore,
    visible: bool,
) -> Result<WebviewWindow, String> {
    let subscriptions_url = SUBSCRIPTIONS_URL
        .parse()
        .map_err(|error| format!("Invalid official subscriptions URL: {error}"))?;

    if let Some(window) = app.get_webview_window(LOGIN_WINDOW_LABEL) {
        if visible {
            window.show().map_err(|error| error.to_string())?;
            window.set_focus().map_err(|error| error.to_string())?;
        }
        return Ok(window);
    }

    let profile_directory = app
        .path()
        .app_local_data_dir()
        .map_err(|error| format!("Unable to resolve the current user's application data directory: {error}"))?
        .join("official-login-webview");
    let app_for_capture = app.clone();
    let capture_for_page_load = capture_store.clone();

    WebviewWindowBuilder::new(app, LOGIN_WINDOW_LABEL, WebviewUrl::External(subscriptions_url))
        .title("登录 3R")
        .inner_size(480.0, 720.0)
        .min_inner_size(400.0, 520.0)
        .visible(visible)
        .resizable(true)
        .data_directory(profile_directory)
        .on_navigation(is_official_3r_url)
        .on_new_window(|_, _| tauri::webview::NewWindowResponse::Deny)
        .on_page_load(move |window, payload| {
            if payload.event() == tauri::webview::PageLoadEvent::Finished
                && is_subscriptions_url(payload.url())
            {
                schedule_capture(
                    window,
                    capture_for_page_load.clone(),
                    app_for_capture.clone(),
                );
            }
        })
        .build()
        .map_err(|error| format!("Unable to create the official login window: {error}"))
}

#[tauri::command]
fn open_official_login(
    app: AppHandle,
    state: State<'_, SubscriptionCaptureState>,
) -> Result<(), String> {
    ensure_official_login_window(&app, state.0.clone(), true).map(|_| ())
}

#[tauri::command]
fn request_subscription_capture(
    app: AppHandle,
    state: State<'_, SubscriptionCaptureState>,
) -> Result<String, String> {
    if let Some(capture) = state.0.lock().ok().and_then(|capture| capture.clone()) {
        return Ok(capture);
    }

    let _ = ensure_official_login_window(&app, state.0.clone(), false);
    Err("AUTHENTICATION_REQUIRED".to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(SubscriptionCaptureState(Arc::new(Mutex::new(None))))
        .invoke_handler(tauri::generate_handler![
            open_official_login,
            request_subscription_capture
        ])
        .run(tauri::generate_context!())
        .expect("error while running 3R Waterline");
}
