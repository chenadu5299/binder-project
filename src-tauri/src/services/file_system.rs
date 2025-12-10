use std::path::Path;
use std::time::SystemTime;

pub struct FileSystemService;

impl FileSystemService {
    pub fn new() -> Self {
        Self
    }
    
    // ⚠️ Week 17.1.2：检查文件是否被外部修改
    // ⚠️ 关键修复：添加时间容差（1秒），避免因时间精度问题导致的误判
    pub fn check_external_modification(
        &self,
        path: &Path,
        last_modified: SystemTime,
    ) -> Result<bool, String> {
        let metadata = std::fs::metadata(path)
            .map_err(|e| format!("获取文件元数据失败: {}", e))?;
        
        let current_modified = metadata.modified()
            .map_err(|e| format!("获取文件修改时间失败: {}", e))?;
        
        // ⚠️ 关键修复：添加 1 秒容差，避免因时间精度或文件系统延迟导致的误判
        // 如果文件修改时间比记录的时间晚超过 1 秒，才认为是外部修改
        let time_diff = current_modified
            .duration_since(last_modified)
            .unwrap_or_default();
        
        // 只有时间差超过 1 秒才认为是外部修改（排除应用自身保存导致的微小时间差）
        Ok(time_diff.as_secs() > 1)
    }
    
    // 获取文件修改时间
    pub fn get_file_modified_time(path: &Path) -> Result<SystemTime, String> {
        let metadata = std::fs::metadata(path)
            .map_err(|e| format!("获取文件元数据失败: {}", e))?;
        
        metadata.modified()
            .map_err(|e| format!("获取文件修改时间失败: {}", e))
    }
}

