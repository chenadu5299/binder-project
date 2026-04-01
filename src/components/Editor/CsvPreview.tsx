// src/components/Editor/CsvPreview.tsx
// CSV 预览组件（独立方案：直接解析为 HTML 表格 + 虚拟滚动）
//
// 方案说明：
// 1. 使用 papaparse 直接解析 CSV 文件
// 2. 使用 @tanstack/react-virtual 实现虚拟滚动（大文件性能优化）
// 3. 渲染为 HTML 表格
// 4. 支持单元格位置信息（A1、B2 等）
// 5. 支持文本选择、复制、搜索（浏览器原生）
//
// 开发阶段：
// - 第一阶段：基础 CSV 解析和表格渲染 ✅
// - 第二阶段：虚拟滚动和性能优化 ✅（当前）
// - 第三阶段：引用功能和交互优化（待实现）
//
// 最后更新：2025年

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import Papa from 'papaparse';
import { useVirtualizer } from '@tanstack/react-virtual';
import { MagnifyingGlassIcon, LinkIcon } from '@heroicons/react/24/outline';

interface CsvPreviewProps {
  filePath: string;
}

interface SelectedCell {
  rowIndex: number;
  colIndex: number;
  cellRef: string;
  value: string;
}

interface SelectionRange {
  startRow: number;
  endRow: number;
  startCol: number;
  endCol: number;
}

