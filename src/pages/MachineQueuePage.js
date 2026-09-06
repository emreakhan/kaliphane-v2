// src/pages/MachineQueuePage.js

import React, { useState, useEffect, useMemo } from 'react';
import { 
    Layers, Plus, GripVertical, Trash2, 
    MonitorPlay, Lock, Search, ChevronDown, Activity, CalendarDays, LayoutGrid
} from 'lucide-react';
import { collection, query, onSnapshot } from '../config/firebase.js';
import { MACHINES_COLLECTION, PROJECT_COLLECTION, PERSONNEL_COLLECTION, ROLES } from '../config/constants.js';

// İçe aktarılan modern sekmeler
import CamPlanningTab from './CamPlanningTab'; 
import CamMachineMatrixTab from './CamMachineMatrixTab';
import CamTimelineTab from './CamTimelineTab'; 

// --- YETKİ KONTROLLERİ ---
const BLOCKED_ROLES = [ROLES.CNC_TORNA_OPERATORU, ROLES.CNC_TORNA_SORUMLUSU, ROLES.TAKIMHANE_SORUMLUSU];
const EDIT_ROLES = [ROLES.ADMIN, ROLES.CAM_OPERATOR, ROLES.CAM_SORUMLUSU];

const MachineQueuePage = ({ db, loggedInUser }) => {
    // SEKMELİ YAPI: PLANNING (Kalıp & İş Akış Planlama) | MATRIX (Tüm Tezgahlar Matrisi) | TIMELINE (Zaman Çizelgesi)
    const [activeTab, setActiveTab] = useState('PLANNING'); 

    const [machines, setMachines] = useState([]);
    const [projects, setProjects] = useState([]);
    const [personnel, setPersonnel] = useState([]);
    const [loading, setLoading] = useState(true);

    const canView = !BLOCKED_ROLES.includes(loggedInUser.role);
    const canEdit = EDIT_ROLES.includes(loggedInUser.role);

    useEffect(() => {
        if (!db || !canView) return;

        const unsubMachines = onSnapshot(query(collection(db, MACHINES_COLLECTION)), (snap) => {
            setMachines(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => (a.name || '').localeCompare(b.name || '')));
        });

        const unsubProjects = onSnapshot(query(collection(db, PROJECT_COLLECTION)), (snap) => {
            setProjects(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')));
        });

        const unsubPersonnel = onSnapshot(query(collection(db, PERSONNEL_COLLECTION)), (snap) => {
            setPersonnel(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            setLoading(false);
        });

        return () => { 
            unsubMachines(); 
            unsubProjects(); 
            unsubPersonnel();
        };
    }, [db, canView]);

    if (!canView) {
        return (
            <div className="flex flex-col items-center justify-center h-[70vh] text-center px-4">
                <div className="w-20 h-20 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-4 border border-red-200 dark:border-red-800">
                    <Lock className="w-10 h-10 text-red-500" />
                </div>
                <h2 className="text-2xl font-black text-gray-800 dark:text-white mb-2">Erişim Engellendi</h2>
                <p className="text-gray-500 dark:text-gray-400 max-w-md">Kullanıcı rolünüz <strong>({loggedInUser.role})</strong> bu sayfayı görüntülemek için yetkilendirilmemiştir.</p>
            </div>
        );
    }

    if (loading) return <div className="p-8 text-center text-gray-500 font-bold animate-pulse">İş akış verileri yükleniyor...</div>;

    return (
        <div className="p-4 md:p-6 max-w-[1800px] mx-auto min-h-screen">
            
            {/* ÜST BAŞLIK */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-5">
                <div>
                    <h1 className="text-2xl md:text-3xl font-black text-gray-900 dark:text-white flex items-center gap-2.5">
                        <MonitorPlay className="w-7 h-7 text-indigo-600 dark:text-indigo-400" />
                        İş Akış ve Tezgah Planlama Merkezi
                    </h1>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        Kalıp parçalarını tezgahlara ve CAM operatörlerine planlayın, tüm tezgahların canlı iş yükünü ve sıradaki kuyruğunu takip edin.
                    </p>
                </div>
            </div>

            {/* SEKME (TAB) MENÜSÜ */}
            <div className="flex bg-white dark:bg-gray-800 p-1.5 rounded-2xl shadow-xs border border-gray-200 dark:border-gray-700 w-fit mb-5 gap-1.5 overflow-x-auto">
                <button 
                    onClick={() => setActiveTab('PLANNING')} 
                    className={`px-4 py-2 rounded-xl font-black transition flex items-center whitespace-nowrap text-xs ${
                        activeTab === 'PLANNING' 
                            ? 'bg-indigo-600 text-white shadow-xs' 
                            : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                >
                    <Layers className="w-4 h-4 mr-1.5" /> Kalıp & İş Akış Planlama
                </button>
                <button 
                    onClick={() => setActiveTab('MATRIX')} 
                    className={`px-4 py-2 rounded-xl font-black transition flex items-center whitespace-nowrap text-xs ${
                        activeTab === 'MATRIX' 
                            ? 'bg-blue-600 text-white shadow-xs' 
                            : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                >
                    <LayoutGrid className="w-4 h-4 mr-1.5" /> Tüm Tezgahlar Matris Panosu ({machines.length})
                </button>
                <button 
                    onClick={() => setActiveTab('TIMELINE')} 
                    className={`px-4 py-2 rounded-xl font-black transition flex items-center whitespace-nowrap text-xs ${
                        activeTab === 'TIMELINE' 
                            ? 'bg-purple-600 text-white shadow-xs' 
                            : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                >
                    <CalendarDays className="w-4 h-4 mr-1.5" /> Zaman Çizelgesi (Gantt)
                </button>
            </div>

            {/* SEKMELERİN İÇERİĞİ */}
            {activeTab === 'PLANNING' && (
                <CamPlanningTab 
                    projects={projects} 
                    machines={machines} 
                    personnel={personnel} 
                    db={db} 
                    onOpenMatrixView={() => setActiveTab('MATRIX')}
                />
            )}

            {activeTab === 'MATRIX' && (
                <CamMachineMatrixTab 
                    projects={projects} 
                    machines={machines} 
                />
            )}

            {activeTab === 'TIMELINE' && (
                <CamTimelineTab 
                    projects={projects} 
                    machines={machines} 
                />
            )}

        </div>
    );
};

export default MachineQueuePage;