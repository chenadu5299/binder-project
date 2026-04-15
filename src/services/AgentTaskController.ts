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
  createShadowStageState,
  markShadowTaskLifecycle,
} from '../types/agent_state';
import { markAgentInvalidated } from '../utils/agentShadowLifecycle';

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

export const AgentTaskController = {
  /**
   * byFilePath file diff 完成 resolve 后的专用通知入口。
   *
   * 调用时机：DiffActionService.acceptFileDiffs / rejectFileDiffs 完成后。
   * 此时 byFilePath 条目已按队列语义删除，outcome 由调用方显式传入。
   *
   * 裁决逻辑：
   * 1. byTab 仍有 pending → 等 byTab 路径自行推进，此处返回
   * 2. byTab 无 pending → 结合 byTab 现有状态 + outcome 做最终裁决
   *    - hasAnyAccepted（byTab accepted 或 outcome=accepted）→ stage_complete
   *    - 否则 → forceInvalidate，reason 由 byTab 终态分布决定
   */
  handleFileDiffResolution(params: {
    agentTaskId: string | undefined;
    chatTabId?: string;
    outcome: 'accepted' | 'rejected';
  }): void {
    const { agentTaskId, chatTabId = '', outcome } = params;
    if (!agentTaskId || !chatTabId) return;

    const allDiffs = getAllDiffsForAgentTask(agentTaskId);

    // byTab 还有 pending → 等 byTab 路径（checkAndAdvanceStage）自行推进
    const hasPending = allDiffs.some((d) => d.status === 'pending');
    if (hasPending) return;

    // 结合 byTab 状态 + 本次 file diff outcome 做最终裁决
    const hasTabAccepted = allDiffs.some((d) => d.status === 'accepted');
    const hasAnyAccepted = hasTabAccepted || outcome === 'accepted';

    if (hasAnyAccepted) {
      const store = useAgentStore.getState();
      const runtime = store.runtimesByTab[chatTabId];
      const task =
        runtime?.currentTask?.id === agentTaskId ? runtime.currentTask : null;
      if (!task) return;

      store.setConfirmation(
        chatTabId,
        createConfirmedConfirmationRecord(agentTaskId, 'all_diffs_resolved'),
      );
      const completedTask = markShadowTaskLifecycle(task, 'completed');
      store.setCurrentTask(chatTabId, completedTask);
      store.setStageState(
        chatTabId,
        createShadowStageState(agentTaskId, 'stage_complete', 'at_least_one_accepted'),
      );
    } else {
      // 全为 rejected/expired（byTab）且 file diff 也是 rejected
      const rejectedCount = allDiffs.filter((d) => d.status === 'rejected').length;
      const expiredCount = allDiffs.filter((d) => d.status === 'expired').length;
      const stageReason =
        allDiffs.length === 0
          ? 'user_rejected_all' // 仅有 file diffs 且全部 rejected
          : expiredCount === 0
            ? 'user_rejected_all'
            : rejectedCount === 0
              ? 'system_invalidated'
              : 'mixed_outcome';
      AgentTaskController.forceInvalidate(agentTaskId, chatTabId, stageReason);
    }
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
    if (!agentTaskId || !chatTabId) return;

    const allDiffs = getAllDiffsForAgentTask(agentTaskId);
    const filePathPending = hasFileDiffsForAgentTask(agentTaskId);

    if (allDiffs.length === 0 && !filePathPending) return;

    const hasPending = filePathPending || allDiffs.some((d) => d.status === 'pending');
    if (hasPending) return;

    const hasAccepted = allDiffs.some((d) => d.status === 'accepted');

    if (hasAccepted) {
      // Case A: 至少一个 accepted → stage_complete
      const store = useAgentStore.getState();
      const runtime = store.runtimesByTab[chatTabId];
      const task =
        runtime?.currentTask?.id === agentTaskId ? runtime.currentTask : null;
      if (!task) return;

      // user_confirmed 先于 stage_complete 写入（A-AG-M-T-05 §6.1 说明）
      store.setConfirmation(
        chatTabId,
        createConfirmedConfirmationRecord(agentTaskId, 'all_diffs_resolved'),
      );
      const completedTask = markShadowTaskLifecycle(task, 'completed');
      store.setCurrentTask(chatTabId, completedTask);
      store.setStageState(
        chatTabId,
        createShadowStageState(agentTaskId, 'stage_complete', 'at_least_one_accepted'),
      );
    } else {
      // Case B: 全部 rejected/expired → invalidated
      // stageReason 区分：user_rejected_all / system_invalidated / mixed_outcome
      const terminalDiffs = allDiffs.filter(
        (d) => d.status === 'rejected' || d.status === 'expired',
      );
      const rejectedCount = terminalDiffs.filter((d) => d.status === 'rejected').length;
      const expiredCount = terminalDiffs.filter((d) => d.status === 'expired').length;
      const stageReason =
        expiredCount === 0
          ? 'user_rejected_all'
          : rejectedCount === 0
            ? 'system_invalidated'
            : 'mixed_outcome';

      AgentTaskController.forceInvalidate(agentTaskId, chatTabId, stageReason);
    }
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
