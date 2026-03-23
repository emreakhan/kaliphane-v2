// src/pages/DesignMyTasks.js

import React, { useState, useMemo, useEffect } from 'react';
import { PlayCircle, PauseCircle, CheckCircle, Clock, Search, ChevronDown, AlertTriangle, Briefcase, Activity, ListOrdered } from 'lucide-react';
import { doc, updateDoc } from '../config/firebase.js';
import { DESIGN_JOBS_COLLECTION, DESIGN_JOB_STATUS, DESIGN_ACTIVITY_TYPES } from '../config/constants.js';
import { getCurrentDateTimeString } from '../utils/dateUtils.js';
import Modal from '../components/Modals/Modal.js';

// --- ARAMALI PROJE SEÇİM BİLEŞENİ ---
const SearchableProjectSelect = ({ projects, value, onChange, error }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [filter, setFilter] = useState('');

    useEffect(() => {
        if (!value) setFilter('');
        else {
            const p = projects.find(proj => proj.id === value);
            if (p) setFilter(p.moldName);
        }
    }, [value, projects]);

    const filteredProjects = projects.filter(p => 
        p.moldName?.toLowerCase().includes(filter.toLowerCase()) || 
        p.customer?.toLowerCase().includes(filter.toLowerCase())
    );

    const handleSelect = (proj) => {
        setFilter(proj.moldName);
        onChange(proj.id, proj.moldName);
        setIsOpen(false);
    };

    return (
        <div className="relative mb-4">
            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Hangi Kalıp / Proje İçin Bölündünüz?</label>
            <div className="relative">
                <input
                    type="text"
                    className={`block w-full rounded-lg border-gray-300 shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white pr-8 pl-10 py-2.5 ${error ? 'border-red-500 ring-1 ring-red-500' : ''}`}
                    placeholder="Kalıp adı veya müşteri ara..."
                    value={filter}
                    onChange={(e) => {
                        setFilter(e.target.value);
                        setIsOpen(true);
                        onChange('', ''); 
                    }}
                    onFocus={() => setIsOpen(true)}
                />
                <Search className="absolute left-3 top-3 text-gray-400 w-4 h-4" />
                <div className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none">
                    {isOpen ? <ChevronDown className="w-4 h-4 rotate-180" /> : <ChevronDown className="w-4 h-4" />}
                </div>
            </div>
            
            {isOpen && (
                <>
                    <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)}></div>
                    <ul className="absolute z-20 w-full mt-1 max-h-48 overflow-y-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-xl">
                        {filteredProjects.length === 0 ? (
                            <li className="px-4 py-3 text-sm text-gray-500 text-center">Proje bulunamadı.</li>
                        ) : (
                            filteredProjects.map((proj) => (
                                <li 
                                    key={proj.id}
                                    onClick={() => handleSelect(proj)}
                                    className="px-4 py-2 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 cursor-pointer text-sm border-b last:border-0 border-gray-100 dark:border-gray-700 flex flex-col"
                                >
                                    <span className="font-bold text-gray-800 dark:text-gray-200">{proj.moldName}</span>
                                    {proj.customer && <span className="text-[10px] text-gray-500">{proj.customer}</span>}
                                </li>
                            ))
                        )}
                    </ul>
                </>
            )}
            
            {error && <p className="mt-1 text-sm text-red-600 font-medium flex items-center"><AlertTriangle className="w-4 h-4 mr-1" /> {error}</p>}
        </div>
    );
};

