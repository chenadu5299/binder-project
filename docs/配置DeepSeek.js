// 在开发者工具控制台直接粘贴执行此代码
// 这个文件可以作为参考，但直接在控制台执行可能还是会有路径问题

// 方法 1: 使用 window.__TAURI__ API（如果可用）
if (window.__TAURI__) {
    (async () => {
        try {
            await window.__TAURI__.core.invoke('ai_save_api_key', {
                provider: 'deepseek',
                key: 'sk-de7beef46f714ecfaa511acc98d9294a'
            });
            console.log('✅ DeepSeek API key 配置成功！');
        } catch (error) {
            console.error('❌ 配置失败:', error);
        }
    })();
} else {
    console.error('❌ Tauri API 不可用，请通过应用界面配置 API Key');
}

