import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PlusIcon } from '@heroicons/react/24/outline';
import { useFileStore } from '../../stores/fileStore';
import { useTemplateStore } from '../../stores/templateStore';
import { useChatStore } from '../../stores/chatStore';
import { useReferenceStore } from '../../stores/referenceStore';
import { templateService } from '../../services/templateService';
import { toast } from '../Common/Toast';
import InputDialog from './InputDialog';
import { ReferenceType } from '../../types/reference';
import type {
  CompiledWorkflowStatus,
  WorkflowDiagnostic,
  WorkflowTemplate,
  WorkflowTemplateStatus,
} from '../../types/template';

interface InstructionSectionProps {
  isExpanded: boolean;
}

const statusLabel: Record<WorkflowTemplateStatus, string> = {
  draft: '草稿',
  active: '可用',
  disabled: '停用',
};

const statusBadgeClass: Record<WorkflowTemplateStatus, string> = {
  draft: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  active: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-200',
  disabled: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200',
};

const compileStatusLabel: Record<CompiledWorkflowStatus, string> = {
  ready: '可执行',
  risky: '风险可执行',
  blocked: '阻断',
};

const compileStatusClass: Record<CompiledWorkflowStatus, string> = {
  ready: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-200',
  risky: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-200',
  blocked: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200',
};

