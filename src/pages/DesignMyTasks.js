// src/pages/DesignMyTasks.js

import React, { useState, useMemo, useEffect } from 'react';
import { PlayCircle, PauseCircle, CheckCircle, Clock, Search, ChevronDown, AlertTriangle, Briefcase, Activity, ListOrdered, CalendarDays, Calendar as CalendarIcon, ChevronLeft, ChevronRight, Plus, ShieldCheck, Timer, Settings } from 'lucide-react';
import { doc, updateDoc, addDoc, collection } from '../config/firebase.js';
import { DESIGN_JOBS_COLLECTION, DESIGN_JOB_STATUS, DESIGN_ACTIVITY_TYPES, DESIGN_TASK_TYPES } from '../config/constants.js';
import { getCurrentDateTimeString } from '../utils/dateUtils.js';
import Modal from '../components/Modals/Modal.js';
import ManageDesignTaskTypesModal from '../components/Modals/ManageDesignTaskTypesModal.js';

// --- RESMİ TATİLLER VE MESAİ ALGORİTMASI ---
const PUBLIC_HOLIDAYS = ["01-01", "04-23", "05-01", "05-19", "07-15", "08-30", "10-29"];
const RELIGIOUS_HOLIDAYS_2026 = ["2026-03-20", "2026-03-21", "2026-03-22", "2026-05-27", "2026-05-28", "2026-05-29", "2026-05-30"];

