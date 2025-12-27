// src/pages/ToolLifecycleAnalysis.js

import React, { useState, useMemo, useEffect } from 'react';
import { 
    Search, BarChart2, TrendingUp, TrendingDown, 
    ArrowRight, Activity, Calendar, Download, Package
} from 'lucide-react';
import { collection, query, onSnapshot, orderBy } from '../config/firebase.js';
import { 
    INVENTORY_COLLECTION, TOOL_TRANSACTIONS_COLLECTION, TOOL_TRANSACTION_TYPES 
} from '../config/constants.js';

// Grafikler
import { 
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area
} from 'recharts';

// PDF
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const ToolLifecycleAnalysis = ({ db }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedToolId, setSelectedToolId] = useState(null);
    
    const [inventory, setInventory] = useState([]);
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(true);

    // --- VERİLERİ ÇEK ---
    useEffect(() => {
        if (!db) return;

        // 1. Envanter (Takım Listesi)
        const unsubInventory = onSnapshot(collection(db, INVENTORY_COLLECTION), (snapshot) => {
            setInventory(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });

        // 2. Tüm İşlem Geçmişi
        const q = query(collection(db, TOOL_TRANSACTIONS_COLLECTION), orderBy('date', 'asc'));
        const unsubTransactions = onSnapshot(q, (snapshot) => {
            setTransactions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            setLoading(false);
        });

        return () => {
            unsubInventory();
            unsubTransactions();
        };
    }, [db]);

    // --- LİSTE FİLTRELEME ---
    const filteredTools = useMemo(() => {
        if (!searchTerm) return inventory;
        const lower = searchTerm.toLowerCase();
        return inventory.filter(t => 
            t.name.toLowerCase().includes(lower) || 
            (t.productCode && t.productCode.toLowerCase().includes(lower))
        );
    }, [inventory, searchTerm]);

    // --- SEÇİLEN TAKIMIN ANALİZİ ---
    const toolAnalysis = useMemo(() => {
        if (!selectedToolId) return null;

        const tool = inventory.find(t => t.id === selectedToolId);
        if (!tool) return null;

        // Bu takıma ait tüm işlemleri bul (İsme göre eşleştiriyoruz, ID daha güvenli ama eski kayıtlarda ID olmayabilir)
        const toolTx = transactions.filter(tx => 
            tx.toolName === tool.name || (tx.toolId && tx.toolId === tool.id)
        );

        // Yıllık Veriler
        const currentYear = new Date().getFullYear();
        const lastYear = currentYear - 1;

        let totalEntry = 0;
        let totalScrap = 0;
        
        let thisYearEntry = 0;
        let thisYearScrap = 0;
        let lastYearScrap = 0;

        // Aylık Veri Hazırlığı (Grafik İçin)
        const monthlyData = Array(12).fill(0).map((_, i) => ({
            name: new Date(0, i).toLocaleString('tr-TR', { month: 'short' }),
            Giriş: 0,
            Hurda: 0
        }));

        toolTx.forEach(tx => {
            const date = new Date(tx.date);
            const year = date.getFullYear();
            const month = date.getMonth();
            const qty = parseInt(tx.quantity) || 1; // Miktar yoksa 1 say

            // 1. Stok Girişi (Satın Alma)
            if (tx.type === TOOL_TRANSACTION_TYPES.STOCK_ENTRY) {
                totalEntry += qty;
                if (year === currentYear) {
                    thisYearEntry += qty;
                    monthlyData[month].Giriş += qty;
                }
            }

            // 2. Hurda (Çıkış)
            if (tx.type === TOOL_TRANSACTION_TYPES.RETURN_SCRAP) {
                totalScrap += 1; // Hurdalar genelde tek tek
                if (year === currentYear) {
                    thisYearScrap += 1;
                    monthlyData[month].Hurda += 1;
                }
                if (year === lastYear) {
                    lastYearScrap += 1;
                }
            }
        });

        // Karşılaştırma Hesapla
        let scrapComparisonText = "Veri Yok";
        let scrapTrend = 'neutral'; // up, down, neutral

        if (lastYearScrap > 0) {
            const diff = thisYearScrap - lastYearScrap;
            const percent = ((diff / lastYearScrap) * 100).toFixed(1);
            if (diff < 0) {
                scrapComparisonText = `Geçen yıla göre %${Math.abs(percent)} daha az hurda.`;
                scrapTrend = 'good';
            } else if (diff > 0) {
                scrapComparisonText = `Geçen yıla göre %${percent} artış var.`;
                scrapTrend = 'bad';
            } else {
                scrapComparisonText = "Geçen yılla aynı seviyede.";
            }
        } else if (thisYearScrap > 0) {
            scrapComparisonText = "Geçen yıl veri yok, bu yıl ilk kullanım.";
        }

        return {
            tool,
            totalEntry,
            totalScrap,
            thisYearEntry,
            thisYearScrap,
            lastYearScrap,
            scrapComparisonText,
            scrapTrend,
            monthlyData
        };

    }, [selectedToolId, inventory, transactions]);


    // --- PDF RAPORU ---
    const generateReport = () => {
        if (!toolAnalysis) return;
        const doc = new jsPDF();
        
        doc.setFontSize(18);
        doc.text("TAKIM YAŞAM DÖNGÜSÜ RAPORU", 14, 20);
        
        doc.setFontSize(12);
        doc.text(`Takım Adı: ${toolAnalysis.tool.name}`, 14, 30);
        doc.text(`Kod: ${toolAnalysis.tool.productCode || '-'}`, 14, 36);
        doc.text(`Rapor Tarihi: ${new Date().toLocaleDateString('tr-TR')}`, 14, 42);

        // Özet Tablo
        autoTable(doc, {
            startY: 50,
            head: [['Metrik', 'Değer']],
            body: [
                ['Toplam Stok Girişi (Tarihçe)', toolAnalysis.totalEntry],
                ['Toplam Hurda (Tarihçe)', toolAnalysis.totalScrap],
                ['Bu Yıl Alınan', toolAnalysis.thisYearEntry],
                ['Bu Yıl Hurdaya Çıkan', toolAnalysis.thisYearScrap],
                ['Geçen Yıl Hurda', toolAnalysis.lastYearScrap],
                ['Performans Durumu', toolAnalysis.scrapComparisonText]
            ],
            theme: 'grid',
            headStyles: { fillColor: [41, 128, 185] }
        });

        // Aylık Döküm
        doc.text(`${new Date().getFullYear()} Yılı Aylık Döküm`, 14, doc.lastAutoTable.finalY + 15);
        
        autoTable(doc, {
            startY: doc.lastAutoTable.finalY + 20,
            head: [['Ay', 'Satın Alma (Giriş)', 'Hurda (Çıkış)']],
            body: toolAnalysis.monthlyData.map(m => [m.name, m.Giriş, m.Hurda]),
            theme: 'striped'
        });

        doc.save(`${toolAnalysis.tool.name}_Analiz.pdf`);
    };


    if (loading) return <div className="p-10 text-center dark:text-white">Veriler Yükleniyor...</div>;

    return (
        <div className="flex h-[calc(100vh-80px)] overflow-hidden bg-gray-50 dark:bg-gray-900">
            
            {/* SOL PANEL: LİSTE */}
            <div className="w-1/3 border-r border-gray-200 dark:border-gray-700 flex flex-col bg-white dark:bg-gray-800">
                <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                    <h2 className="text-lg font-bold text-gray-800 dark:text-white mb-3">Takım Listesi</h2>
                    <div className="relative">
                        <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                        <input 
                            type="text" 
                            placeholder="Takım Ara..." 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-9 p-2 text-sm border rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white border-gray-300 dark:border-gray-600 focus:ring-1 focus:ring-blue-500"
                        />
                    </div>
                </div>
                
                <div className="flex-1 overflow-y-auto">
                    {filteredTools.map(tool => (
                        <button
                            key={tool.id}
                            onClick={() => setSelectedToolId(tool.id)}
                            className={`w-full text-left p-3 border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition flex justify-between items-center ${
                                selectedToolId === tool.id ? 'bg-blue-50 dark:bg-blue-900/30 border-l-4 border-l-blue-500' : ''
                            }`}
                        >
                            <div>
                                <div className="font-bold text-sm text-gray-900 dark:text-white">{tool.name}</div>
                                <div className="text-xs text-gray-500 dark:text-gray-400 font-mono">{tool.productCode || '-'}</div>
                            </div>
                            <ArrowRight className={`w-4 h-4 text-gray-400 ${selectedToolId === tool.id ? 'text-blue-500' : ''}`} />
                        </button>
                    ))}
                </div>
            </div>

            {/* SAĞ PANEL: ANALİZ DASHBOARD */}
            <div className="flex-1 overflow-y-auto p-6 bg-gray-50 dark:bg-gray-900">
                {toolAnalysis ? (
                    <div className="space-y-6">
                        
                        {/* BAŞLIK */}
                        <div className="flex justify-between items-start">
                            <div>
                                <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center">
                                    <Package className="w-6 h-6 mr-2 text-blue-600" />
                                    {toolAnalysis.tool.name}
                                </h1>
                                <p className="text-gray-500 dark:text-gray-400 text-sm">
                                    Stok Kodu: <span className="font-mono font-bold">{toolAnalysis.tool.productCode || 'Yok'}</span> | Kategori: {toolAnalysis.tool.category}
                                </p>
                            </div>
                            <button 
                                onClick={generateReport}
                                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center shadow-sm transition"
                            >
                                <Download className="w-4 h-4 mr-2" /> PDF Karne İndir
                            </button>
                        </div>

                        {/* KPI KARTLARI */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                                <div className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Toplam Satın Alma (Tarihçe)</div>
                                <div className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-1">{toolAnalysis.totalEntry} Adet</div>
                                <div className="text-xs text-gray-400 mt-2">Depoya giren tüm miktar</div>
                            </div>
                            
                            <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                                <div className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Toplam Hurda (Tarihçe)</div>
                                <div className="text-2xl font-bold text-red-600 dark:text-red-400 mt-1">{toolAnalysis.totalScrap} Adet</div>
                                <div className="text-xs text-gray-400 mt-2">Çöp olan toplam miktar</div>
                            </div>

                            <div className={`p-4 rounded-xl shadow-sm border ${
                                toolAnalysis.scrapTrend === 'good' 
                                ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' 
                                : toolAnalysis.scrapTrend === 'bad' 
                                    ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                                    : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'
                            }`}>
                                <div className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Yıllık Performans</div>
                                <div className="flex items-center mt-1">
                                    {toolAnalysis.scrapTrend === 'good' && <TrendingDown className="w-6 h-6 text-green-600 mr-2" />}
                                    {toolAnalysis.scrapTrend === 'bad' && <TrendingUp className="w-6 h-6 text-red-600 mr-2" />}
                                    <span className={`text-sm font-bold ${
                                        toolAnalysis.scrapTrend === 'good' ? 'text-green-700 dark:text-green-400' : 
                                        toolAnalysis.scrapTrend === 'bad' ? 'text-red-700 dark:text-red-400' : 'text-gray-700 dark:text-gray-300'
                                    }`}>
                                        {toolAnalysis.scrapComparisonText}
                                    </span>
                                </div>
                                <div className="text-xs text-gray-500 mt-2">Geçen yıla göre hurda değişimi</div>
                            </div>
                        </div>

                        {/* GRAFİK */}
                        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 h-96">
                            <h3 className="font-bold text-gray-800 dark:text-white mb-4 flex items-center">
                                <Activity className="w-5 h-5 mr-2 text-indigo-500" /> {new Date().getFullYear()} Yılı Giriş/Çıkış Analizi
                            </h3>
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={toolAnalysis.monthlyData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="colorEntry" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.8}/>
                                            <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
                                        </linearGradient>
                                        <linearGradient id="colorScrap" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#EF4444" stopOpacity={0.8}/>
                                            <stop offset="95%" stopColor="#EF4444" stopOpacity={0}/>
                                        </linearGradient>
                                    </defs>
                                    <XAxis dataKey="name" stroke="#9CA3AF" tick={{fontSize: 12}} />
                                    <YAxis stroke="#9CA3AF" tick={{fontSize: 12}} />
                                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.1} />
                                    <Tooltip 
                                        contentStyle={{ backgroundColor: '#1F2937', borderColor: '#374151', color: '#fff' }} 
                                        itemStyle={{ color: '#fff' }}
                                    />
                                    <Legend />
                                    <Area type="monotone" dataKey="Giriş" stroke="#3B82F6" fillOpacity={1} fill="url(#colorEntry)" name="Satın Alma (Adet)" />
                                    <Area type="monotone" dataKey="Hurda" stroke="#EF4444" fillOpacity={1} fill="url(#colorScrap)" name="Hurda (Adet)" />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>

                    </div>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center text-gray-400 dark:text-gray-500 opacity-60">
                        <BarChart2 className="w-24 h-24 mb-4 text-gray-300 dark:text-gray-600" />
                        <p className="text-xl font-medium">Analizini görmek istediğiniz takımı soldan seçin.</p>
                        <p className="text-sm mt-2">Detaylı yaşam döngüsü, satın alma geçmişi ve hurda oranlarını buradan görebilirsiniz.</p>
                    </div>
                )}
            </div>

        </div>
    );
};

export default ToolLifecycleAnalysis;