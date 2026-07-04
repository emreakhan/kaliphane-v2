// src/pages/MoldBasedToolTracking.js

import React, { useState, useMemo, useEffect } from 'react';
import { 
    Package, Search, Calendar, FileText, FolderOpen,
    TrendingUp, ShieldAlert, ChevronDown, ChevronUp, Clock, User, Wrench, RefreshCw
} from 'lucide-react';
import { 
    collection, onSnapshot, query, orderBy
} from '../config/firebase.js';
import { 
    TOOL_TRANSACTIONS_COLLECTION, TOOL_TRANSACTION_TYPES, PROJECT_COLLECTION
} from '../config/constants.js';

const MoldBasedToolTracking = ({ db }) => {
    const [projects, setProjects] = useState([]);
    const [transactions, setTransactions] = useState([]);
    const [selectedProjectId, setSelectedProjectId] = useState('');
    const [projectSearchTerm, setProjectSearchTerm] = useState('');
    const [isProjectDropdownOpen, setIsProjectDropdownOpen] = useState(false);
    const [loading, setLoading] = useState(true);

    // Genişletilmiş satırlar için state (parça detayları)
    const [expandedParts, setExpandedParts] = useState({});

    // 1. Projeleri ve İşlem Geçmişini Realtime Dinle
    useEffect(() => {
        if (!db) return;

        const qProjects = query(collection(db, PROJECT_COLLECTION), orderBy("moldName"));
        const unsubscribeProjects = onSnapshot(qProjects, (snapshot) => {
            const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setProjects(list);
            setLoading(false);
        }, (err) => {
            console.error("Projeleri çekme hatası:", err);
            setLoading(false);
        });

        const qTransactions = query(collection(db, TOOL_TRANSACTIONS_COLLECTION), orderBy("date", "desc"));
        const unsubscribeTransactions = onSnapshot(qTransactions, (snapshot) => {
            const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setTransactions(list);
        }, (err) => {
            console.error("İşlemleri çekme hatası:", err);
        });

        return () => {
            unsubscribeProjects();
            unsubscribeTransactions();
        };
    }, [db]);

    // Seçilen Proje Bilgileri
    const selectedProject = useMemo(() => {
        return projects.find(p => p.id === selectedProjectId);
    }, [projects, selectedProjectId]);

    // Seçilen Kalıba ait İşlemleri Filtrele
    const moldTransactions = useMemo(() => {
        if (!selectedProjectId) return [];
        return transactions.filter(t => t.projectId === selectedProjectId);
    }, [transactions, selectedProjectId]);

    // Kalıp Bazlı Takım ve Parça İstatistikleri Hesaplama
    const moldStats = useMemo(() => {
        if (!selectedProjectId) return null;

        let totalIssued = 0;
        let totalScrapped = 0;
        let totalReturned = 0;
        const partBreakdown = {};

        moldTransactions.forEach(t => {
            const partName = t.moldPart ? t.moldPart.trim().toUpperCase() : 'BELİRTİLMEMİŞ';
            const qty = Number(t.quantity) || 1;
            const toolName = t.toolName || 'Bilinmeyen Takım';

            if (!partBreakdown[partName]) {
                partBreakdown[partName] = {
                    partName: partName,
                    issuedCount: 0,
                    scrappedCount: 0,
                    returnedCount: 0,
                    tools: {}
                };
            }

            // Takım Bazlı Ayrıntılar için
            if (!partBreakdown[partName].tools[toolName]) {
                partBreakdown[partName].tools[toolName] = {
                    name: toolName,
                    issued: 0,
                    scrapped: 0,
                    returned: 0
                };
            }

            if (t.type === TOOL_TRANSACTION_TYPES.ISSUE) {
                totalIssued += qty;
                partBreakdown[partName].issuedCount += qty;
                partBreakdown[partName].tools[toolName].issued += qty;
            } else if (
                t.type === TOOL_TRANSACTION_TYPES.RETURN_SCRAP || 
                t.type === TOOL_TRANSACTION_TYPES.RETURN_SCRAP_WEAR || 
                t.type === TOOL_TRANSACTION_TYPES.RETURN_SCRAP_DAMAGE
            ) {
                totalScrapped += qty;
                partBreakdown[partName].scrappedCount += qty;
                partBreakdown[partName].tools[toolName].scrapped += qty;
            } else if (t.type === TOOL_TRANSACTION_TYPES.RETURN_HEALTHY) {
                totalReturned += qty;
                partBreakdown[partName].returnedCount += qty;
                partBreakdown[partName].tools[toolName].returned += qty;
            }
        });

        // Aktif zimmet: Verilen - İade - Hurda
        const activeCount = Math.max(0, totalIssued - totalReturned - totalScrapped);
        const scrapRate = totalIssued > 0 ? ((totalScrapped / totalIssued) * 100).toFixed(1) : '0.0';

        return {
            totalIssued,
            totalScrapped,
            totalReturned,
            activeCount,
            scrapRate,
            parts: Object.values(partBreakdown).sort((a, b) => b.issuedCount - a.issuedCount)
        };
    }, [moldTransactions, selectedProjectId]);

    const togglePartExpand = (partName) => {
        setExpandedParts(prev => ({
            ...prev,
            [partName]: !prev[partName]
        }));
    };

    // Filtrelenmiş Projeler Listesi (Arama için)
    const filteredProjects = useMemo(() => {
        return projects.filter(p => 
            p.moldName.toLowerCase().includes(projectSearchTerm.toLowerCase()) ||
            (p.customer && p.customer.toLowerCase().includes(projectSearchTerm.toLowerCase()))
        );
    }, [projects, projectSearchTerm]);

    return (
        <div className="p-6 w-full mx-auto min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-100">
            
            {/* 1. ÜST PANEL */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4 border-b border-gray-200 dark:border-gray-700 pb-6">
                <div>
                    <h1 className="text-3xl font-extrabold text-gray-900 dark:text-white flex items-center gap-3">
                        <FolderOpen className="w-8 h-8 text-indigo-600" />
                        Kalıp Bazlı Takım Takibi
                    </h1>
                    <p className="text-gray-500 dark:text-gray-400 mt-2 text-sm">
                        Kalıpların hangi parçalarında ne kadar takım harcandığını ve hurda oranlarını analiz edin.
                    </p>
                </div>

                {/* Kalıp Seçim Dropdown */}
                <div className="relative w-full md:w-80 z-30">
                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">Kalıp / Proje Seçin</label>
                    <div className="relative">
                        <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                        <input 
                            type="text"
                            placeholder="Kalıp Ara..."
                            value={projectSearchTerm}
                            onChange={(e) => {
                                setProjectSearchTerm(e.target.value);
                                setIsProjectDropdownOpen(true);
                            }}
                            onFocus={() => setIsProjectDropdownOpen(true)}
                            onBlur={() => setTimeout(() => setIsProjectDropdownOpen(false), 250)}
                            className="w-full pl-9 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-950 dark:text-white text-sm font-semibold focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                    </div>
                    {isProjectDropdownOpen && (
                        <div className="absolute w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl max-h-60 overflow-y-auto z-40 custom-scrollbar">
                            {filteredProjects.length === 0 ? (
                                <div className="px-4 py-3 text-xs text-gray-500 text-center font-bold">Kalıp bulunamadı</div>
                            ) : (
                                filteredProjects.map(p => (
                                    <div 
                                        key={p.id}
                                        onClick={() => {
                                            setSelectedProjectId(p.id);
                                            setProjectSearchTerm(`${p.moldName} (${p.customer || 'Müşteri Yok'})`);
                                            setIsProjectDropdownOpen(false);
                                        }}
                                        className={`px-4 py-2.5 cursor-pointer hover:bg-indigo-50 dark:hover:bg-indigo-950/40 border-b border-gray-100 dark:border-gray-700 last:border-0 font-bold transition ${selectedProjectId === p.id ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400' : ''}`}
                                    >
                                        <div className="text-sm">{p.moldName}</div>
                                        <div className="text-xs text-gray-400 dark:text-gray-500 font-normal">{p.customer}</div>
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </div>
            </div>

            {loading ? (
                <div className="flex flex-col items-center justify-center h-64">
                    <RefreshCw className="w-10 h-10 text-indigo-600 animate-spin mb-3" />
                    <p className="font-semibold text-gray-500">Veriler Yükleniyor...</p>
                </div>
            ) : !selectedProjectId ? (
                /* KALIP SEÇİLMEDİ UYARISI */
                <div className="flex flex-col items-center justify-center bg-white dark:bg-gray-800 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-2xl p-16 text-center shadow-sm">
                    <FolderOpen className="w-16 h-16 text-indigo-400 dark:text-indigo-600 mb-4 opacity-70" />
                    <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-2">Detayları Görmek İçin Kalıp Seçin</h3>
                    <p className="text-gray-500 dark:text-gray-400 max-w-md text-sm">
                        Yukarıdaki arama çubuğunu kullanarak takım kullanım istatistiklerini, parça bazlı sarfiyatı ve hurda oranlarını incelemek istediğiniz kalıbı seçin.
                    </p>
                </div>
            ) : (
                /* DETAYLAR PANELİ */
                <div className="space-y-6">
                    
                    {/* KALIP BİLGİ KARTI VE METRİKLER */}
                    <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
                        
                        {/* Kalıp Genel Bilgisi */}
                        <div className="bg-gradient-to-br from-indigo-600 to-indigo-800 text-white rounded-2xl p-6 shadow-lg flex flex-col justify-between">
                            <div>
                                <span className="text-[10px] bg-white/20 text-white px-2 py-0.5 rounded font-black tracking-wider uppercase">SEÇİLİ KALIP</span>
                                <h2 className="text-2xl font-black mt-2 leading-tight break-words">{selectedProject?.moldName}</h2>
                                <p className="text-indigo-200 text-sm font-semibold mt-1">{selectedProject?.customer || 'Müşteri Belirtilmemiş'}</p>
                            </div>
                            <div className="border-t border-indigo-400/30 pt-4 mt-4 text-xs text-indigo-100 font-semibold space-y-1">
                                <div><span className="opacity-75">Durum:</span> {selectedProject?.status || 'Aktif'}</div>
                                <div><span className="opacity-75">Kayıtlı İşlem:</span> {moldTransactions.length} adet</div>
                            </div>
                        </div>

                        {/* Toplam Verilen */}
                        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-200 dark:border-gray-700 shadow-sm flex flex-col justify-between">
                            <div className="flex justify-between items-start">
                                <span className="text-sm font-bold text-gray-500 dark:text-gray-400">Verilen Takım</span>
                                <Package className="w-5 h-5 text-blue-500" />
                            </div>
                            <div className="mt-4">
                                <div className="text-3xl font-black text-gray-900 dark:text-white">{moldStats.totalIssued} Adet</div>
                                <p className="text-xs text-gray-400 mt-1 font-bold">Kalıp için depodan çıkarılan toplam takım sayısı.</p>
                            </div>
                        </div>

                        {/* Toplam Hurda */}
                        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-200 dark:border-gray-700 shadow-sm flex flex-col justify-between">
                            <div className="flex justify-between items-start">
                                <span className="text-sm font-bold text-gray-500 dark:text-gray-400">Hurdaya Çıkan</span>
                                <ShieldAlert className="w-5 h-5 text-red-500" />
                            </div>
                            <div className="mt-4">
                                <div className="text-3xl font-black text-red-600 dark:text-red-400">{moldStats.totalScrapped} Adet</div>
                                <p className="text-xs text-red-400 dark:text-red-500/80 mt-1 font-bold">Hurda oranı: <span className="underline font-black">%{moldStats.scrapRate}</span></p>
                            </div>
                        </div>

                        {/* Aktif Zimmet */}
                        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-200 dark:border-gray-700 shadow-sm flex flex-col justify-between">
                            <div className="flex justify-between items-start">
                                <span className="text-sm font-bold text-gray-500 dark:text-gray-400">Tezgahlardaki Aktif Takım</span>
                                <Wrench className="w-5 h-5 text-indigo-500" />
                            </div>
                            <div className="mt-4">
                                <div className="text-3xl font-black text-indigo-600 dark:text-indigo-400">{moldStats.activeCount} Adet</div>
                                <p className="text-xs text-gray-400 mt-1 font-bold">Şu an tezgahta/operatörde kullanımda olanlar.</p>
                            </div>
                        </div>
                    </div>

                    {/* PARÇA BAZLI KIRILIM LİSTESİ */}
                    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
                        <div className="p-5 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                            <h3 className="font-bold text-lg text-gray-900 dark:text-white flex items-center gap-2">
                                <TrendingUp className="w-5 h-5 text-indigo-500" />
                                Parça Bazlı Takım Kullanım Kırılımı
                            </h3>
                            <span className="text-xs font-bold text-gray-400 dark:text-gray-500">Satırlara tıklayarak takım detaylarını görebilirsiniz</span>
                        </div>

                        {moldStats.parts.length === 0 ? (
                            <div className="p-8 text-center text-gray-500 dark:text-gray-400 font-semibold">
                                Bu kalıba ait herhangi bir takım veya parça verisi bulunmuyor.
                            </div>
                        ) : (
                            <div className="divide-y divide-gray-150 dark:divide-gray-700">
                                {moldStats.parts.map(part => {
                                    const partScrapRate = part.issuedCount > 0 ? ((part.scrappedCount / part.issuedCount) * 100).toFixed(1) : '0.0';
                                    const isExpanded = !!expandedParts[part.partName];

                                    return (
                                        <div key={part.partName} className="transition">
                                            {/* Parça Satırı Ana Başlık */}
                                            <div 
                                                onClick={() => togglePartExpand(part.partName)}
                                                className="px-6 py-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/30 cursor-pointer select-none"
                                            >
                                                <div className="flex-1 min-w-0 pr-4">
                                                    <span className="text-xs text-indigo-550 dark:text-indigo-400 font-extrabold tracking-wide">PARÇA / BÖLÜM</span>
                                                    <h4 className="text-base font-black text-gray-900 dark:text-white mt-0.5">{part.partName}</h4>
                                                </div>

                                                <div className="flex items-center gap-6 md:gap-12 shrink-0">
                                                    <div className="text-center">
                                                        <span className="text-[10px] text-gray-400 font-bold block">VERİLEN</span>
                                                        <span className="font-extrabold text-sm text-gray-900 dark:text-white">{part.issuedCount} Adet</span>
                                                    </div>
                                                    <div className="text-center">
                                                        <span className="text-[10px] text-gray-400 font-bold block">HURDA</span>
                                                        <span className="font-extrabold text-sm text-red-650 dark:text-red-400">{part.scrappedCount} Adet</span>
                                                    </div>
                                                    <div className="text-center">
                                                        <span className="text-[10px] text-gray-400 font-bold block">HURDA ORANI</span>
                                                        <span className={`px-2 py-0.5 rounded text-xs font-black border ${Number(partScrapRate) > 30 ? 'bg-red-50 text-red-650 border-red-200 dark:bg-red-950/20 dark:text-red-400' : 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950/20 dark:text-green-400'}`}>
                                                            %{partScrapRate}
                                                        </span>
                                                    </div>
                                                    <div>
                                                        {isExpanded ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Genişletilmiş Takım Detayları */}
                                            {isExpanded && (
                                                <div className="bg-gray-50/50 dark:bg-gray-900/20 px-8 py-4 border-t border-gray-100 dark:border-gray-800">
                                                    <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
                                                        <table className="min-w-full divide-y divide-gray-250 dark:divide-gray-700">
                                                            <thead className="bg-gray-100 dark:bg-gray-800 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                                                                <tr>
                                                                    <th className="px-4 py-2">Takım Adı</th>
                                                                    <th className="px-4 py-2 text-center w-24">Verilen</th>
                                                                    <th className="px-4 py-2 text-center w-24">İade Edilen</th>
                                                                    <th className="px-4 py-2 text-center w-24">Hurda</th>
                                                                    <th className="px-4 py-2 text-center w-28">Hurda Oranı</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-gray-150 dark:divide-gray-750 bg-white dark:bg-gray-800">
                                                                {Object.values(part.tools).map(tool => {
                                                                    const toolScrapRate = tool.issued > 0 ? ((tool.scrapped / tool.issued) * 100).toFixed(1) : '0.0';
                                                                    return (
                                                                        <tr key={tool.name} className="text-sm hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                                                            <td className="px-4 py-2 font-bold text-gray-800 dark:text-gray-250">{tool.name}</td>
                                                                            <td className="px-4 py-2 text-center font-extrabold text-blue-600 dark:text-blue-400">{tool.issued}</td>
                                                                            <td className="px-4 py-2 text-center font-extrabold text-green-600 dark:text-green-400">{tool.returned}</td>
                                                                            <td className="px-4 py-2 text-center font-extrabold text-red-600 dark:text-red-400">{tool.scrapped}</td>
                                                                            <td className="px-4 py-2 text-center">
                                                                                <span className={`px-1.5 py-0.5 rounded text-xs font-black ${Number(toolScrapRate) > 30 ? 'bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-400' : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'}`}>
                                                                                    %{toolScrapRate}
                                                                                </span>
                                                                            </td>
                                                                        </tr>
                                                                    );
                                                                })}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* HAREKET LOGLARI (İŞLEM GEÇMİŞİ) */}
                    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
                        <div className="p-5 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                            <h3 className="font-bold text-lg text-gray-900 dark:text-white flex items-center gap-2">
                                <Clock className="w-5 h-5 text-indigo-500" />
                                Kalıp Takım Hareket Geçmişi
                            </h3>
                            <span className="text-xs bg-indigo-50 text-indigo-755 dark:bg-indigo-900/30 dark:text-indigo-300 px-2.5 py-1 rounded-md font-bold">
                                Toplam {moldTransactions.length} Kayıt
                            </span>
                        </div>

                        <div className="p-5">
                            {moldTransactions.length === 0 ? (
                                <div className="text-center py-10 text-gray-500 font-semibold">Bu kalıba ait işlem geçmişi yok.</div>
                            ) : (
                                <div className="space-y-3.5 max-h-[400px] overflow-y-auto custom-scrollbar pr-2">
                                    {moldTransactions.map(t => {
                                        let actionBadge = null;
                                        if (t.type === TOOL_TRANSACTION_TYPES.ISSUE) {
                                            actionBadge = <span className="px-2 py-0.5 rounded text-[10px] font-black bg-blue-100 text-blue-800 border border-blue-200">VERİLDİ</span>;
                                        } else if (t.type === TOOL_TRANSACTION_TYPES.RETURN_HEALTHY) {
                                            actionBadge = <span className="px-2 py-0.5 rounded text-[10px] font-black bg-green-100 text-green-800 border border-green-200">İADE</span>;
                                        } else if (
                                            t.type === TOOL_TRANSACTION_TYPES.RETURN_SCRAP || 
                                            t.type === TOOL_TRANSACTION_TYPES.RETURN_SCRAP_WEAR || 
                                            t.type === TOOL_TRANSACTION_TYPES.RETURN_SCRAP_DAMAGE
                                        ) {
                                            actionBadge = <span className="px-2 py-0.5 rounded text-[10px] font-black bg-red-100 text-red-800 border border-red-200">HURDA</span>;
                                        }

                                        return (
                                            <div key={t.id} className="flex flex-col md:flex-row md:items-center justify-between p-3.5 bg-gray-50 dark:bg-gray-900/60 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-800 transition">
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        {actionBadge}
                                                        <span className="font-extrabold text-sm text-gray-800 dark:text-white">{t.toolName}</span>
                                                        <span className="text-xs text-gray-500 font-bold">({t.quantity || 1} Adet)</span>
                                                    </div>
                                                    <div className="flex items-center gap-4 mt-2 text-xs text-gray-500 dark:text-gray-400 font-semibold">
                                                        <span className="flex items-center gap-1"><User className="w-3.5 h-3.5"/> Alıcı: {t.receiver || '-'}</span>
                                                        {t.moldPart && <span className="flex items-center gap-1"><FileText className="w-3.5 h-3.5"/> Parça: <span className="text-indigo-600 dark:text-indigo-400 font-bold">{t.moldPart}</span></span>}
                                                        {t.notes && <span className="text-gray-400 italic">Not: {t.notes}</span>}
                                                    </div>
                                                </div>

                                                <div className="text-right mt-2 md:mt-0 text-xs text-gray-400 dark:text-gray-500 font-semibold shrink-0">
                                                    <div className="flex items-center gap-1 justify-end"><Calendar className="w-3.5 h-3.5"/> {t.date}</div>
                                                    <div className="mt-0.5">Tezgah: {t.machineName || 'Bilinmiyor'}</div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MoldBasedToolTracking;
