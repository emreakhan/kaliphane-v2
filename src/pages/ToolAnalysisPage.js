// src/pages/ToolAnalysisPage.js

import React, { useState, useEffect, useMemo } from 'react';
import { 
    BarChart2, AlertTriangle, Users, TrendingUp, 
    Download, Calendar, Filter, CheckCircle, Recycle, XCircle, Layers
} from 'lucide-react';
import { collection, onSnapshot } from '../config/firebase.js';
import { 
    INVENTORY_COLLECTION, TOOL_TRANSACTIONS_COLLECTION, TOOL_TRANSACTION_TYPES 
} from '../config/constants.js';

// GRAFİK KÜTÜPHANESİ
import { 
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend,
    AreaChart, Area
} from 'recharts';

// PDF KÜTÜPHANESİ
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable'; 

const CustomYAxisTick = ({ x, y, payload }) => {
    return (
        <g transform={`translate(${x},${y})`}>
            <text 
                x={-5} 
                y={0} 
                dy={3.5} 
                textAnchor="end" 
                className="fill-gray-800 dark:fill-gray-100 text-[10px] font-bold"
            >
                {payload.value}
            </text>
        </g>
    );
};

const months = [
    "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", 
    "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"
];

const cleanToolName = (name) => {
    if (!name) return '';
    return name.replace(/^\[[^\]]+\]\s*/, '').trim();
};

