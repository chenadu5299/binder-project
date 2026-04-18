/**
 * 选区 → Anchor 转换
 * 用于精确定位系统：根据 editor selection (from, to) 创建 blockId + offset 锚点
 * Phase 0.2：支持跨块选区，返回 { startBlockId, startOffset, endBlockId, endOffset }
 */

import type { Node as PMNode } from '@tiptap/pm/model';
import { pmRangeToBlockOffset } from './editorOffsetUtils';
import { getBlockId } from '../components/Editor/extensions/BlockIdExtension';
import { BLOCK_NODE_NAMES, EXCLUDED_NODE_NAMES } from './blockConstants';

export interface BlockAnchor {
  startBlockId: string;
  startOffset: number;
  endBlockId: string;
  endOffset: number;
}

/** 兼容：单块时 startBlockId === endBlockId，返回 startBlockId 作为 blockId 别名 */
export function getBlockIdFromAnchor(anchor: BlockAnchor): string {
  return anchor.startBlockId;
}

/**
 * 找到包含 [from, to] 的块节点及其在 doc 中的起始位置
 * 若选区跨多块，返回包含 from 的块
 * @deprecated 使用 findBlockAtPos 替代，支持跨块
 */
export function findBlockContainingSelection(
  doc: PMNode,
  from: number,
  _to: number
): { node: PMNode; docStart: number } | null {
  return findBlockAtPos(doc, from);
}

/**
 * 在文档中查找包含指定位置 pos 的块节点
 * Phase 0.2：用于跨块选区的 start/end 分别查找
 */
export function findBlockAtPos(
  doc: PMNode,
  pos: number
): { node: PMNode; docStart: number } | null {
  let result: { node: PMNode; docStart: number } | null = null;
  doc.descendants((node, p) => {
    if (result) return false;
    if (EXCLUDED_NODE_NAMES.has(node.type.name)) return true;
    if (!BLOCK_NODE_NAMES.has(node.type.name)) return true;
    const nodeEnd = p + node.nodeSize;
    if (p <= pos && pos < nodeEnd) {
      result = { node, docStart: p };
      return false;
    }
    return true;
  });
  return result;
}

/**
 * 从行号范围创建 Anchor（将 1-indexed 行号转换为 block ID + offset）
 *
 * 行号定义与 CopyReferenceExtension.buildSourceData 保持一致：
 * doc.content 的第 i 个顶层子节点对应第 i+1 行。
 *
 * @param doc   ProseMirror 文档
 * @param startLine  起始行号（1-indexed，含）
 * @param endLine    结束行号（1-indexed，含）
 * @returns 成功时返回四元组，失败（行号越界 / 无 block ID）返回 null
 */
export function createAnchorFromLineRange(
  doc: PMNode,
  startLine: number,
  endLine: number,
): BlockAnchor | null {
  const childCount = doc.content.childCount;
  if (startLine < 1 || endLine < startLine || endLine > childCount) return null;

  let currentPos = 0;
  let startPmPos = -1;
  let endPmPos = -1;

  for (let i = 0; i < childCount; i++) {
    const child = doc.content.child(i);
    const lineNum = i + 1; // 1-indexed
    if (lineNum === startLine) {
      startPmPos = currentPos + 1; // +1：进入节点内容（跳过开放 token）
    }
    if (lineNum === endLine) {
      endPmPos = currentPos + child.nodeSize - 1; // -1：停在内容末尾（跳过关闭 token）
      break;
    }
    currentPos += child.nodeSize;
  }

  if (startPmPos < 0 || endPmPos < 0 || endPmPos <= startPmPos) return null;
  return createAnchorFromSelection(doc, startPmPos, endPmPos);
}

/**
 * 从选区创建 Anchor（支持单块与跨块）
 * @returns 成功时返回 { startBlockId, startOffset, endBlockId, endOffset }，失败返回 null
 * 单块时 startBlockId === endBlockId
 */
export function createAnchorFromSelection(
  doc: PMNode,
  from: number,
  to: number
): BlockAnchor | null {
  const startFound = findBlockAtPos(doc, from);
  const endFound = findBlockAtPos(doc, to);
  if (!startFound || !endFound) return null;
  const startId = getBlockId(startFound.node);
  const endId = getBlockId(endFound.node);
  if (!startId || !endId) return null;

  let startOffset: number;
  let endOffset: number;

  if (startId === endId) {
    const range = pmRangeToBlockOffset(startFound.node, startFound.docStart, from, to);
    if (!range) return null;
    startOffset = range.startOffset;
    endOffset = range.endOffset;
  } else {
    const startOff = pmRangeToBlockOffset(startFound.node, startFound.docStart, from, from);
    const endOff = pmRangeToBlockOffset(endFound.node, endFound.docStart, to, to);
    if (!startOff || !endOff) return null;
    startOffset = startOff.startOffset;
    endOffset = endOff.endOffset;
  }

  return {
    startBlockId: startId,
    startOffset,
    endBlockId: endId,
    endOffset,
  };
}
