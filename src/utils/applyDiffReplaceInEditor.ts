import type { Editor } from '@tiptap/react';

export interface ApplyDiffReplaceOptions {
  focus?: boolean;
  scrollIntoView?: boolean;
}

/**
 * 将单条对话 diff 应用到 TipTap：先按 ProseMirror 坐标删除 [from,to)，再在 **同一位置** 插入新文本。
 *
 * 勿使用 `insertContent(纯文本)`：其实现为 `insertContentAt(当前选区, …)`，若在链式开头调用 `focus()`，
 * 选区可能被重置到篇首/上次光标，导致删除对了区间但插入落点错误。
 *
 * @returns 插入后用于绿色审阅装饰的半开区间 [insertFrom, insertTo)；失败返回 false
 */
export function applyDiffReplaceInEditor(
  editor: Editor,
  range: { from: number; to: number },
  newText: string,
  options: ApplyDiffReplaceOptions = {}
): { insertFrom: number; insertTo: number } | false {
  const { from, to } = range;
  const { focus = true, scrollIntoView = true } = options;
  const docSize = editor.state.doc.content.size;
  if (from < 0 || to > docSize || from >= to) return false;

  const chain = editor
    .chain()
    .deleteRange({ from, to })
    .insertContentAt(from, newText, { updateSelection: true });
  if (focus) {
    chain.focus(undefined, { scrollIntoView });
  }
  const ok = chain.run();

  if (!ok) return false;

  const insertFrom = from;
  if (newText.length === 0) {
    return { insertFrom, insertTo: insertFrom };
  }
  const insertTo = editor.state.selection.from;
  if (newText.length > 0 && insertTo <= insertFrom) {
    console.warn('[applyDiffReplaceInEditor] 插入后选区未越过插入点，回退用字符串长度估算', {
      insertFrom,
      insertTo,
      newTextLen: newText.length,
    });
    return { insertFrom, insertTo: insertFrom + newText.length };
  }
  return { insertFrom, insertTo };
}
