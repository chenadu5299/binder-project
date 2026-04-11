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

function syncTaskToDb(task: AgentTaskRecord, stage: string, stageReason: string): void {
  import('../services/agentTaskPersistence').then(({ persistAgentTaskUpdate }) => {
    persistAgentTaskUpdate(
      task.id, task.chatTabId, task.goal,
      task.lifecycle, stage, stageReason,
    );
  }).catch(() => {});
}

export function markAgentUserConfirmed(
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
  syncTaskToDb(task, 'user_confirmed', reason);
  return true;
}

export function markAgentStageComplete(
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
  syncTaskToDb(completedTask, 'stage_complete', reason);
  return true;
}

export function markAgentRejected(
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
  syncTaskToDb(
    { ...task, lifecycle: 'invalidated' },
    'invalidated', reason,
  );
  return true;
}

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
  syncTaskToDb(
    { ...task, lifecycle: 'invalidated' },
    'invalidated', reason,
  );
  return true;
}
