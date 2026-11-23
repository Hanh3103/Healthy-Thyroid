//! AI configuration and OS keychain management.

use keyring::Entry;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Runtime};

use crate::commands::storage;
use super::client::{
    DEFAULT_CLAUDE_ENDPOINT, DEFAULT_GEMINI_ENDPOINT, DEFAULT_OLLAMA_ENDPOINT,
    DEFAULT_OPENAI_ENDPOINT, ProviderConfig,
};
use super::limits::{is_ai_enabled, set_ai_enabled};

const CONFIG_FILE: &str = "ai_config.json";
const LEGACY_CREDENTIALS_FILE: &str = "ai_credentials.json";
const KEYRING_SERVICE: &str = "com.daoha.energyplanner";
const KEYRING_USER: &str = "ai_api_key";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiConfigData {
    pub provider: String,
    pub endpoint: String,
    pub model: String,
}

impl Default for AiConfigData {
    fn default() -> Self {
        Self {
            provider: "gemini".to_string(),
            endpoint: DEFAULT_GEMINI_ENDPOINT.to_string(),
            model: "gemini-3.8-flash".to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiStatusOutput {
    pub provider: String,
    pub model: String,
    pub endpoint: String,
    pub has_key: bool,
    pub configured: bool,
    pub enabled: bool,
    pub api_key_masked: String,
}

fn keyring_entry() -> Result<Entry, String> {
    Entry::new(KEYRING_SERVICE, KEYRING_USER)
        .map_err(|e| format!("Could not initialize OS keychain entry: {e}"))
}

/// Store the API key securely in the OS keychain.
pub fn store_key(key: &str) -> Result<(), String> {
    let entry = keyring_entry()?;
    let trimmed = key.trim();
    if trimmed.is_empty() {
        return Ok(());
    }
    entry
        .set_password(trimmed)
        .map_err(|e| format!("Could not save API key to OS keychain: {e}"))
}

/// Retrieve the API key from the OS keychain (with fallback migration from legacy file if present).
pub fn get_key<R: Runtime>(app: &AppHandle<R>) -> Result<String, String> {
    if let Ok(entry) = keyring_entry() {
        match entry.get_password() {
            Ok(key) if !key.trim().is_empty() => return Ok(key.trim().to_string()),
            _ => {}
        }
    }

    // Fallback/migration from legacy ai_credentials.json if needed
    if let Ok(Some(raw)) = storage::load_json(app, LEGACY_CREDENTIALS_FILE) {
        if let Ok(val) = serde_json::from_str::<Value>(&raw) {
            if let Some(key) = val.get("apiKey").and_then(Value::as_str) {
                let trimmed = key.trim().to_string();
                if !trimmed.is_empty() {
                    let _ = store_key(&trimmed);
                    // Clear the plain key from the legacy file
                    let mut cleaned_val = val.clone();
                    if let Some(obj) = cleaned_val.as_object_mut() {
                        obj.insert("apiKey".to_string(), json!(""));
                    }
                    let _ = storage::save_json(app, LEGACY_CREDENTIALS_FILE, &cleaned_val.to_string());
                    return Ok(trimmed);
                }
            }
        }
    }

    Ok(String::new())
}

/// Delete the API key from the OS keychain.
pub fn delete_key<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    if let Ok(entry) = keyring_entry() {
        let _ = entry.delete_credential();
    }
    // Also clear from legacy credentials file if any exists
    if let Ok(Some(raw)) = storage::load_json(app, LEGACY_CREDENTIALS_FILE) {
        if let Ok(mut val) = serde_json::from_str::<Value>(&raw) {
            if let Some(obj) = val.as_object_mut() {
                obj.insert("apiKey".to_string(), json!(""));
            }
            let _ = storage::save_json(app, LEGACY_CREDENTIALS_FILE, &val.to_string());
        }
    }
    Ok(())
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

/// Load AI metadata (provider, endpoint, model) without key.
pub fn load_config<R: Runtime>(app: &AppHandle<R>) -> AiConfigData {
    if let Ok(Some(raw)) = storage::load_json(app, CONFIG_FILE) {
        if let Ok(cfg) = serde_json::from_str::<AiConfigData>(&raw) {
            return cfg;
        }
    }

    // Try reading legacy credentials file for provider/model defaults
    if let Ok(Some(raw)) = storage::load_json(app, LEGACY_CREDENTIALS_FILE) {
        if let Ok(val) = serde_json::from_str::<Value>(&raw) {
            let provider = val.get("provider").and_then(Value::as_str).unwrap_or("gemini").to_string();
            let endpoint = val.get("endpoint").and_then(Value::as_str).unwrap_or("").to_string();
            let model = val.get("model").and_then(Value::as_str).unwrap_or("").to_string();
            let default_endpoint = match provider.as_str() {
                "gemini" => DEFAULT_GEMINI_ENDPOINT,
                "claude" => DEFAULT_CLAUDE_ENDPOINT,
                "ollama" => DEFAULT_OLLAMA_ENDPOINT,
                _ => DEFAULT_OPENAI_ENDPOINT,
            };
            return AiConfigData {
                provider: if provider.is_empty() { "gemini".to_string() } else { provider },
                endpoint: if endpoint.is_empty() { default_endpoint.to_string() } else { endpoint },
                model: if model.is_empty() { "gemini-3.8-flash".to_string() } else { model },
            };
        }
    }

    AiConfigData::default()
}

/// Save AI metadata (provider, endpoint, model) without key.
pub fn save_config<R: Runtime>(app: &AppHandle<R>, config: &AiConfigData) -> Result<(), String> {
    let raw = serde_json::to_string(config)
        .map_err(|e| format!("Could not serialize AI config: {e}"))?;
    storage::save_json(app, CONFIG_FILE, &raw)?;

    // Also update legacy credentials file so any older code reading it sees the same provider/model
    let legacy_val = json!({
        "provider": config.provider,
        "endpoint": config.endpoint,
        "model": config.model,
        "apiKey": ""
    });
    let _ = storage::save_json(app, LEGACY_CREDENTIALS_FILE, &legacy_val.to_string());

    Ok(())
}

/// Assemble full ProviderConfig needed for an AI HTTP request.
pub fn get_active_provider_config<R: Runtime>(app: &AppHandle<R>) -> Result<ProviderConfig, String> {
    let config = load_config(app);
    let key = get_key(app)?;

    let is_ollama = config.provider == "ollama";
    if !is_ollama && key.trim().is_empty() {
        return Err("No API key configured. Enter your API key in Profile settings.".to_string());
    }

    let endpoint = if config.endpoint.trim().is_empty() {
        match config.provider.as_str() {
            "gemini" => DEFAULT_GEMINI_ENDPOINT.to_string(),
            "claude" => DEFAULT_CLAUDE_ENDPOINT.to_string(),
            "ollama" => DEFAULT_OLLAMA_ENDPOINT.to_string(),
            _ => DEFAULT_OPENAI_ENDPOINT.to_string(),
        }
    } else {
        config.endpoint.trim().to_string()
    };

    let model = if config.model.trim().is_empty() {
        match config.provider.as_str() {
            "gemini" => "gemini-3.8-flash".to_string(),
            "claude" => "claude-3-5-haiku-20241022".to_string(),
            "ollama" => "llama3.2".to_string(),
            _ => "gpt-4o-mini".to_string(),
        }
    } else {
        config.model.trim().to_string()
    };

    Ok(ProviderConfig {
        provider: config.provider,
        endpoint,
        model,
        key,
    })
}

/// Get masked status without ever exposing the key.
pub fn get_status<R: Runtime>(app: &AppHandle<R>) -> Result<AiStatusOutput, String> {
    let config = load_config(app);
    let key = get_key(app).unwrap_or_default();
    let has_key = !key.trim().is_empty();
    let is_ollama = config.provider == "ollama";
    let configured = is_ollama || has_key;
    let enabled = is_ai_enabled(app);

    Ok(AiStatusOutput {
        provider: config.provider,
        model: config.model,
        endpoint: config.endpoint,
        has_key,
        configured,
        enabled,
        api_key_masked: if has_key { mask_key(&key) } else { String::new() },
    })
}

/// Save AI configuration and optionally key.
pub fn save_ai_config_handler<R: Runtime>(
    app: &AppHandle<R>,
    provider: String,
    model: String,
    endpoint: Option<String>,
    key: Option<String>,
    enabled: Option<bool>,
) -> Result<AiStatusOutput, String> {
    let mut current = load_config(app);
    current.provider = provider.trim().to_string();
    current.model = model.trim().to_string();

    if let Some(ep) = endpoint {
        if !ep.trim().is_empty() {
            current.endpoint = ep.trim().to_string();
        }
    }
    if current.endpoint.trim().is_empty() {
        current.endpoint = match current.provider.as_str() {
            "gemini" => DEFAULT_GEMINI_ENDPOINT.to_string(),
            "claude" => DEFAULT_CLAUDE_ENDPOINT.to_string(),
            "ollama" => DEFAULT_OLLAMA_ENDPOINT.to_string(),
            _ => DEFAULT_OPENAI_ENDPOINT.to_string(),
        };
    }

    save_config(app, &current)?;

    if let Some(k) = key {
        let trimmed = k.trim();
        if !trimmed.is_empty() {
            store_key(trimmed)?;
        }
    }

    if let Some(en) = enabled {
        set_ai_enabled(app, en);
    }

    get_status(app)
}
