# ProseMirror Decoration 文档编辑完整方案

## 一、方案概述

基于 ProseMirror Decoration 的文档编辑 Diff 系统，支持文本、表格、图片、代码块等多种元素类型的精确编辑。

### 核心设计理念

- **定位-Diff渲染-用户确认-应用修改**：不是简单的"定位-修改-返回"
- **Decoration 不修改文档**：只是视觉层标记，用户确认后才真正修改
- **多策略匹配**：提高定位准确性
- **按元素类型分别处理**：不同元素使用不同的 Diff 策略

## 二、系统架构

### 2.1 三层架构

```
┌─────────────────────────────────────┐
│         AI 识别层                    │
│  - 识别修改意图                      │
│  - 提取目标内容                      │
│  - 生成修改建议                      │
│  - 返回结构化数据                    │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│         Diff 渲染层                  │
│  - 计算修改差异                      │
│  - 生成 Diff 标记                    │
│  - 渲染到编辑器                      │
│  - 保持原格式                        │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│        用户交互层                     │
│  - 接受/拒绝修改                     │
│  - 逐行确认                          │
│  - 撤销/重做                         │
│  - 批量操作                          │
└─────────────────────────────────────┘
```

### 2.2 完整工作流程

1. **AI 分析与定位**：用户输入 → AI 理解意图 → 返回修改建议
2. **内容匹配与定位**：多策略匹配 → 找到目标节点 → 计算 ProseMirror 位置
3. **Diff 计算**：根据元素类型选择 Diff 算法
4. **Decoration 渲染**：生成 Decoration → 应用到编辑器 → 不修改文档
5. **用户交互**：显示接受/拒绝按钮 → 用户选择 → 执行修改

## 三、后端实现

### 3.1 工具定义（Rust）

```rust
// src-tauri/src/services/tool_definitions.rs

pub fn get_tool_definitions() -> Vec<ToolDefinition> {
    vec![
        ToolDefinition {
            name: "edit_current_editor_document".to_string(),
            description: r#"
编辑当前在编辑器中打开的文档。

⚠️ 关键：你必须识别用户意图中的目标内容，并在文档中找到对应的位置。

参数说明：
- content: 完整的新文档内容（必需）
- target_content: 要修改的目标内容（可选，用于帮助定位）
- context_before: 目标内容前面的上下文（可选，用于精确匹配）
- context_after: 目标内容后面的上下文（可选，用于精确匹配）
- element_type: 元素类型（可选：text, table, image, code_block）
- element_identifier: 元素标识符（可选，用于表格、图片等复杂元素）

返回格式：
{
  "success": true,
  "data": {
    "diff_area_id": "diff_area_xxx",
    "file_path": "/path/to/file",
    "old_content": "...",
    "new_content": "...",
    "diffs": [
      {
        "diff_id": "diff_xxx",
        "diff_type": "Edit|Insertion|Deletion",
        "original_code": "...",
        "new_code": "...",
        "original_start_line": 10,
        "original_end_line": 12,
        "context_before": "...",
        "context_after": "...",
        "element_type": "text|table|image|code_block",
        "element_identifier": "table_1|image_1|..."
      }
    ]
  }
}
"#.to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "content": {
                        "type": "string",
                        "description": "完整的新文档内容"
                    },
                    "target_content": {
                        "type": "string",
                        "description": "要修改的目标内容（可选，用于帮助定位）"
                    },
                    "context_before": {
                        "type": "string",
                        "description": "目标内容前面的上下文（可选，50-100字符）"
                    },
                    "context_after": {
                        "type": "string",
                        "description": "目标内容后面的上下文（可选，50-100字符）"
                    },
                    "element_type": {
                        "type": "string",
                        "enum": ["text", "table", "image", "code_block"],
                        "description": "元素类型（可选）"
                    },
                    "element_identifier": {
                        "type": "string",
                        "description": "元素标识符（可选，用于表格、图片等复杂元素）"
                    }
                },
                "required": ["content"]
            }),
        },
        // ... 其他工具定义
    ]
}
```

### 3.2 Diff 服务（Rust）

```rust
// src-tauri/src/services/diff_service.rs

use similar::{ChangeTag, TextDiff};

pub struct DiffService;

impl DiffService {
    pub fn new() -> Self {
        Self
    }

    /// 计算文档 Diff
    pub fn calculate_diff(
        &self,
        old_content: &str,
        new_content: &str,
    ) -> Result<Vec<Diff>, String> {
        let diff = TextDiff::from_lines(old_content, new_content);
        let mut diffs = Vec::new();

        for (idx, group) in diff.grouped_ops(3).iter().enumerate() {
            let diff_id = format!("diff_{}", uuid::Uuid::new_v4());
            
            // 计算原始内容的行号范围
            let mut old_start_line = 1;
            let mut old_end_line = 1;
            let mut new_start_line = 1;
            let mut new_end_line = 1;

            for op in group {
                match op.tag() {
                    ChangeTag::Equal => {
                        // 跳过未修改的部分
                        old_start_line += op.old_len();
                        new_start_line += op.new_len();
                    }
                    ChangeTag::Delete => {
                        old_end_line = old_start_line + op.old_len();
                    }
                    ChangeTag::Insert => {
                        new_end_line = new_start_line + op.new_len();
                    }
                    ChangeTag::Replace => {
                        old_end_line = old_start_line + op.old_len();
                        new_end_line = new_start_line + op.new_len();
                    }
                }
            }

            // 提取上下文
            let context_before = self.extract_context_before(
                old_content,
                old_start_line,
                50,
            );
            let context_after = self.extract_context_after(
                old_content,
                old_end_line,
                50,
            );

            // 提取原始代码和新代码
            let original_code = self.extract_lines(
                old_content,
                old_start_line,
                old_end_line,
            );
            let new_code = self.extract_lines(
                new_content,
                new_start_line,
                new_end_line,
            );

            // 确定 Diff 类型
            let diff_type = match group[0].tag() {
                ChangeTag::Delete => "Deletion",
                ChangeTag::Insert => "Insertion",
                ChangeTag::Replace => "Edit",
                _ => "Edit",
            };

            diffs.push(Diff {
                diff_id,
                diff_area_id: String::new(), // 将在 tool_service 中设置
                diff_type: diff_type.to_string(),
                original_code,
                original_start_line: old_start_line,
                original_end_line: old_end_line,
                new_code,
                start_line: new_start_line,
                end_line: new_end_line,
                context_before: Some(context_before),
                context_after: Some(context_after),
                element_type: None, // 将在前端识别
                element_identifier: None,
            });
        }

        Ok(diffs)
    }

    /// 提取上下文（前面）
    fn extract_context_before(
        &self,
        content: &str,
        line: usize,
        chars: usize,
    ) -> String {
        let lines: Vec<&str> = content.lines().collect();
        if line == 0 || line > lines.len() {
            return String::new();
        }

        let start_line = if line > 3 { line - 3 } else { 0 };
        let context: String = lines[start_line..line - 1]
            .join("\n")
            .chars()
            .rev()
            .take(chars)
            .collect::<String>()
            .chars()
            .rev()
            .collect();

        context
    }

    /// 提取上下文（后面）
    fn extract_context_after(
        &self,
        content: &str,
        line: usize,
        chars: usize,
    ) -> String {
        let lines: Vec<&str> = content.lines().collect();
        if line > lines.len() {
            return String::new();
        }

        let end_line = std::cmp::min(line + 3, lines.len());
        let context: String = lines[line..end_line]
            .join("\n")
            .chars()
            .take(chars)
            .collect();

        context
    }

    /// 提取指定行范围的内容
    fn extract_lines(
        &self,
        content: &str,
        start_line: usize,
        end_line: usize,
    ) -> String {
        let lines: Vec<&str> = content.lines().collect();
        if start_line == 0 || start_line > lines.len() {
            return String::new();
        }

        let end = std::cmp::min(end_line, lines.len());
        lines[start_line - 1..end].join("\n")
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Diff {
    pub diff_id: String,
    pub diff_area_id: String,
    pub diff_type: String, // "Edit" | "Insertion" | "Deletion"
    pub original_code: String,
    pub original_start_line: usize,
    pub original_end_line: usize,
    pub new_code: String,
    pub start_line: usize,
    pub end_line: usize,
    pub context_before: Option<String>,
    pub context_after: Option<String>,
    pub element_type: Option<String>, // "text" | "table" | "image" | "code_block"
    pub element_identifier: Option<String>, // 用于表格、图片等
}
```

### 3.3 工具服务实现（Rust）

```rust
// src-tauri/src/services/tool_service.rs

impl ToolService {
    /// 编辑当前编辑器打开的文档
    pub async fn edit_current_editor_document(
        &self,
        tool_call: &ToolCall,
    ) -> Result<ToolResult, String> {
        eprintln!("📝 [edit_current_editor_document] 开始处理文档编辑请求");

        // 1. 获取当前编辑器内容
        let current_file = tool_call
            .arguments
            .get("current_file")
            .and_then(|v| v.as_str())
            .ok_or_else(|| "缺少 current_file 参数".to_string())?;

        let current_content = tool_call
            .arguments
            .get("current_content")
            .and_then(|v| v.as_str())
            .ok_or_else(|| "缺少 current_content 参数".to_string())?;

        // 2. 获取新内容
        let new_content = tool_call
            .arguments
            .get("content")
            .and_then(|v| v.as_str())
            .ok_or_else(|| "缺少 content 参数".to_string())?;

        // 3. 获取可选参数
        let target_content = tool_call
            .arguments
            .get("target_content")
            .and_then(|v| v.as_str());
        let context_before = tool_call
            .arguments
            .get("context_before")
            .and_then(|v| v.as_str());
        let context_after = tool_call
            .arguments
            .get("context_after")
            .and_then(|v| v.as_str());
        let element_type = tool_call
            .arguments
            .get("element_type")
            .and_then(|v| v.as_str());
        let element_identifier = tool_call
            .arguments
            .get("element_identifier")
            .and_then(|v| v.as_str());

        eprintln!("📝 [edit_current_editor_document] 参数:", {
            current_file,
            current_content_len: current_content.len(),
            new_content_len: new_content.len(),
            has_target: target_content.is_some(),
            has_context: context_before.is_some() || context_after.is_some(),
            element_type,
        });

        // 4. 计算 Diff
        let diff_service = DiffService::new();
        let mut diffs = diff_service
            .calculate_diff(current_content, new_content)
            .map_err(|e| format!("计算 diff 失败: {}", e))?;

        // 5. 如果提供了上下文，增强 diff 信息
        if let (Some(ctx_before), Some(ctx_after)) = (context_before, context_after) {
            for diff in &mut diffs {
                if diff.context_before.is_none() {
                    diff.context_before = Some(ctx_before.to_string());
                }
                if diff.context_after.is_none() {
                    diff.context_after = Some(ctx_after.to_string());
                }
            }
        }

        // 6. 如果提供了元素类型，设置到 diff 中
        if let Some(elem_type) = element_type {
            for diff in &mut diffs {
                diff.element_type = Some(elem_type.to_string());
                if let Some(identifier) = element_identifier {
                    diff.element_identifier = Some(identifier.to_string());
                }
            }
        }

        // 7. 生成 diff_area_id
        let diff_area_id = format!("diff_area_{}", uuid::Uuid::new_v4());
        for diff in &mut diffs {
            diff.diff_area_id = diff_area_id.clone();
        }

        // 8. 返回结果
        let result = ToolResult {
            success: true,
            data: Some(json!({
                "diff_area_id": diff_area_id,
                "file_path": current_file,
                "old_content": current_content,
                "new_content": new_content,
                "diffs": diffs,
            })),
            error: None,
            message: Some("文档编辑已准备，请查看预览".to_string()),
        };

        eprintln!("✅ [edit_current_editor_document] 文档编辑处理完成");
        Ok(result)
    }
}
```

