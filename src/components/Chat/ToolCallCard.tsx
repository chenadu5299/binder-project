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
import {
  useDiffStore,
  makeWorkspacePendingToolCallId,
  preApplySnapshotGatesForAccept,
  userVisibleMessageForSnapshotGate,
} from '../../stores/diffStore';
import { applyDiffReplaceInEditor } from '../../utils/applyDiffReplaceInEditor';
import { blockRangeToPMRange, positionToLine } from '../../utils/editorOffsetUtils';
import { getAbsolutePath, normalizePath, normalizeWorkspacePath } from '../../utils/pathUtils';
import { DiffCard } from './DiffCard';
import { FileDiffCard } from './FileDiffCard';
import type { FileDiffEntry } from '../../stores/diffStore';
import { toast } from '../Common/Toast';
import { AgentShadowStateSummary } from './AgentShadowStateSummary';
import {
    markAgentInvalidated,
    markAgentStageComplete,
    markAgentUserConfirmed,
} from '../../utils/agentShadowLifecycle';

interface ToolCallCardProps {
    toolCall: ToolCall;
    /** 当前聊天 tab，用于 diff 归属与底部批量操作作用域 */
    chatTabId?: string;
    /** 助手消息 id（生命周期与「最后一条助手」批量） */
    messageId?: string;
    onResult?: (result: ToolResult) => void;
}

