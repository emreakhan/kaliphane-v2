// src/pages/CncLatheCalendarPage.js

import React, { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock, Layers, Moon, Sun, Coffee } from 'lucide-react';
import { CNC_LATHE_MACHINES } from '../config/constants.js';

// =============================================================================
// ZAMAN MOTORU (TIME ENGINE)
// Üretim simülasyonunun kalbi burasıdır.
// =============================================================================

// Bir tarihin haftasonuna denk gelip gelmediği
const isWeekend = (date) => {
    const day = date.getDay();
    return day === 0 || day === 6; // 0: Pazar, 6: Cumartesi
};

// Belirtilen zaman diliminin "Çalışma Saati" olup olmadığını kontrol eder
const isWorkingTime = (date) => {
    // 1. Kural: Hafta sonu tatil
    if (isWeekend(date)) return false;

    const hour = date.getHours();

    // 2. Kural: Vardiya Saatleri
    // 00:00 - 08:00 -> ÇALIŞIYOR (Gece Vardiyası)
    // 08:00 - 18:00 -> ÇALIŞIYOR (Gündüz Vardiyası)
    // 18:00 - 22:00 -> DURUYOR (Mola)
    // 22:00 - 00:00 -> ÇALIŞIYOR (Gece Vardiyası)
    
    if (hour >= 0 && hour < 8) return true;   // 00-08
    if (hour >= 8 && hour < 18) return true;  // 08-18
    if (hour >= 18 && hour < 22) return false; // 18-22 (MOLA)
    if (hour >= 22) return true;              // 22-24

    return false;
};

// Başlangıç tarihine, sadece "Çalışma Saatlerini" sayarak süre ekler
const addProductionTime = (startDate, minutesToAdd) => {
    let currentDate = new Date(startDate);
    let remainingMinutes = minutesToAdd;

    // Sonsuz döngü koruması (maksimum 1 yıl ileri sar)
    let safetyCounter = 0;
    const MAX_LOOPS = 60 * 24 * 365; 

    while (remainingMinutes > 0 && safetyCounter < MAX_LOOPS) {
        // 1 dakika ileri sar
        currentDate.setMinutes(currentDate.getMinutes() + 1);
        safetyCounter++;

        // Eğer şu anki dakika "Çalışma Saati" içindeyse, kalan süreden düş
        if (isWorkingTime(currentDate)) {
            remainingMinutes--;
        }
        // Değilse (Mola veya Hafta Sonu), zaman akar ama iş ilerlemez (remainingMinutes azalmaz)
    }

    return currentDate;
};

// =============================================================================
// GÖRÜNÜM YARDIMCILARI
// =============================================================================

const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const days = [];
    const firstDay = new Date(year, month, 1);
    
    // Pazartesi ile başlat
    const startDay = firstDay.getDay(); 
    const diff = startDay === 0 ? 6 : startDay - 1; 
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - diff);

    for (let i = 0; i < 42; i++) {
        days.push(new Date(startDate));
        startDate.setDate(startDate.getDate() + 1);
    }
    return days;
};

const getDaysInWeek = (date) => {
    const current = new Date(date);
    const day = current.getDay();
    const diff = current.getDate() - day + (day === 0 ? -6 : 1); 
    current.setDate(diff);
    
    const days = [];
    for (let i = 0; i < 7; i++) {
        days.push(new Date(current));
        current.setDate(current.getDate() + 1);
    }
    return days;
};

// =============================================================================
// ANA BİLEŞEN
// =============================================================================

