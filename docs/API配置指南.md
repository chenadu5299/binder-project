# DeepSeek API Key 配置指南

## 🎯 快速配置方法

### 方法 1：通过应用界面配置（推荐）⭐

1. **打开应用后，在欢迎界面点击「配置 API Key（使用 AI 功能）」按钮**
2. 在弹出的配置对话框中：
   - 找到「DeepSeek API Key」输入框
   - 输入你的 API key：`sk-de7beef46f714ecfaa511acc98d9294a`
   - 点击「保存 DeepSeek Key」按钮
3. 看到「DeepSeek API key 已保存」提示即表示配置成功

### 方法 2：通过开发者工具控制台配置（如果界面不工作）

**注意**：由于 Tauri 2.x 的模块路径限制，控制台中的动态导入可能失败。**强烈推荐使用方法 1（应用界面）**。

如果界面不工作，可以尝试：
1. 重启应用后重试方法 1
2. 或者检查应用日志中的错误信息

如果必须使用控制台，可以尝试：
```javascript
// 注意：这可能在控制台中失败，因为动态导入路径问题
(async () => {
    try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('ai_save_api_key', {
            provider: 'deepseek',
            key: 'sk-de7beef46f714ecfaa511acc98d9294a'
        });
        console.log('✅ DeepSeek API key 配置成功！');
    } catch (error) {
        console.error('❌ 配置失败，请使用应用界面配置:', error);
    }
})();
```

### 方法 3：自动配置脚本

创建一个测试脚本，在应用启动时自动配置（仅用于开发测试）

## ✅ 验证配置是否成功

配置完成后，可以通过以下方式验证：

1. **测试自动补全**
   - 打开一个文档
   - 输入文字后，光标停留 7 秒
   - 如果看到幽灵文字出现，说明配置成功

2. **测试聊天功能**
   - 切换到右侧面板的「AI 聊天」标签
   - 发送一条消息
   - 如果收到 AI 回复，说明配置成功

3. **查看配置状态**
   - 在开发者工具控制台执行：
   ```javascript
   const { invoke } = await import('@tauri-apps/api/core');
   const key = await invoke('ai_get_api_key', { provider: 'deepseek' });
   console.log('当前配置的 DeepSeek Key:', key ? '已配置 ✅' : '未配置 ❌');
   ```

## 🔑 关于 API Key

- **DeepSeek API Key**：`sk-de7beef46f714ecfaa511acc98d9294a`
- **存储位置**：API keys 使用系统密钥链（Keychain）安全存储
- **安全性**：keys 不会保存在代码中，不会泄露

## 🚀 配置后的功能

配置 API key 后，你可以使用：

- ✅ **自动补全**：光标停留 7 秒后自动续写
- ✅ **Inline Assist**：选中文本后按 Cmd+K 快速修改
- ✅ **AI 聊天**：完整的对话功能
- ✅ **模型切换**：在聊天窗口选择不同的 AI 模型

## ❓ 常见问题

### Q: 配置后 AI 功能还是不工作？
A: 检查以下几点：
1. API key 是否正确保存（使用验证方法检查）
2. 网络连接是否正常
3. 查看控制台是否有错误信息

### Q: 可以同时配置多个 API key 吗？
A: 可以！你可以同时配置：
- DeepSeek API key（推荐，性价比高）
- OpenAI API key（功能更强大）

应用会根据你选择的模型自动使用对应的 API key。

### Q: API key 存储在哪里？
A: API keys 存储在系统的密钥链中：
- macOS: Keychain Access
- Windows: Credential Manager
- Linux: Secret Service

完全安全，不会泄露。

## 📝 下一步

配置完成后，开始测试：
1. ✅ 自动补全功能
2. ✅ Inline Assist 功能
3. ✅ AI 聊天功能
4. ✅ 模型切换

祝使用愉快！🚀

