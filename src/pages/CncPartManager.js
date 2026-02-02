// src/pages/CncPartManager.js

import React, { useState, useEffect } from 'react';
import { 
    Plus, Save, Trash2, Edit2, X, Box, Ruler, CheckSquare
} from 'lucide-react';
import { 
    collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy 
} from '../config/firebase.js';
import { CNC_PARTS_COLLECTION } from '../config/constants.js';

const CncPartManager = ({ db }) => {
    const [parts, setParts] = useState([]);
    const [selectedPart, setSelectedPart] = useState(null);
    const [isEditing, setIsEditing] = useState(false);
    const [loading, setLoading] = useState(true);

    // Form Verisi
    const [partForm, setPartForm] = useState({
        partName: '',
        orderNumber: '', 
        criteria: [] // { id, type: 'NUMBER' | 'BOOL', name, nominal, upperTol, lowerTol }
    });

    useEffect(() => {
        if (!db) return;
        const q = query(collection(db, CNC_PARTS_COLLECTION), orderBy('partName'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            setParts(data);
            setLoading(false);
        });
        return () => unsubscribe();
    }, [db]);

    const handleSelectPart = (part) => {
        setSelectedPart(part);
        setPartForm(part);
        setIsEditing(false);
    };

    const handleNewPart = () => {
        const newPart = { partName: '', orderNumber: '', criteria: [] };
        setSelectedPart(null);
        setPartForm(newPart);
        setIsEditing(true);
    };

    const handleSavePart = async () => {
        if (!partForm.partName) return alert("Parça adı zorunludur.");

        try {
            if (selectedPart && selectedPart.id) {
                await updateDoc(doc(db, CNC_PARTS_COLLECTION, selectedPart.id), partForm);
            } else {
                await addDoc(collection(db, CNC_PARTS_COLLECTION), partForm);
            }
            setIsEditing(false);
            setSelectedPart(null); 
        } catch (error) {
            console.error("Hata:", error);
            alert("Kaydedilemedi.");
        }
    };

    const handleDeletePart = async (id) => {
        if (window.confirm("Bu parçayı silmek istediğinize emin misiniz?")) {
            await deleteDoc(doc(db, CNC_PARTS_COLLECTION, id));
            if (selectedPart?.id === id) {
                setSelectedPart(null);
                setIsEditing(false);
            }
        }
    };

    const addCriterion = () => {
        setPartForm({
            ...partForm,
            criteria: [
                ...partForm.criteria, 
                // Varsayılan NUMBER tipinde ekle
                { id: Date.now(), type: 'NUMBER', name: '', nominal: '', upperTol: '', lowerTol: '' }
            ]
        });
    };

    const removeCriterion = (index) => {
        const newCriteria = [...partForm.criteria];
        newCriteria.splice(index, 1);
        setPartForm({ ...partForm, criteria: newCriteria });
    };

    const updateCriterion = (index, field, value) => {
        const newCriteria = [...partForm.criteria];
        newCriteria[index][field] = value;
        setPartForm({ ...partForm, criteria: newCriteria });
    };

    return (
        <div className="p-6 max-w-7xl mx-auto min-h-screen bg-gray-100 dark:bg-gray-900 flex flex-col md:flex-row gap-6">
            
            {/* SOL PANEL: LİSTE */}
            <div className="w-full md:w-1/3 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 flex flex-col h-[80vh]">
                <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900/50 rounded-t-xl">
                    <h2 className="font-bold text-gray-800 dark:text-white flex items-center">
                        <Box className="w-5 h-5 mr-2 text-blue-600" /> Parça Listesi
                    </h2>
                    <button onClick={handleNewPart} className="p-2 bg-blue-100 text-blue-600 rounded-lg hover:bg-blue-200 transition">
                        <Plus className="w-5 h-5" />
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                    {loading ? <p className="p-4 text-center text-gray-500">Yükleniyor...</p> : parts.map(part => (
                        <div 
                            key={part.id} 
                            onClick={() => handleSelectPart(part)}
                            className={`p-3 rounded-lg cursor-pointer border transition flex justify-between items-center ${selectedPart?.id === part.id ? 'bg-blue-50 border-blue-500 dark:bg-blue-900/30' : 'bg-white border-transparent hover:bg-gray-50 dark:bg-gray-700 dark:hover:bg-gray-600'}`}
                        >
                            <div>
                                <div className="font-bold text-gray-800 dark:text-white">{part.partName}</div>
                                <div className="text-xs text-gray-500">{part.orderNumber || '-'}</div>
                            </div>
                            <div className="text-xs font-mono bg-gray-100 dark:bg-gray-600 px-2 py-1 rounded text-gray-600 dark:text-gray-300">
                                {part.criteria?.length || 0} Kriter
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* SAĞ PANEL: DETAY */}
            <div className="flex-1 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 h-[80vh] overflow-y-auto">
                {(isEditing || selectedPart) ? (
                    <div>
                        {/* BAŞLIK */}
                        <div className="flex justify-between items-center mb-6 border-b pb-4 dark:border-gray-700">
                            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                                {isEditing ? (selectedPart?.id ? 'Parçayı Düzenle' : 'Yeni Parça Tanımla') : selectedPart.partName}
                            </h1>
                            <div className="flex gap-2">
                                {!isEditing ? (
                                    <>
                                        <button onClick={() => { setPartForm(selectedPart); setIsEditing(true); }} className="flex items-center px-4 py-2 bg-yellow-100 text-yellow-700 rounded-lg hover:bg-yellow-200">
                                            <Edit2 className="w-4 h-4 mr-2" /> Düzenle
                                        </button>
                                        <button onClick={() => handleDeletePart(selectedPart.id)} className="flex items-center px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200">
                                            <Trash2 className="w-4 h-4 mr-2" /> Sil
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <button onClick={() => { setIsEditing(false); if(selectedPart?.id) setPartForm(selectedPart); else setSelectedPart(null); }} className="flex items-center px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300">
                                            <X className="w-4 h-4 mr-2" /> İptal
                                        </button>
                                        <button onClick={handleSavePart} className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 shadow-lg">
                                            <Save className="w-4 h-4 mr-2" /> Kaydet
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* FORM */}
                        <div className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Parça Adı</label>
                                    {isEditing ? (
                                        <input type="text" className="w-full p-2 border rounded dark:bg-gray-700 dark:text-white dark:border-gray-600" value={partForm.partName} onChange={e => setPartForm({...partForm, partName: e.target.value})} placeholder="Örn: Flanş Mili" />
                                    ) : (
                                        <div className="text-gray-900 dark:text-white font-medium p-2 bg-gray-50 dark:bg-gray-700/30 rounded">{selectedPart.partName}</div>
                                    )}
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Stok / Resim No</label>
                                    {isEditing ? (
                                        <input type="text" className="w-full p-2 border rounded dark:bg-gray-700 dark:text-white dark:border-gray-600" value={partForm.orderNumber} onChange={e => setPartForm({...partForm, orderNumber: e.target.value})} placeholder="Örn: 2024-001" />
                                    ) : (
                                        <div className="text-gray-900 dark:text-white font-medium p-2 bg-gray-50 dark:bg-gray-700/30 rounded">{selectedPart.orderNumber || '-'}</div>
                                    )}
                                </div>
                            </div>

                            {/* KRİTER TABLOSU */}
                            <div>
                                <div className="flex justify-between items-center mb-2 mt-6">
                                    <h3 className="font-bold text-gray-800 dark:text-gray-200 flex items-center">
                                        <Ruler className="w-5 h-5 mr-2 text-purple-600" /> Kalite Kontrol Planı
                                    </h3>
                                    {isEditing && (
                                        <button onClick={addCriterion} className="text-sm text-blue-600 font-bold hover:underline flex items-center bg-blue-50 px-3 py-1 rounded">
                                            <Plus className="w-4 h-4 mr-1" /> Kriter Ekle
                                        </button>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    {/* BAŞLIKLAR */}
                                    <div className="hidden md:grid grid-cols-12 gap-2 text-xs font-bold text-gray-500 uppercase px-2 mb-1">
                                        <div className="col-span-3">Ölçü / Kontrol Adı</div>
                                        <div className="col-span-2">Tip</div>
                                        <div className="col-span-2 text-center">Nominal</div>
                                        <div className="col-span-2 text-center">Üst Tol (+)</div>
                                        <div className="col-span-2 text-center">Alt Tol (-)</div>
                                        {isEditing && <div className="col-span-1 text-right">Sil</div>}
                                    </div>

                                    {/* SATIRLAR */}
                                    {partForm.criteria.map((crit, idx) => (
                                        <div key={idx} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center bg-gray-50 dark:bg-gray-700/50 p-3 md:p-2 rounded border border-gray-200 dark:border-gray-700">
                                            
                                            {/* ADI */}
                                            <div className="md:col-span-3">
                                                <label className="md:hidden text-xs font-bold text-gray-400 block">Adı</label>
                                                {isEditing ? (
                                                    <input type="text" className="w-full p-1 border rounded text-sm dark:bg-gray-700 dark:text-white dark:border-gray-600" value={crit.name} onChange={(e) => updateCriterion(idx, 'name', e.target.value)} placeholder="Örn: Ø20 veya Çapak" />
                                                ) : (
                                                    <span className="text-sm font-bold dark:text-white flex items-center">
                                                        {crit.type === 'BOOL' && <CheckSquare className="w-3 h-3 mr-1 text-orange-500"/>}
                                                        {crit.name}
                                                    </span>
                                                )}
                                            </div>

                                            {/* TİP SEÇİMİ (YENİ) */}
                                            <div className="md:col-span-2">
                                                <label className="md:hidden text-xs font-bold text-gray-400 block">Tip</label>
                                                {isEditing ? (
                                                    <select 
                                                        className="w-full p-1 border rounded text-sm dark:bg-gray-700 dark:text-white dark:border-gray-600"
                                                        value={crit.type || 'NUMBER'}
                                                        onChange={(e) => updateCriterion(idx, 'type', e.target.value)}
                                                    >
                                                        <option value="NUMBER">Sayısal Ölçü</option>
                                                        <option value="BOOL">Gözle Kontrol (OK/RET)</option>
                                                    </select>
                                                ) : (
                                                    <span className="text-xs bg-gray-200 dark:bg-gray-600 px-2 py-0.5 rounded text-gray-600 dark:text-gray-300">
                                                        {crit.type === 'BOOL' ? 'Gözle Kontrol' : 'Sayısal'}
                                                    </span>
                                                )}
                                            </div>

                                            {/* DEĞERLER (SADECE NUMBER İSE GÖSTER) */}
                                            {(!crit.type || crit.type === 'NUMBER') ? (
                                                <>
                                                    <div className="md:col-span-2">
                                                        <label className="md:hidden text-xs font-bold text-gray-400 block">Nominal</label>
                                                        {isEditing ? (
                                                            <input type="number" step="0.01" className="w-full p-1 border rounded text-sm text-center dark:bg-gray-700 dark:text-white dark:border-gray-600" value={crit.nominal} onChange={(e) => updateCriterion(idx, 'nominal', e.target.value)} placeholder="20.00" />
                                                        ) : (
                                                            <div className="text-center text-sm font-mono dark:text-white bg-white dark:bg-gray-600 rounded px-1">{crit.nominal}</div>
                                                        )}
                                                    </div>
                                                    <div className="md:col-span-2">
                                                        <label className="md:hidden text-xs font-bold text-gray-400 block">Üst Tol</label>
                                                        {isEditing ? (
                                                            <input type="number" step="0.01" className="w-full p-1 border rounded text-sm text-center text-green-600 font-bold dark:bg-gray-700 dark:border-gray-600" value={crit.upperTol} onChange={(e) => updateCriterion(idx, 'upperTol', e.target.value)} placeholder="0.05" />
                                                        ) : (
                                                            <div className="text-center text-sm font-mono text-green-600 bg-green-50 dark:bg-green-900/30 rounded px-1">+{crit.upperTol}</div>
                                                        )}
                                                    </div>
                                                    <div className="md:col-span-2">
                                                        <label className="md:hidden text-xs font-bold text-gray-400 block">Alt Tol</label>
                                                        {isEditing ? (
                                                            <input type="number" step="0.01" className="w-full p-1 border rounded text-sm text-center text-red-600 font-bold dark:bg-gray-700 dark:border-gray-600" value={crit.lowerTol} onChange={(e) => updateCriterion(idx, 'lowerTol', e.target.value)} placeholder="0.05" />
                                                        ) : (
                                                            <div className="text-center text-sm font-mono text-red-600 bg-red-50 dark:bg-red-900/30 rounded px-1">-{Math.abs(crit.lowerTol)}</div>
                                                        )}
                                                    </div>
                                                </>
                                            ) : (
                                                <div className="col-span-6 text-center text-gray-400 text-xs italic bg-gray-50 dark:bg-gray-800 rounded p-1">
                                                    -- Gözle Kontrol (Tik İşareti) --
                                                </div>
                                            )}

                                            {isEditing && (
                                                <div className="md:col-span-1 text-right mt-2 md:mt-0">
                                                    <button onClick={() => removeCriterion(idx)} className="text-red-500 hover:bg-red-100 p-2 rounded transition w-full md:w-auto flex justify-center items-center">
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                    {partForm.criteria.length === 0 && (
                                        <div className="text-center text-gray-400 py-6 italic text-sm border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg">
                                            Henüz ölçüm kriteri eklenmedi.
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center text-gray-400">
                        <Box className="w-20 h-20 mb-4 opacity-30" />
                        <p>Düzenlemek için soldan bir parça seçin.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default CncPartManager;