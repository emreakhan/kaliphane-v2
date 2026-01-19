// src/pages/DesignOfficePage.js

import React, { useState } from 'react';
import { LayoutDashboard, Activity } from 'lucide-react';

// 1. Senin eski 600 satırlık kodun
import DesignProjectsView from './DesignProjectsView.js';

// 2. Yeni yaptığımız Aktivite Günlüğü
import DesignActivityLog from './DesignActivityLog.js';

const DesignOfficePage = ({ projects, personnel, loggedInUser, db }) => {
    // Varsayılan olarak Projeler (Eski sayfan) açılsın
    const [activeTab, setActiveTab] = useState('PROJECTS'); 

    return (
        <div className="p-6 bg-gray-100 dark:bg-gray-900 min-h-screen">
            
            {/* BAŞLIK VE SEKME MENÜSÜ */}
            <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800 dark:text-white flex items-center">
                        Tasarım Ofisi Yönetimi
                    </h1>
                    <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">
                        {activeTab === 'PROJECTS' ? 'Kalıp projeleri ve üretim durumu.' : 'Günlük iş takibi ve personel performansı.'}
                    </p>
                </div>

                {/* SEKME BUTONLARI */}
                <div className="flex bg-white dark:bg-gray-800 p-1 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
                    <button
                        onClick={() => setActiveTab('PROJECTS')}
                        className={`px-6 py-2 rounded-md text-sm font-bold flex items-center transition ${
                            activeTab === 'PROJECTS'
                            ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300 shadow-sm'
                            : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                        }`}
                    >
                        <LayoutDashboard className="w-4 h-4 mr-2" /> Projeler
                    </button>
                    <button
                        onClick={() => setActiveTab('LOGS')}
                        className={`px-6 py-2 rounded-md text-sm font-bold flex items-center transition ${
                            activeTab === 'LOGS'
                            ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 shadow-sm'
                            : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                        }`}
                    >
                        <Activity className="w-4 h-4 mr-2" /> Aktivite Günlüğü
                    </button>
                </div>
            </div>

            {/* İÇERİK ALANI */}
            <div className="min-h-[500px]">
                
                {/* 1. SEKME: SENİN ESKİ SAYFAN */}
                <div style={{ display: activeTab === 'PROJECTS' ? 'block' : 'none' }}>
                    <DesignProjectsView 
                        projects={projects} 
                        personnel={personnel} 
                        loggedInUser={loggedInUser} 
                        db={db} 
                    />
                </div>

                {/* 2. SEKME: YENİ AKTİVİTE GÜNLÜĞÜ */}
                {/* DÜZELTME BURADA: personnel={personnel} eklendi! */}
                {activeTab === 'LOGS' && (
                    <DesignActivityLog 
                        db={db} 
                        loggedInUser={loggedInUser} 
                        projects={projects}
                        personnel={personnel} 
                    />
                )}
            </div>
        </div>
    );
};

export default DesignOfficePage;