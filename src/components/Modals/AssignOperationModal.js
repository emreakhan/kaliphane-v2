// src/components/Modals/AssignOperationModal.js

import React, { useState, useEffect, useMemo } from 'react';
import { Send, AlertTriangle, ShieldAlert, Search, ChevronDown } from 'lucide-react'; 
import { PERSONNEL_ROLES, OPERATION_STATUS } from '../../config/constants.js'; 
import { getCurrentDateTimeString } from '../../utils/dateUtils.js';
import Modal from './Modal.js';

// --- YENİ: ARAMALI VE SIRALI SEÇİM BİLEŞENİ ---
const SearchableSelect = ({ label, options, value, onChange, placeholder, error }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [filter, setFilter] = useState('');

    // Dışarıdan value değişirse (örn: modal açıldığında) inputu güncelle
    useEffect(() => {
        setFilter(value || '');
    }, [value]);

    // Listeyi filtrele
    const filteredOptions = options.filter(opt => 
        opt.toLowerCase().includes(filter.toLowerCase())
    );

    const handleSelect = (option) => {
        setFilter(option);
        onChange(option);
        setIsOpen(false);
    };

    return (
        <div className="relative mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {label}
            </label>
            <div className="relative">
                <input
                    type="text"
                    className={`block w-full rounded-lg border-gray-300 shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white pr-8 pl-3 py-2 ${error ? 'border-red-500 ring-1 ring-red-500' : ''}`}
                    placeholder={placeholder}
                    value={filter}
                    onChange={(e) => {
                        setFilter(e.target.value);
                        setIsOpen(true);
                        onChange(e.target.value); 
                    }}
                    onFocus={() => setIsOpen(true)}
                />
                <div className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none">
                    {isOpen ? <ChevronDown className="w-4 h-4 rotate-180" /> : <Search className="w-4 h-4" />}
                </div>
            </div>
            
            {isOpen && filteredOptions.length > 0 && (
                <>
                    {/* Dışarı tıklamayı yakalamak için görünmez katman */}
                    <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)}></div>
                    
                    {/* Açılır Liste */}
                    <ul className="absolute z-20 w-full mt-1 max-h-48 overflow-y-auto bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg shadow-xl">
                        {filteredOptions.map((opt, idx) => (
                            <li 
                                key={idx}
                                onClick={() => handleSelect(opt)}
                                className="px-4 py-2 hover:bg-blue-50 dark:hover:bg-blue-900/30 cursor-pointer text-sm text-gray-700 dark:text-gray-200 border-b last:border-0 border-gray-100 dark:border-gray-600"
                            >
                                {opt}
                            </li>
                        ))}
                    </ul>
                </>
            )}
            
            {error && (
                <p className="mt-1 text-sm text-red-600 font-medium flex items-center">
                    <AlertTriangle className="w-4 h-4 mr-1" /> {error}
                </p>
            )}
        </div>
    );
};