### 3.4 AI 命令处理（Rust）

```rust
// src-tauri/src/commands/ai_commands.rs

#[tauri::command]
pub async fn ai_chat_stream(
    // ... 其他参数
    current_file: Option<String>,
    selected_text: Option<String>,
    current_editor_content: Option<String>,
) -> Result<(), String> {
    // ... 前面的代码

    // ⚠️ 关键：拦截 edit_current_editor_document 工具调用
    if tool_call.name == "edit_current_editor_document" {
        // 注入当前编辑器信息
        tool_call.arguments.insert(
            "current_file".to_string(),
            json!(current_file.unwrap_or_default()),
        );
        tool_call.arguments.insert(
            "current_content".to_string(),
            json!(current_editor_content.unwrap_or_default()),
        );
        
        // 如果 AI 没有提供上下文，尝试从工具调用中提取
        if !tool_call.arguments.contains_key("context_before") {
            if let Some(target) = tool_call.arguments.get("target_content") {
                // 尝试从当前内容中提取上下文
                if let Some(ctx) = extract_context(current_editor_content.as_deref(), target.as_str()) {
                    tool_call.arguments.insert("context_before".to_string(), json!(ctx.before));
                    tool_call.arguments.insert("context_after".to_string(), json!(ctx.after));
                }
            }
        }
    }

    // ... 执行工具调用
}

/// 从内容中提取上下文
fn extract_context(content: Option<&str>, target: &str) -> Option<Context> {
    let content = content?;
    let target_index = content.find(target)?;
    
    let start = target_index.saturating_sub(50);
    let end = std::cmp::min(target_index + target.len() + 50, content.len());
    
    Some(Context {
        before: content[start..target_index].to_string(),
        after: content[target_index + target.len()..end].to_string(),
    })
}
```

## 四、AI 交互细节

### 4.1 AI 返回数据结构

```typescript
// 前端期望的 AI 返回格式

interface AIResponse {
  modifications: Modification[];
}

interface Modification {
  id: string;
  type: 'text_replace' | 'table_cell' | 'image_replace' | 'code_block_replace';
  target: {
    content: string; // 目标内容
    context_before?: string; // 前面的上下文
    context_after?: string; // 后面的上下文
    element_type?: 'text' | 'table' | 'image' | 'code_block';
    element_identifier?: string; // 表格ID、图片URL等
  };
  old: string; // 旧内容
  new: string; // 新内容
  confidence?: number; // 置信度（0-1）
}
```

### 4.2 AI 工具调用格式

```json
{
  "name": "edit_current_editor_document",
  "arguments": {
    "content": "完整的新文档内容",
    "target_content": "要修改的目标内容（可选）",
    "context_before": "前面的上下文（可选，50-100字符）",
    "context_after": "后面的上下文（可选，50-100字符）",
    "element_type": "text|table|image|code_block（可选）",
    "element_identifier": "元素标识符（可选）"
  }
}
```

### 4.3 AI 提示词增强

```rust
// src-tauri/src/services/context_manager.rs

pub fn build_context_prompt(&self, context: &ContextInfo) -> String {
    let mut prompt = String::new();
    
    // 当前文档信息
    if let Some(file) = &context.current_file {
        prompt.push_str(&format!(
            "⚠️⚠️⚠️ CRITICAL: The user is currently viewing/editing this file: {}\n",
            file
        ));
        prompt.push_str("When editing this document, you should:\n");
        prompt.push_str("1. Use 'edit_current_editor_document' tool\n");
        prompt.push_str("2. Provide 'context_before' and 'context_after' for accurate positioning\n");
        prompt.push_str("3. Specify 'element_type' if editing tables, images, or code blocks\n");
        prompt.push_str("4. Return structured modification data\n\n");
    }
    
    // ... 其他上下文信息
    prompt
}
```

## 五、位置匹配的具体实现

### 5.1 多策略匹配系统

```typescript
// src/components/Editor/extensions/DiffHighlightExtension.ts

// 策略1：精确内容匹配（包含上下文）
function exactContentMatch(
  modification: Modification,
  editor: Editor
): MatchResult | null {
  const { target, old } = modification;
  const doc = editor.state.doc;
  
  let bestMatch: MatchResult | null = null;
  let bestScore = 0;
  
  // 遍历所有文本节点
  doc.descendants((node, pos) => {
    if (node.isText) {
      const text = node.text;
      const index = text.indexOf(old);
      
      if (index !== -1) {
        // 检查上下文匹配
        const actualBefore = getTextBefore(doc, pos + index, 50);
        const actualAfter = getTextAfter(doc, pos + index + old.length, 50);
        
        const beforeScore = target.context_before
          ? similarity(target.context_before, actualBefore)
          : 1.0;
        const afterScore = target.context_after
          ? similarity(target.context_after, actualAfter)
          : 1.0;
        
        const score = (beforeScore + afterScore) / 2;
        
        if (score > bestScore && score > 0.8) {
          bestScore = score;
          bestMatch = {
            found: true,
            from: pos + index,
            to: pos + index + old.length,
            confidence: score,
            strategy: 'exactContentMatch'
          };
        }
      }
    }
  });
  
  return bestMatch;
}

// 策略2：模糊匹配（相似度阈值）
function fuzzyContentMatch(
  modification: Modification,
  editor: Editor
): MatchResult | null {
  const { target, old } = modification;
  const doc = editor.state.doc;
  const threshold = 0.7; // 相似度阈值
  
  let bestMatch: MatchResult | null = null;
  let bestScore = 0;
  
  doc.descendants((node, pos) => {
    if (node.isText) {
      const text = node.text;
      
      // 使用滑动窗口查找相似内容
      for (let i = 0; i <= text.length - old.length / 2; i++) {
        const window = text.substring(i, i + old.length * 2);
        const similarity = calculateSimilarity(old, window);
        
        if (similarity > threshold && similarity > bestScore) {
          // 检查上下文
          const actualBefore = getTextBefore(doc, pos + i, 50);
          const actualAfter = getTextAfter(doc, pos + i + window.length, 50);
          
          const contextScore = (
            (target.context_before ? similarity(target.context_before, actualBefore) : 1.0) +
            (target.context_after ? similarity(target.context_after, actualAfter) : 1.0)
          ) / 2;
          
          const finalScore = similarity * 0.7 + contextScore * 0.3;
          
          if (finalScore > bestScore) {
            bestScore = finalScore;
            bestMatch = {
              found: true,
              from: pos + i,
              to: pos + i + old.length,
              confidence: finalScore,
              strategy: 'fuzzyContentMatch'
            };
          }
        }
      }
    }
  });
  
  return bestMatch;
}

// 策略3：结构位置匹配（"第N段第M句"）
function structuralMatch(
  modification: Modification,
  editor: Editor
): MatchResult | null {
  const { target } = modification;
  const doc = editor.state.doc;
  
  // 如果提供了结构信息（如"第2段"），使用结构匹配
  if (target.element_type === 'text' && target.context_before) {
    // 解析结构信息（简化示例）
    const paragraphMatch = target.context_before.match(/第(\d+)段/);
    if (paragraphMatch) {
      const paragraphIndex = parseInt(paragraphMatch[1]) - 1;
      
      // 查找第N个段落
      let paragraphCount = 0;
      let targetParagraphPos: number | null = null;
      
      doc.descendants((node, pos) => {
        if (node.type.name === 'paragraph') {
          if (paragraphCount === paragraphIndex) {
            targetParagraphPos = pos;
            return false; // 停止遍历
          }
          paragraphCount++;
        }
        return true;
      });
      
      if (targetParagraphPos !== null) {
        const paragraphNode = doc.nodeAt(targetParagraphPos);
        if (paragraphNode) {
          // 在段落内查找目标内容
          const paragraphText = paragraphNode.textContent;
          const index = paragraphText.indexOf(modification.old);
          
          if (index !== -1) {
            return {
              found: true,
              from: targetParagraphPos + 1 + index,
              to: targetParagraphPos + 1 + index + modification.old.length,
              confidence: 0.9,
              strategy: 'structuralMatch'
            };
          }
        }
      }
    }
  }
  
  return null;
}

// 策略4：上下文匹配（基于上下文前后文）
function contextBasedMatch(
  modification: Modification,
  editor: Editor
): MatchResult | null {
  const { target, old } = modification;
  const doc = editor.state.doc;
  
  if (!target.context_before || !target.context_after) {
    return null;
  }
  
  // 查找上下文前的位置
  const docText = doc.textContent;
  const contextBeforeIndex = docText.indexOf(target.context_before);
  
  if (contextBeforeIndex === -1) {
    return null;
  }
  
  // 在上下文后查找目标内容
  const searchStart = contextBeforeIndex + target.context_before.length;
  const searchEnd = Math.min(
    searchStart + old.length * 3,
    docText.length
  );
  const searchArea = docText.substring(searchStart, searchEnd);
  
  const targetIndex = searchArea.indexOf(old);
  if (targetIndex === -1) {
    return null;
  }
  
  // 验证上下文后
  const actualAfterStart = searchStart + targetIndex + old.length;
  const actualAfter = docText.substring(
    actualAfterStart,
    Math.min(actualAfterStart + target.context_after.length, docText.length)
  );
  
  const afterSimilarity = similarity(target.context_after, actualAfter);
  if (afterSimilarity < 0.7) {
    return null;
  }
  
  // 转换为文档位置
  const from = textPosToDocPos(doc, searchStart + targetIndex);
  const to = textPosToDocPos(doc, searchStart + targetIndex + old.length);
  
  if (from !== null && to !== null) {
    return {
      found: true,
      from,
      to,
      confidence: 0.85,
      strategy: 'contextBasedMatch'
    };
  }
  
  return null;
}

// 相似度计算（Levenshtein 距离）
function similarity(str1: string, str2: string): number {
  if (str1 === str2) return 1.0;
  if (str1.length === 0 || str2.length === 0) return 0.0;
  
  const maxLen = Math.max(str1.length, str2.length);
  const distance = levenshteinDistance(str1, str2);
  return 1 - distance / maxLen;
}

function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = [];
  
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  
  return matrix[str2.length][str1.length];
}

// 辅助函数：获取文本前面的内容
function getTextBefore(doc: any, pos: number, chars: number): string {
  let text = '';
  let currentPos = pos;
  
  doc.nodesBetween(
    Math.max(0, pos - chars * 2),
    pos,
    (node: any, nodePos: number) => {
      if (node.isText) {
        const start = Math.max(0, nodePos - (pos - currentPos));
        const end = nodePos + node.nodeSize;
        const nodeText = doc.textBetween(start, end);
        text = nodeText + text;
        currentPos = start;
      }
    }
  );
  
  return text.substring(Math.max(0, text.length - chars));
}

// 辅助函数：获取文本后面的内容
function getTextAfter(doc: any, pos: number, chars: number): string {
  let text = '';
  let currentPos = pos;
  
  doc.nodesBetween(
    pos,
    Math.min(doc.content.size, pos + chars * 2),
    (node: any, nodePos: number) => {
      if (node.isText) {
        const start = nodePos;
        const end = nodePos + node.nodeSize;
        const nodeText = doc.textBetween(start, end);
        text = text + nodeText;
        currentPos = end;
      }
    }
  );
  
  return text.substring(0, chars);
}

// 辅助函数：文本位置转文档位置
function textPosToDocPos(doc: any, textPos: number): number | null {
  let docPos = 1;
  let currentTextPos = 0;
  let found = false;
  
  doc.descendants((node: any, pos: number) => {
    if (found) return false;
    
    if (node.isText) {
      const nodeTextLength = node.text.length;
      
      if (currentTextPos <= textPos && currentTextPos + nodeTextLength >= textPos) {
        const offset = textPos - currentTextPos;
        docPos = pos + offset;
        found = true;
        return false;
      }
      
      currentTextPos += nodeTextLength;
    }
    
    return true;
  });
  
  return found ? docPos : null;
}

interface MatchResult {
  found: boolean;
  from: number;
  to: number;
  confidence: number;
  strategy: string;
}
```

