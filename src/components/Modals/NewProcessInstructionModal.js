// src/components/Modals/NewProcessInstructionModal.js

import React, { useState } from 'react';
import { FileText, Image as ImageIcon, Upload, X, Save, Sliders, CheckSquare } from 'lucide-react';
import Modal from './Modal.js';
import { collection, addDoc } from '../../config/firebase.js';
import { PROCESS_INSTRUCTIONS_COLLECTION } from '../../config/constants.js';

const AVAILABLE_ROLES = [
    'CAM Operatörü',
    'CNC Operatörü',
    'Kalıp Tasarım Sorumlusu',
    'Kalıp Tasarım Yöneticisi',
    'Atölye Sorumlusu',
    'Kalıp Montaj Ustası',
    'Kalite Kontrol',
    'Proje Sorumlusu'
];

const CATEGORIES = [
    'KESİCİ TAKIM STANDARDI',
    'CAM & OPERASYON KURALI',
    'KALIP İŞLEME PARAMETRELERİ',
    'TEZGAH & GÜVENLİK TALİMATI',
    'MALZEME İŞLEME KURALI'
];

const NewProcessInstructionModal = ({ isOpen, onClose, db, loggedInUser }) => {
    const [title, setTitle] = useState('');
    const [category, setCategory] = useState('KESİCİ TAKIM STANDARDI');
    const [targetRoles, setTargetRoles] = useState(['CAM Operatörü', 'CNC Operatörü']);
    
    // TAKIM PARAMETRELERİ
    const [vc, setVc] = useState('220');
    const [fz, setFz] = useState('0.08');
    const [ae, setAe] = useState('0.3');
    const [ap, setAp] = useState('0.5');
    const [coolant, setCoolant] = useState('Yüksek Basınçlı Hava + Yağ Sisleme');

    const [instructionNote, setInstructionNote] = useState('');
    const [images, setImages] = useState([]);
    const [isSaving, setIsSaving] = useState(false);

    const toggleRole = (role) => {
        if (targetRoles.includes(role)) {
            setTargetRoles(targetRoles.filter(r => r !== role));
        } else {
            setTargetRoles([...targetRoles, role]);
        }
    };

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
        if (!title.trim() || targetRoles.length === 0) {
            alert('Lütfen talimat başlığı giriniz ve en az 1 hedef rol seçiniz.');
            return;
        }

        setIsSaving(true);
        try {
            const docData = {
                title: title.trim(),
                category,
                targetRoles,
                parameters: {
                    vc: parseFloat(vc) || 0,
                    fz: parseFloat(fz) || 0,
                    ae: parseFloat(ae) || 0,
                    ap: parseFloat(ap) || 0,
                    coolant
                },
                instructionNote: instructionNote.trim(),
                images,
                acknowledgments: [], // [{ userName, role, confirmedAt }]
                createdBy: loggedInUser?.name || 'Süreç Sorumlusu',
                createdAt: new Date().toISOString()
            };

            if (db) {
                await addDoc(collection(db, PROCESS_INSTRUCTIONS_COLLECTION), docData);
            }

            setTitle('');
            setInstructionNote('');
            setImages([]);
            onClose();
        } catch (error) {
            console.error("Proses talimatı eklenemedi:", error);
            alert("Talimat yayınlanırken hata oluştu.");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="📜 Yeni CAM & Kesici Takım Talimatı Yayınla">
            <form onSubmit={handleSubmit} className="space-y-4 text-xs text-gray-800 dark:text-gray-200">
                <div className="bg-indigo-50 dark:bg-indigo-900/30 p-3 rounded-xl border border-indigo-200 dark:border-indigo-800 text-indigo-900 dark:text-indigo-200 leading-relaxed">
                    Yeni alınan kesici takımlar veya değişen proses standartları için talimat oluşturun. Seçilen hedef personelin ekranına <b>"Okudum & Anladım"</b> teyit butonu düşecektir.
                </div>

                <div>
                    <label className="block font-bold mb-1">Talimat / Takım Standart Başlığı *</label>
                    <input 
                        type="text" 
                        placeholder="Örn: Yeni Y-Marka 10mm Küre Freze Kullanım ve Devir/İlerleme Standartları"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className="w-full p-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg font-bold text-xs"
                    />
                </div>

                <div>
                    <label className="block font-bold mb-1">Kategori</label>
                    <select 
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        className="w-full p-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg font-bold text-xs"
                    >
                        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                </div>

                <div>
                    <label className="block font-bold mb-1">Okuması & Teyit Etmesi Gereken Roller *</label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {AVAILABLE_ROLES.map(role => {
                            const isChecked = targetRoles.includes(role);
                            return (
                                <button
                                    type="button"
                                    key={role}
                                    onClick={() => toggleRole(role)}
                                    className={`p-2 rounded-lg font-bold text-left transition flex items-center justify-between border ${isChecked ? 'bg-indigo-100 border-indigo-500 text-indigo-900 dark:bg-indigo-900/60 dark:text-indigo-200' : 'bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-500'}`}
                                >
                                    <span className="truncate text-[11px]">{role}</span>
                                    {isChecked && <CheckSquare className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 flex-shrink-0" />}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* PARAMETRE TABLOSU */}
                <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-xl border border-gray-200 dark:border-gray-700 space-y-2">
                    <h4 className="font-bold text-xs text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
                        <Sliders className="w-3.5 h-3.5" /> Standart İşleme Parametreleri (İsteğe Bağlı)
                    </h4>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <div>
                            <label className="block text-[10px] font-bold text-gray-500">Kesme Hızı Vc (m/dk)</label>
                            <input type="number" step="1" value={vc} onChange={(e) => setVc(e.target.value)} className="w-full p-2 bg-white dark:bg-gray-700 border rounded font-bold text-xs" />
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-gray-500">İlerleme fz (mm/diş)</label>
                            <input type="number" step="0.01" value={fz} onChange={(e) => setFz(e.target.value)} className="w-full p-2 bg-white dark:bg-gray-700 border rounded font-bold text-xs" />
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-gray-500">Yan Adım ae (mm)</label>
                            <input type="number" step="0.1" value={ae} onChange={(e) => setAe(e.target.value)} className="w-full p-2 bg-white dark:bg-gray-700 border rounded font-bold text-xs" />
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-gray-500">Derinlik ap (mm)</label>
                            <input type="number" step="0.1" value={ap} onChange={(e) => setAp(e.target.value)} className="w-full p-2 bg-white dark:bg-gray-700 border rounded font-bold text-xs" />
                        </div>
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold text-gray-500">Soğutma Tipi</label>
                        <input type="text" value={coolant} onChange={(e) => setCoolant(e.target.value)} className="w-full p-2 bg-white dark:bg-gray-700 border rounded font-bold text-xs" />
                    </div>
                </div>

                <div>
                    <label className="block font-bold mb-1">Özel Talimatlar & Dikkat Edilecek Hususlar</label>
                    <textarea 
                        rows="3"
                        placeholder="Örn: 4140 sertleştirilmiş malzemede soğutma suyu kesinlikle açılmayacak, yüksek basınçlı hava kullanılacaktır."
                        value={instructionNote}
                        onChange={(e) => setInstructionNote(e.target.value)}
                        className="w-full p-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-xs"
                    />
                </div>

                {/* GÖRSEL FOTOĞRAF YÜKLEME ALANI */}
                <div>
                    <label className="block font-bold mb-1 flex items-center gap-1.5">
                        <ImageIcon className="w-4 h-4 text-indigo-500" /> Takım Görseli / Bağlama Fotoğrafı Ekle
                    </label>
                    
                    <label className="flex flex-col items-center justify-center p-3 border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-indigo-500 rounded-xl cursor-pointer bg-gray-50/50 dark:bg-gray-800/50 transition">
                        <Upload className="w-5 h-5 text-indigo-500 mb-1" />
                        <span className="font-bold text-gray-700 dark:text-gray-300 text-xs">Fotoğraf Yüklemek İçin Tıklayın</span>
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
                    <button type="submit" disabled={isSaving} className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold shadow transition flex items-center gap-1.5">
                        <Save className="w-4 h-4" /> {isSaving ? 'Kaydediliyor...' : 'Talimatı Yayınla'}
                    </button>
                </div>
            </form>
        </Modal>
    );
};

export default NewProcessInstructionModal;
