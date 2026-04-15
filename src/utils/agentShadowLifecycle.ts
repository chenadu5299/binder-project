import { useAgentStore } from '../stores/agentStore';
import type { AgentTaskRecord } from '../types/agent';
import {
  createConfirmedConfirmationRecord,
  createFailedVerificationRecord,
  createRejectedConfirmationRecord,
  createShadowStageState,
  markShadowTaskLifecycle,
} from '../types/agent_state';

function withMatchingRuntime(chatTabId: string, agentTaskId: string | undefined) {
  if (!agentTaskId) return null;
  const store = useAgentStore.getState();
  const runtime = store.runtimesByTab[chatTabId];
  if (!runtime?.currentTask) return null;
  if (runtime.currentTask.id !== agentTaskId) return null;
  return { store, runtime, task: runtime.currentTask };
}

function withMatchingRuntimeOrRecent(chatTabId: string, agentTaskId: string | undefined) {
  if (!agentTaskId) return null;
  const store = useAgentStore.getState();
  const runtime = store.runtimesByTab[chatTabId];
  if (!runtime) return null;

  if (runtime.currentTask?.id === agentTaskId) {
    return { store, runtime, task: runtime.currentTask };
  }

  const recentTask = runtime.recentTasks.find((t: AgentTaskRecord) => t.id === agentTaskId);
  if (recentTask) {
    return { store, runtime, task: recentTask, isRecentTask: true as const };
  }

  return null;
}

/**
 * 仅标记 verification 失败。
 * 不推进 lifecycle 或 stage。
 * invalidated 的推进由 AgentTaskController.forceInvalidate 统一执行。
 * （A-AG-M-T-05 §四）
 */
export function markVerificationFailed(
  chatTabId: string,
  agentTaskId: string | undefined,
  reason: string,
): boolean {
  if (!agentTaskId) return false;
  const store = useAgentStore.getState();
  const runtime = store.runtimesByTab[chatTabId];
  if (!runtime) return false;

  const task =
    runtime.currentTask?.id === agentTaskId
      ? runtime.currentTask
      : runtime.recentTasks.find((t: AgentTaskRecord) => t.id === agentTaskId);
  if (!task) return false;

  store.setVerification(
    chatTabId,
    createFailedVerificationRecord(task.id, reason),
  );
  return true;
}

/**
 * 内部委托函数：同时写 verification=failed + lifecycle=invalidated + stage=invalidated。
 * 对外入口收敛至 AgentTaskController.forceInvalidate，不应由 UI 或 diffStore 直接调用。
 * （A-AG-M-T-05 §6.2 — 保留用于 forceInvalidate 内部委托）
 */
export function markAgentInvalidated(
  chatTabId: string,
  agentTaskId: string | undefined,
  reason: string,
): boolean {
  const matched = withMatchingRuntimeOrRecent(chatTabId, agentTaskId);
  if (!matched) return false;

  const { store, task } = matched;
  store.setVerification(
    chatTabId,
    createFailedVerificationRecord(task.id, reason),
  );
  if (!('isRecentTask' in matched)) {
    const invalidatedTask = markShadowTaskLifecycle(task, 'invalidated');
    store.setCurrentTask(chatTabId, invalidatedTask);
  }
  store.setStageState(
    chatTabId,
    createShadowStageState(task.id, 'invalidated', reason),
  );
  return true;
}

/**
 * @deprecated 由 AgentTaskController.checkAndAdvanceStage 替代。
 * 保留供迁移期过渡，待 AgentTaskController 完全落地后删除。
 */
function markAgentUserConfirmed(
  chatTabId: string,
  agentTaskId: string | undefined,
  reason: string,
): boolean {
  const matched = withMatchingRuntime(chatTabId, agentTaskId);
  if (!matched) return false;

  const { store, task } = matched;
  store.setConfirmation(
    chatTabId,
    createConfirmedConfirmationRecord(task.id, reason),
  );
  store.setStageState(
    chatTabId,
    createShadowStageState(task.id, 'user_confirmed', reason),
  );
  return true;
}

/**
 * @deprecated 由 AgentTaskController.checkAndAdvanceStage 替代。
 * 保留供迁移期过渡，待 AgentTaskController 完全落地后删除。
 */
function markAgentStageComplete(
  chatTabId: string,
  agentTaskId: string | undefined,
  reason: string,
): boolean {
  const matched = withMatchingRuntime(chatTabId, agentTaskId);
  if (!matched) return false;

  const { store, task } = matched;
  const completedTask = markShadowTaskLifecycle(task, 'completed');
  store.setCurrentTask(chatTabId, completedTask);
  store.setStageState(
    chatTabId,
    createShadowStageState(task.id, 'stage_complete', reason),
  );
  return true;
}

/**
 * @deprecated 由 AgentTaskController.checkAndAdvanceStage 替代（reject 不等于 verification failed）。
 * 保留供迁移期过渡，待 AgentTaskController 完全落地后删除。
 */
function markAgentRejected(
  chatTabId: string,
  agentTaskId: string | undefined,
  reason: string,
): boolean {
  const matched = withMatchingRuntimeOrRecent(chatTabId, agentTaskId);
  if (!matched) return false;

  const { store, task } = matched;
  store.setConfirmation(
    chatTabId,
    createRejectedConfirmationRecord(task.id, reason),
  );
  if (!('isRecentTask' in matched)) {
    const invalidatedTask = markShadowTaskLifecycle(task, 'invalidated');
    store.setCurrentTask(chatTabId, invalidatedTask);
  }
  store.setStageState(
    chatTabId,
    createShadowStageState(task.id, 'invalidated', reason),
  );
  return true;
}

// Re-export deprecated functions for backward compatibility during migration.
// These will be removed after AgentTaskController is fully adopted.
export { markAgentUserConfirmed, markAgentStageComplete, markAgentRejected };
