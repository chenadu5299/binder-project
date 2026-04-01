// LibreOffice 服务
// 用于文档转换：
// - DOCX → PDF 转换（预览模式）
// - DOCX → ODT 转换（编辑模式）
// - Excel (XLSX/XLS/ODS) → PDF 转换（预览模式）
// - 演示文稿 (PPTX/PPT/PPSX/PPS/ODP) → PDF 转换（预览模式）

use once_cell::sync::Lazy;
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Arc;
use std::sync::Mutex;
use std::time::{Duration, SystemTime};

/// 将路径转为 LibreOffice -env:UserInstallation 所需的 file:// URL（绝对路径、空格等百分号编码）
fn path_to_user_installation_url(path: &Path) -> String {
  let absolute = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());
  let s = absolute.to_string_lossy();
  let s = s.replace('\\', "/");
  let s = s.replace(' ', "%20");
  if s.starts_with('/') {
    format!("file://{}", s)
  } else {
    format!("file:///{}", s)
  }
}

/// 转义 XML 属性值中的特殊字符（用于 fontsubst.xcu 中的字体名）
fn escape_xml(s: &str) -> String {
  let mut out = String::with_capacity(s.len());
  for c in s.chars() {
    match c {
      '&' => out.push_str("&amp;"),
      '<' => out.push_str("&lt;"),
      '>' => out.push_str("&gt;"),
      '"' => out.push_str("&quot;"),
      '\'' => out.push_str("&apos;"),
      _ => out.push(c),
    }
  }
  out
}

pub struct LibreOfficeService {
  builtin_path: Option<PathBuf>, // 内置 LibreOffice 路径（优先使用）
  cache_dir: PathBuf,            // PDF 缓存目录（预览模式）
  odt_cache_dir: PathBuf,        // ODT 缓存目录（编辑模式，与 PDF 缓存分离）
  cache_duration: Duration,      // 缓存过期时间（1小时）
}

impl LibreOfficeService {
  /// 创建 LibreOfficeService 实例
  pub fn new() -> Result<Self, String> {
    // 获取应用数据目录
    let app_data_dir = dirs::data_dir()
      .ok_or_else(|| "无法获取应用数据目录".to_string())?
      .join("binder");

    // 创建 PDF 缓存目录（预览模式）
    let cache_dir = app_data_dir.join("cache").join("preview");
    fs::create_dir_all(&cache_dir).map_err(|e| format!("创建 PDF 缓存目录失败: {}", e))?;

    // 创建 ODT 缓存目录（编辑模式，与 PDF 缓存分离）
    let odt_cache_dir = app_data_dir.join("cache").join("odt");
    fs::create_dir_all(&odt_cache_dir).map_err(|e| format!("创建 ODT 缓存目录失败: {}", e))?;

    // 初始化服务
    let mut service = Self {
      builtin_path: None,
      cache_dir,
      odt_cache_dir,
      cache_duration: Duration::from_secs(3600), // 1小时
    };

    // 检测并初始化 LibreOffice
    service.initialize_libreoffice()?;

    // 初始化字体替换配置（确保预览字体一致）
    if let Err(e) = service.initialize_font_substitution() {
      eprintln!("⚠️ 初始化字体替换配置失败: {}，将使用系统默认字体", e);
      // 不返回错误，允许继续使用系统默认字体
    }

    Ok(service)
  }

  /// 初始化 LibreOffice（只检测内置版本，优先使用内置）
  /// 内置版本直接从资源目录查找，无需解压（类似 Pandoc 方式）
  fn initialize_libreoffice(&mut self) -> Result<(), String> {
    // 直接从资源目录查找内置 LibreOffice（无需解压）
    if let Some(builtin_path) = Self::get_bundled_libreoffice_path() {
      if builtin_path.exists() {
        // 验证可执行文件
        if Self::verify_executable(&builtin_path) {
          self.builtin_path = Some(builtin_path);
          eprintln!("✅ 检测到内置 LibreOffice: {:?}", self.builtin_path);
        } else {
          eprintln!("⚠️ 内置 LibreOffice 可执行文件验证失败");
        }
      } else {
        eprintln!("⚠️ 内置 LibreOffice 路径不存在");
      }
    } else {
      eprintln!("⚠️ 未找到内置 LibreOffice 资源文件，将在需要时使用系统版本");
    }

    // 不在这里检测系统版本，只在需要时（内置不可用时）才检测
    Ok(())
  }

  /// 获取内置 LibreOffice 路径（macOS 专用，直接从资源目录查找，类似 Pandoc 方式）
  fn get_bundled_libreoffice_path() -> Option<PathBuf> {
    // 方法1：尝试从环境变量获取资源路径（开发模式）
    if let Ok(resource_dir) = std::env::var("TAURI_RESOURCE_DIR") {
      let soffice_path =
        Self::get_soffice_path_from_dir(&PathBuf::from(resource_dir).join("libreoffice"));
      if soffice_path.is_some() {
        eprintln!("✅ 从 TAURI_RESOURCE_DIR 找到内置 LibreOffice");
        return soffice_path;
      }
    }

    // 方法2：尝试从当前可执行文件目录获取（打包后）
    // macOS: Binder.app/Contents/MacOS/binder -> Binder.app/Contents/Resources/libreoffice
    if let Ok(exe_path) = std::env::current_exe() {
      if let Some(exe_dir) = exe_path.parent() {
        // 向上查找 Contents 目录
        if let Some(contents_dir) = exe_dir.parent() {
          if contents_dir.ends_with("Contents") {
            let resources_dir = contents_dir.join("Resources");
            let soffice_path = Self::get_soffice_path_from_dir(&resources_dir.join("libreoffice"));
            if soffice_path.is_some() {
              eprintln!("✅ 从打包后路径找到内置 LibreOffice");
              return soffice_path;
            }
          }
        }
      }
    }

    // 方法3：尝试从工作目录获取（开发模式）
    if let Ok(current_dir) = std::env::current_dir() {
      let possible_paths = vec![
        current_dir.join("src-tauri/resources/libreoffice"),
        current_dir.join("resources/libreoffice"),
      ];

      for libreoffice_dir in possible_paths {
        let soffice_path = Self::get_soffice_path_from_dir(&libreoffice_dir);
        if soffice_path.is_some() {
          eprintln!("✅ 从开发模式路径找到内置 LibreOffice");
          return soffice_path;
        }
      }
    }

    None
  }

  /// 从指定目录获取 soffice 可执行文件路径（macOS 专用）
  fn get_soffice_path_from_dir(libreoffice_dir: &Path) -> Option<PathBuf> {
    // macOS: libreoffice/LibreOffice.app/Contents/MacOS/soffice
    let soffice_path = libreoffice_dir.join("LibreOffice.app/Contents/MacOS/soffice");
    if soffice_path.exists() {
      eprintln!("✅ 找到 soffice 可执行文件: {:?}", soffice_path);
      return Some(soffice_path);
    }

    None
  }

  /// 验证可执行文件是否可用
  fn verify_executable(path: &Path) -> bool {
    // 检查文件是否存在且可执行
    if !path.exists() {
      return false;
    }

    // 尝试执行 --version 命令验证
    let output = Command::new(path).arg("--version").output();

    match output {
      Ok(output) => output.status.success(),
      Err(_) => false,
    }
  }

