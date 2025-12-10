// 临时文件清理工具

/**
 * 从引用列表中提取临时文件路径
 */
export function extractTempFilePaths(references: Array<{ type: string; path?: string }>): string[] {
    const tempPaths: string[] = [];
    
    for (const ref of references) {
        // 只处理文件引用，且路径在临时目录中
        if (ref.type === 'file' && ref.path && ref.path.startsWith('.binder/temp/')) {
            tempPaths.push(ref.path);
        }
    }
    
    return tempPaths;
}

/**
 * 清理临时文件（延迟清理，保留一段时间以便重新发送）
 */
export async function cleanupTempFiles(
    workspacePath: string | null,
    filePaths: string[],
    delayMs: number = 3600000, // 默认 1 小时后清理
): Promise<void> {
    if (!workspacePath || filePaths.length === 0) {
        return;
    }
    
    // 延迟清理
    setTimeout(async () => {
        try {
            const { invoke } = await import('@tauri-apps/api/core');
            const cleanedCount = await invoke<number>('cleanup_temp_files', {
                workspacePath,
                filePaths,
            });
        } catch (error) {
            console.error('清理临时文件失败:', error);
        }
    }, delayMs);
}

/**
 * 清理过期的临时文件（启动时调用）
 */
export async function cleanupExpiredTempFiles(
    workspacePath: string | null,
    maxAgeHours: number = 24, // 默认清理 24 小时前的文件
): Promise<number> {
    if (!workspacePath) {
        return 0;
    }
    
    try {
        const { invoke } = await import('@tauri-apps/api/core');
        const cleanedCount = await invoke<number>('cleanup_expired_temp_files', {
            workspacePath,
            maxAgeHours,
        });
        return cleanedCount;
    } catch (error) {
        console.error('清理过期临时文件失败:', error);
        return 0;
    }
}

