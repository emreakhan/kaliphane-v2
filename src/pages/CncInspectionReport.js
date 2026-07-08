// src/pages/CncInspectionReport.js

import React, { useState, useEffect, useRef, useMemo } from 'react';
import html2pdf from 'html2pdf.js'; 
import { 
    FileText, Download, Search, History, X, Save, Plus, Trash2, Edit2, PlusCircle, Wand2
} from 'lucide-react';
import { collection, query, where, getDocs, orderBy, doc, getDoc, addDoc, updateDoc, deleteDoc } from '../config/firebase.js';
import { CNC_LATHE_JOBS_COLLECTION, CNC_MEASUREMENTS_COLLECTION, CNC_PARTS_COLLECTION, CNC_LATHE_MACHINES } from '../config/constants.js';
import { formatDateTime } from '../utils/dateUtils.js';

// --- BASİT MODAL (PENCERE) BİLEŞENİ ---
const SimpleModal = ({ isOpen, onClose, title, children, maxWidth = "max-w-md" }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-in fade-in">
            <div className={`bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full ${maxWidth} flex flex-col overflow-hidden`}>
                <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900">
                    <h3 className="text-lg font-bold text-gray-800 dark:text-white flex items-center">{title}</h3>
                    <button onClick={onClose} className="text-gray-500 hover:text-red-500 font-bold text-2xl">&times;</button>
                </div>
                <div className="p-6 overflow-y-auto flex-1">{children}</div>
            </div>
        </div>
    );
};

