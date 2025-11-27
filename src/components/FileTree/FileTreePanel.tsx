import React, { useRef } from 'react';
import FileTree, { FileTreeRef } from './FileTree';
import NewFileButton from './NewFileButton';

const FileTreePanel: React.FC = () => {
  const fileTreeRef = useRef<FileTreeRef>(null);

  return (
    <div className="h-full flex flex-col">
      <div className="p-2 border-b border-gray-200 dark:border-gray-700">
        <NewFileButton fileTreeRef={fileTreeRef} />
      </div>
      <div className="flex-1 overflow-hidden">
        <FileTree ref={fileTreeRef} />
      </div>
    </div>
  );
};

export default FileTreePanel;

