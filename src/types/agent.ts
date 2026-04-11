/**
 * Binder Agent Phase 1 预留类型。
 *
 * 这些结构先用于冻结 L3 主链的对象边界，不在本阶段直接接管运行闭环。
 * 当前仍以现有 chatStore / diffStore / 后端命令链为主，P1 起逐步接线。
 */

import type { WorkflowExecutionRuntime } from './template';

export type AgentTaskLifecycle = 'idle' | 'active' | 'completed' | 'invalidated';

export type AgentStageName =
  | 'draft'
  | 'structured'
  | 'candidate_ready'
  | 'review_ready'
  | 'user_confirmed'
  | 'stage_complete'
  | 'invalidated';

export type AgentArtifactKind =
  | 'plan'
  | 'candidate'
  | 'verification'
  | 'confirmation'
  | 'summary';

export type AgentArtifactStatus = 'draft' | 'active' | 'consumed' | 'archived';

export type AgentVerificationStatus = 'pending' | 'passed' | 'failed' | 'not_required';

export type AgentConfirmationStatus =
  | 'pending'
  | 'confirmed'
  | 'rejected'
  | 'not_required';

export interface AgentTaskRecord {
  id: string;
  chatTabId: string;
  goal: string;
  lifecycle: AgentTaskLifecycle;
  createdAt: number;
  updatedAt: number;
}

export interface AgentStageState {
  taskId: string | null;
  stage: AgentStageName;
  updatedAt: number;
  stageReason?: string;
}

export interface AgentVerificationRecord {
  id: string;
  taskId: string | null;
  status: AgentVerificationStatus;
  summary?: string;
  createdAt: number;
  updatedAt: number;
}

export interface AgentConfirmationRecord {
  id: string;
  taskId: string | null;
  status: AgentConfirmationStatus;
  summary?: string;
  createdAt: number;
  updatedAt: number;
}

export interface AgentArtifactRecord {
  id: string;
  taskId: string | null;
  kind: AgentArtifactKind;
  status: AgentArtifactStatus;
  summary?: string;
  createdAt: number;
  updatedAt: number;
}

export interface PromptPackageLayer {
  key: string;
  title: string;
  content: string;
}

/**
 * Phase 1 仅冻结结构，不替代 Rust 侧 prompt 组装。
 * 前端保留该类型用于跨层命名一致性和后续接线。
 */
export interface PromptPackage {
  layers: PromptPackageLayer[];
  renderedPrompt?: string;
}

export interface AgentRuntimeRecord {
  chatTabId: string;
  /**
   * `shadow`：仅预留结构，不接管主链
   * `active`：后续阶段切到正式 state/artifact 主链
   */
  runtimeMode: 'shadow' | 'active';
  chatModeBoundary: 'agent' | 'chat';
  currentTask: AgentTaskRecord | null;
  /**
   * 归档的旧任务（FIFO，最多 MAX_RECENT_TASKS 条）。
   * 用于让旧候选的 reject/invalidated 回写能匹配到对应任务，
   * 解决 LEG-014「单 currentTask 无法安全闭合旧候选」的问题。
   */
  recentTasks: AgentTaskRecord[];
  stageState: AgentStageState;
  verification: AgentVerificationRecord | null;
  confirmation: AgentConfirmationRecord | null;
  artifacts: AgentArtifactRecord[];
  workflowExecution: WorkflowExecutionRuntime | null;
}
