//! TMP 命令入口。
//!
//! TMP-P1 冻结：
//! - 当前只承接工作流模板。
//! - 模板文档表达层是真实可编辑真源。
//! - 不为 document template / skill template 提供任何命令入口。

use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::services::template::{
  CompiledWorkflow, ParsedWorkflow, TemplateService, WorkflowExecutionRuntime, WorkflowTemplate,
  WorkflowTemplateDocument, WorkflowTemplateStatus,
};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateWorkflowTemplateRequest {
  pub name: String,
  pub description: Option<String>,
  pub project_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveWorkflowTemplateDocumentRequest {
  pub template_id: String,
  pub content: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateWorkflowTemplateStatusRequest {
  pub template_id: String,
  pub status: WorkflowTemplateStatus,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowExecutionActionRequest {
  pub task_id: String,
  pub reason: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowTemplateWithDocument {
  pub template: WorkflowTemplate,
  pub document: WorkflowTemplateDocument,
}

#[tauri::command]
pub async fn create_workflow_template(
  workspace_path: String,
  request: CreateWorkflowTemplateRequest,
) -> Result<WorkflowTemplate, String> {
  let service = TemplateService::new();
  service.create_workflow_template(
    Path::new(&workspace_path),
    &request.name,
    request.description,
    request.project_id,
  )
}

#[tauri::command]
pub async fn list_workflow_templates(
  workspace_path: String,
) -> Result<Vec<WorkflowTemplate>, String> {
  let service = TemplateService::new();
  service.list_workflow_templates(Path::new(&workspace_path))
}

#[tauri::command]
pub async fn load_workflow_template(
  workspace_path: String,
  template_id: String,
) -> Result<WorkflowTemplateWithDocument, String> {
  let service = TemplateService::new();
  let templates = service.list_workflow_templates(Path::new(&workspace_path))?;
  let template = templates
    .into_iter()
    .find(|item| item.id == template_id)
    .ok_or_else(|| format!("模板不存在: {}", template_id))?;
  let document =
    service.load_workflow_template_document(Path::new(&workspace_path), &template.id)?;
  Ok(WorkflowTemplateWithDocument { template, document })
}

#[tauri::command]
pub async fn save_workflow_template_document(
  workspace_path: String,
  request: SaveWorkflowTemplateDocumentRequest,
) -> Result<WorkflowTemplateWithDocument, String> {
  let service = TemplateService::new();
  let (template, document) = service.save_workflow_template_document(
    Path::new(&workspace_path),
    &request.template_id,
    &request.content,
  )?;
  Ok(WorkflowTemplateWithDocument { template, document })
}

#[tauri::command]
pub async fn update_workflow_template_status(
  workspace_path: String,
  request: UpdateWorkflowTemplateStatusRequest,
) -> Result<(), String> {
  let service = TemplateService::new();
  service.update_workflow_template_status(
    Path::new(&workspace_path),
    &request.template_id,
    request.status,
  )
}

#[tauri::command]
pub async fn parse_workflow_template(
  workspace_path: String,
  template_id: String,
) -> Result<ParsedWorkflow, String> {
  let service = TemplateService::new();
  service.parse_workflow_template(Path::new(&workspace_path), &template_id)
}

#[tauri::command]
pub async fn compile_workflow_template(
  workspace_path: String,
  template_id: String,
) -> Result<CompiledWorkflow, String> {
  let service = TemplateService::new();
  service.compile_workflow_template(Path::new(&workspace_path), &template_id)
}

#[tauri::command]
pub async fn get_workflow_execution_runtime(
  workspace_path: String,
  task_id: String,
) -> Result<WorkflowExecutionRuntime, String> {
  let service = TemplateService::new();
  service.get_workflow_execution_runtime(Path::new(&workspace_path), &task_id)
}

#[tauri::command]
pub async fn request_workflow_manual_intervention(
  workspace_path: String,
  request: WorkflowExecutionActionRequest,
) -> Result<WorkflowExecutionRuntime, String> {
  let service = TemplateService::new();
  service.request_manual_intervention(
    Path::new(&workspace_path),
    &request.task_id,
    request.reason.as_deref(),
  )
}

#[tauri::command]
pub async fn resume_workflow_execution(
  workspace_path: String,
  request: WorkflowExecutionActionRequest,
) -> Result<WorkflowExecutionRuntime, String> {
  let service = TemplateService::new();
  service.resume_workflow_execution(Path::new(&workspace_path), &request.task_id)
}

#[tauri::command]
pub async fn mark_current_workflow_step_failed(
  workspace_path: String,
  request: WorkflowExecutionActionRequest,
) -> Result<WorkflowExecutionRuntime, String> {
  let service = TemplateService::new();
  service.mark_current_workflow_step_failed(
    Path::new(&workspace_path),
    &request.task_id,
    request.reason.as_deref(),
  )
}

#[tauri::command]
pub async fn advance_workflow_execution_step(
  workspace_path: String,
  request: WorkflowExecutionActionRequest,
) -> Result<WorkflowExecutionRuntime, String> {
  let service = TemplateService::new();
  service.advance_workflow_execution_step(Path::new(&workspace_path), &request.task_id)
}
