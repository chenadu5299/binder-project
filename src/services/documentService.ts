import { invoke } from '@tauri-apps/api/core';
import { useEditorStore } from '../stores/editorStore';
import { FileType, FileSource, FileOpenStrategy } from '../types/file';
import { enhanceHTMLContent } from './htmlStyleProcessor';

// 文件打开策略表
const FILE_OPEN_STRATEGIES: Record<FileType, Record<FileSource, FileOpenStrategy>> = {
  markdown: {
    new: { fileType: 'markdown', source: 'new', canEdit: true, previewMode: false, requiresConversion: false },
    external: { fileType: 'markdown', source: 'external', canEdit: true, previewMode: false, requiresConversion: false },
    ai_generated: { fileType: 'markdown', source: 'ai_generated', canEdit: true, previewMode: false, requiresConversion: false },
  },
  text: {
    new: { fileType: 'text', source: 'new', canEdit: true, previewMode: false, requiresConversion: false },
    external: { fileType: 'text', source: 'external', canEdit: true, previewMode: false, requiresConversion: false },
    ai_generated: { fileType: 'text', source: 'ai_generated', canEdit: true, previewMode: false, requiresConversion: false },
  },
  docx: {
    new: { fileType: 'docx', source: 'new', canEdit: true, previewMode: false, requiresConversion: true },
    external: { fileType: 'docx', source: 'external', canEdit: false, previewMode: true, requiresConversion: true },
    ai_generated: { fileType: 'docx', source: 'ai_generated', canEdit: true, previewMode: false, requiresConversion: true },
  },
  html: {
    new: { fileType: 'html', source: 'new', canEdit: true, previewMode: false, requiresConversion: false },
    external: { fileType: 'html', source: 'external', canEdit: true, previewMode: true, requiresConversion: false },
    ai_generated: { fileType: 'html', source: 'ai_generated', canEdit: true, previewMode: false, requiresConversion: false },
  },
  pdf: {
    new: { fileType: 'pdf', source: 'new', canEdit: false, previewMode: true, requiresConversion: false },
    external: { fileType: 'pdf', source: 'external', canEdit: false, previewMode: true, requiresConversion: false },
    ai_generated: { fileType: 'pdf', source: 'ai_generated', canEdit: false, previewMode: true, requiresConversion: false },
  },
  image: {
    new: { fileType: 'image', source: 'new', canEdit: false, previewMode: true, requiresConversion: false },
    external: { fileType: 'image', source: 'external', canEdit: false, previewMode: true, requiresConversion: false },
    ai_generated: { fileType: 'image', source: 'ai_generated', canEdit: false, previewMode: true, requiresConversion: false },
  },
};

/**
 * 获取文件类型
 */
function getFileType(filePath: string): FileType {
  const ext = filePath.split('.').pop()?.toLowerCase();
  if (ext === 'md') return 'markdown';
  if (ext === 'txt') return 'text';
  // 文档格式：.docx, .doc, .odt, .rtf 都使用 docx 类型处理（通过 Pandoc 转换）
  if (['docx', 'doc', 'odt', 'rtf'].includes(ext || '')) return 'docx';
  if (ext === 'html') return 'html';
  if (ext === 'pdf') return 'pdf';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext || '')) return 'image';
  return 'text'; // 默认
}

/**
 * 识别文件来源
 * @param filePath 文件路径
 * @param context 上下文信息（可选）
 */
async function detectFileSource(
  filePath: string,
  context?: { isNewFile?: boolean; isAIGenerated?: boolean }
): Promise<FileSource> {
  // 1. 检查上下文标记
  if (context?.isNewFile) {
    return 'new';
  }
  
  if (context?.isAIGenerated) {
    return 'ai_generated';
  }
  
  // 2. 检查文件是否为新创建（通过文件修改时间）
  // 如果文件在最近1分钟内创建，可能是新建或AI生成
  try {
    const modifiedTime = await invoke<number>('get_file_modified_time', { path: filePath });
    const now = Date.now();
    const oneMinuteAgo = now - 60 * 1000;
    
    if (modifiedTime > oneMinuteAgo) {
      // 检查是否是草稿文件（草稿文件来自外部导入）
      if (filePath.includes('.draft.')) {
        return 'external'; // 草稿文件来自外部导入
      }
      
      // 检查文件是否在文件树中（新建的文件通常不在文件树中，AI生成的文件会在）
      // 这里简化处理：最近1分钟创建的文件，如果不是草稿，认为是AI生成
      return 'ai_generated';
    }
  } catch (error) {
    console.warn('检测文件来源失败:', error);
  }
  
  // 3. 默认认为是外部导入
  return 'external';
}

