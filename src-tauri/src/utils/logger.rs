// 日志工具模块
// 提供统一的日志输出，方便调试和问题排查

use std::fs::{File, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;
use dirs::home_dir;

lazy_static::lazy_static! {
    static ref LOG_FILE: Mutex<Option<File>> = Mutex::new(None);
}

/// 初始化日志文件
pub fn init_logger() {
    if let Some(home) = home_dir() {
        let log_path = home.join(".binder").join("logs").join("binder.log");
        if let Some(parent) = log_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        
        if let Ok(file) = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&log_path)
        {
            *LOG_FILE.lock().unwrap() = Some(file);
            eprintln!("📝 日志文件已初始化: {:?}", log_path);
        }
    }
}

/// 写入日志
pub fn log(level: &str, message: &str) {
    let timestamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S%.3f");
    let log_message = format!("[{}] [{}] {}\n", timestamp, level, message);
    
    // 输出到 stderr（终端可见）
    eprintln!("{}", log_message.trim());
    
    // 写入文件
    if let Ok(mut file) = LOG_FILE.lock() {
        if let Some(ref mut f) = *file {
            let _ = f.write_all(log_message.as_bytes());
            let _ = f.flush();
        }
    }
}

/// 日志宏
#[macro_export]
macro_rules! log_info {
    ($($arg:tt)*) => {
        $crate::utils::logger::log("INFO", &format!($($arg)*));
    };
}

#[macro_export]
macro_rules! log_warn {
    ($($arg:tt)*) => {
        $crate::utils::logger::log("WARN", &format!($($arg)*));
    };
}

#[macro_export]
macro_rules! log_error {
    ($($arg:tt)*) => {
        $crate::utils::logger::log("ERROR", &format!($($arg)*));
    };
}

#[macro_export]
macro_rules! log_debug {
    ($($arg:tt)*) => {
        $crate::utils::logger::log("DEBUG", &format!($($arg)*));
    };
}

