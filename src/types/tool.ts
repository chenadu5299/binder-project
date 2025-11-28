// 工具调用相关类型定义

export interface ToolCall {
    id: string;
    name: string;
    arguments: Record<string, any>;
    status: 'pending' | 'executing' | 'completed' | 'failed';
    result?: ToolResult;
    error?: string;
    timestamp: number;
}

export interface ToolResult {
    success: boolean;
    data?: any;
    error?: string;
    message?: string;
}

export interface ToolDefinition {
    name: string;
    description: string;
    parameters: ToolParameter[];
}

export interface ToolParameter {
    name: string;
    type: 'string' | 'number' | 'boolean' | 'object' | 'array';
    description: string;
    required?: boolean;
}

// 预定义的工具类型
export enum ToolType {
    READ_FILE = 'read_file',
    CREATE_FILE = 'create_file',
    UPDATE_FILE = 'update_file',
    DELETE_FILE = 'delete_file',
    LIST_FILES = 'list_files',
    SEARCH_FILES = 'search_files',
    MOVE_FILE = 'move_file',
    RENAME_FILE = 'rename_file',
    CREATE_FOLDER = 'create_folder',
}

// 工具调用请求
export interface ToolCallRequest {
    toolName: string;
    arguments: Record<string, any>;
}

// 工具调用响应
export interface ToolCallResponse {
    toolCallId: string;
    result: ToolResult;
}

