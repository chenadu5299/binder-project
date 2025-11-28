use serde::{Serialize, Deserialize};

/// 文档分析类型
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AnalysisType {
    Summarize,        // 总结
    ExtractKeywords, // 提取关键词
    FindReferences,  // 查找引用
    ExtractEntities, // 提取实体（人物、地点、事件等）
}

/// 引用信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Reference {
    pub text: String,          // 引用的文本
    pub source: String,        // 引用的来源
    pub position: usize,       // 在文档中的位置（字符偏移）
    pub reference_type: String, // 引用类型：document, person, event, concept
}

/// 实体信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Entity {
    pub name: String,          // 实体名称
    pub entity_type: String,   // 实体类型：person, location, event, concept
    pub description: String,  // 实体描述
    pub positions: Vec<usize>, // 在文档中出现的位置
}

/// 文档分析结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocumentAnalysisResult {
    pub summary: Option<String>,
    pub keywords: Vec<String>,
    pub references: Vec<Reference>,
    pub entities: Vec<Entity>,
}

/// 文档分析服务
pub struct DocumentAnalysisService;

impl DocumentAnalysisService {
    /// 构建分析提示词
    pub fn build_analysis_prompt(
        content: &str,
        analysis_type: &AnalysisType,
    ) -> String {
        // 限制内容长度，避免超出 token 限制
        let content_preview: String = content.chars().take(4000).collect();
        
        match analysis_type {
            AnalysisType::Summarize => format!(
                "请对以下文档进行总结，要求：\n\
                1. 总结主要内容（3-5 点）\n\
                2. 提取关键信息\n\
                3. 保持简洁准确\n\
                4. 使用中文输出\n\n\
                文档内容：\n{}",
                content_preview
            ),
            AnalysisType::ExtractKeywords => format!(
                "请从以下文档中提取关键词，要求：\n\
                1. 提取 5-10 个关键词\n\
                2. 按重要性排序\n\
                3. 使用中文\n\
                4. 返回 JSON 格式：{{\"keywords\": [\"关键词1\", \"关键词2\", ...]}}\n\n\
                文档内容：\n{}",
                content_preview
            ),
            AnalysisType::FindReferences => format!(
                "请分析以下文档，找出：\n\
                1. 引用的其他文档或资料\n\
                2. 提到的关键人物、事件、概念\n\
                3. 需要进一步了解的内容\n\
                4. 返回 JSON 格式：{{\"references\": [{{\"text\": \"引用文本\", \"source\": \"来源\", \"type\": \"类型\"}}]}}\n\n\
                文档内容：\n{}",
                content_preview
            ),
            AnalysisType::ExtractEntities => format!(
                "请从以下文档中提取实体信息，包括：\n\
                1. 人物（姓名、角色）\n\
                2. 地点（地名、位置）\n\
                3. 事件（事件名称、时间）\n\
                4. 概念（专业术语、概念）\n\
                5. 返回 JSON 格式：{{\"entities\": [{{\"name\": \"实体名\", \"type\": \"类型\", \"description\": \"描述\"}}]}}\n\n\
                文档内容：\n{}",
                content_preview
            ),
        }
    }
}

