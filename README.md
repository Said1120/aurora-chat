# Aurora Chat

Aurora Chat 是一个跨平台、可安装的个人 AI 聊天 PWA，可在 iPad、手机和桌面浏览器中使用。它是本地优先的：对话、角色、服务商配置和 API Key 都保存在当前设备的浏览器数据库中，不会写入源代码、GitHub 或中转服务。

网站：<https://said1120.github.io/aurora-chat/>

## 支持的服务商

可分别配置并切换以下六家服务商的 API：

- DeepSeek
- Kimi（月之暗面）
- MiMo（小米）
- 硅基流动
- 智谱 GLM
- 通义千问（阿里云百炼）

也可以添加其他 OpenAI Chat Completions 兼容服务。各服务商的 API Key 和用量由用户自行向相应服务商开通、计费；GitHub Pages 只负责免费托管静态前端，并不提供或代付任何模型 API。

## 使用与数据安全

在任意受支持的浏览器中打开网站，进入“设置”后选择服务商、填写自己的 API Key 并保存，即可新建对话。iPad 上可通过 Safari 的“添加到主屏幕”安装为应用；其他设备可使用浏览器提供的 PWA 安装入口。

数据默认留在本机。请不要在共享设备上保存 API Key，并定期导出备份。导出的 `.aurora` 备份使用用户设置的备份密码在本机以 AES-GCM 加密；密码不会保存到文件或发送到网络。导入时同样在本机解密和预览，再选择合并或替换现有数据。

## 设备迁移

“一次性传输码”用于在两台设备之间迁移加密备份：发送端先在本机加密，二维码/链接只携带随机传输 ID 和密钥。密钥位于链接片段中，不会发给中转服务；中转 Worker 只会收到密文，永远不会收到聊天明文、API Key、备份密码或传输密钥。

临时传输有严格限制：单个密文包最大 20 MB、成功领取后立即删除且不能再次领取、未领取的包在 15 分钟后过期。创建传输需要 Turnstile 验证。若未配置临时传输服务，仍可使用加密文件备份在设备间迁移。

## MCP 边界

目前不直接运行 MCP 工具。未来可以集成远程 HTTP/SSE MCP；本地 stdio MCP 需要一个由用户自行运行的伴随网关，浏览器不能直接启动或连接本机 stdio 进程。任何后续工具调用仍应保留明确的用户确认和最小权限边界。

## 本地开发与验证

```bash
npm install
npm test
npm run lint
npm run build
```

构建会输出静态站点到 `out/`，并保留 `/aurora-chat` 基路径。

## 发布 GitHub Pages 与临时传输服务

静态前端发布命令如下，保持 GitHub Pages 的 `gh-pages` 分支发布方式：

```bash
npm run deploy:pages
```

临时传输 Worker 需要由 Cloudflare 账户所有者完成以下首次配置；不要将任何密钥或传输链接提交到仓库：

```bash
npx wrangler login
npx wrangler r2 bucket create aurora-chat-transfers
npx wrangler secret put TURNSTILE_SECRET_KEY --config workers/transfer/wrangler.jsonc
npm --prefix workers/transfer run deploy
```

Worker 的 `wrangler.jsonc` 已声明 R2、Turnstile 密钥绑定和 Durable Object。首次部署必须应用其中 `v1` 的 Durable Object migration；它为原子化的一次性领取门提供存储类，缺少该 migration 会破坏“仅能领取一次”的安全保证。今后若变更 Durable Object 类，也必须先在同一配置中声明相应 migration，再部署 Worker。

部署 Worker 后，将返回的 Worker URL 和公开的 Turnstile site key 作为 GitHub Pages 构建变量 `NEXT_PUBLIC_TRANSFER_SERVICE_URL` 与 `NEXT_PUBLIC_TURNSTILE_SITE_KEY` 配置，然后重新构建并运行 `npm run deploy:pages`。这两个变量仅用于浏览器连接 Worker 和加载 Turnstile；不要把 API Key、备份密码、Turnstile secret 或传输密钥放入构建变量。

发布后应从 `https://said1120.github.io/aurora-chat/` 验证站点返回 200，并以两台设备完成一次迁移：接收端能恢复加密备份，第二次领取失败。还应确认 Worker 的 CORS 预检只允许 `https://said1120.github.io`。