### 5.2 定位单个修改

```typescript
// 定位单个修改（使用多策略）
async function locateChange(
  modification: Modification,
  editor: Editor
): Promise<LocatedChange> {
  const strategies = [
    exactContentMatch,
    fuzzyContentMatch,
    structuralMatch,
    contextBasedMatch
  ];
  
  // 按优先级尝试各个策略
  for (const strategy of strategies) {
    const result = await strategy(modification, editor);
    if (result && result.found && result.confidence > 0.7) {
      return {
        ...modification,
        from: result.from,
        to: result.to,
        confidence: result.confidence,
        strategy: result.strategy,
        found: true
      };
    }
  }
  
  // 所有策略都失败
  return {
    ...modification,
    found: false,
    confidence: 0,
    strategy: 'none'
  };
}

interface LocatedChange extends Modification {
  from?: number;
  to?: number;
  found: boolean;
  strategy: string;
}
```

## 六、数据流和状态管理

### 6.1 数据流设计

```
用户输入
    ↓
前端 ChatStore (发送消息)
    ↓
后端 ai_chat_stream (接收消息)
    ↓
AI 处理（返回工具调用）
    ↓
后端拦截工具调用（注入编辑器信息）
    ↓
后端 DiffService (计算 Diff)
    ↓
后端返回 ToolResult (包含 diffs)
    ↓
前端 ChatMessages (接收 ToolResult)
    ↓
前端 EditorStore (存储 diffs)
    ↓
前端 DiffHighlightExtension (渲染 Diff)
    ↓
用户交互（接受/拒绝）
    ↓
前端应用修改（更新编辑器）
```

### 6.2 状态管理（Zustand）

```typescript
// src/stores/editorStore.ts

export interface Diff {
  diff_id: string;
  diff_area_id: string;
  diff_type: 'Edit' | 'Insertion' | 'Deletion';
  original_code: string;
  original_start_line: number;
  original_end_line: number;
  new_code: string;
  start_line: number;
  end_line: number;
  context_before?: string | null;
  context_after?: string | null;
  element_type?: 'text' | 'table' | 'image' | 'code_block';
    element_identifier?: string;
  // 前端添加的定位信息
  from?: number; // ProseMirror 位置
  to?: number;
  confidence?: number; // 匹配置信度
  strategy?: string; // 使用的匹配策略
}

export interface EditorTab {
  id: string;
  filePath: string;
  fileName: string;
  content: string;
  lastSavedContent: string;
  isDirty: boolean;
  isSaving: boolean;
  editor: Editor | null;
  diffAreaId?: string;
  diffs?: Diff[];
  oldContent?: string;
  newContent?: string;
}

interface EditorState {
  tabs: EditorTab[];
  activeTabId: string | null;
  setTabDiff: (tabId: string, diffAreaId: string, diffs: Diff[], oldContent: string, newContent: string) => void;
  clearTabDiff: (tabId: string) => void;
  // ... 其他方法
}
```

### 6.3 前端处理流程

```typescript
// src/components/Chat/ChatMessages.tsx

// 处理 AI 返回的工具调用结果
function handleToolCallResult(block: ChatBlock) {
  if (block.type === 'tool_call' && block.toolCall?.name === 'edit_current_editor_document') {
    const result = block.toolCall.result;
    if (result?.success && result.data) {
      const { diff_area_id, file_path, old_content, new_content, diffs } = result.data;
      
      // 存储到 EditorStore
      const store = useEditorStore.getState();
      const tab = store.tabs.find(t => t.filePath === file_path);
      
      if (tab) {
        store.setTabDiff(tab.id, diff_area_id, diffs, old_content, new_content);
        
        // 触发编辑器重新渲染 Diff
        if (tab.editor) {
          const { state, dispatch } = tab.editor.view;
          const tr = state.tr.setMeta('diffUpdate', true);
          dispatch(tr);
        }
      }
    }
  }
}
```

## 七、前端实现细节

### 7.1 Diff Plugin（ProseMirror 插件）

