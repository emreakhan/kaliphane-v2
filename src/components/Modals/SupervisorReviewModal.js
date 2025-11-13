// src/components/Modals/SupervisorReviewModal.js

import React, { useState, useEffect } from 'react';

// İkonlar
import { CheckCircle } from 'lucide-react';

// Sabitler ('.js' uzantısını ekledim)
import { OPERATION_STATUS } from '../../config/constants.js';

// Yardımcı Fonksiyonlar
import { getCurrentDateTimeString, formatDateTime } from '../../utils/dateUtils';

// Ana Modal Çerçevesi ('.js' uzantısını ekledim)
import Modal from './Modal.js';

const SupervisorReviewModal = ({ isOpen, onClose, mold, task, operation, onSubmit }) => {
    const [rating, setRating] = useState(10);
    const [comment, setComment] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setRating(10);
            setComment('');
        }
    }, [isOpen]);

    const handleSave = async () => {
        setIsSaving(true);
        const updatedOperation = {
             ...operation,
            supervisorRating: rating,
            supervisorReviewDate: getCurrentDateTimeString(),
            status: OPERATION_STATUS.COMPLETED,
            supervisorComment: comment,
        };
        
        await onSubmit(mold.id, task.id, updatedOperation);
        setIsSaving(false);
        onClose();
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`İş Değerlendirme: ${task.taskName} (${operation.type})`}>
            <p className="text-gray-700 dark:text-gray-300 mb-4">Bu iş parçasının kalıphaneye uygunluğunu 1-10 arası puanlayarak onaylayınız.</p>

            <div className="space-y-4">
                 <p className="font-semibold dark:text-white">CAM Operatörü: {operation.assignedOperator}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">İş Süresi: {operation.durationInHours} Saat (Başlangıç: {formatDateTime(operation.startDate)} - Bitiş: {formatDateTime(operation.finishDate)})</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">CAM'in Tezgah Op. Onay Tarihi: {formatDateTime(operation.camOperatorReviewDate)}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">CAM'in Tezgah Op. Puanı: <span className="font-semibold">{operation.camOperatorRatingForMachineOp || 'N/A'} / 10</span></p>

                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Değerlendirme Puanı (CAM için): {rating} / 10</label>
                    <input
                        type="range"
                         min="1"
                        max="10"
                        step="1"
                        value={rating}
                         onChange={(e) => setRating(parseInt(e.target.value))}
                        className="mt-1 block w-full h-2 bg-red-100 rounded-lg appearance-none cursor-pointer dark:bg-red-700"
                    />
                </div>

                 <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Yetkili Yorumu (CAM için Opsiyonel)</label>
                    <textarea
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        rows="3"
                        placeholder="CAM Operatörü için bir geri bildirim yazın..."
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
                    className="px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 transition flex items-center disabled:bg-purple-400"
                 >
                    <CheckCircle className="w-4 h-4 mr-2"/> {isSaving ? 'Onaylanıyor...' : 'Onayla ve Bitir'}
                </button>
            </div>
        </Modal>
    );
};

export default SupervisorReviewModal;