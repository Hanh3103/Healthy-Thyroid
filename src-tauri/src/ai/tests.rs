//! Test set of sample inputs for AI prompts, limits, validation, and commands.
//! Run after prompt changes to ensure contracts and formatting remain strictly valid.

#[cfg(test)]
mod tests {
    use super::super::client::{build_body, redact_key, validate_url, ProviderConfig};
    use super::super::prompts::{
        PROMPT_VERSION, ENERGY_SYSTEM_PROMPT, PRIORITIZE_SYSTEM_PROMPT,
        PLAN_SYSTEM_PROMPT, SHOPPING_SYSTEM_PROMPT,
    };
    use super::super::validate::{
        check_allergies, drop_unknown_science_ids, extract_json_value, filter_pantry_and_basics,
    };
    use super::super::features::energy::SuggestEnergyInput;
    use super::super::features::prioritize::PrioritizeTasksInput;
    use super::super::features::shopping::UpdateShoppingInput;
    use serde_json::json;

    #[test]
    fn test_prompt_version_and_system_prompts() {
        assert_eq!(PROMPT_VERSION, "1.0.0");
        assert!(ENERGY_SYSTEM_PROMPT.contains("level"));
        assert!(PRIORITIZE_SYSTEM_PROMPT.contains("tasks"));
        assert!(PLAN_SYSTEM_PROMPT.contains("meals"));
        assert!(SHOPPING_SYSTEM_PROMPT.contains("neededIngredients"));
    }

    #[test]
    fn test_extract_json_with_code_fences() {
        let fenced = "```json\n{\"level\": 1, \"reason\": \"Rest recommended.\"}\n```";
        let val = extract_json_value(fenced).expect("Should parse fenced JSON");
        assert_eq!(val["level"], 1);
        assert_eq!(val["reason"], "Rest recommended.");

        let bare = "{\"level\": 3, \"reason\": \"High energy!\"}";
        let val2 = extract_json_value(bare).expect("Should parse bare JSON");
        assert_eq!(val2["level"], 3);

        let array_fenced = "```\n[{\"id\": \"t1\", \"minutes\": 15, \"energy\": 1}]\n```";
        let val3 = extract_json_value(array_fenced).expect("Should parse array JSON");
        assert!(val3.is_array());
    }

    #[test]
    fn test_key_redaction() {
        let key = "secret_api_key_xyz123";
        let err = format!("Failed to call https://generativelanguage.googleapis.com/v1beta?key={key}: invalid auth {key}");
        let redacted = redact_key(&err, key);
        assert!(!redacted.contains(key));
        assert!(redacted.contains("••••"));
    }

    #[test]
    fn test_url_allowlist() {
        assert!(validate_url("gemini", "https://generativelanguage.googleapis.com/v1beta").is_ok());
        assert!(validate_url("gemini", "https://malicious-site.com").is_err());

        assert!(validate_url("claude", "https://api.anthropic.com/v1/messages").is_ok());
        assert!(validate_url("claude", "https://evil.org").is_err());

        assert!(validate_url("ollama", "http://localhost:11434/api/chat").is_ok());
        assert!(validate_url("ollama", "http://127.0.0.1:11434/api/chat").is_ok());
        assert!(validate_url("ollama", "http://remote-insecure.com").is_err());

        assert!(validate_url("openai", "https://api.openai.com/v1/chat/completions").is_ok());
        assert!(validate_url("openai", "http://insecure-openai.com").is_err());
    }

    #[test]
    fn test_allergy_and_pantry_filtering() {
        let ingredients = vec!["peanut butter".to_string(), "tofu".to_string(), "salt".to_string(), "black pepper".to_string()];
        let allergies = vec!["peanuts".to_string()];
        let found = check_allergies(&ingredients, &allergies);
        assert_eq!(found, vec!["peanuts"]);

        let pantry = vec!["tofu".to_string()];
        let current_shopping = vec!["apples".to_string()];
        let needed = filter_pantry_and_basics(&ingredients, &pantry, &current_shopping);
        // Salt should be excluded as basic, tofu excluded as in pantry
        assert_eq!(needed, vec!["peanut butter"]);
    }

