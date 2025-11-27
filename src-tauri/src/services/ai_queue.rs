use std::collections::VecDeque;
use std::sync::{Arc, Mutex};
use tokio::sync::oneshot;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub enum RequestPriority {
    Low,      // 自动补全
    Normal,   // 聊天
    High,     // Inline Assist
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum RequestType {
    Autocomplete,
    InlineAssist,
    Chat,
}

#[derive(Debug)]
pub struct AIRequest {
    pub id: String,
    pub priority: RequestPriority,
    pub request_type: RequestType,
    pub cancel_tx: Option<oneshot::Sender<()>>,
    pub created_at: std::time::Instant,
}

impl AIRequest {
    pub fn new(id: String, priority: RequestPriority, request_type: RequestType) -> (Self, oneshot::Receiver<()>) {
        let (tx, rx) = oneshot::channel();
        let request = Self {
            id,
            priority,
            request_type,
            cancel_tx: Some(tx),
            created_at: std::time::Instant::now(),
        };
        (request, rx)
    }
    
    pub fn is_cancelled(&self) -> bool {
        self.cancel_tx.is_none()
    }
    
    pub fn cancel(&mut self) {
        self.cancel_tx.take();
    }
}

pub struct AIRequestQueue {
    queue: Arc<Mutex<VecDeque<AIRequest>>>,
    active_requests: Arc<Mutex<usize>>,
    max_concurrent: usize,
}

impl AIRequestQueue {
    pub fn new(max_concurrent: usize) -> Self {
        Self {
            queue: Arc::new(Mutex::new(VecDeque::new())),
            active_requests: Arc::new(Mutex::new(0)),
            max_concurrent,
        }
    }

    pub fn enqueue(&self, request: AIRequest) -> Result<(), String> {
        let mut queue = self.queue.lock()
            .map_err(|e| format!("获取队列锁失败: {}", e))?;
        
        // 按优先级插入（高优先级在前）
        let pos = queue.iter()
            .position(|r| r.priority < request.priority)
            .unwrap_or(queue.len());
        queue.insert(pos, request);
        
        Ok(())
    }

    pub fn dequeue(&self) -> Option<AIRequest> {
        let mut queue = self.queue.lock().ok()?;
        let mut active = self.active_requests.lock().ok()?;
        
        // 检查是否达到最大并发数
        if *active >= self.max_concurrent {
            return None;
        }
        
        let request = queue.pop_front()?;
        *active += 1;
        Some(request)
    }

    pub fn cancel(&self, request_id: &str) -> bool {
        let Ok(mut queue) = self.queue.lock() else {
            return false;
        };
        
        // 在队列中查找并取消
        if let Some(pos) = queue.iter().position(|r| r.id == request_id) {
            if let Some(mut request) = queue.remove(pos) {
                request.cancel();
                return true;
            }
        }
        
        false
    }

    pub fn release_slot(&self) {
        if let Ok(mut active) = self.active_requests.lock() {
            if *active > 0 {
                *active -= 1;
            }
        }
    }

    pub fn active_count(&self) -> usize {
        self.active_requests.lock()
            .map(|a| *a)
            .unwrap_or(0)
    }

    pub fn queue_size(&self) -> usize {
        self.queue.lock()
            .map(|q| q.len())
            .unwrap_or(0)
    }
}

