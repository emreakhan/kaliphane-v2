// src/pages/CncSpcAnalysisPage.js

import React, { useState, useEffect, useMemo, useRef } from 'react';
import html2pdf from 'html2pdf.js'; 
import { 
    Activity, Search, BarChart2, Trash2, Calendar, AlertCircle, Layers, X, Save, Plus, Download, History 
} from 'lucide-react';
import { 
    collection, query, where, onSnapshot, getDocs, deleteDoc, doc, updateDoc, orderBy, addDoc 
} from '../config/firebase.js';
import { 
    CNC_PARTS_COLLECTION, CNC_LATHE_JOBS_COLLECTION 
} from '../config/constants.js';
import { formatDateTime } from '../utils/dateUtils.js';
import CncSpcSimulationTab from './CncSpcSimulationTab.js';

const CNC_SPC_MEASUREMENTS_COLLECTION = 'cnc_spc_measurements';

// --- İSTATİSTİKSEL KATSAYILAR (AIAG SPC) ---
const SPC_CONSTANTS = {
    2: { A2: 1.880, D3: 0, D4: 3.267, d2: 1.128 },
    3: { A2: 1.023, D3: 0, D4: 2.574, d2: 1.693 },
    4: { A2: 0.729, D3: 0, D4: 2.282, d2: 2.059 },
    5: { A2: 0.577, D3: 0, D4: 2.114, d2: 2.326 },
    6: { A2: 0.483, D3: 0, D4: 2.004, d2: 2.534 },
    7: { A2: 0.419, D3: 0.076, D4: 1.924, d2: 2.704 },
    8: { A2: 0.373, D3: 0.136, D4: 1.864, d2: 2.847 },
    9: { A2: 0.337, D3: 0.184, D4: 1.816, d2: 2.970 },
    10: { A2: 0.308, D3: 0.223, D4: 1.777, d2: 3.078 }
};

const parseInputFloat = (value) => {
    if (value === '' || value === null || value === undefined) return NaN;
    return parseFloat(value.toString().replace(',', '.'));
};

const getShiftInfo = (dateObj) => {
    const h = dateObj.getHours();
    const d = new Date(dateObj);
    if (h >= 8 && h < 18) return { shift: 1, dateStr: d.toISOString().split('T')[0], label: '1. Vardiya (08:00 - 18:00)' };
    else if (h >= 22 || h < 8) {
        if (h < 8) d.setDate(d.getDate() - 1); 
        return { shift: 2, dateStr: d.toISOString().split('T')[0], label: '2. Vardiya (22:00 - 08:00)' };
    }
    return { shift: 0, dateStr: d.toISOString().split('T')[0], label: 'Mesai Dışı (18:00 - 22:00)' }; 
};

