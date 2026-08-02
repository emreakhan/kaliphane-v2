// src/pages/ProductDevPlanningPage.js

import React, { useState, useMemo } from 'react';
import { Plus, Trash2, Edit2, AlertTriangle, Search, ChevronDown, CheckCircle, Clock, Sliders, ArrowUpDown, UserCheck } from 'lucide-react';
import { doc, addDoc, updateDoc, deleteDoc, collection } from '../config/firebase.js';
import { PRODUCT_DEV_JOBS_COLLECTION, PRODUCT_DEV_TASK_TYPES_COLLECTION, DESIGN_JOB_STATUS, ROLES } from '../config/constants.js';
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

    const activeJobs = useMemo(() => {
        return designJobs.filter(j => j.status !== DESIGN_JOB_STATUS.COMPLETED);
    }, [designJobs]);

    const designerJobsMap = useMemo(() => {
        const map = {};
        activeJobs.forEach(job => {
            const dName = job.assignedDesigner || 'ATANMAMIŞ';
            if (!map[dName]) map[dName] = [];
            map[dName].push(job);
        });
        Object.keys(map).forEach(d => {
            map[d].sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
        });
        return map;
    }, [activeJobs]);

    const handleOpenAddModal = (designerName = '') => {
        setEditingJob(null);
        setProjectId('');
        setProjectName('');
        setCustomer('');
        setTaskType(taskTypes.length > 0 ? (typeof taskTypes[0] === 'string' ? taskTypes[0] : taskTypes[0].name) : 'KONSEPT TASARIM');
        setEstimatedHours('');
        setAssignedDesigner(designerName);
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
        setAssignedDesigner(job.assignedDesigner || '');
        setManagerNote(job.managerNote || '');
        setDeadlineDate(job.deadlineDate || '');
        setIsAddModalOpen(true);
    };

    const handleSaveJob = async () => {
        if (!assignedDesigner) return alert("Lütfen bir personel seçin!");
        if (!estimatedHours || parseFloat(estimatedHours) <= 0) return alert("Lütfen geçerli bir tahmini süre girin!");
        if (!projectName && !projectId) return alert("Lütfen bir proje seçin veya manuel ad girin!");

        setIsSaving(true);
        try {
            const finalProjectName = projectId ? projects.find(p => p.id === projectId)?.moldName || projectName : projectName;
            const finalCustomer = projectId ? projects.find(p => p.id === projectId)?.customer || customer : customer;

            if (editingJob) {
                const jobRef = doc(db, PRODUCT_DEV_JOBS_COLLECTION, editingJob.id);
                await updateDoc(jobRef, {
                    projectId: projectId || '',
                    projectName: finalProjectName,
                    customer: finalCustomer || '',
                    taskType,
                    estimatedHours: parseFloat(estimatedHours),
                    assignedDesigner,
                    managerNote: managerNote.trim() || '',
                    deadlineDate: deadlineDate || null,
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
                    estimatedHours: parseFloat(estimatedHours),
                    assignedDesigner,
                    managerNote: managerNote.trim() || '',
                    deadlineDate: deadlineDate || null,
                    status: DESIGN_JOB_STATUS.ASSIGNED,
                    createdBy: loggedInUser.name,
                    createdAt: getCurrentDateTimeString(),
                    autoPause: true,
                    orderIndex: maxOrderIndex + 1
                });
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
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                <div>
                    <h2 className="text-lg font-bold text-gray-800 dark:text-white flex items-center">
                        <Sliders className="w-5 h-5 mr-2 text-amber-500" /> Ürün Geliştirme İş Planlama & Görev Atama
                    </h2>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Personellerin iş kuyruklarını düzenleyebilir, yeni ürün geliştirme ve prototip görevleri atayabilirsiniz.</p>
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

            {productDevDesigners.length === 0 ? (
                <div className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 text-center space-y-3">
                    <div className="w-12 h-12 bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 rounded-full flex items-center justify-center mx-auto text-xl">
                        👤
                    </div>
                    <h3 className="font-bold text-gray-800 dark:text-white text-sm">Ürün Geliştirme Personeli Bulunamadı</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 max-w-md mx-auto">
                        Sistemde 'Ürün Geliştirme Sorumlusu' veya 'Ürün Geliştirme Yöneticisi' rolüne sahip personel bulunmamaktadır.
                        Personellerin burada listelenebilmesi için Personel Yönetimi bölümünden ilgili kişilere 'Ürün Geliştirme Sorumlusu' veya 'Ürün Geliştirme Yöneticisi' rolünün atanması gerekmektedir.
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {productDevDesigners.map((designer) => {
                        const dJobs = designerJobsMap[designer.name] || [];
                        const totalEst = dJobs.reduce((sum, j) => sum + (parseFloat(j.estimatedHours) || 0), 0);

                        return (
                            <div key={designer.id || designer.name} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col">
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

                                <div className="p-3 flex-1 space-y-3 overflow-y-auto max-h-[500px]">
                                    {dJobs.map((job, idx) => {
                                        const isRunning = job.status === DESIGN_JOB_STATUS.IN_PROGRESS;

                                        return (
                                            <div key={job.id} className={`p-3 rounded-lg border transition-all space-y-2 bg-gray-50 dark:bg-gray-900/40 ${isRunning ? 'border-amber-500 ring-1 ring-amber-500 bg-amber-50/20' : 'border-gray-200 dark:border-gray-700'}`}>
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
                    })}
                </div>
            )}

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
                                <label className="block font-bold mb-1">Atanacak Personel</label>
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
