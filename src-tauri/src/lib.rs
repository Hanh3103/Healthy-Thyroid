mod commands;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            // Planner (tasks)
            commands::tasks::load_planner,
            commands::tasks::save_planner,
            // Thyroid Checker
            commands::thyroid::load_thyroid,
            commands::thyroid::save_thyroid,
            // Diet Advisor
            commands::diet::load_diet,
            commands::diet::save_diet,
            // Profile
            commands::profile::load_profile,
            commands::profile::save_profile,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
