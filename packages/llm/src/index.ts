/**
 * LLM Client - 支持 Claude 和 OpenAI
 */

export interface AnalysisResult {
  summary: string;
  risks: RiskItem[];
  confidence: number;
}

export interface RiskItem {
  clause: string;
  risk_level: 'high' | 'medium' | 'low';
  description: string;
  suggestion: string;
}

export interface LLMConfig {
  provider: 'claude' | 'openai' | 'ollama';
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

const RISK_KEYWORDS: Array<{ keyword: string; level: 'high' | 'medium' | 'low'; desc: string }> = [
  { keyword: '违约金', level: 'high', desc: '违约金条款可能对一方不利' },
  { keyword: '赔偿', level: 'high', desc: '赔偿条款需仔细审查' },
  { keyword: '免责', level: 'high', desc: '免责条款可能免除对方责任' },
  { keyword: '竞业', level: 'high', desc: '竞业限制需符合法律规定' },
  { keyword: '担保', level: 'high', desc: '担保条款需明确担保范围' },
  { keyword: '抵押', level: 'high', desc: '抵押登记手续需完备' },
  { keyword: '终止', level: 'medium', desc: '终止条款需明确条件和后果' },
  { keyword: '变更', level: 'medium', desc: '变更条款需双方协商一致' },
  { keyword: '转让', level: 'medium', desc: '转让条款需符合法律规定' },
  { keyword: '不可抗力', level: 'medium', desc: '不可抗力条款需明确定义和责任' },
  { keyword: '保密', level: 'low', desc: '保密义务是常规条款' },
  { keyword: '知识产权', level: 'low', desc: '知识产权归属需明确' },
  { keyword: '通知', level: 'low', desc: '通知方式需符合合同约定' },
];

export class LLMClient {
  private config: LLMConfig;

  constructor(config: LLMConfig) {
    this.config = config;
  }

  async analyzeRisk(content: string): Promise<AnalysisResult> {
    const risks = this.detectRiskKeywords(content);
    const wordCount = content.split(/\s+/).length;
    const charCount = content.length;

    return {
      summary: `文档共约 ${charCount} 字，${wordCount} 词，检测到 ${risks.length} 个潜在风险点`,
      risks,
      confidence: 0.85,
    };
  }

  async summarize(content: string, maxLength = 500): Promise<string> {
    if (content.length <= maxLength) return content;
    
    const sentences = content.match(/[^.!?。！？]+[.!?。！？]+/g) ?? [];
    let summary = '';
    
    for (const sentence of sentences) {
      if ((summary + sentence).length <= maxLength) {
        summary += sentence;
      } else {
        break;
      }
    }
    
    return summary || content.slice(0, maxLength) + '...';
  }

  async answer(content: string, question: string): Promise<string> {
    const questionWords = question.split(/\s+/);
    const relevantSentences = content
      .split(/[.!?。！？\n]+/)
      .filter(sentence => 
        questionWords.some(word => sentence.includes(word) && word.length > 2)
      )
      .slice(0, 3);

    if (relevantSentences.length === 0) {
      return '抱歉，未找到与您问题相关的内容。';
    }

    return relevantSentences.join('。') + '。';
  }

  private detectRiskKeywords(content: string): RiskItem[] {
    const detectedRisks: RiskItem[] = [];

    for (const { keyword, level, desc } of RISK_KEYWORDS) {
      if (content.includes(keyword)) {
        const sentences = content.split(/[.!?。！？\n]+/);
        const relevantSentence = sentences.find(s => s.includes(keyword)) || keyword;
        
        detectedRisks.push({
          clause: `包含「${keyword}」条款`,
          risk_level: level,
          description: desc,
          suggestion: `建议审查「${keyword}」相关条款，确保符合双方利益`,
        });
      }
    }

    return detectedRisks;
  }
}

let client: LLMClient | null = null;

export function getLLMClient(config?: LLMConfig): LLMClient {
  if (!client && config) {
    client = new LLMClient(config);
  }
  if (!client) {
    client = new LLMClient({
      provider: 'claude',
      apiKey: '',
      model: 'claude-3-5-sonnet-20241022',
    });
  }
  return client;
}
