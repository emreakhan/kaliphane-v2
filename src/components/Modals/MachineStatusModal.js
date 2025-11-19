// src/components/Modals/MachineStatusModal.js

import React, { useState, useEffect } from 'react';
import { AlertTriangle, Wrench, CheckCircle, X } from 'lucide-react';
import { MACHINE_STATUS } from '../../config/constants';

const MachineStatusModal = ({ isOpen, onClose, machine, onSubmit }) => {
    const [status, setStatus] = useState(MACHINE_STATUS.AVAILABLE);
    const [reason, setReason] = useState('');

    useEffect(() => {
        if (machine) {
            setStatus(machine.currentStatus || MACHINE_STATUS.AVAILABLE);
            setReason(machine.statusReason || '');
        }
    }, [machine, isOpen]);

    if (!isOpen || !machine) return null;

    const handleSubmit = () => {
        if (!machine.id) {
            console.error("Hata: Makine ID'si bulunamadı.");
            return;
        }
        onSubmit(machine.id, status, reason);
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-[60] p-4 backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-200 dark:border-gray-700">
                <div className="bg-gray-100 dark:bg-gray-700 p-4 flex justify-between items-center border-b dark:border-gray-600">
                    <h3 className="text-lg font-bold text-gray-800 dark:text-white flex items-center">
                        <Wrench className="w-5 h-5 mr-2" />
                        {machine.name} - Durum Yönetimi
                    </h3>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:text-gray-400">
                        <X className="w-6 h-6" />
                    </button>
                </div>
                <div className="p-6 space-y-6">
                    <div className="grid grid-cols-3 gap-3">
                        <button onClick={() => setStatus(MACHINE_STATUS.AVAILABLE)} className={`p-3 rounded-lg border-2 flex flex-col items-center justify-center transition-all ${status === MACHINE_STATUS.AVAILABLE ? 'border-green-500 bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'border-gray-200 hover:border-green-300 dark:border-gray-600 dark:text-gray-400'}`}>
                            <CheckCircle className="w-6 h-6 mb-1" /><span className="text-xs font-bold">AKTİF</span>
                        </button>
                        <button onClick={() => setStatus(MACHINE_STATUS.MAINTENANCE)} className={`p-3 rounded-lg border-2 flex flex-col items-center justify-center transition-all ${status === MACHINE_STATUS.MAINTENANCE ? 'border-yellow-500 bg-yellow-50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' : 'border-gray-200 hover:border-yellow-300 dark:border-gray-600 dark:text-gray-400'}`}>
                            <Wrench className="w-6 h-6 mb-1" /><span className="text-xs font-bold">BAKIMDA</span>
                        </button>
                        <button onClick={() => setStatus(MACHINE_STATUS.FAULT)} className={`p-3 rounded-lg border-2 flex flex-col items-center justify-center transition-all ${status === MACHINE_STATUS.FAULT ? 'border-red-500 bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'border-gray-200 hover:border-red-300 dark:border-gray-600 dark:text-gray-400'}`}>
                            <AlertTriangle className="w-6 h-6 mb-1" /><span className="text-xs font-bold">ARIZALI</span>
                        </button>
                    </div>
                    {status !== MACHINE_STATUS.AVAILABLE && (
                        <div className="animate-fadeIn">
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Açıklama / Sebep:</label>
                            <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder={status === MACHINE_STATUS.FAULT ? "Örn: Mil sıkıştı..." : "Örn: Periyodik bakım..."} className="w-full p-3 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white resize-none" rows="3" />
                        </div>
                    )}
                </div>
                <div className="p-4 bg-gray-50 dark:bg-gray-900 flex justify-end border-t dark:border-gray-700">
                    <button onClick={handleSubmit} className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition shadow-lg">Durumu Güncelle</button>
                </div>
            </div>
        </div>
    );
};
export default MachineStatusModal;