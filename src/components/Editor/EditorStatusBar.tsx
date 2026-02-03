import React, { useEffect, useState } from 'react';
import { Editor } from '@tiptap/react';
import { useEditorStore } from '../../stores/editorStore';
import { CheckCircleIcon, ExclamationCircleIcon, ClockIcon } from '@heroicons/react/24/outline';

interface EditorStatusBarProps {
  editor: Editor | null;
}

// 智能字数统计：中文按字，英文按单词
const countWords = (text: string): number => {
  if (!text || text.trim().length === 0) return 0;
  
  // 移除所有空白字符
  const cleanText = text.replace(/\s+/g, '');
  if (cleanText.length === 0) return 0;
  
  let wordCount = 0;
  let i = 0;
  
  while (i < cleanText.length) {
    const char = cleanText[i];
    const charCode = char.charCodeAt(0);
    
    // 判断是否为中文字符（包括中文标点）
    if (charCode >= 0x4e00 && charCode <= 0x9fff || 
        charCode >= 0x3400 && charCode <= 0x4dbf ||
        charCode >= 0xf900 && charCode <= 0xfaff ||
        charCode >= 0x3000 && charCode <= 0x303f) {
      // 中文字符，每个字算一个
      wordCount++;
      i++;
    } else if ((charCode >= 0x41 && charCode <= 0x5a) || 
               (charCode >= 0x61 && charCode <= 0x7a)) {
      // 英文字母，连续字母算一个单词
      while (i < cleanText.length) {
        const nextChar = cleanText[i];
        const nextCode = nextChar.charCodeAt(0);
        if ((nextCode >= 0x41 && nextCode <= 0x5a) || 
            (nextCode >= 0x61 && nextCode <= 0x7a) ||
            (nextCode >= 0x30 && nextCode <= 0x39)) {
          // 继续读取字母和数字
          i++;
        } else {
          break;
        }
      }
      wordCount++;
    } else {
      // 其他字符（标点、符号等），跳过
      i++;
    }
  }
  
  return wordCount;
};

// 获取文件类型显示名称
const getFileTypeDisplay = (filePath: string): string => {
  const ext = filePath.split('.').pop()?.toLowerCase();
  const typeMap: Record<string, string> = {
    'md': 'Markdown',
    'docx': 'DOCX',
    'doc': 'DOC',
    'odt': 'ODT',
    'rtf': 'RTF',
    'html': 'HTML',
    'htm': 'HTML',
    'txt': 'TXT',
    'xlsx': 'Excel',
    'xls': 'Excel',
    'csv': 'CSV',
    'pptx': 'PPTX',
    'ppt': 'PPT',
  };
  return typeMap[ext || ''] || ext?.toUpperCase() || 'TXT';
};

