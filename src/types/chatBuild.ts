export type ChatBuildStatus =
  | 'discussion'
  | 'intent_pending'
  | 'outline_drafting'
  | 'outline_pending_confirm'
  | 'building'
  | 'completed'
  | 'failed'
  | 'interrupted';

export interface BuildIntent {
  id: string;
  tabId: string;
  sourceMessageIds: string[];
  goal: string;
  discussionContext: string;
  createdAt: number;
}

export interface BuildOutlineStep {
  id: string;
  name: string;
  summary: string;
}

export interface BuildOutlineDraft {
  title: string;
  goal: string;
  summary: string;
  steps: BuildOutlineStep[];
  createdAt: number;
}

export interface OutlineConfirmationResult {
  confirmed: boolean;
  confirmedAt: number;
}

export interface BuildExecutionStepSnapshot {
  id: string;
  name: string;
  summary: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'interrupted';
  outputPath?: string | null;
  startedAt?: number | null;
  finishedAt?: number | null;
}

export interface BuildExecutionState {
  runId: string;
  startedAt: number;
  isDryRun: boolean;
  currentStepIndex: number;
  totalSteps: number;
  currentStepName: string | null;
  buildRootPath: string | null;
  metaPath: string | null;
  stepsPath: string | null;
  committedPaths: string[];
  interruptRequested: boolean;
  steps: BuildExecutionStepSnapshot[];
}

export interface BuildTerminalSummary {
  kind: 'completed' | 'failed' | 'interrupted';
  title: string;
  summary: string;
  finishedAt: number;
  buildRootPath?: string | null;
  metaPath?: string | null;
  stepsPath?: string | null;
  partial?: boolean;
  resourcePaths?: string[];
}

export interface ChatBuildSessionState {
  tabId: string;
  status: ChatBuildStatus;
  intent: BuildIntent | null;
  outline: BuildOutlineDraft | null;
  outlineConfirmation: OutlineConfirmationResult | null;
  execution: BuildExecutionState | null;
  terminal: BuildTerminalSummary | null;
  lastError: string | null;
  updatedAt: number;
}
