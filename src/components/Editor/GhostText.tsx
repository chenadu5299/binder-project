import React from 'react';
import { Editor } from '@tiptap/react';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

interface GhostTextProps {
    editor: Editor | null;
}

// 创建 Decoration 插件
const ghostTextPluginKey = new PluginKey('ghostText');

export const createGhostTextPlugin = (
    getGhostText: () => { text: string; position: number } | null
) => {
    return new Plugin({
        key: ghostTextPluginKey,
        state: {
            init() {
                return DecorationSet.empty;
            },
            apply(tr, _set) {
                const ghostText = getGhostText();
                if (!ghostText) {
                    return DecorationSet.empty;
                }
                
                const { text, position } = ghostText;
                const from = position;
                const to = position + text.length;
                
                // 检查位置是否有效
                if (from < 0 || to > tr.doc.content.size) {
                    return DecorationSet.empty;
                }
                
                // ⚠️ 关键修复：使用 widget decoration 在光标位置后插入幽灵文字
                const decoration = Decoration.widget(from, () => {
                    const span = document.createElement('span');
                    span.className = 'ghost-text';
                    span.textContent = text;
                    span.style.pointerEvents = 'none';
                    span.style.userSelect = 'none';
                    span.style.display = 'inline';
                    return span;
                }, {
                    side: 1, // 在位置之后插入
                    ignoreSelection: true, // 忽略选择状态
                });
                
                return DecorationSet.create(tr.doc, [decoration]);
            },
        },
        props: {
            decorations(state) {
                return this.getState(state);
            },
        },
    });
};

export const GhostText: React.FC<GhostTextProps> = () => {
    // 这个组件暂时不实现，因为 TipTap 的插件需要通过 extensions 配置
    // 幽灵文字功能已通过 useAutoComplete hook 在 TipTapEditor 中集成
    return null;
};

