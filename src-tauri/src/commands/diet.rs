//! Diet Advisor commands.
//!
//! All AI calls happen here so the API key is read from the device environment
//! and never crosses the webview boundary. Science claims are restricted by the
//! system prompt and by a small local rule check on the response.

use serde_json::{Value, json};
use std::collections::HashSet;
use std::env;
use tauri::{AppHandle, Runtime};

use super::storage;

const DIET_FILE: &str = "diet.json";
const DEFAULT_ENDPOINT: &str = "https://api.openai.com/v1/chat/completions";
const DEFAULT_MODEL: &str = "gpt-4o-mini";

const SYSTEM_PROMPT: &str = r#"You suggest general food ideas. You are not a doctor and you must never give medical advice.
Use ONLY the facts in the FACTS list for any science or thyroid claim. Cite them by their exact id in factIds. Anything outside the library: say "ask your doctor or a dietitian".
Never diagnose, change or suggest medication doses, and never recommend supplements or supplement doses.
Respect the user's allergies and preferences strictly. Do not send or repeat names or personal notes.
Use food ideas and meal timing only. Never claim that food cures, reverses or treats thyroid disease.
If the input mentions chest pain, trouble breathing, fainting or a very fast heartbeat, set urgent to true and tell the user to contact a doctor or emergency services instead of giving meals.
For a packed day or low energy, keep meals at 10 minutes or less: no-cook or batch-prepared, protein plus fibre, regular meal times and enough water.
For a light day and high energy, more cooking time is fine and include one meal-prep idea for tomorrow in the summary.
Plan only the requested range. For tomorrow and next week, energy is unknown: give each day full main meals plus one quick fallback meal (10 minutes or less) for a low-energy day. Today's energy is a hint only.
Reuse ingredients across the week. Return ingredients for every meal, then a minimal shopping list of only the missing items; anything already in the pantry must NOT appear.
Never include pantry basics in the shopping list: salt, pepper and water are assumed at home.
If actual meals eaten are supplied, adjust only the remaining meals, keep the timing notes and science notes, and use what is left at home.
Reply only with JSON: {"summary":string,"meals":[{"day":"YYYY-MM-DD","slot":"breakfast"|"lunch"|"dinner"|"snack","kind":"main"|"fallback","idea":string,"prepMinutes":number,"why":string,"ingredients":string[],"factIds":string[]}],"timingNotes":[{"text":string,"factIds":string[]}],"shopping":string[],"urgent":boolean}"#;

fn empty_data() -> Value {
    json!({ "preferences": {}, "lastPlan": null, "consentGiven": false })
}

fn read_data<R: Runtime>(app: &AppHandle<R>) -> Result<Value, String> {
    match storage::load_json(app, DIET_FILE)? {
        Some(raw) => serde_json::from_str(&raw)
            .map_err(|error| format!("Could not parse {DIET_FILE}: {error}")),
        None => Ok(empty_data()),
    }
}

fn write_data<R: Runtime>(app: &AppHandle<R>, data: &Value) -> Result<(), String> {
    storage::save_json(app, DIET_FILE, &data.to_string())
}

#[tauri::command]
pub fn load_diet<R: Runtime>(app: AppHandle<R>) -> Result<Option<String>, String> {
    storage::load_json(&app, DIET_FILE)
}

#[tauri::command]
pub fn save_diet<R: Runtime>(app: AppHandle<R>, json: String) -> Result<(), String> {
    storage::save_json(&app, DIET_FILE, &json)
}

#[tauri::command]
pub fn get_last_plan<R: Runtime>(app: AppHandle<R>) -> Result<Option<String>, String> {
    let data = read_data(&app)?;
    match data.get("lastPlan") {
        Some(plan) if !plan.is_null() => Ok(Some(plan.to_string())),
        _ => Ok(None),
    }
}

#[tauri::command]
pub fn save_preferences<R: Runtime>(app: AppHandle<R>, json: String) -> Result<(), String> {
    let preferences: Value = serde_json::from_str(&json)
        .map_err(|error| format!("Invalid diet preferences: {error}"))?;
    let mut data = read_data(&app)?;
    data["preferences"] = preferences;
    write_data(&app, &data)
}

