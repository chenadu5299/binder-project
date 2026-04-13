import { toast } from '../../components/Common/Toast';
import { useChatStore } from '../../stores/chatStore';
import { useChatBuildStore } from '../../stores/chatBuildStore';
import { useFileStore } from '../../stores/fileStore';
import type {
  BuildIntent,
  OutlineConfirmationResult,
} from '../../types/chatBuild';
import { outlineGenerator } from './outlineGenerator';
import { buildRunner } from './buildRunner';
import { buildInterruptSignal } from './buildInterruptSignal';
import { fileService } from '../fileService';

function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildDiscussionContext(tabId: string): { sourceMessageIds: string[]; goal: string; discussionContext: string } {
  const tab = useChatStore.getState().tabs.find((item) => item.id === tabId);
  if (!tab) {
    throw new Error('未找到当前对话');
  }

  const eligibleMessages = tab.messages
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .slice(-8);

  const userMessages = eligibleMessages.filter((message) => message.role === 'user');
  const latestUser = [...userMessages].reverse().find((message) => message.content.trim().length > 0);

  if (!latestUser) {
    throw new Error('请先在 chat 中描述你的构建目标');
  }

  const discussionContext = eligibleMessages
    .map((message) => `${message.role === 'user' ? '用户' : '助手'}: ${message.content.trim()}`)
    .join('\n');

  return {
    sourceMessageIds: userMessages.map((message) => message.id),
    goal: latestUser.content.trim(),
    discussionContext,
  };
}

