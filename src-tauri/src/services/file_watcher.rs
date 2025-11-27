use notify::{Watcher, RecommendedWatcher, RecursiveMode, Event, EventKind};
use std::path::PathBuf;
use std::sync::mpsc;
use tokio::sync::broadcast;

pub struct FileWatcherService {
    workspace_path: Option<PathBuf>,
    _watcher: Option<RecommendedWatcher>,
    event_sender: broadcast::Sender<String>,
}

impl FileWatcherService {
    pub fn new() -> Self {
        let (tx, _) = broadcast::channel(100);
        Self {
            workspace_path: None,
            _watcher: None,
            event_sender: tx,
        }
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
    }

    pub fn subscribe(&self) -> broadcast::Receiver<String> {
        self.event_sender.subscribe()
    }
}

impl Default for FileWatcherService {
    fn default() -> Self {
        Self::new()
    }
}