  /// 检测系统 LibreOffice（macOS 专用，降级方案）
  fn detect_system_libreoffice() -> Option<PathBuf> {
    eprintln!("🔍 开始检测系统 LibreOffice（降级方案）...");

    // macOS: 先尝试使用 which 查找（更通用）
    if let Ok(path) = which::which("soffice") {
      eprintln!("✅ 通过 which 检测到系统 LibreOffice: {:?}", path);
      if path.exists() {
        return Some(path);
      } else {
        eprintln!("⚠️ which 返回的路径不存在: {:?}", path);
      }
    }

    // 备用方案：检查常见的安装路径
    let common_paths = vec![
      PathBuf::from("/Applications/LibreOffice.app/Contents/MacOS/soffice"),
      PathBuf::from("/Applications/LibreOffice.app/Contents/MacOS/soffice.bin"),
    ];

    for path in common_paths {
      if path.exists() {
        eprintln!("✅ 通过常见路径检测到系统 LibreOffice: {:?}", path);
        return Some(path);
      }
    }

    eprintln!("❌ 未检测到系统 LibreOffice");
    None
  }

  /// 获取可用的 LibreOffice 路径（优先使用内置版本）
  pub fn get_libreoffice_path(&self) -> Result<PathBuf, String> {
    // 1. 优先使用内置版本
    if let Some(ref path) = self.builtin_path {
      eprintln!("🔍 检查内置 LibreOffice: {:?}", path);
      if path.exists() {
        eprintln!("✅ 使用内置 LibreOffice: {:?}", path);
        return Ok(path.clone());
      } else {
        eprintln!("⚠️ 内置 LibreOffice 路径不存在: {:?}", path);
      }
    } else {
      eprintln!("⚠️ 内置 LibreOffice 未初始化");
    }

    // 2. 内置不可用时，检测并使用系统版本（懒加载）
    eprintln!("🔄 内置 LibreOffice 不可用，检测系统 LibreOffice...");
    if let Some(system_path) = Self::detect_system_libreoffice() {
      eprintln!("🔍 检查系统 LibreOffice 路径: {:?}", system_path);
      if system_path.exists() {
        eprintln!("✅ 使用系统 LibreOffice: {:?}", system_path);
        return Ok(system_path);
      } else {
        eprintln!("⚠️ 系统 LibreOffice 路径不存在: {:?}", system_path);
      }
    }

    // 3. 都不可用时，返回详细错误信息
    let error_msg = if self.builtin_path.is_some() {
      "LibreOffice 不可用：内置版本路径不存在，且未检测到系统 LibreOffice。请安装 LibreOffice 或检查内置版本资源文件。".to_string()
    } else {
      "LibreOffice 不可用：内置版本资源文件不存在，且未检测到系统 LibreOffice。请安装 LibreOffice 或检查内置版本部署。建议手动创建草稿进行编辑。".to_string()
    };
    eprintln!("❌ {}", error_msg);
    Err(error_msg)
  }

  /// 检查 LibreOffice 是否可用
  pub fn is_available(&self) -> bool {
    self.get_libreoffice_path().is_ok()
  }

  /// 初始化字体替换配置
  /// 设置固定的默认字体，确保预览时字体显示一致
  fn initialize_font_substitution(&self) -> Result<(), String> {
    let (cjk, latin) = Self::get_default_fonts();
    eprintln!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    eprintln!("🔤 [预览模式] 选择字体（缺失字体将替换为以下默认）:");
    eprintln!("   - 中文/ CJK 默认: {}", cjk);
    eprintln!("   - 英文/ Latin 默认: {}", latin);
    eprintln!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    self.write_font_substitution_config()
  }

  /// 写入字体替换配置到 profile 目录（可多次调用；clear_preview_cache 已改为保留 lo_user，避免清除后字体随机）
  /// macOS 默认 profile 为 ~/Library/Application Support/LibreOffice/4/user，
  /// 故同时写入 lo_user/user/config 与 lo_user/4/user/config，确保无论 LO 解析哪种结构都能读到
  fn write_font_substitution_config(&self) -> Result<(), String> {
    let user_config_dir = self.cache_dir.join("lo_user");
    let (default_cjk_font, default_latin_font) = Self::get_default_fonts();
    let fontsubst_content =
      Self::generate_fontsubst_content(&default_cjk_font, &default_latin_font);

    let content_preview = fontsubst_content.chars().take(200).collect::<String>();
    eprintln!(
      "🔤 [字体调试] 写入字体配置: 内容长度={} 字节, 默认CJK={}, 默认Latin={}",
      fontsubst_content.len(),
      default_cjk_font,
      default_latin_font
    );
    eprintln!(
      "🔤 [字体调试] 配置内容片段(前200字符): {}...",
      content_preview
    );

    let config_paths: Vec<PathBuf> = {
      let mut paths = vec![user_config_dir.join("user").join("config")];
      #[cfg(target_os = "macos")]
      {
        // macOS 默认 profile 为 .../LibreOffice/4/user，LO 可能在 UserInstallation 下查找 4/user
        paths.push(user_config_dir.join("4").join("user").join("config"));
      }
      paths
    };

    for config_path in &config_paths {
      fs::create_dir_all(config_path)
        .map_err(|e| format!("创建 LibreOffice 用户配置目录失败: {}", e))?;
      let fontsubst_file = config_path.join("fontsubst.xcu");
      fs::write(&fontsubst_file, &fontsubst_content)
        .map_err(|e| format!("写入 LibreOffice 字体配置失败: {}", e))?;
      let exists_after = fontsubst_file.exists();
      let size_after = fs::metadata(&fontsubst_file).map(|m| m.len()).unwrap_or(0);
      eprintln!("✅ [预览模式] 字体替换配置已写入: {:?}", fontsubst_file);
      eprintln!(
        "🔤 [字体调试] 写入后校验: 路径={:?}, 存在={}, 大小={} 字节",
        fontsubst_file, exists_after, size_after
      );
    }
    eprintln!("   （预览时通过 -env:UserInstallation=file:///.../lo_user 加载此 profile）");
    Ok(())
  }

  /// 根据操作系统获取最稳定的默认字体（用于 DOCX/Excel/PPT 转 PDF 预览，三种格式共用此配置）
  fn get_default_fonts() -> (String, String) {
    #[cfg(target_os = "macos")]
    {
      // macOS: PingFang SC（系统内置，最稳定）和 Arial；与 clear_preview_cache 保留 lo_user 配合保证一致性
      ("PingFang SC".to_string(), "Arial".to_string())
    }

    #[cfg(target_os = "windows")]
    {
      // Windows: 微软雅黑（系统内置，最稳定）和 Arial
      ("Microsoft YaHei".to_string(), "Arial".to_string())
    }

    #[cfg(target_os = "linux")]
    {
      // Linux: 文泉驿正黑或思源黑体（如果可用），否则使用 Arial Unicode MS
      // 英文字体使用 Arial 或 Liberation Sans
      ("WenQuanYi Micro Hei".to_string(), "Arial".to_string())
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
      // 其他系统：使用通用字体
      ("Arial Unicode MS".to_string(), "Arial".to_string())
    }
  }

