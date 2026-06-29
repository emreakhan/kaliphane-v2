// src/pages/PersonnelProductionLogsView.js

import React, { useState, useMemo, useEffect } from 'react';
import { 
    Search, Clock, PauseCircle, Activity, Box, BarChart2, Layers, AlertTriangle, Settings, ChevronRight, User, Calendar, Sliders, Info, Monitor, X 
} from 'lucide-react';
import { 
    BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid 
} from 'recharts';

// --- YARDIMCI FONKSİYONLAR ---
const calcMs = (startStr, endStr) => {
    if (!startStr) return 0;
    const start = new Date(startStr).getTime();
    if (isNaN(start)) return 0;
    
    const end = endStr ? new Date(endStr).getTime() : Date.now();
    if (isNaN(end)) return Math.max(0, Date.now() - start);
    
    return Math.max(0, end - start);
};

const formatDuration = (ms) => {
    if (!ms || ms <= 0) return '0 Dk';
    const totalMins = Math.floor(ms / 60000);
    const totalHours = Math.floor(totalMins / 60);
    const days = Math.floor(totalHours / 24);
    const hours = totalHours % 24;
    const mins = totalMins % 60;
    
    const parts = [];
    if (days > 0) parts.push(`${days} Gün`);
    if (hours > 0) parts.push(`${hours} Saat`);
    if (mins > 0 || parts.length === 0) parts.push(`${mins} Dk`);
    return parts.join(' ');
};

const formatHours = (ms) => {
    return (ms / 3600000).toFixed(1);
};

const getOperationStats = (op) => {
    let opPauseMs = 0;
    let opPauseReasons = {};

    // 1. Duruş geçmişini topla
    if (op.pauseHistory && Array.isArray(op.pauseHistory)) {
        op.pauseHistory.forEach(ph => {
            if (ph.pausedAt && ph.resumedAt) {
                const dur = calcMs(ph.pausedAt, ph.resumedAt);
                opPauseMs += dur;
                const reason = ph.reason || 'Belirtilmedi';
                opPauseReasons[reason] = (opPauseReasons[reason] || 0) + dur;
            }
        });
    }

    // 2. Anlık aktif duruşu ekle
    if ((op.status === 'PAUSED' || op.status === 'DURAKLATILDI') && op.lastPausedAt) {
        const dur = calcMs(op.lastPausedAt, null);
        opPauseMs += dur;
        const reason = op.lastPauseReason || 'Belirtilmedi';
        opPauseReasons[reason] = (opPauseReasons[reason] || 0) + dur;
    }

    // 3. Toplam süre
    let endStr = op.finishDate;
    if (!endStr && (op.status === 'COMPLETED' || op.status === 'TAMAMLANDI')) {
        endStr = op.updatedAt || op.startDate;
    }
    const opTotalMs = calcMs(op.startDate, endStr);

    // 4. Net çalışma ve ayar
    const opWorkMs = Math.max(0, opTotalMs - opPauseMs);

    let grossSetup = 0;
    if (op.setupStartTime) {
        grossSetup = calcMs(op.setupStartTime, op.productionStartTime || endStr);
    }

    let grossProd = 0;
    if (op.productionStartTime) {
        grossProd = calcMs(op.productionStartTime, endStr);
    } else if (!op.setupStartTime) {
        grossProd = opTotalMs;
    }

    let netProd = Math.max(0, grossProd - opPauseMs);
    let remainingPause = Math.max(0, opPauseMs - grossProd);
    let netSetup = Math.max(0, grossSetup - remainingPause);

    if (!op.setupStartTime && !op.productionStartTime) {
        netProd = opWorkMs;
        netSetup = 0;
    }

    return {
        workMs: opWorkMs,
        setupMs: netSetup,
        prodMs: netProd,
        pauseMs: opPauseMs,
        pauseReasons: opPauseReasons
    };
};

// Sadece fiziksel tezgah işlemlerini süzme fonksiyonu (CAM ve Tasarım hariç)
const isMachineOperation = (opType) => {
    if (!opType) return false;
    const upper = opType.toUpperCase();
    return !upper.includes('CAM') && !upper.includes('TASARIM') && !upper.includes('OFİS') && !upper.includes('PROJE');
};

