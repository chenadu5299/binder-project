use std::path::Path;

use uuid::Uuid;

use crate::workspace::workspace_db::WorkspaceDb;

use super::types::{
    CompiledWorkflow,
    CompiledWorkflowPhase,
    CompiledWorkflowRiskLevel,
    CompiledWorkflowStatus,
    CompiledWorkflowStep,
    ExecutionContext,
    ExecutionStage,
    ExecutionState,
    ParsedWorkflow,
    ParsedWorkflowPhase,
    ParsedWorkflowStep,
    RuntimeWorkflowPlan,
    RuntimeWorkflowPlanStep,
    StepExecutionStatus,
    StepState,
    TemplateBinding,
    WorkflowDiagnostic,
    WorkflowDiagnosticKind,
    WorkflowExecutionRuntime,
    WorkflowTemplate,
    WorkflowTemplateDocument,
    WorkflowTemplateStatus,
};

/// TMP 服务入口。
///
/// 当前承接：
/// - P1：模板资产、模板文档真源与最小状态治理
/// - P2：结构解析、流程编译、失败分层与缓存失效
#[derive(Default)]
pub struct TemplateService;

impl TemplateService {
    pub fn new() -> Self {
        Self
    }

    pub fn create_workflow_template(
        &self,
        workspace_path: &Path,
        name: &str,
        description: Option<String>,
        project_id: Option<String>,
    ) -> Result<WorkflowTemplate, String> {
        let db = WorkspaceDb::new(workspace_path)?;
        let now = chrono::Utc::now().timestamp_millis();
        let template = WorkflowTemplate {
            id: format!("wf_tpl_{}", Uuid::new_v4()),
            workspace_path: workspace_path.to_string_lossy().to_string(),
            project_id,
            name: name.trim().to_string(),
            description,
            status: WorkflowTemplateStatus::Draft,
            version: 1,
            created_at: now,
            updated_at: now,
        };
        db.insert_workflow_template(&template)?;
        db.upsert_workflow_template_document(&WorkflowTemplateDocument {
            template_id: template.id.clone(),
            content: String::new(),
            updated_at: now,
        })?;
        Ok(template)
    }

    pub fn list_workflow_templates(
        &self,
        workspace_path: &Path,
    ) -> Result<Vec<WorkflowTemplate>, String> {
        let db = WorkspaceDb::new(workspace_path)?;
        db.list_workflow_templates()
    }

    pub fn load_workflow_template_document(
        &self,
        workspace_path: &Path,
        template_id: &str,
    ) -> Result<WorkflowTemplateDocument, String> {
        let db = WorkspaceDb::new(workspace_path)?;
        db.get_workflow_template(template_id)?
            .ok_or_else(|| format!("模板不存在: {}", template_id))?;
        db.get_workflow_template_document(template_id)?
            .ok_or_else(|| format!("模板文档不存在: {}", template_id))
    }

    pub fn save_workflow_template_document(
        &self,
        workspace_path: &Path,
        template_id: &str,
        content: &str,
    ) -> Result<(WorkflowTemplate, WorkflowTemplateDocument), String> {
        let db = WorkspaceDb::new(workspace_path)?;
        db.get_workflow_template(template_id)?
            .ok_or_else(|| format!("模板不存在: {}", template_id))?;
        let document = WorkflowTemplateDocument {
            template_id: template_id.to_string(),
            content: content.to_string(),
            updated_at: chrono::Utc::now().timestamp_millis(),
        };
        db.upsert_workflow_template_document(&document)?;
        let template = db.bump_workflow_template_version(template_id)?;
        Ok((template, document))
    }

    pub fn update_workflow_template_status(
        &self,
        workspace_path: &Path,
        template_id: &str,
        status: WorkflowTemplateStatus,
    ) -> Result<(), String> {
        let db = WorkspaceDb::new(workspace_path)?;
        db.get_workflow_template(template_id)?
            .ok_or_else(|| format!("模板不存在: {}", template_id))?;
        db.update_workflow_template_status(template_id, &status)
    }

    pub fn parse_workflow_template(
        &self,
        workspace_path: &Path,
        template_id: &str,
    ) -> Result<ParsedWorkflow, String> {
        let db = WorkspaceDb::new(workspace_path)?;
        let document = self.ensure_template_document(&db, template_id)?;
        if let Some(cached) = db.get_parsed_workflow_cache(template_id, document.updated_at)? {
            return Ok(cached);
        }

        let parsed = self.parse_document(template_id, &document.content, document.updated_at);
        db.upsert_parsed_workflow_cache(&parsed, document.updated_at)?;
        Ok(parsed)
    }

    pub fn compile_workflow_template(
        &self,
        workspace_path: &Path,
        template_id: &str,
    ) -> Result<CompiledWorkflow, String> {
        let db = WorkspaceDb::new(workspace_path)?;
        let template = self.ensure_template(&db, template_id)?;
        let document = self.ensure_template_document(&db, template_id)?;
        if let Some(cached) = db.get_compiled_workflow_cache(template_id, document.updated_at)? {
            return Ok(cached);
        }

        let parsed = if let Some(cached) = db.get_parsed_workflow_cache(template_id, document.updated_at)? {
            cached
        } else {
            let parsed = self.parse_document(template_id, &document.content, document.updated_at);
            db.upsert_parsed_workflow_cache(&parsed, document.updated_at)?;
            parsed
        };

        let compiled = self.compile_parsed_workflow(&template, &parsed, document.updated_at);
        db.upsert_compiled_workflow_cache(&compiled)?;
        Ok(compiled)
    }

