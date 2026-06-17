// src/pages/CamDashboard.js

import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';

// İkonlar
import { Edit2, PlayCircle, ChevronDown, ChevronUp, Box, Layers, Clock, Users, ExternalLink, Monitor, Search, Settings, CheckCircle, Trash2 } from 'lucide-react'; 

// Sabitler
import { OPERATION_STATUS } from '../config/constants.js';
import { PROJECT_COLLECTION } from '../config/constants.js';
import { db, doc, updateDoc } from '../config/firebase.js';

// Yardımcı Fonksiyonlar
import { formatDateTime } from '../utils/dateUtils.js';
import { getStatusClasses } from '../utils/styleUtils.js';

// Modallar
import ProgressUpdateModal from '../components/Modals/ProgressUpdateModal.js';
import CamReviewMachineOpModal from '../components/Modals/CamReviewMachineOpModal.js';
import AssignOperationModal from '../components/Modals/AssignOperationModal.js'; 
import ChangeOperatorModal from '../components/Modals/ChangeOperatorModal.js';
import CamPreparationModal from './CamPreparationModal.js';


const CamDashboard = ({ loggedInUser, projects, handleUpdateOperation, handleChangeMachineOperator, personnel, machines }) => {
    const [modalState, setModalState] = useState({ isOpen: false, type: null, data: null });
    const [activeTab, setActiveTab] = useState('active');
    
    // Hangi kalıbın detayının açık olduğunu tutan state
    const [expandedMoldId, setExpandedMoldId] = useState(null);
    
    // --- CAM ÖN HAZIRLIK STATE'LERİ ---
    const [prepSearchTerm, setPrepSearchTerm] = useState('');
    const [selectedPrepMold, setSelectedPrepMold] = useState(null);
    const [isCamPrepModalOpen, setIsCamPrepModalOpen] = useState(false);
    const [prepTask, setPrepTask] = useState(null);

    // HAZIRLANMIŞ İŞLERİ TOPLA
    const allPreparedTasks = useMemo(() => {
        if (!projects) return [];
        return projects.flatMap(p => 
            (p.tasks || []).filter(t => t.camPreparation && t.camPreparation.status === 'HAZIRLANDI')
            .map(t => ({
                ...t,
                moldId: p.id,
                moldName: p.moldName,
                customer: p.customer
            }))
        );
    }, [projects]);

    // --- VERİ GRUPLAMA MANTIĞI: AKTIF İŞLER (IN_PROGRESS, PAUSED, vb) ---
    const groupedActiveWork = useMemo(() => {
        const groups = {};

        projects.forEach(mold => {
            mold.tasks.forEach(task => {
                if (!task.operations) return;
                
                task.operations.forEach(op => {
                    // Sadece bu operatöre atanmış ve AKTIF (başlamış ama bitmemiş) işleri al
                    const isAssigned = op.assignedOperator === loggedInUser.name;
                    const isActive = op.status !== OPERATION_STATUS.NOT_STARTED && op.status !== OPERATION_STATUS.COMPLETED;
                    
                    if (isAssigned && isActive) {
                        if (!groups[mold.id]) {
                            groups[mold.id] = {
                                moldInfo: {
                                    id: mold.id,
                                    name: mold.moldName,
                                    customer: mold.customer,
                                    deadline: mold.moldDeadline
                                },
                                operations: []
                            };
                        }

                        groups[mold.id].operations.push({
                            ...op,
                            taskName: task.taskName,
                            taskId: task.id,
                            moldId: mold.id
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

    // --- VERİ GRUPLAMA MANTIĞI: PLANLANAN İŞLER (Tezgaha atanmış) ---
    const groupedPlannedWork = useMemo(() => {
        const groups = {};

        projects.forEach(mold => {
            // Operatörün kalıpla ilişkisi var mı?
            const isResponsible = mold.camResponsible === loggedInUser.name || 
                                  mold.tasks?.some(t => t.operations?.some(op => op.assignedOperator === loggedInUser.name));

            if (isResponsible) {
                mold.tasks?.forEach(task => {
                    if (task.plannedMachine) {
                        const isTaskCompleted = task.operations?.length > 0 && task.operations.every(op => op.status === OPERATION_STATUS.COMPLETED);
                        const hasActiveOperation = task.operations?.some(op => op.status !== OPERATION_STATUS.NOT_STARTED && op.status !== OPERATION_STATUS.COMPLETED);
                        
                        if (!isTaskCompleted && !hasActiveOperation) {
                            if (!groups[mold.id]) {
                                groups[mold.id] = {
                                    moldInfo: {
                                        id: mold.id,
                                        name: mold.moldName,
                                        customer: mold.customer,
                                    },
                                    tasks: []
                                };
                            }
                            groups[mold.id].tasks.push(task);
                        }
                    }
                });
            }
        });

        return Object.values(groups);
    }, [projects, loggedInUser.name]);

    const toggleExpand = (moldId) => {
        setExpandedMoldId(prev => prev === moldId ? null : moldId);
    };

    const handleProgressClick = (moldId, moldName, taskId, taskName, operation) => {
        const mold = { id: moldId, moldName };
        const task = { id: taskId, taskName };
        setModalState({ isOpen: true, type: 'progress', data: { mold, task, operation } });
    };

    const handleResumeClick = (moldId, moldName, taskId, taskName, operation) => {
        const mold = { id: moldId, moldName };
        const task = { id: taskId, taskName };
        setModalState({ isOpen: true, type: 'resume', data: { mold, task, operation } });
    };

    const handleChangeOperatorClick = (moldId, moldName, taskId, taskName, operation) => {
        const mold = { id: moldId, moldName };
        const task = { id: taskId, taskName };
        setModalState({ isOpen: true, type: 'change_operator', data: { mold, task, operation } });
    };

    const handleNeedsMachineOpReview = (operationWithProgress) => {
        setModalState(prevState => ({
            isOpen: true,
            type: 'cam_review',
            data: { ...prevState.data, operation: operationWithProgress }
        }));
    };
    
    const handleCloseModal = () => {
        setModalState({ isOpen: false, type: null, data: null });
    };
    
    // --- DÜZELTME BURADA: actionType ve pauseReason eklendi ---
    const handleProgressSubmit = async (moldId, taskId, updatedOperation, actionType = null, pauseReason = null) => {
        let finalOperation = { ...updatedOperation };

        if (finalOperation.progressPercentage === 100) {
            finalOperation.status = OPERATION_STATUS.COMPLETED;
            if (!finalOperation.finishDate) {
                finalOperation.finishDate = new Date().toISOString();
            }
        }

        // Parametreler eksiksiz olarak ana fonksiyona (App.js'e) iletiliyor
        await handleUpdateOperation(moldId, taskId, finalOperation, actionType, pauseReason);
        handleCloseModal();
    };
    // -------------------------------------------------------------

    const handleSubmitChangeOperator = async (moldId, taskId, opId, newOperatorName, rating, comment) => {
        await handleChangeMachineOperator(moldId, taskId, opId, newOperatorName, rating, comment);
        handleCloseModal();
    };

    // --- CAM HAZIRLIĞI KAYDETME (FIREBASE) ---
    const handleSaveCamPrep = async (moldId, taskId, camPrepData) => {
        try {
            const moldRef = doc(db, PROJECT_COLLECTION, moldId);
            const moldToUpdate = projects.find(p => p.id === moldId);
            if (!moldToUpdate) return;
            
            const updatedTasks = moldToUpdate.tasks.map(t => {
                if (t.id === taskId) {
                    return { ...t, camPreparation: camPrepData };
                }
                return t;
            });
            
            await updateDoc(moldRef, { tasks: updatedTasks });
            alert("CAM Ön Hazırlık başarıyla kaydedildi!");
            setSelectedPrepMold({ ...moldToUpdate, tasks: updatedTasks }); // Ekranda anında yeşile dönmesi için
            setIsCamPrepModalOpen(false);
        } catch (error) {
            console.error("CAM Hazırlık kaydetme hatası:", error);
            alert("Kaydedilirken bir hata oluştu.");
        }
    };

    // --- CAM HAZIRLIĞI SİLME (FIREBASE) ---
    const handleDeleteCamPrep = async (moldId, taskId) => {
        if (!window.confirm("Bu ön hazırlığı silmek istediğinize emin misiniz?")) return;
        try {
            const moldRef = doc(db, PROJECT_COLLECTION, moldId);
            const moldToUpdate = projects.find(p => p.id === moldId);
            if (!moldToUpdate) return;
            
            const updatedTasks = moldToUpdate.tasks.map(t => {
                if (t.id === taskId) {
                    const newTask = { ...t };
                    delete newTask.camPreparation;
                    return newTask;
                }
                return t;
            });
            
            await updateDoc(moldRef, { tasks: updatedTasks });
            alert("Ön hazırlık başarıyla silindi!");
            if (selectedPrepMold && selectedPrepMold.id === moldId) {
                setSelectedPrepMold({ ...moldToUpdate, tasks: updatedTasks });
            }
        } catch (error) {
            console.error("CAM Hazırlık silme hatası:", error);
            alert("Silinirken bir hata oluştu.");
        }
    };

    const { isOpen, type, data } = modalState;
    const { mold, task, operation } = data || {};

    return (
        <div className="p-4 bg-white dark:bg-gray-800 rounded-xl shadow-xl min-h-[80vh]">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center">
                    <Layers className="w-6 h-6 mr-2 text-blue-600" />
                    İşlerim
                </h2>
                <div className="flex gap-2 bg-gray-100 dark:bg-gray-700 p-1 rounded-lg">
                    <button 
                        onClick={() => setActiveTab('active')}
                        className={`px-4 py-2 rounded-md text-sm font-bold transition-all ${activeTab === 'active' ? 'bg-white dark:bg-gray-600 shadow text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}`}
                    >
                        Aktif Çalışan ({groupedActiveWork.length})
                    </button>
                    <button 
                        onClick={() => setActiveTab('planned')}
                        className={`px-4 py-2 rounded-md text-sm font-bold transition-all flex items-center relative ${activeTab === 'planned' ? 'bg-white dark:bg-gray-600 shadow text-purple-600 dark:text-purple-400' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}`}
                    >
                        Planlanan İşler ({groupedPlannedWork.length})
                        {/* Yeni planlanan iş varsa yanıp sönen bildirim noktası göster */}
                        {groupedPlannedWork.length > 0 && (
                            <span className="absolute -top-1 -right-1 flex h-3 w-3">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-3 w-3 bg-purple-500"></span>
                            </span>
                        )}
                    </button>
                    <button 
                        onClick={() => setActiveTab('prep')}
                        className={`px-4 py-2 rounded-md text-sm font-bold transition-all flex items-center ${activeTab === 'prep' ? 'bg-white dark:bg-gray-600 shadow text-green-600 dark:text-green-400' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}`}
                    >
                        <Settings className="w-4 h-4 mr-2" /> Ön Hazırlık
                    </button>
                </div>
            </div>

            {activeTab === 'active' ? (
                groupedActiveWork.length === 0 ? (
                    <div className="text-center py-12 bg-gray-50 dark:bg-gray-700 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-600">
                        <Box className="w-12 h-12 mx-auto text-gray-400 mb-3" />
                        <p className="text-gray-500 dark:text-gray-400 font-medium">
                            Şu anda çalıştığınız aktif bir iş bulunmamaktadır.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {groupedActiveWork.map((group) => {
                            const isExpanded = expandedMoldId === group.moldInfo.id;
                            const activeCount = group.operations.filter(op => op.status === OPERATION_STATUS.IN_PROGRESS).length;
                            
                            return (
                                <div key={`active-${group.moldInfo.id}`} className={`border rounded-xl transition-all duration-300 overflow-hidden ${activeCount > 0 ? 'border-blue-500 shadow-md shadow-blue-100 dark:shadow-none' : 'border-gray-200 dark:border-gray-700'}`}>
                                    
                                    {/* --- KALIP KARTI BAŞLIĞI --- */}
                                    <div 
                                        onClick={() => toggleExpand(group.moldInfo.id)}
                                        className={`p-4 cursor-pointer flex flex-col md:flex-row md:justify-between md:items-center gap-4 ${isExpanded ? 'bg-gray-50 dark:bg-gray-700/50' : 'bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                                    >
                                        <div className="flex items-center space-x-4 flex-1">
                                            <div className={`p-3 rounded-full flex-shrink-0 ${activeCount > 0 ? 'bg-blue-100 text-blue-600 animate-pulse' : 'bg-gray-100 text-gray-500 dark:bg-gray-600 dark:text-gray-300'}`}>
                                                <Box className="w-6 h-6" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <h3 className="text-lg font-bold text-gray-900 dark:text-white truncate">{group.moldInfo.name}</h3>
                                                    <Link 
                                                        to={`/mold/${group.moldInfo.id}`} 
                                                        onClick={(e) => e.stopPropagation()} 
                                                        className="inline-flex items-center px-2 py-1 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-blue-600 dark:text-blue-400 text-xs font-bold rounded transition"
                                                        title="Kalıp Detay Sayfasına Git"
                                                    >
                                                        Detaya Git <ExternalLink className="w-3 h-3 ml-1" />
                                                    </Link>
                                                </div>
                                                <p className="text-sm text-gray-500 dark:text-gray-400 font-medium truncate">
                                                    {group.moldInfo.customer} • <span className="text-blue-600 dark:text-blue-400">{group.operations.length} Parça İşleniyor</span>
                                                </p>
                                            </div>
                                        </div>
                                        
                                        <div className="flex items-center space-x-4 flex-shrink-0">
                                            {activeCount > 0 && (
                                                <span className="px-3 py-1 bg-green-100 text-green-800 text-xs font-bold rounded-full dark:bg-green-900 dark:text-green-200 flex items-center">
                                                    <Clock className="w-3 h-3 mr-1" /> Aktif Çalışıyor
                                                </span>
                                            )}
                                            {isExpanded ? <ChevronUp className="w-6 h-6 text-gray-400" /> : <ChevronDown className="w-6 h-6 text-gray-400" />}
                                        </div>
                                    </div>

                                    {/* --- İÇERİK --- */}
                                    {isExpanded && (
                                        <div className="border-t border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 space-y-3 animation-slide-down">
                                            {group.operations.map(op => (
                                                <div key={op.id} className={`p-4 border rounded-lg flex flex-col md:flex-row justify-between items-start md:items-center gap-4 ${op.status === OPERATION_STATUS.PAUSED ? 'bg-orange-50 border-orange-200 dark:bg-orange-900/10 dark:border-orange-700' : 'bg-gray-50 border-gray-200 dark:bg-gray-700/30 dark:border-gray-600'}`}>
                                                    
                                                    <div className="flex-1">
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <h4 className="font-bold text-gray-800 dark:text-white">{op.taskName}</h4>
                                                            <span className="px-2 py-0.5 bg-white dark:bg-gray-600 border border-gray-200 dark:border-gray-500 rounded text-xs font-bold text-gray-600 dark:text-gray-300">
                                                                {op.type}
                                                            </span>
                                                        </div>
                                                        
                                                        <div className="text-xs text-gray-500 dark:text-gray-400 space-y-0.5">
                                                            <p>Tezgah: <span className="font-semibold">{op.machineName}</span> | Op: {op.machineOperatorName}</p>
                                                            <p>Başlangıç: {formatDateTime(op.startDate)}</p>
                                                        </div>

                                                        <div className="w-full bg-gray-200 rounded-full h-2 dark:bg-gray-600 mt-2 max-w-xs">
                                                            <div 
                                                                className={`h-2 rounded-full ${op.status === OPERATION_STATUS.PAUSED ? 'bg-orange-500' : 'bg-blue-600'}`} 
                                                                style={{ width: `${op.progressPercentage}%` }}
                                                            ></div>
                                                        </div>
                                                    </div>

                                                    <div className="flex flex-col items-end gap-2 min-w-[140px]">
                                                        <span className={`px-3 py-1 text-xs font-bold rounded-full ${getStatusClasses(op.status)}`}>
                                                            {op.status}
                                                        </span>
                                                        
                                                        {op.status === OPERATION_STATUS.IN_PROGRESS && (
                                                            <div className="w-full flex flex-col gap-2">
                                                                <button
                                                                    onClick={() => handleProgressClick(group.moldInfo.id, group.moldInfo.name, op.taskId, op.taskName, op)}
                                                                    className="w-full px-3 py-2 bg-green-600 text-white text-sm font-bold rounded-lg hover:bg-green-700 transition flex items-center justify-center shadow-sm"
                                                                >
                                                                    <Edit2 className="w-4 h-4 mr-1"/> Güncelle (%{op.progressPercentage})
                                                                </button>
                                                                
                                                                <button
                                                                    onClick={() => handleChangeOperatorClick(group.moldInfo.id, group.moldInfo.name, op.taskId, op.taskName, op)}
                                                                    className="w-full px-3 py-2 bg-purple-600 text-white text-xs font-bold rounded-lg hover:bg-purple-700 transition flex items-center justify-center shadow-sm"
                                                                >
                                                                    <Users className="w-4 h-4 mr-1"/> Operatör Değiştir
                                                                </button>
                                                            </div>
                                                        )}

                                                        {op.status === OPERATION_STATUS.PAUSED && (
                                                            <button
                                                                onClick={() => handleResumeClick(group.moldInfo.id, group.moldInfo.name, op.taskId, op.taskName, op)}
                                                                className="w-full px-3 py-2 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 transition flex items-center justify-center shadow-sm"
                                                            >
                                                                <PlayCircle className="w-4 h-4 mr-1"/> Devam Et
                                                            </button>
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
                groupedPlannedWork.length === 0 ? (
                    <div className="text-center py-12 bg-gray-50 dark:bg-gray-700 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-600">
                        <Monitor className="w-12 h-12 mx-auto text-gray-400 mb-3" />
                        <p className="text-gray-500 dark:text-gray-400 font-medium">
                            Sorumlu olduğunuz kalıplarda tezgaha planlanmış parça bulunmamaktadır.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {groupedPlannedWork.map((group) => {
                            const isExpanded = expandedMoldId === group.moldInfo.id;
                            
                            return (
                                <div key={`planned-${group.moldInfo.id}`} className="border border-purple-200 dark:border-purple-800 rounded-xl transition-all duration-300 overflow-hidden">
                                    
                                    {/* --- KALIP KARTI BAŞLIĞI --- */}
                                    <div 
                                        onClick={() => toggleExpand(group.moldInfo.id)}
                                        className={`p-4 cursor-pointer flex flex-col md:flex-row md:justify-between md:items-center gap-4 ${isExpanded ? 'bg-purple-50 dark:bg-purple-900/20' : 'bg-white dark:bg-gray-800 hover:bg-purple-50/50 dark:hover:bg-gray-700'}`}
                                    >
                                        <div className="flex items-center space-x-4 flex-1">
                                            <div className="p-3 rounded-full flex-shrink-0 bg-purple-100 text-purple-600 dark:bg-purple-900/50 dark:text-purple-300">
                                                <Monitor className="w-6 h-6" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <h3 className="text-lg font-bold text-gray-900 dark:text-white truncate">{group.moldInfo.name}</h3>
                                                    <Link 
                                                        to={`/mold/${group.moldInfo.id}`} 
                                                        onClick={(e) => e.stopPropagation()} 
                                                        className="inline-flex items-center px-2 py-1 bg-purple-100 hover:bg-purple-200 dark:bg-purple-900/50 dark:hover:bg-purple-800 text-purple-700 dark:text-purple-300 text-xs font-bold rounded transition ml-2"
                                                        title="Kalıp Detay Sayfasına Git"
                                                    >
                                                        Detaya Git <ExternalLink className="w-3 h-3 ml-1" />
                                                    </Link>
                                                </div>
                                                <p className="text-sm text-gray-500 dark:text-gray-400 font-medium truncate">
                                                    {group.moldInfo.customer} • <span className="text-purple-600 dark:text-purple-400">{group.tasks.length} Parça Planlandı</span>
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center space-x-4 flex-shrink-0">
                                            {isExpanded ? <ChevronUp className="w-6 h-6 text-gray-400" /> : <ChevronDown className="w-6 h-6 text-gray-400" />}
                                        </div>
                                    </div>

                                    {/* --- İÇERİK --- */}
                                    {isExpanded && (
                                        <div className="border-t border-purple-100 dark:border-purple-800 bg-white dark:bg-gray-800 p-4 space-y-3 animation-slide-down">
                                            {group.tasks.map(task => {
                                                const firstOp = task.operations?.find(op => op.status !== OPERATION_STATUS.COMPLETED) || task.operations?.[0] || {};
                                                return (
                                                    <div key={task.id} className="p-4 border rounded-lg bg-gray-50 border-gray-200 dark:bg-gray-700/30 dark:border-gray-600 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 hover:border-purple-300 transition-colors">
                                                        <div>
                                                            <h4 className="font-bold text-gray-800 dark:text-white">{task.taskName}</h4>
                                                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                                                <Clock className="w-3 h-3 inline mr-1" />
                                                                Öngörülen Süre: <span className="font-semibold text-gray-700 dark:text-gray-300">{task.estimatedCamTime || '?'} Saat</span>
                                                            </p>
                                                        </div>
                                                        <div className="flex flex-col md:flex-row items-end md:items-center gap-4">
                                                            <div className="flex flex-col items-end md:items-start">
                                                                <span className="text-[10px] font-bold text-gray-500 uppercase mb-1">Planlanan Tezgah</span>
                                                                <span className="px-3 py-1 bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300 font-black rounded-lg text-sm flex items-center border border-purple-200 dark:border-purple-700 shadow-sm">
                                                                    <Monitor className="w-4 h-4 mr-1.5"/> {task.plannedMachine}
                                                                </span>
                                                            </div>
                                                            <button
                                                                onClick={() => handleResumeClick(group.moldInfo.id, group.moldInfo.name, task.id, task.taskName, firstOp)}
                                                                className="px-4 py-2 bg-purple-600 text-white text-sm font-bold rounded-lg hover:bg-purple-700 transition flex items-center shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
                                                            >
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
                <div className="space-y-6 animate-in fade-in">
                    {/* Arama Barı */}
                    <div className="relative max-w-2xl mx-auto mt-4">
                        <Search className="absolute left-4 top-3.5 w-5 h-5 text-gray-400" />
                        <input 
                            type="text" 
                            placeholder="Hazırlık yapılacak kalıbın adını yazın..." 
                            value={prepSearchTerm}
                            onChange={(e) => {
                                setPrepSearchTerm(e.target.value);
                                setSelectedPrepMold(null);
                            }}
                            className="w-full pl-12 pr-4 py-3 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:border-green-500 outline-none transition-all shadow-sm font-bold"
                        />
                        
                        {prepSearchTerm && !selectedPrepMold && (
                            <div className="absolute z-10 w-full mt-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl max-h-60 overflow-y-auto">
                                {projects.filter(p => p.moldName.toLowerCase().includes(prepSearchTerm.toLowerCase()) && p.status !== 'TAMAMLANDI').map(mold => (
                                    <button 
                                        key={mold.id}
                                        onClick={() => { setSelectedPrepMold(mold); setPrepSearchTerm(''); }}
                                        className="w-full text-left px-4 py-3 hover:bg-green-50 dark:hover:bg-gray-700 border-b last:border-0 border-gray-100 dark:border-gray-700 transition-colors"
                                    >
                                        <span className="font-bold text-gray-800 dark:text-white">{mold.moldName}</span>
                                        <span className="text-xs text-gray-500 block">{mold.customer}</span>
                                    </button>
                                ))}
                                {projects.filter(p => p.moldName.toLowerCase().includes(prepSearchTerm.toLowerCase()) && p.status !== 'TAMAMLANDI').length === 0 && (
                                    <div className="p-4 text-center text-gray-500 font-bold">Aradığınız kriterlere uygun kalıp bulunamadı.</div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Seçilen Kalıbın Parçaları */}
                    {selectedPrepMold ? (
                        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 animate-in slide-in-from-bottom-4">
                            <div className="flex justify-between items-center mb-6 border-b dark:border-gray-700 pb-4">
                                <div>
                                    <h3 className="text-2xl font-black text-gray-900 dark:text-white">{selectedPrepMold.moldName}</h3>
                                    <p className="text-sm text-gray-500 font-bold mt-1">Müşteri: {selectedPrepMold.customer}</p>
                                </div>
                                <button onClick={() => {setSelectedPrepMold(null); setPrepSearchTerm('');}} className="text-sm px-4 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 font-bold transition">
                                    Vazgeç / Kapat
                                </button>
                            </div>

                            <div className="space-y-3">
                                {selectedPrepMold.tasks?.map(task => {
                                    const isPrepared = task.camPreparation?.status === 'HAZIRLANDI';
                                    return (
                                        <div key={task.id} className={`flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 md:p-5 rounded-xl border-2 transition-all ${isPrepared ? 'border-green-500 bg-green-50 dark:bg-green-900/10 dark:border-green-800' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-blue-300'}`}>
                                            <div className="mb-3 sm:mb-0">
                                                <h4 className="font-bold text-lg text-gray-900 dark:text-white">{task.taskName}</h4>
                                                {isPrepared ? (
                                                    <div className="text-xs text-green-700 dark:text-green-400 mt-1 font-bold flex items-center">
                                                        <span className="w-2 h-2 rounded-full bg-green-500 mr-2"></span> Hazırlandı (Hedef Tezgah: {task.camPreparation.targetMachineName})
                                                    </div>
                                                ) : (
                                                    <div className="text-xs text-orange-600 dark:text-orange-400 mt-1 font-bold flex items-center">
                                                        <span className="w-2 h-2 rounded-full bg-orange-500 mr-2 animate-pulse"></span> Hazırlık Bekliyor
                                                    </div>
                                                )}
                                            </div>
                                            <button 
                                                onClick={() => { setPrepTask(task); setIsCamPrepModalOpen(true); }} 
                                                className={`w-full sm:w-auto px-6 py-2.5 rounded-lg font-black shadow-sm transition-all active:scale-95 ${isPrepared ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}
                                            >
                                                {isPrepared ? 'Hazırlığı Düzenle' : 'Hazırlık Yap'}
                                            </button>
                                        </div>
                                    )
                                })}
                                {(!selectedPrepMold.tasks || selectedPrepMold.tasks.length === 0) && (
                                    <div className="text-center py-10 text-gray-500 font-bold border-2 border-dashed rounded-xl">Bu kalıba ait henüz bir parça tanımlanmamış.</div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="mt-8">
                            {allPreparedTasks.length > 0 ? (
                                <div>
                                    <h3 className="text-lg font-bold text-gray-800 dark:text-gray-200 mb-4 flex items-center border-b dark:border-gray-700 pb-2">
                                        <CheckCircle className="w-5 h-5 mr-2 text-green-500" />
                                        Ön Hazırlığı Tamamlanmış İşler
                                    </h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {allPreparedTasks.map(task => (
                                            <div key={task.id} className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm flex flex-col hover:border-green-300 transition-colors">
                                                <div className="mb-3">
                                                    <div className="text-xs font-bold text-gray-500 uppercase">{task.moldName}</div>
                                                    <h4 className="font-bold text-lg text-gray-900 dark:text-white">{task.taskName}</h4>
                                                    <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">Hedef Tezgah: <strong>{task.camPreparation.targetMachineName}</strong></div>
                                                    <div className="text-[10px] text-gray-400 mt-1">{task.camPreparation.preparedBy} • {new Date(task.camPreparation.preparedAt).toLocaleDateString('tr-TR')}</div>
                                                </div>
                                                <div className="mt-auto pt-3 border-t dark:border-gray-700 flex gap-2">
                                                    <button onClick={() => { const proj = projects.find(p => p.id === task.moldId); setSelectedPrepMold(proj); setPrepTask(task); setIsCamPrepModalOpen(true); }} className="flex-1 py-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg text-xs font-bold transition flex items-center justify-center">
                                                        <Edit2 className="w-3 h-3 mr-1" /> Düzenle
                                                    </button>
                                                    <button onClick={() => handleDeleteCamPrep(task.moldId, task.id)} className="flex-1 py-1.5 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg text-xs font-bold transition flex items-center justify-center">
                                                        <Trash2 className="w-3 h-3 mr-1" /> Sil
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <div className="text-center py-20 opacity-60">
                                    <Settings className="w-20 h-20 mx-auto mb-4 text-gray-400" />
                                    <p className="text-xl font-bold text-gray-500">Hazırlık yapmak için bir kalıp arayın veya seçin.</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
            
            {/* MODALLAR */}
            {isOpen && type === 'progress' && (
                <ProgressUpdateModal
                    isOpen={isOpen}
                    onClose={handleCloseModal}
                    mold={mold}
                    task={task}
                    operation={operation}
                    onSubmit={handleProgressSubmit} // Artık 5 parametreyi de taşıyor
                    onNeedsMachineOpReview={handleNeedsMachineOpReview}
                />
            )}

            {isOpen && type === 'cam_review' && (
                <CamReviewMachineOpModal
                    isOpen={isOpen}
                    onClose={handleCloseModal}
                    mold={mold}
                    task={task}
                    operation={operation}
                    onSubmit={handleUpdateOperation}
                />
            )}

            {isOpen && type === 'resume' && (
                <AssignOperationModal
                    isOpen={isOpen}
                    onClose={handleCloseModal}
                    mold={mold}
                    task={task}
                    operation={operation} 
                    loggedInUser={loggedInUser}
                    onSubmit={handleUpdateOperation}
                    projects={projects}
                    personnel={personnel}
                    machines={machines}
                />
            )}

            {isOpen && type === 'change_operator' && (
                <ChangeOperatorModal
                    isOpen={isOpen}
                    onClose={handleCloseModal}
                    mold={mold}
                    task={task}
                    operation={operation}
                    personnel={personnel}
                    onSubmit={handleSubmitChangeOperator}
                />
            )}
            
            <CamPreparationModal 
                isOpen={isCamPrepModalOpen}
                onClose={() => setIsCamPrepModalOpen(false)}
                mold={selectedPrepMold}
                task={prepTask}
                machines={machines}
                loggedInUser={loggedInUser}
                onSave={handleSaveCamPrep}
            />
        </div>
    );
};

export default CamDashboard;