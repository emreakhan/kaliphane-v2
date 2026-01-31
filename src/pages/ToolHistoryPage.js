// src/pages/ToolHistoryPage.js

import React, { useState, useEffect, useMemo } from 'react';
import { 
    History, Search, User, FileText, CheckCircle, 
    AlertOctagon, ArrowRightLeft, Clock, Recycle
} from 'lucide-react';
import { collection, query, orderBy, limit, onSnapshot } from '../config/firebase.js';
import { TOOL_TRANSACTIONS_COLLECTION, TOOL_TRANSACTION_TYPES } from '../config/constants.js';

const ToolHistoryPage = ({ machines, db }) => {
    const [activeTab, setActiveTab] = useState('ACTIVE'); 
    const [searchTerm, setSearchTerm] = useState('');
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(true);

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
                l.toolName.toLowerCase().includes(lowerTerm) ||
                l.machineName.toLowerCase().includes(lowerTerm)
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
                        <table className="w-full text-left text-sm text-gray-600 dark:text-gray-300">
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
                            <table className="w-full text-left text-sm text-gray-600 dark:text-gray-300">
                                <thead className="bg-gray-50 dark:bg-gray-900/50 text-gray-900 dark:text-white uppercase font-bold text-xs">
                                    <tr>
                                        <th className="p-4 w-40">Tarih</th>
                                        <th className="p-4 w-32">İşlem Tipi</th>
                                        <th className="p-4">Takım Adı</th>
                                        <th className="p-4">Adet</th>
                                        <th className="p-4">Tezgah / Bölüm</th>
                                        {/* YENİ SÜTUN EKLENDİ */}
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
                                                
                                                {/* YENİ VERİ GÖSTERİMİ */}
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
    );
};

export default ToolHistoryPage;