// GRAFİK BİLEŞENİ
const SpcChart = ({ data, dataKey, centerLine, UCL, LCL, USL, LSL, title, width = 1000, height = 180, showSpecs = false }) => {
    const validData = data.filter(d => d.isComplete);
    if (!validData || validData.length === 0) return <div className="text-center text-gray-400 py-10 w-full h-full border border-dashed border-gray-300 flex items-center justify-center text-xs">GRAFİK VERİSİ YOK</div>;

    const paddingLeft = 40;  
    const paddingRight = 40; 
    const paddingY = 25;
    const chartWidth = width - paddingLeft - paddingRight;

    const allValues = [ ...validData.map(d => d[dataKey]), centerLine, UCL, LCL, ...(showSpecs && USL !== undefined ? [USL] : []), ...(showSpecs && LSL !== undefined ? [LSL] : []) ].filter(v => v !== undefined && !isNaN(v));

    const chartMin = Math.min(...allValues);
    const chartMax = Math.max(...allValues);
    const range = chartMax - chartMin;
    
    const yMax = chartMax + (range * 0.15) || chartMax + 1;
    const yMin = chartMin - (range * 0.15) || chartMin - 1;
    const safeYRange = (yMax - yMin) === 0 ? 1 : (yMax - yMin);
    
    const xScale = (index) => paddingLeft + (index * (chartWidth / (Math.max(validData.length - 1, 1))));
    const yScale = (val) => height - paddingY - ((val - yMin) / safeYRange) * (height - 2 * paddingY);

    const clY = yScale(centerLine);
    const uclY = yScale(UCL);
    const lclY = yScale(LCL);

    const linePoints = validData.map((d, i) => `${xScale(i)},${yScale(d[dataKey])}`).join(' ');

    return (
        <div className="relative w-full h-full border border-black bg-white flex flex-col items-center">
            <div className="text-[10px] font-black border-b border-black w-full text-center bg-gray-100 py-0.5">{title}</div>
            <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full p-1" preserveAspectRatio="none">
                <rect x={paddingLeft} y={uclY} width={chartWidth} height={Math.max(0, lclY - uclY)} fill="rgba(0, 0, 0, 0.03)" />
                
                {showSpecs && USL !== undefined && (
                    <g><line x1={paddingLeft} y1={yScale(USL)} x2={width - paddingRight} y2={yScale(USL)} stroke="#059669" strokeWidth="1" strokeDasharray="3,3" /><text x={width - paddingRight + 2} y={yScale(USL) + 3} className="text-[8px] fill-green-800 font-bold">USL:{USL.toFixed(3)}</text></g>
                )}
                {showSpecs && LSL !== undefined && (
                    <g><line x1={paddingLeft} y1={yScale(LSL)} x2={width - paddingRight} y2={yScale(LSL)} stroke="#059669" strokeWidth="1" strokeDasharray="3,3" /><text x={width - paddingRight + 2} y={yScale(LSL) + 3} className="text-[8px] fill-green-800 font-bold">LSL:{LSL.toFixed(3)}</text></g>
                )}

                <g><line x1={paddingLeft} y1={clY} x2={width - paddingRight} y2={clY} stroke="#2563EB" strokeWidth="1.5" /><text x={2} y={clY + 3} className="text-[8px] fill-blue-800 font-bold">CL:{centerLine.toFixed(3)}</text></g>
                <g><line x1={paddingLeft} y1={uclY} x2={width - paddingRight} y2={uclY} stroke="#DC2626" strokeWidth="1.5" strokeDasharray="4,2" /><text x={2} y={uclY + 3} className="text-[8px] fill-red-800 font-bold">UCL:{UCL.toFixed(3)}</text></g>
                <g><line x1={paddingLeft} y1={lclY} x2={width - paddingRight} y2={lclY} stroke="#DC2626" strokeWidth="1.5" strokeDasharray="4,2" /><text x={2} y={lclY + 3} className="text-[8px] fill-red-800 font-bold">LCL:{LCL.toFixed(3)}</text></g>

                <polyline points={linePoints} fill="none" stroke="#111827" strokeWidth="1" />
                {validData.map((d, i) => {
                    const val = d[dataKey];
                    const isOut = val > UCL || val < LCL;
                    return (
                        <g key={i}>
                            <circle cx={xScale(i)} cy={yScale(val)} r={isOut ? "3" : "2"} fill={isOut ? "#DC2626" : "#111827"} />
                        </g>
                    );
                })}
            </svg>
        </div>
    );
};

