// 在开发者工具控制台直接粘贴执行此代码

(async () => {
    try {
        // 动态导入 Tauri API
        const { invoke } = await import('@tauri-apps/api/core');
        
        // 配置 DeepSeek API key
        await invoke('ai_save_api_key', {
            provider: 'deepseek',
            key: 'sk-de7beef46f714ecfaa511acc98d9294a'
        });
        
        console.log('✅ DeepSeek API key 配置成功！');
        console.log('现在可以使用所有 AI 功能了：');
        console.log('  - 自动补全（光标停留 7 秒）');
        console.log('  - Inline Assist（选中文本后按 Cmd+K）');
        console.log('  - AI 聊天（右侧面板）');
        
        // 验证配置
        const savedKey = await invoke('ai_get_api_key', { provider: 'deepseek' });
        console.log('验证：', savedKey ? 'API key 已保存 ✅' : 'API key 未保存 ❌');
    } catch (error) {
        console.error('❌ 配置失败:', error);
    }
})();

