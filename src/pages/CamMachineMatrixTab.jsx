// src/pages/CamMachineMatrixTab.jsx

import React, { useState, useMemo } from 'react';
import { 
    Monitor, Clock, Layers, User, Search, Filter, CheckCircle2, 
    AlertCircle, Sparkles, Activity, ArrowUpDown, ChevronRight, HardHat
} from 'lucide-react';
import { OPERATION_STATUS } from '../config/constants.js';

const cleanStr = (str) => String(str || '').replace(/[^a-zA-Z0-9çğıöşüÇĞİÖŞÜ]/g, '').toLowerCase();

const CamMachineMatrixTab = ({ projects = [], machines = [] }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('ALL'); // 'ALL' | 'ACTIVE' | 'QUEUED' | 'IDLE'
    const [sortBy, setSortBy] = useState('LOAD_DESC'); // 'LOAD_DESC' | 'NAME_ASC'

    // Tezgahların Telemetri ve Planlama Verilerini Hesapla
    const machineMatrix = useMemo(() => {
        const matrix = (machines || []).map(m => ({
            ...m,
            totalHours: 0,
            activeJob: null,
            queuedJobs: []
        }));

        (projects || []).forEach(project => {
            if (project.status === 'TAMAMLANDI') return;

            (project.tasks || []).forEach(task => {
                let taskActiveMachineId = null;
                const estTime = parseFloat(task.estimatedCamTime) || 0;
                const camOpName = task.assignedOperator || task.camOperator || task.camPreparation?.operator || 'Belirtilmedi';

                // 1. Aktif Çalışan Operasyon
                if (task.operations && Array.isArray(task.operations)) {
                    task.operations.forEach(op => {
                        const isWorking = op.status === OPERATION_STATUS.IN_PROGRESS || op.status === 'ÇALIŞIYOR';
                        if (isWorking) {
                            const opM1 = cleanStr(op.machineName);
                            const opM2 = cleanStr(op.machine);
                            const opM3 = cleanStr(op.assignedMachine);
                            const opM4 = cleanStr(op.machineId);

                            matrix.forEach(m => {
                                const mNameClean = cleanStr(m.name);
                                const mIdClean = cleanStr(m.id);
                                if (op.machineName === m.name || opM1 === mNameClean || opM1 === mIdClean || opM2 === mNameClean || opM2 === mIdClean || opM3 === mNameClean || opM3 === mIdClean || opM4 === mNameClean || opM4 === mIdClean) {
                                    taskActiveMachineId = m.id;
                                    m.activeJob = {
                                        moldId: project.id,
                                        moldName: project.moldName,
                                        projectCode: project.projectCode,
                                        taskId: task.id,
                                        taskName: task.taskName,
                                        opName: op.name || op.type || 'Operasyon',
                                        subOperations: op.subOperations || [],
                                        camOperator: op.assignedOperator || camOpName,
                                        machineOperator: op.machineOperatorName || '',
                                        estTime: estTime,
                                        progressPercentage: parseFloat(op.progressPercentage) || 0,
                                        startDate: op.startDate
                                    };
                                    m.totalHours += estTime;
                                }
                            });
                        }
                    });
                }

                // 2. Sırada Bekleyen Gelecek İşler (Kuyruk)
                const isTaskCompleted = task.operations?.every(op => op.status === 'COMPLETED') || false;
                if (task.plannedMachine && !isTaskCompleted) {
                    const targetMachine = matrix.find(m => m.name === task.plannedMachine);
                    if (targetMachine && targetMachine.id !== taskActiveMachineId) {
                        const pendingOp = task.operations?.find(op => op.status !== 'COMPLETED');
                        targetMachine.totalHours += estTime;
                        targetMachine.queuedJobs.push({
                            moldId: project.id,
                            moldName: project.moldName,
                            projectCode: project.projectCode,
                            taskId: task.id,
                            taskName: task.taskName,
                            opName: pendingOp?.type || pendingOp?.name,
                            subOperations: pendingOp?.subOperations || (task.operations || []).flatMap(o => o.subOperations || []),
                            camOperator: camOpName,
                            time: estTime,
                            priority: project.priority || 999
                        });
                    }
                }
            });
        });

        // Kuyruktaki işleri aciliyete göre sırala
        matrix.forEach(m => {
            m.queuedJobs.sort((a, b) => a.priority - b.priority);
        });

        return matrix;
    }, [projects, machines]);

    // Filtreleme ve Sıralama
    const filteredMatrix = useMemo(() => {
        let list = machineMatrix.filter(m => {
            // Durum Filtresi
            if (statusFilter === 'ACTIVE' && !m.activeJob) return false;
            if (statusFilter === 'QUEUED' && m.queuedJobs.length === 0) return false;
            if (statusFilter === 'IDLE' && (m.activeJob || m.queuedJobs.length > 0)) return false;

            // Metin Arama Filtresi (Tezgah adı, Kalıp adı, Parça adı, CAM Operatörü)
            if (searchTerm.trim()) {
                const q = searchTerm.toLowerCase();
                const mNameMatch = (m.name || '').toLowerCase().includes(q);
                const activeMoldMatch = (m.activeJob?.moldName || '').toLowerCase().includes(q);
                const activePartMatch = (m.activeJob?.taskName || '').toLowerCase().includes(q);
                const activeCamMatch = (m.activeJob?.camOperator || '').toLowerCase().includes(q);
                const queueMatch = m.queuedJobs.some(qj => 
                    (qj.moldName || '').toLowerCase().includes(q) ||
                    (qj.taskName || '').toLowerCase().includes(q) ||
                    (qj.camOperator || '').toLowerCase().includes(q)
                );
                return mNameMatch || activeMoldMatch || activePartMatch || activeCamMatch || queueMatch;
            }
            return true;
        });

        // Sıralama
        if (sortBy === 'LOAD_DESC') {
            list.sort((a, b) => b.totalHours - a.totalHours);
        } else if (sortBy === 'NAME_ASC') {
            list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        }

        return list;
    }, [machineMatrix, statusFilter, searchTerm, sortBy]);

    // Üst Özet İstatistikler
    const stats = useMemo(() => {
        const total = machineMatrix.length;
        const active = machineMatrix.filter(m => !!m.activeJob).length;
        const withQueue = machineMatrix.filter(m => m.queuedJobs.length > 0).length;
        const idle = machineMatrix.filter(m => !m.activeJob && m.queuedJobs.length === 0).length;
        const totalHours = machineMatrix.reduce((sum, m) => sum + m.totalHours, 0);
        const totalQueuedParts = machineMatrix.reduce((sum, m) => sum + m.queuedJobs.length, 0);

        return { total, active, withQueue, idle, totalHours, totalQueuedParts };
    }, [machineMatrix]);

    return (
        <div className="space-y-4 animate-in fade-in">
            
            {/* 1. ÜST İSTATİSTİK VE FİLTRELEME BARI */}
            <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-xs border border-gray-200 dark:border-gray-700 space-y-3">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                    <div>
                        <h2 className="text-sm font-black text-gray-900 dark:text-white flex items-center gap-2 uppercase tracking-wide">
                            <Monitor className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                            Tüm Tezgahlar Planlama ve Atama Matrisi ({stats.total} Tezgah)
                        </h2>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                            Hangi tezgahta hangi parça işleniyor, hangi CAM operatörüne atanmış ve sırada hangi parçalar var anlık canlı görünüm.
                        </p>
                    </div>

                    {/* Hızlı Özet Rozetleri */}
                    <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
                        <span className="px-2.5 py-1 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                            🟢 {stats.active} Aktif Çalışan
                        </span>
                        <span className="px-2.5 py-1 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                            🟡 {stats.totalQueuedParts} Kuyrukta Parça
                        </span>
                        <span className="px-2.5 py-1 rounded-xl bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                            ⏱️ {stats.totalHours.toFixed(1)}s Toplam Yük
                        </span>
                    </div>
                </div>

                {/* ARAMA VE DURUM BUTONLARI */}
                <div className="flex flex-col md:flex-row gap-2 pt-2 border-t dark:border-gray-700">
                    <div className="relative flex-1">
                        <Search className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
                        <input 
                            type="text"
                            placeholder="Tezgah adı, Kalıp adı, Parça veya CAM Operatörü ara..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="w-full pl-9 pr-3 py-2 text-xs font-bold border rounded-xl bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>

                    {/* Durum Filtresi */}
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => setStatusFilter('ALL')}
                            className={`px-3 py-2 text-xs font-black rounded-xl transition ${
                                statusFilter === 'ALL' 
                                    ? 'bg-blue-600 text-white shadow-xs' 
                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200'
                            }`}
                        >
                            Tümü ({stats.total})
                        </button>
                        <button
                            onClick={() => setStatusFilter('ACTIVE')}
                            className={`px-3 py-2 text-xs font-black rounded-xl transition ${
                                statusFilter === 'ACTIVE' 
                                    ? 'bg-emerald-600 text-white shadow-xs' 
                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200'
                            }`}
                        >
                            🟢 Aktif İş ({stats.active})
                        </button>
                        <button
                            onClick={() => setStatusFilter('QUEUED')}
                            className={`px-3 py-2 text-xs font-black rounded-xl transition ${
                                statusFilter === 'QUEUED' 
                                    ? 'bg-blue-600 text-white shadow-xs' 
                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200'
                            }`}
                        >
                            🟡 Kuyruğu Olan ({stats.withQueue})
                        </button>
                        <button
                            onClick={() => setStatusFilter('IDLE')}
                            className={`px-3 py-2 text-xs font-black rounded-xl transition ${
                                statusFilter === 'IDLE' 
                                    ? 'bg-gray-600 text-white shadow-xs' 
                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200'
                            }`}
                        >
                            ⚪ Boşta ({stats.idle})
                        </button>
                    </div>

                    {/* Sıralama */}
                    <select
                        value={sortBy}
                        onChange={e => setSortBy(e.target.value)}
                        className="p-2 text-xs font-bold border rounded-xl bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                    >
                        <option value="LOAD_DESC">İş Yüküne Göre (Çoktan Aza)</option>
                        <option value="NAME_ASC">Tezgah Adına Göre (A-Z)</option>
                    </select>
                </div>
            </div>

            {/* 2. TEZGAH KARTLARI MATRİSİ (GRID) */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
                {filteredMatrix.map(machine => {
                    const daysLoaded = (machine.totalHours / 24).toFixed(1);
                    const hasActive = !!machine.activeJob;
                    const hasQueue = machine.queuedJobs.length > 0;

                    return (
                        <div 
                            key={machine.id}
                            className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xs hover:shadow-md hover:border-indigo-300 dark:hover:border-indigo-600 transition-all flex flex-col overflow-hidden"
                        >
                            {/* Kart Başlığı: Tezgah Adı & Doluluk */}
                            <div className="p-3 bg-slate-50 dark:bg-slate-900/80 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
                                <div className="flex items-center gap-2">
                                    <div className={`w-2.5 h-2.5 rounded-full ${hasActive ? 'bg-emerald-500 animate-pulse' : hasQueue ? 'bg-amber-400' : 'bg-slate-300'}`}></div>
                                    <span className="font-black text-sm text-gray-900 dark:text-white tracking-tight uppercase">
                                        {machine.name}
                                    </span>
                                </div>

                                <div className="flex items-center gap-1 text-[10px] font-black">
                                    <span className="px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                                        ⏱️ {machine.totalHours.toFixed(1)}s
                                    </span>
                                    <span className="px-2 py-0.5 rounded-md bg-orange-50 dark:bg-orange-950/60 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-800">
                                        {daysLoaded} gün
                                    </span>
                                </div>
                            </div>

                            {/* Kart Gövdesi: Aktif İş ve Kuyruk */}
                            <div className="p-3 flex-1 flex flex-col gap-2.5">
                                
                                {/* 1. AKTİF İŞ (ÇALIŞAN) */}
                                {machine.activeJob ? (
                                    <div className="p-2.5 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-300 dark:border-emerald-800 flex flex-col gap-1.5">
                                        <div className="flex justify-between items-center">
                                            <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-emerald-600 text-white flex items-center gap-1 shadow-2xs">
                                                <span className="w-1.5 h-1.5 bg-white rounded-full animate-ping"></span>
                                                AKTİF İŞLENİYOR
                                            </span>
                                            <span className="text-[10px] font-black text-emerald-800 dark:text-emerald-300">
                                                %{machine.activeJob.progressPercentage}
                                            </span>
                                        </div>

                                        <div>
                                            <div className="text-[10px] font-bold text-emerald-800 dark:text-emerald-400 uppercase truncate" title={machine.activeJob.moldName}>
                                                {machine.activeJob.moldName}
                                            </div>
                                            <div className="text-xs font-black text-emerald-950 dark:text-emerald-100 line-clamp-1" title={machine.activeJob.taskName}>
                                                {machine.activeJob.taskName}
                                            </div>
                                            {/* Alt Operasyon / İşlem Etiketleri */}
                                            {machine.activeJob.subOperations && machine.activeJob.subOperations.length > 0 && (
                                                <div className="flex flex-wrap gap-0.5 mt-1">
                                                    {machine.activeJob.subOperations.map((subOp, sIdx) => (
                                                        <span key={sIdx} className="text-[7.5px] font-black px-1 py-0.2 rounded bg-emerald-200/70 text-emerald-900 dark:bg-emerald-900/60 dark:text-emerald-200">
                                                            {subOp}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                        </div>

                                        {/* İlerleme Çubuğu */}
                                        <div className="w-full bg-emerald-200 dark:bg-emerald-900 rounded-full h-1.5 overflow-hidden">
                                            <div 
                                                className="bg-emerald-600 h-1.5 rounded-full transition-all" 
                                                style={{ width: `${Math.min(100, Math.max(5, machine.activeJob.progressPercentage))}%` }}
                                            ></div>
                                        </div>

                                        <div className="pt-1 border-t border-emerald-200 dark:border-emerald-800/60 flex justify-between items-center text-[10px]">
                                            <span className="font-bold text-purple-700 dark:text-purple-300 flex items-center gap-1 truncate max-w-[140px]">
                                                <User size={11} className="shrink-0" /> CAM: {machine.activeJob.camOperator || 'Bilinmiyor'}
                                            </span>
                                            <span className="font-mono font-bold text-emerald-700 dark:text-emerald-300">
                                                {machine.activeJob.estTime}s
                                            </span>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-dashed border-slate-300 dark:border-slate-700 flex items-center justify-center text-slate-400 text-xs font-bold">
                                        <CheckCircle2 size={14} className="mr-1.5 text-slate-400" /> Şuan Aktif İş Yok
                                    </div>
                                )}

                                {/* 2. SIRADAKİ KUYRUK LİSTESİ */}
                                <div className="flex-1 flex flex-col">
                                    <div className="flex justify-between items-center mb-1.5">
                                        <span className="text-[10px] font-black text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                                            📋 Sıradaki Kuyruk ({machine.queuedJobs.length})
                                        </span>
                                    </div>

                                    {machine.queuedJobs.length > 0 ? (
                                        <div className="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar pr-0.5">
                                            {machine.queuedJobs.map((qJob, qIdx) => (
                                                <div 
                                                    key={`${qJob.moldId}-${qJob.taskId}-${qIdx}`}
                                                    className="p-2 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 flex flex-col gap-1 hover:border-blue-300 transition"
                                                >
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-[8px] font-black px-1.5 py-0.2 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
                                                            #{qIdx + 1}. SIRA
                                                        </span>
                                                        <span className="text-[9px] font-black text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 px-1.5 py-0.2 rounded">
                                                            ⏱️ {qJob.time}s
                                                        </span>
                                                    </div>

                                                    <div>
                                                        <div className="text-[9px] font-bold text-blue-600 dark:text-blue-400 uppercase truncate" title={qJob.moldName}>
                                                            {qJob.moldName}
                                                        </div>
                                                        <div className="text-xs font-black text-slate-900 dark:text-slate-100 line-clamp-1" title={qJob.taskName}>
                                                            {qJob.taskName}
                                                        </div>
                                                        {/* Alt Operasyon / İşlem Etiketleri */}
                                                        {qJob.subOperations && qJob.subOperations.length > 0 && (
                                                            <div className="flex flex-wrap gap-0.5 mt-1">
                                                                {qJob.subOperations.map((subOp, sIdx) => (
                                                                    <span key={sIdx} className="text-[7.5px] font-black px-1 py-0.2 rounded bg-indigo-50 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/50">
                                                                        {subOp}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>

                                                    {qJob.camOperator && (
                                                        <div className="text-[9px] font-bold text-purple-600 dark:text-purple-300 flex items-center gap-1 pt-0.5">
                                                            <User size={10} /> CAM: {qJob.camOperator}
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="text-[11px] text-slate-400 italic text-center py-2">
                                            Kuyrukta bekleyen parça yok
                                        </div>
                                    )}
                                </div>

                            </div>
                        </div>
                    );
                })}
            </div>

            {filteredMatrix.length === 0 && (
                <div className="bg-white dark:bg-gray-800 p-12 rounded-2xl border text-center text-slate-400">
                    <Filter className="w-10 h-10 mx-auto mb-2 opacity-40" />
                    <div className="font-bold text-sm">Aramanıza veya filtrenize uygun tezgah bulunamadı.</div>
                </div>
            )}

        </div>
    );
};

export default CamMachineMatrixTab;
