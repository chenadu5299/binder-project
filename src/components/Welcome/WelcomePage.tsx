import React, { useState } from 'react';
import WelcomeHeader from './WelcomeHeader';
import WelcomeChatInput from './WelcomeChatInput';
import QuickActions from './QuickActions';
import RecentWorkspaces from './RecentWorkspaces';
import APIKeyConfig from '../Settings/APIKeyConfig';

interface WelcomePageProps {
  onClose: () => void;
  onStartChat: () => void; // 开始对话时触发
}

const WelcomePage: React.FC<WelcomePageProps> = ({ onClose, onStartChat }) => {
  const [showAPIKeyConfig, setShowAPIKeyConfig] = useState(false);

  return (
    <>
      <div className="fixed inset-0 bg-gray-50 dark:bg-gray-900 z-50 flex flex-col items-center justify-center overflow-y-auto">
        <div className="w-full max-w-4xl px-6 py-12">
          {/* 应用名称 */}
          <WelcomeHeader />

          {/* AI 聊天输入框 */}
          <WelcomeChatInput onStartChat={onStartChat} />

          {/* 快捷操作按钮 */}
          <QuickActions 
            onClose={onClose}
            onAPIKeyConfig={() => setShowAPIKeyConfig(true)}
          />

          {/* 历史工作区列表 */}
          <RecentWorkspaces onClose={onClose} />
        </div>
      </div>

      {/* API Key 配置对话框 */}
      {showAPIKeyConfig && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]">
          <div onClick={(e) => e.stopPropagation()}>
            <APIKeyConfig onClose={() => setShowAPIKeyConfig(false)} />
          </div>
        </div>
      )}
    </>
  );
};

export default WelcomePage;

