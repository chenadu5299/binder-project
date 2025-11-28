// Diff 计算工具
import { diffLines, diffChars, Change } from 'diff';

export interface DiffChange {
    type: 'insert' | 'delete' | 'modify' | 'equal';
    line: number;
    oldLines?: string[];
    newLines?: string[];
    charChanges?: Change[];  // 字符级变化信息
}

export interface ParagraphChange {
    id: string;
    startLine: number;
    endLine: number;
    changes: DiffChange[];
    canConfirm: boolean;
}

/**
 * 混合 Diff 策略：行级 + 字符级
 */
export function calculateHybridDiff(oldText: string, newText: string): DiffChange[] {
    const changes: DiffChange[] = [];
    
    // 第一步：行级 Diff
    const lineDiff = diffLines(oldText, newText);
    
    let currentLine = 0;
    
    for (const part of lineDiff) {
        const lines = part.value.split('\n');
        // 移除最后一个空行（split 会产生）
        if (lines.length > 0 && lines[lines.length - 1] === '') {
            lines.pop();
        }
        
        if (part.added) {
            // 新增行
            for (const line of lines) {
                if (line) {
                    // 对新增行进行字符级分析
                    const charDiff = diffChars('', line);
                    changes.push({
                        type: 'insert',
                        line: currentLine,
                        newLines: [line],
                        charChanges: charDiff,
                    });
                    currentLine++;
                }
            }
        } else if (part.removed) {
            // 删除行
            for (const line of lines) {
                if (line) {
                    // 对删除行进行字符级分析
                    const charDiff = diffChars(line, '');
                    changes.push({
                        type: 'delete',
                        line: currentLine,
                        oldLines: [line],
                        charChanges: charDiff,
                    });
                    // 删除行不增加行号
                }
            }
        } else {
            // 未变化行
            currentLine += lines.length;
        }
    }
    
    // 第二步：合并相邻的插入和删除为修改
    const mergedChanges: DiffChange[] = [];
    for (let i = 0; i < changes.length; i++) {
        const current = changes[i];
        const next = changes[i + 1];
        
        if (
            current.type === 'delete' &&
            next &&
            next.type === 'insert' &&
            next.line === current.line
        ) {
            // 合并为修改
            mergedChanges.push({
                type: 'modify',
                line: current.line,
                oldLines: current.oldLines,
                newLines: next.newLines,
                charChanges: [
                    ...(current.charChanges || []),
                    ...(next.charChanges || []),
                ],
            });
            i++; // 跳过下一个
        } else {
            mergedChanges.push(current);
        }
    }
    
    return mergedChanges;
}

/**
 * 将变化合并为段落
 * 规则：间隔小于 3 行的变化视为同一段落
 */
export function mergeIntoParagraphs(changes: DiffChange[]): ParagraphChange[] {
    if (changes.length === 0) return [];
    
    const paragraphs: ParagraphChange[] = [];
    let currentParagraph: ParagraphChange | null = null;
    const PARAGRAPH_GAP = 3; // 段落间隔阈值
    
    for (const change of changes) {
        if (!currentParagraph) {
            // 创建新段落
            currentParagraph = {
                id: `para-${change.line}-${Date.now()}`,
                startLine: change.line,
                endLine: change.line,
                changes: [change],
                canConfirm: true,
            };
        } else {
            const gap = change.line - currentParagraph.endLine;
            
            if (gap <= PARAGRAPH_GAP) {
                // 合并到当前段落
                currentParagraph.changes.push(change);
                currentParagraph.endLine = change.line;
            } else {
                // 开始新段落
                paragraphs.push(currentParagraph);
                currentParagraph = {
                    id: `para-${change.line}-${Date.now()}`,
                    startLine: change.line,
                    endLine: change.line,
                    changes: [change],
                    canConfirm: true,
                };
            }
        }
    }
    
    if (currentParagraph) {
        paragraphs.push(currentParagraph);
    }
    
    return paragraphs;
}

/**
 * 检测段落边界（空行、函数/类定义等）
 */
export function detectParagraphBoundaries(text: string): number[] {
    const lines = text.split('\n');
    const boundaries: number[] = [0]; // 第一行总是边界
    
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        const prevLine = lines[i - 1];
        
        // 空行作为边界
        if (line.trim() === '' || prevLine.trim() === '') {
            boundaries.push(i);
        }
        
        // 函数/类定义作为边界（简单检测）
        if (
            /^(function|class|interface|type|const|let|var)\s+\w+/.test(line.trim()) ||
            /^(export\s+)?(function|class|interface|type)/.test(line.trim())
        ) {
            boundaries.push(i);
        }
    }
    
    boundaries.push(lines.length); // 最后一行也是边界
    
    return [...new Set(boundaries)].sort((a, b) => a - b);
}

