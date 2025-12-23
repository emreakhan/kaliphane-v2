// src/pages/ToolInventoryPage.js

import React, { useState, useMemo } from 'react';
import { 
    Package, Plus, Search, Filter, AlertTriangle, 
    Trash2, Edit, Save, X, PlusCircle, MinusCircle 
} from 'lucide-react';
import { 
    addDoc, collection, doc, updateDoc, deleteDoc 
} from '../config/firebase.js';
import { 
    INVENTORY_COLLECTION, TOOL_CATEGORIES 
} from '../config/constants.js';
import { getCurrentDateTimeString } from '../utils/dateUtils.js';

const ToolInventoryPage = ({ tools, loggedInUser, db }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('ALL');
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    
    // Yeni Takım Ekleme State'i
    const [newTool, setNewTool] = useState({
        name: '',
        category: TOOL_CATEGORIES.FREZE,
        totalStock: 0,
        criticalStock: 5,
        location: '', // Raf numarası vb.
        description: ''
    });

    // Filtreleme Mantığı
    const filteredTools = useMemo(() => {
        let result = tools || [];

        if (categoryFilter !== 'ALL') {
            result = result.filter(t => t.category === categoryFilter);
        }

        if (searchTerm) {
            const lowerTerm = searchTerm.toLowerCase();
            result = result.filter(t => 
                t.name.toLowerCase().includes(lowerTerm) || 
                (t.description && t.description.toLowerCase().includes(lowerTerm))
            );
        }

        // İsme göre sırala
        return result.sort((a, b) => a.name.localeCompare(b.name));
    }, [tools, searchTerm, categoryFilter]);

    // İstatistikler
    const stats = useMemo(() => {
        const totalItems = filteredTools.length;
        const criticalItems = filteredTools.filter(t => t.totalStock <= t.criticalStock).length;
        const totalStockCount = filteredTools.reduce((acc, curr) => acc + parseInt(curr.totalStock || 0), 0);
        return { totalItems, criticalItems, totalStockCount };
    }, [filteredTools]);

    // --- FONKSİYONLAR ---

    const handleAddTool = async (e) => {
        e.preventDefault();
        if (!newTool.name) return alert("Takım adı zorunludur.");

        try {
            await addDoc(collection(db, INVENTORY_COLLECTION), {
                ...newTool,
                totalStock: parseInt(newTool.totalStock),
                criticalStock: parseInt(newTool.criticalStock),
                createdAt: getCurrentDateTimeString(),
                createdBy: loggedInUser.name
            });
            setIsAddModalOpen(false);
            setNewTool({
                name: '',
                category: TOOL_CATEGORIES.FREZE,
                totalStock: 0,
                criticalStock: 5,
                location: '',
                description: ''
            });
            alert("Yeni takım stoğa eklendi.");
        } catch (error) {
            console.error("Ekleme hatası:", error);
            alert("Hata oluştu.");
        }
    };

    const handleDeleteTool = async (id) => {
        if (window.confirm("Bu takımı stoktan silmek istediğinize emin misiniz?")) {
            try {
                await deleteDoc(doc(db, INVENTORY_COLLECTION, id));
            } catch (error) {
                console.error("Silme hatası:", error);
            }
        }
    };

    const handleQuickStockUpdate = async (tool, amount) => {
        const newStock = parseInt(tool.totalStock) + amount;
        if (newStock < 0) return;

        try {
            const toolRef = doc(db, INVENTORY_COLLECTION, tool.id);
            await updateDoc(toolRef, { totalStock: newStock });
        } catch (error) {
            console.error("Stok güncelleme hatası:", error);
        }
    };

    return (
        <div className="p-6 max-w-7xl mx-auto">
            {/* ÜST BAŞLIK VE İSTATİSTİKLER */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center">
                        <Package className="w-8 h-8 mr-3 text-blue-600" />
                        Depo & Stok Yönetimi
                    </h1>
                    <p className="text-gray-500 dark:text-gray-400 mt-1">
                        Takımhane envanterini buradan yönetebilirsiniz.
                    </p>
                </div>
                
                <div className="flex gap-4">
                    <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg flex items-center shadow-sm">
                        <AlertTriangle className="w-5 h-5 mr-2" />
                        <div>
                            <span className="block text-xs font-bold uppercase">Kritik Stok</span>
                            <span className="text-xl font-bold">{stats.criticalItems}</span>
                        </div>
                    </div>
                    <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-2 rounded-lg shadow-sm">
                        <span className="block text-xs font-bold uppercase">Toplam Çeşit</span>
                        <span className="text-xl font-bold">{stats.totalItems}</span>
                    </div>
                </div>
            </div>

            {/* FİLTRE VE EKLEME BUTONU */}
            <div className="flex flex-col md:flex-row gap-4 mb-6 bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <input 
                        type="text" 
                        placeholder="Takım adı veya özellik ara..." 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                    />
                </div>
                
                <div className="w-full md:w-64 relative">
                    <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <select 
                        value={categoryFilter}
                        onChange={(e) => setCategoryFilter(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white appearance-none cursor-pointer focus:ring-2 focus:ring-blue-500"
                    >
                        <option value="ALL">Tüm Kategoriler</option>
                        {Object.values(TOOL_CATEGORIES).map(cat => (
                            <option key={cat} value={cat}>{cat}</option>
                        ))}
                    </select>
                </div>

                <button 
                    onClick={() => setIsAddModalOpen(true)}
                    className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg font-bold flex items-center justify-center shadow-lg transition transform hover:-translate-y-0.5"
                >
                    <Plus className="w-5 h-5 mr-2" /> Yeni Takım Ekle
                </button>
            </div>

            {/* ENVANTER TABLOSU */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden border border-gray-200 dark:border-gray-700">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-900">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Durum</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Takım Adı</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Kategori</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Konum</th>
                                <th className="px-6 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Mevcut Stok</th>
                                <th className="px-6 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">İşlem</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                            {filteredTools.length === 0 ? (
                                <tr>
                                    <td colSpan="6" className="px-6 py-10 text-center text-gray-500 dark:text-gray-400">
                                        Kayıt bulunamadı.
                                    </td>
                                </tr>
                            ) : (
                                filteredTools.map((tool) => {
                                    const isCritical = tool.totalStock <= tool.criticalStock;
                                    return (
                                        <tr key={tool.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition">
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                {isCritical ? (
                                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-800 animate-pulse">
                                                        KRİTİK
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-800">
                                                        YETERLİ
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="text-sm font-bold text-gray-900 dark:text-white">{tool.name}</div>
                                                {tool.description && <div className="text-xs text-gray-500">{tool.description}</div>}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-300">
                                                {tool.category}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-300">
                                                {tool.location || '-'}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-center">
                                                <div className="flex items-center justify-center gap-3">
                                                    <button 
                                                        onClick={() => handleQuickStockUpdate(tool, -1)}
                                                        className="text-gray-400 hover:text-red-500 transition"
                                                        title="Azalt"
                                                    >
                                                        <MinusCircle className="w-5 h-5" />
                                                    </button>
                                                    
                                                    <span className={`text-lg font-bold w-8 ${isCritical ? 'text-red-600' : 'text-gray-800 dark:text-white'}`}>
                                                        {tool.totalStock}
                                                    </span>

                                                    <button 
                                                        onClick={() => handleQuickStockUpdate(tool, 1)}
                                                        className="text-gray-400 hover:text-green-500 transition"
                                                        title="Artır"
                                                    >
                                                        <PlusCircle className="w-5 h-5" />
                                                    </button>
                                                </div>
                                                <div className="text-[10px] text-gray-400 mt-1">
                                                    Min: {tool.criticalStock}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                                <button 
                                                    onClick={() => handleDeleteTool(tool.id)}
                                                    className="text-red-600 hover:text-red-900 dark:hover:text-red-400 transition"
                                                    title="Sil"
                                                >
                                                    <Trash2 className="w-5 h-5" />
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* MODAL: YENİ TAKIM EKLEME */}
            {isAddModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-gray-200 dark:border-gray-700">
                        <div className="bg-gray-50 dark:bg-gray-700 px-6 py-4 border-b border-gray-200 dark:border-gray-600 flex justify-between items-center">
                            <h3 className="text-xl font-bold text-gray-800 dark:text-white flex items-center">
                                <Plus className="w-5 h-5 mr-2" /> Yeni Takım Kartı
                            </h3>
                            <button onClick={() => setIsAddModalOpen(false)} className="text-gray-500 hover:text-gray-700 dark:text-gray-300 dark:hover:text-white">
                                <X className="w-6 h-6" />
                            </button>
                        </div>
                        
                        <form onSubmit={handleAddTool} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Takım Adı</label>
                                <input 
                                    type="text" required
                                    value={newTool.name}
                                    onChange={(e) => setNewTool({...newTool, name: e.target.value})}
                                    className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                                    placeholder="Örn: 10mm Karbür Freze"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Kategori</label>
                                    <select 
                                        value={newTool.category}
                                        onChange={(e) => setNewTool({...newTool, category: e.target.value})}
                                        className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    >
                                        {Object.values(TOOL_CATEGORIES).map(cat => (
                                            <option key={cat} value={cat}>{cat}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Raf / Konum</label>
                                    <input 
                                        type="text"
                                        value={newTool.location}
                                        onChange={(e) => setNewTool({...newTool, location: e.target.value})}
                                        className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                        placeholder="Örn: A-01"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Başlangıç Stoğu</label>
                                    <input 
                                        type="number" min="0" required
                                        value={newTool.totalStock}
                                        onChange={(e) => setNewTool({...newTool, totalStock: e.target.value})}
                                        className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-bold"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Kritik Stok Uyarısı</label>
                                    <input 
                                        type="number" min="1" required
                                        value={newTool.criticalStock}
                                        onChange={(e) => setNewTool({...newTool, criticalStock: e.target.value})}
                                        className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white border-red-200"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Açıklama (Opsiyonel)</label>
                                <textarea 
                                    rows="2"
                                    value={newTool.description}
                                    onChange={(e) => setNewTool({...newTool, description: e.target.value})}
                                    className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                    placeholder="Teknik özellikler vb..."
                                ></textarea>
                            </div>

                            <div className="pt-4 flex justify-end gap-3">
                                <button 
                                    type="button" 
                                    onClick={() => setIsAddModalOpen(false)}
                                    className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition"
                                >
                                    İptal
                                </button>
                                <button 
                                    type="submit"
                                    className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold shadow-md transition transform hover:-translate-y-0.5"
                                >
                                    Kaydet
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ToolInventoryPage;