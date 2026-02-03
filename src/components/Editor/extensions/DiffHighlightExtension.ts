/* eslint-disable @typescript-eslint/no-explicit-any -- ProseMirror doc/node 使用 any */
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { Diff } from "../../../stores/editorStore";

export interface DiffHighlightOptions {
  getDiffs: () => Diff[] | null;
  getOldContent: () => string | null;
  getNewContent: () => string | null;
  onApplyDiff?: () => void; // 应用 diff 的回调
  onRejectDiff?: () => void; // 拒绝 diff 的回调
}

// 创建插件 key，用于从外部更新
export const diffHighlightPluginKey = new PluginKey("diffHighlight");

// 将文本位置转换为 ProseMirror 文档位置
function textPosToDocPos(doc: any, textPos: number): number | null {
  let docPos = 1; // ProseMirror 文档从位置 1 开始
  let currentTextPos = 0;
  let found = false;

  doc.descendants((node: any, pos: number) => {
    if (found) return false;

    if (node.isText) {
      const nodeText = node.text;
      const nodeTextLength = nodeText.length;

      if (
        currentTextPos <= textPos &&
        currentTextPos + nodeTextLength >= textPos
      ) {
        // 找到了目标位置
        const offset = textPos - currentTextPos;
        docPos = pos + offset;
        found = true;
        return false; // 停止遍历
      }

      currentTextPos += nodeTextLength;
    }

    return true; // 继续遍历
  });

  return found ? docPos : null;
}

// 在文档中查找文本范围并返回文档位置范围
function findTextRangeInDoc(
  doc: any,
  textStart: number,
  textEnd: number
): { start: number; end: number } | null {
  const startPos = textPosToDocPos(doc, textStart);
  const endPos = textPosToDocPos(doc, textEnd);

  if (startPos !== null && endPos !== null && startPos < endPos) {
    return { start: startPos, end: endPos };
  }
  return null;
}

/** 将 ProseMirror 文档位置转换为平面文本位置（字符数），用于修正 range 长度 */
function docPosToTextPos(doc: any, docPos: number): number {
  let textPos = 0;
  let found = false;
  doc.descendants((node: any, pos: number) => {
    if (found) return false;
    if (node.isText && node.text) {
      const nodeEnd = pos + node.text.length;
      if (docPos <= nodeEnd) {
        textPos += docPos - pos;
        found = true;
        return false;
      }
      textPos += node.text.length;
    }
    return true;
  });
  return textPos;
}

/**
 * 从 doc 中 fromPos 起向前数 charCount 个字符，返回对应的文档位置（用于修正多字节/多字符导致的 range 少一个字的问题）。
 */
function docPosAfterChars(doc: any, fromPos: number, charCount: number): number {
  if (charCount <= 0) return fromPos;
  const startTextPos = docPosToTextPos(doc, fromPos);
  const endTextPos = startTextPos + charCount;
  const endDocPos = textPosToDocPos(doc, endTextPos);
  return endDocPos != null ? Math.min(endDocPos, doc.content.size) : fromPos;
}

/** 确保删除高亮 range 覆盖的字符数不少于 original_code 长度，避免多字节字符导致最后一字未高亮 */
function ensureDeletionRangeLength(
  doc: any,
  range: { start: number; end: number },
  expectedCharCount: number
): { start: number; end: number } {
  const actual = range.end - range.start;
  if (actual >= expectedCharCount) return range;
  const end = docPosAfterChars(doc, range.start, expectedCharCount);
  return { start: range.start, end: Math.min(end, doc.content.size) };
}

/**
 * 从 ProseMirror 文档生成「带块间换行」的纯文本及位置映射。
 * 后端从 HTML 的 lines() 提取上下文（含换行），而 doc.textContent 块间无换行，导致 context_before 匹配失败。
 * 本函数按块拼接文本并在块间插入 \n，使与后端格式一致；ourToDocPos[i] 为「带换行文本」下标 i 对应的 doc 纯文本下标。
 */
function getDocTextWithNewlines(doc: any): {
  text: string;
  ourToDocPos: number[];
} {
  const blocks: string[] = [];
  doc.forEach((node: any) => {
    if (node.isBlock && node.type.name !== "doc") {
      blocks.push(node.textContent || "");
    }
  });
  let text = "";
  const ourToDocPos: number[] = [0]; // ourToDocPos[i] = doc 纯文本中「下标 i 之前」的字符数（不含 \n）
  let docPos = 0;
  for (let b = 0; b < blocks.length; b++) {
    if (b > 0) {
      text += "\n";
      ourToDocPos[text.length] = docPos;
    }
    const block = blocks[b];
    for (let i = 0; i < block.length; i++) {
      text += block[i];
      docPos++;
      ourToDocPos[text.length] = docPos;
    }
  }
  ourToDocPos[text.length] = docPos; // 用于 [start, end) 中 end 的映射
  return { text, ourToDocPos };
}

/** 将「带换行文本」中的 [start, end) 映射为 doc 纯文本位置，供 findTextRangeInDoc 使用 */
function mapOurPosToDocPos(
  ourToDocPos: number[],
  start: number,
  end: number
): { docStart: number; docEnd: number } {
  const len = ourToDocPos.length;
  const docStart = ourToDocPos[Math.min(start, len - 1)] ?? 0;
  const docEnd = ourToDocPos[Math.min(end, len - 1)] ?? docStart;
  return { docStart, docEnd };
}

/** 将 doc 纯文本位置（如 insertTextPos）映射为「带换行」文本中的下标，用于 docText.substring 等 */
function docPosToOurPos(docPos: number, ourToDocPos: number[]): number {
  let i = 0;
  while (i < ourToDocPos.length - 1 && ourToDocPos[i + 1] <= docPos) i++;
  return Math.min(i, ourToDocPos.length - 1);
}

// 规范化文本：移除多余空格和换行符，用于匹配
function normalizeText(text: string): string {
  return text
    .replace(/\s+/g, " ") // 将多个空白字符替换为单个空格
    .trim();
}

