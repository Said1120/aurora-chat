import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import {
  createAppDatabase,
  exportDatabase,
  mergeBackup,
  migrateProfiles,
  seedDatabase,
} from "../src/data/database";
import type { BackupV2 } from "../src/domain/models";

describe("本机数据保存", () => {
  const databases: ReturnType<typeof createAppDatabase>[] = [];

  afterEach(async () => {
    await Promise.all(databases.splice(0).map((database) => database.delete()));
  });

  it("首次使用会创建一个角色和一段新对话", async () => {
    const database = createAppDatabase(`test-${crypto.randomUUID()}`);
    databases.push(database);

    await seedDatabase(database);

    expect(await database.roles.count()).toBe(1);
    expect(await database.conversations.count()).toBe(1);
  });

  it("导出的备份包含本机的角色与对话", async () => {
    const database = createAppDatabase(`test-${crypto.randomUUID()}`);
    databases.push(database);
    await seedDatabase(database);

    const backup = await exportDatabase(database);

    expect(backup.version).toBe(2);
    expect(backup.roles[0]?.name).toBe("通用助手");
    expect(backup.conversations).toHaveLength(1);
  });

  it("将旧的 default DeepSeek 配置迁移为独立的 deepseek 配置", async () => {
    const database = createAppDatabase(`migration-${crypto.randomUUID()}`);
    databases.push(database);
    await database.profiles.add({
      id: "default",
      name: "DeepSeek",
      baseUrl: "https://api.deepseek.com",
      apiKey: "saved",
      model: "deepseek-chat",
      temperature: 0.7,
      maxTokens: 2048,
    });

    await migrateProfiles(database);

    expect((await database.profiles.get("deepseek"))?.apiKey).toBe("saved");
    expect(await database.profiles.get("default")).toBeUndefined();
  });

  it("合并备份时保留同一 ID 中更新时间更晚的消息", () => {
    const existing: BackupV2 = {
      version: 2,
      exportedAt: "2026-07-24T09:00:00.000Z",
      roles: [],
      conversations: [],
      profiles: [],
      messages: [{
        id: "message-1",
        conversationId: "conversation-1",
        role: "assistant",
        parts: [{ type: "text", text: "旧消息" }],
        createdAt: "2026-07-24T08:00:00.000Z",
        updatedAt: "2026-07-24T08:00:00.000Z",
      }],
    };
    const incoming: BackupV2 = {
      ...existing,
      exportedAt: "2026-07-24T10:00:00.000Z",
      messages: [{
        ...existing.messages[0]!,
        parts: [{ type: "text", text: "新消息" }],
        updatedAt: "2026-07-24T10:00:00.000Z",
      }],
    };

    expect(mergeBackup(existing, incoming).messages[0]?.updatedAt).toBe(
      "2026-07-24T10:00:00.000Z",
    );
  });
});