    pub fn create_template_binding(
        &self,
        workspace_path: &Path,
        template_id: &str,
        task_id: &str,
    ) -> Result<TemplateBinding, String> {
        let db = WorkspaceDb::new(workspace_path)?;
        self.ensure_template(&db, template_id)?;
        let binding = TemplateBinding {
            template_id: template_id.to_string(),
            task_id: task_id.to_string(),
            workspace_path: workspace_path.to_string_lossy().to_string(),
            bound_at: chrono::Utc::now().timestamp_millis(),
        };
        db.upsert_template_binding(&binding)?;
        Ok(binding)
    }

    pub fn create_runtime_workflow_plan(
        &self,
        workspace_path: &Path,
        template_id: &str,
        task_id: &str,
    ) -> Result<RuntimeWorkflowPlan, String> {
        let db = WorkspaceDb::new(workspace_path)?;
        let compiled = self.compile_workflow_template(workspace_path, template_id)?;

        if matches!(compiled.status, CompiledWorkflowStatus::Blocked) {
            return Err(format!(
                "模板存在阻断错误，不能进入 RuntimeWorkflowPlan：{}",
                template_id
            ));
        }

        self.create_template_binding(workspace_path, template_id, task_id)?;

        let mut steps: Vec<RuntimeWorkflowPlanStep> = Vec::new();
        for phase in &compiled.phases {
            for step in &phase.steps {
                let step_index = steps.len();
                steps.push(RuntimeWorkflowPlanStep {
                    id: step.id.clone(),
                    phase_id: phase.id.clone(),
                    phase_name: phase.name.clone(),
                    step_index,
                    name: step.name.clone(),
                    input: step.input.clone(),
                    output: step.output.clone(),
                    constraint: step.constraint.clone(),
                });
            }
        }

        if steps.is_empty() {
            return Err(format!(
                "模板未生成任何可执行步骤，不能进入 RuntimeWorkflowPlan：{}",
                template_id
            ));
        }

        let plan = RuntimeWorkflowPlan {
            template_id: template_id.to_string(),
            task_id: task_id.to_string(),
            current_step_index: 0,
            total_steps: steps.len(),
            created_at: chrono::Utc::now().timestamp_millis(),
            steps,
        };
        db.upsert_runtime_workflow_plan(&plan)?;
        let runtime = self.build_initial_workflow_execution_runtime(workspace_path, &compiled, &plan);
        db.upsert_workflow_execution_runtime(&runtime)?;
        Ok(plan)
    }

    pub fn get_workflow_execution_runtime(
        &self,
        workspace_path: &Path,
        task_id: &str,
    ) -> Result<WorkflowExecutionRuntime, String> {
        let db = WorkspaceDb::new(workspace_path)?;
        db.get_workflow_execution_runtime(task_id)?
            .ok_or_else(|| format!("未找到 workflow execution runtime: {}", task_id))
    }

    pub fn get_runtime_workflow_plan(
        &self,
        workspace_path: &Path,
        task_id: &str,
    ) -> Result<RuntimeWorkflowPlan, String> {
        let db = WorkspaceDb::new(workspace_path)?;
        db.get_runtime_workflow_plan(task_id)?
            .ok_or_else(|| format!("未找到 runtime workflow plan: {}", task_id))
    }

