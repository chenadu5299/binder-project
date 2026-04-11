/**
 * TMP-P0 核心对象命名壳。
 * 这里冻结模板库模块的 workflow-only 对象边界，
 * 为 P1-P4 的真实落地提供统一命名入口。
 */

export type WorkflowTemplateStatus = 'draft' | 'active' | 'disabled';

export interface WorkflowTemplate {
    id: string;
    workspacePath: string;
    projectId?: string | null;
    name: string;
    description?: string | null;
    status: WorkflowTemplateStatus;
    version: number;
    createdAt: number;
    updatedAt: number;
}

/**
 * 用户编辑真源：用户友好文档表达层。
 * 注意：该对象不是可直接执行对象。
 */
export interface WorkflowTemplateDocument {
    templateId: string;
    content: string;
    updatedAt: number;
}

export interface WorkflowTemplateWithDocument {
    template: WorkflowTemplate;
    document: WorkflowTemplateDocument;
}

export type WorkflowDiagnosticKind = 'fatal' | 'recoverable' | 'runtime';

export interface WorkflowDiagnostic {
    kind: WorkflowDiagnosticKind;
    code: string;
    message: string;
    phaseName?: string;
    stepName?: string;
}

/**
 * 结构解析结果壳。
 * P2 起由解析链填充真实字段。
 */
export interface ParsedWorkflowStep {
    name: string;
    input: string[];
    output: string[];
    constraint?: string[];
}

export interface ParsedWorkflow {
    templateId: string;
    phases: Array<{
        name: string;
        steps: ParsedWorkflowStep[];
    }>;
    updatedAt: number;
    diagnostics: WorkflowDiagnostic[];
}

/**
 * 编译后结构化流程表示。
 * P2 起成为执行前唯一合法消费对象。
 */
export type CompiledWorkflowStatus = 'ready' | 'risky' | 'blocked';

export interface CompiledWorkflowStep {
    id: string;
    name: string;
    input: string[];
    output: string[];
    constraint: string[];
    warningCount: number;
}

export interface CompiledWorkflowPhase {
    id: string;
    name: string;
    steps: CompiledWorkflowStep[];
}

export interface CompiledWorkflow {
    templateId: string;
    version: number;
    phaseCount: number;
    stepCount: number;
    compiledAt: number;
    documentUpdatedAt: number;
    status: CompiledWorkflowStatus;
    riskLevel?: 'none' | 'warning';
    phases: CompiledWorkflowPhase[];
    diagnostics: WorkflowDiagnostic[];
}

export interface TemplateBinding {
    templateId: string;
    taskId: string;
    workspacePath: string;
    boundAt: number;
}

export interface RuntimeWorkflowPlanStep {
    id: string;
    phaseId: string;
    phaseName: string;
    stepIndex: number;
    name: string;
    input: string[];
    output: string[];
    constraint: string[];
}

export interface RuntimeWorkflowPlan {
    templateId: string;
    taskId: string;
    currentStepIndex: number;
    totalSteps: number;
    createdAt: number;
    steps: RuntimeWorkflowPlanStep[];
}

export interface StepState {
    stepIndex: number;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'waiting_user';
    updatedAt: number;
    reason?: string;
}

export interface ExecutionState {
    taskId: string;
    stage: 'continuous' | 'restricted' | 'manual_intervention';
    currentStepIndex: number;
    updatedAt: number;
    waitingForUser: boolean;
    reason?: string;
}

export interface ExecutionContext {
    taskId: string;
    templateId: string;
    workspacePath: string;
    createdAt: number;
    lastResumedAt?: number;
    lastInterruptedAt?: number;
}

export interface WorkflowExecutionRuntime {
    context: ExecutionContext;
    executionState: ExecutionState;
    stepStates: StepState[];
    runtimePlan: RuntimeWorkflowPlan;
    runtimeDiagnostics?: WorkflowDiagnostic[];
}
