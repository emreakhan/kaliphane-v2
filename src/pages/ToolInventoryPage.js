// src/pages/ToolInventoryPage.js

import React, { useState, useMemo, useEffect } from 'react';
import { 
    Package, Plus, Search, 
    Trash2, Edit, Save, X, PlusCircle, MinusCircle, 
    Settings, Edit3, Hash, Check, RefreshCw
} from 'lucide-react';
import { 
    addDoc, collection, doc, updateDoc, deleteDoc, onSnapshot, query, orderBy
} from '../config/firebase.js';
import { 
    INVENTORY_COLLECTION, TOOL_CATEGORIES_COLLECTION,
    TOOL_TRANSACTIONS_COLLECTION, TOOL_TRANSACTION_TYPES 
} from '../config/constants.js';
import { getCurrentDateTimeString } from '../utils/dateUtils.js';

const ToolInventoryPage = ({ tools, loggedInUser, db, machines = [], personnel = [] }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('TÜMÜ');
    
    // --- YENİ: DEPO SEKME STATE'İ (NEW = Sıfır, USED = Kullanılmış) ---
    const [stockTab, setStockTab] = useState('NEW'); 

    // --- PAGİNATİON STATES ---
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 50;

    useEffect(() => {
        setCurrentPage(1);
    }, [selectedCategory, searchTerm, stockTab]); 

    // Kategorileri Veritabanından Çekmek İçin State
    const [categories, setCategories] = useState([]);
    const [isCategoryManagerOpen, setIsCategoryManagerOpen] = useState(false);

    // Kategori Düzenleme State'i
    const [editingCategoryId, setEditingCategoryId] = useState(null);
    const [editingCategoryName, setEditingCategoryName] = useState('');

    // Modal Stateleri
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingTool, setEditingTool] = useState(null); 
    
    // Stok Ekleme Modalı State
    const [addStockModal, setAddStockModal] = useState({ isOpen: false, tool: null, quantity: '1' });
    const [scrapModal, setScrapModal] = useState({ isOpen: false, tool: null, quantity: '1', reason: 'WEAR', notes: '' });
    const [stockUpdateId, setStockUpdateId] = useState(null); 
    const [tempStockValue, setTempStockValue] = useState('');

    // Form State
    const [formData, setFormData] = useState({
        productCode: '',
        name: '',
        category: '',
        condition: 'NEW', // YENİ: Ürün Durumu (NEW/USED)
        totalStock: 0,
        criticalStock: 5,
        description: ''
    });

    // --- 1. KATEGORİLERİ VERİTABANINDAN ÇEKME ---
    useEffect(() => {
        if (!db) return;
        const q = query(collection(db, TOOL_CATEGORIES_COLLECTION), orderBy("name"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const cats = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            if (cats.length === 0) {
                const defaults = ["FREZE", "MATKAP", "KILAVUZ", "KESİCİ UÇ", "TUTUCU", "ÖLÇÜ ALETİ", "SARF", "DİĞER"];
                defaults.forEach(async (catName) => {
                    await addDoc(collection(db, TOOL_CATEGORIES_COLLECTION), { name: catName });
                });
            } else {
                setCategories(cats);
            }
        });
        return () => unsubscribe();
    }, [db]);

    // --- 2. FİLTRELEME MANTIĞI (DEPO TÜRÜ DAHİL) ---
    const filteredTools = useMemo(() => {
        let result = tools || [];

        // Sekme Filtresi (Sıfır / Kullanılmış)
        if (stockTab === 'NEW') {
            result = result.filter(t => !t.condition || t.condition === 'NEW');
        } else {
            result = result.filter(t => t.condition === 'USED');
        }

        // Kategori Filtresi
        if (selectedCategory !== 'TÜMÜ') {
            result = result.filter(t => t.category === selectedCategory);
        }

        // Arama Filtresi
        if (searchTerm) {
            const lowerTerm = searchTerm.toLowerCase();
            result = result.filter(t => 
                t.name.toLowerCase().includes(lowerTerm) || 
                (t.productCode && t.productCode.toLowerCase().includes(lowerTerm))
            );
        }

        return result.sort((a, b) => (a.productCode || '').localeCompare(b.productCode || '') || a.name.localeCompare(b.name));
    }, [tools, searchTerm, selectedCategory, stockTab]);

    const paginatedTools = useMemo(() => {
        const startIndex = (currentPage - 1) * itemsPerPage;
        return filteredTools.slice(startIndex, startIndex + itemsPerPage);
    }, [filteredTools, currentPage]);

    const totalPages = Math.ceil(filteredTools.length / itemsPerPage);

    // --- 3. İSTATİSTİKLER ---
    const getCategoryCount = (catName) => {
        const activeTabTools = tools.filter(t => stockTab === 'NEW' ? (!t.condition || t.condition === 'NEW') : t.condition === 'USED');
        if (catName === 'TÜMÜ') return activeTabTools.length;
        return activeTabTools.filter(t => t.category === catName).length;
    };

    // --- LOGLAMA FONKSİYONU ---
    const logStockEntry = async (toolId, toolName, quantity, oldStock, newStock, isManualAdjustment = false, condition = 'NEW') => {
        if (quantity === 0) return; 

        let type = TOOL_TRANSACTION_TYPES.ADJUSTMENT;

        if (quantity > 0) {
            if (isManualAdjustment) {
                type = TOOL_TRANSACTION_TYPES.ADJUSTMENT; 
            } else {
                type = TOOL_TRANSACTION_TYPES.STOCK_ENTRY; 
            }
        } else {
            type = TOOL_TRANSACTION_TYPES.ADJUSTMENT;
        }

        const conditionText = condition === 'USED' ? '[KULLANILMIŞ DEPO] ' : '[SIFIR DEPO] ';

        try {
            await addDoc(collection(db, TOOL_TRANSACTIONS_COLLECTION), {
                type: type,
                toolId: toolId,
                toolName: conditionText + toolName,
                quantity: Math.abs(quantity),
                oldStock: oldStock,
                newStock: newStock,
                user: loggedInUser.name,
                date: getCurrentDateTimeString(),
                notes: isManualAdjustment ? 'Devir / Sayım Düzeltmesi' : 'Stok Girişi / Satın Alma'
            });
        } catch (e) {
            console.error("Loglama hatası:", e);
        }
    };

    // --- CRUD İŞLEMLERİ ---

    const openAddModal = () => {
        setEditingTool(null);
        setFormData({
            productCode: '',
            name: '',
            category: categories.length > 0 ? categories[0].name : '',
            condition: stockTab, // Hangi sekmedeyse ona göre otomatik seçili gelsin
            totalStock: 0,
            criticalStock: 5,
            description: ''
        });
        setIsModalOpen(true);
    };

    const openEditModal = (tool) => {
        setEditingTool(tool);
        setFormData({
            productCode: tool.productCode || '',
            name: tool.name,
            category: tool.category,
            condition: tool.condition || 'NEW',
            totalStock: tool.totalStock,
            criticalStock: tool.criticalStock,
            description: tool.description || ''
        });
        setIsModalOpen(true);
    };

    const handleSaveTool = async (e) => {
        e.preventDefault();
        if (!formData.name || !formData.category) return alert("Ad ve Kategori zorunludur.");

        const cleanCode = formData.productCode ? formData.productCode.trim().toUpperCase() : '';
        const currentCondition = formData.condition || 'NEW';
        
        // GÜNCELLEME: Çakışma kontrolü artık "Ürün Kodu + Durumu" ikilisine göre yapılıyor.
        // Yani "F-10" kodlu sıfır bir ürün ile "F-10" kodlu kullanılmış bir ürün aynı anda var olabilir.
        if (cleanCode) {
            const duplicate = tools.find(t => t.productCode === cleanCode && (t.condition || 'NEW') === currentCondition);
            if (duplicate && (!editingTool || duplicate.id !== editingTool.id)) {
                return alert(`HATA: "${cleanCode}" kodu bu depoda (${currentCondition === 'NEW' ? 'Sıfır' : 'Kullanılmış'}) zaten mevcut!`);
            }
        }

        try {
            const newStockVal = parseInt(formData.totalStock);
            const payload = {
                ...formData,
                productCode: cleanCode, 
                totalStock: newStockVal,
                criticalStock: parseInt(formData.criticalStock),
                updatedAt: getCurrentDateTimeString(),
                updatedBy: loggedInUser.name
            };

            if (editingTool) {
                const oldStock = parseInt(editingTool.totalStock);
                await updateDoc(doc(db, INVENTORY_COLLECTION, editingTool.id), payload);
                
                if (newStockVal !== oldStock) {
                    await logStockEntry(editingTool.id, editingTool.name, newStockVal - oldStock, oldStock, newStockVal, true, payload.condition);
                }

            } else {
                const docRef = await addDoc(collection(db, INVENTORY_COLLECTION), {
                    ...payload,
                    createdAt: getCurrentDateTimeString(),
                    createdBy: loggedInUser.name
                });
                
                if (newStockVal > 0) {
                    await logStockEntry(docRef.id, payload.name, newStockVal, 0, newStockVal, true, payload.condition);
                }
            }
            setIsModalOpen(false); 
        } catch (error) {
            console.error("Kaydetme hatası:", error);
            alert("İşlem sırasında hata oluştu.");
        }
    };

    const handleDeleteTool = async (id) => {
        if (window.confirm("Bu parçayı stoktan tamamen silmek istediğinize emin misiniz?")) {
            try {
                await deleteDoc(doc(db, INVENTORY_COLLECTION, id));
            } catch (error) {
                console.error("Silme hatası:", error);
            }
        }
    };

    const handleQuickStockUpdate = async (tool, amount) => {
        const oldStock = parseInt(tool.totalStock);
        const newStock = oldStock + amount;
        if (newStock < 0) return;
        try {
            await updateDoc(doc(db, INVENTORY_COLLECTION, tool.id), { totalStock: newStock });
            const isManual = amount < 0; 
            await logStockEntry(tool.id, tool.name, amount, oldStock, newStock, isManual, tool.condition);
        } catch (error) {
            console.error("Stok güncelleme hatası:", error);
        }
    };

    const handleManualStockSave = async (toolId) => {
        const tool = tools.find(t => t.id === toolId);
        if (!tool) return;

        const val = parseInt(tempStockValue);
        if (isNaN(val) || val < 0) return alert("Geçerli bir stok adedi giriniz.");
        
        const oldStock = parseInt(tool.totalStock);
        const diff = val - oldStock;

        if (diff === 0) {
            setStockUpdateId(null);
            return;
        }

        try {
            await updateDoc(doc(db, INVENTORY_COLLECTION, toolId), { totalStock: val });
            await logStockEntry(tool.id, tool.name, diff, oldStock, val, true, tool.condition);

            setStockUpdateId(null);
            setTempStockValue('');
        } catch (error) {
            console.error("Stok ayar hatası:", error);
        }
    };

    const handleConfirmAddStock = async () => {
        const { tool, quantity } = addStockModal;
        if (!tool) return;

        const qty = parseInt(quantity);
        if (isNaN(qty) || qty <= 0) return alert("Lütfen geçerli ve 0'dan büyük bir miktar giriniz.");

        const oldStock = parseInt(tool.totalStock);
        const newStock = oldStock + qty;

        try {
            await updateDoc(doc(db, INVENTORY_COLLECTION, tool.id), { totalStock: newStock });
            await logStockEntry(tool.id, tool.name, qty, oldStock, newStock, false, tool.condition);
            setAddStockModal({ isOpen: false, tool: null, quantity: '1' });
        } catch (error) {
            console.error("Stok ekleme hatası:", error);
            alert("İşlem sırasında hata oluştu.");
        }
    };

    const handleConfirmScrap = async () => {
        const { tool, quantity, reason, notes } = scrapModal;
        if (!tool) return;

        const qty = parseInt(quantity);
        if (isNaN(qty) || qty <= 0) return alert("Lütfen geçerli ve 0'dan büyük bir miktar giriniz.");
        if (qty > tool.totalStock) return alert(`Hata: Stokta en fazla ${tool.totalStock} adet bulunmaktadır!`);

        const oldStock = parseInt(tool.totalStock);
        const newStock = oldStock - qty;

        try {
            await updateDoc(doc(db, INVENTORY_COLLECTION, tool.id), { totalStock: newStock });

            const conditionText = tool.condition === 'USED' ? '[KULLANILMIŞ DEPO] ' : '[SIFIR DEPO] ';
            const type = reason === 'WEAR' ? TOOL_TRANSACTION_TYPES.RETURN_SCRAP_WEAR : TOOL_TRANSACTION_TYPES.RETURN_SCRAP_DAMAGE;
            
            await addDoc(collection(db, TOOL_TRANSACTIONS_COLLECTION), {
                type: type,
                toolId: tool.id,
                toolName: conditionText + tool.name,
                category: tool.category || 'DİĞER',
                quantity: qty,
                oldStock: oldStock,
                newStock: newStock,
                user: loggedInUser.name,
                date: getCurrentDateTimeString(),
                notes: notes.trim() || (reason === 'WEAR' ? 'Ömrünü Tamamlayarak Hurda' : 'Kırılma/Hata Kaynaklı Hurda')
            });

            alert("Takım başarıyla hurdaya ayrıldı.");
            setScrapModal({ isOpen: false, tool: null, quantity: '1', reason: 'WEAR', notes: '' });
        } catch (error) {
            console.error("Hurda kaydetme hatası:", error);
            alert("İşlem sırasında hata oluştu.");
        }
    };

    // --- KATEGORİ YÖNETİMİ ---
    const [newCatName, setNewCatName] = useState('');
    
    const handleAddCategory = async () => {
        if(!newCatName.trim()) return;
        await addDoc(collection(db, TOOL_CATEGORIES_COLLECTION), { name: newCatName.toUpperCase() });
        setNewCatName('');
    };

    const handleDeleteCategory = async (id) => {
        if(window.confirm("Kategoriyi silmek istiyor musunuz? (İçindeki ürünler silinmez, sadece kategori listeden kalkar)")) {
            await deleteDoc(doc(db, TOOL_CATEGORIES_COLLECTION, id));
        }
    };

    const startEditingCategory = (cat) => {
        setEditingCategoryId(cat.id);
        setEditingCategoryName(cat.name);
    };

    const saveEditingCategory = async () => {
        if (!editingCategoryName.trim()) return;
        await updateDoc(doc(db, TOOL_CATEGORIES_COLLECTION, editingCategoryId), { name: editingCategoryName.toUpperCase() });
        setEditingCategoryId(null);
        setEditingCategoryName('');
    };

    return (
        <div className="p-6 w-full mx-auto min-h-screen bg-gray-50 dark:bg-gray-900">
            
            {/* 1. ÜST PANEL: BAŞLIK, SEKMELER & İŞLEMLER */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4 border-b border-gray-200 dark:border-gray-700 pb-6">
                <div>
                    <h1 className="text-3xl font-extrabold text-gray-900 dark:text-white flex items-center gap-3">
                        <Package className="w-8 h-8 text-blue-600" />
                        Depo & Stok Yönetimi
                    </h1>
                    <p className="text-gray-500 dark:text-gray-400 mt-2 text-sm">
                        Toplam {tools.length} parça kayıtlı.
                    </p>
                </div>
                
                {/* DEPO SEKMELERİ (SIFIR / KULLANILMIŞ) */}
                <div className="flex bg-gray-200 dark:bg-gray-800 p-1.5 rounded-xl shadow-inner w-full md:w-auto overflow-x-auto">
                    <button 
                        onClick={() => setStockTab('NEW')}
                        className={`px-6 py-2.5 rounded-lg font-bold text-sm transition-all whitespace-nowrap flex items-center ${stockTab === 'NEW' ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'}`}
                    >
                        <Package className="w-4 h-4 mr-2" /> Sıfır Depo
                    </button>
                    <button 
                        onClick={() => setStockTab('USED')}
                        className={`px-6 py-2.5 rounded-lg font-bold text-sm transition-all whitespace-nowrap flex items-center ${stockTab === 'USED' ? 'bg-white dark:bg-gray-700 text-orange-600 dark:text-orange-400 shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'}`}
                    >
                        <RefreshCw className="w-4 h-4 mr-2" /> Kullanılmış Depo
                    </button>
                </div>

                <div className="flex gap-3 w-full md:w-auto">
                    <button 
                        onClick={() => setIsCategoryManagerOpen(true)}
                        className="flex-1 md:flex-none bg-gray-100 hover:bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 px-4 py-2.5 rounded-lg font-semibold flex items-center justify-center transition border border-gray-200 dark:border-gray-600 text-sm"
                    >
                        <Settings className="w-4 h-4 mr-2" /> Kategoriler
                    </button>
                    <button 
                        onClick={openAddModal}
                        className={`flex-1 md:flex-none text-white px-5 py-2.5 rounded-lg font-bold flex items-center justify-center shadow-lg transition transform hover:-translate-y-0.5 text-sm ${stockTab === 'NEW' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-orange-600 hover:bg-orange-700'}`}
                    >
                        <Plus className="w-4 h-4 mr-2" /> Yeni Parça
                    </button>
                </div>
            </div>

            {/* 2. KATEGORİ KARTLARI (KOMPAKT GRID) */}
            <div className="mb-6">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                    {/* Tümü Kartı */}
                    <button
                        onClick={() => setSelectedCategory('TÜMÜ')}
                        className={`p-3 rounded-lg border text-left flex flex-col justify-between h-16 shadow-sm transition-all ${
                            selectedCategory === 'TÜMÜ'
                                ? (stockTab === 'NEW' ? 'bg-blue-600 text-white border-blue-700 shadow-md transform scale-105' : 'bg-orange-600 text-white border-orange-700 shadow-md transform scale-105')
                                : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-blue-300'
                        }`}
                    >
                        <div className="flex justify-between items-center w-full">
                            <span className={`text-xs font-bold truncate ${selectedCategory === 'TÜMÜ' ? 'text-white' : 'text-gray-800 dark:text-gray-200'}`}>TÜMÜ</span>
                            <span className={`text-xs px-1.5 py-0.5 rounded font-bold ${
                                selectedCategory === 'TÜMÜ' ? 'bg-black/20 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                            }`}>
                                {getCategoryCount('TÜMÜ')}
                            </span>
                        </div>
                    </button>

                    {/* Dinamik Kategoriler */}
                    {categories.map(cat => (
                        <button
                            key={cat.id}
                            onClick={() => setSelectedCategory(cat.name)}
                            className={`p-3 rounded-lg border text-left flex flex-col justify-between h-16 shadow-sm transition-all ${
                                selectedCategory === cat.name
                                    ? (stockTab === 'NEW' ? 'bg-blue-600 text-white border-blue-700 shadow-md transform scale-105' : 'bg-orange-600 text-white border-orange-700 shadow-md transform scale-105')
                                    : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-blue-300'
                            }`}
                        >
                            <div className="flex justify-between items-center w-full">
                                <span className={`text-xs font-bold truncate pr-2 ${selectedCategory === cat.name ? 'text-white' : 'text-gray-800 dark:text-gray-200'}`} title={cat.name}>{cat.name}</span>
                                <span className={`text-xs px-1.5 py-0.5 rounded font-bold ${
                                    selectedCategory === cat.name ? 'bg-black/20 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                                }`}>
                                    {getCategoryCount(cat.name)}
                                </span>
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            {/* 3. ARAMA VE LİSTE */}
            <div className={`bg-white dark:bg-gray-800 rounded-xl shadow-lg border overflow-hidden ${stockTab === 'USED' ? 'border-orange-200 dark:border-orange-900/50' : 'border-gray-200 dark:border-gray-700'}`}>
                {/* Arama Barı */}
                <div className={`p-4 border-b bg-opacity-50 ${stockTab === 'USED' ? 'border-orange-100 bg-orange-50 dark:border-orange-900/30 dark:bg-orange-900/10' : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50'}`}>
                    <div className="relative max-w-md">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                        <input 
                            type="text" 
                            placeholder={`${stockTab === 'NEW' ? 'Sıfır depoda' : 'Kullanılmış depoda'} ara...`}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className={`w-full pl-10 pr-4 py-2 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 ${stockTab === 'USED' ? 'border-orange-200 dark:border-orange-700 focus:ring-orange-500' : 'border-gray-300 dark:border-gray-600 focus:ring-blue-500'}`}
                        />
                    </div>
                </div>

                {/* Tablo */}
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className={stockTab === 'USED' ? 'bg-orange-50/50 dark:bg-orange-900/20' : 'bg-gray-50 dark:bg-gray-900'}>
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider w-24">Durum</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider w-32">Kod</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Parça Adı</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Kategori</th>
                                <th className="px-6 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider w-32">Dışarıda</th>
                                <th className="px-6 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider w-48">Mevcut Stok</th>
                                <th className="px-6 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider w-64">İşlemler</th>
                            </tr>
                        </thead>
<tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                            {filteredTools.length === 0 ? (
                                <tr>
                                    <td colSpan="6" className="px-6 py-12 text-center text-gray-500 dark:text-gray-400 flex flex-col items-center justify-center">
                                        {stockTab === 'USED' ? <RefreshCw className="w-12 h-12 mb-3 opacity-20 text-orange-500" /> : <Package className="w-12 h-12 mb-3 opacity-20 text-blue-500" />}
                                        <p className="font-medium text-lg">{stockTab === 'NEW' ? 'Sıfır depoda' : 'Kullanılmış depoda'} aradığınız kriterlere uygun kayıt bulunamadı.</p>
                                    </td>
                                </tr>
                            ) : (
                                paginatedTools.map((tool) => {
                                    const isCritical = tool.totalStock <= tool.criticalStock;
                                    const isUsed = tool.condition === 'USED';
                                    
                                    // Dışarıda (tezgahlarda/personelde zimmetli) olan adedi hesapla
                                    const assignedCount = (() => {
                                        let count = 0;
                                        machines.forEach(m => {
                                            if (m.currentTools) {
                                                m.currentTools.forEach(ct => {
                                                    if (ct.toolId === tool.id || ct.toolName === tool.name) {
                                                        count++;
                                                    }
                                                });
                                            }
                                        });
                                        personnel.forEach(p => {
                                            if (p.currentTools) {
                                                p.currentTools.forEach(ct => {
                                                    if (ct.toolId === tool.id || ct.toolName === tool.name) {
                                                        count++;
                                                    }
                                                });
                                            }
                                        });
                                        return count;
                                    })();
                                    
                                    return (
                                        <tr key={tool.id} className={`transition group ${isUsed ? 'hover:bg-orange-50 dark:hover:bg-orange-900/20' : 'hover:bg-blue-50 dark:hover:bg-gray-700/50'}`}>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                {isCritical ? (
                                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-800 animate-pulse border border-red-200">
                                                        KRİTİK
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-800 border border-green-200">
                                                        OK
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className={`text-sm font-mono font-bold px-2 py-1 rounded inline-block ${isUsed ? 'text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/30' : 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30'}`}>
                                                    {tool.productCode || '-'}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="text-sm font-bold text-gray-900 dark:text-white flex items-center">
                                                    {tool.name}
                                                    {isUsed && (
                                                        <span className="ml-2 text-[10px] bg-orange-100 text-orange-600 border border-orange-200 dark:bg-orange-900/50 dark:text-orange-300 dark:border-orange-800 px-1.5 py-0.5 rounded-md font-black tracking-wider uppercase flex items-center">
                                                            <RefreshCw className="w-3 h-3 mr-1" /> KULLANILMIŞ
                                                        </span>
                                                    )}
                                                </div>
                                                {tool.description && <div className="text-xs text-gray-500 truncate max-w-xs mt-0.5">{tool.description}</div>}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className="px-2 py-1 rounded text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600">
                                                    {tool.category}
                                                </span>
                                            </td>
                                            
                                            {/* DIŞARIDA HÜCRESİ */}
                                            <td className="px-6 py-4 whitespace-nowrap text-center">
                                                {assignedCount > 0 ? (
                                                    <span className="px-2.5 py-1 rounded-full text-xs font-extrabold bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                                                        {assignedCount} Zimmetli
                                                    </span>
                                                ) : (
                                                    <span className="text-xs text-gray-400 dark:text-gray-500 font-bold">-</span>
                                                )}
                                            </td>
                                            
                                            {/* STOK YÖNETİM HÜCRESİ */}
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="flex items-center justify-center gap-2 bg-gray-50 dark:bg-gray-900/50 p-1 rounded-lg border border-gray-200 dark:border-gray-700 relative">
                                                    {stockUpdateId === tool.id ? (
                                                        <div className="flex flex-col items-center p-2 bg-white dark:bg-gray-800 rounded shadow-lg absolute z-10 border border-blue-200 -top-8 min-w-[150px]">
                                                            <div className="flex items-center">
                                                                <input 
                                                                    type="number" 
                                                                    className="w-20 p-1 text-center text-sm border rounded focus:ring-2 focus:ring-blue-500 text-gray-900"
                                                                    value={tempStockValue}
                                                                    onChange={(e) => setTempStockValue(e.target.value)}
                                                                    onKeyDown={(e) => { if(e.key === 'Enter') handleManualStockSave(tool.id) }}
                                                                    autoFocus
                                                                 />
                                                                 <button onClick={() => handleManualStockSave(tool.id)} className="ml-1 text-green-600 hover:bg-green-100 p-1 rounded" title="Kaydet"><Save className="w-4 h-4"/></button>
                                                                 <button onClick={() => setStockUpdateId(null)} className="ml-1 text-red-600 hover:bg-red-100 p-1 rounded" title="İptal"><X className="w-4 h-4"/></button>
                                                             </div>
                                                             <span className="text-[10px] text-gray-400 mt-1 font-semibold">Devir / Sayım Düzeltmesi</span>
                                                         </div>
                                                     ) : (
                                                         <>
                                                             <button 
                                                                onClick={() => setScrapModal({ isOpen: true, tool: tool, quantity: '1', reason: 'WEAR', notes: '' })}
                                                                className="w-8 h-8 flex items-center justify-center rounded-md text-gray-500 hover:bg-red-100 hover:text-red-600 transition"
                                                                title="Takımı Hurdaya Ayır"
                                                            >
                                                                <MinusCircle className="w-5 h-5" />
                                                            </button>
                                                             
                                                             <span className={`text-lg font-bold w-12 text-center cursor-pointer hover:underline ${isCritical ? 'text-red-600' : 'text-gray-800 dark:text-white'}`}
                                                                   onClick={() => { setStockUpdateId(tool.id); setTempStockValue(tool.totalStock); }}
                                                                   title="Tıkla ve elle düzenle (Sayım)"
                                                             >
                                                                 {tool.totalStock}
                                                             </span>
 
                                                            <button 
                                                                onClick={() => handleQuickStockUpdate(tool, 1)}
                                                                className="w-8 h-8 flex items-center justify-center rounded-md text-gray-500 hover:bg-green-100 hover:text-green-600 transition"
                                                            >
                                                                <PlusCircle className="w-5 h-5" />
                                                            </button>
 
                                                            {/* Manuel Düzenle İkonu */}
                                                            <button 
                                                                onClick={() => { setStockUpdateId(tool.id); setTempStockValue(tool.totalStock); }}
                                                                className="w-8 h-8 flex items-center justify-center rounded-md text-blue-400 hover:bg-blue-100 hover:text-blue-600 transition ml-1"
                                                                title="Stok Adedini Elle Düzelt (Sayım)"
                                                            >
                                                                <Edit3 className="w-4 h-4" />
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </td>

                                            <td className="px-6 py-4 whitespace-nowrap text-right">
                                                <div className="flex items-center justify-end gap-2.5">
                                                    <button 
                                                        onClick={() => setAddStockModal({ isOpen: true, tool: tool, quantity: '1' })}
                                                        className={`px-3 py-1.5 text-xs font-bold text-white rounded-lg shadow-md hover:-translate-y-0.5 transform active:scale-95 transition-all flex items-center gap-1 ${isUsed ? 'bg-orange-600 hover:bg-orange-700' : 'bg-blue-600 hover:bg-blue-700'}`}
                                                        title="Yeni Satın Alma / Stok Ekle"
                                                    >
                                                        <PlusCircle className="w-3.5 h-3.5" /> Stok Ekle
                                                    </button>
                                                    <button 
                                                        onClick={() => openEditModal(tool)}
                                                        className="p-1.5 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 rounded-lg transition"
                                                        title="Parçayı Düzenle"
                                                    >
                                                        <Edit className="w-4 h-4" />
                                                    </button>
                                                    <button 
                                                        onClick={() => handleDeleteTool(tool.id)}
                                                        className="p-1.5 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-100 rounded-lg transition"
                                                        title="Parçayı Sil"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
                
                {/* YENİ: PAGİNATİON KONTROLLERİ */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-between border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 sm:px-6">
                        <div className="flex flex-1 justify-between sm:hidden">
                            <button
                                disabled={currentPage === 1}
                                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                className="relative inline-flex items-center rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-4 py-2 text-sm font-medium text-gray-750 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50"
                            >
                                Önceki
                            </button>
                            <button
                                disabled={currentPage === totalPages}
                                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                                className="relative ml-3 inline-flex items-center rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-4 py-2 text-sm font-medium text-gray-750 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50"
                            >
                                Sonraki
                            </button>
                        </div>
                        <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
                            <div>
                                <p className="text-sm text-gray-700 dark:text-gray-300 font-semibold">
                                    Toplam <span className="font-extrabold text-blue-600 dark:text-blue-400">{filteredTools.length}</span> kayıttan{' '}
                                    <span className="font-extrabold">{(currentPage - 1) * itemsPerPage + 1}</span> ile{' '}
                                    <span className="font-extrabold">{Math.min(currentPage * itemsPerPage, filteredTools.length)}</span> arası gösteriliyor.
                                </p>
                            </div>
                            <div>
                                <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
                                    <button
                                        disabled={currentPage === 1}
                                        onClick={() => setCurrentPage(1)}
                                        className="relative inline-flex items-center rounded-l-md px-3 py-2 text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-30 text-xs font-bold"
                                    >
                                        İlk
                                    </button>
                                    <button
                                        disabled={currentPage === 1}
                                        onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                        className="relative inline-flex items-center px-3 py-2 text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-30 text-xs font-bold"
                                    >
                                        Geri
                                    </button>
                                    <span className="relative inline-flex items-center px-4 py-2 text-sm font-bold text-gray-900 dark:text-white bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800">
                                        {currentPage} / {totalPages}
                                    </span>
                                    <button
                                        disabled={currentPage === totalPages}
                                        onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                                        className="relative inline-flex items-center px-3 py-2 text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-30 text-xs font-bold"
                                    >
                                        İleri
                                    </button>
                                    <button
                                        disabled={currentPage === totalPages}
                                        onClick={() => setCurrentPage(totalPages)}
                                        className="relative inline-flex items-center rounded-r-md px-3 py-2 text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-30 text-xs font-bold"
                                    >
                                        Son
                                    </button>
                                </nav>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* --- MODAL: PARÇA EKLE / DÜZENLE --- */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
                    <div className={`bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border-2 animate-in fade-in zoom-in duration-200 ${formData.condition === 'USED' ? 'border-orange-500' : 'border-blue-500 dark:border-blue-600'}`}>
                        <div className={`px-6 py-4 border-b flex justify-between items-center ${formData.condition === 'USED' ? 'bg-orange-50 dark:bg-orange-900/30 border-orange-200 dark:border-orange-800' : 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800'}`}>
                            <h3 className="text-xl font-bold text-gray-800 dark:text-white flex items-center">
                                {editingTool ? <Edit className="w-5 h-5 mr-2"/> : <Plus className="w-5 h-5 mr-2"/>}
                                {editingTool ? 'Parçayı Düzenle' : 'Yeni Parça Kartı'}
                            </h3>
                            <button onClick={() => setIsModalOpen(false)} className="text-gray-500 hover:text-gray-700 dark:text-gray-300 hover:bg-white/50 rounded-full p-1 transition">
                                <X className="w-6 h-6" />
                            </button>
                        </div>
                        
                        <form onSubmit={handleSaveTool} className="p-6 space-y-4">
                            <div className="flex gap-4">
                                <div className="w-1/3">
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Ürün Kodu</label>
                                    <div className="relative">
                                        <Hash className="absolute left-2 top-2.5 w-4 h-4 text-gray-400" />
                                        <input 
                                            type="text" 
                                            value={formData.productCode}
                                            onChange={(e) => setFormData({...formData, productCode: e.target.value.toUpperCase()})}
                                            className="w-full pl-8 p-2 border border-gray-300 dark:border-gray-600 rounded-lg uppercase font-mono text-sm focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                            placeholder="Örn: F-10"
                                        />
                                    </div>
                                </div>
                                <div className="flex-1">
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Parça Adı <span className="text-red-500">*</span></label>
                                    <input 
                                        type="text" required
                                        value={formData.name}
                                        onChange={(e) => setFormData({...formData, name: e.target.value})}
                                        className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                        placeholder="Örn: 10mm Karbür Freze"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Durum <span className="text-red-500">*</span></label>
                                    <select 
                                        value={formData.condition}
                                        onChange={(e) => setFormData({...formData, condition: e.target.value})}
                                        className={`w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 font-bold ${formData.condition === 'USED' ? 'text-orange-600 focus:ring-orange-500' : 'text-blue-600 focus:ring-blue-500'}`}
                                        required
                                    >
                                        <option value="NEW">Sıfır (Yeni)</option>
                                        <option value="USED">Kullanılmış</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Kategori <span className="text-red-500">*</span></label>
                                    <select 
                                        value={formData.category}
                                        onChange={(e) => setFormData({...formData, category: e.target.value})}
                                        className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                                        required
                                    >
                                        <option value="" disabled>Seçiniz</option>
                                        {categories.map(cat => (
                                            <option key={cat.id} value={cat.name}>{cat.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Kritik Sınır</label>
                                    <input 
                                        type="number" min="0"
                                        value={formData.criticalStock}
                                        onChange={(e) => setFormData({...formData, criticalStock: e.target.value})}
                                        className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    />
                                </div>
                            </div>

                            <div className="bg-gray-50 dark:bg-gray-900/50 p-3 rounded-lg border border-gray-200 dark:border-gray-700">
                                <label className="block text-sm font-bold text-gray-800 dark:text-gray-200 mb-1">Stok Adedi</label>
                                <div className="relative">
                                    <input 
                                        type="number" min="0" required 
                                        value={formData.totalStock} 
                                        onChange={(e) => setFormData({...formData, totalStock: e.target.value})} 
                                        className="w-full p-3 pl-4 border border-gray-300 dark:border-gray-600 rounded-lg font-bold text-lg text-blue-600 dark:text-blue-400 focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" 
                                    />
                                    <div className="absolute right-3 top-3.5 text-sm text-gray-400 font-semibold">Adet (Devir / Sayım Girişi)</div>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Açıklama (Opsiyonel)</label>
                                <textarea 
                                    rows="2"
                                    value={formData.description}
                                    onChange={(e) => setFormData({...formData, description: e.target.value})}
                                    className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    placeholder="Teknik detaylar, marka vb..."
                                ></textarea>
                            </div>

                            <div className="pt-4 flex justify-end gap-3 border-t mt-4 border-gray-200 dark:border-gray-600">
                                <button 
                                    type="button" 
                                    onClick={() => setIsModalOpen(false)}
                                    className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg font-medium transition"
                                >
                                    İptal
                                </button>
                                <button 
                                    type="submit"
                                    className={`px-6 py-2 text-white rounded-lg font-bold shadow-md transition transform hover:-translate-y-0.5 ${formData.condition === 'USED' ? 'bg-orange-600 hover:bg-orange-700' : 'bg-blue-600 hover:bg-blue-700'}`}
                                >
                                    {editingTool ? 'Güncelle' : 'Kaydet'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* --- MODAL: KATEGORİ YÖNETİMİ --- */}
            {isCategoryManagerOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
                        <div className="bg-gray-100 dark:bg-gray-700 px-4 py-3 border-b border-gray-200 dark:border-gray-600 flex justify-between items-center">
                            <h3 className="font-bold text-lg text-gray-900 dark:text-white">Kategorileri Yönet</h3>
                            <button onClick={() => setIsCategoryManagerOpen(false)} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white">
                                <X className="w-5 h-5"/>
                            </button>
                        </div>
                        
                        <div className="p-4 bg-white dark:bg-gray-800">
                            <div className="flex gap-2 mb-4">
                                <input 
                                    type="text" 
                                    className="flex-1 border border-gray-300 dark:border-gray-600 p-2 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                    placeholder="Yeni kategori adı..."
                                    value={newCatName}
                                    onChange={(e) => setNewCatName(e.target.value)}
                                    onKeyDown={(e) => {if(e.key==='Enter') handleAddCategory()}}
                                />
                                <button 
                                    onClick={handleAddCategory} 
                                    className="bg-green-600 text-white px-4 rounded-lg font-bold hover:bg-green-700 transition shadow-sm"
                                >
                                    Ekle
                                </button>
                            </div>

                            <div className="max-h-60 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg divide-y divide-gray-100 dark:divide-gray-700 custom-scrollbar">
                                {categories.map(cat => (
                                    <div key={cat.id} className="p-3 flex justify-between items-center hover:bg-gray-50 dark:hover:bg-gray-700/50 transition">
                                        {editingCategoryId === cat.id ? (
                                            <div className="flex items-center gap-2 w-full">
                                                <input 
                                                    type="text" 
                                                    className="flex-1 p-1 border rounded text-sm dark:bg-gray-600 dark:text-white"
                                                    value={editingCategoryName}
                                                    onChange={(e) => setEditingCategoryName(e.target.value)}
                                                    autoFocus
                                                />
                                                <button onClick={saveEditingCategory} className="text-green-600 hover:bg-green-100 p-1 rounded"><Check className="w-4 h-4"/></button>
                                                <button onClick={() => setEditingCategoryId(null)} className="text-red-600 hover:bg-red-100 p-1 rounded"><X className="w-4 h-4"/></button>
                                            </div>
                                        ) : (
                                            <>
                                                <span className="font-medium text-gray-800 dark:text-gray-200">{cat.name}</span>
                                                <div className="flex gap-1">
                                                    <button 
                                                        onClick={() => startEditingCategory(cat)}
                                                        className="text-blue-500 hover:text-blue-700 dark:hover:text-blue-400 p-1 rounded-full hover:bg-blue-50 dark:hover:bg-blue-900/30 transition"
                                                    >
                                                        <Edit3 className="w-4 h-4" />
                                                    </button>
                                                    <button 
                                                        onClick={() => handleDeleteCategory(cat.id)} 
                                                        className="text-red-500 hover:text-red-700 dark:hover:text-red-400 p-1 rounded-full hover:bg-red-50 dark:hover:bg-red-900/30 transition"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                ))}
                                {categories.length === 0 && (
                                    <div className="p-4 text-center text-gray-500 dark:text-gray-400 text-sm">
                                        Henüz kategori eklenmemiş.
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* --- MODAL: DİNAMİK STOK EKLEME --- */}
            {addStockModal.isOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-in fade-in zoom-in duration-200">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col">
                        <div className="bg-blue-600 dark:bg-blue-700 p-5 flex justify-between items-center text-white shrink-0">
                            <h3 className="text-lg font-bold flex items-center gap-2"><PlusCircle className="w-5 h-5" /> Stok Ekleme (Satın Alma)</h3>
                            <button onClick={() => setAddStockModal({ isOpen: false, tool: null, quantity: '1' })} className="hover:bg-white/20 p-1.5 rounded-lg transition"><X className="w-5 h-5" /></button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-100 dark:border-blue-800/50">
                                <span className="block text-xs font-bold text-blue-600 dark:text-blue-400 mb-1 uppercase tracking-wider">Seçilen Parça</span>
                                <div className="text-md font-bold text-gray-900 dark:text-white">{addStockModal.tool?.name}</div>
                                {addStockModal.tool?.productCode && <div className="text-xs font-mono text-gray-500 dark:text-gray-400 mt-1">Kod: {addStockModal.tool?.productCode}</div>}
                                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Mevcut Stok: <strong className="text-gray-950 dark:text-white">{addStockModal.tool?.totalStock} Adet</strong></div>
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Eklenecek Adet</label>
                                <div className="relative">
                                    <input 
                                        type="number" 
                                        min="1" 
                                        className="w-full p-3.5 pl-4 pr-16 border border-gray-300 dark:border-gray-600 rounded-xl font-bold text-xl text-blue-600 dark:text-blue-400 bg-gray-50 dark:bg-gray-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                        value={addStockModal.quantity}
                                        onChange={(e) => setAddStockModal({ ...addStockModal, quantity: e.target.value })}
                                        onKeyDown={(e) => { if(e.key === 'Enter') handleConfirmAddStock() }}
                                        autoFocus
                                    />
                                    <span className="absolute right-4 top-4 text-sm font-bold text-gray-400">Adet</span>
                                </div>
                            </div>

                            <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                                <button 
                                    type="button" 
                                    onClick={() => setAddStockModal({ isOpen: false, tool: null, quantity: '1' })}
                                    className="flex-1 py-3 text-sm font-semibold bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-xl transition text-gray-800 dark:text-gray-200"
                                >
                                    İptal
                                </button>
                                <button 
                                    type="button" 
                                    onClick={handleConfirmAddStock}
                                    className="flex-1 py-3 text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-lg transition transform active:scale-95 flex items-center justify-center gap-1.5"
                                >
                                    <Check className="w-4 h-4" /> Stok Ekle
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {/* --- MODAL: TAKIM HURDAYA AYIRMA --- */}
            {scrapModal.isOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-in fade-in zoom-in duration-200">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col">
                        <div className="bg-red-600 dark:bg-red-700 p-5 flex justify-between items-center text-white shrink-0">
                            <h3 className="text-lg font-bold flex items-center gap-2"><Trash2 className="w-5 h-5" /> Takım Hurdaya Ayırma</h3>
                            <button onClick={() => setScrapModal({ isOpen: false, tool: null, quantity: '1', reason: 'WEAR', notes: '' })} className="hover:bg-white/20 p-1.5 rounded-lg transition"><X className="w-5 h-5" /></button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-xl border border-red-100 dark:border-red-800/50">
                                <span className="block text-xs font-bold text-red-600 dark:text-red-400 mb-1 uppercase tracking-wider">Seçilen Parça</span>
                                <div className="text-md font-bold text-gray-900 dark:text-white">{scrapModal.tool?.name}</div>
                                {scrapModal.tool?.productCode && <div className="text-xs font-mono text-gray-500 dark:text-gray-400 mt-1">Kod: {scrapModal.tool?.productCode}</div>}
                                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Mevcut Stok: <strong className="text-gray-950 dark:text-white">{scrapModal.tool?.totalStock} Adet</strong></div>
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Hurdaya Ayrılacak Adet</label>
                                <div className="relative">
                                    <input 
                                        type="number" 
                                        min="1" 
                                        max={scrapModal.tool?.totalStock || 1}
                                        className="w-full p-3.5 pl-4 pr-16 border border-gray-300 dark:border-gray-600 rounded-xl font-bold text-xl text-red-600 dark:text-red-400 bg-gray-50 dark:bg-gray-900 focus:ring-2 focus:ring-red-500 focus:outline-none"
                                        value={scrapModal.quantity}
                                        onChange={(e) => setScrapModal({ ...scrapModal, quantity: e.target.value })}
                                        autoFocus
                                    />
                                    <span className="absolute right-4 top-4 text-sm font-bold text-gray-400">Adet</span>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Hurdaya Ayrılma Nedeni</label>
                                <select 
                                    className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-xl text-sm dark:bg-gray-950 dark:text-white font-semibold"
                                    value={scrapModal.reason}
                                    onChange={(e) => setScrapModal({ ...scrapModal, reason: e.target.value })}
                                >
                                    <option value="WEAR">Ömrünü Tamamladı (Doğal Aşınma)</option>
                                    <option value="DAMAGE">Kırılma / Hata / Hasar</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Açıklama (İsteğe Bağlı)</label>
                                <textarea 
                                    placeholder="Hurdaya ayırma detaylarını buraya girebilirsiniz..."
                                    className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-xl text-sm dark:bg-gray-950 dark:text-white h-20 resize-none"
                                    value={scrapModal.notes}
                                    onChange={(e) => setScrapModal({ ...scrapModal, notes: e.target.value })}
                                />
                            </div>

                            <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                                <button 
                                    type="button" 
                                    onClick={() => setScrapModal({ isOpen: false, tool: null, quantity: '1', reason: 'WEAR', notes: '' })}
                                    className="flex-1 py-3 text-sm font-semibold bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-xl transition text-gray-800 dark:text-gray-200"
                                >
                                    İptal
                                </button>
                                <button 
                                    type="button" 
                                    onClick={handleConfirmScrap}
                                    className="flex-1 py-3 text-sm font-bold bg-red-600 hover:bg-red-700 text-white rounded-xl shadow-lg transition transform active:scale-95 flex items-center justify-center gap-1.5"
                                >
                                    <Check className="w-4 h-4" /> Hurdaya Ayır
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};

export default ToolInventoryPage;