import { describe, expect, it, vi } from "vitest";
import type { BackupV2 } from "../src/domain/models";
import {
  createTransfer,
  createTransferPayload,
  openTransferPayload,
  parseTransferLink,
} from "../src/transfer/client";

const sampleBackup: BackupV2 = {
  version: 2,
  exportedAt: "2026-07-24T10:00:00.000Z",
  roles: [],
  conversations: [],
  messages: [{
    id: "message-1",
    conversationId: "conversation-1",
    role: "user",
    parts: [{ type: "text", text: "私人对话" }],
    createdAt: "2026-07-24T09:00:00.000Z",
    updatedAt: "2026-07-24T09:00:00.000Z",
  }],
  profiles: [{
    id: "deepseek",
    providerId: "deepseek",
    name: "DeepSeek",
    baseUrl: "https://api.deepseek.com",
    apiKey: "sk-secret",
    model: "deepseek-v4-flash",
    temperature: 0.7,
    maxTokens: 2048,
  }],
};

describe("一次性迁移客户端", () => {
  it("上传内容只有密文，而二维码密钥可在本机恢复原备份", async () => {
    const payload = await createTransferPayload(sampleBackup);

    expect(JSON.stringify(payload.upload)).not.toContain("sk-secret");
    expect(JSON.stringify(payload.upload)).not.toContain("私人对话");
    await expect(openTransferPayload(payload.upload, payload.secret)).resolves.toEqual(sampleBackup);
  });

  it("拒绝超过 20MB 的密文上传", async () => {
    const oversized = { version: 1, iv: "iv", ciphertext: "a".repeat(20 * 1024 * 1024) };

    await expect(
      createTransfer("https://transfer.example", "turnstile", oversized, vi.fn()),
    ).rejects.toThrow("迁移包超过 20MB 上限");
  });

  it("从 HTTPS 二维码链接读取 ID 和不上传的片段密钥", () => {
    expect(
      parseTransferLink(
        "https://said1120.github.io/aurora-chat/?transfer=transfer-id#key=secret-key",
      ),
    ).toEqual({ id: "transfer-id", secret: "secret-key" });
  });
});
