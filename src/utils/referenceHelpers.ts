// 引用创建辅助函数

import { TextReference, TableReference, ReferenceType } from '../types/reference';

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

/**
 * 解析引用格式字符串（备用方案）
 * 格式：
 * - DOCX: @文件名.docx!第1页
 * - Excel: @文件名.xlsx!Sheet1!A1 或 @文件名.xlsx!A1
 * - CSV: @文件名.csv!A1
 * - 演示文稿: @文件名.pptx!幻灯片1
 */
export function parseReferenceFormatString(refString: string): {
    type: 'text' | 'table';
    filePath?: string;
    fileName?: string;
    location?: string;
    sheetName?: string;
    cellRef?: string;
} | null {
    // 匹配格式：@文件名!位置 或 @文件名!Sheet!位置
    const match = refString.match(/^@([^!]+)!(.+)$/);
    if (!match) {
        return null;
    }
    
    const fileName = match[1];
    const location = match[2];
    
    // 判断文件类型
    const ext = fileName.split('.').pop()?.toLowerCase();
    const isTable = ext === 'xlsx' || ext === 'xls' || ext === 'csv' || ext === 'ods';
    
    if (isTable) {
        // 表格引用：可能是 @文件名.xlsx!Sheet1!A1 或 @文件名.xlsx!A1
        const parts = location.split('!');
        if (parts.length === 2) {
            // @文件名.xlsx!Sheet1!A1
            return {
                type: 'table',
                fileName,
                sheetName: parts[0],
                cellRef: parts[1],
            };
        } else {
            // @文件名.xlsx!A1 或 @文件名.csv!A1
            return {
                type: 'table',
                fileName,
                cellRef: location,
            };
        }
    } else {
        // 文本引用：@文件名.docx!第1页 或 @文件名.pptx!幻灯片1
        return {
            type: 'text',
            fileName,
            location,
        };
    }
}

