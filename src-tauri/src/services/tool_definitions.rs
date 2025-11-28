// 工具定义服务
use crate::services::ai_providers::ToolDefinition;
use serde_json::json;

pub fn get_tool_definitions() -> Vec<ToolDefinition> {
    vec![
        ToolDefinition {
            name: "read_file".to_string(),
            description: "读取文件内容。返回文件的完整内容。".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "文件的相对路径（相对于工作区根目录）"
                    }
                },
                "required": ["path"]
            }),
        },
        ToolDefinition {
            name: "create_file".to_string(),
            description: "创建新文件。如果文件已存在，将返回错误。\n\n重要：调用此工具时，arguments 必须是严格的 JSON 格式：所有键名和字符串值必须用双引号包裹。例如：{\"path\":\"test.md\",\"content\":\"# Hello\"}。不要省略引号。".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "文件的相对路径（相对于工作区根目录）"
                    },
                    "content": {
                        "type": "string",
                        "description": "文件内容"
                    }
                },
                "required": ["path", "content"]
            }),
        },
        ToolDefinition {
            name: "update_file".to_string(),
            description: "更新现有文件的内容。如果文件不存在，将返回错误。\n\n重要：调用此工具时，arguments 必须是严格的 JSON 格式：所有键名和字符串值必须用双引号包裹。例如：{\"path\":\"test.md\",\"content\":\"# Updated\"}。不要省略引号。".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "文件的相对路径（相对于工作区根目录）"
                    },
                    "content": {
                        "type": "string",
                        "description": "新的文件内容"
                    }
                },
                "required": ["path", "content"]
            }),
        },
        ToolDefinition {
            name: "delete_file".to_string(),
            description: "删除文件或文件夹。".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "文件或文件夹的相对路径（相对于工作区根目录）"
                    }
                },
                "required": ["path"]
            }),
        },
        ToolDefinition {
            name: "list_files".to_string(),
            description: "列出目录中的文件和子目录。".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "目录的相对路径（相对于工作区根目录），默认为根目录"
                    }
                },
                "required": []
            }),
        },
        ToolDefinition {
            name: "search_files".to_string(),
            description: "在工作区中搜索文件。支持按文件名或路径搜索。".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "搜索查询（文件名或路径的一部分）"
                    }
                },
                "required": ["query"]
            }),
        },
        ToolDefinition {
            name: "move_file".to_string(),
            description: "移动文件或文件夹到新位置。".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "source": {
                        "type": "string",
                        "description": "源文件或文件夹的相对路径"
                    },
                    "destination": {
                        "type": "string",
                        "description": "目标路径（相对于工作区根目录）"
                    }
                },
                "required": ["source", "destination"]
            }),
        },
        ToolDefinition {
            name: "rename_file".to_string(),
            description: "重命名文件或文件夹。".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "文件或文件夹的当前相对路径"
                    },
                    "new_name": {
                        "type": "string",
                        "description": "新的文件名或文件夹名"
                    }
                },
                "required": ["path", "new_name"]
            }),
        },
        ToolDefinition {
            name: "create_folder".to_string(),
            description: "创建新文件夹。如果文件夹已存在，将返回错误。支持创建多级目录。".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "文件夹的相对路径（相对于工作区根目录），例如 'src/components' 或 'new_folder'"
                    }
                },
                "required": ["path"]
            }),
        },
        ToolDefinition {
            name: "edit_current_editor_document".to_string(),
            description: "编辑当前在编辑器中打开的文档。这个工具会直接修改编辑器中的内容，而不是文件系统中的文件。此操作需要用户确认。\n\n重要：调用此工具时，arguments 必须是严格的 JSON 格式：所有键名和字符串值必须用双引号包裹。例如：{\"content\":\"# New Content\"}。不要省略引号。".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "content": {
                        "type": "string",
                        "description": "新的文档内容（完整内容）"
                    },
                    "instruction": {
                        "type": "string",
                        "description": "可选的修改说明"
                    }
                },
                "required": ["content"]
            }),
        },
    ]
}

