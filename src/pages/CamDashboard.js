// src/pages/CamDashboard.js

import React, { useState, useMemo } from 'react';

// İkonlar
import { Edit2 } from 'lucide-react';

// Sabitler
import { OPERATION_STATUS } from '../config/constants.js';

// Yardımcı Fonksiyonlar
import { formatDate, formatDateTime } from '../utils/dateUtils';
import { getStatusClasses } from '../utils/styleUtils';

// ----------------------------------------------------------------
// ---- HENÜZ OLUŞTURULMAYAN BİLEŞENLER ----
// (Bunlar şimdilik HATA VERECEK, sonraki adımlarda düzelteceğiz)
// ----------------------------------------------------------------
import ProgressUpdateModal from '../components/Modals/ProgressUpdateModal.js';
import CamReviewMachineOpModal from '../components/Modals/CamReviewMachineOpModal.js';
// ----------------------------------------------------------------


// GÜNCELLEME: Artık operasyonları listeliyor
const CamDashboard = ({ loggedInUser, projects, handleUpdateOperation, personnel, machines }) => {
    const [modalState, setModalState] = useState({ isOpen: false, type: null, data: null });

    // GÜNCELLEME: Operasyonları al
    const camOperations = useMemo(() => {
        return projects.flatMap(mold => 
            mold.tasks.flatMap(task => 
                task.operations
                    .filter(op => 
                        op.assignedOperator === loggedInUser.name && op.status !== OPERATION_STATUS.COMPLETED
                    )
                    .map(op => ({ 
                        ...op, 
                        moldName: mold.moldName, 
                        moldId: mold.id, 
                        taskName: task.taskName,
                        taskId: task.id 
                    }))
            )
        ).sort((a, b) => a.status.localeCompare(b.status) || (a.estimatedDueDate || 'zzzz').localeCompare(b.estimatedDueDate || 'zzzz'));
    }, [projects, loggedInUser.name]);

    const handleProgressClick = (mold, task, operation) => {
        setModalState({ isOpen: true, type: 'progress', data: { mold, task, operation } });
    };

    const handleNeedsMachineOpReview = (operationWithProgress) => {
        // 'data'da zaten mold, task var, operation'ı güncelle
        setModalState(prevState => ({
            isOpen: true,
            type: 'cam_review',
            data: { ...prevState.data, operation: operationWithProgress }
        }));
    };
    
    const handleCloseModal = () => {
        setModalState({ isOpen: false, type: null, data: null });
    };
    
    const { isOpen, type, data } = modalState;
    const { mold, task, operation } = data || {};

    return (
        <div className="p-4 bg-white dark:bg-gray-800 rounded-xl shadow-xl">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
                {loggedInUser.name} - Atanan Operasyonlarım ({camOperations.length})
            </h2>

            {camOperations.length === 0 ? (
                 <p className="text-gray-500 dark:text-gray-400">Şu anda size atanmış aktif veya değerlendirme bekleyen operasyon bulunmamaktadır. Kalıp Listesi sekmesinden yeni iş atayabilirsiniz.</p>
            ) : (
                <div className="space-y-4">
                    {camOperations.map(op => {
                        const currentMold = { id: op.moldId, name: op.moldName };
                        // DÜZELTME: 'name' yerine 'taskName' kullanan objeyi düzelt
                        const currentTask = { id: op.taskId, taskName: op.taskName, operations: [] }; // Modal'ın task.taskName'i okuyabilmesi için 'taskName' ekle
                        
                        return (
                            <div key={op.id} className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-700">
                                <div className="flex justify-between items-start">
                                    <div className="flex-1 min-w-0">
                                        <p className="font-semibold text-lg text-gray-900 dark:text-white">{op.taskName}</p>
                                        <p className="text-sm font-bold text-blue-600 dark:text-blue-400">{op.type}</p>
                                        <p className="text-sm text-gray-600 dark:text-gray-400">Kalıp: <span className="font-medium">{op.moldName}</span></p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                            Tezgah: {op.machineName} | Tezgah Operatörü: {op.machineOperatorName}
                                        </p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">
                                            Başlangıç: {formatDateTime(op.startDate)} | Termin: {formatDate(op.estimatedDueDate)}
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
                                        {op.status === OPERATION_STATUS.WAITING_SUPERVISOR_REVIEW && (
                                            <div className="p-2 bg-yellow-100 text-yellow-800 text-xs font-medium rounded-lg dark:bg-yellow-900 dark:text-yellow-300">
                                                Yetkili Değerlendirmesi Bekleniyor
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700 mt-3">
                                    <div 
                                        className={`h-2.5 rounded-full ${op.status === OPERATION_STATUS.WAITING_SUPERVISOR_REVIEW ?
                                        'bg-yellow-500' : 'bg-blue-600'}`} 
                                        style={{ width: `${op.progressPercentage}%` }}
                                    ></div>
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}
            
            {/* ŞİMDİLİK HATA VERECEK KISIMLAR:
              Bu modal'ları henüz components/Modals altına taşımadık.
              Bu yüzden buralar hata verecek, normaldir.
            */}
            {isOpen && type === 'progress' && (
                <ProgressUpdateModal
                    isOpen={isOpen}
                    onClose={handleCloseModal}
                    mold={mold}
                    task={task}
                    operation={operation}
                    onSubmit={handleUpdateOperation}
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
        </div>
    );
};

// Bu satır çok önemli, App.js'in bu dosyayı "import" edebilmesini sağlar
export default CamDashboard;