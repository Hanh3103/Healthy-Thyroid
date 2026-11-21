//! Planner task commands. The JSON document is defined by
//! `src/features/planner/model.ts`; Rust treats it as opaque text.

use tauri::{AppHandle, Runtime};

use super::storage;

const PLANNER_FILE: &str = "planner.json";

#[tauri::command]
pub fn load_planner<R: Runtime>(app: AppHandle<R>) -> Result<Option<String>, String> {
    storage::load_json(&app, PLANNER_FILE)
}

#[tauri::command]
pub fn save_planner<R: Runtime>(app: AppHandle<R>, json: String) -> Result<(), String> {
    storage::save_json(&app, PLANNER_FILE, &json)
}
