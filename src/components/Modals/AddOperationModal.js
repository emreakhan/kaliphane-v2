// src/components/Modals/AddOperationModal.js

import React, { useState, useEffect, useMemo } from 'react';
import { Save, Clock, Settings, Trash2, FileText, CheckSquare, Plus } from 'lucide-react';
import Modal from './Modal';
import { OPERATION_STATUS } from '../../config/constants.js';
import { db, collection, doc, setDoc, deleteDoc, onSnapshot } from '../../config/firebase.js';
import { generateNextWorkOrderNo } from '../../utils/workOrderUtils.js';

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

const AddOperationModal = ({ isOpen, onClose, mold, task, onSubmit }) => {
    const [operationsList, setOperationsList] = useState([]);
    const [isEditingTypes, setIsEditingTypes] = useState(false);
    const [newTypeName, setNewTypeName] = useState('');

    const [operationType, setOperationType] = useState('');
    const [customOperation, setCustomOperation] = useState('');
    
    // Alt İşlemler / Durumlar State'leri
    const [customSubOpsList, setCustomSubOpsList] = useState([]);
    const [selectedSubOps, setSelectedSubOps] = useState([]);
    const [isEditingSubOps, setIsEditingSubOps] = useState(false);
    const [newSubOpName, setNewSubOpName] = useState('');

    // Öngörülen CAM Süresi State'i
    const [estimatedCamTime, setEstimatedCamTime] = useState('');

    // İş Emri No State'i
    const [customWorkOrderNo, setCustomWorkOrderNo] = useState('');

    useEffect(() => {
        if (!isOpen) return;
        if (mold && task) {
            setCustomWorkOrderNo(generateNextWorkOrderNo(mold, task));
        }
        setSelectedSubOps([]);
        setIsEditingSubOps(false);
        setIsEditingTypes(false);

        // Operasyon türlerini dinle
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

        // Alt operasyon durumlarını dinle
        const unsubSubOps = onSnapshot(collection(db, 'artifacts/default-app-id/public/data/operationSubTypes'), (snapshot) => {
            const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setCustomSubOpsList(list);
        });

        return () => {
            unsubTypes();
            unsubSubOps();
        };
    }, [isOpen, mold, task]);

    useEffect(() => {
        if (isOpen && operationsList.length > 0 && !operationType) {
            setOperationType(operationsList[0].name);
        }
    }, [isOpen, operationsList, operationType]);

    // Mevcut seçili operasyon türüne ait alt işlemleri birleştir
    const currentSubOpsList = useMemo(() => {
        const currentTypeKey = (operationType || '').trim().toUpperCase();
        const baseDefaults = defaultSubOperationsMap[currentTypeKey] || defaultSubOperationsMap['GENEL'] || [];
        
        // Bu operasyon türüne ait Firestore'daki özel kayıtlar
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
            // Eklenen yeni seçeneği otomatik seçili yap
            setSelectedSubOps(prev => [...prev, nameClean]);
            setNewSubOpName('');
        } catch (e) {
            console.error("Alt işlem ekleme hatası:", e);
        }
    };

    const handleDeleteSubOp = async (item) => {
        if (!window.confirm(`"${item.name}" işlem durumunu listeden kaldırmak istediğinize emin misiniz?`)) return;
        try {
            if (item.isCustom && item.id) {
                await deleteDoc(doc(db, 'artifacts/default-app-id/public/data/operationSubTypes', item.id));
            } else {
                // Varsayılanı gizlemek için isDeleted kaydı oluştur
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

        const workOrderToSave = (customWorkOrderNo || generateNextWorkOrderNo(mold, task)).trim().toUpperCase();

        const newOperation = {
            id: Date.now().toString(),
            workOrderNo: workOrderToSave,
            isAdditionalOperation: true,
            type: typeToSave,
            subOperations: selectedSubOps,
            status: OPERATION_STATUS.NOT_STARTED,
            progressPercentage: 0,
            assignedOperator: 'SEÇ',
            startDate: null,
            estimatedDueDate: null,
            durationInHours: null,
            completionDate: null,
            pauseHistory: [],
            estimatedCamTime: estimatedCamTime ? parseFloat(estimatedCamTime) : null
        };

        onSubmit(mold.id, task.id, newOperation);
        
        // Modal kapandıktan sonra form alanlarını temizle
        setOperationType(defaultOperations[0]);
        setCustomOperation('');
        setSelectedSubOps([]);
        setEstimatedCamTime('');
        setCustomWorkOrderNo('');
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

                {/* İŞ EMRİ NUMARASI */}
                <div className="p-3.5 rounded-xl border bg-blue-50/70 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800/60 shadow-xs">
                    <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5 flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                        <span>İş Emri Numarası:</span>
                    </label>
                    <input
                        type="text"
                        value={customWorkOrderNo}
                        onChange={(e) => setCustomWorkOrderNo(e.target.value.toUpperCase())}
                        placeholder="Örn: 080726-YNK-3333-S1-01"
                        className="w-full p-2.5 border border-gray-300 dark:border-gray-600 rounded-lg font-mono font-black text-xs uppercase bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none shadow-inner"
                    />
                    <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1.5">
                        * Otomatik eşsiz ardışık numara tanımlanmıştır. Gerektiğinde manuel düzenleyebilirsiniz.
                    </p>
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
                                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300">Operasyon Türü</label>
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
                                className="w-full p-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 dark:text-white font-bold"
                                value={operationType}
                                onChange={(e) => {
                                    setOperationType(e.target.value);
                                    setSelectedSubOps([]); // Tür değiştiğinde alt seçimleri temizle
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

                        {/* YENİ: İŞLEM DETAYLARI & YAPILACAK İŞLER (ALT OPERASYONLAR) */}
                        <div className="p-3.5 rounded-xl border border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/40 dark:bg-indigo-950/20 space-y-2.5">
                            <div className="flex justify-between items-center">
                                <label className="text-xs font-bold text-gray-800 dark:text-gray-200 flex items-center gap-1.5">
                                    <CheckSquare className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                                    <span>İşlem Detayları & Yapılacak İşler ({operationType}):</span>
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
                                <div className="space-y-3 pt-1">
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

                                    <div className="max-h-40 overflow-y-auto divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-2">
                                        {currentSubOpsList.map(item => (
                                            <div key={item.id || item.name} className="flex justify-between items-center py-1.5 px-2 text-xs">
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
                                        {currentSubOpsList.length === 0 && (
                                            <div className="text-gray-400 text-center py-3 text-xs italic">Henüz özel durum seçeneği eklenmemiş.</div>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto p-1">
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

                                    {currentSubOpsList.length > 0 && (
                                        <div className="flex justify-between items-center pt-1 text-[11px] text-gray-500 dark:text-gray-400 border-t border-indigo-100 dark:border-indigo-900/40">
                                            <span><strong>{selectedSubOps.length}</strong> işlem seçildi</span>
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
                                    )}
                                </div>
                            )}
                        </div>
                    </>
                )}

                {/* Öngörülen CAM Süresi Inputu */}
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