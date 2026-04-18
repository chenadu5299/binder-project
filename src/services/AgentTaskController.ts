/**
 * AgentTaskController — stage_complete 与 invalidated 的唯一合法推进主体。
 *
 * 设计来源：A-AG-M-T-05_AgentTaskController设计.md
 * 受约束于：A-CORE-C-D-05_状态单一真源原则.md §6.6/§6.7
 *
 * 职责：
 * 1. 接收 diffStore 状态变更后的裁决请求（via checkAndAdvanceStage）。
 * 2. 按规则裁决是否推进 stage_complete 或 invalidated。
 * 3. 调用 agentStore 写入最终阶段结论。
 *
 * 不做的事：
 * - 不直接操作编辑器。
 * - 不生成 diff，不消费 execute_failed 事件。
 * - 不写入 workspace.db。
 */

import { useAgentStore } from '../stores/agentStore';
import { useDiffStore } from '../stores/diffStore';
import type { DiffEntry } from '../stores/diffStore';
import {
  createConfirmedConfirmationRecord,
  createPendingVerificationRecord,
  createPassedVerificationRecord,
  createPendingConfirmationRecord,
  createShadowStageState,
  markShadowTaskLifecycle,
} from '../types/agent_state';
import { markAgentInvalidated } from '../utils/agentShadowLifecycle';
import type { AgentStageName } from '../types/agent';

function stageRank(stage: string): number {
  const order: Record<string, number> = {
    draft: 0,
    structured: 1,
    candidate_ready: 2,
    review_ready: 3,
    user_confirmed: 4,
    stage_complete: 5,
    invalidated: 5,
  };
  return order[stage] ?? 0;
}

/**
 * 收集某 agentTaskId 下 byTab 中所有 DiffEntry。
 */
function getAllDiffsForAgentTask(agentTaskId: string): DiffEntry[] {
  const state = useDiffStore.getState();
  const result: DiffEntry[] = [];
  for (const tabEntry of Object.values(state.byTab)) {
    for (const diff of tabEntry.diffs.values()) {
      if (diff.agentTaskId === agentTaskId) {
        result.push(diff);
      }
    }
  }
  return result;
}

/**
 * 检查 byFilePath 中是否存在属于该 agentTaskId 的待确认 workspace diff。
 * byFilePath 条目无状态字段，存在即为 pending。
 */
function hasFileDiffsForAgentTask(agentTaskId: string): boolean {
  const state = useDiffStore.getState();
  for (const entries of Object.values(state.byFilePath)) {
    for (const entry of entries) {
      if (entry.agentTaskId === agentTaskId) return true;
    }
  }
  return false;
}

function completeAgentTask(chatTabId: string, agentTaskId: string): void {
  const store = useAgentStore.getState();
  const runtime = store.runtimesByTab[chatTabId];
  const task = runtime?.currentTask?.id === agentTaskId ? runtime.currentTask : null;
  if (!task) return;

  store.setConfirmation(
    chatTabId,
    createConfirmedConfirmationRecord(agentTaskId, 'all_diffs_resolved'),
  );
  store.setVerification(
    chatTabId,
    createPassedVerificationRecord(agentTaskId, 'diff_errors_cleared'),
  );
  const completedTask = markShadowTaskLifecycle(task, 'completed');
  store.setCurrentTask(chatTabId, completedTask);
  store.setStageState(
    chatTabId,
    createShadowStageState(agentTaskId, 'stage_complete', 'at_least_one_accepted'),
  );
}

function deriveInvalidatedReason(allDiffs: DiffEntry[], outcomeHint?: 'accepted' | 'rejected'): string {
  if (allDiffs.length === 0) {
    return outcomeHint === 'rejected' ? 'user_rejected_all' : 'system_invalidated';
  }

  const rejectedCount = allDiffs.filter((d) => d.status === 'rejected').length;
  const expiredCount = allDiffs.filter((d) => d.status === 'expired').length;
  if (expiredCount === 0) return 'user_rejected_all';
  if (rejectedCount === 0) return 'system_invalidated';
  return 'mixed_outcome';
}

