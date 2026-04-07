// src/pages/MachineQueuePage.js

import React, { useState, useEffect, useMemo } from 'react';
import { 
    Layers, Plus, GripVertical, Trash2, 
    MonitorPlay, Lock, Search, ChevronDown, Activity 
} from 'lucide-react';
import { collection, query, onSnapshot, doc, updateDoc, addDoc, deleteDoc } from '../config/firebase.js';
import { MACHINES_COLLECTION, PROJECT_COLLECTION, MACHINE_TASKS_COLLECTION, ROLES, OPERATION_STATUS } from '../config/constants.js';
import { getCurrentDateTimeString } from '../utils/dateUtils.js';

// --- YETKİ KONTROLLERİ ---
const BLOCKED_ROLES = [ROLES.CNC_TORNA_OPERATORU, ROLES.CNC_TORNA_SORUMLUSU, ROLES.TAKIMHANE_SORUMLUSU];
const EDIT_ROLES = [ROLES.ADMIN, ROLES.CAM_OPERATOR, ROLES.CAM_SORUMLUSU];

const TASK_STATUS = {
    WAITING: 'BEKLIYOR',
};

// --- ARAMALI AKILLI SEÇİM BİLEŞENİ ---
const SearchableSelect = ({ options, value, onChange, placeholder, disabled }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [filter, setFilter] = useState('');
    
    useEffect(() => {
        if (!isOpen) {
            const selected = options.find(o => o.value === value);
            setFilter(selected ? selected.label : '');
        }
    }, [value, isOpen, options]);

    const filteredOptions = options.filter(o => 
        (o.label || '').toLowerCase().includes(filter.toLowerCase()) || 
        (o.subLabel || '').toLowerCase().includes(filter.toLowerCase())
    );

    return (
        <div className="relative w-full">
            <div className="relative">
                <input 
                    type="text" 
                    disabled={disabled}
                    className={`block w-full rounded-lg border-gray-300 shadow-sm focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white pr-8 pl-3 py-2.5 text-sm font-bold ${disabled ? 'opacity-50 cursor-not-allowed bg-gray-100 dark:bg-gray-800' : 'bg-white dark:bg-gray-700'}`}
                    placeholder={placeholder} 
                    value={filter} 
                    onChange={(e) => { 
                        setFilter(e.target.value); 
                        setIsOpen(true); 
                        if(value) onChange(''); 
                    }} 
                    onFocus={() => {
                        setFilter(''); 
                        setIsOpen(true);
                    }} 
                    onBlur={() => {
                        setTimeout(() => setIsOpen(false), 200);
                    }} 
                />
                <Search className="absolute right-8 top-3 text-gray-400 w-4 h-4" />
                <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none">
                    {isOpen ? <ChevronDown className="w-4 h-4 rotate-180" /> : <ChevronDown className="w-4 h-4" />}
                </div>
            </div>
            {isOpen && !disabled && (
                <ul className="absolute z-[100] w-full mt-1 max-h-60 overflow-y-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-2xl">
                    {filteredOptions.length === 0 ? (
                        <li className="px-4 py-3 text-sm text-gray-500 text-center font-medium">Kayıt bulunamadı.</li>
                    ) : (
                        filteredOptions.map((opt) => (
                            <li 
                                key={opt.value} 
                                onMouseDown={(e) => { 
                                    e.preventDefault(); 
                                    onChange(opt.value); 
                                    setIsOpen(false); 
                                }} 
                                className="px-3 py-2.5 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 cursor-pointer text-sm border-b last:border-0 border-gray-100 dark:border-gray-700 flex flex-col"
                            >
                                <span className="font-bold text-gray-800 dark:text-gray-200">{opt.label}</span>
                                {opt.subLabel && <span className="text-[10px] text-gray-500 font-medium">{opt.subLabel}</span>}
                            </li>
                        ))
                    )}
                </ul>
            )}
        </div>
    );
};

