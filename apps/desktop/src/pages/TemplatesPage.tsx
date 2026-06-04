import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

interface TemplateInfo {
  id: string;
  name: string;
  category: string;
  description: string | null;
}

interface TemplateDetail extends TemplateInfo {
  content: string;
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<TemplateInfo[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateDetail | null>(null);
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [generatedContent, setGeneratedContent] = useState("");
  const [category, setCategory] = useState<string>("");

  useEffect(() => {
    loadTemplates();
  }, [category]);

  const loadTemplates = async () => {
    try {
      const tmpls = await invoke<TemplateInfo[]>("list_templates", {
        category: category || null,
      });
      setTemplates(tmpls || []);
    } catch (e) {
      console.error("Failed to load templates:", e);
      setTemplates([]);
    }
  };

  const handleSelectTemplate = async (id: string) => {
    try {
      const tmpl = await invoke<TemplateInfo | null>("get_template", { id });
      if (tmpl) {
        setSelectedTemplate(tmpl as TemplateDetail);
        setVariables({});
        setGeneratedContent("");
      }
    } catch (e) {
      console.error("Failed to load template:", e);
    }
  };

  const extractVariables = (content: string): string[] => {
    const regex = /\{\{(\w+)\}\}/g;
    const vars: string[] = [];
    let match;
    while ((match = regex.exec(content)) !== null) {
      if (!vars.includes(match[1])) {
        vars.push(match[1]);
      }
    }
    return vars;
  };

  const handleGenerate = async () => {
    if (!selectedTemplate) return;
    try {
      const content = await invoke<string>("generate_document", {
        templateId: selectedTemplate.id,
        variables,
      });
      setGeneratedContent(content);
    } catch (e: any) {
      console.error("Failed to generate:", e);
      alert(`生成失败: ${e}`);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedContent);
    alert("已复制到剪贴板");
  };

  const templateVars = selectedTemplate ? extractVariables(selectedTemplate.content) : [];
  const categoryLabel = (cat: string) => {
    switch (cat) {
      case "contract": return "合同";
      case "letter": return "信函";
      case "report": return "报告";
      default: return cat;
    }
  };

  return (
    <div className="page templates-page">
      <div className="page-header">
        <h1>文 牍 范 式</h1>
        <p className="subtitle">法律文书模板 · 变量填充 · 即时生成</p>
      </div>

      <div className="card">
        <div className="tabs">
          <button className={`tab ${category === "" ? "active" : ""}`} onClick={() => setCategory("")}>全部</button>
          <button className={`tab ${category === "contract" ? "active" : ""}`} onClick={() => setCategory("contract")}>合同</button>
          <button className={`tab ${category === "letter" ? "active" : ""}`} onClick={() => setCategory("letter")}>信函</button>
          <button className={`tab ${category === "report" ? "active" : ""}`} onClick={() => setCategory("report")}>报告</button>
        </div>

        {templates.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">笺</div>
            <div className="empty-state-text">暂无模板</div>
            <div className="empty-state-hint">请在配置中添加文书范式</div>
          </div>
        ) : (
          <div className="templates-grid">
            {templates.map((tmpl) => (
              <div
                key={tmpl.id}
                className="template-card"
                onClick={() => handleSelectTemplate(tmpl.id)}
              >
                <div className="template-category">{categoryLabel(tmpl.category)}</div>
                <div className="template-name">{tmpl.name}</div>
                <div className="template-description">{tmpl.description || "无描述"}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedTemplate && (
        <div className="card result-card">
          <div className="card-header">
            <h3 className="card-title">范式: {selectedTemplate.name}</h3>
            <button className="close-btn" onClick={() => setSelectedTemplate(null)}>×</button>
          </div>

          {templateVars.length > 0 ? (
            <div className="vars-form">
              <h4>填 写 变 量</h4>
              {templateVars.map((v) => (
                <div key={v} className="form-group">
                  <label>{v}</label>
                  <input
                    type="text"
                    value={variables[v] || ""}
                    onChange={(e) => setVariables({ ...variables, [v]: e.target.value })}
                    placeholder={`请输入 ${v}`}
                    className="form-input"
                  />
                </div>
              ))}
              <button className="btn-primary" onClick={handleGenerate}>
                生 成 文 牍
              </button>
            </div>
          ) : (
            <button className="btn-primary" onClick={handleGenerate}>
              直 接 生 成
            </button>
          )}

          {generatedContent && (
            <div className="generated-section">
              <div className="card-header">
                <h4>生成结果</h4>
                <button className="btn-secondary" onClick={handleCopy}>复制全文</button>
              </div>
              <pre className="generated-content">{generatedContent}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