    #[allow(clippy::too_many_arguments)]
    pub fn evaluate_runtime_step_readiness(
        &self,
        workspace_path: &Path,
        task_id: &str,
        user_message: &str,
        current_file: Option<&str>,
        selected_text: Option<&str>,
        current_content_present: bool,
        reference_count: usize,
        knowledge_slice_count: usize,
    ) -> Result<WorkflowExecutionRuntime, String> {
        let db = WorkspaceDb::new(workspace_path)?;
        let mut runtime = db
            .get_workflow_execution_runtime(task_id)?
            .ok_or_else(|| format!("未找到 workflow execution runtime: {}", task_id))?;
        let now = chrono::Utc::now().timestamp_millis();
        let current_index = runtime.execution_state.current_step_index;
        let maybe_step = runtime.runtime_plan.steps.get(current_index).cloned();

        let current_step = match maybe_step {
            Some(step) => step,
            None => {
                runtime.execution_state.stage = ExecutionStage::ManualIntervention;
                runtime.execution_state.waiting_for_user = true;
                runtime.execution_state.updated_at = now;
                runtime.execution_state.reason = Some("runtime_invalid_step_index".to_string());
                self.append_runtime_diagnostic(
                    &mut runtime,
                    WorkflowDiagnostic {
                        kind: WorkflowDiagnosticKind::Runtime,
                        code: "runtime_invalid_step_index".to_string(),
                        message: "RuntimeWorkflowPlan 当前步骤索引无效，不能继续执行。".to_string(),
                        phase_name: None,
                        step_name: None,
                    },
                    now,
                );
                db.upsert_workflow_execution_runtime(&runtime)?;
                return Ok(runtime);
            }
        };

        let missing_inputs = current_step
            .input
            .iter()
            .filter(|input| {
                !Self::is_runtime_input_satisfied(
                    input,
                    user_message,
                    current_file,
                    selected_text,
                    current_content_present,
                    reference_count,
                    knowledge_slice_count,
                )
            })
            .cloned()
            .collect::<Vec<_>>();

        if !missing_inputs.is_empty() {
            let reason = format!("runtime_input_missing: {}", missing_inputs.join(", "));
            runtime.execution_state.stage = ExecutionStage::Restricted;
            runtime.execution_state.waiting_for_user = true;
            runtime.execution_state.updated_at = now;
            runtime.execution_state.reason = Some(reason.clone());
            if let Some(step_state) = runtime
                .step_states
                .iter_mut()
                .find(|item| item.step_index == current_index)
            {
                step_state.status = StepExecutionStatus::WaitingUser;
                step_state.updated_at = now;
                step_state.reason = Some(reason.clone());
            }
            self.append_runtime_diagnostic(
                &mut runtime,
                WorkflowDiagnostic {
                    kind: WorkflowDiagnosticKind::Runtime,
                    code: "runtime_missing_input".to_string(),
                    message: format!(
                        "当前步骤“{}”缺少可运行输入：{}。",
                        current_step.name,
                        missing_inputs.join(", ")
                    ),
                    phase_name: Some(current_step.phase_name.clone()),
                    step_name: Some(current_step.name.clone()),
                },
                now,
            );
        } else if let Some(step_state) = runtime
            .step_states
            .iter_mut()
            .find(|item| item.step_index == current_index)
        {
            if matches!(
                step_state.status,
                StepExecutionStatus::Pending | StepExecutionStatus::WaitingUser
            ) {
                step_state.status = StepExecutionStatus::Running;
                step_state.updated_at = now;
                step_state.reason = Some("runtime_inputs_ready".to_string());
            }
            runtime.execution_state.updated_at = now;
            runtime.execution_state.waiting_for_user = false;
            runtime.execution_state.reason = Some("runtime_inputs_ready".to_string());
        }

        db.upsert_workflow_execution_runtime(&runtime)?;
        Ok(runtime)
    }

    pub fn apply_tool_execution_feedback(
        &self,
        workspace_path: &Path,
        task_id: &str,
        tool_name: &str,
        success: bool,
        detail: Option<&str>,
    ) -> Result<WorkflowExecutionRuntime, String> {
        let db = WorkspaceDb::new(workspace_path)?;
        let mut runtime = db
            .get_workflow_execution_runtime(task_id)?
            .ok_or_else(|| format!("未找到 workflow execution runtime: {}", task_id))?;
        let now = chrono::Utc::now().timestamp_millis();
        let current_index = runtime.execution_state.current_step_index;
        let maybe_step = runtime.runtime_plan.steps.get(current_index).cloned();
        let current_step = match maybe_step {
            Some(step) => step,
            None => {
                runtime.execution_state.stage = ExecutionStage::ManualIntervention;
                runtime.execution_state.waiting_for_user = true;
                runtime.execution_state.updated_at = now;
                runtime.execution_state.reason = Some("runtime_invalid_step_index".to_string());
                self.append_runtime_diagnostic(
                    &mut runtime,
                    WorkflowDiagnostic {
                        kind: WorkflowDiagnosticKind::Runtime,
                        code: "runtime_invalid_step_index".to_string(),
                        message: "工具执行反馈无法定位当前步骤，RuntimeWorkflowPlan 已失配。".to_string(),
                        phase_name: None,
                        step_name: None,
                    },
                    now,
                );
                db.upsert_workflow_execution_runtime(&runtime)?;
                return Ok(runtime);
            }
        };

        if success {
            if let Some(current) = runtime
                .step_states
                .iter_mut()
                .find(|item| item.step_index == current_index)
            {
                current.status = StepExecutionStatus::Completed;
                current.updated_at = now;
                current.reason = Some(format!("tool_success:{}", tool_name));
            }

            let compiled = self.compile_workflow_template(workspace_path, &runtime.context.template_id)?;
            let next_index = current_index + 1;
            if next_index < runtime.step_states.len() {
                runtime.execution_state.current_step_index = next_index;
                runtime.runtime_plan.current_step_index = next_index;
                runtime.execution_state.stage = self.default_execution_stage_for_compiled(&compiled);
                runtime.execution_state.waiting_for_user = false;
                runtime.execution_state.updated_at = now;
                runtime.execution_state.reason = Some(format!("step_advanced_after_tool_success:{}", tool_name));
                if let Some(next) = runtime
                    .step_states
                    .iter_mut()
                    .find(|item| item.step_index == next_index)
                {
                    next.status = StepExecutionStatus::Running;
                    next.updated_at = now;
                    next.reason = Some("step_started_after_tool_success".to_string());
                }
            } else {
                runtime.execution_state.stage = self.default_execution_stage_for_compiled(&compiled);
                runtime.execution_state.waiting_for_user = false;
                runtime.execution_state.updated_at = now;
                runtime.execution_state.reason = Some(format!("workflow_completed_after_tool_success:{}", tool_name));
            }
        } else {
            let failure_reason = detail
                .filter(|value| !value.trim().is_empty())
                .unwrap_or("tool_execution_failed");
            runtime.execution_state.stage = ExecutionStage::Restricted;
            runtime.execution_state.waiting_for_user = true;
            runtime.execution_state.updated_at = now;
            runtime.execution_state.reason = Some(failure_reason.to_string());
            runtime.context.last_interrupted_at = Some(now);
            if let Some(current) = runtime
                .step_states
                .iter_mut()
                .find(|item| item.step_index == current_index)
            {
                current.status = StepExecutionStatus::Failed;
                current.updated_at = now;
                current.reason = Some(format!("tool_failed:{}", tool_name));
            }
            self.append_runtime_diagnostic(
                &mut runtime,
                WorkflowDiagnostic {
                    kind: WorkflowDiagnosticKind::Runtime,
                    code: "runtime_tool_failure".to_string(),
                    message: format!(
                        "步骤“{}”在工具“{}”执行后进入失败分支：{}。",
                        current_step.name,
                        tool_name,
                        failure_reason
                    ),
                    phase_name: Some(current_step.phase_name.clone()),
                    step_name: Some(current_step.name.clone()),
                },
                now,
            );
        }

        db.upsert_workflow_execution_runtime(&runtime)?;
        Ok(runtime)
    }

