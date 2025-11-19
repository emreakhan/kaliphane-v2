// src/components/Modals/ReportIssueModal.js

import React, { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';

const ReportIssueModal = ({ isOpen, onClose, mold, task, operation, onSubmit }) => {
    const [reason, setReason] = useState('');
    const [description, setDescription] = useState('');

    if (!isOpen) return null;

    const handleSubmit = () => {
        if (!reason.trim()) return;
        // Üst bileşene verileri gönder
        onSubmit(mold.id, task.id, operation.id, reason, description);
        // Formu temizle ve kapat
        setReason('');
        setDescription('');
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md border-l-8 border-red-600">
                
                {/* Başlık */}
                <div className="flex justify-between items-center p-4 border-b dark:border-gray-700">
                    <h3 className="text-lg font-bold text-red-600 flex items-center">
                        <AlertTriangle className="w-6 h-6 mr-2" />
                        Hata Bildir & Sıfırla
                    </h3>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:text-gray-400">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* İçerik */}
                <div className="p-6 space-y-4">
                    <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded text-sm text-red-800 dark:text-red-300">
                        <strong>Dikkat:</strong> Bu işlem, <u>{operation.type}</u> operasyonunu <strong>%0</strong> ilerlemeye çekecek ve durumunu <strong>BAŞLAMADI</strong> yapacaktır. Mevcut ilerleme "Hata Geçmişi"ne kaydedilir.
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Hata Nedir? (Kısa Başlık) <span className="text-red-500">*</span>
                        </label>
                        <input 
                            type="text" 
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder="Örn: Ölçü Hatası, Takım Kırılması..."
                            className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Açıklama (Detay)
                        </label>
                        <textarea 
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Detaylı açıklama yazınız..."
                            rows="3"
                            className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white resize-none"
                        />
                    </div>
                </div>

                {/* Alt Butonlar */}
                <div className="flex justify-end space-x-3 p-4 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-900 rounded-b-xl">
                    <button 
                        onClick={onClose}
                        className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-200 rounded-lg transition"
                    >
                        İptal
                    </button>
                    <button 
                        onClick={handleSubmit}
                        disabled={!reason.trim()}
                        className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg shadow transition disabled:opacity-50 flex items-center"
                    >
                        <AlertTriangle className="w-4 h-4 mr-2" />
                        Onayla ve Sıfırla
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ReportIssueModal;