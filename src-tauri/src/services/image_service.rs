use base64::{engine::general_purpose, Engine as _};
use image::{DynamicImage, ImageFormat};
use serde::{Deserialize, Serialize};
use std::path::Path;
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize)]
pub struct InsertImageResult {
  pub data_url: String,
  pub relative_path: String,
}

pub struct ImageService;

impl ImageService {
  pub fn new() -> Self {
    Self
  }

  pub async fn insert_image(
    &self,
    document_path: &Path,
    image_source: &Path,
  ) -> Result<InsertImageResult, String> {
    // 1. 确定 assets/ 文件夹路径
    let assets_dir = document_path
      .parent()
      .ok_or("无法获取文档父目录")?
      .join("assets");

    // 2. 创建 assets/ 文件夹（如果不存在）
    if !assets_dir.exists() {
      std::fs::create_dir_all(&assets_dir).map_err(|e| format!("创建 assets 文件夹失败: {}", e))?;
    }

    // 3. 生成唯一文件名（UUID + 原扩展名）
    let ext = image_source
      .extension()
      .and_then(|s| s.to_str())
      .unwrap_or("png");
    let filename = format!("{}.{}", Uuid::new_v4(), ext);
    let dest_path = assets_dir.join(&filename);

    // 4. 复制图片文件
    std::fs::copy(image_source, &dest_path).map_err(|e| format!("复制图片失败: {}", e))?;

    // 5. 处理图片（压缩 + base64 转换）
    let metadata =
      std::fs::metadata(&dest_path).map_err(|e| format!("无法读取图片元数据: {}", e))?;
    let file_size = metadata.len();

    let data_url = if file_size < 1024 * 1024 {
      // 小图片（< 1MB）：直接转换为 base64
      let img_data = std::fs::read(&dest_path).map_err(|e| format!("读取图片失败: {}", e))?;
      let mime_type = self.detect_image_mime_type(&dest_path)?;
      let base64_str = general_purpose::STANDARD.encode(&img_data);
      format!("data:{};base64,{}", mime_type, base64_str)
    } else {
      // 大图片（≥ 1MB）：压缩后转换为 base64
      let compressed = self
        .compress_image(&dest_path, 1024, 85)
        .map_err(|e| format!("压缩图片失败: {}", e))?;

      // 检测压缩后的格式（WebP）
      let mime_type =
        if compressed.len() > 12 && &compressed[0..4] == b"RIFF" && &compressed[8..12] == b"WEBP" {
          "image/webp"
        } else {
          self.detect_image_mime_type(&dest_path)?
        };

      let base64_str = general_purpose::STANDARD.encode(&compressed);
      format!("data:{};base64,{}", mime_type, base64_str)
    };

    // 6. 返回双路径结构
    Ok(InsertImageResult {
      data_url,
      relative_path: format!("assets/{}", filename),
    })
  }

  pub fn check_image_exists(&self, document_path: &Path, image_path: &str) -> bool {
    let assets_dir = document_path.parent().unwrap().join("assets");
    let image_file = assets_dir.join(image_path.strip_prefix("assets/").unwrap_or(image_path));
    image_file.exists()
  }

  pub async fn delete_image(&self, document_path: &Path, image_path: &str) -> Result<(), String> {
    let assets_dir = document_path
      .parent()
      .ok_or("无法获取文档父目录")?
      .join("assets");
    let image_file = assets_dir.join(image_path.strip_prefix("assets/").unwrap_or(image_path));

    if image_file.exists() {
      std::fs::remove_file(&image_file).map_err(|e| format!("删除图片失败: {}", e))?;
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
      std::fs::create_dir_all(&assets_dir).map_err(|e| format!("创建 assets 文件夹失败: {}", e))?;
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
    std::fs::write(&dest_path, image_data).map_err(|e| format!("保存图片失败: {}", e))?;

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
    let metadata = std::fs::metadata(image_path).map_err(|e| format!("无法读取图片: {}", e))?;

    let file_size = metadata.len();

    // 3. 小图片使用 base64，大图片使用绝对路径
    if file_size < 1024 * 1024 {
      // 小于 1MB，使用 base64
      let img_data = std::fs::read(image_path).map_err(|e| format!("读取图片失败: {}", e))?;

      // 检测图片格式
      let mime_type = self.detect_image_mime_type(image_path)?;
      let base64_str = general_purpose::STANDARD.encode(&img_data);

      Ok(format!("data:{};base64,{}", mime_type, base64_str))
    } else {
      // 大于 1MB，复制到媒体目录并使用绝对路径
      let file_name = image_path
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| "无效的文件名".to_string())?;

      let dest_path = media_dir.join(file_name);

      // 如果目标文件已存在，跳过复制
      if !dest_path.exists() {
        std::fs::copy(image_path, &dest_path).map_err(|e| format!("复制图片失败: {}", e))?;
      }

      // 返回绝对路径（file:// 协议）
      Ok(format!("file://{}", dest_path.to_string_lossy()))
    }
  }

