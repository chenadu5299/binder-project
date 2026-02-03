// 内容块构建工具函数

import { MessageContentBlock, ToolCall, AuthorizationRequest } from '../types/tool';
import { needsAuthorization } from './toolDescription';

/**
 * 构建内容块列表
 * 将文本块和工具调用按时间顺序合并
 */
export function buildContentBlocks(
    textChunks: Array<{ content: string; timestamp: number }>,
    toolCalls: ToolCall[],
    workspacePath?: string
): MessageContentBlock[] {
    const blocks: MessageContentBlock[] = [];
    
    // 合并所有项目并按时间排序
    const allItems: Array<{
        type: 'text' | 'tool';
        timestamp: number;
        data: any;
    }> = [];
    
    textChunks.forEach((chunk) => {
        allItems.push({
            type: 'text',
            timestamp: chunk.timestamp,
            data: chunk.content,
        });
    });
    
    toolCalls.forEach((tc) => {
        allItems.push({
            type: 'tool',
            timestamp: tc.timestamp || Date.now(),
            data: tc,
        });
    });
    
    // 按时间戳排序
    allItems.sort((a, b) => a.timestamp - b.timestamp);
    
    // 合并连续的文本块
    let currentTextBlock: string[] = [];
    let currentTextTimestamp = 0;
    
    allItems.forEach((item) => {
        if (item.type === 'text') {
            // 如果是文本，累积到当前文本块
            if (currentTextBlock.length === 0) {
                currentTextTimestamp = item.timestamp;
            }
            currentTextBlock.push(item.data);
        } else {
            // 如果是工具调用，先保存累积的文本块
            if (currentTextBlock.length > 0) {
                blocks.push({
                    id: `text-${blocks.length}-${Date.now()}`,
                    type: 'text',
                    timestamp: currentTextTimestamp,
                    content: currentTextBlock.join(''),
                });
                currentTextBlock = [];
            }
            
            // 添加工具调用块
            const toolCall = item.data as ToolCall;
            const needsAuth = needsAuthorization(toolCall.name, toolCall.arguments, workspacePath);
            
            if (needsAuth) {
                // 需要授权的操作
                blocks.push({
                    id: toolCall.id,
                    type: 'authorization',
                    timestamp: item.timestamp,
                    toolCall,
                    authorization: {
                        id: toolCall.id,
                        type: 'file_system', // 可以根据工具类型判断
                        operation: toolCall.name,
                        details: toolCall.arguments,
                    },
                });
            } else {
                // 普通工具调用
                blocks.push({
                    id: toolCall.id,
                    type: 'tool',
                    timestamp: item.timestamp,
                    toolCall,
                });
            }
        }
    });
    
    // 保存最后一个文本块
    if (currentTextBlock.length > 0) {
        blocks.push({
            id: `text-${blocks.length}-${Date.now()}`,
            type: 'text',
            timestamp: currentTextTimestamp,
            content: currentTextBlock.join(''),
        });
    }
    
    return blocks;
}

/**
 * 从消息构建内容块（用于兼容旧格式）
 */
export function buildContentBlocksFromMessage(
    content: string,
    toolCalls: ToolCall[] | undefined,
    workspacePath?: string
): MessageContentBlock[] {
    const textChunks: Array<{ content: string; timestamp: number }> = [];
    
    if (content) {
        // 将内容分割为多个文本块（简化处理，实际可以根据流式接收的时间戳）
        textChunks.push({
            content,
            timestamp: Date.now() - (toolCalls?.length || 0) * 100, // 模拟时间戳
        });
    }
    
    return buildContentBlocks(textChunks, toolCalls || [], workspacePath);
}

