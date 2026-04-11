import { invoke } from '@tauri-apps/api/core';
import type {
  CompiledWorkflow,
  ParsedWorkflow,
  WorkflowExecutionRuntime,
  WorkflowTemplate,
  WorkflowTemplateStatus,
  WorkflowTemplateWithDocument,
} from '../types/template';

export const templateService = {
  async createTemplate(
    workspacePath: string,
    request: {
      name: string;
      description?: string | null;
      projectId?: string | null;
    },
  ): Promise<WorkflowTemplate> {
    return invoke<WorkflowTemplate>('create_workflow_template', {
      workspacePath,
      request: {
        name: request.name,
        description: request.description ?? null,
        projectId: request.projectId ?? null,
      },
    });
  },

  async listTemplates(workspacePath: string): Promise<WorkflowTemplate[]> {
    return invoke<WorkflowTemplate[]>('list_workflow_templates', { workspacePath });
  },

  async loadTemplate(
    workspacePath: string,
    templateId: string,
  ): Promise<WorkflowTemplateWithDocument> {
    return invoke<WorkflowTemplateWithDocument>('load_workflow_template', {
      workspacePath,
      templateId,
    });
  },

  async saveTemplateDocument(
    workspacePath: string,
    request: { templateId: string; content: string },
  ): Promise<WorkflowTemplateWithDocument> {
    return invoke<WorkflowTemplateWithDocument>('save_workflow_template_document', {
      workspacePath,
      request,
    });
  },

  async updateTemplateStatus(
    workspacePath: string,
    request: { templateId: string; status: WorkflowTemplateStatus },
  ): Promise<void> {
    return invoke('update_workflow_template_status', {
      workspacePath,
      request,
    });
  },

  async parseTemplate(
    workspacePath: string,
    templateId: string,
  ): Promise<ParsedWorkflow> {
    return invoke<ParsedWorkflow>('parse_workflow_template', {
      workspacePath,
      templateId,
    });
  },

  async compileTemplate(
    workspacePath: string,
    templateId: string,
  ): Promise<CompiledWorkflow> {
    return invoke<CompiledWorkflow>('compile_workflow_template', {
      workspacePath,
      templateId,
    });
  },

  async getWorkflowExecutionRuntime(
    workspacePath: string,
    taskId: string,
  ): Promise<WorkflowExecutionRuntime> {
    return invoke<WorkflowExecutionRuntime>('get_workflow_execution_runtime', {
      workspacePath,
      taskId,
    });
  },

  async requestWorkflowManualIntervention(
    workspacePath: string,
    taskId: string,
    reason?: string,
  ): Promise<WorkflowExecutionRuntime> {
    return invoke<WorkflowExecutionRuntime>('request_workflow_manual_intervention', {
      workspacePath,
      request: {
        taskId,
        reason,
      },
    });
  },

  async resumeWorkflowExecution(
    workspacePath: string,
    taskId: string,
  ): Promise<WorkflowExecutionRuntime> {
    return invoke<WorkflowExecutionRuntime>('resume_workflow_execution', {
      workspacePath,
      request: {
        taskId,
      },
    });
  },

  async markCurrentWorkflowStepFailed(
    workspacePath: string,
    taskId: string,
    reason?: string,
  ): Promise<WorkflowExecutionRuntime> {
    return invoke<WorkflowExecutionRuntime>('mark_current_workflow_step_failed', {
      workspacePath,
      request: {
        taskId,
        reason,
      },
    });
  },

  async advanceWorkflowExecutionStep(
    workspacePath: string,
    taskId: string,
  ): Promise<WorkflowExecutionRuntime> {
    return invoke<WorkflowExecutionRuntime>('advance_workflow_execution_step', {
      workspacePath,
      request: {
        taskId,
      },
    });
  },
};
