// src/pages/CncLatheDashboard.js

import React, { useState, useEffect, useMemo } from 'react';
import { 
    Monitor, PlayCircle, StopCircle, Clock, 
    Ruler, CheckCircle, XCircle, Save, Search, ChevronDown, 
    Edit2, Calendar, FileText, X
} from 'lucide-react';
import { 
    collection, query, where, onSnapshot, addDoc, updateDoc, doc, getDoc, getDocs, orderBy 
} from '../config/firebase.js';
import { 
    CNC_LATHE_JOBS_COLLECTION, CNC_LATHE_MACHINES, 
    CNC_PARTS_COLLECTION, CNC_MEASUREMENTS_COLLECTION 
} from '../config/constants.js';
import { getCurrentDateTimeString, formatDateTime } from '../utils/dateUtils.js';

// --- BASİT MODAL BİLEŞENİ ---
const SimpleModal = ({ isOpen, onClose, title, children, maxWidth = "max-w-md" }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-in fade-in">
            <div className={`bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full ${maxWidth} border border-gray-200 dark:border-gray-700 max-h-[95vh] flex flex-col`}>
                <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900 rounded-t-xl shrink-0">
                    <h3 className="text-lg font-bold text-gray-800 dark:text-white flex items-center">
                        {title}
                    </h3>
                    <button onClick={onClose} className="text-gray-500 hover:text-red-500 font-bold text-2xl">&times;</button>
                </div>
                <div className="p-6 overflow-y-auto overflow-x-hidden flex-1">{children}</div>
            </div>
        </div>
    );
};

// --- YARDIMCI: VİRGÜL/NOKTA DÖNÜŞTÜRÜCÜ ---
const parseInputFloat = (value) => {
    if (value === '' || value === null || value === undefined) return NaN;
    const sanitized = value.toString().replace(',', '.');
    return parseFloat(sanitized);
};

