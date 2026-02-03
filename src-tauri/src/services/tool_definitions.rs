// 工具定义服务
use crate::services::ai_providers::ToolDefinition;
use serde_json::json;

// 工具定义（英文版，中文注释）
// 参考void的工具定义方式，使用简洁清晰的描述
pub fn get_tool_definitions() -> Vec<ToolDefinition> {
    vec![
        ToolDefinition {
            name: "read_file".to_string(),
            // 读取文件内容，返回完整内容
            description: "Reads the full contents of a file. Returns the complete file content.".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "The relative path to the file (relative to workspace root)"
                    }
                },
                "required": ["path"]
            }),
        },
        ToolDefinition {
            name: "create_file".to_string(),
            // 创建新文件，支持文本文件和Word文档
            // 重要：Word文档(.docx)使用HTML格式，系统会自动转换
            description: "Creates a new file. Returns an error if the file already exists.\n\nSupported file formats:\n- Text files (.txt, .md, .html, etc.): Write text content directly\n- Word documents (.docx): Can be created! Content should use HTML format (recommended) or Markdown format. The system will automatically convert to standard DOCX format via Pandoc (compatible with Word, WPS, etc.)\n  * If the user requests to create a Word document, use .docx extension directly\n  * Important: Content should use HTML format (e.g., <h1>Title</h1>, <p><strong>Bold</strong></p>, <ul><li>List item</li></ul>, etc.)\n  * Markdown format is also supported, but HTML is recommended for better format compatibility\n  * The system converts HTML to standard DOCX format via Pandoc, consistent with .docx files saved in the Binder editor\n  * Created DOCX files can be opened and edited in the Binder editor, and are compatible with Word, WPS, etc.\n\nImportant: When calling this tool, arguments must be in strict JSON format: all key names and string values must be wrapped in double quotes. Example: {\"path\":\"test.md\",\"content\":\"content\"}. Do not omit quotes.".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "The relative path to the file (relative to workspace root), including file extension (e.g., .txt, .md, .docx, etc.)"
                    },
                    "content": {
                        "type": "string",
                        "description": "File content. For .docx files, you can use Markdown or HTML format, the system will automatically convert"
                    }
                },
                "required": ["path", "content"]
            }),
        },
        ToolDefinition {
            name: "update_file".to_string(),
            // 更新现有文件内容
            description: "Updates the content of an existing file on disk. Returns an error if the file does not exist.\n\n⚠️ IMPORTANT: Do NOT use this tool if the file is currently open in the editor. If the user is viewing/editing a file in the editor, use 'edit_current_editor_document' instead. This tool should only be used for files that are NOT currently open in the editor.\n\nImportant: When calling this tool, arguments must be in strict JSON format: all key names and string values must be wrapped in double quotes. Example: {\"path\":\"test.md\",\"content\":\"# Updated\"}. Do not omit quotes.".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "The relative path to the file (relative to workspace root)"
                    },
                    "content": {
                        "type": "string",
                        "description": "The new file content"
                    }
                },
                "required": ["path", "content"]
            }),
        },
        ToolDefinition {
            name: "delete_file".to_string(),
            // 删除文件或文件夹（需要用户确认）
            description: "Deletes a file or folder. This operation requires user confirmation.".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "The relative path to the file or folder (relative to workspace root)"
                    }
                },
                "required": ["path"]
            }),
        },
        ToolDefinition {
            name: "list_files".to_string(),
            // 列出目录中的文件和子目录
            description: "Lists files and subdirectories in a directory.".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "The relative path to the directory (relative to workspace root). Defaults to root directory if not specified"
                    }
                },
                "required": []
            }),
        },
        ToolDefinition {
            name: "search_files".to_string(),
            // 在工作区中搜索文件（按文件名或路径）
            description: "Searches for files in the workspace. Supports searching by filename or path.".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Search query (part of filename or path)"
                    }
                },
                "required": ["query"]
            }),
        },
        ToolDefinition {
            name: "move_file".to_string(),
            // 移动文件或文件夹到新位置
            description: "Moves a file or folder to a new location.".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "source": {
                        "type": "string",
                        "description": "The relative path to the source file or folder"
                    },
                    "destination": {
                        "type": "string",
                        "description": "The destination path (relative to workspace root)"
                    }
                },
                "required": ["source", "destination"]
            }),
        },
        ToolDefinition {
            name: "rename_file".to_string(),
            // 重命名文件或文件夹
            description: "Renames a file or folder.".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "The current relative path to the file or folder"
                    },
                    "new_name": {
                        "type": "string",
                        "description": "The new filename or folder name"
                    }
                },
                "required": ["path", "new_name"]
            }),
        },
        ToolDefinition {
            name: "create_folder".to_string(),
            // 创建新文件夹（支持多级目录）
            description: "Creates a new folder. Returns an error if the folder already exists. Supports creating multi-level directories.".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "The relative path to the folder (relative to workspace root), e.g., 'src/components' or 'new_folder'"
                    }
                },
                "required": ["path"]
            }),
        },
        ToolDefinition {
            name: "edit_current_editor_document".to_string(),
            // 编辑当前在编辑器中打开的文档（直接修改编辑器内容，需要用户确认）
            description: "⚠️⚠️⚠️ CRITICAL: Use this tool when editing the document currently open in the editor.\n\nThis is the PRIMARY and ONLY tool for editing documents that are currently visible in the editor.\n\nWhen to use:\n- The user wants to edit/modify/update/change/rewrite/improve the document currently visible in the editor\n- The user asks about \"current document\", \"this file\", \"current file\", \"the document\" and wants to edit it\n- The context indicates a file is open in the editor and the user wants to edit it\n- ANY editing request for the currently open document\n\n⚠️ IMPORTANT RULES:\n1. DO NOT call 'read_file' first. This tool already has access to the current content.\n2. DO NOT call 'update_file' for files open in the editor. 'update_file' is ONLY for files NOT currently open.\n3. When the user wants to edit the current document, call this tool DIRECTLY with the new content.\n4. If you need the current content, it will be automatically provided by the system.\n\nWhat this tool does:\n- Automatically retrieves the current content from the editor\n- Calculates the diff between old and new content\n- Shows a diff preview to the user\n- Requires user confirmation before applying changes\n- Modifies the editor content directly (not the file on disk)\n\nImportant: When calling this tool, arguments must be in strict JSON format: all key names and string values must be wrapped in double quotes. Example: {\"content\":\"# New Content\"}. Do not omit quotes.".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "content": {
                        "type": "string",
                        "description": "The new document content. For phrase-level edits (e.g. translate one word), pass ONLY the replacement phrase here, e.g. \"Highly Automated\". For full-document rewrite, pass the complete new content."
                    },
                    "instruction": {
                        "type": "string",
                        "description": "For phrase replacement, use format: 将\"原文\"修改为英文\"译文\" or 将\"X\"改为\"Y\". Example: 将\"高度自动化\"修改为英文\"High Automation\". This ensures only that phrase is replaced."
                    },
                    "target_content": {
                        "type": "string",
                        "description": "Optional. The exact text to be replaced (e.g. selected by user). When provided with short content, only this phrase is replaced. System may auto-fill from user selection."
                    }
                },
                "required": ["content"]
            }),
        },
    ]
}

