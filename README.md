# Aurora Chat

一个为 iPad 设计的个人 AI 聊天工具。它可直接连接 DeepSeek 或其他 OpenAI 兼容 API，并在当前设备保存对话、角色和设置。

## 在 iPad 上使用

1. 用 iPad 的 Safari 打开部署地址。
2. 点击浏览器底部的“分享”按钮。
3. 选择“添加到主屏幕”，确认名称后点击“添加”。
4. 从主屏幕打开 Aurora Chat，进入右侧“设置”。
5. 填入 DeepSeek API Key，保留默认地址 `https://api.deepseek.com` 和模型 `deepseek-chat`，点击“保存连接设置”。
6. 新建对话后即可开始聊天。

建议首次设置完成后，在“设置”中点击“导出全部数据”保存一份 JSON 备份。iPad 的浏览器储存可能被系统清理，备份可以在新设备上通过“导入备份”恢复。

## 当前功能

- 可安装的 iPad PWA，支持横屏、竖屏和分屏。
- DeepSeek / OpenAI 兼容 API 的流式聊天与停止生成。
- AI 角色、头像、系统提示词和快捷表情。
- 本机对话保存、置顶、自动标题与复制回答。
- JSON 导入导出。
- 为将来的图片、贴纸和 MCP 工具调用预留消息结构与安全确认边界。

## 本地开发

```bash
npm install
npm test
npm run build
```

API Key 只保存在当前设备的浏览器数据库中。不要在共享设备上保存密钥。
