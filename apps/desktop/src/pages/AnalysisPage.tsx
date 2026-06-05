import { useState, useEffect } from "react";
import { analysis, upload, type AnalysisResult, type UploadItem } from "../lib/api";
type DocumentInfo = UploadItem;
export default function AnalysisPage() {
	const [documents, setDocuments] = useState<DocumentInfo[]>([]);
	const [selectedDoc, setSelectedDoc] = useState<string>("");
	const [analysisType, setAnalysisType] = useState<"risk_review" | "summarize" | "clause_compare">("risk_review");
	const [result, setResult] = useState<AnalysisResult | null>(null);
	const [loading, setLoading] = useState(false);
	useEffect(() => {
		loadDocuments();
	}, []);
	const loadDocuments = async () => {
		try {
			const docs = await upload.list(100, 0);
			setDocuments(docs || []);
		} catch (e) {
			console.error("Failed to load documents:", e);
			setDocuments([]);
		}
	};
	const handleAnalyze = async () => {
		if (!selectedDoc) {
			alert("请先选择要分析的文档");
			return;
		}
		setLoading(true);
		setResult(null);
		try {
			let res: AnalysisResult;
			if (analysisType === "risk_review") {
				res = await analysis.riskReview(selectedDoc);
			} else if (analysisType === "summarize") {
				res = await analysis.summarize(selectedDoc);
			} else {
				// clause_compare 需要两份文档，第二份用最近的一份做兜底
				const docs = await upload.list(2, 0);
				const otherDoc = docs.find((d) => d.id !== selectedDoc);
				if (!otherDoc) {
					alert("条款对比需要至少两份文档");
					return;
				}
				res = await analysis.clauseCompare(selectedDoc, otherDoc.id);
			}
			setResult(res);
		} catch (e) {
			console.error("Analysis failed:", e);
			alert(`分析失败: ${e instanceof Error ? e.message : String(e)}`);
		}
		setLoading(false);
	};

	return (
		<div className="page analysis-page">
			<div className="page-header">
				<h1>契 约 审 查</h1>
				<p className="subtitle">智能识别法律风险 · 援引具体条款</p>
			</div>

			<div className="card">
				<h3 className="card-title">选择文档与分析类型</h3>

				<div className="form-group">
					<label>文献选择</label>
					<select
						value={selectedDoc}
						onChange={(e) => setSelectedDoc(e.target.value)}
						className="form-select"
					>
						<option value="">— 请选择文档 —</option>
						{documents.map((doc) => (
							<option key={doc.id} value={doc.id}>
								{doc.filename}
							</option>
						))}
					</select>
				</div>

				<div className="form-group">
					<label>分析类型</label>
					<div className="tabs">
						<button
							className={`tab ${analysisType === "risk_review" ? "active" : ""}`}
							onClick={() => setAnalysisType("risk_review")}
						>
							风险审查
						</button>
						<button
							className={`tab ${analysisType === "summarize" ? "active" : ""}`}
							onClick={() => setAnalysisType("summarize")}
						>
							摘要生成
						</button>
						<button
							className={`tab ${analysisType === "clause_compare" ? "active" : ""}`}
							onClick={() => setAnalysisType("clause_compare")}
						>
							条款对比
						</button>
					</div>
				</div>

				<button
					className="btn-primary full"
					onClick={handleAnalyze}
					disabled={loading || !selectedDoc}
				>
					{loading ? "审查中…" : "开 始 审 查"}
				</button>
			</div>

			{!result && documents.length === 0 && (
				<div className="empty-state">
					<div className="empty-state-icon">审</div>
					<div className="empty-state-text">尚无文献可审</div>
					<div className="empty-state-hint">请先在「文献典藏」页面上传合同</div>
				</div>
			)}

			{!result && documents.length > 0 && !loading && (
				<div className="empty-state">
					<div className="empty-state-icon">审</div>
					<div className="empty-state-text">请选择文献并开始审查</div>
					<div className="empty-state-hint">系统将自动识别风险条款</div>
				</div>
			)}

		{result && (
			<div className="card result-card">
				<h3 className="card-title">审查结果</h3>
				{result.summary && (
					<div className="analysis-summary">
						<h4>📊 摘要</h4>
						<p>{result.summary}</p>
					</div>
				)}
				{typeof result.confidence === "number" && (
					<div className="confidence-bar">
						<span>可信度</span>
						<div className="confidence-track">
							<div
								className="confidence-fill"
								style={{ width: `${result.confidence * 100}%` }}
							/>
						</div>
						<span className="confidence-value">
							{Math.round(result.confidence * 100)}%
						</span>
					</div>
				)}
				{result.risks && result.risks.length > 0 && (
					<div className="risks-list">
						<h4>⚠ 风险条款</h4>
						{result.risks.map((risk, index) => (
							<div
								key={`${risk.clause}-${index}`}
								className={`risk-item risk-${risk.risk_level}`}
							>
								<div className="risk-header">
									<span className="risk-level-badge">
										{risk.risk_level === "high"
											? "高风险"
											: risk.risk_level === "medium"
												? "中风险"
												: "低风险"}
									</span>
									<span className="risk-clause">{risk.clause}</span>
								</div>
								<div className="risk-description">{risk.description}</div>
								<div className="risk-suggestion">💡 {risk.suggestion}</div>
							</div>
						))}
					</div>
				)}
			</div>
		)}
	</div>
	);
}