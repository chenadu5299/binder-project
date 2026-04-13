// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(
  all(not(debug_assertions), target_os = "windows"),
  windows_subsystem = "windows"
)]

mod commands;
mod models;
mod services;
mod utils;
mod workspace;

use services::ai_service::AIService;
use services::file_watcher::FileWatcherService;
use std::sync::{Arc, Mutex};
use tauri::Manager;

fn main() {
  // 初始化 AI 服务
  let ai_service = Arc::new(Mutex::new(AIService::new().unwrap_or_else(|e| {
    eprintln!("初始化 AI 服务失败: {}，使用默认配置", e);
    // 尝试使用默认配置创建服务
    AIService::new().unwrap_or_else(|_| {
      eprintln!("警告: 无法创建 AI 服务，某些功能可能不可用");
      panic!("AI 服务初始化失败")
    })
  })));

  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .manage(Mutex::new(FileWatcherService::new()))
    .manage(ai_service)
    .setup(|app| {
      // 确保窗口显示
      if let Some(window) = app.get_webview_window("main") {
        window.show().unwrap_or_else(|e| {
          eprintln!("显示窗口失败: {}", e);
        });
        window.set_focus().unwrap_or_else(|e| {
          eprintln!("聚焦窗口失败: {}", e);
        });

        // 默认不自动打开开发者工具，需要时可手动打开（如 F12 或右键）
      } else {
        eprintln!("警告: 无法获取主窗口");
      }
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      commands::file_commands::build_file_tree,
      commands::file_commands::read_file_content,
      commands::file_commands::read_file_as_base64,
      commands::file_commands::write_file,
      commands::file_commands::create_file,
      commands::file_commands::create_folder,
      commands::file_commands::open_workspace_dialog,
      commands::file_commands::load_workspaces,
      commands::file_commands::open_workspace,
      commands::file_commands::check_external_modification,
      commands::file_commands::get_file_modified_time,
      commands::file_commands::get_file_size,
      commands::file_commands::move_file_to_workspace,
      commands::file_commands::move_file,
      commands::file_commands::rename_file,
      commands::file_commands::delete_file,
      commands::file_commands::duplicate_file,
      commands::file_commands::check_pandoc_available,
      commands::file_commands::open_docx_for_edit,
      commands::file_commands::preview_docx_as_pdf,
      commands::file_commands::preview_excel_as_pdf,
      commands::file_commands::preview_presentation_as_pdf,
      commands::file_commands::create_draft_docx,
      commands::file_commands::create_draft_file,
      commands::file_commands::save_docx,
      commands::file_commands::list_folder_files,
      commands::file_commands::save_external_file,
      commands::file_commands::cleanup_temp_files,
      commands::file_commands::cleanup_expired_temp_files,
      commands::file_commands::cleanup_all_temp_files,
      commands::file_commands::record_binder_file,
      commands::file_commands::get_binder_file_source,
      commands::file_commands::remove_binder_file_record,
      commands::file_commands::clear_preview_cache,
      commands::image_commands::insert_image,
      commands::image_commands::check_image_exists,
      commands::image_commands::delete_image,
      commands::image_commands::save_chat_image,
      commands::ai_commands::ai_autocomplete,
      commands::ai_commands::ai_inline_assist,
      commands::ai_commands::ai_chat_stream,
      commands::ai_commands::chat_build_generate_outline,
      commands::positioning_snapshot::positioning_submit_editor_snapshot,
      commands::ai_commands::ai_save_api_key,
      commands::ai_commands::ai_get_api_key,
      commands::ai_commands::ai_cancel_request,
      commands::ai_commands::ai_cancel_chat_stream,
      commands::ai_commands::ai_analyze_document,
      commands::search_commands::search_documents,
      commands::search_commands::index_document,
      commands::search_commands::remove_document_index,
      commands::search_commands::build_index_async,
      commands::memory_commands::mark_orphan_tab_memories_stale,
      commands::memory_commands::search_memories_cmd,
      commands::memory_commands::on_tab_deleted_cmd,
      commands::memory_commands::startup_memory_maintenance,
      commands::memory_commands::expire_memory_item,
      commands::memory_commands::expire_memory_layer,
      commands::memory_commands::get_memory_user_data,
      commands::knowledge_commands::ingest_knowledge_document,
      commands::knowledge_commands::replace_knowledge_document,
      commands::knowledge_commands::upsert_workspace_snapshot_to_knowledge,
      commands::knowledge_commands::delete_knowledge_entry,
      commands::knowledge_commands::rename_knowledge_entry,
      commands::knowledge_commands::move_knowledge_entry,
      commands::knowledge_commands::query_knowledge_base,
      commands::knowledge_commands::rebuild_knowledge_entry,
      commands::knowledge_commands::retry_knowledge_entry,
      commands::knowledge_commands::update_knowledge_verification,
      commands::knowledge_commands::update_knowledge_entry_policy,
      commands::knowledge_commands::list_knowledge_entries,
      commands::classifier_commands::classify_files,
      commands::classifier_commands::organize_files,
      commands::tool_commands::execute_tool,
      commands::tool_commands::execute_tool_with_retry,
      commands::template_commands::create_workflow_template,
      commands::template_commands::list_workflow_templates,
      commands::template_commands::load_workflow_template,
      commands::template_commands::save_workflow_template_document,
      commands::template_commands::update_workflow_template_status,
      commands::template_commands::parse_workflow_template,
      commands::template_commands::compile_workflow_template,
      commands::template_commands::get_workflow_execution_runtime,
      commands::template_commands::request_workflow_manual_intervention,
      commands::template_commands::resume_workflow_execution,
      commands::template_commands::mark_current_workflow_step_failed,
      commands::template_commands::advance_workflow_execution_step,
      workspace::workspace_commands::open_file_with_cache,
      workspace::workspace_commands::open_docx_with_cache,
      workspace::workspace_commands::ai_edit_file_with_diff,
      workspace::workspace_commands::accept_file_diffs,
      workspace::workspace_commands::reject_file_diffs,
      workspace::workspace_commands::sync_workspace_file_cache_after_save,
      workspace::workspace_commands::record_saved_file_timeline_node,
      workspace::workspace_commands::list_timeline_nodes,
      workspace::workspace_commands::get_timeline_restore_preview,
      workspace::workspace_commands::restore_timeline_node,
      workspace::workspace_commands::get_file_dependencies,
      workspace::workspace_commands::save_file_dependency,
      workspace::workspace_commands::upsert_agent_task,
      workspace::workspace_commands::update_agent_task_stage,
      workspace::workspace_commands::get_agent_tasks_for_chat_tab,
      workspace::workspace_commands::upsert_agent_artifact,
      workspace::workspace_commands::get_agent_artifacts_for_task,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
