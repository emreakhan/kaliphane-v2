// src/pages/CamTimelineTab.js

import React, { useState, useMemo } from 'react';
import { Monitor, Clock, CalendarDays, ZoomIn, AlertCircle, CalendarRange } from 'lucide-react';
import { OPERATION_STATUS } from '../config/constants.js';

const cleanStr = (str) => String(str || '').replace(/[^a-zA-Z0-9çğıöşüÇĞİÖŞÜ]/g, '').toLowerCase();

const CamTimelineTab = ({ projects, machines }) => {
    const [viewMode, setViewMode] = useState('DAILY');
    const [skipSundays, setSkipSundays] = useState(false); // Pazar günlerini atlama state'i

    const viewConfig = useMemo(() => {
        switch(viewMode) {
            case 'MONTHLY': return { pixelsPerHour: 3, totalDays: 60, label: 'Aylık' };
            case 'WEEKLY': return { pixelsPerHour: 8, totalDays: 28, label: 'Haftalık' };
            case 'DAILY': default: return { pixelsPerHour: 24, totalDays: 14, label: 'Günlük' };
        }
    }, [viewMode]);

    const PIXELS_PER_HOUR = viewConfig.pixelsPerHour;
    const TOTAL_DAYS_TO_SHOW = viewConfig.totalDays;
    const DAY_WIDTH = PIXELS_PER_HOUR * 24;

    const timelineDays = useMemo(() => {
        const days = [];
        const today = new Date();
        for (let i = 0; i < TOTAL_DAYS_TO_SHOW; i++) {
            const date = new Date(today);
            date.setDate(today.getDate() + i);
            const dayOfWeek = date.getDay(); // 0: Pazar, 6: Cumartesi
            days.push({
                dateStr: date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }),
                dayName: date.toLocaleDateString('tr-TR', { weekday: 'short' }),
                isToday: i === 0,
                isSaturday: dayOfWeek === 6,
                isSunday: dayOfWeek === 0
            });
        }
        return days;
    }, [TOTAL_DAYS_TO_SHOW]);

    // Yardımcı Fonksiyon: İşlerin Pazar gününe denk gelip gelmediğini hesaplar
    const calculateOffsetWithWorkCalendar = (startOffsetHours, durationHours) => {
        const now = new Date();
        let currentOffset = startOffsetHours;
        let remainingDuration = durationHours;
        let visualWidth = 0;

        // Başlangıç noktasını bulmak için (skipSundays aktifse)
        if (skipSundays) {
            let checkOffset = 0;
            let targetStart = startOffsetHours;
            while (checkOffset < targetStart) {
                const checkTime = new Date(now.getTime() + (checkOffset * 60 * 60 * 1000));
                if (checkTime.getDay() === 0) { // Eğer yol üstünde Pazar varsa başlangıcı ötele
                    targetStart += 1;
                }
                checkOffset++;
            }
            currentOffset = targetStart;
        }

        // Genişliği (Width) hesapla
        let tempOffset = currentOffset;
        while (remainingDuration > 0) {
            const checkTime = new Date(now.getTime() + (tempOffset * 60 * 60 * 1000));
            if (skipSundays && checkTime.getDay() === 0) {
                // Pazarsa genişliğe 1 saat ekle ama iş süresinden düşme
                visualWidth += 1;
            } else {
                visualWidth += 1;
                remainingDuration -= 1;
            }
            tempOffset += 1;
        }

        return { start: currentOffset, width: visualWidth, endOffset: tempOffset };
    };

    const timelineData = useMemo(() => {
        const backlogs = machines.map(m => ({ ...m, events: [], totalHours: 0, freeAt: null }));
        const now = new Date();

        projects.forEach(project => {
            if (project.status === 'TAMAMLANDI') return;
            
            project.tasks?.forEach(task => {
                const estTime = parseFloat(task.estimatedCamTime) || 0;
                let taskActiveMachineId = null;

                if (task.operations && Array.isArray(task.operations)) {
                    task.operations.forEach(op => {
                        const isWorking = op.status === OPERATION_STATUS.IN_PROGRESS || op.status === 'ÇALIŞIYOR';
                        if (isWorking) {
                            const opM1 = cleanStr(op.machineName);
                            const opM2 = cleanStr(op.machine);
                            const opM3 = cleanStr(op.assignedMachine);
                            const opM4 = cleanStr(op.machineId);

                            backlogs.forEach(m => {
                                const mNameClean = cleanStr(m.name);
                                const mIdClean = cleanStr(m.id);
                                if (op.machineName === m.name || opM1 === mNameClean || opM1 === mIdClean || opM2 === mNameClean || opM2 === mIdClean || opM3 === mNameClean || opM3 === mIdClean || opM4 === mNameClean || opM4 === mIdClean) {
                                    taskActiveMachineId = m.id;
                                    m.events.push({
                                        id: `active-${task.id}`,
                                        moldName: project.moldName,
                                        taskName: task.taskName,
                                        actualTime: estTime,
                                        duration: estTime > 0 ? estTime : 24, 
                                        isActive: true,
                                        priority: -1
                                    });
                                }
                            });
                        }
                    });
                }

                const isTaskCompleted = task.operations?.every(op => op.status === 'COMPLETED') || false;
                if (task.plannedMachine && !isTaskCompleted) {
                    const targetMachine = backlogs.find(m => m.name === task.plannedMachine);
                    if (targetMachine && targetMachine.id !== taskActiveMachineId) {
                        targetMachine.events.push({
                            id: `queued-${task.id}`,
                            moldName: project.moldName,
                            taskName: task.taskName,
                            actualTime: estTime,
                            duration: estTime > 0 ? estTime : 24,
                            isActive: false,
                            priority: project.priority || 999
                        });
                    }
                }
            });
        });

        backlogs.forEach(m => {
            m.events.sort((a, b) => a.priority - b.priority);
            let currentPointer = 0;
            
            m.events = m.events.map(ev => {
                const { start, width, endOffset } = calculateOffsetWithWorkCalendar(currentPointer, ev.duration);
                const eventData = { ...ev, startHour: start, visualWidth: width };
                currentPointer = endOffset;
                return eventData;
            });

            // Boşa çıkış tarihini hesapla
            if (currentPointer > 0) {
                const finishDate = new Date(now.getTime() + (currentPointer * 60 * 60 * 1000));
                m.freeAt = finishDate.toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
            }
            m.totalHours = currentPointer;
        });

        return backlogs.sort((a, b) => b.totalHours - a.totalHours);
        
    // HATA BURADAYDI: selectedDate kaldırıldı
    }, [projects, machines, skipSundays]);


    return (
        <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-200 dark:border-gray-700 flex flex-col h-[calc(100vh-160px)] overflow-hidden animate-in fade-in">
            
            {/* TOOLBAR */}
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex flex-wrap justify-between items-center bg-gray-50 dark:bg-gray-900/50 gap-4 shrink-0">
                <div className="flex flex-col">
                    <h2 className="text-sm font-black text-gray-800 dark:text-white flex items-center uppercase tracking-widest">
                        <CalendarDays className="w-5 h-5 mr-2 text-indigo-500"/> Üretim Zaman Çizelgesi (Gantt)
                    </h2>
                    <div className="flex items-center gap-3 mt-1">
                        <div className="flex items-center text-[10px] font-bold text-gray-500 uppercase"><div className="w-2 h-2 rounded-full bg-green-500 mr-1"></div> Aktif</div>
                        <div className="flex items-center text-[10px] font-bold text-gray-500 uppercase"><div className="w-2 h-2 rounded-full bg-blue-500 mr-1"></div> Kuyruk</div>
                        
                        {/* PAZAR ATLAMA TOGGLE */}
                        <button 
                            onClick={() => setSkipSundays(!skipSundays)}
                            className={`ml-4 flex items-center px-3 py-1 rounded-full text-[10px] font-black transition-all border ${skipSundays ? 'bg-orange-500 border-orange-600 text-white' : 'bg-gray-100 border-gray-300 text-gray-500 dark:bg-gray-700'}`}
                        >
                            <CalendarRange className="w-3 h-3 mr-1.5" />
                            {skipSundays ? 'PAZARLAR ÇALIŞILMIYOR' : '7/24 ÇALIŞMA PLANI'}
                        </button>
                    </div>
                </div>
                
                <div className="flex items-center bg-gray-200 dark:bg-gray-700 p-1 rounded-xl border border-gray-300 dark:border-gray-600">
                    <ZoomIn className="w-4 h-4 text-gray-400 mx-2" />
                    {['DAILY', 'WEEKLY', 'MONTHLY'].map((mode) => (
                        <button 
                            key={mode}
                            onClick={() => setViewMode(mode)} 
                            className={`px-3 py-1.5 text-[10px] font-black rounded-lg transition-all ${viewMode === mode ? 'bg-white dark:bg-gray-800 text-indigo-600 shadow-sm' : 'text-gray-500'}`}
                        >
                            {mode === 'DAILY' ? 'GÜNLÜK' : mode === 'WEEKLY' ? 'HAFTALIK' : 'AYLIK'}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex-1 overflow-auto custom-scrollbar relative bg-[#f8fafc] dark:bg-[#0f172a]/30">
                
                <div className="flex sticky top-0 z-30 w-max bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                    <div className="w-64 flex-shrink-0 border-r border-gray-200 dark:border-gray-700 p-4 font-black text-[10px] text-gray-400 uppercase tracking-widest sticky left-0 z-40 bg-gray-50 dark:bg-gray-900">
                        TEZGAHLAR VE DURUM
                    </div>
                    {timelineDays.map((day, idx) => (
                        <div key={idx} style={{ width: `${DAY_WIDTH}px` }} className={`flex-shrink-0 flex flex-col justify-center px-4 h-14 border-r border-gray-200 dark:border-gray-700 ${day.isToday ? 'bg-indigo-50/50 dark:bg-indigo-900/10' : day.isSunday ? 'bg-red-50/30 dark:bg-red-900/5' : ''}`}>
                            <div className={`font-black text-sm ${day.isToday ? 'text-indigo-600' : day.isSunday ? 'text-red-500' : 'text-gray-800 dark:text-gray-200'}`}>{day.isToday ? 'Bugün' : day.dateStr}</div>
                            <div className={`text-[10px] font-bold uppercase ${day.isSunday ? 'text-red-400' : 'text-gray-400'}`}>{day.dayName}</div>
                        </div>
                    ))}
                </div>

                <div className="relative w-max">
                    {/* Arka Plan Izgarası ve Hafta Sonu Renklendirmesi */}
                    <div className="absolute top-0 left-64 h-full w-full pointer-events-none flex z-0">
                        {timelineDays.map((day, idx) => (
                            <div 
                                key={idx} 
                                style={{ width: `${DAY_WIDTH}px` }} 
                                className={`border-r border-dashed border-gray-200 dark:border-gray-700/40 h-full ${day.isSunday ? 'bg-gray-200/20 dark:bg-black/20' : day.isSaturday ? 'bg-gray-100/10 dark:bg-white/5' : ''}`}
                            ></div>
                        ))}
                    </div>

                    {timelineData.map((machine) => (
                        <div key={machine.id} className="flex h-24 border-b border-gray-100 dark:border-gray-700/50 group relative z-10">
                            
                            {/* TEZGAH İSMİ VE BOŞA ÇIKIŞ TARİHİ */}
                            <div className="w-64 flex-shrink-0 sticky left-0 z-20 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 p-4 flex flex-col justify-center shadow-[4px_0_10px_rgba(0,0,0,0.02)]">
                                <div className="font-black text-lg text-gray-900 dark:text-white uppercase truncate flex items-center">
                                    <Monitor className="w-5 h-5 mr-2 text-indigo-500 shrink-0" /> {machine.name}
                                </div>
                                {machine.freeAt ? (
                                    <div className="text-[10px] font-bold text-gray-500 mt-1 flex flex-col leading-tight">
                                        <span className="text-gray-400 uppercase text-[8px] font-black">BOŞA ÇIKMA TARİHİ:</span>
                                        <span className="text-indigo-600 dark:text-indigo-400 font-black">{machine.freeAt}</span>
                                    </div>
                                ) : (
                                    <div className="text-[10px] font-bold text-green-500 mt-1 uppercase">Müsait / Boş</div>
                                )}
                            </div>

                            <div className="relative flex-1" style={{ width: `${TOTAL_DAYS_TO_SHOW * DAY_WIDTH}px` }}>
                                {machine.events.map(ev => {
                                    const leftPos = ev.startHour * PIXELS_PER_HOUR;
                                    const widthPx = ev.visualWidth * PIXELS_PER_HOUR;
                                    const isNoTime = ev.actualTime === 0;
                                    
                                    const bgClass = ev.isActive 
                                        ? 'bg-gradient-to-r from-green-500 to-green-600 border border-green-700' 
                                        : isNoTime 
                                            ? 'bg-gradient-to-r from-red-500/80 to-red-600/80 border border-red-700 shadow-inner' 
                                            : 'bg-gradient-to-r from-blue-500 to-blue-600 border border-blue-700';

                                    return (
                                        <div 
                                            key={ev.id}
                                            style={{ left: `${leftPos}px`, width: `${widthPx}px` }}
                                            className={`absolute top-4 bottom-4 rounded-xl flex flex-col justify-center px-3 cursor-help transition-all hover:scale-[1.01] hover:z-30 shadow-sm ${bgClass}`}
                                            title={`${ev.moldName}\nParça: ${ev.taskName}\nNet Süre: ${isNoTime ? 'BELİRTİLMEDİ' : ev.actualTime + ' Saat'}`}
                                        >
                                            {ev.isActive && <div className="absolute top-1 right-2 w-1.5 h-1.5 bg-white rounded-full animate-ping"></div>}
                                            
                                            <div className="flex items-center gap-1.5 overflow-hidden">
                                                {isNoTime && <AlertCircle className="w-3 h-3 text-white shrink-0" />}
                                                <div className="text-[8px] font-black text-white/70 uppercase truncate">{ev.moldName}</div>
                                            </div>
                                            <div className="text-[11px] font-black text-white truncate leading-tight">{ev.taskName}</div>
                                            
                                            <div className="absolute top-0 left-0 w-full h-full bg-black/90 flex flex-col items-center justify-center opacity-0 hover:opacity-100 transition-opacity rounded-xl p-1 text-center">
                                                <div className="text-[9px] font-black text-indigo-400 uppercase leading-none mb-1">{ev.moldName}</div>
                                                <div className="text-white font-black text-[10px] leading-tight mb-1">{ev.taskName}</div>
                                                <div className="flex items-center text-white text-[10px] font-bold bg-white/20 px-2 py-0.5 rounded-full">
                                                    <Clock className="w-2.5 h-2.5 mr-1" /> {isNoTime ? "SÜRE BELİRSİZ" : ev.actualTime + "s"}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default CamTimelineTab;