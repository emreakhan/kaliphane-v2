// src/pages/CncSpcAnalysisPage.js

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
    Activity, Search, BarChart2, Info, Trash2, FileText, Settings, Calendar, AlertCircle, Layers
} from 'lucide-react';
import { 
    collection, query, where, onSnapshot, getDocs, deleteDoc, doc, updateDoc 
} from '../config/firebase.js';
import { 
    CNC_PARTS_COLLECTION, CNC_MEASUREMENTS_COLLECTION, CNC_LATHE_MACHINES 
} from '../config/constants.js';
import { formatDateTime } from '../utils/dateUtils.js';
import html2pdf from 'html2pdf.js'; 
import CncSpcSimulationTab from './CncSpcSimulationTab.js';

// --- İSTATİSTİKSEL KATSAYILAR (AIAG SPC Manueli) ---
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

const getShiftInfo = (dateObj) => {
    const h = dateObj.getHours();
    const d = new Date(dateObj);
    if (h >= 8 && h < 18) {
        return { shift: 1, dateStr: d.toISOString().split('T')[0], label: '1. Vardiya (08:00 - 18:00)' };
    } else if (h >= 22 || h < 8) {
        if (h < 8) d.setDate(d.getDate() - 1); 
        return { shift: 2, dateStr: d.toISOString().split('T')[0], label: '2. Vardiya (22:00 - 08:00)' };
    }
    return { shift: 0, dateStr: d.toISOString().split('T')[0], label: 'Mesai Dışı (18:00 - 22:00)' }; 
};

const getExpectedTimeStr = (shiftKey, groupIndex, freqMins) => {
    if (!shiftKey || shiftKey === 'ALL') return '-:-';
    const shift = parseInt(shiftKey.split('_')[1]); 
    let startHour = shift === 2 ? 22 : 8; 

    const totalMins = startHour * 60 + (groupIndex + 1) * freqMins;
    const h = Math.floor(totalMins / 60) % 24;
    const m = totalMins % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
};

