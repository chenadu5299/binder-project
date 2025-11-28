use notify::{Watcher, RecommendedWatcher, RecursiveMode, Event, EventKind};
use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::collections::{HashMap, VecDeque};
use std::time::{Duration, Instant};
use tokio::sync::broadcast;
use serde::{Serialize, Deserialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileChangeEvent {
    pub path: PathBuf,
    pub kind: FileChangeKind,
    pub timestamp_ms: u64, // 用于序列化（毫秒时间戳）
}

impl FileChangeEvent {
    pub fn new(path: PathBuf, kind: FileChangeKind) -> Self {
        Self {
            path,
            kind,
            timestamp_ms: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as u64,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum FileChangeKind {
    Create,
    Modify,
    Remove,
}

pub struct FileWatcherService {
    workspace_path: Option<PathBuf>,
    _watcher: Option<RecommendedWatcher>,
    event_sender: broadcast::Sender<String>,
    // ⚠️ Week 17 优化：事件去重和防抖相关字段
    pending_events: VecDeque<FileChangeEvent>,
    last_events: HashMap<PathBuf, Instant>,
    debounce_timer: Option<Instant>,
}

impl FileWatcherService {
    pub fn new() -> Self {
        let (tx, _) = broadcast::channel(100);
        Self {
            workspace_path: None,
            _watcher: None,
            event_sender: tx,
            pending_events: VecDeque::new(),
            last_events: HashMap::new(),
            debounce_timer: None,
        }
    }
    
    // ⚠️ Week 17 优化：过滤临时文件、隐藏文件、系统文件
    fn should_process_event(&self, path: &Path) -> bool {
        let path_str = path.to_string_lossy().to_lowercase();
        
        // 忽略临时文件
        if path_str.contains(".tmp") || path_str.contains(".swp") || path_str.contains("~$") {
            return false;
        }
        
        // 忽略隐藏文件（.开头的，除了 .binder）
        if let Some(file_name) = path.file_name().and_then(|n| n.to_str()) {
            if file_name.starts_with(".") && file_name != ".binder" {
                return false;
            }
            
            // 忽略系统文件
            if file_name == ".ds_store" || file_name == "thumbs.db" || file_name == ".git" {
                return false;
            }
        }
        
        // 忽略 node_modules、target 等大型目录
        if path_str.contains("node_modules") || path_str.contains("/target/") {
            return false;
        }
        
        true
    }
    
    // ⚠️ Week 17 优化：事件去重 - 相同路径的连续事件只保留最后一个
    fn deduplicate_events(&mut self, events: Vec<FileChangeEvent>) -> Vec<FileChangeEvent> {
        let mut unique_events: HashMap<PathBuf, FileChangeEvent> = HashMap::new();
        let now = Instant::now();
        
        for event in events {
            // 只处理应该处理的文件
            if !self.should_process_event(&event.path) {
                continue;
            }
            
            // 更新最后事件时间
            self.last_events.insert(event.path.clone(), now);
            
            // 相同路径的事件，保留最新的
            unique_events.insert(event.path.clone(), event);
        }
        
        // 清理过期的事件记录（超过 5 秒）
        self.last_events.retain(|_, timestamp| now.duration_since(*timestamp) < Duration::from_secs(5));
        
        unique_events.into_values().collect()
    }

    pub fn watch_workspace(&mut self, workspace_path: PathBuf) -> Result<(), String> {
        // 停止之前的监听
        self.stop_watching();

        // 创建新的监听器
        let (tx, rx) = mpsc::channel();
        let mut watcher = notify::recommended_watcher(tx)
            .map_err(|e| format!("创建文件监听器失败: {}", e))?;

        // 开始监听工作区目录
        watcher.watch(&workspace_path, RecursiveMode::Recursive)
            .map_err(|e| format!("监听目录失败: {}", e))?;

        let workspace_path_clone = workspace_path.clone();
        let event_sender = self.event_sender.clone();

        // 在后台线程处理文件系统事件
        std::thread::spawn(move || {
            loop {
                match rx.recv() {
                    Ok(event) => {
                        match event {
                            Ok(Event { kind, paths, .. }) => {
                                // 只处理创建、删除、修改事件
                                // 注意：notify 6.0 中 Rename 事件已移除，重命名会触发 Create + Remove
                                let should_notify = matches!(
                                    kind,
                                    EventKind::Create(_)
                                    | EventKind::Remove(_)
                                    | EventKind::Modify(_)
                                );

                                if should_notify {
                                    // 检查事件路径是否在工作区内
                                    for path in paths {
                                        if path.starts_with(&workspace_path_clone) {
                                            // 发送事件通知
                                            let _ = event_sender.send(workspace_path_clone.to_string_lossy().to_string());
                                            break; // 一个事件只通知一次
                                        }
                                    }
                                }
                            }
                            Err(e) => {
                                eprintln!("文件监听错误: {}", e);
                            }
                        }
                    }
                    Err(_) => {
                        // 通道关闭，退出循环
                        break;
                    }
                }
            }
        });

        self.workspace_path = Some(workspace_path);
        self._watcher = Some(watcher);

        Ok(())
    }

    pub fn stop_watching(&mut self) {
        self._watcher = None;
        self.workspace_path = None;
        // 清理事件队列
        self.pending_events.clear();
        self.last_events.clear();
        self.debounce_timer = None;
    }

    pub fn subscribe(&self) -> broadcast::Receiver<String> {
        self.event_sender.subscribe()
    }
    
    // ⚠️ Week 17 新增：获取工作区路径
    pub fn get_workspace_path(&self) -> Option<PathBuf> {
        self.workspace_path.clone()
    }
}

impl Default for FileWatcherService {
    fn default() -> Self {
        Self::new()
    }
}