```typescript
// src/components/Editor/extensions/DiffHighlightExtension.ts

import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export interface DiffHighlightOptions {
  getDiffs: () => Diff[] | null;
  getOldContent: () => string | null;
  getNewContent: () => string | null;
  onApplyDiff?: () => void;
  onRejectDiff?: () => void;
}

export const diffHighlightPluginKey = new PluginKey('diffHighlight');

export const DiffHighlightExtension = Extension.create<DiffHighlightOptions>({
  name: 'diffHighlight',
  
  addOptions() {
    return {
      getDiffs: () => null,
      getOldContent: () => null,
      getNewContent: () => null,
      onApplyDiff: undefined,
      onRejectDiff: undefined,
    };
  },
  
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: diffHighlightPluginKey,
        
        state: {
          init() {
            return DecorationSet.empty;
          },
          
          apply(tr, oldState) {
            // 文档变化时调整 Decoration 位置
            // ⚠️ 关键：使用 tr.mapping 自动调整 Decoration 位置
            let decorations = oldState.map(tr.mapping, tr.doc);
            
            // 处理自定义 Meta
            const meta = tr.getMeta('diffUpdate');
            if (meta) {
              decorations = this.createDiffDecorations(tr.doc);
            }
            
            const metaClear = tr.getMeta('diffCleared');
            if (metaClear) {
              decorations = DecorationSet.empty;
            }
            
            // ⚠️ 新增：检测文档变化（并发编辑处理）
            const documentChangeMeta = tr.getMeta('documentChange');
            if (documentChangeMeta) {
              // 文档在 AI 处理期间发生了变化
              decorations = this.handleDocumentChange(
                decorations,
                documentChangeMeta,
                tr.doc
              );
            }
            
            return decorations;
          },
          
          // 处理文档变化（并发编辑）
          handleDocumentChange(
            decorations: DecorationSet,
            changeMeta: { range: { from: number; to: number }; length: number },
            doc: any
          ): DecorationSet {
            // 1. 检查哪些 Decoration 受到影响
            const affectedDecorations: Decoration[] = [];
            const unaffectedDecorations: Decoration[] = [];
            
            decorations.find().forEach((decoration) => {
              const { from, to } = decoration;
              
              // 判断 Decoration 是否与变化范围重叠
              if (
                (from >= changeMeta.range.from && from <= changeMeta.range.to) ||
                (to >= changeMeta.range.from && to <= changeMeta.range.to) ||
                (from <= changeMeta.range.from && to >= changeMeta.range.to)
              ) {
                // Decoration 与变化重叠，需要重新定位
                affectedDecorations.push(decoration);
              } else {
                // Decoration 不受影响
                unaffectedDecorations.push(decoration);
              }
            });
            
            // 2. 对于受影响的 Decoration，尝试重新定位
            const relocatedDecorations: Decoration[] = [];
            
            for (const decoration of affectedDecorations) {
              const diffId = decoration.spec['data-diff-id'];
              if (diffId) {
                // 重新定位
                const relocated = this.relocateDecoration(diffId, doc);
                if (relocated) {
                  relocatedDecorations.push(relocated);
                } else {
                  // 重新定位失败，标记为需要用户确认
                  console.warn('Decoration 重新定位失败:', diffId);
                }
              }
            }
            
            // 3. 合并未受影响和重新定位的 Decoration
            return DecorationSet.create(
              doc,
              [...unaffectedDecorations, ...relocatedDecorations]
            );
          },
          
          // 重新定位单个 Decoration
          relocateDecoration(diffId: string, doc: any): Decoration | null {
            const diffs = this.options.getDiffs();
            const diff = diffs?.find(d => d.diff_id === diffId);
            
            if (!diff) {
              return null;
            }
            
            // 使用多策略匹配重新定位
            const located = this.locateDiff(diff, doc);
            if (!located) {
              return null;
            }
            
            // 重新创建 Decoration
            if (diff.element_type === 'text' || !diff.element_type) {
              return Decoration.inline(located.from, located.to, {
                class: 'diff-deletion',
                'data-diff-id': diff.diff_id,
              });
            }
            
            return null;
          },
        },
        
        props: {
          decorations(state) {
            return this.getState(state);
          },
        },
        
        // 创建 Diff Decorations
        createDiffDecorations(doc: any): DecorationSet {
          const diffs = this.options.getDiffs();
          if (!diffs || diffs.length === 0) {
            return DecorationSet.empty;
          }
          
          const decorations: Decoration[] = [];
          
          for (const diff of diffs) {
            // 如果还没有定位，先进行定位
            if (diff.from === undefined || diff.to === undefined) {
              const located = this.locateDiff(diff, doc);
              if (located) {
                diff.from = located.from;
                diff.to = located.to;
              } else {
                continue; // 定位失败，跳过
              }
            }
            
            // 根据元素类型创建不同的 Decoration
            if (diff.element_type === 'text' || !diff.element_type) {
              // 文本 Diff
              if (diff.diff_type === 'Deletion' || diff.diff_type === 'Edit') {
                decorations.push(
                  Decoration.inline(diff.from, diff.to, {
                    class: 'diff-deletion',
                    style: 'background: #fee; text-decoration: line-through;',
                    'data-diff-id': diff.diff_id,
                  })
                );
              }
              
              if (diff.diff_type === 'Insertion' || diff.diff_type === 'Edit') {
                decorations.push(
                  Decoration.widget(diff.to, () => {
                    const span = document.createElement('span');
                    span.className = 'diff-insertion';
                    span.style.cssText = 'background: #efe; padding: 2px 4px; border-radius: 2px;';
                    span.textContent = diff.new_code;
                    span.dataset.diffId = diff.diff_id;
                    return span;
                  })
                );
              }
            } else if (diff.element_type === 'table') {
              // 表格 Diff
              // 如果提供了 element_identifier，使用标识符定位
              if (diff.element_identifier) {
                const located = this.locateTable(diff.element_identifier, doc);
                if (located && located.found) {
                  const tableNode = located.node;
                  decorations.push(
                    Decoration.node(located.position, located.position + tableNode.nodeSize, {
                      class: 'diff-table-modified',
                      'data-diff-id': diff.diff_id,
                    })
                  );
                }
              } else if (diff.from !== undefined) {
                // 如果没有标识符，使用 from 位置
                const tableNode = doc.nodeAt(diff.from);
                if (tableNode && tableNode.type.name === 'table') {
                  decorations.push(
                    Decoration.node(diff.from, diff.from + tableNode.nodeSize, {
                      class: 'diff-table-modified',
                      'data-diff-id': diff.diff_id,
                    })
                  );
                }
              }
            } else if (diff.element_type === 'image') {
              // 图片 Diff
              // 如果提供了 element_identifier，使用标识符定位
              if (diff.element_identifier) {
                const located = this.locateImage(diff.element_identifier, doc);
                if (located && located.found) {
                  decorations.push(
                    Decoration.widget(located.position, () => {
                      return this.createImageCompareWidget(
                        diff.element_identifier || '',
                        diff.new_code
                      );
                    })
                  );
                }
              } else if (diff.from !== undefined) {
                // 如果没有标识符，使用 from 位置
                decorations.push(
                  Decoration.widget(diff.from, () => {
                    return this.createImageCompareWidget(
                      diff.element_identifier || '',
                      diff.new_code
                    );
                  })
                );
              }
            }
          }
          
          // 添加应用/拒绝按钮
          if (decorations.length > 0) {
            decorations.push(
              Decoration.widget(doc.content.size, () => {
                return this.createActionButtons();
              })
            );
          }
          
          return DecorationSet.create(doc, decorations);
        },
        
        // 定位 Diff（使用多策略匹配）
        locateDiff(diff: Diff, doc: any): { from: number; to: number } | null {
          const strategies = [
            this.exactContentMatch,
            this.fuzzyContentMatch,
            this.contextBasedMatch,
          ];
          
          for (const strategy of strategies) {
            const result = strategy.call(this, diff, doc);
            if (result) {
              return result;
            }
          }
          
          return null;
        },
        
        // 创建图片对比 Widget
        createImageCompareWidget(oldSrc: string, newSrc: string): HTMLElement {
          const container = document.createElement('div');
          container.className = 'diff-image-compare';
          container.style.cssText = 'display: flex; gap: 16px; padding: 16px; background: #f9f9f9; border: 2px solid #fbbf24; border-radius: 8px;';
          
          const oldDiv = document.createElement('div');
          oldDiv.style.cssText = 'flex: 1;';
          const oldLabel = document.createElement('div');
          oldLabel.textContent = '删除';
          oldLabel.style.cssText = 'font-size: 12px; color: #dc2626; font-weight: 600; margin-bottom: 8px;';
          const oldImg = document.createElement('img');
          oldImg.src = oldSrc;
          oldImg.style.cssText = 'width: 100%; opacity: 0.5;';
          oldDiv.appendChild(oldLabel);
          oldDiv.appendChild(oldImg);
          
          const newDiv = document.createElement('div');
          newDiv.style.cssText = 'flex: 1;';
          const newLabel = document.createElement('div');
          newLabel.textContent = '新增';
          newLabel.style.cssText = 'font-size: 12px; color: #16a34a; font-weight: 600; margin-bottom: 8px;';
          const newImg = document.createElement('img');
          newImg.src = newSrc;
          newImg.style.cssText = 'width: 100%;';
          newDiv.appendChild(newLabel);
          newDiv.appendChild(newImg);
          
          container.appendChild(oldDiv);
          container.appendChild(newDiv);
          
          return container;
        },
        
        // 创建操作按钮
        createActionButtons(): HTMLElement {
          const container = document.createElement('div');
          container.className = 'diff-action-buttons';
          container.style.cssText = 'display: flex; gap: 8px; padding: 12px; background: #f3f4f6; border-top: 1px solid #e5e7eb;';
          
          const acceptBtn = document.createElement('button');
          acceptBtn.textContent = '✓ 接受所有修改';
          acceptBtn.style.cssText = 'padding: 8px 16px; background: #16a34a; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: 500;';
          acceptBtn.onclick = () => {
            this.options.onApplyDiff?.();
          };
          
          const rejectBtn = document.createElement('button');
          rejectBtn.textContent = '✗ 拒绝所有修改';
          rejectBtn.style.cssText = 'padding: 8px 16px; background: #dc2626; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: 500;';
          rejectBtn.onclick = () => {
            this.options.onRejectDiff?.();
          };
          
          container.appendChild(acceptBtn);
          container.appendChild(rejectBtn);
          
          return container;
        },
        
        // 定位表格（使用唯一标识符）
        locateTable(identifier: string, doc: any): { found: boolean; position: number; node: any } | null {
          const candidates: Array<{ pos: number; node: any; score: number }> = [];
          
          doc.descendants((node: any, pos: number) => {
            if (node.type.name === 'table') {
              const score = this.calculateTableMatchScore(node, pos, identifier);
              if (score > 0.5) {
                candidates.push({ pos, node, score });
              }
            }
          });
          
          if (candidates.length > 0) {
            const best = candidates.reduce((a, b) => a.score > b.score ? a : b);
            return { found: true, position: best.pos, node: best.node };
          }
          
          return null;
        },
        
        // 计算表格匹配分数
        calculateTableMatchScore(tableNode: any, position: number, identifier: string): number {
          let score = 0;
          
          // 提取表格内容
          let tableContent = '';
          tableNode.forEach((row: any) => {
            row.forEach((cell: any) => {
              tableContent += cell.textContent + '|';
            });
            tableContent += '\n';
          });
          
          const contentHash = this.hashString(tableContent);
          if (identifier.includes(contentHash)) {
            score += 0.5;
          }
          
          const rowCount = tableNode.childCount;
          const firstRowCells = tableNode.firstChild?.childCount || 0;
          const structure = `${rowCount}x${firstRowCells}`;
          if (identifier.includes(structure)) {
            score += 0.3;
          }
          
          const context = this.getContextAround(position, 50, doc);
          const contextHash = this.hashString(context);
          if (identifier.includes(contextHash)) {
            score += 0.2;
          }
          
          return score;
        },
        
        // 定位图片（使用唯一标识符）
        locateImage(identifier: string, doc: any): { found: boolean; position: number; node: any } | null {
          const candidates: Array<{ pos: number; node: any; score: number }> = [];
          
          doc.descendants((node: any, pos: number) => {
            if (node.type.name === 'image') {
              const score = this.calculateImageMatchScore(node, pos, identifier);
              if (score > 0.5) {
                candidates.push({ pos, node, score });
              }
            }
          });
          
          if (candidates.length > 0) {
            const best = candidates.reduce((a, b) => a.score > b.score ? a : b);
            return { found: true, position: best.pos, node: best.node };
          }
          
          return null;
        },
        
        // 计算图片匹配分数
        calculateImageMatchScore(imageNode: any, position: number, identifier: string): number {
          let score = 0;
          
          const src = imageNode.attrs.src || '';
          if (src) {
            const urlHash = this.hashString(src);
            if (identifier.includes(urlHash)) {
              score += 0.6;
            }
          }
          
          const context = this.getContextAround(position, 100, doc);
          const contextHash = this.hashString(context);
          if (identifier.includes(contextHash)) {
            score += 0.4;
          }
          
          return score;
        },
        
        // 字符串哈希函数
        hashString(str: string): string {
          let hash = 0;
          for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
          }
          return Math.abs(hash).toString(36);
        },
        
        // 获取位置周围的上下文
        getContextAround(position: number, chars: number, doc: any): string {
          const start = Math.max(0, position - chars);
          const end = Math.min(doc.content.size, position + chars);
          return doc.textBetween(start, end);
        },
      }),
    ];
  },
});
```

### 7.2 应用/拒绝修改

