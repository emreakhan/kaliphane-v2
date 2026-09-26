// src/pages/CamDashboard.js

import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';

// İkonlar
import { 
    Edit2, PlayCircle, ChevronDown, ChevronUp, Box, Layers, Clock, Users, 
    ExternalLink, Monitor, Search, Settings, CheckCircle, Trash2, PlusCircle, 
    X, CheckSquare, Wrench, Truck, Calendar, Zap, Filter, 
    ShieldAlert, Activity, Plus, Maximize2, Cpu 
} from 'lucide-react'; 

// Sabitler
import { OPERATION_STATUS, PROJECT_COLLECTION, LOGISTICS_COLLECTION, LOGISTICS_STATUS } from '../config/constants.js';
import { db, doc, updateDoc, getDoc, collection, addDoc, getDocs, query, where } from '../config/firebase.js';

// Yardımcı Fonksiyonlar
import { 
    formatDateTime, getCurrentDateTimeString, formatDate, 
    formatDurationHours, splitHoursToDaysAndHours, calculateTotalHoursFromDaysAndHours,
    formatFreeAtDate 
} from '../utils/dateUtils.js';
import { getStatusClasses } from '../utils/styleUtils.js';

// Modallar
import ProgressUpdateModal from '../components/Modals/ProgressUpdateModal.js';
import CamReviewMachineOpModal from '../components/Modals/CamReviewMachineOpModal.js';
import AssignOperationModal from '../components/Modals/AssignOperationModal.js'; 
import AddOperationModal from '../components/Modals/AddOperationModal.js';
import ChangeOperatorModal from '../components/Modals/ChangeOperatorModal.js';
import CamPreparationModal from './CamPreparationModal.js';
import ViewToolRequestModal from '../components/Modals/ViewToolRequestModal.js';
import MachineGanttModal from '../components/Modals/MachineGanttModal.js';

