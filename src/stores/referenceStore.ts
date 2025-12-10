import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { Reference, ReferenceType, TextReference, FileReference, ImageReference, MemoryReference, LinkReference } from '../types/reference';

interface ReferenceState {
    // 当前聊天标签页的引用列表（按 tabId 组织）
    referencesByTab: Map<string, Reference[]>;
    
    // Actions
    addReference: (tabId: string, ref: Reference) => string;
    removeReference: (tabId: string, refId: string) => void;
    getReferences: (tabId: string) => Reference[];
    clearReferences: (tabId: string) => void;
    
    // 格式化引用为 AI 可理解的格式（按需加载内容）
    formatForAI: (tabId: string) => Promise<string>;
}

export const useReferenceStore = create<ReferenceState>((set, get) => {
    const formatReference = (ref: Reference): string => {
        switch (ref.type) {
            case ReferenceType.TEXT:
                const textRef = ref as TextReference;
                return `[文本引用] ${textRef.content}\n来源: ${textRef.sourceFile || '未知'}${textRef.lineRange ? ` (行 ${textRef.lineRange.start}-${textRef.lineRange.end})` : ''}`;
            
            case ReferenceType.FILE:
                const fileRef = ref as FileReference;
                return `[文件引用] ${fileRef.path}\n大小: ${fileRef.size ? formatFileSize(fileRef.size) : '未知'}`;
            
            case ReferenceType.IMAGE:
                const imageRef = ref as ImageReference;
                return `[图片引用] ${imageRef.path}\n大小: ${formatFileSize(imageRef.size || 0)}`;
            
            case ReferenceType.MEMORY:
                const memoryRef = ref as MemoryReference;
                return `[记忆库引用] ${memoryRef.name}\n包含 ${memoryRef.itemCount || 0} 个记忆项`;
            
            case ReferenceType.LINK:
                const linkRef = ref as LinkReference;
                return `[链接引用] ${linkRef.url}`;
            
            default:
                return '';
        }
    };
    
    const formatFileSize = (bytes: number): string => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    };
    
    return {
        referencesByTab: new Map(),
        
        addReference: (tabId: string, ref: Reference) => {
            // 如果传入的 ref 已经有 id，使用原有的 id，否则生成新的 id
            const id = ref.id || `ref-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            const createdAt = ref.createdAt || Date.now();
            const newRef = { ...ref, id, createdAt };
            
            const { referencesByTab } = get();
            const currentRefs = referencesByTab.get(tabId) || [];
            // 检查是否已存在相同 id 的引用，如果存在则替换，否则添加
            const existingIndex = currentRefs.findIndex(r => r.id === id);
            const newRefs = existingIndex >= 0
                ? currentRefs.map((r, idx) => idx === existingIndex ? newRef : r)
                : [...currentRefs, newRef];
            
            set({
                referencesByTab: new Map(referencesByTab).set(tabId, newRefs),
            });
            
            return id;
        },
        
        removeReference: (tabId: string, refId: string) => {
            const { referencesByTab } = get();
            const currentRefs = referencesByTab.get(tabId) || [];
            const newRefs = currentRefs.filter(ref => ref.id !== refId);
            
            set({
                referencesByTab: new Map(referencesByTab).set(tabId, newRefs),
            });
        },
        
        getReferences: (tabId: string) => {
            const { referencesByTab } = get();
            return referencesByTab.get(tabId) || [];
        },
        
        clearReferences: (tabId: string) => {
            const { referencesByTab } = get();
            const newMap = new Map(referencesByTab);
            newMap.delete(tabId);
            set({ referencesByTab: newMap });
        },
        
        formatForAI: async (tabId: string) => {
            const refs = get().getReferences(tabId);
            if (refs.length === 0) return '';
            
            const formatted = await Promise.all(
                refs.map(async (ref) => {
                    // 文件引用：按需加载内容
                    if (ref.type === ReferenceType.FILE) {
                        const fileRef = ref as FileReference;
                        if (fileRef.size && fileRef.size > 10 * 1024 * 1024) {
                            // 大文件：只返回摘要
                            return `[文件引用] ${fileRef.path}\n大小: ${formatFileSize(fileRef.size)}\n[文件过大，仅提供路径]`;
                        } else if (!fileRef.content) {
                            // 小文件：尝试加载内容
                            try {
                                const content = await invoke<string>('read_file_content', {
                                    path: fileRef.path,
                                });
                                return `[文件引用] ${fileRef.path}\n${content}`;
                            } catch (error) {
                                return `[文件引用] ${fileRef.path}\n[读取文件失败]`;
                            }
                        } else {
                            return `[文件引用] ${fileRef.path}\n${fileRef.content}`;
                        }
                    }
                    
                    // 其他类型直接格式化
                    return formatReference(ref);
                })
            );
            
            return formatted.join('\n\n');
        },
    };
});

