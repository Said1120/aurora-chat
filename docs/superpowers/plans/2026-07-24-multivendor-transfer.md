# 多厂商配置与无账号设备迁移 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (\`- [ ]\`) syntax for tracking.

**Goal:** 支持六家国产 AI 服务商的独立本地配置，并让用户以端到端加密的一次性传输码迁移全部个人数据到另一台设备。

**Architecture:** 前端新增服务商目录和请求适配层，UI 只消费规范化配置与能力描述。加密备份和临时传输使用 Web Crypto；备份密码与传输密钥始终只在设备端。临时中转单独部署到 Cloudflare Worker + R2，GitHub Pages 继续托管静态 PWA。

**Tech Stack:** Next.js 16、React 19、TypeScript、Dexie、Vitest、Web Crypto API、Cloudflare Workers + R2、Turnstile。

## Global Constraints

- 保持静态导出与 /aurora-chat 基路径不变。
- 预设仅包含 DeepSeek、Kimi、MiMo、硅基流动、智谱 GLM、千问和“自定义兼容服务”。
- API Key、聊天内容、备份密码和传输密钥不得写入 Git、日志、错误提示或二维码可见文本。
- 温度档位固定为：严谨 0.2、平衡 0.7、创意 1.0。
- 加密备份固定为 PBKDF2-SHA-256 600,000 次迭代、16 字节盐、12 字节 IV、AES-GCM 256 位密钥。
- 临时传输固定为 20MB 上限、单次领取、15 分钟有效；服务端只接收密文。
- 每项生产功能必须先有能正确失败的 Vitest 测试。

---

## File Structure

| 路径 | 职责 |
| --- | --- |
| src/providers/catalog.ts | 服务商、模型、能力与温度/思考规则目录。 |
| src/chat/openaiCompatible.ts | 规范化配置到请求 JSON 的适配与 SSE 解析。 |
| src/domain/models.ts | 多服务商配置、备份版本与迁移领域类型。 |
| src/data/database.ts | Dexie 升级、旧 DeepSeek 配置迁移、备份合并。 |
| src/backup/encryptedBackup.ts | 加密导出、解密导入与备份摘要。 |
| src/transfer/client.ts | 临时传输创建、领取、二维码负载和本机加解密。 |
| src/components/SettingsPanel.tsx | 厂商配置、备份和迁移界面。 |
| src/components/TransferPanel.tsx | 发送与接收一次性传输界面。 |
| workers/transfer/src/index.ts | Turnstile、R2 单次上传、领取与清理。 |
| workers/transfer/wrangler.jsonc | Worker 的 R2 绑定、CORS 和定时清理。 |
| README.md | 跨平台定位、服务商、迁移与 MCP 边界。 |

## Task 1: 服务商目录与规范化配置

**Files:**
- Create: src/providers/catalog.ts
- Modify: src/domain/models.ts
- Test: tests/providers.test.ts

**Interfaces:**
- Produces: ProviderId, TemperaturePreset, ReasoningLevel, ProviderDefinition, getProviderDefinition(providerId), getModelDefinition(providerId, modelId), temperatureForPreset(preset).
- ModelProfile 新增 providerId、temperaturePreset、reasoningLevel、useCustomModel，保留现有字段以兼容旧数据。

- [ ] **Step 1: Write the failing test**

~~~ts
import { describe, expect, it } from "vitest";
import { getModelDefinition, getProviderDefinition, temperatureForPreset } from "../src/providers/catalog";

describe("服务商目录", () => {
  it("为 Kimi 提供官方地址与 K2.6", () => {
    expect(getProviderDefinition("kimi").baseUrl).toBe("https://api.moonshot.cn/v1");
    expect(getModelDefinition("kimi", "kimi-k2.6")?.temperatureMode).toBe("fixed");
  });

  it("将回答风格映射为稳定温度", () => {
    expect(temperatureForPreset("precise")).toBe(0.2);
    expect(temperatureForPreset("balanced")).toBe(0.7);
    expect(temperatureForPreset("creative")).toBe(1);
  });
});
~~~

- [ ] **Step 2: Run test to verify it fails**

Run: npm test -- --run tests/providers.test.ts

