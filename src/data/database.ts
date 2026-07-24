import Dexie, { type Table } from "dexie";
import {
  createStarterRole,
  type Backup,
  type BackupV2,
  type ChatMessage,
  type Conversation,
  type ModelProfile,
  type Role,
} from "../domain/models";

export class IpadChatDatabase extends Dexie {
  roles!: Table<Role, string>;
  conversations!: Table<Conversation, string>;
  messages!: Table<ChatMessage, string>;
  profiles!: Table<ModelProfile, string>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({
      roles: "id, name, updatedAt",
      conversations: "id, roleId, pinned, updatedAt",
      messages: "id, conversationId, createdAt",
      profiles: "id, name",
    });
    this.version(2).stores({
      roles: "id, name, updatedAt",
      conversations: "id, roleId, pinned, updatedAt",
      messages: "id, conversationId, createdAt, updatedAt",
      profiles: "id, providerId, updatedAt",
    });
  }
}

const id = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;

export function createAppDatabase(name = "ipad-ai-chat"): IpadChatDatabase {
  return new IpadChatDatabase(name);
}

export async function seedDatabase(database: IpadChatDatabase): Promise<void> {
  await migrateProfiles(database);
  if ((await database.roles.count()) > 0) return;

  const role = createStarterRole("通用助手");
  const createdAt = new Date().toISOString();
  const conversation: Conversation = {
    id: id(),
    title: "新对话",
    roleId: role.id,
    pinned: false,
    draft: "",
    createdAt,
    updatedAt: createdAt,
  };

  await database.transaction("rw", database.roles, database.conversations, async () => {
    await database.roles.add(role);
    await database.conversations.add(conversation);
  });
}

export async function exportDatabase(database: IpadChatDatabase): Promise<Backup> {
  const [roles, conversations, messages, profiles] = await Promise.all([
    database.roles.toArray(),
    database.conversations.toArray(),
    database.messages.toArray(),
    database.profiles.toArray(),
  ]);

  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    roles,
    conversations,
    messages: messages.map((message) => ({
      ...message,
      updatedAt: message.updatedAt ?? message.createdAt,
    })),
    profiles,
  };
}

export async function migrateProfiles(database: IpadChatDatabase): Promise<void> {
  const legacy = await database.profiles.get("default");
  if (!legacy) return;

  const existing = await database.profiles.get("deepseek");
  if (existing) {
    if (!existing.apiKey && legacy.apiKey) {
      await database.profiles.put({
        ...existing,
        apiKey: legacy.apiKey,
        updatedAt: existing.updatedAt ?? new Date().toISOString(),
      });
    }
    await database.profiles.delete("default");
    return;
  }

  await database.transaction("rw", database.profiles, async () => {
    await database.profiles.put({
      ...legacy,
      id: "deepseek",
      providerId: "deepseek",
      model:
        legacy.model === "deepseek-chat" || legacy.model === "deepseek-reasoner"
          ? "deepseek-v4-flash"
          : legacy.model,
      temperaturePreset: legacy.temperaturePreset ?? "balanced",
      reasoningLevel: legacy.reasoningLevel ?? "standard",
      updatedAt: legacy.updatedAt ?? new Date().toISOString(),
    });
    await database.profiles.delete("default");
  });
}

type MergeableRecord = {
  id: string;
  updatedAt?: string;
  createdAt?: string;
};

const recordTimestamp = (record: MergeableRecord): string =>
  record.updatedAt ?? record.createdAt ?? "";

function mergeRecords<T extends MergeableRecord>(existing: T[], incoming: T[]): T[] {
  const records = new Map(existing.map((record) => [record.id, record]));
  for (const record of incoming) {
    const current = records.get(record.id);
    if (!current || recordTimestamp(record) > recordTimestamp(current)) {
      records.set(record.id, record);
    }
  }
  return Array.from(records.values());
}

export function mergeBackup(existing: BackupV2, incoming: BackupV2): BackupV2 {
  return {
    version: 2,
    exportedAt:
      existing.exportedAt > incoming.exportedAt
        ? existing.exportedAt
        : incoming.exportedAt,
    roles: mergeRecords(existing.roles, incoming.roles),
    conversations: mergeRecords(existing.conversations, incoming.conversations),
    messages: mergeRecords(existing.messages, incoming.messages).map((message) => ({
      ...message,
      updatedAt: message.updatedAt ?? message.createdAt,
    })),
    profiles: mergeRecords(existing.profiles, incoming.profiles),
  };
}
