// src/pages/ToolInventoryPage.js

import React, { useState, useMemo, useEffect } from 'react';
import { 
    Package, Plus, Search, Filter, AlertTriangle, 
    Trash2, Edit, Save, X, PlusCircle, MinusCircle, 
    Grid, List, Settings, Edit3, Hash, CheckSquare // EKLENDİ: CheckSquare ikonu
} from 'lucide-react';
import { 
    addDoc, collection, doc, updateDoc, deleteDoc, onSnapshot, query, orderBy, setDoc
} from '../config/firebase.js';
import { 
    INVENTORY_COLLECTION, TOOL_CATEGORIES_COLLECTION,
    TOOL_TRANSACTIONS_COLLECTION, TOOL_TRANSACTION_TYPES // EKLENDİ: Loglama için gerekli sabitler
} from '../config/constants.js';
import { getCurrentDateTimeString } from '../utils/dateUtils.js';

const ToolInventoryPage = ({ tools, loggedInUser, db }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('TÜMÜ');
    
    // Kategorileri Veritabanından Çekmek İçin State
    const [categories, setCategories] = useState([]);
    const [isCategoryManagerOpen, setIsCategoryManagerOpen] = useState(false);

    // Modal Stateleri
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingTool, setEditingTool] = useState(null); // Düzenlenen parça (null ise yeni ekleme)
    
    // Manuel Stok Güncelleme
    const [stockUpdateId, setStockUpdateId] = useState(null); // Hangi satırın stoğu düzenleniyor
    const [tempStockValue, setTempStockValue] = useState('');

    // --- YENİ EKLENEN STATE: İşlem Tipi Seçimi ---
    // True = Devir/Sayım (Analize girmez), False = Satın Alma (Analize girer)
    const [isAdjustment, setIsAdjustment] = useState(false); 

    // Form State (Yeni Ekleme ve Düzenleme için)
    const [formData, setFormData] = useState({
        productCode: '',
        name: '',
        category: '',
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
            
            // Eğer hiç kategori yoksa varsayılanları yükle (İlk Kurulum)
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

    // --- 2. FİLTRELEME MANTIĞI ---
    const filteredTools = useMemo(() => {
        let result = tools || [];

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

        // Sıralama (Önce Kod, Sonra İsim)
        return result.sort((a, b) => (a.productCode || '').localeCompare(b.productCode || '') || a.name.localeCompare(b.name));
    }, [tools, searchTerm, selectedCategory]);

    // --- 3. İSTATİSTİKLER (KARTLAR İÇİN) ---
    const getCategoryCount = (catName) => {
        if (catName === 'TÜMÜ') return tools.length;
        return tools.filter(t => t.category === catName).length;
    };

    // --- YENİ: LOGLAMA FONKSİYONU ---
    // Bu fonksiyon yapılan stok değişikliğini "Satın Alma" mı yoksa "Düzeltme" mi diye ayırıp kaydeder.
    const logStockEntry = async (toolId, toolName, quantity, oldStock, newStock, isManualAdjustment = false) => {
        if (quantity === 0) return; 

        // İşlem Tipini Belirle
        let type = TOOL_TRANSACTION_TYPES.ADJUSTMENT; // Varsayılan: Düzeltme

        if (quantity > 0) {
            // Artış var
            if (isManualAdjustment) {
                type = TOOL_TRANSACTION_TYPES.ADJUSTMENT; // Kullanıcı "Devir/Sayım" seçti
            } else {
                type = TOOL_TRANSACTION_TYPES.STOCK_ENTRY; // Kullanıcı seçmedi, "Satın Alma" kabul et
            }
        } else {
            // Azalış var (Manuel düşüşler genelde düzeltmedir)
            type = TOOL_TRANSACTION_TYPES.ADJUSTMENT;
        }

        try {
            await addDoc(collection(db, TOOL_TRANSACTIONS_COLLECTION), {
                type: type,
                toolName: toolName,
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

    // --- 4. CRUD İŞLEMLERİ (EKLEME / DÜZENLEME / SİLME) ---

    // Modal Açma (Yeni Ekleme)
    const openAddModal = () => {
        setEditingTool(null);
        setIsAdjustment(true); // YENİ: Yeni parça eklerken varsayılan olarak "Devir" seçili gelsin (İlk kurulum kolaylığı)
        setFormData({
            productCode: '',
            name: '',
            category: categories.length > 0 ? categories[0].name : '',
            totalStock: 0,
            criticalStock: 5,
            description: ''
        });
        setIsModalOpen(true);
    };

    // Modal Açma (Düzenleme)
    const openEditModal = (tool) => {
        setEditingTool(tool);
        setIsAdjustment(true); // YENİ: Düzenlerken de varsayılan "Devir" olsun
        setFormData({
            productCode: tool.productCode || '',
            name: tool.name,
            category: tool.category,
            totalStock: tool.totalStock,
            criticalStock: tool.criticalStock,
            description: tool.description || ''
        });
        setIsModalOpen(true);
    };

    // Kaydetme İşlemi (Hem Yeni Hem Düzenleme)
    const handleSaveTool = async (e) => {
        e.preventDefault();
        if (!formData.name || !formData.category) return alert("Ad ve Kategori zorunludur.");

        // --- DUPLICATE (AYNI KOD) KONTROLÜ ---
        const cleanCode = formData.productCode ? formData.productCode.trim().toUpperCase() : '';
        
        if (cleanCode) {
            // Bu koda sahip başka bir parça var mı?
            const duplicate = tools.find(t => t.productCode === cleanCode);
            
            // Eğer varsa VE (Yeni ekleme yapıyorsak VEYA Düzenlerken başka birinin kodunu yazdıysak)
            if (duplicate && (!editingTool || duplicate.id !== editingTool.id)) {
                return alert(`HATA: "${cleanCode}" kodu zaten stokta mevcut! Lütfen benzersiz bir kod giriniz.`);
            }
        }
        // ----------------------------------------

        try {
            const newStockVal = parseInt(formData.totalStock);
            const payload = {
                ...formData,
                productCode: cleanCode, // Temizlenmiş kodu kaydet
                totalStock: newStockVal,
                criticalStock: parseInt(formData.criticalStock),
                updatedAt: getCurrentDateTimeString(),
                updatedBy: loggedInUser.name
            };

            if (editingTool) {
                // Güncelleme
                const oldStock = parseInt(editingTool.totalStock);
                await updateDoc(doc(db, INVENTORY_COLLECTION, editingTool.id), payload);
                
                // --- LOGLAMA EKLENDİ ---
                if (newStockVal !== oldStock) {
                    await logStockEntry(editingTool.id, editingTool.name, newStockVal - oldStock, oldStock, newStockVal, isAdjustment);
                }

            } else {
                // Yeni Ekleme
                const docRef = await addDoc(collection(db, INVENTORY_COLLECTION), {
                    ...payload,
                    createdAt: getCurrentDateTimeString(),
                    createdBy: loggedInUser.name
                });
                
                // --- LOGLAMA EKLENDİ (İlk Giriş) ---
                if (newStockVal > 0) {
                    await logStockEntry(docRef.id, payload.name, newStockVal, 0, newStockVal, isAdjustment);
                }
            }
            setIsModalOpen(false); // UYARI YOK, DIREKT KAPAT
        } catch (error) {
            console.error("Kaydetme hatası:", error);
            alert("İşlem sırasında hata oluştu.");
        }
    };

    // Silme İşlemi
    const handleDeleteTool = async (id) => {
        if (window.confirm("Bu parçayı stoktan tamamen silmek istediğinize emin misiniz?")) {
            try {
                await deleteDoc(doc(db, INVENTORY_COLLECTION, id));
            } catch (error) {
                console.error("Silme hatası:", error);
            }
        }
    };

    // Hızlı Stok Güncelleme (+ / -)
    const handleQuickStockUpdate = async (tool, amount) => {
        const oldStock = parseInt(tool.totalStock);
        const newStock = oldStock + amount;
        if (newStock < 0) return;
        try {
            await updateDoc(doc(db, INVENTORY_COLLECTION, tool.id), { totalStock: newStock });
            
            // --- LOGLAMA EKLENDİ ---
            // + Butonu "Satın Alma" (isAdjustment=false), - Butonu "Düzeltme" (isAdjustment=true)
            const isManual = amount < 0; 
            await logStockEntry(tool.id, tool.name, amount, oldStock, newStock, isManual);

        } catch (error) {
            console.error("Stok güncelleme hatası:", error);
        }
    };

    // Manuel Stok Girişi (Input ile)
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
            
            // --- LOGLAMA EKLENDİ ---
            // Kullanıcının seçtiği isAdjustment değerini kullan
            await logStockEntry(tool.id, tool.name, diff, oldStock, val, isAdjustment);

            setStockUpdateId(null);
            setTempStockValue('');
        } catch (error) {
            console.error("Stok ayar hatası:", error);
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

    return (
        <div className="p-6 max-w-7xl mx-auto min-h-screen bg-gray-50 dark:bg-gray-900">
            
            {/* 1. ÜST PANEL: BAŞLIK & İŞLEMLER */}
            <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
                <div>
                    <h1 className="text-3xl font-extrabold text-gray-900 dark:text-white flex items-center gap-3">
                        <Package className="w-8 h-8 text-blue-600" />
                        Depo & Stok Yönetimi
                    </h1>
                    <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">
                        Toplam {tools.length} parça kayıtlı.
                    </p>
                </div>
                
                <div className="flex gap-3">
                    <button 
                        onClick={() => setIsCategoryManagerOpen(true)}
                        className="bg-gray-100 hover:bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 px-4 py-2 rounded-lg font-semibold flex items-center transition border border-gray-200 dark:border-gray-600"
                    >
                        <Settings className="w-5 h-5 mr-2" /> Kategorileri Yönet
                    </button>
                    <button 
                        onClick={openAddModal}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg font-bold flex items-center shadow-lg transition transform hover:-translate-y-0.5"
                    >
                        <Plus className="w-5 h-5 mr-2" /> Yeni Parça Ekle
                    </button>
                </div>
            </div>

            {/* 2. KATEGORİ KARTLARI (GRID) */}
            <div className="mb-8 overflow-x-auto pb-2">
                <div className="flex gap-4 min-w-max">
                    {/* Tümü Kartı */}
                    <button
                        onClick={() => setSelectedCategory('TÜMÜ')}
                        className={`min-w-[140px] p-4 rounded-xl border-2 transition-all text-left flex flex-col justify-between h-24 shadow-sm ${
                            selectedCategory === 'TÜMÜ'
                                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 ring-2 ring-blue-200'
                                : 'border-white bg-white dark:bg-gray-800 dark:border-gray-700 hover:border-blue-300'
                        }`}
                    >
                        <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">TOPLAM</span>
                        <div className="flex justify-between items-end">
                            <span className="font-bold text-gray-800 dark:text-white truncate">TÜMÜ</span>
                            <span className="bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs px-2 py-1 rounded-full font-bold">
                                {tools.length}
                            </span>
                        </div>
                    </button>

                    {/* Dinamik Kategoriler */}
                    {categories.map(cat => (
                        <button
                            key={cat.id}
                            onClick={() => setSelectedCategory(cat.name)}
                            className={`min-w-[140px] p-4 rounded-xl border-2 transition-all text-left flex flex-col justify-between h-24 shadow-sm ${
                                selectedCategory === cat.name
                                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 ring-2 ring-blue-200'
                                    : 'border-white bg-white dark:bg-gray-800 dark:border-gray-700 hover:border-blue-300'
                            }`}
                        >
                            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">KATEGORİ</span>
                            <div className="flex justify-between items-end">
                                <span className="font-bold text-gray-800 dark:text-white truncate max-w-[80px]" title={cat.name}>{cat.name}</span>
                                <span className={`text-xs px-2 py-1 rounded-full font-bold ${
                                    getCategoryCount(cat.name) > 0 ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-500'
                                }`}>
                                    {getCategoryCount(cat.name)}
                                </span>
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            {/* 3. ARAMA VE LİSTE */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                {/* Arama Barı */}
                <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
                    <div className="relative max-w-md">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                        <input 
                            type="text" 
                            placeholder="Parça adı, kodu veya açıklama ara..." 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        />
                    </div>
                </div>

                {/* Tablo */}
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-900">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider w-24">Durum</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider w-32">Kod</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Parça Adı</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Kategori</th>
                                <th className="px-6 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider w-48">Mevcut Stok</th>
                                <th className="px-6 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider w-32">İşlemler</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                            {filteredTools.length === 0 ? (
                                <tr>
                                    <td colSpan="6" className="px-6 py-10 text-center text-gray-500 dark:text-gray-400 flex flex-col items-center justify-center">
                                        <Package className="w-12 h-12 mb-3 opacity-20" />
                                        <p>Kayıt bulunamadı veya filtre kriterlerine uymuyor.</p>
                                    </td>
                                </tr>
                            ) : (
                                filteredTools.map((tool) => {
                                    const isCritical = tool.totalStock <= tool.criticalStock;
                                    return (
                                        <tr key={tool.id} className="hover:bg-blue-50 dark:hover:bg-gray-700/50 transition group">
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
                                                <div className="text-sm font-mono font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2 py-1 rounded inline-block">
                                                    {tool.productCode || '-'}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="text-sm font-bold text-gray-900 dark:text-white">{tool.name}</div>
                                                {tool.description && <div className="text-xs text-gray-500 truncate max-w-xs">{tool.description}</div>}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className="px-2 py-1 rounded text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600">
                                                    {tool.category}
                                                </span>
                                            </td>
                                            
                                            {/* STOK YÖNETİM HÜCRESİ */}
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="flex items-center justify-center gap-2 bg-gray-50 dark:bg-gray-900/50 p-1 rounded-lg border border-gray-200 dark:border-gray-700 relative">
                                                    {stockUpdateId === tool.id ? (
                                                        <div className="flex flex-col items-center p-2 bg-white dark:bg-gray-800 rounded shadow-lg absolute z-10 border border-blue-200 -top-8">
                                                            <div className="flex items-center mb-2">
                                                                <input 
                                                                    type="number" 
                                                                    className="w-20 p-1 text-center text-sm border rounded focus:ring-2 focus:ring-blue-500 text-gray-900"
                                                                    value={tempStockValue}
                                                                    onChange={(e) => setTempStockValue(e.target.value)}
                                                                    onKeyDown={(e) => { if(e.key === 'Enter') handleManualStockSave(tool.id) }}
                                                                    autoFocus
                                                                />
                                                                <button onClick={() => handleManualStockSave(tool.id)} className="ml-1 text-green-600 hover:bg-green-100 p-1 rounded"><Save className="w-4 h-4"/></button>
                                                                <button onClick={() => {setStockUpdateId(null); setIsAdjustment(false);}} className="ml-1 text-red-600 hover:bg-red-100 p-1 rounded"><X className="w-4 h-4"/></button>
                                                            </div>
                                                            {/* YENİ EKLENDİ: Devir/Sayım Seçimi */}
                                                            <label className="flex items-center space-x-2 cursor-pointer text-xs text-gray-600 dark:text-gray-300 select-none">
                                                                <div onClick={() => setIsAdjustment(!isAdjustment)} className={`w-4 h-4 border rounded flex items-center justify-center ${isAdjustment ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-400'}`}>
                                                                    {isAdjustment && <CheckSquare className="w-3 h-3" />}
                                                                </div>
                                                                <span>Devir/Sayım (Analize Yansımaz)</span>
                                                            </label>
                                                        </div>
                                                    ) : (
                                                        <>
                                                            <button 
                                                                onClick={() => handleQuickStockUpdate(tool, -1)}
                                                                className="w-8 h-8 flex items-center justify-center rounded-md text-gray-500 hover:bg-red-100 hover:text-red-600 transition"
                                                            >
                                                                <MinusCircle className="w-5 h-5" />
                                                            </button>
                                                            
                                                            <span className={`text-lg font-bold w-12 text-center cursor-pointer hover:underline ${isCritical ? 'text-red-600' : 'text-gray-800 dark:text-white'}`}
                                                                  onClick={() => { setStockUpdateId(tool.id); setTempStockValue(tool.totalStock); setIsAdjustment(true); }}
                                                                  title="Tıkla ve elle düzenle"
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
                                                                onClick={() => { setStockUpdateId(tool.id); setTempStockValue(tool.totalStock); setIsAdjustment(true); }}
                                                                className="w-8 h-8 flex items-center justify-center rounded-md text-blue-400 hover:bg-blue-100 hover:text-blue-600 transition ml-1"
                                                                title="Stok Adedini Elle Gir"
                                                            >
                                                                <Edit3 className="w-4 h-4" />
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </td>

                                            <td className="px-6 py-4 whitespace-nowrap text-right">
                                                <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button 
                                                        onClick={() => openEditModal(tool)}
                                                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition"
                                                        title="Parçayı Düzenle"
                                                    >
                                                        <Edit className="w-5 h-5" />
                                                    </button>
                                                    <button 
                                                        onClick={() => handleDeleteTool(tool.id)}
                                                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition"
                                                        title="Parçayı Sil"
                                                    >
                                                        <Trash2 className="w-5 h-5" />
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
            </div>

            {/* --- MODAL: PARÇA EKLE / DÜZENLE --- */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-gray-200 dark:border-gray-700 animate-in fade-in zoom-in duration-200">
                        <div className="bg-gray-50 dark:bg-gray-700 px-6 py-4 border-b border-gray-200 dark:border-gray-600 flex justify-between items-center">
                            <h3 className="text-xl font-bold text-gray-800 dark:text-white flex items-center">
                                {editingTool ? <Edit className="w-5 h-5 mr-2"/> : <Plus className="w-5 h-5 mr-2"/>}
                                {editingTool ? 'Parçayı Düzenle' : 'Yeni Parça Kartı'}
                            </h3>
                            <button onClick={() => setIsModalOpen(false)} className="text-gray-500 hover:text-gray-700 dark:text-gray-300 hover:bg-gray-200 rounded-full p-1">
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

                            <div className="grid grid-cols-2 gap-4">
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

                            {/* YENİ EKLENDİ: STOK VE DEVİR SEÇİMİ */}
                            <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg border border-blue-100 dark:border-blue-800">
                                <label className="block text-sm font-bold text-gray-800 dark:text-gray-200 mb-1">Stok Adedi</label>
                                <div className="flex items-center gap-4">
                                    <div className="relative flex-1">
                                        <input 
                                            type="number" min="0" required 
                                            value={formData.totalStock} 
                                            onChange={(e) => setFormData({...formData, totalStock: e.target.value})} 
                                            className="w-full p-3 pl-4 border border-gray-300 dark:border-gray-600 rounded-lg font-bold text-lg text-blue-600 dark:text-blue-400 focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700" 
                                        />
                                        <div className="absolute right-3 top-3 text-sm text-gray-400">Adet</div>
                                    </div>
                                    
                                    <div className="flex flex-col justify-center">
                                        <label className="flex items-center space-x-2 cursor-pointer select-none">
                                            <div onClick={() => setIsAdjustment(!isAdjustment)} className={`w-5 h-5 border-2 rounded transition flex items-center justify-center ${isAdjustment ? 'bg-blue-600 border-blue-600' : 'bg-white border-gray-400'}`}>
                                                {isAdjustment && <CheckSquare className="w-4 h-4 text-white" />}
                                            </div>
                                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                                Devir / Sayım <br/> <span className="text-xs text-gray-500">(Analize Yansımaz)</span>
                                            </span>
                                        </label>
                                    </div>
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
                                    className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold shadow-md transition transform hover:-translate-y-0.5"
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

                            <div className="max-h-60 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg divide-y divide-gray-100 dark:divide-gray-700">
                                {categories.map(cat => (
                                    <div key={cat.id} className="p-3 flex justify-between items-center hover:bg-gray-50 dark:hover:bg-gray-700/50 transition">
                                        <span className="font-medium text-gray-800 dark:text-gray-200">{cat.name}</span>
                                        <button 
                                            onClick={() => handleDeleteCategory(cat.id)} 
                                            className="text-red-500 hover:text-red-700 dark:hover:text-red-400 p-1 rounded-full hover:bg-red-50 dark:hover:bg-red-900/30 transition"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
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

        </div>
    );
};

export default ToolInventoryPage;