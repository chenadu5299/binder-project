import React from 'react';
import { Editor } from '@tiptap/react';
import {
  BoldIcon,
  ItalicIcon,
  ListBulletIcon,
  LinkIcon,
  PhotoIcon,
  DocumentTextIcon,
  ChartBarIcon,
  Bars3BottomLeftIcon,
  Bars3BottomRightIcon,
  Bars3Icon,
} from '@heroicons/react/24/outline';
import { useLayoutStore } from '../../stores/layoutStore';
import { useEditorStore } from '../../stores/editorStore';
import { toast } from '../Common/Toast';
import ToolbarDropdown from './ToolbarDropdown';

interface EditorToolbarProps {
  editor: Editor | null;
  fileType: 'docx' | 'md' | 'html' | 'txt' | 'pdf' | 'image';
  documentPath?: string;
}

const EditorToolbar: React.FC<EditorToolbarProps> = ({ editor, fileType, documentPath }) => {
  const { analysis, setAnalysisVisible } = useLayoutStore();
  const { tabs, activeTabId } = useEditorStore();
  const [headingLevel, setHeadingLevel] = React.useState<string | number>('paragraph');
  const [textAlign, setTextAlign] = React.useState<string>('left');
  
  // 获取当前标签页
  const activeTab = tabs.find(t => t.id === activeTabId);
  
  // 监听编辑器状态变化，更新标题等级
  React.useEffect(() => {
    if (!editor) return;
    
    const updateHeadingLevel = () => {
      if (editor.isActive('heading', { level: 1 })) {
        setHeadingLevel(1);
      } else if (editor.isActive('heading', { level: 2 })) {
        setHeadingLevel(2);
      } else if (editor.isActive('heading', { level: 3 })) {
        setHeadingLevel(3);
      } else if (editor.isActive('heading', { level: 4 })) {
        setHeadingLevel(4);
      } else if (editor.isActive('heading', { level: 5 })) {
        setHeadingLevel(5);
      } else if (editor.isActive('heading', { level: 6 })) {
        setHeadingLevel(6);
      } else {
        setHeadingLevel('paragraph');
      }
    };

    updateHeadingLevel();
    editor.on('update', updateHeadingLevel);
    editor.on('selectionUpdate', updateHeadingLevel);

    return () => {
      editor.off('update', updateHeadingLevel);
      editor.off('selectionUpdate', updateHeadingLevel);
    };
  }, [editor]);

  // 监听文本对齐状态变化
  React.useEffect(() => {
    if (!editor) return;
    
    const updateTextAlign = () => {
      if (editor.isActive({ textAlign: 'left' })) {
        setTextAlign('left');
      } else if (editor.isActive({ textAlign: 'center' })) {
        setTextAlign('center');
      } else if (editor.isActive({ textAlign: 'right' })) {
        setTextAlign('right');
      } else if (editor.isActive({ textAlign: 'justify' })) {
        setTextAlign('justify');
      } else {
        setTextAlign('left');
      }
    };

    updateTextAlign();
    editor.on('update', updateTextAlign);
    editor.on('selectionUpdate', updateTextAlign);

    return () => {
      editor.off('update', updateTextAlign);
      editor.off('selectionUpdate', updateTextAlign);
    };
  }, [editor]);
  
  // 早期返回：如果没有编辑器，不显示工具栏
  if (!editor) return null;
  
  // PDF 和图片文件不显示工具栏
  if (fileType === 'pdf' || fileType === 'image') {
    return null;
  }

  // 根据文件类型显示不同的工具栏按钮
  const showFullToolbar = fileType === 'docx' || fileType === 'html';

  return (
    <div className="flex items-center gap-0.5 p-1.5 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 min-w-0 flex-wrap">
      {/* 自动续写开关 */}
      <label className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer shrink-0">
        <input
          type="checkbox"
          checked={activeTab?.autoCompleteEnabled ?? true}
          onChange={(e) => {
            if (activeTab) {
              const { setAutoCompleteEnabled } = useEditorStore.getState();
              setAutoCompleteEnabled(activeTab.id, e.target.checked);
            }
          }}
          className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 dark:focus:ring-blue-400"
          title="自动续写"
        />
        <span className="text-xs text-gray-700 dark:text-gray-300 whitespace-nowrap">自动续写</span>
      </label>
      <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-0.5 shrink-0" />
      
      {/* 基础格式 */}
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          editor.chain().focus().toggleBold().run();
        }}
        className={`p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 shrink-0 ${
          editor.isActive('bold') ? 'bg-blue-100 dark:bg-blue-900' : ''
        }`}
        title="粗体 (Cmd+B)"
      >
        <BoldIcon className="w-4 h-4" />
      </button>
      
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          editor.chain().focus().toggleItalic().run();
        }}
        className={`p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 shrink-0 ${
          editor.isActive('italic') ? 'bg-blue-100 dark:bg-blue-900' : ''
        }`}
        title="斜体 (Cmd+I)"
      >
        <ItalicIcon className="w-4 h-4" />
      </button>

      {/* 下划线和删除线 */}
      {showFullToolbar && (
        <>
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              editor.chain().focus().toggleUnderline().run();
            }}
            className={`p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 shrink-0 ${
              editor.isActive('underline') ? 'bg-blue-100 dark:bg-blue-900' : ''
            }`}
            title="下划线 (Cmd+U)"
          >
            <span className="text-xs font-semibold underline">U</span>
          </button>
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              editor.chain().focus().toggleStrike().run();
            }}
            className={`p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 shrink-0 ${
              editor.isActive('strike') ? 'bg-blue-100 dark:bg-blue-900' : ''
            }`}
            title="删除线"
          >
            <span className="text-xs font-semibold line-through">S</span>
          </button>
        </>
      )}

      {/* 标题下拉菜单 */}
      {showFullToolbar && (
        <>
          <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-0.5 shrink-0" />
          <ToolbarDropdown
            options={[
              { label: '正文', value: 'paragraph' },
              { label: '标题 1', value: 1, icon: <DocumentTextIcon className="w-3 h-3" /> },
              { label: '标题 2', value: 2, icon: <DocumentTextIcon className="w-3 h-3" /> },
              { label: '标题 3', value: 3, icon: <DocumentTextIcon className="w-3 h-3" /> },
              { label: '标题 4', value: 4, icon: <DocumentTextIcon className="w-3 h-3" /> },
              { label: '标题 5', value: 5, icon: <DocumentTextIcon className="w-3 h-3" /> },
              { label: '标题 6', value: 6, icon: <DocumentTextIcon className="w-3 h-3" /> },
            ]}
            value={headingLevel}
            onChange={(value) => {
              if (value === 'paragraph') {
                editor.chain().focus().setParagraph().run();
              } else if (typeof value === 'number') {
                editor.chain().focus().toggleHeading({ level: value as 1 | 2 | 3 | 4 | 5 | 6 }).run();
              }
            }}
            buttonLabel={headingLevel === 'paragraph' ? '正文' : `标题 ${headingLevel}`}
            buttonIcon={<DocumentTextIcon className="w-4 h-4" />}
            title="标题"
            isActive={editor.isActive('heading')}
          />
        </>
      )}

      {/* 列表 */}
      <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-0.5 shrink-0" />
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          editor.chain().focus().toggleBulletList().run();
        }}
        className={`p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 shrink-0 ${
          editor.isActive('bulletList') ? 'bg-blue-100 dark:bg-blue-900' : ''
        }`}
        title="无序列表"
      >
        <ListBulletIcon className="w-4 h-4" />
      </button>
      {showFullToolbar && (
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            editor.chain().focus().toggleOrderedList().run();
          }}
          className={`p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 shrink-0 ${
            editor.isActive('orderedList') ? 'bg-blue-100 dark:bg-blue-900' : ''
          }`}
          title="有序列表"
        >
          <span className="text-xs font-semibold">1.</span>
        </button>
      )}

      {/* 文本对齐下拉菜单 */}
      {showFullToolbar && (
        <>
          <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-0.5 shrink-0" />
          <ToolbarDropdown
            options={[
              { label: '左对齐', value: 'left', icon: <Bars3BottomLeftIcon className="w-3 h-3" /> },
              { label: '居中', value: 'center', icon: <Bars3Icon className="w-3 h-3" /> },
              { label: '右对齐', value: 'right', icon: <Bars3BottomRightIcon className="w-3 h-3" /> },
              { label: '两端对齐', value: 'justify', icon: <Bars3Icon className="w-3 h-3" /> },
            ]}
            value={textAlign}
            onChange={(value) => {
              if (typeof value === 'string') {
                editor.chain().focus().setTextAlign(value as 'left' | 'center' | 'right' | 'justify').run();
              }
            }}
            buttonLabel={textAlign === 'left' ? '左对齐' : textAlign === 'center' ? '居中' : textAlign === 'right' ? '右对齐' : '两端对齐'}
            buttonIcon={<Bars3BottomLeftIcon className="w-4 h-4" />}
            title="文本对齐"
            isActive={editor.isActive({ textAlign: 'left' }) || editor.isActive({ textAlign: 'center' }) || editor.isActive({ textAlign: 'right' }) || editor.isActive({ textAlign: 'justify' })}
          />
        </>
      )}

      {/* 字体颜色和背景颜色 */}
      {showFullToolbar && (
        <>
          <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-0.5 shrink-0" />
          <div className="relative shrink-0">
            <input
              type="color"
              value={editor.getAttributes('textStyle').color || '#000000'}
              onChange={(e) => {
                editor.chain().focus().setColor(e.target.value).run();
              }}
              className="w-7 h-7 rounded border border-gray-300 dark:border-gray-600 cursor-pointer"
              title="字体颜色"
            />
          </div>
          <div className="relative shrink-0">
            <input
              type="color"
              value={editor.getAttributes('highlight').color || '#ffff00'}
              onChange={(e) => {
                editor.chain().focus().setHighlight({ color: e.target.value }).run();
              }}
              className="w-7 h-7 rounded border border-gray-300 dark:border-gray-600 cursor-pointer"
              title="背景颜色（高亮）"
            />
          </div>
        </>
      )}

      {/* 字号选择 */}
      {showFullToolbar && (
        <>
          <select
            value={editor.getAttributes('textStyle').fontSize || '16'}
            onChange={(e) => {
              editor.chain().focus().setFontSize(e.target.value).run();
            }}
            className="px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 shrink-0"
            title="字号"
          >
            <option value="10">10px</option>
            <option value="12">12px</option>
            <option value="14">14px</option>
            <option value="16">16px</option>
            <option value="18">18px</option>
            <option value="20">20px</option>
            <option value="24">24px</option>
            <option value="28">28px</option>
            <option value="32">32px</option>
            <option value="36">36px</option>
          </select>
        </>
      )}

      {/* 字体族选择 */}
      {showFullToolbar && (
        <>
          <select
            value={editor.getAttributes('textStyle').fontFamily || 'default'}
            onChange={(e) => {
              if (e.target.value === 'default') {
                editor.chain().focus().unsetFontFamily().run();
              } else {
                editor.chain().focus().setFontFamily(e.target.value).run();
              }
            }}
            className="px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 shrink-0 min-w-[100px]"
            title="字体"
          >
            <option value="default">默认字体</option>
            <option value="Arial">Arial</option>
            <option value="Times New Roman">Times New Roman</option>
            <option value="Courier New">Courier New</option>
            <option value="Verdana">Verdana</option>
            <option value="Georgia">Georgia</option>
            <option value="Palatino">Palatino</option>
            <option value="Garamond">Garamond</option>
            <option value="Comic Sans MS">Comic Sans MS</option>
            <option value="Trebuchet MS">Trebuchet MS</option>
            <option value="Impact">Impact</option>
          </select>
        </>
      )}

      {/* 上标和下标 */}
      {showFullToolbar && (
        <>
          <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-0.5 shrink-0" />
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              editor.chain().focus().toggleSuperscript().run();
            }}
            className={`p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 shrink-0 ${
              editor.isActive('superscript') ? 'bg-blue-100 dark:bg-blue-900' : ''
            }`}
            title="上标"
          >
            <span className="text-xs">x²</span>
          </button>
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              editor.chain().focus().toggleSubscript().run();
            }}
            className={`p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 shrink-0 ${
              editor.isActive('subscript') ? 'bg-blue-100 dark:bg-blue-900' : ''
            }`}
            title="下标"
          >
            <span className="text-xs">x₂</span>
          </button>
        </>
      )}

      {/* 链接和图片 */}
      {showFullToolbar && (
        <>
          <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-0.5 shrink-0" />
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const url = window.prompt('请输入链接地址:');
              if (url) {
                editor.chain().focus().setLink({ href: url }).run();
              }
            }}
            className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 shrink-0"
            title="插入链接"
          >
            <LinkIcon className="w-4 h-4" />
          </button>
          
          <button
            onClick={async (e) => {
              e.preventDefault();
              e.stopPropagation();
              try {
                const { open } = await import('@tauri-apps/plugin-dialog');
                const { invoke } = await import('@tauri-apps/api/core');
                
                const selected = await open({
                  multiple: false,
                  filters: [{
                    name: 'Images',
                    extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'],
                  }],
                });
                
                if (!selected || typeof selected !== 'string') {
                  return;
                }
                
                if (!documentPath) {
                  toast.warning('无法插入图片：未指定文档路径');
                  return;
                }
                
                // 调用后端插入图片（返回 { dataUrl, relativePath }）
                const result = await invoke<{ dataUrl: string; relativePath: string }>('insert_image', {
                  documentPath,
                  imageSource: selected,
                });
                
                // 在编辑器中插入图片（使用 base64 data URL）
                editor.chain().focus().setImage({ src: result.dataUrl }).run();
              } catch (error) {
                console.error('插入图片失败:', error);
                toast.error(`插入图片失败: ${error instanceof Error ? error.message : String(error)}`);
              }
            }}
            className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 shrink-0"
            title="插入图片"
          >
            <PhotoIcon className="w-4 h-4" />
          </button>
        </>
      )}

      {/* 其他样式按钮 */}
      {showFullToolbar && (
        <>
          <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-0.5 shrink-0" />
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              editor.chain().focus().toggleCodeBlock().run();
            }}
            className={`p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 shrink-0 ${
              editor.isActive('codeBlock') ? 'bg-blue-100 dark:bg-blue-900' : ''
            }`}
            title="代码块"
          >
            <span className="text-xs font-mono">{'<>'}</span>
          </button>
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              editor.chain().focus().toggleCode().run();
            }}
            className={`p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 shrink-0 ${
              editor.isActive('code') ? 'bg-blue-100 dark:bg-blue-900' : ''
            }`}
            title="行内代码"
          >
            <span className="text-xs font-mono">`</span>
          </button>
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              editor.chain().focus().toggleBlockquote().run();
            }}
            className={`p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 shrink-0 ${
              editor.isActive('blockquote') ? 'bg-blue-100 dark:bg-blue-900' : ''
            }`}
            title="引用块"
          >
            <span className="text-xs">"</span>
          </button>
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              editor.chain().focus().setHorizontalRule().run();
            }}
            className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 shrink-0"
            title="水平线"
          >
            <span className="text-xs">—</span>
          </button>
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
            }}
            className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 shrink-0"
            title="插入表格"
          >
            <span className="text-xs">表格</span>
          </button>
        </>
      )}


      {/* 分析面板切换按钮 */}
      <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-0.5 shrink-0" />
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setAnalysisVisible(!analysis.visible);
        }}
        className={`p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 shrink-0 ${
          analysis.visible ? 'bg-blue-100 dark:bg-blue-900' : ''
        }`}
        title="切换文档分析面板"
      >
        <ChartBarIcon className="w-4 h-4" />
      </button>
    </div>
  );
};

export default EditorToolbar;

