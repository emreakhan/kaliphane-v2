// src/components/Modals/MachineStatusModal.js

import React, { useState, useEffect } from 'react';
import { X, AlertTriangle, Wrench, CheckCircle, Activity } from 'lucide-react'; // Activity ikonu eklendi
import { MACHINE_STATUS } from '../../config/constants';

const MachineStatusModal = ({ isOpen, onClose, machine, onSubmit }) => {
    const [status, setStatus] = useState(MACHINE_STATUS.AVAILABLE);
    const [reason, setReason] = useState('');

    useEffect(() => {
        if (machine) {
            setStatus(machine.currentStatus || MACHINE_STATUS.AVAILABLE);
            setReason(machine.statusReason || '');
        }
    }, [machine]);

    const handleSubmit = () => {
        onSubmit(machine.id, status, reason);
        onClose();
    };

    if (!isOpen || !machine) return null;

    return (
        <div className="fixed inset-0 z-[300] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden transform transition-all scale-100">
                
                {/* Header */}
                <div className="bg-gray-100 dark:bg-gray-700 p-4 flex justify-between items-center border-b border-gray-200 dark:border-gray-600">
                    <h3 className="text-lg font-black text-gray-800 dark:text-white flex items-center">
                        <span className="bg-blue-600 text-white px-2 py-1 rounded mr-2 text-sm">{machine.name}</span>
                        Durum Güncelle
                    </h3>
                    <button onClick={onClose} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-full transition">
                        <X className="w-6 h-6 text-gray-500 dark:text-gray-300" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 space-y-6">
                    
                    <div className="grid grid-cols-2 gap-3">
                        {/* BOŞTA BUTONU */}
                        <button 
                            type="button"
                            onClick={() => setStatus(MACHINE_STATUS.AVAILABLE)}
                            className={`p-3 rounded-xl border-2 flex flex-col items-center justify-center transition-all ${status === MACHINE_STATUS.AVAILABLE ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-200 hover:border-green-300 text-gray-500'}`}
                        >
                            <CheckCircle className={`w-8 h-8 mb-2 ${status === MACHINE_STATUS.AVAILABLE ? 'text-green-600' : 'text-gray-400'}`} />
                            <span className="font-bold text-sm">Sorun Yok / Boşta</span>
                        </button>

                        {/* MEŞGUL BUTONU (YENİ) */}
                        <button 
                            type="button"
                            onClick={() => setStatus(MACHINE_STATUS.BUSY)}
                            className={`p-3 rounded-xl border-2 flex flex-col items-center justify-center transition-all ${status === MACHINE_STATUS.BUSY ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 hover:border-blue-300 text-gray-500'}`}
                        >
                            <Activity className={`w-8 h-8 mb-2 ${status === MACHINE_STATUS.BUSY ? 'text-blue-600' : 'text-gray-400'}`} />
                            <span className="font-bold text-sm">Meşgul / Ayar</span>
                        </button>

                        {/* BAKIMDA BUTONU */}
                        <button 
                            type="button"
                            onClick={() => setStatus(MACHINE_STATUS.MAINTENANCE)}
                            className={`p-3 rounded-xl border-2 flex flex-col items-center justify-center transition-all ${status === MACHINE_STATUS.MAINTENANCE ? 'border-yellow-500 bg-yellow-50 text-yellow-700' : 'border-gray-200 hover:border-yellow-300 text-gray-500'}`}
                        >
                            <Wrench className={`w-8 h-8 mb-2 ${status === MACHINE_STATUS.MAINTENANCE ? 'text-yellow-600' : 'text-gray-400'}`} />
                            <span className="font-bold text-sm">Bakımda</span>
                        </button>

                        {/* ARIZALI BUTONU */}
                        <button 
                            type="button"
                            onClick={() => setStatus(MACHINE_STATUS.FAULT)}
                            className={`p-3 rounded-xl border-2 flex flex-col items-center justify-center transition-all ${status === MACHINE_STATUS.FAULT ? 'border-red-500 bg-red-50 text-red-700' : 'border-gray-200 hover:border-red-300 text-gray-500'}`}
                        >
                            <AlertTriangle className={`w-8 h-8 mb-2 ${status === MACHINE_STATUS.FAULT ? 'text-red-600' : 'text-gray-400'}`} />
                            <span className="font-bold text-sm">Arızalı</span>
                        </button>
                    </div>

                    {/* AÇIKLAMA ALANI (Sadece sorun varsa açılır) */}
                    {status !== MACHINE_STATUS.AVAILABLE && (
                        <div className="animate-fadeIn">
                            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
                                Açıklama / Sebep:
                            </label>
                            <textarea 
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                                className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white text-sm"
                                rows="3"
                                placeholder="Örn: Sensör hatası, Yıllık bakım, Parça bağlanıyor..."
                            ></textarea>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 bg-gray-50 dark:bg-gray-700/50 flex justify-end space-x-3">
                    <button 
                        onClick={onClose}
                        className="px-4 py-2 text-gray-600 dark:text-gray-300 font-bold hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition"
                    >
                        İptal
                    </button>
                    <button 
                        onClick={handleSubmit}
                        className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-lg transform active:scale-95 transition"
                    >
                        Güncelle
                    </button>
                </div>
            </div>
        </div>
    );
};

export default MachineStatusModal;