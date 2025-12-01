// src/components/Modals/DetailedProjectModal.js

import React, { useState, useEffect } from 'react';
import Modal from './Modal.js';
import { Save, Calendar, UploadCloud, Link, User, FileText, CheckCircle, Loader } from 'lucide-react';
import { PROJECT_TYPES, PERSONNEL_ROLES } from '../../config/constants.js';
import { storage, ref, uploadBytes, getDownloadURL } from '../../config/firebase.js'; // Storage importları

const DetailedProjectModal = ({ isOpen, onClose, onSave, personnel }) => {
    const [formData, setFormData] = useState({
        moldName: '',
        customer: '',
        projectType: PROJECT_TYPES.NEW_MOLD,
        moldDeadline: '',
        priority: 1,
        productImageUrl: '', // Artık buraya dosya URL'si gelecek
        trialReportUrl: '',
        projectManager: '',
        moldDesigner: ''
    });

    const [errors, setErrors] = useState({});
    const [isUploading, setIsUploading] = useState(false); // Yükleme durumu
    const [uploadSuccess, setUploadSuccess] = useState(false); // Başarılı yükleme ikonu için

    // Modal açılınca temizle
    useEffect(() => {
        if (isOpen) {
            setFormData({
                moldName: '',
                customer: '',
                projectType: PROJECT_TYPES.NEW_MOLD,
                moldDeadline: '',
                priority: 1,
                productImageUrl: '',
                trialReportUrl: '',
                projectManager: '',
                moldDesigner: ''
            });
            setErrors({});
            setUploadSuccess(false);
            setIsUploading(false);
        }
    }, [isOpen]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
        if (errors[name]) setErrors(prev => ({ ...prev, [name]: null }));
    };

    // --- DOSYA YÜKLEME FONKSİYONU ---
    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Dosya boyutu kontrolü (Örn: 5MB)
        if (file.size > 5 * 1024 * 1024) {
            alert("Dosya boyutu 5MB'dan büyük olamaz.");
            return;
        }

        setIsUploading(true);
        setUploadSuccess(false);

        try {
            // 1. Dosya ismini benzersiz yap (çakışmayı önlemek için tarih ekle)
            const uniqueFileName = `mold_images/${Date.now()}_${file.name}`;
            const storageRef = ref(storage, uniqueFileName);

            // 2. Yükle
            await uploadBytes(storageRef, file);

            // 3. Linki al
            const downloadURL = await getDownloadURL(storageRef);

            // 4. State'e yaz
            setFormData(prev => ({ ...prev, productImageUrl: downloadURL }));
            setUploadSuccess(true);
            
        } catch (error) {
            console.error("Yükleme hatası:", error);
            alert("Resim yüklenirken bir hata oluştu. Lütfen tekrar deneyin.");
        } finally {
            setIsUploading(false);
        }
    };
    // -------------------------------

    const handleSubmit = () => {
        const newErrors = {};
        if (!formData.moldName.trim()) newErrors.moldName = 'Kalıp adı zorunludur.';
        if (!formData.customer.trim()) newErrors.customer = 'Müşteri adı zorunludur.';
        if (!formData.moldDeadline) newErrors.moldDeadline = 'Termin tarihi seçilmelidir.';
        
        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
            return;
        }
        onSave(formData);
    };

    const projectManagers = personnel.filter(p => p.role === PERSONNEL_ROLES.PROJE_SORUMLUSU || p.role === PERSONNEL_ROLES.ADMIN);
    const designers = personnel.filter(p => p.role === PERSONNEL_ROLES.KALIP_TASARIM_SORUMLUSU || p.role === PERSONNEL_ROLES.ADMIN);

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Yeni Proje Başlat">
            <div className="space-y-4">
                
                {/* 1. Satır: Kalıp Adı & Müşteri */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Kalıp Adı <span className="text-red-500">*</span></label>
                        <input type="text" name="moldName" value={formData.moldName} onChange={handleChange} placeholder="Örn: 32 Gözlü Kapak" className={`w-full p-2 border rounded-lg dark:bg-gray-700 dark:text-white ${errors.moldName ? 'border-red-500' : 'border-gray-300'}`} />
                        {errors.moldName && <p className="text-xs text-red-500 mt-1">{errors.moldName}</p>}
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Müşteri <span className="text-red-500">*</span></label>
                        <input type="text" name="customer" value={formData.customer} onChange={handleChange} placeholder="Firma Adı" className={`w-full p-2 border rounded-lg dark:bg-gray-700 dark:text-white ${errors.customer ? 'border-red-500' : 'border-gray-300'}`} />
                        {errors.customer && <p className="text-xs text-red-500 mt-1">{errors.customer}</p>}
                    </div>
                </div>

                {/* 2. Satır: Tip & Aciliyet */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Proje Tipi</label>
                        <select name="projectType" value={formData.projectType} onChange={handleChange} className="w-full p-2 border border-gray-300 rounded-lg dark:bg-gray-700 dark:text-white">
                            {Object.values(PROJECT_TYPES).map(type => <option key={type} value={type}>{type}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Aciliyet (1-5)</label>
                        <input type="number" name="priority" min="1" max="5" value={formData.priority} onChange={handleChange} className="w-full p-2 border border-gray-300 rounded-lg dark:bg-gray-700 dark:text-white" />
                    </div>
                </div>

                {/* 3. Satır: Termin */}
                <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg border border-blue-100 dark:border-blue-800">
                    <label className="block text-sm font-bold text-blue-800 dark:text-blue-300 mb-1 flex items-center"><Calendar className="w-4 h-4 mr-2" /> Termin Tarihi (Zorunlu) <span className="text-red-500 ml-1">*</span></label>
                    <input type="date" name="moldDeadline" value={formData.moldDeadline} onChange={handleChange} className={`w-full p-2 border rounded-lg dark:bg-gray-700 dark:text-white ${errors.moldDeadline ? 'border-red-500' : 'border-blue-300'}`} />
                     {errors.moldDeadline && <p className="text-xs text-red-500 mt-1">{errors.moldDeadline}</p>}
                </div>

                {/* 4. Satır: DOSYA YÜKLEME ALANI (GÜNCELLENDİ) */}
                <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-4 bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 transition relative">
                    <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 flex items-center">
                        <UploadCloud className="w-5 h-5 mr-2 text-blue-500" /> Ürün Görseli Yükle
                    </label>
                    
                    <div className="flex items-center gap-3">
                        <input 
                            type="file" 
                            accept="image/*" 
                            onChange={handleFileUpload}
                            disabled={isUploading}
                            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 dark:file:bg-blue-900 dark:file:text-blue-200"
                        />
                        
                        {/* Durum İkonları */}
                        {isUploading && <Loader className="w-6 h-6 text-blue-500 animate-spin" />}
                        {uploadSuccess && <CheckCircle className="w-6 h-6 text-green-500" />}
                    </div>

                    {formData.productImageUrl && (
                        <div className="mt-2 text-xs text-green-600 font-medium truncate">
                            Yüklendi: {formData.productImageUrl}
                        </div>
                    )}
                </div>

                {/* 5. Satır: Rapor Linki (Link olarak kaldı) */}
                <div>
                    <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1 flex items-center"><FileText className="w-4 h-4 mr-2" /> Rapor Linki (Drive/Docs)</label>
                    <div className="relative">
                        <Link className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                        <input type="text" name="trialReportUrl" value={formData.trialReportUrl} onChange={handleChange} placeholder="https://..." className="w-full pl-9 p-2 border border-gray-300 rounded-lg dark:bg-gray-700 dark:text-white" />
                    </div>
                </div>

                {/* 6. Satır: Sorumlular */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t pt-4 dark:border-gray-700">
                    <div>
                        <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1 flex items-center"><User className="w-4 h-4 mr-2" /> Proje Sorumlusu</label>
                        <select name="projectManager" value={formData.projectManager} onChange={handleChange} className="w-full p-2 border border-gray-300 rounded-lg dark:bg-gray-700 dark:text-white">
                            <option value="">Seçiniz...</option>
                            {projectManagers.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1 flex items-center"><User className="w-4 h-4 mr-2" /> Kalıp Tasarımcısı</label>
                        <select name="moldDesigner" value={formData.moldDesigner} onChange={handleChange} className="w-full p-2 border border-gray-300 rounded-lg dark:bg-gray-700 dark:text-white">
                            <option value="">Seçiniz...</option>
                            {designers.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                        </select>
                    </div>
                </div>

                <div className="flex justify-end gap-3 mt-4 pt-4 border-t dark:border-gray-700">
                    <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition">İptal</button>
                    <button onClick={handleSubmit} disabled={isUploading} className="flex items-center px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-bold shadow-md transition transform hover:scale-105 disabled:opacity-50">
                        <Save className="w-5 h-5 mr-2" />
                        {isUploading ? 'Yükleniyor...' : 'Projeyi Başlat'}
                    </button>
                </div>
            </div>
        </Modal>
    );
};

export default DetailedProjectModal;