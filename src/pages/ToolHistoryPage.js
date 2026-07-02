// src/pages/ToolHistoryPage.js

import React, { useState, useEffect, useMemo } from 'react';
import { 
    History, Search, User, CheckCircle, 
    AlertOctagon, ArrowRightLeft, Clock, Recycle, Plus, X
} from 'lucide-react';
import { collection, query, orderBy, limit, onSnapshot } from '../config/firebase.js';
import { TOOL_TRANSACTIONS_COLLECTION, TOOL_TRANSACTION_TYPES } from '../config/constants.js';

const COLOR_PALETTES = [
    'from-blue-600 to-indigo-700',
    'from-emerald-600 to-teal-700',
    'from-rose-600 to-pink-700',
    'from-amber-500 to-orange-600',
    'from-purple-600 to-violet-700',
    'from-cyan-600 to-blue-700'
];

const ToolHistoryPage = ({ machines, db, tools = [] }) => {
    const [activeTab, setActiveTab] = useState('ACTIVE'); 
    const [searchTerm, setSearchTerm] = useState('');
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(true);

    // Hızlı Takımlar State (localStorage üzerinde saklanır)
    const [quickTools, setQuickTools] = useState(() => {
        const saved = localStorage.getItem('kaliphane_quick_tools');
        return saved ? JSON.parse(saved) : [];
    });

    // Arama ve seçim state'leri
    const [toolSearchQuery, setToolSearchQuery] = useState('');
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [selectedTool, setSelectedTool] = useState(null);

    useEffect(() => {
        localStorage.setItem('kaliphane_quick_tools', JSON.stringify(quickTools));
    }, [quickTools]);

    // Depodaki benzersiz takımları listele
    const uniqueDepotTools = useMemo(() => {
        const seen = new Set();
        const list = [];
        (tools || []).forEach(t => {
            const key = t.productCode || t.name;
            if (!seen.has(key)) {
                seen.add(key);
                list.push({
                    id: t.id,
                    name: t.name,
                    productCode: t.productCode || ''
                });
            }
        });
        return list.sort((a, b) => a.name.localeCompare(b.name, 'tr', { sensitivity: 'base' }));
    }, [tools]);

    const searchedDepotTools = useMemo(() => {
        if (!toolSearchQuery) return uniqueDepotTools;
        const lower = toolSearchQuery.toLowerCase();
        return uniqueDepotTools.filter(t => 
            t.name.toLowerCase().includes(lower) || 
            (t.productCode && t.productCode.toLowerCase().includes(lower))
        );
    }, [uniqueDepotTools, toolSearchQuery]);

    const handleRemoveQuickTool = (toolKey) => {
        setQuickTools(quickTools.filter(qt => (qt.productCode || qt.name) !== toolKey));
    };

    const handleQuickToolClick = (tool) => {
        const queryText = tool.productCode || tool.name;
        if (searchTerm.toLowerCase() === queryText.toLowerCase()) {
            setSearchTerm('');
        } else {
            setSearchTerm(queryText);
        }
    };

    // --- GEÇMİŞ VERİLERİ ÇEKME ---
    useEffect(() => {
        if (!db) return;
        
        const q = query(
            collection(db, TOOL_TRANSACTIONS_COLLECTION), 
            orderBy("date", "desc"), 
            limit(500)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setTransactions(data);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [db]);

    // --- 1. LİSTE: AKTİF ZİMMETLER ---
    const activeLoans = useMemo(() => {
        let loans = [];
        machines.forEach(machine => {
            if (machine.currentTools && machine.currentTools.length > 0) {
                machine.currentTools.forEach(tool => {
                    loans.push({
                        ...tool,
                        machineName: machine.name,
                        machineId: machine.id
                    });
                });
            }
        });

        if (searchTerm) {
            const lowerTerm = searchTerm.toLowerCase();
            loans = loans.filter(l => 
                (l.receivedBy && l.receivedBy.toLowerCase().includes(lowerTerm)) ||
                (l.toolName && l.toolName.toLowerCase().includes(lowerTerm)) ||
                (l.productCode && l.productCode.toLowerCase().includes(lowerTerm)) ||
                (l.machineName && l.machineName.toLowerCase().includes(lowerTerm))
            );
        }

        return loans.sort((a, b) => new Date(a.givenDate) - new Date(b.givenDate));
    }, [machines, searchTerm]);

    // --- 2. LİSTE: GEÇMİŞ İŞLEM KAYITLARI ---
    const filteredHistory = useMemo(() => {
        if (!searchTerm) return transactions;
        const lowerTerm = searchTerm.toLowerCase();
        return transactions.filter(t => 
            (t.receiver && t.receiver.toLowerCase().includes(lowerTerm)) ||
            (t.user && t.user.toLowerCase().includes(lowerTerm)) ||
            (t.toolName && t.toolName.toLowerCase().includes(lowerTerm)) ||
            (t.productCode && t.productCode.toLowerCase().includes(lowerTerm)) ||
            (t.machineName && t.machineName.toLowerCase().includes(lowerTerm))
        );
    }, [transactions, searchTerm]);

    // Yardımcı: Tarih Formatla
    const formatDate = (dateString) => {
        if (!dateString) return '-';
        return new Date(dateString).toLocaleString('tr-TR', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    };

    // Yardımcı: İşlem Tipi Rozeti
    const getStatusBadge = (type) => {
        switch (type) {
            case TOOL_TRANSACTION_TYPES.ISSUE:
                return <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs font-bold flex items-center w-fit"><ArrowRightLeft className="w-3 h-3 mr-1"/> Verildi</span>;
            case TOOL_TRANSACTION_TYPES.RETURN_HEALTHY:
                return <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs font-bold flex items-center w-fit"><CheckCircle className="w-3 h-3 mr-1"/> Sağlam İade</span>;
            case TOOL_TRANSACTION_TYPES.RETURN_SCRAP:
            case TOOL_TRANSACTION_TYPES.RETURN_SCRAP_DAMAGE:
                return <span className="bg-red-100 text-red-800 px-2 py-1 rounded text-xs font-bold flex items-center w-fit"><AlertOctagon className="w-3 h-3 mr-1"/> Hurda/Iskarta</span>;
            case TOOL_TRANSACTION_TYPES.RETURN_SCRAP_WEAR:
                return <span className="bg-orange-100 text-orange-800 px-2 py-1 rounded text-xs font-bold flex items-center w-fit"><Recycle className="w-3 h-3 mr-1"/> Doğal Aşınma</span>;
            case TOOL_TRANSACTION_TYPES.TRANSFER:
                return <span className="bg-orange-100 text-orange-800 px-2 py-1 rounded text-xs font-bold flex items-center w-fit"><ArrowRightLeft className="w-3 h-3 mr-1"/> Transfer</span>;
            default:
                return <span className="bg-gray-100 text-gray-800 px-2 py-1 rounded text-xs font-bold">{type}</span>;
        }
    };

    if (loading) return <div className="p-8 text-center text-gray-500">Yükleniyor...</div>;

    return (
        <div className="p-6 max-w-7xl mx-auto min-h-screen bg-gray-50 dark:bg-gray-900">
            <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center">
                        <History className="w-8 h-8 mr-3 text-purple-600" />
                        Geçmiş & Takip
                    </h1>
                    <p className="text-gray-500 text-sm mt-1">
                        Operatör bazlı zimmet takibi ve geçmiş işlem dökümü.
                    </p>
                </div>

                <div className="relative w-full md:w-1/3">
                    <Search className="absolute left-3 top-2.5 w-5 h-5 text-gray-400" />
                    <input 
                        type="text" 
                        placeholder="Operatör, Takım veya Tezgah Ara..." 
                        className="w-full pl-10 p-3 border rounded-lg shadow-sm focus:ring-2 focus:ring-purple-500 dark:bg-gray-800 dark:border-gray-700 dark:text-white"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            <div className="flex flex-col lg:flex-row gap-6 mt-6">
                
                {/* SOL SİDEBAR: HIZLI TAKIM ARAMA KUTUCUKLARI */}
                <div className="w-full lg:w-72 shrink-0 bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-200 dark:border-gray-700 shadow-sm self-start">
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-2 flex items-center">
                        <Search className="w-4 h-4 mr-2 text-purple-600" /> Hızlı Arama Butonlarım
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                        Sık aradığınız takımları buraya ekleyerek tek tıkla filtreleme yapabilirsiniz.
                    </p>

                    <div className="space-y-3 mb-5">
                        <div className="relative">
                            <input 
                                type="text"
                                placeholder="Takım adı veya kod ara..."
                                value={toolSearchQuery}
                                onChange={(e) => {
                                    setToolSearchQuery(e.target.value);
                                    setIsDropdownOpen(true);
                                    setSelectedTool(null);
                                }}
                                onFocus={() => setIsDropdownOpen(true)}
                                onBlur={() => {
                                    setTimeout(() => setIsDropdownOpen(false), 200);
                                }}
                                className="w-full text-xs p-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-purple-500"
                            />
                            {isDropdownOpen && searchedDepotTools.length > 0 && (
                                <div className="absolute left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl z-50 custom-scrollbar">
                                    {searchedDepotTools.map(t => (
                                        <div 
                                            key={t.id}
                                            onClick={() => {
                                                setSelectedTool(t);
                                                setToolSearchQuery(t.productCode ? `[${t.productCode}] ${t.name}` : t.name);
                                                setIsDropdownOpen(false);
                                            }}
                                            className="p-2.5 text-xs hover:bg-purple-50 dark:hover:bg-purple-900/40 text-gray-950 dark:text-white cursor-pointer border-b border-gray-100 dark:border-gray-700 last:border-b-0 font-semibold transition-colors"
                                        >
                                            {t.productCode ? <span className="font-bold text-purple-600 dark:text-purple-400 mr-1.5">[{t.productCode}]</span> : ''}
                                            {t.name}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <button 
                            onClick={() => {
                                if (!selectedTool) {
                                    alert("Lütfen önce listeden arayarak bir takım seçin.");
                                    return;
                                }
                                const exists = quickTools.some(qt => (qt.productCode || qt.name) === (selectedTool.productCode || selectedTool.name));
                                if (exists) {
                                    alert("Bu takım zaten hızlı arama butonlarınızda ekli.");
                                    return;
                                }
                                setQuickTools([...quickTools, { name: selectedTool.name, productCode: selectedTool.productCode }]);
                                setSelectedTool(null);
                                setToolSearchQuery('');
                            }}
                            className="w-full bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white p-2.5 rounded-lg text-xs font-bold transition-all shadow-md flex items-center justify-center gap-1.5"
                        >
                            <Plus className="w-4 h-4" /> Hızlı Arama Butonu Ekle
                        </button>
                    </div>

                    {quickTools.length === 0 ? (
                        <div className="text-center py-6 text-xs text-gray-400 dark:text-gray-500 border border-dashed border-gray-300 dark:border-gray-700 rounded-lg">
                            Henüz hızlı arama takımı eklenmedi. Üstteki menüden seçip ekleyebilirsiniz.
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 lg:grid-cols-1 gap-2.5">
                            {quickTools.map((qt, idx) => {
                                const key = qt.productCode || qt.name;
                                const isActive = searchTerm.toLowerCase() === key.toLowerCase();
                                const palette = COLOR_PALETTES[idx % COLOR_PALETTES.length];
                                return (
                                    <div 
                                        key={idx}
                                        className={`relative rounded-xl p-3 shadow-md flex flex-col justify-between group cursor-pointer transition-all hover:scale-[1.02] border-2 ${
                                            isActive ? 'border-purple-500 ring-2 ring-purple-500/20' : 'border-transparent'
                                        } bg-gradient-to-br ${palette} text-white min-h-[75px]`}
                                        onClick={() => handleQuickToolClick(qt)}
                                    >
                                        <button 
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleRemoveQuickTool(key);
                                            }}
                                            className="absolute top-1.5 right-1.5 p-1 bg-black/25 hover:bg-black/45 rounded-full text-white/80 hover:text-white transition-opacity lg:opacity-0 lg:group-hover:opacity-100"
                                            title="Hızlı aramalardan kaldır"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                        <div className="text-[10px] uppercase font-bold tracking-wider opacity-85">
                                            {qt.productCode || 'KODSUZ'}
                                        </div>
                                        <div className="text-xs font-extrabold mt-1 leading-tight break-words pr-4">
                                            {qt.name}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* SAĞ TARAF: ANA TABLO VE SEKME BÖLÜMÜ */}
                <div className="flex-1 min-w-0">
                    <div className="flex space-x-2 mb-6 border-b border-gray-200 dark:border-gray-700">
                        <button
                            onClick={() => setActiveTab('ACTIVE')}
                            className={`pb-3 px-6 font-bold text-sm flex items-center transition-colors ${
                                activeTab === 'ACTIVE' 
                                ? 'border-b-2 border-purple-600 text-purple-600' 
                                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'
                            }`}
                        >
                            <User className="w-4 h-4 mr-2" /> Şu An Kimde? ({activeLoans.length})
                        </button>
                        <button
                            onClick={() => setActiveTab('HISTORY')}
                            className={`pb-3 px-6 font-bold text-sm flex items-center transition-colors ${
                                activeTab === 'HISTORY' 
                                ? 'border-b-2 border-purple-600 text-purple-600' 
                                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'
                            }`}
                        >
                            <History className="w-4 h-4 mr-2" /> İşlem Geçmişi
                        </button>
                    </div>

                    {activeTab === 'ACTIVE' && (
                        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[700px] text-left text-sm text-gray-600 dark:text-gray-300">
                                    <thead className="bg-gray-50 dark:bg-gray-900/50 text-gray-900 dark:text-white uppercase font-bold text-xs">
                                        <tr>
                                            <th className="p-4">Operatör (Alan Kişi)</th>
                                            <th className="p-4">Tezgah</th>
                                            <th className="p-4">Takım Adı / Kod</th>
                                            <th className="p-4">Veriliş Tarihi</th>
                                            <th className="p-4">Veren Sorumlu</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                                        {activeLoans.length === 0 ? (
                                            <tr>
                                                <td colSpan="5" className="p-8 text-center text-gray-400">
                                                    Aktif zimmet kaydı bulunamadı.
                                                </td>
                                            </tr>
                                        ) : (
                                            activeLoans.map((loan, idx) => (
                                                <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition">
                                                    <td className="p-4 font-bold text-gray-900 dark:text-white flex items-center">
                                                        <div className="w-8 h-8 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center mr-3 font-bold text-xs">
                                                            {loan.receivedBy ? loan.receivedBy.charAt(0) : '?'}
                                                        </div>
                                                        {loan.receivedBy || 'Belirtilmedi'}
                                                    </td>
                                                    <td className="p-4">
                                                        <span className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-xs font-bold">
                                                            {loan.machineName}
                                                        </span>
                                                    </td>
                                                    <td className="p-4">
                                                        <div className="font-medium">{loan.toolName}</div>
                                                        {loan.productCode && <div className="text-xs text-gray-400">{loan.productCode}</div>}
                                                    </td>
                                                    <td className="p-4">
                                                        <div className="flex items-center">
                                                            <Clock className="w-4 h-4 mr-2 text-gray-400" />
                                                            {formatDate(loan.givenDate)}
                                                        </div>
                                                    </td>
                                                    <td className="p-4 text-xs">
                                                        {loan.givenBy}
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {activeTab === 'HISTORY' && (
                        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                            {loading ? (
                                <div className="p-10 text-center text-gray-500">Yükleniyor...</div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full min-w-[950px] text-left text-sm text-gray-600 dark:text-gray-300">
                                        <thead className="bg-gray-50 dark:bg-gray-900/50 text-gray-900 dark:text-white uppercase font-bold text-xs">
                                            <tr>
                                                <th className="p-4 w-40">Tarih</th>
                                                <th className="p-4 w-32">İşlem Tipi</th>
                                                <th className="p-4">Takım Adı</th>
                                                <th className="p-4">Adet</th>
                                                <th className="p-4">Tezgah / Bölüm</th>
                                                <th className="p-4">Sorumlu / Alan Kişi</th>
                                                <th className="p-4">İşlemi Yapan</th>
                                                <th className="p-4">Notlar</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                                            {filteredHistory.length === 0 ? (
                                                <tr>
                                                    <td colSpan="8" className="p-8 text-center text-gray-400">
                                                        İşlem geçmişi bulunamadı.
                                                    </td>
                                                </tr>
                                            ) : (
                                                filteredHistory.map((tx) => (
                                                    <tr key={tx.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition">
                                                        <td className="p-4 text-xs font-mono">
                                                            {formatDate(tx.date)}
                                                        </td>
                                                        <td className="p-4">
                                                            {getStatusBadge(tx.type)}
                                                        </td>
                                                        <td className="p-4 font-medium text-gray-900 dark:text-white">
                                                            {tx.toolName}
                                                        </td>
                                                        <td className="p-4 font-bold">{tx.quantity}</td>
                                                        <td className="p-4">
                                                            {tx.machineName ? (
                                                                <span className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-xs">
                                                                    {tx.machineName}
                                                                </span>
                                                            ) : (
                                                                <span className="text-gray-400">-</span>
                                                            )}
                                                            {tx.toMachine && (
                                                                <span className="ml-1 text-xs text-orange-600">
                                                                    → {tx.toMachine}
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td className="p-4 font-bold text-gray-800 dark:text-gray-200">
                                                            {tx.receiver || '-'}
                                                        </td>
                                                        <td className="p-4 text-xs">{tx.user}</td>
                                                        <td className="p-4 text-xs italic max-w-xs truncate" title={tx.notes}>
                                                            {tx.notes || ''}
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ToolHistoryPage;