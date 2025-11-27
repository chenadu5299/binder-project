import { invoke } from '@tauri-apps/api/core';
import { useEditorStore } from '../stores/editorStore';

export const documentService = {
  async openFile(filePath: string): Promise<void> {
    try {
      // 1. 检查文件类型
      const ext = filePath.split('.').pop()?.toLowerCase();
      
      if (ext === 'md' || ext === 'txt') {
        // Markdown 和文本文件：直接读取文本内容
        const content = await invoke<string>('read_file_content', { path: filePath });
        useEditorStore.getState().addTab(filePath, filePath.split('/').pop() || '未命名', content, false, false);
      } else if (ext === 'html') {
        // ⚠️ HTML 文件：直接读取并保持格式
        const content = await invoke<string>('read_file_content', { path: filePath });
        useEditorStore.getState().addTab(filePath, filePath.split('/').pop() || '未命名', content, false, false);
      } else if (ext === 'docx') {
        // DOCX 文件：暂时用文本方式打开（Week 8 会实现完整支持）
        // 先尝试读取，如果失败则提示用户
        try {
          const content = await invoke<string>('read_file_content', { path: filePath });
          // 如果读取成功，说明可能是文本格式，直接显示
          // 但 DOCX 通常是二进制，这里只是临时方案
          useEditorStore.getState().addTab(filePath, filePath.split('/').pop() || '未命名', `<p>${content}</p>`, false, false);
        } catch (error) {
          // 如果是二进制文件，提示用户但允许打开（显示占位内容）
          const fileName = filePath.split('/').pop() || '未命名';
          const placeholder = `<div style="padding: 20px; text-align: center; color: #666;">
            <h2>DOCX 文件预览</h2>
            <p>文件：${fileName}</p>
            <p style="margin-top: 20px; color: #999;">
              DOCX 文件的完整编辑功能将在 Week 8 实现（Pandoc 集成）。<br/>
              当前版本可以打开简单的 DOCX 文件，复杂格式需要等待后续更新。
            </p>
          </div>`;
          useEditorStore.getState().addTab(filePath, fileName, placeholder, true, false); // 只读模式
        }
      } else if (ext === 'pdf') {
        // PDF 文件：使用 iframe 预览
        useEditorStore.getState().addTab(filePath, filePath.split('/').pop() || '未命名', '', false, false);
      } else if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext || '')) {
        // 图片文件：使用图片预览
        useEditorStore.getState().addTab(filePath, filePath.split('/').pop() || '未命名', '', false, false);
      } else {
        throw new Error(`不支持的文件类型: ${ext}`);
      }
    } catch (error) {
      console.error('打开文件失败:', error);
      throw error;
    }
  },
  
  async saveFile(filePath: string, content: string): Promise<void> {
    try {
      const ext = filePath.split('.').pop()?.toLowerCase();
      
      if (ext === 'docx') {
        // DOCX 文件需要转换（暂时直接保存为文本，后续实现）
        // await invoke('save_docx', { path: filePath, htmlContent: content });
        await invoke('write_file', { path: filePath, content });
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

