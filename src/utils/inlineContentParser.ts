// 内联内容解析工具

import { Reference, ReferenceType } from '../types/reference';
import { buildContentLabel } from './contentLabel';

// 输入节点类型（表示输入框中的一个节点：文本或引用）
export interface InlineInputNode {
    type: 'text' | 'reference';
    id?: string;        // reference 类型的引用 ID
    content?: string;   // text 类型的文本内容
    order: number;      // 插入顺序（时间戳）
}

/**
 * 从 contentEditable 元素解析节点数组
 * 保持用户输入的顺序（文字和引用标签混合）
 */
export function parseEditorContent(editor: HTMLElement): InlineInputNode[] {
    const nodes: InlineInputNode[] = [];
    let order = 0;
    
    const walk = (node: Node) => {
        if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent || '';
            // 保留所有文本，包括空白（用于保持格式）
            if (text) {
                nodes.push({
                    type: 'text',
                    content: text,
                    order: order++,
                });
            }
        } else if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as HTMLElement;
            
            // 检查是否是引用标签
            // Phase 1.1 降级：若 textContent 不含 @，按纯文本输出，不加入 references
            if (element.classList.contains('inline-reference-tag')) {
                const refId = element.getAttribute('data-ref-id');
                const textContent = element.textContent || '';
                if (refId && textContent.includes('@')) {
                    nodes.push({
                        type: 'reference',
                        id: refId,
                        order: order++,
                    });
                } else {
                    // 降级为纯文本
                    if (textContent.trim()) {
                        nodes.push({
                            type: 'text',
                            content: textContent,
                            order: order++,
                        });
                    }
                }
            } else {
                // 递归处理子节点（跳过引用标签，因为它已经被处理）
                if (!element.closest('.inline-reference-tag')) {
                    Array.from(node.childNodes).forEach(walk);
                }
            }
        }
    };
    
    // 遍历所有子节点
    Array.from(editor.childNodes).forEach(walk);
    
    // 按顺序排序（虽然应该已经是顺序的，但确保）
    return nodes.sort((a, b) => a.order - b.order);
}

/** 消息记录展示节点：文本或引用标签（设计文档 2.6） */
export type DisplayNode =
    | { type: 'text'; content: string }
    | { type: 'ref'; displayText: string };

/**
 * 将节点数组转为结构化展示节点（用于消息记录以标签形式渲染）
 */
export function formatNodesToDisplayNodes(
    nodes: InlineInputNode[],
    refMap: Map<string, Reference>
): DisplayNode[] {
    const result: DisplayNode[] = [];
    for (const node of nodes) {
        if (node.type === 'text' && node.content) {
            result.push({ type: 'text', content: node.content });
        } else if (node.type === 'reference' && node.id) {
            const ref = refMap.get(node.id);
            if (ref) {
                result.push({ type: 'ref', displayText: getReferenceDisplayText(ref) });
            }
        }
    }
    return result;
}


/**
 * 将节点数组格式化为用户消息 content。
 * 依据：A-CORE-C-D-02 §五 第11条 / A-AST-M-P-01 §5.2 第9条
 * 引用正文仅通过 references 协议单通道注入，content 中以 @{label} 占位。
 */
export async function formatNodesForAI(
    nodes: InlineInputNode[],
    refMap: Map<string, Reference>
): Promise<string> {
    const parts = nodes.map((node) => {
        if (node.type === 'text') {
            return node.content || '';
        } else if (node.type === 'reference' && node.id) {
            const ref = refMap.get(node.id);
            if (!ref) {
                return '';
            }
            const label = getReferenceDisplayText(ref);
            return `@${label}`;
        }
        return '';
    });
    
    return parts.filter(Boolean).join('');
}

/**
 * 加载文件夹内容（供 referenceProtocolAdapter 使用）
 */