const CncLatheCalendarPage = ({ cncJobs }) => {
    const [viewMode, setViewMode] = useState('month');
    const [currentDate, setCurrentDate] = useState(new Date());

    // --- SİMÜLASYON HESAPLAMASI ---
    const machineSchedules = useMemo(() => {
        if (!cncJobs) return {};
        const schedules = {};

        CNC_LATHE_MACHINES.forEach(machine => {
            // 1. İşleri Filtrele
            let jobs = cncJobs.filter(j => 
                j.machine === machine && 
                j.status !== 'COMPLETED'
            );

            // 2. Sırala (Order Index'e Göre)
            jobs.sort((a, b) => {
                if (a.status === 'RUNNING') return -1; // Çalışan hep en başta
                if (b.status === 'RUNNING') return 1;
                const indexA = a.orderIndex !== undefined ? a.orderIndex : 9999;
                const indexB = b.orderIndex !== undefined ? b.orderIndex : 9999;
                return indexA - indexB;
            });

            // 3. Simülasyon Başlat
            // "Cursor": Zaman çizelgesindeki imleç.
            // Başlangıçta "ŞİMDİ"dedir.
            let cursorTime = new Date(); 

            // Eğer şu an çalışma saati değilse, ilk çalışma saatine sar
            // (Örneğin Pazar günü bakıyorsak, planlama Pazartesi 00:00'dan başlar)
            if (!isWorkingTime(cursorTime)) {
                // Yapay bir iş ekleyerek (0 dakika) zamanı çalışma saatine ötele
                cursorTime = addProductionTime(cursorTime, 0);
            }

            const plannedJobs = jobs.map(job => {
                // İşlem Süresi (Dakika)
                const cycleTime = parseFloat(job.cycleTime) || 0; // saniye
                const quantity = parseInt(job.targetQuantity) || 0;
                const productionMinutes = Math.ceil((cycleTime * quantity) / 60);
                
                // Ayar Süresi (Dakika) -> 2 Saat = 120 Dakika
                const setupMinutes = 120; 

                // İşin Başlangıç Zamanı
                let startTime;
                if (job.status === 'RUNNING') {
                    // Çalışan iş gerçek saatinde başlar
                    startTime = job.startTime ? new Date(job.startTime) : new Date();
                } else {
                    // Bekleyen iş, imleçten (önceki işin bitişi + ayar) sonra başlar
                    // Önce AYAR süresini ekle (Ayar da mesai saatinden yer)
                    const setupEndTime = addProductionTime(cursorTime, setupMinutes);
                    startTime = setupEndTime;
                }

                // İşin Bitiş Zamanı
                const endTime = addProductionTime(startTime, productionMinutes);

                // İmleci güncelle
                cursorTime = new Date(endTime);

                return {
                    ...job,
                    calculatedStart: startTime,
                    calculatedEnd: endTime,
                    productionMinutes: productionMinutes,
                    setupMinutes: setupMinutes
                };
            });

            schedules[machine] = plannedJobs;
        });

        return schedules;
    }, [cncJobs]);

    // --- NAVİGASYON ---
    const handlePrev = () => {
        const newDate = new Date(currentDate);
        if (viewMode === 'month') newDate.setMonth(newDate.getMonth() - 1);
        else newDate.setDate(newDate.getDate() - 7);
        setCurrentDate(newDate);
    };
    const handleNext = () => {
        const newDate = new Date(currentDate);
        if (viewMode === 'month') newDate.setMonth(newDate.getMonth() + 1);
        else newDate.setDate(newDate.getDate() + 7);
        setCurrentDate(newDate);
    };
    const handleToday = () => setCurrentDate(new Date());

    const calendarDays = viewMode === 'month' ? getDaysInMonth(currentDate) : getDaysInWeek(currentDate);

    // --- RENDER MANTIĞI ---
    const renderJobBar = (job, dayDate) => {
        const dayStart = new Date(dayDate); dayStart.setHours(0,0,0,0);
        const dayEnd = new Date(dayDate); dayEnd.setHours(23,59,59,999);

        // İş bu günün içinde mi?
        if (job.calculatedEnd < dayStart || job.calculatedStart > dayEnd) return null;

        const isRunning = job.status === 'RUNNING';
        const isStartDay = job.calculatedStart >= dayStart && job.calculatedStart <= dayEnd;
        const isEndDay = job.calculatedEnd >= dayStart && job.calculatedEnd <= dayEnd;

        // Stil Hesaplama (Tek Bar Görünümü)
        let borderClass = 'rounded-none border-x-0 -mx-1'; // Varsayılan: Ortadan geçen bar
        let widthStyle = {};

        if (isStartDay && isEndDay) {
            borderClass = 'rounded-md mx-1'; 
        } else if (isStartDay) {
            borderClass = 'rounded-l-md ml-1 -mr-1 border-r-0';
        } else if (isEndDay) {
            borderClass = 'rounded-r-md mr-1 -ml-1 border-l-0';
        }

        const colorClass = isRunning 
            ? 'bg-green-600 text-white shadow-sm' 
            : 'bg-blue-600 text-white shadow-sm';

        return (
            <div 
                key={job.id}
                className={`
                    h-8 flex items-center px-2 text-xs font-bold cursor-help relative overflow-hidden transition hover:brightness-110 z-10
                    ${colorClass} ${borderClass}
                `}
                title={`
İŞ PLANI DETAYI
----------------
Parça: ${job.partName}
Adet: ${job.targetQuantity}
Sıra No: ${job.orderIndex !== undefined ? job.orderIndex + 1 : '-'}
Durum: ${isRunning ? 'ÇALIŞIYOR' : 'PLANLANDI'}

ZAMANLAMA
----------
Başlangıç: ${job.calculatedStart.toLocaleString('tr-TR')}
Bitiş: ${job.calculatedEnd.toLocaleString('tr-TR')}
İşleme Süresi: ${(job.productionMinutes / 60).toFixed(1)} Saat (Net Çalışma)
Ayar Payı: 2 Saat (Dahil Edildi)
                `.trim()}
            >
                {/* Sadece başlangıç gününde veya haftanın ilk gününde metni göster */}
                {(isStartDay || dayDate.getDay() === 1) ? (
                    <div className="flex flex-col justify-center leading-tight w-full">
                        <div className="truncate">{job.partName}</div>
                        <div className="text-[9px] opacity-90 font-normal truncate flex items-center gap-1">
                            {isRunning && <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse"></span>}
                            {job.targetQuantity} ad. 
                            ({(job.productionMinutes/60).toFixed(0)}s)
                        </div>
                    </div>
                ) : (
                    // Devam eden günlerde boş bırak (temiz görünüm)
                    <span className="opacity-20 text-[8px] mx-auto">•••</span>
                )}
            </div>
        );
    };

    return (
        <div className="p-4 sm:p-6 min-h-screen bg-gray-100 dark:bg-gray-900 font-sans">
            
            {/* ÜST BAR */}
            <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
                <div className="flex items-center">
                    <CalendarIcon className="w-8 h-8 text-blue-600 mr-3" />
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">CNC Üretim Takvimi</h1>
                        <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
                            <span className="bg-green-100 text-green-800 text-[10px] px-2 py-0.5 rounded font-bold">08:00-18:00</span>
                            <span className="bg-gray-200 text-gray-800 text-[10px] px-2 py-0.5 rounded font-bold">18:00-22:00 (Mola)</span>
                            <span className="bg-indigo-100 text-indigo-800 text-[10px] px-2 py-0.5 rounded font-bold">22:00-08:00</span>
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button onClick={handlePrev} className="p-2 hover:bg-gray-200 rounded-full dark:text-white"><ChevronLeft /></button>
                    <span className="font-bold text-lg min-w-[150px] text-center dark:text-white capitalize">
                        {currentDate.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })}
                    </span>
                    <button onClick={handleNext} className="p-2 hover:bg-gray-200 rounded-full dark:text-white"><ChevronRight /></button>
                    <button onClick={handleToday} className="ml-2 px-3 py-1 text-xs font-bold text-blue-600 border border-blue-200 rounded hover:bg-blue-50">Bugün</button>
                </div>

                <div className="flex bg-white dark:bg-gray-800 rounded-lg shadow p-1">
                    <button onClick={() => setViewMode('month')} className={`px-4 py-2 text-sm font-bold rounded ${viewMode === 'month' ? 'bg-blue-600 text-white' : 'text-gray-500'}`}>Aylık</button>
                    <button onClick={() => setViewMode('week')} className={`px-4 py-2 text-sm font-bold rounded ${viewMode === 'week' ? 'bg-blue-600 text-white' : 'text-gray-500'}`}>Haftalık</button>
                </div>
            </div>

            {/* TAKVİM */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                
                {/* Başlıklar */}
                <div className="grid grid-cols-[100px_1fr] border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                    <div className="p-4 font-bold text-gray-500 text-center flex items-center justify-center">TEZGAH</div>
                    <div className={`grid ${viewMode === 'month' ? 'grid-cols-7' : 'grid-cols-7'}`}>
                        {calendarDays.slice(0, 7).map((d, i) => (
                            <div key={i} className={`p-2 text-center text-xs font-bold uppercase ${isWeekend(d) ? 'text-red-500' : 'text-gray-500'}`}>
                                {d.toLocaleDateString('tr-TR', { weekday: 'short' })}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Satırlar */}
                {CNC_LATHE_MACHINES.map(machine => {
                    const jobs = machineSchedules[machine] || [];

                    return (
                        <div key={machine} className="grid grid-cols-[100px_1fr] border-b border-gray-200 dark:border-gray-700 min-h-[100px]">
                            {/* Makine Adı */}
                            <div className="p-4 border-r border-gray-200 dark:border-gray-700 flex flex-col items-center justify-center bg-gray-50/50 dark:bg-gray-900/30">
                                <span className="font-black text-gray-800 dark:text-white">{machine}</span>
                                <span className="text-[10px] text-gray-400">{jobs.length} İş</span>
                            </div>

                            {/* Hücreler */}
                            <div className={`grid ${viewMode === 'month' ? 'grid-cols-7 auto-rows-fr' : 'grid-cols-7'} divide-x divide-gray-200 dark:divide-gray-700`}>
                                {calendarDays.map((day, i) => {
                                    const isHoliday = isWeekend(day);
                                    const isToday = day.toDateString() === new Date().toDateString();
                                    const isCurrentMonth = day.getMonth() === currentDate.getMonth();

                                    return (
                                        <div key={i} className={`relative p-1 min-h-[100px] flex flex-col gap-1 
                                            ${!isCurrentMonth ? 'bg-gray-50/50 dark:bg-black/40' : ''}
                                            ${isHoliday ? 'bg-red-50/50 dark:bg-red-900/10' : ''}
                                            ${isToday ? 'bg-blue-50/30' : ''}
                                        `}>
                                            <span className={`text-[10px] font-bold text-right block mb-1 ${isHoliday ? 'text-red-400' : 'text-gray-400'}`}>
                                                {day.getDate()}
                                            </span>

                                            {/* Bar Render */}
                                            <div className="flex flex-col gap-1">
                                                {jobs.map(job => renderJobBar(job, day))}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Bilgi */}
            <div className="mt-4 flex gap-4 text-xs text-gray-500">
                <div className="flex items-center"><div className="w-3 h-3 bg-green-600 rounded mr-2"></div> Çalışan</div>
                <div className="flex items-center"><div className="w-3 h-3 bg-blue-600 rounded mr-2"></div> Planlanan</div>
                <div className="flex items-center"><Layers className="w-4 h-4 mr-1"/> Otomatik +2 Saat Ayar Süresi</div>
                <div className="flex items-center"><Coffee className="w-4 h-4 mr-1"/> 18:00-22:00 Molası Düşülür</div>
            </div>
        </div>
    );
};

export default CncLatheCalendarPage;