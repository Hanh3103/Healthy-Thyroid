//! Profile commands. Currently this persists the shared AI configuration in
//! `profile.json`; future profile fields belong in the same document.

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
