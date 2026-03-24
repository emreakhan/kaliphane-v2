// src/pages/DesignMyTasks.js

import React, { useState, useMemo, useEffect } from 'react';
import { PlayCircle, PauseCircle, CheckCircle, Clock, Search, ChevronDown, AlertTriangle, Briefcase, Activity, ListOrdered, CalendarDays, Calendar as CalendarIcon, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { doc, updateDoc, addDoc, collection } from '../config/firebase.js';
import { DESIGN_JOBS_COLLECTION, DESIGN_JOB_STATUS, DESIGN_ACTIVITY_TYPES, DESIGN_TASK_TYPES } from '../config/constants.js';
import { getCurrentDateTimeString } from '../utils/dateUtils.js';
import Modal from '../components/Modals/Modal.js';

// --- RESMİ TATİLLER VE MESAİ ALGORİTMASI ---
const WORK_START_HOUR = 8;
const WORK_END_HOUR = 18;

// Sabit Ulusal Bayramlar (Ay-Gün)
const PUBLIC_HOLIDAYS = ["01-01", "04-23", "05-01", "05-19", "07-15", "08-30", "10-29"];
// Dini Bayramlar (2026 Tahmini Tarihler - İhtiyaca göre güncellenebilir)
const RELIGIOUS_HOLIDAYS_2026 = ["2026-03-20", "2026-03-21", "2026-03-22", "2026-05-27", "2026-05-28", "2026-05-29", "2026-05-30"];

const isHoliday = (date) => {
    const mmdd = `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const yyyymmdd = date.toISOString().split('T')[0];
    return PUBLIC_HOLIDAYS.includes(mmdd) || RELIGIOUS_HOLIDAYS_2026.includes(yyyymmdd);
};

const TASK_COLORS = ['bg-blue-500', 'bg-purple-500', 'bg-pink-500', 'bg-teal-500', 'bg-cyan-600', 'bg-indigo-500'];

const addWorkingHours = (startDate, hoursToAdd) => {
    let currentDate = new Date(startDate.getTime());
    let remainingMinutes = hoursToAdd * 60;
    
    if (currentDate.getHours() < WORK_START_HOUR) currentDate.setHours(WORK_START_HOUR, 0, 0, 0);
    else if (currentDate.getHours() >= WORK_END_HOUR) { currentDate.setDate(currentDate.getDate() + 1); currentDate.setHours(WORK_START_HOUR, 0, 0, 0); }
    
    // Hafta sonu veya tatil atlama fonksiyonu
    const skipNonWorkingDays = () => {
        while (currentDate.getDay() === 0 || currentDate.getDay() === 6 || isHoliday(currentDate)) { 
            currentDate.setDate(currentDate.getDate() + 1); 
            currentDate.setHours(WORK_START_HOUR, 0, 0, 0); 
        }
    };

    skipNonWorkingDays();

    while (remainingMinutes > 0) {
        let minutesToEOD = (WORK_END_HOUR * 60) - (currentDate.getHours() * 60 + currentDate.getMinutes());
        if (remainingMinutes <= minutesToEOD) { 
            currentDate.setMinutes(currentDate.getMinutes() + remainingMinutes); 
            remainingMinutes = 0; 
        } 
        else {
            remainingMinutes -= minutesToEOD; 
            currentDate.setDate(currentDate.getDate() + 1); 
            currentDate.setHours(WORK_START_HOUR, 0, 0, 0);
            skipNonWorkingDays();
        }
    }
    return currentDate;
};

// --- ARAMALI PROJE SEÇİM BİLEŞENİ ---
const SearchableProjectSelect = ({ projects, value, onChange, error }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [filter, setFilter] = useState('');
    useEffect(() => {
        if (!value) setFilter('');
        else { const p = projects.find(proj => proj.id === value); if (p) setFilter(p.moldName); }
    }, [value, projects]);
    const filteredProjects = projects.filter(p => p.moldName?.toLowerCase().includes(filter.toLowerCase()) || p.customer?.toLowerCase().includes(filter.toLowerCase()));
    return (
        <div className="relative mb-4">
            <div className="relative">
                <input type="text" className={`block w-full rounded-lg border-gray-300 shadow-sm focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white pr-8 pl-10 py-2.5 ${error ? 'border-red-500 ring-1 ring-red-500' : ''}`} placeholder="Kalıp adı veya müşteri ara..." value={filter} onChange={(e) => { setFilter(e.target.value); setIsOpen(true); onChange('', ''); }} onFocus={() => setIsOpen(true)} />
                <Search className="absolute left-3 top-3 text-gray-400 w-4 h-4" />
                <div className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none">{isOpen ? <ChevronDown className="w-4 h-4 rotate-180" /> : <ChevronDown className="w-4 h-4" />}</div>
            </div>
            {isOpen && (
                <>
                    <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)}></div>
                    <ul className="absolute z-20 w-full mt-1 max-h-48 overflow-y-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-xl">
                        {filteredProjects.length === 0 ? <li className="px-4 py-3 text-sm text-gray-500 text-center">Proje bulunamadı.</li> : filteredProjects.map((proj) => (
                            <li key={proj.id} onClick={() => { setFilter(proj.moldName); onChange(proj.id, proj.moldName); setIsOpen(false); }} className="px-4 py-2 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 cursor-pointer text-sm border-b last:border-0 border-gray-100 dark:border-gray-700 flex flex-col">
                                <span className="font-bold text-gray-800 dark:text-gray-200">{proj.moldName}</span>
                                {proj.customer && <span className="text-[10px] text-gray-500">{proj.customer}</span>}
                            </li>
                        ))}
                    </ul>
                </>
            )}
            {error && <p className="mt-1 text-sm text-red-600 font-medium flex items-center"><AlertTriangle className="w-4 h-4 mr-1" /> {error}</p>}
        </div>
    );
};

const DesignMyTasks = ({ db, designJobs, projects, loggedInUser }) => {
    const [pauseModalOpen, setPauseModalOpen] = useState(false);
    const [selectedJob, setSelectedJob] = useState(null);
    const [pauseReason, setPauseReason] = useState('');
    const [pauseProjectId, setPauseProjectId] = useState('');
    const [pauseProjectName, setPauseProjectName] = useState('');
    const [pauseNote, setPauseNote] = useState('');
    
    // Manuel İş Ekleme States
    const [manualModalOpen, setManualModalOpen] = useState(false);
    const [manualProjectId, setManualProjectId] = useState('');
    const [manualProjectName, setManualProjectName] = useState('');
    const [manualTaskType, setManualTaskType] = useState(DESIGN_TASK_TYPES.REVISION);
    const [manualEstimatedHours, setManualEstimatedHours] = useState('');
    const [manualNote, setManualNote] = useState('');

    const [isSaving, setIsSaving] = useState(false);
    const [currentDate, setCurrentDate] = useState(new Date());

    // KİŞİSEL TIMELINE STATES
    const MINI_DAY_WIDTH = 100;
    const MINI_DAYS_TO_SHOW = 14;
    const [miniBaseDate, setMiniBaseDate] = useState(() => {
        const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate() - 1); return d;
    });

    const myJobs = useMemo(() => {
        return designJobs
            .filter(j => j.assignedDesigner === loggedInUser.name && j.status !== DESIGN_JOB_STATUS.COMPLETED)
            .sort((a, b) => {
                if (a.status === DESIGN_JOB_STATUS.IN_PROGRESS && b.status !== DESIGN_JOB_STATUS.IN_PROGRESS) return -1;
                if (b.status === DESIGN_JOB_STATUS.IN_PROGRESS && a.status !== DESIGN_JOB_STATUS.IN_PROGRESS) return 1;
                return (a.orderIndex || 0) - (b.orderIndex || 0);
            });
    }, [designJobs, loggedInUser.name]);

    // --- KİŞİSEL TIMELINE HESAPLAMALARI ---
    const miniDays = useMemo(() => {
        const arr = [];
        for (let i = 0; i < MINI_DAYS_TO_SHOW; i++) {
            const d = new Date(miniBaseDate); d.setDate(d.getDate() + i); arr.push(d);
        }
        return arr;
    }, [miniBaseDate]);

    const timelineStartMs = miniDays[0].getTime();
    const timelineEndMs = miniDays[miniDays.length - 1].getTime() + (24 * 60 * 60 * 1000);

    const timelineData = useMemo(() => {
        const now = new Date();
        let currentPointer = new Date(now);
        if (currentPointer.getHours() < WORK_START_HOUR) currentPointer.setHours(WORK_START_HOUR, 0, 0, 0);
        if (currentPointer.getHours() >= WORK_END_HOUR) { currentPointer.setDate(currentPointer.getDate() + 1); currentPointer.setHours(WORK_START_HOUR, 0, 0, 0); }

        const mappedJobs = [];
        let colorIndex = 0;

        myJobs.forEach((job) => {
            let start, end;
            const estimatedHours = parseFloat(job.estimatedHours) || 0;
            if (job.status === DESIGN_JOB_STATUS.IN_PROGRESS) {
                const firstSession = job.workSessions?.[0]?.startTime;
                start = firstSession ? new Date(firstSession) : new Date(currentPointer);
                end = addWorkingHours(start, estimatedHours);
                currentPointer = new Date(Math.max(now.getTime(), end.getTime()));
            } else {
                start = new Date(currentPointer);
                end = addWorkingHours(start, estimatedHours);
                currentPointer = new Date(end); 
            }

            if (end.getTime() > timelineStartMs && start.getTime() < timelineEndMs) {
                const leftPx = ((start.getTime() - timelineStartMs) / (1000 * 60 * 60 * 24)) * MINI_DAY_WIDTH;
                const widthPx = ((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) * MINI_DAY_WIDTH;
                mappedJobs.push({
                    ...job, drawStart: start, drawEnd: end,
                    leftPx: Math.max(0, leftPx),
                    widthPx: leftPx < 0 ? widthPx + leftPx : widthPx,
                    color: job.status === DESIGN_JOB_STATUS.IN_PROGRESS ? 'bg-green-500' : TASK_COLORS[colorIndex % TASK_COLORS.length]
                });
                if (job.status !== DESIGN_JOB_STATUS.IN_PROGRESS) colorIndex++;
            }
        });
        return mappedJobs;
    }, [myJobs, miniBaseDate, timelineStartMs, timelineEndMs]);

    const miniPrevWeek = () => { const d = new Date(miniBaseDate); d.setDate(d.getDate() - 7); setMiniBaseDate(d); };
    const miniNextWeek = () => { const d = new Date(miniBaseDate); d.setDate(d.getDate() + 7); setMiniBaseDate(d); };
    const miniToday = () => { const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate() - 1); setMiniBaseDate(d); };

    // --- AYLIK TAKVİM HESAPLAMALARI ---
    const calendarDays = useMemo(() => {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        const firstDayOfMonth = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const startOffset = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1; 

        const days = [];
        for (let i = 0; i < startOffset; i++) { days.push(null); }
        for (let i = 1; i <= daysInMonth; i++) {
            const dateObj = new Date(year, month, i);
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
            const jobsEndingToday = myJobs.filter(j => j.deadlineDate === dateStr);
            days.push({ day: i, dateStr, dateObj, jobs: jobsEndingToday });
        }
        return days;
    }, [currentDate, myJobs]);

    const prevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
    const nextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));

    // --- MANUEL İŞ EKLEME FONKSİYONU ---
    const handleAddManualTask = async () => {
        if (!manualProjectId || !manualEstimatedHours || !manualTaskType) {
            return alert("Lütfen proje seçin, iş türü belirleyin ve tahmini süre girin!");
        }
        setIsSaving(true);
        try {
            const maxOrderIndex = myJobs.length > 0 ? Math.max(...myJobs.map(j => j.orderIndex || 0)) : 0;
            const relatedProject = projects.find(p => p.id === manualProjectId);

            await addDoc(collection(db, DESIGN_JOBS_COLLECTION), {
                projectId: manualProjectId,
                projectName: manualProjectName,
                customer: relatedProject?.customer || '',
                taskType: manualTaskType,
                estimatedHours: parseFloat(manualEstimatedHours),
                managerNote: manualNote ? `(Kendisi Ekledi) ${manualNote}` : '(Tasarımcı Kendisi Ekledi)',
                deadlineDate: null,
                status: DESIGN_JOB_STATUS.ASSIGNED, 
                assignedDesigner: loggedInUser.name,
                createdBy: loggedInUser.name,
                createdAt: getCurrentDateTimeString(),
                orderIndex: maxOrderIndex + 1 
            });

            setManualModalOpen(false);
            setManualProjectId(''); setManualProjectName(''); setManualEstimatedHours(''); setManualNote(''); setManualTaskType(DESIGN_TASK_TYPES.REVISION);
        } catch (error) { console.error("Hata:", error); alert("İş eklenemedi."); } finally { setIsSaving(false); }
    };

    const handleAction = async (job, actionType, pauseData = null) => {
        if (!db) return;
        setIsSaving(true);
        const jobRef = doc(db, DESIGN_JOBS_COLLECTION, job.id);
        const now = getCurrentDateTimeString();
        let updates = {};

        try {
            if (actionType === 'START' || actionType === 'RESUME') {
                updates.status = DESIGN_JOB_STATUS.IN_PROGRESS;
                const sessions = job.workSessions ? [...job.workSessions] : [];
                sessions.push({ startTime: now, endTime: null });
                updates.workSessions = sessions;
                if (actionType === 'RESUME' && job.pauseHistory) {
                    const pauses = [...job.pauseHistory];
                    if (pauses.length > 0 && !pauses[pauses.length - 1].resumedAt) pauses[pauses.length - 1].resumedAt = now;
                    updates.pauseHistory = pauses;
                }
            } 
            else if (actionType === 'PAUSE') {
                updates.status = DESIGN_JOB_STATUS.PAUSED;
                const sessions = job.workSessions ? [...job.workSessions] : [];
                if (sessions.length > 0 && !sessions[sessions.length - 1].endTime) sessions[sessions.length - 1].endTime = now;
                updates.workSessions = sessions;
                const pauses = job.pauseHistory ? [...job.pauseHistory] : [];
                pauses.push({
                    pausedAt: now, resumedAt: null, reason: pauseData.reason,
                    projectId: pauseData.projectId, projectName: pauseData.projectName, note: pauseData.note
                });
                updates.pauseHistory = pauses;
            } 
            else if (actionType === 'COMPLETE') {
                if (!window.confirm('Bu tasarım işini tamamen bitirdiğinizi onaylıyor musunuz?')) { setIsSaving(false); return; }
                updates.status = DESIGN_JOB_STATUS.COMPLETED;
                const sessions = job.workSessions ? [...job.workSessions] : [];
                if (sessions.length > 0 && !sessions[sessions.length - 1].endTime) sessions[sessions.length - 1].endTime = now;
                updates.workSessions = sessions;
                updates.completedAt = now;
            }
            await updateDoc(jobRef, updates);
        } catch (error) { console.error("İşlem hatası:", error); alert("İşlem kaydedilemedi."); } 
        finally { setIsSaving(false); if (actionType === 'PAUSE') closePauseModal(); }
    };

    const openPauseModal = (job) => {
        setSelectedJob(job); setPauseReason(DESIGN_ACTIVITY_TYPES.MOLD_TRIAL); setPauseProjectId(''); setPauseProjectName(''); setPauseNote(''); setPauseModalOpen(true);
    };
    const closePauseModal = () => { setPauseModalOpen(false); setSelectedJob(null); };
    const submitPause = () => {
        if (!pauseProjectId) return alert("Lütfen bölündüğünüz iş için bir kalıp/proje seçin.");
        handleAction(selectedJob, 'PAUSE', { reason: pauseReason, projectId: pauseProjectId, projectName: pauseProjectName, note: pauseNote });
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });
    };

    return (
        <div className="p-4 max-w-6xl mx-auto space-y-6">
            
            {/* 1. ÜST KOKPİT (TIMELINE VE TAKVİM) */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* SOL: YENİ GRAFİKSEL KİŞİSEL TIMELINE */}
                <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col h-[340px]">
                    <div className="p-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 flex items-center justify-between">
                        <h3 className="font-bold text-gray-800 dark:text-white flex items-center text-sm">
                            <ListOrdered className="w-4 h-4 mr-2 text-indigo-500" /> Kişisel İş Çizelgem
                        </h3>
                        <div className="flex items-center gap-1">
                            <button onClick={miniPrevWeek} className="p-1 bg-white dark:bg-gray-700 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 border border-gray-200 dark:border-gray-600 rounded text-gray-600 dark:text-gray-300 transition"><ChevronLeft className="w-4 h-4" /></button>
                            <button onClick={miniToday} className="px-2 py-1 text-xs font-bold bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400 rounded transition">Bugün</button>
                            <button onClick={miniNextWeek} className="p-1 bg-white dark:bg-gray-700 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 border border-gray-200 dark:border-gray-600 rounded text-gray-600 dark:text-gray-300 transition"><ChevronRight className="w-4 h-4" /></button>
                        </div>
                    </div>
                    
                    <div className="flex-1 overflow-x-auto overflow-y-auto bg-gray-50 dark:bg-gray-900/50 relative p-4">
                        <div className="relative min-w-max">
                            {/* Günler Başlığı */}
                            <div className="flex border-b border-gray-200 dark:border-gray-700 mb-4 pb-2" style={{ width: `${MINI_DAYS_TO_SHOW * MINI_DAY_WIDTH}px` }}>
                                {miniDays.map((day, idx) => {
                                    const isWknd = day.getDay() === 0 || day.getDay() === 6;
                                    const isHol = isHoliday(day);
                                    const isToday = day.toDateString() === new Date().toDateString();
                                    
                                    return (
                                        <div key={idx} className={`flex-shrink-0 flex flex-col items-center justify-center border-l border-gray-200 dark:border-gray-700 ${isWknd || isHol ? 'bg-red-50/50 dark:bg-red-900/10' : ''}`} style={{ width: `${MINI_DAY_WIDTH}px` }}>
                                            <span className={`text-[10px] font-bold uppercase ${(isWknd || isHol) ? 'text-red-500' : 'text-gray-500'}`}>{day.toLocaleDateString('tr-TR', { weekday: 'short' })}</span>
                                            <span className={`text-sm font-black ${isToday ? 'text-blue-600 dark:text-blue-400' : 'text-gray-800 dark:text-gray-200'}`}>{day.getDate()} {day.toLocaleDateString('tr-TR', { month: 'short' })}</span>
                                            {isHol && <span className="text-[8px] text-red-500 font-bold mt-0.5">TATİL</span>}
                                        </div>
                                    );
                                })}
                            </div>

                            {/* İş Blokları (Üst Üste) */}
                            <div className="relative" style={{ height: `${Math.max(timelineData.length * 45, 150)}px`, width: `${MINI_DAYS_TO_SHOW * MINI_DAY_WIDTH}px` }}>
                                {/* Arka plan çizgileri */}
                                <div className="absolute inset-0 flex pointer-events-none">
                                    {miniDays.map((day, idx) => (
                                        <div key={idx} className={`h-full border-l border-dashed border-gray-200 dark:border-gray-700/50 ${(day.getDay() === 0 || day.getDay() === 6 || isHoliday(day)) ? 'bg-red-50/30 dark:bg-red-900/5' : ''}`} style={{ width: `${MINI_DAY_WIDTH}px` }} />
                                    ))}
                                </div>

                                {timelineData.length === 0 ? (
                                    <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm">Şu an çizelgede iş yok.</div>
                                ) : (
                                    timelineData.map((job, idx) => (
                                        <div 
                                            key={job.id}
                                            className={`absolute h-8 rounded-md shadow-sm border border-white/20 dark:border-gray-800/50 flex flex-col justify-center px-2 overflow-hidden hover:z-10 hover:shadow-md transition-shadow cursor-default text-white ${job.color}`}
                                            style={{ top: `${idx * 40}px`, left: `${job.leftPx}px`, width: `${job.widthPx}px`, minWidth: '40px' }}
                                            title={`${job.projectName}\nBaşlangıç: ${job.drawStart.toLocaleString('tr-TR')}\nBitiş: ${job.drawEnd.toLocaleString('tr-TR')}\nSüre: ${job.estimatedHours} Saat`}
                                        >
                                            <div className="font-bold text-[10px] truncate leading-tight">{job.projectName}</div>
                                        </div>
                                    ))
                                )}

                                {/* Şu an çizgisi */}
                                {(() => {
                                    const now = new Date();
                                    if (now.getTime() >= timelineStartMs && now.getTime() <= timelineEndMs) {
                                        const nowLeft = ((now.getTime() - timelineStartMs) / (1000 * 60 * 60 * 24)) * MINI_DAY_WIDTH;
                                        return (
                                            <div className="absolute top-0 bottom-0 border-l-2 border-red-500 z-10 pointer-events-none" style={{ left: `${nowLeft}px` }}>
                                                <div className="absolute top-0 -left-2 bg-red-500 text-white text-[8px] font-bold px-1 rounded">ŞU AN</div>
                                            </div>
                                        );
                                    }
                                    return null;
                                })()}
                            </div>
                        </div>
                    </div>
                </div>

                {/* SAĞ: AYLIK TAKVİM (OK TUŞLARI BELİRGİNLEŞTİRİLDİ VE TATİLLER EKLENDİ) */}
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col h-[340px]">
                    <div className="p-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 flex items-center justify-between">
                        <button onClick={prevMonth} className="p-2 bg-white dark:bg-gray-700 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 hover:text-indigo-600 dark:hover:text-indigo-400 border border-gray-200 dark:border-gray-600 rounded-lg shadow-sm transition"><ChevronLeft className="w-5 h-5" /></button>
                        <h3 className="font-bold text-gray-800 dark:text-white flex items-center text-sm capitalize">
                            <CalendarDays className="w-5 h-5 mr-2 text-red-500" /> 
                            {currentDate.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })}
                        </h3>
                        <button onClick={nextMonth} className="p-2 bg-white dark:bg-gray-700 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 hover:text-indigo-600 dark:hover:text-indigo-400 border border-gray-200 dark:border-gray-600 rounded-lg shadow-sm transition"><ChevronRight className="w-5 h-5" /></button>
                    </div>
                    <div className="p-4 flex-1 flex flex-col">
                        <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-gray-400 mb-2">
                            <div>Pzt</div><div>Sal</div><div>Çar</div><div>Per</div><div>Cum</div><div>Cmt</div><div>Paz</div>
                        </div>
                        <div className="grid grid-cols-7 gap-1 flex-1 content-start">
                            {calendarDays.map((item, idx) => {
                                if (!item) return <div key={idx} className="h-10"></div>;
                                
                                const hasDeadline = item.jobs.length > 0;
                                const isToday = item.dateStr === new Date().toISOString().split('T')[0];
                                const hol = isHoliday(item.dateObj);
                                const isWknd = item.dateObj.getDay() === 0 || item.dateObj.getDay() === 6;

                                return (
                                    <div key={idx} className="relative flex justify-center items-center h-10 group cursor-default">
                                        <div className={`w-8 h-8 flex items-center justify-center rounded-full text-xs font-bold transition
                                            ${hasDeadline ? 'bg-red-500 text-white shadow-md shadow-red-200 dark:shadow-none transform scale-110 z-10' : ''}
                                            ${!hasDeadline && (hol || isWknd) ? 'text-red-400 bg-red-50 dark:bg-red-900/20' : ''}
                                            ${!hasDeadline && !(hol || isWknd) && isToday ? 'bg-blue-100 text-blue-700 border border-blue-300 dark:bg-blue-900/50 dark:text-blue-300 dark:border-blue-700' : ''}
                                            ${!hasDeadline && !(hol || isWknd) && !isToday ? 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700' : ''}
                                        `}>
                                            {item.day}
                                        </div>
                                        
                                        {(hasDeadline || hol) && (
                                            <div className="absolute bottom-full mb-1 left-1/2 transform -translate-x-1/2 w-48 bg-gray-900 text-white text-[10px] p-2 rounded opacity-0 group-hover:opacity-100 pointer-events-none transition z-50 shadow-lg border border-gray-700">
                                                {hasDeadline && (
                                                    <>
                                                        <div className="font-bold text-red-400 mb-1 border-b border-gray-700 pb-1">Teslim Edilecek İşler:</div>
                                                        {item.jobs.map(j => <div key={j.id} className="truncate">• {j.projectName}</div>)}
                                                    </>
                                                )}
                                                {hol && <div className={`font-bold ${hasDeadline ? 'mt-2 pt-1 border-t border-gray-700' : ''} text-orange-400`}>⭐ Resmi / Dini Tatil</div>}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

            </div>

            {/* 2. İŞ KUYRUĞU VE YENİ İŞ EKLE BUTONU */}
            <div className="mb-4 mt-6 border-l-4 border-indigo-500 pl-4 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
                <div>
                    <h2 className="text-xl font-bold text-gray-800 dark:text-white">İş Kuyruğum</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Sıranızdaki işler. Plan dışı bir iş geldiğinde sağdan ekleyebilirsiniz.</p>
                </div>
                <div className="flex items-center gap-3">
                    <button 
                        onClick={() => setManualModalOpen(true)}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold text-sm shadow-md transition flex items-center"
                    >
                        <Plus className="w-4 h-4 mr-2" /> Plan Dışı İş Ekle
                    </button>
                    <div className="hidden sm:block px-4 py-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-300 rounded-lg font-bold text-sm border border-indigo-100 dark:border-indigo-800">
                        Bekleyen: {myJobs.length}
                    </div>
                </div>
            </div>

            {myJobs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 text-center px-4">
                    <Briefcase className="w-16 h-16 text-gray-300 dark:text-gray-600 mb-4" />
                    <h3 className="text-xl font-bold text-gray-700 dark:text-gray-300 mb-2">Harika, iş kalmamış!</h3>
                    <p className="text-gray-500 dark:text-gray-500">Şu anda sıranızda bekleyen veya devam eden bir tasarım görevi bulunmuyor.</p>
                </div>
            ) : (
                <div className="flex flex-col gap-4">
                    {myJobs.map((job, idx) => {
                        const isRunning = job.status === DESIGN_JOB_STATUS.IN_PROGRESS;
                        const isPaused = job.status === DESIGN_JOB_STATUS.PAUSED;

                        return (
                            <div key={job.id} className={`bg-white dark:bg-gray-800 rounded-xl shadow-md border overflow-hidden flex flex-col md:flex-row transition-all duration-200 ${isRunning ? 'border-green-500 ring-2 ring-green-500/20 transform scale-[1.01]' : isPaused ? 'border-orange-400 opacity-90' : 'border-gray-200 dark:border-gray-700 hover:border-indigo-300'}`}>
                                {/* SOL KISIM */}
                                <div className="p-5 flex-1 flex flex-col sm:flex-row items-start sm:items-center gap-5">
                                    <div className={`flex-shrink-0 w-14 h-14 rounded-full flex items-center justify-center text-xl font-black shadow-inner border-4 ${isRunning ? 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/50 dark:text-green-300 dark:border-green-800' : isPaused ? 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/50 dark:text-orange-300 dark:border-orange-800' : 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600'}`}>
                                        {idx + 1}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-3 mb-1.5 flex-wrap">
                                            <h3 className="text-lg sm:text-xl font-extrabold text-gray-900 dark:text-white truncate">{job.projectName}</h3>
                                            <span className="text-[10px] font-bold px-2.5 py-1 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded border border-indigo-100 dark:border-indigo-800">{job.taskType}</span>
                                            {isRunning && <span className="flex items-center text-[10px] font-bold text-green-700 bg-green-100 px-2.5 py-1 rounded border border-green-200 animate-pulse"><Activity className="w-3 h-3 mr-1" /> ÇALIŞIYOR</span>}
                                            {isPaused && <span className="flex items-center text-[10px] font-bold text-orange-700 bg-orange-100 px-2.5 py-1 rounded border border-orange-200"><PauseCircle className="w-3 h-3 mr-1" /> DURAKLATILDI</span>}
                                        </div>
                                        {job.customer && <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">{job.customer}</p>}
                                        {job.managerNote && (
                                            <div className={`text-xs text-gray-700 dark:text-gray-300 p-2.5 rounded border flex items-start mt-2 ${job.managerNote.includes('Manuel') ? 'bg-indigo-50 border-indigo-200 dark:bg-indigo-900/20' : 'bg-yellow-50 border-yellow-200 dark:bg-yellow-900/20'}`}>
                                                <AlertTriangle className={`w-4 h-4 mr-2 flex-shrink-0 ${job.managerNote.includes('Manuel') ? 'text-indigo-600' : 'text-yellow-600'}`} />
                                                <div><span className="font-bold mr-1">{job.managerNote.includes('Manuel') ? 'Tasarımcı Notu:' : 'Yönetici Notu:'}</span><span className="italic">{job.managerNote}</span></div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* SAĞ KISIM */}
                                <div className="bg-gray-50 dark:bg-gray-900/50 md:w-64 border-t md:border-t-0 md:border-l border-gray-200 dark:border-gray-700 p-5 flex flex-col justify-center">
                                    <div className="flex flex-col gap-2 mb-4 pb-3 border-b border-gray-200 dark:border-gray-700">
                                        <div className="flex justify-between items-center">
                                            <span className="text-xs font-bold text-gray-500 dark:text-gray-400 flex items-center"><Clock className="w-4 h-4 mr-1" /> Hedef Süre</span>
                                            <span className="text-base font-black text-indigo-600 dark:text-indigo-400">{job.estimatedHours} Saat</span>
                                        </div>
                                        {job.deadlineDate && (
                                            <div className="flex justify-between items-center bg-red-50 dark:bg-red-900/20 p-1.5 rounded border border-red-100 dark:border-red-800/50">
                                                <span className="text-[10px] font-bold text-red-600 dark:text-red-400 flex items-center"><CalendarIcon className="w-3 h-3 mr-1" /> Termin</span>
                                                <span className="text-xs font-bold text-red-700 dark:text-red-300">{formatDate(job.deadlineDate)}</span>
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex flex-col gap-2">
                                        {job.status === DESIGN_JOB_STATUS.ASSIGNED || job.status === DESIGN_JOB_STATUS.POOL ? (
                                            <button onClick={() => handleAction(job, 'START')} disabled={isSaving} className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-lg transition flex justify-center items-center shadow-md">
                                                <PlayCircle className="w-4 h-4 mr-2" /> İşe Başla
                                            </button>
                                        ) : null}
                                        {isRunning && (
                                            <>
                                                <button onClick={() => openPauseModal(job)} disabled={isSaving} className="w-full py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold rounded-lg transition flex justify-center items-center shadow-md">
                                                    <PauseCircle className="w-4 h-4 mr-2" /> Duraklat
                                                </button>
                                                <button onClick={() => handleAction(job, 'COMPLETE')} disabled={isSaving} className="w-full py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-bold rounded-lg transition flex justify-center items-center shadow-md">
                                                    <CheckCircle className="w-4 h-4 mr-2" /> İşi Bitir
                                                </button>
                                            </>
                                        )}
                                        {isPaused && (
                                            <button onClick={() => handleAction(job, 'RESUME')} disabled={isSaving} className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-lg transition flex justify-center items-center shadow-md">
                                                <PlayCircle className="w-4 h-4 mr-2" /> Devam Et
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* DURAKLATMA MODALI */}
            {pauseModalOpen && selectedJob && (
                <Modal isOpen={pauseModalOpen} onClose={closePauseModal} title="İşi Duraklat / Bölünme Bildir">
                    <div className="space-y-5">
                        <div className="bg-orange-50 dark:bg-orange-900/20 p-3 rounded-lg border border-orange-100 dark:border-orange-800">
                            <p className="text-sm text-orange-800 dark:text-orange-300"><strong>{selectedJob.projectName}</strong> işini duraklatıyorsunuz. Lütfen araya giren işin detayını belirtin.</p>
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Bölünme Nedeni</label>
                            <select value={pauseReason} onChange={(e) => setPauseReason(e.target.value)} className="w-full p-3 border rounded-lg bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:text-white outline-none focus:ring-2 focus:ring-orange-500 font-semibold">
                                {Object.values(DESIGN_ACTIVITY_TYPES).map(type => <option key={type} value={type}>{type}</option>)}
                            </select>
                        </div>
                        
                        <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Hangi Kalıp / Proje İçin Bölündünüz?</label>
                        <SearchableProjectSelect projects={projects} value={pauseProjectId} onChange={(id, name) => { setPauseProjectId(id); setPauseProjectName(name); }} />
                        
                        <div>
                            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Açıklama / Detay</label>
                            <textarea value={pauseNote} onChange={(e) => setPauseNote(e.target.value)} placeholder="Örn: T0 baskısı için preshaneye iniyorum..." className="w-full p-3 border rounded-lg bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:text-white outline-none focus:ring-2 focus:ring-orange-500 resize-none h-24 text-sm" />
                        </div>
                        <div className="pt-4 flex justify-end gap-3">
                            <button onClick={closePauseModal} className="px-5 py-2.5 text-gray-600 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 rounded-lg font-medium transition">İptal</button>
                            <button onClick={submitPause} disabled={isSaving || !pauseProjectId} className="px-5 py-2.5 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-lg shadow-md transition flex items-center disabled:opacity-50">
                                <PauseCircle className="w-5 h-5 mr-2" /> {isSaving ? 'Kaydediliyor...' : 'Duraklat'}
                            </button>
                        </div>
                    </div>
                </Modal>
            )}

            {/* YENİ: MANUEL İŞ EKLEME MODALI */}
            {manualModalOpen && (
                <Modal isOpen={manualModalOpen} onClose={() => setManualModalOpen(false)} title="Kendi Kuyruğuma İş Ekle">
                    <div className="space-y-4">
                        <div className="bg-indigo-50 dark:bg-indigo-900/20 p-3 rounded-lg border border-indigo-100 dark:border-indigo-800">
                            <p className="text-sm text-indigo-800 dark:text-indigo-300">
                                Plan dışı gelişen işlerinizi buradan kendi sıranıza ekleyebilirsiniz. Eklediğiniz işler anında timeline (zaman çizelgesi) üzerinde de görünür olacaktır.
                            </p>
                        </div>
                        
                        <div>
                            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Hangi Kalıp / Proje İçin?</label>
                            <SearchableProjectSelect projects={projects} value={manualProjectId} onChange={(id, name) => { setManualProjectId(id); setManualProjectName(name); }} />
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Tasarım İşinin Türü</label>
                            <select value={manualTaskType} onChange={(e) => setManualTaskType(e.target.value)} className="w-full p-3 border rounded-lg bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 font-semibold">
                                {Object.values(DESIGN_TASK_TYPES).map(type => <option key={type} value={type}>{type}</option>)}
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Tahmini Süre (Saat)</label>
                            <p className="text-[10px] text-gray-500 mb-2">Timeline çizilebilmesi için tahmini bir süre girmelisiniz.</p>
                            <div className="relative">
                                <input type="number" placeholder="Örn: 2" className="w-full p-3 pl-10 border-2 border-indigo-100 dark:border-gray-600 rounded-lg text-lg font-bold focus:border-indigo-500 outline-none dark:bg-gray-700 dark:text-white" value={manualEstimatedHours} onChange={(e) => setManualEstimatedHours(e.target.value)} />
                                <Clock className="absolute left-3 top-3.5 text-indigo-400 w-5 h-5" />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Açıklama / Detay</label>
                            <textarea value={manualNote} onChange={(e) => setManualNote(e.target.value)} placeholder="Örn: Üretimden gelen talep üzerine maça revizyonu..." className="w-full p-3 border rounded-lg bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 resize-none h-24 text-sm" />
                        </div>

                        <div className="pt-4 flex justify-end gap-3 border-t dark:border-gray-700">
                            <button onClick={() => setManualModalOpen(false)} className="px-5 py-2.5 text-gray-600 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 rounded-lg font-medium transition">İptal</button>
                            <button onClick={handleAddManualTask} disabled={isSaving || !manualProjectId || !manualEstimatedHours} className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-md transition flex items-center disabled:opacity-50">
                                <Plus className="w-5 h-5 mr-2" /> {isSaving ? 'Ekleniyor...' : 'Sırama Ekle'}
                            </button>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
};

export default DesignMyTasks;