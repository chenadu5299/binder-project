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
  // ProseMirror: block 的 content 起始于 doc pos (blockDocStart + 1)
  const contentStart = blockDocStart + 1;
  block.descendants((node, pos) => {
    if (found !== null) return false;
    if (node.isText && node.text) {
      const len = node.text.length;
      if (currentTextPos <= textPos && currentTextPos + len >= textPos) {
        found = contentStart + pos + (textPos - currentTextPos);
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
  // ProseMirror: block 的 content 起始于 doc pos (blockDocStart + 1)
  const contentStart = blockDocStart + 1;
  const relativePos = docPos - contentStart;
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

/**
 * 问题5：将 [from,to) 限制在 `from` 所在的可定位块内，避免红删除线跨多块/整段误标
 */
export function clampDocRangeToContainingBlock(
  doc: PMNode,
  from: number,
  to: number
): { from: number; to: number } | null {
  if (from < 0 || to <= from) return null;
  const $pos = doc.resolve(Math.min(from, doc.content.size - 1));
  for (let depth = $pos.depth; depth > 0; depth--) {
    const node = $pos.node(depth);
    if (!BLOCK_NODE_NAMES.has(node.type.name)) continue;
    const blockStart = $pos.before(depth);
    const innerStart = blockStart + 1;
    const innerEnd = blockStart + node.nodeSize - 1;
    const clampedFrom = Math.max(from, innerStart);
    const clampedTo = Math.min(to, innerEnd);
    if (clampedFrom < clampedTo) {
      return { from: clampedFrom, to: clampedTo };
    }
  }
  return null;
}

/** Phase 2：段落顺序 + originalText 双重匹配的搜索半径（6.3） */
const SEARCH_RADIUS = 3;

/** 问题4：候选匹配函数，支持 trim 以应对首尾空白导致的 1–2 字符偏移 */
function tryMatchInBlock(
  blockText: string,
  searchText: string
): { start: number; end: number } | null {
  let idx = blockText.indexOf(searchText);
  if (idx >= 0) return { start: idx, end: idx + searchText.length };
  // 容差：trim 后匹配（首尾空格/换行差异）
  const trimmed = searchText.trim();
  if (trimmed && trimmed !== searchText) {
    idx = blockText.indexOf(trimmed);
    if (idx >= 0) return { start: idx, end: idx + trimmed.length };
  }
  return null;
}

/**
 * Phase 2：根据 para_index + originalText 查找块及偏移（Workspace 改造 6.3）
 * 双重匹配：先按 para_index ± SEARCH_RADIUS 筛选，再在候选中找 text.includes(originalText)
 * 退化：若无附近匹配，全文搜索 originalText，取离 para_index 最近的块
 * 问题4：增强 tryMatchInBlock，支持 trim、空白规范化，应对 1–2 字符偏移
 * 返回 { blockId, startOffset, endOffset }，匹配失败返回 null
 */
export function findBlockByParaIndexAndText(
  doc: PMNode,
  paraIndex: number,
  originalText: string
): { blockId: string; startOffset: number; endOffset: number } | null {
  if (!originalText || originalText.length === 0) return null;

  // 收集所有可定位块（带 blockId）
  const blocks: Array<{ node: PMNode; docStart: number; index: number }> = [];
  let blockIndex = 0;
  doc.descendants((node, pos) => {
    if (EXCLUDED_NODE_NAMES.has(node.type.name)) return true;
    if (!BLOCK_NODE_NAMES.has(node.type.name)) return true;
    const blockId = node.attrs?.blockId;
    if (!blockId) return true;
    blocks.push({ node, docStart: pos, index: blockIndex });
    blockIndex++;
    return true;
  });

  const matchInBlock = (text: string): { start: number; end: number } | null =>
    tryMatchInBlock(text, originalText);

  // 1. 在 para_index ± SEARCH_RADIUS 范围内找包含 originalText 的块
  const startIdx = Math.max(0, paraIndex - SEARCH_RADIUS);
  const endIdx = Math.min(blocks.length - 1, paraIndex + SEARCH_RADIUS);
  for (let i = startIdx; i <= endIdx; i++) {
    const { node } = blocks[i];
    const text = node.textContent;
    const m = matchInBlock(text);
    if (m) {
      const blockId = node.attrs?.blockId;
      if (blockId) {
        return { blockId, startOffset: m.start, endOffset: m.end };
      }
    }
  }

  // 2. 退化：全文搜索 originalText，取离 para_index 最近的块
  let best: { blockId: string; startOffset: number; endOffset: number; dist: number } | null = null;
  for (let i = 0; i < blocks.length; i++) {
    const { node } = blocks[i];
    const text = node.textContent;
    const m = matchInBlock(text);
    if (m) {
      const blockId = node.attrs?.blockId;
      if (blockId) {
        const dist = Math.abs(i - paraIndex);
        if (!best || dist < best.dist) {
          best = { blockId, startOffset: m.start, endOffset: m.end, dist };
        }
      }
    }
  }
  return best ? { blockId: best.blockId, startOffset: best.startOffset, endOffset: best.endOffset } : null;
}

/** 归一化空白：用于 §6.8 纯文本 fallback，缓解 Pandoc/HTML 与磁盘切片差异 */
export function normalizeWhitespaceForMatch(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Phase B：para_index 路径仍失败时，先按归一化全文筛块，再在块内用 tryMatchInBlock 找偏移（§6.8 缓解）
 */
export function findBlockByFuzzyNormalizedText(
  doc: PMNode,
  originalText: string
): { blockId: string; startOffset: number; endOffset: number } | null {
  const needle = normalizeWhitespaceForMatch(originalText);
  if (!needle) return null;

  const blocks: Array<{ node: PMNode }> = [];
  doc.descendants((node) => {
    if (EXCLUDED_NODE_NAMES.has(node.type.name)) return true;
    if (!BLOCK_NODE_NAMES.has(node.type.name)) return true;
    if (!node.attrs?.blockId) return true;
    blocks.push({ node });
    return true;
  });

  for (const { node } of blocks) {
    const text = node.textContent;
    if (!normalizeWhitespaceForMatch(text).includes(needle)) continue;
    const m =
      tryMatchInBlock(text, originalText) ||
      tryMatchInBlock(text, originalText.trim());
    if (m) {
      const blockId = node.attrs?.blockId as string;
      return { blockId, startOffset: m.start, endOffset: m.end };
    }
  }
  return null;
}

/**
 * 在文档中根据文本内容查找块及偏移（用于 element_identifier 缺失时的 fallback）
 * 按文档块遍历顺序收集所有匹配，`occurrenceIndex`（默认 0）选取第几处；越界返回 null（不静默取首）。
 */
export function findBlockAndOffsetByText(
  doc: PMNode,
  searchText: string,
  occurrenceIndex: number = 0
): { blockId: string; startOffset: number; endOffset: number } | null {
  if (!searchText || searchText.length === 0) return null;
  const matches: Array<{ blockId: string; startOffset: number; endOffset: number }> = [];
  doc.descendants((node) => {
    if (EXCLUDED_NODE_NAMES.has(node.type.name)) return true;
    if (!BLOCK_NODE_NAMES.has(node.type.name)) return true;
    const blockId = node.attrs?.blockId;
    if (!blockId) return true;
    const text = node.textContent;
    let from = 0;
    while (from <= text.length - searchText.length) {
      const idx = text.indexOf(searchText, from);
      if (idx < 0) break;
      matches.push({
        blockId,
        startOffset: idx,
        endOffset: idx + searchText.length,
      });
      from = idx + 1;
    }
    return true;
  });
  if (occurrenceIndex < 0 || occurrenceIndex >= matches.length) return null;
  return matches[occurrenceIndex];
}

/** 块 ID 已解析时的 PM 范围（无文本 fallback） */
function blockRangeToPMRangeResolved(
  doc: PMNode,
  startBlockId: string,
  startOffset: number,
  endBlockId: string,
  endOffset: number
): { from: number; to: number } | null {
  const startFound = findBlockByBlockId(doc, startBlockId);
  const endFound = findBlockByBlockId(doc, endBlockId);
  if (!startFound || !endFound) {
    return null;
  }

  if (startBlockId === endBlockId) {
    return blockOffsetToPMRange(
      startFound.node,
      startFound.docStart,
      startOffset,
      endOffset
    );
  }

  const startRange = blockOffsetToPMRange(
    startFound.node,
    startFound.docStart,
    startOffset,
    startFound.node.textContent.length
  );
  const endRange = blockOffsetToPMRange(
    endFound.node,
    endFound.docStart,
    0,
    endOffset
  );
  if (!startRange || !endRange) return null;
  return { from: startRange.from, to: endRange.to };
}

export type BlockRangeToPMRangeOptions = {
  /** 与后端 occurrence_index 对齐：全文块序下第几处文本匹配（0-based） */
  occurrenceIndex?: number;
  /** 旧的 originalText 文本 fallback 已禁用，仅保留字段兼容。 */
  originalTextFallback?: string;
};

/**
 * Phase 0.6：将跨块或单块 Anchor 转为文档的 from/to
 * 单块时复用 blockOffsetToPMRange
 * 跨块时分别计算 start 块 from、end 块 to
 */
export function blockRangeToPMRange(
  doc: PMNode,
  startBlockId: string,
  startOffset: number,
  endBlockId: string,
  endOffset: number,
  _options?: BlockRangeToPMRangeOptions
): { from: number; to: number } | null {
  const startFound = findBlockByBlockId(doc, startBlockId);
  const endFound = findBlockByBlockId(doc, endBlockId);
  if (!startFound || !endFound) {
    console.warn('[对话编辑] blockRangeToPMRange: block 未找到', {
      startBlockId,
      endBlockId,
      startFound: !!startFound,
      endFound: !!endFound,
    });
    return null;
  }

  return blockRangeToPMRangeResolved(
    doc,
    startBlockId,
    startOffset,
    endBlockId,
    endOffset
  );
}

/**
 * 根据文档位置计算行号（1-based）
 * 按换行符切分，position 前的文本中换行符数量 + 1
 */
export function positionToLine(doc: PMNode, pos: number): number {
  if (pos <= 0) return 1;
  const textBefore = doc.textBetween(0, Math.min(pos, doc.content.size));
  const newlineCount = (textBefore.match(/\n/g) || []).length;
  return newlineCount + 1;
}
