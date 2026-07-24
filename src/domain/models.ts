import type {
  ProviderId,
  ReasoningLevel,
  TemperaturePreset,
} from "../providers/catalog";

export type MessagePart =
  | { type: "text"; text: string }
  | { type: "sticker"; emoji: string; label: string }
  | { type: "image"; url: string; alt: string }
  | { type: "tool-call"; toolName: string; arguments: string }
  | { type: "tool-result"; toolName: string; result: string };

export type Role = {
  id: string;
  name: string;
  avatar: string;
  description: string;
  systemPrompt: string;
  modelId?: string;
  temperature: number;
  stickers: string[];
  createdAt: string;
  updatedAt: string;
};

export type ChatMessage = {
  id: string;
  conversationId: string;
  role: "user" | "assistant" | "system";
  parts: MessagePart[];
  createdAt: string;
  updatedAt?: string;
  status?: "streaming" | "error";
};

export type Conversation = {
  id: string;
  title: string;
  roleId: string;
  pinned: boolean;
  draft: string;
  createdAt: string;
  updatedAt: string;
};

export type ModelProfile = {
  id: string;
  providerId?: ProviderId;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  temperaturePreset?: TemperaturePreset;
  reasoningLevel?: ReasoningLevel;
  useCustomModel?: boolean;
  maxTokens: number;
  updatedAt?: string;
};

type BackupContents = {
  exportedAt: string;
  roles: Role[];
  conversations: Conversation[];
  messages: ChatMessage[];
  profiles: ModelProfile[];
};

export type BackupV1 = BackupContents & { version: 1 };
export type BackupV2 = BackupContents & { version: 2 };
export type Backup = BackupV2;

const now = () => new Date().toISOString();
const id = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;

export function createStarterRole(name: string): Role {
  const createdAt = now();

  return {
    id: id(),
    name,
    avatar: "✦",
    description: "友好、清晰的 AI 伙伴",
    systemPrompt: `你是${name}。请使用清晰、友好且实用的中文回答。`,
    temperature: 0.7,
    stickers: ["✨", "👍", "💡", "🤔"],
    createdAt,
    updatedAt: createdAt,
  };
}

export function validateBackup(value: unknown): BackupV2 {
  if (!value || typeof value !== "object") {
    throw new Error("备份文件格式不正确");
  }

  const backup = value as Partial<BackupV1 | BackupV2>;
  if (
    (backup.version !== 1 && backup.version !== 2) ||
    !Array.isArray(backup.roles) ||
    !Array.isArray(backup.conversations) ||
    !Array.isArray(backup.messages) ||
    !Array.isArray(backup.profiles)
  ) {
    throw new Error("备份文件格式不正确");
  }

  return {
    version: 2,
    exportedAt: typeof backup.exportedAt === "string" ? backup.exportedAt : now(),
    roles: backup.roles as Role[],
    conversations: backup.conversations as Conversation[],
    messages: (backup.messages as ChatMessage[]).map((message) => ({
      ...message,
      updatedAt: message.updatedAt ?? message.createdAt,
    })),
    profiles: backup.profiles as ModelProfile[],
  };
}
