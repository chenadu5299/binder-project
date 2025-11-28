use std::path::Path;
use uuid::Uuid;

pub struct ImageService;

impl ImageService {
    pub fn new() -> Self {
        Self
    }

    pub async fn insert_image(
        &self,
        document_path: &Path,
        image_source: &Path,
    ) -> Result<String, String> {
        // 1. 确定 assets/ 文件夹路径
        let assets_dir = document_path.parent()
            .ok_or("无法获取文档父目录")?
            .join("assets");
        
        // 2. 创建 assets/ 文件夹（如果不存在）
        if !assets_dir.exists() {
            std::fs::create_dir_all(&assets_dir)
                .map_err(|e| format!("创建 assets 文件夹失败: {}", e))?;
        }
        
        // 3. 生成唯一文件名（UUID + 原扩展名）
        let ext = image_source.extension()
            .and_then(|s| s.to_str())
            .unwrap_or("png");
        let filename = format!("{}.{}", Uuid::new_v4(), ext);
        let dest_path = assets_dir.join(&filename);
        
        // 4. 复制图片文件
        std::fs::copy(image_source, &dest_path)
            .map_err(|e| format!("复制图片失败: {}", e))?;
        
        // 5. 返回相对路径（assets/xxx.png）
        Ok(format!("assets/{}", filename))
    }
    
    pub fn check_image_exists(
        &self,
        document_path: &Path,
        image_path: &str,
    ) -> bool {
        let assets_dir = document_path.parent()
            .unwrap()
            .join("assets");
        let image_file = assets_dir.join(image_path.strip_prefix("assets/").unwrap_or(image_path));
        image_file.exists()
    }
    
    pub async fn delete_image(
        &self,
        document_path: &Path,
        image_path: &str,
    ) -> Result<(), String> {
        let assets_dir = document_path.parent()
            .ok_or("无法获取文档父目录")?
            .join("assets");
        let image_file = assets_dir.join(image_path.strip_prefix("assets/").unwrap_or(image_path));
        
        if image_file.exists() {
            std::fs::remove_file(&image_file)
                .map_err(|e| format!("删除图片失败: {}", e))?;
        }
        
        Ok(())
    }
    
    // 保存聊天引用的图片
    pub async fn save_chat_image(
        &self,
        workspace_path: &Path,
        image_data: Vec<u8>,
        file_name: String,
    ) -> Result<String, String> {
        // 1. 确定 assets/ 文件夹路径（在工作区根目录）
        let assets_dir = workspace_path.join("assets");
        
        // 2. 创建 assets/ 文件夹（如果不存在）
        if !assets_dir.exists() {
            std::fs::create_dir_all(&assets_dir)
                .map_err(|e| format!("创建 assets 文件夹失败: {}", e))?;
        }
        
        // 3. 生成唯一文件名（时间戳 + 原文件名）
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|e| format!("获取时间戳失败: {}", e))?
            .as_secs();
        
        // 清理文件名（移除特殊字符）
        let sanitized_name = file_name
            .chars()
            .filter(|c| c.is_alphanumeric() || *c == '.' || *c == '-' || *c == '_')
            .collect::<String>();
        
        let ext = Path::new(&sanitized_name)
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("png");
        
        let filename = format!("chat-{}-{}", timestamp, sanitized_name);
        let dest_path = assets_dir.join(&filename);
        
        // 4. 保存图片
        std::fs::write(&dest_path, image_data)
            .map_err(|e| format!("保存图片失败: {}", e))?;
        
        // 5. 返回相对路径（assets/xxx.png）
        Ok(format!("assets/{}", filename))
    }
}

