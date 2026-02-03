/**
 * 路径规范化工具函数
 * 统一处理路径格式，确保前后端一致
 */

/**
 * 规范化文件路径
 * - 统一使用正斜杠 `/` 作为路径分隔符
 * - 移除路径开头的多余斜杠
 * - 确保路径格式与后端一致
 * 
 * @param path 文件路径（绝对路径或相对路径）
 * @returns 规范化后的路径
 * 
 * @example
 * normalizePath('C:\\Users\\test\\file.docx') => 'C:/Users/test/file.docx'
 * normalizePath('/Users/test/file.docx') => '/Users/test/file.docx'
 * normalizePath('//Users//test//file.docx') => '/Users/test/file.docx'
 */
export function normalizePath(path: string): string {
  if (!path) return path;
  
  // 统一使用正斜杠
  let normalized = path.replace(/\\/g, '/');
  
  // 移除路径开头的多余斜杠（保留一个，如果是绝对路径）
  if (normalized.startsWith('//')) {
    normalized = normalized.replace(/^\/+/, '/');
  }
  
  return normalized;
}

/**
 * 规范化工作区路径
 * 与 normalizePath 相同，但明确用于工作区路径
 * 
 * @param workspacePath 工作区路径
 * @returns 规范化后的工作区路径
 */
export function normalizeWorkspacePath(workspacePath: string): string {
  return normalizePath(workspacePath);
}

/**
 * 获取相对路径（相对于工作区）
 * 
 * @param filePath 文件绝对路径
 * @param workspacePath 工作区绝对路径
 * @returns 相对路径（相对于工作区）
 * 
 * @example
 * getRelativePath('/Users/test/file.docx', '/Users/test') => 'file.docx'
 * getRelativePath('/Users/test/sub/file.docx', '/Users/test') => 'sub/file.docx'
 */
export function getRelativePath(filePath: string, workspacePath: string): string {
  const normalizedFilePath = normalizePath(filePath);
  const normalizedWorkspacePath = normalizePath(workspacePath);
  
  if (normalizedFilePath.startsWith(normalizedWorkspacePath)) {
    let relative = normalizedFilePath.slice(normalizedWorkspacePath.length);
    // 移除开头的斜杠
    relative = relative.replace(/^\/+/, '');
    return relative;
  }
  
  // 如果不匹配，返回原路径（可能是相对路径）
  return normalizedFilePath;
}

/**
 * 获取绝对路径（基于工作区）
 * 
 * @param relativePath 相对路径
 * @param workspacePath 工作区绝对路径
 * @returns 绝对路径
 * 
 * @example
 * getAbsolutePath('file.docx', '/Users/test') => '/Users/test/file.docx'
 * getAbsolutePath('sub/file.docx', '/Users/test') => '/Users/test/sub/file.docx'
 */
export function getAbsolutePath(relativePath: string, workspacePath: string): string {
  const normalizedRelative = normalizePath(relativePath);
  const normalizedWorkspace = normalizePath(workspacePath);
  
  // 如果相对路径已经是绝对路径，直接返回
  if (normalizedRelative.startsWith('/') || /^[A-Za-z]:/.test(normalizedRelative)) {
    return normalizedRelative;
  }
  
  // 组合路径
  const combined = `${normalizedWorkspace}/${normalizedRelative}`;
  // 规范化组合后的路径（移除多余的斜杠）
  return normalizePath(combined);
}

