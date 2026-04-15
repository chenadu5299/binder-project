/**
 * DiffRetryController — execute_failed 事件的唯一合法消费方。
 *
 * 设计来源：A-DE-M-T-01 §6.5/§6.6
 * 受约束于：A-CORE-C-D-05_状态单一真源原则.md
 *
 * 职责：
 * 1. 消费 DiffExecuteFailedEvent（由 DiffActionService 在 apply 失败时产生）。
 * 2. 可重试 + 未耗尽 → 加入重试队列，写 executionExposure 到 diffStore，不推进 expired。
 * 3. 不可重试 / 重试耗尽 → expired + markVerificationFailed + checkAndAdvanceStage。
 * 4. 提供 retryDiff（手动触发）、isInRetry（UI 查询）接口。
 *
 * 不做的事：
 * - 不直接操作 agentStore。
 * - 不消费 diff 以外的事件。
 * - 不持久化（session-only 内存队列）。
 */

import type { Editor } from '@tiptap/react';
import {
  useDiffStore,
  RETRYABLE_EXECUTION_CODES,
  type DiffExecuteFailedEvent,
  type DiffExpireReason,
  type ExecutionExposure,
} from '../stores/diffStore';
import { markVerificationFailed } from '../utils/agentShadowLifecycle';
import { AgentTaskController } from './AgentTaskController';

const MAX_RETRY = 2;

interface RetryQueueEntry {
  event: DiffExecuteFailedEvent;
  filePath: string;
}

/** 重试队列：Map<diffId, RetryQueueEntry>，内存 session-only */
const retryQueue = new Map<string, RetryQueueEntry>();

function buildExecutionExposure(
  event: DiffExecuteFailedEvent,
  filePath: string,
): ExecutionExposure {
  return {
    exposureId: `exp-retry-${event.timestamp}-${event.diffId}`,
    level: 'warn',
    phase: 'apply',
    code: event.code,
    message: `apply failed (retryable=${event.retryable}, attempt=${event.retryCount + 1})`,
    targetFile: filePath,
    diffId: event.diffId,
    routeSource: event.route_source,
    timestamp: event.timestamp,
  };
}

export const DiffRetryController = {
  /**
   * 消费 execute_failed 事件（A-DE-M-T-01 §6.5）。
   * 由 DiffActionService.acceptDiff 在 applyDiffReplaceInEditor 失败时调用。
   */
  handleFailedEvent(
    event: DiffExecuteFailedEvent,
    filePath: string,
    expireReason: DiffExpireReason,
  ): void {
    // 若 diff 已在重试队列中（来自 retryDiff 的再次失败），使用队列中已递增的计数
    // 防止 DiffActionService 每次都以 retryCount=0 重置计数导致无限重试
    const existingQueued = retryQueue.get(event.diffId);
    const effectiveRetryCount = existingQueued
      ? existingQueued.event.retryCount
      : event.retryCount;
    const effectiveEvent: DiffExecuteFailedEvent = { ...event, retryCount: effectiveRetryCount };

    const canRetry =
      effectiveEvent.retryable &&
      RETRYABLE_EXECUTION_CODES.has(effectiveEvent.code) &&
      effectiveEvent.retryCount < MAX_RETRY;

    if (canRetry) {
      // 入队：diff 保持 pending，写 executionExposure 供 DiffCard 展示重试 UI
      retryQueue.set(effectiveEvent.diffId, { event: effectiveEvent, filePath });
      const exposure = buildExecutionExposure(effectiveEvent, filePath);
      useDiffStore.getState().updateDiff(filePath, effectiveEvent.diffId, {
        executionExposure: exposure,
      });
      useDiffStore.getState().recordExecutionExposures([exposure]);
    } else {
      // 耗尽或不可重试：推进 expired
      retryQueue.delete(effectiveEvent.diffId);
      const exposure = buildExecutionExposure(effectiveEvent, filePath);
      useDiffStore.getState().updateDiff(filePath, effectiveEvent.diffId, {
        status: 'expired',
        expireReason,
        executionExposure: exposure,
      });
      useDiffStore.getState().recordExecutionExposures([exposure]);
      markVerificationFailed(
        effectiveEvent.chatTabId ?? '',
        effectiveEvent.agentTaskId,
        `retry_exhausted_${effectiveEvent.code}`,
      );
      AgentTaskController.checkAndAdvanceStage(
        effectiveEvent.agentTaskId,
        effectiveEvent.chatTabId ?? '',
        filePath,
      );
    }
  },

  /**
   * 手动触发单条 diff 重试（DiffCard 重试按钮调用，A-DE-M-T-01 §6.6.4）。
   */
  async retryDiff(
    diffId: string,
    editor: Editor,
    options: {
      tabDocumentRevision: number;
      chatTabId?: string;
      agentTaskId?: string;
    },
  ): Promise<void> {
    const queued = retryQueue.get(diffId);
    if (!queued) return;

    // 递增重试次数后再调 acceptDiff，失败时会再次进入 handleFailedEvent
    const updatedEvent: DiffExecuteFailedEvent = {
      ...queued.event,
      retryCount: queued.event.retryCount + 1,
      timestamp: Date.now(),
    };
    retryQueue.set(diffId, { event: updatedEvent, filePath: queued.filePath });

    // 动态 import 避免循环依赖（DiffActionService → DiffRetryController → DiffActionService）
    const { DiffActionService } = await import('./DiffActionService');
    await DiffActionService.acceptDiff(queued.filePath, diffId, editor, {
      tabDocumentRevision: options.tabDocumentRevision,
      chatTabId: options.chatTabId,
      agentTaskId: options.agentTaskId,
    });
  },

  /** 查询 diff 是否在重试队列中（DiffCard 据此决定是否展示重试 UI） */
  isInRetry(diffId: string): boolean {
    return retryQueue.has(diffId);
  },

  /** 重试成功后由 DiffActionService 调用，从队列移除 */
  _remove(diffId: string): void {
    retryQueue.delete(diffId);
  },
};
