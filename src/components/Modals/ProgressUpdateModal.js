// src/components/Modals/ProgressUpdateModal.js

import React, { useState, useEffect } from 'react';

// İkonlar
import { CheckCircle } from 'lucide-react';

// Ana Modal Çerçevesi
import Modal from './Modal.js';

// GÜNCELLEME: Artık 'operation' alıyor
const ProgressUpdateModal = ({ isOpen, onClose, mold, task, operation, onSubmit, onNeedsMachineOpReview }) => {
    const [progress, setProgress] = useState(operation.progressPercentage); 
    const [isSaving, setIsSaving] = useState(false); 

    useEffect(() => {
        if (isOpen) {
            setProgress(operation.progressPercentage); 
        }
    }, [isOpen, operation.progressPercentage]); 

    const handleSave = async () => {
        setIsSaving(true); 
        if (progress === 100) { 
            // GÜNCELLEME: 'operation' objesini gönder
            onNeedsMachineOpReview({ ...operation, progressPercentage: 100 }); 
            setIsSaving(false); 
            // onClose(); // HATA BURADAYDI! Bu satır kaldırıldı. 
        } else {
            let updatedOperation = { ...operation, progressPercentage: progress };
            // GÜNCELLEME: Yeni onSubmit imzası
            await onSubmit(mold.id, task.id, updatedOperation); 
            setIsSaving(false); 
            onClose(); 
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`İlerleme Güncelle: ${task.taskName} (${operation.type})`}>
            <p className="text-gray-700 dark:text-gray-300 mb-4">Mevcut ilerleme yüzdesini giriniz (0-100).</p>

            <div className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">İlerleme Yüzdesi: %{progress}</label>
                     <input
                        type="range"
                        min="0"
                        max="100"
                        step="1" 
                        value={progress}
                        onChange={(e) => setProgress(parseInt(e.target.value))}
                        className="mt-1 block w-full h-2 bg-blue-100 rounded-lg appearance-none cursor-pointer dark:bg-blue-700" 
                    />
                </div>
                
                {progress === 100 && (
                    <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg text-sm text-green-700 dark:text-green-300">
                         Kaydettiğinizde, **'TEZGAH OPERATÖRÜNÜ DEĞERLENDİR'** ekranı açılacaktır. 
                    </div>
                )}
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
                    {isSaving ?
                        'Kaydediliyor...' : <><CheckCircle className="w-4 h-4 mr-2"/> Kaydet</>} 
                </button>
            </div>
        </Modal>
    );
};

// Bu satır çok önemli, App.js'in bu dosyayı "import" edebilmesini sağlar
export default ProgressUpdateModal;