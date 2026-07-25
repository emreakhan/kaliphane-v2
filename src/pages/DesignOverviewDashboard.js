// src/pages/DesignOverviewDashboard.js

import React, { useState, useMemo } from 'react';
import { 
    Users, Briefcase, Clock, AlertTriangle, CheckCircle2, 
    Layers, PlayCircle, PauseCircle, PieChart, Filter,
    ShieldAlert, Sparkles
} from 'lucide-react';
import { DESIGN_JOB_STATUS, PERSONNEL_ROLES } from '../config/constants';

const DesignOverviewDashboard = ({ designJobs = [], personnel = [], projects = [], taskTypes = [] }) => {
    const [selectedTaskTypeFilter, setSelectedTaskTypeFilter] = useState('ALL');
    const [selectedDesignerFilter, setSelectedDesignerFilter] = useState('ALL');

    // Tasarımcı Personel Listesi
    const designers = useMemo(() => {
        return personnel.filter(p => 
            p.role === PERSONNEL_ROLES.KALIP_TASARIM_SORUMLUSU || 
            p.role === PERSONNEL_ROLES.KALIP_TASARIM_YONETICISI ||
            p.department === 'Tasarım' ||
            p.department === 'Kalıp Tasarım'
        ).sort((a, b) => a.name.localeCompare(b.name, 'tr'));
    }, [personnel]);

    // Filtrelenmiş İş Listesi
    const filteredJobs = useMemo(() => {
        return designJobs.filter(job => {
            if (selectedTaskTypeFilter !== 'ALL' && job.taskType !== selectedTaskTypeFilter) return false;
            if (selectedDesignerFilter !== 'ALL' && job.assignedDesigner !== selectedDesignerFilter) return false;
            return true;
        });
    }, [designJobs, selectedTaskTypeFilter, selectedDesignerFilter]);

    // TEPE ÖZET METRİKLERİ (KPI)
    const kpiData = useMemo(() => {
        const activeJobs = designJobs.filter(j => j.status !== DESIGN_JOB_STATUS.COMPLETED);
        const runningJobs = designJobs.filter(j => j.status === DESIGN_JOB_STATUS.IN_PROGRESS);
        const pausedJobs = designJobs.filter(j => j.status === DESIGN_JOB_STATUS.PAUSED);
        const poolJobs = designJobs.filter(j => (!j.assignedDesigner || j.assignedDesigner === '') && j.status !== DESIGN_JOB_STATUS.COMPLETED);
        const completedJobs = designJobs.filter(j => j.status === DESIGN_JOB_STATUS.COMPLETED);

        // Toplam Bekleyen İş Yükü Saatı
        const totalPendingHours = activeJobs.reduce((sum, j) => sum + (parseFloat(j.estimatedHours) || 0), 0);

        // Termin Yaklaşan veya Süresi Aşılan Riskli İşler
        const now = new Date();
        const riskJobs = activeJobs.filter(j => {
            if (j.deadlineDate) {
                const deadline = new Date(j.deadlineDate + 'T23:59:59');
                const diffDays = (deadline - now) / (1000 * 60 * 60 * 24);
                if (diffDays <= 3) return true; // 3 günden az kalanlar
            }
            return false;
        });

        return {
            totalActive: activeJobs.length,
            runningCount: runningJobs.length,
            pausedCount: pausedJobs.length,
            poolCount: poolJobs.length,
            completedCount: completedJobs.length,
            totalPendingHours: totalPendingHours.toFixed(1),
            riskCount: riskJobs.length
        };
    }, [designJobs]);

    // TASARIMCI BAZLI ANLIK CANLI DURUM & KUYRUK DETAYLARI
    const designerStatuses = useMemo(() => {
        return designers.map(designer => {
            const designerJobs = designJobs.filter(j => j.assignedDesigner === designer.name && j.status !== DESIGN_JOB_STATUS.COMPLETED);
            const runningJob = designerJobs.find(j => j.status === DESIGN_JOB_STATUS.IN_PROGRESS);
            const pausedJob = designerJobs.find(j => j.status === DESIGN_JOB_STATUS.PAUSED);
            const pendingQueue = designerJobs.filter(j => j.status === DESIGN_JOB_STATUS.ASSIGNED || j.status === DESIGN_JOB_STATUS.POOL);
            
            const completedJobs = designJobs.filter(j => j.assignedDesigner === designer.name && j.status === DESIGN_JOB_STATUS.COMPLETED);
            const totalEstimatedHours = designerJobs.reduce((acc, j) => acc + (parseFloat(j.estimatedHours) || 0), 0);

            // Son Duraklatılma Nedeni (Eğer duraklatıldıysa)
            let lastPauseReason = '';
            let lastPauseNote = '';
            if (pausedJob && pausedJob.pauseHistory && pausedJob.pauseHistory.length > 0) {
                const lastP = pausedJob.pauseHistory[pausedJob.pauseHistory.length - 1];
                lastPauseReason = lastP.reason || '';
                lastPauseNote = lastP.note || '';
            }

            return {
                designer,
                designerJobs,
                runningJob,
                pausedJob,
                pendingQueue,
                completedJobsCount: completedJobs.length,
                totalEstimatedHours: totalEstimatedHours.toFixed(1),
                lastPauseReason,
                lastPauseNote
            };
        });
    }, [designers, designJobs]);

    // İŞ TÜRÜ DAĞILIMI
    const taskTypeBreakdown = useMemo(() => {
        const stats = {};
        designJobs.forEach(job => {
            const typeName = job.taskType || 'Belirtilmedi';
            if (!stats[typeName]) {
                stats[typeName] = { count: 0, hours: 0, completedCount: 0 };
            }
            stats[typeName].count++;
            stats[typeName].hours += parseFloat(job.estimatedHours) || 0;
            if (job.status === DESIGN_JOB_STATUS.COMPLETED) {
                stats[typeName].completedCount++;
            }
        });
        return Object.entries(stats).map(([name, data]) => ({
            name,
            ...data,
            hoursFormatted: data.hours.toFixed(1)
        })).sort((a, b) => b.count - a.count);
    }, [designJobs]);

    // KRİTİK / RİSKLİ İŞLER LİSTESİ
    const criticalWatchlist = useMemo(() => {
        const now = new Date();
        return designJobs.filter(j => j.status !== DESIGN_JOB_STATUS.COMPLETED).filter(j => {
            if (j.deadlineDate) {
                const deadline = new Date(j.deadlineDate + 'T23:59:59');
                const diffDays = (deadline - now) / (1000 * 60 * 60 * 24);
                return diffDays <= 4;
            }
            return false;
        }).sort((a, b) => new Date(a.deadlineDate) - new Date(b.deadlineDate));
    }, [designJobs]);

    // SON TAMAMLANAN TASARIM İŞLERİ AKIŞI
    const recentCompletedJobs = useMemo(() => {
        return designJobs
            .filter(j => j.status === DESIGN_JOB_STATUS.COMPLETED)
            .sort((a, b) => new Date(b.completedAt || 0) - new Date(a.completedAt || 0))
            .slice(0, 5);
    }, [designJobs]);

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            
            {/* BAŞLIK & FİLTRELEME BARI */}
            <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <div className="flex items-center gap-2">
                        <h2 className="text-xl font-black text-gray-800 dark:text-white flex items-center">
                            <Sparkles className="w-5 h-5 text-indigo-500 mr-2" /> Tasarım Ofisi Genel Durum & Toplantı Paneli
                        </h2>
                        <span className="bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300 text-xs font-black px-2.5 py-0.5 rounded-full border border-indigo-200 dark:border-indigo-800">
                            CANLI İNCELEME
                        </span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Toplantılarda ekibin anlık durumunu, çalışan işleri, iş yükü dağılımını ve termin risklerini tek ekrandan analiz edin.
                    </p>
                </div>

                {/* HIZLI FİLTRELER */}
                <div className="flex items-center gap-3 w-full md:w-auto">
                    <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-700 p-1.5 rounded-xl border border-gray-200 dark:border-gray-600">
                        <Filter className="w-4 h-4 text-gray-400 ml-2" />
                        <select 
                            value={selectedTaskTypeFilter}
                            onChange={(e) => setSelectedTaskTypeFilter(e.target.value)}
                            className="bg-transparent text-xs font-bold text-gray-700 dark:text-gray-200 outline-none cursor-pointer pr-2"
                        >
                            <option value="ALL">Tüm İş Türleri</option>
                            {taskTypes.map(t => {
                                const val = typeof t === 'string' ? t : t.name;
                                return <option key={t.id || val} value={val}>{val}</option>;
                            })}
                        </select>
                    </div>

                    <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-700 p-1.5 rounded-xl border border-gray-200 dark:border-gray-600">
                        <Users className="w-4 h-4 text-gray-400 ml-2" />
                        <select 
                            value={selectedDesignerFilter}
                            onChange={(e) => setSelectedDesignerFilter(e.target.value)}
                            className="bg-transparent text-xs font-bold text-gray-700 dark:text-gray-200 outline-none cursor-pointer pr-2"
                        >
                            <option value="ALL">Tüm Tasarımcılar</option>
                            {designers.map(d => (
                                <option key={d.id} value={d.name}>{d.name}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            {/* TEPE ÖZET KPI KARTLARI */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                
                <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 flex flex-col justify-between">
                    <div className="flex justify-between items-center text-gray-500 dark:text-gray-400">
                        <span className="text-xs font-bold uppercase tracking-wider">Aktif İşler</span>
                        <Briefcase className="w-4 h-4 text-indigo-500" />
                    </div>
                    <div className="mt-3">
                        <span className="text-3xl font-black text-gray-800 dark:text-white">{kpiData.totalActive}</span>
                        <span className="text-xs text-gray-400 font-medium ml-1">adet</span>
                    </div>
                    <div className="mt-2 text-[10px] font-bold text-indigo-600 dark:text-indigo-400">
                        Havuza veya personele atalı
                    </div>
                </div>

                <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-sm border border-green-200 dark:border-green-800/40 bg-gradient-to-br from-green-50/50 to-transparent dark:from-green-950/20 flex flex-col justify-between">
                    <div className="flex justify-between items-center text-green-700 dark:text-green-400">
                        <span className="text-xs font-black uppercase tracking-wider">Şu An Çalışılıyor</span>
                        <PlayCircle className="w-4 h-4 text-green-600 animate-pulse" />
                    </div>
                    <div className="mt-3">
                        <span className="text-3xl font-black text-green-600 dark:text-green-400">{kpiData.runningCount}</span>
                        <span className="text-xs text-green-600/70 font-medium ml-1">masada</span>
                    </div>
                    <div className="mt-2 text-[10px] font-bold text-green-700 dark:text-green-300">
                        Aktif zaman sayacı çalışan
                    </div>
                </div>

                <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-sm border border-orange-200 dark:border-orange-800/40 bg-gradient-to-br from-orange-50/50 to-transparent dark:from-orange-950/20 flex flex-col justify-between">
                    <div className="flex justify-between items-center text-orange-700 dark:text-orange-400">
                        <span className="text-xs font-black uppercase tracking-wider">Duraklatıldı</span>
                        <PauseCircle className="w-4 h-4 text-orange-500" />
                    </div>
                    <div className="mt-3">
                        <span className="text-3xl font-black text-orange-600 dark:text-orange-400">{kpiData.pausedCount}</span>
                        <span className="text-xs text-orange-600/70 font-medium ml-1">bölündü</span>
                    </div>
                    <div className="mt-2 text-[10px] font-bold text-orange-700 dark:text-orange-300">
                        Araya giren iş / toplantı
                    </div>
                </div>

                <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-sm border border-blue-200 dark:border-blue-800/40 flex flex-col justify-between">
                    <div className="flex justify-between items-center text-blue-700 dark:text-blue-400">
                        <span className="text-xs font-black uppercase tracking-wider">Havuzda Bekleyen</span>
                        <Layers className="w-4 h-4 text-blue-500" />
                    </div>
                    <div className="mt-3">
                        <span className="text-3xl font-black text-blue-600 dark:text-blue-400">{kpiData.poolCount}</span>
                        <span className="text-xs text-blue-600/70 font-medium ml-1">atanacak</span>
                    </div>
                    <div className="mt-2 text-[10px] font-bold text-blue-700 dark:text-blue-300">
                        Atama bekleyen tasarım emri
                    </div>
                </div>

                <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-sm border border-purple-200 dark:border-purple-800/40 flex flex-col justify-between">
                    <div className="flex justify-between items-center text-purple-700 dark:text-purple-400">
                        <span className="text-xs font-black uppercase tracking-wider">Toplam İş Yükü</span>
                        <Clock className="w-4 h-4 text-purple-500" />
                    </div>
                    <div className="mt-3">
                        <span className="text-3xl font-black text-purple-600 dark:text-purple-400">{kpiData.totalPendingHours}</span>
                        <span className="text-xs text-purple-600/70 font-medium ml-1">Saat</span>
                    </div>
                    <div className="mt-2 text-[10px] font-bold text-purple-700 dark:text-purple-300">
                        Hedeflenen tasarım süresi
                    </div>
                </div>

                <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-sm border border-red-200 dark:border-red-800/40 bg-gradient-to-br from-red-50/50 to-transparent dark:from-red-950/20 flex flex-col justify-between">
                    <div className="flex justify-between items-center text-red-700 dark:text-red-400">
                        <span className="text-xs font-black uppercase tracking-wider">Termin Riski</span>
                        <ShieldAlert className="w-4 h-4 text-red-500" />
                    </div>
                    <div className="mt-3">
                        <span className="text-3xl font-black text-red-600 dark:text-red-400">{kpiData.riskCount}</span>
                        <span className="text-xs text-red-600/70 font-medium ml-1">iş</span>
                    </div>
                    <div className="mt-2 text-[10px] font-bold text-red-700 dark:text-red-300">
                        Son 3 gün veya termin aşımı
                    </div>
                </div>

            </div>

            {/* TASARIM EKİBİ ANLIK DURUM VE KUYRUK İNCELEME (MAIN SECTION) */}
            <div className="space-y-4">
                <div className="flex justify-between items-center">
                    <h3 className="text-base font-black text-gray-800 dark:text-white flex items-center">
                        <Users className="w-5 h-5 mr-2 text-indigo-600" /> Tasarım Ekibi Masaları ve Canlı Durumu
                    </h3>
                    <span className="text-xs font-bold text-gray-500 dark:text-gray-400">
                        {designers.length} Tasarımcı Kayıtlı
                    </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                    {designerStatuses.map(({ designer, designerJobs, runningJob, pausedJob, pendingQueue, completedJobsCount, totalEstimatedHours, lastPauseReason, lastPauseNote }) => {
                        
                        const isWorking = !!runningJob;
                        const isPaused = !isWorking && !!pausedJob;
                        const isIdle = !isWorking && !isPaused;

                        return (
                            <div 
                                key={designer.id || designer.name}
                                className={`rounded-2xl border transition shadow-sm hover:shadow-md flex flex-col justify-between overflow-hidden bg-white dark:bg-gray-800 ${
                                    isWorking 
                                    ? 'border-green-500 dark:border-green-600 ring-2 ring-green-500/20' 
                                    : isPaused 
                                    ? 'border-orange-400 dark:border-orange-500' 
                                    : 'border-gray-200 dark:border-gray-700'
                                }`}
                            >
                                {/* KART TEPE HEADER */}
                                <div className="p-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50/70 dark:bg-gray-900/50 flex justify-between items-center">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-300 flex items-center justify-center font-black text-sm border border-indigo-200 dark:border-indigo-700 shadow-inner">
                                            {designer.name ? designer.name.substring(0, 2).toUpperCase() : 'TA'}
                                        </div>
                                        <div>
                                            <h4 className="font-bold text-gray-900 dark:text-white text-sm leading-tight">{designer.name}</h4>
                                            <span className="text-[10px] font-semibold text-gray-500 dark:text-gray-400">{designer.role || 'Tasarım Sorumlusu'}</span>
                                        </div>
                                    </div>

                                    {/* DURUM ROZETİ */}
                                    {isWorking && (
                                        <span className="inline-flex items-center text-[10px] font-extrabold px-2.5 py-1 rounded-full bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300 border border-green-300 dark:border-green-700 animate-pulse">
                                            <span className="w-2 h-2 rounded-full bg-green-500 mr-1.5"></span> ÇALIŞIYOR
                                        </span>
                                    )}
                                    {isPaused && (
                                        <span className="inline-flex items-center text-[10px] font-extrabold px-2.5 py-1 rounded-full bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300 border border-orange-300 dark:border-orange-700">
                                            <span className="w-2 h-2 rounded-full bg-orange-500 mr-1.5"></span> DURAKLATILDI
                                        </span>
                                    )}
                                    {isIdle && (
                                        <span className="inline-flex items-center text-[10px] font-extrabold px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600">
                                            <span className="w-2 h-2 rounded-full bg-gray-400 mr-1.5"></span> BOŞTA
                                        </span>
                                    )}
                                </div>

                                {/* KART GÖVDESİ - ANLIK ÇALIŞILAN VEYA DURAKLATILAN İŞ DOKÜMÜ */}
                                <div className="p-4 flex-1 space-y-3">
                                    
                                    {/* AKTİF ÇALIŞILAN İŞ */}
                                    {isWorking && runningJob && (
                                        <div className="bg-green-50/80 dark:bg-green-900/20 p-3 rounded-xl border border-green-200 dark:border-green-800/60 space-y-2">
                                            <div className="flex justify-between items-start">
                                                <span className="text-[10px] font-black text-green-700 dark:text-green-400 uppercase tracking-wide flex items-center">
                                                    <PlayCircle className="w-3 h-3 mr-1" /> Masadaki Aktif İş
                                                </span>
                                                <span className="text-[10px] font-bold bg-white dark:bg-gray-800 px-1.5 py-0.5 rounded text-green-800 dark:text-green-300 border border-green-200">
                                                    {runningJob.taskType}
                                                </span>
                                            </div>
                                            <h5 className="font-bold text-gray-900 dark:text-white text-sm leading-snug">{runningJob.projectName}</h5>
                                            <div className="flex justify-between items-center text-xs font-bold pt-1 border-t border-green-200 dark:border-green-800/50">
                                                <span className="text-gray-600 dark:text-gray-300">Hedef Süre:</span>
                                                <span className="text-green-700 dark:text-green-300">{runningJob.estimatedHours} Saat</span>
                                            </div>
                                        </div>
                                    )}

                                    {/* DURAKLATILAN İŞ DETAYI */}
                                    {isPaused && pausedJob && (
                                        <div className="bg-orange-50/80 dark:bg-orange-900/20 p-3 rounded-xl border border-orange-200 dark:border-orange-800/60 space-y-2">
                                            <div className="flex justify-between items-start">
                                                <span className="text-[10px] font-black text-orange-700 dark:text-orange-400 uppercase tracking-wide flex items-center">
                                                    <PauseCircle className="w-3 h-3 mr-1" /> Bölünen / Bekletilen İş
                                                </span>
                                                <span className="text-[10px] font-bold bg-white dark:bg-gray-800 px-1.5 py-0.5 rounded text-orange-800 dark:text-orange-300 border border-orange-200">
                                                    {pausedJob.taskType}
                                                </span>
                                            </div>
                                            <h5 className="font-bold text-gray-900 dark:text-white text-sm leading-snug">{pausedJob.projectName}</h5>
                                            
                                            {lastPauseReason && (
                                                <div className="text-xs bg-white dark:bg-gray-800 p-2 rounded-lg border border-orange-200 dark:border-orange-800 text-orange-800 dark:text-orange-300 font-medium">
                                                    <strong>Neden:</strong> {lastPauseReason}
                                                    {lastPauseNote && <p className="text-[11px] text-gray-600 dark:text-gray-400 italic mt-0.5">"{lastPauseNote}"</p>}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* EĞER BOŞTAYSA VEYA SIRADA BEKLEYEN İŞLER VARSA */}
                                    {isIdle && (
                                        <div className="bg-gray-50 dark:bg-gray-900/40 p-3 rounded-xl border border-dashed border-gray-300 dark:border-gray-700 text-center py-5">
                                            <p className="text-xs font-bold text-gray-500 dark:text-gray-400">Şu an aktif çalışma başlatılmamış.</p>
                                            {pendingQueue.length > 0 && (
                                                <p className="text-[11px] text-indigo-600 dark:text-indigo-400 font-semibold mt-1">Sırada {pendingQueue.length} adet atanmış iş var.</p>
                                            )}
                                        </div>
                                    )}

                                    {/* ATANMIŞ BEKLEYEN KUYRUK ÖZETİ */}
                                    {pendingQueue.length > 0 && (
                                        <div className="pt-2 border-t border-gray-100 dark:border-gray-700">
                                            <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400 mb-1.5 block">
                                                Sıradaki Bekleyen Görevler ({pendingQueue.length})
                                            </span>
                                            <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
                                                {pendingQueue.map((qJob, idx) => (
                                                    <div key={qJob.id} className="p-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg text-xs flex justify-between items-center border border-gray-100 dark:border-gray-700">
                                                        <span className="font-bold text-gray-800 dark:text-gray-200 truncate flex-1 mr-2">
                                                            {idx + 1}. {qJob.projectName}
                                                        </span>
                                                        <span className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 shrink-0">
                                                            {qJob.estimatedHours}s
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                </div>

                                {/* KART TABANI - İŞ YÜKÜ METRİKLERİ */}
                                <div className="p-3 bg-gray-50/90 dark:bg-gray-900/80 border-t border-gray-100 dark:border-gray-700 flex justify-between items-center text-xs font-bold">
                                    <div className="flex items-center text-purple-600 dark:text-purple-400">
                                        <Clock className="w-3.5 h-3.5 mr-1" /> Yük: {totalEstimatedHours} Saat
                                    </div>
                                    <div className="text-gray-500 dark:text-gray-400">
                                        Tamamlanan: <span className="text-green-600 dark:text-green-400 font-extrabold">{completedJobsCount}</span>
                                    </div>
                                </div>

                            </div>
                        );
                    })}
                </div>
            </div>

            {/* TOPLANTI ANALİZ & İŞ DAĞILIMI GRID */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* 1. İŞ TÜRÜNE GÖRE DAĞILIM */}
                <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 space-y-4">
                    <div className="flex justify-between items-center border-b border-gray-100 dark:border-gray-700 pb-3">
                        <h3 className="font-bold text-gray-800 dark:text-white text-sm flex items-center">
                            <PieChart className="w-4 h-4 text-indigo-500 mr-2" /> İş Türü Dağılımı & Analizi
                        </h3>
                    </div>
                    <div className="space-y-3">
                        {taskTypeBreakdown.map((item) => {
                            const totalJobsCount = designJobs.length || 1;
                            const percentage = Math.round((item.count / totalJobsCount) * 100);

                            return (
                                <div key={item.name} className="space-y-1">
                                    <div className="flex justify-between text-xs font-bold">
                                        <span className="text-gray-800 dark:text-gray-200">{item.name}</span>
                                        <span className="text-gray-500 dark:text-gray-400">{item.count} İş ({item.hoursFormatted} Sa)</span>
                                    </div>
                                    <div className="w-full bg-gray-100 dark:bg-gray-700 h-2 rounded-full overflow-hidden">
                                        <div 
                                            className="bg-indigo-600 dark:bg-indigo-500 h-full rounded-full transition-all duration-500" 
                                            style={{ width: `${percentage}%` }}
                                        ></div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* 2. KRİTİK TERMIN VE RİSK TAKİP LİSTESİ */}
                <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 space-y-4">
                    <div className="flex justify-between items-center border-b border-gray-100 dark:border-gray-700 pb-3">
                        <h3 className="font-bold text-gray-800 dark:text-white text-sm flex items-center">
                            <AlertTriangle className="w-4 h-4 text-red-500 mr-2" /> Termin Riski Taşıyan İşler
                        </h3>
                        <span className="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 text-xs font-bold px-2 py-0.5 rounded-full">
                            {criticalWatchlist.length} Acil
                        </span>
                    </div>

                    <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                        {criticalWatchlist.length === 0 ? (
                            <div className="text-center py-8 text-xs font-bold text-gray-400">
                                Yaklaşan termin riski bulunan iş bulunmuyor.
                            </div>
                        ) : (
                            criticalWatchlist.map(job => (
                                <div key={job.id} className="p-3 bg-red-50/60 dark:bg-red-950/20 rounded-xl border border-red-200 dark:border-red-800/50 flex justify-between items-center">
                                    <div>
                                        <h5 className="font-bold text-gray-900 dark:text-white text-xs">{job.projectName}</h5>
                                        <span className="text-[10px] text-gray-500 dark:text-gray-400 font-semibold">
                                            {job.assignedDesigner ? `Tasarımcı: ${job.assignedDesigner}` : 'Atanmamış (Havuz)'}
                                        </span>
                                    </div>
                                    <div className="text-right">
                                        <span className="text-xs font-black text-red-600 dark:text-red-400 block">
                                            {job.deadlineDate ? new Date(job.deadlineDate).toLocaleDateString('tr-TR') : 'Termin Yok'}
                                        </span>
                                        <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400">
                                            {job.estimatedHours} Saat Hedef
                                        </span>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* 3. SON TAMAMLANAN TASARIM İŞLERİ (RECENT WINS) */}
                <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 space-y-4">
                    <div className="flex justify-between items-center border-b border-gray-100 dark:border-gray-700 pb-3">
                        <h3 className="font-bold text-gray-800 dark:text-white text-sm flex items-center">
                            <CheckCircle2 className="w-4 h-4 text-green-500 mr-2" /> Son Tamamlanan Tasarımlar
                        </h3>
                    </div>

                    <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                        {recentCompletedJobs.length === 0 ? (
                            <div className="text-center py-8 text-xs font-bold text-gray-400">
                                Henüz tamamlanmış kayıt bulunmuyor.
                            </div>
                        ) : (
                            recentCompletedJobs.map(job => (
                                <div key={job.id} className="p-3 bg-green-50/40 dark:bg-green-950/20 rounded-xl border border-green-100 dark:border-green-900/30 space-y-1">
                                    <div className="flex justify-between items-center">
                                        <h5 className="font-bold text-gray-900 dark:text-white text-xs">{job.projectName}</h5>
                                        <span className="text-[10px] font-bold text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-900/50 px-2 py-0.5 rounded">
                                            {job.assignedDesigner}
                                        </span>
                                    </div>
                                    {job.completionNote && (
                                        <p className="text-[11px] text-gray-600 dark:text-gray-300 italic">
                                            "{job.completionNote}"
                                        </p>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </div>

            </div>

        </div>
    );
};

export default DesignOverviewDashboard;
