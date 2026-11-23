//! Concurrency, daily call rate limits, and on/off guard for AI requests.

use std::sync::{LazyLock, Mutex};
use tauri::{AppHandle, Runtime};

use crate::commands::storage;

const LIMITS_FILE: &str = "ai_limits.json";
pub const DEFAULT_DAILY_LIMIT: u32 = 100;

static AI_MUTEX: LazyLock<Mutex<()>> = LazyLock::new(|| Mutex::new(()));

#[derive(Debug, serde::Serialize, serde::Deserialize, Default)]
struct StoredLimits {
    date: String,
    call_count: u32,
    #[serde(default = "default_true")]
    enabled: bool,
}

fn default_true() -> bool {
    true
}

fn get_today_str() -> String {
    // Current UTC date string YYYY-MM-DD
    let now = std::time::SystemTime::now();
    let since_epoch = now
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    // Rough calculation or simple day counter
    let days = since_epoch / 86400;
    // We can format a stable day representation
    format!("day-{}", days)
}

fn load_limits<R: Runtime>(app: &AppHandle<R>) -> StoredLimits {
    if let Ok(Some(raw)) = storage::load_json(app, LIMITS_FILE) {
        if let Ok(limits) = serde_json::from_str::<StoredLimits>(&raw) {
            return limits;
        }
    }
    StoredLimits {
        date: get_today_str(),
        call_count: 0,
        enabled: true,
    }
}

fn save_limits<R: Runtime>(app: &AppHandle<R>, limits: &StoredLimits) {
    if let Ok(raw) = serde_json::to_string(limits) {
        let _ = storage::save_json(app, LIMITS_FILE, &raw);
    }
}

/// Guard object holding the mutex lock for the duration of an AI request.
pub struct RequestPermit<'a> {
    _guard: std::sync::MutexGuard<'a, ()>,
}

/// Check if a new AI request is allowed under daily limits and enable switch,
/// and acquire the single-concurrency lock.
pub fn acquire_request_permit<R: Runtime>(app: &AppHandle<R>) -> Result<RequestPermit<'static>, String> {
    let guard = AI_MUTEX.lock().map_err(|e| format!("Lock acquisition error: {e}"))?;

    let mut limits = load_limits(app);
    let today = get_today_str();

    if !limits.enabled {
        return Err("AI features are currently turned off in settings.".to_string());
    }

    if limits.date != today {
        limits.date = today;
        limits.call_count = 0;
        save_limits(app, &limits);
    } else if limits.call_count >= DEFAULT_DAILY_LIMIT {
        return Err(format!(
            "Daily AI call limit reached ({DEFAULT_DAILY_LIMIT} requests). Resets tomorrow."
        ));
    }

    Ok(RequestPermit { _guard: guard })
}

/// Increment daily call count after a successful AI call.
pub fn record_successful_call<R: Runtime>(app: &AppHandle<R>) {
    let mut limits = load_limits(app);
    let today = get_today_str();
    if limits.date != today {
        limits.date = today;
        limits.call_count = 1;
    } else {
        limits.call_count += 1;
    }
    save_limits(app, &limits);
}

/// Set AI enabled / disabled flag.
pub fn set_ai_enabled<R: Runtime>(app: &AppHandle<R>, enabled: bool) {
    let mut limits = load_limits(app);
    limits.enabled = enabled;
    save_limits(app, &limits);
}

/// Check if AI is enabled.
pub fn is_ai_enabled<R: Runtime>(app: &AppHandle<R>) -> bool {
    load_limits(app).enabled
}
