import type { PageSize } from 'tiptap-pagination-plus';

declare module '@tiptap/core' {
  interface ChainedCommands {
    updatePageSize: (size: PageSize) => ChainedCommands;
    updateMargins: (margins: { top: number; bottom: number; left: number; right: number }) => ChainedCommands;
  }
}
