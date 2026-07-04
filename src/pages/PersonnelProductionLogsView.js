// src/pages/PersonnelProductionLogsView.js

import React, { useState, useMemo, useEffect } from 'react';
import { 
    Search, Clock, PauseCircle, Activity, Box, BarChart2, Layers, AlertTriangle, Settings, ChevronRight, User, Calendar, Sliders, Info, Monitor, X 
} from 'lucide-react';
import { 
    BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid 
} from 'recharts';
import { 
    db, collection, onSnapshot, query, orderBy 
} from '../config/firebase.js';

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

const getPauseReasonText = (reason) => {
    if (!reason) return 'Belirtilmedi';
    if (typeof reason === 'object') {
        const parts = [];
        if (reason.reason) parts.push(reason.reason);
        if (reason.description) parts.push(reason.description);
        return parts.join(' - ');
    }
    return reason;
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
                const reason = getPauseReasonText(ph.reason);
                opPauseReasons[reason] = (opPauseReasons[reason] || 0) + dur;
            }
        });
    }

    // 2. Anlık aktif duruşu ekle
    if ((op.status === 'PAUSED' || op.status === 'DURAKLATILDI') && op.lastPausedAt) {
        const dur = calcMs(op.lastPausedAt, null);
        opPauseMs += dur;
        const reason = getPauseReasonText(op.lastPauseReason);
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

const getTodayKey = () => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
};

const getAllOperatorActivities = (projects, operatorName) => {
    const segments = [];
    if (!projects) return [];

    projects.forEach(mold => {
        if (!mold.tasks) return;
        mold.tasks.forEach(task => {
            if (!task.operations) return;
            task.operations.forEach(op => {
                const opName = op.machineOperatorName || op.assignedOperator;
                if (!opName || opName !== operatorName) return;
                if (!isMachineOperation(op.type)) return;

                const moldName = mold.moldName;
                const taskName = task.name;
                const opType = op.type;
                const machineName = op.machineName || 'Bilinmeyen Tezgah';

                // 1. Ayar (Setup) Segment
                if (op.setupStartTime) {
                    const startVal = new Date(op.setupStartTime).getTime();
                    let endVal = op.productionStartTime ? new Date(op.productionStartTime).getTime() : null;
                    if (!endVal) {
                        endVal = op.finishDate ? new Date(op.finishDate).getTime() : null;
                    }
                    if (!endVal && (op.status === 'COMPLETED' || op.status === 'TAMAMLANDI')) {
                        endVal = op.updatedAt ? new Date(op.updatedAt).getTime() : new Date(op.startDate).getTime();
                    }
                    if (!endVal) {
                        endVal = Date.now();
                    }

                    if (!isNaN(startVal) && !isNaN(endVal) && endVal > startVal) {
                        segments.push({
                            type: 'setup',
                            moldName,
                            taskName,
                            opType,
                            machineName,
                            startMs: startVal,
                            endMs: endVal
                        });
                    }
                }

                // 2. İmalat (Production) ve Duruş Segmentleri
                let prodStart = op.productionStartTime ? new Date(op.productionStartTime).getTime() : null;
                if (!op.setupStartTime && !op.productionStartTime) {
                    prodStart = new Date(op.startDate).getTime();
                }

                if (prodStart && !isNaN(prodStart)) {
                    let prodEnd = op.finishDate ? new Date(op.finishDate).getTime() : null;
                    if (!prodEnd && (op.status === 'COMPLETED' || op.status === 'TAMAMLANDI')) {
                        prodEnd = op.updatedAt ? new Date(op.updatedAt).getTime() : new Date(op.startDate).getTime();
                    }
                    if (!prodEnd) {
                        prodEnd = Date.now();
                    }

                    if (!isNaN(prodEnd) && prodEnd > prodStart) {
                        const pauseIntervals = [];
                        if (op.pauseHistory && Array.isArray(op.pauseHistory)) {
                            op.pauseHistory.forEach(ph => {
                                if (ph.pausedAt && ph.resumedAt) {
                                    const pStart = new Date(ph.pausedAt).getTime();
                                    const pEnd = new Date(ph.resumedAt).getTime();
                                    if (!isNaN(pStart) && !isNaN(pEnd) && pStart >= prodStart && pEnd <= prodEnd) {
                                        pauseIntervals.push({ startMs: pStart, endMs: pEnd, reason: ph.reason });
                                    }
                                }
                            });
                        }
                        if ((op.status === 'PAUSED' || op.status === 'DURAKLATILDI') && op.lastPausedAt) {
                            const pStart = new Date(op.lastPausedAt).getTime();
                            if (!isNaN(pStart) && pStart >= prodStart && pStart <= prodEnd) {
                                pauseIntervals.push({ startMs: pStart, endMs: prodEnd, reason: op.lastPauseReason || 'Belirtilmedi' });
                            }
                        }

                        // Add pauses
                        pauseIntervals.forEach(p => {
                            segments.push({
                                type: 'pause',
                                moldName,
                                taskName,
                                opType,
                                machineName,
                                startMs: p.startMs,
                                endMs: p.endMs,
                                reason: p.reason
                            });
                        });

                        pauseIntervals.sort((a, b) => a.startMs - b.startMs);

                        let currentPointer = prodStart;
                        pauseIntervals.forEach(p => {
                            if (p.startMs > currentPointer) {
                                segments.push({
                                    type: 'production',
                                    moldName,
                                    taskName,
                                    opType,
                                    machineName,
                                    startMs: currentPointer,
                                    endMs: p.startMs
                                });
                            }
                            currentPointer = p.endMs;
                        });

                        if (prodEnd > currentPointer) {
                            segments.push({
                                type: 'production',
                                moldName,
                                taskName,
                                opType,
                                machineName,
                                startMs: currentPointer,
                                endMs: prodEnd
                            });
                        }
                    }
                }
            });
        });
    });

    return segments;
};

