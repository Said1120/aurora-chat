import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { createAppDatabase, exportDatabase, seedDatabase } from "../src/data/database";

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

    expect(backup.version).toBe(1);
    expect(backup.roles[0]?.name).toBe("通用助手");
    expect(backup.conversations).toHaveLength(1);
  });
});
