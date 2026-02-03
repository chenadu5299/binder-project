// 工具描述生成工具函数

import { ToolCall } from '../types/tool';

/**
 * 生成工具调用的友好描述
 */
export function generateToolDescription(toolCall: ToolCall): string {
    const { name, arguments: args } = toolCall;
    
    switch (name) {
        case 'list_files':
            return `查看目录: ${args.path || '.'}`;
        case 'create_folder':
            return `创建文件夹: ${args.path || ''}`;
        case 'move_file':
            return `移动文件: ${args.source || ''} → ${args.destination || ''}`;
        case 'read_file':
            return `读取文件: ${args.path || ''}`;
        case 'create_file':
            return `创建文件: ${args.path || ''}`;
        case 'update_file':
            return `更新文件: ${args.path || ''}`;
        case 'delete_file':
            return `删除文件: ${args.path || ''}`;
        case 'rename_file':
            return `重命名: ${args.old_path || ''} → ${args.new_path || ''}`;
        case 'search_files':
            return `搜索文件: ${args.query || ''}`;
        case 'edit_current_editor_document':
            return `编辑当前文档`;
        default:
            return `执行操作: ${name}`;
    }
}

/**
 * 判断工具调用是否需要授权
 */
export function needsAuthorization(toolName: string, args: any, workspacePath?: string): boolean {
    switch (toolName) {
        case 'read_file':
            // 如果路径在工作区外，需要授权
            if (workspacePath && args.path) {
                // 简化判断：如果路径包含 .. 或绝对路径在工作区外，需要授权
                // 实际实现需要更严格的路径验证
                return args.path.includes('..') || args.path.startsWith('~') || args.path.startsWith('/');
            }
            return false;
        case 'write_file':
            // 写入工作区外的文件需要授权
            if (workspacePath && args.path) {
                return args.path.includes('..') || args.path.startsWith('~') || args.path.startsWith('/');
            }
            return false;
        case 'browse_web':
        case 'web_search':
            return true; // 网络访问需要授权
        case 'execute_system_command':
        case 'read_system_info':
            return true; // 系统操作需要授权
        default:
            return false;
    }
}

/**
 * 生成授权请求的描述
 */
export function generateAuthorizationDescription(toolCall: ToolCall): string {
    const { name, arguments: args } = toolCall;
    
    switch (name) {
        case 'read_file':
            return `我需要访问系统文件：${args.path}\n\n这将允许我读取工作区外的文件内容。`;
        case 'write_file':
            return `我需要写入系统文件：${args.path}\n\n这将允许我写入工作区外的文件。`;
        case 'browse_web':
        case 'web_search':
            return `我需要访问网络来${args.purpose || '获取信息'}。\n\n目标网址：${args.url || '网络搜索'}`;
        case 'execute_system_command':
            return `我需要执行系统命令：${args.command}\n\n这将允许我执行系统级别的操作。`;
        case 'read_system_info':
            return `我需要读取系统信息：${args.info_type || '系统配置'}\n\n这将允许我访问系统配置信息。`;
        default:
            return `需要授权执行: ${name}`;
    }
}

