pub mod ai;
mod commands;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

/// Static build metadata used by the About settings section.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct AppInfo {
    version: &'static str,
    prompt_version: &'static str,
    licenses: Vec<&'static str>,
}

#[tauri::command]
fn app_info() -> AppInfo {
    AppInfo {
        version: env!("CARGO_PKG_VERSION"),
        prompt_version: ai::prompts::PROMPT_VERSION,
        licenses: vec![
            "Healthy Thyroid — Apache-2.0",
            "Vue.js — MIT",
            "Element Plus — MIT",
            "Tauri — Apache-2.0 OR MIT",
            "Tesseract.js — Apache-2.0",
        ],
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            app_info,
            // Unified AI commands
            ai::features::energy::suggest_energy,
            ai::features::prioritize::prioritize_tasks,
            ai::features::diet::generate_plan,
            ai::features::shopping::update_shopping,
            ai::save_ai_config,
            ai::ai_status,
            ai::set_ai_enabled,
            ai::set_ai_daily_limit,
            ai::cancel_ai_request,
            ai::delete_ai_key,
            ai::test_connection,
            // Planner (tasks)
            commands::tasks::load_planner,
            commands::tasks::save_planner,
            commands::diet::prioritize_with_ai,
            // Thyroid Checker
            commands::thyroid::load_thyroid,
            commands::thyroid::save_thyroid,
            // Diet Advisor
            commands::diet::load_diet,
            commands::diet::save_diet,
            commands::diet::generate_diet_plan,
            commands::diet::get_last_plan,
            commands::diet::save_preferences,
            commands::diet::save_last_plan,
            commands::diet::save_consent,
            // Profile
            commands::profile::load_profile,
            commands::profile::save_profile,
            commands::profile::get_ai_credentials_status,
            commands::profile::save_ai_credentials,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
