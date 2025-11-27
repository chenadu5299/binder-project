use serde::{Deserialize, Serialize};
use std::time::Duration;
use std::path::PathBuf;
use std::fs;
use dirs;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AIConfig {
    pub request_timeout: u64,              // 秒，默认 60
    pub autocomplete_trigger_delay: u64,   // 秒，默认 7（5-15 秒范围）
    pub undo_redo_max_steps: usize,        // 默认 50
    pub max_concurrent_requests: usize,    // 默认 3
}

impl Default for AIConfig {
    fn default() -> Self {
        Self {
            request_timeout: 60,
            autocomplete_trigger_delay: 7,
            undo_redo_max_steps: 50,
            max_concurrent_requests: 3,
        }
    }
}

impl AIConfig {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn load() -> Result<Self, String> {
        let config_path = Self::config_path()?;
        
        if !config_path.exists() {
            // 配置文件不存在，返回默认配置
            let config = Self::default();
            config.save()?;
            return Ok(config);
        }

        let content = fs::read_to_string(&config_path)
            .map_err(|e| format!("读取配置文件失败: {}", e))?;
        
        serde_json::from_str(&content)
            .map_err(|e| format!("解析配置文件失败: {}", e))
    }

    pub fn save(&self) -> Result<(), String> {
        let config_path = Self::config_path()?;
        
        // 确保配置目录存在
        if let Some(parent) = config_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("创建配置目录失败: {}", e))?;
        }

        let json = serde_json::to_string_pretty(self)
            .map_err(|e| format!("序列化配置失败: {}", e))?;
        
        fs::write(&config_path, json)
            .map_err(|e| format!("写入配置文件失败: {}", e))?;
        
        Ok(())
    }

    fn config_path() -> Result<PathBuf, String> {
        let config_dir = dirs::config_dir()
            .ok_or("无法获取配置目录")?;
        Ok(config_dir.join("binder").join("ai_config.json"))
    }

    pub fn request_timeout_duration(&self) -> Duration {
        Duration::from_secs(self.request_timeout)
    }

    pub fn autocomplete_trigger_delay_duration(&self) -> Duration {
        Duration::from_secs(self.autocomplete_trigger_delay)
    }

    pub fn validate(&self) -> Result<(), String> {
        // 验证配置值的有效性
        if self.request_timeout < 10 || self.request_timeout > 300 {
            return Err("请求超时时间必须在 10-300 秒之间".to_string());
        }
        
        if self.autocomplete_trigger_delay < 5 || self.autocomplete_trigger_delay > 15 {
            return Err("自动补全触发延迟必须在 5-15 秒之间".to_string());
        }
        
        if self.undo_redo_max_steps < 10 || self.undo_redo_max_steps > 200 {
            return Err("撤销/重做最大步数必须在 10-200 之间".to_string());
        }
        
        if self.max_concurrent_requests < 1 || self.max_concurrent_requests > 10 {
            return Err("最大并发请求数必须在 1-10 之间".to_string());
        }
        
        Ok(())
    }
}

