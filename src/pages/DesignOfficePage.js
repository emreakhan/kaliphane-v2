// src/pages/DesignOfficePage.js

import React, { useState, useEffect } from 'react';
import { Activity, Layers, Briefcase, Calendar as CalendarIcon, TrendingUp, LayoutDashboard } from 'lucide-react'; 
import { ROLES, PERSONNEL_ROLES, DESIGN_TASK_TYPES_COLLECTION, DEFAULT_DESIGN_TASK_TYPES } from '../config/constants.js'; 
import { onSnapshot, collection, addDoc } from '../config/firebase.js';

import DesignActivityLog from './DesignActivityLog.js';
import DesignPlanningPage from './DesignPlanningPage.js';
import DesignMyTasks from './DesignMyTasks.js';
import DesignTimelinePage from './DesignTimelinePage.js';
import DesignPerformancePage from './DesignPerformancePage.js';
import DesignOverviewDashboard from './DesignOverviewDashboard.js';

const DesignOfficePage = ({ projects, personnel, loggedInUser, db, designJobs }) => {
    const rolesObj = ROLES || PERSONNEL_ROLES || {};
    const isDesigner = loggedInUser?.role === rolesObj.KALIP_TASARIM_SORUMLUSU || loggedInUser?.role === rolesObj.KALIP_TASARIM_YONETICISI || loggedInUser?.role === 'Kalıp Tasarım Sorumlusu' || loggedInUser?.role === 'Kalıp Tasarım Yöneticisi';
    const canSeePlanning = loggedInUser?.role === rolesObj.ADMIN || loggedInUser?.role === rolesObj.PROJE_SORUMLUSU || loggedInUser?.role === rolesObj.KALIP_TASARIM_YONETICISI || loggedInUser?.role === 'Yönetici' || loggedInUser?.role === 'Proje Sorumlusu' || loggedInUser?.role === 'Kalıp Tasarım Yöneticisi';

    const [activeTab, setActiveTab] = useState(canSeePlanning ? 'OVERVIEW' : (isDesigner ? 'MY_TASKS' : 'LOGS'));
    const [taskTypes, setTaskTypes] = useState(DEFAULT_DESIGN_TASK_TYPES.map((name, i) => ({ id: `default-${i}`, name })));

    // TASARIM İŞ TÜRLERİ DİNAMİK CANLI TAKİBİ VEYA İLK KURULUM
    useEffect(() => {
        if (!db) return;
        const colRef = collection(db, DESIGN_TASK_TYPES_COLLECTION);
        const unsubscribe = onSnapshot(colRef, async (snapshot) => {
            if (snapshot.empty) {
                // Eğer Firestore'da henüz liste oluşmamışsa varsayılan 3 taneyi otomatik yükle
                for (let i = 0; i < DEFAULT_DESIGN_TASK_TYPES.length; i++) {
                    await addDoc(colRef, {
                        name: DEFAULT_DESIGN_TASK_TYPES[i],
                        orderIndex: i + 1,
                        createdAt: new Date().toISOString()
                    });
                }
            } else {
                const types = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                })).sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
                setTaskTypes(types);
            }
        }, (err) => {
            console.error("Tasarım iş türleri dinleme hatası:", err);
        });

        return () => unsubscribe();
    }, [db]);

    return (
        <div className="p-6 bg-gray-100 dark:bg-gray-900 min-h-screen">
            
            {/* BAŞLIK VE SEKME MENÜSÜ */}
            <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center mb-6 gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800 dark:text-white flex items-center">
                        Tasarım Ofisi Yönetimi
                    </h1>
                    <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">
                        {activeTab === 'OVERVIEW' && 'Toplantı ve genel durum analizi, anlık çalışan işler ve iş yükü paneli.'}
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
                        onClick={() => setActiveTab('OVERVIEW')}
                        className={`px-4 py-2 rounded-md text-sm font-bold flex items-center transition ${
                            activeTab === 'OVERVIEW'
                            ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300 shadow-sm'
                            : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                        }`}
                    >
                        <LayoutDashboard className="w-4 h-4 mr-2" /> Genel Bakış & Toplantı
                    </button>

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

                    {/* SADECE YÖNETİCİLER VEYA TASARIM EKİBİ GÖREBİLİR */}
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

                {activeTab === 'OVERVIEW' && (
                    <DesignOverviewDashboard designJobs={designJobs} personnel={personnel} projects={projects} taskTypes={taskTypes} />
                )}

                {activeTab === 'LOGS' && (
                    <DesignActivityLog db={db} loggedInUser={loggedInUser} projects={projects} personnel={personnel} designJobs={designJobs} taskTypes={taskTypes} />
                )}

                {activeTab === 'PLANNING' && canSeePlanning && (
                    <DesignPlanningPage db={db} designJobs={designJobs} projects={projects} personnel={personnel} loggedInUser={loggedInUser} taskTypes={taskTypes} />
                )}

                {activeTab === 'TIMELINE' && canSeePlanning && (
                    <DesignTimelinePage designJobs={designJobs} personnel={personnel} taskTypes={taskTypes} />
                )}

                {activeTab === 'MY_TASKS' && (
                    <DesignMyTasks db={db} designJobs={designJobs} projects={projects} loggedInUser={loggedInUser} taskTypes={taskTypes} />
                )}

                {activeTab === 'PERFORMANCE' && canSeePlanning && (
                    <DesignPerformancePage designJobs={designJobs} personnel={personnel} taskTypes={taskTypes} />
                )}

            </div>
        </div>
    );
};

export default DesignOfficePage;