const ToolAnalysisPage = ({ db }) => {
    const [activeTab, setActiveTab] = useState('USAGE'); 
    const [inventory, setInventory] = useState([]);
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(true);

    // --- FİLTRE STATELERİ ---
    const currentYear = new Date().getFullYear();
    const [selectedYear, setSelectedYear] = useState(currentYear);
    const [selectedMonth, setSelectedMonth] = useState('ALL'); 
    const [selectedCategory, setSelectedCategory] = useState('ALL');
    const [selectedTool, setSelectedTool] = useState('ALL');

    // --- KATEGORİ VE TAKIM LİSTELERİ ---
    const categories = useMemo(() => {
        const cats = new Set(inventory.map(t => t.category).filter(Boolean));
        return ['ALL', ...Array.from(cats).sort()];
    }, [inventory]);

    const toolsInCategory = useMemo(() => {
        let result = inventory;
        if (selectedCategory !== 'ALL') {
            result = result.filter(t => t.category === selectedCategory);
        }
        const uniqueNames = Array.from(new Set(result.map(t => cleanToolName(t.name)).filter(Boolean)));
        return uniqueNames.sort((a, b) => a.localeCompare(b, 'tr'));
    }, [inventory, selectedCategory]);

    // --- GEÇMİŞ YILLARI DİNAMİK HESAPLAMA ---
    const availableYears = useMemo(() => {
        if (!transactions || transactions.length === 0) return [currentYear, currentYear - 1, currentYear - 2];
        const years = new Set(transactions.map(tx => {
            if (!tx.date) return currentYear;
            return new Date(tx.date).getFullYear();
        }));
        years.add(currentYear); // İçinde bulunduğumuz yılı her zaman dahil et
        return Array.from(years).sort((a, b) => b - a); // Yeniden eskiye doğru sırala
    }, [transactions, currentYear]);

    // --- VERİLERİ ÇEK ---
    useEffect(() => {
        if (!db) return;

        const unsubInventory = onSnapshot(collection(db, INVENTORY_COLLECTION), (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setInventory(data);
        });

        const unsubTransactions = onSnapshot(collection(db, TOOL_TRANSACTIONS_COLLECTION), (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setTransactions(data);
            setLoading(false);
        }, (error) => {
            console.error("Transactions loading error:", error);
            setLoading(false);
        });

        return () => {
            unsubInventory();
            unsubTransactions();
        };
    }, [db]);

    // --- ANALİZ MANTIKLARI ---

    const criticalList = useMemo(() => {
        return inventory
            .filter(item => item.totalStock <= item.criticalStock)
            .sort((a, b) => a.totalStock - b.totalStock);
    }, [inventory]);

    const filteredTransactions = useMemo(() => {
        return transactions.filter(tx => {
            if (!tx.date) return false;
            const txDate = new Date(tx.date);
            const yearMatch = txDate.getFullYear() === parseInt(selectedYear);
            const monthMatch = selectedMonth === 'ALL' || txDate.getMonth() === parseInt(selectedMonth);
            return yearMatch && monthMatch;
        });
    }, [transactions, selectedYear, selectedMonth]);

    const chartData = useMemo(() => {
        const usageMap = {};
        const scrapMap = {};

        filteredTransactions.forEach(tx => {
            // Kalıp malzemelerini grafikte gösterme
            if (tx.isMoldMaterial || (tx.toolName && tx.toolName.toLowerCase().includes('kalıp malzemesi'))) return;

            const name = cleanToolName(tx.toolName || 'Bilinmiyor');

            // Kategori ve Takım filtreleri
            const toolMatch = inventory.find(t => (t.id === tx.toolId || cleanToolName(t.name) === name) && t.category) || 
                              inventory.find(t => t.id === tx.toolId || cleanToolName(t.name) === name);
            if (selectedCategory !== 'ALL' && (!toolMatch || toolMatch.category !== selectedCategory)) return;
            if (selectedTool !== 'ALL' && name !== selectedTool) return;
            
            if (tx.type === TOOL_TRANSACTION_TYPES.ISSUE) {
                usageMap[name] = (usageMap[name] || 0) + (parseInt(tx.quantity) || 1);
            }
            
            // GÜNCELLEME: Tüm hurda tiplerini genel grafikte göster
            if (tx.type === TOOL_TRANSACTION_TYPES.RETURN_SCRAP || 
                tx.type === TOOL_TRANSACTION_TYPES.RETURN_SCRAP_DAMAGE || 
                tx.type === TOOL_TRANSACTION_TYPES.RETURN_SCRAP_WEAR) {
                scrapMap[name] = (scrapMap[name] || 0) + (parseInt(tx.quantity) || 1);
            }
        });

        const usageData = Object.entries(usageMap)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10); 

        const scrapData = Object.entries(scrapMap)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10); 

        return { usageData, scrapData, usageMap, scrapMap };
    }, [filteredTransactions, inventory, selectedCategory, selectedTool]);

    // --- SEÇİLEN KATEGORİ VE TAKIMIN AYLIK DEĞİŞİM TRENDİ ---
    const monthlyTrendData = useMemo(() => {
        const trend = Array.from({ length: 12 }, (_, i) => ({
            monthName: months[i],
            issued: 0,
            scrappedWear: 0,
            scrappedDamage: 0,
            totalScrapped: 0
        }));

        transactions.forEach(tx => {
            if (!tx.date) return;
            const txDate = new Date(tx.date);
            if (txDate.getFullYear() !== parseInt(selectedYear)) return;

            const name = cleanToolName(tx.toolName || 'Bilinmiyor');

            // Filter by Category and Tool selection
            const toolMatch = inventory.find(t => (t.id === tx.toolId || cleanToolName(t.name) === name) && t.category) || 
                              inventory.find(t => t.id === tx.toolId || cleanToolName(t.name) === name);
            if (selectedCategory !== 'ALL' && (!toolMatch || toolMatch.category !== selectedCategory)) return;
            if (selectedTool !== 'ALL' && name !== selectedTool) return;

            const monthIdx = txDate.getMonth();
            const qty = parseInt(tx.quantity) || 1;

            if (tx.type === TOOL_TRANSACTION_TYPES.ISSUE) {
                trend[monthIdx].issued += qty;
            } else if (tx.type === TOOL_TRANSACTION_TYPES.RETURN_SCRAP_WEAR) {
                trend[monthIdx].scrappedWear += qty;
                trend[monthIdx].totalScrapped += qty;
            } else if (tx.type === TOOL_TRANSACTION_TYPES.RETURN_SCRAP_DAMAGE) {
                trend[monthIdx].scrappedDamage += qty;
                trend[monthIdx].totalScrapped += qty;
            } else if (tx.type === TOOL_TRANSACTION_TYPES.RETURN_SCRAP) {
                trend[monthIdx].scrappedWear += qty;
                trend[monthIdx].totalScrapped += qty;
            }
        });

        return trend;
    }, [transactions, inventory, selectedYear, selectedCategory, selectedTool]);

    // --- SEÇİLEN KATEGORİDEKİ TÜM TAKIMLARIN KULLANIM SIRALAMASI ---
    const categoryUsageRanking = useMemo(() => {
        const statsMap = {};

        // İlk olarak kategorideki tüm takımları haritaya ekle
        inventory.forEach(tool => {
            if (selectedCategory !== 'ALL' && tool.category !== selectedCategory) return;
            const cleanName = cleanToolName(tool.name);
            if (!cleanName) return;

            if (!statsMap[cleanName]) {
                statsMap[cleanName] = {
                    name: cleanName,
                    category: tool.category,
                    totalStock: 0,
                    totalIssued: 0,
                    totalScrapped: 0,
                    scrappedWear: 0,
                    scrappedDamage: 0
                };
            }
            statsMap[cleanName].totalStock += (parseInt(tool.totalStock) || 0);
        });

        // Tüketim/Hurda hareketlerini yansıt
        transactions.forEach(tx => {
            if (!tx.date) return;
            const txDate = new Date(tx.date);
            if (txDate.getFullYear() !== parseInt(selectedYear)) return;

            const cleanName = cleanToolName(tx.toolName);
            if (!cleanName || !statsMap[cleanName]) return;

            const qty = parseInt(tx.quantity) || 1;

            if (tx.type === TOOL_TRANSACTION_TYPES.ISSUE) {
                statsMap[cleanName].totalIssued += qty;
            } else if (tx.type === TOOL_TRANSACTION_TYPES.RETURN_SCRAP_WEAR) {
                statsMap[cleanName].scrappedWear += qty;
                statsMap[cleanName].totalScrapped += qty;
            } else if (tx.type === TOOL_TRANSACTION_TYPES.RETURN_SCRAP_DAMAGE) {
                statsMap[cleanName].scrappedDamage += qty;
                statsMap[cleanName].totalScrapped += qty;
            } else if (tx.type === TOOL_TRANSACTION_TYPES.RETURN_SCRAP) {
                statsMap[cleanName].scrappedWear += qty;
                statsMap[cleanName].totalScrapped += qty;
            }
        });

        return Object.values(statsMap).sort((a, b) => b.totalIssued - a.totalIssued);
    }, [transactions, inventory, selectedYear, selectedCategory]);

    const operatorStats = useMemo(() => {
        const ops = {};
        filteredTransactions.forEach(tx => {
            const opName = tx.receiver; 
            if (!opName || opName === 'Bilinmiyor') return;

            if (!ops[opName]) ops[opName] = { name: opName, totalTaken: 0, totalScrap: 0, totalWear: 0 };

            if (tx.type === TOOL_TRANSACTION_TYPES.ISSUE) {
                ops[opName].totalTaken += (parseInt(tx.quantity) || 1);
            }
            
            // GÜNCELLEME: Hurda Ayrımı
            // 1. HATA/KIRILMA (Performansa Eksi Yazar) - Eski 'RETURN_SCRAP' ve yeni 'DAMAGE'
            if (tx.type === TOOL_TRANSACTION_TYPES.RETURN_SCRAP || 
                tx.type === TOOL_TRANSACTION_TYPES.RETURN_SCRAP_DAMAGE) {
                ops[opName].totalScrap += (parseInt(tx.quantity) || 1);
            }

            // 2. DOĞAL AŞINMA (Performansı Etkilemez) - Yeni 'WEAR'
            if (tx.type === TOOL_TRANSACTION_TYPES.RETURN_SCRAP_WEAR) {
                ops[opName].totalWear += (parseInt(tx.quantity) || 1);
            }
        });
        return Object.values(ops).sort((a, b) => b.totalTaken - a.totalTaken);
    }, [filteredTransactions]);



    // --- PDF RAPOR OLUŞTURMA ---
    const generatePDF = () => {
        const doc = new jsPDF();
        
        const timeTitle = selectedMonth === 'ALL' 
            ? `${selectedYear} YILI GENEL RAPORU` 
            : `${months[selectedMonth]} ${selectedYear} RAPORU`;

        doc.setFontSize(18);
        doc.text("TAKIMHANE DETAYLI ANALIZ RAPORU", 14, 20);
        doc.setFontSize(12);
        doc.text(`Donem: ${timeTitle}`, 14, 28);
        doc.text(`Rapor Tarihi: ${new Date().toLocaleDateString('tr-TR')}`, 14, 34);

        // Tablo 1
        autoTable(doc, {
            startY: 45,
            head: [['Sira', 'Takim Adi', 'Tuketim Adedi', 'Toplam Hurda', 'Hurda Orani (%)']],
            body: Object.entries(chartData.usageMap)
                .sort((a, b) => b[1] - a[1]) 
                .map(([name, count], index) => {
                    const scrapCount = chartData.scrapMap[name] || 0;
                    const rate = count > 0 ? ((scrapCount / count) * 100).toFixed(1) : 0;
                    return [index + 1, name, count, scrapCount, `%${rate}`];
                }),
            theme: 'striped',
            headStyles: { fillColor: [41, 128, 185] }
        });

        // Tablo 2
        doc.text("Operator Performans Durumu", 14, doc.lastAutoTable.finalY + 15);
        autoTable(doc, {
            startY: doc.lastAutoTable.finalY + 20,
            head: [['Operator', 'Toplam Alinan', 'Kirilma/Hata', 'Dogal Asinma', 'Hata Orani (%)']],
            body: operatorStats.map(op => {
                const rate = op.totalTaken > 0 ? ((op.totalScrap / op.totalTaken) * 100).toFixed(1) : 0;
                return [op.name, op.totalTaken, op.totalScrap, op.totalWear, `%${rate}`];
            }),
            theme: 'grid',
            headStyles: { fillColor: [39, 174, 96] }
        });

        // Tablo 3 (Kritik Stok)
        if (criticalList.length > 0) {
            doc.addPage();
            doc.text("KRITIK STOK LISTESI (ACIL SIPARIS)", 14, 20);
            autoTable(doc, {
                startY: 25,
                head: [['Kod', 'Takim Adi', 'Kategori', 'Mevcut Stok', 'Kritik Sinir']],
                body: criticalList.map(item => [
                    item.productCode || '-', item.name, item.category, item.totalStock, item.criticalStock
                ]),
                theme: 'plain',
                headStyles: { fillColor: [192, 57, 43] }
            });
        }

        doc.save(`Takimhane_Raporu_${selectedYear}.pdf`);
    };

    if (loading) return <div className="p-10 text-center dark:text-white">Veriler Analiz Ediliyor...</div>;

    return (
        <div className="p-6 max-w-7xl mx-auto min-h-screen bg-gray-50 dark:bg-gray-900">
            
            {/* ÜST PANEL: BAŞLIK VE FİLTRELER */}
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-8 gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center">
                        <TrendingUp className="w-8 h-8 mr-3 text-indigo-600" />
                        Takımhane Analiz Raporu
                    </h1>
                    <p className="text-gray-500 text-sm mt-1">
                        Dönemsel tüketim, hurda analizi ve stok durumu.
                    </p>
                </div>

                <div className="flex flex-wrap gap-3 bg-white dark:bg-gray-800 p-2 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
                    {/* Yıl Seçimi */}
                    <div className="flex items-center px-2">
                        <Calendar className="w-4 h-4 mr-2 text-gray-500" />
                        <select 
                            value={selectedYear} 
                            onChange={(e) => setSelectedYear(e.target.value)}
                            className="bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded px-2 py-1 font-bold outline-none cursor-pointer"
                        >
                            {availableYears.map(y => (
                                <option key={y} value={y} className="dark:text-white dark:bg-gray-800">{y}</option>
                            ))}
                        </select>
                    </div>
                    
                    {/* Ay Seçimi */}
                    <div className="flex items-center px-2 border-l border-gray-300 dark:border-gray-600">
                        <Filter className="w-4 h-4 mr-2 text-gray-500" />
                        <select 
                            value={selectedMonth} 
                            onChange={(e) => setSelectedMonth(e.target.value)}
                            className="bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded px-2 py-1 font-bold outline-none cursor-pointer"
                        >
                            <option value="ALL" className="dark:text-white dark:bg-gray-800">Tüm Yıl</option>
                            {months.map((m, i) => (
                                <option key={i} value={i} className="dark:text-white dark:bg-gray-800">{m}</option>
                            ))}
                        </select>
                    </div>
                    {/* Kategori Seçimi */}
                    <div className="flex items-center px-2 border-l border-gray-300 dark:border-gray-600">
                        <span className="text-xs font-bold text-gray-500 dark:text-gray-400 mr-2">Kategori:</span>
                        <select 
                            value={selectedCategory} 
                            onChange={(e) => {
                                setSelectedCategory(e.target.value);
                                setSelectedTool('ALL');
                            }}
                            className="bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded px-2 py-1 font-bold outline-none cursor-pointer max-w-[150px]"
                        >
                            {categories.map(cat => (
                                <option key={cat} value={cat} className="dark:text-white dark:bg-gray-800">{cat === 'ALL' ? 'Tümü' : cat}</option>
                            ))}
                        </select>
                    </div>

                    {/* Takım Seçimi */}
                    <div className="flex items-center px-2 border-l border-gray-300 dark:border-gray-600">
                        <span className="text-xs font-bold text-gray-500 dark:text-gray-400 mr-2">Takım:</span>
                        <select 
                            value={selectedTool} 
                            onChange={(e) => setSelectedTool(e.target.value)}
                            className="bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded px-2 py-1 font-bold outline-none cursor-pointer max-w-[200px]"
                        >
                            <option value="ALL" className="dark:text-white dark:bg-gray-800">Tümü</option>
                            {toolsInCategory.map(tName => (
                                <option key={tName} value={tName} className="dark:text-white dark:bg-gray-800">{tName}</option>
                            ))}
                        </select>
                    </div>

                    {/* PDF Butonu */}
                    <button 
                        onClick={generatePDF}
                        className="ml-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md text-xs font-bold flex items-center transition"
                    >
                        <Download className="w-4 h-4 mr-2" /> PDF Rapor İndir
                    </button>
                </div>
            </div>

            {/* SEKME MENÜSÜ */}
            <div className="flex space-x-2 mb-6 border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
                <button onClick={() => setActiveTab('USAGE')} className={`pb-3 px-6 font-bold text-sm flex items-center whitespace-nowrap transition-colors ${activeTab === 'USAGE' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'}`}>
                    <BarChart2 className="w-4 h-4 mr-2" /> Tüketim & Hurda Analizi
                </button>
                <button onClick={() => setActiveTab('OPERATORS')} className={`pb-3 px-6 font-bold text-sm flex items-center whitespace-nowrap transition-colors ${activeTab === 'OPERATORS' ? 'border-b-2 border-green-500 text-green-600' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'}`}>
                    <Users className="w-4 h-4 mr-2" /> Operatör Durumu
                </button>
                <button onClick={() => setActiveTab('CRITICAL')} className={`pb-3 px-6 font-bold text-sm flex items-center whitespace-nowrap transition-colors ${activeTab === 'CRITICAL' ? 'border-b-2 border-red-500 text-red-600' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'}`}>
                    <AlertTriangle className="w-4 h-4 mr-2" /> Kritik Stoklar ({criticalList.length})
                </button>
            </div>

            {/* --- SEKME 1: TÜKETİM ANALİZİ (GRAFİKSEL) --- */}
            {activeTab === 'USAGE' && (
                <div className="space-y-6">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* KULLANIM GRAFİĞİ */}
                        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow border border-gray-200 dark:border-gray-700 flex flex-col h-96">
                            <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-4 flex items-center">
                                <CheckCircle className="w-5 h-5 mr-2 text-blue-500" /> En Çok Tüketilen 10 Takım
                            </h3>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={chartData.usageData} layout="vertical" margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#374151" opacity={0.2} />
                                    <XAxis type="number" hide />
                                    <YAxis 
                                        dataKey="name" 
                                        type="category" 
                                        width={200} 
                                        tick={<CustomYAxisTick />}
                                    />
                                    <Tooltip 
                                        contentStyle={{ backgroundColor: '#1F2937', borderColor: '#374151', color: '#fff' }} 
                                        itemStyle={{ color: '#fff' }}
                                        formatter={(value) => [`${value} Adet`, 'Kullanım']}
                                    />
                                    <Bar dataKey="count" fill="#3B82F6" radius={[0, 4, 4, 0]}>
                                        {chartData.usageData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={index < 3 ? '#2563EB' : '#60A5FA'} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
 
                        {/* HURDA GRAFİĞİ */}
                        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow border border-gray-200 dark:border-gray-700 flex flex-col h-96">
                            <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-4 flex items-center">
                                <AlertTriangle className="w-5 h-5 mr-2 text-red-500" /> En Çok Hurdaya Çıkan 10 Takım
                            </h3>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={chartData.scrapData} layout="vertical" margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#374151" opacity={0.2} />
                                    <XAxis type="number" hide />
                                    <YAxis 
                                        dataKey="name" 
                                        type="category" 
                                        width={200} 
                                        tick={<CustomYAxisTick />}
                                    />
                                    <Tooltip 
                                        contentStyle={{ backgroundColor: '#1F2937', borderColor: '#374151', color: '#fff' }} 
                                        itemStyle={{ color: '#fff' }}
                                        formatter={(value) => [`${value} Adet`, 'Hurda']}
                                    />
                                    <Bar dataKey="count" fill="#EF4444" radius={[0, 4, 4, 0]}>
                                        {chartData.scrapData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={index < 3 ? '#DC2626' : '#F87171'} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* YENİ: AYLIK DETAYLI TREND ANALİZİ */}
                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col p-6 space-y-6">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-gray-200 dark:border-gray-700 pb-4 gap-4">
                            <div>
                                <h3 className="text-lg font-bold text-gray-800 dark:text-white flex items-center gap-2">
                                    <TrendingUp className="w-5 h-5 text-indigo-500" />
                                    {selectedTool !== 'ALL' ? `"${selectedTool}" Aylık Değişim Trendi` : selectedCategory !== 'ALL' ? `"${selectedCategory}" Kategorisi Aylık Değişim Trendi` : 'Tüm Takımlar Aylık Değişim Trendi'}
                                </h3>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 font-semibold">
                                    {selectedYear} yılındaki aylık tüketim ve hurda dağılım grafiği.
                                </p>
                            </div>
                        </div>

                        {/* Trend Grafiği */}
                        <div className="h-72 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={monthlyTrendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="colorIssued" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.8}/>
                                            <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
                                        </linearGradient>
                                        <linearGradient id="colorScrapped" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#EF4444" stopOpacity={0.8}/>
                                            <stop offset="95%" stopColor="#EF4444" stopOpacity={0}/>
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
                                    <XAxis dataKey="monthName" tick={{ fill: '#9CA3AF', fontSize: 11, fontWeight: 'bold' }} />
                                    <YAxis tick={{ fill: '#9CA3AF', fontSize: 11, fontWeight: 'bold' }} />
                                    <Tooltip 
                                        contentStyle={{ backgroundColor: '#1F2937', borderColor: '#374151', color: '#fff' }} 
                                        itemStyle={{ color: '#fff' }}
                                    />
                                    <Legend />
                                    <Area type="monotone" dataKey="issued" name="Kullanım / Verilen" stroke="#3B82F6" fillOpacity={1} fill="url(#colorIssued)" strokeWidth={2} />
                                    <Area type="monotone" dataKey="totalScrapped" name="Hurdaya Ayrılan" stroke="#EF4444" fillOpacity={1} fill="url(#colorScrapped)" strokeWidth={2} />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>

                        {/* Aylık Detay Tablosu */}
                        <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
                            <table className="min-w-full text-left text-sm text-gray-600 dark:text-gray-300">
                                <thead className="bg-gray-100 dark:bg-gray-900/50 text-gray-900 dark:text-white uppercase font-bold text-xs">
                                    <tr>
                                        <th className="p-3">Ay</th>
                                        <th className="p-3 text-center">Kullanım / Verilen</th>
                                        <th className="p-3 text-center">Doğal Aşınma (Hurda)</th>
                                        <th className="p-3 text-center">Kırılma / Hata (Hurda)</th>
                                        <th className="p-3 text-center">Toplam Hurda</th>
                                        <th className="p-3 text-center">Aylık Hurda Oranı</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-150 dark:divide-gray-700 bg-white dark:bg-gray-800">
                                    {monthlyTrendData.map((row, idx) => {
                                        const rate = row.issued > 0 ? ((row.totalScrapped / row.issued) * 100).toFixed(1) : '0.0';
                                        return (
                                            <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition">
                                                <td className="p-3 font-bold text-gray-800 dark:text-white">{row.monthName}</td>
                                                <td className="p-3 text-center font-extrabold text-blue-600 dark:text-blue-400">{row.issued} Adet</td>
                                                <td className="p-3 text-center font-semibold text-orange-600 dark:text-orange-400">{row.scrappedWear} Adet</td>
                                                <td className="p-3 text-center font-semibold text-red-650 dark:text-red-400">{row.scrappedDamage} Adet</td>
                                                <td className="p-3 text-center font-extrabold text-red-600 dark:text-red-500">{row.totalScrapped} Adet</td>
                                                <td className="p-3 text-center">
                                                    <span className={`px-2 py-0.5 rounded text-xs font-black border ${Number(rate) > 30 ? 'bg-red-50 text-red-655 border-red-200 dark:bg-red-950/20 dark:text-red-400' : 'bg-gray-50 text-gray-600 border-gray-200 dark:bg-gray-900/30 dark:text-gray-300'}`}>
                                                        %{rate}
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* KATEGORİ DETAYLI KULLANIM SIRALAMASI */}
                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col p-6 space-y-4">
                        <div>
                            <h3 className="text-lg font-bold text-gray-800 dark:text-white flex items-center gap-2">
                                <Layers className="w-5 h-5 text-blue-500" />
                                {selectedCategory !== 'ALL' ? `"${selectedCategory}" Kategorisi Takım Kullanım Sıralaması` : 'Tüm Kategoriler Takım Kullanım Sıralaması'}
                            </h3>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 font-semibold">
                                {selectedYear} yılındaki en çok kullanılandan en az kullanılana doğru takım sıralaması ve hurda detayları.
                            </p>
                        </div>

                        <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
                            <table className="min-w-full text-left text-sm text-gray-600 dark:text-gray-300">
                                <thead className="bg-gray-100 dark:bg-gray-900/50 text-gray-900 dark:text-white uppercase font-bold text-xs">
                                    <tr>
                                        <th className="p-3 text-center w-12">Sıra</th>
                                        <th className="p-3">Takım Adı</th>
                                        {selectedCategory === 'ALL' && <th className="p-3">Kategori</th>}
                                        <th className="p-3 text-center">Toplam Stok</th>
                                        <th className="p-3 text-center">Tüketim / Kullanım</th>
                                        <th className="p-3 text-center">Aşınma (Hurda)</th>
                                        <th className="p-3 text-center">Kırılma/Hata (Hurda)</th>
                                        <th className="p-3 text-center">Toplam Hurda</th>
                                        <th className="p-3 text-center">Hurda Oranı</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-150 dark:divide-gray-700 bg-white dark:bg-gray-800">
                                    {categoryUsageRanking.length === 0 ? (
                                        <tr>
                                            <td colSpan={selectedCategory === 'ALL' ? 9 : 8} className="p-8 text-center text-gray-400">
                                                Veri bulunamadı.
                                            </td>
                                        </tr>
                                    ) : (
                                        categoryUsageRanking.map((row, idx) => {
                                            const scrapRate = row.totalIssued > 0 ? ((row.totalScrapped / row.totalIssued) * 100).toFixed(1) : '0.0';
                                            return (
                                                <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition">
                                                    <td className="p-3 text-center font-bold text-gray-400 dark:text-gray-500">#{idx + 1}</td>
                                                    <td className="p-3 font-bold text-gray-900 dark:text-white">{row.name}</td>
                                                    {selectedCategory === 'ALL' && <td className="p-3 font-semibold text-gray-500">{row.category || '-'}</td>}
                                                    <td className="p-3 text-center font-semibold text-gray-800 dark:text-gray-200">{row.totalStock} Adet</td>
                                                    <td className="p-3 text-center font-extrabold text-blue-600 dark:text-blue-400">{row.totalIssued} Adet</td>
                                                    <td className="p-3 text-center font-medium text-orange-500">{row.scrappedWear} Adet</td>
                                                    <td className="p-3 text-center font-medium text-red-500">{row.scrappedDamage} Adet</td>
                                                    <td className="p-3 text-center font-extrabold text-red-600 dark:text-red-500">{row.totalScrapped} Adet</td>
                                                    <td className="p-3 text-center">
                                                        <span className={`px-2 py-0.5 rounded text-xs font-black border ${Number(scrapRate) > 25 ? 'bg-red-50 text-red-600 border-red-200 dark:bg-red-950/20 dark:text-red-400' : 'bg-gray-50 text-gray-600 border-gray-200 dark:bg-gray-900/30 dark:text-gray-300'}`}>
                                                            %{scrapRate}
                                                        </span>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* --- SEKME 2: OPERATÖR RAPORU --- */}
            {activeTab === 'OPERATORS' && (
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                    <table className="w-full text-left text-sm text-gray-600 dark:text-gray-300">
                        <thead className="bg-gray-50 dark:bg-gray-900/50 text-gray-900 dark:text-white uppercase font-bold text-xs">
                            <tr>
                                <th className="p-4">Operatör Adı</th>
                                <th className="p-4 text-center">Toplam Alınan Takım</th>
                                <th className="p-4 text-center">
                                    <div className="flex flex-col items-center">
                                        <span className="text-red-600 flex items-center"><XCircle className="w-3 h-3 mr-1"/> Kırılma / Hata</span>
                                        <span className="text-[10px] font-normal text-gray-500">Performansa yansır</span>
                                    </div>
                                </th>
                                <th className="p-4 text-center">
                                    <div className="flex flex-col items-center">
                                        <span className="text-blue-600 flex items-center"><Recycle className="w-3 h-3 mr-1"/> Doğal Aşınma</span>
                                        <span className="text-[10px] font-normal text-gray-500">Ömrü bitti</span>
                                    </div>
                                </th>
                                <th className="p-4 text-center">Hata Oranı</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                            {operatorStats.length === 0 ? (
                                <tr><td colSpan="5" className="p-8 text-center text-gray-400">Bu dönem için veri bulunamadı.</td></tr>
                            ) : (
                                operatorStats.map((op, idx) => {
                                    // Hata Oranı: Sadece (Kırılma / Toplam) hesaplanıyor
                                    const rate = op.totalTaken > 0 ? ((op.totalScrap / op.totalTaken) * 100).toFixed(1) : 0;
                                    
                                    return (
                                        <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                            <td className="p-4 font-bold text-gray-900 dark:text-white">{op.name}</td>
                                            <td className="p-4 text-center font-medium">{op.totalTaken}</td>
                                            <td className="p-4 text-center font-bold text-red-600">{op.totalScrap}</td>
                                            <td className="p-4 text-center font-bold text-blue-500">{op.totalWear}</td>
                                            <td className="p-4 text-center">
                                                <span className={`px-2 py-1 rounded text-xs font-bold ${
                                                    rate > 20 ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                                                }`}>
                                                    %{rate}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {/* --- SEKME 3: KRİTİK STOK --- */}
            {activeTab === 'CRITICAL' && (
                <div className="space-y-4">
                    <div className="flex justify-between items-center bg-red-50 dark:bg-red-900/20 p-4 rounded-lg border border-red-100 dark:border-red-800">
                        <div className="text-red-800 dark:text-red-200 text-sm">
                            <strong>Dikkat:</strong> Aşağıdaki {criticalList.length} kalem malzeme belirlenen kritik seviyenin altındadır.
                        </div>
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

        </div>
    );
};

export default ToolAnalysisPage;