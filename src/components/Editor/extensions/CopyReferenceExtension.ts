import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { EditorView } from '@tiptap/pm/view';
import { useEditorStore } from '../../../stores/editorStore';
import { createAnchorFromSelection } from '../../../utils/anchorFromSelection';

interface CopyReferenceExtensionOptions {
  tabId?: string; // 标签页 ID，用于从 store 获取文件信息
  getFilePath?: () => string | null; // 可选的获取文件路径函数
  getFileName?: () => string | null; // 可选的获取文件名函数
}

/**
 * TipTap 扩展：在复制文字时，将引用元数据添加到剪贴板
 * 这样当用户在聊天窗口粘贴时，可以自动识别为引用而不是普通文本
 */
export const CopyReferenceExtension = Extension.create<CopyReferenceExtensionOptions>({
  name: 'copyReference',

  addOptions() {
    return {
      tabId: undefined,
      getFilePath: undefined,
      getFileName: undefined,
    };
  },

  addProseMirrorPlugins() {
    const { tabId, getFilePath, getFileName } = this.options;

    return [
      new Plugin({
        key: new PluginKey('copyReference'),
        props: {
          handleDOMEvents: {
            copy: (view: EditorView, event: ClipboardEvent) => {
              const { state } = view;
              const { selection } = state;
              const { from, to } = selection;

              // 如果没有选中文字，不处理
              if (from === to) {
                return false;
              }

              // 获取选中的文本
              const selectedText = state.doc.textBetween(from, to, '\n');

              // 获取文件信息（优先使用传入的函数，否则尝试从 store 获取）
              let filePath: string | null = null;
              let fileName: string | null = null;
              
              // 方法 1：使用传入的函数（最简单直接）
              if (getFilePath) {
                filePath = getFilePath();
              }
              if (getFileName) {
                fileName = getFileName();
              }
              
              // 方法 2：如果函数未提供，尝试从 store 获取（通过 tabId）
              if (!filePath && tabId) {
                try {
                  const store = useEditorStore.getState();
                  const tab = store.tabs.find((t: any) => t.id === tabId);
                  if (tab) {
                    filePath = tab.filePath || null;
                    fileName = tab.fileName || null;
                  }
                } catch (error) {
                  console.warn('⚠️ 无法从 store 获取文件信息:', error);
                }
              }
              
              const charRange = { from, to };

              // 如果没有文件路径，不处理（可能是草稿文件）
              if (!filePath) {
                console.log('📋 复制文字（无文件路径，不添加引用元数据）');
                return false;
              }

              // 精确定位：计算 blockId + offset（用于 edit_target）
              const doc = state.doc;
              const anchor = createAnchorFromSelection(doc, from, to);

              // 计算行号范围
              let startLine = 1;
              let endLine = 1;
              let currentPos = 0;

              for (let i = 0; i < doc.content.childCount; i++) {
                const child = doc.content.child(i);
                const childSize = child.nodeSize;

                if (currentPos <= from && from < currentPos + childSize) {
                  // 计算起始行号（简单估算，基于段落数）
                  startLine = i + 1;
                }
                if (currentPos <= to && to <= currentPos + childSize) {
                  // 计算结束行号
                  endLine = i + 1;
                  break;
                }
                currentPos += childSize;
              }

              // 创建引用元数据（含 blockId+offset 用于精确定位，Phase 0.2 支持跨块）
              const sourceData = {
                filePath,
                fileName,
                lineRange: {
                  start: startLine,
                  end: endLine,
                },
                charRange: {
                  start: charRange.from,
                  end: charRange.to,
                },
                ...(anchor && {
                  blockId: anchor.startBlockId,
                  startBlockId: anchor.startBlockId,
                  endBlockId: anchor.endBlockId,
                  startOffset: anchor.startOffset,
                  endOffset: anchor.endOffset,
                }),
              };

              console.log('📋 复制文字并添加引用元数据:', {
                filePath,
                fileName,
                selectedTextLength: selectedText.length,
                lineRange: sourceData.lineRange,
                charRange: sourceData.charRange,
              });

              // 设置全局变量作为主要方案（因为 dataTransfer 在 copy/paste 之间不共享）
              const sourceJson = JSON.stringify(sourceData);
              
              // 主要方案：使用全局变量（跨事件有效）
              (window as any).__binderClipboardSource = sourceJson;
              (window as any).__binderClipboardTimestamp = Date.now();
              console.log('✅ 设置全局变量存储引用元数据');
              
              // 5 秒后清除全局变量
              setTimeout(() => {
                delete (window as any).__binderClipboardSource;
                delete (window as any).__binderClipboardTimestamp;
              }, 5000);
              
              // 尝试使用 ClipboardItem API 作为额外方案（现代浏览器支持）
              setTimeout(() => {
                if (event.clipboardData) {
                  try {
                    // 使用 ClipboardItem API（现代浏览器支持）
                    if (navigator.clipboard && navigator.clipboard.write) {
                      const clipboardItem = new ClipboardItem({
                        'text/plain': new Blob([selectedText], { type: 'text/plain' }),
                        'application/x-binder-source': new Blob([sourceJson], { type: 'application/json' }),
                      });
                      
                      navigator.clipboard.write([clipboardItem]).catch((err) => {
                        console.warn('⚠️ 使用 ClipboardItem API 写入失败，已使用全局变量方案:', err);
                      });
                    }
                    
                    // 同时尝试使用 dataTransfer（虽然可能无法跨事件读取，但可以尝试）
                    fallbackCopy(event, selectedText, sourceJson);
                  } catch (error) {
                    console.error('❌ 添加引用元数据到剪贴板失败:', error);
                    // 全局变量已设置，不影响功能
                  }
                }
              }, 0);

              // 不阻止默认复制行为（文字仍然会被复制）
              return false;
            },
          },
        },
      }),
    ];
  },
});

/**
 * 备用方案：使用 dataTransfer 写入剪贴板数据
 * 注意：这种方法只在复制事件的同一事件循环中有效
 */
function fallbackCopy(event: ClipboardEvent, text: string, sourceJson: string) {
  // 全局变量是主要方案，无论 dataTransfer 是否成功都要设置
  (window as any).__binderClipboardSource = sourceJson;
  (window as any).__binderClipboardTimestamp = Date.now();
  console.log('✅ 设置全局变量存储引用元数据');
  
  // 5 秒后清除全局变量
  setTimeout(() => {
    const currentSource = (window as any).__binderClipboardSource;
    if (currentSource === sourceJson) {
      delete (window as any).__binderClipboardSource;
      delete (window as any).__binderClipboardTimestamp;
      console.log('🗑️ 清除过期的全局变量');
    }
  }, 5000);
  
  if (event.clipboardData) {
    event.clipboardData.setData('text/plain', text);
    // 尝试设置自定义数据类型（可能不被所有浏览器支持）
    try {
      event.clipboardData.setData('application/x-binder-source', sourceJson);
      console.log('✅ 同时使用 dataTransfer 写入引用元数据');
    } catch (error) {
      console.warn('⚠️ dataTransfer 不支持自定义类型，已使用全局变量', error);
    }
  }
}
