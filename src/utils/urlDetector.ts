/**
 * URL 检测工具
 */

// URL 正则表达式（支持 http、https、ftp、www 等）
const URL_REGEX = /(https?:\/\/[^\s]+|www\.[^\s]+|ftp:\/\/[^\s]+)/gi;

/**
 * 从文本中提取所有 URL
 */
export function extractUrls(text: string): string[] {
    const matches = text.match(URL_REGEX);
    if (!matches) return [];
    
    // 规范化 URL（为 www. 开头的添加 http://）
    return matches.map(url => {
        if (url.startsWith('www.')) {
            return `http://${url}`;
        }
        return url;
    }).filter((url, index, self) => self.indexOf(url) === index); // 去重
}

/**
 * 检查文本是否包含 URL
 */
export function hasUrl(text: string): boolean {
    return URL_REGEX.test(text);
}

/**
 * 检查是否为有效的 URL
 */
export function isValidUrl(url: string): boolean {
    try {
        new URL(url);
        return true;
    } catch {
        return false;
    }
}

/**
 * 从文本中提取第一个 URL
 */
export function extractFirstUrl(text: string): string | null {
    const urls = extractUrls(text);
    return urls.length > 0 ? urls[0] : null;
}

