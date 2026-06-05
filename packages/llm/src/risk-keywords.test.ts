import { describe, expect, it } from "vitest";
import { LLMClient, type RiskKeyword } from "./index.js";

describe("LLMClient.detectRiskKeywords", () => {
	const keywords: RiskKeyword[] = [
		{ keyword: "违约金", level: "high", desc: "违约金条款需明确比例" },
		{ keyword: "保密", level: "low", desc: "保密义务" },
	];

	it("detects single occurrence", () => {
		const client = new LLMClient({
			provider: "siliconflow",
			apiKey: "test-key",
			chatModel: "test-model",
		});
		const text = "本合同约定，违约方应支付违约金。";
		const risks = client.detectRiskKeywords(text, keywords);
		expect(risks).toHaveLength(1);
		expect(risks[0]?.keyword).toBe("违约金");
		expect(risks[0]?.risk_level).toBe("high");
		expect(risks[0]?.offset).toBeGreaterThan(0);
	});

	it("detects multiple occurrences of same keyword", () => {
		const client = new LLMClient({
			provider: "siliconflow",
			apiKey: "test-key",
			chatModel: "test-model",
		});
		const text = "第一笔违约金。第二笔违约金。";
		const risks = client.detectRiskKeywords(text, keywords);
		expect(risks).toHaveLength(2);
	});

	it("returns empty when no match", () => {
		const client = new LLMClient({
			provider: "siliconflow",
			apiKey: "test-key",
			chatModel: "test-model",
		});
		const risks = client.detectRiskKeywords("这是一个普通的合同", keywords);
		expect(risks).toEqual([]);
	});

	it("returns empty when no keywords", () => {
		const client = new LLMClient({
			provider: "siliconflow",
			apiKey: "test-key",
			chatModel: "test-model",
		});
		const risks = client.detectRiskKeywords("违约金条款", []);
		expect(risks).toEqual([]);
	});

	it("throws on missing api key", () => {
		expect(
			() =>
				new LLMClient({
					provider: "siliconflow",
					apiKey: "",
					chatModel: "m",
				}),
		).toThrow(/API key/);
	});
});
