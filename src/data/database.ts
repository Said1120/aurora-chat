import Dexie, { type Table } from "dexie";
import {
  createStarterRole,
  type Backup,
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
  }
}

const id = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;

export function createAppDatabase(name = "ipad-ai-chat"): IpadChatDatabase {
  return new IpadChatDatabase(name);
}

export async function seedDatabase(database: IpadChatDatabase): Promise<void> {
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
    version: 1,
    exportedAt: new Date().toISOString(),
    roles,
    conversations,
    messages,
    profiles,
  };
}