  /// 检测图片 MIME 类型
  pub fn detect_image_mime_type(&self, img_path: &Path) -> Result<&'static str, String> {
    let ext = img_path
      .extension()
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

  /// 压缩图片
  ///
  /// 参数：
  /// - image_path: 图片路径
  /// - max_size_kb: 目标大小（KB）
  /// - quality: 质量（0-100）
  ///
  /// 返回：压缩后的图片数据（Vec<u8>）
  pub fn compress_image(
    &self,
    image_path: &Path,
    max_size_kb: usize,
    quality: u8,
  ) -> Result<Vec<u8>, String> {
    eprintln!("  🔧 [压缩] 开始压缩图片: {:?}", image_path);
    eprintln!(
      "  🔧 [压缩] 目标大小: {} KB, 质量: {}",
      max_size_kb, quality
    );

    // 1. 读取图片
    eprintln!("  🔧 [压缩] 步骤 1: 读取图片...");
    let mut img = match image::open(image_path) {
      Ok(img) => {
        eprintln!(
          "  🔧 [压缩] 读取成功，尺寸: {}x{}",
          img.width(),
          img.height()
        );
        img
      }
      Err(e) => {
        eprintln!("  ❌ [压缩] 读取图片失败: {}", e);
        return Err(format!("读取图片失败: {}", e));
      }
    };

    // 2. 检测格式
    eprintln!("  🔧 [压缩] 步骤 2: 检测格式...");
    let format = ImageFormat::from_path(image_path).unwrap_or(ImageFormat::Png);
    eprintln!("  🔧 [压缩] 检测到的格式: {:?}", format);

    // 3. 尺寸限制（如果图片过大）
    if img.width() > 2000 || img.height() > 2000 {
      eprintln!("  🔧 [压缩] 步骤 3: 图片过大，缩小尺寸...");
      let scale = 2000.0 / img.width().max(img.height()) as f32;
      eprintln!("  🔧 [压缩] 缩放比例: {}", scale);
      img = match std::panic::catch_unwind(|| {
        img.resize(
          (img.width() as f32 * scale) as u32,
          (img.height() as f32 * scale) as u32,
          image::imageops::FilterType::Lanczos3,
        )
      }) {
        Ok(resized) => {
          eprintln!(
            "  🔧 [压缩] 缩小成功，新尺寸: {}x{}",
            resized.width(),
            resized.height()
          );
          resized
        }
        Err(e) => {
          eprintln!("  ❌ [压缩] 缩小尺寸 panic: {:?}", e);
          return Err("缩小图片尺寸失败（panic）".to_string());
        }
      };
    } else {
      eprintln!("  🔧 [压缩] 步骤 3: 尺寸无需缩小");
    }

    // 4. 压缩策略（统一转换为 WebP）
    eprintln!("  🔧 [压缩] 步骤 4: 转换为 WebP...");
    let mut compressed = match self.encode_to_webp(&img, quality) {
      Ok(data) => {
        eprintln!("  🔧 [压缩] WebP 编码成功，大小: {} 字节", data.len());
        data
      }
      Err(e) => {
        eprintln!("  ❌ [压缩] WebP 编码失败: {}", e);
        return Err(e);
      }
    };

    // 5. 验证大小，如果超过限制则降级重试
    if compressed.len() > max_size_kb * 1024 {
      eprintln!("  🔧 [压缩] 步骤 5: 压缩后仍超过限制，开始降级重试...");
      let mut current_quality = quality;
      let mut current_img = img;

      for attempt in 1..=3 {
        eprintln!(
          "  🔧 [压缩] 降级尝试 {}: 当前大小 {} KB, 目标 {} KB",
          attempt,
          compressed.len() / 1024,
          max_size_kb
        );

        if compressed.len() <= max_size_kb * 1024 {
          eprintln!("  🔧 [压缩] 降级成功，达到目标大小");
          break;
        }

        // 降低质量
        current_quality = current_quality.saturating_sub(10);
        eprintln!("  🔧 [压缩] 降低质量: {}", current_quality);

        if current_quality < 50 {
          // 如果质量太低，尝试缩小尺寸
          eprintln!("  🔧 [压缩] 质量过低，缩小尺寸...");
          let scale = 0.8;
          current_img = match std::panic::catch_unwind(|| {
            current_img.resize(
              (current_img.width() as f32 * scale) as u32,
              (current_img.height() as f32 * scale) as u32,
              image::imageops::FilterType::Lanczos3,
            )
          }) {
            Ok(resized) => {
              eprintln!(
                "  🔧 [压缩] 缩小成功，新尺寸: {}x{}",
                resized.width(),
                resized.height()
              );
              resized
            }
            Err(e) => {
              eprintln!("  ❌ [压缩] 缩小尺寸 panic: {:?}", e);
              return Err("缩小图片尺寸失败（panic）".to_string());
            }
          };
          current_quality = 75; // 重置质量
          eprintln!("  🔧 [压缩] 重置质量: {}", current_quality);
        }

        compressed = match self.encode_to_webp(&current_img, current_quality) {
          Ok(data) => {
            eprintln!("  🔧 [压缩] 重新编码成功，大小: {} 字节", data.len());
            data
          }
          Err(e) => {
            eprintln!("  ❌ [压缩] 重新编码失败: {}", e);
            return Err(e);
          }
        };

        if attempt == 3 && compressed.len() > max_size_kb * 1024 {
          eprintln!("  ❌ [压缩] 3次降级后仍超过限制");
          return Err(format!(
            "图片压缩后仍超过限制 ({}KB > {}KB)，请使用较小的图片",
            compressed.len() / 1024,
            max_size_kb
          ));
        }
      }
    } else {
      eprintln!("  🔧 [压缩] 步骤 5: 压缩后大小符合要求");
    }

    eprintln!(
      "  ✅ [压缩] 压缩完成，最终大小: {} 字节 ({} KB)",
      compressed.len(),
      compressed.len() / 1024
    );
    Ok(compressed)
  }