function finalizeStageClosure(
  agentTaskId: string | undefined,
  chatTabId: string,
  outcomeHint?: 'accepted' | 'rejected',
): void {
  if (!agentTaskId || !chatTabId) return;

  const allDiffs = getAllDiffsForAgentTask(agentTaskId);
  const hasFilePending = hasFileDiffsForAgentTask(agentTaskId);
  const hasPending = hasFilePending || allDiffs.some((d) => d.status === 'pending');
  if ((allDiffs.length === 0 && !hasFilePending && !outcomeHint) || hasPending) return;

  const hasAccepted = allDiffs.some((d) => d.status === 'accepted') || outcomeHint === 'accepted';
  if (hasAccepted) {
    completeAgentTask(chatTabId, agentTaskId);
    return;
  }

  AgentTaskController.forceInvalidate(
    agentTaskId,
    chatTabId,
    deriveInvalidatedReason(allDiffs, outcomeHint),
  );
}

export const AgentTaskController = {
  /**
   * 用户消息进入 Agent 模式时的 shadow task 初始状态写入口。
   * 由 chatStore.sendMessage 调用，替代 chatStore 直接写 stage/verification/confirmation。
   */
  bootstrapTaskAfterUserMessage(params: {
    chatTabId: string;
    agentTaskId: string;
    stageReason?: string;
  }): void {
    const { chatTabId, agentTaskId, stageReason = 'user_message_received' } = params;
    if (!chatTabId || !agentTaskId) return;
    const store = useAgentStore.getState();
    const runtime = store.runtimesByTab[chatTabId];
    if (!runtime?.currentTask || runtime.currentTask.id !== agentTaskId) return;
    store.setStageState(
      chatTabId,
      createShadowStageState(agentTaskId, 'structured', stageReason),
    );
    store.setVerification(
      chatTabId,
      createPendingVerificationRecord(agentTaskId, 'shadow_registry_initialized'),
    );
    store.setConfirmation(
      chatTabId,
      createPendingConfirmationRecord(agentTaskId, 'awaiting_candidate_generation'),
    );
  },

  /**
   * 后端 `ai-agent-stage-changed` 镜像：仅同步 DB/后端已持久化的阶段，**不得降级**前端已由 notify* 推进的阶段。
   * 正式业务推进仍以 bootstrap / notify* / checkAndAdvanceStage 为主链。
   */
  applyBackendStageMirror(params: {
    chatTabId: string;
    taskId: string;
    stage: string;
    stageReason?: string;
  }): void {
    const { chatTabId, taskId, stage, stageReason } = params;
    const store = useAgentStore.getState();
    const runtime = store.runtimesByTab[chatTabId];
    if (!runtime?.currentTask) return;
    if (runtime.currentTask.id !== taskId && !taskId.startsWith('shadow-tab:')) return;

    const incoming = stage as AgentStageName;
    const current = runtime.stageState.stage;
    const terminalMirror = incoming === 'stage_complete' || incoming === 'invalidated';
    if (!terminalMirror && stageRank(incoming) < stageRank(current)) {
      return;
    }

    store.setStageState(chatTabId, {
      taskId: runtime.currentTask.id,
      stage: incoming,
      updatedAt: Date.now(),
      stageReason,
    });
  },

  /** @deprecated 使用 applyBackendStageMirror；保留别名避免大范围重命名 */
  syncBackendStageState: (params: {
    chatTabId: string;
    taskId: string;
    stage: string;
    stageReason?: string;
  }) => {
    AgentTaskController.applyBackendStageMirror(params);
  },

  /**
   * 候选就绪通知入口 — 替代 ChatPanel.tsx 内联推进。
   *
   * 调用时机：流式响应处理到具有候选结果的工具回调时（hasCandidatePayload）。
   * 当 stage 在 [draft, structured] 时推进到 candidate_ready；
   * candidate_ready 本身不再重复推进（幂等）。
   */
  notifyCandidateReady(agentTaskId: string | undefined, chatTabId: string, source: string): void {
    if (!agentTaskId || !chatTabId) return;
    const store = useAgentStore.getState();
    const runtime = store.runtimesByTab[chatTabId];
    const task = runtime?.currentTask?.id === agentTaskId ? runtime.currentTask : null;
    if (!task) return;
    const currentStage = runtime?.stageState.stage ?? 'draft';
    if (!['draft', 'structured'].includes(currentStage)) return;
    store.setStageState(chatTabId, createShadowStageState(agentTaskId, 'candidate_ready', source));
    store.setVerification(chatTabId, createPassedVerificationRecord(agentTaskId, source));
    store.setConfirmation(chatTabId, createPendingConfirmationRecord(agentTaskId, `${source}:awaiting_review_render`));
  },

  /**
   * Diff 写入就绪通知入口 — 替代 ChatMessages.tsx useEffect 越权推进。
   *
   * 调用时机：setDiffsForToolCall / setFilePathDiffs 完成写入后，由调用方主动通知。
   * 当 stage 在 [candidate_ready, structured] 时推进到 review_ready。
   * review_ready + awaiting_user_review 是"等待用户审查"的正式状态。
   */
  notifyDiffsReady(agentTaskId: string | undefined, chatTabId: string): void {
    if (!agentTaskId || !chatTabId) return;
    const store = useAgentStore.getState();
    const runtime = store.runtimesByTab[chatTabId];
    const task = runtime?.currentTask?.id === agentTaskId ? runtime.currentTask : null;
    if (!task) return;
    const currentStage = runtime?.stageState.stage ?? 'draft';
    // 仅当 stage 尚未到达 review_ready 或更高时推进（幂等保护）
    if (!['draft', 'structured', 'candidate_ready'].includes(currentStage)) return;
    // 验证 diffStore 中确实有属于该 agentTaskId 的 pending diff
    const hasByTab = getAllDiffsForAgentTask(agentTaskId).some((d) => d.status === 'pending');
    const hasByFilePath = hasFileDiffsForAgentTask(agentTaskId);
    if (!hasByTab && !hasByFilePath) return;
    store.setStageState(chatTabId, createShadowStageState(agentTaskId, 'review_ready', 'diffs_written_to_store'));
    store.setConfirmation(chatTabId, createPendingConfirmationRecord(agentTaskId, 'awaiting_user_review'));
  },

  /**
   * byFilePath file diff 完成 resolve 后的专用通知入口。
   *
   * 调用时机：DiffActionService.acceptFileDiffs / rejectFileDiffs 完成后。
   * outcome 由调用方显式传入；若同一 agentTask 下仍有 byFilePath 或 byTab pending，
   * 则继续等待主链收口，不在此处提前裁决。
   *
   * 裁决逻辑：
   * 1. byFilePath 或 byTab 仍有 pending → 等主链自行推进，此处返回
   * 2. 两路都无 pending → 结合 byTab 现有状态 + outcome 做最终裁决
   *    - hasAnyAccepted（byTab accepted 或 outcome=accepted）→ stage_complete
   *    - 否则 → forceInvalidate，reason 由 byTab 终态分布决定
   */
  handleFileDiffResolution(params: {
    agentTaskId: string | undefined;
    chatTabId?: string;
    outcome: 'accepted' | 'rejected';
  }): void {
    const { agentTaskId, chatTabId = '', outcome } = params;
    finalizeStageClosure(agentTaskId, chatTabId, outcome);
  },

  /**
   * 每次 diff 状态变更后由 DiffActionService 调用。
   * 检查该 agentTaskId 下是否满足 stage_complete 或 invalidated 条件。
   *
   * 裁决规则（A-AG-M-T-05 §2.3）：
   * - 存在任何 pending → 不推进，直接返回
   * - 所有终态 + 至少一个 accepted → stage_complete
   * - 所有终态 + 全为 rejected/expired → forceInvalidate
   */
  checkAndAdvanceStage(
    agentTaskId: string | undefined,
    chatTabId: string,
    _filePath?: string,
  ): void {
    finalizeStageClosure(agentTaskId, chatTabId);
  },

  /**
   * 外部强制 invalidated（如 resetRuntimeAfterRestore、外部文件恢复等）。
   * reason 用于追踪触发原因。（A-AG-M-T-05 §2.4）
   */
  forceInvalidate(
    agentTaskId: string | undefined,
    chatTabId: string,
    reason: string,
  ): void {
    if (!agentTaskId || !chatTabId) return;
    markAgentInvalidated(chatTabId, agentTaskId, reason);
  },
};
