# DOCX 文件处理技术方案大纲

## 文档信息
- **版本**：v1.0
- **创建日期**：2025-01
- **方案类型**：预览与编辑分离方案
- **核心原则**：预览用简单方案，编辑用复杂方案

---

## 一、方案概述

### 1.1 核心策略

**分离处理原则**：
- **预览阶段**：使用简单方案，快速渲染，满足查看和复制需求
- **编辑阶段**：使用复杂方案，精确格式保留，支持回写 DOCX

### 1.2 处理流程

```
DOCX 文件打开
  ↓
判断用户意图（预览 vs 编辑）
  ↓
┌─────────────────┬─────────────────┐
│   预览模式      │   编辑模式       │
│                 │                 │
│ 简单方案        │ 复杂方案         │
│ Pandoc 直接转换 │ 格式提取+后处理  │
│ iframe 显示     │ TipTap 编辑器    │
│ 只读+可复制     │ 可编辑+可保存    │
└─────────────────┴─────────────────┘
```

---

## 二、预览阶段方案（简单方案）

### 2.1 技术方案

#### 2.1.1 转换流程

```rust
// 后端：Pandoc 直接转换
pandoc document.docx \
  --to html \
  --standalone \
  --wrap=none \
  --extract-media=. \
  +raw_html \
  +native_divs \
  +native_spans
```

**关键参数**：
- `--standalone`：生成完整 HTML，包含 `<style>` 标签
- `+raw_html`、`+native_divs`、`+native_spans`：保留 HTML 结构
- `--extract-media=.`：提取图片到当前目录

#### 2.1.2 前端渲染

```typescript
// 使用 iframe 隔离样式
<iframe
  srcDoc={htmlContent}
  className="w-full h-full border-0"
  sandbox="allow-same-origin"
/>
```

**优势**：
- 样式隔离，不影响主应用
- 支持选中和复制
- 渲染速度快

### 2.2 格式还原度评估

#### 2.2.1 完全保留（95%+）
- ✅ 文本内容
- ✅ 段落结构
- ✅ 标题层级（H1-H6）
- ✅ 列表（有序、无序）
- ✅ 表格结构（行列、合并）
- ✅ 图片（大小、位置）

#### 2.2.2 基本保留（80-85%）
- ✅ 粗体、斜体、下划线
- ✅ 段落对齐（左、中、右、两端对齐）
- ✅ 行距（单倍、1.5倍、2倍）
- ✅ 基础表格格式（边框、对齐）

#### 2.2.3 部分保留（70-80%）
- ⚠️ 字体（可能转换为系统字体）
- ⚠️ 字号（可能转换为相对大小）
- ⚠️ 颜色（部分颜色可能丢失）
- ⚠️ 背景色（高亮）

#### 2.2.4 不支持（0%）
- ❌ 页眉页脚
- ❌ 页码
- ❌ 分栏
- ❌ 文本框
- ❌ 艺术字
- ❌ 公式（MathML）

### 2.3 与 Word 的差异对比

#### 2.3.1 视觉差异
- **基本一致**：文本内容、段落结构、基础样式（粗体、斜体、对齐）
- **轻微差异**：精确字号可能变为相对大小，部分颜色可能不同
- **明显差异**：页眉页脚、分栏、复杂表格格式

#### 2.3.2 功能差异
- **只读模式**：不能编辑
- **可选中复制**：✅ 支持
- **打印**：浏览器打印，格式可能略有差异

#### 2.3.3 适用场景
- ✅ **适合**：大部分文档预览、内容查看、文本复制
- ⚠️ **不适合**：需要精确格式的文档、包含页眉页脚的正式文档

### 2.4 实现细节

#### 2.4.1 后端实现

```rust
// src-tauri/src/services/pandoc_service.rs

/// 预览模式：简单转换
pub async fn convert_docx_to_html_preview(
    docx_path: &Path,
    output_dir: &Path,
) -> Result<String, String> {
    let mut cmd = Command::new(self.pandoc_path);
    cmd.arg(docx_path)
        .arg("--to")
        .arg("html")
        .arg("--standalone")
        .arg("--wrap=none")
        .arg("--extract-media")
        .arg(output_dir)
        .arg("+raw_html")
        .arg("+native_divs")
        .arg("+native_spans");
    
    let output = cmd.output()
        .map_err(|e| format!("Pandoc 执行失败: {}", e))?;
    
    if !output.status.success() {
        let error = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Pandoc 转换失败: {}", error));
    }
    
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}
```

#### 2.4.2 前端实现

