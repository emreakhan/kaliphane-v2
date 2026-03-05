// src/components/Modals/ChangeOperatorModal.js

import React, { useState, useMemo } from 'react';
import Modal from './Modal.js';
import { Save, Users, Star, MessageSquare } from 'lucide-react';
import { PERSONNEL_ROLES } from '../../config/constants.js';

const ChangeOperatorModal = ({ isOpen, onClose, mold, task, operation, personnel, onSubmit }) => {
    const [rating, setRating] = useState(10);
    const [comment, setComment] = useState('');
    const [newOperator, setNewOperator] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    // Sadece makine operatörlerini (aktif olanın dışındakileri) listele
    const availableOperators = useMemo(() => {
        return personnel
            .filter(p => p.role === PERSONNEL_ROLES.MACHINE_OPERATOR && p.name !== operation.machineOperatorName)
            .sort((a, b) => a.name.localeCompare(b.name, 'tr'));
    }, [personnel, operation]);

    const handleSubmit = async () => {
        if (!newOperator) {
            alert("Lütfen yeni operatörü seçin.");
            return;
        }

        setIsSaving(true);
        // Props üzerinden gelen submit fonksiyonunu çalıştır
        await onSubmit(mold.id, task.id, operation.id, newOperator, rating, comment);
        setIsSaving(false);
    };

    if (!operation) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Operatör Değişikliği ve Puanlama">
            <div className="space-y-5">
                
                {/* BİLGİ PANELİ */}
                <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-lg border border-purple-100 dark:border-purple-800/50">
                    <p className="text-sm text-purple-800 dark:text-purple-300 font-semibold mb-1">
                        Mevcut Operatör: <span className="font-bold text-lg">{operation.machineOperatorName}</span>
                    </p>
                    <p className="text-xs text-purple-600 dark:text-purple-400">
                        Tezgahtaki operatör değiştiği için, mevcut operatörün o ana kadarki performansını puanlamanız gerekmektedir.
                    </p>
                </div>

                {/* PUANLAMA ALANI */}
                <div>
                    <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 flex items-center">
                        <Star className="w-4 h-4 mr-2 text-yellow-500" />
                        {operation.machineOperatorName} İçin Puanınız (1-10)
                    </label>
                    <input 
                        type="range" 
                        min="1" 
                        max="10" 
                        value={rating} 
                        onChange={(e) => setRating(parseInt(e.target.value))}
                        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700 accent-blue-600" 
                    />
                    <div className="flex justify-between text-xs text-gray-500 font-bold mt-2 px-1">
                        <span>1 (Çok Kötü)</span>
                        <span className="text-lg text-blue-600 dark:text-blue-400">{rating} / 10</span>
                        <span>10 (Mükemmel)</span>
                    </div>
                </div>

                {/* YORUM ALANI */}
                <div>
                    <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 flex items-center">
                        <MessageSquare className="w-4 h-4 mr-2 text-gray-400" />
                        Değerlendirme Notu (Opsiyonel)
                    </label>
                    <textarea 
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        placeholder="Operatör neden değişti? Kalan iş durumu nedir?"
                        className="w-full p-3 border rounded-lg bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm resize-none h-20 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                </div>

                {/* YENİ OPERATÖR SEÇİMİ */}
                <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                    <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 flex items-center">
                        <Users className="w-4 h-4 mr-2 text-green-500" />
                        İşi Devralan YENİ Operatör
                    </label>
                    <select 
                        value={newOperator}
                        onChange={(e) => setNewOperator(e.target.value)}
                        className="w-full p-3 border rounded-lg bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white font-semibold focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    >
                        <option value="">-- Operatör Seçin --</option>
                        {availableOperators.map(op => (
                            <option key={op.id} value={op.name}>{op.name}</option>
                        ))}
                    </select>
                </div>

                {/* AKSİYON BUTONLARI */}
                <div className="mt-6 flex justify-end gap-3">
                    <button 
                        onClick={onClose} 
                        className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 rounded-lg transition"
                    >
                        İptal
                    </button>
                    <button 
                        onClick={handleSubmit} 
                        disabled={isSaving || !newOperator}
                        className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-lg shadow-md transition flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Save className="w-4 h-4 mr-2" />
                        {isSaving ? 'Kaydediliyor...' : 'Kaydet ve Değiştir'}
                    </button>
                </div>

            </div>
        </Modal>
    );
};

export default ChangeOperatorModal;