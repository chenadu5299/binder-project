use std::path::Path;
use uuid::Uuid;
use base64::{Engine as _, engine::general_purpose};

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
    
    /// 处理预览图片路径
    /// 
    /// 策略：
    /// 1. 小图片（< 1MB）：转换为 base64 data URL
    /// 2. 大图片（≥ 1MB）：复制到工作区根目录的 preview_media/ 文件夹，使用 file:// 协议
    /// 3. 图片存储位置：工作区根目录/preview_media/（新建文件夹）
    /// 
    /// 参数：
    /// - image_path: 原始图片路径（Pandoc 提取的图片）
    /// - workspace_root: 工作区根目录（从 DOCX 文件路径推导）
    pub fn process_preview_image(
        &self,
        image_path: &Path,
        workspace_root: &Path,
    ) -> Result<String, String> {
        // 1. 确定目标目录（工作区根目录/preview_media/，新建文件夹）
        let media_dir = workspace_root.join("preview_media");
        std::fs::create_dir_all(&media_dir)
            .map_err(|e| format!("创建预览图片目录失败: {}。请检查工作区目录权限。", e))?;
        
        // 2. 检查图片文件大小
        let metadata = std::fs::metadata(image_path)
            .map_err(|e| format!("无法读取图片: {}", e))?;
        
        let file_size = metadata.len();
        
        // 3. 小图片使用 base64，大图片使用绝对路径
        if file_size < 1024 * 1024 {
            // 小于 1MB，使用 base64
            let img_data = std::fs::read(image_path)
                .map_err(|e| format!("读取图片失败: {}", e))?;
            
            // 检测图片格式
            let mime_type = self.detect_image_mime_type(image_path)?;
            let base64_str = general_purpose::STANDARD.encode(&img_data);
            
            Ok(format!("data:{};base64,{}", mime_type, base64_str))
        } else {
            // 大于 1MB，复制到媒体目录并使用绝对路径
            let file_name = image_path.file_name()
                .and_then(|n| n.to_str())
                .ok_or_else(|| "无效的文件名".to_string())?;
            
            let dest_path = media_dir.join(file_name);
            
            // 如果目标文件已存在，跳过复制
            if !dest_path.exists() {
                std::fs::copy(image_path, &dest_path)
                    .map_err(|e| format!("复制图片失败: {}", e))?;
            }
            
            // 返回绝对路径（file:// 协议）
            Ok(format!("file://{}", dest_path.to_string_lossy()))
        }
    }
    
    /// 检测图片 MIME 类型
    fn detect_image_mime_type(&self, img_path: &Path) -> Result<&'static str, String> {
        let ext = img_path.extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();
        
        match ext.as_str() {
            "png" => Ok("image/png"),
            "jpg" | "jpeg" => Ok("image/jpeg"),
            "gif" => Ok("image/gif"),
            "webp" => Ok("image/webp"),
            "svg" => Ok("image/svg+xml"),
            "bmp" => Ok("image/bmp"),
            _ => Ok("image/png"), // 默认 PNG
        }
    }
}

