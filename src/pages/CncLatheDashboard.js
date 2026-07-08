// src/pages/CncLatheDashboard.js

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
    Monitor, PlayCircle, StopCircle, Clock, 
    Save, Search, Edit2, Calendar, FileText, Plus, BarChart2, Download, X, Wrench, CheckCircle
} from 'lucide-react';
import { 
    collection, query, where, onSnapshot, addDoc, updateDoc, doc, getDoc, getDocs, orderBy, setDoc 
} from '../config/firebase.js';
import { 
    CNC_LATHE_JOBS_COLLECTION, CNC_LATHE_MACHINES, 
    CNC_PARTS_COLLECTION, CNC_MEASUREMENTS_COLLECTION,
    MACHINE_MAINTENANCE_TASKS_COLLECTION, MACHINE_MAINTENANCE_LOGS_COLLECTION
} from '../config/constants.js';
import { getCurrentDateTimeString } from '../utils/dateUtils.js';
import html2pdf from 'html2pdf.js'; 

const CNC_SPC_MEASUREMENTS_COLLECTION = 'cnc_spc_measurements';

// --- İSTATİSTİKSEL KATSAYILAR ---
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

const SimpleModal = ({ isOpen, onClose, title, children, maxWidth = "max-w-md", fullHeight = false }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-2 sm:p-4 backdrop-blur-sm animate-in fade-in">
            <div className={`bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full ${maxWidth} ${fullHeight ? 'h-[96vh]' : 'max-h-[95vh]'} flex flex-col`}>
                <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900 rounded-t-xl shrink-0">
                    <h3 className="text-lg font-bold text-gray-800 dark:text-white flex items-center">{title}</h3>
                    <button onClick={onClose} className="text-gray-500 hover:text-red-500 font-bold text-2xl">&times;</button>
                </div>
                <div className="p-0 sm:p-6 overflow-y-auto overflow-x-hidden flex-1 flex flex-col bg-gray-200 dark:bg-gray-700">
                    {children}
                </div>
            </div>
        </div>
    );
};