#[tauri::command]
pub fn save_last_plan<R: Runtime>(app: AppHandle<R>, json: String) -> Result<(), String> {
    let plan: Value = serde_json::from_str(&json)
        .map_err(|error| format!("Invalid meal plan: {error}"))?;
    let mut data = read_data(&app)?;
    data["lastPlan"] = plan;
    write_data(&app, &data)
}

#[tauri::command]
pub fn save_consent<R: Runtime>(app: AppHandle<R>, granted: bool) -> Result<(), String> {
    let mut data = read_data(&app)?;
    data["consentGiven"] = json!(granted);
    write_data(&app, &data)
}

fn emergency_plan() -> String {
    json!({
        "summary": "Please contact a doctor or emergency services now — these symptoms need urgent attention.",
        "meals": [],
        "timingNotes": [],
        "urgent": true
    })
    .to_string()
}

fn extract_content(data: &Value, provider: &str) -> Result<String, String> {
    let text = match provider {
        "gemini" => data["candidates"][0]["content"]["parts"]
            .as_array()
            .map(|parts| {
                parts.iter()
                    .filter_map(|part| part["text"].as_str())
                    .collect::<Vec<_>>()
                    .join("")
            })
            .unwrap_or_default(),
        "claude" => data["content"]
            .as_array()
            .map(|parts| {
                parts.iter()
                    .filter_map(|part| part["text"].as_str())
                    .collect::<Vec<_>>()
                    .join("")
            })
            .unwrap_or_default(),
        "ollama" => data["message"]["content"].as_str().unwrap_or_default().to_string(),
        _ => data["choices"][0]["message"]["content"]
            .as_str()
            .unwrap_or_default()
            .to_string(),
    };

    if text.trim().is_empty() {
        Err("The AI provider returned an empty response.".to_string())
    } else {
        Ok(text)
    }
}

fn extract_json_object(raw: &str) -> Value {
    let cleaned = raw.trim().trim_start_matches("```json").trim_start_matches("```").trim_end_matches("```");
    let start = cleaned.find('{');
    let end = cleaned.rfind('}');
    match (start, end) {
        (Some(start), Some(end)) if end > start => {
            serde_json::from_str(&cleaned[start..=end]).unwrap_or(Value::Null)
        }
        _ => Value::Null,
    }
}

/// Keeps the response inside the curated library and the no-medical-advice rules.
fn enforce_rules(raw: &str, facts: &Value, pantry: &Value) -> Result<String, String> {
    let object = extract_json_object(raw);
    if !object.is_object() {
        return Err("The AI response was not valid JSON.".to_string());
    }
    if object.get("urgent") == Some(&Value::Bool(true)) {
        return Ok(emergency_plan());
    }

    let combined = object.to_string().to_lowercase();
    let banned = ["cure", "curing", "revers", "heal", "detox", "treat thyroid", "prevent thyroid"];
    if banned.iter().any(|word| combined.contains(word)) {
        return Err("The AI response included a medical claim.".to_string());
    }

    let known: HashSet<&str> = facts
        .as_array()
        .map(|items| items.iter().filter_map(|item| item["id"].as_str()).collect())
        .unwrap_or_default();

    let mut result = json!({
        "summary": object.get("summary").cloned().unwrap_or(json!("")),
        "meals": [],
        "timingNotes": [],
        "shopping": [],
        "urgent": false
    });

    for field in ["meals", "timingNotes"] {
        let filtered: Vec<Value> = object
            .get(field)
            .and_then(Value::as_array)
            .map(|entries| {
                entries
                    .iter()
                    .map(|entry| {
                        let mut item = entry.clone();
                        if let Some(ids) = item.get_mut("factIds").and_then(Value::as_array_mut) {
                            ids.retain(|id| id.as_str().map(|text| known.contains(text)).unwrap_or(false));
                        }
                        item
                    })
                    .collect()
            })
            .unwrap_or_default();
        result[field] = Value::Array(filtered);
    }

    /* A shopping item must be missing from the pantry, even if the model lists it.
       Pantry basics are assumed at home and must never be listed. */
    let basics: HashSet<&str> = HashSet::from(["salt", "pepper", "water"]);
    let have: HashSet<String> = pantry
        .as_array()
        .map(|items| {
            items.iter()
                .filter_map(|item| item.as_str())
                .map(|name| name.trim().to_lowercase())
                .collect()
        })
        .unwrap_or_default();
    let mut seen: HashSet<String> = HashSet::new();
    let shopping: Vec<Value> = object
        .get("shopping")
        .and_then(Value::as_array)
        .map(|items| {
            items.iter()
                .filter_map(|item| item.as_str())
                .map(str::trim)
                .filter(|name| !name.is_empty())
                .filter(|name| {
                    let key = name.to_lowercase();
                    !basics.contains(key.as_str()) && !have.contains(&key) && seen.insert(key)
                })
                .map(|name| json!(name))
                .collect()
        })
        .unwrap_or_default();
    result["shopping"] = Value::Array(shopping);

    Ok(result.to_string())
}