    pub fn request_manual_intervention(
        &self,
        workspace_path: &Path,
        task_id: &str,
        reason: Option<&str>,
    ) -> Result<WorkflowExecutionRuntime, String> {
        let db = WorkspaceDb::new(workspace_path)?;
        let mut runtime = db
            .get_workflow_execution_runtime(task_id)?
            .ok_or_else(|| format!("未找到 workflow execution runtime: {}", task_id))?;
        let now = chrono::Utc::now().timestamp_millis();
        runtime.execution_state.stage = ExecutionStage::ManualIntervention;
        runtime.execution_state.waiting_for_user = true;
        runtime.execution_state.updated_at = now;
        runtime.execution_state.reason = Some(
            reason
                .unwrap_or("manual_intervention_requested")
                .to_string(),
        );
        runtime.context.last_interrupted_at = Some(now);

        if let Some(step_state) = runtime
            .step_states
            .iter_mut()
            .find(|item| item.step_index == runtime.execution_state.current_step_index)
        {
            step_state.status = StepExecutionStatus::WaitingUser;
            step_state.updated_at = now;
            step_state.reason = Some(
                reason
                    .unwrap_or("manual_intervention_requested")
                    .to_string(),
            );
        }

        db.upsert_workflow_execution_runtime(&runtime)?;
        Ok(runtime)
    }

    pub fn resume_workflow_execution(
        &self,
        workspace_path: &Path,
        task_id: &str,
    ) -> Result<WorkflowExecutionRuntime, String> {
        let db = WorkspaceDb::new(workspace_path)?;
        let mut runtime = db
            .get_workflow_execution_runtime(task_id)?
            .ok_or_else(|| format!("未找到 workflow execution runtime: {}", task_id))?;
        let now = chrono::Utc::now().timestamp_millis();
        let compiled = self.compile_workflow_template(workspace_path, &runtime.context.template_id)?;

        runtime.execution_state.stage = self.default_execution_stage_for_compiled(&compiled);
        runtime.execution_state.waiting_for_user = false;
        runtime.execution_state.updated_at = now;
        runtime.execution_state.reason = Some("execution_resumed".to_string());
        runtime.context.last_resumed_at = Some(now);

        if let Some(step_state) = runtime
            .step_states
            .iter_mut()
            .find(|item| item.step_index == runtime.execution_state.current_step_index)
        {
            if matches!(
                step_state.status,
                StepExecutionStatus::WaitingUser | StepExecutionStatus::Pending
            ) {
                step_state.status = StepExecutionStatus::Running;
                step_state.updated_at = now;
                step_state.reason = Some("execution_resumed".to_string());
            }
        }

        db.upsert_workflow_execution_runtime(&runtime)?;
        Ok(runtime)
    }

    pub fn mark_current_workflow_step_failed(
        &self,
        workspace_path: &Path,
        task_id: &str,
        reason: Option<&str>,
    ) -> Result<WorkflowExecutionRuntime, String> {
        let db = WorkspaceDb::new(workspace_path)?;
        let mut runtime = db
            .get_workflow_execution_runtime(task_id)?
            .ok_or_else(|| format!("未找到 workflow execution runtime: {}", task_id))?;
        let now = chrono::Utc::now().timestamp_millis();
        let failure_reason = reason.unwrap_or("workflow_step_failed");

        runtime.execution_state.stage = ExecutionStage::Restricted;
        runtime.execution_state.waiting_for_user = true;
        runtime.execution_state.updated_at = now;
        runtime.execution_state.reason = Some(failure_reason.to_string());
        runtime.context.last_interrupted_at = Some(now);

        if let Some(step_state) = runtime
            .step_states
            .iter_mut()
            .find(|item| item.step_index == runtime.execution_state.current_step_index)
        {
            step_state.status = StepExecutionStatus::Failed;
            step_state.updated_at = now;
            step_state.reason = Some(failure_reason.to_string());
        }

        db.upsert_workflow_execution_runtime(&runtime)?;
        Ok(runtime)
    }

