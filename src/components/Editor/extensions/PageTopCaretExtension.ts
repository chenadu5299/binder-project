/**
 * 分页模式光标扩展：全篇模拟光标（非仅首行）
 * 分页模式下，光标态时始终隐藏原生、显示模拟光标，覆盖文档任意位置。
 * 模拟光标挂载到编辑器滚动容器（scrollContainer ?? body），保持层叠上下文，避免浮在工具栏上方。
 * @see docs/分页模式光标与遮罩完整方案.md
 */

import { Extension } from '@tiptap/core';

const SIMULATED_CARET_CLASS = 'rm-page-top-caret';
const BASE_CARET_WIDTH = 2;

const DEBUG = false;
function log(..._args: unknown[]) {
  if (DEBUG) console.warn('[PageTopCaret]', ..._args);
}

type Coords = { top: number; bottom: number; left: number; right: number };
type ViewLike = { dom: HTMLElement; coordsAtPos: (pos: number) => Coords };

function getScaleFactor(dom: HTMLElement): number {
  const rect = dom.getBoundingClientRect();
  const logicalW = dom.offsetWidth;
  if (!logicalW || rect.width <= 0) return 1;
  const scale = rect.width / logicalW;
  return Number.isFinite(scale) && scale > 0 ? scale : 1;
}

function getScrollContainer(dom: HTMLElement): HTMLElement | null {
  let el: HTMLElement | null = dom.parentElement;
  while (el) {
    const style = window.getComputedStyle(el);
    const overflowY = style.overflowY;
    if (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') {
      return el;
    }
    el = el.parentElement;
  }
  return null;
}

function updateCaret(
  editor: { view?: ViewLike; state?: { selection: { empty: boolean; from: number } } },
  simulatedCaret: HTMLElement | null
) {
  if (!editor.view?.dom || !editor.state) {
    log('updateCaret: 提前返回', { hasView: !!editor.view?.dom, hasState: !!editor.state });
    return;
  }
  if (!simulatedCaret) {
    log('updateCaret: simulatedCaret 为空');
    return;
  }
  const { view, state } = editor;
  const { selection } = state;

  const isFocused =
    document.activeElement === view.dom || view.dom.contains(document.activeElement);
  if (!isFocused) {
    log('updateCaret: 未聚焦', {
      activeTag: document.activeElement?.tagName,
      viewTag: view.dom?.tagName,
    });
    view.dom.dataset.caretAtPageTop = 'false';
    simulatedCaret.style.display = 'none';
    return;
  }

  if (!selection.empty) {
    log('updateCaret: 有选区，非光标态');
    view.dom.dataset.caretAtPageTop = 'false';
    simulatedCaret.style.display = 'none';
    return;
  }

  // 分页模式 + 光标态：隐藏原生、显示模拟
  view.dom.dataset.caretAtPageTop = 'true';
  try {
    const rect = view.coordsAtPos(selection.from);
    const scale = getScaleFactor(view.dom);
    const width = Math.max(0.5, BASE_CARET_WIDTH * scale);
    const height = rect.bottom - rect.top;
    if (height <= 0) {
      log('updateCaret: height<=0', { rect, height });
      simulatedCaret.style.display = 'none';
      return;
    }
    simulatedCaret.style.left = `${rect.left}px`;
    simulatedCaret.style.top = `${rect.top}px`;
    simulatedCaret.style.width = `${width}px`;
    simulatedCaret.style.height = `${height}px`;
    simulatedCaret.style.display = 'block';
    log('updateCaret: 已显示模拟光标', { from: selection.from, left: rect.left, top: rect.top, width, height });
  } catch (e) {
    log('updateCaret: coordsAtPos 异常', e);
    simulatedCaret.style.display = 'none';
  }
}

export const PageTopCaretExtension = Extension.create({
  name: 'pageTopCaret',

  onCreate() {
    log('onCreate 执行');
    const editor = this.editor;
    let view: ViewLike | undefined;
    try {
      view = editor.view;
    } catch {
      log('onCreate: view 未就绪（编辑器可能未挂载），跳过');
      return;
    }
    if (!view?.dom) {
      log('onCreate: view.dom 不可用，跳过');
      return;
    }
    const hasClass = view.dom.classList.contains('rm-with-pagination');
    const hasPaginationEl = !!view.dom.querySelector('[data-rm-pagination]');
    const hasPagination = hasClass || hasPaginationEl;
    log('onCreate:', { hasClass, hasPaginationEl, hasPagination });
    if (!hasPagination) {
      log('onCreate: 非分页模式，跳过');
      return;
    }

    const scrollContainer = getScrollContainer(view.dom);
    const mountParent = scrollContainer ?? document.body;

    const simulatedCaret = document.createElement('div');
    simulatedCaret.className = SIMULATED_CARET_CLASS;
    simulatedCaret.style.cssText = 'position:fixed;pointer-events:none;z-index:998;display:none;';
    mountParent.appendChild(simulatedCaret);
    this.storage.simulatedCaret = simulatedCaret;
    log('onCreate: 已创建 simulatedCaret，已挂载到', scrollContainer ? 'scrollContainer' : 'body');

    const simRef = this.storage.simulatedCaret; // 闭包捕获
    // 用 DOM 状态判断是否已销毁，避免 storage.destroyed 在 React Strict Mode/HMR 下的时序问题
    const isDestroyed = () => !simRef?.parentNode;
    const scheduleUpdate = () => {
      if (isDestroyed()) {
        log('scheduleUpdate: simulatedCaret 已从 DOM 移除，跳过');
        return;
      }
      requestAnimationFrame(() => {
        if (isDestroyed()) return;
        requestAnimationFrame(() => {
          if (isDestroyed()) return;
          try {
            if (!editor.view?.dom || !editor.state) {
              log('scheduleUpdate: view/state 不可用');
              return;
            }
          } catch {
            log('scheduleUpdate: 编辑器未挂载或已销毁，跳过');
            return;
          }
          const sim = simRef;
          if (!sim) log('scheduleUpdate: simulatedCaret 为空!');
          updateCaret(editor, sim);
        });
      });
    };

    editor.on('selectionUpdate', scheduleUpdate);
    editor.on('transaction', scheduleUpdate);
    view.dom.addEventListener('blur', scheduleUpdate);
    setTimeout(scheduleUpdate, 100);

    if (scrollContainer) {
      scrollContainer.addEventListener('scroll', scheduleUpdate, { passive: true });
    }
    const ro = new ResizeObserver(scheduleUpdate);
    ro.observe(view.dom);

    this.storage.scrollCleanup = () => {
      editor.off('selectionUpdate', scheduleUpdate);
      editor.off('transaction', scheduleUpdate);
      view.dom.removeEventListener('blur', scheduleUpdate);
      scrollContainer?.removeEventListener('scroll', scheduleUpdate);
      ro.disconnect();
    };
  },

  onDestroy() {
    const cleanup = (this.storage as { scrollCleanup?: () => void }).scrollCleanup;
    if (cleanup) cleanup();
    const sim = (this.storage as { simulatedCaret?: HTMLElement }).simulatedCaret;
    if (sim?.parentNode) sim.parentNode.removeChild(sim);
  },

  addStorage() {
    return {
      scrollCleanup: undefined as (() => void) | undefined,
      simulatedCaret: null as HTMLElement | null,
    };
  },
});
