import { useState, useEffect, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Editor } from '@tiptap/react';

export interface AutoCompleteState {
    text: string | null;
    position: number | null;
    isVisible: boolean;
}

export function useAutoComplete(editor: Editor | null) {
    const [state, setState] = useState<AutoCompleteState>({
        text: null,
        position: null,
        isVisible: false,
    });
    
    const triggerTimerRef = useRef<NodeJS.Timeout | null>(null);
    const cancelTokenRef = useRef<string | null>(null);
    const lastContextRef = useRef<string>('');
    const lastPositionRef = useRef<number>(-1);
    
    // 清除自动补全
    const clear = useCallback(() => {
        setState({
            text: null,
            position: null,
            isVisible: false,
        });
        if (triggerTimerRef.current) {
            clearTimeout(triggerTimerRef.current);
            triggerTimerRef.current = null;
        }
        if (cancelTokenRef.current) {
            // TODO: 取消之前的请求
            cancelTokenRef.current = null;
        }
    }, []);
    
    // 触发自动补全
    const trigger = useCallback(async () => {
        if (!editor) return;
        
        const { from } = editor.state.selection;
        const context = editor.state.doc.textBetween(
            Math.max(0, from - 200),
            from
        );
        
        // 检查上下文或位置是否变化
        if (context === lastContextRef.current && from === lastPositionRef.current) {
            return; // 上下文和位置未变化，不触发
        }
        
        lastContextRef.current = context;
        lastPositionRef.current = from;
        
        // 检查是否有足够的上下文（至少 50 字符）
        if (context.length < 50) {
            return;
        }
        
        try {
            const result = await invoke<string | null>('ai_autocomplete', {
                context,
                position: from,
                maxLength: 50,
            });
            
            if (result) {
                setState({
                    text: result,
                    position: from,
                    isVisible: true,
                });
            }
        } catch (error) {
            console.error('自动补全失败:', error);
            clear();
        }
    }, [editor, clear]);
    
    // 接受补全
    const accept = useCallback(() => {
        if (!editor || !state.text || state.position === null) return;
        
        editor.chain()
            .focus()
            .insertContent(state.text)
            .run();
        
        clear();
    }, [editor, state, clear]);
    
    // 监听光标位置变化
    useEffect(() => {
        if (!editor) return;
        
        const handleSelectionUpdate = () => {
            // 清除之前的计时器
            if (triggerTimerRef.current) {
                clearTimeout(triggerTimerRef.current);
            }
            clear(); // 清除之前的补全
            
            // 开始新的计时（7秒后触发）
            triggerTimerRef.current = setTimeout(() => {
                trigger();
            }, 7000); // 默认 7 秒，可配置
        };
        
        // 监听选择变化
        editor.on('selectionUpdate', handleSelectionUpdate);
        
        // 监听输入
        editor.on('update', () => {
            clear(); // 用户输入时清除补全
        });
        
        return () => {
            editor.off('selectionUpdate', handleSelectionUpdate);
            editor.off('update');
            if (triggerTimerRef.current) {
                clearTimeout(triggerTimerRef.current);
            }
        };
    }, [editor, trigger, clear]);
    
    // 处理键盘事件
    useEffect(() => {
        if (!editor || !state.isVisible) return;
        
        // ⚠️ 关键修复：addEventListener 的事件处理器签名是 (event: Event)
        const handleKeyDown = (event: Event) => {
            const keyboardEvent = event as KeyboardEvent;
            
            // 检查 event 和 key 是否存在
            if (!keyboardEvent || !keyboardEvent.key) {
                return;
            }
            
            if (keyboardEvent.key === 'Tab') {
                keyboardEvent.preventDefault();
                keyboardEvent.stopPropagation();
                accept();
            } else if (keyboardEvent.key === 'Escape') {
                keyboardEvent.preventDefault();
                keyboardEvent.stopPropagation();
                clear();
            }
        };
        
        const editorDom = editor.view.dom;
        editorDom.addEventListener('keydown', handleKeyDown);
        
        return () => {
            editorDom.removeEventListener('keydown', handleKeyDown);
        };
    }, [editor, state.isVisible, accept, clear]);
    
    return {
        state,
        trigger,
        clear,
        accept,
    };
}

