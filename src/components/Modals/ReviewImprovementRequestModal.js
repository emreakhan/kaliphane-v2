// src/components/Modals/ReviewImprovementRequestModal.js

import React, { useState } from 'react';
import { CheckCircle, XCircle, Clock, Save, ShieldCheck, MessageSquare } from 'lucide-react';
import Modal from './Modal.js';
import { doc, updateDoc } from '../../config/firebase.js';
import { IMPROVEMENT_REQUESTS_COLLECTION } from '../../config/constants.js';

const ReviewImprovementRequestModal = ({ isOpen, onClose, request, db, loggedInUser }) => {
    const [status, setStatus] = useState(request?.status || 'APPROVED');
    const [managerResponseNote, setManagerResponseNote] = useState(request?.managerResponseNote || '');
    const [isSaving, setIsSaving] = useState(false);

    if (!request) return null;

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!managerResponseNote.trim()) {
            alert('Lütfen kararla ilgili açıklama / yanıt notu ekleyiniz.');
            return;
        }

        setIsSaving(true);
        try {
            if (db) {
                const docRef = doc(db, IMPROVEMENT_REQUESTS_COLLECTION, request.id);
                await updateDoc(docRef, {
                    status,
                    managerResponseNote: managerResponseNote.trim(),
                    reviewedByName: loggedInUser?.name || 'Bölüm Yöneticisi',
                    approvedAt: status === 'APPROVED' ? new Date().toISOString() : null,
                    updatedAt: new Date().toISOString()
                });
            }
            onClose();
        } catch (error) {
            console.error("Talep değerlendirilemedi:", error);
            alert("İşlem kaydedilemedi.");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="⚖️ İyileştirme Talebini Değerlendir & Karar Yaz">
            <form onSubmit={handleSubmit} className="space-y-4 text-xs text-gray-800 dark:text-gray-200">
                <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-xl border border-gray-200 dark:border-gray-700 space-y-2">
                    <div className="flex justify-between items-start">
                        <span className="font-bold text-xs text-indigo-600 dark:text-indigo-400">{request.targetDepartment}</span>
                        <span className="font-bold text-[10px] text-gray-400">Oluşturan: {request.createdByName} ({request.createdByRole})</span>
                    </div>
                    <h3 className="font-bold text-sm text-gray-900 dark:text-white">{request.title}</h3>
                    <p className="text-gray-600 dark:text-gray-300 italic">{request.description}</p>
                </div>

                <div>
                    <label className="block font-bold mb-1">Değerlendirme Sonucu *</label>
                    <div className="grid grid-cols-3 gap-2">
                        <button
                            type="button"
                            onClick={() => setStatus('APPROVED')}
                            className={`p-2.5 rounded-xl font-bold flex items-center justify-center gap-1.5 border transition ${status === 'APPROVED' ? 'bg-green-600 text-white border-green-700 shadow' : 'bg-gray-50 dark:bg-gray-700 border-gray-200 text-gray-700 dark:text-gray-300'}`}
                        >
                            <CheckCircle className="w-4 h-4" /> Kabul & Duyur
                        </button>

                        <button
                            type="button"
                            onClick={() => setStatus('UNDER_REVIEW')}
                            className={`p-2.5 rounded-xl font-bold flex items-center justify-center gap-1.5 border transition ${status === 'UNDER_REVIEW' ? 'bg-blue-600 text-white border-blue-700 shadow' : 'bg-gray-50 dark:bg-gray-700 border-gray-200 text-gray-700 dark:text-gray-300'}`}
                        >
                            <Clock className="w-4 h-4" /> İncelemede
                        </button>

                        <button
                            type="button"
                            onClick={() => setStatus('REJECTED')}
                            className={`p-2.5 rounded-xl font-bold flex items-center justify-center gap-1.5 border transition ${status === 'REJECTED' ? 'bg-red-600 text-white border-red-700 shadow' : 'bg-gray-50 dark:bg-gray-700 border-gray-200 text-gray-700 dark:text-gray-300'}`}
                        >
                            <XCircle className="w-4 h-4" /> Uygun Değil
                        </button>
                    </div>
                </div>

                <div>
                    <label className="block font-bold mb-1">Yönetici Karar Notu & Çözüm Açıklaması *</label>
                    <textarea 
                        rows="4"
                        placeholder="Örn: Talep haklı bulundu. Standart cıvata boyları M12x40 yerine M12x25 olarak revize edilmiş, 3D çizimler ve stok tanımları güncellenmiştir."
                        value={managerResponseNote}
                        onChange={(e) => setManagerResponseNote(e.target.value)}
                        className="w-full p-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-xs"
                    />
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-gray-200 dark:border-gray-700">
                    <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg font-bold">İptal</button>
                    <button type="submit" disabled={isSaving} className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold shadow transition flex items-center gap-1.5">
                        <Save className="w-4 h-4" /> {isSaving ? 'Kaydediliyor...' : 'Kararı Kaydet & Yayınla'}
                    </button>
                </div>
            </form>
        </Modal>
    );
};

export default ReviewImprovementRequestModal;
