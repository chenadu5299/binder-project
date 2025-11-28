import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export interface GhostTextOptions {
  getGhostText: () => { text: string; position: number } | null;
}

// 创建插件 key，用于从外部更新
export const ghostTextPluginKey = new PluginKey('ghostText');

export const GhostTextExtension = Extension.create<GhostTextOptions>({
  name: 'ghostText',

  addOptions() {
    return {
      getGhostText: () => null,
    };
  },

  addProseMirrorPlugins() {
    const { getGhostText } = this.options;

    return [
      new Plugin({
        key: ghostTextPluginKey,
        state: {
          init() {
            console.log('[GhostTextExtension] 插件初始化');
            return DecorationSet.empty;
          },
          apply(tr, set, _oldState, newState) {
            // 每次都调用 getGhostText，即使没有事务变化
            const ghostText = getGhostText();
            const isGhostTextUpdate = tr.getMeta('ghostTextUpdate') === true;
            
            console.log('[GhostTextExtension] apply 被调用', { 
              hasGhostText: !!ghostText,
              ghostText: ghostText ? { text: ghostText.text.substring(0, 30) + '...', position: ghostText.position } : null,
              isUpdate: isGhostTextUpdate,
              docChanged: tr.docChanged,
              trSteps: tr.steps.length
            });
            
            // 如果文档发生了变化（用户输入或接受续写），立即清除装饰
            if (tr.docChanged) {
              console.log('[GhostTextExtension] 文档变化，清除装饰');
              return DecorationSet.empty;
            }
            
            // 如果没有幽灵文字，返回空集合
            if (!ghostText) {
              console.log('[GhostTextExtension] 无幽灵文字，返回空集合');
              return DecorationSet.empty;
            }

            const { text, position } = ghostText;
            const { doc } = newState;

            // 检查位置是否有效
            if (position < 0 || position > doc.content.size) {
              console.log('[GhostTextExtension] 位置无效', { position, docSize: doc.content.size });
              return DecorationSet.empty;
            }

            // 创建装饰的函数
            const createDecoration = () => {
              const span = document.createElement('span');
              span.className = 'ghost-text';
              span.textContent = text;
              span.setAttribute('data-ghost-text', 'true');
              // 添加内联样式确保可见
              span.style.cssText = 'color: rgba(156, 163, 175, 0.7) !important; opacity: 0.7 !important; font-style: italic !important; pointer-events: none !important; user-select: none !important; display: inline !important;';
              console.log('[GhostTextExtension] 创建 Widget DOM', { text: text.substring(0, 30) + '...', position });
              return span;
            };

            // 如果是强制更新（无文档变化）
            if (isGhostTextUpdate) {
              const decoration = Decoration.widget(position, createDecoration, {
                side: 1,
                ignoreSelection: true,
                key: 'ghost-text-widget',
              });
              const decorationSet = DecorationSet.create(doc, [decoration]);
              console.log('[GhostTextExtension] 创建装饰集 (强制更新)', { position, textLength: text.length });
              return decorationSet;
            }
            
            // 检查是否已有装饰
            const existing = set.find();
            if (existing.length > 0) {
              const existingDec = existing[0];
              if (existingDec.from === position) {
                console.log('[GhostTextExtension] 使用现有装饰', { position });
                return set;
              }
              // 位置不同，清除旧装饰，创建新装饰
              const decoration = Decoration.widget(position, createDecoration, {
                side: 1,
                ignoreSelection: true,
                key: 'ghost-text-widget',
              });
              const decorationSet = DecorationSet.create(doc, [decoration]);
              console.log('[GhostTextExtension] 更新装饰 (位置变化)', { oldPosition: existingDec.from, newPosition: position });
              return decorationSet;
            }

            // 创建新的 widget decoration
            const decoration = Decoration.widget(position, createDecoration, {
              side: 1,
              ignoreSelection: true,
              key: 'ghost-text-widget',
            });

            const decorationSet = DecorationSet.create(doc, [decoration]);
            console.log('[GhostTextExtension] 创建装饰集 (新装饰)', { position, textLength: text.length });
            return decorationSet;
          },
        },
        props: {
          decorations(state) {
            const decorations = this.getState(state);
            console.log('[GhostTextExtension] decorations prop 被调用', { 
              decorationCount: decorations?.size || 0 
            });
            return decorations;
          },
        },
      }),
    ];
  },
});