```typescript
// src/components/Editor/FilePreview.tsx

export const DocxPreview: React.FC<{ filePath: string }> = ({ filePath }) => {
  const [htmlContent, setHtmlContent] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadPreview = async () => {
      try {
        setLoading(true);
        const html = await invoke<string>('preview_docx', { path: filePath });
        setHtmlContent(html);
      } catch (error) {
        console.error('加载预览失败:', error);
        setHtmlContent('<p>预览加载失败</p>');
      } finally {
        setLoading(false);
      }
    };
    
    loadPreview();
  }, [filePath]);

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="w-full h-full">
      <iframe
        srcDoc={htmlContent}
        className="w-full h-full border-0"
        sandbox="allow-same-origin"
        title="DOCX 预览"
      />
    </div>
  );
};
```

#### 2.4.3 Tauri 命令

```rust
// src-tauri/src/commands/file_commands.rs

#[tauri::command]
pub async fn preview_docx(path: String) -> Result<String, String> {
    let docx_path = PathBuf::from(&path);
    let temp_dir = std::env::temp_dir().join("binder_preview");
    std::fs::create_dir_all(&temp_dir)
        .map_err(|e| format!("创建临时目录失败: {}", e))?;
    
    let pandoc_service = PandocService::new();
    pandoc_service.convert_docx_to_html_preview(&docx_path, &temp_dir)
}
```

---

## 三、编辑阶段方案（复杂方案）

### 3.1 技术方案

#### 3.1.1 处理流程

```
用户点击"编辑"按钮
  ↓
创建草稿副本（document.draft.docx）
  ↓
格式提取阶段
  ├─ 样式定义提取（word/styles.xml）
  ├─ 段落格式提取（word/document.xml）
  ├─ 运行格式提取（颜色、字体、字号等）
  ├─ 表格格式提取（边框、背景色、合并等）
  └─ 图片格式提取（大小、对齐、路径等）
  ↓
Pandoc 转换（DOCX → HTML）
  ↓
格式应用阶段
  ├─ HTML 元素匹配（ID、文本、位置）
  ├─ 段落格式应用（对齐、样式）
  ├─ 运行格式应用（插入 <span> 标签）
  ├─ 表格格式应用（边框、背景色、合并）
  └─ 图片格式应用（大小、对齐、路径）
  ↓
TipTap 编辑器加载（保留内联样式）
  ↓
用户编辑 → 保存（HTML → DOCX）
```

#### 3.1.2 核心组件

**后端模块**：
- `extract_docx_formatting()` - 格式提取
- `apply_docx_formatting()` - 格式应用
- `format_utils.rs` - 格式转换工具

**前端模块**：
- `htmlStyleProcessor.ts` - HTML 样式处理
- `applyRunFormatting.ts` - 运行格式应用
- TipTap 编辑器配置（保留内联样式）

### 3.2 格式还原度评估

#### 3.2.1 完全保留（95%+）
- ✅ 文本内容
- ✅ 段落结构
- ✅ 标题层级
- ✅ 列表
- ✅ 表格结构
- ✅ 图片

#### 3.2.2 精确保留（90-95%）
- ✅ 段落对齐（精确）
- ✅ 运行级别颜色（精确）
- ✅ 字体、字号（精确）
- ✅ 粗体、斜体、下划线（精确）
- ✅ 表格边框、背景色（精确）
- ✅ 图片大小、对齐（精确）

#### 3.2.3 部分保留（70-80%）
- ⚠️ 复杂样式（自定义样式）
- ⚠️ 字符间距
- ⚠️ 段落边框、底纹

#### 3.2.4 不支持（0%）
- ❌ 页眉页脚
- ❌ 页码
- ❌ 分栏
- ❌ 文本框
- ❌ 艺术字
- ❌ 公式（MathML）

### 3.3 实现细节

#### 3.3.1 格式提取

```rust
// 提取样式定义
let style_definitions = extract_style_definitions(&styles_xml)?;

// 提取段落格式
let paragraphs = extract_paragraph_formatting(&document_xml, &style_definitions)?;

// 提取表格格式
let tables = extract_table_formatting(&document_xml)?;

// 提取图片格式
let images = extract_image_formatting(&document_xml, &image_relationships)?;
```

#### 3.3.2 格式应用

```rust
// 应用段落格式
let html = apply_paragraph_formatting(html, &paragraphs)?;

// 应用运行格式
let html = apply_run_formatting(html, &paragraphs)?;

// 应用表格格式
let html = apply_table_formatting(html, &tables)?;

// 应用图片格式
let html = apply_image_formatting(html, &images, &media_base_path)?;
```

#### 3.3.3 TipTap 配置

```typescript
// 关键配置：保留内联样式
const editor = useEditor({
  parseOptions: {
    preserveWhitespace: 'full',
  },
  editorProps: {
    transformPastedHTML: (html: string) => {
      // 不进行任何转换，直接返回原始 HTML
      return html;
    },
  },
  extensions: [
    TextStyle,
    Color,
    FontFamily,
    FontSize,
    TextAlign,
    Underline,
    // ... 其他扩展
  ],
});
```

---

## 四、两种方案对比

### 4.1 技术复杂度对比

