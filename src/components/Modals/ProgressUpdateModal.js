// src/components/Modals/ProgressUpdateModal.js

import React, { useState, useEffect } from 'react';

// İkonlar
import { CheckCircle, PauseCircle, MessageSquare, AlertTriangle } from 'lucide-react';

// Sabitler
import { OPERATION_STATUS } from '../../config/constants.js';

// Ana Modal Çerçevesi
import Modal from './Modal.js';

const ProgressUpdateModal = ({ isOpen, onClose, mold, task, operation, onSubmit, onNeedsMachineOpReview }) => {
    const [progress, setProgress] = useState(operation.progressPercentage);
    const [isSaving, setIsSaving] = useState(false);
    
    // --- YENİ EKLENEN STATE'LER ---
    const [showPauseForm, setShowPauseForm] = useState(false); // Duraklatma formunu göstermek için
    const [pauseReason, setPauseReason] = useState(''); // Girilen nedeni tutmak için

    useEffect(() => {
        if (isOpen) {
            setProgress(operation.progressPercentage);
            setShowPauseForm(false);
            setPauseReason('');
        }
    }, [isOpen, operation.progressPercentage]);

    // Normal Kaydet (Çalışmaya Devam Et)
    const handleSaveContinue = async () => {
        setIsSaving(true);
        if (progress === 100) {
            onNeedsMachineOpReview({ ...operation, progressPercentage: 100 });
            setIsSaving(false);
        } else {
            let updatedOperation = { ...operation, progressPercentage: progress };
            // actionType belirtilmediği için App.js içindeki normal update çalışacak
            await onSubmit(mold.id, task.id, updatedOperation); 
            setIsSaving(false);
            onClose();
        }
    };

    // YENİ: Duraklatma Formunu Aç
    const handleOpenPauseForm = () => {
        setShowPauseForm(true);
    };

    // YENİ: Duraklatmayı Nedeniyle Birlikte Kaydet
    const handleConfirmPause = async () => {
        if (!pauseReason.trim()) {
            alert("Lütfen duraklatma nedenini kısaca belirtiniz.");
            return;
        }

        setIsSaving(true);
        
        let updatedOperation = { 
            ...operation, 
            progressPercentage: progress,
            status: OPERATION_STATUS.PAUSED 
        };

        // App.js'e gönderilecek fonksiyon 5 parametre bekliyor olabilir, 
        // ancak CamDashboard üzerinden handleUpdateOperation şu şekilde pass ediliyor:
        // handleUpdateOperation(moldId, taskId, updatedOperationData, actionType, pauseReason)
        // Biz de bu 5 parametreyi gönderiyoruz:
        await onSubmit(mold.id, task.id, updatedOperation, 'PAUSE_JOB', pauseReason.trim());
        
        setIsSaving(false);
        onClose();
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`İlerleme Güncelle: ${task.taskName} (${operation.type})`}>
            
            {/* EĞER DURAKLATMA FORMU AÇIK DEĞİLSE NORMAL GÜNCELLEME EKRANINI GÖSTER */}
            {!showPauseForm ? (
                <>
                    <p className="text-gray-700 dark:text-gray-300 mb-4">Mevcut ilerleme yüzdesini giriniz.</p>

                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">İlerleme Yüzdesi: %{progress}</label>
                             <input
                                type="range"
                                min="0"
                                max="100"
                                step="5"
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

                    <div className="mt-8 flex flex-col sm:flex-row justify-end gap-3">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-700 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition"
                        >
                            İptal
                        </button>

                        {/* Duraklat Butonu - Sadece formu açar */}
                        {progress < 100 && (
                            <button
                                onClick={handleOpenPauseForm}
                                disabled={isSaving}
                                className="px-4 py-2 text-sm font-medium text-white bg-orange-500 rounded-lg hover:bg-orange-600 transition flex items-center justify-center disabled:bg-orange-300"
                            >
                                <PauseCircle className="w-4 h-4 mr-2"/> Duraklat
                            </button>
                        )}

                        <button
                            onClick={handleSaveContinue}
                            disabled={isSaving}
                            className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition flex items-center justify-center disabled:bg-green-400"
                        >
                            {isSaving ? 'Kaydediliyor...' : (progress === 100 ? 'Bitir ve Değerlendir' : 'Güncelle ve Devam Et')}
                        </button>
                    </div>
                </>
            ) : (
                /* --- DURAKLATMA NEDENİ FORMU --- */
                <div className="animation-slide-down">
                    <div className="bg-orange-50 dark:bg-orange-900/20 p-4 rounded-lg border border-orange-100 dark:border-orange-800/50 mb-4">
                        <p className="text-sm text-orange-800 dark:text-orange-300 font-semibold mb-1 flex items-center">
                            <AlertTriangle className="w-4 h-4 mr-2" />
                            İşi Duraklatıyorsunuz (Mevcut İlerleme: %{progress})
                        </p>
                        <p className="text-xs text-orange-600 dark:text-orange-400">
                            Bu işlem tezgahı serbest bırakacak ve işi duraklatılanlar listesine alacaktır.
                        </p>
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 flex items-center">
                            <MessageSquare className="w-4 h-4 mr-2 text-gray-400" />
                            Duraklatma Nedeni (Zorunlu)
                        </label>
                        <textarea 
                            value={pauseReason}
                            onChange={(e) => setPauseReason(e.target.value)}
                            placeholder="Örn: Takım kırıldı, acil araya başka iş girdi, mesai bitti..."
                            className="w-full p-3 border border-orange-200 rounded-lg bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm resize-none h-24 focus:ring-2 focus:ring-orange-500 focus:outline-none"
                        />
                    </div>

                    <div className="mt-6 flex justify-end gap-3">
                        <button
                            onClick={() => setShowPauseForm(false)}
                            className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 rounded-lg transition"
                        >
                            Geri Dön
                        </button>
                        <button
                            onClick={handleConfirmPause}
                            disabled={isSaving || !pauseReason.trim()}
                            className="px-6 py-2 text-sm font-bold text-white bg-orange-600 rounded-lg hover:bg-orange-700 transition flex items-center shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <PauseCircle className="w-4 h-4 mr-2"/> 
                            {isSaving ? 'Kaydediliyor...' : 'Onayla ve Duraklat'}
                        </button>
                    </div>
                </div>
            )}

        </Modal>
    );
};

export default ProgressUpdateModal;