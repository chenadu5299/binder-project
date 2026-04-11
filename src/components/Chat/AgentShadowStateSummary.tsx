import React from 'react';
import { useAgentStore } from '../../stores/agentStore';
import { useFileStore } from '../../stores/fileStore';
import { templateService } from '../../services/templateService';
import { toast } from '../Common/Toast';

interface AgentShadowStateSummaryProps {
  chatTabId: string;
  compact?: boolean;
}

const STAGE_LABELS: Record<string, string> = {
  draft: 'draft',
  structured: 'structured',
  candidate_ready: 'candidate_ready',
  review_ready: 'review_ready',
  user_confirmed: 'user_confirmed',
  stage_complete: 'stage_complete',
  invalidated: 'invalidated',
};

function pillClassName(tone: 'stage' | 'verification' | 'confirmation'): string {
  if (tone === 'stage') {
    return 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-200';
  }
  if (tone === 'verification') {
    return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200';
  }
  return 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-200';
}

export const AgentShadowStateSummary: React.FC<AgentShadowStateSummaryProps> = ({
  chatTabId,
  compact = false,
}) => {
  const runtime = useAgentStore((state) => state.runtimesByTab[chatTabId]);
  const { currentWorkspace } = useFileStore();

  if (!runtime || runtime.chatModeBoundary !== 'agent' || !runtime.currentTask) {
    return null;
  }

  const workflowExecution = runtime.workflowExecution;
  const completedSteps = workflowExecution?.stepStates.filter((item) => item.status === 'completed').length ?? 0;
  const currentStep = workflowExecution?.runtimePlan.steps[workflowExecution.executionState.currentStepIndex] ?? null;
  const latestRuntimeDiagnostic = workflowExecution?.runtimeDiagnostics?.[workflowExecution.runtimeDiagnostics.length - 1] ?? null;

  const updateWorkflowExecution = async (
    action: 'intervene' | 'resume' | 'fail' | 'advance',
  ) => {
    if (!currentWorkspace || !runtime.currentTask || !workflowExecution) return;
    try {
      let nextRuntime = workflowExecution;
      if (action === 'intervene') {
        nextRuntime = await templateService.requestWorkflowManualIntervention(
          currentWorkspace,
          runtime.currentTask.id,
          'user_requested_manual_intervention',
        );
      } else if (action === 'resume') {
        nextRuntime = await templateService.resumeWorkflowExecution(
          currentWorkspace,
          runtime.currentTask.id,
        );
      } else if (action === 'fail') {
        nextRuntime = await templateService.markCurrentWorkflowStepFailed(
          currentWorkspace,
          runtime.currentTask.id,
          'user_marked_current_step_failed',
        );
      } else if (action === 'advance') {
        nextRuntime = await templateService.advanceWorkflowExecutionStep(
          currentWorkspace,
          runtime.currentTask.id,
        );
      }
      useAgentStore.getState().setWorkflowExecution(chatTabId, nextRuntime);
    } catch (error) {
      toast.error(`更新执行状态失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const wrapperClassName = compact
    ? 'flex flex-wrap items-center gap-1 text-[10px]'
    : 'flex flex-wrap items-center gap-1.5 text-[11px]';

  const pillBaseClassName = compact
    ? 'rounded px-1.5 py-0.5 font-medium'
    : 'rounded px-2 py-0.5 font-medium';

  return (
    <div className={wrapperClassName}>
      <span className={`${pillBaseClassName} ${pillClassName('stage')}`}>
        Stage: {STAGE_LABELS[runtime.stageState.stage] ?? runtime.stageState.stage}
      </span>
      {runtime.verification && (
        <span className={`${pillBaseClassName} ${pillClassName('verification')}`}>
          Verification: {runtime.verification.status}
        </span>
      )}
      {runtime.confirmation && (
        <span className={`${pillBaseClassName} ${pillClassName('confirmation')}`}>
          Confirmation: {runtime.confirmation.status}
        </span>
      )}
      {workflowExecution && (
        <>
          <span className={`${pillBaseClassName} ${pillClassName('stage')}`}>
            Workflow: {workflowExecution.executionState.stage}
          </span>
          <span className={`${pillBaseClassName} ${pillClassName('stage')}`}>
            Phase: {currentStep?.phaseName ?? 'n/a'}
          </span>
          <span className={`${pillBaseClassName} ${pillClassName('stage')}`}>
            Step: {currentStep ? `${workflowExecution.executionState.currentStepIndex + 1}/${workflowExecution.runtimePlan.totalSteps} · ${currentStep.name}` : 'n/a'}
          </span>
          <span className={`${pillBaseClassName} ${pillClassName('verification')}`}>
            Completed: {completedSteps}/{workflowExecution.runtimePlan.totalSteps}
          </span>
          {workflowExecution.executionState.waitingForUser && (
            <span className={`${pillBaseClassName} ${pillClassName('confirmation')}`}>
              Waiting User
            </span>
          )}
          {latestRuntimeDiagnostic && (
            <span className={`${pillBaseClassName} ${pillClassName('confirmation')}`}>
              Runtime: {latestRuntimeDiagnostic.code}
            </span>
          )}
          <button
            type="button"
            className={`${pillBaseClassName} border border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800`}
            onClick={() => void updateWorkflowExecution('intervene')}
          >
            请求介入
          </button>
          <button
            type="button"
            className={`${pillBaseClassName} border border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800`}
            onClick={() => void updateWorkflowExecution('resume')}
          >
            继续执行
          </button>
          <button
            type="button"
            className={`${pillBaseClassName} border border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800`}
            onClick={() => void updateWorkflowExecution('fail')}
          >
            标记失败
          </button>
          <button
            type="button"
            className={`${pillBaseClassName} border border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800`}
            onClick={() => void updateWorkflowExecution('advance')}
          >
            推进一步
          </button>
        </>
      )}
    </div>
  );
};
