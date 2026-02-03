import React, { useState, useEffect } from 'react';
import { ToolCall, ToolResult } from '../../types/tool';
import { 
    DocumentIcon, 
    PlusIcon, 
    PencilIcon, 
    TrashIcon, 
    FolderIcon,
    MagnifyingGlassIcon,
    CheckCircleIcon,
    XCircleIcon,
    ClockIcon,
    ArrowPathIcon
} from '@heroicons/react/24/outline';
import { invoke } from '@tauri-apps/api/core';
// import { emit } from '@tauri-apps/api/event'; // ⚠️ 已废弃：不再使用事件系统，统一使用 EditorStore
import { useFileStore } from '../../stores/fileStore';
import { useEditorStore } from '../../stores/editorStore';
import { documentService } from '../../services/documentService';
import { DocumentDiffView } from './DocumentDiffView';

interface ToolCallCardProps {
    toolCall: ToolCall;
    onResult?: (result: ToolResult) => void;
}

export const ToolCallCard: React.FC<ToolCallCardProps> = ({ toolCall, onResult }) => {
    const { currentWorkspace } = useFileStore();
    const { getActiveTab } = useEditorStore();
    const [isExecuting, setIsExecuting] = useState(false);
    const [showPreview, setShowPreview] = useState(false);
    const [showDiff, setShowDiff] = useState(false);
    const [oldContent, setOldContent] = useState<string | null>(null);
    
    // 当 AI 通过 create_file 或 update_file 成功创建/更新文件时，自动记录元数据（便于后续从文件树打开时进入编辑模式）
    useEffect(() => {
        const isCreateOrUpdate = toolCall.name === 'create_file' || toolCall.name === 'update_file';
        if (!isCreateOrUpdate || !toolCall.result?.success || !currentWorkspace) return;

        // 防御性解析：后端可能返回 data 为对象或 JSON 字符串
        let dataPath: string | undefined;
        const rawData = toolCall.result.data;
        if (typeof rawData === 'object' && rawData !== null && typeof rawData.path === 'string') {
            dataPath = rawData.path;
        } else if (typeof rawData === 'string') {
            try {
                const parsed = JSON.parse(rawData);
                dataPath = parsed?.path;
            } catch {
                dataPath = undefined;
            }
        }

        if (!dataPath) {
            console.log('[ToolCallCard] AI 文件操作成功但无 path，跳过元数据记录:', {
                name: toolCall.name,
                hasData: !!rawData,
                dataType: typeof rawData,
            });
            return;
        }

        (async () => {
            try {
                const { recordBinderFile } = await import('../../services/fileMetadataService');
                const { normalizePath, normalizeWorkspacePath, getAbsolutePath } = await import('../../utils/pathUtils');

                const normalizedPath = normalizePath(dataPath);
                const normalizedWorkspacePath = normalizeWorkspacePath(currentWorkspace);
                const filePath = getAbsolutePath(normalizedPath, normalizedWorkspacePath);

                console.log('[ToolCallCard] AI 创建/更新文件成功，记录元数据:', {
                    name: toolCall.name,
                    path: dataPath,
                    filePath,
                    workspace: normalizedWorkspacePath,
                });
                await recordBinderFile(filePath, 'ai_generated', normalizedWorkspacePath, 3);
                console.log('[ToolCallCard] 元数据记录成功，该文件从文件树打开时将进入编辑模式');
            } catch (error) {
                console.warn('[ToolCallCard] 自动记录文件元数据失败:', error);
            }
        })();
    }, [
        toolCall.name,
        toolCall.result?.success,
        toolCall.result?.data,
        currentWorkspace,
    ]);

    const getToolIcon = () => {
        switch (toolCall.name) {
            case 'read_file':
                return <DocumentIcon className="w-5 h-5" />;
            case 'create_file':
                return <PlusIcon className="w-5 h-5" />;
            case 'update_file':
                return <PencilIcon className="w-5 h-5" />;
            case 'delete_file':
                return <TrashIcon className="w-5 h-5" />;
            case 'list_files':
                return <FolderIcon className="w-5 h-5" />;
            case 'search_files':
                return <MagnifyingGlassIcon className="w-5 h-5" />;
            case 'move_file':
                return <ArrowPathIcon className="w-5 h-5" />;
            case 'rename_file':
                return <PencilIcon className="w-5 h-5" />;
            case 'create_folder':
                return <FolderIcon className="w-5 h-5" />;
            default:
                return <DocumentIcon className="w-5 h-5" />;
        }
    };

    const getToolName = () => {
        const names: Record<string, string> = {
            read_file: '读取文件',
            create_file: '创建文件',
            update_file: '更新文件',
            delete_file: '删除文件',
            list_files: '列出文件',
            search_files: '搜索文件',
            move_file: '移动文件',
            rename_file: '重命名文件',
            create_folder: '创建文件夹',
        };
        return names[toolCall.name] || toolCall.name;
    };

    const getStatusIcon = () => {
        switch (toolCall.status) {
            case 'completed':
                return <CheckCircleIcon className="w-5 h-5 text-green-500" />;
            case 'failed':
                return <XCircleIcon className="w-5 h-5 text-red-500" />;
            case 'executing':
                return <ArrowPathIcon className="w-5 h-5 text-blue-500 animate-spin" />;
            default:
                return <ClockIcon className="w-5 h-5 text-gray-400" />;
        }
    };

    const handleExecute = async () => {
        if (!currentWorkspace || isExecuting) return;

        // 处理 edit_current_editor_document - 直接应用到编辑器
        if (toolCall.name === 'edit_current_editor_document') {
            const activeTab = getActiveTab();
            if (!activeTab) {
                if (onResult) {
                    onResult({
                        success: false,
                        error: '编辑器中没有打开的文件',
                    });
                }
                return;
            }

            const newContent = toolCall.arguments.content as string;
            if (!newContent) {
                if (onResult) {
                    onResult({
                        success: false,
                        error: '缺少 content 参数',
                    });
                }
                return;
            }

            // 加载旧内容用于 Diff
            setOldContent(activeTab.content);
            setShowDiff(true);
            return;
        }

        // 对于 create_file 和 update_file，先加载旧内容用于 Diff
        if ((toolCall.name === 'create_file' || toolCall.name === 'update_file') && toolCall.arguments.path) {
            const filePath = toolCall.arguments.path as string;
            try {
                // 尝试读取旧文件内容
                const oldContentResult = await invoke<string>('read_file_content', {
                    workspacePath: currentWorkspace,
                    filePath,
                }).catch(() => null);
                
                if (oldContentResult !== null) {
                    setOldContent(oldContentResult);
                } else {
                    setOldContent(''); // 新文件，旧内容为空
                }
                
                // 显示 Diff 预览
                setShowDiff(true);
                return;
            } catch (error) {
                console.warn('读取旧文件内容失败，直接执行:', error);
            }
        }

        // 直接执行
        await executeTool();
    };
    
    const executeTool = async () => {
        if (!currentWorkspace || isExecuting) return;

        setIsExecuting(true);
        try {
            const result = await invoke<ToolResult>('execute_tool_with_retry', {
                toolCall: {
                    id: toolCall.id,
                    name: toolCall.name,
                    arguments: toolCall.arguments,
                },
                workspacePath: currentWorkspace,
                maxRetries: 3,
            });

            if (onResult) {
                onResult(result);
            }
            
            // 执行成功后关闭 Diff 预览
            setShowDiff(false);
        } catch (error) {
            console.error('执行工具调用失败:', error);
            if (onResult) {
                onResult({
                    success: false,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        } finally {
            setIsExecuting(false);
        }
    };
    
    const handleConfirmDiff = async (_level: 'paragraph' | 'document' | 'all', _paragraphId?: string) => {
        if (toolCall.name === 'edit_current_editor_document') {
            // ⚠️ 已更新：统一使用 EditorStore 更新编辑器（与 ChatMessages.tsx 保持一致）
            const activeTab = getActiveTab();
            if (activeTab) {
                const newContent = toolCall.arguments.content as string;
                
                try {
                    // 统一使用 EditorStore 更新（不再使用事件系统）
                    const { updateTabContent } = useEditorStore.getState();
                    updateTabContent(activeTab.id, newContent);

                    if (onResult) {
                        onResult({
                            success: true,
                            message: '文档已更新到编辑器',
                        });
                    }
                    setShowDiff(false);
                } catch (error) {
                    console.error('更新编辑器失败:', error);
                    if (onResult) {
                        onResult({
                            success: false,
                            error: '更新编辑器失败',
                        });
                    }
                }
            } else {
                if (onResult) {
                    onResult({
                        success: false,
                        error: '编辑器中没有打开的文件',
                    });
                }
            }
            return;
        }

        // 对于其他工具，继续原有逻辑
        await executeTool();
    };
    
    const handleRejectDiff = () => {
        setShowDiff(false);
        setOldContent(null);
    };

    const formatArguments = () => {
        const args = toolCall.arguments || {};
        if (toolCall.name === 'create_file' || toolCall.name === 'update_file' || toolCall.name === 'edit_current_editor_document') {
            const content = (args.content as string) || '';
            const preview = content && content.length > 200 ? content.substring(0, 200) + '...' : content;
            return {
                ...args,
                content: preview,
                fullContent: content,
            };
        }
        return args;
    };

    const formattedArgs = formatArguments();

    // 如果显示 Diff 预览，渲染 Diff 视图
    if (showDiff && oldContent !== null) {
        if (toolCall.name === 'edit_current_editor_document') {
            // 编辑当前编辑器文档
            const activeTab = getActiveTab();
            const filePath = activeTab?.filePath || '当前文档';
            const newContent = toolCall.arguments.content as string || '';

            return (
                <DocumentDiffView
                    oldContent={oldContent}
                    newContent={newContent}
                    filePath={filePath}
                    onConfirm={handleConfirmDiff}
                    onReject={handleRejectDiff}
                />
            );
        } else if (toolCall.name === 'create_file' || toolCall.name === 'update_file') {
            // 创建/更新文件
            const newContent = toolCall.arguments.content as string || '';
            const filePath = toolCall.arguments.path as string || '';

            return (
                <DocumentDiffView
                    oldContent={oldContent}
                    newContent={newContent}
                    filePath={filePath}
                    onConfirm={handleConfirmDiff}
                    onReject={handleRejectDiff}
                />
            );
        }
    }

    return (
        <div className="border border-gray-300 dark:border-gray-600 rounded-lg p-4 bg-gray-50 dark:bg-gray-800/50">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    {getToolIcon()}
                    <span className="font-medium text-sm text-gray-900 dark:text-gray-100">
                        {getToolName()}
                    </span>
                    {getStatusIcon()}
                </div>
                {toolCall.status === 'pending' && (
                    <button
                        onClick={handleExecute}
                        disabled={isExecuting}
                        className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                    >
                        {isExecuting ? '执行中...' : '执行'}
                    </button>
                )}
            </div>

            <div className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                <div className="space-y-1">
                    {formattedArgs && Object.keys(formattedArgs).length > 0 ? (
                        Object.entries(formattedArgs).map(([key, value]) => {
                            if (key === 'content' && (toolCall.name === 'create_file' || toolCall.name === 'update_file')) {
                                const contentValue = formattedArgs.fullContent || value || '';
                                return (
                                    <div key={key}>
                                        <span className="font-medium">{key}:</span>
                                        <div className="mt-1 p-2 bg-white dark:bg-gray-700 rounded text-xs font-mono whitespace-pre-wrap max-h-32 overflow-y-auto">
                                            {contentValue}
                                        </div>
                                        {formattedArgs.fullContent && formattedArgs.fullContent.length > 200 && (
                                            <button
                                                onClick={() => setShowPreview(!showPreview)}
                                                className="mt-1 text-blue-600 dark:text-blue-400 hover:underline"
                                            >
                                                {showPreview ? '收起' : '展开完整内容'}
                                            </button>
                                        )}
                                    </div>
                                );
                            }
                            return (
                                <div key={key}>
                                    <span className="font-medium">{key}:</span>{' '}
                                    <span className="text-gray-700 dark:text-gray-300">
                                        {value === null || value === undefined ? '(空)' : 
                                         typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
                                    </span>
                                </div>
                            );
                        })
                    ) : (
                        <div className="text-gray-500 dark:text-gray-400 italic">参数加载中...</div>
                    )}
                </div>
            </div>

            {toolCall.result && (
                <div className={`mt-3 p-2 rounded text-xs ${
                    toolCall.result.success
                        ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
                        : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
                }`}>
                    {toolCall.result.success ? (
                        <div>
                            <div className="font-medium">✅ 执行成功</div>
                            {toolCall.result.message && (
                                <div className="mt-1 text-sm">{toolCall.result.message}</div>
                            )}
                            {toolCall.result.data && (
                                <div className="mt-2">
                                    {/* list_files 工具的特殊显示 */}
                                    {toolCall.name === 'list_files' && toolCall.result.data.files && Array.isArray(toolCall.result.data.files) ? (
                                        <div>
                                            {toolCall.result.data.path && (
                                                <div className="text-sm mb-2">
                                                    <span className="font-medium">目录:</span> {toolCall.result.data.path}
                                                </div>
                                            )}
                                            <div className="mt-2">
                                                <div className="text-xs font-medium mb-2 text-gray-700 dark:text-gray-300">
                                                    文件列表 ({toolCall.result.data.files.length} 项):
                                                </div>
                                                <div className="max-h-60 overflow-y-auto bg-white dark:bg-gray-700 rounded p-2 border border-gray-200 dark:border-gray-600">
                                                    <div className="space-y-1">
                                                        {toolCall.result.data.files.map((file: any, index: number) => (
                                                            <div
                                                                key={index}
                                                                className="flex items-center gap-2 py-1 px-2 hover:bg-gray-100 dark:hover:bg-gray-600 rounded text-xs"
                                                            >
                                                                {file.is_directory ? (
                                                                    <FolderIcon className="w-4 h-4 text-blue-500 flex-shrink-0" />
                                                                ) : (
                                                                    <DocumentIcon className="w-4 h-4 text-gray-500 flex-shrink-0" />
                                                                )}
                                                                <span className="font-medium text-gray-900 dark:text-gray-100 flex-1 truncate">
                                                                    {file.name}
                                                                </span>
                                                                {file.path && file.path !== file.name && (
                                                                    <span className="text-gray-500 dark:text-gray-400 text-xs truncate max-w-xs">
                                                                        {file.path}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            {toolCall.result.data.path && (
                                                <div className="text-sm mb-1">
                                                    <span className="font-medium">路径:</span> {toolCall.result.data.path}
                                                </div>
                                            )}
                                            {toolCall.result.data.full_path && (
                                                <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                                                    完整路径: {toolCall.result.data.full_path}
                                                </div>
                                            )}
                                            {/* AI 创建文件后自动打开 */}
                                            {toolCall.name === 'create_file' && toolCall.result.data.path && currentWorkspace && (
                                                <div className="mt-2">
                                                    <button
                                                        onClick={async () => {
                                                            try {
                                                                const { normalizePath, normalizeWorkspacePath, getAbsolutePath } = await import('../../utils/pathUtils');
                                                                
                                                                // 规范化路径格式（确保与后端一致）
                                                                const normalizedPath = normalizePath(toolCall.result.data.path);
                                                                const normalizedWorkspacePath = normalizeWorkspacePath(currentWorkspace);
                                                                const filePath = getAbsolutePath(normalizedPath, normalizedWorkspacePath);
                                                                
                                                                // 记录文件为 AI 生成的文件（必须在打开文件之前完成）
                                                                try {
                                                                  const { recordBinderFile } = await import('../../services/fileMetadataService');
                                                                  // 同步等待元数据记录完成（带重试机制）
                                                                  await recordBinderFile(filePath, 'ai_generated', normalizedWorkspacePath, 3);
                                                                } catch (error) {
                                                                  console.warn('记录文件元数据失败（将使用显式 source 标记）:', error);
                                                                  // 即使元数据记录失败，仍然传递 source: 'ai_generated'，确保能进入编辑模式
                                                                }
                                                                // 显式传递 source: 'ai_generated'，确保进入编辑模式
                                                                console.log('[ToolCallCard] 打开AI创建的文件:', {
                                                                  filePath,
                                                                  source: 'ai_generated',
                                                                });
                                                                await documentService.openFile(filePath, { source: 'ai_generated' });
                                                            } catch (error) {
                                                                console.error('打开文件失败:', error);
                                                            }
                                                        }}
                                                        className="text-xs px-2 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
                                                    >
                                                        📂 在编辑器中打开
                                                    </button>
                                                </div>
                                            )}
                                            <details className="mt-1">
                                                <summary className="text-xs cursor-pointer text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200">
                                                    查看详细信息
                                                </summary>
                                                <div className="mt-1 p-2 bg-white dark:bg-gray-700 rounded font-mono text-xs max-h-40 overflow-y-auto">
                                                    {JSON.stringify(toolCall.result.data, null, 2)}
                                                </div>
                                            </details>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                    ) : (
                        <div>
                            <div className="font-medium">❌ 执行失败</div>
                            {toolCall.result.error && (
                                <div className="mt-1 text-sm">{toolCall.result.error}</div>
                            )}
                            {toolCall.result.data && (
                                <details className="mt-1">
                                    <summary className="text-xs cursor-pointer text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200">
                                        查看详细信息
                                    </summary>
                                    <div className="mt-1 p-2 bg-white dark:bg-gray-700 rounded font-mono text-xs max-h-40 overflow-y-auto">
                                        {JSON.stringify(toolCall.result.data, null, 2)}
                                    </div>
                                </details>
                            )}
                        </div>
                    )}
                </div>
            )}

            {toolCall.error && (
                <div className="mt-3 p-2 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded text-xs">
                    <div className="font-medium">错误:</div>
                    <div className="mt-1">{toolCall.error}</div>
                </div>
            )}
        </div>
    );
};