Expected: FAIL because src/providers/catalog.ts does not exist.

- [ ] **Step 3: Write minimal implementation**

~~~ts
export type ProviderId = "deepseek" | "kimi" | "mimo" | "siliconflow" | "zhipu" | "qwen" | "custom";
export type TemperaturePreset = "precise" | "balanced" | "creative";
export type ReasoningLevel = "off" | "standard" | "deep";

export const temperatureForPreset = (preset: TemperaturePreset) =>
  ({ precise: 0.2, balanced: 0.7, creative: 1 })[preset];

export function getProviderDefinition(providerId: ProviderId): ProviderDefinition {
  return providers[providerId];
}
~~~

Populate the provider record with the exact official endpoints and model IDs in the approved design. Kimi K2.6 and MiMo V2.5 use temperatureMode "fixed"; models only supporting a switch declare reasoningLevels ["off", "standard"].

- [ ] **Step 4: Run test to verify it passes**

Run: npm test -- --run tests/providers.test.ts

Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

~~~bash
git add src/providers/catalog.ts src/domain/models.ts tests/providers.test.ts
git commit -m "feat: add provider catalog"
~~~

## Task 2: 请求参数适配与思考流解析

**Files:**
- Modify: src/chat/openaiCompatible.ts
- Test: tests/chat.test.ts

**Interfaces:**
- Produces: buildChatCompletionBody(request): Record<string, unknown>.
- ChatRequest 新增 providerId、temperaturePreset、reasoningLevel、可选 onReasoningDelta。
- Consumes: Task 1 的目录。

- [ ] **Step 1: Write failing tests**

~~~ts
it("把 DeepSeek 深度思考映射为 reasoning_effort=max", () => {
  const body = buildChatCompletionBody({
    providerId: "deepseek", model: "deepseek-v4-pro", temperaturePreset: "balanced",
    reasoningLevel: "deep", maxTokens: 1000, systemPrompt: "", messages: [],
  });
  expect(body).toMatchObject({ thinking: { type: "enabled" }, reasoning_effort: "max", temperature: 0.7 });
});

it("不向 Kimi K2.6 发送 temperature，且支持关闭思考", () => {
  const body = buildChatCompletionBody({
    providerId: "kimi", model: "kimi-k2.6", temperaturePreset: "creative",
    reasoningLevel: "off", maxTokens: 1000, systemPrompt: "", messages: [],
  });
  expect(body).toMatchObject({ thinking: { type: "disabled" } });
  expect(body).not.toHaveProperty("temperature");
});
~~~

- [ ] **Step 2: Run tests to verify they fail**

Run: npm test -- --run tests/chat.test.ts

Expected: FAIL because buildChatCompletionBody is not exported.

- [ ] **Step 3: Write minimal implementation**

~~~ts
export function buildChatCompletionBody(request: ChatRequest): Record<string, unknown> {
  const model = getModelDefinition(request.providerId, request.model);
  const body: Record<string, unknown> = {
    model: request.model, stream: true, max_tokens: request.maxTokens, messages: toMessages(request),
  };
  if (model?.temperatureMode !== "fixed") body.temperature = temperatureForPreset(request.temperaturePreset);
  applyReasoning(body, request.providerId, request.reasoningLevel, model);
  return body;
}
~~~

Map DeepSeek to thinking.type plus high/max effort; Kimi and MiMo to thinking.type only; SiliconFlow to enable_thinking plus 4096/16384 budget; Zhipu to thinking.type plus high/max effort; Qwen to enable_thinking plus 4096/16384 budget. Parse delta.reasoning_content only through onReasoningDelta and preserve final-answer behavior for delta.content.

- [ ] **Step 4: Run tests to verify they pass**

Run: npm test -- --run tests/chat.test.ts

Expected: PASS with existing stream test and the 2 mapping tests.

- [ ] **Step 5: Commit**

~~~bash
git add src/chat/openaiCompatible.ts tests/chat.test.ts
git commit -m "feat: adapt requests to provider capabilities"
~~~

## Task 3: 数据库升级与合并备份