  /// 生成 LibreOffice fontsubst.xcu 配置文件内容。
  /// 逻辑：仅对「可能缺失」的字体配置替换；LO 会在此字体缺失时用 ReplaceWith，已安装的字体仍用原字体渲染。
  /// 目标：能匹配到字体就用原字体，缺失则统一用默认字体，避免 LO 对未列出的缺失字体随机回退。
  fn generate_fontsubst_content(cjk_font: &str, latin_font: &str) -> String {
    // 文档中常见但本机可能缺失的字体 → 缺失时统一用默认 CJK/Latin，避免随机回退
    let cjk_fonts: &[&str] = &[
      "宋体",
      "SimSun",
      "黑体",
      "SimHei",
      "楷体",
      "KaiTi",
      "微软雅黑",
      "Microsoft YaHei",
      "等线",
      "DengXian",
      "仿宋",
      "FangSong",
      "仿宋_GB2312",
      "楷体_GB2312",
      "华文黑体",
      "华文楷体",
      "华文宋体",
      "华文仿宋",
      "华文中宋",
      "STHeiti",
      "STKaiti",
      "STSong",
      "STFangsong",
      "STXihei",
      "Hiragino Sans GB",
      "冬青黑体",
      "苹方",
      "PingFang TC",
      "PingFang HK",
      "隶书",
      "幼圆",
      "新宋体",
      "NSimSun",
      "方正兰亭黑",
      "思源黑体",
      "Source Han Sans SC",
    ];
    let latin_fonts: &[&str] = &[
      "Times New Roman",
      "Calibri",
      "Helvetica",
      "Arial Narrow",
      "Cambria",
      "Georgia",
      "Verdana",
      "Tahoma",
      "Segoe UI",
    ];
    let mut items = String::new();
    for name in cjk_fonts {
      items.push_str(&format!(
        r#"      <item oor:path="/org.openoffice.Office.Common/Font/Substitution">
        <prop oor:name="FontName" oor:type="xs:string"><value>{}</value></prop>
        <prop oor:name="ReplaceWith" oor:type="xs:string"><value>{}</value></prop>
      </item>
"#,
        escape_xml(name),
        escape_xml(cjk_font)
      ));
    }
    for name in latin_fonts {
      items.push_str(&format!(
        r#"      <item oor:path="/org.openoffice.Office.Common/Font/Substitution">
        <prop oor:name="FontName" oor:type="xs:string"><value>{}</value></prop>
        <prop oor:name="ReplaceWith" oor:type="xs:string"><value>{}</value></prop>
      </item>
"#,
        escape_xml(name),
        escape_xml(latin_font)
      ));
    }
    format!(
      r#"<?xml version="1.0" encoding="UTF-8"?>
<oor:component-data xmlns:oor="http://openoffice.org/2001/registry" xmlns:xs="http://www.w3.org/2001/XMLSchema" oor:name="Common" oor:package="org.openoffice.Office">
  <node oor:name="Font">
    <node oor:name="Substitution">
{}
    </node>
  </node>
</oor:component-data>"#,
      items
    )
  }