const isHoliday = (date) => {
    const mmdd = `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const yyyymmdd = date.toISOString().split('T')[0];
    return PUBLIC_HOLIDAYS.includes(mmdd) || RELIGIOUS_HOLIDAYS_2026.includes(yyyymmdd);
};

const TASK_COLORS = ['bg-blue-500', 'bg-purple-500', 'bg-pink-500', 'bg-teal-500', 'bg-cyan-600', 'bg-indigo-500'];

const addWorkingHours = (startDate, hoursToAdd, autoPause = true, designConfig = {}) => {
    const workStart = designConfig.workStartHour ?? 8;
    const workEnd = designConfig.workEndHour ?? 18;

    if (!autoPause) {
        return new Date(startDate.getTime() + hoursToAdd * 60 * 60 * 1000);
    }
    let currentDate = new Date(startDate.getTime());
    let remainingMinutes = hoursToAdd * 60;
    
    if (currentDate.getHours() < workStart) currentDate.setHours(workStart, 0, 0, 0);
    else if (currentDate.getHours() >= workEnd) { currentDate.setDate(currentDate.getDate() + 1); currentDate.setHours(workStart, 0, 0, 0); }
    
    const skipNonWorkingDays = () => {
        while (currentDate.getDay() === 0 || currentDate.getDay() === 6 || isHoliday(currentDate)) { 
            currentDate.setDate(currentDate.getDate() + 1); 
            currentDate.setHours(workStart, 0, 0, 0); 
        }
    };

    skipNonWorkingDays();

    while (remainingMinutes > 0) {
        let minutesToEOD = (workEnd * 60) - (currentDate.getHours() * 60 + currentDate.getMinutes());
        if (remainingMinutes <= minutesToEOD) { 
            currentDate.setMinutes(currentDate.getMinutes() + remainingMinutes); 
            remainingMinutes = 0; 
        } 
        else {
            remainingMinutes -= minutesToEOD; 
            currentDate.setDate(currentDate.getDate() + 1); 
            currentDate.setHours(workStart, 0, 0, 0);
            skipNonWorkingDays();
        }
    }
    return currentDate;
};

const getWorkingHoursBetween = (startD, endD, designConfig = {}) => {
    const workStart = designConfig.workStartHour ?? 8;
    const workEnd = designConfig.workEndHour ?? 18;

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

    let totalHours = 0;
    let current = new Date(startD);

    while (current < endD) {
        if (current.getDay() === 0 || current.getDay() === 6 || isHoliday(current)) {
            current.setDate(current.getDate() + 1);
            current.setHours(0, 0, 0, 0);
            continue;
        }
        let h = current.getHours();
        if (h < workStart) {
            current.setHours(workStart, 0, 0, 0);
            continue;
        }
        if (h >= workEnd) {
            current.setDate(current.getDate() + 1);
            current.setHours(0, 0, 0, 0);
            continue;
        }

        let eod = new Date(current);
        eod.setHours(workEnd, 0, 0, 0);
        let targetEnd = (eod < endD) ? eod : endD;

        let intervalHours = (targetEnd - current) / (1000 * 60 * 60);

        // TÜM DİNAMİK MOLALARIN KESİNTİSİ (Çay molaları, yemek molası vb.)
        activeBreaks.forEach(b => {
            const [bStartH, bStartM] = (b.start || "12:00").split(':').map(Number);
            const [bEndH, bEndM] = (b.end || "13:00").split(':').map(Number);

            const bStartObj = new Date(current);
            bStartObj.setHours(bStartH || 0, bStartM || 0, 0, 0);
            const bEndObj = new Date(current);
            bEndObj.setHours(bEndH || 0, bEndM || 0, 0, 0);

            const overlapStart = new Date(Math.max(current.getTime(), bStartObj.getTime()));
            const overlapEnd = new Date(Math.min(targetEnd.getTime(), bEndObj.getTime()));

            if (overlapStart < overlapEnd) {
                const bOverlapHours = (overlapEnd - overlapStart) / (1000 * 60 * 60);
                intervalHours -= bOverlapHours;
            }
        });

        totalHours += Math.max(0, intervalHours);
        current = new Date(targetEnd);
    }
    return totalHours;
};

const getSpentHours = (job, currentTime, designConfig = {}) => {
    if (!job.workSessions || job.workSessions.length === 0) return 0;
    let totalHours = 0;
    const autoPause = job.autoPause !== false;
    const isPaused = job.status === DESIGN_JOB_STATUS.PAUSED;
    const lastPauseTimeStr = isPaused && job.pauseHistory && job.pauseHistory.length > 0 
        ? job.pauseHistory[job.pauseHistory.length - 1].pausedAt 
        : null;

    job.workSessions.forEach(session => {
        if (!session.startTime) return;
        const start = new Date(session.startTime);
        
        let end;
        if (session.endTime) {
            end = new Date(session.endTime);
        } else if (isPaused && lastPauseTimeStr) {
            end = new Date(lastPauseTimeStr);
        } else if (isPaused) {
            end = new Date(job.updatedAt || session.startTime);
        } else {
            end = currentTime;
        }
        
        if (start >= end) return;

        if (!autoPause) {
            totalHours += (end - start) / (1000 * 60 * 60); 
        } else {
            totalHours += getWorkingHoursBetween(start, end, designConfig); 
        }
    });
    return totalHours;
};

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

const DesignMyTasks = ({ db, designJobs, projects, loggedInUser, taskTypes = [], designConfig = {} }) => {
    const workStart = designConfig.workStartHour ?? 8;
    const workEnd = designConfig.workEndHour ?? 18;

    const [pauseModalOpen, setPauseModalOpen] = useState(false);
    const [selectedJob, setSelectedJob] = useState(null);
    const [pauseReason, setPauseReason] = useState(DESIGN_ACTIVITY_TYPES.OTHER);
    const [pauseProjectId, setPauseProjectId] = useState('');
    const [pauseProjectName, setPauseProjectName] = useState('');
    const [pauseNote, setPauseNote] = useState('');
    
    // İŞ BİTİRME (TAMAMLAMA) MODALI STATE'LERİ
    const [completeModalOpen, setCompleteModalOpen] = useState(false);
    const [completeJob, setCompleteJob] = useState(null);
    const [completionNote, setCompletionNote] = useState('');

    // DİNAMİK TÜRLER MODALI STATE'İ
    const [isTypeManagerOpen, setIsTypeManagerOpen] = useState(false);
    
    const [manualModalOpen, setManualModalOpen] = useState(false);
    const [manualProjectId, setManualProjectId] = useState('');
    const [manualProjectName, setManualProjectName] = useState('');
    const [manualTaskType, setManualTaskType] = useState(() => {
        if (taskTypes.length > 0) return typeof taskTypes[0] === 'string' ? taskTypes[0] : taskTypes[0].name;
        return 'KALIP TASARIM';
    });
    const [manualEstimatedHours, setManualEstimatedHours] = useState('');
    const [manualNote, setManualNote] = useState('');

    const [isSaving, setIsSaving] = useState(false);
    
    const [currentDate, setCurrentDate] = useState(new Date());
    const [now, setNow] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => {
            setNow(new Date());
        }, 60000);
        return () => clearInterval(timer);
    }, []);

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
        let currentPointer = new Date(now); 
        if (currentPointer.getHours() < workStart) currentPointer.setHours(workStart, 0, 0, 0);
        if (currentPointer.getHours() >= workEnd) { currentPointer.setDate(currentPointer.getDate() + 1); currentPointer.setHours(workStart, 0, 0, 0); }

        const mappedJobs = [];
        let colorIndex = 0;

        myJobs.forEach((job) => {
            let start, end;
            const estimatedHours = parseFloat(job.estimatedHours) || 0;
            const autoPause = job.autoPause !== false; 

            if (job.status === DESIGN_JOB_STATUS.IN_PROGRESS) {
                const firstSession = job.workSessions?.[0]?.startTime;
                start = firstSession ? new Date(firstSession) : new Date(currentPointer);
                end = addWorkingHours(start, estimatedHours, autoPause, designConfig);
                currentPointer = new Date(Math.max(now.getTime(), end.getTime()));
            } else {
                start = new Date(currentPointer);
                end = addWorkingHours(start, estimatedHours, autoPause, designConfig);
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
    }, [myJobs, miniBaseDate, timelineStartMs, timelineEndMs, now, workStart, workEnd, designConfig]);

    const miniPrevWeek = () => { const d = new Date(miniBaseDate); d.setDate(d.getDate() - 7); setMiniBaseDate(d); };
    const miniNextWeek = () => { const d = new Date(miniBaseDate); d.setDate(d.getDate() + 7); setMiniBaseDate(d); };
    const miniToday = () => { const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate() - 1); setMiniBaseDate(d); };

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

    const handleToggleAutoPause = async (job, isChecked) => {
        if (!db) return;
        try {
            const jobRef = doc(db, DESIGN_JOBS_COLLECTION, job.id);
            await updateDoc(jobRef, { autoPause: isChecked });
        } catch (error) {
            console.error("Otomatik kesinti ayarı güncellenemedi:", error);
            alert("Ayar kaydedilemedi.");
        }
    };

    const handleAddManualTask = async () => {
        if (!manualEstimatedHours || !manualTaskType) {
            return alert("Lütfen iş türü belirleyin ve tahmini süre girin!");
        }

        if (manualTaskType !== DESIGN_TASK_TYPES.OTHER && manualTaskType !== DESIGN_TASK_TYPES.ANALYSIS && !manualProjectId) {
            return alert("Lütfen proje seçin! (Sadece 'DİĞER' veya 'ANALİZ' seçeneğinde proje seçimi zorunlu değildir)");
        }

        if ((manualTaskType === DESIGN_TASK_TYPES.OTHER || manualTaskType === DESIGN_TASK_TYPES.ANALYSIS) && !manualProjectId && !manualNote.trim()) {
            return alert("Lütfen bağımsız işler için açıklama/detay yazın!");
        }

        setIsSaving(true);
        try {
            const maxOrderIndex = myJobs.length > 0 ? Math.max(...myJobs.map(j => j.orderIndex || 0)) : 0;
            const relatedProject = manualProjectId ? projects.find(p => p.id === manualProjectId) : null;
            
            const finalProjectName = manualProjectId 
                ? manualProjectName 
                : 'Bağımsız İş (Proje Seçilmedi)';

            await addDoc(collection(db, DESIGN_JOBS_COLLECTION), {
                projectId: manualProjectId || '',
                projectName: finalProjectName,
                customer: relatedProject?.customer || '',
                taskType: manualTaskType,
                estimatedHours: parseFloat(manualEstimatedHours),
                managerNote: manualNote ? `(Kendisi Ekledi) ${manualNote}` : '(Tasarımcı Kendisi Ekledi)',
                deadlineDate: null,
                status: DESIGN_JOB_STATUS.ASSIGNED, 
                assignedDesigner: loggedInUser.name,
                createdBy: loggedInUser.name,
                createdAt: getCurrentDateTimeString(),
                autoPause: true, 
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
        const timeNow = getCurrentDateTimeString();
        let updates = {};

        try {
            if (actionType === 'START' || actionType === 'RESUME') {
                // TEK AKTİF İŞ KURALI: Tasarımcının diğer açık işlerini otomatik duraklat
                const otherActiveJobs = myJobs.filter(j => j.id !== job.id && j.status === DESIGN_JOB_STATUS.IN_PROGRESS);
                for (const activeJob of otherActiveJobs) {
                    try {
                        const aRef = doc(db, DESIGN_JOBS_COLLECTION, activeJob.id);
                        const aSessions = activeJob.workSessions ? [...activeJob.workSessions] : [];
                        if (aSessions.length > 0 && !aSessions[aSessions.length - 1].endTime) {
                            aSessions[aSessions.length - 1].endTime = timeNow;
                        }
                        const aPauses = activeJob.pauseHistory ? [...activeJob.pauseHistory] : [];
                        aPauses.push({
                            pausedAt: timeNow,
                            resumedAt: null,
                            reason: 'Yeni İşe Geçildi (Otomatik Duraklatma)',
                            note: `"${job.projectName || 'Yeni İş'} (${job.taskType || ''})"`
                        });
                        await updateDoc(aRef, {
                            status: DESIGN_JOB_STATUS.PAUSED,
                            workSessions: aSessions,
                            pauseHistory: aPauses
                        });
                    } catch (err) {
                        console.error("Önceki aktif iş otomatik duraklatılamadı:", err);
                    }
                }

                updates.status = DESIGN_JOB_STATUS.IN_PROGRESS;
                const sessions = job.workSessions ? [...job.workSessions] : [];
                sessions.push({ startTime: timeNow, endTime: null });
                updates.workSessions = sessions;
                if (actionType === 'RESUME' && job.pauseHistory) {
                    const pauses = [...job.pauseHistory];
                    if (pauses.length > 0 && !pauses[pauses.length - 1].resumedAt) pauses[pauses.length - 1].resumedAt = timeNow;
                    updates.pauseHistory = pauses;
                }
            } 
            else if (actionType === 'PAUSE') {
                updates.status = DESIGN_JOB_STATUS.PAUSED;
                const sessions = job.workSessions ? [...job.workSessions] : [];
                if (sessions.length > 0 && !sessions[sessions.length - 1].endTime) sessions[sessions.length - 1].endTime = timeNow;
                updates.workSessions = sessions;
                const pauses = job.pauseHistory ? [...job.pauseHistory] : [];
                pauses.push({
                    pausedAt: timeNow, resumedAt: null, reason: pauseData?.reason || 'Belirtilmedi',
                    projectId: pauseData?.projectId || '', projectName: pauseData?.projectName || '', note: pauseData?.note || ''
                });
                updates.pauseHistory = pauses;
            } 
            else if (actionType === 'COMPLETE') {
                if (!window.confirm('Bu tasarım işini tamamen bitirdiğinizi onaylıyor musunuz?')) { setIsSaving(false); return; }
                updates.status = DESIGN_JOB_STATUS.COMPLETED;
                const sessions = job.workSessions ? [...job.workSessions] : [];
                if (sessions.length > 0 && !sessions[sessions.length - 1].endTime) sessions[sessions.length - 1].endTime = timeNow;
                updates.workSessions = sessions;
                updates.completedAt = timeNow;
            }
            await updateDoc(jobRef, updates);
        } catch (error) { console.error("İşlem hatası:", error); alert("İşlem kaydedilemedi."); } 
        finally { setIsSaving(false); if (actionType === 'PAUSE') closePauseModal(); }
    };

    const openPauseModal = (job) => {
        setSelectedJob(job); 
        setPauseReason(''); 
        setPauseProjectId(''); 
        setPauseProjectName(''); 
        setPauseNote(''); 
        setPauseModalOpen(true);
    };
    
    const closePauseModal = () => { setPauseModalOpen(false); setSelectedJob(null); };
    
    const submitPause = () => {
        if (!pauseReason || pauseReason.trim() === '' || pauseReason === 'Belirtilmedi') {
            alert("Lütfen işi duraklatma nedenini seçiniz! (Duraklatma nedeni girilmesi zorunludur)");
            return;
        }
        handleAction(selectedJob, 'PAUSE', { 
            reason: pauseReason, 
            projectId: pauseProjectId || '', 
            projectName: pauseProjectName || '', 
            note: pauseNote || '' 
        });
    };

    const openCompleteModal = (job) => {
        setCompleteJob(job);
        setCompletionNote('');
        setCompleteModalOpen(true);
    };

    const closeCompleteModal = () => {
        setCompleteModalOpen(false);
        setCompleteJob(null);
        setCompletionNote('');
    };

    const submitComplete = async () => {
        if (!completeJob) return;
        setIsSaving(true);
        try {
            const jobRef = doc(db, DESIGN_JOBS_COLLECTION, completeJob.id);
            const timeNow = getCurrentDateTimeString();
            const sessions = completeJob.workSessions ? [...completeJob.workSessions] : [];
            if (sessions.length > 0 && !sessions[sessions.length - 1].endTime) {
                sessions[sessions.length - 1].endTime = timeNow;
            }
            await updateDoc(jobRef, {
                status: DESIGN_JOB_STATUS.COMPLETED,
                workSessions: sessions,
                completedAt: timeNow,
                completionNote: completionNote.trim() || ''
            });
            setCompleteModalOpen(false);
            setCompleteJob(null);
            setCompletionNote('');
        } catch (error) {
            console.error("İş tamamlama hatası:", error);
            alert("İşlem kaydedilemedi.");
        } finally {
            setIsSaving(false);
        }
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });
    };

    return (
        <div className="p-4 max-w-6xl mx-auto space-y-6">
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
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
                            <div className="flex border-b border-gray-200 dark:border-gray-700 mb-4 pb-2" style={{ width: `${MINI_DAYS_TO_SHOW * MINI_DAY_WIDTH}px` }}>
                                {miniDays.map((day, idx) => {
                                    const isWknd = day.getDay() === 0 || day.getDay() === 6;
                                    const isHol = isHoliday(day);
                                    const isToday = day.toDateString() === now.toDateString();
                                    
                                    return (
                                        <div key={idx} className={`flex-shrink-0 flex flex-col items-center justify-center border-l border-gray-200 dark:border-gray-700 ${isWknd || isHol ? 'bg-red-50/50 dark:bg-red-900/10' : ''}`} style={{ width: `${MINI_DAY_WIDTH}px` }}>
                                            <span className={`text-[10px] font-bold uppercase ${(isWknd || isHol) ? 'text-red-500' : 'text-gray-500'}`}>{day.toLocaleDateString('tr-TR', { weekday: 'short' })}</span>
                                            <span className={`text-sm font-black ${isToday ? 'text-blue-600 dark:text-blue-400' : 'text-gray-800 dark:text-gray-200'}`}>{day.getDate()} {day.toLocaleDateString('tr-TR', { month: 'short' })}</span>
                                            {isHol && <span className="text-[8px] text-red-500 font-bold mt-0.5">TATİL</span>}
                                        </div>
                                    );
                                })}
                            </div>

                            <div className="relative" style={{ height: `${Math.max(timelineData.length * 45, 150)}px`, width: `${MINI_DAYS_TO_SHOW * MINI_DAY_WIDTH}px` }}>
                                <div className="absolute inset-0 flex pointer-events-none">
                                    {miniDays.map((day, idx) => (
                                        <div key={idx} className={`h-full border-l border-dashed border-gray-200 dark:border-gray-700/50 ${(day.getDay() === 0 || day.getDay() === 6 || isHoliday(day)) ? 'bg-red-50/30 dark:bg-red-900/5' : ''}`} style={{ width: `${MINI_DAY_WIDTH}px` }} />
                                    ))}
                                </div>

                                {timelineData.length === 0 ? (
                                    <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm">Şu an çizelgede iş yok.</div>
                                ) : (
                                    timelineData.map((job, idx) => (
                                        <div key={job.id} className="absolute flex items-center h-8 transition-all" style={{ left: `${job.leftPx}px`, width: `${Math.max(job.widthPx, 30)}px`, top: `${idx * 40}px` }}>
                                            <div className={`w-full h-full rounded-lg ${job.color} text-white text-[11px] font-bold px-2 flex items-center justify-between shadow-sm overflow-hidden border border-white/20`} title={`${job.projectName} (${job.taskType}) - ${job.estimatedHours} st`}>
                                                <span className="truncate">{job.projectName}</span>
                                                <span className="text-[9px] opacity-80 font-mono ml-1">{job.estimatedHours}h</span>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 flex flex-col h-[340px]">
                    <div className="flex justify-between items-center mb-3 pb-2 border-b border-gray-100 dark:border-gray-700">
                        <h3 className="font-bold text-gray-800 dark:text-white flex items-center text-sm">
                            <CalendarDays className="w-4 h-4 mr-2 text-indigo-500" /> Takvim & Terminler
                        </h3>
                        <div className="flex items-center gap-1 text-xs">
                            <button onClick={prevMonth} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"><ChevronLeft className="w-4 h-4" /></button>
                            <span className="font-bold text-gray-700 dark:text-gray-300">{currentDate.toLocaleDateString('tr-TR', { month: 'short', year: 'numeric' })}</span>
                            <button onClick={nextMonth} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"><ChevronRight className="w-4 h-4" /></button>
                        </div>
                    </div>

                    <div className="grid grid-cols-7 gap-1 text-center font-bold text-[10px] text-gray-400 mb-1">
                        <span>PZT</span><span>SAL</span><span>ÇAR</span><span>PER</span><span>CUM</span><span className="text-red-400">CTS</span><span className="text-red-400">PZR</span>
                    </div>

                    <div className="grid grid-cols-7 gap-1 flex-1 text-xs">
                        {calendarDays.map((d, idx) => {
                            if (!d) return <div key={idx} className="bg-transparent" />;
                            const isToday = d.dateObj.toDateString() === now.toDateString();
                            const hasJobs = d.jobs.length > 0;
                            return (
                                <div key={idx} className={`p-1 border rounded-lg flex flex-col justify-between transition ${isToday ? 'bg-indigo-50 border-indigo-300 dark:bg-indigo-900/30 font-black' : 'bg-gray-50/50 dark:bg-gray-900/30 border-gray-100 dark:border-gray-700/50'} ${hasJobs ? 'border-amber-300 dark:border-amber-700 bg-amber-50/30' : ''}`}>
                                    <span className={`text-[10px] ${isToday ? 'text-indigo-600 dark:text-indigo-400 font-black' : 'text-gray-500'}`}>{d.day}</span>
                                    {hasJobs && (
                                        <div className="flex items-center justify-center bg-amber-500 text-white text-[9px] font-bold rounded px-1 py-0.5" title={d.jobs.map(j => j.projectName).join(', ')}>
                                            {d.jobs.length} İş
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* İŞ LİSTESİ BANNERİ */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5 space-y-4">
                <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 border-b border-gray-200 dark:border-gray-700 pb-3">
                    <div>
                        <h2 className="text-lg font-bold text-gray-800 dark:text-white flex items-center">
                            <Briefcase className="w-5 h-5 mr-2 text-indigo-500" /> Aktif Tasarım Görevlerim ({myJobs.length})
                        </h2>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Size atanan tasarım işlerini başlatabilir, duraklatabilir veya tamamlayabilirsiniz.</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button 
                            onClick={() => setManualModalOpen(true)}
                            className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition shadow-sm flex items-center gap-1.5"
                        >
                            <Plus className="w-4 h-4" /> Kendine Görev Ekle
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {myJobs.map((job) => {
                        const spentHours = getSpentHours(job, now, designConfig);
                        const estHours = parseFloat(job.estimatedHours) || 0;
                        const progressPct = estHours > 0 ? Math.min(100, Math.round((spentHours / estHours) * 100)) : 0;
                        const isRunning = job.status === DESIGN_JOB_STATUS.IN_PROGRESS;
                        const isPaused = job.status === DESIGN_JOB_STATUS.PAUSED;

                        return (
                            <div key={job.id} className={`bg-gray-50 dark:bg-gray-900/60 p-4 rounded-xl border transition-all space-y-3 ${isRunning ? 'border-green-500 shadow-md ring-1 ring-green-500' : isPaused ? 'border-amber-400 dark:border-amber-600' : 'border-gray-200 dark:border-gray-700'}`}>
                                <div className="flex justify-between items-start">
                                    <div>
                                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                                            {job.taskType || 'KALIP TASARIM'}
                                        </span>
                                        <h3 className="font-bold text-gray-800 dark:text-white mt-1.5 text-sm leading-snug">{job.projectName}</h3>
                                        {job.customer && <p className="text-[11px] text-gray-500">{job.customer}</p>}
                                    </div>
                                    <div className="flex items-center gap-1">
                                        {isRunning && <span className="flex h-2.5 w-2.5 rounded-full bg-green-500 animate-ping" title="Süre İşliyor" />}
                                    </div>
                                </div>

                                <div className="space-y-1.5 text-xs border-t border-gray-200 dark:border-gray-800 pt-2.5">
                                    <div className="flex justify-between text-gray-600 dark:text-gray-300">
                                        <span>Tahmini Süre:</span>
                                        <span className="font-bold">{estHours} Saat</span>
                                    </div>
                                    <div className="flex justify-between text-gray-600 dark:text-gray-300">
                                        <span>Harcanan Süre:</span>
                                        <span className="font-black text-indigo-600 dark:text-indigo-400">{spentHours.toFixed(1)} Saat</span>
                                    </div>
                                    
                                    <div className="w-full bg-gray-200 dark:bg-gray-700 h-2 rounded-full overflow-hidden mt-1">
                                        <div className={`h-full transition-all ${progressPct > 100 ? 'bg-red-500' : 'bg-indigo-600'}`} style={{ width: `${progressPct}%` }} />
                                    </div>
                                </div>

                                {job.managerNote && (
                                    <p className="text-[11px] text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 p-2 rounded border border-gray-100 dark:border-gray-700 italic">
                                        "{job.managerNote}"
                                    </p>
                                )}

                                <div className="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-gray-800 gap-2">
                                    {isRunning ? (
                                        <button 
                                            onClick={() => openPauseModal(job)}
                                            className="flex-1 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm"
                                        >
                                            <PauseCircle className="w-4 h-4" /> Duraklat
                                        </button>
                                    ) : (
                                        <button 
                                            onClick={() => handleAction(job, isPaused ? 'RESUME' : 'START')}
                                            className="flex-1 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm"
                                        >
                                            <PlayCircle className="w-4 h-4" /> {isPaused ? 'Devam Et' : 'Başlat'}
                                        </button>
                                    )}

                                    <button 
                                        onClick={() => openCompleteModal(job)}
                                        className="py-2 px-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold transition flex items-center justify-center gap-1 shadow-sm"
                                        title="Tamamlandı Olarak İşaretle"
                                    >
                                        <CheckCircle className="w-4 h-4" /> Bitir
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {myJobs.length === 0 && (
                    <div className="py-12 text-center text-gray-500">
                        <Briefcase className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                        <p className="font-bold text-sm">Üzerinizde aktif tasarım görevi bulunmuyor.</p>
                    </div>
                )}
            </div>

            {/* DURAKLATMA MODALI */}
            {pauseModalOpen && selectedJob && (
                <Modal isOpen={pauseModalOpen} onClose={closePauseModal} title="⏸️ İşi Duraklat & Nedeni Belirt">
                    <div className="space-y-4 text-gray-800 dark:text-gray-200 text-xs">
                        <p className="font-bold text-sm text-indigo-600 dark:text-indigo-400 border-b pb-2">{selectedJob.projectName}</p>
                        
                        <div>
                            <label className="block font-bold mb-1">Duraklatma Nedeni (Zorunlu)</label>
                            <select 
                                value={pauseReason} 
                                onChange={(e) => setPauseReason(e.target.value)}
                                className="w-full p-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg font-bold text-xs"
                            >
                                <option value={DESIGN_ACTIVITY_TYPES.MEETING}>Toplantı</option>
                                <option value={DESIGN_ACTIVITY_TYPES.REVISION}>Revizyon / Kalıp Değişikliği</option>
                                <option value={DESIGN_ACTIVITY_TYPES.SUPPORT}>Diğer Tasarımcıya Destek</option>
                                <option value={DESIGN_ACTIVITY_TYPES.OTHER}>Diğer Bölünme / Kesinti</option>
                            </select>
                        </div>

                        <div>
                            <label className="block font-bold mb-1">Açıklama / Detaylı Not</label>
                            <input 
                                type="text" 
                                placeholder="Örn: Müşteri revizyon talebi geldi, grafit kontrolü..." 
                                value={pauseNote} 
                                onChange={(e) => setPauseNote(e.target.value)}
                                className="w-full p-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-xs"
                            />
                        </div>

                        <div className="flex justify-end gap-2 pt-3">
                            <button onClick={closePauseModal} className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg font-bold">İptal</button>
                            <button onClick={submitPause} className="px-4 py-2 bg-amber-600 text-white rounded-lg font-bold">İşi Duraklat</button>
                        </div>
                    </div>
                </Modal>
            )}

            {/* İŞİ BİTİRME MODALI */}
            {completeModalOpen && completeJob && (
                <Modal isOpen={completeModalOpen} onClose={closeCompleteModal} title="✅ Tasarım İşini Tamamla">
                    <div className="space-y-4 text-gray-800 dark:text-gray-200 text-xs">
                        <p className="font-bold text-sm text-emerald-600 dark:text-emerald-400 border-b pb-2">{completeJob.projectName}</p>
                        <div>
                            <label className="block font-bold mb-1">Tamamlama Notu (Opsiyonel)</label>
                            <textarea 
                                rows="3"
                                placeholder="Örn: 3D katı model ve 2D teknik resimler tamamlanıp sunucuya aktarıldı." 
                                value={completionNote} 
                                onChange={(e) => setCompletionNote(e.target.value)}
                                className="w-full p-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-xs"
                            />
                        </div>

                        <div className="flex justify-end gap-2 pt-3">
                            <button onClick={closeCompleteModal} className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg font-bold">İptal</button>
                            <button onClick={submitComplete} className="px-4 py-2 bg-blue-600 text-white rounded-lg font-bold">Tamamlandı Olarak İşaretle</button>
                        </div>
                    </div>
                </Modal>
            )}

            {/* MANUEL GÖREV EKLEME MODALI */}
            {manualModalOpen && (
                <Modal isOpen={manualModalOpen} onClose={() => setManualModalOpen(false)} title="➕ Kendine Bağımsız Görev Ekle">
                    <div className="space-y-4 text-gray-800 dark:text-gray-200 text-xs">
                        <div>
                            <label className="block font-bold mb-1">İş / Görev Türü</label>
                            <select 
                                value={manualTaskType} 
                                onChange={(e) => setManualTaskType(e.target.value)}
                                className="w-full p-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg font-bold text-xs"
                            >
                                {taskTypes.map(t => {
                                    const val = typeof t === 'string' ? t : t.name;
                                    return <option key={val} value={val}>{val}</option>;
                                })}
                            </select>
                        </div>

                        <div>
                            <label className="block font-bold mb-1">İlişkili Kalıp / Proje (Opsiyonel)</label>
                            <SearchableProjectSelect 
                                projects={projects} 
                                value={manualProjectId} 
                                onChange={(id, name) => { setManualProjectId(id); setManualProjectName(name); }} 
                            />
                        </div>

                        <div>
                            <label className="block font-bold mb-1">Tahmini Süre (Saat)</label>
                            <input 
                                type="number" 
                                step="0.5" 
                                placeholder="Örn: 4" 
                                value={manualEstimatedHours} 
                                onChange={(e) => setManualEstimatedHours(e.target.value)}
                                className="w-full p-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg font-bold text-xs"
                            />
                        </div>

                        <div>
                            <label className="block font-bold mb-1">Açıklama / Detay</label>

                            <input 
                                type="text" 
                                placeholder="Örn: Grafit çizimi veya revizyon detayları..." 
                                value={manualNote} 
                                onChange={(e) => setManualNote(e.target.value)}
                                className="w-full p-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-xs"
                            />
                        </div>

                        <div className="flex justify-end gap-2 pt-3">
                            <button onClick={() => setManualModalOpen(false)} className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg font-bold">İptal</button>
                            <button onClick={handleAddManualTask} disabled={isSaving} className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-bold">Görevi Ekle</button>
                        </div>
                    </div>
                </Modal>
            )}

        </div>
    );
};

export default DesignMyTasks;