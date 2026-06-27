// src/components/Modals/AddOperationModal.js

import React, { useState, useEffect } from 'react';
import { X, Save, Clock, Settings, Trash2 } from 'lucide-react';
import Modal from './Modal';
import { OPERATION_STATUS, MOLD_STATUS } from '../../config/constants.js';
import { db, collection, doc, setDoc, deleteDoc, onSnapshot } from '../../config/firebase.js';

const defaultOperations = [
    "TEZGAH İŞLEME",
    "TASARIM",
    "MONTAJ",
    "KALİTE KONTROL",
    "CMM ÖLÇÜMÜ",
    "TEL EREZYON",
    "DALMA EREZYON",
    "TAŞLAMA",
    "FREZELEME",
    "TORNA",
    "KAYNAK",
    "ISIL İŞLEM",
    "KAPLAMA",
    "DİĞER"
];

const AddOperationModal = ({ isOpen, onClose, mold, task, onSubmit }) => {
    const [operationsList, setOperationsList] = useState([]);
    const [isEditingTypes, setIsEditingTypes] = useState(false);
    const [newTypeName, setNewTypeName] = useState('');

    const [operationType, setOperationType] = useState('');
    const [customOperation, setCustomOperation] = useState('');
    
    // YENİ: Öngörülen CAM Süresi State'i
    const [estimatedCamTime, setEstimatedCamTime] = useState('');

    useEffect(() => {
        if (!isOpen) return;
        const unsubscribe = onSnapshot(collection(db, 'artifacts/default-app-id/public/data/operationTypes'), (snapshot) => {
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
        return () => unsubscribe();
    }, [isOpen]);

    useEffect(() => {
        if (isOpen && operationsList.length > 0) {
            setOperationType(operationsList[0].name);
        }
    }, [isOpen, operationsList]);

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

    const handleSubmit = () => {
        const typeToSave = operationType === "DİĞER" ? customOperation : operationType;
        if (!typeToSave.trim()) {
            alert("Lütfen operasyon türünü belirtin.");
            return;
        }

        const newOperation = {
            id: Date.now().toString(),
            type: typeToSave,
            status: OPERATION_STATUS.NOT_STARTED,
            progressPercentage: 0,
            assignedOperator: 'SEÇ',
            startDate: null,
            estimatedDueDate: null,
            durationInHours: null,
            completionDate: null,
            pauseHistory: [],
            // YENİ: Eklenen öngörülen süreyi kaydet
            estimatedCamTime: estimatedCamTime ? parseFloat(estimatedCamTime) : null
        };

        onSubmit(mold.id, task.id, newOperation);
        
        // Modal kapandıktan sonra form alanlarını temizle
        setOperationType(defaultOperations[0]);
        setCustomOperation('');
        setEstimatedCamTime('');
        onClose();
    };

    if (!isOpen || !mold || !task) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Yeni Operasyon Ekle">
            <div className="space-y-4">
                <div className="bg-gray-50 dark:bg-gray-700/50 p-3 rounded-lg text-sm text-gray-700 dark:text-gray-300">
                    <p><strong>Kalıp:</strong> {mold.moldName}</p>
                    <p><strong>İş Parçası:</strong> {task.taskName}</p>
                </div>

                {isEditingTypes ? (
                    <div className="space-y-4 border border-gray-200 dark:border-gray-700 p-4 rounded-xl bg-gray-50 dark:bg-gray-800">
                        <div className="flex justify-between items-center pb-2 border-b dark:border-gray-700">
                            <h4 className="font-bold text-gray-900 dark:text-white text-sm">Operasyon Türlerini Düzenle</h4>
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
                                className="px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded text-xs font-bold transition"
                            >
                                Ekle
                            </button>
                        </div>
                        
                        <div className="max-h-48 overflow-y-auto divide-y divide-gray-200 dark:divide-gray-700 pr-1 custom-scrollbar">
                            {operationsList.map(op => (
                                <div key={op.id} className="flex justify-between items-center py-2 text-xs">
                                    <span className="text-gray-800 dark:text-gray-200 font-bold">{op.name}</span>
                                    <button
                                        type="button"
                                        onClick={() => handleDeleteType(op)}
                                        className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/30 transition"
                                        title="Sil"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            ))}
                            {operationsList.length === 0 && (
                                <div className="text-gray-400 dark:text-gray-500 text-center py-4 text-xs">Operasyon türü bulunamadı.</div>
                            )}
                        </div>
                    </div>
                ) : (
                    <>
                        <div>
                            <div className="flex justify-between items-center mb-1">
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Operasyon Türü</label>
                                <button 
                                    type="button" 
                                    onClick={() => setIsEditingTypes(true)}
                                    className="text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                                    title="Türleri Düzenle"
                                >
                                    <Settings className="w-4 h-4" />
                                </button>
                            </div>
                            <select 
                                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 dark:text-white font-bold"
                                value={operationType}
                                onChange={(e) => setOperationType(e.target.value)}
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

                        {operationType === "DİĞER" && (
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Özel Operasyon Adı</label>
                                <input 
                                    type="text" 
                                    className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 dark:text-white"
                                    placeholder="Operasyon türünü yazınız..."
                                    value={customOperation}
                                    onChange={(e) => setCustomOperation(e.target.value)}
                                />
                            </div>
                        )}
                    </>
                )}

                {/* YENİ: Öngörülen CAM Süresi Inputu */}
                <div className="pt-2 border-t dark:border-gray-700">
                    <label className="flex items-center text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
                        <Clock className="w-4 h-4 mr-1 text-indigo-500"/> Öngörülen CAM İşleme Süresi (Saat)
                    </label>
                    <input 
                        type="number" 
                        min="0"
                        step="0.5"
                        className="w-full p-2.5 border border-indigo-200 dark:border-indigo-800 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 font-bold outline-none"
                        placeholder="Örn: 14.5"
                        value={estimatedCamTime}
                        onChange={(e) => setEstimatedCamTime(e.target.value)}
                    />
                    <p className="text-[10px] text-gray-500 mt-1 italic">
                        * Bu süre, makine planlama ve iş akış sayfalarındaki kapasite analizleri için kullanılacaktır.
                    </p>
                </div>

                {!isEditingTypes && (
                    <div className="flex justify-end pt-4 space-x-3">
                        <button 
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 dark:bg-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
                        >
                            İptal
                        </button>
                        <button 
                            onClick={handleSubmit}
                            disabled={operationType === "DİĞER" && !customOperation.trim()}
                            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 flex items-center disabled:opacity-50"
                        >
                            <Save className="w-4 h-4 mr-2" />
                            Kaydet
                        </button>
                    </div>
                )}
            </div>
        </Modal>
    );
};

export default AddOperationModal;