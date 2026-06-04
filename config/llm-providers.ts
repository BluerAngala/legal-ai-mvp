/**
 * LegalAI MVP - LLM Provider Configuration
 * 支持多种 LLM API: OpenAI, Claude, SiliconFlow, DeepSeek, MiniMax
 * 默认使用硅基流动的 MiniMaxAI/MiniMax-M2.5 模型
 */

export interface LLMConfig {
  provider: 'openai' | 'anthropic' | 'siliconflow' | 'deepseek' | 'minimax';
  apiKey: string;
  baseUrl: string;
  model: string;
}

export const llmProviders = {
  // 硅基流动 SiliconFlow (推荐)
  siliconflow: {
    provider: 'siliconflow' as const,
    baseUrl: 'https://api.siliconflow.cn/v1',
    models: {
      // 默认使用 MiniMax
      chat: 'MiniMaxAI/MiniMax-M2.5',
      // 也支持 DeepSeek
      chatDeepseek: 'deepseek-ai/DeepSeek-V3',
      // Embedding 模型
      embedding: 'BAAI/bge-m3',
    },
  },

  // DeepSeek
  deepseek: {
    provider: 'deepseek' as const,
    baseUrl: 'https://api.deepseek.com/v1',
    models: {
      chat: 'deepseek-chat',
      embedding: 'text-embedding-3',
    },
  },

  // MiniMax
  minimax: {
    provider: 'minimax' as const,
    baseUrl: 'https://api.minimax.chat/v1',
    models: {
      chat: 'abab6.5s-chat',
      embedding: 'embo-01',
    },
  },

  // OpenAI (官方)
  openai: {
    provider: 'openai' as const,
    baseUrl: 'https://api.openai.com/v1',
    models: {
      chat: 'gpt-4o',
      embedding: 'text-embedding-3-small',
    },
  },

  // Anthropic (Claude)
  anthropic: {
    provider: 'anthropic' as const,
    baseUrl: 'https://api.anthropic.com/v1',
    models: {
      chat: 'claude-3-5-sonnet-20241022',
    },
  },
};

// 获取当前配置的 provider
export function getLLMConfig(): LLMConfig | null {
  const provider = process.env.LLM_PROVIDER || 'siliconflow';
  const apiKey = process.env.LLM_API_KEY;

  if (!apiKey) return null;

  const configs: Record<string, LLMConfig> = {
    siliconflow: {
      provider: 'siliconflow',
      apiKey,
      baseUrl: llmProviders.siliconflow.baseUrl,
      model: llmProviders.siliconflow.models.chat, // MiniMaxAI/MiniMax-M2.5
    },
    deepseek: {
      provider: 'deepseek',
      apiKey,
      baseUrl: llmProviders.deepseek.baseUrl,
      model: llmProviders.deepseek.models.chat,
    },
    minimax: {
      provider: 'minimax',
      apiKey,
      baseUrl: llmProviders.minimax.baseUrl,
      model: llmProviders.minimax.models.chat,
    },
    openai: {
      provider: 'openai',
      apiKey,
      baseUrl: llmProviders.openai.baseUrl,
      model: llmProviders.openai.models.chat,
    },
  };

  return configs[provider] || null;
}

// 获取 embedding 配置
export function getEmbeddingConfig() {
  const provider = process.env.LLM_PROVIDER || 'siliconflow';
  const apiKey = process.env.LLM_API_KEY;

  if (!apiKey) return null;

  switch (provider) {
    case 'siliconflow':
      return {
        provider: 'siliconflow',
        apiKey,
        baseUrl: llmProviders.siliconflow.baseUrl,
        model: llmProviders.siliconflow.models.embedding,
      };
    case 'deepseek':
      return {
        provider: 'deepseek',
        apiKey,
        baseUrl: llmProviders.deepseek.baseUrl,
        model: llmProviders.deepseek.models.embedding,
      };
    default:
      return {
        provider: 'openai',
        apiKey,
        baseUrl: llmProviders.openai.baseUrl,
        model: llmProviders.openai.models.embedding,
      };
  }
}
