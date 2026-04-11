import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { FileTreeNode } from '../types/file';

interface FileState {
  currentWorkspace: string | null;
  fileTree: FileTreeNode | null;
  selectedFile: string | null;
  openFiles: string[]; // 打开的文件路径列表
  /** 编辑器自身保存完成的时间戳（用于文件树忽略自身保存触发的刷新） */
  lastEditorSaveAt: number;
  lastEditorSaveWorkspace: string | null;
  
  setCurrentWorkspace: (path: string | null) => void;
  setFileTree: (tree: FileTreeNode | null) => void;
  setSelectedFile: (path: string | null) => void;
  addOpenFile: (path: string) => void;
  removeOpenFile: (path: string) => void;
  /** 标记编辑器保存完成，文件树在短时间内会忽略该工作区的刷新 */
  markEditorSaveComplete: (workspace: string) => void;
}

const IGNORE_REFRESH_MS = 2000; // 自身保存后 2 秒内忽略文件树刷新

export const useFileStore = create<FileState>((set) => ({
  currentWorkspace: null,
  fileTree: null,
  selectedFile: null,
  openFiles: [],
  lastEditorSaveAt: 0,
  lastEditorSaveWorkspace: null,

  setCurrentWorkspace: (path) => {
    set({ currentWorkspace: path });
    // P0.5: 工作区加载完成后异步清理孤立 tab 记忆（fire-and-forget）
    if (path) {
      void import('./chatStore')
        .then(({ useChatStore }) => {
          const activeTabIds = useChatStore
            .getState()
            .tabs
            .filter((t: { workspacePath: string | null }) => t.workspacePath === path)
            .map((t: { id: string }) => t.id);
          return invoke('mark_orphan_tab_memories_stale', { activeTabIds, workspacePath: path });
        })
        .catch((e: unknown) => console.warn('mark_orphan_tab_memories_stale failed:', e));
      // P1: 启动时清理过期记忆（fire-and-forget）
      invoke('startup_memory_maintenance', { workspacePath: path })
        .catch((e: unknown) => console.warn('startup_memory_maintenance failed:', e));
    }
  },
  setFileTree: (tree) => set({ fileTree: tree }),
  setSelectedFile: (path) => set({ selectedFile: path }),
  addOpenFile: (path) =>
    set((state) => ({
      openFiles: state.openFiles.includes(path)
        ? state.openFiles
        : [...state.openFiles, path],
    })),
  removeOpenFile: (path) =>
    set((state) => ({
      openFiles: state.openFiles.filter((p) => p !== path),
    })),
  markEditorSaveComplete: (workspace) =>
    set({ lastEditorSaveAt: Date.now(), lastEditorSaveWorkspace: workspace }),
}));

/** 检查是否应忽略文件树刷新（因自身保存触发） */
export function shouldIgnoreFileTreeRefresh(workspace: string): boolean {
  const state = useFileStore.getState();
  if (state.lastEditorSaveWorkspace !== workspace) return false;
  return Date.now() - state.lastEditorSaveAt < IGNORE_REFRESH_MS;
}
