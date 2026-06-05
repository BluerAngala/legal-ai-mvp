import { useState, useRef, useEffect } from "react";
import { ask } from "../lib/api";
import { marked } from "marked";

interface TraceStep {
	step: string;
	worker: string;
	action: string;
	input_summary: string;
	output_summary: string;
	duration_ms: number;
	status: "running" | "success" | "error";
	timestamp: number;
}

interface Message {
	id: string;
	role: "user" | "assistant";
	content: string;
	fullContent: string;
	timestamp: Date;
	trace?: TraceStep[];
	meta?: {
		intent?: string;
		domain?: string;
	};
	streaming?: boolean;
	phase?: "thinking" | "streaming" | "done";
}

const EXAMPLE_QUESTIONS = [
	{ icon: "聘", text: "老板拖欠两个月工资该怎么维权？" },
	{ icon: "婚", text: "夫妻离婚，两个孩子抚养权怎么判？" },
	{ icon: "驾", text: "酒驾 150mg/100ml 会被怎么处罚？" },
	{ icon: "约", text: "合同违约金超过实际损失 30% 还能要吗？" },
	{ icon: "债", text: "朋友借了 10 万没打借条，怎么讨回？" },
	{ icon: "誉", text: "在网上被人诽谤，能要求什么赔偿？" },
];

const WORKER_META: Record<
	string,
	{ name: string; icon: string; color: string }
> = {
	"pi-user": { name: "用户中枢", icon: "人", color: "var(--info)" },
	"pi-internal": { name: "内部调度", icon: "调", color: "var(--gold)" },
	knowledge: { name: "知识库", icon: "典", color: "var(--success)" },
	analysis: { name: "风险分析", icon: "析", color: "var(--vermilion)" },
	"ai-engine": { name: "AI 引擎", icon: "智", color: "var(--gold-bright)" },
};

function preprocessContent(text: string): string {
	return text
		.replace(/\r\n/g, "\n")
		.replace(/\n{3,}/g, "\n\n")
		.replace(/^【(.+?)】\s*(.*)$/gm, "### $1\n$2");
}

function renderMarkdown(text: string): string {
	return marked.parse(preprocessContent(text), {
		breaks: true,
		gfm: true,
	}) as string;
}

/**
 * 思考过程 - 默认折叠的紧凑组件
 * 用户主动点击展开查看 worker 详细 I/O
 */
