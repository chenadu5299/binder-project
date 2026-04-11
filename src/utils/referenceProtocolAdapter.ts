/**
 * 引用协议适配器
 * 将 Reference[] 转为 ai_chat_stream 协议格式
 * 依据：《引用功能完整设计文档》6.1
 */

import { invoke } from '@tauri-apps/api/core';
import {
    Reference,
    ReferenceType,
    TextReference,
    TextReferenceAnchor,
    FileReference,
    FolderReference,
    ImageReference,
    TableReference,
    MemoryReference,
    LinkReference,
    ChatReference,
    KnowledgeBaseReference,
    TemplateReference,
} from '../types/reference';
import { isSameDocumentForEdit } from './pathUtils';
import { loadFolderContentForProtocol, loadChatMessagesForProtocol } from './inlineContentParser';

/** ai_chat_stream references 协议格式（设计文档 6.1） */
export interface ReferenceProtocol {
    type: 'text' | 'file' | 'folder' | 'image' | 'table' | 'memory' | 'link' | 'chat' | 'kb' | 'template';
    source: string;
    content: string;
    knowledgeBaseId?: string;
    knowledgeEntryId?: string;
    knowledgeDocumentId?: string;
    knowledgeCitationKey?: string;
    knowledgeRetrievalMode?: 'manual_query' | 'explicit' | 'automatic';
    textReference?: { startBlockId: string; startOffset: number; endBlockId: string; endOffset: number };
    /** 兼容旧后端字段，后续由 textReference 统一替代 */
    editTarget?: { blockId: string; startOffset: number; endOffset: number };
    /**
     * TMP-P0 冻结：模板协议只允许 workflow。
     */
    templateType?: 'workflow';
}

const BIG_FILE_THRESHOLD = 10 * 1024 * 1024; // 10MB
const CONTENT_MAX_CHARS = 2000; // Phase 1.4：Memory/KB/Template 单条上限

function truncateContent(s: string, maxChars: number = CONTENT_MAX_CHARS): string {
    if (s.length <= maxChars) return s;
    return s.slice(0, maxChars) + '\n\n[内容过长已截断]';
}

/** 从 TextReference 中提取精确引用四元组（优先新字段，兼容旧字段） */
export function extractTextReferenceAnchor(ref: TextReference): TextReferenceAnchor | undefined {
    if (ref.textReference) {
        return ref.textReference;
    }
    if (
        ref.startBlockId != null &&
        ref.endBlockId != null &&
        ref.startOffset != null &&
        ref.endOffset != null
    ) {
        return {
            startBlockId: ref.startBlockId,
            startOffset: ref.startOffset,
            endBlockId: ref.endBlockId,
            endOffset: ref.endOffset,
        };
    }
    if (ref.blockId != null && ref.startOffset != null && ref.endOffset != null) {
        return {
            startBlockId: ref.blockId,
            startOffset: ref.startOffset,
            endBlockId: ref.blockId,
            endOffset: ref.endOffset,
        };
    }
    return undefined;
}

/**
 * 将 Reference[] 转为协议格式，过滤当前打开文件
 * @param refs 引用列表
 * @param currentFile 当前打开的文档路径（用户 @ 此文件 → 忽略，不加入）
 * @param validRefIds Phase 1.1：可选，仅包含仍为有效引用的 id（标签含 @），未传则全部处理
 */
export async function buildReferencesForProtocol(
    refs: Reference[],
    currentFile: string | null,
    validRefIds?: Set<string>
): Promise<ReferenceProtocol[]> {
    const results: ReferenceProtocol[] = [];

    for (const ref of refs) {
        // Phase 1.1：仅处理有效引用（标签含 @ 或未传 validRefIds）
        if (validRefIds && !validRefIds.has(ref.id)) {
            continue;
        }
        // 设计文档：用户 @ 当前打开文件 → 忽略，不加入 references
        if (currentFile && isCurrentFileRef(ref, currentFile)) {
            continue;
        }

        const protocol = await refToProtocol(ref);
        if (protocol) {
            results.push(protocol);
        }
    }

    return results;
}

