import React, { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface Reference {
  text: string;
  source: string;
  reference_type: string;
}

interface Entity {
  name: string;
  entity_type: string;
  description: string;
}

interface DocumentAnalysisResult {
  summary?: string;
  keywords?: string[];
  references?: Reference[];
  entities?: Entity[];
}

interface DocumentAnalysisPanelProps {
  documentPath: string;
  content: string;
}

const DocumentAnalysisPanel: React.FC<DocumentAnalysisPanelProps> = ({
  documentPath,
  content,
}) => {
  const [analysisResult, setAnalysisResult] = useState<DocumentAnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [activeTab, setActiveTab] = useState<'summary' | 'keywords' | 'references' | 'entities'>('summary');
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = useCallback(async (type: string) => {
    if (!content.trim()) {
      setError('文档内容为空，无法分析');
      return;
    }

    setIsAnalyzing(true);
    setError(null);

    try {
      const result = await invoke<string>('ai_analyze_document', {
        content,
        analysisType: type,
      });

      // 尝试解析 JSON 结果
      try {
        const parsed = JSON.parse(result);
        setAnalysisResult(parsed);
      } catch {
        // 如果不是 JSON，可能是纯文本（如总结）
        if (type === 'summarize') {
          setAnalysisResult({ summary: result });
        } else {
          // 尝试提取 JSON（可能包含在文本中）
          const jsonMatch = result.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            setAnalysisResult(parsed);
          } else {
            setAnalysisResult({ summary: result });
          }
        }
      }
    } catch (err) {
      console.error('分析失败:', err);
      setError(err instanceof Error ? err.message : '分析失败，请稍后重试');
    } finally {
      setIsAnalyzing(false);
    }
  }, [content]);

  const handleTabClick = (tab: 'summary' | 'keywords' | 'references' | 'entities') => {
    setActiveTab(tab);
    if (!analysisResult || (tab === 'summary' && !analysisResult.summary) ||
        (tab === 'keywords' && !analysisResult.keywords) ||
        (tab === 'references' && !analysisResult.references) ||
        (tab === 'entities' && !analysisResult.entities)) {
      // 如果该标签页没有数据，自动触发分析
      const typeMap = {
        summary: 'summarize',
        keywords: 'keywords',
        references: 'references',
        entities: 'entities',
      };
      handleAnalyze(typeMap[tab]);
    }
  };

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700">
      {/* 标题栏 */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          文档分析
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate" title={documentPath}>
          {documentPath.split('/').pop() || '未命名文档'}
        </p>
      </div>

      {/* 标签页 */}
      <div className="flex-shrink-0 flex border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={() => handleTabClick('summary')}
          className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'summary'
              ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
          }`}
        >
          总结
        </button>
        <button
          onClick={() => handleTabClick('keywords')}
          className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'keywords'
              ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
          }`}
        >
          关键词
        </button>
        <button
          onClick={() => handleTabClick('references')}
          className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'references'
              ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
          }`}
        >
          引用
        </button>
        <button
          onClick={() => handleTabClick('entities')}
          className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'entities'
              ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
          }`}
        >
          实体
        </button>
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-y-auto p-4">
        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        {isAnalyzing && (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 dark:border-blue-400"></div>
            <span className="ml-3 text-gray-600 dark:text-gray-400">分析中...</span>
          </div>
        )}

        {!isAnalyzing && analysisResult && (
          <div className="space-y-4">
            {activeTab === 'summary' && analysisResult.summary && (
              <div className="prose dark:prose-invert max-w-none">
                <div className="whitespace-pre-wrap text-gray-700 dark:text-gray-300">
                  {analysisResult.summary}
                </div>
              </div>
            )}

            {activeTab === 'keywords' && analysisResult.keywords && (
              <div className="flex flex-wrap gap-2">
                {analysisResult.keywords.map((keyword, index) => (
                  <span
                    key={index}
                    className="px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 rounded-full text-sm"
                  >
                    {keyword}
                  </span>
                ))}
              </div>
            )}

            {activeTab === 'references' && analysisResult.references && (
              <div className="space-y-3">
                {analysisResult.references.length > 0 ? (
                  analysisResult.references.map((ref, index) => (
                    <div
                      key={index}
                      className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-md border border-gray-200 dark:border-gray-600"
                    >
                      <p className="text-sm text-gray-700 dark:text-gray-300 mb-1">
                        "{ref.text}"
                      </p>
                      <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                        <span className="px-2 py-0.5 bg-gray-200 dark:bg-gray-600 rounded">
                          {ref.reference_type}
                        </span>
                        <span>{ref.source}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-gray-500 dark:text-gray-400">未找到引用</p>
                )}
              </div>
            )}

            {activeTab === 'entities' && analysisResult.entities && (
              <div className="space-y-3">
                {analysisResult.entities.length > 0 ? (
                  analysisResult.entities.map((entity, index) => (
                    <div
                      key={index}
                      className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-md border border-gray-200 dark:border-gray-600"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-gray-900 dark:text-white">
                          {entity.name}
                        </span>
                        <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 rounded text-xs">
                          {entity.entity_type}
                        </span>
                      </div>
                      {entity.description && (
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          {entity.description}
                        </p>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-gray-500 dark:text-gray-400">未找到实体</p>
                )}
              </div>
            )}
          </div>
        )}

        {!isAnalyzing && !analysisResult && (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            <p className="text-sm">点击上方标签页开始分析</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default DocumentAnalysisPanel;