/// Generates a plan. The frontend sends only context, preferences and facts.
#[tauri::command]
pub fn suggest_meals(input: String) -> Result<String, String> {
    let payload: Value = serde_json::from_str(&input)
        .map_err(|error| format!("Invalid diet input: {error}"))?;

    if payload.get("alarmingSymptoms") == Some(&Value::Bool(true)) {
        return Ok(emergency_plan());
    }

    let key = env::var("DIET_AI_API_KEY")
        .or_else(|_| env::var("ENERGYPLANNER_AI_API_KEY"))
        .map_err(|_| "AI is not configured on this device. Set DIET_AI_API_KEY in the app environment.".to_string())?;
    let provider = env::var("DIET_AI_PROVIDER").unwrap_or_else(|_| "openai".to_string()).to_lowercase();
    let model = env::var("DIET_AI_MODEL").unwrap_or_else(|_| DEFAULT_MODEL.to_string());
    let endpoint = env::var("DIET_AI_ENDPOINT").unwrap_or_else(|_| DEFAULT_ENDPOINT.to_string());

    let facts = payload.get("facts").cloned().unwrap_or_else(|| json!([]));
    let pantry = payload.get("pantry").cloned().unwrap_or_else(|| json!([]));
    let mut today = payload.clone();
    if let Some(object) = today.as_object_mut() {
        object.remove("facts");
    }
    let user_prompt = format!("FACTS:\n{facts}\n\nTODAY:\n{today}");

    let (url, body) = match provider.as_str() {
        "gemini" => (
            format!("{}/{model}:generateContent?key={key}", endpoint.trim_end_matches('/')),
            json!({
                "systemInstruction": { "parts": [{ "text": SYSTEM_PROMPT }] },
                "contents": [{ "role": "user", "parts": [{ "text": user_prompt }] }],
                "generationConfig": { "temperature": 0.2, "responseMimeType": "application/json" }
            }),
        ),
        "claude" => (
            endpoint,
            json!({
                "model": model,
                "max_tokens": 4096,
                "system": SYSTEM_PROMPT,
                "messages": [{ "role": "user", "content": user_prompt }]
            }),
        ),
        "ollama" => (
            endpoint,
            json!({
                "model": model,
                "stream": false,
                "format": "json",
                "messages": [
                    { "role": "system", "content": SYSTEM_PROMPT },
                    { "role": "user", "content": user_prompt }
                ]
            }),
        ),
        _ => (
            endpoint,
            json!({
                "model": model,
                "temperature": 0.2,
                "response_format": { "type": "json_object" },
                "messages": [
                    { "role": "system", "content": SYSTEM_PROMPT },
                    { "role": "user", "content": user_prompt }
                ]
            }),
        ),
    };

    let mut request = ureq::post(&url).header("Content-Type", "application/json");
    if provider == "claude" {
        request = request.header("x-api-key", key.as_str()).header("anthropic-version", "2023-06-01");
    } else if provider != "gemini" && provider != "ollama" {
        request = request.header("Authorization", format!("Bearer {key}").as_str());
    }

    let response = request
        .send_json(&body)
        .map_err(|error| format!("AI provider request failed: {error}"))?;
    let mut response_body = response.into_body();
    let text = response_body
        .read_to_string()
        .map_err(|error| format!("Could not read AI response: {error}"))?;
    let data: Value = serde_json::from_str(&text)
        .map_err(|error| format!("AI provider returned invalid JSON: {error}"))?;

    enforce_rules(&extract_content(&data, &provider)?, &facts, &pantry)
}

