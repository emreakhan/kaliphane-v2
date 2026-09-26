// src/pages/CamPlanningTab.js

import React, { useState, useMemo, useEffect } from 'react';
import { 
    Monitor, Layers, AlertCircle, Search, ChevronDown, 
    LayoutGrid, Check, X, GripVertical, ArrowUp, ArrowDown, 
    Zap, Calendar, Star, Filter, ShieldAlert, Sparkles,
    Settings, Plus, Trash2, Edit3, CheckSquare, FolderPlus
} from 'lucide-react';
import { doc, updateDoc, setDoc, onSnapshot } from '../config/firebase.js';
import { PROJECT_COLLECTION, OPERATION_STATUS, DEFAULT_MOLD_STATUSES, ROLES, CAM_SETTINGS_COLLECTION } from '../config/constants.js';
import { formatDurationHours, formatFreeAtDate, formatDateTime } from '../utils/dateUtils.js';

// Zengin ve birbirinden ayırt edilebilir renk paleti (Parça barları için)
const PALETTE = [
    { bg: 'bg-indigo-600 dark:bg-indigo-500', border: 'border-indigo-400 dark:border-indigo-300', text: 'text-white' },
    { bg: 'bg-purple-600 dark:bg-purple-500', border: 'border-purple-400 dark:border-purple-300', text: 'text-white' },
    { bg: 'bg-blue-600 dark:bg-blue-500', border: 'border-blue-400 dark:border-blue-300', text: 'text-white' },
    { bg: 'bg-teal-600 dark:bg-teal-500', border: 'border-teal-400 dark:border-teal-300', text: 'text-white' },
    { bg: 'bg-rose-600 dark:bg-rose-500', border: 'border-rose-400 dark:border-rose-300', text: 'text-white' },
    { bg: 'bg-cyan-600 dark:bg-cyan-500', border: 'border-cyan-400 dark:border-cyan-300', text: 'text-white' },
    { bg: 'bg-emerald-600 dark:bg-emerald-500', border: 'border-emerald-400 dark:border-emerald-300', text: 'text-white' },
    { bg: 'bg-amber-600 dark:bg-amber-500', border: 'border-amber-400 dark:border-amber-300', text: 'text-white' },
    { bg: 'bg-violet-600 dark:bg-violet-500', border: 'border-violet-400 dark:border-violet-300', text: 'text-white' },
    { bg: 'bg-orange-600 dark:bg-orange-500', border: 'border-orange-400 dark:border-orange-300', text: 'text-white' },
];

