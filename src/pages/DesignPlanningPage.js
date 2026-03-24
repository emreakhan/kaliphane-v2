// src/pages/DesignPlanningPage.js

import React, { useState, useMemo } from 'react';
import { 
    Clock, Save, Plus, GripVertical, Trash2, 
    MoreVertical, Search, X, Edit2, Calculator, Box, Activity,
    ArrowUp, ArrowDown, UserCircle, Briefcase, Calendar as CalendarIcon
} from 'lucide-react';
import { 
    doc, updateDoc, addDoc, deleteDoc, collection 
} from '../config/firebase.js';
import { 
    DESIGN_JOBS_COLLECTION, DESIGN_TASK_TYPES, PERSONNEL_ROLES, DESIGN_JOB_STATUS 
} from '../config/constants.js';
import { getCurrentDateTimeString } from '../utils/dateUtils.js';

const DesignPlanningPage = ({ db, designJobs, personnel, projects, loggedInUser }) => {
    const [isModalOpen, setIsModalOpen] = useState(false); 
    const [searchTerm, setSearchTerm] = useState(''); 
    const [showProjectList, setShowProjectList] = useState(false); 
    
    const [selectedProject, setSelectedProject] = useState(null);
    const [taskType, setTaskType] = useState(DESIGN_TASK_TYPES.CONCEPT);
    const [estimatedHours, setEstimatedHours] = useState('');
    const [managerNote, setManagerNote] = useState('');
    const [deadlineDate, setDeadlineDate] = useState(''); // YENİ EKLENDİ: Termin Tarihi

    const [activeMenuJobId, setActiveMenuJobId] = useState(null);
    const [editingJob, setEditingJob] = useState(null);
    const [draggedJobId, setDraggedJobId] = useState(null);

    const designers = useMemo(() => {
        return personnel
            .filter(p => p.role === PERSONNEL_ROLES.KALIP_TASARIM_SORUMLUSU || p.role === PERSONNEL_ROLES.KALIP_TASARIM_YONETICISI)
            .map(p => p.name)
            .sort((a, b) => a.localeCompare(b, 'tr'));
    }, [personnel]);

    const filteredProjects = useMemo(() => {
        return projects.filter(p => 
            (p.moldName && p.moldName.toLowerCase().includes(searchTerm.toLowerCase())) ||
            (p.customer && p.customer.toLowerCase().includes(searchTerm.toLowerCase()))
        );
    }, [projects, searchTerm]);

    const handleMoveJob = async (job, direction) => {
        const isPoolJob = !job.assignedDesigner || job.assignedDesigner === '';
        const relevantJobs = designJobs
            .filter(j => j.status !== DESIGN_JOB_STATUS.COMPLETED)
            .filter(j => {
                if (isPoolJob) return !j.assignedDesigner || j.assignedDesigner === ''; 
                return j.assignedDesigner === job.assignedDesigner; 
            })
            .sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
        
        const currentIndex = relevantJobs.findIndex(j => j.id === job.id);
        if (currentIndex === -1) return;

        if (direction === 'up' && currentIndex > 0) {
            const prevJob = relevantJobs[currentIndex - 1];
            await updateDoc(doc(db, DESIGN_JOBS_COLLECTION, job.id), { orderIndex: currentIndex - 1 });
            await updateDoc(doc(db, DESIGN_JOBS_COLLECTION, prevJob.id), { orderIndex: currentIndex });
        }
        if (direction === 'down' && currentIndex < relevantJobs.length - 1) {
            const nextJob = relevantJobs[currentIndex + 1];
            await updateDoc(doc(db, DESIGN_JOBS_COLLECTION, job.id), { orderIndex: currentIndex + 1 });
            await updateDoc(doc(db, DESIGN_JOBS_COLLECTION, nextJob.id), { orderIndex: currentIndex });
        }
    };

    const handleAddJob = async () => {
        if (!selectedProject || !estimatedHours || !taskType) {
            return alert("Lütfen proje seçin, iş türü belirleyin ve tahmini süre girin!");
        }

        try {
            const poolJobs = designJobs.filter(j => (!j.assignedDesigner || j.assignedDesigner === '') && j.status !== DESIGN_JOB_STATUS.COMPLETED);
            const maxOrderIndex = poolJobs.length > 0 
                ? Math.max(...poolJobs.map(j => j.orderIndex || 0)) : 0;

            await addDoc(collection(db, DESIGN_JOBS_COLLECTION), {
                projectId: selectedProject.id,
                projectName: selectedProject.moldName || '',
                customer: selectedProject.customer || '',
                taskType: taskType,
                estimatedHours: parseFloat(estimatedHours),
                managerNote: managerNote,
                deadlineDate: deadlineDate || null, // YENİ EKLENDİ
                
                status: DESIGN_JOB_STATUS.POOL, 
                assignedDesigner: '',       
                createdBy: loggedInUser.name,
                createdAt: getCurrentDateTimeString(),
                
                orderIndex: maxOrderIndex + 1 
            });
            resetForm();
        } catch (error) {
            console.error("Hata:", error);
            alert("İş eklenemedi.");
        }
    };

    const resetForm = () => {
        setSelectedProject(null);
        setEstimatedHours('');
        setManagerNote('');
        setDeadlineDate('');
        setSearchTerm('');
        setShowProjectList(false);
        setIsModalOpen(false);
        setTaskType(DESIGN_TASK_TYPES.CONCEPT);
    };

    const handleDeleteJob = async (jobId) => {
        if (window.confirm("Bu tasarım iş emrini silmek istediğinize emin misiniz?")) {
            await deleteDoc(doc(db, DESIGN_JOBS_COLLECTION, jobId));
        }
        setActiveMenuJobId(null);
    };

    const startEditing = (job) => {
        setEditingJob({ id: job.id, hours: job.estimatedHours, deadline: job.deadlineDate || '' });
        setActiveMenuJobId(null);
    };

    const saveEdit = async () => {
        if (!editingJob || !editingJob.hours) return;
        try {
            await updateDoc(doc(db, DESIGN_JOBS_COLLECTION, editingJob.id), {
                estimatedHours: parseFloat(editingJob.hours),
                deadlineDate: editingJob.deadline || null
            });
            setEditingJob(null);
        } catch (error) { console.error("Güncelleme hatası:", error); }
    };

    const onDragStart = (e, jobId) => {
        setTimeout(() => { setDraggedJobId(jobId); }, 0);
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", jobId);
    };
    const onDragEnd = (e) => { setDraggedJobId(null); };
    const onDragOver = (e) => { e.preventDefault(); };

    const onDrop = async (e, targetDesigner) => {
        e.preventDefault();
        const droppedJobId = draggedJobId || e.dataTransfer.getData("text/plain");
        if (!droppedJobId) return;

        try {
            const existingJobsForDesigner = designJobs
                .filter(j => j.assignedDesigner === targetDesigner && j.status !== DESIGN_JOB_STATUS.COMPLETED)
                .sort((a,b) => (a.orderIndex || 0) - (b.orderIndex || 0));

            const newIndex = existingJobsForDesigner.length > 0 
                ? (existingJobsForDesigner[existingJobsForDesigner.length - 1].orderIndex || 0) + 1 : 0;

            const jobRef = doc(db, DESIGN_JOBS_COLLECTION, droppedJobId);
            await updateDoc(jobRef, {
                assignedDesigner: targetDesigner || '',
                status: targetDesigner ? DESIGN_JOB_STATUS.ASSIGNED : DESIGN_JOB_STATUS.POOL,
                orderIndex: newIndex
            });
        } catch (error) { console.error("Taşıma hatası:", error); }
        setDraggedJobId(null);
    };

    const activeJobs = useMemo(() => designJobs ? designJobs.filter(job => job.status !== DESIGN_JOB_STATUS.COMPLETED) : [], [designJobs]);
    const unassignedJobs = useMemo(() => activeJobs.filter(j => !j.assignedDesigner || j.assignedDesigner === '').sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0)), [activeJobs]);
    const getJobsForDesigner = (designerName) => activeJobs.filter(j => j.assignedDesigner === designerName).sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
    
    const JobCard = ({ job, index, isAssigned }) => {
        const isRunning = job.status === DESIGN_JOB_STATUS.IN_PROGRESS;

        const formatDate = (dateStr) => {
            if (!dateStr) return '';
            const d = new Date(dateStr);
            return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });
        };

        return (
            <div 
                draggable
                onDragStart={(e) => onDragStart(e, job.id)}
                onDragEnd={onDragEnd}
                className={`select-none p-3 rounded-lg shadow-sm border mb-2 cursor-grab active:cursor-grabbing hover:shadow-md transition relative group
                    ${isRunning ? 'bg-indigo-50 border-indigo-500 dark:bg-indigo-900/20 dark:border-indigo-600 border-l-4' : 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600'}`}
            >
                {isRunning && (
                    <div className="absolute -top-2 -right-2 bg-indigo-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center shadow-sm animate-pulse z-10">
                        <Activity className="w-3 h-3 mr-1" /> ÇALIŞIYOR
                    </div>
                )}

                <div className="flex justify-between items-start">
                    <div className="flex items-center w-full pr-6">
                        <span className={`mr-2 flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${!isAssigned ? 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-200' : 'bg-gray-200 text-gray-700 dark:bg-gray-600 dark:text-gray-200'}`}>
                           {index + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                            <h4 className="font-bold text-gray-800 dark:text-white text-sm truncate" title={job.projectName}>{job.projectName}</h4>
                            <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                                <span className="text-[10px] bg-gray-100 dark:bg-gray-600 px-1.5 py-0.5 rounded font-semibold text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-500">{job.taskType}</span>
                                {job.customer && <span className="text-[10px] text-gray-500 truncate">• {job.customer}</span>}
                            </div>
                        </div>
                    </div>
                    
                    <div className="relative flex items-center">
                        {!isRunning && (
                            <div className="flex flex-col mr-2 opacity-50 group-hover:opacity-100 transition">
                                <button onClick={() => handleMoveJob(job, 'up')} className="p-0.5 hover:bg-blue-100 rounded text-blue-600" title="Yukarı Taşı"><ArrowUp className="w-4 h-4" /></button>
                                <button onClick={() => handleMoveJob(job, 'down')} className="p-0.5 hover:bg-blue-100 rounded text-blue-600" title="Aşağı Taşı"><ArrowDown className="w-4 h-4" /></button>
                            </div>
                        )}
                        <button onClick={() => setActiveMenuJobId(activeMenuJobId === job.id ? null : job.id)} className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-white rounded-full hover:bg-gray-100 dark:hover:bg-gray-600 transition">
                            <MoreVertical className="w-4 h-4" />
                        </button>
                        {activeMenuJobId === job.id && (
                            <>
                                <div className="fixed inset-0 z-10" onClick={() => setActiveMenuJobId(null)}></div>
                                <div className="absolute right-0 top-6 z-20 w-36 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-xl overflow-hidden animate-in fade-in zoom-in duration-200">
                                    <button onClick={() => startEditing(job)} className="w-full text-left px-4 py-2 text-xs text-gray-700 dark:text-gray-200 hover:bg-blue-50 dark:hover:bg-blue-900/30 flex items-center">
                                        <Edit2 className="w-3 h-3 mr-2" /> Düzenle
                                    </button>
                                    <button onClick={() => handleDeleteJob(job.id)} className="w-full text-left px-4 py-2 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 flex items-center">
                                        <Trash2 className="w-3 h-3 mr-2" /> Sil
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
                
                <div className="mt-3 flex justify-between items-end text-xs">
                    {editingJob?.id === job.id ? (
                        <div className="flex flex-col space-y-2 w-full animate-in fade-in">
                            <div className="flex items-center space-x-1">
                                <input type="number" className="w-16 p-1.5 border rounded text-xs text-center dark:bg-gray-600 dark:text-white" value={editingJob.hours} onChange={(e) => setEditingJob({...editingJob, hours: e.target.value})} placeholder="Saat" />
                                <input type="date" className="flex-1 p-1.5 border rounded text-xs dark:bg-gray-600 dark:text-white" value={editingJob.deadline} onChange={(e) => setEditingJob({...editingJob, deadline: e.target.value})} />
                            </div>
                            <div className="flex justify-end gap-1">
                                <button onClick={saveEdit} className="p-1.5 bg-green-500 hover:bg-green-600 text-white rounded"><Save className="w-4 h-4"/></button>
                                <button onClick={() => setEditingJob(null)} className="p-1.5 bg-gray-400 hover:bg-gray-500 text-white rounded"><X className="w-4 h-4"/></button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-1.5">
                            <span className="inline-flex items-center text-purple-600 dark:text-purple-400 font-bold bg-purple-50 dark:bg-purple-900/20 px-2 py-1 rounded border border-purple-100 dark:border-purple-800 w-max" title="Hedeflenen Tasarım Süresi">
                                <Clock className="w-3 h-3 mr-1" /> {job.estimatedHours} Saat
                            </span>
                            {job.deadlineDate && (
                                <span className="inline-flex items-center text-red-600 dark:text-red-400 font-bold bg-red-50 dark:bg-red-900/20 px-2 py-1 rounded border border-red-100 dark:border-red-800/50 w-max" title="Termin (Teslim) Tarihi">
                                    <CalendarIcon className="w-3 h-3 mr-1" /> Termin: {formatDate(job.deadlineDate)}
                                </span>
                            )}
                        </div>
                    )}
                </div>

                {job.managerNote && (
                    <div className="mt-2 text-[10px] text-gray-500 italic border-t border-dashed border-gray-200 dark:border-gray-600 pt-1">
                        "{job.managerNote}"
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="p-4 flex flex-col md:flex-row gap-6">
            <div className="w-full md:w-1/3 flex flex-col gap-4" style={{ height: 'calc(100vh - 200px)' }}>
                <button 
                    onClick={() => setIsModalOpen(true)}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white p-4 rounded-xl shadow-lg flex items-center justify-center transition transform hover:scale-[1.02] active:scale-95"
                >
                    <Plus className="w-6 h-6 mr-2" />
                    <div className="text-left">
                        <div className="font-bold text-lg">Yeni Tasarım İşi Ekle</div>
                        <div className="text-xs text-indigo-200">Projeyi seçip havuza gönder</div>
                    </div>
                </button>

                <div className="flex-1 bg-gray-200 dark:bg-gray-800/50 rounded-xl p-4 border-2 border-dashed border-gray-300 dark:border-gray-600 flex flex-col overflow-hidden" onDragOver={onDragOver} onDrop={(e) => onDrop(e, '')}>
                    <h3 className="font-bold text-gray-600 dark:text-gray-400 mb-3 flex items-center justify-between">
                        <span>BEKLEYEN İŞ HAVUZU</span>
                        <span className="bg-gray-300 dark:bg-gray-700 text-xs px-2 py-1 rounded-full text-gray-800 dark:text-gray-200">{unassignedJobs.length}</span>
                    </h3>
                    <div className="text-[10px] text-gray-500 mb-2 italic">* Atama yapmak için kartları sağdaki sütunlara sürükleyin.</div>
                    <div className="overflow-y-auto flex-1 pr-2 space-y-2">
                        {unassignedJobs.length === 0 && (
                            <div className="flex flex-col items-center justify-center h-40 text-gray-400">
                                <Box className="w-10 h-10 mb-2 opacity-50" />
                                <p className="text-sm">Havuz boş.</p>
                            </div>
                        )}
                        {unassignedJobs.map((job, idx) => (
                            <JobCard key={job.id} job={job} index={idx} isAssigned={false} />
                        ))}
                    </div>
                </div>
            </div>

            <div className="w-full md:w-2/3 overflow-x-auto pb-4">
                <div className="flex gap-4 h-full min-w-max" style={{ height: 'calc(100vh - 200px)' }}>
                    {designers.map(designerName => {
                        const jobs = getJobsForDesigner(designerName);
                        const totalLoad = jobs.reduce((acc, job) => acc + (parseFloat(job.estimatedHours) || 0), 0);

                        return (
                            <div key={designerName} className="bg-white dark:bg-gray-800 rounded-xl shadow border border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden w-80 flex-shrink-0" onDragOver={onDragOver} onDrop={(e) => onDrop(e, designerName)}>
                                <div className="p-3 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 flex flex-col items-center text-center relative">
                                    <div className="absolute right-3 top-3">
                                        <span className="text-xs font-bold bg-white dark:bg-gray-700 px-2 py-1 rounded-full border border-gray-200 dark:border-gray-600 shadow-sm text-gray-700 dark:text-gray-300">{jobs.length} İş</span>
                                    </div>
                                    <div className="w-12 h-12 bg-indigo-100 text-indigo-600 dark:bg-indigo-900/50 dark:text-indigo-400 rounded-full flex items-center justify-center mb-2 shadow-inner">
                                        <UserCircle className="w-8 h-8" />
                                    </div>
                                    <h3 className="font-bold text-gray-800 dark:text-white leading-tight">{designerName}</h3>
                                    <div className="mt-1 flex items-center text-xs font-semibold text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 px-3 py-1 rounded-full">
                                        <Clock className="w-3 h-3 mr-1" />
                                        İş Yükü: {totalLoad.toFixed(1)} Saat
                                    </div>
                                </div>

                                <div className="flex-1 p-3 overflow-y-auto bg-gray-50/30 dark:bg-gray-900/20 space-y-2">
                                    {jobs.length === 0 ? (
                                        <div className="h-full flex flex-col items-center justify-center text-gray-400 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg opacity-50 p-4 text-center">
                                            <Briefcase className="w-8 h-8 mb-2" />
                                            <p className="text-xs font-medium">Bu tasarımcıya henüz iş atanmamış.</p>
                                        </div>
                                    ) : (
                                        jobs.map((job, idx) => (
                                            <JobCard key={job.id} job={job} index={idx} isAssigned={true} />
                                        ))
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {isModalOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900">
                            <h3 className="text-lg font-bold text-gray-800 dark:text-white flex items-center">
                                <Plus className="w-5 h-5 mr-2 text-indigo-600" /> Yeni Tasarım İşi Emri
                            </h3>
                            <button onClick={resetForm} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition"><X className="w-5 h-5 text-gray-500" /></button>
                        </div>
                        
                        <div className="p-5 flex-1 overflow-y-auto space-y-5" style={{ minHeight: '300px' }}>
                            <div className="relative">
                                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Hangi Kalıp/Proje İçin?</label>
                                <div className="relative">
                                    <Search className="absolute left-3 top-3 text-gray-400 w-4 h-4" />
                                    <input 
                                        type="text" placeholder="Kalıp adı veya müşteri ara..." 
                                        className="w-full pl-10 p-2.5 border rounded-lg bg-gray-50 dark:bg-gray-700 dark:text-white dark:border-gray-600 focus:ring-2 focus:ring-indigo-500 outline-none"
                                        value={searchTerm} onFocus={() => setShowProjectList(true)}
                                        onChange={(e) => { setSearchTerm(e.target.value); setSelectedProject(null); setShowProjectList(true); }}
                                    />
                                </div>
                                {showProjectList && (
                                    <div className="absolute top-full left-0 right-0 mt-1 border border-gray-200 dark:border-gray-600 rounded-lg max-h-48 overflow-y-auto bg-white dark:bg-gray-800 shadow-xl z-50">
                                        {filteredProjects.length === 0 ? <p className="p-3 text-sm text-gray-400 text-center">Proje bulunamadı.</p> : (
                                            filteredProjects.map(proj => (
                                                <div key={proj.id} onClick={() => { setSelectedProject(proj); setSearchTerm(proj.moldName); setShowProjectList(false); }} className={`p-2.5 text-sm cursor-pointer border-b last:border-0 hover:bg-indigo-50 dark:hover:bg-gray-600 flex flex-col transition ${selectedProject?.id === proj.id ? 'bg-indigo-100 dark:bg-indigo-900/40' : ''}`}>
                                                    <span className={`font-bold ${selectedProject?.id === proj.id ? 'text-indigo-800 dark:text-indigo-200' : 'text-gray-800 dark:text-gray-200'}`}>{proj.moldName}</span>
                                                    {proj.customer && <span className="text-[10px] text-gray-500">{proj.customer}</span>}
                                                </div>
                                            ))
                                        )}
                                    </div>
                                )}
                            </div>

                            {selectedProject && (
                                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Tasarım İşinin Türü</label>
                                        <select value={taskType} onChange={(e) => setTaskType(e.target.value)} className="w-full p-2.5 border rounded-lg bg-gray-50 dark:bg-gray-700 dark:text-white dark:border-gray-600 focus:ring-2 focus:ring-indigo-500 outline-none font-semibold">
                                            {Object.values(DESIGN_TASK_TYPES).map(type => <option key={type} value={type}>{type}</option>)}
                                        </select>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Hedef Süre</label>
                                            <div className="relative">
                                                <input type="number" placeholder="Saat" className="w-full p-3 pl-9 border-2 border-indigo-100 dark:border-gray-600 rounded-lg text-lg font-bold focus:border-indigo-500 outline-none dark:bg-gray-700 dark:text-white" value={estimatedHours} onChange={(e) => setEstimatedHours(e.target.value)} />
                                                <Clock className="absolute left-3 top-3.5 text-indigo-400 w-5 h-5" />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Termin Tarihi</label>
                                            <div className="relative">
                                                <input type="date" className="w-full p-3 pl-9 border-2 border-red-100 dark:border-gray-600 rounded-lg text-sm font-bold focus:border-red-500 outline-none dark:bg-gray-700 dark:text-white text-gray-700" value={deadlineDate} onChange={(e) => setDeadlineDate(e.target.value)} />
                                                <CalendarIcon className="absolute left-3 top-3.5 text-red-400 w-5 h-5" />
                                            </div>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">Yönetici Notu (Opsiyonel)</label>
                                        <textarea placeholder="Örn: Müşteriden gelen son revizyon..." className="w-full p-2 border rounded-lg dark:bg-gray-700 dark:text-white dark:border-gray-600 resize-none h-20 text-sm" value={managerNote} onChange={(e) => setManagerNote(e.target.value)} />
                                    </div>
                                </div>
                            )}
                        </div>
                        
                        <div className="p-4 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 flex justify-end gap-3">
                            <button onClick={resetForm} className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition font-medium">İptal</button>
                            <button onClick={handleAddJob} disabled={!selectedProject || !estimatedHours || !taskType} className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center">
                                <Save className="w-4 h-4 mr-2" /> Havuza Ekle
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DesignPlanningPage;