export const chatBuildController = {
  requestIntent(tabId: string) {
    const buildStore = useChatBuildStore.getState();
    buildStore.ensureSession(tabId);

    const session = buildStore.getSession(tabId);
    if (session?.status === 'building') {
      toast.info('构建执行中，当前不能重新发起构建');
      return;
    }

    const { sourceMessageIds, goal, discussionContext } = buildDiscussionContext(tabId);
    const intent: BuildIntent = {
      id: generateId('build-intent'),
      tabId,
      sourceMessageIds,
      goal,
      discussionContext,
      createdAt: Date.now(),
    };

    buildStore.setIntent(tabId, intent);
    buildStore.setOutline(tabId, null);
    buildStore.setOutlineConfirmation(tabId, null);
    buildStore.setExecution(tabId, null);
    buildStore.setTerminal(tabId, null);
    buildStore.setLastError(tabId, null);
    buildStore.setStatus(tabId, 'intent_pending');
  },

  async startOutlineDrafting(tabId: string) {
    const buildStore = useChatBuildStore.getState();
    const chatStore = useChatStore.getState();
    buildStore.ensureSession(tabId);

    const session = buildStore.getSession(tabId);
    if (!session?.intent) {
      toast.warning('请先发起构建意图');
      return;
    }

    if (
      session.status !== 'intent_pending'
      && session.status !== 'outline_pending_confirm'
      && session.status !== 'failed'
      && session.status !== 'interrupted'
    ) {
      toast.warning('当前阶段不能生成大纲');
      return;
    }

    const tab = chatStore.tabs.find((item) => item.id === tabId);
    if (!tab) {
      toast.error('未找到当前对话');
      return;
    }

    buildStore.setLastError(tabId, null);
    buildStore.setTerminal(tabId, null);
    buildStore.setStatus(tabId, 'outline_drafting');

    try {
      const outline = await outlineGenerator.generate(session.intent, tab.model);
      buildStore.setOutline(tabId, outline);
      buildStore.setOutlineConfirmation(tabId, null);
      buildStore.setStatus(tabId, 'outline_pending_confirm');
    } catch (error) {
      const message = error instanceof Error ? error.message : '大纲生成失败';
      buildStore.setStatus(tabId, 'failed');
      buildStore.setLastError(tabId, message);
      buildStore.setTerminal(tabId, {
        kind: 'failed',
        title: session.intent.goal,
        summary: message,
        finishedAt: Date.now(),
      });
      toast.error(message);
    }
  },

  async confirmOutline(tabId: string) {
    const buildStore = useChatBuildStore.getState();
    const workspacePath = useFileStore.getState().currentWorkspace;
    const session = buildStore.getSession(tabId);
    if (!session?.outline || session.status !== 'outline_pending_confirm') {
      toast.warning('当前没有待确认的大纲');
      return;
    }
    if (!workspacePath) {
      const message = 'P1 正式构建需要在已打开的 workspace 中运行';
      buildStore.setStatus(tabId, 'failed');
      buildStore.setLastError(tabId, message);
      buildStore.setTerminal(tabId, {
        kind: 'failed',
        title: session.outline.title,
        summary: message,
        finishedAt: Date.now(),
      });
      toast.error(message);
      return;
    }

    const confirmation: OutlineConfirmationResult = {
      confirmed: true,
      confirmedAt: Date.now(),
    };

    buildStore.setOutlineConfirmation(tabId, confirmation);
    buildStore.setStatus(tabId, 'building');
    const execution = buildRunner.createInitialExecution(session.outline);
    buildStore.setExecution(tabId, execution);
    buildStore.setLastError(tabId, null);
    buildStore.setTerminal(tabId, null);
    buildInterruptSignal.attach(tabId, execution.runId);

    try {
      const result = await buildRunner.run(tabId, workspacePath, session.outline);
      buildStore.setStatus(tabId, result.kind);
      buildStore.setTerminal(tabId, result);
      const tree = await fileService.buildFileTree(workspacePath, 5);
      useFileStore.getState().setFileTree(tree);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'dry-run 构建失败';
      buildStore.setStatus(tabId, 'failed');
      buildStore.setLastError(tabId, message);
      buildStore.setTerminal(tabId, {
        kind: 'failed',
        title: session.outline.title,
        summary: message,
        finishedAt: Date.now(),
      });
      toast.error(message);
    }
  },

  requestInterrupt(tabId: string) {
    const buildStore = useChatBuildStore.getState();
    const session = buildStore.getSession(tabId);
    if (!session?.execution || session.status !== 'building') {
      toast.info('当前没有可中断的构建运行');
      return;
    }

    const accepted = buildInterruptSignal.request(tabId, session.execution.runId);
    if (!accepted) {
      toast.warning('中断请求未命中当前运行');
      return;
    }

    buildStore.patchExecution(tabId, (current) => {
      if (!current) return current;
      return {
        ...current,
        interruptRequested: true,
      };
    });
    toast.info('已登记中断请求，将在安全点停止当前构建');
  },

  prepareNextBuild(tabId: string, mode: 'continue' | 'restart') {
    const buildStore = useChatBuildStore.getState();
    const session = buildStore.getSession(tabId);
    if (!session) {
      toast.warning('未找到当前构建会话');
      return;
    }
    if (session.status === 'building') {
      toast.info('当前构建仍在运行，请先等待结束或手动中断');
      return;
    }

    const previousIntent = session.intent;
    const baseGoal = previousIntent?.goal || session.outline?.goal || session.terminal?.title || '继续构建';
    const previousSummary = session.terminal?.summary ?? '';
    const previousOutputs = session.terminal?.resourcePaths ?? [];

    const nextIntent: BuildIntent = {
      id: generateId('build-intent'),
      tabId,
      sourceMessageIds: previousIntent?.sourceMessageIds ?? [],
      goal: mode === 'continue' ? `${baseGoal}（基于上一轮结果继续）` : baseGoal,
      discussionContext: [
        previousIntent?.discussionContext ?? '',
        previousSummary ? `上一轮结果：${previousSummary}` : '',
        previousOutputs.length > 0 ? `已生成资源：${previousOutputs.join(', ')}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
      createdAt: Date.now(),
    };

    buildStore.setIntent(tabId, nextIntent);
    buildStore.setOutline(tabId, null);
    buildStore.setOutlineConfirmation(tabId, null);
    buildStore.setExecution(tabId, null);
    buildStore.setTerminal(tabId, null);
    buildStore.setLastError(tabId, null);
    buildStore.setStatus(tabId, 'intent_pending');
  },

  async restartBuild(tabId: string) {
    this.prepareNextBuild(tabId, 'restart');
    await this.startOutlineDrafting(tabId);
  },

  returnToDiscussion(tabId: string) {
    useChatBuildStore.getState().resetToDiscussion(tabId);
  },
};
