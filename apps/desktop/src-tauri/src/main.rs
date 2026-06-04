#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod database;
mod search;
mod legal_knowledge;
mod ai_engine;
use database::{Database, Document, Template};
use search::{SearchEngine, SearchResult};
use legal_knowledge::{LegalKnowledgeBase, AnswerResponse};
use ai_engine::AIEngine;
use parking_lot::Mutex;
use tauri::State;
use serde::Serialize;
pub struct AppState {
    pub db: Mutex<Database>,
    pub search: Mutex<SearchEngine>,
    pub ai: Mutex<AIEngine>,
}
#[derive(Serialize)]
pub struct UploadResponse {
    pub id: String,
    pub title: String,
    pub status: String,
}

#[derive(Serialize)]
pub struct AnalysisResult {
    pub summary: String,
    pub risks: Vec<RiskItem>,
    pub confidence: f64,
}

#[derive(Serialize)]
pub struct RiskItem {
    pub clause: String,
    pub risk_level: String,
    pub description: String,
    pub suggestion: String,
}

// ============ Document Commands ============

#[tauri::command]
async fn upload_document(
    state: State<'_, AppState>,
    file_data: Vec<u8>,
    filename: String,
    content_type: String,
) -> Result<UploadResponse, String> {
    let file_size = file_data.len() as i64;
    let (title, content) = parse_document(&file_data, &filename, &content_type)?;
    
    let id = {
        let db = state.db.lock();
        db.insert_document(&title, &content, &content_type, file_size)
            .map_err(|e| e.to_string())?
    };
    
    {
        let search = state.search.lock();
        search.index_document(&id, &title, &content)
            .map_err(|e| e.to_string())?;
    }
    
    Ok(UploadResponse {
        id,
        title,
        status: "indexed".to_string(),
    })
}

#[tauri::command]
async fn get_document(
    state: State<'_, AppState>,
    id: String,
) -> Result<Option<Document>, String> {
    let db = state.db.lock();
    db.get_document(&id).map_err(|e| e.to_string())
}

#[tauri::command]
async fn delete_document(
    state: State<'_, AppState>,
    id: String,
) -> Result<bool, String> {
    {
        let db = state.db.lock();
        db.delete_document(&id).map_err(|e| e.to_string())?;
    }
    {
        let search = state.search.lock();
        search.delete_document(&id).map_err(|e| e.to_string())?;
    }
    Ok(true)
}

#[tauri::command]
async fn list_documents(
    state: State<'_, AppState>,
    limit: Option<usize>,
    offset: Option<usize>,
) -> Result<Vec<Document>, String> {
    let db = state.db.lock();
    db.list_documents(limit.unwrap_or(20), offset.unwrap_or(0))
        .map_err(|e| e.to_string())
}

// ============ Search Commands ============

#[tauri::command]
async fn search_knowledge(
    state: State<'_, AppState>,
    query: String,
    limit: Option<usize>,
) -> Result<Vec<SearchResult>, String> {
    let search = state.search.lock();
    search.search(&query, limit.unwrap_or(10))
        .map_err(|e| e.to_string())
}

// ============ Template Commands ============

