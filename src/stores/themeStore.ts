import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Theme = 'light' | 'dark' | 'auto';

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const applyTheme = (theme: Theme) => {
  const root = document.documentElement;
  
  if (theme === 'dark') {
    root.classList.add('dark');
  } else if (theme === 'auto') {
    // 跟随系统设置
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (prefersDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  } else {
    root.classList.remove('dark');
  }
};

// 监听系统主题变化
if (typeof window !== 'undefined') {
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  mediaQuery.addEventListener('change', (e) => {
    const theme = useThemeStore.getState().theme;
    if (theme === 'auto') {
      applyTheme('auto');
    }
  });
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'light',
      setTheme: (theme) => {
        set({ theme });
        applyTheme(theme);
      },
    }),
    {
      name: 'binder-theme-storage',
      onRehydrateStorage: () => (state) => {
        // 恢复主题时应用
        if (state) {
          applyTheme(state.theme);
        }
      },
    }
  )
);

// 初始化时应用主题
if (typeof window !== 'undefined') {
  const savedTheme = localStorage.getItem('binder-theme-storage');
  if (savedTheme) {
    try {
      const parsed = JSON.parse(savedTheme);
      if (parsed.state?.theme) {
        applyTheme(parsed.state.theme);
      }
    } catch (e) {
      // 忽略解析错误
    }
  }
}

