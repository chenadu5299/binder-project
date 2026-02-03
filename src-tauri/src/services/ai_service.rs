use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use crate::services::ai_config::AIConfig;
use crate::services::ai_error::AIError;
use crate::services::ai_queue::{AIRequestQueue, AIRequest, RequestPriority, RequestType};
use crate::services::ai_providers::{AIProvider, ChatMessage, ModelConfig, ChatChunk};
use crate::services::api_key_manager::APIKeyManager;
use uuid::Uuid;

pub struct AIService {
    providers: Arc<Mutex<HashMap<String, Arc<dyn AIProvider>>>>,
    queue: Arc<AIRequestQueue>,
    config: Arc<AIConfig>,
    key_manager: APIKeyManager,
}

impl AIService {
    pub fn new() -> Result<Self, String> {
        let config = Arc::new(AIConfig::load()?);
        let queue = Arc::new(AIRequestQueue::new(config.max_concurrent_requests));
        
        let providers: HashMap<String, Arc<dyn AIProvider>> = HashMap::new();
        
        // 初始化 OpenAI 提供商（如果 API 密钥存在）
        // TODO: 从密钥链加载 API 密钥
        
        let key_manager = APIKeyManager::new();
        let providers = Arc::new(Mutex::new(providers));
        
        // 尝试加载 OpenAI API 密钥并注册提供商
        match key_manager.get_key("openai") {
            Ok(api_key) => {
                eprintln!("✅ 成功加载 OpenAI API key");
                let openai_provider = Arc::new(
                    crate::services::ai_providers::OpenAIProvider::new(api_key)
                );
                if let Ok(mut providers) = providers.lock() {
                    providers.insert("openai".to_string(), openai_provider);
                    eprintln!("✅ OpenAI 提供商已注册");
                }
            }
            Err(e) => {
                eprintln!("⚠️ 未找到 OpenAI API key: {}", e);
            }
        }
        
        // 尝试加载 DeepSeek API 密钥并注册提供商
        match key_manager.get_key("deepseek") {
            Ok(api_key) => {
                eprintln!("✅ 成功加载 DeepSeek API key");
                let deepseek_provider = Arc::new(
                    crate::services::ai_providers::DeepSeekProvider::new(api_key)
                );
                if let Ok(mut providers) = providers.lock() {
                    providers.insert("deepseek".to_string(), deepseek_provider);
                    eprintln!("✅ DeepSeek 提供商已注册");
                }
            }
            Err(e) => {
                eprintln!("⚠️ 未找到 DeepSeek API key: {}", e);
            }
        }
        
        // 检查已注册的提供商
        if let Ok(providers_guard) = providers.lock() {
            let provider_names: Vec<String> = providers_guard.keys().cloned().collect();
            eprintln!("📋 已注册的 AI 提供商: {:?}", provider_names);
        }
        
        Ok(Self {
            providers,
            queue,
            config,
            key_manager,
        })
    }

    pub fn register_provider(&self, name: String, provider: Arc<dyn AIProvider>) {
        if let Ok(mut providers) = self.providers.lock() {
            providers.insert(name, provider);
        }
    }

    pub fn get_provider(&self, name: &str) -> Option<Arc<dyn AIProvider>> {
        self.providers.lock()
            .ok()
            .and_then(|providers| providers.get(name).cloned())
    }

    /// 自动补全
    pub async fn autocomplete(
        &self,
        provider_name: &str,
        context: &str,
        max_length: usize,
    ) -> Result<Option<String>, AIError> {
        let provider = self.get_provider(provider_name)
            .ok_or_else(|| AIError::Unknown(format!("提供商 {} 不存在", provider_name)))?;
        
        let request_id = format!("autocomplete-{}", Uuid::new_v4());
        let (request, mut cancel_rx) = AIRequest::new(
            request_id.clone(),
            RequestPriority::Low,
            RequestType::Autocomplete,
        );
        
        // 将请求加入队列
        self.queue.enqueue(request)
            .map_err(|e| AIError::Unknown(e))?;
        
        // 检查是否已取消
        if cancel_rx.try_recv().is_ok() {
            return Err(AIError::Cancelled);
        }
        
        // 等待队列处理（简化版，实际应该异步处理）
        // TODO: 实现异步队列处理
        
        // 直接调用提供商（临时实现）
        match provider.autocomplete(context, max_length).await {
            Ok(result) => Ok(Some(result)),
            Err(e) => {
                if e.is_retryable() {
                    // 重试逻辑
                    self.retry_with_backoff(provider.clone(), context, max_length, 3).await
                } else {
                    Err(e)
                }
            }
        }
    }

