//! Profile commands. Persists the Profile document in `profile.json`.
//!
//! Profile owns diet settings only. AI configuration lives in the shared `ai`
//! module (`ai_config.json` plus the OS keychain).

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
