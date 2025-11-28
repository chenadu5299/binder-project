use crate::services::tool_service::{ToolService, ToolCall, ToolResult};
use std::path::PathBuf;
use tauri::State;

#[tauri::command]
pub async fn execute_tool(
    tool_call: ToolCall,
    workspace_path: String,
) -> Result<ToolResult, String> {
    let service = ToolService::new();
    let ws_path = PathBuf::from(workspace_path);
    
    service.execute_tool(&tool_call, &ws_path).await
}

#[tauri::command]
pub async fn execute_tool_with_retry(
    tool_call: ToolCall,
    workspace_path: String,
    max_retries: Option<u32>,
) -> Result<ToolResult, String> {
    let service = ToolService::new();
    let ws_path = PathBuf::from(workspace_path);
    let max_retries = max_retries.unwrap_or(3);
    
    let mut last_error: Option<String> = None;
    
    for attempt in 0..=max_retries {
        match service.execute_tool(&tool_call, &ws_path).await {
            Ok(result) => {
                if result.success {
                    return Ok(result);
                }
                last_error = result.error;
                
                // 检查是否可以重试
                if !is_retriable_error(&last_error) || attempt >= max_retries {
                    break;
                }
            }
            Err(e) => {
                last_error = Some(e);
                if attempt >= max_retries {
                    break;
                }
            }
        }
        
        // 指数退避
        let delay_ms = 1000 * (2_u64.pow(attempt));
        tokio::time::sleep(tokio::time::Duration::from_millis(delay_ms)).await;
    }
    
    // 返回失败结果
    Ok(ToolResult {
        success: false,
        data: None,
        error: last_error,
        message: Some("工具调用失败，已重试多次".to_string()),
    })
}

fn is_retriable_error(error: &Option<String>) -> bool {
    if let Some(err) = error {
        let retriable_messages = ["网络错误", "权限不足", "文件被锁定", "超时", "临时"];
        retriable_messages.iter().any(|msg| err.contains(msg))
    } else {
        false
    }
}

