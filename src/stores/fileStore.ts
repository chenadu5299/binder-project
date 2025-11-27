import { create } from 'zustand';
import { FileTreeNode } from '../types/file';

interface FileState {
  currentWorkspace: string | null;
  fileTree: FileTreeNode | null;
  selectedFile: string | null;
  openFiles: string[]; // 打开的文件路径列表
  
  setCurrentWorkspace: (path: string | null) => void;
  setFileTree: (tree: FileTreeNode | null) => void;
  setSelectedFile: (path: string | null) => void;
  addOpenFile: (path: string) => void;
  removeOpenFile: (path: string) => void;
}

export const useFileStore = create<FileState>((set) => ({
  currentWorkspace: null,
  fileTree: null,
  selectedFile: null,
  openFiles: [],

  setCurrentWorkspace: (path) => set({ currentWorkspace: path }),
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
}));

