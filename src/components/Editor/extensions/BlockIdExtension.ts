/**
 * BlockId 扩展：为块级节点增加稳定 blockId 属性
 * 用于精确定位系统：paragraph、heading、blockquote、codeBlock、listItem 等带 blockId
 */

import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { Node as PMNode } from '@tiptap/pm/model';
import { BLOCK_NODE_NAMES } from '../../../utils/blockConstants';

const BLOCK_ID_ATTR = 'blockId';
const BLOCK_ID_PLUGIN_KEY = new PluginKey('blockId');

function generateBlockId(): string {
  return `block_${crypto.randomUUID?.() ?? `${Date.now()}_${Math.random().toString(36).slice(2)}`}`;
}

export function getBlockId(node: PMNode): string | null {
  const v = node.attrs?.[BLOCK_ID_ATTR];
  return v == null || v === '' ? null : String(v);
}

/**
 * 为文档中缺少 blockId 的块节点分配 blockId（appendTransaction）
 */
function assignMissingBlockIdsPlugin() {
  return new Plugin({
    key: BLOCK_ID_PLUGIN_KEY,
    appendTransaction(_transactions, _oldState, state) {
      const tr = state.tr;
      let modified = false;
      state.doc.descendants((node, pos) => {
        if (!BLOCK_NODE_NAMES.has(node.type.name)) return true;
        const id = getBlockId(node);
        if (id == null || id === '') {
          const attrs = { ...node.attrs, [BLOCK_ID_ATTR]: generateBlockId() };
          tr.setNodeMarkup(pos, undefined, attrs);
          modified = true;
        }
        return true;
      });
      return modified ? tr : null;
    },
  });
}

export const BlockIdExtension = Extension.create({
  name: 'blockId',

  addGlobalAttributes() {
    return [
      {
        types: Array.from(BLOCK_NODE_NAMES),
        attributes: {
          [BLOCK_ID_ATTR]: {
            default: null as string | null,
            parseHTML: (el: HTMLElement) => el.getAttribute('data-block-id'),
            renderHTML: (attrs: Record<string, unknown>) => {
              const id = attrs[BLOCK_ID_ATTR];
              return typeof id === 'string' && id ? { 'data-block-id': id } : {};
            },
          },
        },
      },
    ];
  },

  addProseMirrorPlugins() {
    return [assignMissingBlockIdsPlugin()];
  },
});