    pub fn advance_workflow_execution_step(
        &self,
        workspace_path: &Path,
        task_id: &str,
    ) -> Result<WorkflowExecutionRuntime, String> {
        let db = WorkspaceDb::new(workspace_path)?;
        let mut runtime = db
            .get_workflow_execution_runtime(task_id)?
            .ok_or_else(|| format!("未找到 workflow execution runtime: {}", task_id))?;
        let now = chrono::Utc::now().timestamp_millis();
        let current_index = runtime.execution_state.current_step_index;

        if let Some(current) = runtime
            .step_states
            .iter_mut()
            .find(|item| item.step_index == current_index)
        {
            current.status = StepExecutionStatus::Completed;
            current.updated_at = now;
            current.reason = Some("step_completed".to_string());
        }

        let next_index = current_index + 1;
        if next_index < runtime.step_states.len() {
            runtime.execution_state.current_step_index = next_index;
            runtime.runtime_plan.current_step_index = next_index;
            runtime.execution_state.updated_at = now;
            runtime.execution_state.waiting_for_user = false;
            runtime.execution_state.reason = Some("step_advanced".to_string());
            if let Some(next) = runtime
                .step_states
                .iter_mut()
                .find(|item| item.step_index == next_index)
            {
                next.status = StepExecutionStatus::Running;
                next.updated_at = now;
                next.reason = Some("step_started".to_string());
            }
        } else {
            runtime.execution_state.current_step_index = current_index;
            runtime.runtime_plan.current_step_index = current_index;
            runtime.execution_state.updated_at = now;
            runtime.execution_state.waiting_for_user = false;
            runtime.execution_state.reason = Some("workflow_completed".to_string());
        }

        db.upsert_workflow_execution_runtime(&runtime)?;
        Ok(runtime)
    }

    fn build_initial_workflow_execution_runtime(
        &self,
        workspace_path: &Path,
        compiled: &CompiledWorkflow,
        plan: &RuntimeWorkflowPlan,
    ) -> WorkflowExecutionRuntime {
        let now = chrono::Utc::now().timestamp_millis();
        let current_step_index = plan.current_step_index;
        let step_states = plan
            .steps
            .iter()
            .enumerate()
            .map(|(index, _)| StepState {
                step_index: index,
                status: if index == current_step_index {
                    StepExecutionStatus::Running
                } else {
                    StepExecutionStatus::Pending
                },
                updated_at: now,
                reason: Some(if index == current_step_index {
                    "step_started".to_string()
                } else {
                    "awaiting_execution".to_string()
                }),
            })
            .collect::<Vec<_>>();

        WorkflowExecutionRuntime {
            context: ExecutionContext {
                task_id: plan.task_id.clone(),
                template_id: plan.template_id.clone(),
                workspace_path: workspace_path.to_string_lossy().to_string(),
                created_at: now,
                last_resumed_at: None,
                last_interrupted_at: None,
            },
            execution_state: ExecutionState {
                task_id: plan.task_id.clone(),
                stage: self.default_execution_stage_for_compiled(compiled),
                current_step_index,
                updated_at: now,
                waiting_for_user: false,
                reason: Some("runtime_workflow_plan_initialized".to_string()),
            },
            step_states,
            runtime_plan: plan.clone(),
            runtime_diagnostics: Vec::new(),
        }
    }

    fn default_execution_stage_for_compiled(
        &self,
        compiled: &CompiledWorkflow,
    ) -> ExecutionStage {
        if matches!(compiled.status, CompiledWorkflowStatus::Risky) {
            ExecutionStage::Restricted
        } else {
            ExecutionStage::Continuous
        }
    }

    fn ensure_template(
        &self,
        db: &WorkspaceDb,
        template_id: &str,
    ) -> Result<WorkflowTemplate, String> {
        db.get_workflow_template(template_id)?
            .ok_or_else(|| format!("模板不存在: {}", template_id))
    }

    fn ensure_template_document(
        &self,
        db: &WorkspaceDb,
        template_id: &str,
    ) -> Result<WorkflowTemplateDocument, String> {
        self.ensure_template(db, template_id)?;
        db.get_workflow_template_document(template_id)?
            .ok_or_else(|| format!("模板文档不存在: {}", template_id))
    }

