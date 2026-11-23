//! AI HTTP client and provider request/response formatting.

use std::time::Duration;
use serde_json::{json, Value};

#[derive(Debug, Clone)]
pub struct ProviderConfig {
    pub provider: String,
    pub model: String,
    pub endpoint: String,
    pub key: String,
}

pub const DEFAULT_GEMINI_ENDPOINT: &str =
    "https://generativelanguage.googleapis.com/v1beta/models";
pub const DEFAULT_CLAUDE_ENDPOINT: &str = "https://api.anthropic.com/v1/messages";
pub const DEFAULT_OLLAMA_ENDPOINT: &str = "http://localhost:11434/api/chat";
pub const DEFAULT_OPENAI_ENDPOINT: &str = "https://api.openai.com/v1/chat/completions";

/// Redact sensitive API key occurrences from error strings and URLs.
pub fn redact_key(text: &str, key: &str) -> String {
    let mut cleaned = text.to_string();
    if !key.trim().is_empty() {
        cleaned = cleaned.replace(key, "••••");
    }
    // Also remove any ?key=... or &key=... from query strings
    if let Some(pos) = cleaned.find("key=") {
        let after = &cleaned[pos + 4..];
        let end = after.find('&').or_else(|| after.find(' ')).unwrap_or(after.len());
        cleaned.replace_range(pos + 4..pos + 4 + end, "••••");
    }
    cleaned
}

/// Verify endpoint URL conforms to security allowlist rules.
pub fn validate_url(provider: &str, url: &str) -> Result<(), String> {
    let trimmed = url.trim();
    if trimmed.is_empty() {
        return Err("API endpoint URL is empty.".to_string());
    }

    match provider {
        "gemini" => {
            if !trimmed.starts_with("https://generativelanguage.googleapis.com") {
                return Err(format!(
                    "Gemini endpoint must be on generativelanguage.googleapis.com, got: {trimmed}"
                ));
            }
        }
        "claude" => {
            if !trimmed.starts_with("https://api.anthropic.com") {
                return Err(format!(
                    "Claude endpoint must be on api.anthropic.com, got: {trimmed}"
                ));
            }
        }
        "ollama" => {
            if !(trimmed.starts_with("http://localhost")
                || trimmed.starts_with("http://127.0.0.1")
                || trimmed.starts_with("https://"))
            {
                return Err(format!(
                    "Ollama endpoint must be local (http://localhost or http://127.0.0.1) or https, got: {trimmed}"
                ));
            }
        }
        _ => {
            // OpenAI and custom providers must use HTTPS
            if !trimmed.starts_with("https://") && !trimmed.starts_with("http://localhost") && !trimmed.starts_with("http://127.0.0.1") {
                return Err(format!(
                    "Endpoint URL must use HTTPS for remote providers: {trimmed}"
                ));
            }
        }
    }

    Ok(())
}

/// Build URL and JSON request body per provider.
pub fn build_body(
    config: &ProviderConfig,
    system: &str,
    user: &str,
    temperature: f64,
    max_tokens: u64,
) -> Result<(String, Value), String> {
    match config.provider.as_str() {
        "gemini" => {
            let url = format!(
                "{endpoint}/{model}:generateContent?key={key}",
                endpoint = config.endpoint.trim_end_matches('/'),
                model = config.model,
                key = config.key
            );
            validate_url("gemini", &url)?;
            Ok((
                url,
                json!({
                    "systemInstruction": { "parts": [{ "text": system }] },
                    "contents": [{ "role": "user", "parts": [{ "text": user }] }],
                    "generationConfig": {
                        "temperature": temperature,
                        "responseMimeType": "application/json"
                    }
                }),
            ))
        }
        "claude" => {
            validate_url("claude", &config.endpoint)?;
            Ok((
                config.endpoint.clone(),
                json!({
                    "model": config.model,
                    "max_tokens": max_tokens,
                    "system": system,
                    "messages": [{ "role": "user", "content": user }]
                }),
            ))
        }
        "ollama" => {
            validate_url("ollama", &config.endpoint)?;
            Ok((
                config.endpoint.clone(),
                json!({
                    "model": config.model,
                    "stream": false,
                    "format": "json",
                    "messages": [
                        { "role": "system", "content": system },
                        { "role": "user", "content": user }
                    ]
                }),
            ))
        }
        _ => {
            validate_url(&config.provider, &config.endpoint)?;
            Ok((
                config.endpoint.clone(),
                json!({
                    "model": config.model,
                    "temperature": temperature,
                    "response_format": { "type": "json_object" },
                    "messages": [
                        { "role": "system", "content": system },
                        { "role": "user", "content": user }
                    ]
                }),
            ))
        }
    }
}