const CamDashboard = ({ loggedInUser, projects, handleUpdateOperation, handleAddOperation, handleChangeMachineOperator, personnel, machines }) => {
    const [modalState, setModalState] = useState({ isOpen: false, type: null, data: null });
    const [activeTab, setActiveTab] = useState('active');
    const [expandedMoldId, setExpandedMoldId] = useState(null);
    const [groupMode, setGroupMode] = useState('mold'); // 'mold' veya 'machine'
    
    // --- CAM ÖN HAZIRLIK STATE'LERİ ---
    const [prepSubTab, setPrepSubTab] = useState('todo'); // 'todo' | 'completed'
    const [prepSearchTerm, setPrepSearchTerm] = useState('');
    const [prepMachineFilter, setPrepMachineFilter] = useState('');
    const [selectedPrepMold, setSelectedPrepMold] = useState(null);
    const [isCamPrepModalOpen, setIsCamPrepModalOpen] = useState(false);
    const [prepTask, setPrepTask] = useState(null);
    const [prepOperation, setPrepOperation] = useState(null);
    const [toolReqModal, setToolReqModal] = useState({ isOpen: false, moldId: null, taskId: null, moldName: '', taskName: '' });

    // --- TEZGAHA İLAVE PARÇA (MULTI-PART) STATE'LERİ ---
    const [multiPartModal, setMultiPartModal] = useState({ isOpen: false, machineName: '', machineOperatorName: '' });
    const [mpSearchTerm, setMpSearchTerm] = useState('');
    const [mpSelectedMold, setMpSelectedMold] = useState('');
    const [mpSelectedTasks, setMpSelectedTasks] = useState([]); // Çoklu parça seçimi için Dizi (Array)

    // --- CAM PLANLAMA & SORUMLU KALIPLAR STATE'LERİ ---
    const [plannedSubTab, setPlannedSubTab] = useState('molds'); // 'molds' | 'byMachine'
    const [byMachineFilter, setByMachineFilter] = useState('');
    const [byMachineOnlyMine, setByMachineOnlyMine] = useState(true);
    const [byMachineSearch, setByMachineSearch] = useState('');
    const [byMachineStatus, setByMachineStatus] = useState('ALL'); // 'ALL' | 'BUSY' | 'QUEUED'
    const [plannedSearch, setPlannedSearch] = useState('');
    const [plannedStatusFilter, setPlannedStatusFilter] = useState('ALL');
    const [plannedOnlyMyMolds, setPlannedOnlyMyMolds] = useState(true);
    const [selectedPlannedMoldId, setSelectedPlannedMoldId] = useState(null);
    const [showMachineLoadPanel, setShowMachineLoadPanel] = useState(true);
    const [machineFilterTerm, setMachineFilterTerm] = useState('');
    const [machineStatusFilter, setMachineStatusFilter] = useState('ALL'); // 'ALL' | 'AVAILABLE' | 'BUSY'
    const [isMachineGanttOpen, setIsMachineGanttOpen] = useState(false);
    const [quickPlanModal, setQuickPlanModal] = useState({ 
        isOpen: false, 
        mold: null, 
        task: null, 
        operation: null,
        machineName: '', 
        camDays: '', 
        camHours: '',
        operatorName: ''
    });

    const activePreparedTasks = useMemo(() => {
        if (!projects) return [];
        return projects.flatMap(p => 
            (p.tasks || []).filter(t => {
                if (!t.camPreparation || t.camPreparation.status !== 'HAZIRLANDI') return false;
                // Eğer parçanın tüm imalat operasyonları tamamlanmış ise (işleme bitti ise) listede gösterme
                const hasActiveOps = (t.operations || []).length === 0 || t.operations.some(op => op.status !== OPERATION_STATUS.COMPLETED);
                return hasActiveOps;
            }).map(t => ({
                ...t,
                moldId: p.id,
                moldName: p.moldName,
                customer: p.customer
            }))
        );
    }, [projects]);

    const groupedActiveWork = useMemo(() => {
        const groups = {};
        projects.forEach(mold => {
            mold.tasks.forEach(task => {
                if (!task.operations) return;
                task.operations.forEach(op => {
                    const isAssigned = op.assignedOperator === loggedInUser.name;
                    const isActive = op.status !== OPERATION_STATUS.NOT_STARTED && op.status !== OPERATION_STATUS.COMPLETED;
                    
                    if (isAssigned && isActive) {
                        if (!groups[mold.id]) {
                            groups[mold.id] = {
                                moldInfo: { id: mold.id, name: mold.moldName, customer: mold.customer, deadline: mold.moldDeadline },
                                operations: []
                            };
                        }
                        groups[mold.id].operations.push({
                            ...op, taskName: task.taskName, taskId: task.id, moldId: mold.id, moldName: mold.moldName, customer: mold.customer
                        });
                    }
                });
            });
        });
        return Object.values(groups).sort((a, b) => {
            const aActive = a.operations.some(o => o.status === OPERATION_STATUS.IN_PROGRESS);
            const bActive = b.operations.some(o => o.status === OPERATION_STATUS.IN_PROGRESS);
            return bActive - aActive; 
        });
    }, [projects, loggedInUser.name]);

    const activeWorkByMachine = useMemo(() => {
        const groups = {};
        projects.forEach(mold => {
            mold.tasks?.forEach(task => {
                if (!task.operations) return;
                task.operations.forEach(op => {
                    const isAssigned = op.assignedOperator === loggedInUser.name;
                    const isActive = op.status !== OPERATION_STATUS.NOT_STARTED && op.status !== OPERATION_STATUS.COMPLETED;
                    
                    if (isAssigned && isActive) {
                        const machine = op.machineName || "Belirtilmemiş";
                        if (!groups[machine]) {
                            groups[machine] = {
                                machineName: machine,
                                operations: []
                            };
                        }
                        groups[machine].operations.push({
                            ...op,
                            taskName: task.taskName,
                            taskId: task.id,
                            moldId: mold.id,
                            moldName: mold.moldName,
                            customer: mold.customer,
                            moldDeadline: mold.moldDeadline
                        });
                    }
                });
            });
        });
        return Object.values(groups).sort((a, b) => {
            const aActive = a.operations.some(o => o.status === OPERATION_STATUS.IN_PROGRESS);
            const bActive = b.operations.some(o => o.status === OPERATION_STATUS.IN_PROGRESS);
            return bActive - aActive || a.machineName.localeCompare(b.machineName);
        });
    }, [projects, loggedInUser.name]);


    const activeDisplayData = groupMode === 'mold' ? groupedActiveWork : activeWorkByMachine;

    // --- YENİ CAM PLANLAMA & TEZGAH KAPASİTE HESAPLAMALARI ---
    // 1. CAM Sorumlusu olduğumuz kalıplar (veya tüm kalıplar)
    const camResponsibleMolds = useMemo(() => {
        if (!projects) return [];
        const userNameLower = (loggedInUser?.name || '').trim().toLowerCase();
        return projects.filter(p => {
            if (p.status === 'TAMAMLANDI') return false;
            if (plannedOnlyMyMolds) {
                return (p.camResponsible || '').trim().toLowerCase() === userNameLower;
            }
            return true;
        });
    }, [projects, plannedOnlyMyMolds, loggedInUser?.name]);

    // 2. Kalıp durum sayıları (Hızlı filtre butonları için)
    const plannedStatusCounts = useMemo(() => {
        const counts = { ALL: camResponsibleMolds.length };
        camResponsibleMolds.forEach(m => {
            const st = m.status || 'Belirtilmedi';
            counts[st] = (counts[st] || 0) + 1;
        });
        return counts;
    }, [camResponsibleMolds]);

    // 3. Durum ve Arama ile filtrelenmiş kalıplar
    const filteredPlannedMolds = useMemo(() => {
        return camResponsibleMolds.filter(m => {
            if (plannedStatusFilter !== 'ALL' && m.status !== plannedStatusFilter) {
                return false;
            }
            if (plannedSearch.trim()) {
                const term = plannedSearch.toLowerCase().trim();
                const matchName = (m.moldName || '').toLowerCase().includes(term);
                const matchCustomer = (m.customer || '').toLowerCase().includes(term);
                const matchCode = (m.projectCode || '').toLowerCase().includes(term);
                const matchTask = (m.tasks || []).some(t => (t.taskName || '').toLowerCase().includes(term));
                return matchName || matchCustomer || matchCode || matchTask;
            }
            return true;
        });
    }, [camResponsibleMolds, plannedStatusFilter, plannedSearch]);

    // 4. Tezgah Doluluk ve Kapasite Analizi (Operasyon Bazlı & Tahmini Boşa Çıkış Tarihli)
    const machineLoadList = useMemo(() => {
        return (machines || []).map(m => {
            let activeJob = null;
            let queuedJobs = [];
            let totalHours = 0;

            (projects || []).forEach(p => {
                if (p.status === 'TAMAMLANDI') return;
                (p.tasks || []).forEach(t => {
                    const estTaskTime = parseFloat(t.estimatedCamTime) || 0;
                    
                    // 1. Aktif çalışan işi bul
                    (t.operations || []).forEach(op => {
                        const isWorking = (op.machineName === m.name) && 
                            (op.status === OPERATION_STATUS.IN_PROGRESS || op.status === 'ÇALIŞIYOR');
                        if (isWorking && !activeJob) {
                            const opTime = parseFloat(op.estimatedCamTime) || estTaskTime || 8;
                            activeJob = {
                                moldId: p.id,
                                moldName: p.moldName,
                                customer: p.customer,
                                taskId: t.id,
                                taskName: t.taskName,
                                opId: op.id,
                                opType: op.type || 'İşleme',
                                workOrderNo: op.workOrderNo || t.workOrderNo || '',
                                subOperations: op.subOperations || [],
                                machineOperator: op.machineOperatorName || 'Belirtilmedi',
                                camOperator: op.assignedOperator || t.camResponsible || 'Belirtilmedi',
                                progress: op.progressPercentage || 0,
                                time: opTime,
                                startDate: op.startDate || null,
                                isActive: true
                            };
                            totalHours += opTime;
                        }
                    });

                    // 2. Bu tezgaha atanmış ve sırada bekleyen operasyonları bul (Ayrı ayrı operasyon planlaması)
                    let taskHasMatchedOp = false;
                    (t.operations || []).forEach(op => {
                        const isThisMachine = (op.machineName === m.name);
                        const isPending = op.status !== OPERATION_STATUS.COMPLETED && 
                                          op.status !== OPERATION_STATUS.IN_PROGRESS && 
                                          op.status !== 'ÇALIŞIYOR';
                        if (isThisMachine && isPending) {
                            taskHasMatchedOp = true;
                            const opTime = parseFloat(op.estimatedCamTime) || estTaskTime || 8;
                            queuedJobs.push({
                                moldId: p.id,
                                moldName: p.moldName,
                                customer: p.customer,
                                taskId: t.id,
                                taskName: t.taskName,
                                opId: op.id,
                                opType: op.type || 'İşleme',
                                workOrderNo: op.workOrderNo || t.workOrderNo || '',
                                subOperations: op.subOperations || [],
                                camOperator: op.assignedOperator || t.camResponsible || 'Belirtilmedi',
                                machineOperator: op.machineOperatorName || 'Belirtilmedi',
                                time: opTime,
                                status: op.status || 'BEKLİYOR',
                                isActive: false
                            });
                            totalHours += opTime;
                        }
                    });

                    // 3. Eğer operasyon bazlı tezgah seçilmemiş ama parça düzeyinde plannedMachine bu tezgah ise
                    if (!taskHasMatchedOp && t.plannedMachine === m.name) {
                        const isCompleted = t.operations?.length > 0 && t.operations.every(op => op.status === OPERATION_STATUS.COMPLETED);
                        const isAnyWorking = t.operations?.some(op => op.status === OPERATION_STATUS.IN_PROGRESS || op.status === 'ÇALIŞIYOR');
                        if (!isCompleted && !isAnyWorking) {
                            const pendingOp = t.operations?.find(op => op.status === OPERATION_STATUS.NOT_STARTED) || t.operations?.[0];
                            const opTime = parseFloat(pendingOp?.estimatedCamTime) || estTaskTime || 8;
                            queuedJobs.push({
                                moldId: p.id,
                                moldName: p.moldName,
                                customer: p.customer,
                                taskId: t.id,
                                taskName: t.taskName,
                                opId: pendingOp?.id || null,
                                opType: pendingOp?.type || 'İşleme',
                                workOrderNo: pendingOp?.workOrderNo || t.workOrderNo || '',
                                subOperations: pendingOp?.subOperations || [],
                                camOperator: pendingOp?.assignedOperator || t.camResponsible || 'Belirtilmedi',
                                machineOperator: pendingOp?.machineOperatorName || 'Belirtilmedi',
                                time: opTime,
                                status: pendingOp?.status || 'BEKLİYOR',
                                isActive: false
                            });
                            totalHours += opTime;
                        }
                    }
                });
            });

            // Tahmini boşa çıkış zamanı hesabı
            const activeRemainingHours = activeJob ? Math.max(0.5, activeJob.time * (1 - (activeJob.progress || 0) / 100)) : 0;
            const queuedRemainingHours = queuedJobs.reduce((acc, q) => acc + q.time, 0);
            const totalRemainingHours = Number((activeRemainingHours + queuedRemainingHours).toFixed(1));
            const freeAtDate = totalRemainingHours > 0 ? new Date(Date.now() + totalRemainingHours * 3600 * 1000) : null;

            return {
                id: m.id,
                name: m.name,
                type: m.type || 'CNC',
                activeJob,
                queuedJobs,
                totalHours: Number(totalHours.toFixed(1)),
                totalRemainingHours,
                freeAt: freeAtDate,
                status: activeJob ? 'BUSY' : (queuedJobs.length > 0 ? 'QUEUED' : 'AVAILABLE')
            };
        }).sort((a, b) => {
            if (a.activeJob && !b.activeJob) return -1;
            if (!a.activeJob && b.activeJob) return 1;
            return b.totalHours - a.totalHours || a.name.localeCompare(b.name, undefined, { numeric: true });
        });
    }, [machines, projects]);

    // 5. Tezgah Bazlı Planlanan Parçalar ve Operasyonlar (Yeni Sekme İçin)
    const plannedJobsByMachine = useMemo(() => {
        return (machines || []).map(machine => {
            const jobs = [];

            (projects || []).forEach(p => {
                if (p.status === 'TAMAMLANDI') return;
                const isMyMold = (p.camResponsible || '').trim().toLowerCase() === (loggedInUser?.name || '').trim().toLowerCase();
                if (byMachineOnlyMine && !isMyMold) return;

                (p.tasks || []).forEach(t => {
                    const estTaskTime = parseFloat(t.estimatedCamTime) || 0;

                    // 1. Bu tezgaha atanmış operasyonlar
                    let taskMatchedOp = false;
                    (t.operations || []).forEach(op => {
                        if (op.machineName === machine.name && op.status !== OPERATION_STATUS.COMPLETED) {
                            taskMatchedOp = true;
                            const isWorking = op.status === OPERATION_STATUS.IN_PROGRESS || op.status === 'ÇALIŞIYOR';
                            const opTime = parseFloat(op.estimatedCamTime) || estTaskTime || 8;
                            
                            jobs.push({
                                id: `${t.id}-${op.id}`,
                                mold: p,
                                task: t,
                                operation: op,
                                moldName: p.moldName,
                                customer: p.customer,
                                taskName: t.taskName,
                                opType: op.type || 'İşleme',
                                workOrderNo: op.workOrderNo || t.workOrderNo || '',
                                subOperations: op.subOperations || [],
                                camOperator: op.assignedOperator || t.camResponsible || 'Belirtilmedi',
                                machineOperator: op.machineOperatorName || 'Belirtilmedi',
                                isMyMold,
                                isWorking,
                                time: opTime,
                                status: op.status || 'BEKLİYOR',
                                progress: op.progressPercentage || 0,
                                startDate: op.startDate || null
                            });
                        }
                    });

                    // 2. Parça düzeyinde planlananlar (operasyon bazında atanmamışsa)
                    if (!taskMatchedOp && t.plannedMachine === machine.name) {
                        const isCompleted = t.operations?.length > 0 && t.operations.every(op => op.status === OPERATION_STATUS.COMPLETED);
                        const isAnyWorking = t.operations?.some(op => op.status === OPERATION_STATUS.IN_PROGRESS || op.status === 'ÇALIŞIYOR');
                        if (!isCompleted && !isAnyWorking) {
                            const pendingOp = t.operations?.find(op => op.status === OPERATION_STATUS.NOT_STARTED) || t.operations?.[0] || null;
                            const opTime = parseFloat(pendingOp?.estimatedCamTime) || estTaskTime || 8;
                            jobs.push({
                                id: `${t.id}-task`,
                                mold: p,
                                task: t,
                                operation: pendingOp,
                                moldName: p.moldName,
                                customer: p.customer,
                                taskName: t.taskName,
                                opType: pendingOp?.type || 'İşleme',
                                workOrderNo: pendingOp?.workOrderNo || t.workOrderNo || '',
                                subOperations: pendingOp?.subOperations || [],
                                camOperator: pendingOp?.assignedOperator || t.camResponsible || 'Belirtilmedi',
                                machineOperator: pendingOp?.machineOperatorName || 'Belirtilmedi',
                                isMyMold,
                                isWorking: false,
                                time: opTime,
                                status: pendingOp?.status || 'BEKLİYOR',
                                progress: 0,
                                startDate: null
                            });
                        }
                    }
                });
            });

            // Filtreleme: Arama ve Durum
            const filteredJobs = jobs.filter(job => {
                if (byMachineStatus === 'BUSY' && !job.isWorking) return false;
                if (byMachineStatus === 'QUEUED' && job.isWorking) return false;

                if (byMachineSearch.trim()) {
                    const term = byMachineSearch.toLowerCase().trim();
                    const matchMold = (job.moldName || '').toLowerCase().includes(term);
                    const matchTask = (job.taskName || '').toLowerCase().includes(term);
                    const matchCust = (job.customer || '').toLowerCase().includes(term);
                    const matchWo = (job.workOrderNo || '').toLowerCase().includes(term);
                    const matchOp = (job.opType || '').toLowerCase().includes(term);
                    return matchMold || matchTask || matchCust || matchWo || matchOp;
                }
                return true;
            });

            // Sıralama: Çalışan en başta, sonra bekleyenler
            filteredJobs.sort((a, b) => {
                if (a.isWorking && !b.isWorking) return -1;
                if (!a.isWorking && b.isWorking) return 1;
                return 0;
            });

            const activeJob = filteredJobs.find(j => j.isWorking);
            const queuedJobs = filteredJobs.filter(j => !j.isWorking);
            const totalHours = filteredJobs.reduce((sum, j) => sum + j.time, 0);

            // Tahmini boşa çıkış
            const activeRemaining = activeJob ? Math.max(0.5, activeJob.time * (1 - (activeJob.progress || 0) / 100)) : 0;
            const queuedRemaining = queuedJobs.reduce((sum, j) => sum + j.time, 0);
            const totalRemaining = Number((activeRemaining + queuedRemaining).toFixed(1));
            const freeAtDate = totalRemaining > 0 ? new Date(Date.now() + totalRemaining * 3600 * 1000) : null;

            return {
                id: machine.id,
                name: machine.name,
                type: machine.type || 'CNC',
                jobs: filteredJobs,
                allJobsCount: jobs.length,
                activeJob,
                queuedJobs,
                totalHours,
                totalRemaining,
                freeAt: freeAtDate,
                hasJobs: filteredJobs.length > 0,
                status: activeJob ? 'BUSY' : (queuedJobs.length > 0 ? 'QUEUED' : 'AVAILABLE')
            };
        }).sort((a, b) => {
            if (a.hasJobs && !b.hasJobs) return -1;
            if (!a.hasJobs && b.hasJobs) return 1;
            return a.name.localeCompare(b.name, undefined, { numeric: true });
        });
    }, [machines, projects, loggedInUser, byMachineOnlyMine, byMachineSearch, byMachineStatus]);

    const totalPlannedJobsCount = useMemo(() => {
        return plannedJobsByMachine.reduce((acc, m) => acc + m.jobs.length, 0);
    }, [plannedJobsByMachine]);

    const byMachineSummary = useMemo(() => {
        const activeMachines = plannedJobsByMachine.filter(m => m.hasJobs).length;
        const workingCount = plannedJobsByMachine.reduce((acc, m) => acc + (m.activeJob ? 1 : 0), 0);
        const totalHours = plannedJobsByMachine.reduce((acc, m) => acc + m.totalHours, 0);
        return {
            activeMachines,
            workingCount,
            totalHours
        };
    }, [plannedJobsByMachine]);

    const displayedMachines = useMemo(() => {
        return plannedJobsByMachine.filter(m => {
            if (byMachineFilter) {
                return m.name === byMachineFilter;
            }
            return m.hasJobs;
        });
    }, [plannedJobsByMachine, byMachineFilter]);

    const handleOpenAssignModal = (targetMold, targetTask, targetOperation) => {
        setModalState({
            isOpen: true,
            type: 'resume',
            data: {
                mold: targetMold,
                task: targetTask,
                operation: targetOperation
            }
        });
    };

    const handleOpenAddOperationModal = (targetMold, targetTask) => {
        setModalState({
            isOpen: true,
            type: 'add_operation',
            data: {
                mold: targetMold,
                task: targetTask,
                operation: null
            }
        });
    };

    // Hızlı Tezgah Planlama Modalı Aç (Parça veya Operasyon Düzeyinde)
    const handleQuickPlanClick = (targetMold, targetTask, targetOperation = null) => {
        const existingHours = targetOperation 
            ? (targetOperation.estimatedCamTime || targetTask.estimatedCamTime || '') 
            : (targetTask.estimatedCamTime || '');
        const split = splitHoursToDaysAndHours(existingHours);
        
        setQuickPlanModal({
            isOpen: true,
            mold: targetMold,
            task: targetTask,
            operation: targetOperation,
            machineName: targetOperation?.machineName || targetTask.plannedMachine || '',
            camDays: split.days,
            camHours: split.hours,
            operatorName: targetOperation?.assignedOperator || targetTask.assignedOperator || loggedInUser.name
        });
    };

    // Hızlı Tezgah Planlama Kaydet (Operasyon veya Parça Bazlı)
    const handleSaveQuickPlan = async () => {
        const { mold: targetMold, task: targetTask, operation: targetOp, machineName, camDays, camHours, operatorName } = quickPlanModal;
        if (!targetMold || !targetTask) return;

        if (!machineName) {
            alert("Lütfen hedef tezgahı seçiniz.");
            return;
        }

        const totalHours = calculateTotalHoursFromDaysAndHours(camDays, camHours);
        if (totalHours <= 0) {
            alert("Lütfen öngörülen CAM işleme süresini belirtin (en az Gün veya Saat).");
            return;
        }

        try {
            const moldRef = doc(db, PROJECT_COLLECTION, targetMold.id);
            const updatedTasks = (targetMold.tasks || []).map(t => {
                if (t.id === targetTask.id) {
                    let updatedOps = [...(t.operations || [])];

                    if (targetOp) {
                        // 1. Belirli bir ek operasyon için tezgah planlaması
                        updatedOps = updatedOps.map((op, idx) => {
                            const isMatch = (targetOp.id && op.id === targetOp.id) ||
                                            (targetOp.workOrderNo && op.workOrderNo === targetOp.workOrderNo) ||
                                            (idx === targetMold.tasks.find(x => x.id === t.id)?.operations?.findIndex(o => o.id === targetOp.id));
                            if (isMatch) {
                                return {
                                    ...op,
                                    machineName: machineName,
                                    estimatedCamTime: totalHours,
                                    assignedOperator: operatorName || loggedInUser.name
                                };
                            }
                            return op;
                        });
                    } else {
                        // 2. Parça düzeyinde planlama: İlk henüz başlamamış operasyonu da güncelle
                        updatedOps = updatedOps.map((op, idx) => {
                            if (idx === 0 && (op.status === OPERATION_STATUS.NOT_STARTED || !op.status)) {
                                return {
                                    ...op,
                                    machineName: machineName,
                                    estimatedCamTime: totalHours,
                                    assignedOperator: operatorName || loggedInUser.name
                                };
                            }
                            return op;
                        });
                    }

                    // Parçanın toplam CAM süresini hesapla
                    const sumOpsTime = updatedOps.reduce((sum, o) => sum + (parseFloat(o.estimatedCamTime) || 0), 0);
                    const finalCamTime = sumOpsTime > 0 ? sumOpsTime : totalHours;

                    return {
                        ...t,
                        plannedMachine: targetOp ? (t.plannedMachine || machineName) : machineName,
                        estimatedCamTime: finalCamTime,
                        assignedOperator: operatorName || loggedInUser.name,
                        camOperator: operatorName || loggedInUser.name,
                        operations: updatedOps
                    };
                }
                return t;
            });

            await updateDoc(moldRef, { tasks: updatedTasks });
            setQuickPlanModal({ 
                isOpen: false, 
                mold: null, 
                task: null, 
                operation: null, 
                machineName: '', 
                camDays: '', 
                camHours: '', 
                operatorName: '' 
            });
        } catch (err) {
            console.error("Tezgah planlama hatası:", err);
            alert("Planlama kaydedilirken hata oluştu: " + err.message);
        }
    };

    const toggleExpand = (moldId) => { setExpandedMoldId(prev => prev === moldId ? null : moldId); };

    const handleProgressClick = (moldId, moldName, taskId, taskName, operation) => {
        setModalState({ isOpen: true, type: 'progress', data: { mold: { id: moldId, moldName }, task: { id: taskId, taskName }, operation } });
    };

    const handleResumeClick = (moldId, moldName, taskId, taskName, operation) => {
        setModalState({ isOpen: true, type: 'resume', data: { mold: { id: moldId, moldName }, task: { id: taskId, taskName }, operation } });
    };

    const handleChangeOperatorClick = (moldId, moldName, taskId, taskName, operation) => {
        setModalState({ isOpen: true, type: 'change_operator', data: { mold: { id: moldId, moldName }, task: { id: taskId, taskName }, operation } });
    };

    const handleNeedsMachineOpReview = (operationWithProgress) => {
        setModalState(prevState => ({ isOpen: true, type: 'cam_review', data: { ...prevState.data, operation: operationWithProgress } }));
    };
    
    const handleCloseModal = () => { setModalState({ isOpen: false, type: null, data: null }); };
    
    const handleProgressSubmit = async (moldId, taskId, updatedOperation, actionType = null, pauseReason = null) => {
        let finalOperation = { ...updatedOperation };
        if (finalOperation.progressPercentage === 100) {
            finalOperation.status = OPERATION_STATUS.COMPLETED;
            if (!finalOperation.finishDate) finalOperation.finishDate = new Date().toISOString();
        }
        await handleUpdateOperation(moldId, taskId, finalOperation, actionType, pauseReason);
        handleCloseModal();
    };

    const handleSubmitChangeOperator = async (moldId, taskId, opId, newOperatorName, rating, comment) => {
        await handleChangeMachineOperator(moldId, taskId, opId, newOperatorName, rating, comment);
        handleCloseModal();
    };

    const handleSaveCamPrep = async (moldId, taskId, camPrepData, targetOpId = null) => {
        try {
            const moldRef = doc(db, PROJECT_COLLECTION, moldId);
            const moldToUpdate = projects.find(p => p.id === moldId);
            if (!moldToUpdate) return;
            
            const taskToUpdate = moldToUpdate.tasks?.find(t => t.id === taskId);
            if (!taskToUpdate) return;

            const updatedOps = taskToUpdate.operations?.map(op => {
                if (targetOpId && op.id === targetOpId) {
                    return {
                        ...op,
                        machineName: camPrepData.targetMachineName || op.machineName,
                        camPreparation: camPrepData
                    };
                }
                return op;
            }) || [];

            const updatedTasks = moldToUpdate.tasks.map(t => {
                if (t.id === taskId) {
                    return {
                        ...t,
                        camPreparation: camPrepData,
                        operations: updatedOps.length > 0 ? updatedOps : t.operations
                    };
                }
                return t;
            });

            await updateDoc(moldRef, { tasks: updatedTasks });

            // 1. FORKLİFT OPERATÖRÜ PANELİNE GÖREV DÜŞÜRME (LOGISTICS_COLLECTION)
            try {
                const logisticsColRef = collection(db, LOGISTICS_COLLECTION);
                const qLogistics = query(logisticsColRef, where("moldId", "==", moldId), where("referenceId", "==", taskId));
                const snapLogistics = await getDocs(qLogistics);

                if (!snapLogistics.empty) {
                    const existingLogDoc = snapLogistics.docs[0];
                    await updateDoc(doc(db, LOGISTICS_COLLECTION, existingLogDoc.id), {
                        toLocation: camPrepData.targetMachineName,
                        status: LOGISTICS_STATUS.PENDING,
                        updatedAt: getCurrentDateTimeString()
                    });
                } else {
                    await addDoc(logisticsColRef, {
                        type: 'CAM_PREPARATION',
                        moldId: moldId,
                        moldName: moldToUpdate.moldName,
                        referenceId: taskId,
                        itemName: `${taskToUpdate.taskName} (${moldToUpdate.moldName})`,
                        fromLocation: 'CAM Ön Hazırlık',
                        toLocation: camPrepData.targetMachineName,
                        status: LOGISTICS_STATUS.PENDING,
                        createdAt: getCurrentDateTimeString(),
                        qrCode: taskId,
                        requestedBy: loggedInUser?.name || 'CAM Operatörü'
                    });
                }
            } catch (forkliftErr) {
                console.error("Forklift görevi oluşturulurken hata:", forkliftErr);
            }

            // 2. TAKIMHANEYE TAKIM TALEBİ GÖNDERME (artifacts/default-app-id/public/data/toolRequests)
            try {
                if (camPrepData.requiredTools && camPrepData.requiredTools.length > 0) {
                    const toolRequestsColRef = collection(db, 'artifacts/default-app-id/public/data/toolRequests');
                    const qToolReq = query(toolRequestsColRef, where("moldId", "==", moldId), where("taskId", "==", taskId));
                    const snapToolReq = await getDocs(qToolReq);

                    const formattedTools = camPrepData.requiredTools.map(t => ({
                        id: t.toolId || t.id || Date.now().toString(),
                        toolName: (t.name || t.toolName || '').trim(),
                        holderType: (t.holderType || '').trim() || null,
                        length: (t.length || '').trim() || null,
                        shrinkLength: (t.shrinkLength || '').trim() || null,
                        isShrink: !!t.isShrink,
                        condition: t.condition || 'ANY',
                        status: 'PENDING',
                        notes: (t.notes || '').trim() || null
                    }));

                    if (!snapToolReq.empty) {
                        const existingReqDoc = snapToolReq.docs[0];
                        await updateDoc(doc(db, 'artifacts/default-app-id/public/data/toolRequests', existingReqDoc.id), {
                            machineName: camPrepData.targetMachineName,
                            status: 'EDITED',
                            notes: camPrepData.instructions || '',
                            tools: formattedTools,
                            updatedAt: new Date().toISOString()
                        });
                    } else {
                        const newToolRequest = {
                            requesterName: loggedInUser?.name || 'CAM Operatörü',
                            requesterRole: loggedInUser?.role || 'CAM Operatörü',
                            machineName: camPrepData.targetMachineName,
                            moldId: moldId,
                            moldName: moldToUpdate.moldName,
                            taskId: taskId,
                            taskName: taskToUpdate.taskName,
                            status: 'PENDING',
                            notes: camPrepData.instructions || '',
                            createdAt: new Date().toISOString(),
                            updatedAt: new Date().toISOString(),
                            tools: formattedTools,
                            messages: []
                        };
                        await addDoc(toolRequestsColRef, newToolRequest);
                    }
                }
            } catch (toolReqErr) {
                console.error("Takımhane talebi iletilirken hata:", toolReqErr);
            }

            alert("CAM Ön Hazırlık başarıyla kaydedildi! Forklift taşıma görevi ve Takımhane takım talebi otomatik oluşturuldu.");
            setSelectedPrepMold({ ...moldToUpdate, tasks: updatedTasks });
            setIsCamPrepModalOpen(false);
        } catch (error) {
            console.error(error); alert("Kaydedilirken bir hata oluştu.");
        }
    };

    const handleDeleteCamPrep = async (moldId, taskId) => {
        if (!window.confirm("Bu ön hazırlığı silmek istediğinize emin misiniz?")) return;
        try {
            const moldRef = doc(db, PROJECT_COLLECTION, moldId);
            const moldToUpdate = projects.find(p => p.id === moldId);
            if (!moldToUpdate) return;
            const updatedTasks = moldToUpdate.tasks.map(t => {
                if (t.id === taskId) { const newTask = { ...t }; delete newTask.camPreparation; return newTask; }
                return t;
            });
            await updateDoc(moldRef, { tasks: updatedTasks });
            alert("Ön hazırlık başarıyla silindi!");
            if (selectedPrepMold && selectedPrepMold.id === moldId) setSelectedPrepMold({ ...moldToUpdate, tasks: updatedTasks });
        } catch (error) { console.error(error); alert("Silinirken bir hata oluştu."); }
    };

    // --- TEZGAHA İLAVE ÇOKLU PARÇA EKLEME İŞLEMİ ---
    const toggleMpTask = (taskId) => {
        setMpSelectedTasks(prev => 
            prev.includes(taskId) ? prev.filter(id => id !== taskId) : [...prev, taskId]
        );
    };

    const submitMultiPart = async () => {
        if (!mpSelectedMold || mpSelectedTasks.length === 0) {
            alert("Lütfen ilave edilecek kalıbı ve en az bir parçayı seçiniz.");
            return;
        }

        try {
            const moldRef = doc(db, PROJECT_COLLECTION, mpSelectedMold);
            const moldSnap = await getDoc(moldRef);
            
            if (!moldSnap.exists()) {
                alert("Kalıp veritabanında bulunamadı.");
                return;
            }

            const currentMoldData = moldSnap.data();
            const currentTasks = currentMoldData.tasks || [];
            
            // Seçilen her bir taskId için tasks dizisini tek bir döngüde güncelleyelim (Senkronize olarak)
            const updatedTasks = currentTasks.map(task => {
                if (!mpSelectedTasks.includes(task.id)) {
                    return task;
                }

                const operations = task.operations || [];
                
                // Öncelikli olarak DURAKLATILDI veya BAŞLAMADI durumundaki mevcut operasyonu bul
                const existingOpIndex = operations.findIndex(op => op.status === OPERATION_STATUS.PAUSED) !== -1
                    ? operations.findIndex(op => op.status === OPERATION_STATUS.PAUSED)
                    : operations.findIndex(op => op.status === OPERATION_STATUS.NOT_STARTED);

                let updatedOperations = [...operations];

                if (existingOpIndex !== -1) {
                    const existingOp = operations[existingOpIndex];
                    updatedOperations[existingOpIndex] = {
                        ...existingOp,
                        machineName: multiPartModal.machineName,
                        assignedOperator: loggedInUser.name,
                        machineOperatorName: multiPartModal.machineOperatorName || "Bilinmiyor",
                        status: OPERATION_STATUS.IN_PROGRESS,
                        startDate: existingOp.startDate || new Date().toISOString(),
                        setupStartTime: existingOp.setupStartTime || new Date().toISOString(),
                        productionStartTime: new Date().toISOString()
                    };
                } else {
                    const newOpId = "op_" + Date.now().toString() + Math.random().toString(36).substr(2, 5);
                    const newOperationData = {
                        id: newOpId,
                        type: "CNC",
                        machineName: multiPartModal.machineName,
                        assignedOperator: loggedInUser.name,
                        machineOperatorName: multiPartModal.machineOperatorName || "Bilinmiyor",
                        status: OPERATION_STATUS.IN_PROGRESS,
                        startDate: new Date().toISOString(),
                        progressPercentage: 0,
                        setupStartTime: new Date().toISOString(),
                        productionStartTime: new Date().toISOString()
                    };
                    updatedOperations.push(newOperationData);
                }

                return {
                    ...task,
                    operations: updatedOperations
                };
            });

            // Tek bir updateDoc çağrısıyla veriyi veritabanına yazalım
            await updateDoc(moldRef, { tasks: updatedTasks });
            
            alert(`${multiPartModal.machineName} tezgahına ${mpSelectedTasks.length} adet ilave parça başarıyla bağlandı ve başlatıldı!`);
            
            // İşlem bitince modali ve state'leri temizle
            setMultiPartModal({ isOpen: false, machineName: '', machineOperatorName: '' });
            setMpSelectedMold('');
            setMpSelectedTasks([]);
            setMpSearchTerm('');
        } catch (err) {
            console.error("İlave parça eklenirken hata:", err);
            alert("Parçalar eklenirken bir hata oluştu: " + err.message);
        }
    };

    const { isOpen, type, data } = modalState;
    const { mold, task, operation } = data || {};

    return (
        <div className="p-4 bg-white dark:bg-gray-800 rounded-xl shadow-xl min-h-[80vh] relative flex flex-col">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 shrink-0">
                <div className="flex items-center gap-4 flex-wrap">
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center">
                        <Layers className="w-6 h-6 mr-2 text-blue-600" />
                        İşlerim
                    </h2>
                    {activeTab !== 'prep' && (
                        <div className="flex items-center bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5 text-xs font-bold shadow-inner">
                            <button
                                type="button"
                                onClick={() => { setGroupMode('mold'); setExpandedMoldId(null); }}
                                className={`px-3 py-1.5 rounded-md transition-all ${groupMode === 'mold' ? 'bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-400 shadow' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'}`}
                            >
                                Kalıba Göre
                            </button>
                            <button
                                type="button"
                                onClick={() => { setGroupMode('machine'); setExpandedMoldId(null); }}
                                className={`px-3 py-1.5 rounded-md transition-all ${groupMode === 'machine' ? 'bg-white dark:bg-gray-600 text-purple-600 dark:text-purple-400 shadow' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'}`}
                            >
                                Tezgaha Göre
                            </button>
                        </div>
                    )}
                </div>
                <div className="flex gap-2 bg-gray-100 dark:bg-gray-700 p-1 rounded-lg overflow-x-auto w-full md:w-auto">
                    <button onClick={() => setActiveTab('active')} className={`px-4 py-2 rounded-md text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'active' ? 'bg-white dark:bg-gray-600 shadow text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}`}>
                        Aktif Çalışan ({groupedActiveWork.length})
                    </button>
                    <button onClick={() => setActiveTab('planned')} className={`px-4 py-2 rounded-md text-sm font-bold transition-all whitespace-nowrap flex items-center relative ${activeTab === 'planned' ? 'bg-white dark:bg-gray-600 shadow text-purple-600 dark:text-purple-400' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}`}>
                        Planlanan İşler ({camResponsibleMolds.length})
                        {camResponsibleMolds.length > 0 && (
                            <span className="absolute -top-1 -right-1 flex h-3 w-3">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-3 w-3 bg-purple-500"></span>
                            </span>
                        )}
                    </button>
                    <button onClick={() => setActiveTab('prep')} className={`px-4 py-2 rounded-md text-sm font-bold transition-all whitespace-nowrap flex items-center ${activeTab === 'prep' ? 'bg-white dark:bg-gray-600 shadow text-green-600 dark:text-green-400' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}`}>
                        <Settings className="w-4 h-4 mr-2" /> Ön Hazırlık
                    </button>
                </div>
            </div>

            <div className="flex-1 min-h-0">
                {activeTab === 'active' ? (
                    activeDisplayData.length === 0 ? (
                        <div className="text-center py-12 bg-gray-50 dark:bg-gray-700 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-600">
                            <Box className="w-12 h-12 mx-auto text-gray-400 mb-3" />
                            <p className="text-gray-500 dark:text-gray-400 font-medium">Şu anda çalıştığınız aktif bir iş bulunmamaktadır.</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {activeDisplayData.map((group) => {
                                const groupId = groupMode === 'mold' ? group.moldInfo.id : group.machineName;
                                const isExpanded = expandedMoldId === groupId;
                                const activeCount = group.operations.filter(op => op.status === OPERATION_STATUS.IN_PROGRESS).length;
                                return (
                                    <div key={`active-${groupId}`} className={`border rounded-xl transition-all duration-300 overflow-hidden ${activeCount > 0 ? 'border-blue-500 shadow-md shadow-blue-100 dark:shadow-none' : 'border-gray-200 dark:border-gray-700'}`}>
                                        <div onClick={() => toggleExpand(groupId)} className={`p-4 cursor-pointer flex flex-col md:flex-row md:justify-between md:items-center gap-4 ${isExpanded ? 'bg-gray-50 dark:bg-gray-700/50' : 'bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
                                            <div className="flex items-center space-x-4 flex-1">
                                                <div className={`p-3 rounded-full flex-shrink-0 ${activeCount > 0 ? 'bg-blue-100 text-blue-600 animate-pulse' : 'bg-gray-100 text-gray-500 dark:bg-gray-600 dark:text-gray-300'}`}>
                                                    {groupMode === 'mold' ? <Box className="w-6 h-6" /> : <Monitor className="w-6 h-6" />}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <h3 className="text-lg font-bold text-gray-900 dark:text-white truncate">
                                                            {groupMode === 'mold' ? group.moldInfo.name : group.machineName}
                                                        </h3>
                                                        {groupMode === 'mold' && (
                                                            <Link to={`/mold/${group.moldInfo.id}`} onClick={(e) => e.stopPropagation()} className="inline-flex items-center px-2 py-1 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-blue-600 dark:text-blue-400 text-xs font-bold rounded transition">Detaya Git <ExternalLink className="w-3 h-3 ml-1" /></Link>
                                                        )}
                                                    </div>
                                                    <p className="text-sm text-gray-500 dark:text-gray-400 font-medium truncate">
                                                        {groupMode === 'mold' 
                                                            ? `${group.moldInfo.customer} • ` 
                                                            : ''
                                                        }
                                                        <span className="text-blue-600 dark:text-blue-400">{group.operations.length} Parça İşleniyor</span>
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex items-center space-x-4 flex-shrink-0">
                                                {activeCount > 0 && <span className="px-3 py-1 bg-green-100 text-green-800 text-xs font-bold rounded-full dark:bg-green-900 dark:text-green-200 flex items-center"><Clock className="w-3 h-3 mr-1" /> Aktif Çalışıyor</span>}
                                                {isExpanded ? <ChevronUp className="w-6 h-6 text-gray-400" /> : <ChevronDown className="w-6 h-6 text-gray-400" />}
                                            </div>
                                        </div>

                                        {isExpanded && (
                                            <div className="border-t border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 space-y-3 animation-slide-down">
                                                {group.operations.map(op => (
                                                    <div key={op.id} className={`p-4 border rounded-lg flex flex-col md:flex-row justify-between items-start md:items-center gap-4 ${op.status === OPERATION_STATUS.PAUSED ? 'bg-orange-50 border-orange-200 dark:bg-orange-900/10 dark:border-orange-700' : 'bg-gray-50 border-gray-200 dark:bg-gray-700/30 dark:border-gray-600'}`}>
                                                        <div className="flex-1">
                                                            <div className="flex items-center gap-2 mb-1">
                                                                <h4 className="font-bold text-gray-800 dark:text-white">{op.taskName}</h4>
                                                                <span className="px-2 py-0.5 bg-white dark:bg-gray-600 border border-gray-200 dark:border-gray-500 rounded text-xs font-bold text-gray-600 dark:text-gray-300">{op.type}</span>
                                                            </div>
                                                            <div className="text-xs text-gray-500 dark:text-gray-400 space-y-0.5">
                                                                <p>
                                                                    {groupMode === 'mold' 
                                                                        ? <>Tezgah: <span className="font-semibold">{op.machineName}</span></> 
                                                                        : <>Kalıp: <span className="font-semibold">{op.moldName} ({op.customer})</span></>
                                                                    }
                                                                    {" "}| Op: {op.machineOperatorName}
                                                                </p>
                                                                <p>Başlangıç: {formatDateTime(op.startDate)}</p>
                                                            </div>
                                                            <div className="w-full bg-gray-200 rounded-full h-2 dark:bg-gray-600 mt-2 max-w-xs">
                                                                <div className={`h-2 rounded-full ${op.status === OPERATION_STATUS.PAUSED ? 'bg-orange-500' : 'bg-blue-600'}`} style={{ width: `${op.progressPercentage}%` }}></div>
                                                            </div>
                                                        </div>

                                                        <div className="flex flex-col items-stretch gap-2 min-w-[160px]">
                                                            <div className="text-right">
                                                                <span className={`px-3 py-1 text-xs font-bold rounded-full inline-block mb-1 ${getStatusClasses(op.status)}`}>{op.status}</span>
                                                            </div>
                                                            
                                                            {op.status === OPERATION_STATUS.IN_PROGRESS && (
                                                                <div className="w-full flex flex-col gap-2">
                                                                    <button onClick={() => handleProgressClick(op.moldId, op.moldName, op.taskId, op.taskName, op)} className="w-full px-3 py-2 bg-green-600 text-white text-sm font-bold rounded-lg hover:bg-green-700 transition flex items-center justify-center shadow-sm">
                                                                        <Edit2 className="w-4 h-4 mr-1"/> Güncelle (%{op.progressPercentage})
                                                                    </button>
                                                                    <button onClick={() => setToolReqModal({ isOpen: true, moldId: op.moldId, taskId: op.taskId, moldName: op.moldName, taskName: op.taskName })} className="w-full px-3 py-2 bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold rounded-lg transition flex items-center justify-center shadow-sm">
                                                                        <Wrench className="w-4 h-4 mr-1"/> Takım Talebi
                                                                    </button>
                                                                    <button onClick={() => handleChangeOperatorClick(op.moldId, op.moldName, op.taskId, op.taskName, op)} className="w-full px-3 py-2 bg-purple-600 text-white text-xs font-bold rounded-lg hover:bg-purple-700 transition flex items-center justify-center shadow-sm">
                                                                        <Users className="w-4 h-4 mr-1"/> Operatör Değiştir
                                                                    </button>
                                                                    <button onClick={() => setMultiPartModal({ isOpen: true, machineName: op.machineName, machineOperatorName: op.machineOperatorName })} className="w-full px-3 py-2 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700 transition flex items-center justify-center shadow-sm border border-indigo-500">
                                                                        <PlusCircle className="w-4 h-4 mr-1"/> Bu Tezgaha Parça Ekle
                                                                    </button>
                                                                </div>
                                                            )}

                                                            {op.status === OPERATION_STATUS.PAUSED && (
                                                                <div className="w-full flex flex-col gap-2">
                                                                    <button onClick={() => handleResumeClick(op.moldId, op.moldName, op.taskId, op.taskName, op)} className="w-full px-3 py-2 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 transition flex items-center justify-center shadow-sm">
                                                                        <PlayCircle className="w-4 h-4 mr-1"/> Devam Et
                                                                    </button>
                                                                    <button onClick={() => setToolReqModal({ isOpen: true, moldId: op.moldId, taskId: op.taskId, moldName: op.moldName, taskName: op.taskName })} className="w-full px-3 py-2 bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold rounded-lg transition flex items-center justify-center shadow-sm">
                                                                        <Wrench className="w-4 h-4 mr-1"/> Takım Talebi
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )
                ) : activeTab === 'planned' ? (
                    <div className="space-y-4">
                        {/* ALT SEKME MENÜSÜ: Kalıp & Parça Planlama vs Tezgah Bazlı Planlanan İşler */}
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-gray-200 dark:border-gray-700/80 pb-3">
                            <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800/80 p-1 rounded-2xl border border-gray-200 dark:border-gray-700/60 shadow-xs">
                                <button
                                    type="button"
                                    onClick={() => setPlannedSubTab('molds')}
                                    className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 ${
                                        plannedSubTab === 'molds'
                                            ? 'bg-purple-600 text-white shadow-xs'
                                            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                                    }`}
                                >
                                    <Layers className="w-4 h-4" />
                                    <span>Kalıp & Parça Planlama</span>
                                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                                        plannedSubTab === 'molds' ? 'bg-purple-700 text-purple-100' : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                                    }`}>
                                        {camResponsibleMolds.length}
                                    </span>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => setPlannedSubTab('byMachine')}
                                    className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 ${
                                        plannedSubTab === 'byMachine'
                                            ? 'bg-purple-600 text-white shadow-xs'
                                            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                                    }`}
                                >
                                    <Cpu className="w-4 h-4" />
                                    <span>Tezgah Bazlı Planlanan İşler</span>
                                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                                        plannedSubTab === 'byMachine' ? 'bg-purple-700 text-purple-100' : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                                    }`}>
                                        {totalPlannedJobsCount}
                                    </span>
                                </button>
                            </div>

                            <button
                                type="button"
                                onClick={() => setIsMachineGanttOpen(true)}
                                className="px-3.5 py-2 rounded-xl text-xs font-black bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white shadow-xs transition flex items-center gap-2 shrink-0"
                            >
                                <Clock className="w-4 h-4" />
                                <span>Tezgah Zaman Çizelgesi (Gantt)</span>
                            </button>
                        </div>

                        {plannedSubTab === 'molds' ? (
                            <div className="space-y-4">
                                {/* ÜST FİLTRE VE ARAMA KONTROL PANELİ */}
                        <div className="bg-gray-50 dark:bg-gray-800/80 p-4 rounded-2xl border border-gray-200 dark:border-gray-700/80 shadow-xs space-y-3">
                            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                                {/* Kalıp / Müşteri / Parça Arama */}
                                <div className="relative flex-1 w-full">
                                    <Search className="absolute left-3.5 top-3 w-4 h-4 text-gray-400" />
                                    <input
                                        type="text"
                                        placeholder="Kalıp adı, müşteri, proje kodu veya parça ara..."
                                        value={plannedSearch}
                                        onChange={(e) => setPlannedSearch(e.target.value)}
                                        className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl text-xs font-bold text-gray-900 dark:text-white placeholder-gray-400 outline-none focus:ring-2 focus:ring-purple-500 shadow-inner"
                                    />
                                    {plannedSearch && (
                                        <button 
                                            onClick={() => setPlannedSearch('')}
                                            className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>

                                {/* Sorumluluk Toggle'ı & Tezgah Doluluk Paneli Butonu */}
                                <div className="flex items-center gap-2 w-full md:w-auto flex-wrap">
                                    <div className="flex bg-gray-200/80 dark:bg-gray-700/80 p-0.5 rounded-xl text-xs font-black shadow-inner">
                                        <button
                                            type="button"
                                            onClick={() => setPlannedOnlyMyMolds(true)}
                                            className={`px-3 py-1.5 rounded-lg transition-all ${plannedOnlyMyMolds ? 'bg-purple-600 text-white shadow-xs' : 'text-gray-600 dark:text-gray-300 hover:text-gray-900'}`}
                                        >
                                            Sorumlu Olduklarım ({projects.filter(p => p.status !== 'TAMAMLANDI' && (p.camResponsible || '').trim().toLowerCase() === (loggedInUser?.name || '').trim().toLowerCase()).length})
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setPlannedOnlyMyMolds(false)}
                                            className={`px-3 py-1.5 rounded-lg transition-all ${!plannedOnlyMyMolds ? 'bg-purple-600 text-white shadow-xs' : 'text-gray-600 dark:text-gray-300 hover:text-gray-900'}`}
                                        >
                                            Tüm Kalıplar ({projects.filter(p => p.status !== 'TAMAMLANDI').length})
                                        </button>
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() => setShowMachineLoadPanel(!showMachineLoadPanel)}
                                        className={`px-3 py-2 rounded-xl text-xs font-bold border transition flex items-center gap-1.5 shrink-0 ${
                                            showMachineLoadPanel 
                                                ? 'bg-purple-50 border-purple-300 text-purple-700 dark:bg-purple-950/40 dark:border-purple-800 dark:text-purple-300 shadow-xs' 
                                                : 'bg-white border-gray-300 text-gray-700 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200'
                                        }`}
                                        title="Tezgah Doluluk Durumları Panelini Aç/Kapat"
                                    >
                                        <Activity className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                                        <span className="hidden sm:inline">Tezgah Dolulukları</span>
                                    </button>
                                </div>
                            </div>

                            {/* Kalıp Durumları Hızlı Filtre Butonları */}
                            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-0.5 custom-scrollbar">
                                <span className="text-[11px] font-black text-gray-500 uppercase tracking-wider mr-1 flex items-center gap-1 shrink-0">
                                    <Filter className="w-3 h-3 text-gray-400" /> Durum:
                                </span>
                                
                                <button
                                    type="button"
                                    onClick={() => setPlannedStatusFilter('ALL')}
                                    className={`px-3 py-1 rounded-lg text-xs font-black transition-all shrink-0 select-none ${
                                        plannedStatusFilter === 'ALL'
                                            ? 'bg-purple-600 text-white shadow-xs'
                                            : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600 hover:bg-gray-100'
                                    }`}
                                >
                                    Tümü ({plannedStatusCounts.ALL || 0})
                                </button>

                                {Object.keys(plannedStatusCounts).filter(k => k !== 'ALL' && plannedStatusCounts[k] > 0).map(st => {
                                    const isSelected = plannedStatusFilter === st;
                                    return (
                                        <button
                                            key={st}
                                            type="button"
                                            onClick={() => setPlannedStatusFilter(st)}
                                            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all shrink-0 select-none flex items-center gap-1.5 ${
                                                isSelected
                                                    ? 'bg-purple-600 text-white shadow-xs font-black'
                                                    : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600 hover:bg-gray-100'
                                            }`}
                                        >
                                            <span>{st}</span>
                                            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${isSelected ? 'bg-white/30 text-white' : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300'}`}>
                                                {plannedStatusCounts[st]}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* ANA İÇERİK: SOL KALIP/PARÇA LİSTESİ - SAĞ TEZGAH DOLULUKLARI */}
                        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
                            {/* SOL SÜTUN: KALIPLAR VE PARÇALARI */}
                            <div className={showMachineLoadPanel ? "xl:col-span-8 space-y-4" : "xl:col-span-12 space-y-4"}>
                                {filteredPlannedMolds.length === 0 ? (
                                    <div className="text-center py-12 bg-gray-50 dark:bg-gray-700/40 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700">
                                        <Box className="w-12 h-12 mx-auto text-gray-400 mb-3 opacity-60" />
                                        <p className="text-gray-700 dark:text-gray-200 font-bold text-sm">Filtreye uygun kalıp bulunamadı.</p>
                                        {plannedOnlyMyMolds && (
                                            <button
                                                type="button"
                                                onClick={() => setPlannedOnlyMyMolds(false)}
                                                className="mt-3 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-black rounded-lg transition"
                                            >
                                                Tüm Kalıpları Göster
                                            </button>
                                        )}
                                    </div>
                                ) : (
                                    filteredPlannedMolds.map(moldItem => {
                                        const isExpanded = selectedPlannedMoldId === moldItem.id;
                                        const totalTasks = (moldItem.tasks || []).length;
                                        const completedTasks = (moldItem.tasks || []).filter(t => (t.operations || []).length > 0 && t.operations.every(op => op.status === OPERATION_STATUS.COMPLETED)).length;
                                        const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

                                        return (
                                            <div
                                                key={moldItem.id}
                                                className={`border rounded-2xl transition-all duration-200 overflow-hidden bg-white dark:bg-gray-800 ${
                                                    isExpanded 
                                                        ? 'border-purple-400 ring-2 ring-purple-400/20 shadow-md' 
                                                        : 'border-gray-200 dark:border-gray-700 hover:border-purple-300 dark:hover:border-purple-700 shadow-xs'
                                                }`}
                                            >
                                                {/* Kalıp Başlık Bloğu (Tıklanabilir) */}
                                                <div 
                                                    onClick={() => setSelectedPlannedMoldId(isExpanded ? null : moldItem.id)}
                                                    className={`p-4 cursor-pointer flex flex-col md:flex-row md:justify-between md:items-center gap-3 transition-colors ${
                                                        isExpanded ? 'bg-purple-50/50 dark:bg-purple-950/20' : 'hover:bg-gray-50/70 dark:hover:bg-gray-700/30'
                                                    }`}
                                                >
                                                    <div className="flex items-center space-x-3.5 flex-1 min-w-0">
                                                        <div className={`p-2.5 rounded-xl flex-shrink-0 ${isExpanded ? 'bg-purple-600 text-white' : 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300'}`}>
                                                            <Box className="w-5 h-5" />
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                <h3 className="text-base font-extrabold text-gray-900 dark:text-white truncate">
                                                                    {moldItem.moldName}
                                                                </h3>
                                                                <span className={`px-2 py-0.5 text-[10px] font-black rounded-full ${getStatusClasses(moldItem.status)}`}>
                                                                    {moldItem.status || 'Belirtilmedi'}
                                                                </span>
                                                                {moldItem.camResponsible && (
                                                                    <span className="text-[10px] font-black px-2 py-0.5 rounded bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                                                                        CAM: {moldItem.camResponsible}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400 mt-1 flex-wrap font-medium">
                                                                <span>Müşteri: <strong className="text-gray-800 dark:text-gray-200">{moldItem.customer || '-'}</strong></span>
                                                                {moldItem.moldDeadline && (
                                                                    <span>Termin: <strong className="text-gray-800 dark:text-gray-200">{formatDate(moldItem.moldDeadline)}</strong></span>
                                                                )}
                                                                <span>İlerleme: <strong className="text-purple-600 dark:text-purple-400">{completedTasks}/{totalTasks} Parça (%{progress})</strong></span>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center space-x-2 shrink-0 self-end md:self-center">
                                                        <Link 
                                                            to={`/mold/${moldItem.id}`} 
                                                            onClick={(e) => e.stopPropagation()} 
                                                            className="inline-flex items-center px-2.5 py-1 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-blue-600 dark:text-blue-400 text-xs font-bold rounded-lg transition"
                                                        >
                                                            Kalıp Sayfası <ExternalLink className="w-3 h-3 ml-1" />
                                                        </Link>
                                                        <div className="p-1 rounded-lg text-gray-400">
                                                            {isExpanded ? <ChevronUp className="w-5 h-5 text-purple-600" /> : <ChevronDown className="w-5 h-5" />}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Parçalar Listesi (Açıldığında) */}
                                                {isExpanded && (
                                                    <div className="p-4 border-t border-purple-100 dark:border-purple-900/40 bg-gray-50/50 dark:bg-gray-900/30 space-y-3.5">
                                                        <div className="flex justify-between items-center px-1">
                                                            <h4 className="text-xs font-black text-gray-700 dark:text-gray-300 uppercase tracking-wider flex items-center gap-1.5">
                                                                <Layers className="w-4 h-4 text-purple-600" />
                                                                <span>Kalıp Parçaları ve Operasyon Planlaması ({totalTasks} Parça):</span>
                                                            </h4>
                                                        </div>

                                                        {totalTasks === 0 ? (
                                                            <div className="p-4 rounded-xl border border-dashed text-center text-xs text-gray-400">
                                                                Bu kalıba ait henüz parça tanımlanmamış.
                                                            </div>
                                                        ) : (
                                                            (moldItem.tasks || []).map((taskItem) => {
                                                                const firstUnfinishedOp = (taskItem.operations || []).find(op => op.status !== OPERATION_STATUS.COMPLETED) || taskItem.operations?.[0];

                                                                return (
                                                                    <div 
                                                                        key={taskItem.id} 
                                                                        className="p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-xs hover:border-purple-300 dark:hover:border-purple-700 transition-all space-y-3"
                                                                    >
                                                                        {/* Parça Başlık & Rozetler & Eylemler */}
                                                                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                                                                            <div className="space-y-1">
                                                                                <div className="flex items-center gap-2 flex-wrap">
                                                                                    <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600">
                                                                                        PARÇA
                                                                                    </span>
                                                                                    <h4 className="font-extrabold text-sm text-gray-900 dark:text-white">
                                                                                        {taskItem.taskName}
                                                                                    </h4>
                                                                                    {taskItem.isCritical && (
                                                                                        <span className="text-[10px] font-black px-2 py-0.5 bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 rounded border border-red-300 dark:border-red-800 flex items-center gap-1">
                                                                                            <ShieldAlert className="w-3 h-3 text-red-600" /> KRİTİK
                                                                                        </span>
                                                                                    )}
                                                                                    {taskItem.plannedMachine && (
                                                                                        <span className="text-[11px] font-black px-2.5 py-0.5 bg-purple-100 dark:bg-purple-900/50 text-purple-800 dark:text-purple-200 rounded-md border border-purple-200 dark:border-purple-700 flex items-center gap-1">
                                                                                            <Monitor className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                                                                                            Planlanan: {taskItem.plannedMachine}
                                                                                        </span>
                                                                                    )}
                                                                                    {taskItem.estimatedCamTime > 0 && (
                                                                                        <span className="text-[11px] font-bold px-2 py-0.5 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 rounded border border-indigo-200 dark:border-indigo-800 flex items-center gap-1">
                                                                                            <Clock className="w-3 h-3 text-indigo-500" />
                                                                                            {formatDurationHours(taskItem.estimatedCamTime)}
                                                                                        </span>
                                                                                    )}
                                                                                </div>
                                                                            </div>

                                                                            {/* Parça Düzeyi Butonlar */}
                                                                            <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                                                                                {/* Tezgah Planla (Kuyruğa Al) */}
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => handleQuickPlanClick(moldItem, taskItem)}
                                                                                    className="px-2.5 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300 dark:hover:bg-purple-900/50 border border-purple-200 dark:border-purple-800 rounded-lg text-xs font-bold flex items-center gap-1 transition shadow-2xs"
                                                                                    title="Hedef Tezgahı ve Tahmini Süreyi Belirle"
                                                                                >
                                                                                    <Calendar className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                                                                                    <span>Tezgah Planla</span>
                                                                                </button>

                                                                                {/* Yeni Operasyon Ekle */}
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => handleOpenAddOperationModal(moldItem, taskItem)}
                                                                                    className="px-2.5 py-1.5 bg-green-50 hover:bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300 dark:hover:bg-green-900/50 border border-green-200 dark:border-green-800 rounded-lg text-xs font-bold flex items-center gap-1 transition shadow-2xs"
                                                                                    title="Bu parçaya yeni ek operasyon ekle"
                                                                                >
                                                                                    <Plus className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
                                                                                    <span>Ek Operasyon</span>
                                                                                </button>

                                                                                {/* Tezgaha İşi Başlat / Ata */}
                                                                                {firstUnfinishedOp && (firstUnfinishedOp.status === OPERATION_STATUS.NOT_STARTED || firstUnfinishedOp.status === OPERATION_STATUS.PAUSED) && (
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={() => handleOpenAssignModal(moldItem, taskItem, firstUnfinishedOp)}
                                                                                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-black flex items-center gap-1 transition shadow-xs"
                                                                                        title="Operasyonu tezgaha ata ve başlat"
                                                                                    >
                                                                                        <Zap className="w-3.5 h-3.5 text-yellow-300 fill-yellow-300" />
                                                                                        <span>{firstUnfinishedOp.status === OPERATION_STATUS.PAUSED ? 'Devam Et' : 'İşi Başlat ve Ata'}</span>
                                                                                    </button>
                                                                                )}
                                                                            </div>
                                                                        </div>

                                                                        {/* Operasyonlar Detayı */}
                                                                        <div className="space-y-2 pt-2 border-t border-gray-100 dark:border-gray-700/60">
                                                                            {(taskItem.operations || []).map((opItem, opIndex) => (
                                                                                <div 
                                                                                    key={opItem.id || opIndex}
                                                                                    className="p-2.5 rounded-lg border border-gray-200 dark:border-gray-700/80 bg-gray-50/70 dark:bg-gray-800/60 flex flex-col md:flex-row justify-between items-start md:items-center gap-2"
                                                                                >
                                                                                    <div className="space-y-1">
                                                                                        <div className="flex items-center gap-2 flex-wrap">
                                                                                            {opItem.workOrderNo && (
                                                                                                <span className="font-mono text-[11px] font-black px-2.5 py-0.5 rounded-md tracking-wider bg-blue-600 text-white dark:bg-cyan-400 dark:text-slate-950 shadow-xs border border-blue-700 dark:border-cyan-300 select-all">
                                                                                                    {opItem.workOrderNo}
                                                                                                </span>
                                                                                            )}
                                                                                            <span className="font-extrabold text-xs text-blue-700 dark:text-cyan-400">
                                                                                                {opItem.type || 'İşleme'}
                                                                                            </span>
                                                                                            <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${getStatusClasses(opItem.status)}`}>
                                                                                                {opItem.status || 'Bekliyor'} %{opItem.progressPercentage || 0}
                                                                                            </span>
                                                                                        </div>

                                                                                        {/* Alt İşlemler */}
                                                                                        {opItem.subOperations && Array.isArray(opItem.subOperations) && opItem.subOperations.length > 0 && (
                                                                                            <div className="flex flex-wrap gap-1 mt-1">
                                                                                                {opItem.subOperations.map((sub, sIdx) => (
                                                                                                    <span key={sIdx} className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                                                                                                        ▪ {sub}
                                                                                                    </span>
                                                                                                ))}
                                                                                            </div>
                                                                                        )}

                                                                                        {/* Tezgah ve Süre Bilgisi */}
                                                                                        <div className="text-[11px] text-gray-500 dark:text-gray-400 flex items-center gap-3 flex-wrap">
                                                                                            <span>Tezgah: <strong className="text-gray-800 dark:text-gray-200">{opItem.machineName || 'Atanmadı'}</strong></span>
                                                                                            {opItem.machineOperatorName && <span>Operatör: <strong className="text-gray-800 dark:text-gray-200">{opItem.machineOperatorName}</strong></span>}
                                                                                            {opItem.estimatedCamTime > 0 && <span>CAM Süresi: <strong className="text-indigo-600 dark:text-indigo-400">{formatDurationHours(opItem.estimatedCamTime)}</strong></span>}
                                                                                        </div>
                                                                                    </div>

                                                                                    {/* Operasyon Butonları */}
                                                                                    <div className="flex items-center gap-1.5 shrink-0">
                                                                                        {opItem.status !== OPERATION_STATUS.COMPLETED && (
                                                                                            <button
                                                                                                type="button"
                                                                                                onClick={() => handleQuickPlanClick(moldItem, taskItem, opItem)}
                                                                                                className="px-2.5 py-1 bg-purple-50 hover:bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 dark:hover:bg-purple-900/60 border border-purple-200 dark:border-purple-800 rounded-lg text-xs font-bold flex items-center gap-1 transition shadow-2xs"
                                                                                                title="Bu operasyon için hedef tezgah ve CAM süresi planla"
                                                                                            >
                                                                                                <Calendar className="w-3 h-3 text-purple-600 dark:text-purple-400" />
                                                                                                <span>Tezgah Planla</span>
                                                                                            </button>
                                                                                        )}

                                                                                        {(opItem.status === OPERATION_STATUS.NOT_STARTED || opItem.status === OPERATION_STATUS.PAUSED) && (
                                                                                            <button
                                                                                                type="button"
                                                                                                onClick={() => handleOpenAssignModal(moldItem, taskItem, opItem)}
                                                                                                className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 transition shrink-0"
                                                                                            >
                                                                                                <Zap className="w-3 h-3" />
                                                                                                {opItem.status === OPERATION_STATUS.PAUSED ? 'Devam Et' : 'Ata'}
                                                                                            </button>
                                                                                        )}
                                                                                    </div>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })
                                )}
                            </div>

                            {/* SAĞ SÜTUN: CANLI TEZGAH DOLULUK DURUMLARI LİSTESİ */}
                            {showMachineLoadPanel && (
                                <div className="xl:col-span-4 space-y-3 sticky top-4">
                                    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-4 space-y-3.5">
                                        <div className="flex items-center justify-between pb-2 border-b border-gray-100 dark:border-gray-700">
                                            <h3 className="font-extrabold text-sm text-gray-900 dark:text-white flex items-center gap-2">
                                                <Activity className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                                                <span>Tezgah Doluluk Durumları</span>
                                            </h3>
                                            <div className="flex items-center gap-2">
                                                <span className="text-[11px] font-black text-gray-500 dark:text-gray-400">
                                                    {machineLoadList.length} Tezgah
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={() => setIsMachineGanttOpen(true)}
                                                    className="px-2 py-1 bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/60 dark:hover:bg-purple-900/60 text-purple-700 dark:text-purple-300 rounded-lg text-xs font-bold flex items-center gap-1 border border-purple-200 dark:border-purple-800 transition shadow-2xs"
                                                    title="Tezgah Zaman Çizelgesi ve Gantt Planını Büyüt"
                                                >
                                                    <Maximize2 className="w-3.5 h-3.5" />
                                                    <span>Büyüt</span>
                                                </button>
                                            </div>
                                        </div>

                                        {/* Özet Rozetler */}
                                        <div className="grid grid-cols-3 gap-2">
                                            <div className="p-2 rounded-xl bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-800 text-center">
                                                <span className="block text-xs font-black text-green-700 dark:text-green-300">
                                                    {machineLoadList.filter(m => m.status === 'AVAILABLE').length}
                                                </span>
                                                <span className="text-[10px] font-bold text-green-600 dark:text-green-400">Boş / Müsait</span>
                                            </div>
                                            <div className="p-2 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-center">
                                                <span className="block text-xs font-black text-red-700 dark:text-red-300">
                                                    {machineLoadList.filter(m => m.status === 'BUSY').length}
                                                </span>
                                                <span className="text-[10px] font-bold text-red-600 dark:text-red-400">Çalışıyor</span>
                                            </div>
                                            <div className="p-2 rounded-xl bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 text-center">
                                                <span className="block text-xs font-black text-purple-700 dark:text-purple-300">
                                                    {machineLoadList.reduce((acc, m) => acc + m.totalHours, 0).toFixed(0)}s
                                                </span>
                                                <span className="text-[10px] font-bold text-purple-600 dark:text-purple-400">Toplam Yük</span>
                                            </div>
                                        </div>

                                        {/* Tezgah Arama & Durum Filtresi */}
                                        <div className="space-y-2">
                                            <div className="relative">
                                                <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-gray-400" />
                                                <input
                                                    type="text"
                                                    placeholder="Tezgah adı ara..."
                                                    value={machineFilterTerm}
                                                    onChange={(e) => setMachineFilterTerm(e.target.value)}
                                                    className="w-full pl-8 pr-3 py-1.5 bg-gray-50 dark:bg-gray-700/60 border border-gray-200 dark:border-gray-600 rounded-lg text-xs font-bold outline-none focus:ring-1 focus:ring-purple-500"
                                                />
                                            </div>

                                            <div className="flex gap-1 text-[11px] font-bold">
                                                <button
                                                    type="button"
                                                    onClick={() => setMachineStatusFilter('ALL')}
                                                    className={`flex-1 py-1 rounded text-center transition ${machineStatusFilter === 'ALL' ? 'bg-purple-600 text-white font-black' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}
                                                >
                                                    Tümü
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setMachineStatusFilter('AVAILABLE')}
                                                    className={`flex-1 py-1 rounded text-center transition ${machineStatusFilter === 'AVAILABLE' ? 'bg-green-600 text-white font-black' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}
                                                >
                                                    Boş
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setMachineStatusFilter('BUSY')}
                                                    className={`flex-1 py-1 rounded text-center transition ${machineStatusFilter === 'BUSY' ? 'bg-red-600 text-white font-black' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}
                                                >
                                                    Dolu
                                                </button>
                                            </div>
                                        </div>

                                        {/* Tezgah Kartları Listesi */}
                                        <div className="max-h-[550px] overflow-y-auto space-y-2.5 pr-1 custom-scrollbar">
                                            {machineLoadList
                                                .filter(m => {
                                                    if (machineStatusFilter === 'AVAILABLE' && m.status !== 'AVAILABLE') return false;
                                                    if (machineStatusFilter === 'BUSY' && m.status !== 'BUSY') return false;
                                                    if (machineFilterTerm.trim() && !m.name.toLowerCase().includes(machineFilterTerm.toLowerCase().trim())) return false;
                                                    return true;
                                                })
                                                .map(m => {
                                                    const isBusy = m.status === 'BUSY';
                                                    const hasQueue = m.queuedJobs && m.queuedJobs.length > 0;

                                                    return (
                                                        <div
                                                            key={m.id}
                                                            className={`p-3 rounded-xl border transition-all text-xs space-y-2 ${
                                                                isBusy
                                                                    ? 'bg-red-50/40 dark:bg-red-950/20 border-red-200 dark:border-red-900/60'
                                                                    : (hasQueue 
                                                                        ? 'bg-amber-50/40 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/60' 
                                                                        : 'bg-emerald-50/30 dark:bg-emerald-950/10 border-emerald-200 dark:border-emerald-900/40')
                                                            }`}
                                                        >
                                                            <div className="flex justify-between items-center">
                                                                <span className="font-black text-sm text-gray-900 dark:text-white">
                                                                    {m.name}
                                                                </span>
                                                                <span className={`px-2 py-0.5 rounded text-[10px] font-black ${
                                                                    isBusy 
                                                                        ? 'bg-red-600 text-white' 
                                                                        : (hasQueue ? 'bg-amber-500 text-white' : 'bg-emerald-600 text-white')
                                                                }`}>
                                                                    {isBusy ? `ÇALIŞIYOR (%${m.activeJob?.progress || 0})` : (hasQueue ? `${m.queuedJobs.length} İŞ BEKLİYOR` : 'BOŞTA / MÜSAİT')}
                                                                </span>
                                                            </div>

                                                            {/* Aktif İş Detayı */}
                                                            {isBusy && m.activeJob && (
                                                                <div className="p-2 rounded-lg bg-white/80 dark:bg-gray-800/80 border border-red-100 dark:border-red-900/40 space-y-1">
                                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                                        {m.activeJob.workOrderNo && (
                                                                            <span className="font-mono text-[9px] font-black px-1.5 py-0.2 rounded bg-blue-600 text-white dark:bg-cyan-400 dark:text-slate-950">
                                                                                {m.activeJob.workOrderNo}
                                                                            </span>
                                                                        )}
                                                                        <span className="font-bold text-gray-900 dark:text-white truncate">
                                                                            {m.activeJob.moldName} - {m.activeJob.taskName}
                                                                        </span>
                                                                    </div>
                                                                    <div className="text-[10px] text-gray-600 dark:text-gray-300 flex justify-between">
                                                                        <span>Op: {m.activeJob.machineOperator}</span>
                                                                        <span>CAM: {m.activeJob.camOperator}</span>
                                                                    </div>
                                                                    <div className="w-full bg-gray-200 dark:bg-gray-700 h-1.5 rounded-full overflow-hidden">
                                                                        <div className="bg-red-500 h-full rounded-full transition-all" style={{ width: `${m.activeJob.progress || 0}%` }}></div>
                                                                    </div>
                                                                </div>
                                                            )}

                                                            {/* Sırada Bekleyen / Planlanan İşler Listesi */}
                                                            {hasQueue && (
                                                                <div className="space-y-1 pt-1 border-t border-gray-200/50 dark:border-gray-700/50">
                                                                    <span className="text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider block">
                                                                        Sıradaki Planlanan İşler ({m.queuedJobs.length}):
                                                                    </span>
                                                                    <div className="space-y-1">
                                                                        {m.queuedJobs.slice(0, 3).map((qJob, qIdx) => (
                                                                            <div key={qIdx} className="p-1.5 rounded-lg bg-white/70 dark:bg-gray-800/70 border border-gray-200/60 dark:border-gray-700/60 text-[10px] flex items-center justify-between gap-1">
                                                                                <div className="truncate flex items-center gap-1.5">
                                                                                    {qJob.workOrderNo && (
                                                                                        <span className="font-mono text-[9px] font-black px-1.5 py-0.2 rounded bg-blue-600 text-white dark:bg-cyan-400 dark:text-slate-950 shrink-0">
                                                                                            {qJob.workOrderNo}
                                                                                        </span>
                                                                                    )}
                                                                                    <span className="font-bold text-gray-800 dark:text-gray-200 truncate">
                                                                                        {qJob.taskName} ({qJob.opType})
                                                                                    </span>
                                                                                </div>
                                                                                <span className="text-gray-500 dark:text-gray-400 font-semibold shrink-0">
                                                                                    {formatDurationHours(qJob.time)}
                                                                                </span>
                                                                            </div>
                                                                        ))}
                                                                        {m.queuedJobs.length > 3 && (
                                                                            <div className="text-center text-[10px] font-bold text-purple-600 dark:text-purple-400">
                                                                                +{m.queuedJobs.length - 3} iş daha sırada...
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            )}

                                                            {/* Tahmini Boşa Çıkış Tarihi */}
                                                            <div className="flex justify-between items-center text-[10px] pt-1 border-t border-gray-200/60 dark:border-gray-700/60">
                                                                <span className="text-gray-500 dark:text-gray-400 font-medium">Tahmini Boşalma:</span>
                                                                <strong className={isBusy || hasQueue ? 'text-purple-700 dark:text-purple-300 font-bold' : 'text-emerald-600 dark:text-emerald-400 font-bold'}>
                                                                    {formatFreeAtDate(m.freeAt || m.totalHours)}
                                                                </strong>
                                                            </div>

                                                            {/* Bekleyen İşler ve Toplam Süre */}
                                                            <div className="flex justify-between items-center text-[11px] font-bold">
                                                                <span className="text-gray-500 dark:text-gray-400">
                                                                    {hasQueue ? `${m.queuedJobs.length} Parça Sırada` : 'Kuyruk Boş'}
                                                                </span>
                                                                <span className="text-purple-700 dark:text-purple-300">
                                                                    Toplam: {formatDurationHours(m.totalHours)}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    /* TEZGAH BAZLI PLANLANAN İŞLER GÖRÜNÜMÜ */
                    <div className="space-y-4 animate-in fade-in">
                        {/* Üst Filtreleme Çubuğu */}
                        <div className="bg-gray-50 dark:bg-gray-800/80 p-4 rounded-2xl border border-gray-200 dark:border-gray-700/80 shadow-xs space-y-3">
                            <div className="flex flex-col lg:flex-row justify-between items-stretch lg:items-center gap-3">
                                {/* Arama Input */}
                                <div className="relative flex-1">
                                    <Search className="absolute left-3.5 top-3 w-4 h-4 text-gray-400" />
                                    <input
                                        type="text"
                                        placeholder="Tezgahtaki parça, kalıp, müşteri veya iş emri ara..."
                                        value={byMachineSearch}
                                        onChange={(e) => setByMachineSearch(e.target.value)}
                                        className="w-full pl-10 pr-4 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl text-xs font-bold text-gray-900 dark:text-white placeholder-gray-400 outline-none focus:ring-2 focus:ring-purple-500 shadow-inner"
                                    />
                                    {byMachineSearch && (
                                        <button 
                                            onClick={() => setByMachineSearch('')}
                                            className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>

                                {/* Tezgah Seçimi Dropdown & Sorumluluk */}
                                <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                                    <div className="relative min-w-[180px] flex-1 sm:flex-initial">
                                        <Monitor className="absolute left-3 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
                                        <select
                                            value={byMachineFilter}
                                            onChange={(e) => setByMachineFilter(e.target.value)}
                                            className="w-full pl-9 pr-7 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl text-xs font-bold text-gray-800 dark:text-gray-200 outline-none focus:ring-2 focus:ring-purple-500 appearance-none shadow-xs"
                                        >
                                            <option value="">Tüm Tezgahlar ({machines?.length || 0})</option>
                                            {(machines || []).map(m => (
                                                <option key={m.id || m.name} value={m.name}>
                                                    {m.name} ({m.type || 'CNC'})
                                                </option>
                                            ))}
                                        </select>
                                        <ChevronDown className="absolute right-2.5 top-3 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                                    </div>

                                    {/* Sorumluluk Toggle'ı */}
                                    <div className="flex bg-gray-200/80 dark:bg-gray-700/80 p-0.5 rounded-xl text-xs font-black shadow-inner shrink-0">
                                        <button
                                            type="button"
                                            onClick={() => setByMachineOnlyMine(true)}
                                            className={`px-3 py-1.5 rounded-lg transition-all ${byMachineOnlyMine ? 'bg-purple-600 text-white shadow-xs' : 'text-gray-600 dark:text-gray-300 hover:text-gray-900'}`}
                                        >
                                            Sorumlu Olduklarım
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setByMachineOnlyMine(false)}
                                            className={`px-3 py-1.5 rounded-lg transition-all ${!byMachineOnlyMine ? 'bg-purple-600 text-white shadow-xs' : 'text-gray-600 dark:text-gray-300 hover:text-gray-900'}`}
                                        >
                                            Tüm Kalıplar
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Durum Hap Butonları */}
                            <div className="flex items-center gap-2 overflow-x-auto pb-0.5 custom-scrollbar">
                                <span className="text-[11px] font-black text-gray-500 uppercase tracking-wider mr-1 flex items-center gap-1 shrink-0">
                                    <Filter className="w-3 h-3 text-gray-400" /> İş Durumu:
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setByMachineStatus('ALL')}
                                    className={`px-3 py-1 rounded-lg text-xs font-black transition ${
                                        byMachineStatus === 'ALL'
                                            ? 'bg-purple-600 text-white shadow-xs'
                                            : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600 hover:bg-gray-100'
                                    }`}
                                >
                                    Tümü
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setByMachineStatus('BUSY')}
                                    className={`px-3 py-1 rounded-lg text-xs font-black transition flex items-center gap-1.5 ${
                                        byMachineStatus === 'BUSY'
                                            ? 'bg-amber-600 text-white shadow-xs'
                                            : 'bg-white dark:bg-gray-700 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-700/60 hover:bg-amber-50'
                                    }`}
                                >
                                    <Zap className="w-3 h-3" />
                                    <span>Aktif Çalışanlar</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setByMachineStatus('QUEUED')}
                                    className={`px-3 py-1 rounded-lg text-xs font-black transition flex items-center gap-1.5 ${
                                        byMachineStatus === 'QUEUED'
                                            ? 'bg-blue-600 text-white shadow-xs'
                                            : 'bg-white dark:bg-gray-700 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-700/60 hover:bg-blue-50'
                                    }`}
                                >
                                    <Clock className="w-3 h-3" />
                                    <span>Sırada Bekleyenler</span>
                                </button>
                            </div>
                        </div>

                        {/* Özet İstatistik Kartları */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div className="bg-white dark:bg-gray-800 p-3.5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs flex items-center gap-3">
                                <div className="p-2.5 rounded-xl bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400">
                                    <Monitor className="w-5 h-5" />
                                </div>
                                <div>
                                    <p className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase">Yüklü Tezgah</p>
                                    <p className="text-lg font-black text-gray-900 dark:text-white">
                                        {byMachineSummary.activeMachines} <span className="text-xs font-medium text-gray-400">/ {machines?.length || 0}</span>
                                    </p>
                                </div>
                            </div>

                            <div className="bg-white dark:bg-gray-800 p-3.5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs flex items-center gap-3">
                                <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400">
                                    <Layers className="w-5 h-5" />
                                </div>
                                <div>
                                    <p className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase">Planlanan İş</p>
                                    <p className="text-lg font-black text-blue-600 dark:text-blue-400">
                                        {totalPlannedJobsCount}
                                    </p>
                                </div>
                            </div>

                            <div className="bg-white dark:bg-gray-800 p-3.5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs flex items-center gap-3">
                                <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400">
                                    <PlayCircle className="w-5 h-5" />
                                </div>
                                <div>
                                    <p className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase">Şu An İşleniyor</p>
                                    <p className="text-lg font-black text-amber-600 dark:text-amber-400">
                                        {byMachineSummary.workingCount}
                                    </p>
                                </div>
                            </div>

                            <div className="bg-white dark:bg-gray-800 p-3.5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs flex items-center gap-3">
                                <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400">
                                    <Clock className="w-5 h-5" />
                                </div>
                                <div>
                                    <p className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase">Toplam Süre</p>
                                    <p className="text-lg font-black text-emerald-600 dark:text-emerald-400">
                                        {formatDurationHours(byMachineSummary.totalHours)}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* TEZGAHLAR VE PLANLANAN PARÇALAR LİSTESİ */}
                        {displayedMachines.length === 0 ? (
                            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-dashed border-gray-300 dark:border-gray-700 p-12 text-center space-y-3">
                                <Monitor className="w-12 h-12 text-gray-400 mx-auto" />
                                <h4 className="text-base font-bold text-gray-700 dark:text-gray-300">
                                    Planlanmış İş Bulunamadı
                                </h4>
                                <p className="text-xs text-gray-500 dark:text-gray-400 max-w-md mx-auto">
                                    Seçilen filtrelere uygun tezgah veya planlanmış parça bulunmuyor. "Kalıp & Parça Planlama" sekmesinden parçaları tezgahlara atayabilirsiniz.
                                </p>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setByMachineFilter('');
                                        setByMachineSearch('');
                                        setByMachineStatus('ALL');
                                    }}
                                    className="px-4 py-2 bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 border border-purple-200 dark:border-purple-800 rounded-xl text-xs font-bold hover:bg-purple-100 transition"
                                >
                                    Filtreleri Temizle
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {displayedMachines.map((m) => {
                                    const isBusy = m.status === 'BUSY';
                                    const hasQueue = m.queuedJobs.length > 0;

                                    return (
                                        <div 
                                            key={m.id || m.name}
                                            className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xs overflow-hidden"
                                        >
                                            {/* Tezgah Başlık Çubuğu */}
                                            <div className="p-3.5 sm:p-4 bg-gray-50/80 dark:bg-gray-800/90 border-b border-gray-200 dark:border-gray-700/80 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                                                <div className="flex items-center gap-3">
                                                    <div className={`p-2.5 rounded-xl ${
                                                        isBusy 
                                                            ? 'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300' 
                                                            : hasQueue 
                                                                ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300' 
                                                                : 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300'
                                                    }`}>
                                                        <Monitor className="w-5 h-5" />
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <h3 className="text-base font-black text-gray-900 dark:text-white">
                                                                {m.name}
                                                            </h3>
                                                            <span className="px-2 py-0.5 rounded text-[10px] font-black bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 uppercase">
                                                                {m.type || 'CNC'}
                                                            </span>
                                                            {isBusy ? (
                                                                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300 dark:border-amber-700/60 flex items-center gap-1 animate-pulse">
                                                                    <Zap className="w-3 h-3" /> ÇALIŞIYOR
                                                                </span>
                                                            ) : hasQueue ? (
                                                                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-300 dark:border-blue-700/60 flex items-center gap-1">
                                                                    <Clock className="w-3 h-3" /> SIRADA ({m.jobs.length})
                                                                </span>
                                                            ) : (
                                                                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700/60">
                                                                    BOŞ
                                                                </span>
                                                            )}
                                                        </div>
                                                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                                            Bu tezgahta <strong className="text-purple-600 dark:text-purple-400">{m.jobs.length}</strong> planlanmış iş/operasyon bulunuyor.
                                                        </p>
                                                    </div>
                                                </div>

                                                {/* Tezgah Durum Özeti & Tahmini Boşalma */}
                                                <div className="flex items-center gap-3 sm:gap-4 flex-wrap text-xs font-bold shrink-0 self-end md:self-center">
                                                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300">
                                                        <Clock className="w-3.5 h-3.5" />
                                                        <span>Tahmini Boşalma:</span>
                                                        <span className="font-black underline">
                                                            {formatFreeAtDate(m.freeAt || m.totalHours)}
                                                        </span>
                                                    </div>

                                                    <div className="px-3 py-1.5 rounded-xl bg-gray-100 dark:bg-gray-700/60 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600">
                                                        Toplam Yük: <span className="font-black text-gray-900 dark:text-white">{formatDurationHours(m.totalHours)}</span>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Tezgah İçindeki Planlı İşler Listesi */}
                                            <div className="p-3.5 sm:p-4 space-y-3 bg-gray-50/30 dark:bg-gray-900/20">
                                                {m.jobs.length === 0 ? (
                                                    <div className="p-4 rounded-xl border border-dashed border-gray-300 dark:border-gray-700 text-center text-xs text-gray-400">
                                                        Bu tezgahta arama kriterlerine uygun iş bulunmuyor.
                                                    </div>
                                                ) : (
                                                    m.jobs.map((job, idx) => (
                                                        <div 
                                                            key={job.id || idx}
                                                            className={`p-3 sm:p-4 rounded-xl border transition-all ${
                                                                job.isWorking
                                                                    ? 'border-amber-400/80 bg-amber-50/30 dark:bg-amber-950/20 dark:border-amber-600/60 shadow-xs'
                                                                    : 'border-gray-200 dark:border-gray-700/80 bg-white dark:bg-gray-800 hover:border-purple-300 dark:hover:border-purple-700/80 shadow-2xs'
                                                            }`}
                                                        >
                                                            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                                                                {/* Sol: Kuyruk sırası, Parça Adı, Kalıp ve İş Emri */}
                                                                <div className="space-y-1.5 flex-1 min-w-0">
                                                                    <div className="flex items-center gap-2 flex-wrap">
                                                                        {job.isWorking ? (
                                                                            <span className="px-2 py-0.5 rounded text-[10px] font-black bg-amber-500 text-white flex items-center gap-1 shadow-2xs animate-pulse">
                                                                                <PlayCircle className="w-3 h-3" /> 1. ŞU AN ÇALIŞIYOR
                                                                            </span>
                                                                        ) : (
                                                                            <span className="px-2 py-0.5 rounded text-[10px] font-black bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                                                                                {idx + 1}. Sırada Bekliyor
                                                                            </span>
                                                                        )}

                                                                        {job.workOrderNo && (
                                                                            <span className="px-2 py-0.5 rounded text-xs font-black bg-blue-600 text-white dark:bg-cyan-400 dark:text-slate-950 tracking-wider shadow-xs">
                                                                                İş Emri: #{job.workOrderNo}
                                                                            </span>
                                                                        )}

                                                                        <span className="px-2 py-0.5 rounded text-[10px] font-black bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                                                                            {job.opType}
                                                                        </span>

                                                                        <span className={`px-2 py-0.5 text-[10px] font-black rounded-full ${getStatusClasses(job.status)}`}>
                                                                            {job.status}
                                                                        </span>
                                                                    </div>

                                                                    {/* Parça ve Kalıp Bilgileri */}
                                                                    <div className="flex items-center gap-2 flex-wrap">
                                                                        <h4 className="text-sm font-black text-gray-900 dark:text-white">
                                                                            {job.taskName}
                                                                        </h4>
                                                                        <span className="text-gray-400">•</span>
                                                                        <Link 
                                                                            to={`/mold/${job.mold?.id}`}
                                                                            className="text-xs font-extrabold text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-1"
                                                                        >
                                                                            <Box className="w-3.5 h-3.5" />
                                                                            <span>{job.moldName}</span>
                                                                            {job.customer && (
                                                                                <span className="text-gray-500 font-normal">({job.customer})</span>
                                                                            )}
                                                                            <ExternalLink className="w-3 h-3" />
                                                                        </Link>
                                                                    </div>

                                                                    {/* Alt Operasyonlar / İşlem Detayları */}
                                                                    {job.subOperations && job.subOperations.length > 0 && (
                                                                        <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                                                                            <span className="text-[10px] font-black text-gray-400">İşlemler:</span>
                                                                            {job.subOperations.map((sub, sIdx) => (
                                                                                <span 
                                                                                    key={sIdx}
                                                                                    className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200/80 dark:border-purple-800/80"
                                                                                >
                                                                                    {sub}
                                                                                </span>
                                                                            ))}
                                                                        </div>
                                                                    )}

                                                                    {/* Sorumlu ve Süre Bilgisi */}
                                                                    <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400 font-medium flex-wrap pt-0.5">
                                                                        <span>CAM: <strong className="text-gray-800 dark:text-gray-200">{job.camOperator}</strong></span>
                                                                        <span>Tezgah Op: <strong className="text-gray-800 dark:text-gray-200">{job.machineOperator}</strong></span>
                                                                        <span>Tahmini CAM Süresi: <strong className="text-purple-600 dark:text-purple-400">{formatDurationHours(job.time)}</strong></span>
                                                                        {job.isWorking && job.progress > 0 && (
                                                                            <span className="text-amber-600 dark:text-amber-400 font-black">
                                                                                İlerleme: %{job.progress}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </div>

                                                                {/* Sağ: Aksiyon Butonları */}
                                                                <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                                                                    {/* Tezgah / Süre Düzenle */}
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleQuickPlanClick(job.mold, job.task, job.operation)}
                                                                        className="px-2.5 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300 dark:hover:bg-purple-900/50 border border-purple-200 dark:border-purple-800 rounded-lg text-xs font-bold flex items-center gap-1.5 transition shadow-2xs"
                                                                        title="Tezgahı Değiştir veya Tahmini Süreyi Düzenle"
                                                                    >
                                                                        <Calendar className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                                                                        <span>Tezgah/Süre Düzenle</span>
                                                                    </button>

                                                                    {/* İşi Başlat / Ata (Eğer çalışmıyorsa) */}
                                                                    {!job.isWorking && (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => handleOpenAssignModal(job.mold, job.task, job.operation)}
                                                                            className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition shadow-2xs"
                                                                            title="Bu parçayı tezgaha ver ve başlat"
                                                                        >
                                                                            <PlayCircle className="w-3.5 h-3.5" />
                                                                            <span>İşi Başlat</span>
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
            </div>
        ) : (
                    <div className="space-y-6 animate-in fade-in h-full flex flex-col min-h-0">
                        {/* ÖN HAZIRLIK İÇİ ALT SEKME BARU */}
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-gray-200 dark:border-gray-700 pb-3 shrink-0">
                            <div className="flex gap-2">
                                <button 
                                    onClick={() => setPrepSubTab('todo')}
                                    className={`px-4 py-2.5 rounded-xl font-black text-sm transition flex items-center gap-2 ${prepSubTab === 'todo' ? 'bg-indigo-600 text-white shadow-md' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200'}`}
                                >
                                    <Edit2 className="w-4 h-4" /> Hazırlık Yapılacak İşler
                                </button>
                                <button 
                                    onClick={() => setPrepSubTab('completed')}
                                    className={`px-4 py-2.5 rounded-xl font-black text-sm transition flex items-center gap-2 ${prepSubTab === 'completed' ? 'bg-green-600 text-white shadow-md' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200'}`}
                                >
                                    <CheckCircle className="w-4 h-4" /> Yapılan Hazırlıklar Listesi ({activePreparedTasks.length})
                                </button>
                            </div>
                        </div>

                        {/* ALT SEKME 1: HAZIRLIK YAPILACAK İŞLER */}
                        {prepSubTab === 'todo' ? (
                            <div className="space-y-4 flex-1 flex flex-col min-h-0">
                                {/* FİLTRELEME ALANI (Kalıp Arama & Tezgah Filtresi) */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 shrink-0">
                                    {/* YAZARAK ARAMA DROPDOWN GİRDİSİ */}
                                    <div className="relative">
                                        <Search className="absolute left-3.5 top-3 w-4 h-4 text-gray-400" />
                                        <input 
                                            type="text" 
                                            placeholder="Kalıp adına göre arayın..." 
                                            value={prepSearchTerm} 
                                            onChange={(e) => { setPrepSearchTerm(e.target.value); setSelectedPrepMold(null); }} 
                                            className="w-full pl-10 pr-4 py-2.5 border-2 border-indigo-200 dark:border-indigo-900/60 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-extrabold text-sm outline-none focus:border-indigo-600 shadow-sm" 
                                        />
                                        {/* ARAMA SONUÇLARI DROPDOWN */}
                                        {prepSearchTerm && !selectedPrepMold && (
                                            <div className="absolute z-20 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl max-h-64 overflow-y-auto">
                                                {projects.filter(p => p.status !== 'TAMAMLANDI' && p.moldName.toLowerCase().includes(prepSearchTerm.toLowerCase().trim())).map(mold => (
                                                    <button 
                                                        key={mold.id} 
                                                        onClick={() => { setSelectedPrepMold(mold); setPrepSearchTerm(''); }} 
                                                        className="w-full text-left px-4 py-3 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 border-b last:border-0 border-gray-100 dark:border-gray-700 transition-colors flex justify-between items-center"
                                                    >
                                                        <div>
                                                            <span className="font-black text-gray-900 dark:text-white block text-sm">{mold.moldName}</span>
                                                            <span className="text-xs font-bold text-gray-500 dark:text-gray-400 block mt-0.5">{mold.customer}</span>
                                                        </div>
                                                        <span className="text-xs font-black bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-300 px-2.5 py-1 rounded-full shrink-0">
                                                            {(mold.tasks || []).length} Parça
                                                        </span>
                                                    </button>
                                                ))}
                                                {projects.filter(p => p.status !== 'TAMAMLANDI' && p.moldName.toLowerCase().includes(prepSearchTerm.toLowerCase().trim())).length === 0 && (
                                                    <div className="p-4 text-center text-gray-500 font-bold text-sm">Aradığınız kalıp bulunamadı.</div>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    {/* TEZGAH FİLTRESİ */}
                                    <div className="relative">
                                        <select 
                                            value={prepMachineFilter} 
                                            onChange={(e) => setPrepMachineFilter(e.target.value)}
                                            className="w-full p-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-bold text-sm outline-none focus:border-indigo-500 shadow-sm"
                                        >
                                            <option value="">Tüm Hedef Tezgahlar (Filtresiz)</option>
                                            {machines?.map(m => (
                                                <option key={m.id} value={m.name}>{m.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                {/* SEÇİLEN KALIP VEYA BOŞ DURUM GÖRÜNÜMÜ */}
                                <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 min-h-0">
                                    {selectedPrepMold ? (
                                        /* SEÇİLEN KALIP DETAY VE PARÇA LİSTESİ */
                                        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-md overflow-hidden animate-in fade-in">
                                            {/* NET VE YÜKSEK KONTRASTLI BAŞLIK */}
                                            <div className="bg-slate-900 dark:bg-slate-950 text-white p-4 border-b border-slate-800 flex justify-between items-center">
                                                <div>
                                                    <h3 className="text-xl font-black text-white flex items-center gap-2">
                                                        <Box className="w-5 h-5 text-indigo-400" /> {selectedPrepMold.moldName}
                                                    </h3>
                                                    <span className="text-xs font-bold text-slate-300 block mt-0.5">Müşteri: {selectedPrepMold.customer}</span>
                                                </div>
                                                <button 
                                                    onClick={() => { setSelectedPrepMold(null); setPrepSearchTerm(''); }} 
                                                    className="text-xs px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 rounded-lg font-extrabold transition flex items-center gap-1 active:scale-95 shadow-sm"
                                                >
                                                    <X className="w-4 h-4 text-red-400" /> Vazgeç / Başka Kalıp Seç
                                                </button>
                                            </div>

                                            {/* PARÇA LİSTESİ */}
                                            <div className="p-4 space-y-3">
                                                {(selectedPrepMold.tasks || []).filter(task => {
                                                    if (!prepMachineFilter) return true;
                                                    const targetMachine = task.camPreparation?.targetMachineName || task.plannedMachine || task.machineName;
                                                    return targetMachine === prepMachineFilter;
                                                }).map(task => {
                                                    const isPrepared = task.camPreparation?.status === 'HAZIRLANDI';
                                                    const isPreparedByOthers = isPrepared && task.camPreparation.preparedBy !== loggedInUser?.name;
                                                    
                                                    // Parçanın canlı imalat durumları (Kalıp Detay Listesindeki gibi)
                                                    const isAllCompleted = task.status === 'COMPLETED' || (task.operations?.length > 0 && task.operations.every(op => op.status === OPERATION_STATUS.COMPLETED));
                                                    const isRunning = task.operations?.some(op => op.status === OPERATION_STATUS.IN_PROGRESS);
                                                    const isPaused = task.operations?.some(op => op.status === OPERATION_STATUS.PAUSED);

                                                    return (
                                                        <div key={task.id} className={`p-4 rounded-xl border-2 transition-all flex flex-col justify-between items-start gap-3 ${isPrepared ? 'border-green-500/50 bg-green-50/20 dark:bg-green-900/10' : 'border-gray-200 dark:border-gray-700 hover:border-indigo-300'}`}>
                                                            {/* PARÇA BAŞLIĞI VE GENEL DURUMU */}
                                                            <div className="w-full flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                                                                <div className="flex items-center gap-2 flex-wrap">
                                                                    <h4 className="font-black text-base text-gray-900 dark:text-white">{task.taskName}</h4>
                                                                    
                                                                    {/* Parça Durum Badge'leri */}
                                                                    {isAllCompleted ? (
                                                                        <span className="text-[10px] font-black bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                                                                            <CheckCircle className="w-3 h-3" /> TAMAMLANDI
                                                                        </span>
                                                                    ) : isRunning ? (
                                                                        <span className="text-[10px] font-black bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 px-2.5 py-0.5 rounded-full animate-pulse flex items-center gap-1">
                                                                            <Clock className="w-3 h-3" /> İŞLENİYOR
                                                                        </span>
                                                                    ) : isPaused ? (
                                                                        <span className="text-[10px] font-black bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 px-2.5 py-0.5 rounded-full">
                                                                            DURAKLATILDI
                                                                        </span>
                                                                    ) : (
                                                                        <span className="text-[10px] font-black bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400 px-2.5 py-0.5 rounded-full">
                                                                            BEKLİYOR
                                                                        </span>
                                                                    )}

                                                                    {/* Hazırlık Durumu */}
                                                                    {isPrepared && (
                                                                        <span className="text-[10px] font-black bg-emerald-500 text-white px-2 py-0.5 rounded-full">
                                                                            ÖN HAZIRLIK TAMAM ({task.camPreparation.targetMachineName})
                                                                        </span>
                                                                    )}
                                                                </div>

                                                                {(!task.operations || task.operations.length === 0) && (
                                                                    <button 
                                                                        onClick={() => { setPrepTask(task); setPrepOperation(null); setIsCamPrepModalOpen(true); }}
                                                                        className={`px-5 py-2.5 rounded-xl font-extrabold text-xs shadow-sm transition active:scale-95 shrink-0 ${isPrepared ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-indigo-600 hover:bg-indigo-700 text-white'}`}
                                                                    >
                                                                        {isPrepared ? 'Hazırlığı Düzenle' : 'Hazırlık Yap'}
                                                                    </button>
                                                                )}
                                                            </div>

                                                            {/* PARÇA OPERASYON LİSTESİ VE HER OPERASYONA ÖZEL HAZIRLIK BUTONU */}
                                                            {task.operations && task.operations.length > 0 && (
                                                                <div className="mt-3 w-full space-y-2 border-t border-gray-100 dark:border-gray-700/60 pt-3">
                                                                    <div className="text-[11px] font-extrabold text-gray-500 uppercase tracking-wider mb-1 flex items-center justify-between">
                                                                        <span>Parça Operasyonları ({task.operations.length})</span>
                                                                        <span className="text-[10px] text-indigo-600 dark:text-indigo-400 normal-case font-bold">Hazırlık yapacağınız ek operasyonu seçebilirsiniz</span>
                                                                    </div>
                                                                    {task.operations.map(op => {
                                                                        const isOpPrepared = op.camPreparation?.status === 'HAZIRLANDI' || (task.camPreparation?.status === 'HAZIRLANDI' && op.machineName === task.camPreparation?.targetMachineName);
                                                                        return (
                                                                            <div key={op.id} className="p-3 rounded-xl bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 hover:border-indigo-300 transition-colors">
                                                                                <div className="flex items-center gap-2 flex-wrap">
                                                                                    <span className="font-black text-xs text-gray-900 dark:text-white bg-slate-200 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 px-2.5 py-1 rounded-md shadow-xs">
                                                                                        {op.type}
                                                                                    </span>
                                                                                    <span className="text-xs font-bold text-gray-700 dark:text-gray-300">
                                                                                        Tezgah: <strong className="text-indigo-600 dark:text-indigo-400 font-black">{op.machineName || 'Atanmadı'}</strong>
                                                                                    </span>
                                                                                    
                                                                                    {op.status === OPERATION_STATUS.COMPLETED ? (
                                                                                        <span className="text-[10px] font-black bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 px-2 py-0.5 rounded-full flex items-center gap-1">
                                                                                            <CheckCircle className="w-3 h-3" /> TAMAMLANDI
                                                                                        </span>
                                                                                    ) : op.status === OPERATION_STATUS.IN_PROGRESS ? (
                                                                                        <span className="text-[10px] font-black bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 px-2 py-0.5 rounded-full animate-pulse flex items-center gap-1">
                                                                                            <Clock className="w-3 h-3" /> İŞLENİYOR
                                                                                        </span>
                                                                                    ) : op.status === OPERATION_STATUS.PAUSED ? (
                                                                                        <span className="text-[10px] font-black bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 px-2 py-0.5 rounded-full">
                                                                                            DURAKLATILDI
                                                                                        </span>
                                                                                    ) : (
                                                                                        <span className="text-[10px] font-black bg-gray-200 text-gray-700 dark:bg-gray-600 dark:text-gray-300 px-2 py-0.5 rounded-full">
                                                                                            BEKLİYOR
                                                                                        </span>
                                                                                    )}

                                                                                    {isOpPrepared && (
                                                                                        <span className="text-[10px] font-black bg-emerald-500 text-white px-2 py-0.5 rounded-full">
                                                                                            HAZIRLIK TAMAM ({op.camPreparation?.targetMachineName || task.camPreparation?.targetMachineName})
                                                                                        </span>
                                                                                    )}
                                                                                </div>

                                                                                <button 
                                                                                    onClick={() => { setPrepTask(task); setPrepOperation(op); setIsCamPrepModalOpen(true); }}
                                                                                    className={`px-4 py-1.5 rounded-lg font-extrabold text-xs shadow-sm transition active:scale-95 shrink-0 ${isOpPrepared ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-indigo-600 hover:bg-indigo-700 text-white'}`}
                                                                                >
                                                                                    {isOpPrepared ? 'Hazırlığı Düzenle' : 'Hazırlık Yap'}
                                                                                </button>
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}

                                                {(!selectedPrepMold.tasks || selectedPrepMold.tasks.length === 0) && (
                                                    <div className="text-center py-10 text-gray-500 font-bold border-2 border-dashed rounded-xl">Bu kalıba ait tanımlı parça bulunamadı.</div>
                                                )}
                                            </div>
                                        </div>
                                    ) : (
                                        /* HİÇBİR KALIP SEÇİLMEDİĞİNDEKİ BOŞ DURUM PROMPT'U */
                                        <div className="text-center py-16 px-4 bg-gray-50 dark:bg-gray-800/40 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700 my-auto">
                                            <Search className="w-14 h-14 mx-auto mb-3 text-indigo-400 opacity-80 animate-bounce" />
                                            <h4 className="text-lg font-black text-gray-800 dark:text-gray-200 mb-1">Kalıp Arayın ve Seçin</h4>
                                            <p className="text-sm text-gray-500 dark:text-gray-400 font-medium max-w-md mx-auto">
                                                Ön hazırlık yapmak istediğiniz kalıbı yukarıdaki arama kutusuna yazıp listeden seçerek parçalarına ulaşabilirsiniz.
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : (
                            /* ALT SEKME 2: YAPILAN HAZIRLIKLAR LİSTESİ (İşleme Bitenler Otomatik Gizlenir) */
                            <div className="space-y-4 flex-1 flex flex-col min-h-0">
                                {/* FİLTRELEME */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 shrink-0">
                                    <div className="relative">
                                        <Search className="absolute left-3.5 top-3 w-4 h-4 text-gray-400" />
                                        <input 
                                            type="text" 
                                            placeholder="Hazırlığı yapılan kalıp adına göre ara..." 
                                            value={prepSearchTerm} 
                                            onChange={(e) => setPrepSearchTerm(e.target.value)} 
                                            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-bold text-sm outline-none focus:border-green-500 shadow-sm" 
                                        />
                                    </div>
                                    <div className="relative">
                                        <select 
                                            value={prepMachineFilter} 
                                            onChange={(e) => setPrepMachineFilter(e.target.value)}
                                            className="w-full p-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-bold text-sm outline-none focus:border-green-500 shadow-sm"
                                        >
                                            <option value="">Tüm Hedef Tezgahlar</option>
                                            {machines?.map(m => (
                                                <option key={m.id} value={m.name}>{m.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                {activePreparedTasks.filter(t => 
                                    (!prepSearchTerm.trim() || t.moldName.toLowerCase().includes(prepSearchTerm.toLowerCase().trim())) &&
                                    (!prepMachineFilter || t.camPreparation?.targetMachineName === prepMachineFilter)
                                ).length > 0 ? (
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 overflow-y-auto custom-scrollbar pr-2 flex-1 min-h-0 content-start">
                                        {activePreparedTasks.filter(t => 
                                            (!prepSearchTerm.trim() || t.moldName.toLowerCase().includes(prepSearchTerm.toLowerCase().trim())) &&
                                            (!prepMachineFilter || t.camPreparation?.targetMachineName === prepMachineFilter)
                                        ).map(task => (
                                            <div key={task.id} className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm flex flex-col hover:border-green-300 transition-colors">
                                                <div className="mb-3">
                                                    <div className="text-xs font-bold text-gray-500 uppercase">{task.moldName}</div>
                                                    <h4 className="font-bold text-lg text-gray-900 dark:text-white">{task.taskName}</h4>
                                                    <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">Hedef Tezgah: <strong>{task.camPreparation.targetMachineName}</strong></div>
                                                    <div className="text-[10px] text-gray-400 mt-1">{task.camPreparation.preparedBy} • {new Date(task.camPreparation.preparedAt).toLocaleDateString('tr-TR')}</div>
                                                    <div className="flex gap-1.5 flex-wrap mt-2">
                                                        <span className="text-[10px] font-bold bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 px-2 py-0.5 rounded-full flex items-center gap-1">
                                                            <Truck className="w-3 h-3" /> Forklift Görevi
                                                        </span>
                                                        {task.camPreparation.requiredTools && task.camPreparation.requiredTools.length > 0 && (
                                                            <span className="text-[10px] font-bold bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300 px-2 py-0.5 rounded-full flex items-center gap-1">
                                                                <Wrench className="w-3 h-3" /> {task.camPreparation.requiredTools.length} Takım Talebi
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="mt-auto pt-3 border-t dark:border-gray-700 flex flex-col gap-2">
                                                    <button 
                                                        onClick={() => setToolReqModal({ isOpen: true, moldId: task.moldId, taskId: task.id, moldName: task.moldName, taskName: task.taskName })} 
                                                        className="w-full py-1.5 bg-orange-50 hover:bg-orange-100 text-orange-700 dark:bg-orange-900/20 dark:text-orange-300 rounded-lg text-xs font-bold transition flex items-center justify-center border border-orange-200 dark:border-orange-800"
                                                    >
                                                        <Wrench className="w-3.5 h-3.5 mr-1 text-orange-500" /> Takım Talebini Görüntüle / Takip Et
                                                    </button>
                                                    <div className="flex gap-2">
                                                        <button onClick={() => { const proj = projects.find(p => p.id === task.moldId); setSelectedPrepMold(proj); setPrepTask(task); setIsCamPrepModalOpen(true); }} className="flex-1 py-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg text-xs font-bold transition flex items-center justify-center"><Edit2 className="w-3 h-3 mr-1" /> Düzenle</button>
                                                        <button onClick={() => handleDeleteCamPrep(task.moldId, task.id)} className="flex-1 py-1.5 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg text-xs font-bold transition flex items-center justify-center"><Trash2 className="w-3 h-3 mr-1" /> Sil</button>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-center py-20 opacity-60">
                                        <Settings className="w-16 h-16 mx-auto mb-3 text-gray-400" />
                                        <p className="text-lg font-bold text-gray-500">Aktif olarak ön hazırlığı yapılmış ve işlenen parça bulunamadı.</p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>
            
            {/* MODALLAR */}
            {isOpen && type === 'progress' && <ProgressUpdateModal isOpen={isOpen} onClose={handleCloseModal} mold={mold} task={task} operation={operation} onSubmit={handleProgressSubmit} onNeedsMachineOpReview={handleNeedsMachineOpReview} />}
            {isOpen && type === 'cam_review' && <CamReviewMachineOpModal isOpen={isOpen} onClose={handleCloseModal} mold={mold} task={task} operation={operation} onSubmit={handleUpdateOperation} />}
            {isOpen && (type === 'resume' || type === 'assign') && <AssignOperationModal isOpen={isOpen} onClose={handleCloseModal} mold={mold} task={task} operation={operation} loggedInUser={loggedInUser} onSubmit={handleUpdateOperation} projects={projects} personnel={personnel} machines={machines} />}
            {isOpen && type === 'add_operation' && <AddOperationModal isOpen={isOpen} onClose={handleCloseModal} mold={mold} task={task} onSubmit={handleAddOperation} />}
            {isOpen && type === 'change_operator' && <ChangeOperatorModal isOpen={isOpen} onClose={handleCloseModal} mold={mold} task={task} operation={operation} personnel={personnel} onSubmit={handleSubmitChangeOperator} />}
            <CamPreparationModal isOpen={isCamPrepModalOpen} onClose={() => { setIsCamPrepModalOpen(false); setPrepOperation(null); }} mold={selectedPrepMold} task={prepTask} operation={prepOperation} machines={machines} loggedInUser={loggedInUser} onSave={handleSaveCamPrep} />
            
            {/* HIZLI TEZGAH PLANLAMA MODALI */}
            {quickPlanModal.isOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md p-5 border border-gray-200 dark:border-gray-700 space-y-4">
                        <div className="flex justify-between items-center border-b dark:border-gray-700 pb-3">
                            <div className="flex items-center gap-2">
                                <div className="p-2 rounded-lg bg-purple-100 text-purple-600 dark:bg-purple-900/50 dark:text-purple-300">
                                    <Calendar className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="font-extrabold text-base text-gray-900 dark:text-white">Tezgah Planla</h3>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">Hedef tezgah ve tahmini süreyi belirleyin</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setQuickPlanModal({ isOpen: false, mold: null, task: null, operation: null, machineName: '', camDays: '', camHours: '', operatorName: '' })}
                                className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Yüksek Kontrastlı Kalıp, Parça ve Operasyon Bilgi Kutusu */}
                        <div className="bg-slate-100 dark:bg-slate-700/70 p-3.5 rounded-xl text-xs space-y-2 border border-slate-200 dark:border-slate-600 shadow-inner">
                            <div className="flex items-center gap-2">
                                <span className="text-slate-700 dark:text-slate-300 font-bold min-w-[75px]">Kalıp:</span>
                                <span className="text-purple-700 dark:text-purple-300 font-black text-sm">{quickPlanModal.mold?.moldName}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-slate-700 dark:text-slate-300 font-bold min-w-[75px]">Parça:</span>
                                <span className="text-slate-900 dark:text-white font-black text-sm">{quickPlanModal.task?.taskName}</span>
                            </div>
                            {quickPlanModal.operation && (
                                <div className="flex items-center gap-2 pt-1.5 border-t border-slate-200 dark:border-slate-600">
                                    <span className="text-slate-700 dark:text-slate-300 font-bold min-w-[75px]">Operasyon:</span>
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-cyan-700 dark:text-cyan-300 font-black text-xs">{quickPlanModal.operation.type || 'İşleme'}</span>
                                        {quickPlanModal.operation.workOrderNo && (
                                            <span className="font-mono text-[10px] font-black px-2 py-0.5 rounded bg-blue-600 text-white dark:bg-cyan-400 dark:text-slate-950 shadow-2xs">
                                                {quickPlanModal.operation.workOrderNo}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="space-y-3">
                            {/* Tezgah Seçimi */}
                            <div>
                                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                                    Hedef Tezgah <span className="text-red-500">* (Zorunlu)</span>
                                </label>
                                <select
                                    value={quickPlanModal.machineName}
                                    onChange={(e) => setQuickPlanModal(prev => ({ ...prev, machineName: e.target.value }))}
                                    className="w-full p-2.5 text-xs font-bold border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 outline-none"
                                >
                                    <option value="">-- Tezgah Seçiniz --</option>
                                    {machineLoadList.map(m => {
                                        const isBusy = m.status === 'BUSY';
                                        const statusText = isBusy ? `🔴 Dolu (${m.activeJob?.taskName || 'İş Var'} - ${m.totalHours}s)` : (m.queuedJobs.length > 0 ? `🟡 Sırada ${m.queuedJobs.length} İş (${m.totalHours}s)` : '🟢 Boş (Müsait)');
                                        return (
                                            <option key={m.id} value={m.name}>
                                                {m.name} - {statusText}
                                            </option>
                                        );
                                    })}
                                </select>
                            </div>

                            {/* Öngörülen CAM Süresi (Gün ve Saat) - ZORUNLU */}
                            <div className="p-3 rounded-xl border border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/40 dark:bg-indigo-950/20 space-y-2">
                                <div className="flex justify-between items-center">
                                    <label className="text-xs font-bold text-gray-800 dark:text-gray-200 flex items-center gap-1">
                                        <Clock className="w-3.5 h-3.5 text-indigo-500" />
                                        <span>Öngörülen CAM Süresi <span className="text-red-500">* (Zorunlu)</span></span>
                                    </label>
                                    {calculateTotalHoursFromDaysAndHours(quickPlanModal.camDays, quickPlanModal.camHours) > 0 && (
                                        <span className="text-[11px] font-black text-indigo-700 dark:text-indigo-300 bg-indigo-100 dark:bg-indigo-900/50 px-2 py-0.5 rounded border border-indigo-200 dark:border-indigo-800">
                                            {formatDurationHours(calculateTotalHoursFromDaysAndHours(quickPlanModal.camDays, quickPlanModal.camHours))}
                                        </span>
                                    )}
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1">Gün</label>
                                        <input
                                            type="number"
                                            min="0"
                                            step="1"
                                            placeholder="Örn: 1"
                                            value={quickPlanModal.camDays}
                                            onChange={(e) => setQuickPlanModal(prev => ({ ...prev, camDays: e.target.value }))}
                                            className="w-full p-2 text-xs font-bold border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-1 focus:ring-purple-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1">Saat</label>
                                        <input
                                            type="number"
                                            min="0"
                                            max="23.9"
                                            step="0.5"
                                            placeholder="Örn: 12"
                                            value={quickPlanModal.camHours}
                                            onChange={(e) => setQuickPlanModal(prev => ({ ...prev, camHours: e.target.value }))}
                                            className="w-full p-2 text-xs font-bold border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-1 focus:ring-purple-500"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-end gap-2 pt-2 border-t dark:border-gray-700">
                            <button
                                type="button"
                                onClick={() => setQuickPlanModal({ isOpen: false, mold: null, task: null, operation: null, machineName: '', camDays: '', camHours: '', operatorName: '' })}
                                className="px-4 py-2 text-xs font-bold text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-xl hover:bg-gray-200 transition"
                            >
                                İptal
                            </button>
                            <button
                                type="button"
                                onClick={handleSaveQuickPlan}
                                disabled={!quickPlanModal.machineName || calculateTotalHoursFromDaysAndHours(quickPlanModal.camDays, quickPlanModal.camHours) <= 0}
                                className="px-4 py-2 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition flex items-center gap-1.5 shadow-sm"
                            >
                                <CheckCircle className="w-3.5 h-3.5" />
                                <span>Planla ve Kuyruğa Al</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* TEZGAH DOLULUK VE ZAMAN ÇİZELGESİ (GANTT) BÜYÜK MODALI */}
            <MachineGanttModal
                isOpen={isMachineGanttOpen}
                onClose={() => setIsMachineGanttOpen(false)}
                machineLoadList={machineLoadList}
            />

            
            {/* TAKIMHANE TALEBİ CANLI TAKİP MODALI */}
            <ViewToolRequestModal 
                isOpen={toolReqModal.isOpen} 
                onClose={() => setToolReqModal({ isOpen: false, moldId: null, taskId: null, moldName: '', taskName: '' })} 
                moldId={toolReqModal.moldId} 
                taskId={toolReqModal.taskId} 
                moldName={toolReqModal.moldName} 
                taskName={toolReqModal.taskName} 
                loggedInUser={loggedInUser} 
                onCreateRequest={(mId, tId) => {
                    const foundMold = projects.find(p => p.id === mId);
                    const foundTask = foundMold?.tasks?.find(t => t.id === tId);
                    if (foundMold && foundTask) {
                        setSelectedPrepMold(foundMold);
                        setPrepTask(foundTask);
                        setIsCamPrepModalOpen(true);
                    }
                }}
            />
            
            {/* YENİ VE BÜYÜTÜLMÜŞ: TEZGAHA İLAVE ÇOKLU PARÇA MODALI (SPLIT SCREEN) */}
            {multiPartModal.isOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col border border-gray-200 dark:border-gray-700" style={{ maxHeight: '90vh' }}>
                        
                        {/* Modal Başlık */}
                        <div className="bg-indigo-600 p-5 text-white flex justify-between items-center shrink-0 shadow-md z-10 rounded-t-2xl">
                            <div>
                                <h3 className="text-xl font-black flex items-center tracking-wide"><PlusCircle className="w-6 h-6 mr-2" /> Tezgaha Parça İlave Et</h3>
                                <p className="text-indigo-200 text-sm mt-1"><strong>{multiPartModal.machineName}</strong> tezgahına ek (ortak işleme) parçalar bağlanıyor</p>
                            </div>
                            <button onClick={() => { setMultiPartModal({ isOpen: false, machineName: '', machineOperatorName: '' }); setMpSelectedMold(''); setMpSelectedTasks([]); setMpSearchTerm(''); }} className="text-indigo-200 hover:text-white transition bg-indigo-700/50 hover:bg-indigo-700 p-2 rounded-lg">
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        {/* Modal Gövde (Split Screen) - Kaydırma Sorunu Çözüldü */}
                        <div className="flex-1 min-h-0 p-4 md:p-6 bg-gray-50 dark:bg-gray-900/50 flex flex-col">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 flex-1 min-h-0">
                                
                                {/* SOL KOLON: KALIP ARAMA VE SEÇİMİ */}
                                <div className="flex flex-col bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm min-h-0">
                                    <div className="p-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 shrink-0">
                                        <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">1. Kalıp Ara ve Seç</label>
                                        <div className="relative">
                                            <Search className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                                            <input 
                                                type="text" 
                                                placeholder="Kalıp adı yazın..." 
                                                value={mpSearchTerm}
                                                onChange={(e) => { setMpSearchTerm(e.target.value); setMpSelectedMold(''); setMpSelectedTasks([]); }}
                                                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 transition-shadow"
                                            />
                                        </div>
                                    </div>
                                    <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1 min-h-0">
                                        {projects.filter(p => p.status !== 'TAMAMLANDI' && p.moldName.toLowerCase().includes(mpSearchTerm.toLowerCase())).map(m => (
                                            <button 
                                                key={m.id}
                                                onClick={() => { setMpSelectedMold(m.id); setMpSelectedTasks([]); }} 
                                                className={`w-full text-left p-3 rounded-lg border transition-all ${mpSelectedMold === m.id ? 'bg-indigo-50 border-indigo-500 dark:bg-indigo-900/30 dark:border-indigo-400 shadow-sm' : 'bg-transparent border-transparent hover:bg-gray-50 dark:hover:bg-gray-700/50 text-gray-700 dark:text-gray-300'}`}
                                            >
                                                <div className="font-bold text-base">{m.moldName}</div>
                                                <div className="text-xs opacity-70 mt-0.5">{m.customer}</div>
                                            </button>
                                        ))}
                                        {projects.filter(p => p.status !== 'TAMAMLANDI' && p.moldName.toLowerCase().includes(mpSearchTerm.toLowerCase())).length === 0 && (
                                            <div className="text-center p-6 text-gray-400 text-sm font-bold">Kalıp bulunamadı.</div>
                                        )}
                                    </div>
                                </div>

                                {/* SAĞ KOLON: ÇOKLU PARÇA SEÇİMİ */}
                                <div className="flex flex-col bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm min-h-0">
                                    <div className="p-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 flex justify-between items-center shrink-0">
                                        <label className="text-sm font-bold text-gray-700 dark:text-gray-300">2. İşlenecek Parçalar</label>
                                        {mpSelectedTasks.length > 0 && (
                                            <span className="bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300 text-xs font-black px-2 py-1 rounded-md">
                                                {mpSelectedTasks.length} Seçildi
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex-1 overflow-y-auto custom-scrollbar p-3 min-h-0">
                                        {mpSelectedMold ? (
                                            <div className="space-y-2">
                                                {projects.find(p => p.id === mpSelectedMold)?.tasks?.length > 0 ? (
                                                    projects.find(p => p.id === mpSelectedMold).tasks.map(t => (
                                                        <label 
                                                            key={t.id} 
                                                            className={`flex items-center p-3 rounded-lg border-2 cursor-pointer transition-all ${mpSelectedTasks.includes(t.id) ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 dark:border-indigo-400' : 'border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-600'}`}
                                                        >
                                                            <div className="flex items-center justify-center relative w-6 h-6 rounded mr-3 shrink-0">
                                                                <input 
                                                                    type="checkbox" 
                                                                    className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500 cursor-pointer"
                                                                    checked={mpSelectedTasks.includes(t.id)} 
                                                                    onChange={() => toggleMpTask(t.id)} 
                                                                />
                                                            </div>
                                                            <span className={`font-bold text-base select-none ${mpSelectedTasks.includes(t.id) ? 'text-indigo-900 dark:text-indigo-300' : 'text-gray-700 dark:text-gray-300'}`}>
                                                                {t.taskName}
                                                            </span>
                                                        </label>
                                                    ))
                                                ) : (
                                                    <div className="text-center p-10 text-gray-400 font-bold border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
                                                        Bu kalıba ait henüz parça tanımlanmamış.
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="h-full flex flex-col items-center justify-center text-gray-400 opacity-60">
                                                <CheckSquare className="w-16 h-16 mb-4" />
                                                <p className="font-bold text-center px-6">Parçaları görebilmek için önce sol taraftan bir kalıp seçiniz.</p>
                                            </div>
                                        )}
                                    </div>
                                </div>

                            </div>
                        </div>

                        {/* Modal Alt Butonlar */}
                        <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex justify-between items-center shrink-0 rounded-b-2xl">
                            <div className="text-xs text-gray-500 dark:text-gray-400 font-medium px-2">
                                Seçilen parçalar doğrudan <strong>{multiPartModal.machineName}</strong> tezgahında aktif edilecektir.
                            </div>
                            <div className="flex gap-3">
                                <button onClick={() => { setMultiPartModal({ isOpen: false, machineName: '', machineOperatorName: '' }); setMpSelectedMold(''); setMpSelectedTasks([]); setMpSearchTerm(''); }} className="px-5 py-2.5 text-gray-600 dark:text-gray-300 font-bold hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition">İptal</button>
                                <button 
                                    onClick={submitMultiPart} 
                                    disabled={mpSelectedTasks.length === 0}
                                    className={`px-6 py-2.5 font-bold rounded-lg transition shadow-md flex items-center ${mpSelectedTasks.length > 0 ? 'bg-indigo-600 hover:bg-indigo-700 text-white active:scale-95' : 'bg-gray-300 dark:bg-gray-700 text-gray-500 cursor-not-allowed'}`}
                                >
                                    <PlayCircle className="w-5 h-5 mr-2"/> {mpSelectedTasks.length > 0 ? `${mpSelectedTasks.length} Parçayı Ekle ve Başlat` : 'Ekle ve Başlat'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CamDashboard;