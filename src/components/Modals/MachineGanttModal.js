// src/components/Modals/MachineGanttModal.js

import React, { useState, useMemo, useEffect } from 'react';
import { 
    X, Search, Activity, Monitor, Info
} from 'lucide-react';
import { formatDurationHours, formatFreeAtDate } from '../../utils/dateUtils.js';

// İş barları için zengin ve ayrışabilir renk paleti
const BAR_COLORS = [
    { bg: 'bg-indigo-600 dark:bg-indigo-500', border: 'border-indigo-400 dark:border-indigo-300', text: 'text-white' },
    { bg: 'bg-purple-600 dark:bg-purple-500', border: 'border-purple-400 dark:border-purple-300', text: 'text-white' },
    { bg: 'bg-blue-600 dark:bg-blue-500', border: 'border-blue-400 dark:border-blue-300', text: 'text-white' },
    { bg: 'bg-teal-600 dark:bg-teal-500', border: 'border-teal-400 dark:border-teal-300', text: 'text-white' },
    { bg: 'bg-amber-600 dark:bg-amber-500', border: 'border-amber-400 dark:border-amber-300', text: 'text-white' },
    { bg: 'bg-rose-600 dark:bg-rose-500', border: 'border-rose-400 dark:border-rose-300', text: 'text-white' },
    { bg: 'bg-cyan-600 dark:bg-cyan-500', border: 'border-cyan-400 dark:border-cyan-300', text: 'text-white' },
    { bg: 'bg-violet-600 dark:bg-violet-500', border: 'border-violet-400 dark:border-violet-300', text: 'text-white' },
    { bg: 'bg-orange-600 dark:bg-orange-500', border: 'border-orange-400 dark:border-orange-300', text: 'text-white' },
    { bg: 'bg-emerald-700 dark:bg-emerald-600', border: 'border-emerald-400 dark:border-emerald-300', text: 'text-white' },
];

