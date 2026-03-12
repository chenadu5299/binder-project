import { useState, useEffect, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Editor } from '@tiptap/react';

export interface AutoCompleteState {
  text: string | null;
  position: number | null;
  isVisible: boolean;
  isLoading: boolean;
}

// 编辑器状态信息
export interface EditorState {
  nodeType: string; // 当前节点类型
  headingLevel?: number; // 标题层级（如有）
  listType?: 'ordered' | 'unordered'; // 列表类型（如有）
  listLevel?: number; // 列表层级（如有）
  blockType?: string; // 块类型（段落、引用、代码块等）
}

interface UseAutoCompleteOptions {
  editor: Editor | null;
  minContextLength?: number; // 最小上下文长度，默认 50
  maxLength?: number; // 最大续写长度，默认 50-150（动态调整）
  enabled?: boolean; // 是否启用，默认 true
  documentPath?: string; // 文档路径（用于记忆库检索）
  workspacePath?: string; // 工作区路径（用于记忆库检索）
}

export function useAutoComplete({
  editor,
  minContextLength = 50,
  maxLength = 100, // 默认100，动态调整
  enabled = true,
  documentPath,
  workspacePath,
}: UseAutoCompleteOptions) {
  const [state, setState] = useState<AutoCompleteState>({
    text: null,
    position: null,
    isVisible: false,
    isLoading: false,
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  const lastContextRef = useRef<string>('');
  const lastPositionRef = useRef<number>(-1);
  const isUserTypingRef = useRef<boolean>(false);

  // 清除自动补全
  const clear = useCallback(() => {
    console.log('[自动续写] 清除状态');
    
    // 先清除状态
    setState({
      text: null,
      position: null,
      isVisible: false,
      isLoading: false,
    });

    // 取消请求
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    
    // 强制更新插件状态：创建一个空事务来触发插件更新，清除装饰
    if (editor && editor.view) {
      // 使用 setTimeout 确保状态已清除，Extension 的 getGhostText 会返回 null
      setTimeout(() => {
        if (editor && editor.view) {
          const { state, dispatch } = editor.view;
          const tr = state.tr;
          tr.setMeta('ghostTextUpdate', true);
          dispatch(tr);
          console.log('[自动续写] 已分发事务清除装饰');
        }
      }, 0);
    }
  }, [editor]);

  // 提取文档概览信息（全文视角）- 更简单更稳定的方法
  interface HeadingInfo {
    level: number;
    text: string;
    pos: number;
  }
  
  const extractDocumentOverview = useCallback((editor: Editor, cursorPos: number, docSize: number): {
    documentStart: string; // 文档开头（了解主题和风格）
    documentEnd: string; // 文档结尾（了解整体走向）
    documentStructure: string; // 文档结构（标题层级等）
    documentLength: number; // 文档长度
    currentSection: string; // 当前所在章节
    previousParagraph: string; // 前一个段落（如果有）
    nextParagraph: string; // 后一个段落（如果有）
  } => {
    const { state } = editor;
    const doc = state.doc;
    
    // 提取文档开头（500-800字符，更全面地了解主题和风格）
    const startLength = Math.min(800, Math.floor(docSize * 0.1)); // 至少10%或800字符
    const documentStart = doc.textBetween(0, Math.min(startLength, docSize)).trim();
    
    // 提取文档结尾（如果光标不在末尾，提取最后300字符了解整体走向）
    let documentEnd = '';
    if (cursorPos < docSize - 500) {
      const endStart = Math.max(0, docSize - 300);
      documentEnd = doc.textBetween(endStart, docSize).trim();
    }
    
    // 提取文档结构（查找所有标题，但限制数量）
    const structure: string[] = [];
    doc.descendants((node, _pos) => {
      if (node.type.name.startsWith('heading')) {
        const level = node.type.name.match(/heading(\d)/)?.[1] || '1';
        const text = node.textContent.trim();
        if (text) {
          structure.push(`H${level}: ${text}`);
        }
      }
      return true;
    });
    
    // 保留前15个标题，提供更完整的结构信息
    const documentStructure = structure.slice(0, 15).join(' | ');
    
    // 查找当前所在章节（光标位置附近的标题）
    let currentSection = '';
    let nearestHeading: HeadingInfo | null = null;
    doc.descendants((node, pos) => {
      if (node.type.name.startsWith('heading') && pos < cursorPos) {
        const levelMatch = node.type.name.match(/heading(\d)/);
        if (levelMatch) {
          const level = parseInt(levelMatch[1]);
          const text = node.textContent.trim();
          if (text) {
            const headingInfo: HeadingInfo = { level, text, pos };
            if (nearestHeading === null || pos > nearestHeading.pos) {
              nearestHeading = headingInfo;
            }
          }
        }
      }
      return true;
    });
    
    if (nearestHeading) {
      const heading: HeadingInfo = nearestHeading;
      currentSection = `H${heading.level}: ${heading.text}`;
    }
    
    // 提取当前段落的前后段落（增强上下文衔接）
    let previousParagraph = '';
    let nextParagraph = '';
    
    // 查找当前段落
    let currentParagraphStart = cursorPos;
    let currentParagraphEnd = cursorPos;
    
    // 向前查找段落开始
    for (let i = cursorPos - 1; i >= 0; i--) {
      const char = doc.textBetween(i, i + 1);
      if (char === '\n') {
        const prevChar = i > 0 ? doc.textBetween(i - 1, i) : '';
        if (prevChar === '\n') {
          currentParagraphStart = i + 2;
          break;
        }
      }
      if (i === 0) {
        currentParagraphStart = 0;
        break;
      }
    }
    
    // 向后查找段落结束
    for (let i = cursorPos; i < docSize; i++) {
      const char = doc.textBetween(i, i + 1);
      if (char === '\n') {
        const nextChar = i + 1 < docSize ? doc.textBetween(i + 1, i + 2) : '';
        if (nextChar === '\n' || nextChar === '') {
          currentParagraphEnd = i;
          break;
        }
      }
      if (i === docSize - 1) {
        currentParagraphEnd = docSize;
        break;
      }
    }
    
    // 提取前一个段落
    if (currentParagraphStart > 0) {
      let prevStart = currentParagraphStart - 1;
      for (let i = currentParagraphStart - 2; i >= 0; i--) {
        const char = doc.textBetween(i, i + 1);
        if (char === '\n') {
          const prevChar = i > 0 ? doc.textBetween(i - 1, i) : '';
          if (prevChar === '\n') {
            prevStart = i + 2;
            break;
          }
        }
        if (i === 0) {
          prevStart = 0;
          break;
        }
      }
      if (prevStart < currentParagraphStart) {
        previousParagraph = doc.textBetween(prevStart, currentParagraphStart - 2).trim();
        // 限制长度
        if (previousParagraph.length > 200) {
          previousParagraph = previousParagraph.substring(previousParagraph.length - 200);
        }
      }
    }
    
    // 提取后一个段落
    if (currentParagraphEnd < docSize) {
      let nextStart = currentParagraphEnd + 1;
      for (let i = currentParagraphEnd + 1; i < docSize; i++) {
        const char = doc.textBetween(i, i + 1);
        if (char === '\n') {
          const nextChar = i + 1 < docSize ? doc.textBetween(i + 1, i + 2) : '';
          if (nextChar === '\n') {
            nextStart = i + 2;
            break;
          }
        }
        if (i === docSize - 1) {
          nextStart = docSize;
          break;
        }
      }
      if (nextStart > currentParagraphEnd && nextStart < docSize) {
        let nextEnd = nextStart;
        for (let i = nextStart; i < docSize; i++) {
          const char = doc.textBetween(i, i + 1);
          if (char === '\n') {
            const nextChar = i + 1 < docSize ? doc.textBetween(i + 1, i + 2) : '';
            if (nextChar === '\n' || nextChar === '') {
              nextEnd = i;
              break;
            }
          }
          if (i === docSize - 1) {
            nextEnd = docSize;
            break;
          }
        }
        nextParagraph = doc.textBetween(nextStart, nextEnd).trim();
        // 限制长度
        if (nextParagraph.length > 200) {
          nextParagraph = nextParagraph.substring(0, 200);
        }
      }
    }
    
    return {
      documentStart: documentStart.length > 400 ? documentStart.substring(0, 400) + '...' : documentStart,
      documentEnd: documentEnd.length > 200 ? documentEnd.substring(0, 200) + '...' : documentEnd,
      documentStructure: documentStructure || '无标题结构',
      documentLength: docSize,
      currentSection: currentSection || '无章节信息',
      previousParagraph: previousParagraph || '',
      nextParagraph: nextParagraph || '',
    };
  }, []);

  // 触发自动补全
  const trigger = useCallback(async () => {
    console.log('[自动续写] trigger 被调用', { editor: !!editor, enabled });
    if (!editor || !enabled) {
      console.log('[自动续写] 跳过: editor 或 enabled 为 false');
      return;
    }

    const { from, to } = editor.state.selection;
    console.log('[自动续写] 选择位置', { from, to });
    
    // 检查是否有选中文本（如果有，不触发）
    if (from !== to) {
      console.log('[自动续写] 跳过: 有选中文本');
      return;
    }

    // 提取上下文（更细腻的上下文衔接）- 更简单更稳定的方法
    const docSize = editor.state.doc.content.size;
    
    // 动态调整上文长度：根据文档大小和场景
    let contextBeforeLength = 600; // 默认600字符（增加以提供更多上下文）
    if (docSize < 1000) {
      contextBeforeLength = 400; // 简单场景
    } else if (docSize > 5000) {
      contextBeforeLength = 800; // 复杂场景，提供更多上下文
    } else if (docSize > 10000) {
      contextBeforeLength = 1000; // 超长文档，提供更多上下文
    }
    
    const contextStart = Math.max(0, from - contextBeforeLength);
    const rawContextBefore = editor.state.doc.textBetween(contextStart, from);
    let contextBefore = rawContextBefore;
    
    // 优先在段落边界截断（保持段落完整性）
    const paragraphBreak = contextBefore.lastIndexOf('\n\n');
    if (paragraphBreak > contextBefore.length * 0.3) {
      // 如果找到段落边界且不在开头30%内，从段落边界开始
      const candidate = contextBefore.substring(paragraphBreak + 2);
      // 如果截断后过短，则保留更多原始内容
      contextBefore = candidate.length >= minContextLength ? candidate : contextBefore;
    } else {
      // 如果没有段落边界，尝试在句子边界截断
      const sentenceBreak = contextBefore.lastIndexOf('。');
      const exclamationBreak = contextBefore.lastIndexOf('！');
      const questionBreak = contextBefore.lastIndexOf('？');
      const maxBreak = Math.max(sentenceBreak, exclamationBreak, questionBreak);
      if (maxBreak > contextBefore.length * 0.3) {
        const candidate = contextBefore.substring(maxBreak + 1);
        contextBefore = candidate.length >= minContextLength ? candidate : contextBefore;
      }
    }
    
    // 限制上下文长度，但保留更多内容（800字符）
    const maxContextLength = 800; // 增加最大上下文长度
    if (contextBefore.length > maxContextLength) {
      // 从末尾截取，保留最近的上下文
      contextBefore = contextBefore.substring(contextBefore.length - maxContextLength);
    }
    
    // 如果经过截断后仍然过短，但原始上下文足够长，则从原始上下文尾部补足
    if (contextBefore.length < minContextLength && rawContextBefore.length >= minContextLength) {
      const needed = Math.max(minContextLength, Math.min(maxContextLength, rawContextBefore.length));
      contextBefore = rawContextBefore.substring(rawContextBefore.length - needed);
    }
    
    console.log('[自动续写] 上文提取', { contextLength: contextBefore.length, minRequired: minContextLength });

    // 不再因上下文过短而直接跳过，以便在短文本或文档开头也能触发续写
    // 由提示词和模型来自行判断内容是否足够

    // 提取下文（光标后内容），修复：跳过光标位置，提取换行后的内容，并适当加长下文
    let contextAfter: string | null = null;
    if (from < docSize - 1) {
      // 从光标后开始提取（跳过光标位置本身）
      let startPos = from;
      
      // 如果光标在行尾（下一个字符是换行符），跳过换行符
      const nextChar = editor.state.doc.textBetween(from, Math.min(docSize, from + 1));
      if (nextChar === '\n') {
        startPos = from + 1;
      }
      
      // 提取下文（最多400字符，提供更多上下文）
      const contextEnd = Math.min(docSize, startPos + 400);
      let rawContextAfter = editor.state.doc.textBetween(startPos, contextEnd);
      
      // 如果提取的内容为空或只有空白字符，尝试跳过空白字符
      if (rawContextAfter.trim().length === 0 && startPos < docSize - 1) {
        // 跳过所有空白字符（包括换行、空格、制表符等）
        let skipPos = startPos;
        while (skipPos < docSize) {
          const char = editor.state.doc.textBetween(skipPos, skipPos + 1);
          if (char.trim().length > 0) {
            break;
          }
          skipPos++;
        }
        if (skipPos < docSize) {
          const newEnd = Math.min(docSize, skipPos + 300);
          rawContextAfter = editor.state.doc.textBetween(skipPos, newEnd);
          startPos = skipPos;
        }
      }
      
      if (rawContextAfter.trim().length > 0) {
        // 优先在段落边界截断（两个换行符）
        const paragraphBreak = rawContextAfter.indexOf('\n\n');
        if (paragraphBreak > 0 && paragraphBreak < rawContextAfter.length * 0.7) {
          rawContextAfter = rawContextAfter.substring(0, paragraphBreak);
        }
        // 不再按句子边界二次截断，让模型可以看到更多下文内容
        
        // 降低最小长度要求，即使只有10字符也有价值（可能是一个词或短语）
        if (rawContextAfter.trim().length >= 10) {
          contextAfter = rawContextAfter.trim();
          console.log('[自动续写] 下文提取', { 
            contextLength: contextAfter.length, 
            content: contextAfter.substring(0, 50) + (contextAfter.length > 50 ? '...' : ''),
            startPos: from,
            extractedFrom: startPos
          });
        } else {
          console.log('[自动续写] 下文太短，忽略', { contextLength: rawContextAfter.trim().length });
        }
      } else {
        console.log('[自动续写] 光标后无有效下文内容', { from, docSize, startPos });
      }
    } else {
      console.log('[自动续写] 在文档末尾，无下文', { from, docSize });
    }

    // 检查上下文或位置是否变化（去重）- 提前检查，避免不必要的处理
    const contextKey = `${contextBefore.substring(0, 100)}|${contextAfter?.substring(0, 50) || ''}|${from}`;
    if (contextKey === lastContextRef.current && from === lastPositionRef.current) {
      console.log('[自动续写] 跳过: 上下文和位置未变化');
      return;
    }

    lastContextRef.current = contextKey;
    lastPositionRef.current = from;
    
    // 提取编辑器状态信息
    const editorState = extractEditorState(editor, from);
    console.log('[自动续写] 编辑器状态', editorState);
    
    // 提取全文视角信息（文档开头、结构、整体风格）- 即使没有记忆库也要有全文意识
    const documentOverview = extractDocumentOverview(editor, from, docSize);
    console.log('[自动续写] 文档概览', documentOverview);
    
    // 检索记忆库（异步，不阻塞）- 优化：使用 Promise，设置超时
    const memoryItemsPromise = (async () => {
      if (!workspacePath || !documentPath) return [];
      try {
        // 从上下文提取关键词用于检索（只取前几个关键词，避免查询过长）
        const keywords = extractKeywords(contextBefore).slice(0, 3);
        if (keywords.length === 0) return [];
        
        const query = keywords.join(' ');
        const memories = await invoke<Array<{
          id: string;
          entity_name: string;
          content: string;
          entity_type: string;
        }>>('search_memories', {
          query,
          workspacePath,
        });
        const items = memories.slice(0, 3); // 最多3条，减少提示词长度
        console.log('[自动续写] 记忆库检索', { query, count: items.length });
        return items;
      } catch (error) {
        console.warn('[自动续写] 记忆库检索失败', error);
        return [];
      }
    })();
    
    // 设置加载状态
    setState((prev) => ({
      ...prev,
      isLoading: true,
      position: from,
    }));

    // 创建 AbortController 用于取消请求
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    // 动态调整续写长度
    let dynamicMaxLength = maxLength;
    if (docSize < 1000) {
      dynamicMaxLength = 80; // 简单场景：50-100字
    } else if (docSize > 5000) {
      dynamicMaxLength = 150; // 复杂场景：100-150字
    }
    
    // 获取文档格式
    const documentFormat = documentPath ? getDocumentFormat(documentPath) : 'txt';
    
    // 等待记忆库检索完成（但设置超时，避免阻塞太久）
    interface MemoryItem {
      id: string;
      entity_name: string;
      content: string;
      entity_type: string;
    }
    let memoryItems: MemoryItem[] = [];
    try {
      memoryItems = await Promise.race([
        memoryItemsPromise,
        new Promise<MemoryItem[]>((resolve) => setTimeout(() => resolve([]), 500)), // 500ms超时
      ]);
    } catch (error) {
      console.warn('[自动续写] 记忆库检索超时或失败', error);
    }
    
    console.log('[自动续写] 开始请求 AI 续写', { 
      position: from, 
      contextBeforeLength: contextBefore.length,
      contextAfterLength: contextAfter?.length || 0,
      memoryCount: memoryItems.length 
    });
    
    try {
      // 输出完整的请求参数用于调试
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📝 [自动续写] 调用后端 ai_autocomplete');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🔧 请求参数:');
      console.log('  - 位置:', from);
      console.log('  - 最大长度:', dynamicMaxLength);
      console.log('  - 文档格式:', documentFormat);
      console.log('  - 记忆库数量:', memoryItems.length);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📄 上下文内容:');
      console.log('  - 上文长度:', contextBefore.length, '字符');
      console.log('  - 上文内容:');
      console.log('    ', contextBefore);
      if (contextAfter) {
        console.log('  - 下文长度:', contextAfter.length, '字符');
        console.log('  - 下文内容:');
        console.log('    ', contextAfter);
        console.log('  - 注意: 续写需要与下文自然衔接');
      } else {
        console.log('  - 下文: 无（文档末尾）');
        console.log('  - 注意: 续写方向应为推进情节/内容');
      }
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🎨 编辑器状态:', editorState);
      if (memoryItems.length > 0) {
        console.log('📚 记忆库信息:');
        memoryItems.forEach((item, index) => {
          console.log(`  ${index + 1}. ${item.entity_name} (${item.entity_type}): ${item.content.substring(0, 50)}...`);
        });
      }
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      // 转换编辑器状态为后端期望的格式（蛇形命名）
      const editorStateForBackend = editorState ? {
        node_type: editorState.nodeType,
        heading_level: editorState.headingLevel ?? null,
        list_type: editorState.listType ?? null,
        list_level: editorState.listLevel ?? null,
        block_type: editorState.blockType ?? null,
      } : null;
      
      // 转换记忆库项为后端期望的格式
      const memoryItemsForBackend = memoryItems.length > 0 ? memoryItems.map(item => ({
        id: item.id,
        entity_name: item.entity_name,
        content: item.content,
        entity_type: item.entity_type,
      })) : null;
      
      // 转换文档概览为后端期望的格式
      const documentOverviewForBackend = {
        document_start: documentOverview.documentStart,
        document_end: documentOverview.documentEnd,
        document_structure: documentOverview.documentStructure,
        document_length: documentOverview.documentLength,
        current_section: documentOverview.currentSection,
        previous_paragraph: documentOverview.previousParagraph,
        next_paragraph: documentOverview.nextParagraph,
      };
      
      const result = await invoke<string | null>('ai_autocomplete', {
        contextBefore,
        contextAfter: contextAfter || null,
        position: from,
        maxLength: dynamicMaxLength,
        editorState: editorStateForBackend,
        memoryItems: memoryItemsForBackend,
        documentFormat,
        documentOverview: documentOverviewForBackend,
      });
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('✅ [自动续写] 收到后端响应');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      if (result !== null) {
        console.log('📝 续写内容:', result || '(空)');
        console.log('📊 续写长度:', result?.length || 0, '字符');
      } else {
        console.log('⚠️ 后端返回 null');
      }
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      // 检查请求是否被取消
      if (abortController.signal.aborted) {
        console.log('[自动续写] 请求已被取消');
        return;
      }

      // 检查位置是否仍然有效
      const currentFrom = editor.state.selection.from;
      if (currentFrom !== from) {
        console.log('[自动续写] 光标已移动，不显示', { originalFrom: from, currentFrom });
        return; // 光标已移动，不显示
      }

      // 允许空结果或单独的标点符号（补全内容允许为空，允许为单独的标点符号）
      if (result !== null) {
        // 允许空字符串或单独的标点符号
        // 即使 result 是空字符串或只有标点符号，也显示（让用户看到 AI 认为不需要续写）
        const trimmedResult = result.trim();
        console.log('[自动续写] 设置幽灵文字', { 
          text: trimmedResult || '(空)', 
          length: trimmedResult.length,
          position: from 
        });
        setState({
          text: trimmedResult, // 允许空字符串
          position: from,
          isVisible: true,
          isLoading: false,
        });
        
        // 强制更新插件状态：创建一个空事务来触发插件更新
        if (editor && editor.view) {
          const { state, dispatch } = editor.view;
          const tr = state.tr;
          tr.setMeta('ghostTextUpdate', true);
          dispatch(tr);
          console.log('[自动续写] 已触发插件更新');
        }
      } else {
        console.log('[自动续写] 后端返回 null，清除状态');
        clear();
      }
    } catch (error) {
      // 忽略取消错误
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('[自动续写] 请求被取消');
        return;
      }

      // 改进错误处理，提供更友好的错误信息
      let errorMessage = '未知错误';
      if (error instanceof Error) {
        errorMessage = error.message;
        // 检查是否是网络错误
        if (errorMessage.includes('connection') || errorMessage.includes('network') || errorMessage.includes('网络')) {
          console.error('[自动续写] 网络错误:', errorMessage);
          // 网络错误时，不清除状态，允许用户重试
          setState((prev) => ({
            ...prev,
            isLoading: false,
          }));
          return;
        }
      }
      
      console.error('[自动续写] 自动补全失败:', error);
      clear();
    } finally {
      if (abortControllerRef.current === abortController) {
        abortControllerRef.current = null;
      }
    }
  }, [editor, enabled, minContextLength, maxLength, clear, documentPath, workspacePath, extractDocumentOverview]);

  // 提取编辑器状态信息
  function extractEditorState(editor: Editor, position: number): EditorState {
    const { state } = editor;
    const $pos = state.doc.resolve(position);
    const node = $pos.node();
    
    const editorState: EditorState = {
      nodeType: node.type.name,
    };
    
    // 检查是否是标题
    if (node.type.name.startsWith('heading')) {
      const levelMatch = node.type.name.match(/heading(\d)/);
      if (levelMatch) {
        editorState.headingLevel = parseInt(levelMatch[1]);
      }
    }
    
    // 检查是否是列表
    if (node.type.name === 'listItem') {
      // 查找父节点
      let depth = $pos.depth;
      while (depth > 0) {
        const parent = $pos.node(depth);
        if (parent.type.name === 'bulletList') {
          editorState.listType = 'unordered';
          editorState.listLevel = $pos.depth - depth;
          break;
        } else if (parent.type.name === 'orderedList') {
          editorState.listType = 'ordered';
          editorState.listLevel = $pos.depth - depth;
          break;
        }
        depth--;
      }
    }
    
    // 检查块类型
    if (node.type.name === 'blockquote') {
      editorState.blockType = 'blockquote';
    } else if (node.type.name === 'codeBlock') {
      editorState.blockType = 'codeBlock';
    }
    
    return editorState;
  }
  
  // 从文本提取关键词
  function extractKeywords(text: string): string[] {
    // 简单提取：去除标点，提取长度>=2的词
    const words = text
      .replace(/[^\u4e00-\u9fa5a-zA-Z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 2);
    
    // 去重并返回前10个
    return Array.from(new Set(words)).slice(0, 10);
  }
  
  // 获取文档格式
  function getDocumentFormat(path: string): string {
    const ext = path.split('.').pop()?.toLowerCase() || 'txt';
    if (ext === 'docx' || ext === 'draft') {
      return 't-docx';
    }
    return ext;
  }
  

  // 接受补全
  const accept = useCallback(() => {
    // 允许空文本（补全内容允许为空，允许为单独的标点符号）
    if (!editor || state.position === null || state.text === null) {
      console.log('[自动续写] accept 被调用但条件不满足', { hasEditor: !!editor, hasText: state.text !== null, position: state.position });
      return;
    }

    const { text, position } = state;
    // text 可能为空字符串或只有标点符号，这是允许的
    const displayText = text || '(空)';
    console.log('[自动续写] 接受续写', { text: displayText.substring(0, 30) + '...', position, textLength: text.length });

    // 先清除状态（这样 Extension 的 getGhostText 会返回 null）
    setState({
      text: null,
      position: null,
      isVisible: false,
      isLoading: false,
    });

    // 立即取消请求
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    // 先清除装饰，然后插入内容
    // 使用 Promise 确保装饰清除后再插入内容
    setTimeout(() => {
      if (editor && editor.view) {
        // 第一步：清除装饰
        const { state: viewState, dispatch } = editor.view;
        const clearTr = viewState.tr;
        clearTr.setMeta('ghostTextUpdate', true);
        dispatch(clearTr);
        console.log('[自动续写] 已清除装饰');
        
        // 第二步：等待装饰清除后，插入内容
        setTimeout(() => {
          if (editor) {
            // 插入内容（这会触发文档变化和自动保存等逻辑）
            // 允许空文本或标点符号
            const contentToInsert = text || '';
            editor
              .chain()
              .focus()
              .insertContentAt(position, contentToInsert)
              .run();
            console.log('[自动续写] 内容已插入', { position, textLength: text.length });
          }
        }, 50); // 延迟确保装饰已清除并重新渲染
      }
    }, 0);
  }, [editor, state]);

  // 监听编辑器事件：用户输入或移动光标时清除幽灵文字（不自动触发）
  useEffect(() => {
    if (!editor || !enabled) return;

    const handleSelectionUpdate = () => {
      clear();
      isUserTypingRef.current = false;
    };

    const handleUpdate = () => {
      isUserTypingRef.current = true;
      clear();
    };

    editor.on('selectionUpdate', handleSelectionUpdate);
    editor.on('update', handleUpdate);

    return () => {
      editor.off('selectionUpdate', handleSelectionUpdate);
      editor.off('update', handleUpdate);
      clear();
    };
  }, [editor, enabled, clear]);

  // 快捷键触发：Cmd+J (macOS) / Ctrl+J (Windows) 触发续写
  useEffect(() => {
    if (!editor || !enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      // 仅在编辑器聚焦且按下 Cmd+J (Mac) 或 Ctrl+J (Win) 时触发
      if (!editor.isFocused) return;
      if (event.key !== 'j') return;
      const isMod = navigator.platform.includes('Mac') ? event.metaKey : event.ctrlKey;
      if (!isMod) return;

      event.preventDefault();
      event.stopPropagation();
      console.log('[自动续写] 快捷键触发：Cmd+J/Ctrl+J 请求续写');
      clear(); // 先清除已有幽灵文字
      trigger();
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [editor, enabled, trigger, clear]);

  // 处理键盘事件（Tab 接受，Escape 拒绝）
  useEffect(() => {
    if (!editor || !state.isVisible) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      // 仅在编辑器聚焦且幽灵文字可见时处理
      if (!editor.isFocused || !state.isVisible) return;

      // 使用 Tab 键接受续写（最常用且未被系统占用）
      if (event.key === 'Tab' && !event.shiftKey) {
        event.preventDefault();
        event.stopPropagation();
        console.log('[自动续写] 快捷键触发：Tab 接受续写');
        accept();
        return;
      }

      // Escape 键拒绝续写（用户可再次按 Cmd+J/Ctrl+J 重新触发）
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        console.log('[自动续写] 快捷键触发：Esc 拒绝续写');
        clear();
      }
    };

    // 使用 capture 阶段，确保优先处理
    document.addEventListener('keydown', handleKeyDown, true);

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [editor, state.isVisible, accept, clear, enabled]);

  // 暴露 getGhostText 函数供 Extension 使用
  const getGhostText = useCallback(() => {
    // 允许空文本（补全内容允许为空，允许为单独的标点符号）
    if (!state.isVisible || state.position === null || state.text === null) {
      return null;
    }
    // text 可能为空字符串，这是允许的
    return {
      text: state.text,
      position: state.position,
    };
  }, [state]);

  return {
    state,
    trigger,
    clear,
    accept,
    getGhostText, // 供 Extension 使用
  };
}
