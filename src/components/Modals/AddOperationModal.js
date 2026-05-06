// src/components/Modals/AddOperationModal.js

import React, { useState } from 'react';
import { X, Save, Clock } from 'lucide-react';
import Modal from './Modal';
import { OPERATION_STATUS, MOLD_STATUS } from '../../config/constants.js';

const defaultOperations = [
    "TEZGAH İŞLEME",
    "TASARIM",
    "MONTAJ",
    "KALİTE KONTROL",
    "CMM ÖLÇÜMÜ",
    "TEL EREZYON",
    "DALMA EREZYON",
    "TAŞLAMA",
    "FREZELEME",
    "TORNA",
    "KAYNAK",
    "ISIL İŞLEM",
    "KAPLAMA",
    "DİĞER"
];

const AddOperationModal = ({ isOpen, onClose, mold, task, onSubmit }) => {
    const [operationType, setOperationType] = useState(defaultOperations[0]);
    const [customOperation, setCustomOperation] = useState('');
    
    // YENİ: Öngörülen CAM Süresi State'i
    const [estimatedCamTime, setEstimatedCamTime] = useState('');

    const handleSubmit = () => {
        const typeToSave = operationType === "DİĞER" ? customOperation : operationType;
        if (!typeToSave.trim()) {
            alert("Lütfen operasyon türünü belirtin.");
            return;
        }

        const newOperation = {
            id: Date.now().toString(),
            type: typeToSave,
            status: OPERATION_STATUS.NOT_STARTED,
            progressPercentage: 0,
            assignedOperator: 'SEÇ',
            startDate: null,
            estimatedDueDate: null,
            durationInHours: null,
            completionDate: null,
            pauseHistory: [],
            // YENİ: Eklenen öngörülen süreyi kaydet
            estimatedCamTime: estimatedCamTime ? parseFloat(estimatedCamTime) : null
        };

        onSubmit(mold.id, task.id, newOperation);
        
        // Modal kapandıktan sonra form alanlarını temizle
        setOperationType(defaultOperations[0]);
        setCustomOperation('');
        setEstimatedCamTime('');
        onClose();
    };

    if (!isOpen || !mold || !task) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Yeni Operasyon Ekle">
            <div className="space-y-4">
                <div className="bg-gray-50 dark:bg-gray-700/50 p-3 rounded-lg text-sm text-gray-700 dark:text-gray-300">
                    <p><strong>Kalıp:</strong> {mold.moldName}</p>
                    <p><strong>İş Parçası:</strong> {task.taskName}</p>
                </div>
                
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Operasyon Türü</label>
                    <select 
                        className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 dark:text-white"
                        value={operationType}
                        onChange={(e) => setOperationType(e.target.value)}
                    >
                        {defaultOperations.map(op => (
                            <option key={op} value={op}>{op}</option>
                        ))}
                    </select>
                </div>

                {operationType === "DİĞER" && (
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Özel Operasyon Adı</label>
                        <input 
                            type="text" 
                            className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 dark:text-white"
                            placeholder="Operasyon türünü yazınız..."
                            value={customOperation}
                            onChange={(e) => setCustomOperation(e.target.value)}
                        />
                    </div>
                )}

                {/* YENİ: Öngörülen CAM Süresi Inputu */}
                <div className="pt-2 border-t dark:border-gray-700">
                    <label className="flex items-center text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
                        <Clock className="w-4 h-4 mr-1 text-indigo-500"/> Öngörülen CAM İşleme Süresi (Saat)
                    </label>
                    <input 
                        type="number" 
                        min="0"
                        step="0.5"
                        className="w-full p-2.5 border border-indigo-200 dark:border-indigo-800 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 font-bold outline-none"
                        placeholder="Örn: 14.5"
                        value={estimatedCamTime}
                        onChange={(e) => setEstimatedCamTime(e.target.value)}
                    />
                    <p className="text-[10px] text-gray-500 mt-1 italic">
                        * Bu süre, makine planlama ve iş akış sayfalarındaki kapasite analizleri için kullanılacaktır.
                    </p>
                </div>

                <div className="flex justify-end pt-4 space-x-3">
                    <button 
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 dark:bg-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
                    >
                        İptal
                    </button>
                    <button 
                        onClick={handleSubmit}
                        disabled={operationType === "DİĞER" && !customOperation.trim()}
                        className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 flex items-center disabled:opacity-50"
                    >
                        <Save className="w-4 h-4 mr-2" />
                        Kaydet
                    </button>
                </div>
            </div>
        </Modal>
    );
};

export default AddOperationModal;