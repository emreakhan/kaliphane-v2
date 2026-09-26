// src/components/Modals/AssignOperationModal.js

import React, { useState, useEffect, useMemo } from 'react';
import { Send, AlertTriangle, ShieldAlert, Search, ChevronDown, Clock, Settings, Trash2, CheckSquare, Plus } from 'lucide-react'; 
import { PERSONNEL_ROLES, OPERATION_STATUS } from '../../config/constants.js'; 
import { getCurrentDateTimeString, formatDurationHours, splitHoursToDaysAndHours, calculateTotalHoursFromDaysAndHours } from '../../utils/dateUtils.js';
import { db, collection, doc, setDoc, deleteDoc, onSnapshot } from '../../config/firebase.js';
import Modal from './Modal.js';

const defaultOperations = [
    "CNC",
    "TEZGAH İŞLEME",
    "FREZELEME",
    "5 EKSEN",
    "TORNA",
    "TEL EREZYON",
    "DALMA EREZYON",
    "TAŞLAMA",
    "MONTAJ",
    "KALİTE KONTROL",
    "CMM ÖLÇÜMÜ",
    "TASARIM",
    "KAYNAK",
    "ISIL İŞLEM",
    "KAPLAMA",
    "DİĞER"
];

const defaultSubOperationsMap = {
    "CNC": ["Diş Çekme", "Çevre Dönme", "Açılı Delik Delme", "Havşa Açma", "Yüzey Tarama", "Kaba Boşaltma", "Form İşleme", "Pah Kırma", "Kanal Açma", "Pim Delikleri"],
    "TEZGAH İŞLEME": ["Diş Çekme", "Çevre Dönme", "Açılı Delik Delme", "Havşa Açma", "Yüzey Tarama", "Kaba Boşaltma", "Form İşleme", "Pah Kırma", "Kanal Açma", "Pim Delikleri"],
    "FREZELEME": ["Diş Çekme", "Çevre Dönme", "Açılı Delik Delme", "Havşa Açma", "Yüzey Tarama", "Kaba Boşaltma", "Form İşleme", "Pah Kırma", "Kanal Açma", "Pim Delikleri"],
    "5 EKSEN": ["Açılı İşleme", "5 Eksen Eşzamanlı", "Diş Çekme", "Çevre Dönme", "Açılı Delik Delme", "Kaba Boşaltma", "Form Finish", "Pah Kırma"],
    "TORNA": ["Alın Tornalama", "Dış Çap Tornalama", "İç Çap Tornalama", "Diş Açma", "Kanal Açma", "Delik Delme", "Raybalama", "Pah Kırma"],
    "TEL EREZYON": ["Düz Kesim", "Açılı Kesim", "Göbek Düşürme", "İnce Finish Kesim", "Başlangıç Deliği Kesimi"],
    "DALMA EREZYON": ["Elektrot Dalma", "Kavite Boşaltma", "Yazı/Logo İşleme", "Kabuk Alma", "Kanal Dalma"],
    "TAŞLAMA": ["Düzlem Taşlama", "Silindirik Taşlama", "Açılı Taşlama", "Pah Taşlama", "Ölçüye Getirme"],
    "MONTAJ": ["Alıştırma", "Pim Çakma", "Civata Montajı", "Sızdırmazlık Testi", "Çapak Alma"],
    "KALİTE KONTROL": ["Kumpas/Mikrometre Ölçümü", "Yüzey Pürüzlülük Kontrolü", "Görsel Kontrol", "Sertlik Ölçümü"],
    "CMM ÖLÇÜMÜ": ["3D Koordinat Ölçümü", "Geometrik Tolerans Kontrolü", "Raporlama"],
    "GENEL": ["Diş Çekme", "Çevre Dönme", "Açılı Delik Delme", "Havşa Açma", "Yüzey Tarama", "Kaba Boşaltma", "Pah Kırma", "Delik Delme"]
};