| 维度 | 预览方案（简单） | 编辑方案（复杂） |
|------|----------------|----------------|
| **转换步骤** | 1 步（Pandoc 直接转换） | 3 步（提取→转换→应用） |
| **代码量** | ~100 行 | ~2000+ 行 |
| **依赖库** | Pandoc | Pandoc + quick-xml + scraper |
| **开发时间** | 1-2 天 | 2-4 周 |
| **维护成本** | 低 | 高 |

### 4.2 性能对比

| 维度 | 预览方案 | 编辑方案 |
|------|---------|---------|
| **转换速度** | 快（< 1 秒） | 慢（2-5 秒） |
| **内存占用** | 低 | 高 |
| **大文件处理** | 良好 | 需要优化 |

### 4.3 格式还原度对比

| 格式类型 | 预览方案 | 编辑方案 |
|---------|---------|---------|
| **内容结构** | 95%+ | 95%+ |
| **基础格式** | 80-85% | 90-95% |
| **精确格式** | 70-80% | 90-95% |
| **复杂格式** | 50-60% | 70-80% |

### 4.4 适用场景对比

| 场景 | 预览方案 | 编辑方案 |
|------|---------|---------|
| **快速查看** | ✅ 适合 | ❌ 过度 |
| **内容复制** | ✅ 适合 | ❌ 过度 |
| **简单编辑** | ❌ 不支持 | ✅ 适合 |
| **精确格式编辑** | ❌ 不支持 | ✅ 适合 |
| **复杂文档** | ⚠️ 部分支持 | ✅ 适合 |

---

## 五、实现检查清单

### 5.1 预览阶段实现

#### 后端实现
- [ ] `preview_docx` Tauri 命令
- [ ] Pandoc 转换函数（预览模式）
- [ ] 临时目录管理
- [ ] 错误处理

#### 前端实现
- [ ] `DocxPreview` 组件
- [ ] iframe 渲染
- [ ] 加载状态显示
- [ ] 错误提示

#### 测试验证
- [ ] 基础文档预览
- [ ] 复杂格式文档预览
- [ ] 大文件预览性能
- [ ] 选中复制功能

### 5.2 编辑阶段实现

#### 后端实现
- [ ] 格式提取模块
  - [ ] 样式定义提取
  - [ ] 段落格式提取
  - [ ] 运行格式提取
  - [ ] 表格格式提取
  - [ ] 图片格式提取
- [ ] 格式应用模块
  - [ ] HTML 元素匹配
  - [ ] 段落格式应用
  - [ ] 运行格式应用
  - [ ] 表格格式应用
  - [ ] 图片格式应用
- [ ] 格式转换工具
  - [ ] 颜色转换
  - [ ] 字体转换
  - [ ] 字号转换
  - [ ] 文本匹配

#### 前端实现
- [ ] HTML 样式处理器
- [ ] 运行格式应用器
- [ ] TipTap 编辑器配置
- [ ] 格式工具栏

#### 测试验证
- [ ] 格式提取准确性
- [ ] 格式应用准确性
- [ ] 编辑后保存格式保留
- [ ] 往返转换测试

---

## 六、性能优化

### 6.1 预览阶段优化

#### 缓存机制
```typescript
// 缓存预览结果（文件路径 + 修改时间）
const cacheKey = `${filePath}_${lastModifiedTime}`;
if (previewCache.has(cacheKey)) {
  return previewCache.get(cacheKey);
}
```

#### 异步加载
- 大文件分块加载
- 显示加载进度
- 支持取消操作

### 6.2 编辑阶段优化

#### 格式提取优化
- 样式定义缓存（一次性读取）
- 流式处理大文件
- 批量处理段落

#### 格式应用优化
- 文本匹配缓存
- 正则表达式预编译
- DOM 操作批处理

---

## 七、用户体验优化

### 7.1 预览模式体验

#### 视觉反馈
- 加载状态显示
- 预览区域标识
- 只读模式提示

#### 交互优化
- 支持选中复制
- 支持键盘导航
- 支持缩放（可选）

### 7.2 编辑模式体验

#### 编辑按钮
- 位置：预览区域顶部
- 样式：蓝色按钮，带编辑图标
- 提示：点击创建可编辑副本

#### 草稿文件管理
- 文件树中标识草稿文件
- 标签页显示 `[草稿]` 前缀
- 提供清理未使用草稿功能

#### 保存提示
- 保存进度显示
- 保存成功/失败提示
- 草稿文件保存位置提示

---

## 八、错误处理

### 8.1 预览阶段错误

#### Pandoc 不可用
- 检测 Pandoc 可用性
- 显示友好错误提示
- 提供安装指南链接

#### 文件损坏
- 捕获转换错误
- 显示错误占位符
- 提示用户文件可能损坏

### 8.2 编辑阶段错误

#### 格式提取失败
- 降级为简单转换
- 提示格式可能丢失
- 允许用户继续编辑

#### 格式应用失败
- 保留原始 HTML
- 记录错误日志
- 允许用户继续编辑

---