    #[test]
    fn test_drop_unknown_science_ids() {
        let mut sample_reply = json!({
            "meals": [
                { "day": "2026-11-23", "slot": "lunch", "factIds": ["fact-1", "fake-fact-999"] }
            ],
            "foodAdvice": [
                { "text": "Take levothyroxine with water", "factIds": ["fact-1", "unverified"] }
            ]
        });
        let allowed = vec!["fact-1".to_string(), "fact-2".to_string()];
        drop_unknown_science_ids(&mut sample_reply, &allowed);

        let meal_facts = sample_reply["meals"][0]["factIds"].as_array().unwrap();
        assert_eq!(meal_facts.len(), 1);
        assert_eq!(meal_facts[0], "fact-1");

        let advice_facts = sample_reply["foodAdvice"][0]["factIds"].as_array().unwrap();
        assert_eq!(advice_facts.len(), 1);
        assert_eq!(advice_facts[0], "fact-1");
    }

    #[test]
    fn test_feature_input_allowlist_and_rejection() {
        // Unknown field on SuggestEnergyInput must fail deserialization
        let bad_energy = json!({
            "symptoms": "fatigue",
            "unauthorized_field": "injected"
        });
        assert!(serde_json::from_value::<SuggestEnergyInput>(bad_energy).is_err());

        let good_energy = json!({ "symptoms": "feeling tired and cold" });
        assert!(serde_json::from_value::<SuggestEnergyInput>(good_energy).is_ok());

        // Unknown field on PrioritizeTasksInput must fail
        let bad_prioritize = json!({
            "energy": 2,
            "today": "2026-11-23",
            "weekday": "Monday",
            "tasks": [],
            "extra_note": "hack"
        });
        assert!(serde_json::from_value::<PrioritizeTasksInput>(bad_prioritize).is_err());

        let good_prioritize = json!({
            "energy": 2,
            "today": "2026-11-23",
            "weekday": "Monday",
            "tasks": [
                { "id": "t1", "title": "Reply to doctor", "due": "2026-11-23" }
            ]
        });
        let parsed = serde_json::from_value::<PrioritizeTasksInput>(good_prioritize);
        assert!(parsed.is_ok());
        assert_eq!(parsed.unwrap().tasks.len(), 1);

        // Unknown field on UpdateShoppingInput must fail
        let bad_shopping = json!({
            "changedMeal": {
                "date": "2026-11-23",
                "slot": "dinner",
                "old": { "idea": "salad", "ingredients": ["lettuce"], "prepMinutes": 10 },
                "new": { "idea": "soup", "ingredients": ["carrots"], "prepMinutes": 20 },
                "unknown": 123
            },
            "pantry": [],
            "currentShoppingList": []
        });
        assert!(serde_json::from_value::<UpdateShoppingInput>(bad_shopping).is_err());
    }

    #[test]
    fn test_provider_body_generation() {
        let config = ProviderConfig {
            provider: "gemini".to_string(),
            model: "gemini-3.8-flash".to_string(),
            endpoint: "https://generativelanguage.googleapis.com/v1beta/models".to_string(),
            key: "test_key".to_string(),
        };
        let (url, body) = build_body(&config, "system prompt", "user prompt", 0.2, 512).unwrap();
        assert!(url.contains("generateContent?key=test_key"));
        assert!(body.get("generationConfig").is_some());

        let claude_cfg = ProviderConfig {
            provider: "claude".to_string(),
            model: "claude-3-5-haiku".to_string(),
            endpoint: "https://api.anthropic.com/v1/messages".to_string(),
            key: "sk-ant-test".to_string(),
        };
        let (c_url, c_body) = build_body(&claude_cfg, "system", "user", 0.0, 1024).unwrap();
        assert_eq!(c_url, "https://api.anthropic.com/v1/messages");
        assert_eq!(c_body["model"], "claude-3-5-haiku");
    }
}