**Files:**
- Modify: src/domain/models.ts
- Modify: src/data/database.ts
- Test: tests/database.test.ts
- Test: tests/domain.test.ts

**Interfaces:**
- Produces: migrateProfiles(database), mergeBackup(existing, incoming), BackupV2.
- Consumes: provider defaults from Task 1.

- [ ] **Step 1: Write failing tests**

~~~ts
it("将旧 default DeepSeek 配置迁移为 deepseek", async () => {
  const database = createAppDatabase("migration-" + crypto.randomUUID());
  databases.push(database);
  await database.profiles.add({ id: "default", name: "DeepSeek", baseUrl: "https://api.deepseek.com", apiKey: "saved", model: "deepseek-chat", temperature: 0.7, maxTokens: 2048 });
  await migrateProfiles(database);
  expect((await database.profiles.get("deepseek"))?.apiKey).toBe("saved");
});

it("合并备份时保留更新时间更晚的同 ID 消息", () => {
  expect(mergeBackup(existing, incoming).messages[0]?.updatedAt).toBe("2026-07-24T10:00:00.000Z");
});
~~~

- [ ] **Step 2: Run tests to verify they fail**

Run: npm test -- --run tests/database.test.ts tests/domain.test.ts

Expected: FAIL because migrateProfiles and mergeBackup do not exist.

- [ ] **Step 3: Write minimal implementation**

~~~ts
export async function migrateProfiles(database: IpadChatDatabase) {
  const legacy = await database.profiles.get("default");
  if (!legacy || await database.profiles.get("deepseek")) return;
  await database.profiles.put({
    ...legacy, id: "deepseek", providerId: "deepseek",
    temperaturePreset: "balanced", reasoningLevel: "standard",
  });
  await database.profiles.delete("default");
}
~~~

Create Dexie version 2 without changing primary keys. Add updatedAt to ChatMessage; when importing a legacy record, normalize it from createdAt. mergeBackup unions records by ID and retains the later ISO updatedAt; a profile is never merged into another provider ID.

- [ ] **Step 4: Run tests to verify they pass**

Run: npm test -- --run tests/database.test.ts tests/domain.test.ts

Expected: PASS with migration and merge coverage.

- [ ] **Step 5: Commit**

~~~bash
git add src/domain/models.ts src/data/database.ts tests/database.test.ts tests/domain.test.ts
git commit -m "feat: migrate profiles and merge backups"
~~~

## Task 4: 加密备份格式

**Files:**
- Create: src/backup/encryptedBackup.ts
- Test: tests/encryptedBackup.test.ts

**Interfaces:**
- Produces: encryptBackup(backup, password), decryptBackup(serialized, password), isEncryptedBackup(value), backupSummary(backup).
- Consumes: BackupV2.

- [ ] **Step 1: Write failing tests**

~~~ts
it("加密包不暴露 API Key 或消息正文", async () => {
  const encrypted = await encryptBackup(sampleBackup, "correct horse battery staple");
  expect(JSON.stringify(encrypted)).not.toContain("sk-secret");
  expect(JSON.stringify(encrypted)).not.toContain("私人对话");
});

it("仅正确密码可以恢复完整备份", async () => {
  const encrypted = await encryptBackup(sampleBackup, "password");
  await expect(decryptBackup(encrypted, "wrong")).rejects.toThrow("备份密码不正确或文件已损坏");
  await expect(decryptBackup(encrypted, "password")).resolves.toEqual(sampleBackup);
});
~~~

- [ ] **Step 2: Run test to verify it fails**

Run: npm test -- --run tests/encryptedBackup.test.ts

Expected: FAIL because encryptedBackup.ts does not exist.

- [ ] **Step 3: Write minimal implementation**

~~~ts
const iterations = 600_000;

export async function encryptBackup(backup: BackupV2, password: string): Promise<EncryptedBackup> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const plaintext = new TextEncoder().encode(JSON.stringify(backup));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  return { format: "aurora-backup", version: 1, kdf: "PBKDF2-SHA-256", iterations, salt: toBase64(salt), iv: toBase64(iv), ciphertext: toBase64(new Uint8Array(encrypted)) };
}
~~~

