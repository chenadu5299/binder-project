import React, { useCallback } from 'react';
import { InlineChatInput } from '../Chat/InlineChatInput';
import { useChatStore } from '../../stores/chatStore';
import { useLayoutStore } from '../../stores/layoutStore';

interface WelcomeChatInputProps {
  onStartChat: () => void; // 首次发送消息时触发
}

const WelcomeChatInput: React.FC<WelcomeChatInputProps> = ({ onStartChat }) => {
  const { createTab, setActiveTab } = useChatStore();
  const { setFileTreeVisible, setEditorVisible, setChatVisible } = useLayoutStore();
  
  const handleCreateTab = useCallback((mode: 'agent' | 'chat') => {
    // 固定为 chat 模式
    const tabId = createTab(undefined, 'chat');
    if (!tabId) {
      console.error('❌ 创建标签页失败');
      return;
    }
    setActiveTab(tabId);
    
    // 切换到聊天界面
    setFileTreeVisible(false);
    setEditorVisible(false);
    setChatVisible(true);
    
    // 通知父组件开始聊天
    onStartChat();
    
    // 返回 tabId 供 InlineChatInput 使用
    return tabId;
  }, [createTab, setActiveTab, setFileTreeVisible, setEditorVisible, setChatVisible, onStartChat]);
  
  return (
    <div className="w-full max-w-3xl mx-auto px-4 mb-8">
      <InlineChatInput
        tabId={null}
        pendingMode="chat"
        onCreateTab={handleCreateTab}
      />
    </div>
  );
};

export default WelcomeChatInput;

