use std::path::Path;
use std::time::SystemTime;

pub struct FileSystemService;

impl FileSystemService {
    pub fn new() -> Self {
        Self
    }
    
    // ⚠️ Week 17.1.2：检查文件是否被外部修改
    pub fn check_external_modification(
        &self,
        path: &Path,
        last_modified: SystemTime,
    ) -> Result<bool, String> {
        let metadata = std::fs::metadata(path)
            .map_err(|e| format!("获取文件元数据失败: {}", e))?;
        
        let current_modified = metadata.modified()
            .map_err(|e| format!("获取文件修改时间失败: {}", e))?;
        
        Ok(current_modified > last_modified)
    }
    
    // 获取文件修改时间
    pub fn get_file_modified_time(path: &Path) -> Result<SystemTime, String> {
        let metadata = std::fs::metadata(path)
            .map_err(|e| format!("获取文件元数据失败: {}", e))?;
        
        metadata.modified()
            .map_err(|e| format!("获取文件修改时间失败: {}", e))
    }
}

