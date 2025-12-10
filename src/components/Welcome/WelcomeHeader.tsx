import React from 'react';

const WelcomeHeader: React.FC = () => {
  return (
    <div className="text-center mb-8">
      <h1 className="text-5xl font-bold text-gray-900 dark:text-white mb-2">
        Binder（合页）
      </h1>
      <p className="text-lg text-gray-500 dark:text-gray-400">
        您的智能文档编辑助手
      </p>
    </div>
  );
};

export default WelcomeHeader;

