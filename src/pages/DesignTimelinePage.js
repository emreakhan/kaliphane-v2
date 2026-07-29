// src/pages/DesignTimelinePage.js

import React, { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock, ZoomIn, ZoomOut } from 'lucide-react';
import { DESIGN_JOB_STATUS, PERSONNEL_ROLES } from '../config/constants.js';

const addWorkingHours = (startDate, hoursToAdd, designConfig = {}) => {
    const workStart = designConfig.workStartHour ?? 8;
    const workEnd = designConfig.workEndHour ?? 18;

    let currentDate = new Date(startDate.getTime());
    let remainingMinutes = hoursToAdd * 60;

    if (currentDate.getHours() < workStart) {
        currentDate.setHours(workStart, 0, 0, 0);
    } else if (currentDate.getHours() >= workEnd) {
        currentDate.setDate(currentDate.getDate() + 1);
        currentDate.setHours(workStart, 0, 0, 0);
    }
    
    while (currentDate.getDay() === 0 || currentDate.getDay() === 6) { 
        currentDate.setDate(currentDate.getDate() + 1);
        currentDate.setHours(workStart, 0, 0, 0);
    }

    while (remainingMinutes > 0) {
        let minutesToEOD = (workEnd * 60) - (currentDate.getHours() * 60 + currentDate.getMinutes());
        
        if (remainingMinutes <= minutesToEOD) {
            currentDate.setMinutes(currentDate.getMinutes() + remainingMinutes);
            remainingMinutes = 0;
        } else {
            remainingMinutes -= minutesToEOD;
            currentDate.setDate(currentDate.getDate() + 1);
            currentDate.setHours(workStart, 0, 0, 0);
            
            while (currentDate.getDay() === 0 || currentDate.getDay() === 6) {
                currentDate.setDate(currentDate.getDate() + 1);
                currentDate.setHours(workStart, 0, 0, 0);
            }
        }
    }
    return currentDate;
};

const TASK_COLORS = [
    'bg-blue-500', 'bg-purple-500', 'bg-pink-500', 
    'bg-teal-500', 'bg-cyan-600', 'bg-indigo-500'
];

