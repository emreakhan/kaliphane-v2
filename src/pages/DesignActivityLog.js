// src/pages/DesignActivityLog.js

import React, { useState, useMemo } from 'react';
import { UserCircle, Calendar as CalendarIcon, Clock, PenTool, PauseCircle, Activity, Search, Briefcase, Coffee, ShieldAlert, Filter, ChevronDown, PieChart, BarChart3, Layers, CheckCircle2 } from 'lucide-react';
import { ROLES, PERSONNEL_ROLES } from '../config/constants.js';

// TATİL VE MESAİ YARDIMCILARI
const PUBLIC_HOLIDAYS = ["01-01", "04-23", "05-01", "05-19", "07-15", "08-30", "10-29"];
const RELIGIOUS_HOLIDAYS_2026 = ["2026-03-20", "2026-03-21", "2026-03-22", "2026-05-27", "2026-05-28", "2026-05-29", "2026-05-30"];

const isHoliday = (date) => {
    const mmdd = `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const yyyymmdd = date.toISOString().split('T')[0];
    return PUBLIC_HOLIDAYS.includes(mmdd) || RELIGIOUS_HOLIDAYS_2026.includes(yyyymmdd);
};

const formatDuration = (hours) => {
    if (!hours || isNaN(hours) || hours <= 0) return "0 Dk";
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    if (h > 0 && m > 0) return `${h} Saat ${m} Dk`;
    if (h > 0) return `${h} Saat`;
    return `${m} Dk`;
};

const getPauseReasonText = (reason) => {
    if (!reason) return 'Bilinmeyen Neden';
    if (typeof reason === 'object') {
        const parts = [];
        if (reason.reason) parts.push(reason.reason);
        if (reason.description) parts.push(reason.description);
        return parts.join(' - ');
    }
    return reason;
};

const formatTime = (dateObj) => {
    if (!dateObj) return '';
    return dateObj.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
};

// AKILLI SAYAÇ: Tek bir gün için mesai ve dinamik mola saatini kırpar.
const calculateDailyDuration = (sTime, eTime, targetDate, autoPause, designConfig = {}) => {
    const workStartH = designConfig.workStartHour ?? 8;
    const workEndH = designConfig.workEndHour ?? 18;

    let activeBreaks = [];
    if (designConfig.breaks && Array.isArray(designConfig.breaks)) {
        activeBreaks = designConfig.breaks.filter(b => b.enabled !== false);
    } else if (designConfig.lunchBreakEnabled !== false) {
        activeBreaks = [{
            name: 'Yemek Molası',
            start: designConfig.lunchBreakStart || "12:00",
            end: designConfig.lunchBreakEnd || "13:00"
        }];
    }

    const startOfDay = new Date(targetDate); startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate); endOfDay.setHours(23, 59, 59, 999);

    const clampedStart = sTime < startOfDay ? startOfDay : sTime;
    const clampedEnd = eTime > endOfDay ? endOfDay : eTime;

    if (clampedStart >= clampedEnd) return 0;

    // Otomatik Kesinti Aktifse
    if (autoPause !== false) {
        if (targetDate.getDay() === 0 || targetDate.getDay() === 6 || isHoliday(targetDate)) {
            return 0; 
        }
        
        const workStart = new Date(targetDate); workStart.setHours(workStartH, 0, 0, 0);
        const workEnd = new Date(targetDate); workEnd.setHours(workEndH, 0, 0, 0);

        const effectiveStart = clampedStart > workStart ? clampedStart : workStart;
        const effectiveEnd = clampedEnd < workEnd ? clampedEnd : workEnd;

        if (effectiveStart < effectiveEnd) {
            let hours = (effectiveEnd - effectiveStart) / (1000 * 60 * 60);

            // TÜM ETKİN MOLALARIN KESİNTİSİ (Çay molaları, yemek molası vb.)
            activeBreaks.forEach(b => {
                const [bStartH, bStartM] = (b.start || "12:00").split(':').map(Number);
                const [bEndH, bEndM] = (b.end || "13:00").split(':').map(Number);

                const bStartObj = new Date(targetDate);
                bStartObj.setHours(bStartH || 0, bStartM || 0, 0, 0);
                const bEndObj = new Date(targetDate);
                bEndObj.setHours(bEndH || 0, bEndM || 0, 0, 0);

                const overlapStart = new Date(Math.max(effectiveStart.getTime(), bStartObj.getTime()));
                const overlapEnd = new Date(Math.min(effectiveEnd.getTime(), bEndObj.getTime()));

                if (overlapStart < overlapEnd) {
                    const bOverlapHours = (overlapEnd - overlapStart) / (1000 * 60 * 60);
                    hours -= bOverlapHours;
                }
            });
            return Math.max(0, hours);
        }
        return 0;
    }
    
    return (clampedEnd - clampedStart) / (1000 * 60 * 60);
};

// YAZARAK ARAMALI KALIP SEÇİMİ BİLEŞENİ
const SearchableMoldSelect = ({ molds, value, onChange }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    const filteredMolds = molds.filter(m => m.toLowerCase().includes(searchTerm.toLowerCase()));

    return (
        <div className="relative">
            <div className="relative flex items-center">
                <Search className="w-3.5 h-3.5 text-amber-500 absolute left-2.5 pointer-events-none" />
                <input 
                    type="text" 
                    placeholder={value === 'ALL' ? '🔍 Kalıp adı ara / seç...' : value}
                    value={isOpen ? searchTerm : (value === 'ALL' ? '' : value)}
                    onChange={(e) => { setSearchTerm(e.target.value); setIsOpen(true); }}
                    onFocus={() => setIsOpen(true)}
                    className="pl-8 pr-7 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg font-bold text-xs text-gray-800 dark:text-gray-200 outline-none focus:ring-2 focus:ring-amber-500 w-full cursor-pointer"
                />
                {value !== 'ALL' && (
                    <button 
                        onClick={() => { onChange('ALL'); setSearchTerm(''); setIsOpen(false); }}
                        className="absolute right-2 text-gray-400 hover:text-red-500 font-bold text-xs"
                        title="Filtreyi Temizle"
                    >
                        ✕
                    </button>
                )}
            </div>

            {isOpen && (
                <>
                    <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)}></div>
                    <ul className="absolute z-20 w-full mt-1 max-h-48 overflow-y-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-xl text-xs">
                        <li 
                            onClick={() => { onChange('ALL'); setIsOpen(false); setSearchTerm(''); }}
                            className={`px-3 py-2 hover:bg-amber-50 dark:hover:bg-amber-900/30 cursor-pointer font-bold ${value === 'ALL' ? 'bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-300' : 'text-gray-700 dark:text-gray-300'}`}
                        >
                            🔍 Tüm Kalıplar / Projeler ({molds.length})
                        </li>
                        {filteredMolds.map(m => (
                            <li 
                                key={m}
                                onClick={() => { onChange(m); setIsOpen(false); setSearchTerm(''); }}
                                className={`px-3 py-2 hover:bg-amber-50 dark:hover:bg-amber-900/30 cursor-pointer border-t border-gray-100 dark:border-gray-700 font-bold ${value === m ? 'bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-300' : 'text-gray-700 dark:text-gray-300'}`}
                            >
                                {m}
                            </li>
                        ))}
                    </ul>
                </>
            )}
        </div>
    );
};

const DesignActivityLog = ({ loggedInUser, personnel, projects = [], designJobs = [], designConfig = {} }) => {
    const workStartH = designConfig.workStartHour ?? 8;
    const workEndH = designConfig.workEndHour ?? 18;

    const activeBreaks = useMemo(() => {
        if (designConfig.breaks && Array.isArray(designConfig.breaks)) {
            return designConfig.breaks.filter(b => b.enabled !== false);
        } else if (designConfig.lunchBreakEnabled !== false) {
            return [{
                name: 'Yemek Molası',
                start: designConfig.lunchBreakStart || "12:00",
                end: designConfig.lunchBreakEnd || "13:00"
            }];
        }
        return [];
    }, [designConfig]);

    const isAdmin = loggedInUser?.role === ROLES.ADMIN || loggedInUser?.role === ROLES.PROJE_SORUMLUSU || loggedInUser?.role === ROLES.KALIP_TASARIM_YONETICISI;
    
    const designers = useMemo(() => {
        return personnel.filter(p => p.role === PERSONNEL_ROLES.KALIP_TASARIM_SORUMLUSU || p.role === PERSONNEL_ROLES.KALIP_TASARIM_YONETICISI).map(p => p.name).sort((a,b) => a.localeCompare(b, 'tr'));
    }, [personnel]);

    const todayStr = new Date().toISOString().split('T')[0];
    const [selectedDateStr, setSelectedDateStr] = useState(todayStr);
    const [selectedDesigner, setSelectedDesigner] = useState(isAdmin ? (designers[0] || '') : loggedInUser.name);
    
    // KALIP / PROJE FİLTRESİ STATE'LERİ (SADECE PERSONELİN ÇALIŞTIĞI KALIPLAR)
    const [selectedProjectFilter, setSelectedProjectFilter] = useState('ALL');

    // ÖZET PERİYODU FİLTRESİ (Haftalık / Aylık / Yıllık)
    const [summaryPeriod, setSummaryPeriod] = useState('WEEKLY'); // 'WEEKLY', 'MONTHLY', 'YEARLY'

    // SEÇİLİ PERSONELİN BİZZAT ÇALIŞTIĞI KALIPLARIN LİSTESİ
    const designerWorkedMolds = useMemo(() => {
        const set = new Set();
        designJobs.forEach(j => {
            if (!selectedDesigner || j.assignedDesigner === selectedDesigner) {
                if (j.projectName) set.add(j.projectName);
            }
        });
        return Array.from(set).sort((a, b) => a.localeCompare(b, 'tr'));
    }, [designJobs, selectedDesigner]);

    // PERSONELİN HAFTALIK / AYLIK / YILLIK ÇALIŞMA ÖZETİ
    const designerSummaryStats = useMemo(() => {
        if (!selectedDesigner || !designJobs) return null;

        const now = new Date();
        let startDate = new Date();

        if (summaryPeriod === 'WEEKLY') {
            const dayOfWeek = now.getDay() === 0 ? 6 : now.getDay() - 1; // Pzt=0
            startDate.setDate(now.getDate() - dayOfWeek);
            startDate.setHours(0, 0, 0, 0);
        } else if (summaryPeriod === 'MONTHLY') {
            startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
        } else if (summaryPeriod === 'YEARLY') {
            startDate = new Date(now.getFullYear(), 0, 1, 0, 0, 0);
        }

        let totalWorkHours = 0;
        let totalPauseHours = 0;
        const taskTypeMap = {};
        const moldSet = new Set();

        designJobs.forEach(job => {
            if (job.assignedDesigner !== selectedDesigner) return;

            (job.workSessions || []).forEach(ws => {
                if (ws.startTime) {
                    const sTime = new Date(ws.startTime);
                    const eTime = ws.endTime ? new Date(ws.endTime) : now;

                    if (eTime >= startDate) {
                        const dur = calculateDailyDuration(sTime, eTime, sTime, job.autoPause, designConfig);
                        if (dur > 0) {
                            totalWorkHours += dur;
                            const tType = job.taskType || 'KALIP TASARIM';
                            taskTypeMap[tType] = (taskTypeMap[tType] || 0) + dur;
                            if (job.projectName) moldSet.add(job.projectName);
                        }
                    }
                }
            });

            (job.pauseHistory || []).forEach(ph => {
                if (ph.pausedAt) {
                    const sTime = new Date(ph.pausedAt);
                    const eTime = ph.resumedAt ? new Date(ph.resumedAt) : now;

                    if (eTime >= startDate) {
                        const dur = calculateDailyDuration(sTime, eTime, sTime, job.autoPause, designConfig);
                        if (dur > 0) {
                            totalPauseHours += dur;
                        }
                    }
                }
            });
        });

        return {
            period: summaryPeriod,
            totalWorkHours,
            totalPauseHours,
            moldCount: moldSet.size,
            taskTypeMap
        };

    }, [designJobs, selectedDesigner, summaryPeriod, designConfig]);

    const logs = useMemo(() => {
        if (!designJobs || designJobs.length === 0) return [];

        const targetDate = new Date(selectedDateStr);
        const startOfDay = new Date(targetDate); startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(targetDate); endOfDay.setHours(23, 59, 59, 999);
        const now = new Date();

        const isMoldSelected = selectedProjectFilter !== 'ALL';
        let rawLogs = [];

        designJobs.forEach(job => {
            // Eğer kalıp seçilmemişse seçili personele göre filtrele
            if (!isMoldSelected && selectedDesigner && job.assignedDesigner !== selectedDesigner) return;

            // Kalıp Filtresi
            if (isMoldSelected && job.projectName !== selectedProjectFilter) return;

            // 1. ÇALIŞMA (TASARIM) SEANSLARI
            (job.workSessions || []).forEach(ws => {
                if (ws.startTime) {
                    const sTime = new Date(ws.startTime);
                    const eTime = ws.endTime ? new Date(ws.endTime) : now; 
                    
                    // Kalıp seçilmişse TÜM TARİHSEL AKIŞI göster, seçilmemişse tarihe göre filtrele
                    const isTargetPeriod = isMoldSelected ? true : (sTime <= endOfDay && eTime >= startOfDay);

                    if (isTargetPeriod) {
                        const effectiveDate = isMoldSelected ? sTime : targetDate;
                        const durationHours = calculateDailyDuration(sTime, eTime, effectiveDate, job.autoPause, designConfig);
                        const isOngoing = !ws.endTime && eTime.toDateString() === now.toDateString();

                        if (durationHours > 0 || (isOngoing && effectiveDate.toDateString() === now.toDateString())) {
                            
                            let displayStart = new Date(sTime);
                            if (!isMoldSelected && displayStart < startOfDay) displayStart = new Date(startOfDay);
                            if (job.autoPause !== false && displayStart.getHours() < workStartH) {
                                displayStart.setHours(workStartH, 0, 0, 0);
                            }

                            let displayEnd = new Date(eTime);
                            let endLabel = null;

                            if (!ws.endTime) {
                                if (now.toDateString() !== effectiveDate.toDateString()) {
                                    endLabel = `${String(workEndH).padStart(2, '0')}:00 (Vardiya Sonu - Otomatik Durduruldu)`;
                                } else if (job.autoPause !== false && now.getHours() >= workEndH) {
                                    endLabel = `${String(workEndH).padStart(2, '0')}:00 (Vardiya Sonu - Otomatik Durduruldu)`;
                                } else {
                                    endLabel = "Devam Ediyor...";
                                }
                            }

                            rawLogs.push({
                                id: `ws-${job.id}-${ws.startTime}`,
                                type: 'WORK',
                                start: displayStart,
                                end: displayEnd,
                                endLabel,
                                isOngoing, 
                                projectName: job.projectName,
                                taskType: job.taskType,
                                designerName: job.assignedDesigner,
                                duration: durationHours,
                                note: job.autoPause === false ? '⚡ Fazla Mesai Koruması Kapalı' : 'Net Çalışma'
                            });

                            // TÜM DİNAMİK MOLALARIN LOG TIMELINE UZERINDE GÖSTERİMİ
                            if (job.autoPause !== false) {
                                activeBreaks.forEach(b => {
                                    const [bStartH, bStartM] = (b.start || "12:00").split(':').map(Number);
                                    const [bEndH, bEndM] = (b.end || "13:00").split(':').map(Number);

                                    const bStartObj = new Date(effectiveDate);
                                    bStartObj.setHours(bStartH || 0, bStartM || 0, 0, 0);
                                    const bEndObj = new Date(effectiveDate);
                                    bEndObj.setHours(bEndH || 0, bEndM || 0, 0, 0);

                                    if (sTime < bEndObj && eTime > bStartObj) {
                                        const durMin = Math.round((bEndObj - bStartObj) / (1000 * 60));
                                        rawLogs.push({
                                            id: `break-${b.id}-${job.id}-${ws.startTime}`,
                                            type: 'BREAK',
                                            start: bStartObj,
                                            end: bEndObj,
                                            isOngoing: false,
                                            projectName: job.projectName,
                                            taskType: `☕ ${b.name} (Sayaç Durduruldu)`,
                                            designerName: job.assignedDesigner,
                                            duration: durMin / 60,
                                            note: `${b.start} - ${b.end} Kuralı (${durMin} Dk)`
                                        });
                                    }
                                });
                            }
                        }
                    }
                }
            });

            // 2. DURAKLATMA (BÖLÜNME) SEANSLARI
            (job.pauseHistory || []).forEach(ph => {
                if (ph.pausedAt) {
                    const sTime = new Date(ph.pausedAt);
                    const eTime = ph.resumedAt ? new Date(ph.resumedAt) : now;

                    const isTargetPeriod = isMoldSelected ? true : (sTime <= endOfDay && eTime >= startOfDay);

                    if (isTargetPeriod) {
                        const effectiveDate = isMoldSelected ? sTime : targetDate;
                        const durationHours = calculateDailyDuration(sTime, eTime, effectiveDate, job.autoPause, designConfig);
                        const isOngoing = !ph.resumedAt && eTime.toDateString() === now.toDateString();

                        if (durationHours > 0 || (isOngoing && effectiveDate.toDateString() === now.toDateString())) {
                            let displayStart = new Date(sTime);
                            if (!isMoldSelected && displayStart < startOfDay) displayStart = new Date(startOfDay);
                            if (job.autoPause !== false && displayStart.getHours() < workStartH) {
                                displayStart.setHours(workStartH, 0, 0, 0);
                            }

                            rawLogs.push({
                                id: `ph-${job.id}-${ph.pausedAt}`,
                                type: 'PAUSE',
                                start: displayStart,
                                end: new Date(eTime),
                                isOngoing,
                                projectName: job.projectName,
                                taskType: getPauseReasonText(ph.reason),
                                pauseProject: ph.projectName || '',
                                designerName: job.assignedDesigner,
                                duration: durationHours,
                                note: ph.note || ''
                            });
                        }
                    }
                }
            });
        });

        return rawLogs.sort((a, b) => a.start - b.start);

    }, [designJobs, selectedDesigner, selectedDateStr, selectedProjectFilter, workStartH, workEndH, activeBreaks, designConfig]);

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
        return Object.entries(stats).map(([projectName, data]) => ({ projectName, ...data })).sort((a, b) => b.total - a.total);
    }, [logs]);

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            
            {/* ÜST FİLTRE PANELİ */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 flex flex-col md:flex-row justify-between items-center gap-4">
                
                <div className="flex items-center gap-3 w-full md:w-auto flex-wrap">
                    {/* Tarih Seçimi */}
                    <div className="flex items-center">
                        <CalendarIcon className="w-5 h-5 text-indigo-500 mr-2" />
                        <input 
                            type="date" 
                            disabled={selectedProjectFilter !== 'ALL'}
                            value={selectedDateStr}
                            onChange={(e) => setSelectedDateStr(e.target.value)}
                            className="p-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg font-bold text-gray-700 dark:text-gray-200 outline-none focus:ring-2 focus:ring-indigo-500 w-full md:w-auto cursor-pointer disabled:opacity-40"
                        />
                    </div>

                    {/* Kişiye Özel Yazarak Kalıp Seçimi */}
                    <div className="w-64">
                        <SearchableMoldSelect 
                            molds={designerWorkedMolds}
                            value={selectedProjectFilter}
                            onChange={(m) => setSelectedProjectFilter(m)}
                        />
                    </div>
                </div>

                {/* Personel Seçimi */}
                {isAdmin ? (
                    <div className="flex items-center w-full md:w-auto">
                        <UserCircle className="w-5 h-5 text-gray-400 mr-2" />
                        <select 
                            value={selectedDesigner} 
                            onChange={(e) => {
                                setSelectedDesigner(e.target.value);
                                setSelectedProjectFilter('ALL');
                            }}
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

            {/* PERSONEL HAFTALIK / AYLIK / YILLIK ÇALIŞMA ÖZETİ PANERİ */}
            {designerSummaryStats && (
                <div className="bg-white dark:bg-gray-800 p-5 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 space-y-4">
                    <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 border-b border-gray-100 dark:border-gray-700 pb-3">
                        <div>
                            <h3 className="text-base font-bold text-gray-800 dark:text-white flex items-center gap-2">
                                <BarChart3 className="w-5 h-5 text-indigo-500" />
                                {selectedDesigner} - Çalışma & Görev Dağılım Özeti
                            </h3>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Seçilen periyottaki net çalışma saatleri ve aktivite türlerine göre dağılım dökümü.</p>
                        </div>

                        {/* Periyot Butonları */}
                        <div className="flex items-center bg-gray-100 dark:bg-gray-700 p-1 rounded-lg gap-1 self-start sm:self-auto">
                            <button 
                                onClick={() => setSummaryPeriod('WEEKLY')}
                                className={`px-3 py-1.5 rounded-md text-xs font-bold transition ${summaryPeriod === 'WEEKLY' ? 'bg-indigo-600 text-white shadow' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}`}
                            >
                                Bu Hafta
                            </button>
                            <button 
                                onClick={() => setSummaryPeriod('MONTHLY')}
                                className={`px-3 py-1.5 rounded-md text-xs font-bold transition ${summaryPeriod === 'MONTHLY' ? 'bg-indigo-600 text-white shadow' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}`}
                            >
                                Bu Ay
                            </button>
                            <button 
                                onClick={() => setSummaryPeriod('YEARLY')}
                                className={`px-3 py-1.5 rounded-md text-xs font-bold transition ${summaryPeriod === 'YEARLY' ? 'bg-indigo-600 text-white shadow' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}`}
                            >
                                Bu Yıl
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="bg-indigo-50/70 dark:bg-indigo-900/20 p-4 rounded-xl border border-indigo-100 dark:border-indigo-800/40">
                            <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 block mb-1">Net Çalışma Süresi</span>
                            <span className="text-2xl font-black text-indigo-700 dark:text-indigo-300">{formatDuration(designerSummaryStats.totalWorkHours)}</span>
                        </div>

                        <div className="bg-amber-50/70 dark:bg-amber-900/20 p-4 rounded-xl border border-amber-100 dark:border-amber-800/40">
                            <span className="text-xs font-bold text-amber-600 dark:text-amber-400 block mb-1">Bölünme / Duraklatma Süresi</span>
                            <span className="text-2xl font-black text-amber-700 dark:text-amber-300">{formatDuration(designerSummaryStats.totalPauseHours)}</span>
                        </div>

                        <div className="bg-emerald-50/70 dark:bg-emerald-900/20 p-4 rounded-xl border border-emerald-100 dark:border-emerald-800/40">
                            <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 block mb-1">Çalışılan Farklı Kalıp Sayısı</span>
                            <span className="text-2xl font-black text-emerald-700 dark:text-emerald-300">{designerSummaryStats.moldCount} Kalıp</span>
                        </div>
                    </div>

                    {/* Görev Dağılım Çubukları */}
                    {Object.keys(designerSummaryStats.taskTypeMap).length > 0 && (
                        <div className="pt-2">
                            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-2">Aktivite Türü Dağılımı</span>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                {Object.entries(designerSummaryStats.taskTypeMap).map(([type, hours]) => {
                                    const pct = designerSummaryStats.totalWorkHours > 0 ? Math.round((hours / designerSummaryStats.totalWorkHours) * 100) : 0;
                                    return (
                                        <div key={type} className="bg-gray-50 dark:bg-gray-900/40 p-3 rounded-lg border border-gray-100 dark:border-gray-700">
                                            <div className="flex justify-between items-center text-xs mb-1">
                                                <span className="font-bold text-gray-700 dark:text-gray-200 truncate">{type}</span>
                                                <span className="font-black text-indigo-600 dark:text-indigo-400">{pct}%</span>
                                            </div>
                                            <div className="w-full bg-gray-200 dark:bg-gray-700 h-1.5 rounded-full overflow-hidden mb-1">
                                                <div className="h-full bg-indigo-600" style={{ width: `${pct}%` }} />
                                            </div>
                                            <span className="text-[10px] text-gray-400 block">{formatDuration(hours)}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* PROJE BAZLI HARCAMA ÖZETİ (SADECE GÜNLÜK GÖRÜNÜMDE) */}
            {selectedProjectFilter === 'ALL' && projectStats.length > 0 && (
                <div>
                    <h3 className="text-sm font-bold text-gray-600 dark:text-gray-400 mb-3 ml-1 uppercase tracking-wider">
                        Projelerdeki Harcama Özeti (Seçili Gün)
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {projectStats.map((stat, idx) => (
                            <div key={idx} className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 hover:border-indigo-300 transition-colors">
                                <div className="flex items-start mb-3">
                                    <Briefcase className="w-5 h-5 text-indigo-500 mr-2 flex-shrink-0" />
                                    <h4 className="font-bold text-gray-800 dark:text-white leading-tight line-clamp-2" title={stat.projectName}>{stat.projectName}</h4>
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

            {/* DÖKÜM LİSTESİ VEYA KALIP AKIŞ TIMELINE'I */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                <h2 className="text-lg font-bold text-gray-800 dark:text-white mb-6 flex items-center justify-between">
                    <span className="flex items-center">
                        <Activity className="w-5 h-5 mr-2 text-indigo-500" />
                        {selectedProjectFilter !== 'ALL' ? `📌 ${selectedProjectFilter} - Tüm Tarihsel Akış Zaman Çizelgesi` : 'Günlük Aktivite Dökümü'}
                    </span>
                    <span className="text-xs text-gray-400 font-normal">
                        Mesai: {String(workStartH).padStart(2, '0')}:00 - {String(workEndH).padStart(2, '0')}:00 ({activeBreaks.length} Mola Tanımlı)
                    </span>
                </h2>

                {logs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                        <Search className="w-12 h-12 text-gray-300 dark:text-gray-600 mb-3" />
                        <p className="text-gray-500 dark:text-gray-400 font-medium">Bu kriterlerde hesaplanmış bir aktivite kaydı bulunamadı.</p>
                    </div>
                ) : (
                    <div className="relative border-l-2 border-gray-200 dark:border-gray-700 ml-4 space-y-8 pb-4">
                        {logs.map((log) => {
                            const isWork = log.type === 'WORK';
                            const isBreak = log.type === 'BREAK';

                            const dateLabel = log.start ? log.start.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' }) : '';

                            return (
                                <div key={log.id} className="relative pl-8">
                                    <div className={`absolute -left-[11px] top-1 w-5 h-5 rounded-full border-4 border-white dark:border-gray-800 shadow-sm ${
                                        isBreak ? 'bg-amber-500' : isWork ? 'bg-green-500' : 'bg-orange-500'
                                    }`}></div>
                                    
                                    <div className={`p-4 rounded-xl border transition hover:shadow-md ${
                                        isBreak ? 'bg-amber-50/60 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800/40' :
                                        isWork ? 'bg-green-50/50 border-green-100 dark:bg-green-900/10 dark:border-green-900/30' : 
                                        'bg-orange-50/50 border-orange-100 dark:bg-orange-900/10 dark:border-orange-900/30'
                                    }`}>
                                        
                                        <div className="flex flex-wrap justify-between items-start gap-4 mb-2">
                                            <div>
                                                <div className="flex items-center gap-2 text-sm font-black text-gray-700 dark:text-gray-200 mb-1">
                                                    {selectedProjectFilter !== 'ALL' && (
                                                        <span className="px-2 py-0.5 bg-indigo-100 text-indigo-800 dark:bg-indigo-900/60 dark:text-indigo-300 rounded text-xs">
                                                            {dateLabel}
                                                        </span>
                                                    )}
                                                    <Clock className="w-4 h-4 opacity-60 ml-1" />
                                                    {formatTime(log.start)} - {log.endLabel ? log.endLabel : formatTime(log.end)}
                                                </div>

                                                <h3 className="text-base font-bold text-gray-900 dark:text-white leading-snug">
                                                    {log.projectName}
                                                </h3>
                                                
                                                <p className="text-xs font-bold text-indigo-600 dark:text-indigo-400 mt-0.5 flex items-center gap-1">
                                                    <UserCircle className="w-3.5 h-3.5" /> Tasarımcı: {log.designerName}
                                                </p>
                                            </div>

                                            <div className="flex items-center gap-2">
                                                <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                                                    isBreak ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300' :
                                                    isWork ? 'bg-green-100 text-green-800 dark:bg-green-900/60 dark:text-green-300' : 
                                                    'bg-orange-100 text-orange-800 dark:bg-orange-900/60 dark:text-orange-300'
                                                }`}>
                                                    {log.taskType}
                                                </span>
                                                <span className="text-xs font-black px-2.5 py-1 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 rounded-md border border-gray-200 dark:border-gray-600 shadow-sm">
                                                    {formatDuration(log.duration)}
                                                </span>
                                            </div>
                                        </div>

                                        {/* İLİŞKİLİ DURAKLATMA PROJESİ VE DETAYLI NOTLAR */}
                                        {log.pauseProject && (
                                            <div className="mt-2 text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 p-2 rounded-lg border border-indigo-100 dark:border-indigo-800 flex items-center">
                                                <Briefcase className="w-3.5 h-3.5 mr-1.5" /> Bölünülen İlgili Proje: {log.pauseProject}
                                            </div>
                                        )}

                                        {log.note && (
                                            <p className="mt-2 text-xs font-medium text-gray-700 dark:text-gray-300 bg-white/80 dark:bg-gray-800/90 p-2.5 rounded-lg border border-gray-200/80 dark:border-gray-700 italic">
                                                Not: {log.note}
                                            </p>
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