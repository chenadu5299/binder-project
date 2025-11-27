import { DocumentIcon, FolderIcon } from '@heroicons/react/24/outline';
import { FolderOpenIcon } from '@heroicons/react/24/solid';

interface FileIconProps {
  isDirectory: boolean;
  isExpanded?: boolean;
  fileName: string;
}

const FileIcon: React.FC<FileIconProps> = ({ isDirectory, isExpanded, fileName: _fileName }) => {
  if (isDirectory) {
    return isExpanded ? (
      <FolderOpenIcon className="w-5 h-5 text-blue-500" />
    ) : (
      <FolderIcon className="w-5 h-5 text-blue-400" />
    );
  }
  
  // const ext = fileName.split('.').pop()?.toLowerCase();
  // 可以根据扩展名返回不同图标（后续实现）
  return <DocumentIcon className="w-5 h-5 text-gray-400" />;
};

export default FileIcon;

