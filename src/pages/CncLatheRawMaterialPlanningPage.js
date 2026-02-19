// src/pages/CncLatheRawMaterialPlanningPage.js

import React, { useState, useEffect, useMemo } from 'react';
import { 
    Search, Database, Calculator, Settings, AlertCircle, Save, Edit, X, Check, PackageOpen, Plus, Trash2
} from 'lucide-react';
import { 
    collection, query, onSnapshot, doc, setDoc, deleteDoc, orderBy
} from '../config/firebase.js';
import { getCurrentDateTimeString } from '../utils/dateUtils.js';

import { CNC_PARTS_COLLECTION, CNC_LATHE_JOBS_COLLECTION } from '../config/constants.js';

const MATERIAL_DENSITIES = {
    'Çelik': 7.85,
    'Pirinç': 8.4,
    'Paslanmaz Çelik': 7.9,
    'Alüminyum': 2.7,
    'Plastik (Delrin/POM)': 1.15
};

const CncLatheRawMaterialPlanningPage = ({ db }) => {
    const [activeTab, setActiveTab] = useState('ANALYSIS'); 
    
    const [parts, setParts] = useState([]);
    const [activeJobs, setActiveJobs] = useState([]);
    
    const [searchTerm, setSearchTerm] = useState('');
    const [manualStocks, setManuelStocks] = useState({}); 

    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingPart, setEditingPart] = useState(null);
    const [formData, setFormData] = useState({
        partCode: '',
        partName: '',
        rawMaterialCode: '', 
        materialType: 'Pirinç', 
        profileType: 'CAP', 
        dimension: '', 
        piecesPerBar: '', 
    });

    // --- VERİ ÇEKME ---
    useEffect(() => {
        if (!db) return;

        // 1. TÜM CNC Parçalarını Çek
        const partsQuery = query(collection(db, CNC_PARTS_COLLECTION), orderBy('partName'));
        const partsUnsub = onSnapshot(partsQuery, (snapshot) => {
            const partsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setParts(partsData);
        }, (error) => {
            console.error("Parça çekme hatası:", error);
        });

        // 2. Aktif CNC Siparişlerini Çek
        const jobsUnsub = onSnapshot(query(collection(db, CNC_LATHE_JOBS_COLLECTION)), (snapshot) => {
            const jobsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            const active = jobsData.filter(j => j.status !== 'COMPLETED');
            setActiveJobs(active);
        });

        return () => {
            partsUnsub();
            jobsUnsub();
        };
    }, [db]);

    // --- HESAPLAMA ---
    const calculateBarWeight = (materialType, profileType, dimension) => {
        if (!dimension || isNaN(dimension)) return 0;
        const density = MATERIAL_DENSITIES[materialType] || 7.85; 
        const dim = parseFloat(dimension);
        const lengthCm = 300; 
        let volumeCm3 = 0;
        
        if (profileType === 'CAP') {
            const radiusCm = (dim / 2) / 10; 
            volumeCm3 = Math.PI * Math.pow(radiusCm, 2) * lengthCm;
        } else if (profileType === 'ALTIKOSE') {
            const sCm = dim / 10;
            volumeCm3 = 0.866 * Math.pow(sCm, 2) * lengthCm;
        }
        return (volumeCm3 * density) / 1000;
    };

    // --- İHTİYAÇ ANALİZİ (GRUPLAMA) ---
    const materialAnalysis = useMemo(() => {
        const analysis = {};

        activeJobs.forEach(job => {
            const partInfo = parts.find(p => p.id === job.partId || p.partName === job.partName);
            
            if (partInfo && partInfo.rawMaterialCode && partInfo.piecesPerBar) {
                const rawCode = partInfo.rawMaterialCode.toUpperCase();
                
                const requiredPieces = parseInt(job.targetQuantity, 10) || 0;
                const piecesPerBar = parseInt(partInfo.piecesPerBar, 10) || 1; 

                const requiredBarsRaw = requiredPieces / piecesPerBar;

                if (!analysis[rawCode]) {
                    analysis[rawCode] = {
                        rawMaterialCode: rawCode,
                        materialType: partInfo.materialType || 'Bilinmiyor',
                        profileType: partInfo.profileType || 'CAP',
                        dimension: partInfo.dimension || '',
                        totalPiecesRequired: 0,
                        totalBarsRequiredRaw: 0,
                        relatedJobs: [], 
                        weightPerBar: calculateBarWeight(partInfo.materialType, partInfo.profileType, partInfo.dimension)
                    };
                }

                analysis[rawCode].totalPiecesRequired += requiredPieces;
                analysis[rawCode].totalBarsRequiredRaw += requiredBarsRaw;
                
                // İsim gösterimi: Varsa Sipariş/Resim no, yoksa Parça Kodu/Adı
                const displayName = job.orderNumber 
                    ? `${job.orderNumber} (${job.partName})` 
                    : (job.partCode || job.partName);

                analysis[rawCode].relatedJobs.push({ 
                    partName: displayName, 
                    count: requiredPieces 
                });
            }
        });

        return Object.values(analysis).map(item => {
            const totalBarsNeeded = Math.ceil(item.totalBarsRequiredRaw);
            const stockInHand = parseInt(manualStocks[item.rawMaterialCode]) || 0;
            const barsToBuy = Math.max(0, totalBarsNeeded - stockInHand);
            const kgToBuy = barsToBuy * item.weightPerBar;

            return {
                ...item,
                totalBarsNeeded,
                stockInHand,
                barsToBuy,
                kgToBuy: kgToBuy.toFixed(2)
            };
        }).sort((a, b) => b.barsToBuy - a.barsToBuy); 

    }, [activeJobs, parts, manualStocks]);

    // --- KAYDETME İŞLEMİ ---
    const handleSavePartMaterial = async () => {
        if (!formData.rawMaterialCode || !formData.piecesPerBar) {
            return alert("Hammadde Kodu ve 1 Boydan Çıkan Adet bilgileri zorunludur.");
        }

        try {
            const partId = editingPart ? editingPart.id : `part_${Date.now()}`;
            const partRef = doc(db, CNC_PARTS_COLLECTION, partId);
            
            await setDoc(partRef, {
                ...formData,
                partCode: formData.partCode ? formData.partCode.toUpperCase() : '',
                rawMaterialCode: formData.rawMaterialCode.toUpperCase(),
                materialUpdatedAt: getCurrentDateTimeString()
            }, { merge: true }); 

            setIsFormOpen(false);
            setEditingPart(null);
            alert("Parça hammadde bilgileri başarıyla kaydedildi.");
        } catch (error) {
            console.error("Kaydetme hatası:", error);
            alert("Hata oluştu.");
        }
    };

    const handleDeletePart = async (id) => {
        if (window.confirm("Bu parçayı silmek istediğinize emin misiniz?")) {
            await deleteDoc(doc(db, CNC_PARTS_COLLECTION, id));
        }
    };

    const openEditForm = (part) => {
        setEditingPart(part);
        setFormData({
            partCode: part.partCode || '',
            partName: part.partName || '',
            rawMaterialCode: part.rawMaterialCode || '',
            materialType: part.materialType || 'Pirinç',
            profileType: part.profileType || 'CAP',
            dimension: part.dimension || '',
            piecesPerBar: part.piecesPerBar || '',
        });
        setIsFormOpen(true);
    };

    return (
        <div className="p-4 sm:p-8 bg-gray-50 dark:bg-gray-900 min-h-screen font-sans transition-colors duration-200">
            <div className="mb-6 flex flex-col md:flex-row justify-between items-start md:items-center">
                <h1 className="text-2xl font-extrabold text-gray-900 dark:text-white flex items-center">
                    <Database className="w-6 h-6 mr-3 text-blue-600 dark:text-blue-400" />
                    Hammadde İhtiyaç Planlama
                </h1>
            </div>

            <div className="flex bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-1 mb-6 w-fit">
                <button 
                    onClick={() => setActiveTab('ANALYSIS')}
                    className={`px-6 py-2.5 text-sm font-bold rounded-lg transition flex items-center ${activeTab === 'ANALYSIS' ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' : 'text-gray-500 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-700'}`}
                >
                    <Calculator className="w-4 h-4 mr-2" /> İhtiyaç Analizi
                </button>
                <button 
                    onClick={() => setActiveTab('PARTS_SETUP')}
                    className={`px-6 py-2.5 text-sm font-bold rounded-lg transition flex items-center ${activeTab === 'PARTS_SETUP' ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' : 'text-gray-500 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-700'}`}
                >
                    <Settings className="w-4 h-4 mr-2" /> Parça Malzeme Tanımları
                </button>
            </div>

            {/* SEKME 1: ANALİZ */}
            {activeTab === 'ANALYSIS' && (
                <div className="space-y-6 animate-in fade-in">
                    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/50 rounded-xl p-4 flex items-start">
                        <AlertCircle className="w-5 h-5 text-blue-500 dark:text-blue-400 mr-3 mt-0.5 flex-shrink-0" />
                        <div className="text-sm text-blue-800 dark:text-blue-200">
                            <strong>Nasıl Çalışır?</strong> Sistem, CNC siparişlerindeki aktif işleri (Planlanan ve Tezgahtakiler) tarar ve <strong>aynı hammadde koduna</strong> sahip parçaları gruplar. Listede <strong>Eldeki Stok</strong> miktarını manuel girerek net sipariş vermeniz gereken miktarı görebilirsiniz.
                        </div>
                    </div>

                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-gray-100 dark:bg-gray-900 text-gray-700 dark:text-gray-300 uppercase text-xs font-bold border-b border-gray-200 dark:border-gray-700">
                                    <tr>
                                        <th className="px-4 py-4">Hammadde Kodu</th>
                                        <th className="px-4 py-4">Özellik</th>
                                        <th className="px-4 py-4">Sipariş İhtiyacı</th>
                                        <th className="px-4 py-4 bg-yellow-50 dark:bg-yellow-900/20 w-32 border-l border-r border-gray-200 dark:border-gray-700">Stok (Boy)</th>
                                        <th className="px-4 py-4 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400">Satın Alınacak</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                    {materialAnalysis.length === 0 ? (
                                        <tr><td colSpan="5" className="p-8 text-center text-gray-500 dark:text-gray-400">Hesaplanacak aktif sipariş bulunamadı veya parçaların hammadde tanımları eksik.</td></tr>
                                    ) : (
                                        materialAnalysis.map(item => (
                                            <tr key={item.rawMaterialCode} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition">
                                                <td className="px-4 py-4 align-top">
                                                    <div className="font-black text-gray-900 dark:text-white text-base mb-3">{item.rawMaterialCode}</div>
                                                    
                                                    {/* YENİ ALT ALTA LİSTE GÖRÜNÜMÜ */}
                                                    <div className="bg-gray-50 dark:bg-gray-800/80 rounded-lg p-2.5 border border-gray-100 dark:border-gray-700 shadow-sm">
                                                        <div className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase mb-2 border-b dark:border-gray-600 pb-1">İlgili Siparişler:</div>
                                                        <ul className="space-y-2">
                                                            {item.relatedJobs.map((j, idx) => (
                                                                <li key={idx} className="flex items-start">
                                                                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mr-2 mt-1.5 flex-shrink-0"></span>
                                                                    <div className="leading-tight">
                                                                        <span className="text-gray-800 dark:text-gray-200 font-medium text-xs">{j.partName}</span>
                                                                        <div className="text-gray-600 dark:text-gray-400 font-bold text-xs mt-0.5">{j.count} Adet</div>
                                                                    </div>
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-4 align-top">
                                                    <div className="text-gray-700 dark:text-gray-300 font-medium">{item.materialType}</div>
                                                    <div className="font-mono text-xs mt-2 bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 px-2 py-1 rounded inline-block border dark:border-gray-600 shadow-sm">
                                                        {item.profileType === 'CAP' ? 'Çap' : 'Altıköşe'} {item.dimension}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-4 align-top">
                                                    <div className="font-bold text-gray-900 dark:text-white text-lg">{item.totalBarsNeeded} Boy</div>
                                                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Toplam <strong>{item.totalPiecesRequired}</strong> Adet Parça</div>
                                                </td>
                                                <td className="px-4 py-4 bg-yellow-50/50 dark:bg-yellow-900/10 border-l border-r border-gray-200 dark:border-gray-700 align-top">
                                                    <input 
                                                        type="number" min="0"
                                                        className="w-full p-2.5 border border-yellow-300 dark:border-yellow-600/50 rounded-lg focus:ring-2 focus:ring-yellow-500 bg-white dark:bg-gray-800 dark:text-white outline-none text-center font-black shadow-inner"
                                                        placeholder="0"
                                                        value={manualStocks[item.rawMaterialCode] || ''}
                                                        onChange={(e) => setManuelStocks({...manualStocks, [item.rawMaterialCode]: parseInt(e.target.value) || 0})}
                                                    />
                                                </td>
                                                <td className="px-4 py-4 bg-green-50/50 dark:bg-green-900/10 align-top">
                                                    {item.barsToBuy > 0 ? (
                                                        <>
                                                            <div className="font-black text-green-700 dark:text-green-400 text-xl">{item.barsToBuy} Boy</div>
                                                            <div className="text-sm font-bold text-green-600/80 dark:text-green-500/80 mt-1">~ {item.kgToBuy} Kg</div>
                                                        </>
                                                    ) : (
                                                        <div className="text-gray-400 dark:text-gray-500 font-bold flex items-center bg-gray-100 dark:bg-gray-800 px-3 py-1.5 rounded-lg w-fit border dark:border-gray-700">
                                                            <Check className="w-4 h-4 mr-1.5"/> Stok Yeterli
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* SEKME 2: PARÇALAR LİSTESİ VE MALZEME GİRİŞİ */}
            {activeTab === 'PARTS_SETUP' && (
                <div className="space-y-6 animate-in fade-in">
                    <div className="flex justify-between items-center">
                        <div className="relative w-full max-w-sm">
                            <Search className="absolute left-3 top-2.5 text-gray-400 w-5 h-5" />
                            <input 
                                type="text" 
                                placeholder="Parça Adı veya Sipariş No ara..." 
                                className="w-full pl-10 p-2 border rounded-lg bg-white dark:bg-gray-800 dark:text-white dark:border-gray-700 focus:ring-2 focus:ring-blue-500 outline-none transition"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {parts.filter(p => 
                            p.partName?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            p.orderNumber?.toLowerCase().includes(searchTerm.toLowerCase())
                        ).map(part => (
                            <div key={part.id} className={`bg-white dark:bg-gray-800 rounded-xl p-5 border ${part.piecesPerBar ? 'border-green-300 dark:border-green-700/50 shadow-green-100/50 dark:shadow-none' : 'border-gray-200 dark:border-gray-700'} shadow-sm relative group hover:shadow-md transition`}>
                                <button 
                                    onClick={() => openEditForm(part)} 
                                    className="absolute top-4 right-4 p-2 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50 transition shadow-sm"
                                    title="Hammadde Bilgisi Gir"
                                >
                                    <Edit className="w-4 h-4"/>
                                </button>
                                <h3 className="font-bold text-lg text-gray-900 dark:text-white pr-10 truncate">{part.partName || 'İsimsiz Parça'}</h3>
                                <p className="text-gray-500 dark:text-gray-400 text-sm mb-3">Sipariş/Stok: {part.orderNumber || '-'}</p>
                                
                                {part.piecesPerBar ? (
                                    <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-3 space-y-2 text-sm mt-3 border border-gray-100 dark:border-gray-700/50">
                                        <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">Grup Kodu:</span> <span className="font-bold text-blue-600 dark:text-blue-400">{part.rawMaterialCode}</span></div>
                                        <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">Tür:</span> <span className="dark:text-gray-200">{part.materialType}</span></div>
                                        <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">Profil:</span> <span className="dark:text-gray-200">{part.profileType === 'CAP' ? 'Çap' : 'Altıköşe'} {part.dimension}</span></div>
                                        <div className="flex justify-between border-t border-gray-200 dark:border-gray-700 pt-2 mt-2">
                                            <span className="text-gray-500 dark:text-gray-400 font-bold">1 Boydan:</span> 
                                            <span className="font-bold text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 px-2 py-0.5 rounded">{part.piecesPerBar} Adet</span>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="mt-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-500 text-sm rounded-lg border border-yellow-200 dark:border-yellow-800/50 flex flex-col items-center">
                                        <p className="mb-2 text-center font-medium">Hammadde bilgisi yok</p>
                                        <button onClick={() => openEditForm(part)} className="text-blue-600 dark:text-blue-400 font-bold underline text-xs hover:text-blue-800 transition">Şimdi Tanımla</button>
                                    </div>
                                )}
                            </div>
                        ))}
                        {parts.length === 0 && (
                            <div className="col-span-full p-8 text-center text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 rounded-xl border border-dashed border-gray-300 dark:border-gray-700">
                                Parça verisi bulunamadı. Lütfen önce <b>"Parça & Kalite Yönetimi"</b> sayfasından parça ekleyin.
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* MODAL: Hammadde Bilgisi Girişi */}
            {isFormOpen && editingPart && (
                <div className="fixed inset-0 bg-black/60 z-50 flex justify-center items-center p-4 backdrop-blur-sm">
                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-xl overflow-hidden animate-in zoom-in-95">
                        <div className="p-5 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900">
                            <h2 className="text-lg font-bold text-gray-800 dark:text-white flex items-center">
                                <PackageOpen className="w-5 h-5 mr-2 text-blue-600 dark:text-blue-400"/>
                                {editingPart.partName} - Hammadde Bilgisi
                            </h2>
                            <button onClick={() => setIsFormOpen(false)} className="text-gray-500 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition"><X className="w-6 h-6"/></button>
                        </div>

                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">Ortak Hammadde Grubu Kodu *</label>
                                <input 
                                    type="text" 
                                    placeholder="Örn: MS58-CAP-20" 
                                    className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 font-bold text-blue-600 dark:text-blue-400 uppercase bg-white dark:bg-gray-700 dark:border-gray-600 outline-none" 
                                    value={formData.rawMaterialCode} 
                                    onChange={e => setFormData({...formData, rawMaterialCode: e.target.value.toUpperCase()})} 
                                />
                                <p className="text-[10px] text-gray-400 mt-1">Sistem, burada aynı ismi yazdığınız parçaların ihtiyaçlarını toplayarak gruplar.</p>
                            </div>

                            <div className="grid grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">Tür</label>
                                    <select className="w-full p-2 border rounded-lg bg-white dark:bg-gray-700 dark:text-white dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none" value={formData.materialType} onChange={e => setFormData({...formData, materialType: e.target.value})}>
                                        {Object.keys(MATERIAL_DENSITIES).map(mat => <option key={mat} value={mat}>{mat}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">Şekil</label>
                                    <select className="w-full p-2 border rounded-lg bg-white dark:bg-gray-700 dark:text-white dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none" value={formData.profileType} onChange={e => setFormData({...formData, profileType: e.target.value})}>
                                        <option value="CAP">Yuvarlak (Çap)</option>
                                        <option value="ALTIKOSE">Altıköşe</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">Ölçü (mm)</label>
                                    <input type="number" placeholder="20" className="w-full p-2 border rounded-lg bg-white dark:bg-gray-700 dark:text-white dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none" value={formData.dimension} onChange={e => setFormData({...formData, dimension: e.target.value})} />
                                </div>
                            </div>

                            <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-100 dark:border-blue-800/50">
                                <label className="block text-sm font-bold text-blue-800 dark:text-blue-300 mb-2 text-center">1 Boydan (3 Metre) Çıkan Net Adet *</label>
                                <input type="number" placeholder="Testere payı düşülmüş net adet..." className="w-full p-3 border border-blue-200 dark:border-blue-700 rounded-lg text-lg font-bold text-center bg-white dark:bg-gray-800 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none shadow-sm" value={formData.piecesPerBar} onChange={e => setFormData({...formData, piecesPerBar: e.target.value})} />
                            </div>
                        </div>

                        <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 flex justify-end gap-3 rounded-b-xl">
                            <button onClick={() => setIsFormOpen(false)} className="px-5 py-2.5 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 font-bold transition">İptal</button>
                            <button onClick={handleSavePartMaterial} className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-bold flex items-center shadow-lg transition"><Save className="w-4 h-4 mr-2"/> Kaydet</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CncLatheRawMaterialPlanningPage;