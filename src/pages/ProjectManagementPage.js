// src/pages/ProjectManagementPage.js

import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    Plus, Calendar, Image as ImageIcon, ArrowRight, AlertTriangle, 
    Clock, Save, X, Eye, List as ListIcon, BarChart, ZoomIn, Briefcase, User, PenTool
} from 'lucide-react';

// Gantt Kütüphanesi
import { Gantt, ViewMode } from 'gantt-task-react';
import "gantt-task-react/dist/index.css";

// Bileşenler
import DetailedProjectModal from '../components/Modals/DetailedProjectModal.js';
import ImagePreviewModal from '../components/Modals/ImagePreviewModal.js';

// Firebase (Sadece Fonksiyonlar - DÜZELTİLDİ)
import { db, collection, addDoc, updateDoc, doc } from '../config/firebase.js';

// Sabitler ve Adresler (Adresler Buradan Geliyor - DÜZELTİLDİ)
import { 
    MOLD_STATUS, PROJECT_TYPES, 
    PROJECT_COLLECTION 
} from '../config/constants.js';

// Yardımcılar
import { formatDate, getDaysDifference } from '../utils/dateUtils.js';

const ProjectManagementPage = ({ projects, personnel, loggedInUser }) => {
    const navigate = useNavigate();
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [previewImage, setPreviewImage] = useState(null);
    const [previewTitle, setPreviewTitle] = useState('');
    const [editingId, setEditingId] = useState(null);
    const [editForm, setEditForm] = useState({});

    // GÖRÜNÜM MODU
    const [viewType, setViewType] = useState('LIST');
    const [ganttViewMode, setGanttViewMode] = useState(ViewMode.Month);

    // --- ÖNİZLEME FONKSİYONU ---
    const openPreview = (url, title) => {
        setPreviewImage(url);
        setPreviewTitle(title);
    };

    // --- VERİ HAZIRLIĞI (MEVCUT LİSTELER) ---
    const preparationProjects = useMemo(() => {
        return projects.filter(p => {
            const hasOperations = p.tasks && p.tasks.length > 0;
            const isCompleted = p.status === MOLD_STATUS.COMPLETED;
            return (!hasOperations || p.status === MOLD_STATUS.WAITING) && !isCompleted;
        });
    }, [projects]);

    const upcomingDeadlineProjects = useMemo(() => {
        return projects
            .filter(p => p.status !== MOLD_STATUS.COMPLETED && p.moldDeadline)
            .sort((a, b) => new Date(a.moldDeadline) - new Date(b.moldDeadline));
    }, [projects]);

    // --- VERİ HAZIRLIĞI (GANTT İÇİN) ---
    const ganttTasks = useMemo(() => {
        if (!projects || projects.length === 0) return [];

        return projects
            .filter(p => p.moldDeadline)
            .map(project => {
                let start = project.createdAt ? new Date(project.createdAt) : new Date();
                let end = new Date(project.moldDeadline);
                
                if (end <= start) {
                    end = new Date(start.getTime() + (24 * 60 * 60 * 1000)); 
                }

                let progress = 0;
                if (project.tasks && project.tasks.length > 0) {
                    const allOps = project.tasks.flatMap(t => t.operations || []);
                    if (allOps.length > 0) {
                        const totalProgress = allOps.reduce((acc, op) => acc + (op.progressPercentage || 0), 0);
                        progress = Math.round(totalProgress / allOps.length);
                    }
                }
                if (project.status === MOLD_STATUS.COMPLETED) progress = 100;

                const daysLeft = getDaysDifference(project.moldDeadline);
                let barColor = '#3B82F6'; // Mavi
                
                if (progress === 100) {
                    barColor = '#10B981'; // Yeşil
                } else if (daysLeft <= 3) {
                    barColor = '#EF4444'; // Kırmızı
                }

                return {
                    start: start,
                    end: end,
                    name: project.moldName,
                    id: project.id,
                    type: 'project',
                    progress: progress,
                    isDisabled: false,
                    styles: { progressColor: barColor, progressSelectedColor: barColor },
                    productImageUrl: project.productImageUrl,
                    customer: project.customer,
                    onImageClick: () => project.productImageUrl ? openPreview(project.productImageUrl, project.moldName) : null
                };
            })
            .sort((a, b) => a.start - b.start);
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

            // --- OTOMATİK MAİL HAZIRLAMA ---
            let recipientEmail = "";
            if (formData.projectManager) {
                const manager = personnel.find(p => p.name === formData.projectManager);
                if (manager && manager.email) {
                    recipientEmail = manager.email;
                }
            }

            const subject = `YENİ PROJE AÇILDI: ${formData.moldName}`;
            
            const body = `Merhaba,
            
Aşağıdaki yeni kalıp projesi sisteme eklenmiştir ve onaylanmıştır.

--------------------------------------------------
PROJE DETAYLARI
--------------------------------------------------
🔹 Kalıp Adı: ${formData.moldName}
🔹 Müşteri: ${formData.customer}
🔹 Proje Tipi: ${formData.projectType}
🔹 Aciliyet: ${formData.priority || 'Normal'}

📅 Termin Tarihi: ${formatDate(formData.moldDeadline)}

👤 Proje Sorumlusu: ${formData.projectManager || 'Atanmadı'}
🎨 Kalıp Tasarımcısı: ${formData.moldDesigner || 'Atanmadı'}

🔗 Ürün Görseli: ${formData.productImageUrl || 'Yok'}
--------------------------------------------------

Sisteme giriş yaparak detayları inceleyebilirsiniz.
İyi çalışmalar.
            `;

            window.location.href = `mailto:${recipientEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
            alert("Proje oluşturuldu ve mail taslağı açıldı!");

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

    const handleTaskClick = (task) => {
        navigate(`/mold/${task.id}`);
    };

    // --- ÖZEL LİSTE GÖRÜNÜMÜ (SOL TARAF) ---
    const CustomTaskList = ({ rowHeight, tasks, fontFamily, fontSize }) => {
        return (
            <div className="bg-white dark:bg-gray-800 border-r-2 border-gray-300 dark:border-gray-600 flex flex-col w-full h-full">
                <div className="flex-1 overflow-hidden">
                    {tasks.map(t => (
                        <div 
                            key={t.id} 
                            className="flex items-center px-3 border-b border-gray-200 dark:border-gray-700 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition cursor-pointer group bg-white dark:bg-gray-800 box-border"
                            style={{ height: rowHeight, fontFamily, fontSize }}
                            onClick={() => handleTaskClick(t)}
                        >
                            <div 
                                className="w-[45px] h-[40px] mr-3 flex-shrink-0 bg-gray-100 dark:bg-gray-600 rounded-md border-2 border-gray-300 dark:border-gray-500 overflow-hidden relative shadow-sm hover:border-blue-500 transition-colors"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (t.productImageUrl) t.onImageClick();
                                }}
                                title="Resmi Büyüt"
                            >
                                {t.productImageUrl ? (
                                    <>
                                        <img src={t.productImageUrl} alt="Kalıp" className="w-full h-full object-cover" />
                                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                            <ZoomIn className="w-4 h-4 text-white" />
                                        </div>
                                    </>
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-gray-400 dark:text-gray-500">
                                        <ImageIcon className="w-5 h-5" />
                                    </div>
                                )}
                            </div>

                            <div className="flex-1 min-w-0 flex flex-col justify-center">
                                <div className="font-extrabold text-gray-900 dark:text-white truncate text-sm mb-0.5 leading-snug">
                                    {t.name}
                                </div>
                                <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 truncate flex items-center">
                                    <Briefcase className="w-3 h-3 mr-1 text-blue-500" />
                                    {t.customer || 'Müşteri Yok'}
                                </div>
                            </div>
                            
                            <div className="opacity-0 group-hover:opacity-100 transition-opacity text-blue-500">
                                <ArrowRight className="w-4 h-4" />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    // Tarih formatlama fonksiyonu (gün-ay-yıl)
    const formatDeadline = (dateString) => {
        if (!dateString) return '';
        const date = new Date(dateString);
        return date.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    };

    return (
        <div className="p-6 bg-gray-100 dark:bg-gray-900 min-h-screen font-sans">
            
            <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4 bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                <div>
                    <h1 className="text-2xl font-black text-gray-900 dark:text-white flex items-center gap-2">
                        <Briefcase className="w-6 h-6 text-blue-600" />
                        Proje Yönetim Merkezi
                    </h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Yeni işleri planlayın, terminleri takip edin.</p>
                </div>

                <div className="flex items-center gap-3">
                    <div className="flex bg-gray-100 dark:bg-gray-700 p-1 rounded-lg">
                        <button onClick={() => setViewType('LIST')} className={`flex items-center px-4 py-2 rounded-md text-sm font-bold transition ${viewType === 'LIST' ? 'bg-white dark:bg-gray-600 text-blue-700 dark:text-blue-300 shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'}`}>
                            <ListIcon className="w-4 h-4 mr-2" /> Liste
                        </button>
                        <button onClick={() => setViewType('GANTT')} className={`flex items-center px-4 py-2 rounded-md text-sm font-bold transition ${viewType === 'GANTT' ? 'bg-white dark:bg-gray-600 text-blue-700 dark:text-blue-300 shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'}`}>
                            <BarChart className="w-4 h-4 mr-2" /> Çizelge
                        </button>
                    </div>

                    <button onClick={() => setIsAddModalOpen(true)} className="flex items-center px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold shadow-md transition transform active:scale-95">
                        <Plus className="w-5 h-5 mr-2" /> Yeni Proje
                    </button>
                </div>
            </div>

            {viewType === 'LIST' ? (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                    
                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow border border-gray-200 dark:border-gray-700 h-full">
                        <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-orange-50 dark:bg-orange-900/10 flex justify-between items-center rounded-t-xl">
                            <h2 className="text-base font-bold text-orange-800 dark:text-orange-300 flex items-center"><Clock className="w-5 h-5 mr-2" /> Hazırlık Aşaması</h2>
                            <span className="bg-orange-200 text-orange-800 text-xs font-bold px-2 py-1 rounded-full">{preparationProjects.length}</span>
                        </div>
                        <div className="p-4 space-y-4 max-h-[600px] overflow-y-auto">
                            {preparationProjects.length === 0 ? <p className="text-gray-400 text-center py-8 text-sm">Bekleyen iş yok.</p> : preparationProjects.map(project => (
                                <div key={project.id} className="p-4 border-2 border-gray-100 dark:border-gray-700 rounded-xl hover:shadow-lg transition bg-white dark:bg-gray-800/50 group">
                                    <div className="flex justify-between items-start">
                                        <div className="flex items-start gap-4 w-full">
                                            <div 
                                                className="w-24 h-24 bg-gray-200 dark:bg-gray-700 rounded-lg overflow-hidden flex-shrink-0 border-2 border-gray-300 dark:border-gray-600 shadow-sm relative group-image"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (project.productImageUrl) openPreview(project.productImageUrl, project.moldName);
                                                }}
                                            >
                                                {project.productImageUrl ? (
                                                    <>
                                                        <img src={project.productImageUrl} alt="Kalıp" className="w-full h-full object-cover cursor-pointer hover:scale-110 transition duration-300" />
                                                        <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 hover:opacity-100 transition">
                                                            <ZoomIn className="w-6 h-6 text-white drop-shadow-md" />
                                                        </div>
                                                    </>
                                                ) : (
                                                    <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 gap-1">
                                                        <ImageIcon className="w-8 h-8" />
                                                        <span className="text-[10px]">Resim Yok</span>
                                                    </div>
                                                )}
                                            </div>
                                            
                                            <div className="flex-1">
                                                <h3 className="font-black text-gray-900 dark:text-white text-xl mb-1">{project.moldName}</h3>
                                                <p className="text-base font-bold text-gray-600 dark:text-gray-300 mb-2">{project.customer}</p>
                                                
                                                <div className="bg-gray-50 dark:bg-gray-700/50 p-2 rounded-lg border border-gray-100 dark:border-gray-600 text-xs text-gray-600 dark:text-gray-300 space-y-1 w-full max-w-[250px]">
                                                    <div className="flex items-center">
                                                        <User className="w-3 h-3 mr-2 text-blue-500" /> 
                                                        <span className="font-semibold mr-1">Proje Sor:</span> {project.projectManager || 'Atanmadı'}
                                                    </div>
                                                    <div className="flex items-center">
                                                        <PenTool className="w-3 h-3 mr-2 text-purple-500" /> 
                                                        <span className="font-semibold mr-1">Tasarımcı:</span> {project.moldDesigner || 'Atanmadı'}
                                                    </div>
                                                </div>

                                                <span className="text-[10px] bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 px-2 py-1 rounded mt-2 inline-block font-bold">{project.projectType || PROJECT_TYPES.NEW_MOLD}</span>
                                            </div>
                                        </div>
                                        <button onClick={() => navigate(`/mold/${project.id}`)} className="text-blue-600 dark:text-blue-400 hover:bg-blue-50 p-2 rounded-full transition shadow-sm border border-transparent hover:border-blue-100"><ArrowRight className="w-6 h-6" /></button>
                                    </div>
                                    {(!project.tasks || project.tasks.length === 0) && (
                                        <div className="mt-3 flex items-center text-xs font-bold text-red-600 bg-red-50 dark:bg-red-900/20 p-2 rounded border border-red-100 dark:border-red-900">
                                            <AlertTriangle className="w-4 h-4 mr-2" /> Henüz iş parçası (operasyon) eklenmemiş.
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow border border-gray-200 dark:border-gray-700 h-full">
                        <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-blue-50 dark:bg-blue-900/10 flex justify-between items-center rounded-t-xl">
                            <h2 className="text-base font-bold text-blue-800 dark:text-blue-300 flex items-center"><Calendar className="w-5 h-5 mr-2" /> Termini Yaklaşanlar</h2>
                            <span className="bg-blue-200 text-blue-800 text-xs font-bold px-2 py-1 rounded-full">{upcomingDeadlineProjects.length}</span>
                        </div>
                        <div className="p-4 space-y-4 max-h-[600px] overflow-y-auto">
                            {upcomingDeadlineProjects.map(project => {
                                const daysLeft = getDaysDifference(project.moldDeadline);
                                const isUrgent = daysLeft <= 3;
                                const isEditing = editingId === project.id;

                                // İlerleme Hesabı
                                let progressPercentage = 0;
                                if (project.tasks && project.tasks.length > 0) {
                                    const allOps = project.tasks.flatMap(t => t.operations || []);
                                    if (allOps.length > 0) {
                                        const total = allOps.reduce((acc, op) => acc + (op.progressPercentage || 0), 0);
                                        progressPercentage = Math.round(total / allOps.length);
                                    }
                                }
                                if (project.status === MOLD_STATUS.COMPLETED) progressPercentage = 100;

                                return (
                                    <div key={project.id} className={`p-4 border-2 rounded-xl transition ${isUrgent ? 'border-red-300 bg-red-50 dark:bg-red-900/10' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'}`}>
                                        <div className="flex justify-between items-start">
                                            <div className="flex items-start gap-4 w-full">
                                                 <div 
                                                    className="w-24 h-24 bg-gray-200 dark:bg-gray-700 rounded-lg overflow-hidden flex-shrink-0 border-2 border-gray-300 dark:border-gray-600 shadow-sm relative"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (project.productImageUrl) openPreview(project.productImageUrl, project.moldName);
                                                    }}
                                                >
                                                    {project.productImageUrl ? (
                                                        <>
                                                            <img src={project.productImageUrl} alt="Kalıp" className="w-full h-full object-cover cursor-pointer hover:scale-110 transition duration-300" />
                                                            <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 hover:opacity-100 transition">
                                                                <ZoomIn className="w-6 h-6 text-white" />
                                                            </div>
                                                        </>
                                                    ) : (
                                                        <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 gap-1">
                                                            <ImageIcon className="w-8 h-8" />
                                                            <span className="text-[10px]">Resim Yok</span>
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="flex-1">
                                                    <h3 className="font-black text-gray-900 dark:text-white text-xl mb-1">{project.moldName}</h3>
                                                    <p className="text-base font-bold text-gray-600 dark:text-gray-300 mb-2">{project.customer}</p>
                                                    
                                                    <div className="bg-gray-50 dark:bg-gray-700/50 p-2 rounded-lg border border-gray-100 dark:border-gray-600 text-xs text-gray-600 dark:text-gray-300 space-y-1 w-full max-w-[250px]">
                                                        <div className="flex items-center">
                                                            <User className="w-3 h-3 mr-2 text-blue-500" /> 
                                                            <span className="font-semibold mr-1">Proje Sor:</span> {project.projectManager || 'Atanmadı'}
                                                        </div>
                                                        <div className="flex items-center">
                                                            <PenTool className="w-3 h-3 mr-2 text-purple-500" /> 
                                                            <span className="font-semibold mr-1">Tasarımcı:</span> {project.moldDesigner || 'Atanmadı'}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            {!isEditing ? (
                                                <div className="text-right min-w-[100px]">
                                                    <p className={`text-xl font-black ${daysLeft < 0 ? 'text-red-600' : daysLeft <= 3 ? 'text-orange-600' : 'text-green-600'}`}>{formatDeadline(project.moldDeadline)}</p>
                                                    <p className="text-xs text-gray-500 font-bold uppercase tracking-wide mt-1">{daysLeft < 0 ? `${Math.abs(daysLeft)} GÜN GEÇTİ` : `${daysLeft} GÜN KALDI`}</p>
                                                    <div className="mt-2">
                                                        <div className="flex justify-end text-xs font-bold text-gray-600 dark:text-gray-400 mb-1">
                                                            %{progressPercentage}
                                                        </div>
                                                        <div className="w-full bg-gray-200 rounded-full h-1.5 dark:bg-gray-700">
                                                            <div className={`h-1.5 rounded-full ${progressPercentage === 100 ? 'bg-green-500' : 'bg-blue-500'}`} style={{ width: `${progressPercentage}%` }}></div>
                                                        </div>
                                                    </div>
                                                    <button onClick={() => startEditing(project)} className="text-xs text-blue-600 hover:underline mt-2 block w-full text-right font-semibold">Düzenle</button>
                                                </div>
                                            ) : (
                                                <div className="flex flex-col gap-2 min-w-[140px]">
                                                    <input type="date" value={editForm.moldDeadline} onChange={(e) => setEditForm({...editForm, moldDeadline: e.target.value})} className="text-xs p-1 border rounded dark:bg-gray-700 dark:text-white w-full"/>
                                                    <input type="text" value={editForm.productImageUrl} onChange={(e) => setEditForm({...editForm, productImageUrl: e.target.value})} className="text-xs p-1 border rounded dark:bg-gray-700 dark:text-white w-full" placeholder="Resim Linki"/>
                                                    <div className="flex justify-end gap-2 mt-1">
                                                        <button onClick={() => saveEditing(project.id)} className="p-1.5 bg-green-100 text-green-700 rounded hover:bg-green-200"><Save className="w-4 h-4"/></button>
                                                        <button onClick={() => setEditingId(null)} className="p-1.5 bg-red-100 text-red-700 rounded hover:bg-red-200"><X className="w-4 h-4"/></button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            ) : (
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-4">
                    {ganttTasks.length > 0 ? (
                        <div>
                            <div className="flex flex-wrap justify-between items-center mb-4 border-b border-gray-200 dark:border-gray-700 pb-4">
                                <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Zaman Planlaması</h3>
                                <div className="flex gap-2">
                                    <button onClick={() => setGanttViewMode(ViewMode.Day)} className={`px-3 py-1 text-xs font-semibold rounded border ${ganttViewMode === ViewMode.Day ? 'bg-blue-600 text-white border-blue-600' : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600'}`}>Günlük</button>
                                    <button onClick={() => setGanttViewMode(ViewMode.Week)} className={`px-3 py-1 text-xs font-semibold rounded border ${ganttViewMode === ViewMode.Week ? 'bg-blue-600 text-white border-blue-600' : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600'}`}>Haftalık</button>
                                    <button onClick={() => setGanttViewMode(ViewMode.Month)} className={`px-3 py-1 text-xs font-semibold rounded border ${ganttViewMode === ViewMode.Month ? 'bg-blue-600 text-white border-blue-600' : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600'}`}>Aylık</button>
                                </div>
                            </div>
                            
                            <div className="overflow-x-auto rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800">
                                <style>{`
                                    /* Tablo Başlık Alanı */
                                    ._3T42e { background-color: transparent !important; fill: transparent !important; stroke: transparent !important; }
                                    
                                    /* Izgara Arka Planı (Açık Tema) */
                                    ._15_1e { fill: #ffffff !important; } 
                                    
                                    /* Izgara Arka Planı (Koyu Tema) */
                                    .dark ._15_1e { fill: #1f2937 !important; } 
                                    
                                    /* Izgara Çizgileri */
                                    .dark ._2k9Ys { stroke: #374151 !important; } 
                                    
                                    /* Tarih Yazıları (Üst Header) */
                                    ._3T42e text { fill: #374151 !important; font-weight: 600 !important; }
                                    .dark ._3T42e text { fill: #e5e7eb !important; font-weight: 600 !important; }

                                    /* Takvimdeki Gün Arka Planları */
                                    ._34SS0 { fill: #f3f4f6 !important; }
                                    .dark ._34SS0 { fill: #374151 !important; }
                                `}</style>
                                
                                <Gantt
                                    tasks={ganttTasks}
                                    viewMode={ganttViewMode}
                                    locale="tr"
                                    onDateChange={() => {}}
                                    onTaskDelete={() => {}}
                                    onProgressChange={() => {}}
                                    onDoubleClick={handleTaskClick}
                                    onClick={handleTaskClick}
                                    listCellWidth="280px"
                                    columnWidth={ganttViewMode === ViewMode.Month ? 300 : 65}
                                    barBackgroundColor="#3B82F6"
                                    barProgressColor="#2563EB"
                                    barProgressSelectedColor="#1E40AF"
                                    rowHeight={55}
                                    fontSize={12}
                                    headerHeight={50}
                                    TaskListHeader={({ headerHeight }) => (
                                        <div 
                                            className="flex items-center px-3 border-b-2 border-gray-300 dark:border-gray-600 font-bold text-gray-800 dark:text-white bg-gray-100 dark:bg-gray-800 h-full text-xs uppercase tracking-wide box-border"
                                            style={{ height: headerHeight }}
                                        >
                                            <div className="w-[45px] mr-3 text-center">Görsel</div>
                                            <div className="flex-1">Proje Bilgisi</div>
                                        </div>
                                    )}
                                    TaskListTable={CustomTaskList} 
                                />
                            </div>
                            
                            <div className="mt-4 flex gap-6 text-xs font-semibold text-gray-600 dark:text-gray-400 justify-center bg-gray-50 dark:bg-gray-800/50 p-2 rounded-lg border border-gray-200 dark:border-gray-700">
                                <div className="flex items-center"><div className="w-3 h-3 bg-blue-500 rounded-sm mr-2"></div> Devam Ediyor</div>
                                <div className="flex items-center"><div className="w-3 h-3 bg-red-500 rounded-sm mr-2"></div> Kritik / Gecikmiş</div>
                                <div className="flex items-center"><div className="w-3 h-3 bg-green-500 rounded-sm mr-2"></div> Tamamlandı</div>
                            </div>
                        </div>
                    ) : (
                        <div className="text-center py-20 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
                            <BarChart className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                            <p className="text-gray-500 font-medium">Gantt şemasında gösterilecek termin tarihi girilmiş proje bulunamadı.</p>
                            <p className="text-gray-400 text-sm mt-1">Lütfen projelerinize termin tarihi ekleyin.</p>
                        </div>
                    )}
                </div>
            )}

            {/* MODALLAR */}
            <DetailedProjectModal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} onSave={handleSaveNewProject} personnel={personnel} />
            <ImagePreviewModal isOpen={!!previewImage} imageUrl={previewImage} title={previewTitle} onClose={() => setPreviewImage(null)} />

        </div>
    );
};

export default ProjectManagementPage;