```typescript
// src/components/Editor/TipTapEditor.tsx

// 应用 Diff
onApplyDiff: () => {
  const store = useEditorStore.getState();
  const currentTab = store.tabs.find(t => t.id === tabId || t.id === store.activeTabId);
  
  if (!currentTab || !editor || !currentTab.newContent) {
    return;
  }
  
  try {
    // 使用新内容替换整个文档
    editor.commands.setContent(currentTab.newContent, false);
    
    // 清除 diff 数据
    store.clearTabDiff(currentTab.id);
    
    // 触发视图刷新
    const { state, dispatch } = editor.view;
    const tr = state.tr.setMeta('diffCleared', true);
    dispatch(tr);
    
    console.log('✅ [编辑器] 已应用 diff');
  } catch (error) {
    console.error('❌ [编辑器] 应用 diff 失败:', error);
  }
},

// 拒绝 Diff
onRejectDiff: () => {
  const store = useEditorStore.getState();
  const currentTab = store.tabs.find(t => t.id === tabId || t.id === store.activeTabId);
  
  if (currentTab && editor) {
    // 清除 diff 数据
    store.clearTabDiff(currentTab.id);
    
    // 触发视图刷新
    const { state, dispatch } = editor.view;
    const tr = state.tr.setMeta('diffCleared', true);
    dispatch(tr);
    
    console.log('❌ [编辑器] 已拒绝 diff');
  }
},
```

## 八、错误处理

### 8.1 定位失败处理

```typescript
// 定位失败时的处理策略

async function handleLocationFailure(
  modification: Modification,
  editor: Editor
): Promise<void> {
  // 1. 记录失败信息
  console.warn('定位失败:', {
    modification: modification.id,
    target: modification.target.content.substring(0, 50),
  });
  
  // 2. 尝试使用候选位置
  const candidates = findCandidateLocations(modification, editor);
  
  if (candidates.length > 0) {
    // 显示候选位置让用户选择
    await showCandidateSelection(candidates, modification);
  } else {
    // 3. 提示用户手动定位
    await showManualLocationPrompt(modification);
  }
}

// 查找候选位置
function findCandidateLocations(
  modification: Modification,
  editor: Editor
): CandidateLocation[] {
  const { old } = modification;
  const doc = editor.state.doc;
  const candidates: CandidateLocation[] = [];
  
  // 查找所有包含目标文本的位置
  doc.descendants((node, pos) => {
    if (node.isText) {
      const text = node.text;
      let index = 0;
      
      while ((index = text.indexOf(old, index)) !== -1) {
        candidates.push({
          from: pos + index,
          to: pos + index + old.length,
          context: getContextAround(doc, pos + index, 50),
        });
        index += old.length;
      }
    }
  });
  
  return candidates;
}
```

### 8.2 数据不一致处理

```typescript
// 检测和处理数据不一致

function validateDiffData(diff: Diff, doc: any): ValidationResult {
  const issues: string[] = [];
  
  // 1. 检查位置是否有效
  if (diff.from !== undefined && diff.to !== undefined) {
    if (diff.from < 1 || diff.to > doc.content.size) {
      issues.push('位置超出文档范围');
    }
    if (diff.from >= diff.to) {
      issues.push('起始位置大于等于结束位置');
    }
  }
  
  // 2. 检查内容是否匹配
  if (diff.from !== undefined && diff.to !== undefined) {
    const actualContent = doc.textBetween(diff.from, diff.to);
    const normalizedActual = normalizeText(actualContent);
    const normalizedOriginal = normalizeText(diff.original_code);
    
    if (normalizedActual !== normalizedOriginal) {
      issues.push('文档内容与原始内容不匹配');
    }
  }
  
  // 3. 检查置信度
  if (diff.confidence !== undefined && diff.confidence < 0.7) {
    issues.push('置信度过低，建议用户确认');
  }
  
  return {
    valid: issues.length === 0,
    issues,
  };
}
```

### 8.3 异常恢复机制

```typescript
// 异常恢复策略

async function handleException(
  error: Error,
  context: ErrorContext
): Promise<void> {
  console.error('Diff 处理异常:', error, context);
  
  // 1. 记录错误
  logError(error, context);
  
  // 2. 尝试恢复
  if (context.type === 'location_failure') {
    // 定位失败：尝试使用备选策略
    await retryWithAlternativeStrategy(context);
  } else if (context.type === 'apply_failure') {
    // 应用失败：回滚到原始状态
    await rollbackToOriginalState(context);
  } else if (context.type === 'render_failure') {
    // 渲染失败：清除所有 Decoration
    await clearAllDecorations(context);
  }
  
  // 3. 通知用户
  await notifyUser({
    type: 'error',
    message: '处理修改时遇到问题，已尝试恢复',
    details: error.message,
  });
}
```

### 8.4 并发编辑处理

**问题描述**：AI 建议修改时，用户可能继续编辑文档，导致 Decoration 位置失效。

**处理策略**：

#### 8.4.1 文档变化检测

```typescript
// 检测文档是否在 AI 处理期间发生变化

class DocumentChangeTracker {
  private baselineContent: string;
  private baselineVersion: number;
  
  constructor(editor: Editor) {
    this.baselineContent = editor.getHTML();
    this.baselineVersion = editor.state.doc.content.size;
  }
  
  // 检查文档是否已变化
  hasChanged(editor: Editor): boolean {
    const currentContent = editor.getHTML();
    const currentVersion = editor.state.doc.content.size;
    
    return (
      currentContent !== this.baselineContent ||
      currentVersion !== this.baselineVersion
    );
  }
  
  // 获取变化范围
  getChangeRange(editor: Editor): { from: number; to: number } | null {
    if (!this.hasChanged(editor)) {
      return null;
    }
    
    // 使用 diff 算法找到变化范围
    const diff = calculateDiff(this.baselineContent, editor.getHTML());
    return diff.changeRange;
  }
}

// 在 AI 处理开始时创建跟踪器
let changeTracker: DocumentChangeTracker | null = null;

async function handleAIResponse(aiResponse: AIResponse, editor: Editor) {
  // 创建变化跟踪器
  changeTracker = new DocumentChangeTracker(editor);
  
  // 处理 AI 响应...
  
  // 在处理完成后检查变化
  if (changeTracker?.hasChanged(editor)) {
    await handleDocumentChange(editor);
  }
}
```

#### 8.4.2 Decoration 位置调整

```typescript
// 使用 ProseMirror 的 Mapping 调整 Decoration 位置

function adjustDecorationPositions(
  decorations: DecorationSet,
  changeRange: { from: number; to: number },
  changeLength: number
): DecorationSet {
  // 创建位置映射
  const mapping = new Mapping();
  
  // 如果变化在 Decoration 之前，只需要偏移
  // 如果变化在 Decoration 内部，需要重新计算
  // 如果变化在 Decoration 之后，不需要调整
  
  // 计算偏移量
  const offset = changeLength - (changeRange.to - changeRange.from);
  
  // 调整所有 Decoration 的位置
  return decorations.map((from, to, spec) => {
    if (to < changeRange.from) {
      // Decoration 在变化之前，不需要调整
      return { from, to, spec };
    } else if (from > changeRange.to) {
      // Decoration 在变化之后，需要偏移
      return { from: from + offset, to: to + offset, spec };
    } else {
      // Decoration 与变化重叠，需要重新定位
      return null; // 标记为需要重新定位
    }
  });
}

// 在 Plugin 的 apply 方法中使用
apply(tr, oldState) {
  let decorations = oldState.map(tr.mapping, tr.doc);
  
  // 检查是否有文档变化
  const changeMeta = tr.getMeta('documentChange');
  if (changeMeta) {
    // 调整 Decoration 位置
    decorations = adjustDecorationPositions(
      decorations,
      changeMeta.range,
      changeMeta.length
    );
    
    // 对于重叠的 Decoration，重新定位
    const needsRelocation = decorations.find(
      (from, to) => from === null || to === null
    );
    
    if (needsRelocation.length > 0) {
      // 重新定位这些 Decoration
      decorations = relocateDecorations(decorations, tr.doc);
    }
  }
  
  return decorations;
}
```

#### 8.4.3 Decoration 失效处理

```typescript
// 处理 Decoration 失效的情况

async function handleDecorationInvalidation(
  editor: Editor,
  invalidDecorations: Decoration[]
): Promise<void> {
  // 1. 记录失效的 Decoration
  console.warn('Decoration 失效:', invalidDecorations.length);
  
  // 2. 尝试重新定位
  const relocatedDecorations = await relocateDecorations(
    invalidDecorations,
    editor
  );
  
  // 3. 如果重新定位失败，提示用户
  const failedCount = relocatedDecorations.filter(d => !d.found).length;
  
  if (failedCount > 0) {
    await notifyUser({
      type: 'warning',
      message: `检测到 ${failedCount} 处修改位置可能已变化，请检查`,
      action: 'review',
    });
  }
  
  // 4. 更新 Decoration
  updateDecorations(editor, relocatedDecorations);
}

// 重新定位 Decoration
async function relocateDecorations(
  decorations: Decoration[],
  editor: Editor
): Promise<RelocatedDecoration[]> {
  const results: RelocatedDecoration[] = [];
  
  for (const decoration of decorations) {
    const diff = decoration.diff;
    
    // 使用多策略匹配重新定位
    const located = await locateChange(
      {
        id: diff.diff_id,
        type: 'text_replace',
        target: {
          content: diff.original_code,
          context_before: diff.context_before,
          context_after: diff.context_after,
        },
        old: diff.original_code,
        new: diff.new_code,
      },
      editor
    );
    
    results.push({
      ...decoration,
      found: located.found,
      from: located.from,
      to: located.to,
      confidence: located.confidence,
    });
  }
  
  return results;
}
```

#### 8.4.4 用户提示

```typescript
// 提示用户文档已变化

async function notifyDocumentChange(editor: Editor): Promise<void> {
  const notification = {
    type: 'info',
    title: '文档已更新',
    message: '检测到文档在 AI 处理期间发生了变化，正在重新计算修改位置...',
    duration: 3000,
  };
  
  showNotification(notification);
  
  // 自动重新定位
  await handleDecorationInvalidation(editor, getAllDecorations(editor));
}
```

### 8.5 表格和图片定位策略

#### 8.5.1 表格定位策略

**唯一标识符生成**：

