/**
 * contentEditable 光标与文本工具
 * 用于 @ 检测、下拉定位等
 */

/**
 * 获取 contentEditable 中光标前的文本（用于 @ 匹配）
 */
export function getTextBeforeCaret(editor: HTMLElement): string {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return '';
    
    const range = selection.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer)) return '';
    
    try {
        const preCaretRange = document.createRange();
        preCaretRange.selectNodeContents(editor);
        preCaretRange.setEnd(range.startContainer, range.startOffset);
        return preCaretRange.toString();
    } catch {
        return '';
    }
}

/**
 * 从光标位置向前删除 n 个字符（用于替换 @query 为引用标签）
 */
export function deleteCharsBeforeCaret(editor: HTMLElement, charCount: number): boolean {
    if (charCount <= 0) return true;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return false;
    const cursorRange = selection.getRangeAt(0);
    if (!editor.contains(cursorRange.commonAncestorContainer)) return false;

    try {
        const preRange = document.createRange();
        preRange.selectNodeContents(editor);
        preRange.setEnd(cursorRange.startContainer, cursorRange.startOffset);
        const textBefore = preRange.toString();
        if (textBefore.length < charCount) return false;

        const targetLen = textBefore.length - charCount;
        const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, null);
        let pos = 0;
        let startNode: Node | null = null;
        let startOffset = 0;

        let n;
        while ((n = walker.nextNode())) {
            const len = (n as Text).length;
            if (pos + len >= targetLen) {
                startNode = n;
                startOffset = targetLen - pos;
                break;
            }
            pos += len;
        }
        if (!startNode) return false;

        const deleteRange = document.createRange();
        deleteRange.setStart(startNode, startOffset);
        deleteRange.setEnd(cursorRange.startContainer, cursorRange.startOffset);
        deleteRange.deleteContents();
        cursorRange.setStart(startNode, startOffset);
        cursorRange.collapse(true);
        selection.removeAllRanges();
        selection.addRange(cursorRange);
        return true;
    } catch {
        return false;
    }
}

/**
 * 获取光标在容器内的坐标（用于 MentionSelector 定位）
 * top 为光标顶部，供选择器在光标上方显示；containerWidth 供宽度约束
 */
export function getCaretPosition(
    _editor: HTMLElement,
    container: HTMLElement
): { top: number; left: number; containerWidth: number } {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
        return { top: 0, left: 0, containerWidth: 0 };
    }

    const range = selection.getRangeAt(0);
    try {
        const rect = range.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        return {
            top: rect.top - containerRect.top,
            left: rect.left - containerRect.left,
            containerWidth: containerRect.width,
        };
    } catch {
        return { top: 0, left: 0, containerWidth: 0 };
    }
}
