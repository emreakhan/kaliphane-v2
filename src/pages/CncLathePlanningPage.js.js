// src/pages/CncLathePlanningPage.js

import React, { useState, useEffect, useMemo } from 'react';
import { 
    Clock, Save, Plus, Factory, GripVertical, Trash2, 
    MoreVertical, Search, X, Edit2, Calculator, Box, Activity 
} from 'lucide-react';
import { 
    doc, updateDoc, addDoc, deleteDoc, collection, onSnapshot, query, orderBy 
} from '../config/firebase.js';
import { 
    CNC_LATHE_JOBS_COLLECTION, CNC_LATHE_MACHINES, CNC_PARTS_COLLECTION 
} from '../config/constants.js';
import { getCurrentDateTimeString } from '../utils/dateUtils.js';

const CncLathePlanningPage = ({ db, cncJobs }) => {
    // --- STATE'LER ---
    const [parts, setParts] = useState([]); // Kayıtlı Parça Listesi
    const [isModalOpen, setIsModalOpen] = useState(false); // Yeni Ekleme Penceresi
    const [searchTerm, setSearchTerm] = useState(''); // Parça Arama
    const [showPartList, setShowPartList] = useState(false); // Parça Listesi Açık mı?
    
    // Form Verisi
    const [selectedPart, setSelectedPart] = useState(null);
    const [targetQuantity, setTargetQuantity] = useState('');
    const [operatorNote, setOperatorNote] = useState('');

    // Kart Menü Yönetimi
    const [activeMenuJobId, setActiveMenuJobId] = useState(null);
    
    // Düzenleme Modu
    const [editingJob, setEditingJob] = useState(null); 

    // Sürüklenen İşin ID'si
    const [draggedJobId, setDraggedJobId] = useState(null);

    // --- 1. PARÇA LİSTESİNİ ÇEKME ---
    useEffect(() => {
        if (!db) return;
        const q = query(collection(db, CNC_PARTS_COLLECTION), orderBy('partName'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            setParts(data);
        });
        return () => unsubscribe();
    }, [db]);

    // --- 2. YENİ İŞ EKLEME ---
    const handleAddJob = async () => {
        if (!selectedPart || !targetQuantity) return alert("Lütfen parça seçin ve adet girin!");

        const cycleTime = parseFloat(selectedPart.cycleTime) || 0;
        const totalSeconds = cycleTime * parseInt(targetQuantity);
        const totalHours = (totalSeconds / 3600).toFixed(1);

        try {
            await addDoc(collection(db, CNC_LATHE_JOBS_COLLECTION), {
                partName: selectedPart.partName,
                partId: selectedPart.id,
                targetQuantity: parseInt(targetQuantity),
                cycleTime: cycleTime,
                estimatedTotalHours: totalHours,
                operatorNote: operatorNote,
                
                status: 'PLANNED', 
                machine: '',       
                assignedOperator: '',
                createdAt: getCurrentDateTimeString(),
                producedQuantity: 0
            });
            
            resetForm();
        } catch (error) {
            console.error("Hata:", error);
            alert("İş eklenemedi.");
        }
    };

    const resetForm = () => {
        setSelectedPart(null);
        setTargetQuantity('');
        setOperatorNote('');
        setSearchTerm('');
        setShowPartList(false);
        setIsModalOpen(false);
    };

    // --- 3. İŞ DÜZENLEME & SİLME ---
    const handleDeleteJob = async (jobId) => {
        if (window.confirm("Bu iş emrini silmek istediğinize emin misiniz?")) {
            await deleteDoc(doc(db, CNC_LATHE_JOBS_COLLECTION, jobId));
        }
        setActiveMenuJobId(null);
    };

    const startEditing = (job) => {
        setEditingJob({ id: job.id, quantity: job.targetQuantity });
        setActiveMenuJobId(null);
    };

    const saveEdit = async () => {
        if (!editingJob) return;
        try {
            const job = cncJobs.find(j => j.id === editingJob.id);
            let updates = { targetQuantity: parseInt(editingJob.quantity) };
            
            if (job && job.cycleTime) {
                const totalSeconds = parseFloat(job.cycleTime) * parseInt(editingJob.quantity);
                updates.estimatedTotalHours = (totalSeconds / 3600).toFixed(1);
            }

            await updateDoc(doc(db, CNC_LATHE_JOBS_COLLECTION, editingJob.id), updates);
            setEditingJob(null);
        } catch (error) {
            console.error("Güncelleme hatası:", error);
        }
    };

    // --- SÜRÜKLE & BIRAK ---
    const onDragStart = (e, jobId) => {
        // State güncellemesini erteleyerek ghost image sorununu çöz
        setTimeout(() => {
            setDraggedJobId(jobId);
        }, 0);
        
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", jobId);
    };

    const onDragEnd = (e) => {
        setDraggedJobId(null);
    };

    const onDragOver = (e) => { e.preventDefault(); };

    const onDrop = async (e, targetMachine) => {
        e.preventDefault();
        
        const droppedJobId = draggedJobId || e.dataTransfer.getData("text/plain");
        if (!droppedJobId) return;

        try {
            const jobRef = doc(db, CNC_LATHE_JOBS_COLLECTION, droppedJobId);
            await updateDoc(jobRef, {
                machine: targetMachine || '',
                // Eğer makineye atandıysa ASSIGNED, havuza atıldıysa PLANNED
                // Not: Eğer iş zaten RUNNING ise durumu değiştirmiyoruz, makinesi değişse bile çalışıyor kalsın mı?
                // Genelde çalışan iş taşınmaz ama taşınırsa ASSIGNED'a dönerse durmuş gibi olur.
                // Basitlik için: Makine varsa ASSIGNED yapıyoruz (Operatör tekrar başlatmalı).
                status: targetMachine ? 'ASSIGNED' : 'PLANNED' 
            });
        } catch (error) { console.error("Taşıma hatası:", error); }
        
        setDraggedJobId(null);
    };

    // --- FİLTRELER (GÜNCELLENDİ) ---
    
    // 1. ADIM: Tamamlanmış (COMPLETED) işleri listeden tamamen çıkar.
    // Sadece 'PLANNED', 'ASSIGNED' veya 'RUNNING' olanlar görünsün.
    const activeCncJobs = useMemo(() => {
        if(!cncJobs) return [];
        return cncJobs.filter(job => job.status !== 'COMPLETED');
    }, [cncJobs]);

    const unassignedJobs = activeCncJobs.filter(j => !j.machine || j.machine === '');
    const getJobsForMachine = (machineName) => activeCncJobs.filter(j => j.machine === machineName);
    
    const filteredParts = parts.filter(p => p.partName.toLowerCase().includes(searchTerm.toLowerCase()));

    // --- KART BİLEŞENİ ---
    const JobCard = ({ job }) => {
        const isRunning = job.status === 'RUNNING';

        return (
            <div 
                draggable
                onDragStart={(e) => onDragStart(e, job.id)}
                onDragEnd={onDragEnd}
                className={`select-none p-3 rounded-lg shadow-sm border mb-2 cursor-grab active:cursor-grabbing hover:shadow-md transition relative group
                    ${isRunning 
                        ? 'bg-green-50 border-green-500 dark:bg-green-900/20 dark:border-green-600 border-l-4' 
                        : 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600'
                    }
                `}
            >
                {/* Çalışıyor Göstergesi */}
                {isRunning && (
                    <div className="absolute -top-2 -right-2 bg-green-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center shadow-sm animate-pulse z-10">
                        <Activity className="w-3 h-3 mr-1" /> ÇALIŞIYOR
                    </div>
                )}

                {/* Üst Kısım: İsim ve Menü */}
                <div className="flex justify-between items-start">
                    <div className="flex items-center">
                        <GripVertical className={`w-4 h-4 mr-2 cursor-grab ${isRunning ? 'text-green-600' : 'text-gray-400'}`} />
                        <div>
                            <h4 className="font-bold text-gray-800 dark:text-white text-sm">{job.partName}</h4>
                            {job.cycleTime && (
                                <span className="text-[10px] text-gray-400 block">{job.cycleTime} sn/ad</span>
                            )}
                        </div>
                    </div>
                    
                    <div className="relative">
                        <button 
                            onClick={() => setActiveMenuJobId(activeMenuJobId === job.id ? null : job.id)}
                            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-white rounded-full hover:bg-gray-100 dark:hover:bg-gray-600 transition"
                        >
                            <MoreVertical className="w-4 h-4" />
                        </button>

                        {activeMenuJobId === job.id && (
                            <>
                                <div className="fixed inset-0 z-10" onClick={() => setActiveMenuJobId(null)}></div>
                                <div className="absolute right-0 top-6 z-20 w-32 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-xl overflow-hidden animate-in fade-in zoom-in duration-200">
                                    <button 
                                        onClick={() => startEditing(job)}
                                        className="w-full text-left px-4 py-2 text-xs text-gray-700 dark:text-gray-200 hover:bg-blue-50 dark:hover:bg-blue-900/30 flex items-center"
                                    >
                                        <Edit2 className="w-3 h-3 mr-2" /> Düzenle
                                    </button>
                                    <button 
                                        onClick={() => handleDeleteJob(job.id)}
                                        className="w-full text-left px-4 py-2 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 flex items-center"
                                    >
                                        <Trash2 className="w-3 h-3 mr-2" /> Sil
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
                
                {/* Orta Kısım: Adet ve Süre */}
                <div className="mt-3 flex justify-between items-center text-xs">
                    {editingJob?.id === job.id ? (
                        <div className="flex items-center space-x-1 animate-in fade-in">
                            <input 
                                type="number" 
                                className="w-16 p-1 border rounded text-xs text-center dark:bg-gray-600 dark:text-white"
                                value={editingJob.quantity}
                                onChange={(e) => setEditingJob({...editingJob, quantity: e.target.value})}
                                autoFocus
                            />
                            <button onClick={saveEdit} className="p-1 bg-green-500 text-white rounded"><Save className="w-3 h-3"/></button>
                            <button onClick={() => setEditingJob(null)} className="p-1 bg-gray-400 text-white rounded"><X className="w-3 h-3"/></button>
                        </div>
                    ) : (
                        <span className={`px-2 py-0.5 rounded font-mono font-bold ${isRunning ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'}`}>
                            {job.targetQuantity} Adet
                        </span>
                    )}

                    {job.estimatedTotalHours && (
                        <span className="flex items-center text-purple-600 dark:text-purple-400 font-semibold" title="Toplam Tahmini İşleme Süresi">
                            <Clock className="w-3 h-3 mr-1" /> {job.estimatedTotalHours} Saat
                        </span>
                    )}
                </div>

                {job.operatorNote && (
                    <div className="mt-2 text-[10px] text-gray-500 italic border-t border-dashed border-gray-200 dark:border-gray-600 pt-1">
                        "{job.operatorNote}"
                    </div>
                )}
            </div>
        );
    };

    const calculatedHours = useMemo(() => {
        if (!selectedPart?.cycleTime || !targetQuantity) return "0.0";
        const totalSec = parseFloat(selectedPart.cycleTime) * parseInt(targetQuantity);
        return (totalSec / 3600).toFixed(1);
    }, [selectedPart, targetQuantity]);

    return (
        <div className="p-6 h-[calc(100vh-80px)] flex flex-col md:flex-row gap-6 bg-gray-100 dark:bg-gray-900">
            
            {/* --- SOL KOLON: PLANLAMA HAVUZU --- */}
            <div className="w-full md:w-1/3 flex flex-col gap-4">
                
                {/* YENİ İŞ EKLEME BUTONU */}
                <button 
                    onClick={() => setIsModalOpen(true)}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white p-4 rounded-xl shadow-lg flex items-center justify-center transition transform hover:scale-[1.02] active:scale-95"
                >
                    <Plus className="w-6 h-6 mr-2" />
                    <div className="text-left">
                        <div className="font-bold text-lg">Yeni İş Emri Oluştur</div>
                        <div className="text-xs text-blue-200">Parça seçerek planlama havuzuna ekle</div>
                    </div>
                </button>

                {/* BEKLEYENLER LİSTESİ */}
                <div 
                    className="flex-1 bg-gray-200 dark:bg-gray-800/50 rounded-xl p-4 border-2 border-dashed border-gray-300 dark:border-gray-600 flex flex-col overflow-hidden"
                    onDragOver={onDragOver}
                    onDrop={(e) => onDrop(e, '')}
                >
                    <h3 className="font-bold text-gray-600 dark:text-gray-400 mb-3 flex items-center justify-between">
                        <span>PLANLANACAK İŞLER</span>
                        <span className="bg-gray-300 dark:bg-gray-700 text-xs px-2 py-1 rounded-full">{unassignedJobs.length}</span>
                    </h3>
                    <div className="overflow-y-auto flex-1 pr-2 space-y-2">
                        {unassignedJobs.length === 0 && (
                            <div className="flex flex-col items-center justify-center h-40 text-gray-400">
                                <Box className="w-10 h-10 mb-2 opacity-50" />
                                <p className="text-sm">Havuz boş.</p>
                            </div>
                        )}
                        {unassignedJobs.map(job => (
                            <JobCard key={job.id} job={job} />
                        ))}
                    </div>
                </div>
            </div>

            {/* --- SAĞ KOLON: TEZGAHLAR --- */}
            <div className="w-full md:w-2/3 grid grid-cols-1 sm:grid-cols-3 gap-4">
                {CNC_LATHE_MACHINES.map(machineName => {
                    const jobs = getJobsForMachine(machineName);
                    const machineTotalHours = jobs.reduce((acc, job) => acc + (parseFloat(job.estimatedTotalHours) || 0), 0);

                    return (
                        <div 
                            key={machineName}
                            className="bg-white dark:bg-gray-800 rounded-xl shadow border border-blue-100 dark:border-gray-700 flex flex-col overflow-hidden h-full"
                            onDragOver={onDragOver}
                            onDrop={(e) => onDrop(e, machineName)}
                        >
                            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border-b border-blue-100 dark:border-blue-900/30 flex justify-between items-center">
                                <div className="flex items-center">
                                    <Factory className="w-5 h-5 text-blue-600 mr-2" />
                                    <div>
                                        <h3 className="font-bold text-blue-900 dark:text-blue-100">{machineName}</h3>
                                        <div className="text-[10px] text-gray-500 dark:text-gray-400 font-mono">
                                            Yük: {machineTotalHours.toFixed(1)} Saat
                                        </div>
                                    </div>
                                </div>
                                <span className="text-xs font-bold bg-white dark:bg-gray-700 px-2 py-1 rounded border">
                                    {jobs.length} İş
                                </span>
                            </div>

                            <div className="flex-1 p-3 overflow-y-auto bg-gray-50/50 dark:bg-gray-900/20 min-h-[200px] space-y-2">
                                {jobs.length === 0 ? (
                                    <div className="h-full flex flex-col items-center justify-center text-gray-400 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg opacity-50">
                                        <p className="text-xs">İş Sürükleyin</p>
                                    </div>
                                ) : (
                                    jobs.map(job => (
                                        <JobCard key={job.id} job={job} />
                                    ))
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* --- MODAL: YENİ İŞ EKLEME --- */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
                        {/* Modal Header */}
                        <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900">
                            <h3 className="text-lg font-bold text-gray-800 dark:text-white flex items-center">
                                <Plus className="w-5 h-5 mr-2 text-blue-600" />
                                Yeni İş Emri
                            </h3>
                            <button onClick={resetForm} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full">
                                <X className="w-5 h-5 text-gray-500" />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="p-5 flex-1 overflow-y-auto space-y-5" style={{ minHeight: '300px' }}>
                            
                            {/* 1. Parça Seçimi - Dropdown */}
                            <div className="relative">
                                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Parça Seçimi</label>
                                <div className="relative">
                                    <Search className="absolute left-3 top-3 text-gray-400 w-4 h-4" />
                                    <input 
                                        type="text" 
                                        placeholder="Parça adı veya kodu ara..." 
                                        className="w-full pl-10 p-2.5 border rounded-lg bg-gray-50 dark:bg-gray-700 dark:text-white dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none"
                                        value={searchTerm}
                                        onFocus={() => setShowPartList(true)}
                                        onChange={(e) => {
                                            setSearchTerm(e.target.value);
                                            setSelectedPart(null); 
                                            setShowPartList(true); 
                                        }}
                                    />
                                </div>
                                
                                {/* AÇILIR LİSTE (Dropdown) */}
                                {showPartList && (
                                    <div className="absolute top-full left-0 right-0 mt-1 border border-gray-200 dark:border-gray-600 rounded-lg max-h-48 overflow-y-auto bg-white dark:bg-gray-800 shadow-xl z-50">
                                        {filteredParts.length === 0 ? (
                                            <p className="p-3 text-sm text-gray-400 text-center">Parça bulunamadı.</p>
                                        ) : (
                                            filteredParts.map(part => (
                                                <div 
                                                    key={part.id}
                                                    onClick={() => {
                                                        setSelectedPart(part);
                                                        setSearchTerm(part.partName); 
                                                        setShowPartList(false); 
                                                    }}
                                                    className={`p-2.5 text-sm cursor-pointer border-b last:border-0 hover:bg-blue-50 dark:hover:bg-gray-600 flex justify-between items-center transition ${selectedPart?.id === part.id ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-white font-bold' : 'text-gray-700 dark:text-gray-300 border-gray-100 dark:border-gray-700'}`}
                                                >
                                                    <span>{part.partName}</span>
                                                    {part.cycleTime && <span className="text-xs opacity-70 bg-white dark:bg-gray-700 px-1.5 py-0.5 rounded border">{part.cycleTime} sn</span>}
                                                </div>
                                            ))
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* 2. Adet ve Hesaplama */}
                            {selectedPart && (
                                <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-bottom-2">
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Sipariş Adeti</label>
                                        <input 
                                            type="number" 
                                            placeholder="Örn: 500" 
                                            className="w-full p-3 border-2 border-blue-100 dark:border-gray-600 rounded-lg text-lg font-bold text-center focus:border-blue-500 outline-none dark:bg-gray-700 dark:text-white"
                                            value={targetQuantity}
                                            onChange={(e) => setTargetQuantity(e.target.value)}
                                            autoFocus
                                        />
                                    </div>
                                    <div className="bg-purple-50 dark:bg-purple-900/20 p-3 rounded-lg border border-purple-100 dark:border-purple-800 flex flex-col justify-center items-center">
                                        <span className="text-xs text-purple-600 dark:text-purple-300 font-bold uppercase flex items-center">
                                            <Calculator className="w-3 h-3 mr-1" /> Toplam Süre
                                        </span>
                                        <span className="text-2xl font-black text-purple-700 dark:text-purple-200">
                                            {calculatedHours} <span className="text-sm font-normal">Saat</span>
                                        </span>
                                    </div>
                                </div>
                            )}

                            {/* 3. Not */}
                            <div>
                                <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">Operatör Notu (Opsiyonel)</label>
                                <input 
                                    type="text" 
                                    placeholder="Örn: Paketleme kasası mavi olacak..." 
                                    className="w-full p-2 border rounded-lg dark:bg-gray-700 dark:text-white dark:border-gray-600"
                                    value={operatorNote}
                                    onChange={(e) => setOperatorNote(e.target.value)}
                                />
                            </div>
                        </div>

                        {/* Modal Footer */}
                        <div className="p-4 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 flex justify-end gap-3">
                            <button 
                                onClick={resetForm}
                                className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition"
                            >
                                İptal
                            </button>
                            <button 
                                onClick={handleAddJob}
                                disabled={!selectedPart || !targetQuantity}
                                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center"
                            >
                                <Save className="w-4 h-4 mr-2" /> Kaydet ve Ekle
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};

export default CncLathePlanningPage;