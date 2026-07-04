// src/pages/ToolAssignmentPage.js

import React, { useState, useMemo, useEffect } from 'react';
import { 
    Monitor, ArrowRight, CheckCircle, Plus, Search, Wrench, X, Trash2, List,
    ShoppingCart, Minus, User, ArrowRightLeft, Users, AlertTriangle, Recycle, AlertOctagon, Package, RefreshCw, Layers, CheckSquare, Edit,
    ChevronLeft, Star
} from 'lucide-react';
import { 
    updateDoc, doc, addDoc, collection, arrayUnion, increment 
} from '../config/firebase.js';
import { 
    MACHINES_COLLECTION, INVENTORY_COLLECTION, PERSONNEL_COLLECTION,
    TOOL_TRANSACTIONS_COLLECTION, TOOL_TRANSACTION_TYPES, MOLD_MATERIAL_HANDOUTS_COLLECTION,
    OPERATION_STATUS
} from '../config/constants.js';
import { getCurrentDateTimeString } from '../utils/dateUtils.js';

const ASSIGN_COLOR_PALETTES = [
    'from-indigo-600 to-blue-750 hover:from-indigo-700 hover:to-blue-800',
    'from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800',
    'from-rose-600 to-pink-700 hover:from-rose-700 hover:to-pink-800',
    'from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700',
    'from-purple-600 to-violet-750 hover:from-purple-700 hover:to-violet-850',
    'from-cyan-600 to-teal-650 hover:from-cyan-700 hover:to-teal-700'
];

