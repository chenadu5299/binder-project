import React, { useState, useRef, useEffect } from 'react';
import { PaperAirplaneIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
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
    tabId: string;
}

export const ChatInput: React.FC<ChatInputProps> = ({ tabId }) => {
    const { sendMessage, regenerate, tabs } = useChatStore();
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
    const tab = tabs.find(t => t.id === tabId);
    const hasMessages = tab && tab.messages.length > 0;
    const isStreaming = tab && tab.messages.some(m => m.isLoading);
    const references = getReferences(tabId);
    
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

    // 检测输入中的 URL 并自动创建链接引用
    useEffect(() => {
        if (!input.trim()) return;
        
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

    // Agent 模式：自动引用当前编辑器打开的文档
    useEffect(() => {
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
        
        const files = Array.from(e.dataTransfer.files);
        if (files.length === 0) return;
        
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
    
    // 处理文件引用
    const handleFileReference = async (file: File) => {
        // 对于拖拽的文件，需要获取完整路径
        // 这里暂时使用文件名，后续可以通过文件选择器获取路径
        const fileRef: FileReference = {
            id: '',
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
        
        // 检查是否有文本和来源信息
        const text = e.clipboardData.getData('text/plain');
        const sourceData = e.clipboardData.getData('application/x-binder-source');
        
        if (text && sourceData) {
            try {
                const source = JSON.parse(sourceData);
                const textRef: TextReference = {
                    id: '',
                    type: ReferenceType.TEXT,
                    createdAt: Date.now(),
                    content: text,
                    sourceFile: source.filePath,
                    lineRange: source.lineRange,
                    charRange: source.charRange,
                };
                
                addReference(tabId, textRef);
            } catch (error) {
                console.error('解析来源信息失败:', error);
            }
        }
    };
    
    const handleSend = async () => {
        if (!input.trim() || isStreaming) return;
        
        // 格式化引用信息
        const { formatForAI } = useReferenceStore.getState();
        const referenceText = await formatForAI(tabId);
        
        // 合并消息内容和引用
        let content = input.trim();
        if (referenceText) {
            content = `${content}\n\n[引用信息]\n${referenceText}`;
        }
        
        setInput('');
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
        }
        
        // 发送消息后清除引用
        await sendMessage(tabId, content);
        clearReferences(tabId);
    };
    
    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        // 如果选择器打开，让选择器处理键盘事件
        if (mentionState?.show) {
            // 选择器会处理 Enter、ArrowUp、ArrowDown、Escape
            return;
        }
        
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
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
    
    return (
        <div 
            ref={containerRef}
            className="flex-shrink-0 border-t border-gray-200 dark:border-gray-700 p-4 bg-white dark:bg-gray-800"
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
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
            
            {/* 引用标签 */}
            <ReferenceTags 
                references={references} 
                onRemove={(refId) => removeReference(tabId, refId)} 
            />
            
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
                <button
                    onClick={handleSend}
                    disabled={!input.trim() || isStreaming}
                    className="
                        px-4 py-2 bg-blue-600 text-white rounded-lg
                        hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed
                        flex items-center gap-2 transition-colors
                    "
                >
                    <PaperAirplaneIcon className="w-5 h-5" />
                    <span>发送</span>
                </button>
            </div>
            
            {isStreaming && (
                <div className="mt-2 text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                    <span>AI 正在思考...</span>
                </div>
            )}
        </div>
    );
};

