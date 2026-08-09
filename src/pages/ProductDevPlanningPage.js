// src/pages/ProductDevPlanningPage.js

import React, { useState, useMemo } from 'react';
import { Plus, Trash2, Edit2, Clock, Sliders, UserCheck } from 'lucide-react';
import { doc, addDoc, updateDoc, deleteDoc, collection } from '../config/firebase.js';
import { PRODUCT_DEV_JOBS_COLLECTION, DESIGN_JOB_STATUS, ROLES, PROJECT_COLLECTION } from '../config/constants.js';
import { getCurrentDateTimeString } from '../utils/dateUtils.js';
import Modal from '../components/Modals/Modal.js';

const ProductDevPlanningPage = ({ db, designJobs = [], projects = [], personnel = [], taskTypes = [], loggedInUser, onOpenTypeManager }) => {
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [editingJob, setEditingJob] = useState(null);

    const [projectId, setProjectId] = useState('');
    const [projectName, setProjectName] = useState('');
    const [customer, setCustomer] = useState('');
    const [taskType, setTaskType] = useState(() => {
        if (taskTypes.length > 0) return typeof taskTypes[0] === 'string' ? taskTypes[0] : taskTypes[0].name;
        return 'KONSEPT TASARIM';
    });
    const [estimatedHours, setEstimatedHours] = useState('');
    const [assignedDesigner, setAssignedDesigner] = useState('');
    const [managerNote, setManagerNote] = useState('');
    const [deadlineDate, setDeadlineDate] = useState('');

    const [isSaving, setIsSaving] = useState(false);

    // Product dev personnel filter: include personnel with role 'Ürün Geliştirme Sorumlusu' or 'Ürün Geliştirme Yöneticisi'
    const productDevDesigners = useMemo(() => {
        return personnel.filter(p => {
            const role = p.role || p.roleName || '';
            return role === ROLES.URUN_GELISTIRME_SORUMLUSU ||
                   role === ROLES.URUN_GELISTIRME_YONETICISI ||
                   role === 'Ürün Geliştirme Sorumlusu' ||
                   role === 'Ürün Geliştirme Yöneticisi';
        });
    }, [personnel]);

    // 1. ATANMAMIŞ / BEKLEYEN İŞLER & PROJE HAVUZU
    const pendingPoolJobs = useMemo(() => {
        // a) designJobs tablosunda personeli atanmamış olanlar (sadece aktif olanlar)
        const unassignedJobs = designJobs.filter(j => 
            j.status !== DESIGN_JOB_STATUS.COMPLETED && 
            (!j.assignedDesigner || j.assignedDesigner.trim() === '' || j.assignedDesigner === 'ATANMAMIŞ')
        );

        // designJobs tablosunda kaydı bulunan proje ID'leri (çift listelemeyi engeller)
        const handledProjectIds = new Set(
            designJobs.map(j => j.projectId).filter(Boolean)
        );

        // b) YALNIZCA proje açılışında başlangıç aşaması açıkça 'URUN_GELISTIRME' seçilmiş YENİ projeler (Eski 293 kalıp kaydı elenir)
        const pendingProjects = projects.filter(p => {
            // Geçmiş kalıp kayıtlarında initialStage alanı yoktur/tanımsızdır, kesinlikle p.initialStage === 'URUN_GELISTIRME' kontrol edilir
            if (!p.initialStage || p.initialStage !== 'URUN_GELISTIRME') return false;
            
            const stepStatus = p.workflowSteps?.productDesign?.status;
            const isProductDesignActive = stepStatus !== 'COMPLETED' && stepStatus !== 'SKIPPED';
            
            return isProductDesignActive && !handledProjectIds.has(p.id);
        });

        return { 
            unassignedJobs, 
            pendingProjects, 
            totalCount: unassignedJobs.length + pendingProjects.length 
        };
    }, [designJobs, projects]);

    const activeJobs = useMemo(() => {
        return designJobs.filter(j => j.status !== DESIGN_JOB_STATUS.COMPLETED && j.assignedDesigner && j.assignedDesigner.trim() !== '' && j.assignedDesigner !== 'ATANMAMIŞ');
    }, [designJobs]);

    const designerJobsMap = useMemo(() => {
        const map = {};
        activeJobs.forEach(job => {
            const dName = job.assignedDesigner;
            if (!map[dName]) map[dName] = [];
            map[dName].push(job);
        });
        Object.keys(map).forEach(d => {
            map[d].sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
        });
        return map;
    }, [activeJobs]);

    const handleOpenAddModal = (designerName = '', prefillProject = null) => {
        setEditingJob(null);
        if (prefillProject) {
            setProjectId(prefillProject.id || '');
            setProjectName(prefillProject.moldName || prefillProject.projectName || '');
            setCustomer(prefillProject.customer || '');
        } else {
            setProjectId('');
            setProjectName('');
            setCustomer('');
        }
        setTaskType(taskTypes.length > 0 ? (typeof taskTypes[0] === 'string' ? taskTypes[0] : taskTypes[0].name) : 'KONSEPT TASARIM');
        setEstimatedHours('');
        setAssignedDesigner(designerName || (productDevDesigners.length > 0 ? productDevDesigners[0].name : ''));
        setManagerNote('');
        setDeadlineDate('');
        setIsAddModalOpen(true);
    };

    const handleOpenEditModal = (job) => {
        setEditingJob(job);
        setProjectId(job.projectId || '');
        setProjectName(job.projectName || '');
        setCustomer(job.customer || '');
        setTaskType(job.taskType || 'KONSEPT TASARIM');
        setEstimatedHours(job.estimatedHours ? String(job.estimatedHours) : '');
        setAssignedDesigner(job.assignedDesigner || (productDevDesigners.length > 0 ? productDevDesigners[0].name : ''));
        setManagerNote(job.managerNote || '');
        setDeadlineDate(job.deadlineDate || '');
        setIsAddModalOpen(true);
    };

    const handleSaveJob = async () => {
        if (!assignedDesigner) return alert("Lütfen görevin atanacağı bir personel seçin!");
        if (!projectName && !projectId) return alert("Lütfen bir proje seçin veya manuel ad girin!");

        setIsSaving(true);
        try {
            const finalProjectName = projectId ? projects.find(p => p.id === projectId)?.moldName || projectName : projectName;
            const finalCustomer = projectId ? projects.find(p => p.id === projectId)?.customer || customer : customer;
            const pVal = editingJob ? (editingJob.progressPercent || 0) : 0;

            if (editingJob) {
                const jobRef = doc(db, PRODUCT_DEV_JOBS_COLLECTION, editingJob.id);
                await updateDoc(jobRef, {
                    projectId: projectId || '',
                    projectName: finalProjectName,
                    customer: finalCustomer || '',
                    taskType,
                    estimatedHours: parseFloat(estimatedHours) || 0,
                    assignedDesigner,
                    managerNote: managerNote.trim() || '',
                    deadlineDate: deadlineDate || null,
                    progressPercent: pVal,
                    status: pVal >= 100 ? DESIGN_JOB_STATUS.COMPLETED : (editingJob.status === DESIGN_JOB_STATUS.UNASSIGNED ? DESIGN_JOB_STATUS.ASSIGNED : editingJob.status),
                    updatedAt: getCurrentDateTimeString()
                });
            } else {
                const designerCurrentJobs = designerJobsMap[assignedDesigner] || [];
                const maxOrderIndex = designerCurrentJobs.length > 0 
                    ? Math.max(...designerCurrentJobs.map(j => j.orderIndex || 0)) 
                    : 0;

                await addDoc(collection(db, PRODUCT_DEV_JOBS_COLLECTION), {
                    projectId: projectId || '',
                    projectName: finalProjectName,
                    customer: finalCustomer || '',
                    taskType,
                    estimatedHours: parseFloat(estimatedHours) || 0,
                    assignedDesigner,
                    managerNote: managerNote.trim() || '',
                    deadlineDate: deadlineDate || null,
                    progressPercent: pVal,
                    status: pVal >= 100 ? DESIGN_JOB_STATUS.COMPLETED : DESIGN_JOB_STATUS.ASSIGNED,
                    createdBy: loggedInUser.name,
                    createdAt: getCurrentDateTimeString(),
                    autoPause: true,
                    orderIndex: maxOrderIndex + 1
                });
            }

            // PROJE İŞ AKIŞ HARİTASI İLE SENKRONİZASYON: workflowSteps.productDesign güncelle
            const targetProjectId = projectId || editingJob?.projectId;
            if (targetProjectId) {
                try {
                    const projRef = doc(db, PROJECT_COLLECTION, targetProjectId);
                    await updateDoc(projRef, {
                        [`workflowSteps.productDesign.progressPercent`]: pVal,
                        [`workflowSteps.productDesign.status`]: pVal >= 100 ? 'COMPLETED' : (pVal > 0 ? 'IN_PROGRESS' : 'PENDING'),
                        [`workflowSteps.productDesign.approvedBy`]: assignedDesigner || loggedInUser.name
                    });
                } catch (projErr) {
                    console.error("Proje iş akış haritası güncellenemedi:", projErr);
                }
            }

            setIsAddModalOpen(false);
        } catch (error) {
            console.error("Görev kaydetme hatası:", error);
            alert("Görev kaydedilemedi.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteJob = async (jobId) => {
        if (!window.confirm("Bu görevi silmek istediğinize emin misiniz?")) return;
        try {
            await deleteDoc(doc(db, PRODUCT_DEV_JOBS_COLLECTION, jobId));
        } catch (error) {
            console.error("Silme hatası:", error);
            alert("Görev silinemedi.");
        }
    };

    const handleMoveJob = async (designerName, index, direction) => {
        const jobsList = designerJobsMap[designerName] || [];
        const targetIndex = index + direction;
        if (targetIndex < 0 || targetIndex >= jobsList.length) return;

        const currentJob = jobsList[index];
        const targetJob = jobsList[targetIndex];

        try {
            const currentRef = doc(db, PRODUCT_DEV_JOBS_COLLECTION, currentJob.id);
            const targetRef = doc(db, PRODUCT_DEV_JOBS_COLLECTION, targetJob.id);

            const tempOrder = currentJob.orderIndex || 0;
            const newTargetOrder = targetJob.orderIndex || 0;

            await updateDoc(currentRef, { orderIndex: newTargetOrder });
            await updateDoc(targetRef, { orderIndex: tempOrder });
        } catch (error) {
            console.error("Sıralama hatası:", error);
        }
    };

    return (
        <div className="p-4 max-w-7xl mx-auto space-y-6">
            
            {/* 1. ÜST HEADER PANELİ */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                <div>
                    <h2 className="text-lg font-bold text-gray-800 dark:text-white flex items-center">
                        <Sliders className="w-5 h-5 mr-2 text-amber-500" /> Ürün Geliştirme İş Planlama & Görev Atama
                    </h2>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Personellerin iş kuyruklarını düzenleyebilir, iş havuzundaki projeleri ilgili sorumlulara atayabilirsiniz.</p>
                </div>
                <div className="flex items-center gap-2">
                    <button 
                        onClick={onOpenTypeManager} 
                        className="px-3 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 text-gray-700 dark:text-gray-200 rounded-lg text-xs font-bold transition flex items-center gap-1.5"
                    >
                        ⚙️ İş Türlerini Yönet
                    </button>
                    <button 
                        onClick={() => handleOpenAddModal()} 
                        className="px-3.5 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-bold transition shadow-sm flex items-center gap-1.5"
                    >
                        <Plus className="w-4 h-4" /> Yeni Görev Ata
                    </button>
                </div>
            </div>

            {/* 2. KANBAN PLANLAMA PANOSU: İŞ HAVUZU KOLONU + PERSONEL KOLONLARI */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                
                {/* KOLON 1: ATAMA BEKLEYEN İŞ PLANLAMA HAVUZU */}
                <div className="bg-amber-50/70 dark:bg-amber-950/20 rounded-xl shadow-sm border-2 border-dashed border-amber-400 dark:border-amber-700/60 overflow-hidden flex flex-col min-h-[500px]">
                    <div className="p-4 bg-amber-100 dark:bg-amber-900/60 border-b border-amber-200 dark:border-amber-800 flex justify-between items-center">
                        <div>
                            <h3 className="font-extrabold text-amber-900 dark:text-amber-100 flex items-center text-sm gap-2">
                                <span className="flex h-2.5 w-2.5 relative">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
                                </span>
                                📌 İŞ HAVUZU
                            </h3>
                            <span className="text-[11px] text-amber-800 dark:text-amber-300 font-bold">
                                {pendingPoolJobs.totalCount} Atama Bekleyen Proje/İş
                            </span>
                        </div>
                        <button 
                            onClick={() => handleOpenAddModal()} 
                            className="p-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition"
                            title="Yeni Görev Ekle & Ata"
                        >
                            <Plus className="w-4 h-4" />
                        </button>
                    </div>

                    <div className="p-3 flex-1 space-y-3 overflow-y-auto max-h-[600px]">
                        {pendingPoolJobs.totalCount === 0 ? (
                            <div className="py-12 text-center text-amber-800/60 dark:text-amber-300/60 text-xs italic">
                                ✅ Havuzda atama bekleyen iş bulunmuyor.
                            </div>
                        ) : (
                            <>
                                {/* Atanmamış İşler (designJobs) */}
                                {pendingPoolJobs.unassignedJobs.map(job => (
                                    <div key={job.id} className="p-3.5 bg-white dark:bg-gray-800 rounded-xl border border-amber-300 dark:border-amber-700/80 shadow-sm space-y-2.5 hover:border-amber-500 transition">
                                        <div className="flex justify-between items-start">
                                            <div className="flex-1 pr-1">
                                                <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-700">
                                                    {job.taskType || 'ÜRÜN TASARIMI'}
                                                </span>
                                                <h4 className="font-extrabold text-gray-900 dark:text-white text-xs mt-1.5 leading-snug">{job.projectName}</h4>
                                                {job.customer && <p className="text-[10px] text-gray-500">{job.customer}</p>}
                                            </div>
                                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300 shrink-0">
                                                Havuzda
                                            </span>
                                        </div>

                                        <div className="pt-2 border-t border-gray-100 dark:border-gray-700 flex justify-between items-center">
                                            <span className="text-[11px] font-bold text-blue-600 dark:text-blue-400">%{job.progressPercent || 0} Tamamlandı</span>
                                            <button 
                                                onClick={() => handleOpenEditModal(job)}
                                                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg transition shadow-sm flex items-center gap-1.5"
                                            >
                                                <UserCheck className="w-3.5 h-3.5" /> Personele Ata
                                            </button>
                                        </div>
                                    </div>
                                ))}

                                {/* Proje Sayfasından Açılan Bekleyen Projeler */}
                                {pendingPoolJobs.pendingProjects.map(project => (
                                    <div key={project.id} className="p-3.5 bg-white dark:bg-gray-800 rounded-xl border border-amber-300 dark:border-amber-700/80 shadow-sm space-y-2.5 hover:border-amber-500 transition">
                                        <div className="flex justify-between items-start">
                                            <div className="flex-1 pr-1">
                                                <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900/60 text-blue-800 dark:text-blue-200 border border-blue-200 dark:border-blue-700">
                                                    YENİ PROJE
                                                </span>
                                                <h4 className="font-extrabold text-gray-900 dark:text-white text-xs mt-1.5 leading-snug">{project.moldName}</h4>
                                                {project.customer && <p className="text-[10px] text-gray-500">{project.customer}</p>}
                                            </div>
                                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 shrink-0">
                                                Başlangıç
                                            </span>
                                        </div>

                                        <div className="pt-2 border-t border-gray-100 dark:border-gray-700 flex justify-between items-center">
                                            <span className="text-[10px] font-bold text-gray-400">Atama Bekliyor</span>
                                            <button 
                                                onClick={() => handleOpenAddModal('', project)}
                                                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg transition shadow-sm flex items-center gap-1.5"
                                            >
                                                <UserCheck className="w-3.5 h-3.5" /> Personele Ata
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </>
                        )}
                    </div>
                </div>

                {/* KOLON 2..N: PERSONEL İŞ KUYRUKLARI */}
                {productDevDesigners.length === 0 ? (
                    <div className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 text-center space-y-3 col-span-2">
                        <div className="w-12 h-12 bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 rounded-full flex items-center justify-center mx-auto text-xl">
                            👤
                        </div>
                        <h3 className="font-bold text-gray-800 dark:text-white text-sm">Ürün Geliştirme Personeli Bulunamadı</h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400 max-w-md mx-auto">
                            Sistemde 'Ürün Geliştirme Sorumlusu' veya 'Ürün Geliştirme Yöneticisi' rolüne sahip personel bulunmamaktadır.
                        </p>
                    </div>
                ) : (
                    productDevDesigners.map((designer) => {
                        const dJobs = designerJobsMap[designer.name] || [];
                        const totalEst = dJobs.reduce((sum, j) => sum + (parseFloat(j.estimatedHours) || 0), 0);

                        return (
                            <div key={designer.id || designer.name} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col min-h-[500px]">
                                <div className="p-4 bg-gray-50 dark:bg-gray-900/60 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
                                    <div>
                                        <h3 className="font-bold text-gray-800 dark:text-white flex items-center text-sm">
                                            <UserCheck className="w-4 h-4 mr-2 text-amber-500" /> {designer.name}
                                        </h3>
                                        <span className="text-[11px] text-gray-500">{dJobs.length} Aktif Görev • Toplam {totalEst.toFixed(1)} Saat</span>
                                    </div>
                                    <button onClick={() => handleOpenAddModal(designer.name)} className="p-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 rounded-lg transition" title="Bu Personele Görev Ata">
                                        <Plus className="w-4 h-4" />
                                    </button>
                                </div>

                                <div className="p-3 flex-1 space-y-3 overflow-y-auto max-h-[600px]">
                                    {dJobs.map((job, idx) => {
                                        const isRunning = job.status === DESIGN_JOB_STATUS.IN_PROGRESS;
                                        const pVal = job.progressPercent || 0;

                                        return (
                                            <div key={job.id} className={`p-3 rounded-xl border transition-all space-y-2.5 bg-gray-50 dark:bg-gray-900/40 ${isRunning ? 'border-amber-500 ring-1 ring-amber-500 bg-amber-50/20' : 'border-gray-200 dark:border-gray-700'}`}>
                                                <div className="flex justify-between items-start gap-2">
                                                    <div className="flex-1">
                                                        <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                                                            {job.taskType || 'KONSEPT TASARIM'}
                                                        </span>
                                                        <h4 className="font-bold text-gray-800 dark:text-white text-xs mt-1 leading-snug">{job.projectName}</h4>
                                                        {job.customer && <p className="text-[10px] text-gray-500">{job.customer}</p>}
                                                    </div>
                                                    <div className="flex items-center gap-1">
                                                        <button onClick={() => handleMoveJob(designer.name, idx, -1)} disabled={idx === 0} className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30" title="Yukarı Taşı">▲</button>
                                                        <button onClick={() => handleMoveJob(designer.name, idx, 1)} disabled={idx === dJobs.length - 1} className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30" title="Aşağı Taşı">▼</button>
                                                        <button onClick={() => handleOpenEditModal(job)} className="p-1 text-blue-500 hover:text-blue-700" title="Düzenle"><Edit2 className="w-3.5 h-3.5" /></button>
                                                        <button onClick={() => handleDeleteJob(job.id)} className="p-1 text-red-500 hover:text-red-700" title="Sil"><Trash2 className="w-3.5 h-3.5" /></button>
                                                    </div>
                                                </div>

                                                {/* İLERLEME ÇUBUĞU VE YÜZDE BİLGİSİ (Sadece Durum Göstergesi) */}
                                                <div className="space-y-1 bg-white dark:bg-gray-800 p-2 rounded-lg border border-gray-100 dark:border-gray-700">
                                                    <div className="flex justify-between items-center text-[10px] font-bold">
                                                        <span className="text-gray-500 dark:text-gray-400">Tamamlanma Oranı:</span>
                                                        <span className="text-blue-600 dark:text-blue-400 font-extrabold">%{pVal}</span>
                                                    </div>
                                                    <div className="w-full bg-gray-200 dark:bg-gray-700 h-2 rounded-full overflow-hidden">
                                                        <div 
                                                            className={`h-full transition-all duration-300 ${pVal >= 100 ? 'bg-emerald-500' : pVal > 0 ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'}`} 
                                                            style={{ width: `${pVal}%` }}
                                                        />
                                                    </div>
                                                </div>

                                                <div className="flex justify-between items-center text-[11px] text-gray-600 dark:text-gray-300 border-t border-gray-100 dark:border-gray-800 pt-2">
                                                    <span className="flex items-center font-bold text-amber-600 dark:text-amber-400">
                                                        <Clock className="w-3 h-3 mr-1" /> {job.estimatedHours} Saat
                                                    </span>
                                                    {job.deadlineDate && (
                                                        <span className="text-[10px] text-gray-400 font-mono">Termin: {job.deadlineDate}</span>
                                                    )}
                                                </div>

                                                {job.managerNote && (
                                                    <p className="text-[10px] text-gray-500 dark:text-gray-400 italic bg-white dark:bg-gray-800 p-1.5 rounded border border-gray-100 dark:border-gray-700">
                                                        "{job.managerNote}"
                                                    </p>
                                                )}
                                            </div>
                                        );
                                    })}

                                    {dJobs.length === 0 && (
                                        <div className="py-8 text-center text-gray-400 text-xs italic">
                                            Atanmış görev yok.
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {/* GÖREV EKLE / DÜZENLE MODALI */}
            {isAddModalOpen && (
                <Modal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} title={editingJob ? "✏️ Görevi Düzenle" : "➕ Yeni Ürün Geliştirme Görevi Atama"}>
                    <div className="space-y-4 text-xs text-gray-800 dark:text-gray-200">
                        <div>
                            <label className="block font-bold mb-1">İlişkili Proje / Ürün Seçin Veya Manuel Girin</label>
                            <select 
                                value={projectId}
                                onChange={(e) => {
                                    setProjectId(e.target.value);
                                    const selected = projects.find(p => p.id === e.target.value);
                                    if (selected) {
                                        setProjectName(selected.moldName);
                                        setCustomer(selected.customer || '');
                                    }
                                }}
                                className="w-full p-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg font-bold"
                            >
                                <option value="">-- Manuel Ürün/Proje Adı Gir --</option>
                                {projects.map(p => (
                                    <option key={p.id} value={p.id}>{p.moldName} ({p.customer || 'Müşteri Belirtilmemiş'})</option>
                                ))}
                            </select>
                        </div>

                        {!projectId && (
                            <div>
                                <label className="block font-bold mb-1">Manuel Ürün / Proje Adı</label>
                                <input 
                                    type="text" 
                                    placeholder="Örn: Yeni Tip Ambalaj Kapak Prototipi" 
                                    value={projectName} 
                                    onChange={(e) => setProjectName(e.target.value)}
                                    className="w-full p-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg"
                                />
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block font-bold mb-1">İş Türü</label>
                                <select 
                                    value={taskType}
                                    onChange={(e) => setTaskType(e.target.value)}
                                    className="w-full p-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg font-bold"
                                >
                                    {taskTypes.map(t => {
                                        const name = typeof t === 'string' ? t : t.name;
                                        return <option key={name} value={name}>{name}</option>;
                                    })}
                                </select>
                            </div>

                            <div>
                                <label className="block font-bold mb-1">Tahmini Süre (Saat)</label>
                                <input 
                                    type="number"
                                    step="0.5"
                                    placeholder="Örn: 8"
                                    value={estimatedHours}
                                    onChange={(e) => setEstimatedHours(e.target.value)}
                                    className="w-full p-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg font-bold"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block font-bold mb-1">Atanacak Personel (Ürün Geliştirme Sorumlusu)</label>
                                <select 
                                    value={assignedDesigner}
                                    onChange={(e) => setAssignedDesigner(e.target.value)}
                                    className="w-full p-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg font-bold"
                                >
                                    <option value="">-- Personel Seçin --</option>
                                    {productDevDesigners.map(d => (
                                        <option key={d.id || d.name} value={d.name}>{d.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block font-bold mb-1">Termin Tarihi (Opsiyonel)</label>
                                <input 
                                    type="date"
                                    value={deadlineDate}
                                    onChange={(e) => setDeadlineDate(e.target.value)}
                                    className="w-full p-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block font-bold mb-1">Yönetici Notu / Talimatlar</label>
                            <textarea 
                                rows="2"
                                placeholder="Örn: Mukavemet analizi tamamlandıktan sonra test aşamasına geçilecek..."
                                value={managerNote}
                                onChange={(e) => setManagerNote(e.target.value)}
                                className="w-full p-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg"
                            />
                        </div>

                        <div className="flex justify-end gap-2 pt-3 border-t border-gray-200 dark:border-gray-700">
                            <button onClick={() => setIsAddModalOpen(false)} className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg font-bold">İptal</button>
                            <button onClick={handleSaveJob} disabled={isSaving} className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-bold transition">
                                {isSaving ? 'Kaydediliyor...' : editingJob ? 'Güncelle' : 'Görevi Ata'}
                            </button>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
};

export default ProductDevPlanningPage;
