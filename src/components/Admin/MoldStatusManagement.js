// src/components/Admin/MoldStatusManagement.js

import React, { useState, useEffect } from 'react';
import { 
    Plus, Edit2, Trash2, ArrowUp, ArrowDown, Check, X, 
    RefreshCw, Zap, Sparkles, HardHat, Cpu, Settings, Layers, CheckCircle, Tag
} from 'lucide-react';
import { db, collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot } from '../../config/firebase';
import { MOLD_STATUSES_COLLECTION, DEFAULT_MOLD_STATUSES } from '../../config/constants';

const COLOR_OPTIONS = [
    { label: 'Sarı', value: 'yellow', class: 'bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-300' },
    { label: 'Mor', value: 'purple', class: 'bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-900/30 dark:text-purple-300' },
    { label: 'Mavi', value: 'blue', class: 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/30 dark:text-blue-300' },
    { label: 'Kehribar', value: 'amber', class: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300' },
    { label: 'Turkuaz', value: 'cyan', class: 'bg-cyan-100 text-cyan-800 border-cyan-300 dark:bg-cyan-900/30 dark:text-cyan-300' },
    { label: 'İndigo', value: 'indigo', class: 'bg-indigo-100 text-indigo-800 border-indigo-300 dark:bg-indigo-900/30 dark:text-indigo-300' },
    { label: 'Turuncu', value: 'orange', class: 'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900/30 dark:text-orange-300' },
    { label: 'Gök Mavisi', value: 'teal', class: 'bg-teal-100 text-teal-800 border-teal-300 dark:bg-teal-900/30 dark:text-teal-300' },
    { label: 'Yeşil', value: 'green', class: 'bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-300' },
    { label: 'Kırmızı', value: 'red', class: 'bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-300' },
    { label: 'Gri', value: 'gray', class: 'bg-gray-100 text-gray-800 border-gray-300 dark:bg-gray-700 dark:text-gray-300' }
];

const ICON_OPTIONS = [
    { label: 'Yenile (RefreshCw)', value: 'RefreshCw', icon: RefreshCw },
    { label: 'Düzenle (Edit2)', value: 'Edit2', icon: Edit2 },
    { label: 'İşlemci (Cpu)', value: 'Cpu', icon: Cpu },
    { label: 'Yıldırım (Zap)', value: 'Zap', icon: Zap },
    { label: 'Pırıltı (Sparkles)', value: 'Sparkles', icon: Sparkles },
    { label: 'Baret (HardHat)', value: 'HardHat', icon: HardHat },
    { label: 'Ayar (Settings)', value: 'Settings', icon: Settings },
    { label: 'Katman (Layers)', value: 'Layers', icon: Layers },
    { label: 'Onay (CheckCircle)', value: 'CheckCircle', icon: CheckCircle },
    { label: 'Etiket (Tag)', value: 'Tag', icon: Tag }
];

const MoldStatusManagement = ({ db }) => {
    const [statuses, setStatuses] = useState([]);
    const [loading, setLoading] = useState(true);

    const [newStatusName, setNewStatusName] = useState('');
    const [newStatusColor, setNewStatusColor] = useState('blue');
    const [newStatusIcon, setNewStatusIcon] = useState('Tag');
    const [isSaving, setIsSaving] = useState(false);

    const [editingId, setEditingId] = useState(null);
    const [editName, setEditName] = useState('');
    const [editColor, setEditColor] = useState('blue');
    const [editIcon, setEditIcon] = useState('Tag');

    // Firestore canlı aboneliği ve ilk verileri yükleme
    useEffect(() => {
        if (!db) return;
        const colRef = collection(db, MOLD_STATUSES_COLLECTION);

        const unsubscribe = onSnapshot(colRef, async (snapshot) => {
            if (snapshot.empty) {
                // Varsayılan kalıp durumlarını otomatik ilk yükleme yap
                setLoading(true);
                for (let i = 0; i < DEFAULT_MOLD_STATUSES.length; i++) {
                    await addDoc(colRef, {
                        ...DEFAULT_MOLD_STATUSES[i],
                        orderIndex: i + 1,
                        createdAt: new Date().toISOString()
                    });
                }
                setLoading(false);
            } else {
                const list = snapshot.docs.map(docSnap => ({
                    id: docSnap.id,
                    ...docSnap.data()
                })).sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
                setStatuses(list);
                setLoading(false);
            }
        }, (err) => {
            console.error("Kalıp durumları çekme hatası:", err);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [db]);

    const handleAddStatus = async () => {
        if (!newStatusName.trim()) return alert("Lütfen durum adını yazınız.");
        setIsSaving(true);
        try {
            const colRef = collection(db, MOLD_STATUSES_COLLECTION);
            const maxOrder = statuses.length > 0 ? Math.max(...statuses.map(s => s.orderIndex || 0)) : 0;
            await addDoc(colRef, {
                name: newStatusName.trim().toUpperCase(),
                color: newStatusColor,
                icon: newStatusIcon,
                orderIndex: maxOrder + 1,
                createdAt: new Date().toISOString()
            });
            setNewStatusName('');
            setNewStatusColor('blue');
            setNewStatusIcon('Tag');
        } catch (error) {
            console.error("Durum ekleme hatası:", error);
            alert("Durum eklenemedi.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleStartEdit = (status) => {
        setEditingId(status.id);
        setEditName(status.name);
        setEditColor(status.color || 'blue');
        setEditIcon(status.icon || 'Tag');
    };

    const handleSaveEdit = async (id) => {
        if (!editName.trim()) return alert("Durum adı boş olamaz.");
        setIsSaving(true);
        try {
            const docRef = doc(db, MOLD_STATUSES_COLLECTION, id);
            await updateDoc(docRef, {
                name: editName.trim().toUpperCase(),
                color: editColor,
                icon: editIcon,
                updatedAt: new Date().toISOString()
            });
            setEditingId(null);
        } catch (error) {
            console.error("Durum güncelleme hatası:", error);
            alert("Durum güncellenemedi.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteStatus = async (id, name) => {
        if (!window.confirm(`"${name}" kalıp durumunu silmek istediğinize emin misiniz? Bu duruma sahip kalıplar etkilenebilir.`)) return;
        setIsSaving(true);
        try {
            await deleteDoc(doc(db, MOLD_STATUSES_COLLECTION, id));
        } catch (error) {
            console.error("Durum silme hatası:", error);
            alert("Durum silinemedi.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleMoveOrder = async (index, direction) => {
        if ((direction === 'up' && index === 0) || (direction === 'down' && index === statuses.length - 1)) return;
        const targetIndex = direction === 'up' ? index - 1 : index + 1;
        const currentItem = statuses[index];
        const targetItem = statuses[targetIndex];

        setIsSaving(true);
        try {
            await updateDoc(doc(db, MOLD_STATUSES_COLLECTION, currentItem.id), { orderIndex: targetItem.orderIndex || targetIndex + 1 });
            await updateDoc(doc(db, MOLD_STATUSES_COLLECTION, targetItem.id), { orderIndex: currentItem.orderIndex || index + 1 });
        } catch (error) {
            console.error("Sıralama değiştirme hatası:", error);
        } finally {
            setIsSaving(false);
        }
    };

    const renderIcon = (iconName) => {
        const found = ICON_OPTIONS.find(i => i.value === iconName);
        const IconComp = found ? found.icon : Tag;
        return <IconComp className="w-4 h-4" />;
    };

    return (
        <div className="space-y-6">
            <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2 mb-1">
                    <Tag className="w-5 h-5 text-blue-600" /> Kalıp Durumları Yönetimi
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                    Kalıp detay sayfasındaki durum seçeneğini ve kalıp imalat sayfasındaki üst hızlı filtreleme çubuğunu buradan özelleştirebilirsiniz.
                </p>
            </div>

            {/* YENİ DURUM EKLEME ALANI */}
            <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 space-y-4">
                <h4 className="font-bold text-sm text-gray-800 dark:text-gray-200">Yeni Kalıp Durumu Ekle</h4>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <input 
                        type="text"
                        placeholder="Örn: ISIL İŞLEM..."
                        value={newStatusName}
                        onChange={(e) => setNewStatusName(e.target.value)}
                        className="p-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-bold text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    />

                    <select
                        value={newStatusColor}
                        onChange={(e) => setNewStatusColor(e.target.value)}
                        className="p-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-bold text-sm outline-none cursor-pointer"
                    >
                        {COLOR_OPTIONS.map(c => <option key={c.value} value={c.value}>{c.label} Rengi</option>)}
                    </select>

                    <select
                        value={newStatusIcon}
                        onChange={(e) => setNewStatusIcon(e.target.value)}
                        className="p-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-bold text-sm outline-none cursor-pointer"
                    >
                        {ICON_OPTIONS.map(i => <option key={i.value} value={i.value}>{i.label}</option>)}
                    </select>

                    <button 
                        onClick={handleAddStatus}
                        disabled={isSaving || !newStatusName.trim()}
                        className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-sm shadow transition flex items-center justify-center disabled:opacity-50"
                    >
                        <Plus className="w-4 h-4 mr-1.5" /> Durum Ekle
                    </button>
                </div>
            </div>

            {/* MEVCUT DURUMLAR LİSTESİ */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 flex justify-between items-center">
                    <h4 className="font-bold text-sm text-gray-800 dark:text-gray-200">Tanımlı Kalıp Durumları ({statuses.length})</h4>
                    <span className="text-xs text-gray-500 font-medium">* Yukarı/Aşağı oklar ile sıralamayı değiştirebilirsiniz.</span>
                </div>

                <div className="divide-y divide-gray-100 dark:divide-gray-700">
                    {statuses.map((status, index) => {
                        const isEditing = editingId === status.id;
                        const colorConfig = COLOR_OPTIONS.find(c => c.value === status.color) || COLOR_OPTIONS[2];

                        return (
                            <div key={status.id} className="p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 hover:bg-gray-50 dark:hover:bg-gray-750 transition">
                                {isEditing ? (
                                    <div className="flex flex-wrap items-center gap-2 flex-1 w-full">
                                        <input 
                                            type="text"
                                            value={editName}
                                            onChange={(e) => setEditName(e.target.value)}
                                            className="p-2 border border-blue-400 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-bold text-sm flex-1"
                                        />
                                        <select
                                            value={editColor}
                                            onChange={(e) => setEditColor(e.target.value)}
                                            className="p-2 border border-blue-400 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-xs font-bold"
                                        >
                                            {COLOR_OPTIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                                        </select>
                                        <select
                                            value={editIcon}
                                            onChange={(e) => setEditIcon(e.target.value)}
                                            className="p-2 border border-blue-400 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-xs font-bold"
                                        >
                                            {ICON_OPTIONS.map(i => <option key={i.value} value={i.value}>{i.label}</option>)}
                                        </select>

                                        <button onClick={() => handleSaveEdit(status.id)} className="p-2 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30 rounded" title="Kaydet">
                                            <Check className="w-5 h-5" />
                                        </button>
                                        <button onClick={() => setEditingId(null)} className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded" title="İptal">
                                            <X className="w-5 h-5" />
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        <div className="flex items-center gap-3">
                                            <div className="flex flex-col text-gray-400">
                                                <button onClick={() => handleMoveOrder(index, 'up')} disabled={index === 0} className="hover:text-blue-600 disabled:opacity-30">
                                                    <ArrowUp className="w-4 h-4" />
                                                </button>
                                                <button onClick={() => handleMoveOrder(index, 'down')} disabled={index === statuses.length - 1} className="hover:text-blue-600 disabled:opacity-30">
                                                    <ArrowDown className="w-4 h-4" />
                                                </button>
                                            </div>
                                            <span className="font-mono text-xs font-bold text-gray-400 w-5">{index + 1}.</span>
                                            <div className={`px-3 py-1 rounded-lg border text-xs font-black flex items-center gap-2 ${colorConfig.class}`}>
                                                {renderIcon(status.icon)}
                                                {status.name}
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2 self-end md:self-auto">
                                            <button onClick={() => handleStartEdit(status)} className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded transition" title="Düzenle">
                                                <Edit2 className="w-4 h-4" />
                                            </button>
                                            <button onClick={() => handleDeleteStatus(status.id, status.name)} className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition" title="Sil">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
                        );
                    })}

                    {statuses.length === 0 && !loading && (
                        <div className="p-8 text-center text-gray-400 font-bold">Tanımlı kalıp durumu bulunamadı.</div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default MoldStatusManagement;
