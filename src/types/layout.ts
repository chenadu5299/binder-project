export type PanelPosition = 'left' | 'right' | 'top' | 'bottom' | 'floating';

export type EditorPosition = 'center' | 'left' | 'right' | 'full';

export interface PanelState {
  position: PanelPosition;
  width: number;
  visible: boolean;
}

export interface ChatState extends PanelState {
  isFloating: boolean;
  floatingPosition: { x: number; y: number };
}

export interface LayoutState {
  fileTree: PanelState;
  editor: {
    position: EditorPosition;
  };
  chat: ChatState;
  isFirstOpen: boolean;
  showWelcomeDialog: boolean;
}

