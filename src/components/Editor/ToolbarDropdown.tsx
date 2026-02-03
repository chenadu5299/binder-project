import React, { useState, useRef, useEffect } from 'react';
import { ChevronDownIcon } from '@heroicons/react/24/outline';

interface ToolbarDropdownOption {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
}

interface ToolbarDropdownProps {
  options: ToolbarDropdownOption[];
  value?: string | number;
  onChange: (value: string | number) => void;
  buttonLabel: string;
  buttonIcon?: React.ReactNode;
  title?: string;
  isActive?: boolean;
  className?: string;
}

const ToolbarDropdown: React.FC<ToolbarDropdownProps> = ({
  options,
  value,
  onChange,
  buttonLabel,
  buttonIcon,
  title,
  isActive = false,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭下拉菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // 找到当前选中的选项
  const selectedOption = options.find(opt => opt.value === value) || options[0];

  const handleSelect = (optionValue: string | number) => {
    onChange(optionValue);
    setIsOpen(false);
  };

  return (
    <div className={`relative shrink-0 ${className}`} ref={dropdownRef}>
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className={`p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-1 shrink-0 ${
          isActive ? 'bg-blue-100 dark:bg-blue-900' : ''
        }`}
        title={title || buttonLabel}
      >
        {buttonIcon && <span className="flex-shrink-0">{buttonIcon}</span>}
        <span className="text-xs whitespace-nowrap">{selectedOption.label}</span>
        <ChevronDownIcon className={`w-3 h-3 transition-transform ${isOpen ? 'transform rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <>
          {/* 遮罩层 */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          
          {/* 下拉菜单 */}
          <div className="absolute top-full left-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded shadow-lg z-20 min-w-[120px]">
            {options.map((option) => (
              <button
                key={option.value}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleSelect(option.value);
                }}
                className={`w-full px-3 py-2 text-left text-xs hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 ${
                  value === option.value ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' : ''
                }`}
              >
                {option.icon && <span className="flex-shrink-0">{option.icon}</span>}
                <span>{option.label}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default ToolbarDropdown;

