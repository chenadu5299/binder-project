use keyring::Entry;
use serde::{Deserialize, Serialize};

pub struct APIKeyManager {
    service_name: String,
}

impl APIKeyManager {
    pub fn new() -> Self {
        Self {
            service_name: "binder".to_string(),
        }
    }

    pub fn save_key(&self, provider: &str, key: &str) -> Result<(), String> {
        let entry = Entry::new(&self.service_name, provider)
            .map_err(|e| format!("创建密钥条目失败: {}", e))?;
        entry.set_password(key)
            .map_err(|e| format!("保存密钥失败: {}", e))?;
        Ok(())
    }

    pub fn get_key(&self, provider: &str) -> Result<String, String> {
        let entry = Entry::new(&self.service_name, provider)
            .map_err(|e| format!("获取密钥条目失败: {}", e))?;
        entry.get_password()
            .map_err(|e| format!("读取密钥失败: {}", e))
    }

    pub fn delete_key(&self, provider: &str) -> Result<(), String> {
        let entry = Entry::new(&self.service_name, provider)
            .map_err(|e| format!("创建密钥条目失败: {}", e))?;
        entry.delete_password()
            .map_err(|e| format!("删除密钥失败: {}", e))?;
        Ok(())
    }

    pub fn has_key(&self, provider: &str) -> bool {
        self.get_key(provider).is_ok()
    }
}

impl Default for APIKeyManager {
    fn default() -> Self {
        Self::new()
    }
}