const getJobColor = (moldId = '', idx = 0) => {
    if (!moldId) return PALETTE[idx % PALETTE.length];
    let hash = 0;
    for (let i = 0; i < moldId.length; i++) {
        hash = moldId.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % PALETTE.length;
    return PALETTE[index];
};

// Başlangıç Tezgah Gruplarını Otomatik Oluştur (5 Eksen, Köprülü, CNC vb.)
const generateInitialMachineGroups = (machineList = []) => {
    const fiveAxis = machineList.filter(m => {
        const str = ((m.name || '') + ' ' + (m.type || '') + ' ' + (m.category || '')).toLowerCase();
        return str.includes('5') || str.includes('eksen');
    }).map(m => m.name);

    const bridge = machineList.filter(m => {
        const str = ((m.name || '') + ' ' + (m.type || '') + ' ' + (m.category || '')).toLowerCase();
        return str.includes('köprü') || str.includes('kopru') || str.includes('gantry');
    }).map(m => m.name);

    const cnc = machineList.filter(m => {
        const str = ((m.name || '') + ' ' + (m.type || '') + ' ' + (m.category || '')).toLowerCase();
        return str.includes('cnc') || str.includes('freze');
    }).map(m => m.name);

    const groups = [];
    groups.push({ id: 'g_5eksen', name: '5 Eksen Tezgahlar', machineNames: fiveAxis });
    groups.push({ id: 'g_koprulu', name: 'Köprülü Tezgahlar', machineNames: bridge });
    if (cnc.length > 0) {
        groups.push({ id: 'g_cnc', name: 'CNC Frezeler', machineNames: cnc });
    }
    return groups;
};

const CamPlanningTab = ({ projects, machines, personnel = [], db, onOpenMatrixView }) => {
    // 1. Kalıp ve Filtre State'leri
    const [selectedMoldId, setSelectedMoldId] = useState('');
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [searchMoldTerm, setSearchMoldTerm] = useState('');
    const [isMoldDropdownOpen, setIsMoldDropdownOpen] = useState(false);

    // 2. Timeline ve Görünüm Ayarları
    const [timeScale, setTimeScale] = useState('2_WEEKS'); // '1_WEEK' | '2_WEEKS' | '3_WEEKS' | '1_MONTH'
    const [searchMachine, setSearchMachine] = useState('');
    const [onlySelectedMoldMachines, setOnlySelectedMoldMachines] = useState(false);
    const [isPoolOpen, setIsPoolOpen] = useState(false); // Planlanmamış parçalar havuzu

    // 3. Sürükle - Bırak State'leri
    const [draggedItem, setDraggedItem] = useState(null); // { moldId, taskId, opId, machineName, time }
    const [dragOverMachine, setDragOverMachine] = useState(null);

    // 4. Hover Tooltip State'i
    const [hoveredJob, setHoveredJob] = useState(null);
    const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

    // 5. Hızlı Yönetim / Tezgah Değiştirme Modalı
    const [manageModal, setManageModal] = useState({
        isOpen: false,
        job: null,
        targetMachine: '',
        targetCamOp: '',
        targetHours: ''
    });

    // 6. KALICI TEZGAH FİLTRELEME & GRUP YÖNETİMİ (BULUT VE TÜM KULLANICILAR İÇİN SENKRON)
    const [machineGroups, setMachineGroups] = useState(() => {
        try {
            const cached = localStorage.getItem('planningMachineFilters');
            if (cached) {
                const parsed = JSON.parse(cached);
                if (Array.isArray(parsed.machineGroups) && parsed.machineGroups.length > 0) return parsed.machineGroups;
            }
        } catch (e) {}
        return generateInitialMachineGroups(machines);
    });

    const [activeFilterType, setActiveFilterType] = useState(() => {
        try {
            const cached = localStorage.getItem('planningMachineFilters');
            if (cached) {
                const parsed = JSON.parse(cached);
                if (parsed.activeFilterType) return parsed.activeFilterType;
            }
        } catch (e) {}
        return 'ALL'; // 'ALL' | 'GROUP' | 'CUSTOM'
    });

    const [activeGroupId, setActiveGroupId] = useState(() => {
        try {
            const cached = localStorage.getItem('planningMachineFilters');
            if (cached) {
                const parsed = JSON.parse(cached);
                if (parsed.activeGroupId) return parsed.activeGroupId;
            }
        } catch (e) {}
        return null;
    });

    const [allMachinesList, setAllMachinesList] = useState(() => {
        try {
            const cached = localStorage.getItem('planningMachineFilters');
            if (cached) {
                const parsed = JSON.parse(cached);
                if (Array.isArray(parsed.allMachinesList) && parsed.allMachinesList.length > 0) return parsed.allMachinesList;
            }
        } catch (e) {}
        return (machines || []).map(m => m.name);
    });

    const [selectedMachineNames, setSelectedMachineNames] = useState(() => {
        try {
            const cached = localStorage.getItem('planningMachineFilters');
            if (cached) {
                const parsed = JSON.parse(cached);
                if (Array.isArray(parsed.selectedMachines)) return parsed.selectedMachines;
            }
        } catch (e) {}
        return (machines || []).map(m => m.name);
    });

    // Filtre & Grup Yönetim Modalı State'leri
    const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
    const [filterModalTab, setFilterModalTab] = useState('GROUPS'); // 'GROUPS' | 'MACHINES'
    const [editingGroup, setEditingGroup] = useState(null); // { id, name, machineNames }
    const [newGroupName, setNewGroupName] = useState('');
    const [newGroupMachines, setNewGroupMachines] = useState([]);
    const [machineFilterSearch, setMachineFilterSearch] = useState('');

    // Tezgahlar ilk yüklendiğinde allMachinesList henüz boşsa doldur
    useEffect(() => {
        if (machines && machines.length > 0) {
            setAllMachinesList(prev => (prev && prev.length > 0 ? prev : machines.map(m => m.name)));
        }
    }, [machines]);

    // Buluttan Kayıtlı Tezgah Filtrelerini Canlı Dinle (Tüm Kullanıcılar İçin)
    useEffect(() => {
        if (!db) return;
        try {
            const settingsDocRef = doc(db, CAM_SETTINGS_COLLECTION, 'planningMachineFilters');
            const unsubscribe = onSnapshot(settingsDocRef, (snap) => {
                if (snap.exists()) {
                    const data = snap.data();
                    if (data) {
                        if (Array.isArray(data.machineGroups) && data.machineGroups.length > 0) {
                            setMachineGroups(data.machineGroups);
                        }
                        if (data.activeFilterType) {
                            setActiveFilterType(data.activeFilterType);
                        }
                        if (data.activeGroupId !== undefined) {
                            setActiveGroupId(data.activeGroupId);
                        }
                        if (Array.isArray(data.allMachinesList) && data.allMachinesList.length > 0) {
                            setAllMachinesList(data.allMachinesList);
                        }
                        if (Array.isArray(data.selectedMachines)) {
                            setSelectedMachineNames(data.selectedMachines);
                        }
                        try {
                            localStorage.setItem('planningMachineFilters', JSON.stringify(data));
                        } catch (e) {}
                    }
                } else if (machines && machines.length > 0) {
                    // İlk defa açılıyorsa varsayılan grupları buluta kaydet
                    const initialGroups = generateInitialMachineGroups(machines);
                    const initData = {
                        activeFilterType: 'ALL',
                        activeGroupId: null,
                        allMachinesList: machines.map(m => m.name),
                        selectedMachines: machines.map(m => m.name),
                        machineGroups: initialGroups,
                        updatedAt: new Date().toISOString()
                    };
                    setDoc(settingsDocRef, initData).catch(() => {});
                }
            }, (err) => {
                console.warn("Kayıtlı tezgah filtreleri okuma uyarısı:", err);
            });
            return () => unsubscribe();
        } catch (e) {
            console.warn("Filtre dinleme hatası:", e);
        }
    }, [db, machines]);

    // Buluta Kalıcı Kaydetme Fonksiyonu
    const saveFilterSettingsToCloud = async (newSettings) => {
        try {
            const payload = {
                allMachinesList,
                selectedMachines: selectedMachineNames,
                machineGroups,
                activeFilterType,
                activeGroupId,
                ...newSettings,
                updatedAt: new Date().toISOString()
            };
            if (db) {
                const settingsDocRef = doc(db, CAM_SETTINGS_COLLECTION, 'planningMachineFilters');
                await setDoc(settingsDocRef, payload, { merge: true });
            }
            localStorage.setItem('planningMachineFilters', JSON.stringify(payload));
        } catch (err) {
            console.error("Filtre ayarları buluta kaydedilirken hata:", err);
        }
    };

    // Hızlı Filtre Tıklamaları: Tüm Tezgahlar
    const handleSelectAllMachines = async () => {
        setActiveFilterType('ALL');
        setActiveGroupId(null);
        await saveFilterSettingsToCloud({
            activeFilterType: 'ALL',
            activeGroupId: null
        });
    };

    // Hızlı Filtre Tıklamaları: Belirli Bir Grubu Seç
    const handleSelectGroup = async (groupId) => {
        setActiveFilterType('GROUP');
        setActiveGroupId(groupId);
        await saveFilterSettingsToCloud({
            activeFilterType: 'GROUP',
            activeGroupId: groupId
        });
    };

    // Özel İşaretlenmiş Tezgahları Uygula
    const handleSaveCustomMachines = async (names) => {
        setSelectedMachineNames(names);
        setActiveFilterType('CUSTOM');
        setActiveGroupId(null);
        await saveFilterSettingsToCloud({
            activeFilterType: 'CUSTOM',
            activeGroupId: null,
            selectedMachines: names
        });
        setIsFilterModalOpen(false);
    };

    // Grup Ekle veya Güncelle
    const handleSaveGroup = async () => {
        // Eğer "__ALL__" yani Tüm Tezgahlar Genel Görünümü düzenleniyorsa
        if (editingGroup && editingGroup.id === '__ALL__') {
            if (newGroupMachines.length === 0) {
                alert("Lütfen 'Tüm Tezgahlar' görünümü için en az 1 tezgah seçiniz.");
                return;
            }
            setAllMachinesList(newGroupMachines);
            setEditingGroup(null);
            setNewGroupName('');
            setNewGroupMachines([]);
            await saveFilterSettingsToCloud({
                allMachinesList: newGroupMachines
            });
            return;
        }

        if (!newGroupName.trim()) {
            alert("Lütfen grup adını giriniz.");
            return;
        }
        let updatedGroups = [];
        if (editingGroup) {
            updatedGroups = machineGroups.map(g => {
                if (g.id === editingGroup.id) {
                    return {
                        ...g,
                        name: newGroupName.trim(),
                        machineNames: newGroupMachines
                    };
                }
                return g;
            });
        } else {
            const newId = 'grp_' + Date.now();
            updatedGroups = [
                ...machineGroups,
                {
                    id: newId,
                    name: newGroupName.trim(),
                    machineNames: newGroupMachines
                }
            ];
        }

        setMachineGroups(updatedGroups);
        setEditingGroup(null);
        setNewGroupName('');
        setNewGroupMachines([]);

        await saveFilterSettingsToCloud({
            machineGroups: updatedGroups
        });
    };

    // Grup Sil
    const handleDeleteGroup = async (groupId) => {
        if (!window.confirm("Bu tezgah grubunu silmek istediğinize emin misiniz?")) return;
        const updatedGroups = machineGroups.filter(g => g.id !== groupId);
        setMachineGroups(updatedGroups);
        const isCurrentActive = activeGroupId === groupId;
        const newFilterType = isCurrentActive ? 'ALL' : activeFilterType;
        const newGroupId = isCurrentActive ? null : activeGroupId;
        if (isCurrentActive) {
            setActiveFilterType('ALL');
            setActiveGroupId(null);
        }
        await saveFilterSettingsToCloud({
            activeFilterType: newFilterType,
            activeGroupId: newGroupId,
            selectedMachines: selectedMachineNames,
            machineGroups: updatedGroups
        });
    };

    // Zaman Ölçeği Konfigürasyonu
    const scaleConfig = useMemo(() => {
        switch (timeScale) {
            case '1_WEEK':
                return { days: 7, pxPerHour: 18, label: '1 Hafta (7G)' };
            case '3_WEEKS':
                return { days: 21, pxPerHour: 8, label: '3 Hafta (21G)' };
            case '1_MONTH':
                return { days: 30, pxPerHour: 5, label: '1 Ay (30G)' };
            case '2_WEEKS':
            default:
                return { days: 14, pxPerHour: 11, label: '2 Hafta (14G)' };
        }
    }, [timeScale]);

    const { days: totalDays, pxPerHour } = scaleConfig;
    const dayWidth = pxPerHour * 24;

    // Timeline Gün Başlıkları
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

    // Aktif Kalıplar ve Durum Filtreleri
    const activeMolds = useMemo(() => {
        return (projects || []).filter(p => p.status !== 'TAMAMLANDI');
    }, [projects]);

    const availableStatuses = useMemo(() => {
        const set = new Set();
        activeMolds.forEach(p => {
            if (p.status) set.add(p.status.trim());
        });
        DEFAULT_MOLD_STATUSES.forEach(s => {
            if (s.name && s.name !== 'TAMAMLANDI') set.add(s.name);
        });
        return Array.from(set);
    }, [activeMolds]);

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

    // ========================================================
    // TEZGAHLAR BAZLI ZAMAN ÇİZELGESİ VE İŞ HESAPLAMALARI
    // ========================================================
    const timelineRows = useMemo(() => {
        const now = new Date();

        return (machines || []).map(machine => {
            let activeJob = null;
            const queuedJobs = [];
            let totalHours = 0;

            (projects || []).forEach(project => {
                if (project.status === 'TAMAMLANDI') return;

                project.tasks?.forEach(task => {
                    const estTaskTime = parseFloat(task.estimatedCamTime) || 0;
                    const camOpName = task.assignedOperator || task.camOperator || project.camResponsible || 'Belirtilmedi';

                    // 1. Operasyon bazlı çalışan iş
                    (task.operations || []).forEach(op => {
                        const isWorking = (op.machineName === machine.name) && 
                            (op.status === OPERATION_STATUS.IN_PROGRESS || op.status === 'ÇALIŞIYOR');
                        if (isWorking && !activeJob) {
                            const opTime = parseFloat(op.estimatedCamTime || op.durationInHours) || estTaskTime || 8;
                            const progress = Math.min(100, Math.max(0, parseFloat(op.progressPercentage) || 0));
                            activeJob = {
                                id: `${project.id}-${task.id}-${op.id}-active`,
                                moldId: project.id,
                                moldName: project.moldName,
                                customer: project.customer || '',
                                projectCode: project.projectCode || '',
                                taskId: task.id,
                                taskName: task.taskName,
                                opId: op.id,
                                opType: op.type || op.name || 'İşleme',
                                workOrderNo: op.workOrderNo || task.workOrderNo || '',
                                subOperations: op.subOperations || [],
                                camOperator: op.assignedOperator || camOpName,
                                machineOperator: op.machineOperatorName || 'Belirtilmedi',
                                progress,
                                time: opTime,
                                isWorking: true,
                                priority: task.priority !== undefined ? task.priority : (project.priority || 999),
                                isSelectedMold: project.id === selectedMoldId
                            };
                            totalHours += opTime;
                        }
                    });

                    // 2. Operasyon bazlı sırada bekleyenler
                    let hasAssignedOp = false;
                    (task.operations || []).forEach((op, opIdx) => {
                        const isThisMachine = (op.machineName === machine.name);
                        const isPending = op.status !== OPERATION_STATUS.COMPLETED && 
                                          op.status !== OPERATION_STATUS.IN_PROGRESS && 
                                          op.status !== 'ÇALIŞIYOR';
                        if (isThisMachine && isPending) {
                            hasAssignedOp = true;
                            const opTime = parseFloat(op.estimatedCamTime || op.durationInHours) || estTaskTime || 8;
                            queuedJobs.push({
                                id: `${project.id}-${task.id}-${op.id || opIdx}`,
                                moldId: project.id,
                                moldName: project.moldName,
                                customer: project.customer || '',
                                projectCode: project.projectCode || '',
                                taskId: task.id,
                                taskName: task.taskName,
                                opId: op.id || String(opIdx),
                                opType: op.type || op.name || 'İşleme',
                                workOrderNo: op.workOrderNo || task.workOrderNo || '',
                                subOperations: op.subOperations || [],
                                camOperator: op.assignedOperator || camOpName,
                                machineOperator: op.machineOperatorName || 'Belirtilmedi',
                                progress: 0,
                                time: opTime,
                                isWorking: false,
                                priority: task.priority !== undefined ? task.priority : (project.priority || 999),
                                isSelectedMold: project.id === selectedMoldId
                            });
                            totalHours += opTime;
                        }
                    });

                    // 3. Parça düzeyinde planlananlar (alt operasyon atanmamışsa)
                    const isTaskCompleted = task.operations?.every(op => op.status === OPERATION_STATUS.COMPLETED) || task.status === 'COMPLETED';
                    const isTaskWorking = task.operations?.some(op => op.status === OPERATION_STATUS.IN_PROGRESS || op.status === 'ÇALIŞIYOR');
                    if (!hasAssignedOp && task.plannedMachine === machine.name && !isTaskCompleted && !isTaskWorking) {
                        const pendingOp = task.operations?.find(op => op.status !== OPERATION_STATUS.COMPLETED);
                        queuedJobs.push({
                            id: `${project.id}-${task.id}-task`,
                            moldId: project.id,
                            moldName: project.moldName,
                            customer: project.customer || '',
                            projectCode: project.projectCode || '',
                            taskId: task.id,
                            taskName: task.taskName,
                            opId: pendingOp?.id || null,
                            opType: pendingOp?.type || pendingOp?.name || 'Genel İşleme',
                            workOrderNo: pendingOp?.workOrderNo || task.workOrderNo || '',
                            subOperations: pendingOp?.subOperations || [],
                            camOperator: pendingOp?.assignedOperator || camOpName,
                            machineOperator: pendingOp?.machineOperatorName || 'Belirtilmedi',
                            progress: 0,
                            time: estTaskTime || 8,
                            isWorking: false,
                            priority: task.priority !== undefined ? task.priority : (project.priority || 999),
                            isSelectedMold: project.id === selectedMoldId
                        });
                        totalHours += (estTaskTime || 8);
                    }
                });
            });

            // Kuyruktaki işleri önceliğe göre sırala
            queuedJobs.sort((a, b) => a.priority - b.priority);

            // Barların zamanlama koordinatlarını (startHour, endHour, dates) hesapla
            const bars = [];
            let currentOffsetHours = 0;

            // 1. Aktif İş Barı
            if (activeJob) {
                const duration = Math.max(0.5, activeJob.time);
                const remaining = Math.max(0.5, duration * (1 - activeJob.progress / 100));
                const startDate = new Date(now.getTime());
                const endDate = new Date(now.getTime() + remaining * 3600 * 1000);
                const widthPx = Math.max(38, remaining * pxPerHour);

                bars.push({
                    ...activeJob,
                    startHour: 0,
                    durationHours: remaining,
                    widthPx,
                    startDate,
                    endDate,
                    isWorking: true,
                    orderIndex: 0
                });

                currentOffsetHours += remaining;
            }

            // 2. Kuyruktaki İş Barları
            queuedJobs.forEach((job, qIdx) => {
                const duration = Math.max(0.5, job.time);
                const startDate = new Date(now.getTime() + currentOffsetHours * 3600 * 1000);
                const endDate = new Date(startDate.getTime() + duration * 3600 * 1000);
                const widthPx = Math.max(38, duration * pxPerHour);

                bars.push({
                    ...job,
                    startHour: currentOffsetHours,
                    durationHours: duration,
                    widthPx,
                    startDate,
                    endDate,
                    isWorking: false,
                    orderIndex: qIdx + 1
                });

                currentOffsetHours += duration;
            });

            const activeRemainingHours = activeJob ? Math.max(0.5, activeJob.time * (1 - activeJob.progress / 100)) : 0;
            const queuedRemainingHours = queuedJobs.reduce((acc, q) => acc + q.time, 0);
            const totalRemainingHours = Number((activeRemainingHours + queuedRemainingHours).toFixed(1));
            const freeAtDate = totalRemainingHours > 0 ? new Date(now.getTime() + totalRemainingHours * 3600 * 1000) : null;

            return {
                id: machine.id,
                name: machine.name,
                type: machine.type || machine.category || 'CNC',
                activeJob,
                queuedJobs,
                bars,
                totalHours: Number(totalHours.toFixed(1)),
                totalRemainingHours,
                freeAt: freeAtDate,
                hasJobs: bars.length > 0,
                hasSelectedMoldJob: bars.some(b => b.isSelectedMold),
                status: activeJob ? 'BUSY' : (queuedJobs.length > 0 ? 'QUEUED' : 'AVAILABLE')
            };
        });
    }, [machines, projects, selectedMoldId, pxPerHour]);

    // Filtrelenmiş Tezgah Satırları (Kalıcı Grup ve İşaretli Tezgah Mantığı Dahil)
    const displayTimelineRows = useMemo(() => {
        return timelineRows.filter(row => {
            // 1. Kalıcı Tezgah Filtresi (Grup, Özel veya Özelleştirilebilir Tüm Tezgahlar Listesi)
            if (activeFilterType === 'GROUP' && activeGroupId) {
                const activeGroup = machineGroups.find(g => g.id === activeGroupId);
                if (activeGroup && !activeGroup.machineNames.includes(row.name)) {
                    return false;
                }
            } else if (activeFilterType === 'CUSTOM') {
                if (!selectedMachineNames.includes(row.name)) {
                    return false;
                }
            } else if (activeFilterType === 'ALL') {
                if (allMachinesList && allMachinesList.length > 0 && !allMachinesList.includes(row.name)) {
                    return false;
                }
            }

            // 2. Kalıp Bazlı Filtre (Sadece seçili kalıbın tezgahları)
            if (onlySelectedMoldMachines && selectedMoldId && !row.hasSelectedMoldJob) {
                return false;
            }

            // 3. Arama Terimi
            if (searchMachine.trim()) {
                const term = searchMachine.toLowerCase().trim();
                const matchName = row.name.toLowerCase().includes(term);
                const matchType = (row.type || '').toLowerCase().includes(term);
                return matchName || matchType;
            }
            return true;
        });
    }, [timelineRows, activeFilterType, activeGroupId, machineGroups, selectedMachineNames, allMachinesList, onlySelectedMoldMachines, selectedMoldId, searchMachine]);

    // ========================================================
    // SEÇİLİ KALIP ANALİZİ VE TAHMİNİ BİTİŞ TAKVİMİ HESABI
    // ========================================================
    const selectedMoldAnalysis = useMemo(() => {
        if (!selectedMold) return null;

        const allTasks = selectedMold.tasks || [];
        const totalParts = allTasks.length;
        let plannedCount = 0;
        let completedCount = 0;
        let totalHours = 0;

        const assignedJobs = [];
        const unplannedTasks = [];

        allTasks.forEach(task => {
            const isCompleted = task.operations?.every(op => op.status === OPERATION_STATUS.COMPLETED) || task.status === 'COMPLETED';
            if (isCompleted) {
                completedCount++;
            }

            const estTime = parseFloat(task.estimatedCamTime) || 0;
            totalHours += estTime;

            // Bu parçaya ait barları bul
            let foundInBars = false;
            timelineRows.forEach(row => {
                row.bars.forEach(bar => {
                    if (bar.moldId === selectedMold.id && bar.taskId === task.id) {
                        foundInBars = true;
                        assignedJobs.push({
                            ...bar,
                            machineName: row.name,
                            machineType: row.type
                        });
                    }
                });
            });

            if (foundInBars || task.plannedMachine) {
                plannedCount++;
            } else if (!isCompleted) {
                unplannedTasks.push(task);
            }
        });

        // En geç biten parçayı ve tarihi bul (Darboğaz Tezgah & Bitiş Zamanı)
        let latestFinishDate = null;
        let bottleneckJob = null;

        assignedJobs.forEach(job => {
            if (job.endDate) {
                if (!latestFinishDate || job.endDate.getTime() > latestFinishDate.getTime()) {
                    latestFinishDate = job.endDate;
                    bottleneckJob = job;
                }
            }
        });

        // Kalan gün hesabı
        let remainingDaysText = '';
        if (latestFinishDate) {
            const diffMs = latestFinishDate.getTime() - Date.now();
            if (diffMs > 0) {
                const totalHoursLeft = diffMs / (3600 * 1000);
                const days = Math.floor(totalHoursLeft / 24);
                const hours = Math.round(totalHoursLeft % 24);
                remainingDaysText = days > 0 ? `${days} Gün ${hours} Saat Sonra` : `${hours} Saat Sonra`;
            } else {
                remainingDaysText = 'Bugün Tamamlanıyor';
            }
        }

        return {
            moldName: selectedMold.moldName,
            customer: selectedMold.customer,
            projectCode: selectedMold.projectCode,
            totalParts,
            plannedCount,
            completedCount,
            unplannedCount: unplannedTasks.length,
            unplannedTasks,
            totalHours,
            latestFinishDate,
            bottleneckJob,
            remainingDaysText,
            isFullyPlanned: unplannedTasks.length === 0 && totalParts > 0
        };
    }, [selectedMold, timelineRows]);

    // ========================================================
    // PLANLAMA EYLEMLERİ: TEZGAH DEĞİŞTİR, KALDIR, SÜRÜKLE-BIRAK
    // ========================================================

    // 1. Tek Tuşla Tezgah Değiştir / Taşı
    const handleMoveJobToMachine = async (targetMoldId, targetTaskId, targetOpId, newMachineName) => {
        try {
            const mold = (projects || []).find(p => p.id === targetMoldId);
            if (!mold) return;

            const updatedTasks = (mold.tasks || []).map(t => {
                if (t.id === targetTaskId) {
                    const newTask = { ...t };
                    if (targetOpId && newTask.operations && Array.isArray(newTask.operations)) {
                        newTask.operations = newTask.operations.map((op, idx) => {
                            if ((op.id && op.id === targetOpId) || String(idx) === String(targetOpId)) {
                                return {
                                    ...op,
                                    machineName: newMachineName
                                };
                            }
                            return op;
                        });
                        newTask.plannedMachine = newMachineName;
                    } else {
                        newTask.plannedMachine = newMachineName;
                        if (newTask.operations && Array.isArray(newTask.operations)) {
                            newTask.operations = newTask.operations.map((op, idx) => {
                                if (idx === 0 && (op.status === OPERATION_STATUS.NOT_STARTED || !op.status)) {
                                    return { ...op, machineName: newMachineName };
                                }
                                return op;
                            });
                        }
                    }
                    return newTask;
                }
                return t;
            });

            await updateDoc(doc(db, PROJECT_COLLECTION, mold.id), {
                tasks: updatedTasks,
                updatedAt: new Date().toISOString()
            });

            setManageModal({ isOpen: false, job: null, targetMachine: '', targetCamOp: '', targetHours: '' });
        } catch (err) {
            console.error("Tezgah değiştirme hatası:", err);
            alert("İş başka tezgaha taşınırken hata oluştu: " + err.message);
        }
    };

    // 2. Plandan Kaldır (Plandan Çıkar)
    const handleRemoveFromPlan = async (targetMoldId, targetTaskId, targetOpId = null) => {
        if (!window.confirm("Bu parçayı tezgah planından kaldırmak istediğinize emin misiniz?")) return;
        try {
            const mold = (projects || []).find(p => p.id === targetMoldId);
            if (!mold) return;

            const updatedTasks = (mold.tasks || []).map(t => {
                if (t.id === targetTaskId) {
                    const newTask = { ...t };
                    if (targetOpId && newTask.operations && Array.isArray(newTask.operations)) {
                        newTask.operations = newTask.operations.map((op, idx) => {
                            if ((op.id && op.id === targetOpId) || String(idx) === String(targetOpId)) {
                                const newOp = { ...op };
                                delete newOp.machineName;
                                return newOp;
                            }
                            return op;
                        });
                        const anyAssigned = newTask.operations.some(o => o.machineName);
                        if (!anyAssigned) delete newTask.plannedMachine;
                    } else {
                        delete newTask.plannedMachine;
                        if (newTask.operations && Array.isArray(newTask.operations)) {
                            newTask.operations = newTask.operations.map(op => {
                                const newOp = { ...op };
                                delete newOp.machineName;
                                return newOp;
                            });
                        }
                    }
                    return newTask;
                }
                return t;
            });

            await updateDoc(doc(db, PROJECT_COLLECTION, mold.id), {
                tasks: updatedTasks,
                updatedAt: new Date().toISOString()
            });

            setManageModal({ isOpen: false, job: null, targetMachine: '', targetCamOp: '', targetHours: '' });
        } catch (err) {
            console.error("Plandan kaldırma hatası:", err);
        }
    };

    // 3. Hızlı Yönetim Modalında Düzenlemeleri Kaydet
    const handleSaveManageModal = async () => {
        const { job, targetMachine, targetCamOp, targetHours } = manageModal;
        if (!job) return;

        try {
            const mold = (projects || []).find(p => p.id === job.moldId);
            if (!mold) return;

            const parsedHours = parseFloat(targetHours);

            const updatedTasks = (mold.tasks || []).map(t => {
                if (t.id === job.taskId) {
                    const newTask = { ...t };
                    const finalHours = !isNaN(parsedHours) && parsedHours > 0 ? parsedHours : (parseFloat(t.estimatedCamTime) || 8);

                    if (job.opId && newTask.operations && Array.isArray(newTask.operations)) {
                        newTask.operations = newTask.operations.map((op, idx) => {
                            if ((op.id && op.id === job.opId) || String(idx) === String(job.opId)) {
                                return {
                                    ...op,
                                    machineName: targetMachine || op.machineName,
                                    assignedOperator: targetCamOp || op.assignedOperator,
                                    estimatedCamTime: finalHours
                                };
                            }
                            return op;
                        });
                        if (targetMachine) newTask.plannedMachine = targetMachine;
                    } else {
                        if (targetMachine) newTask.plannedMachine = targetMachine;
                        if (targetCamOp) {
                            newTask.assignedOperator = targetCamOp;
                            newTask.camOperator = targetCamOp;
                        }
                        newTask.estimatedCamTime = finalHours;

                        if (newTask.operations && Array.isArray(newTask.operations)) {
                            newTask.operations = newTask.operations.map((op, idx) => {
                                if (idx === 0) {
                                    return {
                                        ...op,
                                        machineName: targetMachine || op.machineName,
                                        assignedOperator: targetCamOp || op.assignedOperator,
                                        estimatedCamTime: finalHours
                                    };
                                }
                                return op;
                            });
                        }
                    }
                    return newTask;
                }
                return t;
            });

            await updateDoc(doc(db, PROJECT_COLLECTION, mold.id), {
                tasks: updatedTasks,
                updatedAt: new Date().toISOString()
            });

            setManageModal({ isOpen: false, job: null, targetMachine: '', targetCamOp: '', targetHours: '' });
        } catch (err) {
            console.error("Düzenleme kaydetme hatası:", err);
            alert("Değişiklik kaydedilirken hata oluştu: " + err.message);
        }
    };

    // 4. Kuyruk Sırasını Değiştir (En Öne / En Arkaya)
    const handleReorderQueue = async (targetMoldId, targetTaskId, direction) => {
        try {
            const mold = (projects || []).find(p => p.id === targetMoldId);
            if (!mold) return;

            const newPriority = direction === 'top' ? -999 : 9999;
            const updatedTasks = (mold.tasks || []).map(t => {
                if (t.id === targetTaskId) {
                    return { ...t, priority: newPriority };
                }
                return t;
            });

            await updateDoc(doc(db, PROJECT_COLLECTION, mold.id), {
                tasks: updatedTasks,
                updatedAt: new Date().toISOString()
            });

            setManageModal({ isOpen: false, job: null, targetMachine: '', targetCamOp: '', targetHours: '' });
        } catch (e) {
            console.error("Sıralama hatası:", e);
        }
    };

    // 5. Planlanmamış Parçayı Tezgaha Ata
    const handleAssignUnplannedTask = async (task, targetMachineName, targetCamOp = '', estHours = 8) => {
        if (!selectedMold || !targetMachineName) return;
        try {
            const updatedTasks = (selectedMold.tasks || []).map(t => {
                if (t.id === task.id) {
                    const hours = parseFloat(estHours) || (parseFloat(t.estimatedCamTime) || 8);
                    const ops = (t.operations && t.operations.length > 0) ? t.operations.map((op, idx) => {
                        if (idx === 0) {
                            return {
                                ...op,
                                machineName: targetMachineName,
                                assignedOperator: targetCamOp || op.assignedOperator || selectedMold.camResponsible || '',
                                estimatedCamTime: hours
                            };
                        }
                        return op;
                    }) : [{
                        id: 'op-init-' + Date.now(),
                        type: 'CNC Freze',
                        machineName: targetMachineName,
                        assignedOperator: targetCamOp || selectedMold.camResponsible || '',
                        estimatedCamTime: hours,
                        status: OPERATION_STATUS.NOT_STARTED,
                        progressPercentage: 0
                    }];

                    return {
                        ...t,
                        plannedMachine: targetMachineName,
                        assignedOperator: targetCamOp || t.assignedOperator || selectedMold.camResponsible || '',
                        estimatedCamTime: hours,
                        operations: ops
                    };
                }
                return t;
            });

            await updateDoc(doc(db, PROJECT_COLLECTION, selectedMold.id), {
                tasks: updatedTasks,
                updatedAt: new Date().toISOString()
            });
        } catch (err) {
            console.error("Parça atama hatası:", err);
            alert("Parça tezgaha atanırken hata oluştu: " + err.message);
        }
    };

    // Modal Açma Yardımcısı
    const openManageModal = (job) => {
        setManageModal({
            isOpen: true,
            job,
            targetMachine: job.machineName || '',
            targetCamOp: job.camOperator || '',
            targetHours: String(job.time || '')
        });
    };

    return (
        <div className="flex flex-col gap-3 animate-in fade-in h-[calc(100vh-140px)] min-h-[600px] overflow-hidden">
            
            {/* ======================================================== */}
            {/* 1. ÜST KONTROL ÇUBUĞU (KALIP SEÇİCİ & FİLTRELER & ZAMAN ÖLÇEĞİ) */}
            {/* ======================================================== */}
            <div className="bg-white dark:bg-gray-800 p-3 rounded-2xl shadow-xs border border-gray-200 dark:border-gray-700 shrink-0 space-y-2.5">
                <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-3">
                    
                    {/* Sol: Kalıp Seçimi & Arama Dropdown */}
                    <div className="flex items-center gap-2 flex-1 w-full xl:w-auto flex-wrap sm:flex-nowrap">
                        <div className="relative flex-1 min-w-[260px] sm:min-w-[320px]">
                            <button
                                type="button"
                                onClick={() => setIsMoldDropdownOpen(!isMoldDropdownOpen)}
                                className={`w-full px-3 py-2 text-xs font-black rounded-xl border flex items-center justify-between transition-all ${
                                    selectedMold 
                                        ? 'bg-purple-50 dark:bg-purple-950/40 border-purple-400 dark:border-purple-600 text-purple-900 dark:text-purple-100 shadow-xs' 
                                        : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-800 dark:text-white hover:border-purple-400'
                                }`}
                            >
                                <div className="flex items-center gap-2 truncate">
                                    <Layers className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />
                                    <span className="truncate">
                                        {selectedMold ? `${selectedMold.moldName} (${selectedMold.customer || 'Müşteri Yok'})` : 'Tüm Kalıpları Göster (Seçim Yok)'}
                                    </span>
                                </div>
                                <ChevronDown className="w-4 h-4 text-gray-400 shrink-0 ml-1" />
                            </button>

                            {/* Kalıp Arama & Seçim Menüsü */}
                            {isMoldDropdownOpen && (
                                <div 
                                    className="absolute z-50 left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-2xl p-2.5 space-y-2 max-h-80 flex flex-col"
                                    onMouseLeave={() => setIsMoldDropdownOpen(false)}
                                >
                                    <div className="relative shrink-0">
                                        <input
                                            type="text"
                                            autoFocus
                                            placeholder="Kalıp adı, müşteri veya kod ara..."
                                            value={searchMoldTerm}
                                            onChange={e => setSearchMoldTerm(e.target.value)}
                                            className="w-full pl-8 pr-7 py-2 text-xs font-bold bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-purple-500 shadow-inner"
                                        />
                                        <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-2.5" />
                                        {searchMoldTerm && (
                                            <button 
                                                onClick={() => setSearchMoldTerm('')}
                                                className="absolute right-2.5 top-2 text-gray-400 hover:text-gray-600"
                                            >
                                                <X className="w-3.5 h-3.5" />
                                            </button>
                                        )}
                                    </div>

                                    {/* Tüm Kalıplar Butonu */}
                                    <div 
                                        onClick={() => {
                                            setSelectedMoldId('');
                                            setIsMoldDropdownOpen(false);
                                        }}
                                        className={`p-2 rounded-xl text-xs font-black cursor-pointer flex items-center justify-between transition ${
                                            !selectedMoldId 
                                                ? 'bg-purple-600 text-white' 
                                                : 'hover:bg-purple-50 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200'
                                        }`}
                                    >
                                        <span>🌐 Tüm Kalıpları Göster (Vurgu Yok)</span>
                                        <span className="text-[10px] opacity-75">{activeMolds.length} Kalıp</span>
                                    </div>

                                    <div className="overflow-y-auto space-y-1 custom-scrollbar max-h-56 pr-1">
                                        {filteredMolds.map(m => (
                                            <div
                                                key={m.id}
                                                onClick={() => {
                                                    setSelectedMoldId(m.id);
                                                    setIsMoldDropdownOpen(false);
                                                }}
                                                className={`p-2 rounded-xl text-xs cursor-pointer flex items-center justify-between transition ${
                                                    selectedMoldId === m.id 
                                                        ? 'bg-purple-600 text-white font-black shadow-xs' 
                                                        : 'hover:bg-gray-100 dark:hover:bg-gray-700/60 text-gray-900 dark:text-gray-100'
                                                }`}
                                            >
                                                <div className="flex flex-col truncate">
                                                    <span className="font-bold truncate">{m.moldName}</span>
                                                    <span className={`text-[10px] ${selectedMoldId === m.id ? 'text-purple-100' : 'text-gray-400'}`}>
                                                        {m.customer || 'Müşteri Yok'} • {m.tasks?.length || 0} Parça
                                                    </span>
                                                </div>
                                                <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase shrink-0 ${
                                                    selectedMoldId === m.id 
                                                        ? 'bg-purple-700 text-white' 
                                                        : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                                                }`}>
                                                    {m.status || 'Belirtilmedi'}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Seçimi Temizle Butonu */}
                        {selectedMoldId && (
                            <button
                                type="button"
                                onClick={() => setSelectedMoldId('')}
                                className="px-2.5 py-2 text-xs font-bold text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-red-50 dark:hover:bg-red-950/30 transition shrink-0"
                                title="Seçimi kaldır ve tüm kalıpları göster"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        )}

                        {/* Planlanmamış Parçalar Butonu */}
                        {selectedMoldAnalysis && selectedMoldAnalysis.unplannedCount > 0 && (
                            <button
                                type="button"
                                onClick={() => setIsPoolOpen(!isPoolOpen)}
                                className={`px-3 py-2 text-xs font-black rounded-xl border flex items-center gap-1.5 transition shrink-0 ${
                                    isPoolOpen 
                                        ? 'bg-amber-500 text-white border-amber-600 shadow-xs' 
                                        : 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700/60 hover:bg-amber-100'
                                }`}
                                title="Bu kalıba ait henüz bir tezgaha atanmamış parçaları aç/kapat"
                            >
                                <AlertCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                                <span>Planlanmamış Parçalar</span>
                                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-black bg-amber-600 text-white">
                                    {selectedMoldAnalysis.unplannedCount}
                                </span>
                            </button>
                        )}
                    </div>

                    {/* Sağ Kontroller: Tezgah Arama, Sadece Kalıp Tezgahları, Zaman Ölçeği */}
                    <div className="flex items-center gap-2 flex-wrap w-full xl:w-auto justify-end">
                        
                        {/* Tezgah Ara Input */}
                        <div className="relative min-w-[140px] sm:min-w-[170px]">
                            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-2.5 pointer-events-none" />
                            <input
                                type="text"
                                placeholder="Tezgah ara..."
                                value={searchMachine}
                                onChange={e => setSearchMachine(e.target.value)}
                                className="w-full pl-8 pr-3 py-1.5 text-xs font-bold bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl text-gray-800 dark:text-white outline-none focus:ring-1 focus:ring-purple-500"
                            />
                        </div>

                        {/* Sadece Seçili Kalıbın Tezgahları Switch */}
                        {selectedMoldId && (
                            <label className="flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-50 dark:bg-gray-700/60 border border-gray-200 dark:border-gray-600 rounded-xl text-xs font-bold cursor-pointer select-none text-gray-700 dark:text-gray-300 hover:bg-gray-100">
                                <input
                                    type="checkbox"
                                    checked={onlySelectedMoldMachines}
                                    onChange={e => setOnlySelectedMoldMachines(e.target.checked)}
                                    className="w-3.5 h-3.5 text-purple-600 rounded focus:ring-purple-500"
                                />
                                <span>Sadece Kalıbın Tezgahları</span>
                            </label>
                        )}

                        {/* Zaman Ölçeği Butonları */}
                        <div className="flex bg-gray-100 dark:bg-gray-700 p-0.5 rounded-xl border border-gray-200 dark:border-gray-600 text-[11px] font-black">
                            {['1_WEEK', '2_WEEKS', '3_WEEKS', '1_MONTH'].map(scale => (
                                <button
                                    key={scale}
                                    type="button"
                                    onClick={() => setTimeScale(scale)}
                                    className={`px-2 py-1 rounded-lg transition-all ${
                                        timeScale === scale 
                                            ? 'bg-purple-600 text-white shadow-xs' 
                                            : 'text-gray-600 dark:text-gray-300 hover:text-gray-900'
                                    }`}
                                >
                                    {scale === '1_WEEK' ? '1 Hafta' : scale === '2_WEEKS' ? '2 Hafta' : scale === '3_WEEKS' ? '3 Hafta' : '1 Ay'}
                                </button>
                            ))}
                        </div>

                        {/* Matris Panosu Butonu */}
                        {onOpenMatrixView && (
                            <button
                                type="button"
                                onClick={onOpenMatrixView}
                                className="px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 font-bold text-xs rounded-xl border border-indigo-200 dark:border-indigo-800 transition flex items-center gap-1 shrink-0"
                            >
                                <LayoutGrid className="w-3.5 h-3.5" />
                                <span className="hidden sm:inline">Matris Panosu</span>
                            </button>
                        )}
                    </div>
                </div>

                {/* Kalıp Durum Filtreleri */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 custom-scrollbar text-xs">
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider mr-1 flex items-center gap-1 shrink-0">
                        <Filter className="w-3 h-3" /> Durum:
                    </span>
                    <button
                        type="button"
                        onClick={() => setStatusFilter('ALL')}
                        className={`px-2.5 py-0.5 rounded-lg font-bold text-[11px] transition ${
                            statusFilter === 'ALL'
                                ? 'bg-purple-600 text-white shadow-xs'
                                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200'
                        }`}
                    >
                        Tümü ({activeMolds.length})
                    </button>
                    {availableStatuses.map(st => (
                        <button
                            key={st}
                            type="button"
                            onClick={() => setStatusFilter(st)}
                            className={`px-2.5 py-0.5 rounded-lg font-bold text-[11px] transition whitespace-nowrap ${
                                statusFilter === st
                                    ? 'bg-purple-600 text-white shadow-xs'
                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200'
                            }`}
                        >
                            {st}
                        </button>
                    ))}
                </div>

                {/* ======================================================== */}
                {/* TEZGAH GRUP VE FİLTRELEME ÇUBUĞU (KALICI & BULUT EŞZAMANLI) */}
                {/* ======================================================== */}
                <div className="flex items-center justify-between gap-2 pt-2 border-t border-gray-200 dark:border-gray-700/80 overflow-x-auto custom-scrollbar">
                    <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar text-xs py-0.5">
                        <span className="text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-center gap-1 shrink-0">
                            <Monitor className="w-3.5 h-3.5 text-indigo-500" /> Tezgah Filtresi:
                        </span>

                        {/* Tüm Tezgahlar Butonu ve Hızlı Düzenle */}
                        <div className="inline-flex items-center rounded-xl shadow-xs overflow-hidden shrink-0 border border-gray-200 dark:border-gray-700">
                            <button
                                type="button"
                                onClick={handleSelectAllMachines}
                                className={`px-2.5 py-1 text-xs font-black transition-all ${
                                    activeFilterType === 'ALL'
                                        ? 'bg-indigo-600 text-white'
                                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                                }`}
                                title="Tüm Tezgahlar ana listesini göster"
                            >
                                Tümü ({allMachinesList.length}{allMachinesList.length !== (machines?.length || 0) ? `/${machines?.length || 0}` : ''})
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setEditingGroup({ id: '__ALL__', name: 'Tüm Tezgahlar (Ana Görünüm)', machineNames: allMachinesList });
                                    setNewGroupName('Tüm Tezgahlar (Ana Görünüm)');
                                    setNewGroupMachines(allMachinesList);
                                    setFilterModalTab('GROUPS');
                                    setIsFilterModalOpen(true);
                                }}
                                title="Tüm Tezgahlar genel görünüm listesini düzenle"
                                className={`px-1.5 py-1 text-xs font-bold transition-all border-l ${
                                    activeFilterType === 'ALL'
                                        ? 'bg-indigo-700 border-indigo-500 text-indigo-100 hover:bg-indigo-800'
                                        : 'bg-gray-200 dark:bg-gray-600 border-gray-300 dark:border-gray-500 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500'
                                }`}
                            >
                                <Edit3 className="w-3 h-3" />
                            </button>
                        </div>

                        {/* Tanımlı Gruplar Butonları */}
                        {machineGroups.map(grp => {
                            const isActive = activeFilterType === 'GROUP' && activeGroupId === grp.id;
                            return (
                                <button
                                    key={grp.id}
                                    type="button"
                                    onClick={() => handleSelectGroup(grp.id)}
                                    className={`px-3 py-1 rounded-xl text-xs font-black transition-all whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                                        isActive
                                            ? 'bg-indigo-600 text-white shadow-xs ring-2 ring-indigo-300 dark:ring-indigo-700'
                                            : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                                    }`}
                                >
                                    <span>{grp.name}</span>
                                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                                        isActive ? 'bg-indigo-800 text-indigo-100' : 'bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300'
                                    }`}>
                                        {grp.machineNames.length}
                                    </span>
                                </button>
                            );
                        })}

                        {/* Özel Çoklu Seçim Aktifse Rozet */}
                        {activeFilterType === 'CUSTOM' && (
                            <span className="px-2.5 py-1 rounded-xl text-xs font-black bg-amber-500 text-white shadow-xs flex items-center gap-1 shrink-0">
                                <CheckSquare className="w-3 h-3" /> Özel Seçim ({selectedMachineNames.length} Tezgah)
                            </span>
                        )}
                    </div>

                    {/* Filtre ve Grup Yönetim Modalını Aç Butonu */}
                    <button
                        type="button"
                        onClick={() => {
                            setFilterModalTab('GROUPS');
                            setIsFilterModalOpen(true);
                        }}
                        className="px-3 py-1 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700/80 text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 font-bold text-xs transition flex items-center gap-1.5 shrink-0 shadow-2xs"
                        title="Tezgah gruplarını yönet ve tek tek işaretle"
                    >
                        <Settings className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                        <span className="hidden sm:inline">Grupları & Filtreyi Düzenle</span>
                        <span className="sm:hidden">Filtrele</span>
                        {activeFilterType !== 'ALL' && (
                            <span className="w-2 h-2 rounded-full bg-indigo-600 animate-ping" />
                        )}
                    </button>
                </div>
            </div>

            {/* ======================================================== */}
            {/* 2. SEÇİLİ KALIP ANALİZ VE TAHMİNİ BİTİŞ TAKVİMİ PANELİ */}
            {/* ======================================================== */}
            {selectedMoldAnalysis && (
                <div className="bg-gradient-to-r from-purple-900/90 via-indigo-900/90 to-slate-900/95 text-white p-3.5 rounded-2xl shadow-md border border-purple-500/40 shrink-0 space-y-2">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                        
                        {/* Sol: Kalıp Kimlik Bilgisi & Vurgu Uyarısı */}
                        <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="px-2 py-0.5 rounded bg-yellow-400 text-slate-950 text-[10px] font-black uppercase tracking-wider flex items-center gap-1 shadow-xs animate-pulse">
                                    <Star className="w-3 h-3 fill-current" /> SEÇİLİ KALIP VURGUSU
                                </span>
                                <h3 className="text-base font-black text-white truncate">
                                    {selectedMoldAnalysis.moldName}
                                </h3>
                                {selectedMoldAnalysis.customer && (
                                    <span className="text-xs text-purple-200 font-bold">
                                        ({selectedMoldAnalysis.customer})
                                    </span>
                                )}
                                {selectedMoldAnalysis.projectCode && (
                                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/10 text-purple-200 border border-white/20">
                                        #{selectedMoldAnalysis.projectCode}
                                    </span>
                                )}
                            </div>

                            <p className="text-[11px] text-purple-200/90 flex items-center gap-1.5 font-medium">
                                <Sparkles className="w-3.5 h-3.5 text-yellow-300 shrink-0 animate-bounce" />
                                <span>Bu kalıba ait tüm parçalar aşağıdaki zaman çizelgesinde <strong>sarı neon halkayla yanıp sönerek</strong> vurgulanmıştır. Diğer kalıplar şeffaflaştırılmıştır.</span>
                            </p>
                        </div>

                        {/* Sağ Metrikler: Tahmini Bitiş, Süre, Parça Durumu */}
                        <div className="flex items-center gap-3 flex-wrap text-xs">
                            
                            {/* Tahmini Kalıp Bitiş Tarihi */}
                            <div className="bg-white/10 backdrop-blur-md px-3 py-2 rounded-xl border border-white/20 flex items-center gap-2.5">
                                <div className="p-1.5 rounded-lg bg-yellow-400 text-slate-950 font-black">
                                    <Calendar className="w-4 h-4" />
                                </div>
                                <div>
                                    <div className="text-[9px] font-bold text-yellow-300 uppercase tracking-wider">Tahmini Kalıp Bitişi</div>
                                    <div className="text-xs font-black text-white">
                                        {selectedMoldAnalysis.latestFinishDate 
                                            ? formatDateTime(selectedMoldAnalysis.latestFinishDate.toISOString()) 
                                            : 'Planlanmış Parça Yok'}
                                    </div>
                                    {selectedMoldAnalysis.remainingDaysText && (
                                        <div className="text-[10px] text-yellow-200 font-semibold">
                                            ({selectedMoldAnalysis.remainingDaysText})
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Kritik Darboğaz Tezgah */}
                            {selectedMoldAnalysis.bottleneckJob && (
                                <div className="bg-white/10 backdrop-blur-md px-3 py-2 rounded-xl border border-white/20 flex items-center gap-2">
                                    <div className="p-1.5 rounded-lg bg-rose-500 text-white font-black">
                                        <ShieldAlert className="w-4 h-4" />
                                    </div>
                                    <div>
                                        <div className="text-[9px] font-bold text-rose-300 uppercase tracking-wider">Darboğaz Tezgah</div>
                                        <div className="text-xs font-black text-white">
                                            {selectedMoldAnalysis.bottleneckJob.machineName}
                                        </div>
                                        <div className="text-[10px] text-rose-200 truncate max-w-[130px]">
                                            Son Parça: {selectedMoldAnalysis.bottleneckJob.taskName}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Parça Planlanma Durumu */}
                            <div className="bg-white/10 backdrop-blur-md px-3 py-2 rounded-xl border border-white/20">
                                <div className="text-[9px] font-bold text-purple-300 uppercase tracking-wider">Planlanma</div>
                                <div className="text-xs font-black text-white">
                                    {selectedMoldAnalysis.plannedCount} / {selectedMoldAnalysis.totalParts} Parça
                                </div>
                                <div className="text-[10px] text-purple-200">
                                    Yük: {formatDurationHours(selectedMoldAnalysis.totalHours)}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ======================================================== */}
            {/* 3. PLANLANMAMIŞ PARÇALAR HAVUZU (ÇEKMECE / AKORDİYON) */}
            {/* ======================================================== */}
            {isPoolOpen && selectedMoldAnalysis && selectedMoldAnalysis.unplannedTasks.length > 0 && (
                <div className="bg-amber-50/90 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700/80 p-3.5 rounded-2xl shrink-0 space-y-2.5 animate-in slide-in-from-top-2">
                    <div className="flex justify-between items-center border-b border-amber-200 dark:border-amber-800/60 pb-2">
                        <div className="flex items-center gap-2">
                            <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                            <h4 className="text-xs font-black text-amber-900 dark:text-amber-200 uppercase tracking-wider">
                                Henüz Bir Tezgaha Atanmamış Parçalar ({selectedMoldAnalysis.unplannedTasks.length} Parça):
                            </h4>
                            <span className="text-[11px] text-amber-700 dark:text-amber-400">
                                (Parçayı doğrudan aşağıdaki tezgah satırına sürükleyip bırakabilir veya açılır kutudan tezgah seçebilirsiniz.)
                            </span>
                        </div>
                        <button
                            type="button"
                            onClick={() => setIsPoolOpen(false)}
                            className="p-1 rounded-lg text-amber-700 hover:bg-amber-100 dark:text-amber-400"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                        {selectedMoldAnalysis.unplannedTasks.map(task => (
                            <div 
                                key={task.id}
                                draggable
                                onDragStart={() => setDraggedItem({
                                    moldId: selectedMold.id,
                                    taskId: task.id,
                                    opId: null,
                                    machineName: null,
                                    time: parseFloat(task.estimatedCamTime) || 8
                                })}
                                className="bg-white dark:bg-gray-800 p-2.5 rounded-xl border border-amber-300 dark:border-amber-700/60 shadow-xs flex flex-col justify-between gap-2 cursor-grab active:cursor-grabbing hover:border-purple-400 transition"
                            >
                                <div>
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                                            #{task.workOrderNo || 'İş Emri Yok'}
                                        </span>
                                        <span className="text-[10px] font-black text-purple-600 dark:text-purple-400">
                                            ⏱️ {formatDurationHours(task.estimatedCamTime || 8)}
                                        </span>
                                    </div>
                                    <div className="font-extrabold text-xs text-gray-900 dark:text-white truncate" title={task.taskName}>
                                        {task.taskName}
                                    </div>
                                </div>

                                <div className="flex items-center gap-1.5 pt-1 border-t border-gray-100 dark:border-gray-700">
                                    <select
                                        defaultValue=""
                                        onChange={(e) => {
                                            if (e.target.value) {
                                                handleAssignUnplannedTask(task, e.target.value, task.assignedOperator, task.estimatedCamTime);
                                            }
                                        }}
                                        className="flex-1 py-1 px-1.5 text-[11px] font-bold bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-800 dark:text-white outline-none focus:ring-1 focus:ring-purple-500"
                                    >
                                        <option value="">Tezgah Seç ve Ata...</option>
                                        {(machines || []).map(m => (
                                            <option key={m.id || m.name} value={m.name}>
                                                {m.name} ({m.type || 'CNC'})
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ======================================================== */}
            {/* 4. TEZGAH BAZLI ZAMAN ÇİZELGESİ (KOMPAKT VE KİLİTLİ TABLO) */}
            {/* ======================================================== */}
            <div className="flex-1 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xs overflow-hidden flex flex-col min-h-0 relative">
                
                {/* Ana Kaydırma Penceresi (X ve Y Senkronize Tek Container) */}
                <div className="flex-1 overflow-auto custom-scrollbar relative select-none">
                    <div style={{ minWidth: 240 + totalDays * dayWidth }}>
                        
                        {/* Başlık Satırı: Solda Tezgah Bilgisi, Sağda Günler */}
                        <div className="flex sticky top-0 z-40 bg-gray-100 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 shadow-2xs">
                            
                            {/* Sol Başlık: Tezgah Bilgisi */}
                            <div className="w-60 min-w-[240px] p-2.5 font-black text-xs text-gray-700 dark:text-gray-300 uppercase tracking-wider sticky left-0 z-50 bg-gray-100 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 flex items-center justify-between">
                                <span className="flex items-center gap-1.5">
                                    <Monitor className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                                    <span>Tezgah Listesi ({displayTimelineRows.length})</span>
                                </span>
                            </div>

                            {/* Sağ Başlık: Gün İsimleri ve Tarihleri */}
                            <div className="flex flex-1">
                                {timelineDays.map(d => (
                                    <div
                                        key={d.index}
                                        style={{ width: dayWidth }}
                                        className={`shrink-0 py-2 px-1 text-center border-r border-gray-200/80 dark:border-gray-700/80 text-xs ${
                                            d.isToday 
                                                ? 'bg-purple-100/70 dark:bg-purple-950/50 text-purple-900 dark:text-purple-200 font-black' 
                                                : d.isWeekend 
                                                    ? 'bg-gray-200/40 dark:bg-gray-800/40 text-gray-500 dark:text-gray-400' 
                                                    : 'text-gray-700 dark:text-gray-300 font-bold'
                                        }`}
                                    >
                                        <div className="text-[11px] leading-tight">{d.dateStr}</div>
                                        <div className={`text-[9px] uppercase tracking-wider ${d.isToday ? 'text-purple-700 dark:text-purple-300 font-black' : 'text-gray-400'}`}>
                                            {d.dayName} {d.isToday && '• Bugün'}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Tezgah Satırları (Her satır h-14 dar ve senkron) */}
                        <div className="divide-y divide-gray-200 dark:divide-gray-700/80">
                            {displayTimelineRows.length === 0 ? (
                                <div className="p-12 text-center text-gray-400 text-xs font-bold">
                                    Arama veya filtrelere uygun tezgah bulunamadı.
                                </div>
                            ) : (
                                displayTimelineRows.map(machine => {
                                    const isBusy = machine.status === 'BUSY';
                                    const hasQueue = machine.queuedJobs.length > 0;
                                    const isOverThisMachine = dragOverMachine === machine.name;

                                    return (
                                        <div 
                                            key={machine.id || machine.name}
                                            className={`flex h-14 transition-colors ${
                                                isOverThisMachine 
                                                    ? 'bg-purple-100/60 dark:bg-purple-950/60 ring-2 ring-purple-500 z-30' 
                                                    : 'hover:bg-gray-50/50 dark:hover:bg-gray-750/30'
                                            }`}
                                            onDragOver={(e) => {
                                                e.preventDefault();
                                                setDragOverMachine(machine.name);
                                            }}
                                            onDragLeave={() => {
                                                if (dragOverMachine === machine.name) setDragOverMachine(null);
                                            }}
                                            onDrop={async (e) => {
                                                e.preventDefault();
                                                setDragOverMachine(null);
                                                if (draggedItem && draggedItem.machineName !== machine.name) {
                                                    // Başka bir tezgaha taşı
                                                    await handleMoveJobToMachine(draggedItem.moldId, draggedItem.taskId, draggedItem.opId, machine.name);
                                                    setDraggedItem(null);
                                                }
                                            }}
                                        >
                                            {/* SOL KOLON: TEZGAH ADI & YÜK DURUMU (STICKY LEFT) */}
                                            <div className="w-60 min-w-[240px] px-2.5 py-1.5 sticky left-0 z-30 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col justify-center shadow-xs">
                                                <div className="flex items-center justify-between gap-1.5">
                                                    <div className="flex items-center gap-1.5 min-w-0">
                                                        <span className="font-extrabold text-xs text-gray-900 dark:text-white truncate" title={machine.name}>
                                                            {machine.name}
                                                        </span>
                                                        <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 uppercase shrink-0">
                                                            {machine.type}
                                                        </span>
                                                    </div>

                                                    {/* Durum Rozeti */}
                                                    {isBusy ? (
                                                        <span className="px-1.5 py-0.2 rounded-full text-[9px] font-black bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300 dark:border-amber-700/60 flex items-center gap-0.5 animate-pulse shrink-0">
                                                            <Zap size={9} /> DOLU
                                                        </span>
                                                    ) : hasQueue ? (
                                                        <span className="px-1.5 py-0.2 rounded-full text-[9px] font-black bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-700 shrink-0">
                                                            {machine.bars.length} İş
                                                        </span>
                                                    ) : (
                                                        <span className="px-1.5 py-0.2 rounded-full text-[9px] font-black bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 shrink-0">
                                                            BOŞ
                                                        </span>
                                                    )}
                                                </div>

                                                {/* Yük & Tahmini Boşalma Metni */}
                                                <div className="flex items-center justify-between text-[10px] text-gray-500 dark:text-gray-400 mt-0.5 font-medium">
                                                    <span>Yük: <strong className="text-purple-600 dark:text-purple-400">{formatDurationHours(machine.totalRemainingHours)}</strong></span>
                                                    <span className="truncate ml-1 font-bold text-gray-700 dark:text-gray-300" title={formatFreeAtDate(machine.freeAt)}>
                                                        {formatFreeAtDate(machine.freeAt)}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* SAĞ KOLON: ZAMAN ÇİZELGESİ ŞERİDİ VE İŞ BARLARI */}
                                            <div className="flex-1 relative h-14 overflow-hidden">
                                                
                                                {/* Dikey Gün Kılavuz Çizgileri */}
                                                <div className="absolute inset-0 flex pointer-events-none">
                                                    {timelineDays.map(d => (
                                                        <div
                                                            key={d.index}
                                                            style={{ width: dayWidth }}
                                                            className={`shrink-0 h-full border-r border-gray-100 dark:border-gray-800/80 ${
                                                                d.isWeekend ? 'bg-gray-50/40 dark:bg-gray-900/30' : ''
                                                            }`}
                                                        />
                                                    ))}
                                                </div>

                                                {/* Parça Barları */}
                                                {machine.bars.map((bar) => {
                                                    const isSelected = selectedMoldId && bar.moldId === selectedMoldId;
                                                    const isDimmed = selectedMoldId && bar.moldId !== selectedMoldId;
                                                    const colorScheme = getJobColor(bar.moldId, bar.orderIndex);

                                                    return (
                                                        <div
                                                            key={bar.id}
                                                            draggable
                                                            onDragStart={() => setDraggedItem({
                                                                moldId: bar.moldId,
                                                                taskId: bar.taskId,
                                                                opId: bar.opId,
                                                                machineName: machine.name,
                                                                time: bar.time
                                                            })}
                                                            onClick={() => openManageModal({
                                                                ...bar,
                                                                machineName: machine.name
                                                            })}
                                                            onMouseEnter={(e) => {
                                                                setHoveredJob(bar);
                                                                setMousePos({ x: e.clientX, y: e.clientY });
                                                            }}
                                                            onMouseMove={(e) => {
                                                                setMousePos({ x: e.clientX, y: e.clientY });
                                                            }}
                                                            onMouseLeave={() => setHoveredJob(null)}
                                                            style={{
                                                                left: `${bar.startHour * pxPerHour}px`,
                                                                width: `${bar.widthPx}px`
                                                            }}
                                                            className={`absolute top-2 h-10 rounded-xl px-2.5 flex items-center gap-1.5 cursor-pointer shadow-xs transition-all select-none ${
                                                                bar.isWorking
                                                                    ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white border-2 border-emerald-300 dark:border-emerald-200 shadow-md'
                                                                    : `${colorScheme.bg} ${colorScheme.text} border ${colorScheme.border}`
                                                            } ${
                                                                isSelected 
                                                                    ? 'ring-4 ring-yellow-400 dark:ring-yellow-300 shadow-2xl shadow-yellow-500/80 animate-pulse font-black scale-[1.03] z-20' 
                                                                    : isDimmed 
                                                                        ? 'opacity-35 grayscale-[25%] hover:opacity-100 hover:grayscale-0' 
                                                                        : 'hover:brightness-110 z-10'
                                                            }`}
                                                        >
                                                            {/* Tutamaç (Sürükleme ikonu) */}
                                                            <GripVertical className="w-3 h-3 opacity-60 shrink-0 cursor-grab active:cursor-grabbing" />

                                                            {/* Sıra / Çalışıyor İkonu */}
                                                            {bar.isWorking ? (
                                                                <span className="w-2 h-2 rounded-full bg-white animate-ping shrink-0" />
                                                            ) : (
                                                                <span className="text-[9px] font-black opacity-80 shrink-0">
                                                                    #{bar.orderIndex}
                                                                </span>
                                                            )}

                                                            {/* Seçili Kalıp Yıldızı */}
                                                            {isSelected && (
                                                                <span className="text-[9px] font-black px-1.5 py-0.2 rounded bg-yellow-400 text-slate-950 flex items-center gap-0.5 shrink-0 shadow-xs animate-bounce">
                                                                    <Star className="w-2.5 h-2.5 fill-current" />
                                                                </span>
                                                            )}

                                                            {/* İş Emri Numarası */}
                                                            {bar.workOrderNo && (
                                                                <span className="text-[9px] font-black px-1 py-0.2 rounded bg-black/30 text-white shrink-0 tracking-wider">
                                                                    #{bar.workOrderNo}
                                                                </span>
                                                            )}

                                                            {/* Parça Adı & Kalıp */}
                                                            <div className="flex-1 truncate text-xs font-black leading-tight">
                                                                <span>{bar.taskName}</span>
                                                                <span className="opacity-70 font-normal ml-1">({bar.moldName})</span>
                                                            </div>

                                                            {/* Süre */}
                                                            <span className="text-[9px] font-black opacity-90 shrink-0 bg-black/20 px-1.5 py-0.5 rounded">
                                                                {formatDurationHours(bar.time)}
                                                            </span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* ======================================================== */}
            {/* 5. MOUSE HOVER DETAY TOOLTIP KARTI */}
            {/* ======================================================== */}
            {hoveredJob && (
                <div
                    style={{
                        top: Math.min(window.innerHeight - 250, mousePos.y + 16),
                        left: Math.min(window.innerWidth - 320, mousePos.x + 16)
                    }}
                    className="fixed z-50 pointer-events-none bg-slate-950/95 text-white p-3.5 rounded-2xl border border-purple-500/50 shadow-2xl backdrop-blur-md w-72 space-y-2 animate-in fade-in zoom-in-95 duration-100"
                >
                    <div className="flex justify-between items-start gap-2 border-b border-slate-700 pb-2">
                        <div className="min-w-0">
                            {hoveredJob.workOrderNo && (
                                <span className="text-[9px] font-black px-2 py-0.5 rounded bg-blue-600 text-white tracking-wider uppercase mb-1 inline-block">
                                    İş Emri: #{hoveredJob.workOrderNo}
                                </span>
                            )}
                            <h4 className="font-black text-sm text-white truncate">
                                {hoveredJob.taskName}
                            </h4>
                            <div className="text-xs font-bold text-purple-300 truncate">
                                {hoveredJob.moldName} {hoveredJob.customer ? `(${hoveredJob.customer})` : ''}
                            </div>
                        </div>
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                            hoveredJob.isWorking ? 'bg-emerald-500 text-white' : 'bg-blue-600 text-white'
                        }`}>
                            {hoveredJob.isWorking ? `Çalışıyor (%${hoveredJob.progress})` : `${hoveredJob.orderIndex}. Sırada`}
                        </span>
                    </div>

                    <div className="text-[11px] space-y-1 text-slate-300">
                        <div className="flex justify-between">
                            <span className="text-slate-400">Operasyon:</span>
                            <strong className="text-white">{hoveredJob.opType}</strong>
                        </div>
                        {hoveredJob.subOperations && hoveredJob.subOperations.length > 0 && (
                            <div className="flex justify-between items-start gap-1">
                                <span className="text-slate-400">İşlemler:</span>
                                <span className="text-purple-300 font-bold text-right text-[10px]">
                                    {hoveredJob.subOperations.join(', ')}
                                </span>
                            </div>
                        )}
                        <div className="flex justify-between">
                            <span className="text-slate-400">CAM Operatörü:</span>
                            <strong className="text-white">{hoveredJob.camOperator || '-'}</strong>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-slate-400">Tahmini Süre:</span>
                            <strong className="text-purple-400 font-bold">{formatDurationHours(hoveredJob.time)}</strong>
                        </div>
                        <div className="flex justify-between pt-1 border-t border-slate-800 text-[10px]">
                            <span className="text-slate-400">Tahmini Bitiş:</span>
                            <strong className="text-yellow-300">
                                {hoveredJob.endDate ? formatDateTime(hoveredJob.endDate.toISOString()) : '-'}
                            </strong>
                        </div>
                    </div>
                </div>
            )}

            {/* ======================================================== */}
            {/* 6. HIZLI YÖNETİM & TEK TUŞLA TEZGAH DEĞİŞTİRME MODALI */}
            {/* ======================================================== */}
            {manageModal.isOpen && manageModal.job && (
                <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
                    <div className="bg-white dark:bg-gray-800 rounded-3xl border border-gray-200 dark:border-gray-700 shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
                        
                        {/* Modal Başlık */}
                        <div className="p-4 bg-gray-50 dark:bg-gray-700/60 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
                            <div>
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-black px-2 py-0.5 rounded bg-purple-100 text-purple-800 dark:bg-purple-900/60 dark:text-purple-200">
                                        PLANLAMA YÖNETİMİ
                                    </span>
                                    {manageModal.job.workOrderNo && (
                                        <span className="text-xs font-black text-blue-600 dark:text-blue-400">
                                            #{manageModal.job.workOrderNo}
                                        </span>
                                    )}
                                </div>
                                <h3 className="text-base font-black text-gray-900 dark:text-white mt-0.5">
                                    {manageModal.job.taskName}
                                </h3>
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                    {manageModal.job.moldName} {manageModal.job.customer ? `(${manageModal.job.customer})` : ''}
                                </p>
                            </div>

                            <button
                                onClick={() => setManageModal({ isOpen: false, job: null, targetMachine: '', targetCamOp: '', targetHours: '' })}
                                className="p-1.5 rounded-xl text-gray-400 hover:text-gray-700 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-gray-600 transition"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Modal Gövdesi */}
                        <div className="p-5 space-y-4 overflow-y-auto custom-scrollbar flex-1">
                            
                            {/* TEK TUŞLA TEZGAH DEĞİŞTİR */}
                            <div className="space-y-2">
                                <label className="text-xs font-black text-gray-700 dark:text-gray-300 uppercase tracking-wider flex items-center justify-between">
                                    <span className="flex items-center gap-1.5">
                                        <Zap className="w-4 h-4 text-amber-500" />
                                        <span>Tek Tuşla Tezgah Değiştir</span>
                                    </span>
                                    <span className="text-[11px] font-bold text-purple-600 dark:text-purple-400">
                                        Mevcut: {manageModal.job.machineName}
                                    </span>
                                </label>

                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                    {(machines || []).map(m => {
                                        const isCurrent = m.name === manageModal.job.machineName;
                                        return (
                                            <button
                                                key={m.id || m.name}
                                                type="button"
                                                onClick={() => handleMoveJobToMachine(manageModal.job.moldId, manageModal.job.taskId, manageModal.job.opId, m.name)}
                                                className={`p-2.5 rounded-xl text-xs font-black border transition-all text-left flex flex-col justify-between ${
                                                    isCurrent
                                                        ? 'bg-purple-600 text-white border-purple-700 shadow-md ring-2 ring-purple-300'
                                                        : 'bg-gray-50 dark:bg-gray-700 hover:bg-purple-50 dark:hover:bg-purple-950/40 text-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-600 hover:border-purple-400'
                                                }`}
                                            >
                                                <div className="flex justify-between items-center w-full">
                                                    <span className="truncate">{m.name}</span>
                                                    {isCurrent && <Check className="w-3.5 h-3.5 shrink-0" />}
                                                </div>
                                                <span className={`text-[10px] mt-1 ${isCurrent ? 'text-purple-200' : 'text-gray-400'}`}>
                                                    {m.type || 'CNC'}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* CAM OPERATÖRÜ & TAHMİNİ SÜRE DÜZENLEME */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-gray-200 dark:border-gray-700">
                                <div>
                                    <label className="text-xs font-bold text-gray-700 dark:text-gray-300 mb-1 block">
                                        CAM Sorumlusu:
                                    </label>
                                    <select
                                        value={manageModal.targetCamOp}
                                        onChange={e => setManageModal(prev => ({ ...prev, targetCamOp: e.target.value }))}
                                        className="w-full p-2 text-xs font-bold bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-purple-500 shadow-xs"
                                    >
                                        <option value="">Operatör Seçiniz...</option>
                                        {camOperators.map(cop => (
                                            <option key={cop.id || cop.name} value={cop.name}>{cop.name}</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="text-xs font-bold text-gray-700 dark:text-gray-300 mb-1 block">
                                        Tahmini CAM Süresi (Saat):
                                    </label>
                                    <input
                                        type="number"
                                        step="0.5"
                                        min="0.5"
                                        value={manageModal.targetHours}
                                        onChange={e => setManageModal(prev => ({ ...prev, targetHours: e.target.value }))}
                                        className="w-full p-2 text-xs font-bold bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-purple-500 shadow-xs"
                                    />
                                </div>
                            </div>

                            {/* KUYRUK SIRASI DEĞİŞTİRME */}
                            {!manageModal.job.isWorking && (
                                <div className="space-y-1.5 pt-2 border-t border-gray-200 dark:border-gray-700">
                                    <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block">
                                        Tezgah Kuyruk Önceliği:
                                    </label>
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            onClick={() => handleReorderQueue(manageModal.job.moldId, manageModal.job.taskId, 'top')}
                                            className="flex-1 py-2 px-3 rounded-xl bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 text-xs font-black transition flex items-center justify-center gap-1.5"
                                        >
                                            <ArrowUp className="w-3.5 h-3.5" /> Kuyrukta En Öne Al
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleReorderQueue(manageModal.job.moldId, manageModal.job.taskId, 'bottom')}
                                            className="flex-1 py-2 px-3 rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 text-xs font-black transition flex items-center justify-center gap-1.5"
                                        >
                                            <ArrowDown className="w-3.5 h-3.5" /> Kuyrukta En Arkaya Al
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* PLANDAN KALDIR */}
                            <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                                <button
                                    type="button"
                                    onClick={() => handleRemoveFromPlan(manageModal.job.moldId, manageModal.job.taskId, manageModal.job.opId)}
                                    className="w-full py-2 px-3 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-400 border border-red-200 dark:border-red-800 text-xs font-black transition flex items-center justify-center gap-1.5"
                                >
                                    <X className="w-4 h-4" /> Parçayı Tezgah Planından Kaldır
                                </button>
                            </div>
                        </div>

                        {/* Modal Alt Bar */}
                        <div className="p-4 bg-gray-50 dark:bg-gray-700/60 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setManageModal({ isOpen: false, job: null, targetMachine: '', targetCamOp: '', targetHours: '' })}
                                className="px-4 py-2 text-xs font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-xl transition"
                            >
                                Kapat
                            </button>
                            <button
                                type="button"
                                onClick={handleSaveManageModal}
                                className="px-5 py-2 text-xs font-black bg-purple-600 hover:bg-purple-700 text-white rounded-xl shadow-xs transition flex items-center gap-1.5"
                            >
                                <Check className="w-4 h-4" /> Değişiklikleri Kaydet
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ======================================================== */}
            {/* 7. TEZGAH FİLTRELEME & GRUP YÖNETİMİ MODALI (KALICI) */}
            {/* ======================================================== */}
            {isFilterModalOpen && (
                <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
                    <div className="bg-white dark:bg-gray-800 rounded-3xl border border-gray-200 dark:border-gray-700 shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[92vh]">
                        
                        {/* Modal Başlık */}
                        <div className="p-4 bg-gray-50 dark:bg-gray-700/60 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
                            <div>
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-black px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 dark:bg-indigo-900/60 dark:text-indigo-200 uppercase">
                                        TEZGAH VE GRUP FİLTRESİ
                                    </span>
                                    <span className="text-[11px] text-gray-500 dark:text-gray-400 font-bold">
                                        (Buluta kaydedilir, tüm kullanıcılar aynı filtreyi görür)
                                    </span>
                                </div>
                                <h3 className="text-base font-black text-gray-900 dark:text-white mt-0.5">
                                    Tezgah Filtreleme & Özel Gruplar
                                </h3>
                            </div>

                            <button
                                onClick={() => setIsFilterModalOpen(false)}
                                className="p-1.5 rounded-xl text-gray-400 hover:text-gray-700 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-gray-600 transition"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Sekme Butonları (Gruplar vs Tek Tek Seçim) */}
                        <div className="flex border-b border-gray-200 dark:border-gray-700 px-5 pt-3 gap-2 bg-gray-50/50 dark:bg-gray-800/40">
                            <button
                                type="button"
                                onClick={() => setFilterModalTab('GROUPS')}
                                className={`pb-2.5 px-3 text-xs font-black border-b-2 transition flex items-center gap-1.5 ${
                                    filterModalTab === 'GROUPS'
                                        ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                                        : 'border-transparent text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'
                                }`}
                            >
                                <FolderPlus className="w-4 h-4" />
                                <span>Tezgah Grupları ({machineGroups.length})</span>
                            </button>

                            <button
                                type="button"
                                onClick={() => setFilterModalTab('MACHINES')}
                                className={`pb-2.5 px-3 text-xs font-black border-b-2 transition flex items-center gap-1.5 ${
                                    filterModalTab === 'MACHINES'
                                        ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                                        : 'border-transparent text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'
                                }`}
                            >
                                <CheckSquare className="w-4 h-4" />
                                <span>Tek Tek Tezgah İşaretle ({machines?.length || 0})</span>
                            </button>
                        </div>

                        {/* Modal Gövdesi */}
                        <div className="p-5 space-y-4 overflow-y-auto custom-scrollbar flex-1">
                            
                            {/* SEKME 1: TEZGAH GRUPLARI */}
                            {filterModalTab === 'GROUPS' && (
                                <div className="space-y-4">
                                    
                                    {/* Yeni Grup Ekle veya Düzenle Kartı */}
                                    <div className="bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-800/60 p-4 rounded-2xl space-y-3">
                                        <div className="flex justify-between items-center">
                                            <h4 className="text-xs font-black text-indigo-900 dark:text-indigo-200 uppercase tracking-wider flex items-center gap-1.5">
                                                {editingGroup ? <Edit3 className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                                                <span>
                                                    {editingGroup?.id === '__ALL__'
                                                        ? '🌐 "Tüm Tezgahlar" Görünüm Listesini Düzenle'
                                                        : (editingGroup ? `Grubu Düzenle: ${editingGroup.name}` : 'Yeni Tezgah Grubu Oluştur')}
                                                </span>
                                            </h4>
                                            {editingGroup && (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setEditingGroup(null);
                                                        setNewGroupName('');
                                                        setNewGroupMachines([]);
                                                    }}
                                                    className="text-xs text-gray-500 hover:text-gray-700 font-bold"
                                                >
                                                    İptal Et
                                                </button>
                                            )}
                                        </div>

                                        <div className="space-y-2">
                                            {editingGroup?.id === '__ALL__' ? (
                                                <p className="text-xs text-gray-600 dark:text-gray-400 bg-white/70 dark:bg-gray-800/70 p-2.5 rounded-xl border border-indigo-100 dark:border-indigo-900/50 font-medium">
                                                    "Tüm Tezgahlar" filtresi seçildiğinde ekranda yer alacak tezgahları aşağıdan belirleyin. İşaretlenmeyen tezgahlar genel listeden gizlenir.
                                                </p>
                                            ) : (
                                                <input
                                                    type="text"
                                                    placeholder="Grup Adı (Örn: 5 Eksen Tezgahlar, Köprülü Tezgahlar...)"
                                                    value={newGroupName}
                                                    onChange={e => setNewGroupName(e.target.value)}
                                                    className="w-full p-2.5 text-xs font-bold bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 shadow-xs"
                                                />
                                            )}

                                            <div>
                                                <div className="flex justify-between items-center mb-1.5">
                                                    <span className="text-[11px] font-bold text-gray-600 dark:text-gray-300">
                                                        {editingGroup?.id === '__ALL__'
                                                            ? `"Tüm Tezgahlar" Görünümüne Dahil Edilecek Tezgahları İşaretleyin (${newGroupMachines.length} seçili):`
                                                            : `Bu Gruba Dahil Edilecek Tezgahları İşaretleyin (${newGroupMachines.length} seçili):`}
                                                    </span>
                                                    <div className="flex gap-2 text-[10px] font-bold">
                                                        <button
                                                            type="button"
                                                            onClick={() => setNewGroupMachines((machines || []).map(m => m.name))}
                                                            className="text-indigo-600 dark:text-indigo-400 hover:underline"
                                                        >
                                                            Tümünü Seç
                                                        </button>
                                                        <span>•</span>
                                                        <button
                                                            type="button"
                                                            onClick={() => setNewGroupMachines([])}
                                                            className="text-gray-500 hover:underline"
                                                        >
                                                            Temizle
                                                        </button>
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-36 overflow-y-auto custom-scrollbar p-1 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
                                                    {(machines || []).map(m => {
                                                        const isChecked = newGroupMachines.includes(m.name);
                                                        return (
                                                            <label
                                                                key={m.id || m.name}
                                                                className={`p-1.5 rounded-lg border text-xs font-bold cursor-pointer flex items-center gap-2 select-none transition ${
                                                                    isChecked
                                                                        ? 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-400 text-indigo-900 dark:text-indigo-100'
                                                                        : 'bg-gray-50 dark:bg-gray-700/40 border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300'
                                                                }`}
                                                            >
                                                                <input
                                                                    type="checkbox"
                                                                    checked={isChecked}
                                                                    onChange={() => {
                                                                        if (isChecked) {
                                                                            setNewGroupMachines(prev => prev.filter(x => x !== m.name));
                                                                        } else {
                                                                            setNewGroupMachines(prev => [...prev, m.name]);
                                                                        }
                                                                    }}
                                                                    className="w-3.5 h-3.5 text-indigo-600 rounded"
                                                                />
                                                                <span className="truncate">{m.name}</span>
                                                            </label>
                                                        );
                                                    })}
                                                </div>
                                            </div>

                                            <div className="flex justify-end pt-1">
                                                <button
                                                    type="button"
                                                    onClick={handleSaveGroup}
                                                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black transition flex items-center gap-1.5 shadow-xs"
                                                >
                                                    <Check className="w-4 h-4" />
                                                    <span>
                                                        {editingGroup?.id === '__ALL__'
                                                            ? '"Tüm Tezgahlar" Listesini Güncelle ve Kaydet'
                                                            : (editingGroup ? 'Grubu Güncelle ve Kaydet' : 'Yeni Grubu Kaydet')}
                                                    </span>
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Mevcut Gruplar Listesi */}
                                    <div className="space-y-2">
                                        <h4 className="text-xs font-black text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                                            Tanımlı Tezgah Grupları & Genel Liste:
                                        </h4>

                                        {/* Sabit Ana Görünüm: Tüm Tezgahlar (Özelleştirilebilir) */}
                                        <div
                                            className={`p-3.5 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                                                activeFilterType === 'ALL'
                                                    ? 'bg-indigo-50/80 dark:bg-indigo-950/40 border-indigo-400 dark:border-indigo-600 shadow-xs ring-1 ring-indigo-400'
                                                    : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'
                                            }`}
                                        >
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="font-black text-sm text-gray-900 dark:text-white flex items-center gap-1.5">
                                                        🌐 Tüm Tezgahlar (Ana Görünüm)
                                                    </span>
                                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300">
                                                        {allMachinesList.length} / {machines?.length || 0} Tezgah Dahil
                                                    </span>
                                                    {activeFilterType === 'ALL' && (
                                                        <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 flex items-center gap-1">
                                                            <Check className="w-3 h-3" /> ŞU AN AKTİF
                                                        </span>
                                                    )}
                                                </div>

                                                <div className="flex flex-wrap gap-1">
                                                    {allMachinesList.map(mName => (
                                                        <span
                                                            key={mName}
                                                            className="text-[10px] font-semibold px-2 py-0.2 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                                                        >
                                                            {mName}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* Aksiyon Butonları */}
                                            <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        handleSelectAllMachines();
                                                        setIsFilterModalOpen(false);
                                                    }}
                                                    className={`px-3 py-1.5 rounded-xl text-xs font-black transition ${
                                                        activeFilterType === 'ALL'
                                                            ? 'bg-emerald-600 text-white'
                                                            : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-2xs'
                                                    }`}
                                                >
                                                    {activeFilterType === 'ALL' ? 'Aktif Görünüm' : 'Bu Listeyi Uygula'}
                                                </button>

                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setEditingGroup({ id: '__ALL__', name: 'Tüm Tezgahlar (Ana Görünüm)', machineNames: allMachinesList });
                                                        setNewGroupName('Tüm Tezgahlar (Ana Görünüm)');
                                                        setNewGroupMachines(allMachinesList);
                                                    }}
                                                    className="p-1.5 text-gray-500 hover:text-indigo-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition"
                                                    title="Tüm Tezgahlar Listesini Düzenle"
                                                >
                                                    <Edit3 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>

                                        {machineGroups.length === 0 ? (
                                            <div className="p-6 text-center text-xs text-gray-400 border border-dashed rounded-2xl">
                                                Henüz bir tezgah grubu tanımlanmamış. Yukarıdaki formdan yeni grup ekleyebilirsiniz.
                                            </div>
                                        ) : (
                                            machineGroups.map(grp => {
                                                const isActive = activeFilterType === 'GROUP' && activeGroupId === grp.id;
                                                return (
                                                    <div
                                                        key={grp.id}
                                                        className={`p-3.5 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                                                            isActive
                                                                ? 'bg-indigo-50/80 dark:bg-indigo-950/40 border-indigo-400 dark:border-indigo-600 shadow-xs ring-1 ring-indigo-400'
                                                                : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'
                                                        }`}
                                                    >
                                                        <div className="space-y-1">
                                                            <div className="flex items-center gap-2">
                                                                <span className="font-black text-sm text-gray-900 dark:text-white">
                                                                    {grp.name}
                                                                </span>
                                                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                                                                    {grp.machineNames.length} Tezgah
                                                                </span>
                                                                {isActive && (
                                                                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 flex items-center gap-1">
                                                                        <Check className="w-3 h-3" /> ŞU AN AKTİF
                                                                    </span>
                                                                )}
                                                            </div>

                                                            <div className="flex flex-wrap gap-1">
                                                                {grp.machineNames.map(mName => (
                                                                    <span
                                                                        key={mName}
                                                                        className="text-[10px] font-semibold px-2 py-0.2 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                                                                    >
                                                                        {mName}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        </div>

                                                        {/* Aksiyon Butonları */}
                                                        <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    handleSelectGroup(grp.id);
                                                                    setIsFilterModalOpen(false);
                                                                }}
                                                                className={`px-3 py-1.5 rounded-xl text-xs font-black transition ${
                                                                    isActive
                                                                        ? 'bg-emerald-600 text-white'
                                                                        : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-2xs'
                                                                }`}
                                                            >
                                                                {isActive ? 'Aktif Filtre' : 'Bu Grubu Uygula'}
                                                            </button>

                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    setEditingGroup(grp);
                                                                    setNewGroupName(grp.name);
                                                                    setNewGroupMachines(grp.machineNames);
                                                                }}
                                                                className="p-1.5 text-gray-500 hover:text-indigo-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition"
                                                                title="Grubu Düzenle"
                                                            >
                                                                <Edit3 className="w-4 h-4" />
                                                            </button>

                                                            <button
                                                                type="button"
                                                                onClick={() => handleDeleteGroup(grp.id)}
                                                                className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg transition"
                                                                title="Grubu Sil"
                                                            >
                                                                <Trash2 className="w-4 h-4" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* SEKME 2: TEK TEK TEZGAH İŞARETLEME */}
                            {filterModalTab === 'MACHINES' && (
                                <div className="space-y-3">
                                    <div className="flex justify-between items-center gap-2 flex-wrap">
                                        <div className="relative flex-1 min-w-[200px]">
                                            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-2.5 pointer-events-none" />
                                            <input
                                                type="text"
                                                placeholder="Tezgah adı veya tipi ara..."
                                                value={machineFilterSearch}
                                                onChange={e => setMachineFilterSearch(e.target.value)}
                                                className="w-full pl-8 pr-3 py-1.5 text-xs font-bold bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white outline-none focus:ring-1 focus:ring-indigo-500"
                                            />
                                        </div>

                                        <div className="flex gap-2">
                                            <button
                                                type="button"
                                                onClick={() => setSelectedMachineNames((machines || []).map(m => m.name))}
                                                className="px-2.5 py-1.5 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 text-gray-800 dark:text-gray-200 rounded-xl text-xs font-bold transition"
                                            >
                                                Tümünü İşaretle
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setSelectedMachineNames([])}
                                                className="px-2.5 py-1.5 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 text-gray-800 dark:text-gray-200 rounded-xl text-xs font-bold transition"
                                            >
                                                Tümünü Kaldır
                                            </button>
                                        </div>
                                    </div>

                                    {/* Tezgah Kontrol Listesi */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-72 overflow-y-auto custom-scrollbar p-1">
                                        {(machines || [])
                                            .filter(m => {
                                                if (!machineFilterSearch.trim()) return true;
                                                const term = machineFilterSearch.toLowerCase();
                                                return m.name.toLowerCase().includes(term) || (m.type || '').toLowerCase().includes(term);
                                            })
                                            .map(m => {
                                                const isChecked = selectedMachineNames.includes(m.name);
                                                return (
                                                    <label
                                                        key={m.id || m.name}
                                                        className={`p-2.5 rounded-xl border text-xs font-bold cursor-pointer flex items-center justify-between select-none transition ${
                                                            isChecked
                                                                ? 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-400 text-indigo-900 dark:text-indigo-100 shadow-2xs'
                                                                : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300'
                                                        }`}
                                                    >
                                                        <div className="flex items-center gap-2.5 min-w-0">
                                                            <input
                                                                type="checkbox"
                                                                checked={isChecked}
                                                                onChange={() => {
                                                                    if (isChecked) {
                                                                        setSelectedMachineNames(prev => prev.filter(x => x !== m.name));
                                                                    } else {
                                                                        setSelectedMachineNames(prev => [...prev, m.name]);
                                                                    }
                                                                }}
                                                                className="w-4 h-4 text-indigo-600 rounded"
                                                            />
                                                            <span className="font-extrabold truncate">{m.name}</span>
                                                        </div>
                                                        <span className="text-[10px] px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 uppercase shrink-0">
                                                            {m.type || 'CNC'}
                                                        </span>
                                                    </label>
                                                );
                                            })}
                                    </div>

                                    <div className="pt-2 flex justify-between items-center border-t border-gray-200 dark:border-gray-700">
                                        <span className="text-xs font-bold text-gray-600 dark:text-gray-300">
                                            Toplam {selectedMachineNames.length} / {machines?.length || 0} tezgah seçildi.
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => handleSaveCustomMachines(selectedMachineNames)}
                                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black transition flex items-center gap-1.5 shadow-xs"
                                        >
                                            <Check className="w-4 h-4" />
                                            <span>İşaretlenenleri Uygula ve Sabitle</span>
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Modal Alt Bar */}
                        <div className="p-4 bg-gray-50 dark:bg-gray-700/60 border-t border-gray-200 dark:border-gray-700 flex justify-between items-center">
                            <button
                                type="button"
                                onClick={handleSelectAllMachines}
                                className="px-3 py-1.5 text-xs font-bold text-gray-600 dark:text-gray-300 hover:text-red-600 transition"
                            >
                                Filtreleri Sıfırla (Tüm Tezgahları Göster)
                            </button>

                            <button
                                type="button"
                                onClick={() => setIsFilterModalOpen(false)}
                                className="px-5 py-2 text-xs font-black bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-900 rounded-xl hover:opacity-90 transition"
                            >
                                Kapat
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CamPlanningTab;