const CncInspectionReport = ({ db }) => {
    const [isAdmin, setIsAdmin] = useState(true);

    const [parts, setParts] = useState([]); 
    const [jobs, setJobs] = useState([]);   
    
    const [searchTerm, setSearchTerm] = useState('');
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [selectedPart, setSelectedPart] = useState(null); 
    const [selectedJobId, setSelectedJobId] = useState('');     
    
    const [reportData, setReportData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [showAutoFill, setShowAutoFill] = useState(false);
    const [isHolding, setIsHolding] = useState(false);
    const holdTimerRef = useRef(null);

    // EK METADATA ALANLARI
    const [rawMaterialLot, setRawMaterialLot] = useState('');
    const [pageLotNumbers, setPageLotNumbers] = useState({});
    const [preparedBy, setPreparedBy] = useState('');
    const [checkedBy, setCheckedBy] = useState('');
    const [approvedBy, setApprovedBy] = useState('');
    const [displayStartTime, setDisplayStartTime] = useState('');
    const [displayEndTime, setDisplayEndTime] = useState('');
    const [remarks, setRemarks] = useState(''); 

    // DİJİTAL FORM VERİSİ
    const [gridData, setGridData] = useState([]);
    
    // İŞ EMRİ DÜZENLEME STATE'LERİ
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editingJob, setEditingJob] = useState({ id: '', orderNumber: '' });

    // GEÇMİŞ İŞ EMRİ EKLEME STATE'LERİ
    const [isAddPastJobModalOpen, setIsAddPastJobModalOpen] = useState(false);
    const [pastJobFormData, setPastJobFormData] = useState({
        orderNumber: '',
        machine: CNC_LATHE_MACHINES ? CNC_LATHE_MACHINES[0] : 'TEZGAH-1',
        startDate: new Date().toISOString().split('T')[0],
        startTime: '08:00',
        targetQuantity: '100',
        operator: 'Admin'
    });

    const reportRef = useRef(null);
    const dropdownRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // 1. Verileri Çek
    useEffect(() => {
        if (!db) return;
        const fetchData = async () => {
            try {
                const pSnap = await getDocs(collection(db, CNC_PARTS_COLLECTION));
                const partsData = pSnap.docs.map(d => ({ id: d.id, ...d.data() }));
                partsData.sort((a, b) => (a.technicalDrawingNo || '').localeCompare(b.technicalDrawingNo || ''));
                setParts(partsData);

                const jSnap = await getDocs(query(collection(db, CNC_LATHE_JOBS_COLLECTION), orderBy('startTime', 'desc')));
                setJobs(jSnap.docs.map(d => ({ id: d.id, ...d.data() })));
            } catch (error) {
                console.error("Veri çekme hatası:", error);
            }
        };
        fetchData();
    }, [db]);

    const getPartLabel = (p) => {
        const no = p.technicalDrawingNo || p.orderNumber || 'KOD-YOK';
        const name = p.partName || 'İsimsiz Parça';
        return `${no} - ${name}`;
    };

    const filteredParts = useMemo(() => {
        if (!searchTerm) return parts;
        const lowerSearch = searchTerm.toLowerCase();
        return parts.filter(p => getPartLabel(p).toLowerCase().includes(lowerSearch));
    }, [parts, searchTerm]);

    const selectedPartJobs = useMemo(() => {
        if (!selectedPart) return [];
        return jobs.filter(j => j.partId === selectedPart.id);
    }, [jobs, selectedPart]);


    // --- İŞ EMRİNİ GÜNCELLEME ---
    const handleUpdateOrderNumber = async () => {
        if (!editingJob.id || !editingJob.orderNumber.trim()) return alert("İş emri numarası boş olamaz.");
        setSaving(true);
        try {
            await updateDoc(doc(db, CNC_LATHE_JOBS_COLLECTION, editingJob.id), {
                orderNumber: editingJob.orderNumber
            });
            setJobs(prev => prev.map(j => j.id === editingJob.id ? { ...j, orderNumber: editingJob.orderNumber } : j));
            if (reportData && reportData.job.id === editingJob.id) {
                setReportData(prev => ({ ...prev, job: { ...prev.job, orderNumber: editingJob.orderNumber } }));
            }
            alert("İş emri numarası başarıyla güncellendi!");
            setIsEditModalOpen(false);
        } catch (error) {
            console.error(error);
            alert("Güncellenirken bir hata oluştu.");
        } finally {
            setSaving(false);
        }
    };

    // --- YENİ EKLENEN: GEÇMİŞ İŞ EMRİ EKLEME ---
    const handleAddPastJob = async () => {
        if (!selectedPart || !pastJobFormData.orderNumber || !pastJobFormData.startDate) {
            return alert("Lütfen iş emri ve tarih alanlarını doldurunuz.");
        }
        setSaving(true);
        try {
            const combinedStartTime = `${pastJobFormData.startDate} ${pastJobFormData.startTime || '08:00'}`;
            const newJob = {
                partId: selectedPart.id,
                partName: selectedPart.partName,
                orderNumber: pastJobFormData.orderNumber,
                machine: pastJobFormData.machine,
                targetQuantity: parseInt(pastJobFormData.targetQuantity) || 0,
                producedQuantity: 0,
                startTime: combinedStartTime,
                endTime: combinedStartTime, 
                operator: pastJobFormData.operator,
                status: 'COMPLETED'
            };
            const docRef = await addDoc(collection(db, CNC_LATHE_JOBS_COLLECTION), newJob);
            setJobs(prev => [{ id: docRef.id, ...newJob }, ...prev]);
            setIsAddPastJobModalOpen(false);
            alert("Geçmiş iş emri başarıyla eklendi!");
            setPastJobFormData(prev => ({ ...prev, orderNumber: '' })); // Formu temizle
        } catch (error) {
            console.error("İş emri ekleme hatası:", error);
            alert("Kayıt oluşturulurken hata oluştu.");
        } finally {
            setSaving(false);
        }
    };

    // --- YENİ EKLENEN: OTOMATİK DOLDURMA (SİHİRLİ DEĞNEK) ---
    const handleAutoFill = () => {
        if (!reportData || !reportData.criteria || gridData.length === 0) return;
        
        const confirmFill = window.confirm("Tüm BOŞ ölçümler, belirtilen toleranslar içinde rastgele OK değerlerle otomatik doldurulacaktır. Onaylıyor musunuz?");
        if (!confirmFill) return;

        let currentHour = 8;
        let currentMin = 0;

        const newGrid = gridData.map((col, cIdx) => {
            let newDetails = [...(col.details || [])];
            
            reportData.criteria.forEach(crit => {
                const existingIdx = newDetails.findIndex(d => d.criterionId === crit.id);
                let finalValue = '';

                if (crit.type === 'BOOL') {
                    finalValue = 1; // 1 OK Demek
                } else {
                    const nominal = parseFloat(crit.nominal);
                    const upperTol = parseFloat(crit.upperTol);
                    const lowerTol = Math.abs(parseFloat(crit.lowerTol));
                    
                    if (!isNaN(nominal) && !isNaN(upperTol) && !isNaN(lowerTol)) {
                        // Tolerans aralığının tam sınırlarına değmemesi için güvenli marj (%10 içeride kalsın)
                        const safeMargin = (upperTol + lowerTol) * 0.05;
                        const min = nominal - lowerTol + safeMargin;
                        const max = nominal + upperTol - safeMargin;
                        const randomVal = min + Math.random() * (max - min);
                        
                        // Küsürat ayarlaması (Nominaldeki küsürata göre, en az 2)
                        const decimalPlaces = crit.nominal.toString().includes('.') ? crit.nominal.toString().split('.')[1].length : 2;
                        finalValue = randomVal.toFixed(Math.max(decimalPlaces, 2));
                    }
                }

                if (existingIdx >= 0) {
                    // Sadece boşsa doldur
                    if(newDetails[existingIdx].value === '' || newDetails[existingIdx].value === null || newDetails[existingIdx].value === undefined) {
                       newDetails[existingIdx].value = finalValue;
                    }
                } else {
                    newDetails.push({ criterionId: crit.id, type: crit.type || 'NUMBER', value: finalValue });
                }
            });

            // Otomatik Saat Ayarı
            let timeStr = col.timeStr;
            if (!timeStr) {
                timeStr = `${currentHour.toString().padStart(2, '0')}:${currentMin.toString().padStart(2, '0')}`;
                currentMin += 30; // 30 dakikada bir ölçüm yapıyor gibi
                if(currentMin >= 60) { currentMin -= 60; currentHour++; }
                if(currentHour >= 24) currentHour = 0;
            }

            return {
                ...col,
                operator: col.operator || 'OTO-OPR',
                timeStr: timeStr,
                details: newDetails
            };
        });

        setGridData(newGrid);
    };


    // 2. Rapor Verisini Hazırla ve Tabloyu Doldur
    const handleGenerateReport = async (jobId) => {
        if (!jobId) return;
        setSelectedJobId(jobId);
        setLoading(true);
        setReportData(null);

        try {
            const jobData = jobs.find(j => j.id === jobId);
            
            setRawMaterialLot(jobData.rawMaterialLot || '');
            setPreparedBy(jobData.preparedBy || '');
            setCheckedBy(jobData.checkedBy || '');
            setApprovedBy(jobData.approvedBy || '');
            setRemarks(jobData.remarks || ''); 
            setDisplayStartTime(jobData.displayStartTime || formatDateTime(jobData.startTime).split(' ')[0]);
            setDisplayEndTime(jobData.displayEndTime || (jobData.endTime ? formatDateTime(jobData.endTime).split(' ')[0] : ''));
            
            let partCriteria = [];
            let partData = {};
            if (jobData.partId) {
                const partRef = doc(db, CNC_PARTS_COLLECTION, jobData.partId);
                const partSnap = await getDoc(partRef);
                if (partSnap.exists()) {
                    partData = partSnap.data();
                    partCriteria = partData.criteria || [];
                }
            }

            const mQuery = query(
                collection(db, CNC_MEASUREMENTS_COLLECTION), 
                where('jobId', '==', jobId),
                orderBy('timestamp', 'asc')
            );
            const mSnap = await getDocs(mQuery);
            const measurements = mSnap.docs.map(d => ({ id: d.id, ...d.data() }));

            const lotMap = { 0: jobData.rawMaterialLot || '' };
            measurements.forEach(m => {
                const pIdx = m.pageIndex || 0;
                if (m.lotNumber && m.lotNumber.trim() !== '') {
                    lotMap[pIdx] = m.lotNumber;
                }
            });
            setPageLotNumbers(lotMap);
            if (lotMap[0]) {
                setRawMaterialLot(lotMap[0]);
            }

            // Group measurements by absolute column index
            let maxColIndex = 11;
            const mappedMeasurements = measurements.map(m => {
                const pIdx = m.pageIndex || 0;
                const cIdx = m.columnIndex !== undefined ? m.columnIndex : 0;
                const absoluteColIdx = (pIdx * 12) + cIdx;
                if (absoluteColIdx > maxColIndex) {
                    maxColIndex = absoluteColIdx;
                }
                return {
                    ...m,
                    absoluteColIdx
                };
            });

            const totalPages = Math.ceil((maxColIndex + 1) / 12);
            const newGrid = Array(totalPages * 12).fill(null).map(() => ({ details: [], operator: '', timeStr: '' }));
            
            let unassignedIdx = 0;
            mappedMeasurements.forEach(m => {
                if (m.absoluteColIdx !== undefined && m.absoluteColIdx >= 0) {
                    newGrid[m.absoluteColIdx] = { ...m, timeStr: m.timeStr || '' };
                } else {
                    while (unassignedIdx < newGrid.length && newGrid[unassignedIdx].id) unassignedIdx++;
                    if (unassignedIdx < newGrid.length) {
                        newGrid[unassignedIdx] = { ...m, timeStr: m.timeStr || '' };
                        unassignedIdx++;
                    }
                }
            });
            setGridData(newGrid);

            setReportData({
                job: jobData,
                part: partData,
                criteria: partCriteria
            });

        } catch (error) {
            console.error("Rapor hatası:", error);
            alert("Rapor verisi çekilemedi.");
        } finally {
            setLoading(false);
        }
    };

    const startHold = () => {
        setIsHolding(false);
        if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
        
        holdTimerRef.current = setTimeout(() => {
            setIsHolding(true);
            setShowAutoFill(prev => {
                const newVal = !prev;
                alert(newVal ? "Otomatik Doldur seçeneği aktif edildi!" : "Otomatik Doldur seçeneği gizlendi.");
                return newVal;
            });
        }, 3000);
    };

    const endHold = () => {
        if (holdTimerRef.current) {
            clearTimeout(holdTimerRef.current);
            holdTimerRef.current = null;
        }
    };

    const handleAddShiftClick = () => {
        if (isHolding) {
            setIsHolding(false);
            return;
        }
        handleAddShift();
    };

    const handleAddShift = () => {
        setGridData(prev => [
            ...prev,
            ...Array(12).fill(null).map(() => ({ details: [], operator: '', timeStr: '' }))
        ]);
    };

    const handleRemoveShift = async () => {
        if (gridData.length <= 12) return alert("İlk sayfayı silemezsiniz!");
        const confirmDelete = window.confirm("Son eklenen vardiya sayfasını silmek istediğinize emin misiniz? (Bu sayfadaki veriler veritabanından kalıcı olarak silinecektir!)");
        if (!confirmDelete) return;

        setSaving(true);
        try {
            const itemsToRemove = gridData.slice(-12);
            const remainingItems = gridData.slice(0, -12);

            for (const item of itemsToRemove) {
                if (item && item.id) await deleteDoc(doc(db, CNC_MEASUREMENTS_COLLECTION, item.id));
            }
            setGridData(remainingItems);
            alert("Son vardiya sayfası başarıyla silindi!");
        } catch (error) {
            alert("Sayfa silinirken bir hata oluştu.");
        } finally {
            setSaving(false);
        }
    };

    const handleHeaderChange = (colIndex, field, value) => {
        if (!isAdmin) return;
        const newGrid = [...gridData];
        if (newGrid[colIndex]) {
            newGrid[colIndex][field] = value;
            setGridData(newGrid);
        }
    };

    const handleCellChange = (colIndex, critId, value, type) => {
        if (!isAdmin) return;
        const newGrid = [...gridData];
        let details = newGrid[colIndex].details || [];
        const existingIdx = details.findIndex(d => d.criterionId === critId);
        
        let finalValue = value;
        if (type === 'BOOL') {
            finalValue = value === 'OK' ? 1 : (value === 'RET' ? 0 : '');
        }

        if (existingIdx >= 0) details[existingIdx].value = finalValue;
        else details.push({ criterionId: critId, type, value: finalValue });
        
        newGrid[colIndex].details = details;
        setGridData(newGrid);
    };

    const handleSaveChanges = async () => {
        if (!selectedJobId || !isAdmin) return;
        setSaving(true);
        try {
            const firstPageLot = pageLotNumbers[0] || '';
            await updateDoc(doc(db, CNC_LATHE_JOBS_COLLECTION, selectedJobId), {
                rawMaterialLot: firstPageLot, preparedBy, checkedBy, approvedBy, displayStartTime, displayEndTime, remarks 
            });

            for (let i = 0; i < gridData.length; i++) {
                const colData = gridData[i];
                const hasData = colData.operator?.trim().length > 0 || colData.timeStr?.trim().length > 0 || colData.details?.some(d => d.value !== '');
                
                if (hasData) {
                    const pIdx = Math.floor(i / 12);
                    const cIdx = i % 12;
                    const docData = {
                        jobId: selectedJobId, 
                        pageIndex: pIdx,
                        columnIndex: cIdx, 
                        operator: colData.operator || '', 
                        timeStr: colData.timeStr || '',
                        lotNumber: pageLotNumbers[pIdx] || '',
                        details: colData.details || [], 
                        timestamp: colData.timestamp || Date.now() + (pIdx * 20) + cIdx
                    };

                    if (colData.id) await updateDoc(doc(db, CNC_MEASUREMENTS_COLLECTION, colData.id), docData);
                    else await addDoc(collection(db, CNC_MEASUREMENTS_COLLECTION), docData);
                }
            }
            alert("Vardiya kayıtları başarıyla güncellendi!");
            handleGenerateReport(selectedJobId);
        } catch (error) {
            alert("Hata oluştu.");
        } finally {
            setSaving(false);
        }
    };

    const handleDownloadPdf = () => {
        const element = reportRef.current;
        if (!element) return;
        
        const originalZoom = element.style.zoom;
        element.style.zoom = '1.0';

        const opt = {
            margin: [2, 5, 2, 5], 
            filename: `Kontrol_Formu_${reportData.job.orderNumber}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true, scrollY: 0 }, 
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }
        };
        html2pdf().set(opt).from(element).save().then(() => {
            element.style.zoom = originalZoom;
        });
    };

    const numPages = Math.ceil(gridData.length / 12);

    return (
        <div className="p-6 max-w-[95%] w-full mx-auto min-h-screen bg-gray-100 dark:bg-gray-900 font-sans">
            
            {/* GEÇMİŞ İŞ EMRİ EKLEME MODALI */}
            <SimpleModal isOpen={isAddPastJobModalOpen} onClose={() => setIsAddPastJobModalOpen(false)} title="Geçmişe Dönük İş Emri Ekle">
                <div className="space-y-4">
                    <div className="p-3 bg-purple-50 text-purple-800 rounded-lg text-sm border border-purple-200">
                        <strong>Seçili Parça:</strong> {selectedPart?.partName} <br/>
                        Bu ekrandan geçmiş tarihler için üretim kaydı (iş emri) oluşturabilirsiniz.
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">İş Emri Numarası</label>
                        <input type="text" className="w-full p-2.5 border rounded bg-gray-50 dark:bg-gray-700 dark:text-white outline-none focus:ring-2 focus:ring-purple-500 uppercase font-bold" value={pastJobFormData.orderNumber} onChange={(e) => setPastJobFormData({...pastJobFormData, orderNumber: e.target.value})} placeholder="Örn: 2024-X123" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Üretim Tarihi</label>
                            <input type="date" className="w-full p-2.5 border rounded bg-gray-50 dark:bg-gray-700 dark:text-white outline-none focus:ring-2 focus:ring-purple-500" value={pastJobFormData.startDate} onChange={(e) => setPastJobFormData({...pastJobFormData, startDate: e.target.value})} />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Başlangıç Saati</label>
                            <input type="time" className="w-full p-2.5 border rounded bg-gray-50 dark:bg-gray-700 dark:text-white outline-none focus:ring-2 focus:ring-purple-500" value={pastJobFormData.startTime} onChange={(e) => setPastJobFormData({...pastJobFormData, startTime: e.target.value})} />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Tezgah Seçimi</label>
                            <select className="w-full p-2.5 border rounded bg-gray-50 dark:bg-gray-700 dark:text-white outline-none focus:ring-2 focus:ring-purple-500 font-bold" value={pastJobFormData.machine} onChange={(e) => setPastJobFormData({...pastJobFormData, machine: e.target.value})}>
                                {(CNC_LATHE_MACHINES || ['TEZGAH-1', 'TEZGAH-2']).map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Üretim Adedi</label>
                            <input type="number" className="w-full p-2.5 border rounded bg-gray-50 dark:bg-gray-700 dark:text-white outline-none focus:ring-2 focus:ring-purple-500" value={pastJobFormData.targetQuantity} onChange={(e) => setPastJobFormData({...pastJobFormData, targetQuantity: e.target.value})} />
                        </div>
                    </div>
                    <div className="pt-2">
                        <button onClick={handleAddPastJob} disabled={saving} className="w-full p-3 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-lg transition-colors flex justify-center items-center">
                            {saving ? 'Ekleniyor...' : <><PlusCircle className="w-5 h-5 mr-2" /> İş Emrini Ekle</>}
                        </button>
                    </div>
                </div>
            </SimpleModal>

            {/* İŞ EMRİ DÜZENLEME MODALI */}
            <SimpleModal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title="İş Emri Numarasını Düzelt">
                <div className="space-y-4">
                    <div className="p-3 bg-blue-50 text-blue-800 rounded-lg text-sm border border-blue-200">
                        Bu işlem, bu kayda ait tüm <strong>Kontrol Formu</strong> ve <strong>SPC Analiz</strong> geçmişindeki iş emri numarasını kalıcı olarak değiştirecektir.
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Yeni İş Emri No / Kodu</label>
                        <input 
                            type="text" 
                            className="w-full p-3 border rounded-lg bg-gray-50 dark:bg-gray-700 dark:text-white dark:border-gray-600 outline-none focus:ring-2 focus:ring-blue-500 uppercase font-bold" 
                            value={editingJob.orderNumber} 
                            onChange={(e) => setEditingJob({...editingJob, orderNumber: e.target.value})} 
                        />
                    </div>
                    <div className="pt-2">
                        <button 
                            onClick={handleUpdateOrderNumber} 
                            disabled={saving}
                            className="w-full p-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg transition-colors flex justify-center items-center"
                        >
                            {saving ? 'Güncelleniyor...' : <><Save className="w-5 h-5 mr-2" /> Değişikliği Kaydet</>}
                        </button>
                    </div>
                </div>
            </SimpleModal>


            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-extrabold text-gray-900 dark:text-white flex items-center">
                    <FileText className="w-8 h-8 mr-3 text-blue-600" />
                    Kalite Kontrol Formları (Vardiya Sistemli)
                </h1>

                <div className="flex items-center space-x-3 bg-white dark:bg-gray-800 p-2 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
                    <span className="text-xs font-bold text-gray-500">TEST MODU:</span>
                    <button 
                        onClick={() => setIsAdmin(!isAdmin)}
                        className={`px-3 py-1 text-xs font-bold rounded-md transition-colors ${isAdmin ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}
                    >
                        {isAdmin ? 'YÖNETİCİ AKTİF' : 'OPERATÖR AKTİF'}
                    </button>
                </div>
            </div>

            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 mb-6" data-html2canvas-ignore="true">
                
                <div className="w-full relative" ref={dropdownRef}>
                    <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 uppercase mb-2">
                        1. Raporlanacak Parçayı Arayın (Resim No veya Parça Adı)
                    </label>
                    <div className="relative">
                        <Search className="absolute left-3 top-3.5 w-5 h-5 text-gray-400" />
                        <input 
                            type="text"
                            placeholder="Örn: 603246 veya SUNROOF..."
                            className="w-full pl-10 pr-10 p-3 border rounded-lg bg-gray-50 dark:bg-gray-700 dark:text-white dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none uppercase"
                            value={searchTerm || ''}
                            onChange={(e) => {
                                setSearchTerm(e.target.value);
                                setIsDropdownOpen(true);
                            }}
                            onFocus={() => setIsDropdownOpen(true)}
                        />
                        {searchTerm && (
                            <button 
                                onClick={() => {
                                    setSearchTerm(''); 
                                    setSelectedPart(null);
                                    setReportData(null);
                                    setSelectedJobId('');
                                }}
                                className="absolute right-3 top-3.5 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-full p-1 transition-colors"
                            >
                                <X className="w-5 h-5 text-gray-500 dark:text-gray-300" />
                            </button>
                        )}
                    </div>

                    {isDropdownOpen && (
                        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl max-h-60 overflow-y-auto">
                            {filteredParts.length > 0 ? (
                                filteredParts.map(part => {
                                    const label = getPartLabel(part);
                                    const [no, name] = label.split(' - ');
                                    return (
                                        <div 
                                            key={part.id}
                                            className="p-3 hover:bg-blue-50 dark:hover:bg-gray-700 cursor-pointer border-b dark:border-gray-700 last:border-0 dark:text-white flex items-center"
                                            onClick={() => {
                                                setSelectedPart(part);
                                                setSearchTerm(label);
                                                setIsDropdownOpen(false);
                                                setReportData(null);
                                                setSelectedJobId('');
                                            }}
                                        >
                                            <span className="font-bold text-blue-600 dark:text-blue-400 w-1/3 truncate pr-2" title={no}>{no}</span>
                                            <span className="text-gray-400 mr-2">-</span>
                                            <span className="truncate w-2/3" title={name}>{name}</span>
                                        </div>
                                    )
                                })
                            ) : (
                                <div className="p-4 text-center text-gray-500">Parça bulunamadı</div>
                            )}
                        </div>
                    )}
                </div>

                {selectedPart && (
                    <div className="mt-8 animate-in fade-in slide-in-from-top-4">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-bold text-gray-800 dark:text-white flex items-center">
                                <History className="w-5 h-5 mr-2 text-blue-500" />
                                "{selectedPart.partName}" Geçmiş Üretim Kayıtları
                            </h3>
                            {/* GEÇMİŞ İŞ EMRİ EKLEME BUTONU */}
                            {isAdmin && (
                                <button 
                                    onClick={() => setIsAddPastJobModalOpen(true)}
                                    className="px-4 py-2 bg-purple-100 text-purple-700 hover:bg-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:hover:bg-purple-900/50 rounded-lg font-bold transition-all text-sm flex items-center shadow-sm"
                                >
                                    <PlusCircle className="w-4 h-4 mr-2" /> Geçmiş İş Emri Ekle
                                </button>
                            )}
                        </div>

                        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 uppercase text-xs">
                                    <tr>
                                        <th className="px-6 py-4 font-bold">İş Emri No</th>
                                        <th className="px-6 py-4 font-bold">Üretim Başlangıç</th>
                                        <th className="px-6 py-4 text-right">İşlem</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {selectedPartJobs.length > 0 ? (
                                        selectedPartJobs.map((job) => (
                                            <tr key={job.id} className={`border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 ${selectedJobId === job.id ? 'bg-blue-50 dark:bg-gray-800' : 'bg-white dark:bg-gray-800'}`}>
                                                <td className="px-6 py-4 font-medium text-gray-900 dark:text-white">{job.orderNumber}</td>
                                                <td className="px-6 py-4 text-gray-600 dark:text-gray-400">
                                                    {formatDateTime(job.startTime).split(' ')[0]}
                                                </td>
                                                <td className="px-6 py-4 text-right flex justify-end items-center gap-2">
                                                    {isAdmin && (
                                                        <button 
                                                            onClick={() => { setEditingJob({ id: job.id, orderNumber: job.orderNumber }); setIsEditModalOpen(true); }}
                                                            className="px-3 py-2 bg-yellow-100 text-yellow-700 hover:bg-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:hover:bg-yellow-900/50 rounded-lg font-bold transition-all text-xs flex items-center"
                                                        >
                                                            <Edit2 className="w-4 h-4 mr-1"/> Düzenle
                                                        </button>
                                                    )}
                                                    <button 
                                                        onClick={() => handleGenerateReport(job.id)}
                                                        disabled={loading && selectedJobId === job.id}
                                                        className={`px-4 py-2 font-bold rounded-lg transition-all ${
                                                            selectedJobId === job.id 
                                                            ? 'bg-green-600 text-white shadow-md' 
                                                            : 'bg-blue-600 text-white hover:bg-blue-700'
                                                        }`}
                                                    >
                                                        {loading && selectedJobId === job.id ? 'Yükleniyor...' : 'Formu Getir'}
                                                    </button>
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr>
                                            <td colSpan="3" className="px-6 py-8 text-center text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800">
                                                Bu parçaya ait daha önce açılmış bir iş emri bulunmuyor.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>

            {reportData && (
                <div className="flex flex-wrap justify-between items-center mb-4 gap-4" data-html2canvas-ignore="true">
                    <div className="flex gap-2">
                        {isAdmin && (
                            <>
                                <button 
                                    onMouseDown={startHold}
                                    onMouseUp={endHold}
                                    onMouseLeave={endHold}
                                    onTouchStart={startHold}
                                    onTouchEnd={endHold}
                                    onClick={handleAddShiftClick} 
                                    className="px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-lg flex items-center transition transform active:scale-95 select-none"
                                >
                                    <Plus className="w-5 h-5 mr-2"/> SAYFA EKLE
                                </button>
                                {showAutoFill && (
                                    <button onClick={handleAutoFill} className="px-4 py-3 bg-yellow-500 hover:bg-yellow-600 text-white font-bold rounded-lg shadow-lg flex items-center transition transform active:scale-95">
                                        <Wand2 className="w-5 h-5 mr-2"/> OTOMATİK DOLDUR
                                    </button>
                                )}
                                {gridData.length > 12 && (
                                    <button onClick={handleRemoveShift} disabled={saving} className="px-4 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg shadow-lg flex items-center transition transform active:scale-95 disabled:opacity-50">
                                        <Trash2 className="w-5 h-5 mr-2"/> SON SAYFAYI SİL
                                    </button>
                                )}
                            </>
                        )}
                    </div>
                    <div className="flex gap-2">
                        {isAdmin && (
                            <button onClick={handleSaveChanges} disabled={saving} className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-lg flex items-center transition transform active:scale-95 disabled:opacity-50">
                                <Save className="w-5 h-5 mr-2"/> {saving ? 'KAYDEDİLİYOR...' : 'DEĞİŞİKLİKLERİ KAYDET'}
                            </button>
                        )}
                        <button onClick={handleDownloadPdf} className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg shadow-lg flex items-center transition transform active:scale-95">
                            <Download className="w-5 h-5 mr-2"/> PDF İNDİR
                        </button>
                    </div>
                </div>
            )}

            {reportData && (
                <div className="overflow-auto bg-gray-200 p-4 rounded-lg border border-gray-300">
                    <div ref={reportRef} className="bg-white text-black mx-auto shadow-sm" style={{ width: '290mm', position: 'relative', zoom: '1.2' }}>
                        
                        {Array.from({ length: numPages }).map((_, pageIndex) => {
                            const startIndex = pageIndex * 12;
                            const pageHeaders = [
                                { title: "SERİ BAŞ.\nONAYI", bg: "bg-yellow-50", index: startIndex + 0, width: "w-14" },
                                ...Array.from({ length: 10 }).map((_, i) => ({ title: `${i + 1}.\nKONTROL`, bg: "bg-white", index: startIndex + i + 1, width: "w-12" })),
                                { title: "SERİ SONU\nKONTROL", bg: "bg-green-50", index: startIndex + 11, width: "w-14" }
                            ];

                            return (
                                <div key={pageIndex} className="p-2 relative bg-white" style={{ height: '195mm', overflow: 'hidden', pageBreakAfter: pageIndex < numPages - 1 ? 'always' : 'auto', backgroundColor: 'white', color: 'black' }}>
                                    
                                    <div className="border-2 border-black mb-0.5 m-2 mt-1 bg-white">
                                        <div className="grid grid-cols-4 text-center border-b border-black bg-white">
                                            <div className="p-1.5 border-r border-black flex items-center justify-center bg-white">
                                                <img src="/logo512.png" alt="ETKA-D Logo" className="h-12 w-auto object-contain mx-auto" />
                                            </div>
                                            <div className="col-span-3 p-1 font-bold text-lg flex items-center justify-center tracking-wide text-black bg-white" style={{ color: 'black' }}>
                                                TALAŞLI İMALAT KONTROL FORMU {numPages > 1 && `(SAYFA ${pageIndex + 1})`}
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-12 border-b border-black text-[10px] bg-white text-black" style={{ color: 'black' }}>
                                            <div className="col-span-1 border-r border-black flex items-center justify-center font-bold bg-gray-100 text-center text-black">Parça<br/>Bilgileri</div>
                                            <div className="col-span-10 grid grid-cols-2 text-black bg-white">
                                                <div className="p-0.5 border-r border-black border-b border-black flex items-center text-black"><span className="font-bold mr-2 text-black">Parça Adı:</span> <span className="text-black">{reportData.part.partName}</span></div>
                                                <div className="p-0.5 border-b border-black flex items-center text-black"><span className="font-bold mr-2 text-black">Teknik Resim NO:</span> <span className="text-black">{reportData.part.technicalDrawingNo || '-'}</span></div>
                                                <div className="p-0.5 border-r border-black flex items-center text-black"><span className="font-bold mr-2 text-black">Parça Kodu:</span> <span className="text-black">{reportData.part.orderNumber}</span></div>
                                                <div className="p-0.5 flex items-center text-black"><span className="font-bold mr-2 text-black">Revizyon No/Tarih:</span> <span className="text-black">{reportData.part.revisionInfo || '-'}</span></div>
                                            </div>
                                            <div className="col-span-1 flex flex-col items-center justify-center bg-gray-100 border-l border-black text-black">
                                                <div className="font-bold text-[8px] border-b border-black w-full text-center text-black">Talimat NO:</div>
                                                <div className="font-bold text-base text-black">{reportData.part.instructionNo || '-'}</div>
                                            </div>
                                        </div>

                                        <div className="text-[8px] p-0.5 border-b border-black text-center bg-gray-50 text-black" style={{ color: 'black' }}>
                                            Kontroller TL04 - Numune Alma Planına göre yapılacaktır. Uygunsuzlukta PR05 - UYGUN OLMAYAN ÜRÜN VE SAHTE PARÇA KONTROL PROSEDÜRÜ uygulanır. Kontrol maddeleri, üretimi yapılan ürünün üretim ve kontrol talimatında yer alan maddelere istinaden doldurulacaktır.
                                        </div>

                                        <div className="grid grid-cols-12 text-[10px] bg-white text-black" style={{ color: 'black' }}>
                                            <div className="col-span-1 border-r border-black flex items-center justify-center font-bold bg-gray-100 text-center text-black">Üretim<br/>Bilgileri</div>
                                            <div className="col-span-11 grid grid-cols-2 text-black bg-white">
                                                <div className="p-0.5 border-r border-black border-b border-black flex items-center text-black">
                                                    <span className="font-bold mr-2 text-black">Üretim Başlangıç:</span> 
                                                    <input 
                                                        type="text" 
                                                        value={displayStartTime}
                                                        onChange={(e) => setDisplayStartTime(e.target.value)}
                                                        readOnly={!isAdmin}
                                                        style={{ color: '#1e3a8a', backgroundColor: 'transparent' }}
                                                        className={`border-b border-black border-dashed bg-transparent outline-none w-24 text-blue-900 font-bold ${isAdmin ? 'focus:bg-yellow-100' : 'cursor-not-allowed'}`}
                                                    />
                                                </div>
                                                <div className="p-0.5 border-b border-black flex items-center text-black"><span className="font-bold mr-2 text-black">İş Emri No:</span> <span className="text-black">{reportData.job.orderNumber}</span></div>
                                                <div className="p-0.5 border-r border-black border-b border-black flex items-center text-black">
                                                    <span className="font-bold mr-2 text-black">Üretim Bitiş:</span> 
                                                    <input 
                                                        type="text" 
                                                        value={displayEndTime}
                                                        onChange={(e) => setDisplayEndTime(e.target.value)}
                                                        readOnly={!isAdmin}
                                                        style={{ color: '#1e3a8a', backgroundColor: 'transparent' }}
                                                        className={`border-b border-black border-dashed bg-transparent outline-none w-24 text-blue-900 font-bold ${isAdmin ? 'focus:bg-yellow-100' : 'cursor-not-allowed'}`}
                                                    />
                                                </div>
                                                <div className="p-0.5 border-b border-black flex items-center text-black"><span className="font-bold mr-2 text-black">Makine No:</span> <span className="text-black">{reportData.job.machine}</span></div>
                                                <div className="p-0.5 border-r border-black flex items-center text-black"><span className="font-bold mr-2 text-black">Hammalzeme Stok Kodu:</span> <span className="text-black">{reportData.part.rawMaterialCode || '-'}</span></div>
                                                <div className="p-0.5 flex items-center text-black">
                                                    <span className="font-bold mr-2 text-black">Hammalzeme Lot:</span> 
                                                    <input 
                                                        type="text" 
                                                        value={pageLotNumbers[pageIndex] ?? ''}
                                                        onChange={(e) => {
                                                            const val = e.target.value;
                                                            setPageLotNumbers(prev => ({ ...prev, [pageIndex]: val }));
                                                            if (pageIndex === 0) setRawMaterialLot(val);
                                                        }}
                                                        readOnly={!isAdmin}
                                                        style={{ color: '#1e3a8a', backgroundColor: 'transparent' }}
                                                        className={`border-b border-black border-dashed bg-transparent outline-none w-32 px-1 text-xs text-blue-900 font-bold ${isAdmin ? 'focus:bg-yellow-100' : 'cursor-not-allowed'}`} 
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* ÖLÇÜM TABLOSU */}
                                    <div className="w-full mt-0.5 px-2">
                                        <table className="w-full border-collapse border border-black text-center text-[9px] bg-white text-black" style={{ color: 'black' }}>
                                            <thead>
                                                <tr className="bg-gray-200 text-black">
                                                    <th className="border border-black p-0.5 w-6 text-black">NO</th>
                                                    <th className="border border-black p-0.5 text-black">KONTROL KRİTERİ (Nominal / Tol)</th>
                                                    <th className="border border-black p-0.5 w-16 text-black">METOT</th>
                                                    
                                                    {pageHeaders.map((col) => (
                                                        <th key={col.index} className={`border border-black p-0.5 align-top ${col.width} ${col.bg} text-black`} style={{ color: 'black' }}>
                                                            <div className="font-bold border-b border-gray-400 pb-0.5 mb-0.5 text-[8.5px] whitespace-pre-line leading-tight text-black">
                                                                {col.title}
                                                            </div>
                                                            <input 
                                                                type="text" 
                                                                placeholder="SAAT"
                                                                readOnly={!isAdmin}
                                                                style={{ color: 'black', backgroundColor: 'transparent' }}
                                                                className={`text-[8.5px] font-black text-black bg-transparent border-b border-gray-400 w-full text-center outline-none pb-0.5 mb-0.5 font-mono ${isAdmin ? 'focus:bg-yellow-100 placeholder-gray-500' : 'cursor-not-allowed placeholder-gray-400'}`}
                                                                value={gridData[col.index]?.timeStr ?? ''}
                                                                onChange={(e) => handleHeaderChange(col.index, 'timeStr', e.target.value)}
                                                            />
                                                            <textarea 
                                                                placeholder="OPR."
                                                                readOnly={!isAdmin}
                                                                rows={2}
                                                                style={{ color: '#1e3a8a', backgroundColor: 'transparent', resize: 'none', minHeight: '16px', lineHeight: '8px' }}
                                                                className={`text-[6.5px] font-black text-blue-900 uppercase bg-transparent border-none w-full text-center outline-none tracking-tighter overflow-hidden p-0 m-0 ${isAdmin ? 'focus:bg-yellow-100 placeholder-gray-500' : 'cursor-not-allowed placeholder-gray-400'}`}
                                                                value={gridData[col.index]?.operator ?? ''}
                                                                onChange={(e) => handleHeaderChange(col.index, 'operator', e.target.value)}
                                                            />
                                                        </th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {reportData.criteria.map((crit, idx) => (
                                                    <tr key={crit.id} className="hover:bg-gray-50 transition-colors bg-white text-black">
                                                        <td className="border border-black p-0.5 font-bold text-black" style={{ color: 'black' }}>{idx + 1}</td>
                                                        <td className="border border-black p-0.5 text-left px-2 text-black">
                                                            <span className="font-bold text-[10px] text-black" style={{ color: 'black' }}>{crit.name}</span>
                                                            {crit.type !== 'BOOL' && (
                                                                <span className="block text-[8px] text-gray-600" style={{ color: '#4b5563' }}>
                                                                    {crit.nominal} (+{crit.upperTol} / -{Math.abs(crit.lowerTol)})
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td className="border border-black p-0.5 font-bold uppercase text-blue-800 text-[9px]" style={{ color: '#1e3a8a' }}>
                                                            {crit.method || '-'}
                                                        </td>
                                                        
                                                        {pageHeaders.map((col) => {
                                                            const detail = gridData[col.index]?.details?.find(d => d.criterionId === crit.id);
                                                            let val = detail ? detail.value : '';
                                                            let textClass = ''; 

                                                            if (val !== '') {
                                                                if (crit.type === 'BOOL') {
                                                                    val = val === 1 ? 'OK' : (val === 0 ? 'RET' : '');
                                                                    textClass = val === 'OK' ? 'text-green-700 font-bold' : 'text-red-600 font-extrabold';
                                                                } else {
                                                                    const numVal = parseFloat(val.toString().replace(',', '.'));
                                                                    const nom = parseFloat(crit.nominal);
                                                                    const upper = parseFloat(crit.upperTol);
                                                                    const lower = parseFloat(crit.lowerTol);
                                                                    if (numVal > (nom + upper) || numVal < (nom - Math.abs(lower))) {
                                                                        textClass = 'text-red-600 font-extrabold';
                                                                    } else {
                                                                        textClass = 'font-bold text-gray-900';
                                                                    }
                                                                }
                                                            }

                                                            const resolvedColor = textClass.includes('text-green-700') 
                                                                ? '#15803d' 
                                                                : (textClass.includes('text-red-600') ? '#dc2626' : 'black');

                                                            return (
                                                                <td key={col.index} className={`border border-black p-0 h-5 align-middle ${textClass}`} style={{ color: resolvedColor }}>
                                                                    {crit.type === 'BOOL' ? (
                                                                        <select 
                                                                            disabled={!isAdmin}
                                                                            style={{ color: resolvedColor, backgroundColor: 'transparent' }}
                                                                            className={`w-full h-full bg-transparent border-none text-center outline-none appearance-none text-[9px] ${isAdmin ? 'cursor-pointer' : 'cursor-not-allowed'} ${textClass}`}
                                                                            value={val}
                                                                            onChange={(e) => handleCellChange(col.index, crit.id, e.target.value, 'BOOL')}
                                                                        >
                                                                            <option value="" style={{ color: 'black', backgroundColor: 'white' }}></option>
                                                                            <option value="OK" style={{ color: '#15803d', backgroundColor: 'white' }}>OK</option>
                                                                            <option value="RET" style={{ color: '#dc2626', backgroundColor: 'white' }}>RET</option>
                                                                        </select>
                                                                    ) : (
                                                                        <input 
                                                                            type="text"
                                                                            readOnly={!isAdmin}
                                                                            style={{ color: resolvedColor, backgroundColor: 'transparent' }}
                                                                            className={`w-full h-full bg-transparent border-none text-center outline-none text-[9px] ${isAdmin ? 'focus:bg-yellow-100 focus:ring-1 focus:ring-blue-400' : 'cursor-not-allowed'} ${textClass}`}
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

                                    {/* FOOTER ALANI (AÇIKLAMA VE İMZALAR) */}
                                    <div className="absolute bottom-1.5 left-4 right-4 px-4 bg-white text-black" style={{ color: 'black', backgroundColor: 'white' }}>
                                        
                                        <div className="w-full flex items-start border border-black p-0.5 mb-1 bg-gray-50 text-black">
                                            <span className="font-bold text-[9px] mr-2 whitespace-nowrap pt-1 text-black">Açıklama:</span>
                                            <textarea 
                                                value={remarks}
                                                onChange={(e) => setRemarks(e.target.value)}
                                                readOnly={!isAdmin}
                                                style={{ color: 'black', backgroundColor: 'transparent' }}
                                                className={`w-full text-[9px] text-black bg-transparent outline-none resize-none ${isAdmin ? 'focus:bg-yellow-100' : 'cursor-not-allowed'}`}
                                                rows="2"
                                                placeholder={isAdmin ? "Açıklama veya notlarınızı buraya girebilirsiniz..." : ""}
                                            ></textarea>
                                        </div>

                                        <div className="grid grid-cols-3 gap-8 text-center text-xs border-t border-black pt-1 mb-1 text-black">
                                            <div className="text-black">
                                                <div className="font-bold mb-1 text-black">Hazırlayan</div>
                                                <input type="text" value={preparedBy} onChange={(e) => setPreparedBy(e.target.value)} readOnly={!isAdmin} style={{ color: '#1e3a8a', backgroundColor: 'transparent' }} className={`border-b border-black border-dashed bg-transparent outline-none w-32 text-center text-blue-900 font-bold ${isAdmin ? 'focus:bg-yellow-100' : 'cursor-not-allowed'}`} />
                                            </div>
                                            <div className="text-black">
                                                <div className="font-bold mb-1 text-black">Kontrol Eden</div>
                                                <input type="text" value={checkedBy} onChange={(e) => setCheckedBy(e.target.value)} readOnly={!isAdmin} style={{ color: '#1e3a8a', backgroundColor: 'transparent' }} className={`border-b border-black border-dashed bg-transparent outline-none w-32 text-center text-blue-900 font-bold ${isAdmin ? 'focus:bg-yellow-100' : 'cursor-not-allowed'}`} />
                                            </div>
                                            <div className="text-black">
                                                <div className="font-bold mb-1 text-black">Onaylayan</div>
                                                <input type="text" value={approvedBy} onChange={(e) => setApprovedBy(e.target.value)} readOnly={!isAdmin} style={{ color: '#1e3a8a', backgroundColor: 'transparent' }} className={`border-b border-black border-dashed bg-transparent outline-none w-32 text-center text-blue-900 font-bold ${isAdmin ? 'focus:bg-yellow-100' : 'cursor-not-allowed'}`} />
                                            </div>
                                        </div>
                                        <div className="text-left font-extrabold text-[10px] text-gray-800 tracking-wider">FR 372</div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

export default CncInspectionReport;