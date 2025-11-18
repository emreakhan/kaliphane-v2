// src/components/Shared/NavItem.js

import React from 'react';
import { useNavigate } from 'react-router-dom'; // Yönlendirme kancası eklendi

const NavItem = ({ icon: Icon, label, isActive, path, taskCount }) => { 
    // 'onClick' yerine 'path' (gidilecek adres) alıyoruz
    
    const navigate = useNavigate(); // Yönlendirme fonksiyonunu tanımla
    
    const showCount = (label === 'Değerlendirme') && taskCount > 0;
    
    return (
        <button
            onClick={() => navigate(path)} // Tıklandığında ilgili 'path'e git
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

export default NavItem;