const CsvPreview: React.FC<CsvPreviewProps> = ({ filePath }) => {
  const [data, setData] = useState<string[][]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  const [columnWidths, setColumnWidths] = useState<number[]>([]); // 每列的固定宽度（px）
  
  // 引用功能状态
  const [selectedCell, setSelectedCell] = useState<SelectedCell | null>(null);
  const [selectionRange, setSelectionRange] = useState<SelectionRange | null>(null); // 多选范围
  const [isSelecting, setIsSelecting] = useState(false); // 是否正在拖选
  const [showReferenceButton, setShowReferenceButton] = useState(false);
  const [referenceButtonPosition, setReferenceButtonPosition] = useState({ x: 0, y: 0 });
  const [copySuccess, setCopySuccess] = useState(false);
  
  // 虚拟滚动容器引用
  const parentRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const headerTableRef = useRef<HTMLTableElement>(null);
  
  // 行高配置（可根据需要调整）
  const ROW_HEIGHT = 35; // 每行高度（px）
  const MIN_COLUMN_WIDTH = 80; // 最小列宽（px）
  const MAX_COLUMN_WIDTH = 400; // 最大列宽（px）
  const CELL_PADDING = 24; // 单元格内边距（px，左右各12px）
  const CHAR_WIDTH = 8; // 估算字符宽度（px，用于计算列宽）
  
  // 获取文件名（不含路径）
  const fileName = useMemo(() => {
    return filePath.split('/').pop() || filePath.split('\\').pop() || 'file.csv';
  }, [filePath]);

  // 将列索引转换为 Excel 列名（A, B, ..., Z, AA, AB, ...）
  const getColumnName = (colIndex: number): string => {
    let result = '';
    let num = colIndex;
    while (num >= 0) {
      result = String.fromCharCode(65 + (num % 26)) + result;
      num = Math.floor(num / 26) - 1;
    }
    return result;
  };

  // 获取单元格引用（A1, B2, etc.）
  const getCellRef = (rowIndex: number, colIndex: number): string => {
    const colName = getColumnName(colIndex);
    return `${colName}${rowIndex + 1}`;
  };
  
  // 计算每列的宽度（根据内容）
  const calculateColumnWidths = useCallback((allRows: string[][]): number[] => {
    if (allRows.length === 0) return [];
    
    const numColumns = Math.max(...allRows.map(row => row.length));
    const widths: number[] = [];
    
    for (let colIndex = 0; colIndex < numColumns; colIndex++) {
      let maxWidth = MIN_COLUMN_WIDTH;
      
      // 遍历该列的所有单元格，找到最长的内容
      for (const row of allRows) {
        const cellValue = row[colIndex] || '';
        // 计算内容宽度：字符数 * 字符宽度 + 内边距
        const contentWidth = cellValue.length * CHAR_WIDTH + CELL_PADDING;
        maxWidth = Math.max(maxWidth, contentWidth);
      }
      
      // 限制最大宽度
      widths.push(Math.min(maxWidth, MAX_COLUMN_WIDTH));
    }
    
    return widths;
  }, []);
  
  // 虚拟滚动配置
  const virtualizer = useVirtualizer({
    count: data.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10, // 预渲染的行数（上下各 10 行）
  });
  
  // 处理单元格鼠标按下（开始拖选）
  const handleCellMouseDown = useCallback((e: React.MouseEvent<HTMLTableCellElement>, rowIndex: number, colIndex: number) => {
    // 只处理左键点击
    if (e.button !== 0) return;
    
    const cell = e.currentTarget;
    const cellRef = getCellRef(rowIndex, colIndex);
    const cellValue = cell.textContent || '';
    
    // 开始拖选
    setIsSelecting(true);
    setSelectionRange({
      startRow: rowIndex,
      endRow: rowIndex,
      startCol: colIndex,
      endCol: colIndex,
    });
    
    // 更新选中的单元格
    setSelectedCell({
      rowIndex,
      colIndex,
      cellRef,
      value: cellValue,
    });
    
    // 计算引用按钮位置
    const cellRect = cell.getBoundingClientRect();
    const containerRect = parentRef.current?.getBoundingClientRect();
    
    if (containerRect && parentRef.current) {
      const scrollLeft = parentRef.current.scrollLeft;
      const scrollTop = parentRef.current.scrollTop;
      
      setReferenceButtonPosition({
        x: cellRect.left - containerRect.left + scrollLeft + cellRect.width + 10,
        y: cellRect.top - containerRect.top + scrollTop + (cellRect.height / 2) - 20,
      });
      setShowReferenceButton(true);
    }
  }, []);
  
  // 处理单元格鼠标移动（拖选中）
  const handleCellMouseEnter = useCallback((e: React.MouseEvent<HTMLTableCellElement>, rowIndex: number, colIndex: number) => {
    if (!isSelecting || !selectionRange) return;
    
    // 更新选择范围
    const newRange: SelectionRange = {
      startRow: Math.min(selectionRange.startRow, rowIndex),
      endRow: Math.max(selectionRange.endRow, rowIndex),
      startCol: Math.min(selectionRange.startCol, colIndex),
      endCol: Math.max(selectionRange.endCol, colIndex),
    };
    
    setSelectionRange(newRange);
    
    // 更新选中的单元格（使用范围的起始单元格）
    const cell = e.currentTarget;
    const cellRef = getCellRef(newRange.startRow, newRange.startCol);
    const cellValue = cell.textContent || '';
    
    setSelectedCell({
      rowIndex: newRange.startRow,
      colIndex: newRange.startCol,
      cellRef,
      value: cellValue,
    });
  }, [isSelecting, selectionRange]);
  
  // 处理单元格点击（单点选择）
  const handleCellClick = useCallback((e: React.MouseEvent<HTMLTableCellElement>, rowIndex: number, colIndex: number) => {
    // 如果刚刚完成拖选，不处理点击
    if (isSelecting) {
      setIsSelecting(false);
      return;
    }
    
    const cell = e.currentTarget;
    const cellRef = getCellRef(rowIndex, colIndex);
    const cellValue = cell.textContent || '';
    
    // 更新选中的单元格
    setSelectedCell({
      rowIndex,
      colIndex,
      cellRef,
      value: cellValue,
    });
    
    // 清除选择范围（单点选择）
    setSelectionRange(null);
    
    // 计算引用按钮位置
    const cellRect = cell.getBoundingClientRect();
    const containerRect = parentRef.current?.getBoundingClientRect();
    
    if (containerRect && parentRef.current) {
      const scrollLeft = parentRef.current.scrollLeft;
      const scrollTop = parentRef.current.scrollTop;
      
      setReferenceButtonPosition({
        x: cellRect.left - containerRect.left + scrollLeft + cellRect.width + 10,
        y: cellRect.top - containerRect.top + scrollTop + (cellRect.height / 2) - 20,
      });
      setShowReferenceButton(true);
    }
  }, [isSelecting]);
  
  // 处理鼠标释放（结束拖选）
  useEffect(() => {
    const handleMouseUp = () => {
      if (isSelecting) {
        setIsSelecting(false);
      }
    };
    
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isSelecting]);
  
  // 判断单元格是否在选中范围内
  const isCellSelected = useCallback((rowIndex: number, colIndex: number): boolean => {
    if (!selectionRange) return false;
    
    const { startRow, endRow, startCol, endCol } = selectionRange;
    return rowIndex >= startRow && rowIndex <= endRow &&
           colIndex >= startCol && colIndex <= endCol;
  }, [selectionRange]);
  
  // 处理表头点击（选择整列）
  const handleHeaderClick = useCallback((colIndex: number) => {
    if (!data || data.length === 0) return;
    
    const startRow = 0;
    const endRow = data.length - 1;
    
    setSelectionRange({
      startRow,
      endRow,
      startCol: colIndex,
      endCol: colIndex,
    });
    
    const cellRef = getCellRef(startRow, colIndex);
    setSelectedCell({
      rowIndex: startRow,
      colIndex,
      cellRef,
      value: headers[colIndex] || '',
    });
    
    setShowReferenceButton(true);
  }, [data, headers]);
  
  // 处理行号点击（选择整行）
  const handleRowNumberClick = useCallback((rowIndex: number) => {
    if (!data || data.length === 0) return;
    
    const startCol = 0;
    const endCol = headers.length - 1;
    
    setSelectionRange({
      startRow: rowIndex,
      endRow: rowIndex,
      startCol,
      endCol,
    });
    
    const cellRef = getCellRef(rowIndex, startCol);
    const row = data[rowIndex] || [];
    
    // 计算引用按钮位置（使用第一个单元格的位置）
    const containerRect = parentRef.current?.getBoundingClientRect();
    if (containerRect && parentRef.current) {
      const scrollLeft = parentRef.current.scrollLeft;
      const scrollTop = parentRef.current.scrollTop;
      
      // 估算第一个单元格的位置（行号列宽度 + 一些偏移）
      const estimatedX = 60 + scrollLeft + 10;
      const estimatedY = (rowIndex * ROW_HEIGHT) + scrollTop + (ROW_HEIGHT / 2) - 20;
      
      setReferenceButtonPosition({
        x: estimatedX,
        y: estimatedY,
      });
    }
    
    setSelectedCell({
      rowIndex,
      colIndex: startCol,
      cellRef,
      value: row[startCol] || '',
    });
    
    setShowReferenceButton(true);
  }, [data, headers.length, getCellRef]);
  
  // 生成引用格式（支持范围引用）
  const generateReference = useCallback((cell: SelectedCell): string => {
    // CSV 引用格式：@文件名.csv!A1 或 @文件名.csv!A1:B2（范围）
    let cellRef = cell.cellRef;
    
    // 如果有选择范围，生成范围引用
    if (selectionRange && 
        (selectionRange.startRow !== selectionRange.endRow || 
         selectionRange.startCol !== selectionRange.endCol)) {
      const startRef = getCellRef(selectionRange.startRow, selectionRange.startCol);
      const endRef = getCellRef(selectionRange.endRow, selectionRange.endCol);
      cellRef = `${startRef}:${endRef}`;
    }
    
    return `@${fileName}!${cellRef}`;
  }, [fileName, selectionRange]);
  
  // 复制引用
  const handleCopyReference = useCallback(async () => {
    if (!selectedCell) return;
    
    const referenceText = generateReference(selectedCell);
    
    // 创建表格引用元数据（用于聊天输入框识别）
    const sourceData = {
      filePath: filePath,
      fileName: fileName,
      type: 'table', // 标记为表格引用
      cellRef: selectedCell.cellRef,
      rowIndex: selectedCell.rowIndex,
      colIndex: selectedCell.colIndex,
      cellValue: selectedCell.value,
    };
    
    const sourceJson = JSON.stringify(sourceData);
    
    try {
      // 方法 1：设置全局变量（主要方案，因为 clipboard 事件之间数据不共享）
      (window as any).__binderClipboardSource = sourceJson;
      (window as any).__binderClipboardTimestamp = Date.now();
      
      // 5 秒后清除全局变量
      setTimeout(() => {
        delete (window as any).__binderClipboardSource;
        delete (window as any).__binderClipboardTimestamp;
      }, 5000);
      
      // 方法 2：使用 ClipboardItem API（现代浏览器支持）
      if (navigator.clipboard && navigator.clipboard.write) {
        try {
          const clipboardItem = new ClipboardItem({
            'text/plain': new Blob([referenceText], { type: 'text/plain' }),
            'application/x-binder-source': new Blob([sourceJson], { type: 'application/json' }),
          });
          await navigator.clipboard.write([clipboardItem]);
        } catch (clipboardError) {
          // 如果 ClipboardItem 失败，只复制文本
          await navigator.clipboard.writeText(referenceText);
        }
      } else {
        // 降级方案：只复制文本
        await navigator.clipboard.writeText(referenceText);
      }
      
      setCopySuccess(true);
      setTimeout(() => {
        setCopySuccess(false);
        setShowReferenceButton(false);
      }, 2000);
    } catch (err) {
      console.error('复制失败:', err);
      // 降级方案：使用 document.execCommand
      const textArea = document.createElement('textarea');
      textArea.value = referenceText;
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        // 即使降级方案，也设置全局变量
        (window as any).__binderClipboardSource = sourceJson;
        (window as any).__binderClipboardTimestamp = Date.now();
        setTimeout(() => {
          delete (window as any).__binderClipboardSource;
          delete (window as any).__binderClipboardTimestamp;
        }, 5000);
        
        setCopySuccess(true);
        setTimeout(() => {
          setCopySuccess(false);
          setShowReferenceButton(false);
        }, 2000);
      } catch (e) {
        console.error('降级复制方案也失败:', e);
      }
      document.body.removeChild(textArea);
    }
  }, [selectedCell, generateReference, filePath, fileName]);
  
  // 点击外部区域隐藏引用按钮
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (tableRef.current && !tableRef.current.contains(e.target as Node)) {
        setShowReferenceButton(false);
      }
    };
    
    if (showReferenceButton) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
    return undefined;
  }, [showReferenceButton]);

  // 解析 CSV 文件
  useEffect(() => {
    const parseCsv = async () => {
      if (!filePath) {
        setError('文件路径为空');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        // 读取文件内容
        const content = await invoke<string>('read_file_content', {
          path: filePath,
        });

        if (!content) {
          setError('文件内容为空');
          setLoading(false);
          return;
        }

        // 使用 papaparse 解析 CSV（支持流式解析和进度反馈）
        // 对于大文件，使用流式解析可以显示进度
        const fileSize = content.length;
        const isLargeFile = fileSize > 1024 * 1024; // 大于 1MB 的文件
        
        if (isLargeFile) {
          // 大文件：使用流式解析（分块处理）
          let parsedRows: string[][] = [];
          let processedBytes = 0;
          
          Papa.parse(content, {
            step: (results, _parser) => {
              if (results.data) {
                parsedRows.push(results.data as string[]);
                processedBytes += JSON.stringify(results.data).length;
                const progressPercent = Math.min(95, (processedBytes / fileSize) * 100);
                setProgress(progressPercent);
              }
            },
            complete: (results) => {
              if (results.errors.length > 0) {
                console.warn('CSV 解析警告:', results.errors);
                const criticalErrors = results.errors.filter(
                  (e) => e.type === 'Quotes' || e.type === 'Delimiter'
                );
                if (criticalErrors.length > 0) {
                  setError(`CSV 解析失败: ${criticalErrors[0].message}`);
                  setLoading(false);
                  return;
                }
              }
              
              if (parsedRows.length === 0) {
                setError('CSV 文件为空');
                setLoading(false);
                return;
              }
              
              // 处理表头
              const firstRow = parsedRows[0];
              const hasHeaders = firstRow.some((cell) => cell && cell.trim() !== '');
              
              const allRows = parsedRows;
              if (hasHeaders) {
                setHeaders(firstRow);
                setData(allRows.slice(1));
                // 计算列宽（包括表头和数据行）
                const widths = calculateColumnWidths([firstRow, ...allRows.slice(1)]);
                setColumnWidths(widths);
              } else {
                const defaultHeaders = firstRow.map((_, index) => getColumnName(index));
                setHeaders(defaultHeaders);
                setData(allRows);
                // 计算列宽（所有行）
                const widths = calculateColumnWidths(allRows);
                setColumnWidths(widths);
              }
              
              setProgress(100);
              setLoading(false);
            },
            error: (err: Error) => {
              console.error('CSV 解析错误:', err);
              setError(`CSV 解析失败: ${err.message}`);
              setLoading(false);
            },
            skipEmptyLines: true,
            delimiter: '',
            encoding: 'UTF-8',
          });
        } else {
          // 小文件：直接解析
          Papa.parse(content, {
            complete: (results) => {
              if (results.errors.length > 0) {
                console.warn('CSV 解析警告:', results.errors);
                const criticalErrors = results.errors.filter(
                  (e) => e.type === 'Quotes' || e.type === 'Delimiter'
                );
                if (criticalErrors.length > 0) {
                  setError(`CSV 解析失败: ${criticalErrors[0].message}`);
                  setLoading(false);
                  return;
                }
              }

              const parsedData = results.data as string[][];
              
              if (parsedData.length === 0) {
                setError('CSV 文件为空');
                setLoading(false);
                return;
              }

              // 第一行作为表头（如果有）
              const firstRow = parsedData[0];
              const hasHeaders = firstRow.some((cell) => cell && cell.trim() !== '');
              
              if (hasHeaders) {
                setHeaders(firstRow);
                setData(parsedData.slice(1));
                // 计算列宽（包括表头和数据行）
                const widths = calculateColumnWidths([firstRow, ...parsedData.slice(1)]);
                setColumnWidths(widths);
              } else {
                // 如果没有表头，生成默认表头（A, B, C, ...）
                const defaultHeaders = firstRow.map((_, index) => getColumnName(index));
                setHeaders(defaultHeaders);
                setData(parsedData);
                // 计算列宽（所有行）
                const widths = calculateColumnWidths(parsedData);
                setColumnWidths(widths);
              }

              setLoading(false);
            },
            error: (err: Error) => {
              console.error('CSV 解析错误:', err);
              setError(`CSV 解析失败: ${err.message}`);
              setLoading(false);
            },
            skipEmptyLines: true,
            delimiter: '',
            encoding: 'UTF-8',
          });
        }
      } catch (err: unknown) {
        console.error('读取 CSV 文件失败:', err);
        setError(err instanceof Error ? err.message : String(err) || '读取文件失败');
        setLoading(false);
      }
    };

    parseCsv();
  }, [filePath]);

  // 加载状态
  if (loading) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <div className="text-gray-600 dark:text-gray-400 mb-2">正在加载 CSV 文件...</div>
          {progress > 0 && (
            <div className="mt-2 w-64 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div
                className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              ></div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // 错误状态
  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900 p-8">
        <div className="text-center max-w-md">
          <div className="text-red-500 text-xl font-semibold mb-4">加载失败</div>
          <div className="text-gray-600 dark:text-gray-400 mb-6">{error}</div>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  // 渲染表格
  return (
    <div className="h-full w-full flex flex-col bg-gray-50 dark:bg-gray-900">
      {/* 预览工具栏 */}
      <div className="flex-shrink-0 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <div className="flex items-center justify-between px-4 py-2">
          {/* 左侧：文档信息和功能提示 */}
          <div className="flex items-center space-x-4">
            <span className="text-sm text-gray-600 dark:text-gray-400 font-medium">
              📊 CSV 预览模式
            </span>
            
            {/* 功能提示 */}
            <div className="flex items-center space-x-3 text-xs text-gray-500 dark:text-gray-400">
              <div className="flex items-center gap-1" title="使用 Cmd+F (Mac) 或 Ctrl+F (Windows) 搜索">
                <MagnifyingGlassIcon className="w-4 h-4" />
                <span>搜索</span>
              </div>
              <div className="flex items-center gap-1" title="点击单元格可生成引用">
                <LinkIcon className="w-4 h-4" />
                <span>引用</span>
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                共 {data.length} 行，{headers.length} 列
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 表格预览区域（使用虚拟滚动） */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* 表头（固定，与表体同步滚动） */}
        <div className="flex-shrink-0 border-b-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 overflow-x-auto">
          <table 
            ref={headerTableRef}
            className="border-collapse"
            style={{ 
              tableLayout: 'fixed',
              width: columnWidths.length > 0 
                ? `${60 + columnWidths.reduce((sum, w) => sum + w, 0)}px` 
                : '100%'
            }}
          >
            <thead className="bg-gray-100 dark:bg-gray-700">
              <tr>
                {/* 行号列 */}
                <th 
                  className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-xs font-semibold text-gray-600 dark:text-gray-400 bg-gray-200 dark:bg-gray-800 sticky left-0 z-20"
                  style={{ width: '60px', minWidth: '60px', maxWidth: '60px' }}
                >
                  #
                </th>
                {/* 数据列 */}
                {headers.map((header, colIndex) => {
                  const isColSelected = selectionRange && 
                                       selectionRange.startCol === colIndex && 
                                       selectionRange.endCol === colIndex;
                  return (
                    <th
                      key={colIndex}
                      className={`border border-gray-300 dark:border-gray-600 px-3 py-2 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600 ${
                        isColSelected ? 'bg-blue-100 dark:bg-blue-900/30' : ''
                      }`}
                      style={{
                        width: `${columnWidths[colIndex] || MIN_COLUMN_WIDTH}px`,
                        minWidth: `${columnWidths[colIndex] || MIN_COLUMN_WIDTH}px`,
                        maxWidth: `${columnWidths[colIndex] || MIN_COLUMN_WIDTH}px`,
                      }}
                      title={`点击选择整列: ${getCellRef(0, colIndex)}`}
                      onClick={() => handleHeaderClick(colIndex)}
                    >
                      {header || getColumnName(colIndex)}
                    </th>
                  );
                })}
              </tr>
            </thead>
          </table>
        </div>
        
        {/* 虚拟滚动表格主体 */}
        <div 
          ref={parentRef}
          className="flex-1 overflow-auto relative"
          style={{ contain: 'strict' }} // 性能优化：限制重排范围
          onScroll={(e) => {
            // 同步表头滚动
            if (headerTableRef.current) {
              const scrollContainer = e.currentTarget;
              headerTableRef.current.parentElement!.scrollLeft = scrollContainer.scrollLeft;
            }
          }}
        >
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: columnWidths.length > 0 
                ? `${60 + columnWidths.reduce((sum, w) => sum + w, 0)}px` 
                : '100%',
              position: 'relative',
            }}
          >
            <table 
              ref={tableRef}
              className="border-collapse border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
              style={{ 
                tableLayout: 'fixed',
                width: columnWidths.length > 0 
                  ? `${60 + columnWidths.reduce((sum, w) => sum + w, 0)}px` 
                  : '100%'
              }}
            >
              <tbody>
                {virtualizer.getVirtualItems().map((virtualRow) => {
                  const row = data[virtualRow.index];
                  if (!row) return null;
                  
                  return (
                    <tr
                      key={virtualRow.key}
                      data-index={virtualRow.index}
                      ref={virtualizer.measureElement}
                      className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: `${virtualRow.size}px`,
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                    >
                      {/* 行号 */}
                      <td 
                        className={`border border-gray-300 dark:border-gray-600 px-2 py-1 text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 text-center sticky left-0 z-10 cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700 ${
                          selectionRange && 
                          selectionRange.startRow === virtualRow.index && 
                          selectionRange.endRow === virtualRow.index &&
                          selectionRange.startCol === 0 &&
                          selectionRange.endCol === headers.length - 1
                            ? 'bg-blue-100 dark:bg-blue-900/30' : ''
                        }`}
                        style={{ width: '60px', minWidth: '60px', maxWidth: '60px' }}
                        title="点击选择整行"
                        onClick={() => handleRowNumberClick(virtualRow.index)}
                      >
                        {virtualRow.index + 1}
                      </td>
                      {/* 数据单元格 */}
                      {row.map((cell, colIndex) => {
                        const cellRef = getCellRef(virtualRow.index, colIndex);
                        const isSelected = selectedCell?.rowIndex === virtualRow.index && selectedCell?.colIndex === colIndex;
                        const isInRange = isCellSelected(virtualRow.index, colIndex);
                        const colWidth = columnWidths[colIndex] || MIN_COLUMN_WIDTH;
                        return (
                          <td
                            key={colIndex}
                            className={`border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 cursor-pointer select-none ${
                              isSelected || isInRange ? 'bg-blue-100 dark:bg-blue-900/30' : ''
                            }`}
                            style={{
                              width: `${colWidth}px`,
                              minWidth: `${colWidth}px`,
                              maxWidth: `${colWidth}px`,
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                            title={`${cellRef}: ${cell || '(空)'}`}
                            data-cell-ref={cellRef}
                            data-row-index={virtualRow.index}
                            data-col-index={colIndex}
                            onMouseDown={(e) => handleCellMouseDown(e, virtualRow.index, colIndex)}
                            onMouseEnter={(e) => handleCellMouseEnter(e, virtualRow.index, colIndex)}
                            onClick={(e) => handleCellClick(e, virtualRow.index, colIndex)}
                          >
                            {cell || ''}
                          </td>
                        );
                      })}
                      {/* 如果行数据不足，填充空单元格 */}
                      {row.length < headers.length &&
                        Array.from({ length: headers.length - row.length }).map((_, colIndex) => {
                          const actualColIndex = row.length + colIndex;
                          const cellRef = getCellRef(virtualRow.index, actualColIndex);
                          const isSelected = selectedCell?.rowIndex === virtualRow.index && selectedCell?.colIndex === actualColIndex;
                          const colWidth = columnWidths[actualColIndex] || MIN_COLUMN_WIDTH;
                          return (
                            <td
                              key={actualColIndex}
                              className={`border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 cursor-pointer ${
                                isSelected ? 'bg-blue-100 dark:bg-blue-900/30' : ''
                              }`}
                              style={{
                                width: `${colWidth}px`,
                                minWidth: `${colWidth}px`,
                                maxWidth: `${colWidth}px`,
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                              }}
                              title={`${cellRef}: (空)`}
                              data-cell-ref={cellRef}
                              data-row-index={virtualRow.index}
                              data-col-index={actualColIndex}
                              onClick={(e) => handleCellClick(e, virtualRow.index, actualColIndex)}
                            >
                              {' '}
                            </td>
                          );
                        })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          
          {/* 引用按钮（悬浮） */}
          {showReferenceButton && selectedCell && (
            <div
              className="absolute z-50 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg p-2"
              style={{
                left: `${referenceButtonPosition.x}px`,
                top: `${referenceButtonPosition.y}px`,
                transform: 'translateY(-50%)',
                pointerEvents: 'auto',
              }}
            >
              <button
                onClick={handleCopyReference}
                className="flex items-center gap-2 px-3 py-1.5 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors text-sm font-medium"
                title={`复制引用: ${generateReference(selectedCell)}`}
              >
                <LinkIcon className="w-4 h-4" />
                {copySuccess ? '已复制' : '复制引用'}
              </button>
              {selectedCell && (
                <div className="mt-1 text-xs text-gray-500 dark:text-gray-400 px-1 max-w-xs truncate">
                  {selectedCell.cellRef}: {selectedCell.value || '(空)'}
                </div>
              )}
            </div>
          )}
          
          {/* 复制成功提示（全局提示） */}
          {copySuccess && selectedCell && (
            <div
              className="fixed top-4 right-4 z-50 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg animate-fade-in"
              style={{ pointerEvents: 'none' }}
            >
              ✓ 已复制引用: {generateReference(selectedCell)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CsvPreview;

