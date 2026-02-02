// src/pages/CncLatheDashboard.js

import React, { useState, useEffect } from 'react';
import { 
    Monitor, PlayCircle, StopCircle, Clock, 
    Ruler, CheckCircle, XCircle, AlertTriangle, Save, ThumbsUp, ThumbsDown
} from 'lucide-react';
import { 
    collection, query, where, onSnapshot, addDoc, updateDoc, doc, getDoc
} from '../config/firebase.js';
import { 
    CNC_LATHE_JOBS_COLLECTION, CNC_LATHE_MACHINES, 
    CNC_PARTS_COLLECTION, CNC_MEASUREMENTS_COLLECTION 
} from '../config/constants.js';
import { getCurrentDateTimeString } from '../utils/dateUtils.js';

// --- BASİT MODAL BİLEŞENİ ---
const SimpleModal = ({ isOpen, onClose, title, children, maxWidth = "max-w-md" }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-in fade-in">
            <div className={`bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full ${maxWidth} border border-gray-200 dark:border-gray-700 max-h-[90vh] flex flex-col`}>
                <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900 rounded-t-xl shrink-0">
                    <h3 className="text-lg font-bold text-gray-800 dark:text-white">{title}</h3>
                    <button onClick={onClose} className="text-gray-500 hover:text-red-500 font-bold text-xl">&times;</button>
                </div>
                <div className="p-6 overflow-y-auto">{children}</div>
            </div>
        </div>
    );
};

// --- YARDIMCI: VİRGÜL/NOKTA DÖNÜŞTÜRÜCÜ ---
const parseInputFloat = (value) => {
    if (value === '' || value === null || value === undefined) return NaN;
    // Virgülü noktaya çevirip sayıya dönüştür
    const sanitized = value.toString().replace(',', '.');
    return parseFloat(sanitized);
};

