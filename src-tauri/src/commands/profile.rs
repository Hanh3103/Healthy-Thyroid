//! Profile commands. Persists profile data in `profile.json` and stores Diet AI
//! credentials in a separate `ai_credentials.json` inside app data. The key is
//! never returned to the webview; only a masked status is exposed.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Runtime};

use super::storage;

const PROFILE_FILE: &str = "profile.json";
const CREDENTIALS_FILE: &str = "ai_credentials.json";

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AiCredentials {
    pub provider: String,
    pub endpoint: String,
    pub model: String,
    pub api_key: String,
}

fn normalize_credentials(value: Value) -> AiCredentials {
    let obj = value.as_object();
    let get = |k: &str| -> String {
        obj.and_then(|o| o.get(k))
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim()
            .to_string()
    };
    let provider = get("provider");
    AiCredentials {
        provider: if provider.is_empty() { "openai".to_string() } else { provider },
        endpoint: get("endpoint"),
        model: get("model"),
        api_key: get("apiKey"),
    }
}

fn load_credentials<R: Runtime>(app: &AppHandle<R>) -> AiCredentials {
    let Ok(Some(raw)) = storage::load_json(app, CREDENTIALS_FILE) else {
        return AiCredentials::default();
    };
    let Ok(value) = serde_json::from_str::<Value>(&raw) else {
        return AiCredentials::default();
    };
    normalize_credentials(value)
}

fn mask_key(key: &str) -> String {
    let chars: Vec<char> = key.chars().collect();
    if chars.is_empty() {
        return String::new();
    }
    if chars.len() <= 8 {
        return "••••".to_string();
    }
    let tail: String = chars[chars.len() - 4..].iter().collect();
    format!("••••{tail}")
}

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
    let creds = load_credentials(&app);
    let configured = !creds.api_key.is_empty();
    Ok(json!({
        "configured": configured,
        "source": if configured { "app_data" } else { "none" },
        "provider": creds.provider,
        "endpoint": creds.endpoint,
        "model": creds.model,
        "apiKeyMasked": if configured { mask_key(&creds.api_key) } else { String::new() },
        "hasStoredKey": configured,
    })
    .to_string())
}

/// Saves AI credentials in app data. `apiKey` may be omitted/empty to keep the
/// existing stored key. The key is never returned.
#[tauri::command]
pub fn save_ai_credentials<R: Runtime>(app: AppHandle<R>, json: String) -> Result<String, String> {
    let value: Value =
        serde_json::from_str(&json).map_err(|e| format!("Invalid AI credentials: {e}"))?;
    let mut next = normalize_credentials(value.clone());
    let incoming_key = value
        .get("apiKey")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim()
        .to_string();
    if incoming_key.is_empty() {
        let existing = load_credentials(&app);
        next.api_key = existing.api_key;
    } else {
        next.api_key = incoming_key;
    }
    let raw = serde_json::to_string(&next).map_err(|e| format!("Could not serialize credentials: {e}"))?;
    storage::save_json(&app, CREDENTIALS_FILE, &raw)?;
    get_ai_credentials_status(app)
}

/// Internal: returns stored credentials for use by diet command only.
pub fn stored_credentials<R: Runtime>(app: &AppHandle<R>) -> AiCredentials {
    load_credentials(app)
}
