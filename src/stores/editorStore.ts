import { create } from 'zustand';
import { Editor } from '@tiptap/react';
import { isSameDocumentForEdit } from '../utils/pathUtils';
import { useDiffStore } from './diffStore';

// Phase 0.1：指令无效提示的 timer，防止连续触发时前一次 timer 提前清除本次提示
let invalidCommandHintTimer: ReturnType<typeof setTimeout> | null = null;

export interface EditorTab {
  id: string;
  filePath: string;
  fileName: string;
  content: string;
  lastSavedContent: string;
  isDirty: boolean;
  isSaving: boolean;
  isReadOnly: boolean; // ⚠️ 新增：只读模式标记
  isDraft: boolean; // ⚠️ 新增：是否为草稿文件
  lastModifiedTime: number; // ⚠️ Week 17.1.2：文件最后修改时间（毫秒时间戳）
  editor: Editor | null;
  /** 文档定位版本戳：内容变化时递增，用于 diff 与 (L, revision) 门禁（§2.1.1） */
  documentRevision: number;
}

interface EditorState {
  tabs: EditorTab[];
  activeTabId: string | null;
  invalidCommandHint: string | null; // Phase 0.1：光标未激活时显示的提示
  addTab: (filePath: string, fileName: string, content: string, isReadOnly?: boolean, isDraft?: boolean, lastModifiedTime?: number) => string;
  removeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  updateTabContent: (tabId: string, content: string) => void;
  markTabSaved: (tabId: string, savedContent: string) => void;
  setTabSaving: (tabId: string, isSaving: boolean) => void;
  setTabEditor: (tabId: string, editor: Editor | null) => void;
  getActiveTab: () => EditorTab | null;
  /** 按文件路径解析已打开 tab（P3）；无匹配返回 null */
  getTabByFilePath: (filePath: string) => EditorTab | null;
  enableEditMode: (tabId: string) => void; // ⚠️ 新增：启用编辑模式
  updateTabPath: (tabId: string, newPath: string) => void; // ⚠️ 新增：更新标签页路径
  markTabConflict: (tabId: string) => void; // ⚠️ 新增：标记冲突
  updateTabModifiedTime: (tabId: string, modifiedTime: number) => void; // ⚠️ Week 17.1.2：更新文件修改时间
  setInvalidCommandHint: (hint: string) => void; // Phase 0.1：设置指令无效提示，2 秒后自动清除
  /** Diff 卡定位：打开文件后请求滚动到此位置 */
  setPendingScrollTo: (tabId: string, from: number, to: number) => void;
  getPendingScrollTo: () => { tabId: string; from: number; to: number } | null;
  clearPendingScrollTo: () => void;
}

interface EditorStoreState extends EditorState {
  pendingScrollTo: { tabId: string; from: number; to: number } | null;
}

