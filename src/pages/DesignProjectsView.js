// src/pages/DesignProjectsView.js

import React, { useState, useMemo } from 'react';
import { 
    Users, Play, CheckCircle, PauseCircle,
    Briefcase, Filter, BarChart2,
    TrendingUp, Award, XCircle
} from 'lucide-react';

// Firebase Fonksiyonları
// db'yi import etmeye gerek kalmadı, prop olarak alacağız ama eski kod bozulmasın diye tutabiliriz.
// Ancak en temizi prop olarak kullanmaktır.
import { doc, updateDoc } from '../config/firebase.js'; 
import { PROJECT_COLLECTION, ROLES, PERSONNEL_ROLES } from '../config/constants.js';
import { formatDateTR, getDaysDifference, calculate6DayDiff } from '../utils/dateUtils.js';

const DesignProjectsView = ({ projects, personnel, loggedInUser, db }) => { // db parametresi eklendi
    const [activeTab, setActiveTab] = useState('ACTIVE'); // 'ACTIVE' veya 'PERFORMANCE'
    const [selectedDesignerFilter, setSelectedDesignerFilter] = useState(null);

    // --- 1. YETKİ KONTROLÜ ---
    const isManager = loggedInUser.role === ROLES.ADMIN || loggedInUser.role === ROLES.PROJE_SORUMLUSU;

    // --- 2. VERİLERİ HAZIRLA ---
    
    // Sadece 'KALIP_TASARIM_SORUMLUSU' rolündekileri getir
    const designers = useMemo(() => {
        return personnel.filter(p => 
            p.role === PERSONNEL_ROLES.KALIP_TASARIM_SORUMLUSU
        );
    }, [personnel]);

    // Tasarım İşlerini Ayır ve Filtrele
    const designTasks = useMemo(() => {
        const active = [];
        const completed = [];
        
        // Tasarımcıların Aktif Yükünü Hesaplamak için sayaç
        const designerLoad = {};
        designers.forEach(d => designerLoad[d.name] = 0);

        projects.forEach(project => {
            const status = project.designStatus || 'PENDING'; 
            const assignedTo = project.assignedDesigner;

            // Yetki Filtresi
            if (!isManager && assignedTo !== loggedInUser.name) {
                return; 
            }

            const taskData = {
                ...project,
                status: status,
                designer: assignedTo || null,
                deadline: project.designDeadline || null,
                startDate: project.designStartDate || null,
                endDate: project.designEndDate || null
            };

            if (status === 'COMPLETED') {
                completed.push(taskData);
            } else {
                active.push(taskData);
                if (taskData.designer && designerLoad[taskData.designer] !== undefined) {
                    designerLoad[taskData.designer]++;
                }
            }
        });

        active.sort((a, b) => {
            if (a.designer && !b.designer) return -1;
            if (!a.designer && b.designer) return 1;
            return 0;
        });

        return { active, completed, designerLoad };
    }, [projects, designers, isManager, loggedInUser]);

    // PERFORMANS İSTATİSTİKLERİ
    const performanceStats = useMemo(() => {
        if (!isManager) return []; 

        const stats = {};
        
        designers.forEach(d => {
            stats[d.name] = { 
                name: d.name, 
                total: 0, 
                onTime: 0, 
                late: 0, 
                score: 0 
            };
        });

        designTasks.completed.forEach(task => {
            if (task.designer && stats[task.designer]) {
                const s = stats[task.designer];
                s.total++;

                let isLate = false;
                if (task.deadline && task.endDate) {
                    const endD = new Date(task.endDate);
                    const deadD = new Date(task.deadline);
                    endD.setHours(0,0,0,0);
                    deadD.setHours(0,0,0,0);
                    if (endD > deadD) isLate = true;
                }

                if (isLate) s.late++;
                else s.onTime++;
            }
        });

        return Object.values(stats).map(s => {
            s.score = s.total === 0 ? 0 : Math.round((s.onTime / s.total) * 100);
            return s;
        }).sort((a, b) => b.score - a.score);

    }, [designers, designTasks.completed, isManager]);

    const filteredList = useMemo(() => {
        const sourceList = activeTab === 'ACTIVE' ? designTasks.active : designTasks.completed;
        if (!selectedDesignerFilter) return sourceList;
        return sourceList.filter(task => task.designer === selectedDesignerFilter);
    }, [activeTab, designTasks, selectedDesignerFilter]);

    // --- 3. İŞLEM FONKSİYONLARI ---
    const handleAssignDesigner = async (projectId, designerName) => {
        try {
            const ref = doc(db, PROJECT_COLLECTION, projectId);
            await updateDoc(ref, { assignedDesigner: designerName, designStatus: 'ASSIGNED' });
        } catch (error) { console.error("Atama hatası:", error); }
    };

    const handleDeadlineChange = async (projectId, newDate) => {
        try {
            const ref = doc(db, PROJECT_COLLECTION, projectId);
            await updateDoc(ref, { designDeadline: newDate });
        } catch (error) { console.error("Tarih hatası:", error); }
    };

    const handleStartDesign = async (projectId) => {
        try {
            const ref = doc(db, PROJECT_COLLECTION, projectId);
            const project = projects.find(p => p.id === projectId);
            const updates = { designStatus: 'IN_PROGRESS' };
            if (!project.designStartDate) updates.designStartDate = new Date().toISOString();
            await updateDoc(ref, updates);
        } catch (error) { console.error("Başlatma hatası:", error); }
    };

    const handlePauseDesign = async (projectId) => {
        try {
            const ref = doc(db, PROJECT_COLLECTION, projectId);
            await updateDoc(ref, { designStatus: 'PAUSED' });
        } catch (error) { console.error("Duraklatma hatası:", error); }
    };

    const handleCompleteDesign = async (projectId) => {
        if(!window.confirm("Tasarımı tamamladığınızı onaylıyor musunuz?")) return;
        try {
            const ref = doc(db, PROJECT_COLLECTION, projectId);
            await updateDoc(ref, { designStatus: 'COMPLETED', designEndDate: new Date().toISOString() });
        } catch (error) { console.error("Bitirme hatası:", error); }
    };

    // --- 4. YARDIMCI BİLEŞENLER ---

    const DesignerLoadCard = ({ designer, load }) => {
        let statusColor = "bg-green-100 text-green-700 border-green-200";
        if (load >= 2) statusColor = "bg-yellow-100 text-yellow-700 border-yellow-200";
        if (load >= 4) statusColor = "bg-red-100 text-red-700 border-red-200 animate-pulse";
        const isSelected = selectedDesignerFilter === designer.name;

        return (
            <div 
                onClick={() => {
                    if (isSelected) setSelectedDesignerFilter(null);
                    else setSelectedDesignerFilter(designer.name);
                }}
                className={`p-3 rounded-lg border flex flex-col items-center justify-center min-w-[120px] shadow-sm cursor-pointer transition-all transform hover:scale-105 ${statusColor} ${isSelected ? 'ring-4 ring-blue-500 ring-opacity-50 scale-105 z-10' : 'hover:shadow-md'}`}
            >
                <div className="bg-white/50 p-2 rounded-full mb-1">
                    <Users className="w-5 h-5" />
                </div>
                <h4 className="font-bold text-sm truncate w-full text-center">{designer.name}</h4>
                <span className="text-xs font-semibold mt-1">{load} Aktif İş</span>
            </div>
        );
    };

    const PerformanceCard = ({ stats }) => {
        let colorClass = "bg-green-50 border-green-200";
        let iconColor = "text-green-600";
        let scoreText = "Harika";
        
        if (stats.score < 80) {
            colorClass = "bg-yellow-50 border-yellow-200";
            iconColor = "text-yellow-600";
            scoreText = "İyi";
        }
        if (stats.score < 50) {
            colorClass = "bg-red-50 border-red-200";
            iconColor = "text-red-600";
            scoreText = "Geliştirilmeli";
        }
        if (stats.total === 0) {
            colorClass = "bg-gray-50 border-gray-200";
            iconColor = "text-gray-400";
            scoreText = "Veri Yok";
        }

        const isSelected = selectedDesignerFilter === stats.name;
        return (
            <div 
                onClick={() => {
                    if (isSelected) setSelectedDesignerFilter(null);
                    else setSelectedDesignerFilter(stats.name);
                }}
                className={`p-4 rounded-xl border ${colorClass} shadow-sm cursor-pointer transition-all hover:shadow-md relative ${isSelected ? 'ring-2 ring-blue-500' : ''}`}
            >
                <div className="flex justify-between items-start mb-2">
                    <div>
                        <h4 className="font-bold text-gray-900 dark:text-gray-800">{stats.name}</h4>
                        <p className="text-xs text-gray-500 uppercase font-bold mt-1">{scoreText}</p>
                    </div>
                    <div className={`p-2 bg-white rounded-full shadow-sm ${iconColor}`}>
                        {stats.score >= 80 ? <Award className="w-5 h-5" /> : <BarChart2 className="w-5 h-5" />}
                    </div>
                </div>
                
                <div className="flex items-end justify-between mt-3">
                    <div>
                        <span className="text-3xl font-black text-gray-800">%{stats.score}</span>
                        <span className="text-xs text-gray-500 ml-1">Başarı</span>
                    </div>
                    <div className="text-right text-xs space-y-0.5">
                        <p className="text-green-700 font-medium"><CheckCircle className="w-3 h-3 inline mr-1"/>{stats.onTime} Zamanında</p>
                        <p className="text-red-700 font-medium"><XCircle className="w-3 h-3 inline mr-1"/>{stats.late} Geciken</p>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="p-6 bg-gray-100 dark:bg-gray-900 min-h-screen">
            
            {/* ÜST BAŞLIK */}
            <div className="flex flex-col md:flex-row justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-black text-gray-900 dark:text-white flex items-center gap-2">
                        <Briefcase className="w-6 h-6 text-purple-600" />
                        Tasarım Ofisi {isManager ? "(Yönetici Paneli)" : "(Personel Ekranı)"}
                    </h1>
                    <p className="text-sm text-gray-500 mt-1">
                        {isManager 
                            ? "Ekip yükünü yönetin, iş atamalarını yapın ve performansı izleyin." 
                            : "Size atanan işleri takip edin ve durumlarını güncelleyin."}
                    </p>
                </div>
            </div>

            {/* SEKME BUTONLARI */}
            <div className="flex gap-4 mb-6 border-b border-gray-200 dark:border-gray-700 items-center justify-between">
                <div className="flex gap-4">
                    <button 
                        onClick={() => { setActiveTab('ACTIVE'); setSelectedDesignerFilter(null); }}
                        className={`pb-2 px-4 text-sm font-bold transition-colors ${activeTab === 'ACTIVE' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        Aktif İşler ({designTasks.active.length})
                    </button>
                    {isManager && (
                        <button 
                            onClick={() => { setActiveTab('PERFORMANCE'); setSelectedDesignerFilter(null); }}
                            className={`pb-2 px-4 text-sm font-bold transition-colors ${activeTab === 'PERFORMANCE' ? 'text-green-600 border-b-2 border-green-600' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            Performans & Geçmiş ({designTasks.completed.length})
                        </button>
                    )}
                </div>
                
                {selectedDesignerFilter && (
                    <div className="text-xs font-bold text-blue-600 bg-blue-50 px-3 py-1 rounded-full animate-pulse flex items-center">
                        <Filter className="w-3 h-3 mr-1" />
                        Filtre: {selectedDesignerFilter}
                    </div>
                )}
            </div>

            {/* --- AKTİF İŞLER SEKMESİ --- */}
            {activeTab === 'ACTIVE' && (
                <>
                    {/* EKİP YÜKÜ (SADECE YÖNETİCİLER) */}
                    {isManager && (
                        <div className="mb-8">
                            <div className="flex justify-between items-end mb-3">
                                <h3 className="text-sm font-bold text-gray-500 uppercase flex items-center">
                                    <Users className="w-4 h-4 mr-2" /> Tasarım Ekibi İş Yükü
                                </h3>
                                {selectedDesignerFilter && (
                                    <button 
                                        onClick={() => setSelectedDesignerFilter(null)}
                                        className="text-xs text-blue-600 hover:underline flex items-center bg-white px-2 py-1 rounded border border-blue-200"
                                    >
                                        <Filter className="w-3 h-3 mr-1" /> Filtreyi Temizle
                                    </button>
                                )}
                            </div>
                            <div className="flex gap-4 overflow-x-auto pb-4 px-1">
                                {designers.map(d => (
                                    <DesignerLoadCard key={d.id} designer={d} load={designTasks.designerLoad[d.name] || 0} />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* TABLO */}
                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow border border-gray-200 dark:border-gray-700 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="min-w-full text-sm text-left">
                                <thead className="bg-gray-50 dark:bg-gray-900 text-gray-500 uppercase font-bold text-xs">
                                    <tr>
                                        <th className="px-6 py-3">Proje / Müşteri</th>
                                        <th className="px-6 py-3">Tasarımcı</th>
                                        <th className="px-6 py-3">Durum</th>
                                        <th className="px-6 py-3">Tasarım Termini</th>
                                        <th className="px-6 py-3 text-right">İşlem</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                    {filteredList.map(task => (
                                        <tr key={task.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                            <td className="px-6 py-4">
                                                <div className="font-bold text-gray-900 dark:text-white">{task.moldName}</div>
                                                <div className="text-xs text-gray-500">{task.customer}</div>
                                            </td>
                                            <td className="px-6 py-4">
                                                {isManager ? (
                                                    <div className="relative">
                                                        <select 
                                                            value={task.designer || ""}
                                                            onChange={(e) => handleAssignDesigner(task.id, e.target.value)}
                                                            className="bg-gray-50 border border-gray-300 text-gray-900 text-xs rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                                        >
                                                            <option value="">Ata...</option>
                                                            {designers.map(d => (
                                                                <option key={d.id} value={d.name}>{d.name} ({designTasks.designerLoad[d.name] || 0})</option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                ) : (
                                                    <span className="font-semibold text-gray-700 dark:text-gray-300">{task.designer || '-'}</span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4">
                                                {(!task.status || task.status === 'PENDING') && <span className="bg-gray-100 text-gray-800 text-xs font-medium px-2.5 py-0.5 rounded border border-gray-500">Bekliyor</span>}
                                                {task.status === 'ASSIGNED' && <span className="bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-0.5 rounded border border-blue-400">Atandı/Bekliyor</span>}
                                                {task.status === 'IN_PROGRESS' && <span className="bg-green-100 text-green-800 text-xs font-medium px-2.5 py-0.5 rounded border border-green-400 animate-pulse">Çiziliyor...</span>}
                                                {task.status === 'PAUSED' && <span className="bg-orange-100 text-orange-800 text-xs font-medium px-2.5 py-0.5 rounded border border-orange-400">Duraklatıldı</span>}
                                            </td>
                                            <td className="px-6 py-4">
                                                {isManager ? (
                                                    <input 
                                                        type="date" 
                                                        value={task.deadline || ''}
                                                        onChange={(e) => handleDeadlineChange(task.id, e.target.value)}
                                                        className="bg-transparent border-b border-gray-300 focus:border-blue-500 text-gray-700 dark:text-gray-300 text-xs focus:outline-none cursor-pointer"
                                                    />
                                                ) : (
                                                    <span className="text-gray-700 dark:text-gray-300 text-xs font-medium">
                                                        {task.deadline ? formatDateTR(task.deadline) : 'Belirlenmedi'}
                                                    </span>
                                                )}
                                                {task.deadline && (
                                                    <div className={`text-[10px] mt-1 font-bold ${getDaysDifference(task.deadline) < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                                                        {getDaysDifference(task.deadline) < 0 ? `${Math.abs(getDaysDifference(task.deadline))} gün gecikti` : `${getDaysDifference(task.deadline)} gün kaldı`}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="flex justify-end gap-2">
                                                    {task.status === 'IN_PROGRESS' ? (
                                                        <>
                                                            <button onClick={() => handlePauseDesign(task.id)} className="text-orange-600 bg-orange-100 hover:bg-orange-200 font-medium rounded-lg text-xs px-3 py-2 flex items-center">
                                                                <PauseCircle className="w-3 h-3 mr-1" /> Duraklat
                                                            </button>
                                                            <button onClick={() => handleCompleteDesign(task.id)} className="text-white bg-green-600 hover:bg-green-700 font-medium rounded-lg text-xs px-3 py-2 flex items-center">
                                                                <CheckCircle className="w-3 h-3 mr-1" /> Bitir
                                                            </button>
                                                        </>
                                                    ) : (
                                                        <button onClick={() => handleStartDesign(task.id)} disabled={!task.designer} className={`font-medium rounded-lg text-xs px-3 py-2 flex items-center ${!task.designer ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'text-white bg-blue-600 hover:bg-blue-700'}`}>
                                                            <Play className="w-3 h-3 mr-1" /> {task.status === 'PAUSED' ? 'Devam Et' : 'Başla'}
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                    {filteredList.length === 0 && (
                                        <tr><td colSpan="6" className="px-6 py-8 text-center text-gray-500 dark:text-gray-400 italic">Kayıt bulunamadı.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}

            {/* --- PERFORMANS SEKMESİ --- */}
            {activeTab === 'PERFORMANCE' && (
                <>
                    {/* YENİ: PERFORMANS KARNELERİ (ÜST PANEL) */}
                    <div className="mb-8">
                        <div className="flex justify-between items-end mb-3">
                            <h3 className="text-sm font-bold text-gray-500 uppercase flex items-center">
                                <TrendingUp className="w-4 h-4 mr-2" /> Tasarımcı Başarı Karneleri
                            </h3>
                            {selectedDesignerFilter && (
                                <button 
                                    onClick={() => setSelectedDesignerFilter(null)}
                                    className="text-xs text-blue-600 hover:underline flex items-center bg-white px-2 py-1 rounded border border-blue-200"
                                >
                                    <Filter className="w-3 h-3 mr-1" /> Filtreyi Temizle
                                </button>
                            )}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                            {performanceStats.map(stats => (
                                <PerformanceCard key={stats.name} stats={stats} />
                            ))}
                        </div>
                    </div>

                    {/* DETAY TABLOSU */}
                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow border border-gray-200 dark:border-gray-700 overflow-hidden">
                        <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
                            <h3 className="font-bold text-gray-700 dark:text-gray-300 text-sm">Geçmiş İşler Detay Listesi</h3>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="min-w-full text-sm text-left">
                                <thead className="bg-gray-50 dark:bg-gray-900 text-gray-500 uppercase font-bold text-xs">
                                    <tr>
                                        <th className="px-6 py-3">Proje / Müşteri</th>
                                        <th className="px-6 py-3">Tasarımcı</th>
                                        <th className="px-6 py-3">Hedeflenen</th>
                                        <th className="px-6 py-3">Gerçekleşen</th>
                                        <th className="px-6 py-3">Performans</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                    {filteredList.map(task => {
                                        let performanceText = "Zamanında";
                                        let performanceColor = "text-green-600";
                                        let diffDays = 0;

                                        if (task.deadline && task.endDate) {
                                            diffDays = calculate6DayDiff(task.deadline, task.endDate);
                                            const endD = new Date(task.endDate);
                                            const deadD = new Date(task.deadline);
                                            endD.setHours(0,0,0,0);
                                            deadD.setHours(0,0,0,0);
                                            if (endD > deadD) {
                                                performanceText = `${diffDays} Gün Geç`;
                                                performanceColor = "text-red-600 font-bold";
                                            } else if (endD < deadD) {
                                                performanceText = `${diffDays} Gün Erken`;
                                                performanceColor = "text-blue-600 font-bold";
                                            }
                                        }

                                        return (
                                            <tr key={task.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                                <td className="px-6 py-4">
                                                    <div className="font-bold text-gray-900 dark:text-white">{task.moldName}</div>
                                                    <div className="text-xs text-gray-500">{task.customer}</div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className="font-semibold text-gray-700 dark:text-gray-300">{task.designer}</span>
                                                </td>
                                                <td className="px-6 py-4 text-xs text-gray-500">
                                                    {task.deadline ? formatDateTR(task.deadline) : '-'}
                                                </td>
                                                <td className="px-6 py-4 text-xs text-gray-900 font-medium">
                                                    {formatDateTR(task.endDate)}
                                                </td>
                                                <td className={`px-6 py-4 text-xs ${performanceColor}`}>
                                                    {task.deadline ? performanceText : <span className="text-gray-400">Termin Yoktu</span>}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {filteredList.length === 0 && (
                                        <tr><td colSpan="5" className="px-6 py-8 text-center text-gray-500 dark:text-gray-400 italic">Kayıt bulunamadı.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default DesignProjectsView;