//! Concurrency, daily call rate limits, and on/off guard for AI requests.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{LazyLock, Mutex};
use tauri::{AppHandle, Runtime};

use crate::commands::storage;

const LIMITS_FILE: &str = "ai_limits.json";
pub const DEFAULT_DAILY_LIMIT: u32 = 30;

static AI_MUTEX: LazyLock<Mutex<()>> = LazyLock::new(|| Mutex::new(()));
static CANCEL_REQUESTED: AtomicBool = AtomicBool::new(false);

#[derive(Debug, serde::Serialize, serde::Deserialize, Default)]
struct StoredLimits {
    date: String,
    call_count: u32,
    #[serde(default = "default_true")]
    enabled: bool,
    #[serde(default = "default_daily_limit")]
    daily_limit: u32,
}

fn default_daily_limit() -> u32 {
    DEFAULT_DAILY_LIMIT
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
        daily_limit: DEFAULT_DAILY_LIMIT,
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

/// Ask the in-flight request (if any) to stop before its next check point.
pub fn request_cancel() {
    CANCEL_REQUESTED.store(true, Ordering::SeqCst);
}

/// Returns true when a cancellation was requested for the running request.
pub fn cancellation_requested() -> bool {
    CANCEL_REQUESTED.load(Ordering::SeqCst)
}

/// Check if a new AI request is allowed under daily limits and enable switch,
/// and acquire the single-concurrency lock.
pub fn acquire_request_permit<R: Runtime>(app: &AppHandle<R>) -> Result<RequestPermit<'static>, String> {
    let guard = AI_MUTEX.lock().map_err(|e| format!("Lock acquisition error: {e}"))?;

    // A new request starts with a clean cancellation flag; a Cancel press only
    // applies to the request that was already running when it was pressed.
    CANCEL_REQUESTED.store(false, Ordering::SeqCst);

    let mut limits = load_limits(app);
    let today = get_today_str();

    if !limits.enabled {
        return Err("AI features are currently turned off in settings.".to_string());
    }

    if limits.date != today {
        limits.date = today;
        limits.call_count = 0;
        save_limits(app, &limits);
    } else if limits.call_count >= limits.daily_limit {
        crate::ai::config::notify_ai_config_changed(app);
        return Err(format!(
            "Daily AI call limit reached ({} requests). Resets tomorrow.",
            limits.daily_limit
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
    crate::ai::config::notify_ai_config_changed(app);
}

/// Set AI enabled / disabled flag.
pub fn set_ai_enabled<R: Runtime>(app: &AppHandle<R>, enabled: bool) {
    let mut limits = load_limits(app);
    limits.enabled = enabled;
    save_limits(app, &limits);
    crate::ai::config::notify_ai_config_changed(app);
}

/// Check if AI is enabled.
pub fn is_ai_enabled<R: Runtime>(app: &AppHandle<R>) -> bool {
    load_limits(app).enabled
}

/// Today's successful call count (reset on day rollover) and the daily limit.
pub fn get_usage<R: Runtime>(app: &AppHandle<R>) -> (u32, u32) {
    let limits = load_limits(app);
    let today = get_today_str();
    let count = if limits.date == today { limits.call_count } else { 0 };
    (count, limits.daily_limit.max(1))
}

/// Updates the daily allowance. Bounded so a typo cannot disable AI or allow abuse.
pub fn set_daily_limit<R: Runtime>(app: &AppHandle<R>, limit: u32) {
    let mut limits = load_limits(app);
    limits.daily_limit = limit.clamp(1, 1000);
    save_limits(app, &limits);
    crate::ai::config::notify_ai_config_changed(app);
}
