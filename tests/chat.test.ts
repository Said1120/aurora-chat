import { describe, expect, it, vi } from "vitest";
import { streamChatCompletion } from "../src/chat/openaiCompatible";

describe("兼容 OpenAI 的聊天服务", () => {
  it("将 DeepSeek 的流式文本逐段交给界面", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        "data: {\"choices\":[{\"delta\":{\"content\":\"你好\"}}]}\n\n" +
          "data: {\"choices\":[{\"delta\":{\"content\":\"世界\"}}]}\n\n" +
          "data: [DONE]\n\n",
      ),
    );
    const received: string[] = [];

    await streamChatCompletion(
      {
        baseUrl: "https://api.deepseek.com",
        apiKey: "test-key",
        model: "deepseek-chat",
        temperature: 0.7,
        maxTokens: 1000,
        systemPrompt: "你是助手",
        messages: [{ role: "user", text: "你好" }],
      },
      (delta) => received.push(delta),
      fetcher,
    );

    expect(received.join("")).toBe("你好世界");
    expect(fetcher).toHaveBeenCalledWith(
      "https://api.deepseek.com/chat/completions",
      expect.objectContaining({ method: "POST" }),
    );
    expect(JSON.parse(fetcher.mock.calls[0]?.[1]?.body as string)).toMatchObject({
      model: "deepseek-chat",
      stream: true,
      messages: [
        { role: "system", content: "你是助手" },
        { role: "user", content: "你好" },
      ],
    });
  });
});
