import { describe, expect, it } from "vitest";
import { createStarterRole, validateBackup } from "../src/domain/models";

describe("角色与备份数据", () => {
  it("创建的默认角色带有头像、系统提示词和表情", () => {
    const role = createStarterRole("写作伙伴");

    expect(role.name).toBe("写作伙伴");
    expect(role.avatar).toBeTruthy();
    expect(role.systemPrompt).toContain("写作伙伴");
    expect(role.stickers.length).toBeGreaterThan(0);
  });

  it("拒绝缺少版本号的备份文件", () => {
    expect(() => validateBackup({ roles: [] })).toThrow("备份文件格式不正确");
  });

  it("读取旧版备份时为消息补上更新时间", () => {
    const backup = validateBackup({
      version: 1,
      exportedAt: "2026-07-24T10:00:00.000Z",
      roles: [],
      conversations: [],
      profiles: [],
      messages: [{
        id: "message-1",
        conversationId: "conversation-1",
        role: "user",
        parts: [{ type: "text", text: "你好" }],
        createdAt: "2026-07-24T09:00:00.000Z",
      }],
    });

    expect(backup.version).toBe(2);
    expect(backup.messages[0]?.updatedAt).toBe("2026-07-24T09:00:00.000Z");
  });
});