  /// WebP 编码辅助函数（使用 webp crate 进行有损编码）
  fn encode_to_webp(&self, img: &DynamicImage, quality: u8) -> Result<Vec<u8>, String> {
    use webp::Encoder;

    eprintln!("    🎨 [WebP编码] 开始编码，质量: {}", quality);

    // 将 DynamicImage 转换为 RGBA
    eprintln!("    🎨 [WebP编码] 转换为 RGBA...");
    let rgba = match std::panic::catch_unwind(|| img.to_rgba8()) {
      Ok(rgba) => {
        eprintln!("    🎨 [WebP编码] RGBA 转换成功");
        rgba
      }
      Err(e) => {
        eprintln!("    ❌ [WebP编码] RGBA 转换 panic: {:?}", e);
        return Err("RGBA 转换失败（panic）".to_string());
      }
    };

    let (width, height) = rgba.dimensions();
    eprintln!(
      "    🎨 [WebP编码] 尺寸: {}x{}, RGBA 数据大小: {} 字节",
      width,
      height,
      rgba.len()
    );

    // 使用 webp crate 进行有损编码
    eprintln!("    🎨 [WebP编码] 创建编码器...");
    let encoder =
      match std::panic::catch_unwind(|| Encoder::from_rgba(rgba.as_raw(), width, height)) {
        Ok(enc) => {
          eprintln!("    🎨 [WebP编码] 编码器创建成功");
          enc
        }
        Err(e) => {
          eprintln!("    ❌ [WebP编码] 编码器创建 panic: {:?}", e);
          return Err("编码器创建失败（panic）".to_string());
        }
      };

    eprintln!("    🎨 [WebP编码] 执行编码...");
    let webp = match std::panic::catch_unwind(|| encoder.encode(quality as f32)) {
      Ok(w) => {
        eprintln!("    🎨 [WebP编码] 编码成功，大小: {} 字节", w.len());
        w
      }
      Err(e) => {
        eprintln!("    ❌ [WebP编码] 编码 panic: {:?}", e);
        return Err("WebP 编码失败（panic）".to_string());
      }
    };

    let result = webp.to_vec();
    eprintln!("    ✅ [WebP编码] 完成，最终大小: {} 字节", result.len());
    Ok(result)
  }
}
