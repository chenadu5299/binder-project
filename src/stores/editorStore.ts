import { create } from 'zustand';
import { Editor } from '@tiptap/react';

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
}

interface EditorState {
  tabs: EditorTab[];
  activeTabId: string | null;
  addTab: (filePath: string, fileName: string, content: string, isReadOnly?: boolean, isDraft?: boolean, lastModifiedTime?: number) => string;
  removeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  updateTabContent: (tabId: string, content: string) => void;
  markTabSaved: (tabId: string) => void;
  setTabSaving: (tabId: string, isSaving: boolean) => void;
  setTabEditor: (tabId: string, editor: Editor | null) => void;
  getActiveTab: () => EditorTab | null;
  enableEditMode: (tabId: string) => void; // ⚠️ 新增：启用编辑模式
  updateTabPath: (tabId: string, newPath: string) => void; // ⚠️ 新增：更新标签页路径
  markTabConflict: (tabId: string) => void; // ⚠️ 新增：标记冲突
  updateTabModifiedTime: (tabId: string, modifiedTime: number) => void; // ⚠️ Week 17.1.2：更新文件修改时间
}

export const useEditorStore = create<EditorState>((set, get) => ({
  tabs: [],
  activeTabId: null,

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
    const isDocx = filePath.toLowerCase().endsWith('.docx');
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
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === tabId
          ? {
              ...tab,
              content,
              isDirty: content !== tab.lastSavedContent,
            }
          : tab
      ),
    }));
  },

  markTabSaved: (tabId) => {
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === tabId
          ? {
              ...tab,
              lastSavedContent: tab.content,
              isDirty: false,
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

  
}));