const CncSpcAnalysisPage = ({ db }) => {
    const [activeTab, setActiveTab] = useState('REAL'); 
    
    const [parts, setParts] = useState([]); 
    const [jobs, setJobs] = useState([]);   
    
    const [searchTerm, setSearchTerm] = useState('');
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [selectedPart, setSelectedPart] = useState(null); 
    const [selectedJob, setSelectedJob] = useState(null);
    const [selectedCriterionId, setSelectedCriterionId] = useState('');     
    
    const [spcGridData, setSpcGridData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    // İmzalar
    const [preparedBy, setPreparedBy] = useState('');
    const [checkedBy, setCheckedBy] = useState('');
    const [approvedBy, setApprovedBy] = useState('');
    
    const reportRef = useRef(null);
    const dropdownRef = useRef(null);

    const MAX_A4_COLUMNS = 25; 

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) setIsDropdownOpen(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        if (!db) return;
        const fetchData = async () => {
            const pSnap = await getDocs(collection(db, CNC_PARTS_COLLECTION));
            setParts(pSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.partName || '').localeCompare(b.partName || '')));
            const jSnap = await getDocs(query(collection(db, CNC_LATHE_JOBS_COLLECTION), orderBy('startTime', 'desc')));
            setJobs(jSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        };
        fetchData();
    }, [db]);

    const getPartLabel = (p) => `${p.orderNumber || 'KOD-YOK'} - ${p.partName || 'İsimsiz Parça'}`;
    const filteredParts = useMemo(() => {
        if (!searchTerm) return parts;
        return parts.filter(p => `${p.orderNumber||''} ${p.partName||''}`.toLowerCase().includes(searchTerm.toLowerCase()));
    }, [parts, searchTerm]);

    const selectedPartJobs = useMemo(() => {
        if (!selectedPart) return [];
        return jobs.filter(j => j.partId === selectedPart.id);
    }, [jobs, selectedPart]);

    const handleSelectPart = (part) => {
        setSelectedPart(part);
        setSearchTerm(getPartLabel(part));
        setIsDropdownOpen(false);
        setSelectedJob(null);
        setSpcGridData([]);
        const firstNumCrit = part.criteria?.find(c => c.type !== 'BOOL');
        setSelectedCriterionId(firstNumCrit ? firstNumCrit.id.toString() : '');
    };

    const handleGenerateReport = async (job) => {
        if (!job || !selectedCriterionId) return;
        setSelectedJob(job);
        setLoading(true);

        try {
            const nSize = parseInt(selectedPart.sampleQuantity) || 5;
            
            const mQuery = query(collection(db, CNC_SPC_MEASUREMENTS_COLLECTION), where('jobId', '==', job.id), where('criterionId', '==', selectedCriterionId));
            const mSnap = await getDocs(mQuery);
            const measurements = mSnap.docs.map(d => ({ id: d.id, ...d.data() }));

            const totalCols = MAX_A4_COLUMNS; 
            
            const newGrid = Array(totalCols).fill(null).map((_, i) => ({ 
                id: null, columnIndex: i, operator: '', timeStr: '', values: Array(nSize).fill('') 
            }));
            
            measurements.forEach(m => { 
                if(m.columnIndex >= 0 && m.columnIndex < totalCols) {
                    newGrid[m.columnIndex] = { 
                        id: m.id, columnIndex: m.columnIndex, operator: m.operator || '', timeStr: m.timeStr || '', 
                        values: m.values && m.values.length === nSize ? m.values : Array(nSize).fill('')
                    }; 
                }
            });
            
            setSpcGridData(newGrid);
        } catch (error) {
            console.error("Rapor hatası:", error);
            alert("Rapor verisi çekilemedi.");
        } finally {
            setLoading(false);
        }
    };

    const handleGridChange = (colIndex, field, value, rowIdx = null) => {
        const newGrid = [...spcGridData];
        if (rowIdx !== null) {
            newGrid[colIndex].values[rowIdx] = value;
        } else {
            newGrid[colIndex][field] = value;
        }
        setSpcGridData(newGrid);
    };

    const handleSaveChanges = async () => {
        if (!selectedJob || !selectedCriterionId) return;
        setSaving(true);
        try {
            for (let i = 0; i < spcGridData.length; i++) {
                const colData = spcGridData[i];
                const hasData = colData.operator?.trim() !== '' || colData.timeStr?.trim() !== '' || colData.values.some(v => v !== '');
                
                if (hasData) {
                    const docData = {
                        jobId: selectedJob.id,
                        criterionId: selectedCriterionId,
                        columnIndex: colData.columnIndex,
                        operator: colData.operator || '',
                        timeStr: colData.timeStr || '',
                        values: colData.values,
                        timestamp: Date.now() + i
                    };

                    if (colData.id) await updateDoc(doc(db, CNC_SPC_MEASUREMENTS_COLLECTION, colData.id), docData);
                    else {
                        const newDoc = await addDoc(collection(db, CNC_SPC_MEASUREMENTS_COLLECTION), docData);
                        spcGridData[i].id = newDoc.id; 
                    }
                }
            }
            alert("SPC Raporu başarıyla güncellendi!");
        } catch (error) {
            alert("Kaydetme sırasında hata.");
        } finally {
            setSaving(false);
        }
    };

    const handleDownloadPdf = () => {
        const element = reportRef.current;
        if (!element) return;

        const opt = {
            margin: 0, 
            filename: `SPC_Raporu_${selectedJob?.orderNumber || 'Rapor'}.pdf`,
            image: { type: 'jpeg', quality: 1 },
            html2canvas: { 
                scale: 2, 
                useCORS: true,
                windowWidth: element.scrollWidth,
                windowHeight: element.scrollHeight
            }, 
            jsPDF: { 
                unit: 'mm', 
                format: 'a4', 
                orientation: 'landscape',
                compress: true
            },
            pagebreak: { mode: 'avoid-all' } 
        };

        html2pdf().set(opt).from(element).save();
    };

    // --- SAYFALAMA MANTIĞI (A4 Çoğaltıcı) ---
    const spcPagesAnalysis = useMemo(() => {
        if (!selectedJob || !selectedCriterionId || spcGridData.length === 0) return [];
        const crit = selectedPart.criteria.find(c => c.id.toString() === selectedCriterionId);
        if (!crit) return [];

        const nSize = parseInt(selectedPart.sampleQuantity) || 5;
        const consts = SPC_CONSTANTS[nSize] || SPC_CONSTANTS[5];
        const nominal = parseFloat(crit.nominal);
        const USL = nominal + parseFloat(crit.upperTol);
        const LSL = nominal - Math.abs(parseFloat(crit.lowerTol));

        const pagesCount = Math.max(1, Math.ceil(spcGridData.length / MAX_A4_COLUMNS));
        
        return Array.from({length: pagesCount}).map((_, pageIdx) => {
            const pageCols = spcGridData.slice(pageIdx * MAX_A4_COLUMNS, (pageIdx + 1) * MAX_A4_COLUMNS);
            const actualSubgroups = [];
            const allUsedVals = [];

            pageCols.forEach((col) => {
                const parsedVals = col.values.map(parseInputFloat);
                const isComplete = parsedVals.every(v => !isNaN(v));
                if (isComplete) {
                    const mean = parsedVals.reduce((a,b)=>a+b,0) / nSize;
                    const range = Math.max(...parsedVals) - Math.min(...parsedVals);
                    allUsedVals.push(...parsedVals);
                    actualSubgroups.push({ isComplete: true, displayIndex: col.columnIndex + 1, mean, range, operator: col.operator, timeStr: col.timeStr || '-:-' });
                } else {
                    actualSubgroups.push({ isComplete: false, displayIndex: col.columnIndex + 1, mean: 0, range: 0 });
                }
            });

            const validGroups = actualSubgroups.filter(sg => sg.isComplete);
            const k = validGroups.length; 
            const X_double_bar = k > 0 ? validGroups.reduce((a, b) => a + b.mean, 0) / k : nominal;
            const R_bar = k > 0 ? validGroups.reduce((a, b) => a + b.range, 0) / k : 0;

            const UCL_X = X_double_bar + (consts.A2 * R_bar); const LCL_X = X_double_bar - (consts.A2 * R_bar);
            const UCL_R = consts.D4 * R_bar; const LCL_R = consts.D3 * R_bar; 
            const sigma_within = R_bar / consts.d2;
            const totalN = allUsedVals.length;
            const overallMean = totalN > 0 ? allUsedVals.reduce((a,b)=>a+b,0) / totalN : nominal;
            const variance = totalN > 1 ? allUsedVals.reduce((a, b) => a + Math.pow(b - overallMean, 2), 0) / (totalN - 1) : 0;
            const sigma_overall = Math.sqrt(variance);

            let Cp = 0, Cpk = 0, Pp = 0, Ppk = 0;
            if (sigma_within > 0) { Cp = (USL - LSL) / (6 * sigma_within); Cpk = Math.min((USL - X_double_bar) / (3 * sigma_within), (X_double_bar - LSL) / (3 * sigma_within)); }
            if (sigma_overall > 0) { Pp = (USL - LSL) / (6 * sigma_overall); Ppk = Math.min((USL - overallMean) / (3 * sigma_overall), (overallMean - LSL) / (3 * sigma_overall)); }

            return {
                pageIdx, pageCols, actualSubgroups, nSize, nominal, USL, LSL, k,
                X_double_bar, R_bar, UCL_X, LCL_X, UCL_R, LCL_R,
                Cp, Cpk, Pp, Ppk, totalN, critName: crit.name, sigma_within,
                jobPart: selectedPart
            };
        });
    }, [spcGridData, selectedJob, selectedCriterionId, selectedPart]);


    const addSpcColumns = () => {
        const nSize = parseInt(selectedPart?.sampleQuantity) || 5;
        setSpcGridData(prev => [
            ...prev,
            ...Array(MAX_A4_COLUMNS).fill(null).map((_, i) => ({ id: null, columnIndex: prev.length + i, operator: '', timeStr: '', values: Array(nSize).fill('') }))
        ]);
    };


    return (
        <div className="p-4 md:p-6 max-w-7xl mx-auto min-h-screen bg-gray-100 dark:bg-gray-900 font-sans text-sm">
            
            <div className="flex bg-white dark:bg-gray-800 p-1 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 w-fit mb-6" data-html2canvas-ignore="true">
                <button onClick={() => setActiveTab('REAL')} className={`px-6 py-2 rounded-lg font-bold transition flex items-center ${activeTab === 'REAL' ? 'bg-blue-100 text-blue-800' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
                    <Activity className="w-4 h-4 mr-2" /> A4 SPC Analiz Sayfası
                </button>
                <button onClick={() => setActiveTab('SIMULATION')} className={`px-6 py-2 rounded-lg font-bold transition flex items-center ${activeTab === 'SIMULATION' ? 'bg-indigo-100 text-indigo-800' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
                    <Layers className="w-4 h-4 mr-2" /> Simülasyon
                </button>
            </div>

            {activeTab === 'SIMULATION' ? (
                <CncSpcSimulationTab db={db} />
            ) : (
                <>
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 mb-6" data-html2canvas-ignore="true">
                        <div className="w-full relative" ref={dropdownRef}>
                            <label className="block font-bold text-gray-700 dark:text-gray-300 uppercase mb-2">1. SPC Analizi İçin Parça Arayın</label>
                            <div className="relative">
                                <Search className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                                <input type="text" placeholder="Parça adı veya koduna göre ara..." className="w-full pl-10 pr-10 p-2.5 border rounded-lg bg-gray-50 dark:bg-gray-700 outline-none focus:ring-2 focus:ring-blue-500 uppercase dark:text-white dark:border-gray-600" value={searchTerm || ''} onChange={(e) => { setSearchTerm(e.target.value); setIsDropdownOpen(true); }} onFocus={() => setIsDropdownOpen(true)} />
                                {searchTerm && <button onClick={() => { setSearchTerm(''); setSelectedPart(null); setSelectedJob(null); setSpcGridData([]); }} className="absolute right-3 top-3 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-full p-1"><X className="w-5 h-5 text-gray-500" /></button>}
                            </div>
                            {isDropdownOpen && (
                                <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl max-h-60 overflow-y-auto">
                                    {filteredParts.map(part => (
                                        <div key={part.id} className="p-3 hover:bg-blue-50 dark:hover:bg-gray-700 cursor-pointer border-b dark:border-gray-700 flex justify-between" onClick={() => handleSelectPart(part)}>
                                            <div className="dark:text-white"><span className="font-bold text-blue-600 pr-2">{part.orderNumber}</span>{part.partName}</div>
                                            {part.isSpcEnabled && <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-2 py-1 rounded">SPC AKTİF</span>}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {selectedPart && (
                            <div className="mt-6">
                                <h3 className="font-bold text-gray-800 dark:text-gray-200 mb-3 flex items-center"><History className="w-5 h-5 mr-2 text-blue-500" /> İş Emri Geçmişi</h3>
                                <div className="overflow-x-auto rounded-lg border dark:border-gray-700 shadow-sm max-h-48">
                                    <table className="w-full text-left">
                                        <thead className="bg-gray-100 dark:bg-gray-700 uppercase text-xs sticky top-0">
                                            <tr><th className="p-3 dark:text-gray-300">İş Emri</th><th className="p-3 dark:text-gray-300">Tarih</th><th className="p-3 text-right dark:text-gray-300">İşlem</th></tr>
                                        </thead>
                                        <tbody>
                                            {selectedPartJobs.map((job) => (
                                                <tr key={job.id} className={`border-b dark:border-gray-700 hover:bg-blue-50 dark:hover:bg-gray-600 ${selectedJob?.id === job.id ? 'bg-blue-50 dark:bg-gray-700' : 'bg-white dark:bg-gray-800'}`}>
                                                    <td className="p-3 font-bold dark:text-white">{job.orderNumber}</td>
                                                    <td className="p-3 text-gray-600 dark:text-gray-400">{formatDateTime(job.startTime).split(' ')[0]}</td>
                                                    <td className="p-3 text-right">
                                                        <button onClick={() => handleGenerateReport(job)} className="px-3 py-1.5 font-bold rounded bg-blue-600 text-white hover:bg-blue-700 text-xs">Formu Aç</button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>

                    {selectedJob && spcPagesAnalysis.length > 0 && (
                        <div className="animate-in fade-in slide-in-from-bottom-4">
                            
                            {/* KONTROL BAR */}
                            <div className="flex flex-wrap justify-between items-center bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 mb-4 gap-4" data-html2canvas-ignore="true">
                                <div className="flex items-center gap-3">
                                    <label className="font-bold text-gray-600 dark:text-gray-300 uppercase text-xs">Kriter:</label>
                                    <select className="p-2 border rounded bg-gray-50 dark:bg-gray-700 dark:text-white dark:border-gray-600 font-bold outline-none" value={selectedCriterionId} onChange={(e) => setSelectedCriterionId(e.target.value)}>
                                        {selectedPart.criteria.filter(c => c.type !== 'BOOL').map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                    </select>
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={addSpcColumns} className="px-5 py-2.5 bg-indigo-100 text-indigo-700 font-bold rounded-lg shadow hover:bg-indigo-200 flex items-center transition text-xs">
                                        <Plus className="w-4 h-4 mr-2"/> YENİ SAYFA EKLE
                                    </button>
                                    <button onClick={handleSaveChanges} disabled={saving} className="px-5 py-2.5 bg-blue-600 text-white font-bold rounded-lg shadow hover:bg-blue-700 flex items-center transition text-xs">
                                        <Save className="w-4 h-4 mr-2"/> KAYDET
                                    </button>
                                    <button onClick={handleDownloadPdf} className="px-5 py-2.5 bg-green-600 text-white font-bold rounded-lg shadow hover:bg-green-700 flex items-center transition text-xs">
                                        <Download className="w-4 h-4 mr-2"/> PDF İNDİR (A4)
                                    </button>
                                </div>
                            </div>

                            {/* A4 YATAY KAPSAYICI */}
                            <div className="overflow-x-auto bg-gray-300 dark:bg-gray-700 p-4 rounded-xl flex flex-col items-center gap-8 shadow-inner">
                                {spcPagesAnalysis.map((pageData, pageIdx) => (
                                    <div key={pageIdx} className="relative flex flex-col items-center">
                                        
                                        <div ref={pageIdx === 0 ? reportRef : null} className="bg-white text-black box-border flex flex-col shadow-xl" style={{ width: '297mm', minHeight: '210mm', padding: '8mm' }}>
                                            
                                            {/* ANTET KISMI */}
                                            <div className="grid grid-cols-12 border-2 border-black mb-1 shrink-0 bg-white h-[18mm]">
                                                <div className="col-span-3 border-r-2 border-black flex items-center justify-center p-1">
                                                    <img src="/logo512.png" alt="Logo" className="h-10 object-contain" />
                                                </div>
                                                <div className="col-span-6 border-r-2 border-black flex flex-col items-center justify-center text-center">
                                                    <h1 className="text-xl font-black uppercase tracking-wider">NİCELİK KONTROL KARTI (X-R)</h1>
                                                </div>
                                                <div className="col-span-3 text-[9px] grid grid-cols-1 divide-y border-black">
                                                    <div className="flex justify-between px-2 py-0.5"><span className="font-bold">Sayfa No:</span><span>{pageIdx + 1} / {spcPagesAnalysis.length}</span></div>
                                                    <div className="flex justify-between px-2 py-0.5"><span className="font-bold">Çalışma Tarihi:</span><span>{new Date().toLocaleDateString('tr-TR')}</span></div>
                                                    <div className="flex justify-between px-2 py-0.5"><span className="font-bold">Doküman No:</span><span>FR 09-715-00</span></div>
                                                </div>
                                            </div>

                                            <div className="border-2 border-t-0 border-black mb-1.5 flex text-[9px] shrink-0 bg-white divide-x border-black h-[14mm]">
                                                <div className="flex-1 flex flex-col divide-y border-black">
                                                    <div className="flex px-1 items-center flex-1"><span className="font-bold w-16">Parça Adı:</span><span className="truncate">{selectedPart.partName}</span></div>
                                                    <div className="flex px-1 items-center flex-1"><span className="font-bold w-16">Müşteri:</span><span className="uppercase">{selectedPart.targetCustomer || 'STANDART'}</span></div>
                                                </div>
                                                <div className="flex-1 flex flex-col divide-y border-black">
                                                    <div className="flex px-1 items-center flex-1"><span className="font-bold w-20">Operasyon:</span><span className="truncate">{selectedJob.machine}</span></div>
                                                    <div className="flex px-1 items-center flex-1"><span className="font-bold w-20">İş Emri No:</span><span className="font-bold text-lg text-purple-800 truncate">{selectedJob.orderNumber}</span></div>
                                                </div>
                                                <div className="flex-1 flex flex-col divide-y border-black bg-gray-50">
                                                    <div className="flex px-1 items-center flex-1"><span className="font-bold w-16">Karakteristik:</span><span className="font-bold text-blue-700 truncate">{pageData.critName}</span></div>
                                                    <div className="flex px-1 items-center flex-1"><span className="font-bold w-16">Nom/Tol:</span><span className="font-black text-[10px]">{pageData.nominal}</span> <span className="font-bold text-green-700 ml-1"> (+{pageData.USL - pageData.nominal} / -{pageData.nominal - pageData.LSL})</span></div>
                                                </div>
                                                <div className="flex-1 flex flex-col divide-y border-black">
                                                    <div className="flex px-1 items-center flex-1"><span className="font-bold w-16">Ölç. Sayısı:</span><span>n = {pageData.nSize}</span></div>
                                                    <div className="flex px-1 items-center flex-1"><span className="font-bold w-16">Frekans:</span><span>{selectedPart.sampleFrequencyMinutes} dk</span></div>
                                                </div>
                                            </div>

                                            {/* EXCEL TABLOSU */}
                                            <div className="border-2 border-black w-full flex flex-col text-[8.5px] shrink-0 mb-1.5 bg-white">
                                                
                                                {/* Başlık */}
                                                <div className="flex border-b border-black text-center font-bold bg-gray-200 h-[14px] items-center">
                                                    <div className="w-[50px] shrink-0 border-r border-black h-full flex items-center justify-center">Örnek No</div>
                                                    {pageData.pageCols.map((col, i) => <div key={i} className="flex-1 border-r border-black last:border-0 h-full flex items-center justify-center">{col.columnIndex + 1}</div>)}
                                                </div>
                                                
                                                {/* Saat */}
                                                <div className="flex border-b border-black text-center h-[16px] items-center bg-gray-50">
                                                    <div className="w-[50px] shrink-0 border-r border-black font-bold h-full flex items-center justify-center">Saat</div>
                                                    {pageData.pageCols.map((col, i) => (
                                                        <div key={i} className="flex-1 border-r border-black last:border-0 h-full">
                                                            <input type="text" className="w-full h-full text-center outline-none bg-transparent focus:bg-yellow-200 font-mono" value={col.timeStr ?? ''} onChange={(e) => handleGridChange(col.columnIndex, 'timeStr', e.target.value)} />
                                                        </div>
                                                    ))}
                                                </div>
                                                
                                                {/* Opr */}
                                                <div className="flex text-center border-b border-black bg-gray-50 h-[16px] items-center">
                                                    <div className="w-[50px] shrink-0 border-r border-black font-bold h-full flex items-center justify-center">Opr.</div>
                                                    {pageData.pageCols.map((col, i) => (
                                                        <div key={i} className="flex-1 border-r border-black last:border-0 h-full">
                                                            <input type="text" className="w-full h-full text-center outline-none bg-transparent uppercase font-bold focus:bg-yellow-200 text-[7px]" value={col.operator ?? ''} onChange={(e) => handleGridChange(col.columnIndex, 'operator', e.target.value)} />
                                                        </div>
                                                    ))}
                                                </div>

                                                {/* X Değerleri */}
                                                {Array.from({ length: pageData.nSize }).map((_, rIdx) => (
                                                    <div key={`X${rIdx}`} className="flex border-b border-black text-center h-[16px] items-center bg-white">
                                                        <div className="w-[50px] shrink-0 border-r border-black font-bold h-full flex items-center justify-center bg-gray-100">X{rIdx + 1}</div>
                                                        {pageData.pageCols.map((col, cIdx) => {
                                                            let val = col.values[rIdx] ?? '';
                                                            let isErr = false;
                                                            if (val !== '') {
                                                                const nVal = parseInputFloat(val);
                                                                if (!isNaN(nVal) && (nVal > pageData.USL || nVal < pageData.LSL)) isErr = true;
                                                            }
                                                            return (
                                                                <div key={cIdx} className="flex-1 border-r border-black last:border-0 h-full">
                                                                    <input type="text" className={`w-full h-full text-center outline-none focus:bg-yellow-200 font-mono ${isErr ? 'text-red-600 font-extrabold bg-red-50' : ''}`} value={val} onChange={(e) => handleGridChange(col.columnIndex, 'values', e.target.value, rIdx)} />
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                ))}

                                                {/* Ort(X) */}
                                                <div className="flex border-b border-black text-center h-[16px] items-center bg-blue-50">
                                                    <div className="w-[50px] shrink-0 border-r border-black font-bold h-full flex items-center justify-center">X̄</div>
                                                    {pageData.actualSubgroups.map((sg, i) => <div key={i} className="flex-1 border-r border-black last:border-0 h-full flex items-center justify-center font-bold text-blue-900 font-mono">{sg.isComplete ? sg.mean.toFixed(3) : ''}</div>)}
                                                </div>

                                                {/* Fark(R) */}
                                                <div className="flex text-center h-[16px] items-center bg-blue-50">
                                                    <div className="w-[50px] shrink-0 border-r border-black font-bold h-full flex items-center justify-center">R</div>
                                                    {pageData.actualSubgroups.map((sg, i) => <div key={i} className="flex-1 border-r border-black last:border-0 h-full flex items-center justify-center font-bold text-blue-900 font-mono">{sg.isComplete ? sg.range.toFixed(3) : ''}</div>)}
                                                </div>
                                            </div>

                                            {/* 3. GRAFİKLER VE HESAPLAMALAR ALANI */}
                                            <div className="flex flex-1 gap-2 overflow-hidden h-[95mm]">
                                                <div className="flex-1 flex flex-col gap-1.5 h-full">
                                                    <div className="flex-1 border border-black flex flex-col min-h-0 relative">
                                                        <SpcChart data={pageData.actualSubgroups} dataKey="mean" centerLine={pageData.X_double_bar} UCL={pageData.UCL_X} LCL={pageData.LCL_X} USL={pageData.USL} LSL={pageData.LSL} showSpecs={true} width={750} height={140} title="X ORTALAMA KARTI" />
                                                    </div>
                                                    <div className="flex-1 border border-black flex flex-col min-h-0 relative">
                                                        <SpcChart data={pageData.actualSubgroups} dataKey="range" centerLine={pageData.R_bar} UCL={pageData.UCL_R} LCL={pageData.LCL_R} showSpecs={false} width={750} height={140} title="R (ARALIK) KARTI" />
                                                    </div>
                                                </div>
                                                <div className="w-[160px] shrink-0 flex flex-col gap-1.5 text-[8.5px] h-full">
                                                    <div className="border border-black p-1 bg-gray-50 flex flex-col justify-center">
                                                        <div className="font-black border-b border-gray-400 text-center mb-0.5">İSTATİSTİK (Sayfa {pageIdx+1})</div>
                                                        <div className="flex justify-between"><span>Ölçüm (k):</span> <span className="font-bold">{pageData.k}</span></div>
                                                        <div className="flex justify-between"><span>X̄X̄ (Gen. Ort):</span> <span className="font-bold text-blue-800">{pageData.X_double_bar.toFixed(3)}</span></div>
                                                        <div className="flex justify-between"><span>R̄ (Ort. R):</span> <span className="font-bold text-blue-800">{pageData.R_bar.toFixed(3)}</span></div>
                                                        <div className="flex justify-between font-bold text-red-600 border-t border-gray-300 pt-0.5 mt-0.5"><span>Sapma(σ):</span> <span>{pageData.sigma_within.toFixed(4)}</span></div>
                                                        <div className="font-black border-b border-gray-400 text-center mt-1 mb-0.5">LİMİTLER</div>
                                                        <div className="flex justify-between text-red-700 font-bold"><span>UCL(X):</span> <span>{pageData.UCL_X.toFixed(3)}</span></div>
                                                        <div className="flex justify-between text-red-700 font-bold"><span>LCL(X):</span> <span>{pageData.LCL_X.toFixed(3)}</span></div>
                                                        <div className="flex justify-between text-purple-700 font-bold"><span>UCL(R):</span> <span>{pageData.UCL_R.toFixed(3)}</span></div>
                                                        <div className="flex justify-between text-purple-700 font-bold"><span>LCL(R):</span> <span>{pageData.LCL_R.toFixed(3)}</span></div>
                                                    </div>
                                                    <div className="border border-black p-1 bg-white">
                                                        <div className="font-black border-b border-gray-400 text-center mb-1 uppercase">YETERLİLİK ({pageData.jobPart.targetCustomer || 'GENEL'})</div>
                                                        <div className="grid grid-cols-2 gap-1 text-center font-bold">
                                                            <div className="bg-gray-100 p-0.5">Cp<br/><span className="text-xs text-black">{pageData.Cp.toFixed(2)}</span></div>
                                                            <div className="bg-gray-100 p-0.5">Cpk<br/><span className={`text-xs ${pageData.Cpk >= (pageData.jobPart.targetCpk || 1.33) ? 'text-green-600' : 'text-red-600'}`}>{pageData.Cpk.toFixed(2)}</span></div>
                                                            <div className="bg-gray-100 p-0.5">Pp<br/><span className="text-xs text-black">{pageData.Pp.toFixed(2)}</span></div>
                                                            <div className="bg-gray-100 p-0.5">Ppk<br/><span className={`text-xs ${pageData.Ppk >= (pageData.jobPart.targetPpk || 1.33) ? 'text-green-600' : 'text-red-600'}`}>{pageData.Ppk.toFixed(2)}</span></div>
                                                        </div>
                                                    </div>
                                                    <div className="border border-black p-1 bg-yellow-50 flex-1 flex flex-col justify-center">
                                                        <div className="font-black text-center border-b border-gray-400 mb-0.5">KATSAYILAR</div>
                                                        <table className="w-full text-center">
                                                            <thead><tr className="border-b border-gray-400 font-bold text-[7px]"><td>n</td><td>A2</td><td>D3</td><td>D4</td><td>d2</td></tr></thead>
                                                            <tbody className="text-[8px]">
                                                                {[2, 3, 4, 5, 6].map(num => (
                                                                    <tr key={num} className={pageData.nSize === num ? "bg-yellow-300 font-black" : ""}>
                                                                        <td>{num}</td><td>{SPC_CONSTANTS[num].A2.toFixed(3)}</td><td>{SPC_CONSTANTS[num].D3}</td><td>{SPC_CONSTANTS[num].D4.toFixed(3)}</td><td>{SPC_CONSTANTS[num].d2.toFixed(3)}</td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* İMZALAR */}
                                            <div className="mt-2 border-t-2 border-black pt-2 grid grid-cols-3 gap-8 text-center text-xs shrink-0 h-[15mm]">
                                                <div><div className="font-bold mb-3">Hazırlayan</div><input type="text" className="border-b border-black border-dashed outline-none text-center uppercase w-48 bg-transparent" placeholder="İmza/İsim" value={preparedBy} onChange={e=>setPreparedBy(e.target.value)}/></div>
                                                <div><div className="font-bold mb-3">Kontrol Eden</div><input type="text" className="border-b border-black border-dashed outline-none text-center uppercase w-48 bg-transparent" placeholder="İmza/İsim" value={checkedBy} onChange={e=>setCheckedBy(e.target.value)}/></div>
                                                <div><div className="font-bold mb-3">Onaylayan</div><input type="text" className="border-b border-black border-dashed outline-none text-center uppercase w-48 bg-transparent" placeholder="İmza/İsim" value={approvedBy} onChange={e=>setApprovedBy(e.target.value)}/></div>
                                            </div>

                                        </div>
                                        {/* Çoklu sayfalarda PDF ayrım çizgisi */}
                                        {pageIdx < spcPagesAnalysis.length - 1 && <div className="html2pdf__page-break"></div>}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default CncSpcAnalysisPage;