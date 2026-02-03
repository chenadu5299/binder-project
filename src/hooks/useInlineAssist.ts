import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Editor } from '@tiptap/react';

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

export interface InlineAssistState {
    isVisible: boolean;
    phase: 'input-only' | 'chat';
    instruction: string;
    selectedText: string;
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
        messages: [],
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
        
        setState(prev => {
            // 如果已经打开且处于聊天模式，保持聊天模式，只更新输入框内容和选中文本
            if (prev.isVisible && prev.phase === 'chat') {
                return {
                    ...prev,
                    instruction,
                    selectedText,
                    error: null,
                };
            }
            
            // 否则，重新初始化（首次打开或之前已关闭）
            return {
                isVisible: true,
                phase: 'input-only',
                instruction,
                selectedText,
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
            messages: [],
            isLoading: false,
            error: null,
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
            // 获取上下文（选中文本前后的内容或光标前后内容）
            const { from, to } = editor.state.selection;
            const contextBefore = editor.state.doc.textBetween(
                Math.max(0, from - 500),
                from
            );
            const contextAfter = editor.state.doc.textBetween(
                to,
                Math.min(editor.state.doc.content.size, to + 500)
            );
            // 为后端和模型提供更结构化的上下文信息
            const context = `【上下文（前）】\n${contextBefore}\n\n【选中文本】\n${state.selectedText || ''}\n\n【上下文（后）】\n${contextAfter}`;
            
            console.log('📤 调用后端 ai_inline_assist:', {
                instruction: currentInstruction,
                textLength: state.selectedText.length,
                contextLength: context.length,
            });
            
            // 调用后端（返回 JSON 格式）
            const result = await invoke<string>('ai_inline_assist', {
                instruction: currentInstruction,
                text: state.selectedText,
                context,
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
    }, [editor, state.instruction, state.selectedText]);
    
    // 应用编辑（替换/插入文本）
    const applyEdit = useCallback((messageId: string) => {
        if (!editor) return;
        
        const message = state.messages.find(m => m.id === messageId);
        if (!message || message.kind !== 'edit' || message.applied) return;
        
        const { from, to } = editor.state.selection;
        const currentSelectedText = editor.state.doc.textBetween(from, to);
        
        if (currentSelectedText || from !== to) {
            // 有选中文本，替换选中区域
            editor.chain()
                .focus()
                .deleteRange({ from, to })
                .insertContent(message.text)
                .run();
        } else {
            // 无选中文本，插入到光标位置
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
    }, [editor, state.messages]);
    
    return {
        state,
        open,
        close,
        execute,
        applyEdit,
    };
}

