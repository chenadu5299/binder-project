import { create } from 'zustand';
import type {
    CompiledWorkflow,
    ParsedWorkflow,
    WorkflowTemplate,
    WorkflowTemplateDocument,
} from '../types/template';

/**
 * TMP-P0 状态骨架。
 * 当前只冻结 workflow-only 模块入口，不承担 P1 之后的真实资产闭环。
 */
interface TemplateState {
    templates: WorkflowTemplate[];
    activeTemplateId: string | null;
    documentsByTemplateId: Record<string, WorkflowTemplateDocument>;
    parsedWorkflowsByTemplateId: Record<string, ParsedWorkflow>;
    compiledWorkflowsByTemplateId: Record<string, CompiledWorkflow>;
    setTemplates: (templates: WorkflowTemplate[]) => void;
    upsertTemplate: (template: WorkflowTemplate) => void;
    setActiveTemplate: (templateId: string | null) => void;
    upsertTemplateDocument: (document: WorkflowTemplateDocument) => void;
    upsertParsedWorkflow: (workflow: ParsedWorkflow) => void;
    upsertCompiledWorkflow: (workflow: CompiledWorkflow) => void;
    clearWorkflowAnalysis: (templateId: string) => void;
}

export const useTemplateStore = create<TemplateState>((set) => ({
    templates: [],
    activeTemplateId: null,
    documentsByTemplateId: {},
    parsedWorkflowsByTemplateId: {},
    compiledWorkflowsByTemplateId: {},
    setTemplates: (templates) => set({ templates }),
    upsertTemplate: (template) =>
        set((state) => {
            const exists = state.templates.some((item) => item.id === template.id);
            return {
                templates: exists
                    ? state.templates.map((item) => (item.id === template.id ? template : item))
                    : [template, ...state.templates],
            };
        }),
    setActiveTemplate: (activeTemplateId) => set({ activeTemplateId }),
    upsertTemplateDocument: (document) =>
        set((state) => ({
            documentsByTemplateId: {
                ...state.documentsByTemplateId,
                [document.templateId]: document,
            },
        })),
    upsertParsedWorkflow: (workflow) =>
        set((state) => ({
            parsedWorkflowsByTemplateId: {
                ...state.parsedWorkflowsByTemplateId,
                [workflow.templateId]: workflow,
            },
        })),
    upsertCompiledWorkflow: (workflow) =>
        set((state) => ({
            compiledWorkflowsByTemplateId: {
                ...state.compiledWorkflowsByTemplateId,
                [workflow.templateId]: workflow,
            },
        })),
    clearWorkflowAnalysis: (templateId) =>
        set((state) => {
            const parsedWorkflowsByTemplateId = { ...state.parsedWorkflowsByTemplateId };
            const compiledWorkflowsByTemplateId = { ...state.compiledWorkflowsByTemplateId };
            delete parsedWorkflowsByTemplateId[templateId];
            delete compiledWorkflowsByTemplateId[templateId];
            return {
                parsedWorkflowsByTemplateId,
                compiledWorkflowsByTemplateId,
            };
        }),
}));
