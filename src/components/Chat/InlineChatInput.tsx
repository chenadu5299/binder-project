// 内联引用输入框组件（使用 contentEditable 支持内联引用标签）

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { PaperAirplaneIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import { useChatStore } from '../../stores/chatStore';
import { useReferenceStore } from '../../stores/referenceStore';
import { Reference, ReferenceType, FileReference, ImageReference, FolderReference } from '../../types/reference';
import { ReferenceManagerButton } from './ReferenceManagerButton';
import { parseEditorContent, formatNodesForAI, InlineInputNode, getReferenceDisplayText, getReferenceIcon } from '../../utils/inlineContentParser';
import { invoke } from '@tauri-apps/api/core';
import { useFileStore } from '../../stores/fileStore';
import './InlineChatInput.css';

interface InlineChatInputProps {
    tabId: string | null;
    pendingMode?: 'agent' | 'chat';
    onCreateTab?: (mode: 'agent' | 'chat') => string | void; // 可以返回 tabId 或 void
}

export const InlineChatInput: React.FC<InlineChatInputProps> = ({
    tabId,
    pendingMode = 'agent',
    onCreateTab,
}) => {
    const { sendMessage, regenerate, tabs, createTab, setActiveTab } = useChatStore();
    const { getReferences, clearReferences, addReference, removeReference } = useReferenceStore();
    const { currentWorkspace } = useFileStore();
    const editorRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const isComposingRef = useRef<boolean>(false);
    const compositionEndTimeRef = useRef<number>(0);
    
    // 确保这些值在使用前已初始化
    const tab = React.useMemo(() => {
        return tabId ? tabs.find(t => t.id === tabId) : null;
    }, [tabId, tabs]);
    
    const hasMessages = React.useMemo(() => {
        return tab ? tab.messages.length > 0 : false;
    }, [tab]);
    
    const isStreaming = React.useMemo(() => {
        return tab ? tab.messages.some(m => m.isLoading) : false;
    }, [tab]);
    
    const references = React.useMemo(() => {
        return tabId ? getReferences(tabId) : [];
    }, [tabId, getReferences]);
    
    const refMap = React.useMemo(() => {
        if (!references || references.length === 0) {
            return new Map<string, Reference>();
        }
        return new Map(references.map(ref => [ref.id, ref]));
    }, [references]);
    
    // 从输入框中删除引用标签
    const handleRemoveReferenceTag = useCallback((refId: string) => {
        if (!editorRef.current) return;
        
        const editor = editorRef.current;
        const refTag = editor.querySelector(`.inline-reference-tag[data-ref-id="${refId}"]`) as HTMLElement;
        
        if (refTag) {
            refTag.remove();
            // 触发输入事件以更新节点数组
            editor.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }, []);
    
    // 插入引用标签到光标位置
    const handleInsertReference = useCallback((refId: string) => {
        if (!editorRef.current) return;
        
        const editor = editorRef.current;
        const selection = window.getSelection();
        const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
        
        let currentRange = range;
        if (!range || !editor.contains(range.commonAncestorContainer)) {
            // 如果没有选择范围，在末尾插入
            const newNode = document.createTextNode('\u200B'); // 零宽空格占位
            if (editor.lastChild) {
                editor.insertBefore(newNode, null);
            } else {
                editor.appendChild(newNode);
            }
            currentRange = document.createRange();
            currentRange.setStartAfter(newNode);
            currentRange.setEndAfter(newNode);
            selection?.removeAllRanges();
            selection?.addRange(currentRange);
        }
        
        // 创建引用标签元素
        const refTag = document.createElement('span');
        refTag.className = 'inline-reference-tag';
        refTag.contentEditable = 'false';
        refTag.setAttribute('data-ref-id', refId);
        
        // 获取引用：优先使用当前的 refMap，如果没有则从 store 获取
        let ref: Reference | undefined;
        if (refMap && refMap.size > 0) {
            ref = refMap.get(refId);
        }
        if (!ref && tabId) {
            const allRefs = getReferences(tabId);
            ref = allRefs.find(r => r.id === refId);
        }
        if (ref) {
            // 使用已导入的函数
            const displayText = getReferenceDisplayText(ref);
            const icon = getReferenceIcon(ref);
            
            refTag.innerHTML = `
                <span class="ref-icon">${icon}</span>
                <span class="ref-label">${displayText}</span>
                <button class="ref-remove-btn" data-ref-id="${refId}">×</button>
            `;
        } else {
            // 如果引用不存在，显示占位符
            refTag.innerHTML = `
                <span class="ref-icon">📎</span>
                <span class="ref-label">引用 (ID: ${refId})</span>
                <button class="ref-remove-btn" data-ref-id="${refId}">×</button>
            `;
        }
        
        // 在光标位置插入（使用 try-catch 防止 range 无效）
        if (!currentRange) {
            if (editorRef.current) {
                editorRef.current.appendChild(refTag);
            }
            return;
        }
        
        try {
            currentRange.deleteContents();
            currentRange.insertNode(refTag);
            
            // 移动光标到引用标签后面
            const newRange = document.createRange();
            newRange.setStartAfter(refTag);
            newRange.collapse(true);
            selection?.removeAllRanges();
            selection?.addRange(newRange);
        } catch (error) {
            // 备用方案：在末尾插入
            if (editorRef.current) {
                editorRef.current.appendChild(refTag);
                const fallbackRange = document.createRange();
                fallbackRange.setStartAfter(refTag);
                fallbackRange.collapse(true);
                selection?.removeAllRanges();
                selection?.addRange(fallbackRange);
            }
            return;
        }
        
        // 添加文本节点以便继续输入
        const textNode = document.createTextNode('\u200B');
        if (refTag.nextSibling) {
            editor.insertBefore(textNode, refTag.nextSibling);
        } else {
            editor.appendChild(textNode);
        }
        const finalRange = document.createRange();
        finalRange.setStartAfter(textNode);
        finalRange.collapse(true);
        selection?.removeAllRanges();
        selection?.addRange(finalRange);
        
        // 触发输入事件以更新节点数组
        editor.dispatchEvent(new Event('input', { bubbles: true }));
    }, [refMap, tabId, getReferences]);
    
    // 处理输入变化
    const handleInput = useCallback((e: React.FormEvent<HTMLDivElement>) => {
        // 输入变化时不需要做任何处理，发送时直接解析即可
    }, []);
    
    // 发送消息（先定义，因为 handleKeyDown 需要它）
    const handleSend = useCallback(async () => {
        if (!editorRef.current) return;
        
        // 如果没有标签页，先创建标签页
        let currentTabId = tabId;
        if (!currentTabId) {
            if (onCreateTab) {
                const createdTabId = onCreateTab(pendingMode);
                if (createdTabId) {
                    // 如果 onCreateTab 返回了 tabId，直接使用
                    currentTabId = createdTabId;
                } else {
                    // 如果 onCreateTab 没有返回值，等待并查找最新标签页
                    await new Promise(resolve => setTimeout(resolve, 50));
                    const latestTab = tabs[tabs.length - 1];
                    if (latestTab) {
                        currentTabId = latestTab.id;
                        setActiveTab(currentTabId);
                    } else {
                        console.error('❌ 创建标签页失败');
                        return;
                    }
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
        
        // 解析内容为节点数组
        const inputNodes = parseEditorContent(editorRef.current);
        
        // 检查是否有内容（文本或引用）
        const hasText = inputNodes.some(node => node.type === 'text' && node.content?.trim());
        const hasReferences = inputNodes.some(node => node.type === 'reference');
        
        if (!hasText && !hasReferences) {
            return; // 既没有文本也没有引用
        }
        
        // 获取所有引用
        const allRefs = getReferences(currentTabId);
        const refMapForFormat = new Map(allRefs.map(ref => [ref.id, ref]));
        
        console.log('📋 发送前获取引用:', {
            tabId: currentTabId,
            referencesCount: allRefs.length,
            referenceIds: allRefs.map(r => r.id),
            inputNodeRefIds: inputNodes.filter(n => n.type === 'reference').map(n => n.id),
            refMapKeys: Array.from(refMapForFormat.keys()),
        });
        
        // 格式化内容（将引用标签替换为完整信息）
        const fullContent = await formatNodesForAI(inputNodes, refMapForFormat);
        
        console.log('📤 发送给AI的完整内容:', {
            contentLength: fullContent.length,
            contentPreview: fullContent.substring(0, 500) + (fullContent.length > 500 ? '...' : ''),
            hasReferences: hasReferences,
            referenceCount: allRefs.length,
            inputNodesCount: inputNodes.length,
        });
        
        // 清空编辑器
        if (editorRef.current) {
            editorRef.current.innerHTML = '';
            editorRef.current.focus();
        }
        
        // 发送消息
        await sendMessage(currentTabId, fullContent);
        
        // 发送后清除引用（单次引用只对单次聊天有效）
        clearReferences(currentTabId);
        
        // 清理临时文件（延迟 1 小时清理，以便用户可以重新发送）
        try {
            const { extractTempFilePaths, cleanupTempFiles } = await import('../../utils/tempFileCleanup');
            const tempFilePaths = extractTempFilePaths(allRefs);
            if (tempFilePaths.length > 0 && currentWorkspace) {
                cleanupTempFiles(currentWorkspace, tempFilePaths, 3600000); // 1 小时后清理
            }
        } catch (error) {
            console.error('❌ 清理临时文件失败:', error);
        }
    }, [tabId, pendingMode, onCreateTab, tabs, createTab, setActiveTab, getReferences, sendMessage, clearReferences, currentWorkspace]);
    
    // 处理键盘事件
    const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            // 检查是否在输入法组合中
            const isComposing = (e.nativeEvent as KeyboardEvent).isComposing || isComposingRef.current;
            const justEndedComposition = Date.now() - compositionEndTimeRef.current < 100;
            
            if (isComposing || justEndedComposition) {
                return; // 让输入法处理回车
            }
            
            e.preventDefault();
            handleSend();
        }
    }, [handleSend]);
    
    // 处理中文输入法
    const handleCompositionStart = useCallback(() => {
        isComposingRef.current = true;
    }, []);
    
    const handleCompositionEnd = useCallback(() => {
        compositionEndTimeRef.current = Date.now();
        setTimeout(() => {
            isComposingRef.current = false;
        }, 0);
    }, []);
    
    // 处理引用标签移除
    useEffect(() => {
        if (!editorRef.current) return;
        
        const editor = editorRef.current;
        const handleClick = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (target.classList.contains('ref-remove-btn')) {
                e.preventDefault();
                e.stopPropagation();
                
                const refTag = target.closest('.inline-reference-tag') as HTMLElement;
                if (refTag) {
                    const refId = refTag.getAttribute('data-ref-id');
                    if (refId && tabId) {
                        console.log('🗑️ 删除引用标签:', refId);
                        // 使用从 hook 解构的 removeReference
                        removeReference(tabId, refId);
                        
                        // 移除 DOM 元素
                        refTag.remove();
                        
                        // 触发输入事件
                        editor.dispatchEvent(new Event('input', { bubbles: true }));
                    } else {
                        console.warn('⚠️ 无法删除引用标签:', { refId, tabId });
                    }
                }
            }
        };
        
        editor.addEventListener('click', handleClick);
        return () => {
            editor.removeEventListener('click', handleClick);
        };
    }, [tabId, removeReference]);
    
    
    // 处理粘贴（支持从编辑器复制引用）
    const handlePaste = useCallback(async (e: React.ClipboardEvent<HTMLDivElement>) => {
        const items = e.clipboardData.items;
        
        // 立即检查全局变量（在日志之前，避免被清除）
        const globalSourceCheck = (window as any).__binderClipboardSource;
        const globalTimestampCheck = (window as any).__binderClipboardTimestamp;
        
        console.log('📋 收到粘贴事件:', {
            types: Array.from(e.clipboardData.types),
            itemsCount: items.length,
            hasGlobalSource: !!globalSourceCheck,
            globalTimestamp: globalTimestampCheck,
            timeDiff: globalTimestampCheck ? Date.now() - globalTimestampCheck : null,
        });
        
        // 优先检查全局变量（主要方案，因为 dataTransfer 在 copy/paste 之间不共享）
        let sourceData: string | null = null;
        const globalSource = (window as any).__binderClipboardSource;
        const globalTimestamp = (window as any).__binderClipboardTimestamp;
        
        console.log('🔍 检查全局变量:', { 
            hasSource: !!globalSource, 
            timestamp: globalTimestamp,
            timeDiff: globalTimestamp ? Date.now() - globalTimestamp : null,
            isValid: globalTimestamp ? (Date.now() - globalTimestamp < 5000) : false,
        });
        
        // 方法 1：从全局变量获取（最可靠，因为 copy/paste 事件之间数据不共享）
        if (globalSource && globalTimestamp && Date.now() - globalTimestamp < 5000) {
            sourceData = globalSource;
            console.log('✅ 从全局变量获取引用元数据');
            // 清除全局变量
            delete (window as any).__binderClipboardSource;
            delete (window as any).__binderClipboardTimestamp;
        } else if (globalSource) {
            console.warn('⚠️ 全局变量数据已过期或时间戳无效', {
                timestamp: globalTimestamp,
                timeDiff: globalTimestamp ? Date.now() - globalTimestamp : 'null',
                threshold: 5000,
            });
        }
        
        // 方法 2：尝试从 clipboardData 获取自定义类型（备用方案）
        if (!sourceData) {
            try {
                sourceData = e.clipboardData.getData('application/x-binder-source');
                if (sourceData) {
                    console.log('✅ 从 clipboardData 获取到引用元数据');
                }
            } catch (error) {
                console.log('⚠️ 无法从 clipboardData 获取自定义类型数据:', error);
            }
        }
        
        // 方法 3：检查 clipboardData.items 中的自定义类型（备用方案）
        if (!sourceData) {
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                if (item.type === 'application/x-binder-source' || item.type === 'application/json') {
                    try {
                        const blob = await new Promise<Blob>((resolve) => {
                            const file = item.getAsFile();
                            if (file) {
                                resolve(file);
                            } else {
                                resolve(new Blob());
                            }
                        });
                        if (blob.size > 0) {
                            sourceData = await blob.text();
                            console.log('✅ 从 clipboardData.items 获取到引用元数据');
                            break;
                        }
                    } catch (error) {
                        console.warn('⚠️ 读取 clipboardData.items 失败:', error);
                    }
                }
            }
        }
        
        // 如果找到引用元数据，创建引用
        if (sourceData) {
            try {
                e.preventDefault();
                const source = JSON.parse(sourceData);
                const text = e.clipboardData.getData('text/plain');
                
                console.log('📋 解析引用元数据:', {
                    filePath: source.filePath,
                    fileName: source.fileName,
                    text: text?.substring(0, 50) + (text?.length > 50 ? '...' : ''),
                    textLength: text?.length,
                    hasText: !!text,
                    hasFilePath: !!source.filePath,
                });
                
                if (!text) {
                    console.error('❌ 粘贴的文本为空，无法创建引用');
                    return;
                }
                
                if (!source.filePath) {
                    console.error('❌ 引用元数据中没有文件路径，无法创建引用');
                    return;
                }
                
                console.log('✅ 条件满足，开始创建文本引用...');
                
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
                
                console.log('✅ 文本引用基础对象创建成功');
                
                let currentTabId = tabId;
                if (!currentTabId) {
                    console.log('📝 当前没有标签页，创建新标签页...');
                    if (onCreateTab) {
                        onCreateTab(pendingMode);
                    await new Promise(resolve => setTimeout(resolve, 100));
                    // 使用 useChatStore.getState() 获取最新状态，避免依赖 tabs 数组
                    const { tabs: currentTabs } = useChatStore.getState();
                    const latestTab = currentTabs[currentTabs.length - 1];
                    if (latestTab) {
                            currentTabId = latestTab.id;
                            setActiveTab(currentTabId);
                            console.log('✅ 通过 onCreateTab 创建标签页:', currentTabId);
                        } else {
                            console.error('❌ onCreateTab 执行后未找到新标签页');
                        }
                    } else {
                        currentTabId = createTab(undefined, pendingMode);
                        setActiveTab(currentTabId);
                        console.log('✅ 通过 createTab 创建标签页:', currentTabId);
                    }
                } else {
                    console.log('📝 使用现有标签页:', currentTabId);
                }
                
                if (!currentTabId) {
                    console.error('❌ 无法获取或创建标签页 ID');
                    return;
                }
                
                const textRef: import('../../types/reference').TextReference = {
                    ...textRefBase,
                    id: `ref-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    createdAt: Date.now(),
                };
                
                console.log('✅ 创建文本引用对象:', {
                    id: textRef.id,
                    fileName: textRef.fileName,
                    filePath: textRef.sourceFile,
                    contentLength: textRef.content?.length || 0,
                    hasContent: !!textRef.content,
                    preview: textRef.preview?.substring(0, 50) || '',
                    tabId: currentTabId,
                });
                
                const refId = addReference(currentTabId, textRef);
                console.log('✅ 引用已添加到 store, refId:', refId);
                
                // 插入引用标签到光标位置（使用 addReference 返回的 id）
                console.log('📎 准备插入引用标签:', refId);
                handleInsertReference(refId);
                console.log('✅ 引用标签插入完成');
                return;
            } catch (error) {
                console.error('❌ 解析粘贴引用失败:', error);
                // 解析失败时，允许正常粘贴
            }
        }
        
        // 检查是否有图片
        for (const item of Array.from(items)) {
            if (item.type.startsWith('image/')) {
                e.preventDefault();
                console.log('🖼️ 检测到图片粘贴:', item.type);
                
                try {
                    const file = item.getAsFile();
                    if (!file) {
                        console.error('❌ 无法获取图片文件');
                        return;
                    }
                    
                    // 读取图片为 base64
                    const reader = new FileReader();
                    const imageDataUrl = await new Promise<string>((resolve, reject) => {
                        reader.onload = (e) => resolve(e.target?.result as string);
                        reader.onerror = reject;
                        reader.readAsDataURL(file);
                    });
                    
                    // 创建或获取当前标签页
                    let currentTabId = tabId;
                    if (!currentTabId) {
                        if (onCreateTab) {
                            const createdTabId = onCreateTab(pendingMode);
                            if (createdTabId) {
                                currentTabId = createdTabId;
                            } else {
                                await new Promise(resolve => setTimeout(resolve, 100));
                                const latestTab = useChatStore.getState().tabs[useChatStore.getState().tabs.length - 1];
                                if (latestTab) {
                                    currentTabId = latestTab.id;
                                    setActiveTab(currentTabId);
                                } else {
                                    console.error('❌ 创建标签页失败');
                                    return;
                                }
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
                    
                    // 创建图片引用
                    const imageRef: ImageReference = {
                        id: `ref-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                        type: ReferenceType.IMAGE,
                        createdAt: Date.now(),
                        path: file.name || 'pasted-image',
                        name: file.name || 'pasted-image',
                        mimeType: file.type,
                        thumbnail: imageDataUrl, // 使用 thumbnail 字段存储 base64 数据
                    };
                    
                    console.log('✅ 创建粘贴图片引用:', imageRef);
                    const refId = addReference(currentTabId, imageRef);
                    
                    // 插入引用标签到光标位置
                    if (refId && editorRef.current) {
                        console.log('📎 插入图片引用标签:', refId);
                        handleInsertReference(refId);
                    }
                } catch (error) {
                    console.error('❌ 处理图片粘贴失败:', error);
                }
                return;
            }
        }
        
        // 默认粘贴行为（普通文本）
        // contentEditable 会处理默认粘贴
    }, [tabId, pendingMode, onCreateTab, tabs, createTab, setActiveTab, addReference, handleInsertReference]);
    
    const handleRegenerate = useCallback(async () => {
        if (!tabId) return;
        await regenerate(tabId);
    }, [tabId, regenerate]);
    
    // 处理从文件树拖拽的文件引用（优化：先创建引用，再异步加载内容）
    // 注意：必须在 handleDrop 之前定义，避免循环依赖
    const handleFileTreeReference = useCallback(async (filePath: string, currentTabId: string): Promise<string | null> => {
        try {
            console.log('📄 处理文件树引用:', filePath);
            
            if (!filePath || filePath.trim() === '') {
                console.error('❌ 文件路径为空');
                return null;
            }
            
            const fileName = filePath.split('/').pop() || filePath;
            const ext = filePath.split('.').pop()?.toLowerCase();
            
            // 步骤 1：先创建引用（只有路径，不加载内容）
            // 检查是否是图片文件
            const imageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'];
            if (ext && imageExtensions.includes(ext)) {
                const imageRef: ImageReference = {
                    id: `ref-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    type: ReferenceType.IMAGE,
                    createdAt: Date.now(),
                    path: filePath,
                    name: fileName,
                    mimeType: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
                };
                console.log('✅ 创建图片引用（立即）:', imageRef);
                const refId = addReference(currentTabId, imageRef);
                return refId;
            }
            
            // 步骤 1：立即创建文件引用（只有路径）
            const fileRef: FileReference = {
                id: `ref-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                type: ReferenceType.FILE,
                createdAt: Date.now(),
                path: filePath,
                name: fileName,
                // content 和 lineCount 暂时不设置，后续异步加载
            };
            
            console.log('✅ 创建文件引用（立即，仅路径）:', fileRef);
            const refId = addReference(currentTabId, fileRef);
            
            // 步骤 2：异步加载文件内容（后台任务）
            const textExtensions = ['md', 'txt', 'html', 'js', 'ts', 'tsx', 'jsx', 'json', 'css', 'py', 'java', 'cpp', 'c', 'h', 'hpp', 'xml', 'yaml', 'yml', 'sh', 'bat', 'ps1'];
            
            if (ext && textExtensions.includes(ext)) {
                // 异步加载内容（不阻塞 UI）
                setTimeout(async () => {
                    try {
                        console.log('📖 异步加载文件内容:', filePath);
                        const content = await invoke<string>('read_file_content', { path: filePath });
                        const lineCount = content.split('\n').length;
                        
                        console.log('✅ 文件内容加载成功，行数:', lineCount);
                        console.log('📝 文件内容已准备，将在发送消息时通过 formatForAI 按需加载');
                        // 注意：由于 referenceStore 没有 updateReference 方法，
                        // 内容会在 formatForAI 时按需加载，这里只记录日志
                    } catch (error) {
                        console.warn('⚠️ 异步加载文件内容失败:', error);
                        // 不影响引用创建，内容会在 formatForAI 时按需加载
                    }
                }, 0);
            }
            
            return refId;
        } catch (error) {
            console.error('❌ 创建文件引用失败:', error);
            return null;
        }
    }, [addReference, invoke]);
    
    // 将 drop 处理逻辑提取为独立函数，供原生事件和 React 事件共用
    // ⚠️ 必须在 handleFileTreeReference 和 handleInsertReference 之后定义
    const handleDropLogic = useCallback(async (e: DragEvent | React.DragEvent) => {
        // 🔴 关键修复：立即阻止默认行为，防止浏览器在新标签页打开文件或插入到 contentEditable
        e.preventDefault();
        e.stopPropagation();
        
        const dataTransfer = 'dataTransfer' in e ? e.dataTransfer : null;
        if (!dataTransfer) {
            console.error('❌ 拖拽事件没有 dataTransfer');
            return;
        }
        
        console.log('📥 收到拖拽事件 (drop):', {
            target: 'container',
            types: Array.from(dataTransfer.types),
            files: dataTransfer.files.length,
            allTypes: Array.from(dataTransfer.types),
        });
        
        // 如果没有标签页，先创建标签页
        let currentTabId = tabId;
        if (!currentTabId) {
            console.log('📝 拖拽时创建新标签页...');
            if (onCreateTab) {
                const createdTabId = onCreateTab(pendingMode);
                if (createdTabId) {
                    // 如果 onCreateTab 返回了 tabId，直接使用
                    currentTabId = createdTabId;
                    console.log('✅ 通过 onCreateTab 创建标签页:', currentTabId);
                } else {
                    // 如果 onCreateTab 没有返回值，等待并查找最新标签页
                    await new Promise(resolve => setTimeout(resolve, 100));
                    // 使用 useChatStore.getState() 获取最新状态，避免依赖 tabs
                    const latestTab = useChatStore.getState().tabs[useChatStore.getState().tabs.length - 1];
                    if (latestTab) {
                        currentTabId = latestTab.id;
                        setActiveTab(currentTabId);
                        console.log('✅ 查找最新标签页:', currentTabId);
                    } else {
                        console.error('❌ 创建标签页失败');
                        return;
                    }
                }
            } else {
                currentTabId = createTab(undefined, pendingMode);
                setActiveTab(currentTabId);
                console.log('✅ 通过 createTab 创建标签页:', currentTabId);
            }
        }
        
        if (!currentTabId) {
            console.error('❌ 无法获取标签页 ID');
            return;
        }
        
        // 优先检查是否是从文件树拖拽的文件路径
        // 注意：需要在 drop 事件中获取数据，而不是在 dragover 中
        let filePath = '';
        let isDirectory = false;
        
        // 方法 1：尝试获取 application/file-path（文件树拖拽的主要类型）
        try {
            filePath = dataTransfer.getData('application/file-path');
            console.log('📥 方法1 - application/file-path:', filePath);
        } catch (error) {
            console.warn('⚠️ 获取 application/file-path 失败:', error);
        }
        
        // 方法 2：如果方法1失败，尝试 text/plain（备用方案）
        if (!filePath) {
            try {
                filePath = dataTransfer.getData('text/plain');
                console.log('📥 方法2 - text/plain:', filePath);
            } catch (error) {
                console.warn('⚠️ 获取 text/plain 失败:', error);
            }
        }
        
        // 获取目录标识
        try {
            const dirFlag = dataTransfer.getData('application/is-directory');
            isDirectory = dirFlag === 'true';
            console.log('📥 目录标识:', isDirectory);
        } catch (error) {
            console.warn('⚠️ 获取目录标识失败:', error);
        }
        
        console.log('📥 拖拽数据解析结果:', { 
            filePath, 
            isDirectory, 
            types: Array.from(dataTransfer.types),
            filesCount: dataTransfer.files.length,
        });
        
        // 处理文件树拖拽的文件
        if (filePath && !isDirectory) {
            console.log('✅ 检测到文件树拖拽，创建文件引用:', filePath);
            try {
                const refId = await handleFileTreeReference(filePath, currentTabId);
                
                // 创建引用后，插入引用标签到输入框
                if (refId && editorRef.current) {
                    console.log('📎 插入引用标签到输入框:', refId);
                    handleInsertReference(refId);
                } else {
                    console.warn('⚠️ 引用创建失败或编辑器未就绪:', { refId, editorReady: !!editorRef.current });
                }
            } catch (error) {
                console.error('❌ 处理文件树引用失败:', error);
            }
            return;
        }
        
        // 处理文件树拖拽的文件夹
        if (filePath && isDirectory) {
            console.log('📁 检测到文件夹拖拽，创建文件夹引用:', filePath);
            try {
                const folderName = filePath.split('/').pop() || filePath;
                
                // 异步统计文件夹中的文件数量（不阻塞 UI）
                let fileCount = 0;
                try {
                    const files = await invoke<string[]>('list_folder_files', { path: filePath });
                    fileCount = files?.length || 0;
                    console.log('📊 文件夹文件数量:', fileCount);
                } catch (error) {
                    console.warn('⚠️ 统计文件夹文件数量失败，使用默认值 0:', error);
                }
                
                // 创建文件夹引用
                const folderRef: FolderReference = {
                    id: `ref-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    type: ReferenceType.FOLDER,
                    createdAt: Date.now(),
                    path: filePath,
                    name: folderName,
                    fileCount: fileCount,
                };
                
                console.log('✅ 创建文件夹引用:', folderRef);
                const refId = addReference(currentTabId, folderRef);
                
                // 插入引用标签到输入框
                if (refId && editorRef.current) {
                    console.log('📎 插入文件夹引用标签到输入框:', refId);
                    handleInsertReference(refId);
                } else {
                    console.warn('⚠️ 文件夹引用创建失败或编辑器未就绪:', { refId, editorReady: !!editorRef.current });
                }
            } catch (error) {
                console.error('❌ 处理文件夹引用失败:', error);
            }
            return;
        }
        
        // 处理外部拖拽的文件
        const files = Array.from(dataTransfer.files);
        if (files.length === 0) {
            console.log('❌ 没有检测到文件');
            return;
        }
        
        console.log('✅ 检测到外部文件拖拽:', files.length);
        
        // 处理每个外部文件
        for (const file of files) {
            try {
                console.log('📄 处理外部文件:', file.name, file.type);
                
                // 检查是否是图片文件
                if (file.type.startsWith('image/')) {
                    // 创建图片引用（使用 FileReader 读取图片数据）
                    const reader = new FileReader();
                    const imageDataUrl = await new Promise<string>((resolve, reject) => {
                        reader.onload = (e) => resolve(e.target?.result as string);
                        reader.onerror = reject;
                        reader.readAsDataURL(file);
                    });
                    
                    const imageRef: ImageReference = {
                        id: `ref-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                        type: ReferenceType.IMAGE,
                        createdAt: Date.now(),
                        path: file.name, // 外部文件没有路径，使用文件名
                        name: file.name,
                        mimeType: file.type,
                        thumbnail: imageDataUrl, // 使用 thumbnail 字段存储 base64 数据
                    };
                    
                    console.log('✅ 创建外部图片引用:', imageRef);
                    const refId = addReference(currentTabId, imageRef);
                    
                    if (refId && editorRef.current) {
                        handleInsertReference(refId);
                    }
                } else {
                    // 处理外部文本文件：保存到临时目录并读取内容
                    try {
                        // 检查文件大小（限制为 10MB）
                        const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
                        if (file.size > MAX_FILE_SIZE) {
                            console.warn('⚠️ 文件过大，跳过:', file.name, '大小:', file.size);
                            continue;
                        }
                        
                        // 读取文件为 ArrayBuffer
                        const arrayBuffer = await file.arrayBuffer();
                        const fileData = Array.from(new Uint8Array(arrayBuffer));
                        
                        // 获取当前工作区路径
                        if (!currentWorkspace) {
                            console.error('❌ 没有当前工作区，无法保存外部文件');
                            continue;
                        }
                        
                        // 保存文件到临时目录
                        const { invoke } = await import('@tauri-apps/api/core');
                        const tempPath = await invoke<string>('save_external_file', {
                            workspacePath: currentWorkspace,
                            fileData: fileData,
                            fileName: file.name,
                        });
                        
                        console.log('✅ 外部文件已保存到临时目录:', tempPath);
                        
                        // 读取文件内容（用于存储到引用中）
                        let fileContent: string | undefined;
                        try {
                            // 尝试以文本方式读取（对于文本文件）
                            const textContent = await file.text();
                            // 检查是否是有效的文本内容（不是二进制）
                            if (textContent && textContent.length > 0 && !textContent.includes('\0')) {
                                fileContent = textContent;
                            }
                        } catch (error) {
                            console.warn('⚠️ 无法以文本方式读取文件，将作为二进制文件处理:', error);
                        }
                        
                        // 创建文件引用，使用临时文件路径
                        const fileRef: FileReference = {
                            id: `ref-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                            type: ReferenceType.FILE,
                            createdAt: Date.now(),
                            path: tempPath, // 使用临时文件路径
                            name: file.name,
                            size: file.size,
                            mimeType: file.type,
                            content: fileContent, // 存储文件内容（如果可读）
                        };
                        
                        console.log('✅ 创建外部文件引用:', fileRef);
                        const refId = addReference(currentTabId, fileRef);
                        
                        if (refId && editorRef.current) {
                            handleInsertReference(refId);
                        }
                    } catch (error) {
                        console.error('❌ 处理外部文件失败:', error);
                    }
                }
            } catch (error) {
                console.error('❌ 处理外部文件失败:', error);
            }
        }
    }, [tabId, pendingMode, onCreateTab, createTab, setActiveTab, handleFileTreeReference, handleInsertReference, addReference, currentWorkspace]);
    
    // 🔍 终极调试：在 window 和 document 级别捕获所有拖拽事件
    // 如果这些监听器都没有日志，说明事件在 OS/Tauri 层被拦截
    // 🔴 关键修复：在全局监听器中，如果目标是容器区域，则阻止默认行为并处理 drop
    useEffect(() => {
        const container = containerRef.current;
        
        const isContainerArea = (target: EventTarget | null): boolean => {
            if (!container || !target) return false;
            const element = target as HTMLElement;
            
            // 方法1：检查元素是否在容器内
            const isInContainer = container.contains(element) || container === element;
            
            // 方法2：通过类名检查（备用方案）
            const isContainerByClass = element.closest('.inline-chat-input-container') !== null;
            
            const result = isInContainer || isContainerByClass;
            
            // 调试日志
            if (result) {
                console.log('✅ 识别为容器区域:', {
                    elementClassName: element.className,
                    elementTagName: element.tagName,
                    containerClassName: container.className,
                    isInContainer,
                    isContainerByClass,
                });
            }
            
            return result;
        };
        
        const debugDragWindow = (e: DragEvent) => {
            const isContainer = isContainerArea(e.target);
            console.log(`[DEBUG-WINDOW] 🎯 捕获到事件: ${e.type}`, {
                target: {
                    className: (e.target as HTMLElement)?.className,
                    tagName: (e.target as HTMLElement)?.tagName,
                },
                types: Array.from(e.dataTransfer?.types || []),
                isContainerArea: isContainer,
            });
            
            // 🔴 关键修复：如果目标是容器区域，在 dragover 中阻止默认行为，这样 drop 才能触发
            if (e.type === 'dragover' && isContainer) {
                e.preventDefault();
                e.stopPropagation();
                if (e.dataTransfer) {
                    e.dataTransfer.dropEffect = 'copy';
                }
            }
            
            // 🔴 关键修复：如果目标是容器区域，在 drop 中直接处理
            if (e.type === 'drop' && isContainer) {
                e.preventDefault();
                e.stopPropagation();
                console.log('📥 [DEBUG-WINDOW] 容器区域的 drop 事件，调用 handleDropLogic');
                // 直接调用 handleDropLogic（在运行时访问）
                if (handleDropLogic) {
                    handleDropLogic(e);
                }
            }
        };
        
        const debugDragDocument = (e: DragEvent) => {
            const isContainer = isContainerArea(e.target);
            console.log(`[DEBUG-DOCUMENT] 🎯 捕获到事件: ${e.type}`, {
                target: {
                    className: (e.target as HTMLElement)?.className,
                    tagName: (e.target as HTMLElement)?.tagName,
                },
                types: Array.from(e.dataTransfer?.types || []),
                isContainerArea: isContainer,
            });
            
            // 🔴 关键修复：如果目标是容器区域，在 dragover 中阻止默认行为
            if (e.type === 'dragover' && isContainer) {
                e.preventDefault();
                e.stopPropagation();
                if (e.dataTransfer) {
                    e.dataTransfer.dropEffect = 'copy';
                }
            }
        };
        
        // 在 window 级别添加监听器（最高级别）
        window.addEventListener('dragenter', debugDragWindow, true);
        window.addEventListener('dragover', debugDragWindow, true);
        window.addEventListener('drop', debugDragWindow, true);
        
        // 在 document 级别添加监听器（捕获阶段）
        document.addEventListener('dragenter', debugDragDocument, true);
        document.addEventListener('dragover', debugDragDocument, true);
        document.addEventListener('drop', debugDragDocument, true);
        
        console.log('✅ [DEBUG] Window 和 Document 级别拖拽事件监听器已绑定（捕获阶段）');
        
        return () => {
            window.removeEventListener('dragenter', debugDragWindow, true);
            window.removeEventListener('dragover', debugDragWindow, true);
            window.removeEventListener('drop', debugDragWindow, true);
            document.removeEventListener('dragenter', debugDragDocument, true);
            document.removeEventListener('dragover', debugDragDocument, true);
            document.removeEventListener('drop', debugDragDocument, true);
        };
    }, [handleDropLogic]); // 添加 handleDropLogic 依赖
    
    // 拖拽处理：允许拖拽文件
    // 在容器级别处理，避免contentEditable的默认行为干扰
    // 使用原生事件监听器，确保能捕获所有拖拽事件
    useEffect(() => {
        const container = containerRef.current;
        if (!container) {
            console.warn('⚠️ 容器引用不存在，无法绑定拖拽事件');
            return;
        }
        
        // 🔍 检查容器样式，确保没有阻止事件
        const computedStyle = window.getComputedStyle(container);
        const pointerEvents = computedStyle.pointerEvents;
        const display = computedStyle.display;
        const visibility = computedStyle.visibility;
        const opacity = computedStyle.opacity;
        
        console.log('✅ 容器已找到，准备绑定拖拽事件监听器', {
            containerClass: container.className,
            containerId: container.id,
            containerRect: container.getBoundingClientRect(),
            zIndex: computedStyle.zIndex,
            position: computedStyle.position,
            pointerEvents,
            display,
            visibility,
            opacity,
            isVisible: display !== 'none' && visibility !== 'hidden' && opacity !== '0',
        });
        
        // 🔴 关键修复：确保容器可以接收指针事件
        if (pointerEvents === 'none') {
            console.warn('⚠️ 容器 pointer-events 为 none，强制设置为 auto');
            container.style.pointerEvents = 'auto';
        }
        
        // 🔍 调试：给容器添加可视化边框和高 z-index
        container.style.outline = '4px solid red';
        container.style.zIndex = '9999';
        container.style.position = 'relative';
        console.log('🎨 容器样式已更新用于调试：红色边框 + z-index: 9999');
        
        setTimeout(() => {
            container.style.outline = '';
            // 保留 z-index，确保容器在最上层
        }, 10000);
        
        const handleDragEnterNative = (e: DragEvent) => {
            console.log('📥 [原生-容器] ✅✅✅ dragEnter 被触发！', {
                types: Array.from(e.dataTransfer?.types || []),
                effectAllowed: e.dataTransfer?.effectAllowed,
                target: (e.target as HTMLElement)?.className || (e.target as HTMLElement)?.tagName,
                currentTarget: (e.currentTarget as HTMLElement)?.className,
            });
            e.preventDefault();
            e.stopPropagation();
        };
        
        const handleDragOverNative = (e: DragEvent) => {
            // 每次都要 preventDefault，否则 drop 不会触发
            e.preventDefault();
            e.stopPropagation();
            if (e.dataTransfer) {
                e.dataTransfer.dropEffect = 'copy';
            }
            // 减少日志频率
            if (!(handleDragOverNative as any).__logged) {
                console.log('📥 [原生-容器] ✅✅✅ dragOver 被触发！', {
                    types: Array.from(e.dataTransfer?.types || []),
                    target: (e.target as HTMLElement)?.className || (e.target as HTMLElement)?.tagName,
                    currentTarget: (e.currentTarget as HTMLElement)?.className,
                });
                (handleDragOverNative as any).__logged = true;
                setTimeout(() => { (handleDragOverNative as any).__logged = false; }, 1000);
            }
        };
        
        const handleDragLeaveNative = (e: DragEvent) => {
            const relatedTarget = e.relatedTarget as HTMLElement;
            if (relatedTarget && container.contains(relatedTarget)) {
                return; // 还在容器内部，不处理
            }
            console.log('📥 [原生-容器] dragLeave 被触发');
            e.preventDefault();
            e.stopPropagation();
        };
        
        const handleDropNative = async (e: DragEvent) => {
            console.log('📥 [原生-容器] drop 被触发！', {
                types: Array.from(e.dataTransfer?.types || []),
                files: e.dataTransfer?.files.length || 0,
            });
            
            e.preventDefault();
            e.stopPropagation();
            
            // 直接调用处理逻辑（原生事件）
            handleDropLogic(e);
        };
        
        // 使用捕获阶段，确保能捕获事件
        container.addEventListener('dragenter', handleDragEnterNative, true);
        container.addEventListener('dragover', handleDragOverNative, true);
        container.addEventListener('dragleave', handleDragLeaveNative, true);
        container.addEventListener('drop', handleDropNative, true);
        
        console.log('✅ 拖拽事件监听器已绑定到容器');
        
        return () => {
            container.removeEventListener('dragenter', handleDragEnterNative, true);
            container.removeEventListener('dragover', handleDragOverNative, true);
            container.removeEventListener('dragleave', handleDragLeaveNative, true);
            container.removeEventListener('drop', handleDropNative, true);
            console.log('🧹 拖拽事件监听器已移除');
        };
    }, [handleDropLogic]);
    
    // React 事件处理器（保留作为备用）
    const handleDragEnter = useCallback((e: React.DragEvent) => {
        if (e.currentTarget !== containerRef.current) return;
        e.preventDefault();
        e.stopPropagation();
        console.log('📥 [React] 拖拽进入容器 (dragEnter)');
    }, []);
    
    const handleDragOver = useCallback((e: React.DragEvent) => {
        if (e.currentTarget !== containerRef.current) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'copy';
    }, []);
    
    const handleDragLeave = useCallback((e: React.DragEvent) => {
        if (e.currentTarget !== containerRef.current) return;
        const relatedTarget = e.relatedTarget as HTMLElement;
        if (relatedTarget && containerRef.current?.contains(relatedTarget)) {
            return;
        }
        e.preventDefault();
        e.stopPropagation();
        console.log('📥 [React] 拖拽离开容器 (dragLeave)');
    }, []);
    
    // React 版本的 handleDrop（调用 handleDropLogic）
    const handleDrop = useCallback(async (e: React.DragEvent) => {
        if (e.currentTarget !== containerRef.current) {
            return;
        }
        e.preventDefault();
        e.stopPropagation();
        await handleDropLogic(e);
    }, [handleDropLogic]);
    
    // 始终显示输入框（即使没有标签页，也可以通过 onCreateTab 创建）
    
    // 调试：验证组件渲染和容器引用
    useEffect(() => {
        console.log('🔍 InlineChatInput 组件已渲染', {
            tabId,
            hasMessages,
            isStreaming,
            referencesCount: references.length,
            editorRefExists: !!editorRef.current,
            containerRefExists: !!containerRef.current,
            containerElement: containerRef.current ? containerRef.current.className : 'null',
        });
        
        // 验证容器是否真的在 DOM 中
        if (containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            console.log('📐 容器位置和大小:', {
                width: rect.width,
                height: rect.height,
                top: rect.top,
                left: rect.left,
                visible: rect.width > 0 && rect.height > 0,
            });
        }
    }, [tabId, hasMessages, isStreaming, references.length]);
    
    // 移除重复的全局监听器（已在上面添加了 window + document 级别的 DEBUG 监听器）
    
    return (
        <div
            ref={containerRef}
            className="inline-chat-input-container flex-shrink-0 border-t border-gray-200 dark:border-gray-700 p-4 bg-white dark:bg-gray-800"
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
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
            
            {/* 引用管理按钮（在输入框外面，左上角） */}
            <ReferenceManagerButton
                tabId={tabId}
                onInsertReference={handleInsertReference}
                onRemoveReference={handleRemoveReferenceTag}
            />
            
            <div className="flex items-end gap-2">
                {/* 内容可编辑区域 */}
                <div
                    ref={editorRef}
                    contentEditable
                    onInput={handleInput}
                    onKeyDown={handleKeyDown}
                    onPaste={handlePaste}
                    onCompositionStart={handleCompositionStart}
                    onCompositionEnd={handleCompositionEnd}
                    // 拖拽事件只在容器级别处理，避免contentEditable的干扰
                    className="inline-chat-input-editor flex-1 min-h-[40px] max-h-[200px] px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 overflow-y-auto"
                    suppressContentEditableWarning
                    data-placeholder="输入消息... (Shift+Enter 换行)"
                />
                
                {/* 发送按钮 */}
                <button
                    onClick={handleSend}
                    disabled={isStreaming}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
                >
                    <PaperAirplaneIcon className="w-5 h-5" />
                    <span>发送</span>
                </button>
            </div>
        </div>
    );
};

