// src/components/Modals/AddOperationModal.js

import React, { useState } from 'react';

// İkonlar
import { Plus } from 'lucide-react';

// Sabitler ('.js' uzantısını ekledim)
import { ADDABLE_OPERATION_TYPES, OPERATION_STATUS } from '../../config/constants.js';

// Ana Modal Çerçevesi ('.js' uzantısını ekledim)
import Modal from './Modal.js';

const AddOperationModal = ({ isOpen, onClose, mold, task, onSubmit }) => {
    const [operationType, setOperationType] = useState(Object.keys(ADDABLE_OPERATION_TYPES)[0]);
    const [isSaving, setIsSaving] = useState(false);
    
    const handleSave = async () => {
        if (!mold || !task || !operationType) return;
        setIsSaving(true);
        
        const newOpId = `op-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const newOperation = {
            id: newOpId,
            type: ADDABLE_OPERATION_TYPES[operationType],
            status: OPERATION_STATUS.NOT_STARTED,
            progressPercentage: 0,
            assignedOperator: 'SEÇ',
            machineName: '',
            machineOperatorName: '',
            estimatedDueDate: '',
            startDate: '',
            finishDate: '',
            durationInHours: null,
            supervisorRating: null,
            supervisorReviewDate: null,
            supervisorComment: null,
            camOperatorRatingForMachineOp: null,
            camOperatorCommentForMachineOp: null,
            camOperatorReviewDate: null
        };
        
        try {
            await onSubmit(mold.id, task.id, newOperation);
        } catch (error) {
            console.error("Yeni operasyon eklenirken hata:", error);
        } finally {
            setIsSaving(false);
            onClose();
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Yeni Operasyon Ekle: ${task.taskName}`}>
            <p className="text-gray-700 dark:text-gray-300 mb-4">Bu parçaya yeni bir iş operasyonu (Erezyon, Polisaj vb.) ekleyin.</p>
            
            <div className="space-y-4">
                <div>
                     <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Operasyon Tipi</label>
                    <select
                        value={operationType}
                        onChange={(e) => setOperationType(e.target.value)}
                         className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    >
                        {Object.entries(ADDABLE_OPERATION_TYPES).map(([key, value]) => (
                            <option key={key} value={key}>{value}</option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="mt-6 flex justify-end space-x-3">
                <button
                     onClick={onClose}
                    className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-700 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition"
                >
                    İptal
                </button>
                 <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition flex items-center disabled:bg-green-400"
                 >
                    <Plus className="w-4 h-4 mr-2"/> {isSaving ? 'Ekleniyor...' : 'Operasyon Ekle'}
                </button>
            </div>
        </Modal>
    );
};

export default AddOperationModal;