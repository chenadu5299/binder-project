import React from 'react';
import { SparklesIcon, PlayIcon, CheckCircleIcon, ExclamationTriangleIcon, StopIcon } from '@heroicons/react/24/outline';
import type { ChatTab } from '../../stores/chatStore';
import { useChatBuildStore } from '../../stores/chatBuildStore';
import { chatBuildController } from '../../services/chatBuild/chatBuildController';
import { useFileStore } from '../../stores/fileStore';
import { documentService } from '../../services/documentService';

interface ChatBuildPanelProps {
  tab: ChatTab;
}

export const ChatBuildPanel: React.FC<ChatBuildPanelProps> = ({ tab }) => {
  const session = useChatBuildStore((state) => state.sessionsByTab[tab.id] ?? null);
  const ensureSession = useChatBuildStore((state) => state.ensureSession);
  const currentWorkspace = useFileStore((state) => state.currentWorkspace);

  React.useEffect(() => {
    ensureSession(tab.id);
  }, [ensureSession, tab.id]);

  if (tab.mode !== 'chat') {
    return null;
  }

  const current = session ?? {
    status: 'discussion' as const,
    outline: null,
    intent: null,
    execution: null,
    terminal: null,
    lastError: null,
  };

  const userMessageCount = tab.messages.filter((message) => message.role === 'user').length;
  const hasStreamingMessage = tab.messages.some((message) => message.isLoading);
  const resourcePaths = current.terminal?.resourcePaths ?? current.execution?.committedPaths ?? [];

  const statusTone = (status: string) => {
    if (status === 'completed') return 'text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800';
    if (status === 'running') return 'text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800';
    if (status === 'failed') return 'text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800';
    if (status === 'interrupted') return 'text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800';
    return 'text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-800/60 border-gray-200 dark:border-gray-700';
  };

  const handleOpenFirstResource = async () => {
    const targetPath = resourcePaths[0];
    if (!targetPath) return;
    await documentService.openFile(targetPath, { source: 'ai_generated' });
  };

  return (
    <div className="border-b border-gray-200 dark:border-gray-700 bg-blue-50/60 dark:bg-gray-900/40 px-4 py-3 flex-shrink-0">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-gray-900 dark:text-gray-100">Chat Build</div>
          <div className="text-xs text-gray-600 dark:text-gray-400">
            当前阶段：<span className="font-medium">{current.status}</span>
          </div>
        </div>
        {current.status === 'discussion' && (
          <button
            onClick={() => chatBuildController.requestIntent(tab.id)}
            disabled={userMessageCount === 0 || hasStreamingMessage}
            className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <SparklesIcon className="h-4 w-4" />
            开始构建
          </button>
        )}
      </div>

      {current.status === 'discussion' && (
        <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">
          {hasStreamingMessage
            ? '当前聊天仍在生成回复，等待完成后再触发构建。'
            : userMessageCount > 0
              ? '基于当前 chat 对话内容触发 Chat Build。'
              : '请先在 chat 中描述构建目标，再开始构建。'}
        </p>
      )}

      {current.status === 'intent_pending' && current.intent && (
        <div className="mt-3 rounded-md border border-blue-200 bg-white/80 px-3 py-3 dark:border-gray-700 dark:bg-gray-800/80">
          <div className="text-xs font-medium text-gray-700 dark:text-gray-300">构建意图</div>
          <p className="mt-1 text-sm text-gray-900 dark:text-gray-100">{current.intent.goal}</p>
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={() => void chatBuildController.startOutlineDrafting(tab.id)}
              className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
            >
              <PlayIcon className="h-4 w-4" />
              进入大纲生成
            </button>
            <button
              onClick={() => chatBuildController.returnToDiscussion(tab.id)}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              返回讨论
            </button>
          </div>
        </div>
      )}

      {current.status === 'outline_drafting' && (
        <div className="mt-3 rounded-md border border-blue-200 bg-white/80 px-3 py-3 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-800/80 dark:text-gray-200">
          正在生成 Build Outline...
        </div>
      )}

      {current.status === 'outline_pending_confirm' && current.outline && (
        <div className="mt-3 rounded-md border border-blue-200 bg-white/80 px-3 py-3 dark:border-gray-700 dark:bg-gray-800/80">
          <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{current.outline.title}</div>
          <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">{current.outline.summary}</p>
          <ol className="mt-3 space-y-2 text-xs text-gray-700 dark:text-gray-300">
            {current.outline.steps.map((step, index) => (
              <li key={step.id} className="rounded border border-gray-200 px-2 py-2 dark:border-gray-700">
                <div className="font-medium">{index + 1}. {step.name}</div>
                <div className="mt-1 text-gray-600 dark:text-gray-400">{step.summary}</div>
              </li>
            ))}
          </ol>
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={() => void chatBuildController.confirmOutline(tab.id)}
              disabled={!currentWorkspace}
              className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
            >
              <CheckCircleIcon className="h-4 w-4" />
              确认大纲并开始构建
            </button>
            <button
              onClick={() => void chatBuildController.startOutlineDrafting(tab.id)}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              重新生成
            </button>
          </div>
          {!currentWorkspace && (
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
              P1 正式构建需要已打开 workspace。
            </p>
          )}
        </div>
      )}

      {current.status === 'building' && current.execution && (
        <div className="mt-3 rounded-md border border-blue-200 bg-white/80 px-3 py-3 dark:border-gray-700 dark:bg-gray-800/80">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium text-gray-900 dark:text-gray-100">正式构建中</div>
              <div className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                当前可以继续普通聊天，但不会影响这次构建。若要停止当前运行，请使用“停止构建”。
              </div>
            </div>
            <button
              onClick={() => chatBuildController.requestInterrupt(tab.id)}
              className="inline-flex items-center gap-1 rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-500/40 dark:text-red-300 dark:hover:bg-red-900/20"
            >
              <StopIcon className="h-4 w-4" />
              停止构建
            </button>
          </div>
          <div className="mt-1 text-xs text-gray-600 dark:text-gray-400">
            第 {current.execution.currentStepIndex} / {current.execution.totalSteps} 步
            {current.execution.currentStepName ? `：${current.execution.currentStepName}` : ''}
          </div>
          {current.execution.buildRootPath && (
            <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              build root：{current.execution.buildRootPath}
            </div>
          )}
          {current.execution.interruptRequested && (
            <div className="mt-2 text-xs text-amber-700 dark:text-amber-300">
              已登记中断请求，将在安全点停止当前构建。
            </div>
          )}
          <ul className="mt-3 space-y-2 text-xs text-gray-700 dark:text-gray-300">
            {current.execution.steps.map((step, index) => {
              const isCurrent = step.status === 'running';
              return (
                <li
                  key={step.id}
                  className={`rounded border px-3 py-2 ${isCurrent ? 'border-blue-300 bg-blue-50/70 dark:border-blue-700 dark:bg-blue-950/30' : 'border-gray-200 dark:border-gray-700'}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-gray-900 dark:text-gray-100">
                        Step {index + 1}: {step.name}
                      </div>
                      <div className="mt-1 text-gray-600 dark:text-gray-400">{step.summary}</div>
                      {step.outputPath ? (
                        <div className="mt-1 break-all text-gray-500 dark:text-gray-400">
                          输出路径：{step.outputPath}
                        </div>
                      ) : null}
                    </div>
                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusTone(step.status)}`}>
                      {step.status}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
          {resourcePaths.length > 0 && (
            <div className="mt-3 text-xs text-gray-500 dark:text-gray-400">
              已生成文件：{resourcePaths.length} 个
            </div>
          )}
        </div>
      )}

      {(current.status === 'completed' || current.status === 'failed' || current.status === 'interrupted') && current.terminal && (
        <div className="mt-3 rounded-md border border-gray-200 bg-white/80 px-3 py-3 dark:border-gray-700 dark:bg-gray-800/80">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-gray-100">
            {current.status === 'completed' ? (
              <CheckCircleIcon className="h-5 w-5 text-green-600" />
            ) : current.status === 'interrupted' ? (
              <StopIcon className="h-5 w-5 text-amber-600" />
            ) : (
              <ExclamationTriangleIcon className="h-5 w-5 text-red-600" />
            )}
            {current.status === 'completed' ? '构建完成' : current.status === 'interrupted' ? '构建已中断' : '构建失败'}
          </div>
          <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">{current.terminal.summary}</p>
          {current.status === 'completed' && (
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              本轮已生成新的项目资源集合。若要继续推进，需要重新进入下一轮构建。
            </p>
          )}
          {current.status === 'failed' && (
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              当前运行已停止，系统不会自动重试。你可以重新构建，或返回讨论后再决定下一步。
            </p>
          )}
          {current.status === 'interrupted' && (
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              构建已被停止。已保留已完成输出，但这不代表当前构建目标已被成功改写。
            </p>
          )}
          {current.terminal.buildRootPath && (
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              build root：{current.terminal.buildRootPath}
            </p>
          )}
          {resourcePaths.length > 0 ? (
            <div className="mt-2 space-y-1 text-xs text-gray-500 dark:text-gray-400">
              {resourcePaths.map((path) => (
                <div key={path} className="break-all">输出文件：{path}</div>
              ))}
            </div>
          ) : null}
          {current.terminal.partial ? (
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">当前结果为 partial build，已保留已完成输出。</p>
          ) : null}
          {current.lastError && (
            <p className="mt-2 text-xs text-red-600 dark:text-red-400">{current.lastError}</p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              onClick={() => void handleOpenFirstResource()}
              disabled={resourcePaths.length === 0}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              查看文件
            </button>
            {current.status === 'completed' ? (
              <button
                onClick={() => chatBuildController.prepareNextBuild(tab.id, 'continue')}
                className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
              >
                基于结果继续构建
              </button>
            ) : (
              <button
                onClick={() => void chatBuildController.restartBuild(tab.id)}
                className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
              >
                重新构建
              </button>
            )}
            <button
              onClick={() => chatBuildController.returnToDiscussion(tab.id)}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              返回讨论
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
