import { invoke } from '@tauri-apps/api/core';
import type { BuildIntent, BuildOutlineDraft } from '../../types/chatBuild';

interface OutlinePayload {
  title: string;
  goal: string;
  summary: string;
  steps: Array<{
    id: string;
    name: string;
    summary: string;
  }>;
}

function normalizeOutline(payload: OutlinePayload): BuildOutlineDraft {
  const steps = Array.isArray(payload.steps) ? payload.steps : [];
  if (steps.length === 0) {
    throw new Error('生成的大纲没有步骤');
  }

  return {
    title: payload.title?.trim() || '未命名构建',
    goal: payload.goal?.trim() || '未提供目标',
    summary: payload.summary?.trim() || '未提供摘要',
    steps: steps.map((step, index) => ({
      id: step.id?.trim() || `step_${index + 1}`,
      name: step.name?.trim() || `步骤 ${index + 1}`,
      summary: step.summary?.trim() || '未提供步骤说明',
    })),
    createdAt: Date.now(),
  };
}

export const outlineGenerator = {
  async generate(intent: BuildIntent, model: string): Promise<BuildOutlineDraft> {
    const payload = await invoke<OutlinePayload>('chat_build_generate_outline', {
      discussionContext: intent.discussionContext,
      modelConfig: {
        model,
        temperature: 0.3,
        top_p: 1.0,
        max_tokens: 1200,
      },
    });

    return normalizeOutline(payload);
  },
};
