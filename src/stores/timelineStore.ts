import { create } from 'zustand';
import { timelineService } from '../services/timelineService';
import type { TimelineNode } from '../types/timeline';

interface TimelineState {
  nodes: TimelineNode[];
  isLoading: boolean;
  error: string | null;
  lastWorkspacePath: string | null;
  loadNodes: (workspacePath: string, limit?: number) => Promise<void>;
  clear: () => void;
}

export const useTimelineStore = create<TimelineState>((set) => ({
  nodes: [],
  isLoading: false,
  error: null,
  lastWorkspacePath: null,

  loadNodes: async (workspacePath, limit = 50) => {
    set({ isLoading: true, error: null, lastWorkspacePath: workspacePath });
    try {
      const nodes = await timelineService.listNodes(workspacePath, limit);
      set({ nodes, isLoading: false, error: null, lastWorkspacePath: workspacePath });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set({ isLoading: false, error: message });
    }
  },

  clear: () => set({ nodes: [], isLoading: false, error: null, lastWorkspacePath: null }),
}));