    fn parse_document(
        &self,
        template_id: &str,
        content: &str,
        updated_at: i64,
    ) -> ParsedWorkflow {
        let mut phases: Vec<ParsedWorkflowPhase> = Vec::new();
        let mut diagnostics: Vec<WorkflowDiagnostic> = Vec::new();
        let mut current_phase_name = "默认阶段".to_string();
        let mut current_steps: Vec<ParsedWorkflowStep> = Vec::new();
        let mut current_step: Option<ParsedWorkflowStep> = None;

        for raw_line in content.lines() {
            let line = raw_line.trim();
            if line.is_empty() {
                continue;
            }

            if let Some(phase_name) = Self::parse_phase_heading(line) {
                Self::flush_current_step(&mut current_step, &mut current_steps);
                Self::flush_current_phase(&mut phases, &mut current_phase_name, &mut current_steps);
                current_phase_name = phase_name;
                continue;
            }

            if let Some(step_name) = Self::parse_step_heading(line) {
                Self::flush_current_step(&mut current_step, &mut current_steps);
                current_step = Some(ParsedWorkflowStep {
                    name: step_name,
                    input: Vec::new(),
                    output: Vec::new(),
                    constraint: None,
                });
                continue;
            }

            if let Some(step) = current_step.as_mut() {
                if let Some(value) = Self::parse_field_value(line, &["input", "输入"]) {
                    step.input = Self::parse_list_value(&value);
                    continue;
                }
                if let Some(value) = Self::parse_field_value(line, &["output", "输出"]) {
                    step.output = Self::parse_list_value(&value);
                    continue;
                }
                if let Some(value) = Self::parse_field_value(line, &["constraint", "constraints", "约束"]) {
                    let constraint = Self::parse_list_value(&value);
                    step.constraint = if constraint.is_empty() { None } else { Some(constraint) };
                    continue;
                }
            }
        }

        Self::flush_current_step(&mut current_step, &mut current_steps);
        Self::flush_current_phase(&mut phases, &mut current_phase_name, &mut current_steps);

        if phases.iter().all(|phase| phase.steps.is_empty()) {
            diagnostics.push(WorkflowDiagnostic {
                kind: WorkflowDiagnosticKind::Fatal,
                code: "no_step_found".to_string(),
                message: "模板未解析出任何步骤；至少需要一个 step。".to_string(),
                phase_name: None,
                step_name: None,
            });
        }

        for phase in &phases {
            for step in &phase.steps {
                if step.input.is_empty() {
                    diagnostics.push(WorkflowDiagnostic {
                        kind: WorkflowDiagnosticKind::Fatal,
                        code: "missing_step_input".to_string(),
                        message: format!("步骤“{}”缺少 input。", step.name),
                        phase_name: Some(phase.name.clone()),
                        step_name: Some(step.name.clone()),
                    });
                }
                if step.output.is_empty() {
                    diagnostics.push(WorkflowDiagnostic {
                        kind: WorkflowDiagnosticKind::Fatal,
                        code: "missing_step_output".to_string(),
                        message: format!("步骤“{}”缺少 output。", step.name),
                        phase_name: Some(phase.name.clone()),
                        step_name: Some(step.name.clone()),
                    });
                }
                if step.constraint.as_ref().map(|items| items.is_empty()).unwrap_or(true) {
                    diagnostics.push(WorkflowDiagnostic {
                        kind: WorkflowDiagnosticKind::Recoverable,
                        code: "missing_constraint".to_string(),
                        message: format!("步骤“{}”缺少 constraint，将按风险可执行处理。", step.name),
                        phase_name: Some(phase.name.clone()),
                        step_name: Some(step.name.clone()),
                    });
                }
            }
        }

        ParsedWorkflow {
            template_id: template_id.to_string(),
            phases,
            updated_at,
            diagnostics,
        }
    }

    fn compile_parsed_workflow(
        &self,
        template: &WorkflowTemplate,
        parsed: &ParsedWorkflow,
        document_updated_at: i64,
    ) -> CompiledWorkflow {
        let now = chrono::Utc::now().timestamp_millis();
        let diagnostics = parsed.diagnostics.clone();
        let has_fatal = diagnostics
            .iter()
            .any(|item| matches!(item.kind, WorkflowDiagnosticKind::Fatal));
        let has_recoverable = diagnostics
            .iter()
            .any(|item| matches!(item.kind, WorkflowDiagnosticKind::Recoverable));

        let phases: Vec<CompiledWorkflowPhase> = parsed
            .phases
            .iter()
            .enumerate()
            .map(|(phase_index, phase)| {
                let steps = phase
                    .steps
                    .iter()
                    .enumerate()
                    .map(|(step_index, step)| {
                        let warning_count = diagnostics
                            .iter()
                            .filter(|item| {
                                matches!(item.kind, WorkflowDiagnosticKind::Recoverable)
                                    && item.phase_name.as_deref() == Some(phase.name.as_str())
                                    && item.step_name.as_deref() == Some(step.name.as_str())
                            })
                            .count();
                        CompiledWorkflowStep {
                            id: format!("phase_{}_step_{}", phase_index, step_index),
                            name: step.name.clone(),
                            input: step.input.clone(),
                            output: step.output.clone(),
                            constraint: step.constraint.clone().unwrap_or_default(),
                            warning_count,
                        }
                    })
                    .collect();
                CompiledWorkflowPhase {
                    id: format!("phase_{}", phase_index),
                    name: phase.name.clone(),
                    steps,
                }
            })
            .collect();

        let step_count = phases.iter().map(|phase| phase.steps.len()).sum();
        let status = if has_fatal {
            CompiledWorkflowStatus::Blocked
        } else if has_recoverable {
            CompiledWorkflowStatus::Risky
        } else {
            CompiledWorkflowStatus::Ready
        };

        CompiledWorkflow {
            template_id: template.id.clone(),
            version: template.version,
            phase_count: phases.len(),
            step_count,
            compiled_at: now,
            document_updated_at,
            status,
            risk_level: if has_fatal || has_recoverable {
                Some(CompiledWorkflowRiskLevel::Warning)
            } else {
                Some(CompiledWorkflowRiskLevel::None)
            },
            phases,
            diagnostics,
        }
    }

    fn parse_phase_heading(line: &str) -> Option<String> {
        if let Some(name) = line.strip_prefix("## ") {
            let name = name.trim();
            if !name.is_empty() {
                return Some(name.to_string());
            }
        }
        if let Some(name) = line.strip_prefix("# ") {
            let name = name.trim();
            if !name.is_empty() {
                return Some(name.to_string());
            }
        }
        if let Some(name) = Self::strip_named_prefix(line, &["phase", "阶段"]) {
            if !name.is_empty() {
                return Some(name.to_string());
            }
        }
        None
    }