const SHOPPING_UPDATE_PROMPT: &str = "You update a grocery shopping list after the user edits one or more meals. \
Reply only with JSON: {\"add\":[\"item\"],\"remove\":[\"item\"]}. \
Add only items the new meals need that are not in the pantry and not already present as open/bought in the current list. \
Remove only items that were needed only because of the old meals and are no longer needed. \
Never add items the user already has in the pantry. Never suggest items the user already bought or removed. \
Respect allergies and avoid-foods. Keep names short and practical.";

#[tauri::command]
pub fn update_shopping_list(input: String) -> Result<String, String> {
    let payload: Value = serde_json::from_str(&input)
        .map_err(|error| format!("Invalid shopping update input: {error}"))?;

    let key = env::var("DIET_AI_API_KEY")
        .or_else(|_| env::var("ENERGYPLANNER_AI_API_KEY"))
        .map_err(|_| "AI is not configured on this device. Set DIET_AI_API_KEY in the app environment.".to_string())?;
    let provider = env::var("DIET_AI_PROVIDER").unwrap_or_else(|_| "openai".to_string()).to_lowercase();
    let model = env::var("DIET_AI_MODEL").unwrap_or_else(|_| DEFAULT_MODEL.to_string());
    let endpoint = env::var("DIET_AI_ENDPOINT").unwrap_or_else(|_| DEFAULT_ENDPOINT.to_string());

    let user_prompt = format!("INPUT:\n{payload}");
    let (url, body) = match provider.as_str() {
        "gemini" => (
            format!("{}/{model}:generateContent?key={key}", endpoint.trim_end_matches('/')),
            json!({
                "systemInstruction": { "parts": [{ "text": SHOPPING_UPDATE_PROMPT }] },
                "contents": [{ "role": "user", "parts": [{ "text": user_prompt }] }],
                "generationConfig": { "temperature": 0.1, "responseMimeType": "application/json" }
            }),
        ),
        "claude" => (
            endpoint,
            json!({
                "model": model,
                "max_tokens": 1024,
                "system": SHOPPING_UPDATE_PROMPT,
                "messages": [{ "role": "user", "content": user_prompt }]
            }),
        ),
        "ollama" => (
            endpoint,
            json!({
                "model": model,
                "stream": false,
                "format": "json",
                "messages": [
                    { "role": "system", "content": SHOPPING_UPDATE_PROMPT },
                    { "role": "user", "content": user_prompt }
                ]
            }),
        ),
        _ => (
            endpoint,
            json!({
                "model": model,
                "temperature": 0.1,
                "response_format": { "type": "json_object" },
                "messages": [
                    { "role": "system", "content": SHOPPING_UPDATE_PROMPT },
                    { "role": "user", "content": user_prompt }
                ]
            }),
        ),
    };

    let mut request = ureq::post(&url).header("Content-Type", "application/json");
    if provider == "claude" {
        request = request.header("x-api-key", key.as_str()).header("anthropic-version", "2023-06-01");
    } else if provider != "gemini" && provider != "ollama" {
        request = request.header("Authorization", format!("Bearer {key}").as_str());
    }

    let response = request
        .send_json(&body)
        .map_err(|error| format!("AI provider request failed: {error}"))?;
    let mut response_body = response.into_body();
    let text = response_body
        .read_to_string()
        .map_err(|error| format!("Could not read AI response: {error}"))?;
    let data: Value = serde_json::from_str(&text)
        .map_err(|error| format!("AI provider returned invalid JSON: {error}"))?;
    let content = extract_content(&data, &provider)?;
    let parsed: Value = serde_json::from_str(&content)
        .map_err(|error| format!("Shopping update response invalid JSON: {error}"))?;
    let object = parsed.as_object().cloned().ok_or("Shopping update response must be a JSON object")?;
    let add = object.get("add").and_then(Value::as_array).cloned().unwrap_or_default();
    let remove = object.get("remove").and_then(Value::as_array).cloned().unwrap_or_default();
    Ok(json!({ "add": add, "remove": remove }).to_string())
}

