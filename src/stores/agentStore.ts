import { create } from 'zustand';
import type {
  AgentArtifactRecord,
  AgentConfirmationRecord,
  AgentRuntimeRecord,
  AgentStageState,
  AgentTaskRecord,
  AgentVerificationRecord,
} from '../types/agent';
import type { WorkflowExecutionRuntime } from '../types/template';

type AgentChatModeBoundary = 'agent' | 'chat';

function createEmptyStageState(): AgentStageState {
  return {
    taskId: null,
    stage: 'draft',
    updatedAt: Date.now(),
  };
}

const MAX_RECENT_TASKS = 5;

function createRuntime(chatTabId: string, chatModeBoundary: AgentChatModeBoundary): AgentRuntimeRecord {
  return {
    chatTabId,
    runtimeMode: 'shadow',
    chatModeBoundary,
    currentTask: null,
    recentTasks: [],
    stageState: createEmptyStageState(),
    verification: null,
    confirmation: null,
    artifacts: [],
    workflowExecution: null,
  };
}

interface AgentState {
  /**
   * Phase 1 仅作为 L3 Agent 运行态的正式承接位预留。
   * 当前不替代 chatStore/diffStore 的展示职责，也不接管主执行闭环。
   */
  runtimesByTab: Record<string, AgentRuntimeRecord>;
  ensureRuntimeForTab: (chatTabId: string, chatModeBoundary: AgentChatModeBoundary) => void;
  dropRuntimeForTab: (chatTabId: string) => void;
  setChatModeBoundary: (chatTabId: string, chatModeBoundary: AgentChatModeBoundary) => void;
  setCurrentTask: (chatTabId: string, task: AgentTaskRecord | null) => void;
  setStageState: (chatTabId: string, stageState: AgentStageState) => void;
  setVerification: (chatTabId: string, verification: AgentVerificationRecord | null) => void;
  setConfirmation: (chatTabId: string, confirmation: AgentConfirmationRecord | null) => void;
  upsertArtifact: (chatTabId: string, artifact: AgentArtifactRecord) => void;
  clearArtifacts: (chatTabId: string) => void;
  setWorkflowExecution: (chatTabId: string, workflowExecution: WorkflowExecutionRuntime | null) => void;
  /** Phase 8: 从 workspace.db 恢复指定 chat tab 的活跃任务 */
  loadTasksFromDb: (chatTabId: string) => Promise<void>;
}

