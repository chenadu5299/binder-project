//! TMP 模块服务入口。
//!
//! TMP-P0 冻结：
//! 1. 模板库当前唯一对象类型是工作流模板。
//! 2. 不承接 document template / skill / prompt / rules。
//! 3. 原始模板文档表达不得直接进入执行链。

pub mod service;
pub mod types;

pub use service::TemplateService;
pub use types::{
    CompiledWorkflow, CompiledWorkflowPhase, CompiledWorkflowRiskLevel, CompiledWorkflowStatus,
    CompiledWorkflowStep, ExecutionContext, ExecutionState, ParsedWorkflow,
    ParsedWorkflowPhase, ParsedWorkflowStep, RuntimeWorkflowPlan, RuntimeWorkflowPlanStep,
    StepState, TemplateBinding, WorkflowDiagnostic, WorkflowDiagnosticKind,
    WorkflowExecutionRuntime, WorkflowTemplate, WorkflowTemplateDocument, WorkflowTemplateStatus,
};
