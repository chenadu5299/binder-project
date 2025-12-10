// LibreOffice 服务
// 用于 DOCX → PDF 转换（预览模式）和 DOCX → ODT 转换（编辑模式）

use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{Duration, SystemTime};
use sha2::{Sha256, Digest};
use std::fs;
use std::sync::Arc;
use once_cell::sync::Lazy;
use std::sync::Mutex;

pub struct LibreOfficeService {
    builtin_path: Option<PathBuf>,      // 内置 LibreOffice 路径（优先使用）
    cache_dir: PathBuf,                 // PDF 缓存目录（预览模式）
    odt_cache_dir: PathBuf,             // ODT 缓存目录（编辑模式，与 PDF 缓存分离）
    cache_duration: Duration,           // 缓存过期时间（1小时）
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
        fs::create_dir_all(&cache_dir)
            .map_err(|e| format!("创建 PDF 缓存目录失败: {}", e))?;
        
        // 创建 ODT 缓存目录（编辑模式，与 PDF 缓存分离）
        let odt_cache_dir = app_data_dir.join("cache").join("odt");
        fs::create_dir_all(&odt_cache_dir)
            .map_err(|e| format!("创建 ODT 缓存目录失败: {}", e))?;
        
        // 初始化服务
        let mut service = Self {
            builtin_path: None,
            cache_dir,
            odt_cache_dir,
            cache_duration: Duration::from_secs(3600), // 1小时
        };
        
        // 检测并初始化 LibreOffice
        service.initialize_libreoffice()?;
        
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
            let soffice_path = Self::get_soffice_path_from_dir(&PathBuf::from(resource_dir).join("libreoffice"));
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
        let output = Command::new(path)
            .arg("--version")
            .output();
        
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
    
    /// 转换 DOCX → PDF
    pub fn convert_docx_to_pdf(&self, docx_path: &Path) -> Result<PathBuf, String> {
        // 1. 检查 LibreOffice 可用性
        let libreoffice_path = self.get_libreoffice_path()?;
        
        // 2. 检查缓存
        if let Some(cached_pdf) = self.check_cache(docx_path)? {
            eprintln!("✅ 使用缓存 PDF: {:?}", cached_pdf);
            return Ok(cached_pdf);
        }
        
        // 3. 执行转换
        eprintln!("🔄 开始转换 DOCX → PDF: {:?}", docx_path);
        
        // 创建临时输出目录
        let output_dir = self.cache_dir.join("temp");
        fs::create_dir_all(&output_dir)
            .map_err(|e| format!("创建临时输出目录失败: {}", e))?;
        
        // 4. 配置 LibreOffice 运行环境（macOS 专用）
        let mut cmd = Command::new(&libreoffice_path);
        
        // macOS: LibreOffice.app/Contents/MacOS/soffice
        // 工作目录应该是 LibreOffice.app/Contents
        if let Some(contents_dir) = libreoffice_path
            .parent()  // MacOS
            .and_then(|p| p.parent())  // Contents
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
                eprintln!("📦 添加 Frameworks 目录到 DYLD_LIBRARY_PATH: {:?}", frameworks_dir);
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
        cmd.arg("--headless")
            .arg("--convert-to")
            .arg("pdf:writer_pdf_Export:UseTaggedPDF=1:SelectPdfVersion=1:EmbedStandardFonts=1:EmbedLatinScriptFonts=1:EmbedAsianScriptFonts=1")
            .arg("--outdir")
            .arg(&output_dir)
            .arg(docx_path);
        
        eprintln!("📝 执行命令: {:?}", cmd);
        
        let output = cmd.output()
            .map_err(|e| format!("执行 LibreOffice 命令失败: {}", e))?;
        
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            let stdout = String::from_utf8_lossy(&output.stdout);
            eprintln!("❌ LibreOffice 标准错误: {}", stderr);
            eprintln!("❌ LibreOffice 标准输出: {}", stdout);
            return Err(format!("LibreOffice 转换失败: {}", stderr));
        }
        
        // 4. 查找生成的 PDF 文件
        // LibreOffice 可能使用不同的文件名，需要扫描输出目录
        eprintln!("🔍 [PDF转换] 扫描输出目录查找 PDF 文件: {:?}", output_dir);
        
