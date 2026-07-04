// src/pages/TerminalPage.js

import React, { useState, useMemo, useEffect } from 'react';
import { LogIn, LogOut, PlayCircle, Hash, Settings, CheckCircle, ArrowLeft, PauseCircle, FastForward, Wrench, FileText, Clock, Activity, Edit2 } from 'lucide-react';
import { OPERATION_STATUS, MACHINE_MAINTENANCE_TASKS_COLLECTION, MACHINE_MAINTENANCE_LOGS_COLLECTION } from '../config/constants';
import PauseReasonModal from './PauseReasonModal';
import Modal from '../components/Modals/Modal';
import { db, collection, query, orderBy, onSnapshot, doc, setDoc } from '../config/firebase.js';

const getPauseReasonText = (reason) => {
    if (!reason) return '';
    if (typeof reason === 'object') {
        const parts = [];
        if (reason.reason) parts.push(reason.reason);
        if (reason.description) parts.push(reason.description);
        return parts.join(' - ');
    }
    return reason;
};

const getDueMaintenanceTasks = (machineId, tasks, logs) => {
    if (!machineId || !tasks || tasks.length === 0) return [];
    
    const now = new Date();
    const todayStr = now.toISOString().substring(0, 10);
    const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, ..., 5 = Friday, 6 = Saturday
    const dayOfMonth = now.getDate();
    
    // Get ISO week number
    const getWeekNumber = (date) => {
        const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        const dayNum = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    };
    
    const currentWeek = getWeekNumber(now);
    const currentMonth = now.getMonth(); // 0-11
    const currentYear = now.getFullYear();

    const machineTasks = tasks.filter(t => t.machineIds?.includes('all') || t.machineIds?.includes(machineId));
    if (machineTasks.length === 0) return [];

    const dueTasks = [];

    // Helper functions to check if completed in current calendar period
    const isCompletedThisWeek = (taskId) => {
        return logs.some(l => {
            if (l.machineId !== machineId) return false;
            const logDate = new Date(l.timestamp);
            const logWeek = getWeekNumber(logDate);
            const logYear = logDate.getFullYear();
            const hasTask = (l.completedTasks || []).some(t => t.taskId === taskId);
            return hasTask && logWeek === currentWeek && logYear === currentYear;
        });
    };

    const isCompletedThisBiweek = (taskId) => {
        return logs.some(l => {
            if (l.machineId !== machineId) return false;
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
        return logs.some(l => {
            if (l.machineId !== machineId) return false;
            const logDate = new Date(l.timestamp);
            const logMonth = logDate.getMonth();
            const logYear = logDate.getFullYear();
            const hasTask = (l.completedTasks || []).some(t => t.taskId === taskId);
            return hasTask && logMonth === currentMonth && logYear === currentYear;
        });
    };

    const isCompletedThisYear = (taskId) => {
        return logs.some(l => {
            if (l.machineId !== machineId) return false;
            const logDate = new Date(l.timestamp);
            const logYear = logDate.getFullYear();
            const hasTask = (l.completedTasks || []).some(t => t.taskId === taskId);
            return hasTask && logYear === currentYear;
        });
    };

    const isCompletedToday = (taskId) => {
        return logs.some(l => 
            l.machineId === machineId && 
            l.date === todayStr && 
            (l.completedTasks || []).some(t => t.taskId === taskId)
        );
    };

    machineTasks.forEach(task => {
        if (task.frequency === 'DAILY') {
            // Daily tasks are due every day until completed today
            if (!isCompletedToday(task.id)) {
                dueTasks.push(task);
            }
        } else if (task.frequency === 'WEEKLY') {
            // Weekly tasks become active on Friday, Saturday, Sunday
            const isWeeklyTime = (dayOfWeek === 5 || dayOfWeek === 6 || dayOfWeek === 0);
            if (isWeeklyTime && !isCompletedThisWeek(task.id)) {
                dueTasks.push(task);
            }
        } else if (task.frequency === 'BIWEEKLY') {
            // Bi-weekly tasks become active starting on Friday of even calendar weeks
            const isWeeklyTime = (dayOfWeek === 5 || dayOfWeek === 6 || dayOfWeek === 0);
            const isEvenWeek = (currentWeek % 2 === 0);
            if (isWeeklyTime && isEvenWeek && !isCompletedThisBiweek(task.id)) {
                dueTasks.push(task);
            }
        } else if (task.frequency === 'MONTHLY') {
            // Monthly tasks become active starting on the 15th of the month
            const isMonthlyTime = (dayOfMonth >= 15);
            if (isMonthlyTime && !isCompletedThisMonth(task.id)) {
                dueTasks.push(task);
            }
        } else if (task.frequency === 'YEARLY') {
            // Yearly tasks become active starting on December 1st (month index 11)
            const isYearlyTime = (currentMonth === 11);
            if (isYearlyTime && !isCompletedThisYear(task.id)) {
                dueTasks.push(task);
            }
        }
    });

    return dueTasks;
};

const TerminalPage = ({ personnel, projects, machines, handleTerminalAction, handleUpdatePauseReason, isTerminalRole = false, onLogout, loggedInUser }) => {
    const [pin, setPin] = useState('');
    const [error, setError] = useState('');
    const [activeOperator, setActiveOperator] = useState(null); 
    const [selectedMachine, setSelectedMachine] = useState(null); 

    const [editingPauseItem, setEditingPauseItem] = useState(null);
    const [editReasonText, setEditReasonText] = useState('');

    const [hasShiftStartedToday, setHasShiftStartedToday] = useState(true);

    useEffect(() => {
        if (!activeOperator || !db) {
            setHasShiftStartedToday(true);
            return;
        }

        const nowIso = new Date().toISOString();
        const todayStr = nowIso.substring(0, 10); // YYYY-MM-DD

        const q = query(
            collection(db, 'artifacts/default-app-id/public/data/operatorShiftLogs'),
            orderBy('timestamp', 'desc')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const logs = [];
            snapshot.forEach(docSnapshot => {
                logs.push(docSnapshot.data());
            });

            // Filter for activeOperator name and today date with 'SHIFT_START'
            const hasStarted = logs.some(log => 
                log.operatorName === activeOperator.name && 
                log.date === todayStr && 
                log.action === 'SHIFT_START'
            );
            
            setHasShiftStartedToday(hasStarted);
        }, (error) => {
            console.error("Shift log subscription error:", error);
        });

        return () => unsubscribe();
    }, [activeOperator]);

    const [maintenanceTasks, setMaintenanceTasks] = useState([]);
    const [maintenanceLogs, setMaintenanceLogs] = useState([]);

    useEffect(() => {
        if (!activeOperator || !db) return;

        const unsubscribeTasks = onSnapshot(collection(db, MACHINE_MAINTENANCE_TASKS_COLLECTION), (snapshot) => {
            const list = [];
            snapshot.forEach(docSnapshot => {
                list.push({ id: docSnapshot.id, ...docSnapshot.data() });
            });
            setMaintenanceTasks(list);
        });

        const unsubscribeLogs = onSnapshot(collection(db, MACHINE_MAINTENANCE_LOGS_COLLECTION), (snapshot) => {
            const list = [];
            snapshot.forEach(docSnapshot => {
                list.push({ id: docSnapshot.id, ...docSnapshot.data() });
            });
            list.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            setMaintenanceLogs(list);
        });

        return () => {
            unsubscribeTasks();
            unsubscribeLogs();
        };
    }, [activeOperator]);

    const [checkedTasks, setCheckedTasks] = useState({});

    useEffect(() => {
        setCheckedTasks({});
    }, [selectedMachine]);

    const dueTasks = useMemo(() => {
        if (!selectedMachine) return [];
        return getDueMaintenanceTasks(selectedMachine.id, maintenanceTasks, maintenanceLogs);
    }, [selectedMachine, maintenanceTasks, maintenanceLogs]);

    const handleToggleTaskCheck = (taskId) => {
        setCheckedTasks(prev => ({
            ...prev,
            [taskId]: !prev[taskId]
        }));
    };

    const allChecked = useMemo(() => {
        return dueTasks.every(t => checkedTasks[t.id]);
    }, [dueTasks, checkedTasks]);

    // --- 🚨 KIOSK MODU: TARAYICI GERİ TUŞUNU ENGELLEME 🚨 ---
    useEffect(() => {
        window.history.pushState(null, null, window.location.href);
        const preventBackNavigation = () => {
            window.history.pushState(null, null, window.location.href);
        };
        window.addEventListener('popstate', preventBackNavigation);
        return () => {
            window.removeEventListener('popstate', preventBackNavigation);
        };
    }, []);
    // --------------------------------------------------------

    // Tezgah Operatörü olarak giriş yapılmışsa otomatik oturum aç
    useEffect(() => {
        if (loggedInUser && loggedInUser.role === 'Tezgah Operatörü') {
            const matchingPerson = (personnel || []).find(p => p.name === loggedInUser.name || p.id === loggedInUser.id);
            if (matchingPerson) {
                setActiveOperator(matchingPerson);
            } else {
                setActiveOperator({
                    id: loggedInUser.id || 'logged-in-op',
                    name: loggedInUser.name,
                    role: loggedInUser.role
                });
            }
        } else {
            if (!isTerminalRole) {
                setActiveOperator(null);
            }
        }
    }, [loggedInUser, personnel, isTerminalRole]);

    const handleNumPadClick = (num) => {
        if (pin.length < 4) {
            setPin(pin + num);
            setError('');
        }
    };

    const handleClear = () => { setPin(''); setError(''); };

    const handleLogin = () => {
        const operator = personnel.find(p => p.pinCode === pin);
        if (operator) { 
            setActiveOperator(operator); 
            setPin(''); 
            setError(''); 
        } else { 
            setError('Geçersiz PIN!'); 
            setPin(''); 
        }
    };

    const handleLogout = () => { 
        if (loggedInUser && loggedInUser.role === 'Tezgah Operatörü' && onLogout) {
            onLogout();
        } else {
            setActiveOperator(null); 
            setSelectedMachine(null); 
            setPin(''); 
        }
    };

    // --- TEZGAH SEÇİM EKRANI ---
    const MachineSelectionScreen = () => {
        const sortedMachines = useMemo(() => {
            const list = machines || [];
            return [...list].sort((a, b) => 
                a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
            );
        }, [machines]);

        return (
            <div className="flex flex-col min-h-screen bg-gray-900 text-white p-4 sm:p-6">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 border-b border-gray-700 pb-4">
                    <div className="flex items-center">
                        <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center text-xl font-bold mr-4 shrink-0">
                            {activeOperator.name.charAt(0)}
                        </div>
                        <div>
                            <h2 className="text-xl sm:text-2xl font-bold">Merhaba, {activeOperator.name}</h2>
                            <p className="text-xs sm:text-sm text-gray-400">Çalışacağınız tezgahı seçiniz.</p>
                        </div>
                    </div>
                    
                    {/* Sağ Üst Köşe Vardiya Kontrolleri ve Çıkış */}
                    <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
                        <button
                            onClick={() => {
                                handleTerminalAction(null, null, null, 'SHIFT_START', activeOperator.name, { machineName: 'Vardiya Girişi' });
                                alert("İş Başı / Vardiya başlangıcı kaydı başarıyla oluşturuldu.");
                            }}
                            className="flex-1 md:flex-initial bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all shadow-md flex items-center justify-center gap-1.5"
                        >
                            <PlayCircle className="w-4 h-4" /> İş Başı Yap
                        </button>
                        <button
                            onClick={() => {
                                handleTerminalAction(null, null, null, 'SHIFT_END', activeOperator.name, { machineName: 'Vardiya Çıkışı' });
                                alert("Vardiya Sonu kaydı başarıyla oluşturuldu.");
                            }}
                            className="flex-1 md:flex-initial bg-orange-600 hover:bg-orange-700 active:bg-orange-800 text-white px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all shadow-md flex items-center justify-center gap-1.5"
                        >
                            <FastForward className="w-4 h-4" /> Vardiya Sonu
                        </button>
                        <button 
                            onClick={handleLogout} 
                            className="flex-1 md:flex-initial bg-red-600 hover:bg-red-700 px-4 py-2.5 rounded-xl font-bold flex items-center justify-center shadow-lg transition text-xs sm:text-sm"
                        >
                            <LogOut className="w-4 h-4 mr-1.5" /> ÇIKIŞ
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                        {sortedMachines.length === 0 ? (
                            <p className="text-gray-500 col-span-full text-center py-10 text-lg">Sistemde kayıtlı tezgah bulunamadı.</p>
                        ) : (
                            sortedMachines.map(machine => (
                                <button 
                                    key={machine.id} 
                                    onClick={() => setSelectedMachine(machine)}
                                    className="bg-gray-800 hover:bg-blue-900 border border-gray-600 hover:border-blue-500 rounded-xl p-4 flex flex-col items-center justify-center transition-all shadow-md group min-h-[100px]"
                                >
                                    <span className="text-lg font-bold text-white group-hover:text-blue-200 text-center leading-tight">
                                        {machine.name}
                                    </span>
                                    <span className="text-xs text-gray-500 mt-1 group-hover:text-blue-300">
                                        {machine.type || 'Tezgah'}
                                    </span>
                                </button>
                            ))
                        )}
                    </div>
                </div>
            </div>
        );
    };

    // --- OPERASYON KONTROL PANELİ ---
    const OperatorDashboard = () => {
        const [isPauseModalOpen, setIsPauseModalOpen] = useState(false);
        const [jobToPause, setJobToPause] = useState(null);

        // GÜNCELLEME: Sadece en aktif/geçerli olan 1 İŞİ çekme mantığı
        const tasksOnMachine = useMemo(() => {
            const allAssigned = projects.flatMap(p => 
                p.tasks.flatMap(t => {
                    const isCamPaused = t.status === OPERATION_STATUS.PAUSED || t.status === 'PAUSED' || t.status === 'BEKLEMEDE';
                    if (isCamPaused) return [];

                    return (t.operations || []).filter(op => 
                        op.machineName === selectedMachine.name && 
                        (op.status === OPERATION_STATUS.IN_PROGRESS || op.status === OPERATION_STATUS.PAUSED)
                    ).map(op => ({ 
                        ...op, 
                        moldName: p.moldName, 
                        taskName: t.taskName, 
                        moldId: p.id, 
                        taskId: t.id 
                    }));
                })
            );

            // Sadece çalışan 1 adet işi bul
            let activeTask = allAssigned.find(op => op.status === OPERATION_STATUS.IN_PROGRESS);

            // Eğer çalışan yoksa, duraklatılanlar arasından "en son" duraklatılan 1 adet işi bul
            if (!activeTask) {
                activeTask = allAssigned.sort((a, b) => {
                    const timeA = new Date(a.lastPausedAt || a.startDate).getTime();
                    const timeB = new Date(b.lastPausedAt || b.startDate).getTime();
                    return timeB - timeA;
                }).find(op => op.status === OPERATION_STATUS.PAUSED);
            }

            return activeTask ? [activeTask] : [];
        }, [projects, selectedMachine]);

        // CAM Ön Hazırlığı bitmiş işler (Sıradaki işler)
        const preparedTasks = useMemo(() => {
            return projects.flatMap(p => 
                p.tasks.filter(t => 
                    t.camPreparation && 
                    t.camPreparation.status === 'HAZIRLANDI' && 
                    t.camPreparation.targetMachineId === selectedMachine.id
                ).map(t => ({
                    ...t, 
                    moldName: p.moldName, 
                    moldId: p.id
                }))
            );
        }, [projects, selectedMachine]);

        const onAction = (moldId, taskId, opId, action, reason = null) => {
            if (handleTerminalAction) {
                handleTerminalAction(moldId, taskId, opId, action, activeOperator.name, reason);
            }
        };

        const handleOpenPauseModal = (task) => {
            setJobToPause(task);
            setIsPauseModalOpen(true);
        };

        const handleSubmitPauseReason = (reason) => {
            if (jobToPause) {
                onAction(jobToPause.moldId, jobToPause.taskId, jobToPause.id, 'PAUSE_JOB', reason);
                setIsPauseModalOpen(false);
            }
        };

        return (
            <div className="flex flex-col min-h-screen bg-gray-900 text-white p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 border-b border-gray-700 pb-4 shrink-0">
                    <div className="flex items-center gap-4">
                        <button onClick={() => setSelectedMachine(null)} className="bg-gray-800 hover:bg-gray-700 p-3 rounded-lg border border-gray-600 transition">
                            <ArrowLeft className="w-6 h-6 text-gray-300" />
                        </button>
                        <div>
                            <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-wide">{selectedMachine.name}</h2>
                            <p className="text-xs sm:text-sm text-gray-400 flex items-center gap-2 mt-1">
                                <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse"></span>
                                Operatör: <span className="text-blue-400 font-semibold">{activeOperator.name}</span>
                            </p>
                        </div>
                    </div>
                    <button onClick={handleLogout} className="w-full sm:w-auto bg-red-600 hover:bg-red-700 px-6 py-3 rounded-xl font-bold flex items-center justify-center shadow-lg transition">
                        <LogOut className="w-5 h-5 mr-2" /> ÇIKIŞ
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar pb-10 space-y-8">
                    {/* AKTİF İŞLER */}
                    <div>
                        <h3 className="text-xl font-bold text-gray-300 mb-4 flex items-center"><Activity className="w-5 h-5 mr-2" /> Mevcut İş</h3>
                        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                            {tasksOnMachine.length === 0 ? (
                                <div className="col-span-full flex flex-col items-center justify-center text-gray-500 h-48 bg-gray-800/50 rounded-2xl border border-gray-700 border-dashed p-4 text-center">
                                    <Hash className="w-12 h-12 mb-3 opacity-20" />
                                    <p className="text-lg font-medium">CAM operatörü tarafından aktif edilmiş bir iş yok.</p>
                                </div>
                            ) : (
                                tasksOnMachine.map(task => (
                                    <TaskCard key={task.id} task={task} onAction={onAction} onPauseClick={handleOpenPauseModal} />
                                ))
                            )}
                        </div>
                    </div>

                    {/* CAM ÖN HAZIRLIĞI TAMAMLANMIŞ İŞLER */}
                    {preparedTasks.length > 0 && (
                        <div className="border-t border-gray-700 pt-8">
                            <h3 className="text-xl font-bold text-blue-400 mb-4 flex items-center">
                                <Settings className="w-6 h-6 mr-2" /> Sıradaki İşler (CAM Hazırlığı Tamamlanmış)
                            </h3>
                            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                                {preparedTasks.map(task => (
                                    <div key={task.id} className="bg-blue-900/20 border-2 border-blue-500/50 rounded-2xl p-6 relative shadow-lg">
                                        <div className="absolute top-4 right-4 bg-blue-600 text-white text-xs font-bold px-3 py-1 rounded shadow-sm">
                                            HAZIRLANDI
                                        </div>
                                        <h4 className="text-xl font-bold text-white mb-1">{task.moldName}</h4>
                                        <p className="text-blue-300 text-lg mb-4">{task.taskName}</p>
                                        
                                        {task.camPreparation.instructions && (
                                            <div className="mb-4 bg-gray-900/50 p-3 rounded-lg border border-gray-700">
                                                <div className="text-xs text-gray-400 font-bold mb-1 flex items-center"><FileText className="w-3 h-3 mr-1"/> Talimatlar / Notlar:</div>
                                                <p className="text-sm text-gray-200">{task.camPreparation.instructions}</p>
                                            </div>
                                        )}

                                        {task.camPreparation.requiredTools && task.camPreparation.requiredTools.length > 0 && (
                                            <div>
                                                <div className="text-xs text-gray-400 font-bold mb-2 flex items-center"><Wrench className="w-3 h-3 mr-1"/> Hazırlanacak Takımlar:</div>
                                                <ul className="space-y-1">
                                                    {task.camPreparation.requiredTools.map((tool, idx) => (
                                                        <li key={idx} className="bg-gray-800 text-gray-300 text-sm px-3 py-2 rounded flex justify-between items-center border border-gray-700">
                                                            <span>{tool.name} <span className="text-xs opacity-50 ml-1">({tool.productCode})</span></span>
                                                            {tool.notes && <span className="text-xs text-orange-400 ml-2 italic">{tool.notes}</span>}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                        <div className="mt-4 pt-4 border-t border-blue-800/50 text-xs text-blue-400 flex justify-between">
                                            <span>CAM Op: {task.camPreparation.preparedBy}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <PauseReasonModal 
                    isOpen={isPauseModalOpen}
                    onClose={() => setIsPauseModalOpen(false)}
                    onSubmit={handleSubmitPauseReason}
                />

                {/* Duraklatma Nedeni Düzenleme Modalı */}
                {editingPauseItem && (
                    <Modal 
                        isOpen={!!editingPauseItem} 
                        onClose={() => setEditingPauseItem(null)} 
                        title="Duraklatma Açıklamasını Düzenle"
                    >
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">
                                    Yeni Açıklama
                                </label>
                                <input 
                                    type="text" 
                                    value={editReasonText} 
                                    onChange={(e) => setEditReasonText(e.target.value)} 
                                    className="w-full p-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-orange-500 text-sm" 
                                    placeholder="Açıklama giriniz..."
                                    autoFocus
                                />
                            </div>
                            <div className="flex justify-end gap-3 pt-4 border-t dark:border-gray-700">
                                <button 
                                    onClick={() => setEditingPauseItem(null)} 
                                    className="px-4 py-2 text-gray-700 bg-gray-200 dark:bg-gray-600 dark:text-gray-200 rounded-lg font-medium hover:bg-gray-300 dark:hover:bg-gray-500"
                                >
                                    İptal
                                </button>
                                <button 
                                    onClick={() => {
                                        if (handleUpdatePauseReason) {
                                            handleUpdatePauseReason(
                                                editingPauseItem.moldId, 
                                                editingPauseItem.taskId, 
                                                editingPauseItem.opId, 
                                                editingPauseItem.index, 
                                                editReasonText.trim() || 'Belirtilmedi'
                                            );
                                        }
                                        setEditingPauseItem(null);
                                    }} 
                                    className="px-6 py-2 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-lg shadow-md transition-colors"
                                >
                                    Kaydet
                                </button>
                            </div>
                        </div>
                    </Modal>
                )}
            </div>
        );
    };

    // --- GÖREV KARTI & KRONOMETRE BİLEŞENİ ---
    const TaskCard = ({ task, onAction, onPauseClick }) => {
        const [currentTime, setCurrentTime] = useState(new Date());
        
        useEffect(() => {
            const timer = setInterval(() => setCurrentTime(new Date()), 1000);
            return () => clearInterval(timer);
        }, []);

        const parseDate = (dateStr) => {
            if (!dateStr) return new Date();
            let d = new Date(dateStr);
            if (!isNaN(d.getTime())) return d;
            
            const parts = dateStr.split(' ');
            if (parts.length === 2) {
                const [day, month, year] = parts[0].split('.');
                const [hour, min, sec] = parts[1].split(':');
                return new Date(year, month - 1, day, hour, min, sec);
            }
            return new Date();
        };

        const formatDuration = (totalSeconds) => {
            if (totalSeconds < 0) totalSeconds = 0;
            const h = Math.floor(totalSeconds / 3600);
            const m = Math.floor((totalSeconds % 3600) / 60);
            const s = totalSeconds % 60;
            return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        };

        const formatEventTime = (d) => {
            if (!d || isNaN(d.getTime())) return '';
            const day = String(d.getDate()).padStart(2, '0');
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const hours = String(d.getHours()).padStart(2, '0');
            const minutes = String(d.getMinutes()).padStart(2, '0');
            return `${day}.${month} ${hours}:${minutes}`;
        };

        let mode = 'WAITING'; 
        if (task.status === OPERATION_STATUS.PAUSED) {
            mode = 'PAUSED';
        } else if (task.status === OPERATION_STATUS.IN_PROGRESS) {
            if (task.productionStartTime) mode = 'PRODUCTION';
            else if (task.setupStartTime) mode = 'SETUP';
        } else if (task.setupStartTime && !task.productionStartTime) {
             mode = 'SETUP';
        }

        let timeline = [];
        if (task.setupStartTime) timeline.push({ name: 'Ayar Süresi', time: parseDate(task.setupStartTime), type: 'SETUP' });
        if (task.productionStartTime) timeline.push({ name: 'İmalat Süresi', time: parseDate(task.productionStartTime), type: 'PRODUCTION' });
        
        (task.pauseHistory || []).forEach((p, idx) => {
            timeline.push({ 
                name: `Duraklama (${getPauseReasonText(p.reason)})`, 
                time: parseDate(p.pausedAt), 
                type: 'PAUSE', 
                index: idx, 
                reason: p.reason,
                description: p.description || '' 
            });
            timeline.push({ name: 'Devam Edildi', time: parseDate(p.resumedAt), type: 'RESUME' });
        });
        
        if (task.lastPausedAt && mode === 'PAUSED') {
            timeline.push({ 
                name: `Duraklama (${getPauseReasonText(task.lastPauseReason)})`, 
                time: parseDate(task.lastPausedAt), 
                type: 'PAUSE', 
                index: 'current', 
                reason: task.lastPauseReason,
                description: task.lastPauseDescription || '' 
            });
        }
        
        timeline.sort((a, b) => a.time - b.time);
        
        const displayList = [];
        for (let i = 0; i < timeline.length; i++) {
            const current = timeline[i];
            const next = timeline[i + 1];
            const endTime = next ? next.time : currentTime;
            const durationSec = Math.max(0, Math.floor((endTime - current.time) / 1000));
            
            let label = current.name;
            if (current.type === 'RESUME') {
                const isProd = task.productionStartTime && parseDate(task.productionStartTime) < current.time;
                label = isProd ? 'İmalat Süresi (Devam)' : 'Ayar Süresi (Devam)';
            }
            
            displayList.push({ 
                id: i, 
                label, 
                duration: durationSec, 
                isCurrent: i === timeline.length - 1,
                type: current.type,
                index: current.index,
                reason: current.reason,
                description: current.description,
                startTime: current.time
            });
        }

        const currentAction = displayList.length > 0 ? displayList[displayList.length - 1] : null;

        let cardStyle = 'bg-gray-800 border-gray-600';
        let statusLabel = 'BEKLİYOR';
        let statusColor = 'bg-gray-700 text-gray-400';

        if (mode === 'PRODUCTION') {
            cardStyle = 'bg-gray-800 border-green-500';
            statusLabel = 'İMALAT SÜRÜYOR';
            statusColor = 'bg-green-900 text-green-300 animate-pulse';
        } else if (mode === 'SETUP') {
            cardStyle = 'bg-gray-800 border-yellow-500';
            statusLabel = 'AYAR YAPILIYOR';
            statusColor = 'bg-yellow-900 text-yellow-300';
        } else if (mode === 'PAUSED') {
            cardStyle = 'bg-gray-800 border-orange-500';
            statusLabel = 'DURAKLATILDI';
            statusColor = 'bg-orange-900 text-orange-300';
        }

        return (
            <div className={`p-6 rounded-2xl border-t-4 border-l-8 shadow-2xl transition-all relative flex flex-col ${cardStyle}`}>
                <div className="absolute top-4 right-4">
                    <span className={`px-3 py-1 rounded text-xs font-bold uppercase tracking-wider shadow-sm ${statusColor}`}>
                        {statusLabel}
                    </span>
                </div>

                <div className="mb-4 pr-20">
                    <h4 className="text-xl font-black text-white leading-tight mb-1">{task.moldName}</h4>
                    <p className="text-gray-300 text-lg font-bold">{task.taskName}</p>
                    <div className="mt-2 flex gap-2">
                        <span className="text-xs bg-blue-900/50 text-blue-200 font-bold px-2 py-1 rounded border border-blue-800 uppercase">
                            {task.type}
                        </span>
                    </div>
                </div>

                <div className="flex-1 flex flex-col mb-4">
                    {currentAction ? (
                        <div className="bg-black/40 rounded-xl p-4 mb-2 border border-gray-700 flex flex-col items-center justify-center shadow-inner">
                            <div className="text-gray-400 text-xs font-bold uppercase tracking-widest mb-1 flex items-center">
                                <Clock className="w-3 h-3 mr-1" /> {currentAction.label} (CANLI)
                            </div>
                            <div className="text-4xl font-mono font-black text-white tracking-widest drop-shadow-md">
                                {formatDuration(currentAction.duration)}
                            </div>
                        </div>
                    ) : (
                         <div className="bg-gray-900/30 rounded-xl p-4 mb-2 border border-gray-700 flex flex-col items-center justify-center opacity-50">
                            <Clock className="w-8 h-8 text-gray-500 mb-2" />
                            <div className="text-gray-500 text-xs font-bold uppercase tracking-widest">İşlem Başlamadı</div>
                        </div>
                    )}

                    {displayList.length > 0 && (
                        <div className="space-y-2 mt-4">
                            <h5 className="text-xs font-black text-gray-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                                <Clock className="w-3.5 h-3.5 text-blue-500" /> Parça Zaman Dağılımı (Sayaç Listesi)
                            </h5>
                            <div className="bg-gray-900/70 border border-gray-700/60 rounded-xl p-3.5 space-y-2.5 max-h-80 overflow-y-auto custom-scrollbar shadow-inner">
                                {displayList.map(item => {
                                    const isPause = item.type === 'PAUSE';
                                    const isCurrent = item.isCurrent;
                                    return (
                                        <div 
                                            key={item.id} 
                                            className="border-b border-gray-800 last:border-b-0 py-3 first:pt-0 last:pb-0"
                                        >
                                            <div 
                                                className={`flex justify-between items-center text-xs ${
                                                    isCurrent ? 'text-blue-300 font-bold' : 'text-gray-300'
                                                }`}
                                            >
                                                <div className="flex items-center gap-2 truncate pr-2">
                                                    <span className={`w-2 h-2 rounded-full shrink-0 ${
                                                        isPause ? 'bg-red-500 animate-pulse' : (isCurrent ? 'bg-blue-400 animate-pulse' : 'bg-green-500')
                                                    }`} />
                                                    <span className="text-[10px] text-gray-400 font-bold bg-gray-950/50 px-1.5 py-0.5 rounded shrink-0 font-mono">
                                                        {formatEventTime(item.startTime)}
                                                    </span>
                                                    <span className="truncate font-semibold">{item.label}</span>
                                                    {isPause && (
                                                        <button
                                                            onClick={() => {
                                                                setEditingPauseItem({
                                                                    moldId: task.moldId,
                                                                    taskId: task.taskId,
                                                                    opId: task.id,
                                                                    index: item.index,
                                                                    reason: item.reason,
                                                                    description: item.description
                                                                });
                                                                setEditReasonText(item.description || '');
                                                            }}
                                                            className="p-1 hover:bg-gray-800 rounded text-blue-400 hover:text-blue-300 transition shrink-0"
                                                            title="Açıklama Ekle / Düzenle"
                                                        >
                                                            <Edit2 className="w-3.5 h-3.5" />
                                                        </button>
                                                    )}
                                                </div>
                                                <span className={`font-mono font-black px-2.5 py-1 rounded text-xs sm:text-sm shrink-0 shadow-sm ${
                                                    isCurrent ? 'bg-blue-900/40 text-blue-300 border border-blue-800' : 'bg-gray-800 text-gray-200'
                                                }`}>
                                                    {formatDuration(item.duration)}
                                                    {isCurrent && <span className="text-[10px] text-blue-400 ml-1 font-bold">aktif</span>}
                                                </span>
                                            </div>
                                            {isPause && (
                                                <div className="text-[11px] text-gray-400 pl-4 mt-1 font-semibold flex items-center gap-1">
                                                    <span>Açıklama:</span>
                                                    {item.description ? (
                                                        <span className="text-gray-200 font-medium italic">"{item.description}"</span>
                                                    ) : (
                                                        <span className="text-gray-500 italic">Girilmedi</span>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>

                <div className="mt-auto space-y-3">
                    {mode === 'WAITING' && (
                        <button 
                            onClick={() => onAction(task.moldId, task.taskId, task.id, 'START_SETUP')} 
                            className="w-full bg-yellow-600 hover:bg-yellow-500 text-white font-bold py-4 rounded-xl text-lg shadow-lg flex items-center justify-center transition-transform active:scale-95"
                        >
                            <Settings className="w-6 h-6 mr-2" /> AYARA BAŞLA
                        </button>
                    )}

                    {mode === 'SETUP' && (
                        <div className="flex gap-3">
                            <button 
                                onClick={() => onPauseClick(task)}
                                className="flex-1 bg-orange-600 hover:bg-orange-500 text-white font-bold py-4 rounded-xl text-sm sm:text-base shadow-lg flex items-center justify-center transition-transform active:scale-95"
                            >
                                <PauseCircle className="w-5 h-5 mr-2" /> DURAKLAT
                            </button> 
                            
                            <button 
                                onClick={() => onAction(task.moldId, task.taskId, task.id, 'START_PRODUCTION')} 
                                className="flex-[1.5] bg-green-600 hover:bg-green-500 text-white font-bold py-4 rounded-xl text-sm sm:text-base shadow-lg flex items-center justify-center animate-pulse hover:animate-none transition-transform active:scale-95"
                            >
                                <PlayCircle className="w-5 h-5 mr-2" /> SERİYE AL
                            </button>
                        </div>
                    )}

                    {mode === 'PRODUCTION' && (
                        <div className="flex flex-col gap-2">
                            <div className="flex gap-3">
                                <button 
                                    onClick={() => {
                                        if(window.confirm("İmalat durdurulup yeniden ayar moduna geçilsin mi?"))
                                            onAction(task.moldId, task.taskId, task.id, 'START_SETUP');
                                    }} 
                                    className="flex-1 bg-yellow-600 hover:bg-yellow-500 text-white font-bold py-3.5 rounded-xl text-xs sm:text-sm shadow-lg flex items-center justify-center transition-transform active:scale-95"
                                >
                                    <Settings className="w-4 h-4 mr-1.5" /> YENİDEN AYAR
                                </button>
                                
                                <button 
                                    onClick={() => onPauseClick(task)}
                                    className="flex-1 bg-orange-600 hover:bg-orange-500 text-white font-bold py-3.5 rounded-xl text-xs sm:text-sm shadow-lg flex items-center justify-center transition-transform active:scale-95"
                                >
                                    <PauseCircle className="w-4 h-4 mr-1.5" /> DURAKLAT
                                </button> 
                            </div>
                            
                            <button 
                                onClick={() => { 
                                    if(window.confirm("Parça tamamlandı mı? İşlem yetkili onayına gönderilecek.")) 
                                        onAction(task.moldId, task.taskId, task.id, 'FINISH_JOB'); 
                                }} 
                                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-xl text-sm sm:text-base shadow-lg flex items-center justify-center transition-transform active:scale-95"
                            >
                                <CheckCircle className="w-5 h-5 mr-2" /> TAMAMLA
                            </button>
                        </div>
                    )}

                    {mode === 'PAUSED' && (
                        <button 
                            onClick={() => onAction(task.moldId, task.taskId, task.id, 'RESUME_JOB')} 
                            className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-4 rounded-xl text-lg shadow-lg flex items-center justify-center transition-transform active:scale-95"
                        >
                            <FastForward className="w-6 h-6 mr-2" /> DEVAM ET
                        </button>
                    )}
                </div>
            </div>
        );
    };

    if (activeOperator && !hasShiftStartedToday) {
        return (
            <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
                <div className="w-full max-w-md bg-gray-800 rounded-3xl shadow-2xl overflow-hidden border border-gray-700 p-8 text-center space-y-6">
                    <div className="w-20 h-20 bg-emerald-600/10 text-emerald-500 rounded-full flex items-center justify-center mx-auto border border-emerald-500/20">
                        <PlayCircle className="w-12 h-12" />
                    </div>
                    <div className="space-y-2">
                        <h2 className="text-2xl font-bold text-white tracking-wide">BUGÜN İŞ BAŞI YAPMADINIZ</h2>
                        <p className="text-gray-400 text-sm">
                            Merhaba <strong className="text-gray-200">{activeOperator.name}</strong>, sisteme erişip tezgahlarda işlem yapabilmek için öncelikle bugünkü Vardiya Başlangıcı (İş Başı Yap) kaydını oluşturmalısınız.
                        </p>
                    </div>

                    <button
                        onClick={async () => {
                            try {
                                await handleTerminalAction(null, null, null, 'SHIFT_START', activeOperator.name, { machineName: 'Vardiya Girişi' });
                                alert("İş Başı / Vardiya başlangıcı kaydı başarıyla oluşturuldu.");
                            } catch (e) {
                                console.error(e);
                                alert("Kayıt oluşturulurken bir hata oluştu.");
                            }
                        }}
                        className="w-full bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white py-4 rounded-2xl font-bold text-lg transition-all shadow-lg flex items-center justify-center gap-2 transform active:scale-95"
                    >
                        <PlayCircle className="w-6 h-6" /> İŞ BAŞI YAP
                    </button>

                    <button 
                        onClick={handleLogout} 
                        className="text-red-500 text-sm hover:text-red-400 font-bold transition flex items-center justify-center gap-1 mx-auto underline mt-4"
                    >
                        <LogOut className="w-4 h-4" /> Oturumu Kapat / İptal
                    </button>
                </div>
            </div>
        );
    }

    if (activeOperator && selectedMachine && dueTasks.length > 0) {
        return (
            <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
                <div className="w-full max-w-xl bg-gray-800 rounded-3xl shadow-2xl overflow-hidden border border-gray-700 p-6 sm:p-8 flex flex-col justify-between space-y-6">
                    <div className="flex justify-between items-start border-b border-gray-700 pb-4 shrink-0">
                        <div>
                            <h2 className="text-xl sm:text-2xl font-black text-white tracking-wide uppercase flex items-center gap-2">
                                <Wrench className="w-6 h-6 text-blue-500 animate-pulse" />
                                {selectedMachine.name} Periyodik Bakımı
                            </h2>
                            <p className="text-xs sm:text-sm text-gray-400 mt-1">
                                Tezgahı çalıştırmadan önce lütfen aşağıdaki bakım rutinlerini yerine getirin ve işaretleyin.
                            </p>
                        </div>
                        <button 
                            onClick={() => setSelectedMachine(null)}
                            className="bg-gray-700 hover:bg-gray-600 p-2.5 rounded-lg border border-gray-600 transition text-gray-300 shrink-0"
                        >
                            <ArrowLeft className="w-4 h-4" /> Geri
                        </button>
                    </div>

                    <div className="space-y-3 max-h-96 overflow-y-auto custom-scrollbar pr-1 flex-1">
                        {dueTasks.map(task => {
                            const isChecked = !!checkedTasks[task.id];
                            const freqLabel = task.frequency === 'DAILY' ? 'Günlük' :
                                              task.frequency === 'WEEKLY' ? 'Haftalık' :
                                              task.frequency === 'BIWEEKLY' ? '2 Haftalık' :
                                              task.frequency === 'MONTHLY' ? 'Aylık' : 'Yıllık';
                            const freqColor = task.frequency === 'DAILY' ? 'bg-emerald-950/40 text-emerald-450 border-emerald-900' :
                                              task.frequency === 'WEEKLY' ? 'bg-blue-950/40 text-blue-400 border-blue-900' : 'bg-purple-950/40 text-purple-400 border-purple-900';

                            return (
                                <button
                                    type="button"
                                    key={task.id}
                                    onClick={() => handleToggleTaskCheck(task.id)}
                                    className={`w-full p-4 rounded-2xl border text-left flex items-start gap-4 transition-all duration-155 ${
                                        isChecked
                                            ? 'bg-blue-950/20 border-blue-800 text-blue-300'
                                            : 'bg-gray-900/40 border-gray-700 hover:bg-gray-900/60 text-gray-350'
                                    }`}
                                >
                                    <div className="pt-0.5">
                                        <input
                                            type="checkbox"
                                            checked={isChecked}
                                            readOnly
                                            className="rounded border-gray-600 text-blue-600 focus:ring-blue-500 w-5 h-5 cursor-pointer"
                                        />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-black border uppercase tracking-wider mb-1.5 ${freqColor}`}>
                                            {freqLabel}
                                        </span>
                                        <p className={`text-sm font-bold ${isChecked ? 'line-through text-gray-500' : 'text-gray-200'}`}>
                                            {task.name}
                                        </p>
                                    </div>
                                </button>
                            );
                        })}
                    </div>

                    <button
                        onClick={async () => {
                            if (!allChecked) return;
                            const logId = `mlog-${Date.now()}`;
                            const logData = {
                                id: logId,
                                machineId: selectedMachine.id,
                                machineName: selectedMachine.ekBilgi ? `${selectedMachine.name} (${selectedMachine.ekBilgi})` : selectedMachine.name,
                                operatorName: activeOperator.name,
                                date: new Date().toISOString().substring(0, 10),
                                timestamp: new Date().toISOString(),
                                completedTasks: dueTasks.map(t => ({
                                    taskId: t.id,
                                    taskName: t.name,
                                    frequency: t.frequency
                                }))
                            };

                            try {
                                await setDoc(doc(db, MACHINE_MAINTENANCE_LOGS_COLLECTION, logId), logData);
                                alert("Tezgah bakımı başarıyla onaylandı ve kaydedildi. İyi çalışmalar!");
                            } catch (e) {
                                console.error(e);
                                alert("Bakım kaydı yüklenirken bir hata oluştu.");
                            }
                        }}
                        disabled={!allChecked}
                        className={`w-full py-4 rounded-2xl font-bold text-lg transition-all shadow-lg flex items-center justify-center gap-2 transform shrink-0 ${
                            allChecked
                                ? 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white active:scale-95 cursor-pointer'
                                : 'bg-gray-700 text-gray-500 cursor-not-allowed border border-gray-600'
                        }`}
                    >
                        <CheckCircle className="w-6 h-6" /> BAKIMI TAMAMLA VE İŞE BAŞLA
                    </button>
                </div>
            </div>
        );
    }

    if (activeOperator && selectedMachine) return <OperatorDashboard />;
    if (activeOperator) return <MachineSelectionScreen />;

    return (
        <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-gray-800 rounded-3xl shadow-2xl overflow-hidden border border-gray-700">
                <div className="bg-gray-900 p-8 text-center border-b border-gray-700">
                    <h1 className="text-2xl font-bold text-white mb-2 tracking-wide">TERMİNAL GİRİŞİ</h1>
                    <p className="text-gray-400 text-sm mb-6">Personel PIN Kodu Giriniz</p>
                    <div className="bg-black rounded-xl p-4 mb-2 flex justify-center items-center h-20 border-2 border-gray-600 relative">
                        {pin ? <span className="text-4xl font-mono text-blue-400 tracking-[1em] animate-pulse">{'*'.repeat(pin.length)}</span> : <span className="text-gray-600 text-xl animate-pulse">_ _ _ _</span>}
                    </div>
                    <div className={`h-6 text-sm font-bold transition-all ${error ? 'text-red-500 opacity-100' : 'opacity-0'}`}>{error}</div>
                </div>
                <div className="p-4 sm:p-6 grid grid-cols-3 gap-3 sm:gap-4 bg-gray-800">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => <button key={num} onClick={() => handleNumPadClick(num.toString())} className="h-16 sm:h-20 rounded-2xl bg-gray-700 text-white text-2xl sm:text-3xl font-bold shadow-lg border-b-4 border-gray-900 active:border-b-0 active:translate-y-1">{num}</button>)}
                    <button onClick={handleClear} className="h-16 sm:h-20 rounded-2xl bg-red-900/50 text-red-400 text-base sm:text-lg font-bold shadow-lg border-b-4 border-gray-900 active:border-b-0 active:translate-y-1">SİL</button>
                    <button onClick={() => handleNumPadClick('0')} className="h-16 sm:h-20 rounded-2xl bg-gray-700 text-white text-2xl sm:text-3xl font-bold shadow-lg border-b-4 border-gray-900 active:border-b-0 active:translate-y-1">0</button>
                    <button onClick={handleLogin} className="h-16 sm:h-20 rounded-2xl bg-green-600 text-white text-base sm:text-lg font-bold shadow-lg border-b-4 border-green-800 active:border-b-0 active:translate-y-1 flex items-center justify-center"><LogIn className="w-6 h-6 sm:w-8 sm:h-8" /></button>
                </div>
                <div className="bg-gray-900 p-4 text-center">
                    {isTerminalRole ? (
                        <button 
                            onClick={onLogout} 
                            className="text-red-500 text-sm hover:text-red-400 font-bold transition flex items-center justify-center gap-1 mx-auto underline"
                        >
                            <LogOut className="w-4 h-4" /> Güvenli Çıkış (Oturumu Kapat)
                        </button>
                    ) : (
                        <button 
                            onClick={() => { window.location.href = '/'; }} 
                            className="text-gray-500 text-sm hover:text-white transition underline"
                        >
                            Yönetici Paneline Dön
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default TerminalPage;