const SpcChart = ({ data, dataKey, centerLine, UCL, LCL, USL, LSL, title, width = 1000, height = 180, showSpecs = false }) => {
    const validData = data.filter(d => d.isComplete);
    if (!validData || validData.length === 0) return <div className="text-center text-gray-400 py-10 w-full h-full border border-dashed border-gray-300 flex items-center justify-center text-xs bg-gray-50">GRAFİK VERİSİ YOK</div>;

    const paddingLeft = 40; const paddingRight = 40; const paddingY = 25;
    const chartWidth = width - paddingLeft - paddingRight;

    const allValues = [ ...validData.map(d => d[dataKey]), centerLine, UCL, LCL, ...(showSpecs && USL !== undefined ? [USL] : []), ...(showSpecs && LSL !== undefined ? [LSL] : []) ].filter(v => v !== undefined && !isNaN(v));
    const chartMin = Math.min(...allValues); const chartMax = Math.max(...allValues);
    const range = chartMax - chartMin;
    
    const yMax = chartMax + (range * 0.15) || chartMax + 1;
    const yMin = chartMin - (range * 0.15) || chartMin - 1;
    const safeYRange = (yMax - yMin) === 0 ? 1 : (yMax - yMin);
    
    const xScale = (index) => paddingLeft + (index * (chartWidth / (Math.max(validData.length - 1, 1))));
    const yScale = (val) => height - paddingY - ((val - yMin) / safeYRange) * (height - 2 * paddingY);

    const clY = yScale(centerLine); const uclY = yScale(UCL); const lclY = yScale(LCL);
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
                    const val = d[dataKey]; const isOut = val > UCL || val < LCL;
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


const CncLatheDashboard = ({ db, loggedInUser, cncJobs }) => { 
    const [activeJobs, setActiveJobs] = useState([]); 
    const [parts, setParts] = useState([]); 
    
    // Modals
    const [isStartModalOpen, setIsStartModalOpen] = useState(false);
    const [isFinishModalOpen, setIsFinishModalOpen] = useState(false);
    const [isMeasureModalOpen, setIsMeasureModalOpen] = useState(false);
    const [isSpcModalOpen, setIsSpcModalOpen] = useState(false);
    const [isEditJobModalOpen, setIsEditJobModalOpen] = useState(false); 
    
    // Maintenance States
    const [isMaintenanceModalOpen, setIsMaintenanceModalOpen] = useState(false);
    const [maintenanceMachineName, setMaintenanceMachineName] = useState(null);
    const [checkedMaintenanceTasks, setCheckedMaintenanceTasks] = useState({});
    const [mTasks, setMTasks] = useState([]);
    const [mLogs, setMLogs] = useState([]);

    const [selectedMachine, setSelectedMachine] = useState(null);
    const [selectedJob, setSelectedJob] = useState(null);
    const [activeCriteria, setActiveCriteria] = useState([]); 
    const [selectedSpcCriterionId, setSelectedSpcCriterionId] = useState('');

    const [startFormData, setStartFormData] = useState({ orderNumber: '', selectedPartId: '', targetQuantity: '', plannedJobId: null });
    const [editFormData, setEditFormData] = useState({ orderNumber: '', targetQuantity: '' });
    const [producedQuantity, setProducedQuantity] = useState('');
    const [partSearchTerm, setPartSearchTerm] = useState('');
    const [isPartDropdownOpen, setIsPartDropdownOpen] = useState(false);
    
    const [measurePages, setMeasurePages] = useState([[...Array(12).fill(null).map(() => ({ details: [], operator: '', timeStr: '' }))]]);
    const [activeMeasurePageIdx, setActiveMeasurePageIdx] = useState(0);
    const [pageLotNumbers, setPageLotNumbers] = useState(['']);

    const gridData = useMemo(() => {
        return measurePages[activeMeasurePageIdx] || Array(12).fill(null).map(() => ({ details: [], operator: '', timeStr: '' }));
    }, [measurePages, activeMeasurePageIdx]);

    const setGridData = (newGrid) => {
        setMeasurePages(prev => {
            const next = [...prev];
            next[activeMeasurePageIdx] = newGrid;
            return next;
        });
    };

    const handleAddMeasurePage = () => {
        setMeasurePages(prev => [...prev, Array(12).fill(null).map(() => ({ details: [], operator: loggedInUser?.name || '', timeStr: '' }))]);
        setPageLotNumbers(prev => [...prev, '']);
        setActiveMeasurePageIdx(measurePages.length);
    };

    const [spcGridData, setSpcGridData] = useState([]); 
    const [savingForm, setSavingForm] = useState(false);

    const reportRef = useRef(null);
    const MAX_A4_COLUMNS = 25;

    useEffect(() => {
        if (!db) return;
        const qActive = query(collection(db, CNC_LATHE_JOBS_COLLECTION), where('status', '==', 'RUNNING'));
        const unsubActive = onSnapshot(qActive, (snapshot) => { setActiveJobs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))); });

        const qParts = query(collection(db, CNC_PARTS_COLLECTION));
        const unsubParts = onSnapshot(qParts, (snapshot) => {
            const partList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            partList.sort((a, b) => a.partName.localeCompare(b.partName));
            setParts(partList);
        });

        return () => { unsubActive(); unsubParts(); };
    }, [db]);

    useEffect(() => {
        if (!db) return;
        
        const unsubMTasks = onSnapshot(collection(db, MACHINE_MAINTENANCE_TASKS_COLLECTION), (snapshot) => {
            const list = [];
            snapshot.forEach(docSnapshot => {
                list.push({ id: docSnapshot.id, ...docSnapshot.data() });
            });
            setMTasks(list);
        });

        const unsubMLogs = onSnapshot(collection(db, MACHINE_MAINTENANCE_LOGS_COLLECTION), (snapshot) => {
            const list = [];
            snapshot.forEach(docSnapshot => {
                list.push({ id: docSnapshot.id, ...docSnapshot.data() });
            });
            setMLogs(list);
        });

        return () => {
            unsubMTasks();
            unsubMLogs();
        };
    }, [db]);

    // Helper to calculate due tasks for a machine in CNC Lathe Dashboard
    const getDueTasksForMachine = (machineName) => {
        const now = new Date();
        const todayStr = now.toISOString().substring(0, 10);
        const dayOfWeek = now.getDay();
        const dayOfMonth = now.getDate();
        const currentMonth = now.getMonth();
        
        const getWeekNumber = (d) => {
            const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
            const dayNum = date.getUTCDay() || 7;
            date.setUTCDate(date.getUTCDate() + 4 - dayNum);
            const yearStart = new Date(Date.UTC(date.getUTCFullYear(),0,1));
            return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
        };

        const currentWeek = getWeekNumber(now);
        const currentYear = now.getFullYear();

        const machineTasks = mTasks.filter(t => 
            t.machineIds?.includes('all') || 
            t.machineIds?.some(id => id === machineName || id.toLowerCase() === machineName.toLowerCase())
        );
        if (machineTasks.length === 0) return [];

        const dueTasks = [];

        const isCompletedThisWeek = (taskId) => {
            return mLogs.some(l => {
                const logMachineName = l.machineName?.split(' ')[0] || l.machineId;
                if (logMachineName !== machineName) return false;
                const logDate = new Date(l.timestamp);
                const logWeek = getWeekNumber(logDate);
                const logYear = logDate.getFullYear();
                const hasTask = (l.completedTasks || []).some(t => t.taskId === taskId);
                return hasTask && logWeek === currentWeek && logYear === currentYear;
            });
        };

        const isCompletedThisBiweek = (taskId) => {
            return mLogs.some(l => {
                const logMachineName = l.machineName?.split(' ')[0] || l.machineId;
                if (logMachineName !== machineName) return false;
                const logDate = new Date(l.timestamp);
                const logWeek = getWeekNumber(logDate);
                const logYear = logDate.getFullYear();
                const currentBiweekBlock = Math.floor(currentWeek / 2);
                const logBiweekBlock = Math.floor(logWeek / 2);
                const hasTask = (l.completedTasks || []).some(t => t.taskId === taskId);
                return hasTask && logBiweekBlock === currentBiweekBlock && logYear === currentYear;
            });
        };

        const isCompletedThisMonth = (taskId) => {
            return mLogs.some(l => {
                const logMachineName = l.machineName?.split(' ')[0] || l.machineId;
                if (logMachineName !== machineName) return false;
                const logDate = new Date(l.timestamp);
                const logMonth = logDate.getMonth();
                const logYear = logDate.getFullYear();
                const hasTask = (l.completedTasks || []).some(t => t.taskId === taskId);
                return hasTask && logMonth === currentMonth && logYear === currentYear;
            });
        };

        const isCompletedThisYear = (taskId) => {
            return mLogs.some(l => {
                const logMachineName = l.machineName?.split(' ')[0] || l.machineId;
                if (logMachineName !== machineName) return false;
                const logDate = new Date(l.timestamp);
                const logYear = logDate.getFullYear();
                const hasTask = (l.completedTasks || []).some(t => t.taskId === taskId);
                return hasTask && logYear === currentYear;
            });
        };

        const isCompletedToday = (taskId) => {
            return mLogs.some(l => {
                const logMachineName = l.machineName?.split(' ')[0] || l.machineId;
                return logMachineName === machineName && 
                    l.date === todayStr && 
                    (l.completedTasks || []).some(t => t.taskId === taskId);
            });
        };

        machineTasks.forEach(task => {
            if (task.frequency === 'DAILY') {
                if (!isCompletedToday(task.id)) {
                    dueTasks.push(task);
                }
            } else if (task.frequency === 'WEEKLY') {
                const isWeeklyTime = (dayOfWeek === 5 || dayOfWeek === 6 || dayOfWeek === 0);
                if (isWeeklyTime && !isCompletedThisWeek(task.id)) {
                    dueTasks.push(task);
                }
            } else if (task.frequency === 'BIWEEKLY') {
                const isWeeklyTime = (dayOfWeek === 5 || dayOfWeek === 6 || dayOfWeek === 0);
                const isEvenWeek = (currentWeek % 2 === 0);
                if (isWeeklyTime && isEvenWeek && !isCompletedThisBiweek(task.id)) {
                    dueTasks.push(task);
                }
            } else if (task.frequency === 'MONTHLY') {
                const isMonthlyTime = (dayOfMonth >= 15);
                if (isMonthlyTime && !isCompletedThisMonth(task.id)) {
                    dueTasks.push(task);
                }
            } else if (task.frequency === 'YEARLY') {
                const isYearlyTime = (currentMonth === 11);
                if (isYearlyTime && !isCompletedThisYear(task.id)) {
                    dueTasks.push(task);
                }
            }
        });

        return dueTasks;
    };

    const getPlannedJobsForMachine = (machineName) => {
        if (!cncJobs) return [];
        return cncJobs.filter(job => job.machine === machineName && job.status === 'ASSIGNED');
    };

    const handleOpenStartModal = (machine) => {
        setSelectedMachine(machine);
        setStartFormData({ orderNumber: '', selectedPartId: '', targetQuantity: '', plannedJobId: null });
        setPartSearchTerm(''); setIsPartDropdownOpen(false); setIsStartModalOpen(true);
    };

    const handleOpenStartModalIntercept = (machineName) => {
        const due = getDueTasksForMachine(machineName);
        if (due.length > 0) {
            setMaintenanceMachineName(machineName);
            setCheckedMaintenanceTasks({});
            setIsMaintenanceModalOpen(true);
        } else {
            handleOpenStartModal(machineName);
        }
    };

    const handleSelectPlannedJob = (plannedJob) => {
        setStartFormData({ orderNumber: plannedJob.orderNumber || '', selectedPartId: plannedJob.partId || '', targetQuantity: plannedJob.targetQuantity || '', plannedJobId: plannedJob.id });
        setPartSearchTerm(plannedJob.orderNumber || plannedJob.partName || '');
        if (!plannedJob.partId) {
            const matchingPart = parts.find(p => p.partName === plannedJob.partName);
            if (matchingPart) setStartFormData(prev => ({ ...prev, selectedPartId: matchingPart.id }));
        }
    };

    const handleSelectPart = (part) => {
        setStartFormData(prev => ({ ...prev, selectedPartId: part.id, orderNumber: prev.orderNumber || part.orderNumber || '' }));
        setPartSearchTerm(part.orderNumber || part.partName); setIsPartDropdownOpen(false); 
    };

    const handleStartJob = async () => {
        if (!startFormData.selectedPartId) return alert("Lütfen bir parça seçiniz.");
        const selectedPart = parts.find(p => p.id === startFormData.selectedPartId);
        if (!selectedPart) return alert("Parça bulunamadı.");

        try {
            if (startFormData.orderNumber) {
                const qCheck = query(collection(db, CNC_LATHE_JOBS_COLLECTION), where('orderNumber', '==', startFormData.orderNumber), where('status', '==', 'RUNNING'));
                const checkSnapshot = await getDocs(qCheck);
                if (!checkSnapshot.empty) return alert(`HATA: "${startFormData.orderNumber}" numaralı iş emri şu an başka bir tezgahta çalışıyor!`);
            }

            const newJobData = {
                machine: selectedMachine, orderNumber: startFormData.orderNumber || 'Plansız',
                partName: selectedPart.partName, partId: selectedPart.id,         
                targetQuantity: parseInt(startFormData.targetQuantity) || 0,
                startTime: getCurrentDateTimeString(), operator: loggedInUser.name, status: 'RUNNING'
            };

            if (startFormData.plannedJobId) await updateDoc(doc(db, CNC_LATHE_JOBS_COLLECTION, startFormData.plannedJobId), { ...newJobData, operator: loggedInUser.name });
            else await addDoc(collection(db, CNC_LATHE_JOBS_COLLECTION), newJobData);

            setIsStartModalOpen(false);
        } catch (error) { alert("İş başlatılamadı."); }
    };

    const handleOpenEditJobModal = (job) => {
        setSelectedJob(job); setEditFormData({ orderNumber: job.orderNumber || '', targetQuantity: job.targetQuantity || '' }); setIsEditJobModalOpen(true);
    };

    const handleSaveJobEdit = async () => {
        if (!selectedJob) return;
        try {
            await updateDoc(doc(db, CNC_LATHE_JOBS_COLLECTION, selectedJob.id), { orderNumber: editFormData.orderNumber, targetQuantity: parseInt(editFormData.targetQuantity) || 0 });
            setIsEditJobModalOpen(false);
        } catch (error) { alert("Güncellenemedi."); }
    };

    const handleOpenFinishModal = (job) => {
        setSelectedJob(job); setProducedQuantity(job.targetQuantity || ''); setIsFinishModalOpen(true);
    };

    const handleFinishJob = async () => {
        if (!selectedJob) return;
        try {
            const endTime = getCurrentDateTimeString();
            const start = new Date(selectedJob.startTime);
            const durationMinutes = Math.floor((new Date(endTime) - start) / 60000);

            await updateDoc(doc(db, CNC_LATHE_JOBS_COLLECTION, selectedJob.id), {
                status: 'COMPLETED', endTime: endTime, producedQuantity: parseInt(producedQuantity) || 0, durationMinutes: durationMinutes
            });
            setIsFinishModalOpen(false);
        } catch (error) { console.error("Hata:", error); }
    };

    // --- 1. STANDART FORM ---
    const handleOpenMeasureModal = async (job) => {
        setSelectedJob(job);
        let partIdToFetch = job.partId;
        if (!partIdToFetch) {
            const foundPart = parts.find(p => p.partName === job.partName);
            if (foundPart) partIdToFetch = foundPart.id; else return alert("Parça bulunamadı.");
        }
        try {
            const partRef = doc(db, CNC_PARTS_COLLECTION, partIdToFetch);
            const partSnap = await getDoc(partRef);
            if (partSnap.exists() && partSnap.data().criteria) setActiveCriteria(partSnap.data().criteria); else return alert("Ölçüm kriteri yok.");

            const mQuery = query(collection(db, CNC_MEASUREMENTS_COLLECTION), where('jobId', '==', job.id));
            const mSnap = await getDocs(mQuery);
            const measurements = mSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

            // Group measurements by pageIndex
            const pagesMap = {};
            const lotNumbersMap = {};
            measurements.forEach(m => {
                const pIdx = m.pageIndex || 0;
                if (!pagesMap[pIdx]) {
                    pagesMap[pIdx] = [];
                }
                pagesMap[pIdx].push(m);
                if (m.lotNumber && !lotNumbersMap[pIdx]) {
                    lotNumbersMap[pIdx] = m.lotNumber;
                }
            });

            const maxPageIdx = Math.max(0, ...Object.keys(pagesMap).map(k => parseInt(k)));
            const loadedPages = [];
            const loadedLotNumbers = [];

            for (let pIdx = 0; pIdx <= maxPageIdx; pIdx++) {
                const pageDocs = pagesMap[pIdx] || [];
                const newGrid = Array(12).fill(null).map(() => ({ details: [], operator: loggedInUser?.name || '', timeStr: '' }));
                let unassignedIdx = 0;
                pageDocs.forEach(m => {
                    if (m.columnIndex !== undefined && m.columnIndex >= 0 && m.columnIndex < 12) {
                        newGrid[m.columnIndex] = { ...newGrid[m.columnIndex], ...m, timeStr: m.timeStr || '' };
                    } else { 
                        while (unassignedIdx < 12 && newGrid[unassignedIdx].id) unassignedIdx++; 
                        if (unassignedIdx < 12) { 
                            newGrid[unassignedIdx] = { ...newGrid[unassignedIdx], ...m, timeStr: m.timeStr || '' }; 
                            unassignedIdx++; 
                        } 
                    }
                });
                loadedPages.push(newGrid);
                loadedLotNumbers.push(lotNumbersMap[pIdx] || '');
            }

            setMeasurePages(loadedPages);
            setPageLotNumbers(loadedLotNumbers);
            setActiveMeasurePageIdx(0);
            setIsMeasureModalOpen(true);
        } catch (error) { alert("Hata oluştu."); }
    };

    const handleCellChange = (colIndex, critId, value, type, gridState, setGridState) => {
        const newGrid = [...gridState];
        let details = newGrid[colIndex].details || [];
        const existingIdx = details.findIndex(d => d.criterionId === critId);
        let finalValue = value;
        if (type === 'BOOL') finalValue = value === 'OK' ? 1 : (value === 'RET' ? 0 : '');
        if (existingIdx >= 0) details[existingIdx].value = finalValue; else details.push({ criterionId: critId, type, value: finalValue });
        newGrid[colIndex].details = details; setGridState(newGrid);
    };

    const handleSaveBigForm = async () => {
        if (!selectedJob) return;
        setSavingForm(true);
        try {
            for (let pIdx = 0; pIdx < measurePages.length; pIdx++) {
                const pageGrid = measurePages[pIdx];
                const lotNo = pageLotNumbers[pIdx] || '';
                for (let i = 0; i < 12; i++) {
                    const colData = pageGrid[i];
                    const hasData = colData.operator?.trim().length > 0 || colData.timeStr?.trim() !== '' || colData.details?.some(d => d.value !== '') || lotNo.trim() !== '';
                    if (hasData) {
                        const docData = { 
                            jobId: selectedJob.id, 
                            pageIndex: pIdx,
                            columnIndex: i, 
                            operator: colData.operator || '', 
                            timeStr: colData.timeStr || '',
                            lotNumber: lotNo,
                            details: colData.details || [], 
                            timestamp: colData.timestamp || Date.now() + (pIdx * 20) + i 
                        };
                        if (colData.id) await updateDoc(doc(db, CNC_MEASUREMENTS_COLLECTION, colData.id), docData); 
                        else {
                            const newDoc = await addDoc(collection(db, CNC_MEASUREMENTS_COLLECTION), docData);
                            colData.id = newDoc.id;
                        }
                    }
                }
            }
            setIsMeasureModalOpen(false);
            const jobPart = parts.find(p => p.id === selectedJob.partId) || parts.find(p => p.partName === selectedJob.partName);
            if (jobPart && jobPart.isSpcEnabled) {
                alert("Kontrol Formu kaydedildi. SPC zorunlu parça olduğu için SPC Formuna yönlendiriliyorsunuz...");
                handleOpenSpcModal(selectedJob);
            } else { alert("Başarıyla kaydedildi!"); }
        } catch (error) { alert("Hata oluştu."); } finally { setSavingForm(false); }
    };

    // --- 2. YENİ A4 SPC RAPORLAMA ---
    const fetchSpcDataForCriterion = async (job, criterionId, partData) => {
        if (!job || !criterionId) return;
        try {
            const mQuery = query(collection(db, CNC_SPC_MEASUREMENTS_COLLECTION), where('jobId', '==', job.id), where('criterionId', '==', criterionId));
            const mSnap = await getDocs(mQuery);
            const measurements = mSnap.docs.map(d => ({ id: d.id, ...d.data() }));

            const nSize = parseInt(partData.sampleQuantity) || 5;
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
        } catch (error) { console.error("SPC Fetch Hatası", error); }
    };

    const handleOpenSpcModal = async (job) => {
        setSelectedJob(job);
        let partIdToFetch = job.partId;
        if (!partIdToFetch) {
            const foundPart = parts.find(p => p.partName === job.partName);
            if (foundPart) partIdToFetch = foundPart.id; else return alert("Parça bulunamadı.");
        }
        try {
            const partRef = doc(db, CNC_PARTS_COLLECTION, partIdToFetch);
            const partSnap = await getDoc(partRef);
            let partData = {};
            if (partSnap.exists() && partSnap.data().criteria) {
                partData = partSnap.data();
                setActiveCriteria(partData.criteria);
                const firstNumCrit = partData.criteria.find(c => c.type !== 'BOOL');
                if (firstNumCrit) {
                    setSelectedSpcCriterionId(firstNumCrit.id.toString());
                    await fetchSpcDataForCriterion(job, firstNumCrit.id.toString(), partData);
                }
            } else return alert("Kriter tanımlanmamış.");
            setIsSpcModalOpen(true);
        } catch (error) { alert("Hata oluştu."); }
    };

    useEffect(() => {
        if (selectedJob && selectedSpcCriterionId && isSpcModalOpen) {
            const partData = parts.find(p => p.id === selectedJob.partId);
            if (partData) fetchSpcDataForCriterion(selectedJob, selectedSpcCriterionId, partData);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedSpcCriterionId]);

    const addSpcColumns = () => {
        const jobPart = parts.find(p => p.id === selectedJob.partId);
        const nSize = parseInt(jobPart?.sampleQuantity) || 5;
        setSpcGridData(prev => [ ...prev, ...Array(MAX_A4_COLUMNS).fill(null).map((_, i) => ({ id: null, columnIndex: prev.length + i, operator: '', timeStr: '', values: Array(nSize).fill('') })) ]);
    };

    const handleSpcGridChange = (colIndex, field, value, rowIdx = null) => {
        const newGrid = [...spcGridData];
        if (rowIdx !== null) newGrid[colIndex].values[rowIdx] = value; else newGrid[colIndex][field] = value;
        setSpcGridData(newGrid);
    };

    const handleSaveSpcForm = async () => {
        if (!selectedJob || !selectedSpcCriterionId) return;
        setSavingForm(true);
        try {
            for (let i = 0; i < spcGridData.length; i++) {
                const colData = spcGridData[i];
                const hasData = colData.operator?.trim() !== '' || colData.timeStr?.trim() !== '' || colData.values.some(v => v !== '');
                if (hasData) {
                    const docData = { jobId: selectedJob.id, criterionId: selectedSpcCriterionId, columnIndex: colData.columnIndex, operator: colData.operator || '', timeStr: colData.timeStr || '', values: colData.values, timestamp: Date.now() + i };
                    if (colData.id) await updateDoc(doc(db, CNC_SPC_MEASUREMENTS_COLLECTION, colData.id), docData);
                    else { const newDoc = await addDoc(collection(db, CNC_SPC_MEASUREMENTS_COLLECTION), docData); spcGridData[i].id = newDoc.id; }
                }
            }
            alert("SPC Ölçümleri kaydedildi!");
        } catch (error) { alert("Hata oluştu."); } finally { setSavingForm(false); }
    };

    // SAYFALARA BÖLME MANTIĞI (Her 25 ölçüm 1 A4 sayfası)
    const spcPagesAnalysis = useMemo(() => {
        if (!selectedJob || !selectedSpcCriterionId || spcGridData.length === 0) return [];
        const jobPart = parts.find(p => p.id === selectedJob.partId);
        if (!jobPart) return [];
        const crit = jobPart.criteria.find(c => c.id.toString() === selectedSpcCriterionId);
        if (!crit) return [];

        const nSize = parseInt(jobPart.sampleQuantity) || 5;
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
                jobPart
            };
        });
    }, [spcGridData, selectedJob, selectedSpcCriterionId, parts]);

    const handleDownloadPdf = () => {
        const element = reportRef.current;
        if (!element) return;
        const opt = {
            margin: 0, 
            filename: `SPC_Raporu_${selectedJob?.orderNumber || 'Rapor'}.pdf`,
            image: { type: 'jpeg', quality: 1 },
            html2canvas: { scale: 2, useCORS: true, windowWidth: element.scrollWidth, windowHeight: element.scrollHeight }, 
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape', compress: true },
            pagebreak: { mode: 'avoid-all' } 
        };
        html2pdf().set(opt).from(element).save();
    };

    const calculateDuration = (startTime) => {
        const diffMs = new Date() - new Date(startTime);
        return `${Math.floor(diffMs / 3600000)}s ${Math.floor((diffMs % 3600000) / 60000)}dk`;
    };

    const tableHeaders = [
        { title: "SERİ BAŞ.\nONAYI", bg: "bg-yellow-50 dark:bg-yellow-900/20", index: 0, width: "w-16" },
        ...Array.from({ length: 10 }).map((_, i) => ({ title: `${i + 1}.\nKONTROL`, bg: "bg-white dark:bg-gray-800", index: i + 1, width: "w-14" })),
        { title: "SERİ SONU\nKONTROL", bg: "bg-green-50 dark:bg-green-900/20", index: 11, width: "w-16" }
    ];

    return (
        <div className="p-4 sm:p-8 min-h-screen bg-gray-100 dark:bg-gray-900 font-sans text-sm">
            <div className="mb-8 flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-extrabold text-gray-900 dark:text-white flex items-center"><Monitor className="w-8 h-8 mr-3 text-orange-600" /> CNC Torna Takip Ekranı</h1>
                </div>
                <div className="text-right">
                    <span className="text-sm font-bold text-gray-500 dark:text-gray-400 block">Operatör</span>
                    <span className="text-lg font-bold text-gray-900 dark:text-white">{loggedInUser.name}</span>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {CNC_LATHE_MACHINES.map(machine => {
                    const activeJob = activeJobs.find(job => job.machine === machine);
                    const jobPart = parts.find(p => p.id === activeJob?.partId);
                    const isSpcEnabled = jobPart?.isSpcEnabled || false;

                    return (
                        <div key={machine} className={`relative rounded-2xl border-2 overflow-hidden shadow-lg transition-all flex flex-col ${activeJob ? 'bg-white dark:bg-gray-800 border-yellow-400 dark:border-yellow-600' : 'bg-white dark:bg-gray-800 border-green-500 dark:border-green-600'}`}>
                            <div className={`p-3 text-center font-bold text-white uppercase tracking-wider text-sm ${activeJob ? 'bg-yellow-500 animate-pulse' : 'bg-green-600'}`}>{activeJob ? '⚡ ÇALIŞIYOR' : '✓ BOŞTA / HAZIR'}</div>
                            <div className="p-6 flex flex-col h-auto min-h-[300px] justify-between">
                                <div className="text-center border-b border-gray-100 dark:border-gray-700 pb-4 mb-4 relative">
                                    <h2 className="text-4xl font-black text-gray-800 dark:text-white">{machine}</h2>
                                    <div className="flex items-center justify-center gap-1.5 mt-1.5 flex-wrap">
                                        <span className="text-xs text-gray-400">CNC TORNA</span>
                                        {getDueTasksForMachine(machine).length > 0 ? (
                                            <button 
                                                onClick={() => {
                                                    setMaintenanceMachineName(machine);
                                                    setCheckedMaintenanceTasks({});
                                                    setIsMaintenanceModalOpen(true);
                                                }}
                                                className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-400 border border-red-200 dark:border-red-900 flex items-center gap-1 transition active:scale-95"
                                            >
                                                <Wrench className="w-2.5 h-2.5 animate-pulse" /> Bakım Bekliyor
                                            </button>
                                        ) : (
                                            <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-250 dark:border-emerald-900 flex items-center gap-1">
                                                ✓ Bakım OK
                                            </span>
                                        )}
                                    </div>
                                    {activeJob && <button onClick={() => handleOpenEditJobModal(activeJob)} className="absolute top-0 right-0 p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-full transition"><Edit2 className="w-4 h-4" /></button>}
                                </div>
                                {activeJob ? (
                                    <>
                                        <div className="space-y-4 flex-1">
                                            <div>
                                                <span className="text-xs font-bold text-gray-400 uppercase">İŞ EMRİ / PARÇA</span>
                                                <div className="font-mono font-bold text-xl text-gray-900 dark:text-white">{activeJob.orderNumber || '---'}</div>
                                                <div className="text-sm font-bold text-gray-600 dark:text-gray-300 truncate" title={jobPart?.orderNumber || activeJob.partName}>
                                                    {jobPart?.orderNumber || activeJob.partName || '---'}
                                                </div>
                                                {jobPart?.orderNumber && (
                                                    <div className="text-[10px] text-gray-500 dark:text-gray-400 font-bold truncate mt-0.5" title={activeJob.partName}>
                                                        {activeJob.partName}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex justify-between bg-gray-50 dark:bg-gray-700/50 p-3 rounded-lg">
                                                <div><span className="text-[10px] text-gray-400 block uppercase">HEDEF</span><span className="font-bold text-gray-700 dark:text-gray-200">{activeJob.targetQuantity} Adet</span></div>
                                                <div className="text-right"><span className="text-[10px] text-gray-400 block uppercase">SÜRE</span><span className="font-bold text-yellow-600 flex items-center"><Clock className="w-3 h-3 mr-1"/>{calculateDuration(activeJob.startTime)}</span></div>
                                            </div>
                                            <div className="flex flex-col gap-2">
                                                <button onClick={() => handleOpenMeasureModal(activeJob)} className="w-full py-3 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-700 rounded-lg font-bold flex items-center justify-center hover:bg-blue-200 transition shadow-sm"><FileText className="w-5 h-5 mr-2" /> ÖLÇÜM FORMU</button>
                                                {isSpcEnabled && <button onClick={() => handleOpenSpcModal(activeJob)} className="w-full py-3 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-700 rounded-lg font-bold flex items-center justify-center hover:bg-purple-200 transition shadow-sm"><BarChart2 className="w-5 h-5 mr-2" /> SPC GİRİŞİ (A4)</button>}
                                            </div>
                                            <div className="text-xs text-center text-gray-400 pt-1">Op: <span className="text-gray-600 dark:text-gray-300 font-bold">{activeJob.operator}</span></div>
                                        </div>
                                        <button onClick={() => handleOpenFinishModal(activeJob)} className="mt-4 w-full py-4 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg shadow-md flex items-center justify-center transition active:scale-95"><StopCircle className="w-6 h-6 mr-2" /> İŞİ BİTİR</button>
                                    </>
                                ) : (
                                    <div className="flex flex-col items-center justify-center h-full text-gray-400 py-4"><PlayCircle className="w-20 h-20 mb-4 text-green-200 dark:text-gray-700" /><p className="text-sm mb-6 font-medium">Tezgah şu an boşta.</p><button onClick={() => handleOpenStartModalIntercept(machine)} className="w-full py-4 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg shadow-md flex items-center justify-center transition active:scale-95"><PlayCircle className="w-6 h-6 mr-2" /> YENİ İŞ BAŞLAT</button></div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* --- 1. STANDART KONTROL FORMU (12 SÜTUNLU) SAAT EKLENMİŞ HALİ --- */}
            <SimpleModal isOpen={isMeasureModalOpen} onClose={() => setIsMeasureModalOpen(false)} title="Talaşlı İmalat Kontrol Formu" maxWidth="max-w-[98vw] 2xl:max-w-[1560px]">
                <div className="bg-white dark:bg-gray-800 rounded-xl p-4 md:p-6 shadow-sm border border-gray-200 dark:border-gray-700">
                    
                    {/* ÜST BİLGİ ALANI VE ONALAYAN */}
                    <div className="flex justify-between items-end mb-4 border-b border-gray-200 dark:border-gray-700 pb-4">
                        <div>
                            <div className="text-2xl font-black text-gray-850 dark:text-white">{selectedJob?.partName}</div>
                            <div className="text-sm text-gray-500 font-bold mt-1">İş Emri: {selectedJob?.orderNumber || 'Yok'}</div>
                        </div>
                        <div className="text-right">
                            <button onClick={handleSaveBigForm} disabled={savingForm} className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-lg flex items-center transition transform active:scale-95 disabled:opacity-50">
                                <Save className="w-5 h-5 mr-2" /> {savingForm ? 'KAYDEDİLİYOR...' : 'FORMA İŞLE'}
                            </button>
                        </div>
                    </div>

                    {/* VARDİYA / SAYFA SEÇİCİ & LOT NUMARASI GİRİŞİ */}
                    <div className="flex flex-wrap items-center justify-between gap-4 mb-6 bg-gray-50 dark:bg-gray-900/50 p-4 rounded-xl border border-gray-250 dark:border-gray-700">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-black uppercase text-gray-400 dark:text-gray-500 mr-2 tracking-wider">Sayfalar (Vardiyalar):</span>
                            {measurePages.map((_, pIdx) => (
                                <button
                                    key={pIdx}
                                    type="button"
                                    onClick={() => setActiveMeasurePageIdx(pIdx)}
                                    className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${
                                        activeMeasurePageIdx === pIdx
                                            ? 'bg-blue-600 text-white shadow-md'
                                            : 'bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600'
                                    }`}
                                >
                                    Sayfa {pIdx + 1}
                                </button>
                            ))}
                            <button
                                type="button"
                                onClick={handleAddMeasurePage}
                                className="px-3 py-2 text-xs font-black bg-green-50 hover:bg-green-100 text-green-700 dark:bg-green-950/20 dark:hover:bg-green-950/40 dark:text-green-400 rounded-lg flex items-center transition border border-green-200 dark:border-green-800"
                            >
                                <Plus className="w-3.5 h-3.5 mr-1" /> YENİ SAYFA EKLE
                            </button>
                        </div>

                        <div className="flex items-center gap-3">
                            <label className="text-xs font-black text-gray-600 dark:text-gray-300 uppercase shrink-0 tracking-wider">Ham Malzeme Lot No:</label>
                            <input
                                type="text"
                                placeholder="LOT NUMARASI GİRİNİZ"
                                value={pageLotNumbers[activeMeasurePageIdx] || ''}
                                onChange={(e) => {
                                    const newLotNumbers = [...pageLotNumbers];
                                    newLotNumbers[activeMeasurePageIdx] = e.target.value;
                                    setPageLotNumbers(newLotNumbers);
                                }}
                                className="px-3 py-2 border rounded-lg bg-white dark:bg-gray-900 text-gray-850 dark:text-white font-bold text-xs outline-none border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 w-64 uppercase tracking-wider"
                            />
                        </div>
                    </div>

                    <div className="overflow-x-auto pb-4 custom-scrollbar">
                        <table className="w-full border-collapse border border-gray-300 dark:border-gray-600 text-center text-sm">
                            <thead>
                                <tr className="bg-gray-100 dark:bg-gray-800">
                                    <th className="border border-gray-300 dark:border-gray-600 p-3 w-12 text-gray-700 dark:text-gray-300 font-extrabold bg-gray-100 dark:bg-gray-900">NO</th>
                                    <th className="border border-gray-300 dark:border-gray-600 p-3 text-left text-gray-700 dark:text-gray-300 font-extrabold bg-gray-100 dark:bg-gray-900">KONTROL KRİTERİ (Nominal / Tol)</th>
                                    
                                    {tableHeaders.map((col) => (
                                        <th key={col.index} className={`border border-gray-300 dark:border-gray-600 p-2 align-top ${col.width} ${col.bg}`}>
                                            <div className="font-extrabold border-b border-gray-350 dark:border-gray-500 pb-1 mb-1 text-[11px] whitespace-pre-line text-gray-800 dark:text-gray-200">
                                                {col.title}
                                            </div>
                                            {/* SAAT INPUTU */}
                                            <input 
                                                type="text" 
                                                placeholder="SAAT"
                                                className="text-xs font-black text-gray-700 dark:text-gray-300 bg-transparent border-b border-gray-350 dark:border-gray-500 w-full text-center outline-none focus:bg-yellow-100 dark:focus:bg-gray-600 placeholder-gray-400 pb-1 mb-1 font-mono"
                                                value={gridData[col.index]?.timeStr ?? ''}
                                                onChange={(e) => {
                                                    const newGrid = [...gridData];
                                                    if (newGrid[col.index]) {
                                                        newGrid[col.index].timeStr = e.target.value;
                                                        setGridData(newGrid);
                                                    }
                                                }}
                                            />
                                            {/* OPERATÖR ADI */}
                                            <input 
                                                type="text" 
                                                placeholder="OPR."
                                                className="text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase bg-transparent border-none w-full text-center outline-none focus:bg-yellow-100 dark:focus:bg-gray-600 placeholder-gray-400"
                                                value={gridData[col.index]?.operator ?? ''}
                                                onChange={(e) => {
                                                    const newGrid = [...gridData];
                                                    if (newGrid[col.index]) {
                                                        newGrid[col.index].operator = e.target.value;
                                                        setGridData(newGrid);
                                                    }
                                                }}
                                            />
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {activeCriteria.map((crit, idx) => (
                                    <tr key={crit.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                                        <td className="border border-gray-300 dark:border-gray-600 p-3 font-extrabold text-gray-600 dark:text-gray-400">{idx + 1}</td>
                                        <td className="border border-gray-300 dark:border-gray-600 p-3 text-left px-4">
                                            <span className="font-bold text-base text-gray-800 dark:text-white block leading-tight">{crit.name}</span>
                                            {crit.type !== 'BOOL' && <span className="text-xs text-gray-500 dark:text-gray-400">{crit.nominal} (+{crit.upperTol}/-{Math.abs(crit.lowerTol)})</span>}
                                        </td>
                                        
                                        {tableHeaders.map((col) => {
                                            const detail = gridData[col.index]?.details?.find(d => d.criterionId === crit.id);
                                            let rawVal = detail?.value;
                                            if (rawVal === null || rawVal === undefined) rawVal = '';
 
                                            let displayVal = rawVal;
                                            let textClass = 'text-gray-900 dark:text-white font-mono';
 
                                            if (rawVal !== '') {
                                                if (crit.type === 'BOOL') {
                                                    displayVal = rawVal === 1 ? 'OK' : (rawVal === 0 ? 'RET' : '');
                                                    textClass = displayVal === 'OK' ? 'text-green-600 dark:text-green-400 font-black' : 'text-red-600 dark:text-red-400 font-black';
                                                } else {
                                                    const numVal = parseFloat(rawVal.toString().replace(',', '.'));
                                                    const nom = parseFloat(crit.nominal);
                                                    const upper = parseFloat(crit.upperTol);
                                                    const lower = parseFloat(crit.lowerTol);
                                                    if (!isNaN(numVal) && !isNaN(nom)) {
                                                        if (numVal > (nom + upper) || numVal < (nom - Math.abs(lower))) {
                                                            textClass += ' text-red-500 font-extrabold';
                                                        } else {
                                                            textClass += ' font-bold';
                                                        }
                                                    }
                                                }
                                            }
 
                                            return (
                                                <td key={col.index} className={`border border-gray-300 dark:border-gray-600 p-0 h-12 align-middle ${col.bg}`}>
                                                    {crit.type === 'BOOL' ? (
                                                        <select className={`w-full h-full bg-transparent border-none text-center outline-none cursor-pointer text-sm font-bold ${textClass}`} value={displayVal ?? ''} onChange={(e) => handleCellChange(col.index, crit.id, e.target.value, 'BOOL', gridData, setGridData)}>
                                                            <option value=""></option><option value="OK">OK</option><option value="RET">RET</option>
                                                        </select>
                                                    ) : (
                                                        <input type="text" className={`w-full h-full bg-transparent border-none text-center outline-none focus:bg-yellow-100 dark:focus:bg-gray-600 text-sm md:text-base ${textClass}`} value={displayVal ?? ''} onChange={(e) => handleCellChange(col.index, crit.id, e.target.value, 'NUMBER', gridData, setGridData)} />
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

            {/* --- 2. SPC A4 MODALI --- */}
            <SimpleModal isOpen={isSpcModalOpen} onClose={() => setIsSpcModalOpen(false)} title="İstatistiki Proses Kontrol (SPC) Formu" maxWidth="max-w-[98vw] lg:max-w-[1200px]" fullHeight={true}>
                
                <div className="flex flex-wrap justify-between items-center bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 mb-6 gap-4">
                    <div className="flex items-center gap-3">
                        <label className="font-bold text-gray-600 dark:text-gray-300 uppercase text-xs">Kriter Seçiniz:</label>
                        <select className="p-2 border rounded bg-gray-50 dark:bg-gray-700 dark:text-white font-bold outline-none border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-purple-500" value={selectedSpcCriterionId} onChange={(e) => setSelectedSpcCriterionId(e.target.value)}>
                            {parts.find(p => p.id === selectedJob?.partId)?.criteria.filter(c => c.type !== 'BOOL').map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={addSpcColumns} className="px-5 py-2.5 bg-indigo-100 text-indigo-700 font-bold rounded-lg flex items-center hover:bg-indigo-200 transition text-xs shadow-sm">
                            <Plus className="w-4 h-4 mr-2"/> YENİ SAYFA EKLE
                        </button>
                        <button onClick={handleSaveSpcForm} disabled={savingForm} className="px-5 py-2.5 bg-purple-600 text-white font-bold rounded-lg shadow hover:bg-purple-700 flex items-center transition text-xs">
                            <Save className="w-4 h-4 mr-2"/> {savingForm ? 'KAYDEDİLİYOR...' : 'TÜMÜNÜ KAYDET'}
                        </button>
                        <button onClick={handleDownloadPdf} className="px-5 py-2.5 bg-green-600 text-white font-bold rounded-lg shadow hover:bg-green-700 flex items-center transition text-xs">
                            <Download className="w-4 h-4 mr-2"/> PDF İNDİR (A4)
                        </button>
                    </div>
                </div>

                <div className="flex flex-col gap-8 pb-10">
                    <div ref={reportRef}>
                        {spcPagesAnalysis.map((pageData, pageIdx) => (
                            <div key={pageIdx} className="bg-white text-black box-border flex flex-col relative shadow-xl mx-auto rounded-lg overflow-hidden shrink-0" style={{ width: '297mm', minHeight: '210mm', padding: '8mm', pageBreakAfter: pageIdx < spcPagesAnalysis.length - 1 ? 'always' : 'auto' }}>
                                
                                {/* ANTET */}
                                <div className="grid grid-cols-12 border-2 border-black mb-1 shrink-0 bg-white h-[18mm]">
                                    <div className="col-span-3 border-r-2 border-black flex items-center justify-center p-1"><img src="/logo512.png" alt="Logo" className="h-10 object-contain" /></div>
                                    <div className="col-span-6 border-r-2 border-black flex flex-col items-center justify-center text-center"><h1 className="text-xl font-black uppercase tracking-wider">NİCELİK KONTROL KARTI (X-R)</h1></div>
                                    <div className="col-span-3 text-[9px] grid grid-cols-1 divide-y border-black">
                                        <div className="flex justify-between px-2 py-0.5"><span className="font-bold">Sayfa No:</span><span>{pageIdx + 1} / {spcPagesAnalysis.length}</span></div>
                                        <div className="flex justify-between px-2 py-0.5"><span className="font-bold">Çalışma Tarihi:</span><span>{new Date().toLocaleDateString('tr-TR')}</span></div>
                                        <div className="flex justify-between px-2 py-0.5"><span className="font-bold">Doküman No:</span><span>FR 09-715-00</span></div>
                                    </div>
                                </div>

                                {/* BİLGİLER */}
                                <div className="border-2 border-t-0 border-black mb-1.5 flex text-[9px] shrink-0 bg-white divide-x border-black h-[14mm]">
                                    <div className="flex-1 flex flex-col divide-y border-black">
                                        <div className="flex px-1 items-center flex-1"><span className="font-bold w-16">Parça Adı:</span><span className="truncate">{pageData.jobPart.partName}</span></div>
                                        <div className="flex px-1 items-center flex-1"><span className="font-bold w-16">Müşteri:</span><span className="uppercase">{pageData.jobPart.targetCustomer || 'STANDART'}</span></div>
                                    </div>
                                    <div className="flex-1 flex flex-col divide-y border-black">
                                        <div className="flex px-1 items-center flex-1"><span className="font-bold w-20">Operasyon:</span><span className="truncate">{selectedJob?.machine}</span></div>
                                        <div className="flex px-1 items-center flex-1"><span className="font-bold w-20">İş Emri No:</span><span className="font-bold text-lg text-purple-800">{selectedJob?.orderNumber}</span></div>
                                    </div>
                                    <div className="flex-1 flex flex-col divide-y border-black bg-gray-50">
                                        <div className="flex px-1 items-center flex-1"><span className="font-bold w-16">Karakteristik:</span><span className="font-bold text-blue-700 truncate">{pageData.critName}</span></div>
                                        <div className="flex px-1 items-center flex-1"><span className="font-bold w-16">Nom/Tol:</span><span className="font-black text-[10px]">{pageData.nominal}</span> <span className="font-bold text-green-700 ml-1"> (+{pageData.USL - pageData.nominal} / -{pageData.nominal - pageData.LSL})</span></div>
                                    </div>
                                    <div className="flex-1 flex flex-col divide-y border-black">
                                        <div className="flex px-1 items-center flex-1"><span className="font-bold w-16">Ölç. Sayısı:</span><span>n = {pageData.nSize}</span></div>
                                        <div className="flex px-1 items-center flex-1"><span className="font-bold w-16">Frekans:</span><span>{pageData.jobPart.sampleFrequencyMinutes} dk</span></div>
                                    </div>
                                </div>

                                {/* EXCEL TABLOSU */}
                                <div className="border-2 border-black w-full flex flex-col text-[8.5px] shrink-0 mb-1.5 bg-white">
                                    <div className="flex border-b border-black text-center font-bold bg-gray-200 h-[14px] items-stretch">
                                        <div className="w-[50px] shrink-0 border-r border-black flex items-center justify-center">Örnek No</div>
                                        {pageData.pageCols.map((col, i) => <div key={i} className="flex-1 border-r border-black last:border-0 flex items-center justify-center">{col.columnIndex + 1}</div>)}
                                    </div>
                                    <div className="flex border-b border-black text-center h-[16px] items-stretch bg-gray-50">
                                        <div className="w-[50px] shrink-0 border-r border-black font-bold flex items-center justify-center">Saat</div>
                                        {pageData.pageCols.map((col, i) => (
                                            <div key={i} className="flex-1 border-r border-black last:border-0 h-full">
                                                <input type="text" className="w-full h-full text-center outline-none bg-transparent focus:bg-yellow-200 font-mono" value={col.timeStr ?? ''} onChange={(e) => handleSpcGridChange(col.columnIndex, 'timeStr', e.target.value)} />
                                            </div>
                                        ))}
                                    </div>
                                    <div className="flex text-center border-b border-black bg-gray-50 h-[16px] items-stretch">
                                        <div className="w-[50px] shrink-0 border-r border-black font-bold flex items-center justify-center">Opr.</div>
                                        {pageData.pageCols.map((col, i) => (
                                            <div key={i} className="flex-1 border-r border-black last:border-0 h-full">
                                                <input type="text" className="w-full h-full text-center outline-none bg-transparent uppercase font-bold focus:bg-yellow-200 text-[7px]" value={col.operator ?? ''} onChange={(e) => handleSpcGridChange(col.columnIndex, 'operator', e.target.value)} />
                                            </div>
                                        ))}
                                    </div>
                                    {Array.from({ length: pageData.nSize }).map((_, rIdx) => (
                                        <div key={`X${rIdx}`} className="flex border-b border-black text-center h-[16px] items-stretch bg-white">
                                            <div className="w-[50px] shrink-0 border-r border-black font-bold flex items-center justify-center bg-gray-100">X{rIdx + 1}</div>
                                            {pageData.pageCols.map((col, cIdx) => {
                                                let val = col.values[rIdx] ?? '';
                                                let isErr = false;
                                                if (val !== '') {
                                                    const nVal = parseInputFloat(val);
                                                    if (!isNaN(nVal) && (nVal > pageData.USL || nVal < pageData.LSL)) isErr = true;
                                                }
                                                return (
                                                    <div key={cIdx} className="flex-1 border-r border-black last:border-0 h-full">
                                                        <input type="text" className={`w-full h-full text-center outline-none focus:bg-yellow-200 font-mono ${isErr ? 'text-red-600 font-bold bg-red-50' : ''}`} value={val} onChange={(e) => handleSpcGridChange(col.columnIndex, 'values', e.target.value, rIdx)} />
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ))}
                                    <div className="flex border-b border-black text-center h-[16px] items-stretch bg-blue-50">
                                        <div className="w-[50px] shrink-0 border-r border-black font-bold flex items-center justify-center">X̄</div>
                                        {pageData.actualSubgroups.map((sg, i) => <div key={i} className="flex-1 border-r border-black last:border-0 flex items-center justify-center font-bold text-blue-900 font-mono">{sg.isComplete ? sg.mean.toFixed(3) : ''}</div>)}
                                    </div>
                                    <div className="flex text-center h-[16px] items-stretch bg-blue-50">
                                        <div className="w-[50px] shrink-0 border-r border-black font-bold flex items-center justify-center">R</div>
                                        {pageData.actualSubgroups.map((sg, i) => <div key={i} className="flex-1 border-r border-black last:border-0 flex items-center justify-center font-bold text-blue-900 font-mono">{sg.isComplete ? sg.range.toFixed(3) : ''}</div>)}
                                    </div>
                                </div>

                                {/* GRAFİKLER VE HESAPLAMALAR */}
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
                                    <div><div className="font-bold mb-3">Hazırlayan</div></div>
                                    <div><div className="font-bold mb-3">Kontrol Eden</div></div>
                                    <div><div className="font-bold mb-3">Onaylayan</div></div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </SimpleModal>

            {/* Diğer Modallar */}
            <SimpleModal isOpen={isStartModalOpen} onClose={() => setIsStartModalOpen(false)} title={`Yeni İş Başlat - ${selectedMachine}`} maxWidth="max-w-2xl">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-gray-900 dark:text-white">
                    <div className="border-r border-gray-250 dark:border-gray-700 pr-6">
                        <h4 className="text-sm font-black text-gray-700 dark:text-gray-300 mb-3 flex items-center"><Calendar className="w-4 h-4 mr-2"/> Planlanan İşler</h4>
                        <div className="space-y-2 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                            {getPlannedJobsForMachine(selectedMachine).length === 0 ? (
                                <p className="text-xs text-gray-400 font-bold">İş bulunmuyor.</p>
                            ) : getPlannedJobsForMachine(selectedMachine).map(job => (
                                <div key={job.id} onClick={() => handleSelectPlannedJob(job)} className="p-3 border border-gray-300 dark:border-gray-600 rounded-lg cursor-pointer hover:bg-gray-150 dark:hover:bg-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white transition shadow-sm">
                                    <div className="font-extrabold text-sm">{job.orderNumber || 'Resim No Belirtilmemiş'}</div>
                                    <div className="text-[10px] text-gray-500 dark:text-gray-400 font-bold mt-1">{job.partName}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-xs font-black text-gray-600 dark:text-gray-300 uppercase mb-1">İş Emri / Stok / Resim No</label>
                            <input 
                                type="text" 
                                className="w-full p-2.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-bold text-sm focus:ring-2 focus:ring-green-500 outline-none" 
                                value={startFormData.orderNumber} 
                                onChange={e => setStartFormData({...startFormData, orderNumber: e.target.value})} 
                            />
                        </div>
                        <div className="relative">
                            <label className="block text-xs font-black text-gray-600 dark:text-gray-300 uppercase mb-1">Parça Seçimi</label>
                            <input 
                                type="text" 
                                className="w-full p-2.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-bold text-sm focus:ring-2 focus:ring-green-500 outline-none" 
                                value={partSearchTerm} 
                                onChange={e => {setPartSearchTerm(e.target.value); setIsPartDropdownOpen(true);}} 
                                onFocus={()=>setIsPartDropdownOpen(true)} 
                                onBlur={() => setTimeout(() => setIsPartDropdownOpen(false), 200)}
                            />
                            {isPartDropdownOpen && (
                                <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg shadow-xl max-h-48 overflow-y-auto custom-scrollbar">
                                    {parts.filter(p => p.partName.toLowerCase().includes(partSearchTerm.toLowerCase()) || (p.orderNumber && p.orderNumber.toLowerCase().includes(partSearchTerm.toLowerCase()))).map(p => (
                                        <div 
                                            key={p.id} 
                                            className="p-2.5 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 border-b last:border-0 border-gray-150 dark:border-gray-750 text-gray-900 dark:text-white transition" 
                                            onMouseDown={()=>handleSelectPart(p)}
                                        >
                                            <div className="font-extrabold text-sm">{p.orderNumber || 'Resim No Belirtilmemiş'}</div>
                                            <div className="text-[10px] text-gray-500 dark:text-gray-400 font-bold">{p.partName}</div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div className="pt-2">
                            <button onClick={handleStartJob} className="w-full py-3 bg-green-600 hover:bg-green-700 text-white font-extrabold rounded-lg shadow-md transition active:scale-95">BAŞLAT</button>
                        </div>
                    </div>
                </div>
            </SimpleModal>
            
            {/* Edit Modal */}
            <SimpleModal isOpen={isEditJobModalOpen} onClose={() => setIsEditJobModalOpen(false)} title="İş Bilgilerini Düzenle">
                <div className="space-y-4">
                    <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded text-sm text-blue-800 dark:text-blue-200"><strong>Parça:</strong> {selectedJob?.partName}</div>
                    <div><label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">İş Emri Numarası</label><input type="text" className="w-full p-3 border rounded-lg bg-white dark:bg-gray-700 dark:text-white" value={editFormData.orderNumber} onChange={e => setEditFormData({...editFormData, orderNumber: e.target.value})} /></div>
                    <div><label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Hedeflenen Adet</label><input type="number" className="w-full p-3 border rounded-lg bg-white dark:bg-gray-700 dark:text-white" value={editFormData.targetQuantity} onChange={e => setEditFormData({...editFormData, targetQuantity: e.target.value})} /></div>
                    <button onClick={handleSaveJobEdit} className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-lg">GÜNCELLE</button>
                </div>
            </SimpleModal>

            {/* Finish Modal */}
            <SimpleModal isOpen={isFinishModalOpen} onClose={() => setIsFinishModalOpen(false)} title="İşi Sonlandır">
                <div className="space-y-4">
                    <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-lg border border-yellow-100 text-center"><div className="text-xl font-black text-gray-900">{selectedJob?.orderNumber || '---'}</div></div>
                    <div><label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Üretilen Toplam Adet</label><input type="number" className="w-full p-4 text-center text-2xl font-bold border-2 border-green-500 rounded-lg bg-white dark:bg-gray-700 dark:text-white" value={producedQuantity} onChange={e => setProducedQuantity(e.target.value)} /></div>
                    <button onClick={handleFinishJob} className="w-full py-3 mt-4 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg shadow-lg">KAYDET VE BİTİR</button>
                </div>
            </SimpleModal>

            {/* --- MODAL: TEZGAH PERİYODİK BAKIMI --- */}
            <SimpleModal 
                isOpen={isMaintenanceModalOpen} 
                onClose={() => setIsMaintenanceModalOpen(false)} 
                title={`Tezgah Periyodik Bakımı - ${maintenanceMachineName}`} 
                maxWidth="max-w-xl"
            >
                <div className="space-y-6 text-gray-900 dark:text-white">
                    <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-2xl flex items-start gap-3">
                        <Wrench className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
                        <div>
                            <h4 className="font-bold text-sm text-gray-800 dark:text-white">Güvenli Çalışma İçin Bakım Rutinleri</h4>
                            <p className="text-xs text-gray-400 mt-1">
                                Tezgahta işlem yapmaya başlamadan önce lütfen aşağıdaki bakım rutinlerini yerine getirin ve işaretleyin.
                            </p>
                        </div>
                    </div>

                    <div className="space-y-2 max-h-80 overflow-y-auto pr-1 custom-scrollbar">
                        {maintenanceMachineName && getDueTasksForMachine(maintenanceMachineName).map(task => {
                            const isChecked = !!checkedMaintenanceTasks[task.id];
                            const freqLabel = task.frequency === 'DAILY' ? 'Günlük' :
                                              task.frequency === 'WEEKLY' ? 'Haftalık' :
                                              task.frequency === 'BIWEEKLY' ? '2 Haftalık' :
                                              task.frequency === 'MONTHLY' ? 'Aylık' : 'Yıllık';
                            const freqColor = task.frequency === 'DAILY' ? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-250 dark:border-emerald-900' :
                                              task.frequency === 'WEEKLY' ? 'bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 border-blue-250 dark:border-blue-900' : 'bg-purple-100 dark:bg-purple-950/40 text-purple-700 dark:text-purple-400 border-purple-250 dark:border-purple-900';

                            return (
                                <button
                                    type="button"
                                    key={task.id}
                                    onClick={() => {
                                        setCheckedMaintenanceTasks(prev => ({
                                            ...prev,
                                            [task.id]: !prev[task.id]
                                        }));
                                    }}
                                    className={`w-full p-4 rounded-2xl border text-left flex items-start gap-4 transition-all duration-150 ${
                                        isChecked
                                            ? 'bg-blue-50 dark:bg-blue-950/20 border-blue-300 dark:border-blue-800 text-blue-700 dark:text-blue-300'
                                            : 'bg-gray-50 dark:bg-gray-900/40 border-gray-250 dark:border-gray-705 hover:bg-gray-100 dark:hover:bg-gray-900/60 text-gray-700 dark:text-gray-300'
                                    }`}
                                >
                                    <div className="pt-0.5">
                                        <input
                                            type="checkbox"
                                            checked={isChecked}
                                            readOnly
                                            className="rounded border-gray-350 dark:border-gray-600 text-blue-605 focus:ring-blue-500 w-5 h-5 cursor-pointer"
                                        />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-black border uppercase tracking-wider mb-1.5 ${freqColor}`}>
                                            {freqLabel}
                                        </span>
                                        <p className={`text-sm font-bold ${isChecked ? 'line-through text-gray-400 dark:text-gray-500' : 'text-gray-800 dark:text-gray-200'}`}>
                                            {task.name}
                                        </p>
                                    </div>
                                </button>
                            );
                        })}
                    </div>

                    <button
                        onClick={async () => {
                            const dueTasks = getDueTasksForMachine(maintenanceMachineName);
                            const allChecked = dueTasks.every(t => checkedMaintenanceTasks[t.id]);
                            if (!allChecked) return;

                            const logId = `mlog-${Date.now()}`;
                            const logData = {
                                id: logId,
                                machineId: maintenanceMachineName,
                                machineName: `${maintenanceMachineName} (CNC TORNA)`,
                                operatorName: loggedInUser?.name || 'Operatör',
                                date: new Date().toISOString().substring(0, 10),
                                timestamp: new Date().toISOString(),
                                completedTasks: dueTasks.map(t => ({
                                    taskId: t.id,
                                    taskName: t.name,
                                    frequency: t.frequency
                                }))
                            };

                            try {
                                setSavingForm(true);
                                await setDoc(doc(db, MACHINE_MAINTENANCE_LOGS_COLLECTION, logId), logData);
                                setSavingForm(false);
                                setIsMaintenanceModalOpen(false);
                                alert("Tezgah bakımı başarıyla onaylandı ve kaydedildi. İyi çalışmalar!");
                                handleOpenStartModal(maintenanceMachineName);
                            } catch (e) {
                                console.error(e);
                                setSavingForm(false);
                                alert("Bakım kaydı yüklenirken bir hata oluştu.");
                            }
                        }}
                        disabled={!maintenanceMachineName || !getDueTasksForMachine(maintenanceMachineName).every(t => checkedMaintenanceTasks[t.id])}
                        className={`w-full py-4 rounded-2xl font-bold text-lg transition-all shadow-lg flex items-center justify-center gap-2 transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${
                            maintenanceMachineName && getDueTasksForMachine(maintenanceMachineName).every(t => checkedMaintenanceTasks[t.id])
                                ? 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer shadow-md'
                                : 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 border border-gray-200 dark:border-gray-600'
                        }`}
                    >
                        <CheckCircle className="w-5 h-5" /> BAKIMI ONAYLA VE DEVAM ET
                    </button>
                </div>
            </SimpleModal>

        </div>
    );
};

export default CncLatheDashboard;