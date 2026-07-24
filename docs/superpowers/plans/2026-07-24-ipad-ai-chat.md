# iPad AI Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付可安装到 iPad 主屏幕的个人 AI 聊天 PWA，支持 DeepSeek、角色、对话管理与本地备份。

**Architecture:** React 应用通过独立的本地数据层保存内容，通过独立聊天服务层调用 OpenAI 兼容接口。UI 只依赖这些稳定接口，因此未来可插入 MCP 网关和富媒体消息。

**Tech Stack:** React 19、TypeScript、Vite、Vitest、Dexie、Zustand、React Markdown、Vite PWA。

## Global Constraints

- 必须适配 iPad Safari、横屏、竖屏、分屏和主屏幕 PWA 启动。
- 聊天记录与 Key 默认只留在设备本地；不引入账户或第三方数据收集。
- 所有新业务函数先写 Vitest 失败测试，再写最小实现。
- 消息类型使用可扩展分段结构，为 sticker、image 和 MCP tool-call 留出位置。
- 远程 MCP 连接和服务器网关不属于第一版发布范围。

---

### Task 1: 建立 PWA 骨架与基础验证

**Files:**
- Create: `package.json`, `vite.config.ts`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/styles.css`, `public/*`
- Test: `src/App.test.tsx`

- [ ] 初始化 React + TypeScript + Vite，并添加 PWA manifest、图标、离线缓存与基础测试命令。
- [ ] 写失败测试，断言根应用显示“新对话”和“设置”。
- [ ] 运行测试，确认因根应用尚未实现而失败。
- [ ] 实现最小应用壳并重复运行测试至通过。
- [ ] 执行生产构建，确认 PWA 产物存在。

### Task 2: 定义领域模型与本地数据库

**Files:**
- Create: `src/domain/types.ts`, `src/data/db.ts`, `src/data/backup.ts`
- Test: `src/data/backup.test.ts`

- [ ] 写失败测试，断言备份数据会被校验、迁移为当前版本，且不接受损坏文件。
- [ ] 实现角色、对话、消息、模型配置和消息分段的类型与 Dexie 表。
- [ ] 实现备份导出、导入校验与版本字段。
- [ ] 运行数据库与备份测试至通过。

### Task 3: 实现聊天服务与流式解析

**Files:**
- Create: `src/chat/provider.ts`, `src/chat/openaiCompatible.ts`, `src/chat/sse.ts`
- Test: `src/chat/sse.test.ts`, `src/chat/openaiCompatible.test.ts`

- [ ] 写失败测试，断言 SSE 解析可拼接多段文本、忽略 keep-alive 并在 `[DONE]` 后完成。
- [ ] 写失败测试，断言请求体包含当前角色的系统提示词、消息及模型参数。
- [ ] 实现 SSE 解析器与 OpenAI 兼容提供者；网络层可注入 fetch，便于测试。
- [ ] 运行聊天服务测试至通过。

### Task 4: 建立状态管理与对话业务

**Files:**
- Create: `src/state/chatStore.ts`, `src/state/chatStore.test.ts`

- [ ] 写失败测试，断言新建对话绑定角色、编辑消息时截断后续上下文、发送失败时保留草稿。
- [ ] 实现对话 CRUD、角色切换、消息持久化、流式状态和错误状态。
- [ ] 运行状态测试至通过。

### Task 5: 实现 iPad 聊天与角色界面

**Files:**
- Create: `src/components/*`, `src/hooks/*`
- Modify: `src/App.tsx`, `src/styles.css`
- Test: `src/components/Composer.test.tsx`, `src/components/RoleEditor.test.tsx`

- [ ] 写失败测试，断言发送按钮仅在可发送时启用，并能停止生成；断言角色编辑保存头像和提示词。
- [ ] 实现三栏/抽屉导航、消息列表、输入区、Markdown、代码复制、角色编辑和表情选择。
- [ ] 用 CSS 媒体查询实现横竖屏和分屏布局。
- [ ] 运行组件测试至通过。

### Task 6: 实现设置、备份与安装说明

**Files:**
- Create: `src/components/SettingsPanel.tsx`, `src/components/BackupPanel.tsx`, `README.md`
- Test: `src/components/SettingsPanel.test.tsx`

- [ ] 写失败测试，断言空 Key 不能保存、测试连接不会泄露 Key、导入前会显示替换提示。
- [ ] 实现模型配置、连通性测试、主题切换、JSON 导入导出和清空数据。
- [ ] 在 README 写 iPad 部署、添加到主屏幕和备份恢复步骤。
- [ ] 运行所有测试与生产构建。

### Task 7: 发布前验证与部署

**Files:**
- Modify: `.openai/hosting.json`（若由发布环境生成）

- [ ] 用生产构建验证 manifest、离线页面和静态资源引用。
- [ ] 通过部署服务发布 HTTPS 地址。
- [ ] 在 iPad Safari 打开地址，执行“添加到主屏幕”与一次 DeepSeek 真实流式会话验证。
- [ ] 发布后提供地址、安装步骤和 API Key 本地保存提示。