// 移除 HTML 标签，获取纯文本（保留换行符）
function stripHtmlTags(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/** 规范化引号与不可见字符，便于后端/前端文本一致匹配（避免 " 与 \"、全角与半角等差异） */
function normalizeQuotesForMatch(s: string): string {
  return s
    .replace(/\u201c|\u201d/g, '"')
    .replace(/\u2018|\u2019/g, "'")
    .replace(/\u00a0/g, " ")
    .trim();
}

// 多层匹配策略：查找目标文本在文档中的位置
function findTextInDocument(
  docText: string,
  targetText: string,
  contextBefore: string | null | undefined,
  contextAfter: string | null | undefined,
  startLine: number,
  endLine: number,
  oldLines: string[]
): { start: number; end: number } | null {
  // 移除 HTML 标签，统一为纯文本；并做引号规范化以便与后端一致（文档侧仅做等长替换，保证下标一致）
  const cleanDocText = stripHtmlTags(docText);
  const cleanDocTextForSearch = normalizeQuotesForMatch(cleanDocText);
  let cleanTargetText = stripHtmlTags(targetText.trim());
  cleanTargetText = normalizeQuotesForMatch(cleanTargetText);
  const cleanContextBefore = contextBefore
    ? normalizeQuotesForMatch(stripHtmlTags(contextBefore))
    : null;
  const cleanContextAfter = contextAfter
    ? normalizeQuotesForMatch(stripHtmlTags(contextAfter))
    : null;

  // ⚠️ 关键修复：优先使用上下文匹配（策略2），因为上下文匹配更准确
  // 策略2：基于上下文匹配（最稳定，适用于格式变化的情况）
  // ⚠️ 改进：使用更精确的上下文匹配策略；所有 indexOf 使用 cleanDocTextForSearch 以保证引号一致
  if (cleanContextBefore) {
    console.log("[findTextInDocument] 使用上下文匹配策略", {
      contextBeforeLength: cleanContextBefore.length,
      contextBefore: cleanContextBefore.substring(0, 50),
      contextAfterLength: cleanContextAfter?.length || 0,
      contextAfter: cleanContextAfter?.substring(0, 50),
      targetTextLength: cleanTargetText.length,
      targetText: cleanTargetText.substring(0, 50),
    });

    // 使用引号规范化后的文档进行查找，下标与 cleanDocText 一致
    const contextBeforeInDoc =
      cleanDocTextForSearch.indexOf(cleanContextBefore);

    if (contextBeforeInDoc !== -1) {
      console.log("[findTextInDocument] 找到上下文前位置", {
        contextBeforeIndex: contextBeforeInDoc,
        contextBeforeText: cleanContextBefore.substring(0, 30),
      });

      // ⚠️ 关键修复：扩大搜索范围，确保能找到目标文本
      // 对于 Edit 操作，original_code 可能很长，需要更大的搜索范围
      const searchStart = contextBeforeInDoc + cleanContextBefore.length;
      // 扩大搜索范围：从 3 倍增加到 10 倍，或至少 500 字符
      const searchRangeSize = Math.max(cleanTargetText.length * 10, 500);
      const searchEnd = Math.min(
        cleanDocTextForSearch.length,
        searchStart + searchRangeSize
      );
      const searchRange = cleanDocTextForSearch.substring(
        searchStart,
        searchEnd
      );

      console.log("[findTextInDocument] 搜索范围", {
        searchStart,
        searchEnd,
        searchRangeSize,
        searchRangeLength: searchRange.length,
        targetTextLength: cleanTargetText.length,
        targetTextPreview: cleanTargetText.substring(0, 50),
      });

      // 首先尝试精确匹配（searchRange 来自 cleanDocTextForSearch，下标与 doc 一致）
      let targetIndex = searchRange.indexOf(cleanTargetText);
      let targetIndexIsAbsolute = false; // 来自 searchRange/extended 时为相对 searchStart

      // 如果精确匹配失败，尝试规范化匹配
      if (targetIndex === -1) {
        const normalizedSearchRange = normalizeText(searchRange);
        const normalizedTargetText = normalizeText(cleanTargetText);
        const normalizedIndex =
          normalizedSearchRange.indexOf(normalizedTargetText);

        if (normalizedIndex !== -1) {
          // ⚠️ 改进：更准确的规范化位置映射
          // 策略：通过字符计数来映射位置
          let normalizedCount = 0;
          let originalIndex = searchStart;

          // 遍历 searchRange，计算规范化位置
          for (let i = 0; i < searchRange.length; i++) {
            const char = searchRange[i];
            // 规范化文本：移除多余空格，所以非空白字符才计数
            if (!/\s/.test(char)) {
              normalizedCount++;
            }

            // 如果达到目标规范化位置，记录原始位置
            if (normalizedCount >= normalizedIndex) {
              originalIndex = searchStart + i;
              break;
            }
          }

          // 从原始位置开始，尝试找到目标文本的起始位置（使用第一个单词作为锚点）
          const remainingRange = cleanDocTextForSearch.substring(
            originalIndex,
            searchEnd
          );
          const firstWord = normalizedTargetText
            .split(/\s+/)
            .filter((w) => w.length > 0)[0];
          if (firstWord) {
            const firstWordIndex = remainingRange.indexOf(firstWord);
            if (firstWordIndex !== -1) {
              targetIndex = originalIndex - searchStart + firstWordIndex;
              console.log(
                "[findTextInDocument] 规范化匹配成功，映射到原始位置",
                {
                  normalizedIndex,
                  originalIndex,
                  firstWordIndex,
                  finalTargetIndex: targetIndex,
                }
              );
            }
          }
        }
      }

      // ⚠️ 新增：如果 searchRange 中找不到，尝试在整个文档中搜索（但限制在上下文后的一定范围内）
      if (targetIndex === -1) {
        console.log(
          "[findTextInDocument] searchRange 中未找到，尝试在整个文档中搜索（限制范围）"
        );
        // 在整个文档中搜索，但限制在上下文后的一定范围内（最多 2000 字符）
        const extendedSearchEnd = Math.min(
          cleanDocTextForSearch.length,
          searchStart + 2000
        );
        const extendedSearchRange = cleanDocTextForSearch.substring(
          searchStart,
          extendedSearchEnd
        );
        const extendedTargetIndex =
          extendedSearchRange.indexOf(cleanTargetText);

        if (extendedTargetIndex !== -1) {
          targetIndex = extendedTargetIndex;
          console.log("[findTextInDocument] 在扩展搜索范围中找到目标文本", {
            extendedTargetIndex,
            searchStart,
            extendedSearchEnd,
          });
        } else {
          // 最后尝试：规范化匹配整个扩展范围
          const normalizedExtendedRange = normalizeText(extendedSearchRange);
          const normalizedTargetText = normalizeText(cleanTargetText);
          const normalizedExtendedIndex =
            normalizedExtendedRange.indexOf(normalizedTargetText);

          if (normalizedExtendedIndex !== -1) {
            // 映射规范化位置到原始位置
            let normalizedCount = 0;
            let originalIndex = searchStart;

            for (let i = 0; i < extendedSearchRange.length; i++) {
              if (!/\s/.test(extendedSearchRange[i])) {
                normalizedCount++;
              }
              if (normalizedCount >= normalizedExtendedIndex) {
                originalIndex = searchStart + i;
                break;
              }
            }

            // 使用第一个单词作为锚点
            const remainingRange = cleanDocTextForSearch.substring(
              originalIndex,
              extendedSearchEnd
            );
            const firstWord = normalizedTargetText
              .split(/\s+/)
              .filter((w) => w.length > 0)[0];
            if (firstWord) {
              const firstWordIndex = remainingRange.indexOf(firstWord);
              if (firstWordIndex !== -1) {
                targetIndex = originalIndex - searchStart + firstWordIndex;
                console.log("[findTextInDocument] 在扩展范围中规范化匹配成功", {
                  normalizedExtendedIndex,
                  originalIndex,
                  firstWordIndex,
                  finalTargetIndex: targetIndex,
                });
              }
            }
          }
        }
      }

      // ⚠️ 关键修复：如果上下文匹配失败，直接在整个文档中搜索 original_code（不依赖上下文）
      if (targetIndex === -1 && cleanTargetText.length > 0) {
        console.log(
          "[findTextInDocument] 上下文匹配失败，直接在整个文档中搜索 original_code"
        );
        const directIndex = cleanDocTextForSearch.indexOf(cleanTargetText);
        if (directIndex !== -1) {
          targetIndex = directIndex;
          targetIndexIsAbsolute = true; // 直接搜索得到的是文档内绝对下标
          console.log("[findTextInDocument] ✅ 直接搜索找到目标文本", {
            directIndex,
            targetTextLength: cleanTargetText.length,
            targetTextPreview: cleanTargetText.substring(0, 50),
          });
        } else {
          // 如果直接搜索也失败，尝试规范化匹配整个文档
          const normalizedDocText = normalizeText(cleanDocTextForSearch);
          const normalizedTargetText = normalizeText(cleanTargetText);
          const normalizedIndex =
            normalizedDocText.indexOf(normalizedTargetText);

          if (normalizedIndex !== -1) {
            // 映射规范化位置到原始位置（简化版：使用第一个单词作为锚点）
            const firstWord = normalizedTargetText
              .split(/\s+/)
              .filter((w) => w.length > 0)[0];
            if (firstWord) {
              // 在原始文档中查找第一个单词
              let wordIndex = 0;
              let normalizedCount = 0;

              for (let i = 0; i < cleanDocTextForSearch.length; i++) {
                if (!/\s/.test(cleanDocTextForSearch[i])) {
                  normalizedCount++;
                }
                if (normalizedCount >= normalizedIndex) {
                  wordIndex = i;
                  break;
                }
              }

              // 从 wordIndex 开始查找第一个单词
              const remainingRange = cleanDocTextForSearch.substring(wordIndex);
              const firstWordIndex = remainingRange.indexOf(firstWord);
              if (firstWordIndex !== -1) {
                targetIndex = wordIndex + firstWordIndex;
                targetIndexIsAbsolute = true; // 全文规范化匹配得到的是绝对下标
                console.log("[findTextInDocument] ✅ 规范化匹配整个文档成功", {
                  normalizedIndex,
                  wordIndex,
                  firstWordIndex,
                  finalTargetIndex: targetIndex,
                });
              }
            }
          }
        }
      }

      if (targetIndex !== -1) {
        // ⚠️ 关键修复：finalIndex 需区分「相对 searchStart」与「绝对下标」（直接/全文匹配时为绝对）
        const finalIndex = targetIndexIsAbsolute
          ? targetIndex
          : searchStart + targetIndex;
        // ⚠️ 关键修复：对于 Edit 操作，原内容被替换了，所以原内容后面的上下文在当前文档中可能不存在
        // 策略：如果上下文后匹配失败，放宽验证，只使用上下文前进行匹配（因为上下文前是准确的）
        let contextAfterMatched = true;
        let afterArea: string | null = null;

        if (cleanContextAfter) {
          const targetEnd = finalIndex + cleanTargetText.length;
          const afterStart = targetEnd;
          const afterEnd = Math.min(
            cleanDocText.length,
            afterStart + cleanContextAfter.length * 2
          );
          afterArea = cleanDocText.substring(afterStart, afterEnd);

          // 检查上下文后是否匹配（允许部分匹配）
          if (!afterArea.startsWith(cleanContextAfter)) {
            const minMatchLength = Math.floor(cleanContextAfter.length * 0.3); // ⚠️ 降低阈值到30%
            if (minMatchLength > 0) {
              const partialMatch = cleanContextAfter.substring(
                0,
                minMatchLength
              );
              // ⚠️ 改进：使用规范化匹配，因为格式可能变化
              const normalizedAfterArea = normalizeText(
                afterArea.substring(
                  0,
                  Math.min(cleanContextAfter.length, afterArea.length)
                )
              );
              const normalizedPartialMatch = normalizeText(partialMatch);

              if (!normalizedAfterArea.startsWith(normalizedPartialMatch)) {
                // ⚠️ 关键修复：如果上下文后匹配失败，但上下文前匹配成功，仍然认为匹配成功
                // 因为对于 Edit 操作，原内容后面的上下文可能已经被替换了
                contextAfterMatched = false;
                console.log(
                  "[findTextInDocument] ⚠️ 上下文后不匹配，但上下文前匹配成功，仍然使用此位置",
                  {
                    expected: cleanContextAfter.substring(0, 30),
                    actual: afterArea.substring(0, 30),
                    note: "对于 Edit 操作，原内容后面的上下文可能已被替换，这是正常的",
                  }
                );
              } else {
                contextAfterMatched = true; // 部分匹配成功
              }
            } else {
              contextAfterMatched = false;
            }
          }
        }

        // ⚠️ 关键修复：只要上下文前匹配成功且找到了目标文本，就认为匹配成功
        // 上下文后的匹配失败不影响结果（因为对于 Edit 操作，原内容后面的上下文可能已经被替换）
        console.log("[findTextInDocument] ✅ 上下文匹配成功", {
          finalIndex,
          targetLength: cleanTargetText.length,
          targetText: cleanTargetText.substring(0, 30),
          contextAfterMatched,
          note: contextAfterMatched
            ? "上下文前后都匹配"
            : "上下文前匹配，上下文后可能已被替换（Edit操作正常）",
        });
        return { start: finalIndex, end: finalIndex + cleanTargetText.length };
      } else {
        console.log("[findTextInDocument] ⚠️ 在上下文后未找到目标文本", {
          searchStart,
          searchEnd,
          searchRangeLength: searchRange.length,
          targetText: cleanTargetText.substring(0, 30),
          targetTextLength: cleanTargetText.length,
          willTryDirectSearch: true,
        });
      }
    } else {
      console.log("[findTextInDocument] ⚠️ 未找到上下文前", {
        contextBefore: cleanContextBefore
          ? cleanContextBefore.substring(0, 50)
          : "null",
        docTextLength: cleanDocText.length,
        willTryDirectSearch: true,
      });
    }
  }

  // ⚠️ 关键修复：如果所有上下文匹配都失败，直接在整个文档中搜索 original_code（不依赖上下文）
  // 这个逻辑应该在所有策略之前执行，作为最后的回退
  if (cleanTargetText.length > 0) {
    console.log("[findTextInDocument] 🔍 尝试直接搜索策略（不依赖上下文）", {
      targetTextLength: cleanTargetText.length,
      targetTextPreview: cleanTargetText.substring(0, 50),
      docTextLength: cleanDocTextForSearch.length,
    });

    const directIndex = cleanDocTextForSearch.indexOf(cleanTargetText);
    if (directIndex !== -1) {
      console.log("[findTextInDocument] ✅ 直接搜索找到目标文本", {
        directIndex,
        targetTextLength: cleanTargetText.length,
        targetTextPreview: cleanTargetText.substring(0, 50),
      });
      return { start: directIndex, end: directIndex + cleanTargetText.length };
    } else {
      console.log("[findTextInDocument] ⚠️ 直接搜索未找到，尝试规范化匹配", {
        targetTextPreview: cleanTargetText.substring(0, 50),
      });

      // 如果直接搜索也失败，尝试规范化匹配整个文档
      const normalizedDocText = normalizeText(cleanDocTextForSearch);
      const normalizedTargetText = normalizeText(cleanTargetText);
      const normalizedIndex = normalizedDocText.indexOf(normalizedTargetText);

      if (normalizedIndex !== -1) {
        console.log("[findTextInDocument] ✅ 规范化匹配找到目标文本", {
          normalizedIndex,
          targetTextPreview: cleanTargetText.substring(0, 50),
        });

        // 映射规范化位置到原始位置（使用第一个单词作为锚点）
        const firstWord = normalizedTargetText
          .split(/\s+/)
          .filter((w) => w.length > 0)[0];
        if (firstWord) {
          // 在原始文档中查找第一个单词
          const firstWordIndex = cleanDocTextForSearch.indexOf(firstWord);
          if (firstWordIndex !== -1) {
            console.log(
              "[findTextInDocument] ✅ 规范化匹配成功，使用第一个单词作为锚点",
              {
                normalizedIndex,
                firstWordIndex,
                firstWord,
              }
            );
            return {
              start: firstWordIndex,
              end: firstWordIndex + cleanTargetText.length,
            };
          }
        }
      } else {
        console.log("[findTextInDocument] ⚠️ 规范化匹配也失败", {
          targetTextPreview: cleanTargetText.substring(0, 50),
          normalizedDocTextLength: normalizedDocText.length,
          normalizedTargetTextLength: normalizedTargetText.length,
        });
      }
    }
  }

  // 策略1：基于行号匹配（作为备选，适用于行号准确且没有上下文的情况）
  // ⚠️ 注意：行号匹配可能不准确，因为文档格式可能变化（HTML vs 纯文本）
  if (startLine > 0 && startLine <= oldLines.length) {
    console.log("[findTextInDocument] 尝试行号匹配策略", {
      startLine,
      endLine,
      oldLinesCount: oldLines.length,
    });

    // ⚠️ 关键修复：使用 oldContent 的行号，而不是 docText 的行号
    // 因为 oldLines 是从 oldContent 计算的，而 docText 是当前文档的纯文本
    // 需要将 oldContent 的行号映射到 docText 的位置
    let lineStartPos = 0;
    const docLines = cleanDocText.split("\n");

    // ⚠️ 改进：如果 startLine 在 docLines 范围内，直接使用 docLines 的位置
    if (startLine <= docLines.length) {
      // 计算 docText 中对应行的起始位置
      for (let i = 0; i < startLine - 1 && i < docLines.length; i++) {
        lineStartPos += docLines[i].length + 1; // +1 for newline
      }

      // 在对应行附近查找目标文本
      // 扩大搜索范围：从当前行开始，向后搜索最多 5 行
      const searchEndLine = Math.min(startLine + 5, docLines.length);
      let searchEndPos = lineStartPos;
      for (
        let i = startLine - 1;
        i < searchEndLine && i < docLines.length;
        i++
      ) {
        searchEndPos += docLines[i].length + 1;
      }

      const searchRange = cleanDocText.substring(
        lineStartPos,
        Math.min(searchEndPos, cleanDocText.length)
      );

      // 首先尝试精确匹配
      let targetIndex = searchRange.indexOf(cleanTargetText);

      // 如果精确匹配失败，尝试规范化匹配
      if (targetIndex === -1) {
        const normalizedSearchRange = normalizeText(searchRange);
        const normalizedTargetText = normalizeText(cleanTargetText);
        const normalizedIndex =
          normalizedSearchRange.indexOf(normalizedTargetText);

        if (normalizedIndex !== -1) {
          // 映射规范化位置到原始位置
          let normalizedCount = 0;
          let originalIndex = lineStartPos;

          for (let i = 0; i < searchRange.length; i++) {
            if (!/\s/.test(searchRange[i])) {
              normalizedCount++;
            }
            if (normalizedCount >= normalizedIndex) {
              originalIndex = lineStartPos + i;
              break;
            }
          }

          // 使用第一个单词作为锚点
          const remainingRange = cleanDocText.substring(
            originalIndex,
            Math.min(searchEndPos, cleanDocText.length)
          );
          const firstWord = normalizedTargetText
            .split(/\s+/)
            .filter((w) => w.length > 0)[0];
          if (firstWord) {
            const firstWordIndex = remainingRange.indexOf(firstWord);
            if (firstWordIndex !== -1) {
              targetIndex = originalIndex - lineStartPos + firstWordIndex;
            }
          }
        }
      }

      if (targetIndex !== -1) {
        const finalIndex = lineStartPos + targetIndex;
        console.log("[findTextInDocument] ✅ 行号匹配成功", {
          finalIndex,
          lineStartPos,
          targetIndex,
          targetLength: cleanTargetText.length,
          searchRangeLength: searchRange.length,
        });
        return { start: finalIndex, end: finalIndex + cleanTargetText.length };
      }
    }

    console.log("[findTextInDocument] ⚠️ 行号匹配失败", {
      startLine,
      docLinesCount: docLines.length,
      docTextLength: cleanDocText.length,
    });
  }

  // 策略3：精确文本匹配（如果上下文匹配和行号匹配都失败）
  const exactIndex = cleanDocText.indexOf(cleanTargetText);
  if (exactIndex !== -1) {
    return { start: exactIndex, end: exactIndex + cleanTargetText.length };
  }

  // 策略4：规范化文本匹配（最后备选）
  const normalizedDocText = normalizeText(cleanDocText);
  const normalizedTargetText = normalizeText(cleanTargetText);
  const normalizedIndex = normalizedDocText.indexOf(normalizedTargetText);

  if (normalizedIndex !== -1) {
    // 映射回原始位置（使用第一个单词作为锚点）
    const firstWord = normalizedTargetText
      .split(" ")
      .filter((w) => w.length > 0)[0];
    if (firstWord) {
      const firstWordIndex = cleanDocText.indexOf(firstWord);
      if (firstWordIndex !== -1) {
        return {
          start: firstWordIndex,
          end: firstWordIndex + cleanTargetText.length,
        };
      }
    }
  }

  // 策略5（技术文档可行方案补充）：忽略换行差异匹配
  // 后端 context/original 可能含换行，前端块间换行可能与后端行结构不一致，导致精确匹配失败
  const docFlat = cleanDocTextForSearch.replace(/\n/g, " ");
  const targetFlat = cleanTargetText.replace(/\n/g, " ");
  const flatIndex = docFlat.indexOf(targetFlat);
  if (flatIndex !== -1) {
    const flatEndExclusive = flatIndex + targetFlat.length;
    const ourStart = flatPosToOurPos(cleanDocTextForSearch, flatIndex);
    const ourEnd = flatPosToOurPosEnd(cleanDocTextForSearch, flatEndExclusive);
    if (
      ourStart !== -1 &&
      ourEnd !== -1 &&
      ourStart < ourEnd &&
      ourEnd <= cleanDocTextForSearch.length
    ) {
      return { start: ourStart, end: ourEnd };
    }
  }

  return null;
}

/** 将「扁平文本」中的起始下标映射回「带换行」文本中的下标 */
function flatPosToOurPos(docTextWithNewlines: string, flatPos: number): number {
  let flatCount = 0;
  for (let i = 0; i < docTextWithNewlines.length; i++) {
    if (docTextWithNewlines[i] !== "\n") {
      if (flatCount === flatPos) return i;
      flatCount++;
    }
  }
  return -1;
}

/** 将「扁平文本」中的结束下标（独占）映射为「带换行」文本中该位置之后的下标 */
function flatPosToOurPosEnd(
  docTextWithNewlines: string,
  flatEndExclusive: number
): number {
  let flatCount = 0;
  for (let i = 0; i < docTextWithNewlines.length; i++) {
    if (docTextWithNewlines[i] !== "\n") {
      flatCount++;
      if (flatCount === flatEndExclusive) return i + 1;
    }
  }
  return flatEndExclusive === 0 ? 0 : -1;
}

// 辅助函数：将规范化文本的位置映射回原始文本位置（备用）
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- 保留供映射逻辑使用
function mapNormalizedToOriginal(
  originalText: string,
  _normalizedText: string,
  normalizedIndex: number
): number {
  // 简化实现：通过计算非空白字符的数量来估算
  let normalizedCount = 0;
  for (
    let i = 0;
    i < originalText.length && normalizedCount < normalizedIndex;
    i++
  ) {
    if (!/\s/.test(originalText[i])) {
      normalizedCount++;
    }
    if (normalizedCount >= normalizedIndex) {
      return i;
    }
  }
  return normalizedIndex; // 如果无法准确映射，返回估算值
}

/**
 * 技术文档（ProseMirror Decoration 文档编辑完整方案.md）中的可行方案：
 * 使用 doc.textContent（无块间换行）进行 contextBasedMatch。
 * 本函数先尝试「带换行」文本（与后端 lines 一致），失败时再尝试扁平 doc.textContent。
 * 返回 ProseMirror 文档位置范围 { start, end }，便于调用方直接使用。
 */
function findTextRangeWithFallback(
  doc: any,
  docTextWithNewlines: string,
  ourToDocPos: number[],
  targetText: string,
  contextBefore: string | null | undefined,
  contextAfter: string | null | undefined,
  startLine: number,
  endLine: number,
  oldLines: string[]
): { start: number; end: number } | null {
  let textRange = findTextInDocument(
    docTextWithNewlines,
    targetText,
    contextBefore,
    contextAfter,
    startLine,
    endLine,
    oldLines
  );
  if (textRange) {
    const { docStart, docEnd } = mapOurPosToDocPos(
      ourToDocPos,
      textRange.start,
      textRange.end
    );
    const range = findTextRangeInDoc(doc, docStart, docEnd);
    return range;
  }
  const flatDocText = doc.textContent ?? "";
  if (flatDocText.length === 0) return null;
  textRange = findTextInDocument(
    flatDocText,
    targetText,
    contextBefore,
    contextAfter,
    startLine,
    endLine,
    oldLines
  );
  if (textRange) {
    const range = findTextRangeInDoc(doc, textRange.start, textRange.end);
    return range;
  }
  return null;
}

// 在旧内容中查找文本位置（用于定位要删除的内容）- 保留兼容性
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- 保留供外部/测试使用
function findTextInOldContent(
  oldText: string,
  searchText: string,
  startLine: number,
  endLine: number
): number | null {
  const lines = oldText.split("\n");
  const result = findTextInDocument(
    oldText,
    searchText,
    null,
    null,
    startLine,
    endLine,
    lines
  );
  return result ? result.start : null;
}

// ⚠️ 新增：定位表格（使用唯一标识符）
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- 保留供表格 diff 使用
function locateTable(
  identifier: string,
  doc: any
): { found: boolean; position: number; node: any } | null {
  const candidates: Array<{ pos: number; node: any; score: number }> = [];

  doc.descendants((node: any, pos: number) => {
    if (node.type.name === "table") {
      const score = calculateTableMatchScore(node, pos, identifier, doc);
      if (score > 0.5) {
        candidates.push({ pos, node, score });
      }
    }
  });

  if (candidates.length > 0) {
    const best = candidates.reduce((a, b) => (a.score > b.score ? a : b));
    return { found: true, position: best.pos, node: best.node };
  }

  return null;
}

// ⚠️ 新增：计算表格匹配分数
function calculateTableMatchScore(
  tableNode: any,
  position: number,
  identifier: string,
  doc: any
): number {
  let score = 0;

  // 提取表格内容
  let tableContent = "";
  tableNode.forEach((row: any) => {
    row.forEach((cell: any) => {
      tableContent += cell.textContent + "|";
    });
    tableContent += "\n";
  });

  const contentHash = hashString(tableContent);
  if (identifier.includes(contentHash)) {
    score += 0.5;
  }

  const rowCount = tableNode.childCount;
  const firstRowCells = tableNode.firstChild?.childCount || 0;
  const structure = `${rowCount}x${firstRowCells}`;
  if (identifier.includes(structure)) {
    score += 0.3;
  }

  const context = getContextAround(position, 50, doc);
  const contextHash = hashString(context);
  if (identifier.includes(contextHash)) {
    score += 0.2;
  }

  return score;
}

// ⚠️ 新增：定位图片（使用唯一标识符）
function locateImage(
  identifier: string,
  doc: any
): { found: boolean; position: number; node: any } | null {
  const candidates: Array<{ pos: number; node: any; score: number }> = [];

  doc.descendants((node: any, pos: number) => {
    if (node.type.name === "image") {
      const score = calculateImageMatchScore(node, pos, identifier, doc);
      if (score > 0.5) {
        candidates.push({ pos, node, score });
      }
    }
  });

  if (candidates.length > 0) {
    const best = candidates.reduce((a, b) => (a.score > b.score ? a : b));
    return { found: true, position: best.pos, node: best.node };
  }

  return null;
}

// ⚠️ 新增：计算图片匹配分数
function calculateImageMatchScore(
  imageNode: any,
  position: number,
  identifier: string,
  doc: any
): number {
  let score = 0;

  const src = imageNode.attrs.src || "";
  if (src) {
    const urlHash = hashString(src);
    if (identifier.includes(urlHash)) {
      score += 0.6;
    }
  }

  const context = getContextAround(position, 100, doc);
  const contextHash = hashString(context);
  if (identifier.includes(contextHash)) {
    score += 0.4;
  }

  return score;
}

// ⚠️ 新增：字符串哈希函数
function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

// ⚠️ 新增：获取位置周围的上下文
function getContextAround(position: number, chars: number, doc: any): string {
  const start = Math.max(0, position - chars);
  const end =
    doc && doc.content && typeof doc.content.size === "number"
      ? Math.min(doc.content.size, position + chars)
      : position + chars;
  return doc.textBetween(start, end);
}

// ⚠️ 阶段三：处理表格 Diff（单元格级比对）
function handleTableDiff(diff: Diff, doc: any): Decoration[] {
  const decorations: Decoration[] = [];

  // 定位表格
  let tablePos: number | null = null;
  let tableNode: any = null;

  if (diff.element_identifier) {
    const located = locateTable(diff.element_identifier, doc);
    if (located && located.found) {
      tablePos = located.position;
      tableNode = located.node;
    }
  } else if (diff.from !== undefined) {
    let node = null;
    try {
      if (doc && typeof doc.nodeAt === "function") {
        node = doc.nodeAt(diff.from);
      }
    } catch (error) {
      console.warn("[DiffHighlightExtension] nodeAt 调用失败", error);
    }
    if (node && node.type && node.type.name === "table") {
      tablePos = diff.from;
      tableNode = node;
    }
  }

  if (!tablePos || !tableNode) {
    console.warn("[DiffHighlightExtension] ⚠️ 未找到表格节点", {
      diffId: diff.diff_id,
      elementIdentifier: diff.element_identifier,
    });
    return decorations;
  }

  // 解析表格内容（从 original_code 和 new_code）
  // 假设 original_code 和 new_code 包含表格的 JSON 表示或 HTML
  try {
    // 如果是 Edit 操作，标记整个表格为修改
    if (diff.diff_type === "Edit") {
      decorations.push(
        Decoration.node(tablePos, tablePos + tableNode.nodeSize, {
          class: "diff-table-modified",
          style:
            "border: 2px solid rgba(251, 191, 36, 0.6); background-color: rgba(251, 191, 36, 0.1);",
          "data-diff-id": diff.diff_id,
        })
      );

      // ⚠️ 阶段三：单元格级比对（如果提供了单元格信息）
      // 这里可以进一步解析 original_code 和 new_code，找出具体修改的单元格
      // 简化实现：标记整个表格，后续可以增强
    } else if (diff.diff_type === "Insertion") {
      // 插入新表格
      decorations.push(
        Decoration.node(tablePos, tablePos + tableNode.nodeSize, {
          class: "diff-table-insertion",
          style:
            "border: 2px solid rgba(34, 197, 94, 0.6); background-color: rgba(34, 197, 94, 0.1);",
          "data-diff-id": diff.diff_id,
        })
      );
    } else if (diff.diff_type === "Deletion") {
      // 删除表格
      decorations.push(
        Decoration.node(tablePos, tablePos + tableNode.nodeSize, {
          class: "diff-table-deletion",
          style:
            "border: 2px solid rgba(239, 68, 68, 0.6); background-color: rgba(239, 68, 68, 0.1); opacity: 0.5;",
          "data-diff-id": diff.diff_id,
        })
      );
    }

    console.log("[DiffHighlightExtension] ✅ 添加表格 Diff 标记", {
      position: tablePos,
      diffId: diff.diff_id,
      diffType: diff.diff_type,
    });
  } catch (error) {
    console.warn("[DiffHighlightExtension] ❌ 处理表格 Diff 失败:", error);
  }

  return decorations;
}

// ⚠️ 阶段三：定位表格单元格
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- 保留供表格 diff 使用
function locateTableCell(
  tablePos: number,
  rowIndex: number,
  colIndex: number,
  doc: any
): { found: boolean; position: number; node: any } | null {
  let tableNode = null;
  try {
    if (doc && typeof doc.nodeAt === "function") {
      tableNode = doc.nodeAt(tablePos);
    }
  } catch (error) {
    console.warn("[DiffHighlightExtension] nodeAt 调用失败", error);
  }

  if (!tableNode || !tableNode.type || tableNode.type.name !== "table") {
    return null;
  }

  // 找到目标行
  let currentPos = tablePos + 1;
  let rowNode = tableNode.firstChild;

  for (let i = 0; i < rowIndex && rowNode; i++) {
    currentPos += rowNode.nodeSize;
    rowNode = rowNode.nextSibling;
  }

  if (!rowNode) {
    return null;
  }

  // 找到目标单元格
  let cellNode = rowNode.firstChild;
  let cellPos = currentPos + 1;

  for (let j = 0; j < colIndex && cellNode; j++) {
    cellPos += cellNode.nodeSize;
    cellNode = cellNode.nextSibling;
  }

  if (!cellNode) {
    return null;
  }

  return {
    found: true,
    position: cellPos,
    node: cellNode,
  };
}

// ⚠️ 阶段三：处理图片 Diff
function handleImageDiff(diff: Diff, doc: any): Decoration[] {
  const decorations: Decoration[] = [];

  // 定位图片
  let imagePos: number | null = null;
  let imageNode: any = null;

  if (diff.element_identifier) {
    const located = locateImage(diff.element_identifier, doc);
    if (located && located.found) {
      imagePos = located.position;
      imageNode = located.node;
    }
  } else if (diff.from !== undefined) {
    const node = doc.nodeAt(diff.from);
    if (node && node.type.name === "image") {
      imagePos = diff.from;
      imageNode = node;
    }
  }

  if (!imagePos || !imageNode) {
    console.warn("[DiffHighlightExtension] ⚠️ 未找到图片节点", {
      diffId: diff.diff_id,
      elementIdentifier: diff.element_identifier,
    });
    return decorations;
  }

  // 创建图片对比 Widget
  const oldSrc = diff.element_identifier || imageNode.attrs.src || "";
  const newSrc = diff.new_code || imageNode.attrs.src || "";

  const widget = createImageCompareWidget(oldSrc, newSrc);
  decorations.push(
    Decoration.widget(imagePos, widget, {
      side: 0,
      ignoreSelection: true,
    })
  );

  console.log("[DiffHighlightExtension] ✅ 添加图片 Diff 标记", {
    position: imagePos,
    diffId: diff.diff_id,
  });

  return decorations;
}

// ⚠️ 阶段三：处理代码块 Diff（行级 Diff）
function handleCodeBlockDiff(diff: Diff, doc: any): Decoration[] {
  const decorations: Decoration[] = [];

  // 定位代码块
  let codeBlockPos: number | null = null;
  let codeBlockNode: any = null;

  // 尝试通过 element_identifier 定位
  if (diff.element_identifier) {
    // 可以解析 identifier 获取代码块位置信息
    // 简化实现：遍历查找代码块
    doc.descendants((node: any, pos: number) => {
      if (node.type.name === "codeBlock") {
        const nodeText = node.textContent;
        // 检查是否包含 original_code 的内容
        if (nodeText.includes(diff.original_code.substring(0, 50))) {
          codeBlockPos = pos;
          codeBlockNode = node;
          return false; // 停止遍历
        }
      }
      return true;
    });
  } else if (diff.from !== undefined) {
    const node = doc.nodeAt(diff.from);
    if (node && node.type.name === "codeBlock") {
      codeBlockPos = diff.from;
      codeBlockNode = node;
    }
  }

  if (!codeBlockPos || !codeBlockNode) {
    console.warn("[DiffHighlightExtension] ⚠️ 未找到代码块节点", {
      diffId: diff.diff_id,
    });
    return decorations;
  }

  // 行级 Diff：比较 original_code 和 new_code
  const oldLines = diff.original_code.split("\n");
  const newLines = diff.new_code.split("\n");

  // 使用简单的行级比对（类似 Git diff）
  let currentTextPos = codeBlockPos + 1; // 代码块内容从 pos + 1 开始

  // 遍历代码块内容，标记修改的行
  codeBlockNode.forEach((node: any, offset: number) => {
    if (node.isText) {
      const text = node.text;
      const lines = text.split("\n");

      for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i];
        const lineStartPos = currentTextPos + offset;
        const lineEndPos = lineStartPos + line.length;

        // 检查这一行是否被修改（简化实现：按行号比对）
        const lineIndex = i;
        if (lineIndex < oldLines.length && lineIndex < newLines.length) {
          if (oldLines[lineIndex] !== newLines[lineIndex]) {
            // 标记为修改行
            decorations.push(
              Decoration.inline(lineStartPos, lineEndPos, {
                class: "diff-code-modified",
                style:
                  "background-color: rgba(251, 191, 36, 0.2); border-left: 3px solid rgba(251, 191, 36, 0.6); padding-left: 4px;",
                "data-diff-id": diff.diff_id,
                "data-line-number": String(lineIndex + 1),
              })
            );
          }
        } else if (
          lineIndex >= oldLines.length &&
          lineIndex < newLines.length
        ) {
          // 新增行
          decorations.push(
            Decoration.inline(lineStartPos, lineEndPos, {
              class: "diff-code-added",
              style:
                "background-color: rgba(34, 197, 94, 0.2); border-left: 3px solid rgba(34, 197, 94, 0.6); padding-left: 4px;",
              "data-diff-id": diff.diff_id,
              "data-line-number": String(lineIndex + 1),
            })
          );
        } else if (
          lineIndex < oldLines.length &&
          lineIndex >= newLines.length
        ) {
          // 删除行
          decorations.push(
            Decoration.inline(lineStartPos, lineEndPos, {
              class: "diff-code-deleted",
              style:
                "background-color: rgba(239, 68, 68, 0.2); border-left: 3px solid rgba(239, 68, 68, 0.6); padding-left: 4px; text-decoration: line-through;",
              "data-diff-id": diff.diff_id,
              "data-line-number": String(lineIndex + 1),
            })
          );
        }
      }

      currentTextPos += text.length;
    }
  });

  // 如果整个代码块被替换，标记整个代码块
  if (diff.diff_type === "Edit" && decorations.length === 0) {
    decorations.push(
      Decoration.node(codeBlockPos, codeBlockPos + codeBlockNode.nodeSize, {
        class: "diff-code-block-modified",
        style:
          "border: 2px solid rgba(251, 191, 36, 0.6); background-color: rgba(251, 191, 36, 0.1);",
        "data-diff-id": diff.diff_id,
      })
    );
  }

  console.log("[DiffHighlightExtension] ✅ 添加代码块 Diff 标记", {
    position: codeBlockPos,
    diffId: diff.diff_id,
    linesMarked: decorations.length,
  });

  return decorations;
}