```typescript
// 为表格生成唯一标识符

function generateTableIdentifier(
  tableNode: any,
  position: number
): string {
  // 策略1：使用表格内容哈希
  const tableContent = extractTableContent(tableNode);
  const contentHash = hashString(tableContent);
  
  // 策略2：使用表格位置和结构
  const rowCount = tableNode.childCount;
  const firstRowCells = tableNode.firstChild?.childCount || 0;
  const structure = `${rowCount}x${firstRowCells}`;
  
  // 策略3：使用表格上下文
  const context = getContextAround(position, 50);
  const contextHash = hashString(context);
  
  // 组合生成唯一标识符
  return `table_${contentHash}_${structure}_${contextHash}`;
}

// 提取表格内容（用于哈希）
function extractTableContent(tableNode: any): string {
  let content = '';
  
  tableNode.forEach((row: any) => {
    row.forEach((cell: any) => {
      content += cell.textContent + '|';
    });
    content += '\n';
  });
  
  return content;
}
```

**表格定位方法**：

```typescript
// 定位表格节点

function locateTable(
  identifier: string,
  editor: Editor
): { found: boolean; position: number; node: any } | null {
  const doc = editor.state.doc;
  const candidates: Array<{ pos: number; node: any; score: number }> = [];
  
  // 遍历所有表格节点
  doc.descendants((node, pos) => {
    if (node.type.name === 'table') {
      // 计算匹配分数
      const score = calculateTableMatchScore(node, pos, identifier);
      if (score > 0.5) {
        candidates.push({ pos, node, score });
      }
    }
  });
  
  // 选择最佳匹配
  if (candidates.length > 0) {
    const best = candidates.reduce((a, b) => 
      a.score > b.score ? a : b
    );
    
    return {
      found: true,
      position: best.pos,
      node: best.node,
    };
  }
  
  return null;
}

// 计算表格匹配分数
function calculateTableMatchScore(
  tableNode: any,
  position: number,
  identifier: string
): number {
  let score = 0;
  
  // 1. 内容哈希匹配（权重 0.5）
  const tableContent = extractTableContent(tableNode);
  const contentHash = hashString(tableContent);
  if (identifier.includes(contentHash)) {
    score += 0.5;
  }
  
  // 2. 结构匹配（权重 0.3）
  const rowCount = tableNode.childCount;
  const firstRowCells = tableNode.firstChild?.childCount || 0;
  const structure = `${rowCount}x${firstRowCells}`;
  if (identifier.includes(structure)) {
    score += 0.3;
  }
  
  // 3. 上下文匹配（权重 0.2）
  const context = getContextAround(position, 50);
  const contextHash = hashString(context);
  if (identifier.includes(contextHash)) {
    score += 0.2;
  }
  
  return score;
}
```

**表格单元格定位**：

```typescript
// 定位表格单元格

function locateTableCell(
  tablePos: number,
  rowIndex: number,
  colIndex: number,
  editor: Editor
): { found: boolean; position: number; node: any } | null {
  const doc = editor.state.doc;
  const tableNode = doc.nodeAt(tablePos);
  
  if (!tableNode || tableNode.type.name !== 'table') {
    return null;
  }
  
  // 找到目标行
  let currentPos = tablePos + 1;
  let rowNode = tableNode.firstChild;
  
  for (let i = 0; i < rowIndex && rowNode; i++) {
    currentPos += rowNode.nodeSize;
    rowNode = rowNode.nextSibling;
  }
  
  if (!rowNode) {
    return null;
  }
  
  // 找到目标单元格
  let cellNode = rowNode.firstChild;
  let cellPos = currentPos + 1;
  
  for (let j = 0; j < colIndex && cellNode; j++) {
    cellPos += cellNode.nodeSize;
    cellNode = cellNode.nextSibling;
  }
  
  if (!cellNode) {
    return null;
  }
  
  return {
    found: true,
    position: cellPos,
    node: cellNode,
  };
}
```

#### 8.5.2 图片定位策略

**唯一标识符生成**：

```typescript
// 为图片生成唯一标识符

function generateImageIdentifier(
  imageNode: any,
  position: number
): string {
  // 策略1：使用图片 URL（如果有）
  const src = imageNode.attrs.src || '';
  if (src) {
    const urlHash = hashString(src);
    return `image_${urlHash}`;
  }
  
  // 策略2：使用图片上下文
  const context = getContextAround(position, 100);
  const contextHash = hashString(context);
  
  // 策略3：使用图片位置
  const positionHash = hashString(position.toString());
  
  // 组合生成唯一标识符
  return `image_${contextHash}_${positionHash}`;
}
```

**图片定位方法**：

```typescript
// 定位图片节点

function locateImage(
  identifier: string,
  editor: Editor
): { found: boolean; position: number; node: any } | null {
  const doc = editor.state.doc;
  const candidates: Array<{ pos: number; node: any; score: number }> = [];
  
  // 遍历所有图片节点
  doc.descendants((node, pos) => {
    if (node.type.name === 'image') {
      // 计算匹配分数
      const score = calculateImageMatchScore(node, pos, identifier);
      if (score > 0.5) {
        candidates.push({ pos, node, score });
      }
    }
  });
  
  // 选择最佳匹配
  if (candidates.length > 0) {
    const best = candidates.reduce((a, b) => 
      a.score > b.score ? a : b
    );
    
    return {
      found: true,
      position: best.pos,
      node: best.node,
    };
  }
  
  return null;
}

// 计算图片匹配分数
function calculateImageMatchScore(
  imageNode: any,
  position: number,
  identifier: string
): number {
  let score = 0;
  
  // 1. URL 匹配（权重 0.6）
  const src = imageNode.attrs.src || '';
  if (src) {
    const urlHash = hashString(src);
    if (identifier.includes(urlHash)) {
      score += 0.6;
    }
  }
  
  // 2. 上下文匹配（权重 0.4）
  const context = getContextAround(position, 100);
  const contextHash = hashString(context);
  if (identifier.includes(contextHash)) {
    score += 0.4;
  }
  
  return score;
}
```

**辅助函数**：

```typescript
// 字符串哈希函数
function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

// 获取位置周围的上下文
function getContextAround(
  position: number,
  chars: number,
  doc: any
): string {
  const start = Math.max(0, position - chars);
  const end = Math.min(doc.content.size, position + chars);
  return doc.textBetween(start, end);
}
```

## 九、测试和验证

### 9.1 单元测试

```typescript
// tests/DiffHighlightExtension.test.ts

describe('DiffHighlightExtension', () => {
  it('应该正确创建文本删除 Decoration', () => {
    const diff: Diff = {
      diff_id: 'test-1',
      diff_area_id: 'area-1',
      diff_type: 'Deletion',
      original_code: '要删除的文本',
      original_start_line: 1,
      original_end_line: 1,
      new_code: '',
      start_line: 1,
      end_line: 1,
      from: 10,
      to: 20,
    };
    
    const decorations = createDiffDecorations(doc, [diff]);
    expect(decorations.find(10, 20)).toHaveLength(1);
  });
  
  it('应该正确创建文本插入 Decoration', () => {
    const diff: Diff = {
      diff_id: 'test-2',
      diff_area_id: 'area-1',
      diff_type: 'Insertion',
      original_code: '',
      original_start_line: 1,
      original_end_line: 1,
      new_code: '新插入的文本',
      start_line: 1,
      end_line: 1,
      from: 10,
      to: 10,
    };
    
    const decorations = createDiffDecorations(doc, [diff]);
    expect(decorations.find(10, 10)).toHaveLength(1);
  });
  
  it('应该正确处理上下文匹配', () => {
    const diff: Diff = {
      diff_id: 'test-3',
      diff_area_id: 'area-1',
      diff_type: 'Edit',
      original_code: '旧文本',
      original_start_line: 5,
      original_end_line: 5,
      new_code: '新文本',
      start_line: 5,
      end_line: 5,
      context_before: '前面的上下文',
      context_after: '后面的上下文',
    };
    
    const result = contextBasedMatch(diff, editor);
    expect(result).not.toBeNull();
    expect(result?.confidence).toBeGreaterThan(0.7);
  });
  
  it('应该处理定位失败的情况', () => {
    const diff: Diff = {
      diff_id: 'test-4',
      diff_area_id: 'area-1',
      diff_type: 'Edit',
      original_code: '不存在的文本',
      original_start_line: 999,
      original_end_line: 999,
      new_code: '新文本',
      start_line: 999,
      end_line: 999,
    };
    
    const result = locateDiff(diff, doc);
    expect(result).toBeNull();
  });
});
```

### 9.2 集成测试

```typescript
// tests/integration/DiffWorkflow.test.ts

describe('Diff 工作流程集成测试', () => {
  it('应该完成完整的编辑流程', async () => {
    // 1. 模拟 AI 返回
    const aiResponse = {
      modifications: [{
        id: 'mod-1',
        type: 'text_replace',
        target: {
          content: '机器学习',
          context_before: '这是关于',
          context_after: '的介绍',
        },
        old: '机器学习',
        new: '深度学习',
      }],
    };
    
    // 2. 处理 AI 响应
    const locatedChanges = await handleAIResponse(aiResponse, editor);
    expect(locatedChanges.length).toBeGreaterThan(0);
    expect(locatedChanges[0].found).toBe(true);
    
    // 3. 应用 Diff Decoration
    editor.view.dispatch(
      editor.view.state.tr.setMeta(diffPluginKey, {
        type: 'addDiff',
        changes: locatedChanges,
      })
    );
    
    // 4. 验证 Decoration 已创建
    const pluginState = diffPluginKey.getState(editor.state);
    expect(pluginState.decorations.size).toBeGreaterThan(0);
    
    // 5. 应用修改
    await applyChange(locatedChanges[0]);
    
    // 6. 验证文档已更新
    const newContent = editor.getHTML();
    expect(newContent).toContain('深度学习');
    expect(newContent).not.toContain('机器学习');
  });
});
```

### 9.3 边界情况测试

