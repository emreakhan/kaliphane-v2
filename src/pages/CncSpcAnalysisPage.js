// src/pages/CncSpcAnalysisPage.js

import React, { useState, useEffect, useMemo, useRef } from 'react';
import html2pdf from 'html2pdf.js'; 
import { 
    Activity, Search, Layers, X, Save, Plus, Download, History, Wand2
} from 'lucide-react';
import { 
    collection, query, where, getDocs, doc, updateDoc, orderBy, addDoc 
} from '../config/firebase.js';
import { 
    CNC_PARTS_COLLECTION, CNC_LATHE_JOBS_COLLECTION 
} from '../config/constants.js';
import { formatDateTime } from '../utils/dateUtils.js';
import CncSpcSimulationTab from './CncSpcSimulationTab.js';

const CNC_SPC_MEASUREMENTS_COLLECTION = 'cnc_spc_measurements';

// --- İSTATİSTİKSEL KATSAYILAR (AIAG SPC) ---
const SPC_CONSTANTS = {
    2: { A2: 1.880, d2: 1.128, D3: 0, D4: 3.267 },
    3: { A2: 1.023, d2: 1.693, D3: 0, D4: 2.574 },
    4: { A2: 0.729, d2: 2.059, D3: 0, D4: 2.282 },
    5: { A2: 0.577, d2: 2.326, D3: 0, D4: 2.114 },
    6: { A2: 0.483, d2: 2.534, D3: 0, D4: 2.004 },
    7: { A2: 0.419, d2: 2.704, D3: 0.076, D4: 1.924 },
    8: { A2: 0.373, d2: 2.847, D3: 0.136, D4: 1.864 },
    9: { A2: 0.337, d2: 2.970, D3: 0.184, D4: 1.816 },
    10: { A2: 0.308, d2: 3.078, D3: 0.223, D4: 1.777 }
};

const parseInputFloat = (value) => {
    if (value === '' || value === null || value === undefined) return NaN;
    return parseFloat(value.toString().replace(',', '.'));
};

const randn_bm = () => {
    let u = 0, v = 0;
    while(u === 0) u = Math.random();
    while(v === 0) v = Math.random();
    return Math.sqrt( -2.0 * Math.log( u ) ) * Math.cos( 2.0 * Math.PI * v );
};

