import { useState, useEffect, useCallback } from 'react';
import type { Editor } from '@tiptap/core';

/**
 * 从 TipTap 编辑器的 PaginationPlus 扩展获取分页信息
 * 用于 PageNavigator 的 currentPage、totalPages、scrollToPage
 */
export function usePaginationFromEditor(editor: Editor | null, enabled: boolean) {
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // 获取分页 DOM 容器和页码（PaginationPlus 使用 [data-rm-pagination] 容器）
  const getPageElements = useCallback(() => {
    if (!editor?.view?.dom) return null;
    const dom = editor.view.dom;
    const paginationEl = dom.querySelector('[data-rm-pagination]') as HTMLElement | null;
    const pageBreaks = paginationEl?.querySelectorAll('.rm-page-break') ?? paginationEl?.children;
    return { dom, paginationEl, pageBreaks };
  }, [editor]);

  // 查找滚动容器：返回从 dom 向上第一个 overflow-y: auto/scroll 的祖先
  // 未缩放时滚动在 EditorContent，已缩放时在 editor-zoom-scroll
  const getScrollContainer = useCallback(() => {
    const { dom } = getPageElements() || {};
    if (!dom) return null;
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
  }, [getPageElements]);

  // 更新总页数（PaginationPlus 的 [data-rm-pagination] 的 children 数量）
  useEffect(() => {
    if (!enabled || !editor) return;
    const updateTotal = () => {
      const { paginationEl } = getPageElements() || {};
      const count = paginationEl?.children?.length ?? 0;
      setTotalPages(Math.max(1, count));
    };
    updateTotal();
    const timer = setInterval(updateTotal, 500);
    return () => clearInterval(timer);
  }, [enabled, editor, getPageElements]);

  // 当前页检测：以滚动容器视口中心所在的 .rm-page-break 为准，反映用户正在浏览的页
  useEffect(() => {
    if (!enabled || !editor) return;
    const container = getScrollContainer();
    if (!container) return;

    const updateCurrentPage = () => {
      const { pageBreaks } = getPageElements() || {};
      const breaks = pageBreaks ? (Array.from(pageBreaks) as HTMLElement[]) : [];
      if (breaks.length === 0) return;
      const rect = container.getBoundingClientRect();
      const centerY = rect.top + rect.height / 2;
      let page = 1;
      for (let i = 0; i < breaks.length; i++) {
        const brRect = breaks[i].getBoundingClientRect();
        if (centerY >= brRect.top && centerY <= brRect.bottom) {
          page = i + 1;
          break;
        }
        if (centerY < brRect.top) {
          page = Math.max(1, i);
          break;
        }
        page = i + 1;
      }
      setCurrentPage(Math.min(page, breaks.length));
    };

    const onScroll = () => requestAnimationFrame(updateCurrentPage);
    container.addEventListener('scroll', onScroll, { passive: true });
    updateCurrentPage();
    const raf = requestAnimationFrame(updateCurrentPage);
    return () => {
      container.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(raf);
    };
  }, [enabled, editor, totalPages, getScrollContainer, getPageElements]);

  // 滚动到指定页
  const scrollToPage = useCallback(
    (page: number) => {
      const { pageBreaks } = getPageElements() || {};
      const breaks = pageBreaks ? (Array.from(pageBreaks) as HTMLElement[]) : [];
      if (breaks.length === 0 || page < 1 || page > breaks.length) return;
      const target = breaks[page - 1];
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setCurrentPage(page);
    },
    [getPageElements]
  );

  return { currentPage, totalPages, scrollToPage };
}