```typescript
// tests/edge-cases.test.ts

describe('边界情况测试', () => {
  it('应该处理空文档', () => {
    const emptyDoc = createEmptyDoc();
    const diff: Diff = {
      diff_id: 'test-empty',
      diff_area_id: 'area-1',
      diff_type: 'Insertion',
      original_code: '',
      original_start_line: 1,
      original_end_line: 1,
      new_code: '新内容',
      start_line: 1,
      end_line: 1,
    };
    
    const result = locateDiff(diff, emptyDoc);
    expect(result).not.toBeNull();
  });
  
  it('应该处理大文档（> 10000 字符）', () => {
    const largeDoc = createLargeDoc(20000);
    const diff: Diff = {
      diff_id: 'test-large',
      diff_area_id: 'area-1',
      diff_type: 'Edit',
      original_code: '目标文本',
      original_start_line: 100,
      original_end_line: 100,
      new_code: '新文本',
      start_line: 100,
      end_line: 100,
      context_before: '前面的上下文',
      context_after: '后面的上下文',
    };
    
    const startTime = Date.now();
    const result = locateDiff(diff, largeDoc);
    const endTime = Date.now();
    
    expect(result).not.toBeNull();
    expect(endTime - startTime).toBeLessThan(1000); // 应该在 1 秒内完成
  });
  
  it('应该处理多个相同文本的情况', () => {
    const doc = createDocWithRepeatedText('目标文本', 5);
    const diff: Diff = {
      diff_id: 'test-repeated',
      diff_area_id: 'area-1',
      diff_type: 'Edit',
      original_code: '目标文本',
      original_start_line: 3,
      original_end_line: 3,
      new_code: '新文本',
      start_line: 3,
      end_line: 3,
      context_before: '第3个位置的前文',
      context_after: '第3个位置的后文',
    };
    
    const result = locateDiff(diff, doc);
    expect(result).not.toBeNull();
    // 应该定位到第 3 个位置，而不是第 1 个
    expect(result?.from).toBeGreaterThan(doc.textContent.indexOf('目标文本', 100));
  });
  
  it('应该处理格式变化的情况', () => {
    const doc = createDocWithFormatting();
    const diff: Diff = {
      diff_id: 'test-format',
      diff_area_id: 'area-1',
      diff_type: 'Edit',
      original_code: '目标文本',
      original_start_line: 1,
      original_end_line: 1,
      new_code: '新文本',
      start_line: 1,
      end_line: 1,
      context_before: '前面的上下文',
      context_after: '后面的上下文',
    };
    
    // 即使文档中有格式标记（如 <strong>），也应该能定位
    const result = locateDiff(diff, doc);
    expect(result).not.toBeNull();
  });
});
```

## 十、性能优化

### 10.1 大文档优化

```typescript
// 虚拟滚动：只渲染可见区域的 Decoration

function createVirtualScrollingDecorations(
  doc: any,
  diffs: Diff[],
  viewport: { top: number; bottom: number }
): DecorationSet {
  const decorations: Decoration[] = [];
  
  // 只处理可见区域的 diff
  const visibleDiffs = diffs.filter(diff => {
    if (diff.from === undefined || diff.to === undefined) {
      return false;
    }
    
    const diffTop = getPositionTop(doc, diff.from);
    const diffBottom = getPositionTop(doc, diff.to);
    
    return !(diffBottom < viewport.top || diffTop > viewport.bottom);
  });
  
  // 只为可见的 diff 创建 Decoration
  for (const diff of visibleDiffs) {
    // ... 创建 Decoration
  }
  
  return DecorationSet.create(doc, decorations);
}
```

### 10.2 增量更新

```typescript
// 增量更新 Decoration，而不是重建整个 DecorationSet

function updateDecorationsIncrementally(
  oldDecorations: DecorationSet,
  newDiffs: Diff[],
  doc: any
): DecorationSet {
  // 1. 移除已删除的 diff 的 Decoration
  let decorations = oldDecorations;
  
  // 2. 只为新 diff 创建 Decoration
  const newDecorations: Decoration[] = [];
  for (const diff of newDiffs) {
    if (!oldDecorations.find(diff.from || 0, diff.to || 0)) {
      // 这是一个新的 diff，创建 Decoration
      newDecorations.push(...createDecorationsForDiff(diff, doc));
    }
  }
  
  // 3. 合并新旧 Decoration
  return decorations.add(doc, newDecorations);
}
```

### 10.3 节流处理

```typescript
// 节流用户交互，避免频繁更新

import { throttle } from 'lodash';

const throttledUpdateDecorations = throttle(
  (diffs: Diff[], editor: Editor) => {
    editor.view.dispatch(
      editor.view.state.tr.setMeta(diffPluginKey, {
        type: 'addDiff',
        changes: diffs,
      })
    );
  },
  300 // 300ms 节流
);
```

## 十一、实施计划

### 11.1 任务依赖关系

**依赖关系图**：

```
阶段一：基础功能
  ├─ 1. 后端 Diff 服务（Rust）[无依赖]
  ├─ 2. 工具服务 edit_current_editor_document [依赖：1]
  ├─ 3. 前端 DiffHighlightExtension（基础版本）[无依赖]
  ├─ 4. 多策略匹配（精确匹配、上下文匹配）[依赖：3]
  └─ 5. 应用/拒绝功能 [依赖：3, 4]

阶段二：增强功能
  ├─ 1. 模糊匹配和结构匹配 [依赖：阶段一-4]
  ├─ 2. 置信度评分 [依赖：阶段一-4]
  ├─ 3. 候选位置选择 [依赖：阶段一-4]
  ├─ 4. 高亮预览 [依赖：阶段一-3]
  └─ 5. 批量操作 [依赖：阶段一-5]

阶段三：复杂元素支持
  ├─ 1. 表格 Diff 处理 [依赖：阶段一-3, 阶段一-4]
  ├─ 2. 图片 Diff 处理 [依赖：阶段一-3, 阶段一-4]
  ├─ 3. 代码块 Diff 处理 [依赖：阶段一-3, 阶段一-4]
  └─ 4. 跨节点 Diff [依赖：阶段一-3, 阶段一-4]

阶段四：优化和稳定
  ├─ 1. 虚拟滚动 [依赖：阶段一-3]
  ├─ 2. 增量更新 [依赖：阶段一-3]
  ├─ 3. 完善错误处理 [依赖：阶段一-5, 阶段二-2]
  └─ 4. 完善测试覆盖 [依赖：所有阶段]
```

**关键路径**：
1. 后端 Diff 服务 → 工具服务 → 前端接收
2. 前端 DiffHighlightExtension → 多策略匹配 → 应用/拒绝功能
3. 基础功能 → 增强功能 → 复杂元素支持 → 优化和稳定

### 11.2 阶段一：基础功能（2-3周）

**目标**：实现基本的文本 Diff 功能

**任务**：
1. 实现后端 Diff 服务（Rust）[优先级：高，依赖：无]
2. 实现工具服务 `edit_current_editor_document` [优先级：高，依赖：1]
3. 实现前端 DiffHighlightExtension（基础版本）[优先级：高，依赖：无]
4. 实现多策略匹配（精确匹配、上下文匹配）[优先级：高，依赖：3]
5. 实现应用/拒绝功能 [优先级：高，依赖：3, 4]

**验收标准**：
- 可以接收 AI 返回的 diff 数据
- 可以在编辑器中显示文本删除和插入标记
- 可以应用和拒绝修改

**风险评估**：
- **风险**：多策略匹配实现复杂
- **应对**：先实现精确匹配和上下文匹配，其他策略后续添加
- **风险**：定位准确性不足
- **应对**：充分测试，收集反馈，持续优化

### 11.3 阶段二：增强功能（2-3周）

**目标**：提高定位准确性和用户体验

**任务**：
1. 实现模糊匹配和结构匹配 [优先级：中，依赖：阶段一-4]
2. 实现置信度评分 [优先级：高，依赖：阶段一-4]
3. 实现候选位置选择 [优先级：中，依赖：阶段一-4]
4. 实现高亮预览 [优先级：中，依赖：阶段一-3]
5. 实现批量操作 [优先级：中，依赖：阶段一-5]

**验收标准**：
- 定位准确性 > 90%
- 支持低置信度时的用户确认
- 支持批量接受/拒绝

**风险评估**：
- **风险**：模糊匹配性能问题
- **应对**：使用节流和缓存优化
- **风险**：置信度评分不准确
- **应对**：收集数据，持续调优阈值

### 11.4 阶段三：复杂元素支持（2-3周）

**目标**：支持表格、图片、代码块

**任务**：
1. 实现表格 Diff 处理 [优先级：高，依赖：阶段一-3, 阶段一-4]
   - 实现表格唯一标识符生成
   - 实现表格定位方法
   - 实现表格单元格定位
   - 实现表格 Decoration 渲染
2. 实现图片 Diff 处理 [优先级：中，依赖：阶段一-3, 阶段一-4]
   - 实现图片唯一标识符生成
   - 实现图片定位方法
   - 实现图片对比 Widget
3. 实现代码块 Diff 处理 [优先级：中，依赖：阶段一-3, 阶段一-4]
   - 实现代码块行级 Diff
   - 实现代码块 Decoration 渲染
4. 实现跨节点 Diff [优先级：低，依赖：阶段一-3, 阶段一-4]
   - 实现跨节点 Decoration 分解
   - 实现逻辑关联性维护

**验收标准**：
- 可以处理表格单元格修改
- 可以显示图片对比视图
- 可以处理代码块的行级 Diff

**风险评估**：
- **风险**：表格/图片定位困难
- **应对**：先实现文本，再逐步扩展，充分测试
- **风险**：跨节点 Diff 实现复杂
- **应对**：简化实现，先支持常见场景

### 11.5 阶段四：优化和稳定（1-2周）

**目标**：性能优化和错误处理完善

**任务**：
1. 实现虚拟滚动 [优先级：中，依赖：阶段一-3]
2. 实现增量更新 [优先级：中，依赖：阶段一-3]
3. 实现并发编辑处理 [优先级：高，依赖：阶段一-3, 阶段一-4]
   - 实现文档变化检测
   - 实现 Decoration 位置调整
   - 实现 Decoration 失效处理
   - 实现用户提示
4. 完善错误处理 [优先级：高，依赖：阶段一-5, 阶段二-2]
5. 完善测试覆盖 [优先级：高，依赖：所有阶段]

**验收标准**：
- 大文档（> 10000 字符）性能良好
- 错误处理完善
- 并发编辑时 Decoration 位置正确调整
- 测试覆盖率 > 80%

**风险评估**：
- **风险**：虚拟滚动实现复杂
- **应对**：使用成熟的虚拟滚动库
- **风险**：并发编辑处理性能问题
- **应对**：使用节流和批量处理

### 11.6 实施时间表

**详细时间估算**：

