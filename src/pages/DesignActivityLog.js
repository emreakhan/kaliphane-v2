// src/pages/DesignActivityLog.js

import React, { useState, useMemo } from 'react';
import { UserCircle, Calendar as CalendarIcon, Clock, PenTool, PauseCircle, Activity, Search, Briefcase } from 'lucide-react';
import { ROLES, PERSONNEL_ROLES } from '../config/constants.js';

const formatDuration = (hours) => {
    if (!hours || isNaN(hours) || hours <= 0) return "0 Dk";
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    if (h > 0 && m > 0) return `${h} Saat ${m} Dk`;
    if (h > 0) return `${h} Saat`;
    return `${m} Dk`;
};

const formatTime = (dateObj) => {
    return dateObj.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
};

const DesignActivityLog = ({ loggedInUser, personnel, designJobs = [] }) => {
    const isAdmin = loggedInUser?.role === ROLES.ADMIN || loggedInUser?.role === ROLES.PROJE_SORUMLUSU;
    
    const designers = useMemo(() => {
        return personnel
            .filter(p => p.role === PERSONNEL_ROLES.KALIP_TASARIM_SORUMLUSU || p.role === PERSONNEL_ROLES.KALIP_TASARIM_YONETICISI)
            .map(p => p.name)
            .sort((a, b) => a.localeCompare(b, 'tr'));
    }, [personnel]);

    // Tarih seçici için string formatı (YYYY-MM-DD)
    const todayStr = new Date().toISOString().split('T')[0];
    const [selectedDateStr, setSelectedDateStr] = useState(todayStr);
    
    const [selectedDesigner, setSelectedDesigner] = useState(isAdmin ? (designers[0] || '') : loggedInUser.name);

    // --- LOGLARI ÇIKARMA ALGORİTMASI ---
    const logs = useMemo(() => {
        if (!designJobs || designJobs.length === 0 || !selectedDesigner || !selectedDateStr) return [];

        const targetDate = new Date(selectedDateStr);
        const startOfDay = new Date(targetDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(targetDate);
        endOfDay.setHours(23, 59, 59, 999);
        const now = new Date();

        let rawLogs = [];

        designJobs.forEach(job => {
            if (job.assignedDesigner !== selectedDesigner) return;

            // 1. ÇALIŞMA (TASARIM) SEANSLARI
            (job.workSessions || []).forEach(ws => {
                if (ws.startTime) {
                    const sTime = new Date(ws.startTime);
                    const eTime = ws.endTime ? new Date(ws.endTime) : now; 
                    
                    if (sTime <= endOfDay && eTime >= startOfDay) {
                        const clampedStart = sTime < startOfDay ? startOfDay : sTime;
                        const clampedEnd = eTime > endOfDay ? endOfDay : eTime;
                        const durationHours = (clampedEnd - clampedStart) / (1000 * 60 * 60);

                        rawLogs.push({
                            id: `ws-${job.id}-${ws.startTime}`,
                            type: 'WORK',
                            start: clampedStart,
                            end: clampedEnd,
                            isOngoing: !ws.endTime && clampedEnd.toDateString() === now.toDateString(), 
                            projectName: job.projectName,
                            taskType: job.taskType,
                            duration: durationHours,
                            note: 'Aktif Tasarım / Modelleme'
                        });
                    }
                }
            });

            // 2. DURAKLATMA (BÖLÜNME) SEANSLARI
            (job.pauseHistory || []).forEach(ph => {
                if (ph.pausedAt) {
                    const sTime = new Date(ph.pausedAt);
                    const eTime = ph.resumedAt ? new Date(ph.resumedAt) : now;

                    if (sTime <= endOfDay && eTime >= startOfDay) {
                        const clampedStart = sTime < startOfDay ? startOfDay : sTime;
                        const clampedEnd = eTime > endOfDay ? endOfDay : eTime;
                        const durationHours = (clampedEnd - clampedStart) / (1000 * 60 * 60);

                        rawLogs.push({
                            id: `ph-${job.id}-${ph.pausedAt}`,
                            type: 'PAUSE',
                            start: clampedStart,
                            end: clampedEnd,
                            isOngoing: !ph.resumedAt && clampedEnd.toDateString() === now.toDateString(),
                            projectName: job.projectName,
                            taskType: ph.reason || 'Bilinmeyen Neden',
                            pauseProject: ph.projectName || '',
                            duration: durationHours,
                            note: ph.note || ''
                        });
                    }
                }
            });
        });

        return rawLogs.sort((a, b) => a.start - b.start);

    }, [designJobs, selectedDesigner, selectedDateStr]);

    // --- PROJE BAZLI ÖZET İSTATİSTİKLER ---
    const projectStats = useMemo(() => {
        const stats = {};
        logs.forEach(log => {
            if (!stats[log.projectName]) {
                stats[log.projectName] = { work: 0, pause: 0, total: 0 };
            }
            if (log.type === 'WORK') stats[log.projectName].work += log.duration;
            if (log.type === 'PAUSE') stats[log.projectName].pause += log.duration;
            stats[log.projectName].total += log.duration;
        });

        // Objeyi diziye çevir ve en çok vakit harcanan projeyi en üste al
        return Object.entries(stats)
            .map(([projectName, data]) => ({ projectName, ...data }))
            .sort((a, b) => b.total - a.total);
    }, [logs]);

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            
            {/* ÜST KONTROL BAR */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 flex flex-col md:flex-row justify-between items-center gap-4">
                
                {/* Tarih Seçici (Takvim) */}
                <div className="flex items-center w-full md:w-auto">
                    <CalendarIcon className="w-5 h-5 text-indigo-500 mr-2" />
                    <input 
                        type="date" 
                        value={selectedDateStr}
                        onChange={(e) => setSelectedDateStr(e.target.value)}
                        className="p-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg font-bold text-gray-700 dark:text-gray-200 outline-none focus:ring-2 focus:ring-indigo-500 w-full md:w-auto cursor-pointer"
                    />
                </div>

                {/* Personel Seçici (Sadece Yöneticiler İçin) */}
                {isAdmin ? (
                    <div className="flex items-center w-full md:w-auto">
                        <UserCircle className="w-5 h-5 text-gray-400 mr-2" />
                        <select 
                            value={selectedDesigner} 
                            onChange={(e) => setSelectedDesigner(e.target.value)}
                            className="p-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg font-bold text-gray-700 dark:text-gray-200 outline-none focus:ring-2 focus:ring-indigo-500 flex-1 md:w-64 cursor-pointer"
                        >
                            {designers.map(d => <option key={d} value={d}>{d}</option>)}
                        </select>
                    </div>
                ) : (
                    <div className="flex items-center px-4 py-2.5 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
                        <UserCircle className="w-5 h-5 text-gray-500 mr-2" />
                        <span className="font-bold text-gray-700 dark:text-gray-200">{selectedDesigner}</span>
                    </div>
                )}
            </div>

            {/* PROJE BAZLI İSTATİSTİKLER (YENİ) */}
            {projectStats.length > 0 && (
                <div>
                    <h3 className="text-sm font-bold text-gray-600 dark:text-gray-400 mb-3 ml-1 uppercase tracking-wider">
                        Projelerdeki Harcama Özeti
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {projectStats.map((stat, idx) => (
                            <div key={idx} className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 hover:border-indigo-300 transition-colors">
                                <div className="flex items-start mb-3">
                                    <Briefcase className="w-5 h-5 text-indigo-500 mr-2 flex-shrink-0" />
                                    <h4 className="font-bold text-gray-800 dark:text-white leading-tight line-clamp-2" title={stat.projectName}>
                                        {stat.projectName}
                                    </h4>
                                </div>
                                <div className="space-y-2 text-sm border-t border-gray-100 dark:border-gray-700 pt-3">
                                    <div className="flex justify-between items-center">
                                        <span className="text-gray-500 dark:text-gray-400 flex items-center"><PenTool className="w-3.5 h-3.5 mr-1.5 text-green-500"/> Net Çalışma</span>
                                        <span className="font-bold text-green-600 dark:text-green-400">{formatDuration(stat.work)}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-gray-500 dark:text-gray-400 flex items-center"><PauseCircle className="w-3.5 h-3.5 mr-1.5 text-orange-500"/> Bölünme / Diğer</span>
                                        <span className="font-bold text-orange-600 dark:text-orange-400">{formatDuration(stat.pause)}</span>
                                    </div>
                                    <div className="flex justify-between items-center pt-2 mt-2 border-t border-dashed border-gray-200 dark:border-gray-600">
                                        <span className="font-bold text-gray-700 dark:text-gray-300">Toplam Süre</span>
                                        <span className="font-black text-indigo-600 dark:text-indigo-400">{formatDuration(stat.total)}</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* TIMELINE (ZAMAN AKIŞI) */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                <h2 className="text-lg font-bold text-gray-800 dark:text-white mb-6 flex items-center">
                    <Activity className="w-5 h-5 mr-2 text-indigo-500" /> Günlük Aktivite Dökümü
                </h2>

                {logs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                        <Search className="w-12 h-12 text-gray-300 dark:text-gray-600 mb-3" />
                        <p className="text-gray-500 dark:text-gray-400 font-medium">Bu tarihte herhangi bir aktivite kaydı bulunamadı.</p>
                    </div>
                ) : (
                    <div className="relative border-l-2 border-gray-200 dark:border-gray-700 ml-4 space-y-8 pb-4">
                        {logs.map((log, index) => {
                            const isWork = log.type === 'WORK';
                            return (
                                <div key={log.id} className="relative pl-8">
                                    {/* Timeline Noktası */}
                                    <div className={`absolute -left-[11px] top-1 w-5 h-5 rounded-full border-4 border-white dark:border-gray-800 shadow-sm ${isWork ? 'bg-green-500' : 'bg-orange-500'}`}></div>
                                    
                                    <div className={`p-4 rounded-xl border transition hover:shadow-md ${isWork ? 'bg-green-50/50 border-green-100 dark:bg-green-900/10 dark:border-green-900/30' : 'bg-orange-50/50 border-orange-100 dark:bg-orange-900/10 dark:border-orange-900/30'}`}>
                                        
                                        <div className="flex flex-wrap justify-between items-start gap-4 mb-2">
                                            <div>
                                                {/* Zaman Damgası */}
                                                <div className="flex items-center text-sm font-black text-gray-700 dark:text-gray-200 mb-1">
                                                    <Clock className="w-4 h-4 mr-1.5 opacity-60" />
                                                    {formatTime(log.start)} - {log.isOngoing ? <span className="text-blue-600 dark:text-blue-400 ml-1 animate-pulse">Devam Ediyor...</span> : formatTime(log.end)}
                                                </div>
                                                {/* Ana Proje */}
                                                <h3 className="text-base font-bold text-gray-900 dark:text-white leading-tight">
                                                    {log.projectName}
                                                </h3>
                                            </div>
                                            
                                            {/* Süre Rozeti */}
                                            <div className={`px-3 py-1 rounded-full text-xs font-bold border ${isWork ? 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/40 dark:text-green-400' : 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/40 dark:text-orange-400'}`}>
                                                {formatDuration(log.duration)}
                                            </div>
                                        </div>

                                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 mt-3">
                                            <span className={`inline-block text-[10px] font-bold px-2 py-1 rounded w-max ${isWork ? 'bg-green-500 text-white' : 'bg-orange-500 text-white'}`}>
                                                {log.taskType}
                                            </span>
                                            
                                            {/* Duraklatmada gidilen başka proje varsa */}
                                            {!isWork && log.pauseProject && (
                                                <span className="text-[11px] font-semibold text-gray-600 dark:text-gray-400 bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded">
                                                    Hedef: {log.pauseProject}
                                                </span>
                                            )}
                                        </div>

                                        {/* Detay / Not */}
                                        {log.note && (
                                            <div className={`mt-3 text-xs italic p-2 rounded border ${isWork ? 'bg-green-100/50 text-green-800 border-green-200/50 dark:bg-green-900/20 dark:text-green-300' : 'bg-orange-100/50 text-orange-800 border-orange-200/50 dark:bg-orange-900/20 dark:text-orange-300'}`}>
                                                <span className="font-bold not-italic mr-1">Not:</span> {log.note}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

        </div>
    );
};

export default DesignActivityLog;