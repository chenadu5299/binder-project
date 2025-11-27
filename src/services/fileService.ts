import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { FileTreeNode } from '../types/file';

export const fileService = {
  async buildFileTree(rootPath: string, maxDepth: number = 5): Promise<FileTreeNode> {
    return await invoke<FileTreeNode>('build_file_tree', {
      rootPath,
      maxDepth,
    });
  },

  async readFile(path: string): Promise<string> {
    return await invoke<string>('read_file_content', { path });
  },

  async writeFile(path: string, content: string): Promise<void> {
    await invoke('write_file', { path, content });
  },

  async createFile(path: string, fileType: string): Promise<void> {
    await invoke('create_file', { path, fileType });
  },

  async createFolder(path: string): Promise<void> {
    await invoke('create_folder', { path });
  },

  async openWorkspaceDialog(): Promise<string | null> {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: '选择工作区',
      });
      
      // Tauri 2.x 返回的可能是 string 或 string[] 或 null
      if (selected === null || selected === undefined) {
        return null;
      }
      
      if (Array.isArray(selected)) {
        return selected.length > 0 ? selected[0] : null;
      }
      
      if (typeof selected === 'string') {
        return selected;
      }
      
      return null;
    } catch (error) {
      console.error('打开工作区对话框失败:', error);
      throw error;
    }
  },

  async loadWorkspaces(): Promise<string[]> {
    return await invoke<string[]>('load_workspaces');
  },

  async openWorkspace(path: string): Promise<void> {
    await invoke('open_workspace', { path });
  },
};