const SearchableSelect = ({ label, options, value, onChange, placeholder, error, required = false }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [filter, setFilter] = useState('');

    useEffect(() => {
        setFilter(value || '');
    }, [value]);

    const filteredOptions = options.filter(opt => 
        opt.toLowerCase().includes(filter.toLowerCase())
    );

    const handleSelect = (option) => {
        setFilter(option);
        onChange(option);
        setIsOpen(false);
    };

    return (
        <div className="relative mb-3">
            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                {label} {required && <span className="text-red-500">*</span>}
            </label>
            <div className="relative">
                <input
                    type="text"
                    className={`block w-full text-xs rounded-lg border-gray-300 shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white pr-8 pl-3 py-2 font-bold ${error ? 'border-red-500 ring-1 ring-red-500' : ''}`}
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
                    <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)}></div>
                    <ul className="absolute z-20 w-full mt-1 max-h-48 overflow-y-auto bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg shadow-xl">
                        {filteredOptions.map((opt, idx) => (
                            <li 
                                key={idx}
                                onClick={() => handleSelect(opt)}
                                className="px-4 py-2 hover:bg-blue-50 dark:hover:bg-blue-900/30 cursor-pointer text-xs font-bold text-gray-700 dark:text-gray-200 border-b last:border-0 border-gray-100 dark:border-gray-600"
                            >
                                {opt}
                            </li>
                        ))}
                    </ul>
                </>
            )}
            
            {error && (
                <p className="mt-1 text-xs text-red-600 font-semibold flex items-center">
                    <AlertTriangle className="w-3.5 h-3.5 mr-1" /> {error}
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

    // Operasyon Türü State'leri
    const [operationsList, setOperationsList] = useState([]);
    const [operationType, setOperationType] = useState('');
    const [customOperation, setCustomOperation] = useState('');
    const [isEditingTypes, setIsEditingTypes] = useState(false);
    const [newTypeName, setNewTypeName] = useState('');

    // Alt İşlemler / Durumlar State'leri
    const [customSubOpsList, setCustomSubOpsList] = useState([]);
    const [selectedSubOps, setSelectedSubOps] = useState([]);
    const [isEditingSubOps, setIsEditingSubOps] = useState(false);
    const [newSubOpName, setNewSubOpName] = useState('');

    // Öngörülen CAM Süresi State'leri (Gün ve Saat)
    const [camDays, setCamDays] = useState('');
    const [camHours, setCamHours] = useState('');

    const today = new Date().toISOString().split('T')[0];

    const machineOperators = useMemo(() => 
        (personnel || [])
            .filter(p => p.role === PERSONNEL_ROLES.MACHINE_OPERATOR)
            .map(p => p.name)
            .sort((a, b) => a.localeCompare(b, 'tr')), 
        [personnel]
    );

    const availableMachines = useMemo(() => 
        (machines || [])
            .map(m => m.name)
            .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })), 
        [machines]
    );

    // Firebase Operasyon Türlerini ve Alt Durumlarını Dinle
    useEffect(() => {
        if (!isOpen) return;

        const unsubTypes = onSnapshot(collection(db, 'artifacts/default-app-id/public/data/operationTypes'), (snapshot) => {
            if (snapshot.empty) {
                defaultOperations.forEach(async (op) => {
                    const docId = `op-type-${op.replace(/\s+/g, '-').toLowerCase()}`;
                    await setDoc(doc(db, 'artifacts/default-app-id/public/data/operationTypes', docId), { name: op, createdAt: Date.now() });
                });
            } else {
                const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                list.sort((a, b) => a.name.localeCompare(b.name));
                setOperationsList(list);
            }
        });

        const unsubSubOps = onSnapshot(collection(db, 'artifacts/default-app-id/public/data/operationSubTypes'), (snapshot) => {
            const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setCustomSubOpsList(list);
        });

        return () => {
            unsubTypes();
            unsubSubOps();
        };
    }, [isOpen]);

    // Modal açıldığında veya operasyon değiştiğinde state'leri doldur
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
                setMachine(operation?.machineName || '');
                setOperator(operation?.machineOperatorName || '');
            }
            setMachineError('');
            setIsCriticalConfirmed(false);

            // Operasyon Türü
            const initialType = operation?.type || 'TEZGAH İŞLEME';
            setOperationType(initialType);
            setCustomOperation('');

            // Alt İşlemler
            setSelectedSubOps(Array.isArray(operation?.subOperations) ? [...operation.subOperations] : []);
            setIsEditingSubOps(false);
            setIsEditingTypes(false);

            // Öngörülen CAM Süresi (Gün ve Saat)
            const initialHours = operation?.estimatedCamTime || task?.estimatedCamTime || '';
            const split = splitHoursToDaysAndHours(initialHours);
            setCamDays(split.days);
            setCamHours(split.hours);
        }
    }, [isOpen, operation, task]);

    // Seçili operasyon türüne göre alt işlem listesini dinamik hesapla
    const currentSubOpsList = useMemo(() => {
        const currentTypeKey = (operationType || '').trim().toUpperCase();
        const baseDefaults = defaultSubOperationsMap[currentTypeKey] || defaultSubOperationsMap['GENEL'] || [];
        
        const customForThisType = customSubOpsList
            .filter(item => (item.operationType || '').trim().toUpperCase() === currentTypeKey)
            .map(item => ({ id: item.id, name: item.name, isCustom: true }));

        const deletedNames = customSubOpsList
            .filter(item => (item.operationType || '').trim().toUpperCase() === currentTypeKey && item.isDeleted)
            .map(item => item.name);

        const defaultItems = baseDefaults
            .filter(name => !deletedNames.includes(name) && !customForThisType.some(c => c.name.toUpperCase() === name.toUpperCase()))
            .map(name => ({ id: `def-${name}`, name, isCustom: false }));

        return [...defaultItems, ...customForThisType.filter(c => !c.isDeleted)];
    }, [operationType, customSubOpsList]);

    // Toplam CAM Süresi (Saat)
    const totalCamHours = useMemo(() => {
        return calculateTotalHoursFromDaysAndHours(camDays, camHours);
    }, [camDays, camHours]);

    const handleMachineChange = (selectedMachine) => {
        setMachine(selectedMachine);
        
        if (selectedMachine) {
            let isBusy = false;
            let busyInfo = '';

            for (const p of (projects || [])) {
                for (const t of (p.tasks || [])) {
                    const activeOp = (t.operations || []).find(op => 
                        op.status === OPERATION_STATUS.IN_PROGRESS && 
                        op.machineName === selectedMachine &&
                        op.id !== operation?.id 
                    );

                    if (activeOp) {
                        isBusy = true;
                        const camOp = activeOp.assignedOperator || 
                                      t.assignedOperator || 
                                      t.camOperator || 
                                      t.camPreparation?.operator || 
                                      activeOp.camOperator || 
                                      activeOp.camOperatorName || 
                                      t.camOperatorName || '';

                        const camOpDisplay = (camOp && camOp !== 'SEÇ' && camOp !== 'Belirtilmedi') 
                            ? ` | CAM Op: ${camOp}` 
                            : '';

                        busyInfo = `${p.moldName} - ${t.taskName}${camOpDisplay}`;
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

    // Alt işlem seç / kaldır
    const handleToggleSubOp = (name) => {
        setSelectedSubOps(prev => {
            if (prev.includes(name)) {
                return prev.filter(n => n !== name);
            } else {
                return [...prev, name];
            }
        });
    };

    const handleSelectAllSubOps = () => {
        setSelectedSubOps(currentSubOpsList.map(item => item.name));
    };

    const handleClearSubOps = () => {
        setSelectedSubOps([]);
    };

    // Yeni alt işlem ekle
    const handleAddNewSubOp = async () => {
        if (!newSubOpName.trim() || !operationType) return;
        const currentTypeKey = operationType.trim().toUpperCase();
        const nameClean = newSubOpName.trim();

        if (currentSubOpsList.some(item => item.name.toUpperCase() === nameClean.toUpperCase())) {
            alert("Bu işlem durumu zaten mevcut.");
            return;
        }

        try {
            const docId = `sub-op-${Date.now()}`;
            await setDoc(doc(db, 'artifacts/default-app-id/public/data/operationSubTypes', docId), {
                operationType: currentTypeKey,
                name: nameClean,
                createdAt: Date.now()
            });
            setSelectedSubOps(prev => [...prev, nameClean]);
            setNewSubOpName('');
        } catch (e) {
            console.error("Alt işlem ekleme hatası:", e);
        }
    };

    // Alt işlem sil
    const handleDeleteSubOp = async (item) => {
        if (!window.confirm(`"${item.name}" işlem durumunu listeden kaldırmak istediğinize emin misiniz?`)) return;
        try {
            if (item.isCustom && item.id) {
                await deleteDoc(doc(db, 'artifacts/default-app-id/public/data/operationSubTypes', item.id));
            } else {
                const currentTypeKey = (operationType || '').trim().toUpperCase();
                const docId = `sub-op-del-${currentTypeKey}-${item.name.replace(/\s+/g, '-').toLowerCase()}`;
                await setDoc(doc(db, 'artifacts/default-app-id/public/data/operationSubTypes', docId), {
                    operationType: currentTypeKey,
                    name: item.name,
                    isDeleted: true,
                    createdAt: Date.now()
                });
            }
            setSelectedSubOps(prev => prev.filter(n => n !== item.name));
        } catch (e) {
            console.error("Alt işlem silme hatası:", e);
        }
    };

    // Yeni operasyon türü ekle
    const handleAddNewType = async () => {
        if (!newTypeName.trim()) return;
        const nameUpper = newTypeName.trim().toUpperCase();
        
        if (operationsList.some(op => op.name.toUpperCase() === nameUpper)) {
            alert("Bu isimde bir operasyon türü zaten mevcut.");
            return;
        }
        
        try {
            const docId = `op-type-${Date.now()}`;
            await setDoc(doc(db, 'artifacts/default-app-id/public/data/operationTypes', docId), {
                name: newTypeName.trim(),
                createdAt: Date.now()
            });
            setNewTypeName('');
        } catch (e) {
            console.error("Ekleme hatası:", e);
        }
    };

    // Operasyon türü sil
    const handleDeleteType = async (op) => {
        if (!window.confirm(`"${op.name}" operasyon türünü silmek istediğinize emin misiniz?`)) return;
        try {
            await deleteDoc(doc(db, 'artifacts/default-app-id/public/data/operationTypes', op.id));
            if (operationType === op.name) {
                setOperationType('');
            }
        } catch (e) {
            console.error("Silme hatası:", e);
        }
    };

    const typeToSave = operationType === "DİĞER" ? customOperation.trim() : (operationType || '').trim();

    // ZORUNLULUK KONTROLLERİ:
    // 1. Tezgah seçilmeli
    // 2. Operatör seçilmeli
    // 3. Operasyon türü belirlenmeli
    // 4. En az 1 alt işlem (yapılan işlemler) seçilmeli
    // 5. Öngörülen CAM süresi > 0 olmalı (Gün ve/veya Saat)
    // 6. Kritik onay tamamlanmalı (parça kritikse)
    const isFormValid = 
        !machineError && 
        Boolean(machine) && 
        Boolean(operator) && 
        Boolean(typeToSave) &&
        selectedSubOps.length > 0 &&
        totalCamHours > 0 &&
        (!task?.isCritical || isCriticalConfirmed);

    const handleSave = () => {
        if (!isFormValid) return;

        const isResuming = operation && operation.status === OPERATION_STATUS.PAUSED;
        const now = getCurrentDateTimeString();

        let updatedOperation = {
            ...operation,
            type: typeToSave,
            subOperations: selectedSubOps,
            estimatedCamTime: totalCamHours,
            status: OPERATION_STATUS.IN_PROGRESS,
            assignedOperator: loggedInUser.name,
            machineName: machine,
            machineOperatorName: operator,
            startDate: isResuming ? operation.startDate : now, 
            estimatedDueDate: dueDate
        };
        
        if (task?.isCritical) {
            console.log(`Kritik parça onayı alındı. Operatör: ${loggedInUser.name}, Parça: ${task.taskName}`);
        }

        onSubmit(mold.id, task.id, updatedOperation, isResuming ? 'RESUME_JOB' : null);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <Modal 
            isOpen={isOpen} 
            onClose={onClose} 
            title={operation && operation.status === OPERATION_STATUS.PAUSED ? "İşi Devam Ettir" : "Yeni İş Ata / Başlat"}
            maxWidth="max-w-2xl"
        >
            {/* Kalıp ve Parça Bilgisi Özeti */}
            <div className="mb-4 bg-gray-50 dark:bg-gray-700/50 p-2.5 rounded-lg text-xs text-gray-700 dark:text-gray-300 flex flex-wrap justify-between items-center gap-2 border border-gray-200 dark:border-gray-600">
                <div><strong>Kalıp:</strong> <span className="font-semibold text-blue-700 dark:text-cyan-400">{mold?.moldName || '-'}</span></div>
                <div><strong>İş Parçası:</strong> <span className="font-semibold text-gray-900 dark:text-white">{task?.taskName || '-'}</span></div>
                {operation?.workOrderNo && (
                    <div className="font-mono bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200 px-2 py-0.5 rounded text-[11px] font-black">
                        {operation.workOrderNo}
                    </div>
                )}
            </div>

            {/* Kritik Parça Uyarısı */}
            {task?.isCritical && (
                <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 border-l-4 border-red-600 rounded-r-lg">
                    <div className="flex items-start">
                        <ShieldAlert className="w-6 h-6 text-red-600 mr-2.5 flex-shrink-0 mt-0.5" />
                        <div>
                            <h3 className="text-sm font-bold text-red-700 dark:text-red-300">⚠️ DİKKAT: BU PARÇA KRİTİKTİR!</h3>
                            <div className="mt-1 text-xs text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-800 p-2 rounded border border-red-200 dark:border-red-800">
                                <span className="font-semibold text-red-600">Tasarımcı Notu:</span> {task.criticalNote}
                            </div>
                        </div>
                    </div>
                    
                    <div className="mt-2 pt-2 border-t border-red-200 dark:border-red-800">
                        <label className="flex items-center space-x-2 cursor-pointer select-none">
                            <input 
                                type="checkbox" 
                                checked={isCriticalConfirmed}
                                onChange={(e) => setIsCriticalConfirmed(e.target.checked)}
                                className="w-4 h-4 text-red-600 rounded focus:ring-red-500 border-gray-300"
                            />
                            <span className="font-bold text-xs text-red-800 dark:text-red-300">
                                Kritik uyarıyı okudum, anladım.
                            </span>
                        </label>
                    </div>
                </div>
            )}

            <div className="space-y-4">
                {/* 1. OPERASYON TÜRÜ VE ALT İŞLEMLER */}
                {isEditingTypes ? (
                    <div className="space-y-3 border border-gray-200 dark:border-gray-700 p-3 rounded-xl bg-gray-50 dark:bg-gray-800">
                        <div className="flex justify-between items-center pb-2 border-b dark:border-gray-700">
                            <h4 className="font-bold text-gray-900 dark:text-white text-xs">Operasyon Türlerini Düzenle</h4>
                            <button 
                                type="button" 
                                onClick={() => setIsEditingTypes(false)}
                                className="text-blue-600 dark:text-blue-400 text-xs font-bold hover:underline"
                            >
                                Geri Dön
                            </button>
                        </div>
                        
                        <div className="flex gap-2">
                            <input
                                type="text"
                                placeholder="Yeni operasyon türü..."
                                value={newTypeName}
                                onChange={(e) => setNewTypeName(e.target.value)}
                                className="flex-1 p-2 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-950 dark:text-white outline-none focus:ring-1 focus:ring-blue-500 font-bold"
                            />
                            <button
                                type="button"
                                onClick={handleAddNewType}
                                className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded text-xs font-bold transition"
                            >
                                Ekle
                            </button>
                        </div>
                        
                        <div className="max-h-40 overflow-y-auto divide-y divide-gray-200 dark:divide-gray-700 pr-1 custom-scrollbar">
                            {operationsList.map(op => (
                                <div key={op.id} className="flex justify-between items-center py-1.5 text-xs">
                                    <span className="text-gray-800 dark:text-gray-200 font-bold">{op.name}</span>
                                    <button
                                        type="button"
                                        onClick={() => handleDeleteType(op)}
                                        className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/30 transition"
                                        title="Sil"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {/* Operasyon Türü */}
                            <div>
                                <div className="flex justify-between items-center mb-1">
                                    <label className="block text-xs font-bold text-gray-700 dark:text-gray-300">
                                        Operasyon Türü <span className="text-red-500">* (Zorunlu)</span>
                                    </label>
                                    <button 
                                        type="button" 
                                        onClick={() => setIsEditingTypes(true)}
                                        className="text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white p-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                                        title="Türleri Düzenle"
                                    >
                                        <Settings className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                                <select 
                                    className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 dark:text-white font-bold text-xs"
                                    value={operationType}
                                    onChange={(e) => {
                                        setOperationType(e.target.value);
                                        setSelectedSubOps([]);
                                    }}
                                >
                                    {operationsList.length === 0 ? (
                                        <option value="">Yükleniyor...</option>
                                    ) : (
                                        operationsList.map(op => (
                                            <option key={op.id} value={op.name}>{op.name}</option>
                                        ))
                                    )}
                                </select>
                            </div>

                            {/* Özel Operasyon Türü Girişi (Eğer DİĞER seçilirse) */}
                            {operationType === "DİĞER" ? (
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                                        Özel Operasyon Adı <span className="text-red-500">*</span>
                                    </label>
                                    <input 
                                        type="text" 
                                        className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 dark:text-white text-xs font-bold"
                                        placeholder="Operasyon türünü yazınız..."
                                        value={customOperation}
                                        onChange={(e) => setCustomOperation(e.target.value)}
                                    />
                                </div>
                            ) : (
                                <div className="hidden md:block"></div>
                            )}
                        </div>

                        {/* Yapılan İşlemler / Alt Operasyonlar (Zorunlu) */}
                        <div className="p-3 rounded-xl border border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/40 dark:bg-indigo-950/20 space-y-2">
                            <div className="flex justify-between items-center">
                                <label className="text-xs font-bold text-gray-800 dark:text-gray-200 flex items-center gap-1.5">
                                    <CheckSquare className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                                    <span>Yapılan İşlemler ({operationType || 'Belirtilmedi'}): <span className="text-red-500 font-black">* (En az 1 seçim zorunlu)</span></span>
                                </label>
                                <button
                                    type="button"
                                    onClick={() => setIsEditingSubOps(!isEditingSubOps)}
                                    className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
                                >
                                    <Settings className="w-3 h-3" />
                                    {isEditingSubOps ? "Seçime Dön" : "Seçenekleri Düzenle"}
                                </button>
                            </div>

                            {isEditingSubOps ? (
                                <div className="space-y-2.5 pt-1">
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            placeholder={`"${operationType}" için yeni durum (Örn: Diş Çekme)...`}
                                            value={newSubOpName}
                                            onChange={(e) => setNewSubOpName(e.target.value)}
                                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddNewSubOp(); } }}
                                            className="flex-1 p-2 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-1 focus:ring-indigo-500 font-bold"
                                        />
                                        <button
                                            type="button"
                                            onClick={handleAddNewSubOp}
                                            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-black transition flex items-center gap-1"
                                        >
                                            <Plus className="w-3.5 h-3.5" /> Ekle
                                        </button>
                                    </div>

                                    <div className="max-h-36 overflow-y-auto divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-1.5">
                                        {currentSubOpsList.map(item => (
                                            <div key={item.id || item.name} className="flex justify-between items-center py-1 px-2 text-xs">
                                                <span className="font-bold text-gray-800 dark:text-gray-200">{item.name}</span>
                                                <button
                                                    type="button"
                                                    onClick={() => handleDeleteSubOp(item)}
                                                    className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/30 transition"
                                                    title="Seçeneği Sil"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-0.5">
                                        {currentSubOpsList.map(item => {
                                            const isSelected = selectedSubOps.includes(item.name);
                                            return (
                                                <button
                                                    key={item.id || item.name}
                                                    type="button"
                                                    onClick={() => handleToggleSubOp(item.name)}
                                                    className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all flex items-center gap-1.5 select-none ${
                                                        isSelected 
                                                            ? 'bg-blue-600 text-white border-blue-600 shadow-xs dark:bg-cyan-500 dark:text-slate-950 dark:border-cyan-400 font-extrabold' 
                                                            : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-blue-400 hover:bg-blue-50/50 dark:hover:bg-gray-700'
                                                    }`}
                                                >
                                                    <span className={`w-3.5 h-3.5 rounded flex items-center justify-center text-[10px] ${isSelected ? 'bg-white/25 text-white dark:bg-slate-900/25 dark:text-slate-950 font-black' : 'border border-gray-400 dark:border-gray-500'}`}>
                                                        {isSelected ? '✓' : ''}
                                                    </span>
                                                    <span>{item.name}</span>
                                                </button>
                                            );
                                        })}
                                        {currentSubOpsList.length === 0 && (
                                            <p className="text-xs text-gray-400 italic">Bu operasyon türü için durum tanımlanmamış. "Seçenekleri Düzenle" ile ekleyebilirsiniz.</p>
                                        )}
                                    </div>

                                    <div className="flex justify-between items-center pt-1 text-[11px] text-gray-500 dark:text-gray-400 border-t border-indigo-100 dark:border-indigo-900/40">
                                        <span className={selectedSubOps.length === 0 ? "text-red-500 font-bold" : "text-gray-700 dark:text-gray-300"}>
                                            {selectedSubOps.length === 0 ? "⚠️ En az 1 işlem seçilmelidir" : `✓ ${selectedSubOps.length} işlem seçildi`}
                                        </span>
                                        <div className="flex gap-2 font-bold">
                                            <button 
                                                type="button" 
                                                onClick={handleSelectAllSubOps}
                                                className="text-blue-600 dark:text-cyan-400 hover:underline"
                                            >
                                                Tümünü Seç
                                            </button>
                                            <span>•</span>
                                            <button 
                                                type="button" 
                                                onClick={handleClearSubOps}
                                                className="text-red-500 hover:underline"
                                            >
                                                Temizle
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </>
                )}

                {/* 2. ÖNGÖRÜLEN CAM İŞLEME SÜRESİ (GÜN VE SAAT) - ZORUNLU */}
                <div className="p-3 rounded-xl border border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/40 dark:bg-indigo-950/20">
                    <div className="flex items-center justify-between mb-2">
                        <label className="flex items-center text-xs font-bold text-gray-800 dark:text-gray-200">
                            <Clock className="w-3.5 h-3.5 mr-1.5 text-indigo-500"/>
                            <span>Öngörülen CAM Süresi <span className="text-red-500 font-black">* (Zorunlu)</span></span>
                        </label>
                        {totalCamHours > 0 && (
                            <span className="text-xs font-black px-2.5 py-0.5 rounded-md bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                                {formatDurationHours(totalCamHours)}
                            </span>
                        )}
                    </div>
                    
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-[11px] font-bold text-gray-600 dark:text-gray-400 mb-1">
                                Gün
                            </label>
                            <input 
                                type="number" 
                                min="0"
                                step="1"
                                className="w-full p-2 border border-indigo-200 dark:border-indigo-800 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-bold text-xs outline-none"
                                placeholder="Örn: 1"
                                value={camDays}
                                onChange={(e) => setCamDays(e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="block text-[11px] font-bold text-gray-600 dark:text-gray-400 mb-1">
                                Saat
                            </label>
                            <input 
                                type="number" 
                                min="0"
                                max="23.9"
                                step="0.5"
                                className="w-full p-2 border border-indigo-200 dark:border-indigo-800 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-bold text-xs outline-none"
                                placeholder="Örn: 12"
                                value={camHours}
                                onChange={(e) => setCamHours(e.target.value)}
                            />
                        </div>
                    </div>

                    {totalCamHours <= 0 ? (
                        <p className="text-[11px] text-red-500 font-semibold mt-1.5 flex items-center">
                            * CAM işleme süresi girilmesi zorunludur (en az Gün veya Saat belirtiniz).
                        </p>
                    ) : (
                        <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1 italic">
                            * Bu süre, makine planlama ve kapasite analizlerinde kullanılacaktır.
                        </p>
                    )}
                </div>

                {/* 3. TEZGAH VE OPERATÖR SEÇİMİ */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                    <SearchableSelect 
                        label="Atanacak Tezgah"
                        options={availableMachines}
                        value={machine}
                        onChange={handleMachineChange}
                        placeholder="Tezgah Ara (Örn: K-1)"
                        error={machineError}
                        required={true}
                    />

                    <SearchableSelect 
                        label="Tezgah Operatörü"
                        options={machineOperators}
                        value={operator}
                        onChange={setOperator}
                        placeholder="Operatör Ara..."
                        required={true}
                    />
                </div>

                {/* 4. TAHMİNİ BİTİŞ (TERMİN) */}
                <div>
                    <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                        Tahmini Bitiş (Termin Tarihi)
                    </label>
                    <input
                        type="date"
                        value={dueDate}
                        min={today}
                        onChange={(e) => setDueDate(e.target.value)}
                        className="block w-full text-xs rounded-lg border-gray-300 shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white font-bold p-2"
                    />
                </div>
            </div>

            {/* Form Doğrulama Eksikleri Bilgilendirmesi */}
            {!isFormValid && (
                <div className="mt-4 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-[11px] text-amber-800 dark:text-amber-300">
                    <span className="font-bold">Eksik Zorunlu Alanlar: </span>
                    <span className="space-x-1.5">
                        {!machine && <span className="underline font-semibold">• Tezgah</span>}
                        {!operator && <span className="underline font-semibold">• Operatör</span>}
                        {!typeToSave && <span className="underline font-semibold">• Operasyon Türü</span>}
                        {selectedSubOps.length === 0 && <span className="underline font-semibold">• En Az 1 İşlem Durumu</span>}
                        {totalCamHours <= 0 && <span className="underline font-semibold">• Öngörülen CAM Süresi</span>}
                        {task?.isCritical && !isCriticalConfirmed && <span className="underline font-semibold">• Kritik Onayı</span>}
                        {machineError && <span className="text-red-600 font-bold">• Seçili Tezgah Meşgul</span>}
                    </span>
                </div>
            )}

            {/* Alt Butonlar */}
            <div className="mt-5 flex justify-end space-x-3 pt-3 border-t dark:border-gray-700">
                <button
                    onClick={onClose}
                    className="px-4 py-2 text-xs font-bold text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-700 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition"
                >
                    İptal
                </button>
                <button
                    onClick={handleSave}
                    disabled={!isFormValid} 
                    className="px-4 py-2 text-xs font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition flex items-center disabled:bg-gray-400 disabled:cursor-not-allowed shadow-sm"
                >
                    <Send className="w-3.5 h-3.5 mr-1.5"/> 
                    {operation && operation.status === OPERATION_STATUS.PAUSED ? 'İşi Devam Ettir' : 'Başlat ve Ata'}
                </button>
            </div>
        </Modal>
    );
};

export default AssignOperationModal;