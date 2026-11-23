//! AI task prioritization: estimates time, energy, and subtasks for a list of tasks.

use std::collections::HashSet;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Runtime};

use crate::ai::prompts::PRIORITIZE_SYSTEM_PROMPT;
use crate::ai::run_json;

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PrioritizeTaskItem {
    pub id: String,
    pub title: String,
    pub due: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PrioritizeTasksInput {
    pub energy: u8,
    pub today: String,
    pub weekday: String,
    pub tasks: Vec<PrioritizeTaskItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubtaskEstimate {
    pub title: String,
    pub minutes: u32,
    pub energy: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrioritizeEstimateOutput {
    pub id: String,
    pub minutes: u32,
    pub energy: u8,
    pub confidence: String,
    pub reason: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subtasks: Option<Vec<SubtaskEstimate>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub first_step: Option<SubtaskEstimate>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrioritizeTasksOutput {
    pub tasks: Vec<PrioritizeEstimateOutput>,
}

fn clamp_minutes(val: Option<f64>) -> u32 {
    let raw = val.unwrap_or(30.0);
    let clamped = raw.clamp(5.0, 360.0);
    let rounded = (clamped / 5.0).round() * 5.0;
    rounded as u32
}

fn clamp_energy(val: Option<u64>) -> u8 {
    match val.unwrap_or(2) {
        1 => 1,
        3 => 3,
        _ => 2,
    }
}

pub fn handle_prioritize_tasks<R: Runtime>(
    app: &AppHandle<R>,
    input: PrioritizeTasksInput,
) -> Result<PrioritizeTasksOutput, String> {
    if input.tasks.is_empty() {
        return Ok(PrioritizeTasksOutput { tasks: Vec::new() });
    }

    if input.tasks.len() > 100 {
        return Err("Too many tasks for one request (maximum 100). Split the list and try again.".to_string());
    }

    let allowed_ids: HashSet<String> = input.tasks.iter().map(|t| t.id.clone()).collect();

    let task_payload: Vec<Value> = input
        .tasks
        .iter()
        .map(|t| {
            json!({
                "id": t.id,
                "title": t.title.chars().take(200).collect::<String>(),
                "due": t.due
            })
        })
        .collect();

    let energy_label = match input.energy {
        1 => "Low",
        3 => "High",
        _ => "Medium",
    };

    let user_prompt = format!(
        "Today is {weekday} {today}. The user's current energy is {energy} of 3 ({energy_label}).\nEstimate each task:\n{tasks_json}",
        weekday = input.weekday,
        today = input.today,
        energy = input.energy,
        energy_label = energy_label,
        tasks_json = json!(task_payload)
    );

    let response = run_json(app, PRIORITIZE_SYSTEM_PROMPT, &user_prompt, 0.2, 2048)?;

    let task_items = if let Some(arr) = response.as_array() {
        arr
    } else if let Some(arr) = response.get("tasks").and_then(Value::as_array) {
        arr
    } else if let Some(arr) = response.get("estimates").and_then(Value::as_array) {
        arr
    } else if let Some(arr) = response.get("ranked").and_then(Value::as_array) {
        arr
    } else {
        return Err("Invalid AI response shape: missing task estimates array.".to_string());
    };

    let mut seen = HashSet::new();
    let mut outputs = Vec::new();

    for item in task_items {
        let Some(id) = item.get("id").and_then(Value::as_str) else {
            continue;
        };
        if !allowed_ids.contains(id) || !seen.insert(id.to_string()) {
            continue;
        }

        let minutes = clamp_minutes(item.get("minutes").and_then(Value::as_f64));
        let energy = clamp_energy(item.get("energy").and_then(Value::as_u64));
        let confidence = match item.get("confidence").and_then(Value::as_str) {
            Some("high") => "high",
            Some("low") => "low",
            _ => "medium",
        }
        .to_string();

        let reason = item
            .get("reason")
            .and_then(Value::as_str)
            .unwrap_or("")
            .chars()
            .take(120)
            .collect();

        let subtasks = item
            .get("subtasks")
            .and_then(Value::as_array)
            .map(|arr| {
                arr.iter()
                    .filter_map(|s| {
                        let title = s.get("title").and_then(Value::as_str)?.trim();
                        if title.is_empty() {
                            return None;
                        }
                        let s_min = clamp_minutes(s.get("minutes").and_then(Value::as_f64));
                        let s_en = clamp_energy(s.get("energy").and_then(Value::as_u64));
                        Some(SubtaskEstimate {
                            title: title.to_string(),
                            minutes: s_min,
                            energy: s_en,
                        })
                    })
                    .collect::<Vec<_>>()
            })
            .filter(|v| !v.is_empty());

        let first_step = item.get("firstStep").and_then(|s| {
            let title = s.get("title").and_then(Value::as_str)?.trim();
            if title.is_empty() {
                return None;
            }
            let raw_min = clamp_minutes(s.get("minutes").and_then(Value::as_f64));
            let s_min = raw_min.clamp(5, 30);
            let s_en = clamp_energy(s.get("energy").and_then(Value::as_u64));
            Some(SubtaskEstimate {
                title: title.to_string(),
                minutes: s_min,
                energy: s_en,
            })
        });

        outputs.push(PrioritizeEstimateOutput {
            id: id.to_string(),
            minutes,
            energy,
            confidence,
            reason,
            subtasks,
            first_step,
        });
    }

    Ok(PrioritizeTasksOutput { tasks: outputs })
}

#[tauri::command]
pub async fn prioritize_tasks<R: Runtime>(
    app: AppHandle<R>,
    input: PrioritizeTasksInput,
) -> Result<PrioritizeTasksOutput, String> {
    tauri::async_runtime::spawn_blocking(move || handle_prioritize_tasks(&app, input))
        .await
        .map_err(|e| format!("Task execution failed: {e}"))?
}
