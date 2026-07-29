// src/pages/ProcessInstructionsTab.js

import React, { useState, useMemo } from 'react';
import { Plus, Search, Filter, FileText, CheckCircle, ShieldAlert, Sliders, Users, AlertCircle, Eye } from 'lucide-react';
import NewProcessInstructionModal from '../components/Modals/NewProcessInstructionModal.js';
import InstructionDetailModal from '../components/Modals/InstructionDetailModal.js';

const ProcessInstructionsTab = ({ db, loggedInUser, personnel = [], processInstructions = [] }) => {
    const [categoryFilter, setCategoryFilter] = useState('ALL');
    const [searchTerm, setSearchTerm] = useState('');

    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [selectedInstruction, setSelectedInstruction] = useState(null);

    const isManagerOrAdmin = loggedInUser?.role === 'ADMIN' || loggedInUser?.role === 'Yönetici' || loggedInUser?.role?.includes('Yöneticisi') || loggedInUser?.role?.includes('Sorumlusu');
    const currentUserName = loggedInUser?.name || '';
    const currentUserRole = loggedInUser?.role || '';

    // Okunmamış Talimat Sayacı
    const unreadCount = useMemo(() => {
        return processInstructions.filter(inst => {
            const isTarget = (inst.targetRoles || []).includes(currentUserRole);
            const isConfirmed = (inst.acknowledgments || []).some(a => a.userName === currentUserName);
            return isTarget && !isConfirmed;
        }).length;
    }, [processInstructions, currentUserRole, currentUserName]);

    const filteredInstructions = useMemo(() => {
        return processInstructions.filter(inst => {
            if (categoryFilter !== 'ALL' && inst.category !== categoryFilter) return false;
            if (searchTerm.trim()) {
                const term = searchTerm.toLowerCase();
                const titleMatch = inst.title?.toLowerCase().includes(term);
                const noteMatch = inst.instructionNote?.toLowerCase().includes(term);
                if (!titleMatch && !noteMatch) return false;
            }
            return true;
        }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }, [processInstructions, categoryFilter, searchTerm]);

    return (
        <div className="space-y-6">
            
            {/* OKUNMAMIŞ UYARI BANNERİ */}
            {unreadCount > 0 && (
                <div className="bg-amber-500 text-white p-4 rounded-xl shadow-md flex items-center justify-between">
                    <div className="flex items-center gap-2 font-bold text-sm">
                        <AlertCircle className="w-5 h-5 animate-bounce" />
                        <span>Okumanız ve teyit etmeniz gereken {unreadCount} adet yeni süreç/takım talimatı bulunmaktadır!</span>
                    </div>
                </div>
            )}

            {/* ÜST FİLTRE VE EYLEM BANNERİ */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 flex flex-col md:flex-row justify-between items-center gap-4">
                
                <div className="flex items-center gap-3 w-full md:w-auto flex-wrap">
                    {/* Arama Kutusu */}
                    <div className="relative">
                        <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                        <input 
                            type="text"
                            placeholder="Takım adı veya parametre ara..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-9 pr-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-xs font-bold text-gray-700 dark:text-gray-200 outline-none focus:ring-2 focus:ring-indigo-500 w-full sm:w-64"
                        />
                    </div>

                    {/* Kategori Filtresi */}
                    <select 
                        value={categoryFilter}
                        onChange={(e) => setCategoryFilter(e.target.value)}
                        className="p-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-xs font-bold text-gray-700 dark:text-gray-200 outline-none cursor-pointer"
                    >
                        <option value="ALL">📜 Tüm Kategoriler</option>
                        <option value="KESİCİ TAKIM STANDARDI">KESİCİ TAKIM STANDARDI</option>
                        <option value="CAM & OPERASYON KURALI">CAM & OPERASYON KURALI</option>
                        <option value="KALIP İŞLEME PARAMETRELERİ">KALIP İŞLEME PARAMETRELERİ</option>
                        <option value="TEZGAH & GÜVENLİK TALİMATI">TEZGAH & GÜVENLİK TALİMATI</option>
                    </select>
                </div>

                {isManagerOrAdmin && (
                    <button 
                        onClick={() => setIsCreateModalOpen(true)}
                        className="w-full md:w-auto px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-md transition flex items-center justify-center gap-2"
                    >
                        <Plus className="w-4 h-4" /> Yeni CAM & Takım Talimatı Yayınla
                    </button>
                )}
            </div>

            {/* PROSES TALİMATLARI LİSTESİ */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredInstructions.map((inst) => {
                    const isConfirmed = (inst.acknowledgments || []).some(a => a.userName === currentUserName);
                    const totalConfirmations = (inst.acknowledgments || []).length;

                    return (
                        <div key={inst.id} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5 space-y-4 flex flex-col justify-between transition hover:border-indigo-300">
                            <div className="space-y-3">
                                <div className="flex justify-between items-start gap-2">
                                    <span className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-300 font-bold text-[10px]">
                                        {inst.category}
                                    </span>
                                    {isConfirmed ? (
                                        <span className="px-2.5 py-1 bg-green-100 text-green-800 dark:bg-green-900/60 dark:text-green-300 rounded-full text-[10px] font-bold flex items-center gap-1">
                                            <CheckCircle className="w-3 h-3 text-green-600" /> Teyit Edildi
                                        </span>
                                    ) : (
                                        <span className="px-2.5 py-1 bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300 rounded-full text-[10px] font-bold flex items-center gap-1">
                                            <AlertCircle className="w-3 h-3 text-amber-600" /> Teyit Bekliyor
                                        </span>
                                    )}
                                </div>

                                <h3 className="font-bold text-sm text-gray-900 dark:text-white leading-snug">{inst.title}</h3>

                                {/* KESİCİ TAKIM PARAMETRELERİ (ÖZET KART) */}
                                {inst.parameters && (
                                    <div className="bg-gray-50 dark:bg-gray-900/60 p-3 rounded-lg border border-gray-100 dark:border-gray-700 grid grid-cols-4 gap-2 text-center text-[10px]">
                                        <div>
                                            <span className="text-gray-400 block font-bold">Vc</span>
                                            <span className="font-black text-indigo-600 dark:text-indigo-400">{inst.parameters.vc} m/dk</span>
                                        </div>
                                        <div>
                                            <span className="text-gray-400 block font-bold">fz</span>
                                            <span className="font-black text-indigo-600 dark:text-indigo-400">{inst.parameters.fz} mm/diş</span>
                                        </div>
                                        <div>
                                            <span className="text-gray-400 block font-bold">ae</span>
                                            <span className="font-black text-indigo-600 dark:text-indigo-400">{inst.parameters.ae} mm</span>
                                        </div>
                                        <div>
                                            <span className="text-gray-400 block font-bold">ap</span>
                                            <span className="font-black text-indigo-600 dark:text-indigo-400">{inst.parameters.ap} mm</span>
                                        </div>
                                    </div>
                                )}

                                {inst.instructionNote && (
                                    <p className="text-xs text-gray-600 dark:text-gray-300 line-clamp-2 italic">
                                        "{inst.instructionNote}"
                                    </p>
                                )}
                            </div>

                            <div className="pt-3 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between gap-2">
                                <span className="text-[11px] font-bold text-gray-500 flex items-center gap-1">
                                    <Users className="w-3.5 h-3.5 text-indigo-500" /> {totalConfirmations} Personel Okudu
                                </span>

                                <button
                                    onClick={() => setSelectedInstruction(inst)}
                                    className={`px-3.5 py-2 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${!isConfirmed ? 'bg-amber-500 hover:bg-amber-400 text-white shadow' : 'bg-indigo-600 hover:bg-indigo-500 text-white'}`}
                                >
                                    <Eye className="w-4 h-4" /> {!isConfirmed ? 'Detayı İncele & Teyit Et' : 'Detayı İncele'}
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>

            {filteredInstructions.length === 0 && (
                <div className="py-16 text-center text-gray-500 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
                    <FileText className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                    <p className="font-bold text-sm">Gösterilecek proses talimatı bulunmuyor.</p>
                </div>
            )}

            {/* YENİ TALİMAT YAYINLAMA MODALI */}
            <NewProcessInstructionModal 
                isOpen={isCreateModalOpen}
                onClose={() => setIsCreateModalOpen(false)}
                db={db}
                loggedInUser={loggedInUser}
            />

            {/* TALİMAT DETAY VE TEYİT MODALI */}
            {selectedInstruction && (
                <InstructionDetailModal 
                    isOpen={Boolean(selectedInstruction)}
                    onClose={() => setSelectedInstruction(null)}
                    instruction={selectedInstruction}
                    db={db}
                    loggedInUser={loggedInUser}
                    personnel={personnel}
                />
            )}
        </div>
    );
};

export default ProcessInstructionsTab;