export const useEditorStore = create<EditorStoreState>((set, get) => ({
  tabs: [],
  activeTabId: null,
  invalidCommandHint: null,
  pendingScrollTo: null,
  setPendingScrollTo: (tabId, from, to) => set({ pendingScrollTo: { tabId, from, to } }),
  getPendingScrollTo: () => get().pendingScrollTo,
  clearPendingScrollTo: () => set({ pendingScrollTo: null }),

  addTab: (filePath, fileName, content, isReadOnly = false, isDraft = false, lastModifiedTime = Date.now()) => {
    // ⚠️ 关键：检查文件是否已打开，如果已打开则切换到该标签
    const state = get();
    const existingTab = state.tabs.find((tab) => tab.filePath === filePath);
    if (existingTab) {
      set({ activeTabId: existingTab.id });
      return existingTab.id;
    }
    
    const tabId = `tab-${Date.now()}`;
    // 判断是否为 DOCX 文件
    const newTab: EditorTab = {
      id: tabId,
      filePath,
      fileName,
      content,
      lastSavedContent: content,
      isDirty: false,
      isSaving: false,
      isReadOnly, // ⚠️ 新增：只读模式
      isDraft, // ⚠️ 新增：草稿标记
      lastModifiedTime, // ⚠️ Week 17.1.2：文件最后修改时间
      editor: null,
      documentRevision: 1,
    };
    
    set((state) => ({
      tabs: [...state.tabs, newTab],
      activeTabId: tabId,
    }));
    
    return tabId;
  },

  removeTab: (tabId) => {
    set((state) => {
      const tab = state.tabs.find((t) => t.id === tabId);
      // ⚠️ 关键：关闭前检查未保存更改（在组件中处理确认对话框）
      if (tab && tab.isDirty) {
        // 返回 false 表示需要用户确认，组件会显示确认对话框
        return state;
      }
      
      return {
        tabs: state.tabs.filter((t) => t.id !== tabId),
        activeTabId: state.activeTabId === tabId 
          ? (state.tabs.find((t) => t.id !== tabId)?.id || null)
          : state.activeTabId,
      };
    });
  },

  setActiveTab: (tabId) => {
    set({ activeTabId: tabId });
  },

  updateTabContent: (tabId, content) => {
    const prev = get().tabs.find((t) => t.id === tabId);
    if (!prev) return;
    if (prev.content === content) {
      set((state) => ({
        tabs: state.tabs.map((tab) =>
          tab.id === tabId ? { ...tab, content, isDirty: content !== tab.lastSavedContent } : tab
        ),
      }));
      return;
    }
    const nextRev = (prev.documentRevision ?? 1) + 1;
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === tabId
          ? {
              ...tab,
              content,
              isDirty: content !== tab.lastSavedContent,
              documentRevision: nextRev,
            }
          : tab
      ),
    }));
    useDiffStore.getState().expirePendingForStaleRevision(prev.filePath, nextRev);
  },

  markTabSaved: (tabId, savedContent) => {
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === tabId
          ? {
              ...tab,
              lastSavedContent: savedContent,
              isDirty: tab.content !== savedContent,
              isSaving: false,
            }
          : tab
      ),
    }));
  },

  setTabSaving: (tabId, isSaving) => {
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === tabId
          ? { ...tab, isSaving }
          : tab
      ),
    }));
  },

  setTabEditor: (tabId, editor) => {
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === tabId
          ? { ...tab, editor }
          : tab
      ),
    }));
  },

  getActiveTab: () => {
    const state = get();
    return state.tabs.find((t) => t.id === state.activeTabId) || null;
  },

  getTabByFilePath: (filePath) => {
    const hit = get().tabs.find((t) => isSameDocumentForEdit(t.filePath, filePath));
    return hit ?? null;
  },

  // ⚠️ 新增：启用编辑模式（从只读切换到可编辑）
  enableEditMode: (tabId) => {
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === tabId
          ? { ...tab, isReadOnly: false }
          : tab
      ),
    }));
  },

  // ⚠️ 新增：更新标签页路径
  updateTabPath: (tabId, newPath) => {
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === tabId
          ? {
              ...tab,
              filePath: newPath,
              fileName: newPath.split('/').pop() || tab.fileName,
            }
          : tab
      ),
    }));
  },

  // ⚠️ 新增：标记冲突（暂时不实现具体逻辑，仅占位）
  markTabConflict: (tabId) => {
    // 可以在这里添加冲突标记逻辑
    console.warn(`Tab ${tabId} has conflict`);
  },
  
  // ⚠️ Week 17.1.2：更新文件修改时间
  updateTabModifiedTime: (tabId, modifiedTime) => {
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === tabId
          ? { ...tab, lastModifiedTime: modifiedTime }
          : tab
      ),
    }));
  },

  setInvalidCommandHint: (hint) => {
    if (invalidCommandHintTimer) clearTimeout(invalidCommandHintTimer);
    set({ invalidCommandHint: hint });
    invalidCommandHintTimer = setTimeout(() => {
      set({ invalidCommandHint: null });
      invalidCommandHintTimer = null;
    }, 2000);
  },
}));