export const ToolCallCard: React.FC<ToolCallCardProps> = ({ toolCall, chatTabId, messageId, onResult }) => {
    const { currentWorkspace } = useFileStore();
    const { updateTabContent } = useEditorStore();
    useDiffStore((s) => s.byFilePath); // 订阅以在 update_file 接受/拒绝后重新渲染
    useDiffStore((s) => s.byTab);
    const [isExecuting, setIsExecuting] = useState(false);
    const [showPreview, setShowPreview] = useState(false);
    const [showDiff, setShowDiff] = useState(false);
    const [oldContent, setOldContent] = useState<string | null>(null);
    
    // edit_current_editor_document 的 diff 同步只保留 ChatPanel（流式）单一路径。
    // ToolCallCard 不再参与，避免并发写入同一 byTab[filePath]。

    // update_file 返回 pending_diffs 时，确保写入 byFilePath（与 ChatPanel 一致，避免首次渲染时无数据）
    useEffect(() => {
        if (toolCall.name !== 'update_file' || !toolCall.result?.success || !currentWorkspace) return;
        const rawData = toolCall.result.data;
        const data = typeof rawData === 'object' && rawData !== null
            ? rawData
            : typeof rawData === 'string'
                ? (() => { try { return JSON.parse(rawData); } catch { return {}; } })()
                : {};
        const pendingDiffsRaw = data.pending_diffs;
        const pathFromResult = data.path;
        if (Array.isArray(pendingDiffsRaw) && pendingDiffsRaw.length > 0 && pathFromResult) {
            const filePath = getAbsolutePath(normalizePath(pathFromResult), normalizeWorkspacePath(currentWorkspace));
            const normalized = pendingDiffsRaw.map((p: Record<string, unknown>) => ({
                id: p.id ?? 0,
                file_path: p.file_path ?? pathFromResult,
                diff_index: p.diff_index ?? 0,
                original_text: p.original_text ?? '',
                new_text: p.new_text ?? '',
                para_index: p.para_index ?? 0,
                diff_type: p.diff_type ?? 'replace',
                status: p.status ?? 'pending',
            } as FileDiffEntry));
            useDiffStore.getState().setFilePathDiffs(filePath, normalized, {
                chatTabId,
                sourceToolCallId: toolCall.id,
                ...(messageId != null ? { messageId } : {}),
                ...(toolCall.agentTaskId != null ? { agentTaskId: toolCall.agentTaskId } : {}),
            });
            const tab = useEditorStore.getState().tabs.find((t) => t.filePath === filePath);
            if (tab?.editor?.state?.doc) {
                useDiffStore.getState().resolveFilePathDiffs(filePath, tab.editor.state.doc);
            }
        }
    }, [toolCall.name, toolCall.id, toolCall.result?.success, toolCall.result?.data, currentWorkspace, chatTabId, messageId]);

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

        // 旧的 edit_current_editor_document 直接应用 / 预览路径已禁用。
        if (toolCall.name === 'edit_current_editor_document') {
            if (onResult) {
                onResult({
                    success: false,
                    error: '旧版 ToolCallCard 编辑路径已禁用',
                });
            }
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
            if (onResult) {
                onResult({
                    success: false,
                    error: '旧版 ToolCallCard 编辑确认路径已禁用',
                });
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

    // Phase 3：update_file 返回 pending_diffs 时，逐条显示 DiffCard/FileDiffCard（全部接受/拒绝由 DiffAllActionsBar 统一处理）
    if (toolCall.name === 'update_file' && toolCall.result?.success && currentWorkspace) {
        const rawData = toolCall.result.data;
        const data = typeof rawData === 'object' && rawData !== null
            ? rawData
            : typeof rawData === 'string'
                ? (() => { try { return JSON.parse(rawData); } catch { return {}; } })()
                : {};
        const pendingDiffsRaw = data.pending_diffs;
        const pathFromResult = data.path;
        if (Array.isArray(pendingDiffsRaw) && pendingDiffsRaw.length > 0 && pathFromResult) {
            const filePath = getAbsolutePath(normalizePath(pathFromResult), normalizeWorkspacePath(currentWorkspace));
            const workspacePath = normalizeWorkspacePath(currentWorkspace);
            const tab = useEditorStore.getState().tabs.find((t) => t.filePath === filePath);
            const workspaceToolCallId = makeWorkspacePendingToolCallId(filePath, toolCall.id);
            const resolvedDisplayDiffs = tab ? useDiffStore.getState().getDisplayDiffs(tab.filePath, workspaceToolCallId) : [];
            const diffStore = useDiffStore.getState();
            const fileEntries = useDiffStore.getState().byFilePath[filePath];
            const isCleared = useDiffStore.getState().isFileDiffsCleared(filePath);

            // 已全部处理（接受/拒绝后）：显示已应用
            if (isCleared) {
                return (
                    <div className="mt-2 w-full p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg">
                        <p className="text-xs text-green-700 dark:text-green-300">修改已应用。如需撤销可编辑文档后手动恢复。</p>
                    </div>
                );
            }

            // 优先使用 resolved 的 DiffEntry（文件已打开且 resolve 成功）
            if (resolvedDisplayDiffs.length > 0 && tab?.editor) {
                const doc = tab.editor.state.doc;
                return (
                    <div className="mt-2 w-full space-y-2 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                        {resolvedDisplayDiffs.map((entry) => {
                            const entryBrOpts = {
                                occurrenceIndex: entry.occurrenceIndex,
                                originalTextFallback: entry.originalText,
                            };
                            const range =
                                entry.mappedFrom != null && entry.mappedTo != null
                                    ? { from: entry.mappedFrom, to: entry.mappedTo }
                                    : entry.status === 'accepted' && entry.acceptedFrom != null && entry.acceptedTo != null
                                      ? { from: entry.acceptedFrom, to: entry.acceptedTo }
                                      : blockRangeToPMRange(
                                            doc,
                                            entry.startBlockId,
                                            entry.startOffset,
                                            entry.endBlockId,
                                            entry.endOffset,
                                            entryBrOpts
                                        );
                            const lineStart = range ? positionToLine(doc, range.from) : undefined;
                            const lineEnd = range ? positionToLine(doc, Math.max(range.from, range.to - 1)) : undefined;
                            return (
                                <DiffCard
                                    key={entry.diffId}
                                    diff={entry}
                                    chatTabId={chatTabId}
                                    filePath={filePath}
                                    workspacePath={workspacePath}
                                    lineStart={lineStart}
                                    lineEnd={lineEnd}
                                    onLocate={range ? () => {
                                        const { tabs, setActiveTab } = useEditorStore.getState();
                                        const t = tabs.find((tb) => tb.filePath === filePath);
                                        if (t) {
                                            setActiveTab(t.id);
                                            if (t.editor) {
                                                try {
                                                    const { node } = t.editor.view.domAtPos(Math.min(range.from, t.editor.state.doc.content.size - 1));
                                                    const el = node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element);
                                                    if (el && el instanceof HTMLElement) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                                } catch {
                                                    useEditorStore.getState().setPendingScrollTo(t.id, range.from, range.to);
                                                }
                                            } else {
                                                useEditorStore.getState().setPendingScrollTo(t.id, range.from, range.to);
                                            }
                                        } else {
                                            documentService.openFile(filePath).then(() => {
                                                const tt = useEditorStore.getState().tabs.find((tb) => tb.filePath === filePath);
                                                if (tt) useEditorStore.getState().setPendingScrollTo(tt.id, range.from, range.to);
                                            });
                                        }
                                    } : undefined}
                                    onAccept={async () => {
                                        const editor = tab.editor;
                                        if (!editor) return;
                                        const tabRev = tab.documentRevision ?? 1;
                                        const gate = await preApplySnapshotGatesForAccept(entry, editor, tabRev, tab.filePath);
                                        if (gate) {
                                            diffStore.updateDiff(tab.filePath, entry.diffId, {
                                                status: 'expired',
                                                expireReason: gate,
                                            });
                                            markAgentInvalidated(chatTabId ?? '', entry.agentTaskId ?? toolCall.agentTaskId, gate);
                                            toast.warning(userVisibleMessageForSnapshotGate(gate));
                                            return;
                                        }
                                        const r = entry.mappedFrom != null && entry.mappedTo != null
                                            ? { from: entry.mappedFrom, to: entry.mappedTo }
                                            : blockRangeToPMRange(
                                                  editor.state.doc,
                                                  entry.startBlockId,
                                                  entry.startOffset,
                                                  entry.endBlockId,
                                                  entry.endOffset,
                                                  entryBrOpts
                                              );
                                        if (!r) {
                                            diffStore.updateDiff(tab.filePath, entry.diffId, {
                                                status: 'expired',
                                                expireReason: 'block_resolve_failed',
                                            });
                                            markAgentInvalidated(chatTabId ?? '', entry.agentTaskId ?? toolCall.agentTaskId, 'block_resolve_failed');
                                            return;
                                        }
                                        const currentText = editor.state.doc.textBetween(r.from, r.to);
                                        if (currentText !== entry.originalText) {
                                            diffStore.updateDiff(tab.filePath, entry.diffId, {
                                                status: 'expired',
                                                expireReason: 'original_text_mismatch',
                                            });
                                            markAgentInvalidated(chatTabId ?? '', entry.agentTaskId ?? toolCall.agentTaskId, 'original_text_mismatch');
                                            toast.warning('修改建议已失效：文档内容已被修改，无法应用此处的 AI 建议');
                                            return;
                                        }
                                        const ins = applyDiffReplaceInEditor(editor, r, entry.newText);
                                        if (!ins) {
                                            diffStore.updateDiff(tab.filePath, entry.diffId, {
                                                status: 'expired',
                                                expireReason: 'apply_replace_failed',
                                            });
                                            markAgentInvalidated(chatTabId ?? '', entry.agentTaskId ?? toolCall.agentTaskId, 'apply_replace_failed');
                                            return;
                                        }
                                        diffStore.acceptDiff(tab.filePath, entry.diffId, {
                                            from: ins.insertFrom,
                                            to: ins.insertTo,
                                        });
                                        updateTabContent(tab.id, editor.getHTML());
                                        markAgentUserConfirmed(chatTabId ?? '', entry.agentTaskId ?? toolCall.agentTaskId, 'tool_card_accept_confirmed');
                                        if (entry.fileDiffIndex != null) {
                                            (async () => {
                                                try {
                                                    await diffStore.acceptFileDiffs(filePath, currentWorkspace, [entry.fileDiffIndex!]);
                                                    markAgentStageComplete(chatTabId ?? '', entry.agentTaskId ?? toolCall.agentTaskId, 'workspace_file_written');
                                                    toast.success('已应用修改并写入文件');
                                                } catch (e) {
                                                    toast.error(`接受失败: ${e instanceof Error ? e.message : String(e)}`);
                                                }
                                            })();
                                        } else {
                                            markAgentStageComplete(chatTabId ?? '', entry.agentTaskId ?? toolCall.agentTaskId, 'editor_revision_advanced');
                                        }
                                    }}
                                    onReject={() => {
                                        if (entry.fileDiffIndex != null) {
                                            diffStore.removeFileDiffEntry(filePath, entry.fileDiffIndex);
                                            diffStore.rejectDiff(tab.filePath, entry.diffId);
                                        } else {
                                            diffStore.rejectDiff(tab.filePath, entry.diffId);
                                        }
                                        tab.editor?.view.dispatch(tab.editor.state.tr);
                                    }}
                                />
                            );
                        })}
                    </div>
                );
            }

            // 未 resolve 且无 fileEntries：可能尚未同步，用 result 数据兜底
            const entriesToShow = fileEntries?.length
                ? fileEntries
                : pendingDiffsRaw.map((p: Record<string, unknown>) => ({
                    id: p.id ?? 0,
                    file_path: p.file_path ?? pathFromResult,
                    diff_index: p.diff_index ?? 0,
                    original_text: p.original_text ?? '',
                    new_text: p.new_text ?? '',
                    para_index: p.para_index ?? 0,
                    diff_type: p.diff_type ?? 'replace',
                    status: p.status ?? 'pending',
                } as FileDiffEntry));

            if (entriesToShow.length === 0) return null;

            // 未 resolve 或文件未打开：使用 FileDiffCard
            return (
                <div className="mt-2 w-full space-y-2 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                    {entriesToShow.map((entry, idx) => (
                        <FileDiffCard
                            key={`${entry.id}-${entry.diff_index}`}
                            entry={entry}
                            chatTabId={chatTabId}
                            filePath={filePath}
                            workspacePath={workspacePath}
                            index={idx}
                            onAccept={async () => {
                                try {
                                    await diffStore.acceptFileDiffs(filePath, currentWorkspace, [entry.diff_index]);
                                    markAgentUserConfirmed(chatTabId ?? '', entry.agentTaskId ?? toolCall.agentTaskId, 'file_diff_accept_confirmed');
                                    markAgentStageComplete(chatTabId ?? '', entry.agentTaskId ?? toolCall.agentTaskId, 'workspace_file_written');
                                    toast.success('已应用修改并写入文件');
                                } catch (e) {
                                    toast.error(`接受失败: ${e instanceof Error ? e.message : String(e)}`);
                                }
                            }}
                            onReject={() => diffStore.removeFileDiffEntry(filePath, entry.diff_index)}
                            onRetryResolve={
                                tab?.editor?.state?.doc
                                    ? () => {
                                        const doc = tab.editor!.state.doc;
                                        const r = diffStore.retryResolveFilePathDiffs(filePath, doc);
                                        if ((import.meta as any).env?.DEV) {
                                          console.debug('[FileDiffCard] retry resolve', r);
                                        }
                                        if (r.resolved > 0) {
                                          useEditorStore.getState().setPendingScrollTo(tab.id, 0, 0);
                                        }
                                      }
                                    : undefined
                            }
                            onLocate={tab ? () => {
                                const { setActiveTab } = useEditorStore.getState();
                                setActiveTab(tab.id);
                                documentService.openFile(filePath).then(() => {
                                    const t = useEditorStore.getState().tabs.find((tb) => tb.filePath === filePath);
                                    if (t) {
                                        const resolved = diffStore.resolveFilePathDiffs(filePath, t.editor!.state.doc);
                                        if (resolved.resolved > 0) useEditorStore.getState().setPendingScrollTo(t.id, 0, 0);
                                    }
                                });
                            } : () => documentService.openFile(filePath)}
                        />
                    ))}
                </div>
            );
        }
    }

    // edit_current_editor_document 的旧 ToolCallCard 渲染路径已禁用。
    // 权威渲染入口只保留 ChatMessages contentBlocks。
    if (toolCall.name === 'edit_current_editor_document' && toolCall.result?.success) {
        return (
            <div className="mt-2 w-full p-3 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-600 rounded-lg">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                    旧版 ToolCallCard 对话编辑预览已禁用；请以聊天消息中的规范 diff 卡为准。
                </p>
            </div>
        );
    }

    // 如果显示 Diff 预览，渲染 Diff 视图（create_file / update_file 用 DocumentDiffView；edit_current_editor_document 用简单 fallback）
    if (showDiff && oldContent !== null) {
        if (toolCall.name === 'create_file' || toolCall.name === 'update_file') {
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

            {chatTabId && (
                <div className="mb-3">
                    <AgentShadowStateSummary chatTabId={chatTabId} compact />
                </div>
            )}

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
                            {toolCall.result.meta && (
                                <div className="mt-1.5 flex flex-wrap gap-1.5">
                                    {toolCall.result.meta.gate?.status && (
                                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                            toolCall.result.meta.gate.status === 'candidate_ready' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                                            : toolCall.result.meta.gate.status === 'no_op' ? 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                                            : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                                        }`}>
                                            {toolCall.result.meta.gate.status === 'candidate_ready' ? '📋 候选就绪' : toolCall.result.meta.gate.status === 'no_op' ? '⏭ 无变更' : toolCall.result.meta.gate.status}
                                        </span>
                                    )}
                                    {toolCall.result.meta.verification?.status && (
                                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                            toolCall.result.meta.verification.status === 'passed' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                                            : toolCall.result.meta.verification.status === 'failed' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                                            : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300'
                                        }`}>
                                            {toolCall.result.meta.verification.status === 'passed' ? '✓ 验证通过' : toolCall.result.meta.verification.status === 'failed' ? '✗ 验证失败' : '⏳ 验证中'}
                                        </span>
                                    )}
                                    {toolCall.result.meta.confirmation?.status && (
                                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                            toolCall.result.meta.confirmation.status === 'confirmed' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                                            : toolCall.result.meta.confirmation.status === 'rejected' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                                            : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                                        }`}>
                                            {toolCall.result.meta.confirmation.status === 'confirmed' ? '✓ 已确认'
                                            : toolCall.result.meta.confirmation.status === 'rejected' ? '✗ 已拒绝'
                                            : '⏳ 待确认'}
                                        </span>
                                    )}
                                </div>
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
                                            {toolCall.name === 'create_file' && toolCall.result?.data?.path && currentWorkspace && (
                                                <div className="mt-2">
                                                    <button
                                                        onClick={async () => {
                                                            const path = toolCall.result?.data?.path;
                                                            if (!path) return;
                                                            try {
                                                                const { normalizePath, normalizeWorkspacePath, getAbsolutePath } = await import('../../utils/pathUtils');
                                                                
                                                                // 规范化路径格式（确保与后端一致）
                                                                const normalizedPath = normalizePath(path);
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
                            {toolCall.result.display_error && (
                                <div className="mt-1 text-sm">{toolCall.result.display_error}</div>
                            )}
                            {!toolCall.result.display_error && toolCall.result.error && (
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
