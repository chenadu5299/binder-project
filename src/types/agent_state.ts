import type {
  AgentConfirmationRecord,
  AgentConfirmationStatus,
  AgentTaskLifecycle,
  AgentTaskRecord,
  AgentStageName,
  AgentStageState,
  AgentVerificationRecord,
  AgentVerificationStatus,
} from './agent';

function createShadowId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Phase 2 shadow helper:
 * 当前先把 L3 主链的正式状态对象立起来，但不接管实际闭环。
 * 现阶段仍保持“一次发送 -> 一个 shadow task 外壳”的最小粒度。
 */
export function createShadowTaskRecord(chatTabId: string, goal: string): AgentTaskRecord {
  const now = Date.now();
  return {
    id: createShadowId('agent-task'),
    chatTabId,
    goal,
    lifecycle: 'active',
    createdAt: now,
    updatedAt: now,
  };
}

export function createShadowStageState(
  taskId: string | null,
  stage: AgentStageName,
  stageReason?: string,
): AgentStageState {
  return {
    taskId,
    stage,
    updatedAt: Date.now(),
    ...(stageReason ? { stageReason } : {}),
  };
}

export function createPendingVerificationRecord(
  taskId: string | null,
  summary?: string,
): AgentVerificationRecord {
  return createVerificationRecord(taskId, 'pending', summary);
}

export function createPassedVerificationRecord(
  taskId: string | null,
  summary?: string,
): AgentVerificationRecord {
  return createVerificationRecord(taskId, 'passed', summary);
}

export function createFailedVerificationRecord(
  taskId: string | null,
  summary?: string,
): AgentVerificationRecord {
  return createVerificationRecord(taskId, 'failed', summary);
}

export function createPendingConfirmationRecord(
  taskId: string | null,
  summary?: string,
): AgentConfirmationRecord {
  return createConfirmationRecord(taskId, 'pending', summary);
}

export function createConfirmedConfirmationRecord(
  taskId: string | null,
  summary?: string,
): AgentConfirmationRecord {
  return createConfirmationRecord(taskId, 'confirmed', summary);
}

export function createRejectedConfirmationRecord(
  taskId: string | null,
  summary?: string,
): AgentConfirmationRecord {
  return createConfirmationRecord(taskId, 'rejected', summary);
}

function createVerificationRecord(
  taskId: string | null,
  status: AgentVerificationStatus,
  summary?: string,
): AgentVerificationRecord {
  const now = Date.now();
  return {
    id: createShadowId('agent-verification'),
    taskId,
    status,
    ...(summary ? { summary } : {}),
    createdAt: now,
    updatedAt: now,
  };
}

function createConfirmationRecord(
  taskId: string | null,
  status: AgentConfirmationStatus,
  summary?: string,
): AgentConfirmationRecord {
  const now = Date.now();
  return {
    id: createShadowId('agent-confirmation'),
    taskId,
    status,
    ...(summary ? { summary } : {}),
    createdAt: now,
    updatedAt: now,
  };
}

export function markShadowTaskLifecycle(
  task: AgentTaskRecord,
  lifecycle: AgentTaskLifecycle,
): AgentTaskRecord {
  return {
    ...task,
    lifecycle,
    updatedAt: Date.now(),
  };
}
