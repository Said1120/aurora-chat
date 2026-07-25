import { describe, expect, it, vi } from "vitest";
import {
  buildChatCompletionBody,
  streamChatCompletion,
} from "../src/chat/openaiCompatible";

describe("兼容 OpenAI 的聊天服务", () => {
  it("把 DeepSeek 深度思考映射为 reasoning_effort=max", () => {
    const body = buildChatCompletionBody({
      providerId: "deepseek",
      model: "deepseek-v4-pro",
      temperaturePreset: "balanced",
      reasoningLevel: "deep",
      maxTokens: 1000,
      systemPrompt: "",
      messages: [],
    });

    expect(body).toMatchObject({
      thinking: { type: "enabled" },
      reasoning_effort: "max",
      temperature: 0.7,
    });
  });

  it("不向 Kimi K2.6 发送 temperature，且支持关闭思考", () => {
    const body = buildChatCompletionBody({
      providerId: "kimi",
      model: "kimi-k2.6",
      temperaturePreset: "creative",
      reasoningLevel: "off",
      maxTokens: 1000,
      systemPrompt: "",
      messages: [],
    });

    expect(body).toMatchObject({ thinking: { type: "disabled" } });
    expect(body).not.toHaveProperty("temperature");
  });

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
