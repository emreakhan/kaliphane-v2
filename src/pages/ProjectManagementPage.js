// src/pages/ProjectManagementPage.js

import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    Plus, Calendar, Image, ArrowRight, AlertTriangle, 
    Clock, Save, X, Eye 
} from 'lucide-react';

// Bileşenler
import DetailedProjectModal from '../components/Modals/DetailedProjectModal.js';
import ImagePreviewModal from '../components/Modals/ImagePreviewModal.js'; // <-- YENİ IMPORT

// Firebase ve Sabitler
import { db, PROJECT_COLLECTION, collection, addDoc, updateDoc, doc } from '../config/firebase.js';
import { MOLD_STATUS, PROJECT_TYPES } from '../config/constants.js';
import { formatDate, getDaysDifference } from '../utils/dateUtils.js';

const ProjectManagementPage = ({ projects, personnel, loggedInUser }) => {
    const navigate = useNavigate();
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    
    // Önizleme State'i
    const [previewImage, setPreviewImage] = useState(null); // URL veya null
    const [previewTitle, setPreviewTitle] = useState('');

    const [editingId, setEditingId] = useState(null);
    const [editForm, setEditForm] = useState({});

    // --- LİSTE 1: TASARIM & HAZIRLIK AŞAMASINDAKİLER ---
    const preparationProjects = useMemo(() => {
        return projects.filter(p => {
            const hasOperations = p.tasks && p.tasks.length > 0;
            const isCompleted = p.status === MOLD_STATUS.COMPLETED;
            return (!hasOperations || p.status === MOLD_STATUS.WAITING) && !isCompleted;
        });
    }, [projects]);

    // --- LİSTE 2: TERMİNİ YAKLAŞANLAR ---
    const upcomingDeadlineProjects = useMemo(() => {
        return projects
            .filter(p => p.status !== MOLD_STATUS.COMPLETED && p.moldDeadline)
            .sort((a, b) => new Date(a.moldDeadline) - new Date(b.moldDeadline));
    }, [projects]);

    // --- İŞLEMLER ---
    const handleSaveNewProject = async (formData) => {
        try {
            await addDoc(collection(db, PROJECT_COLLECTION), {
                ...formData,
                status: MOLD_STATUS.WAITING,
                tasks: [],
                createdAt: new Date().toISOString(),
                createdBy: loggedInUser.name
            });
            setIsAddModalOpen(false);
            alert("Proje başarıyla oluşturuldu!");
        } catch (error) {
            console.error("Proje ekleme hatası:", error);
            alert("Proje oluşturulurken bir hata oluştu.");
        }
    };

    const startEditing = (project) => {
        setEditingId(project.id);
        setEditForm({
            moldDeadline: project.moldDeadline || '',
            productImageUrl: project.productImageUrl || ''
        });
    };

    const saveEditing = async (projectId) => {
        try {
            const projectRef = doc(db, PROJECT_COLLECTION, projectId);
            await updateDoc(projectRef, {
                moldDeadline: editForm.moldDeadline,
                productImageUrl: editForm.productImageUrl
            });
            setEditingId(null);
        } catch (error) {
            console.error("Güncelleme hatası:", error);
            alert("Güncellenemedi.");
        }
    };

    // Önizlemeyi Aç
    const openPreview = (url, title) => {
        setPreviewImage(url);
        setPreviewTitle(title);
    };

    return (
        <div className="p-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
            
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-extrabold text-gray-900 dark:text-white">Proje Yönetim Merkezi</h1>
                    <p className="text-gray-500 dark:text-gray-400 mt-1">Yeni işleri planlayın, terminleri takip edin.</p>
                </div>
                <button 
                    onClick={() => setIsAddModalOpen(true)}
                    className="flex items-center px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-lg transition transform hover:scale-105"
                >
                    <Plus className="w-6 h-6 mr-2" />
                    Yeni Proje Başlat
                </button>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                
                {/* SOL KOLON */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl overflow-hidden border border-gray-100 dark:border-gray-700">
                    <div className="p-5 border-b dark:border-gray-700 bg-orange-50 dark:bg-orange-900/20 flex justify-between items-center">
                        <h2 className="text-lg font-bold text-orange-800 dark:text-orange-300 flex items-center"><Clock className="w-5 h-5 mr-2" /> Tasarım & Hazırlık Aşaması</h2>
                        <span className="bg-orange-200 text-orange-800 text-xs font-bold px-2 py-1 rounded-full">{preparationProjects.length} Proje</span>
                    </div>
                    <div className="p-4 space-y-3 max-h-[600px] overflow-y-auto">
                        {preparationProjects.length === 0 ? <p className="text-gray-400 text-center py-4 italic">Hazırlık aşamasında bekleyen iş yok.</p> : preparationProjects.map(project => (
                            <div key={project.id} className="p-4 border border-gray-200 dark:border-gray-700 rounded-xl hover:shadow-md transition bg-gray-50 dark:bg-gray-700/30 group">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <h3 className="font-bold text-gray-900 dark:text-white text-lg">{project.moldName}</h3>
                                        <p className="text-sm text-gray-600 dark:text-gray-400">{project.customer}</p>
                                        <span className="text-xs bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 px-2 py-0.5 rounded mt-2 inline-block">{project.projectType || PROJECT_TYPES.NEW_MOLD}</span>
                                    </div>
                                    <div className="flex flex-col gap-2 items-end">
                                        <button onClick={() => navigate(`/mold/${project.id}`)} className="text-blue-600 dark:text-blue-400 hover:underline text-sm font-semibold flex items-center">Detay <ArrowRight className="w-4 h-4 ml-1" /></button>
                                        
                                        {/* ÖNİZLEME BUTONU */}
                                        {project.productImageUrl && (
                                            <button 
                                                onClick={() => openPreview(project.productImageUrl, project.moldName)}
                                                className="text-purple-600 dark:text-purple-400 text-xs flex items-center hover:bg-purple-100 dark:hover:bg-purple-900/30 px-2 py-1 rounded"
                                            >
                                                <Eye className="w-3 h-3 mr-1" /> Görseli Aç
                                            </button>
                                        )}
                                    </div>
                                </div>
                                {(!project.tasks || project.tasks.length === 0) && (
                                    <div className="mt-3 flex items-center text-xs text-red-600 bg-red-50 dark:bg-red-900/20 p-2 rounded border border-red-100 dark:border-red-900">
                                        <AlertTriangle className="w-4 h-4 mr-2" /> Henüz iş parçası (operasyon) eklenmemiş.
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                {/* SAĞ KOLON */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl overflow-hidden border border-gray-100 dark:border-gray-700">
                    <div className="p-5 border-b dark:border-gray-700 bg-blue-50 dark:bg-blue-900/20 flex justify-between items-center">
                        <h2 className="text-lg font-bold text-blue-800 dark:text-blue-300 flex items-center"><Calendar className="w-5 h-5 mr-2" /> Termini Yaklaşanlar</h2>
                        <span className="bg-blue-200 text-blue-800 text-xs font-bold px-2 py-1 rounded-full">{upcomingDeadlineProjects.length} Proje</span>
                    </div>
                    <div className="p-4 space-y-3 max-h-[600px] overflow-y-auto">
                        {upcomingDeadlineProjects.map(project => {
                            const daysLeft = getDaysDifference(project.moldDeadline);
                            const isUrgent = daysLeft <= 3;
                            const isEditing = editingId === project.id;

                            return (
                                <div key={project.id} className={`p-4 border rounded-xl transition ${isUrgent ? 'border-red-300 bg-red-50 dark:bg-red-900/10' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'}`}>
                                    <div className="flex justify-between items-start mb-2">
                                        <div className="flex-1">
                                            <h3 className="font-bold text-gray-900 dark:text-white">{project.moldName}</h3>
                                            <p className="text-xs text-gray-500 dark:text-gray-400">{project.customer} | Sor: {project.projectManager || 'Atanmadı'}</p>
                                        </div>
                                        {!isEditing ? (
                                            <div className="text-right">
                                                <p className={`text-sm font-bold ${daysLeft < 0 ? 'text-red-600' : daysLeft <= 3 ? 'text-orange-600' : 'text-green-600'}`}>{formatDate(project.moldDeadline)}</p>
                                                <p className="text-xs text-gray-500">{daysLeft < 0 ? `${Math.abs(daysLeft)} gün geçti` : `${daysLeft} gün kaldı`}</p>
                                                <button onClick={() => startEditing(project)} className="text-xs text-blue-600 hover:underline mt-1">Hızlı Düzenle</button>
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-2">
                                                <button onClick={() => saveEditing(project.id)} className="p-1 bg-green-100 text-green-700 rounded hover:bg-green-200"><Save className="w-4 h-4"/></button>
                                                <button onClick={() => setEditingId(null)} className="p-1 bg-red-100 text-red-700 rounded hover:bg-red-200"><X className="w-4 h-4"/></button>
                                            </div>
                                        )}
                                    </div>

                                    {/* GÖRSEL ALANI (GÜNCELLENDİ) */}
                                    <div className="flex items-center justify-between mt-2">
                                        {!isEditing && project.productImageUrl && (
                                            <button 
                                                onClick={() => openPreview(project.productImageUrl, project.moldName)}
                                                className="flex items-center text-xs text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 px-2 py-1 rounded transition"
                                            >
                                                <Image className="w-3 h-3 mr-1" /> Görseli Önizle
                                            </button>
                                        )}
                                    </div>

                                    {isEditing && (
                                        <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-600 grid grid-cols-1 md:grid-cols-2 gap-3">
                                            <div><label className="text-xs font-bold text-gray-500 block mb-1">Yeni Termin</label><input type="date" value={editForm.moldDeadline} onChange={(e) => setEditForm({...editForm, moldDeadline: e.target.value})} className="w-full text-sm p-1 border rounded dark:bg-gray-700 dark:text-white"/></div>
                                            <div><label className="text-xs font-bold text-gray-500 block mb-1">Resim Linki</label><input type="text" value={editForm.productImageUrl} onChange={(e) => setEditForm({...editForm, productImageUrl: e.target.value})} className="w-full text-sm p-1 border rounded dark:bg-gray-700 dark:text-white" placeholder="https://..."/></div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* MODALLAR */}
            <DetailedProjectModal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} onSave={handleSaveNewProject} personnel={personnel} />
            
            {/* ÖNİZLEME MODALI */}
            <ImagePreviewModal isOpen={!!previewImage} imageUrl={previewImage} title={previewTitle} onClose={() => setPreviewImage(null)} />

        </div>
    );
};

export default ProjectManagementPage;