import React from 'react';
import { ChevronDownIcon } from '@heroicons/react/24/outline';
import { useChatStore } from '../../stores/chatStore';

interface ModelSelectorProps {
    tabId: string;
}

const AVAILABLE_MODELS = [
    { id: 'deepseek-chat', name: 'DeepSeek Chat (推荐)' },
    { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo' },
    { id: 'gpt-4', name: 'GPT-4' },
    { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
];

export const ModelSelector: React.FC<ModelSelectorProps> = ({ tabId }) => {
    const { tabs, setModel } = useChatStore();
    const tab = tabs.find(t => t.id === tabId);
    const [isOpen, setIsOpen] = React.useState(false);
    const dropdownRef = React.useRef<HTMLDivElement>(null);
    
    const currentModel = tab?.model || 'deepseek-chat';
    const currentModelName = AVAILABLE_MODELS.find(m => m.id === currentModel)?.name || currentModel;
    
    React.useEffect(() => {
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
    
    const handleModelSelect = (modelId: string) => {
        setModel(tabId, modelId);
        setIsOpen(false);
    };
    
    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 bg-white dark:bg-gray-800"
            >
                <span className="text-gray-700 dark:text-gray-300">{currentModelName}</span>
                <ChevronDownIcon className={`w-4 h-4 text-gray-500 transition-transform ${isOpen ? 'transform rotate-180' : ''}`} />
            </button>
            
            {isOpen && (
                <div className="absolute top-full left-0 mt-1 w-48 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg z-50">
                    {AVAILABLE_MODELS.map((model) => (
                        <button
                            key={model.id}
                            onClick={() => handleModelSelect(model.id)}
                            className={`
                                w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700
                                ${currentModel === model.id ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400' : 'text-gray-700 dark:text-gray-300'}
                                first:rounded-t-lg last:rounded-b-lg
                            `}
                        >
                            {model.name}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