// ⚠️ 阶段三：处理跨节点 Diff（分解为多个 Decoration，维护逻辑关联性）
function handleCrossNodeDiff(diff: Diff, doc: any): Decoration[] {
  const decorations: Decoration[] = [];

  // 跨节点 Diff 通常发生在：
  // 1. 修改跨越多个段落
  // 2. 修改跨越表格和文本
  // 3. 修改跨越代码块和文本

  // 策略：将跨节点的修改分解为多个节点级的 Decoration
  // 每个节点使用独立的 Decoration，但通过 diff_id 关联

  // 查找所有涉及的节点
  const startPos = diff.from || 0;
  const endPos =
    diff.to ||
    (doc && doc.content && typeof doc.content.size === "number"
      ? doc.content.size
      : 0);

  // 遍历范围内的所有节点
  doc.nodesBetween(startPos, endPos, (node: any, pos: number) => {
    // 为每个节点创建 Decoration
    if (node.isBlock) {
      // 块级节点：使用 node Decoration
      decorations.push(
        Decoration.node(pos, pos + node.nodeSize, {
          class: "diff-cross-node",
          style:
            "border: 2px dashed rgba(251, 191, 36, 0.5); background-color: rgba(251, 191, 36, 0.05);",
          "data-diff-id": diff.diff_id,
          "data-node-type": node.type.name,
        })
      );
    } else if (node.isText) {
      // 文本节点：使用 inline Decoration
      const nodeStart = pos + 1; // 文本节点内容从 pos + 1 开始
      const nodeEnd = nodeStart + node.text.length;

      decorations.push(
        Decoration.inline(nodeStart, nodeEnd, {
          class: "diff-cross-node-text",
          style: "background-color: rgba(251, 191, 36, 0.2);",
          "data-diff-id": diff.diff_id,
        })
      );
    }
  });

  console.log("[DiffHighlightExtension] ✅ 添加跨节点 Diff 标记", {
    diffId: diff.diff_id,
    decorationsCount: decorations.length,
    from: startPos,
    to: endPos,
  });

  return decorations;
}

