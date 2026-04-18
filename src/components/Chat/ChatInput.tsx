import React, { useState, useRef, useEffect } from 'react';
import { PaperAirplaneIcon, ArrowPathIcon, StopIcon } from '@heroicons/react/24/outline';
import { useChatStore } from '../../stores/chatStore';
import { useReferenceStore } from '../../stores/referenceStore';
import { useFileStore } from '../../stores/fileStore';
import { useEditorStore } from '../../stores/editorStore';
import { MentionSelector, MentionItem } from './MentionSelector';
import { useMentionData } from '../../hooks/useMentionData';
import { ReferenceType, TextReference, FileReference, ImageReference, LinkReference } from '../../types/reference';
import { invoke } from '@tauri-apps/api/core';
import { memoryService } from '../../services/memoryService';
import { extractUrls } from '../../utils/urlDetector';
import { getReferenceDisplayText, type DisplayNode } from '../../utils/inlineContentParser';
import { buildKnowledgeReference } from '../../utils/knowledgeReference';
import { toast } from '../Common/Toast';

interface ChatInputProps {
    tabId: string | null; // 可以为 null（没有标签页时）
    pendingMode?: 'agent' | 'chat'; // 待创建标签页的模式
    onCreateTab?: (mode: 'agent' | 'chat') => void; // 创建标签页的回调
}