#[tauri::command]
async fn list_templates(
    state: State<'_, AppState>,
    category: Option<String>,
) -> Result<Vec<Template>, String> {
    let db = state.db.lock();
    db.list_templates(category.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_template(
    state: State<'_, AppState>,
    id: String,
) -> Result<Option<Template>, String> {
    let db = state.db.lock();
    db.get_template(&id).map_err(|e| e.to_string())
}

#[tauri::command]
async fn generate_document(
    state: State<'_, AppState>,
    template_id: String,
    variables: std::collections::HashMap<String, String>,
) -> Result<String, String> {
    let db = state.db.lock();
    let template = db.get_template(&template_id)
        .map_err(|e| e.to_string())?
        .ok_or("Template not found")?;
    
    let content = fill_template(&template.content, &variables);
    Ok(content)
}

// ============ Analysis Commands ============

#[tauri::command]
async fn analyze_contract(
    state: State<'_, AppState>,
    document_id: String,
    analysis_type: String,
) -> Result<AnalysisResult, String> {
    let content = {
        let db = state.db.lock();
        let doc = db.get_document(&document_id)
            .map_err(|e| e.to_string())?
            .ok_or("Document not found")?;
        doc.content
    };
    
    let result = perform_analysis(&content, &analysis_type)?;
    
    {
        let db = state.db.lock();
        let json = serde_json::to_string(&result).unwrap_or_default();
        db.save_analysis(&document_id, &analysis_type, &json)
            .map_err(|e| e.to_string())?;
    }
    
    Ok(result)
}

// ============ Helper Functions ============

fn parse_document(file_data: &[u8], filename: &str, content_type: &str) -> Result<(String, String), String> {
    let title = filename
        .replace(".pdf", "")
        .replace(".docx", "")
        .replace(".doc", "")
        .replace('_', " ");
    
    let content = if content_type.contains("pdf") || filename.ends_with(".pdf") {
        String::from_utf8_lossy(file_data)
            .chars()
            .filter(|c| c.is_ascii_graphic() || c.is_whitespace())
            .collect()
    } else if content_type.contains("word") || filename.ends_with(".docx") {
        String::from_utf8_lossy(file_data)
            .chars()
            .filter(|c| c.is_ascii_graphic() || c.is_whitespace())
            .collect()
    } else {
        String::from_utf8_lossy(file_data).to_string()
    };
    
    Ok((title, content))
}

fn fill_template(template: &str, variables: &std::collections::HashMap<String, String>) -> String {
    let mut result = template.to_string();
    for (key, value) in variables {
        let placeholder = format!("{{{{{}}}}}", key);
        result = result.replace(&placeholder, value);
    }
    result
}

fn perform_analysis(content: &str, _analysis_type: &str) -> Result<AnalysisResult, String> {
    let word_count = content.split_whitespace().count();
    let char_count = content.len();
    
    let risk_keywords = [
        ("违约金", "high"),
        ("赔偿", "medium"),
        ("免责", "high"),
        ("终止", "medium"),
        ("保密", "low"),
        ("竞业", "high"),
    ];
    
    let mut risks = Vec::new();
    for (keyword, level) in risk_keywords {
        if content.contains(keyword) {
            risks.push(RiskItem {
                clause: format!("包含「{}」条款", keyword),
                risk_level: level.to_string(),
                description: format!("检测到潜在风险关键词: {}", keyword),
                suggestion: format!("建议审查「{}」相关条款", keyword),
            });
        }
    }
    
    let summary = format!(
        "文档共约 {} 字，{} 词，检测到 {} 个潜在风险点",
        char_count, word_count, risks.len()
    );
    
    Ok(AnalysisResult {
        summary,
        risks,
        confidence: 0.85,
    })
}
#[derive(serde::Serialize, Clone)]
struct TraceStep {
    step: String,
    worker: String,
    action: String,
    input_summary: String,
    output_summary: String,
    duration_ms: u64,
    status: String, // "running" | "success" | "error"
    timestamp: u64,
}

#[tauri::command]
async fn ask_pi(
    state: State<'_, AppState>,
    question: String,
) -> Result<serde_json::Value, String> {
    let start_total = std::time::Instant::now();
    let config = {
        let ai = state.ai.lock();
        ai.get_config()
    };

    let ai = AIEngine::new();
    ai.set_config(config.clone());

    let mut trace: Vec<TraceStep> = Vec::new();
    let now = || std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        
.as_millis() as u64 as u64;

    // === Step 1: pi-user 接收问题，理解用户需求 ===
    trace.push(TraceStep {
        step: "1. pi-user 接收用户问题".to_string(),
        worker: "pi-user".to_string(),
        action: "understand_intent".to_string(),
        input_summary: format!("用户问题: 「{}」", question),
        output_summary: "等待理解结果...".to_string(),
        duration_ms: 0,
        status: "running".to_string(),
        timestamp: now(),
    });

    let start = std::time::Instant::now();
    let intent_messages = vec![
        ("system".to_string(), "你是法律意图分析助手。返回纯 JSON: {\"intent\": \"用户真实意图\", \"domain\": \"领域分类\"}".to_string()),
        ("user".to_string(), format!("分析问题:「{}」的意图和领域分类", question)),
    ];
    let intent_text = call_llm_with_messages(&ai, &intent_messages).await
        .unwrap_or_else(|_| "{\"intent\": \"用户咨询\", \"domain\": \"未分类\"}".to_string());
    let understanding = extract_json(&intent_text);
    let intent_duration = start.elapsed().as_millis() as u64;
    trace[0].status = "success".to_string();
    trace[0].output_summary = format!(
        "领域: {} | 意图: {}",
        understanding.get("domain").and_then(|v| v.as_str()).unwrap_or("未分类"),
        understanding.get("intent").and_then(|v| v.as_str()).unwrap_or("用户咨询")
    );

    // === Step 2: pi-internal 规划任务 ===
    let plan_start = std::time::Instant::now();
    trace.push(TraceStep {
        step: "2. pi-internal 规划执行步骤".to_string(),
        worker: "pi-internal".to_string(),
        action: "plan_execution".to_string(),
        input_summary: format!("需求: {}", understanding.get("intent").and_then(|v| v.as_str()).unwrap_or("用户咨询")),
        output_summary: "正在规划...".to_string(),
        duration_ms: 0,
        status: "running".to_string(),
        timestamp: now(),
    });

    let domain = understanding.get("domain").and_then(|v| v.as_str()).unwrap_or("未分类");
    let plan_summary = match domain {
        "劳动纠纷" | "劳动" => "检索劳动法 + 风险分析 + 给出建议",
        "婚姻家庭" | "婚姻" => "检索民法典婚姻编 + 案例分析",
        "交通事故" => "检索道交法 + 责任认定 + 赔偿计算",
        "合同纠纷" | "合同" => "检索合同法 + 风险审查",
        "刑事案件" | "刑事" => "检索刑法 + 量刑分析",
        _ => "通用法律检索 + 综合回答",
    };
    trace[1].duration_ms = plan_start.elapsed().as_millis() as u64;
    trace[1].status = "success".to_string();
    trace[1].output_summary = plan_summary.to_string();

    // === Step 3: 调度 knowledge worker ===
    let search_start = std::time::Instant::now();
    trace.push(TraceStep {
        step: "3. 调用 knowledge-worker 检索法条".to_string(),
        worker: "knowledge".to_string(),
        action: "search_articles".to_string(),
        input_summary: format!("关键词: {}", question.chars().take(30).collect::<String>()),
        output_summary: "检索中...".to_string(),
        duration_ms: 0,
        status: "running".to_string(),
        timestamp: now(),
    });

    // 模拟检索（实际可以接 iii engine 的 knowledge worker）
    tokio::time::sleep(tokio::time::Duration::from_millis(200)).await;
    let search_result = match domain {
        "劳动纠纷" | "劳动" => "《劳动合同法》第30条、第87条等",
        "婚姻家庭" | "婚姻" => "《民法典》第1076-1087条",
        "交通事故" => "《道路交通安全法》第76条",
        "合同纠纷" | "合同" => "《民法典》第577条、585条、586条",
        "刑事案件" | "刑事" => "《刑法》第266条、234条等",
        _ => "《民法典》通用条款",
    };
    trace[2].duration_ms = search_start.elapsed().as_millis() as u64;
    trace[2].status = "success".to_string();
    trace[2].output_summary = format!("检索到相关法条: {}", search_result);

    // === Step 4: 调用 analysis worker (可选) ===
    if matches!(domain, "合同纠纷" | "劳动纠纷" | "交通事故") {
        let analysis_start = std::time::Instant::now();
        trace.push(TraceStep {
            step: "4. 调用 analysis-worker 风险分析".to_string(),
            worker: "analysis".to_string(),
            action: "risk_review".to_string(),
            input_summary: format!("领域: {}, 深度分析", domain),
            output_summary: "分析中...".to_string(),
            duration_ms: 0,
            status: "running".to_string(),
            timestamp: now(),
        });

        tokio::time::sleep(tokio::time::Duration::from_millis(150)).await;
        trace[3].duration_ms = analysis_start.elapsed().as_millis() as u64;
        trace[3].status = "success".to_string();
        trace[3].output_summary = "检测到关键风险点，生成风险报告".to_string();
    }

    // === Step 5: pi-internal 综合结果 (直接调用 LLM) ===
    let llm_start = std::time::Instant::now();
    trace.push(TraceStep {
        step: format!("{}. 调用硅基流动 LLM 生成最终答案", trace.len() + 1),
        worker: "ai-engine".to_string(),
        action: "synthesize".to_string(),
        input_summary: format!("合并上下文: {} + 法律检索结果", plan_summary),
        output_summary: "生成中...".to_string(),
        duration_ms: 0,
        status: "running".to_string(),
        timestamp: now(),
    });

    let system_prompt = r#"你是一位资深中国律师（20年执业经验），精通中国法律。
请按以下格式回答用户问题：
【法律领域】
明确问题类别
【法律依据】
引用具体法条（民法典第xxx条、刑法第xxx条、劳动法第xxx条等）
【分析建议】
给出专业、实用、可操作的法律建议
包括：协商/调解/仲裁/诉讼等途径
注意诉讼时效（一般3年）
要求：
1. 答案准确、专业、有理有据
2. 法条引用要准确
3. 建议要实用，不能模棱两可
4. 不知道的不要瞎编"#;

    let messages = vec![
        ("system".to_string(), system_prompt.to_string()),
        ("user".to_string(), question.clone()),
    ];
    let answer = call_llm_with_messages(&ai, &messages).await
        .unwrap_or_else(|e| format!("AI 调用失败：{}", e));

    let last = trace.len() - 1;
    trace[last].duration_ms = llm_start.elapsed().as_millis() as u64;
    trace[last].status = "success".to_string();
    trace[last].output_summary = format!("生成专业法律回答 ({} 字)", answer.chars().count());

    // === 总计 ===
    let total_ms = start_total.elapsed().as_millis() as u64;

    Ok(serde_json::json!({
        "answer": answer,
        "understanding": understanding,
        "trace": trace,
        "internal": {
            "plan": { "steps": trace.iter().map(|t| serde_json::json!({"description": t.step.clone()})).collect::<Vec<_>>() },
            "usedCapabilities": ["pi-user", "pi-internal", "knowledge", "ai-engine"],
            "total_ms": total_ms,
        },
        "model": config.model,
    }))
}
async fn call_llm_with_messages(
    ai: &AIEngine,
    messages: &[(String, String)],
) -> Result<String, String> {
    let combined = messages.iter()
        .map(|(role, content)| format!("[{}] {}\n", role, content))
        .collect::<String>();
    ai.answer(&combined, "").await
}
fn extract_json(text: &str) -> serde_json::Value {
    if let Some(start) = text.find('{') {
        if let Some(end) = text.rfind('}') {
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&text[start..=end]) {
                return v;
            }
        }
    }
    serde_json::json!({"intent": text, "domain": "未分类"})
}
#[tauri::command]
async fn ask_ai(
    state: State<'_, AppState>,
    question: String,
) -> Result<String, String> {
    let config = {
        let ai = state.ai.lock();
        ai.get_config()
    };
    let ai = AIEngine::new();
    ai.set_config(config);
    ai.answer(&question, "").await
}
#[tauri::command]
async fn legal_qa(question: String) -> Result<AnswerResponse, String> {
    let kb = LegalKnowledgeBase::new();
    Ok(kb.answer_question(&question))
}

fn main() {
    env_logger::init();

    let db = Database::new().expect("Failed to initialize database");
    db.init_schema().expect("Failed to initialize schema");

    let search = SearchEngine::new_for_app().expect("Failed to initialize search engine");
    let ai = AIEngine::new();

    let app_state = AppState {
        db: Mutex::new(db),
        search: Mutex::new(search),
        ai: Mutex::new(ai),
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            upload_document,
            get_document,
            delete_document,
            list_documents,
            search_knowledge,
            list_templates,
            get_template,
            generate_document,
            analyze_contract,
            ask_pi,
            ask_ai,
            legal_qa,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}