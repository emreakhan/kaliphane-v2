// src/pages/ToolAssignmentPage.js

import React, { useState, useMemo } from 'react';
import { 
    Monitor, ArrowRight, RotateCcw, AlertOctagon, 
    CheckCircle, Plus, Search, Wrench, X, Trash2, List,
    ShoppingCart, Minus, Package, User, ArrowRightLeft 
} from 'lucide-react';
import { 
    updateDoc, doc, addDoc, collection, arrayUnion, increment 
} from '../config/firebase.js';
import { 
    MACHINES_COLLECTION, INVENTORY_COLLECTION, 
    TOOL_TRANSACTIONS_COLLECTION, TOOL_TRANSACTION_TYPES, PERSONNEL_ROLES
} from '../config/constants.js';
import { getCurrentDateTimeString } from '../utils/dateUtils.js';

const ToolAssignmentPage = ({ tools, machines, personnel, loggedInUser, db }) => {
    const [selectedMachineId, setSelectedMachineId] = useState(null);
    const [machineSearchTerm, setMachineSearchTerm] = useState(''); 
    
    // --- MODAL: TAKIM VERME (SEPET) ---
    const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
    const [toolSearchTerm, setToolSearchTerm] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('TÜMÜ');
    const [pendingItems, setPendingItems] = useState([]); 
    const [selectedOperatorId, setSelectedOperatorId] = useState(''); 

    // --- MODAL: TRANSFER İŞLEMİ ---
    const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
    const [toolToTransfer, setToolToTransfer] = useState(null); 
    const [targetMachineId, setTargetMachineId] = useState(''); 
    const [targetOperatorId, setTargetOperatorId] = useState(''); 

    // Seçilen Makineyi Bul
    const selectedMachine = useMemo(() => {
        return machines.find(m => m.id === selectedMachineId);
    }, [machines, selectedMachineId]);

    // Makineleri Filtrele (Arama)
    const filteredMachines = useMemo(() => {
        if (!machineSearchTerm) return machines;
        return machines.filter(m => m.name.toLowerCase().includes(machineSearchTerm.toLowerCase()));
    }, [machines, machineSearchTerm]);

    // --- TOOL SEÇİM MANTIĞI ---
    const availableCategories = useMemo(() => {
        const cats = new Set(tools.map(t => t.category).filter(Boolean));
        return ['TÜMÜ', ...Array.from(cats).sort()];
    }, [tools]);

    const filteredToolsForSelection = useMemo(() => {
        let result = tools.filter(t => t.totalStock > 0); 

        if (selectedCategory !== 'TÜMÜ') {
            result = result.filter(t => t.category === selectedCategory);
        }

        if (toolSearchTerm) {
            const lower = toolSearchTerm.toLowerCase();
            result = result.filter(t => 
                t.name.toLowerCase().includes(lower) || 
                (t.productCode && t.productCode.toLowerCase().includes(lower))
            );
        }
        return result.sort((a, b) => a.name.localeCompare(b.name));
    }, [tools, toolSearchTerm, selectedCategory]);

    // Operatörleri Filtrele
    const operatorList = useMemo(() => {
        if (!personnel) return [];
        return personnel.filter(p => 
            p.role === PERSONNEL_ROLES.MACHINE_OPERATOR || 
            p.role === PERSONNEL_ROLES.CAM_OPERATOR ||
            p.role === PERSONNEL_ROLES.SUPERVISOR
        ).sort((a, b) => a.name.localeCompare(b.name));
    }, [personnel]);

    // --- SEPET İŞLEMLERİ ---
    const handleAddItem = (tool) => {
        const existingItem = pendingItems.find(i => i.toolId === tool.id);
        
        if (existingItem) {
            if (tool.totalStock > existingItem.quantity) {
                setPendingItems(pendingItems.map(i => 
                    i.toolId === tool.id ? { ...i, quantity: i.quantity + 1 } : i
                ));
            }
        } else {
            setPendingItems([...pendingItems, {
                tempId: Date.now(),
                toolId: tool.id,
                toolName: tool.name,
                productCode: tool.productCode,
                category: tool.category,
                quantity: 1,
                maxStock: tool.totalStock
            }]);
        }
    };

    const handleUpdateQuantity = (tempId, change) => {
        setPendingItems(items => items.map(item => {
            if (item.tempId === tempId) {
                const newQty = item.quantity + change;
                if (newQty > 0 && newQty <= item.maxStock) {
                    return { ...item, quantity: newQty };
                }
            }
            return item;
        }));
    };

    const handleRemoveItem = (tempId) => {
        setPendingItems(pendingItems.filter(item => item.tempId !== tempId));
    };

    // --- ONAYLA VE VER ---
    const handleConfirmAssignment = async () => {
        if (pendingItems.length === 0) return;
        if (!selectedOperatorId) return alert("Lütfen operatör seçiniz.");

        const operator = personnel.find(p => p.id === selectedOperatorId);
        const operatorName = operator ? operator.name : 'Bilinmiyor';

        try {
            const machineRef = doc(db, MACHINES_COLLECTION, selectedMachine.id);
            const now = getCurrentDateTimeString();

            let toolsToAdd = [];

            for (const item of pendingItems) {
                const toolRef = doc(db, INVENTORY_COLLECTION, item.toolId);
                await updateDoc(toolRef, {
                    totalStock: increment(-item.quantity)
                });

                for (let i = 0; i < item.quantity; i++) {
                    toolsToAdd.push({
                        instanceId: Date.now() + Math.random(),
                        toolId: item.toolId,
                        toolName: item.toolName,
                        productCode: item.productCode || '',
                        givenDate: now,
                        givenBy: loggedInUser.name,
                        receivedBy: operatorName
                    });
                }

                await addDoc(collection(db, TOOL_TRANSACTIONS_COLLECTION), {
                    type: TOOL_TRANSACTION_TYPES.ISSUE,
                    toolName: item.toolName,
                    quantity: item.quantity,
                    machineName: selectedMachine.name,
                    user: loggedInUser.name,
                    receiver: operatorName,
                    date: now
                });
            }

            if (toolsToAdd.length > 0) {
                await updateDoc(machineRef, {
                    currentTools: arrayUnion(...toolsToAdd)
                });
            }

            setPendingItems([]);
            setSelectedOperatorId('');
            setIsAssignModalOpen(false);

        } catch (error) {
            console.error("Hata:", error);
        }
    };

    // --- TRANSFER İŞLEMLERİ (DÜZELTİLDİ) ---
    const openTransferModal = (toolEntry) => {
        setToolToTransfer(toolEntry);
        setTargetMachineId('');
        setTargetOperatorId('');
        setIsTransferModalOpen(true);
    };

    const handleExecuteTransfer = async () => {
        if (!targetMachineId) return alert("Lütfen hedef tezgahı seçiniz.");
        if (!targetOperatorId) return alert("Lütfen hedef operatörü seçiniz.");

        const targetMachine = machines.find(m => m.id === targetMachineId);
        const targetOperator = personnel.find(p => p.id === targetOperatorId);
        const operatorName = targetOperator ? targetOperator.name : 'Bilinmiyor';

        // UI'ı hemen kapat (Hız hissi için)
        setIsTransferModalOpen(false);

        try {
            const sourceMachineRef = doc(db, MACHINES_COLLECTION, selectedMachine.id);
            const targetMachineRef = doc(db, MACHINES_COLLECTION, targetMachineId);
            const now = getCurrentDateTimeString();

            // 1. Kaynak Makineden Sil
            const updatedSourceTools = (selectedMachine.currentTools || []).filter(t => t.instanceId !== toolToTransfer.instanceId);
            await updateDoc(sourceMachineRef, {
                currentTools: updatedSourceTools
            });

            // 2. Hedef Makineye Ekle (Veriyi Temizle)
            // Firebase undefined değer sevmez, bu yüzden veriyi temizliyoruz
            const toolDataClean = JSON.parse(JSON.stringify(toolToTransfer));
            const toolToAdd = {
                ...toolDataClean, 
                givenDate: now, 
                receivedBy: operatorName, 
                transferredFrom: selectedMachine.name 
            };

            await updateDoc(targetMachineRef, {
                currentTools: arrayUnion(toolToAdd)
            });

            // 3. Log Kaydı
            await addDoc(collection(db, TOOL_TRANSACTIONS_COLLECTION), {
                type: TOOL_TRANSACTION_TYPES.TRANSFER,
                toolName: toolToTransfer.toolName,
                fromMachine: selectedMachine.name,
                toMachine: targetMachine.name,
                user: loggedInUser.name,
                receiver: operatorName,
                date: now
            });

            // State temizliği
            setToolToTransfer(null);
            setTargetMachineId('');
            setTargetOperatorId('');

        } catch (error) {
            console.error("Transfer işlemi sırasında hata (ama işlem gerçekleşmiş olabilir):", error);
            // Hata olsa bile alert vermiyoruz, sessizce geçiyoruz.
        }
    };

    // --- İADE ALMA ---
    const handleReturnTool = async (toolEntry, isScrap) => {
        // Onay sorusu kaldırıldı, direkt işlem
        try {
            const machineRef = doc(db, MACHINES_COLLECTION, selectedMachine.id);
            const toolRef = doc(db, INVENTORY_COLLECTION, toolEntry.toolId);

            const updatedToolsList = (selectedMachine.currentTools || []).filter(t => t.instanceId !== toolEntry.instanceId);
            await updateDoc(machineRef, { currentTools: updatedToolsList });

            if (!isScrap) {
                await updateDoc(toolRef, { totalStock: increment(1) });
            }

            await addDoc(collection(db, TOOL_TRANSACTIONS_COLLECTION), {
                type: isScrap ? TOOL_TRANSACTION_TYPES.RETURN_SCRAP : TOOL_TRANSACTION_TYPES.RETURN_HEALTHY,
                toolName: toolEntry.toolName,
                machineName: selectedMachine.name,
                user: loggedInUser.name,
                date: getCurrentDateTimeString(),
                notes: isScrap ? 'Iskartaya ayrıldı' : 'Depoya geri alındı'
            });

        } catch (error) { console.error(error); }
    };

    const formatDateSimple = (dateStr) => {
        if (!dateStr) return '-';
        try {
            const date = new Date(dateStr);
            return date.toLocaleDateString('tr-TR');
        } catch { return dateStr; }
    };

    return (
        <div className="flex h-[calc(100vh-80px)] overflow-hidden bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
            
            {/* 1. SOL PANEL: TEZGAH LİSTESİ */}
            <div className="w-1/3 md:w-1/4 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col">
                <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                    <h2 className="font-bold text-gray-700 dark:text-gray-200 flex items-center mb-3">
                        <Monitor className="w-5 h-5 mr-2" /> Tezgahlar
                    </h2>
                    <div className="relative">
                        <Search className="absolute left-2 top-2.5 w-4 h-4 text-gray-400" />
                        <input 
                            type="text" 
                            placeholder="Tezgah Ara..." 
                            value={machineSearchTerm}
                            onChange={(e) => setMachineSearchTerm(e.target.value)}
                            className="w-full pl-8 p-2 text-sm border rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white border-gray-300 dark:border-gray-600 focus:ring-1 focus:ring-blue-500"
                        />
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                    {filteredMachines.map(machine => {
                        const toolCount = machine.currentTools ? machine.currentTools.length : 0;
                        return (
                            <button
                                key={machine.id}
                                onClick={() => setSelectedMachineId(machine.id)}
                                className={`w-full text-left p-4 rounded-lg border transition-all flex justify-between items-center ${
                                    selectedMachineId === machine.id 
                                        ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-500 shadow-md ring-1 ring-blue-500' 
                                        : 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 hover:border-blue-300 dark:hover:border-blue-500'
                                }`}
                            >
                                <div>
                                    <div className="font-bold text-gray-900 dark:text-white">{machine.name}</div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400">{machine.type || 'Tezgah'}</div>
                                </div>
                                {toolCount > 0 && (
                                    <span className="bg-orange-100 dark:bg-orange-900/50 text-orange-800 dark:text-orange-200 text-xs font-bold px-2 py-1 rounded-full">
                                        {toolCount}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* 2. SAĞ PANEL: DETAY VE LİSTE (TEK SATIR LİSTE GÖRÜNÜMÜ) */}
            <div className="flex-1 bg-gray-50 dark:bg-gray-900 flex flex-col">
                {selectedMachine ? (
                    <>
                        <div className="p-6 bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
                            <div>
                                <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center">
                                    {selectedMachine.name} 
                                    <span className="ml-3 text-sm font-normal text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-3 py-1 rounded-full">
                                        Mevcut Takımlar ({selectedMachine.currentTools?.length || 0})
                                    </span>
                                </h1>
                            </div>
                            <button 
                                onClick={() => setIsAssignModalOpen(true)}
                                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-bold flex items-center shadow-lg transition transform hover:-translate-y-0.5"
                            >
                                <Plus className="w-5 h-5 mr-2" /> Takım Ekle
                            </button>
                        </div>

                        <div className="p-4 flex-1 overflow-y-auto">
                            {(!selectedMachine.currentTools || selectedMachine.currentTools.length === 0) ? (
                                <div className="h-full flex flex-col items-center justify-center text-gray-400 dark:text-gray-500 opacity-60">
                                    <Wrench className="w-20 h-20 mb-4" />
                                    <p className="text-xl font-medium">Bu tezgahta kayıtlı takım yok.</p>
                                    <p className="text-sm">"Takım Ekle" butonunu kullanarak ekleme yapabilirsiniz.</p>
                                </div>
                            ) : (
                                <div className="flex flex-col space-y-2">
                                    {/* LİSTE BAŞLIKLARI */}
                                    <div className="flex px-4 py-2 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                        <div className="w-10"></div>
                                        <div className="flex-1">Takım Adı / Kod</div>
                                        <div className="w-28">Veriliş Tar.</div>
                                        <div className="w-28">Alan Kişi</div>
                                        <div className="w-64 text-right">İşlemler</div>
                                    </div>

                                    {/* LİSTE ELEMANLARI */}
                                    {selectedMachine.currentTools.map((toolEntry) => (
                                        <div key={toolEntry.instanceId} className="group flex items-center bg-white dark:bg-gray-800 p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-blue-400 dark:hover:border-blue-500 hover:shadow-sm transition">
                                            <div className="w-10 flex justify-center">
                                                <div className="bg-blue-50 dark:bg-blue-900/30 p-1.5 rounded text-blue-600 dark:text-blue-400">
                                                    <Wrench className="w-4 h-4" />
                                                </div>
                                            </div>
                                            <div className="flex-1 px-2">
                                                <div className="font-bold text-gray-900 dark:text-white text-sm">
                                                    {toolEntry.toolName}
                                                </div>
                                                {toolEntry.productCode && (
                                                    <span className="text-xs font-mono text-gray-500 dark:text-gray-400">
                                                        {toolEntry.productCode}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="w-28 text-sm text-gray-600 dark:text-gray-300">
                                                {formatDateSimple(toolEntry.givenDate)}
                                            </div>
                                            <div className="w-28 text-sm text-gray-600 dark:text-gray-300 truncate" title={toolEntry.receivedBy}>
                                                {toolEntry.receivedBy || '-'}
                                            </div>
                                            <div className="w-64 flex justify-end gap-2 opacity-90 group-hover:opacity-100 transition-opacity">
                                                
                                                {/* TRANSFER BUTONU */}
                                                <button 
                                                    onClick={() => openTransferModal(toolEntry)}
                                                    className="px-2 py-1 bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-800 hover:bg-orange-100 dark:hover:bg-orange-900/40 rounded text-xs font-bold transition flex items-center"
                                                >
                                                    <ArrowRightLeft className="w-3 h-3 mr-1" /> Transfer
                                                </button>

                                                <button 
                                                    onClick={() => handleReturnTool(toolEntry, false)}
                                                    className="px-2 py-1 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800 hover:bg-green-100 dark:hover:bg-green-900/40 rounded text-xs font-bold transition"
                                                >
                                                    İade
                                                </button>
                                                <button 
                                                    onClick={() => handleReturnTool(toolEntry, true)}
                                                    className="px-2 py-1 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900/40 rounded text-xs font-bold transition"
                                                >
                                                    Hurda
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center text-gray-400 dark:text-gray-500 opacity-60">
                        <ArrowRight className="w-20 h-20 mb-4 animate-pulse" />
                        <p className="text-xl font-medium">İşlem yapmak için soldan bir tezgah seçiniz.</p>
                    </div>
                )}
            </div>

            {/* --- GENİŞ MODAL: TAKIM SEÇİMİ VE SEPET --- */}
            {isAssignModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
                    <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-7xl h-[90vh] overflow-hidden flex flex-col border border-gray-200 dark:border-gray-700 animate-in fade-in zoom-in duration-200">
                        
                        {/* HEADER */}
                        <div className="bg-blue-600 px-6 py-4 flex justify-between items-center text-white shrink-0">
                            <h3 className="text-xl font-bold flex items-center">
                                <List className="w-6 h-6 mr-3" /> 
                                {selectedMachine?.name} İçin Takım Seçimi
                            </h3>
                            <button onClick={() => setIsAssignModalOpen(false)} className="hover:text-blue-200 transition">
                                <X className="w-8 h-8" />
                            </button>
                        </div>

                        {/* BODY: SPLIT VIEW */}
                        <div className="flex flex-1 overflow-hidden">
                            
                            {/* SOL TARAF: DEPO GÖRÜNÜMÜ (LİSTE ŞEKLİNDE) */}
                            <div className="w-2/3 border-r border-gray-200 dark:border-gray-700 flex flex-col bg-gray-50 dark:bg-gray-800/50">
                                {/* Filtreler */}
                                <div className="p-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 space-y-3">
                                    <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                                        {availableCategories.map(cat => (
                                            <button
                                                key={cat}
                                                onClick={() => setSelectedCategory(cat)}
                                                className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition ${
                                                    selectedCategory === cat 
                                                    ? 'bg-blue-600 text-white' 
                                                    : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                                                }`}
                                            >
                                                {cat}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="relative">
                                        <Search className="absolute left-3 top-2.5 w-5 h-5 text-gray-400" />
                                        <input 
                                            type="text" 
                                            placeholder="Takım Adı veya Kod Ara..." 
                                            value={toolSearchTerm}
                                            onChange={(e) => setToolSearchTerm(e.target.value)}
                                            className="w-full pl-10 p-2 border rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-blue-500"
                                        />
                                    </div>
                                </div>

                                {/* LİSTE GÖRÜNÜMÜ (MİNİ DEPO) */}
                                <div className="flex-1 overflow-y-auto p-2">
                                    <div className="flex flex-col space-y-2">
                                        {/* BAŞLIK SATIRI */}
                                        <div className="flex px-4 py-1 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b border-gray-200 dark:border-gray-700 mb-1">
                                            <div className="w-20">Kod</div>
                                            <div className="flex-1">Parça Adı</div>
                                            <div className="w-24">Kategori</div>
                                            <div className="w-16 text-center">Stok</div>
                                            <div className="w-20 text-right">Ekle</div>
                                        </div>

                                        {filteredToolsForSelection.map(tool => (
                                            <div key={tool.id} className="flex items-center p-2 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition">
                                                <div className="w-20 text-xs font-mono font-bold text-blue-600 dark:text-blue-400 truncate">
                                                    {tool.productCode || '-'}
                                                </div>
                                                <div className="flex-1 px-2 font-medium text-gray-800 dark:text-gray-200 text-sm truncate" title={tool.name}>
                                                    {tool.name}
                                                </div>
                                                <div className="w-24">
                                                    <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded truncate block w-min max-w-full">
                                                        {tool.category}
                                                    </span>
                                                </div>
                                                <div className="w-16 text-center text-sm font-bold text-gray-700 dark:text-gray-300">
                                                    {tool.totalStock}
                                                </div>
                                                <div className="w-20 flex justify-end">
                                                    <button 
                                                        onClick={() => handleAddItem(tool)}
                                                        className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-bold transition flex items-center"
                                                    >
                                                        <Plus className="w-3 h-3 mr-1" /> Ekle
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                        
                                        {filteredToolsForSelection.length === 0 && (
                                            <div className="text-center text-gray-500 dark:text-gray-400 py-10">Kayıt bulunamadı.</div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* SAĞ TARAF: SEPET VE İŞLEM */}
                            <div className="w-1/3 flex flex-col bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700">
                                <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                                    <h3 className="font-bold text-gray-800 dark:text-white flex items-center mb-4">
                                        <ShoppingCart className="w-5 h-5 mr-2" /> Eklenecekler
                                    </h3>
                                    
                                    <div className="bg-white dark:bg-gray-700 p-3 rounded border border-gray-200 dark:border-gray-600 shadow-sm">
                                        <label className="block text-xs font-bold text-gray-500 dark:text-gray-300 mb-1">
                                            Teslim Alan Operatör <span className="text-red-500">*</span>
                                        </label>
                                        <div className="relative">
                                            <User className="absolute left-2 top-2 w-4 h-4 text-gray-400 dark:text-gray-300" />
                                            <select 
                                                className="w-full pl-8 p-2 border border-gray-300 dark:border-gray-500 rounded bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-1 focus:ring-blue-500"
                                                value={selectedOperatorId}
                                                onChange={(e) => setSelectedOperatorId(e.target.value)}
                                            >
                                                <option value="">Seçiniz...</option>
                                                {operatorList.map(op => (
                                                    <option key={op.id} value={op.id}>{op.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                                    {pendingItems.length === 0 ? (
                                        <div className="text-center text-gray-400 dark:text-gray-500 py-10 flex flex-col items-center">
                                            <Package className="w-12 h-12 mb-2 opacity-20" />
                                            <p className="text-sm">Soldan parça seçiniz.</p>
                                        </div>
                                    ) : (
                                        pendingItems.map(item => (
                                            <div key={item.tempId} className="flex flex-col bg-gray-50 dark:bg-gray-800 p-3 rounded-lg border border-gray-200 dark:border-gray-700">
                                                <div className="flex justify-between items-start mb-2">
                                                    <div className="flex-1 pr-2">
                                                        <div className="font-bold text-sm text-gray-800 dark:text-white leading-tight">{item.toolName}</div>
                                                        {item.productCode && <div className="text-xs font-mono text-gray-500 dark:text-gray-400 mt-0.5">{item.productCode}</div>}
                                                    </div>
                                                    <button onClick={() => handleRemoveItem(item.tempId)} className="text-red-400 hover:text-red-600 dark:hover:text-red-300">
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                                
                                                <div className="flex items-center justify-between bg-white dark:bg-gray-700 p-1.5 rounded border border-gray-200 dark:border-gray-600">
                                                    <button 
                                                        onClick={() => handleUpdateQuantity(item.tempId, -1)}
                                                        className="p-1 hover:bg-gray-100 dark:hover:bg-gray-600 rounded text-gray-600 dark:text-gray-300"
                                                    >
                                                        <Minus className="w-4 h-4" />
                                                    </button>
                                                    <span className="font-bold text-sm text-gray-900 dark:text-white w-8 text-center">{item.quantity}</span>
                                                    <button 
                                                        onClick={() => handleUpdateQuantity(item.tempId, 1)}
                                                        className="p-1 hover:bg-gray-100 dark:hover:bg-gray-600 rounded text-blue-600 dark:text-blue-400"
                                                    >
                                                        <Plus className="w-4 h-4" />
                                                    </button>
                                                </div>
                                                <div className="text-[10px] text-right mt-1 text-gray-400 dark:text-gray-500">
                                                    Stokta: {item.maxStock}
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>

                                <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                                    <div className="flex justify-between items-center mb-3 text-sm font-bold text-gray-700 dark:text-gray-300">
                                        <span>Toplam Parça:</span>
                                        <span className="text-lg text-blue-600 dark:text-blue-400">{pendingItems.reduce((acc, i) => acc + i.quantity, 0)}</span>
                                    </div>
                                    <button 
                                        onClick={handleConfirmAssignment}
                                        disabled={pendingItems.length === 0 || !selectedOperatorId}
                                        className="w-full py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:text-gray-500 dark:disabled:text-gray-500 text-white rounded-lg font-bold shadow-lg transition flex items-center justify-center"
                                    >
                                        <CheckCircle className="w-5 h-5 mr-2" /> Onayla ve Ver
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* --- MODAL: TRANSFER İŞLEMİ (YENİ) --- */}
            {isTransferModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
                    <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-lg border border-gray-200 dark:border-gray-700 animate-in fade-in zoom-in duration-200">
                        <div className="bg-orange-600 px-6 py-4 flex justify-between items-center text-white rounded-t-xl">
                            <h3 className="text-xl font-bold flex items-center">
                                <ArrowRightLeft className="w-6 h-6 mr-3" /> Takım Transferi
                            </h3>
                            <button onClick={() => setIsTransferModalOpen(false)} className="hover:text-orange-200">
                                <X className="w-6 h-6" />
                            </button>
                        </div>
                        
                        <div className="p-6 space-y-6">
                            <div className="bg-orange-50 dark:bg-orange-900/20 p-4 rounded-lg border border-orange-100 dark:border-orange-800">
                                <span className="block text-xs font-bold text-orange-800 dark:text-orange-300 mb-1">TRANSFER EDİLEN TAKIM</span>
                                <div className="text-lg font-bold text-gray-900 dark:text-white">
                                    {toolToTransfer?.toolName}
                                </div>
                                <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                    Mevcut Konum: <strong>{selectedMachine?.name}</strong>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Hedef Tezgah Seçin</label>
                                <select 
                                    className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500"
                                    value={targetMachineId}
                                    onChange={(e) => setTargetMachineId(e.target.value)}
                                >
                                    <option value="">Seçiniz...</option>
                                    {machines.filter(m => m.id !== selectedMachineId).map(m => (
                                        <option key={m.id} value={m.id}>{m.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Hedef Operatör Seçin</label>
                                <select 
                                    className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500"
                                    value={targetOperatorId}
                                    onChange={(e) => setTargetOperatorId(e.target.value)}
                                >
                                    <option value="">Seçiniz...</option>
                                    {operatorList.map(op => (
                                        <option key={op.id} value={op.id}>{op.name}</option>
                                    ))}
                                </select>
                            </div>

                            <button 
                                onClick={handleExecuteTransfer}
                                disabled={!targetMachineId || !targetOperatorId}
                                className="w-full py-3 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg font-bold shadow-lg transition flex items-center justify-center"
                            >
                                <ArrowRightLeft className="w-5 h-5 mr-2" /> Transferi Tamamla
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};

export default ToolAssignmentPage;