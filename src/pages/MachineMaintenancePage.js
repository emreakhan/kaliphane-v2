import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
    Plus, Trash2, Edit2, Settings, ClipboardList, Calendar, 
    CheckCircle, AlertTriangle, Monitor, Search, ChevronRight, Printer 
} from 'lucide-react';
import { 
    db, collection, onSnapshot, doc, setDoc, deleteDoc 
} from '../config/firebase.js';
import { 
    MACHINES_COLLECTION,
    MACHINE_MAINTENANCE_TASKS_COLLECTION, 
    MACHINE_MAINTENANCE_LOGS_COLLECTION,
    PERSONNEL_COLLECTION
} from '../config/constants.js';
import Modal from '../components/Modals/Modal.js';
import html2pdf from 'html2pdf.js';

const FREQUENCIES = {
    DAILY: { label: 'Günlük', value: 'DAILY', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800' },
    WEEKLY: { label: 'Haftalık', value: 'WEEKLY', color: 'bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300 border-blue-200 dark:border-blue-800' },
    BIWEEKLY: { label: '2 Haftalık', value: 'BIWEEKLY', color: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800' },
    MONTHLY: { label: 'Aylık', value: 'MONTHLY', color: 'bg-purple-100 text-purple-800 dark:bg-purple-950/40 dark:text-purple-300 border-purple-200 dark:border-purple-800' },
    YEARLY: { label: 'Yıllık', value: 'YEARLY', color: 'bg-pink-100 text-pink-800 dark:bg-pink-950/40 dark:text-pink-300 border-pink-200 dark:border-pink-800' }
};

// Reusable dynamic ETKA periyodik koruyucu bakım raporu bileşeni
const EtkaReportContent = ({ selectedMachine, selectedMonth, printedLogs, tasks }) => {
    const mName = selectedMachine ? selectedMachine.name : '';
    const mType = selectedMachine ? (selectedMachine.ekBilgi || '') : '';
    
    const { daysList } = useMemo(() => {
        if (!selectedMonth) return { daysList: [] };
        const [yearStr, mStr] = selectedMonth.split('-');
        const y = parseInt(yearStr, 10);
        const numDays = new Date(y, parseInt(mStr, 10), 0).getDate();
        
        const list = [];
        for (let i = 1; i <= numDays; i++) {
            const dayStr = String(i).padStart(2, '0');
            const dateKey = `${yearStr}-${mStr}-${dayStr}`;
            list.push({
                dayNum: i,
                dateStr: dateKey,
                displayDate: `${dayStr}.${mStr}.${y}`
            });
        }
        return { daysList: list };
    }, [selectedMonth]);

    const printMachineId = selectedMachine ? selectedMachine.id : '';

    // Filter tasks for this machine
    const machineTasksForSelected = useMemo(() => {
        return tasks.filter(t => 
            t.machineIds?.includes('all') || 
            t.machineIds?.includes(printMachineId)
        );
    }, [tasks, printMachineId]);

    const dailyTasks = useMemo(() => machineTasksForSelected.filter(t => t.frequency === 'DAILY'), [machineTasksForSelected]);
    const weeklyTasks = useMemo(() => machineTasksForSelected.filter(t => t.frequency === 'WEEKLY'), [machineTasksForSelected]);
    const biweeklyTasks = useMemo(() => machineTasksForSelected.filter(t => t.frequency === 'BIWEEKLY' || t.frequency === 'TWO_WEEKS'), [machineTasksForSelected]);
    const monthlyTasks = useMemo(() => machineTasksForSelected.filter(t => t.frequency === 'MONTHLY'), [machineTasksForSelected]);

    // Filter printedLogs by frequency completed
    const getLogsOnDate = (dateStr) => printedLogs.filter(l => l.date === dateStr);

    const biweeklyLogs = useMemo(() => {
        return printedLogs.filter(l => 
            (l.completedTasks || []).some(t => t.frequency === 'BIWEEKLY' || t.frequency === 'TWO_WEEKS')
        );
    }, [printedLogs]);

    const weeklyLogs = useMemo(() => {
        return printedLogs.filter(l => 
            (l.completedTasks || []).some(t => t.frequency === 'WEEKLY')
        );
    }, [printedLogs]);

    const monthlyLogs = useMemo(() => {
        return printedLogs.filter(l => 
            (l.completedTasks || []).some(t => t.frequency === 'MONTHLY')
        );
    }, [printedLogs]);

    // Helpers to render headers & cells dynamically
    const renderTaskHeaders = (freqTasks, defaultName) => {
        if (freqTasks.length === 0) {
            return <th colSpan="2" className="text-center font-extrabold italic text-gray-400">{defaultName}</th>;
        }
        return freqTasks.map(t => (
            <th key={t.id} colSpan="2" className="text-center font-black whitespace-normal break-words leading-tight px-1 py-1" style={{ wordBreak: 'break-word', whiteSpace: 'normal', height: 'auto !important' }} title={t.name}>{t.name}</th>
        ));
    };

    const renderSubHeaders = (freqTasks) => {
        if (freqTasks.length === 0) {
            return (
                <>
                    <th className="text-[6.5px] font-bold py-0.5">Uygun</th>
                    <th className="text-[6.5px] font-bold py-0.5">Değil</th>
                </>
            );
        }
        return freqTasks.map(t => (
            <React.Fragment key={t.id}>
                <th className="text-[6.5px] font-bold py-0.5">Uygun</th>
                <th className="text-[6.5px] font-bold py-0.5">Değil</th>
            </React.Fragment>
        ));
    };

    const renderTaskCells = (freqTasks, completedTasksArray, hasLog) => {
        if (freqTasks.length === 0) {
            return (
                <>
                    <td></td>
                    <td></td>
                </>
            );
        }
        return freqTasks.map(task => {
            const isCompleted = hasLog && completedTasksArray.some(ct => ct.taskId === task.id);
            return (
                <React.Fragment key={task.id}>
                    <td>{isCompleted ? '✓' : ''}</td>
                    <td></td>
                </React.Fragment>
            );
        });
    };

    // Calculate colSpan for headers
    const dailyColSpan = 4 + (dailyTasks.length === 0 ? 1 : dailyTasks.length) * 2;
    const biweeklyColSpan = 4 + (biweeklyTasks.length === 0 ? 1 : biweeklyTasks.length) * 2;
    const monthlyColSpan = 4 + (monthlyTasks.length === 0 ? 1 : monthlyTasks.length) * 2;
    const weeklyColSpan = 4 + (weeklyTasks.length === 0 ? 1 : weeklyTasks.length) * 2;

    if (!selectedMonth) return null;

    return (
        <div className="etka-report flex flex-col text-black">
            {/* Header Table block */}
            <table className="w-full border-2 border-black border-collapse mb-4">
                <tbody>
                    <tr>
                        {/* Logo */}
                        <td className="border border-black p-2 text-center w-1/4 align-middle">
                            <div className="flex flex-col items-center justify-center">
                                <span className="text-xl font-black italic tracking-tighter text-blue-900 leading-none">etka-d</span>
                                <span className="text-[6.5px] text-gray-500 font-bold uppercase tracking-tight leading-none mt-1">otomotiv & plastik & kalıp</span>
                                <span className="text-[6px] text-gray-500 font-medium leading-none">San. Tic. Ltd. Şti.</span>
                            </div>
                        </td>
                        {/* Document Title */}
                        <td className="border border-black p-2 text-center w-2/4 align-middle">
                            <h2 className="text-[13px] font-black tracking-wider uppercase">PERİYODİK KORUYUCU BAKIM LİSTESİ</h2>
                        </td>
                        {/* Document Control Metadata */}
                        <td className="border border-black p-2 text-left w-1/4 text-[8px] font-black space-y-0.5 align-middle leading-tight">
                            <div>Hazırlama Tarihi: <span className="font-bold">15.05.2018</span></div>
                            <div>Rev.No: <span className="font-bold">01</span></div>
                            <div>Rev.Tarihi: <span className="font-bold">31.08.2018</span></div>
                        </td>
                    </tr>
                    <tr className="leading-tight">
                        {/* Machine Number */}
                        <td className="border border-black p-2 text-center align-middle">
                            <div className="text-[7.5px] font-bold uppercase text-gray-500 leading-none">MAKİNA NO</div>
                            <div className="text-lg font-black text-blue-800 mt-1 leading-none">{mName}</div>
                        </td>
                        {/* Machine Type */}
                        <td colSpan="2" className="border border-black p-2 text-left align-middle">
                            <span className="text-[7.5px] font-bold uppercase text-gray-500 block leading-none">MAKİNA TİPİ</span>
                            <span className="text-xs font-black uppercase text-gray-900 mt-1 block">{mType || 'CNC TEZGAHI'}</span>
                        </td>
                    </tr>
                </tbody>
            </table>

            {/* Split Two-Column Body */}
            <div className="flex gap-4 items-start w-full animate-fadeIn">
                
                {/* Left Column: GÜNLÜK KONTROL */}
                <div className="w-[49%] shrink-0">
                    <table className="etka-table w-full">
                        <thead>
                            <tr>
                                <th colSpan={dailyColSpan} className="sub-header-title py-1 text-center font-black">
                                    ( GÜNLÜK KONTROL )
                                </th>
                            </tr>
                            <tr>
                                <th rowSpan="2" className="w-[12%]">Tarih</th>
                                <th rowSpan="2" className="w-[7%]">Bakım</th>
                                <th rowSpan="2" className="w-[7%]">Arıza</th>
                                <th rowSpan="2" className="w-[22%]">Müdahaleyi Yapan İmza</th>
                                {renderTaskHeaders(dailyTasks, "Tanımlı Günlük Görev Yok")}
                            </tr>
                            <tr>
                                {renderSubHeaders(dailyTasks)}
                            </tr>
                        </thead>
                        <tbody>
                            {daysList.map(day => {
                                const dayLogs = getLogsOnDate(day.dateStr);
                                const hasBakim = dayLogs.length > 0;
                                const opName = hasBakim ? dayLogs[0].operatorName : '';
                                const completedTasks = hasBakim ? (dayLogs[0].completedTasks || []) : [];
                                
                                return (
                                    <tr key={day.dayNum}>
                                        <td className="font-extrabold text-[8px]">{day.displayDate}</td>
                                        <td>{hasBakim ? '✓' : ''}</td>
                                        <td></td>
                                        <td className="font-bold text-[8.5px] truncate max-w-[65px]">{opName}</td>
                                        {renderTaskCells(dailyTasks, completedTasks, hasBakim)}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {/* Right Column: 15 GÜNLÜK, HAFTALIK, AYLIK, AÇIKLAMALAR */}
                <div className="w-[51%] flex flex-col gap-4">
                    
                    {/* 1. 15 GÜNLÜK KONTROL */}
                    <div>
                        <table className="etka-table w-full">
                            <thead>
                                <tr>
                                    <th colSpan={biweeklyColSpan} className="sub-header-title py-1 text-center font-black">
                                        ( 15 GÜNLÜK KONTROL )
                                    </th>
                                </tr>
                                <tr>
                                    <th rowSpan="2" className="w-[12%]">Tarih</th>
                                    <th rowSpan="2" className="w-[5%]">Bakım</th>
                                    <th rowSpan="2" className="w-[5%]">Arıza</th>
                                    <th rowSpan="2" className="w-[16%]">Müdahaleyi Yapan İmza</th>
                                    {renderTaskHeaders(biweeklyTasks, "Tanımlı 15 Günlük Görev Yok")}
                                </tr>
                                <tr>
                                    {renderSubHeaders(biweeklyTasks)}
                                </tr>
                            </thead>
                            <tbody>
                                {Array.from({ length: 4 }).map((_, i) => {
                                    const log = biweeklyLogs[i];
                                    const logDate = log ? new Date(log.timestamp).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' }) : '';
                                    const opName = log ? log.operatorName : '';
                                    const completedTasks = log ? (log.completedTasks || []) : [];
                                    return (
                                        <tr key={i}>
                                            <td className="font-extrabold text-[8px]">{logDate || <span className="opacity-0">-</span>}</td>
                                            <td>{log ? '✓' : ''}</td>
                                            <td></td>
                                            <td className="font-bold text-[8.5px] truncate max-w-[65px]">{opName}</td>
                                            {renderTaskCells(biweeklyTasks, completedTasks, !!log)}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* 2. AYLIK KONTROL */}
                    <div>
                        <table className="etka-table w-full">
                            <thead>
                                <tr>
                                    <th colSpan={monthlyColSpan} className="sub-header-title py-1 text-center font-black">
                                        ( AYLIK KONTROL )
                                    </th>
                                </tr>
                                <tr>
                                    <th rowSpan="2" className="w-[12%]">Tarih</th>
                                    <th rowSpan="2" className="w-[8%]">Bakım</th>
                                    <th rowSpan="2" className="w-[8%]">Arıza</th>
                                    <th rowSpan="2" className="w-[20%]">Müdahaleyi Yapan İmza</th>
                                    {renderTaskHeaders(monthlyTasks, "Tanımlı Aylık Görev Yok")}
                                </tr>
                                <tr>
                                    {renderSubHeaders(monthlyTasks)}
                                </tr>
                            </thead>
                            <tbody>
                                {Array.from({ length: 2 }).map((_, i) => {
                                    const log = monthlyLogs[i];
                                    const logDate = log ? new Date(log.timestamp).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' }) : '';
                                    const opName = log ? log.operatorName : '';
                                    const completedTasks = log ? (log.completedTasks || []) : [];
                                    return (
                                        <tr key={i}>
                                            <td className="font-extrabold text-[8px]">{logDate || <span className="opacity-0">-</span>}</td>
                                            <td>{log ? '✓' : ''}</td>
                                            <td></td>
                                            <td className="font-bold text-[8.5px] truncate max-w-[75px]">{opName}</td>
                                            {renderTaskCells(monthlyTasks, completedTasks, !!log)}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* 3. HAFTALIK KONTROL */}
                    <div>
                        <table className="etka-table w-full">
                            <thead>
                                <tr>
                                    <th colSpan={weeklyColSpan} className="sub-header-title py-1 text-center font-black">
                                        ( HAFTALIK KONTROL )
                                    </th>
                                </tr>
                                <tr>
                                    <th rowSpan="2" className="w-[12%]">Tarih</th>
                                    <th rowSpan="2" className="w-[8%]">Bakım</th>
                                    <th rowSpan="2" className="w-[8%]">Arıza</th>
                                    <th rowSpan="2" className="w-[20%]">Müdahaleyi Yapan İmza</th>
                                    {renderTaskHeaders(weeklyTasks, "Tanımlı Haftalık Görev Yok")}
                                </tr>
                                <tr>
                                    {renderSubHeaders(weeklyTasks)}
                                </tr>
                            </thead>
                            <tbody>
                                {Array.from({ length: 4 }).map((_, i) => {
                                    const log = weeklyLogs[i];
                                    const logDate = log ? new Date(log.timestamp).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' }) : '';
                                    const opName = log ? log.operatorName : '';
                                    const completedTasks = log ? (log.completedTasks || []) : [];
                                    return (
                                        <tr key={i}>
                                            <td className="font-extrabold text-[8px]">{logDate || <span className="opacity-0">-</span>}</td>
                                            <td>{log ? '✓' : ''}</td>
                                            <td></td>
                                            <td className="font-bold text-[8.5px] truncate max-w-[75px]">{opName}</td>
                                            {renderTaskCells(weeklyTasks, completedTasks, !!log)}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* 4. AÇIKLAMALAR & FOOTNOTE */}
                    <div className="border border-black p-2 rounded flex flex-col text-[7.5px] leading-tight space-y-1 bg-gray-50/25">
                        <div className="font-black border-b border-black pb-0.5 mb-1">
                            AÇIKLAMALAR (ARIZA NEDENİ/ARIZA VE BAKIM HARİCİ YAPILAN MÜDAHALE VB. NEDENLERİNİ BELİRTİNİZ):
                        </div>
                        <div className="flex-1 space-y-1.5 py-0.5 font-bold text-gray-800">
                            <div className="border-b border-gray-300 h-2.5"></div>
                            <div className="border-b border-gray-300 h-2.5"></div>
                            <div className="border-b border-gray-300 h-2.5"></div>
                        </div>
                    </div>

                </div>
            </div>

            {/* Footnotes only */}
            <div className="mt-4 border-t-2 border-black pt-2 text-[7.5px] leading-snug">
                <div className="w-full space-y-0.5 text-left font-bold italic text-gray-700">
                    <div>NOT: Yağ seviye kontrolü, yağ tankları üzerinde bulunan minimum ve maksimum seviyelere bakılarak yapılır.</div>
                    <div>NOT: Makine çalıştığı süre içerisinde, TL 058 nolu talimatta belirtildiği şekilde ilgili operatör tarafından belirtimler yapılır.</div>
                </div>
            </div>
        </div>
    );
};

const MachineMaintenancePage = ({ machines = [], loggedInUser }) => {
    const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard', 'tasks', 'logs', 'print'
    const [tasks, setTasks] = useState([]);
    const [logs, setLogs] = useState([]);

    const sortedMachines = useMemo(() => {
        return [...machines].sort((a, b) => 
            a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
        );
    }, [machines]);

    // Modals
    const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
    const [editingTask, setEditingTask] = useState(null);
    const [selectedLog, setSelectedLog] = useState(null);
    const [editingMachine, setEditingMachine] = useState(null);
    const [machineForm, setMachineForm] = useState({ name: '', ekBilgi: '', department: 'KALIPHANE' });
    const [isFullScreenPreviewOpen, setIsFullScreenPreviewOpen] = useState(false);
    const [previewScale, setPreviewScale] = useState(1);
    const containerRef = useRef(null);

    // Auto-Fill & Manual past entry state
    const [isHiddenAutoFillModalOpen, setIsHiddenAutoFillModalOpen] = useState(false);
    const [personnelList, setPersonnelList] = useState([]);
    const [selectedAutoMachineId, setSelectedAutoMachineId] = useState('');
    const [selectedAutoOperator, setSelectedAutoOperator] = useState(null);
    const [operatorSearchQuery, setOperatorSearchQuery] = useState('');
    const [isOperatorDropdownOpen, setIsOperatorDropdownOpen] = useState(false);
    const [selectedAutoMonth, setSelectedAutoMonth] = useState(() => new Date().toISOString().substring(0, 7));
    const [isSaving, setIsSaving] = useState(false);
    const [activeFillType, setActiveFillType] = useState('auto'); // 'auto' or 'manual'

    // Manual past entry specific states
    const [manualDate, setManualDate] = useState('');
    const [selectedManualTaskIds, setSelectedManualTaskIds] = useState([]);

    const pressTimerRef = useRef(null);

    const handlePressStart = () => {
        if (pressTimerRef.current) clearTimeout(pressTimerRef.current);
        pressTimerRef.current = setTimeout(() => {
            setIsHiddenAutoFillModalOpen(true);
        }, 3000);
    };

    const handlePressEnd = () => {
        if (pressTimerRef.current) {
            clearTimeout(pressTimerRef.current);
            pressTimerRef.current = null;
        }
    };

    // Personnel Subscriber
    useEffect(() => {
        if (!db) return;
        const unsubscribePersonnel = onSnapshot(collection(db, PERSONNEL_COLLECTION), (snapshot) => {
            const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setPersonnelList(list);
        });
        return () => unsubscribePersonnel();
    }, []);

    // Filtered personnel list for search
    const filteredPersonnelList = useMemo(() => {
        const queryVal = operatorSearchQuery.trim().toLowerCase();
        if (!queryVal) return personnelList;
        return personnelList.filter(p => p.name && p.name.toLowerCase().includes(queryVal));
    }, [personnelList, operatorSearchQuery]);

    // Filter tasks for chosen machine (manual entry)
    const activeMachineTasks = useMemo(() => {
        if (!selectedAutoMachineId) return [];
        return tasks.filter(t => t.machineIds?.includes('all') || t.machineIds?.includes(selectedAutoMachineId));
    }, [tasks, selectedAutoMachineId]);

    const handleAutoFillLogs = async () => {
        if (!selectedAutoMachineId) {
            alert("Lütfen bir makine seçiniz.");
            return;
        }
        if (!selectedAutoOperator) {
            alert("Lütfen bakım yapan personeli seçiniz.");
            return;
        }
        if (!selectedAutoMonth) {
            alert("Lütfen doldurulacak ayı seçiniz.");
            return;
        }

        const [yearStr, monthStr] = selectedAutoMonth.split('-');
        const year = parseInt(yearStr, 10);
        const monthIndex = parseInt(monthStr, 10) - 1;

        const start = new Date(year, monthIndex, 1);
        const end = new Date(year, monthIndex + 1, 0); // Last day of month

        const machineObj = machines.find(m => m.id === selectedAutoMachineId);
        if (!machineObj) return;

        const machineName = machineObj.ekBilgi ? `${machineObj.name} (${machineObj.ekBilgi})` : machineObj.name;

        // Find tasks assigned to this machine
        const machineTasks = tasks.filter(t => t.machineIds?.includes('all') || t.machineIds?.includes(selectedAutoMachineId));
        if (machineTasks.length === 0) {
            alert("Bu tezgaha atanmış herhangi bir bakım görevi bulunmuyor. Önce görev tanımlayın.");
            return;
        }

        setIsSaving(true);
        try {
            let currentDate = new Date(start);
            const batchPromises = [];
            let skippedCount = 0;

            while (currentDate <= end) {
                const dateStr = currentDate.toISOString().substring(0, 10);

                // Check if a log already exists for this machine on this date
                const alreadyExists = logs.some(log => log.machineId === selectedAutoMachineId && log.date === dateStr);
                if (alreadyExists) {
                    skippedCount++;
                    currentDate.setDate(currentDate.getDate() + 1);
                    continue;
                }

                const dayOfWeek = currentDate.getDay(); // 0: Sunday, 1: Monday, ... 5: Friday, 6: Saturday
                if (dayOfWeek === 0) {
                    currentDate.setDate(currentDate.getDate() + 1);
                    continue;
                }
                const dayOfMonth = currentDate.getDate();
                const month = currentDate.getMonth();

                // Determine completed tasks for this specific date
                const completedTasks = [];
                machineTasks.forEach(task => {
                    if (task.frequency === 'DAILY') {
                        completedTasks.push({
                            taskId: task.id,
                            taskName: task.name,
                            frequency: 'DAILY'
                        });
                    } else if (task.frequency === 'WEEKLY') {
                        if (dayOfWeek === 5) {
                            completedTasks.push({
                                taskId: task.id,
                                taskName: task.name,
                                frequency: 'WEEKLY'
                            });
                        }
                    } else if (task.frequency === 'BIWEEKLY') {
                        if (dayOfWeek === 5) {
                            // Calculate week number
                            const tempDate = new Date(currentDate.getTime());
                            tempDate.setHours(0, 0, 0, 0);
                            tempDate.setDate(tempDate.getDate() + 3 - (tempDate.getDay() + 6) % 7);
                            const week1 = new Date(tempDate.getFullYear(), 0, 4);
                            const weekNum = 1 + Math.round(((tempDate.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
                            if (weekNum % 2 === 0) {
                                completedTasks.push({
                                    taskId: task.id,
                                    taskName: task.name,
                                    frequency: 'BIWEEKLY'
                                });
                            }
                        }
                    } else if (task.frequency === 'MONTHLY') {
                        if (dayOfMonth === 15) {
                            completedTasks.push({
                                taskId: task.id,
                                taskName: task.name,
                                frequency: 'MONTHLY'
                            });
                        }
                    } else if (task.frequency === 'YEARLY') {
                        if (month === 11 && dayOfMonth === 15) {
                            completedTasks.push({
                                taskId: task.id,
                                taskName: task.name,
                                frequency: 'YEARLY'
                            });
                        }
                    }
                });

                if (completedTasks.length > 0) {
                    const logId = `mlog-auto-${selectedAutoMachineId}-${dateStr}-${Date.now()}`;
                    const logData = {
                        id: logId,
                        machineId: selectedAutoMachineId,
                        machineName: machineName,
                        operatorName: selectedAutoOperator.name,
                        date: dateStr,
                        timestamp: new Date(currentDate.getTime() + 12 * 60 * 60 * 1000).toISOString(),
                        completedTasks: completedTasks,
                        isAutoFilled: true
                    };
                    
                    batchPromises.push(setDoc(doc(db, MACHINE_MAINTENANCE_LOGS_COLLECTION, logId), logData));
                }

                currentDate.setDate(currentDate.getDate() + 1);
            }

            if (batchPromises.length > 0) {
                await Promise.all(batchPromises);
            }

            let message = `${batchPromises.length} adet günlük bakım kaydı başarıyla oluşturuldu.`;
            if (skippedCount > 0) {
                message += ` (${skippedCount} gün önceden doldurulmuş olduğu için atlandı ve korundu.)`;
            }
            alert(message);
            setIsHiddenAutoFillModalOpen(false);
            // Reset fields
            setSelectedAutoMachineId('');
            setSelectedAutoOperator(null);
            setOperatorSearchQuery('');
        } catch (e) {
            console.error(e);
            alert("Kayıtlar oluşturulurken bir hata oluştu.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleManualFillLogs = async () => {
        if (!selectedAutoMachineId) {
            alert("Lütfen bir makine seçiniz.");
            return;
        }
        if (!selectedAutoOperator) {
            alert("Lütfen bakım yapan personeli seçiniz.");
            return;
        }
        if (!manualDate) {
            alert("Lütfen bakım tarihini seçiniz.");
            return;
        }
        if (selectedManualTaskIds.length === 0) {
            alert("Lütfen tamamlanan en az bir görev seçiniz.");
            return;
        }

        const machineObj = machines.find(m => m.id === selectedAutoMachineId);
        if (!machineObj) return;

        const machineName = machineObj.ekBilgi ? `${machineObj.name} (${machineObj.ekBilgi})` : machineObj.name;

        const completedTasks = tasks
            .filter(t => selectedManualTaskIds.includes(t.id))
            .map(t => ({
                taskId: t.id,
                taskName: t.name,
                frequency: t.frequency
            }));

        setIsSaving(true);
        try {
            const logId = `mlog-manual-${selectedAutoMachineId}-${manualDate}-${Date.now()}`;
            const logData = {
                id: logId,
                machineId: selectedAutoMachineId,
                machineName: machineName,
                operatorName: selectedAutoOperator.name,
                date: manualDate,
                timestamp: new Date(manualDate + 'T12:00:00').toISOString(),
                completedTasks: completedTasks,
                isManualFilled: true
            };

            await setDoc(doc(db, MACHINE_MAINTENANCE_LOGS_COLLECTION, logId), logData);
            alert("Bakım kaydı başarıyla geçmişe dönük olarak kaydedildi.");
            setIsHiddenAutoFillModalOpen(false);
            // Reset fields
            setSelectedAutoMachineId('');
            setSelectedAutoOperator(null);
            setOperatorSearchQuery('');
            setManualDate('');
            setSelectedManualTaskIds([]);
        } catch (e) {
            console.error(e);
            alert("Kayıt oluşturulurken bir hata oluştu.");
        } finally {
            setIsSaving(false);
        }
    };

    useEffect(() => {
        if (!isFullScreenPreviewOpen || !containerRef.current) return;
        
        const resizeObserver = new ResizeObserver((entries) => {
            for (let entry of entries) {
                const { width, height } = entry.contentRect;
                // Target width: 1100px, target height: 750px
                const targetWidth = 1100;
                const targetHeight = 750;
                
                const scaleX = width / targetWidth;
                const scaleY = height / targetHeight;
                const finalScale = Math.min(scaleX, scaleY, 1);
                
                setPreviewScale(finalScale);
            }
        });
        
        resizeObserver.observe(containerRef.current);
        return () => resizeObserver.disconnect();
    }, [isFullScreenPreviewOpen]);

    // Task Form
    const [taskForm, setTaskForm] = useState({
        name: '',
        frequency: 'DAILY',
        machineIds: [] // Empty means apply to all
    });
    const [applyToAllMachines, setApplyToAllMachines] = useState(true);

    // Filters for Logs
    const [searchLogOperator, setSearchLogOperator] = useState('');
    const [filterLogMachine, setFilterLogMachine] = useState('ALL');
    const [searchLogMachine, setSearchLogMachine] = useState('');
    const [filterLogFrequency, setFilterLogFrequency] = useState('ALL');
    const [filterLogDate, setFilterLogDate] = useState('');

    // Specific Machine Task Filter
    const [filterTaskMachineId, setFilterTaskMachineId] = useState(null);

    // Print Report Filters
    const [selectedMonth, setSelectedMonth] = useState(() => new Date().toISOString().substring(0, 7));
    const [printMachineId, setPrintMachineId] = useState('');

    const { printStartDate, printEndDate } = useMemo(() => {
        if (!selectedMonth) return { printStartDate: '', printEndDate: '' };
        const [year, month] = selectedMonth.split('-');
        const start = `${year}-${month}-01`;
        const lastDay = new Date(parseInt(year, 10), parseInt(month, 10), 0).getDate();
        const end = `${year}-${month}-${String(lastDay).padStart(2, '0')}`;
        return { printStartDate: start, printEndDate: end };
    }, [selectedMonth]);

    useEffect(() => {
        if (sortedMachines.length > 0 && !printMachineId) {
            setPrintMachineId(sortedMachines[0].id);
        }
    }, [sortedMachines, printMachineId]);

    // Fetch Tasks & Logs
    useEffect(() => {
        if (!db) return;

        const unsubscribeTasks = onSnapshot(collection(db, MACHINE_MAINTENANCE_TASKS_COLLECTION), (snapshot) => {
            const list = [];
            snapshot.forEach(docSnapshot => {
                list.push({ id: docSnapshot.id, ...docSnapshot.data() });
            });
            setTasks(list);
        });

        const unsubscribeLogs = onSnapshot(collection(db, MACHINE_MAINTENANCE_LOGS_COLLECTION), (snapshot) => {
            const list = [];
            snapshot.forEach(docSnapshot => {
                list.push({ id: docSnapshot.id, ...docSnapshot.data() });
            });
            list.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            setLogs(list);
        });

        return () => {
            unsubscribeTasks();
            unsubscribeLogs();
        };
    }, []);

    // Save Task (Add or Edit)
    const handleSaveTask = async (e) => {
        e.preventDefault();
        if (!taskForm.name.trim()) return;

        const taskId = editingTask ? editingTask.id : `task-${Date.now()}`;
        const taskData = {
            id: taskId,
            name: taskForm.name.trim(),
            frequency: taskForm.frequency,
            machineIds: applyToAllMachines ? ['all'] : taskForm.machineIds,
            updatedAt: new Date().toISOString(),
            updatedBy: loggedInUser?.name || 'Yönetici'
        };

        if (!editingTask) {
            taskData.createdAt = new Date().toISOString();
        }

        try {
            await setDoc(doc(db, MACHINE_MAINTENANCE_TASKS_COLLECTION, taskId), taskData);
            setIsTaskModalOpen(false);
            setEditingTask(null);
            setTaskForm({ name: '', frequency: 'DAILY', machineIds: [] });
            setApplyToAllMachines(true);
        } catch (error) {
            console.error("Bakım görevi kaydedilemedi:", error);
            alert("Görev kaydedilemedi.");
        }
    };

    // Open Edit Task
    const handleOpenEditTask = (task) => {
        setEditingTask(task);
        setTaskForm({
            name: task.name,
            frequency: task.frequency,
            machineIds: task.machineIds || []
        });
        setApplyToAllMachines(task.machineIds?.includes('all') ?? true);
        setIsTaskModalOpen(true);
    };

    // Delete Task
    const handleDeleteTask = async (taskId) => {
        if (!window.confirm("Bu bakım görevini silmek istediğinizden emin misiniz?")) return;

        try {
            await deleteDoc(doc(db, MACHINE_MAINTENANCE_TASKS_COLLECTION, taskId));
        } catch (error) {
            console.error("Bakım görevi silinemedi:", error);
            alert("Görev silinemedi.");
        }
    };

    // Save Machine Info (Name and Type)
    const handleSaveMachineInfo = async (e) => {
        e.preventDefault();
        if (!editingMachine || !machineForm.name.trim()) return;

        try {
            await setDoc(doc(db, MACHINES_COLLECTION, editingMachine.id), {
                name: machineForm.name.trim(),
                ekBilgi: machineForm.ekBilgi.trim(),
                department: machineForm.department || 'KALIPHANE'
            }, { merge: true });
            
            setEditingMachine(null);
            alert("Tezgah bilgileri başarıyla güncellendi.");
        } catch (error) {
            console.error("Tezgah güncellenemedi:", error);
            alert("Tezgah güncellenemedi.");
        }
    };

    // Toggle Machine Selection in Task Form
    const handleToggleMachineInForm = (machineId) => {
        const currentSelected = [...taskForm.machineIds];
        const index = currentSelected.indexOf(machineId);
        if (index > -1) {
            currentSelected.splice(index, 1);
        } else {
            currentSelected.push(machineId);
        }
        setTaskForm({ ...taskForm, machineIds: currentSelected });
    };

    // Filter Logs
    const filteredLogs = useMemo(() => {
        return logs.filter(log => {
            const matchesOperator = log.operatorName?.toLowerCase().includes(searchLogOperator.toLowerCase());
            const matchesMachineDropdown = filterLogMachine === 'ALL' || log.machineId === filterLogMachine;
            const matchesMachineSearch = !searchLogMachine || log.machineName?.toLowerCase().includes(searchLogMachine.toLowerCase());
            const matchesDate = !filterLogDate || log.date === filterLogDate;
            
            // Check if log contains any completed task of selected frequency
            const matchesFreq = filterLogFrequency === 'ALL' || 
                (log.completedTasks || []).some(t => t.frequency === filterLogFrequency);

            return matchesOperator && matchesMachineDropdown && matchesMachineSearch && matchesDate && matchesFreq;
        });
    }, [logs, searchLogOperator, filterLogMachine, searchLogMachine, filterLogFrequency, filterLogDate]);

    // Dashboard Data (Status Cards per Machine)
    const machineStatusList = useMemo(() => {
        const todayStr = new Date().toISOString().substring(0, 10);
        
        return sortedMachines.map(machine => {
            // Find today's daily log for this machine
            const todayDailyLog = logs.find(log => 
                log.machineId === machine.id && 
                log.date === todayStr &&
                (log.completedTasks || []).some(t => t.frequency === 'DAILY')
            );

            // Find last logs of other frequencies
            const lastLogs = {};
            Object.keys(FREQUENCIES).forEach(freq => {
                const lastLogOfFreq = logs.find(log => 
                    log.machineId === machine.id &&
                    (log.completedTasks || []).some(t => t.frequency === freq)
                );
                lastLogs[freq] = lastLogOfFreq ? new Date(lastLogOfFreq.timestamp).toLocaleDateString('tr-TR') : 'Bakım Yok';
            });

            // Calculate progress of today's daily tasks if any exist
            const dailyTasksForMachine = tasks.filter(t => 
                t.frequency === 'DAILY' && 
                (t.machineIds.includes('all') || t.machineIds.includes(machine.id))
            );

            const completedDailyTasksToday = todayDailyLog 
                ? (todayDailyLog.completedTasks || []).filter(t => t.frequency === 'DAILY').length
                : 0;

            const totalDailyCount = dailyTasksForMachine.length;

            return {
                ...machine,
                todayDailyLog,
                lastLogs,
                completedDailyTasksToday,
                totalDailyCount,
                dailyStatus: totalDailyCount === 0 
                    ? 'NO_TASKS'
                    : (completedDailyTasksToday >= totalDailyCount ? 'DONE' : 'PENDING')
            };
        });
    }, [sortedMachines, logs, tasks]);

    const displayedTasks = useMemo(() => {
        if (!filterTaskMachineId) return tasks;
        return tasks.filter(t => t.machineIds?.includes('all') || t.machineIds?.includes(filterTaskMachineId));
    }, [tasks, filterTaskMachineId]);

    const printedLogs = useMemo(() => {
        return logs.filter(log => {
            const matchesMachine = printMachineId === 'ALL' || log.machineId === printMachineId;
            const logDate = log.date; // YYYY-MM-DD
            const matchesStartDate = !printStartDate || logDate >= printStartDate;
            const matchesEndDate = !printEndDate || logDate <= printEndDate;
            return matchesMachine && matchesStartDate && matchesEndDate;
        });
    }, [logs, printMachineId, printStartDate, printEndDate]);


    const handleDownloadPDF = () => {
        const element = document.getElementById('maintenance-report-pdf-content');
        if (!element) return;

        const selectedMachine = sortedMachines.find(m => m.id === printMachineId);
        const mName = selectedMachine ? selectedMachine.name : 'Tezgah';

        const opt = {
            margin:       [10, 10, 10, 10],
            filename:     `${mName}_Periyodik_Bakim_Raporu_${printStartDate}_${printEndDate}.pdf`,
            image:        { type: 'jpeg', quality: 0.98 },
            html2canvas:  { scale: 2, useCORS: true, logging: false },
            jsPDF:        { unit: 'mm', format: 'a4', orientation: 'landscape' },
            pagebreak:    { mode: ['css', 'legacy'] }
        };

        html2pdf().set(opt).from(element).save();
    };

    return (
        <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 w-full overflow-hidden">
            {/* Header */}
            <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 py-6 px-6 lg:px-8 shrink-0 no-print">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <h1 className="text-2xl font-black flex items-center gap-2 text-gray-950 dark:text-white">
                            <Settings className="w-7 h-7 text-blue-600 dark:text-blue-500 animate-spin-slow" />
                            Tezgah Periyodik Bakım Paneli
                        </h1>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                            Tezgahların günlük, haftalık ve dönemsel bakım gereksinimlerini kontrol edin ve tanımlayın.
                        </p>
                    </div>
                </div>

                {/* Tab Navigation */}
                <div className="flex gap-2 mt-6 border-b border-gray-100 dark:border-gray-750 pb-0">
                    <button
                        onClick={() => setActiveTab('dashboard')}
                        className={`pb-3 px-4 text-sm font-bold border-b-2 transition-all flex items-center gap-2 ${
                            activeTab === 'dashboard'
                                ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                                : 'border-transparent text-gray-500 hover:text-gray-900 dark:hover:text-white'
                        }`}
                    >
                        <Monitor className="w-4 h-4" />
                        Tezgah Durum Paneli
                    </button>
                    <button
                        onClick={() => setActiveTab('tasks')}
                        className={`pb-3 px-4 text-sm font-bold border-b-2 transition-all flex items-center gap-2 ${
                            activeTab === 'tasks'
                                ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                                : 'border-transparent text-gray-500 hover:text-gray-900 dark:hover:text-white'
                        }`}
                    >
                        <ClipboardList className="w-4 h-4" />
                        Bakım Tanımları ({tasks.length})
                    </button>
                    <button
                        onClick={() => setActiveTab('logs')}
                        className={`pb-3 px-4 text-sm font-bold border-b-2 transition-all flex items-center gap-2 ${
                            activeTab === 'logs'
                                ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                                : 'border-transparent text-gray-500 hover:text-gray-900 dark:hover:text-white'
                        }`}
                    >
                        <Calendar className="w-4 h-4" />
                        Bakım Logları & Geçmişi ({filteredLogs.length})
                    </button>
                    <button
                        onClick={() => setActiveTab('print')}
                        onMouseDown={handlePressStart}
                        onMouseUp={handlePressEnd}
                        onMouseLeave={handlePressEnd}
                        onTouchStart={handlePressStart}
                        onTouchEnd={handlePressEnd}
                        className={`pb-3 px-4 text-sm font-bold border-b-2 transition-all flex items-center gap-2 ${
                            activeTab === 'print'
                                ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                                : 'border-transparent text-gray-500 hover:text-gray-900 dark:hover:text-white'
                        }`}
                    >
                        <Printer className="w-4 h-4" />
                        Rapor Çıktısı & Yazdır
                    </button>
                </div>
            </div>

            {/* Print Styles */}
            <style dangerouslySetInnerHTML={{__html: `
                @page {
                    size: A4 landscape;
                    margin: 8mm 10mm 8mm 10mm;
                }
                @media print {
                    aside, header, nav, button, .no-print {
                        display: none !important;
                    }
                    main {
                        background: white !important;
                        color: black !important;
                        padding: 0 !important;
                        margin: 0 !important;
                    }
                    .print-only {
                        display: block !important;
                    }
                    .print-container {
                        width: 100% !important;
                        max-width: 100% !important;
                        box-shadow: none !important;
                        border: none !important;
                        background: white !important;
                        color: black !important;
                        padding: 0 !important;
                    }
                    .etka-report {
                        padding: 0 !important;
                        margin: 0 !important;
                    }
                }
                @media screen {
                    .print-only {
                        display: none !important;
                    }
                }
                .etka-report {
                    font-family: 'Arial', sans-serif;
                    background-color: white !important;
                    color: black !important;
                    width: 100%;
                    box-sizing: border-box;
                }
                .etka-table {
                    border: 1.5px solid #000 !important;
                    border-collapse: collapse !important;
                    width: 100% !important;
                }
                .etka-table th, .etka-table td {
                    border: 1px solid #000 !important;
                    padding: 1.5px 2px !important;
                    text-align: center;
                    vertical-align: middle;
                    color: black !important;
                }
                .etka-table td {
                    font-size: 7.5px !important;
                    height: 15px !important;
                }
                .etka-table th {
                    font-size: 7px !important;
                    font-weight: 900 !important;
                    background-color: #f3f4f6 !important;
                    white-space: normal !important;
                    word-break: break-word !important;
                    line-height: 1.15 !important;
                    padding: 3px 2px !important;
                }
                .sub-header-title {
                    font-size: 8.5px !important;
                    font-weight: 900 !important;
                    background-color: #e5e7eb !important;
                    letter-spacing: 0.02em;
                }
            `}} />

            {/* Content Area */}
            <div className="flex-1 p-6 lg:p-8 overflow-y-auto custom-scrollbar">
                
                {/* --- TAB 1: DASHBOARD --- */}
                {activeTab === 'dashboard' && (
                    <div className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                            {machineStatusList.map(item => (
                                <div 
                                    key={item.id}
                                    className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm hover:shadow-md transition flex flex-col justify-between"
                                >
                                    <div>
                                        <div className="flex justify-between items-start mb-4">
                                            <div className="flex-1">
                                                <h3 className="font-extrabold text-lg text-gray-900 dark:text-white flex items-center gap-1.5">
                                                    {item.name}
                                                    <button 
                                                        onClick={() => {
                                                            setEditingMachine(item);
                                                            setMachineForm({ 
                                                                name: item.name, 
                                                                ekBilgi: item.ekBilgi || '', 
                                                                department: item.department || (['K41', 'K60', 'K65'].includes(item.name) ? 'CNC_TORNA' : 'KALIPHANE')
                                                            });
                                                        }}
                                                        className="p-1 hover:bg-gray-150 dark:hover:bg-gray-700 text-gray-400 hover:text-blue-500 rounded-lg transition shrink-0"
                                                        title="Tezgah Bilgilerini Düzenle"
                                                    >
                                                        <Edit2 className="w-3.5 h-3.5" />
                                                    </button>
                                                </h3>
                                                {item.ekBilgi ? (
                                                    <span className="text-xs text-blue-600 dark:text-blue-400 font-semibold block mt-0.5 leading-snug">{item.ekBilgi}</span>
                                                ) : (
                                                    <span className="text-xs text-gray-400 italic block mt-0.5">Tezgah tipi girilmemiş</span>
                                                )}
                                            </div>
                                            
                                            {/* Status Badge */}
                                            {item.dailyStatus === 'NO_TASKS' ? (
                                                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-gray-100 text-gray-600 dark:bg-gray-750 dark:text-gray-400 border dark:border-gray-700">
                                                    Görev Yok
                                                </span>
                                            ) : item.dailyStatus === 'DONE' ? (
                                                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-350 border border-emerald-250 dark:border-emerald-800 flex items-center gap-1">
                                                    <CheckCircle className="w-3 h-3 text-emerald-500" /> Günlük Bakım OK
                                                </span>
                                            ) : (
                                                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-250 dark:border-amber-800 flex items-center gap-1 animate-pulse">
                                                    <AlertTriangle className="w-3 h-3 text-amber-500" /> Günlük Bekliyor
                                                </span>
                                            )}
                                        </div>

                                        {/* Daily Progress Bar */}
                                        {item.dailyStatus !== 'NO_TASKS' && (
                                            <div className="mt-3 bg-gray-50 dark:bg-gray-900/40 p-3 rounded-xl border border-gray-100 dark:border-gray-750">
                                                <div className="flex justify-between text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">
                                                    <span>Günlük Görevler</span>
                                                    <span className="text-gray-900 dark:text-white">{item.completedDailyTasksToday} / {item.totalDailyCount}</span>
                                                </div>
                                                <div className="w-full bg-gray-200 dark:bg-gray-700 h-2 rounded-full overflow-hidden">
                                                    <div 
                                                        className={`h-full transition-all duration-550 ${item.dailyStatus === 'DONE' ? 'bg-emerald-500' : 'bg-amber-500'}`}
                                                        style={{ width: `${(item.completedDailyTasksToday / item.totalDailyCount) * 100}%` }}
                                                    />
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Periodics Info */}
                                    <div className="mt-6 pt-4 border-t border-gray-150 dark:border-gray-700 space-y-2 text-xs">
                                        <div className="flex justify-between text-gray-500 dark:text-gray-400">
                                            <span>Son Haftalık Bakım:</span>
                                            <span className="font-semibold text-gray-800 dark:text-gray-200">{item.lastLogs.WEEKLY}</span>
                                        </div>
                                        <div className="flex justify-between text-gray-500 dark:text-gray-400">
                                            <span>Son Aylık Bakım:</span>
                                            <span className="font-semibold text-gray-800 dark:text-gray-200">{item.lastLogs.MONTHLY}</span>
                                        </div>
                                        <div className="flex justify-between text-gray-500 dark:text-gray-400">
                                            <span>Son Yıllık Bakım:</span>
                                            <span className="font-semibold text-gray-800 dark:text-gray-200">{item.lastLogs.YEARLY}</span>
                                        </div>
                                    </div>

                                    <button
                                        onClick={() => {
                                            setFilterTaskMachineId(item.id);
                                            setActiveTab('tasks');
                                        }}
                                        className="mt-4 w-full py-2 bg-gray-100 hover:bg-blue-50 hover:text-blue-700 dark:bg-gray-750 dark:hover:bg-blue-950/20 dark:hover:text-blue-450 border border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-800 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 active:scale-95 text-gray-600 dark:text-gray-300"
                                    >
                                        <Edit2 className="w-3.5 h-3.5" /> Görevleri Düzenle
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* --- TAB 2: TASKS --- */}
                {activeTab === 'tasks' && (
                    <div className="space-y-4">
                        {/* Active Filter Header */}
                        {filterTaskMachineId && (
                            <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 p-4 rounded-xl flex justify-between items-center text-sm font-semibold text-blue-800 dark:text-blue-300">
                                <div className="flex items-center gap-2">
                                    <Settings className="w-4 h-4 text-blue-500 animate-spin-slow" />
                                    <span>
                                        Sadece <strong>{sortedMachines.find(m => m.id === filterTaskMachineId)?.name || filterTaskMachineId}</strong> tezgahına ait bakım görevleri gösteriliyor.
                                    </span>
                                </div>
                                <button
                                    onClick={() => setFilterTaskMachineId(null)}
                                    className="px-3 py-1 bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200 rounded-lg text-xs font-bold transition active:scale-95"
                                >
                                    Filtreyi Temizle (Tümünü Göster)
                                </button>
                            </div>
                        )}

                        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden flex flex-col">
                            <div className="p-5 border-b border-gray-250 dark:border-gray-700 flex justify-between items-center bg-gray-50/50 dark:bg-gray-800/50">
                                <div>
                                    <h3 className="font-extrabold text-gray-900 dark:text-white">Bakım Görev Tanımları</h3>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Sistemde tanımlı tüm periyodik kontroller</p>
                                </div>
                                <button
                                    onClick={() => {
                                        setEditingTask(null);
                                        setTaskForm({
                                            name: '',
                                            frequency: 'DAILY',
                                            machineIds: filterTaskMachineId ? [filterTaskMachineId] : []
                                        });
                                        setApplyToAllMachines(!filterTaskMachineId);
                                        setIsTaskModalOpen(true);
                                    }}
                                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded-xl text-sm transition shadow-md shadow-blue-500/20 flex items-center gap-1.5 active:scale-95"
                                >
                                    <Plus className="w-4 h-4" /> Görev Tanımla
                                </button>
                            </div>

                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="bg-gray-50 dark:bg-gray-900/35 border-b border-gray-200 dark:border-gray-700 text-xs font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                            <th className="px-6 py-4">Görev Adı / Tanımı</th>
                                            <th className="px-6 py-4 w-40">Bakım Periyodu</th>
                                            <th className="px-6 py-4">Uygulanan Tezgahlar</th>
                                            <th className="px-6 py-4 text-right w-36">İşlemler</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 dark:divide-gray-750 text-sm font-semibold text-gray-700 dark:text-gray-300">
                                        {displayedTasks.length === 0 ? (
                                            <tr>
                                                <td colSpan="4" className="text-center py-10 text-gray-400 dark:text-gray-500 italic">
                                                    Tanımlı bakım görevi bulunmuyor.
                                                </td>
                                            </tr>
                                        ) : (
                                            displayedTasks.map(task => {
                                                const freqInfo = FREQUENCIES[task.frequency] || FREQUENCIES.DAILY;
                                                return (
                                                    <tr key={task.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-900/10">
                                                        <td className="px-6 py-4 font-bold text-gray-900 dark:text-white">
                                                            {task.name}
                                                        </td>
                                                        <td className="px-6 py-4">
                                                            <span className={`px-2.5 py-0.5 rounded text-xs font-extrabold border ${freqInfo.color}`}>
                                                                {freqInfo.label}
                                                            </span>
                                                        </td>
                                                        <td className="px-6 py-4 text-xs font-bold text-gray-600 dark:text-gray-400">
                                                            {task.machineIds?.includes('all') ? (
                                                                <span className="text-blue-600 dark:text-blue-400 font-extrabold uppercase">Tüm Tezgahlar</span>
                                                            ) : (
                                                                <div className="flex flex-wrap gap-1">
                                                                    {task.machineIds?.map(mId => {
                                                                        const mach = sortedMachines.find(m => m.id === mId);
                                                                        return (
                                                                            <span key={mId} className="bg-gray-100 dark:bg-gray-750 px-1.5 py-0.5 rounded border dark:border-gray-700">
                                                                                {mach ? mach.name : mId}
                                                                            </span>
                                                                        );
                                                                    })}
                                                                </div>
                                                            )}
                                                        </td>
                                                        <td className="px-6 py-4 text-right">
                                                            <div className="flex justify-end gap-2">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleOpenEditTask(task)}
                                                                    className="p-2 text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 bg-gray-100 hover:bg-blue-50 dark:bg-gray-700 dark:hover:bg-blue-900/30 rounded-lg transition"
                                                                    title="Düzenle"
                                                                >
                                                                    <Edit2 className="w-4 h-4" />
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleDeleteTask(task.id)}
                                                                    className="p-2 text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-450 bg-gray-100 hover:bg-red-50 dark:bg-gray-700 dark:hover:bg-red-950/20 rounded-lg transition"
                                                                    title="Sil"
                                                                >
                                                                    <Trash2 className="w-4 h-4" />
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}

                {/* --- TAB 3: LOGS --- */}
                {activeTab === 'logs' && (
                    <div className="space-y-6">
                        {/* Filter Bar */}
                        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm">
                            <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                                <Search className="w-3.5 h-3.5" /> Gelişmiş Log Filtreleme
                            </h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4">
                                {/* Operator Search */}
                                <div>
                                    <label className="block text-xs font-extrabold text-gray-500 dark:text-gray-400 mb-1">Operatör Adı</label>
                                    <input
                                        type="text"
                                        value={searchLogOperator}
                                        onChange={(e) => setSearchLogOperator(e.target.value)}
                                        className="w-full p-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 text-xs sm:text-sm font-semibold"
                                        placeholder="Operatör ara..."
                                    />
                                </div>

                                {/* Machine Filter */}
                                <div>
                                    <label className="block text-xs font-extrabold text-gray-500 dark:text-gray-400 mb-1">Tezgah Seç</label>
                                    <select
                                        value={filterLogMachine}
                                        onChange={(e) => setFilterLogMachine(e.target.value)}
                                        className="w-full p-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 text-xs sm:text-sm font-bold"
                                    >
                                        <option value="ALL">Tüm Tezgahlar</option>
                                        {sortedMachines.map(m => (
                                            <option key={m.id} value={m.id}>{m.name}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Machine Text Search */}
                                <div>
                                    <label className="block text-xs font-extrabold text-gray-500 dark:text-gray-400 mb-1">Tezgah Adı Ara</label>
                                    <input
                                        type="text"
                                        value={searchLogMachine}
                                        onChange={(e) => setSearchLogMachine(e.target.value)}
                                        className="w-full p-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 text-xs sm:text-sm font-semibold"
                                        placeholder="Örn: K02, K68..."
                                    />
                                </div>

                                {/* Frequency Filter */}
                                <div>
                                    <label className="block text-xs font-extrabold text-gray-500 dark:text-gray-400 mb-1">Bakım Periyodu</label>
                                    <select
                                        value={filterLogFrequency}
                                        onChange={(e) => setFilterLogFrequency(e.target.value)}
                                        className="w-full p-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 text-xs sm:text-sm font-bold"
                                    >
                                        <option value="ALL">Tüm Periyotlar</option>
                                        {Object.values(FREQUENCIES).map(f => (
                                            <option key={f.value} value={f.value}>{f.label}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Date Filter */}
                                <div>
                                    <label className="block text-xs font-extrabold text-gray-500 dark:text-gray-400 mb-1">Tarih</label>
                                    <input
                                        type="date"
                                        value={filterLogDate}
                                        onChange={(e) => setFilterLogDate(e.target.value)}
                                        className="w-full p-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 text-xs sm:text-sm font-semibold"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Logs Table */}
                        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden flex flex-col">
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="bg-gray-50 dark:bg-gray-900/35 border-b border-gray-200 dark:border-gray-700 text-xs font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                            <th className="px-6 py-4">Tarih</th>
                                            <th className="px-6 py-4">Tezgah</th>
                                            <th className="px-6 py-4">Bakımı Yapan</th>
                                            <th className="px-6 py-4">Yapılan Görev Sayısı</th>
                                            <th className="px-6 py-4 text-right w-28">Detay</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 dark:divide-gray-750 text-sm font-semibold text-gray-700 dark:text-gray-300">
                                        {filteredLogs.length === 0 ? (
                                            <tr>
                                                <td colSpan="5" className="text-center py-10 text-gray-400 dark:text-gray-500 italic">
                                                    Aranan kriterlere uygun bakım kaydı bulunamadı.
                                                </td>
                                            </tr>
                                        ) : (
                                            filteredLogs.map(log => {
                                                const completedCount = (log.completedTasks || []).length;
                                                return (
                                                    <tr key={log.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-900/10">
                                                        <td className="px-6 py-4 font-bold text-gray-900 dark:text-white">
                                                            {new Date(log.timestamp).toLocaleString('tr-TR')}
                                                        </td>
                                                        <td className="px-6 py-4 text-blue-600 dark:text-blue-400 font-extrabold">
                                                            {log.machineName}
                                                        </td>
                                                        <td className="px-6 py-4 font-bold">
                                                            {log.operatorName}
                                                        </td>
                                                        <td className="px-6 py-4">
                                                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-extrabold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-350 border border-emerald-250 dark:border-emerald-800">
                                                                {completedCount} Görev Tamamlandı
                                                            </span>
                                                        </td>
                                                        <td className="px-6 py-4 text-right">
                                                            <button
                                                                type="button"
                                                                onClick={() => setSelectedLog(log)}
                                                                className="px-3.5 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-800 dark:bg-gray-700 dark:hover:bg-gray-650 dark:text-gray-200 rounded-xl font-bold transition flex items-center justify-end gap-1.5 ml-auto active:scale-95"
                                                            >
                                                                Detaylar <ChevronRight className="w-4 h-4" />
                                                            </button>
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}
                {/* --- TAB 4: PRINT / EXPORT REPORT --- */}
                {activeTab === 'print' && (
                    <div className="flex flex-col lg:flex-row gap-6 items-start h-[calc(100vh-230px)] overflow-hidden">
                        
                        {/* LEFT COLUMN: Machine Selection List (w-1/4) */}
                        <div className="w-full lg:w-80 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-4 flex flex-col h-full overflow-y-auto no-print custom-scrollbar shrink-0">
                            <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-1.5 border-b border-gray-100 dark:border-gray-750 pb-2">
                                <Monitor className="w-3.5 h-3.5" /> Tezgah Listesi
                            </h4>
                            <div className="space-y-2 flex-1">
                                {sortedMachines.map(m => {
                                    const isSelected = printMachineId === m.id;
                                    
                                    // Count logs for this machine in the current date range
                                    const logCount = logs.filter(log => 
                                        log.machineId === m.id &&
                                        (!printStartDate || log.date >= printStartDate) &&
                                        (!printEndDate || log.date <= printEndDate)
                                    ).length;

                                    return (
                                        <button
                                            type="button"
                                            key={m.id}
                                            onClick={() => setPrintMachineId(m.id)}
                                            className={`w-full p-3.5 rounded-xl border text-left flex justify-between items-center transition-all duration-150 ${
                                                isSelected
                                                    ? 'bg-blue-600 border-blue-650 text-white shadow-md shadow-blue-500/25'
                                                    : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-750 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200'
                                            }`}
                                        >
                                            <div className="font-extrabold text-sm truncate pr-2">
                                                {m.name}
                                                {m.ekBilgi && (
                                                    <span className={`block text-[10px] font-semibold mt-0.5 ${isSelected ? 'text-blue-100' : 'text-gray-500 dark:text-gray-400'}`}>
                                                        {m.ekBilgi}
                                                    </span>
                                                )}
                                            </div>
                                            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                                                isSelected 
                                                    ? 'bg-blue-700 text-white' 
                                                    : 'bg-gray-100 text-gray-650 dark:bg-gray-700 dark:text-gray-300'
                                            }`}>
                                                {logCount} Kayıt
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* RIGHT COLUMN: Rapor Önizleme & İndir (w-3/4) */}
                        <div className="flex-1 flex flex-col gap-4 h-full overflow-hidden w-full">
                            
                            {/* Controls Bar (no-print) */}
                            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm no-print flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shrink-0">
                                <div className="flex flex-wrap gap-4 items-center flex-1">
                                    {/* Month Selection */}
                                    <div>
                                        <label className="block text-[10px] font-extrabold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider">Rapor Ayı Seçin</label>
                                        <input
                                            type="month"
                                            value={selectedMonth}
                                            onChange={(e) => setSelectedMonth(e.target.value)}
                                            className="p-2 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 text-xs font-semibold"
                                        />
                                    </div>
                                </div>

                                <div className="flex gap-3 shrink-0 self-end h-[42px]">
                                    <button
                                        onClick={() => setIsFullScreenPreviewOpen(true)}
                                        className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2.5 rounded-xl text-sm transition shadow-md shadow-blue-500/20 flex items-center justify-center gap-1.5 active:scale-95"
                                    >
                                        Tam Ekran Görüntüle
                                    </button>
                                    <button
                                        onClick={handleDownloadPDF}
                                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-6 py-2.5 rounded-xl text-sm transition shadow-md shadow-emerald-500/20 flex items-center justify-center gap-1.5 active:scale-95"
                                    >
                                        <Printer className="w-4 h-4" /> PDF Raporu İndir
                                    </button>
                                </div>
                            </div>

                            {/* Print Preview Canvas (Forces white background/black text) */}
                            <div className="flex-1 overflow-y-auto custom-scrollbar p-1 no-print">
                                <div 
                                    id="maintenance-report-pdf-content" 
                                    style={{ backgroundColor: '#ffffff', color: '#000000' }}
                                    className="bg-white rounded-2xl border border-gray-250 p-5 shadow-sm text-black w-full"
                                >
                                    <EtkaReportContent 
                                        selectedMachine={sortedMachines.find(m => m.id === printMachineId)}
                                        selectedMonth={selectedMonth}
                                        printedLogs={printedLogs}
                                        tasks={tasks}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* --- MODAL: GÖREV EKLE / DÜZENLE --- */}
            {isTaskModalOpen && (
                <Modal 
                    isOpen={isTaskModalOpen} 
                    onClose={() => setIsTaskModalOpen(false)} 
                    title={editingTask ? "Bakım Görevini Düzenle" : "Yeni Bakım Görevi Tanımla"}
                >
                    <form onSubmit={handleSaveTask} className="space-y-5">
                        {/* Task Name */}
                        <div>
                            <label className="block text-xs font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5">
                                Görev Adı / Açıklama
                            </label>
                            <input
                                type="text"
                                value={taskForm.name}
                                onChange={(e) => setTaskForm({ ...taskForm, name: e.target.value })}
                                className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 font-semibold"
                                placeholder="Örn: Yağ seviyesini kontrol et ve eksikse tamamla"
                                required
                            />
                        </div>

                        {/* Frequency Selection */}
                        <div>
                            <label className="block text-xs font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5">
                                Bakım Periyodu (Sıklık)
                            </label>
                            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                                {Object.values(FREQUENCIES).map(f => (
                                    <button
                                        type="button"
                                        key={f.value}
                                        onClick={() => setTaskForm({ ...taskForm, frequency: f.value })}
                                        className={`p-2.5 rounded-xl border font-bold text-xs transition-all ${
                                            taskForm.frequency === f.value
                                                ? 'bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-500/20'
                                                : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
                                        }`}
                                    >
                                        {f.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Apply To Machines */}
                        <div>
                            <div className="flex justify-between items-center mb-1.5">
                                <label className="block text-xs font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest">
                                    Uygulanacak Tezgahlar
                                </label>
                                <label className="flex items-center gap-1.5 text-xs font-bold text-blue-600 dark:text-blue-400 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={applyToAllMachines}
                                        onChange={(e) => {
                                            setApplyToAllMachines(e.target.checked);
                                            if (e.target.checked) setTaskForm({ ...taskForm, machineIds: [] });
                                        }}
                                        className="rounded border-gray-300 dark:border-gray-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                                    />
                                    Tüm Tezgahlara Uygula
                                </label>
                            </div>

                            {!applyToAllMachines && (
                                <div className="max-h-48 overflow-y-auto custom-scrollbar p-3.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-900/30 grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    {sortedMachines.map(m => {
                                        const isSelected = taskForm.machineIds.includes(m.id);
                                        return (
                                            <button
                                                type="button"
                                                key={m.id}
                                                onClick={() => handleToggleMachineInForm(m.id)}
                                                className={`p-2 rounded-lg border text-left font-bold text-xs flex justify-between items-center transition-all ${
                                                    isSelected
                                                        ? 'bg-blue-50 border-blue-300 dark:bg-blue-950/20 dark:border-blue-800 text-blue-700 dark:text-blue-300'
                                                        : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700'
                                                }`}
                                            >
                                                <span>{m.name}</span>
                                                {isSelected && <CheckCircle className="w-3.5 h-3.5 text-blue-500" />}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Actions */}
                        <div className="flex justify-end gap-3 pt-4 border-t border-gray-150 dark:border-gray-700">
                            <button
                                type="button"
                                onClick={() => setIsTaskModalOpen(false)}
                                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 dark:bg-gray-700 dark:hover:bg-gray-650 dark:text-gray-200 rounded-xl font-bold transition text-xs sm:text-sm"
                            >
                                İptal
                            </button>
                            <button
                                type="submit"
                                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition shadow-md shadow-blue-500/20 text-xs sm:text-sm"
                            >
                                Kaydet
                            </button>
                        </div>
                    </form>
                </Modal>
            )}

            {/* --- MODAL: LOG DETAYLARI --- */}
            {selectedLog && (
                <Modal
                    isOpen={!!selectedLog}
                    onClose={() => setSelectedLog(null)}
                    title={`${selectedLog.machineName} - Bakım Detayları`}
                >
                    <div className="space-y-4">
                        {/* Metadata */}
                        <div className="grid grid-cols-2 gap-4 bg-gray-50 dark:bg-gray-900/40 p-4 rounded-2xl border border-gray-200 dark:border-gray-700 text-xs">
                            <div>
                                <span className="block text-gray-500 dark:text-gray-400 font-bold">Tarih / Saat</span>
                                <span className="font-extrabold text-gray-900 dark:text-white mt-0.5 block">{new Date(selectedLog.timestamp).toLocaleString('tr-TR')}</span>
                            </div>
                            <div>
                                <span className="block text-gray-500 dark:text-gray-400 font-bold">Bakımı Yapan Operatör</span>
                                <span className="font-extrabold text-gray-900 dark:text-white mt-0.5 block">{selectedLog.operatorName}</span>
                            </div>
                        </div>

                        {/* Task Checklist Display */}
                        <div>
                            <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2.5">Tamamlanan Bakım Kontrolleri</h4>
                            <div className="space-y-2 max-h-64 overflow-y-auto pr-1 custom-scrollbar">
                                {(selectedLog.completedTasks || []).map((t, idx) => {
                                    const freqInfo = FREQUENCIES[t.frequency] || FREQUENCIES.DAILY;
                                    return (
                                        <div 
                                            key={idx} 
                                            className="p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-750 flex items-center justify-between gap-3 text-xs"
                                        >
                                            <div className="flex items-center gap-2.5 min-w-0">
                                                <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0" />
                                                <span className="font-bold text-gray-800 dark:text-gray-200 truncate">{t.taskName}</span>
                                            </div>
                                            <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold shrink-0 border ${freqInfo.color}`}>
                                                {freqInfo.label}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Close button */}
                        <div className="flex justify-end pt-3 border-t border-gray-150 dark:border-gray-700">
                            <button
                                type="button"
                                onClick={() => setSelectedLog(null)}
                                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition shadow-md shadow-blue-500/20 text-xs sm:text-sm"
                            >
                                Kapat
                            </button>
                        </div>
                    </div>
                </Modal>
            )}
            {/* --- MODAL: TEZGAH BİLGİLERİNİ DÜZENLE --- */}
            {editingMachine && (
                <Modal 
                    isOpen={!!editingMachine} 
                    onClose={() => setEditingMachine(null)} 
                    title="Tezgah Bilgilerini Düzenle"
                >
                    <form onSubmit={handleSaveMachineInfo} className="space-y-5">
                        {/* Machine No */}
                        <div>
                            <label className="block text-xs font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5">
                                Makina No
                            </label>
                            <input
                                type="text"
                                value={machineForm.name}
                                onChange={(e) => setMachineForm({ ...machineForm, name: e.target.value })}
                                className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 font-semibold"
                                placeholder="Örn: K 28"
                                required
                            />
                        </div>

                        {/* Machine Type */}
                        <div>
                            <label className="block text-xs font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5">
                                Makina Tipi (Model/Detay)
                            </label>
                            <input
                                type="text"
                                value={machineForm.ekBilgi}
                                onChange={(e) => setMachineForm({ ...machineForm, ekBilgi: e.target.value })}
                                className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 font-semibold"
                                placeholder="Örn: DMG MORI-CMX 1100V CNC TEZGAHI"
                            />
                        </div>


                        {/* Actions */}
                        <div className="flex justify-end gap-3 pt-4 border-t border-gray-150 dark:border-gray-700">
                            <button
                                type="button"
                                onClick={() => setEditingMachine(null)}
                                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 dark:bg-gray-700 dark:hover:bg-gray-650 dark:text-gray-200 rounded-xl font-bold transition text-xs sm:text-sm"
                            >
                                İptal
                            </button>
                            <button
                                type="submit"
                                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition shadow-md shadow-blue-500/20 text-xs sm:text-sm"
                            >
                                Kaydet
                            </button>
                        </div>
                    </form>
                </Modal>
            )}

            {/* --- MODAL: TAM EKRAN RAPOR ÖNİZLEME --- */}
            {isFullScreenPreviewOpen && (
                <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl w-full max-w-5xl h-[90vh] shadow-2xl flex flex-col overflow-hidden border border-gray-200">
                        {/* Header */}
                        <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50 shrink-0">
                            <div>
                                <h3 className="text-base font-extrabold text-gray-900 flex items-center gap-1.5">
                                    <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse"></span>
                                    Periyodik Koruyucu Bakım Raporu Önizleme
                                </h3>
                                <p className="text-[10px] text-gray-500 mt-0.5">Yazdırılacak A4 Landscape formunun birebir dijital önizlemesi.</p>
                            </div>
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={handleDownloadPDF}
                                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center gap-1 transition active:scale-95 shadow-sm"
                                >
                                    <Printer className="w-3.5 h-3.5" /> PDF İndir
                                </button>
                                <button 
                                    onClick={() => setIsFullScreenPreviewOpen(false)}
                                    className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold rounded-xl text-xs transition active:scale-95"
                                >
                                    Kapat (✕)
                                </button>
                            </div>
                        </div>

                        {/* Printable Area Container */}
                        <div ref={containerRef} className="flex-1 bg-gray-100/50 flex items-center justify-center overflow-hidden p-4 relative">
                            <div 
                                style={{ 
                                    transform: `scale(${previewScale})`, 
                                    transformOrigin: 'center center', 
                                    backgroundColor: '#ffffff', 
                                    color: '#000000', 
                                    width: '1080px', 
                                    minWidth: '1080px', 
                                    flexShrink: 0 
                                }}
                                className="bg-white border border-gray-300 p-8 shadow-md rounded-2xl text-black transition-transform duration-150"
                            >
                                <EtkaReportContent 
                                    selectedMachine={sortedMachines.find(m => m.id === printMachineId)}
                                    selectedMonth={selectedMonth}
                                    printedLogs={printedLogs}
                                    tasks={tasks}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {/* --- MODAL: GİZLİ GEÇMİŞE DÖNÜK BAKIM GİRİŞİ --- */}
            {isHiddenAutoFillModalOpen && (
                <Modal
                    isOpen={isHiddenAutoFillModalOpen}
                    onClose={() => {
                        setIsHiddenAutoFillModalOpen(false);
                        setSelectedAutoMachineId('');
                        setSelectedAutoOperator(null);
                        setOperatorSearchQuery('');
                        setSelectedAutoMonth(new Date().toISOString().substring(0, 7));
                        setManualDate('');
                        setSelectedManualTaskIds([]);
                    }}
                    title="Geçmişe Dönük / Toplu Bakım Girişi"
                >
                    <div className="space-y-5">
                        {/* Tab Switcher */}
                        <div className="flex bg-gray-100 dark:bg-gray-700 p-1 rounded-xl">
                            <button
                                type="button"
                                onClick={() => setActiveFillType('auto')}
                                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                                    activeFillType === 'auto'
                                        ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-sm'
                                        : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'
                                }`}
                            >
                                Otomatik Doldur (Toplu)
                            </button>
                            <button
                                type="button"
                                onClick={() => setActiveFillType('manual')}
                                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                                    activeFillType === 'manual'
                                        ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-sm'
                                        : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'
                                }`}
                            >
                                Manuel Log Ekle (Tekil)
                            </button>
                        </div>

                        {/* Tezgah Seçimi */}
                        <div>
                            <label className="block text-xs font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5">
                                Tezgah Seçiniz
                            </label>
                            <select
                                value={selectedAutoMachineId}
                                onChange={(e) => {
                                    setSelectedAutoMachineId(e.target.value);
                                    setSelectedManualTaskIds([]);
                                }}
                                className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 font-semibold"
                                required
                            >
                                <option value="">Seçiniz...</option>
                                {sortedMachines.map(m => (
                                    <option key={m.id} value={m.id}>
                                        {m.ekBilgi ? `${m.name} (${m.ekBilgi})` : m.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Personel Arama ve Seçimi (Autocomplete) */}
                        <div className="relative">
                            <label className="block text-xs font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5">
                                Bakım Yapan Personel
                            </label>
                            <div className="flex gap-2">
                                <div className="relative flex-1">
                                    <input
                                        type="text"
                                        value={operatorSearchQuery}
                                        onChange={(e) => {
                                            setOperatorSearchQuery(e.target.value);
                                            setIsOperatorDropdownOpen(true);
                                            if (selectedAutoOperator && selectedAutoOperator.name !== e.target.value) {
                                                setSelectedAutoOperator(null);
                                            }
                                        }}
                                        onFocus={() => setIsOperatorDropdownOpen(true)}
                                        onBlur={() => {
                                            setTimeout(() => setIsOperatorDropdownOpen(false), 200);
                                        }}
                                        placeholder="Personel adı yazarak arayın..."
                                        className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 font-semibold"
                                    />
                                    {isOperatorDropdownOpen && filteredPersonnelList.length > 0 && (
                                        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl max-h-48 overflow-y-auto">
                                            {filteredPersonnelList.map(p => (
                                                <div
                                                    key={p.id}
                                                    onMouseDown={() => {
                                                        setSelectedAutoOperator(p);
                                                        setOperatorSearchQuery(p.name);
                                                        setIsOperatorDropdownOpen(false);
                                                    }}
                                                    className="px-4 py-2.5 cursor-pointer hover:bg-blue-50 dark:hover:bg-gray-700 border-b last:border-0 border-gray-100 dark:border-gray-700 text-sm font-bold text-gray-850 dark:text-gray-200"
                                                >
                                                    {p.name} ({p.role})
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                {selectedAutoOperator && (
                                    <div className="flex items-center px-4 bg-green-100 dark:bg-green-950/40 text-green-800 dark:text-green-300 rounded-xl border border-green-200 dark:border-green-800 text-xs font-bold shrink-0">
                                        ✓ Seçildi
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Otomatik Doldurma Parametreleri */}
                        {activeFillType === 'auto' && (
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5">
                                        Doldurulacak Ay Seçimi
                                    </label>
                                    <input
                                        type="month"
                                        value={selectedAutoMonth}
                                        onChange={(e) => setSelectedAutoMonth(e.target.value)}
                                        className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 font-semibold"
                                    />
                                </div>
                                <div className="p-3.5 bg-blue-50 dark:bg-blue-950/30 rounded-xl border border-blue-100 dark:border-blue-900 text-xs text-blue-700 dark:text-blue-300 font-bold leading-normal">
                                    ℹ️ Belirtilen tarih aralığındaki her gün için otomatik olarak bakım kayıtları oluşturulacaktır. Günlük periyotlar her güne, haftalık periyotlar Cuma günlerine, aylık periyotlar ayın 15'ine ve yıllık periyotlar Aralık 15'ine yerleştirilerek gerçekçi bir rapor geçmişi simüle edilecektir.
                                </div>
                                <button
                                    type="button"
                                    onClick={handleAutoFillLogs}
                                    disabled={isSaving}
                                    className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl font-bold text-sm transition shadow-lg"
                                >
                                    {isSaving ? "Kayıtlar Oluşturuluyor..." : "Otomatik Doldur ve Kaydet"}
                                </button>
                            </div>
                        )}

                        {/* Manuel Doldurma Parametreleri */}
                        {activeFillType === 'manual' && (
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5">
                                        Bakım Tarihi
                                    </label>
                                    <input
                                        type="date"
                                        value={manualDate}
                                        onChange={(e) => setManualDate(e.target.value)}
                                        className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 font-semibold"
                                    />
                                </div>

                                {selectedAutoMachineId && (
                                    <div>
                                        <label className="block text-xs font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5">
                                            Tamamlanan Bakım Görevleri
                                        </label>
                                        {activeMachineTasks.length === 0 ? (
                                            <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-250 dark:border-gray-700 text-center text-xs text-gray-500 font-semibold italic">
                                                Seçili tezgaha atanmış görev bulunamadı.
                                            </div>
                                        ) : (
                                            <div className="max-h-60 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-xl divide-y divide-gray-150 dark:divide-gray-700 bg-gray-50 dark:bg-gray-900/40 p-2 space-y-1">
                                                {activeMachineTasks.map(t => {
                                                    const isChecked = selectedManualTaskIds.includes(t.id);
                                                    return (
                                                        <label
                                                            key={t.id}
                                                            className="flex items-start gap-3 p-3 rounded-lg hover:bg-white dark:hover:bg-gray-800 transition cursor-pointer select-none"
                                                        >
                                                            <input
                                                                type="checkbox"
                                                                checked={isChecked}
                                                                onChange={(e) => {
                                                                    if (e.target.checked) {
                                                                        setSelectedManualTaskIds(prev => [...prev, t.id]);
                                                                    } else {
                                                                        setSelectedManualTaskIds(prev => prev.filter(id => id !== t.id));
                                                                    }
                                                                }}
                                                                className="mt-1 w-4.5 h-4.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                                            />
                                                            <div className="flex-1">
                                                                <p className="text-sm font-bold text-gray-800 dark:text-gray-200 leading-tight">{t.name}</p>
                                                                <span className={`inline-block mt-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${FREQUENCIES[t.frequency]?.color || 'bg-gray-100 text-gray-800 border-gray-200'}`}>
                                                                    {FREQUENCIES[t.frequency]?.label || t.frequency}
                                                                </span>
                                                            </div>
                                                        </label>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                )}

                                <button
                                    type="button"
                                    onClick={handleManualFillLogs}
                                    disabled={isSaving}
                                    className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl font-bold text-sm transition shadow-lg"
                                >
                                    {isSaving ? "Kaydediliyor..." : "Geçmişe Dönük Kayıt Ekle"}
                                </button>
                            </div>
                        )}
                    </div>
                </Modal>
            )}
        </div>
    );
};

export default MachineMaintenancePage;
