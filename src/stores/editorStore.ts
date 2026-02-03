import { create } from 'zustand';
import { Editor } from '@tiptap/react';

// Diff 数据结构（与后端保持一致）
export interface Diff {
  diff_id: string;
  diff_area_id: string;
  diff_type: 'Edit' | 'Insertion' | 'Deletion';
  original_code: string;
  original_start_line: number;
  original_end_line: number;
  new_code: string;
  start_line: number;
  end_line: number;
  // ⚠️ 上下文信息：用于精确匹配定位
  context_before?: string | null; // 目标文本前面的上下文（50-100字符）
  context_after?: string | null;  // 目标文本后面的上下文（50-100字符）
  // ⚠️ 元素类型和标识符：用于表格、图片等复杂元素
  element_type?: 'text' | 'table' | 'image' | 'code_block' | 'replace_whole';
  element_identifier?: string; // 用于表格、图片等复杂元素
  // ⚠️ 前端添加的定位信息
  from?: number; // ProseMirror 位置
  to?: number;
  confidence?: number; // 匹配置信度
  strategy?: string; // 使用的匹配策略
}

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
  autoCompleteEnabled: boolean; // 自动续写功能启用状态
  diffAreaId?: string; // ⚠️ 新增：当前 diff area ID
  diffs?: Diff[]; // ⚠️ 新增：diff 数据
  oldContent?: string; // ⚠️ 新增：旧内容（用于 diff 显示）
  newContent?: string; // ⚠️ 新增：新内容（用于 diff 显示）
}

interface EditorState {
  tabs: EditorTab[];
  activeTabId: string | null;
  addTab: (filePath: string, fileName: string, content: string, isReadOnly?: boolean, isDraft?: boolean, lastModifiedTime?: number, autoCompleteEnabled?: boolean) => string;
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
  setAutoCompleteEnabled: (tabId: string, enabled: boolean) => void; // 设置自动续写启用状态
  setTabDiff: (tabId: string, diffAreaId: string, diffs: Diff[], oldContent: string, newContent: string) => void; // ⚠️ 新增：设置 diff 数据
  clearTabDiff: (tabId: string) => void; // ⚠️ 新增：清除 diff 数据
  applyTabDiff: (tabId: string) => void; // ⚠️ 新增：触发应用 diff（通过编辑器的 onApplyDiff）
}

export const useEditorStore = create<EditorState>((set, get) => ({
  tabs: [],
  activeTabId: null,

  addTab: (filePath, fileName, content, isReadOnly = false, isDraft = false, lastModifiedTime = Date.now(), autoCompleteEnabled = true) => {
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
      autoCompleteEnabled, // 自动续写功能默认启用
      diffAreaId: undefined, // ⚠️ 新增：diff area ID
      diffs: undefined, // ⚠️ 新增：diff 数据
      oldContent: undefined, // ⚠️ 新增：旧内容
      newContent: undefined, // ⚠️ 新增：新内容
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

  // 设置自动续写启用状态
  setAutoCompleteEnabled: (tabId, enabled) => {
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === tabId
          ? { ...tab, autoCompleteEnabled: enabled }
          : tab
      ),
    }));
  },

  // ⚠️ 新增：设置 diff 数据
  setTabDiff: (tabId, diffAreaId, diffs, oldContent, newContent) => {
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === tabId
          ? {
              ...tab,
              diffAreaId,
              diffs,
              oldContent,
              newContent,
            }
          : tab
      ),
    }));
  },

  // ⚠️ 新增：清除 diff 数据
  clearTabDiff: (tabId) => {
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === tabId
          ? {
              ...tab,
              diffAreaId: undefined,
              diffs: undefined,
              oldContent: undefined,
              newContent: undefined,
            }
          : tab
      ),
    }));
  },

  // ⚠️ 新增：触发应用 diff（通过编辑器的 onApplyDiff）
  applyTabDiff: (tabId) => {
    const state = get();
    const tab = state.tabs.find(t => t.id === tabId);
    if (tab && tab.editor) {
      // 通过编辑器实例触发 onApplyDiff
      // 但是，onApplyDiff 是在 TipTapEditor 中定义的，我们无法直接访问
      // 所以，我们通过触发一个 transaction 来通知编辑器应用 diff
      const { view } = tab.editor;
      if (view) {
        // 触发一个带有 applyDiff meta 的 transaction
        const tr = view.state.tr.setMeta('applyDiff', true);
        view.dispatch(tr);
        console.log('✅ [EditorStore] 已触发编辑器应用 diff');
      }
    } else {
      console.warn('⚠️ [EditorStore] 无法应用 diff：编辑器实例不存在');
    }
  },
}));

