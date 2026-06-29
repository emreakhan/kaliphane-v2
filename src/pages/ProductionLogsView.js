import React, { useState, useMemo } from 'react';
import { Search, Clock, PauseCircle, Activity, Box, BarChart2, Layers, AlertTriangle, Settings, ChevronDown, ChevronUp, Users, User, Calendar } from 'lucide-react';
import PersonnelProductionLogsView from './PersonnelProductionLogsView.js';

// --- YARDIMCI FONKSİYONLAR ---
const calcMs = (startStr, endStr) => {
    if (!startStr) return 0;
    const start = new Date(startStr).getTime();
    if (isNaN(start)) return 0;
    
    const end = endStr ? new Date(endStr).getTime() : Date.now();
    if (isNaN(end)) return Math.max(0, Date.now() - start);
    
    return Math.max(0, end - start);
};

const formatDuration = (ms) => {
    if (!ms || ms <= 0) return '0 Dk';
    const totalMins = Math.floor(ms / 60000);
    const totalHours = Math.floor(totalMins / 60);
    const days = Math.floor(totalHours / 24);
    const hours = totalHours % 24;
    const mins = totalMins % 60;
    
    const parts = [];
    if (days > 0) parts.push(`${days} Gün`);
    if (hours > 0) parts.push(`${hours} Saat`);
    if (mins > 0 || parts.length === 0) parts.push(`${mins} Dk`);
    return parts.join(' ');
};

