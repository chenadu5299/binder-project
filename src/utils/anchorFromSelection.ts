/**
 * 选区 → Anchor 转换
 * 用于精确定位系统：根据 editor selection (from, to) 创建 blockId + offset 锚点
 */

import type { Node as PMNode } from '@tiptap/pm/model';
import { pmRangeToBlockOffset } from './editorOffsetUtils';
import { getBlockId } from '../components/Editor/extensions/BlockIdExtension';
import { BLOCK_NODE_NAMES, EXCLUDED_NODE_NAMES } from './blockConstants';

export interface BlockAnchor {
  blockId: string;
  startOffset: number;
  endOffset: number;
}

/**
 * 找到包含 [from, to] 的块节点及其在 doc 中的起始位置
 * 若选区跨多块，返回包含 from 的块
 */
export function findBlockContainingSelection(
  doc: PMNode,
  from: number,
  _to: number
): { node: PMNode; docStart: number } | null {
  let result: { node: PMNode; docStart: number } | null = null;
  doc.descendants((node, pos) => {
    if (result) return false;
    if (EXCLUDED_NODE_NAMES.has(node.type.name)) return true;
    if (!BLOCK_NODE_NAMES.has(node.type.name)) return true;
    const nodeEnd = pos + node.nodeSize;
    if (pos <= from && from < nodeEnd) {
      result = { node, docStart: pos };
      return false;
    }
    return true;
  });
  return result;
}

/**
 * 从选区创建 Anchor
 * @returns 成功时返回 { blockId, startOffset, endOffset }，失败返回 null
 */
export function createAnchorFromSelection(
  doc: PMNode,
  from: number,
  to: number
): BlockAnchor | null {
  const found = findBlockContainingSelection(doc, from, to);
  if (!found) return null;
  const { node, docStart } = found;
  const blockId = getBlockId(node);
  if (!blockId) return null;
  const range = pmRangeToBlockOffset(node, docStart, from, to);
  if (!range) return null;
  return {
    blockId,
    startOffset: range.startOffset,
    endOffset: range.endOffset,
  };
}
