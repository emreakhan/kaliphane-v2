// src/pages/ToolAnalysisPage.js

import React, { useState, useEffect, useMemo } from 'react';
import { 
    BarChart2, AlertTriangle, Users, TrendingUp, 
    Copy, CheckCircle, Package
} from 'lucide-react';
import { collection, query, getDocs, onSnapshot } from '../config/firebase.js';
import { 
    INVENTORY_COLLECTION, TOOL_TRANSACTIONS_COLLECTION, TOOL_TRANSACTION_TYPES 
} from '../config/constants.js';

const ToolAnalysisPage = ({ db }) => {
    const [activeTab, setActiveTab] = useState('CRITICAL'); // Tabs: CRITICAL, USAGE, OPERATORS
    const [inventory, setInventory] = useState([]);
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(true);

    // --- VERİLERİ ÇEK ---
    useEffect(() => {
        if (!db) return;

        // 1. Stok Verisi (Anlık Dinlenir)
        const unsubInventory = onSnapshot(collection(db, INVENTORY_COLLECTION), (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setInventory(data);
        });

        // 2. İşlem Geçmişi (Tek Seferlik Çekim - Analiz İçin)
        const fetchHistory = async () => {
            const q = query(collection(db, TOOL_TRANSACTIONS_COLLECTION));
            const snapshot = await getDocs(q);
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setTransactions(data);
            setLoading(false);
        };

        fetchHistory();

        return () => unsubInventory();
    }, [db]);

    // --- ANALİZ MANTIKLARI ---

    // 1. Kritik Stok Listesi
    const criticalList = useMemo(() => {
        return inventory
            .filter(item => item.totalStock <= item.criticalStock)
            .sort((a, b) => a.totalStock - b.totalStock); // En az olandan başla
    }, [inventory]);

    // 2. En Çok Kullanılan ve Hurdaya Çıkanlar
    const usageStats = useMemo(() => {
        const usageCounts = {};
        const scrapCounts = {};

        transactions.forEach(tx => {
            const name = tx.toolName;
            if (!name) return;

            // Kullanım (Verilenler)
            if (tx.type === TOOL_TRANSACTION_TYPES.ISSUE) {
                usageCounts[name] = (usageCounts[name] || 0) + (parseInt(tx.quantity) || 1);
            }
            // Hurda
            if (tx.type === TOOL_TRANSACTION_TYPES.RETURN_SCRAP) {
                scrapCounts[name] = (scrapCounts[name] || 0) + 1; // Genelde 1 adet iade olur, loga göre değişebilir
            }
        });

        // Objeyi Diziye Çevir ve Sırala (Top 10)
        const topUsed = Object.entries(usageCounts)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);

        const topScrap = Object.entries(scrapCounts)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);

        return { topUsed, topScrap };
    }, [transactions]);

    // 3. Operatör Performansı
    const operatorStats = useMemo(() => {
        const ops = {};

        transactions.forEach(tx => {
            // receiver (alan kişi) veya user (işlemi yapan) değil, receiver önemli
            const opName = tx.receiver; 
            if (!opName || opName === 'Bilinmiyor') return;

            if (!ops[opName]) ops[opName] = { name: opName, totalTaken: 0, totalScrap: 0 };

            if (tx.type === TOOL_TRANSACTION_TYPES.ISSUE) {
                ops[opName].totalTaken += (parseInt(tx.quantity) || 1);
            }
            if (tx.type === TOOL_TRANSACTION_TYPES.RETURN_SCRAP) {
                ops[opName].totalScrap += 1;
            }
        });

        return Object.values(ops).sort((a, b) => b.totalTaken - a.totalTaken);
    }, [transactions]);


    // Yardımcı: Panoya Kopyala
    const copyCriticalList = () => {
        const text = criticalList.map(i => `- ${i.name} (Kod: ${i.productCode || '-'}): Mevcut ${i.totalStock} / Kritik ${i.criticalStock}`).join('\n');
        navigator.clipboard.writeText("ACİL SİPARİŞ LİSTESİ:\n" + text);
        alert("Listesi panoya kopyalandı!");
    };

    if (loading) return <div className="p-10 text-center dark:text-white">Veriler Analiz Ediliyor...</div>;

    return (
        <div className="p-6 max-w-7xl mx-auto min-h-screen bg-gray-50 dark:bg-gray-900">
            
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center mb-6">
                <TrendingUp className="w-8 h-8 mr-3 text-indigo-600" />
                Takımhane Analiz Raporu
            </h1>

            {/* SEKME MENÜSÜ */}
            <div className="flex space-x-2 mb-6 border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
                <button
                    onClick={() => setActiveTab('CRITICAL')}
                    className={`pb-3 px-6 font-bold text-sm flex items-center whitespace-nowrap transition-colors ${
                        activeTab === 'CRITICAL' 
                        ? 'border-b-2 border-red-500 text-red-600' 
                        : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'
                    }`}
                >
                    <AlertTriangle className="w-4 h-4 mr-2" /> Kritik Stoklar ({criticalList.length})
                </button>
                <button
                    onClick={() => setActiveTab('USAGE')}
                    className={`pb-3 px-6 font-bold text-sm flex items-center whitespace-nowrap transition-colors ${
                        activeTab === 'USAGE' 
                        ? 'border-b-2 border-blue-500 text-blue-600' 
                        : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'
                    }`}
                >
                    <BarChart2 className="w-4 h-4 mr-2" /> Tüketim & Hurda Analizi
                </button>
                <button
                    onClick={() => setActiveTab('OPERATORS')}
                    className={`pb-3 px-6 font-bold text-sm flex items-center whitespace-nowrap transition-colors ${
                        activeTab === 'OPERATORS' 
                        ? 'border-b-2 border-green-500 text-green-600' 
                        : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'
                    }`}
                >
                    <Users className="w-4 h-4 mr-2" /> Operatör Durumu
                </button>
            </div>

            {/* --- SEKME 1: KRİTİK STOK --- */}
            {activeTab === 'CRITICAL' && (
                <div className="space-y-4">
                    <div className="flex justify-between items-center bg-red-50 dark:bg-red-900/20 p-4 rounded-lg border border-red-100 dark:border-red-800">
                        <div className="text-red-800 dark:text-red-200 text-sm">
                            <strong>Dikkat:</strong> Aşağıdaki {criticalList.length} kalem malzeme belirlenen kritik seviyenin altındadır.
                        </div>
                        <button 
                            onClick={copyCriticalList}
                            className="bg-white dark:bg-gray-800 text-gray-700 dark:text-white px-3 py-1.5 rounded border shadow-sm hover:bg-gray-50 text-xs font-bold flex items-center"
                        >
                            <Copy className="w-3 h-3 mr-2" /> Listeyi Kopyala
                        </button>
                    </div>

                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow border border-gray-200 dark:border-gray-700 overflow-hidden">
                        <table className="w-full text-left text-sm text-gray-600 dark:text-gray-300">
                            <thead className="bg-gray-50 dark:bg-gray-900/50 text-gray-900 dark:text-white uppercase font-bold text-xs">
                                <tr>
                                    <th className="p-4">Ürün Kodu</th>
                                    <th className="p-4">Parça Adı</th>
                                    <th className="p-4">Kategori</th>
                                    <th className="p-4 text-center">Mevcut</th>
                                    <th className="p-4 text-center">Kritik Sınır</th>
                                    <th className="p-4 text-center">Eksik</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                                {criticalList.length === 0 ? (
                                    <tr><td colSpan="6" className="p-8 text-center text-green-500 font-bold">Harika! Kritik seviyede ürün yok.</td></tr>
                                ) : (
                                    criticalList.map(item => (
                                        <tr key={item.id} className="hover:bg-red-50 dark:hover:bg-red-900/10 transition">
                                            <td className="p-4 font-mono text-xs font-bold">{item.productCode || '-'}</td>
                                            <td className="p-4 font-medium text-gray-900 dark:text-white">{item.name}</td>
                                            <td className="p-4"><span className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-xs">{item.category}</span></td>
                                            <td className="p-4 text-center font-bold text-red-600">{item.totalStock}</td>
                                            <td className="p-4 text-center text-gray-500">{item.criticalStock}</td>
                                            <td className="p-4 text-center font-bold text-gray-800 dark:text-white">
                                                {item.criticalStock - item.totalStock} Adet
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* --- SEKME 2: TÜKETİM ANALİZİ (GRAFİKSEL) --- */}
            {activeTab === 'USAGE' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* En Çok Kullanılanlar */}
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow border border-gray-200 dark:border-gray-700">
                        <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-4 flex items-center">
                            <CheckCircle className="w-5 h-5 mr-2 text-blue-500" /> En Çok Kullanılan 10 Takım
                        </h3>
                        <div className="space-y-4">
                            {usageStats.topUsed.map((item, idx) => {
                                const maxVal = usageStats.topUsed[0]?.count || 1;
                                const percent = (item.count / maxVal) * 100;
                                return (
                                    <div key={idx}>
                                        <div className="flex justify-between text-xs font-bold mb-1 dark:text-gray-300">
                                            <span>{idx + 1}. {item.name}</span>
                                            <span>{item.count} Kez</span>
                                        </div>
                                        <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2.5">
                                            <div className="bg-blue-600 h-2.5 rounded-full" style={{ width: `${percent}%` }}></div>
                                        </div>
                                    </div>
                                );
                            })}
                            {usageStats.topUsed.length === 0 && <p className="text-gray-400 text-sm">Veri yok.</p>}
                        </div>
                    </div>

                    {/* En Çok Hurdaya Çıkanlar */}
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow border border-gray-200 dark:border-gray-700">
                        <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-4 flex items-center">
                            <AlertTriangle className="w-5 h-5 mr-2 text-red-500" /> En Çok Hurdaya Çıkan 10 Takım
                        </h3>
                        <div className="space-y-4">
                            {usageStats.topScrap.map((item, idx) => {
                                const maxVal = usageStats.topScrap[0]?.count || 1;
                                const percent = (item.count / maxVal) * 100;
                                return (
                                    <div key={idx}>
                                        <div className="flex justify-between text-xs font-bold mb-1 dark:text-gray-300">
                                            <span>{idx + 1}. {item.name}</span>
                                            <span>{item.count} Adet</span>
                                        </div>
                                        <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2.5">
                                            <div className="bg-red-500 h-2.5 rounded-full" style={{ width: `${percent}%` }}></div>
                                        </div>
                                    </div>
                                );
                            })}
                            {usageStats.topScrap.length === 0 && <p className="text-gray-400 text-sm">Veri yok.</p>}
                        </div>
                    </div>
                </div>
            )}

            {/* --- SEKME 3: OPERATÖR RAPORU --- */}
            {activeTab === 'OPERATORS' && (
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                    <table className="w-full text-left text-sm text-gray-600 dark:text-gray-300">
                        <thead className="bg-gray-50 dark:bg-gray-900/50 text-gray-900 dark:text-white uppercase font-bold text-xs">
                            <tr>
                                <th className="p-4">Operatör Adı</th>
                                <th className="p-4 text-center">Toplam Alınan Takım</th>
                                <th className="p-4 text-center">Hurdaya Ayrılan</th>
                                <th className="p-4 text-center">Hurda Oranı</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                            {operatorStats.map((op, idx) => {
                                const rate = op.totalTaken > 0 ? ((op.totalScrap / op.totalTaken) * 100).toFixed(1) : 0;
                                return (
                                    <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                        <td className="p-4 font-bold text-gray-900 dark:text-white">{op.name}</td>
                                        <td className="p-4 text-center font-medium">{op.totalTaken}</td>
                                        <td className="p-4 text-center text-red-600 font-bold">{op.totalScrap}</td>
                                        <td className="p-4 text-center">
                                            <span className={`px-2 py-1 rounded text-xs font-bold ${
                                                rate > 20 ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                                            }`}>
                                                %{rate}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                            {operatorStats.length === 0 && (
                                <tr><td colSpan="4" className="p-8 text-center text-gray-400">Veri bulunamadı.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

        </div>
    );
};

export default ToolAnalysisPage; // BU SATIRIN OLDUĞUNDAN EMİN OLUN