# Aurora Chat

一个完全独立、为 iPad 设计的个人 AI 聊天工具。它通过 GitHub Pages 免费发布，可直接连接 DeepSeek 或其他 OpenAI 兼容 API，并在当前设备保存对话、角色和设置。

独立网址：<https://said1120.github.io/aurora-chat/>

## 在 iPad 上使用

1. 用 iPad 的 Safari 打开 <https://said1120.github.io/aurora-chat/>。
2. 点击浏览器的“分享”按钮。
3. 选择“添加到主屏幕”，确认名称后点击“添加”。
4. 从主屏幕打开 Aurora Chat，进入“设置”。
5. 填入 DeepSeek API Key，保留默认地址 `https://api.deepseek.com` 和模型 `deepseek-chat`，点击“保存连接设置”。
6. 新建对话后即可开始聊天。

建议首次设置完成后，在“设置”中点击“导出全部数据”保存一份 JSON 备份。iPad 的浏览器储存可能被系统清理，备份可以在新设备上通过“导入备份”恢复。

## 当前功能

- 可安装的 iPad PWA，支持横屏、竖屏和分屏。
- DeepSeek / OpenAI 兼容 API 的流式聊天与停止生成。
- AI 角色、头像、系统提示词和快捷表情。
- 本地对话保存、置顶、自动标题与复制回答。
- JSON 导入导出。
- 为将来的图片、贴纸和 MCP 工具调用预留消息结构与安全确认边界。

## 本地开发

```bash
npm install
npm test
npm run build
```

## 发布方式

运行 `npm run deploy:pages` 会生成纯静态 PWA 并发布到仓库的 `gh-pages` 分支。GitHub Pages 从这个分支提供独立网站，不依赖 ChatGPT、Cloudflare、Vercel 或其他登录入口。

API Key 不会写入源代码或 GitHub，只保存在当前设备的浏览器数据库中。不要在共享设备上保存密钥。
