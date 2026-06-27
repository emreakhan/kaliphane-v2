// src/pages/MoldMaterialDebitsPage.js

import React, { useState, useEffect, useMemo } from 'react';
import { 
    Layers, Search, Trash2, Calendar, User, Monitor, Package, RefreshCw, X, ShieldAlert, ChevronRight, Filter 
} from 'lucide-react';
import { 
    db, collection, query, onSnapshot, doc, deleteDoc 
} from '../config/firebase.js';
import { MOLD_MATERIAL_HANDOUTS_COLLECTION } from '../config/constants.js';

const MoldMaterialDebitsPage = ({ loggedInUser, personnel = [] }) => {
    const [debits, setDebits] = useState([]);
    const [loading, setLoading] = useState(true);
    
    // Left column (Personnel list) state
    const [personnelSearchTerm, setPersonnelSearchTerm] = useState('');
    const [selectedPerson, setSelectedPerson] = useState(null);

    // Right column (Debits list) state
    const [materialSearchTerm, setMaterialSearchTerm] = useState('');
    const [selectedMoldFilter, setSelectedMoldFilter] = useState('TÜMÜ');

    useEffect(() => {
        if (!db) return;
        const q = query(collection(db, MOLD_MATERIAL_HANDOUTS_COLLECTION));
        const unsub = onSnapshot(q, (snapshot) => {
            const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            // Sort from newest to oldest
            list.sort((a, b) => {
                const dateA = a.givenDate ? new Date(a.givenDate) : new Date(0);
                const dateB = b.givenDate ? new Date(b.givenDate) : new Date(0);
                return dateB - dateA;
            });
            setDebits(list);
            setLoading(false);
        }, (error) => {
            console.error("Zimmetler çekilirken hata:", error);
            setLoading(false);
        });
        return () => unsub();
    }, []);

    // Helper to calculate debits count for each person
    const getPersonnelDebitCount = (personName) => {
        return debits.filter(d => d.receivedBy === personName).length;
    };

    // Process and sort personnel list
    const sortedPersonnel = useMemo(() => {
        const list = [...personnel];
        return list.map(p => {
            const count = getPersonnelDebitCount(p.name);
            return { ...p, debitCount: count };
        }).sort((a, b) => {
            // Persons with debits first
            if (b.debitCount !== a.debitCount) {
                return b.debitCount - a.debitCount;
            }
            // Then alphabetically
            return a.name.localeCompare(b.name);
        });
    }, [personnel, debits]);

    // Filter personnel list based on search term
    const filteredPersonnel = useMemo(() => {
        if (!personnelSearchTerm.trim()) return sortedPersonnel;
        const lower = personnelSearchTerm.toLowerCase().trim();
        return sortedPersonnel.filter(p => p.name.toLowerCase().includes(lower));
    }, [sortedPersonnel, personnelSearchTerm]);

    // Auto-select first person with debits on load
    useEffect(() => {
        if (!selectedPerson && sortedPersonnel.length > 0) {
            const firstWithDebit = sortedPersonnel.find(p => p.debitCount > 0);
            if (firstWithDebit) {
                setSelectedPerson(firstWithDebit);
            } else {
                setSelectedPerson(sortedPersonnel[0]);
            }
        }
    }, [sortedPersonnel, selectedPerson]);

    // Right column data: Debits belonging to selected person
    const personDebits = useMemo(() => {
        if (!selectedPerson) return [];
        return debits.filter(d => d.receivedBy === selectedPerson.name);
    }, [debits, selectedPerson]);

    // Unique mold names for the selected person's debits
    const uniqueMolds = useMemo(() => {
        const set = new Set();
        personDebits.forEach(d => {
            const parts = d.materialName ? d.materialName.split(' - ') : [];
            if (parts.length > 1) {
                set.add(parts[0]);
            } else {
                set.add('Diğer');
            }
        });
        return Array.from(set).sort();
    }, [personDebits]);

    // Reset mold filter when selected person changes
    useEffect(() => {
        setSelectedMoldFilter('TÜMÜ');
        setMaterialSearchTerm('');
    }, [selectedPerson]);

    // Filter right-side debits list
    const filteredDebits = useMemo(() => {
        let list = personDebits;
        if (selectedMoldFilter && selectedMoldFilter !== 'TÜMÜ') {
            list = list.filter(d => {
                const parts = d.materialName ? d.materialName.split(' - ') : [];
                const moldName = parts.length > 1 ? parts[0] : 'Diğer';
                return moldName === selectedMoldFilter;
            });
        }
        if (materialSearchTerm.trim()) {
            const lower = materialSearchTerm.toLowerCase().trim();
            list = list.filter(d => 
                (d.materialName && d.materialName.toLowerCase().includes(lower)) ||
                (d.productCode && d.productCode.toLowerCase().includes(lower))
            );
        }
        return list;
    }, [personDebits, selectedMoldFilter, materialSearchTerm]);

    const handleDeleteDebit = async (id) => {
        if (!window.confirm("Bu zimmet kaydını kalıcı olarak silmek istediğinize emin misiniz?")) return;
        try {
            await deleteDoc(doc(db, MOLD_MATERIAL_HANDOUTS_COLLECTION, id));
        } catch (error) {
            console.error("Kayıt silinirken hata:", error);
            alert("Kayıt silinemedi.");
        }
    };

    return (
        <div className="flex h-[calc(100vh-64px)] overflow-hidden bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
            
            {/* 1. SOL PANEL: PERSONEL LİSTESİ */}
            <div className="w-1/3 md:w-1/4 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col shrink-0">
                {/* Sol Panel Arama Alanı */}
                <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/50">
                    <h3 className="text-sm font-black text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <User className="w-4 h-4 text-purple-500" /> Personel Listesi
                    </h3>
                    <div className="relative">
                        <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                        <input 
                            type="text" 
                            placeholder="Personel ara..." 
                            value={personnelSearchTerm} 
                            onChange={(e) => setPersonnelSearchTerm(e.target.value)} 
                            className="w-full pl-9 pr-8 py-2 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-xs outline-none focus:ring-2 focus:ring-purple-500 font-bold" 
                        />
                        {personnelSearchTerm && (
                            <button onClick={() => setPersonnelSearchTerm('')} className="absolute right-2.5 top-2.5 text-gray-400 hover:text-gray-600">
                                <X className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>
                </div>

                {/* Sol Panel Personel Listesi */}
                <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                    {filteredPersonnel.length === 0 ? (
                        <div className="p-4 text-center text-xs text-gray-400 font-bold italic">Personel bulunamadı.</div>
                    ) : (
                        filteredPersonnel.map(person => {
                            const isSelected = selectedPerson?.id === person.id;
                            return (
                                <button
                                    key={person.id}
                                    onClick={() => setSelectedPerson(person)}
                                    className={`w-full flex items-center justify-between p-3 rounded-xl transition text-left ${
                                        isSelected 
                                        ? 'bg-purple-600 text-white font-bold shadow-md' 
                                        : 'hover:bg-gray-50 dark:hover:bg-gray-700/50 text-gray-700 dark:text-gray-300'
                                    }`}
                                >
                                    <div className="min-w-0 flex-1 pr-2">
                                        <div className={`text-sm truncate ${isSelected ? 'font-extrabold' : 'font-bold'}`}>
                                            {person.name}
                                        </div>
                                        <div className={`text-[10px] truncate mt-0.5 ${isSelected ? 'text-purple-100' : 'text-gray-400 dark:text-gray-500'}`}>
                                            {person.role || 'Rol Belirtilmedi'}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                        {person.debitCount > 0 && (
                                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-black ${
                                                isSelected 
                                                ? 'bg-white/20 text-white' 
                                                : 'bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 border border-purple-100 dark:border-purple-800/50'
                                            }`}>
                                                {person.debitCount}
                                            </span>
                                        )}
                                        <ChevronRight className={`w-4 h-4 shrink-0 transition-transform ${isSelected ? 'translate-x-0.5' : 'text-gray-400 opacity-0 group-hover:opacity-100'}`} />
                                    </div>
                                </button>
                            );
                        })
                    )}
                </div>
            </div>

            {/* 2. SAĞ PANEL: SEÇİLİ PERSONELİN ZİMMETLERİ */}
            <div className="flex-1 flex flex-col h-full bg-gray-50 dark:bg-gray-900 overflow-hidden">
                {selectedPerson ? (
                    <>
                        {/* Sağ Panel Başlık ve Filtre Alanı */}
                        <div className="p-4 sm:p-6 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shrink-0 shadow-sm space-y-4">
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-black px-2.5 py-1 bg-purple-50 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 rounded-full border border-purple-100 dark:border-purple-800">
                                            Kalıp Malzemesi Teslimatları
                                        </span>
                                    </div>
                                    <h2 className="text-xl font-black text-gray-900 dark:text-white mt-1.5 flex items-center gap-2">
                                        {selectedPerson.name}
                                        <span className="text-xs font-bold text-gray-400 dark:text-gray-500">({selectedPerson.role || 'Rol Yok'})</span>
                                    </h2>
                                </div>
                                <div className="bg-gray-100 dark:bg-gray-700/60 text-gray-700 dark:text-gray-300 font-extrabold text-xs px-3.5 py-1.5 rounded-lg">
                                    Toplam Zimmet: {personDebits.length}
                                </div>
                            </div>

                            {/* Filtreleme Barları */}
                            <div className="flex flex-col md:flex-row gap-3 pt-2 border-t border-gray-100 dark:border-gray-700/50">
                                {/* Kalıp Adı Dropdown Filtresi */}
                                <div className="w-full md:w-72 flex items-center gap-2">
                                    <Filter className="w-4 h-4 text-purple-500 shrink-0" />
                                    <select
                                        value={selectedMoldFilter}
                                        onChange={(e) => setSelectedMoldFilter(e.target.value)}
                                        className="w-full p-2 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-800 dark:text-white text-xs outline-none focus:ring-2 focus:ring-purple-500 font-bold"
                                    >
                                        <option value="TÜMÜ">Tüm Kalıplar ({uniqueMolds.length})</option>
                                        {uniqueMolds.map(moldName => (
                                            <option key={moldName} value={moldName}>{moldName}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Malzeme İsmi Arama Kutusu */}
                                <div className="flex-1 relative">
                                    <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                                    <input 
                                        type="text" 
                                        placeholder="Malzeme adı veya kodu ile filtrele..." 
                                        value={materialSearchTerm} 
                                        onChange={(e) => setMaterialSearchTerm(e.target.value)} 
                                        className="w-full pl-9 pr-8 py-2 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-800 dark:text-white text-xs outline-none focus:ring-2 focus:ring-purple-500 font-bold" 
                                    />
                                    {materialSearchTerm && (
                                        <button onClick={() => setMaterialSearchTerm('')} className="absolute right-2.5 top-2 text-gray-400 hover:text-gray-600">
                                            <X className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Sağ Panel Tablo Alanı */}
                        <div className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar">
                            {loading ? (
                                <div className="flex flex-col items-center justify-center py-12 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700">
                                    <RefreshCw className="w-6 h-6 text-purple-500 animate-spin mb-3" />
                                    <p className="text-xs font-bold text-gray-500">Yükleniyor...</p>
                                </div>
                            ) : filteredDebits.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-16 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm text-center px-4">
                                    <Package className="w-10 h-10 text-gray-300 dark:text-gray-600 mb-3" />
                                    <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300">Zimmet Kaydı Bulunmuyor</h3>
                                    <p className="text-xs text-gray-400 mt-1 max-w-xs">
                                        {selectedMoldFilter !== 'TÜMÜ' || materialSearchTerm
                                            ? 'Seçilen filtre kriterlerine uygun malzeme kaydı bulunamadı.'
                                            : 'Bu personele ait teslim edilmiş herhangi bir kalıp malzeme kaydı bulunmamaktadır.'}
                                    </p>
                                </div>
                            ) : (
                                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden shadow-sm">
                                    <div className="overflow-x-auto">
                                        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                                            <thead className="bg-gray-50 dark:bg-gray-900/50">
                                                <tr>
                                                    <th className="px-6 py-3.5 text-left text-xs font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider">Kalıp Adı</th>
                                                    <th className="px-6 py-3.5 text-left text-xs font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider">Malzeme Adı & Detayı</th>
                                                    <th className="px-6 py-3.5 text-left text-xs font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider">Teslim Edilen Yer / Veren</th>
                                                    <th className="px-6 py-3.5 text-center text-xs font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider">Adet</th>
                                                    <th className="px-6 py-3.5 text-center text-xs font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider">Tarih</th>
                                                    <th className="px-6 py-3.5 text-right text-xs font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider w-20">İşlem</th>
                                                </tr>
                                            </thead>
                                            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                                                {filteredDebits.map(debit => {
                                                    const parts = debit.materialName ? debit.materialName.split(' - ') : [];
                                                    const moldName = parts.length > 1 ? parts[0] : 'Diğer';
                                                    const cleanMaterialName = parts.length > 1 ? parts.slice(1).join(' - ') : debit.materialName;

                                                    return (
                                                        <tr key={debit.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition">
                                                            {/* Kalıp Adı */}
                                                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                                                                <span className="inline-block bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 font-extrabold text-xs px-2.5 py-1 rounded border border-purple-100 dark:border-purple-800/50">
                                                                    {moldName}
                                                                </span>
                                                            </td>
                                                            {/* Malzeme Adı */}
                                                            <td className="px-6 py-4 text-sm">
                                                                <div className="font-extrabold text-gray-900 dark:text-white flex items-center gap-2">
                                                                    <Package className="w-4 h-4 text-gray-400 shrink-0" />
                                                                    {cleanMaterialName}
                                                                </div>
                                                                {debit.productCode && (
                                                                    <div className="text-[10px] text-gray-400 font-mono mt-1">Stok Kodu: {debit.productCode}</div>
                                                                )}
                                                            </td>
                                                            {/* Teslim Edilen Yer / Veren */}
                                                            <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-600 dark:text-gray-400 font-semibold">
                                                                <div className="flex items-center gap-1.5">
                                                                    {debit.targetType === 'MACHINES' ? (
                                                                        <>
                                                                            <Monitor className="w-3.5 h-3.5 text-blue-500" />
                                                                            <span>Tezgah: <span className="font-bold text-gray-800 dark:text-gray-200">{debit.targetName}</span></span>
                                                                        </>
                                                                    ) : (
                                                                        <>
                                                                            <User className="w-3.5 h-3.5 text-emerald-500" />
                                                                            <span>Şahsi Zimmet</span>
                                                                        </>
                                                                    )}
                                                                </div>
                                                                <div className="text-[10px] text-gray-400 mt-1">Teslim Eden: {debit.givenBy}</div>
                                                            </td>
                                                            {/* Miktar */}
                                                            <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-black text-gray-900 dark:text-white">
                                                                x{debit.quantity || 1}
                                                            </td>
                                                            {/* Tarih */}
                                                            <td className="px-6 py-4 whitespace-nowrap text-center text-xs text-gray-500 dark:text-gray-400 font-semibold">
                                                                <div className="flex items-center justify-center gap-1">
                                                                    <Calendar className="w-3.5 h-3.5 text-gray-400" />
                                                                    {debit.givenDate ? debit.givenDate.split(' ')[0] : '-'}
                                                                </div>
                                                                <div className="text-[10px] text-gray-400 mt-0.5">{debit.givenDate ? debit.givenDate.split(' ')[1] : ''}</div>
                                                            </td>
                                                            {/* İşlem */}
                                                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                                                                <button 
                                                                    onClick={() => handleDeleteDebit(debit.id)}
                                                                    className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-xl transition-colors"
                                                                    title="Zimmet Kaydını Sil"
                                                                >
                                                                    <Trash2 className="w-4 h-4" />
                                                                </button>
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
                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-gray-50 dark:bg-gray-900">
                        <ShieldAlert className="w-12 h-12 text-gray-300 dark:text-gray-600 mb-3" />
                        <h3 className="text-base font-extrabold text-gray-700 dark:text-gray-300">Personel Seçilmedi</h3>
                        <p className="text-xs text-gray-400 mt-1 max-w-xs">
                            Zimmetli kalıp malzemelerini görüntülemek için lütfen sol listeden bir personel seçin.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default MoldMaterialDebitsPage;