const MachineGanttModal = ({ isOpen, onClose, machineLoadList = [] }) => {
    // Zaman ölçeği: '1_WEEK' (7 gün), '2_WEEKS' (14 gün), '3_WEEKS' (21 gün), '1_MONTH' (30 gün)
    const [timeScale, setTimeScale] = useState('2_WEEKS');
    const [searchMachine, setSearchMachine] = useState('');
    const [hoveredJob, setHoveredJob] = useState(null);
    const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

    // ESC ile kapatma
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') onClose();
        };
        if (isOpen) {
            window.addEventListener('keydown', handleKeyDown);
        }
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    // Zaman ölçeği konfigürasyonu
    const scaleConfig = useMemo(() => {
        switch (timeScale) {
            case '1_WEEK':
                return { days: 7, pxPerHour: 18, label: '1 Hafta (7 Gün)' };
            case '3_WEEKS':
                return { days: 21, pxPerHour: 8, label: '3 Hafta (21 Gün)' };
            case '1_MONTH':
                return { days: 30, pxPerHour: 5, label: '1 Ay (30 Gün)' };
            case '2_WEEKS':
            default:
                return { days: 14, pxPerHour: 11, label: '2 Hafta (14 Gün)' };
        }
    }, [timeScale]);

    const { days: totalDays, pxPerHour } = scaleConfig;
    const dayWidth = pxPerHour * 24;

    // Gün başlıkları listesi
    const timelineDays = useMemo(() => {
        const list = [];
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        for (let i = 0; i < totalDays; i++) {
            const d = new Date(today);
            d.setDate(today.getDate() + i);
            const dayOfWeek = d.getDay(); // 0: Pazar, 6: Cmt
            list.push({
                index: i,
                date: d,
                dateStr: d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }),
                dayName: d.toLocaleDateString('tr-TR', { weekday: 'short' }),
                isToday: i === 0,
                isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
                isSunday: dayOfWeek === 0
            });
        }
        return list;
    }, [totalDays]);

    // Filtrelenmiş tezgah listesi
    const filteredMachines = useMemo(() => {
        if (!searchMachine.trim()) return machineLoadList;
        return machineLoadList.filter(m => 
            m.name.toLowerCase().includes(searchMachine.toLowerCase().trim())
        );
    }, [machineLoadList, searchMachine]);

    // Tezgah bazlı zaman çizelgesi verilerini hesaplama
    const timelineRows = useMemo(() => {
        const now = new Date();

        return filteredMachines.map(machine => {
            const bars = [];
            let currentOffsetHours = 0;

            // 1. Aktif İş (Varsa)
            if (machine.activeJob) {
                const job = machine.activeJob;
                const duration = Math.max(0.5, parseFloat(job.time) || 8);
                const progress = Math.min(100, Math.max(0, parseFloat(job.progress) || 0));
                
                const barStartOffset = 0;
                const barWidth = duration * pxPerHour;
                const startDate = new Date(now.getTime());
                const endDate = new Date(now.getTime() + duration * 3600 * 1000);

                bars.push({
                    id: `active-${machine.id}-${job.taskId || 'job'}`,
                    job,
                    isActive: true,
                    startHour: barStartOffset,
                    widthPx: Math.max(20, barWidth),
                    startDate,
                    endDate,
                    progress,
                    color: {
                        bg: 'bg-gradient-to-r from-emerald-600 to-teal-600 dark:from-emerald-500 dark:to-teal-500',
                        border: 'border-emerald-400 dark:border-emerald-300',
                        text: 'text-white'
                    }
                });

                currentOffsetHours += duration;
            }

            // 2. Sırada Bekleyen / Planlanan İşler
            (machine.queuedJobs || []).forEach((job, qIdx) => {
                const duration = Math.max(0.5, parseFloat(job.time) || 8);
                const barStartOffset = currentOffsetHours;
                const barWidth = duration * pxPerHour;
                const startDate = new Date(now.getTime() + barStartOffset * 3600 * 1000);
                const endDate = new Date(now.getTime() + (barStartOffset + duration) * 3600 * 1000);
                
                const palette = BAR_COLORS[qIdx % BAR_COLORS.length];

                bars.push({
                    id: `queued-${machine.id}-${job.taskId || qIdx}-${qIdx}`,
                    job,
                    isActive: false,
                    startHour: barStartOffset,
                    widthPx: Math.max(20, barWidth),
                    startDate,
                    endDate,
                    progress: 0,
                    color: palette
                });

                currentOffsetHours += duration;
            });

            return {
                machine,
                bars,
                totalHours: currentOffsetHours
            };
        });
    }, [filteredMachines, pxPerHour]);

    // İstatistikler
    const stats = useMemo(() => {
        const total = machineLoadList.length;
        const busy = machineLoadList.filter(m => m.status === 'BUSY').length;
        const queued = machineLoadList.filter(m => m.status === 'QUEUED').length;
        const available = machineLoadList.filter(m => m.status === 'AVAILABLE').length;
        const totalHours = machineLoadList.reduce((acc, m) => acc + (m.totalHours || 0), 0);
        return { total, busy, queued, available, totalHours };
    }, [machineLoadList]);

    if (!isOpen) return null;

    const handleMouseMove = (e) => {
        setMousePos({ x: e.clientX, y: e.clientY });
    };

    return (
        <div 
            className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 animate-in fade-in"
            onMouseMove={handleMouseMove}
        >
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 w-full h-[95vh] max-w-[98vw] flex flex-col overflow-hidden">
                
                {/* 1. ÜST BAŞLIK VE KONTROLLER */}
                <div className="p-3 sm:p-4 border-b border-gray-200 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-800/80 flex flex-col md:flex-row justify-between items-start md:items-center gap-3 shrink-0">
                    <div className="flex items-center gap-2.5">
                        <div className="p-2 rounded-xl bg-purple-600 text-white shadow-md">
                            <Activity className="w-5 h-5" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h2 className="text-base sm:text-lg font-black text-gray-900 dark:text-white">
                                    Tezgah Doluluk ve Zaman Çizelgesi (Gantt Planı)
                                </h2>
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300">
                                    Canlı İmalat Akışı
                                </span>
                            </div>
                            <p className="text-[11px] text-gray-500 dark:text-gray-400 font-medium">
                                Tezgah ve iş barları senkronize çalışır; yatayda kaydırabilir ve mouse ile detayları görebilirsiniz.
                            </p>
                        </div>
                    </div>

                    {/* Kontroller: Zaman Ölçeği Seçimi & Arama & Kapat */}
                    <div className="flex items-center gap-2 flex-wrap self-end md:self-center">
                        {/* Zaman Ölçeği Butonları */}
                        <div className="flex items-center p-0.5 bg-gray-200/80 dark:bg-gray-700/80 rounded-xl text-xs font-bold shadow-inner">
                            <button
                                type="button"
                                onClick={() => setTimeScale('1_WEEK')}
                                className={`px-2.5 py-1 rounded-lg transition ${timeScale === '1_WEEK' ? 'bg-white dark:bg-gray-900 text-purple-700 dark:text-purple-300 shadow-xs font-black' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'}`}
                            >
                                1 Hafta
                            </button>
                            <button
                                type="button"
                                onClick={() => setTimeScale('2_WEEKS')}
                                className={`px-2.5 py-1 rounded-lg transition ${timeScale === '2_WEEKS' ? 'bg-white dark:bg-gray-900 text-purple-700 dark:text-purple-300 shadow-xs font-black' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'}`}
                            >
                                2 Hafta
                            </button>
                            <button
                                type="button"
                                onClick={() => setTimeScale('3_WEEKS')}
                                className={`px-2.5 py-1 rounded-lg transition ${timeScale === '3_WEEKS' ? 'bg-white dark:bg-gray-900 text-purple-700 dark:text-purple-300 shadow-xs font-black' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'}`}
                            >
                                3 Hafta
                            </button>
                            <button
                                type="button"
                                onClick={() => setTimeScale('1_MONTH')}
                                className={`px-2.5 py-1 rounded-lg transition ${timeScale === '1_MONTH' ? 'bg-white dark:bg-gray-900 text-purple-700 dark:text-purple-300 shadow-xs font-black' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'}`}
                            >
                                Aylık
                            </button>
                        </div>

                        {/* Tezgah Filtreleme Arama Kutusu */}
                        <div className="relative">
                            <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Tezgah ara..."
                                value={searchMachine}
                                onChange={(e) => setSearchMachine(e.target.value)}
                                className="pl-8 pr-3 py-1 w-32 sm:w-40 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl text-xs font-bold text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-purple-500 shadow-xs"
                            />
                        </div>

                        {/* Kapat Butonu */}
                        <button
                            type="button"
                            onClick={onClose}
                            className="p-1.5 rounded-xl text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 transition"
                            title="Kapat (ESC)"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* 2. LEJANT VE HIZLI İSTATİSTİK ŞERİDİ */}
                <div className="px-4 py-2 bg-gray-100/60 dark:bg-gray-800/40 border-b border-gray-200 dark:border-gray-800 flex justify-between items-center text-xs flex-wrap gap-2 shrink-0">
                    <div className="flex items-center gap-3.5 flex-wrap">
                        <div className="flex items-center gap-1.5 font-bold text-gray-700 dark:text-gray-300 text-[11px]">
                            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse border border-emerald-300"></span>
                            <span>Aktif İşlenen Parça</span>
                        </div>
                        <div className="flex items-center gap-1.5 font-bold text-gray-700 dark:text-gray-300 text-[11px]">
                            <span className="w-2.5 h-2.5 rounded bg-indigo-600 border border-indigo-400"></span>
                            <span>Sıradaki Planlanan Parçalar</span>
                        </div>
                        <div className="flex items-center gap-1.5 font-bold text-gray-700 dark:text-gray-300 text-[11px]">
                            <span className="w-2.5 h-2.5 rounded bg-gray-200 dark:bg-gray-700 border border-dashed border-gray-400"></span>
                            <span>Boş Zaman Aralığı</span>
                        </div>
                    </div>

                    <div className="flex items-center gap-2.5 font-mono font-bold text-[11px] text-gray-600 dark:text-gray-300">
                        <span>Toplam: <strong className="text-gray-900 dark:text-white">{stats.total} Tezgah</strong></span>
                        <span className="text-emerald-600 dark:text-emerald-400 font-bold">🟢 {stats.busy} Dolu</span>
                        <span className="text-amber-600 dark:text-amber-400 font-bold">🟡 {stats.queued} Sırada</span>
                        <span className="text-blue-600 dark:text-blue-400 font-bold">⚪ {stats.available} Boş</span>
                        <span className="px-2 py-0.5 rounded bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 font-black">
                            {formatDurationHours(stats.totalHours)} Toplam Yük
                        </span>
                    </div>
                </div>

                {/* 3. TEK PARÇA (UNIFIED) GANTT TABLOSU: TEZGAH LİSTESİ VE PARÇALAR KİLİTLİ VE SENKRON KAYAR */}
                <div className="flex-1 overflow-auto custom-scrollbar bg-slate-50/50 dark:bg-slate-900/50 relative">
                    <div style={{ width: `${240 + (totalDays * dayWidth)}px`, minWidth: '100%' }}>
                        
                        {/* BAŞLIK SATIRI (STICKY TOP) */}
                        <div className="sticky top-0 z-30 flex h-11 border-b border-gray-200 dark:border-gray-800 bg-gray-100 dark:bg-gray-800 shadow-xs select-none">
                            {/* Sol Üst Köşe (Sticky Top & Left): Tezgah Listesi Başlığı */}
                            <div className="sticky left-0 z-40 w-60 shrink-0 h-full border-r border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 px-3 flex items-center justify-between shadow-[3px_0_6px_-2px_rgba(0,0,0,0.12)] dark:shadow-[3px_0_6px_-2px_rgba(0,0,0,0.4)]">
                                <span className="font-extrabold text-xs text-gray-800 dark:text-gray-200 uppercase tracking-wider flex items-center gap-1.5">
                                    <Monitor className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                                    <span>Tezgah ({filteredMachines.length})</span>
                                </span>
                                <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400">
                                    Durum
                                </span>
                            </div>

                            {/* Sağ Üst Başlık: Günler */}
                            <div className="flex flex-1">
                                {timelineDays.map((day) => (
                                    <div 
                                        key={day.index} 
                                        style={{ width: `${dayWidth}px` }}
                                        className={`h-full border-r border-gray-200 dark:border-gray-700/60 px-1 flex flex-col justify-center items-center text-center ${
                                            day.isToday 
                                                ? 'bg-purple-100/70 dark:bg-purple-950/50 text-purple-900 dark:text-purple-200 font-black' 
                                                : (day.isWeekend ? 'bg-gray-200/40 dark:bg-gray-800/40 text-gray-400' : 'text-gray-700 dark:text-gray-300')
                                        }`}
                                    >
                                        <div className="flex items-center gap-1">
                                            <span className="text-xs font-black leading-none">{day.dateStr}</span>
                                            {day.isToday && (
                                                <span className="text-[8px] px-1 py-0.2 rounded bg-purple-600 text-white font-black uppercase">
                                                    Bugün
                                                </span>
                                            )}
                                        </div>
                                        <span className="text-[9px] font-bold uppercase tracking-wider opacity-75 mt-0.5">
                                            {day.dayName}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* GÖVDE SATIRLARI (HER TEZGAH İÇİN DAR VE SENKRON BİR SATIR) */}
                        <div className="divide-y divide-gray-100 dark:divide-gray-800/80">
                            {timelineRows.map(({ machine, bars }) => {
                                const isBusy = machine.status === 'BUSY';
                                const hasQueue = machine.queuedJobs && machine.queuedJobs.length > 0;

                                return (
                                    <div 
                                        key={machine.id} 
                                        className="flex h-12 relative group hover:bg-slate-100/60 dark:hover:bg-slate-800/40 transition-colors"
                                    >
                                        {/* SOL HÜCRE (STICKY LEFT): SADE VE DAR TEZGAH ADI + DURUM ROZETİ */}
                                        <div className="sticky left-0 z-20 w-60 shrink-0 h-12 border-r border-gray-200 dark:border-gray-700/80 bg-white dark:bg-gray-900 px-3 flex items-center justify-between shadow-[3px_0_6px_-2px_rgba(0,0,0,0.12)] dark:shadow-[3px_0_6px_-2px_rgba(0,0,0,0.4)]">
                                            <div className="truncate mr-1">
                                                <h4 className="font-black text-xs text-gray-900 dark:text-white truncate">
                                                    {machine.name}
                                                </h4>
                                                <span className="text-[9px] text-gray-400 dark:text-gray-500 font-semibold block truncate">
                                                    {machine.type || 'CNC'}
                                                </span>
                                            </div>

                                            {/* Kompakt Durum ve Doluluk Rozeti */}
                                            <div className="shrink-0 flex items-center">
                                                {isBusy ? (
                                                    <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300 border border-red-200 dark:border-red-800 flex items-center gap-1">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span>
                                                        <span>Dolu ({machine.totalHours}s)</span>
                                                    </span>
                                                ) : hasQueue ? (
                                                    <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                                                        {machine.queuedJobs.length} İş ({machine.totalHours}s)
                                                    </span>
                                                ) : (
                                                    <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                                                        Boş
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {/* SAĞ HÜCRE (ZAMAN ÇİZELGESİ VE PARÇA BARLARI) */}
                                        <div 
                                            style={{ width: `${totalDays * dayWidth}px` }}
                                            className="h-12 relative shrink-0 flex items-center"
                                        >
                                            {/* Arka Plan Kılavuz Çizgileri */}
                                            <div className="absolute inset-0 flex pointer-events-none">
                                                {timelineDays.map(day => (
                                                    <div 
                                                        key={day.index}
                                                        style={{ width: `${dayWidth}px` }}
                                                        className={`h-full border-r border-gray-200/50 dark:border-gray-800/50 ${
                                                            day.isToday 
                                                                ? 'bg-purple-50/20 dark:bg-purple-950/10' 
                                                                : (day.isWeekend ? 'bg-gray-100/20 dark:bg-gray-800/20' : '')
                                                        }`}
                                                    />
                                                ))}
                                            </div>

                                            {/* İş Barları */}
                                            <div className="absolute inset-x-0 h-8 top-2 z-10 pointer-events-auto">
                                                {bars.length === 0 ? (
                                                    <div className="h-full flex items-center pl-3 text-[11px] font-medium text-gray-400 dark:text-gray-500 italic select-none">
                                                        Planlanmış iş yok (Tezgah müsait)
                                                    </div>
                                                ) : (
                                                    bars.map(bar => {
                                                        const leftPx = bar.startHour * pxPerHour;
                                                        const widthPx = bar.widthPx;

                                                        return (
                                                            <div
                                                                key={bar.id}
                                                                style={{
                                                                    left: `${leftPx}px`,
                                                                    width: `${widthPx}px`,
                                                                }}
                                                                onMouseEnter={() => setHoveredJob(bar)}
                                                                onMouseLeave={() => setHoveredJob(null)}
                                                                className={`absolute top-0 bottom-0 rounded-lg border shadow-xs cursor-pointer transition-all duration-100 hover:brightness-110 hover:shadow-md flex items-center justify-between px-2 overflow-hidden select-none group/bar ${bar.color.bg} ${bar.color.border} ${bar.color.text}`}
                                                            >
                                                                {/* İlerleme Dolgusu */}
                                                                {bar.isActive && (
                                                                    <div 
                                                                        className="absolute inset-0 bg-white/25 dark:bg-black/25 pointer-events-none"
                                                                        style={{ width: `${bar.progress}%` }}
                                                                    />
                                                                )}

                                                                {/* Bar İçeriği (Tek Kompakt Satır) */}
                                                                <div className="flex items-center gap-1.5 truncate relative z-10 mr-1">
                                                                    {bar.isActive && (
                                                                        <span className="w-2 h-2 rounded-full bg-white animate-ping shrink-0" />
                                                                    )}
                                                                    {bar.job.workOrderNo && (
                                                                        <span className="font-mono text-[9px] font-black px-1 py-0.2 rounded bg-black/40 text-white shrink-0">
                                                                            {bar.job.workOrderNo}
                                                                        </span>
                                                                    )}
                                                                    <span className="font-black text-[11px] truncate">
                                                                        {bar.job.taskName}
                                                                    </span>
                                                                    <span className="text-[10px] opacity-80 truncate hidden sm:inline">
                                                                        ({bar.job.moldName})
                                                                    </span>
                                                                </div>

                                                                {/* Süre Rozeti */}
                                                                <span className="font-mono text-[10px] font-black shrink-0 relative z-10 px-1 rounded bg-black/30">
                                                                    {bar.isActive ? `%${bar.progress}` : `${bar.job.time}s`}
                                                                </span>
                                                            </div>
                                                        );
                                                    })
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* 4. HOVER TOOLTIP / POPOVER */}
                {hoveredJob && (
                    <div 
                        style={{
                            left: `${Math.min(window.innerWidth - 340, mousePos.x + 15)}px`,
                            top: `${Math.min(window.innerHeight - 260, mousePos.y + 15)}px`
                        }}
                        className="fixed z-50 w-80 p-3 bg-gray-900/95 text-white rounded-2xl shadow-2xl border border-gray-700 backdrop-blur-md pointer-events-none animate-in fade-in zoom-in-95 duration-100 space-y-1.5 text-xs"
                    >
                        <div className="flex justify-between items-start border-b border-gray-700/80 pb-1.5">
                            <div>
                                <span className="font-mono text-[10px] font-black px-1.5 py-0.5 rounded bg-blue-500 text-white">
                                    {hoveredJob.job.workOrderNo || 'İş Emri Yok'}
                                </span>
                                <h4 className="font-black text-sm text-white mt-1">
                                    {hoveredJob.job.taskName}
                                </h4>
                                <span className="text-[11px] text-gray-400 font-bold block">
                                    Kalıp: {hoveredJob.job.moldName} ({hoveredJob.job.customer || 'Müşteri Belirtilmedi'})
                                </span>
                            </div>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                                hoveredJob.isActive ? 'bg-emerald-500 text-white animate-pulse' : 'bg-indigo-500 text-white'
                            }`}>
                                {hoveredJob.isActive ? `İŞLENİYOR (%${hoveredJob.progress})` : 'KUYRUKTA'}
                            </span>
                        </div>

                        <div className="space-y-1 text-[11px]">
                            <div className="flex justify-between">
                                <span className="text-gray-400">Operasyon:</span>
                                <span className="font-bold text-cyan-300">{hoveredJob.job.opType || 'İşleme'}</span>
                            </div>
                            {hoveredJob.job.subOperations && hoveredJob.job.subOperations.length > 0 && (
                                <div className="flex justify-between">
                                    <span className="text-gray-400">Alt İşlemler:</span>
                                    <span className="font-semibold text-gray-200">{hoveredJob.job.subOperations.join(', ')}</span>
                                </div>
                            )}
                            <div className="flex justify-between">
                                <span className="text-gray-400">Planlanan Süre:</span>
                                <span className="font-black text-purple-300">{formatDurationHours(hoveredJob.job.time)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-400">CAM Operatörü:</span>
                                <span className="font-semibold text-gray-200">{hoveredJob.job.camOperator}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-400">Tezgah Operatörü:</span>
                                <span className="font-semibold text-gray-200">{hoveredJob.job.machineOperator}</span>
                            </div>
                        </div>

                        <div className="pt-1.5 border-t border-gray-700/80 text-[10px] text-gray-300 space-y-0.5">
                            <div className="flex justify-between">
                                <span className="text-gray-400">Tahmini Başlangıç:</span>
                                <span className="font-mono font-bold text-emerald-400">{formatFreeAtDate(hoveredJob.startDate)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-400">Tahmini Bitiş:</span>
                                <span className="font-mono font-bold text-amber-400">{formatFreeAtDate(hoveredJob.endDate)}</span>
                            </div>
                        </div>
                    </div>
                )}

                {/* 5. ALT BİLGİ ŞERİDİ */}
                <div className="p-2.5 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/60 flex justify-between items-center text-xs text-gray-500 dark:text-gray-400 shrink-0">
                    <div className="flex items-center gap-2">
                        <Info className="w-4 h-4 text-purple-600" />
                        <span>Mouse ile barların üzerine gelerek iş emri ve termin detaylarını inceleyebilirsiniz.</span>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-1.5 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 rounded-xl font-bold transition"
                    >
                        Kapat
                    </button>
                </div>
            </div>
        </div>
    );
};

export default MachineGanttModal;