// GRAFİK BİLEŞENİ
const SpcChart = ({ data, dataKey, centerLine, UCL, LCL, USL, LSL, title, width = 1200, height = 160, showSpecs = false }) => {
    const validData = data.filter(d => d.isComplete);
    if (!validData || validData.length === 0) return <div className="text-center text-gray-400 py-10 w-full h-full border border-dashed border-gray-300 flex items-center justify-center text-sm bg-gray-50">GRAFİK VERİSİ YOK</div>;

    const paddingLeft = 60;  
    const paddingRight = 60; 
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
            <div className="text-sm font-black border-b border-black w-full text-center bg-gray-100 py-1.5">{title}</div>
            <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full p-2" preserveAspectRatio="none">
                <rect x={paddingLeft} y={uclY} width={chartWidth} height={Math.max(0, lclY - uclY)} fill="rgba(0, 0, 0, 0.03)" />
                
                {showSpecs && USL !== undefined && (
                    <g><line x1={paddingLeft} y1={yScale(USL)} x2={width - paddingRight} y2={yScale(USL)} stroke="#059669" strokeWidth="2" strokeDasharray="4,4" /><text x={width - paddingRight + 5} y={yScale(USL) + 4} className="text-xs fill-green-800 font-bold">USL:{USL.toFixed(3)}</text></g>
                )}
                {showSpecs && LSL !== undefined && (
                    <g><line x1={paddingLeft} y1={yScale(LSL)} x2={width - paddingRight} y2={yScale(LSL)} stroke="#059669" strokeWidth="2" strokeDasharray="4,4" /><text x={width - paddingRight + 5} y={yScale(LSL) + 4} className="text-xs fill-green-800 font-bold">LSL:{LSL.toFixed(3)}</text></g>
                )}

                <g><line x1={paddingLeft} y1={clY} x2={width - paddingRight} y2={clY} stroke="#2563EB" strokeWidth="2" /><text x={5} y={clY + 4} className="text-xs fill-blue-800 font-bold">CL:{centerLine.toFixed(3)}</text></g>
                <g><line x1={paddingLeft} y1={uclY} x2={width - paddingRight} y2={uclY} stroke="#DC2626" strokeWidth="2" strokeDasharray="5,3" /><text x={5} y={uclY + 4} className="text-xs fill-red-800 font-bold">UCL:{UCL.toFixed(3)}</text></g>
                <g><line x1={paddingLeft} y1={lclY} x2={width - paddingRight} y2={lclY} stroke="#DC2626" strokeWidth="2" strokeDasharray="5,3" /><text x={5} y={lclY + 4} className="text-xs fill-red-800 font-bold">LCL:{LCL.toFixed(3)}</text></g>

                <polyline points={linePoints} fill="none" stroke="#111827" strokeWidth="1.5" />
                {validData.map((d, i) => {
                    const val = d[dataKey];
                    const isOut = val > UCL || val < LCL;
                    return (
                        <g key={i}>
                            <circle cx={xScale(i)} cy={yScale(val)} r={isOut ? "5" : "3.5"} fill={isOut ? "#DC2626" : "#111827"} />
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

    const [preparedBy, setPreparedBy] = useState('');
    const [checkedBy, setCheckedBy] = useState('');
    const [approvedBy, setApprovedBy] = useState('');
    
    const reportRef = useRef(null);
    const pageRefs = useRef([]); 
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

            let maxCol = -1;
            measurements.forEach(m => { if (m.columnIndex > maxCol) maxCol = m.columnIndex; });
            const totalCols = Math.max(MAX_A4_COLUMNS, Math.ceil((maxCol + 1) / MAX_A4_COLUMNS) * MAX_A4_COLUMNS); 
            
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
            alert("Rapor verisi çekilemedi.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (selectedJob && selectedCriterionId) handleGenerateReport(selectedJob);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedCriterionId]);


    const addSpcColumns = () => {
        const nSize = parseInt(selectedPart?.sampleQuantity) || 5;
        setSpcGridData(prev => [
            ...prev,
            ...Array(MAX_A4_COLUMNS).fill(null).map((_, i) => ({ id: null, columnIndex: prev.length + i, operator: '', timeStr: '', values: Array(nSize).fill('') }))
        ]);
    };

    const handleGridChange = (colIndex, field, value, rowIdx = null) => {
        const newGrid = [...spcGridData];
        if (rowIdx !== null) newGrid[colIndex].values[rowIdx] = value;
        else newGrid[colIndex][field] = value;
        setSpcGridData(newGrid);
    };

    const handleAutoFill = () => {
        if (!selectedPart || !selectedCriterionId || spcGridData.length === 0) return;
        const crit = selectedPart.criteria.find(c => c.id.toString() === selectedCriterionId.toString());
        if (!crit) return;

        const confirmFill = window.confirm("Tüm BOŞ ölçümler, hedeflenen Cpk/Ppk performansına uygun olarak rastgele doldurulacaktır. Onaylıyor musunuz?");
        if (!confirmFill) return;

        const nominal = parseFloat(crit.nominal);
        const upperTol = parseFloat(crit.upperTol);
        const lowerTol = Math.abs(parseFloat(crit.lowerTol));
        const USL = nominal + upperTol;
        const LSL = nominal - lowerTol;

        const targetCpk = parseFloat(selectedPart.targetCpk) || 1.33;
        const targetPpk = parseFloat(selectedPart.targetPpk) || 1.33;
        const targetScore = Math.max(targetCpk, targetPpk) + 0.2; 

        const targetSigma = (USL - LSL) / (6 * targetScore);
        
        const decimalStr = crit.nominal.toString();
        let decimalPlaces = decimalStr.includes('.') ? decimalStr.split('.')[1].length : 3;
        if(decimalPlaces < 2) decimalPlaces = 2; 
        if(decimalPlaces > 3) decimalPlaces = 3; 

        let currentHour = 8;
        let currentMin = 0;
        const freqMins = parseInt(selectedPart.sampleFrequencyMinutes) || 25;

        const newGrid = spcGridData.map((col) => {
            let timeStr = col.timeStr;
            if (!timeStr) {
                timeStr = `${currentHour.toString().padStart(2, '0')}:${currentMin.toString().padStart(2, '0')}`;
                currentMin += freqMins;
                if(currentMin >= 60) {
                    currentHour += Math.floor(currentMin / 60);
                    currentMin = currentMin % 60;
                }
                if(currentHour >= 24) currentHour = currentHour % 24;
            }

            const newValues = col.values.map(v => {
                if (v === '' || v === null || v === undefined) {
                    let randomVal = nominal + randn_bm() * targetSigma;
                    if (randomVal > USL - (targetSigma/2)) randomVal = USL - targetSigma/2;
                    if (randomVal < LSL + (targetSigma/2)) randomVal = LSL + targetSigma/2;
                    return randomVal.toFixed(decimalPlaces);
                }
                return v;
            });

            return {
                ...col,
                operator: col.operator || 'OTO',
                timeStr: timeStr,
                values: newValues
            };
        });

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

    // --- PDF ÇIKTI AYARLARI (Geniş Format, Otomatik Ölçekleme) ---
    const getPdfOptions = (filename) => {
        return {
            margin: [2, 2, 2, 2], // Çok ince bir kenar boşluğu, pdf motoru içeriği buna göre otomatik küçültecek
            filename: filename,
            image: { type: 'jpeg', quality: 1 },
            html2canvas: { scale: 2, useCORS: true, windowWidth: 1280 }, // Ekranı 1280px genişliğinde çizer
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape', compress: true },
            pagebreak: { mode: 'css', before: '.html2pdf__page-break' } // Kusursuz sayfa bölme komutu
        };
    };

    const handleDownloadSinglePagePdf = (pageIdx, pageLabel) => {
        const element = pageRefs.current[pageIdx];
        if (!element) return;
        html2pdf().set(getPdfOptions(`SPC_Kart_${selectedJob?.orderNumber}_${pageLabel}.pdf`)).from(element).save();
    };

    const handleDownloadAllPdf = () => {
        const element = reportRef.current;
        if (!element) return;
        html2pdf().set(getPdfOptions(`SPC_Raporu_TUMU_${selectedJob?.orderNumber}.pdf`)).from(element).save();
    };

    const spcPagesAnalysis = useMemo(() => {
        if (!selectedJob || !selectedCriterionId || spcGridData.length === 0) return [];
        const crit = selectedPart.criteria.find(c => c.id.toString() === selectedCriterionId);
        if (!crit) return [];

        const nSize = parseInt(selectedPart.sampleQuantity) || 5;
        const consts = SPC_CONSTANTS[nSize] || SPC_CONSTANTS[5];
        const nominal = parseFloat(crit.nominal);
        const upperTol = parseFloat(crit.upperTol);
        const lowerTol = parseFloat(crit.lowerTol);
        const USL = nominal + upperTol;
        const LSL = nominal - Math.abs(lowerTol);

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
                X_double_bar, R_bar, UCL_X, LCL_X, UCL_R, LCL_R, upperTol, lowerTol,
                Cp, Cpk, Pp, Ppk, totalN, critName: crit.name, sigma_within,
                jobPart: selectedPart
            };
        });
    }, [spcGridData, selectedJob, selectedCriterionId, selectedPart]);


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
                                    <button onClick={addSpcColumns} className="px-3 py-2.5 bg-indigo-100 text-indigo-700 font-bold rounded-lg shadow hover:bg-indigo-200 flex items-center transition text-xs">
                                        <Plus className="w-4 h-4 mr-2"/> SAYFA EKLE
                                    </button>
                                    <button onClick={handleAutoFill} className="px-3 py-2.5 bg-yellow-500 hover:bg-yellow-600 text-white font-bold rounded-lg shadow flex items-center transition text-xs">
                                        <Wand2 className="w-4 h-4 mr-2"/> OTO-DOLDUR
                                    </button>
                                    <button onClick={handleSaveChanges} disabled={saving} className="px-3 py-2.5 bg-blue-600 text-white font-bold rounded-lg shadow hover:bg-blue-700 flex items-center transition text-xs">
                                        <Save className="w-4 h-4 mr-2"/> KAYDET
                                    </button>
                                    <button onClick={handleDownloadAllPdf} className="px-3 py-2.5 bg-green-600 text-white font-bold rounded-lg shadow hover:bg-green-700 flex items-center transition text-xs">
                                        <Download className="w-4 h-4 mr-2"/> TÜMÜNÜ İNDİR
                                    </button>
                                </div>
                            </div>

                            {/* EKRAN İÇİN GENİŞLİK AYARI (1280px genişlik ile rahat rahat sığar) */}
                            <div className="w-full overflow-x-auto bg-gray-300 dark:bg-gray-700 p-4 sm:p-8 rounded-xl shadow-inner flex flex-col items-center">
                                <div ref={reportRef} className="flex flex-col gap-10">
                                    {spcPagesAnalysis.map((pageData, pageIdx) => (
                                        <div key={pageIdx} ref={(el) => (pageRefs.current[pageIdx] = el)} className="flex flex-col items-center w-full">
                                            
                                            {/* SADECE BU SAYFAYI İNDİR BUTONU */}
                                            <div className="w-[1280px] flex justify-end mb-2" data-html2canvas-ignore="true">
                                                <button onClick={() => handleDownloadSinglePagePdf(pageIdx, `Sayfa_${pageIdx+1}`)} className="px-4 py-2 bg-green-600 text-white font-bold rounded shadow hover:bg-green-700 flex items-center transition text-xs">
                                                    <Download className="w-4 h-4 mr-2"/> BU BÖLÜMÜ İNDİR (2 SAYFA PDF)
                                                </button>
                                            </div>

                                            {/* ========================================================= */}
                                            {/* PDF 1. SAYFA: TABLO VE GRAFİKLER (1280px genişlik, esnek yükseklik) */}
                                            {/* ========================================================= */}
                                            <div className="bg-white text-black p-6 shadow-xl flex flex-col w-[1280px] border border-gray-200" style={{ minHeight: '880px', boxSizing: 'border-box' }}>
                                                
                                                {/* ANTET */}
                                                <div className="grid grid-cols-12 border-2 border-black h-[60px] shrink-0 mb-3">
                                                    <div className="col-span-3 border-r-2 border-black flex items-center justify-center p-2">
                                                        <img src="/logo512.png" alt="Logo" className="h-10 object-contain" />
                                                    </div>
                                                    <div className="col-span-6 border-r-2 border-black flex items-center justify-center text-center">
                                                        <h1 className="text-2xl font-black uppercase tracking-wider">NİCELİK KONTROL KARTI (X-R)</h1>
                                                    </div>
                                                    <div className="col-span-3 text-xs grid grid-cols-1 divide-y border-black font-bold">
                                                        <div className="flex justify-between px-3 items-center h-full"><span>Sayfa No:</span><span>{pageIdx + 1} / {spcPagesAnalysis.length}</span></div>
                                                        <div className="flex justify-between px-3 items-center h-full"><span>Çalışma Tarihi:</span><span>{new Date().toLocaleDateString('tr-TR')}</span></div>
                                                        <div className="flex justify-between px-3 items-center h-full"><span>Doküman No:</span><span>FR 09-715-00</span></div>
                                                    </div>
                                                </div>

                                                {/* BİLGİLER */}
                                                <div className="border-2 border-black flex text-xs divide-x border-black h-[50px] shrink-0 mb-3">
                                                    <div className="flex-1 flex flex-col divide-y border-black">
                                                        <div className="flex px-3 items-center flex-1"><span className="font-bold mr-2 whitespace-nowrap">Parça Adı:</span><span className="truncate">{selectedPart.partName}</span></div>
                                                        <div className="flex px-3 items-center flex-1"><span className="font-bold mr-2 whitespace-nowrap">Müşteri:</span><span className="uppercase truncate">{selectedPart.targetCustomer || 'STANDART'}</span></div>
                                                    </div>
                                                    <div className="flex-1 flex flex-col divide-y border-black">
                                                        <div className="flex px-3 items-center flex-1"><span className="font-bold mr-2 whitespace-nowrap">Operasyon:</span><span className="truncate">{selectedJob.machine}</span></div>
                                                        <div className="flex px-3 items-center flex-1"><span className="font-bold mr-2 whitespace-nowrap">İş Emri No:</span><span className="font-bold text-base text-purple-800 truncate">{selectedJob.orderNumber}</span></div>
                                                    </div>
                                                    <div className="flex-1 flex flex-col divide-y border-black bg-gray-50">
                                                        <div className="flex px-3 items-center flex-1"><span className="font-bold mr-2 whitespace-nowrap">Karakteristik:</span><span className="font-bold text-blue-700 truncate">{pageData.critName}</span></div>
                                                        <div className="flex px-3 items-center flex-1"><span className="font-bold mr-2 whitespace-nowrap">Nom/Tol:</span><span className="font-black text-[14px]">{pageData.nominal}</span> <span className="font-bold text-green-700 ml-1 whitespace-nowrap"> (+{pageData.upperTol} / -{Math.abs(pageData.lowerTol)})</span></div>
                                                    </div>
                                                    <div className="flex-1 flex flex-col divide-y border-black">
                                                        <div className="flex px-3 items-center flex-1"><span className="font-bold mr-2 whitespace-nowrap">Ölç. Sayısı:</span><span className="truncate">n = {pageData.nSize}</span></div>
                                                        <div className="flex px-3 items-center flex-1"><span className="font-bold mr-2 whitespace-nowrap">Frekans:</span><span className="truncate">{selectedPart.sampleFrequencyMinutes} dk</span></div>
                                                    </div>
                                                </div>

                                                {/* EXCEL TABLOSU */}
                                                <div className="border-2 border-black w-full flex flex-col text-xs shrink-0 mb-4 bg-white">
                                                    <div className="flex border-b border-black text-center font-bold bg-gray-200 h-[28px]">
                                                        <div className="w-[60px] shrink-0 border-r border-black flex items-center justify-center">Örnek</div>
                                                        {pageData.pageCols.map((col, i) => <div key={i} className="flex-1 border-r border-black last:border-0 flex items-center justify-center">{col.columnIndex + 1}</div>)}
                                                    </div>
                                                    
                                                    <div className="flex border-b border-gray-400 text-center bg-gray-50 h-[30px]">
                                                        <div className="w-[60px] shrink-0 border-r border-black font-bold flex items-center justify-center">Saat</div>
                                                        {pageData.pageCols.map((col, i) => (
                                                            <div key={i} className="flex-1 border-r border-black last:border-0 relative flex items-center justify-center">
                                                                {/* ŞEFFAF KUTU HİLESİ (PDF MOTORUNUN RAKAMI KESİN OKUMASI İÇİN) */}
                                                                <span className="pointer-events-none font-mono text-[11px] font-bold text-gray-900">{col.timeStr}</span>
                                                                <input type="text" className="absolute inset-0 w-full h-full text-center bg-transparent text-transparent caret-black focus:text-black focus:bg-yellow-200 outline-none" value={col.timeStr ?? ''} onChange={(e) => handleGridChange(col.columnIndex, 'timeStr', e.target.value)} />
                                                            </div>
                                                        ))}
                                                    </div>
                                                    
                                                    <div className="flex text-center border-b border-black bg-gray-50 h-[30px]">
                                                        <div className="w-[60px] shrink-0 border-r border-black font-bold flex items-center justify-center">Opr.</div>
                                                        {pageData.pageCols.map((col, i) => (
                                                            <div key={i} className="flex-1 border-r border-black last:border-0 relative flex items-center justify-center">
                                                                <span className="pointer-events-none uppercase font-bold text-[9px] text-gray-900">{col.operator}</span>
                                                                <input type="text" className="absolute inset-0 w-full h-full text-center bg-transparent text-transparent caret-black focus:text-black focus:bg-yellow-200 outline-none uppercase" value={col.operator ?? ''} onChange={(e) => handleGridChange(col.columnIndex, 'operator', e.target.value)} />
                                                            </div>
                                                        ))}
                                                    </div>

                                                    {Array.from({ length: pageData.nSize }).map((_, rIdx) => (
                                                        <div key={`X${rIdx}`} className="flex border-b border-gray-300 text-center bg-white h-[32px]">
                                                            <div className="w-[60px] shrink-0 border-r border-black font-bold flex items-center justify-center bg-gray-100">X{rIdx + 1}</div>
                                                            {pageData.pageCols.map((col, cIdx) => {
                                                                let val = col.values[rIdx] ?? '';
                                                                let isErr = false;
                                                                if (val !== '') {
                                                                    const nVal = parseInputFloat(val);
                                                                    if (!isNaN(nVal) && (nVal > pageData.USL || nVal < pageData.LSL)) isErr = true;
                                                                }
                                                                return (
                                                                    <div key={cIdx} className={`flex-1 border-r border-black last:border-0 relative flex items-center justify-center ${isErr ? 'bg-red-50' : 'bg-white'}`}>
                                                                        <span className={`pointer-events-none font-mono text-[12px] ${isErr ? 'text-red-600 font-extrabold' : 'text-gray-900 font-bold'}`}>{val}</span>
                                                                        <input type="text" className="absolute inset-0 w-full h-full text-center bg-transparent text-transparent caret-black focus:text-black focus:bg-yellow-200 outline-none" value={val} onChange={(e) => handleGridChange(col.columnIndex, 'values', e.target.value, rIdx)} />
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    ))}

                                                    <div className="flex border-t border-b border-black text-center bg-blue-50 h-[30px]">
                                                        <div className="w-[60px] shrink-0 border-r border-black font-bold flex items-center justify-center">X̄</div>
                                                        {pageData.actualSubgroups.map((sg, i) => <div key={i} className="flex-1 border-r border-black last:border-0 flex items-center justify-center font-bold text-blue-900 font-mono text-[11px]">{sg.isComplete ? sg.mean.toFixed(3) : ''}</div>)}
                                                    </div>
                                                    <div className="flex text-center bg-blue-50 h-[30px]">
                                                        <div className="w-[60px] shrink-0 border-r border-black font-bold flex items-center justify-center">R</div>
                                                        {pageData.actualSubgroups.map((sg, i) => <div key={i} className="flex-1 border-r border-black last:border-0 flex items-center justify-center font-bold text-blue-900 font-mono text-[11px]">{sg.isComplete ? sg.range.toFixed(3) : ''}</div>)}
                                                    </div>
                                                </div>

                                                {/* GRAFİKLER ALANI */}
                                                <div className="flex flex-col gap-4 flex-1">
                                                    <div className="flex-1 border-2 border-black min-h-[160px]">
                                                        <SpcChart data={pageData.actualSubgroups} dataKey="mean" centerLine={pageData.X_double_bar} UCL={pageData.UCL_X} LCL={pageData.LCL_X} USL={pageData.USL} LSL={pageData.LSL} showSpecs={true} width={1200} height={160} title="X ORTALAMA KARTI" />
                                                    </div>
                                                    <div className="flex-1 border-2 border-black min-h-[160px]">
                                                        <SpcChart data={pageData.actualSubgroups} dataKey="range" centerLine={pageData.R_bar} UCL={pageData.UCL_R} LCL={pageData.LCL_R} showSpecs={false} width={1200} height={160} title="R (ARALIK) KARTI" />
                                                    </div>
                                                </div>

                                                {/* İMZALAR */}
                                                <div className="mt-4 border-t-2 border-black pt-4 grid grid-cols-3 gap-8 text-center text-sm shrink-0">
                                                    <div><div className="font-bold mb-3">Hazırlayan</div><input type="text" className="border-b border-black border-dashed outline-none text-center uppercase w-48 bg-transparent" placeholder="İmza/İsim" value={preparedBy} onChange={e=>setPreparedBy(e.target.value)}/></div>
                                                    <div><div className="font-bold mb-3">Kontrol Eden</div><input type="text" className="border-b border-black border-dashed outline-none text-center uppercase w-48 bg-transparent" placeholder="İmza/İsim" value={checkedBy} onChange={e=>setCheckedBy(e.target.value)}/></div>
                                                    <div><div className="font-bold mb-3">Onaylayan</div><input type="text" className="border-b border-black border-dashed outline-none text-center uppercase w-48 bg-transparent" placeholder="İmza/İsim" value={approvedBy} onChange={e=>setApprovedBy(e.target.value)}/></div>
                                                </div>
                                            </div>

                                            {/* ========================================================= */}
                                            {/* ZORUNLU SAYFA KESMESİ (PDF İÇİN 2. SAYFAYA GEÇİŞ) */}
                                            <div className="html2pdf__page-break w-full"></div>
                                            {/* ========================================================= */}

                                            {/* ========================================================= */}
                                            {/* PDF 2. SAYFA: İSTATİSTİK, PERFORMANS VE FORMÜLLER */}
                                            {/* ========================================================= */}
                                            <div className="bg-white text-black p-6 shadow-xl flex flex-col w-[1280px] border border-gray-200 mt-4" style={{ minHeight: '880px', boxSizing: 'border-box' }}>
                                                <div className="border-2 border-black bg-gray-50 flex flex-col p-8 h-full">
                                                    
                                                    <div className="text-center font-black text-3xl mb-8 border-b-4 border-black pb-4 uppercase tracking-widest text-blue-900">
                                                        İstatistiki Değerler ve Proses Performans Raporu
                                                    </div>

                                                    <div className="grid grid-cols-2 gap-10 h-full">
                                                        {/* SOL SÜTUN: İstatistik & Limitler */}
                                                        <div className="flex flex-col gap-6">
                                                            <div className="border-2 border-black p-6 bg-white shadow-sm">
                                                                <div className="font-black border-b-2 border-gray-300 text-xl mb-4 pb-2">İSTATİSTİK SONUÇLARI</div>
                                                                <div className="flex justify-between text-lg mb-2"><span>Alt Grup Sayısı (k):</span> <span className="font-bold">{pageData.k}</span></div>
                                                                <div className="flex justify-between text-lg mb-2"><span>Toplam Ölçüm (N):</span> <span className="font-bold">{pageData.totalN}</span></div>
                                                                <div className="flex justify-between text-lg mb-2"><span>Genel Ortalama (X̿):</span> <span className="font-bold text-blue-800">{pageData.X_double_bar.toFixed(4)}</span></div>
                                                                <div className="flex justify-between text-lg mb-2"><span>Ortalama Aralık (R̄):</span> <span className="font-bold text-blue-800">{pageData.R_bar.toFixed(4)}</span></div>
                                                                <div className="flex justify-between text-lg font-bold text-red-600 border-t-2 border-gray-300 pt-4 mt-4">
                                                                    <span>Proses Standart Sapması (σ):</span> <span>{pageData.sigma_within.toFixed(5)}</span>
                                                                </div>
                                                            </div>

                                                            <div className="border-2 border-black p-6 bg-white shadow-sm">
                                                                <div className="font-black border-b-2 border-gray-300 text-xl mb-4 pb-2">KONTROL LİMİTLERİ (X-R)</div>
                                                                <div className="flex justify-between text-lg text-red-700 font-bold mb-2"><span>UCL (X Üst Limit):</span> <span>{pageData.UCL_X.toFixed(4)}</span></div>
                                                                <div className="flex justify-between text-lg text-red-700 font-bold mb-6"><span>LCL (X Alt Limit):</span> <span>{pageData.LCL_X.toFixed(4)}</span></div>
                                                                <div className="flex justify-between text-lg text-purple-700 font-bold mb-2 border-t-2 border-gray-200 pt-6"><span>UCL (R Üst Limit):</span> <span>{pageData.UCL_R.toFixed(4)}</span></div>
                                                                <div className="flex justify-between text-lg text-purple-700 font-bold"><span>LCL (R Alt Limit):</span> <span>{pageData.LCL_R.toFixed(4)}</span></div>
                                                            </div>
                                                            
                                                            <div className="border-2 border-black p-6 bg-white shadow-sm flex-1">
                                                                <div className="font-black border-b-2 border-gray-300 text-xl mb-4 pb-2 uppercase">YETERLİLİK ({pageData.jobPart.targetCustomer || 'GENEL'})</div>
                                                                <div className="grid grid-cols-2 gap-6 text-center font-bold">
                                                                    <div className="bg-gray-100 p-4 rounded border border-gray-300 flex flex-col justify-center">
                                                                        <div className="text-base text-gray-600 mb-2">Cp</div>
                                                                        <div className="text-4xl text-black">{pageData.Cp.toFixed(2)}</div>
                                                                    </div>
                                                                    <div className={`p-4 rounded border flex flex-col justify-center ${pageData.Cpk >= (pageData.jobPart.targetCpk || 1.33) ? 'bg-green-50 border-green-300' : 'bg-red-50 border-red-300'}`}>
                                                                        <div className="text-base text-gray-600 mb-2">Cpk (Hedef: ≥{pageData.jobPart.targetCpk || 1.33})</div>
                                                                        <div className={`text-4xl ${pageData.Cpk >= (pageData.jobPart.targetCpk || 1.33) ? 'text-green-600' : 'text-red-600'}`}>{pageData.Cpk.toFixed(2)}</div>
                                                                    </div>
                                                                    <div className="bg-gray-100 p-4 rounded border border-gray-300 flex flex-col justify-center">
                                                                        <div className="text-base text-gray-600 mb-2">Pp</div>
                                                                        <div className="text-4xl text-black">{pageData.Pp.toFixed(2)}</div>
                                                                    </div>
                                                                    <div className={`p-4 rounded border flex flex-col justify-center ${pageData.Ppk >= (pageData.jobPart.targetPpk || 1.33) ? 'bg-green-50 border-green-300' : 'bg-red-50 border-red-300'}`}>
                                                                        <div className="text-base text-gray-600 mb-2">Ppk (Hedef: ≥{pageData.jobPart.targetPpk || 1.33})</div>
                                                                        <div className={`text-4xl ${pageData.Ppk >= (pageData.jobPart.targetPpk || 1.33) ? 'text-green-600' : 'text-red-600'}`}>{pageData.Ppk.toFixed(2)}</div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* SAĞ SÜTUN: Formüller & Katsayılar */}
                                                        <div className="flex flex-col gap-6">
                                                            <div className="border-2 border-black p-6 bg-[#FFFDE7] shadow-sm">
                                                                <div className="font-black text-center border-b-2 border-black text-xl pb-4 mb-6 text-yellow-900">İSTATİSTİKSEL KATSAYILAR TABLOSU</div>
                                                                <table className="w-full text-center text-lg border-collapse border border-black bg-white shadow-inner">
                                                                    <thead>
                                                                        <tr className="bg-yellow-200 border-b-2 border-black font-bold">
                                                                            <th className="border-r border-black p-3">Örneklem (n)</th>
                                                                            <th className="border-r border-black p-3">A<sub className="text-xs">2</sub></th>
                                                                            <th className="border-r border-black p-3">d<sub className="text-xs">2</sub></th>
                                                                            <th className="border-r border-black p-3">D<sub className="text-xs">3</sub></th>
                                                                            <th className="p-3">D<sub className="text-xs">4</sub></th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody>
                                                                        {[2, 3, 4, 5, 6].map(num => (
                                                                            <tr key={num} className={`border-b border-gray-300 ${pageData.nSize === num ? "bg-yellow-400 font-black text-2xl border-2 border-black" : ""}`}>
                                                                                <td className="border-r border-black p-3">{num}</td>
                                                                                <td className="border-r border-black p-3">{SPC_CONSTANTS[num].A2.toFixed(3)}</td>
                                                                                <td className="border-r border-black p-3">{SPC_CONSTANTS[num].d2.toFixed(3)}</td>
                                                                                <td className="border-r border-black p-3">{SPC_CONSTANTS[num].D3}</td>
                                                                                <td className="p-3">{SPC_CONSTANTS[num].D4.toFixed(3)}</td>
                                                                            </tr>
                                                                        ))}
                                                                    </tbody>
                                                                </table>
                                                            </div>

                                                            <div className="border-2 border-black p-6 bg-white shadow-sm flex-1">
                                                                <div className="font-black text-center border-b-2 border-gray-300 text-xl pb-4 mb-6">HESAPLAMA FORMÜLLERİ</div>
                                                                <div className="grid grid-cols-2 gap-8 text-base font-bold text-gray-800">
                                                                    
                                                                    <div className="flex flex-col gap-4">
                                                                        <div className="text-lg text-blue-900 border-b border-gray-200 pb-2">X-Bar (Ortalama) Limitleri</div>
                                                                        <div>UCL<sub className="text-xs text-gray-500">X</sub> = X̿ + (A<sub className="text-xs text-gray-500">2</sub> × R̄)</div>
                                                                        <div>LCL<sub className="text-xs text-gray-500">X</sub> = X̿ - (A<sub className="text-xs text-gray-500">2</sub> × R̄)</div>
                                                                    </div>

                                                                    <div className="flex flex-col gap-4">
                                                                        <div className="text-lg text-blue-900 border-b border-gray-200 pb-2">R (Aralık) Limitleri</div>
                                                                        <div>UCL<sub className="text-xs text-gray-500">R</sub> = D<sub className="text-xs text-gray-500">4</sub> × R̄</div>
                                                                        <div>LCL<sub className="text-xs text-gray-500">R</sub> = D<sub className="text-xs text-gray-500">3</sub> × R̄</div>
                                                                    </div>

                                                                    <div className="col-span-2 flex flex-col gap-4 mt-2 border-t-2 border-gray-300 pt-6">
                                                                        <div className="text-lg text-green-900 border-b border-gray-200 pb-2">Proses Yeterlilik (Cp / Cpk)</div>
                                                                        <div className="text-red-700">σ (Standart Sapma) = R̄ / d<sub className="text-xs text-red-500">2</sub></div>
                                                                        <div>Cp = (USL - LSL) / 6σ</div>
                                                                        <div>Cpk = Min [ (USL - X̿) / 3σ , (X̿ - LSL) / 3σ ]</div>
                                                                    </div>

                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                                
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default CncSpcAnalysisPage;