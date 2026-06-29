// src/components/Modals/CamReviewMachineOpModal.js

import React, { useState, useEffect } from 'react';

// İkonlar
import { UserCheck } from 'lucide-react';

// Sabitler
import { OPERATION_STATUS } from '../../config/constants.js';

// Yardımcı Fonksiyonlar
import { getCurrentDateTimeString } from '../../utils/dateUtils';
import { calculateDurationInHours } from '../../utils/mathUtils';

// Ana Modal Çerçevesi
import Modal from './Modal.js';

const CamReviewMachineOpModal = ({ isOpen, onClose, mold, task, operation, onSubmit }) => {
    const [rating, setRating] = useState(null);
    const [comment, setComment] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if(isOpen) {
            setRating(null);
            setComment('');
        }
    }, [isOpen]);

    const handleSave = async () => {
        if (!operation || !task || !mold || rating === null) return;
        setIsSaving(true);
        const finishDate = getCurrentDateTimeString();
        const durationInHours = calculateDurationInHours(operation.startDate, finishDate);
        
        const updatedOperation = {
            ...operation,
            progressPercentage: 100,
            finishDate: finishDate,
            durationInHours: durationInHours,
            camOperatorRatingForMachineOp: rating,
            camOperatorCommentForMachineOp: comment,
            camOperatorReviewDate: getCurrentDateTimeString(),
            status: OPERATION_STATUS.COMPLETED, 
        };
        
        await onSubmit(mold.id, task.id, updatedOperation);
        setIsSaving(false);
        onClose();
    };

    if (!operation || !task) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Tezgah Operatörü Değerlendirmesi: ${task.taskName} (${operation.type})`}>
            <p className="text-gray-700 dark:text-gray-300 mb-4">İşi %100 olarak tamamladınız. Lütfen bu iş için atanan tezgah operatörünün performansını değerlendirin.</p>

            <div className="space-y-4 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <p className="font-semibold dark:text-white">Değerlendirilen Tezgah Operatörü: <span className="font-normal">{operation.machineOperatorName}</span></p>
                <p className="font-semibold dark:text-white">Tezgah: <span className="font-normal">{operation.machineName}</span></p>
            </div>

            <div className="space-y-4 mt-4">
                 <div>
                    <label className="block text-sm font-black text-gray-700 dark:text-gray-300 mb-2">
                        Tezgah Operatörü Puanı: {rating !== null ? `${rating} / 10` : <span className="text-red-500 font-extrabold">(Puan seçilmesi zorunludur)</span>}
                    </label>
                    <div className="grid grid-cols-5 sm:grid-cols-10 gap-2">
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => {
                            const isSelected = rating === num;
                            return (
                                <button
                                    key={num}
                                    type="button"
                                    onClick={() => setRating(num)}
                                    className={`py-3 rounded-xl font-black text-sm border-2 transition-all text-center flex items-center justify-center ${
                                        isSelected 
                                        ? 'bg-blue-600 border-blue-600 text-white shadow-md scale-105' 
                                        : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-blue-300 hover:text-blue-500 dark:hover:border-blue-800'
                                    }`}
                                >
                                    {num}
                                </button>
                            );
                        })}
                    </div>
                 </div>
                 <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Yorum (Opsiyonel)</label>
                    <textarea
                         value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        rows="3"
                        placeholder="Tezgah operatörü için bir yorum yazın..."
                         className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    ></textarea>
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
                    disabled={isSaving || rating === null}
                    className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition flex items-center disabled:bg-gray-400 dark:disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed"
                 >
                    <UserCheck className="w-4 h-4 mr-2"/> {isSaving ? 'Kaydediliyor...' : 'Değerlendir ve Bitir'}
                </button>
            </div>
        </Modal>
    );
};

export default CamReviewMachineOpModal;