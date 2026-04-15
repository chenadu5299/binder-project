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

              if (from === to) {
                return false;
              }

              const selectedText = state.doc.textBetween(from, to, '\n');
              const sourceData = buildSourceData(view, from, to, { tabId, getFilePath, getFileName });
              if (!sourceData) return false;

              const sourceJson = JSON.stringify(sourceData);

              console.log('📋 复制文字并添加引用元数据:', {
                filePath: sourceData.filePath,
                selectedTextLength: selectedText.length,
                lineRange: sourceData.lineRange,
              });

              // 主要方案：全局变量（跨 copy→paste 事件有效）
              (window as any).__binderClipboardSource = sourceJson;
              (window as any).__binderClipboardTimestamp = Date.now();

              setTimeout(() => {
                delete (window as any).__binderClipboardSource;
                delete (window as any).__binderClipboardTimestamp;
              }, 5000);

              // 额外方案：ClipboardItem API
              setTimeout(() => {
                if (event.clipboardData) {
                  try {
                    if (navigator.clipboard && navigator.clipboard.write) {
                      const clipboardItem = new ClipboardItem({
                        'text/plain': new Blob([selectedText], { type: 'text/plain' }),
                        'application/x-binder-source': new Blob([sourceJson], { type: 'application/json' }),
                      });
                      navigator.clipboard.write([clipboardItem]).catch((err) => {
                        console.warn('⚠️ ClipboardItem API 写入失败，已使用全局变量方案:', err);
                      });
                    }
                    fallbackCopy(event, selectedText, sourceJson);
                  } catch (error) {
                    console.error('❌ 添加引用元数据到剪贴板失败:', error);
                  }
                }
              }, 0);

              return false;
            },

            dragstart: (view: EditorView, event: DragEvent) => {
              const { state } = view;
              const { selection } = state;
              const { from, to } = selection;

              if (from === to || !event.dataTransfer) {
                return false;
              }

              const selectedText = state.doc.textBetween(from, to, '\n');
              const sourceData = buildSourceData(view, from, to, { tabId, getFilePath, getFileName });
              if (!sourceData) return false;

              const sourceJson = JSON.stringify(sourceData);

              // dragstart → drop 之间 dataTransfer 数据可靠传递，优先使用
              event.dataTransfer.setData('application/x-binder-source', sourceJson);
              event.dataTransfer.setData('text/plain', selectedText);

              // 全局变量作为备用（应对某些 WebView 限制）
              (window as any).__binderDragSource = sourceJson;
              (window as any).__binderDragTimestamp = Date.now();

              setTimeout(() => {
                delete (window as any).__binderDragSource;
                delete (window as any).__binderDragTimestamp;
              }, 10000);

              console.log('🖱️ 拖拽文字并写入引用元数据:', {
                filePath: sourceData.filePath,
                selectedTextLength: selectedText.length,
              });

              return false;
            },
          },
        },
      }),
    ];
  },
});

/**
 * 从当前选区构建引用元数据，供 copy 和 dragstart 共用
 */
function buildSourceData(
  view: EditorView,
  from: number,
  to: number,
  opts: { tabId?: string; getFilePath?: () => string | null; getFileName?: () => string | null },
) {
  let filePath: string | null = null;
  let fileName: string | null = null;

  if (opts.getFilePath) filePath = opts.getFilePath();
  if (opts.getFileName) fileName = opts.getFileName();

  if (!filePath && opts.tabId) {
    try {
      const store = useEditorStore.getState();
      const tab = store.tabs.find((t: any) => t.id === opts.tabId);
      if (tab) {
        filePath = tab.filePath || null;
        fileName = tab.fileName || null;
      }
    } catch {
      // store 不可用时忽略
    }
  }

  if (!filePath) return null;

  const doc = view.state.doc;
  const anchor = createAnchorFromSelection(doc, from, to);

  let startLine = 1;
  let endLine = 1;
  let currentPos = 0;
  for (let i = 0; i < doc.content.childCount; i++) {
    const child = doc.content.child(i);
    const childSize = child.nodeSize;
    if (currentPos <= from && from < currentPos + childSize) startLine = i + 1;
    if (currentPos <= to && to <= currentPos + childSize) { endLine = i + 1; break; }
    currentPos += childSize;
  }

  return {
    filePath,
    fileName,
    lineRange: { start: startLine, end: endLine },
    charRange: { start: from, end: to },
    ...(anchor && {
      blockId: anchor.startBlockId,
      startBlockId: anchor.startBlockId,
      endBlockId: anchor.endBlockId,
      startOffset: anchor.startOffset,
      endOffset: anchor.endOffset,
    }),
  };
}

/** 备用方案：在 ClipboardEvent 的同步帧内写入 dataTransfer */
function fallbackCopy(event: ClipboardEvent, text: string, sourceJson: string) {
  if (event.clipboardData) {
    event.clipboardData.setData('text/plain', text);
    try {
      event.clipboardData.setData('application/x-binder-source', sourceJson);
    } catch {
      // 某些 WebView 不支持自定义 MIME，全局变量已兜底
    }
  }
}
