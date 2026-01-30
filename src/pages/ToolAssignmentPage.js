// src/pages/ToolAssignmentPage.js

import React, { useState, useMemo } from 'react';
import { 
    Monitor, ArrowRight, RotateCcw, AlertOctagon, 
    CheckCircle, Plus, Search, Wrench, X, Trash2, List,
    ShoppingCart, Minus, Package, User, ArrowRightLeft, Users, Briefcase, AlertTriangle, Recycle
} from 'lucide-react';
import { 
    updateDoc, doc, addDoc, collection, arrayUnion, increment 
} from '../config/firebase.js';
import { 
    MACHINES_COLLECTION, INVENTORY_COLLECTION, PERSONNEL_COLLECTION,
    TOOL_TRANSACTIONS_COLLECTION, TOOL_TRANSACTION_TYPES, PERSONNEL_ROLES
} from '../config/constants.js';
import { getCurrentDateTimeString } from '../utils/dateUtils.js';

const ToolAssignmentPage = ({ tools, machines, personnel, loggedInUser, db }) => {
    // --- GÖRÜNÜM MODU: 'MACHINES' veya 'PERSONNEL' ---
    const [viewMode, setViewMode] = useState('MACHINES'); 

    const [selectedOwnerId, setSelectedOwnerId] = useState(null); // Seçilen Tezgah veya Personel ID
    const [searchTerm, setSearchTerm] = useState(''); // Tekil arama terimi
    
    // --- MODAL: TAKIM VERME (SEPET) ---
    const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
    const [toolSearchTerm, setToolSearchTerm] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('TÜMÜ');
    const [pendingItems, setPendingItems] = useState([]); 
    const [selectedOperatorId, setSelectedOperatorId] = useState(''); // Teslim Alan (İmza Atan)

    // --- MODAL: TRANSFER İŞLEMİ ---
    const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
    const [toolToTransfer, setToolToTransfer] = useState(null); 
    const [targetType, setTargetType] = useState('MACHINE'); // 'MACHINE' veya 'PERSONNEL'
    const [targetId, setTargetId] = useState(''); // Hedef ID
    const [targetReceiverId, setTargetReceiverId] = useState(''); // Hedefteki Sorumlu (Personelse kendisi)

    // --- MODAL: HURDA SEBEBİ SEÇİMİ (YENİ) ---
    const [scrapReasonModal, setScrapReasonModal] = useState({ isOpen: false, toolEntry: null });

    // --- 1. SEÇİLEN VARLIĞI BUL (TEZGAH VEYA PERSONEL) ---
    const selectedOwner = useMemo(() => {
        if (viewMode === 'MACHINES') {
            return machines.find(m => m.id === selectedOwnerId);
        } else {
            return personnel.find(p => p.id === selectedOwnerId);
        }
    }, [machines, personnel, selectedOwnerId, viewMode]);

    // --- 2. LİSTELERİ FİLTRELE ---
    
    // Tezgah Listesi
    const filteredMachines = useMemo(() => {
        if (viewMode !== 'MACHINES') return [];
        if (!searchTerm) return machines;
        return machines.filter(m => m.name.toLowerCase().includes(searchTerm.toLowerCase()));
    }, [machines, searchTerm, viewMode]);

    // Personel Listesi
    const filteredPersonnelList = useMemo(() => {
        if (viewMode !== 'PERSONNEL') return [];
        let list = [...personnel]; 
        if (searchTerm) {
            list = list.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()));
        }
        return list.sort((a, b) => a.name.localeCompare(b.name));
    }, [personnel, searchTerm, viewMode]);

    // Operatör Listesi
    const allOperators = useMemo(() => {
        if (!personnel) return [];
        return [...personnel].sort((a, b) => a.name.localeCompare(b.name));
    }, [personnel]);

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

    // --- ONAYLA VE VER (ORTAK FONKSİYON) ---
    const handleConfirmAssignment = async () => {
        if (pendingItems.length === 0) return;
        
        let finalOperatorId = selectedOperatorId;
        
        if (viewMode === 'PERSONNEL' && !finalOperatorId) {
            finalOperatorId = selectedOwnerId;
        }

        if (!finalOperatorId) return alert("Lütfen teslim alan kişiyi seçiniz.");

        const operator = personnel.find(p => p.id === finalOperatorId);
        const operatorName = operator ? operator.name : 'Bilinmiyor';

        try {
            const targetCollectionRef = viewMode === 'MACHINES' 
                ? doc(db, MACHINES_COLLECTION, selectedOwnerId)
                : doc(db, PERSONNEL_COLLECTION, selectedOwnerId);

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
                    machineName: viewMode === 'MACHINES' ? selectedOwner.name : 'ŞAHSİ ZİMMET',
                    user: loggedInUser.name,
                    receiver: operatorName, 
                    targetType: viewMode, 
                    date: now
                });
            }

            if (toolsToAdd.length > 0) {
                await updateDoc(targetCollectionRef, {
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

    // --- TRANSFER İŞLEMLERİ ---
    const openTransferModal = (toolEntry) => {
        setToolToTransfer(toolEntry);
        setTargetType('MACHINE');
        setTargetId('');
        setTargetReceiverId('');
        setIsTransferModalOpen(true);
    };

    const handleExecuteTransfer = async () => {
        if (!targetId) return alert("Lütfen hedefi seçiniz.");
        
        let finalReceiverId = targetReceiverId;
        if(targetType === 'PERSONNEL') {
            finalReceiverId = targetId; 
        }
        
        if (!finalReceiverId) return alert("Lütfen hedefteki sorumlu kişiyi seçiniz.");

        const targetReceiver = personnel.find(p => p.id === finalReceiverId);
        const receiverName = targetReceiver ? targetReceiver.name : 'Bilinmiyor';
        
        let targetName = '';
        if (targetType === 'MACHINE') {
            targetName = machines.find(m => m.id === targetId)?.name;
        } else {
            targetName = personnel.find(p => p.id === targetId)?.name;
        }

        try {
            const sourceCollectionRef = viewMode === 'MACHINES' 
                ? doc(db, MACHINES_COLLECTION, selectedOwnerId)
                : doc(db, PERSONNEL_COLLECTION, selectedOwnerId);

            const targetCollectionRef = targetType === 'MACHINE'
                ? doc(db, MACHINES_COLLECTION, targetId)
                : doc(db, PERSONNEL_COLLECTION, targetId);

            const now = getCurrentDateTimeString();

            const updatedSourceTools = (selectedOwner.currentTools || []).filter(t => t.instanceId !== toolToTransfer.instanceId);
            await updateDoc(sourceCollectionRef, {
                currentTools: updatedSourceTools
            });

            const toolDataClean = JSON.parse(JSON.stringify(toolToTransfer));
            const toolToAdd = {
                ...toolDataClean, 
                givenDate: now, 
                receivedBy: receiverName, 
                transferredFrom: selectedOwner.name 
            };

            await updateDoc(targetCollectionRef, {
                currentTools: arrayUnion(toolToAdd)
            });

            await addDoc(collection(db, TOOL_TRANSACTIONS_COLLECTION), {
                type: TOOL_TRANSACTION_TYPES.TRANSFER,
                toolName: toolToTransfer.toolName,
                fromMachine: selectedOwner.name,
                toMachine: targetName,
                user: loggedInUser.name,
                receiver: receiverName,
                date: now
            });

            setIsTransferModalOpen(false);
            setToolToTransfer(null);
            setTargetId('');
            setTargetReceiverId('');

        } catch (error) {
            console.error("Transfer hatası:", error);
        }
    };

    // --- İADE VE HURDA İŞLEMLERİ ---
    
    // 1. Butona Tıklanınca Çalışan Fonksiyon
    const handleReturnToolClick = (toolEntry, isScrap) => {
        if (!isScrap) {
            // İade ise direkt işlem yap
            processReturn(toolEntry, TOOL_TRANSACTION_TYPES.RETURN_HEALTHY, 'Depoya geri alındı', false);
        } else {
            // Hurda ise Modal Aç
            setScrapReasonModal({ isOpen: true, toolEntry: toolEntry });
        }
    };

    // 2. Hurda Modalı Onaylanınca (Sebebe Göre)
    const handleConfirmScrap = (reasonType) => {
        const toolEntry = scrapReasonModal.toolEntry;
        if (!toolEntry) return;

        let transactionType = TOOL_TRANSACTION_TYPES.RETURN_SCRAP; // Fallback
        let note = '';

        if (reasonType === 'WEAR') {
            transactionType = TOOL_TRANSACTION_TYPES.RETURN_SCRAP_WEAR;
            note = 'Ömür bitti / Doğal aşınma';
        } else if (reasonType === 'DAMAGE') {
            transactionType = TOOL_TRANSACTION_TYPES.RETURN_SCRAP_DAMAGE;
            note = 'Kırılma / Hasar / Hata';
        }

        processReturn(toolEntry, transactionType, note, true);
        setScrapReasonModal({ isOpen: false, toolEntry: null });
    };

    // 3. Asıl Veritabanı İşlemini Yapan Fonksiyon
    const processReturn = async (toolEntry, transactionType, note, isScrap) => {
        try {
            const ownerRef = viewMode === 'MACHINES' 
                ? doc(db, MACHINES_COLLECTION, selectedOwnerId)
                : doc(db, PERSONNEL_COLLECTION, selectedOwnerId);

            const toolRef = doc(db, INVENTORY_COLLECTION, toolEntry.toolId);

            // Kişiden/Tezgahtan Sil
            const updatedToolsList = (selectedOwner.currentTools || []).filter(t => t.instanceId !== toolEntry.instanceId);
            await updateDoc(ownerRef, { currentTools: updatedToolsList });

            // Eğer Sağlam İade ise Stok Artır
            if (!isScrap) {
                await updateDoc(toolRef, { totalStock: increment(1) });
            }

            // Log Kaydı
            await addDoc(collection(db, TOOL_TRANSACTIONS_COLLECTION), {
                type: transactionType,
                toolName: toolEntry.toolName,
                machineName: selectedOwner.name,
                user: loggedInUser.name,
                date: getCurrentDateTimeString(),
                notes: note
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

    // --- RENDER ---
    return (
        <div className="flex h-[calc(100vh-80px)] overflow-hidden bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
            
            {/* 1. SOL PANEL: LİSTE VE ARAMA */}
            <div className="w-1/3 md:w-1/4 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col">
                <div className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                    <div className="flex">
                        <button 
                            onClick={() => { setViewMode('MACHINES'); setSelectedOwnerId(null); }}
                            className={`flex-1 py-3 text-sm font-bold text-center transition ${
                                viewMode === 'MACHINES' 
                                ? 'bg-white dark:bg-gray-800 text-blue-600 border-b-2 border-blue-600' 
                                : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'
                            }`}
                        >
                            <Monitor className="w-4 h-4 inline-block mr-1 mb-0.5" /> Tezgahlar
                        </button>
                        <button 
                            onClick={() => { setViewMode('PERSONNEL'); setSelectedOwnerId(null); }}
                            className={`flex-1 py-3 text-sm font-bold text-center transition ${
                                viewMode === 'PERSONNEL' 
                                ? 'bg-white dark:bg-gray-800 text-purple-600 border-b-2 border-purple-600' 
                                : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'
                            }`}
                        >
                            <Users className="w-4 h-4 inline-block mr-1 mb-0.5" /> Personel
                        </button>
                    </div>
                    
                    <div className="p-3 relative">
                        <Search className="absolute left-5 top-5.5 w-4 h-4 text-gray-400" />
                        <input 
                            type="text" 
                            placeholder={viewMode === 'MACHINES' ? "Tezgah Ara..." : "Personel Ara..."}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-8 p-2 text-sm border rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white border-gray-300 dark:border-gray-600 focus:ring-1 focus:ring-blue-500"
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                    {viewMode === 'MACHINES' ? (
                        filteredMachines.map(machine => {
                            const toolCount = machine.currentTools ? machine.currentTools.length : 0;
                            return (
                                <button
                                    key={machine.id}
                                    onClick={() => setSelectedOwnerId(machine.id)}
                                    className={`w-full text-left p-3 rounded-lg border transition-all flex justify-between items-center ${
                                        selectedOwnerId === machine.id 
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
                        })
                    ) : (
                        filteredPersonnelList.map(person => {
                            const toolCount = person.currentTools ? person.currentTools.length : 0;
                            return (
                                <button
                                    key={person.id}
                                    onClick={() => setSelectedOwnerId(person.id)}
                                    className={`w-full text-left p-3 rounded-lg border transition-all flex justify-between items-center ${
                                        selectedOwnerId === person.id 
                                            ? 'bg-purple-50 dark:bg-purple-900/30 border-purple-500 shadow-md ring-1 ring-purple-500' 
                                            : 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 hover:border-purple-300 dark:hover:border-purple-500'
                                    }`}
                                >
                                    <div>
                                        <div className="font-bold text-gray-900 dark:text-white">{person.name}</div>
                                        <div className="text-xs text-gray-500 dark:text-gray-400">{person.role}</div>
                                    </div>
                                    {toolCount > 0 && (
                                        <span className="bg-purple-100 dark:bg-purple-900/50 text-purple-800 dark:text-purple-200 text-xs font-bold px-2 py-1 rounded-full">
                                            {toolCount}
                                        </span>
                                    )}
                                </button>
                            );
                        })
                    )}
                </div>
            </div>

            {/* 2. SAĞ PANEL: DETAY VE İŞLEM */}
            <div className="flex-1 bg-gray-50 dark:bg-gray-900 flex flex-col">
                {selectedOwner ? (
                    <>
                        <div className="p-6 bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
                            <div>
                                <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center">
                                    {viewMode === 'MACHINES' ? <Monitor className="w-6 h-6 mr-2"/> : <User className="w-6 h-6 mr-2"/>}
                                    {selectedOwner.name} 
                                    <span className={`ml-3 text-sm font-normal text-white px-3 py-1 rounded-full ${viewMode === 'MACHINES' ? 'bg-blue-500' : 'bg-purple-500'}`}>
                                        {viewMode === 'MACHINES' ? 'Tezgah Zimmeti' : 'Şahsi Zimmet'}
                                    </span>
                                </h1>
                            </div>
                            <button 
                                onClick={() => setIsAssignModalOpen(true)}
                                className={`px-6 py-2 text-white rounded-lg font-bold flex items-center shadow-lg transition transform hover:-translate-y-0.5 ${
                                    viewMode === 'MACHINES' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-purple-600 hover:bg-purple-700'
                                }`}
                            >
                                <Plus className="w-5 h-5 mr-2" /> Takım Ekle
                            </button>
                        </div>

                        <div className="p-4 flex-1 overflow-y-auto">
                            {(!selectedOwner.currentTools || selectedOwner.currentTools.length === 0) ? (
                                <div className="h-full flex flex-col items-center justify-center text-gray-400 dark:text-gray-500 opacity-60">
                                    <Wrench className="w-20 h-20 mb-4" />
                                    <p className="text-xl font-medium">Bu {viewMode === 'MACHINES' ? 'tezgahta' : 'personelde'} kayıtlı takım yok.</p>
                                    <p className="text-sm">"Takım Ekle" butonunu kullanarak ekleme yapabilirsiniz.</p>
                                </div>
                            ) : (
                                <div className="flex flex-col space-y-2">
                                    <div className="flex px-4 py-2 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                        <div className="w-10"></div>
                                        <div className="flex-1">Takım Adı / Kod</div>
                                        <div className="w-28">Veriliş Tar.</div>
                                        <div className="w-28">Alan Kişi</div>
                                        <div className="w-64 text-right">İşlemler</div>
                                    </div>

                                    {selectedOwner.currentTools.map((toolEntry) => (
                                        <div key={toolEntry.instanceId} className="group flex items-center bg-white dark:bg-gray-800 p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:shadow-sm transition">
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
                                                
                                                <button 
                                                    onClick={() => openTransferModal(toolEntry)}
                                                    className="px-2 py-1 bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-800 hover:bg-orange-100 dark:hover:bg-orange-900/40 rounded text-xs font-bold transition flex items-center"
                                                >
                                                    <ArrowRightLeft className="w-3 h-3 mr-1" /> Transfer
                                                </button>

                                                <button 
                                                    onClick={() => handleReturnToolClick(toolEntry, false)}
                                                    className="px-2 py-1 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800 hover:bg-green-100 dark:hover:bg-green-900/40 rounded text-xs font-bold transition"
                                                >
                                                    İade
                                                </button>
                                                <button 
                                                    onClick={() => handleReturnToolClick(toolEntry, true)}
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
                        {viewMode === 'MACHINES' ? <ArrowRight className="w-20 h-20 mb-4 animate-pulse" /> : <User className="w-20 h-20 mb-4 animate-pulse" />}
                        <p className="text-xl font-medium">İşlem yapmak için soldan bir {viewMode === 'MACHINES' ? 'tezgah' : 'personel'} seçiniz.</p>
                    </div>
                )}
            </div>

            {/* --- MODAL: TAKIM SEÇİMİ VE SEPET --- */}
            {isAssignModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
                    <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-7xl h-[90vh] overflow-hidden flex flex-col border border-gray-200 dark:border-gray-700 animate-in fade-in zoom-in duration-200">
                        
                        <div className={`px-6 py-4 flex justify-between items-center text-white shrink-0 ${viewMode === 'MACHINES' ? 'bg-blue-600' : 'bg-purple-600'}`}>
                            <h3 className="text-xl font-bold flex items-center">
                                <List className="w-6 h-6 mr-3" /> 
                                {selectedOwner?.name} İçin Takım Seçimi ({viewMode === 'MACHINES' ? 'Tezgah' : 'Şahsi'})
                            </h3>
                            <button onClick={() => setIsAssignModalOpen(false)} className="hover:text-blue-200 transition">
                                <X className="w-8 h-8" />
                            </button>
                        </div>

                        <div className="flex flex-1 overflow-hidden">
                            {/* SOL TARAF: DEPO GÖRÜNÜMÜ */}
                            <div className="w-2/3 border-r border-gray-200 dark:border-gray-700 flex flex-col bg-gray-50 dark:bg-gray-800/50">
                                <div className="p-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 space-y-3">
                                    <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                                        {availableCategories.map(cat => (
                                            <button
                                                key={cat}
                                                onClick={() => setSelectedCategory(cat)}
                                                className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition ${
                                                    selectedCategory === cat 
                                                    ? (viewMode === 'MACHINES' ? 'bg-blue-600 text-white' : 'bg-purple-600 text-white') 
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

                                <div className="flex-1 overflow-y-auto p-2">
                                    <div className="flex flex-col space-y-2">
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
                                                        className={`px-3 py-1 text-white rounded text-xs font-bold transition flex items-center ${viewMode === 'MACHINES' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-purple-600 hover:bg-purple-700'}`}
                                                    >
                                                        <Plus className="w-3 h-3 mr-1" /> Ekle
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* SAĞ TARAF: SEPET */}
                            <div className="w-1/3 flex flex-col bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700">
                                <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                                    <h3 className="font-bold text-gray-800 dark:text-white flex items-center mb-4">
                                        <ShoppingCart className="w-5 h-5 mr-2" /> Eklenecekler
                                    </h3>
                                    
                                    <div className="bg-white dark:bg-gray-700 p-3 rounded border border-gray-200 dark:border-gray-600 shadow-sm">
                                        <label className="block text-xs font-bold text-gray-500 dark:text-gray-300 mb-1">
                                            {viewMode === 'MACHINES' ? 'Teslim Alan Operatör *' : 'Teslim Alan (Opsiyonel)'}
                                        </label>
                                        <div className="relative">
                                            <User className="absolute left-2 top-2 w-4 h-4 text-gray-400 dark:text-gray-300" />
                                            <select 
                                                className="w-full pl-8 p-2 border border-gray-300 dark:border-gray-500 rounded bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-1 focus:ring-blue-500"
                                                value={selectedOperatorId}
                                                onChange={(e) => setSelectedOperatorId(e.target.value)}
                                            >
                                                <option value="">{viewMode === 'PERSONNEL' ? `${selectedOwner.name} (Kendisi)` : 'Seçiniz...'}</option>
                                                {allOperators.map(op => (
                                                    <option key={op.id} value={op.id}>{op.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                                    {pendingItems.map(item => (
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
                                                <button onClick={() => handleUpdateQuantity(item.tempId, -1)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-600 rounded text-gray-600 dark:text-gray-300"><Minus className="w-4 h-4" /></button>
                                                <span className="font-bold text-sm text-gray-900 dark:text-white w-8 text-center">{item.quantity}</span>
                                                <button onClick={() => handleUpdateQuantity(item.tempId, 1)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-600 rounded text-blue-600 dark:text-blue-400"><Plus className="w-4 h-4" /></button>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                                    <button 
                                        onClick={handleConfirmAssignment}
                                        disabled={pendingItems.length === 0 || (viewMode === 'MACHINES' && !selectedOperatorId)}
                                        className={`w-full py-3 text-white rounded-lg font-bold shadow-lg transition flex items-center justify-center ${
                                            viewMode === 'MACHINES' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-purple-600 hover:bg-purple-700'
                                        } disabled:bg-gray-400`}
                                    >
                                        <CheckCircle className="w-5 h-5 mr-2" /> Onayla ve Ver
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* --- MODAL: TRANSFER --- */}
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
                                <span className="block text-xs font-bold text-orange-800 dark:text-orange-300 mb-1">TRANSFER EDİLEN</span>
                                <div className="text-lg font-bold text-gray-900 dark:text-white">{toolToTransfer?.toolName}</div>
                                <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">Kaynak: <strong>{selectedOwner?.name}</strong></div>
                            </div>

                            {/* HEDEF TİPİ SEÇİMİ */}
                            <div className="flex gap-2">
                                <button 
                                    onClick={() => { setTargetType('MACHINE'); setTargetId(''); }}
                                    className={`flex-1 py-2 text-sm font-bold rounded border ${targetType === 'MACHINE' ? 'bg-orange-100 border-orange-500 text-orange-800' : 'bg-white border-gray-300 text-gray-600'}`}
                                >
                                    <Monitor className="w-4 h-4 inline mr-1"/> Tezgaha
                                </button>
                                <button 
                                    onClick={() => { setTargetType('PERSONNEL'); setTargetId(''); }}
                                    className={`flex-1 py-2 text-sm font-bold rounded border ${targetType === 'PERSONNEL' ? 'bg-orange-100 border-orange-500 text-orange-800' : 'bg-white border-gray-300 text-gray-600'}`}
                                >
                                    <Users className="w-4 h-4 inline mr-1"/> Personele
                                </button>
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Hedef {targetType === 'MACHINE' ? 'Tezgah' : 'Personel'}</label>
                                <select 
                                    className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    value={targetId}
                                    onChange={(e) => setTargetId(e.target.value)}
                                >
                                    <option value="">Seçiniz...</option>
                                    {targetType === 'MACHINE' 
                                        ? machines.filter(m => m.id !== selectedOwnerId).map(m => <option key={m.id} value={m.id}>{m.name}</option>)
                                        : allOperators.filter(p => p.id !== selectedOwnerId).map(p => <option key={p.id} value={p.id}>{p.name}</option>)
                                    }
                                </select>
                            </div>

                            {/* Eğer hedef makine ise operatör sor, personel ise sorma (kendisi alır) */}
                            {targetType === 'MACHINE' && (
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Teslim Alan Operatör</label>
                                    <select 
                                        className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                        value={targetReceiverId}
                                        onChange={(e) => setTargetReceiverId(e.target.value)}
                                    >
                                        <option value="">Seçiniz...</option>
                                        {allOperators.map(op => <option key={op.id} value={op.id}>{op.name}</option>)}
                                    </select>
                                </div>
                            )}

                            <button 
                                onClick={handleExecuteTransfer}
                                disabled={!targetId || (targetType === 'MACHINE' && !targetReceiverId)}
                                className="w-full py-3 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg font-bold shadow-lg transition flex items-center justify-center"
                            >
                                <ArrowRightLeft className="w-5 h-5 mr-2" /> Transferi Tamamla
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* --- MODAL: HURDA SEBEBİ SEÇİMİ (YENİ) --- */}
            {scrapReasonModal.isOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[60] p-4 backdrop-blur-sm animate-in fade-in zoom-in duration-200">
                    <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-md border border-red-200 dark:border-red-900 overflow-hidden">
                        <div className="bg-red-50 dark:bg-red-900/30 p-4 border-b border-red-100 dark:border-red-800 text-center">
                            <div className="mx-auto w-12 h-12 bg-red-100 dark:bg-red-900/50 rounded-full flex items-center justify-center mb-2">
                                <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-400" />
                            </div>
                            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Hurda Sebebi Seçiniz</h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                "{scrapReasonModal.toolEntry?.toolName}" neden hurdaya ayrılıyor?
                            </p>
                        </div>
                        
                        <div className="p-6 space-y-3">
                            <button 
                                onClick={() => handleConfirmScrap('WEAR')}
                                className="w-full p-4 rounded-xl border-2 border-blue-100 dark:border-blue-900 hover:border-blue-500 dark:hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition group text-left flex items-center"
                            >
                                <div className="bg-blue-100 dark:bg-blue-900/50 p-2 rounded-full mr-4 group-hover:bg-blue-200 dark:group-hover:bg-blue-800 transition">
                                    <Recycle className="w-6 h-6 text-blue-600 dark:text-blue-300" />
                                </div>
                                <div>
                                    <div className="font-bold text-gray-900 dark:text-white">Doğal Aşınma / Ömür Bitti</div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400">Normal kullanım sonucu köreldi.</div>
                                </div>
                            </button>

                            <button 
                                onClick={() => handleConfirmScrap('DAMAGE')}
                                className="w-full p-4 rounded-xl border-2 border-red-100 dark:border-red-900 hover:border-red-500 dark:hover:border-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition group text-left flex items-center"
                            >
                                <div className="bg-red-100 dark:bg-red-900/50 p-2 rounded-full mr-4 group-hover:bg-red-200 dark:group-hover:bg-red-800 transition">
                                    <AlertOctagon className="w-6 h-6 text-red-600 dark:text-red-300" />
                                </div>
                                <div>
                                    <div className="font-bold text-gray-900 dark:text-white">Kırılma / Hasar / Hata</div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400">Operatör hatası, kaza veya kırılma.</div>
                                </div>
                            </button>
                        </div>

                        <div className="p-4 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 flex justify-center">
                            <button 
                                onClick={() => setScrapReasonModal({ isOpen: false, toolEntry: null })}
                                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 font-medium text-sm"
                            >
                                İptal
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};

export default ToolAssignmentPage;