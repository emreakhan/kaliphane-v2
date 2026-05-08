// src/pages/CamPlanningTab.js

import React, { useState, useMemo, useEffect } from 'react';
import { 
    Clock, Monitor, Layers, AlertCircle, CheckCircle2, Search, ChevronDown 
} from 'lucide-react';
import { doc, updateDoc } from '../config/firebase.js';
import { PROJECT_COLLECTION, OPERATION_STATUS } from '../config/constants.js';

const cleanStr = (str) => String(str || '').replace(/[^a-zA-Z0-9çğıöşüÇĞİÖŞÜ]/g, '').toLowerCase();

const CamPlanningTab = ({ projects, machines, db }) => {
    const [selectedMoldId, setSelectedMoldId] = useState('');
    
    // Akıllı arama state'leri
    const [searchMoldTerm, setSearchMoldTerm] = useState('');
    const [isMoldDropdownOpen, setIsMoldDropdownOpen] = useState(false);

    // Sadece tamamlanmamış kalıpları listele
    const activeMolds = useMemo(() => {
        return projects.filter(p => p.status !== 'TAMAMLANDI');
    }, [projects]);

    const selectedMold = useMemo(() => {
        return activeMolds.find(m => m.id === selectedMoldId) || null;
    }, [activeMolds, selectedMoldId]);

    // Seçim değiştiğinde input'a kalıp adını yaz
    useEffect(() => {
        if (selectedMoldId) {
            const mold = activeMolds.find(m => m.id === selectedMoldId);
            if (mold) setSearchMoldTerm(`${mold.moldName} - ${mold.projectCode}`);
        } else {
            setSearchMoldTerm('');
        }
    }, [selectedMoldId, activeMolds]);

    // Arama filtresi
    const filteredMolds = useMemo(() => {
        return activeMolds.filter(m => 
            m.moldName?.toLowerCase().includes(searchMoldTerm.toLowerCase()) || 
            m.projectCode?.toLowerCase().includes(searchMoldTerm.toLowerCase())
        );
    }, [activeMolds, searchMoldTerm]);

    // Seçili Kalıbın Toplam Öngörülen Süresi
    const moldTotalEstimatedTime = useMemo(() => {
        if (!selectedMold || !selectedMold.tasks) return 0;
        return selectedMold.tasks.reduce((total, task) => total + (parseFloat(task.estimatedCamTime) || 0), 0);
    }, [selectedMold]);

    // Tezgahların İş Yükü (Kuyruk + AKTİF ÇALIŞAN İŞLER)
    const machineBacklogs = useMemo(() => {
        const backlogs = machines.map(m => ({ 
            ...m, 
            totalHours: 0, 
            assignedTasks: [],
            activeTask: null
        }));

        projects.forEach(project => {
            if (project.status === 'TAMAMLANDI') return;
            
            project.tasks?.forEach(task => {
                let taskActiveMachineId = null;
                const estTime = parseFloat(task.estimatedCamTime) || 0;

                // 1. ADIM: Bu parçada aktif çalışan bir operasyon var mı kontrol et
                if (task.operations && Array.isArray(task.operations)) {
                    task.operations.forEach(op => {
                        const isWorking = op.status === OPERATION_STATUS.IN_PROGRESS || op.status === 'ÇALIŞIYOR';
                        if (isWorking) {
                            const opM1 = cleanStr(op.machineName);
                            const opM2 = cleanStr(op.machine);
                            const opM3 = cleanStr(op.assignedMachine);
                            const opM4 = cleanStr(op.machineId);

                            backlogs.forEach(m => {
                                const mNameClean = cleanStr(m.name);
                                const mIdClean = cleanStr(m.id);
                                if (op.machineName === m.name || opM1 === mNameClean || opM1 === mIdClean || opM2 === mNameClean || opM2 === mIdClean || opM3 === mNameClean || opM3 === mIdClean || opM4 === mNameClean || opM4 === mIdClean) {
                                    taskActiveMachineId = m.id;
                                    m.activeTask = {
                                        moldId: project.id,
                                        moldName: project.moldName,
                                        taskId: task.id,
                                        taskName: task.taskName,
                                        opName: op.name || op.type || 'Operasyon',
                                        estTime: estTime
                                    };
                                    // HATA DÜZELTİLDİ: Aktif işin süresi artık tezgahın toplam iş yüküne ekleniyor!
                                    m.totalHours += estTime; 
                                }
                            });
                        }
                    });
                }

                // 2. ADIM: Planlanmış Gelecek İşleri Kuyruğa Ekle
                const isTaskCompleted = task.operations?.every(op => op.status === 'COMPLETED') || false;
                
                if (task.plannedMachine && !isTaskCompleted) {
                    const targetMachine = backlogs.find(m => m.name === task.plannedMachine);
                    
                    // Eğer bu parça o tezgahta ŞU AN aktif olarak işleniyorsa, kuyrukta ayrıca göstermeyiz.
                    if (targetMachine && targetMachine.id !== taskActiveMachineId) {
                        targetMachine.totalHours += estTime;
                        targetMachine.assignedTasks.push({
                            moldId: project.id,
                            moldName: project.moldName,
                            taskId: task.id,
                            taskName: task.taskName,
                            time: estTime,
                            priority: project.priority || 999
                        });
                    }
                }
            });
        });

        // Görevleri Aciliyete Göre Sırala
        backlogs.forEach(m => {
            m.assignedTasks.sort((a, b) => a.priority - b.priority);
        });

        return backlogs;
    }, [projects, machines]);

    // Planlama İşlemi (Tezgaha Ata)
    const handleAssignToMachine = async (taskId, machineName) => {
        if (!selectedMold) return;
        try {
            const updatedTasks = selectedMold.tasks.map(t => {
                if (t.id === taskId) return { ...t, plannedMachine: machineName };
                return t;
            });
            await updateDoc(doc(db, PROJECT_COLLECTION, selectedMold.id), { tasks: updatedTasks });
        } catch (error) {
            console.error("Planlama hatası:", error);
            alert("Tezgah ataması yapılırken hata oluştu.");
        }
    };

    // Planlamadan Kaldır
    const handleRemoveFromMachine = async (moldId, taskId) => {
        try {
            const mold = projects.find(p => p.id === moldId);
            const updatedTasks = mold.tasks.map(t => {
                if (t.id === taskId) {
                    const newTask = { ...t };
                    delete newTask.plannedMachine; 
                    return newTask;
                }
                return t;
            });
            await updateDoc(doc(db, PROJECT_COLLECTION, moldId), { tasks: updatedTasks });
        } catch (error) {
            console.error("Planlama kaldırma hatası:", error);
        }
    };

    return (
        <div className="flex flex-col xl:flex-row gap-4 animate-in fade-in h-[calc(100vh-140px)]">
            
            {/* SOL PANEL: KALIP SEÇİMİ VE BEKLEYEN PARÇALAR */}
            <div className="w-full xl:w-1/3 flex flex-col gap-4">
                <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 shrink-0">
                    <h2 className="text-sm font-black text-gray-800 dark:text-white flex items-center mb-3 uppercase tracking-widest border-b dark:border-gray-700 pb-2">
                        <Layers className="w-4 h-4 mr-2 text-blue-500"/> Kalıp Seçimi
                    </h2>
                    
                    {/* YENİ: YAZARAK ARAMA YAPILABİLEN KALIP SEÇİMİ */}
                    <div className="relative">
                        <div className="relative">
                            <input 
                                type="text"
                                className="w-full p-2.5 pl-3 pr-8 border rounded-lg bg-gray-50 dark:bg-gray-900 font-bold text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 text-sm transition-all"
                                placeholder="Kalıp Adı veya Kodu Ara..."
                                value={searchMoldTerm}
                                onChange={e => {
                                    setSearchMoldTerm(e.target.value);
                                    setIsMoldDropdownOpen(true);
                                    if(selectedMoldId) setSelectedMoldId(''); // Yazmaya başlandığında seçimi temizle
                                }}
                                onFocus={() => setIsMoldDropdownOpen(true)}
                                onBlur={() => setTimeout(() => setIsMoldDropdownOpen(false), 200)}
                            />
                            <Search className="absolute right-3 top-3 w-4 h-4 text-gray-400 pointer-events-none" />
                        </div>

                        {isMoldDropdownOpen && (
                            <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl max-h-60 overflow-y-auto custom-scrollbar">
                                {filteredMolds.length > 0 ? (
                                    filteredMolds.map(m => (
                                        <div 
                                            key={m.id}
                                            onClick={() => {
                                                setSelectedMoldId(m.id);
                                                setIsMoldDropdownOpen(false);
                                            }}
                                            className="p-3 hover:bg-blue-50 dark:hover:bg-gray-700 cursor-pointer border-b last:border-b-0 border-gray-100 dark:border-gray-700 transition"
                                        >
                                            <div className="font-bold text-sm text-gray-800 dark:text-gray-200">{m.moldName}</div>
                                            <div className="text-[10px] text-gray-400 font-bold uppercase">{m.projectCode}</div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="p-4 text-gray-500 italic text-center text-sm font-medium">Kalıp bulunamadı...</div>
                                )}
                            </div>
                        )}
                    </div>

                    {selectedMold && (
                        <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-800 flex justify-between items-center">
                            <div className="text-[10px] font-bold text-blue-700 dark:text-blue-400 uppercase">Kalıbın Toplam CAM Yükü</div>
                            <div className="text-xl font-black text-blue-800 dark:text-blue-300 flex items-center">
                                {moldTotalEstimatedTime.toFixed(1)} <span className="text-[10px] font-bold ml-1 opacity-60">Saat</span>
                            </div>
                        </div>
                    )}
                </div>

                {selectedMold && (
                    <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 flex-1 overflow-hidden flex flex-col">
                        <h3 className="font-black text-gray-800 dark:text-white mb-3 uppercase text-xs tracking-widest border-b dark:border-gray-700 pb-2 shrink-0">
                            İş Parçaları ve Planlama
                        </h3>
                        
                        <div className="space-y-2 flex-1 overflow-y-auto custom-scrollbar pr-1">
                            {selectedMold.tasks?.map(task => {
                                const isAssigned = !!task.plannedMachine;
                                const estTime = parseFloat(task.estimatedCamTime) || 0;

                                return (
                                    <div key={task.id} className={`p-3 rounded-xl border ${isAssigned ? 'bg-green-50 border-green-200 dark:bg-green-900/10 dark:border-green-800' : 'bg-gray-50 border-gray-200 dark:bg-gray-900 dark:border-gray-700'}`}>
                                        <div className="flex justify-between items-start mb-2">
                                            <div>
                                                <div className="font-bold text-xs text-gray-900 dark:text-white">{task.taskName}</div>
                                                {estTime > 0 ? (
                                                    <div className="text-[10px] font-bold text-indigo-700 dark:text-indigo-400 mt-1 flex items-center bg-indigo-100 dark:bg-indigo-900/30 w-fit px-1.5 py-0.5 rounded">
                                                        <Clock className="w-3 h-3 mr-1"/> Öngörülen: {estTime} Saat
                                                    </div>
                                                ) : (
                                                    <div className="text-[10px] font-bold text-red-500 mt-1 flex items-center">
                                                        <AlertCircle className="w-3 h-3 mr-1"/> Süre Girilmemiş
                                                    </div>
                                                )}
                                            </div>
                                            {isAssigned && <CheckCircle2 className="w-4 h-4 text-green-500"/>}
                                        </div>

                                        {!isAssigned ? (
                                            <div className="flex gap-2">
                                                <select 
                                                    id={`machine-select-${task.id}`}
                                                    className="flex-1 p-1.5 text-xs font-bold border rounded-lg dark:bg-gray-800 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                                                    disabled={estTime === 0}
                                                >
                                                    <option value="">Tezgah Seç...</option>
                                                    {machines.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                                                </select>
                                                <button 
                                                    onClick={() => {
                                                        const sel = document.getElementById(`machine-select-${task.id}`);
                                                        if(sel.value) handleAssignToMachine(task.id, sel.value);
                                                    }}
                                                    disabled={estTime === 0}
                                                    className="px-3 py-1.5 bg-blue-600 text-white text-xs font-black rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
                                                >
                                                    PLANLA
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="flex justify-between items-center bg-white dark:bg-gray-800 p-1.5 rounded-lg border border-green-100 dark:border-green-800 shadow-sm">
                                                <div className="text-[10px] font-bold text-gray-800 dark:text-gray-200 flex items-center">
                                                    <Monitor className="w-3 h-3 mr-1 text-green-500"/> {task.plannedMachine}
                                                </div>
                                                <button 
                                                    onClick={() => handleRemoveFromMachine(selectedMold.id, task.id)}
                                                    className="text-[9px] font-black text-red-600 hover:text-red-800 bg-red-50 dark:bg-red-900/20 px-2 py-1 rounded transition"
                                                >
                                                    KALDIR
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                            {(!selectedMold.tasks || selectedMold.tasks.length === 0) && (
                                <div className="text-center text-gray-400 py-10 text-xs font-medium">Bu kalıba ait parça bulunmuyor.</div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* SAĞ PANEL: TEZGAH İŞ YÜKÜ LİSTESİ (Kompakt ve Aktif İş Göstergeli) */}
            <div className="w-full xl:w-2/3 bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 flex flex-col h-full">
                <h2 className="text-sm font-black text-gray-800 dark:text-white flex items-center mb-4 uppercase tracking-widest border-b dark:border-gray-700 pb-2 shrink-0">
                    <Monitor className="w-4 h-4 mr-2 text-indigo-500"/> Tüm Tezgahların Gelecek İş Yükü (Kuyruk)
                </h2>
                
                <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-2">
                    {machineBacklogs.map(machine => {
                        // 24 saate bölerek kaç günlük doluluk olduğunu bul
                        const daysLoaded = (machine.totalHours / 24).toFixed(1);

                        return (
                            <div key={machine.id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 flex flex-col lg:flex-row overflow-hidden hover:border-indigo-300 transition-colors shadow-sm">
                                
                                {/* Sol Kısım: Tezgah Bilgisi */}
                                <div className="lg:w-56 p-3 bg-gray-50 dark:bg-gray-900/50 border-b lg:border-b-0 lg:border-r border-gray-200 dark:border-gray-700 flex flex-col justify-center shrink-0">
                                    <div className="font-extrabold text-sm text-gray-900 dark:text-white mb-2 flex items-center uppercase tracking-tight">
                                        <Monitor className="w-4 h-4 mr-1.5 text-indigo-600" /> {machine.name}
                                    </div>
                                    <div className="flex gap-2">
                                        <div className="flex-1 bg-white dark:bg-gray-800 px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600">
                                            <div className="text-[9px] font-black text-gray-500 uppercase mb-0.5">İş Yükü</div>
                                            <div className="text-sm font-black text-indigo-700 dark:text-indigo-400">{machine.totalHours.toFixed(1)}s</div>
                                        </div>
                                        <div className="flex-1 bg-white dark:bg-gray-800 px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600">
                                            <div className="text-[9px] font-black text-gray-500 uppercase mb-0.5">Doluluk</div>
                                            <div className="text-sm font-black text-orange-600 dark:text-orange-400">{daysLoaded}g</div>
                                        </div>
                                    </div>
                                </div>

                                {/* Sağ Kısım: İş Parçaları (Yatay Kaydırma) */}
                                <div className="p-2 flex-1 flex gap-2 overflow-x-auto custom-scrollbar items-stretch bg-[#f8fafc] dark:bg-gray-800/30">
                                    
                                    {/* 1. AKTİF ÇALIŞAN İŞ */}
                                    {machine.activeTask && (
                                        <div className="min-w-[170px] max-w-[170px] bg-green-50 dark:bg-green-900/20 border-2 border-green-500 rounded-lg p-2 shadow-sm relative flex flex-col flex-shrink-0 justify-center">
                                            <div className="absolute -top-2 left-2 bg-green-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded flex items-center shadow-sm">
                                                <div className="w-1.5 h-1.5 bg-white rounded-full mr-1 animate-ping"></div>
                                                AKTİF İŞ
                                            </div>
                                            <div className="mt-2 flex-1 flex flex-col">
                                                <div className="text-[9px] font-bold text-green-700 dark:text-green-400 uppercase truncate mb-0.5" title={machine.activeTask.moldName}>{machine.activeTask.moldName}</div>
                                                <div className="text-xs font-black text-green-900 dark:text-green-100 leading-tight line-clamp-2" title={machine.activeTask.taskName}>{machine.activeTask.taskName}</div>
                                                <div className="mt-auto flex justify-between items-center pt-2">
                                                    <div className="text-[9px] font-bold text-green-600 dark:text-green-500 truncate">Op: {machine.activeTask.opName}</div>
                                                    <div className="text-[9px] font-black text-green-800 bg-green-200/50 dark:bg-green-900/50 px-1.5 py-0.5 rounded">{machine.activeTask.estTime}s</div>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Ayrım Çizgisi */}
                                    {machine.activeTask && machine.assignedTasks.length > 0 && (
                                        <div className="w-px bg-gray-300 dark:bg-gray-600 mx-0.5 flex-shrink-0"></div>
                                    )}

                                    {/* 2. KUYRUKTAKİ GELECEK İŞLER */}
                                    {machine.assignedTasks.length > 0 ? (
                                        machine.assignedTasks.map((t, idx) => (
                                            <div key={`${t.moldId}-${t.taskId}`} className="min-w-[160px] max-w-[160px] bg-white dark:bg-gray-700 p-2 rounded-lg border border-gray-200 dark:border-gray-600 shadow-sm relative group flex-shrink-0 flex flex-col justify-between hover:border-blue-300 transition-all">
                                                <div className="absolute top-0 left-0 w-1 h-full bg-blue-500 rounded-l-lg"></div>
                                                <div className="pl-1 flex-1">
                                                    <div className="text-[8px] font-black text-gray-500 uppercase bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded w-fit mb-1">{idx + 1}. SIRA</div>
                                                    <div className="text-[9px] font-bold text-blue-600 dark:text-blue-400 mb-0.5 truncate uppercase" title={t.moldName}>{t.moldName}</div>
                                                    <div className="font-bold text-xs text-gray-900 dark:text-gray-100 leading-tight line-clamp-2" title={t.taskName}>{t.taskName}</div>
                                                </div>
                                                <div className="mt-2 flex justify-between items-center border-t border-gray-100 dark:border-gray-600 pt-1.5 pl-1">
                                                    <span className="text-[9px] font-black text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-900/30 px-1.5 py-0.5 rounded border border-indigo-100 dark:border-indigo-800">{t.time} Saat</span>
                                                    <button 
                                                        onClick={() => handleRemoveFromMachine(t.moldId, t.taskId)}
                                                        className="text-[9px] text-red-600 dark:text-red-400 font-bold opacity-0 group-hover:opacity-100 transition px-1.5 py-0.5 bg-red-50 hover:bg-red-100 dark:bg-red-900/30 rounded"
                                                    >
                                                        Kaldır
                                                    </button>
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        !machine.activeTask && (
                                            <div className="flex items-center justify-center text-gray-400 opacity-60 px-4 text-xs font-bold w-full h-full min-h-[60px]">
                                                <CheckCircle2 className="w-4 h-4 mr-1.5"/> Tezgah Boş
                                            </div>
                                        )
                                    )}
                                </div>

                            </div>
                        );
                    })}
                </div>
            </div>
            
        </div>
    );
};

export default CamPlanningTab;