const CncLatheDashboard = ({ db, loggedInUser, cncJobs }) => { 
    const [activeJobs, setActiveJobs] = useState([]); 
    const [parts, setParts] = useState([]); 
    
    // Modals
    const [isStartModalOpen, setIsStartModalOpen] = useState(false);
    const [isFinishModalOpen, setIsFinishModalOpen] = useState(false);
    const [isMeasureModalOpen, setIsMeasureModalOpen] = useState(false);
    const [isEditJobModalOpen, setIsEditJobModalOpen] = useState(false); 

    const [selectedMachine, setSelectedMachine] = useState(null);
    const [selectedJob, setSelectedJob] = useState(null);
    const [activeCriteria, setActiveCriteria] = useState([]); 

    // Forms
    const [startFormData, setStartFormData] = useState({ 
        orderNumber: '', selectedPartId: '', targetQuantity: '', plannedJobId: null
    });
    const [editFormData, setEditFormData] = useState({ orderNumber: '', targetQuantity: '' });
    const [producedQuantity, setProducedQuantity] = useState('');

    // Dropdown
    const [partSearchTerm, setPartSearchTerm] = useState('');
    const [isPartDropdownOpen, setIsPartDropdownOpen] = useState(false);
    
    // YENİ FORM STATE'İ (12 Sütunlu Rapor için)
    const [gridData, setGridData] = useState(Array(12).fill(null).map(() => ({ details: [], operator: '' })));
    const [savingForm, setSavingForm] = useState(false);

    useEffect(() => {
        if (!db) return;
        const qActive = query(collection(db, CNC_LATHE_JOBS_COLLECTION), where('status', '==', 'RUNNING'));
        const unsubActive = onSnapshot(qActive, (snapshot) => {
            setActiveJobs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });

        const qParts = query(collection(db, CNC_PARTS_COLLECTION));
        const unsubParts = onSnapshot(qParts, (snapshot) => {
            const partList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            partList.sort((a, b) => a.partName.localeCompare(b.partName));
            setParts(partList);
        });

        return () => { unsubActive(); unsubParts(); };
    }, [db]);

    const getPlannedJobsForMachine = (machineName) => {
        if (!cncJobs) return [];
        return cncJobs.filter(job => job.machine === machineName && job.status === 'ASSIGNED');
    };

    // --- İŞLEMLER ---

    const handleOpenStartModal = (machine) => {
        setSelectedMachine(machine);
        setStartFormData({ orderNumber: '', selectedPartId: '', targetQuantity: '', plannedJobId: null });
        setPartSearchTerm('');
        setIsPartDropdownOpen(false);
        setIsStartModalOpen(true);
    };

    const handleSelectPlannedJob = (plannedJob) => {
        setStartFormData({
            orderNumber: plannedJob.orderNumber || '', 
            selectedPartId: plannedJob.partId || '', 
            targetQuantity: plannedJob.targetQuantity || '',
            plannedJobId: plannedJob.id
        });
        setPartSearchTerm(plannedJob.partName || '');
        if (!plannedJob.partId) {
            const matchingPart = parts.find(p => p.partName === plannedJob.partName);
            if (matchingPart) setStartFormData(prev => ({ ...prev, selectedPartId: matchingPart.id }));
        }
    };

    const handleSelectPart = (part) => {
        setStartFormData({ ...startFormData, selectedPartId: part.id });
        setPartSearchTerm(part.partName); 
        setIsPartDropdownOpen(false); 
    };

    const handleStartJob = async () => {
        if (!startFormData.selectedPartId) return alert("Lütfen bir parça seçiniz.");
        const selectedPart = parts.find(p => p.id === startFormData.selectedPartId);
        if (!selectedPart) return alert("Parça bulunamadı.");

        try {
            if (startFormData.orderNumber) {
                const qCheck = query(
                    collection(db, CNC_LATHE_JOBS_COLLECTION), 
                    where('orderNumber', '==', startFormData.orderNumber),
                    where('status', '==', 'RUNNING') 
                );
                const checkSnapshot = await getDocs(qCheck);
                if (!checkSnapshot.empty) {
                    alert(`HATA: "${startFormData.orderNumber}" numaralı iş emri şu an başka bir tezgahta çalışıyor!`);
                    return;
                }
            }

            const newJobData = {
                machine: selectedMachine,
                orderNumber: startFormData.orderNumber || 'Plansız',
                partName: selectedPart.partName, 
                partId: selectedPart.id,         
                targetQuantity: parseInt(startFormData.targetQuantity) || 0,
                startTime: getCurrentDateTimeString(),
                operator: loggedInUser.name,
                status: 'RUNNING'
            };

            if (startFormData.plannedJobId) {
                await updateDoc(doc(db, CNC_LATHE_JOBS_COLLECTION, startFormData.plannedJobId), {
                    ...newJobData,
                    operator: loggedInUser.name 
                });
            } else {
                await addDoc(collection(db, CNC_LATHE_JOBS_COLLECTION), newJobData);
            }

            setIsStartModalOpen(false);
        } catch (error) { 
            console.error("Hata:", error); 
            alert("İş başlatılamadı. Bağlantınızı kontrol ediniz."); 
        }
    };

    const handleOpenEditJobModal = (job) => {
        setSelectedJob(job);
        setEditFormData({
            orderNumber: job.orderNumber || '',
            targetQuantity: job.targetQuantity || ''
        });
        setIsEditJobModalOpen(true);
    };

    const handleSaveJobEdit = async () => {
        if (!selectedJob) return;
        try {
            await updateDoc(doc(db, CNC_LATHE_JOBS_COLLECTION, selectedJob.id), {
                orderNumber: editFormData.orderNumber,
                targetQuantity: parseInt(editFormData.targetQuantity) || 0
            });
            setIsEditJobModalOpen(false);
        } catch (error) {
            console.error("Güncelleme hatası:", error);
            alert("Güncellenemedi.");
        }
    };

    const handleOpenFinishModal = (job) => {
        setSelectedJob(job);
        setProducedQuantity(job.targetQuantity); 
        setIsFinishModalOpen(true);
    };

    const handleFinishJob = async () => {
        if (!selectedJob) return;
        try {
            const endTime = getCurrentDateTimeString();
            const start = new Date(selectedJob.startTime);
            const end = new Date(endTime);
            const durationMinutes = Math.floor((end - start) / 60000);

            await updateDoc(doc(db, CNC_LATHE_JOBS_COLLECTION, selectedJob.id), {
                status: 'COMPLETED',
                endTime: endTime,
                producedQuantity: parseInt(producedQuantity) || 0,
                durationMinutes: durationMinutes
            });

            setIsFinishModalOpen(false);
        } catch (error) { console.error("Hata:", error); }
    };


    // --- YENİ: BÜYÜK ÖLÇÜM FORMU MANTIĞI ---
    const handleOpenMeasureModal = async (job) => {
        setSelectedJob(job);
        
        let partIdToFetch = job.partId;
        if (!partIdToFetch) {
            const foundPart = parts.find(p => p.partName === job.partName);
            if (foundPart) partIdToFetch = foundPart.id;
            else return alert("Bu iş kaydında Parça bulunamadı.");
        }

        try {
            // 1. Kriterleri Çek
            const partRef = doc(db, CNC_PARTS_COLLECTION, partIdToFetch);
            const partSnap = await getDoc(partRef);
            if (partSnap.exists() && partSnap.data().criteria) {
                setActiveCriteria(partSnap.data().criteria);
            } else {
                return alert("Bu parça için henüz ölçüm kriteri tanımlanmamış.");
            }

            // 2. Geçmiş Ölçümleri (Formu) Çek
            const mQuery = query(
                collection(db, CNC_MEASUREMENTS_COLLECTION), 
                where('jobId', '==', job.id),
                orderBy('timestamp', 'asc')
            );
            const mSnap = await getDocs(mQuery);
            const measurements = mSnap.docs.map(d => ({ id: d.id, ...d.data() }));

            // 12'li Sabit Tabloyu Doldur
            const newGrid = Array(12).fill(null).map(() => ({ details: [], operator: loggedInUser.name })); // Varsayılan operator ismi
            
            let unassignedIdx = 0;
            measurements.forEach(m => {
                if (m.columnIndex !== undefined && m.columnIndex >= 0 && m.columnIndex < 12) {
                    newGrid[m.columnIndex] = m;
                } else {
                    while (unassignedIdx < 12 && newGrid[unassignedIdx].id) unassignedIdx++;
                    if (unassignedIdx < 12) {
                        newGrid[unassignedIdx] = m;
                        unassignedIdx++;
                    }
                }
            });
            setGridData(newGrid);
            setIsMeasureModalOpen(true);

        } catch (error) {
            console.error("Form verileri çekilirken hata:", error);
            alert("Hata oluştu.");
        }
    };

    // Form Hücre Değişiklikleri
    const handleOperatorChange = (colIndex, value) => {
        const newGrid = [...gridData];
        newGrid[colIndex].operator = value;
        setGridData(newGrid);
    };

    const handleCellChange = (colIndex, critId, value, type) => {
        const newGrid = [...gridData];
        let details = newGrid[colIndex].details || [];
        const existingIdx = details.findIndex(d => d.criterionId === critId);
        
        let finalValue = value;
        if (type === 'BOOL') {
            finalValue = value === 'OK' ? 1 : (value === 'RET' ? 0 : '');
        }

        if (existingIdx >= 0) {
            details[existingIdx].value = finalValue;
        } else {
            details.push({ criterionId: critId, type, value: finalValue });
        }
        
        newGrid[colIndex].details = details;
        setGridData(newGrid);
    };

    const handleSaveBigForm = async () => {
        if (!selectedJob) return;
        setSavingForm(true);
        try {
            for (let i = 0; i < 12; i++) {
                const colData = gridData[i];
                const hasData = colData.operator?.trim().length > 0 || colData.details?.some(d => d.value !== '');
                
                if (hasData) {
                    const docData = {
                        jobId: selectedJob.id,
                        columnIndex: i, 
                        operator: colData.operator || '',
                        details: colData.details || [],
                        timestamp: colData.timestamp || Date.now() + i
                    };

                    if (colData.id) {
                        await updateDoc(doc(db, CNC_MEASUREMENTS_COLLECTION, colData.id), docData);
                    } else {
                        await addDoc(collection(db, CNC_MEASUREMENTS_COLLECTION), docData);
                    }
                }
            }
            alert("Ölçümler başarıyla kaydedildi!");
            setIsMeasureModalOpen(false);
        } catch (error) {
            console.error("Kaydetme hatası:", error);
            alert("Kaydetme sırasında hata oluştu.");
        } finally {
            setSavingForm(false);
        }
    };

    const calculateDuration = (startTime) => {
        const start = new Date(startTime);
        const now = new Date();
        const diffMs = now - start;
        const hours = Math.floor(diffMs / 3600000);
        const minutes = Math.floor((diffMs % 3600000) / 60000);
        return `${hours}s ${minutes}dk`;
    };

    const filteredParts = parts.filter(part => 
        part.partName.toLowerCase().includes(partSearchTerm.toLowerCase()) ||
        (part.orderNumber && part.orderNumber.toLowerCase().includes(partSearchTerm.toLowerCase()))
    );

    const tableHeaders = [
        { title: "SERİ BAŞ.\nONAYI", bg: "bg-yellow-50 dark:bg-yellow-900/20", index: 0, width: "w-16" },
        ...Array.from({ length: 10 }).map((_, i) => ({ title: `${i + 1}.\nKONTROL`, bg: "bg-white dark:bg-gray-800", index: i + 1, width: "w-14" })),
        { title: "SERİ SONU\nKONTROL", bg: "bg-green-50 dark:bg-green-900/20", index: 11, width: "w-16" }
    ];

    return (
        <div className="p-4 sm:p-8 min-h-screen bg-gray-100 dark:bg-gray-900 font-sans">
            
            <div className="mb-8 flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-extrabold text-gray-900 dark:text-white flex items-center">
                        <Monitor className="w-8 h-8 mr-3 text-orange-600" />
                        CNC Torna Takip Ekranı
                    </h1>
                    <p className="text-gray-500 dark:text-gray-400 mt-1">
                        Seri imalat tezgahlarının anlık durumları ve iş girişleri.
                    </p>
                </div>
                <div className="text-right">
                    <span className="text-sm font-bold text-gray-500 dark:text-gray-400 block">Operatör</span>
                    <span className="text-lg font-bold text-gray-900 dark:text-white">{loggedInUser.name}</span>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {CNC_LATHE_MACHINES.map(machine => {
                    const activeJob = activeJobs.find(job => job.machine === machine);

                    return (
                        <div key={machine} className={`relative rounded-2xl border-2 overflow-hidden shadow-lg transition-all flex flex-col ${
                            activeJob 
                            ? 'bg-white dark:bg-gray-800 border-yellow-400 dark:border-yellow-600' 
                            : 'bg-white dark:bg-gray-800 border-green-500 dark:border-green-600'
                        }`}>
                            <div className={`p-3 text-center font-bold text-white uppercase tracking-wider text-sm ${
                                activeJob ? 'bg-yellow-500 animate-pulse' : 'bg-green-600'
                            }`}>
                                {activeJob ? '⚡ ÇALIŞIYOR' : '✓ BOŞTA / HAZIR'}
                            </div>

                            <div className="p-6 flex flex-col h-auto min-h-[300px] justify-between">
                                <div className="text-center border-b border-gray-100 dark:border-gray-700 pb-4 mb-4 relative">
                                    <h2 className="text-4xl font-black text-gray-800 dark:text-white">{machine}</h2>
                                    <p className="text-xs text-gray-400">CNC TORNA</p>
                                    
                                    {activeJob && (
                                        <button 
                                            onClick={() => handleOpenEditJobModal(activeJob)}
                                            className="absolute top-0 right-0 p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-full transition"
                                        >
                                            <Edit2 className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>

                                {activeJob ? (
                                    <>
                                        <div className="space-y-4 flex-1">
                                            <div>
                                                <span className="text-xs font-bold text-gray-400 uppercase">İŞ EMRİ / PARÇA</span>
                                                <div className="font-mono font-bold text-xl text-gray-900 dark:text-white">{activeJob.orderNumber || '---'}</div>
                                                <div className="text-sm font-bold text-gray-600 dark:text-gray-300 truncate">{activeJob.partName}</div>
                                            </div>
                                            
                                            <div className="flex justify-between bg-gray-50 dark:bg-gray-700/50 p-3 rounded-lg">
                                                <div>
                                                    <span className="text-[10px] text-gray-400 block uppercase">HEDEF</span>
                                                    <span className="font-bold text-gray-700 dark:text-gray-200">{activeJob.targetQuantity} Adet</span>
                                                </div>
                                                <div className="text-right">
                                                    <span className="text-[10px] text-gray-400 block uppercase">SÜRE</span>
                                                    <span className="font-bold text-yellow-600 dark:text-yellow-400 flex items-center">
                                                        <Clock className="w-3 h-3 mr-1"/>
                                                        {calculateDuration(activeJob.startTime)}
                                                    </span>
                                                </div>
                                            </div>

                                            <button 
                                                onClick={() => handleOpenMeasureModal(activeJob)}
                                                className="w-full py-3 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-700 rounded-lg font-bold flex items-center justify-center hover:bg-blue-200 dark:hover:bg-blue-900/50 transition shadow-sm"
                                            >
                                                <FileText className="w-5 h-5 mr-2" /> ÖLÇÜM FORMU
                                            </button>

                                            <div className="text-xs text-center text-gray-400 pt-1">
                                                Op: <span className="text-gray-600 dark:text-gray-300 font-bold">{activeJob.operator}</span>
                                            </div>
                                        </div>

                                        <button 
                                            onClick={() => handleOpenFinishModal(activeJob)}
                                            className="mt-4 w-full py-4 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg shadow-md flex items-center justify-center transition transform active:scale-95"
                                        >
                                            <StopCircle className="w-6 h-6 mr-2" /> İŞİ BİTİR
                                        </button>
                                    </>
                                ) : (
                                    <div className="flex flex-col items-center justify-center h-full text-gray-400 py-4">
                                        <PlayCircle className="w-20 h-20 mb-4 text-green-200 dark:text-gray-700" />
                                        <p className="text-sm mb-6 font-medium">Tezgah şu an boşta.</p>
                                        <button 
                                            onClick={() => handleOpenStartModal(machine)}
                                            className="w-full py-4 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg shadow-md flex items-center justify-center transition transform active:scale-95"
                                        >
                                            <PlayCircle className="w-6 h-6 mr-2" /> YENİ İŞ BAŞLAT
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* MODALS */}
            <SimpleModal isOpen={isStartModalOpen} onClose={() => setIsStartModalOpen(false)} title={`Yeni İş Başlat - ${selectedMachine}`} maxWidth="max-w-2xl">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="border-r border-gray-200 dark:border-gray-700 pr-6">
                        <h4 className="text-sm font-bold text-gray-500 mb-3 flex items-center">
                            <Calendar className="w-4 h-4 mr-2"/> Planlanan İşler (Havuz)
                        </h4>
                        <div className="space-y-2 max-h-60 overflow-y-auto">
                            {getPlannedJobsForMachine(selectedMachine).length === 0 ? (
                                <p className="text-xs text-gray-400 italic">Bu tezgah için planlanmış iş yok.</p>
                            ) : (
                                getPlannedJobsForMachine(selectedMachine).map(job => (
                                    <div 
                                        key={job.id}
                                        onClick={() => handleSelectPlannedJob(job)}
                                        className={`p-3 border rounded-lg cursor-pointer transition hover:bg-blue-50 dark:hover:bg-gray-700 ${startFormData.plannedJobId === job.id ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-700'}`}
                                    >
                                        <div className="font-bold text-gray-800 dark:text-white text-sm">{job.partName}</div>
                                        <div className="flex justify-between mt-1 text-xs text-gray-500">
                                            <span>{job.orderNumber || 'No Yok'}</span>
                                            <span className="font-bold">{job.targetQuantity} Adet</span>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">İş Emri Numarası</label>
                            <input type="text" className="w-full p-3 border rounded-lg bg-gray-50 dark:bg-gray-700 dark:text-white outline-none focus:ring-2 focus:ring-blue-500" value={startFormData.orderNumber} onChange={e => setStartFormData({...startFormData, orderNumber: e.target.value})} placeholder="Örn: 2024-105 (Opsiyonel)" />
                        </div>
                        <div className="relative">
                            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Parça Seçimi</label>
                            <div className="relative">
                                <input type="text" className="w-full p-3 pl-10 border rounded-lg bg-gray-50 dark:bg-gray-700 dark:text-white outline-none focus:ring-2 focus:ring-blue-500" placeholder="Parça adı veya kodu yazın..." value={partSearchTerm} onChange={(e) => { setPartSearchTerm(e.target.value); setIsPartDropdownOpen(true); if(e.target.value === '') setStartFormData(prev => ({...prev, selectedPartId: ''})); }} onClick={() => setIsPartDropdownOpen(true)} />
                                <Search className="absolute left-3 top-3.5 text-gray-400 w-5 h-5" />
                                <ChevronDown className="absolute right-3 top-3.5 text-gray-400 w-5 h-5 cursor-pointer hover:text-gray-600" onClick={() => setIsPartDropdownOpen(!isPartDropdownOpen)} />
                            </div>
                            {isPartDropdownOpen && (
                                <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl max-h-60 overflow-y-auto">
                                    {filteredParts.length > 0 ? (
                                        filteredParts.map(part => (
                                            <div key={part.id} onClick={() => handleSelectPart(part)} className="p-3 hover:bg-blue-50 dark:hover:bg-blue-900/30 cursor-pointer border-b border-gray-100 dark:border-gray-700 last:border-0">
                                                <div className="font-bold text-gray-800 dark:text-white">{part.partName}</div>
                                                {part.orderNumber && <div className="text-xs text-gray-500">{part.orderNumber}</div>}
                                            </div>
                                        ))
                                    ) : ( <div className="p-4 text-center text-gray-500 text-sm">Sonuç bulunamadı.</div> )}
                                </div>
                            )}
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Hedeflenen Adet</label>
                            <input type="number" className="w-full p-3 border rounded-lg bg-gray-50 dark:bg-gray-700 dark:text-white outline-none focus:ring-2 focus:ring-blue-500" value={startFormData.targetQuantity} onChange={e => setStartFormData({...startFormData, targetQuantity: e.target.value})} placeholder="Örn: 500" />
                        </div>
                        <button onClick={handleStartJob} className="w-full py-3 mt-4 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg shadow-lg transform active:scale-95 transition">BAŞLAT</button>
                    </div>
                </div>
            </SimpleModal>

            <SimpleModal isOpen={isEditJobModalOpen} onClose={() => setIsEditJobModalOpen(false)} title="İş Bilgilerini Düzenle">
                <div className="space-y-4">
                    <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded text-sm text-blue-800 dark:text-blue-200"><strong>Parça:</strong> {selectedJob?.partName}</div>
                    <div><label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">İş Emri Numarası</label><input type="text" className="w-full p-3 border rounded-lg bg-white dark:bg-gray-700 dark:text-white" value={editFormData.orderNumber} onChange={e => setEditFormData({...editFormData, orderNumber: e.target.value})} /></div>
                    <div><label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Hedeflenen Adet</label><input type="number" className="w-full p-3 border rounded-lg bg-white dark:bg-gray-700 dark:text-white" value={editFormData.targetQuantity} onChange={e => setEditFormData({...editFormData, targetQuantity: e.target.value})} /></div>
                    <button onClick={handleSaveJobEdit} className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-lg">GÜNCELLE</button>
                </div>
            </SimpleModal>

            <SimpleModal isOpen={isFinishModalOpen} onClose={() => setIsFinishModalOpen(false)} title="İşi Sonlandır">
                <div className="space-y-4">
                    <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-lg border border-yellow-100 dark:border-yellow-800 text-center"><div className="text-sm text-yellow-800 dark:text-yellow-200">İş Emri</div><div className="text-xl font-black text-gray-900 dark:text-white">{selectedJob?.orderNumber || '---'}</div><div className="text-sm text-gray-500 mt-1">{selectedJob?.partName}</div></div>
                    <div><label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Üretilen Toplam Adet</label><input type="number" className="w-full p-4 text-center text-2xl font-bold border-2 border-green-500 rounded-lg bg-white dark:bg-gray-700 dark:text-white" value={producedQuantity} onChange={e => setProducedQuantity(e.target.value)} /></div>
                    <button onClick={handleFinishJob} className="w-full py-3 mt-4 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg shadow-lg">KAYDET VE BİTİR</button>
                </div>
            </SimpleModal>

            {/* --- YENİ BÜYÜK ÖLÇÜM MODALI (12 SÜTUNLU FORM) --- */}
            <SimpleModal isOpen={isMeasureModalOpen} onClose={() => setIsMeasureModalOpen(false)} title="Talaşlı İmalat Kontrol Formu" maxWidth="max-w-[95vw] lg:max-w-[1200px]">
                <div className="bg-white dark:bg-gray-800 rounded-lg">
                    
                    {/* Üst Bilgi Başlığı */}
                    <div className="flex justify-between items-end mb-4 border-b border-gray-200 dark:border-gray-700 pb-4">
                        <div>
                            <div className="text-2xl font-black text-gray-800 dark:text-white">{selectedJob?.partName}</div>
                            <div className="text-sm text-gray-500 font-bold mt-1">İş Emri: {selectedJob?.orderNumber || 'Yok'} | Makine: {selectedJob?.machine}</div>
                        </div>
                        <div className="text-right">
                            <button 
                                onClick={handleSaveBigForm} 
                                disabled={savingForm}
                                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-lg flex items-center transition transform active:scale-95 disabled:opacity-50"
                            >
                                <Save className="w-5 h-5 mr-2" /> {savingForm ? 'KAYDEDİLİYOR...' : 'FORMA İŞLE'}
                            </button>
                        </div>
                    </div>

                    {/* Geniş Tablo Alanı */}
                    <div className="overflow-x-auto pb-4">
                        <table className="w-full border-collapse border border-gray-300 dark:border-gray-600 text-center text-xs">
                            <thead>
                                <tr className="bg-gray-100 dark:bg-gray-700">
                                    <th className="border border-gray-300 dark:border-gray-600 p-2 w-10 text-gray-700 dark:text-gray-300">NO</th>
                                    <th className="border border-gray-300 dark:border-gray-600 p-2 text-left text-gray-700 dark:text-gray-300">KONTROL KRİTERİ (Nominal / Tol)</th>
                                    <th className="border border-gray-300 dark:border-gray-600 p-2 w-20 text-gray-700 dark:text-gray-300">METOT</th>
                                    
                                    {tableHeaders.map((col) => (
                                        <th key={col.index} className={`border border-gray-300 dark:border-gray-600 p-2 align-top ${col.width} ${col.bg}`}>
                                            <div className="font-bold border-b border-gray-300 dark:border-gray-500 pb-1 mb-1 text-[10px] whitespace-pre-line text-gray-800 dark:text-gray-200">
                                                {col.title}
                                            </div>
                                            <input 
                                                type="text" 
                                                placeholder="OPR."
                                                className="text-[9px] font-black text-blue-600 dark:text-blue-400 uppercase bg-transparent border-none w-full text-center outline-none focus:bg-yellow-100 dark:focus:bg-gray-600 placeholder-gray-400"
                                                value={gridData[col.index]?.operator || ''}
                                                onChange={(e) => handleOperatorChange(col.index, e.target.value)}
                                            />
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {activeCriteria.map((crit, idx) => (
                                    <tr key={crit.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                                        <td className="border border-gray-300 dark:border-gray-600 p-2 font-bold text-gray-600 dark:text-gray-400">{idx + 1}</td>
                                        <td className="border border-gray-300 dark:border-gray-600 p-2 text-left px-3">
                                            <span className="font-bold text-sm text-gray-800 dark:text-white block">{crit.name}</span>
                                            {crit.type !== 'BOOL' && (
                                                <span className="text-[10px] text-gray-500 dark:text-gray-400">
                                                    {crit.nominal} (+{crit.upperTol} / -{Math.abs(crit.lowerTol)})
                                                </span>
                                            )}
                                        </td>
                                        <td className="border border-gray-300 dark:border-gray-600 p-2 font-bold uppercase text-blue-600 dark:text-blue-400 text-[10px]">
                                            {crit.method || '-'}
                                        </td>
                                        
                                        {tableHeaders.map((col) => {
                                            const detail = gridData[col.index]?.details?.find(d => d.criterionId === crit.id);
                                            let val = detail ? detail.value : '';
                                            let textClass = 'text-gray-900 dark:text-white'; 

                                            if (val !== '') {
                                                if (crit.type === 'BOOL') {
                                                    val = val === 1 ? 'OK' : (val === 0 ? 'RET' : '');
                                                    textClass = val === 'OK' ? 'text-green-600 font-bold' : 'text-red-600 font-extrabold';
                                                } else {
                                                    const numVal = parseFloat(val.toString().replace(',', '.'));
                                                    const nom = parseFloat(crit.nominal);
                                                    const upper = parseFloat(crit.upperTol);
                                                    const lower = parseFloat(crit.lowerTol);
                                                    if (numVal > (nom + upper) || numVal < (nom - Math.abs(lower))) {
                                                        textClass = 'text-red-500 font-extrabold';
                                                    } else {
                                                        textClass = 'font-bold text-gray-900 dark:text-white';
                                                    }
                                                }
                                            }

                                            return (
                                                <td key={col.index} className={`border border-gray-300 dark:border-gray-600 p-0 h-10 align-middle ${col.bg}`}>
                                                    {crit.type === 'BOOL' ? (
                                                        <select 
                                                            className={`w-full h-full bg-transparent border-none text-center outline-none cursor-pointer text-xs font-bold ${textClass}`}
                                                            value={val}
                                                            onChange={(e) => handleCellChange(col.index, crit.id, e.target.value, 'BOOL')}
                                                        >
                                                            <option value=""></option>
                                                            <option value="OK">OK</option>
                                                            <option value="RET">RET</option>
                                                        </select>
                                                    ) : (
                                                        <input 
                                                            type="text"
                                                            className={`w-full h-full bg-transparent border-none text-center outline-none focus:bg-yellow-100 dark:focus:bg-gray-600 text-sm ${textClass}`}
                                                            value={val}
                                                            onChange={(e) => handleCellChange(col.index, crit.id, e.target.value, 'NUMBER')}
                                                        />
                                                    )}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </SimpleModal>

        </div>
    );
};

export default CncLatheDashboard;