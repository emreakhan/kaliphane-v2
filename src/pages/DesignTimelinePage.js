// src/pages/DesignTimelinePage.js

import React, { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock, ZoomIn, ZoomOut } from 'lucide-react';
import { DESIGN_JOB_STATUS, PERSONNEL_ROLES } from '../config/constants.js';

// --- MESAİ SAATLERİ ALGORİTMASI ---
const WORK_START_HOUR = 8;  // 08:00
const WORK_END_HOUR = 18;   // 18:00

const addWorkingHours = (startDate, hoursToAdd) => {
    let currentDate = new Date(startDate.getTime());
    let remainingMinutes = hoursToAdd * 60;

    if (currentDate.getHours() < WORK_START_HOUR) {
        currentDate.setHours(WORK_START_HOUR, 0, 0, 0);
    } else if (currentDate.getHours() >= WORK_END_HOUR) {
        currentDate.setDate(currentDate.getDate() + 1);
        currentDate.setHours(WORK_START_HOUR, 0, 0, 0);
    }
    
    while (currentDate.getDay() === 0 || currentDate.getDay() === 6) { 
        currentDate.setDate(currentDate.getDate() + 1);
        currentDate.setHours(WORK_START_HOUR, 0, 0, 0);
    }

    while (remainingMinutes > 0) {
        let minutesToEOD = (WORK_END_HOUR * 60) - (currentDate.getHours() * 60 + currentDate.getMinutes());
        
        if (remainingMinutes <= minutesToEOD) {
            currentDate.setMinutes(currentDate.getMinutes() + remainingMinutes);
            remainingMinutes = 0;
        } else {
            remainingMinutes -= minutesToEOD;
            currentDate.setDate(currentDate.getDate() + 1);
            currentDate.setHours(WORK_START_HOUR, 0, 0, 0);
            
            while (currentDate.getDay() === 0 || currentDate.getDay() === 6) {
                currentDate.setDate(currentDate.getDate() + 1);
                currentDate.setHours(WORK_START_HOUR, 0, 0, 0);
            }
        }
    }
    return currentDate;
};

const TASK_COLORS = [
    'bg-blue-500', 'bg-purple-500', 'bg-pink-500', 
    'bg-teal-500', 'bg-cyan-600', 'bg-indigo-500'
];