const SpcChart = ({ data, dataKey, centerLine, UCL, LCL, USL, LSL, title, width = 1000, height = 300, showSpecs = false }) => {
    const validData = data.filter(d => d.isComplete);
    if (!validData || validData.length === 0) return <div className="text-center text-gray-400 py-10">Veri yok</div>;

    const paddingLeft = 75;  
    const paddingRight = 75; 
    const paddingY = 40;
    const chartWidth = width - paddingLeft - paddingRight;

    const allValues = [
        ...validData.map(d => d[dataKey]), centerLine, UCL, LCL, 
        ...(showSpecs && USL !== undefined ? [USL] : []), 
        ...(showSpecs && LSL !== undefined ? [LSL] : [])
    ].filter(v => v !== undefined && !isNaN(v));

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
        <div className="overflow-x-auto flex flex-col items-center w-full relative">
            <div className="absolute top-2 left-1/2 -translate-x-1/2 text-sm font-black text-gray-800 dark:text-gray-200 bg-white/90 dark:bg-gray-800/90 px-4 py-1 rounded-full shadow-sm z-10 border border-gray-100 dark:border-gray-700">
                {title}
            </div>
            
            <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
                {validData.map((_, i) => (
                    <line key={`grid-${i}`} x1={xScale(i)} y1={paddingY} x2={xScale(i)} y2={height - paddingY + 10} stroke="#F3F4F6" strokeWidth="1" />
                ))}

                <rect x={paddingLeft} y={uclY} width={chartWidth} height={Math.max(0, lclY - uclY)} fill="rgba(59, 130, 246, 0.04)" />
                
                {showSpecs && USL !== undefined && (
                    <g>
                        <line x1={paddingLeft} y1={yScale(USL)} x2={width - paddingRight} y2={yScale(USL)} stroke="#059669" strokeWidth="2.5" strokeDasharray="4,4" />
                        <rect x={width - paddingRight + 5} y={yScale(USL) - 10} width="65" height="20" fill="#D1FAE5" rx="4" />
                        <text x={width - paddingRight + 8} y={yScale(USL) + 4} className="text-[11px] fill-green-800 font-black">USL: {USL.toFixed(2)}</text>
                    </g>
                )}
                {showSpecs && LSL !== undefined && (
                    <g>
                        <line x1={paddingLeft} y1={yScale(LSL)} x2={width - paddingRight} y2={yScale(LSL)} stroke="#059669" strokeWidth="2.5" strokeDasharray="4,4" />
                        <rect x={width - paddingRight + 5} y={yScale(LSL) - 10} width="65" height="20" fill="#D1FAE5" rx="4" />
                        <text x={width - paddingRight + 8} y={yScale(LSL) + 4} className="text-[11px] fill-green-800 font-black">LSL: {LSL.toFixed(2)}</text>
                    </g>
                )}

                <g>
                    <line x1={paddingLeft} y1={clY} x2={width - paddingRight} y2={clY} stroke="#2563EB" strokeWidth="2.5" />
                    <rect x={4} y={clY - 10} width="66" height="20" fill="#DBEAFE" rx="4" />
                    <text x={8} y={clY + 4} className="text-[11px] fill-blue-800 font-black">CL: {centerLine.toFixed(3)}</text>
                </g>

                <g>
                    <line x1={paddingLeft} y1={uclY} x2={width - paddingRight} y2={uclY} stroke="#DC2626" strokeWidth="2.5" strokeDasharray="6,4" />
                    <rect x={4} y={uclY - 10} width="66" height="20" fill="#FEE2E2" rx="4" />
                    <text x={6} y={uclY + 4} className="text-[11px] fill-red-800 font-black">UCL: {UCL.toFixed(3)}</text>
                </g>
                
                <g>
                    <line x1={paddingLeft} y1={lclY} x2={width - paddingRight} y2={lclY} stroke="#DC2626" strokeWidth="2.5" strokeDasharray="6,4" />
                    <rect x={4} y={lclY - 10} width="66" height="20" fill="#FEE2E2" rx="4" />
                    <text x={6} y={lclY + 4} className="text-[11px] fill-red-800 font-black">LCL: {LCL.toFixed(3)}</text>
                </g>

                <polyline points={linePoints} fill="none" stroke="#374151" strokeWidth="2" />
                {validData.map((d, i) => {
                    const val = d[dataKey];
                    const isOut = val > UCL || val < LCL;
                    return (
                        <g key={i} className="group">
                            <circle cx={xScale(i)} cy={yScale(val)} r={isOut ? "6.5" : "4.5"} fill={isOut ? "#DC2626" : "#374151"} stroke="#ffffff" strokeWidth="1.5" className="cursor-pointer hover:r-[8px] transition-all"/>
                            <text x={xScale(i)} y={height - 15} className="text-[11px] fill-gray-500 font-bold" textAnchor="middle">{d.displayIndex}</text>
                            <title>{`Grup: ${d.displayIndex}\nDeğer: ${val.toFixed(3)}\nOperatör: ${d.operator}\nTarih: ${d.timeStr}`}</title>
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
    const [selectedPartId, setSelectedPartId] = useState('');
    const [selectedCriterionId, setSelectedCriterionId] = useState('');
    const [measurements, setMeasurements] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selectedPart, setSelectedPart] = useState(null);
    
    const [searchTerm, setSearchTerm] = useState('');
    const [showPartList, setShowPartList] = useState(false);
    const [selectedShiftKey, setSelectedShiftKey] = useState('ALL'); 

    const reportRef = useRef(null);

    useEffect(() => {
        if (!db) return;
        const q = query(collection(db, CNC_PARTS_COLLECTION));
        const unsub = onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            data.sort((a, b) => (a.orderNumber || '').localeCompare(b.orderNumber || ''));
            setParts(data);
        });
        return () => unsub();
    }, [db]);

    const filteredParts = parts.filter(p => p.orderNumber && p.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()));

    useEffect(() => {
        if (selectedPartId) {
            const part = parts.find(p => p.id === selectedPartId);
            setSelectedPart(part);
            if (part && part.criteria) {
                const currentCritExists = part.criteria.some(c => c.id.toString() === selectedCriterionId);
                if (!currentCritExists) {
                    const firstNumCrit = part.criteria.find(c => (!c.type || c.type === 'NUMBER'));
                    setSelectedCriterionId(firstNumCrit ? firstNumCrit.id : '');
                }
            }
            setSelectedShiftKey('ALL'); 
        } else { setSelectedPart(null); setSelectedCriterionId(''); }
    }, [selectedPartId, parts]);

    useEffect(() => {
        if (!db || !selectedPartId) return;
        const q = query(collection(db, CNC_MEASUREMENTS_COLLECTION), where('partId', '==', selectedPartId));
        const unsub = onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            setMeasurements(data);
        });
        return () => unsub();
    }, [db, selectedPartId]);

    const availableShifts = useMemo(() => {
        if (!measurements || measurements.length === 0) return [];
        const shiftsMap = new Map();
        
        measurements.forEach(m => {
            const detail = m.details?.find(d => d.criterionId.toString() === selectedCriterionId.toString());
            if (detail && detail.value !== null && detail.type !== 'NUMBER') {
                const info = getShiftInfo(new Date(m.timestamp));
                if (info && info.shift !== 0) { 
                    const key = `${info.dateStr}_${info.shift}`;
                    shiftsMap.set(key, { ...info, key });
                }
            }
        });
        
        return Array.from(shiftsMap.values()).sort((a, b) => b.key.localeCompare(a.key)); 
    }, [measurements, selectedCriterionId]);

    const analysisData = useMemo(() => {
        if (!selectedCriterionId || measurements.length === 0 || !selectedPart) return null;

        const crit = selectedPart.criteria.find(c => c.id.toString() === selectedCriterionId.toString());
        if (!crit) return null;

        const nSize = parseInt(selectedPart.sampleQuantity) || 5;
        const freqMins = parseInt(selectedPart.sampleFrequencyMinutes) || 25;
        const expectedGroupsPerShift = Math.min(Math.floor(600 / freqMins), 36);

        const consts = SPC_CONSTANTS[nSize] || SPC_CONSTANTS[5];

        const rawPoints = [];
        measurements.forEach(m => {
            const detail = m.details?.find(d => d.criterionId.toString() === selectedCriterionId.toString());
            if (detail && detail.value !== null && detail.type !== 'BOOL') {
                const val = parseFloat(detail.value);
                if(!isNaN(val)) {
                    const dateObj = new Date(m.timestamp);
                    const info = getShiftInfo(dateObj);
                    if (selectedShiftKey === 'ALL' || (info && `${info.dateStr}_${info.shift}` === selectedShiftKey)) {
                        rawPoints.push({ value: val, date: dateObj, operator: m.operator });
                    }
                }
            }
        });

        rawPoints.sort((a, b) => a.date - b.date);

        const actualSubgroups = [];
        const displaySubgroups = [];

        for (let i = 0; i < rawPoints.length; i += nSize) {
            const chunk = rawPoints.slice(i, i + nSize);
            const isComplete = chunk.length === nSize; 

            const vals = Array(nSize).fill(null); 
            chunk.forEach((c, idx) => vals[idx] = c.value);

            let mean = 0, range = 0;
            if (isComplete) { 
                mean = vals.reduce((a,b) => a+b, 0) / nSize;
                range = Math.max(...vals) - Math.min(...vals);
            }

            const sgObj = {
                isEmpty: false,
                isComplete: isComplete,
                displayIndex: displaySubgroups.length + 1,
                values: vals,
                mean: mean,
                range: range,
                operator: chunk[0].operator.split(' ')[0], 
                timeStr: formatDateTime(chunk[0].date.toISOString())
            };

            displaySubgroups.push(sgObj);
            
            if (isComplete) {
                actualSubgroups.push(sgObj);
            }
        }

        const k = actualSubgroups.length; 
        const nominal = parseFloat(crit.nominal);
        const USL = nominal + parseFloat(crit.upperTol);
        const LSL = nominal - Math.abs(parseFloat(crit.lowerTol));

        const X_double_bar = k > 0 ? actualSubgroups.reduce((a, b) => a + b.mean, 0) / k : nominal;
        const R_bar = k > 0 ? actualSubgroups.reduce((a, b) => a + b.range, 0) / k : 0;

        const UCL_X = X_double_bar + (consts.A2 * R_bar);
        const LCL_X = X_double_bar - (consts.A2 * R_bar);
        const UCL_R = consts.D4 * R_bar;
        const LCL_R = consts.D3 * R_bar; 

        const sigma_within = R_bar / consts.d2;
        const allUsedVals = actualSubgroups.flatMap(sg => sg.values);
        const totalN = allUsedVals.length;
        const overallMean = totalN > 0 ? allUsedVals.reduce((a,b)=>a+b,0) / totalN : nominal;
        const variance = totalN > 1 ? allUsedVals.reduce((a, b) => a + Math.pow(b - overallMean, 2), 0) / (totalN - 1) : 0;
        const sigma_overall = Math.sqrt(variance);

        let Cp = 0, Cpk = 0, Pp = 0, Ppk = 0;
        if (sigma_within > 0) {
            Cp = (USL - LSL) / (6 * sigma_within);
            Cpk = Math.min((USL - X_double_bar) / (3 * sigma_within), (X_double_bar - LSL) / (3 * sigma_within));
        }
        if (sigma_overall > 0) {
            Pp = (USL - LSL) / (6 * sigma_overall);
            Ppk = Math.min((USL - overallMean) / (3 * sigma_overall), (overallMean - LSL) / (3 * sigma_overall));
        }

        if (selectedShiftKey !== 'ALL' && displaySubgroups.length < expectedGroupsPerShift) {
            const missingCount = expectedGroupsPerShift - displaySubgroups.length;
            for(let i=0; i<missingCount; i++) {
                const groupIndex = displaySubgroups.length;
                const expectedTime = getExpectedTimeStr(selectedShiftKey, groupIndex, freqMins);
                displaySubgroups.push({
                    isEmpty: true,
                    isComplete: false,
                    displayIndex: groupIndex + 1,
                    values: Array(nSize).fill(null),
                    mean: 0, range: 0, operator: '-', 
                    timeStr: expectedTime 
                });
            }
        }

        return {
            displaySubgroups,  
            actualSubgroups,   
            nSize, freqMins, expectedGroupsPerShift,
            X_double_bar, R_bar,
            UCL_X, LCL_X, UCL_R, LCL_R,
            nominal, USL, LSL,
            sigma_within, sigma_overall,
            Cp, Cpk, Pp, Ppk,
            critName: crit.name,
            totalN,
            minVal: Math.min(...allUsedVals),
            maxVal: Math.max(...allUsedVals)
        };
    }, [measurements, selectedCriterionId, selectedShiftKey, selectedPart]);

    const handleResetCriterionData = async () => {
        if (!selectedPartId || !selectedCriterionId) return;
        const critName = selectedPart?.criteria?.find(c => c.id.toString() === selectedCriterionId)?.name || 'Seçili Kriter';
        if (!window.confirm(`DİKKAT: "${critName}" için TÜM GEÇMİŞ VERİLER silinecek! Onaylıyor musunuz?`)) return;

        setLoading(true);
        try {
            const q = query(collection(db, CNC_MEASUREMENTS_COLLECTION), where('partId', '==', selectedPartId));
            const snapshot = await getDocs(q);
            const updatePromises = snapshot.docs.map(async (docSnapshot) => {
                const docData = docSnapshot.data();
                if (!docData.details) return;
                const newDetails = docData.details.filter(d => d.criterionId.toString() !== selectedCriterionId.toString());
                if (newDetails.length !== docData.details.length) {
                    if (newDetails.length === 0) return deleteDoc(doc(db, CNC_MEASUREMENTS_COLLECTION, docSnapshot.id));
                    else return updateDoc(doc(db, CNC_MEASUREMENTS_COLLECTION, docSnapshot.id), { details: newDetails });
                }
            });
            await Promise.all(updatePromises);
            alert(`${critName} verileri temizlendi.`);
        } catch (error) { console.error("Silme hatası:", error); } 
        finally { setLoading(false); }
    };

    const handleDownloadReport = () => {
        const element = reportRef.current;
        if (!element) return;
        const opt = {
            margin: [5, 5, 5, 5],
            filename: `SPC_Raporu_${selectedPart?.orderNumber || 'Parca'}_${selectedShiftKey}.pdf`,
            image: { type: 'jpeg', quality: 1 },
            html2canvas: { scale: 2, useCORS: true }, 
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }
        };
        html2pdf().set(opt).from(element).save();
    };

    const targetCustomerName = selectedPart?.targetCustomer || 'STANDART';
    const targetCpk = parseFloat(selectedPart?.targetCpk) || 1.33;
    const targetPpk = parseFloat(selectedPart?.targetPpk) || 1.33;
    const isTargetOk = analysisData ? (analysisData.Cpk >= targetCpk && analysisData.Ppk >= targetPpk) : false;

    return (
        <div className="p-6 max-w-[1400px] mx-auto min-h-screen bg-gray-100 dark:bg-gray-900 font-sans">
            
            {/* SEKME (TAB) MENÜSÜ */}
            <div className="flex bg-white dark:bg-gray-800 p-1 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 w-fit mb-6">
                <button 
                    onClick={() => setActiveTab('REAL')} 
                    className={`px-6 py-2 rounded-lg font-bold text-sm transition flex items-center ${activeTab === 'REAL' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300' : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                >
                    <Activity className="w-4 h-4 mr-2" /> Gerçek Üretim Verileri
                </button>
                <button 
                    onClick={() => setActiveTab('SIMULATION')} 
                    className={`px-6 py-2 rounded-lg font-bold text-sm transition flex items-center ${activeTab === 'SIMULATION' ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-300' : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                >
                    <Layers className="w-4 h-4 mr-2" /> Simülasyon (Test Raporu)
                </button>
            </div>

            {/* SEKME İÇERİKLERİ */}
            {activeTab === 'SIMULATION' ? (
                <CncSpcSimulationTab db={db} />
            ) : (
                <>
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                        <div>
                            <h1 className="text-3xl font-extrabold text-gray-900 dark:text-white flex items-center">
                                <Activity className="w-8 h-8 mr-3 text-purple-600" /> SPC & Yeterlilik Analizi
                            </h1>
                            <p className="text-sm text-gray-500 mt-1">Vardiya Bazlı İstatistiki Proses Kontrol (X-Bar / R) Modülü</p>
                        </div>
                        {analysisData && analysisData.actualSubgroups.length > 0 && (
                            <button onClick={handleDownloadReport} className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg shadow-lg flex items-center font-bold transition transform active:scale-95">
                                <FileText className="w-5 h-5 mr-2" /> PDF Raporunu İndir
                            </button>
                        )}
                    </div>

                    <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 mb-6 grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                        
                        <div className="relative z-50 md:col-span-3">
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Parça Seçimi (Stok Kodu)</label>
                            <div className="relative">
                                <Search className="absolute left-3 top-3 text-gray-400 w-4 h-4" />
                                <input type="text" placeholder="Arama yap..." className="w-full pl-9 p-2 border rounded bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 uppercase text-sm font-bold" value={searchTerm} onFocus={() => setShowPartList(true)} onChange={(e) => { setSearchTerm(e.target.value); setSelectedPartId(''); setShowPartList(true); }}/>
                            </div>
                            {showPartList && (
                                <>
                                    <div className="fixed inset-0 z-10" onClick={() => setShowPartList(false)}></div>
                                    <div className="absolute top-full left-0 right-0 mt-1 border border-gray-200 dark:border-gray-600 rounded-lg max-h-48 overflow-y-auto bg-white dark:bg-gray-800 shadow-xl z-20">
                                        {filteredParts.map(part => (
                                            <div key={part.id} onClick={() => { setSelectedPartId(part.id); setSearchTerm(part.orderNumber || 'KOD YOK'); setShowPartList(false); }} className="p-2.5 text-sm cursor-pointer border-b hover:bg-blue-50 font-bold dark:text-white">{part.orderNumber || 'KOD YOK'} <span className="text-xs font-normal text-gray-400">({part.partName})</span></div>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                        
                        {selectedPart && (
                            <div className="md:col-span-2">
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Ölçü Kriteri</label>
                                <select className="w-full p-2 border rounded bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 text-sm font-bold" value={selectedCriterionId} onChange={(e) => setSelectedCriterionId(e.target.value)}>
                                    {selectedPart.criteria.filter(c => !c.type || c.type === 'NUMBER').map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                            </div>
                        )}

                        {selectedPart && (
                            <div className="md:col-span-2">
                                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Kalite Hedefi</label>
                                <div className="w-full p-1.5 border rounded bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 flex flex-col justify-center">
                                    <span className="text-xs font-black text-green-800 dark:text-green-400 uppercase truncate">{targetCustomerName}</span>
                                    <span className="text-[9px] font-bold text-green-600 dark:text-green-500">Cpk≥{targetCpk} | Ppk≥{targetPpk}</span>
                                </div>
                            </div>
                        )}

                        {selectedPart && (
                            <div className="md:col-span-3">
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1 flex items-center"><Calendar className="w-3 h-3 mr-1"/> İzlenebilirlik (Vardiya Seçimi)</label>
                                <select className="w-full p-2 border rounded bg-blue-50 dark:bg-blue-900/30 text-blue-900 dark:text-blue-100 border-blue-200 dark:border-blue-800 outline-none focus:ring-2 focus:ring-blue-500 text-sm font-bold" value={selectedShiftKey} onChange={(e) => setSelectedShiftKey(e.target.value)}>
                                    <option value="ALL">TÜM ÜRETİM (Tüm Vardiyalar / Süreç)</option>
                                    {availableShifts.map(s => <option key={s.key} value={s.key}>{new Date(s.dateStr).toLocaleDateString('tr-TR')} - {s.label}</option>)}
                                </select>
                            </div>
                        )}

                        {selectedPart && selectedCriterionId && (
                            <div className="md:col-span-2">
                                <button onClick={handleResetCriterionData} disabled={loading} className="w-full p-2 bg-gray-100 hover:bg-red-100 text-gray-500 hover:text-red-600 rounded font-bold flex items-center justify-center transition text-sm">
                                    <Trash2 className="w-4 h-4 mr-2" /> Kayıtları Sil
                                </button>
                            </div>
                        )}
                    </div>

                    {analysisData ? (
                        <div className="flex flex-col lg:flex-row gap-6">
                            <div className="flex-1 flex flex-col gap-6">
                                
                                {selectedShiftKey !== 'ALL' && analysisData.displaySubgroups.some(sg => !sg.isComplete) && (
                                    <div className="bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500 p-4 rounded shadow-sm flex items-start">
                                        <AlertCircle className="w-6 h-6 text-red-500 mr-3 shrink-0" />
                                        <div>
                                            <h3 className="text-red-800 dark:text-red-300 font-bold">Ölçüm Takip Uyarısı!</h3>
                                            <p className="text-red-600 dark:text-red-400 text-sm">
                                                Bu vardiyada her {analysisData.freqMins} dakikada bir toplam <strong>{analysisData.expectedGroupsPerShift} grup</strong> ölçüm girilmesi beklenmektedir. Aşağıdaki tabloda girilmeyen ölçümler veya atlanan hedef saatler kırmızı boş kutularla gösterilmiştir.
                                            </p>
                                        </div>
                                    </div>
                                )}

                                <div className="bg-white dark:bg-gray-800 p-1 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                                    <SpcChart title="X-BAR KONTROL GRAFİĞİ (Grup Ortalamaları)" data={analysisData.actualSubgroups} dataKey="mean" centerLine={analysisData.X_double_bar} UCL={analysisData.UCL_X} LCL={analysisData.LCL_X} USL={analysisData.USL} LSL={analysisData.LSL} showSpecs={true} height={260} />
                                </div>
                                <div className="bg-white dark:bg-gray-800 p-1 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                                    <SpcChart title="R KONTROL GRAFİĞİ (Grup Aralıkları)" data={analysisData.actualSubgroups} dataKey="range" centerLine={analysisData.R_bar} UCL={analysisData.UCL_R} LCL={analysisData.LCL_R} showSpecs={false} height={200} />
                                </div>

                                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                                    <div className="bg-gray-50 dark:bg-gray-900 p-3 font-bold text-sm text-center border-b dark:border-gray-700 dark:text-white">
                                        ÖLÇÜM VERİ TABLOSU ({selectedShiftKey === 'ALL' ? 'Tüm Süreç' : 'Seçili Vardiya'})
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-xs text-center">
                                            <thead className="bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-200 border-b dark:border-gray-600">
                                                <tr>
                                                    <th className="p-2 border-r dark:border-gray-600">Grup</th>
                                                    <th className="p-2 border-r dark:border-gray-600">Saat</th>
                                                    <th className="p-2 border-r dark:border-gray-600">Operatör</th>
                                                    {Array.from({length: analysisData.nSize}).map((_, i) => (
                                                        <th key={i} className="p-2 border-r dark:border-gray-600">X{i+1}</th>
                                                    ))}
                                                    <th className="p-2 border-r dark:border-gray-600 bg-blue-50/50 dark:bg-blue-900/30">Ortalama (X̄)</th>
                                                    <th className="p-2 bg-blue-50/50 dark:bg-blue-900/30">Aralık (R)</th>
                                                </tr>
                                            </thead>
                                            <tbody className="text-gray-800 dark:text-gray-200">
                                                {analysisData.displaySubgroups.map((sg, idx) => (
                                                    <tr key={idx} className={`border-b dark:border-gray-700 last:border-0 ${sg.isEmpty ? 'bg-red-50/30 dark:bg-red-900/10' : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}>
                                                        <td className={`p-2 border-r dark:border-gray-700 font-bold ${!sg.isComplete ? 'text-red-500 dark:text-red-400' : ''}`}>{sg.displayIndex}</td>
                                                        <td className={`p-2 border-r dark:border-gray-700 ${sg.isEmpty ? 'text-red-500 dark:text-red-400 font-bold' : 'text-gray-500 dark:text-gray-400'}`}>
                                                            {sg.isEmpty ? `~ ${sg.timeStr}` : (sg.timeStr.split(' ')[1] || '-:-')}
                                                        </td>
                                                        <td className="p-2 border-r dark:border-gray-700 font-medium truncate max-w-[100px]">{sg.operator}</td>
                                                        {sg.values.map((v, vi) => (
                                                            <td key={vi} className="p-2 border-r dark:border-gray-700">
                                                                {v === null ? <div className="w-6 h-4 border border-dashed border-red-400 dark:border-red-500/50 bg-white dark:bg-gray-800 mx-auto"></div> : v}
                                                            </td>
                                                        ))}
                                                        <td className="p-2 border-r dark:border-gray-700 font-bold bg-blue-50/30 dark:bg-blue-900/20 dark:text-blue-200">{sg.isComplete ? sg.mean.toFixed(3) : '-'}</td>
                                                        <td className="p-2 font-bold dark:border-gray-700 bg-blue-50/30 dark:bg-blue-900/20 dark:text-blue-200">{sg.isComplete ? sg.range.toFixed(3) : '-'}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                            </div>

                            <div className="w-full lg:w-96 flex flex-col gap-6">
                                
                                <div className={`p-5 rounded-xl shadow-sm border-2 flex flex-col items-center justify-center text-center ${isTargetOk ? 'bg-green-50 border-green-500' : 'bg-red-50 border-red-500'}`}>
                                    <h3 className="font-black text-lg mb-2 dark:text-gray-800 uppercase">{targetCustomerName} HEDEFİ</h3>
                                    {isTargetOk ? (
                                        <><div className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center text-white font-bold text-2xl mb-2">✓</div><p className="text-green-800 font-bold text-sm">Şartlar Sağlanıyor</p></>
                                    ) : (
                                        <><div className="w-12 h-12 bg-red-500 rounded-full flex items-center justify-center text-white font-bold text-2xl mb-2">!</div><p className="text-red-800 font-bold text-sm">İyileştirme Gerekli</p></>
                                    )}
                                </div>

                                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                                    <div className="bg-gray-50 dark:bg-gray-900 p-3 font-bold text-sm text-center border-b dark:border-gray-700 dark:text-white">YETERLİLİK & PERFORMANS</div>
                                    <div className="p-4 grid grid-cols-2 gap-4 text-center">
                                        <div className="bg-blue-50 dark:bg-blue-900/20 rounded p-2 border border-blue-100 dark:border-blue-800">
                                            <div className="text-[10px] text-gray-500 dark:text-gray-400">Cp (Kısa Dönem)</div>
                                            <div className="font-black text-xl text-blue-700 dark:text-blue-300">{analysisData.Cp.toFixed(2)}</div>
                                        </div>
                                        <div className={`rounded p-2 border ${analysisData.Cpk >= targetCpk ? 'bg-green-50 border-green-200 text-green-700 dark:bg-green-900/20 dark:border-green-800 dark:text-green-400' : 'bg-red-50 border-red-200 text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400'}`}>
                                            <div className="text-[10px] text-gray-500 dark:text-gray-400">Cpk (≥{targetCpk})</div>
                                            <div className="font-black text-xl">{analysisData.Cpk.toFixed(2)}</div>
                                        </div>
                                        <div className="bg-purple-50 dark:bg-purple-900/20 rounded p-2 border border-purple-100 dark:border-purple-800">
                                            <div className="text-[10px] text-gray-500 dark:text-gray-400">Pp (Uzun Dönem)</div>
                                            <div className="font-black text-xl text-purple-700 dark:text-purple-300">{analysisData.Pp.toFixed(2)}</div>
                                        </div>
                                        <div className={`rounded p-2 border ${analysisData.Ppk >= targetPpk ? 'bg-green-50 border-green-200 text-green-700 dark:bg-green-900/20 dark:border-green-800 dark:text-green-400' : 'bg-red-50 border-red-200 text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400'}`}>
                                            <div className="text-[10px] text-gray-500 dark:text-gray-400">Ppk (≥{targetPpk})</div>
                                            <div className="font-black text-xl">{analysisData.Ppk.toFixed(2)}</div>
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 text-sm">
                                    <h4 className="font-bold border-b dark:border-gray-700 pb-2 mb-3 dark:text-white">İstatistik Özeti (n={analysisData.nSize})</h4>
                                    <div className="space-y-2">
                                        <div className="flex justify-between"><span className="text-gray-500">Örneklem Periyodu:</span> <span className="font-bold dark:text-white">{analysisData.freqMins} Dk</span></div>
                                        <div className="flex justify-between"><span className="text-gray-500">Geçerli Grup Sayısı (k):</span> <span className="font-bold dark:text-white">{analysisData.actualSubgroups.length}</span></div>
                                        <div className="flex justify-between"><span className="text-gray-500">Toplam Ölçüm (N):</span> <span className="font-bold dark:text-white">{analysisData.totalN}</span></div>
                                        <div className="flex justify-between"><span className="text-gray-500">Genel Ortalama (X̄X̄):</span> <span className="font-bold dark:text-white">{analysisData.X_double_bar.toFixed(3)}</span></div>
                                        <div className="flex justify-between"><span className="text-gray-500">Ortalama Aralık (R̄):</span> <span className="font-bold dark:text-white">{analysisData.R_bar.toFixed(3)}</span></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="text-center text-gray-400 py-20 bg-white dark:bg-gray-800 rounded-xl border border-dashed border-gray-300 dark:border-gray-700">
                            <Search className="w-16 h-16 mx-auto mb-4 opacity-20" />
                            <p>Analiz yapmak için parça ve vardiya seçiniz.</p>
                        </div>
                    )}

                    {/* ===================================================================== */}
                    {/* --- GİZLİ PDF RAPOR ŞABLONU (IŞIKLI MODA ZORLANMIŞ SABİT TASARIM) --- */}
                    {/* ===================================================================== */}
                    {analysisData && (
                        <div style={{ position: 'absolute', top: '-9999px', left: '-9999px' }}>
                            <div ref={reportRef} className="bg-white text-black font-sans box-border w-[297mm]">
                                
                                <div className="p-6 h-[209mm] flex flex-col relative box-border">
                                    <div className="flex justify-between items-start border-2 border-black p-2 mb-4 shrink-0">
                                        <div className="w-1/4 flex items-center justify-center border-r-2 border-black">
                                            <img src="/logo512.png" alt="Logo" className="h-14 object-contain" />
                                        </div>
                                        <div className="w-2/4 text-center flex flex-col justify-center">
                                            <h1 className="text-xl font-black uppercase">İstatistiki Proses Kontrol (SPC)</h1>
                                            <h2 className="text-lg font-bold">NİCELİK KONTROL KARTI (X-R)</h2>
                                        </div>
                                        <div className="w-1/4 border-l-2 border-black p-1 text-xs">
                                            <div><span className="font-bold w-20 inline-block">Rapor Tipi:</span> {selectedShiftKey === 'ALL' ? 'Tüm Üretim' : 'Vardiya Raporu'}</div>
                                            <div><span className="font-bold w-20 inline-block truncate">Hedef:</span> {targetCustomerName}</div>
                                            <div><span className="font-bold w-20 inline-block">Frekans:</span> {analysisData.freqMins} dk / {analysisData.nSize} Adet</div>
                                        </div>
                                    </div>

                                    <div className="flex gap-4 mb-4 shrink-0">
                                        <div className="w-2/3 border border-black p-2 bg-gray-50 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                                            <div><span className="font-bold w-24 inline-block">Parça No:</span> {selectedPart?.orderNumber}</div>
                                            <div><span className="font-bold w-24 inline-block">Nominal / Tol:</span> {analysisData.nominal} ({analysisData.USL.toFixed(2)} / {analysisData.LSL.toFixed(2)})</div>
                                            <div className="truncate"><span className="font-bold w-24 inline-block">Parça Adı:</span> {selectedPart?.partName}</div>
                                            <div><span className="font-bold w-24 inline-block">UCL_X / LCL_X:</span> {analysisData.UCL_X.toFixed(3)} / {analysisData.LCL_X.toFixed(3)}</div>
                                            <div className="truncate"><span className="font-bold w-24 inline-block">Karakteristik:</span> {analysisData.critName}</div>
                                            <div><span className="font-bold w-24 inline-block">UCL_R / LCL_R:</span> {analysisData.UCL_R.toFixed(3)} / {analysisData.LCL_R.toFixed(3)}</div>
                                            <div className="col-span-2 border-t border-gray-300 mt-1 pt-1 text-[10px] text-gray-500">
                                                * Bu grafik; {selectedShiftKey === 'ALL' ? 'üretime ait tüm ölçümleri' : 'sadece seçilen vardiyaya ait geçerli ölçümleri'} içerir.
                                            </div>
                                        </div>
                                        
                                        <div className="w-1/3 border-2 border-black p-2 flex flex-col items-center justify-center bg-gray-50">
                                            <h3 className="font-black text-sm mb-2 uppercase border-b border-black w-full text-center pb-1 truncate">{targetCustomerName} PERFORMANSI</h3>
                                            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-center w-full">
                                                <div><div className="text-[10px]">Cp</div><div className="text-lg font-black">{analysisData.Cp.toFixed(2)}</div></div>
                                                <div><div className="text-[10px]">Cpk (≥{targetCpk})</div><div className={`text-lg font-black ${analysisData.Cpk >= targetCpk ? 'text-green-700' : 'text-red-600'}`}>{analysisData.Cpk.toFixed(2)}</div></div>
                                                <div><div className="text-[10px]">Pp</div><div className="text-lg font-black">{analysisData.Pp.toFixed(2)}</div></div>
                                                <div><div className="text-[10px]">Ppk (≥{targetPpk})</div><div className={`text-lg font-black ${analysisData.Ppk >= targetPpk ? 'text-green-700' : 'text-red-600'}`}>{analysisData.Ppk.toFixed(2)}</div></div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex flex-col gap-4 flex-1">
                                        <div className="border border-black p-1 flex-1 flex flex-col justify-center">
                                            <SpcChart data={analysisData.actualSubgroups} dataKey="mean" centerLine={analysisData.X_double_bar} UCL={analysisData.UCL_X} LCL={analysisData.LCL_X} USL={analysisData.USL} LSL={analysisData.LSL} showSpecs={true} width={1050} height={230} title="X-Bar (Ortalamalar)" />
                                        </div>
                                        <div className="border border-black p-1 flex-1 flex flex-col justify-center">
                                            <SpcChart data={analysisData.actualSubgroups} dataKey="range" centerLine={analysisData.R_bar} UCL={analysisData.UCL_R} LCL={analysisData.LCL_R} showSpecs={false} width={1050} height={180} title="R (Aralıklar)" />
                                        </div>
                                    </div>
                                </div>

                                <div className="html2pdf__page-break"></div>

                                <div className="p-6 h-[209mm] flex flex-col relative box-border pt-8">
                                    
                                    <div className="flex justify-between items-center border-b-2 border-black pb-2 mb-4 shrink-0">
                                        <h2 className="text-base font-black">SPC ÖLÇÜM VERİ TABLOSU (Ek-1)</h2>
                                        <div className="text-xs font-bold">Parça No: {selectedPart?.orderNumber} | Vardiya: {selectedShiftKey === 'ALL' ? 'TÜMÜ' : selectedShiftKey}</div>
                                    </div>

                                    <div className="flex justify-between items-end mb-2 shrink-0">
                                        <h3 className="font-black text-sm">ALT GRUP VERİLERİ (Tablo)</h3>
                                        {selectedShiftKey !== 'ALL' && analysisData.displaySubgroups.some(sg => !sg.isComplete) && (
                                            <span className="text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 px-2 py-1">
                                                DİKKAT: Tablodaki kırmızı kesikli kutular operatör tarafından ölçümü girilmemiş eksik/kayıp verileri temsil eder.
                                            </span>
                                        )}
                                    </div>
                                    
                                    <div className="border border-black overflow-hidden text-xs flex-1 flex flex-col bg-white">
                                        <div className="flex font-bold bg-gray-200 border-b border-black text-center shrink-0">
                                            <div className="w-8 shrink-0 border-r border-black p-2">Grup</div>
                                            <div className="w-16 shrink-0 border-r border-black p-2">Saat</div>
                                            <div className="w-20 shrink-0 border-r border-black p-2">Operatör</div>
                                            <div className="flex-1 grid divide-x divide-black" style={{ gridTemplateColumns: `repeat(${analysisData.nSize}, minmax(0, 1fr))` }}>
                                                {Array.from({length: analysisData.nSize}).map((_, i) => <div key={i} className="p-2">X{i+1}</div>)}
                                            </div>
                                            <div className="w-14 shrink-0 border-l border-black p-2">Ort(X̄)</div>
                                            <div className="w-14 shrink-0 border-l border-black p-2">Fark(R)</div>
                                        </div>
                                        <div className="flex flex-col flex-1 divide-y divide-gray-300">
                                            {analysisData.displaySubgroups.slice(0, 36).map((sg, i) => (
                                                <div key={i} className={`flex text-center flex-1 items-center min-h-[14px] ${sg.isEmpty ? 'bg-red-50/50' : ''}`}>
                                                    <div className={`w-8 shrink-0 border-r border-black font-bold h-full flex items-center justify-center ${!sg.isComplete ? 'text-red-500' : ''}`}>{sg.displayIndex}</div>
                                                    <div className={`w-16 shrink-0 border-r border-black h-full flex items-center justify-center text-[10px] ${sg.isEmpty ? 'text-red-500 font-bold' : ''}`}>
                                                        {sg.isEmpty ? `~ ${sg.timeStr}` : (sg.timeStr.split(' ')[1] || '-')}
                                                    </div>
                                                    <div className="w-20 shrink-0 border-r border-black truncate px-1 text-[9px] h-full flex items-center justify-center overflow-hidden">{sg.operator}</div>
                                                    <div className="flex-1 grid divide-x divide-gray-300 h-full" style={{ gridTemplateColumns: `repeat(${analysisData.nSize}, minmax(0, 1fr))` }}>
                                                        {sg.values.map((v,vi)=>(
                                                            <div key={vi} className="flex items-center justify-center h-full">
                                                                {v === null ? <div className="w-3 h-2 border border-red-400 border-dashed bg-white"></div> : v}
                                                            </div>
                                                        ))}
                                                    </div>
                                                    <div className="w-14 shrink-0 border-l border-black font-bold h-full flex items-center justify-center bg-gray-50">{sg.isComplete ? sg.mean.toFixed(3) : '-'}</div>
                                                    <div className="w-14 shrink-0 border-l border-black font-bold h-full flex items-center justify-center bg-gray-50">{sg.isComplete ? sg.range.toFixed(3) : '-'}</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="mt-4 border-2 border-black p-3 text-xs flex justify-between shrink-0 bg-gray-50">
                                        <div className="text-center w-1/3 px-4">
                                            <div className="font-bold border-b border-black pb-1 mb-8">Hazırlayan (Kalite Op.)</div>
                                            <div className="text-gray-400 italic">İmza</div>
                                        </div>
                                        <div className="text-center w-1/3 px-4 border-l border-r border-black">
                                            <div className="font-bold border-b border-black pb-1 mb-8">Kontrol (Kalite Sorumlusu)</div>
                                            <div className="text-gray-400 italic">İmza</div>
                                        </div>
                                        <div className="text-center w-1/3 px-4">
                                            <div className="font-bold border-b border-black pb-1 mb-8">Onay ({targetCustomerName})</div>
                                            <div className="text-gray-400 italic">İmza</div>
                                        </div>
                                    </div>

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