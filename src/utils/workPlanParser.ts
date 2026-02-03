/**
 * 工作计划解析工具（简化版）
 * 从 AI 回复中提取执行计划信息
 */

export interface WorkPlan {
    documents: string[];  // 需要读取的文件列表
    websites: string[];   // 需要浏览的网站列表
    steps: string[];      // 执行步骤描述
    rawText: string;      // 原始计划文本
}

/**
 * 从 AI 回复中解析工作计划
 * 使用简单的关键词匹配和正则表达式提取计划信息
 */
export function parseWorkPlan(content: string): WorkPlan | null {
    if (!content || content.trim().length === 0) {
        return null;
    }

    // 检测是否包含计划相关的关键词
    const planKeywords = [
        /执行计划/i,
        /工作计划/i,
        /需要读取/i,
        /需要浏览/i,
        /执行步骤/i,
        /计划如下/i,
        /我将/i,
        /首先.*然后/i,
    ];

    const hasPlan = planKeywords.some(keyword => keyword.test(content));
    if (!hasPlan) {
        return null;
    }

    const plan: WorkPlan = {
        documents: [],
        websites: [],
        steps: [],
        rawText: content,
    };

    // 提取文件列表
    // 匹配模式：文件名（.md, .txt, .json, .ts, .tsx, .js, .jsx, .py, .rs 等）
    const filePattern = /([\w\-./]+\.(?:md|txt|json|ts|tsx|js|jsx|py|rs|yml|yaml|toml|xml|html|css|scss|less|vue|svelte|go|java|cpp|c|h|hpp|php|rb|swift|kt|dart|sh|bat|ps1|sql|r|m|mm|pl|pm|lua|vim|zsh|fish|bash|conf|config|ini|log|lock|lockb|package|lockfile|gradle|properties|gitignore|gitattributes|editorconfig|prettierrc|eslintrc|babelrc|tsconfig|jsconfig|webpack|rollup|vite|dockerfile|makefile|cmake|ninja|sln|vcxproj|csproj|sbt|build|pom|gradle|requirements|pipfile|poetry|pyproject|setup|manifest|gemfile|rakefile|podfile|cartfile|pubspec|composer|package\.json|package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb|Cargo\.toml|go\.mod|go\.sum|pom\.xml|build\.gradle|settings\.gradle|Podfile|Cartfile|pubspec\.yaml|composer\.json|requirements\.txt|Pipfile|pyproject\.toml|setup\.py|MANIFEST\.in|Gemfile|Rakefile|Podfile|Cartfile|pubspec\.yaml|composer\.json))/gi;
    const fileMatches = content.match(filePattern);
    if (fileMatches) {
        plan.documents = [...new Set(fileMatches)]; // 去重
    }

    // 提取网站列表
    // 匹配 URL 模式
    const urlPattern = /(https?:\/\/[^\s]+)/gi;
    const urlMatches = content.match(urlPattern);
    if (urlMatches) {
        plan.websites = [...new Set(urlMatches)]; // 去重
    }

    // 提取执行步骤
    // 匹配步骤模式：1. 2. 3. 或 步骤1、步骤2 等
    const stepPattern = /(?:步骤\s*)?[1-9]\d*[\.、]\s*([^\n]+)/gi;
    const stepMatches = [...content.matchAll(stepPattern)];
    if (stepMatches.length > 0) {
        plan.steps = stepMatches.map(match => match[1]?.trim() || match[0]).filter(Boolean);
    } else {
        // 如果没有明确的步骤编号，尝试提取"首先"、"然后"、"最后"等结构
        const sequentialPattern = /(?:首先|然后|接着|最后|第一步|第二步|第三步)[：:]\s*([^\n]+)/gi;
        const sequentialMatches = [...content.matchAll(sequentialPattern)];
        if (sequentialMatches.length > 0) {
            plan.steps = sequentialMatches.map(match => match[1]?.trim() || match[0]).filter(Boolean);
        }
    }

    // 如果提取到了任何计划信息，返回计划对象
    if (plan.documents.length > 0 || plan.websites.length > 0 || plan.steps.length > 0) {
        return plan;
    }

    // 如果没有提取到结构化信息，但包含计划关键词，返回原始文本作为步骤
    if (hasPlan && content.length < 500) {
        plan.steps = [content];
        return plan;
    }

    return null;
}

/**
 * 判断消息是否包含工作计划
 */
export function hasWorkPlan(content: string): boolean {
    return parseWorkPlan(content) !== null;
}

