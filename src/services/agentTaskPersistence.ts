import { invoke } from '@tauri-apps/api/core';
import { useFileStore } from '../stores/fileStore';

function getWorkspacePath(): string | null {
  return useFileStore.getState().currentWorkspace || null;
}

export async function persistAgentTask(
  id: string,
  chatTabId: string,
  goal: string,
  lifecycle: string,
  stage: string,
  stageReason?: string,
): Promise<void> {
  const workspacePath = getWorkspacePath();
  if (!workspacePath) return;

  try {
    await invoke('upsert_agent_task', {
      workspacePath,
      id,
      chatTabId,
      goal,
      lifecycle,
      stage,
      stageReason: stageReason ?? null,
    });
  } catch (e) {
    console.warn('[agentTaskPersistence] upsert_agent_task failed:', e);
  }
}

export async function persistAgentTaskUpdate(
  id: string,
  chatTabId: string,
  goal: string,
  lifecycle: string,
  stage: string,
  stageReason?: string,
): Promise<void> {
  return persistAgentTask(id, chatTabId, goal, lifecycle, stage, stageReason);
}

export async function persistAgentArtifact(
  id: string,
  taskId: string | null,
  kind: string,
  status: string,
  summary?: string,
): Promise<void> {
  const workspacePath = getWorkspacePath();
  if (!workspacePath) return;

  try {
    await invoke('upsert_agent_artifact', {
      workspacePath,
      id,
      taskId: taskId ?? null,
      kind,
      status,
      summary: summary ?? null,
    });
  } catch (e) {
    console.warn('[agentTaskPersistence] upsert_agent_artifact failed:', e);
  }
}
