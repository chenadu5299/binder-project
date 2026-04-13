// 工具定义服务
// Phase 2: 主源已迁移到 tool_matrix.rs，此处为兼容入口。
use crate::services::ai_providers::ToolDefinition;
use serde_json::json;

/// 兼容入口：从 tool_matrix 获取工具定义。
/// 旧静态定义保留在 `get_tool_definitions_legacy` 中作为参照。
pub fn get_tool_definitions() -> Vec<ToolDefinition> {
  crate::services::tool_matrix::definitions_from_matrix()
}

/// 旧静态定义（保留用于参照与回退，不再作为主源）
#[allow(dead_code)]
fn get_tool_definitions_legacy() -> Vec<ToolDefinition> {
  vec![
        ToolDefinition {
            name: "read_file".to_string(),
            // 读取文件内容，返回完整内容（问题5：DOCX 与编辑器缓存一致）
            description: "Reads the full contents of a file. Returns the complete file content.\n\nFor .docx files: the tool returns Pandoc-converted HTML/text. For editing with `update_file`+use_diff, the server compares against workspace file_cache HTML (same source as the Binder editor). Do not mix markdown with HTML for docx edits; `read_file` output may differ slightly from cache—when unsure, rely on `current_editor_content` if the file is open.".to_string(),
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
                        "description": "The new file content. For .docx files, MUST be HTML (paragraphs as <p>, headings as <h1>…), NOT markdown, so diffs align with editor. For .md/.txt use plain text."
                    },
                    "use_diff": {
                        "type": "boolean",
                        "description": "If true, generate pending diffs instead of writing directly. User must confirm before disk write. Use for files NOT currently open in editor."
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
            description: "Edit the document currently open in the editor. This is the ONLY tool for editing open files.\n\nDo NOT call read_file before this tool — current content is provided automatically.\nDo NOT use update_file for open files.\n\nProtocol (frozen):\n- Model fields: edit_mode, block_index, target, content, occurrence_index\n- System-injected fields: current_file, current_content, document_revision, baseline_id, _sel_start_block_id, _sel_start_offset, _sel_end_block_id, _sel_end_offset, _sel_text, cursor_block_id, cursor_offset\n\nRequired fields: edit_mode + block_index (except rewrite_document).\n  edit_mode: replace | delete | insert | rewrite_block | rewrite_document\n  block_index: 0-based index from [文档块列表] in context. Required unless edit_mode=rewrite_document.\n  target: exact plain text from the block (no HTML tags). Required for replace/delete/insert.\n  content: replacement or insertion text. Required for replace/insert/rewrite_block/rewrite_document.\n  occurrence_index: when target appears multiple times in the block, specifies which one (0-based, default 0).\n\nChanges are shown as diff preview and require user confirmation before applying.\n\nblock_index comes from [文档块列表] in context (0-based). Required unless edit_mode=rewrite_document.\ntarget must exactly match the plain text shown in the block. No HTML tags.\nIf block-level text search fails, the system automatically falls back to full-block replacement.".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "edit_mode": {
                        "type": "string",
                        "description": "Required. replace | delete | insert | rewrite_block | rewrite_document."
                    },
                    "block_index": {
                        "type": "integer",
                        "description": "Block number (0-based) from the [文档块列表] in context. Required for all edit_mode values except rewrite_document."
                    },
                    "target": {
                        "type": "string",
                        "description": "Exact plain text to find within the block (no HTML tags). Required for replace/delete/insert."
                    },
                    "content": {
                        "type": "string",
                        "description": "Replacement or insertion text. Required for replace/insert/rewrite_block/rewrite_document. Omit for delete."
                    },
                    "occurrence_index": {
                        "type": "integer",
                        "description": "When the same target text appears multiple times within a block, specifies which occurrence to edit (0-based). Defaults to 0."
                    }
                },
                "required": ["edit_mode"],
                "additionalProperties": false
            }),
        },
        ToolDefinition {
            name: "save_file_dependency".to_string(),
            description: "Saves a file dependency relationship. Use when user says 'sync these files', 'these files are related', or when you infer that modifying source_path affects target_path. Dependency type: 'references' (source imports/includes target), 'template' (target is template for source), 'generated' (source generates target), or 'sync' (changes should propagate).".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "source_path": {
                        "type": "string",
                        "description": "The source file path (relative to workspace)"
                    },
                    "target_path": {
                        "type": "string",
                        "description": "The target file path (relative to workspace)"
                    },
                    "dependency_type": {
                        "type": "string",
                        "description": "Type: references, template, generated, or sync"
                    },
                    "description": {
                        "type": "string",
                        "description": "Optional description of the dependency"
                    }
                },
                "required": ["source_path", "target_path", "dependency_type"]
            }),
        },
    ]
}
