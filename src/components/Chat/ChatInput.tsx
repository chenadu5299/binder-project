import React, { useState, useRef, useEffect } from 'react';
import { PaperAirplaneIcon, ArrowPathIcon, StopIcon } from '@heroicons/react/24/outline';
import { useChatStore } from '../../stores/chatStore';
import { useReferenceStore } from '../../stores/referenceStore';
import { useFileStore } from '../../stores/fileStore';
import { useEditorStore } from '../../stores/editorStore';
import { ReferenceTags } from './ReferenceTags';
import { MentionSelector, MentionItem } from './MentionSelector';
import { ReferenceType, TextReference, FileReference, ImageReference, MemoryReference, LinkReference } from '../../types/reference';
import { invoke } from '@tauri-apps/api/core';
import { flattenFileTree, filterFiles } from '../../utils/fileTreeUtils';
import { memoryService } from '../../services/memoryService';
import { extractUrls } from '../../utils/urlDetector';

interface ChatInputProps {
    tabId: string | null; // 可以为 null（没有标签页时）
    pendingMode?: 'agent' | 'chat'; // 待创建标签页的模式
    onCreateTab?: (mode: 'agent' | 'chat') => void; // 创建标签页的回调
}

export const ChatInput: React.FC<ChatInputProps> = ({ tabId, pendingMode = 'agent', onCreateTab }) => {
    const { sendMessage, regenerate, tabs, createTab, setActiveTab } = useChatStore();
    const { addReference, removeReference, getReferences, clearReferences } = useReferenceStore();
    const { currentWorkspace, fileTree } = useFileStore();
    const { getActiveTab: getEditorActiveTab } = useEditorStore();
    const [input, setInput] = useState('');
    const [mentionState, setMentionState] = useState<{
        show: boolean;
        query: string;
        type: 'file' | 'memory' | 'knowledge';
        position: { top: number; left: number };
    } | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const isComposingRef = useRef<boolean>(false); // 用于跟踪是否正在使用中文输入法
    const compositionEndTimeRef = useRef<number>(0); // 记录输入法结束的时间，用于判断回车是否用于确认输入
    const tab = tabId ? tabs.find(t => t.id === tabId) : null;
    const hasMessages = tab && tab.messages.length > 0;
    const isStreaming = tab ? tab.messages.some(m => m.isLoading) : false;
    const references = tabId ? getReferences(tabId) : [];
    
    // 自动调整高度
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
        }
    }, [input]);
    
    // 检测 @ 语法并显示选择器
    useEffect(() => {
        if (!textareaRef.current || !containerRef.current) return;
        
        const textarea = textareaRef.current;
        const selectionStart = textarea.selectionStart;
        const textBeforeCursor = input.substring(0, selectionStart);
        
        // 检测 @ 语法（从光标位置向前查找）
        const atMatch = textBeforeCursor.match(/@([^\s@]*)$/);
        
        if (atMatch) {
            const query = atMatch[1];
            const atIndex = textBeforeCursor.lastIndexOf('@');
            
            // 检查是否是 @记忆库: 格式
            const memoryMatch = textBeforeCursor.match(/@记忆库[：:]([^\s@]*)$/);
            const mentionType = memoryMatch ? 'memory' : 'file';
            const mentionQuery = memoryMatch ? memoryMatch[1] : query;
            
            // 计算选择器位置（相对于容器）
            const textareaRect = textarea.getBoundingClientRect();
            const containerRect = containerRef.current.getBoundingClientRect();
            
            // 计算 @ 符号在文本中的位置
            const textBeforeAt = input.substring(0, atIndex);
            const lines = textBeforeAt.split('\n');
            const lineNumber = lines.length - 1;
            const lineHeight = 24; // 估算行高
            
            const top = textareaRect.top - containerRect.top + (lineNumber * lineHeight) + 30;
            const left = textareaRect.left - containerRect.left;
            
            setMentionState({
                show: true,
                query: mentionQuery,
                type: mentionType,
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
        
        // 优先检查是否是从文件树拖拽的文件路径
        // 尝试多种方式获取数据（兼容性）
        let filePath = e.dataTransfer.getData('application/file-path');
        if (!filePath) {
            filePath = e.dataTransfer.getData('text/plain');
        }
        
        const isDirectory = e.dataTransfer.getData('application/is-directory') === 'true';
        
        console.log('📥 拖拽数据:', { filePath, isDirectory });
        
        if (filePath && !isDirectory) {
            // 从文件树拖拽的文件，创建文件引用
            console.log('✅ 检测到文件树拖拽，创建文件引用:', filePath);
            await handleFileTreeReference(filePath);
            return;
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
    
    // 处理图片文件
    const handleImageFile = async (file: File) => {
        if (!currentWorkspace) {
            console.error('未打开工作区');
            return;
        }
        
        try {
            const arrayBuffer = await file.arrayBuffer();
            const imageData = Array.from(new Uint8Array(arrayBuffer));
            
            const relativePath = await invoke<string>('save_chat_image', {
                workspacePath: currentWorkspace,
                imageData,
                fileName: file.name,
            });
            
            const imageRef: ImageReference = {
                id: '',
                type: ReferenceType.IMAGE,
                createdAt: Date.now(),
                path: relativePath,
                name: file.name,
                size: file.size,
                mimeType: file.type,
            };
            
            addReference(tabId, imageRef);
        } catch (error) {
            console.error('保存图片失败:', error);
        }
    };
    
    // 处理从文件树拖拽的文件引用
    const handleFileTreeReference = async (filePath: string) => {
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
    
    // 处理文件引用
    const handleFileReference = async (file: File) => {
        // 对于拖拽的文件，需要获取完整路径
        // 这里暂时使用文件名，后续可以通过文件选择器获取路径
        const fileRef: FileReference = {
            id: `ref-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            type: ReferenceType.FILE,
            createdAt: Date.now(),
            path: file.name, // 临时使用文件名
            name: file.name,
            size: file.size,
            mimeType: file.type,
        };
        
        addReference(tabId, fileRef);
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
                const allFiles = flattenFileTree(fileTree);
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
                    const { createTextReferenceFromClipboard } = await import('../../utils/referenceHelpers');
                    const textRefBase = createTextReferenceFromClipboard(
                        {
                            filePath: source.filePath,
                            fileName: source.fileName,
                            lineRange: source.lineRange || { start: 1, end: 1 },
                            charRange: source.charRange || { start: 0, end: text.length },
                        },
                        text
                    );
                    
                    const textRef: TextReference = {
                        ...textRefBase,
                        id: `ref-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                        createdAt: Date.now(),
                    };
                    
                    console.log('✅ 创建文本引用:', {
                        contentLength: text.length,
                        sourceFile: source.filePath,
                        lineRange: source.lineRange,
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
        
        // 格式化引用信息
        const { formatForAI } = useReferenceStore.getState();
        const referenceText = await formatForAI(currentTabId);
        
        // 合并消息内容和引用
        let content = input.trim();
        if (referenceText) {
            content = `${content}\n\n[引用信息]\n${referenceText}`;
        }
        
        const inputContent = input.trim();
        setInput('');
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
        }
        
        // 发送消息后清除引用
        await sendMessage(currentTabId, content);
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
    const handleCompositionEnd = (e: React.CompositionEvent<HTMLTextAreaElement>) => {
        // 记录输入法结束的时间
        compositionEndTimeRef.current = Date.now();
        
        // 延迟重置状态，确保 keydown 事件能正确检测到
        // 因为 compositionend 可能在 keydown 之后触发
        setTimeout(() => {
            isComposingRef.current = false;
            console.log('🔤 输入法组合结束，时间戳:', compositionEndTimeRef.current);
        }, 0);
    };
    
    // 处理 @ 选择器选择
    const handleMentionSelect = async (item: MentionItem) => {
        if (!textareaRef.current) return;
        
        const textarea = textareaRef.current;
        const selectionStart = textarea.selectionStart;
        const textBeforeCursor = input.substring(0, selectionStart);
        
        // 查找 @ 的位置
        const atMatch = textBeforeCursor.match(/@(记忆库[：:])?([^\s@]*)$/);
        if (!atMatch) return;
        
        const atIndex = textBeforeCursor.lastIndexOf('@');
        const beforeAt = input.substring(0, atIndex);
        const afterCursor = input.substring(selectionStart);
        
        // 根据类型构建替换文本
        let replacement: string;
        if (mentionState?.type === 'memory') {
            replacement = `@记忆库:${item.name} `;
        } else {
            replacement = `@${item.name} `;
        }
        
        const newInput = `${beforeAt}${replacement}${afterCursor}`;
        setInput(newInput);
        setMentionState(null);
        
        // 根据类型添加引用
        if (item.type === 'file' && item.path) {
            const fileRef: FileReference = {
                id: '',
                type: ReferenceType.FILE,
                createdAt: Date.now(),
                path: item.path,
                name: item.name,
            };
            addReference(tabId, fileRef);
        } else if (item.type === 'memory') {
            // 获取该记忆库的所有记忆项
            if (currentWorkspace) {
                try {
                    const memories = await memoryService.getAllMemories(currentWorkspace);
                    const memoryItems = memories.filter(m => m.entity_name === item.name);
                    
                    const memoryRef: MemoryReference = {
                        id: '',
                        type: ReferenceType.MEMORY,
                        createdAt: Date.now(),
                        memoryId: `memory-${item.name}`,
                        name: item.name,
                        itemCount: memoryItems.length,
                    };
                    addReference(tabId, memoryRef);
                } catch (error) {
                    console.error('获取记忆库详情失败:', error);
                }
            }
        }
        
        // 聚焦到输入框并设置光标位置
        setTimeout(() => {
            textarea.focus();
            const newCursorPos = beforeAt.length + replacement.length;
            textarea.setSelectionRange(newCursorPos, newCursorPos);
        }, 0);
    };
    
    // 获取文件列表用于 @ 选择器
    const getFileItems = (): MentionItem[] => {
        if (!fileTree) return [];
        
        const flatTree = flattenFileTree(fileTree);
        const files = filterFiles(flatTree);
        
        return files.map(file => ({
            id: file.path,
            name: file.name,
            path: file.path,
            type: 'file' as const,
        }));
    };
    
    // 获取记忆库列表用于 @ 选择器
    const [memoryItems, setMemoryItems] = useState<MentionItem[]>([]);
    
    useEffect(() => {
        const loadMemories = async () => {
            if (!currentWorkspace) return;
            
            try {
                const memories = await memoryService.getAllMemories(currentWorkspace);
                // 按实体名称分组（同一实体名称的记忆项视为一个记忆库）
                const memoryMap = new Map<string, number>();
                memories.forEach(m => {
                    const count = memoryMap.get(m.entity_name) || 0;
                    memoryMap.set(m.entity_name, count + 1);
                });
                
                const items: MentionItem[] = Array.from(memoryMap.keys()).map((name) => ({
                    id: `memory-${name}`,
                    name,
                    type: 'memory' as const,
                }));
                
                setMemoryItems(items);
            } catch (error) {
                console.error('加载记忆库失败:', error);
            }
        };
        
        loadMemories();
    }, [currentWorkspace]);
    
    // 根据类型获取选择器项目
    const getMentionItems = (): MentionItem[] => {
        if (mentionState?.type === 'memory') {
            return memoryItems;
        }
        return getFileItems();
    };
    
    const handleRegenerate = async () => {
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
            className="flex-shrink-0 border-t border-gray-200 dark:border-gray-700 p-4 bg-white dark:bg-gray-800"
            onDrop={handleDrop}
            onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                // 检查是否是从文件树拖拽的文件（通过检查数据类型）
                const types = Array.from(e.dataTransfer.types);
                const hasFilePath = types.includes('application/file-path') || types.includes('text/plain');
                const hasFiles = types.includes('Files');
                
                if (hasFilePath || hasFiles) {
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
            
            {/* 引用标签（仅在已有标签页时显示） */}
            {tabId && (
                <ReferenceTags 
                    references={references} 
                    onRemove={(refId) => removeReference(tabId, refId)} 
                />
            )}
            
            <div className="flex items-end gap-2 relative">
                {/* @ 语法选择器 */}
                {mentionState?.show && (
                    <MentionSelector
                        query={mentionState.query}
                        type={mentionState.type}
                        items={getMentionItems()}
                        position={mentionState.position}
                        onSelect={handleMentionSelect}
                        onClose={() => setMentionState(null)}
                    />
                )}
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
        </div>
    );
};