export const useAgentStore = create<AgentState>((set, get) => ({
  runtimesByTab: {},

  ensureRuntimeForTab: (chatTabId, chatModeBoundary) => {
    const existing = get().runtimesByTab[chatTabId];
    if (existing) {
      if (existing.chatModeBoundary !== chatModeBoundary) {
        get().setChatModeBoundary(chatTabId, chatModeBoundary);
      }
      return;
    }

    set((state) => ({
      runtimesByTab: {
        ...state.runtimesByTab,
        [chatTabId]: createRuntime(chatTabId, chatModeBoundary),
      },
    }));
  },

  dropRuntimeForTab: (chatTabId) => {
    set((state) => {
      const next = { ...state.runtimesByTab };
      delete next[chatTabId];
      return { runtimesByTab: next };
    });
  },

  setChatModeBoundary: (chatTabId, chatModeBoundary) => {
    set((state) => {
      const runtime = state.runtimesByTab[chatTabId] ?? createRuntime(chatTabId, chatModeBoundary);
      return {
        runtimesByTab: {
          ...state.runtimesByTab,
          [chatTabId]: {
            ...runtime,
            chatModeBoundary,
          },
        },
      };
    });
  },

  setCurrentTask: (chatTabId, task) => {
    set((state) => {
      const runtime = state.runtimesByTab[chatTabId] ?? createRuntime(chatTabId, 'agent');
      let nextRecentTasks = runtime.recentTasks;
      if (task && runtime.currentTask && runtime.currentTask.id !== task.id) {
        nextRecentTasks = [runtime.currentTask, ...runtime.recentTasks].slice(0, MAX_RECENT_TASKS);
      }
      return {
        runtimesByTab: {
          ...state.runtimesByTab,
          [chatTabId]: {
            ...runtime,
            currentTask: task,
            recentTasks: nextRecentTasks,
            workflowExecution:
              task && runtime.workflowExecution?.context.taskId === task.id
                ? runtime.workflowExecution
                : null,
          },
        },
      };
    });
  },

  setStageState: (chatTabId, stageState) => {
    set((state) => {
      const runtime = state.runtimesByTab[chatTabId] ?? createRuntime(chatTabId, 'agent');
      return {
        runtimesByTab: {
          ...state.runtimesByTab,
          [chatTabId]: {
            ...runtime,
            stageState,
          },
        },
      };
    });
  },

  setVerification: (chatTabId, verification) => {
    set((state) => {
      const runtime = state.runtimesByTab[chatTabId] ?? createRuntime(chatTabId, 'agent');
      return {
        runtimesByTab: {
          ...state.runtimesByTab,
          [chatTabId]: {
            ...runtime,
            verification,
          },
        },
      };
    });
  },

  setConfirmation: (chatTabId, confirmation) => {
    set((state) => {
      const runtime = state.runtimesByTab[chatTabId] ?? createRuntime(chatTabId, 'agent');
      return {
        runtimesByTab: {
          ...state.runtimesByTab,
          [chatTabId]: {
            ...runtime,
            confirmation,
          },
        },
      };
    });
  },

  upsertArtifact: (chatTabId, artifact) => {
    set((state) => {
      const runtime = state.runtimesByTab[chatTabId] ?? createRuntime(chatTabId, 'agent');
      const artifacts = runtime.artifacts.some((item) => item.id === artifact.id)
        ? runtime.artifacts.map((item) => (item.id === artifact.id ? artifact : item))
        : [...runtime.artifacts, artifact];

      return {
        runtimesByTab: {
          ...state.runtimesByTab,
          [chatTabId]: {
            ...runtime,
            artifacts,
          },
        },
      };
    });
  },

  clearArtifacts: (chatTabId) => {
    set((state) => {
      const runtime = state.runtimesByTab[chatTabId];
      if (!runtime) {
        return state;
      }
      return {
        runtimesByTab: {
          ...state.runtimesByTab,
          [chatTabId]: {
            ...runtime,
            artifacts: [],
          },
        },
      };
    });
  },

  setWorkflowExecution: (chatTabId, workflowExecution) => {
    set((state) => {
      const runtime = state.runtimesByTab[chatTabId] ?? createRuntime(chatTabId, 'agent');
      return {
        runtimesByTab: {
          ...state.runtimesByTab,
          [chatTabId]: {
            ...runtime,
            runtimeMode: workflowExecution ? 'active' : runtime.runtimeMode,
            workflowExecution,
          },
        },
      };
    });
  },

  loadTasksFromDb: async (chatTabId) => {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const { useFileStore } = await import('./fileStore');
      const workspacePath = useFileStore.getState().currentWorkspace;
      if (!workspacePath) return;

      const tasks = await invoke<Array<{
        id: string;
        chat_tab_id: string;
        goal: string;
        lifecycle: string;
        stage: string;
        stage_reason: string | null;
        created_at: number;
        updated_at: number;
      }>>('get_agent_tasks_for_chat_tab', {
        workspacePath,
        chatTabId,
      });

      if (!tasks || tasks.length === 0) return;

      const activeTask = tasks.find((t) => t.lifecycle === 'active');
      if (!activeTask) return;

      const restoredTask: AgentTaskRecord = {
        id: activeTask.id,
        chatTabId: activeTask.chat_tab_id,
        goal: activeTask.goal,
        lifecycle: activeTask.lifecycle as AgentTaskRecord['lifecycle'],
        createdAt: activeTask.created_at,
        updatedAt: activeTask.updated_at,
      };

      get().ensureRuntimeForTab(chatTabId, 'agent');
      get().setCurrentTask(chatTabId, restoredTask);
      if (activeTask.stage) {
        get().setStageState(chatTabId, {
          taskId: activeTask.id,
          stage: activeTask.stage as AgentStageState['stage'],
          updatedAt: activeTask.updated_at,
          stageReason: activeTask.stage_reason ?? undefined,
        });
      }

      try {
        const { templateService } = await import('../services/templateService');
        const workflowExecution = await templateService.getWorkflowExecutionRuntime(
          workspacePath,
          activeTask.id,
        );
        get().setWorkflowExecution(chatTabId, workflowExecution);
      } catch {
        // 当前任务未绑定模板时忽略
      }
    } catch {
      // workspace.db 不可用时静默忽略
    }
  },
}));
