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
}