  /// 转换 DOCX → PDF
  pub fn convert_docx_to_pdf(&self, docx_path: &Path) -> Result<PathBuf, String> {
    // 1. 检查 LibreOffice 可用性
    let libreoffice_path = self.get_libreoffice_path()?;

    // 2. 验证输入文件
    if !docx_path.exists() {
      return Err(format!("输入文件不存在: {:?}", docx_path));
    }

    // 检查文件是否可读（只检查存在性和可读性，不检查文件大小）
    // 注意：不检查文件大小为0，因为：
    // 1. 文件可能正在写入，文件系统延迟会导致误判
    // 2. 某些特殊文件可能确实是0字节但有效
    // 3. LibreOffice 会自己处理空文件，返回明确的错误信息
    if let Ok(metadata) = std::fs::metadata(docx_path) {
      eprintln!("📄 输入文件大小: {} 字节", metadata.len());
    } else {
      return Err(format!("无法读取输入文件: {:?}", docx_path));
    }

    // 3. 检查缓存
    if let Some(cached_pdf) = self.check_cache(docx_path)? {
      eprintln!("✅ 使用缓存 PDF: {:?}", cached_pdf);
      eprintln!("🔤 [字体调试] 使用缓存 PDF，未重新转换，当前看到的字体为历史转换结果");
      return Ok(cached_pdf);
    }

    // 4. 执行转换（每次转换前确保字体配置已写入，清除缓存后也能生效）
    eprintln!("🔤 [字体调试] 转换类型=DOCX 输入={:?}", docx_path);
    let _ = self.write_font_substitution_config();
    eprintln!("🔄 开始转换 DOCX → PDF: {:?}", docx_path);

    // 创建临时输出目录
    let output_dir = self.cache_dir.join("temp");
    fs::create_dir_all(&output_dir).map_err(|e| format!("创建临时输出目录失败: {}", e))?;

    // 验证输出目录的写入权限
    let test_file = output_dir.join(".write_test");
    if let Err(e) = std::fs::write(&test_file, b"test") {
      return Err(format!("输出目录无写入权限: {:?}, 错误: {}", output_dir, e));
    }
    let _ = std::fs::remove_file(&test_file);
    eprintln!("✅ 输出目录写入权限验证通过: {:?}", output_dir);

    // 4. 配置 LibreOffice 运行环境（macOS 专用）
    let mut cmd = Command::new(&libreoffice_path);

    // macOS: LibreOffice.app/Contents/MacOS/soffice
    // 工作目录应该是 LibreOffice.app/Contents
    if let Some(contents_dir) = libreoffice_path
      .parent() // MacOS
      .and_then(|p| p.parent())
    // Contents
    {
      cmd.current_dir(&contents_dir);
      eprintln!("📁 设置工作目录: {:?}", contents_dir);

      // 设置 DYLD_LIBRARY_PATH 指向 LibreOffice 的库目录
      // LibreOffice.app/Contents/Frameworks 包含所有动态库
      let frameworks_dir = contents_dir.join("Frameworks");
      let program_dir = contents_dir.join("MacOS");

      // 获取现有的 DYLD_LIBRARY_PATH（如果有）
      let existing_dyld = std::env::var("DYLD_LIBRARY_PATH").unwrap_or_default();

      // 构建新的 DYLD_LIBRARY_PATH
      let mut dyld_paths = vec![];
      if frameworks_dir.exists() {
        dyld_paths.push(frameworks_dir.to_string_lossy().to_string());
        eprintln!(
          "📦 添加 Frameworks 目录到 DYLD_LIBRARY_PATH: {:?}",
          frameworks_dir
        );
      }
      if program_dir.exists() {
        dyld_paths.push(program_dir.to_string_lossy().to_string());
        eprintln!("📦 添加 MacOS 目录到 DYLD_LIBRARY_PATH: {:?}", program_dir);
      }
      if !existing_dyld.is_empty() {
        dyld_paths.push(existing_dyld);
      }

      let dyld_library_path = dyld_paths.join(":");
      if !dyld_library_path.is_empty() {
        cmd.env("DYLD_LIBRARY_PATH", &dyld_library_path);
        eprintln!("🔧 设置 DYLD_LIBRARY_PATH: {}", dyld_library_path);
      }

      // 设置其他必要的环境变量
      // SAL_USE_VCLPLUGIN 指定 UI 插件（headless 模式也需要）
      cmd.env("SAL_USE_VCLPLUGIN", "gen");

      // 设置用户配置目录（避免使用系统配置）
      let user_config_dir = self.cache_dir.join("lo_user");
      fs::create_dir_all(&user_config_dir).ok();
      cmd.env("SAL_DISABLE_OPENCL", "1"); // 禁用 OpenCL（避免兼容性问题）

      // 设置 LibreOffice 用户配置目录
      cmd.env("HOME", user_config_dir.to_string_lossy().as_ref());
      // 方案 A：显式指定 UserInstallation，使 LibreOffice 使用 lo_user 为 profile 根，从而读取 lo_user/user/config/fontsubst.xcu，预览默认字体一致
      let installation_url = path_to_user_installation_url(&user_config_dir);
      cmd.arg(format!("-env:UserInstallation={}", installation_url));
      let fontsubst_path = user_config_dir
        .join("user")
        .join("config")
        .join("fontsubst.xcu");
      let fontsubst_4_path = user_config_dir
        .join("4")
        .join("user")
        .join("config")
        .join("fontsubst.xcu");
      let (cjk, latin) = Self::get_default_fonts();
      eprintln!("🔤 [预览模式] 本次转换使用的字体配置:");
      eprintln!("   - UserInstallation: {}", installation_url);
      eprintln!("   - 字体配置文件: {:?}", fontsubst_path);
      eprintln!("   - 预期默认字体: 中文={}, 英文={}", cjk, latin);
      let exist1 = fontsubst_path.exists();
      let size1 = fs::metadata(&fontsubst_path).map(|m| m.len()).unwrap_or(0);
      let exist2 = fontsubst_4_path.exists();
      let size2 = fs::metadata(&fontsubst_4_path)
        .map(|m| m.len())
        .unwrap_or(0);
      eprintln!("🔤 [字体调试] DOCX 转换启动 soffice 前: user/config/fontsubst.xcu 存在={} 大小={} 字节, 4/user/config/fontsubst.xcu 存在={} 大小={} 字节", exist1, size1, exist2, size2);
    } else {
      eprintln!("⚠️ 无法确定 LibreOffice Contents 目录，可能影响运行");
    }

    // 执行 LibreOffice 转换命令
    // ⚠️ 关键：使用 filter 参数确保 PDF 包含文本层，支持复制功能
    // UseTaggedPDF=1: 生成标记 PDF，确保包含可复制的文本层
    // SelectPdfVersion=1: 使用 PDF 1.4 版本（兼容性好）
    // EmbedStandardFonts=1: 嵌入标准字体
    // EmbedLatinScriptFonts=1: 嵌入拉丁脚本字体
    // EmbedAsianScriptFonts=1: 嵌入亚洲脚本字体（包括中文），解决字体替换问题

    // 使用绝对路径，避免路径问题
    let docx_absolute = docx_path
      .canonicalize()
      .map_err(|e| format!("无法获取输入文件的绝对路径: {}", e))?;
    let output_dir_absolute = output_dir
      .canonicalize()
      .map_err(|e| format!("无法获取输出目录的绝对路径: {}", e))?;

    eprintln!("📄 输入文件绝对路径: {:?}", docx_absolute);
    eprintln!("📁 输出目录绝对路径: {:?}", output_dir_absolute);

    cmd.arg("--headless")
            .arg("--convert-to")
            .arg("pdf:writer_pdf_Export:UseTaggedPDF=1:SelectPdfVersion=1:EmbedStandardFonts=1:EmbedLatinScriptFonts=1:EmbedAsianScriptFonts=1")
            .arg("--outdir")
            .arg(&output_dir_absolute)
            .arg(&docx_absolute);

    eprintln!("📝 执行命令: {:?}", cmd);
    eprintln!("📝 命令参数详情:");
    eprintln!("   - LibreOffice 路径: {:?}", libreoffice_path);
    eprintln!("   - 输入文件: {:?}", docx_absolute);
    eprintln!("   - 输出目录: {:?}", output_dir_absolute);

    // 记录命令执行开始时间
    let start_time = std::time::Instant::now();

    let output = cmd.output().map_err(|e| {
      let error_msg = format!("执行 LibreOffice 命令失败: {}", e);
      eprintln!("❌ {}", error_msg);
      eprintln!("   可能的原因:");
      eprintln!("   1. LibreOffice 可执行文件损坏或不存在");
      eprintln!("   2. 系统权限不足");
      eprintln!("   3. 动态库加载失败（macOS DYLD_LIBRARY_PATH 问题）");
      error_msg
    })?;

    let elapsed = start_time.elapsed();
    eprintln!("⏱️  LibreOffice 命令执行耗时: {:?}", elapsed);

    // 记录命令输出（无论成功与否，都记录用于调试）
    let stderr = String::from_utf8_lossy(&output.stderr);
    let stdout = String::from_utf8_lossy(&output.stdout);

    eprintln!("📋 LibreOffice 命令执行结果:");
    eprintln!("   - 退出码: {:?}", output.status.code());
    eprintln!("   - 成功: {}", output.status.success());

    if !stderr.is_empty() {
      eprintln!("📋 LibreOffice STDERR ({} 字节):", stderr.len());
      for line in stderr.lines() {
        eprintln!("   {}", line);
      }
    } else {
      eprintln!("📋 LibreOffice STDERR: (空)");
    }

    if !stdout.is_empty() {
      eprintln!("📋 LibreOffice STDOUT ({} 字节):", stdout.len());
      for line in stdout.lines() {
        eprintln!("   {}", line);
      }
    } else {
      eprintln!("📋 LibreOffice STDOUT: (空)");
    }

    // 检查命令执行状态
    if !output.status.success() {
      eprintln!(
        "❌ LibreOffice 命令执行失败，退出码: {:?}",
        output.status.code()
      );
      let error_detail = if !stderr.is_empty() {
        stderr.to_string()
      } else if !stdout.is_empty() {
        stdout.to_string()
      } else {
        format!("无错误输出，退出码: {:?}", output.status.code())
      };
      return Err(format!("LibreOffice 转换失败: {}", error_detail));
    }

    // ⚠️ 关键：即使命令返回成功，也可能没有生成文件
    // 先检查输出目录中是否有文件，如果没有，再尝试查找
    eprintln!("🔍 检查输出目录是否存在: {:?}", output_dir_absolute);
    if !output_dir_absolute.exists() {
      return Err(format!("输出目录不存在: {:?}", output_dir_absolute));
    }

    // 立即检查输出目录内容（不等待重试）
    eprintln!("🔍 立即检查输出目录内容:");
    if let Ok(entries) = std::fs::read_dir(&output_dir_absolute) {
      let mut file_count = 0;
      for entry in entries {
        if let Ok(entry) = entry {
          let path = entry.path();
          if let Ok(metadata) = std::fs::metadata(&path) {
            file_count += 1;
            eprintln!(
              "   - {:?} (大小: {} 字节, 类型: {})",
              path.file_name().unwrap_or_default(),
              metadata.len(),
              if metadata.is_file() {
                "文件"
              } else {
                "目录"
              }
            );
          }
        }
      }
      if file_count == 0 {
        eprintln!("⚠️  输出目录为空，LibreOffice 可能未生成文件");
      }
    } else {
      eprintln!("⚠️  无法读取输出目录");
    }

    // 5. 查找生成的 PDF 文件（使用带重试机制的查找方法）
    // LibreOffice 可能使用不同的文件名，需要扫描输出目录
    // ⚠️ 关键优化：添加重试机制，等待文件完全写入磁盘
    // 但重试次数应该减少，因为如果文件真的没生成，重试也没用
    eprintln!("🔍 [预览] 开始查找生成的 PDF 文件...");
    let temp_pdf_path = match self.find_generated_pdf(&output_dir_absolute, &docx_absolute) {
      Ok(path) => {
        eprintln!("✅ [预览] 成功找到 PDF 文件: {:?}", path);
        path
      }
      Err(e) => {
        eprintln!("❌ [预览] 查找 PDF 文件失败: {}", e);
        // 如果找不到文件，输出详细的调试信息
        eprintln!("❌ 查找 PDF 文件失败: {}", e);
        eprintln!("📋 输出目录完整内容:");
        if let Ok(entries) = std::fs::read_dir(&output_dir_absolute) {
          let mut has_files = false;
          for entry in entries {
            if let Ok(entry) = entry {
              has_files = true;
              let path = entry.path();
              if let Ok(metadata) = std::fs::metadata(&path) {
                eprintln!(
                  "  - {:?} (大小: {} 字节, 类型: {})",
                  path.file_name().unwrap_or_default(),
                  metadata.len(),
                  if metadata.is_file() {
                    "文件"
                  } else {
                    "目录"
                  }
                );
              } else {
                eprintln!(
                  "  - {:?} (无法读取元数据)",
                  path.file_name().unwrap_or_default()
                );
              }
            }
          }
          if !has_files {
            eprintln!("  - (目录为空)");
          }
        } else {
          eprintln!("  - 无法读取输出目录");
        }

        // 提供诊断建议
        eprintln!("🔍 诊断建议:");
        eprintln!("   1. 检查输入文件是否损坏: {:?}", docx_absolute);
        eprintln!("   2. 检查 LibreOffice 是否正常工作");
        eprintln!("   3. 检查输出目录权限: {:?}", output_dir_absolute);
        eprintln!("   4. 查看上方的 LibreOffice 命令输出，查找错误信息");

        // 构建详细的错误消息
        let mut error_msg = format!("PDF 文件未生成在输出目录: {:?}\n", output_dir_absolute);
        error_msg.push_str(&format!("错误详情: {}\n", e));
        error_msg.push_str("可能的原因:\n");
        error_msg.push_str("1. 输入文件格式不支持或已损坏\n");
        error_msg.push_str("2. LibreOffice 转换过程中出现错误（请查看控制台日志）\n");
        error_msg.push_str("3. 输出目录权限不足\n");
        error_msg.push_str("4. 系统资源不足（内存/磁盘空间）\n");
        error_msg.push_str("\n建议:\n");
        error_msg.push_str("- 检查输入文件是否可以在其他程序中正常打开\n");
        error_msg.push_str("- 查看控制台日志获取更多诊断信息\n");
        error_msg.push_str("- 尝试重新打开文件或重启应用");

        return Err(error_msg);
      }
    };

    // 5. 移动到缓存目录并生成缓存键
    let cache_key = self.generate_cache_key(docx_path)?;
    let cached_pdf_path = self.cache_dir.join(format!("{}.pdf", cache_key));

    fs::copy(&temp_pdf_path, &cached_pdf_path)
      .map_err(|e| format!("复制 PDF 到缓存目录失败: {}", e))?;

    // ⚠️ 优化：延迟删除临时文件，避免并发请求时文件被过早删除
    // 临时文件会在系统清理时自动删除，或者由清理任务定期清理
    // 不立即删除，给并发请求更多时间找到文件
    // let _ = fs::remove_file(&temp_pdf_path);

    eprintln!("✅ PDF 转换成功: {:?}", cached_pdf_path);
    eprintln!("🔤 [字体调试] 本 PDF 由本次 DOCX 转换生成，profile=lo_user 字体配置应已生效");

    Ok(cached_pdf_path)
  }