    /// Inline Assist
    pub async fn inline_assist(
        &self,
        provider_name: &str,
        instruction: &str,
        text: &str,
        context: &str,
    ) -> Result<String, AIError> {
        let provider = self.get_provider(provider_name)
            .ok_or_else(|| AIError::Unknown(format!("提供商 {} 不存在", provider_name)))?;
        
        let request_id = format!("inline-assist-{}", Uuid::new_v4());
        let (request, mut cancel_rx) = AIRequest::new(
            request_id.clone(),
            RequestPriority::High,
            RequestType::InlineAssist,
        );
        
        self.queue.enqueue(request)
            .map_err(|e| AIError::Unknown(e))?;
        
        if cancel_rx.try_recv().is_ok() {
            return Err(AIError::Cancelled);
        }
        
        match provider.inline_assist(instruction, text, context).await {
            Ok(result) => Ok(result),
            Err(e) => {
                if e.is_retryable() {
                    self.retry_inline_assist(&provider, instruction, text, context, 3).await
                } else {
                    Err(e)
                }
            }
        }
    }

    /// 聊天（流式响应）
    pub async fn chat_stream(
        &self,
        provider_name: &str,
        messages: &[ChatMessage],
        model_config: &ModelConfig,
    ) -> Result<Box<dyn tokio_stream::Stream<Item = Result<ChatChunk, AIError>> + Send + Unpin>, AIError> {
        let provider = self.get_provider(provider_name)
            .ok_or_else(|| AIError::Unknown(format!("提供商 {} 不存在", provider_name)))?;
        
        let request_id = format!("chat-{}", Uuid::new_v4());
        let (request, mut cancel_rx) = AIRequest::new(
            request_id.clone(),
            RequestPriority::Normal,
            RequestType::Chat,
        );
        
        self.queue.enqueue(request)
            .map_err(|e| AIError::Unknown(e))?;
        
        if cancel_rx.try_recv().is_ok() {
            return Err(AIError::Cancelled);
        }
        
        provider.chat_stream(messages, model_config, &mut cancel_rx, None).await
    }

    /// 取消请求
    pub fn cancel_request(&self, request_id: &str) -> bool {
        self.queue.cancel(request_id)
    }

    /// 重试机制（指数退避）
    async fn retry_with_backoff(
        &self,
        provider: Arc<dyn AIProvider>,
        context: &str,
        max_length: usize,
        max_retries: usize,
    ) -> Result<Option<String>, AIError> {
        for attempt in 0..max_retries {
            let delay = 2_u64.pow(attempt as u32);
            tokio::time::sleep(tokio::time::Duration::from_secs(delay)).await;
            
            match provider.autocomplete(context, max_length).await {
                Ok(result) => return Ok(Some(result)),
                Err(e) => {
                    if attempt == max_retries - 1 {
                        return Err(e);
                    }
                }
            }
        }
        
        Err(AIError::Unknown("重试失败".to_string()))
    }

    async fn retry_inline_assist(
        &self,
        provider: &Arc<dyn AIProvider>,
        instruction: &str,
        text: &str,
        context: &str,
        max_retries: usize,
    ) -> Result<String, AIError> {
        for attempt in 0..max_retries {
            let delay = 2_u64.pow(attempt as u32);
            tokio::time::sleep(tokio::time::Duration::from_secs(delay)).await;
            
            match provider.inline_assist(instruction, text, context).await {
                Ok(result) => return Ok(result),
                Err(e) => {
                    if attempt == max_retries - 1 {
                        return Err(e);
                    }
                }
            }
        }
        
        Err(AIError::Unknown("重试失败".to_string()))
    }

    pub fn get_config(&self) -> &AIConfig {
        &self.config
    }

    pub fn save_api_key(&self, provider: &str, key: &str) -> Result<(), String> {
        self.key_manager.save_key(provider, key)?;
        
        // 重新注册提供商
        if provider == "openai" {
            let openai_provider = Arc::new(
                crate::services::ai_providers::OpenAIProvider::new(key.to_string())
            );
            self.register_provider("openai".to_string(), openai_provider);
        } else if provider == "deepseek" {
            let deepseek_provider = Arc::new(
                crate::services::ai_providers::DeepSeekProvider::new(key.to_string())
            );
            self.register_provider("deepseek".to_string(), deepseek_provider);
        }
        
        Ok(())
    }

    pub fn get_api_key(&self, provider: &str) -> Result<String, String> {
        self.key_manager.get_key(provider)
    }
}