export const ChatInput: React.FC<ChatInputProps> = ({ tabId, pendingMode = 'agent', onCreateTab }) => {
    const { sendMessage, regenerate, tabs, createTab, setActiveTab } = useChatStore();
    const { addReference, getReferences, clearReferences } = useReferenceStore();
    const { currentWorkspace } = useFileStore();
    const { getActiveTab: getEditorActiveTab } = useEditorStore();
    const [input, setInput] = useState('');
    const [mentionState, setMentionState] = useState<{
        show: boolean;
        query: string;
        position: { top: number; left: number };
    } | null>(null);
    const prevInputRef = useRef('');
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const isComposingRef = useRef<boolean>(false); // 用于跟踪是否正在使用中文输入法
    const compositionEndTimeRef = useRef<number>(0); // 记录输入法结束的时间，用于判断回车是否用于确认输入
    const { itemsByCategory, getItemsByCategory } = useMentionData();
    const tab = tabId ? tabs.find(t => t.id === tabId) : null;
    const hasMessages = tab && tab.messages.length > 0;
    const isStreaming = tab ? tab.messages.some(m => m.isLoading) : false;
    // 自动调整高度
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
        }
    }, [input]);
    
    // 检测 @ 语法并显示选择器 - Phase 1.2：激活规则（仅输入 @ 激活；空格取消；回删不激活）
    useEffect(() => {
        if (!textareaRef.current || !containerRef.current) return;
        
        const textarea = textareaRef.current;
        const selectionStart = textarea.selectionStart;
        const textBeforeCursor = input.substring(0, selectionStart);
        
        // 检测 @ 语法（从光标位置向前查找）
        const atMatch = textBeforeCursor.match(/@([^\s@]*)$/);
        const prevInput = prevInputRef.current;
        prevInputRef.current = input;
        
        if (atMatch) {
            const query = atMatch[1];
            // 空格取消：query 含空格，或 @ 后紧跟空格（如 "@ "）→ 关闭列表
            if (/\s/.test(query) || textBeforeCursor.match(/@\s/)) {
                setMentionState(null);
                return;
            }
            // 回删不激活：query 为空且输入变短 → 回删形成的 @（如 "a@" 回删为 "@"），不激活
            if (query === '' && input.length < prevInput.length) {
                setMentionState(null);
                return;
            }
            
            const atIndex = textBeforeCursor.lastIndexOf('@');
            const textareaRect = textarea.getBoundingClientRect();
            const containerRect = containerRef.current.getBoundingClientRect();
            const textBeforeAt = input.substring(0, atIndex);
            const lines = textBeforeAt.split('\n');
            const lineNumber = lines.length - 1;
            const lineHeight = 24;
            const top = textareaRect.top - containerRect.top + (lineNumber * lineHeight);
            const left = textareaRect.left - containerRect.left;

            setMentionState({
                show: true,
                query,
                position: { top, left },
            });
        } else {
            setMentionState(null);
        }
    }, [input]);

    // 检测输入中的 URL 并自动创建链接引用（仅在已有标签页时）
    useEffect(() => {
        if (!input.trim() || !tabId) return; // 没有标签页时不处理
        
        const urls = extractUrls(input);
        const currentRefs = getReferences(tabId);
        const existingUrls = currentRefs
            .filter(ref => ref.type === ReferenceType.LINK)
            .map(ref => (ref as LinkReference).url);
        
        // 为每个新 URL 创建链接引用
        urls.forEach(url => {
            if (!existingUrls.includes(url)) {
                const linkRef: LinkReference = {
                    id: `ref-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    type: ReferenceType.LINK,
                    url,
                    createdAt: Date.now(),
                };
                addReference(tabId, linkRef);
            }
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [input, tabId]);

    // Agent 模式：自动引用当前编辑器打开的文档（仅在已有标签页时）
    useEffect(() => {
        if (!tabId) return; // 没有标签页时不自动引用
        
        const activeEditorTab = getEditorActiveTab();
        if (!activeEditorTab || !activeEditorTab.filePath) return;

        const currentRefs = getReferences(tabId);
        const hasCurrentFileRef = currentRefs.some(ref => 
            ref.type === ReferenceType.FILE && 
            (ref as FileReference).path === activeEditorTab.filePath
        );

        // 如果当前编辑器有打开的文件，且还没有被引用，自动添加引用
        if (!hasCurrentFileRef && activeEditorTab.filePath) {
            const fileRef: FileReference = {
                id: `ref-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                type: ReferenceType.FILE,
                path: activeEditorTab.filePath,
                name: activeEditorTab.fileName,
                content: activeEditorTab.content,
                createdAt: Date.now(),
            };
            addReference(tabId, fileRef);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tabId, getEditorActiveTab]);
    
    // 处理文件拖拽
    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        
        // 如果没有标签页，先创建标签页
        let currentTabId = tabId;
        if (!currentTabId) {
            if (onCreateTab) {
                onCreateTab(pendingMode);
                await new Promise(resolve => setTimeout(resolve, 100));
                const latestTab = tabs[tabs.length - 1];
                if (latestTab) {
                    currentTabId = latestTab.id;
                    setActiveTab(currentTabId);
                } else {
                    console.error('❌ 创建标签页失败');
                    return;
                }
            } else {
                currentTabId = createTab(undefined, pendingMode);
                setActiveTab(currentTabId);
            }
        }
        
        if (!currentTabId) {
            console.error('❌ 无法获取标签页 ID');
            return;
        }
        
        console.log('📥 聊天窗口收到拖拽:', {
            types: Array.from(e.dataTransfer.types),
            files: e.dataTransfer.files.length,
        });
        
        // 1. 文件树拖拽：application/file-path 明确标记
        const filePath = e.dataTransfer.getData('application/file-path');
        const isDirectory = e.dataTransfer.getData('application/is-directory') === 'true';

        if (filePath && !isDirectory) {
            console.log('✅ 检测到文件树拖拽，创建文件引用:', filePath);
            await handleFileTreeReference(filePath);
            return;
        }

        // 2. 编辑器文本拖拽：application/x-binder-source 由 CopyReferenceExtension dragstart 写入
        const binderSourceStr = e.dataTransfer.getData('application/x-binder-source') || (() => {
            const gs = (window as any).__binderDragSource;
            const gt = (window as any).__binderDragTimestamp;
            if (gs && gt && Date.now() - gt < 10000) {
                delete (window as any).__binderDragSource;
                delete (window as any).__binderDragTimestamp;
                return gs;
            }
            return '';
        })();
        const droppedText = e.dataTransfer.getData('text/plain');

        if (droppedText && binderSourceStr) {
            try {
                const source = JSON.parse(binderSourceStr);
                const { createTextReferenceFromClipboard, enrichTextReferenceAnchor } = await import('../../utils/referenceHelpers');
                const textRefBase = createTextReferenceFromClipboard(
                    {
                        filePath: source.filePath,
                        fileName: source.fileName,
                        lineRange: source.lineRange,
                        charRange: source.charRange,
                        startBlockId: source.startBlockId,
                        endBlockId: source.endBlockId,
                        blockId: source.blockId,
                        startOffset: source.startOffset,
                        endOffset: source.endOffset,
                    },
                    droppedText,
                );
                const textRefPartial = {
                    ...textRefBase,
                    id: `ref-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    createdAt: Date.now(),
                } as TextReference;
                // 若四元组缺失（CopyReferenceExtension 在无 block ID 时的退化情形），尝试从
                // editor DOM 按行号补齐，使其升级为精确引用锚点精度
                const textRef = await enrichTextReferenceAnchor(textRefPartial);
                addReference(currentTabId, textRef);
            } catch (err) {
                console.error('❌ 创建文本引用失败:', err);
            }
            return;
        }

        // Phase 2.1：处理记忆库拖拽
        const memoryData = e.dataTransfer.getData('application/binder-reference-memory');
        if (memoryData) {
            try {
                const payload = JSON.parse(memoryData);
                if (payload.type === 'memory' && currentTabId) {
                    const payloadName = payload.entityName || payload.name || '记忆';
                    let memoryId: string | null = payload.memoryId ?? null;
                    let itemContent: string | null = payload.content ?? null;
                    const memories = currentWorkspace
                        ? await memoryService.getAllMemories(currentWorkspace).catch(() => [])
                        : [];
                    if (!memoryId && payload.entityName) {
                        const matched = memories.find(m => m.entityName === payload.entityName);
                        if (matched) {
                            memoryId = matched.id;
                            itemContent = matched.content;
                        }
                    }
                    if (!memoryId) {
                        return;
                    }
                    addReference(currentTabId, {
                        id: '',
                        type: ReferenceType.MEMORY,
                        createdAt: Date.now(),
                        memoryId,
                        name: payloadName,
                        itemCount: 1,
                        items: itemContent ? [{ id: memoryId, content: itemContent }] : undefined,
                    });
                    return;
                }
            } catch (err) {
                console.warn('解析记忆库拖拽数据失败:', err);
            }
        }

        // Phase 2.1：处理聊天标签拖拽
        const chatData = e.dataTransfer.getData('application/binder-reference-chat');
        if (chatData) {
            try {
                const payload = JSON.parse(chatData);
                if (payload.type === 'chat' && payload.chatTabId && currentTabId) {
                    addReference(currentTabId, {
                        id: '',
                        type: ReferenceType.CHAT,
                        createdAt: Date.now(),
                        chatTabId: payload.chatTabId,
                        chatTabTitle: payload.chatTabTitle || '聊天',
                        messageIds: payload.messageIds || [],
                        messageRange: payload.messageRange,
                    });
                    return;
                }
            } catch (err) {
                console.warn('解析聊天标签拖拽数据失败:', err);
            }
        }

        const knowledgeData = e.dataTransfer.getData('application/binder-reference-kb');
        if (knowledgeData && currentWorkspace) {
            try {
                const payload = JSON.parse(knowledgeData);
                if (payload.type === 'kb' && payload.kbId) {
                    const knowledgeRef = await buildKnowledgeReference(currentWorkspace, {
                        kbId: payload.kbId,
                        entryId: payload.entryId ?? null,
                        documentId: payload.documentId ?? null,
                        entryTitle: payload.entryTitle || payload.name || '知识库条目',
                        preview: payload.preview ?? null,
                        assetKind: payload.assetKind ?? null,
                    });
                    addReference(currentTabId, knowledgeRef);
                    return;
                }
            } catch (err) {
                console.warn('解析知识库拖拽数据失败:', err);
            }
        }
        
        // 处理外部拖拽的文件
        const files = Array.from(e.dataTransfer.files);
        if (files.length === 0) {
            console.log('❌ 没有检测到文件');
            return;
        }
        
        console.log('✅ 检测到外部文件拖拽:', files.length);
        
        for (const file of files) {
            if (file.type.startsWith('image/')) {
                // 图片文件
                await handleImageFile(file);
            } else {
                // 普通文件
                await handleFileReference(file);
            }
        }
    };
    
    // 处理外部图片文件（Phase 3.1：统一用 save_external_file 存 .binder/temp，符合设计「不展示于文件树」）
    const handleImageFile = async (file: File) => {
        if (!tabId || !currentWorkspace) {
            toast.warning('请先打开工作区后再拖入图片');
            return;
        }
        try {
            const arrayBuffer = await file.arrayBuffer();
            const imageData = Array.from(new Uint8Array(arrayBuffer));
            const tempPath = await invoke<string>('save_external_file', {
                workspacePath: currentWorkspace,
                fileData: imageData,
                fileName: file.name,
            });
            const imageRef: ImageReference = {
                id: `ref-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                type: ReferenceType.IMAGE,
                createdAt: Date.now(),
                path: tempPath,
                name: file.name,
                size: file.size,
                mimeType: file.type,
            };
            addReference(tabId, imageRef);
        } catch (error) {
            toast.error('保存图片失败');
            console.error('保存图片失败:', error);
        }
    };
    
    // 处理从文件树拖拽的文件引用
    const handleFileTreeReference = async (filePath: string) => {
        if (!tabId) return;
        try {
            console.log('📄 处理文件树引用:', filePath);
            
            if (!filePath || filePath.trim() === '') {
                console.error('❌ 文件路径为空');
                return;
            }
            
            const fileName = filePath.split('/').pop() || filePath;
            const ext = filePath.split('.').pop()?.toLowerCase();
            
            // 检查是否是图片文件
            const imageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'];
            if (ext && imageExtensions.includes(ext)) {
                // 创建图片引用
                const imageRef: ImageReference = {
                    id: `ref-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    type: ReferenceType.IMAGE,
                    createdAt: Date.now(),
                    path: filePath,
                    name: fileName,
                    mimeType: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
                };
                console.log('✅ 创建图片引用:', imageRef);
                addReference(tabId, imageRef);
                return;
            }
            
            // 处理文本文件：读取文件内容
            let content: string | undefined;
            let lineCount: number | undefined;
            
            const textExtensions = ['md', 'txt', 'html', 'js', 'ts', 'tsx', 'jsx', 'json', 'css', 'py', 'java', 'cpp', 'c', 'h', 'hpp', 'xml', 'yaml', 'yml', 'sh', 'bat', 'ps1'];
            
            if (ext && textExtensions.includes(ext)) {
                try {
                    console.log('📖 读取文本文件内容:', filePath);
                    content = await invoke<string>('read_file_content', { path: filePath });
                    lineCount = content.split('\n').length;
                    console.log('✅ 文件内容读取成功，行数:', lineCount);
                } catch (error) {
                    console.warn('⚠️ 读取文件内容失败:', error);
                    // 如果读取失败，继续创建引用但不包含内容
                }
            }
            
            // 创建文件引用
            const fileRef: FileReference = {
                id: `ref-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                type: ReferenceType.FILE,
                createdAt: Date.now(),
                path: filePath,
                name: fileName,
                content: content,
                lineCount: lineCount,
            };
            
            console.log('✅ 创建文件引用:', fileRef);
            addReference(tabId, fileRef);
        } catch (error) {
            console.error('❌ 创建文件引用失败:', error);
        }
    };
    
    // 处理外部文件引用（Phase 3.1：上传至 .binder/temp 临时存储）
    const handleFileReference = async (file: File) => {
        if (!tabId || !currentWorkspace) {
            toast.warning('请先打开工作区后再拖入外部文件');
            return;
        }
        const MAX_FILE_SIZE = 10 * 1024 * 1024;
        if (file.size > MAX_FILE_SIZE) {
            toast.warning(`文件 "${file.name}" 超过 10MB，已跳过`);
            return;
        }
        try {
            const arrayBuffer = await file.arrayBuffer();
            const fileData = Array.from(new Uint8Array(arrayBuffer));
            const tempPath = await invoke<string>('save_external_file', {
                workspacePath: currentWorkspace,
                fileData,
                fileName: file.name,
            });
            let content: string | undefined;
            try {
                const textContent = await file.text();
                if (textContent?.length && !textContent.includes('\0')) {
                    content = textContent;
                }
            } catch {
                /* 非文本文件忽略 */
            }
            const fileRef: FileReference = {
                id: `ref-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                type: ReferenceType.FILE,
                createdAt: Date.now(),
                path: tempPath,
                name: file.name,
                size: file.size,
                mimeType: file.type,
                content,
            };
            addReference(tabId, fileRef);
        } catch (error) {
            toast.error('保存外部文件失败');
            console.error('❌ 保存外部文件失败:', error);
        }
    };
    
    // 处理粘贴事件
    const handlePaste = async (e: React.ClipboardEvent) => {
        const items = e.clipboardData.items;
        
        // 检查是否有图片
        for (const item of Array.from(items)) {
            if (item.type.startsWith('image/')) {
                e.preventDefault();
                const file = item.getAsFile();
                if (file) {
                    await handleImageFile(file);
                }
                return;
            }
        }
        
        // 检查是否有文本和来源信息（来自编辑器的引用）
        const text = e.clipboardData.getData('text/plain');
        let sourceData: string | null = null;
        
        // 方法 1：尝试从剪贴板数据中获取自定义类型
        try {
            sourceData = e.clipboardData.getData('application/x-binder-source');
        } catch (error) {
            // 某些浏览器可能不支持自定义 MIME 类型
            console.log('⚠️ 无法从剪贴板获取自定义类型数据');
        }
        
        // 方法 2：如果剪贴板中没有，尝试从全局变量获取（备用方案）
        if (!sourceData) {
            const globalSource = (window as any).__binderClipboardSource;
            const globalTimestamp = (window as any).__binderClipboardTimestamp;
            
            // 检查时间戳是否在 5 秒内（避免使用过期的引用数据）
            if (globalSource && globalTimestamp && Date.now() - globalTimestamp < 5000) {
                sourceData = globalSource;
                console.log('✅ 从全局变量获取引用元数据');
                // 清除全局变量
                delete (window as any).__binderClipboardSource;
                delete (window as any).__binderClipboardTimestamp;
            }
        }
        
        // 方法 3：检查是否是从当前编辑器复制的内容（通过检查文件路径匹配）
        if (!sourceData && text) {
            const activeEditorTab = getEditorActiveTab();
            if (activeEditorTab?.filePath) {
                // 如果粘贴的文本与编辑器当前内容的一部分匹配，可能是从编辑器复制的
                // 这里使用简单的启发式方法：如果文本长度合理且编辑器包含这段文字
                if (text.length > 10 && text.length < 10000 && activeEditorTab.content.includes(text)) {
                    console.log('🔍 检测到可能是从编辑器复制的文本，创建引用');
                    sourceData = JSON.stringify({
                        filePath: activeEditorTab.filePath,
                        fileName: activeEditorTab.fileName,
                        lineRange: { start: 1, end: 1 }, // 无法精确获取行号，使用默认值
                        charRange: { start: 0, end: text.length },
                    });
                }
            }
        }
        
        // 方法 4：检查是否是引用格式字符串（备用方案）
        if (!sourceData && text) {
            const { parseReferenceFormatString } = await import('../../utils/referenceHelpers');
            const parsed = parseReferenceFormatString(text.trim());
            if (parsed) {
                console.log('🔍 检测到引用格式字符串，尝试解析:', parsed);
                
                // 尝试从文件树中查找文件路径
                const { currentWorkspace, fileTree } = useFileStore.getState();
                const { flattenFileTree } = await import('../../utils/fileTreeUtils');
                const allFiles = fileTree ? flattenFileTree(fileTree) : [];
                const matchedFile = allFiles.find(f => f.name === parsed.fileName);
                
                if (matchedFile && currentWorkspace) {
                    const filePath = matchedFile.path || `${currentWorkspace}/${parsed.fileName}`;
                    if (parsed.type === 'table') {
                        // 表格引用
                        sourceData = JSON.stringify({
                            filePath,
                            fileName: parsed.fileName,
                            type: 'table',
                            sheetName: parsed.sheetName,
                            cellRef: parsed.cellRef,
                        });
                    } else {
                        // 文本引用
                        sourceData = JSON.stringify({
                            filePath,
                            fileName: parsed.fileName,
                            lineRange: { start: 1, end: 1 },
                            charRange: { start: 0, end: 0 },
                        });
                    }
                    console.log('✅ 从引用格式字符串解析出引用元数据');
                } else {
                    console.warn('⚠️ 无法找到文件:', parsed.fileName);
                }
            }
        }
        
        // 如果有文本和来源信息，创建引用
        if (text && sourceData) {
            try {
                e.preventDefault(); // 阻止默认粘贴行为，改为创建引用
                
                const source = JSON.parse(sourceData);
                
                // 判断是表格引用还是文本引用
                if (source.type === 'table') {
                    // 创建表格引用
                    const { ReferenceType } = await import('../../types/reference');
                    const tableRef: import('../../types/reference').TableReference = {
                        id: `ref-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                        type: ReferenceType.TABLE,
                        createdAt: Date.now(),
                        sourceFile: source.filePath,
                        fileName: source.fileName || source.filePath.split('/').pop() || source.filePath.split('\\').pop() || '未命名文件',
                        rowRange: source.rowIndex !== undefined ? { start: source.rowIndex + 1, end: source.rowIndex + 1 } : undefined,
                        columnRange: source.colIndex !== undefined ? { start: source.colIndex + 1, end: source.colIndex + 1 } : undefined,
                    };
                    
                    console.log('✅ 创建表格引用:', {
                        sourceFile: source.filePath,
                        cellRef: source.cellRef,
                        sheetName: source.sheetName,
                    });
                    
                    if (tabId) {
                        addReference(tabId, tableRef);
                    } else {
                        // 如果没有标签页，先创建标签页再添加引用
                        const newTabId = onCreateTab ? (() => {
                            onCreateTab(pendingMode);
                            return tabs[tabs.length - 1]?.id;
                        })() : createTab(undefined, pendingMode);
                        if (newTabId) {
                            addReference(newTabId, tableRef);
                            setActiveTab(newTabId);
                        }
                    }
                } else {
                    // 创建文本引用
                    const { createTextReferenceFromClipboard, enrichTextReferenceAnchor } = await import('../../utils/referenceHelpers');
                    const textRefBase = createTextReferenceFromClipboard(
                        {
                            filePath: source.filePath,
                            fileName: source.fileName,
                            lineRange: source.lineRange || { start: 1, end: 1 },
                            charRange: source.charRange || { start: 0, end: text.length },
                            startBlockId: source.startBlockId,
                            endBlockId: source.endBlockId,
                            blockId: source.blockId,
                            startOffset: source.startOffset,
                            endOffset: source.endOffset,
                        },
                        text
                    );
                    
                    const textRefPartial: TextReference = {
                        ...textRefBase,
                        id: `ref-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                        createdAt: Date.now(),
                    };
                    // 若四元组缺失，尝试从 editor DOM 按行号补齐（精确引用锚点升级）
                    const textRef = await enrichTextReferenceAnchor(textRefPartial);
                    
                    console.log('✅ 创建文本引用:', {
                        contentLength: text.length,
                        sourceFile: source.filePath,
                        lineRange: source.lineRange,
                        hasAnchor: !!textRef.textReference,
                    });
                    
                    if (tabId) {
                        addReference(tabId, textRef);
                    } else {
                        // 如果没有标签页，先创建标签页再添加引用
                        const newTabId = onCreateTab ? (() => {
                            onCreateTab(pendingMode);
                            return tabs[tabs.length - 1]?.id;
                        })() : createTab(undefined, pendingMode);
                        if (newTabId) {
                            addReference(newTabId, textRef);
                            setActiveTab(newTabId);
                        }
                    }
                }
                
                // 显示提示（可选）
                // toast.success(`已添加引用: ${source.fileName || '未命名文件'}`);
            } catch (error) {
                console.error('❌ 解析来源信息失败:', error);
                // 解析失败时，允许正常粘贴
            }
        }
    };
    
    const handleSend = async () => {
        if (!input.trim() || isStreaming) return;
        
        // 如果没有标签页，先创建标签页
        let currentTabId = tabId;
        if (!currentTabId) {
            // 如果有 onCreateTab 回调，使用它创建标签页（避免重复创建）
            if (onCreateTab) {
                onCreateTab(pendingMode);
                // 等待标签页创建完成
                await new Promise(resolve => setTimeout(resolve, 50));
                // 获取最新创建的标签页
                const latestTab = tabs[tabs.length - 1];
                if (latestTab) {
                    currentTabId = latestTab.id;
                    setActiveTab(currentTabId);
                } else {
                    console.error('❌ 创建标签页失败');
                    return;
                }
            } else {
                // 直接创建标签页（使用 pendingMode）
                currentTabId = createTab(undefined, pendingMode);
                setActiveTab(currentTabId);
            }
        }
        
        if (!currentTabId) {
            console.error('❌ 无法获取标签页 ID');
            return;
        }
        
        // 读取引用列表（后端 constraint 层注入内容，前端仅用于 displayNodes）
        const { getReferences } = useReferenceStore.getState();
        const refs = getReferences(currentTabId);

        let content = input.trim();
        // 消息记录展示：结构化节点，引用以标签形式渲染（与输入框一致）
        const displayNodes: DisplayNode[] = input.trim()
            ? [{ type: 'text', content: refs.length ? input.trim() + '\n\n' : input.trim() }, ...refs.map(r => ({ type: 'ref' as const, displayText: getReferenceDisplayText(r) }))]
            : refs.map(r => ({ type: 'ref' as const, displayText: getReferenceDisplayText(r) }));
        
        setInput('');
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
        }
        
        // 发送消息后清除引用
        await sendMessage(currentTabId, content, { displayNodes: displayNodes.length > 0 ? displayNodes : undefined });
        clearReferences(currentTabId);
    };
    
    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        // 如果选择器打开，让选择器处理键盘事件
        if (mentionState?.show) {
            // 选择器会处理 Enter、ArrowUp、ArrowDown、Escape
            return;
        }
        
        // 处理回车键发送消息
        if (e.key === 'Enter' && !e.shiftKey) {
            // 检查是否正在使用中文输入法（输入法组合中）
            // 方法1：使用原生事件属性 isComposing（最准确，实时反映输入法状态）
            const nativeIsComposing = (e.nativeEvent as KeyboardEvent).isComposing;
            
            // 方法2：检查 ref 状态
            const refIsComposing = isComposingRef.current;
            
            // 方法3：检查输入法是否刚刚结束（在 100ms 内，可能是回车确认输入）
            const justEndedComposition = Date.now() - compositionEndTimeRef.current < 100;
            
            // 如果满足任一条件，说明正在或刚刚在输入法组合中，回车应该用于确认输入
            if (nativeIsComposing || refIsComposing || justEndedComposition) {
                // 正在输入法组合中或刚刚结束，让输入法处理回车（确认输入），不发送消息
                console.log('🔤 输入法状态检测:', { 
                    nativeIsComposing, 
                    refIsComposing, 
                    justEndedComposition,
                    timeSinceEnd: Date.now() - compositionEndTimeRef.current 
                });
                return;
            }
            
            e.preventDefault();
            handleSend();
        }
    };
    
    // 处理中文输入法开始
    const handleCompositionStart = () => {
        isComposingRef.current = true;
        compositionEndTimeRef.current = 0; // 重置结束时间
        console.log('🔤 输入法组合开始');
    };
    
    // 处理中文输入法结束（确认输入）
    const handleCompositionEnd = (_e: React.CompositionEvent<HTMLTextAreaElement>) => {
        // 记录输入法结束的时间
        compositionEndTimeRef.current = Date.now();
        
        // 延迟重置状态，确保 keydown 事件能正确检测到
        // 因为 compositionend 可能在 keydown 之后触发
        setTimeout(() => {
            isComposingRef.current = false;
            console.log('🔤 输入法组合结束，时间戳:', compositionEndTimeRef.current);
        }, 0);
    };
    
    // 处理 @ 选择器选择（当前支持 file / memory / kb / template / chat）
    const handleMentionSelect = async (item: MentionItem) => {
        if (!textareaRef.current || !tabId) return;
        
        const textarea = textareaRef.current;
        const selectionStart = textarea.selectionStart;
        const textBeforeCursor = input.substring(0, selectionStart);
        
        const atMatch = textBeforeCursor.match(/@([^\s@]*)$/);
        if (!atMatch) return;
        
        const atIndex = textBeforeCursor.lastIndexOf('@');
        const beforeAt = input.substring(0, atIndex);
        const afterCursor = input.substring(selectionStart);
        const replacement = `@${item.name} `;
        const newInput = `${beforeAt}${replacement}${afterCursor}`;
        setInput(newInput);
        setMentionState(null);
        
        // 根据 item.type 添加对应引用
        if (item.type === 'file' && item.path) {
            addReference(tabId, {
                id: '',
                type: ReferenceType.FILE,
                createdAt: Date.now(),
                path: item.path,
                name: item.name,
            });
        } else if (item.type === 'memory') {
            const memoryId = item.memoryId || (item.id.startsWith('memory-') ? item.id.slice('memory-'.length) : '');
            if (!memoryId) return;
            addReference(tabId, {
                id: '',
                type: ReferenceType.MEMORY,
                createdAt: Date.now(),
                memoryId,
                name: item.name,
                itemCount: 1,
                items: item.memoryContent ? [{ id: memoryId, content: item.memoryContent }] : undefined,
            });
        } else if (item.type === 'chat' && item.chatTabId) {
            const chatTab = tabs.find(t => t.id === item.chatTabId);
            if (chatTab) {
                addReference(tabId, {
                    id: '',
                    type: ReferenceType.CHAT,
                    createdAt: Date.now(),
                    chatTabId: item.chatTabId,
                    chatTabTitle: item.name,
                    messageIds: chatTab.messages.map(m => m.id),
                    messageRange: { start: 0, end: chatTab.messages.length },
                });
            }
        } else if (item.type === 'kb' && item.kbId && currentWorkspace) {
            const knowledgeRef = await buildKnowledgeReference(currentWorkspace, {
                kbId: item.kbId,
                entryId: item.entryId ?? null,
                documentId: item.documentId ?? null,
                entryTitle: item.name,
                preview: item.preview ?? null,
                assetKind: item.assetKind ?? null,
            });
            addReference(tabId, knowledgeRef);
        } else if (item.type === 'template' && item.templateId) {
            addReference(tabId, {
                id: '',
                type: ReferenceType.TEMPLATE,
                createdAt: Date.now(),
                templateId: item.templateId,
                templateName: item.name,
                templateType: 'workflow',
            });
        }
        
        setTimeout(() => {
            textarea.focus();
            const newCursorPos = beforeAt.length + replacement.length;
            textarea.setSelectionRange(newCursorPos, newCursorPos);
        }, 0);
    };
    
    const handleRegenerate = async () => {
        if (!tabId) return;
        await regenerate(tabId);
    };
    
    // 处理停止AI回复
    const handleStop = async () => {
        if (!tabId || !isStreaming) return;
        
        try {
            // ⚠️ 关键修复：立即更新消息的 isLoading 状态，让停止按钮立即消失
            const { tabs, setMessageLoading } = useChatStore.getState();
            const currentTab = tabs.find(t => t.id === tabId);
            if (currentTab) {
                // 找到所有正在加载的消息，立即设置为 false
                currentTab.messages.forEach(msg => {
                    if (msg.isLoading) {
                        setMessageLoading(tabId, msg.id, false);
                    }
                });
            }
            
            // 发送取消请求到后端
            await invoke('ai_cancel_chat_stream', { tabId });
            console.log('✅ 已发送停止请求并更新消息状态');
        } catch (error) {
            console.error('❌ 停止AI回复失败:', error);
            // 即使后端调用失败，也要确保前端状态更新
            const { tabs, setMessageLoading } = useChatStore.getState();
            const currentTab = tabs.find(t => t.id === tabId);
            if (currentTab) {
                currentTab.messages.forEach(msg => {
                    if (msg.isLoading) {
                        setMessageLoading(tabId, msg.id, false);
                    }
                });
            }
        }
    };
    
    return (
        <div 
            ref={containerRef}
            className="relative flex-shrink-0 border-t border-gray-200 dark:border-gray-700 p-4 bg-white dark:bg-gray-800"
            onDrop={handleDrop}
            onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                // 检查是否是从文件树拖拽的文件（通过检查数据类型）
                const types = Array.from(e.dataTransfer.types);
                const hasFilePath = types.includes('application/file-path') || types.includes('text/plain');
                const hasFiles = types.includes('Files');
                const hasBinderRef =
                    types.includes('application/binder-reference-memory') ||
                    types.includes('application/binder-reference-chat') ||
                    types.includes('application/binder-reference-kb');
                
                if (hasFilePath || hasFiles || hasBinderRef) {
                    e.dataTransfer.dropEffect = 'copy'; // 显示复制图标（创建引用）
                } else {
                    e.dataTransfer.dropEffect = 'none';
                }
            }}
        >
            {hasMessages && !isStreaming && (
                <div className="mb-2 flex justify-end">
                    <button
                        onClick={handleRegenerate}
                        className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 flex items-center gap-1"
                    >
                        <ArrowPathIcon className="w-3 h-3" />
                        <span>重新生成</span>
                    </button>
                </div>
            )}
            
            <div className="flex items-end gap-2">
                <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onPaste={handlePaste}
                    onCompositionStart={handleCompositionStart}
                    onCompositionEnd={handleCompositionEnd}
                    placeholder="输入消息... (Shift+Enter 换行, 可拖拽文件/图片)"
                    disabled={isStreaming}
                    rows={1}
                    className="
                        flex-1 resize-none px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                        focus:outline-none focus:ring-2 focus:ring-blue-500
                        bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                        disabled:opacity-50 disabled:cursor-not-allowed
                        max-h-32 overflow-y-auto
                    "
                />
                {isStreaming ? (
                    // AI正在回复时，显示停止按钮
                    <>
                        <style>{`
                            @keyframes stopIconFlicker {
                                0%, 100% { opacity: 1; }
                                50% { opacity: 0.6; }
                            }
                            .stop-icon-flicker {
                                animation: stopIconFlicker 1.5s ease-in-out infinite;
                            }
                        `}</style>
                        <button
                            onClick={handleStop}
                            className="
                                relative px-4 py-2 bg-blue-600/70 text-white rounded-lg
                                hover:bg-blue-600/80 active:bg-blue-600/90
                                flex items-center gap-2 transition-all duration-200
                                cursor-pointer backdrop-blur-sm
                                active:scale-95
                            "
                        >
                            <StopIcon className="w-5 h-5 stop-icon-flicker" />
                            <span>停止</span>
                        </button>
                    </>
                ) : (
                    // AI未回复时，显示发送按钮
                    <button
                        onClick={handleSend}
                        disabled={!input.trim()}
                        className="
                            relative px-4 py-2 bg-blue-600 text-white rounded-lg
                            hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed
                            flex items-center gap-2 transition-colors
                        "
                    >
                        <PaperAirplaneIcon className="w-5 h-5" />
                        <span>发送</span>
                    </button>
                )}
            </div>

            {/* @ 语法选择器 Phase 1.2：五类树状、点选/字符匹配，定位相对于 containerRef */}
            {mentionState?.show && (
                <MentionSelector
                    query={mentionState.query}
                    itemsByCategory={itemsByCategory}
                    getItemsByCategory={getItemsByCategory}
                    position={mentionState.position}
                    onSelect={handleMentionSelect}
                    onClose={() => setMentionState(null)}
                />
            )}
        </div>
    );
};
