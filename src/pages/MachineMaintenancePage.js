import React, { useState, useEffect, useMemo } from 'react';
import { 
    Plus, Trash2, Edit2, Settings, ClipboardList, Calendar, 
    CheckCircle, AlertTriangle, Monitor, Search, ChevronRight, Printer 
} from 'lucide-react';
import { 
    db, collection, onSnapshot, doc, setDoc, deleteDoc 
} from '../config/firebase.js';
import { 
    MACHINE_MAINTENANCE_TASKS_COLLECTION, 
    MACHINE_MAINTENANCE_LOGS_COLLECTION 
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
    const [printStartDate, setPrintStartDate] = useState(() => {
        const d = new Date();
        d.setDate(d.getDate() - 7);
        return d.toISOString().substring(0, 10);
    });
    const [printEndDate, setPrintEndDate] = useState(() => {
        return new Date().toISOString().substring(0, 10);
    });
    const [printMachineId, setPrintMachineId] = useState('');

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
                    margin: 12mm 15mm 12mm 15mm;
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
                    .print-page-break {
                        page-break-after: always !important;
                        break-after: page !important;
                        margin-bottom: 20px;
                    }
                    table {
                        border-collapse: collapse !important;
                        width: 100% !important;
                        table-layout: auto !important;
                    }
                    th, td {
                        border: 1px solid #000 !important;
                        padding: 6px 8px !important;
                        color: black !important;
                        font-size: 11px !important;
                    }
                }
                @media screen {
                    .print-only {
                        display: none !important;
                    }
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
                                            <div>
                                                <h3 className="font-extrabold text-lg text-gray-900 dark:text-white">{item.name}</h3>
                                                {item.ekBilgi && (
                                                    <span className="text-xs text-blue-600 dark:text-blue-400 font-semibold">{item.ekBilgi}</span>
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
                                    {/* Start Date */}
                                    <div>
                                        <label className="block text-[10px] font-extrabold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider">Başlangıç Tarihi</label>
                                        <input
                                            type="date"
                                            value={printStartDate}
                                            onChange={(e) => setPrintStartDate(e.target.value)}
                                            className="p-2 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 text-xs font-semibold"
                                        />
                                    </div>

                                    {/* Bitiş Tarihi */}
                                    <div>
                                        <label className="block text-[10px] font-extrabold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider">Bitiş Tarihi</label>
                                        <input
                                            type="date"
                                            value={printEndDate}
                                            onChange={(e) => setPrintEndDate(e.target.value)}
                                            className="p-2 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 text-xs font-semibold"
                                        />
                                    </div>
                                </div>

                                <button
                                    onClick={handleDownloadPDF}
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-6 py-2.5 rounded-xl text-sm transition shadow-md shadow-emerald-500/20 flex items-center justify-center gap-1.5 active:scale-95 shrink-0 self-end h-[42px]"
                                >
                                    <Printer className="w-4 h-4" /> PDF Raporu İndir
                                </button>
                            </div>

                            {/* Print Preview Canvas (Forces white background/black text) */}
                            <div className="flex-1 overflow-y-auto custom-scrollbar p-1 no-print">
                                <div 
                                    id="maintenance-report-pdf-content" 
                                    style={{ backgroundColor: '#ffffff', color: '#000000' }}
                                    className="bg-white rounded-2xl border border-gray-250 p-8 shadow-sm text-black w-full"
                                >
                                    {printedLogs.length === 0 ? (
                                        <div className="text-center py-16 text-gray-400 italic">
                                            Seçilen tarih aralığında bu tezgah için bakım kaydı bulunmuyor.
                                        </div>
                                    ) : (
                                        <div className="flex flex-col text-black">
                                            {/* ETKA-D PDF Header */}
                                            <div className="mb-8 border-b-2 border-black pb-4 text-center">
                                                <h1 className="text-2xl font-black uppercase tracking-widest text-black">ETKA-D</h1>
                                                <h2 className="text-sm font-extrabold uppercase tracking-widest text-black mt-1">TEZGAH PERİYODİK BAKIM RAPORU</h2>
                                                <h3 className="text-md font-black text-blue-800 uppercase mt-2">
                                                    TEZGAH: {sortedMachines.find(m => m.id === printMachineId)?.name} 
                                                    {sortedMachines.find(m => m.id === printMachineId)?.ekBilgi && ` (${sortedMachines.find(m => m.id === printMachineId)?.ekBilgi})`}
                                                </h3>
                                                <p className="text-xs text-black/60 mt-1 font-bold">
                                                    Rapor Tarih Aralığı: {new Date(printStartDate).toLocaleDateString('tr-TR')} - {new Date(printEndDate).toLocaleDateString('tr-TR')}
                                                </p>
                                            </div>

                                            <div className="overflow-x-auto flex-1">
                                                <table className="w-full text-left border-collapse border border-black">
                                                    <thead>
                                                        <tr className="bg-gray-100 border-b border-black text-xs font-black text-black uppercase tracking-wider">
                                                            <th className="px-4 py-3 border border-black w-48">Tarih</th>
                                                            <th className="px-4 py-3 border border-black w-56">Bakımı Yapan Operatör</th>
                                                            <th className="px-4 py-3 border border-black">Yapılan Kontroller</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-black text-xs font-bold text-black">
                                                        {printedLogs.map(log => (
                                                            <tr key={log.id}>
                                                                <td className="px-4 py-3 border border-black font-extrabold">
                                                                    {new Date(log.timestamp).toLocaleDateString('tr-TR')}
                                                                </td>
                                                                <td className="px-4 py-3 border border-black font-extrabold">
                                                                    {log.operatorName}
                                                                </td>
                                                                <td className="px-4 py-3 border border-black">
                                                                    <div className="space-y-3 text-black">
                                                                        {(() => {
                                                                            const taskGroups = {};
                                                                            (log.completedTasks || []).forEach(t => {
                                                                                const freq = t.frequency || 'DAILY';
                                                                                if (!taskGroups[freq]) taskGroups[freq] = [];
                                                                                taskGroups[freq].push(t.taskName);
                                                                            });

                                                                            const frequencyLabels = {
                                                                                DAILY: 'Günlük Kontroller',
                                                                                WEEKLY: 'Haftalık Kontroller',
                                                                                TWO_WEEKS: '2 Haftalık Kontroller',
                                                                                MONTHLY: 'Aylık Kontroller',
                                                                                YEARLY: 'Yıllık Kontroller'
                                                                            };

                                                                            const definedFrequencies = ['DAILY', 'WEEKLY', 'TWO_WEEKS', 'MONTHLY', 'YEARLY'];

                                                                            return definedFrequencies.map(freq => {
                                                                                const items = taskGroups[freq];
                                                                                if (!items || items.length === 0) return null;
                                                                                return (
                                                                                    <div key={freq} className="text-xs">
                                                                                        <div className="font-black text-[10.5px] text-blue-900 border-b border-gray-250 pb-0.5 mb-1 uppercase tracking-wider">
                                                                                            {frequencyLabels[freq]}
                                                                                        </div>
                                                                                        <ul className="list-disc list-inside space-y-0.5 font-bold pl-1">
                                                                                            {items.map((name, i) => (
                                                                                                <li key={i} className="text-gray-800">{name}</li>
                                                                                            ))}
                                                                                        </ul>
                                                                                    </div>
                                                                                );
                                                                            });
                                                                        })()}
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>

                                            {/* Sign-off signatures */}
                                            <div className="mt-12 grid grid-cols-2 gap-8 text-center text-xs font-black text-black pt-6 border-t-2 border-black">
                                                <div className="space-y-8">
                                                    <p className="border-t border-black pt-2 uppercase">Kalıphane Bakım Sorumlusu / İmza</p>
                                                </div>
                                                <div className="space-y-8">
                                                    <p className="border-t border-black pt-2 uppercase">Kalıphane Bölüm Müdürü / İmza</p>
                                                </div>
                                            </div>
                                        </div>
                                    )}
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
        </div>
    );
};

export default MachineMaintenancePage;