const PersonnelProductionLogsView = ({ projects, personnel = [] }) => {
    // Left sidebar state
    const [personnelSearchTerm, setPersonnelSearchTerm] = useState('');
    const [selectedOperator, setSelectedOperator] = useState(null);

    // Filter and Tab states
    const [viewMode, setViewMode] = useState('daily'); // 'daily' or 'weekly'
    const [shiftHours, setShiftHours] = useState(8); // Default 8 hours shift
    const [selectedDayKey, setSelectedDayKey] = useState(null);

    // --- TÜM LOGLARIN FİLTRELENMESİ VE DERLENMESİ ---
    const allLogs = useMemo(() => {
        if (!projects) return [];
        const list = [];
        projects.forEach(mold => {
            if (mold.tasks) {
                mold.tasks.forEach(task => {
                    if (task.operations) {
                        task.operations.forEach(op => {
                            if (!op.startDate) return;
                            const opName = op.machineOperatorName || op.assignedOperator;
                            if (!opName) return;

                            // Sadece tezgah operatörü işlemlerini al (CAM ve Tasarım elenir)
                            if (!isMachineOperation(op.type)) return;

                            const stats = getOperationStats(op);
                            list.push({
                                moldId: mold.id,
                                moldName: mold.moldName,
                                taskId: task.id,
                                taskName: task.name,
                                opId: op.id,
                                opType: op.type,
                                machineName: op.machineName || 'Bilinmeyen Tezgah',
                                operatorName: opName,
                                startDate: op.startDate,
                                finishDate: op.finishDate,
                                status: op.status,
                                ...stats
                            });
                        });
                    }
                });
            }
        });
        return list;
    }, [projects]);

    // Operator log istatistikleri eşlemesi (Left Sidebar için)
    const operatorStatsMap = useMemo(() => {
        const map = {};
        allLogs.forEach(log => {
            const opName = log.operatorName;
            if (!map[opName]) {
                map[opName] = { name: opName, count: 0, totalWorkMs: 0 };
            }
            map[opName].count += 1;
            map[opName].totalWorkMs += log.workMs;
        });
        return map;
    }, [allLogs]);

    // Sıralı personel listesi
    const sortedPersonnel = useMemo(() => {
        const list = [...personnel];
        return list.map(p => {
            const stats = operatorStatsMap[p.name] || { count: 0, totalWorkMs: 0 };
            return {
                ...p,
                logCount: stats.count,
                totalWorkMs: stats.totalWorkMs
            };
        }).sort((a, b) => {
            if (b.logCount !== a.logCount) return b.logCount - a.logCount;
            if (b.totalWorkMs !== a.totalWorkMs) return b.totalWorkMs - a.totalWorkMs;
            return a.name.localeCompare(b.name);
        });
    }, [personnel, operatorStatsMap]);

    // Arama filtreli personel listesi
    const filteredPersonnel = useMemo(() => {
        if (!personnelSearchTerm.trim()) return sortedPersonnel;
        const lower = personnelSearchTerm.toLowerCase().trim();
        return sortedPersonnel.filter(p => p.name.toLowerCase().includes(lower));
    }, [sortedPersonnel, personnelSearchTerm]);

    // İlk açılışta kaydı olan ilk operatörü seç
    useEffect(() => {
        if (!selectedOperator && sortedPersonnel.length > 0) {
            const activeOp = sortedPersonnel.find(p => p.logCount > 0);
            if (activeOp) setSelectedOperator(activeOp);
            else setSelectedOperator(sortedPersonnel[0]);
        }
    }, [sortedPersonnel, selectedOperator]);

    // Seçili operatörün logları
    const selectedOpLogs = useMemo(() => {
        if (!selectedOperator) return [];
        return allLogs.filter(log => log.operatorName === selectedOperator.name);
    }, [allLogs, selectedOperator]);

    // Tarihe göre gruplama (Daily & Weekly)
    const groupedData = useMemo(() => {
        const dailyMap = {};
        const weeklyMap = {};

        selectedOpLogs.forEach(log => {
            const dateObj = new Date(log.startDate);
            if (isNaN(dateObj.getTime())) return;

            // Daily Key: YYYY-MM-DD
            const yyyy = dateObj.getFullYear();
            const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
            const dd = String(dateObj.getDate()).padStart(2, '0');
            const dailyKey = `${yyyy}-${mm}-${dd}`;
            const dailyDisplay = `${dd}.${mm}.${yyyy}`;

            // Weekly Key: Pazartesi - Pazar aralığı
            const getWeekRange = (date) => {
                const temp = new Date(date);
                const day = temp.getDay();
                const diff = temp.getDate() - day + (day === 0 ? -6 : 1);
                const monday = new Date(temp.setDate(diff));
                const sunday = new Date(monday);
                sunday.setDate(sunday.getDate() + 6);
                return `${String(monday.getDate()).padStart(2, '0')}.${String(monday.getMonth()+1).padStart(2, '0')} - ${String(sunday.getDate()).padStart(2, '0')}.${String(sunday.getMonth()+1).padStart(2, '0')}`;
            };
            const weeklyKey = getWeekRange(dateObj);

            // Daily gruplama
            if (!dailyMap[dailyKey]) {
                dailyMap[dailyKey] = {
                    key: dailyKey,
                    display: dailyDisplay,
                    setupMs: 0,
                    prodMs: 0,
                    pauseMs: 0,
                    workMs: 0,
                    molds: new Set(),
                    machines: new Set(),
                    logs: []
                };
            }
            dailyMap[dailyKey].setupMs += log.setupMs;
            dailyMap[dailyKey].prodMs += log.prodMs;
            dailyMap[dailyKey].pauseMs += log.pauseMs;
            dailyMap[dailyKey].workMs += log.workMs;
            dailyMap[dailyKey].molds.add(log.moldName);
            dailyMap[dailyKey].machines.add(log.machineName);
            dailyMap[dailyKey].logs.push(log);

            // Weekly gruplama
            if (!weeklyMap[weeklyKey]) {
                weeklyMap[weeklyKey] = {
                    key: weeklyKey,
                    display: weeklyKey,
                    setupMs: 0,
                    prodMs: 0,
                    pauseMs: 0,
                    workMs: 0,
                    molds: new Set(),
                    machines: new Set(),
                    logs: []
                };
            }
            weeklyMap[weeklyKey].setupMs += log.setupMs;
            weeklyMap[weeklyKey].prodMs += log.prodMs;
            weeklyMap[weeklyKey].pauseMs += log.pauseMs;
            weeklyMap[weeklyKey].workMs += log.workMs;
            weeklyMap[weeklyKey].molds.add(log.moldName);
            weeklyMap[weeklyKey].machines.add(log.machineName);
            weeklyMap[weeklyKey].logs.push(log);
        });

        const dailyList = Object.values(dailyMap).sort((a, b) => b.key.localeCompare(a.key));
        const weeklyList = Object.values(weeklyMap).sort((a, b) => b.key.localeCompare(a.key));

        return {
            daily: dailyList,
            weekly: weeklyList
        };
    }, [selectedOpLogs]);

    // Seçili periyot (grafik veya detay için)
    const activePeriodData = useMemo(() => {
        const list = viewMode === 'daily' ? groupedData.daily : groupedData.weekly;
        if (!selectedDayKey) return list[0] || null;
        return list.find(d => d.key === selectedDayKey) || list[0] || null;
    }, [groupedData, viewMode, selectedDayKey]);

    // Seçili periyot değiştiğinde anahtarı güncelle
    useEffect(() => {
        const list = viewMode === 'daily' ? groupedData.daily : groupedData.weekly;
        if (list.length > 0) {
            setSelectedDayKey(list[0].key);
        } else {
            setSelectedDayKey(null);
        }
    }, [selectedOperator, viewMode, groupedData]);

    // Recharts formatlı grafik verisi
    const chartData = useMemo(() => {
        const list = viewMode === 'daily' ? groupedData.daily : groupedData.weekly;
        // Son 10 periyodu gösterelim (eski grafiklerin taşmasını önlemek için)
        return [...list].reverse().slice(-10).map(d => ({
            name: d.display,
            key: d.key,
            "Ayar Süresi (Saat)": parseFloat(formatHours(d.setupMs)),
            "Net Çalışma (Saat)": parseFloat(formatHours(d.prodMs)),
            "Duruş Süresi (Saat)": parseFloat(formatHours(d.pauseMs)),
        }));
    }, [groupedData, viewMode]);

    // Vardiya paralel tezgah ve teknik bekleme analiz değişkenleri
    const simulatorStats = useMemo(() => {
        if (!activePeriodData) return null;
        
        const setupHours = activePeriodData.setupMs / 3600000;
        const pauseHours = activePeriodData.pauseMs / 3600000;
        const prodHours = activePeriodData.prodMs / 3600000;

        // Operatör vardiyada aktif olarak tezgahlarda ne kadar ayar ve duruş müdahalesi yaptı?
        const operatorActiveHours = setupHours + pauseHours;
        
        // Teknik Bekleme Süresi = Belirlenen Vardiya Süresi - (Ayar + Duruş müdahaleleri)
        const idleHours = Math.max(0, shiftHours - operatorActiveHours);
        
        // Makine Yük Katsayısı = Toplam İmalat (Net Çalışma) / Vardiya Süresi
        const workloadFactor = shiftHours > 0 ? (prodHours / shiftHours).toFixed(1) : "0.0";

        // Yüzdelikler
        const totalMeasured = setupHours + pauseHours + idleHours;
        const setupPercent = totalMeasured > 0 ? ((setupHours / totalMeasured) * 100).toFixed(1) : 0;
        const pausePercent = totalMeasured > 0 ? ((pauseHours / totalMeasured) * 100).toFixed(1) : 0;
        const idlePercent = totalMeasured > 0 ? ((idleHours / totalMeasured) * 100).toFixed(1) : 0;

        return {
            setupHours: setupHours.toFixed(1),
            pauseHours: pauseHours.toFixed(1),
            prodHours: prodHours.toFixed(1),
            idleHours: idleHours.toFixed(1),
            workloadFactor,
            setupPercent,
            pausePercent,
            idlePercent,
            machinesCount: activePeriodData.machines.size,
            moldsCount: activePeriodData.molds.size
        };
    }, [activePeriodData, shiftHours]);

    // --- TIMELINE GRID HESAPLAMALARI ---
    const timelineBounds = useMemo(() => {
        if (!activePeriodData || activePeriodData.logs.length === 0) return { minMs: 0, maxMs: 0, durationMs: 0 };
        let minMs = Infinity;
        let maxMs = -Infinity;

        activePeriodData.logs.forEach(log => {
            const start = new Date(log.startDate).getTime();
            if (start < minMs) minMs = start;

            let end = log.finishDate ? new Date(log.finishDate).getTime() : Date.now();
            if (end > maxMs) maxMs = end;
        });

        // 30 dk padding
        minMs -= 30 * 60 * 1000;
        maxMs += 30 * 60 * 1000;
        
        return {
            minMs,
            maxMs,
            durationMs: maxMs - minMs
        };
    }, [activePeriodData]);

    const timelineTicks = useMemo(() => {
        const { minMs, durationMs } = timelineBounds;
        if (durationMs <= 0) return [];
        const result = [];
        const count = 6;
        for (let i = 0; i < count; i++) {
            const ms = minMs + (durationMs * i) / (count - 1);
            const timeStr = new Date(ms).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
            const leftPercent = (i / (count - 1)) * 100;
            result.push({ timeStr, leftPercent });
        }
        return result;
    }, [timelineBounds]);

    const getTimelineSegmentsForMachine = (machineName, dayLogs, timelineStart, timelineEnd) => {
        const segments = [];
        const timelineDuration = timelineEnd - timelineStart;
        if (timelineDuration <= 0) return [];

        const intervals = [];

        dayLogs.filter(log => log.machineName === machineName).forEach(log => {
            const logStart = new Date(log.startDate).getTime();
            let logEnd = log.finishDate ? new Date(log.finishDate).getTime() : Date.now();
            
            // 1. Setup Interval
            if (log.setupStartTime) {
                const setupStart = new Date(log.setupStartTime).getTime();
                const setupEnd = log.productionStartTime ? new Date(log.productionStartTime).getTime() : logEnd;
                intervals.push({ startMs: setupStart, endMs: setupEnd, type: 'setup', label: 'Ayar', opType: log.opType, moldName: log.moldName });
            }

            // 2. Production Interval (gross)
            let prodStart = log.productionStartTime ? new Date(log.productionStartTime).getTime() : null;
            if (!log.setupStartTime && !log.productionStartTime) {
                prodStart = logStart;
            }

            if (prodStart) {
                intervals.push({ startMs: prodStart, endMs: logEnd, type: 'run', label: 'İmalat', opType: log.opType, moldName: log.moldName });
            }

            // 3. Pauses (overlay)
            if (log.pauseHistory && Array.isArray(log.pauseHistory)) {
                log.pauseHistory.forEach(ph => {
                    if (ph.pausedAt && ph.resumedAt) {
                        intervals.push({
                            startMs: new Date(ph.pausedAt).getTime(),
                            endMs: new Date(ph.resumedAt).getTime(),
                            type: 'pause',
                            label: `Duruş: ${ph.reason || 'Belirtilmedi'}`,
                            opType: log.opType,
                            moldName: log.moldName
                        });
                    }
                });
            }
            if ((log.status === 'PAUSED' || log.status === 'DURAKLATILDI') && log.lastPausedAt) {
                intervals.push({
                    startMs: new Date(log.lastPausedAt).getTime(),
                    endMs: Date.now(),
                    type: 'pause',
                    label: `Duruş: ${log.lastPauseReason || 'Belirtilmedi'}`,
                    opType: log.opType,
                    moldName: log.moldName
                });
            }
        });

        // Mutlak konumlandırma ve oran hesabı
        intervals.forEach(inv => {
            const s = Math.max(timelineStart, inv.startMs);
            const e = Math.min(timelineEnd, inv.endMs);
            if (e > s) {
                const leftPercent = ((s - timelineStart) / timelineDuration) * 100;
                const widthPercent = ((e - s) / timelineDuration) * 100;
                segments.push({
                    ...inv,
                    leftPercent,
                    widthPercent,
                    startStr: new Date(s).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
                    endStr: new Date(e).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
                });
            }
        });

        return segments;
    };

    return (
        <div className="flex h-[calc(100vh-170px)] overflow-hidden bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl">
            
            {/* 1. SOL PANEL: PERSONEL ARAMA VE LİSTE */}
            <div className="w-1/4 min-w-[275px] border-r border-gray-200 dark:border-gray-700 flex flex-col bg-white dark:bg-gray-800">
                <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 flex flex-col gap-3">
                    <h3 className="text-sm font-black text-gray-700 dark:text-gray-300 uppercase tracking-wider flex items-center gap-2">
                        <User className="w-4 h-4 text-orange-500" /> Operatör Listesi
                    </h3>
                    <div className="relative">
                        <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                        <input 
                            type="text" 
                            placeholder="Operatör ara..." 
                            value={personnelSearchTerm} 
                            onChange={(e) => setPersonnelSearchTerm(e.target.value)} 
                            className="w-full pl-9 pr-8 py-2 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-xs outline-none focus:ring-2 focus:ring-orange-500 font-bold" 
                        />
                        {personnelSearchTerm && (
                            <button onClick={() => setPersonnelSearchTerm('')} className="absolute right-2.5 top-2.5 text-gray-400 hover:text-gray-650">
                                <X className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                    {filteredPersonnel.length === 0 ? (
                        <div className="p-4 text-center text-xs text-gray-400 font-bold italic">Personel bulunamadı.</div>
                    ) : (
                        filteredPersonnel.map(person => {
                            const isSelected = selectedOperator?.id === person.id;
                            return (
                                <button
                                    key={person.id}
                                    onClick={() => setSelectedOperator(person)}
                                    className={`w-full flex items-center justify-between p-3 rounded-lg border transition-all text-left ${
                                        isSelected 
                                        ? 'bg-orange-500 text-white font-bold border-orange-500 shadow-sm' 
                                        : 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 hover:border-orange-300 text-gray-700 dark:text-gray-300'
                                    }`}
                                >
                                    <div className="min-w-0 flex-1 pr-2">
                                        <div className={`text-sm truncate ${isSelected ? 'font-extrabold' : 'font-bold'}`}>
                                            {person.name}
                                        </div>
                                        <div className={`text-[10px] truncate mt-0.5 ${isSelected ? 'text-orange-100' : 'text-gray-400 dark:text-gray-500'}`}>
                                            {person.role || 'Tezgah Operatörü'}
                                        </div>
                                    </div>
                                    {person.logCount > 0 && (
                                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-black ${
                                            isSelected 
                                            ? 'bg-white/20 text-white' 
                                            : 'bg-orange-50 dark:bg-orange-950/20 text-orange-600 dark:text-orange-400 border border-orange-100 dark:border-orange-900/30'
                                        }`}>
                                            {person.logCount} Log
                                        </span>
                                    )}
                                </button>
                            );
                        })
                    )}
                </div>
            </div>

            {/* 2. SAĞ PANEL: DETAYLI HESAPLAMALAR VE GRAFİKLER */}
            <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900 flex flex-col h-full">
                {selectedOperator ? (
                    <div className="p-6 space-y-6">
                        {/* Sayfa Üst Bilgisi ve Sekmeler */}
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white dark:bg-gray-800 p-5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
                            <div>
                                <h2 className="text-xl font-black text-gray-900 dark:text-white flex items-center gap-2">
                                    {selectedOperator.name}
                                    <span className="text-xs font-bold text-gray-400 dark:text-gray-500">({selectedOperator.role || 'Tezgah Operatörü'})</span>
                                </h2>
                                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mt-1">Personelin günlük ve haftalık tezgah analiz detayları</p>
                            </div>

                            {/* Günlük / Haftalık Seçici */}
                            <div className="flex bg-gray-100 dark:bg-gray-700 p-1 rounded-lg shrink-0 border dark:border-gray-600">
                                <button 
                                    onClick={() => setViewMode('daily')}
                                    className={`py-1.5 px-4 text-xs font-black rounded-md transition ${
                                        viewMode === 'daily' 
                                            ? 'bg-white dark:bg-gray-600 text-orange-600 dark:text-white shadow-sm' 
                                            : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'
                                    }`}
                                >
                                    Günlük Görünüm
                                </button>
                                <button 
                                    onClick={() => setViewMode('weekly')}
                                    className={`py-1.5 px-4 text-xs font-black rounded-md transition ${
                                        viewMode === 'weekly' 
                                            ? 'bg-white dark:bg-gray-600 text-orange-600 dark:text-white shadow-sm' 
                                            : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'
                                    }`}
                                >
                                    Haftalık Görünüm
                                </button>
                            </div>
                        </div>

                        {/* Operatörün Toplam Kaydı Var mı? */}
                        {selectedOpLogs.length === 0 ? (
                            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-12 text-center shadow-sm">
                                <Activity className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                                <h3 className="text-base font-bold text-gray-700 dark:text-gray-300">İşlem Kaydı Bulunmuyor</h3>
                                <p className="text-xs text-gray-400 mt-1 max-w-xs mx-auto">
                                    Seçilen operatöre ait son dönemde kaydedilmiş herhangi bir makine ayar veya çalışma logu tespit edilememiştir.
                                </p>
                            </div>
                        ) : (
                            <>
                                {/* 3. GENEL ZAMAN SERİSİ YIĞILMIŞ BAR GRAFİĞİ (STACKED BAR CHART) */}
                                <div className="bg-white dark:bg-gray-800 p-5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm space-y-4">
                                    <h3 className="font-extrabold text-sm text-gray-800 dark:text-white flex items-center gap-2">
                                        <BarChart2 className="w-4 h-4 text-orange-500" /> Zaman Dağılım Grafiği (Saat Cinsinden)
                                    </h3>
                                    <div className="h-64 w-full">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" className="dark:stroke-gray-700" />
                                                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#6B7280' }} />
                                                <YAxis tick={{ fontSize: 10, fill: '#6B7280' }} unit=" Sa" />
                                                <Tooltip contentStyle={{ fontSize: '11px', fontWeight: 'bold', borderRadius: '8px' }} />
                                                <Legend wrapperStyle={{ fontSize: '11px', fontWeight: 'bold' }} />
                                                <Bar dataKey="Ayar Süresi (Saat)" stackId="a" fill="#3B82F6" />
                                                <Bar dataKey="Net Çalışma (Saat)" stackId="a" fill="#10B981" />
                                                <Bar dataKey="Duruş Süresi (Saat)" stackId="a" fill="#EF4444" />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>

                                {/* 4. İNTERAKTİF VARDİYA & PARALEL TEZGAH YÜKÜ HESAPLAYICI */}
                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                    {/* Sol Taraf: Periyot Seçimi ve Vardiya Sürgüsü */}
                                    <div className="lg:col-span-1 bg-white dark:bg-gray-800 p-5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm space-y-4 flex flex-col justify-between">
                                        <div className="space-y-4">
                                            <h3 className="font-extrabold text-sm text-gray-800 dark:text-white flex items-center gap-2">
                                                <Sliders className="w-4 h-4 text-orange-500" /> Analiz Parametreleri
                                            </h3>

                                            {/* Periyot Seçici */}
                                            <div>
                                                <label className="block text-xs font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">İncelenecek Tarih / Periyot</label>
                                                <select
                                                    value={selectedDayKey || ''}
                                                    onChange={(e) => setSelectedDayKey(e.target.value)}
                                                    className="w-full p-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-xs outline-none focus:ring-2 focus:ring-orange-500 font-bold"
                                                >
                                                    {(viewMode === 'daily' ? groupedData.daily : groupedData.weekly).map(item => (
                                                        <option key={item.key} value={item.key} className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-bold">{item.display}</option>
                                                    ))}
                                                </select>
                                            </div>

                                            {/* Vardiya Slider */}
                                            <div className="pt-2">
                                                <div className="flex justify-between text-xs font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                                                    <span>Vardiya Süresi</span>
                                                    <span className="text-orange-600 dark:text-orange-400 font-black">{shiftHours} Saat</span>
                                                </div>
                                                <input 
                                                    type="range" 
                                                    min="4" 
                                                    max="12" 
                                                    step="0.5"
                                                    value={shiftHours} 
                                                    onChange={(e) => setShiftHours(parseFloat(e.target.value))}
                                                    className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-orange-500"
                                                />
                                                <div className="flex justify-between text-[10px] text-gray-400 font-semibold mt-1">
                                                    <span>4 Saat</span>
                                                    <span>8 Saat (Standart)</span>
                                                    <span>12 Saat</span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="p-3 bg-blue-50/50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/50 rounded-xl text-blue-800 dark:text-blue-300 text-[11px] font-semibold leading-relaxed flex gap-2 items-start mt-4">
                                            <Info className="w-4 h-4 shrink-0 text-blue-500 mt-0.5" />
                                            <span>
                                                Vardiya süresi, operatörün o günkü mesaisidir. Ayar ve duruş müdahalelerinin dışındaki zaman, tezgahlar otomatik çalışırken geçen <strong>"Teknik Serbest/Gözlem"</strong> süresidir.
                                            </span>
                                        </div>
                                    </div>

                                    {/* Sağ Taraf: Analiz Gösterimleri */}
                                    <div className="lg:col-span-2 bg-white dark:bg-gray-800 p-5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm space-y-4">
                                        <h3 className="font-extrabold text-sm text-gray-800 dark:text-white flex items-center justify-between">
                                            <span className="flex items-center gap-2">
                                                <Monitor className="w-4 h-4 text-orange-500" /> Operatör İş Yükü & Denge Analizi
                                            </span>
                                            {activePeriodData && (
                                                <span className="text-[11px] font-black text-gray-400 uppercase tracking-widest">{activePeriodData.display} Raporu</span>
                                            )}
                                        </h3>

                                        {simulatorStats ? (
                                            <div className="space-y-6">
                                                {/* 1. Operatörün Zaman Dağılım Barı (Shift Balance Bar) */}
                                                <div className="space-y-2">
                                                    <div className="flex justify-between text-xs font-bold text-gray-600 dark:text-gray-400">
                                                        <span>Operatörün Vardiya Zaman Dağılımı</span>
                                                        <span>Toplam: {shiftHours} Saat</span>
                                                    </div>
                                                    <div className="h-6 w-full rounded-lg overflow-hidden flex shadow-inner">
                                                        {parseFloat(simulatorStats.setupHours) > 0 && (
                                                            <div 
                                                                style={{ width: `${Math.min(100, (parseFloat(simulatorStats.setupHours) / shiftHours) * 100)}%` }} 
                                                                className="bg-blue-500 hover:bg-blue-600 transition-colors flex items-center justify-center text-[10px] text-white font-black truncate px-1"
                                                                title={`Ayar: ${simulatorStats.setupHours} Saat`}
                                                            >
                                                                {simulatorStats.setupPercent}% Ayar
                                                            </div>
                                                        )}
                                                        {parseFloat(simulatorStats.pauseHours) > 0 && (
                                                            <div 
                                                                style={{ width: `${Math.min(100, (parseFloat(simulatorStats.pauseHours) / shiftHours) * 100)}%` }} 
                                                                className="bg-red-500 hover:bg-red-600 transition-colors flex items-center justify-center text-[10px] text-white font-black truncate px-1"
                                                                title={`Duruş: ${simulatorStats.pauseHours} Saat`}
                                                            >
                                                                {simulatorStats.pausePercent}% Duruş
                                                            </div>
                                                        )}
                                                        {parseFloat(simulatorStats.idleHours) > 0 && (
                                                            <div 
                                                                style={{ width: `${(parseFloat(simulatorStats.idleHours) / shiftHours) * 100}%` }} 
                                                                className="bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors flex items-center justify-center text-[10px] text-gray-600 dark:text-gray-300 font-black truncate px-1"
                                                                title={`Teknik Bekleme: ${simulatorStats.idleHours} Saat`}
                                                            >
                                                                {simulatorStats.idlePercent}% Serbest/Gözlem
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Detay Kartları */}
                                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                                    {/* Ayar Müdahale */}
                                                    <div className="p-3.5 bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 rounded-xl">
                                                        <div className="text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase">Aktif Hazırlık (Ayar)</div>
                                                        <div className="text-xl font-black text-gray-900 dark:text-white mt-1">{simulatorStats.setupHours} Saat</div>
                                                        <div className="text-[9px] text-gray-400 dark:text-gray-400 mt-1 font-semibold">Parçalara yapılan kurulum süresi</div>
                                                    </div>
                                                    {/* Duruş Müdahale */}
                                                    <div className="p-3.5 bg-red-50/50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 rounded-xl">
                                                        <div className="text-[10px] font-black text-red-600 dark:text-red-400 uppercase">Duruş & Müdahale</div>
                                                        <div className="text-xl font-black text-gray-900 dark:text-white mt-1">{simulatorStats.pauseHours} Saat</div>
                                                        <div className="text-[9px] text-gray-400 dark:text-gray-400 mt-1 font-semibold">Hata/Arıza müdahale süresi</div>
                                                    </div>
                                                    {/* Teknik Bekleme */}
                                                    <div className="p-3.5 bg-gray-100/50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl">
                                                        <div className="text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase">Teknik Serbest / Gözlem</div>
                                                        <div className="text-xl font-black text-gray-900 dark:text-white mt-1">{simulatorStats.idleHours} Saat</div>
                                                        <div className="text-[9px] text-gray-400 dark:text-gray-400 mt-1 font-semibold">Makineler otomatik işlerken serbest zaman</div>
                                                    </div>
                                                </div>

                                                {/* Paralel Tezgah Verimi */}
                                                <div className="p-4 bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/50 rounded-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                                                    <div>
                                                        <div className="text-[10px] font-black text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">Paralel Tezgah Çalışma Kazanımı</div>
                                                        <h4 className="text-sm font-bold text-gray-900 dark:text-white mt-1">
                                                            Aynı gün <strong>{simulatorStats.machinesCount} farklı tezgahta</strong> çalışarak, toplam <strong>{simulatorStats.prodHours} saat</strong> net imalat sağlandı.
                                                        </h4>
                                                    </div>
                                                    <div className="text-right shrink-0">
                                                        <span className="inline-block px-3 py-1.5 bg-emerald-600 text-white font-black text-xs rounded-lg shadow-sm">
                                                            {simulatorStats.workloadFactor}x Tezgah Verimi
                                                        </span>
                                                        <p className="text-[9px] text-gray-400 mt-1 font-bold">Vardiya Süresine Oranı</p>
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                            <p className="text-xs text-gray-450 dark:text-gray-500 italic py-8 text-center">Veri hesaplanamadı.</p>
                                        )}
                                    </div>
                                </div>

                                {/* 5. YATAY ZAMAN ÇİZELGESİ (TIMELINE) - PARALEL TEZGAH İŞ YÜKLERİNİN ALT ALTA GÖSTERİMİ */}
                                {viewMode === 'daily' && activePeriodData && activePeriodData.logs.length > 0 && (
                                    <div className="bg-white dark:bg-gray-800 p-5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm space-y-4">
                                        <h3 className="font-extrabold text-sm text-gray-800 dark:text-white flex items-center justify-between">
                                            <span className="flex items-center gap-2">
                                                <Clock className="w-4 h-4 text-orange-500" /> Günlük Tezgah Çalışma Çizelgesi (Timeline)
                                            </span>
                                            <div className="flex items-center gap-4 text-[10px] font-black">
                                                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 bg-blue-500 rounded"></span> Ayar</span>
                                                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 bg-green-500 rounded"></span> İmalat</span>
                                                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 bg-red-500 rounded"></span> Duruş / Hata</span>
                                            </div>
                                        </h3>

                                        <div className="space-y-6 pt-2 overflow-x-auto">
                                            <div className="min-w-[600px] space-y-6 pr-2">
                                                {/* Zaman Ekseni Başlığı */}
                                                <div className="relative h-6 border-b border-gray-200 dark:border-gray-700 ml-28">
                                                    {timelineTicks.map((t, idx) => (
                                                        <span 
                                                            key={idx} 
                                                            className="absolute text-[10px] font-black text-gray-400 dark:text-gray-500 transform -translate-x-1/2" 
                                                            style={{ left: `${t.leftPercent}%` }}
                                                        >
                                                            {t.timeStr}
                                                        </span>
                                                    ))}
                                                </div>

                                                {/* Satırlar */}
                                                <div className="space-y-4">
                                                    {Array.from(activePeriodData.machines).map(machine => {
                                                        const segments = getTimelineSegmentsForMachine(machine, activePeriodData.logs, timelineBounds.minMs, timelineBounds.maxMs);
                                                        return (
                                                            <div key={machine} className="flex items-center gap-4 group">
                                                                {/* Tezgah Adı */}
                                                                <div className="w-24 shrink-0 font-extrabold text-xs text-gray-700 dark:text-gray-200 flex items-center gap-1.5">
                                                                    <Monitor className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                                                                    <span className="truncate">{machine}</span>
                                                                </div>

                                                                {/* Şerit */}
                                                                <div className="flex-1 h-8 bg-gray-100 dark:bg-gray-700/50 rounded-lg relative overflow-hidden shadow-inner border border-gray-200/30 dark:border-gray-700/30">
                                                                    {/* Arka plan çizgileri */}
                                                                    {timelineTicks.map((t, idx) => (
                                                                        <div 
                                                                            key={idx} 
                                                                            className="absolute top-0 bottom-0 border-l border-dashed border-gray-300 dark:border-gray-700/60 pointer-events-none" 
                                                                            style={{ left: `${t.leftPercent}%` }}
                                                                        />
                                                                    ))}

                                                                    {/* Renkli Segmentler */}
                                                                    {segments.map((seg, sIdx) => {
                                                                        let bgClass = 'bg-green-500';
                                                                        let hoverBorder = 'hover:border-green-600';
                                                                        if (seg.type === 'setup') {
                                                                            bgClass = 'bg-blue-500';
                                                                            hoverBorder = 'hover:border-blue-600';
                                                                        } else if (seg.type === 'pause') {
                                                                            bgClass = 'bg-red-500';
                                                                            hoverBorder = 'hover:border-red-600';
                                                                        }

                                                                        const zIndexClass = seg.type === 'pause' ? 'z-20' : seg.type === 'setup' ? 'z-10' : 'z-5';

                                                                        return (
                                                                            <div
                                                                                key={sIdx}
                                                                                className={`absolute top-1 bottom-1 rounded-md opacity-90 hover:opacity-100 transition-all cursor-pointer border border-white/20 shadow-sm flex items-center justify-center text-[9px] text-white font-extrabold select-none overflow-hidden ${bgClass} ${hoverBorder} ${zIndexClass}`}
                                                                                style={{ 
                                                                                    left: `${seg.leftPercent}%`, 
                                                                                    width: `${seg.widthPercent}%`,
                                                                                    minWidth: '6px'
                                                                                }}
                                                                                title={`${seg.moldName} - ${seg.opType}\n${seg.label}\nSaat: ${seg.startStr} - ${seg.endStr}`}
                                                                            >
                                                                                {seg.widthPercent > 10 && (
                                                                                    <span className="truncate px-1 shadow-sm">{seg.moldName}</span>
                                                                                )}
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* 6. İSTASYON OPERASYON LOGLARI DETAY TABLOSU */}
                                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
                                    <div className="p-5 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50/50 dark:bg-gray-900/50">
                                        <h3 className="font-extrabold text-sm text-gray-800 dark:text-white flex items-center gap-2">
                                            <Calendar className="w-4 h-4 text-orange-500" /> Periyoda Ait Detaylı Operasyon Logları
                                        </h3>
                                        <span className="text-[11px] font-black text-orange-600 bg-orange-50 dark:bg-orange-950/20 px-2.5 py-1 rounded">
                                            {activePeriodData?.logs.length || 0} Operasyon Kaydı
                                        </span>
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-xs">
                                            <thead className="bg-gray-50 dark:bg-gray-900/50">
                                                <tr>
                                                    <th className="px-6 py-3 text-left font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider">Kalıp Adı</th>
                                                    <th className="px-6 py-3 text-left font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider">Parça / İş</th>
                                                    <th className="px-6 py-3 text-left font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider">Tezgah</th>
                                                    <th className="px-6 py-3 text-center font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider">Ayar Süresi</th>
                                                    <th className="px-6 py-3 text-center font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider">Net İmalat</th>
                                                    <th className="px-6 py-3 text-center font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider">Duruş Süresi</th>
                                                    <th className="px-6 py-3 text-center font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider">Durum</th>
                                                </tr>
                                            </thead>
                                            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                                                {!activePeriodData || activePeriodData.logs.length === 0 ? (
                                                    <tr>
                                                        <td colSpan="7" className="px-6 py-8 text-center text-gray-400 dark:text-gray-500 font-semibold italic">
                                                            Seçilen periyotta herhangi bir operasyon kaydı bulunamadı.
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    activePeriodData.logs.map((log, idx) => (
                                                        <tr key={log.opId || idx} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition">
                                                            <td className="px-6 py-4 whitespace-nowrap">
                                                                <span className="inline-block bg-orange-50 dark:bg-orange-950/20 text-orange-700 dark:text-orange-400 font-extrabold px-2 py-0.5 rounded border border-orange-100 dark:border-orange-900/30">
                                                                    {log.moldName}
                                                                </span>
                                                            </td>
                                                            <td className="px-6 py-4">
                                                                <div className="font-extrabold text-gray-900 dark:text-white">{log.opType}</div>
                                                                <div className="text-[10px] text-gray-400 mt-0.5">{log.taskName}</div>
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap font-bold text-gray-800 dark:text-gray-200">
                                                                <div className="flex items-center gap-1">
                                                                    <Monitor className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                                                                    {log.machineName}
                                                                </div>
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap text-center font-bold text-blue-600 dark:text-blue-400">
                                                                {formatDuration(log.setupMs)}
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap text-center font-bold text-green-600 dark:text-green-400">
                                                                {formatDuration(log.prodMs)}
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap text-center">
                                                                <span className={`font-bold ${log.pauseMs > 0 ? 'text-red-500' : 'text-gray-400 dark:text-gray-500'}`}>
                                                                    {formatDuration(log.pauseMs)}
                                                                </span>
                                                                {log.pauseMs > 0 && Object.keys(log.pauseReasons).length > 0 && (
                                                                    <div className="text-[9px] text-gray-400 dark:text-gray-500 mt-1">
                                                                        ({Object.keys(log.pauseReasons).join(', ')})
                                                                    </div>
                                                                )}
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap text-center">
                                                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                                                    log.status === 'COMPLETED' || log.status === 'TAMAMLANDI'
                                                                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                                                                        : log.status === 'IN_PROGRESS' || log.status === 'YÜRÜTÜLÜYOR'
                                                                        ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 animate-pulse'
                                                                        : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
                                                                }`}>
                                                                    {log.status}
                                                                </span>
                                                            </td>
                                                        </tr>
                                                    ))
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center text-gray-450 dark:text-gray-500 opacity-60">
                        <User className="w-20 h-20 mb-4 text-gray-300 dark:text-gray-650" />
                        <p className="text-lg font-bold">Loglarını incelemek istediğiniz operatörü soldan seçin.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default PersonnelProductionLogsView;