        // 列出输出目录中的所有文件（用于调试）
        if let Ok(entries) = std::fs::read_dir(&output_dir) {
            let mut file_list = Vec::new();
            for entry in entries {
                if let Ok(entry) = entry {
                    if let Ok(file_type) = entry.file_type() {
                        if file_type.is_file() {
                            if let Some(name) = entry.file_name().to_str() {
                                file_list.push(name.to_string());
                            }
                        }
                    }
                }
            }
            eprintln!("📋 [PDF转换] 输出目录内容: {:?}", file_list);
        } else {
            eprintln!("⚠️ [PDF转换] 无法读取输出目录: {:?}", output_dir);
        }
        
        let mut temp_pdf_path: Option<PathBuf> = None;
        
        // 首先尝试预期的文件名
        let expected_pdf_filename = docx_path.file_stem()
            .and_then(|s| s.to_str())
            .map(|s| s.to_string() + ".pdf");
        
        if let Some(ref filename) = expected_pdf_filename {
            let expected_path = output_dir.join(filename);
            if expected_path.exists() {
                temp_pdf_path = Some(expected_path);
                eprintln!("✅ 找到预期的 PDF 文件: {:?}", temp_pdf_path);
            }
        }
        
        // 如果没找到，扫描目录中的所有 PDF 文件
        if temp_pdf_path.is_none() {
            eprintln!("🔍 输出目录内容:");
            if let Ok(entries) = fs::read_dir(&output_dir) {
                for entry in entries {
                    if let Ok(entry) = entry {
                        let path = entry.path();
                        eprintln!("  - {:?}", path);
                        
                        // 检查是否是 PDF 文件
                        if path.is_file() {
                            if let Some(ext) = path.extension() {
                                if ext == "pdf" {
                                    temp_pdf_path = Some(path);
                                    eprintln!("✅ 找到 PDF 文件: {:?}", temp_pdf_path);
                                    break;
                                }
                            }
                        }
                    }
                }
            }
        }
        
        // 如果仍然没找到，返回错误
        let temp_pdf_path = temp_pdf_path.ok_or_else(|| {
            format!("PDF 文件未生成在输出目录: {:?}", output_dir)
        })?;
        
        // 5. 移动到缓存目录并生成缓存键
        let cache_key = self.generate_cache_key(docx_path)?;
        let cached_pdf_path = self.cache_dir.join(format!("{}.pdf", cache_key));
        
        fs::copy(&temp_pdf_path, &cached_pdf_path)
            .map_err(|e| format!("复制 PDF 到缓存目录失败: {}", e))?;
        
        // 清理临时文件
        let _ = fs::remove_file(&temp_pdf_path);
        
        eprintln!("✅ PDF 转换成功: {:?}", cached_pdf_path);
        
        Ok(cached_pdf_path)
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
        fs::create_dir_all(&output_dir)
            .map_err(|e| format!("创建临时输出目录失败: {}", e))?;
        
        // 4. 配置 LibreOffice 运行环境（macOS 专用，复用 convert_docx_to_pdf 的配置）
        let mut cmd = Command::new(&libreoffice_path);
        
        // macOS: LibreOffice.app/Contents/MacOS/soffice
        // 工作目录应该是 LibreOffice.app/Contents
        if let Some(contents_dir) = libreoffice_path
            .parent()  // MacOS
            .and_then(|p| p.parent())  // Contents
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
        cmd.arg("--headless")
            .arg("--convert-to")
            .arg("odt")
            .arg("--outdir")
            .arg(&output_dir)
            .arg(docx_path);
        
        eprintln!("📝 执行命令: {:?}", cmd);
        
        let output = cmd.output()
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
        let expected_odt_filename = docx_path.file_stem()
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
        let temp_odt_path = temp_odt_path.ok_or_else(|| {
            format!("ODT 文件未生成在输出目录: {:?}", output_dir)
        })?;
        
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
            let metadata = fs::metadata(&cached_odt_path)
                .map_err(|e| format!("获取缓存文件元数据失败: {}", e))?;
            
            let modified_time = metadata.modified()
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
        let metadata = fs::metadata(file_path)
            .map_err(|e| format!("获取文件元数据失败: {}", e))?;
        
        let modified_time = metadata.modified()
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
            let metadata = fs::metadata(&cached_pdf_path)
                .map_err(|e| format!("获取缓存文件元数据失败: {}", e))?;
            
            let modified_time = metadata.modified()
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
                .map_err(|e| format!("初始化全局 LibreOffice 服务失败: {}", e))
        )
    });

/// 获取全局 LibreOffice 服务实例
/// 返回类型：Result<Arc<LibreOfficeService>, String>
/// 所有命令共享同一个服务实例
pub fn get_global_libreoffice_service() -> Result<Arc<LibreOfficeService>, String> {
    let guard = GLOBAL_LIBREOFFICE_SERVICE.lock()
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