const getDayBoundaries = (dayKey, shiftLogs, operatorName) => {
    const dayShifts = shiftLogs.filter(log => 
        log.operatorName === operatorName && 
        log.date === dayKey
    );
    dayShifts.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    const shiftStartLog = dayShifts.find(s => s.action === 'SHIFT_START');
    const shiftEndLog = dayShifts.find(s => s.action === 'SHIFT_END');

    let startMs, endMs;

    if (shiftStartLog) {
        startMs = new Date(shiftStartLog.timestamp).getTime();
    } else {
        startMs = new Date(`${dayKey}T00:00:00`).getTime();
    }

    if (shiftEndLog) {
        endMs = new Date(shiftEndLog.timestamp).getTime();
    } else if (shiftStartLog) {
        const todayStr = getTodayKey();
        if (dayKey === todayStr) {
            endMs = Date.now();
        } else {
            endMs = new Date(`${dayKey}T23:59:59`).getTime();
        }
    } else {
        startMs = new Date(`${dayKey}T00:00:00`).getTime();
        const todayStr = getTodayKey();
        if (dayKey === todayStr) {
            endMs = Date.now();
        } else {
            endMs = new Date(`${dayKey}T23:59:59`).getTime();
        }
    }

    return { startMs, endMs, hasShift: !!shiftStartLog };
};

