// 引用类型定义

// 引用类型枚举
export enum ReferenceType {
    TEXT = 'text',           // 文本引用
    FILE = 'file',           // 文件引用
    FOLDER = 'folder',       // 文件夹引用
    IMAGE = 'image',         // 图片引用
    TABLE = 'table',         // 表格引用
    MEMORY = 'memory',       // 记忆库引用
    LINK = 'link',           // 链接引用
    KNOWLEDGE_BASE = 'kb',   // 知识库引用（后续）
    CHAT = 'chat',           // 聊天记录引用
}

// 引用基础接口
export interface BaseReference {
    id: string;
    type: ReferenceType;
    createdAt: number;
}

// 文本引用
export interface TextReference extends BaseReference {
    type: ReferenceType.TEXT;
    content: string;           // 引用的完整文本内容（用于 AI）
    preview?: string;          // 预览文本（前 100 字符，用于显示）
    sourceFile: string;        // 来源文件路径（必需）
    fileName: string;          // 文件名（用于显示）
    lineRange: {               // 行号范围（必需）
        start: number;
        end: number;
    };
    charRange: {               // 字符范围（必需）
        start: number;
        end: number;
    };
    displayText: string;       // 显示文本：如 "main.ts (行 10-15)"
}

// 文件引用
export interface FileReference extends BaseReference {
    type: ReferenceType.FILE;
    path: string;              // 文件路径
    name: string;              // 文件名
    size?: number;             // 文件大小
    mimeType?: string;         // MIME 类型
    content?: string;          // 文件内容（可选，大文件不加载）
    lineCount?: number;        // 行数（文本文件）
}

// 图片引用
export interface ImageReference extends BaseReference {
    type: ReferenceType.IMAGE;
    path: string;              // 图片路径（相对路径，如 assets/xxx.png）
    name: string;              // 文件名
    size?: number;             // 文件大小
    width?: number;            // 图片宽度
    height?: number;           // 图片高度
    thumbnail?: string;        // 缩略图 base64 或路径
    mimeType?: string;         // MIME 类型
}

// 记忆库引用
export interface MemoryReference extends BaseReference {
    type: ReferenceType.MEMORY;
    memoryId: string;          // 记忆库 ID
    name: string;              // 记忆库名称
    itemCount?: number;        // 记忆项数量
    items?: any[];             // 记忆项列表（可选）
}

// 链接引用
export interface LinkReference extends BaseReference {
    type: ReferenceType.LINK;
    url: string;               // URL
    title?: string;            // 链接标题
    description?: string;      // 链接描述
    preview?: string;          // 链接预览内容
}

// 文件夹引用（新增）
export interface FolderReference extends BaseReference {
    type: ReferenceType.FOLDER;
    path: string;              // 文件夹路径
    name: string;              // 文件夹名称
    fileCount?: number;        // 包含的文件数量
    size?: number;             // 总大小
}

// 表格引用（新增）
export interface TableReference extends BaseReference {
    type: ReferenceType.TABLE;
    sourceFile: string;        // 来源文件
    fileName: string;          // 文件名
    tableData?: any[][];       // 表格数据（二维数组）
    rowRange?: {               // 行范围
        start: number;
        end: number;
    };
    columnRange?: {            // 列范围
        start: number;
        end: number;
    };
}

// 聊天记录引用（新增）
export interface ChatReference extends BaseReference {
    type: ReferenceType.CHAT;
    chatTabId: string;         // 聊天标签页 ID
    chatTabTitle: string;      // 聊天标签页标题
    messageIds: string[];      // 引用的消息 ID 列表
    messageRange?: {           // 消息范围（可选）
        start: number;
        end: number;
    };
}

// 知识库引用（扩展）
export interface KnowledgeBaseReference extends BaseReference {
    type: ReferenceType.KNOWLEDGE_BASE;
    kbId: string;              // 知识库 ID
    kbName: string;            // 知识库名称
    query?: string;            // 查询关键词（可选）
    itemCount?: number;        // 匹配项数量
}

// 联合类型
export type Reference = 
    | TextReference 
    | FileReference 
    | FolderReference
    | ImageReference 
    | TableReference
    | MemoryReference 
    | LinkReference
    | ChatReference
    | KnowledgeBaseReference;