const DesignTimelinePage = ({ designJobs, personnel, designConfig = {} }) => {
    const workStart = designConfig.workStartHour ?? 8;
    const workEnd = designConfig.workEndHour ?? 18;

    const [baseDate, setBaseDate] = useState(() => {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() - 1); 
        return d;
    });
    const [zoom, setZoom] = useState(1); 

    const designers = useMemo(() => {
        return personnel
            .filter(p => p.role === PERSONNEL_ROLES.KALIP_TASARIM_SORUMLUSU || p.role === PERSONNEL_ROLES.KALIP_TASARIM_YONETICISI)
            .map(p => p.name)
            .sort((a,b) => a.localeCompare(b, 'tr'));
    }, [personnel]);

    const DAYS_TO_SHOW = Math.round(14 * zoom);
    const DAY_WIDTH_PX = Math.round(120 / zoom);

    const days = useMemo(() => {
        const arr = [];
        for (let i = 0; i < DAYS_TO_SHOW; i++) {
            const d = new Date(baseDate);
            d.setDate(d.getDate() + i);
            arr.push(d);
        }
        return arr;
    }, [baseDate, DAYS_TO_SHOW]);

    const timelineStartMs = days[0].getTime();
    const timelineEndMs = days[days.length - 1].getTime() + (24 * 60 * 60 * 1000);

    const timelineData = useMemo(() => {
        const data = {};
        const now = new Date();

        designers.forEach(designerName => {
            const designerJobs = designJobs
                .filter(j => j.assignedDesigner === designerName && j.status !== DESIGN_JOB_STATUS.COMPLETED)
                .sort((a, b) => {
                    if (a.status === DESIGN_JOB_STATUS.IN_PROGRESS && b.status !== DESIGN_JOB_STATUS.IN_PROGRESS) return -1;
                    if (b.status === DESIGN_JOB_STATUS.IN_PROGRESS && a.status !== DESIGN_JOB_STATUS.IN_PROGRESS) return 1;
                    return (a.orderIndex || 0) - (b.orderIndex || 0);
                });

            let currentPointer = new Date(now);
            if (currentPointer.getHours() < workStart) {
                currentPointer.setHours(workStart, 0, 0, 0);
            } else if (currentPointer.getHours() >= workEnd) {
                currentPointer.setDate(currentPointer.getDate() + 1);
                currentPointer.setHours(workStart, 0, 0, 0);
            }

            const mappedJobs = [];
            let colorIndex = 0;

            designerJobs.forEach((job) => {
                let start, end;
                const estimatedHours = parseFloat(job.estimatedHours) || 0;

                if (job.status === DESIGN_JOB_STATUS.IN_PROGRESS) {
                    const firstSession = job.workSessions?.[0]?.startTime;
                    start = firstSession ? new Date(firstSession) : new Date(currentPointer);
                    end = addWorkingHours(start, estimatedHours, designConfig);
                    currentPointer = new Date(Math.max(now.getTime(), end.getTime()));
                } else {
                    start = new Date(currentPointer);
                    end = addWorkingHours(start, estimatedHours, designConfig);
                    currentPointer = new Date(end);
                }

                if (end.getTime() > timelineStartMs && start.getTime() < timelineEndMs) {
                    const leftPx = ((start.getTime() - timelineStartMs) / (1000 * 60 * 60 * 24)) * DAY_WIDTH_PX;
                    const widthPx = ((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) * DAY_WIDTH_PX;

                    mappedJobs.push({
                        ...job,
                        drawStart: start,
                        drawEnd: end,
                        leftPx: Math.max(0, leftPx),
                        widthPx: leftPx < 0 ? widthPx + leftPx : widthPx,
                        color: job.status === DESIGN_JOB_STATUS.IN_PROGRESS ? 'bg-green-500' : TASK_COLORS[colorIndex % TASK_COLORS.length]
                    });
                    if (job.status !== DESIGN_JOB_STATUS.IN_PROGRESS) colorIndex++;
                }
            });

            data[designerName] = mappedJobs;
        });

        return data;
    }, [designers, designJobs, baseDate, DAY_WIDTH_PX, timelineStartMs, timelineEndMs, workStart, workEnd, designConfig]);

    const prevWeek = () => {
        const d = new Date(baseDate);
        d.setDate(d.getDate() - 7);
        setBaseDate(d);
    };

    const nextWeek = () => {
        const d = new Date(baseDate);
        d.setDate(d.getDate() + 7);
        setBaseDate(d);
    };

    const resetToday = () => {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() - 1);
        setBaseDate(d);
    };

    return (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 space-y-6">
            
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-4 border-b border-gray-200 dark:border-gray-700">
                <div>
                    <h2 className="text-xl font-bold text-gray-800 dark:text-white flex items-center">
                        <CalendarIcon className="w-5 h-5 mr-2 text-indigo-500" /> Tasarım Ekibi İş Kuyruğu & Zaman Çizelgesi
                    </h2>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Her tasarımcının üzerindeki işlerin sıralamasına göre tahmini ne zaman bitip sonraki işe geçeceği simüle edilmektedir.
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    <div className="flex items-center bg-gray-100 dark:bg-gray-700 p-1 rounded-lg">
                        <button onClick={prevWeek} className="p-1.5 hover:bg-white dark:hover:bg-gray-600 rounded text-gray-600 dark:text-gray-200 transition">
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <button onClick={resetToday} className="px-3 py-1 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:bg-white dark:hover:bg-gray-600 rounded transition">
                            Bugün
                        </button>
                        <button onClick={nextWeek} className="p-1.5 hover:bg-white dark:hover:bg-gray-600 rounded text-gray-600 dark:text-gray-200 transition">
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>

                    <div className="flex items-center bg-gray-100 dark:bg-gray-700 p-1 rounded-lg">
                        <button onClick={() => setZoom(z => Math.max(0.5, z - 0.25))} className="p-1.5 hover:bg-white dark:hover:bg-gray-600 rounded text-gray-600 dark:text-gray-200 transition">
                            <ZoomOut className="w-4 h-4" />
                        </button>
                        <span className="text-xs font-bold px-2 text-gray-600 dark:text-gray-300">%{Math.round(100 / zoom)}</span>
                        <button onClick={() => setZoom(z => Math.min(2, z + 0.25))} className="p-1.5 hover:bg-white dark:hover:bg-gray-600 rounded text-gray-600 dark:text-gray-200 transition">
                            <ZoomIn className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>

            <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-900/50">
                <div className="min-w-max">
                    <div className="flex border-b border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800">
                        <div className="w-48 flex-shrink-0 p-3 font-bold text-xs text-gray-600 dark:text-gray-300 border-r border-gray-200 dark:border-gray-700 flex items-center">
                            Tasarım Sorumlusu
                        </div>
                        <div className="flex">
                            {days.map((day, idx) => {
                                const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                                const isToday = day.toDateString() === new Date().toDateString();
                                return (
                                    <div key={idx} style={{ width: `${DAY_WIDTH_PX}px` }} className={`flex-shrink-0 p-2 text-center border-r border-gray-200 dark:border-gray-700 ${isWeekend ? 'bg-red-50/50 dark:bg-red-900/10' : ''} ${isToday ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}>
                                        <div className="text-[10px] font-bold text-gray-400 uppercase">{day.toLocaleDateString('tr-TR', { weekday: 'short' })}</div>
                                        <div className={`text-xs font-bold ${isToday ? 'text-blue-600 dark:text-blue-400' : 'text-gray-700 dark:text-gray-300'}`}>
                                            {day.getDate()} {day.toLocaleDateString('tr-TR', { month: 'short' })}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div className="divide-y divide-gray-200 dark:divide-gray-700">
                        {designers.map((designer) => {
                            const designerJobs = timelineData[designer] || [];
                            const maxRows = Math.max(designerJobs.length, 1);
                            const rowHeight = 40;

                            return (
                                <div key={designer} className="flex hover:bg-gray-100/50 dark:hover:bg-gray-800/30 transition">
                                    <div className="w-48 flex-shrink-0 p-3 font-bold text-sm text-gray-800 dark:text-gray-200 border-r border-gray-200 dark:border-gray-700 flex items-center bg-white dark:bg-gray-800">
                                        {designer}
                                    </div>

                                    <div className="relative flex-1" style={{ height: `${maxRows * rowHeight + 10}px` }}>
                                        <div className="absolute inset-0 flex pointer-events-none">
                                            {days.map((day, idx) => {
                                                const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                                                return (
                                                    <div key={idx} style={{ width: `${DAY_WIDTH_PX}px` }} className={`h-full border-r border-dashed border-gray-200 dark:border-gray-700/50 ${isWeekend ? 'bg-red-50/30 dark:bg-red-900/5' : ''}`} />
                                                );
                                            })}
                                        </div>

                                        {designerJobs.map((job, idx) => {
                                            return (
                                                <div key={job.id} className="absolute flex items-center h-7 transition-all" style={{ left: `${job.leftPx}px`, width: `${Math.max(job.widthPx, 20)}px`, top: `${idx * rowHeight + 8}px` }}>
                                                    <div className={`w-full h-full rounded-md ${job.color} text-white text-xs font-bold px-2 flex items-center justify-between shadow-sm border border-white/20 overflow-hidden cursor-pointer hover:opacity-90`} title={`${job.projectName} (${job.taskType}) - ${job.estimatedHours} Saat`}>
                                                        <span className="truncate">{job.projectName}</span>
                                                        <span className="text-[10px] opacity-80 font-mono ml-1">{job.estimatedHours}h</span>
                                                    </div>
                                                </div>
                                            );
                                        })}

                                        {designerJobs.length === 0 && (
                                            <div className="absolute inset-0 flex items-center text-xs text-gray-400 italic px-4">
                                                Planlanmış aktif iş yok.
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DesignTimelinePage;