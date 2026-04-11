import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Editor } from '@tiptap/react';

/**
 * 边界说明：
 * - 这是层次二独立链路
 * - 继续共用 ai_commands.rs，但不得反向承担 L3 Agent 状态、artifact、plan 主链职责
 */
export type InlineAssistMessageRole = 'user' | 'assistant';
export type InlineAssistMessageKind = 'reply' | 'edit';

export interface InlineAssistMessage {
    id: string;
    role: InlineAssistMessageRole;
    kind: InlineAssistMessageKind;
    text: string;
    applied?: boolean;
    createdAt: number;
}

export interface DiffResult {
    original: string;
    modified: string;
}

export interface InlineAssistSelectionRange {
    from: number;
    to: number;
}

export interface InlineAssistState {
    isVisible: boolean;
    phase: 'input-only' | 'chat';
    instruction: string;
    selectedText: string;
    selectionRange: InlineAssistSelectionRange | null; // 选区范围，用于 apply 时替换（激活窗口后可能因 focus 丢失，需存储）
    messages: InlineAssistMessage[];
    isLoading: boolean;
    error: string | null;
}

export function useInlineAssist(editor: Editor | null) {
    const [state, setState] = useState<InlineAssistState>({
        isVisible: false,
        phase: 'input-only',
        instruction: '',
        selectedText: '',
        selectionRange: null,
        messages: [],
        isLoading: false,
        error: null,
    });
    
    // 打开 Inline Assist（selectionRange 用于 apply 时替换，避免 focus 输入框后选区丢失）
    const open = useCallback((instruction: string, selectedText: string, selectionRange?: { from: number; to: number } | null) => {
        console.log('🔧 Inline Assist 打开:', { 
            instruction, 
            selectedText: selectedText.substring(0, 50),
            selectionRange,
            hasEditor: !!editor 
        });
        
        setState(prev => {
            const range = selectionRange && selectionRange.from !== selectionRange.to ? selectionRange : null;
            if (prev.isVisible && prev.phase === 'chat') {
                return { ...prev, instruction, selectedText, selectionRange: range, error: null };
            }
            return {
                isVisible: true,
                phase: 'input-only',
                instruction,
                selectedText,
                selectionRange: range,
                messages: [],
                isLoading: false,
                error: null,
            };
        });
    }, [editor]);
    
    // 关闭 Inline Assist
    const close = useCallback(() => {
        setState({
            isVisible: false,
            phase: 'input-only',
            instruction: '',
            selectedText: '',
            selectionRange: null,
            messages: [],
            isLoading: false,
            error: null,
        });
    }, []);

    // 弹窗已打开时，实时更新选中内容与范围（用于「先调出窗口再选中」场景）
    const updateSelectedText = useCallback((selectedText: string, selectionRange?: { from: number; to: number } | null) => {
        setState(prev => {
            if (!prev.isVisible) return prev;
            const range = selectionRange && selectionRange.from !== selectionRange.to ? selectionRange : null;
            if (prev.selectedText === selectedText && prev.selectionRange?.from === range?.from) return prev;
            return {
                ...prev,
                selectedText,
                selectionRange: range,
                messages: [],
                phase: 'input-only',
                error: null,
            };
        });
    }, []);
    
    // 执行 Inline Assist
    const execute = useCallback(async () => {
        if (!editor || !state.instruction.trim()) {
            console.warn('⚠️ Inline Assist 执行条件不满足:', { 
                hasEditor: !!editor, 
                hasSelectedText: !!state.selectedText, 
                hasInstruction: !!state.instruction 
            });
            return;
        }
        
        const currentInstruction = state.instruction.trim();
        console.log('🚀 开始执行 Inline Assist:', {
            instruction: currentInstruction,
            selectedTextPreview: state.selectedText.substring(0, 50),
        });
        
        // 添加用户消息
        const userMessage: InlineAssistMessage = {
            id: `user-${Date.now()}`,
            role: 'user',
            kind: 'reply',
            text: currentInstruction,
            createdAt: Date.now(),
        };
        
        setState(prev => ({
            ...prev,
            messages: [...prev.messages, userMessage],
            isLoading: true,
            error: null,
        }));
        
        try {
            // 获取上下文（优先使用存储的 selectionRange，避免 focus 后选区丢失）
            const { from, to } = state.selectionRange || editor.state.selection;
            const contextBefore = editor.state.doc.textBetween(
                Math.max(0, from - 500),
                from
            );
            const contextAfter = editor.state.doc.textBetween(
                to,
                Math.min(editor.state.doc.content.size, to + 500)
            );
            // 为后端和模型提供更结构化的上下文信息
            // Phase 0.3：text 为空时说明「以当前块为操作对象」
            const selectedSection = state.selectedText
                ? `【选中文本】\n${state.selectedText}`
                : '【选中文本】\n（无选区，以当前块为操作对象）';
            const context = `【上下文（前）】\n${contextBefore}\n\n${selectedSection}\n\n【上下文（后）】\n${contextAfter}`;
            
            // Phase 0.4 / 1b：传递 messages 用于多轮对话（包含本次 userMessage，因 setState 异步）
            const messagesForBackend = [...state.messages, userMessage]
                .filter((m) => m.role === 'user' || m.role === 'assistant')
                .map((m) => ({ role: m.role, text: m.text }));

            console.log('📤 调用后端 ai_inline_assist:', {
                instruction: currentInstruction,
                textLength: state.selectedText.length,
                contextLength: context.length,
                messagesCount: messagesForBackend.length,
            });

            // 调用后端（返回 JSON 格式）
            const result = await invoke<string>('ai_inline_assist', {
                instruction: currentInstruction,
                text: state.selectedText,
                context,
                messages: messagesForBackend.length > 0 ? messagesForBackend : undefined,
            });
            
            console.log('✅ Inline Assist 执行成功，原始响应:', result.substring(0, 200));
            
            // 解析 JSON 响应
            let parsedResult: { kind: InlineAssistMessageKind; text: string };
            try {
                // 尝试解析 JSON
                const jsonMatch = result.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    parsedResult = JSON.parse(jsonMatch[0]);
                } else {
                    // 如果不是 JSON，使用启发式判断
                    const isEditInstruction = /改|润色|翻译|改写|优化|修正|调整/i.test(currentInstruction);
                    parsedResult = {
                        kind: (state.selectedText && isEditInstruction) ? 'edit' : 'reply',
                        text: result,
                    };
                }
            } catch (e) {
                // JSON 解析失败，使用启发式判断
                console.warn('⚠️ JSON 解析失败，使用启发式判断:', e);
                const isEditInstruction = /改|润色|翻译|改写|优化|修正|调整/i.test(currentInstruction);
                parsedResult = {
                    kind: (state.selectedText && isEditInstruction) ? 'edit' : 'reply',
                    text: result,
                };
            }
            
            // 添加 AI 回复消息
            const assistantMessage: InlineAssistMessage = {
                id: `assistant-${Date.now()}`,
                role: 'assistant',
                kind: parsedResult.kind,
                text: parsedResult.text,
                applied: false,
                createdAt: Date.now(),
            };
            
            setState(prev => ({
                ...prev,
                messages: [...prev.messages, assistantMessage],
                phase: 'chat', // 切换到聊天模式
                instruction: '', // 清空输入框
                isLoading: false,
            }));
        } catch (error: any) {
            console.error('❌ Inline Assist 执行失败:', error);
            const errorMessage = error?.message || error?.toString() || 'Inline Assist 执行失败';
            
            // 添加错误消息
            const errorMessageObj: InlineAssistMessage = {
                id: `error-${Date.now()}`,
                role: 'assistant',
                kind: 'reply',
                text: `错误: ${errorMessage}`,
                createdAt: Date.now(),
            };
            
            setState(prev => ({
                ...prev,
                messages: [...prev.messages, errorMessageObj],
                phase: 'chat',
                isLoading: false,
                error: errorMessage,
            }));
        }
    }, [editor, state.instruction, state.selectedText, state.selectionRange, state.messages]);
    
    // 应用编辑（替换/插入文本；优先使用存储的 selectionRange，避免 focus 输入框后选区丢失）
    const applyEdit = useCallback((messageId: string) => {
        if (!editor) return;
        
        const message = state.messages.find(m => m.id === messageId);
        if (!message || message.kind !== 'edit' || message.applied) return;
        
        const range = state.selectionRange;
        const from = range ? range.from : editor.state.selection.from;
        const to = range ? range.to : editor.state.selection.to;
        
        if (from !== to) {
            // 有选区，替换选中区域
            editor.chain()
                .focus()
                .setTextSelection({ from, to })
                .deleteRange({ from, to })
                .insertContent(message.text)
                .run();
        } else {
            // 无选区，插入到光标位置
            editor.chain()
                .focus()
                .insertContent(message.text)
                .run();
        }
        
        // 标记为已应用
        setState(prev => ({
            ...prev,
            messages: prev.messages.map(m =>
                m.id === messageId ? { ...m, applied: true } : m
            ),
        }));
        // Phase 1b：应用后关闭弹窗
        close();
    }, [editor, state.messages, state.selectionRange, close]);
    
    return {
        state,
        open,
        close,
        updateSelectedText,
        execute,
        applyEdit,
    };
}
