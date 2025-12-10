// 引用创建辅助函数

import { TextReference, ReferenceType } from '../types/reference';

/**
 * 创建完整的 TextReference
 * 确保包含所有必需字段：displayText, fileName, preview 等
 */
export function createTextReference(params: {
    content: string;
    sourceFile: string;
    lineRange: { start: number; end: number };
    charRange: { start: number; end: number };
    fileName?: string; // 可选，如果没有则从 sourceFile 提取
    preview?: string; // 可选，如果没有则从 content 生成
}): Omit<TextReference, 'id' | 'createdAt'> {
    const fileName = params.fileName || params.sourceFile.split('/').pop() || params.sourceFile.split('\\').pop() || '未命名文件';
    const preview = params.preview || params.content.substring(0, 100) + (params.content.length > 100 ? '...' : '');
    const displayText = `${fileName} (行 ${params.lineRange.start}-${params.lineRange.end})`;
    
    return {
        type: ReferenceType.TEXT,
        content: params.content,
        sourceFile: params.sourceFile,
        fileName,
        lineRange: params.lineRange,
        charRange: params.charRange,
        preview,
        displayText,
    };
}

/**
 * 从编辑器复制的数据创建 TextReference
 */
export function createTextReferenceFromClipboard(source: {
    filePath: string;
    fileName?: string;
    lineRange: { start: number; end: number };
    charRange: { start: number; end: number };
}, text: string): Omit<TextReference, 'id' | 'createdAt'> {
    return createTextReference({
        content: text,
        sourceFile: source.filePath,
        fileName: source.fileName,
        lineRange: source.lineRange,
        charRange: source.charRange,
    });
}

