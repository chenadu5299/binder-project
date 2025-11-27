use std::path::PathBuf;
use which::which;

pub struct PandocService {
    pandoc_path: Option<PathBuf>,
}

impl PandocService {
    pub fn new() -> Self {
        // 1. 优先查找系统 Pandoc
        let system_pandoc = which("pandoc").ok();
        
        // 2. 如果系统没有，使用内置 Pandoc
        let bundled_pandoc = if system_pandoc.is_none() {
            Self::get_bundled_pandoc_path()
        } else {
            None
        };
        
        Self {
            pandoc_path: system_pandoc.or(bundled_pandoc),
        }
    }
    
    fn get_bundled_pandoc_path() -> Option<PathBuf> {
        // 获取资源目录路径
        // 注意：Tauri 2.x 的 API 可能不同，需要根据实际版本调整
        // 这里先返回 None，后续在运行时处理
        // TODO: 实现资源目录获取（需要 Tauri 2.x API）
        None
    }
    
    pub fn is_available(&self) -> bool {
        self.pandoc_path.is_some()
    }
    
    pub fn get_path(&self) -> Option<&PathBuf> {
        self.pandoc_path.as_ref()
    }
}

