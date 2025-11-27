import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface LayoutState {
  // 文件树状态（简化版：固定左侧）
  fileTree: {
    width: number;
    visible: boolean;
  };
  
  // 编辑器状态
  editor: {
    // 不需要位置配置
  };
  
  // 聊天窗口状态（简化版：固定右侧）
  chat: {
    width: number;
    visible: boolean;
  };
  
  // 首次打开标志
  isFirstOpen: boolean;
  showWelcomeDialog: boolean;
  
  // Actions
  setFileTreeWidth: (width: number) => void;
  setFileTreeVisible: (visible: boolean) => void;
  setChatWidth: (width: number) => void;
  setChatVisible: (visible: boolean) => void;
  setShowWelcomeDialog: (show: boolean) => void;
  markFirstOpenComplete: () => void;
}

const defaultState = {
  fileTree: {
    width: 250,
    visible: true,
  },
  editor: {},
  chat: {
    width: 350,
    visible: true,
  },
  isFirstOpen: true,
  showWelcomeDialog: true,
};

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set) => ({
      ...defaultState,
      
      setFileTreeWidth: (width) =>
        set((state) => ({
          fileTree: { ...state.fileTree, width },
        })),
      
      setFileTreeVisible: (visible) =>
        set((state) => ({
          fileTree: { ...state.fileTree, visible },
        })),
      
      setChatWidth: (width) =>
        set((state) => ({
          chat: { ...state.chat, width },
        })),
      
      setChatVisible: (visible) =>
        set((state) => ({
          chat: { ...state.chat, visible },
        })),
      
      setShowWelcomeDialog: (show) =>
        set({ showWelcomeDialog: show }),
      
      markFirstOpenComplete: () =>
        set({ isFirstOpen: false }),
    }),
    {
      name: 'binder-layout-storage',
    }
  )
);

