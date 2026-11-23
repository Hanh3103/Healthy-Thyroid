//! Meal edit shopping update feature.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Runtime};

use crate::ai::prompts::SHOPPING_SYSTEM_PROMPT;
use crate::ai::run_json;
use crate::ai::validate::{drop_unknown_science_ids, filter_pantry_and_basics};

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
#[serde(rename_all = "camelCase")]
pub struct MealIdeaPayload {
    pub idea: String,
    pub ingredients: Vec<String>,
    pub prep_minutes: u32,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
#[serde(rename_all = "camelCase")]
pub struct MealChangePayload {
    pub date: String,
    pub slot: String,
    pub old: MealIdeaPayload,
    pub new: MealIdeaPayload,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
#[serde(rename_all = "camelCase")]
pub struct UpdateShoppingInput {
    pub changed_meal: MealChangePayload,
    pub pantry: Vec<String>,
    pub current_shopping_list: Vec<String>,
    #[serde(default)]
    pub fact_library: Vec<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FoodAdviceOutput {
    pub text: String,
    pub fact_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateShoppingOutput {
    pub needed_ingredients: Vec<String>,
    pub notes: Vec<String>,
    pub food_advice: Vec<FoodAdviceOutput>,
}

pub fn handle_update_shopping<R: Runtime>(
    app: &AppHandle<R>,
    input: UpdateShoppingInput,
) -> Result<UpdateShoppingOutput, String> {
    let allowed_fact_ids: Vec<String> = input
        .fact_library
        .iter()
        .filter_map(|f| f.get("id").and_then(Value::as_str).map(String::from))
        .collect();

    let user_prompt = format!(
        "The user edited a meal.\n\nCHANGED MEAL:\n{meal_json}\n\nPANTRY:\n{pantry_json}\n\nCURRENT SHOPPING LIST:\n{shop_json}\n\nFACT LIBRARY:\n{facts_json}",
        meal_json = json!(&input.changed_meal),
        pantry_json = json!(&input.pantry),
        shop_json = json!(&input.current_shopping_list),
        facts_json = json!(&input.fact_library)
    );

    let mut response = run_json(app, SHOPPING_SYSTEM_PROMPT, &user_prompt, 0.2, 1024)?;

    // Drop unknown fact IDs
    drop_unknown_science_ids(&mut response, &allowed_fact_ids);

    let raw_needed: Vec<String> = response
        .get("neededIngredients")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default();

    // Filter out basics (salt, pepper, water) and items already in pantry / shopping list
    let needed_ingredients =
        filter_pantry_and_basics(&raw_needed, &input.pantry, &input.current_shopping_list);

    let notes: Vec<String> = response
        .get("notes")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default();

    let food_advice: Vec<FoodAdviceOutput> = response
        .get("foodAdvice")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .filter_map(|item| {
                    let text = item.get("text").and_then(Value::as_str)?.to_string();
                    let fact_ids = item
                        .get("factIds")
                        .and_then(Value::as_array)
                        .map(|f_arr| {
                            f_arr
                                .iter()
                                .filter_map(|id| id.as_str().map(String::from))
                                .collect()
                        })
                        .unwrap_or_default();
                    Some(FoodAdviceOutput { text, fact_ids })
                })
                .collect()
        })
        .unwrap_or_default();

    Ok(UpdateShoppingOutput {
        needed_ingredients,
        notes,
        food_advice,
    })
}

#[tauri::command]
pub async fn update_shopping<R: Runtime>(
    app: AppHandle<R>,
    input: UpdateShoppingInput,
) -> Result<UpdateShoppingOutput, String> {
    tauri::async_runtime::spawn_blocking(move || handle_update_shopping(&app, input))
        .await
        .map_err(|e| format!("Task execution failed: {e}"))?
}
