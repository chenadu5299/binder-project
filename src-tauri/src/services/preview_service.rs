// src-tauri/src/services/preview_service.rs

use std::path::{Path, PathBuf};
use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};
use serde::{Serialize, Deserialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PreviewProgressEvent {
    pub status: String,      // "started" | "converting" | "completed" | "failed"
    pub progress: u8,        // 0-100
    pub message: String,
}

pub struct PreviewService {
    cache: HashMap<String, CachedPreview>,
    cache_dir: PathBuf,
}

struct CachedPreview {
    html_content: String,
    media_dir: PathBuf,
    cached_at: SystemTime,
    file_modified_time: SystemTime,
}

impl PreviewService {
    /// 创建预览服务实例
    /// 
    /// 初始化失败时返回错误，而不是 panic
    /// 在应用启动时应该检查预览服务可用性
    pub fn new() -> Result<Self, String> {
        // 创建缓存目录
        let cache_dir = dirs::cache_dir()
            .ok_or_else(|| "无法获取缓存目录".to_string())?
            .join("binder")
            .join("preview_cache");
        
        // 创建缓存目录，失败时返回错误
        std::fs::create_dir_all(&cache_dir)
            .map_err(|e| {
                format!(
                    "创建预览缓存目录失败: {}。请检查磁盘空间和目录权限。",
                    e
                )
            })?;
        
        // 检查目录是否可写
        let test_file = cache_dir.join(".test_write");
        if let Err(e) = std::fs::write(&test_file, b"test") {
            return Err(format!(
                "预览缓存目录不可写: {}。请检查目录权限。",
                e
            ));
        }
        let _ = std::fs::remove_file(&test_file); // 清理测试文件
        
        Ok(Self {
            cache: HashMap::new(),
            cache_dir,
        })
    }
    
    /// 获取预览内容（带缓存）
    /// 
    /// 注意：此方法需要 &mut self，但在异步上下文中使用 MutexGuard 会有问题
    /// 因此我们提供两个方法：一个用于检查缓存，一个用于更新缓存
    pub fn check_cache(&self, docx_path: &Path) -> Result<Option<String>, String> {
        let cache_key = self.get_cache_key(docx_path)?;
        
        if let Some(cached) = self.cache.get(&cache_key) {
            // 检查文件是否被修改
            let current_mtime = std::fs::metadata(docx_path)
                .and_then(|m| m.modified())
                .unwrap_or_else(|_| SystemTime::now());
            
            if current_mtime == cached.file_modified_time {
                // 缓存有效，直接返回
                return Ok(Some(cached.html_content.clone()));
            }
        }
        
        Ok(None)
    }
    
    /// 更新缓存
    pub fn update_cache(
        &mut self,
        docx_path: &Path,
        html_content: String,
        media_dir: PathBuf,
    ) -> Result<(), String> {
        let cache_key = self.get_cache_key(docx_path)?;
        let file_modified_time = std::fs::metadata(docx_path)
            .and_then(|m| m.modified())
            .unwrap_or_else(|_| SystemTime::now());
        
        self.cache.insert(cache_key, CachedPreview {
            html_content,
            media_dir,
            cached_at: SystemTime::now(),
            file_modified_time,
        });
        
        Ok(())
    }
    
    /// 获取缓存目录
    pub fn get_cache_dir(&self) -> &Path {
        &self.cache_dir
    }
    
    /// 生成缓存键（文件路径 + 修改时间 + 文件大小）
    /// 
    /// 包含文件大小可以检测文件内容变化但修改时间不变的情况
    /// 使用 SHA256 哈希算法降低冲突风险
    pub fn get_cache_key(&self, docx_path: &Path) -> Result<String, String> {
        use sha2::{Sha256, Digest};
        
        let metadata = std::fs::metadata(docx_path)
            .map_err(|e| format!("无法读取文件: {}", e))?;
        
        let mtime = metadata.modified()
            .unwrap_or_else(|_| SystemTime::now());
        
        let mtime_secs = mtime.duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        
        let file_size = metadata.len();
        
        // 使用 SHA256 哈希：文件路径 + 修改时间 + 文件大小
        let mut hasher = Sha256::new();
        hasher.update(docx_path.to_string_lossy().as_bytes());
        hasher.update(&mtime_secs.to_le_bytes());
        hasher.update(&file_size.to_le_bytes());
        
        let hash = hasher.finalize();
        Ok(format!("{:x}", hash))
    }
    
    /// 清理过期缓存（缓存时间超过 1 小时）
    pub fn cleanup_expired_cache(&mut self) {
        let now = SystemTime::now();
        let one_hour = std::time::Duration::from_secs(3600);
        
        self.cache.retain(|_key, cached| {
            if let Ok(duration) = now.duration_since(cached.cached_at) {
                if duration > one_hour {
                    // 删除缓存目录
                    if let Err(e) = std::fs::remove_dir_all(&cached.media_dir) {
                        eprintln!("清理缓存目录失败: {:?}, 错误: {}", cached.media_dir, e);
                    }
                    return false;
                }
            }
            true
        });
    }
    
    /// 清理特定文件的预览缓存
    pub fn cleanup_file_cache(&mut self, docx_path: &Path) -> Result<(), String> {
        let cache_key = self.get_cache_key(docx_path)?;
        
        // 从缓存中移除
        if let Some(cached) = self.cache.remove(&cache_key) {
            // 删除缓存目录
            if let Err(e) = std::fs::remove_dir_all(&cached.media_dir) {
                eprintln!("清理缓存目录失败: {:?}, 错误: {}", cached.media_dir, e);
            }
        }
        
        Ok(())
    }
}

