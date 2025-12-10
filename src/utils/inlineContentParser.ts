// 内联内容解析工具

import { Reference, ReferenceType } from '../types/reference';

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
            if (element.classList.contains('inline-reference-tag')) {
                const refId = element.getAttribute('data-ref-id');
                if (refId) {
                    nodes.push({
                        type: 'reference',
                        id: refId,
                        order: order++,
                    });
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

/**
 * 将节点数组格式化为 AI 可理解的完整内容
 * 关键：引用标签会被替换为完整的引用信息
 */
export async function formatNodesForAI(
    nodes: InlineInputNode[],
    refMap: Map<string, Reference>
): Promise<string> {
    const parts = await Promise.all(
        nodes.map(async (node) => {
            if (node.type === 'text') {
                return node.content || '';
            } else if (node.type === 'reference' && node.id) {
                const ref = refMap.get(node.id);
                if (!ref) {
                    return '';
                }
                
                // ⚠️ 关键：将引用标签替换为完整信息
                return await formatReferenceForAI(ref);
            }
            return '';
        })
    );
    
    // 按顺序合并，保持用户输入的顺序
    // 文本和引用完整信息交替出现
    return parts.filter(Boolean).join('');
}

/**
 * 格式化单个引用为 AI 可理解的完整信息
 */
async function formatReferenceForAI(ref: Reference): Promise<string> {
    const { ReferenceType } = await import('../types/reference');
    
    switch (ref.type) {
        case ReferenceType.TEXT: {
            const textRef = ref as import('../types/reference').TextReference;
            // ⚠️ 发送完整文本内容，而不是标签
            const content = textRef.content || textRef.preview || '[文本内容为空]';
            // 格式化文本引用，明确告诉AI这是完整的引用内容，不需要再读取文件
            return `\n\n[文本引用: ${textRef.fileName} (行 ${textRef.lineRange.start}-${textRef.lineRange.end})]\n来源文件: ${textRef.sourceFile}\n引用内容:\n${content}\n[以上是完整的引用内容，无需再读取文件]\n\n`;
        }
        
        case ReferenceType.FILE: {
            const fileRef = ref as import('../types/reference').FileReference;
            let fileContent = fileRef.content;
            
            // 如果没有内容，尝试加载
            if (!fileContent && fileRef.path) {
                try {
                    const { invoke } = await import('@tauri-apps/api/core');
                    fileContent = await invoke<string>('read_file_content', {
                        path: fileRef.path,
                    });
                } catch (error) {
                    fileContent = '[读取文件失败]';
                }
            }
            
            // ⚠️ 发送完整文件内容，而不是路径
            return `\n\n[文件引用: ${fileRef.name}]\n${fileContent || '[文件内容]'}\n\n`;
        }
        
        case ReferenceType.FOLDER: {
            const folderRef = ref as import('../types/reference').FolderReference;
            // 加载文件夹内容（包括文件列表和结构）
            const folderContent = await loadFolderContent(folderRef.path);
            // ⚠️ 发送文件夹完整内容和结构信息
            return `\n\n[文件夹引用: ${folderRef.name}]\n路径: ${folderRef.path}\n包含 ${folderRef.fileCount || 0} 个文件\n\n${folderContent}\n[以上是文件夹的完整内容，您可以查看文件列表，或使用 list_files 工具浏览文件夹]\n\n`;
        }
        
        case ReferenceType.CHAT: {
            const chatRef = ref as import('../types/reference').ChatReference;
            // 加载聊天记录完整内容
            const chatContent = await loadChatMessages(chatRef.chatTabId, chatRef.messageIds);
            // ⚠️ 发送聊天记录完整内容
            return `\n\n[聊天记录引用: ${chatRef.chatTabTitle} (消息 ${chatRef.messageRange?.start || 0}-${chatRef.messageRange?.end || 0})]\n${chatContent}\n\n`;
        }
        
        case ReferenceType.IMAGE: {
            const imageRef = ref as import('../types/reference').ImageReference;
            return `\n\n[图片引用: ${imageRef.name}]\n路径: ${imageRef.path}\n大小: ${imageRef.size || 0} 字节\n\n`;
        }
        
        case ReferenceType.MEMORY: {
            const memoryRef = ref as import('../types/reference').MemoryReference;
            return `\n\n[记忆库引用: ${memoryRef.name}]\n包含 ${memoryRef.itemCount || 0} 个记忆项\n\n`;
        }
        
        case ReferenceType.LINK: {
            const linkRef = ref as import('../types/reference').LinkReference;
            let linkContent = linkRef.url;
            if (linkRef.title) {
                linkContent = `${linkRef.title}\n${linkRef.url}`;
            }
            if (linkRef.preview) {
                linkContent += `\n${linkRef.preview}`;
            }
            return `\n\n[链接引用]\n${linkContent}\n\n`;
        }
        
        default:
            return '';
    }
}

/**
 * 加载文件夹内容
 */
async function loadFolderContent(folderPath: string): Promise<string> {
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
 * 加载聊天记录内容
 */
async function loadChatMessages(chatTabId: string, messageIds: string[]): Promise<string> {
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
        
        return messages.map((msg, index) => {
            const roleLabel = msg.role === 'user' ? '用户' : 'AI';
            return `${roleLabel}: ${msg.content}`;
        }).join('\n\n');
    } catch (error) {
        return '[加载聊天记录失败]';
    }
}

/**
 * 获取引用的显示文本（简洁版本，用于内联标签）
 */
export function getReferenceDisplayText(ref: Reference): string {
    switch (ref.type) {
        case ReferenceType.TEXT: {
            const textRef = ref as import('../types/reference').TextReference;
            if (textRef.displayText) {
                return textRef.displayText;
            }
            return `${textRef.fileName} (行 ${textRef.lineRange.start}-${textRef.lineRange.end})`;
        }
        
        case ReferenceType.FILE: {
            return (ref as import('../types/reference').FileReference).name;
        }
        
        case ReferenceType.FOLDER: {
            const folderRef = ref as import('../types/reference').FolderReference;
            return `${folderRef.name} (${folderRef.fileCount || 0} 个文件)`;
        }
        
        case ReferenceType.CHAT: {
            const chatRef = ref as import('../types/reference').ChatReference;
            return `${chatRef.chatTabTitle} (消息 ${chatRef.messageRange?.start || 0}-${chatRef.messageRange?.end || 0})`;
        }
        
        case ReferenceType.IMAGE: {
            return (ref as import('../types/reference').ImageReference).name;
        }
        
        case ReferenceType.MEMORY: {
            const memoryRef = ref as import('../types/reference').MemoryReference;
            return `${memoryRef.name} (${memoryRef.itemCount || 0} 项)`;
        }
        
        case ReferenceType.LINK: {
            const linkRef = ref as import('../types/reference').LinkReference;
            return linkRef.title || linkRef.url.substring(0, 30) + (linkRef.url.length > 30 ? '...' : '');
        }
        
        default:
            return '引用';
    }
}

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

