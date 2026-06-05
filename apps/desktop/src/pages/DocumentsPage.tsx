import { useState, useRef, useCallback, useEffect } from "react";
import { upload, type UploadItem } from "../lib/api";
type DocumentInfo = UploadItem;
export default function DocumentsPage() {
	const [documents, setDocuments] = useState<DocumentInfo[]>([]);
	const [loading, setLoading] = useState(false);
	const [uploading, setUploading] = useState(false);
	const [selectedDoc, setSelectedDoc] = useState<DocumentInfo | null>(null);
	const [dragover, setDragover] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const loadDocuments = useCallback(async () => {
		setLoading(true);
		try {
			const docs = await upload.list(50, 0);
			setDocuments(docs || []);
		} catch (e) {
			console.error("Failed to load documents:", e);
			setDocuments([]);
		}
		setLoading(false);
	}, []);
	useEffect(() => {
		loadDocuments();
	}, [loadDocuments]);
	const handleUpload = async (files: FileList | null) => {
		if (!files || files.length === 0) return;
		setUploading(true);
		try {
			for (let i = 0; i < files.length; i++) {
				const file = files[i];
				const formData = new FormData();
				formData.append("file", file);
				try {
					await upload.create(formData);
				} catch (err) {
					console.error("Upload failed:", err);
				}
			}
			await loadDocuments();
		} finally {
			setUploading(false);
		}
	};
	const handleDelete = async (id: string) => {
		if (!confirm("确认删除此文档？")) return;
		try {
			await upload.delete(id);
			setDocuments((prev) => prev.filter((d) => d.id !== id));
			if (selectedDoc?.id === id) setSelectedDoc(null);
		} catch (e) {
			console.error("Delete failed:", e);
		}
	};

	return (
		<div className="page documents-page">
			<div className="page-header">
				<h1>文 献 典 藏</h1>
				<p className="subtitle">管理您的法律文书与参考材料</p>
			</div>

			<div
				className={`drop-zone ${dragover ? "dragover" : ""}`}
				onClick={() => fileInputRef.current?.click()}
				onDragOver={(e) => {
					e.preventDefault();
					setDragover(true);
				}}
				onDragLeave={() => setDragover(false)}
				onDrop={(e) => {
					e.preventDefault();
					setDragover(false);
					handleUpload(e.dataTransfer.files);
				}}
			>
				<div className="drop-zone-title">
					{uploading ? "上传中…" : "拖 拽 上 传 ·  或  点 击 选 择"}
				</div>
				<div className="drop-zone-hint">支持 PDF / DOCX / TXT 等法律文书</div>
				<input
					ref={fileInputRef}
					type="file"
					multiple
					accept=".pdf,.docx,.doc,.txt"
					style={{ display: "none" }}
					onChange={(e) => handleUpload(e.target.files)}
				/>
			</div>

			<div className="documents-list">
				{loading ? (
					<div className="empty-state">
						<div className="empty-state-icon">·</div>
						<div className="empty-state-text">载入中…</div>
					</div>
				) : documents.length === 0 ? (
					<div className="empty-state">
						<div className="empty-state-icon">册</div>
						<div className="empty-state-text">暂无文档</div>
						<div className="empty-state-hint">请上传您的第一份法律文书</div>
					</div>
				) : (
					documents.map((doc) => (
						<div
							key={doc.id}
							className={`doc-card ${selectedDoc?.id === doc.id ? "selected" : ""}`}
							onClick={() => setSelectedDoc(doc)}
						>
							<div className="doc-title">{doc.filename}</div>
							<div className="doc-meta">
								{doc.mime_type} · {new Date(doc.created_at).toLocaleDateString("zh-CN")}
							</div>
							<div className="doc-actions">
								<button
									className="doc-action-btn"
									onClick={(e) => {
										e.stopPropagation();
										handleDelete(doc.id);
									}}
								>
									删除
								</button>
							</div>
						</div>
					))
				)}
			</div>

			{selectedDoc && (
				<div className="doc-viewer" onClick={() => setSelectedDoc(null)}>
					<div
						className="doc-viewer-content"
						onClick={(e) => e.stopPropagation()}
					>
						<div className="doc-viewer-header">
							<h2>{selectedDoc.filename}</h2>
							<button
								className="doc-viewer-close"
								onClick={() => setSelectedDoc(null)}
							>
								×
							</button>
						</div>
						<div className="doc-viewer-body">
							<div className="doc-meta-info">
								<p>类型: {selectedDoc.mime_type}</p>
								<p>大小: {(selectedDoc.size / 1024).toFixed(1)} KB</p>
								<p>状态: {selectedDoc.status}</p>
								<p>创建: {new Date(selectedDoc.created_at).toLocaleString("zh-CN")}</p>
							</div>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
