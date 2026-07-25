import { describe, expect, it } from "vitest";
import type { BackupV2 } from "../src/domain/models";
import {
  decryptBackup,
  encryptBackup,
  isEncryptedBackup,
} from "../src/backup/encryptedBackup";

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
    temperaturePreset: "balanced",
    reasoningLevel: "standard",
    maxTokens: 2048,
    updatedAt: "2026-07-24T09:00:00.000Z",
  }],
};

describe("加密备份", () => {
  it("加密包不暴露 API Key 或消息原文", async () => {
    const encrypted = await encryptBackup(sampleBackup, "correct horse battery staple");

    expect(isEncryptedBackup(encrypted)).toBe(true);
    expect(JSON.stringify(encrypted)).not.toContain("sk-secret");
    expect(JSON.stringify(encrypted)).not.toContain("私人对话");
  });

  it("只有正确密码可以恢复完整备份", async () => {
    const encrypted = await encryptBackup(sampleBackup, "password");

    await expect(decryptBackup(encrypted, "wrong")).rejects.toThrow(
      "备份密码不正确或文件已损坏",
    );
    await expect(decryptBackup(encrypted, "password")).resolves.toEqual(sampleBackup);
  });
});
