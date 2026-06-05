import { useState, useCallback } from "react";
import { knowledge, type SearchResult as ApiSearchResult } from "../lib/api";
type SearchResult = ApiSearchResult;
export default function SearchPage() {
	const [query, setQuery] = useState("");
	const [results, setResults] = useState<SearchResult[]>([]);
	const [loading, setLoading] = useState(false);
	const [searched, setSearched] = useState(false);
	const handleSearch = useCallback(async () => {
		if (!query.trim()) return;
		setLoading(true);
		setSearched(true);
		try {
			const data = await knowledge.search(query.trim(), 20);
			setResults(data.results || []);
		} catch (e) {
			console.error("Search failed:", e);
			setResults([]);
		}
		setLoading(false);
	}, [query]);

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter") handleSearch();
	};

	return (
		<div className="page search-page">
			<div className="page-header">
				<h1>检 索 推 寻</h1>
				<p className="subtitle">基于 FTS5 全文检索的本地知识库</p>
			</div>

			<div className="search-input-wrap">
				<input
					type="text"
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					onKeyDown={handleKeyDown}
					placeholder="输入关键词，检索已上传的文献…"
					autoFocus
				/>
				<button
					className="btn-primary"
					onClick={handleSearch}
					disabled={loading || !query.trim()}
				>
					{loading ? "检索中…" : "检 索"}
				</button>
			</div>

			{loading ? (
				<div className="empty-state">
					<div className="empty-state-icon">·</div>
					<div className="empty-state-text">正在检索…</div>
				</div>
			) : searched && results.length === 0 ? (
				<div className="empty-state">
					<div className="empty-state-icon">查</div>
					<div className="empty-state-text">未找到相关文献</div>
					<div className="empty-state-hint">请尝试其他关键词</div>
				</div>
			) : results.length > 0 ? (
				<>
					<div className="results-meta">
						共检索到 <strong>{results.length}</strong> 条结果
					</div>
					<div className="search-results">
						{results.map((r) => (
							<div key={r.id} className="search-result-card">
								<div className="search-result-title">{r.title}</div>
								<div
									className="search-result-snippet"
									dangerouslySetInnerHTML={{
										__html: r.snippet || "无内容预览",
									}}
								/>
								<div className="search-result-score">
									相关度: {(r.score * 100).toFixed(0)}%
								</div>
							</div>
						))}
					</div>
				</>
			) : (
				<div className="empty-state">
					<div className="empty-state-icon">寻</div>
					<div className="empty-state-text">请输入关键词开始检索</div>
					<div className="empty-state-hint">支持模糊匹配与全文检索</div>
				</div>
			)}
		</div>
	);
}