const AssignOperationModal = ({ isOpen, onClose, mold, task, operation, loggedInUser, onSubmit, projects, personnel, machines }) => {
    const [machine, setMachine] = useState('');
    const [operator, setOperator] = useState('');
    const [dueDate, setDueDate] = useState('');
    const [machineError, setMachineError] = useState('');
    
    const [isCriticalConfirmed, setIsCriticalConfirmed] = useState(false);

    const today = new Date().toISOString().split('T')[0];

    // --- GÜNCELLENEN: SIRALAMA MANTIĞI ---
    const machineOperators = useMemo(() => 
        personnel
            .filter(p => p.role === PERSONNEL_ROLES.MACHINE_OPERATOR)
            .map(p => p.name)
            .sort((a, b) => a.localeCompare(b, 'tr')), // A-Z Sıralama
        [personnel]
    );

    const availableMachines = useMemo(() => 
        machines
            .map(m => m.name)
            .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })), // Doğal Sıralama (K-1, K-2, K-10)
        [machines]
    );
    // --------------------------------------

    useEffect(() => {
        if (isOpen) {
            const isResuming = operation && operation.status === OPERATION_STATUS.PAUSED;

            if (operation && operation.estimatedDueDate) {
                const datePart = operation.estimatedDueDate.split('T')[0]; 
                setDueDate(datePart);
            } else {
                setDueDate('');
            }
            
            if (isResuming) {
                setMachine(operation.machineName || '');
                setOperator(operation.machineOperatorName || '');
            } else {
                setMachine('');
                setOperator('');
            }
            setMachineError('');
            setIsCriticalConfirmed(false);
        }
    }, [isOpen, operation]);

    // YENİ: Parametre artık direkt string alıyor
    const handleMachineChange = (selectedMachine) => {
        setMachine(selectedMachine);
        
        if (selectedMachine) {
            let isBusy = false;
            let busyInfo = '';

            for (const p of projects) {
                for (const t of p.tasks) {
                    const activeOp = t.operations.find(op => 
                        op.status === OPERATION_STATUS.IN_PROGRESS && 
                        op.machineName === selectedMachine &&
                        op.id !== operation.id 
                    );

                    if (activeOp) {
                        isBusy = true;
                        busyInfo = `${p.moldName} - ${t.taskName}`;
                        break; 
                    }
                }
                if (isBusy) break;
            }

            if (isBusy) {
                setMachineError(`DİKKAT: Bu tezgah şu anda dolu! (${busyInfo})`);
            } else {
                setMachineError('');
            }
        } else {
            setMachineError('');
        }
    };

    const handleSave = () => {
        const isResuming = operation && operation.status === OPERATION_STATUS.PAUSED;

        const updatedOperation = {
            ...operation,
            status: OPERATION_STATUS.IN_PROGRESS,
            assignedOperator: loggedInUser.name,
            machineName: machine,
            machineOperatorName: operator,
            startDate: isResuming ? operation.startDate : getCurrentDateTimeString(), 
            estimatedDueDate: dueDate,
            reworkHistory: operation.reworkHistory || []
        };
        
        if (task.isCritical) {
            console.log(`Kritik parça onayı alındı. Operatör: ${loggedInUser.name}, Parça: ${task.taskName}`);
        }

        onSubmit(mold.id, task.id, updatedOperation);
        onClose();
    };

    const isFormValid = 
        !machineError && 
        machine && 
        operator && 
        (!task?.isCritical || isCriticalConfirmed); 

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={operation && operation.status === OPERATION_STATUS.PAUSED ? "İşi Devam Ettir" : "Yeni İş Ata / Başlat"}>
            
            {task?.isCritical && (
                <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/30 border-l-4 border-red-600 rounded-r-lg animate-pulse-slow">
                    <div className="flex items-start">
                        <ShieldAlert className="w-8 h-8 text-red-600 mr-3 flex-shrink-0" />
                        <div>
                            <h3 className="text-lg font-bold text-red-700 dark:text-red-300">⚠️ DİKKAT: BU PARÇA KRİTİKTİR!</h3>
                            <div className="mt-2 text-sm text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-800 p-3 rounded border border-red-200 dark:border-red-800">
                                <span className="font-semibold text-red-600">Tasarımcı Notu:</span> {task.criticalNote}
                            </div>
                        </div>
                    </div>
                    
                    <div className="mt-4 pt-3 border-t border-red-200 dark:border-red-800">
                        <label className="flex items-center space-x-3 cursor-pointer select-none">
                            <input 
                                type="checkbox" 
                                checked={isCriticalConfirmed}
                                onChange={(e) => setIsCriticalConfirmed(e.target.checked)}
                                className="w-5 h-5 text-red-600 rounded focus:ring-red-500 border-gray-300"
                            />
                            <span className="font-bold text-sm text-red-800 dark:text-red-300">
                                Kritik uyarıyı okudum, anladım.
                            </span>
                        </label>
                    </div>
                </div>
            )}

            <div className="space-y-4">
                
                {/* --- YENİ: ARAMALI TEZGAH SEÇİMİ --- */}
                <SearchableSelect 
                    label="Atanacak Tezgah"
                    options={availableMachines}
                    value={machine}
                    onChange={handleMachineChange}
                    placeholder="Tezgah Ara (Örn: K-1)"
                    error={machineError}
                />

                {/* --- YENİ: ARAMALI OPERATÖR SEÇİMİ --- */}
                <SearchableSelect 
                    label="Tezgah Operatörü"
                    options={machineOperators}
                    value={operator}
                    onChange={setOperator}
                    placeholder="Operatör Ara..."
                />

                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Tahmini Bitiş (Termin)
                    </label>
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
                    disabled={!isFormValid} 
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition flex items-center disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                    <Send className="w-4 h-4 mr-2"/> 
                    {operation && operation.status === OPERATION_STATUS.PAUSED ? 'İşi Devam Ettir' : 'Başlat ve Ata'}
                </button>
            </div>
        </Modal>
    );
};

export default AssignOperationModal;