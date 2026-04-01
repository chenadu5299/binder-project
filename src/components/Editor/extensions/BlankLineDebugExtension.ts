/**
 * 空白行调试扩展：在 T-DOCX 分页模式下记录文档结构、DOM 结构、CSS 计算样式，
 * 用于定位「回车后自动多出空白行」问题的根因。
 * 启用：设置 DEBUG_BLANK_LINE = true
 * 手动捕获：按 Cmd+Shift+D (Mac) 或 Ctrl+Shift+D (Win) 触发完整捕获
 */

import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

const DEBUG_BLANK_LINE = false; // 设为 true 启用调试日志
const DEBUG_THROTTLE_MS = 300; // 节流，避免控制台刷屏
const CAPTURE_KEY = 'd'; // Cmd/Ctrl+Shift+D 触发手动捕获

function scanDocStructure(doc: any): Record<string, unknown> {
  const blocks: Array<{ type: string; pos: number; isEmpty: boolean; content: string }> = [];
  let hardBreakCount = 0;
  doc.descendants((node: any, pos: number) => {
    if (node.type.name === 'hardBreak') {
      hardBreakCount++;
      return true;
    }
    if (['paragraph', 'heading', 'blockquote', 'listItem'].includes(node.type.name)) {
      const text = node.textContent?.trim() || '';
      blocks.push({
        type: node.type.name,
        pos,
        isEmpty: text.length === 0,
        content: text.slice(0, 30) + (text.length > 30 ? '...' : ''),
      });
    }
    return true;
  });
  return { blocks, hardBreakCount, totalBlocks: blocks.length, emptyBlocks: blocks.filter(b => b.isEmpty).length };
}

function scanDOM(dom: HTMLElement): Record<string, unknown> {
  const trailingBreaks = dom.querySelectorAll('br.ProseMirror-trailingBreak');
  const rmBrDecorations = dom.querySelectorAll('.rm-br-decoration');
  const paragraphs = dom.querySelectorAll('p, h1, h2, h3, h4, h5, h6');
  const pageBreaks = dom.querySelectorAll('.rm-page-break');
  const blocksWithTrailingBreak: Array<{ tag: string; html: string; hasContent: boolean; onlyChild: boolean }> = [];
  const suspiciousBlocks: Array<{ tag: string; reason: string; html: string }> = [];

  paragraphs.forEach((p) => {
    const br = p.querySelector('br.ProseMirror-trailingBreak');
    if (br) {
      const hasContent = (p.textContent?.trim().length ?? 0) > 0;
      const onlyChild = p.childNodes.length === 1 && p.childNodes[0] === br;
      blocksWithTrailingBreak.push({
        tag: p.tagName,
        html: p.innerHTML.slice(0, 80) + (p.innerHTML.length > 80 ? '...' : ''),
        hasContent,
        onlyChild,
      });
      if (hasContent && !onlyChild) {
        suspiciousBlocks.push({
          tag: p.tagName,
          reason: '非空段落含 trailingBreak，可能多出一行',
          html: p.innerHTML.slice(0, 60),
        });
      }
    }
  });

  return {
    trailingBreakCount: trailingBreaks.length,
    rmBrDecorationCount: rmBrDecorations.length,
    paragraphCount: paragraphs.length,
    pageBreakCount: pageBreaks.length,
    blocksWithTrailingBreak,
    suspiciousBlocks,
  };
}

function logBlankLineDebug(editor: any, layoutMode: string) {
  if (!DEBUG_BLANK_LINE || layoutMode !== 'page') return;

  const { doc } = editor.state;
  const docInfo = scanDocStructure(doc);
  const domInfo = scanDOM(editor.view.dom);

  console.group('[BlankLineDebug] 分页模式更新');
  console.log('1. 文档结构 (doc):', {
    totalBlocks: docInfo.totalBlocks,
    emptyBlocks: docInfo.emptyBlocks,
    hardBreakCount: docInfo.hardBreakCount,
    blocks: (docInfo.blocks as any[])?.map((b, i) => `${i}: ${b.type} empty=${b.isEmpty} "${b.content}"`),
  });
  console.log('2. DOM 结构:', {
    trailingBreakCount: domInfo.trailingBreakCount,
    rmBrDecorationCount: domInfo.rmBrDecorationCount,
    paragraphCount: domInfo.paragraphCount,
    pageBreakCount: domInfo.pageBreakCount,
  });
  console.log('3. 含 trailingBreak 的块:', (domInfo.blocksWithTrailingBreak as any[])?.map((b, i) =>
    `${i}: ${b.tag} hasContent=${b.hasContent} onlyChild=${b.onlyChild} html: ${(b.html || '').substring(0, 50)}`
  ));
  if ((domInfo.suspiciousBlocks as any[])?.length) {
    console.warn('4. ⚠️ 可疑块 (可能产生空白行):', domInfo.suspiciousBlocks);
  }
  console.log('5. 保存的 HTML 长度:', editor.getHTML().length);
  console.log('6. 编辑器 DOM 直接子节点:', Array.from(editor.view.dom.children).map((c, i) =>
    `${i}: ${(c as HTMLElement).tagName} ${(c as HTMLElement).className || ''}`
  ));
  console.groupEnd();
}

