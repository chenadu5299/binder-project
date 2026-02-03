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
    external: { fileType: 'text', source: 'external', canEdit: true, previewMode: false, requiresConversion: false }, // ⚠️ 修复：外部文本文件应该可以编辑
    ai_generated: { fileType: 'text', source: 'ai_generated', canEdit: true, previewMode: false, requiresConversion: false },
  },
  docx: {
    new: { fileType: 'docx', source: 'new', canEdit: true, previewMode: false, requiresConversion: true },
    external: { fileType: 'docx', source: 'external', canEdit: false, previewMode: true, requiresConversion: true },
    ai_generated: { fileType: 'docx', source: 'ai_generated', canEdit: true, previewMode: false, requiresConversion: true },
  },
  excel: {
    new: { fileType: 'excel', source: 'new', canEdit: false, previewMode: true, requiresConversion: true },
    external: { fileType: 'excel', source: 'external', canEdit: false, previewMode: true, requiresConversion: true },
    ai_generated: { fileType: 'excel', source: 'ai_generated', canEdit: false, previewMode: true, requiresConversion: true },
  },
  presentation: {
    new: { fileType: 'presentation', source: 'new', canEdit: false, previewMode: true, requiresConversion: true },
    external: { fileType: 'presentation', source: 'external', canEdit: false, previewMode: true, requiresConversion: true },
    ai_generated: { fileType: 'presentation', source: 'ai_generated', canEdit: false, previewMode: true, requiresConversion: true },
  },
  html: {
    new: { fileType: 'html', source: 'new', canEdit: true, previewMode: false, requiresConversion: false },
    external: { fileType: 'html', source: 'external', canEdit: true, previewMode: false, requiresConversion: false }, // ⚠️ 修复：外部 HTML 文件也应该可以编辑
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
  audio: {
    new: { fileType: 'audio', source: 'new', canEdit: false, previewMode: true, requiresConversion: false },
    external: { fileType: 'audio', source: 'external', canEdit: false, previewMode: true, requiresConversion: false },
    ai_generated: { fileType: 'audio', source: 'ai_generated', canEdit: false, previewMode: true, requiresConversion: false },
  },
  video: {
    new: { fileType: 'video', source: 'new', canEdit: false, previewMode: true, requiresConversion: false },
    external: { fileType: 'video', source: 'external', canEdit: false, previewMode: true, requiresConversion: false },
    ai_generated: { fileType: 'video', source: 'ai_generated', canEdit: false, previewMode: true, requiresConversion: false },
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
  // Excel 格式：.xlsx, .xls, .ods, .csv 都使用 excel 类型处理（通过 LibreOffice 转换或直接解析）
  if (['xlsx', 'xls', 'ods', 'csv'].includes(ext || '')) return 'excel';
  // 演示文稿格式：.pptx, .ppt, .ppsx, .pps, .odp 都使用 presentation 类型处理（通过 LibreOffice 转换）
  if (['pptx', 'ppt', 'ppsx', 'pps', 'odp'].includes(ext || '')) return 'presentation';
  if (ext === 'html') return 'html';
  if (ext === 'pdf') return 'pdf';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext || '')) return 'image';
  // 音频格式：.mp3, .wav, .ogg, .aac, .m4a
  if (['mp3', 'wav', 'ogg', 'aac', 'm4a'].includes(ext || '')) return 'audio';
  // 视频格式：.mp4, .webm, .ogg
  if (['mp4', 'webm'].includes(ext || '')) return 'video';
  // 注意：.ogg 可能是音频也可能是视频，优先识别为音频
  return 'text'; // 默认
}

/**
 * 识别文件来源
 * 
 * **文件来源类型**：
 * - `new`: Binder 原生创建的文件（通过"新建文件"功能）
 * - `ai_generated`: AI 指令创建的文件（通过工具调用）
 * - `external`: 外部导入的文件（从文件系统导入）
 * 
 * **识别逻辑**：
 * 1. 优先检查上下文标记（最可靠）
 * 2. 通过文件路径模式判断（.binder/temp/ 目录下的文件是外部导入）
 * 3. 通过文件修改时间推断（辅助判断）
 * 4. 默认认为是外部导入
 * 
 * **注意**：
 * - Binder 原生创建的文件会显式传递 `context.isNewFile = true`
 * - AI 生成的文件会显式传递 `context.isAIGenerated = true`
 * - 外部导入的文件通常不会传递上下文，需要通过其他方式判断
 * 
 * @param filePath 文件路径
 * @param context 上下文信息（可选）
 *   - `isNewFile`: 是否为新建文件（Binder 原生创建）
 *   - `isAIGenerated`: 是否为 AI 生成文件（工具调用创建）
 *   - `workspacePath`: 当前工作区路径（用于判断文件是否在工作区内）
 */
