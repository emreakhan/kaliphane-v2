// src/components/Modals/AssignOperationModal.js

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Send, AlertTriangle } from 'lucide-react';
import { PERSONNEL_ROLES, OPERATION_STATUS } from '../../config/constants.js'; 
import { getCurrentDateTimeString, formatDate } from '../../utils/dateUtils.js';
import Modal from './Modal.js';

const AssignOperationModal = ({ isOpen, onClose, mold, task, operation, loggedInUser, onSubmit, projects, personnel, machines }) => {
    const [machine, setMachine] = useState('');
    const [operator, setOperator] = useState('');
    const [dueDate, setDueDate] = useState('');
    const [machineError, setMachineError] = useState('');
    const today = new Date().toISOString().split('T')[0];

    const machineOperators = useMemo(() => 
        personnel.filter(p => p.role === PERSONNEL_ROLES.MACHINE_OPERATOR).map(p => p.name),
        [personnel]
    );
    const availableMachines = useMemo(() => 
        machines.map(m => m.name),
        [machines]
    );

    useEffect(() => {
        if (isOpen) {
            // Varsayılan tarih (3 gün sonrası)
            let defaultDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            
            // Eğer operasyonun zaten bir termini varsa onu kullan
            if (operation && operation.estimatedDueDate) {
                defaultDate = operation.estimatedDueDate;
            }
            setDueDate(defaultDate);
            
            setMachineError('');
            
            // Eğer mevcut bir operasyonla açıldıysa (Devam Et/Ata)
            if (operation && operation.machineName) {
                setMachine(operation.machineName);
            } else if (availableMachines.length > 0 && !machine) {
                setMachine(availableMachines[0] || '');
            }

            if (operation && operation.machineOperatorName) {
                setOperator(operation.machineOperatorName);
            } else if (machineOperators.length > 0 && !operator) {
                setOperator(machineOperators[0] || '');
            }
        }
    }, [isOpen, availableMachines, machineOperators, machine, operator, operation]);

    const checkMachineAvailability = useCallback((machineName) => {
        const isMachineBusy = projects.some(project => 
            project.tasks.some(t => 
                t.operations.some(op => 
                    op.machineName === machineName && 
                    op.status === OPERATION_STATUS.IN_PROGRESS && 
                    op.id !== operation?.id
                )
            )
        );
        return !isMachineBusy;
    }, [projects, operation]);

    const handleMachineChange = (selectedMachine) => {
        setMachine(selectedMachine);
        if (!checkMachineAvailability(selectedMachine)) {
            setMachineError(`⚠️ ${selectedMachine} tezgahı şu anda başka bir işte kullanılıyor!`);
        } else {
            setMachineError('');
        }
    };

    const handleSave = () => {
        if (!machine || !operator || !dueDate) {
            console.error("Tüm alanlar doldurulmalıdır.");
            return;
        }
        if (!checkMachineAvailability(machine)) {
            setMachineError(`⚠️ ${machine} tezgahı başka bir işte kullanılıyor! Lütfen başka bir tezgah seçin.`);
            return;
        }

        // YENİ MANTIK:
        // Eğer operasyon zaten varsa (yani resume ediliyorsa), mevcut startDate'i korumalı mıyız?
        // Genellikle 'Devam Et' dendiğinde o anki zaman yeni 'başlangıç' olmaz, iş kaldığı yerden devam eder.
        // Ancak 'tezgah süresi' hesabı için bu karışık olabilir.
        // Şimdilik basit tutalım: Resume edilse bile, o anın tarihini 'startDate' olarak güncellemeyelim, 
        // çünkü toplam süreyi (ilk başlangıçtan bitişe kadar) hesaplamak daha doğru olur.
        
        // VEYA: Eğer iş PAUSED ise, startDate'i değiştirmemek en mantıklısıdır.
        // Eğer NOT_STARTED ise (yeni atama), startDate şu an olur.
        
        const isResuming = operation && operation.status === OPERATION_STATUS.PAUSED;
        
        const updatedOperation = {
            ...operation,
            assignedOperator: loggedInUser.name,
            machineName: machine,
            machineOperatorName: operator,
            estimatedDueDate: dueDate,
            // Eğer iş duraklatılmışsa ve devam ediyorsa, eski başlangıç tarihini koru.
            // Eğer yeni bir işse, şu anı başlangıç tarihi yap.
            startDate: isResuming ? (operation.startDate || getCurrentDateTimeString()) : getCurrentDateTimeString(),
            status: OPERATION_STATUS.IN_PROGRESS,
            progressPercentage: operation.progressPercentage || 0, // Mevcut yüzdeyi koru
        };
        
        onSubmit(mold.id, task.id, updatedOperation);
        onClose();
    };

    // Başlık dinamik olsun
    const modalTitle = operation && operation.status === OPERATION_STATUS.PAUSED 
        ? `İşi Devam Ettir: ${task.taskName}` 
        : `Operasyon Atama: ${task.taskName}`;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`${modalTitle} (${operation.type})`}>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
                {operation && operation.status === OPERATION_STATUS.PAUSED 
                    ? `Bu iş %${operation.progressPercentage} seviyesinde duraklatılmış. Devam etmek için tezgah ve operatör onaylayın.`
                    : `Bu operasyonu kendinize atayarak ({loggedInUser.name}) gerekli tezgah ve operatör bilgilerini giriniz.`
                }
            </p>

            <div className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Tezgah Seçimi</label>
                    <select
                        value={machine}
                        onChange={(e) => handleMachineChange(e.target.value)}
                        className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    >
                        <option value="">Tezgah Seçiniz</option>
                        {availableMachines.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                    {machineError && (
                        <div className="mt-2 flex items-center text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-2 rounded-lg">
                            <AlertTriangle className="w-4 h-4 mr-2" />
                            {machineError}
                        </div>
                    )}
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Tezgah Operatörü</label>
                    <select
                        value={operator}
                        onChange={(e) => setOperator(e.target.value)}
                        className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    >
                        <option value="">Operatör Seçiniz</option>
                        {machineOperators.map(op => <option key={op} value={op}>{op}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Tahmini Termin Süresi (Tarih)</label>

                    {mold && mold.moldDeadline && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 mb-1">
                            (Ana Kalıp Termini: {formatDate(mold.moldDeadline)})
                        </p>
                    )}
                    
                    <input
                        type="date"
                        value={dueDate}
                        min={today}
                        onChange={(e) => setDueDate(e.target.value)}
                        className="block w-full rounded-lg border-gray-300 shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    />
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
                    disabled={!!machineError || !machine || !operator}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition flex items-center disabled:bg-blue-400 disabled:cursor-not-allowed"
                >
                    <Send className="w-4 h-4 mr-2"/> {operation && operation.status === OPERATION_STATUS.PAUSED ? 'İşi Devam Ettir' : 'İşi Ata ve Başlat'}
                </button>
            </div>
        </Modal>
    );
};

export default AssignOperationModal;