/** 判断是否为当前打开文件的引用（需忽略） */
function isCurrentFileRef(ref: Reference, currentFile: string): boolean {
    if (ref.type === ReferenceType.FILE) {
        return isSameDocumentForEdit((ref as FileReference).path, currentFile);
    }
    if (ref.type === ReferenceType.TEXT) {
        return isSameDocumentForEdit((ref as TextReference).sourceFile, currentFile);
    }
    return false;
}

/** 单条引用转为协议格式 */
async function refToProtocol(ref: Reference): Promise<ReferenceProtocol | null> {
    switch (ref.type) {
        case ReferenceType.TEXT: {
            const r = ref as TextReference;
            const protocol: ReferenceProtocol = {
                type: 'text',
                source: r.sourceFile,
                content: r.content || r.preview || '',
            };
            const anchor = extractTextReferenceAnchor(r);
            if (anchor) {
                protocol.textReference = {
                    startBlockId: anchor.startBlockId,
                    startOffset: anchor.startOffset,
                    endBlockId: anchor.endBlockId,
                    endOffset: anchor.endOffset,
                };
                // 兼容旧字段：保留单块入口
                protocol.editTarget = {
                    blockId: anchor.startBlockId,
                    startOffset: anchor.startOffset,
                    endOffset: anchor.endOffset,
                };
            }
            return protocol;
        }

        case ReferenceType.FILE: {
            const r = ref as FileReference;
            let content = r.content || '';
            const isBig = (r.size ?? 0) > BIG_FILE_THRESHOLD;

            if (!isBig && !content && r.path) {
                try {
                    content = await invoke<string>('read_file_content', { path: r.path });
                } catch {
                    content = '[读取文件失败]';
                }
            } else if (isBig) {
                content = ''; // 大文件仅传 path，prompt 提示 AI read_file
            }
            return {
                type: 'file',
                source: r.path,
                content,
            };
        }

        case ReferenceType.FOLDER: {
            const r = ref as FolderReference;
            let content: string;
            try {
                content = await loadFolderContentForProtocol(r.path);
            } catch {
                content = '[加载文件夹失败]';
            }
            // Phase 1.4：Folder 前 20 个文件预览（loadFolderContentForProtocol 已实现）
            return {
                type: 'folder',
                source: r.path,
                content: truncateContent(content, 15000), // 文件夹内容可能较长，适当放宽
            };
        }

        case ReferenceType.IMAGE: {
            const r = ref as ImageReference;
            return {
                type: 'image',
                source: r.path,
                content: r.path, // 或描述，当前传 path
            };
        }

        case ReferenceType.TABLE: {
            const r = ref as TableReference;
            const content = r.tableData
                ? r.tableData.map(row => row.join('\t')).join('\n')
                : '[表格数据]';
            return {
                type: 'table',
                source: r.sourceFile,
                content,
            };
        }

        case ReferenceType.MEMORY: {
            const r = ref as MemoryReference;
            let content = '[记忆内容不可用]';
            if (r.items && r.items.length > 0) {
                content = r.items
                    .map((item: { content?: string; text?: string }) => item.content ?? item.text ?? '')
                    .filter(Boolean)
                    .join('\n\n');
            } else {
                // 无 items 时优先按真实 memory_id 精确回填，回填失败再走检索兜底
                try {
                    const { useFileStore } = await import('../stores/fileStore');
                    const workspacePath = useFileStore.getState().currentWorkspace;
                    if (workspacePath) {
                        const { memoryService } = await import('../services/memoryService');
                        if (r.memoryId) {
                            const all = await memoryService.getAllMemories(workspacePath);
                            const exact = all.find((m) => m.id === r.memoryId);
                            if (exact?.content) {
                                content = exact.content;
                            }
                        }
                        if (!content || content === '[记忆内容不可用]') {
                            const resp = await memoryService.searchMemories({
                                query: r.name || '',
                                workspacePath,
                                limit: 5,
                            });
                            if (resp.items.length > 0) {
                                content = resp.items.map(r2 => r2.item.content).filter(Boolean).join('\n\n');
                            }
                        }
                    }
                } catch {
                    // 保持占位
                }
            }
            return {
                type: 'memory',
                source: r.memoryId || r.name,
                content: truncateContent(content, 2000), // Phase 1.4 per-type 约束
            };
        }

        case ReferenceType.LINK: {
            const r = ref as LinkReference;
            let content = r.url;
            if (r.title) content = `${r.title}\n${content}`;
            if (r.preview) content += `\n${r.preview}`;
            return {
                type: 'link',
                source: r.url,
                content,
            };
        }

        case ReferenceType.CHAT: {
            const r = ref as ChatReference;
            let content: string;
            try {
                content = await loadChatMessagesForProtocol(r.chatTabId, r.messageIds);
            } catch {
                content = '[加载聊天记录失败]';
            }
            return {
                type: 'chat',
                source: r.chatTabId,
                content,
            };
        }

        case ReferenceType.KNOWLEDGE_BASE: {
            const r = ref as KnowledgeBaseReference;
            if (r.injectionSlices && r.injectionSlices.length > 0) {
                const firstSlice = r.injectionSlices[0];
                return {
                    type: 'kb',
                    source: r.entryId || r.kbId || r.kbName,
                    knowledgeBaseId: r.kbId,
                    knowledgeEntryId: r.entryId,
                    knowledgeDocumentId: r.documentId || firstSlice?.documentId,
                    knowledgeCitationKey: r.citation?.citationKey || firstSlice?.citation?.citationKey,
                    knowledgeRetrievalMode: 'explicit',
                    content: truncateContent(
                        r.injectionSlices.map(slice => slice.content).join('\n\n'),
                        4000
                    ),
                };
            }

            try {
                const { useFileStore } = await import('../stores/fileStore');
                const workspacePath = useFileStore.getState().currentWorkspace;
                if (workspacePath) {
                    const { knowledgeService } = await import('../services/knowledge/knowledgeService');
                    const response = await knowledgeService.queryKnowledgeBase(workspacePath, {
                        knowledgeBaseId: r.kbId || null,
                        entryId: r.entryId || null,
                        documentId: r.documentId || null,
                        query: r.entryId ? (r.query || r.entryTitle || r.kbName) : null,
                        limit: 5,
                        intent: r.entryId && r.assetKind !== 'structure_asset' ? 'citation' : 'recall',
                        queryMode: r.assetKind === 'structure_asset' ? 'structure_reference' : 'content',
                        assetKindFilter: r.assetKind ?? null,
                    });
                    const content = response.injectionSlices.length > 0
                        ? response.injectionSlices.map(slice => slice.content).join('\n\n')
                        : response.chunkHits.map(hit => hit.chunk.chunkText).join('\n\n');

                    return {
                        type: 'kb',
                        source: r.entryId || r.kbId || r.kbName,
                        knowledgeBaseId: r.kbId,
                        knowledgeEntryId: r.entryId,
                        knowledgeDocumentId: r.documentId || response.injectionSlices[0]?.documentId,
                        knowledgeCitationKey: r.citation?.citationKey || response.injectionSlices[0]?.citation?.citationKey,
                        knowledgeRetrievalMode: 'explicit',
                        content: truncateContent(content || '[知识库未命中结果]', 4000),
                    };
                }
            } catch {
                // 保持占位
            }

            return {
                type: 'kb',
                source: r.entryId || r.kbId || r.kbName,
                knowledgeBaseId: r.kbId,
                knowledgeEntryId: r.entryId,
                knowledgeDocumentId: r.documentId,
                knowledgeCitationKey: r.citation?.citationKey,
                knowledgeRetrievalMode: 'explicit',
                content: '[知识库内容暂不可用]',
            };
        }

        case ReferenceType.TEMPLATE: {
            const r = ref as TemplateReference;
            return {
                type: 'template',
                source: r.templateId || r.templateName,
                content: truncateContent(
                    `workflow_template_ref\nname: ${r.templateName}\ntemplate_id: ${r.templateId}\nnote: workflow template refs must be compiled into RuntimeWorkflowPlan before execution.`,
                    500,
                ),
                templateType: 'workflow',
            };
        }

        default:
            return null;
    }
}
