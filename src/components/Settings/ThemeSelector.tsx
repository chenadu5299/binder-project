import React from 'react';
import { useThemeStore, Theme } from '../../stores/themeStore';
import { SunIcon, MoonIcon, ComputerDesktopIcon } from '@heroicons/react/24/outline';

const ThemeSelector: React.FC = () => {
  const { theme, setTheme } = useThemeStore();

  return (
    <div className="p-4">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
        主题
      </label>
      <div className="space-y-2">
        <button
          onClick={() => setTheme('light')}
          className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg border transition-colors ${
            theme === 'light'
              ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-500 text-blue-600 dark:text-blue-400'
              : 'border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
          }`}
        >
          <SunIcon className="w-5 h-5" />
          <span>浅色</span>
        </button>
        <button
          onClick={() => setTheme('dark')}
          className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg border transition-colors ${
            theme === 'dark'
              ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-500 text-blue-600 dark:text-blue-400'
              : 'border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
          }`}
        >
          <MoonIcon className="w-5 h-5" />
          <span>暗色</span>
        </button>
        <button
          onClick={() => setTheme('auto')}
          className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg border transition-colors ${
            theme === 'auto'
              ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-500 text-blue-600 dark:text-blue-400'
              : 'border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
          }`}
        >
          <ComputerDesktopIcon className="w-5 h-5" />
          <span>跟随系统</span>
        </button>
      </div>
    </div>
  );
};

export default ThemeSelector;

