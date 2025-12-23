// src/pages/ToolAssignmentPage.js

import React, { useState, useMemo } from 'react';
import { 
    Monitor, ArrowRight, RotateCcw, AlertOctagon, 
    CheckCircle, Plus, Search, Wrench, X, History 
} from 'lucide-react';
import { 
    updateDoc, doc, addDoc, collection, arrayUnion, increment 
} from '../config/firebase.js';
import { 
    MACHINES_COLLECTION, INVENTORY_COLLECTION, 
    TOOL_TRANSACTIONS_COLLECTION, TOOL_TRANSACTION_TYPES 
} from '../config/constants.js';
import { getCurrentDateTimeString, formatDate } from '../utils/dateUtils.js';

const ToolAssignmentPage = ({ tools, machines, loggedInUser, db }) => {
    const [selectedMachineId, setSelectedMachineId] = useState(null);
    const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
    
    // Takım Verme İşlemi İçin State
    const [selectedToolIdForAssignment, setSelectedToolIdForAssignment] = useState('');

    // Seçilen Makineyi Bul
    const selectedMachine = useMemo(() => {
        return machines.find(m => m.id === selectedMachineId);
    }, [machines, selectedMachineId]);

    // Stokta olan (verilebilecek) takımları filtrele
    const availableTools = useMemo(() => {
        return tools.filter(t => t.totalStock > 0).sort((a, b) => a.name.localeCompare(b.name));
    }, [tools]);

    // --- İŞLEMLER ---

    // 1. TEZGAHA TAKIM VERME
    const handleAssignTool = async () => {
        if (!selectedToolIdForAssignment) return alert("Lütfen bir takım seçiniz.");
        
        const tool = tools.find(t => t.id === selectedToolIdForAssignment);
        if (!tool) return;

        // Stok Kontrolü (Client side check)
        if (tool.totalStock <= 0) return alert("Stok yetersiz!");

        try {
            const machineRef = doc(db, MACHINES_COLLECTION, selectedMachine.id);
            const toolRef = doc(db, INVENTORY_COLLECTION, tool.id);

            // A) Makineye Ekle (arrayUnion)
            const newToolEntry = {
                instanceId: Date.now(), // Benzersiz ID (çünkü aynı takımdan 2 tane olabilir)
                toolId: tool.id,
                toolName: tool.name,
                givenDate: getCurrentDateTimeString(),
                givenBy: loggedInUser.name
            };

            await updateDoc(machineRef, {
                currentTools: arrayUnion(newToolEntry)
            });

            // B) Stoktan Düş
            await updateDoc(toolRef, {
                totalStock: increment(-1)
            });

            // C) Log Kaydı At
            await addDoc(collection(db, TOOL_TRANSACTIONS_COLLECTION), {
                type: TOOL_TRANSACTION_TYPES.ISSUE,
                toolName: tool.name,
                machineName: selectedMachine.name,
                user: loggedInUser.name,
                date: getCurrentDateTimeString()
            });

            setIsAssignModalOpen(false);
            setSelectedToolIdForAssignment('');
            alert("Takım tezgaha verildi.");

        } catch (error) {
            console.error("Takım verme hatası:", error);
            alert("İşlem başarısız.");
        }
    };

    // 2. TAKIM İADE ALMA (SAĞLAM veya HURDA)
    const handleReturnTool = async (toolEntry, isScrap) => {
        if (!window.confirm(isScrap ? "Bu takımı HURDA olarak ayırmak istediğinize emin misiniz?" : "Bu takımı SAĞLAM olarak stoga geri almak istiyor musunuz?")) return;

        try {
            const machineRef = doc(db, MACHINES_COLLECTION, selectedMachine.id);
            const toolRef = doc(db, INVENTORY_COLLECTION, toolEntry.toolId);

            // A) Makineden Kaldır
            // Not: arrayRemove nesnelerde birebir eşleşme arar, bu yüzden manuel filtreleme daha güvenlidir.
            // Ancak Firebase arrayRemove için tam objeyi göndermemiz gerek.
            // Burada basitlik adına makinedeki güncel listeyi alıp filtreleyip set edeceğiz.
            
            const updatedToolsList = (selectedMachine.currentTools || []).filter(t => t.instanceId !== toolEntry.instanceId);
            
            await updateDoc(machineRef, {
                currentTools: updatedToolsList
            });

            // B) Stok Güncelleme (Sadece Sağlamsa Artır)
            if (!isScrap) {
                await updateDoc(toolRef, {
                    totalStock: increment(1)
                });
            }

            // C) Log Kaydı
            await addDoc(collection(db, TOOL_TRANSACTIONS_COLLECTION), {
                type: isScrap ? TOOL_TRANSACTION_TYPES.RETURN_SCRAP : TOOL_TRANSACTION_TYPES.RETURN_HEALTHY,
                toolName: toolEntry.toolName,
                machineName: selectedMachine.name,
                user: loggedInUser.name,
                date: getCurrentDateTimeString(),
                notes: isScrap ? 'Iskartaya ayrıldı' : 'Depoya geri alındı'
            });

        } catch (error) {
            console.error("İade alma hatası:", error);
            alert("Hata oluştu.");
        }
    };

    return (
        <div className="flex h-[calc(100vh-80px)] overflow-hidden">
            
            {/* SOL TARAF: TEZGAH LİSTESİ */}
            <div className="w-1/3 md:w-1/4 bg-white dark:bg-gray-800 border-r dark:border-gray-700 flex flex-col">
                <div className="p-4 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                    <h2 className="font-bold text-gray-700 dark:text-gray-200 flex items-center">
                        <Monitor className="w-5 h-5 mr-2" /> Tezgahlar
                    </h2>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                    {machines.map(machine => {
                        const toolCount = machine.currentTools ? machine.currentTools.length : 0;
                        return (
                            <button
                                key={machine.id}
                                onClick={() => setSelectedMachineId(machine.id)}
                                className={`w-full text-left p-4 rounded-lg border transition-all flex justify-between items-center ${
                                    selectedMachineId === machine.id 
                                        ? 'bg-blue-50 border-blue-500 shadow-md' 
                                        : 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 hover:border-blue-300'
                                }`}
                            >
                                <div>
                                    <div className="font-bold text-gray-900 dark:text-white">{machine.name}</div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400">{machine.type || 'Tezgah'}</div>
                                </div>
                                {toolCount > 0 && (
                                    <span className="bg-orange-100 text-orange-800 text-xs font-bold px-2 py-1 rounded-full">
                                        {toolCount} Takım
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* SAĞ TARAF: DETAY VE İŞLEM */}
            <div className="flex-1 bg-gray-50 dark:bg-gray-900 flex flex-col">
                {selectedMachine ? (
                    <>
                        {/* BAŞLIK */}
                        <div className="p-6 bg-white dark:bg-gray-800 shadow-sm border-b dark:border-gray-700 flex justify-between items-center">
                            <div>
                                <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center">
                                    {selectedMachine.name} 
                                    <span className="ml-3 text-sm font-normal text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-3 py-1 rounded-full">
                                        Takım Listesi
                                    </span>
                                </h1>
                            </div>
                            <button 
                                onClick={() => setIsAssignModalOpen(true)}
                                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-bold flex items-center shadow-lg transition transform hover:-translate-y-0.5"
                            >
                                <Plus className="w-5 h-5 mr-2" /> Takım Ver
                            </button>
                        </div>

                        {/* LİSTE */}
                        <div className="p-6 flex-1 overflow-y-auto">
                            {(!selectedMachine.currentTools || selectedMachine.currentTools.length === 0) ? (
                                <div className="h-full flex flex-col items-center justify-center text-gray-400 opacity-60">
                                    <Wrench className="w-20 h-20 mb-4" />
                                    <p className="text-xl font-medium">Bu tezgahta kayıtlı takım yok.</p>
                                    <p className="text-sm">"Takım Ver" butonunu kullanarak ekleme yapabilirsiniz.</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                                    {selectedMachine.currentTools.map((toolEntry) => (
                                        <div key={toolEntry.instanceId} className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow border border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row justify-between items-center gap-4">
                                            <div className="flex items-center gap-4">
                                                <div className="bg-blue-100 dark:bg-blue-900 p-3 rounded-full text-blue-600 dark:text-blue-300">
                                                    <Wrench className="w-6 h-6" />
                                                </div>
                                                <div>
                                                    <h3 className="font-bold text-lg text-gray-900 dark:text-white">{toolEntry.toolName}</h3>
                                                    <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2 mt-1">
                                                        <span>Veriliş: {formatDate(toolEntry.givenDate)}</span>
                                                        <span className="w-1 h-1 rounded-full bg-gray-400"></span>
                                                        <span>{toolEntry.givenBy}</span>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex gap-2 w-full sm:w-auto">
                                                <button 
                                                    onClick={() => handleReturnTool(toolEntry, false)}
                                                    className="flex-1 sm:flex-initial px-4 py-2 bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 rounded-lg text-sm font-bold flex items-center justify-center transition"
                                                >
                                                    <RotateCcw className="w-4 h-4 mr-2" /> Sağlam İade
                                                </button>
                                                <button 
                                                    onClick={() => handleReturnTool(toolEntry, true)}
                                                    className="flex-1 sm:flex-initial px-4 py-2 bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 rounded-lg text-sm font-bold flex items-center justify-center transition"
                                                >
                                                    <AlertOctagon className="w-4 h-4 mr-2" /> Hurda
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center text-gray-400 opacity-60">
                        <ArrowRight className="w-20 h-20 mb-4 animate-pulse" />
                        <p className="text-xl font-medium">İşlem yapmak için soldan bir tezgah seçiniz.</p>
                    </div>
                )}
            </div>

            {/* MODAL: TAKIM VERME */}
            {isAssignModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-gray-200 dark:border-gray-700">
                        <div className="bg-blue-600 px-6 py-4 flex justify-between items-center text-white">
                            <h3 className="text-xl font-bold flex items-center">
                                <Wrench className="w-5 h-5 mr-2" /> Takım Ver: {selectedMachine?.name}
                            </h3>
                            <button onClick={() => setIsAssignModalOpen(false)} className="hover:text-blue-200">
                                <X className="w-6 h-6" />
                            </button>
                        </div>
                        
                        <div className="p-6">
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Depodan Verilecek Malzemeyi Seçin
                            </label>
                            
                            <div className="relative">
                                <Search className="absolute left-3 top-3 text-gray-400 w-5 h-5" />
                                <select
                                    value={selectedToolIdForAssignment}
                                    onChange={(e) => setSelectedToolIdForAssignment(e.target.value)}
                                    className="w-full pl-10 p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 appearance-none"
                                    size="5" // Listbox görünümü için
                                >
                                    <option value="" disabled className="text-gray-400">Listeden seçim yapınız...</option>
                                    {availableTools.map(tool => (
                                        <option key={tool.id} value={tool.id} className="py-2">
                                            {tool.name} (Stok: {tool.totalStock}) - {tool.location}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            {availableTools.length === 0 && (
                                <p className="text-red-500 text-sm mt-2">Depoda verilebilir stokta takım bulunmuyor.</p>
                            )}
                        </div>

                        <div className="p-4 bg-gray-50 dark:bg-gray-900 flex justify-end gap-3 border-t dark:border-gray-700">
                            <button 
                                onClick={() => setIsAssignModalOpen(false)}
                                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg font-medium transition"
                            >
                                İptal
                            </button>
                            <button 
                                onClick={handleAssignTool}
                                disabled={!selectedToolIdForAssignment}
                                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg font-bold shadow-md transition"
                            >
                                Onayla ve Ver
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ToolAssignmentPage;