    fn parse_step_heading(line: &str) -> Option<String> {
        if let Some(name) = line.strip_prefix("### ") {
            let name = name.trim();
            if !name.is_empty() {
                return Some(name.to_string());
            }
        }
        if let Some(name) = Self::strip_named_prefix(line, &["step", "步骤"]) {
            if !name.is_empty() {
                return Some(name.to_string());
            }
        }
        None
    }

    fn parse_field_value(line: &str, prefixes: &[&str]) -> Option<String> {
        let normalized = line
            .trim_start_matches('-')
            .trim_start_matches('*')
            .trim();
        Self::strip_named_prefix(normalized, prefixes).map(|value| value.to_string())
    }

    fn strip_named_prefix<'a>(line: &'a str, prefixes: &[&str]) -> Option<&'a str> {
        for prefix in prefixes {
            if let Some(value) = line.strip_prefix(&format!("{}:", prefix)) {
                return Some(value.trim());
            }
            if let Some(value) = line.strip_prefix(&format!("{}：", prefix)) {
                return Some(value.trim());
            }
            let capitalized = {
                let mut chars = prefix.chars();
                match chars.next() {
                    Some(first) => format!("{}{}", first.to_uppercase(), chars.as_str()),
                    None => prefix.to_string(),
                }
            };
            if let Some(value) = line.strip_prefix(&format!("{}:", capitalized)) {
                return Some(value.trim());
            }
        }
        None
    }

    fn parse_list_value(value: &str) -> Vec<String> {
        value
            .split([',', ';', '，', '；'])
            .map(|item| item.trim())
            .filter(|item| !item.is_empty())
            .map(|item| item.to_string())
            .collect()
    }

    fn flush_current_step(
        current_step: &mut Option<ParsedWorkflowStep>,
        current_steps: &mut Vec<ParsedWorkflowStep>,
    ) {
        if let Some(step) = current_step.take() {
            current_steps.push(step);
        }
    }

    fn flush_current_phase(
        phases: &mut Vec<ParsedWorkflowPhase>,
        current_phase_name: &mut String,
        current_steps: &mut Vec<ParsedWorkflowStep>,
    ) {
        if current_steps.is_empty() && phases.is_empty() && current_phase_name == "默认阶段" {
            return;
        }
        phases.push(ParsedWorkflowPhase {
            name: current_phase_name.clone(),
            steps: std::mem::take(current_steps),
        });
    }

    fn append_runtime_diagnostic(
        &self,
        runtime: &mut WorkflowExecutionRuntime,
        diagnostic: WorkflowDiagnostic,
        now: i64,
    ) {
        let diagnostic_kind = diagnostic.kind.clone();
        let diagnostic_code = diagnostic.code.clone();
        let diagnostic_phase = diagnostic.phase_name.clone();
        let diagnostic_step = diagnostic.step_name.clone();
        let already_exists = runtime.runtime_diagnostics.iter().any(|item| {
            item.kind == diagnostic_kind
                && item.code == diagnostic_code
                && item.phase_name == diagnostic_phase
                && item.step_name == diagnostic_step
        });
        if !already_exists {
            runtime.runtime_diagnostics.push(diagnostic);
        }
        runtime.execution_state.updated_at = now;
    }

    fn is_runtime_input_satisfied(
        input: &str,
        user_message: &str,
        current_file: Option<&str>,
        selected_text: Option<&str>,
        current_content_present: bool,
        reference_count: usize,
        knowledge_slice_count: usize,
    ) -> bool {
        let normalized = input.trim().to_lowercase();
        if normalized.is_empty() {
            return true;
        }

        let has_user_message = !user_message.trim().is_empty();
        let has_file = current_file.is_some();
        let has_selection = selected_text.map(|item| !item.trim().is_empty()).unwrap_or(false);
        let has_references = reference_count > 0;
        let has_knowledge = knowledge_slice_count > 0;
        let has_context = has_file || current_content_present || has_references || has_knowledge;

        match normalized.as_str() {
            "task" | "goal" | "request" | "instruction" | "query" => has_user_message,
            "context" | "background" | "brief" | "reference" | "references" => has_context,
            "file" | "document" | "content" | "current_file" => has_file || current_content_present,
            "selection" | "selected_text" => has_selection,
            "knowledge" | "facts" | "evidence" => has_knowledge,
            _ => true,
        }
    }
}

#[cfg(test)]
mod tests {
    use std::{fs, path::PathBuf};

    use uuid::Uuid;

    use crate::services::template::types::ExecutionStage;
    use super::TemplateService;
    use crate::services::template::types::{
        CompiledWorkflowRiskLevel,
        CompiledWorkflowStatus,
        StepExecutionStatus,
        WorkflowTemplate,
        WorkflowTemplateStatus,
    };

    fn sample_template() -> WorkflowTemplate {
        WorkflowTemplate {
            id: "wf_tpl_test".to_string(),
            workspace_path: "/tmp/binder-template-tests".to_string(),
            project_id: None,
            name: "Test Workflow".to_string(),
            description: None,
            status: WorkflowTemplateStatus::Draft,
            version: 1,
            created_at: 1,
            updated_at: 1,
        }
    }

    fn temp_workspace() -> PathBuf {
        let path = std::env::temp_dir().join(format!("binder-template-test-{}", Uuid::new_v4()));
        fs::create_dir_all(&path).expect("create temp workspace");
        path
    }

