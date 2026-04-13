import type { BuildExecutionState, BuildOutlineDraft, BuildTerminalSummary } from '../../types/chatBuild';
import { useChatBuildStore } from '../../stores/chatBuildStore';
import { buildInterruptSignal } from './buildInterruptSignal';
import { workspaceBuildWriter } from './workspaceBuildWriter';

function createExecutionState(outline: BuildOutlineDraft): BuildExecutionState {
  return {
    runId: `build-run-${Date.now()}`,
    startedAt: Date.now(),
    isDryRun: false,
    currentStepIndex: 0,
    totalSteps: outline.steps.length,
    currentStepName: null,
    buildRootPath: null,
    metaPath: null,
    stepsPath: null,
    committedPaths: [],
    interruptRequested: false,
    steps: outline.steps.map((step) => ({
      id: step.id,
      name: step.name,
      summary: step.summary,
      status: 'pending',
      outputPath: null,
      startedAt: null,
      finishedAt: null,
    })),
  };
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const buildRunner = {
  createInitialExecution(outline: BuildOutlineDraft): BuildExecutionState {
    return createExecutionState(outline);
  },

  async run(tabId: string, workspacePath: string, outline: BuildOutlineDraft): Promise<BuildTerminalSummary> {
    const store = useChatBuildStore.getState();
    const initialExecution = store.getSession(tabId)?.execution;
    if (!initialExecution) {
      throw new Error('构建运行上下文缺失');
    }

    const target = await workspaceBuildWriter.createRun(workspacePath, outline, initialExecution.runId);
    store.patchExecution(tabId, (current) => {
      if (!current) return current;
      return {
        ...current,
        buildRootPath: target.buildRootPath,
        metaPath: target.metaPath,
        stepsPath: target.stepsPath,
      };
    });

    try {
      for (let index = 0; index < outline.steps.length; index += 1) {
        const step = outline.steps[index];
        if (!step.name?.trim()) {
          throw new Error(`步骤 ${index + 1} 缺少名称`);
        }

        buildInterruptSignal.assertNotInterrupted(tabId, initialExecution.runId);

        store.patchExecution(tabId, (current) => {
          if (!current) return current;
          return {
            ...current,
            currentStepIndex: index + 1,
            currentStepName: step.name,
            interruptRequested: buildInterruptSignal.isRequested(tabId, current.runId),
            steps: current.steps.map((entry, entryIndex) => {
              if (entryIndex < index) return entry;
              if (entryIndex === index) {
                return {
                  ...entry,
                  status: 'running',
                  startedAt: entry.startedAt ?? Date.now(),
                };
              }
              return entry;
            }),
          };
        });

        await wait(250);
        buildInterruptSignal.assertNotInterrupted(tabId, initialExecution.runId);

        const currentExecution = store.getSession(tabId)?.execution;
        if (!currentExecution) {
          throw new Error('构建执行状态丢失');
        }

        const outputPath = await workspaceBuildWriter.writeStep(
          target,
          outline,
          currentExecution,
          step,
          index,
        );

        buildInterruptSignal.assertNotInterrupted(tabId, initialExecution.runId);

        store.patchExecution(tabId, (current) => {
          if (!current) return current;
          return {
            ...current,
            committedPaths: [...current.committedPaths, outputPath],
            steps: current.steps.map((entry, entryIndex) => (
              entryIndex === index
                ? {
                    ...entry,
                    status: 'completed',
                    outputPath,
                    finishedAt: Date.now(),
                  }
                : entry
            )),
          };
        });

        const afterWriteExecution = store.getSession(tabId)?.execution;
        if (afterWriteExecution) {
          await workspaceBuildWriter.persistProgress(target, afterWriteExecution);
        }
      }

      const completedExecution = store.getSession(tabId)?.execution;
      if (!completedExecution) {
        throw new Error('构建执行状态丢失');
      }

      const terminal: BuildTerminalSummary = {
        kind: 'completed',
        title: outline.title,
        summary: `正式构建已完成，共写入 ${completedExecution.committedPaths.length} 个资源。`,
        finishedAt: Date.now(),
        buildRootPath: target.buildRootPath,
        metaPath: target.metaPath,
        stepsPath: target.stepsPath,
        partial: false,
        resourcePaths: completedExecution.committedPaths,
      };
      await workspaceBuildWriter.finalize(target, outline, completedExecution, terminal);
      return terminal;
    } catch (error) {
      const latestExecution = store.getSession(tabId)?.execution;

      if (buildInterruptSignal.isInterruptError(error)) {
        store.patchExecution(tabId, (current) => {
          if (!current) return current;
          return {
            ...current,
            interruptRequested: true,
            currentStepName: null,
            steps: current.steps.map((entry) => (
              entry.status === 'running'
                ? { ...entry, status: 'interrupted', finishedAt: Date.now() }
                : entry
            )),
          };
        });

        const interruptedExecution = store.getSession(tabId)?.execution;
        if (!interruptedExecution) {
          throw error;
        }

        const terminal: BuildTerminalSummary = {
          kind: 'interrupted',
          title: outline.title,
          summary: `构建已中断，已保留 ${interruptedExecution.committedPaths.length} 个已完成资源。`,
          finishedAt: Date.now(),
          buildRootPath: target.buildRootPath,
          metaPath: target.metaPath,
          stepsPath: target.stepsPath,
          partial: true,
          resourcePaths: interruptedExecution.committedPaths,
        };
        await workspaceBuildWriter.finalize(target, outline, interruptedExecution, terminal);
        return terminal;
      }

      store.patchExecution(tabId, (current) => {
        if (!current) return current;
        const failedIndex = current.currentStepIndex > 0 ? current.currentStepIndex - 1 : -1;
        return {
          ...current,
          currentStepName: null,
          steps: current.steps.map((entry, entryIndex) => {
            if (entryIndex === failedIndex && entry.status === 'running') {
              return { ...entry, status: 'failed', finishedAt: Date.now() };
            }
            return entry;
          }),
        };
      });

      const failedExecution = store.getSession(tabId)?.execution ?? latestExecution;
      if (failedExecution) {
        const terminal: BuildTerminalSummary = {
          kind: 'failed',
          title: outline.title,
          summary: error instanceof Error ? error.message : '正式构建失败',
          finishedAt: Date.now(),
          buildRootPath: target.buildRootPath,
          metaPath: target.metaPath,
          stepsPath: target.stepsPath,
          partial: true,
          resourcePaths: failedExecution.committedPaths,
        };
        await workspaceBuildWriter.finalize(target, outline, failedExecution, terminal);
        return terminal;
      }

      throw error;
    } finally {
      buildInterruptSignal.detach(tabId);
    }
  },
};