async function detectFileSource(
  filePath: string,
  context?: { isNewFile?: boolean; isAIGenerated?: boolean; workspacePath?: string }
): Promise<FileSource> {
  // 1. 检查上下文标记（最可靠的方式）
  // Binder 原生创建的文件会显式传递 isNewFile
  if (context?.isNewFile) {
    return 'new';
  }
  
  // AI 生成的文件会显式传递 isAIGenerated
  if (context?.isAIGenerated) {
    return 'ai_generated';
  }
  
  // 2. 检查文件路径模式（用于识别外部导入的临时文件）
  // .binder/temp/ 目录下的文件是外部导入的临时文件
  if (filePath.includes('.binder/temp/') || filePath.includes('.binder\\temp\\')) {
    return 'external';
  }
  
  // 3. 检查是否是草稿文件（草稿文件来自外部导入）
  // 草稿文件命名格式：原文件名.draft.docx
  if (filePath.includes('.draft.')) {
    return 'external';
  }
  
  // 3.5. 检查元数据文件（最可靠的方式，用于识别 Binder 创建的文件）
  // ⚠️ 关键：元数据查询应该是唯一可靠的方式
  // 如果文件在元数据文件中，说明是 Binder 创建的文件（new 或 ai_generated）
  // 无论文件创建时间多久，都应该能通过元数据识别
  try {
    const { getBinderFileSource } = await import('./fileMetadataService');
    const { normalizePath, normalizeWorkspacePath } = await import('../utils/pathUtils');
    
    const normalizedFilePath = normalizePath(filePath);
    const normalizedWorkspacePath = context?.workspacePath ? normalizeWorkspacePath(context.workspacePath) : undefined;
    
    const metadataSource = await getBinderFileSource(normalizedFilePath, normalizedWorkspacePath);
    if (metadataSource) {
      // 元数据查询成功，直接返回（这是最可靠的方式）
      return metadataSource as FileSource;
    }
  } catch (error) {
    console.warn('检查文件元数据失败:', error);
    // 元数据查询失败，继续其他检查
  }
  
  // 4. 默认认为是外部导入
  // ⚠️ 关键：如果元数据查询失败，默认返回 external（预览模式）
  // 这样可以确保只有元数据中明确标记的文件才进入编辑模式
  // 避免原生 Word 文件被误判为 Binder 创建的文件
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
      
      // 判断是否为文本类文件（用于后续逻辑）
      const isTextFile = fileType === 'text' || fileType === 'markdown';
      
      // 3. 识别文件来源（如果未显式指定）
      // ⚠️ 关键修复：对于文本类文件，无论来源如何，都应该允许编辑
      // 如果未显式指定 source，使用 detectFileSource 自动检测
      // 从文件树打开的文件，会尝试通过工作区路径和文件路径模式判断来源
      let workspacePath: string | undefined = undefined;
      try {
        // 尝试从 useFileStore 获取当前工作区路径
        const { useFileStore } = await import('../stores/fileStore');
        workspacePath = useFileStore.getState().currentWorkspace || undefined;
      } catch (error) {
        // 如果无法获取工作区路径，忽略错误
        console.warn('无法获取工作区路径:', error);
      }
      
      let source: FileSource = 'external'; // 默认值
      try {
        source = options?.source || await detectFileSource(filePath, {
          workspacePath
        });
      } catch (error) {
        // ⚠️ 关键修复：文件来源检测失败不应该阻止文件打开
        // 默认使用 external，确保文件可以正常打开
        console.warn('[documentService.openFile] 文件来源检测失败，使用默认值 external:', error);
        source = 'external';
      }
      
      // ⚠️ 关键修复：对于文本类文件，如果检测为 external，强制使用可编辑策略
      // 确保所有文本文件都可以编辑，无论来源如何
      if (isTextFile && source === 'external') {
        // 对于文本文件，即使来源是 external，也应该允许编辑
        // 不修改 source，但确保策略允许编辑（策略表中已经设置 canEdit: true）
        console.log('[documentService.openFile] 文本文件，确保可编辑:', { filePath, fileType, source });
      }
      
      // 调试日志：记录文件打开信息
      console.log('[documentService.openFile] 文件打开信息:', {
        filePath,
        fileType,
        source,
        explicitSource: options?.source,
        previewMode: FILE_OPEN_STRATEGIES[fileType]?.[source]?.previewMode,
        canEdit: FILE_OPEN_STRATEGIES[fileType]?.[source]?.canEdit,
      });

      // DOCX 专用：明确输出「为何预览/编辑」，便于排查「无法进入编辑」问题
      // 说明：所有 DOCX 打开都经此路径，无独立预览逻辑线；结果由 source（元数据/上下文）唯一决定
      if (fileType === 'docx') {
        const strategy = FILE_OPEN_STRATEGIES.docx?.[source];
        const previewMode = strategy?.previewMode ?? true;
        const result = previewMode ? '预览' : '编辑';
        const reason =
          source === 'external'
            ? '未在元数据中或未传 source → 视为 external → 预览（可在预览页点「编辑」创建草稿后编辑）'
            : source === 'new'
              ? '来源 new（Binder 新建）→ 直接编辑'
              : source === 'ai_generated'
                ? '来源 ai_generated（AI 生成）→ 直接编辑'
                : `source=${source} → ${result}`;
        console.log('[DOCX 打开]', {
          result,
          source,
          previewMode,
          reason,
          filePath: filePath.split('/').pop(),
        });
      }

      // 4. 获取打开策略
      let strategy = FILE_OPEN_STRATEGIES[fileType]?.[source];
      
      // ⚠️ 关键修复：对于文本类文件，如果策略不存在或策略不允许编辑，强制使用可编辑策略
      if (isTextFile) {
        if (!strategy) {
          console.warn(`[documentService.openFile] 文本文件策略不存在: ${fileType} / ${source}，使用默认可编辑策略`);
          strategy = FILE_OPEN_STRATEGIES[fileType]?.['external'] || FILE_OPEN_STRATEGIES[fileType]?.['new'];
        }
        
        // 如果策略存在但不允许编辑，强制修改为可编辑
        if (strategy && !strategy.canEdit) {
          console.warn(`[documentService.openFile] 文本文件策略不允许编辑，强制修改为可编辑: ${fileType} / ${source}`);
          strategy = {
            ...strategy,
            canEdit: true,
            previewMode: false,
          };
        }
      } else {
        // 非文本文件：使用原有逻辑
        if (!strategy) {
          console.warn(`[documentService.openFile] 不支持的文件类型或来源: ${fileType} / ${source}，尝试使用默认策略`);
          const defaultStrategy = FILE_OPEN_STRATEGIES[fileType]?.['external'];
          if (!defaultStrategy) {
            throw new Error(`不支持的文件类型: ${fileType}`);
          }
          await this.openFileWithStrategy(filePath, defaultStrategy, lastModifiedTime, options);
          return;
        }
      }
      
      if (!strategy) {
        throw new Error(`无法确定文件打开策略: ${fileType} / ${source}`);
      }
      
      // 5. 根据策略打开文件
      await this.openFileWithStrategy(filePath, strategy, lastModifiedTime, options);
      
    } catch (error) {
      console.error('[documentService.openFile] 打开文件失败:', error);
      // ⚠️ 关键修复：抛出错误时包含更多上下文信息
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`打开文件失败: ${errorMessage} (文件: ${filePath})`);
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
    
    // ⚠️ 关键修复：判断是否为文本类文件（应该始终可编辑）
    const isTextFile = fileType === 'text' || fileType === 'markdown' || fileType === 'html';
    
    // 调试日志：记录策略信息
    console.log('[documentService.openFileWithStrategy] 策略信息:', {
      filePath,
      fileName,
      fileType,
      source: strategy.source,
      canEdit,
      previewMode,
      requiresConversion,
      forceEdit,
      isDraft,
      isTextFile,
      calculatedIsReadOnly: isTextFile ? false : (fileType === 'docx' ? (previewMode && !forceEdit && !isDraft) : undefined),
    });
    
    try {
      switch (fileType) {
        case 'markdown':
        case 'text': {
          // Markdown 和 TXT：直接读取文本
          let content = '';
          try {
            content = await invoke<string>('read_file_content', { path: filePath });
          } catch (error) {
            console.error('[documentService.openFileWithStrategy] 读取文件内容失败:', error);
            throw new Error(`读取文件内容失败: ${error instanceof Error ? error.message : String(error)}`);
          }
          
          try {
            // ⚠️ 关键修复：文本文件始终可编辑，不受 source 或 previewMode 影响
            // 只有 DOCX 等需要转换的文件才需要考虑 previewMode
            const isReadOnly = false; // 文本文件始终可编辑
            console.log('[documentService.openFileWithStrategy] 添加文本文件标签页:', {
              filePath,
              fileName,
              isReadOnly,
              contentLength: content.length,
            });
            useEditorStore.getState().addTab(
              filePath,
              fileName,
              content,
              isReadOnly,
              isDraft,
              lastModifiedTime
            );
          } catch (error) {
            console.error('[documentService.openFileWithStrategy] 添加标签页失败:', error);
            throw new Error(`添加标签页失败: ${error instanceof Error ? error.message : String(error)}`);
          }
          break;
        }
      
        case 'html': {
          // HTML：读取内容
          // ⚠️ 关键修复：HTML 文件应该可以编辑（与文本文件相同）
          let content = '';
          try {
            content = await invoke<string>('read_file_content', { path: filePath });
          } catch (error) {
            console.error('[documentService.openFileWithStrategy] 读取文件内容失败:', error);
            throw new Error(`读取文件内容失败: ${error instanceof Error ? error.message : String(error)}`);
          }
          
          try {
            // ⚠️ 关键修复：HTML 文件始终可编辑，与文本文件相同
            // 无论策略如何，HTML 文件都应该可以编辑
            const isReadOnly = false; // HTML 文件始终可编辑
            console.log('[documentService.openFileWithStrategy] 添加 HTML 文件标签页:', {
              filePath,
              fileName,
              isReadOnly,
              contentLength: content.length,
              strategyCanEdit: canEdit,
              strategyPreviewMode: previewMode,
            });
            useEditorStore.getState().addTab(
              filePath,
              fileName,
              content,
              isReadOnly,
              isDraft,
              lastModifiedTime
            );
          } catch (error) {
            console.error('[documentService.openFileWithStrategy] 添加标签页失败:', error);
            throw new Error(`添加标签页失败: ${error instanceof Error ? error.message : String(error)}`);
          }
          break;
        }
      
      case 'docx': {
        if (requiresConversion) {
          // 判断是否预览模式（唯一决定因素：策略的 previewMode + forceEdit + isDraft）
          const isReadOnly = previewMode && !forceEdit && !isDraft;
          console.log('[DOCX 策略]', {
            isReadOnly,
            reason: isReadOnly
              ? `previewMode=${previewMode} && !forceEdit=${!forceEdit} && !isDraft=${!isDraft} → 预览（addTab 空内容 + isReadOnly=true）`
              : `可编辑 → 调用 open_docx_for_edit 后 addTab(htmlContent, isReadOnly=false)`,
            source: strategy.source,
            previewMode,
            forceEdit,
            isDraft,
            fileName: filePath.split('/').pop(),
          });
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
              } else if (errorMessage.includes('文档内容过大') || errorMessage.includes('超过 15 MB') || errorMessage.includes('超过编辑模式限制')) {
                userFriendlyError = errorMessage; // 后端已返回完整友好说明，直接使用
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
      
      case 'excel': {
        // Excel 文件：预览模式（PDF 转换或 CSV 直接解析）
        // 判断是否预览模式
        const isReadOnly = previewMode && !forceEdit && !isDraft;
        
        if (isReadOnly) {
          // ✅ 预览模式：不预先转换，由 ExcelPreview/CsvPreview 组件处理
          useEditorStore.getState().addTab(
            filePath,
            fileName,
            '', // 空内容
            true, // isReadOnly
            isDraft,
            lastModifiedTime
          );
        }
        break;
      }
      
      case 'presentation': {
        // 演示文稿文件：预览模式（PDF 转换）
        // 判断是否预览模式
        const isReadOnly = previewMode && !forceEdit && !isDraft;
        
        if (isReadOnly) {
          // ✅ 预览模式：不预先转换，由 PresentationPreview 组件处理
          useEditorStore.getState().addTab(
            filePath,
            fileName,
            '', // 空内容
            true, // isReadOnly
            isDraft,
            lastModifiedTime
          );
        }
        break;
      }
      
      case 'pdf':
      case 'image':
      case 'audio':
      case 'video': {
        // PDF、图片、音频、视频：预览模式
        try {
          useEditorStore.getState().addTab(
            filePath,
            fileName,
            '', // 预览文件不需要内容
            true, // 只读模式
            isDraft,
            lastModifiedTime
          );
        } catch (error) {
          console.error('[documentService.openFileWithStrategy] 添加标签页失败:', error);
          throw new Error(`添加标签页失败: ${error instanceof Error ? error.message : String(error)}`);
        }
        break;
      }
      
      default: {
        throw new Error(`不支持的文件类型: ${fileType}`);
      }
    }
    } catch (error) {
      // ⚠️ 关键修复：捕获 switch 语句中的所有错误
      console.error('[documentService.openFileWithStrategy] 打开文件失败:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`打开文件失败: ${errorMessage} (文件: ${filePath}, 类型: ${fileType})`);
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

