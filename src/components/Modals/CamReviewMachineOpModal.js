// src/components/Modals/CamReviewMachineOpModal.js

import React, { useState, useEffect } from 'react';

// İkonlar
import { UserCheck } from 'lucide-react';

// Sabitler ('.js' uzantısını ekledim)
import { OPERATION_STATUS } from '../../config/constants.js';

// Yardımcı Fonksiyonlar
import { getCurrentDateTimeString } from '../../utils/dateUtils';
import { calculateDurationInHours } from '../../utils/mathUtils';

// Ana Modal Çerçevesi ('.js' uzantısını ekledim)
import Modal from './Modal.js';

const CamReviewMachineOpModal = ({ isOpen, onClose, mold, task, operation, onSubmit }) => {
    const [rating, setRating] = useState(10);
    const [comment, setComment] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if(isOpen) {
            setRating(10);
            setComment('');
        }
    }, [isOpen]);

    const handleSave = async () => {
        if (!operation || !task || !mold) return;
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
            status: OPERATION_STATUS.WAITING_SUPERVISOR_REVIEW,
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
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Tezgah Operatörü Puanı: {rating} / 10</label>
                     <input
                        type="range"
                        min="1"
                        max="10"
                        step="1"
                         value={rating}
                        onChange={(e) => setRating(parseInt(e.target.value))}
                        className="mt-1 block w-full h-2 bg-blue-100 rounded-lg appearance-none cursor-pointer dark:bg-blue-700"
                    />
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
                    disabled={isSaving}
                    className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition flex items-center disabled:bg-green-400"
                 >
                    <UserCheck className="w-4 h-4 mr-2"/> {isSaving ? 'Kaydediliyor...' : 'Değerlendir ve Yetkiliye Gönder'}
                </button>
            </div>
        </Modal>
    );
};

export default CamReviewMachineOpModal;