const getCroppedActivitiesForDay = (allSegments, dayKey, shiftLogs, operatorName) => {
    const { startMs: dayStart, endMs: dayEnd } = getDayBoundaries(dayKey, shiftLogs, operatorName);
    const cropped = [];

    const isSameDay = (ms, dKey) => {
        const d = new Date(ms);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}` === dKey;
    };

    allSegments.forEach(seg => {
        // Filter out abandoned/inactive long segments for this day
        const totalDur = seg.endMs - seg.startMs;
        const isActiveOnDay = totalDur <= 18 * 3600000 || isSameDay(seg.startMs, dayKey) || isSameDay(seg.endMs, dayKey);
        
        if (!isActiveOnDay) return;

        const s = Math.max(seg.startMs, dayStart);
        const e = Math.min(seg.endMs, dayEnd);

        if (e > s) {
            cropped.push({
                ...seg,
                start: new Date(s).toISOString(),
                end: new Date(e).toISOString(),
                durationMs: e - s,
                type: seg.type === 'setup' ? 'Ayar (Kurulum)' : (seg.type === 'production' ? 'İmalat (Çalışma)' : 'Duruş / Müdahale'),
                typeKey: seg.type
            });
        }
    });

    return cropped.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
};

const PersonnelProductionLogsView = ({ projects, personnel = [] }) => {
    // Left sidebar state
    const [personnelSearchTerm, setPersonnelSearchTerm] = useState('');
    const [selectedOperator, setSelectedOperator] = useState(null);

    // Filter and Tab states
    const [viewMode, setViewMode] = useState('daily'); // 'daily' or 'weekly'
    const [selectedDayKey, setSelectedDayKey] = useState(getTodayKey());

    const [shiftLogs, setShiftLogs] = useState([]);

    // 1. Shift loglarını veritabanından dinle
    useEffect(() => {
        if (!db) return;
        const q = query(
            collection(db, 'artifacts/default-app-id/public/data/operatorShiftLogs'),
            orderBy('timestamp', 'desc')
        );
        const unsub = onSnapshot(q, (snapshot) => {
            setShiftLogs(snapshot.docs.map(doc => doc.data()));
        });
        return () => unsub();
    }, []);

    // 2. Zamanı saat/dakika formatına dönüştürme yardımcısı
    const formatTimeOnly = (dateStr) => {
        if (!dateStr) return 'Devam Ediyor';
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    };

    // 2.5 Tarih alanından takvim formatına dönüştürme ve takvim seçimini işleme
    const getRepresentativeDate = (key, mode) => {
        if (mode === 'daily') return key || '';
        if (!key || !key.includes(' - ')) return '';
        try {
            const parts = key.split(' - ');
            const startParts = parts[0].split('.'); // [dd, mm]
            const year = selectedOpLogs.length > 0 
                ? new Date(selectedOpLogs[0].startDate).getFullYear() 
                : new Date().getFullYear();
            return `${year}-${startParts[1].padStart(2, '0')}-${startParts[0].padStart(2, '0')}`;
        } catch (e) {
            return '';
        }
    };

    const handleDateChange = (val) => {
        if (!val) return;
        if (viewMode === 'daily') {
            setSelectedDayKey(val);
        } else {
            const dateObj = new Date(val);
            if (isNaN(dateObj.getTime())) return;
            
            const temp = new Date(dateObj);
            const day = temp.getDay();
            const diff = temp.getDate() - day + (day === 0 ? -6 : 1);
            const monday = new Date(temp.setDate(diff));
            const sunday = new Date(monday);
            sunday.setDate(sunday.getDate() + 6);
            
            const mm = String(monday.getMonth() + 1).padStart(2, '0');
            const md = String(monday.getDate()).padStart(2, '0');
            const sm = String(sunday.getMonth() + 1).padStart(2, '0');
            const sd = String(sunday.getDate()).padStart(2, '0');
            
            const weekKey = `${md}.${mm} - ${sd}.${sm}`;
            setSelectedDayKey(weekKey);
        }
    };

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

    // Seçili operatörün logları
    const selectedOpLogs = useMemo(() => {
        if (!selectedOperator) return [];
        return allLogs.filter(log => log.operatorName === selectedOperator.name);
    }, [allLogs, selectedOperator]);

    // İlk açılışta kaydı olan ilk operatörü seç
    useEffect(() => {
        if (!selectedOperator && sortedPersonnel.length > 0) {
            const activeOp = sortedPersonnel.find(p => p.logCount > 0);
            if (activeOp) setSelectedOperator(activeOp);
            else setSelectedOperator(sortedPersonnel[0]);
        }
    }, [sortedPersonnel, selectedOperator]);

    // Tarihe göre gruplama (Daily & Weekly)
    const groupedData = useMemo(() => {
        if (!selectedOperator) return { daily: [], weekly: [] };

        const allSegments = getAllOperatorActivities(projects, selectedOperator.name);

        const dailyMap = {};
        const weeklyMap = {};

        const dayKeys = new Set();
        
        allSegments.forEach(seg => {
            const startDate = new Date(seg.startMs);
            const endDate = new Date(seg.endMs);
            
            const current = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
            const endLimit = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
            
            while (current <= endLimit) {
                const yyyy = current.getFullYear();
                const mm = String(current.getMonth() + 1).padStart(2, '0');
                const dd = String(current.getDate()).padStart(2, '0');
                dayKeys.add(`${yyyy}-${mm}-${dd}`);
                current.setDate(current.getDate() + 1);
            }
        });

        shiftLogs.forEach(log => {
            if (log.operatorName === selectedOperator.name && log.date) {
                dayKeys.add(log.date);
            }
        });

        dayKeys.add(getTodayKey());

        dayKeys.forEach(dayKey => {
            const cropped = getCroppedActivitiesForDay(allSegments, dayKey, shiftLogs, selectedOperator.name);
            const { startMs: dayStart, endMs: dayEnd, hasShift } = getDayBoundaries(dayKey, shiftLogs, selectedOperator.name);

            const shiftMs = dayEnd - dayStart;

            let setupMs = 0;
            let prodMs = 0;
            let pauseMs = 0;
            const molds = new Set();
            const machines = new Set();

            cropped.forEach(act => {
                if (act.typeKey === 'setup') setupMs += act.durationMs;
                else if (act.typeKey === 'production') prodMs += act.durationMs;
                else if (act.typeKey === 'pause') pauseMs += act.durationMs;

                molds.add(act.moldName);
                machines.add(act.machineName);
            });

            const getWeekRangeForDate = (dateStr) => {
                const parts = dateStr.split('-');
                const temp = new Date(parts[0], parts[1] - 1, parts[2]);
                const day = temp.getDay();
                const diff = temp.getDate() - day + (day === 0 ? -6 : 1);
                const monday = new Date(temp.setDate(diff));
                const sunday = new Date(monday);
                sunday.setDate(sunday.getDate() + 6);
                return `${String(monday.getDate()).padStart(2, '0')}.${String(monday.getMonth()+1).padStart(2, '0')} - ${String(sunday.getDate()).padStart(2, '0')}.${String(sunday.getMonth()+1).padStart(2, '0')}`;
            };
            const weeklyKey = getWeekRangeForDate(dayKey);

            const parts = dayKey.split('-');
            const dailyDisplay = `${parts[2]}.${parts[1]}.${parts[0]}`;

            dailyMap[dayKey] = {
                key: dayKey,
                display: dailyDisplay,
                setupMs,
                prodMs,
                pauseMs,
                workMs: setupMs + prodMs,
                shiftMs,
                hasShift,
                molds,
                machines,
                logs: cropped
            };

            if (!weeklyMap[weeklyKey]) {
                weeklyMap[weeklyKey] = {
                    key: weeklyKey,
                    display: weeklyKey,
                    setupMs: 0,
                    prodMs: 0,
                    pauseMs: 0,
                    workMs: 0,
                    shiftMs: 0,
                    molds: new Set(),
                    machines: new Set(),
                    logs: []
                };
            }
            weeklyMap[weeklyKey].setupMs += setupMs;
            weeklyMap[weeklyKey].prodMs += prodMs;
            weeklyMap[weeklyKey].pauseMs += pauseMs;
            weeklyMap[weeklyKey].workMs += (setupMs + prodMs);
            weeklyMap[weeklyKey].shiftMs += shiftMs;
            
            cropped.forEach(act => {
                weeklyMap[weeklyKey].molds.add(act.moldName);
                weeklyMap[weeklyKey].machines.add(act.machineName);
                weeklyMap[weeklyKey].logs.push(act);
            });
        });

        const dailyList = Object.values(dailyMap).sort((a, b) => b.key.localeCompare(a.key));
        const weeklyList = Object.values(weeklyMap).sort((a, b) => b.key.localeCompare(a.key));

        return {
            daily: dailyList,
            weekly: weeklyList
        };
    }, [selectedOperator, projects, shiftLogs]);

    // Seçili periyot (grafik veya detay için)
    const activePeriodData = useMemo(() => {
        const list = viewMode === 'daily' ? groupedData.daily : groupedData.weekly;
        return list.find(d => d.key === selectedDayKey) || null;
    }, [groupedData, viewMode, selectedDayKey]);

    // 3. Seçili gün ve operatör için vardiya bilgilerini çek
    const activeShiftInfo = useMemo(() => {
        if (!selectedOperator || !selectedDayKey) return null;
        
        const dayShifts = shiftLogs.filter(log => 
            log.operatorName === selectedOperator.name && 
            log.date === selectedDayKey
        );

        dayShifts.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

        const shiftStart = dayShifts.find(s => s.action === 'SHIFT_START');
        const shiftEnd = dayShifts.find(s => s.action === 'SHIFT_END');

        let durationStr = null;
        if (shiftStart && shiftEnd) {
            const startMs = new Date(shiftStart.timestamp).getTime();
            const endMs = new Date(shiftEnd.timestamp).getTime();
            if (!isNaN(startMs) && !isNaN(endMs)) {
                durationStr = formatDuration(endMs - startMs);
            }
        } else if (shiftStart) {
            const startMs = new Date(shiftStart.timestamp).getTime();
            if (!isNaN(startMs)) {
                durationStr = formatDuration(Date.now() - startMs) + " (Devam Ediyor)";
            }
        }

        return {
            start: shiftStart ? shiftStart.timestamp : null,
            end: shiftEnd ? shiftEnd.timestamp : null,
            machineName: shiftStart ? shiftStart.machineName : (shiftEnd ? shiftEnd.machineName : null),
            durationStr
        };
    }, [shiftLogs, selectedOperator, selectedDayKey]);

    // 4. Operatörün gün içindeki aktif iş segmentlerini (Ayar ve İmalat) kronolojik hesapla
    const operatorActivities = useMemo(() => {
        return activePeriodData ? activePeriodData.logs : [];
    }, [activePeriodData]);

    // Seçili periyot değiştiğinde varsayılan olarak bugünü ayarla
    useEffect(() => {
        if (viewMode === 'daily') {
            setSelectedDayKey(getTodayKey());
        } else {
            const weekKey = (() => {
                const d = new Date();
                const day = d.getDay();
                const diff = d.getDate() - day + (day === 0 ? -6 : 1);
                const monday = new Date(d.setDate(diff));
                const sunday = new Date(monday);
                sunday.setDate(sunday.getDate() + 6);
                
                const mm = String(monday.getMonth() + 1).padStart(2, '0');
                const md = String(monday.getDate()).padStart(2, '0');
                const sm = String(sunday.getMonth() + 1).padStart(2, '0');
                const sd = String(sunday.getDate()).padStart(2, '0');
                
                return `${md}.${mm} - ${sd}.${sm}`;
            })();
            setSelectedDayKey(weekKey);
        }
    }, [selectedOperator, viewMode]);

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

        const dayLogs = activePeriodData.logs;
        const actualShiftHours = activePeriodData.shiftMs > 0 ? (activePeriodData.shiftMs / 3600000) : 8;

        // 1. Get shift boundaries in milliseconds
        const { startMs: dayStartMs, endMs: dayEndMs } = getDayBoundaries(selectedDayKey, shiftLogs, selectedOperator.name);

        // 2. Run simulation in 1-minute steps
        let setupMinutes = 0;
        let pauseMinutes = 0;
        let idleMinutes = 0; // Teknik serbest / boş zaman

        const stepMs = 60000; // 1 minute

        for (let t = dayStartMs; t < dayEndMs; t += stepMs) {
            // Find all segments active at time t
            const activeSegs = dayLogs.filter(seg => {
                const s = new Date(seg.start).getTime();
                const e = new Date(seg.end).getTime();
                return t >= s && t < e;
            });

            if (activeSegs.length === 0) {
                // No active machines -> operator is free/idle
                idleMinutes++;
            } else {
                const hasSetup = activeSegs.some(seg => seg.typeKey === 'setup');
                const hasPause = activeSegs.some(seg => seg.typeKey === 'pause');

                if (hasSetup) {
                    setupMinutes++;
                } else if (hasPause) {
                    pauseMinutes++;
                } else {
                    // All active machines are in production -> Operator is Teknik Serbest / Gözlem
                    idleMinutes++;
                }
            }
        }

        const setupHours = setupMinutes / 60;
        const pauseHours = pauseMinutes / 60;
        const idleHours = idleMinutes / 60;

        // Machine production hours (net sum of machine runs for efficiency index)
        let prodHours = 0;
        dayLogs.forEach(seg => {
            if (seg.typeKey === 'production') {
                prodHours += seg.durationMs / 3600000;
            }
        });

        // workloadFactor (Tezgah Verimi) = Toplam İmalat / Vardiya Süresi
        const workloadFactor = actualShiftHours > 0 ? (prodHours / actualShiftHours).toFixed(1) : "0.0";

        // Yüzdelikler
        const totalMeasured = setupHours + pauseHours + idleHours;
        const setupPercent = totalMeasured > 0 ? ((setupHours / totalMeasured) * 100).toFixed(1) : 0;
        const pausePercent = totalMeasured > 0 ? ((pauseHours / totalMeasured) * 100).toFixed(1) : 0;
        const idlePercent = totalMeasured > 0 ? ((idleHours / totalMeasured) * 100).toFixed(1) : 0;

        return {
            setupHours: setupHours.toFixed(1),
            pauseHours: pauseHours.toFixed(1),
            prodHours: prodHours.toFixed(1), // This remains the net machine production hours
            idleHours: idleHours.toFixed(1), // This is the calculated free/idle hours
            workloadFactor,
            setupPercent,
            pausePercent,
            idlePercent,
            machinesCount: activePeriodData.machines.size,
            moldsCount: activePeriodData.molds.size,
            actualShiftHours: actualShiftHours.toFixed(1)
        };
    }, [activePeriodData, selectedDayKey, shiftLogs, selectedOperator]);

    // --- TIMELINE GRID HESAPLAMALARI ---
    const timelineBounds = useMemo(() => {
        if (!activePeriodData || activePeriodData.logs.length === 0) return { minMs: 0, maxMs: 0, durationMs: 0 };
        let minMs = Infinity;
        let maxMs = -Infinity;

        activePeriodData.logs.forEach(log => {
            const start = new Date(log.start).getTime();
            if (start < minMs) minMs = start;

            let end = new Date(log.end).getTime();
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

        dayLogs.filter(log => log.machineName === machineName).forEach(log => {
            const s = Math.max(timelineStart, new Date(log.start).getTime());
            const e = Math.min(timelineEnd, new Date(log.end).getTime());

            if (e > s) {
                const leftPercent = ((s - timelineStart) / timelineDuration) * 100;
                const widthPercent = ((e - s) / timelineDuration) * 100;
                segments.push({
                    type: log.typeKey,
                    label: log.typeKey === 'setup' ? 'Ayar' : (log.typeKey === 'production' ? 'İmalat' : `Duruş: ${log.reason || 'Belirtilmedi'}`),
                    moldName: log.moldName,
                    opType: log.opType,
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
                                    {/* Sol Taraf: Periyot Seçimi */}
                                    <div className="lg:col-span-1 bg-white dark:bg-gray-800 p-5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm space-y-4 flex flex-col justify-between">
                                        <div className="space-y-4">
                                            <h3 className="font-extrabold text-sm text-gray-800 dark:text-white flex items-center gap-2">
                                                <Sliders className="w-4 h-4 text-orange-500" /> Analiz Parametreleri
                                            </h3>

                                            {/* Periyot Seçici */}
                                            <div>
                                                <label className="block text-xs font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">İncelenecek Tarih / Periyot</label>
                                                <input
                                                    type="date"
                                                    value={getRepresentativeDate(selectedDayKey, viewMode)}
                                                    onChange={(e) => handleDateChange(e.target.value)}
                                                    className="w-full p-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-xs outline-none focus:ring-2 focus:ring-orange-500 font-bold cursor-pointer"
                                                />
                                            </div>
                                        </div>

                                        <div className="p-3 bg-blue-50/50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/50 rounded-xl text-blue-800 dark:text-blue-300 text-[11px] font-semibold leading-relaxed flex gap-2 items-start mt-2">
                                            <Info className="w-4 h-4 shrink-0 text-blue-500 mt-0.5" />
                                            <span>
                                                Vardiya süresi, operatörün terminalden yaptığı Giriş ve Çıkış kayıtlarına göre otomatik hesaplanır. Giriş/Çıkış kaydı yoksa standart 8 saat kabul edilir.
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
                                                        <span>Toplam: {simulatorStats.actualShiftHours} Saat</span>
                                                    </div>
                                                    <div className="h-6 w-full rounded-lg overflow-hidden flex shadow-inner">
                                                        {parseFloat(simulatorStats.setupHours) > 0 && (
                                                            <div 
                                                                style={{ width: `${Math.min(100, (parseFloat(simulatorStats.setupHours) / parseFloat(simulatorStats.actualShiftHours)) * 100)}%` }} 
                                                                className="bg-blue-500 hover:bg-blue-600 transition-colors flex items-center justify-center text-[10px] text-white font-black truncate px-1"
                                                                title={`Ayar: ${simulatorStats.setupHours} Saat`}
                                                            >
                                                                {simulatorStats.setupPercent}% Ayar
                                                            </div>
                                                        )}
                                                        {parseFloat(simulatorStats.pauseHours) > 0 && (
                                                            <div 
                                                                style={{ width: `${Math.min(100, (parseFloat(simulatorStats.pauseHours) / parseFloat(simulatorStats.actualShiftHours)) * 100)}%` }} 
                                                                className="bg-red-500 hover:bg-red-600 transition-colors flex items-center justify-center text-[10px] text-white font-black truncate px-1"
                                                                title={`Duruş: ${simulatorStats.pauseHours} Saat`}
                                                            >
                                                                {simulatorStats.pausePercent}% Duruş
                                                            </div>
                                                        )}
                                                        {parseFloat(simulatorStats.idleHours) > 0 && (
                                                            <div 
                                                                style={{ width: `${Math.min(100, (parseFloat(simulatorStats.idleHours) / parseFloat(simulatorStats.actualShiftHours)) * 100)}%` }} 
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

                                {/* 6. VARDİYA & KRONOLOJİK OPERATÖR İŞ TAKİP TABLOSU */}
                                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden space-y-4 p-5">
                                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-gray-200 dark:border-gray-700">
                                        <h3 className="font-extrabold text-sm text-gray-800 dark:text-white flex items-center gap-2">
                                            <Clock className="w-4 h-4 text-orange-500" /> Vardiya & Kronolojik İş Takip Detayları
                                        </h3>
                                        <div className="flex gap-2">
                                            <span className="text-[11px] font-black text-orange-600 bg-orange-50 dark:bg-orange-950/20 px-2.5 py-1 rounded">
                                                {operatorActivities.length} İşlem Segmenti
                                            </span>
                                        </div>
                                    </div>

                                    {/* Vardiya Başlangıç / Sonu Özet Kartı */}
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-gray-50 dark:bg-gray-900/50 p-4 rounded-xl border border-gray-200 dark:border-gray-800">
                                        <div className="space-y-1">
                                            <span className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-wider">VARDİYA GİRİŞ (SHIFT START)</span>
                                            <div className="text-sm font-extrabold text-gray-800 dark:text-white">
                                                {activeShiftInfo?.start ? (
                                                    <span className="flex items-center gap-1.5 text-green-600 dark:text-green-400">
                                                        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                                                        {formatTimeOnly(activeShiftInfo.start)} {activeShiftInfo.machineName && `(${activeShiftInfo.machineName})`}
                                                    </span>
                                                ) : (
                                                    <span className="text-gray-400 font-bold italic">Giriş Yapılmadı</span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="space-y-1">
                                            <span className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-wider">VARDİYA ÇIKIŞ (SHIFT END)</span>
                                            <div className="text-sm font-extrabold text-gray-800 dark:text-white">
                                                {activeShiftInfo?.end ? (
                                                    <span className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400">
                                                        <span className="w-2 h-2 rounded-full bg-blue-505"></span>
                                                        {formatTimeOnly(activeShiftInfo.end)}
                                                    </span>
                                                ) : activeShiftInfo?.start ? (
                                                    <span className="flex items-center gap-1.5 text-orange-500 animate-pulse font-extrabold">
                                                        <span className="w-2 h-2 rounded-full bg-orange-500"></span>
                                                        Devam Ediyor / Çıkış Yapılmadı
                                                    </span>
                                                ) : (
                                                    <span className="text-gray-400 font-bold italic">Çıkış Yapılmadı</span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="space-y-1">
                                            <span className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-wider">TOPLAM VARDİYA SÜRESİ</span>
                                            <div className="text-sm font-black text-gray-900 dark:text-white">
                                                {activeShiftInfo?.durationStr || <span className="text-gray-400 font-bold italic">---</span>}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Kronolojik İş Tablosu */}
                                    <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
                                        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-xs">
                                            <thead className="bg-gray-50 dark:bg-gray-900/50">
                                                <tr>
                                                    <th className="px-6 py-3 text-left font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider">Saat Aralığı</th>
                                                    <th className="px-6 py-3 text-left font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider">Kalıp Adı</th>
                                                    <th className="px-6 py-3 text-left font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider">İşlem / Aşama</th>
                                                    <th className="px-6 py-3 text-left font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider">Tezgah</th>
                                                    <th className="px-6 py-3 text-center font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider">Aktivite Tipi</th>
                                                    <th className="px-6 py-3 text-center font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider">Çalışılan Süre</th>
                                                </tr>
                                            </thead>
                                            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                                                {operatorActivities.length === 0 ? (
                                                    <tr>
                                                        <td colSpan="6" className="px-6 py-8 text-center text-gray-400 dark:text-gray-500 font-semibold italic">
                                                            Seçilen periyotta operatörün aktif çalışma segmenti bulunamadı.
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    operatorActivities.map((act, idx) => (
                                                        <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition">
                                                            <td className="px-6 py-4 whitespace-nowrap font-black text-gray-800 dark:text-gray-200">
                                                                {formatTimeOnly(act.start)} - {formatTimeOnly(act.end)}
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap">
                                                                <span className="inline-block bg-orange-50 dark:bg-orange-950/20 text-orange-700 dark:text-orange-400 font-extrabold px-2.5 py-0.5 rounded border border-orange-100 dark:border-orange-900/30">
                                                                    {act.moldName}
                                                                </span>
                                                            </td>
                                                            <td className="px-6 py-4">
                                                                <div className="font-extrabold text-gray-900 dark:text-white">{act.opType}</div>
                                                                <div className="text-[10px] text-gray-400 mt-0.5">{act.taskName}</div>
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap font-bold text-gray-800 dark:text-gray-200">
                                                                <div className="flex items-center gap-1">
                                                                    <Monitor className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                                                                    {act.machineName}
                                                                </div>
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap text-center">
                                                                <span className={`px-2.5 py-1 rounded text-[10px] font-black uppercase ${
                                                                    act.typeKey === 'setup'
                                                                        ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                                                                        : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                                                                }`}>
                                                                    {act.type}
                                                                </span>
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap text-center font-black text-gray-900 dark:text-white">
                                                                {formatDuration(act.durationMs)}
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
