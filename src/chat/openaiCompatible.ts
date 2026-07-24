export type ChatRequest = {
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
  messages: Array<{ role: "user" | "assistant"; text: string }>;
};

type FetchLike = typeof fetch;

export async function streamChatCompletion(
  request: ChatRequest,
  onDelta: (delta: string) => void,
  fetcher: FetchLike = fetch,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetcher(`${request.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${request.apiKey}`,
    },
    body: JSON.stringify({
      model: request.model,
      stream: true,
      temperature: request.temperature,
      max_tokens: request.maxTokens,
      messages: [
        ...(request.systemPrompt ? [{ role: "system", content: request.systemPrompt }] : []),
        ...request.messages.map((message) => ({ role: message.role, content: message.text })),
      ],
    }),
  });

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
        const event = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }> };
        const delta = event.choices?.[0]?.delta?.content;
        if (delta) onDelta(delta);
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
