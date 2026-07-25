import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Monitor, Wrench, FileText, Plus, Trash2, CheckCircle, Search, ChevronDown, X } from 'lucide-react';
import Modal from '../components/Modals/Modal';

const CamPreparationModal = ({ isOpen, onClose, mold, task, operation = null, machines = [], loggedInUser, onSave }) => {
    const [selectedMachineId, setSelectedMachineId] = useState('');
    const [machineSearchQuery, setMachineSearchQuery] = useState('');
    const [isMachineDropdownOpen, setIsMachineDropdownOpen] = useState(false);
    const machineDropdownRef = useRef(null);

    const [instructions, setInstructions] = useState('');
    const [formTools, setFormTools] = useState([]);

    // 1. Hedef Tezgahları küçükten büyüğe sıralama (K01, K02... K68)
    const sortedMachines = useMemo(() => {
        return [...(machines || [])].sort((a, b) => 
            (a.name || '').localeCompare(b.name || '', undefined, { numeric: true, sensitivity: 'base' })
        );
    }, [machines]);

    // Arama terimine göre filtrelenmiş tezgahlar
    const filteredMachines = useMemo(() => {
        if (!machineSearchQuery.trim()) return sortedMachines;
        const query = machineSearchQuery.toLowerCase().trim();
        return sortedMachines.filter(m => (m.name || '').toLowerCase().includes(query));
    }, [sortedMachines, machineSearchQuery]);

    // Dışarı tıklandığında tezgah arama dropdown'ını kapatma
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (machineDropdownRef.current && !machineDropdownRef.current.contains(e.target)) {
                setIsMachineDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Form açıldığında verileri doldurma (Operasyon bazlı veya Parça bazlı)
    useEffect(() => {
        if (isOpen) {
            const prep = operation?.camPreparation || task?.camPreparation;
            if (prep) {
                setSelectedMachineId(prep.targetMachineId || '');
                setInstructions(prep.instructions || '');
                
                const matchedMachine = sortedMachines.find(m => m.id === prep.targetMachineId || m.name === prep.targetMachineName);
                setMachineSearchQuery(matchedMachine ? matchedMachine.name : (prep.targetMachineName || ''));

                if (prep.requiredTools && prep.requiredTools.length > 0) {
                    setFormTools(prep.requiredTools.map(t => ({
                        id: t.toolId || t.id || Date.now().toString() + Math.random().toString(36).substr(2, 4),
                        toolName: t.toolName || t.name || '',
                        holderType: t.holderType || '',
                        isShrink: !!t.isShrink,
                        length: t.length || '',
                        shrinkLength: t.shrinkLength || '',
                        condition: t.condition || 'ANY',
                        notes: t.notes || ''
                    })));
                } else {
                    setFormTools([createNewToolRow()]);
                }
            } else {
                const defaultMachineName = operation?.machineName || task?.plannedMachine || '';
                const matchedMachine = sortedMachines.find(m => m.name === defaultMachineName);
                setSelectedMachineId(matchedMachine ? matchedMachine.id : '');
                setMachineSearchQuery(defaultMachineName);
                setInstructions('');
                setFormTools([createNewToolRow()]);
            }
        }
    }, [isOpen, task, operation, sortedMachines]);

    const createNewToolRow = () => ({
        id: Date.now().toString() + Math.random().toString(36).substr(2, 4),
        toolName: '',
        holderType: '',
        isShrink: false,
        length: '',
        shrinkLength: '',
        condition: 'ANY',
        notes: ''
    });

    const addToolRow = () => {
        setFormTools(prev => [...prev, createNewToolRow()]);
    };

    const removeToolRow = (id) => {
        if (formTools.length === 1) {
            setFormTools([createNewToolRow()]);
            return;
        }
        setFormTools(prev => prev.filter(t => t.id !== id));
    };

    const updateToolRow = (id, field, value) => {
        setFormTools(prev => prev.map(t => {
            if (t.id === id) {
                const updated = { ...t, [field]: value };
                if (field === 'isShrink' && !value) {
                    updated.shrinkLength = '';
                }
                return updated;
            }
            return t;
        }));
    };

    const handleSelectMachine = (m) => {
        setSelectedMachineId(m.id);
        setMachineSearchQuery(m.name);
        setIsMachineDropdownOpen(false);
    };

    // Formu Gönderme / Kaydetme
    const handleSubmit = () => {
        if (!selectedMachineId) {
            alert("Lütfen hedef tezgahı seçiniz.");
            return;
        }

        const validTools = formTools.filter(t => t.toolName.trim() !== '');
        const targetMachine = sortedMachines.find(m => m.id === selectedMachineId);

        const camPreparationData = {
            status: "HAZIRLANDI",
            preparedBy: loggedInUser?.name || "CAM Operatörü",
            preparedAt: new Date().toISOString(),
            targetMachineId: selectedMachineId,
            targetMachineName: targetMachine?.name || machineSearchQuery || '',
            operationId: operation?.id || null,
            operationType: operation?.type || null,
            requiredTools: validTools.map(t => ({
                toolId: t.id,
                id: t.id,
                name: t.toolName.trim(),
                toolName: t.toolName.trim(),
                holderType: t.holderType.trim(),
                isShrink: t.isShrink,
                length: t.length.trim(),
                shrinkLength: t.shrinkLength.trim(),
                condition: t.condition,
                notes: t.notes.trim()
            })),
            instructions: instructions
        };

        onSave(mold.id, task.id, camPreparationData, operation?.id || null);
    };

    if (!isOpen || !mold || !task) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="CAM Ön Hazırlık, Forklift & Takım Talebi" maxWidth="max-w-6xl">
            <div className="space-y-6">
                
                {/* 1. Kısım: Kalıp ve İş Bilgisi */}
                <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-100 dark:border-blue-800 flex justify-between items-center">
                    <div>
                        <h3 className="font-black text-blue-900 dark:text-blue-300 text-lg">{mold.moldName}</h3>
                        <p className="text-blue-700 dark:text-blue-400 font-bold text-sm">
                            İş Parçası: {task.taskName} {operation ? `• Operasyon: ${operation.type} (${operation.machineName || 'Tezgah Atanmadı'})` : ''}
                        </p>
                    </div>
                    <div className="text-right text-xs font-bold text-blue-600 dark:text-blue-400">
                        {task.cadOperator && <div>CAD: {task.cadOperator}</div>}
                        {task.camResponsible && <div>CAM: {task.camResponsible}</div>}
                    </div>
                </div>

                {/* 2. Kısım: Hedef Tezgah Seçimi (Küçükten Büyüğe Sıralı & Arama Özellikli) */}
                <div className="relative" ref={machineDropdownRef}>
                    <label className="flex items-center text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
                        <Monitor className="w-4 h-4 mr-2 text-indigo-500" /> Hedef Tezgah (Küçükten Büyüğe Sıralı - Yazarak Arayabilirsiniz)
                    </label>
                    <div className="relative">
                        <input 
                            type="text"
                            placeholder="Tezgah adı yazın (Örn: K68, K02)..."
                            value={machineSearchQuery}
                            onChange={(e) => {
                                setMachineSearchQuery(e.target.value);
                                setIsMachineDropdownOpen(true);
                                const match = sortedMachines.find(m => m.name.toLowerCase() === e.target.value.toLowerCase().trim());
                                if (match) setSelectedMachineId(match.id);
                                else setSelectedMachineId('');
                            }}
                            onFocus={() => setIsMachineDropdownOpen(true)}
                            className="w-full p-3 pl-10 pr-10 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-bold focus:ring-2 focus:ring-indigo-500 shadow-sm"
                        />
                        <Search className="w-5 h-5 text-gray-400 absolute left-3 top-3.5" />
                        {machineSearchQuery ? (
                            <button 
                                onClick={() => { setMachineSearchQuery(''); setSelectedMachineId(''); setIsMachineDropdownOpen(true); }}
                                className="absolute right-3 top-3.5 text-gray-400 hover:text-gray-600"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        ) : (
                            <ChevronDown className="w-5 h-5 text-gray-400 absolute right-3 top-3.5 pointer-events-none" />
                        )}
                    </div>

                    {isMachineDropdownOpen && (
                        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl max-h-60 overflow-y-auto">
                            {filteredMachines.map(m => (
                                <button
                                    key={m.id}
                                    type="button"
                                    onClick={() => handleSelectMachine(m)}
                                    className={`w-full text-left px-4 py-3 hover:bg-indigo-50 dark:hover:bg-indigo-900/40 border-b last:border-0 border-gray-100 dark:border-gray-700 font-bold text-sm transition flex justify-between items-center ${selectedMachineId === m.id ? 'bg-indigo-50 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400' : 'text-gray-800 dark:text-gray-200'}`}
                                >
                                    <span>{m.name}</span>
                                    {selectedMachineId === m.id && <CheckCircle className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />}
                                </button>
                            ))}
                            {filteredMachines.length === 0 && (
                                <div className="p-4 text-center text-gray-500 font-bold text-sm">Eşleşen tezgah bulunamadı.</div>
                            )}
                        </div>
                    )}
                </div>

                {/* 3. Kısım: Standart Detaylı Takım Hazırlama Masası */}
                <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-4 bg-white dark:bg-gray-800 shadow-sm">
                    <div className="flex justify-between items-center mb-4 border-b dark:border-gray-700 pb-3">
                        <div className="flex items-center gap-2">
                            <Wrench className="w-5 h-5 text-orange-500" />
                            <h4 className="font-bold text-gray-900 dark:text-white text-base">Gerekli Takım Listesi (Takımhane Standart Formu)</h4>
                        </div>
                        <button
                            type="button"
                            onClick={addToolRow}
                            className="px-3.5 py-1.5 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-xs font-bold transition flex items-center shadow-sm"
                        >
                            <Plus className="w-4 h-4 mr-1" /> + Yeni Takım Ekle
                        </button>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                            <thead>
                                <tr className="border-b border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 font-bold uppercase tracking-wider bg-gray-50 dark:bg-gray-700/50">
                                    <th className="p-2.5 min-w-[180px]">Takım Adı / Tanımı *</th>
                                    <th className="p-2.5 min-w-[120px]">Tutucu Tipi</th>
                                    <th className="p-2.5 text-center min-w-[90px]">Shrink mi?</th>
                                    <th className="p-2.5 min-w-[100px]">Takım Boyu (mm)</th>
                                    <th className="p-2.5 min-w-[110px]">Shrink Boyu (mm)</th>
                                    <th className="p-2.5 min-w-[140px]">Kondisyon / Durum</th>
                                    <th className="p-2.5 min-w-[160px]">Özel Not</th>
                                    <th className="p-2.5 text-center w-12">İşlem</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                                {formTools.map((t) => (
                                    <tr key={t.id} className="hover:bg-gray-50/80 dark:hover:bg-gray-700/30 transition-colors">
                                        <td className="p-2">
                                            <input
                                                type="text"
                                                placeholder="Örn: 10 R0.5 Freze"
                                                value={t.toolName}
                                                onChange={(e) => updateToolRow(t.id, 'toolName', e.target.value)}
                                                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 font-bold text-gray-900 dark:text-white"
                                            />
                                        </td>
                                        <td className="p-2">
                                            <input
                                                type="text"
                                                placeholder="Örn: HSK63A"
                                                value={t.holderType}
                                                onChange={(e) => updateToolRow(t.id, 'holderType', e.target.value)}
                                                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 font-semibold text-gray-900 dark:text-white"
                                            />
                                        </td>
                                        <td className="p-2 text-center">
                                            <label className="inline-flex items-center cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={t.isShrink}
                                                    onChange={(e) => updateToolRow(t.id, 'isShrink', e.target.checked)}
                                                    className="w-4 h-4 text-purple-600 rounded border-gray-300 focus:ring-purple-500"
                                                />
                                                <span className="ml-1 text-xs font-bold text-purple-700 dark:text-purple-300">{t.isShrink ? 'Evet' : 'Hayır'}</span>
                                            </label>
                                        </td>
                                        <td className="p-2">
                                            <input
                                                type="text"
                                                placeholder="Örn: 90"
                                                value={t.length}
                                                onChange={(e) => updateToolRow(t.id, 'length', e.target.value)}
                                                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 font-semibold text-gray-900 dark:text-white"
                                            />
                                        </td>
                                        <td className="p-2">
                                            <input
                                                type="text"
                                                placeholder={t.isShrink ? "Örn: 45" : "Gerekmez"}
                                                disabled={!t.isShrink}
                                                value={t.shrinkLength}
                                                onChange={(e) => updateToolRow(t.id, 'shrinkLength', e.target.value)}
                                                className={`w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg font-semibold ${t.isShrink ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-not-allowed'}`}
                                            />
                                        </td>
                                        <td className="p-2">
                                            <select
                                                value={t.condition}
                                                onChange={(e) => updateToolRow(t.id, 'condition', e.target.value)}
                                                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 font-semibold text-gray-900 dark:text-white"
                                            >
                                                <option value="ANY">Fark Etmez</option>
                                                <option value="NEW">Sıfır (Yeni)</option>
                                                <option value="SLIGHTLY_USED">Az Kullanılmış</option>
                                            </select>
                                        </td>
                                        <td className="p-2">
                                            <input
                                                type="text"
                                                placeholder="Özel talimat..."
                                                value={t.notes}
                                                onChange={(e) => updateToolRow(t.id, 'notes', e.target.value)}
                                                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 font-medium text-gray-900 dark:text-white"
                                            />
                                        </td>
                                        <td className="p-2 text-center">
                                            <button
                                                type="button"
                                                onClick={() => removeToolRow(t.id)}
                                                className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition"
                                                title="Satırı Sil"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* 4. Kısım: Genel Ön Hazırlık Talimatları */}
                <div>
                    <label className="flex items-center text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
                        <FileText className="w-4 h-4 mr-2 text-blue-500" /> Operatör / Hazırlık Özel Notları & Talimatları
                    </label>
                    <textarea 
                        rows={3}
                        placeholder="Örn: 2. bağlama sıfırlaması sağ köşeden alınacak..."
                        value={instructions}
                        onChange={(e) => setInstructions(e.target.value)}
                        className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-medium text-sm focus:ring-2 focus:ring-blue-500 shadow-sm"
                    />
                </div>

                {/* Butonlar */}
                <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <button 
                        type="button" 
                        onClick={onClose}
                        className="px-5 py-2.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-xl font-bold hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                    >
                        Vazgeç
                    </button>
                    <button 
                        type="button" 
                        onClick={handleSubmit}
                        className="px-6 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl font-black shadow-md hover:shadow-lg transition flex items-center active:scale-95"
                    >
                        <CheckCircle className="w-4 h-4 mr-2" /> Hazırlığı Kaydet & Talepleri İlet
                    </button>
                </div>

            </div>
        </Modal>
    );
};

export default CamPreparationModal;