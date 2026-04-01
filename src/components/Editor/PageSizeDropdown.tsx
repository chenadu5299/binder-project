import React, { useState, useRef, useEffect } from 'react';
import { Editor } from '@tiptap/react';
import { ChevronDownIcon, DocumentDuplicateIcon } from '@heroicons/react/24/outline';
import { PAGE_SIZES, type PageSize } from 'tiptap-pagination-plus';

const PAGE_OPTIONS: { key: string; label: string; size: PageSize }[] = [];

Object.entries(PAGE_SIZES).forEach(([name, size]) => {
  PAGE_OPTIONS.push({
    key: `${name}-portrait`,
    label: `${name} 竖排`,
    size: { ...size },
  });
  PAGE_OPTIONS.push({
    key: `${name}-landscape`,
    label: `${name} 横排`,
    size: {
      pageHeight: size.pageWidth,
      pageWidth: size.pageHeight,
      marginTop: size.marginTop,
      marginBottom: size.marginBottom,
      marginLeft: size.marginLeft,
      marginRight: size.marginRight,
    },
  });
});

function matchPageSize(current: { pageHeight: number; pageWidth: number }, opts: PageSize): boolean {
  return current.pageHeight === opts.pageHeight && current.pageWidth === opts.pageWidth;
}

function getPaginationOptions(editor: Editor | null) {
  const ext = editor?.extensionManager?.extensions?.find((e: { name: string }) => e.name === 'PaginationPlus');
  return (ext as { options?: { pageHeight?: number; pageWidth?: number } })?.options;
}

interface PageSizeDropdownProps {
  editor: Editor | null;
}

const PageSizeDropdown: React.FC<PageSizeDropdownProps> = ({ editor }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [currentKey, setCurrentKey] = useState<string>('A4-portrait');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const opts = getPaginationOptions(editor);
  const pageHeight = opts?.pageHeight ?? 1123;
  const pageWidth = opts?.pageWidth ?? 794;

  useEffect(() => {
    const found = PAGE_OPTIONS.find((o) => matchPageSize({ pageHeight, pageWidth }, o.size));
    if (found) setCurrentKey(found.key);
  }, [pageHeight, pageWidth]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const selected = PAGE_OPTIONS.find((o) => o.key === currentKey) || PAGE_OPTIONS[0];

  const handleSelect = (opt: (typeof PAGE_OPTIONS)[0]) => {
    (editor?.chain().focus() as any).updatePageSize(opt.size).run();
    editor?.view?.dispatch(editor.state.tr);
    setCurrentKey(opt.key);
    setIsOpen(false);
  };

  return (
    <div className="relative shrink-0" ref={dropdownRef}>
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-1 shrink-0"
        title="页面尺寸"
      >
        <DocumentDuplicateIcon className="w-4 h-4" />
        <span className="text-xs whitespace-nowrap">{selected.label}</span>
        <ChevronDownIcon className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div className="absolute top-full left-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded shadow-lg z-20 min-w-[140px] max-h-64 overflow-y-auto">
            {PAGE_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleSelect(opt);
                }}
                className={`w-full px-3 py-2 text-left text-xs hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 ${
                  currentKey === opt.key ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' : ''
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default PageSizeDropdown;
