// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

mod commands;
mod models;
mod services;
mod utils;

use tauri::Manager;
use services::file_watcher::FileWatcherService;
use services::ai_service::AIService;
use std::sync::{Arc, Mutex};

fn main() {
    // 初始化 AI 服务
    let ai_service = Arc::new(Mutex::new(
        AIService::new().unwrap_or_else(|e| {
            eprintln!("初始化 AI 服务失败: {}，使用默认配置", e);
            // 尝试使用默认配置创建服务
            AIService::new().unwrap_or_else(|_| {
                eprintln!("警告: 无法创建 AI 服务，某些功能可能不可用");
                panic!("AI 服务初始化失败")
            })
        })
    ));
    
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
                
                // 在开发模式下打开开发者工具
                #[cfg(debug_assertions)]
                {
                    window.open_devtools();
                }
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
            commands::file_commands::move_file_to_workspace,
            commands::file_commands::rename_file,
            commands::file_commands::delete_file,
            commands::file_commands::duplicate_file,
            commands::image_commands::insert_image,
            commands::image_commands::check_image_exists,
            commands::image_commands::delete_image,
            commands::image_commands::save_chat_image,
            commands::ai_commands::ai_autocomplete,
            commands::ai_commands::ai_inline_assist,
            commands::ai_commands::ai_chat_stream,
            commands::ai_commands::ai_save_api_key,
            commands::ai_commands::ai_get_api_key,
            commands::ai_commands::ai_cancel_request,
            commands::ai_commands::ai_analyze_document,
            commands::search_commands::search_documents,
            commands::search_commands::index_document,
            commands::search_commands::remove_document_index,
            commands::search_commands::build_index_async,
            commands::memory_commands::add_memory,
            commands::memory_commands::get_document_memories,
            commands::memory_commands::search_memories,
            commands::memory_commands::delete_memory,
            commands::memory_commands::get_all_memories,
            commands::memory_commands::check_memory_consistency,
            commands::classifier_commands::classify_files,
            commands::classifier_commands::organize_files,
            commands::tool_commands::execute_tool,
            commands::tool_commands::execute_tool_with_retry,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

