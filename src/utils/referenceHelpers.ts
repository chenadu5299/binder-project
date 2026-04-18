// 引用创建辅助函数
// 依据：A-CORE-C-D-02 §3.3（TextReference 主定义）/ A-DE-M-D-01 §5.8（精确引用四元组要求）
//
// 引用精度协议（Protocol）：
//   TextReference + textReference 四元组  → 精确引用锚点（precise reference anchor）
//   TextReference（行级，无四元组）        → 阅读上下文（reading context）
//   FileReference                         → 阅读上下文，无位置信息，不承担执行锚点职责
//
// 标签格式标准（A-CORE-C-D-02 §3.3 引用标签）：
//   TextReference：内容摘要主标签，位置仅作弱后缀去重
//   文件级引用：filename

import { TextReference, ReferenceType, TextReferenceAnchor } from '../types/reference';
import { buildContentLabel } from './contentLabel';

/**
 * 创建完整的 TextReference
 * 依据：A-DE-M-D-01 §5.8 第4条——行级引用可携带可选四元组
 *
 * ⚠️ 若调用时能提供 textReference 四元组，必须传入；否则产出"行级精度"对象，
 *    只能作为阅读上下文，不能直接直通执行链。
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

    const snippet = buildContentLabel(params.content || params.preview, fileName);
    const displayText = params.textReference
        ? `${snippet} · @${params.textReference.startOffset}`
        : params.lineRange
            ? params.lineRange.start === params.lineRange.end
                ? `${snippet} · L${params.lineRange.start}`
                : `${snippet} · L${params.lineRange.start}-${params.lineRange.end}`
            : snippet;

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
 * 尝试用 Editor DOM 补齐 TextReference 的精确四元组。
 *
 * 适用场景：TextReference 通过剪贴板或其它路径创建，已有 lineRange，但 textReference
 * 四元组缺失（CopyReferenceExtension 在无 BlockId 时的退化情形）。
 *
 * 若目标文件已在编辑器中打开且 doc 有效，则通过行号计算 ProseMirror 位置并解析出
 * block ID + offset，填入 textReference 字段，使该引用升级为"精确引用锚点"精度。
 *
 * 若文件未打开或计算失败，原样返回（保持"行级精度/阅读上下文"语义，不抛异常）。
 *
 * 依据：A-DE-M-D-01 §5.8.4 / A-AST-M-P-01 §12.1
 *
 * @param ref       已创建但缺少四元组的 TextReference
 * @returns         补齐后的引用（或原对象）
 */
export async function enrichTextReferenceAnchor(
    ref: TextReference,
): Promise<TextReference> {
    // 已有四元组，直接返回
    if (ref.textReference) return ref;
    // 没有行号范围，无法推导 PM 位置
    if (!ref.lineRange || !ref.sourceFile) return ref;

    try {
        // 动态导入，避免循环依赖（referenceHelpers ← editorStore ← 各组件）
        const { useEditorStore } = await import('../stores/editorStore');
        const editorTabs = useEditorStore.getState().tabs;
        const editorTab = editorTabs.find((t: any) => t.filePath === ref.sourceFile);
        if (!editorTab?.editor) return ref;

        const { createAnchorFromLineRange } = await import('./anchorFromSelection');
        const anchor = createAnchorFromLineRange(
            editorTab.editor.state.doc,
            ref.lineRange.start,
            ref.lineRange.end,
        );
        if (!anchor) return ref;

        // 升级为精确引用锚点精度；不直接等于执行级真源
        return {
            ...ref,
            textReference: anchor,
            startBlockId: anchor.startBlockId,
            endBlockId: anchor.endBlockId,
            // 兼容旧字段同步更新
            blockId: anchor.startBlockId,
            startOffset: anchor.startOffset,
            endOffset: anchor.endOffset,
        };
    } catch {
        // 补齐失败时保留原始行级精度，不抛异常
        return ref;
    }
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
