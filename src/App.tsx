import { useEffect } from 'react';
import MainLayout from "./components/Layout/MainLayout";
import { useThemeStore } from "./stores/themeStore";

function App() {
  const { theme } = useThemeStore();

  // 初始化主题
  useEffect(() => {
    // 主题会在 store 初始化时自动应用
    // 这里确保在组件挂载时也应用一次
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else if (theme === 'auto') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (prefersDark) {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
    } else {
      root.classList.remove('dark');
    }
  }, [theme]);

  return <MainLayout />;
}

export default App;