/** 获取元素的计算样式（与布局相关的关键属性） */
function getComputedStylesForElement(el: HTMLElement): Record<string, string> {
  const s = window.getComputedStyle(el);
  const keys = [
    'display', 'width', 'height', 'min-height', 'max-height',
    'margin', 'margin-top', 'margin-bottom', 'padding', 'padding-top', 'padding-bottom',
    'line-height', 'font-size', 'box-sizing', 'overflow', 'overflow-y',
    'border-collapse', 'border-spacing', 'empty-cells', 'table-layout',
  ];
  const out: Record<string, string> = {};
  keys.forEach((k) => { out[k] = s.getPropertyValue(k); });
  return out;
}

/** 完整捕获：视觉截图提示 + CSS 计算样式 + 保存内容样本（用于与 Rust 端对比） */
function captureBlankLineDebug(editor: any) {
  const ts = new Date().toISOString();
  const { doc } = editor.state;
  const { selection } = editor.state;
  const docInfo = scanDocStructure(doc);
  const domInfo = scanDOM(editor.view.dom);
  const html = editor.getHTML();

  console.group(`[BlankLineDebug] 🔬 完整捕获 ${ts}`);
  console.log(
    '%c=== 请在此刻手动截图 ===\n' +
    'Chrome: F12 -> Elements -> 选中 .rm-with-pagination 或 .ProseMirror -> 右键 -> Capture node screenshot\n' +
    '或直接对整个页面截图，确保能看到空白行',
    'background:#ff0;color:#000;padding:8px;font-weight:bold;'
  );
  console.log('1. 时间戳:', ts);
  console.log('2. 文档结构:', docInfo);
  console.log('3. DOM 结构:', domInfo);

  // 光标附近的段落 + 空段落的 CSS 计算样式
  const paragraphs = editor.view.dom.querySelectorAll('p, h1, h2, h3, h4, h5, h6');
  const cursorPos = selection.from;
  const emptyWithBr: HTMLElement[] = [];
  paragraphs.forEach((p: Element) => {
    const br = (p as HTMLElement).querySelector('br.ProseMirror-trailingBreak');
    if (br && (p as HTMLElement).childNodes.length === 1) emptyWithBr.push(p as HTMLElement);
  });
  const cursorRes = editor.view.domAtPos(cursorPos);
  const cursorDomNode = cursorRes.node as Node;
  let cursorBlock: HTMLElement | null = cursorDomNode?.nodeType === 1
    ? (cursorDomNode as HTMLElement) : (cursorDomNode?.parentElement as HTMLElement) || null;
  if (cursorBlock && !['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(cursorBlock.tagName)) {
    cursorBlock = cursorBlock.closest?.('p, h1, h2, h3, h4, h5, h6') || null;
  }
  const cssSamples: Array<{ desc: string; tag: string; styles: Record<string, string> }> = [];
  emptyWithBr.slice(0, 5).forEach((el, i) => {
    cssSamples.push({ desc: `空段落(含trailingBreak)#${i + 1}`, tag: el.tagName, styles: getComputedStylesForElement(el) });
  });
  if (cursorBlock) {
    cssSamples.push({ desc: '光标所在块', tag: cursorBlock.tagName, styles: getComputedStylesForElement(cursorBlock) });
  }
  console.log('4. CSS 计算样式（空段落 + 光标所在块）:', cssSamples);

  console.log('5. 保存的 HTML 样本:', {
    length: html.length,
    first500: html.slice(0, 500),
    last500: html.slice(-500),
    emptyParagraphCount: (html.match(/<p>\s*<\/p>|<p><br\s*\/?><\/p>/gi) || []).length,
  });
  console.groupEnd();
}

export const BlankLineDebugExtension = Extension.create({
  name: 'blankLineDebug',

  addOptions() {
    return { layoutMode: 'flow' as 'page' | 'flow' };
  },

  addProseMirrorPlugins() {
    const ext = this;
    const layoutMode = ext.options.layoutMode || 'flow';
    if (!DEBUG_BLANK_LINE || layoutMode !== 'page') return [];

    return [
      new Plugin({
        key: new PluginKey('blankLineDebugCapture'),
        props: {
          handleKeyDown(_view, event) {
            if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key?.toLowerCase() === CAPTURE_KEY) {
              event.preventDefault();
              const editor = (ext as any).editor;
              if (editor && !editor.isDestroyed) {
                captureBlankLineDebug(editor);
              }
              return true;
            }
            return false;
          },
        },
      }),
    ];
  },

  onCreate() {
    const editor = this.editor;
    const layoutMode = this.options.layoutMode || 'flow';
    if (!DEBUG_BLANK_LINE || layoutMode !== 'page') return;

    let lastLog = 0;
    let lastBlockCount = 0;
    editor.on('update', () => {
      requestAnimationFrame(() => {
        if (editor.isDestroyed) return;
        const now = Date.now();
        const { doc } = editor.state;
        const blockCount = doc.content.childCount;
        const shouldLog =
          now - lastLog > DEBUG_THROTTLE_MS ||
          blockCount !== lastBlockCount;
        if (shouldLog) {
          lastLog = now;
          lastBlockCount = blockCount;
          logBlankLineDebug(editor, layoutMode);
        }
      });
    });
    console.log('[BlankLineDebug] 已启用。按 Cmd+Shift+D (Mac) 或 Ctrl+Shift+D (Win) 触发完整捕获（截图+CSS+HTML样本）');
  },
});
