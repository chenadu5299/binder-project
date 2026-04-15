// 引用创建辅助函数

import { TextReference, ReferenceType, TextReferenceAnchor } from '../types/reference';

/**
 * 创建完整的 TextReference
 * 依据：A-DE-M-D-01 §5.8 第4条——行级引用可携带可选四元组
 */
export function createTextReference(params: {
    content: string;
    sourceFile: string;
    lineRange?: { start: number; end: number };
    charRange?: { start: number; end: number };
    fileName?: string;
    preview?: string;
    textReference?: TextReferenceAnchor;
}): Omit<TextReference, 'id' | 'createdAt'> {
    const fileName = params.fileName || params.sourceFile.split('/').pop() || params.sourceFile.split('\\').pop() || '未命名文件';
    const preview = params.preview || params.content.substring(0, 100) + (params.content.length > 100 ? '...' : '');
    const displayText = params.lineRange
        ? `${fileName} (行 ${params.lineRange.start}-${params.lineRange.end})`
        : fileName;

    const base: Omit<TextReference, 'id' | 'createdAt'> = {
        type: ReferenceType.TEXT,
        content: params.content,
        sourceFile: params.sourceFile,
        fileName,
        ...(params.lineRange && { lineRange: params.lineRange }),
        ...(params.charRange && { charRange: params.charRange }),
        preview,
        displayText,
    };

    if (params.textReference) {
        return {
            ...base,
            textReference: params.textReference,
            startBlockId: params.textReference.startBlockId,
            endBlockId: params.textReference.endBlockId,
        };
    }

    return base;
}

/**
 * 从编辑器复制的数据创建 TextReference
 * 支持 blockId、startOffset、endOffset（精确定位系统）
 */
export function createTextReferenceFromClipboard(source: {
    filePath: string;
    fileName?: string;
    lineRange?: { start: number; end: number };
    charRange?: { start: number; end: number };
    startBlockId?: string;
    endBlockId?: string;
    blockId?: string;
    startOffset?: number;
    endOffset?: number;
}, text: string): Omit<TextReference, 'id' | 'createdAt'> {
    const base = createTextReference({
        content: text,
        sourceFile: source.filePath,
        fileName: source.fileName,
        lineRange: source.lineRange,
        charRange: source.charRange,
    });
    const startBlockId = source.startBlockId ?? source.blockId;
    const endBlockId = source.endBlockId ?? source.blockId ?? source.startBlockId;
    const startOffset = source.startOffset ?? 0;
    const endOffset = source.endOffset ?? 0;

    const textReference: TextReferenceAnchor | undefined =
        startBlockId && endBlockId
            ? {
                  startBlockId,
                  startOffset,
                  endBlockId,
                  endOffset,
              }
            : undefined;

    return {
        ...base,
        ...(textReference != null && {
            textReference,
            startBlockId: textReference.startBlockId,
            endBlockId: textReference.endBlockId,
            // 兼容旧字段：仍保留 blockId/startOffset/endOffset，供旧链路读取
            blockId: textReference.startBlockId,
            startOffset: textReference.startOffset,
            endOffset: textReference.endOffset,
        }),
    };
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
