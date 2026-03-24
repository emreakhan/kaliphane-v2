// src/pages/DesignOfficePage.js

import React, { useState } from 'react';
import { Activity, Layers, Briefcase, Calendar as CalendarIcon, TrendingUp } from 'lucide-react'; 
import { ROLES } from '../config/constants.js'; 

import DesignActivityLog from './DesignActivityLog.js';
import DesignPlanningPage from './DesignPlanningPage.js';
import DesignMyTasks from './DesignMyTasks.js';
import DesignTimelinePage from './DesignTimelinePage.js';
import DesignPerformancePage from './DesignPerformancePage.js'; // 6. YENİ SAYFAMIZ EKLENDİ

const DesignOfficePage = ({ projects, personnel, loggedInUser, db, designJobs }) => {
    const isDesigner = loggedInUser?.role === ROLES.KALIP_TASARIM_SORUMLUSU;
    const canSeePlanning = loggedInUser?.role === ROLES.ADMIN || loggedInUser?.role === ROLES.PROJE_SORUMLUSU;

    const [activeTab, setActiveTab] = useState(isDesigner ? 'MY_TASKS' : (canSeePlanning ? 'PLANNING' : 'LOGS'));

    return (
        <div className="p-6 bg-gray-100 dark:bg-gray-900 min-h-screen">
            
            {/* BAŞLIK VE SEKME MENÜSÜ */}
            <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center mb-6 gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800 dark:text-white flex items-center">
                        Tasarım Ofisi Yönetimi
                    </h1>
                    <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">
                        {activeTab === 'LOGS' && 'Tasarım ekibinin günlük detaylı aktivite ve performans dökümü.'}
                        {activeTab === 'PLANNING' && 'Tasarım iş emri oluşturma ve sürükle-bırak personel atama.'}
                        {activeTab === 'MY_TASKS' && 'Bana atanan aktif görevler ve zaman takibi.'}
                        {activeTab === 'TIMELINE' && 'Tasarım ekibi genel zaman çizelgesi ve iş kuyruğu.'}
                        {activeTab === 'PERFORMANCE' && 'Tasarım ekibinin hedeflenen saat ve termin uyum analizleri.'}
                    </p>
                </div>

                {/* SEKME BUTONLARI */}
                <div className="flex flex-wrap bg-white dark:bg-gray-800 p-1 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 gap-1">
                    
                    <button
                        onClick={() => setActiveTab('MY_TASKS')}
                        className={`px-4 py-2 rounded-md text-sm font-bold flex items-center transition ${
                            activeTab === 'MY_TASKS'
                            ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 shadow-sm'
                            : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                        }`}
                    >
                        <Briefcase className="w-4 h-4 mr-2" /> Görevlerim
                    </button>

                    {/* SADECE YÖNETİCİLER GÖREBİLİR */}
                    {canSeePlanning && (
                        <>
                            <button
                                onClick={() => setActiveTab('PLANNING')}
                                className={`px-4 py-2 rounded-md text-sm font-bold flex items-center transition ${
                                    activeTab === 'PLANNING'
                                    ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300 shadow-sm'
                                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                                }`}
                            >
                                <Layers className="w-4 h-4 mr-2" /> Planlama
                            </button>

                            <button
                                onClick={() => setActiveTab('TIMELINE')}
                                className={`px-4 py-2 rounded-md text-sm font-bold flex items-center transition ${
                                    activeTab === 'TIMELINE'
                                    ? 'bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-300 shadow-sm'
                                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                                }`}
                            >
                                <CalendarIcon className="w-4 h-4 mr-2" /> Takvim (Timeline)
                            </button>
                            
                            {/* YENİ EKLENEN PERFORMANS SEKME BUTONU */}
                            <button
                                onClick={() => setActiveTab('PERFORMANCE')}
                                className={`px-4 py-2 rounded-md text-sm font-bold flex items-center transition ${
                                    activeTab === 'PERFORMANCE'
                                    ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300 shadow-sm'
                                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                                }`}
                            >
                                <TrendingUp className="w-4 h-4 mr-2" /> Performans
                            </button>
                        </>
                    )}
                    
                    <button
                        onClick={() => setActiveTab('LOGS')}
                        className={`px-4 py-2 rounded-md text-sm font-bold flex items-center transition ${
                            activeTab === 'LOGS'
                            ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 shadow-sm'
                            : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                        }`}
                    >
                        <Activity className="w-4 h-4 mr-2" /> Günlük (Log)
                    </button>

                </div>
            </div>

            {/* İÇERİK ALANI */}
            <div className="min-h-[500px]">

                {activeTab === 'LOGS' && (
                    <DesignActivityLog db={db} loggedInUser={loggedInUser} projects={projects} personnel={personnel} designJobs={designJobs} />
                )}

                {activeTab === 'PLANNING' && canSeePlanning && (
                    <DesignPlanningPage db={db} designJobs={designJobs} projects={projects} personnel={personnel} loggedInUser={loggedInUser} />
                )}

                {activeTab === 'TIMELINE' && canSeePlanning && (
                    <DesignTimelinePage designJobs={designJobs} personnel={personnel} />
                )}

                {activeTab === 'MY_TASKS' && (
                    <DesignMyTasks db={db} designJobs={designJobs} projects={projects} loggedInUser={loggedInUser} />
                )}

                {/* YENİ PERFORMANS BİLEŞENİ ÇAĞRILIYOR */}
                {activeTab === 'PERFORMANCE' && canSeePlanning && (
                    <DesignPerformancePage designJobs={designJobs} personnel={personnel} />
                )}

            </div>
        </div>
    );
};

export default DesignOfficePage;