const DesignMyTasks = ({ db, designJobs, projects, loggedInUser }) => {
    const [pauseModalOpen, setPauseModalOpen] = useState(false);
    const [selectedJob, setSelectedJob] = useState(null);
    
    // Pause Form States
    const [pauseReason, setPauseReason] = useState('');
    const [pauseProjectId, setPauseProjectId] = useState('');
    const [pauseProjectName, setPauseProjectName] = useState('');
    const [pauseNote, setPauseNote] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    // DEĞİŞİKLİK: İşleri yöneticinin belirlediği "orderIndex" (sıra) değerine göre tam liste halinde diziyoruz.
    const myJobs = useMemo(() => {
        return designJobs
            .filter(j => j.assignedDesigner === loggedInUser.name && j.status !== DESIGN_JOB_STATUS.COMPLETED)
            .sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
    }, [designJobs, loggedInUser.name]);

    const handleAction = async (job, actionType, pauseData = null) => {
        if (!db) return;
        setIsSaving(true);
        const jobRef = doc(db, DESIGN_JOBS_COLLECTION, job.id);
        const now = getCurrentDateTimeString();
        let updates = {};

        try {
            if (actionType === 'START' || actionType === 'RESUME') {
                updates.status = DESIGN_JOB_STATUS.IN_PROGRESS;
                
                const sessions = job.workSessions ? [...job.workSessions] : [];
                sessions.push({ startTime: now, endTime: null });
                updates.workSessions = sessions;

                if (actionType === 'RESUME' && job.pauseHistory) {
                    const pauses = [...job.pauseHistory];
                    if (pauses.length > 0 && !pauses[pauses.length - 1].resumedAt) {
                        pauses[pauses.length - 1].resumedAt = now;
                    }
                    updates.pauseHistory = pauses;
                }
            } 
            else if (actionType === 'PAUSE') {
                updates.status = DESIGN_JOB_STATUS.PAUSED;
                
                const sessions = job.workSessions ? [...job.workSessions] : [];
                if (sessions.length > 0 && !sessions[sessions.length - 1].endTime) {
                    sessions[sessions.length - 1].endTime = now;
                }
                updates.workSessions = sessions;

                const pauses = job.pauseHistory ? [...job.pauseHistory] : [];
                pauses.push({
                    pausedAt: now,
                    resumedAt: null,
                    reason: pauseData.reason,
                    projectId: pauseData.projectId,
                    projectName: pauseData.projectName,
                    note: pauseData.note
                });
                updates.pauseHistory = pauses;
            } 
            else if (actionType === 'COMPLETE') {
                if (!window.confirm('Bu tasarım işini tamamen bitirdiğinizi onaylıyor musunuz?')) {
                    setIsSaving(false);
                    return;
                }
                updates.status = DESIGN_JOB_STATUS.COMPLETED;
                
                const sessions = job.workSessions ? [...job.workSessions] : [];
                if (sessions.length > 0 && !sessions[sessions.length - 1].endTime) {
                    sessions[sessions.length - 1].endTime = now;
                }
                updates.workSessions = sessions;
                updates.completedAt = now;
            }

            await updateDoc(jobRef, updates);
        } catch (error) {
            console.error("İşlem hatası:", error);
            alert("İşlem kaydedilemedi.");
        } finally {
            setIsSaving(false);
            if (actionType === 'PAUSE') closePauseModal();
        }
    };

    const openPauseModal = (job) => {
        setSelectedJob(job);
        setPauseReason(DESIGN_ACTIVITY_TYPES.MOLD_TRIAL);
        setPauseProjectId('');
        setPauseProjectName('');
        setPauseNote('');
        setPauseModalOpen(true);
    };

    const closePauseModal = () => {
        setPauseModalOpen(false);
        setSelectedJob(null);
    };

    const submitPause = () => {
        if (!pauseProjectId) {
            alert("Lütfen bölündüğünüz iş için bir kalıp/proje seçin.");
            return;
        }
        handleAction(selectedJob, 'PAUSE', {
            reason: pauseReason,
            projectId: pauseProjectId,
            projectName: pauseProjectName,
            note: pauseNote
        });
    };

    return (
        <div className="p-4 max-w-5xl mx-auto">
            <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                <div className="border-l-4 border-indigo-500 pl-4">
                    <h2 className="text-xl font-bold text-gray-800 dark:text-white flex items-center">
                        <ListOrdered className="w-6 h-6 mr-2 text-indigo-500" /> İş Kuyruğum
                    </h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Yönetici tarafından atanan sıraya göre iş listeniz.</p>
                </div>
                <div className="mt-4 md:mt-0 px-4 py-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-300 rounded-lg font-bold text-sm border border-indigo-100 dark:border-indigo-800">
                    Toplam Bekleyen: {myJobs.length} İş
                </div>
            </div>

            {myJobs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 text-center px-4">
                    <Briefcase className="w-16 h-16 text-gray-300 dark:text-gray-600 mb-4" />
                    <h3 className="text-xl font-bold text-gray-700 dark:text-gray-300 mb-2">Harika, iş kalmamış!</h3>
                    <p className="text-gray-500 dark:text-gray-500">Şu anda sıranızda bekleyen veya devam eden bir tasarım görevi bulunmuyor.</p>
                </div>
            ) : (
                <div className="flex flex-col gap-4">
                    {myJobs.map((job, idx) => {
                        const isRunning = job.status === DESIGN_JOB_STATUS.IN_PROGRESS;
                        const isPaused = job.status === DESIGN_JOB_STATUS.PAUSED;

                        return (
                            <div 
                                key={job.id} 
                                className={`bg-white dark:bg-gray-800 rounded-xl shadow-md border overflow-hidden flex flex-col md:flex-row transition-all duration-200 ${
                                    isRunning ? 'border-green-500 ring-2 ring-green-500/20 transform scale-[1.01]' : 
                                    isPaused ? 'border-orange-400 opacity-90' : 'border-gray-200 dark:border-gray-700 hover:border-indigo-300'
                                }`}
                            >
                                {/* SOL KISIM: SIRA NUMARASI VE BİLGİLER */}
                                <div className="p-5 flex-1 flex flex-col sm:flex-row items-start sm:items-center gap-5">
                                    
                                    {/* SIRA NUMARASI YUVARLAĞI */}
                                    <div className={`flex-shrink-0 w-14 h-14 rounded-full flex items-center justify-center text-xl font-black shadow-inner border-4 ${
                                        isRunning ? 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/50 dark:text-green-300 dark:border-green-800' :
                                        isPaused ? 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/50 dark:text-orange-300 dark:border-orange-800' :
                                        'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600'
                                    }`}>
                                        {idx + 1}
                                    </div>

                                    {/* PROJE BİLGİLERİ */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-3 mb-1.5 flex-wrap">
                                            <h3 className="text-lg sm:text-xl font-extrabold text-gray-900 dark:text-white truncate">{job.projectName}</h3>
                                            <span className="text-[10px] font-bold px-2.5 py-1 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded border border-indigo-100 dark:border-indigo-800">
                                                {job.taskType}
                                            </span>
                                            {isRunning && (
                                                <span className="flex items-center text-[10px] font-bold text-green-700 bg-green-100 px-2.5 py-1 rounded border border-green-200 animate-pulse">
                                                    <Activity className="w-3 h-3 mr-1" /> ÇALIŞIYOR
                                                </span>
                                            )}
                                            {isPaused && (
                                                <span className="flex items-center text-[10px] font-bold text-orange-700 bg-orange-100 px-2.5 py-1 rounded border border-orange-200">
                                                    <PauseCircle className="w-3 h-3 mr-1" /> DURAKLATILDI
                                                </span>
                                            )}
                                        </div>
                                        
                                        {job.customer && <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">{job.customer}</p>}

                                        {job.managerNote && (
                                            <div className="text-xs text-gray-700 dark:text-gray-300 bg-yellow-50 dark:bg-yellow-900/20 p-2.5 rounded border border-yellow-200 dark:border-yellow-800/50 flex items-start mt-2">
                                                <AlertTriangle className="w-4 h-4 text-yellow-600 dark:text-yellow-500 mr-2 flex-shrink-0" />
                                                <div>
                                                    <span className="font-bold mr-1">Yönetici Notu:</span>
                                                    <span className="italic">{job.managerNote}</span>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* SAĞ KISIM: SÜRE VE BUTONLAR */}
                                <div className="bg-gray-50 dark:bg-gray-900/50 md:w-64 border-t md:border-t-0 md:border-l border-gray-200 dark:border-gray-700 p-5 flex flex-col justify-center">
                                    
                                    <div className="flex justify-between items-center mb-4 pb-3 border-b border-gray-200 dark:border-gray-700">
                                        <span className="text-xs font-bold text-gray-500 dark:text-gray-400 flex items-center">
                                            <Clock className="w-4 h-4 mr-1" /> Hedef Süre
                                        </span>
                                        <span className="text-lg font-black text-indigo-600 dark:text-indigo-400">{job.estimatedHours} Saat</span>
                                    </div>

                                    <div className="flex flex-col gap-2">
                                        {job.status === DESIGN_JOB_STATUS.ASSIGNED || job.status === DESIGN_JOB_STATUS.POOL ? (
                                            <button 
                                                onClick={() => handleAction(job, 'START')}
                                                disabled={isSaving}
                                                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-lg transition flex justify-center items-center shadow-md"
                                            >
                                                <PlayCircle className="w-4 h-4 mr-2" /> İşe Başla
                                            </button>
                                        ) : null}

                                        {isRunning && (
                                            <>
                                                <button 
                                                    onClick={() => openPauseModal(job)}
                                                    disabled={isSaving}
                                                    className="w-full py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold rounded-lg transition flex justify-center items-center shadow-md"
                                                >
                                                    <PauseCircle className="w-4 h-4 mr-2" /> Duraklat
                                                </button>
                                                <button 
                                                    onClick={() => handleAction(job, 'COMPLETE')}
                                                    disabled={isSaving}
                                                    className="w-full py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-bold rounded-lg transition flex justify-center items-center shadow-md"
                                                >
                                                    <CheckCircle className="w-4 h-4 mr-2" /> İşi Bitir
                                                </button>
                                            </>
                                        )}

                                        {isPaused && (
                                            <button 
                                                onClick={() => handleAction(job, 'RESUME')}
                                                disabled={isSaving}
                                                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-lg transition flex justify-center items-center shadow-md"
                                            >
                                                <PlayCircle className="w-4 h-4 mr-2" /> Devam Et
                                            </button>
                                        )}
                                    </div>
                                </div>

                            </div>
                        );
                    })}
                </div>
            )}

            {/* DURAKLATMA MODALI */}
            {pauseModalOpen && selectedJob && (
                <Modal isOpen={pauseModalOpen} onClose={closePauseModal} title="İşi Duraklat / Bölünme Bildir">
                    <div className="space-y-5">
                        <div className="bg-orange-50 dark:bg-orange-900/20 p-3 rounded-lg border border-orange-100 dark:border-orange-800">
                            <p className="text-sm text-orange-800 dark:text-orange-300">
                                <strong>{selectedJob.projectName}</strong> işini duraklatıyorsunuz. Lütfen araya giren işin detayını belirtin.
                            </p>
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Bölünme Nedeni</label>
                            <select 
                                value={pauseReason}
                                onChange={(e) => setPauseReason(e.target.value)}
                                className="w-full p-3 border rounded-lg bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:text-white outline-none focus:ring-2 focus:ring-orange-500 font-semibold"
                            >
                                {Object.values(DESIGN_ACTIVITY_TYPES).map(type => (
                                    <option key={type} value={type}>{type}</option>
                                ))}
                            </select>
                        </div>

                        <SearchableProjectSelect 
                            projects={projects}
                            value={pauseProjectId}
                            onChange={(id, name) => {
                                setPauseProjectId(id);
                                setPauseProjectName(name);
                            }}
                        />

                        <div>
                            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Açıklama / Detay</label>
                            <textarea 
                                value={pauseNote}
                                onChange={(e) => setPauseNote(e.target.value)}
                                placeholder="Örn: T0 baskısı için preshaneye iniyorum..."
                                className="w-full p-3 border rounded-lg bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:text-white outline-none focus:ring-2 focus:ring-orange-500 resize-none h-24 text-sm"
                            />
                        </div>

                        <div className="pt-4 flex justify-end gap-3">
                            <button onClick={closePauseModal} className="px-5 py-2.5 text-gray-600 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 rounded-lg font-medium transition">
                                İptal
                            </button>
                            <button 
                                onClick={submitPause}
                                disabled={isSaving || !pauseProjectId}
                                className="px-5 py-2.5 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-lg shadow-md transition flex items-center disabled:opacity-50"
                            >
                                <PauseCircle className="w-5 h-5 mr-2" />
                                {isSaving ? 'Kaydediliyor...' : 'Duraklat'}
                            </button>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
};

export default DesignMyTasks;