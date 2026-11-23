//! Suggest energy feature: estimates daily energy (1-3) based on symptoms.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Runtime};

use crate::ai::prompts::ENERGY_SYSTEM_PROMPT;
use crate::ai::run_json;

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SuggestEnergyInput {
    pub symptoms: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SuggestEnergyOutput {
    pub level: u8,
    pub reason: String,
    pub source: String,
}

pub fn handle_suggest_energy<R: Runtime>(
    app: &AppHandle<R>,
    input: SuggestEnergyInput,
) -> Result<SuggestEnergyOutput, String> {
    let symptoms = input.symptoms.trim();
    if symptoms.is_empty() {
        return Err("Symptoms description is empty.".to_string());
    }
    let bounded: String = symptoms.chars().take(500).collect();

    let user_prompt = format!("Symptoms reported by user:\n{bounded}");
    let response: Value = run_json(app, ENERGY_SYSTEM_PROMPT, &user_prompt, 0.2, 256)?;

    let level_num = response
        .get("level")
        .and_then(Value::as_u64)
        .or_else(|| {
            response
                .get("level")
                .and_then(Value::as_str)
                .and_then(|s| s.parse::<u64>().ok())
        })
        .unwrap_or(2);

    let level = match level_num {
        1 => 1,
        3 => 3,
        _ => 2,
    };

    let reason = response
        .get("reason")
        .and_then(Value::as_str)
        .unwrap_or("AI energy suggestion based on reported symptoms.")
        .trim()
        .to_string();

    Ok(SuggestEnergyOutput {
        level,
        reason,
        source: "ai".to_string(),
    })
}

#[tauri::command]
pub async fn suggest_energy<R: Runtime>(
    app: AppHandle<R>,
    input: SuggestEnergyInput,
) -> Result<SuggestEnergyOutput, String> {
    tauri::async_runtime::spawn_blocking(move || handle_suggest_energy(&app, input))
        .await
        .map_err(|e| format!("Task execution failed: {e}"))?
}
