//! Unified AI module for Energy Planner.
//! Provides the shared pipeline `run_json()` used by all features,
//! key storage in the OS keychain, rate limits, validation, and typed commands.

pub mod client;
pub mod config;
pub mod limits;
pub mod prompts;
pub mod validate;
pub mod features;
#[cfg(test)]
mod tests;

use serde_json::Value;
use tauri::{AppHandle, Runtime};

/// The single shared JSON pipeline all features use.
///
/// Steps:
/// 1. Concurrency limit (one request at a time) & daily request limit & AI on/off check
/// 2. Active provider config & keychain key retrieval
/// 3. Request building & allowlist verification
/// 4. HTTP POST with 30s timeout, key redaction, and friendly error mapping
/// 5. Provider-specific text extraction
/// 6. JSON parsing & markdown code fence stripping
/// 7. Daily call count increment on success
pub fn run_json<R: Runtime>(
    app: &AppHandle<R>,
    system: &str,
    user: &str,
    temperature: f64,
    max_tokens: u64,
) -> Result<Value, String> {
    // 1. Concurrency and limits check
    let _permit = limits::acquire_request_permit(app)?;

    // 2. Load provider config and key
    let config = config::get_active_provider_config(app)?;

    // 3. Build URL and JSON request body
    let (url, body) = client::build_body(&config, system, user, temperature, max_tokens)?;

    // 4. Send request via post_ai
    let raw_data = client::post_ai(&config, &url, &body)?;

    // 5. Extract text from provider structure
    let text = client::extract_text(&raw_data, &config.provider)?;

    // A Cancel press is honoured after the provider responds, before the call
    // is counted as a successful request.
    if limits::cancellation_requested() {
        return Err("AI request cancelled.".to_string());
    }

    // 6. Parse JSON with code fence removal
    let parsed_json = validate::extract_json_value(&text)?;

    // 7. Increment successful call counter
    limits::record_successful_call(app);

    Ok(parsed_json)
}

// -----------------------------------------------------------------------------
// Settings Commands
// -----------------------------------------------------------------------------

#[derive(serde::Deserialize)]
pub struct SaveAiConfigArgs {
    pub provider: String,
    pub model: String,
    pub endpoint: Option<String>,
    pub key: Option<String>,
    pub enabled: Option<bool>,
}

#[tauri::command]
pub async fn save_ai_config<R: Runtime>(
    app: AppHandle<R>,
    provider: String,
    model: String,
    endpoint: Option<String>,
    key: Option<String>,
    enabled: Option<bool>,
) -> Result<config::AiStatusOutput, String> {
    tauri::async_runtime::spawn_blocking(move || {
        config::save_ai_config_handler(&app, provider, model, endpoint, key, enabled)
    })
    .await
    .map_err(|e| format!("Task execution failed: {e}"))?
}

#[tauri::command]
pub async fn ai_status<R: Runtime>(
    app: AppHandle<R>,
) -> Result<config::AiStatusOutput, String> {
    tauri::async_runtime::spawn_blocking(move || {
        config::get_status(&app)
    })
    .await
    .map_err(|e| format!("Task execution failed: {e}"))?
}

/// Persists the AI suggestions switch immediately and returns fresh status.
#[tauri::command]
pub async fn set_ai_enabled<R: Runtime>(
    app: AppHandle<R>,
    enabled: bool,
) -> Result<config::AiStatusOutput, String> {
    tauri::async_runtime::spawn_blocking(move || {
        limits::set_ai_enabled(&app, enabled);
        config::get_status(&app)
    })
    .await
    .map_err(|e| format!("Task execution failed: {e}"))?
}

/// Persists the daily call allowance shown in the AI settings and header popover.
#[tauri::command]
pub async fn set_ai_daily_limit<R: Runtime>(
    app: AppHandle<R>,
    limit: u32,
) -> Result<config::AiStatusOutput, String> {
    tauri::async_runtime::spawn_blocking(move || {
        limits::set_daily_limit(&app, limit);
        config::get_status(&app)
    })
    .await
    .map_err(|e| format!("Task execution failed: {e}"))?
}

/// Cooperative cancellation for the request currently in flight.
#[tauri::command]
pub fn cancel_ai_request() {
    limits::request_cancel();
}

#[tauri::command]
pub async fn delete_ai_key<R: Runtime>(
    app: AppHandle<R>,
) -> Result<config::AiStatusOutput, String> {
    tauri::async_runtime::spawn_blocking(move || {
        config::delete_key(&app)?;
        config::get_status(&app)
    })
    .await
    .map_err(|e| format!("Task execution failed: {e}"))?
}

#[tauri::command]
pub async fn test_connection<R: Runtime>(
    app: AppHandle<R>,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let system = "You verify connections. Reply with valid JSON: {\"status\":\"ok\"}";
        let user = "ping";
        run_json(&app, system, user, 0.0, 50)?;
        Ok("Connection successful! Provider returned valid response.".to_string())
    })
    .await
    .map_err(|e| format!("Task execution failed: {e}"))?
}
