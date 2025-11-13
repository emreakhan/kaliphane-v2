// src/pages/SupervisorReviewPage.js

import React, { useState, useMemo } from 'react';

// İkonlar
import { CheckCircle } from 'lucide-react';

// Sabitler
import { OPERATION_STATUS } from '../config/constants.js';

// Yardımcı Fonksiyonlar
import { formatDateTime } from '../utils/dateUtils';

// ----------------------------------------------------------------
// ---- HENÜZ OLUŞTURULMAYAN BİLEŞENLER ----
// (Bu HATA VERECEK, sonraki adımlarda düzelteceğiz)
// ----------------------------------------------------------------
import SupervisorReviewModal from '../components/Modals/SupervisorReviewModal.js';
// ----------------------------------------------------------------


// GÜNCELLEME: Artık operasyonları listeliyor
const SupervisorReviewPage = ({ projects, loggedInUser, handleUpdateOperation }) => {
    const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
    const [operationToReview, setOperationToReview] = useState(null);

    const tasksToReview = useMemo(() => {
        return projects.flatMap(mold => 
            mold.tasks.flatMap(task => 
                task.operations
                    .filter(op => op.status === OPERATION_STATUS.WAITING_SUPERVISOR_REVIEW)
                    .map(op => ({ 
                        ...op, 
                        moldName: mold.moldName, 
                        moldId: mold.id, 
                        taskName: task.taskName,
                        taskId: task.id 
                    }))
            )
        ).sort((a, b) => new Date(a.camOperatorReviewDate) - new Date(b.camOperatorReviewDate));
    }, [projects]);

    const handleReviewClick = (op) => {
        setOperationToReview(op);
        setIsReviewModalOpen(true);
    };

    return (
        <div className="p-4 bg-white dark:bg-gray-800 rounded-xl shadow-xl">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
                Bitmiş İşler - Kontrol ve Değerlendirme ({tasksToReview.length})
            </h2>

            {tasksToReview.length === 0 ? (
                 <p className="text-gray-500 dark:text-gray-400">Şu anda değerlendirilmeyi bekleyen, CAM operatörü onaylı iş parçası bulunmamaktadır.</p>
            ) : (
                <div className="space-y-4">
                    {tasksToReview.map(op => (
                        <div key={op.id} className="p-4 border border-yellow-300 dark:border-yellow-700 rounded-lg bg-yellow-50 dark:bg-yellow-900/10">
                            <div className="flex justify-between items-center">
                                <div className="flex-1 min-w-0">
                                    <p className="font-semibold text-lg text-gray-900 dark:text-white">{op.taskName}</p>
                                    <p className="text-sm font-bold text-yellow-700 dark:text-yellow-400">{op.type}</p>
                                    <p className="text-sm text-gray-600 dark:text-gray-400">Kalıp: <span className="font-medium">{op.moldName}</span></p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                        CAM Operatörü: {op.assignedOperator} | CAM Onayı: {formatDateTime(op.camOperatorReviewDate)}
                                    </p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                        İş Süresi (CAM): <span className="font-semibold">{op.durationInHours} Saat</span>
                                    </p>
                                </div>
                                <button
                                    onClick={() => handleReviewClick(op)}
                                    className="ml-4 px-3 py-1 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 transition flex items-center"
                                >
                                    <CheckCircle className="w-4 h-4 mr-1"/> Değerlendir (1-10)
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
            
            {/* ŞİMDİLİK HATA VERECEK:
              Bu modal'ı henüz components/Modals altına taşımadık.
            */}
            {isReviewModalOpen && operationToReview && (
                <SupervisorReviewModal
                    isOpen={isReviewModalOpen}
                    onClose={() => setIsReviewModalOpen(false)}
                    mold={{ id: operationToReview.moldId }}
                    task={{ id: operationToReview.taskId, taskName: operationToReview.taskName }}
                    operation={operationToReview}
                    onSubmit={handleUpdateOperation}
                />
            )}
        </div>
    );
};

// Bu satır çok önemli, App.js'in bu dosyayı "import" edebilmesini sağlar
export default SupervisorReviewPage;