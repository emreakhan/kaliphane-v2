// src/pages/WorkshopSupervisorPage.js

import React, { useState, useEffect, useMemo } from 'react';
import { 
    Monitor, Play, Pause, Users, Clock, Radio, 
    CheckCircle2, AlertOctagon, UserX, RefreshCw, Sliders, ArrowRight
} from 'lucide-react';
import { collection, query, where, onSnapshot } from '../config/firebase.js';
import { ROLES, OPERATION_STATUS } from '../config/constants.js';

const getPauseReasonText = (reason) => {
    if (!reason) return '';
    if (typeof reason === 'object') {
        const parts = [];
        if (reason.reason) parts.push(reason.reason);
        if (reason.description) parts.push(reason.description);
        return parts.join(' - ');
    }
    return reason.toString();
};

const getMachineDetailedTimelineToday = (machineName, projectsData) => {
    const timeline = [];
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    const now = new Date();

    const parseDate = (dStr) => {
        if (!dStr) return null;
        const d = new Date(dStr);
        return isNaN(d.getTime()) ? null : d;
    };

    const restrictToToday = (startDate, endDate) => {
        if (!startDate) return null;
        const start = parseDate(startDate) || midnight;
        const end = endDate ? (parseDate(endDate) || now) : now;
        
        const effectiveStart = start > midnight ? start : midnight;
        const effectiveEnd = end > midnight ? end : midnight;

        if (effectiveStart >= now) return null;
        if (effectiveEnd < midnight) return null;

        const durationMinutes = Math.max(0, Math.floor((effectiveEnd - effectiveStart) / 60000));
        return {
            start: effectiveStart,
            end: endDate ? effectiveEnd : null,
            durationMinutes
        };
    };

    projectsData.forEach(project => {
        (project.tasks || []).forEach(task => {
            (task.operations || []).forEach(op => {
                if (op.machineName !== machineName) return;

                const camOperator = task.camPreparation?.preparedBy || project.camResponsible || 'Belirtilmedi';
                const machineOperator = op.machineOperatorName || 'Belirtilmedi';

                // 1. Setup Phase
                if (op.setupStartTime) {
                    let setupEnd = op.productionStartTime || op.lastPausedAt || op.finishDate || null;
                    if (op.pauseHistory && op.pauseHistory.length > 0) {
                        const firstPause = op.pauseHistory[0].pausedAt;
                        if (firstPause && (!setupEnd || new Date(firstPause) < new Date(setupEnd))) {
                            setupEnd = firstPause;
                        }
                    }

                    const segment = restrictToToday(op.setupStartTime, setupEnd);
                    if (segment) {
                        timeline.push({
                            type: 'AYAR',
                            label: 'Tezgah Ayarı / Hazırlık',
                            moldName: project.moldName,
                            taskName: task.taskName,
                            opType: op.type,
                            camOperator,
                            machineOperator,
                            ...segment,
                            color: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800/30'
                        });
                    }
                }

                // 2. Production Phase
                if (op.productionStartTime) {
                    let prodEnd = op.finishDate || op.lastPausedAt || null;
                    if (op.pauseHistory) {
                        op.pauseHistory.forEach(p => {
                            if (p.pausedAt && new Date(p.pausedAt) > new Date(op.productionStartTime)) {
                                if (!prodEnd || new Date(p.pausedAt) < new Date(prodEnd)) {
                                    prodEnd = p.pausedAt;
                                }
                            }
                        });
                    }

                    const segment = restrictToToday(op.productionStartTime, prodEnd);
                    if (segment) {
                        timeline.push({
                            type: 'ÜRETİM',
                            label: 'Seri İmalat / Üretim',
                            moldName: project.moldName,
                            taskName: task.taskName,
                            opType: op.type,
                            camOperator,
                            machineOperator,
                            ...segment,
                            color: 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800/30'
                        });
                    }
                }

                // 3. Pause History
                (op.pauseHistory || []).forEach((pause, pIdx) => {
                    const segment = restrictToToday(pause.pausedAt, pause.resumedAt);
                    if (segment) {
                        timeline.push({
                            type: 'DURAKLATMA',
                            label: `Duraklatma: ${getPauseReasonText(pause.reason)}`,
                            moldName: project.moldName,
                            taskName: task.taskName,
                            opType: op.type,
                            camOperator,
                            machineOperator,
                            ...segment,
                            color: 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800/30'
                        });
                    }

                    if (pause.resumedAt) {
                        let resumeEnd = op.finishDate || op.lastPausedAt || null;
                        if (op.pauseHistory[pIdx + 1]) {
                            resumeEnd = op.pauseHistory[pIdx + 1].pausedAt;
                        }
                        const resumeSegment = restrictToToday(pause.resumedAt, resumeEnd);
                        if (resumeSegment) {
                            const isProd = op.productionStartTime && new Date(pause.resumedAt) >= new Date(op.productionStartTime);
                            timeline.push({
                                type: isProd ? 'ÜRETİM' : 'AYAR',
                                label: isProd ? 'Seri İmalat (Devam)' : 'Tezgah Ayarı (Devam)',
                                moldName: project.moldName,
                                taskName: task.taskName,
                                opType: op.type,
                                camOperator,
                                machineOperator,
                                ...resumeSegment,
                                color: isProd 
                                    ? 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800/30'
                                    : 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800/30'
                            });
                        }
                    }
                });

                // 4. Current Active Pause
                if (op.status === OPERATION_STATUS.PAUSED && op.lastPausedAt) {
                    const segment = restrictToToday(op.lastPausedAt, null);
                    if (segment) {
                        timeline.push({
                            type: 'DURAKLATMA',
                            label: `Aktif Duraklama: ${getPauseReasonText(op.lastPauseReason) || 'Belirtilmedi'}`,
                            moldName: project.moldName,
                            taskName: task.taskName,
                            opType: op.type,
                            camOperator,
                            machineOperator,
                            ...segment,
                            color: 'text-red-600 dark:text-red-400 bg-red-50/50 dark:bg-red-950/20 border-red-300 dark:border-red-800/30 font-black'
                        });
                    }
                }
            });
        });
    });

    return timeline.sort((a, b) => a.start - b.start);
};

