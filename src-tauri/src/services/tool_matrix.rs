//! 工具矩阵：结构化工具分类与可见性管理。
//!
//! Phase 2: 替代 `tool_definitions.rs` 中的静态拼装，成为工具定义的主源。
//! 所有工具按 category 分类、按 visibility 控制暴露范围。

use crate::services::ai_providers::ToolDefinition;
use serde_json::json;

/// 工具类别
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ToolCategory {
    /// 文件读取（read_file, list_files, search_files）
    FileRead,
    /// 文件写入（create_file, update_file, delete_file, move_file, rename_file, create_folder）
    FileWrite,
    /// 编辑器交互（edit_current_editor_document）
    EditorEdit,
    /// 元数据（save_file_dependency）
    Metadata,
}

/// 工具可见性——决定工具在哪些模式下暴露给模型
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ToolVisibility {
    /// 所有 agent 模式均可见（默认）
    Always,
    /// 仅在有打开的编辑器文件时可见
    #[allow(dead_code)]
    WhenEditorOpen,
    /// 仅在 build mode 下可见（预留）
    #[allow(dead_code)]
    BuildModeOnly,
}

/// 工具矩阵条目
pub struct ToolMatrixEntry {
    pub category: ToolCategory,
    pub visibility: ToolVisibility,
    pub definition: ToolDefinition,
}