const EditorStatusBar: React.FC<EditorStatusBarProps> = ({ editor }) => {
  const { tabs, activeTabId } = useEditorStore();
  const activeTab = tabs.find(t => t.id === activeTabId);
  
  // 字数统计状态
  const [totalCharacters, setTotalCharacters] = useState(0);
  const [selectedCharacters, setSelectedCharacters] = useState(0);
  const [totalWords, setTotalWords] = useState(0);
  const [selectedWords, setSelectedWords] = useState(0);
  const [hasSelection, setHasSelection] = useState(false);
  const [paragraphCount, setParagraphCount] = useState(0);
  const [lineCount, setLineCount] = useState(0);
  const [cursorPosition, setCursorPosition] = useState({ line: 0, column: 0 });

  // 从编辑器获取字数统计和选择状态
  useEffect(() => {
    if (!editor) {
      setTotalCharacters(0);
      setSelectedCharacters(0);
      setTotalWords(0);
      setSelectedWords(0);
      setHasSelection(false);
      setParagraphCount(0);
      setLineCount(0);
      setCursorPosition({ line: 0, column: 0 });
      return;
    }

    const updateStats = () => {
      // 获取总字符数（使用 editor.storage.characterCount 如果有扩展，否则手动计算）
      const storage = (editor as any).storage?.characterCount;
      let totalChars = 0;
      
      if (storage?.characters) {
        // 使用 CharacterCount 扩展提供的字符数统计（不包含空白字符）
        totalChars = storage.characters();
      } else {
        // 手动计算：获取纯文本内容，去除空白字符
        const text = editor.state.doc.textContent;
        totalChars = text.replace(/\s/g, '').length;
      }

      // 获取全文文本用于字数统计
      const fullText = editor.state.doc.textContent;
      const totalWordsCount = countWords(fullText);
      setTotalWords(totalWordsCount);

      // 计算段落数（非空段落）
      let paraCount = 0;
      editor.state.doc.forEach((node) => {
        if (node.type.name === 'paragraph' || node.type.name === 'heading') {
          const text = node.textContent.trim();
          if (text.length > 0) {
            paraCount++;
          }
        }
      });
      setParagraphCount(paraCount);

      // 计算行数
      const lines = fullText.split('\n');
      const nonEmptyLines = lines.filter(line => line.trim().length > 0);
      setLineCount(nonEmptyLines.length || 1);

      // 获取选中文本的字符数和字数
      const { from, to } = editor.state.selection;
      const isSelected = from !== to;
      
      if (isSelected) {
        const selectedText = editor.state.doc.textBetween(from, to);
        // 计算选中文本的字符数（去除空白字符，与总字数计算方式一致）
        const selectedChars = selectedText.replace(/\s/g, '').length;
        const selectedWordsCount = countWords(selectedText);
        setSelectedCharacters(selectedChars);
        setSelectedWords(selectedWordsCount);
        setHasSelection(true);
      } else {
        setSelectedCharacters(0);
        setSelectedWords(0);
        setHasSelection(false);
      }
      
      setTotalCharacters(totalChars);

      // 计算光标位置（行号:列号）
      const { $from } = editor.state.selection;
      let line = 1;
      let column = 1;
      
      // 通过遍历文档节点，提取到光标位置的所有文本
      let textBefore = '';
      editor.state.doc.nodesBetween(0, $from.pos, (node, pos) => {
        if (node.isText) {
          textBefore += node.text;
        }
      });
      
      // 计算行号：换行符数量 + 1
      const lineBreaks = (textBefore.match(/\n/g) || []).length;
      line = lineBreaks + 1;
      
      // 计算列号：当前行的字符数
      const lastLineBreak = textBefore.lastIndexOf('\n');
      if (lastLineBreak >= 0) {
        column = textBefore.substring(lastLineBreak + 1).length + 1;
      } else {
        column = textBefore.length + 1;
      }
      
      setCursorPosition({ line, column });
    };

    // 初始更新
    updateStats();

    // 监听内容更新和选择变化
    editor.on('update', updateStats);
    editor.on('selectionUpdate', updateStats);

    return () => {
      editor.off('update', updateStats);
      editor.off('selectionUpdate', updateStats);
    };
  }, [editor]);

  if (!activeTab) {
    return null;
  }

  // 计算保存状态
  const getSaveStatus = () => {
    if (activeTab.isSaving) {
      return {
        icon: ClockIcon,
        text: '保存中...',
        color: 'text-blue-500 dark:text-blue-400',
        bgColor: 'bg-blue-50 dark:bg-blue-900/20',
      };
    }
    
    if (activeTab.isDirty) {
      return {
        icon: ExclamationCircleIcon,
        text: '未保存',
        color: 'text-yellow-600 dark:text-yellow-400',
        bgColor: 'bg-yellow-50 dark:bg-yellow-900/20',
      };
    }
    
    return {
      icon: CheckCircleIcon,
      text: '已保存',
      color: 'text-green-600 dark:text-green-400',
      bgColor: 'bg-green-50 dark:bg-green-900/20',
    };
  };

  const saveStatus = getSaveStatus();
  const StatusIcon = saveStatus.icon;

  // 格式化字数显示
  const formatCharacterCount = () => {
    if (hasSelection && selectedCharacters > 0) {
      return `字数：${selectedCharacters.toLocaleString()}/${totalCharacters.toLocaleString()}`;
    }
    return `字数：${totalCharacters.toLocaleString()}`;
  };

  // 格式化智能字数显示（中文按字，英文按单词）
  const formatWordCount = () => {
    if (hasSelection && selectedWords > 0) {
      return `词数：${selectedWords.toLocaleString()}/${totalWords.toLocaleString()}`;
    }
    return `词数：${totalWords.toLocaleString()}`;
  };

  return (
    <div className="flex items-center justify-between px-3 py-1.5 text-xs border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 text-gray-600 dark:text-gray-400 overflow-x-auto">
      {/* 左侧：文档统计信息 */}
      <div className="flex items-center gap-3 flex-shrink-0">
        {/* 字符数 */}
        <span className="font-mono whitespace-nowrap">{formatCharacterCount()}</span>
        
        {/* 智能字数（中文按字，英文按单词） */}
        <span className="font-mono whitespace-nowrap hidden sm:inline">{formatWordCount()}</span>
        
        {/* 段落数 */}
        <span className="font-mono whitespace-nowrap hidden md:inline">
          段落：{paragraphCount.toLocaleString()}
        </span>
        
        {/* 行数 */}
        <span className="font-mono whitespace-nowrap hidden lg:inline">
          行数：{lineCount.toLocaleString()}
        </span>
      </div>

      {/* 中间：光标位置 */}
      <div className="flex items-center gap-3 flex-shrink-0 mx-2">
        <span className="font-mono text-gray-500 dark:text-gray-400 whitespace-nowrap">
          {cursorPosition.line}:{cursorPosition.column}
        </span>
      </div>

      {/* 右侧：文件信息、保存状态和编辑模式 */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {/* 文件类型和编码 */}
        {activeTab && (
          <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400 whitespace-nowrap hidden xl:flex">
            <span className="font-mono">{getFileTypeDisplay(activeTab.filePath)}</span>
            <span className="text-gray-400 dark:text-gray-500">•</span>
            <span className="font-mono">UTF-8</span>
          </div>
        )}
        
        {/* 保存状态 */}
        <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded ${saveStatus.bgColor} flex-shrink-0`}>
          <StatusIcon className={`w-3.5 h-3.5 ${saveStatus.color}`} />
          <span className={saveStatus.color}>{saveStatus.text}</span>
        </div>

        {/* 编辑模式 */}
        {activeTab?.isReadOnly && (
          <span className="px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 whitespace-nowrap">
            只读
          </span>
        )}
      </div>
    </div>
  );
};

export default EditorStatusBar;

