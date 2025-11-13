// src/pages/CamDashboard.js

import React, { useState, useMemo } from 'react';

// İkonlar
import { Edit2, PlayCircle } from 'lucide-react'; 

// Sabitler
import { OPERATION_STATUS } from '../config/constants.js';

// Yardımcı Fonksiyonlar
import { formatDate, formatDateTime } from '../utils/dateUtils.js';
import { getStatusClasses } from '../utils/styleUtils.js';

// Modallar
import ProgressUpdateModal from '../components/Modals/ProgressUpdateModal.js';
import CamReviewMachineOpModal from '../components/Modals/CamReviewMachineOpModal.js';
import AssignOperationModal from '../components/Modals/AssignOperationModal.js'; 


const CamDashboard = ({ loggedInUser, projects, handleUpdateOperation, personnel, machines }) => {
    const [modalState, setModalState] = useState({ isOpen: false, type: null, data: null });

    // Operasyonları al
    const camOperations = useMemo(() => {
        return projects.flatMap(mold => 
            mold.tasks.flatMap(task => 
                task.operations
                    .filter(op => 
                        op.assignedOperator === loggedInUser.name && 
                        op.status !== OPERATION_STATUS.COMPLETED 
                    )
                    .map(op => ({ 
                        ...op, 
                        moldName: mold.moldName, 
                        moldId: mold.id, 
                        taskName: task.taskName,
                        taskId: task.id 
                    }))
            )
        ).sort((a, b) => {
            if (a.status === OPERATION_STATUS.IN_PROGRESS) return -1;
            if (b.status === OPERATION_STATUS.IN_PROGRESS) return 1;
            if (a.status === OPERATION_STATUS.PAUSED) return -1;
            if (b.status === OPERATION_STATUS.PAUSED) return 1;
            return (a.estimatedDueDate || 'zzzz').localeCompare(b.estimatedDueDate || 'zzzz');
        });
    }, [projects, loggedInUser.name]);

    const handleProgressClick = (mold, task, operation) => {
        setModalState({ isOpen: true, type: 'progress', data: { mold, task, operation } });
    };

    const handleResumeClick = (mold, task, operation) => {
        // Resume işlemi için AssignOperationModal'ı açıyoruz
        // Amaç: Operatörün tezgahı tekrar seçebilmesi veya değiştirebilmesi
        setModalState({ isOpen: true, type: 'resume', data: { mold, task, operation } });
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
    
    // ProgressUpdateModal'dan gelen güncelleme isteğini karşılayan fonksiyon
    // Bu fonksiyon, hem normal güncellemeyi hem de PAUSE işlemini yönetir
    const handleProgressSubmit = async (moldId, taskId, updatedOperation) => {
        console.log("İlerleme Güncelleniyor:", updatedOperation); // Debug için log
        await handleUpdateOperation(moldId, taskId, updatedOperation);
        handleCloseModal();
    };

    const { isOpen, type, data } = modalState;
    const { mold, task, operation } = data || {};

    return (
        <div className="p-4 bg-white dark:bg-gray-800 rounded-xl shadow-xl">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
                {loggedInUser.name} - Atanan Operasyonlarım ({camOperations.length})
            </h2>

            {camOperations.length === 0 ? (
                 <p className="text-gray-500 dark:text-gray-400">Şu anda size atanmış aktif veya değerlendirme bekleyen operasyon bulunmamaktadır.</p>
            ) : (
                <div className="space-y-4">
                    {camOperations.map(op => {
                        const currentMold = { id: op.moldId, name: op.moldName };
                        const currentTask = { id: op.taskId, taskName: op.taskName };
                        
                        return (
                            <div key={op.id} className={`p-4 border rounded-lg ${op.status === OPERATION_STATUS.PAUSED ? 'bg-orange-50 border-orange-200 dark:bg-orange-900/10 dark:border-orange-700' : 'bg-gray-50 border-gray-200 dark:bg-gray-700 dark:border-gray-600'}`}>
                                <div className="flex justify-between items-start">
                                    <div className="flex-1 min-w-0">
                                        <p className="font-semibold text-lg text-gray-900 dark:text-white">{op.taskName}</p>
                                        <p className="text-sm font-bold text-blue-600 dark:text-blue-400">{op.type}</p>
                                        <p className="text-sm text-gray-600 dark:text-gray-400">Kalıp: <span className="font-medium">{op.moldName}</span></p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                            Tezgah: {op.machineName} | Tezgah Operatörü: {op.machineOperatorName}
                                        </p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">
                                            Başlangıç: {formatDateTime(op.startDate)}
                                        </p>
                                    </div>
                                    <div className="flex flex-col items-end space-y-2 ml-4">
                                        <span className={`px-3 py-1 text-xs leading-5 font-semibold rounded-full ${getStatusClasses(op.status)}`}>
                                            {op.status}
                                        </span>
                                        
                                        {op.status === OPERATION_STATUS.IN_PROGRESS && (
                                            <button
                                                onClick={() => handleProgressClick(currentMold, currentTask, op)}
                                                className="px-3 py-1 bg-green-500 text-white text-sm font-medium rounded-lg hover:bg-green-600 transition flex items-center"
                                            >
                                                <Edit2 className="w-4 h-4 mr-1"/> İlerleme (%{op.progressPercentage})
                                            </button>
                                        )}

                                        {op.status === OPERATION_STATUS.PAUSED && (
                                            <button
                                                onClick={() => handleResumeClick(currentMold, currentTask, op)}
                                                className="px-3 py-1 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition flex items-center"
                                            >
                                                <PlayCircle className="w-4 h-4 mr-1"/> Devam Et / Ata
                                            </button>
                                        )}

                                        {op.status === OPERATION_STATUS.WAITING_SUPERVISOR_REVIEW && (
                                            <div className="p-2 bg-yellow-100 text-yellow-800 text-xs font-medium rounded-lg dark:bg-yellow-900 dark:text-yellow-300">
                                                Yetkili Değerlendirmesi Bekleniyor
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700 mt-3">
                                    <div 
                                        className={`h-2.5 rounded-full ${
                                            op.status === OPERATION_STATUS.WAITING_SUPERVISOR_REVIEW ? 'bg-yellow-500' : 
                                            op.status === OPERATION_STATUS.PAUSED ? 'bg-orange-500' : 'bg-blue-600'
                                        }`} 
                                        style={{ width: `${op.progressPercentage}%` }}
                                    ></div>
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}
            
            {isOpen && type === 'progress' && (
                <ProgressUpdateModal
                    isOpen={isOpen}
                    onClose={handleCloseModal}
                    mold={mold}
                    task={task}
                    operation={operation}
                    onSubmit={handleProgressSubmit} // Özel fonksiyonu kullanıyoruz
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