const MachineQueuePage = ({ db, loggedInUser }) => {
    const [machines, setMachines] = useState([]);
    const [projects, setProjects] = useState([]);
    const [machineTasks, setMachineTasks] = useState([]);
    const [loading, setLoading] = useState(true);

    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [newTask, setNewTask] = useState({ projectId: '', partName: '', machineId: '' });
    const [isSaving, setIsSaving] = useState(false);

    const canView = !BLOCKED_ROLES.includes(loggedInUser.role);
    const canEdit = EDIT_ROLES.includes(loggedInUser.role);

    useEffect(() => {
        if (!db || !canView) return;

        const unsubMachines = onSnapshot(query(collection(db, MACHINES_COLLECTION)), (snap) => {
            setMachines(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => a.name.localeCompare(b.name)));
        });

        const unsubProjects = onSnapshot(query(collection(db, PROJECT_COLLECTION)), (snap) => {
            setProjects(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => b.createdAt?.localeCompare(a.createdAt)));
        });

        const unsubTasks = onSnapshot(query(collection(db, MACHINE_TASKS_COLLECTION)), (snap) => {
            setMachineTasks(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            setLoading(false);
        });

        return () => { unsubMachines(); unsubProjects(); unsubTasks(); };
    }, [db, canView]);

    // --- SADECE AKTİF ÇALIŞAN (IN_PROGRESS) İŞLERİ GETİRME ---
    const getActiveOperationForMachine = (machine) => {
        let workingOp = null;

        if (!projects || projects.length === 0) return null;

        const cleanStr = (str) => String(str || '').replace(/[^a-zA-Z0-9çğıöşüÇĞİÖŞÜ]/g, '').toLowerCase();
        const mNameClean = cleanStr(machine.name);
        const mIdClean = cleanStr(machine.id);

        projects.forEach(project => {
            if (project.tasks && Array.isArray(project.tasks)) {
                project.tasks.forEach(task => {
                    if (task.operations && Array.isArray(task.operations)) {
                        task.operations.forEach(op => {
                            // KESİN KURAL: Sadece ÇALIŞIYOR durumundakileri al
                            const isWorking = op.status === OPERATION_STATUS.IN_PROGRESS || op.status === 'ÇALIŞIYOR';
                            
                            if (isWorking) {
                                const matchExact = op.machineName === machine.name || op.machine === machine.name;
                                
                                const opM1 = cleanStr(op.machineName);
                                const opM2 = cleanStr(op.machine);
                                const opM3 = cleanStr(op.assignedMachine);
                                const opM4 = cleanStr(op.machineId);

                                if (matchExact || 
                                    (opM1 && (opM1 === mNameClean || opM1 === mIdClean)) ||
                                    (opM2 && (opM2 === mNameClean || opM2 === mIdClean)) ||
                                    (opM3 && (opM3 === mNameClean || opM3 === mIdClean)) ||
                                    (opM4 && (opM4 === mNameClean || opM4 === mIdClean))) {
                                    
                                    workingOp = {
                                        ...op,
                                        id: `real-${op.id}`,
                                        projectId: project.id,
                                        projectName: project.moldName,
                                        partName: task.taskName,
                                        opName: op.name || op.type || 'Operasyon',
                                        isFromRealProduction: true,
                                        camOperator: task.assignedOperator || op.assignedOperator || 'Bilinmiyor' 
                                    };
                                }
                            }
                        });
                    }
                });
            }
        });
        
        return workingOp;
    };

    // Modal Dropdown Mappings
    const projectOptions = useMemo(() => projects.map(p => ({
        value: p.id,
        label: p.moldName,
        subLabel: p.customer || 'Müşteri Belirtilmedi'
    })), [projects]);

    const partOptions = useMemo(() => {
        const selectedProj = projects.find(p => p.id === newTask.projectId);
        if (!selectedProj || !selectedProj.tasks) return [];
        return selectedProj.tasks.map(t => ({
            value: t.taskName, 
            label: t.taskName
        }));
    }, [newTask.projectId, projects]);

    const machineOptions = useMemo(() => machines.map(m => ({
        value: m.id,
        label: m.name,
        subLabel: (m.category && m.category.toLowerCase() !== 'tezgah') ? m.category : ''
    })), [machines]);

    const handleAddTask = async () => {
        if (!newTask.projectId || !newTask.partName || !newTask.machineId) {
            return alert("Lütfen proje, parça adı ve tezgah seçiniz!");
        }

        const proj = projects.find(p => p.id === newTask.projectId);
        setIsSaving(true);
        try {
            const machineWaitingTasks = machineTasks.filter(t => t.machineId === newTask.machineId && t.status === TASK_STATUS.WAITING);
            const maxOrder = machineWaitingTasks.length > 0 ? Math.max(...machineWaitingTasks.map(t => t.orderIndex || 0)) : 0;

            await addDoc(collection(db, MACHINE_TASKS_COLLECTION), {
                projectId: newTask.projectId,
                projectName: proj ? proj.moldName : '',
                partName: newTask.partName,
                machineId: newTask.machineId,
                status: TASK_STATUS.WAITING,
                orderIndex: maxOrder + 1,
                createdBy: loggedInUser.name,
                createdAt: getCurrentDateTimeString()
            });

            setIsAddModalOpen(false);
            setNewTask({ projectId: '', partName: '', machineId: '' });
        } catch (error) {
            console.error("İş eklenirken hata:", error);
            alert("İş eklenemedi!");
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteTask = async (taskId) => {
        if (!canEdit) return alert("Bu işlem için yetkiniz yok.");
        if (!window.confirm("Bu işi kuyruktan silmek istediğinize emin misiniz?")) return;
        try {
            await deleteDoc(doc(db, MACHINE_TASKS_COLLECTION, taskId));
        } catch (error) { console.error("Silme hatası", error); }
    };

    const handleDragStart = (e, task) => {
        if (!canEdit) { e.preventDefault(); return; }
        e.dataTransfer.setData('taskId', task.id);
        e.dataTransfer.setData('sourceMachineId', task.machineId);
    };

    const handleDragOver = (e) => {
        e.preventDefault(); 
    };

    const handleDrop = async (e, targetMachineId, targetOrderIndex) => {
        e.preventDefault();
        if (!canEdit) return;

        const draggedTaskId = e.dataTransfer.getData('taskId');
        const sourceMachineId = e.dataTransfer.getData('sourceMachineId');
        
        if (!draggedTaskId) return;

        const draggedTask = machineTasks.find(t => t.id === draggedTaskId);
        if (!draggedTask) return;

        let targetTasks = machineTasks
            .filter(t => t.machineId === targetMachineId && t.status === TASK_STATUS.WAITING && t.id !== draggedTaskId)
            .sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));

        targetTasks.splice(targetOrderIndex, 0, draggedTask);

        try {
            const updatePromises = targetTasks.map((t, index) => {
                const taskRef = doc(db, MACHINE_TASKS_COLLECTION, t.id);
                if (t.id === draggedTaskId && sourceMachineId !== targetMachineId) {
                    return updateDoc(taskRef, { orderIndex: index, machineId: targetMachineId });
                } else {
                    return updateDoc(taskRef, { orderIndex: index });
                }
            });
            await Promise.all(updatePromises);
        } catch (error) {
            console.error("Sıralama hatası:", error);
            alert("Sıralama güncellenemedi.");
        }
    };

    if (!canView) {
        return (
            <div className="flex flex-col items-center justify-center h-[70vh] text-center px-4">
                <div className="w-20 h-20 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-4 border border-red-200 dark:border-red-800">
                    <Lock className="w-10 h-10 text-red-500" />
                </div>
                <h2 className="text-2xl font-black text-gray-800 dark:text-white mb-2">Erişim Engellendi</h2>
                <p className="text-gray-500 dark:text-gray-400 max-w-md">Kullanıcı rolünüz <strong>({loggedInUser.role})</strong> bu sayfayı görüntülemek için yetkilendirilmemiştir.</p>
            </div>
        );
    }

    if (loading) return <div className="p-8 text-center text-gray-500 font-bold animate-pulse">İş kuyruğu yükleniyor...</div>;

    return (
        <div className="p-4 md:p-6 max-w-[1800px] mx-auto min-h-screen">
            
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-4 bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                <div>
                    <h1 className="text-2xl font-black text-gray-900 dark:text-white flex items-center tracking-tight">
                        <Layers className="w-6 h-6 mr-3 text-indigo-500" /> İş Akış Planı (Tezgah Kuyruğu)
                    </h1>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 font-medium">
                        Kalıp alt parçalarını tezgahlara atayın, sürükleyip bırakarak sırasını belirleyin.
                    </p>
                </div>
                
                {canEdit ? (
                    <button 
                        onClick={() => setIsAddModalOpen(true)}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-lg font-bold shadow-md shadow-indigo-200 dark:shadow-none transition-all flex items-center text-sm"
                    >
                        <Plus className="w-4 h-4 mr-2" /> Yeni İş Ata
                    </button>
                ) : (
                    <div className="px-4 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg text-xs text-gray-500 dark:text-gray-400 font-bold flex items-center border border-gray-200 dark:border-gray-600">
                        <Lock className="w-3 h-3 mr-2" /> Görüntüleme Modu
                    </div>
                )}
            </div>

            <div className="space-y-2">
                {machines.map((machine) => {
                    const machineJobs = machineTasks.filter(t => t.machineId === machine.id);
                    const waitingJobs = machineJobs.filter(t => t.status === TASK_STATUS.WAITING).sort((a,b) => (a.orderIndex || 0) - (b.orderIndex || 0));
                    
                    const workingJob = getActiveOperationForMachine(machine);

                    return (
                        <div key={machine.id} className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden flex flex-col xl:flex-row">
                            
                            <div 
                                className="xl:w-48 bg-gray-50 dark:bg-gray-900/80 p-2 border-b xl:border-b-0 xl:border-r border-gray-200 dark:border-gray-700 flex xl:flex-col justify-between items-center xl:items-start"
                                onDragOver={handleDragOver}
                                onDrop={(e) => handleDrop(e, machine.id, waitingJobs.length)} 
                            >
                                <div>
                                    {machine.category && machine.category.toLowerCase() !== 'tezgah' && (
                                        <div className="text-[9px] font-black text-gray-400 uppercase tracking-wider mb-0.5">{machine.category}</div>
                                    )}
                                    <h3 className="text-sm font-black text-gray-800 dark:text-white flex items-center truncate mt-0.5">
                                        <MonitorPlay className="w-4 h-4 mr-1.5 text-indigo-500 flex-shrink-0" /> {machine.name}
                                    </h3>
                                </div>
                                <div className="mt-0 xl:mt-2 text-[10px] font-bold text-gray-500 bg-white dark:bg-gray-800 px-2 py-1 rounded border border-gray-200 dark:border-gray-700">
                                    Planlanan: {waitingJobs.length}
                                </div>
                            </div>

                            <div className="flex-1 p-2 overflow-x-auto custom-scrollbar flex gap-2 items-stretch min-h-[90px] bg-[#f8fafc] dark:bg-[#0f172a]/50">
                                
                                {workingJob ? (
                                    <div className="min-w-[180px] w-[180px] bg-green-50 dark:bg-green-900/20 border-2 border-green-500 rounded-lg p-2 shadow-sm relative flex flex-col flex-shrink-0">
                                        <div className="absolute -top-2.5 left-2 bg-green-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded flex items-center shadow-sm">
                                            <div className="w-1.5 h-1.5 bg-white rounded-full mr-1 animate-ping"></div>
                                            CANLI ÜRETİM
                                        </div>
                                        <div className="mt-1.5 mb-1 flex-1">
                                            <div className="text-[9px] font-bold text-green-600 dark:text-green-400 uppercase truncate">{workingJob.projectName}</div>
                                            <div className="text-xs font-black text-green-900 dark:text-green-100 leading-tight line-clamp-2" title={workingJob.partName}>{workingJob.partName}</div>
                                            {workingJob.opName && <div className="text-[9px] font-bold text-green-700 dark:text-green-300 mt-0.5 truncate">Op: {workingJob.opName}</div>}
                                        </div>
                                        <div className="mt-auto pt-1.5 flex items-center justify-between border-t border-green-200 dark:border-green-800/50">
                                            <div className="text-[9px] font-bold text-green-700 dark:text-green-500 truncate w-full text-center">
                                                CAM: {workingJob.camOperator.split(' ')[0]} 
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="min-w-[160px] w-[160px] border border-dashed border-gray-300 dark:border-gray-700 rounded-lg p-2 flex flex-col items-center justify-center text-center flex-shrink-0 bg-white/50 dark:bg-gray-800/50">
                                        <Activity className="w-5 h-5 text-gray-300 dark:text-gray-600 mb-1" />
                                        <div className="text-[10px] font-bold text-gray-500 dark:text-gray-400">Tezgah Boş</div>
                                    </div>
                                )}

                                <div className="h-full w-px bg-gray-300 dark:bg-gray-700 mx-1 flex-shrink-0"></div>

                                {waitingJobs.map((task, index) => (
                                    <div 
                                        key={task.id}
                                        draggable={canEdit}
                                        onDragStart={(e) => handleDragStart(e, task)}
                                        onDragOver={handleDragOver}
                                        onDrop={(e) => handleDrop(e, machine.id, index)}
                                        className={`min-w-[160px] w-[160px] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-2 shadow-sm flex flex-col flex-shrink-0 group ${canEdit ? 'cursor-grab active:cursor-grabbing hover:border-indigo-400 dark:hover:border-indigo-500 hover:shadow-md' : 'cursor-default'} transition-all`}
                                    >
                                        <div className="flex justify-between items-start mb-1">
                                            <div className="bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-[9px] font-black px-1.5 py-0.5 rounded">
                                                {index + 1}. SIRA
                                            </div>
                                            {canEdit && (
                                                <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center text-gray-400">
                                                    <GripVertical className="w-3.5 h-3.5" />
                                                </div>
                                            )}
                                        </div>
                                        
                                        <div className="mb-2 flex-1">
                                            <div className="text-[9px] font-bold text-gray-400 uppercase truncate mb-0.5">{task.projectName}</div>
                                            <div className="text-xs font-bold text-gray-800 dark:text-gray-100 leading-tight line-clamp-2" title={task.partName}>{task.partName}</div>
                                        </div>

                                        <div className="mt-auto pt-1 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between">
                                            <div className="text-[8px] font-medium text-gray-400">{task.createdAt.split(' ')[0]}</div>
                                            
                                            {canEdit && (
                                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button onClick={() => handleDeleteTask(task.id)} className="p-1 bg-red-50 hover:bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded transition" title="Sıradan Çıkar">
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}

                                {canEdit && (
                                    <div 
                                        onDragOver={handleDragOver}
                                        onDrop={(e) => handleDrop(e, machine.id, waitingJobs.length)}
                                        className="min-w-[40px] flex-1 rounded-lg border-2 border-transparent hover:border-dashed hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors"
                                    ></div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {isAddModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md min-h-[480px] shadow-2xl flex flex-col">
                        
                        <div className="p-4 border-b dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900 rounded-t-2xl">
                            <h2 className="text-lg font-bold text-gray-800 dark:text-white">Tezgaha Yeni İş Ata</h2>
                            <button onClick={() => setIsAddModalOpen(false)} className="text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 p-1 rounded-md transition">✕</button>
                        </div>
                        
                        <div className="p-6 space-y-5 flex-1 relative">
                            <div>
                                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">1. Kalıp / Proje Seçin</label>
                                <SearchableSelect 
                                    options={projectOptions}
                                    value={newTask.projectId}
                                    onChange={(val) => {
                                        const proj = projects.find(p => p.id === val);
                                        setNewTask({ ...newTask, projectId: val, projectName: proj ? proj.moldName : '', partName: '' });
                                    }}
                                    placeholder="Proje veya Müşteri Ara..."
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">2. Alt Parça Seçin</label>
                                <SearchableSelect 
                                    options={partOptions}
                                    value={newTask.partName}
                                    onChange={(val) => setNewTask({ ...newTask, partName: val })}
                                    placeholder={newTask.projectId ? "Parça Ara..." : "Önce proje seçin"}
                                    disabled={!newTask.projectId}
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">3. İşleneceği Tezgah</label>
                                <SearchableSelect 
                                    options={machineOptions}
                                    value={newTask.machineId}
                                    onChange={(val) => setNewTask({ ...newTask, machineId: val })}
                                    placeholder="Tezgah Ara..."
                                />
                            </div>
                        </div>

                        <div className="p-4 flex justify-end gap-3 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-900 rounded-b-2xl">
                            <button onClick={() => setIsAddModalOpen(false)} className="px-5 py-2 text-gray-600 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 rounded-lg font-bold transition text-sm shadow-sm">İptal</button>
                            <button 
                                onClick={handleAddTask} 
                                disabled={isSaving || !newTask.projectId || !newTask.partName || !newTask.machineId} 
                                className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-md transition disabled:opacity-50 text-sm"
                            >
                                {isSaving ? 'Ekleniyor...' : 'Kuyruğa Ekle'}
                            </button>
                        </div>

                    </div>
                </div>
            )}
        </div>
    );
};

export default MachineQueuePage;