const CncLatheDashboard = ({ db, loggedInUser }) => {
    const [activeJobs, setActiveJobs] = useState([]); 
    const [parts, setParts] = useState([]); 
    
    // Modals
    const [isStartModalOpen, setIsStartModalOpen] = useState(false);
    const [isFinishModalOpen, setIsFinishModalOpen] = useState(false);
    const [isMeasureModalOpen, setIsMeasureModalOpen] = useState(false);

    const [selectedMachine, setSelectedMachine] = useState(null);
    const [selectedJob, setSelectedJob] = useState(null);
    const [activeCriteria, setActiveCriteria] = useState([]); 

    // Forms
    const [startFormData, setStartFormData] = useState({ orderNumber: '', selectedPartId: '', targetQuantity: '' });
    const [producedQuantity, setProducedQuantity] = useState('');
    const [measurementValues, setMeasurementValues] = useState({}); // { id: deger }

    useEffect(() => {
        if (!db) return;
        
        // Aktif İşler
        const qActive = query(collection(db, CNC_LATHE_JOBS_COLLECTION), where('status', '==', 'RUNNING'));
        const unsubActive = onSnapshot(qActive, (snapshot) => {
            const jobs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setActiveJobs(jobs);
        });

        // Parça Listesi
        const qParts = query(collection(db, CNC_PARTS_COLLECTION));
        const unsubParts = onSnapshot(qParts, (snapshot) => {
            const partList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            partList.sort((a, b) => a.partName.localeCompare(b.partName));
            setParts(partList);
        });

        return () => { unsubActive(); unsubParts(); };
    }, [db]);

    // --- İŞLEMLER ---

    const handleOpenStartModal = (machine) => {
        setSelectedMachine(machine);
        setStartFormData({ orderNumber: '', selectedPartId: '', targetQuantity: '' });
        setIsStartModalOpen(true);
    };

    const handleStartJob = async () => {
        if (!startFormData.orderNumber || !startFormData.selectedPartId) return alert("Lütfen iş emri ve parça seçiniz.");
        const selectedPart = parts.find(p => p.id === startFormData.selectedPartId);
        if (!selectedPart) return alert("Parça bulunamadı.");

        try {
            await addDoc(collection(db, CNC_LATHE_JOBS_COLLECTION), {
                machine: selectedMachine,
                orderNumber: startFormData.orderNumber,
                partName: selectedPart.partName, 
                partId: selectedPart.id,         
                targetQuantity: parseInt(startFormData.targetQuantity) || 0,
                startTime: getCurrentDateTimeString(),
                operator: loggedInUser.name,
                status: 'RUNNING'
            });
            setIsStartModalOpen(false);
        } catch (error) { console.error("Hata:", error); alert("Başlatılamadı."); }
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

    // --- ÖLÇÜM ALMA ---
    const handleOpenMeasureModal = async (job) => {
        setSelectedJob(job);
        setMeasurementValues({});
        setActiveCriteria([]); 

        if (!job.partId) {
            alert("Bu iş kaydında Parça ID bulunamadı.");
            return;
        }

        try {
            const partRef = doc(db, CNC_PARTS_COLLECTION, job.partId);
            const partSnap = await getDoc(partRef);
            
            if (partSnap.exists()) {
                const partData = partSnap.data();
                if (partData.criteria && partData.criteria.length > 0) {
                    setActiveCriteria(partData.criteria);
                    setIsMeasureModalOpen(true);
                } else {
                    alert("Bu parça için henüz ölçüm kriteri tanımlanmamış.");
                }
            } else {
                alert("Parça veritabanında bulunamadı.");
            }
        } catch (error) {
            console.error("Kriter çekme hatası:", error);
            alert("Hata oluştu.");
        }
    };

    const handleSaveMeasurement = async () => {
        if (!selectedJob || activeCriteria.length === 0) return;

        let overallResult = 'PASS';
        const measurementsToSave = activeCriteria.map(crit => {
            const isBool = crit.type === 'BOOL';
            const rawValue = measurementValues[crit.id];
            
            let status = 'SKIP';
            let finalValue = null;

            if (isBool) {
                // 'OK' ise 1, 'RET' ise 0
                if (rawValue === 'OK') {
                    finalValue = 1;
                    status = 'PASS';
                } else if (rawValue === 'RET') {
                    finalValue = 0;
                    status = 'FAIL';
                    overallResult = 'FAIL';
                } else {
                    status = 'SKIP';
                }
            } else {
                // Sayısal
                if (rawValue !== undefined && rawValue !== '') {
                    const val = parseInputFloat(rawValue);
                    finalValue = val;
                    if (!isNaN(val)) {
                        const nominal = parseInputFloat(crit.nominal);
                        // Alt tolerans her zaman çıkarılır
                        const min = nominal - Math.abs(parseInputFloat(crit.lowerTol));
                        const max = nominal + Math.abs(parseInputFloat(crit.upperTol));
                        
                        if (val >= min && val <= max) status = 'PASS';
                        else {
                            status = 'FAIL';
                            overallResult = 'FAIL';
                        }
                    }
                }
            }

            return {
                criterionId: crit.id,
                name: crit.name,
                type: crit.type || 'NUMBER',
                nominal: crit.nominal,
                upper: crit.upperTol,
                lower: crit.lowerTol,
                value: finalValue,
                status: status
            };
        });

        try {
            await addDoc(collection(db, CNC_MEASUREMENTS_COLLECTION), {
                jobId: selectedJob.id,
                partId: selectedJob.partId,
                partName: selectedJob.partName,
                machine: selectedJob.machine,
                operator: loggedInUser.name,
                timestamp: getCurrentDateTimeString(),
                details: measurementsToSave,
                overallResult: overallResult
            });
            alert("Ölçüm kaydedildi.");
            setIsMeasureModalOpen(false);
        } catch (error) { console.error("Hata:", error); alert("Kaydedilemedi."); }
    };

    // Renklendirme ve Kontrol
    const getInputStyle = (crit, rawValue) => {
        if (crit.type === 'BOOL') return ''; 

        if (rawValue === '' || rawValue === undefined) return 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700';
        
        const val = parseInputFloat(rawValue);
        if (isNaN(val)) return 'border-gray-300';

        const nominal = parseInputFloat(crit.nominal);
        const min = nominal - Math.abs(parseInputFloat(crit.lowerTol));
        const max = nominal + Math.abs(parseInputFloat(crit.upperTol));

        if (val >= min && val <= max) return 'bg-green-50 border-green-500 text-green-700 font-bold'; // OK
        return 'bg-red-50 border-red-500 text-red-700 font-bold animate-pulse'; // NG
    };

    const calculateDuration = (startTime) => {
        const start = new Date(startTime);
        const now = new Date();
        const diffMs = now - start;
        const hours = Math.floor(diffMs / 3600000);
        const minutes = Math.floor((diffMs % 3600000) / 60000);
        return `${hours}s ${minutes}dk`;
    };

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

            {/* --- TEZGAH KARTLARI --- */}
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
                                <div className="text-center border-b border-gray-100 dark:border-gray-700 pb-4 mb-4">
                                    <h2 className="text-4xl font-black text-gray-800 dark:text-white">{machine}</h2>
                                    <p className="text-xs text-gray-400">CNC TORNA</p>
                                </div>

                                {activeJob ? (
                                    <>
                                        <div className="space-y-4 flex-1">
                                            <div>
                                                <span className="text-xs font-bold text-gray-400 uppercase">İŞ EMRİ / PARÇA</span>
                                                <div className="font-mono font-bold text-xl text-gray-900 dark:text-white">{activeJob.orderNumber}</div>
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

                                            {/* ÖLÇÜM BUTONU */}
                                            <button 
                                                onClick={() => handleOpenMeasureModal(activeJob)}
                                                className="w-full py-2 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-700 rounded-lg font-bold flex items-center justify-center hover:bg-blue-200 dark:hover:bg-blue-900/50 transition"
                                            >
                                                <Ruler className="w-4 h-4 mr-2" /> ÖLÇÜM AL
                                            </button>

                                            <div className="text-xs text-center text-gray-400 pt-2">
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

            {/* --- MODAL: İŞ BAŞLAT --- */}
            <SimpleModal isOpen={isStartModalOpen} onClose={() => setIsStartModalOpen(false)} title={`Yeni İş Başlat - ${selectedMachine}`}>
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">İş Emri Numarası</label>
                        <input type="text" className="w-full p-3 border rounded-lg bg-gray-50 dark:bg-gray-700 dark:text-white" value={startFormData.orderNumber} onChange={e => setStartFormData({...startFormData, orderNumber: e.target.value})} placeholder="Örn: 2024-105" />
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Parça Seçimi</label>
                        <select className="w-full p-3 border rounded-lg bg-gray-50 dark:bg-gray-700 dark:text-white" value={startFormData.selectedPartId} onChange={e => setStartFormData({...startFormData, selectedPartId: e.target.value})}>
                            <option value="">Seçiniz...</option>
                            {parts.map(part => <option key={part.id} value={part.id}>{part.partName} {part.orderNumber ? `(${part.orderNumber})` : ''}</option>)}
                        </select>
                        {parts.length === 0 && <p className="text-xs text-red-500 mt-1">Önce parça tanımlayın.</p>}
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Hedeflenen Adet</label>
                        <input type="number" className="w-full p-3 border rounded-lg bg-gray-50 dark:bg-gray-700 dark:text-white" value={startFormData.targetQuantity} onChange={e => setStartFormData({...startFormData, targetQuantity: e.target.value})} placeholder="Örn: 500" />
                    </div>
                    <button onClick={handleStartJob} className="w-full py-3 mt-4 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg shadow-lg">BAŞLAT</button>
                </div>
            </SimpleModal>

            {/* --- MODAL: İŞ BİTİR --- */}
            <SimpleModal isOpen={isFinishModalOpen} onClose={() => setIsFinishModalOpen(false)} title="İşi Sonlandır">
                <div className="space-y-4">
                    <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-lg border border-yellow-100 dark:border-yellow-800 text-center">
                        <div className="text-sm text-yellow-800 dark:text-yellow-200">İş Emri</div>
                        <div className="text-xl font-black text-gray-900 dark:text-white">{selectedJob?.orderNumber}</div>
                        <div className="text-sm text-gray-500 mt-1">{selectedJob?.partName}</div>
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Üretilen Toplam Adet</label>
                        <input type="number" className="w-full p-4 text-center text-2xl font-bold border-2 border-green-500 rounded-lg bg-white dark:bg-gray-700 dark:text-white" value={producedQuantity} onChange={e => setProducedQuantity(e.target.value)} />
                    </div>
                    <button onClick={handleFinishJob} className="w-full py-3 mt-4 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg shadow-lg">KAYDET VE BİTİR</button>
                </div>
            </SimpleModal>

            {/* --- MODAL: ÖLÇÜM AL (GÜNCELLENDİ) --- */}
            <SimpleModal isOpen={isMeasureModalOpen} onClose={() => setIsMeasureModalOpen(false)} title="Ölçüm Girişi (SPC)" maxWidth="max-w-2xl">
                <div className="space-y-4">
                    <div className="flex justify-between items-center text-sm text-gray-500 border-b pb-2">
                        <span>Parça: <strong>{selectedJob?.partName}</strong></span>
                        <span>{getCurrentDateTimeString()}</span>
                    </div>

                    <div className="grid grid-cols-12 gap-2 text-xs font-bold text-gray-500 uppercase mb-1 px-1">
                        <div className="col-span-4">Ölçü / Kriter</div>
                        <div className="col-span-3 text-center">Referans</div>
                        <div className="col-span-5 text-center">Sonuç</div>
                    </div>

                    <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
                        {activeCriteria.map(crit => (
                            <div key={crit.id} className="grid grid-cols-12 gap-2 items-center bg-gray-50 dark:bg-gray-700/30 p-2 rounded border border-gray-100 dark:border-gray-700">
                                {/* İSİM */}
                                <div className="col-span-4 font-bold text-gray-800 dark:text-gray-200 text-sm">
                                    {crit.name}
                                </div>

                                {/* REFERANS DEĞERLERİ (GÖRSEL İYİLEŞTİRME YAPILDI) */}
                                <div className="col-span-3 text-center flex flex-col items-center justify-center">
                                    {crit.type === 'BOOL' ? (
                                        <span className="text-orange-500 font-bold text-xs">Gözle Kontrol</span>
                                    ) : (
                                        <>
                                            {/* Nominal Değer: Büyük ve Beyaz */}
                                            <span className="text-xl font-bold text-gray-900 dark:text-white leading-none">
                                                {crit.nominal}
                                            </span>
                                            {/* Toleranslar: Sarı ve Okunaklı */}
                                            <span className="text-xs font-bold text-yellow-600 dark:text-yellow-400 mt-1 bg-yellow-100 dark:bg-yellow-900/30 px-1.5 py-0.5 rounded">
                                                +{crit.upperTol} / -{Math.abs(crit.lowerTol)}
                                            </span>
                                        </>
                                    )}
                                </div>

                                {/* GİRİŞ ALANI (KEYPAD DÜZELTİLDİ: inputMode="decimal") */}
                                <div className="col-span-5 flex justify-center">
                                    {crit.type === 'BOOL' ? (
                                        <div className="flex gap-2 w-full">
                                            <button
                                                onClick={() => setMeasurementValues({...measurementValues, [crit.id]: 'OK'})}
                                                className={`flex-1 py-2 rounded font-bold text-xs flex items-center justify-center transition ${
                                                    measurementValues[crit.id] === 'OK' 
                                                    ? 'bg-green-600 text-white shadow-md' 
                                                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-gray-600 dark:text-gray-300'
                                                }`}
                                            >
                                                <CheckCircle className="w-3 h-3 mr-1"/> UYGUN
                                            </button>
                                            <button
                                                onClick={() => setMeasurementValues({...measurementValues, [crit.id]: 'RET'})}
                                                className={`flex-1 py-2 rounded font-bold text-xs flex items-center justify-center transition ${
                                                    measurementValues[crit.id] === 'RET' 
                                                    ? 'bg-red-600 text-white shadow-md' 
                                                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-gray-600 dark:text-gray-300'
                                                }`}
                                            >
                                                <XCircle className="w-3 h-3 mr-1"/> RET
                                            </button>
                                        </div>
                                    ) : (
                                        <input 
                                            type="text"
                                            inputMode="decimal" // TABLETTE NUMARA KLAVYESİ AÇAR
                                            className={`w-full p-2 text-center font-mono font-bold text-lg border-2 rounded outline-none transition-colors ${
                                                getInputStyle(crit, measurementValues[crit.id])
                                            }`}
                                            placeholder="Değer..."
                                            value={measurementValues[crit.id] || ''}
                                            onChange={(e) => setMeasurementValues({...measurementValues, [crit.id]: e.target.value})}
                                        />
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="pt-4 border-t border-gray-200 dark:border-gray-700 flex justify-end">
                        <button onClick={handleSaveMeasurement} className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow flex items-center">
                            <Save className="w-5 h-5 mr-2" /> KAYDET
                        </button>
                    </div>
                </div>
            </SimpleModal>

        </div>
    );
};

export default CncLatheDashboard;