const MEAL_ALT_PROMPT: &str = "Suggest one different meal idea for the requested slot. \
Reply only with JSON: {\"idea\":string,\"ingredients\":string[],\"prepMinutes\":number}. \
Do not repeat the current meal. Respect allergies and avoid-foods. Keep it practical and short.";

#[tauri::command]
pub fn suggest_meal_alternative(input: String) -> Result<String, String> {
    let payload: Value = serde_json::from_str(&input)
        .map_err(|error| format!("Invalid meal alternative input: {error}"))?;
    let key = env::var("DIET_AI_API_KEY")
        .or_else(|_| env::var("ENERGYPLANNER_AI_API_KEY"))
        .map_err(|_| "AI is not configured on this device. Set DIET_AI_API_KEY in the app environment.".to_string())?;
    let provider = env::var("DIET_AI_PROVIDER").unwrap_or_else(|_| "openai".to_string()).to_lowercase();
    let model = env::var("DIET_AI_MODEL").unwrap_or_else(|_| DEFAULT_MODEL.to_string());
    let endpoint = env::var("DIET_AI_ENDPOINT").unwrap_or_else(|_| DEFAULT_ENDPOINT.to_string());
    let user_prompt = format!("INPUT:\n{payload}");
    let (url, body) = match provider.as_str() {
        "gemini" => (
            format!("{}/{model}:generateContent?key={key}", endpoint.trim_end_matches('/')),
            json!({
                "systemInstruction": { "parts": [{ "text": MEAL_ALT_PROMPT }] },
                "contents": [{ "role": "user", "parts": [{ "text": user_prompt }] }],
                "generationConfig": { "temperature": 0.4, "responseMimeType": "application/json" }
            }),
        ),
        "claude" => (endpoint, json!({ "model": model, "max_tokens": 512, "system": MEAL_ALT_PROMPT, "messages": [{ "role": "user", "content": user_prompt }] })),
        "ollama" => (endpoint, json!({ "model": model, "stream": false, "format": "json", "messages": [{ "role": "system", "content": MEAL_ALT_PROMPT }, { "role": "user", "content": user_prompt }] })),
        _ => (endpoint, json!({ "model": model, "temperature": 0.4, "response_format": { "type": "json_object" }, "messages": [{ "role": "system", "content": MEAL_ALT_PROMPT }, { "role": "user", "content": user_prompt }] })),
    };
    let mut request = ureq::post(&url).header("Content-Type", "application/json");
    if provider == "claude" { request = request.header("x-api-key", key.as_str()).header("anthropic-version", "2023-06-01"); }
    else if provider != "gemini" && provider != "ollama" { request = request.header("Authorization", format!("Bearer {key}").as_str()); }
    let response = request.send_json(&body).map_err(|error| format!("AI provider request failed: {error}"))?;
    let mut response_body = response.into_body();
    let text = response_body.read_to_string().map_err(|error| format!("Could not read AI response: {error}"))?;
    let data: Value = serde_json::from_str(&text).map_err(|error| format!("AI provider returned invalid JSON: {error}"))?;
    let content = extract_content(&data, &provider)?;
    let parsed: Value = serde_json::from_str(&content)
        .map_err(|error| format!("Meal alternative response invalid JSON: {error}"))?;
    let object = parsed.as_object().cloned().ok_or("Meal alternative response must be a JSON object")?;
    Ok(json!({
        "idea": object.get("idea").and_then(Value::as_str).unwrap_or(""),
        "ingredients": object.get("ingredients").and_then(Value::as_array).cloned().unwrap_or_default(),
        "prepMinutes": object.get("prepMinutes").and_then(Value::as_i64).unwrap_or(10)
    }).to_string())
}