export async function loadFolderContentForProtocol(folderPath: string): Promise<string> {
    try {
        const { invoke } = await import('@tauri-apps/api/core');
        
        const files = await invoke<string[]>('list_folder_files', {
            path: folderPath,
        });
        
        if (!files || files.length === 0) {
            return '[文件夹为空]';
        }
        
        // 构建文件列表（相对路径）
        const folderPathNormalized = folderPath.replace(/\\/g, '/');
        const fileList = files.map(filePath => {
            const normalized = filePath.replace(/\\/g, '/');
            // 获取相对于文件夹的路径
            const relativePath = normalized.startsWith(folderPathNormalized)
                ? normalized.slice(folderPathNormalized.length).replace(/^\//, '')
                : filePath.split('/').pop() || filePath.split('\\').pop() || filePath;
            return relativePath;
        }).sort();
        
        // 构建文件列表字符串
        let result = `文件列表（共 ${files.length} 个文件）：\n`;
        result += fileList.slice(0, 100).join('\n'); // 显示前 100 个文件路径
        
        if (files.length > 100) {
            result += `\n\n[提示: 文件夹包含 ${files.length} 个文件，仅显示前 100 个文件路径]\n`;
        }
        
        // 尝试加载前 20 个文件的内容（跳过二进制文件）
        result += '\n\n---\n文件内容预览（前 20 个文件）：\n\n';
        
        // 二进制文件扩展名列表
        const binaryExtensions = new Set([
            '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.ico', '.svg',
            '.pdf', '.zip', '.rar', '.7z', '.tar', '.gz',
            '.mp3', '.mp4', '.avi', '.mov', '.wmv',
            '.exe', '.dll', '.so', '.dylib',
            '.docx', '.xlsx', '.pptx', '.draft.docx',
        ]);
        
        const contents = await Promise.allSettled(
            files.slice(0, 20).map(async (filePath: string) => {
                try {
                    const fileName = filePath.split('/').pop() || filePath.split('\\').pop() || filePath;
                    const ext = fileName.includes('.') 
                        ? '.' + fileName.split('.').pop()?.toLowerCase() 
                        : '';
                    
                    // 跳过二进制文件
                    if (binaryExtensions.has(ext)) {
                        return `文件: ${fileName}\n路径: ${filePath}\n[二进制文件，跳过内容预览]\n`;
                    }
                    
                    const content = await invoke<string>('read_file_content', {
                        path: filePath,
                    });
                    // 限制单个文件内容长度
                    const preview = content.length > 5000 
                        ? content.slice(0, 5000) + '\n\n[文件内容过长，已截断。使用 read_file 工具可查看完整内容]'
                        : content;
                    return `文件: ${fileName}\n路径: ${filePath}\n\n${preview}\n`;
                } catch (error: any) {
                    const fileName = filePath.split('/').pop() || filePath.split('\\').pop() || filePath;
                    // 如果是 DOCX 文件，提示使用特殊工具
                    if (filePath.endsWith('.docx') || filePath.endsWith('.draft.docx')) {
                        return `文件: ${fileName}\n路径: ${filePath}\n[DOCX 文件，请使用 read_file 工具读取（会自动转换为文本）]\n`;
                    }
                    return `文件: ${fileName}\n路径: ${filePath}\n[读取失败: ${error?.message || '未知错误'}]\n`;
                }
            })
        );
        
        const successfulContents = contents
            .filter(r => r.status === 'fulfilled')
            .map(r => (r as PromiseFulfilledResult<string>).value);
        
        result += successfulContents.join('\n---\n\n');
        
        if (files.length > 20) {
            result += `\n\n[提示: 仅预览了前 20 个文件的内容。要查看其他文件，请使用 read_file 工具]\n`;
        }
        
        return result;
    } catch (error: any) {
        return `[加载文件夹内容失败: ${error?.message || '未知错误'}]\n提示：您可以使用 list_files 工具来浏览文件夹内容。`;
    }
}

/**
 * 加载聊天记录内容（供 referenceProtocolAdapter 使用）
 */
export async function loadChatMessagesForProtocol(chatTabId: string, messageIds: string[]): Promise<string> {
    try {
        const { useChatStore } = await import('../stores/chatStore');
        const { tabs } = useChatStore.getState();
        const tab = tabs.find(t => t.id === chatTabId);
        
        if (!tab) {
            return '[聊天记录不存在]';
        }
        
        const messages = tab.messages.filter(m => messageIds.includes(m.id));
        if (messages.length === 0) {
            return '[未找到指定的消息]';
        }
        
        return messages.map((msg, _index) => {
            const roleLabel = msg.role === 'user' ? '用户' : 'AI';
            return `${roleLabel}: ${msg.content}`;
        }).join('\n\n');
    } catch (error) {
        return '[加载聊天记录失败]';
    }
}

/**
 * 统一引用标签生成函数。
 * 依据：A-CORE-C-D-02 §3.3 引用标签 / §五 第10条
 * 规则：
 * - TextReference：内容摘要主标签，位置仅作弱后缀去重
 * - 其他引用：保留各自资源名
 */
export function getReferenceDisplayText(ref: Reference): string {
    switch (ref.type) {
        case ReferenceType.TEXT: {
            const textRef = ref as import('../types/reference').TextReference;
            const snippet = buildContentLabel(textRef.content || textRef.preview, textRef.fileName || '文本');
            if (textRef.textReference) {
                return `${snippet} · @${textRef.textReference.startOffset}`;
            }
            if (textRef.lineRange && (textRef.lineRange.start > 0 || textRef.lineRange.end > 0)) {
                if (textRef.lineRange.start === textRef.lineRange.end) {
                    return `${snippet} · L${textRef.lineRange.start}`;
                }
                return `${snippet} · L${textRef.lineRange.start}-${textRef.lineRange.end}`;
            }
            return snippet;
        }
        
        case ReferenceType.FILE: {
            return (ref as import('../types/reference').FileReference).name;
        }
        
        case ReferenceType.FOLDER: {
            const folderRef = ref as import('../types/reference').FolderReference;
            return `${folderRef.name}/`;
        }
        
        case ReferenceType.CHAT: {
            const chatRef = ref as import('../types/reference').ChatReference;
            return `聊天:${chatRef.chatTabTitle}`;
        }
        
        case ReferenceType.IMAGE: {
            return (ref as import('../types/reference').ImageReference).name;
        }
        
        case ReferenceType.MEMORY: {
            const memoryRef = ref as import('../types/reference').MemoryReference;
            return `记忆:${memoryRef.name}`;
        }

        case ReferenceType.TABLE: {
            const tableRef = ref as import('../types/reference').TableReference;
            return `${tableRef.fileName}:表格`;
        }
        
        case ReferenceType.LINK: {
            const linkRef = ref as import('../types/reference').LinkReference;
            if (linkRef.title) return `链接:${linkRef.title}`;
            try {
                return `链接:${new URL(linkRef.url).hostname}`;
            } catch {
                return `链接:${linkRef.url.substring(0, 30)}`;
            }
        }

        case ReferenceType.KNOWLEDGE_BASE: {
            const knowledgeRef = ref as import('../types/reference').KnowledgeBaseReference;
            return `知识:${knowledgeRef.entryTitle || knowledgeRef.kbName || '条目'}`;
        }
        
        default:
            return '引用';
    }
}

/** @deprecated 使用 getReferenceDisplayText（已统一为标准标签函数） */
export const formatReferenceLabel = getReferenceDisplayText;

/**
 * 获取引用类型的图标名称
 */
export function getReferenceIcon(ref: Reference): string {
    switch (ref.type) {
        case ReferenceType.TEXT:
        case ReferenceType.FILE:
            return '📄';
        case ReferenceType.FOLDER:
            return '📁';
        case ReferenceType.IMAGE:
            return '🖼️';
        case ReferenceType.TABLE:
            return '📊';
        case ReferenceType.MEMORY:
            return '📚';
        case ReferenceType.CHAT:
            return '💬';
        case ReferenceType.LINK:
            return '🔗';
        case ReferenceType.KNOWLEDGE_BASE:
            return '🧠';
        default:
            return '📎';
    }
}