const ToolAssignmentPage = ({ tools, machines, personnel, loggedInUser, db, projects = [] }) => {
    const isOperator = loggedInUser?.role === 'Tezgah Operatörü';

    // --- HIZLI TAKIM EKLEME PİNLERİ (localStorage) ---
    const [pinnedQuickAssignTools, setPinnedQuickAssignTools] = useState(() => {
        const saved = localStorage.getItem('pinned_quick_assign_tools');
        return saved ? JSON.parse(saved) : [];
    });

    useEffect(() => {
        localStorage.setItem('pinned_quick_assign_tools', JSON.stringify(pinnedQuickAssignTools));
    }, [pinnedQuickAssignTools]);

    // --- GÖRÜNÜM MODU ---
    const [viewMode, setViewMode] = useState('MACHINES'); 
    const [selectedOwnerId, setSelectedOwnerId] = useState(null); 
    const [searchTerm, setSearchTerm] = useState(''); 
    
    // --- MODAL: TAKIM VERME (SEPET) ---
    const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
    const [toolSearchTerm, setToolSearchTerm] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('TÜMÜ');
    const [pendingItems, setPendingItems] = useState([]); 
    
    const [opSearchTerm, setOpSearchTerm] = useState('');
    const [isOpDropdownOpen, setIsOpDropdownOpen] = useState(false);
    const [selectedOperatorId, setSelectedOperatorId] = useState(''); 
    
    const [moldSearchTerm, setMoldSearchTerm] = useState('');
    const [isMoldDropdownOpen, setIsMoldDropdownOpen] = useState(false);
    const [selectedMoldIdForMaterial, setSelectedMoldIdForMaterial] = useState('');

    const [sourceType, setSourceType] = useState('INVENTORY_NEW'); 

    // --- MODAL: TRANSFER İŞLEMİ ---
    const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
    const [toolToTransfer, setToolToTransfer] = useState(null); 
    const [targetType, setTargetType] = useState('MACHINE'); 
    
    // Transfer Dropdown State'leri
    const [targetId, setTargetId] = useState(''); 
    const [transferTargetSearch, setTransferTargetSearch] = useState('');
    const [isTransferTargetOpen, setIsTransferTargetOpen] = useState(false);
    
    const [targetReceiverId, setTargetReceiverId] = useState(''); 
    const [transferReceiverSearch, setTransferReceiverSearch] = useState('');
    const [isTransferReceiverOpen, setIsTransferReceiverOpen] = useState(false);

    // --- MODAL: HURDA ---
    const [scrapReasonModal, setScrapReasonModal] = useState({ isOpen: false, toolEntry: null, isBatch: false });
    const [scrapDescription, setScrapDescription] = useState(''); 

    // --- TOPLU SEÇİM (BATCH) ---
    const [selectedToolInstanceIds, setSelectedToolInstanceIds] = useState([]);

    // --- TEMEL FİLTRELER VE LİSTELER ---
    const selectedOwner = useMemo(() => {
        if (viewMode === 'MACHINES') return machines.find(m => m.id === selectedOwnerId);
        return personnel.find(p => p.id === selectedOwnerId);
    }, [machines, personnel, selectedOwnerId, viewMode]);

    const filteredMachines = useMemo(() => {
        if (viewMode !== 'MACHINES') return [];
        let list = [...machines];
        if (searchTerm) {
            list = list.filter(m => m.name.toLowerCase().includes(searchTerm.toLowerCase()));
        }
        return list.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
    }, [machines, searchTerm, viewMode]);

    const filteredPersonnelList = useMemo(() => {
        if (viewMode !== 'PERSONNEL') return [];
        let list = [...personnel]; 
        if (searchTerm) list = list.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()));
        return list.sort((a, b) => a.name.localeCompare(b.name));
    }, [personnel, searchTerm, viewMode]);

    const allOperators = useMemo(() => {
        if (!personnel) return [];
        return [...personnel].sort((a, b) => a.name.localeCompare(b.name));
    }, [personnel]);

    const availableCategories = useMemo(() => {
        const cats = new Set(tools.map(t => t.category).filter(Boolean));
        return ['TÜMÜ', ...Array.from(cats).sort()];
    }, [tools]);

    const selectedMoldForMaterial = useMemo(() => projects.find(p => p.id === selectedMoldIdForMaterial), [projects, selectedMoldIdForMaterial]);

    const filteredMoldMaterials = useMemo(() => {
        if (!selectedMoldForMaterial || !selectedMoldForMaterial.materials) return [];
        let mats = selectedMoldForMaterial.materials;
        if (toolSearchTerm) {
            const lower = toolSearchTerm.toLowerCase();
            mats = mats.filter(m => m.name.toLowerCase().includes(lower) || (m.erpCode && m.erpCode.toLowerCase().includes(lower)));
        }
        return mats;
    }, [selectedMoldForMaterial, toolSearchTerm]);

    const filteredToolsForSelection = useMemo(() => {
        let result = tools.filter(t => t.totalStock > 0); 
        if (sourceType === 'INVENTORY_NEW') result = result.filter(t => !t.condition || t.condition === 'NEW');
        else if (sourceType === 'INVENTORY_USED') result = result.filter(t => t.condition === 'USED');
        
        // Sadece arama yapılmadığında kategori filtresini uygula
        if (!toolSearchTerm && selectedCategory !== 'TÜMÜ') {
            result = result.filter(t => t.category === selectedCategory);
        }
        
        if (toolSearchTerm) {
            const lower = toolSearchTerm.toLowerCase();
            result = result.filter(t => 
                t.name.toLowerCase().includes(lower) || 
                (t.productCode && t.productCode.toLowerCase().includes(lower)) ||
                (t.category && t.category.toLowerCase().includes(lower))
            );
        }
        return result.sort((a, b) => a.name.localeCompare(b.name));
    }, [tools, toolSearchTerm, selectedCategory, sourceType]);

    const filteredPinnedTools = useMemo(() => {
        if (!toolSearchTerm) return pinnedQuickAssignTools;
        const lower = toolSearchTerm.toLowerCase();
        return pinnedQuickAssignTools.filter(t => 
            t.name.toLowerCase().includes(lower) || 
            (t.productCode && t.productCode.toLowerCase().includes(lower))
        );
    }, [pinnedQuickAssignTools, toolSearchTerm]);


    // --- TOPLU SEÇİM İŞLEMLERİ ---
    const toggleToolSelection = (instanceId) => {
        setSelectedToolInstanceIds(prev => prev.includes(instanceId) ? prev.filter(id => id !== instanceId) : [...prev, instanceId]);
    };

    const toggleSelectAll = () => {
        if (!selectedOwner || !selectedOwner.currentTools) return;
        if (selectedToolInstanceIds.length === selectedOwner.currentTools.length) setSelectedToolInstanceIds([]);
        else setSelectedToolInstanceIds(selectedOwner.currentTools.map(t => t.instanceId));
    };

    // Sahip değiştiğinde seçili takımları temizle
    useEffect(() => { setSelectedToolInstanceIds([]); }, [selectedOwnerId]);


    // --- SEPET İŞLEMLERİ ---
    const handleAddItem = (tool) => {
        const existingItem = pendingItems.find(i => i.toolId === tool.id);
        if (existingItem) {
            if (tool.totalStock > existingItem.quantity) {
                setPendingItems(pendingItems.map(i => i.toolId === tool.id ? { ...i, quantity: i.quantity + 1 } : i));
            }
        } else {
            setPendingItems([...pendingItems, { tempId: Date.now(), toolId: tool.id, toolName: tool.name, productCode: tool.productCode, category: tool.category, condition: tool.condition || 'NEW', quantity: 1, maxStock: tool.totalStock }]);
        }
    };

    const handleAddMaterialItem = (mat) => {
        const existingItem = pendingItems.find(i => i.toolId === mat.id);
        if (existingItem) {
            if (mat.quantity > existingItem.quantity) {
                setPendingItems(pendingItems.map(i => i.toolId === mat.id ? { ...i, quantity: i.quantity + 1 } : i));
            }
        } else {
            setPendingItems([...pendingItems, { tempId: Date.now(), toolId: mat.id, toolName: `${selectedMoldForMaterial.moldName} - ${mat.name}`, productCode: mat.erpCode || '', category: 'KALIP MALZEMESİ', condition: 'NEW', quantity: 1, maxStock: mat.quantity, isMoldMaterial: true }]);
            setToolSearchTerm('');
        }
    };

    const handleUpdateQuantity = (tempId, change) => {
        setPendingItems(items => items.map(item => {
            if (item.tempId === tempId) {
                const newQty = item.quantity + change;
                if (newQty > 0 && newQty <= item.maxStock) return { ...item, quantity: newQty };
            }
            return item;
        }));
    };

    const handleRemoveItem = (tempId) => setPendingItems(pendingItems.filter(item => item.tempId !== tempId));

    const handleConfirmAssignment = async () => {
        if (pendingItems.length === 0) return;
        let finalOperatorId = selectedOperatorId;
        if (viewMode === 'PERSONNEL' && !finalOperatorId) finalOperatorId = selectedOwnerId;
        if (!finalOperatorId) return alert("Lütfen teslim alan kişiyi seçiniz.");
        const operator = personnel.find(p => p.id === finalOperatorId);
        const operatorName = operator ? operator.name : 'Bilinmiyor';

        // OTM: Seçili tezgaha ait aktif işi/kalıbı bul
        let assignedMoldId = '';
        let assignedMoldName = '';
        let assignedMoldPart = '';

        if (viewMode === 'MACHINES' && selectedOwner) {
            const tasksForThisMachine = [];
            projects.forEach(mold => {
                if (mold.tasks) {
                    mold.tasks.forEach(task => {
                        if (task.operations) {
                            task.operations.forEach(op => {
                                if ((op.status === OPERATION_STATUS.IN_PROGRESS || op.status === OPERATION_STATUS.PAUSED || op.status === OPERATION_STATUS.AYAR_YAPILIYOR) && op.machineName === selectedOwner.name) {
                                    tasksForThisMachine.push({
                                        ...op,
                                        moldId: mold.id,
                                        moldName: mold.moldName,
                                        moldCustomer: mold.customer || '',
                                        taskName: task.taskName
                                    });
                                }
                            });
                        }
                    });
                }
            });

            let activeTask = null;
            if (tasksForThisMachine.length > 0) {
                activeTask = tasksForThisMachine.find(op => op.status === OPERATION_STATUS.IN_PROGRESS || op.status === OPERATION_STATUS.AYAR_YAPILIYOR);
                if (!activeTask) {
                    activeTask = tasksForThisMachine.sort((a, b) => {
                        const timeA = new Date(a.lastPausedAt || a.startDate).getTime();
                        const timeB = new Date(b.lastPausedAt || b.startDate).getTime();
                        return timeB - timeA;
                    }).find(op => op.status === OPERATION_STATUS.PAUSED);
                }
            }

            if (activeTask) {
                assignedMoldId = activeTask.moldId || '';
                assignedMoldName = activeTask.moldName ? `${activeTask.moldName} (${activeTask.moldCustomer})` : '';
                assignedMoldPart = activeTask.taskName || '';
            }
        }

        try {
            const targetCollectionRef = viewMode === 'MACHINES' ? doc(db, MACHINES_COLLECTION, selectedOwnerId) : doc(db, PERSONNEL_COLLECTION, selectedOwnerId);
            const now = getCurrentDateTimeString();
            let toolsToAdd = [];

            for (const item of pendingItems) {
                if (!item.isMoldMaterial) {
                    const toolRef = doc(db, INVENTORY_COLLECTION, item.toolId);
                    await updateDoc(toolRef, { totalStock: increment(-item.quantity) });
                    
                    for (let i = 0; i < item.quantity; i++) {
                        toolsToAdd.push({
                            instanceId: Date.now() + Math.random(),
                            toolId: item.toolId,
                            toolName: item.toolName,
                            productCode: item.productCode || '',
                            category: item.category || 'DİĞER',
                            condition: item.condition,
                            givenDate: now,
                            givenBy: loggedInUser.name,
                            receivedBy: operatorName,
                            isMoldMaterial: false,
                            projectId: assignedMoldId,
                            moldName: assignedMoldName,
                            moldPart: assignedMoldPart
                        });
                    }
                } else {
                    // Kalıp malzemesi ise: Alıcının zimmetine (currentTools) EKLEME!
                    // Yeni koleksiyona kaydet.
                    await addDoc(collection(db, MOLD_MATERIAL_HANDOUTS_COLLECTION), {
                        materialId: item.toolId,
                        materialName: item.toolName,
                        productCode: item.productCode || '',
                        quantity: item.quantity,
                        givenDate: now,
                        givenBy: loggedInUser.name,
                        receivedBy: operatorName,
                        targetName: selectedOwner.name,
                        targetType: viewMode,
                        date: now
                    });
                }
                const prefix = item.condition === 'USED' ? '[KULLANILMIŞ] ' : '';
                await addDoc(collection(db, TOOL_TRANSACTIONS_COLLECTION), {
                    type: TOOL_TRANSACTION_TYPES.ISSUE,
                    toolName: prefix + item.toolName,
                    quantity: item.quantity,
                    machineName: viewMode === 'MACHINES' ? selectedOwner.name : 'ŞAHSİ ZİMMET',
                    user: loggedInUser.name,
                    receiver: operatorName, 
                    targetType: viewMode,
                    isMoldMaterial: item.isMoldMaterial || false,
                    date: now,
                    projectId: assignedMoldId,
                    moldName: assignedMoldName,
                    moldPart: assignedMoldPart
                });
            }

            if (toolsToAdd.length > 0) await updateDoc(targetCollectionRef, { currentTools: arrayUnion(...toolsToAdd) });

            setPendingItems([]); 
            setSelectedOperatorId(''); 
            setOpSearchTerm(''); 
            setIsAssignModalOpen(false);
        } catch (error) { console.error("Hata:", error); }
    };

    // --- TRANSFER İŞLEMLERİ ---
    const openTransferModal = (toolEntry) => {
        setToolToTransfer(toolEntry);
        handleTransferTargetTypeChange('MACHINE');
        setIsTransferModalOpen(true);
    };

    const handleTransferTargetTypeChange = (type) => {
        setTargetType(type);
        setTargetId('');
        setTransferTargetSearch('');
        setIsTransferTargetOpen(false);
        setTargetReceiverId('');
        setTransferReceiverSearch('');
        setIsTransferReceiverOpen(false);
    };

    const handleExecuteTransfer = async () => {
        if (!targetId) return alert("Lütfen hedefi seçiniz.");
        let finalReceiverId = targetReceiverId;
        if(targetType === 'PERSONNEL') finalReceiverId = targetId; 
        if (!finalReceiverId) return alert("Lütfen hedefteki sorumlu kişiyi seçiniz.");

        const targetReceiver = personnel.find(p => p.id === finalReceiverId);
        const receiverName = targetReceiver ? targetReceiver.name : 'Bilinmiyor';
        let targetName = targetType === 'MACHINE' ? machines.find(m => m.id === targetId)?.name : personnel.find(p => p.id === targetId)?.name;

        try {
            const sourceCollectionRef = viewMode === 'MACHINES' ? doc(db, MACHINES_COLLECTION, selectedOwnerId) : doc(db, PERSONNEL_COLLECTION, selectedOwnerId);
            const targetCollectionRef = targetType === 'MACHINE' ? doc(db, MACHINES_COLLECTION, targetId) : doc(db, PERSONNEL_COLLECTION, targetId);
            const now = getCurrentDateTimeString();

            const updatedSourceTools = (selectedOwner.currentTools || []).filter(t => t.instanceId !== toolToTransfer.instanceId);
            await updateDoc(sourceCollectionRef, { currentTools: updatedSourceTools });

            const toolToAdd = { ...JSON.parse(JSON.stringify(toolToTransfer)), givenDate: now, receivedBy: receiverName, transferredFrom: selectedOwner.name };
            await updateDoc(targetCollectionRef, { currentTools: arrayUnion(toolToAdd) });

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
            handleTransferTargetTypeChange('MACHINE');
        } catch (error) { console.error("Transfer hatası:", error); }
    };

    // --- İADE VE HURDA (TOPLU VE TEKİL) İŞLEMLERİ ---
    
    // ORTAK: İşlemi Veritabanına Yansıtan Fonksiyon (Çoklu Destekli)
    const processBatchReturn = async (toolEntries, transactionType, note, isScrap, returnCondition) => {
        try {
            const ownerRef = viewMode === 'MACHINES' ? doc(db, MACHINES_COLLECTION, selectedOwnerId) : doc(db, PERSONNEL_COLLECTION, selectedOwnerId);

            // 1. ZİMMETTEN DÜŞ
            const instanceIdsToRemove = toolEntries.map(t => t.instanceId);
            const updatedToolsList = (selectedOwner.currentTools || []).filter(t => !instanceIdsToRemove.includes(t.instanceId));
            await updateDoc(ownerRef, { currentTools: updatedToolsList });

            // 2. STOĞA EKLE VE LOG YAZ
            for (const toolEntry of toolEntries) {
                // Eğer Sağlam İade ise Stok Artır
                if (!isScrap && !toolEntry.isMoldMaterial) {
                    // Kullanılmış dönüyorsa ama kendisi NEW ise
                    if (returnCondition === 'USED' && toolEntry.condition !== 'USED') {
                        const usedTool = tools.find(t => t.productCode === toolEntry.productCode && t.condition === 'USED' && t.name === toolEntry.toolName);
                        if (usedTool) {
                            await updateDoc(doc(db, INVENTORY_COLLECTION, usedTool.id), { totalStock: increment(1) });
                        } else {
                            await addDoc(collection(db, INVENTORY_COLLECTION), {
                                productCode: toolEntry.productCode || '',
                                name: toolEntry.toolName,
                                category: toolEntry.category || 'DİĞER',
                                condition: 'USED',
                                totalStock: 1,
                                criticalStock: 5,
                                description: 'Otomatik eklendi (Sıfır takım kullanılıp iade edildi)',
                                createdAt: getCurrentDateTimeString(),
                                createdBy: loggedInUser.name
                            });
                        }
                    } else {
                        // Kendi orijinal kaydına (New veya Used) ekle
                        const toolRef = doc(db, INVENTORY_COLLECTION, toolEntry.toolId);
                        await updateDoc(toolRef, { totalStock: increment(1) });
                    }
                }

                // LOG
                const responsiblePerson = toolEntry.receivedBy || (viewMode === 'PERSONNEL' ? selectedOwner.name : 'Bilinmiyor');
                const prefix = returnCondition === 'USED' ? '[KULLANILMIŞ İADE] ' : (returnCondition === 'NEW' && !toolEntry.isMoldMaterial ? '[SIFIR İADE] ' : '');

                await addDoc(collection(db, TOOL_TRANSACTIONS_COLLECTION), {
                    type: transactionType,
                    toolName: prefix + toolEntry.toolName,
                    machineName: viewMode === 'MACHINES' ? selectedOwner.name : 'ŞAHSİ ZİMMET',
                    user: loggedInUser.name,
                    receiver: responsiblePerson, 
                    date: getCurrentDateTimeString(),
                    notes: note,
                    projectId: toolEntry.projectId || '',
                    moldName: toolEntry.moldName || '',
                    moldPart: toolEntry.moldPart || ''
                });
            }
            
            setSelectedToolInstanceIds([]); // Seçimleri Temizle
        } catch (error) { console.error(error); }
    };

    // TEKİL İşlem Tetikleyicileri
    const handleReturnSingle = (toolEntry, condition) => {
        if (toolEntry.isMoldMaterial) {
            processBatchReturn([toolEntry], TOOL_TRANSACTION_TYPES.RETURN_HEALTHY, 'Kalıp Malzemesi İadesi', false, 'NEW');
        } else {
            const actualCondition = toolEntry.condition === 'USED' ? 'USED' : condition;
            processBatchReturn([toolEntry], TOOL_TRANSACTION_TYPES.RETURN_HEALTHY, actualCondition === 'USED' ? 'Kullanılmış iade' : 'Kullanılmadan iade edildi', false, actualCondition);
        }
    };

    const handleScrapSingle = (toolEntry) => {
        setScrapDescription('');
        setScrapReasonModal({ isOpen: true, toolEntry: toolEntry, isBatch: false });
    };

    // TOPLU (BATCH) İşlem Tetikleyicileri
    const handleBatchReturn = (condition) => {
        if (!window.confirm(`${selectedToolInstanceIds.length} adet takımı ${condition === 'USED' ? 'KULLANILMIŞ' : 'SIFIR'} olarak iade almak istediğinize emin misiniz?`)) return;
        const entries = selectedOwner.currentTools.filter(t => selectedToolInstanceIds.includes(t.instanceId));
        
        // Kullanılmış iadeyse hepsi USED olur. Sıfır iadeyse zaten USED olanlar USED kalır, NEW olanlar NEW döner.
        processBatchReturn(entries, TOOL_TRANSACTION_TYPES.RETURN_HEALTHY, 'Toplu İade İşlemi', false, condition);
    };

    const handleBatchScrap = () => {
        setScrapDescription('');
        setScrapReasonModal({ isOpen: true, toolEntry: null, isBatch: true });
    };

    // Hurda Onay Butonu (Tekil veya Toplu)
    const handleConfirmScrap = (reasonType) => {
        const isBatch = scrapReasonModal.isBatch;
        const entries = isBatch 
            ? selectedOwner.currentTools.filter(t => selectedToolInstanceIds.includes(t.instanceId))
            : [scrapReasonModal.toolEntry];

        if (entries.length === 0) return;

        let transactionType = TOOL_TRANSACTION_TYPES.RETURN_SCRAP; 
        let note = '';
        const userDesc = scrapDescription.trim() ? ` - Açıklama: ${scrapDescription}` : '';

        if (reasonType === 'WEAR') {
            transactionType = TOOL_TRANSACTION_TYPES.RETURN_SCRAP_WEAR;
            note = `Ömür bitti / Doğal aşınma${userDesc}`;
        } else if (reasonType === 'DAMAGE') {
            transactionType = TOOL_TRANSACTION_TYPES.RETURN_SCRAP_DAMAGE;
            note = `Kırılma / Hasar / Hata${userDesc}`;
        }

        processBatchReturn(entries, transactionType, note, true, 'SCRAP');
        setScrapReasonModal({ isOpen: false, toolEntry: null, isBatch: false });
        setScrapDescription('');
    };

    const handleEditExtraInfo = async () => {
        if (viewMode !== 'MACHINES' || !selectedOwner) return;
        const currentVal = selectedOwner.extraInfo || '';
        const newVal = prompt(`${selectedOwner.name} için ek bilgi (marka/model/bölüm vb.):`, currentVal);
        if (newVal === null) return;
        try {
            const machineRef = doc(db, MACHINES_COLLECTION, selectedOwner.id);
            await updateDoc(machineRef, { extraInfo: newVal.trim() });
        } catch (err) {
            console.error("Hata:", err);
            alert("Kaydedilemedi.");
        }
    };

    const formatDateSimple = (dateStr) => {
        if (!dateStr) return '-';
        try { return new Date(dateStr).toLocaleDateString('tr-TR'); } catch { return dateStr; }
    };

    // --- RENDER ---
    return (
        <div className="flex h-[calc(100vh-80px)] overflow-hidden bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
            
            {/* 1. SOL PANEL: LİSTE VE ARAMA */}
            <div className={`${selectedOwnerId ? 'hidden md:flex' : 'flex'} w-full md:w-1/3 lg:w-1/4 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex-col shrink-0`}>
                <div className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                    <div className="flex">
                        <button onClick={() => { setViewMode('MACHINES'); setSelectedOwnerId(null); }} className={`flex-1 py-3 text-sm font-bold text-center transition ${viewMode === 'MACHINES' ? 'bg-white dark:bg-gray-800 text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'}`}>
                            <Monitor className="w-4 h-4 inline-block mr-1 mb-0.5" /> Tezgahlar
                        </button>
                        <button onClick={() => { setViewMode('PERSONNEL'); setSelectedOwnerId(null); }} className={`flex-1 py-3 text-sm font-bold text-center transition ${viewMode === 'PERSONNEL' ? 'bg-white dark:bg-gray-800 text-purple-600 border-b-2 border-purple-600' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'}`}>
                            <Users className="w-4 h-4 inline-block mr-1 mb-0.5" /> Personel
                        </button>
                    </div>
                    
                    <div className="p-3 relative">
                        <Search className="absolute left-5 top-5.5 w-4 h-4 text-gray-400" />
                        <input type="text" placeholder={viewMode === 'MACHINES' ? "Tezgah Ara..." : "Personel Ara..."} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-8 p-2 text-sm border rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white border-gray-300 dark:border-gray-600 focus:ring-1 focus:ring-blue-500" />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">
                    {viewMode === 'MACHINES' ? (
                        filteredMachines.map(machine => {
                            const toolCount = machine.currentTools ? machine.currentTools.length : 0;
                            return (
                                <button key={machine.id} onClick={() => setSelectedOwnerId(machine.id)} className={`w-full text-left p-3 rounded-lg border transition-all flex justify-between items-center ${selectedOwnerId === machine.id ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-500 shadow-md ring-1 ring-blue-500' : 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 hover:border-blue-300 dark:hover:border-blue-500'}`}>
                                    <div>
                                        <div className="font-bold text-gray-900 dark:text-white">
                                            {machine.name}
                                            {machine.extraInfo && (
                                                <span className="text-[11px] text-gray-500 dark:text-gray-400 font-normal ml-1.5 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">
                                                    {machine.extraInfo}
                                                </span>
                                            )}
                                        </div>
                                        <div className="text-xs text-gray-500 dark:text-gray-400">{machine.type || 'Tezgah'}</div>
                                    </div>
                                    {toolCount > 0 && <span className="bg-orange-100 dark:bg-orange-900/50 text-orange-800 dark:text-orange-200 text-xs font-bold px-2 py-1 rounded-full">{toolCount}</span>}
                                </button>
                            );
                        })
                    ) : (
                        filteredPersonnelList.map(person => {
                            const toolCount = person.currentTools ? person.currentTools.length : 0;
                            return (
                                <button key={person.id} onClick={() => setSelectedOwnerId(person.id)} className={`w-full text-left p-3 rounded-lg border transition-all flex justify-between items-center ${selectedOwnerId === person.id ? 'bg-purple-50 dark:bg-purple-900/30 border-purple-500 shadow-md ring-1 ring-purple-500' : 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 hover:border-purple-300 dark:hover:border-purple-500'}`}>
                                    <div>
                                        <div className="font-bold text-gray-900 dark:text-white">{person.name}</div>
                                        <div className="text-xs text-gray-500 dark:text-gray-400">{person.role}</div>
                                    </div>
                                    {toolCount > 0 && <span className="bg-purple-100 dark:bg-purple-900/50 text-purple-800 dark:text-purple-200 text-xs font-bold px-2 py-1 rounded-full">{toolCount}</span>}
                                </button>
                            );
                        })
                    )}
                </div>
            </div>

            {/* 2. SAĞ PANEL: DETAY VE İŞLEM */}
            <div className={`${!selectedOwnerId ? 'hidden md:flex' : 'flex'} flex-1 bg-gray-50 dark:bg-gray-900 flex-col min-w-0`}>
                {selectedOwner ? (
                    <>
                        <div className="p-6 bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700 flex justify-between items-center shrink-0">
                            <div>
                                <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center">
                                    <button 
                                        onClick={() => setSelectedOwnerId(null)} 
                                        className="md:hidden mr-3 p-1.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded-lg text-gray-700 dark:text-gray-300 transition"
                                        title="Geri Dön"
                                    >
                                        <ChevronLeft className="w-5 h-5" />
                                    </button>
                                    {viewMode === 'MACHINES' ? <Monitor className="w-6 h-6 mr-2"/> : <User className="w-6 h-6 mr-2"/>}
                                    {selectedOwner.name}
                                    {viewMode === 'MACHINES' && selectedOwner.extraInfo && (
                                        <span className="text-lg text-gray-500 dark:text-gray-400 font-semibold ml-2">
                                            ({selectedOwner.extraInfo})
                                        </span>
                                    )}
                                    {(!isOperator && viewMode === 'MACHINES') && (
                                        <button 
                                            onClick={handleEditExtraInfo} 
                                            className="ml-2.5 p-1 text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 transition"
                                            title="Ek Bilgi Düzenle"
                                        >
                                            <Edit className="w-4 h-4" />
                                        </button>
                                    )}
                                    <span className={`ml-3 text-sm font-normal text-white px-3 py-1 rounded-full ${viewMode === 'MACHINES' ? 'bg-blue-500' : 'bg-purple-500'}`}>
                                        {viewMode === 'MACHINES' ? 'Tezgah Zimmeti' : 'Şahsi Zimmet'}
                                    </span>
                                </h1>
                            </div>
                            {!isOperator && (
                                <button onClick={() => setIsAssignModalOpen(true)} className={`px-6 py-2 text-white rounded-lg font-bold flex items-center shadow-lg transition transform hover:-translate-y-0.5 ${viewMode === 'MACHINES' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-purple-600 hover:bg-purple-700'}`}>
                                    <Plus className="w-5 h-5 mr-2" /> Takım Ekle
                                </button>
                            )}
                        </div>

                        <div className="p-4 flex-1 overflow-y-auto custom-scrollbar flex flex-col">
                            {(!selectedOwner.currentTools || selectedOwner.currentTools.length === 0) ? (
                                <div className="flex-1 flex flex-col items-center justify-center text-gray-400 dark:text-gray-500 opacity-60">
                                    <Wrench className="w-20 h-20 mb-4" />
                                    <p className="text-xl font-medium">Bu {viewMode === 'MACHINES' ? 'tezgahta' : 'personelde'} kayıtlı takım yok.</p>
                                    {!isOperator && <p className="text-sm">"Takım Ekle" butonunu kullanarak ekleme yapabilirsiniz.</p>}
                                </div>
                            ) : (
                                <div className="overflow-x-auto custom-scrollbar pb-2">
                                    <div className="flex flex-col space-y-2 min-w-[720px]">
                                    
                                    {/* TOPLU İŞLEM BARI (GÖRÜNÜR/GİZLİ) */}
                                    {(selectedToolInstanceIds.length > 0 && !isOperator) && (
                                        <div className="bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-800 p-3 rounded-xl flex items-center justify-between shadow-sm mb-2 sticky top-0 z-20 animate-in slide-in-from-top-2">
                                            <div className="flex items-center text-indigo-800 dark:text-indigo-300 font-black">
                                                <CheckSquare className="w-5 h-5 mr-2" /> {selectedToolInstanceIds.length} Takım Seçildi
                                            </div>
                                            <div className="flex gap-2">
                                                <button onClick={() => handleBatchReturn('NEW')} className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow transition flex items-center">
                                                    <Package className="w-3.5 h-3.5 mr-1" /> Toplu Sıfır İade
                                                </button>
                                                <button onClick={() => handleBatchReturn('USED')} className="bg-orange-600 hover:bg-orange-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow transition flex items-center">
                                                    <RefreshCw className="w-3.5 h-3.5 mr-1" /> Toplu Kull. İade
                                                </button>
                                                <button onClick={handleBatchScrap} className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow transition flex items-center">
                                                    <AlertTriangle className="w-3.5 h-3.5 mr-1" /> Toplu Hurda
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {/* TABLO BAŞLIKLARI */}
                                    <div className="flex px-2 py-2 text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider sticky top-0 bg-gray-50 dark:bg-gray-900 z-10">
                                        {!isOperator ? (
                                            <div className="w-8 flex justify-center items-center shrink-0">
                                                <input 
                                                    type="checkbox" 
                                                    className="w-4 h-4 text-indigo-600 rounded cursor-pointer"
                                                    checked={selectedToolInstanceIds.length === selectedOwner.currentTools.length && selectedOwner.currentTools.length > 0}
                                                    onChange={toggleSelectAll}
                                                />
                                            </div>
                                        ) : (
                                            <div className="w-4"></div>
                                        )}
                                        <div className="w-8"></div>
                                        <div className="flex-1 px-2">Takım Adı / Kod</div>
                                        <div className="w-24 text-center">Veriliş</div>
                                        <div className="w-32 px-2">Alan Kişi</div>
                                        <div className="w-52 text-right px-2">Hızlı İşlemler</div>
                                    </div>

                                    {selectedOwner.currentTools.map((toolEntry) => {
                                        const isUsed = toolEntry.condition === 'USED';
                                        const isSelected = selectedToolInstanceIds.includes(toolEntry.instanceId);
                                        
                                        return (
                                            <div key={toolEntry.instanceId} className={`group flex items-center p-2 rounded-xl border transition-all ${isSelected ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-900/20' : (isUsed ? 'bg-orange-50/50 dark:bg-orange-900/10 border-orange-200 dark:border-orange-800' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700')} hover:shadow-md`}>
                                                
                                                {!isOperator ? (
                                                    <div className="w-8 flex justify-center items-center shrink-0">
                                                        <input 
                                                            type="checkbox" 
                                                            className="w-4 h-4 text-indigo-600 rounded cursor-pointer"
                                                            checked={isSelected}
                                                            onChange={() => toggleToolSelection(toolEntry.instanceId)}
                                                        />
                                                    </div>
                                                ) : (
                                                    <div className="w-4"></div>
                                                )}

                                                <div className="w-8 flex justify-center shrink-0">
                                                    <div className={`p-1.5 rounded ${isUsed ? 'bg-orange-100 dark:bg-orange-900/50 text-orange-600 dark:text-orange-400' : 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'}`}>
                                                        {isUsed ? <RefreshCw className="w-3 h-3" /> : <Wrench className="w-3 h-3" />}
                                                    </div>
                                                </div>
                                                <div className="flex-1 px-3 min-w-0">
                                                    <div className="font-bold text-gray-900 dark:text-white text-sm flex items-center truncate">
                                                        {toolEntry.toolName}
                                                        {isUsed && <span className="ml-2 text-[9px] bg-orange-100 text-orange-700 border border-orange-200 dark:bg-orange-900/50 dark:text-orange-300 dark:border-orange-800 px-1.5 py-0.5 rounded font-black tracking-wider uppercase shrink-0">KULLANILMIŞ</span>}
                                                    </div>
                                                    {toolEntry.productCode && <span className="text-[11px] font-mono font-bold text-gray-500 dark:text-gray-400 mt-0.5 block truncate">{toolEntry.productCode}</span>}
                                                </div>
                                                <div className="w-24 text-[11px] font-bold text-center text-gray-500 dark:text-gray-400 shrink-0">
                                                    {formatDateSimple(toolEntry.givenDate)}
                                                </div>
                                                <div className="w-32 text-xs font-bold text-gray-600 dark:text-gray-300 truncate px-2 shrink-0" title={toolEntry.receivedBy}>
                                                    {toolEntry.receivedBy || '-'}
                                                </div>
                                                
                                                <div className="w-52 flex justify-end gap-1.5 opacity-60 group-hover:opacity-100 transition-opacity shrink-0 px-2">
                                                    {isOperator ? (
                                                        <button onClick={() => openTransferModal(toolEntry)} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-bold transition flex items-center gap-1.5 shadow-sm" title="Transfer Et">
                                                            <ArrowRightLeft className="w-3.5 h-3.5" /> Transfer Et
                                                        </button>
                                                    ) : (
                                                        <>
                                                            <button onClick={() => openTransferModal(toolEntry)} className="px-2 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600 rounded text-[10px] font-bold transition flex items-center shadow-sm" title="Transfer">
                                                                <ArrowRightLeft className="w-3 h-3" />
                                                            </button>
                                                            
                                                            {toolEntry.isMoldMaterial ? (
                                                                <button onClick={() => handleReturnSingle(toolEntry, 'NEW')} className="px-2 py-1.5 bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 dark:bg-green-900/30 dark:border-green-800 dark:text-green-400 rounded text-[10px] font-bold transition shadow-sm">
                                                                    İade
                                                                </button>
                                                            ) : (
                                                                <>
                                                                    {!isUsed && (
                                                                        <button onClick={() => handleReturnSingle(toolEntry, 'NEW')} className="px-2 py-1.5 bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 dark:bg-blue-900/30 dark:border-blue-800 dark:text-blue-400 rounded text-[10px] font-bold transition shadow-sm whitespace-nowrap">
                                                                            Sıfır İade
                                                                        </button>
                                                                    )}
                                                                    <button onClick={() => handleReturnSingle(toolEntry, 'USED')} className="px-2 py-1.5 bg-orange-50 text-orange-700 border border-orange-200 hover:bg-orange-100 dark:bg-orange-900/30 dark:border-orange-800 dark:text-orange-400 rounded text-[10px] font-bold transition shadow-sm whitespace-nowrap">
                                                                        Kull. İade
                                                                    </button>
                                                                </>
                                                            )}

                                                            <button onClick={() => handleScrapSingle(toolEntry)} className="px-2 py-1.5 bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 dark:bg-red-900/30 dark:border-red-800 dark:text-red-400 rounded text-[10px] font-bold transition shadow-sm">
                                                                Hurda
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                    </div>
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
                    <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-[95vw] h-[94vh] overflow-hidden flex flex-col border border-gray-200 dark:border-gray-700 animate-in fade-in zoom-in duration-200">
                        
                        <div className={`px-6 py-4 flex justify-between items-center text-white shrink-0 shadow-sm z-10 ${viewMode === 'MACHINES' ? 'bg-blue-600' : 'bg-purple-600'}`}>
                            <h3 className="text-xl font-bold flex items-center">
                                <List className="w-6 h-6 mr-3" /> 
                                {selectedOwner?.name} İçin Takım Seçimi ({viewMode === 'MACHINES' ? 'Tezgah' : 'Şahsi'})
                            </h3>
                            <button onClick={() => setIsAssignModalOpen(false)} className="hover:bg-white/20 p-1.5 rounded-lg transition">
                                <X className="w-6 h-6" />
                            </button>
                        </div>
                        
                        {/* 3'LÜ SEKME YAPISI */}
                        <div className="flex border-b border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 shrink-0 p-2 gap-2">
                            <button onClick={() => { setSourceType('INVENTORY_NEW'); setToolSearchTerm(''); }} className={`flex-1 py-2.5 rounded-lg text-sm font-black text-center transition flex items-center justify-center ${sourceType === 'INVENTORY_NEW' ? 'bg-white dark:bg-gray-700 text-blue-600 shadow-sm border border-gray-200 dark:border-gray-600' : 'text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700'}`}>
                                <Package className="w-4 h-4 mr-2"/> Sıfır Takımlar
                            </button>
                            <button onClick={() => { setSourceType('INVENTORY_USED'); setToolSearchTerm(''); }} className={`flex-1 py-2.5 rounded-lg text-sm font-black text-center transition flex items-center justify-center ${sourceType === 'INVENTORY_USED' ? 'bg-white dark:bg-gray-700 text-orange-600 shadow-sm border border-gray-200 dark:border-gray-600' : 'text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700'}`}>
                                <RefreshCw className="w-4 h-4 mr-2"/> Kullanılmış Takımlar
                            </button>
                            <button onClick={() => { setSourceType('MOLD_MATERIALS'); setToolSearchTerm(''); }} className={`flex-1 py-2.5 rounded-lg text-sm font-black text-center transition flex items-center justify-center ${sourceType === 'MOLD_MATERIALS' ? 'bg-white dark:bg-gray-700 text-purple-600 shadow-sm border border-gray-200 dark:border-gray-600' : 'text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700'}`}>
                                <Layers className="w-4 h-4 mr-2"/> Kalıp Malzemeleri
                            </button>
                        </div>
 
                        <div className="flex flex-1 min-h-0">
                            {/* HIZLI PİNLENENLER PANELİ */}
                            <div className="w-[20%] border-r border-gray-200 dark:border-gray-700 flex flex-col bg-gray-100 dark:bg-gray-900/60 p-3 min-h-0 overflow-y-auto custom-scrollbar shrink-0">
                                <h4 className="text-[11px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                                    <Star className="w-3.5 h-3.5 text-yellow-500 fill-yellow-500" /> PİNLİ TAKIMLAR
                                </h4>
                                {filteredPinnedTools.length === 0 ? (
                                    <div className="text-center py-8 px-2 text-[10px] text-gray-400 dark:text-gray-500 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl font-semibold leading-relaxed">
                                        Henüz hızlı takım pinlenmedi. Yan taraftaki pin (Yıldız) simgelerine basarak ekleyebilirsiniz.
                                    </div>
                                ) : (
                                    <div className="flex flex-col gap-2.5">
                                        {filteredPinnedTools.map((qt, idx) => {
                                            const palette = ASSIGN_COLOR_PALETTES[idx % ASSIGN_COLOR_PALETTES.length];
                                            const liveStock = tools.find(t => t.id === qt.id)?.totalStock ?? qt.totalStock ?? 0;
                                            return (
                                                <div 
                                                    key={qt.id}
                                                    onClick={() => {
                                                        const liveTool = tools.find(t => t.id === qt.id) || qt;
                                                        handleAddItem(liveTool);
                                                    }}
                                                    className={`relative rounded-xl p-3 shadow-md flex flex-col justify-between cursor-pointer transition-all hover:scale-[1.03] active:scale-95 bg-gradient-to-br ${palette} text-white min-h-[85px] group`}
                                                >
                                                    <button 
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setPinnedQuickAssignTools(prev => prev.filter(t => t.id !== qt.id));
                                                        }}
                                                        className="absolute top-1.5 right-1.5 p-1 bg-black/20 hover:bg-black/40 rounded-full text-white transition-opacity duration-200 opacity-80 group-hover:opacity-100"
                                                        title="Hızlı ekleme listesinden kaldır"
                                                    >
                                                        <X className="w-3 h-3" />
                                                    </button>
                                                    <div className="text-[9px] uppercase font-bold tracking-widest opacity-80 truncate pr-5">
                                                        {qt.productCode || 'KODSUZ'}
                                                    </div>
                                                    <div className="text-xs font-black mt-2 leading-tight break-words pr-2">
                                                        {qt.name}
                                                    </div>
                                                    <div className="text-[9px] font-bold opacity-80 mt-1">
                                                        Stok: {liveStock}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* SOL TARAF: DEPO GÖRÜNÜMÜ */}
                            <div className="w-[47%] border-r border-gray-200 dark:border-gray-700 flex flex-col bg-gray-50 dark:bg-gray-800/50 min-h-0">
                                <div className="p-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 space-y-3 shrink-0">
                                    {sourceType === 'INVENTORY_NEW' || sourceType === 'INVENTORY_USED' ? (
                                        <>
                                            <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
                                                {availableCategories.map(cat => (
                                                    <button key={cat} onClick={() => setSelectedCategory(cat)} className={`px-3 py-1.5 rounded-md text-xs font-bold whitespace-nowrap transition border ${selectedCategory === cat ? (sourceType === 'INVENTORY_NEW' ? 'bg-blue-50 border-blue-500 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' : 'bg-orange-50 border-orange-500 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300') : 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-gray-400'}`}>
                                                        {cat}
                                                    </button>
                                                ))}
                                            </div>
                                            <div className="relative">
                                                <Search className="absolute left-3 top-2.5 w-5 h-5 text-gray-400" />
                                                <input type="text" placeholder={`${sourceType === 'INVENTORY_NEW' ? 'Sıfır' : 'Kullanılmış'} Takım Adı veya Kod Ara...`} value={toolSearchTerm} onChange={(e) => setToolSearchTerm(e.target.value)} className={`w-full pl-10 p-2.5 border rounded-lg bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 ${sourceType === 'INVENTORY_USED' ? 'focus:ring-orange-500' : 'focus:ring-blue-500'}`} />
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            {/* KALIP SEÇİMİ (AKILLI DROPDOWN) */}
                                            <div className="relative">
                                                <Search className="absolute left-3 top-2.5 w-5 h-5 text-gray-400" />
                                                <input 
                                                    type="text" 
                                                    placeholder="Kalıp Ara ve Seç..." 
                                                    value={moldSearchTerm}
                                                    onChange={(e) => { setMoldSearchTerm(e.target.value); setIsMoldDropdownOpen(true); }}
                                                    onFocus={() => setIsMoldDropdownOpen(true)}
                                                    onBlur={() => setTimeout(() => setIsMoldDropdownOpen(false), 200)}
                                                    className="w-full pl-10 p-2.5 border rounded-lg bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-purple-500 font-bold"
                                                />
                                                {isMoldDropdownOpen && (
                                                    <div className="absolute z-20 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl max-h-60 overflow-y-auto custom-scrollbar">
                                                        {projects.filter(p => p.moldName.toLowerCase().includes(moldSearchTerm.toLowerCase())).map(p => (
                                                            <div key={p.id} onClick={() => { setSelectedMoldIdForMaterial(p.id); setMoldSearchTerm(`${p.moldName} (${p.customer})`); setIsMoldDropdownOpen(false); }} className="px-4 py-2.5 cursor-pointer hover:bg-purple-50 dark:hover:bg-gray-700 border-b last:border-0 border-gray-100 dark:border-gray-700 transition">
                                                                <div className="font-bold text-gray-900 dark:text-white">{p.moldName}</div>
                                                                <div className="text-xs text-gray-500">{p.customer}</div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                            
                                            {selectedMoldIdForMaterial && (
                                                <div className="relative mt-3">
                                                    <Search className="absolute left-3 top-2.5 w-5 h-5 text-gray-400" />
                                                    <input type="text" placeholder="Malzeme Adı veya ERP Kod Ara..." value={toolSearchTerm} onChange={(e) => setToolSearchTerm(e.target.value)} className="w-full pl-10 p-2.5 border rounded-lg bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-purple-500" />
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>

                                <div className="flex-1 overflow-y-auto p-2 custom-scrollbar min-h-0">
                                    {sourceType === 'INVENTORY_NEW' || sourceType === 'INVENTORY_USED' ? (
                                        <div className="flex flex-col space-y-2">
                                            {filteredToolsForSelection.length === 0 ? (
                                                 <div className="text-center p-10 text-gray-500 font-medium border-2 border-dashed rounded-xl mt-4">Aradığınız kriterlere uygun takım bulunamadı.</div>
                                            ) : (
                                                filteredToolsForSelection.map(tool => (
                                                    <div key={tool.id} className={`flex items-center p-2 rounded-lg border transition ${sourceType === 'INVENTORY_USED' ? 'bg-orange-50/50 dark:bg-orange-900/10 border-orange-200 dark:border-orange-800 hover:border-orange-400' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-blue-400'}`}>
                                                        <div className={`w-20 text-xs font-mono font-bold truncate px-2 py-1 rounded ${sourceType === 'INVENTORY_USED' ? 'text-orange-600 bg-orange-100 dark:bg-orange-900/50' : 'text-blue-600 bg-blue-50 dark:bg-blue-900/30'}`}>
                                                            {tool.productCode || '-'}
                                                        </div>
                                                        <div className="flex-1 px-3 font-bold text-gray-800 dark:text-gray-200 text-sm truncate">
                                                            {tool.name}
                                                        </div>
                                                        <div className="w-24 px-2">
                                                            <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded truncate block w-min max-w-full">
                                                                {tool.category}
                                                            </span>
                                                        </div>
                                                        <div className="w-16 text-center text-sm font-black text-gray-700 dark:text-gray-300">
                                                            {tool.totalStock}
                                                        </div>
                                                        <div className="w-32 flex justify-end items-center gap-1.5 shrink-0">
                                                             <button 
                                                                 type="button"
                                                                 onClick={(e) => {
                                                                     e.preventDefault();
                                                                     e.stopPropagation();
                                                                     setPinnedQuickAssignTools(prev => {
                                                                         const isPinned = prev.some(t => t.id === tool.id);
                                                                         if (isPinned) {
                                                                             return prev.filter(t => t.id !== tool.id);
                                                                         } else {
                                                                             return [...prev, {
                                                                                 id: tool.id,
                                                                                 name: tool.name,
                                                                                 productCode: tool.productCode || '',
                                                                                 category: tool.category,
                                                                                 condition: tool.condition || 'NEW',
                                                                                 totalStock: tool.totalStock
                                                                             }];
                                                                         }
                                                                     });
                                                                 }}
                                                                 className={`p-1.5 rounded-md border transition ${
                                                                     pinnedQuickAssignTools.some(t => t.id === tool.id)
                                                                     ? 'bg-yellow-100 border-yellow-400 text-yellow-600 dark:bg-yellow-900/30'
                                                                     : 'bg-white border-gray-300 text-gray-400 hover:text-yellow-500 dark:bg-gray-700 dark:border-gray-600'
                                                                 }`}
                                                                 title={pinnedQuickAssignTools.some(t => t.id === tool.id) ? "Hızlı Ekleme Listesinden Kaldır" : "Hızlı Ekleme Listesine Pinle"}
                                                             >
                                                                 <Star className={`w-3.5 h-3.5 pointer-events-none ${pinnedQuickAssignTools.some(t => t.id === tool.id) ? 'fill-yellow-500 text-yellow-500' : ''}`} />
                                                             </button>

                                                             <button onClick={() => handleAddItem(tool)} className={`px-3 py-1.5 text-white rounded-md text-xs font-bold transition flex items-center shadow-sm hover:shadow-md active:scale-95 ${sourceType === 'INVENTORY_USED' ? 'bg-orange-600 hover:bg-orange-700' : 'bg-blue-600 hover:bg-blue-700'}`}>
                                                                <Plus className="w-3 h-3 mr-1" /> Ekle
                                                             </button>
                                                        </div>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    ) : (
                                        selectedMoldIdForMaterial ? (
                                            <div className="flex flex-col space-y-2">
                                                {filteredMoldMaterials.length === 0 ? (
                                                    <div className="p-10 text-center text-gray-500 border-2 border-dashed rounded-xl mt-4 font-medium">Bu kalıpta henüz malzeme bulunmuyor.</div>
                                                ) : (
                                                    filteredMoldMaterials.map(mat => (
                                                        <div key={mat.id} className="flex items-center p-2 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-purple-400 transition">
                                                            <div className="w-20 text-xs font-mono font-bold text-purple-600 dark:text-purple-400 truncate bg-purple-50 dark:bg-purple-900/30 px-2 py-1 rounded">
                                                                {mat.erpCode || '-'}
                                                            </div>
                                                            <div className="flex-1 px-3 font-bold text-gray-800 dark:text-gray-200 text-sm truncate">
                                                                {mat.name}
                                                            </div>
                                                            <div className="w-24 flex flex-col">
                                                                <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded truncate block w-min max-w-full">
                                                                    {mat.type}
                                                                </span>
                                                            </div>
                                                            <div className="w-16 text-center text-sm font-black text-gray-700 dark:text-gray-300">
                                                                {mat.quantity}
                                                            </div>
                                                            <div className="w-24 flex justify-end">
                                                                <button onClick={() => handleAddMaterialItem(mat)} className={`px-4 py-1.5 text-white rounded-md text-xs font-bold transition flex items-center bg-purple-600 hover:bg-purple-700 shadow-sm active:scale-95`}>
                                                                    <Plus className="w-3 h-3 mr-1" /> Ekle
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ))
                                                )}
                                            </div>
                                        ) : (
                                            <div className="h-full flex flex-col items-center justify-center text-gray-400 opacity-60">
                                                <List className="w-16 h-16 mb-4" />
                                                <p className="font-bold">Malzemeleri görmek için yukarıdan kalıp arayın.</p>
                                            </div>
                                        )
                                    )}
                                </div>
                            </div>

                            {/* SAĞ TARAF: SEPET */}
                            <div className="w-[33%] flex flex-col bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 min-h-0">
                                <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 shrink-0">
                                    <h3 className="font-bold text-gray-800 dark:text-white flex items-center mb-4">
                                        <ShoppingCart className="w-5 h-5 mr-2" /> Eklenecekler Sepeti
                                    </h3>
                                    
                                    <div className="bg-white dark:bg-gray-700 p-3 rounded-lg border border-gray-200 dark:border-gray-600 shadow-sm">
                                        <label className="block text-xs font-bold text-gray-500 dark:text-gray-300 mb-1.5">
                                            {viewMode === 'MACHINES' ? 'Teslim Alan Operatör *' : 'Teslim Alan (Opsiyonel)'}
                                        </label>
                                        
                                        {/* OPERATÖR SEÇİMİ (AKILLI DROPDOWN) */}
                                        <div className="relative">
                                            <User className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                                            <input 
                                                type="text" 
                                                placeholder={viewMode === 'PERSONNEL' ? `${selectedOwner.name} (Kendisi)` : 'Operatör Ara ve Seç...'}
                                                value={opSearchTerm}
                                                onChange={(e) => { setOpSearchTerm(e.target.value); setIsOpDropdownOpen(true); }}
                                                onFocus={() => setIsOpDropdownOpen(true)}
                                                onBlur={() => setTimeout(() => setIsOpDropdownOpen(false), 200)}
                                                className="w-full pl-9 pr-4 py-2 border border-gray-300 dark:border-gray-500 rounded-md bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold"
                                            />
                                            {isOpDropdownOpen && (
                                                <div className="absolute z-20 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg max-h-48 overflow-y-auto custom-scrollbar">
                                                    {allOperators.filter(op => op.name.toLowerCase().includes(opSearchTerm.toLowerCase())).map(op => (
                                                        <div key={op.id} onClick={() => { setSelectedOperatorId(op.id); setOpSearchTerm(op.name); setIsOpDropdownOpen(false); }} className="px-3 py-2 cursor-pointer hover:bg-blue-50 dark:hover:bg-gray-700 border-b last:border-0 border-gray-100 dark:border-gray-700 text-sm font-bold transition">
                                                            {op.name} <span className="text-xs text-gray-500 font-normal block">{op.role}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar min-h-0">
                                    {pendingItems.length === 0 ? (
                                        <div className="h-full flex flex-col items-center justify-center text-gray-400 opacity-50">
                                            <ShoppingCart className="w-12 h-12 mb-2" />
                                            <p className="text-sm font-bold">Sepet boş.</p>
                                        </div>
                                    ) : (
                                        pendingItems.map(item => (
                                            <div key={item.tempId} className={`flex flex-col p-3 rounded-lg border ${item.condition === 'USED' ? 'bg-orange-50 border-orange-200 dark:bg-orange-900/20 dark:border-orange-800' : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'}`}>
                                                <div className="flex justify-between items-start mb-2">
                                                    <div className="flex-1 pr-2 min-w-0">
                                                        <div className="font-bold text-sm text-gray-800 dark:text-white leading-tight break-words">{item.toolName}</div>
                                                        <div className="flex items-center mt-1 gap-2">
                                                            {item.productCode && <span className="text-xs font-mono text-gray-500 dark:text-gray-400">{item.productCode}</span>}
                                                            {item.condition === 'USED' && <span className="text-[9px] bg-orange-200 text-orange-800 dark:bg-orange-800 dark:text-orange-200 px-1 rounded font-black tracking-wider">KULLANILMIŞ</span>}
                                                        </div>
                                                    </div>
                                                    <button onClick={() => handleRemoveItem(item.tempId)} className="text-red-400 hover:text-red-600 dark:hover:text-red-300 p-1">
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                                
                                                <div className="flex items-center justify-between bg-white dark:bg-gray-700 p-1 rounded border border-gray-200 dark:border-gray-600 mt-1">
                                                    <button onClick={() => handleUpdateQuantity(item.tempId, -1)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-600 rounded text-gray-600 dark:text-gray-300"><Minus className="w-4 h-4" /></button>
                                                    <span className="font-black text-sm text-gray-900 dark:text-white w-8 text-center">{item.quantity}</span>
                                                    <button onClick={() => handleUpdateQuantity(item.tempId, 1)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-600 rounded text-blue-600 dark:text-blue-400"><Plus className="w-4 h-4" /></button>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>

                                <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 shrink-0">
                                    <button 
                                        onClick={handleConfirmAssignment}
                                        disabled={pendingItems.length === 0 || (viewMode === 'MACHINES' && !selectedOperatorId)}
                                        className={`w-full py-3.5 text-white rounded-xl font-black shadow-lg transition transform active:scale-95 flex items-center justify-center 
                                            ${viewMode === 'MACHINES' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-purple-600 hover:bg-purple-700'} disabled:bg-gray-400 dark:disabled:bg-gray-700 disabled:transform-none`}
                                    >
                                        <CheckCircle className="w-5 h-5 mr-2" /> Kaydet ve Teslim Et
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* --- MODAL: TRANSFER (AKILLI ARAMA EKLENDİ) --- */}
            {isTransferModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-in fade-in zoom-in duration-200">
                    <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-lg border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col">
                        <div className="bg-orange-600 p-5 flex justify-between items-center text-white shrink-0">
                            <h3 className="text-xl font-black flex items-center tracking-wide"><ArrowRightLeft className="w-6 h-6 mr-3" /> Takım Transferi</h3>
                            <button onClick={() => setIsTransferModalOpen(false)} className="hover:bg-white/20 p-1.5 rounded-lg transition"><X className="w-6 h-6" /></button>
                        </div>
                        <div className="p-6 space-y-5">
                            <div className="bg-orange-50 dark:bg-orange-900/20 p-4 rounded-xl border border-orange-100 dark:border-orange-800/50">
                                <span className="block text-xs font-black text-orange-600 dark:text-orange-400 mb-1 uppercase tracking-wider">Transfer Edilecek</span>
                                <div className="text-lg font-bold text-gray-900 dark:text-white flex items-center">
                                    {toolToTransfer?.toolName}
                                    {toolToTransfer?.condition === 'USED' && <span className="ml-2 text-[9px] bg-orange-200 text-orange-800 px-1.5 py-0.5 rounded font-black tracking-wider">KULLANILMIŞ</span>}
                                </div>
                                <div className="text-sm font-medium text-gray-500 dark:text-gray-400 mt-1">Kaynak: <strong>{selectedOwner?.name}</strong></div>
                            </div>

                            <div className="flex gap-2">
                                <button onClick={() => handleTransferTargetTypeChange('MACHINE')} className={`flex-1 py-3 text-sm font-bold rounded-xl border-2 transition ${targetType === 'MACHINE' ? 'bg-orange-50 border-orange-500 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300'}`}>
                                    <Monitor className="w-4 h-4 inline mr-1.5 mb-0.5"/> Tezgaha Ver
                                </button>
                                <button onClick={() => handleTransferTargetTypeChange('PERSONNEL')} className={`flex-1 py-3 text-sm font-bold rounded-xl border-2 transition ${targetType === 'PERSONNEL' ? 'bg-orange-50 border-orange-500 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300'}`}>
                                    <Users className="w-4 h-4 inline mr-1.5 mb-0.5"/> Personele Ver
                                </button>
                            </div>

                            {/* HEDEF SEÇİMİ AKILLI ARAMA */}
                            <div className="relative">
                                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1.5">Hedef {targetType === 'MACHINE' ? 'Tezgah' : 'Personel'}</label>
                                <Search className="absolute left-3 top-9 w-4 h-4 text-gray-400" />
                                <input 
                                    type="text" placeholder={`${targetType === 'MACHINE' ? 'Tezgah' : 'Personel'} Ara ve Seç...`}
                                    value={transferTargetSearch}
                                    onChange={(e) => { setTransferTargetSearch(e.target.value); setIsTransferTargetOpen(true); }}
                                    onFocus={() => setIsTransferTargetOpen(true)}
                                    onBlur={() => setTimeout(() => setIsTransferTargetOpen(false), 200)}
                                    className="w-full pl-9 pr-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-orange-500 font-medium"
                                />
                                {isTransferTargetOpen && (
                                    <div className="absolute z-20 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl max-h-48 overflow-y-auto custom-scrollbar">
                                        {(targetType === 'MACHINE' ? machines : allOperators).filter(i => i.id !== selectedOwnerId && i.name.toLowerCase().includes(transferTargetSearch.toLowerCase())).map(item => (
                                            <div key={item.id} onClick={() => { setTargetId(item.id); setTransferTargetSearch(item.name); setIsTransferTargetOpen(false); }} className="px-4 py-2.5 cursor-pointer hover:bg-orange-50 dark:hover:bg-gray-700 border-b last:border-0 border-gray-100 dark:border-gray-700 text-sm font-bold transition">
                                                {item.name}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* OPERATÖR SEÇİMİ AKILLI ARAMA */}
                            {targetType === 'MACHINE' && (
                                <div className="relative">
                                    <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1.5">Teslim Alan Operatör</label>
                                    <Search className="absolute left-3 top-9 w-4 h-4 text-gray-400" />
                                    <input 
                                        type="text" placeholder="Operatör Ara ve Seç..."
                                        value={transferReceiverSearch}
                                        onChange={(e) => { setTransferReceiverSearch(e.target.value); setIsTransferReceiverOpen(true); }}
                                        onFocus={() => setIsTransferReceiverOpen(true)}
                                        onBlur={() => setTimeout(() => setIsTransferReceiverOpen(false), 200)}
                                        className="w-full pl-9 pr-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-orange-500 font-medium"
                                    />
                                    {isTransferReceiverOpen && (
                                        <div className="absolute z-20 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl max-h-48 overflow-y-auto custom-scrollbar">
                                            {allOperators.filter(op => op.name.toLowerCase().includes(transferReceiverSearch.toLowerCase())).map(op => (
                                                <div key={op.id} onClick={() => { setTargetReceiverId(op.id); setTransferReceiverSearch(op.name); setIsTransferReceiverOpen(false); }} className="px-4 py-2.5 cursor-pointer hover:bg-orange-50 dark:hover:bg-gray-700 border-b last:border-0 border-gray-100 dark:border-gray-700 text-sm font-bold transition">
                                                    {op.name}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            <button onClick={handleExecuteTransfer} disabled={!targetId || (targetType === 'MACHINE' && !targetReceiverId)} className="w-full py-3.5 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-xl font-black shadow-lg transition transform active:scale-95 flex items-center justify-center">
                                <ArrowRightLeft className="w-5 h-5 mr-2" /> Transferi Tamamla
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* --- MODAL: HURDA (TEKİL / TOPLU) --- */}
            {scrapReasonModal.isOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[60] p-4 backdrop-blur-sm animate-in fade-in zoom-in duration-200">
                    <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md border border-red-200 dark:border-red-900 overflow-hidden">
                        <div className="bg-red-50 dark:bg-red-900/30 p-5 border-b border-red-100 dark:border-red-800 text-center">
                            <div className="mx-auto w-14 h-14 bg-red-100 dark:bg-red-900/50 rounded-full flex items-center justify-center mb-3">
                                <AlertTriangle className="w-7 h-7 text-red-600 dark:text-red-400" />
                            </div>
                            <h3 className="text-xl font-black text-gray-900 dark:text-white">Hurda Ayrımı</h3>
                            <p className="text-sm font-bold text-gray-500 dark:text-gray-400 mt-1 truncate px-4">
                                {scrapReasonModal.isBatch ? `${selectedToolInstanceIds.length} Adet Takım` : scrapReasonModal.toolEntry?.toolName}
                            </p>
                        </div>
                        
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1.5">Açıklama / Hata Sebebi (Opsiyonel)</label>
                                <textarea 
                                    className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-800 text-sm text-gray-900 dark:text-white resize-none focus:ring-2 focus:ring-red-500 outline-none"
                                    rows="2" placeholder="Örn: Uç sıkıştı, Tezgaha çarptı..."
                                    value={scrapDescription} onChange={(e) => setScrapDescription(e.target.value)}
                                ></textarea>
                            </div>

                            <div className="space-y-3">
                                <button onClick={() => handleConfirmScrap('WEAR')} className="w-full p-4 rounded-xl border-2 border-blue-100 dark:border-blue-900/50 hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition flex items-center group">
                                    <div className="bg-blue-100 dark:bg-blue-900/50 p-2 rounded-full mr-4 group-hover:bg-blue-200 transition"><Recycle className="w-6 h-6 text-blue-600 dark:text-blue-300" /></div>
                                    <div className="text-left">
                                        <div className="font-bold text-gray-900 dark:text-white text-lg">Doğal Aşınma</div>
                                        <div className="text-xs font-medium text-gray-500">Normal kullanım sonucu ömrü bitti.</div>
                                    </div>
                                </button>
                                <button onClick={() => handleConfirmScrap('DAMAGE')} className="w-full p-4 rounded-xl border-2 border-red-100 dark:border-red-900/50 hover:border-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition flex items-center group">
                                    <div className="bg-red-100 dark:bg-red-900/50 p-2 rounded-full mr-4 group-hover:bg-red-200 transition"><AlertOctagon className="w-6 h-6 text-red-600 dark:text-red-300" /></div>
                                    <div className="text-left">
                                        <div className="font-bold text-gray-900 dark:text-white text-lg">Kırılma / Hasar</div>
                                        <div className="text-xs font-medium text-gray-500">Operatör hatası veya kaza.</div>
                                    </div>
                                </button>
                            </div>
                        </div>
                        <div className="p-4 bg-gray-50 dark:bg-gray-800 border-t dark:border-gray-700 text-center">
                            <button onClick={() => { setScrapReasonModal({ isOpen: false, toolEntry: null, isBatch: false }); setScrapDescription(''); }} className="text-gray-500 font-bold hover:text-gray-800 dark:hover:text-white text-sm">İptal Et</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ToolAssignmentPage;