/// 构建完整工具矩阵（主源）
pub fn build_tool_matrix() -> Vec<ToolMatrixEntry> {
    vec![
        ToolMatrixEntry {
            category: ToolCategory::FileRead,
            visibility: ToolVisibility::Always,
            definition: ToolDefinition {
                name: "read_file".to_string(),
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
        },
        ToolMatrixEntry {
            category: ToolCategory::FileRead,
            visibility: ToolVisibility::Always,
            definition: ToolDefinition {
                name: "list_files".to_string(),
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
        },
        ToolMatrixEntry {
            category: ToolCategory::FileRead,
            visibility: ToolVisibility::Always,
            definition: ToolDefinition {
                name: "search_files".to_string(),
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
        },
        ToolMatrixEntry {
            category: ToolCategory::FileWrite,
            visibility: ToolVisibility::Always,
            definition: ToolDefinition {
                name: "create_file".to_string(),
                description: "Creates a new file. Returns an error if the file already exists.\n\nSupported file formats:\n- Text files (.txt, .md, .html, etc.): Write text content directly\n- Word documents (.docx): Can be created! Content should use HTML format (recommended) or Markdown format. The system will automatically convert to standard DOCX format via Pandoc.\n\nImportant: When calling this tool, arguments must be in strict JSON format: all key names and string values must be wrapped in double quotes.".to_string(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "The relative path to the file (relative to workspace root), including file extension"
                        },
                        "content": {
                            "type": "string",
                            "description": "File content. For .docx files, you can use Markdown or HTML format, the system will automatically convert"
                        }
                    },
                    "required": ["path", "content"]
                }),
            },
        },
        ToolMatrixEntry {
            category: ToolCategory::FileWrite,
            visibility: ToolVisibility::Always,
            definition: ToolDefinition {
                name: "update_file".to_string(),
                description: "Updates the content of an existing file on disk. Returns an error if the file does not exist.\n\n⚠️ IMPORTANT: Do NOT use this tool if the file is currently open in the editor. Use 'edit_current_editor_document' instead.\n\nImportant: Arguments must be in strict JSON format.".to_string(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "The relative path to the file (relative to workspace root)"
                        },
                        "content": {
                            "type": "string",
                            "description": "The new file content. For .docx files, MUST be HTML, NOT markdown."
                        },
                        "use_diff": {
                            "type": "boolean",
                            "description": "If true, generate pending diffs instead of writing directly."
                        }
                    },
                    "required": ["path", "content"]
                }),
            },
        },
        ToolMatrixEntry {
            category: ToolCategory::FileWrite,
            visibility: ToolVisibility::Always,
            definition: ToolDefinition {
                name: "delete_file".to_string(),
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
        },
        ToolMatrixEntry {
            category: ToolCategory::FileWrite,
            visibility: ToolVisibility::Always,
            definition: ToolDefinition {
                name: "move_file".to_string(),
                description: "Moves a file or folder to a new location.".to_string(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "source": { "type": "string", "description": "The relative path to the source file or folder" },
                        "destination": { "type": "string", "description": "The destination path (relative to workspace root)" }
                    },
                    "required": ["source", "destination"]
                }),
            },
        },
        ToolMatrixEntry {
            category: ToolCategory::FileWrite,
            visibility: ToolVisibility::Always,
            definition: ToolDefinition {
                name: "rename_file".to_string(),
                description: "Renames a file or folder.".to_string(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "The current relative path to the file or folder" },
                        "new_name": { "type": "string", "description": "The new filename or folder name" }
                    },
                    "required": ["path", "new_name"]
                }),
            },
        },
        ToolMatrixEntry {
            category: ToolCategory::FileWrite,
            visibility: ToolVisibility::Always,
            definition: ToolDefinition {
                name: "create_folder".to_string(),
                description: "Creates a new folder. Supports creating multi-level directories.".to_string(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "The relative path to the folder (relative to workspace root)" }
                    },
                    "required": ["path"]
                }),
            },
        },
        ToolMatrixEntry {
            category: ToolCategory::EditorEdit,
            visibility: ToolVisibility::Always,
            definition: ToolDefinition {
                name: "edit_current_editor_document".to_string(),
                description: "Edit the document currently open in the editor. This is the ONLY tool for editing open files.\n\nDo NOT call read_file before this tool — current content is provided automatically.\nDo NOT use update_file for open files.\n\nProtocol (frozen):\n- Model fields: edit_mode, block_index, target, content, occurrence_index\n- System-injected fields: current_file, current_content, document_revision, baseline_id, _sel_start_block_id, _sel_start_offset, _sel_end_block_id, _sel_end_offset, _sel_text, cursor_block_id, cursor_offset\n\nRequired fields: edit_mode + block_index (except rewrite_document).\n  edit_mode: replace | delete | insert | rewrite_block | rewrite_document\n  block_index: 0-based index from [文档块列表] in context.\n  target: exact plain text from the block (no HTML tags).\n  content: replacement or insertion text.\n  occurrence_index: when target appears multiple times in the block, specifies which one (0-based).\n\nChanges are shown as diff preview and require user confirmation.".to_string(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "edit_mode": { "type": "string", "description": "Required. replace | delete | insert | rewrite_block | rewrite_document." },
                        "block_index": { "type": "integer", "description": "Block number (0-based) from the [文档块列表] in context." },
                        "target": { "type": "string", "description": "Exact plain text to find within the block (no HTML tags)." },
                        "content": { "type": "string", "description": "Replacement or insertion text." },
                        "occurrence_index": { "type": "integer", "description": "Which occurrence to edit (0-based). Defaults to 0." }
                    },
                    "required": ["edit_mode"],
                    "additionalProperties": false
                }),
            },
        },
        ToolMatrixEntry {
            category: ToolCategory::Metadata,
            visibility: ToolVisibility::Always,
            definition: ToolDefinition {
                name: "save_file_dependency".to_string(),
                description: "Saves a file dependency relationship. Dependency type: 'references', 'template', 'generated', or 'sync'.".to_string(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "source_path": { "type": "string", "description": "The source file path (relative to workspace)" },
                        "target_path": { "type": "string", "description": "The target file path (relative to workspace)" },
                        "dependency_type": { "type": "string", "description": "Type: references, template, generated, or sync" },
                        "description": { "type": "string", "description": "Optional description of the dependency" }
                    },
                    "required": ["source_path", "target_path", "dependency_type"]
                }),
            },
        },
    ]
}

/// 从矩阵中提取 ToolDefinition 列表（兼容旧接口）
pub fn definitions_from_matrix() -> Vec<ToolDefinition> {
    build_tool_matrix()
        .into_iter()
        .filter(|e| e.visibility == ToolVisibility::Always)
        .map(|e| e.definition)
        .collect()
}
