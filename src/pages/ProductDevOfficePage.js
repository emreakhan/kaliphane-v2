// src/pages/ProductDevOfficePage.js

import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, doc, setDoc, addDoc, deleteDoc } from '../config/firebase.js';
import { PRODUCT_DEV_TASK_TYPES_COLLECTION, DEFAULT_PRODUCT_DEV_TASK_TYPES, ROLES } from '../config/constants.js';
import ProductDevActivityLog from './ProductDevActivityLog.js';
import ProductDevPlanningPage from './ProductDevPlanningPage.js';
import ProductDevMyTasks from './ProductDevMyTasks.js';
import ProductDevTimelinePage from './ProductDevTimelinePage.js';
import ProductDevPerformancePage from './ProductDevPerformancePage.js';
import ProductDevOverviewDashboard from './ProductDevOverviewDashboard.js';
import ProductDevConfigModal from '../components/Modals/ProductDevConfigModal.js';
import Modal from '../components/Modals/Modal.js';
import { LayoutDashboard, Sliders, Briefcase, CalendarDays, TrendingUp, History, Settings, Plus, Trash2 } from 'lucide-react';

const PRODUCT_DEV_CONFIG_DOC_PATH = 'artifacts/default-app-id/public/data/productDevConfig';

const ProductDevOfficePage = ({ db, designJobs = [], projects = [], personnel = [], loggedInUser }) => {
    const [activeTab, setActiveTab] = useState('MY_TASKS');
    const [taskTypes, setTaskTypes] = useState([]);
    const [isTypeManagerOpen, setIsTypeManagerOpen] = useState(false);
    const [newTaskTypeName, setNewTaskTypeName] = useState('');
    const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
    const [productDevConfig, setProductDevConfig] = useState({});

    // Sadece Ürün Geliştirme Yöneticisi ve Ürün Geliştirme Sorumlusu olan personeller
    const productDevPersonnel = useMemo(() => {
        if (!Array.isArray(personnel)) return [];
        return personnel.filter(p => {
            const role = p.role || p.roleName || '';
            return role === ROLES.URUN_GELISTIRME_SORUMLUSU ||
                   role === ROLES.URUN_GELISTIRME_YONETICISI ||
                   role === 'Ürün Geliştirme Sorumlusu' ||
                   role === 'Ürün Geliştirme Yöneticisi';
        });
    }, [personnel]);

    // Task types listener
    useEffect(() => {
        if (!db) return;
        const unsubscribe = onSnapshot(collection(db, PRODUCT_DEV_TASK_TYPES_COLLECTION), (snapshot) => {
            const types = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            if (types.length === 0) {
                setTaskTypes(DEFAULT_PRODUCT_DEV_TASK_TYPES);
            } else {
                setTaskTypes(types);
            }
        }, (error) => {
            console.error("Ürün geliştirme iş türleri çekilemedi:", error);
            setTaskTypes(DEFAULT_PRODUCT_DEV_TASK_TYPES);
        });

        return () => unsubscribe();
    }, [db]);

    // Shift/break config listener
    useEffect(() => {
        if (!db) return;
        const configDocRef = doc(db, PRODUCT_DEV_CONFIG_DOC_PATH, 'settings');
        const unsubscribe = onSnapshot(configDocRef, (docSnap) => {
            if (docSnap.exists()) {
                setProductDevConfig(docSnap.data());
            } else {
                setProductDevConfig({});
            }
        }, (error) => {
            console.error("Ürün geliştirme ayarları okunamadı:", error);
        });

        return () => unsubscribe();
    }, [db]);

    const handleAddTaskType = async () => {
        if (!newTaskTypeName.trim()) return;
        try {
            await addDoc(collection(db, PRODUCT_DEV_TASK_TYPES_COLLECTION), {
                name: newTaskTypeName.trim().toUpperCase(),
                createdAt: new Date().toISOString()
            });
            setNewTaskTypeName('');
        } catch (error) {
            console.error("İş türü eklenemedi:", error);
            alert("İş türü eklenemedi.");
        }
    };

    const handleDeleteTaskType = async (typeId) => {
        if (typeof typeId !== 'string') {
            alert("Varsayılan iş türleri silinemez.");
            return;
        }
        if (!window.confirm("Bu iş türünü silmek istediğinize emin misiniz?")) return;
        try {
            await deleteDoc(doc(db, PRODUCT_DEV_TASK_TYPES_COLLECTION, typeId));
        } catch (error) {
            console.error("İş türü silinemedi:", error);
            alert("İş türü silinemedi.");
        }
    };

    const userRole = loggedInUser?.role || loggedInUser?.roleName || '';
    const isManager = [
        ROLES.ADMIN,
        ROLES.SUPERVISOR,
        ROLES.PROJE_SORUMLUSU,
        ROLES.URUN_GELISTIRME_YONETICISI,
        'Ürün Geliştirme Yöneticisi',
        'Yönetici'
    ].includes(userRole);

    return (
        <div className="min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100 p-4 space-y-4">
            {/* ÜST BAŞLIK VE TAB MENÜSÜ */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-xl font-black text-gray-800 dark:text-white flex items-center gap-2">
                        <span className="text-2xl">📦</span> Ürün Geliştirme Ofisi
                    </h1>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        Ürün geliştirme süreçleri, prototip imalatı, testler ve zaman takibi portalı.
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    {isManager && (
                        <button
                            onClick={() => setIsConfigModalOpen(true)}
                            className="px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 rounded-lg text-xs font-bold transition flex items-center gap-1.5 border border-amber-200 dark:border-amber-700/50"
                        >
                            <Settings className="w-4 h-4" /> Vardiya & Mola Ayarları
                        </button>
                    )}
                </div>
            </div>

            {/* TAB SEKMELERİ */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-2 flex overflow-x-auto gap-2">
                <button
                    onClick={() => setActiveTab('MY_TASKS')}
                    className={`px-4 py-2.5 rounded-lg text-xs font-bold transition flex items-center gap-2 whitespace-nowrap ${activeTab === 'MY_TASKS' ? 'bg-amber-600 text-white shadow-sm' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                >
                    <Briefcase className="w-4 h-4" /> Görevlerim
                </button>

                {isManager && (
                    <button
                        onClick={() => setActiveTab('PLANNING')}
                        className={`px-4 py-2.5 rounded-lg text-xs font-bold transition flex items-center gap-2 whitespace-nowrap ${activeTab === 'PLANNING' ? 'bg-amber-600 text-white shadow-sm' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                    >
                        <Sliders className="w-4 h-4" /> İş Planlama & Atama
                    </button>
                )}

                <button
                    onClick={() => setActiveTab('OVERVIEW')}
                    className={`px-4 py-2.5 rounded-lg text-xs font-bold transition flex items-center gap-2 whitespace-nowrap ${activeTab === 'OVERVIEW' ? 'bg-amber-600 text-white shadow-sm' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                >
                    <LayoutDashboard className="w-4 h-4" /> Genel Bakış (Dashboard)
                </button>

                <button
                    onClick={() => setActiveTab('TIMELINE')}
                    className={`px-4 py-2.5 rounded-lg text-xs font-bold transition flex items-center gap-2 whitespace-nowrap ${activeTab === 'TIMELINE' ? 'bg-amber-600 text-white shadow-sm' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                >
                    <CalendarDays className="w-4 h-4" /> Zaman Çizelgesi (Gantt)
                </button>

                <button
                    onClick={() => setActiveTab('PERFORMANCE')}
                    className={`px-4 py-2.5 rounded-lg text-xs font-bold transition flex items-center gap-2 whitespace-nowrap ${activeTab === 'PERFORMANCE' ? 'bg-amber-600 text-white shadow-sm' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                >
                    <TrendingUp className="w-4 h-4" /> Performans Raporları
                </button>

                <button
                    onClick={() => setActiveTab('LOGS')}
                    className={`px-4 py-2.5 rounded-lg text-xs font-bold transition flex items-center gap-2 whitespace-nowrap ${activeTab === 'LOGS' ? 'bg-amber-600 text-white shadow-sm' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                >
                    <History className="w-4 h-4" /> İş Hareket Günlüğü
                </button>
            </div>

            {/* TAB İÇERİKLERİ */}
            <div>
                {activeTab === 'MY_TASKS' && (
                    <ProductDevMyTasks
                        db={db}
                        designJobs={designJobs}
                        projects={projects}
                        loggedInUser={loggedInUser}
                        taskTypes={taskTypes}
                        designConfig={productDevConfig}
                    />
                )}

                {activeTab === 'PLANNING' && (
                    <ProductDevPlanningPage
                        db={db}
                        designJobs={designJobs}
                        projects={projects}
                        personnel={productDevPersonnel}
                        taskTypes={taskTypes}
                        loggedInUser={loggedInUser}
                        onOpenTypeManager={() => setIsTypeManagerOpen(true)}
                    />
                )}

                {activeTab === 'OVERVIEW' && (
                    <ProductDevOverviewDashboard
                        designJobs={designJobs}
                        personnel={productDevPersonnel}
                    />
                )}

                {activeTab === 'TIMELINE' && (
                    <ProductDevTimelinePage
                        designJobs={designJobs}
                        personnel={productDevPersonnel}
                    />
                )}

                {activeTab === 'PERFORMANCE' && (
                    <ProductDevPerformancePage
                        designJobs={designJobs}
                        personnel={productDevPersonnel}
                    />
                )}

                {activeTab === 'LOGS' && (
                    <ProductDevActivityLog
                        designJobs={designJobs}
                    />
                )}
            </div>

            {/* VARDİYA / MOLA AYARLARI MODALI */}
            <ProductDevConfigModal
                isOpen={isConfigModalOpen}
                onClose={() => setIsConfigModalOpen(false)}
                db={db}
                currentConfig={productDevConfig}
            />

            {/* İŞ TÜRLERİ YÖNETİM MODALI */}
            {isTypeManagerOpen && (
                <Modal isOpen={isTypeManagerOpen} onClose={() => setIsTypeManagerOpen(false)} title="⚙️ Ürün Geliştirme İş Türleri Yönetimi">
                    <div className="space-y-4 text-xs text-gray-800 dark:text-gray-200">
                        <div className="flex gap-2">
                            <input
                                type="text"
                                placeholder="Yeni iş türü ekle..."
                                value={newTaskTypeName}
                                onChange={(e) => setNewTaskTypeName(e.target.value)}
                                className="flex-1 p-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-xs"
                            />
                            <button
                                onClick={handleAddTaskType}
                                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-bold transition flex items-center gap-1"
                            >
                                <Plus className="w-4 h-4" /> Ekle
                            </button>
                        </div>

                        <div className="space-y-2 max-h-60 overflow-y-auto pr-1 pt-2 border-t border-gray-200 dark:border-gray-700">
                            {taskTypes.map((t) => {
                                const name = typeof t === 'string' ? t : t.name;
                                const id = typeof t === 'string' ? null : t.id;
                                return (
                                    <div key={id || name} className="p-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg flex justify-between items-center border border-gray-200 dark:border-gray-600">
                                        <span className="font-bold text-gray-800 dark:text-gray-200">{name}</span>
                                        {id && (
                                            <button
                                                onClick={() => handleDeleteTaskType(id)}
                                                className="p-1 text-red-500 hover:text-red-700 transition"
                                                title="Sil"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
};

export default ProductDevOfficePage;