// ⚠️ 阶段四：增量更新 Decoration（避免重建整个 DecorationSet）
function updateDecorationsIncrementally(
  oldDecorations: DecorationSet,
  newDiffs: Diff[],
  doc: any,
  oldContent: string | null,
  newContent: string | null
): DecorationSet | null {
  if (!oldContent || !newContent || !newDiffs || newDiffs.length === 0) {
    return null;
  }

  // 1. 获取现有装饰的 diff_id 集合
  const existingDiffIds = new Set<string>();
  oldDecorations.find().forEach((decoration) => {
    const diffId = decoration.spec["data-diff-id"];
    if (diffId) {
      existingDiffIds.add(diffId);
    }
  });

  // 2. 找出新增的 diff
  const newDiffIds = new Set(newDiffs.map((d) => d.diff_id));
  const addedDiffs = newDiffs.filter((d) => !existingDiffIds.has(d.diff_id));
  const removedDiffIds = Array.from(existingDiffIds).filter(
    (id) => !newDiffIds.has(id)
  );

  // 3. 如果没有变化，返回现有装饰
  if (addedDiffs.length === 0 && removedDiffIds.length === 0) {
    return oldDecorations;
  }

  // 4. 移除已删除的 diff 的装饰
  let decorations = oldDecorations;
  if (removedDiffIds.length > 0) {
    const toRemove: Decoration[] = [];
    oldDecorations.find().forEach((decoration) => {
      const diffId = decoration.spec["data-diff-id"];
      if (diffId && removedDiffIds.includes(diffId)) {
        toRemove.push(decoration);
      }
    });

    if (toRemove.length > 0) {
      decorations = decorations.remove(toRemove);
    }
  }

  // 5. 为新 diff 创建装饰（简化实现：只处理文本 diff）；使用「带换行」doc 文本以与后端 context 一致
  const newDecorations: Decoration[] = [];
  const { text: docText, ourToDocPos } = getDocTextWithNewlines(doc);
  const oldText = oldContent.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ");
  const oldLines = oldText.split("\n");

  for (const diff of addedDiffs) {
    if (diff.element_type === "text" || !diff.element_type) {
      const cleanOriginalCode = stripHtmlTags(
        (diff.original_code || "").trim()
      );
      if (!cleanOriginalCode.length) continue;
      const range = findTextRangeWithFallback(
        doc,
        docText,
        ourToDocPos,
        cleanOriginalCode,
        diff.context_before,
        diff.context_after,
        diff.original_start_line,
        diff.original_end_line,
        oldLines
      );

      if (range) {
        const adj = ensureDeletionRangeLength(doc, range, cleanOriginalCode.length);
        newDecorations.push(
          Decoration.inline(adj.start, adj.end, {
            class: "diff-deletion",
            style:
              "background-color: rgba(239, 68, 68, 0.2); text-decoration: line-through;",
            "data-diff-id": diff.diff_id,
          })
        );
      }
    }
  }

  // 6. 合并新旧装饰
  if (newDecorations.length > 0) {
    return decorations.add(doc, newDecorations);
  }

  return decorations;
}

// ⚠️ 阶段四：获取视口范围（简化实现）
function getViewportRange(doc: any): { top: number; bottom: number } {
  // 简化实现：返回整个文档范围
  // 实际实现应该从编辑器视图获取视口信息
  try {
    if (!doc || !doc.content) {
      return { top: 0, bottom: 0 };
    }
    return {
      top: 0,
      bottom: doc.content.size || 0,
    };
  } catch (error) {
    console.warn("[DiffHighlightExtension] getViewportRange 失败", error);
    return { top: 0, bottom: 0 };
  }
}

// ⚠️ 阶段四：过滤可见的 diff
function filterVisibleDiffs(
  diffs: Diff[],
  viewport: { top: number; bottom: number },
  _doc: unknown
): Diff[] {
  // 简化实现：返回所有已定位的 diff
  // 实际实现应该检查每个 diff 的位置是否在视口内
  try {
    if (!diffs || !Array.isArray(diffs)) {
      return [];
    }
    if (
      !viewport ||
      typeof viewport.top !== "number" ||
      typeof viewport.bottom !== "number"
    ) {
      return diffs; // 如果视口无效，返回所有 diffs
    }

    return diffs.filter((diff) => {
      if (!diff) return false;
      if (diff.from === undefined || diff.to === undefined) {
        return false; // 未定位的 diff 不处理
      }

      // 检查 diff 是否与视口重叠
      return !(diff.to < viewport.top || diff.from > viewport.bottom);
    });
  } catch (error) {
    console.warn("[DiffHighlightExtension] filterVisibleDiffs 失败", error);
    return diffs || []; // 如果失败，返回原始 diffs 或空数组
  }
}

