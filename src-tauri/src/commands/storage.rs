//! Shared file-backed JSON storage used by the feature commands.
//!
//! All feature data lives in the app-data directory so it survives updates
//! and stays next to the other per-user application files. Commands exchange
//! JSON strings with the frontend, which keeps the TypeScript types as the
//! single source of truth for the shape of each document.

use std::fs;
use std::path::PathBuf;

use tauri::{Manager, Runtime};

/// Returns the path of a JSON document in the app-data directory.
fn json_path<R: Runtime>(app: &tauri::AppHandle<R>, file_name: &str) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not resolve app data directory: {error}"))?;
    if let Err(error) = fs::create_dir_all(&dir) {
        return Err(format!("Could not create app data directory: {error}"));
    }
    Ok(dir.join(file_name))
}

/// Reads a JSON document. Missing files are represented by `Ok(None)` so the
/// frontend can decide when to migrate legacy browser data.
pub fn load_json<R: Runtime>(app: &tauri::AppHandle<R>, file_name: &str) -> Result<Option<String>, String> {
    let path = json_path(app, file_name)?;
    match fs::read_to_string(&path) {
        Ok(contents) => Ok(Some(contents)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(format!("Could not read {}: {error}", path.display())),
    }
}

/// Writes a JSON document atomically by writing to a temporary file first and
/// then replacing the destination. This avoids truncated files if the app is
/// closed while a save is in progress.
pub fn save_json<R: Runtime>(app: &tauri::AppHandle<R>, file_name: &str, json: &str) -> Result<(), String> {
    let path = json_path(app, file_name)?;
    let temp_path = path.with_extension(format!("{}.tmp", file_name));
    fs::write(&temp_path, json)
        .map_err(|error| format!("Could not write {}: {error}", temp_path.display()))?;
    fs::rename(&temp_path, &path)
        .map_err(|error| format!("Could not replace {}: {error}", path.display()))?;
    Ok(())
}


