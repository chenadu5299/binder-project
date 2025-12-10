import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { FileTreeNode } from '../types/file';
import { Workspace } from '../types/workspace';

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

  async loadWorkspaces(): Promise<Workspace[]> {
    return await invoke<Workspace[]>('load_workspaces');
  },

  async openWorkspace(path: string): Promise<void> {
    await invoke('open_workspace', { path });
  },

  // ⚠️ Week 18.1：移动文件到工作区（用于拖拽导入）
  async moveFileToWorkspace(sourcePath: string, workspacePath: string): Promise<string> {
    return await invoke<string>('move_file_to_workspace', {
      sourcePath,
      workspacePath,
    });
  },

  // ⚠️ Week 18.2：重命名文件或文件夹
  async renameFile(path: string, newName: string): Promise<void> {
    await invoke('rename_file', { path, newName });
  },

  // ⚠️ Week 18.2：删除文件或文件夹
  async deleteFile(path: string): Promise<void> {
    await invoke('delete_file', { path });
  },

  // ⚠️ Week 18.2：复制文件
  async duplicateFile(path: string): Promise<string> {
    return await invoke<string>('duplicate_file', { path });
  },

  // 工作区内移动文件或文件夹
  async moveFile(sourcePath: string, destinationPath: string, workspacePath?: string): Promise<void> {
    await invoke('move_file', {
      sourcePath,
      destinationPath,
      workspacePath: workspacePath || null,
    });
  },

  // ⚠️ Week 20：AI 智能分类整理
  async classifyFiles(filePaths: string[], workspacePath: string): Promise<FileClassification[]> {
    return await invoke<FileClassification[]>('classify_files', {
      filePaths,
      workspacePath,
    });
  },

  async organizeFiles(filePaths: string[], workspacePath: string): Promise<FileMoveResult[]> {
    return await invoke<FileMoveResult[]>('organize_files', {
      filePaths,
      workspacePath,
    });
  },
};

// ⚠️ Week 20：文件分类相关类型
export interface FileClassification {
  file_path: string;
  category: string;
  reason: string;
  confidence: number;
}

export interface FileMoveResult {
  file_path: string;
  success: boolean;
  message: string;
}
