// src/components/Modals/PauseReasonModal.js

import React, { useState, useEffect } from 'react';
import Modal from '../components/Modals/Modal';
import { PauseOctagon, Settings, Trash2, Plus, Save } from 'lucide-react';
import { db, doc, onSnapshot, setDoc } from '../config/firebase.js';

const DEFAULT_REASONS = [
    "Mola",
    "Malzeme Bekleniyor",
    "Teknik Resim Bekleniyor",
    "Takım Bekleniyor",
    "Ölçüm/Kalite Onayı Bekleniyor",
    "Tezgah Arızası",
    "Elektrik Kesintisi"
];

const PauseReasonModal = ({ isOpen, onClose, onSubmit }) => {
    const [reasons, setReasons] = useState(DEFAULT_REASONS);
    const [selectedReason, setSelectedReason] = useState('');
    const [otherReason, setOtherReason] = useState('');

    // Düzenleme Modu State'leri
    const [isEditing, setIsEditing] = useState(false);
    const [editableReasons, setEditableReasons] = useState([]);
    const [newReasonText, setNewReasonText] = useState('');

    // Firebase'den duraklatma sebeplerini çek
    useEffect(() => {
        const docRef = doc(db, 'workshop_settings', 'pause_reasons');
        const unsub = onSnapshot(docRef, (docSnap) => {
            if (docSnap.exists() && docSnap.data().reasons) {
                setReasons(docSnap.data().reasons);
            }
        });
        return () => unsub();
    }, []);

    useEffect(() => {
        if (isOpen) {
            setSelectedReason(reasons[0] || 'Diğer');
            setOtherReason('');
            setIsEditing(false); // Modal her açıldığında normal modda başlasın
        }
    }, [isOpen, reasons]);

    const handleSubmit = () => {
        if (selectedReason === 'Diğer' && !otherReason.trim()) {
            alert("Lütfen diğer sebebini açıklayın (Zorunlu).");
            return;
        }
        const reason = selectedReason === 'Diğer' ? `Diğer - ${otherReason.trim()}` : selectedReason;
        onSubmit(reason);
    };

    const toggleEditMode = () => {
        if (!isEditing) {
            setEditableReasons([...reasons]);
            setNewReasonText('');
        }
        setIsEditing(!isEditing);
    };

    const handleAddReason = () => {
        if (newReasonText.trim() && !editableReasons.includes(newReasonText.trim())) {
            setEditableReasons([...editableReasons, newReasonText.trim()]);
            setNewReasonText('');
        }
    };

    const handleRemoveReason = (reasonToRemove) => {
        setEditableReasons(editableReasons.filter(item => item !== reasonToRemove));
    };

    const handleSaveReasons = async () => {
        try {
            await setDoc(doc(db, 'workshop_settings', 'pause_reasons'), { reasons: editableReasons });
            setIsEditing(false);
        } catch (error) {
            console.error("Sebepler kaydedilemedi:", error);
            alert("Kaydedilirken hata oluştu.");
        }
    };

    const allReasons = [...reasons, "Diğer"];

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="İşi Duraklatma Sebebi">
            {isEditing ? (
                <div className="space-y-4 animate-in fade-in">
                    <div className="flex justify-between items-center border-b dark:border-gray-700 pb-2">
                        <p className="text-sm font-bold text-orange-600 dark:text-orange-400">Duraklatma Sebeplerini Düzenle</p>
                    </div>
                    
                    {/* Yeni Sebep Ekleme Alanı */}
                    <div className="flex gap-2">
                        <input 
                            type="text" 
                            value={newReasonText}
                            onChange={(e) => setNewReasonText(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleAddReason()}
                            placeholder="Yeni sebep ekle..."
                            className="flex-1 p-2 border border-gray-300 rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm outline-none focus:ring-2 focus:ring-orange-500"
                        />
                        <button onClick={handleAddReason} className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-bold transition flex items-center">
                            <Plus className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Düzenlenebilir Liste */}
                    <div className="space-y-2 max-h-60 overflow-y-auto pr-1 custom-scrollbar">
                        {editableReasons.map(r => (
                            <div key={r} className="flex justify-between items-center p-2 border border-gray-200 rounded-lg bg-gray-50 dark:bg-gray-800 dark:border-gray-700">
                                <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">{r}</span>
                                <button onClick={() => handleRemoveReason(r)} className="text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 p-1.5 rounded transition">
                                    <Trash2 className="w-4 h-4"/>
                                </button>
                            </div>
                        ))}
                        {editableReasons.length === 0 && (
                            <p className="text-xs text-gray-500 text-center py-2">Liste boş. Yeni bir sebep ekleyin.</p>
                        )}
                    </div>

                    {/* Düzenleme Modu Butonları */}
                    <div className="flex justify-end gap-3 pt-4 border-t dark:border-gray-700">
                        <button onClick={toggleEditMode} className="px-4 py-2 bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium transition hover:bg-gray-300 dark:hover:bg-gray-600">Vazgeç</button>
                        <button onClick={handleSaveReasons} className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold shadow-md transition flex items-center">
                            <Save className="w-4 h-4 mr-2"/> Kaydet
                        </button>
                    </div>
                </div>
            ) : (
                <div className="space-y-4 animate-in fade-in">
                    <div className="flex justify-between items-start">
                        <p className="text-sm text-gray-600 dark:text-gray-400 flex-1 pr-4">
                            Lütfen işi neden duraklattığınızı belirtin. Bu bilgi, verimlilik analizleri için kullanılacaktır.
                        </p>
                        <button 
                            onClick={toggleEditMode} 
                            className="p-1.5 text-gray-400 hover:text-orange-600 hover:bg-orange-50 dark:hover:bg-gray-800 rounded-lg transition shrink-0" 
                            title="Sebepleri Düzenle"
                        >
                            <Settings className="w-5 h-5" />
                        </button>
                    </div>

                <div className="space-y-2 max-h-60 overflow-y-auto pr-1 custom-scrollbar">
                    {allReasons.map(reason => (
                        <button
                            key={reason}
                            onClick={() => setSelectedReason(reason)}
                            className={`w-full text-left p-3 rounded-lg border-2 text-sm font-bold transition ${
                                selectedReason === reason
                                ? 'bg-orange-100 border-orange-500 text-orange-800 dark:bg-orange-900/30 dark:border-orange-600 dark:text-orange-200'
                                : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-300'
                            }`}
                        >
                            {reason}
                        </button>
                    ))}
                </div>

                {selectedReason === 'Diğer' && (
                    <div className="animate-in fade-in">
                        <label className="block text-xs font-bold text-gray-500 mb-1">Açıklama Yazın (Zorunlu)</label>
                        <input type="text" value={otherReason} onChange={(e) => setOtherReason(e.target.value)} className="w-full p-2 border rounded-lg bg-gray-50 dark:bg-gray-700 dark:text-white outline-none focus:ring-2 focus:ring-orange-500" placeholder="Lütfen duraklatma sebebini detaylıca yazın..." autoFocus />
                    </div>
                )}

                <div className="pt-4 flex justify-end gap-3 border-t dark:border-gray-700">
                    <button onClick={onClose} className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg font-medium hover:bg-gray-300 dark:bg-gray-600 dark:text-gray-200">İptal</button>
                    <button onClick={handleSubmit} disabled={selectedReason === 'Diğer' && !otherReason.trim()} className="px-6 py-2 bg-orange-600 text-white font-bold rounded-lg shadow-md hover:bg-orange-700 flex items-center disabled:opacity-50"><PauseOctagon className="w-4 h-4 mr-2" /> Duraklat</button>
                </div>
            </div>
            )}
        </Modal>
    );
};

export default PauseReasonModal;