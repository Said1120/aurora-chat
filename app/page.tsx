"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { streamChatCompletion } from "../src/chat/openaiCompatible";
import { Composer } from "../src/components/Composer";
import { createAppDatabase, exportDatabase, seedDatabase, type IpadChatDatabase } from "../src/data/database";
import { createStarterRole, validateBackup, type ChatMessage, type Conversation, type ModelProfile, type Role } from "../src/domain/models";

const defaultProfile: ModelProfile = {
  id: "default", name: "DeepSeek", baseUrl: "https://api.deepseek.com", apiKey: "", model: "deepseek-chat", temperature: 0.7, maxTokens: 2048,
};
const makeId = () => crypto.randomUUID();
const messageText = (message: ChatMessage) => message.parts.map((part) => part.type === "text" ? part.text : part.type === "sticker" ? part.emoji : "").join("");

export default function Home() {
  const dbRef = useRef<IpadChatDatabase | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeConversationId, setActiveConversationId] = useState("");
  const [profile, setProfile] = useState(defaultProfile);
  const [draft, setDraft] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [showRoles, setShowRoles] = useState(false);

  const activeConversation = conversations.find((item) => item.id === activeConversationId);
  const activeRole = roles.find((item) => item.id === activeConversation?.roleId) ?? roles[0];
  const sortedConversations = useMemo(() => [...conversations].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt)), [conversations]);

  const refresh = async (conversationId = activeConversationId) => {
    const database = dbRef.current; if (!database) return;
    const [nextRoles, nextConversations, savedProfile] = await Promise.all([
      database.roles.toArray(), database.conversations.toArray(), database.profiles.get("default"),
    ]);
    setRoles(nextRoles); setConversations(nextConversations); setProfile(savedProfile ?? defaultProfile);
    const nextActive = conversationId || nextConversations[0]?.id || "";
    setActiveConversationId(nextActive);
    if (nextActive) setMessages(await database.messages.where("conversationId").equals(nextActive).sortBy("createdAt"));
  };

  useEffect(() => {
    const database = createAppDatabase(); dbRef.current = database;
    seedDatabase(database).then(() => refresh()).catch(() => setError("本机数据无法打开，请检查浏览器的隐私设置。"));
    return () => { abortRef.current?.abort(); database.close(); };
  }, []);

  const openConversation = async (conversationId: string) => { setActiveConversationId(conversationId); setMessages(await dbRef.current!.messages.where("conversationId").equals(conversationId).sortBy("createdAt")); };
  const newConversation = async (roleId = activeRole?.id) => {
    if (!roleId || !dbRef.current) return;
    const now = new Date().toISOString(); const item: Conversation = { id: makeId(), title: "新对话", roleId, pinned: false, draft: "", createdAt: now, updatedAt: now };
    await dbRef.current.conversations.add(item); await refresh(item.id); setDraft("");
  };
  const saveProfile = async () => { if (!profile.apiKey.trim()) { setError("请先填写 API Key，再保存设置。"); return; } await dbRef.current?.profiles.put(profile); setShowSettings(false); setError(""); };
  const saveRole = async (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (!activeRole || !dbRef.current) return;
    const field = event.target.name as "name" | "avatar" | "systemPrompt";
    const updated = { ...activeRole, [field]: event.target.value, updatedAt: new Date().toISOString() };
    await dbRef.current.roles.put(updated); await refresh();
  };
  const addRole = async () => { const role = createStarterRole("新的 AI 伙伴"); await dbRef.current?.roles.add(role); await refresh(); };
  const exportAll = async () => { if (!dbRef.current) return; const text = JSON.stringify(await exportDatabase(dbRef.current), null, 2); const url = URL.createObjectURL(new Blob([text], { type: "application/json" })); const link = document.createElement("a"); link.href = url; link.download = `ai-chat-backup-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(url); };
  const importAll = async (event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (!file || !dbRef.current) return; try { const backup = validateBackup(JSON.parse(await file.text())); if (!confirm("导入会替换当前 iPad 中的全部对话和角色，确定继续吗？")) return; await dbRef.current.transaction("rw", dbRef.current.roles, dbRef.current.conversations, dbRef.current.messages, dbRef.current.profiles, async () => { await Promise.all([dbRef.current!.roles.clear(), dbRef.current!.conversations.clear(), dbRef.current!.messages.clear(), dbRef.current!.profiles.clear()]); await Promise.all([dbRef.current!.roles.bulkAdd(backup.roles), dbRef.current!.conversations.bulkAdd(backup.conversations), dbRef.current!.messages.bulkAdd(backup.messages), dbRef.current!.profiles.bulkAdd(backup.profiles)]); }); await refresh(backup.conversations[0]?.id); } catch { setError("备份文件无法读取，请确认选择的是本工具导出的 JSON 文件。"); } finally { event.target.value = ""; } };
  const send = async () => {
    if (!draft.trim() || !activeConversation || !activeRole || !dbRef.current) return;
    if (!profile.apiKey.trim()) { setShowSettings(true); setError("请先在设置中保存 DeepSeek API Key。"); return; }
    const now = new Date().toISOString(); const user: ChatMessage = { id: makeId(), conversationId: activeConversation.id, role: "user", parts: [{ type: "text", text: draft.trim() }], createdAt: now }; const assistant: ChatMessage = { id: makeId(), conversationId: activeConversation.id, role: "assistant", parts: [{ type: "text", text: "" }], createdAt: now, status: "streaming" };
    setDraft(""); setError(""); setIsStreaming(true); setMessages((items) => [...items, user, assistant]); await dbRef.current.messages.bulkAdd([user, assistant]);
    const title = activeConversation.title === "新对话" ? messageText(user).slice(0, 22) : activeConversation.title; await dbRef.current.conversations.update(activeConversation.id, { title, updatedAt: now }); await refresh(activeConversation.id);
    const controller = new AbortController(); abortRef.current = controller; let text = "";
    try { await streamChatCompletion({ ...profile, systemPrompt: activeRole.systemPrompt, messages: [...messages, user].filter((item) => item.role !== "system").map((item) => ({ role: item.role as "user" | "assistant", text: messageText(item) })) }, (delta) => { text += delta; const next = { ...assistant, parts: [{ type: "text" as const, text }] }; setMessages((items) => items.map((item) => item.id === assistant.id ? next : item)); void dbRef.current?.messages.put(next); }, fetch, controller.signal); } catch (caught) { if (!controller.signal.aborted) { const message = caught instanceof Error ? caught.message : "连接失败"; setError(`${message}。请检查 Key、网络或服务地址。`); } } finally { await dbRef.current.messages.update(assistant.id, { status: undefined }); setMessages((items) => items.map((item) => item.id === assistant.id ? { ...item, status: undefined } : item)); setIsStreaming(false); abortRef.current = null; }
  };

  return <main className="app-shell">
    <aside className="role-rail"><div className="brand">✦</div><button onClick={() => setShowRoles(!showRoles)} aria-label="角色管理">☺</button><button onClick={() => setShowSettings(!showSettings)} aria-label="设置">⚙</button></aside>
    <aside className="conversation-panel"><div className="panel-heading"><div><small>个人 AI 工作台</small><h1>对话</h1></div><button className="icon-button" onClick={() => newConversation()} aria-label="新对话">＋</button></div><button className="new-chat" onClick={() => newConversation()}>＋ 新建对话</button><div className="conversation-list">{sortedConversations.map((item) => <button key={item.id} className={`conversation-item ${item.id === activeConversationId ? "active" : ""}`} onClick={() => openConversation(item.id)}><span>{item.pinned ? "★ " : ""}{item.title}</span><small>{roles.find((role) => role.id === item.roleId)?.name ?? "助手"}</small></button>)}</div><div className="local-note">数据只保存在这台设备<br />请定期导出备份</div></aside>
    <section className="chat-panel"><header className="chat-header"><div className="avatar">{activeRole?.avatar ?? "✦"}</div><div><strong>{activeRole?.name ?? "正在打开…"}</strong><p>{activeRole?.description ?? ""}</p></div><button className="header-button" onClick={() => setShowRoles(true)}>编辑角色</button></header>
      <div className="messages">{messages.length === 0 && <div className="welcome"><div className="welcome-mark">✦</div><h2>从一个想法开始</h2><p>选择角色、填好 DeepSeek Key，然后直接聊起来。</p><div className="prompt-grid"><button onClick={() => setDraft("帮我整理今天的工作计划")}>整理今天的工作计划</button><button onClick={() => setDraft("把这段话改得更自然一些")}>润色一段文字</button><button onClick={() => setDraft("解释一个我不懂的概念")}>解释一个概念</button></div></div>}{messages.map((item) => <article key={item.id} className={`message ${item.role}`}><div className="message-avatar">{item.role === "user" ? "我" : activeRole?.avatar}</div><div className="message-content">{messageText(item) || (item.status === "streaming" ? "正在思考…" : "")}{item.status === "streaming" && <span className="cursor">▋</span>}<div className="message-actions">{item.role === "assistant" && messageText(item) && <button onClick={() => navigator.clipboard.writeText(messageText(item))}>复制</button>}</div></div></article>)}</div>
      {error && <div className="error-banner">{error}<button onClick={() => setError("")}>×</button></div>}<Composer value={draft} onChange={setDraft} onSend={send} onStop={() => abortRef.current?.abort()} isStreaming={isStreaming} stickers={activeRole?.stickers ?? []}/>
    </section>
    {(showSettings || showRoles) && <aside className="settings-panel"><div className="panel-heading"><h2>{showSettings ? "设置" : "角色"}</h2><button className="icon-button" onClick={() => { setShowSettings(false); setShowRoles(false); }}>×</button></div>{showSettings ? <><label>服务名称<input value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })}/></label><label>API 地址<input value={profile.baseUrl} onChange={(e) => setProfile({ ...profile, baseUrl: e.target.value })}/></label><label>模型名称<input value={profile.model} onChange={(e) => setProfile({ ...profile, model: e.target.value })}/></label><label>API Key<input type="password" value={profile.apiKey} placeholder="sk-…" onChange={(e) => setProfile({ ...profile, apiKey: e.target.value })}/></label><label>温度 {profile.temperature.toFixed(1)}<input type="range" min="0" max="1" step="0.1" value={profile.temperature} onChange={(e) => setProfile({ ...profile, temperature: Number(e.target.value) })}/></label><button className="primary-button wide" onClick={saveProfile}>保存连接设置</button><hr/><button className="secondary-button wide" onClick={exportAll}>导出全部数据</button><label className="file-button">导入备份<input type="file" accept="application/json" onChange={importAll}/></label><p className="privacy-copy">Key 只保存在本机浏览器中。请不要在共享 iPad 上保存。</p></> : <>{activeRole && <><label>头像<input name="avatar" value={activeRole.avatar} onChange={saveRole}/></label><label>角色名称<input name="name" value={activeRole.name} onChange={saveRole}/></label><label>系统提示词<textarea name="systemPrompt" value={activeRole.systemPrompt} rows={7} onChange={saveRole}/></label></>}<button className="secondary-button wide" onClick={addRole}>＋ 新建角色</button><div className="role-list">{roles.map((role) => <button key={role.id} onClick={() => newConversation(role.id)}><span>{role.avatar}</span>{role.name}</button>)}</div><p className="privacy-copy">未来的 MCP 工具会在这里配置；涉及发送、删除或外部写入时将要求确认。</p></>}</aside>}
  </main>;
}
