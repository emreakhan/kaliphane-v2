// src/pages/CncSpcSimulationTab.js

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
    Search, FileText, Calendar, RefreshCw, Wand2, AlertCircle, Wrench, UserCheck, UserPlus
} from 'lucide-react';
import { collection, query, onSnapshot } from '../config/firebase.js';
import { CNC_PARTS_COLLECTION } from '../config/constants.js';
import { formatDateTime } from '../utils/dateUtils.js';
import html2pdf from 'html2pdf.js'; 

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

const randn_bm = () => {
    let u = 0, v = 0;
    while(u === 0) u = Math.random();
    while(v === 0) v = Math.random();
    return Math.sqrt( -2.0 * Math.log( u ) ) * Math.cos( 2.0 * Math.PI * v );
}

const getShiftInfo = (dateObj) => {
    const h = dateObj.getHours();
    const d = new Date(dateObj);
    
    if (h < 8) {
        d.setDate(d.getDate() - 1); 
    }
    
    const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

    if (h >= 8 && h < 16) {
        return { shift: 1, dateStr, label: '1. Vardiya (08:00 - 16:00)' };
    } else if (h >= 16 && h <= 23) {
        return { shift: 2, dateStr, label: '2. Vardiya (16:00 - 24:00)' };
    } else {
        return { shift: 3, dateStr, label: '3. Vardiya (00:00 - 08:00)' };
    }
};

const getExpectedTimeStr = (shiftKey, groupIndex, freqMins) => {
    if (!shiftKey || shiftKey === 'ALL') return '-:-';
    const shift = parseInt(shiftKey.split('_')[1]); 
    let startHour = shift === 1 ? 8 : shift === 2 ? 16 : 0; 

    const totalMins = startHour * 60 + (groupIndex + 1) * freqMins;
    const h = Math.floor(totalMins / 60) % 24;
    const m = totalMins % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
};

const SpcChart = ({ data, dataKey, centerLine, UCL, LCL, USL, LSL, title, width = 1000, height = 300, showSpecs = false }) => {
    const validData = data.filter(d => d.isComplete);
    if (!validData || validData.length === 0) return <div className="text-center text-gray-400 py-10">Veri yok</div>;

    const paddingLeft = 75;  const paddingRight = 75; const paddingY = 40;
    const chartWidth = width - paddingLeft - paddingRight;

    const allValues = [ ...validData.map(d => d[dataKey]), centerLine, UCL, LCL, ...(showSpecs && USL !== undefined ? [USL] : []), ...(showSpecs && LSL !== undefined ? [LSL] : []) ].filter(v => v !== undefined && !isNaN(v));
    const chartMin = Math.min(...allValues); const chartMax = Math.max(...allValues);
    const range = chartMax - chartMin;
    const yMax = chartMax + (range * 0.15) || chartMax + 1; const yMin = chartMin - (range * 0.15) || chartMin - 1;
    const safeYRange = (yMax - yMin) === 0 ? 1 : (yMax - yMin);
    
    const xScale = (index) => paddingLeft + (index * (chartWidth / (Math.max(validData.length - 1, 1))));
    const yScale = (val) => height - paddingY - ((val - yMin) / safeYRange) * (height - 2 * paddingY);

    const clY = yScale(centerLine); const uclY = yScale(UCL); const lclY = yScale(LCL);
    const linePoints = validData.map((d, i) => `${xScale(i)},${yScale(d[dataKey])}`).join(' ');

    return (
        <div className="overflow-x-auto flex flex-col items-center w-full relative h-full">
            <div className="absolute top-2 left-1/2 -translate-x-1/2 text-xs font-black text-indigo-800 dark:text-indigo-200 bg-white/90 dark:bg-gray-800/90 px-3 py-1 rounded-full shadow-sm z-10 border border-indigo-100 dark:border-indigo-700">{title}</div>
            <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm preserve-3d">
                {validData.map((_, i) => <line key={`grid-${i}`} x1={xScale(i)} y1={paddingY} x2={xScale(i)} y2={height - paddingY + 10} stroke="#F3F4F6" strokeWidth="1" />)}
                <rect x={paddingLeft} y={uclY} width={chartWidth} height={Math.max(0, lclY - uclY)} fill="rgba(99, 102, 241, 0.04)" />
                
                {showSpecs && USL !== undefined && (
                    <g><line x1={paddingLeft} y1={yScale(USL)} x2={width - paddingRight} y2={yScale(USL)} stroke="#059669" strokeWidth="2.5" strokeDasharray="4,4" /><rect x={width - paddingRight + 5} y={yScale(USL) - 10} width="65" height="20" fill="#D1FAE5" rx="4" /><text x={width - paddingRight + 8} y={yScale(USL) + 4} className="text-[11px] fill-green-800 font-black">USL: {USL.toFixed(2)}</text></g>
                )}
                {showSpecs && LSL !== undefined && (
                    <g><line x1={paddingLeft} y1={yScale(LSL)} x2={width - paddingRight} y2={yScale(LSL)} stroke="#059669" strokeWidth="2.5" strokeDasharray="4,4" /><rect x={width - paddingRight + 5} y={yScale(LSL) - 10} width="65" height="20" fill="#D1FAE5" rx="4" /><text x={width - paddingRight + 8} y={yScale(LSL) + 4} className="text-[11px] fill-green-800 font-black">LSL: {LSL.toFixed(2)}</text></g>
                )}
                <g><line x1={paddingLeft} y1={clY} x2={width - paddingRight} y2={clY} stroke="#4F46E5" strokeWidth="2.5" /><rect x={4} y={clY - 10} width="66" height="20" fill="#E0E7FF" rx="4" /><text x={8} y={clY + 4} className="text-[11px] fill-indigo-800 font-black">CL: {centerLine.toFixed(2)}</text></g>
                <g><line x1={paddingLeft} y1={uclY} x2={width - paddingRight} y2={uclY} stroke="#DC2626" strokeWidth="2.5" strokeDasharray="6,4" /><rect x={4} y={uclY - 10} width="66" height="20" fill="#FEE2E2" rx="4" /><text x={6} y={uclY + 4} className="text-[11px] fill-red-800 font-black">UCL: {UCL.toFixed(2)}</text></g>
                <g><line x1={paddingLeft} y1={lclY} x2={width - paddingRight} y2={lclY} stroke="#DC2626" strokeWidth="2.5" strokeDasharray="6,4" /><rect x={4} y={lclY - 10} width="66" height="20" fill="#FEE2E2" rx="4" /><text x={6} y={lclY + 4} className="text-[11px] fill-red-800 font-black">LCL: {LCL.toFixed(2)}</text></g>

                <polyline points={linePoints} fill="none" stroke="#374151" strokeWidth="2" />
                {validData.map((d, i) => {
                    const val = d[dataKey]; const isOut = val > UCL || val < LCL;
                    return (
                        <g key={i} className="group">
                            <circle cx={xScale(i)} cy={yScale(val)} r={isOut ? "6.5" : "4.5"} fill={isOut ? "#DC2626" : "#374151"} stroke="#ffffff" strokeWidth="1.5" className="cursor-pointer hover:r-[8px] transition-all"/>
                            <text x={xScale(i)} y={height - 15} className="text-[11px] fill-gray-500 font-bold" textAnchor="middle">{d.displayIndex}</text>
                            <title>{`Grup: ${d.displayIndex}\nDeğer: ${val.toFixed(2)}\nOperatör: ${d.operator}\nTarih: ${d.timeStr}`}</title>
                        </g>
                    );
                })}
            </svg>
        </div>
    );
};

