/**
 * LLM Provider Integration
 * Routes chat requests to the configured model provider (OpenAI, Anthropic, etc.)
 */

import type { Database } from '../db/client.js';
import { eq } from 'drizzle-orm';
import { modelProviders, modelConfigs } from '../db/schema.js';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
}

interface ChatResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  model: string;
  finishReason: string;
}

interface ProviderConfig {
  provider: string;
  baseUrl: string | null;
  apiKey: string;
  modelId: string;
}

async function resolveProvider(db: Database, modelConfigId: string | null, workspaceId: string): Promise<ProviderConfig | null> {
  // If specific model config provided, use it
  if (modelConfigId) {
    const [config] = await db.select().from(modelConfigs).where(eq(modelConfigs.id, modelConfigId));
    if (!config) return null;

    const [provider] = await db.select().from(modelProviders).where(eq(modelProviders.id, config.providerId));
    if (!provider || !provider.apiKeyEncrypted) return null;

    return {
      provider: provider.provider,
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKeyEncrypted,
      modelId: config.modelId,
    };
  }

  // Otherwise find default model for workspace
  const providers = await db.select().from(modelProviders)
    .where(eq(modelProviders.workspaceId, workspaceId));

  for (const provider of providers) {
    if (!provider.isEnabled || !provider.apiKeyEncrypted) continue;

    const configs = await db.select().from(modelConfigs)
      .where(eq(modelConfigs.providerId, provider.id));

    const defaultConfig = configs.find((c) => c.isDefault) ?? configs[0];
    if (defaultConfig) {
      return {
        provider: provider.provider,
        baseUrl: provider.baseUrl,
        apiKey: provider.apiKeyEncrypted,
        modelId: defaultConfig.modelId,
      };
    }
  }

  return null;
}

function buildOpenAICompatibleRequest(messages: ChatMessage[], modelId: string, options: ChatOptions) {
  return {
    model: modelId,
    messages,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.maxTokens ?? 4096,
    top_p: options.topP,
    stream: false,
  };
}

async function callOpenAI(config: ProviderConfig, messages: ChatMessage[], options: ChatOptions): Promise<ChatResponse> {
  const baseUrl = config.baseUrl ?? 'https://api.openai.com/v1';
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(buildOpenAICompatibleRequest(messages, config.modelId, options)),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI API error ${res.status}: ${err}`);
  }

  const data = await res.json() as {
    choices: { message: { content: string }; finish_reason: string }[];
    usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
    model: string;
  };

  return {
    content: data.choices[0]?.message?.content ?? '',
    usage: data.usage ? {
      promptTokens: data.usage.prompt_tokens,
      completionTokens: data.usage.completion_tokens,
      totalTokens: data.usage.total_tokens,
    } : undefined,
    model: data.model,
    finishReason: data.choices[0]?.finish_reason ?? 'stop',
  };
}

async function callAnthropic(config: ProviderConfig, messages: ChatMessage[], options: ChatOptions): Promise<ChatResponse> {
  const baseUrl = config.baseUrl ?? 'https://api.anthropic.com';

  // Extract system message
  const systemMsg = messages.find((m) => m.role === 'system')?.content;
  const chatMessages = messages.filter((m) => m.role !== 'system').map((m) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }));

  const res = await fetch(`${baseUrl}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: config.modelId,
      max_tokens: options.maxTokens ?? 4096,
      temperature: options.temperature ?? 0.7,
      top_p: options.topP,
      system: systemMsg,
      messages: chatMessages,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${err}`);
  }

  const data = await res.json() as {
    content: { type: string; text: string }[];
    usage: { input_tokens: number; output_tokens: number };
    model: string;
    stop_reason: string;
  };

  const text = data.content.filter((c) => c.type === 'text').map((c) => c.text).join('');

  return {
    content: text,
    usage: data.usage ? {
      promptTokens: data.usage.input_tokens,
      completionTokens: data.usage.output_tokens,
      totalTokens: data.usage.input_tokens + data.usage.output_tokens,
    } : undefined,
    model: data.model,
    finishReason: data.stop_reason ?? 'end_turn',
  };
}

async function callProvider(config: ProviderConfig, messages: ChatMessage[], options: ChatOptions): Promise<ChatResponse> {
  switch (config.provider) {
    case 'anthropic':
      return callAnthropic(config, messages, options);

    case 'openai':
    case 'deepseek':
    case 'qwen':
    case 'volcengine':
    case 'ollama':
    case 'custom':
      // All OpenAI-compatible APIs
      return callOpenAI(config, messages, options);

    case 'google':
      // Google uses OpenAI-compatible format via their /v1beta endpoint
      return callOpenAI({
        ...config,
        baseUrl: config.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta/openai',
      }, messages, options);

    default:
      throw new Error(`Unsupported provider: ${config.provider}`);
  }
}

/**
 * Main entry point: run a chat completion against the configured model.
 */
export async function chatCompletion(
  db: Database,
  workspaceId: string,
  messages: ChatMessage[],
  options: ChatOptions & { modelConfigId?: string | null } = {},
): Promise<ChatResponse> {
  const { modelConfigId, ...chatOptions } = options;

  const provider = await resolveProvider(db, modelConfigId ?? null, workspaceId);
  if (!provider) {
    throw new Error('No model provider configured. Add a model provider in Settings → Models.');
  }

  return callProvider(provider, messages, chatOptions);
}

export type { ChatMessage, ChatOptions, ChatResponse };
