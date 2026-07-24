"use client";

import { type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { decryptBackup, encryptBackup, isEncryptedBackup } from "../src/backup/encryptedBackup";
import { streamChatCompletion } from "../src/chat/openaiCompatible";
import { Composer } from "../src/components/Composer";
import { createProfileForProvider, SettingsPanel } from "../src/components/SettingsPanel";
import {
  createAppDatabase,
  exportDatabase,
  mergeBackup,
  migrateProfiles,
  seedDatabase,
  type IpadChatDatabase,
} from "../src/data/database";
import {
  createStarterRole,
  validateBackup,
  type BackupV2,
  type ChatMessage,
  type Conversation,
  type ModelProfile,
  type Role,
} from "../src/domain/models";
import type { ProviderId } from "../src/providers/catalog";

const defaultProfile = createProfileForProvider("deepseek");
const makeId = () => crypto.randomUUID();

const messageText = (message: ChatMessage) =>
  message.parts
    .map((part) =>
      part.type === "text" ? part.text : part.type === "sticker" ? part.emoji : "",
    )
    .join("");

const profileProviderId = (profile: ModelProfile): ProviderId =>
  profile.providerId ?? (profile.id === "default" ? "deepseek" : (profile.id as ProviderId));

async function replaceDatabase(database: IpadChatDatabase, backup: BackupV2): Promise<void> {
  await database.transaction(
    "rw",
    database.roles,
    database.conversations,
    database.messages,
    database.profiles,
    async () => {
      await Promise.all([
        database.roles.clear(),
        database.conversations.clear(),
        database.messages.clear(),
        database.profiles.clear(),
      ]);
      await Promise.all([
        database.roles.bulkAdd(backup.roles),
        database.conversations.bulkAdd(backup.conversations),
        database.messages.bulkAdd(backup.messages),
        database.profiles.bulkAdd(backup.profiles),
      ]);
    },
  );
  await migrateProfiles(database);
}

function downloadFile(content: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export default function Home() {
  const dbRef = useRef<IpadChatDatabase | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const activeConversationIdRef = useRef("");
  const [roles, setRoles] = useState<Role[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeConversationId, setActiveConversationId] = useState("");
  const [profiles, setProfiles] = useState<ModelProfile[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState<ProviderId>("deepseek");
  const [draft, setDraft] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [showRoles, setShowRoles] = useState(false);

  const activeConversation = conversations.find((item) => item.id === activeConversationId);
  const activeRole = roles.find((item) => item.id === activeConversation?.roleId) ?? roles[0];
  const activeProfile =
    profiles.find((item) => profileProviderId(item) === selectedProviderId) ?? defaultProfile;
  const sortedConversations = useMemo(
    () =>
      [...conversations].sort(
        (a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt),
      ),
    [conversations],
  );

  const refresh = useCallback(async (conversationId?: string) => {
    const database = dbRef.current;
    if (!database) return;
    const [nextRoles, nextConversations, nextProfiles] = await Promise.all([
      database.roles.toArray(),
      database.conversations.toArray(),
      database.profiles.toArray(),
    ]);
    setRoles(nextRoles);
    setConversations(nextConversations);
    setProfiles(nextProfiles);
    const nextActive = conversationId ?? activeConversationIdRef.current ?? nextConversations[0]?.id ?? "";
    activeConversationIdRef.current = nextActive;
    setActiveConversationId(nextActive);
    setMessages(
      nextActive
        ? await database.messages.where("conversationId").equals(nextActive).sortBy("createdAt")
        : [],
    );
  }, []);

  useEffect(() => {
    const database = createAppDatabase();
    dbRef.current = database;
    void seedDatabase(database)
      .then(() => refresh())
      .catch(() => setError("本机数据无法打开，请检查浏览器的隐私设置。"));
    return () => {
      abortRef.current?.abort();
      database.close();
    };
  }, [refresh]);

  const openConversation = async (conversationId: string) => {
    const database = dbRef.current;
    if (!database) return;
    activeConversationIdRef.current = conversationId;
    setActiveConversationId(conversationId);
    setMessages(await database.messages.where("conversationId").equals(conversationId).sortBy("createdAt"));
  };

  const newConversation = async (roleId = activeRole?.id) => {
    if (!roleId || !dbRef.current) return;
    const now = new Date().toISOString();
    const item: Conversation = {
      id: makeId(),
      title: "新对话",
      roleId,
      pinned: false,
      draft: "",
      createdAt: now,
      updatedAt: now,
    };
    await dbRef.current.conversations.add(item);
    await refresh(item.id);
    setDraft("");
  };

  const saveProfile = async (profile: ModelProfile) => {
    if (!profile.apiKey.trim()) {
      setError(`请先填写 ${profile.name} 的 API Key，再保存设置。`);
      return;
    }
    await dbRef.current?.profiles.put(profile);
    setProfiles((items) => [...items.filter((item) => item.id !== profile.id), profile]);
    setSelectedProviderId(profileProviderId(profile));
    setShowSettings(false);
    setError("");
  };

  const saveRole = async (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (!activeRole || !dbRef.current) return;
    const field = event.target.name as "name" | "avatar" | "systemPrompt";
    const updated = { ...activeRole, [field]: event.target.value, updatedAt: new Date().toISOString() };
    await dbRef.current.roles.put(updated);
    await refresh();
  };

  const addRole = async () => {
    const role = createStarterRole("新的 AI 伙伴");
    await dbRef.current?.roles.add(role);
    await refresh();
  };

  const exportEncrypted = async (password: string) => {
    const database = dbRef.current;
    if (!database) throw new Error("数据库尚未就绪");
    const encrypted = await encryptBackup(await exportDatabase(database), password);
    downloadFile(
      JSON.stringify(encrypted),
      `aurora-chat-backup-${new Date().toISOString().slice(0, 10)}.aurora`,
    );
  };

  const applyImportedBackup = async (imported: BackupV2, mode: "replace" | "merge") => {
    const database = dbRef.current;
    if (!database) throw new Error("数据库尚未就绪");
    if (mode === "replace" && !window.confirm("这会替换本机的全部对话、角色和服务配置，确定继续吗？")) {
      return;
    }
    const backup = mode === "merge" ? mergeBackup(await exportDatabase(database), imported) : imported;
    await replaceDatabase(database, backup);
    await refresh(backup.conversations[0]?.id);
  };

  const importBackup = async (file: File, password: string, mode: "replace" | "merge") => {
    const database = dbRef.current;
    if (!database) throw new Error("数据库尚未就绪");
    const parsed = JSON.parse(await file.text()) as unknown;
    const imported = isEncryptedBackup(parsed)
      ? await decryptBackup(parsed, password)
      : validateBackup(parsed);
    await applyImportedBackup(imported, mode);
  };

  const send = async () => {
    if (!draft.trim() || !activeConversation || !activeRole || !dbRef.current) return;
    if (!activeProfile.apiKey.trim()) {
      setShowSettings(true);
      setError(`请先在设置中保存 ${activeProfile.name} API Key。`);
      return;
    }

    const now = new Date().toISOString();
    const user: ChatMessage = {
      id: makeId(),
      conversationId: activeConversation.id,
      role: "user",
      parts: [{ type: "text", text: draft.trim() }],
      createdAt: now,
      updatedAt: now,
    };
    const assistant: ChatMessage = {
      id: makeId(),
      conversationId: activeConversation.id,
      role: "assistant",
      parts: [{ type: "text", text: "" }],
      createdAt: now,
      updatedAt: now,
      status: "streaming",
    };
    setDraft("");
    setError("");
    setIsStreaming(true);
    setMessages((items) => [...items, user, assistant]);
    await dbRef.current.messages.bulkAdd([user, assistant]);

    const title = activeConversation.title === "新对话" ? messageText(user).slice(0, 22) : activeConversation.title;
    await dbRef.current.conversations.update(activeConversation.id, { title, updatedAt: now });
    await refresh(activeConversation.id);

    const controller = new AbortController();
    abortRef.current = controller;
    let text = "";
    try {
      await streamChatCompletion(
        {
          ...activeProfile,
          providerId: profileProviderId(activeProfile),
          systemPrompt: activeRole.systemPrompt,
          messages: [...messages, user]
            .filter((item) => item.role !== "system")
            .map((item) => ({
              role: item.role as "user" | "assistant",
              text: messageText(item),
            })),
        },
        (delta) => {
          text += delta;
          const next = {
            ...assistant,
            parts: [{ type: "text" as const, text }],
            updatedAt: new Date().toISOString(),
          };
          setMessages((items) => items.map((item) => (item.id === assistant.id ? next : item)));
          void dbRef.current?.messages.put(next);
        },
        fetch,
        controller.signal,
      );
    } catch (caught) {
      if (!controller.signal.aborted) {
        const message = caught instanceof Error ? caught.message : "连接失败";
        setError(`${message}。请检查 Key、网络或服务地址。`);
      }
    } finally {
      const completedAt = new Date().toISOString();
      await dbRef.current?.messages.update(assistant.id, { status: undefined, updatedAt: completedAt });
      setMessages((items) =>
        items.map((item) =>
          item.id === assistant.id ? { ...item, status: undefined, updatedAt: completedAt } : item,
        ),
      );
      setIsStreaming(false);
      abortRef.current = null;
    }
  };

  return (
    <main className="app-shell">
      <aside className="role-rail">
        <div className="brand">✦</div>
        <button onClick={() => setShowRoles(!showRoles)} aria-label="角色管理">☺</button>
        <button onClick={() => setShowSettings(!showSettings)} aria-label="设置">⚙</button>
      </aside>
      <aside className="conversation-panel">
        <div className="panel-heading">
          <div><small>个人 AI 工作台</small><h1>对话</h1></div>
          <button className="icon-button" onClick={() => newConversation()} aria-label="新对话">＋</button>
        </div>
        <button className="new-chat" onClick={() => newConversation()}>＋ 新建对话</button>
        <div className="conversation-list">
          {sortedConversations.map((item) => (
            <button
              key={item.id}
              className={`conversation-item ${item.id === activeConversationId ? "active" : ""}`}
              onClick={() => openConversation(item.id)}
            >
              <span>{item.pinned ? "★ " : ""}{item.title}</span>
              <small>{roles.find((role) => role.id === item.roleId)?.name ?? "助手"}</small>
            </button>
          ))}
        </div>
        <div className="local-note">数据只保存在这台设备<br />可使用加密备份传到新设备</div>
      </aside>
      <section className="chat-panel">
        <header className="chat-header">
          <div className="avatar">{activeRole?.avatar ?? "✦"}</div>
          <div><strong>{activeRole?.name ?? "正在打开…"}</strong><p>{activeRole?.description ?? ""}</p></div>
          <button className="header-button" onClick={() => setShowRoles(true)}>编辑角色</button>
        </header>
        <div className="messages">
          {messages.length === 0 && (
            <div className="welcome">
              <div className="welcome-mark">✦</div>
              <h2>从一个想法开始</h2>
              <p>选择角色和服务商，填好自己的 API Key，就可以直接聊天。</p>
              <div className="prompt-grid">
                <button onClick={() => setDraft("帮我整理今天的工作计划")}>整理今天的工作计划</button>
                <button onClick={() => setDraft("把这段话改得更自然一些")}>润色一段文字</button>
                <button onClick={() => setDraft("解释一个我不懂的概念")}>解释一个概念</button>
              </div>
            </div>
          )}
          {messages.map((item) => (
            <article key={item.id} className={`message ${item.role}`}>
              <div className="message-avatar">{item.role === "user" ? "我" : activeRole?.avatar}</div>
              <div className="message-content">
                {messageText(item) || (item.status === "streaming" ? "正在生成…" : "")}
                {item.status === "streaming" && <span className="cursor">▋</span>}
                <div className="message-actions">
                  {item.role === "assistant" && messageText(item) && (
                    <button onClick={() => navigator.clipboard.writeText(messageText(item))}>复制</button>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
        {error && <div className="error-banner">{error}<button onClick={() => setError("")}>×</button></div>}
        <Composer
          value={draft}
          onChange={setDraft}
          onSend={send}
          onStop={() => abortRef.current?.abort()}
          isStreaming={isStreaming}
          stickers={activeRole?.stickers ?? []}
        />
      </section>
      {(showSettings || showRoles) && (
        <aside className="settings-panel">
          <div className="panel-heading">
            <h2>{showSettings ? "服务与数据" : "角色"}</h2>
            <button className="icon-button" onClick={() => { setShowSettings(false); setShowRoles(false); }}>×</button>
          </div>
          {showSettings ? (
            <SettingsPanel
              profile={activeProfile}
              profiles={profiles}
              onSaveProfile={saveProfile}
              onExportEncrypted={exportEncrypted}
              onImportEncrypted={importBackup}
              transfer={{
                getBackup: async () => {
                  if (!dbRef.current) throw new Error("数据库尚未就绪");
                  return exportDatabase(dbRef.current);
                },
                serviceUrl: process.env.NEXT_PUBLIC_TRANSFER_SERVICE_URL,
                turnstileSiteKey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
                onImportBackup: applyImportedBackup,
              }}
            />
          ) : (
            <>
              {activeRole && (
                <>
                  <label>头像<input name="avatar" value={activeRole.avatar} onChange={saveRole} /></label>
                  <label>角色名称<input name="name" value={activeRole.name} onChange={saveRole} /></label>
                  <label>系统提示词<textarea name="systemPrompt" value={activeRole.systemPrompt} rows={7} onChange={saveRole} /></label>
                </>
              )}
              <button className="secondary-button wide" onClick={addRole}>＋ 新建角色</button>
              <div className="role-list">
                {roles.map((role) => <button key={role.id} onClick={() => newConversation(role.id)}><span>{role.avatar}</span>{role.name}</button>)}
              </div>
              <p className="privacy-copy">未来可接入远程 HTTP/SSE MCP；本地 stdio MCP 需要额外的本地网关。</p>
            </>
          )}
        </aside>
      )}
    </main>
  );
}
