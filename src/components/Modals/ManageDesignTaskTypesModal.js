import React, { useState } from 'react';
import { Plus, Edit2, Trash2, Check, X, Settings } from 'lucide-react';
import Modal from './Modal';
import { db, doc, addDoc, updateDoc, deleteDoc, collection } from '../../config/firebase';
import { DESIGN_TASK_TYPES_COLLECTION } from '../../config/constants';

const ManageDesignTaskTypesModal = ({ isOpen, onClose, taskTypes = [] }) => {
    const [newTypeName, setNewTypeName] = useState('');
    const [editingId, setEditingId] = useState(null);
    const [editingName, setEditingName] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    const handleAdd = async () => {
        if (!newTypeName.trim()) return;
        setIsSaving(true);
        try {
            const colRef = collection(db, DESIGN_TASK_TYPES_COLLECTION);
            await addDoc(colRef, {
                name: newTypeName.trim(),
                orderIndex: taskTypes.length + 1,
                createdAt: new Date().toISOString()
            });
            setNewTypeName('');
        } catch (error) {
            console.error("İş türü ekleme hatası:", error);
            alert("Yeni iş türü eklenemedi.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleStartEdit = (typeObj) => {
        setEditingId(typeObj.id);
        setEditingName(typeObj.name);
    };

    const handleSaveEdit = async (id) => {
        if (!editingName.trim()) return;
        setIsSaving(true);
        try {
            const docRef = doc(db, DESIGN_TASK_TYPES_COLLECTION, id);
            await updateDoc(docRef, {
                name: editingName.trim(),
                updatedAt: new Date().toISOString()
            });
            setEditingId(null);
            setEditingName('');
        } catch (error) {
            console.error("İş türü güncelleme hatası:", error);
            alert("İş türü güncellenemedi.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (id, name) => {
        if (!window.confirm(`"${name}" iş türünü silmek istediğinize emin misiniz?`)) return;
        setIsSaving(true);
        try {
            const docRef = doc(db, DESIGN_TASK_TYPES_COLLECTION, id);
            await deleteDoc(docRef);
        } catch (error) {
            console.error("İş türü silme hatası:", error);
            alert("İş türü silinemedi.");
        } finally {
            setIsSaving(false);
        }
    };

    if (!isOpen) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Tasarım İş Türlerini Yönet">
            <div className="space-y-5">
                <div className="bg-indigo-50 dark:bg-indigo-900/20 p-3 rounded-lg border border-indigo-100 dark:border-indigo-800">
                    <p className="text-xs text-indigo-800 dark:text-indigo-300 font-medium">
                        Tasarım ekibinin iş emri oluştururken ve planlama yaparken seçeceği <strong>Tasarım İş Türleri</strong> listesini buradan düzenleyebilirsiniz.
                    </p>
                </div>

                {/* YENİ TÜR EKLEME FORMU */}
                <div className="flex gap-2">
                    <input 
                        type="text"
                        placeholder="Örn: 3D REKLEKSİYON TASARIMI..."
                        value={newTypeName}
                        onChange={(e) => setNewTypeName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
                        className="flex-1 p-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-bold text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <button 
                        onClick={handleAdd}
                        disabled={isSaving || !newTypeName.trim()}
                        className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold text-sm shadow transition flex items-center shrink-0 disabled:opacity-50"
                    >
                        <Plus className="w-4 h-4 mr-1" /> Ekle
                    </button>
                </div>

                {/* TÜR LİSTESİ */}
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden divide-y divide-gray-100 dark:divide-gray-700 max-h-72 overflow-y-auto">
                    {taskTypes.map((t) => {
                        const typeId = t.id || t;
                        const typeName = typeof t === 'string' ? t : t.name;
                        const isEditing = editingId === typeId;

                        return (
                            <div key={typeId} className="p-3 bg-white dark:bg-gray-800 flex items-center justify-between gap-2 hover:bg-gray-50 dark:hover:bg-gray-750 transition">
                                {isEditing ? (
                                    <div className="flex items-center gap-2 flex-1">
                                        <input 
                                            type="text"
                                            value={editingName}
                                            onChange={(e) => setEditingName(e.target.value)}
                                            className="flex-1 p-1.5 border border-indigo-400 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm font-bold"
                                        />
                                        <button 
                                            onClick={() => handleSaveEdit(typeId)}
                                            className="p-1.5 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30 rounded"
                                            title="Kaydet"
                                        >
                                            <Check className="w-4 h-4" />
                                        </button>
                                        <button 
                                            onClick={() => setEditingId(null)}
                                            className="p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                                            title="İptal"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        <span className="font-bold text-sm text-gray-800 dark:text-gray-200">{typeName}</span>
                                        <div className="flex items-center gap-1">
                                            {typeof t !== 'string' && t.id && (
                                                <>
                                                    <button 
                                                        onClick={() => handleStartEdit(t)}
                                                        className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded transition"
                                                        title="Düzenle"
                                                    >
                                                        <Edit2 className="w-4 h-4" />
                                                    </button>
                                                    <button 
                                                        onClick={() => handleDelete(t.id, t.name)}
                                                        className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition"
                                                        title="Sil"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </>
                                )}
                            </div>
                        );
                    })}

                    {taskTypes.length === 0 && (
                        <div className="p-4 text-center text-gray-500 text-sm font-bold">Tanımlı iş türü bulunamadı.</div>
                    )}
                </div>

                <div className="pt-3 border-t border-gray-200 dark:border-gray-700 flex justify-end">
                    <button 
                        onClick={onClose}
                        className="px-5 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 rounded-lg text-sm font-bold transition"
                    >
                        Kapat
                    </button>
                </div>
            </div>
        </Modal>
    );
};

export default ManageDesignTaskTypesModal;
