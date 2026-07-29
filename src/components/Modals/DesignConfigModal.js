// src/components/Modals/DesignConfigModal.js

import React, { useState } from 'react';
import { Settings, Clock, Coffee, Save, X, ShieldAlert, Plus, Trash2 } from 'lucide-react';
import Modal from './Modal.js';
import { doc, setDoc } from '../../config/firebase.js';

const DESIGN_CONFIG_DOC_PATH = 'artifacts/default-app-id/public/data/designConfig';

const DEFAULT_BREAKS = [
    { id: 'b-1', name: 'Sabah Çay Molası', start: '10:00', end: '10:15', enabled: true },
    { id: 'b-2', name: 'Yemek Molası', start: '12:00', end: '13:00', enabled: true },
    { id: 'b-3', name: 'İkindi Çay Molası', start: '15:30', end: '15:45', enabled: true }
];

const DesignConfigModal = ({ isOpen, onClose, db, currentConfig, onConfigUpdated }) => {
    const [workStartHour, setWorkStartHour] = useState(currentConfig?.workStartHour ?? 8);
    const [workEndHour, setWorkEndHour] = useState(currentConfig?.workEndHour ?? 18);
    
    // ÇOKLU MOLA LİSTESİ STATE'İ
    const [breaks, setBreaks] = useState(() => {
        if (currentConfig?.breaks && Array.isArray(currentConfig.breaks) && currentConfig.breaks.length > 0) {
            return currentConfig.breaks;
        }
        // Legacy fallback
        if (currentConfig?.lunchBreakStart && currentConfig?.lunchBreakEnd) {
            return [
                { id: 'b-legacy-1', name: 'Sabah Çay Molası', start: '10:00', end: '10:15', enabled: true },
                { id: 'b-legacy-2', name: 'Yemek Molası', start: currentConfig.lunchBreakStart, end: currentConfig.lunchBreakEnd, enabled: currentConfig.lunchBreakEnabled !== false },
                { id: 'b-legacy-3', name: 'İkindi Çay Molası', start: '15:30', end: '15:45', enabled: true }
            ];
        }
        return DEFAULT_BREAKS;
    });

    const [isSaving, setIsSaving] = useState(false);

    const handleAddBreak = () => {
        const newBreak = {
            id: `b-${Date.now()}`,
            name: 'Yeni Mola / Çay Molası',
            start: '10:00',
            end: '10:15',
            enabled: true
        };
        setBreaks([...breaks, newBreak]);
    };

    const handleRemoveBreak = (id) => {
        setBreaks(breaks.filter(b => b.id !== id));
    };

    const handleUpdateBreak = (id, field, value) => {
        setBreaks(breaks.map(b => b.id === id ? { ...b, [field]: value } : b));
    };

    const handleSave = async (e) => {
        e.preventDefault();
        const startH = parseInt(workStartHour);
        const endH = parseInt(workEndHour);

        if (startH >= endH) {
            alert("Mesai başlangıç saati, bitiş saatinden önce olmalıdır!");
            return;
        }

        setIsSaving(true);
        const newSettings = {
            workStartHour: startH,
            workEndHour: endH,
            breaks: breaks.map(b => ({
                id: b.id || `b-${Math.random()}`,
                name: b.name || 'Mola',
                start: b.start || '12:00',
                end: b.end || '13:00',
                enabled: Boolean(b.enabled)
            })),
            // Legacy fallbacks for compatibility
            lunchBreakEnabled: breaks.some(b => b.enabled),
            lunchBreakStart: breaks.find(b => b.name.includes('Yemek'))?.start || "12:00",
            lunchBreakEnd: breaks.find(b => b.name.includes('Yemek'))?.end || "13:00",
            updatedAt: new Date().toISOString()
        };

        try {
            if (db) {
                const configRef = doc(db, DESIGN_CONFIG_DOC_PATH, 'settings');
                await setDoc(configRef, newSettings, { merge: true });
            }
            if (onConfigUpdated) {
                onConfigUpdated(newSettings);
            }
            onClose();
        } catch (error) {
            console.error("Vardiya ve mola ayarları kaydedilemedi:", error);
            alert("Ayarlar kaydedilirken hata oluştu.");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="⚙️ Tasarım Vardiya & Çoklu Mola Kuralları">
            <form onSubmit={handleSave} className="space-y-6 text-gray-800 dark:text-gray-200">
                <div className="bg-indigo-50 dark:bg-indigo-900/30 p-4 rounded-xl border border-indigo-200 dark:border-indigo-800 text-xs text-indigo-900 dark:text-indigo-200 leading-relaxed">
                    <p className="font-bold flex items-center gap-1.5 text-sm mb-1 text-indigo-700 dark:text-indigo-300">
                        <ShieldAlert className="w-4 h-4" /> Otomatik Sayaç Durdurma Kuralları
                    </p>
                    Burada ekleyeceğiniz tüm mola saatlerinde (Çay molası, Yemek molası vb.), tasarımcılar o esnada aktif bir iş üzerinde çalışıyor olsalar dahi <b>iş sayacı otomatik olarak duracaktır</b>.
                </div>

                {/* MESAİ SAATLERİ */}
                <div className="bg-gray-50 dark:bg-gray-800/60 p-4 rounded-xl border border-gray-200 dark:border-gray-700 space-y-4">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 flex items-center gap-2">
                        <Clock className="w-4 h-4" /> Günlük Mesai Saatleri
                    </h4>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                                Mesai Başlangıç Saati
                            </label>
                            <select 
                                value={workStartHour}
                                onChange={(e) => setWorkStartHour(e.target.value)}
                                className="w-full p-2.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg font-bold text-sm"
                            >
                                {[6, 7, 8, 9, 10].map(h => (
                                    <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                                Mesai Bitiş Saati
                            </label>
                            <select 
                                value={workEndHour}
                                onChange={(e) => setWorkEndHour(e.target.value)}
                                className="w-full p-2.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg font-bold text-sm"
                            >
                                {[16, 17, 18, 19, 20, 21, 22].map(h => (
                                    <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>

                {/* ÇOKLU MOLA DÜZENLEME PANELİ */}
                <div className="bg-gray-50 dark:bg-gray-800/60 p-4 rounded-xl border border-gray-200 dark:border-gray-700 space-y-4">
                    <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 flex items-center gap-2">
                            <Coffee className="w-4 h-4" /> Otomatik Mola Kesintileri ({breaks.length})
                        </h4>
                        <button
                            type="button"
                            onClick={handleAddBreak}
                            className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-white rounded-lg text-xs font-bold flex items-center gap-1 shadow-sm transition"
                        >
                            <Plus className="w-3.5 h-3.5" /> Mola Ekle
                        </button>
                    </div>

                    <div className="space-y-3">
                        {breaks.map((b, idx) => (
                            <div key={b.id || idx} className="bg-white dark:bg-gray-700 p-3 rounded-lg border border-gray-200 dark:border-gray-600 flex flex-col sm:flex-row items-center gap-3">
                                <input 
                                    type="text" 
                                    value={b.name}
                                    onChange={(e) => handleUpdateBreak(b.id, 'name', e.target.value)}
                                    placeholder="Mola İsmi (Örn: Sabah Çay Molası)"
                                    className="flex-1 p-2 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-xs font-bold"
                                />

                                <div className="flex items-center gap-2">
                                    <input 
                                        type="time" 
                                        value={b.start}
                                        onChange={(e) => handleUpdateBreak(b.id, 'start', e.target.value)}
                                        className="p-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-xs font-bold"
                                    />
                                    <span className="text-gray-400 font-bold">-</span>
                                    <input 
                                        type="time" 
                                        value={b.end}
                                        onChange={(e) => handleUpdateBreak(b.id, 'end', e.target.value)}
                                        className="p-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-xs font-bold"
                                    />
                                </div>

                                <div className="flex items-center gap-2">
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input 
                                            type="checkbox" 
                                            checked={b.enabled}
                                            onChange={(e) => handleUpdateBreak(b.id, 'enabled', e.target.checked)}
                                            className="sr-only peer"
                                        />
                                        <div className="w-8 h-4 bg-gray-300 peer-focus:outline-none rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-amber-500"></div>
                                    </label>

                                    <button 
                                        type="button" 
                                        onClick={() => handleRemoveBreak(b.id)}
                                        className="p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition"
                                        title="Molayı Sil"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <button 
                        type="button" 
                        onClick={onClose}
                        className="px-4 py-2.5 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 font-bold rounded-xl text-xs transition"
                    >
                        İptal
                    </button>
                    <button 
                        type="submit" 
                        disabled={isSaving}
                        className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs shadow-lg transition flex items-center gap-2 disabled:opacity-50"
                    >
                        <Save className="w-4 h-4" />
                        {isSaving ? 'Kaydediliyor...' : 'Kuralları Kaydet'}
                    </button>
                </div>
            </form>
        </Modal>
    );
};

export default DesignConfigModal;
