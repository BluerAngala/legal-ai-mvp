use serde::{Deserialize, Serialize};
use std::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AIConfig {
    pub provider: String,
    pub api_url: String,
    pub api_key: String,
    pub model: String,
}

pub const DEFAULT_API_KEY: &str = "sk-crwfmfqcogblddlpymiqqaatuepooklkjdelsxephytdswwe";
pub const DEFAULT_MODEL: &str = "Pro/MiniMaxAI/MiniMax-M2.5";

impl Default for AIConfig {
    fn default() -> Self {
        Self {
            provider: "siliconflow".to_string(),
            api_url: "https://api.siliconflow.cn/v1/chat/completions".to_string(),
            api_key: DEFAULT_API_KEY.to_string(),
            model: DEFAULT_MODEL.to_string(),
        }
    }
}

pub struct AIEngine {
    config: Mutex<AIConfig>,
    client: reqwest::Client,
}

impl AIEngine {
    pub fn new() -> Self {
        Self {
            config: Mutex::new(AIConfig::default()),
            client: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(60))
                .build()
                .unwrap_or_default(),
        }
    }

    pub fn set_config(&self, config: AIConfig) {
        *self.config.lock().unwrap() = config;
    }

    pub fn get_config(&self) -> AIConfig {
        self.config.lock().unwrap().clone()
    }

    /// Generate a professional legal answer using LLM
    pub async fn answer(&self, question: &str, context: &str) -> Result<String, String> {
        let config = self.get_config();
        let prompt = self.build_prompt(question, context);

        match config.provider.as_str() {
            "siliconflow" | "openai" => self.call_openai_compatible(&prompt, &config).await,
            "ollama" => self.call_ollama(&prompt, &config).await,
            "claude" => self.call_claude(&prompt, &config).await,
            _ => Ok(self.call_local_fallback(question)),
        }
    }

    fn build_prompt(&self, question: &str, context: &str) -> String {
        format!(
            r#"你是一位资深中国律师，拥有20年执业经验。请基于法律知识，用专业但易懂的语言回答用户的法律问题。

要求：
1. 先识别问题涉及的法律领域（如：合同纠纷、婚姻家庭、交通事故、劳动纠纷、刑事案件等）
2. 引用具体法条（民法典第xxx条、刑法第xxx条等）
3. 给出明确的行动建议
4. 答案要专业、准确、实用

相关参考资料：
{}

用户问题：{}

请用中文回答，结构清晰：
【法律领域】
【法律依据】
【分析建议】"#,
            context, question
        )
    }

    async fn call_openai_compatible(&self, prompt: &str, config: &AIConfig) -> Result<String, String> {
        let body = serde_json::json!({
            "model": config.model,
            "messages": [
                {"role": "system", "content": "你是一位资深中国律师，专业、准确、实用。"},
                {"role": "user", "content": prompt}
            ],
            "temperature": 0.3,
            "max_tokens": 2000,
            "stream": false
        });

        let response = self.client
            .post(&config.api_url)
            .header("Authorization", format!("Bearer {}", config.api_key))
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("API 调用失败：{}。请检查网络或 API Key", e))?;

        let status = response.status();
        if !status.is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(format!("API 返回错误 {}: {}", status, error_text));
        }

        let json: serde_json::Value = response.json().await
            .map_err(|e| format!("解析响应失败：{}", e))?;

        if let Some(content) = json.get("choices")
            .and_then(|c| c.get(0))
            .and_then(|c| c.get("message"))
            .and_then(|m| m.get("content"))
            .and_then(|v| v.as_str()) {
            return Ok(content.to_string());
        }

        Err("响应格式错误".to_string())
    }

    async fn call_ollama(&self, prompt: &str, config: &AIConfig) -> Result<String, String> {
        let url = format!("{}/api/generate", config.api_url);
        let body = serde_json::json!({
            "model": config.model,
            "prompt": prompt,
            "stream": false
        });

        let response = self.client
            .post(&url)
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Ollama 连接失败：{}", e))?;

        let json: serde_json::Value = response.json().await
            .map_err(|e| format!("解析响应失败：{}", e))?;

        json.get("response")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .ok_or_else(|| "响应格式错误".to_string())
    }

    async fn call_claude(&self, prompt: &str, config: &AIConfig) -> Result<String, String> {
        let url = "https://api.anthropic.com/v1/messages";
        let body = serde_json::json!({
            "model": config.model,
            "max_tokens": 2000,
            "messages": [
                {"role": "user", "content": prompt}
            ]
        });

        let response = self.client
            .post(url)
            .header("x-api-key", &config.api_key)
            .header("anthropic-version", "2023-06-01")
            .header("content-type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Claude 调用失败：{}", e))?;

        let json: serde_json::Value = response.json().await
            .map_err(|e| format!("解析响应失败：{}", e))?;

        json.get("content")
            .and_then(|c| c.get(0))
            .and_then(|c| c.get("text"))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .ok_or_else(|| "响应格式错误".to_string())
    }

    fn call_local_fallback(&self, question: &str) -> String {
        format!(r#"
【法律领域识别】
您的问题涉及法律咨询。

【分析框架】
1. **事实梳理**：请明确纠纷的时间、人物、事件、证据
2. **法律关系**：分析涉及的法律关系（合同/侵权/婚姻/劳动/刑事等）
3. **证据收集**：保留相关证据（合同、聊天记录、票据等）
4. **时效注意**：注意诉讼时效（一般为3年）

【行动建议】
- **协商优先**：先尝试与对方协商解决
- **证据保全**：及时收集保存证据
- **专业咨询**：建议咨询专业律师
- **调解/仲裁**：可通过调解委员会或仲裁机构解决
- **诉讼准备**：如协商不成，可向法院起诉

您的问题：「{}」

请提供更多细节以便更具体的分析：
- 涉及哪类纠纷（合同/侵权/婚姻/劳动/刑事）？
- 当事人是谁？关键事实？有哪些证据？
"#, question)
    }
}
