import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { KeyIcon, EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline';
import ThemeSelector from './ThemeSelector';

interface APIKeyConfigProps {
    onClose?: () => void;
}

const APIKeyConfig: React.FC<APIKeyConfigProps> = ({ onClose }) => {
    const [providers, setProviders] = useState({
        openai: '',
        deepseek: '',
    });
    const [showKeys, setShowKeys] = useState({
        openai: false,
        deepseek: false,
    });
    const [isLoading, setIsLoading] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    // 加载已保存的 API keys
    useEffect(() => {
        const loadKeys = async () => {
            try {
                const [openaiKey, deepseekKey] = await Promise.all([
                    invoke<string | null>('ai_get_api_key', { provider: 'openai' }).catch(() => null),
                    invoke<string | null>('ai_get_api_key', { provider: 'deepseek' }).catch(() => null),
                ]);

                setProviders({
                    openai: openaiKey || '',
                    deepseek: deepseekKey || '',
                });
            } catch (error) {
                console.error('加载 API keys 失败:', error);
            }
        };

        loadKeys();
    }, []);

    const handleSave = async (provider: 'openai' | 'deepseek') => {
        const key = providers[provider].trim();
        if (!key) {
            setMessage({ type: 'error', text: '请输入 API key' });
            return;
        }

        setIsLoading(true);
        setMessage(null);

        try {
            await invoke('ai_save_api_key', {
                provider,
                key,
            });

            const providerName = provider === 'openai' ? 'OpenAI' : 'DeepSeek';
            setMessage({ type: 'success', text: `${providerName} API key 已保存！现在可以使用 AI 功能了 🎉` });
            
            // 重新加载 keys 以更新显示
            const savedKey = await invoke<string | null>('ai_get_api_key', { provider });
            setProviders(prev => ({
                ...prev,
                [provider]: savedKey || prev[provider],
            }));
            
            // 5 秒后清除消息
            setTimeout(() => {
                setMessage(null);
            }, 5000);
        } catch (error) {
            console.error('保存 API key 失败:', error);
            setMessage({
                type: 'error',
                text: `保存失败: ${error instanceof Error ? error.message : String(error)}`,
            });
        } finally {
            setIsLoading(false);
        }
    };

    const toggleShowKey = (provider: 'openai' | 'deepseek') => {
        setShowKeys(prev => ({
            ...prev,
            [provider]: !prev[provider],
        }));
    };

    return (
        <div className="p-6 bg-white dark:bg-gray-800 rounded-lg shadow-lg max-w-md w-full">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                    <KeyIcon className="w-5 h-5" />
                    API Key 配置
                </h3>
                {onClose && (
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                    >
                        ✕
                    </button>
                )}
            </div>

            {message && (
                <div
                    className={`mb-4 p-3 rounded-lg ${
                        message.type === 'success'
                            ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                            : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
                    }`}
                >
                    {message.text}
                </div>
            )}

            <div className="space-y-4">
                {/* DeepSeek */}
                <div>
                    <label className="block text-sm font-medium mb-2">
                        DeepSeek API Key（推荐，性价比高）
                    </label>
                    <div className="relative">
                        <input
                            type={showKeys.deepseek ? 'text' : 'password'}
                            value={providers.deepseek}
                            onChange={(e) =>
                                setProviders(prev => ({ ...prev, deepseek: e.target.value }))
                            }
                            placeholder="sk-..."
                            className="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg 
                                     focus:outline-none focus:ring-2 focus:ring-blue-500
                                     bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                        />
                        <button
                            type="button"
                            onClick={() => toggleShowKey('deepseek')}
                            className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        >
                            {showKeys.deepseek ? (
                                <EyeSlashIcon className="w-5 h-5" />
                            ) : (
                                <EyeIcon className="w-5 h-5" />
                            )}
                        </button>
                    </div>
                    <button
                        onClick={() => handleSave('deepseek')}
                        disabled={isLoading || !providers.deepseek.trim()}
                        className="mt-2 px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 
                                 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isLoading ? '保存中...' : '保存 DeepSeek Key'}
                    </button>
                </div>

                {/* OpenAI */}
                <div>
                    <label className="block text-sm font-medium mb-2">
                        OpenAI API Key
                    </label>
                    <div className="relative">
                        <input
                            type={showKeys.openai ? 'text' : 'password'}
                            value={providers.openai}
                            onChange={(e) =>
                                setProviders(prev => ({ ...prev, openai: e.target.value }))
                            }
                            placeholder="sk-..."
                            className="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg 
                                     focus:outline-none focus:ring-2 focus:ring-blue-500
                                     bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                        />
                        <button
                            type="button"
                            onClick={() => toggleShowKey('openai')}
                            className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        >
                            {showKeys.openai ? (
                                <EyeSlashIcon className="w-5 h-5" />
                            ) : (
                                <EyeIcon className="w-5 h-5" />
                            )}
                        </button>
                    </div>
                    <button
                        onClick={() => handleSave('openai')}
                        disabled={isLoading || !providers.openai.trim()}
                        className="mt-2 px-4 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 
                                 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isLoading ? '保存中...' : '保存 OpenAI Key'}
                    </button>
                </div>
            </div>

            <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-sm text-blue-700 dark:text-blue-400">
                <p className="font-semibold mb-1">💡 提示：</p>
                <ul className="list-disc list-inside space-y-1 text-xs">
                    <li>API keys 使用系统密钥链安全存储</li>
                    <li>至少配置一个 API key 才能使用 AI 功能</li>
                    <li>DeepSeek 性价比更高，适合日常使用</li>
                </ul>
            </div>

            {/* 主题选择器 */}
            <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
                <ThemeSelector />
            </div>
        </div>
    );
};

export default APIKeyConfig;

