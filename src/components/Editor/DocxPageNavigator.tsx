import React from 'react';
import type { Editor } from '@tiptap/core';
import PageNavigator from './PageNavigator';
import { usePaginationFromEditor } from '../../hooks/usePaginationFromEditor';

interface DocxPageNavigatorProps {
  editor: Editor | null;
}

/**
 * T-DOCX 分页模式下的页码导航栏
 * 使用 PaginationPlus 的 DOM 结构获取页码信息
 */
const DocxPageNavigator: React.FC<DocxPageNavigatorProps> = ({ editor }) => {
  const { currentPage, totalPages, scrollToPage } = usePaginationFromEditor(editor, !!editor);

  return (
    <PageNavigator
      currentPage={currentPage}
      totalPages={totalPages}
      onPageChange={scrollToPage}
    />
  );
};

export default DocxPageNavigator;
