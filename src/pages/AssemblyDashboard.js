// src/pages/AssemblyDashboard.js

import React, { useState, useEffect } from 'react';
import { 
    Wrench, Box, CheckCircle2, Clock, AlertTriangle, Play, CheckSquare, Search, Plus, X, Layers, ShoppingCart, Settings
} from 'lucide-react';
import { collection, query, onSnapshot, doc, updateDoc } from '../config/firebase.js';
import { PROJECT_COLLECTION, OPERATION_STATUS, MOLD_STATUS, MATERIAL_TYPES } from '../config/constants.js';
import { getCurrentDateTimeString } from '../utils/dateUtils.js';

const AssemblyDashboard = ({ db, loggedInUser }) => {
    const [allProjectsList, setAllProjectsList] = useState([]); 
    const [assemblyProjects, setAssemblyProjects] = useState([]); 
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedProject, setSelectedProject] = useState(null);
    const [loading, setLoading] = useState(true);
    
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [activeTab, setActiveTab] = useState('PARCALAR'); 

    useEffect(() => {
        if (!db) return;
        
        const q = query(collection(db, PROJECT_COLLECTION));
        const unsub = onSnapshot(q, (snap) => {
            const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            setAllProjectsList(all);
            
            const assemblyRelated = all.filter(p => 
                p.status === MOLD_STATUS.MOLD_ASSEMBLY || 
                p.status === MOLD_STATUS.MONTAJDA || 
                p.status === MOLD_STATUS.TRIAL ||
                p.status === MOLD_STATUS.DENEMEDE
            );

            setAssemblyProjects(assemblyRelated);

            if (selectedProject) {
                const updatedSelected = all.find(p => p.id === selectedProject.id);
                if (updatedSelected) setSelectedProject(updatedSelected);
            }

            setLoading(false);
        });

        return () => unsub();
    }, [db, selectedProject?.id]); 

    const handlePullToAssembly = async (projectId) => {
        try {
            await updateDoc(doc(db, PROJECT_COLLECTION, projectId), {
                status: MOLD_STATUS.MOLD_ASSEMBLY,
                assemblyQueueAddedAt: getCurrentDateTimeString()
            });
            setIsAddModalOpen(false);
        } catch (error) {
            console.error("Hata:", error);
        }
    };

    const handleStartAssembly = async (projectId) => {
        try {
            await updateDoc(doc(db, PROJECT_COLLECTION, projectId), {
                status: MOLD_STATUS.MONTAJDA,
                assemblyStartedAt: getCurrentDateTimeString(),
                assemblyStartedBy: loggedInUser.name
            });
        } catch (error) {
            console.error("Hata:", error);
        }
    };

    const handleCompleteAssembly = async (projectId) => {
        if (!window.confirm("Montajın bittiğini ve denemeye hazır olduğunu onaylıyor musunuz?")) return;
        try {
            await updateDoc(doc(db, PROJECT_COLLECTION, projectId), {
                status: MOLD_STATUS.DENEMEDE,
                assemblyFinishedAt: getCurrentDateTimeString()
            });
            alert("Kalıp DENEME aşamasına aktarıldı!");
        } catch (error) {
            console.error("Hata:", error);
        }
    };

    const getTaskStatusInfo = (task) => {
        if (!task.operations || task.operations.length === 0) return { text: 'Başlamadı', color: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' };
        
        const isAllCompleted = task.operations.every(op => op.status === OPERATION_STATUS.COMPLETED);
        const isNotStarted = task.operations.every(op => op.status === OPERATION_STATUS.NOT_STARTED);
        
        if (isAllCompleted) return { text: 'Üretim Bitti (Hazır)', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' };
        if (isNotStarted) return { text: 'Üretime Başlamadı', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' };
        return { text: 'Üretimde (Devam Ediyor)', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' };
    };

    if (loading) return <div className="p-10 text-center font-bold text-gray-800 dark:text-white">Montaj Verileri Yükleniyor...</div>;

    const availableForAssembly = allProjectsList.filter(p => 
        p.status !== MOLD_STATUS.MOLD_ASSEMBLY && 
        p.status !== MOLD_STATUS.MONTAJDA && 
        p.status !== MOLD_STATUS.COMPLETED &&
        p.status !== MOLD_STATUS.DENEMEDE
    );

    return (
        <div className="p-4 md:p-8 max-w-[1400px] mx-auto min-h-screen bg-gray-50 dark:bg-gray-900 font-sans">
            
            <header className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-black text-gray-800 dark:text-white flex items-center">
                        <Wrench className="w-10 h-10 mr-3 text-orange-500" /> Kalıp Montaj İstasyonu
                    </h1>
                    <p className="text-gray-500 dark:text-gray-400 mt-1 font-medium">Kalıp alt parçalarını ve standart elemanları birleştirin.</p>
                </div>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                
                {/* SOL KOLON: KALIP LİSTESİ */}
                <div className="lg:col-span-4 space-y-4">
                    <button 
                        onClick={() => setIsAddModalOpen(true)}
                        className="w-full flex items-center justify-center p-3 md:p-4 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-black shadow-md transition-all active:scale-95"
                    >
                        <Plus className="w-5 h-5 mr-2" /> MONTAJA YENİ KALIP ÇEK
                    </button>

                    <div className="relative">
                        <Search className="absolute left-3 top-3.5 w-5 h-5 text-gray-400" />
                        <input 
                            type="text" 
                            placeholder="Kalıp Ara..." 
                            className="w-full pl-10 p-3 rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white outline-none focus:border-orange-500 transition-colors font-bold"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>

                    <div className="space-y-3 max-h-[calc(100vh-250px)] overflow-y-auto pr-2 custom-scrollbar">
                        {assemblyProjects.length === 0 ? (
                            <div className="text-center p-6 text-gray-500 dark:text-gray-400 font-bold border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl">
                                Montaj sırasında kalıp yok.
                            </div>
                        ) : (
                            assemblyProjects.filter(p => p.moldName.toLowerCase().includes(searchTerm.toLowerCase())).map(project => (
                                <button 
                                    key={project.id}
                                    onClick={() => setSelectedProject(project)}
                                    className={`w-full text-left p-4 md:p-5 rounded-2xl border-2 transition-all ${selectedProject?.id === project.id ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20 shadow-lg' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600'}`}
                                >
                                    <div className="flex justify-between items-start mb-2">
                                        <span className={`text-[10px] font-black px-2 py-1 rounded-full ${project.status === MOLD_STATUS.MONTAJDA ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300' : 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300'}`}>
                                            {project.status}
                                        </span>
                                        <span className="text-xs text-gray-400 dark:text-gray-500 font-bold">#{project.id.substring(0,5)}</span>
                                    </div>
                                    <h3 className="text-lg md:text-xl font-black text-gray-800 dark:text-white">{project.moldName}</h3>
                                    <p className="text-xs md:text-sm text-gray-500 dark:text-gray-400 font-semibold">{project.customer}</p>
                                </button>
                            ))
                        )}
                    </div>
                </div>

                {/* SAĞ KOLON: MONTAJ DETAYLARI & 2 SEKMELİ CHECKLIST */}
                <div className="lg:col-span-8">
                    {selectedProject ? (
                        <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-xl p-4 md:p-8 border border-gray-100 dark:border-gray-700 h-full flex flex-col">
                            
                            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 border-b dark:border-gray-700 pb-6 gap-4">
                                <div>
                                    <h2 className="text-2xl md:text-3xl font-black text-gray-900 dark:text-white">{selectedProject.moldName}</h2>
                                    <p className="text-gray-500 dark:text-gray-400 font-bold mt-1 text-sm md:text-base">Müşteri: {selectedProject.customer}</p>
                                </div>
                                
                                <div className="w-full md:w-auto">
                                    {selectedProject.status === MOLD_STATUS.MOLD_ASSEMBLY ? (
                                        <button 
                                            onClick={() => handleStartAssembly(selectedProject.id)}
                                            className="w-full md:w-auto flex items-center justify-center px-6 py-3 bg-orange-500 hover:bg-orange-600 text-white font-black rounded-xl shadow-md transition-all active:scale-95"
                                        >
                                            <Play className="w-5 h-5 mr-2" /> MONTAJI BAŞLAT
                                        </button>
                                    ) : selectedProject.status === MOLD_STATUS.MONTAJDA ? (
                                        <button 
                                            onClick={() => handleCompleteAssembly(selectedProject.id)}
                                            className="w-full md:w-auto flex items-center justify-center px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-black rounded-xl shadow-md transition-all"
                                        >
                                            <CheckCircle2 className="w-5 h-5 mr-2" /> BİTİR & DENEMEYE YOLLA
                                        </button>
                                    ) : (
                                        <span className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-bold rounded-lg flex items-center">
                                            <CheckCircle2 className="w-5 h-5 mr-2" /> Bu Kalıp Denemede
                                        </span>
                                    )}
                                </div>
                            </div>

                            <div className="flex border-b-2 border-gray-200 dark:border-gray-700 mb-6 overflow-x-auto custom-scrollbar pb-[-2px]">
                                <button 
                                    onClick={() => setActiveTab('PARCALAR')}
                                    className={`flex items-center px-4 md:px-6 py-3 font-black text-sm md:text-base whitespace-nowrap transition-colors border-b-2 -mb-[2px] ${activeTab === 'PARCALAR' ? 'border-orange-500 text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/10' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'}`}
                                >
                                    <Layers className="w-5 h-5 mr-2" /> Kalıp Alt Parçaları
                                </button>
                                <button 
                                    onClick={() => setActiveTab('SARF')}
                                    className={`flex items-center px-4 md:px-6 py-3 font-black text-sm md:text-base whitespace-nowrap transition-colors border-b-2 -mb-[2px] ${activeTab === 'SARF' ? 'border-blue-500 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/10' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'}`}
                                >
                                    <ShoppingCart className="w-5 h-5 mr-2" /> Standart & Sarf Malzemeler
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                                
                                {/* 1. SEKME: KALIP PARÇALARI (Görevler) */}
                                {activeTab === 'PARCALAR' && (
                                    <div className="space-y-3">
                                        {(!selectedProject.tasks || selectedProject.tasks.length === 0) ? (
                                            <div className="p-8 text-center text-gray-500 dark:text-gray-400 font-bold bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700">
                                                Bu kalıp için henüz alt parça (görev) tanımlanmamış.
                                            </div>
                                        ) : (
                                            selectedProject.tasks.map(task => {
                                                const statusInfo = getTaskStatusInfo(task);
                                                return (
                                                    <div key={task.id} className="p-4 bg-white dark:bg-gray-800 border-2 border-gray-100 dark:border-gray-700 rounded-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-3 hover:border-gray-300 dark:hover:border-gray-600 transition-colors">
                                                        <div className="flex items-start">
                                                            <div className="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg mr-3 hidden md:block">
                                                                <Settings className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                                                            </div>
                                                            <div>
                                                                {/* İSİMLENDİRME DÜZELTİLDİ: taskName, name veya partName hangisi varsa onu yaz */}
                                                                <h4 className="font-black text-gray-800 dark:text-white text-sm md:text-base">
                                                                    {task.taskName || task.name || task.partName || 'İsimsiz Parça'}
                                                                </h4>
                                                                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mt-1">İşlem Adımı: {task.operations?.length || 0} Adet</p>
                                                            </div>
                                                        </div>
                                                        <span className={`px-3 py-1.5 rounded-lg text-xs font-black w-full md:w-auto text-center ${statusInfo.color}`}>
                                                            {statusInfo.text}
                                                        </span>
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>
                                )}

                                {/* 2. SEKME: SARF MALZEMELER (Çelik Hariç) */}
                                {activeTab === 'SARF' && (
                                    <div className="space-y-3">
                                        {(() => {
                                            const consumables = selectedProject.materials?.filter(m => m.type !== MATERIAL_TYPES.CELIK) || [];
                                            
                                            if (consumables.length === 0) {
                                                return (
                                                    <div className="p-8 text-center text-gray-500 dark:text-gray-400 font-bold bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700">
                                                        Bu kalıp için çelik harici standart/sarf malzeme listesi boş.
                                                    </div>
                                                );
                                            }

                                            return consumables.map((mat, idx) => (
                                                <div key={idx} className={`p-4 rounded-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-3 border-2 transition-colors ${mat.status === OPERATION_STATUS.BUFFER_BEKLIYOR ? 'bg-green-50 border-green-200 dark:bg-green-900/10 dark:border-green-800' : 'bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700'}`}>
                                                    <div>
                                                        <h4 className="font-black text-gray-800 dark:text-white text-sm md:text-base">{mat.name}</h4>
                                                        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mt-1">Ölçü: {mat.dimensions || 'Belirtilmedi'} | Tür: {mat.type}</p>
                                                    </div>
                                                    <div className="flex items-center justify-between w-full md:w-auto">
                                                        <span className="text-xs font-black text-gray-500 dark:text-gray-400 mr-4 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">x{mat.quantity} Adet</span>
                                                        {mat.status === OPERATION_STATUS.BUFFER_BEKLIYOR ? (
                                                            <span className="text-green-600 dark:text-green-400 flex items-center font-black text-xs bg-green-100 dark:bg-green-900/40 px-3 py-1.5 rounded-lg">
                                                                <CheckSquare className="w-4 h-4 mr-1" /> BURADA
                                                            </span>
                                                        ) : (
                                                            <span className="text-orange-500 dark:text-orange-400 flex items-center font-black text-xs bg-orange-50 dark:bg-orange-900/20 px-3 py-1.5 rounded-lg">
                                                                <Clock className="w-4 h-4 mr-1" /> DEPODA / BEKLİYOR
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            ));
                                        })()}
                                    </div>
                                )}

                            </div>
                        </div>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center bg-white dark:bg-gray-800 rounded-3xl border-2 border-dashed border-gray-300 dark:border-gray-700 p-10 md:p-20 text-center shadow-sm">
                            <Box className="w-24 h-24 text-gray-300 dark:text-gray-600 mb-6" />
                            <h3 className="text-2xl font-black text-gray-400 dark:text-gray-500 mb-2">Montaj Ekranı</h3>
                            <p className="text-gray-500 dark:text-gray-400 font-medium">İçerikleri görmek için sol taraftaki listeden bir kalıp seçin veya yeni bir kalıbı montaja çekin.</p>
                        </div>
                    )}
                </div>
            </div>

            {/* MONTAJA KALIP ÇEKME MODALI */}
            {isAddModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-2xl shadow-2xl flex flex-col overflow-hidden max-h-[85vh]">
                        <div className="p-6 border-b dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900">
                            <h2 className="text-xl font-black text-gray-800 dark:text-white flex items-center">
                                <Plus className="w-6 h-6 mr-2 text-orange-500" /> Montaja Kalıp Ekle
                            </h2>
                            <button onClick={() => setIsAddModalOpen(false)} className="text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 p-2 rounded-xl transition">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6 overflow-y-auto flex-1">
                            <p className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-4">Aşağıdaki aktif projelerden birini seçerek kendi montaj sıranıza (istasyonunuza) alabilirsiniz.</p>
                            
                            {availableForAssembly.length === 0 ? (
                                <div className="text-center p-8 bg-gray-50 dark:bg-gray-800/50 rounded-2xl font-bold text-gray-500 dark:text-gray-400">
                                    Şu an montaja alınabilecek aktif bir kalıp bulunmuyor.
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {availableForAssembly.map(p => (
                                        <div key={p.id} className="flex flex-col md:flex-row justify-between items-start md:items-center p-4 bg-white dark:bg-gray-800 border-2 border-gray-100 dark:border-gray-700 hover:border-orange-300 dark:hover:border-orange-500 rounded-xl transition-colors gap-4">
                                            <div>
                                                <h3 className="font-black text-gray-800 dark:text-white">{p.moldName}</h3>
                                                <p className="text-xs font-bold text-gray-500 dark:text-gray-400 mt-1">Müşteri: {p.customer} | Durum: {p.status}</p>
                                            </div>
                                            <button 
                                                onClick={() => handlePullToAssembly(p.id)}
                                                className="w-full md:w-auto px-5 py-2 bg-orange-100 text-orange-700 hover:bg-orange-500 hover:text-white dark:bg-orange-900/30 dark:text-orange-400 dark:hover:bg-orange-600 dark:hover:text-white font-black rounded-lg transition-all text-sm"
                                            >
                                                Seç ve Al
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};

export default AssemblyDashboard;