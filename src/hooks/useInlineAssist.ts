import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Editor } from '@tiptap/react';

export interface DiffResult {
    original: string;
    modified: string;
    additions: string[];
    deletions: string[];
}

export interface InlineAssistState {
    isVisible: boolean;
    instruction: string;
    selectedText: string;
    diff: DiffResult | null;
    isLoading: boolean;
    error: string | null;
}

export function useInlineAssist(editor: Editor | null) {
    const [state, setState] = useState<InlineAssistState>({
        isVisible: false,
        instruction: '',
        selectedText: '',
        diff: null,
        isLoading: false,
        error: null,
    });
    
    // 打开 Inline Assist
    const open = useCallback((instruction: string, selectedText: string) => {
        console.log('🔧 Inline Assist 打开:', { 
            instruction, 
            selectedText: selectedText.substring(0, 50),
            hasEditor: !!editor 
        });
        setState({
            isVisible: true,
            instruction,
            selectedText,
            diff: null,
            isLoading: false,
            error: null,
        });
    }, [editor]);
    
    // 关闭 Inline Assist
    const close = useCallback(() => {
        setState({
            isVisible: false,
            instruction: '',
            selectedText: '',
            diff: null,
            isLoading: false,
            error: null,
        });
    }, []);
    
    // 执行 Inline Assist
    const execute = useCallback(async () => {
        if (!editor || !state.selectedText || !state.instruction) {
            console.warn('⚠️ Inline Assist 执行条件不满足:', { 
                hasEditor: !!editor, 
                hasSelectedText: !!state.selectedText, 
                hasInstruction: !!state.instruction 
            });
            return;
        }
        
        console.log('🚀 开始执行 Inline Assist:', {
            instruction: state.instruction,
            selectedText: state.selectedText.substring(0, 50),
        });
        
        setState(prev => ({ ...prev, isLoading: true, error: null }));
        
        try {
            // 获取上下文（选中文本前后的内容）
            const { from, to } = editor.state.selection;
            const contextBefore = editor.state.doc.textBetween(
                Math.max(0, from - 500),
                from
            );
            const contextAfter = editor.state.doc.textBetween(
                to,
                Math.min(editor.state.doc.content.size, to + 500)
            );
            const context = contextBefore + '\n[选中文本]\n' + contextAfter;
            
            console.log('📤 调用后端 ai_inline_assist:', {
                instruction: state.instruction,
                textLength: state.selectedText.length,
                contextLength: context.length,
            });
            
            // 调用后端
            const result = await invoke<string>('ai_inline_assist', {
                instruction: state.instruction,
                text: state.selectedText,
                context,
            });
            
            console.log('✅ Inline Assist 执行成功，结果长度:', result.length);
            
            // 计算 Diff
            const diff: DiffResult = {
                original: state.selectedText,
                modified: result,
                additions: [],
                deletions: [],
            };
            
            // 简单的 Diff 计算（可以后续优化）
            if (result !== state.selectedText) {
                diff.additions.push(result);
                if (result.length < state.selectedText.length) {
                    diff.deletions.push(state.selectedText.substring(result.length));
                }
            }
            
            setState(prev => ({
                ...prev,
                diff,
                isLoading: false,
            }));
        } catch (error: any) {
            console.error('❌ Inline Assist 执行失败:', error);
            const errorMessage = error?.message || error?.toString() || 'Inline Assist 执行失败';
            setState(prev => ({
                ...prev,
                error: errorMessage,
                isLoading: false,
            }));
        }
    }, [editor, state.instruction, state.selectedText]);
    
    // 接受修改
    const accept = useCallback(() => {
        if (!editor || !state.diff) return;
        
        const { from, to } = editor.state.selection;
        
        editor.chain()
            .focus()
            .deleteRange({ from, to })
            .insertContent(state.diff.modified)
            .run();
        
        close();
    }, [editor, state.diff, close]);
    
    // 拒绝修改
    const reject = useCallback(() => {
        close();
    }, [close]);
    
    return {
        state,
        open,
        close,
        execute,
        accept,
        reject,
    };
}