| 阶段 | 任务 | 预估时间 | 依赖 |
|------|------|---------|------|
| **阶段一** | | | |
| | 后端 Diff 服务 | 3-4天 | 无 |
| | 工具服务 | 2-3天 | 后端 Diff 服务 |
| | 前端 DiffHighlightExtension（基础） | 3-4天 | 无 |
| | 多策略匹配（精确、上下文） | 4-5天 | 前端 Extension |
| | 应用/拒绝功能 | 2-3天 | 前端 Extension、多策略匹配 |
| | **小计** | **14-19天** | |
| **阶段二** | | | |
| | 模糊匹配和结构匹配 | 3-4天 | 阶段一-4 |
| | 置信度评分 | 2-3天 | 阶段一-4 |
| | 候选位置选择 | 2-3天 | 阶段一-4 |
| | 高亮预览 | 2-3天 | 阶段一-3 |
| | 批量操作 | 2-3天 | 阶段一-5 |
| | **小计** | **11-16天** | |
| **阶段三** | | | |
| | 表格 Diff 处理 | 4-5天 | 阶段一-3, 阶段一-4 |
| | 图片 Diff 处理 | 3-4天 | 阶段一-3, 阶段一-4 |
| | 代码块 Diff 处理 | 3-4天 | 阶段一-3, 阶段一-4 |
| | 跨节点 Diff | 2-3天 | 阶段一-3, 阶段一-4 |
| | **小计** | **12-16天** | |
| **阶段四** | | | |
| | 虚拟滚动 | 2-3天 | 阶段一-3 |
| | 增量更新 | 2-3天 | 阶段一-3 |
| | 并发编辑处理 | 3-4天 | 阶段一-3, 阶段一-4 |
| | 完善错误处理 | 2-3天 | 阶段一-5, 阶段二-2 |
| | 完善测试覆盖 | 3-4天 | 所有阶段 |
| | **小计** | **12-17天** | |
| **总计** | | **49-68天（7-10周）** | |

**缓冲时间**：建议预留 20% 缓冲时间，总计 **9-12周**。

### 11.7 并行任务

**可以并行执行的任务**：

1. **阶段一**：
   - 后端 Diff 服务 ↔ 前端 DiffHighlightExtension（基础）
   - 可以并行开发，无依赖关系

2. **阶段二**：
   - 模糊匹配 ↔ 结构匹配
   - 高亮预览 ↔ 批量操作
   - 可以并行开发

3. **阶段三**：
   - 表格 Diff ↔ 图片 Diff ↔ 代码块 Diff
   - 可以并行开发

4. **阶段四**：
   - 虚拟滚动 ↔ 增量更新
   - 可以并行开发

**并行执行可以节省时间**：约 5-7 天

## 十二、总结

### 12.1 核心优势

1. **技术兼容性**：与现有实现完全一致，基于 ProseMirror Decoration
2. **功能完整性**：支持所有元素类型（文本、表格、图片、代码块）
3. **定位准确性**：多策略匹配，置信度评分，容错机制
4. **用户体验**：高亮预览，批量操作，撤销/重做
5. **实现成本**：基于现有代码扩展，渐进式增强

### 12.2 关键成功因素

1. **多策略匹配**：提高定位准确性
2. **置信度评分**：识别不确定的修改
3. **容错机制**：多层防护，确保稳定性
4. **按元素类型处理**：不同元素使用不同策略
5. **性能优化**：虚拟滚动，增量更新

### 12.3 风险与应对

**风险**：
- AI 定位不准确
- 大文档性能问题
- 复杂元素处理困难

**应对**：
- 多层防护机制（置信度、候选位置、人工校正）
- 性能优化（虚拟滚动、增量更新、节流）
- 按元素类型分别处理，逐步完善

### 12.4 后续优化方向

1. **智能定位**：使用 AI 辅助定位（如果 AI 能返回更精确的位置信息）
2. **部分接受**：支持逐行/逐单元格接受修改
3. **Diff 历史**：保存修改历史，支持查看和恢复
4. **协作编辑**：支持多用户协作编辑时的 Diff 处理
5. **实时预览**：AI 修改时实时显示 Diff 预览

## 附录

### A. 数据结构定义

```typescript
// 完整的数据结构定义

interface Diff {
  diff_id: string;
  diff_area_id: string;
  diff_type: 'Edit' | 'Insertion' | 'Deletion';
  original_code: string;
  original_start_line: number;
  original_end_line: number;
  new_code: string;
  start_line: number;
  end_line: number;
  context_before?: string | null;
  context_after?: string | null;
  element_type?: 'text' | 'table' | 'image' | 'code_block';
  element_identifier?: string;
  // 前端添加的定位信息
  from?: number;
  to?: number;
  confidence?: number;
  strategy?: string;
}

interface Modification {
  id: string;
  type: 'text_replace' | 'table_cell' | 'image_replace' | 'code_block_replace';
  target: {
    content: string;
    context_before?: string;
    context_after?: string;
    element_type?: 'text' | 'table' | 'image' | 'code_block';
    element_identifier?: string;
  };
  old: string;
  new: string;
  confidence?: number;
}

interface MatchResult {
  found: boolean;
  from: number;
  to: number;
  confidence: number;
  strategy: string;
}

interface LocatedChange extends Modification {
  from?: number;
  to?: number;
  found: boolean;
  strategy: string;
}
```

### B. 配置参数

```typescript
// Diff 系统配置

interface DiffConfig {
  // 匹配策略配置
  matching: {
    exactMatchThreshold: number; // 精确匹配阈值（默认 0.8）
    fuzzyMatchThreshold: number; // 模糊匹配阈值（默认 0.7）
    contextMatchThreshold: number; // 上下文匹配阈值（默认 0.7）
    confidenceThreshold: number; // 置信度阈值（默认 0.7）
  };
  
  // 性能配置
  performance: {
    virtualScrollEnabled: boolean; // 虚拟滚动（默认 true）
    incrementalUpdate: boolean; // 增量更新（默认 true）
    throttleDelay: number; // 节流延迟（默认 300ms）
  };
  
  // UI 配置
  ui: {
    highlightColor: {
      deletion: string; // 删除标记颜色（默认 '#fee'）
      insertion: string; // 插入标记颜色（默认 '#efe'）
      modification: string; // 修改标记颜色（默认 '#ffeb3b'）
    };
    showActionButtons: boolean; // 显示操作按钮（默认 true）
    autoScroll: boolean; // 自动滚动到第一个修改（默认 true）
  };
}

const defaultConfig: DiffConfig = {
  matching: {
    exactMatchThreshold: 0.8,
    fuzzyMatchThreshold: 0.7,
    contextMatchThreshold: 0.7,
    confidenceThreshold: 0.7,
  },
  performance: {
    virtualScrollEnabled: true,
    incrementalUpdate: true,
    throttleDelay: 300,
  },
  ui: {
    highlightColor: {
      deletion: '#fee',
      insertion: '#efe',
      modification: '#ffeb3b',
    },
    showActionButtons: true,
    autoScroll: true,
  },
};
```

### C. API 参考

#### 后端 API

```rust
// src-tauri/src/services/tool_service.rs

/// 编辑当前编辑器打开的文档
/// 
/// 参数：
/// - current_file: 当前文件路径
/// - current_content: 当前编辑器内容
/// - content: 新文档内容
/// - target_content: 目标内容（可选）
/// - context_before: 上下文前（可选）
/// - context_after: 上下文后（可选）
/// - element_type: 元素类型（可选）
/// - element_identifier: 元素标识符（可选）
/// 
/// 返回：
/// - diff_area_id: Diff 区域 ID
/// - file_path: 文件路径
/// - old_content: 旧内容
/// - new_content: 新内容
/// - diffs: Diff 列表
pub async fn edit_current_editor_document(
    &self,
    tool_call: &ToolCall,
) -> Result<ToolResult, String>
```

#### 前端 API

```typescript
// src/components/Editor/extensions/DiffHighlightExtension.ts

/// DiffHighlightExtension 配置选项
export interface DiffHighlightOptions {
  /// 获取当前 diffs
  getDiffs: () => Diff[] | null;
  
  /// 获取旧内容
  getOldContent: () => string | null;
  
  /// 获取新内容
  getNewContent: () => string | null;
  
  /// 应用 diff 回调
  onApplyDiff?: () => void;
  
  /// 拒绝 diff 回调
  onRejectDiff?: () => void;
}

/// 创建 DiffHighlightExtension
export const DiffHighlightExtension = Extension.create<DiffHighlightOptions>({
  // ...
});
```

```typescript
// src/stores/editorStore.ts

/// 设置标签页的 diff 数据
setTabDiff: (
  tabId: string,
  diffAreaId: string,
  diffs: Diff[],
  oldContent: string,
  newContent: string
) => void;

/// 清除标签页的 diff 数据
clearTabDiff: (tabId: string) => void;
```

### D. 常见问题

#### Q1: 为什么定位失败？

**可能原因**：
1. 文档内容在 AI 处理期间发生了变化
2. 上下文信息不够准确
3. 格式变化导致文本不匹配

**解决方案**：
- 使用候选位置让用户选择
- 提供手动定位功能
- 增强上下文提取逻辑

#### Q2: 如何处理大文档？

**解决方案**：
- 使用虚拟滚动，只渲染可见区域
- 使用增量更新，不重建整个 DecorationSet
- 使用节流处理，避免频繁更新

#### Q3: 表格和图片如何定位？

**解决方案**：
- 表格：使用表格标识符或单元格位置
- 图片：使用图片 URL 或节点路径
- 如果标识符不可用，使用上下文匹配

#### Q4: 如何提高定位准确性？

**建议**：
1. AI 提供更详细的上下文信息
2. 使用多策略匹配，选择最佳结果
3. 使用置信度评分，低置信度时要求用户确认
4. 提供候选位置让用户选择

### E. 参考资料

1. **ProseMirror 文档**：
   - [Decoration API](https://prosemirror.net/docs/ref/#view.Decoration)
   - [Plugin System](https://prosemirror.net/docs/guide/#state)

2. **TipTap 文档**：
   - [Extension Guide](https://tiptap.dev/guide/extensions)
   - [ProseMirror Integration](https://tiptap.dev/guide/custom-extensions)

3. **Diff 算法**：
   - [similar crate](https://docs.rs/similar/latest/similar/)
   - [Myers Diff Algorithm](https://blog.jcoglan.com/2017/02/12/the-myers-diff-algorithm-part-1/)

4. **相关项目**：
   - [Void 文档编辑实现](docs/Void文档编辑实现逻辑分析.md)
   - [Binder 文档编辑功能方案](docs/Binder 层次三 AI 聊天窗口文档编辑功能方案.md)

---

**文档版本**：v1.0  
**最后更新**：2024年  
**维护者**：Binder 开发团队