    #[test]
    fn parse_reports_fatal_when_no_step_exists() {
        let service = TemplateService::new();
        let parsed = service.parse_document("wf_tpl_test", "# 阶段一", 1);

        assert!(parsed
            .diagnostics
            .iter()
            .any(|item| item.code == "no_step_found"));
    }

    #[test]
    fn compile_marks_missing_constraint_as_risky() {
        let service = TemplateService::new();
        let content = r#"
# 阶段一
### 收集输入
input: task, context
output: brief
"#;
        let parsed = service.parse_document("wf_tpl_test", content, 1);
        let compiled = service.compile_parsed_workflow(&sample_template(), &parsed, 1);

        assert!(matches!(compiled.status, CompiledWorkflowStatus::Risky));
        assert!(matches!(
            compiled.risk_level,
            Some(CompiledWorkflowRiskLevel::Warning)
        ));
    }

    #[test]
    fn risky_compiled_workflow_starts_in_restricted_stage() {
        let service = TemplateService::new();
        let content = r#"
# 阶段一
### 收集输入
input: task, context
output: brief
"#;
        let parsed = service.parse_document("wf_tpl_test", content, 1);
        let compiled = service.compile_parsed_workflow(&sample_template(), &parsed, 1);
        let restricted = service.default_execution_stage_for_compiled(&compiled);
        assert!(matches!(restricted, ExecutionStage::Restricted));
    }

    #[test]
    fn saving_template_document_bumps_version() {
        let service = TemplateService::new();
        let workspace = temp_workspace();

        let template = service
            .create_workflow_template(&workspace, "Test Workflow", None, None)
            .expect("create template");
        assert_eq!(template.version, 1);

        let (updated_template, document) = service
            .save_workflow_template_document(
                &workspace,
                &template.id,
                "# 阶段一\n### 收集输入\ninput: task\noutput: brief\n",
            )
            .expect("save template document");

        assert_eq!(document.template_id, template.id);
        assert_eq!(updated_template.version, 2);
        assert!(updated_template.updated_at >= template.updated_at);
    }

    #[test]
    fn runtime_missing_input_produces_runtime_diagnostic_and_restricted_state() {
        let service = TemplateService::new();
        let workspace = temp_workspace();
        let template = service
            .create_workflow_template(&workspace, "Runtime Missing Input", None, None)
            .expect("create template");

        service
            .save_workflow_template_document(
                &workspace,
                &template.id,
                "# 阶段一\n### 收集选区\ninput: selection\noutput: excerpt\nconstraint: expose\n",
            )
            .expect("save template");

        service
            .create_runtime_workflow_plan(&workspace, &template.id, "task_runtime_missing")
            .expect("create runtime plan");

        let runtime = service
            .evaluate_runtime_step_readiness(
                &workspace,
                "task_runtime_missing",
                "请处理这个任务",
                None,
                None,
                false,
                0,
                0,
            )
            .expect("evaluate readiness");

        assert!(matches!(runtime.execution_state.stage, ExecutionStage::Restricted));
        assert!(runtime.execution_state.waiting_for_user);
        assert!(runtime
            .runtime_diagnostics
            .iter()
            .any(|item| item.code == "runtime_missing_input"));
    }

    #[test]
    fn tool_success_feedback_advances_runtime_step() {
        let service = TemplateService::new();
        let workspace = temp_workspace();
        let template = service
            .create_workflow_template(&workspace, "Tool Success Runtime", None, None)
            .expect("create template");

        service
            .save_workflow_template_document(
                &workspace,
                &template.id,
                "# 阶段一\n### 收集任务\ninput: task\noutput: brief\nconstraint: expose\n### 生成结果\ninput: context\noutput: result\nconstraint: verify\n",
            )
            .expect("save template");

        service
            .create_runtime_workflow_plan(&workspace, &template.id, "task_tool_success")
            .expect("create runtime plan");

        let runtime = service
            .apply_tool_execution_feedback(
                &workspace,
                "task_tool_success",
                "read_file",
                true,
                Some("tool succeeded"),
            )
            .expect("apply tool feedback");

        assert_eq!(runtime.execution_state.current_step_index, 1);
        assert!(matches!(runtime.step_states[0].status, StepExecutionStatus::Completed));
        assert!(matches!(runtime.step_states[1].status, StepExecutionStatus::Running));
    }

    #[test]
    fn tool_failure_feedback_creates_runtime_diagnostic() {
        let service = TemplateService::new();
        let workspace = temp_workspace();
        let template = service
            .create_workflow_template(&workspace, "Tool Failure Runtime", None, None)
            .expect("create template");

        service
            .save_workflow_template_document(
                &workspace,
                &template.id,
                "# 阶段一\n### 收集任务\ninput: task\noutput: brief\nconstraint: expose\n",
            )
            .expect("save template");

        service
            .create_runtime_workflow_plan(&workspace, &template.id, "task_tool_failure")
            .expect("create runtime plan");

        let runtime = service
            .apply_tool_execution_feedback(
                &workspace,
                "task_tool_failure",
                "read_file",
                false,
                Some("file missing"),
            )
            .expect("apply tool feedback");

        assert!(matches!(runtime.execution_state.stage, ExecutionStage::Restricted));
        assert!(runtime.execution_state.waiting_for_user);
        assert!(matches!(runtime.step_states[0].status, StepExecutionStatus::Failed));
        assert!(runtime
            .runtime_diagnostics
            .iter()
            .any(|item| item.code == "runtime_tool_failure"));
    }
}