const CncSpcSimulationTab = ({ db }) => {
    const [parts, setParts] = useState([]);
    const [selectedPartId, setSelectedPartId] = useState('');
    const [selectedCriterionId, setSelectedCriterionId] = useState('');
    const [selectedPart, setSelectedPart] = useState(null);
    
    const [searchTerm, setSearchTerm] = useState('');
    const [showPartList, setShowPartList] = useState(false);
    
    // Ayarlar
    const [startDateStr, setStartDateStr] = useState(new Date().toISOString().split('T')[0]);
    const [shiftCount, setShiftCount] = useState(3); 
    const [measuringToolCode, setMeasuringToolCode] = useState('KUMPAS-SIM-01'); 
    
    // YENİ EKLENEN İMZA ALANLARI
    const [preparedBy, setPreparedBy] = useState('Kalite Operatörü');
    const [approvedBy, setApprovedBy] = useState('Kalite Müdürü');

    const [isSimulating, setIsSimulating] = useState(false);
    const [simulatedMeasurements, setSimulatedMeasurements] = useState([]);
    const [selectedShiftKey, setSelectedShiftKey] = useState('ALL');

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
            setSimulatedMeasurements([]); 
        } else { setSelectedPart(null); setSelectedCriterionId(''); }
    }, [selectedPartId, parts]);

    const generateSimulation = () => {
        if (!selectedCriterionId || !selectedPart) return;
        setIsSimulating(true);

        setTimeout(() => {
            const crit = selectedPart.criteria.find(c => c.id.toString() === selectedCriterionId.toString());
            const nSize = parseInt(selectedPart.sampleQuantity) || 5;
            const freqMins = parseInt(selectedPart.sampleFrequencyMinutes) || 25;
            
            const expectedGroupsPerShift = Math.min(Math.floor(480 / freqMins), 36);

            const nominal = parseFloat(crit.nominal);
            const upperTol = parseFloat(crit.upperTol);
            const lowerTol = Math.abs(parseFloat(crit.lowerTol));
            const USL = nominal + upperTol;
            const LSL = nominal - lowerTol;
            
            const tolRange = USL - LSL;
            const targetSigma = tolRange / 12; 
            
            const mockMs = [];
            
            const [y, mon, d] = startDateStr.split('-');
            const baseDate = new Date(parseInt(y), parseInt(mon)-1, parseInt(d), 0, 0, 0);

            for (let shiftIndex = 0; shiftIndex < shiftCount; shiftIndex++) {
                const shiftType = (shiftIndex % 3) + 1; 
                let startHour = shiftType === 1 ? 8 : shiftType === 2 ? 16 : 0; 
                
                const shiftDate = new Date(baseDate.getTime());
                shiftDate.setDate(baseDate.getDate() + Math.floor(shiftIndex / 3));

                if (shiftType === 3) {
                    shiftDate.setDate(shiftDate.getDate() + 1);
                }
                shiftDate.setHours(startHour, 0, 0, 0);

                const operatorName = shiftType === 1 ? 'Ahmet T.' : shiftType === 2 ? 'Mehmet Y.' : 'Ali K.';

                for (let groupIdx = 0; groupIdx < expectedGroupsPerShift; groupIdx++) {
                    const groupTime = new Date(shiftDate.getTime() + (groupIdx + 1) * freqMins * 60000);
                    
                    for(let i=0; i<nSize; i++) {
                        let val = nominal + randn_bm() * targetSigma;
                        if(val > USL - (targetSigma/2)) val = USL - (targetSigma);
                        if(val < LSL + (targetSigma/2)) val = LSL + (targetSigma);
                        val = parseFloat(val.toFixed(2));

                        mockMs.push({
                            timestamp: groupTime.toISOString(),
                            operator: operatorName,
                            machine: 'SIM-01',
                            details: [{ criterionId: selectedCriterionId, value: val, type: 'NUMBER' }]
                        });
                    }
                }
            }

            setSimulatedMeasurements(mockMs);
            setSelectedShiftKey('ALL');
            setIsSimulating(false);
        }, 500); 
    };

    const availableShifts = useMemo(() => {
        if (!simulatedMeasurements || simulatedMeasurements.length === 0) return [];
        const shiftsMap = new Map();
        
        simulatedMeasurements.forEach(m => {
            const detail = m.details?.find(d => d.criterionId.toString() === selectedCriterionId.toString());
            if (detail && detail.value !== null) {
                const info = getShiftInfo(new Date(m.timestamp));
                if (info && info.shift !== 0) { 
                    const key = `${info.dateStr}_${info.shift}`;
                    shiftsMap.set(key, { ...info, key });
                }
            }
        });
        return Array.from(shiftsMap.values()).sort((a, b) => a.key.localeCompare(b.key)); 
    }, [simulatedMeasurements, selectedCriterionId]);

    const groupedAnalysisData = useMemo(() => {
        if (!selectedCriterionId || simulatedMeasurements.length === 0 || !selectedPart) return [];

        const crit = selectedPart.criteria.find(c => c.id.toString() === selectedCriterionId.toString());
        if (!crit) return [];

        const nSize = parseInt(selectedPart.sampleQuantity) || 5;
        const freqMins = parseInt(selectedPart.sampleFrequencyMinutes) || 25;
        
        const expectedGroupsPerShift = Math.min(Math.floor(480 / freqMins), 36);
        const consts = SPC_CONSTANTS[nSize] || SPC_CONSTANTS[5];

        const nominal = parseFloat(crit.nominal);
        const USL = nominal + parseFloat(crit.upperTol);
        const LSL = nominal - Math.abs(parseFloat(crit.lowerTol));

        const shiftsToProcess = selectedShiftKey === 'ALL' 
            ? availableShifts.map(s => s.key) 
            : [selectedShiftKey];

        return shiftsToProcess.map(shiftKey => {
            const shiftInfo = availableShifts.find(s => s.key === shiftKey) || { label: 'Bilinmeyen Vardiya', dateStr: new Date().toISOString() };
            
            const rawPoints = [];
            simulatedMeasurements.forEach(m => {
                const detail = m.details?.find(d => d.criterionId.toString() === selectedCriterionId.toString());
                if (detail && detail.value !== null) {
                    const dateObj = new Date(m.timestamp);
                    const info = getShiftInfo(dateObj);
                    if (info && `${info.dateStr}_${info.shift}` === shiftKey) {
                        rawPoints.push({ value: parseFloat(detail.value), date: dateObj, operator: m.operator });
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
                    isEmpty: false, isComplete: isComplete,
                    displayIndex: displaySubgroups.length + 1,
                    values: vals, mean, range,
                    operator: chunk[0].operator.split(' ')[0], 
                    timeStr: formatDateTime(chunk[0].date.toISOString())
                };

                displaySubgroups.push(sgObj);
                if (isComplete) actualSubgroups.push(sgObj);
            }

            const k = actualSubgroups.length; 
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

            const Cp = sigma_within > 0 ? (USL - LSL) / (6 * sigma_within) : 0;
            const Cpk = sigma_within > 0 ? Math.min((USL - X_double_bar) / (3 * sigma_within), (X_double_bar - LSL) / (3 * sigma_within)) : 0;
            const Pp = sigma_overall > 0 ? (USL - LSL) / (6 * sigma_overall) : 0;
            const Ppk = sigma_overall > 0 ? Math.min((USL - overallMean) / (3 * sigma_overall), (overallMean - LSL) / (3 * sigma_overall)) : 0;

            if (displaySubgroups.length < expectedGroupsPerShift) {
                const missingCount = expectedGroupsPerShift - displaySubgroups.length;
                for(let i=0; i<missingCount; i++) {
                    const groupIndex = displaySubgroups.length;
                    const expectedTime = getExpectedTimeStr(shiftKey, groupIndex, freqMins);
                    displaySubgroups.push({
                        isEmpty: true, isComplete: false,
                        displayIndex: groupIndex + 1,
                        values: Array(nSize).fill(null),
                        mean: 0, range: 0, operator: '-', 
                        timeStr: expectedTime 
                    });
                }
            }

            return {
                shiftKey,
                shiftLabel: `${new Date(shiftInfo.dateStr).toLocaleDateString('tr-TR')} - ${shiftInfo.label}`,
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
        }).filter(data => data.actualSubgroups.length > 0 || data.displaySubgroups.length > 0);
    }, [simulatedMeasurements, selectedCriterionId, selectedShiftKey, selectedPart, availableShifts]);

    const handleDownloadReport = (shiftKey, shiftLabel) => {
        const element = document.getElementById(`pdf-report-${shiftKey}`);
        if (!element) return;
        
        const opt = {
            margin: 0, 
            filename: `SPC_Simulasyon_${selectedPart?.orderNumber || 'Parca'}_${shiftLabel.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`,
            image: { type: 'jpeg', quality: 1 },
            html2canvas: { scale: 2, useCORS: true }, 
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }
        };
        html2pdf().set(opt).from(element).save();
    };

    const targetCustomerName = selectedPart?.targetCustomer || 'STANDART';
    const targetCpk = parseFloat(selectedPart?.targetCpk) || 1.33;
    const targetPpk = parseFloat(selectedPart?.targetPpk) || 1.33;

    return (
        <div className="animate-in fade-in zoom-in duration-300">
            
            {/* SİMÜLASYON AYAR PANELİ */}
            <div className="bg-indigo-50 dark:bg-indigo-900/10 p-4 rounded-xl shadow-sm border border-indigo-200 dark:border-indigo-800/50 mb-6 grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                <div className="md:col-span-12 mb-1 flex items-center text-indigo-800 dark:text-indigo-300 font-black">
                    <Wand2 className="w-5 h-5 mr-2" /> Kusursuz Proses Simülasyon Motoru
                </div>
                
                {/* 1. Satır: Parça, Kriter, Ölçüm Aracı, Başlangıç, Vardiya Adedi */}
                <div className="relative z-50 md:col-span-3">
                    <label className="block text-[10px] font-bold text-indigo-500 uppercase mb-1">Parça Seçimi (Stok Kodu)</label>
                    <div className="relative">
                        <Search className="absolute left-3 top-3 text-indigo-400 w-4 h-4" />
                        <input type="text" placeholder="Arama yap..." className="w-full pl-9 p-2 border rounded bg-white dark:bg-gray-800 border-indigo-200 dark:border-indigo-700 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 uppercase text-sm font-bold" value={searchTerm} onFocus={() => setShowPartList(true)} onChange={(e) => { setSearchTerm(e.target.value); setSelectedPartId(''); setShowPartList(true); }}/>
                    </div>
                    {showPartList && (
                        <>
                            <div className="fixed inset-0 z-10" onClick={() => setShowPartList(false)}></div>
                            <div className="absolute top-full left-0 right-0 mt-1 border border-gray-200 dark:border-gray-600 rounded-lg max-h-48 overflow-y-auto bg-white dark:bg-gray-800 shadow-xl z-20">
                                {filteredParts.map(part => (
                                    <div key={part.id} onClick={() => { setSelectedPartId(part.id); setSearchTerm(part.orderNumber || 'KOD YOK'); setShowPartList(false); }} className="p-2.5 text-sm cursor-pointer border-b hover:bg-indigo-50 font-bold dark:text-white">{part.orderNumber || 'KOD YOK'}</div>
                                ))}
                            </div>
                        </>
                    )}
                </div>
                
                {selectedPart && (
                    <div className="md:col-span-3">
                        <label className="block text-[10px] font-bold text-indigo-500 uppercase mb-1">Ölçü Kriteri</label>
                        <select className="w-full p-2 border rounded bg-white dark:bg-gray-800 border-indigo-200 dark:border-indigo-700 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-bold" value={selectedCriterionId} onChange={(e) => setSelectedCriterionId(e.target.value)}>
                            {selectedPart.criteria.filter(c => !c.type || c.type === 'NUMBER').map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                    </div>
                )}

                {selectedPart && (
                    <div className="md:col-span-2">
                        <label className="block text-[10px] font-bold text-indigo-500 uppercase mb-1 flex items-center"><Wrench className="w-3 h-3 mr-1"/> Ölçüm Aracı</label>
                        <input type="text" className="w-full p-2 border rounded bg-white dark:bg-gray-800 border-indigo-200 dark:border-indigo-700 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-bold uppercase" value={measuringToolCode} onChange={(e) => setMeasuringToolCode(e.target.value)} placeholder="Örn: KUMPAS-01" />
                    </div>
                )}

                {selectedPart && (
                    <div className="md:col-span-2">
                        <label className="block text-[10px] font-bold text-indigo-500 uppercase mb-1">Başlangıç Tarihi</label>
                        <input type="date" className="w-full p-2 border rounded bg-white dark:bg-gray-800 border-indigo-200 dark:border-indigo-700 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-bold" value={startDateStr} onChange={(e) => setStartDateStr(e.target.value)} />
                    </div>
                )}

                {selectedPart && (
                    <div className="md:col-span-2">
                        <label className="block text-[10px] font-bold text-indigo-500 uppercase mb-1">Üretilecek Vardiya</label>
                        <div className="flex items-center gap-2">
                            <input type="number" min="1" max="20" className="w-full p-2 border rounded bg-white dark:bg-gray-800 border-indigo-200 dark:border-indigo-700 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-bold text-center" value={shiftCount} onChange={(e) => setShiftCount(parseInt(e.target.value)||1)} />
                            <span className="text-xs font-bold text-indigo-700 dark:text-indigo-300">Adet</span>
                        </div>
                    </div>
                )}

                {/* 2. Satır: Hazırlayan, Onaylayan ve Simüle Et Butonu */}
                {selectedPart && selectedCriterionId && (
                    <>
                        <div className="md:col-span-3 mt-2">
                            <label className="block text-[10px] font-bold text-indigo-500 uppercase mb-1 flex items-center"><UserPlus className="w-3 h-3 mr-1"/> Hazırlayan</label>
                            <input type="text" className="w-full p-2 border rounded bg-white dark:bg-gray-800 border-indigo-200 dark:border-indigo-700 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-bold uppercase" value={preparedBy} onChange={(e) => setPreparedBy(e.target.value)} placeholder="İsim Giriniz" />
                        </div>
                        <div className="md:col-span-3 mt-2">
                            <label className="block text-[10px] font-bold text-indigo-500 uppercase mb-1 flex items-center"><UserCheck className="w-3 h-3 mr-1"/> Onaylayan</label>
                            <input type="text" className="w-full p-2 border rounded bg-white dark:bg-gray-800 border-indigo-200 dark:border-indigo-700 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-bold uppercase" value={approvedBy} onChange={(e) => setApprovedBy(e.target.value)} placeholder="İsim Giriniz" />
                        </div>

                        <div className="md:col-span-6 mt-2">
                            <button onClick={generateSimulation} disabled={isSimulating} className="w-full p-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-bold flex items-center justify-center transition shadow-md text-sm">
                                {isSimulating ? <RefreshCw className="w-4 h-4 animate-spin"/> : <><Wand2 className="w-4 h-4 mr-2" /> Ayarları Onayla ve Simüle Et</>}
                            </button>
                        </div>
                    </>
                )}
            </div>

            {simulatedMeasurements.length > 0 && (
                <div className="flex justify-between items-center mb-6 bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-indigo-100 dark:border-indigo-900/50">
                    <div className="w-full md:w-1/2">
                        <label className="block text-xs font-bold text-indigo-500 uppercase mb-1 flex items-center"><Calendar className="w-3 h-3 mr-1"/> İzlenecek Vardiyalar</label>
                        <select className="w-full p-2 border rounded bg-indigo-50 dark:bg-indigo-900/30 text-indigo-900 dark:text-indigo-100 border-indigo-200 dark:border-indigo-800 outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-bold" value={selectedShiftKey} onChange={(e) => setSelectedShiftKey(e.target.value)}>
                            <option value="ALL">TÜM ÜRETİMİ (Vardiya Vardiya Listele)</option>
                            {availableShifts.map(s => <option key={s.key} value={s.key}>{new Date(s.dateStr).toLocaleDateString('tr-TR')} - {s.label}</option>)}
                        </select>
                    </div>
                </div>
            )}

            {groupedAnalysisData.map((shiftData, index) => {
                const isTargetOk = (shiftData.Cpk >= targetCpk && shiftData.Ppk >= targetPpk);

                return (
                    <div key={shiftData.shiftKey} className={`mb-16 ${index > 0 ? 'pt-8 border-t-4 border-indigo-100 dark:border-indigo-900/30' : ''}`}>
                        
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-black text-indigo-900 dark:text-indigo-300 flex items-center">
                                <Calendar className="w-6 h-6 mr-2" /> {shiftData.shiftLabel}
                            </h2>
                            <button onClick={() => handleDownloadReport(shiftData.shiftKey, shiftData.shiftLabel)} className="bg-green-600 hover:bg-green-700 text-white px-5 py-2 rounded-lg shadow flex items-center font-bold transition transform active:scale-95 text-sm">
                                <FileText className="w-4 h-4 mr-2" /> Bu Vardiyanın Raporunu İndir
                            </button>
                        </div>

                        {shiftData.displaySubgroups.some(sg => !sg.isComplete) && (
                            <div className="bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500 p-4 rounded shadow-sm flex items-start mb-6">
                                <AlertCircle className="w-6 h-6 text-red-500 mr-3 shrink-0" />
                                <div>
                                    <h3 className="text-red-800 dark:text-red-300 font-bold">Eksik Ölçüm Uyarısı!</h3>
                                    <p className="text-red-600 dark:text-red-400 text-sm">
                                        Bu vardiyada her {shiftData.freqMins} dakikada bir toplam <strong>{shiftData.expectedGroupsPerShift} grup</strong> ölçüm girilmesi beklenmektedir. Eksik veya atlanan ölçümler kırmızı boş kutularla gösterilmiştir.
                                    </p>
                                </div>
                            </div>
                        )}

                        <div className="flex flex-col lg:flex-row gap-6">
                            <div className="flex-1 flex flex-col gap-6">
                                <div className="bg-white dark:bg-gray-800 p-1 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 h-[280px]">
                                    <SpcChart title={`X-BAR (ORTALAMALAR) - ${shiftData.shiftLabel}`} data={shiftData.actualSubgroups} dataKey="mean" centerLine={shiftData.X_double_bar} UCL={shiftData.UCL_X} LCL={shiftData.LCL_X} USL={shiftData.USL} LSL={shiftData.LSL} showSpecs={true} height={260} />
                                </div>
                                <div className="bg-white dark:bg-gray-800 p-1 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 h-[220px]">
                                    <SpcChart title={`R (ARALIKLAR) - ${shiftData.shiftLabel}`} data={shiftData.actualSubgroups} dataKey="range" centerLine={shiftData.R_bar} UCL={shiftData.UCL_R} LCL={shiftData.LCL_R} showSpecs={false} height={200} />
                                </div>

                                {/* EKRAN VERİ TABLOSU */}
                                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                                    <div className="bg-indigo-50 dark:bg-indigo-900/20 p-3 font-bold text-sm text-center border-b dark:border-gray-700 text-indigo-900 dark:text-indigo-200">
                                        ÖLÇÜM VERİ TABLOSU ({shiftData.shiftLabel})
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-xs text-center">
                                            <thead className="bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-200 border-b dark:border-gray-600">
                                                <tr>
                                                    <th className="p-2 border-r dark:border-gray-600">Grup</th>
                                                    <th className="p-2 border-r dark:border-gray-600">Saat</th>
                                                    <th className="p-2 border-r dark:border-gray-600">Operatör</th>
                                                    {Array.from({length: shiftData.nSize}).map((_, i) => (
                                                        <th key={i} className="p-2 border-r dark:border-gray-600">X{i+1}</th>
                                                    ))}
                                                    <th className="p-2 border-r dark:border-gray-600 bg-indigo-50/50 dark:bg-indigo-900/30">Ortalama (X̄)</th>
                                                    <th className="p-2 bg-indigo-50/50 dark:bg-indigo-900/30">Aralık (R)</th>
                                                </tr>
                                            </thead>
                                            <tbody className="text-gray-800 dark:text-gray-200">
                                                {shiftData.displaySubgroups.map((sg, idx) => (
                                                    <tr key={idx} className={`border-b dark:border-gray-700 last:border-0 ${sg.isEmpty ? 'bg-red-50/30 dark:bg-red-900/10' : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}>
                                                        <td className={`p-2 border-r dark:border-gray-700 font-bold ${!sg.isComplete ? 'text-red-500 dark:text-red-400' : ''}`}>{sg.displayIndex}</td>
                                                        
                                                        <td className={`p-2 border-r dark:border-gray-700 ${sg.isEmpty ? 'text-red-500 dark:text-red-400 font-bold' : 'text-gray-500 dark:text-gray-400'}`}>
                                                            {sg.isEmpty ? `~ ${sg.timeStr}` : (sg.timeStr.split(' ')[1] || '-:-')}
                                                        </td>
                                                        
                                                        <td className="p-2 border-r dark:border-gray-700 font-medium truncate max-w-[100px]">{sg.operator}</td>
                                                        {sg.values.map((v, vi) => (
                                                            <td key={vi} className="p-2 border-r dark:border-gray-700 font-mono">
                                                                {v === null ? <div className="w-6 h-4 border border-dashed border-red-400 dark:border-red-500/50 bg-white dark:bg-gray-800 mx-auto"></div> : v.toFixed(2)}
                                                            </td>
                                                        ))}
                                                        <td className="p-2 border-r dark:border-gray-700 font-bold bg-indigo-50/30 dark:bg-indigo-900/20 dark:text-indigo-200">{sg.isComplete ? sg.mean.toFixed(2) : '-'}</td>
                                                        <td className="p-2 font-bold dark:border-gray-700 bg-indigo-50/30 dark:bg-indigo-900/20 dark:text-indigo-200">{sg.isComplete ? sg.range.toFixed(2) : '-'}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                                
                                {/* EKRAN İÇİN İMZA BLOKLARI (SADELEŞTİRİLMİŞ) */}
                                <div className="mt-4 border-2 border-black p-4 text-sm flex justify-between shrink-0 bg-gray-50 dark:bg-gray-800 rounded-lg">
                                    <div className="text-center w-1/2 px-8 border-r border-black dark:border-gray-600">
                                        <div className="font-bold border-b border-black dark:border-gray-600 pb-2 mb-8 text-gray-600 dark:text-gray-300">Hazırlayan</div>
                                        <div className="font-bold text-gray-800 dark:text-white uppercase">{preparedBy || '-'}</div>
                                    </div>
                                    <div className="text-center w-1/2 px-8">
                                        <div className="font-bold border-b border-black dark:border-gray-600 pb-2 mb-8 text-gray-600 dark:text-gray-300">Onaylayan</div>
                                        <div className="font-bold text-gray-800 dark:text-white uppercase">{approvedBy || '-'}</div>
                                    </div>
                                </div>

                            </div>

                            <div className="w-full lg:w-96 flex flex-col gap-6">
                                <div className={`p-5 rounded-xl shadow-sm border-2 flex flex-col items-center justify-center text-center ${isTargetOk ? 'bg-green-50 border-green-500' : 'bg-red-50 border-red-500'}`}>
                                    <h3 className="font-black text-lg mb-2 dark:text-gray-800 uppercase">{targetCustomerName} HEDEFİ</h3>
                                    {isTargetOk ? (
                                        <><div className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center text-white font-bold text-2xl mb-2">✓</div><p className="text-green-800 font-bold text-sm">Şartlar Sağlanıyor</p></>
                                    ) : (
                                        <><div className="w-12 h-12 bg-red-500 rounded-full flex items-center justify-center text-white font-bold text-2xl mb-2">!</div><p className="text-red-800 font-bold text-sm">Toleranslar Çok Dar</p></>
                                    )}
                                </div>

                                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                                    <div className="bg-gray-50 dark:bg-gray-900 p-3 font-bold text-sm text-center border-b dark:border-gray-700 dark:text-white">PERFORMANS ({shiftData.shiftLabel.split(' - ')[1]})</div>
                                    <div className="p-4 grid grid-cols-2 gap-4 text-center">
                                        <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded p-3 border border-indigo-100 dark:border-indigo-800">
                                            <div className="text-xs font-bold text-gray-500 dark:text-gray-400">Cp (Kısa Dönem)</div>
                                            <div className="font-black text-3xl text-indigo-700 dark:text-indigo-300">{shiftData.Cp.toFixed(2)}</div>
                                        </div>
                                        <div className={`rounded p-3 border ${shiftData.Cpk >= targetCpk ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
                                            <div className="text-xs font-bold text-gray-500 dark:text-gray-400">Cpk (≥{targetCpk})</div>
                                            <div className="font-black text-3xl">{shiftData.Cpk.toFixed(2)}</div>
                                        </div>
                                        <div className="bg-purple-50 dark:bg-purple-900/20 rounded p-3 border border-purple-100 dark:border-purple-800">
                                            <div className="text-xs font-bold text-gray-500 dark:text-gray-400">Pp (Uzun Dönem)</div>
                                            <div className="font-black text-3xl text-purple-700 dark:text-purple-300">{shiftData.Pp.toFixed(2)}</div>
                                        </div>
                                        <div className={`rounded p-3 border ${shiftData.Ppk >= targetPpk ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
                                            <div className="text-xs font-bold text-gray-500 dark:text-gray-400">Ppk (≥{targetPpk})</div>
                                            <div className="font-black text-3xl">{shiftData.Ppk.toFixed(2)}</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* ====================================================================================== */}
                        {/* --- BU VARDİYAYA ÖZEL GİZLİ PDF RAPOR ŞABLONU --- */}
                        {/* ====================================================================================== */}
                        <div style={{ position: 'absolute', top: '-9999px', left: '-9999px' }}>
                            <div id={`pdf-report-${shiftData.shiftKey}`} className="bg-white text-black font-sans box-border w-[297mm]">
                                
                                {/* SAYFA 1: Grafikler */}
                                <div className="p-4 h-[205mm] flex flex-col relative box-border overflow-hidden">
                                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0 opacity-[0.03]">
                                        <div className="text-[120px] font-black transform -rotate-45 text-black">MOCK DATA</div>
                                    </div>
                                    <div className="flex justify-between items-start border-2 border-black p-2 mb-2 shrink-0 relative z-10">
                                        <div className="w-1/4 flex items-center justify-center border-r-2 border-black">
                                            <img src="/logo512.png" alt="Logo" className="h-12 object-contain" />
                                        </div>
                                        <div className="w-2/4 text-center flex flex-col justify-center">
                                            <h1 className="text-xl font-black uppercase text-indigo-900">SİMÜLASYON SPC RAPORU</h1>
                                            <h2 className="text-sm font-bold text-gray-600">Vardiya İncelemesi (Mock Data)</h2>
                                        </div>
                                        <div className="w-1/4 border-l-2 border-black p-1 text-[11px]">
                                            <div><span className="font-bold w-14 inline-block">Vardiya:</span> {shiftData.shiftLabel.split(' - ')[1]}</div>
                                            <div><span className="font-bold w-14 inline-block">Tarih:</span> {shiftData.shiftLabel.split(' - ')[0]}</div>
                                            <div><span className="font-bold w-14 inline-block">Hedef:</span> {targetCustomerName}</div>
                                            <div className="truncate"><span className="font-bold w-14 inline-block">Cihaz:</span> {measuringToolCode}</div>
                                        </div>
                                    </div>

                                    <div className="flex gap-2 mb-2 shrink-0 relative z-10">
                                        <div className="w-2/3 border border-black p-2 bg-indigo-50 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
                                            <div><span className="font-bold w-24 inline-block">Parça No:</span> {selectedPart?.orderNumber}</div>
                                            <div><span className="font-bold w-24 inline-block">Nominal / Tol:</span> {shiftData.nominal.toFixed(2)} ({shiftData.USL.toFixed(2)} / {shiftData.LSL.toFixed(2)})</div>
                                            <div className="truncate"><span className="font-bold w-24 inline-block">Parça Adı:</span> {selectedPart?.partName}</div>
                                            <div><span className="font-bold w-24 inline-block">UCL_X / LCL_X:</span> {shiftData.UCL_X.toFixed(2)} / {shiftData.LCL_X.toFixed(2)}</div>
                                            <div className="truncate"><span className="font-bold w-24 inline-block">Karakteristik:</span> {shiftData.critName}</div>
                                            <div><span className="font-bold w-24 inline-block">UCL_R / LCL_R:</span> {shiftData.UCL_R.toFixed(2)} / {shiftData.LCL_R.toFixed(2)}</div>
                                        </div>
                                        
                                        <div className="w-1/3 border-2 border-black p-2 flex flex-col items-center justify-center bg-gray-50">
                                            <h3 className="font-black text-xs mb-1 uppercase border-b border-black w-full text-center pb-1 truncate">{targetCustomerName} PERFORMANSI</h3>
                                            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-center w-full">
                                                <div><div className="text-[9px]">Cp</div><div className="text-sm font-black text-indigo-700">{shiftData.Cp.toFixed(2)}</div></div>
                                                <div><div className="text-[9px]">Cpk (≥{targetCpk})</div><div className={`text-sm font-black ${shiftData.Cpk >= targetCpk ? 'text-green-700' : 'text-red-600'}`}>{shiftData.Cpk.toFixed(2)}</div></div>
                                                <div><div className="text-[9px]">Pp</div><div className="text-sm font-black text-purple-700">{shiftData.Pp.toFixed(2)}</div></div>
                                                <div><div className="text-[9px]">Ppk (≥{targetPpk})</div><div className={`text-sm font-black ${shiftData.Ppk >= targetPpk ? 'text-green-700' : 'text-red-600'}`}>{shiftData.Ppk.toFixed(2)}</div></div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex flex-col gap-2 flex-1 relative z-10">
                                        <div className="border border-black p-1 flex-1 flex flex-col justify-center">
                                            <SpcChart data={shiftData.actualSubgroups} dataKey="mean" centerLine={shiftData.X_double_bar} UCL={shiftData.UCL_X} LCL={shiftData.LCL_X} USL={shiftData.USL} LSL={shiftData.LSL} showSpecs={true} width={1050} height={200} title={`X-Bar Ortalamalar (${shiftData.shiftLabel})`} />
                                        </div>
                                        <div className="border border-black p-1 flex-1 flex flex-col justify-center">
                                            <SpcChart data={shiftData.actualSubgroups} dataKey="range" centerLine={shiftData.R_bar} UCL={shiftData.UCL_R} LCL={shiftData.LCL_R} showSpecs={false} width={1050} height={140} title={`R Aralıklar (${shiftData.shiftLabel})`} />
                                        </div>
                                    </div>
                                </div>

                                <div className="html2pdf__page-break"></div>

                                {/* SAYFA 2: Tablo ve İmza */}
                                <div className="p-4 h-[205mm] flex flex-col relative box-border overflow-hidden">
                                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0 opacity-[0.03]">
                                        <div className="text-[120px] font-black transform -rotate-45 text-black">MOCK DATA</div>
                                    </div>

                                    <div className="flex justify-between items-center border-b-2 border-black pb-1 mb-2 shrink-0 relative z-10">
                                        <h2 className="text-sm font-black text-indigo-900">SPC SİMÜLASYON VERİ TABLOSU</h2>
                                        <div className="text-[10px] font-bold">Vardiya: {shiftData.shiftLabel}</div>
                                    </div>

                                    <div className="border border-black overflow-hidden text-xs flex-1 flex flex-col bg-white relative z-10">
                                        <div className="flex font-bold bg-indigo-100 border-b border-black text-center shrink-0 text-[10px]">
                                            <div className="w-8 shrink-0 border-r border-black py-1 px-0.5">Gr</div>
                                            <div className="w-16 shrink-0 border-r border-black py-1 px-0.5">Saat</div>
                                            <div className="w-20 shrink-0 border-r border-black py-1 px-0.5">Operatör</div>
                                            <div className="flex-1 grid divide-x divide-black" style={{ gridTemplateColumns: `repeat(${shiftData.nSize}, minmax(0, 1fr))` }}>
                                                {Array.from({length: shiftData.nSize}).map((_, i) => <div key={i} className="py-1 px-0.5 flex items-center justify-center">X{i+1}</div>)}
                                            </div>
                                            <div className="w-14 shrink-0 border-l border-black py-1 px-0.5 flex items-center justify-center">Ort(X̄)</div>
                                            <div className="w-14 shrink-0 border-l border-black py-1 px-0.5 flex items-center justify-center">Fark(R)</div>
                                        </div>
                                        <div className="flex flex-col flex-1 divide-y divide-gray-300">
                                            {shiftData.displaySubgroups.slice(0, 36).map((sg, i) => (
                                                <div key={i} className="flex text-center flex-1 items-center min-h-[10px]">
                                                    <div className="w-8 shrink-0 border-r border-black font-bold h-full flex items-center justify-center text-[9px]">{sg.displayIndex}</div>
                                                    
                                                    {/* SAAT KISMI - PDF İÇİN SADECE SAAT */}
                                                    <div className="w-16 shrink-0 border-r border-black h-full flex items-center justify-center text-[10px] font-mono">
                                                        {sg.timeStr.split(' ')[1] || sg.timeStr}
                                                    </div>
                                                    
                                                    <div className="w-20 shrink-0 border-r border-black truncate px-1 text-[9px] h-full flex items-center justify-center">{sg.operator}</div>
                                                    <div className="flex-1 grid divide-x divide-gray-300 h-full" style={{ gridTemplateColumns: `repeat(${shiftData.nSize}, minmax(0, 1fr))` }}>
                                                        {sg.values.map((v,vi)=>(
                                                            <div key={vi} className="flex items-center justify-center h-full font-mono text-[9px]">
                                                                {v === null ? <div className="w-3 h-2 border border-red-400 border-dashed bg-white"></div> : v.toFixed(2)}
                                                            </div>
                                                        ))}
                                                    </div>
                                                    <div className="w-14 shrink-0 border-l border-black font-bold h-full flex items-center justify-center bg-indigo-50/50 text-[9px]">{sg.isComplete ? sg.mean.toFixed(2) : '-'}</div>
                                                    <div className="w-14 shrink-0 border-l border-black font-bold h-full flex items-center justify-center bg-indigo-50/50 text-[9px]">{sg.isComplete ? sg.range.toFixed(2) : '-'}</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    
                                    {/* PDF İÇİN İMZA BLOKLARI (SADELEŞTİRİLMİŞ) */}
                                    <div className="mt-2 border-2 border-black p-2 flex justify-between shrink-0 bg-gray-50 relative z-10">
                                        <div className="text-center w-1/2 px-8 border-r border-black">
                                            <div className="font-bold border-b border-black pb-1 mb-6 text-[10px]">Hazırlayan</div>
                                            <div className="font-bold text-black text-[10px] uppercase">{preparedBy || '-'}</div>
                                        </div>
                                        <div className="text-center w-1/2 px-8">
                                            <div className="font-bold border-b border-black pb-1 mb-6 text-[10px]">Onaylayan</div>
                                            <div className="font-bold text-black text-[10px] uppercase">{approvedBy || '-'}</div>
                                        </div>
                                    </div>

                                </div>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

export default CncSpcSimulationTab;