Validate envelope fields before decrypting. Map all crypto, JSON and backup-shape failures to the exact Chinese error asserted above. Keep existing plain JSON backup import as a legacy path, but make encrypted export the default.

- [ ] **Step 4: Run test to verify it passes**

Run: npm test -- --run tests/encryptedBackup.test.ts

Expected: PASS with both tests.

- [ ] **Step 5: Commit**

~~~bash
git add src/backup/encryptedBackup.ts tests/encryptedBackup.test.ts
git commit -m "feat: add encrypted backup format"
~~~

## Task 5: 厂商设置与加密导入导出 UI

**Files:**
- Create: src/components/SettingsPanel.tsx
- Modify: app/page.tsx
- Modify: app/globals.css
- Test: tests/SettingsPanel.test.tsx

**Interfaces:**
- Consumes: ModelProfile、目录、加密备份、exportDatabase、mergeBackup。
- Produces: SettingsPanel with onSaveProfile(profile), onExportEncrypted(password), onImportEncrypted(file, password, mode).

- [ ] **Step 1: Write failing UI test**

~~~tsx
it("切换到智谱后显示官方地址、GLM-5.2 和独立 Key", async () => {
  render(<SettingsPanel profile={deepSeekProfile} onSaveProfile={vi.fn()} onExportEncrypted={vi.fn()} onImportEncrypted={vi.fn()} />);
  await userEvent.selectOptions(screen.getByLabelText("服务商"), "zhipu");
  expect(screen.getByDisplayValue("https://open.bigmodel.cn/api/paas/v4")).toBeDisabled();
  expect(screen.getByRole("option", { name: "GLM-5.2" })).toBeInTheDocument();
  expect(screen.getByLabelText("API Key")).toHaveValue("");
});
~~~

- [ ] **Step 2: Run test to verify it fails**

Run: npm test -- --run tests/SettingsPanel.test.tsx

Expected: FAIL because SettingsPanel does not exist.

- [ ] **Step 3: Write minimal implementation**

~~~tsx
<label>服务商
  <select aria-label="服务商" value={profile.providerId} onChange={(event) => onProviderChange(event.target.value as ProviderId)}>
    {providerList.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}
  </select>
</label>
<fieldset aria-label="回答风格">
  {(["precise", "balanced", "creative"] as const).map((preset) =>
    <button type="button" onClick={() => update({ temperaturePreset: preset })}>{temperatureLabel[preset]}</button>
  )}
</fieldset>
~~~

Split settings JSX out of app/page.tsx. Keep a profiles state array, select by providerId, and create a blank profile from the directory on first selection. Disable official endpoint until “高级连接设置” is checked. Fixed-temperature models show “该模型由官方固定采样参数”. Show only the selected model’s supported reasoning levels. Export requires password confirmation; import asks for password then “替换本机全部数据 / 合并并保留本机数据”.

- [ ] **Step 4: Run UI and full suites**

Run: npm test -- --run tests/SettingsPanel.test.tsx; npm test

Expected: PASS with new UI coverage and no test regression.

- [ ] **Step 5: Commit**

~~~bash
git add src/components/SettingsPanel.tsx app/page.tsx app/globals.css tests/SettingsPanel.test.tsx
git commit -m "feat: add multivendor settings and encrypted backup UI"
~~~

## Task 6: 临时传输客户端与二维码界面

**Files:**
- Create: src/transfer/client.ts
- Create: src/components/TransferPanel.tsx
- Modify: src/components/SettingsPanel.tsx
- Test: tests/transferClient.test.ts
- Test: tests/TransferPanel.test.tsx

**Interfaces:**
- Produces: createTransferPayload(backup), openTransferPayload(upload, secret), createTransfer(serviceUrl, token, payload, fetcher), claimTransfer(serviceUrl, id, fetcher).
- Transfer URI format: aurora://transfer/<id>#<base64url-key>.

- [ ] **Step 1: Write failing tests**

~~~ts
it("传输负载只有密文，二维码密钥可恢复原备份", async () => {
  const payload = await createTransferPayload(sampleBackup);
  expect(JSON.stringify(payload.upload)).not.toContain("sk-secret");
  await expect(openTransferPayload(payload.upload, payload.secret)).resolves.toEqual(sampleBackup);
});

