import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { EditorView } from '@tiptap/pm/view';

interface HighlightState {
  /** 当前要渲染的高亮范围；null 表示无高亮 */
  from: number | null;
  to: number | null;
  /** 编辑器是否处于聚焦状态 */
  isFocused: boolean;
}

const pluginKey = new PluginKey<HighlightState>('selectionHighlight');

/**
 * 统一选区高亮扩展（ghost-only 模式）
 *
 * 原生 ::selection 已通过 CSS 隐藏，所有选区高亮均由本扩展以
 * Decoration.inline 渲染，保证聚焦 → 失焦视觉连续无闪烁。
 *
 * 状态机：
 *  - 聚焦时：decorations() 直接读 state.selection，ghost 实时跟随
 *  - 失焦时：blur DOM 事件冻结当前选区到插件状态，decorations() 用冻结值渲染
 *  - 重新聚焦：focus DOM 事件清除冻结值，decorations() 切回实时路径
 *  - 文档变化：清除冻结值（位置可能已失效）
 */
export const SelectionHighlightExtension = Extension.create({
  name: 'selectionHighlight',

  addProseMirrorPlugins() {
    return [
      new Plugin<HighlightState>({
        key: pluginKey,

        state: {
          init: () => ({ from: null, to: null, isFocused: false }),

          apply(tr, prev) {
            const meta = tr.getMeta(pluginKey) as Partial<HighlightState> | undefined;
            if (meta !== undefined) {
              return { ...prev, ...meta };
            }
            // 文档变化时清除冻结的失焦选区（位置已失效）
            if (tr.docChanged && !prev.isFocused) {
              return { from: null, to: null, isFocused: false };
            }
            return prev;
          },
        },

        props: {
          handleDOMEvents: {
            focus(view: EditorView) {
              view.dispatch(
                view.state.tr.setMeta(pluginKey, { from: null, to: null, isFocused: true })
              );
              return false;
            },

            blur(view: EditorView) {
              const { from, to } = view.state.selection;
              const frozen = from !== to ? { from, to } : { from: null, to: null };
              view.dispatch(
                view.state.tr.setMeta(pluginKey, { ...frozen, isFocused: false })
              );
              return false;
            },
          },

          decorations(state) {
            const ps = pluginKey.getState(state);
            if (!ps) return DecorationSet.empty;

            let from: number;
            let to: number;

            if (ps.isFocused) {
              // 聚焦：直接读实时选区
              from = state.selection.from;
              to = state.selection.to;
            } else {
              // 失焦：用冻结值
              if (ps.from == null || ps.to == null) return DecorationSet.empty;
              from = ps.from;
              to = ps.to;
            }

            if (from >= to) return DecorationSet.empty;
            if (to > state.doc.content.size) return DecorationSet.empty;

            return DecorationSet.create(state.doc, [
              Decoration.inline(from, to, {
                style: 'background-color: rgba(100, 160, 255, 0.35);',
                class: 'selection-ghost',
              }),
            ]);
          },
        },
      }),
    ];
  },
});
