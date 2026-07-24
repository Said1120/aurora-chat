import {
  getModelDefinition,
  temperatureForPreset,
  type ProviderId,
  type ReasoningLevel,
  type TemperaturePreset,
} from "../providers/catalog";

export type ChatRequest = {
  baseUrl?: string;
  apiKey?: string;
  providerId?: ProviderId;
  model: string;
  temperature?: number;
  temperaturePreset?: TemperaturePreset;
  reasoningLevel?: ReasoningLevel;
  maxTokens: number;
  systemPrompt: string;
  messages: Array<{ role: "user" | "assistant"; text: string }>;
};

type FetchLike = typeof fetch;

const messagePayload = (request: ChatRequest) => [
  ...(request.systemPrompt
    ? [{ role: "system", content: request.systemPrompt }]
    : []),
  ...request.messages.map((message) => ({
    role: message.role,
    content: message.text,
  })),
];

function applyReasoning(
  body: Record<string, unknown>,
  providerId: ProviderId,
  reasoningLevel: ReasoningLevel,
): void {
  const enabled = reasoningLevel !== "off";

  if (providerId === "deepseek") {
    body.thinking = { type: enabled ? "enabled" : "disabled" };
    if (enabled) body.reasoning_effort = reasoningLevel === "deep" ? "max" : "high";
    return;
  }

  if (providerId === "kimi" || providerId === "mimo") {
    body.thinking = { type: enabled ? "enabled" : "disabled" };
    return;
  }

  if (providerId === "siliconflow" || providerId === "qwen") {
    body.enable_thinking = enabled;
    if (enabled) body.thinking_budget = reasoningLevel === "deep" ? 16_384 : 4_096;
    return;
  }

  if (providerId === "zhipu") {
    body.thinking = { type: enabled ? "enabled" : "disabled" };
    if (enabled) body.reasoning_effort = reasoningLevel === "deep" ? "max" : "high";
  }
}

export function buildChatCompletionBody(
  request: ChatRequest,
): Record<string, unknown> {
  const providerId = request.providerId ?? "deepseek";
  const modelDefinition = getModelDefinition(providerId, request.model);
  const body: Record<string, unknown> = {
    model: request.model,
    stream: true,
    max_tokens: request.maxTokens,
    messages: messagePayload(request),
  };

  if (modelDefinition?.temperatureMode !== "fixed") {
    body.temperature = request.temperaturePreset
      ? temperatureForPreset(request.temperaturePreset)
      : (request.temperature ?? 0.7);
  }

  applyReasoning(body, providerId, request.reasoningLevel ?? "standard");
  return body;
}

export async function streamChatCompletion(
  request: ChatRequest,
  onDelta: (delta: string) => void,
  fetcher: FetchLike = fetch,
  signal?: AbortSignal,
  onReasoningDelta?: (delta: string) => void,
): Promise<void> {
  if (!request.baseUrl || !request.apiKey) {
    throw new Error("请先填写 API Key 和服务地址");
  }

  const response = await fetcher(
    `${request.baseUrl.replace(/\/$/, "")}/chat/completions`,
    {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${request.apiKey}`,
      },
      body: JSON.stringify(buildChatCompletionBody(request)),
    },
  );

  if (!response.ok) {
    throw new Error(`服务请求失败（${response.status}）`);
  }
  if (!response.body) {
    throw new Error("服务没有返回可读取的回答");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const consume = (chunk: string) => {
    for (const line of chunk.split("\n")) {
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      try {
        const event = JSON.parse(data) as {
          choices?: Array<{
            delta?: { content?: string; reasoning_content?: string };
          }>;
        };
        const delta = event.choices?.[0]?.delta;
        if (delta?.reasoning_content) onReasoningDelta?.(delta.reasoning_content);
        if (delta?.content) onDelta(delta.content);
      } catch {
        // 忽略非标准的 keep-alive 数据包，继续读取下一包。
      }
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const boundary = buffer.lastIndexOf("\n\n");
    if (boundary >= 0) {
      consume(buffer.slice(0, boundary));
      buffer = buffer.slice(boundary + 2);
    }
    if (done) break;
  }
  if (buffer.trim()) consume(buffer);
}