  /// 转换 Excel → PDF（预览模式）
  /// 支持格式：XLSX, XLS, ODS
  /// 注意：CSV 不使用此方法，使用前端直接解析
  pub fn convert_excel_to_pdf(&self, excel_path: &Path) -> Result<PathBuf, String> {
    // 1. 检查 LibreOffice 可用性
    let libreoffice_path = self.get_libreoffice_path()?;

    // 2. 检查缓存
    if let Some(cached_pdf) = self.check_cache(excel_path)? {
      eprintln!("✅ 使用缓存 PDF: {:?}", cached_pdf);
      eprintln!("🔤 [字体调试] 使用缓存 PDF，未重新转换，当前看到的字体为历史转换结果");
      return Ok(cached_pdf);
    }

    // 3. 执行转换（每次转换前确保字体配置已写入）
    eprintln!("🔤 [字体调试] 转换类型=Excel 输入={:?}", excel_path);
    let _ = self.write_font_substitution_config();
    eprintln!("🔄 开始转换 Excel → PDF: {:?}", excel_path);

    // 创建临时输出目录
    let output_dir = self.cache_dir.join("temp");
    fs::create_dir_all(&output_dir).map_err(|e| format!("创建临时输出目录失败: {}", e))?;

    // 4. 配置 LibreOffice 运行环境（复用 DOCX 转换的配置）
    let mut cmd = self.build_libreoffice_command(&libreoffice_path)?;

    // 执行 LibreOffice 转换命令（Excel → PDF）
    // 使用 calc_pdf_Export filter，确保 Excel 格式正确转换
    cmd.arg("--headless")
            .arg("--convert-to")
            .arg("pdf:calc_pdf_Export:UseTaggedPDF=1:SelectPdfVersion=1:EmbedStandardFonts=1:EmbedLatinScriptFonts=1:EmbedAsianScriptFonts=1")
            .arg("--outdir")
            .arg(&output_dir)
            .arg(excel_path);

    eprintln!("📝 执行命令: {:?}", cmd);

    let output = cmd
      .output()
      .map_err(|e| format!("执行 LibreOffice 命令失败: {}", e))?;

    // 记录命令输出（无论成功与否，都记录用于调试）
    let stderr = String::from_utf8_lossy(&output.stderr);
    let stdout = String::from_utf8_lossy(&output.stdout);

    if !stderr.is_empty() {
      eprintln!("📋 LibreOffice STDERR: {}", stderr);
    }
    if !stdout.is_empty() {
      eprintln!("📋 LibreOffice STDOUT: {}", stdout);
    }

    if !output.status.success() {
      eprintln!(
        "❌ LibreOffice 命令执行失败，退出码: {:?}",
        output.status.code()
      );
      return Err(format!(
        "LibreOffice 转换失败: {}",
        if !stderr.is_empty() {
          stderr.to_string()
        } else {
          stdout.to_string()
        }
      ));
    }

    // ⚠️ 关键：即使命令返回成功，也可能没有生成文件
    eprintln!("🔍 检查输出目录是否存在: {:?}", output_dir);
    if !output_dir.exists() {
      return Err(format!("输出目录不存在: {:?}", output_dir));
    }

    // 5. 查找生成的 PDF 文件（复用 DOCX 转换的逻辑）
    let temp_pdf_path = match self.find_generated_pdf(&output_dir, excel_path) {
      Ok(path) => path,
      Err(e) => {
        eprintln!("❌ 查找 PDF 文件失败: {}", e);
        eprintln!("📋 输出目录完整内容:");
        if let Ok(entries) = std::fs::read_dir(&output_dir) {
          for entry in entries {
            if let Ok(entry) = entry {
              let path = entry.path();
              if let Ok(metadata) = std::fs::metadata(&path) {
                eprintln!(
                  "  - {:?} (大小: {} 字节, 类型: {})",
                  path,
                  metadata.len(),
                  if metadata.is_file() {
                    "文件"
                  } else {
                    "目录"
                  }
                );
              } else {
                eprintln!("  - {:?} (无法读取元数据)", path);
              }
            }
          }
        } else {
          eprintln!("  - 无法读取输出目录");
        }
        return Err(format!("PDF 文件未生成。LibreOffice 命令可能已执行，但未生成输出文件。\n错误: {}\n请检查文件是否损坏或格式不支持。", e));
      }
    };

    // 6. 移动到缓存目录并生成缓存键
    let cache_key = self.generate_cache_key(excel_path)?;
    let cached_pdf_path = self.cache_dir.join(format!("{}.pdf", cache_key));

    fs::copy(&temp_pdf_path, &cached_pdf_path)
      .map_err(|e| format!("复制 PDF 到缓存目录失败: {}", e))?;

    // ⚠️ 优化：延迟删除临时文件，避免并发请求时文件被过早删除
    // let _ = fs::remove_file(&temp_pdf_path);

    eprintln!("✅ Excel PDF 转换成功: {:?}", cached_pdf_path);
    eprintln!("🔤 [字体调试] 本 PDF 由本次 Excel 转换生成，profile=lo_user 字体配置应已生效");

    Ok(cached_pdf_path)
  }

