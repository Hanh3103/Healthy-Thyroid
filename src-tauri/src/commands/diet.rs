//! Diet Advisor commands. The feature is currently static, but the storage
//! boundary is present so diet data can be persisted without touching the UI.

use tauri::{AppHandle, Runtime};

use super::storage;

const DIET_FILE: &str = "diet.json";

#[tauri::command]
pub fn load_diet<R: Runtime>(app: AppHandle<R>) -> Result<Option<String>, String> {
    storage::load_json(&app, DIET_FILE)
}

#[tauri::command]
pub fn save_diet<R: Runtime>(app: AppHandle<R>, json: String) -> Result<(), String> {
    storage::save_json(&app, DIET_FILE, &json)
}