const WorkshopSupervisorPage = ({ db, projects = [], personnel = [], machines = [] }) => {
    // 1. Durum güncellemesi için otomatik tetikleyici (Her 15 saniyede bir süreleri yeniler)
    const [tick, setTick] = useState(0);
    useEffect(() => {
        const interval = setInterval(() => {
            setTick(t => t + 1);
        }, 15000);
        return () => clearInterval(interval);
    }, []);

    // 2. Uyarı Eşiği State'i (LocalStorage destekli)
    const [alertThreshold, setAlertThreshold] = useState(() => {
        const saved = localStorage.getItem('kaliphane_supervisor_alert_threshold');
        return saved ? parseInt(saved, 10) : 60; // varsayılan 60 dakika (1 saat)
    });

    const handleThresholdChange = (val) => {
        setAlertThreshold(val);
        localStorage.setItem('kaliphane_supervisor_alert_threshold', val.toString());
    };

    const [selectedMachine, setSelectedMachine] = useState(null);
    const [nonActiveOnly, setNonActiveOnly] = useState(false);

    // 3. Bugünün Vardiya Loglarını Çekme
    const [shiftLogs, setShiftLogs] = useState([]);
    useEffect(() => {
        if (!db) return;
        const todayStr = new Date().toISOString().substring(0, 10);
        
        const q = query(
            collection(db, 'artifacts/default-app-id/public/data/operatorShiftLogs'),
            where('date', '==', todayStr)
        );
        
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const logsData = snapshot.docs.map(doc => doc.data());
            // Tarihe göre azalan sıralama (En son aksiyon en üstte)
            logsData.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            setShiftLogs(logsData);
        }, (error) => {
            console.error("Vardiya logları çekme hatası:", error);
        });
        
        return () => unsubscribe();
    }, [db]);

    // 4. Günlük Sınırlar İçinde Süre Hesaplama Yardımcısı
    const getDurationTodayInMinutes = (timestampStr) => {
        if (!timestampStr) return 0;
        const now = new Date();
        const start = new Date(timestampStr);
        const midnight = new Date();
        midnight.setHours(0, 0, 0, 0);
        
        // Eğer aksiyon dünden kalmaysa süreyi bugünün başından (00:00) itibaren hesapla
        const effectiveStart = start > midnight ? start : midnight;
        const diffMs = now - effectiveStart;
        return Math.max(0, Math.floor(diffMs / 60000));
    };

    // Formatör (Dakikayı Saat/Dakika formatına çevirir)
    const formatMinutes = (mins) => {
        if (mins < 60) return `${mins} dk`;
        const hrs = Math.floor(mins / 60);
        const rem = mins % 60;
        return rem > 0 ? `${hrs} sa ${rem} dk` : `${hrs} sa`;
    };

    // 5. Tezgâh Durum Matrisi Hesaplama
    const machinesStats = useMemo(() => {
        const stats = {};
        const midnight = new Date();
        midnight.setHours(0, 0, 0, 0);

        // Tezgâhları varsayılan olarak boşta başlat
        machines.forEach(m => {
            stats[m.name] = {
                machineId: m.id,
                machineName: m.name,
                status: 'BOŞTA', // 'ÇALIŞIYOR', 'DURAKLATILDI', 'BOŞTA'
                activePart: null,
                activeMold: null,
                operatorName: null,
                lastActionTime: midnight.toISOString(),
                durationMinutes: 0,
                statusColor: 'text-gray-500 bg-gray-100 dark:bg-gray-800/80 dark:text-gray-400 border-gray-200 dark:border-gray-700',
                badgeColor: 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
            };
        });

        // Aktif projeleri tara ve tezgâhlardaki işleri bul
        projects.forEach(project => {
            (project.tasks || []).forEach(task => {
                (task.operations || []).forEach(op => {
                    const mName = op.machineName;
                    if (!mName || !stats[mName]) return;

                    // Eğer çalışıyorsa
                    if (op.status === OPERATION_STATUS.IN_PROGRESS) {
                        const startTime = op.productionStartTime || op.setupStartTime || midnight.toISOString();
                        const duration = getDurationTodayInMinutes(startTime);
                        const isSettingUp = op.isSettingUp || (!op.productionStartTime && op.setupStartTime);
                        
                        stats[mName] = {
                            ...stats[mName],
                            status: isSettingUp ? 'AYAR YAPILIYOR' : 'ÇALIŞIYOR',
                            activePart: task.taskName,
                            activeMold: project.moldName,
                            operatorName: op.machineOperatorName || 'Belirtilmedi',
                            lastActionTime: startTime,
                            durationMinutes: duration,
                            statusColor: isSettingUp
                                ? 'text-yellow-600 bg-yellow-50 dark:bg-yellow-950/30 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800/40'
                                : 'text-green-600 bg-green-50 dark:bg-green-950/30 dark:text-green-400 border-green-200 dark:border-green-800/40',
                            badgeColor: isSettingUp
                                ? 'bg-yellow-500 text-white shadow-sm shadow-yellow-500/20'
                                : 'bg-green-500 text-white shadow-sm shadow-green-500/20'
                        };
                    } 
                    // Eğer duraklatılmış ve operatör tamamlamamışsa
                    else if (op.status === OPERATION_STATUS.PAUSED && !op.isOperatorFinished) {
                        if (stats[mName].status !== 'ÇALIŞIYOR' && stats[mName].status !== 'AYAR YAPILIYOR') { // Çalışan iş duraklatılandan önceliklidir
                            const pauseTime = op.lastPausedAt || midnight.toISOString();
                            const duration = getDurationTodayInMinutes(pauseTime);
                            
                            stats[mName] = {
                                ...stats[mName],
                                status: 'DURAKLATILDI',
                                activePart: task.taskName,
                                activeMold: project.moldName,
                                operatorName: op.machineOperatorName || 'Belirtilmedi',
                                lastActionTime: pauseTime,
                                durationMinutes: duration,
                                lastPauseReason: getPauseReasonText(op.lastPauseReason) || 'Sebep Belirtilmedi',
                                statusColor: 'text-red-600 bg-red-50 dark:bg-red-950/30 dark:text-red-400 border-red-200 dark:border-red-805/40',
                                badgeColor: 'bg-red-500 text-white shadow-sm shadow-red-500/20'
                            };
                        }
                    }
                });
            });
        });

        // Boşta olan tezgâhların bugünkü son aksiyon zamanını ve boş kalma sürelerini hesapla
        Object.keys(stats).forEach(mName => {
            if (stats[mName].status === 'BOŞTA') {
                let latestFinish = midnight;
                projects.forEach(project => {
                    (project.tasks || []).forEach(task => {
                        (task.operations || []).forEach(op => {
                            if (op.machineName === mName) {
                                const fDate = op.finishDate ? new Date(op.finishDate) : null;
                                if (fDate && fDate > latestFinish) latestFinish = fDate;

                                const pDate = (op.status === OPERATION_STATUS.PAUSED && op.lastPausedAt) ? new Date(op.lastPausedAt) : null;
                                if (pDate && pDate > latestFinish) latestFinish = pDate;
                            }
                        });
                    });
                });

                const duration = Math.max(0, Math.floor((new Date() - latestFinish) / 60000));
                stats[mName].lastActionTime = latestFinish.toISOString();
                stats[mName].durationMinutes = duration;
            }
        });

        // Doğal sıralama ile (K01, K02... K10) döndür
        return Object.values(stats).sort((a, b) => 
            a.machineName.localeCompare(b.machineName, undefined, { numeric: true, sensitivity: 'base' })
        );
    }, [projects, machines, tick]);

    // 6. Operatör Giriş Durum Listesi
    const operatorsStatus = useMemo(() => {
        const opList = [];
        const opPersonnel = personnel.filter(p => 
            p.role === ROLES.MACHINE_OPERATOR || 
            p.role === ROLES.CNC_TORNA_OPERATORU ||
            (p.role && p.role.toLowerCase().includes('operatör'))
        );

        opPersonnel.forEach(p => {
            const userLogs = shiftLogs.filter(l => l.operatorName === p.name);
            let status = 'GİRİŞ YAPMAMIŞ';
            let lastActionTime = null;
            let currentMachine = null;

            if (userLogs.length > 0) {
                const latestLog = userLogs[0];
                if (latestLog.action === 'SHIFT_START') {
                    status = 'AKTİF VARDİYADA';
                    currentMachine = latestLog.machineName;
                } else {
                    status = 'ÇIKIŞ YAPTI';
                }
                lastActionTime = latestLog.timestamp;
            }

            opList.push({
                id: p.id,
                name: p.name,
                role: p.role,
                status,
                lastActionTime,
                currentMachine,
                statusColor: status === 'AKTİF VARDİYADA' 
                    ? 'text-green-600 bg-green-50 dark:bg-green-950/20 dark:text-green-400 border-green-100 dark:border-green-900/20' 
                    : (status === 'ÇIKIŞ YAPTI' 
                        ? 'text-orange-600 bg-orange-50 dark:bg-orange-950/20 dark:text-orange-400 border-orange-100 dark:border-orange-900/20' 
                        : 'text-gray-500 bg-gray-100 dark:bg-gray-800 dark:text-gray-400 border-gray-200 dark:border-gray-700')
            });
        });

        // Sıralama: Aktifler üstte, sonra giriş yapmayanlar, en son çıkış yapanlar
        const statusOrder = { 'AKTİF VARDİYADA': 1, 'GİRİŞ YAPMAMIŞ': 2, 'ÇIKIŞ YAPTI': 3 };
        return opList.sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);
    }, [personnel, shiftLogs]);

    // 7. Günlük Canlı Aksiyon Akışı (Today's Live Action Feed)
    const todayEvents = useMemo(() => {
        const events = [];
        const todayStr = new Date().toISOString().substring(0, 10);

        // Vardiya Loglarını Ekle
        shiftLogs.forEach(log => {
            const timeObj = new Date(log.timestamp);
            events.push({
                id: log.id,
                time: timeObj,
                timeStr: timeObj.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
                type: log.action === 'SHIFT_START' ? 'Vardiya Başladı' : 'Vardiya Bitti',
                user: log.operatorName,
                machine: log.machineName,
                description: `${log.operatorName}, ${log.machineName} tezgahında vardiyasını ${log.action === 'SHIFT_START' ? 'başlattı' : 'sonlandırdı'}.`,
                color: log.action === 'SHIFT_START' ? 'text-green-600 dark:text-green-400' : 'text-orange-600 dark:text-orange-400',
                icon: Users
            });
        });

        // Proje / Parça Operasyon Aksiyonlarını Ekle
        projects.forEach(project => {
            (project.tasks || []).forEach(task => {
                (task.operations || []).forEach(op => {
                    // Ayar Başlangıcı
                    if (op.setupStartTime && op.setupStartTime.startsWith(todayStr)) {
                        const tObj = new Date(op.setupStartTime);
                        events.push({
                            id: `${op.id}-setup`,
                            time: tObj,
                            timeStr: tObj.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
                            type: 'Ayar Başlangıcı',
                            user: op.machineOperatorName || 'Belirtilmedi',
                            machine: op.machineName || 'Tezgahsız',
                            description: `${op.machineOperatorName || 'Operatör'}, ${project.moldName} (${task.taskName}) kalıbında ${op.type} ayarına başladı.`,
                            color: 'text-blue-600 dark:text-blue-400',
                            icon: Clock
                        });
                    }
                    // Üretim Başlangıcı
                    if (op.productionStartTime && op.productionStartTime.startsWith(todayStr)) {
                        const tObj = new Date(op.productionStartTime);
                        events.push({
                            id: `${op.id}-prod`,
                            time: tObj,
                            timeStr: tObj.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
                            type: 'Üretim Başladı',
                            user: op.machineOperatorName || 'Belirtilmedi',
                            machine: op.machineName || 'Tezgahsız',
                            description: `${op.machineOperatorName || 'Operatör'}, ${project.moldName} (${task.taskName}) kalıbında ${op.type} üretimine başladı.`,
                            color: 'text-purple-600 dark:text-purple-400',
                            icon: Play
                        });
                    }
                    // Geçmiş Duraklatmalar
                    (op.pauseHistory || []).forEach((pause, pIdx) => {
                        if (pause.pausedAt && pause.pausedAt.startsWith(todayStr)) {
                            const tObj = new Date(pause.pausedAt);
                            events.push({
                                id: `${op.id}-paused-${pIdx}`,
                                time: tObj,
                                timeStr: tObj.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
                                type: 'İş Durduruldu',
                                user: op.machineOperatorName || 'Belirtilmedi',
                                machine: op.machineName || 'Tezgahsız',
                                description: `${op.machineOperatorName || 'Operatör'}, ${project.moldName} (${task.taskName}) işini durdurdu. Neden: ${getPauseReasonText(pause.reason)}`,
                                color: 'text-red-600 dark:text-red-400',
                                icon: Pause
                            });
                        }
                        if (pause.resumedAt && pause.resumedAt.startsWith(todayStr)) {
                            const tObj = new Date(pause.resumedAt);
                            events.push({
                                id: `${op.id}-resumed-${pIdx}`,
                                time: tObj,
                                timeStr: tObj.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
                                type: 'İşe Devam Edildi',
                                user: op.machineOperatorName || 'Belirtilmedi',
                                machine: op.machineName || 'Tezgahsız',
                                description: `${op.machineOperatorName || 'Operatör'}, ${project.moldName} (${task.taskName}) işine devam etti.`,
                                color: 'text-emerald-600 dark:text-emerald-400',
                                icon: Play
                            });
                        }
                    });
                    // Aktif Duraklama (Eğer tarih bugünse)
                    if (op.status === OPERATION_STATUS.PAUSED && op.lastPausedAt && op.lastPausedAt.startsWith(todayStr)) {
                        const tObj = new Date(op.lastPausedAt);
                        events.push({
                            id: `${op.id}-active-pause`,
                            time: tObj,
                            timeStr: tObj.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
                            type: 'İş Durduruldu (Aktif)',
                            user: op.machineOperatorName || 'Belirtilmedi',
                            machine: op.machineName || 'Tezgahsız',
                            description: `${op.machineOperatorName || 'Operatör'}, ${project.moldName} (${task.taskName}) işini askıya aldı. Neden: ${getPauseReasonText(op.lastPauseReason) || 'Belirtilmedi'}`,
                            color: 'text-red-600 dark:text-red-400',
                            icon: Pause
                        });
                    }
                    // İş Bitimi
                    if (op.finishDate && op.finishDate.startsWith(todayStr)) {
                        const tObj = new Date(op.finishDate);
                        events.push({
                            id: `${op.id}-finish`,
                            time: tObj,
                            timeStr: tObj.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
                            type: 'İş Tamamlandı',
                            user: op.machineOperatorName || 'Belirtilmedi',
                            machine: op.machineName || 'Tezgahsız',
                            description: `${op.machineOperatorName || 'Operatör'}, ${project.moldName} (${task.taskName}) kalıbındaki işini tamamladı.`,
                            color: 'text-yellow-600 dark:text-yellow-400',
                            icon: CheckCircle2
                        });
                    }
                });
            });
        });

        // En yeniden en eskiye sırala
        return events.sort((a, b) => b.time - a.time);
    }, [shiftLogs, projects]);

    // 8. İstatistikler
    const stats = useMemo(() => {
        const running = machinesStats.filter(m => m.status === 'ÇALIŞIYOR').length;
        const paused = machinesStats.filter(m => m.status === 'DURAKLATILDI').length;
        const idle = machinesStats.filter(m => m.status === 'BOŞTA').length;
        const unsignedOps = operatorsStatus.filter(op => op.status === 'GİRİŞ YAPMAMIŞ').length;
        return { running, paused, idle, unsignedOps };
    }, [machinesStats, operatorsStatus]);

    return (
        <div className="p-4 sm:p-6 bg-gray-50 dark:bg-gray-900 min-h-screen font-sans text-gray-900 dark:text-white transition-colors duration-200">
            {/* ÜST BAŞLIK ALANI */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 border-b dark:border-gray-800 pb-5">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-extrabold flex items-center tracking-tight">
                        <Monitor className="w-8 h-8 text-blue-600 dark:text-blue-400 mr-3" />
                        Atölye Şefi Denetim Paneli
                    </h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 font-bold">
                        Üretim sahası, tezgâh durumları ve operatör aksiyonlarının tam zamanlı günlük takibi.
                    </p>
                </div>

                {/* SÜRE EŞİK AYARI */}
                <div className="flex items-center gap-4 p-3 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 w-full md:w-auto">
                    <Sliders className="w-5 h-5 text-blue-500 shrink-0" />
                    <div className="flex-1 md:flex-none">
                        <div className="flex justify-between text-xs font-black text-gray-500 dark:text-gray-400 mb-1">
                            <span>Boşta/Duraklama Uyarı Sınırı:</span>
                            <span className="text-blue-600 dark:text-blue-400">{formatMinutes(alertThreshold)}</span>
                        </div>
                        <input 
                            type="range" min="10" max="240" step="5"
                            value={alertThreshold}
                            onChange={(e) => handleThresholdChange(parseInt(e.target.value))}
                            className="w-full md:w-56 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
                        />
                    </div>
                </div>
            </div>

            {/* İSTATİSTİK SKOR KARTLARI */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div className="p-4 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 flex justify-between items-center">
                    <div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 font-bold uppercase">Aktif Çalışan</p>
                        <h3 className="text-2xl font-black mt-1 text-green-600 dark:text-green-400">{stats.running} Tezgâh</h3>
                    </div>
                    <div className="p-3 bg-green-50 dark:bg-green-950/40 rounded-xl"><Play className="w-6 h-6 text-green-600 dark:text-green-400" /></div>
                </div>
                <div className="p-4 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 flex justify-between items-center">
                    <div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 font-bold uppercase">Duraklatılan</p>
                        <h3 className="text-2xl font-black mt-1 text-red-600 dark:text-red-400">{stats.paused} Tezgâh</h3>
                    </div>
                    <div className="p-3 bg-red-50 dark:bg-red-950/40 rounded-xl"><Pause className="w-6 h-6 text-red-600 dark:text-red-400" /></div>
                </div>
                <div className="p-4 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 flex justify-between items-center">
                    <div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 font-bold uppercase">Bugün Boşta</p>
                        <h3 className="text-2xl font-black mt-1 text-gray-600 dark:text-gray-300">{stats.idle} Tezgâh</h3>
                    </div>
                    <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-xl"><Clock className="w-6 h-6 text-gray-500 dark:text-gray-400" /></div>
                </div>
                <div className="p-4 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 flex justify-between items-center">
                    <div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 font-bold uppercase">İşe Başlamayan</p>
                        <h3 className="text-2xl font-black mt-1 text-orange-600 dark:text-orange-400">{stats.unsignedOps} Operatör</h3>
                    </div>
                    <div className="p-3 bg-orange-50 dark:bg-orange-950/40 rounded-xl"><UserX className="w-6 h-6 text-orange-600 dark:text-orange-400" /></div>
                </div>
            </div>

            {/* ANA DÜZEN MATRİSİ */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* SOL TARAF: TEZGAH DURUM KARTLARI (2/3 GENİŞLİK) */}
                <div className="lg:col-span-2 space-y-4">
                    <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-md border border-gray-205 dark:border-gray-700">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b dark:border-gray-750 pb-3 mb-4">
                            <h3 className="text-lg font-black flex items-center">
                                <Radio className="w-5 h-5 text-blue-500 mr-2 shrink-0 animate-pulse" />
                                Tezgâh Durum Matrisi (Günlük Zamanlama)
                            </h3>
                            <button
                                onClick={() => setNonActiveOnly(!nonActiveOnly)}
                                className={`px-4 py-2 rounded-xl text-xs font-black border transition-all flex items-center gap-1.5 shadow-sm active:scale-95 ${
                                    nonActiveOnly 
                                    ? 'bg-orange-500 hover:bg-orange-600 text-white border-orange-500' 
                                    : 'bg-white hover:bg-gray-50 dark:bg-gray-900 dark:hover:bg-gray-800/80 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700'
                                }`}
                            >
                                <AlertOctagon className="w-4 h-4 shrink-0" />
                                {nonActiveOnly ? 'Tüm Tezgahları Göster' : 'Aktif İmalat Dışındakileri Filtrele (Ayar/Durma/Boşta)'}
                            </button>
                        </div>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {machinesStats.filter(m => !nonActiveOnly || m.status !== 'ÇALIŞIYOR').map(m => {
                                const isExceedsThreshold = (m.status === 'BOŞTA' || m.status === 'DURAKLATILDI') && m.durationMinutes >= alertThreshold;
                                return (
                                    <div 
                                        key={m.machineId}
                                        onClick={() => setSelectedMachine(m)}
                                        className={`p-4 rounded-xl border flex flex-col justify-between transition-all relative cursor-pointer hover:-translate-y-0.5 hover:shadow-md active:scale-[0.98] ${
                                            isExceedsThreshold 
                                            ? 'bg-red-50/50 dark:bg-red-900/10 border-red-500 dark:border-red-900 animate-pulse ring-2 ring-red-500/30' 
                                            : 'bg-white dark:bg-gray-900/40 border-gray-200 dark:border-gray-700/80'
                                        }`}
                                    >
                                        {/* Uyarı Alarm Rozeti */}
                                        {isExceedsThreshold && (
                                            <div className="absolute -top-2.5 right-3 bg-red-600 text-white text-[10px] font-black px-2.5 py-1 rounded-full shadow-lg flex items-center animate-bounce">
                                                <AlertOctagon className="w-3.5 h-3.5 mr-1" /> UYARI: {formatMinutes(m.durationMinutes)}
                                            </div>
                                        )}

                                        <div>
                                            <div className="flex justify-between items-start mb-2.5">
                                                <span className="text-base font-black text-gray-900 dark:text-white flex items-center">
                                                    <span className="w-2.5 h-2.5 rounded-full bg-blue-500 mr-2"></span>
                                                    {m.machineName}
                                                </span>
                                                <span className={`px-2 py-0.5 rounded text-[10px] font-black border ${m.statusColor}`}>
                                                    {m.status}
                                                </span>
                                            </div>

                                            {/* Aktif İş Detayı */}
                                            {m.status !== 'BOŞTA' ? (
                                                <div className="space-y-1 bg-gray-50 dark:bg-gray-800/60 p-2.5 rounded-lg border dark:border-gray-700/60 mb-3">
                                                    <div className="text-[10px] text-gray-500 dark:text-gray-400 font-bold uppercase">Aktif Parça:</div>
                                                    <div className="text-xs font-black text-gray-800 dark:text-gray-200 truncate">{m.activeMold} - {m.activePart}</div>
                                                    
                                                    {m.status === 'DURAKLATILDI' && m.lastPauseReason && (
                                                        <div className="text-[10px] text-red-500 font-extrabold mt-1">
                                                            Neden: {m.lastPauseReason}
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <div className="py-4 text-center border-2 border-dashed border-gray-200 dark:border-gray-700/70 rounded-lg text-xs text-gray-400 dark:text-gray-500 font-bold mb-3">
                                                    Aktif İş Yok (Boşta)
                                                </div>
                                            )}
                                        </div>

                                        {/* Alt Bilgi Barı */}
                                        <div className="flex justify-between items-center border-t dark:border-gray-800/80 pt-2.5 mt-1 text-[11px] font-bold text-gray-500 dark:text-gray-400">
                                            <span className="truncate">
                                                {m.status !== 'BOŞTA' ? `Operatör: ${m.operatorName}` : 'Son İşlem Bugün'}
                                            </span>
                                            <span className={`flex items-center ${isExceedsThreshold ? 'text-red-600 dark:text-red-400 font-black animate-pulse' : ''}`}>
                                                <Clock className="w-3.5 h-3.5 mr-1" />
                                                {formatMinutes(m.durationMinutes)}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* SAĞ TARAF: OPERATÖRLER & CANLI AKIŞ (1/3 GENİŞLİK) */}
                <div className="space-y-6">
                    {/* OPERATÖR DENETİM LİSTESİ */}
                    <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-md border border-gray-205 dark:border-gray-700">
                        <h3 className="text-base font-black flex items-center mb-3 border-b dark:border-gray-750 pb-3">
                            <Users className="w-5 h-5 text-blue-500 mr-2 shrink-0" />
                            Operatör Giriş Durumu
                        </h3>
                        <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1 custom-scrollbar">
                            {operatorsStatus.map(op => (
                                <div 
                                    key={op.id}
                                    className="p-3 bg-gray-50 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-755 rounded-xl flex items-center justify-between shadow-inner"
                                >
                                    <div>
                                        <div className="font-bold text-sm text-gray-900 dark:text-white">{op.name}</div>
                                        <div className="text-[10px] text-gray-500 dark:text-gray-400 font-semibold uppercase mt-0.5">{op.role}</div>
                                    </div>
                                    <div className="text-right">
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-black border ${op.statusColor}`}>
                                            {op.status}
                                        </span>
                                        {op.status === 'AKTİF VARDİYADA' && op.currentMachine && (
                                            <div className="text-[10px] font-black text-blue-600 dark:text-blue-400 mt-1 flex items-center justify-end">
                                                {op.currentMachine} <ArrowRight className="w-3 h-3 ml-0.5" />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* CANLI AKSİYON AKIŞI (BUGÜN) */}
                    <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-md border border-gray-205 dark:border-gray-700 flex flex-col">
                        <h3 className="text-base font-black flex items-center mb-3 border-b dark:border-gray-750 pb-3 shrink-0">
                            <RefreshCw className="w-4 h-4 text-blue-500 mr-2 shrink-0 animate-spin" style={{ animationDuration: '3s' }} />
                            Bugünün Canlı Aksiyon Akışı
                        </h3>
                        <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1 custom-scrollbar flex-1">
                            {todayEvents.length === 0 ? (
                                <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-8 font-bold">Bugün henüz hiçbir aksiyon alınmadı.</p>
                            ) : (
                                todayEvents.map(event => {
                                    const IconComponent = event.icon;
                                    return (
                                        <div key={event.id} className="relative flex items-start gap-3 text-xs leading-normal">
                                            <div className="flex flex-col items-center mt-1">
                                                <div className={`p-1.5 rounded-full bg-gray-100 dark:bg-gray-900 border-2 border-gray-300 dark:border-gray-700 shrink-0`}>
                                                    <IconComponent className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" />
                                                </div>
                                            </div>
                                            <div className="flex-1 bg-gray-50 dark:bg-gray-900/20 p-2.5 rounded-xl border border-gray-200 dark:border-gray-755/70">
                                                <div className="flex justify-between items-baseline mb-1">
                                                    <span className={`font-black text-[10px] uppercase ${event.color}`}>{event.type}</span>
                                                    <span className="text-[10px] text-gray-400 dark:text-gray-500 font-bold">{event.timeStr}</span>
                                                </div>
                                                <p className="text-gray-700 dark:text-gray-300 font-medium text-[11px] leading-tight">{event.description}</p>
                                                {event.machine && (
                                                    <div className="text-[10px] text-gray-400 dark:text-gray-500 font-bold mt-1 uppercase">Tezgâh: {event.machine}</div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* TEZGAH DETAY ANALİZ MODALI */}
            {selectedMachine && (() => {
                const machineTimeline = getMachineDetailedTimelineToday(selectedMachine.machineName, projects);
                return (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-sm">
                        <div className="bg-white dark:bg-gray-800 rounded-3xl max-w-2xl w-full shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col max-h-[90vh] sm:max-h-[85vh] animate-fadeIn">
                            
                            {/* Modal Başlığı */}
                            <div className="p-4 sm:p-6 border-b dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900/50 shrink-0">
                                <div className="pr-4">
                                    <h3 className="text-lg sm:text-xl font-extrabold text-gray-900 dark:text-white flex items-center">
                                        <span className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 rounded-full bg-blue-500 mr-2 shrink-0 animate-pulse"></span>
                                        {selectedMachine.machineName} - Günlük Takip
                                    </h3>
                                    <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 mt-0.5">Bugün bu tezgahta yapılan işlemler, süreleri ve duraklama nedenleri.</p>
                                </div>
                                <button 
                                    onClick={() => setSelectedMachine(null)}
                                    className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-xl transition-colors text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white font-black text-base sm:text-lg"
                                >
                                    ✕
                                </button>
                            </div>

                            {/* Modal İçeriği */}
                            <div className="p-4 sm:p-6 overflow-y-auto space-y-6 flex-1">
                                {/* Aktif İş Kartı */}
                                <div className="p-4 bg-gray-50 dark:bg-gray-900/60 rounded-2xl border border-gray-200 dark:border-gray-700/80">
                                    <h4 className="text-xs font-black uppercase text-gray-400 dark:text-gray-500 tracking-wider mb-3">Şu Anki Durum</h4>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <span className="text-[10px] text-gray-500 dark:text-gray-400 font-bold block uppercase">Durum</span>
                                            <span className="text-sm font-black text-gray-800 dark:text-gray-200 flex items-center mt-1">
                                                <span className={`w-2.5 h-2.5 rounded-full mr-2 ${
                                                    selectedMachine.status === 'ÇALIŞIYOR' ? 'bg-green-500' : (selectedMachine.status === 'DURAKLATILDI' ? 'bg-red-500' : 'bg-gray-400')
                                                }`}></span>
                                                {selectedMachine.status}
                                            </span>
                                        </div>
                                        <div>
                                            <span className="text-[10px] text-gray-500 dark:text-gray-400 font-bold block uppercase">Süre</span>
                                            <span className="text-sm font-black text-gray-800 dark:text-gray-200 mt-1">{formatMinutes(selectedMachine.durationMinutes)}</span>
                                        </div>
                                    </div>

                                    {selectedMachine.status !== 'BOŞTA' && (
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border-t dark:border-gray-800/80 pt-4 mt-4 text-xs font-bold">
                                            <div>
                                                <span className="text-[10px] text-gray-500 dark:text-gray-400 block uppercase mb-1">İşlenen Parça</span>
                                                <span className="text-gray-900 dark:text-white font-extrabold">{selectedMachine.activeMold} - {selectedMachine.activePart}</span>
                                            </div>
                                            <div>
                                                <span className="text-[10px] text-gray-500 dark:text-gray-400 block uppercase mb-1">CAM Operatörü</span>
                                                <span className="text-blue-600 dark:text-blue-400 font-extrabold">
                                                    {machineTimeline.find(t => t.moldName === selectedMachine.activeMold && t.taskName === selectedMachine.activePart)?.camOperator || 'Belirtilmedi'}
                                                </span>
                                            </div>
                                            <div>
                                                <span className="text-[10px] text-gray-500 dark:text-gray-400 block uppercase mb-1">Tezgah Operatörü</span>
                                                <span className="text-green-600 dark:text-green-400 font-extrabold">{selectedMachine.operatorName}</span>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Günlük Zaman Çizelgesi */}
                                <div>
                                    <h4 className="text-xs font-black uppercase text-gray-400 dark:text-gray-500 tracking-wider mb-4">Bugünkü Zaman Çizelgesi (Kronolojik)</h4>
                                    {machineTimeline.length === 0 ? (
                                        <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-10 font-bold border-2 border-dashed dark:border-gray-700/60 rounded-xl">
                                            Bugün bu tezgahta herhangi bir parça işlemi yapılmadı.
                                        </p>
                                    ) : (
                                        <div className="relative border-l-2 border-gray-200 dark:border-gray-700 ml-3 pl-6 space-y-5">
                                            {machineTimeline.map((item, idx) => {
                                                const startStr = item.start.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
                                                const endStr = item.end ? item.end.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : 'Devam Ediyor';
                                                
                                                return (
                                                    <div key={idx} className="relative group">
                                                        {/* Sol yuvarlak nokta */}
                                                        <span className="absolute -left-[31px] top-1.5 w-4 h-4 rounded-full bg-white dark:bg-gray-800 border-4 border-blue-500"></span>
                                                        
                                                        <div className={`p-4 rounded-xl border flex flex-col justify-between ${item.color}`}>
                                                            <div className="flex justify-between items-start gap-4">
                                                                <div>
                                                                    <div className="text-sm font-black">{item.label}</div>
                                                                    <div className="text-[11px] font-bold opacity-80 mt-1 uppercase">
                                                                        Parça: {item.moldName} - {item.taskName} ({item.opType})
                                                                    </div>
                                                                </div>
                                                                <span className="text-[11px] font-black shrink-0 px-2 py-0.5 rounded border border-current opacity-90">
                                                                    {formatMinutes(item.durationMinutes)}
                                                                </span>
                                                            </div>

                                                            {/* Operatör Bilgileri */}
                                                            <div className="grid grid-cols-2 gap-4 border-t border-current/10 pt-2.5 mt-3 text-[10px] font-bold uppercase opacity-80">
                                                                <div>
                                                                    <span className="block opacity-60">CAM Operatörü:</span>
                                                                    <span className="font-extrabold">{item.camOperator}</span>
                                                                </div>
                                                                <div>
                                                                    <span className="block opacity-60">Tezgah Operatörü:</span>
                                                                    <span className="font-extrabold">{item.machineOperator}</span>
                                                                </div>
                                                            </div>

                                                            <div className="text-[10px] font-black opacity-60 mt-2 flex justify-between">
                                                                <span>Başlangıç: {startStr}</span>
                                                                <span>Bitiş: {endStr}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Modal Kapatma Butonu */}
                            <div className="p-4 bg-gray-50 dark:bg-gray-900/30 border-t dark:border-gray-700 text-right shrink-0">
                                <button 
                                    onClick={() => setSelectedMachine(null)}
                                    className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md transition-all active:scale-95 text-xs uppercase"
                                >
                                    Tamam, Kapat
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}
        </div>
    );
};

export default WorkshopSupervisorPage;