  /// 转换演示文稿 → PDF（预览模式）
  /// 支持格式：PPTX, PPT, PPSX, PPS, ODP
  pub fn convert_presentation_to_pdf(&self, presentation_path: &Path) -> Result<PathBuf, String> {
    // 1. 检查 LibreOffice 可用性
    let libreoffice_path = self.get_libreoffice_path()?;

    // 2. 检查缓存
    if let Some(cached_pdf) = self.check_cache(presentation_path)? {
      eprintln!("✅ 使用缓存 PDF: {:?}", cached_pdf);
      eprintln!("🔤 [字体调试] 使用缓存 PDF，未重新转换，当前看到的字体为历史转换结果");
      return Ok(cached_pdf);
    }

    // 3. 执行转换（每次转换前确保字体配置已写入）
    eprintln!(
      "🔤 [字体调试] 转换类型=演示文稿(PPT) 输入={:?}",
      presentation_path
    );
    let _ = self.write_font_substitution_config();
    eprintln!("🔄 开始转换演示文稿 → PDF: {:?}", presentation_path);

    // 创建临时输出目录
    let output_dir = self.cache_dir.join("temp");
    fs::create_dir_all(&output_dir).map_err(|e| format!("创建临时输出目录失败: {}", e))?;

    // 4. 配置 LibreOffice 运行环境（复用 DOCX 转换的配置）
    let mut cmd = self.build_libreoffice_command(&libreoffice_path)?;

    // 执行 LibreOffice 转换命令（演示文稿 → PDF）
    // 使用 impress_pdf_Export filter，确保演示文稿格式正确转换
    cmd.arg("--headless")
            .arg("--convert-to")
            .arg("pdf:impress_pdf_Export:UseTaggedPDF=1:SelectPdfVersion=1:EmbedStandardFonts=1:EmbedLatinScriptFonts=1:EmbedAsianScriptFonts=1")
            .arg("--outdir")
            .arg(&output_dir)
            .arg(presentation_path);

    eprintln!("📝 执行命令: {:?}", cmd);

    let output = cmd
      .output()
      .map_err(|e| format!("执行 LibreOffice 命令失败: {}", e))?;

    // 记录命令输出（无论成功与否，都记录用于调试）
    let stderr = String::from_utf8_lossy(&output.stderr);
    let stdout = String::from_utf8_lossy(&output.stdout);

    if !stderr.is_empty() {
      eprintln!("📋 LibreOffice STDERR: {}", stderr);
    }
    if !stdout.is_empty() {
      eprintln!("📋 LibreOffice STDOUT: {}", stdout);
    }

    if !output.status.success() {
      eprintln!(
        "❌ LibreOffice 命令执行失败，退出码: {:?}",
        output.status.code()
      );
      return Err(format!(
        "LibreOffice 转换失败: {}",
        if !stderr.is_empty() {
          stderr.to_string()
        } else {
          stdout.to_string()
        }
      ));
    }

    // 5. 查找生成的 PDF 文件（复用 DOCX 转换的逻辑）
    let temp_pdf_path = match self.find_generated_pdf(&output_dir, presentation_path) {
      Ok(path) => path,
      Err(e) => {
        eprintln!("❌ 查找 PDF 文件失败: {}", e);
        return Err(format!(
          "PDF 文件未生成。LibreOffice 命令可能已执行，但未生成输出文件。\n错误: {}",
          e
        ));
      }
    };

    // 6. 移动到缓存目录并生成缓存键
    let cache_key = self.generate_cache_key(presentation_path)?;
    let cached_pdf_path = self.cache_dir.join(format!("{}.pdf", cache_key));

    fs::copy(&temp_pdf_path, &cached_pdf_path)
      .map_err(|e| format!("复制 PDF 到缓存目录失败: {}", e))?;

    // ⚠️ 优化：延迟删除临时文件，避免并发请求时文件被过早删除
    // let _ = fs::remove_file(&temp_pdf_path);

    eprintln!("✅ 演示文稿 PDF 转换成功: {:?}", cached_pdf_path);
    eprintln!("🔤 [字体调试] 本 PDF 由本次演示文稿转换生成，profile=lo_user 字体配置应已生效");

    Ok(cached_pdf_path)
  }

  /// 构建 LibreOffice 命令（复用配置逻辑）
  fn build_libreoffice_command(&self, libreoffice_path: &Path) -> Result<Command, String> {
    let mut cmd = Command::new(libreoffice_path);

    // macOS: LibreOffice.app/Contents/MacOS/soffice
    // 工作目录应该是 LibreOffice.app/Contents
    if let Some(contents_dir) = libreoffice_path
      .parent() // MacOS
      .and_then(|p| p.parent())
    // Contents
    {
      cmd.current_dir(&contents_dir);
      eprintln!("📁 设置工作目录: {:?}", contents_dir);

      // 设置 DYLD_LIBRARY_PATH 指向 LibreOffice 的库目录
      let frameworks_dir = contents_dir.join("Frameworks");
      let program_dir = contents_dir.join("MacOS");

      let existing_dyld = std::env::var("DYLD_LIBRARY_PATH").unwrap_or_default();

      let mut dyld_paths = vec![];
      if frameworks_dir.exists() {
        dyld_paths.push(frameworks_dir.to_string_lossy().to_string());
      }
      if program_dir.exists() {
        dyld_paths.push(program_dir.to_string_lossy().to_string());
      }
      if !existing_dyld.is_empty() {
        dyld_paths.push(existing_dyld);
      }

      let dyld_library_path = dyld_paths.join(":");
      if !dyld_library_path.is_empty() {
        cmd.env("DYLD_LIBRARY_PATH", &dyld_library_path);
      }

      // 设置其他必要的环境变量
      cmd.env("SAL_USE_VCLPLUGIN", "gen");

      let user_config_dir = self.cache_dir.join("lo_user");
      fs::create_dir_all(&user_config_dir).ok();
      cmd.env("SAL_DISABLE_OPENCL", "1");

      cmd.env("HOME", user_config_dir.to_string_lossy().as_ref());
      // 方案 A：显式指定 UserInstallation，使 LibreOffice 读取 lo_user/user/config/fontsubst.xcu，预览默认字体一致
      let installation_url = path_to_user_installation_url(&user_config_dir);
      cmd.arg(format!("-env:UserInstallation={}", installation_url));
      let fontsubst_path = user_config_dir
        .join("user")
        .join("config")
        .join("fontsubst.xcu");
      let fontsubst_4_path = user_config_dir
        .join("4")
        .join("user")
        .join("config")
        .join("fontsubst.xcu");
      let (cjk, latin) = Self::get_default_fonts();
      eprintln!(
        "🔤 [预览模式] 字体配置: UserInstallation={}, 字体文件={:?}, 默认 中文={} 英文={}",
        installation_url, fontsubst_path, cjk, latin
      );
      let exist1 = fontsubst_path.exists();
      let size1 = fs::metadata(&fontsubst_path).map(|m| m.len()).unwrap_or(0);
      let exist2 = fontsubst_4_path.exists();
      let size2 = fs::metadata(&fontsubst_4_path)
        .map(|m| m.len())
        .unwrap_or(0);
      eprintln!("🔤 [字体调试] 启动 soffice 前: user/config/fontsubst.xcu 存在={} 大小={} 字节, 4/user/config/fontsubst.xcu 存在={} 大小={} 字节", exist1, size1, exist2, size2);
    } else {
      eprintln!("⚠️ 无法确定 LibreOffice Contents 目录，可能影响运行");
    }

    Ok(cmd)
  }