// ⚠️ 阶段四：验证 Diff 数据（数据一致性检查）
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- 保留供校验流程使用
function validateDiffData(diff: Diff, doc: any): ValidationResult {
  const issues: string[] = [];

  // 1. 检查位置是否有效
  if (diff.from !== undefined && diff.to !== undefined) {
    const docSize =
      doc && doc.content && typeof doc.content.size === "number"
        ? doc.content.size
        : 0;
    if (diff.from < 1 || (docSize > 0 && diff.to > docSize)) {
      issues.push("位置超出文档范围");
    }
    if (diff.from >= diff.to) {
      issues.push("起始位置大于等于结束位置");
    }
  }

  // 2. 检查内容是否匹配（如果已定位）
  if (diff.from !== undefined && diff.to !== undefined && diff.original_code) {
    try {
      const actualContent = doc.textBetween(diff.from, diff.to);
      const normalizedActual = normalizeText(actualContent);
      const normalizedOriginal = normalizeText(diff.original_code);

      // 允许一定的差异（由于格式标记等）
      // 简单的相似度计算：计算相同字符的比例
      const minLen = Math.min(
        normalizedActual.length,
        normalizedOriginal.length
      );
      const maxLen = Math.max(
        normalizedActual.length,
        normalizedOriginal.length
      );
      let matches = 0;
      for (let i = 0; i < minLen; i++) {
        if (normalizedActual[i] === normalizedOriginal[i]) {
          matches++;
        }
      }
      const similarity = maxLen > 0 ? matches / maxLen : 0;
      if (similarity < 0.7) {
        issues.push(
          `文档内容与原始内容不匹配（相似度: ${(similarity * 100).toFixed(1)}%）`
        );
      }
    } catch (error) {
      issues.push(`验证内容时出错: ${error}`);
    }
  }

  // 3. 检查置信度
  if (diff.confidence !== undefined && diff.confidence < 0.7) {
    issues.push("置信度过低，建议用户确认");
  }

  // 4. 检查必需字段
  if (!diff.diff_id) {
    issues.push("缺少 diff_id");
  }
  if (!diff.diff_type) {
    issues.push("缺少 diff_type");
  }
  if (!diff.original_code && diff.diff_type !== "Insertion") {
    issues.push("缺少 original_code");
  }
  if (!diff.new_code && diff.diff_type !== "Deletion") {
    issues.push("缺少 new_code");
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

// ⚠️ 阶段四：验证结果接口
interface ValidationResult {
  valid: boolean;
  issues: string[];
}

// ⚠️ 阶段四：异常恢复机制
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- 保留供异常恢复使用
function handleException(
  error: Error,
  context: ErrorContext,
  doc: any,
  decorations: DecorationSet
): DecorationSet {
  console.error("[DiffHighlightExtension] ❌ 处理异常:", error, context);

  // 1. 记录错误
  logError(error, context);

  // 2. 根据错误类型尝试恢复
  if (context.type === "location_failure") {
    // 定位失败：清除相关装饰，避免显示错误位置
    const invalidDecorations: Decoration[] = [];
    decorations.find().forEach((decoration) => {
      const diffId = decoration.spec["data-diff-id"];
      if (diffId === context.diffId) {
        invalidDecorations.push(decoration);
      }
    });

    if (invalidDecorations.length > 0) {
      return decorations.remove(invalidDecorations);
    }
  } else if (context.type === "apply_failure") {
    // 应用失败：保持现有装饰不变
    console.warn("[DiffHighlightExtension] ⚠️ 应用失败，保持现有状态");
  } else if (context.type === "render_failure") {
    // 渲染失败：清除所有装饰
    console.warn("[DiffHighlightExtension] ⚠️ 渲染失败，清除所有装饰");
    return DecorationSet.empty;
  } else if (context.type === "validation_failure") {
    // 验证失败：清除无效装饰
    const invalidDecorations: Decoration[] = [];
    decorations.find().forEach((decoration) => {
      const diffId = decoration.spec["data-diff-id"];
      if (diffId === context.diffId) {
        invalidDecorations.push(decoration);
      }
    });

    if (invalidDecorations.length > 0) {
      return decorations.remove(invalidDecorations);
    }
  }

  // 3. 如果无法恢复，返回空装饰集
  return DecorationSet.empty;
}

// ⚠️ 阶段四：错误上下文接口
interface ErrorContext {
  type:
    | "location_failure"
    | "apply_failure"
    | "render_failure"
    | "validation_failure";
  diffId?: string;
  message?: string;
  details?: any;
}

// ⚠️ 阶段四：记录错误
function logError(error: Error, context: ErrorContext): void {
  // 在实际应用中，这里可以发送错误日志到服务器
  console.error("[DiffHighlightExtension] 错误日志:", {
    error: error.message,
    stack: error.stack,
    context,
    timestamp: new Date().toISOString(),
  });
}

// ⚠️ 新增：创建图片对比 Widget
function createImageCompareWidget(oldSrc: string, newSrc: string): HTMLElement {
  const container = document.createElement("div");
  container.className = "diff-image-compare";
  container.style.cssText =
    "display: flex; gap: 16px; padding: 16px; background: #f9f9f9; border: 2px solid #fbbf24; border-radius: 8px;";

  const oldDiv = document.createElement("div");
  oldDiv.style.cssText = "flex: 1;";
  const oldLabel = document.createElement("div");
  oldLabel.textContent = "删除";
  oldLabel.style.cssText =
    "font-size: 12px; color: #dc2626; font-weight: 600; margin-bottom: 8px;";
  const oldImg = document.createElement("img");
  oldImg.src = oldSrc;
  oldImg.style.cssText = "width: 100%; opacity: 0.5;";
  oldDiv.appendChild(oldLabel);
  oldDiv.appendChild(oldImg);

  const newDiv = document.createElement("div");
  newDiv.style.cssText = "flex: 1;";
  const newLabel = document.createElement("div");
  newLabel.textContent = "新增";
  newLabel.style.cssText =
    "font-size: 12px; color: #16a34a; font-weight: 600; margin-bottom: 8px;";
  const newImg = document.createElement("img");
  newImg.src = newSrc;
  newImg.style.cssText = "width: 100%;";
  newDiv.appendChild(newLabel);
  newDiv.appendChild(newImg);

  container.appendChild(oldDiv);
  container.appendChild(newDiv);

  return container;
}

// ⚠️ 阶段二：相似度计算（Levenshtein 距离）
function similarity(str1: string, str2: string): number {
  if (str1 === str2) return 1.0;
  if (str1.length === 0 || str2.length === 0) return 0.0;

  const maxLen = Math.max(str1.length, str2.length);
  const distance = levenshteinDistance(str1, str2);
  return 1 - distance / maxLen;
}

function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[str2.length][str1.length];
}

// ⚠️ 阶段二：模糊匹配（相似度阈值）
function fuzzyContentMatch(
  diff: Diff,
  _doc: any,
  docText: string
): { start: number; end: number; confidence: number; strategy: string } | null {
  const threshold = 0.7; // 相似度阈值
  const cleanTargetText = stripHtmlTags(diff.original_code.trim());
  const cleanContextBefore = diff.context_before
    ? stripHtmlTags(diff.context_before)
    : null;
  const cleanContextAfter = diff.context_after
    ? stripHtmlTags(diff.context_after)
    : null;

  let bestMatch: {
    start: number;
    end: number;
    confidence: number;
    strategy: string;
  } | null = null;
  let bestScore = 0;

  // 使用滑动窗口查找相似内容
  const windowSize = Math.max(cleanTargetText.length * 2, 100);
  const step = Math.floor(cleanTargetText.length / 2);

  for (let i = 0; i <= docText.length - cleanTargetText.length / 2; i += step) {
    const window = docText.substring(
      i,
      Math.min(i + windowSize, docText.length)
    );
    const sim = similarity(cleanTargetText, window);

    if (sim > threshold && sim > bestScore) {
      // 检查上下文
      const beforeText = docText.substring(Math.max(0, i - 50), i);
      const afterText = docText.substring(
        i + window.length,
        Math.min(i + window.length + 50, docText.length)
      );

      const beforeScore = cleanContextBefore
        ? similarity(cleanContextBefore, beforeText)
        : 1.0;
      const afterScore = cleanContextAfter
        ? similarity(cleanContextAfter, afterText)
        : 1.0;

      const contextScore = (beforeScore + afterScore) / 2;
      const finalScore = sim * 0.7 + contextScore * 0.3;

      if (finalScore > bestScore && finalScore > threshold) {
        bestScore = finalScore;
        // 在窗口中找到最匹配的位置
        const windowIndex = window.indexOf(
          cleanTargetText.substring(0, Math.min(20, cleanTargetText.length))
        );
        const matchStart = i + (windowIndex !== -1 ? windowIndex : 0);

        bestMatch = {
          start: matchStart,
          end: matchStart + cleanTargetText.length,
          confidence: finalScore,
          strategy: "fuzzyContentMatch",
        };
      }
    }
  }

  return bestMatch;
}

// ⚠️ 阶段二：结构位置匹配（"第N段第M句"）
function structuralMatch(
  diff: Diff,
  doc: any,
  _docText: string
): { start: number; end: number; confidence: number; strategy: string } | null {
  const cleanTargetText = stripHtmlTags(diff.original_code.trim());
  const cleanContextBefore = diff.context_before
    ? stripHtmlTags(diff.context_before)
    : null;

  // 如果提供了结构信息（如"第2段"），使用结构匹配
  if (cleanContextBefore) {
    // 解析结构信息（简化示例）
    const paragraphMatch = cleanContextBefore.match(/第(\d+)段/);
    if (paragraphMatch) {
      const paragraphIndex = parseInt(paragraphMatch[1]) - 1;

      // 查找第N个段落
      let paragraphCount = 0;
      let targetParagraphPos: number | null = null;

      doc.descendants((node: any, pos: number) => {
        if (node.type.name === "paragraph") {
          if (paragraphCount === paragraphIndex) {
            targetParagraphPos = pos;
            return false; // 停止遍历
          }
          paragraphCount++;
        }
        return true;
      });

      if (targetParagraphPos !== null) {
        const paragraphNode = doc.nodeAt(targetParagraphPos);
        if (paragraphNode) {
          // 在段落内查找目标内容
          const paragraphText = paragraphNode.textContent;
          const index = paragraphText.indexOf(cleanTargetText);

          if (index !== -1) {
            // 转换为文档位置
            const range = findTextRangeInDoc(
              doc,
              targetParagraphPos + 1 + index,
              targetParagraphPos + 1 + index + cleanTargetText.length
            );
            if (range) {
              return {
                start: range.start,
                end: range.end,
                confidence: 0.9,
                strategy: "structuralMatch",
              };
            }
          }
        }
      }
    }
  }

  return null;
}

// ⚠️ 阶段二：查找候选位置（用于低置信度匹配）
// ourToDocPos：当 docText 为「带换行」文本时传入，用于将 index 映射为 doc 纯文本位置
function findCandidateLocations(
  diff: Diff,
  doc: any,
  docText: string,
  ourToDocPos?: number[]
): Array<{ start: number; end: number; context: string; confidence: number }> {
  const cleanTargetText = stripHtmlTags(diff.original_code.trim());
  const candidates: Array<{
    start: number;
    end: number;
    context: string;
    confidence: number;
  }> = [];

  // ⚠️ 关键修复：如果目标文本太长（超过文档的50%），拒绝匹配，避免标红全文
  const docLength = docText.length;
  const targetLength = cleanTargetText.length;
  if (targetLength > docLength * 0.5) {
    console.warn("[findCandidateLocations] ⚠️ 目标文本过长，拒绝匹配", {
      targetLength,
      docLength,
      ratio: ((targetLength / docLength) * 100).toFixed(1) + "%",
    });
    return [];
  }

  // ⚠️ 关键修复：如果目标文本太短（少于5个字符），也拒绝匹配，避免误匹配
  if (targetLength < 5) {
    console.warn("[findCandidateLocations] ⚠️ 目标文本过短，拒绝匹配", {
      targetLength,
      targetText: cleanTargetText.substring(0, 20),
    });
    return [];
  }

  // 查找所有包含目标文本的位置（index 在 docText 中，若 docText 带换行则需映射）
  let index = 0;
  while ((index = docText.indexOf(cleanTargetText, index)) !== -1) {
    const contextStart = Math.max(0, index - 50);
    const contextEnd = Math.min(
      docText.length,
      index + cleanTargetText.length + 50
    );
    const context = docText.substring(contextStart, contextEnd);

    const textEnd = index + cleanTargetText.length;
    const docStart = ourToDocPos
      ? mapOurPosToDocPos(ourToDocPos, index, textEnd).docStart
      : index;
    const docEnd = ourToDocPos
      ? mapOurPosToDocPos(ourToDocPos, index, textEnd).docEnd
      : textEnd;
    const range = findTextRangeInDoc(doc, docStart, docEnd);
    if (range) {
      // ⚠️ 关键修复：计算置信度，基于上下文匹配度
      let confidence = 0.5;

      // 如果提供了上下文，计算上下文匹配度
      if (diff.context_before || diff.context_after) {
        const beforeText = docText.substring(Math.max(0, index - 100), index);
        const afterText = docText.substring(
          index + cleanTargetText.length,
          Math.min(index + cleanTargetText.length + 100, docText.length)
        );

        if (diff.context_before) {
          const beforeSim = similarity(
            stripHtmlTags(diff.context_before),
            beforeText
          );
          confidence = Math.max(confidence, beforeSim * 0.6);
        }

        if (diff.context_after) {
          const afterSim = similarity(
            stripHtmlTags(diff.context_after),
            afterText
          );
          confidence = Math.max(confidence, afterSim * 0.6);
        }
      }

      candidates.push({
        start: range.start,
        end: range.end,
        context,
        confidence,
      });
    }

    index += cleanTargetText.length;
  }

  // ⚠️ 关键修复：按置信度排序，返回最合理的候选
  candidates.sort((a, b) => b.confidence - a.confidence);

  return candidates;
}

// ⚠️ 阶段二：计算置信度评分
function calculateConfidence(
  matchResult: { start: number; end: number; strategy: string },
  diff: Diff,
  _doc: any,
  docText: string
): number {
  let confidence = 0.5; // 基础置信度

  // 根据策略调整置信度
  switch (matchResult.strategy) {
    case "contextBasedMatch":
      confidence = 0.9;
      break;
    case "exactContentMatch":
      confidence = 0.95;
      break;
    case "fuzzyContentMatch":
      confidence = 0.75;
      break;
    case "structuralMatch":
      confidence = 0.85;
      break;
    case "lineNumberMatch":
      confidence = 0.7;
      break;
    default:
      confidence = 0.5;
  }

  // 验证上下文匹配度
  if (diff.context_before || diff.context_after) {
    const beforeText = docText.substring(
      Math.max(0, matchResult.start - 50),
      matchResult.start
    );
    const afterText = docText.substring(
      matchResult.end,
      Math.min(matchResult.end + 50, docText.length)
    );

    if (diff.context_before) {
      const beforeSim = similarity(
        stripHtmlTags(diff.context_before),
        beforeText
      );
      confidence = confidence * 0.7 + beforeSim * 0.3;
    }

    if (diff.context_after) {
      const afterSim = similarity(stripHtmlTags(diff.context_after), afterText);
      confidence = confidence * 0.7 + afterSim * 0.3;
    }
  }

  return Math.min(1.0, Math.max(0.0, confidence));
}

export const DiffHighlightExtension = Extension.create<DiffHighlightOptions>({
  name: "diffHighlight",

  addOptions() {
    return {
      getDiffs: () => null,
      getOldContent: () => null,
      getNewContent: () => null,
      onApplyDiff: () => {},
      onRejectDiff: () => {},
    };
  },

  // ⚠️ 阶段四：性能优化配置
  addGlobalAttributes() {
    return [
      {
        types: ["paragraph", "heading"],
        attributes: {
          "data-diff-performance": {
            default: "normal", // 'normal' | 'optimized'
          },
        },
      },
    ];
  },

  addProseMirrorPlugins() {
    const {
      getDiffs,
      getOldContent,
      getNewContent,
      onApplyDiff,
      onRejectDiff,
    } = this.options;

    return [
      new Plugin({
        key: diffHighlightPluginKey,
        state: {
          init() {
            return DecorationSet.empty;
          },
          apply(tr, set, _oldState, newState) {
            // 添加顶层错误处理，防止任何错误导致闪退
            try {
              // 安全获取数据，防止函数调用失败
              let diffs: Diff[] | null = null;
              let oldContent: string | null = null;
              let newContent: string | null = null;

              try {
                diffs = getDiffs();
              } catch (error) {
                console.error(
                  "[DiffHighlightExtension] 获取 diffs 失败",
                  error
                );
              }

              try {
                oldContent = getOldContent();
              } catch (error) {
                console.error(
                  "[DiffHighlightExtension] 获取 oldContent 失败",
                  error
                );
              }

              try {
                newContent = getNewContent();
              } catch (error) {
                console.error(
                  "[DiffHighlightExtension] 获取 newContent 失败",
                  error
                );
              }

              const isDiffUpdate = tr.getMeta("diffUpdate") === true;
              const isDiffCleared = tr.getMeta("diffCleared") === true;
              const documentChangeMeta = tr.getMeta("documentChange");

              // ⚠️ 关键修复：检测 applyDiff meta，如果存在，调用 onApplyDiff
              const shouldApplyDiff = tr.getMeta("applyDiff") === true;
              if (shouldApplyDiff) {
                try {
                  console.log(
                    "[DiffHighlightExtension] 检测到 applyDiff meta，调用 onApplyDiff"
                  );
                  onApplyDiff?.();
                  // 注意：onApplyDiff 会自己处理 diff 应用和清除，这里不需要额外操作
                  return set; // 返回当前装饰集，onApplyDiff 会自己更新
                } catch (error) {
                  console.error(
                    "[DiffHighlightExtension] 调用 onApplyDiff 失败",
                    error
                  );
                }
              }

              // ⚠️ 阶段四：性能优化 - 节流处理
              const shouldThrottle = tr.getMeta("throttle") === true;
              if (shouldThrottle && !isDiffUpdate && !isDiffCleared) {
                // 节流模式下，如果不是强制更新，保持现有装饰
                return set;
              }

              console.log("[DiffHighlightExtension] apply 被调用", {
                isDiffUpdate,
                docChanged: tr.docChanged,
                hasDiffs: !!(diffs && diffs.length > 0),
                diffsCount: diffs?.length || 0,
                hasOldContent: !!oldContent,
                hasNewContent: !!newContent,
                setSize:
                  set && set !== DecorationSet.empty ? set.find().length : 0,
                hasDocumentChange: !!documentChangeMeta,
                shouldThrottle,
              });

              // ⚠️ 新增：处理并发编辑（文档在 AI 处理期间发生变化）
              if (documentChangeMeta) {
                console.log(
                  "[DiffHighlightExtension] 检测到文档变化，调整 Decoration 位置",
                  documentChangeMeta
                );
                // 使用 ProseMirror 的 Mapping 自动调整 Decoration 位置
                const adjustedSet = set.map(tr.mapping, tr.doc);

                // 检查哪些 Decoration 受到影响，需要重新定位
                const affectedDecorations: Decoration[] = [];
                adjustedSet.find().forEach((decoration) => {
                  const { from, to } = decoration;
                  const changeRange = documentChangeMeta.range;

                  // 判断 Decoration 是否与变化范围重叠
                  if (
                    (from >= changeRange.from && from <= changeRange.to) ||
                    (to >= changeRange.from && to <= changeRange.to) ||
                    (from <= changeRange.from && to >= changeRange.to)
                  ) {
                    affectedDecorations.push(decoration);
                  }
                });

                // 对于受影响的 Decoration，尝试重新定位
                if (affectedDecorations.length > 0) {
                  console.warn(
                    "[DiffHighlightExtension] ⚠️ 检测到",
                    affectedDecorations.length,
                    "个 Decoration 可能失效，需要重新定位"
                  );
                  // 注意：这里只是警告，实际重新定位会在下次 diffUpdate 时进行
                  // 因为需要完整的 diff 数据才能重新定位
                }

                // 继续使用调整后的 DecorationSet
                set = adjustedSet;
              } else if (tr.docChanged && !isDiffUpdate) {
                // 如果文档发生了变化（用户编辑），且不是 diff 更新，清除 diff 高亮
                console.log(
                  "[DiffHighlightExtension] 文档变化且非 diff 更新，清除高亮"
                );
                return DecorationSet.empty;
              }

              // ⚠️ 关键修复：如果 diff 被清除（通过 meta），返回空集合
              if (isDiffCleared) {
                console.log("[DiffHighlightExtension] diff 已清除，返回空集合");
                return DecorationSet.empty;
              }

              // 如果没有 diff 数据，返回空集合
              // ⚠️ 关键修复：oldContent 和 newContent 可能是空字符串（如果文档为空），这是合法的
              // 只有当它们为 undefined 或 null 时才是错误
              if (
                !diffs ||
                diffs.length === 0 ||
                oldContent === undefined ||
                oldContent === null ||
                newContent === undefined ||
                newContent === null
              ) {
                console.log(
                  "[DiffHighlightExtension] 缺少 diff 数据，返回空集合",
                  {
                    hasDiffs: !!(diffs && diffs.length > 0),
                    diffsCount: diffs?.length || 0,
                    hasOldContent:
                      oldContent !== undefined && oldContent !== null,
                    oldContentType: typeof oldContent,
                    oldContentLength:
                      typeof oldContent === "string"
                        ? oldContent.length
                        : "N/A",
                    hasNewContent:
                      newContent !== undefined && newContent !== null,
                    newContentType: typeof newContent,
                    newContentLength:
                      typeof newContent === "string"
                        ? newContent.length
                        : "N/A",
                    // 调试：打印 getDiffs 等函数的返回值
                    getDiffsResult: diffs,
                    getOldContentResult: oldContent,
                    getNewContentResult: newContent,
                  }
                );
                return DecorationSet.empty;
              }

              // 如果是 diff 更新，需要重新计算装饰（即使文档没有变化）
              // 如果文档没有变化且不是 diff 更新，保持现有装饰
              if (!isDiffUpdate && !tr.docChanged) {
                // 但如果现有装饰为空，且我们有 diff 数据，应该创建装饰
                if (set === DecorationSet.empty || set.find().length === 0) {
                  console.log(
                    "[DiffHighlightExtension] 现有装饰为空，但有 diff 数据，重新计算"
                  );
                  // 继续执行下面的逻辑来计算装饰
                } else {
                  const setSize =
                    set === DecorationSet.empty ? 0 : set.find().length;
                  console.log("[DiffHighlightExtension] 无变化，保持现有装饰", {
                    setSize,
                  });
                  return set;
                }
              }

              const { doc } = newState;

              // 安全检查：确保 doc 有效
              if (!doc || !doc.content) {
                console.warn("[DiffHighlightExtension] doc 无效，返回空集合");
                return DecorationSet.empty;
              }

              // ⚠️ 阶段四：性能优化 - 增量更新
              // 如果已有装饰且不是强制更新，尝试增量更新
              try {
                const setSize =
                  set === DecorationSet.empty ? 0 : set.find().length;
                if (
                  setSize > 0 &&
                  !isDiffUpdate &&
                  diffs &&
                  Array.isArray(diffs) &&
                  diffs.length > 0
                ) {
                  try {
                    const incrementalDecorations =
                      updateDecorationsIncrementally(
                        set,
                        diffs,
                        doc,
                        oldContent,
                        newContent
                      );
                    if (incrementalDecorations) {
                      console.log("[DiffHighlightExtension] 使用增量更新", {
                        oldSize: setSize,
                        newSize: incrementalDecorations.find
                          ? incrementalDecorations.find().length
                          : 0,
                      });
                      return incrementalDecorations;
                    }
                  } catch (error) {
                    console.warn(
                      "[DiffHighlightExtension] 增量更新失败，继续完整更新",
                      error
                    );
                  }
                }
              } catch (error) {
                console.warn(
                  "[DiffHighlightExtension] 检查增量更新时出错",
                  error
                );
              }

              // ⚠️ 阶段四：性能优化 - 大文档虚拟滚动
              let docSize = 0;
              let isLargeDocument = false;
              try {
                if (
                  doc &&
                  doc.content &&
                  typeof doc.content.size === "number"
                ) {
                  docSize = doc.content.size;
                  isLargeDocument = docSize > 10000; // 超过 10000 字符视为大文档
                }
              } catch (error) {
                console.warn(
                  "[DiffHighlightExtension] 获取文档大小失败",
                  error
                );
              }

              // 确定要处理的 diffs（大文档时只处理可见的）
              let diffsToProcess: Diff[] =
                diffs && Array.isArray(diffs) ? diffs : [];
              if (
                isLargeDocument &&
                diffs &&
                Array.isArray(diffs) &&
                diffs.length > 0
              ) {
                try {
                  // 获取视口信息（简化实现：使用文档范围）
                  const viewport = getViewportRange(doc);
                  const visibleDiffs = filterVisibleDiffs(diffs, viewport, doc);

                  console.log("[DiffHighlightExtension] 大文档优化", {
                    docSize,
                    totalDiffs: diffs.length,
                    visibleDiffs: visibleDiffs ? visibleDiffs.length : 0,
                  });

                  // 只为可见的 diff 创建 Decoration
                  if (visibleDiffs && Array.isArray(visibleDiffs)) {
                    diffsToProcess = visibleDiffs;
                  }
                } catch (error) {
                  console.warn(
                    "[DiffHighlightExtension] 大文档优化失败，使用所有 diffs",
                    error
                  );
                  // 如果优化失败，使用所有 diffs
                  diffsToProcess = diffs;
                }
              }

              const decorations: Decoration[] = [];

              // 添加安全检查，防止空值导致闪退
              if (!oldContent || !doc) {
                console.warn(
                  "[DiffHighlightExtension] oldContent 或 doc 为空，返回空集合",
                  {
                    hasOldContent: !!oldContent,
                    hasDoc: !!doc,
                  }
                );
                return DecorationSet.empty;
              }

              // 移除 HTML 标签，获取纯文本；使用「带块间换行」的 doc 文本以与后端 context_before（含 \n）一致
              let oldText: string;
              let docText: string;
              let ourToDocPos: number[];
              try {
                oldText = oldContent
                  .replace(/<[^>]*>/g, "")
                  .replace(/&nbsp;/g, " ");
                const docTextWithNewlines = getDocTextWithNewlines(doc);
                docText = docTextWithNewlines.text;
                ourToDocPos = docTextWithNewlines.ourToDocPos;
              } catch (error) {
                console.error(
                  "[DiffHighlightExtension] 处理文本内容时出错",
                  error
                );
                return DecorationSet.empty;
              }

              // 将文档按行分割，用于行号匹配
              const oldLines = oldText.split("\n");
              const docLines = docText.split("\n");

              console.log("[DiffHighlightExtension] 开始处理 diff 高亮", {
                diffsCount: diffsToProcess.length,
                oldTextLength: oldText.length,
                docTextLength: docText.length,
                oldLinesCount: oldLines.length,
                docLinesCount: docLines.length,
                isLargeDocument,
              });

              // 处理每个 diff（添加安全检查）
              if (!diffsToProcess || !Array.isArray(diffsToProcess)) {
                console.warn(
                  "[DiffHighlightExtension] diffsToProcess 无效，返回空集合",
                  { diffsToProcess }
                );
                return DecorationSet.empty;
              }

              for (const diff of diffsToProcess) {
                try {
                  // ⚠️ 关键调试：打印完整的 original_code 和 new_code，检查是否包含 HTML 标签
                  const originalCodeRaw = diff.original_code || "";
                  const originalCodeCleaned = stripHtmlTags(originalCodeRaw);
                  const newCodeRaw = diff.new_code || "";
                  const newCodeCleaned = stripHtmlTags(newCodeRaw);

                  console.log("[DiffHighlightExtension] 处理 diff", {
                    type: diff.diff_type,
                    originalCodeRaw: originalCodeRaw.substring(0, 100),
                    originalCodeCleaned: originalCodeCleaned.substring(0, 100),
                    originalCodeLength: originalCodeRaw.length,
                    originalCodeCleanedLength: originalCodeCleaned.length,
                    hasHtmlTags: originalCodeRaw !== originalCodeCleaned,
                    newCodeRaw: newCodeRaw.substring(0, 100),
                    newCodeCleaned: newCodeCleaned.substring(0, 100),
                    originalStartLine: diff.original_start_line,
                    originalEndLine: diff.original_end_line,
                    startLine: diff.start_line,
                    endLine: diff.end_line,
                    contextBefore: diff.context_before?.substring(0, 50),
                    contextAfter: diff.context_after?.substring(0, 50),
                    hasContextBefore: !!diff.context_before,
                    hasContextAfter: !!diff.context_after,
                  });

                  // ⚠️ 整篇替换：不画删除/新增装饰，仅由预览面板显示「全文(X字)将被整体替换」
                  if (diff.element_type === "replace_whole") {
                    continue;
                  }

                  // 关键理解：编辑器显示的是 oldContent（当前文档内容）
                  // 1. 对于要删除的旧内容（original_code）：在 oldContent 中查找，标记红色删除线
                  // 2. 对于要添加的新内容（new_code）：在旧内容位置之后插入 widget，显示绿色背景

                  if (
                    diff.diff_type === "Deletion" ||
                    diff.diff_type === "Edit"
                  ) {
                    // 处理要删除的旧内容 → 红色删除线
                    if (
                      diff.original_code &&
                      diff.original_code.trim().length > 0
                    ) {
                      // ⚠️ 关键修复：确保 original_code 在匹配前移除 HTML 标签
                      // 因为后端可能返回包含 HTML 标签的 original_code，但文档中的文本是纯文本
                      const cleanOriginalCode = stripHtmlTags(
                        diff.original_code.trim()
                      );

                      if (cleanOriginalCode.length === 0) {
                        console.warn(
                          "[DiffHighlightExtension] ⚠️ original_code 移除 HTML 标签后为空，跳过高亮",
                          {
                            originalCodeRaw: diff.original_code.substring(
                              0,
                              50
                            ),
                          }
                        );
                        continue;
                      }
                      // ⚠️ 防止误改全文：original_code 超过文档 50% 时视为异常，不参与高亮/应用
                      if (
                        docText.length > 0 &&
                        cleanOriginalCode.length > docText.length * 0.5
                      ) {
                        console.warn(
                          "[DiffHighlightExtension] ⚠️ original_code 过长（超过文档 50%），跳过高亮，避免误改全文",
                          {
                            originalCodeLength: cleanOriginalCode.length,
                            docTextLength: docText.length,
                            diff_id: diff.diff_id,
                          }
                        );
                        continue;
                      }

                      // ⚠️ 阶段二：使用多策略匹配系统（按优先级尝试）
                      let matchResult: {
                        start: number;
                        end: number;
                        confidence: number;
                        strategy: string;
                      } | null = null;

                      // 策略1：上下文匹配（最准确）；失败时使用技术文档方案：扁平 doc.textContent
                      const range = findTextRangeWithFallback(
                        doc,
                        docText,
                        ourToDocPos,
                        cleanOriginalCode,
                        diff.context_before,
                        diff.context_after,
                        diff.original_start_line,
                        diff.original_end_line,
                        oldLines
                      );

                      if (range) {
                        const confidence = calculateConfidence(
                          {
                            start: range.start,
                            end: range.end,
                            strategy: "contextBasedMatch",
                          },
                          diff,
                          doc,
                          docText
                        );
                        matchResult = {
                          start: range.start,
                          end: range.end,
                          confidence,
                          strategy: "contextBasedMatch",
                        };
                      }

                      // 策略2：模糊匹配（如果上下文匹配失败）；fuzzyMatch 的 start/end 在「带换行」文本中，需映射为 doc 位置
                      if (!matchResult) {
                        const fuzzyMatch = fuzzyContentMatch(
                          diff,
                          doc,
                          docText
                        );
                        if (fuzzyMatch) {
                          const { docStart, docEnd } = mapOurPosToDocPos(
                            ourToDocPos,
                            fuzzyMatch.start,
                            fuzzyMatch.end
                          );
                          const range = findTextRangeInDoc(
                            doc,
                            docStart,
                            docEnd
                          );
                          if (range) {
                            matchResult = {
                              start: range.start,
                              end: range.end,
                              confidence: fuzzyMatch.confidence,
                              strategy: fuzzyMatch.strategy,
                            };
                          }
                        }
                      }

                      // 策略3：结构匹配（如果模糊匹配失败）
                      if (!matchResult) {
                        const structuralMatchResult = structuralMatch(
                          diff,
                          doc,
                          docText
                        );
                        if (structuralMatchResult) {
                          matchResult = structuralMatchResult;
                        }
                      }

                      // 如果找到匹配，创建 Decoration
                      if (matchResult) {
                        const adjRange = ensureDeletionRangeLength(
                          doc,
                          { start: matchResult.start, end: matchResult.end },
                          cleanOriginalCode.length
                        );
                        diff.confidence = matchResult.confidence;
                        diff.strategy = matchResult.strategy;
                        diff.from = adjRange.start;
                        diff.to = adjRange.end;

                        // 根据置信度调整样式
                        const opacity =
                          matchResult.confidence < 0.7 ? 0.1 : 0.2;
                        const borderColor =
                          matchResult.confidence < 0.7
                            ? "rgba(251, 191, 36, 0.5)"
                            : "rgba(239, 68, 68, 0.3)";

                        const decoration = Decoration.inline(
                          adjRange.start,
                          adjRange.end,
                          {
                            class: "diff-deletion",
                            style: `background-color: rgba(239, 68, 68, ${opacity}); text-decoration: line-through; padding: 1px 2px; border-radius: 2px; border-left: 2px solid ${borderColor};`,
                            "data-diff-id": diff.diff_id,
                            "data-confidence":
                              matchResult.confidence.toFixed(2),
                            "data-strategy": matchResult.strategy,
                          }
                        );
                        decorations.push(decoration);

                        console.log(
                          "[DiffHighlightExtension] ✅ 添加红色删除线（多策略匹配）",
                          {
                            strategy: matchResult.strategy,
                            confidence: matchResult.confidence,
                            startLine: diff.original_start_line,
                            endLine: diff.original_end_line,
                          }
                        );

                        // ⚠️ 阶段二：如果置信度低，记录候选位置
                        if (matchResult.confidence < 0.7) {
                          const candidates = findCandidateLocations(
                            diff,
                            doc,
                            docText,
                            ourToDocPos
                          );
                          console.warn(
                            "[DiffHighlightExtension] ⚠️ 低置信度匹配，找到",
                            candidates.length,
                            "个候选位置",
                            {
                              diffId: diff.diff_id,
                              confidence: matchResult.confidence,
                              candidates: candidates.map((c) => ({
                                start: c.start,
                                end: c.end,
                                context: c.context.substring(0, 30),
                              })),
                            }
                          );
                          // 存储候选位置到 diff（用于后续用户确认）
                          (diff as any).candidates = candidates;
                        }
                      } else {
                        // 所有策略都失败，查找候选位置
                        // ⚠️ 关键修复：使用清理后的 original_code 查找候选位置
                        const candidates = findCandidateLocations(
                          { ...diff, original_code: cleanOriginalCode }, // 使用清理后的代码
                          doc,
                          docText,
                          ourToDocPos
                        );

                        // ⚠️ 关键修复：只使用置信度足够高的候选位置（>= 0.5），且长度合理
                        const validCandidates = candidates.filter((c) => {
                          const candidateLength = c.end - c.start;
                          const docLength = doc.content.size;
                          // 候选位置长度不能超过文档的30%，且置信度 >= 0.5
                          return (
                            candidateLength <= docLength * 0.3 &&
                            c.confidence >= 0.5
                          );
                        });

                        if (validCandidates.length > 0) {
                          // 使用置信度最高的候选位置
                          const bestCandidate = validCandidates[0];
                          console.warn(
                            "[DiffHighlightExtension] ⚠️ 使用候选位置（低置信度）",
                            {
                              originalCodeRaw: diff.original_code.substring(
                                0,
                                50
                              ),
                              originalCodeCleaned: cleanOriginalCode.substring(
                                0,
                                50
                              ),
                              candidateCount: validCandidates.length,
                              bestCandidate: {
                                start: bestCandidate.start,
                                end: bestCandidate.end,
                                confidence: bestCandidate.confidence,
                                context: bestCandidate.context.substring(0, 30),
                              },
                            }
                          );

                          const adjRange = ensureDeletionRangeLength(
                            doc,
                            { start: bestCandidate.start, end: bestCandidate.end },
                            cleanOriginalCode.length
                          );
                          diff.confidence = bestCandidate.confidence;
                          diff.strategy = "lowConfidenceCandidate";
                          diff.from = adjRange.start;
                          diff.to = adjRange.end;

                          const decoration = Decoration.inline(
                            adjRange.start,
                            adjRange.end,
                            {
                              class: "diff-deletion",
                              style: `background-color: rgba(239, 68, 68, 0.1); text-decoration: line-through; padding: 1px 2px; border-radius: 2px; border-left: 2px solid rgba(251, 191, 36, 0.5);`,
                              "data-diff-id": diff.diff_id,
                              "data-confidence":
                                bestCandidate.confidence.toFixed(2),
                              "data-strategy": "lowConfidenceCandidate",
                            }
                          );
                          decorations.push(decoration);
                        } else {
                          console.warn(
                            "[DiffHighlightExtension] ⚠️ 未找到有效的匹配位置，跳过高亮",
                            {
                              originalCodeRaw: diff.original_code.substring(
                                0,
                                50
                              ),
                              originalCodeCleaned: cleanOriginalCode.substring(
                                0,
                                50
                              ),
                              candidateCount: candidates.length,
                              validCandidateCount: validCandidates.length,
                            }
                          );
                          // 存储候选位置（用于调试）
                          (diff as any).candidates = candidates;
                        }
                      }
                    }
                  }

                  if (
                    diff.diff_type === "Insertion" ||
                    diff.diff_type === "Edit"
                  ) {
                    // 处理要添加的新内容 → 绿色背景
                    if (diff.new_code && diff.new_code.trim().length > 0) {
                      const newCode = diff.new_code.trim();

                      // 找到旧内容的位置（用于确定新内容的插入位置）
                      let insertAfterPos: number | null = null;

                      if (diff.diff_type === "Edit" && diff.original_code) {
                        // 对于 Edit，新内容应该插入在旧内容之后；优先带换行匹配，失败时用扁平 doc.textContent
                        const cleanOriginalCode = stripHtmlTags(
                          diff.original_code.trim()
                        );
                        const range = findTextRangeWithFallback(
                          doc,
                          docText,
                          ourToDocPos,
                          cleanOriginalCode,
                          diff.context_before,
                          diff.context_after,
                          diff.original_start_line,
                          diff.original_end_line,
                          oldLines
                        );
                        if (range) insertAfterPos = range.end;
                      } else if (diff.diff_type === "Insertion") {
                        // 对于 Insertion，根据行号在「带换行」文本中计算插入位置并映射到 doc
                        let lineStartPos = 0;
                        for (
                          let i = 0;
                          i < Math.min(diff.start_line - 1, docLines.length);
                          i++
                        ) {
                          lineStartPos += docLines[i].length + 1;
                        }
                        const { docStart } = mapOurPosToDocPos(
                          ourToDocPos,
                          lineStartPos,
                          lineStartPos
                        );
                        const range = findTextRangeInDoc(
                          doc,
                          docStart,
                          docStart
                        );
                        if (range) {
                          insertAfterPos = range.start;
                        }
                      }

                      if (insertAfterPos !== null) {
                        // ⚠️ 改进：检查原句子与上文的换行，以及原句子与下文的换行
                        // 1. 检查原句子与上文的换行（插入位置前面）
                        // 2. 检查原句子与下文的换行（插入位置后面）
                        let shouldInsertNewlineBefore = false;
                        let shouldInsertNewlineAfter = false;

                        // 从文档位置转换为文本位置，然后检查前后是否有换行
                        let currentTextPos = 0;
                        let insertTextPos = 0;
                        let found = false;

                        doc.descendants((node: any, pos: number) => {
                          if (found) return false;
                          if (node.isText) {
                            const nodeStart = pos + 1; // ProseMirror 文本节点内容从 pos+1 开始
                            const nodeEnd = nodeStart + node.text.length;

                            if (
                              insertAfterPos >= nodeStart &&
                              insertAfterPos <= nodeEnd
                            ) {
                              // 找到包含插入位置的文本节点
                              const offset = insertAfterPos - nodeStart;
                              insertTextPos = currentTextPos + offset;
                              found = true;
                              return false;
                            }
                            currentTextPos += node.text.length;
                          }
                          return true;
                        });

                        // 如果没找到，说明是在文档末尾
                        if (!found) {
                          insertTextPos = currentTextPos;
                        }

                        // insertTextPos 为 doc 纯文本位置，需映射为「带换行」文本下标后再用 docText.substring
                        const ourInsertPos = docPosToOurPos(
                          insertTextPos,
                          ourToDocPos
                        );
                        const checkStart = Math.max(0, ourInsertPos - 200);
                        const textBeforePos = docText.substring(
                          checkStart,
                          ourInsertPos
                        );

                        if (insertTextPos === 0) {
                          // 整篇文档的首字，直接换行
                          shouldInsertNewlineBefore = true;
                        } else if (textBeforePos.length > 0) {
                          // 检查最后一个字符是否是换行符
                          const lastChar =
                            textBeforePos[textBeforePos.length - 1];
                          shouldInsertNewlineBefore = lastChar === "\n";
                        }

                        // ⚠️ 检查插入位置后面的文本（原句与下文的换行）
                        // Edit 时 insertAfterPos 已在原内容之后，ourInsertPos 即「带换行」文本中该位置
                        if (
                          diff.diff_type === "Edit" ||
                          diff.diff_type === "Insertion"
                        ) {
                          if (ourInsertPos < docText.length) {
                            const textAfterOriginal = docText.substring(
                              ourInsertPos,
                              Math.min(ourInsertPos + 10, docText.length)
                            );
                            shouldInsertNewlineAfter =
                              textAfterOriginal.startsWith("\n");
                          }
                        }

                        // 决定是否换行：如果原句子与上文或下文有换行，新内容也应该换行
                        const shouldInsertNewline =
                          shouldInsertNewlineBefore || shouldInsertNewlineAfter;

                        if (shouldInsertNewline) {
                          // 句前或句后有换行，新内容换行后绿色处理（块级元素）
                          const widget = document.createElement("div");
                          widget.className = "diff-insertion-widget";
                          // ⚠️ 改进：如果原句子与下文有换行，新内容后面也要换行
                          const displayText = shouldInsertNewlineAfter
                            ? newCode + "\n"
                            : newCode;
                          widget.textContent = displayText;
                          widget.style.cssText =
                            "background-color: rgba(34, 197, 94, 0.3); padding: 4px 8px; border-radius: 4px; margin: 4px 0; border-left: 3px solid rgba(34, 197, 94, 0.6); display: block; color: rgba(34, 197, 94, 0.9); white-space: pre-wrap;";

                          const decoration = Decoration.widget(
                            insertAfterPos,
                            widget,
                            {
                              side: 1, // 插入在位置之后
                              ignoreSelection: true,
                              block: true, // 块级元素，会换行显示
                            }
                          );
                          decorations.push(decoration);
                          console.log(
                            "[DiffHighlightExtension] ✅ 添加绿色新内容预览（换行显示）",
                            {
                              insertAfterPos,
                              length: newCode.length,
                              code: newCode.substring(0, 30),
                              shouldInsertNewlineBefore,
                              shouldInsertNewlineAfter,
                            }
                          );
                        } else {
                          // 句前没有换行，新内容不换行，inline显示
                          // 创建一个span元素用于inline显示
                          const widget = document.createElement("span");
                          widget.className = "diff-insertion-widget-inline";
                          widget.textContent = newCode;
                          widget.style.cssText =
                            "background-color: rgba(34, 197, 94, 0.3); padding: 2px 4px; border-radius: 2px; color: rgba(34, 197, 94, 0.9); display: inline;";

                          const decoration = Decoration.widget(
                            insertAfterPos,
                            widget,
                            {
                              side: 1, // 插入在位置之后
                              ignoreSelection: true,
                            }
                          );
                          decorations.push(decoration);
                          console.log(
                            "[DiffHighlightExtension] ✅ 添加绿色新内容预览（inline显示，句前无换行）",
                            {
                              insertAfterPos,
                              length: newCode.length,
                              code: newCode.substring(0, 30),
                            }
                          );
                        }
                      } else {
                        // 如果找不到插入位置，尝试在文档中查找新内容（可能已经存在）；index 在「带换行」文本中，需映射
                        const index = docText.indexOf(newCode);
                        if (index !== -1) {
                          const { docStart, docEnd } = mapOurPosToDocPos(
                            ourToDocPos,
                            index,
                            index + newCode.length
                          );
                          const range = findTextRangeInDoc(
                            doc,
                            docStart,
                            docEnd
                          );
                          if (range && range.end <= doc.content.size) {
                            const decoration = Decoration.inline(
                              range.start,
                              range.end,
                              {
                                class: "diff-insertion",
                                style:
                                  "background-color: rgba(34, 197, 94, 0.3); padding: 1px 2px; border-radius: 2px;",
                              }
                            );
                            decorations.push(decoration);
                            console.log(
                              "[DiffHighlightExtension] ✅ 添加绿色高亮（已存在的新内容）",
                              {
                                index,
                                length: newCode.length,
                              }
                            );
                          }
                        } else {
                          console.warn(
                            "[DiffHighlightExtension] ⚠️ 未找到新内容插入位置",
                            {
                              newCode: newCode.substring(0, 50),
                              startLine: diff.start_line,
                              endLine: diff.end_line,
                            }
                          );
                        }
                      }
                    }
                  }
                } catch (error) {
                  console.warn(
                    "[DiffHighlightExtension] ❌ 创建装饰失败:",
                    error,
                    diff
                  );
                }
              }

              // ⚠️ 阶段三：处理表格、图片、代码块的 Diff
              for (const diff of diffsToProcess) {
                try {
                  if (diff.element_type === "table") {
                    // 表格 Diff 处理
                    try {
                      const tableDecorations = handleTableDiff(diff, doc);
                      if (tableDecorations && Array.isArray(tableDecorations)) {
                        decorations.push(...tableDecorations);
                      }
                    } catch (error) {
                      console.warn(
                        "[DiffHighlightExtension] 处理表格 Diff 失败",
                        error
                      );
                    }
                  } else if (diff.element_type === "image") {
                    // 图片 Diff 处理
                    try {
                      const imageDecorations = handleImageDiff(diff, doc);
                      if (imageDecorations && Array.isArray(imageDecorations)) {
                        decorations.push(...imageDecorations);
                      }
                    } catch (error) {
                      console.warn(
                        "[DiffHighlightExtension] 处理图片 Diff 失败",
                        error
                      );
                    }
                  } else if (diff.element_type === "code_block") {
                    // 代码块 Diff 处理
                    try {
                      const codeDecorations = handleCodeBlockDiff(diff, doc);
                      if (codeDecorations && Array.isArray(codeDecorations)) {
                        decorations.push(...codeDecorations);
                      }
                    } catch (error) {
                      console.warn(
                        "[DiffHighlightExtension] 处理代码块 Diff 失败",
                        error
                      );
                    }
                  } else if (
                    diff.element_type === "text" ||
                    !diff.element_type
                  ) {
                    // 文本 Diff：检查是否是跨节点 Diff
                    if (diff.from !== undefined && diff.to !== undefined) {
                      try {
                        // 检查是否跨越多个节点
                        const startNode = doc.nodeAt(diff.from);
                        const endNode = doc.nodeAt(diff.to);

                        if (startNode && endNode && startNode !== endNode) {
                          // 跨节点 Diff：使用特殊处理
                          const crossNodeDecorations = handleCrossNodeDiff(
                            diff,
                            doc
                          );
                          if (
                            crossNodeDecorations &&
                            Array.isArray(crossNodeDecorations) &&
                            crossNodeDecorations.length > 0
                          ) {
                            decorations.push(...crossNodeDecorations);
                            continue; // 跳过常规文本处理
                          }
                        }
                      } catch (error) {
                        console.warn(
                          "[DiffHighlightExtension] 处理跨节点 Diff 失败",
                          error
                        );
                      }
                    }
                  }
                } catch (error) {
                  console.warn(
                    "[DiffHighlightExtension] ❌ 处理复杂元素 Diff 失败:",
                    error,
                    diff
                  );
                  // 继续处理下一个 diff，不中断整个流程
                }
              }

              // ⚠️ 阶段二：统计低置信度匹配数量
              const lowConfidenceDiffs = diffsToProcess.filter(
                (d) => d.confidence !== undefined && d.confidence < 0.7
              );
              const hasLowConfidence = lowConfidenceDiffs.length > 0;

              // ⚠️ 新增：如果有 diff，在文档末尾添加应用/放弃按钮
              if (
                diffsToProcess &&
                diffsToProcess.length > 0 &&
                decorations.length > 0
              ) {
                const buttonWidget = document.createElement("div");
                buttonWidget.className = "diff-action-buttons";
                buttonWidget.style.cssText =
                  "position: sticky; bottom: 20px; display: flex; gap: 8px; justify-content: center; padding: 12px; background: rgba(255, 255, 255, 0.95); border: 1px solid rgba(0, 0, 0, 0.1); border-radius: 8px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15); z-index: 1000; margin: 16px auto; max-width: 400px; flex-wrap: wrap;";

                // ⚠️ 阶段二：如果有低置信度匹配，显示警告
                if (hasLowConfidence) {
                  const warningDiv = document.createElement("div");
                  warningDiv.style.cssText =
                    "width: 100%; padding: 8px; background: rgba(251, 191, 36, 0.1); border: 1px solid rgba(251, 191, 36, 0.3); border-radius: 4px; margin-bottom: 8px; font-size: 12px; color: #92400e;";
                  warningDiv.textContent = `⚠️ 检测到 ${lowConfidenceDiffs.length} 处低置信度匹配，建议检查`;
                  buttonWidget.appendChild(warningDiv);
                }

                // ⚠️ 阶段二：批量操作按钮组
                const buttonGroup = document.createElement("div");
                buttonGroup.style.cssText =
                  "display: flex; gap: 8px; width: 100%;";

                // 应用所有按钮
                const applyAllButton = document.createElement("button");
                applyAllButton.textContent = "✅ 应用所有";
                applyAllButton.style.cssText =
                  "flex: 1; padding: 8px 16px; background: #22c55e; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 500; transition: background 0.2s;";
                applyAllButton.onmouseover = () => {
                  applyAllButton.style.background = "#16a34a";
                };
                applyAllButton.onmouseout = () => {
                  applyAllButton.style.background = "#22c55e";
                };
                applyAllButton.onclick = (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (onApplyDiff) {
                    onApplyDiff();
                  }
                };

                // 拒绝所有按钮
                const rejectAllButton = document.createElement("button");
                rejectAllButton.textContent = "❌ 拒绝所有";
                rejectAllButton.style.cssText =
                  "flex: 1; padding: 8px 16px; background: #ef4444; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 500; transition: background 0.2s;";
                rejectAllButton.onmouseover = () => {
                  rejectAllButton.style.background = "#dc2626";
                };
                rejectAllButton.onmouseout = () => {
                  rejectAllButton.style.background = "#ef4444";
                };
                rejectAllButton.onclick = (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (onRejectDiff) {
                    onRejectDiff();
                  }
                };

                buttonGroup.appendChild(applyAllButton);
                buttonGroup.appendChild(rejectAllButton);
                buttonWidget.appendChild(buttonGroup);

                // ⚠️ 阶段二：显示统计信息
                const statsDiv = document.createElement("div");
                statsDiv.style.cssText =
                  "width: 100%; padding: 4px 0; font-size: 11px; color: #6b7280; text-align: center;";
                statsDiv.textContent = `共 ${diffs.length} 处修改${hasLowConfidence ? `，${lowConfidenceDiffs.length} 处需确认` : ""}`;
                buttonWidget.appendChild(statsDiv);

                // 在文档末尾添加按钮
                const docSize = doc.content.size;
                const buttonDecoration = Decoration.widget(
                  docSize,
                  buttonWidget,
                  {
                    side: -1, // 插入在位置之前（文档末尾）
                    ignoreSelection: true,
                    block: true,
                  }
                );
                decorations.push(buttonDecoration);
              }

              console.log(
                "[DiffHighlightExtension] 总共创建了",
                decorations.length,
                "个装饰"
              );

              if (decorations.length === 0) {
                return DecorationSet.empty;
              }

              try {
                const decorationSet = DecorationSet.create(doc, decorations);
                return decorationSet;
              } catch (error) {
                console.error(
                  "[DiffHighlightExtension] 创建 DecorationSet 失败",
                  error
                );
                return DecorationSet.empty;
              }
            } catch (error) {
              // 顶层错误处理：防止任何未捕获的错误导致闪退
              console.error(
                "[DiffHighlightExtension] apply 方法发生未捕获的错误",
                error
              );
              // 返回空集合，确保不会导致崩溃
              return DecorationSet.empty;
            }
          },
        },
        props: {
          decorations(state) {
            return this.getState(state);
          },
        },
      }),
    ];
  },
});
