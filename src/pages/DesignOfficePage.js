// src/pages/DesignOfficePage.js

import React, { useState, useEffect } from 'react';
import { Activity, Layers, Briefcase, Calendar as CalendarIcon, TrendingUp, LayoutDashboard, Settings } from 'lucide-react'; 
import { ROLES, PERSONNEL_ROLES, DESIGN_TASK_TYPES_COLLECTION, DEFAULT_DESIGN_TASK_TYPES } from '../config/constants.js'; 
import { onSnapshot, collection, addDoc, doc } from '../config/firebase.js';

import DesignActivityLog from './DesignActivityLog.js';
import DesignPlanningPage from './DesignPlanningPage.js';
import DesignMyTasks from './DesignMyTasks.js';
import DesignTimelinePage from './DesignTimelinePage.js';
import DesignPerformancePage from './DesignPerformancePage.js';
import DesignOverviewDashboard from './DesignOverviewDashboard.js';
import DesignConfigModal from '../components/Modals/DesignConfigModal.js';

const DESIGN_CONFIG_DOC_PATH = 'artifacts/default-app-id/public/data/designConfig';

const DEFAULT_DESIGN_CONFIG = {
    workStartHour: 8,
    workEndHour: 18,
    lunchBreakEnabled: true,
    lunchBreakStart: "12:00",
    lunchBreakEnd: "13:00",
    breaks: [
        { id: 'b-1', name: 'Sabah Çay Molası', start: '10:00', end: '10:15', enabled: true },
        { id: 'b-2', name: 'Yemek Molası', start: '12:00', end: '13:00', enabled: true },
        { id: 'b-3', name: 'İkindi Çay Molası', start: '15:30', end: '15:45', enabled: true }
    ]
};

const DesignOfficePage = ({ projects, personnel, loggedInUser, db, designJobs }) => {
    const rolesObj = ROLES || PERSONNEL_ROLES || {};
    const isDesigner = loggedInUser?.role === rolesObj.KALIP_TASARIM_SORUMLUSU || loggedInUser?.role === rolesObj.KALIP_TASARIM_YONETICISI || loggedInUser?.role === 'Kalıp Tasarım Sorumlusu' || loggedInUser?.role === 'Kalıp Tasarım Yöneticisi';
    const canSeePlanning = loggedInUser?.role === rolesObj.ADMIN || loggedInUser?.role === rolesObj.PROJE_SORUMLUSU || loggedInUser?.role === rolesObj.KALIP_TASARIM_YONETICISI || loggedInUser?.role === 'Yönetici' || loggedInUser?.role === 'Proje Sorumlusu' || loggedInUser?.role === 'Kalıp Tasarım Yöneticisi';

    const [activeTab, setActiveTab] = useState(canSeePlanning ? 'OVERVIEW' : (isDesigner ? 'MY_TASKS' : 'LOGS'));
    const [taskTypes, setTaskTypes] = useState(DEFAULT_DESIGN_TASK_TYPES.map((name, i) => ({ id: `default-${i}`, name })));
    
    // DİNAMİK VARDİYA & MOLA AYARLARI STATE'İ
    const [designConfig, setDesignConfig] = useState(DEFAULT_DESIGN_CONFIG);
    const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);

    // TASARIM VARDİYA & MOLA AYARLARINI DİNLEME
    useEffect(() => {
        if (!db) return;
        const configDocRef = doc(db, DESIGN_CONFIG_DOC_PATH, 'settings');
        const unsubscribe = onSnapshot(configDocRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                setDesignConfig({
                    workStartHour: data.workStartHour ?? 8,
                    workEndHour: data.workEndHour ?? 18,
                    lunchBreakEnabled: data.lunchBreakEnabled ?? true,
                    lunchBreakStart: data.lunchBreakStart || "12:00",
                    lunchBreakEnd: data.lunchBreakEnd || "13:00",
                    breaks: data.breaks || DEFAULT_DESIGN_CONFIG.breaks
                });
            }
        }, (err) => {
            console.error("Vardiya ayarları dinleme hatası:", err);
        });

        return () => unsubscribe();
    }, [db]);

    // TASARIM İŞ TÜRLERİ DİNAMİK CANLI TAKİBİ VEYA İLK KURULUM
    useEffect(() => {
        if (!db) return;
        const colRef = collection(db, DESIGN_TASK_TYPES_COLLECTION);
        const unsubscribe = onSnapshot(colRef, async (snapshot) => {
            if (snapshot.empty) {
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
                <div className="flex items-center justify-between w-full xl:w-auto">
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

                    {/* YÖNETİCİ VARDİYA & MOLA AYARLARI BUTONU */}
                    {canSeePlanning && (
                        <button
                            onClick={() => setIsConfigModalOpen(true)}
                            className="xl:hidden px-3 py-2 bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm"
                            title="Vardiya & Mola Kurallarını Düzenle"
                        >
                            <Settings className="w-4 h-4 text-indigo-500" /> Kurallar
                        </button>
                    )}
                </div>

                {/* SEKME BUTONLARI & YÖNETİCİ AYARLARI */}
                <div className="flex items-center gap-2 w-full xl:w-auto overflow-x-auto pb-1 xl:pb-0">
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

                    {/* MASAÜSTÜ YÖNETİCİ AYARLARI BUTONU */}
                    {canSeePlanning && (
                        <button
                            onClick={() => setIsConfigModalOpen(true)}
                            className="hidden xl:flex px-3.5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold items-center gap-2 shadow-md transition"
                            title="Vardiya Saatleri ve Mola Kurallarını Ayarla"
                        >
                            <Settings className="w-4 h-4" /> Vardiya & Mola Kuralları
                        </button>
                    )}
                </div>
            </div>

            {/* İÇERİK ALANI */}
            <div className="min-h-[500px]">

                {activeTab === 'OVERVIEW' && (
                    <DesignOverviewDashboard designJobs={designJobs} personnel={personnel} projects={projects} taskTypes={taskTypes} designConfig={designConfig} />
                )}

                {activeTab === 'LOGS' && (
                    <DesignActivityLog db={db} loggedInUser={loggedInUser} projects={projects} personnel={personnel} designJobs={designJobs} taskTypes={taskTypes} designConfig={designConfig} />
                )}

                {activeTab === 'PLANNING' && canSeePlanning && (
                    <DesignPlanningPage db={db} designJobs={designJobs} projects={projects} personnel={personnel} loggedInUser={loggedInUser} taskTypes={taskTypes} designConfig={designConfig} />
                )}

                {activeTab === 'TIMELINE' && canSeePlanning && (
                    <DesignTimelinePage designJobs={designJobs} personnel={personnel} taskTypes={taskTypes} designConfig={designConfig} />
                )}

                {activeTab === 'MY_TASKS' && (
                    <DesignMyTasks db={db} designJobs={designJobs} projects={projects} loggedInUser={loggedInUser} taskTypes={taskTypes} designConfig={designConfig} />
                )}

                {activeTab === 'PERFORMANCE' && canSeePlanning && (
                    <DesignPerformancePage designJobs={designJobs} personnel={personnel} taskTypes={taskTypes} designConfig={designConfig} />
                )}

            </div>

            {/* KONTROL & MOLA AYARLARI MODALI */}
            <DesignConfigModal 
                isOpen={isConfigModalOpen}
                onClose={() => setIsConfigModalOpen(false)}
                db={db}
                currentConfig={designConfig}
                onConfigUpdated={(cfg) => setDesignConfig(cfg)}
            />
        </div>
    );
};

export default DesignOfficePage;