  /// 查找生成的 PDF 文件（重构版本 - 简化逻辑）
  ///
  /// **重构原则**：
  /// 1. 简化查找逻辑，减少复杂的重试机制
  /// 2. 优先精确匹配文件名
  /// 3. 如果找不到精确匹配，返回最新的 PDF 文件（按修改时间）
  /// 4. 文件大小检查：只要 > 100 字节就认为可用
  fn find_generated_pdf(&self, output_dir: &Path, source_path: &Path) -> Result<PathBuf, String> {
    eprintln!("🔍 [预览] 扫描输出目录查找 PDF 文件: {:?}", output_dir);

    // 预期的 PDF 文件名
    let expected_pdf_filename = source_path
      .file_stem()
      .and_then(|s| s.to_str())
      .map(|s| s.to_string() + ".pdf");

    eprintln!("🔍 [预览] 预期的 PDF 文件名: {:?}", expected_pdf_filename);

    // 增加重试机制：最多重试 10 次，每次等待 500ms，总等待时间最多 5 秒
    // 确保有足够时间等待文件系统刷新文件到磁盘
    const MAX_RETRIES: u32 = 10;
    const RETRY_DELAY_MS: u64 = 500;

    eprintln!(
      "🔍 [预览] 开始查找，最多重试 {} 次，每次等待 {}ms",
      MAX_RETRIES + 1,
      RETRY_DELAY_MS
    );

    // 简化查找逻辑：直接扫描目录，优先精确匹配，其次选择最新文件
    for attempt in 0..=MAX_RETRIES {
      eprintln!("🔍 [预览] 尝试 {}/{}", attempt + 1, MAX_RETRIES + 1);
      // 收集所有 PDF 文件及其信息
      let mut pdf_files: Vec<(PathBuf, String, SystemTime, u64)> = Vec::new();

      if let Ok(entries) = fs::read_dir(output_dir) {
        for entry in entries {
          if let Ok(entry) = entry {
            let path = entry.path();

            if path.is_file() {
              if let Some(ext) = path.extension() {
                if ext == "pdf" {
                  if let Ok(metadata) = std::fs::metadata(&path) {
                    let file_size = metadata.len();
                    if file_size > 100 {
                      // 只考虑大小合理的文件
                      if let Ok(modified) = metadata.modified() {
                        let file_name = path
                          .file_name()
                          .and_then(|n| n.to_str())
                          .unwrap_or("")
                          .to_string();
                        pdf_files.push((path, file_name, modified, file_size));
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }

      // 优先精确匹配文件名（忽略大小写）
      if let Some(ref expected_filename) = expected_pdf_filename {
        for (path, file_name, _, size) in &pdf_files {
          if file_name.eq_ignore_ascii_case(expected_filename) {
            eprintln!("✅ [预览] 找到 PDF 文件: {:?} (大小: {} 字节)", path, size);
            return Ok(path.clone());
          }
        }
      }

      // 如果没有精确匹配，选择最新的文件（按修改时间）
      if !pdf_files.is_empty() {
        pdf_files.sort_by(|a, b| b.2.cmp(&a.2)); // 按修改时间降序排序
        let (path, file_name, _, size) = &pdf_files[0];
        eprintln!(
          "✅ [预览] 选择最新的 PDF 文件: {} (大小: {} 字节)",
          file_name, size
        );
        return Ok(path.clone());
      }

      // 如果没找到文件且不是最后一次尝试，等待后重试
      if attempt < MAX_RETRIES {
        eprintln!(
          "⏳ [预览] 未找到 PDF 文件，等待 {}ms 后重试... (尝试 {}/{})",
          RETRY_DELAY_MS,
          attempt + 1,
          MAX_RETRIES + 1
        );
        std::thread::sleep(Duration::from_millis(RETRY_DELAY_MS));
      } else {
        eprintln!("❌ [预览] 已达到最大重试次数，停止查找");
      }
    }

    // 所有重试都失败，返回错误
    eprintln!("❌ [预览] 所有重试都失败，返回错误");
    Err(format!(
      "PDF 文件未生成在输出目录: {:?} (已重试 {} 次)",
      output_dir,
      MAX_RETRIES + 1
    ))
  }

  /// 转换 DOCX → ODT（编辑模式）
  /// 使用独立的 ODT 缓存目录（cache/odt/），与 PDF 缓存分离
  /// 编辑模式和预览模式共享 ODT 缓存
  pub fn convert_docx_to_odt(&self, docx_path: &Path) -> Result<PathBuf, String> {
    // 1. 检查 LibreOffice 可用性
    let libreoffice_path = self.get_libreoffice_path()?;

    // 2. 检查 ODT 缓存（使用独立的 cache/odt/ 目录）
    if let Some(cached_odt) = self.check_odt_cache(docx_path)? {
      eprintln!("✅ 使用缓存 ODT: {:?}", cached_odt);
      return Ok(cached_odt);
    }

    // 3. 执行转换
    eprintln!("🔄 开始转换 DOCX → ODT: {:?}", docx_path);

    // 创建临时输出目录
    let output_dir = self.odt_cache_dir.join("temp");
    fs::create_dir_all(&output_dir).map_err(|e| format!("创建临时输出目录失败: {}", e))?;

    // 4. 配置 LibreOffice 运行环境（macOS 专用，复用 convert_docx_to_pdf 的配置）
    let mut cmd = Command::new(&libreoffice_path);

    // macOS: LibreOffice.app/Contents/MacOS/soffice
    // 工作目录应该是 LibreOffice.app/Contents
    if let Some(contents_dir) = libreoffice_path
      .parent() // MacOS
      .and_then(|p| p.parent())
    // Contents
    {
      cmd.current_dir(&contents_dir);
      eprintln!("📁 设置工作目录: {:?}", contents_dir);

      // 设置 DYLD_LIBRARY_PATH 指向 LibreOffice 的库目录
      let frameworks_dir = contents_dir.join("Frameworks");
      let program_dir = contents_dir.join("MacOS");

      let existing_dyld = std::env::var("DYLD_LIBRARY_PATH").unwrap_or_default();

      let mut dyld_paths = vec![];
      if frameworks_dir.exists() {
        dyld_paths.push(frameworks_dir.to_string_lossy().to_string());
      }
      if program_dir.exists() {
        dyld_paths.push(program_dir.to_string_lossy().to_string());
      }
      if !existing_dyld.is_empty() {
        dyld_paths.push(existing_dyld);
      }

      let dyld_library_path = dyld_paths.join(":");
      if !dyld_library_path.is_empty() {
        cmd.env("DYLD_LIBRARY_PATH", &dyld_library_path);
      }

      // 设置其他必要的环境变量
      cmd.env("SAL_USE_VCLPLUGIN", "gen");

      let user_config_dir = self.odt_cache_dir.join("lo_user");
      fs::create_dir_all(&user_config_dir).ok();
      cmd.env("SAL_DISABLE_OPENCL", "1");

      cmd.env("HOME", user_config_dir.to_string_lossy().as_ref());
    }

    // 执行 LibreOffice 转换命令（转换为 ODT）
    cmd
      .arg("--headless")
      .arg("--convert-to")
      .arg("odt")
      .arg("--outdir")
      .arg(&output_dir)
      .arg(docx_path);

    eprintln!("📝 执行命令: {:?}", cmd);

    let output = cmd
      .output()
      .map_err(|e| format!("执行 LibreOffice 命令失败: {}", e))?;

    if !output.status.success() {
      let stderr = String::from_utf8_lossy(&output.stderr);
      let stdout = String::from_utf8_lossy(&output.stdout);
      eprintln!("❌ LibreOffice 标准错误: {}", stderr);
      eprintln!("❌ LibreOffice 标准输出: {}", stdout);
      return Err(format!("LibreOffice 转换失败: {}", stderr));
    }

    // 5. 查找生成的 ODT 文件
    eprintln!("🔍 扫描输出目录查找 ODT 文件: {:?}", output_dir);

    let mut temp_odt_path: Option<PathBuf> = None;

    // 首先尝试预期的文件名
    let expected_odt_filename = docx_path
      .file_stem()
      .and_then(|s| s.to_str())
      .map(|s| s.to_string() + ".odt");

    if let Some(ref filename) = expected_odt_filename {
      let expected_path = output_dir.join(filename);
      if expected_path.exists() {
        temp_odt_path = Some(expected_path);
        eprintln!("✅ 找到预期的 ODT 文件: {:?}", temp_odt_path);
      }
    }

    // 如果没找到，扫描目录中的所有 ODT 文件
    if temp_odt_path.is_none() {
      if let Ok(entries) = fs::read_dir(&output_dir) {
        for entry in entries {
          if let Ok(entry) = entry {
            let path = entry.path();

            if path.is_file() {
              if let Some(ext) = path.extension() {
                if ext == "odt" {
                  temp_odt_path = Some(path);
                  eprintln!("✅ 找到 ODT 文件: {:?}", temp_odt_path);
                  break;
                }
              }
            }
          }
        }
      }
    }

    // 如果仍然没找到，返回错误
    let temp_odt_path =
      temp_odt_path.ok_or_else(|| format!("ODT 文件未生成在输出目录: {:?}", output_dir))?;

    // 6. 移动到缓存目录并生成缓存键
    let cache_key = self.generate_cache_key(docx_path)?;
    let cached_odt_path = self.odt_cache_dir.join(format!("{}.odt", cache_key));

    fs::copy(&temp_odt_path, &cached_odt_path)
      .map_err(|e| format!("复制 ODT 到缓存目录失败: {}", e))?;

    // 清理临时文件
    let _ = fs::remove_file(&temp_odt_path);

    eprintln!("✅ ODT 转换成功: {:?}", cached_odt_path);

    Ok(cached_odt_path)
  }

  /// 检查 ODT 缓存（使用独立的 cache/odt/ 目录）
  fn check_odt_cache(&self, file_path: &Path) -> Result<Option<PathBuf>, String> {
    let cache_key = self.generate_cache_key(file_path)?;
    let cached_odt_path = self.odt_cache_dir.join(format!("{}.odt", cache_key));

    if cached_odt_path.exists() {
      // 检查缓存是否过期
      let metadata =
        fs::metadata(&cached_odt_path).map_err(|e| format!("获取缓存文件元数据失败: {}", e))?;

      let modified_time = metadata
        .modified()
        .map_err(|e| format!("获取缓存文件修改时间失败: {}", e))?;

      let elapsed = SystemTime::now()
        .duration_since(modified_time)
        .unwrap_or(Duration::from_secs(0));

      if elapsed < self.cache_duration {
        return Ok(Some(cached_odt_path));
      } else {
        // 缓存过期，删除
        let _ = fs::remove_file(&cached_odt_path);
      }
    }

    Ok(None)
  }

  /// 生成缓存键（文件路径 + 修改时间 + SHA256）
  fn generate_cache_key(&self, file_path: &Path) -> Result<String, String> {
    // 获取文件元数据
    let metadata = fs::metadata(file_path).map_err(|e| format!("获取文件元数据失败: {}", e))?;

    let modified_time = metadata
      .modified()
      .map_err(|e| format!("获取文件修改时间失败: {}", e))?;

    // 计算文件路径和修改时间的哈希
    let mut hasher = Sha256::new();
    hasher.update(file_path.to_string_lossy().as_bytes());
    hasher.update(format!("{:?}", modified_time).as_bytes());

    // 读取文件前 1KB 计算哈希（用于检测文件内容变化）
    if let Ok(mut file) = fs::File::open(file_path) {
      use std::io::Read;
      let mut buffer = vec![0u8; 1024];
      if let Ok(n) = file.read(&mut buffer) {
        hasher.update(&buffer[..n]);
      }
    }

    let hash = hasher.finalize();
    Ok(format!("{:x}", hash))
  }

  /// 检查缓存
  fn check_cache(&self, file_path: &Path) -> Result<Option<PathBuf>, String> {
    let cache_key = self.generate_cache_key(file_path)?;
    let cached_pdf_path = self.cache_dir.join(format!("{}.pdf", cache_key));

    if cached_pdf_path.exists() {
      // 检查缓存是否过期
      let metadata =
        fs::metadata(&cached_pdf_path).map_err(|e| format!("获取缓存文件元数据失败: {}", e))?;

      let modified_time = metadata
        .modified()
        .map_err(|e| format!("获取缓存文件修改时间失败: {}", e))?;

      let elapsed = SystemTime::now()
        .duration_since(modified_time)
        .unwrap_or(Duration::from_secs(0));

      if elapsed < self.cache_duration {
        return Ok(Some(cached_pdf_path));
      } else {
        // 缓存过期，删除
        let _ = fs::remove_file(&cached_pdf_path);
      }
    }

    Ok(None)
  }

  /// 清理过期缓存
  pub fn cleanup_expired_cache(&self) -> Result<usize, String> {
    let mut cleaned = 0;

    if let Ok(entries) = fs::read_dir(&self.cache_dir) {
      for entry in entries {
        if let Ok(entry) = entry {
          let path = entry.path();

          if path.extension().and_then(|s| s.to_str()) == Some("pdf") {
            if let Ok(metadata) = fs::metadata(&path) {
              if let Ok(modified_time) = metadata.modified() {
                let elapsed = SystemTime::now()
                  .duration_since(modified_time)
                  .unwrap_or(Duration::from_secs(0));

                if elapsed >= self.cache_duration {
                  if fs::remove_file(&path).is_ok() {
                    cleaned += 1;
                  }
                }
              }
            }
          }
        }
      }
    }

    Ok(cleaned)
  }
}

/// 全局 LibreOffice 服务单例
/// 使用 once_cell::sync::Lazy 确保只创建一次
/// 所有命令共享同一个服务实例，提高性能
static GLOBAL_LIBREOFFICE_SERVICE: Lazy<Mutex<Result<Arc<LibreOfficeService>, String>>> =
  Lazy::new(|| {
    Mutex::new(
      LibreOfficeService::new()
        .map(Arc::new)
        .map_err(|e| format!("初始化全局 LibreOffice 服务失败: {}", e)),
    )
  });

/// 获取全局 LibreOffice 服务实例
/// 返回类型：Result<Arc<LibreOfficeService>, String>
/// 所有命令共享同一个服务实例
pub fn get_global_libreoffice_service() -> Result<Arc<LibreOfficeService>, String> {
  let guard = GLOBAL_LIBREOFFICE_SERVICE
    .lock()
    .map_err(|e| format!("获取全局 LibreOffice 服务锁失败: {}", e))?;

  match guard.as_ref() {
    Ok(service) => Ok(Arc::clone(service)),
    Err(e) => Err(e.clone()),
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn test_libreoffice_service_new() {
    // 这个测试需要实际环境，暂时跳过
    // let service = LibreOfficeService::new();
    // assert!(service.is_ok());
  }
}
