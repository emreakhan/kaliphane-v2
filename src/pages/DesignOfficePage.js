// src/pages/DesignOfficePage.js

import React, { useState } from 'react';
import { LayoutDashboard, Activity, Layers } from 'lucide-react'; 
import { ROLES } from '../config/constants.js';

// 1. Senin eski projeler sayfan
import DesignProjectsView from './DesignProjectsView.js';

// 2. Aktivite Günlüğü
import DesignActivityLog from './DesignActivityLog.js';

// 3. YENİ EKLENEN: Tasarım İş Planlama (Kanban) Sayfası
import DesignPlanningPage from './DesignPlanningPage.js';

const DesignOfficePage = ({ projects, personnel, loggedInUser, db, designJobs }) => {
    // Varsayılan olarak Projeler sekmesi açılsın
    const [activeTab, setActiveTab] = useState('PROJECTS');

    // Sadece Yöneticilerin ve Proje Sorumlularının Planlama Sekmesini görmesi için kontrol
    const canSeePlanning = loggedInUser?.role === ROLES.ADMIN || loggedInUser?.role === ROLES.PROJE_SORUMLUSU;

    return (
        <div className="p-6 bg-gray-100 dark:bg-gray-900 min-h-screen">
            
            {/* BAŞLIK VE SEKME MENÜSÜ */}
            <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800 dark:text-white flex items-center">
                        Tasarım Ofisi Yönetimi
                    </h1>
                    <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">
                        {activeTab === 'PROJECTS' && 'Kalıp projeleri ve üretim durumu.'}
                        {activeTab === 'LOGS' && 'Günlük iş takibi ve personel performansı.'}
                        {activeTab === 'PLANNING' && 'Tasarım iş emri oluşturma ve sürükle-bırak personel atama.'}
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

                    {/* YENİ EKLENEN: TASARIM PLANLAMA SEKME BUTONU (Sadece Yöneticiler) */}
                    {canSeePlanning && (
                        <button
                            onClick={() => setActiveTab('PLANNING')}
                            className={`px-6 py-2 rounded-md text-sm font-bold flex items-center transition ${
                                activeTab === 'PLANNING'
                                ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300 shadow-sm'
                                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                            }`}
                        >
                            <Layers className="w-4 h-4 mr-2" /> Tasarım Planlama
                        </button>
                    )}
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

                {/* 2. SEKME: AKTİVİTE GÜNLÜĞÜ */}
                {activeTab === 'LOGS' && (
                    <DesignActivityLog 
                        db={db} 
                        loggedInUser={loggedInUser} 
                        projects={projects}
                        personnel={personnel} 
                    />
                )}

                {/* 3. SEKME: YENİ TASARIM PLANLAMA (KANBAN) EKRANI */}
                {activeTab === 'PLANNING' && canSeePlanning && (
                    <DesignPlanningPage 
                        db={db}
                        designJobs={designJobs}
                        projects={projects}
                        personnel={personnel}
                        loggedInUser={loggedInUser}
                    />
                )}

            </div>
        </div>
    );
};

export default DesignOfficePage;