/**
 * 创建错误占位符
 */
function createErrorPlaceholder(fileName: string, errorMessage: string): string {
  // 将换行符转换为 HTML 换行
  const formattedMessage = errorMessage.replace(/\n/g, '<br/>');
  
  return `<div style="padding: 40px 20px; text-align: left; color: #333; max-width: 800px; margin: 0 auto;">
    <h2 style="color: #dc2626; margin-bottom: 16px;">⚠️ 文件预览失败</h2>
    <p style="margin-bottom: 8px;"><strong>文件：</strong>${fileName}</p>
    <div style="margin-top: 20px; padding: 16px; background: #fef2f2; border-left: 4px solid #dc2626; border-radius: 4px;">
      <p style="color: #991b1b; margin: 0; white-space: pre-wrap;">${formattedMessage}</p>
    </div>
    <div style="margin-top: 20px; padding: 12px; background: #f0f9ff; border-radius: 4px;">
      <p style="color: #0369a1; margin: 0; font-size: 14px;">
        <strong>提示：</strong>如果文件在其他工具中可以正常打开，可能是文件格式兼容性问题。请尝试用 Microsoft Word 打开并重新保存为 DOCX 格式。
      </p>
    </div>
  </div>`;
}

export const documentService = {
  /**
   * 打开文件
   * @param filePath 文件路径
   * @param options 可选参数
   */
  async openFile(
    filePath: string,
    options?: {
      source?: FileSource;  // 显式指定来源
      forceEdit?: boolean;  // 强制编辑模式
    }
  ): Promise<void> {
    try {
      // 1. 获取文件修改时间
      let lastModifiedTime: number;
      try {
        lastModifiedTime = await invoke<number>('get_file_modified_time', { path: filePath });
      } catch (error) {
        console.warn('获取文件修改时间失败，使用当前时间:', error);
        lastModifiedTime = Date.now();
      }
      
      // 2. 识别文件类型
      const fileType = getFileType(filePath);
      
      // 3. 识别文件来源（如果未显式指定）
      const source = options?.source || await detectFileSource(filePath);
      
      // 4. 获取打开策略
      const strategy = FILE_OPEN_STRATEGIES[fileType]?.[source];
      if (!strategy) {
        throw new Error(`不支持的文件类型或来源: ${fileType} / ${source}`);
      }
      
      // 5. 根据策略打开文件
      await this.openFileWithStrategy(filePath, strategy, lastModifiedTime, options);
      
    } catch (error) {
      console.error('打开文件失败:', error);
      throw error;
    }
  },
  
  /**
   * 根据策略打开文件
   */
  async openFileWithStrategy(
    filePath: string,
    strategy: FileOpenStrategy,
    lastModifiedTime: number,
    options?: { forceEdit?: boolean }
  ): Promise<void> {
    const fileName = filePath.split('/').pop() || '未命名';
    const { fileType, canEdit, previewMode, requiresConversion } = strategy;
    const forceEdit = options?.forceEdit || false;
    
    // 判断是否为草稿文件
    const isDraft = filePath.includes('.draft.');
    
    switch (fileType) {
      case 'markdown':
      case 'text': {
        // Markdown 和 TXT：直接读取文本
        const content = await invoke<string>('read_file_content', { path: filePath });
        useEditorStore.getState().addTab(
          filePath,
          fileName,
          content,
          false, // isReadOnly
          isDraft,
          lastModifiedTime
        );
        break;
      }
      
      case 'html': {
        // HTML：读取内容
        const content = await invoke<string>('read_file_content', { path: filePath });
        useEditorStore.getState().addTab(
          filePath,
          fileName,
          content,
          previewMode && !forceEdit, // 外部导入的HTML默认预览
          isDraft,
          lastModifiedTime
        );
        break;
      }
      
      case 'docx': {
        if (requiresConversion) {
          // 判断是否预览模式
          const isReadOnly = previewMode && !forceEdit && !isDraft;
          
          if (isReadOnly) {
            // ✅ 预览模式：不预先转换，由 DocxPreview 组件处理
            useEditorStore.getState().addTab(
              filePath,
              fileName,
              '', // 空内容
              true, // isReadOnly
              isDraft,
              lastModifiedTime
            );
          } else {
            // ✅ 编辑模式：使用新的 LibreOffice + ODT 方案
            try {
              // 使用新的 open_docx_for_edit 命令（LibreOffice + ODT 解析）
              // 新方案已经返回完整的 HTML，不需要额外的样式增强
              const htmlContent = await invoke<string>('open_docx_for_edit', { path: filePath });
              
              useEditorStore.getState().addTab(
                filePath,
                fileName,
                htmlContent,
                false, // isReadOnly
                isDraft,
                lastModifiedTime
              );
            } catch (error) {
              // LibreOffice + ODT 转换失败，显示错误提示
              const errorMessage = error instanceof Error ? error.message : String(error);
              
              // 分析错误类型
              let userFriendlyError = errorMessage;
              if (errorMessage.includes('Did not find end of central directory signature')) {
                userFriendlyError = `DOCX 文件格式错误或文件已损坏。\n\n` +
                  `错误详情：文件不是有效的 DOCX 格式（DOCX 文件本质上是 ZIP 压缩包）。\n\n` +
                  `可能的原因：\n` +
                  `1. 文件在传输过程中损坏\n` +
                  `2. 文件不是真正的 DOCX 格式（可能是其他格式重命名）\n` +
                  `3. 文件被其他程序占用或锁定\n\n` +
                  `建议：\n` +
                  `- 尝试用 Microsoft Word 或其他工具打开文件验证\n` +
                  `- 如果文件损坏，尝试从备份恢复\n` +
                  `- 检查文件大小是否正常（损坏的文件可能很小）`;
              } else if (errorMessage.includes('Pandoc 不可用')) {
                // 尝试检查 Pandoc 状态
                try {
                  const pandocStatus = await invoke<{ available: boolean; is_bundled: boolean; path: string | null }>('check_pandoc_available');
                  
                  if (!pandocStatus.available) {
                    userFriendlyError = `Pandoc 不可用。\n\n` +
                      `系统 Pandoc: ${pandocStatus.path || '未找到'}\n` +
                      `内置 Pandoc: ${pandocStatus.is_bundled ? '已找到' : '未找到'}\n\n` +
                      `请安装 Pandoc 或确保内置 Pandoc 可用。\n` +
                      `访问 https://pandoc.org/installing.html 获取安装指南。`;
                  }
                } catch (checkError) {
                  // 检查失败，使用原始错误信息
                }
              }
              
              const placeholder = createErrorPlaceholder(fileName, userFriendlyError);
              useEditorStore.getState().addTab(
                filePath,
                fileName,
                placeholder,
                true, // 只读模式
                isDraft,
                lastModifiedTime
              );
            }
          }
        }
        break;
      }
      
      case 'pdf':
      case 'image': {
        // PDF 和图片：预览模式
        useEditorStore.getState().addTab(
          filePath,
          fileName,
          '', // 预览文件不需要内容
          true, // 只读模式
          isDraft,
          lastModifiedTime
        );
        break;
      }
    }
  },
  
  async saveFile(filePath: string, content: string): Promise<void> {
    try {
      const ext = filePath.split('.').pop()?.toLowerCase();
      
      if (ext === 'docx') {
        // DOCX 文件需要转换 HTML 到 DOCX
        await invoke('save_docx', { path: filePath, htmlContent: content });
      } else {
        // 直接保存文本内容
        await invoke('write_file', { path: filePath, content });
      }
    } catch (error) {
      console.error('保存文件失败:', error);
      throw error;
    }
  },
};

