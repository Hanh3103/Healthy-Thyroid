//! Profile commands. Persists profile data in `profile.json`.

use serde_json::{json, Value};
use tauri::{AppHandle, Runtime};

use super::storage;

const PROFILE_FILE: &str = "profile.json";

#[tauri::command]
pub fn load_profile<R: Runtime>(app: AppHandle<R>) -> Result<Option<String>, String> {
    storage::load_json(&app, PROFILE_FILE)
}

#[tauri::command]
pub fn save_profile<R: Runtime>(app: AppHandle<R>, json: String) -> Result<(), String> {
    storage::save_json(&app, PROFILE_FILE, &json)
}

/// Returns AI config status without exposing the key. Used by Profile UI.
#[tauri::command]
pub fn get_ai_credentials_status<R: Runtime>(app: AppHandle<R>) -> Result<String, String> {
    let status = crate::ai::config::get_status(&app)?;
    Ok(json!({
        "configured": status.configured,
        "source": if status.configured { "app_data" } else { "none" },
        "provider": status.provider,
        "endpoint": status.endpoint,
        "model": status.model,
        "apiKeyMasked": status.api_key_masked,
        "hasStoredKey": status.has_key,
    })
    .to_string())
}

/// Saves AI credentials in app data. `apiKey` may be omitted/empty to keep the
/// existing stored key. The key is never returned.
#[tauri::command]
pub fn save_ai_credentials<R: Runtime>(app: AppHandle<R>, json: String) -> Result<String, String> {
    let value: Value =
        serde_json::from_str(&json).map_err(|e| format!("Invalid AI credentials: {e}"))?;
    let provider = value.get("provider").and_then(Value::as_str).unwrap_or("gemini").to_string();
    let model = value.get("model").and_then(Value::as_str).unwrap_or("").to_string();
    let endpoint = value.get("endpoint").and_then(Value::as_str).map(String::from);
    let incoming_key = value
        .get("apiKey")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim()
        .to_string();

    let key_opt = if incoming_key.is_empty() { None } else { Some(incoming_key) };
    crate::ai::config::save_ai_config_handler(&app, provider, model, endpoint, key_opt, None)?;
    get_ai_credentials_status(app)
}