const DesignTimelinePage = ({ designJobs, personnel }) => {
    const [baseDate, setBaseDate] = useState(() => {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() - 1); 
        return d;
    });
    const [zoom, setZoom] = useState(1); 

    const DAY_WIDTH = 200 * zoom; 
    const DAYS_TO_SHOW = 14;      

    const designers = useMemo(() => {
        return personnel
            .filter(p => p.role === PERSONNEL_ROLES.KALIP_TASARIM_SORUMLUSU)
            .map(p => p.name)
            .sort((a, b) => a.localeCompare(b, 'tr'));
    }, [personnel]);

    const days = useMemo(() => {
        const arr = [];
        for (let i = 0; i < DAYS_TO_SHOW; i++) {
            const d = new Date(baseDate);
            d.setDate(d.getDate() + i);
            arr.push(d);
        }
        return arr;
    }, [baseDate]);

    const timelineStartMs = days[0].getTime();
    const timelineEndMs = days[days.length - 1].getTime() + (24 * 60 * 60 * 1000);

    const timelineData = useMemo(() => {
        const data = {};
        const now = new Date();

        designers.forEach(designer => {
            const jobs = designJobs
                .filter(j => j.assignedDesigner === designer && j.status !== DESIGN_JOB_STATUS.COMPLETED)
                .sort((a, b) => {
                    if (a.status === DESIGN_JOB_STATUS.IN_PROGRESS && b.status !== DESIGN_JOB_STATUS.IN_PROGRESS) return -1;
                    if (b.status === DESIGN_JOB_STATUS.IN_PROGRESS && a.status !== DESIGN_JOB_STATUS.IN_PROGRESS) return 1;
                    return (a.orderIndex || 0) - (b.orderIndex || 0);
                });

            let currentPointer = new Date(now);
            if (currentPointer.getHours() < WORK_START_HOUR) currentPointer.setHours(WORK_START_HOUR, 0, 0, 0);
            if (currentPointer.getHours() >= WORK_END_HOUR) {
                currentPointer.setDate(currentPointer.getDate() + 1);
                currentPointer.setHours(WORK_START_HOUR, 0, 0, 0);
            }

            const mappedJobs = [];
            let colorIndex = 0;

            jobs.forEach((job) => {
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
                    const leftPx = ((start.getTime() - timelineStartMs) / (1000 * 60 * 60 * 24)) * DAY_WIDTH;
                    const widthPx = ((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) * DAY_WIDTH;

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

            data[designer] = mappedJobs;
        });
        return data;
    }, [designJobs, designers, baseDate, DAY_WIDTH, timelineStartMs, timelineEndMs]);

    const goPrevWeek = () => { const d = new Date(baseDate); d.setDate(d.getDate() - 7); setBaseDate(d); };
    const goNextWeek = () => { const d = new Date(baseDate); d.setDate(d.getDate() + 7); setBaseDate(d); };
    const goToday = () => { const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate() - 1); setBaseDate(d); };

    return (
        // DİKKAT: Buradaki h-[75vh] kısıtlamasını kaldırdık, liste içeriğine göre aşağı doğru büyüyecek
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 flex flex-col">
            
            {/* ÜST KONTROL BAR */}
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex flex-col md:flex-row justify-between items-center gap-4">
                <div>
                    <h2 className="text-lg font-bold text-gray-800 dark:text-white flex items-center">
                        <CalendarIcon className="w-5 h-5 mr-2 text-indigo-500" /> Tasarım Süreç Çizelgesi
                    </h2>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">İşler hafta sonlarını (Cum-Paz) atlayarak tek parça halinde uzar.</p>
                </div>
                
                <div className="flex items-center gap-3">
                    <div className="flex items-center bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
                        <button onClick={() => setZoom(Math.max(0.5, zoom - 0.2))} className="p-1.5 text-gray-600 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-600 rounded"><ZoomOut className="w-4 h-4"/></button>
                        <span className="text-xs font-bold px-2">{Math.round(zoom * 100)}%</span>
                        <button onClick={() => setZoom(Math.min(2, zoom + 0.2))} className="p-1.5 text-gray-600 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-600 rounded"><ZoomIn className="w-4 h-4"/></button>
                    </div>

                    <div className="flex items-center gap-1">
                        <button onClick={goPrevWeek} className="p-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition"><ChevronLeft className="w-4 h-4" /></button>
                        <button onClick={goToday} className="px-4 py-2 text-sm font-bold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-900/30 dark:text-indigo-300 rounded-lg transition">Bugün</button>
                        <button onClick={goNextWeek} className="p-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition"><ChevronRight className="w-4 h-4" /></button>
                    </div>
                </div>
            </div>

            {/* TIMELINE ALANI - YATAY KAYDIRMA BURADA OLACAK */}
            <div className="w-full overflow-x-auto bg-gray-50 dark:bg-gray-900/50 rounded-b-xl">
                <div className="flex flex-col min-w-max pb-4">
                    
                    {/* 1. Günler Başlığı */}
                    <div className="flex border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                        {/* İsimlerin yazdığı sol başlık - Sticky yapıldı */}
                        <div className="w-48 flex-shrink-0 sticky left-0 z-40 border-r border-gray-200 dark:border-gray-700 p-3 font-bold text-gray-500 text-xs flex items-center bg-gray-50 dark:bg-gray-900 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                            TASARIM EKİBİ
                        </div>
                        <div className="flex relative" style={{ width: `${DAYS_TO_SHOW * DAY_WIDTH}px` }}>
                            {days.map((day, idx) => {
                                const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                                const isToday = day.toDateString() === new Date().toDateString();
                                
                                return (
                                    <div 
                                        key={idx} 
                                        className={`flex-shrink-0 flex flex-col items-center justify-center border-r border-gray-200 dark:border-gray-700 py-2
                                            ${isWeekend ? 'bg-red-50/50 dark:bg-red-900/20' : ''}
                                            ${isToday ? 'bg-blue-50 dark:bg-blue-900/30' : ''}
                                        `}
                                        style={{ width: `${DAY_WIDTH}px` }}
                                    >
                                        <span className={`text-[10px] font-bold uppercase ${isWeekend ? 'text-red-500' : 'text-gray-500'}`}>
                                            {day.toLocaleDateString('tr-TR', { weekday: 'short' })}
                                        </span>
                                        <span className={`text-sm font-black ${isToday ? 'text-blue-600 dark:text-blue-400' : 'text-gray-800 dark:text-gray-200'}`}>
                                            {day.getDate()} {day.toLocaleDateString('tr-TR', { month: 'short' })}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* 2. Tasarımcı Satırları */}
                    <div className="flex relative">
                        
                        {/* Sol İsim Sütunu (Sabit - Sticky) */}
                        <div className="w-48 flex-shrink-0 sticky left-0 z-30 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] flex flex-col">
                            {designers.map(designer => (
                                <div key={designer} className="h-20 border-b border-gray-200 dark:border-gray-700 flex items-center px-4 font-bold text-sm text-gray-800 dark:text-white truncate bg-white dark:bg-gray-800">
                                    {designer}
                                </div>
                            ))}
                        </div>

                        {/* Sağ Timeline Izgarası ve Bloklar */}
                        <div className="relative flex-1" style={{ width: `${DAYS_TO_SHOW * DAY_WIDTH}px`, minWidth: `${DAYS_TO_SHOW * DAY_WIDTH}px` }}>
                            
                            {/* Arka Plan Dikey Çizgiler & Hafta Sonu Renkleri */}
                            <div className="absolute inset-0 flex pointer-events-none">
                                {days.map((day, idx) => {
                                    const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                                    return (
                                        <div 
                                            key={idx} 
                                            className={`h-full border-r border-dashed border-gray-200 dark:border-gray-700/50 
                                                ${isWeekend ? 'bg-red-50/30 dark:bg-red-900/10' : ''}
                                            `}
                                            style={{ width: `${DAY_WIDTH}px` }}
                                        />
                                    );
                                })}
                            </div>

                            {/* Tasarımcı Satırları ve Görev Blokları */}
                            <div className="absolute inset-0">
                                {designers.map((designer, rowIdx) => (
                                    <div key={designer} className="h-20 border-b border-gray-200 dark:border-gray-700/50 relative">
                                        {timelineData[designer]?.map((job) => (
                                            <div 
                                                key={job.id}
                                                className={`absolute top-2 h-14 rounded-md shadow-sm border border-white/20 dark:border-gray-800/50 flex flex-col justify-center px-2 overflow-hidden hover:z-20 hover:shadow-lg transition-shadow cursor-default
                                                    ${job.color} text-white
                                                `}
                                                style={{ 
                                                    left: `${job.leftPx}px`, 
                                                    width: `${job.widthPx}px`,
                                                    minWidth: '40px' 
                                                }}
                                                title={`${job.projectName}\nBaşlangıç: ${job.drawStart.toLocaleString('tr-TR')}\nBitiş: ${job.drawEnd.toLocaleString('tr-TR')}\nSüre: ${job.estimatedHours} Saat`}
                                            >
                                                <div className="font-bold text-xs truncate leading-tight">{job.projectName}</div>
                                                <div className="text-[10px] opacity-90 truncate flex items-center mt-0.5">
                                                    <Clock className="w-3 h-3 mr-1 opacity-70" /> {job.estimatedHours}s ({job.taskType})
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ))}
                            </div>

                            {/* "Şu An" Çizgisi */}
                            {(() => {
                                const now = new Date();
                                if (now.getTime() >= timelineStartMs && now.getTime() <= timelineEndMs) {
                                    const nowLeft = ((now.getTime() - timelineStartMs) / (1000 * 60 * 60 * 24)) * DAY_WIDTH;
                                    return (
                                        <div 
                                            className="absolute top-0 bottom-0 border-l-2 border-red-500 z-10 pointer-events-none"
                                            style={{ left: `${nowLeft}px` }}
                                        >
                                            <div className="absolute -top-3 -left-2 bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">ŞU AN</div>
                                        </div>
                                    );
                                }
                                return null;
                            })()}

                        </div>
                    </div>
                </div>
            </div>

            {/* Alt Açıklama */}
            <div className="p-3 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 flex gap-4 text-xs font-medium text-gray-600 dark:text-gray-400">
                <span className="flex items-center"><div className="w-3 h-3 rounded bg-green-500 mr-1"></div> Aktif Çalışan</span>
                <span className="flex items-center"><div className="w-3 h-3 rounded bg-blue-500 mr-1"></div> Bekleyen Sıradaki İşler</span>
                <span className="flex items-center"><div className="w-3 h-3 rounded bg-red-100 border border-red-300 dark:bg-red-900/30 mr-1"></div> Hafta Sonu (Süre Atlanır)</span>
            </div>

        </div>
    );
};

export default DesignTimelinePage;