it("拒绝超过 20MB 的密文上传", async () => {
  await expect(createTransfer("https://transfer.example", "turnstile", oversizedPayload, fetch)).rejects.toThrow("迁移包超过 20MB 上限");
});
~~~

- [ ] **Step 2: Run tests to verify they fail**

Run: npm test -- --run tests/transferClient.test.ts tests/TransferPanel.test.tsx

Expected: FAIL because transfer modules do not exist.

- [ ] **Step 3: Write minimal implementation**

~~~ts
export async function createTransferPayload(backup: BackupV2) {
  const secret = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await encryptWithRawKey(backup, secret, iv);
  return { upload: { version: 1, iv: toBase64Url(iv), ciphertext: toBase64Url(ciphertext) }, secret: toBase64Url(secret) };
}
~~~

The panel has “发送到新设备” and “接收迁移” tabs. Sending displays QR and manual URI only after the service accepts ciphertext. Receiving accepts scan or paste, decrypts locally, displays backupSummary, then asks the same replace/merge confirmation as file import. Add one QR encoding/scanning dependency; do not place any API data in QR text beyond the random ID and random secret. If NEXT_PUBLIC_TRANSFER_SERVICE_URL or NEXT_PUBLIC_TURNSTILE_SITE_KEY is absent, hide instant transfer and leave encrypted files fully usable.

- [ ] **Step 4: Run tests to verify they pass**

Run: npm test -- --run tests/transferClient.test.ts tests/TransferPanel.test.tsx

Expected: PASS with encryption and 20MB-limit coverage.

- [ ] **Step 5: Commit**

~~~bash
git add src/transfer/client.ts src/components/TransferPanel.tsx src/components/SettingsPanel.tsx tests/transferClient.test.ts tests/TransferPanel.test.tsx package.json package-lock.json
git commit -m "feat: add encrypted device transfer client"
~~~

## Task 7: Cloudflare 一次性传输 Worker

**Files:**
- Create: workers/transfer/src/index.ts
- Create: workers/transfer/wrangler.jsonc
- Create: workers/transfer/package.json
- Create: workers/transfer/test/index.test.ts
- Modify: .gitignore

**Interfaces:**
- Produces: createHandler(env): { fetch(request): Promise<Response>; scheduled(): Promise<void> }.
- Consumes: TRANSFER_BUCKET: R2Bucket, TURNSTILE_SECRET_KEY: string, upload envelope from Task 6.

- [ ] **Step 1: Write failing Worker tests**

~~~ts
it("只在 Turnstile 成功后保存密文并返回随机 ID", async () => {
  const response = await handler.fetch(new Request("https://worker/v1/transfers", {
    method: "POST", headers: { "content-type": "application/json", "cf-turnstile-response": "valid" }, body: JSON.stringify(upload),
  }));
  expect(response.status).toBe(201);
  expect((await response.json()).id).toMatch(/^[a-z0-9_-]{22}$/);
});

it("领取后立即删除对象，第二次领取返回 410", async () => {
  await createUpload(handler, upload);
  expect((await handler.fetch(claimRequest(id))).status).toBe(200);
  expect((await handler.fetch(claimRequest(id))).status).toBe(410);
});
~~~

- [ ] **Step 2: Run tests to verify they fail**

Run: npm --prefix workers/transfer test

Expected: FAIL because the Worker package and handler do not exist.

- [ ] **Step 3: Write minimal implementation**

~~~ts
export function createHandler(env: Env) {
  return {
    async fetch(request: Request): Promise<Response> {
      const url = new URL(request.url);
      if (request.method === "POST" && url.pathname === "/v1/transfers") return createTransfer(request, env);
      if (request.method === "GET" && url.pathname.startsWith("/v1/transfers/")) return claimTransfer(request, env);
      return new Response("Not found", { status: 404 });
    },
    async scheduled() { await deleteExpiredTransfers(env); },
  };
}
~~~

