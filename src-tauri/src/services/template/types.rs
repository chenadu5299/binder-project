use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WorkflowTemplateStatus {
  Draft,
  Active,
  Disabled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowTemplate {
  pub id: String,
  pub workspace_path: String,
  pub project_id: Option<String>,
  pub name: String,
  pub description: Option<String>,
  pub status: WorkflowTemplateStatus,
  pub version: i32,
  pub created_at: i64,
  pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowTemplateDocument {
  pub template_id: String,
  pub content: String,
  pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParsedWorkflowStep {
  pub name: String,
  pub input: Vec<String>,
  pub output: Vec<String>,
  pub constraint: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParsedWorkflowPhase {
  pub name: String,
  pub steps: Vec<ParsedWorkflowStep>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParsedWorkflow {
  pub template_id: String,
  pub phases: Vec<ParsedWorkflowPhase>,
  pub updated_at: i64,
  pub diagnostics: Vec<WorkflowDiagnostic>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CompiledWorkflowRiskLevel {
  None,
  Warning,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum WorkflowDiagnosticKind {
  Fatal,
  Recoverable,
  Runtime,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowDiagnostic {
  pub kind: WorkflowDiagnosticKind,
  pub code: String,
  pub message: String,
  pub phase_name: Option<String>,
  pub step_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CompiledWorkflowStatus {
  Ready,
  Risky,
  Blocked,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompiledWorkflowStep {
  pub id: String,
  pub name: String,
  pub input: Vec<String>,
  pub output: Vec<String>,
  pub constraint: Vec<String>,
  pub warning_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompiledWorkflowPhase {
  pub id: String,
  pub name: String,
  pub steps: Vec<CompiledWorkflowStep>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompiledWorkflow {
  pub template_id: String,
  pub version: i32,
  pub phase_count: usize,
  pub step_count: usize,
  pub compiled_at: i64,
  pub document_updated_at: i64,
  pub status: CompiledWorkflowStatus,
  pub risk_level: Option<CompiledWorkflowRiskLevel>,
  pub phases: Vec<CompiledWorkflowPhase>,
  pub diagnostics: Vec<WorkflowDiagnostic>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TemplateBinding {
  pub template_id: String,
  pub task_id: String,
  pub workspace_path: String,
  pub bound_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeWorkflowPlanStep {
  pub id: String,
  pub phase_id: String,
  pub phase_name: String,
  pub step_index: usize,
  pub name: String,
  pub input: Vec<String>,
  pub output: Vec<String>,
  pub constraint: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeWorkflowPlan {
  pub template_id: String,
  pub task_id: String,
  pub current_step_index: usize,
  pub total_steps: usize,
  pub created_at: i64,
  pub steps: Vec<RuntimeWorkflowPlanStep>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum StepExecutionStatus {
  Pending,
  Running,
  Completed,
  Failed,
  WaitingUser,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StepState {
  pub step_index: usize,
  pub status: StepExecutionStatus,
  pub updated_at: i64,
  pub reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ExecutionStage {
  Continuous,
  Restricted,
  ManualIntervention,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionState {
  pub task_id: String,
  pub stage: ExecutionStage,
  pub current_step_index: usize,
  pub updated_at: i64,
  pub waiting_for_user: bool,
  pub reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionContext {
  pub task_id: String,
  pub template_id: String,
  pub workspace_path: String,
  pub created_at: i64,
  pub last_resumed_at: Option<i64>,
  pub last_interrupted_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowExecutionRuntime {
  pub context: ExecutionContext,
  pub execution_state: ExecutionState,
  pub step_states: Vec<StepState>,
  pub runtime_plan: RuntimeWorkflowPlan,
  #[serde(default)]
  pub runtime_diagnostics: Vec<WorkflowDiagnostic>,
}
