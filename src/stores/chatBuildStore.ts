import { create } from 'zustand';
import type {
  BuildExecutionState,
  BuildIntent,
  BuildOutlineDraft,
  BuildTerminalSummary,
  ChatBuildSessionState,
  ChatBuildStatus,
  OutlineConfirmationResult,
} from '../types/chatBuild';

function createSession(tabId: string): ChatBuildSessionState {
  return {
    tabId,
    status: 'discussion',
    intent: null,
    outline: null,
    outlineConfirmation: null,
    execution: null,
    terminal: null,
    lastError: null,
    updatedAt: Date.now(),
  };
}

interface ChatBuildState {
  sessionsByTab: Record<string, ChatBuildSessionState>;
  ensureSession: (tabId: string) => void;
  dropSession: (tabId: string) => void;
  getSession: (tabId: string | null | undefined) => ChatBuildSessionState | null;
  resetToDiscussion: (tabId: string) => void;
  setStatus: (tabId: string, status: ChatBuildStatus) => void;
  setIntent: (tabId: string, intent: BuildIntent | null) => void;
  setOutline: (tabId: string, outline: BuildOutlineDraft | null) => void;
  setOutlineConfirmation: (tabId: string, result: OutlineConfirmationResult | null) => void;
  setExecution: (tabId: string, execution: BuildExecutionState | null) => void;
  patchExecution: (tabId: string, updater: (current: BuildExecutionState | null) => BuildExecutionState | null) => void;
  setTerminal: (tabId: string, terminal: BuildTerminalSummary | null) => void;
  setLastError: (tabId: string, error: string | null) => void;
}

export const useChatBuildStore = create<ChatBuildState>((set, get) => ({
  sessionsByTab: {},

  ensureSession: (tabId) => {
    if (!tabId || get().sessionsByTab[tabId]) return;
    set((state) => ({
      sessionsByTab: {
        ...state.sessionsByTab,
        [tabId]: createSession(tabId),
      },
    }));
  },

  dropSession: (tabId) => {
    set((state) => {
      const next = { ...state.sessionsByTab };
      delete next[tabId];
      return { sessionsByTab: next };
    });
  },

  getSession: (tabId) => {
    if (!tabId) return null;
    return get().sessionsByTab[tabId] ?? null;
  },

  resetToDiscussion: (tabId) => {
    set((state) => ({
      sessionsByTab: {
        ...state.sessionsByTab,
        [tabId]: createSession(tabId),
      },
    }));
  },

  setStatus: (tabId, status) => {
    const current = get().sessionsByTab[tabId] ?? createSession(tabId);
    set((state) => ({
      sessionsByTab: {
        ...state.sessionsByTab,
        [tabId]: {
          ...current,
          status,
          updatedAt: Date.now(),
        },
      },
    }));
  },

  setIntent: (tabId, intent) => {
    const current = get().sessionsByTab[tabId] ?? createSession(tabId);
    set((state) => ({
      sessionsByTab: {
        ...state.sessionsByTab,
        [tabId]: {
          ...current,
          intent,
          updatedAt: Date.now(),
        },
      },
    }));
  },

  setOutline: (tabId, outline) => {
    const current = get().sessionsByTab[tabId] ?? createSession(tabId);
    set((state) => ({
      sessionsByTab: {
        ...state.sessionsByTab,
        [tabId]: {
          ...current,
          outline,
          updatedAt: Date.now(),
        },
      },
    }));
  },

  setOutlineConfirmation: (tabId, result) => {
    const current = get().sessionsByTab[tabId] ?? createSession(tabId);
    set((state) => ({
      sessionsByTab: {
        ...state.sessionsByTab,
        [tabId]: {
          ...current,
          outlineConfirmation: result,
          updatedAt: Date.now(),
        },
      },
    }));
  },

  setExecution: (tabId, execution) => {
    const current = get().sessionsByTab[tabId] ?? createSession(tabId);
    set((state) => ({
      sessionsByTab: {
        ...state.sessionsByTab,
        [tabId]: {
          ...current,
          execution,
          updatedAt: Date.now(),
        },
      },
    }));
  },

  patchExecution: (tabId, updater) => {
    const current = get().sessionsByTab[tabId] ?? createSession(tabId);
    set((state) => ({
      sessionsByTab: {
        ...state.sessionsByTab,
        [tabId]: {
          ...current,
          execution: updater(current.execution),
          updatedAt: Date.now(),
        },
      },
    }));
  },

  setTerminal: (tabId, terminal) => {
    const current = get().sessionsByTab[tabId] ?? createSession(tabId);
    set((state) => ({
      sessionsByTab: {
        ...state.sessionsByTab,
        [tabId]: {
          ...current,
          terminal,
          updatedAt: Date.now(),
        },
      },
    }));
  },

  setLastError: (tabId, error) => {
    const current = get().sessionsByTab[tabId] ?? createSession(tabId);
    set((state) => ({
      sessionsByTab: {
        ...state.sessionsByTab,
        [tabId]: {
          ...current,
          lastError: error,
          updatedAt: Date.now(),
        },
      },
    }));
  },
}));
