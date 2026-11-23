//! Validation and sanitization helpers for AI payloads and outputs.

use serde_json::Value;

/// Basic cooking items that should never be placed in a shopping list.
pub const BASIC_ITEMS: &[&str] = &["salt", "pepper", "water"];

/// Remove markdown code fences and parse a JSON object or array.
pub fn extract_json_value(raw: &str) -> Result<Value, String> {
    let trimmed = raw.trim();
    let cleaned = trimmed
        .strip_prefix("```json")
        .or_else(|| trimmed.strip_prefix("```"))
        .unwrap_or(trimmed);
    let cleaned = cleaned.strip_suffix("```").unwrap_or(cleaned).trim();

    // Try parsing directly
    if let Ok(v) = serde_json::from_str::<Value>(cleaned) {
        return Ok(v);
    }

    // Try finding outer JSON object {...} or array [...]
    let obj_start = cleaned.find('{');
    let obj_end = cleaned.rfind('}');
    let arr_start = cleaned.find('[');
    let arr_end = cleaned.rfind(']');

    match (obj_start, obj_end, arr_start, arr_end) {
        (Some(os), Some(oe), Some(as_), Some(ae)) => {
            if os < as_ && oe > ae {
                serde_json::from_str(&cleaned[os..=oe])
                    .map_err(|e| format!("Invalid AI response JSON: {e}"))
            } else {
                serde_json::from_str(&cleaned[as_..=ae])
                    .map_err(|e| format!("Invalid AI response JSON: {e}"))
            }
        }
        (Some(os), Some(oe), None, _) if oe > os => serde_json::from_str(&cleaned[os..=oe])
            .map_err(|e| format!("Invalid AI response JSON: {e}")),
        (None, _, Some(as_), Some(ae)) if ae > as_ => serde_json::from_str(&cleaned[as_..=ae])
            .map_err(|e| format!("Invalid AI response JSON: {e}")),
        _ => Err("AI response contained no valid JSON object or array.".to_string()),
    }
}

/// Strip unknown science fact IDs from meals and food advice.
pub fn drop_unknown_science_ids(reply: &mut Value, allowed_fact_ids: &[String]) {
    let allowed_set: std::collections::HashSet<&str> =
        allowed_fact_ids.iter().map(String::as_str).collect();

    if let Some(meals) = reply.get_mut("meals").and_then(Value::as_array_mut) {
        for meal in meals {
            if let Some(fact_ids) = meal.get_mut("factIds").and_then(Value::as_array_mut) {
                fact_ids.retain(|id| {
                    id.as_str().map(|s| allowed_set.contains(s)).unwrap_or(false)
                });
            }
        }
    }

    if let Some(advice) = reply.get_mut("foodAdvice").and_then(Value::as_array_mut) {
        for item in advice {
            if let Some(fact_ids) = item.get_mut("factIds").and_then(Value::as_array_mut) {
                fact_ids.retain(|id| {
                    id.as_str().map(|s| allowed_set.contains(s)).unwrap_or(false)
                });
            }
        }
    }

    if let Some(timing) = reply.get_mut("timingNotes").and_then(Value::as_array_mut) {
        for item in timing {
            if let Some(fact_ids) = item.get_mut("factIds").and_then(Value::as_array_mut) {
                fact_ids.retain(|id| {
                    id.as_str().map(|s| allowed_set.contains(s)).unwrap_or(false)
                });
            }
        }
    }
}

/// Filter out pantry items and current shopping list items from needed ingredients.
pub fn filter_pantry_and_basics(
    items: &[String],
    pantry: &[String],
    current_shopping: &[String],
) -> Vec<String> {
    let pantry_lower: Vec<String> = pantry.iter().map(|s| s.trim().to_lowercase()).collect();
    let shopping_lower: Vec<String> = current_shopping.iter().map(|s| s.trim().to_lowercase()).collect();

    let mut result = Vec::new();
    let mut seen = std::collections::HashSet::new();

    for item in items {
        let trimmed = item.trim();
        let lower = trimmed.to_lowercase();
        if trimmed.is_empty() {
            continue;
        }

        // Check basic staples
        if BASIC_ITEMS.iter().any(|b| lower == *b || lower.contains(b)) {
            continue;
        }

        // Check pantry
        if pantry_lower.iter().any(|p| p == &lower || lower.contains(p.as_str()) && p.len() >= 4) {
            continue;
        }

        // Check current shopping list
        if shopping_lower.iter().any(|s| s == &lower) {
            continue;
        }

        if seen.insert(lower) {
            result.push(trimmed.to_string());
        }
    }

    result
}

/// Check if any ingredients violate user allergies. Returns matching allergens if any.
pub fn check_allergies(ingredients: &[String], allergies: &[String]) -> Vec<String> {
    let mut found = Vec::new();
    for allergy in allergies {
        let allergy_clean = allergy.trim().to_lowercase();
        if allergy_clean.is_empty() {
            continue;
        }
        let singular = allergy_clean.strip_suffix('s').unwrap_or(&allergy_clean);
        for ingredient in ingredients {
            let ing_lower = ingredient.to_lowercase();
            if ing_lower.contains(&allergy_clean) || (!singular.is_empty() && ing_lower.contains(singular)) {
                if !found.contains(&allergy_clean) {
                    found.push(allergy_clean.clone());
                }
            }
        }
    }
    found
}