const InstructionSection: React.FC<InstructionSectionProps> = ({ isExpanded }) => {
  const { currentWorkspace } = useFileStore();
  const { activeTabId, tabs } = useChatStore();
  const { addReference, getReferences } = useReferenceStore();
  const {
    templates,
    activeTemplateId,
    documentsByTemplateId,
    parsedWorkflowsByTemplateId,
    compiledWorkflowsByTemplateId,
    setTemplates,
    upsertTemplate,
    setActiveTemplate,
    upsertTemplateDocument,
    upsertParsedWorkflow,
    upsertCompiledWorkflow,
    clearWorkflowAnalysis,
  } = useTemplateStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [isCompiling, setIsCompiling] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editorContent, setEditorContent] = useState('');

  const activeTemplate = useMemo(
    () => templates.find((item) => item.id === activeTemplateId) ?? null,
    [templates, activeTemplateId],
  );
  const activeChatTab = useMemo(
    () => tabs.find((item) => item.id === activeTabId) ?? null,
    [tabs, activeTabId],
  );

  const activeParsedWorkflow = activeTemplateId ? parsedWorkflowsByTemplateId[activeTemplateId] ?? null : null;
  const activeCompiledWorkflow = activeTemplateId ? compiledWorkflowsByTemplateId[activeTemplateId] ?? null : null;

  const filteredTemplates = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase();
    if (!needle) return templates;
    return templates.filter((item) => {
      const haystack = `${item.name} ${item.description ?? ''}`.toLowerCase();
      return haystack.includes(needle);
    });
  }, [templates, searchQuery]);

  const syncEditorFromStore = useCallback(
    (templateId: string | null) => {
      if (!templateId) {
        setEditorContent('');
        return;
      }
      setEditorContent(documentsByTemplateId[templateId]?.content ?? '');
    },
    [documentsByTemplateId],
  );

  const loadTemplates = useCallback(async () => {
    if (!isExpanded || !currentWorkspace) {
      setTemplates([]);
      setActiveTemplate(null);
      setEditorContent('');
      return;
    }

    setIsLoading(true);
    try {
      const list = await templateService.listTemplates(currentWorkspace);
      setTemplates(list);
      if (!activeTemplateId && list.length > 0) {
        setActiveTemplate(list[0].id);
      }
    } catch (error) {
      console.error('加载工作流模板失败:', error);
      toast.error(`加载模板失败: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsLoading(false);
    }
  }, [activeTemplateId, currentWorkspace, isExpanded, setActiveTemplate, setTemplates]);

  const loadTemplateDetail = useCallback(
    async (template: WorkflowTemplate) => {
      if (!currentWorkspace) return;
      try {
        const payload = await templateService.loadTemplate(currentWorkspace, template.id);
        upsertTemplate(payload.template);
        upsertTemplateDocument(payload.document);
        setActiveTemplate(payload.template.id);
        setEditorContent(payload.document.content);
      } catch (error) {
        console.error('加载模板详情失败:', error);
        toast.error(`打开模板失败: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
    [currentWorkspace, setActiveTemplate, upsertTemplate, upsertTemplateDocument],
  );

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  useEffect(() => {
    syncEditorFromStore(activeTemplateId);
  }, [activeTemplateId, syncEditorFromStore]);

  useEffect(() => {
    if (!currentWorkspace || !activeTemplateId) return;
    if (documentsByTemplateId[activeTemplateId]) return;
    const template = templates.find((item) => item.id === activeTemplateId);
    if (!template) return;
    void loadTemplateDetail(template);
  }, [activeTemplateId, currentWorkspace, documentsByTemplateId, loadTemplateDetail, templates]);

  const handleCreateTemplate = useCallback(
    async (name: string) => {
      if (!currentWorkspace) {
        toast.warning('请先选择工作区');
        return;
      }
      try {
        const created = await templateService.createTemplate(currentWorkspace, { name });
        upsertTemplate(created);
        upsertTemplateDocument({
          templateId: created.id,
          content: '',
          updatedAt: created.updatedAt,
        });
        setActiveTemplate(created.id);
        setEditorContent('');
        setIsCreateOpen(false);
        toast.success(`已创建工作流模板：${created.name}`);
      } catch (error) {
        console.error('创建工作流模板失败:', error);
        toast.error(`创建模板失败: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
    [currentWorkspace, setActiveTemplate, upsertTemplate, upsertTemplateDocument],
  );

  const handleSaveDocument = useCallback(async () => {
    if (!currentWorkspace || !activeTemplate) return;
    setIsSaving(true);
    try {
      const payload = await templateService.saveTemplateDocument(currentWorkspace, {
        templateId: activeTemplate.id,
        content: editorContent,
      });
      upsertTemplate(payload.template);
      upsertTemplateDocument(payload.document);
      clearWorkflowAnalysis(activeTemplate.id);
      toast.success('模板文档已保存');
    } catch (error) {
      console.error('保存模板文档失败:', error);
      toast.error(`保存模板失败: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsSaving(false);
    }
  }, [activeTemplate, currentWorkspace, editorContent, upsertTemplateDocument]);

  const handleParseTemplate = useCallback(async () => {
    if (!currentWorkspace || !activeTemplate) return;
    setIsParsing(true);
    try {
      const parsed = await templateService.parseTemplate(currentWorkspace, activeTemplate.id);
      upsertParsedWorkflow(parsed);
      const fatalCount = parsed.diagnostics.filter((item) => item.kind === 'fatal').length;
      const recoverableCount = parsed.diagnostics.filter((item) => item.kind === 'recoverable').length;
      if (fatalCount > 0) {
        toast.warning(`解析完成，但存在 ${fatalCount} 个结构错误`);
      } else if (recoverableCount > 0) {
        toast.warning(`解析完成，存在 ${recoverableCount} 个风险项`);
      } else {
        toast.success('结构解析完成');
      }
    } catch (error) {
      console.error('解析工作流模板失败:', error);
      toast.error(`解析模板失败: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsParsing(false);
    }
  }, [activeTemplate, currentWorkspace, upsertParsedWorkflow]);

  const handleCompileTemplate = useCallback(async () => {
    if (!currentWorkspace || !activeTemplate) return;
    setIsCompiling(true);
    try {
      const compiled = await templateService.compileTemplate(currentWorkspace, activeTemplate.id);
      upsertCompiledWorkflow(compiled);
      if (compiled.status === 'blocked') {
        toast.warning('编译完成，但模板存在阻断错误，不能进入执行链');
      } else if (compiled.status === 'risky') {
        toast.warning('编译完成，模板当前为风险可执行');
      } else {
        toast.success('流程编译完成');
      }
    } catch (error) {
      console.error('编译工作流模板失败:', error);
      toast.error(`编译模板失败: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsCompiling(false);
    }
  }, [activeTemplate, currentWorkspace, upsertCompiledWorkflow]);

  const handleStatusChange = useCallback(
    async (status: WorkflowTemplateStatus) => {
      if (!currentWorkspace || !activeTemplate) return;
      try {
        await templateService.updateTemplateStatus(currentWorkspace, {
          templateId: activeTemplate.id,
          status,
        });
        upsertTemplate({
          ...activeTemplate,
          status,
          updatedAt: Date.now(),
        });
        toast.success(`模板状态已更新为：${statusLabel[status]}`);
      } catch (error) {
        console.error('更新模板状态失败:', error);
        toast.error(`更新模板状态失败: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
    [activeTemplate, currentWorkspace, upsertTemplate],
  );

  const handleAttachToCurrentTask = useCallback(() => {
    if (!activeTemplate || !activeCompiledWorkflow) {
      toast.warning('请先完成模板编译');
      return;
    }
    if (!activeTabId || !activeChatTab) {
      toast.warning('请先打开目标对话');
      return;
    }
    if (activeChatTab.mode !== 'agent') {
      toast.warning('当前仅支持在 Agent 对话中引用工作流模板');
      return;
    }
    if (activeCompiledWorkflow.status === 'blocked') {
      toast.warning('模板存在阻断错误，不能引用到当前任务');
      return;
    }

    const existing = getReferences(activeTabId).find(
      (item) => item.type === ReferenceType.TEMPLATE && item.id === `template-${activeTemplate.id}`,
    );
    if (existing) {
      toast.warning('当前对话已引用该工作流模板');
      return;
    }

    addReference(activeTabId, {
      id: `template-${activeTemplate.id}`,
      type: ReferenceType.TEMPLATE,
      createdAt: Date.now(),
      templateId: activeTemplate.id,
      templateName: activeTemplate.name,
      templateType: 'workflow',
    });
    toast.success(`已将工作流模板“${activeTemplate.name}”引用到当前对话`);
  }, [activeChatTab, activeCompiledWorkflow, activeTabId, activeTemplate, addReference, getReferences]);

  const renderDiagnostics = (title: string, diagnostics: WorkflowDiagnostic[]) => {
    if (diagnostics.length === 0) {
      return (
        <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700 dark:border-green-900/50 dark:bg-green-950/30 dark:text-green-200">
          {title}：未发现结构错误或风险项
        </div>
      );
    }

    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-800/60">
        <div className="text-xs font-medium text-gray-700 dark:text-gray-200">{title}</div>
        <div className="mt-2 space-y-1">
          {diagnostics.map((item, index) => (
            <div
              key={`${item.code}-${index}`}
              className={`rounded px-2 py-1 text-[11px] ${
                item.kind === 'fatal'
                  ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-200'
                  : item.kind === 'recoverable'
                    ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-200'
                    : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-200'
              }`}
            >
              <span className="font-medium">{item.kind}</span>
              <span className="ml-2">{item.message}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  if (!isExpanded) {
    return null;
  }

  if (!currentWorkspace) {
    return (
      <div className="p-3 text-center text-gray-500 dark:text-gray-400 text-sm py-8">
        请先选择工作区
      </div>
    );
  }

  return (
    <div className="p-3 space-y-3">
      {isCreateOpen ? (
        <InputDialog
          title="新建工作流模板"
          message="输入模板名称。模板创建后默认处于草稿状态。"
          onConfirm={(value) => {
            void handleCreateTemplate(value);
          }}
          onCancel={() => setIsCreateOpen(false)}
        />
      ) : null}

      <div className="flex items-center gap-2">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="搜索工作流模板..."
          className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg
                   focus:outline-none focus:ring-2 focus:ring-blue-500
                   bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
        />
        <button
          type="button"
          onClick={() => setIsCreateOpen(true)}
          className="inline-flex items-center gap-1 px-3 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
        >
          <PlusIcon className="w-4 h-4" />
          新建
        </button>
      </div>

      {isLoading ? (
        <div className="text-center text-gray-500 dark:text-gray-400 text-sm py-8">
          正在加载工作流模板...
        </div>
      ) : filteredTemplates.length === 0 ? (
        <div className="text-center text-gray-500 dark:text-gray-400 text-sm py-8">
          {searchQuery.trim() ? '没有匹配的工作流模板' : '暂无工作流模板'}
          <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
            模板库当前仅承接工作流模板，不承接文档模板或 skills。
          </p>
        </div>
      ) : (
        <div className="space-y-2 max-h-[180px] overflow-y-auto">
          {filteredTemplates.map((template) => {
            const selected = template.id === activeTemplateId;
            return (
              <button
                key={template.id}
                type="button"
                onClick={() => void loadTemplateDetail(template)}
                className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                  selected
                    ? 'border-blue-300 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30'
                    : 'border-gray-200 bg-white hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                      {template.name}
                    </div>
                    <div className="mt-1 text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                      {template.description || '工作流模板文档表达层'}
                    </div>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${statusBadgeClass[template.status]}`}>
                    {statusLabel[template.status]}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {activeTemplate ? (
        <div className="space-y-3 border-t border-gray-200 pt-3 dark:border-gray-700">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                {activeTemplate.name}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                模板文档表达层真源
              </div>
            </div>
            <div className="flex items-center gap-1">
              {(['draft', 'active', 'disabled'] as WorkflowTemplateStatus[]).map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => void handleStatusChange(status)}
                  className={`px-2 py-1 rounded text-[11px] border transition-colors ${
                    activeTemplate.status === status
                      ? 'border-blue-500 text-blue-600 dark:text-blue-300 dark:border-blue-400'
                      : 'border-gray-200 text-gray-500 hover:text-gray-700 dark:border-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                  }`}
                >
                  {statusLabel[status]}
                </button>
              ))}
            </div>
          </div>

          <textarea
            value={editorContent}
            onChange={(e) => setEditorContent(e.target.value)}
            placeholder="编写工作流模板文档表达层。P2 起将基于此进入结构解析与流程编译。"
            className="w-full min-h-[180px] rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          <div className="flex justify-end">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void handleSaveDocument()}
                disabled={isSaving}
                className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 transition-colors"
              >
                {isSaving ? '保存中...' : '保存模板'}
              </button>
              <button
                type="button"
                onClick={() => void handleParseTemplate()}
                disabled={isParsing}
                className="px-4 py-2 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                {isParsing ? '解析中...' : '手动解析'}
              </button>
              <button
                type="button"
                onClick={() => void handleCompileTemplate()}
                disabled={isCompiling}
                className="px-4 py-2 text-sm rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60 transition-colors"
              >
                {isCompiling ? '编译中...' : '流程编译'}
              </button>
              <button
                type="button"
                onClick={handleAttachToCurrentTask}
                disabled={!activeCompiledWorkflow || activeCompiledWorkflow.status === 'blocked'}
                className="px-4 py-2 text-sm rounded-lg border border-purple-300 text-purple-700 hover:bg-purple-50 disabled:opacity-50 dark:border-purple-700 dark:text-purple-200 dark:hover:bg-purple-950/30 transition-colors"
              >
                引用到当前对话
              </button>
            </div>
          </div>

          {activeParsedWorkflow ? (
            <div className="space-y-2">
              <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-800/60">
                <div className="text-xs font-medium text-gray-700 dark:text-gray-200">解析结果</div>
                <div className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                  阶段 {activeParsedWorkflow.phases.length} 个，步骤{' '}
                  {activeParsedWorkflow.phases.reduce((sum, phase) => sum + phase.steps.length, 0)} 个
                </div>
              </div>
              {renderDiagnostics('解析诊断', activeParsedWorkflow.diagnostics)}
            </div>
          ) : null}

          {activeCompiledWorkflow ? (
            <div className="space-y-2">
              <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-800/60">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-medium text-gray-700 dark:text-gray-200">编译结果</div>
                    <div className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                      阶段 {activeCompiledWorkflow.phaseCount} 个，步骤 {activeCompiledWorkflow.stepCount} 个
                    </div>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${compileStatusClass[activeCompiledWorkflow.status]}`}>
                    {compileStatusLabel[activeCompiledWorkflow.status]}
                  </span>
                </div>
              </div>
              {renderDiagnostics('编译诊断', activeCompiledWorkflow.diagnostics)}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

export default InstructionSection;