Validate Turnstile by posting its token to challenges.cloudflare.com/turnstile/v0/siteverify and reject failures with 403. Validate envelope shape and decoded ciphertext size before R2 write. Store expiresAt as R2 custom metadata. Claim returns 410 for absent, expired, or deleted data; for success, read the envelope, delete the object before responding, and set no-store. scheduled lists transfers/ and removes expired metadata. CORS allows only https://said1120.github.io and local development.

- [ ] **Step 4: Run Worker tests to verify they pass**

Run: npm --prefix workers/transfer test

Expected: PASS with upload, CORS, size, expiry and single-claim coverage.

- [ ] **Step 5: Commit**

~~~bash
git add workers/transfer .gitignore
git commit -m "feat: add one-time encrypted transfer worker"
~~~

## Task 8: README、部署和端到端验证

**Files:**
- Modify: README.md
- Modify: package.json
- Modify: tests/github-pages.test.ts
- Modify: public/sw.js

**Interfaces:**
- Produces: deploy:pages and deploy:transfer scripts.
- Uses Worker URL and Turnstile site key only as public GitHub Pages build-time variables.

- [ ] **Step 1: Write failing documentation test**

~~~ts
it("README 说明多厂商、加密迁移和 MCP 边界", async () => {
  const readme = await readFile(projectFile("README.md"), "utf8");
  expect(readme).toContain("Kimi");
  expect(readme).toContain("一次性传输码");
  expect(readme).toContain("远程 HTTP/SSE MCP");
});
~~~

- [ ] **Step 2: Run test to verify it fails**

Run: npm test -- --run tests/github-pages.test.ts

Expected: FAIL because current README 是 DeepSeek/iPad-only。

- [ ] **Step 3: Write minimal implementation**

Update README with the six providers, API billing versus free hosting, local-first storage, encrypted file backup, temporary transfer limits, and MCP boundary: remote HTTP/SSE MCP can be integrated later; local stdio MCP needs a companion gateway. Bump the service-worker cache name. Add deploy:transfer = npm --prefix workers/transfer run deploy.

Provision the Worker only after the owner signs in to Cloudflare:

~~~bash
npx wrangler login
npx wrangler r2 bucket create aurora-chat-transfers
npx wrangler secret put TURNSTILE_SECRET_KEY --config workers/transfer/wrangler.jsonc
npm --prefix workers/transfer run deploy
~~~

Set the returned Worker URL and public Turnstile site key in the GitHub Pages build configuration, rebuild, then run npm run deploy:pages.

- [ ] **Step 4: Run all verification**

Run: npm test; npm run lint; npm run build

Expected: 0 Vitest failures, 0 ESLint errors, and Next emits static out/ content.

Then verify deployed origin and Worker CORS:

~~~powershell
Invoke-WebRequest -Method Options -Uri https://<worker-host>/v1/transfers -Headers @{ Origin = "https://said1120.github.io"; "Access-Control-Request-Method" = "POST" }
Invoke-WebRequest https://said1120.github.io/aurora-chat/
~~~

Expected: Worker preflight permits only the GitHub Pages origin; site returns 200; a two-device test transfers an encrypted backup exactly once.

- [ ] **Step 5: Commit and publish**

~~~bash
git add README.md package.json package-lock.json tests/github-pages.test.ts public/sw.js
git commit -m "docs: describe multivendor transfer workflow"
git push -u origin agent/multivendor-sync
~~~

Create a draft PR for main titled “支持多厂商配置与加密设备迁移”. Its body must explain the encryption boundary, one-time transfer prerequisite, verification commands and the required Cloudflare login.

## Plan self-review

- **Spec coverage:** Tasks 1–2 implement provider selection and parameter differences. Task 3 preserves legacy data and merge rules. Task 4 delivers encrypted file fallback. Tasks 5–6 implement the UI and selected QR/temporary path. Task 7 is the secure relay. Task 8 updates documentation, deploys and verifies both services.
- **Placeholder scan:** No TODO/TBD markers or unspecified interfaces remain. Cloudflare authentication is intentionally explicit in Task 8 because there are no existing Cloudflare resources.
- **Type consistency:** ProviderId, TemperaturePreset, ReasoningLevel, BackupV2, ModelProfile, createTransferPayload, openTransferPayload and createHandler are defined before later tasks consume them.

