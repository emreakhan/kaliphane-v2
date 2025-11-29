// src/pages/CamDashboard.js

import React, { useState, useMemo } from 'react';

// İkonlar
import { Edit2, PlayCircle, ChevronDown, ChevronUp, Box, Layers, Clock } from 'lucide-react'; 

// Sabitler
import { OPERATION_STATUS } from '../config/constants.js';

// Yardımcı Fonksiyonlar
import { formatDateTime } from '../utils/dateUtils.js';
import { getStatusClasses } from '../utils/styleUtils.js';

// Modallar
import ProgressUpdateModal from '../components/Modals/ProgressUpdateModal.js';
import CamReviewMachineOpModal from '../components/Modals/CamReviewMachineOpModal.js';
import AssignOperationModal from '../components/Modals/AssignOperationModal.js'; 


const CamDashboard = ({ loggedInUser, projects, handleUpdateOperation, personnel, machines }) => {
    const [modalState, setModalState] = useState({ isOpen: false, type: null, data: null });
    
    // Hangi kalıbın detayının açık olduğunu tutan state
    const [expandedMoldId, setExpandedMoldId] = useState(null);

    // --- VERİ GRUPLAMA MANTIĞI ---
    const groupedWork = useMemo(() => {
        const groups = {};

        projects.forEach(mold => {
            mold.tasks.forEach(task => {
                if (!task.operations) return;
                
                task.operations.forEach(op => {
                    // Sadece bu operatöre atanmış ve HENÜZ TAMAMLANMAMIŞ işleri al
                    if (op.assignedOperator === loggedInUser.name && op.status !== OPERATION_STATUS.COMPLETED) {
                        
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

        // Grupları diziye çevir ve sırala
        return Object.values(groups).sort((a, b) => {
            const aActive = a.operations.some(o => o.status === OPERATION_STATUS.IN_PROGRESS);
            const bActive = b.operations.some(o => o.status === OPERATION_STATUS.IN_PROGRESS);
            return bActive - aActive; 
        });

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

    const handleNeedsMachineOpReview = (operationWithProgress) => {
        // Değerlendirme modalını aç
        setModalState(prevState => ({
            isOpen: true,
            type: 'cam_review',
            data: { ...prevState.data, operation: operationWithProgress }
        }));
    };
    
    const handleCloseModal = () => {
        setModalState({ isOpen: false, type: null, data: null });
    };
    
    const handleProgressSubmit = async (moldId, taskId, updatedOperation) => {
        let finalOperation = { ...updatedOperation };

        // Eğer %100 olduysa durumu direkt TAMAMLANDI yap
        if (finalOperation.progressPercentage === 100) {
            finalOperation.status = OPERATION_STATUS.COMPLETED;
            if (!finalOperation.finishDate) {
                finalOperation.finishDate = new Date().toISOString();
            }
        }

        await handleUpdateOperation(moldId, taskId, finalOperation);
        handleCloseModal();
    };

    const { isOpen, type, data } = modalState;
    const { mold, task, operation } = data || {};

    return (
        <div className="p-4 bg-white dark:bg-gray-800 rounded-xl shadow-xl min-h-[80vh]">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6 flex items-center">
                <Layers className="w-6 h-6 mr-2 text-blue-600" />
                {loggedInUser.name} - İş Listesi
            </h2>

            {groupedWork.length === 0 ? (
                 <div className="text-center py-12 bg-gray-50 dark:bg-gray-700 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-600">
                    <Box className="w-12 h-12 mx-auto text-gray-400 mb-3" />
                    <p className="text-gray-500 dark:text-gray-400 font-medium">Şu anda size atanmış aktif bir iş bulunmamaktadır.</p>
                 </div>
            ) : (
                <div className="space-y-4">
                    {groupedWork.map((group) => {
                        const isExpanded = expandedMoldId === group.moldInfo.id;
                        const activeCount = group.operations.filter(op => op.status === OPERATION_STATUS.IN_PROGRESS).length;
                        
                        return (
                            <div key={group.moldInfo.id} className={`border rounded-xl transition-all duration-300 overflow-hidden ${activeCount > 0 ? 'border-blue-500 shadow-md shadow-blue-100 dark:shadow-none' : 'border-gray-200 dark:border-gray-700'}`}>
                                
                                {/* --- KALIP KARTI BAŞLIĞI --- */}
                                <div 
                                    onClick={() => toggleExpand(group.moldInfo.id)}
                                    className={`p-4 cursor-pointer flex justify-between items-center ${isExpanded ? 'bg-gray-50 dark:bg-gray-700/50' : 'bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                                >
                                    <div className="flex items-center space-x-4">
                                        <div className={`p-3 rounded-full ${activeCount > 0 ? 'bg-blue-100 text-blue-600 animate-pulse' : 'bg-gray-100 text-gray-500 dark:bg-gray-600 dark:text-gray-300'}`}>
                                            <Box className="w-6 h-6" />
                                        </div>
                                        <div>
                                            <h3 className="text-lg font-bold text-gray-900 dark:text-white">{group.moldInfo.name}</h3>
                                            <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">
                                                {group.moldInfo.customer} • <span className="text-blue-600 dark:text-blue-400">{group.operations.length} Parça İşleniyor</span>
                                            </p>
                                        </div>
                                    </div>
                                    
                                    <div className="flex items-center space-x-4">
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
                                                        <button
                                                            onClick={() => handleProgressClick(group.moldInfo.id, group.moldInfo.name, op.taskId, op.taskName, op)}
                                                            className="w-full px-3 py-2 bg-green-600 text-white text-sm font-bold rounded-lg hover:bg-green-700 transition flex items-center justify-center shadow-sm"
                                                        >
                                                            <Edit2 className="w-4 h-4 mr-1"/> Güncelle (%{op.progressPercentage})
                                                        </button>
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
            )}
            
            {/* MODALLAR */}
            {isOpen && type === 'progress' && (
                <ProgressUpdateModal
                    isOpen={isOpen}
                    onClose={handleCloseModal}
                    mold={mold}
                    task={task}
                    operation={operation}
                    onSubmit={handleProgressSubmit}
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
        </div>
    );
};

export default CamDashboard;