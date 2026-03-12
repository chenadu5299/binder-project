/**
 * 块内 text offset ↔ ProseMirror position 转换
 * 方案约定：offset 一律指块内 node.textContent 的字符下标（从 0 开始）
 */

import type { Node as PMNode } from '@tiptap/pm/model';
import {
  BLOCK_NODE_NAMES,
  EXCLUDED_NODE_NAMES,
} from './blockConstants';

/**
 * 给定块节点与块内 [startOffset, endOffset]，返回该块在文档中的 PM from/to（相对于 doc 的绝对位置）
 */
export function blockOffsetToPMRange(
  block: PMNode,
  docStart: number,
  startOffset: number,
  endOffset: number
): { from: number; to: number } | null {
  const text = block.textContent;
  if (startOffset < 0 || endOffset > text.length || startOffset >= endOffset) {
    return null;
  }
  const from = textPosToPMPosInBlock(block, docStart, startOffset);
  const to = textPosToPMPosInBlock(block, docStart, endOffset);
  if (from === null || to === null || from >= to) return null;
  return { from, to };
}

function textPosToPMPosInBlock(
  block: PMNode,
  blockDocStart: number,
  textPos: number
): number | null {
  let currentTextPos = 0;
  let found: number | null = null;
  block.descendants((node, pos) => {
    if (found !== null) return false;
    if (node.isText && node.text) {
      const len = node.text.length;
      if (currentTextPos <= textPos && currentTextPos + len >= textPos) {
        found = blockDocStart + pos + (textPos - currentTextPos);
        return false;
      }
      currentTextPos += len;
    }
    return true;
  });
  return found;
}

/**
 * 给定块节点与文档中的 from/to（必须落在该块内），返回块内 [startOffset, endOffset]
 * 用于从选区创建 Anchor
 */
export function pmRangeToBlockOffset(
  block: PMNode,
  blockDocStart: number,
  from: number,
  to: number
): { startOffset: number; endOffset: number } | null {
  const startOffset = pmPosToBlockTextPos(block, blockDocStart, from);
  const endOffset = pmPosToBlockTextPos(block, blockDocStart, to);
  if (startOffset === null || endOffset === null || startOffset > endOffset) {
    return null;
  }
  return { startOffset, endOffset };
}

function pmPosToBlockTextPos(
  block: PMNode,
  blockDocStart: number,
  docPos: number
): number | null {
  const relativePos = docPos - blockDocStart;
  if (relativePos < 0 || relativePos > block.content.size) return null;
  let charsSoFar = 0;
  let found: number | null = null;
  block.descendants((node, pos) => {
    if (found !== null) return false;
    if (node.isText && node.text) {
      const len = node.text.length;
      if (relativePos >= pos && relativePos <= pos + len) {
        found = charsSoFar + (relativePos - pos);
        return false;
      }
      charsSoFar += len;
    }
    return true;
  });
  return found;
}

/**
 * 从文档中根据 blockId 找到块节点及其在 doc 中的起始位置
 */
export function findBlockByBlockId(
  doc: PMNode,
  blockId: string
): { node: PMNode; docStart: number } | null {
  let result: { node: PMNode; docStart: number } | null = null;
  doc.descendants((node, pos) => {
    if (result) return false;
    if (EXCLUDED_NODE_NAMES.has(node.type.name)) return true;
    if (
      BLOCK_NODE_NAMES.has(node.type.name) &&
      node.attrs?.blockId === blockId
    ) {
      result = { node, docStart: pos };
      return false;
    }
    return true;
  });
  return result;
}

/**
 * 获取块节点的纯文本（与 node.textContent 一致）
 */
export function getBlockTextContent(block: PMNode): string {
  return block.textContent;
}