/// Extract generated text from provider-specific response structure.
pub fn extract_text(data: &Value, provider: &str) -> Result<String, String> {
    let text = match provider {
        "gemini" => data["candidates"][0]["content"]["parts"]
            .as_array()
            .map(|parts| {
                parts
                    .iter()
                    .filter_map(|part| part["text"].as_str())
                    .collect::<Vec<_>>()
                    .join("")
            })
            .unwrap_or_default(),
        "claude" => data["content"]
            .as_array()
            .map(|parts| {
                parts
                    .iter()
                    .filter_map(|part| part["text"].as_str())
                    .collect::<Vec<_>>()
                    .join("")
            })
            .unwrap_or_default(),
        "ollama" => data["message"]["content"]
            .as_str()
            .unwrap_or_default()
            .to_string(),
        _ => data["choices"][0]["message"]["content"]
            .as_str()
            .unwrap_or_default()
            .to_string(),
    };

    if text.trim().is_empty() {
        Err("The AI provider returned an empty response.".to_string())
    } else {
        Ok(text)
    }
}

/// Perform HTTP POST to provider with timeout, headers, key redaction, and friendly error mapping.
pub fn post_ai(config: &ProviderConfig, url: &str, body: &Value) -> Result<Value, String> {
    let mut request = ureq::post(url).header("Content-Type", "application/json");

    if config.provider == "claude" {
        request = request
            .header("x-api-key", config.key.as_str())
            .header("anthropic-version", "2023-06-01");
    } else if config.provider != "gemini" && config.provider != "ollama" {
        let auth = format!("Bearer {}", config.key);
        request = request.header("Authorization", auth.as_str());
    }

    // Configure 30-second timeout and do not throw error immediately on non-2xx so we can parse body
    let response = request
        .config()
        .timeout_global(Some(Duration::from_secs(30)))
        .http_status_as_error(false)
        .build()
        .send_json(body)
        .map_err(|error| {
            let msg = format!("{error}");
            let redacted = redact_key(&msg, &config.key);
            if redacted.to_lowercase().contains("timed out") || redacted.to_lowercase().contains("timeout") {
                "AI request timed out after 30 seconds.".to_string()
            } else {
                format!("AI provider request failed: {redacted}")
            }
        })?;

    let status = response.status();
    let text = response.into_body().read_to_string().map_err(|error| {
        let msg = format!("{error}");
        format!("Could not read AI response: {}", redact_key(&msg, &config.key))
    })?;

    if !status.is_success() {
        let code = status.as_u16();
        let detail = serde_json::from_str::<Value>(&text)
            .ok()
            .and_then(|value| {
                value["error"]["message"]
                    .as_str()
                    .map(str::to_string)
                    .or_else(|| value["message"].as_str().map(str::to_string))
            })
            .filter(|message| !message.is_empty())
            .unwrap_or_else(|| text.chars().take(300).collect());

        let friendly_prefix = match code {
            401 | 403 => "Invalid or unauthorized API key. Check your AI settings in Profile. Detail: ",
            404 => "AI model or endpoint not found. Verify provider and model name. Detail: ",
            429 => "AI rate limit reached. Please wait a moment before trying again. Detail: ",
            500..=599 => "The AI provider service encountered an internal error. Please try again later. Detail: ",
            _ => "AI provider request error: ",
        };

        let raw_err = format!("{friendly_prefix}{detail} (HTTP {code})");
        return Err(redact_key(&raw_err, &config.key));
    }

    serde_json::from_str(&text).map_err(|error| {
        let msg = format!("{error}");
        format!("AI provider returned invalid JSON: {}", redact_key(&msg, &config.key))
    })
}
