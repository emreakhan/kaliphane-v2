// src/pages/CamPlanningTab.js

import React, { useState, useMemo, useEffect } from 'react';
import { 
    Clock, Monitor, Layers, AlertCircle, CheckCircle2, Search, ChevronDown, 
    User, Filter, LayoutGrid, Check, X, Sparkles, Plus, Eye, Bell, BellRing,
    GripVertical, ArrowUp, ArrowDown, Play, CheckCircle, ChevronRight, Wrench
} from 'lucide-react';
import { doc, updateDoc } from '../config/firebase.js';
import { PROJECT_COLLECTION, OPERATION_STATUS, DEFAULT_MOLD_STATUSES, ROLES } from '../config/constants.js';

const cleanStr = (str) => String(str || '').replace(/[^a-zA-Z0-9çğıöşüÇĞİÖŞÜ]/g, '').toLowerCase();

// ========================================================
// ARAMALI VE İÇERİR MANTIKLI TEZGAH SEÇİMİ (SEARCHABLE SELECT)
// ========================================================
const SearchableMachineSelect = ({ machines, value, onChange, placeholder = "Tezgah Seç..." }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');

    const selectedMachine = useMemo(() => {
        return (machines || []).find(m => m.name === value || m.id === value);
    }, [machines, value]);

    const filtered = useMemo(() => {
        if (!search.trim()) return machines || [];
        const q = search.toLowerCase();
        return (machines || []).filter(m => 
            (m.name || '').toLowerCase().includes(q) ||
            (m.category || '').toLowerCase().includes(q)
        );
    }, [machines, search]);

    return (
        <div className="relative w-full">
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="w-full p-1.5 text-xs font-bold border rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white flex justify-between items-center outline-none focus:ring-2 focus:ring-blue-500 border-slate-300 dark:border-slate-600"
            >
                <span className={selectedMachine ? 'font-black text-gray-900 dark:text-white' : 'text-gray-400 font-normal'}>
                    {selectedMachine ? selectedMachine.name : placeholder}
                </span>
                <ChevronDown size={14} className="text-gray-400 shrink-0" />
            </button>

            {isOpen && (
                <div 
                    className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl p-1.5 space-y-1 max-h-52 overflow-hidden flex flex-col"
                    onMouseLeave={() => setIsOpen(false)}
                >
                    <div className="relative shrink-0">
                        <input
                            type="text"
                            autoFocus
                            placeholder="Tezgah ara (Örn: K22)..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="w-full p-1.5 pl-6 text-xs font-bold border rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white outline-none focus:ring-1 focus:ring-blue-500"
                        />
                        <Search size={11} className="absolute left-2 top-2.5 text-gray-400" />
                    </div>

                    <div className="overflow-y-auto max-h-36 space-y-0.5 custom-scrollbar">
                        {filtered.length > 0 ? (
                            filtered.map(m => (
                                <div
                                    key={m.id}
                                    onClick={() => {
                                        onChange(m.name);
                                        setIsOpen(false);
                                        setSearch('');
                                    }}
                                    className={`px-2 py-1.5 text-xs rounded-lg cursor-pointer flex justify-between items-center transition ${
                                        m.name === value 
                                            ? 'bg-blue-600 text-white font-black' 
                                            : 'hover:bg-blue-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold'
                                    }`}
                                >
                                    <span>{m.name}</span>
                                    {m.category && <span className="text-[9px] opacity-70">{m.category}</span>}
                                </div>
                            ))
                        ) : (
                            <div className="text-center py-2 text-[11px] text-gray-400 font-medium">Tezgah bulunamadı</div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

// ========================================================
// ANA CAM PLANLAMA BİLEŞENİ
// ========================================================
const CamPlanningTab = ({ projects, machines, personnel = [], db, onOpenMatrixView }) => {
    const [selectedMoldId, setSelectedMoldId] = useState('');
    const [statusFilter, setStatusFilter] = useState('ALL');
    
    const [searchMoldTerm, setSearchMoldTerm] = useState('');
    const [isMoldDropdownOpen, setIsMoldDropdownOpen] = useState(false);

    // Parça bazlı yerel taslak form state'leri
    const [taskDrafts, setTaskDrafts] = useState({});

    // Sürükle-bırak kuyruk sıralama modu
    const [isReorderMode, setIsReorderMode] = useState(false);
    const [draggedItem, setDraggedItem] = useState(null);

    // Bildirim İzni State
    const [notifPermission, setNotifPermission] = useState(() => {
        if (typeof window !== 'undefined' && 'Notification' in window) {
            return Notification.permission;
        }
        return 'unsupported';
    });

    const requestNotificationPermission = async () => {
        if (typeof window === 'undefined' || !('Notification' in window)) {
            alert("Tarayıcınız masaüstü bildirimlerini desteklemiyor.");
            return;
        }
        try {
            const perm = await Notification.requestPermission();
            setNotifPermission(perm);
            if (perm === 'granted') {
                playNotificationSound();
                new Notification("🔔 Bildirimler Aktif!", {
                    body: "CAM operatörü iş atama bildirimleri başarıyla etkinleştirildi.",
                    icon: '/favicon.ico'
                });
            }
        } catch (e) {
            console.error("Bildirim izni hatası:", e);
        }
    };

    const playNotificationSound = () => {
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (AudioContext) {
                const ctx = new AudioContext();
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(587.33, ctx.currentTime);
                osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1);
                gain.gain.setValueAtTime(0.2, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start();
                osc.stop(ctx.currentTime + 0.35);
            }
        } catch (e) {}
    };

    const sendCamNotification = (camOpName, moldName, partName, machineName) => {
        playNotificationSound();
        if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
            try {
                new Notification(`🔔 Yeni İş Atandı: ${camOpName}`, {
                    body: `${moldName} ➔ ${partName} (${machineName} Tezgahı)`,
                    icon: '/favicon.ico',
                    tag: 'cam-plan-' + Date.now()
                });
            } catch (e) {}
        }
    };

    // CAM Operatörleri Listesi
    const camOperators = useMemo(() => {
        if (!personnel || personnel.length === 0) return [];
        const filtered = personnel.filter(p => 
            p.role === ROLES.CAM_OPERATOR || 
            p.role === ROLES.CAM_SORUMLUSU || 
            p.role === 'CAM Operatörü' || 
            p.role === 'CAM Sorumlusu' ||
            (p.department && p.department.toLowerCase().includes('cam'))
        );
        return (filtered.length > 0 ? filtered : personnel).sort((a,b) => (a.name || '').localeCompare(b.name || ''));
    }, [personnel]);

    // Kalıp Durumları Listesi
    const availableStatuses = useMemo(() => {
        const set = new Set();
        (projects || []).forEach(p => {
            if (p.status && p.status !== 'TAMAMLANDI') {
                set.add(p.status.trim());
            }
        });
        DEFAULT_MOLD_STATUSES.forEach(s => {
            if (s.name && s.name !== 'TAMAMLANDI') set.add(s.name);
        });
        return Array.from(set);
    }, [projects]);

    const activeMolds = useMemo(() => {
        return (projects || []).filter(p => p.status !== 'TAMAMLANDI');
    }, [projects]);

    const filteredMolds = useMemo(() => {
        return activeMolds.filter(m => {
            const matchesStatus = statusFilter === 'ALL' || (m.status || '').trim().toLowerCase() === statusFilter.trim().toLowerCase();
            const matchesSearch = !searchMoldTerm || 
                (m.moldName || '').toLowerCase().includes(searchMoldTerm.toLowerCase()) || 
                (m.projectCode || '').toLowerCase().includes(searchMoldTerm.toLowerCase()) ||
                (m.customer || '').toLowerCase().includes(searchMoldTerm.toLowerCase());
            return matchesStatus && matchesSearch;
        });
    }, [activeMolds, statusFilter, searchMoldTerm]);

    const selectedMold = useMemo(() => {
        return activeMolds.find(m => m.id === selectedMoldId) || null;
    }, [activeMolds, selectedMoldId]);

    // Taslak Form State'lerini Senkronize Et
    useEffect(() => {
        if (selectedMold && selectedMold.tasks) {
            const initialDrafts = {};
            selectedMold.tasks.forEach(t => {
                initialDrafts[t.id] = {
                    machine: t.plannedMachine || '',
                    camOp: t.assignedOperator || t.camOperator || t.camPreparation?.operator || '',
                    estTime: t.estimatedCamTime ? String(t.estimatedCamTime) : ''
                };
            });
            setTaskDrafts(initialDrafts);
        }
    }, [selectedMold]);

    useEffect(() => {
        if (selectedMoldId) {
            const mold = activeMolds.find(m => m.id === selectedMoldId);
            if (mold) setSearchMoldTerm(`${mold.moldName} - ${mold.projectCode || ''}`);
        } else {
            setSearchMoldTerm('');
        }
    }, [selectedMoldId, activeMolds]);

    // Kalıbın Toplam CAM Yükü
    const moldTotalEstimatedTime = useMemo(() => {
        if (!selectedMold || !selectedMold.tasks) return 0;
        return selectedMold.tasks.reduce((total, task) => total + (parseFloat(task.estimatedCamTime) || 0), 0);
    }, [selectedMold]);

    // Parçanın Anlık Üretim Durumunu Hesapla
    const getTaskProgressInfo = (task) => {
        const ops = task.operations || [];
        if (ops.length === 0) {
            if (task.plannedMachine) return { 
                type: 'PLANNED', 
                label: 'Planlandı (Sırada)', 
                badgeClass: 'bg-emerald-100 text-emerald-900 border border-emerald-300 dark:bg-emerald-900/50 dark:text-emerald-100 dark:border-emerald-600 font-bold' 
            };
            return { 
                type: 'WAITING', 
                label: 'Bekliyor', 
                badgeClass: 'bg-slate-100 text-slate-800 border border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-600 font-bold' 
            };
        }

        const allCompleted = ops.every(op => op.status === 'COMPLETED' || op.status === OPERATION_STATUS.COMPLETED);
        if (allCompleted || task.status === 'COMPLETED') {
            return { 
                type: 'COMPLETED', 
                label: 'Tamamlandı (%100)', 
                badgeClass: 'bg-emerald-100 text-emerald-900 border border-emerald-300 dark:bg-emerald-900/50 dark:text-emerald-100 dark:border-emerald-600 font-bold' 
            };
        }

        const workingOp = ops.find(op => op.status === OPERATION_STATUS.IN_PROGRESS || op.status === 'ÇALIŞIYOR');
        if (workingOp) {
            return { 
                type: 'WORKING', 
                label: `Çalışıyor (${workingOp.machineName || 'Tezgah'}) • %${workingOp.progressPercentage || 0}`, 
                badgeClass: 'bg-blue-100 text-blue-900 border border-blue-400 dark:bg-blue-900/80 dark:text-blue-100 dark:border-blue-400 font-black shadow-xs',
                workingOp 
            };
        }

        const pausedOp = ops.find(op => op.status === OPERATION_STATUS.PAUSED);
        if (pausedOp) {
            return { 
                type: 'PAUSED', 
                label: 'Duraklatıldı', 
                badgeClass: 'bg-amber-100 text-amber-900 border border-amber-300 dark:bg-amber-900/50 dark:text-amber-100 dark:border-amber-600 font-bold', 
                workingOp: pausedOp 
            };
        }

        if (task.plannedMachine) {
            return { 
                type: 'PLANNED', 
                label: `Planlandı (${task.plannedMachine})`, 
                badgeClass: 'bg-emerald-100 text-emerald-900 border border-emerald-300 dark:bg-emerald-900/50 dark:text-emerald-100 dark:border-emerald-600 font-bold' 
            };
        }

        return { 
            type: 'WAITING', 
            label: 'Bekliyor', 
            badgeClass: 'bg-slate-100 text-slate-800 border border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-600 font-bold' 
        };
    };

    // Tezgahların İş Yükü ve Kuyruk Listesi
    const machineBacklogs = useMemo(() => {
        const backlogs = (machines || []).map(m => ({ 
            ...m, 
            totalHours: 0, 
            assignedTasks: [],
            activeTask: null
        }));

        (projects || []).forEach(project => {
            if (project.status === 'TAMAMLANDI') return;
            
            project.tasks?.forEach(task => {
                let taskActiveMachineId = null;
                const estTime = parseFloat(task.estimatedCamTime) || 0;
                const camOpName = task.assignedOperator || task.camOperator || task.camPreparation?.operator || 'Belirtilmedi';

                // 1. Aktif Çalışan İş
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
                                    m.activeTask = {
                                        moldId: project.id,
                                        moldName: project.moldName,
                                        taskId: task.id,
                                        taskName: task.taskName,
                                        opName: op.name || op.type || 'Operasyon',
                                        camOperatorName: op.assignedOperator || camOpName,
                                        estTime: estTime,
                                        progressPercentage: parseFloat(op.progressPercentage) || 0
                                    };
                                    m.totalHours += estTime;
                                }
                            });
                        }
                    });
                }

                // 2. Planlanmış Kuyruk
                const isTaskCompleted = task.operations?.every(op => op.status === 'COMPLETED') || false;
                if (task.plannedMachine && !isTaskCompleted) {
                    const targetMachine = backlogs.find(m => m.name === task.plannedMachine);
                    if (targetMachine && targetMachine.id !== taskActiveMachineId) {
                        targetMachine.totalHours += estTime;
                        targetMachine.assignedTasks.push({
                            moldId: project.id,
                            moldName: project.moldName,
                            taskId: task.id,
                            taskName: task.taskName,
                            camOperatorName: camOpName,
                            time: estTime,
                            priority: task.priority !== undefined ? task.priority : (project.priority || 999)
                        });
                    }
                }
            });
        });

        backlogs.forEach(m => {
            m.assignedTasks.sort((a, b) => a.priority - b.priority);
        });

        return backlogs;
    }, [projects, machines]);

    // Planlama İşlemi
    const handleAssignToMachine = async (taskId) => {
        if (!selectedMold) return;
        const draft = taskDrafts[taskId] || {};
        const machineName = draft.machine;
        const camOperatorName = draft.camOp;
        const estimatedHours = draft.estTime ? parseFloat(draft.estTime) : 0;

        if (!machineName) {
            alert("Lütfen işlenecek tezgahı seçin.");
            return;
        }

        try {
            const targetTask = selectedMold.tasks.find(t => t.id === taskId);
            const updatedTasks = selectedMold.tasks.map(t => {
                if (t.id === taskId) {
                    const updated = { 
                        ...t, 
                        plannedMachine: machineName,
                        assignedOperator: camOperatorName || t.assignedOperator || '',
                        camOperator: camOperatorName || t.camOperator || '',
                        estimatedCamTime: isNaN(estimatedHours) ? (parseFloat(t.estimatedCamTime) || 0) : estimatedHours
                    };

                    if (updated.operations && Array.isArray(updated.operations)) {
                        updated.operations = updated.operations.map((op, idx) => {
                            if (idx === 0 && (op.status === OPERATION_STATUS.NOT_STARTED || !op.status)) {
                                return {
                                    ...op,
                                    assignedOperator: camOperatorName || op.assignedOperator,
                                    machineName: machineName || op.machineName
                                };
                            }
                            return op;
                        });
                    }
                    return updated;
                }
                return t;
            });

            await updateDoc(doc(db, PROJECT_COLLECTION, selectedMold.id), { 
                tasks: updatedTasks,
                updatedAt: new Date().toISOString()
            });

            // Bildirim Gönder
            if (camOperatorName) {
                sendCamNotification(camOperatorName, selectedMold.moldName, targetTask?.taskName || 'Parça', machineName);
            }
        } catch (error) {
            console.error("Planlama hatası:", error);
            alert("Tezgah ve CAM operatörü ataması yapılırken hata oluştu.");
        }
    };

    // Plandan Kaldır
    const handleRemoveFromMachine = async (moldId, taskId) => {
        try {
            const mold = (projects || []).find(p => p.id === moldId);
            if (!mold) return;
            const updatedTasks = (mold.tasks || []).map(t => {
                if (t.id === taskId) {
                    const newTask = { ...t };
                    delete newTask.plannedMachine; 
                    return newTask;
                }
                return t;
            });
            await updateDoc(doc(db, PROJECT_COLLECTION, moldId), { 
                tasks: updatedTasks,
                updatedAt: new Date().toISOString()
            });
        } catch (error) {
            console.error("Planlama kaldırma hatası:", error);
        }
    };

    // Kuyruk Sıralamasını Değiştir (Sürükle-Bırak veya Yukarı/Aşağı)
    const handleMoveQueueItem = async (moldId, taskId, newPriority) => {
        try {
            const mold = (projects || []).find(p => p.id === moldId);
            if (!mold) return;
            const updatedTasks = (mold.tasks || []).map(t => {
                if (t.id === taskId) {
                    return { ...t, priority: newPriority };
                }
                return t;
            });
            await updateDoc(doc(db, PROJECT_COLLECTION, moldId), {
                tasks: updatedTasks,
                updatedAt: new Date().toISOString()
            });
        } catch (e) {
            console.error("Kuyruk sıralama güncelleme hatası:", e);
        }
    };

    const handleDraftChange = (taskId, field, value) => {
        setTaskDrafts(prev => ({
            ...prev,
            [taskId]: {
                ...(prev[taskId] || {}),
                [field]: value
            }
        }));
    };

    return (
        <div className="flex flex-col xl:flex-row gap-4 animate-in fade-in h-[calc(100vh-140px)] items-start">
            
            {/* SOL PANEL: KALIP SEÇİMİ VE BEKLEYEN PARÇALAR */}
            <div className="w-full xl:w-[38%] flex flex-col gap-3 h-full">
                
                {/* 1. KALIP SEÇİMİ VE DURUM FİLTRELERİ */}
                <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-xs border border-gray-200 dark:border-gray-700 shrink-0 space-y-3">
                    <div className="flex justify-between items-center border-b dark:border-gray-700 pb-2">
                        <h2 className="text-xs font-black text-gray-800 dark:text-white flex items-center uppercase tracking-wider">
                            <Layers className="w-4 h-4 mr-1.5 text-blue-500"/> Kalıp Seçimi & Filtreleme
                        </h2>
                        
                        <div className="flex items-center gap-2">
                            {/* Bildirim İzin Butonu */}
                            {notifPermission !== 'granted' && (
                                <button
                                    type="button"
                                    onClick={requestNotificationPermission}
                                    className="text-[10px] font-bold px-2 py-1 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 transition flex items-center gap-1 border border-amber-500/30"
                                    title="İş atandığında sesli & masaüstü bildirim al"
                                >
                                    <BellRing size={12} /> Bildirim İzni Ver
                                </button>
                            )}

                            {onOpenMatrixView && (
                                <button
                                    onClick={onOpenMatrixView}
                                    className="text-[11px] font-black text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                                >
                                    <LayoutGrid size={13} /> Tezgah Matrisi Panosu
                                </button>
                            )}
                        </div>
                    </div>
                    
                    {/* HIZLI KALIP DURUMU FİLTRE HAPLARI */}
                    <div className="flex flex-wrap gap-1.5">
                        <button
                            type="button"
                            onClick={() => setStatusFilter('ALL')}
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase transition ${
                                statusFilter === 'ALL'
                                    ? 'bg-blue-600 text-white shadow-xs'
                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200'
                            }`}
                        >
                            Tümü ({activeMolds.length})
                        </button>
                        {availableStatuses.slice(0, 8).map(st => {
                            const count = activeMolds.filter(m => (m.status || '').trim().toLowerCase() === st.trim().toLowerCase()).length;
                            if (count === 0 && st !== 'CNC' && st !== 'İMALAT BEKLEYEN KALIPLAR') return null;
                            return (
                                <button
                                    key={st}
                                    type="button"
                                    onClick={() => setStatusFilter(st)}
                                    className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase transition flex items-center gap-1 ${
                                        statusFilter === st
                                            ? 'bg-blue-600 text-white shadow-xs'
                                            : 'bg-gray-100 dark:bg-gray-700/80 text-gray-600 dark:text-gray-300 hover:bg-gray-200'
                                    }`}
                                >
                                    <span>{st}</span>
                                    <span className="text-[9px] opacity-75 font-mono">({count})</span>
                                </button>
                            );
                        })}
                    </div>

                    {/* YAZARAK ARAMA YAPILABİLEN KALIP SEÇİMİ */}
                    <div className="relative">
                        <div className="relative">
                            <input 
                                type="text"
                                className="w-full p-2.5 pl-3 pr-8 border rounded-xl bg-gray-50 dark:bg-gray-900 font-bold text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 text-xs transition-all"
                                placeholder="Kalıp Adı, Kodu veya Müşteri Ara..."
                                value={searchMoldTerm}
                                onChange={e => {
                                    setSearchMoldTerm(e.target.value);
                                    setIsMoldDropdownOpen(true);
                                    if(selectedMoldId) setSelectedMoldId('');
                                }}
                                onFocus={() => setIsMoldDropdownOpen(true)}
                                onBlur={() => setTimeout(() => setIsMoldDropdownOpen(false), 220)}
                            />
                            <Search className="absolute right-3 top-3 w-4 h-4 text-gray-400 pointer-events-none" />
                        </div>

                        {isMoldDropdownOpen && (
                            <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl max-h-56 overflow-y-auto custom-scrollbar">
                                {filteredMolds.length > 0 ? (
                                    filteredMolds.map(m => (
                                        <div 
                                            key={m.id}
                                            onClick={() => {
                                                setSelectedMoldId(m.id);
                                                setIsMoldDropdownOpen(false);
                                            }}
                                            className="p-2.5 hover:bg-blue-50 dark:hover:bg-gray-700 cursor-pointer border-b last:border-b-0 border-gray-100 dark:border-gray-700 transition flex justify-between items-center"
                                        >
                                            <div>
                                                <div className="font-bold text-xs text-gray-800 dark:text-gray-200">{m.moldName}</div>
                                                <div className="text-[10px] text-gray-400 font-bold uppercase">{m.projectCode || 'KODSUZ'} • {m.customer || 'Müşteri Yok'}</div>
                                            </div>
                                            <span className="text-[9px] font-black px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 uppercase">
                                                {m.status || 'BELİRTİLMEDİ'}
                                            </span>
                                        </div>
                                    ))
                                ) : (
                                    <div className="p-4 text-gray-500 italic text-center text-xs font-medium">Bu filtrede kalıp bulunamadı...</div>
                                )}
                            </div>
                        )}
                    </div>

                    {selectedMold && (
                        <div className="p-2.5 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-800 flex justify-between items-center">
                            <div>
                                <div className="text-[10px] font-bold text-blue-700 dark:text-blue-400 uppercase">Kalıp CAM Yükü</div>
                                <div className="text-[11px] font-bold text-slate-700 dark:text-slate-300 truncate max-w-[200px]">{selectedMold.moldName}</div>
                            </div>
                            <div className="text-lg font-black text-blue-800 dark:text-blue-300 flex items-center">
                                {moldTotalEstimatedTime.toFixed(1)} <span className="text-[10px] font-bold ml-1 opacity-60">Saat</span>
                            </div>
                        </div>
                    )}
                </div>

                {/* 2. İŞ PARÇALARI VE PLANLAMA LİSTESİ */}
                {selectedMold ? (
                    <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-xs border border-gray-200 dark:border-gray-700 flex-1 overflow-hidden flex flex-col">
                        <div className="flex justify-between items-center mb-2.5 border-b dark:border-gray-700 pb-2 shrink-0">
                            <h3 className="font-black text-gray-800 dark:text-white uppercase text-xs tracking-wider">
                                İş Parçaları ve Planlama ({selectedMold.tasks?.length || 0})
                            </h3>
                            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
                                Tamamlandı / Çalışıyor / Bekliyor
                            </span>
                        </div>
                        
                        <div className="space-y-2.5 flex-1 overflow-y-auto custom-scrollbar pr-1">
                            {selectedMold.tasks?.map(task => {
                                const progress = getTaskProgressInfo(task);
                                const isAssigned = !!task.plannedMachine;
                                const isCompleted = progress.type === 'COMPLETED';
                                const isWorking = progress.type === 'WORKING';
                                const estTime = parseFloat(task.estimatedCamTime) || 0;
                                const draft = taskDrafts[task.id] || { machine: '', camOp: '', estTime: '' };
                                const assignedCamOp = task.assignedOperator || task.camOperator || task.camPreparation?.operator;

                                return (
                                    <div 
                                        key={task.id} 
                                        className={`p-3 rounded-xl border transition ${
                                            isCompleted
                                                ? 'bg-green-50/50 border-green-200 dark:bg-green-950/20 dark:border-green-800/60 opacity-80'
                                                : isWorking
                                                ? 'bg-blue-50/70 border-blue-300 dark:bg-blue-950/30 dark:border-blue-800 shadow-2xs'
                                                : isAssigned 
                                                ? 'bg-emerald-50/70 border-emerald-300 dark:bg-emerald-950/20 dark:border-emerald-800' 
                                                : 'bg-slate-50 border-slate-200 dark:bg-slate-900/80 dark:border-slate-700'
                                        }`}
                                    >
                                        {/* Parça Başlığı ve Durum Rozeti */}
                                        <div className="flex justify-between items-start mb-1.5">
                                            <div>
                                                <div className="font-black text-xs text-gray-900 dark:text-white flex items-center gap-1.5">
                                                    <span>{task.taskName}</span>
                                                    {task.isCritical && (
                                                        <span className="text-[9px] font-black px-1.5 py-0.2 rounded bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 border border-red-300">
                                                            KRİTİK
                                                        </span>
                                                    )}
                                                </div>

                                                <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                                    {/* Durum Rozeti */}
                                                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-md ${progress.badgeClass}`}>
                                                        {progress.label}
                                                    </span>

                                                    {estTime > 0 ? (
                                                        <span className="text-[10px] font-black text-indigo-900 dark:text-indigo-200 flex items-center bg-indigo-100 dark:bg-indigo-950/70 border border-indigo-200 dark:border-indigo-800 px-2 py-0.5 rounded-md">
                                                            <Clock className="w-3 h-3 mr-1"/> {estTime}s
                                                        </span>
                                                    ) : (
                                                        <span className="text-[10px] font-black text-amber-900 dark:text-amber-200 flex items-center bg-amber-100 dark:bg-amber-950/70 border border-amber-300 dark:border-amber-800 px-2 py-0.5 rounded-md">
                                                            <AlertCircle className="w-3 h-3 mr-1"/> Süre Belirtilmemiş
                                                        </span>
                                                    )}

                                                    {assignedCamOp && !isCompleted && (
                                                        <span className="text-[10px] font-black text-purple-900 dark:text-purple-200 flex items-center bg-purple-100 dark:bg-purple-950/70 border border-purple-200 dark:border-purple-800 px-2 py-0.5 rounded-md">
                                                            <User className="w-3 h-3 mr-1"/> CAM: {assignedCamOp}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            {isCompleted && (
                                                <CheckCircle className="w-4 h-4 text-green-600 shrink-0" />
                                            )}
                                        </div>

                                        {/* ALT OPERASYONLAR LİSTESİ */}
                                        {task.operations && task.operations.length > 0 && (
                                            <div className="mt-2 pt-1.5 border-t border-slate-200/80 dark:border-slate-700/80 space-y-1">
                                                <div className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                                    Operasyonlar ({task.operations.length}):
                                                </div>
                                                <div className="flex flex-wrap gap-1">
                                                    {task.operations.map((op, idx) => {
                                                        const isOpDone = op.status === 'COMPLETED' || op.status === OPERATION_STATUS.COMPLETED;
                                                        const isOpWorking = op.status === OPERATION_STATUS.IN_PROGRESS || op.status === 'ÇALIŞIYOR';
                                                        return (
                                                            <span 
                                                                key={op.id || idx}
                                                                className={`text-[9px] font-black px-2 py-0.5 rounded-md border ${
                                                                    isOpDone 
                                                                        ? 'bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-900/50 dark:text-emerald-200 dark:border-emerald-700' 
                                                                        : isOpWorking 
                                                                        ? 'bg-blue-100 text-blue-900 border-blue-400 dark:bg-blue-900/70 dark:text-blue-100 dark:border-blue-400 animate-pulse shadow-xs' 
                                                                        : 'bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700'
                                                                }`}
                                                            >
                                                                {op.name || op.type || `Op ${idx + 1}`} {isOpDone ? '✓' : isOpWorking ? '⚙️' : ''}
                                                            </span>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}

                                        {/* PLANLAMA GİRİŞ FORMU (TAMAMLANMAMIŞ İSE) */}
                                        {!isCompleted && !isAssigned && (
                                            <div className="space-y-2 mt-2 pt-2 border-t border-slate-200 dark:border-slate-700">
                                                <div className="grid grid-cols-2 gap-2">
                                                    {/* Aramalı Akıllı Tezgah Seçimi */}
                                                    <div>
                                                        <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 mb-0.5">
                                                            🎯 Tezgah (Aramalı):
                                                        </label>
                                                        <SearchableMachineSelect
                                                            machines={machines}
                                                            value={draft.machine || ''}
                                                            onChange={val => handleDraftChange(task.id, 'machine', val)}
                                                            placeholder="Tezgah Ara & Seç..."
                                                        />
                                                    </div>

                                                    {/* CAM Operatörü Seçimi */}
                                                    <div>
                                                        <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 mb-0.5">
                                                            👤 CAM Operatörü:
                                                        </label>
                                                        <select 
                                                            value={draft.camOp || ''}
                                                            onChange={e => handleDraftChange(task.id, 'camOp', e.target.value)}
                                                            className="w-full p-1.5 text-xs font-bold border rounded-lg bg-white dark:bg-gray-800 dark:text-white outline-none focus:ring-2 focus:ring-purple-500 border-slate-300 dark:border-slate-600"
                                                        >
                                                            <option value="">CAM Op. Seç...</option>
                                                            {camOperators.map(op => (
                                                                <option key={op.id || op.name} value={op.name}>{op.name}</option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                </div>

                                                <div className="flex gap-2 items-center">
                                                    {/* Tahmini Süre Girişi */}
                                                    <div className="flex-1 flex items-center gap-1.5">
                                                        <span className="text-[10px] font-bold text-slate-500 shrink-0">⏱️ Öngörülen:</span>
                                                        <input 
                                                            type="number"
                                                            step="0.5"
                                                            min="0"
                                                            placeholder="Saat"
                                                            value={draft.estTime !== undefined ? draft.estTime : (task.estimatedCamTime || '')}
                                                            onChange={e => handleDraftChange(task.id, 'estTime', e.target.value)}
                                                            className="w-full p-1 text-xs font-bold border rounded-lg bg-white dark:bg-gray-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 border-slate-300 dark:border-slate-600"
                                                        />
                                                    </div>

                                                    {/* Planla Butonu */}
                                                    <button 
                                                        onClick={() => handleAssignToMachine(task.id)}
                                                        disabled={!draft.machine}
                                                        className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black rounded-lg shadow-sm disabled:opacity-40 transition flex items-center gap-1 shrink-0"
                                                    >
                                                        <Check size={13} strokeWidth={3} /> PLANLA
                                                    </button>
                                                </div>
                                            </div>
                                        )}

                                        {/* Zaten Planlanmış Parça Kutusu */}
                                        {!isCompleted && isAssigned && (
                                            <div className="flex justify-between items-center bg-white dark:bg-gray-800 p-2 rounded-lg border border-emerald-200 dark:border-emerald-800 shadow-2xs mt-2">
                                                <div className="flex flex-col">
                                                    <div className="text-[11px] font-extrabold text-gray-800 dark:text-gray-200 flex items-center">
                                                        <Monitor className="w-3.5 h-3.5 mr-1 text-emerald-600"/> {task.plannedMachine}
                                                    </div>
                                                    {assignedCamOp && (
                                                        <div className="text-[10px] font-bold text-purple-600 dark:text-purple-400">
                                                            👤 Atanan CAM: {assignedCamOp}
                                                        </div>
                                                    )}
                                                </div>
                                                <button 
                                                    onClick={() => handleRemoveFromMachine(selectedMold.id, task.id)}
                                                    className="text-[10px] font-black text-red-600 hover:text-red-800 bg-red-50 hover:bg-red-100 dark:bg-red-900/30 px-2.5 py-1 rounded-md transition"
                                                >
                                                    PLANDAN KALDIR
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                            {(!selectedMold.tasks || selectedMold.tasks.length === 0) && (
                                <div className="text-center text-gray-400 py-10 text-xs font-medium">Bu kalıba ait parça bulunmuyor.</div>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-xs border border-gray-200 dark:border-gray-700 flex-1 flex flex-col items-center justify-center text-center">
                        <Layers className="w-12 h-12 text-slate-300 dark:text-slate-600 mb-2" />
                        <div className="font-black text-sm text-slate-700 dark:text-slate-200">Kalıp Seçilmedi</div>
                        <p className="text-xs text-slate-400 mt-1 max-w-xs">
                            Yukarıdaki arama çubuğundan veya durum filtrelerinden bir kalıp seçerek parçalarını tezgahlara ve CAM operatörlerine planlayabilirsiniz.
                        </p>
                    </div>
                )}
            </div>

            {/* SAĞ PANEL: TEZGAH İŞ YÜKÜ VE SÜRÜKLE-BIRAK KUYRUK SIRALAMASI */}
            <div className="w-full xl:w-[62%] self-start bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-xs border border-gray-200 dark:border-gray-700 flex flex-col h-full">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-3 border-b dark:border-gray-700 pb-2.5 shrink-0">
                    <div>
                        <h2 className="text-xs font-black text-gray-800 dark:text-white flex items-center uppercase tracking-wider">
                            <Monitor className="w-4 h-4 mr-1.5 text-indigo-500"/> Tezgah İş Yükü ve Kuyruk Sıralaması ({machineBacklogs.length} Tezgah)
                        </h2>
                        <p className="text-[11px] text-slate-400">
                            Aktif çalışan parçalar ve ardından işlenecek sıralı kuyruk (Sürükle-bırak veya oklarla sıra düzenleme).
                        </p>
                    </div>

                    <div className="flex items-center gap-2">
                        {/* Yeniden Düzenleme Modu Butonu */}
                        <button
                            type="button"
                            onClick={() => setIsReorderMode(!isReorderMode)}
                            className={`px-3 py-1.5 text-xs font-black rounded-xl border transition flex items-center gap-1.5 ${
                                isReorderMode 
                                    ? 'bg-amber-500 text-white border-amber-600 shadow-xs' 
                                    : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 border-slate-300 dark:border-slate-600'
                            }`}
                        >
                            <GripVertical size={13} /> {isReorderMode ? 'Sıralama Modu Açık' : 'Kuyrukları Düzenle'}
                        </button>

                        {onOpenMatrixView && (
                            <button 
                                onClick={onOpenMatrixView}
                                className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 font-bold text-xs rounded-xl border border-indigo-200 dark:border-indigo-800 transition flex items-center gap-1.5"
                            >
                                <LayoutGrid size={13} /> Matris Panosu
                            </button>
                        )}
                    </div>
                </div>
                
                <div className="flex-1 overflow-y-auto custom-scrollbar pr-1.5 space-y-2.5">
                    {machineBacklogs.map(machine => {
                        const daysLoaded = (machine.totalHours / 24).toFixed(1);
                        const remainingHours = machine.activeTask ? Math.max(0, machine.activeTask.estTime * (1 - (machine.activeTask.progressPercentage || 0) / 100)) : 0;
                        const activeProgress = machine.activeTask?.progressPercentage ?? 0;

                        return (
                            <div 
                                key={machine.id} 
                                className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 flex flex-col lg:flex-row overflow-hidden hover:border-indigo-300 transition-colors shadow-2xs"
                                onDragOver={(e) => e.preventDefault()}
                                onDrop={async (e) => {
                                    e.preventDefault();
                                    if (draggedItem && draggedItem.machineName !== machine.name) {
                                        // Farklı bir tezgaha taşıma
                                        try {
                                            const mold = (projects || []).find(p => p.id === draggedItem.moldId);
                                            if (mold) {
                                                const updatedTasks = (mold.tasks || []).map(t => {
                                                    if (t.id === draggedItem.taskId) {
                                                        return { ...t, plannedMachine: machine.name };
                                                    }
                                                    return t;
                                                });
                                                await updateDoc(doc(db, PROJECT_COLLECTION, mold.id), { tasks: updatedTasks });
                                            }
                                        } catch (err) {
                                            console.error("Tezgah taşıma hatası:", err);
                                        }
                                        setDraggedItem(null);
                                    }
                                }}
                            >
                                
                                {/* Sol Kısım: Tezgah Bilgisi */}
                                <div className="lg:w-48 p-2.5 bg-slate-50 dark:bg-slate-900/60 border-b lg:border-b-0 lg:border-r border-gray-200 dark:border-gray-700 flex flex-col justify-center shrink-0">
                                    <div className="font-black text-xs text-gray-900 dark:text-white mb-1.5 flex items-center uppercase tracking-tight">
                                        <Monitor className="w-3.5 h-3.5 mr-1 text-indigo-600" /> {machine.name}
                                    </div>
                                    <div className="flex gap-1.5">
                                        <div className="flex-1 bg-white dark:bg-gray-800 px-1.5 py-1 rounded-lg border border-gray-200 dark:border-gray-600">
                                            <div className="text-[8px] font-black text-gray-500 uppercase">Yük</div>
                                            <div className="text-xs font-black text-indigo-700 dark:text-indigo-400">{machine.totalHours.toFixed(1)}s</div>
                                        </div>
                                        <div className="flex-1 bg-white dark:bg-gray-800 px-1.5 py-1 rounded-lg border border-gray-200 dark:border-gray-600">
                                            <div className="text-[8px] font-black text-gray-500 uppercase">Doluluk</div>
                                            <div className="text-xs font-black text-orange-600 dark:text-orange-400">{daysLoaded}g</div>
                                        </div>
                                    </div>
                                </div>

                                {/* Sağ Kısım: İş Parçaları (Yatay Kaydırma & Sürükle-Bırak) */}
                                <div className="p-2 flex-1 flex gap-2 overflow-x-auto custom-scrollbar items-stretch bg-slate-50/50 dark:bg-gray-800/30">
                                    
                                    {/* 1. AKTİF ÇALIŞAN İŞ */}
                                    {machine.activeTask && (
                                        <div className="min-w-[175px] max-w-[175px] bg-emerald-50 dark:bg-emerald-950/30 border-2 border-emerald-500 rounded-lg p-2 shadow-xs relative flex flex-col flex-shrink-0 justify-between">
                                            <div className="flex justify-between items-center mb-1">
                                                <span className="bg-emerald-600 text-white text-[8px] font-black px-1.5 py-0.5 rounded flex items-center shadow-xs">
                                                    <span className="w-1.5 h-1.5 bg-white rounded-full mr-1 animate-ping"></span>
                                                    AKTİF İŞ
                                                </span>
                                                <span className="text-[9px] font-black text-emerald-800 dark:text-emerald-300">%{activeProgress}</span>
                                            </div>
                                            <div className="flex-1 flex flex-col">
                                                <div className="text-[9px] font-bold text-emerald-700 dark:text-emerald-400 uppercase truncate" title={machine.activeTask.moldName}>{machine.activeTask.moldName}</div>
                                                <div className="text-xs font-black text-emerald-950 dark:text-emerald-100 leading-tight line-clamp-2" title={machine.activeTask.taskName}>{machine.activeTask.taskName}</div>
                                                
                                                <div className="mt-1.5 pt-1 border-t border-emerald-200 dark:border-emerald-800/50 flex flex-col gap-0.5">
                                                    <div className="text-[9px] font-bold text-purple-700 dark:text-purple-300 truncate">
                                                        👤 CAM: {machine.activeTask.camOperatorName || 'Bilinmiyor'}
                                                    </div>
                                                    <div className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400">
                                                        Kalan: {remainingHours.toFixed(1)}s
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Ayrım Çizgisi */}
                                    {machine.activeTask && machine.assignedTasks.length > 0 && (
                                        <div className="w-px bg-gray-300 dark:bg-gray-600 mx-0.5 flex-shrink-0"></div>
                                    )}

                                    {/* 2. KUYRUKTAKİ GELECEK İŞLER (SÜRÜKLE-BIRAK DESTEKLİ) */}
                                    {machine.assignedTasks.length > 0 ? (
                                        machine.assignedTasks.map((t, idx) => (
                                            <div 
                                                key={`${t.moldId}-${t.taskId}`}
                                                draggable
                                                onDragStart={() => setDraggedItem({ moldId: t.moldId, taskId: t.taskId, machineName: machine.name, index: idx })}
                                                onDragOver={(e) => e.preventDefault()}
                                                onDrop={async (e) => {
                                                    e.stopPropagation();
                                                    e.preventDefault();
                                                    if (draggedItem && draggedItem.taskId !== t.taskId) {
                                                        const targetPriority = t.priority - 1;
                                                        await handleMoveQueueItem(draggedItem.moldId, draggedItem.taskId, targetPriority);
                                                        setDraggedItem(null);
                                                    }
                                                }}
                                                className={`min-w-[170px] max-w-[170px] bg-white dark:bg-gray-700 p-2 rounded-lg border shadow-xs relative group flex-shrink-0 flex flex-col justify-between transition-all cursor-move ${
                                                    isReorderMode 
                                                        ? 'border-amber-400 dark:border-amber-500 ring-2 ring-amber-400/30' 
                                                        : 'border-gray-200 dark:border-gray-600 hover:border-blue-300'
                                                }`}
                                            >
                                                <div className="absolute top-0 left-0 w-1 h-full bg-blue-500 rounded-l-lg"></div>
                                                <div className="pl-1 flex-1">
                                                    <div className="flex justify-between items-center mb-1">
                                                        <span className="text-[8px] font-black text-gray-500 uppercase bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded flex items-center gap-1">
                                                            <GripVertical size={9} /> #{idx + 1}. SIRA
                                                        </span>
                                                        <span className="text-[9px] font-black text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-900/30 px-1.5 py-0.5 rounded">
                                                            ⏱️ {t.time}s
                                                        </span>
                                                    </div>

                                                    <div className="text-[9px] font-bold text-blue-600 dark:text-blue-400 mb-0.5 truncate uppercase" title={t.moldName}>{t.moldName}</div>
                                                    <div className="font-black text-xs text-gray-900 dark:text-gray-100 leading-tight line-clamp-2" title={t.taskName}>{t.taskName}</div>
                                                    
                                                    {t.camOperatorName && (
                                                        <div className="text-[9px] font-bold text-purple-600 dark:text-purple-300 mt-1 truncate">
                                                            👤 CAM: {t.camOperatorName}
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="mt-1.5 flex justify-between items-center border-t border-gray-100 dark:border-gray-600 pt-1 pl-1">
                                                    {/* Sıra Değiştirme Butonları (Mobil ve Hızlı Düzenleme için) */}
                                                    <div className="flex items-center gap-0.5">
                                                        {idx > 0 && (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleMoveQueueItem(t.moldId, t.taskId, (machine.assignedTasks[idx - 1]?.priority || 10) - 1)}
                                                                className="p-1 hover:bg-slate-100 dark:hover:bg-slate-600 rounded text-slate-500"
                                                                title="Öne Al"
                                                            >
                                                                <ArrowUp size={11} />
                                                            </button>
                                                        )}
                                                        {idx < machine.assignedTasks.length - 1 && (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleMoveQueueItem(t.moldId, t.taskId, (machine.assignedTasks[idx + 1]?.priority || 10) + 1)}
                                                                className="p-1 hover:bg-slate-100 dark:hover:bg-slate-600 rounded text-slate-500"
                                                                title="Arkaya Al"
                                                            >
                                                                <ArrowDown size={11} />
                                                            </button>
                                                        )}
                                                    </div>

                                                    <button 
                                                        onClick={() => handleRemoveFromMachine(t.moldId, t.taskId)}
                                                        className="text-[9px] text-red-600 dark:text-red-400 font-bold opacity-0 group-hover:opacity-100 transition px-1.5 py-0.5 bg-red-50 hover:bg-red-100 dark:bg-red-900/30 rounded"
                                                    >
                                                        Kaldır
                                                    </button>
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        !machine.activeTask && (
                                            <div className="flex items-center justify-center text-gray-400 opacity-60 px-4 text-xs font-bold w-full h-full min-h-[60px]">
                                                <CheckCircle2 className="w-4 h-4 mr-1.5"/> Tezgah Boş (Bekleyen İş Yok)
                                            </div>
                                        )
                                    )}
                                </div>

                            </div>
                        );
                    })}
                </div>
            </div>
            
        </div>
    );
};

export default CamPlanningTab;