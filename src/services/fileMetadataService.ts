/**
 * 文件元数据服务
 * 用于记录 Binder 创建的文件路径和来源，以便后续识别
 */

import { invoke } from '@tauri-apps/api/core';
import { FileSource } from '../types/file';
import { normalizePath, normalizeWorkspacePath } from '../utils/pathUtils';

/**
 * 记录文件为 Binder 创建的文件
 * @param filePath 文件路径（绝对路径或相对路径）
 * @param source 文件来源（'new' 或 'ai_generated'）
 * @param workspacePath 可选的工作区路径（如果提供，直接使用；否则从文件路径推断）
 * @param retries 重试次数（默认3次）
 */
export async function recordBinderFile(
  filePath: string,
  source: 'new' | 'ai_generated',
  workspacePath?: string,
  retries: number = 3
): Promise<void> {
  // 规范化路径格式（确保与后端一致）
  const normalizedFilePath = normalizePath(filePath);
  const normalizedWorkspacePath = workspacePath ? normalizeWorkspacePath(workspacePath) : undefined;
  
  console.log('[fileMetadataService.recordBinderFile] 开始记录元数据:', {
    originalFilePath: filePath,
    normalizedFilePath,
    normalizedWorkspacePath,
    source,
    retries,
  });
  
  let lastError: Error | null = null;
  
  // 重试机制
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`[fileMetadataService.recordBinderFile] 尝试 ${attempt}/${retries}...`);
      await invoke('record_binder_file', {
        filePath: normalizedFilePath,
        source,
        workspacePath: normalizedWorkspacePath || null,
      });
      console.log(`[fileMetadataService.recordBinderFile] ✅ 调用后端成功（尝试 ${attempt}/${retries}）`);
      
      // 记录成功，验证是否真的写入成功（可选，但建议）
      if (normalizedWorkspacePath) {
        // 等待一小段时间确保文件写入完成
        await new Promise(resolve => setTimeout(resolve, 50));
        
        // 验证元数据是否真的记录成功
        const recordedSource = await getBinderFileSource(normalizedFilePath, normalizedWorkspacePath);
        if (recordedSource === source) {
          return; // 确认记录成功
        } else if (attempt < retries) {
          // 记录失败，但还有重试机会
          console.warn(`元数据记录验证失败（尝试 ${attempt}/${retries}），重试...`);
          await new Promise(resolve => setTimeout(resolve, 100 * attempt)); // 递增延迟
          continue;
        }
      } else {
        // 没有工作区路径，无法验证，直接返回
        return;
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < retries) {
        console.warn(`记录文件元数据失败（尝试 ${attempt}/${retries}），重试...`, error);
        await new Promise(resolve => setTimeout(resolve, 100 * attempt)); // 递增延迟
      }
    }
  }
  
  // 所有重试都失败
  console.error('记录文件元数据失败（所有重试都失败）:', lastError);
  throw lastError || new Error('记录文件元数据失败');
}

/**
 * 检查文件是否为 Binder 创建的文件
 * @param filePath 文件路径（绝对路径或相对路径）
 * @param workspacePath 可选的工作区路径（如果提供，直接使用；否则从文件路径推断）
 * @returns 文件来源，如果不是 Binder 创建的文件，返回 null
 */
export async function getBinderFileSource(
  filePath: string,
  workspacePath?: string
): Promise<FileSource | null> {
  try {
    // 规范化路径格式（确保与后端一致）
    const normalizedFilePath = normalizePath(filePath);
    const normalizedWorkspacePath = workspacePath ? normalizeWorkspacePath(workspacePath) : undefined;
    
    console.log('[fileMetadataService.getBinderFileSource] 查询元数据:', {
      originalFilePath: filePath,
      normalizedFilePath,
      normalizedWorkspacePath,
    });
    
    const source = await invoke<FileSource | null>('get_binder_file_source', {
      filePath: normalizedFilePath,
      workspacePath: normalizedWorkspacePath || null,
    });
    
    console.log('[fileMetadataService.getBinderFileSource] 查询结果:', {
      source,
      hasSource: !!source,
    });
    
    return source;
  } catch (error) {
    // ⚠️ 关键修复：元数据查询失败不应该阻止文件打开
    // 返回 null 表示文件不在元数据中，这是正常情况（外部文件）
    console.warn('[fileMetadataService.getBinderFileSource] 获取文件元数据失败（这是正常的，可能是外部文件）:', error);
    return null;
  }
}

/**
 * 删除文件的元数据记录（当文件被删除时）
 * @param filePath 文件路径
 */
export async function removeBinderFileRecord(filePath: string): Promise<void> {
  try {
    await invoke('remove_binder_file_record', {
      filePath,
    });
  } catch (error) {
    console.warn('删除文件元数据失败:', error);
    // 失败不影响主流程，只记录警告
  }
}

