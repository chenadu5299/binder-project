// 工具调用解析工具
import { ToolCall } from '../types/tool';

/**
 * 从 AI 响应文本中解析工具调用
 * 支持多种格式：
 * 1. JSON 格式: {"tool": "read_file", "arguments": {"path": "test.txt"}}
 * 2. 函数调用格式: read_file(path="test.txt")
 * 3. 标记格式: <tool_call name="read_file" path="test.txt" />
 */
export function parseToolCalls(text: string): ToolCall[] {
    const toolCalls: ToolCall[] = [];
    
    // 方法1: 尝试解析 JSON 格式的工具调用
    const jsonPattern = /\{[\s\n]*"tool"[\s\n]*:[\s\n]*"([^"]+)"[\s\n]*,[\s\n]*"arguments"[\s\n]*:[\s\n]*(\{[^}]+\})[\s\n]*\}/g;
    let match;
    while ((match = jsonPattern.exec(text)) !== null) {
        try {
            const toolName = match[1];
            const argumentsStr = match[2];
            const toolArgs = JSON.parse(argumentsStr);
            
            toolCalls.push({
                id: `tool-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                name: toolName,
                arguments: toolArgs,
                status: 'pending',
                timestamp: Date.now(),
            });
        } catch (e) {
            console.warn('解析工具调用 JSON 失败:', e);
        }
    }
    
    // 方法2: 尝试解析函数调用格式
    const functionPattern = /(\w+)\s*\(([^)]*)\)/g;
    const toolNames = ['read_file', 'create_file', 'update_file', 'delete_file', 'list_files', 'search_files'];
    
    while ((match = functionPattern.exec(text)) !== null) {
        const toolName = match[1];
        if (!toolNames.includes(toolName)) continue;
        
        const argsStr = match[2];
        const toolArgs: Record<string, any> = {};
        
        // 解析参数 (key="value" 或 key=value)
        const argPattern = /(\w+)\s*=\s*"([^"]*)"|(\w+)\s*=\s*([^\s,]+)/g;
        let argMatch;
        while ((argMatch = argPattern.exec(argsStr)) !== null) {
            const key = argMatch[1] || argMatch[3];
            const value = argMatch[2] || argMatch[4];
            toolArgs[key] = value;
        }
        
        toolCalls.push({
            id: `tool-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            name: toolName,
            arguments: toolArgs,
            status: 'pending',
            timestamp: Date.now(),
        });
    }
    
    // 方法3: 尝试解析 XML 标记格式
    const xmlPattern = /<tool_call\s+name="([^"]+)"\s+([^>]+)\s*\/>/g;
    while ((match = xmlPattern.exec(text)) !== null) {
        const toolName = match[1];
        const attrsStr = match[2];
        const toolArgs: Record<string, any> = {};
        
        // 解析属性
        const attrPattern = /(\w+)\s*=\s*"([^"]+)"/g;
        let attrMatch;
        while ((attrMatch = attrPattern.exec(attrsStr)) !== null) {
            toolArgs[attrMatch[1]] = attrMatch[2];
        }
        
        toolCalls.push({
            id: `tool-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            name: toolName,
            arguments: toolArgs,
            status: 'pending',
            timestamp: Date.now(),
        });
    }
    
    return toolCalls;
}

/**
 * 从 AI 响应中移除工具调用标记，返回纯文本内容
 */
export function removeToolCalls(text: string): string {
    // 移除 JSON 格式
    let cleaned = text.replace(/\{[\s\n]*"tool"[\s\n]*:[\s\n]*"[^"]+"[\s\n]*,[\s\n]*"arguments"[\s\n]*:[\s\n]*\{[^}]+\}[\s\n]*\}/g, '');
    
    // 移除函数调用格式
    cleaned = cleaned.replace(/(\w+)\s*\([^)]*\)/g, '');
    
    // 移除 XML 标记格式
    cleaned = cleaned.replace(/<tool_call\s+[^>]+\s*\/>/g, '');
    
    return cleaned.trim();
}

