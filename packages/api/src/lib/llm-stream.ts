/**
 * LLM Streaming Provider
 * SSE streaming from OpenAI-compatible and Anthropic APIs.
 */

interface StreamMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface StreamOptions {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
}

interface ProviderConfig {
  provider: string;
  baseUrl: string | null;
  apiKey: string;
  modelId: string;
}

/**
 * Stream from an OpenAI-compatible API.
 * Returns a ReadableStream that yields SSE-formatted chunks.
 */
function streamOpenAI(config: ProviderConfig, messages: StreamMessage[], options: StreamOptions): ReadableStream {
  const baseUrl = config.baseUrl ?? 'https://api.openai.com/v1';

  return new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      try {
        const res = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.apiKey}`,
          },
          body: JSON.stringify({
            model: config.modelId,
            messages,
            temperature: options.temperature ?? 0.7,
            max_tokens: options.maxTokens ?? 4096,
            top_p: options.topP,
            stream: true,
          }),
        });

        if (!res.ok) {
          const err = await res.text();
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', content: `API error ${res.status}: ${err}` })}\n\n`));
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
          return;
        }

        const reader = res.body?.getReader();
        if (!reader) { controller.close(); return; }
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('data: ')) continue;
            const data = trimmed.slice(6);
            if (data === '[DONE]') {
              controller.enqueue(encoder.encode('data: [DONE]\n\n'));
              continue;
            }
            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'content', content })}\n\n`));
              }
            } catch { /* skip unparseable lines */ }
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Stream error';
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', content: msg })}\n\n`));
      }
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });
}

/**
 * Stream from Anthropic Messages API.
 */
function streamAnthropic(config: ProviderConfig, messages: StreamMessage[], options: StreamOptions): ReadableStream {
  const baseUrl = config.baseUrl ?? 'https://api.anthropic.com';

  return new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const systemMsg = messages.find((m) => m.role === 'system')?.content;
      const chatMessages = messages.filter((m) => m.role !== 'system');

      try {
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
            stream: true,
          }),
        });

        if (!res.ok) {
          const err = await res.text();
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', content: `API error ${res.status}: ${err}` })}\n\n`));
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
          return;
        }

        const reader = res.body?.getReader();
        if (!reader) { controller.close(); return; }
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('data: ')) continue;
            const data = trimmed.slice(6);
            try {
              const parsed = JSON.parse(data);
              if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'content', content: parsed.delta.text })}\n\n`));
              }
              if (parsed.type === 'message_stop') {
                controller.enqueue(encoder.encode('data: [DONE]\n\n'));
              }
            } catch { /* skip */ }
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Stream error';
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', content: msg })}\n\n`));
      }
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });
}

/**
 * Create an SSE stream for the given provider config and messages.
 */
export function createChatStream(config: ProviderConfig, messages: StreamMessage[], options: StreamOptions): ReadableStream {
  switch (config.provider) {
    case 'anthropic':
      return streamAnthropic(config, messages, options);
    case 'openai':
    case 'deepseek':
    case 'qwen':
    case 'volcengine':
    case 'ollama':
    case 'custom':
      return streamOpenAI(config, messages, options);
    case 'google':
      return streamOpenAI({
        ...config,
        baseUrl: config.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta/openai',
      }, messages, options);
    default:
      throw new Error(`Unsupported streaming provider: ${config.provider}`);
  }
}
