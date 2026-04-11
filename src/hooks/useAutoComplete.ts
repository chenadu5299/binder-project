/**
 * 辅助续写 Hook：Cmd+J 触发，调用 ai_autocomplete，返回建议列表供 AutoCompletePopover 展示
 *
 * 边界说明：
 * - 这是层次一独立链路
 * - Phase 1 起继续共用后端命令层，但不得反向污染 L3 Agent 主链状态/PromptPackage
 */
import { useState, useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { Editor } from '@tiptap/react';

const CONTEXT_BEFORE_LEN = 600;
const CONTEXT_AFTER_LEN = 400;
const MAX_LENGTH = 80;

export interface AutoCompleteState {
  suggestions: string[];
  selectedIndex: number;
  position: number | null;
  isVisible: boolean;
  isLoading: boolean;
  error: string | null;
}

export function useAutoComplete(
  editor: Editor | null,
  options?: {
    documentPath?: string | null;
    workspacePath?: string | null;
    minContextLength?: number;
    maxLength?: number;
  }
) {
  const [state, setState] = useState<AutoCompleteState>({
    suggestions: [],
    selectedIndex: 0,
    position: null,
    isVisible: false,
    isLoading: false,
    error: null,
  });

  const clear = useCallback(() => {
    setState({
      suggestions: [],
      selectedIndex: 0,
      position: null,
      isVisible: false,
      isLoading: false,
      error: null,
    });
  }, []);

  const selectIndex = useCallback((index: number) => {
    setState((prev) => ({
      ...prev,
      selectedIndex: Math.max(0, Math.min(index, prev.suggestions.length - 1)),
    }));
  }, []);

  const trigger = useCallback(async () => {
    if (!editor || editor.isDestroyed) return;

    const { from } = editor.state.selection;
    const doc = editor.state.doc;
    const fullText = doc.textContent;
    const textBefore = fullText.slice(0, from);
    const textAfter = fullText.slice(from);

    const context_before = textBefore.length > CONTEXT_BEFORE_LEN
      ? textBefore.slice(-CONTEXT_BEFORE_LEN)
      : textBefore;
    const context_after = textAfter.length > CONTEXT_AFTER_LEN
      ? textAfter.slice(0, CONTEXT_AFTER_LEN)
      : textAfter || undefined;

    const minContext = options?.minContextLength ?? 50;
    if (context_before.length < minContext) {
      setState((prev) => ({ ...prev, error: '上下文不足，请至少输入 50 字符后再试', isVisible: false, isLoading: false }));
      return;
    }

    setState((prev) => ({
      ...prev,
      isLoading: true,
      isVisible: false,
      error: null,
      position: from,
    }));

    try {
      const result = await invoke<string[] | null>('ai_autocomplete', {
        contextBefore: context_before,
        contextAfter: context_after || null,
        position: from,
        maxLength: options?.maxLength ?? MAX_LENGTH,
        editorState: null,
        memoryItems: null,
        documentFormat: options?.documentPath ? getDocumentFormat(options.documentPath) : null,
        documentOverview: null,
      });

      const suggestions = Array.isArray(result) ? result.slice(0, 3) : [];

      if (suggestions.length === 0) {
        setState((prev) => ({
          ...prev,
          suggestions: [],
          selectedIndex: 0,
          isLoading: false,
          isVisible: false,
          error: '未获取到续写建议',
        }));
        return;
      }

      setState((prev) => ({
        ...prev,
        suggestions: suggestions.slice(0, 3),
        selectedIndex: 0,
        position: from,
        isVisible: true,
        isLoading: false,
        error: null,
      }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setState((prev) => ({
        ...prev,
        suggestions: [],
        isLoading: false,
        isVisible: false,
        error: msg,
      }));
    }
  }, [editor, options?.minContextLength, options?.maxLength, options?.documentPath]);

  const apply = useCallback(
    (index?: number) => {
      if (!editor || editor.isDestroyed) return;
      const idx = index ?? state.selectedIndex;
      const text = state.suggestions[idx];
      if (!text || state.position == null) return;

      editor
        .chain()
        .focus()
        .insertContentAt(state.position, text)
        .run();
      clear();
    },
    [editor, state.suggestions, state.selectedIndex, state.position, clear]
  );

  // 关闭逻辑：文档变化、选区变化、失焦时清除
  useEffect(() => {
    if (!editor || !state.isVisible) return;

    const onUpdate = () => clear();
    const onSelectionUpdate = () => clear();
    const onBlur = () => {
      // 失焦时稍延迟关闭，避免点击悬浮卡时先触发
      setTimeout(clear, 100);
    };

    editor.on('update', onUpdate);
    editor.on('selectionUpdate', onSelectionUpdate);
    editor.on('blur', onBlur);
    return () => {
      editor.off('update', onUpdate);
      editor.off('selectionUpdate', onSelectionUpdate);
      editor.off('blur', onBlur);
    };
  }, [editor, state.isVisible, clear]);

  return {
    state,
    trigger,
    clear,
    selectIndex,
    apply,
  };
}

function getDocumentFormat(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();
  if (ext === 'docx' || ext === 'doc') return 'docx';
  if (ext === 'md') return 'md';
  if (ext === 'html' || ext === 'htm') return 'html';
  return 'txt';
}