const ProductionLogsView = ({ projects, personnel }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedMoldId, setSelectedMoldId] = useState(null);
    const [moldFilter, setMoldFilter] = useState('all');
    const [expandedTasks, setExpandedTasks] = useState({});
    const [subTab, setSubTab] = useState('mold'); // 'mold' or 'personnel'

    const toggleTask = (taskId) => {
        setExpandedTasks(prev => ({
            ...prev,
            [taskId]: !prev[taskId]
        }));
    };

    // --- TÜM VERİLERİ VE SÜRELERİ HESAPLAYAN MOTOR ---
    const moldsWithStats = useMemo(() => {
        if (!projects) return [];

        return projects.map(mold => {
            let moldWorkMs = 0;
            let moldSetupMs = 0;
            let moldProdMs = 0;
            let moldPauseMs = 0;
            let moldPauseReasons = {};
            let tasksStats = [];

            if (mold.tasks) {
                mold.tasks.forEach(task => {
                    let taskWorkMs = 0;
                    let taskSetupMs = 0;
                    let taskProdMs = 0;
                    let taskPauseMs = 0;
                    let taskPauseReasons = {};

                    if (task.operations) {
                        task.operations.forEach(op => {
                            if (!op.startDate) return; // Hiç başlamamışsa atla

                            let opPauseMs = 0;
                            let opPauseReasons = {};

                            // 1. Geçmişteki (kapanmış) duraklatmaları hesapla
                            if (op.pauseHistory && Array.isArray(op.pauseHistory)) {
                                op.pauseHistory.forEach(ph => {
                                    if (ph.pausedAt && ph.resumedAt) {
                                        const dur = calcMs(ph.pausedAt, ph.resumedAt);
                                        opPauseMs += dur;
                                        const reason = ph.reason || 'Belirtilmedi';
                                        opPauseReasons[reason] = (opPauseReasons[reason] || 0) + dur;
                                    }
                                });
                            }

                            // 2. Şu an aktif bir duraklatma varsa onu da süreye dahil et
                            if ((op.status === 'PAUSED' || op.status === 'DURAKLATILDI') && op.lastPausedAt) {
                                const dur = calcMs(op.lastPausedAt, null); // null => now
                                opPauseMs += dur;
                                const reason = op.lastPauseReason || 'Belirtilmedi';
                                opPauseReasons[reason] = (opPauseReasons[reason] || 0) + dur;
                            }

                            // 3. Toplam Süreyi Hesapla (Başlangıç ile Bitiş(veya Şu An) arası)
                            let endStr = op.finishDate;
                            if (!endStr && (op.status === 'COMPLETED' || op.status === 'TAMAMLANDI')) {
                                endStr = op.updatedAt || op.startDate; // Hata payını önlemek için
                            }
                            
                            const opTotalMs = calcMs(op.startDate, endStr);
                            
                            // 4. Net Çalışma Süresi = Toplam Geçen Zaman - Duraklatma Süreleri
                            const opWorkMs = Math.max(0, opTotalMs - opPauseMs);

                            // Ayar ve İmalat Sürelerini Ayrıştırma
                            let grossSetup = 0;
                            if (op.setupStartTime) {
                                grossSetup = calcMs(op.setupStartTime, op.productionStartTime || endStr);
                            }

                            let grossProd = 0;
                            if (op.productionStartTime) {
                                grossProd = calcMs(op.productionStartTime, endStr);
                            } else if (!op.setupStartTime) {
                                grossProd = opTotalMs;
                            }

                            let netProd = Math.max(0, grossProd - opPauseMs);
                            let remainingPause = Math.max(0, opPauseMs - grossProd);
                            let netSetup = Math.max(0, grossSetup - remainingPause);

                            if (!op.setupStartTime && !op.productionStartTime) {
                                netProd = opWorkMs;
                                netSetup = 0;
                            }

                            // Görev (Task) havuzuna ekle
                            taskWorkMs += opWorkMs;
                            taskSetupMs += netSetup;
                            taskProdMs += netProd;
                            taskPauseMs += opPauseMs;
                            Object.keys(opPauseReasons).forEach(r => {
                                taskPauseReasons[r] = (taskPauseReasons[r] || 0) + opPauseReasons[r];
                            });
                        });
                    }

                    // Kalıp (Mold) havuzuna ekle
                    moldWorkMs += taskWorkMs;
                moldSetupMs += taskSetupMs;
                moldProdMs += taskProdMs;
                    moldPauseMs += taskPauseMs;
                    Object.keys(taskPauseReasons).forEach(r => {
                        moldPauseReasons[r] = (moldPauseReasons[r] || 0) + taskPauseReasons[r];
                    });

                    // En çok durduran sebebi bul (Task için)
                    const topTaskReason = Object.entries(taskPauseReasons).sort((a, b) => b[1] - a[1])[0];

                    tasksStats.push({
                        ...task,
                        workMs: taskWorkMs,
                    setupMs: taskSetupMs,
                    prodMs: taskProdMs,
                        pauseMs: taskPauseMs,
                        topReason: topTaskReason ? topTaskReason[0] : '-'
                    });
                });
            }

            return {
                ...mold,
                workMs: moldWorkMs,
                setupMs: moldSetupMs,
                prodMs: moldProdMs,
                pauseMs: moldPauseMs,
                pauseReasons: moldPauseReasons,
                tasksStats
            };
        });
    }, [projects]);

    // --- FİLTRELEME VE SEÇİM ---
    const filteredMolds = useMemo(() => {
        let list = moldsWithStats || [];
        if (moldFilter === 'completed') {
            list = list.filter(p => {
                const st = p.status ? String(p.status).toUpperCase().trim() : '';
                return st.includes('ONAY') || 
                       st.includes('TAMAM') || 
                       st.includes('BİTTİ') || 
                       st.includes('BITTI') || 
                       st === 'COMPLETED' || 
                       st === 'DONE';
            });
        }
        const query = (searchTerm || '').toLowerCase().trim();
        if (query) {
            list = list.filter(p => 
                (p.moldName || '').toLowerCase().includes(query) || 
                (p.customer || '').toLowerCase().includes(query)
            );
        }
        return list;
    }, [moldsWithStats, moldFilter, searchTerm]);

    const selectedMold = useMemo(() => {
        return moldsWithStats.find(m => m.id === selectedMoldId) || null;
    }, [moldsWithStats, selectedMoldId]);

    // Duruş Sebeplerini Sırala
    const sortedPauseReasons = useMemo(() => {
        if (!selectedMold || !selectedMold.pauseReasons) return [];
        return Object.entries(selectedMold.pauseReasons).sort((a, b) => b[1] - a[1]);
    }, [selectedMold]);

    return (
        <div className="space-y-4">
            {/* Alt Sekme Seçici */}
            <div className="flex bg-gray-100 dark:bg-gray-800 p-1.5 rounded-xl max-w-md shadow-sm border border-gray-200/50 dark:border-gray-700/50">
                <button
                    onClick={() => setSubTab('mold')}
                    className={`flex-1 py-2 px-4 text-xs font-black rounded-lg transition-all duration-200 flex items-center justify-center gap-2 ${
                        subTab === 'mold'
                            ? 'bg-white dark:bg-gray-700 text-orange-600 dark:text-white shadow-md ring-1 ring-black/5'
                            : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                    }`}
                >
                    <Layers className="w-4 h-4" /> Kalıp Bazlı Loglar
                </button>
                <button
                    onClick={() => setSubTab('personnel')}
                    className={`flex-1 py-2 px-4 text-xs font-black rounded-lg transition-all duration-200 flex items-center justify-center gap-2 ${
                        subTab === 'personnel'
                            ? 'bg-white dark:bg-gray-700 text-orange-600 dark:text-white shadow-md ring-1 ring-black/5'
                            : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                    }`}
                >
                    <Users className="w-4 h-4" /> Personel Bazlı Loglar
                </button>
            </div>

            {subTab === 'personnel' ? (
                <PersonnelProductionLogsView projects={projects} personnel={personnel} />
            ) : (
                <div className="flex h-[calc(100vh-170px)] overflow-hidden bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl">
            
            {/* SOL PANEL: LİSTE */}
            <div className="w-1/4 min-w-[275px] border-r border-gray-200 dark:border-gray-700 flex flex-col bg-white dark:bg-gray-800">
                <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 flex flex-col gap-3">
                    <h2 className="text-lg font-bold text-gray-800 dark:text-white flex items-center">
                        <Layers className="w-5 h-5 mr-2 text-indigo-500" /> Kalıp Logları
                    </h2>
                    
                    {/* Filtre: Tümü / Tamamlananlar */}
                    <div className="flex bg-gray-200 dark:bg-gray-700 p-1 rounded-lg">
                        <button 
                            type="button"
                            onClick={() => setMoldFilter('all')}
                            className={`flex-1 text-center py-1.5 text-xs font-black rounded-md transition ${
                                moldFilter === 'all' 
                                    ? 'bg-white dark:bg-gray-600 text-indigo-600 dark:text-white shadow' 
                                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'
                            }`}
                        >
                            Tüm Kalıplar
                        </button>
                        <button 
                            type="button"
                            onClick={() => setMoldFilter('completed')}
                            className={`flex-1 text-center py-1.5 text-xs font-black rounded-md transition ${
                                moldFilter === 'completed' 
                                    ? 'bg-white dark:bg-gray-600 text-indigo-600 dark:text-white shadow' 
                                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'
                            }`}
                        >
                            Tamamlananlar
                        </button>
                    </div>

                    <div className="relative">
                        <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                        <input 
                            type="text" 
                            placeholder="Kalıp Adı veya Müşteri Ara..." 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-9 p-2 text-xs border rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white border-gray-300 dark:border-gray-600 focus:ring-1 focus:ring-indigo-500 font-bold outline-none"
                        />
                    </div>
                </div>
                
                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                    {filteredMolds.map(mold => (
                        <button
                            key={mold.id}
                            onClick={() => setSelectedMoldId(mold.id)}
                            className={`w-full text-left p-3 rounded-lg border transition-all ${
                                selectedMoldId === mold.id 
                                    ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-500 shadow-sm ring-1 ring-indigo-500' 
                                    : 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 hover:border-indigo-300 dark:hover:border-indigo-500'
                            }`}
                        >
                            <div className="font-bold text-gray-900 dark:text-white">{mold.moldName}</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">{mold.customer}</div>
                            
                            <div className="flex gap-3 text-xs font-semibold">
                                <span className="text-blue-600 dark:text-blue-400 flex items-center" title="Ayar Süresi"><Settings className="w-3 h-3 mr-1"/> {formatDuration(mold.setupMs)}</span>
                                <span className="text-green-600 dark:text-green-400 flex items-center" title="İmalat (Çalışıyor)"><Activity className="w-3 h-3 mr-1"/> {formatDuration(mold.prodMs)}</span>
                                <span className="text-orange-600 dark:text-orange-400 flex items-center" title="Duruş Kaybı"><PauseCircle className="w-3 h-3 mr-1"/> {formatDuration(mold.pauseMs)}</span>
                            </div>
                        </button>
                    ))}
                    {filteredMolds.length === 0 && (
                        <p className="text-gray-400 text-center py-8 text-xs font-bold">Kalıp bulunamadı.</p>
                    )}
                </div>
            </div>

            {/* SAĞ PANEL: DETAY VE ANALİZ */}
            <div className="flex-1 overflow-y-auto p-6 bg-gray-50 dark:bg-gray-900">
                {selectedMold ? (
                    <div className="space-y-6">
                        <div className="flex justify-between items-end border-b border-gray-200 dark:border-gray-700 pb-4">
                            <div>
                                <h1 className="text-2xl font-black text-gray-900 dark:text-white">{selectedMold.moldName}</h1>
                                <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Müşteri: {selectedMold.customer}</p>
                            </div>
                        </div>

                        {/* KPI KARTLARI */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="bg-white dark:bg-gray-800 p-5 rounded-xl shadow-sm border border-blue-200 dark:border-blue-900/50">
                                <div className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase flex items-center"><Settings className="w-4 h-4 mr-1"/> Toplam Ayar Süresi</div>
                                <div className="text-3xl font-black text-gray-900 dark:text-white mt-2">{formatDuration(selectedMold.setupMs)}</div>
                            </div>
                            
                            <div className="bg-white dark:bg-gray-800 p-5 rounded-xl shadow-sm border border-green-200 dark:border-green-900/50">
                                <div className="text-xs font-bold text-green-600 dark:text-green-400 uppercase flex items-center"><Activity className="w-4 h-4 mr-1"/> Toplam İmalat (Çalışıyor)</div>
                                <div className="text-3xl font-black text-gray-900 dark:text-white mt-2">{formatDuration(selectedMold.prodMs)}</div>
                            </div>
                            
                            <div className="bg-white dark:bg-gray-800 p-5 rounded-xl shadow-sm border border-orange-200 dark:border-orange-900/50">
                                <div className="text-xs font-bold text-orange-600 dark:text-orange-400 uppercase flex items-center"><AlertTriangle className="w-4 h-4 mr-1"/> Toplam Duruş Kaybı</div>
                                <div className="text-3xl font-black text-gray-900 dark:text-white mt-2">{formatDuration(selectedMold.pauseMs)}</div>
                            </div>
                        </div>

                        {/* DURUŞ SEBEPLERİ ANALİZİ */}
                        <div className="bg-white dark:bg-gray-800 p-5 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                            <h3 className="font-bold text-gray-800 dark:text-white mb-4 border-b dark:border-gray-700 pb-2">Duruş Sebepleri Dağılımı</h3>
                            {sortedPauseReasons.length > 0 ? (
                                <div className="space-y-4">
                                    {sortedPauseReasons.map(([reason, duration]) => {
                                        const percentage = ((duration / selectedMold.pauseMs) * 100).toFixed(1);
                                        return (
                                            <div key={reason}>
                                                <div className="flex justify-between text-sm font-semibold mb-1">
                                                    <span className="text-gray-700 dark:text-gray-300">{reason}</span>
                                                    <span className="text-orange-600 dark:text-orange-400">{formatDuration(duration)} <span className="text-gray-400 text-xs">(%{percentage})</span></span>
                                                </div>
                                                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                                                    <div className="bg-orange-500 h-2.5 rounded-full" style={{ width: `${percentage}%` }}></div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <p className="text-gray-500 text-sm italic">Bu kalıpta henüz duraklatma kaydı bulunmamaktadır.</p>
                            )}
                        </div>

                        {/* ALT PARÇALAR LİSTESİ */}
                        <div className="bg-white dark:bg-gray-800 p-5 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                            <h3 className="font-bold text-gray-800 dark:text-white mb-4 border-b dark:border-gray-700 pb-2 flex items-center">
                                <Box className="w-5 h-5 mr-2 text-blue-500"/> Alt Parça (Task) Logları
                            </h3>
                            
                            <div className="space-y-3">
                                {selectedMold.tasksStats.map(task => {
                                    const isExpanded = !!expandedTasks[task.id];
                                    const ops = task.operations || [];
                                    
                                    // CAM Operatörü (Hazırlayan)
                                    const camOperatorName = task.camPreparation?.preparedBy || selectedMold.camResponsible || 'Belirtilmedi';

                                    // Tezgah/İşlem Operatörleri
                                    const machineOperators = Array.from(new Set(
                                        ops.map(op => op.machineOperatorName || op.assignedOperator).filter(Boolean)
                                    ));

                                    return (
                                        <div key={task.id} className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden bg-white dark:bg-gray-800 shadow-sm transition-all hover:shadow">
                                            {/* Akordiyon Başlığı */}
                                            <div 
                                                onClick={() => toggleTask(task.id)}
                                                className="p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 cursor-pointer bg-gray-50/50 dark:bg-gray-900/40 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition select-none"
                                            >
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <span className="font-extrabold text-sm text-gray-900 dark:text-white">{task.taskName}</span>
                                                        
                                                        {/* CAM Operatörü */}
                                                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black bg-purple-50 dark:bg-purple-900/40 text-purple-600 dark:text-purple-300 border border-purple-200 dark:border-purple-800" title="CAM Operatörü">
                                                            CAM: {camOperatorName}
                                                        </span>

                                                        {/* Tezgah Operatörleri */}
                                                        {machineOperators.length > 0 && (
                                                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 border border-blue-100 dark:border-blue-800" title="Tezgah Operatörleri">
                                                                Tezgah: {machineOperators.join(', ')}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1 font-mono">ID: {task.id}</p>
                                                </div>
                                                
                                                <div className="flex flex-wrap items-center gap-4 text-xs font-bold">
                                                    <span className="text-blue-600 dark:text-blue-300 flex items-center bg-blue-50 dark:bg-blue-900/40 px-2 py-1 rounded" title="Ayar Süresi">
                                                        <Settings className="w-3.5 h-3.5 mr-1"/> {formatDuration(task.setupMs)}
                                                    </span>
                                                    <span className="text-green-600 dark:text-green-300 flex items-center bg-green-50 dark:bg-green-900/40 px-2 py-1 rounded" title="İmalat Süresi">
                                                        <Activity className="w-3.5 h-3.5 mr-1"/> {formatDuration(task.prodMs)}
                                                    </span>
                                                    <span className="text-orange-600 dark:text-orange-300 flex items-center bg-orange-50 dark:bg-orange-900/40 px-2 py-1 rounded" title="Duruş Süresi">
                                                        <PauseCircle className="w-3.5 h-3.5 mr-1"/> {formatDuration(task.pauseMs)}
                                                    </span>
                                                    {isExpanded ? (
                                                        <ChevronUp className="w-5 h-5 text-gray-400 transition" />
                                                    ) : (
                                                        <ChevronDown className="w-5 h-5 text-gray-400 transition" />
                                                    )}
                                                </div>
                                            </div>

                                            {/* Akordiyon Gövdesi */}
                                            {isExpanded && (
                                                <div className="p-4 border-t border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800/40 space-y-4 animate-fadeIn">
                                                    {ops.length === 0 ? (
                                                        <p className="text-gray-400 text-center py-4 text-xs">Bu parçaya ait operasyon kaydı bulunamadı.</p>
                                                    ) : (
                                                        ops.map((op, idx) => {
                                                            // Duruş geçmişini ve anlık aktif duruşu hesapla
                                                            const pauses = [];
                                                            if (op.pauseHistory && Array.isArray(op.pauseHistory)) {
                                                                op.pauseHistory.forEach(ph => {
                                                                    if (ph.pausedAt && ph.resumedAt) {
                                                                        pauses.push({
                                                                            start: ph.pausedAt,
                                                                            end: ph.resumedAt,
                                                                            dur: calcMs(ph.pausedAt, ph.resumedAt),
                                                                            reason: ph.reason || 'Belirtilmedi',
                                                                            operator: ph.pausedBy || op.machineOperatorName || op.assignedOperator || 'Belirtilmedi'
                                                                        });
                                                                    }
                                                                });
                                                            }
                                                            if ((op.status === 'PAUSED' || op.status === 'DURAKLATILDI') && op.lastPausedAt) {
                                                                pauses.push({
                                                                    start: op.lastPausedAt,
                                                                    end: null, // devam ediyor
                                                                    dur: calcMs(op.lastPausedAt, null),
                                                                    reason: op.lastPauseReason || 'Belirtilmedi',
                                                                    operator: op.machineOperatorName || op.assignedOperator || 'Belirtilmedi'
                                                                });
                                                            }

                                                            return (
                                                                <div key={op.id || idx} className="p-4 bg-gray-50/50 dark:bg-gray-900/20 rounded-lg border border-gray-100 dark:border-gray-700/50">
                                                                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b dark:border-gray-700 pb-2 mb-3">
                                                                        <div>
                                                                            <span className="font-extrabold text-sm text-gray-900 dark:text-white">{op.type}</span>
                                                                            <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">({op.machineName || 'Tezgahsız'})</span>
                                                                        </div>
                                                                        <div className="flex items-center gap-2 mt-2 sm:mt-0">
                                                                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                                                                op.status === 'COMPLETED' || op.status === 'TAMAMLANDI'
                                                                                    ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                                                                                    : op.status === 'IN_PROGRESS' || op.status === 'YÜRÜTÜLÜYOR'
                                                                                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                                                                                    : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
                                                                            }`}>
                                                                                {op.status}
                                                                            </span>
                                                                        </div>
                                                                    </div>

                                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                                                                        <div className="space-y-2">
                                                                            <p className="flex items-center text-gray-600 dark:text-gray-300 font-semibold">
                                                                                <User className="w-3.5 h-3.5 mr-1.5 text-gray-400" /> Operatör: <span className="font-bold text-gray-900 dark:text-white ml-1">{op.machineOperatorName || op.assignedOperator || 'Atanmamış'}</span>
                                                                            </p>
                                                                            <p className="flex items-center text-gray-600 dark:text-gray-300 font-semibold">
                                                                                <Calendar className="w-3.5 h-3.5 mr-1.5 text-gray-400" /> Başlangıç: <span className="text-gray-900 dark:text-white ml-1">{op.startDate ? new Date(op.startDate).toLocaleString('tr-TR') : 'Başlamadı'}</span>
                                                                            </p>
                                                                            <p className="flex items-center text-gray-600 dark:text-gray-300 font-semibold">
                                                                                <Calendar className="w-3.5 h-3.5 mr-1.5 text-gray-400" /> Bitiş: <span className="text-gray-900 dark:text-white ml-1">{op.finishDate ? new Date(op.finishDate).toLocaleString('tr-TR') : 'Tamamlanmadı'}</span>
                                                                            </p>
                                                                        </div>

                                                                        <div>
                                                                            <p className="font-extrabold text-xs text-orange-600 dark:text-orange-400 mb-2 flex items-center">
                                                                                <PauseCircle className="w-4 h-4 mr-1"/> Duruş Detayları ({pauses.length} Kayıt)
                                                                            </p>
                                                                            {pauses.length === 0 ? (
                                                                                <p className="text-[11px] text-gray-400 italic">Bu operasyonda duruş kaybı yaşanmadı.</p>
                                                                            ) : (
                                                                                <div className="space-y-2 max-h-[150px] overflow-y-auto pr-1">
                                                                                    {pauses.map((p, pIdx) => (
                                                                                        <div key={pIdx} className="p-2 bg-white dark:bg-gray-800 rounded border border-gray-100 dark:border-gray-700/50 shadow-sm flex justify-between items-start gap-2">
                                                                                            <div className="min-w-0">
                                                                                                <div className="font-extrabold text-[11px] text-gray-800 dark:text-gray-200">Neden: {p.reason}</div>
                                                                                                <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
                                                                                                    {new Date(p.start).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })} - {p.end ? new Date(p.end).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : 'Devam Ediyor'}
                                                                                                </div>
                                                                                                <div className="text-[10px] text-gray-450 dark:text-gray-400 mt-1 flex items-center gap-1.5 flex-wrap">
                                                                                                    <span className="font-medium text-gray-500 dark:text-gray-400">Duruş Yapan:</span>
                                                                                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-black bg-orange-100 dark:bg-orange-950/20 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-800">
                                                                                                        {p.operator}
                                                                                                    </span>
                                                                                                </div>
                                                                                            </div>
                                                                                            <span className="shrink-0 text-[10px] font-bold text-orange-600 bg-orange-50 dark:bg-orange-950/20 px-1.5 py-0.5 rounded">
                                                                                                {formatDuration(p.dur)}
                                                                                            </span>
                                                                                        </div>
                                                                                    ))}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                    </div>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center text-gray-400 dark:text-gray-500 opacity-60">
                        <BarChart2 className="w-24 h-24 mb-4 text-gray-300 dark:text-gray-600" />
                        <p className="text-xl font-medium">Loglarını görmek istediğiniz kalıbı soldan seçin.</p>
                    </div>
                )}
                </div>
                </div>
            )}
        </div>
    );
};

export default ProductionLogsView;