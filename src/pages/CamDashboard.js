// src/pages/CamDashboard.js

import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';

// İkonlar
import { Edit2, PlayCircle, ChevronDown, ChevronUp, Box, Layers, Clock, Users, ExternalLink, Monitor, Search, Settings, CheckCircle, Trash2, PlusCircle, X, CheckSquare, Wrench, Truck } from 'lucide-react'; 

// Sabitler
import { OPERATION_STATUS, PROJECT_COLLECTION, LOGISTICS_COLLECTION, LOGISTICS_STATUS } from '../config/constants.js';
import { db, doc, updateDoc, getDoc, collection, addDoc, getDocs, query, where } from '../config/firebase.js';

// Yardımcı Fonksiyonlar
import { formatDateTime, getCurrentDateTimeString } from '../utils/dateUtils.js';
import { getStatusClasses } from '../utils/styleUtils.js';

// Modallar
import ProgressUpdateModal from '../components/Modals/ProgressUpdateModal.js';
import CamReviewMachineOpModal from '../components/Modals/CamReviewMachineOpModal.js';
import AssignOperationModal from '../components/Modals/AssignOperationModal.js'; 
import ChangeOperatorModal from '../components/Modals/ChangeOperatorModal.js';
import CamPreparationModal from './CamPreparationModal.js';
import ViewToolRequestModal from '../components/Modals/ViewToolRequestModal.js';

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

    const groupedPlannedWork = useMemo(() => {
        const groups = {};
        projects.forEach(mold => {
            const isResponsible = mold.camResponsible === loggedInUser.name || mold.tasks?.some(t => t.operations?.some(op => op.assignedOperator === loggedInUser.name));
            if (isResponsible) {
                mold.tasks?.forEach(task => {
                    if (task.plannedMachine) {
                        const isTaskCompleted = task.operations?.length > 0 && task.operations.every(op => op.status === OPERATION_STATUS.COMPLETED);
                        const hasActiveOperation = task.operations?.some(op => op.status !== OPERATION_STATUS.NOT_STARTED && op.status !== OPERATION_STATUS.COMPLETED);
                        
                        if (!isTaskCompleted && !hasActiveOperation) {
                            if (!groups[mold.id]) {
                                groups[mold.id] = {
                                    moldInfo: { id: mold.id, name: mold.moldName, customer: mold.customer },
                                    tasks: []
                                };
                            }
                            groups[mold.id].tasks.push({
                                ...task,
                                moldId: mold.id,
                                moldName: mold.moldName,
                                customer: mold.customer
                            });
                        }
                    }
                });
            }
        });
        return Object.values(groups);
    }, [projects, loggedInUser.name]);

    const plannedWorkByMachine = useMemo(() => {
        const groups = {};
        projects.forEach(mold => {
            const isResponsible = mold.camResponsible === loggedInUser.name || mold.tasks?.some(t => t.operations?.some(op => op.assignedOperator === loggedInUser.name));
            if (isResponsible) {
                mold.tasks?.forEach(task => {
                    if (task.plannedMachine) {
                        const isTaskCompleted = task.operations?.length > 0 && task.operations.every(op => op.status === OPERATION_STATUS.COMPLETED);
                        const hasActiveOperation = task.operations?.some(op => op.status !== OPERATION_STATUS.NOT_STARTED && op.status !== OPERATION_STATUS.COMPLETED);
                        
                        if (!isTaskCompleted && !hasActiveOperation) {
                            const machine = task.plannedMachine;
                            if (!groups[machine]) {
                                groups[machine] = {
                                    machineName: machine,
                                    tasks: []
                                };
                            }
                            groups[machine].tasks.push({
                                ...task,
                                moldId: mold.id,
                                moldName: mold.moldName,
                                customer: mold.customer
                            });
                        }
                    }
                });
            }
        });
        return Object.values(groups).sort((a, b) => a.machineName.localeCompare(b.machineName));
    }, [projects, loggedInUser.name]);

    const activeDisplayData = groupMode === 'mold' ? groupedActiveWork : activeWorkByMachine;
    const plannedDisplayData = groupMode === 'mold' ? groupedPlannedWork : plannedWorkByMachine;

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
                        Planlanan İşler ({groupedPlannedWork.length})
                        {groupedPlannedWork.length > 0 && (
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
                    plannedDisplayData.length === 0 ? (
                        <div className="text-center py-12 bg-gray-50 dark:bg-gray-700 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-600">
                            <Monitor className="w-12 h-12 mx-auto text-gray-400 mb-3" />
                            <p className="text-gray-500 dark:text-gray-400 font-medium">Sorumlu olduğunuz kalıplarda tezgaha planlanmış parça bulunmamaktadır.</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {plannedDisplayData.map((group) => {
                                const groupId = groupMode === 'mold' ? group.moldInfo.id : group.machineName;
                                const isExpanded = expandedMoldId === groupId;
                                return (
                                    <div key={`planned-${groupId}`} className="border border-purple-200 dark:border-purple-800 rounded-xl transition-all duration-300 overflow-hidden">
                                        <div onClick={() => toggleExpand(groupId)} className={`p-4 cursor-pointer flex flex-col md:flex-row md:justify-between md:items-center gap-4 ${isExpanded ? 'bg-purple-50 dark:bg-purple-900/20' : 'bg-white dark:bg-gray-800 hover:bg-purple-50/50 dark:hover:bg-gray-700'}`}>
                                            <div className="flex items-center space-x-4 flex-1">
                                                <div className="p-3 rounded-full flex-shrink-0 bg-purple-100 text-purple-600 dark:bg-purple-900/50 dark:text-purple-300">
                                                    <Monitor className="w-6 h-6" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <h3 className="text-lg font-bold text-gray-900 dark:text-white truncate">
                                                            {groupMode === 'mold' ? group.moldInfo.name : group.machineName}
                                                        </h3>
                                                        {groupMode === 'mold' && (
                                                            <Link to={`/mold/${group.moldInfo.id}`} onClick={(e) => e.stopPropagation()} className="inline-flex items-center px-2 py-1 bg-purple-100 hover:bg-purple-200 dark:bg-purple-900/50 dark:hover:bg-purple-800 text-purple-700 dark:text-purple-300 text-xs font-bold rounded transition ml-2">Detaya Git <ExternalLink className="w-3 h-3 ml-1" /></Link>
                                                        )}
                                                    </div>
                                                    <p className="text-sm text-gray-500 dark:text-gray-400 font-medium truncate">
                                                        {groupMode === 'mold' 
                                                            ? `${group.moldInfo.customer} • ` 
                                                            : ''
                                                        }
                                                        <span className="text-purple-600 dark:text-purple-400">{group.tasks.length} Parça Planlandı</span>
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex items-center space-x-4 flex-shrink-0">
                                                {isExpanded ? <ChevronUp className="w-6 h-6 text-gray-400" /> : <ChevronDown className="w-6 h-6 text-gray-400" />}
                                            </div>
                                        </div>
                                        {isExpanded && (
                                            <div className="border-t border-purple-100 dark:border-purple-800 bg-white dark:bg-gray-800 p-4 space-y-3 animation-slide-down">
                                                {group.tasks.map(task => {
                                                    const firstOp = task.operations?.find(op => op.status !== OPERATION_STATUS.COMPLETED) || task.operations?.[0] || {};
                                                    return (
                                                        <div key={task.id} className="p-4 border rounded-lg bg-gray-50 border-gray-200 dark:bg-gray-700/30 dark:border-gray-600 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 hover:border-purple-300 transition-colors">
                                                            <div>
                                                                <h4 className="font-bold text-gray-800 dark:text-white">{task.taskName}</h4>
                                                                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 space-y-0.5">
                                                                    {groupMode === 'machine' && (
                                                                        <p>Kalıp: <span className="font-semibold text-gray-700 dark:text-gray-300">{task.moldName} ({task.customer})</span></p>
                                                                    )}
                                                                    <p><Clock className="w-3 h-3 inline mr-1" />Öngörülen Süre: <span className="font-semibold text-gray-700 dark:text-gray-300">{task.estimatedCamTime || '?'} Saat</span></p>
                                                                </div>
                                                            </div>
                                                            <div className="flex flex-col md:flex-row items-end md:items-center gap-4">
                                                                {groupMode === 'mold' && (
                                                                    <div className="flex flex-col items-end md:items-start">
                                                                        <span className="text-[10px] font-bold text-gray-500 uppercase mb-1">Planlanan Tezgah</span>
                                                                        <span className="px-3 py-1 bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300 font-black rounded-lg text-sm flex items-center border border-purple-200 dark:border-purple-700 shadow-sm">
                                                                            <Monitor className="w-4 h-4 mr-1.5"/> {task.plannedMachine}
                                                                        </span>
                                                                    </div>
                                                                )}
                                                                <button onClick={() => handleResumeClick(task.moldId, task.moldName, task.id, task.taskName, firstOp)} className="px-4 py-2 bg-purple-600 text-white text-sm font-bold rounded-lg hover:bg-purple-700 transition flex items-center shadow-md hover:shadow-lg transform hover:-translate-y-0.5">
                                                                    <PlayCircle className="w-4 h-4 mr-2"/> İşe Başla
                                                                </button>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )
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
            {isOpen && type === 'resume' && <AssignOperationModal isOpen={isOpen} onClose={handleCloseModal} mold={mold} task={task} operation={operation} loggedInUser={loggedInUser} onSubmit={handleUpdateOperation} projects={projects} personnel={personnel} machines={machines} />}
            {isOpen && type === 'change_operator' && <ChangeOperatorModal isOpen={isOpen} onClose={handleCloseModal} mold={mold} task={task} operation={operation} personnel={personnel} onSubmit={handleSubmitChangeOperator} />}
            <CamPreparationModal isOpen={isCamPrepModalOpen} onClose={() => { setIsCamPrepModalOpen(false); setPrepOperation(null); }} mold={selectedPrepMold} task={prepTask} operation={prepOperation} machines={machines} loggedInUser={loggedInUser} onSave={handleSaveCamPrep} />
            
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