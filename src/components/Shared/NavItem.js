// src/components/Shared/NavItem.js

import React from 'react';

/**
 * Navigation Component
 */
const NavItem = ({ icon: Icon, label, isActive, onClick, role, taskCount }) => {
    // ... (Mevcut bileşen - değişiklik yok)
    const showCount = (label === 'Değerlendirme') && taskCount > 0;
    return (
        <button
            onClick={onClick}
            className={`flex items-center space-x-2 px-3 py-2 rounded-lg transition-colors duration-150 relative ${
                isActive
                    ? 'bg-blue-600 text-white shadow-lg'
                    : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
        >
            <Icon className="w-5 h-5" />
            <span className="font-medium">{label}</span>
             {showCount && (
                <span className="ml-auto inline-flex items-center justify-center px-2 py-0.5 text-xs font-bold leading-none text-white bg-red-600 rounded-full absolute -top-1 -right-1">
                    {taskCount}
                </span>
            )}
        </button>
    );
};

// Bu satır çok önemli, App.js'in bu dosyayı "import" edebilmesini sağlar
export default NavItem;