//! Thyroid Checker commands. All thyroid data (records, custom tests,
//! appointments, frequency and first-run flag) is stored in one document.

use tauri::{AppHandle, Runtime};

use super::storage;

const THYROID_FILE: &str = "thyroid.json";

#[tauri::command]
pub fn load_thyroid<R: Runtime>(app: AppHandle<R>) -> Result<Option<String>, String> {
    storage::load_json(&app, THYROID_FILE)
}

#[tauri::command]
pub fn save_thyroid<R: Runtime>(app: AppHandle<R>, json: String) -> Result<(), String> {
    storage::save_json(&app, THYROID_FILE, &json)
}