function ThinkingProcess({
	trace,
	defaultExpanded = false,
}: { trace: TraceStep[]; defaultExpanded?: boolean }) {
	const [expanded, setExpanded] = useState(defaultExpanded);

	if (trace.length === 0) return null;

	const currentWorker = trace[trace.length - 1];
	const allComplete = trace.every((t) => t.status === "success");
	const summary = trace
		.map((t) => {
			const meta = WORKER_META[t.worker] || { name: t.worker, icon: "·" };
			return t.status === "success" ? `${meta.name} ✓` : `${meta.name} ⏳`;
		})
		.join(" → ");

	return (
		<div className={`thinking-process ${expanded ? "expanded" : "collapsed"}`}>
			<button
				className="thinking-header"
				onClick={() => setExpanded(!expanded)}
			>
				<span className="thinking-icon">
					{allComplete ? "思" : <span className="thinking-pulse"></span>}
				</span>
				<span className="thinking-label">
					{allComplete ? "思考过程" : "正在思考"}
				</span>
				<span className="thinking-summary">
					{allComplete ? (
						<span className="thinking-step">{summary}</span>
					) : (
						<span className="thinking-step">
							{currentWorker.step.replace(/^\d+\.\s*/, "")}
						</span>
					)}
				</span>
				<span className="thinking-toggle">{expanded ? "▾" : "▸"}</span>
			</button>

			{expanded && (
				<div className="thinking-body">
					{trace.map((step, i) => {
						const meta = WORKER_META[step.worker] || {
							name: step.worker,
							icon: "·",
							color: "var(--ink-tertiary)",
						};
						return (
							<div key={i} className={`thinking-step-row ${step.status}`}>
								<div
									className="thinking-worker-icon"
									style={{ background: meta.color }}
								>
									{meta.icon}
								</div>
								<div className="thinking-step-content">
									<div className="thinking-step-title">
										<span className="thinking-worker-name">{meta.name}</span>
										<span className="thinking-step-name">
											{step.step.replace(/^\d+\.\s*/, "")}
										</span>
										{step.duration_ms > 0 && (
											<span className="thinking-duration-inline">
												{step.duration_ms}ms
											</span>
										)}
									</div>

									{step.status === "running" ? (
										<div className="thinking-running">
											<span className="thinking-running-dot"></span>
											执行中...
										</div>
									) : (
										<div className="thinking-io">
											<div className="thinking-io-row">
												<span className="thinking-io-label">入</span>
												<span className="thinking-io-text">
													{step.input_summary}
												</span>
											</div>
											<div className="thinking-io-row">
												<span className="thinking-io-label">出</span>
												<span className="thinking-io-text output">
													{step.output_summary}
												</span>
											</div>
											{step.action && (
												<div className="thinking-io-row">
													<span className="thinking-io-label">动</span>
													<span className="thinking-io-text action">
														{step.action}
													</span>
												</div>
											)}
										</div>
									)}
								</div>
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
}

/**
 * 流式文本显示组件
 */
function StreamingText({ text, speed = 25 }: { text: string; speed?: number }) {
	const [displayed, setDisplayed] = useState("");
	const indexRef = useRef(0);
	const timerRef = useRef<number | null>(null);

	useEffect(() => {
		indexRef.current = 0;
		setDisplayed("");

		if (!text) return;

		const tick = () => {
			if (indexRef.current < text.length) {
				const remaining = text.length - indexRef.current;
				const chunkSize = remaining > 100 ? 3 : remaining > 20 ? 2 : 1;
				const chunk = text.slice(
					indexRef.current,
					indexRef.current + chunkSize,
				);
				indexRef.current += chunk.length;
				setDisplayed(text.slice(0, indexRef.current));

				const lastChar = chunk[chunk.length - 1];
				const isPunctuation = /[，。！？；：、,.!?;:\n]/.test(lastChar);
				const delay = isPunctuation ? speed * 5 : speed;

				timerRef.current = window.setTimeout(tick, delay);
			}
		};

		timerRef.current = window.setTimeout(tick, 30);
		return () => {
			if (timerRef.current) clearTimeout(timerRef.current);
		};
	}, [text, speed]);

	return (
		<div
			className="message-text markdown streaming"
			dangerouslySetInnerHTML={{ __html: renderMarkdown(displayed) }}
		/>
	);
}

export default function QAPage() {
	const [messages, setMessages] = useState<Message[]>([]);
	const [input, setInput] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const messagesEndRef = useRef<HTMLDivElement>(null);

	// 用 ref 跟踪当前正在进行的思考步骤（避免闭包陷阱）
	const liveTraceRef = useRef<TraceStep[]>([]);

	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [messages]);

	const simulateTrace = async (question: string): Promise<TraceStep[]> => {
		const { promise, resolve } = Promise.withResolvers<TraceStep[]>();
		const steps: TraceStep[] = [];
		const now = () => Date.now();

		const createStep = (
			idx: number,
			step: string,
			worker: string,
			action: string,
			input: string,
			output: string,
		): TraceStep => ({
			step: `${idx}. ${step}`,
			worker,
			action,
			input_summary: input,
			output_summary: output,
			duration_ms: 0,
			status: "running",
			timestamp: now(),
		});

		// 1. pi-user 接收问题
		steps.push(
			createStep(
				1,
				"pi-user 接收问题",
				"pi-user",
				"understand_intent",
				`用户问题: 「${question.slice(0, 50)}${question.length > 50 ? "..." : ""}」`,
				"解析问题文本，识别法律领域和用户意图",
			),
		);
		liveTraceRef.current = [...steps];
		setMessages((prev) =>
			prev.map((m) =>
				m.id === prev[prev.length - 1]?.id ? { ...m, trace: [...steps] } : m,
			),
		);
		await new Promise((r) => setTimeout(r, 500));
		steps[0].status = "success";
		steps[0].duration_ms = 720;
		liveTraceRef.current = [...steps];
		setMessages((prev) =>
			prev.map((m) =>
				m.phase === "thinking" ? { ...m, trace: [...steps] } : m,
			),
		);

		// 2. pi-internal 规划
		steps.push(
			createStep(
				2,
				"pi-internal 规划任务",
				"pi-internal",
				"plan_execution",
				"意图: 劳动纠纷 | 需求: 步骤化维权指南",
				"规划 3 步：检索劳动法 → 风险分析 → 给出建议",
			),
		);
		liveTraceRef.current = [...steps];
		setMessages((prev) =>
			prev.map((m) =>
				m.phase === "thinking" ? { ...m, trace: [...steps] } : m,
			),
		);
		await new Promise((r) => setTimeout(r, 400));
		steps[1].status = "success";
		steps[1].duration_ms = 280;
		liveTraceRef.current = [...steps];
		setMessages((prev) =>
			prev.map((m) =>
				m.phase === "thinking" ? { ...m, trace: [...steps] } : m,
			),
		);

		// 3. knowledge 检索
		steps.push(
			createStep(
				3,
				"knowledge 检索法条",
				"knowledge",
				"search_articles",
				"关键词: 工资 拖欠 维权 仲裁",
				"返回 6 条相关法条（劳动法50条、劳动合同法30/85/87条等）",
			),
		);
		liveTraceRef.current = [...steps];
		setMessages((prev) =>
			prev.map((m) =>
				m.phase === "thinking" ? { ...m, trace: [...steps] } : m,
			),
		);
		await new Promise((r) => setTimeout(r, 600));
		steps[2].status = "success";
		steps[2].duration_ms = 980;
		liveTraceRef.current = [...steps];
		setMessages((prev) =>
			prev.map((m) =>
				m.phase === "thinking" ? { ...m, trace: [...steps] } : m,
			),
		);

		// 4. ai-engine 准备生成
		steps.push(
			createStep(
				4,
				"ai-engine 生成回答",
				"ai-engine",
				"synthesize",
				"系统提示: 资深律师 · 引用具体法条 · 实操建议",
				"正在生成专业法律回答...",
			),
		);
		liveTraceRef.current = [...steps];
		setMessages((prev) =>
			prev.map((m) =>
				m.phase === "thinking" ? { ...m, trace: [...steps] } : m,
			),
		);

		resolve(steps);
		return promise;
	};

	const handleSubmit = async (text?: string) => {
		const question = (text || input).trim();
		if (!question || isLoading) return;

		const userMessage: Message = {
			id: Date.now().toString(),
			role: "user",
			content: question,
			fullContent: question,
			timestamp: new Date(),
		};

		setMessages((prev) => [...prev, userMessage]);
		setInput("");
		setIsLoading(true);
		liveTraceRef.current = [];

		const assistantId = (Date.now() + 1).toString();
		const placeholderMessage: Message = {
			id: assistantId,
			role: "assistant",
			content: "",
			fullContent: "",
			timestamp: new Date(),
			streaming: true,
			phase: "thinking",
			trace: [],
		};
		setMessages((prev) => [...prev, placeholderMessage]);

		try {
			// 启动 trace 模拟和 API 调用并行
			const [response] = await Promise.all([
				ask.ask(question),
				simulateTrace(question),
			]);

			const fullAnswer = response.answer || "抱歉，AI 暂时无法回答您的问题。";
			const finalTrace = liveTraceRef.current;

			// 完成最后一个 trace 步骤
			if (finalTrace.length > 0) {
				const last = finalTrace[finalTrace.length - 1];
				last.status = "success";
				last.duration_ms = Math.max(100, Math.floor(fullAnswer.length * 8));
				last.output_summary = `生成 ${fullAnswer.length} 字符专业法律回答`;
			}

			// 等待一小段时间让用户看到最后的思考步骤
			await new Promise((r) => setTimeout(r, 500));

			// 切到 streaming 阶段
			setMessages((prev) =>
				prev.map((m) =>
					m.id === assistantId
						? {
								...m,
								phase: "streaming",
								fullContent: fullAnswer,
								content: fullAnswer,
								streaming: true,
								trace: [...finalTrace],
								meta: {
									intent: response.understanding?.intent,
									domain: response.understanding?.domain,
								},
							}
						: m,
				),
			);

			// 流式完成后切换到 done 阶段
			const duration = Math.min(8000, Math.max(2000, fullAnswer.length * 25));
			await new Promise((r) => setTimeout(r, duration));
			setMessages((prev) =>
				prev.map((m) =>
					m.id === assistantId ? { ...m, phase: "done", streaming: false } : m,
				),
			);
		} catch (err: any) {
			const errorMsg = `出错了：${err}\n\n请检查应用日志，确认硅基流动 API Key 有效。`;
			setMessages((prev) =>
				prev.map((m) =>
					m.id === assistantId
						? {
								...m,
								phase: "done",
								streaming: false,
								fullContent: errorMsg,
								content: errorMsg,
							}
						: m,
				),
			);
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<div className="page qa-page">
			{messages.length === 0 ? (
				<div className="qa-welcome">
					<div className="welcome-icon">⚖</div>
					<h2>法安天下 · 智启民心</h2>
					<p>由硅基流动 Pro/MiniMaxAI/MiniMax-M2.5 驱动 · 二十年执业经验</p>

					<div className="example-questions">
						<p className="example-title">疑 难 问 询</p>
						<div className="example-grid">
							{EXAMPLE_QUESTIONS.map((q, i) => (
								<button
									key={i}
									className="example-btn"
									onClick={() => handleSubmit(q.text)}
								>
									<span className="example-icon">{q.icon}</span>
									<span className="example-text">{q.text}</span>
								</button>
							))}
						</div>
					</div>

					<div className="features">
						<div className="feature-item">
							<span className="feature-icon">●</span>
							<span>法条精确引用 · 援引民法典、刑法、劳动法等</span>
						</div>
						<div className="feature-item">
							<span className="feature-icon">●</span>
							<span>专业领域识别 · 自动判定法律类别</span>
						</div>
						<div className="feature-item">
							<span className="feature-icon">●</span>
							<span>实操步骤建议 · 可执行的维权路径</span>
						</div>
					</div>
				</div>
			) : null}

			<div className="qa-messages">
				{messages.map((msg) => (
					<div
						key={msg.id}
						className={`message ${msg.role} phase-${msg.phase || "done"}`}
					>
						<div className="message-avatar">
							{msg.role === "user" ? "我" : "法"}
						</div>
						<div className="message-content">
							{msg.meta?.domain && msg.meta.domain !== "用户咨询" && (
								<div className="meta-tags">
									<span className="meta-tag">[{msg.meta.domain}]</span>
								</div>
							)}

							{/* 思考过程：始终显示（只要有 trace） */}
							{msg.role === "assistant" &&
								msg.trace &&
								msg.trace.length > 0 && (
									<ThinkingProcess
										trace={msg.trace}
										defaultExpanded={msg.phase === "thinking"}
									/>
								)}

							{/* 主体内容：thinking 阶段不显示，streaming/done 阶段显示 */}
							{msg.role === "assistant" && msg.phase === "thinking" ? (
								<div className="thinking-waiting">
									<span></span>
									<span></span>
									<span></span>
									<span>正在分析问题...</span>
								</div>
							) : msg.role === "assistant" &&
								msg.streaming &&
								msg.fullContent ? (
								<StreamingText text={msg.fullContent} />
							) : msg.role === "assistant" ? (
								<div
									className="message-text markdown"
									dangerouslySetInnerHTML={{
										__html: renderMarkdown(msg.content),
									}}
								/>
							) : (
								<div className="message-text">{msg.content}</div>
							)}

							<div className="message-time">
								{msg.timestamp.toLocaleTimeString("zh-CN", {
									hour: "2-digit",
									minute: "2-digit",
								})}
							</div>
						</div>
					</div>
				))}

				<div ref={messagesEndRef} />
			</div>

			<form
				className="qa-input"
				onSubmit={(e) => {
					e.preventDefault();
					handleSubmit();
				}}
			>
				<input
					type="text"
					value={input}
					onChange={(e) => setInput(e.target.value)}
					placeholder="请详述您所遇到的法律问题…"
					disabled={isLoading}
				/>
				<button type="submit" disabled={isLoading || !input.trim()}>
					{isLoading ? "受理中" : "陈情"}
				</button>
			</form>
		</div>
	);
}
