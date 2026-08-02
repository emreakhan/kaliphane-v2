// src/components/Modals/ProductDevConfigModal.js

import React, { useState, useEffect } from 'react';
import { Clock, Plus, Trash2, CheckCircle, AlertTriangle } from 'lucide-react';
import { doc, setDoc } from '../../config/firebase.js';
import Modal from './Modal.js';

const PRODUCT_DEV_CONFIG_DOC_PATH = 'artifacts/default-app-id/public/data/productDevConfig';

const ProductDevConfigModal = ({ isOpen, onClose, db, currentConfig = {} }) => {
    const [workStartHour, setWorkStartHour] = useState(8);
    const [workEndHour, setWorkEndHour] = useState(18);
    const [breaks, setBreaks] = useState([]);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (currentConfig) {
            setWorkStartHour(currentConfig.workStartHour ?? 8);
            setWorkEndHour(currentConfig.workEndHour ?? 18);
            setBreaks(currentConfig.breaks || [
                { id: 'b-1', name: 'Sabah Çay Molası', start: '10:00', end: '10:15', enabled: true },
                { id: 'b-2', name: 'Yemek Molası', start: '12:00', end: '13:00', enabled: true },
                { id: 'b-3', name: 'İkindi Çay Molası', start: '15:30', end: '15:45', enabled: true }
            ]);
        }
    }, [currentConfig]);

    const handleAddBreak = () => {
        const newBreak = {
            id: `break-${Date.now()}`,
            name: 'Yeni Mola',
            start: '15:00',
            end: '15:15',
            enabled: true
        };
        setBreaks([...breaks, newBreak]);
    };

    const handleRemoveBreak = (id) => {
        setBreaks(breaks.filter(b => b.id !== id));
    };

    const handleBreakChange = (id, field, value) => {
        setBreaks(breaks.map(b => b.id === id ? { ...b, [field]: value } : b));
    };

    const handleSave = async () => {
        if (!db) return;
        setIsSaving(true);
        try {
            const configDocRef = doc(db, PRODUCT_DEV_CONFIG_DOC_PATH, 'settings');
            await setDoc(configDocRef, {
                workStartHour: Number(workStartHour),
                workEndHour: Number(workEndHour),
                breaks: breaks,
                updatedAt: new Date().toISOString()
            }, { merge: true });

            onClose();
        } catch (error) {
            console.error("Vardiya ayarları kaydetme hatası:", error);
            alert("Vardiya ayarları kaydedilemedi.");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="⚙️ Ürün Geliştirme Vardiya & Mola Ayarları">
            <div className="space-y-5 text-xs text-gray-800 dark:text-gray-200">
                <div className="p-3 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700/50 rounded-lg flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                    <p className="text-[11px] leading-relaxed text-amber-900 dark:text-amber-200">
                        Bu ayarlar Ürün Geliştirme Ofisi'ndeki işlerin harcanan zaman hesaplamalarında, mesai saatlerinin ve molaların otomatik düşülmesi için kullanılır.
                    </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block font-bold mb-1">Vardiya Başlangıç Saati</label>
                        <select 
                            value={workStartHour}
                            onChange={(e) => setWorkStartHour(Number(e.target.value))}
                            className="w-full p-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg font-bold"
                        >
                            {[6, 7, 8, 9].map(h => (
                                <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block font-bold mb-1">Vardiya Bitiş Saati</label>
                        <select 
                            value={workEndHour}
                            onChange={(e) => setWorkEndHour(Number(e.target.value))}
                            className="w-full p-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg font-bold"
                        >
                            {[16, 17, 18, 19, 20].map(h => (
                                <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="space-y-3 pt-2 border-t border-gray-200 dark:border-gray-700">
                    <div className="flex justify-between items-center">
                        <h4 className="font-bold text-sm text-gray-900 dark:text-white flex items-center gap-1.5">
                            <Clock className="w-4 h-4 text-amber-500" /> Tanımlı Molalar & Yemek Saatleri
                        </h4>
                        <button
                            type="button"
                            onClick={handleAddBreak}
                            className="px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded text-xs font-bold transition flex items-center gap-1"
                        >
                            <Plus className="w-3.5 h-3.5" /> Mola Ekle
                        </button>
                    </div>

                    <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                        {breaks.map((b) => (
                            <div key={b.id} className="p-2.5 bg-gray-50 dark:bg-gray-700/60 rounded-lg border border-gray-200 dark:border-gray-600 flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    checked={b.enabled !== false}
                                    onChange={(e) => handleBreakChange(b.id, 'enabled', e.target.checked)}
                                    className="w-4 h-4 text-amber-600 rounded border-gray-300 focus:ring-amber-500"
                                />
                                <input
                                    type="text"
                                    value={b.name}
                                    onChange={(e) => handleBreakChange(b.id, 'name', e.target.value)}
                                    placeholder="Mola adı"
                                    className="flex-1 p-1.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded font-medium text-xs"
                                />
                                <input
                                    type="time"
                                    value={b.start}
                                    onChange={(e) => handleBreakChange(b.id, 'start', e.target.value)}
                                    className="p-1.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded font-bold text-xs"
                                />
                                <span>-</span>
                                <input
                                    type="time"
                                    value={b.end}
                                    onChange={(e) => handleBreakChange(b.id, 'end', e.target.value)}
                                    className="p-1.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded font-bold text-xs"
                                />
                                <button
                                    type="button"
                                    onClick={() => handleRemoveBreak(b.id)}
                                    className="p-1.5 text-gray-400 hover:text-red-500 transition"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="flex justify-end gap-2 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg font-bold">
                        İptal
                    </button>
                    <button 
                        onClick={handleSave} 
                        disabled={isSaving}
                        className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-bold transition shadow-sm flex items-center gap-1"
                    >
                        <CheckCircle className="w-4 h-4" /> {isSaving ? 'Kaydediliyor...' : 'Ayarları Kaydet'}
                    </button>
                </div>
            </div>
        </Modal>
    );
};

export default ProductDevConfigModal;
