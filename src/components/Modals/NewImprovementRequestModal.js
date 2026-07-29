// src/components/Modals/NewImprovementRequestModal.js

import React, { useState } from 'react';
import { Lightbulb, Image as ImageIcon, Upload, X, ShieldAlert, Save } from 'lucide-react';
import Modal from './Modal.js';
import { collection, addDoc } from '../../config/firebase.js';
import { IMPROVEMENT_REQUESTS_COLLECTION } from '../../config/constants.js';

const DEPARTMENTS = [
    'Kalıp Tasarım',
    'CAM',
    'CNC',
    'Erezyon',
    'Polisaj',
    'Kalite & Ölçüm',
    'Bakım & Onarım',
    'Genel Fabrika'
];

const NewImprovementRequestModal = ({ isOpen, onClose, db, loggedInUser }) => {
    const [title, setTitle] = useState('');
    const [targetDepartment, setTargetDepartment] = useState('Kalıp Tasarım');
    const [priority, setPriority] = useState('YÜKSEK');
    const [description, setDescription] = useState('');
    const [images, setImages] = useState([]);
    const [isSaving, setIsSaving] = useState(false);

    const handleImageUpload = (e) => {
        const files = Array.from(e.target.files);
        files.forEach(file => {
            if (!file.type.startsWith('image/')) {
                alert('Lütfen geçerli bir resim dosyası seçiniz.');
                return;
            }
            const reader = new FileReader();
            reader.onloadend = () => {
                setImages(prev => [...prev, reader.result]);
            };
            reader.readAsDataURL(file);
        });
    };

    const removeImage = (index) => {
        setImages(images.filter((_, i) => i !== index));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!title.trim() || !description.trim()) {
            alert('Lütfen talep başlığı ve açıklama alanlarını doldurunuz.');
            return;
        }

        setIsSaving(true);
        try {
            const docData = {
                title: title.trim(),
                targetDepartment,
                priority,
                description: description.trim(),
                images,
                status: 'PENDING', // PENDING, UNDER_REVIEW, APPROVED, REJECTED
                createdByName: loggedInUser?.name || 'Bilinmeyen Kullanıcı',
                createdByRole: loggedInUser?.role || 'Operatör',
                createdAt: new Date().toISOString(),
                managerResponseNote: '',
                reviewedByName: '',
                approvedAt: null
            };

            if (db) {
                await addDoc(collection(db, IMPROVEMENT_REQUESTS_COLLECTION), docData);
            }
            
            setTitle('');
            setDescription('');
            setImages([]);
            onClose();
        } catch (error) {
            console.error("İyileştirme talebi oluşturulamadı:", error);
            alert("Talep kaydedilirken hata oluştu.");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="💡 Yeni İyileştirme / Öneri Talebi Oluştur">
            <form onSubmit={handleSubmit} className="space-y-4 text-xs text-gray-800 dark:text-gray-200">
                <div className="bg-amber-50 dark:bg-amber-900/30 p-3 rounded-xl border border-amber-200 dark:border-amber-800 leading-relaxed text-amber-900 dark:text-amber-200">
                    Saha operasyonlarında karşılaştığınız takımlama,Pafta tasarımı veya süreç aksaklıklarını ilgili departmana görsellerle bildirebilirsiniz.
                </div>

                <div>
                    <label className="block font-bold mb-1">Talep / Öneri Başlığı *</label>
                    <input 
                        type="text" 
                        placeholder="Örn: Cıvata boylarının kısaltılması talebi (Kılavuz Kırılması Riski)"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className="w-full p-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg font-bold text-xs"
                    />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block font-bold mb-1">Hedef Departman *</label>
                        <select 
                            value={targetDepartment}
                            onChange={(e) => setTargetDepartment(e.target.value)}
                            className="w-full p-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg font-bold text-xs"
                        >
                            {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                        </select>
                    </div>

                    <div>
                        <label className="block font-bold mb-1">Öncelik Derecesi</label>
                        <select 
                            value={priority}
                            onChange={(e) => setPriority(e.target.value)}
                            className="w-full p-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg font-bold text-xs"
                        >
                            <option value="DÜŞÜK">🟢 Düşük</option>
                            <option value="ORTA">🟡 Orta</option>
                            <option value="YÜKSEK">🟠 Yüksek (Takım Kırılması vb.)</option>
                            <option value="KRİTİK">🔴 Kritik (İmalat Durdurucu)</option>
                        </select>
                    </div>
                </div>

                <div>
                    <label className="block font-bold mb-1">Problem ve İyileştirme Detayı *</label>
                    <textarea 
                        rows="4"
                        placeholder="Karşılaşabileceğiniz sorunları detaylandırın. Örn: Cıvata boyları M12x40 olduğu için dip kılavuz operasyonunda sıkışma ve takım kırılması yaşanmaktadır. M12x25 kullanılması hedeflenmektedir..."
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        className="w-full p-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-xs"
                    />
                </div>

                {/* GÖRSEL FOTOĞRAF YÜKLEME ALANI */}
                <div>
                    <label className="block font-bold mb-1 flex items-center gap-1.5">
                        <ImageIcon className="w-4 h-4 text-indigo-500" /> Fotoğraf / Çizim Ekle (Opsiyonel)
                    </label>
                    
                    <label className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-indigo-500 rounded-xl cursor-pointer bg-gray-50/50 dark:bg-gray-800/50 transition">
                        <Upload className="w-6 h-6 text-indigo-500 mb-1" />
                        <span className="font-bold text-gray-700 dark:text-gray-300">Fotoğraf Yüklemek İçin Tıklayın</span>
                        <span className="text-[10px] text-gray-400">PNG, JPG, JPEG (Kırılan takım, pafta çizimi resmi vb.)</span>
                        <input 
                            type="file" 
                            accept="image/*" 
                            multiple 
                            onChange={handleImageUpload} 
                            className="hidden" 
                        />
                    </label>

                    {images.length > 0 && (
                        <div className="grid grid-cols-4 gap-2 mt-3">
                            {images.map((img, idx) => (
                                <div key={idx} className="relative group rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 h-20 bg-black">
                                    <img src={img} alt={`yükleme-${idx}`} className="w-full h-full object-cover" />
                                    <button 
                                        type="button" 
                                        onClick={() => removeImage(idx)}
                                        className="absolute top-1 right-1 bg-red-600 text-white p-1 rounded-full opacity-80 hover:opacity-100 transition"
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-gray-200 dark:border-gray-700">
                    <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg font-bold">İptal</button>
                    <button type="submit" disabled={isSaving} className="px-5 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-bold shadow transition flex items-center gap-1.5">
                        <Save className="w-4 h-4" /> {isSaving ? 'Kaydediliyor...' : 'Talebi Yayınla'}
                    </button>
                </div>
            </form>
        </Modal>
    );
};

export default NewImprovementRequestModal;
