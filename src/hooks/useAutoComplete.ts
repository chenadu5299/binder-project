import { useState, useEffect, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Editor } from '@tiptap/react';

export interface AutoCompleteState {
  text: string | null;
  position: number | null;
  isVisible: boolean;
  isLoading: boolean;
}

interface UseAutoCompleteOptions {
  editor: Editor | null;
  triggerDelay?: number; // 触发延迟，默认 7000ms
  minContextLength?: number; // 最小上下文长度，默认 50
  maxLength?: number; // 最大续写长度，默认 50
  enabled?: boolean; // 是否启用，默认 true
}

export function useAutoComplete({
  editor,
  triggerDelay = 7000,
  minContextLength = 50,
  maxLength = 50,
  enabled = true,
}: UseAutoCompleteOptions) {
  const [state, setState] = useState<AutoCompleteState>({
    text: null,
    position: null,
    isVisible: false,
    isLoading: false,
  });

  const triggerTimerRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastContextRef = useRef<string>('');
  const lastPositionRef = useRef<number>(-1);
  const isUserTypingRef = useRef<boolean>(false);

  // 清除自动补全
  const clear = useCallback(() => {
    console.log('[自动续写] 清除状态');
    
    // 先清除状态
    setState({
      text: null,
      position: null,
      isVisible: false,
      isLoading: false,
    });

    // 清除计时器
    if (triggerTimerRef.current) {
      clearTimeout(triggerTimerRef.current);
      triggerTimerRef.current = null;
    }

    // 取消请求
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    
    // 强制更新插件状态：创建一个空事务来触发插件更新，清除装饰
    if (editor && editor.view) {
      // 使用 setTimeout 确保状态已清除，Extension 的 getGhostText 会返回 null
      setTimeout(() => {
        if (editor && editor.view) {
          const { state, dispatch } = editor.view;
          const tr = state.tr;
          tr.setMeta('ghostTextUpdate', true);
          dispatch(tr);
          console.log('[自动续写] 已分发事务清除装饰');
        }
      }, 0);
    }
  }, [editor]);

  // 触发自动补全
  const trigger = useCallback(async () => {
    console.log('[自动续写] trigger 被调用', { editor: !!editor, enabled });
    if (!editor || !enabled) {
      console.log('[自动续写] 跳过: editor 或 enabled 为 false');
      return;
    }

    const { from, to } = editor.state.selection;
    console.log('[自动续写] 选择位置', { from, to });
    
    // 检查是否有选中文本（如果有，不触发）
    if (from !== to) {
      console.log('[自动续写] 跳过: 有选中文本');
      return;
    }

    // 提取上下文（光标前 200 字符）
    const contextStart = Math.max(0, from - 200);
    const context = editor.state.doc.textBetween(contextStart, from);
    console.log('[自动续写] 上下文提取', { contextLength: context.length, minRequired: minContextLength });

    // 检查上下文长度
    if (context.length < minContextLength) {
      console.log('[自动续写] 跳过: 上下文长度不足', { contextLength: context.length, minRequired: minContextLength });
      return;
    }

    // 检查是否在文档末尾（末尾不续写）
    const docSize = editor.state.doc.content.size;
    if (from >= docSize - 1) {
      console.log('[自动续写] 跳过: 在文档末尾', { from, docSize });
      return;
    }

    // 检查上下文或位置是否变化（去重）
    if (context === lastContextRef.current && from === lastPositionRef.current) {
      console.log('[自动续写] 跳过: 上下文和位置未变化');
      return;
    }

    lastContextRef.current = context;
    lastPositionRef.current = from;
    console.log('[自动续写] 开始请求 AI 续写', { position: from, contextLength: context.length });

    // 设置加载状态
    setState((prev) => ({
      ...prev,
      isLoading: true,
      position: from,
    }));

    // 创建 AbortController 用于取消请求
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      console.log('[自动续写] 调用后端 ai_autocomplete', { contextLength: context.length, position: from, maxLength });
      const result = await invoke<string | null>('ai_autocomplete', {
        context,
        position: from,
        maxLength: maxLength,
      });
      console.log('[自动续写] 收到后端响应', { result: result ? result.substring(0, 50) + '...' : null });

      // 检查请求是否被取消
      if (abortController.signal.aborted) {
        console.log('[自动续写] 请求已被取消');
        return;
      }

      // 检查位置是否仍然有效
      const currentFrom = editor.state.selection.from;
      if (currentFrom !== from) {
        console.log('[自动续写] 光标已移动，不显示', { originalFrom: from, currentFrom });
        return; // 光标已移动，不显示
      }

      if (result && result.trim().length > 0) {
        const trimmedResult = result.trim();
        console.log('[自动续写] 设置幽灵文字', { text: trimmedResult.substring(0, 50) + '...', position: from });
        setState({
          text: trimmedResult,
          position: from,
          isVisible: true,
          isLoading: false,
        });
        
        // 强制更新插件状态：创建一个空事务来触发插件更新
        if (editor && editor.view) {
          const { state, dispatch } = editor.view;
          const tr = state.tr;
          tr.setMeta('ghostTextUpdate', true);
          dispatch(tr);
          console.log('[自动续写] 已触发插件更新');
        }
      } else {
        console.log('[自动续写] 后端返回空结果，清除状态');
        clear();
      }
    } catch (error) {
      // 忽略取消错误
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('[自动续写] 请求被取消');
        return;
      }

      console.error('[自动续写] 自动补全失败:', error);
      clear();
    } finally {
      if (abortControllerRef.current === abortController) {
        abortControllerRef.current = null;
      }
    }
  }, [editor, enabled, minContextLength, maxLength, clear]);

  // 接受补全
  const accept = useCallback(() => {
    if (!editor || !state.text || state.position === null) {
      console.log('[自动续写] accept 被调用但条件不满足', { hasEditor: !!editor, hasText: !!state.text, position: state.position });
      return;
    }

    const { text, position } = state;
    console.log('[自动续写] 接受续写', { text: text.substring(0, 30) + '...', position });

    // 先清除状态（这样 Extension 的 getGhostText 会返回 null）
    setState({
      text: null,
      position: null,
      isVisible: false,
      isLoading: false,
    });

    // 立即清除计时器和请求
    if (triggerTimerRef.current) {
      clearTimeout(triggerTimerRef.current);
      triggerTimerRef.current = null;
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    // 先清除装饰，然后插入内容
    // 使用 Promise 确保装饰清除后再插入内容
    setTimeout(() => {
      if (editor && editor.view) {
        // 第一步：清除装饰
        const { state: viewState, dispatch } = editor.view;
        const clearTr = viewState.tr;
        clearTr.setMeta('ghostTextUpdate', true);
        dispatch(clearTr);
        console.log('[自动续写] 已清除装饰');
        
        // 第二步：等待装饰清除后，插入内容
        setTimeout(() => {
          if (editor) {
            // 插入内容（这会触发文档变化和自动保存等逻辑）
            editor
              .chain()
              .focus()
              .insertContentAt(position, text)
              .run();
            console.log('[自动续写] 内容已插入', { position, textLength: text.length });
          }
        }, 50); // 延迟确保装饰已清除并重新渲染
      }
    }, 0);
  }, [editor, state]);

  // 监听编辑器事件
  useEffect(() => {
    console.log('[自动续写] 初始化事件监听', { editor: !!editor, enabled, triggerDelay });
    if (!editor || !enabled) {
      console.log('[自动续写] 跳过初始化: editor 或 enabled 为 false');
      return;
    }

    // 处理选择更新（光标移动）
    const handleSelectionUpdate = () => {
      console.log('[自动续写] 选择更新事件');
      clear(); // 清除之前的补全
      isUserTypingRef.current = false;

      // 清除之前的计时器
      if (triggerTimerRef.current) {
        clearTimeout(triggerTimerRef.current);
      }

      // 开始新的计时
      triggerTimerRef.current = setTimeout(() => {
        console.log('[自动续写] 定时器触发（选择更新后）');
        trigger();
      }, triggerDelay);
    };

    // 处理内容更新（用户输入）
    const handleUpdate = () => {
      console.log('[自动续写] 内容更新事件');
      isUserTypingRef.current = true;
      clear(); // 用户输入时清除补全

      // 清除之前的计时器，重新开始
      if (triggerTimerRef.current) {
        clearTimeout(triggerTimerRef.current);
      }

      triggerTimerRef.current = setTimeout(() => {
        console.log('[自动续写] 定时器触发（内容更新后）');
        trigger();
      }, triggerDelay);
    };

    // 注册事件监听
    editor.on('selectionUpdate', handleSelectionUpdate);
    editor.on('update', handleUpdate);
    console.log('[自动续写] 事件监听已注册');

    // 初始触发
    console.log('[自动续写] 设置初始定时器', { delay: triggerDelay });
    triggerTimerRef.current = setTimeout(() => {
      console.log('[自动续写] 初始定时器触发');
      trigger();
    }, triggerDelay);

    return () => {
      console.log('[自动续写] 清理事件监听');
      editor.off('selectionUpdate', handleSelectionUpdate);
      editor.off('update', handleUpdate);
      clear();
    };
  }, [editor, enabled, triggerDelay, trigger, clear]);

  // 处理键盘事件（Tab 接受，Escape 拒绝）
  useEffect(() => {
    if (!editor || !state.isVisible) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      // 仅在编辑器聚焦且幽灵文字可见时处理
      if (!editor.isFocused || !state.isVisible) return;

      // 使用 Tab 键接受续写（最常用且未被系统占用）
      if (event.key === 'Tab' && !event.shiftKey) {
        event.preventDefault();
        event.stopPropagation();
        console.log('[自动续写] 快捷键触发：Tab 接受续写');
        accept();
        return;
      }

      // Escape 键拒绝续写
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        console.log('[自动续写] 快捷键触发：拒绝续写');
        clear();
      }
    };

    // 使用 capture 阶段，确保优先处理
    document.addEventListener('keydown', handleKeyDown, true);

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [editor, state.isVisible, accept, clear]);

  // 暴露 getGhostText 函数供 Extension 使用
  const getGhostText = useCallback(() => {
    if (!state.isVisible || !state.text || state.position === null) {
      return null;
    }
    return {
      text: state.text,
      position: state.position,
    };
  }, [state]);

  return {
    state,
    trigger,
    clear,
    accept,
    getGhostText, // 供 Extension 使用
  };
}
