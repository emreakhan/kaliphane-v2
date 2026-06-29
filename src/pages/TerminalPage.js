// src/pages/TerminalPage.js

import React, { useState, useMemo, useEffect } from 'react';
import { LogIn, LogOut, PlayCircle, Hash, Settings, CheckCircle, ArrowLeft, PauseCircle, FastForward, Wrench, FileText, Clock, Activity } from 'lucide-react';
import { OPERATION_STATUS } from '../config/constants';
import PauseReasonModal from './PauseReasonModal';

const TerminalPage = ({ personnel, projects, machines, handleTerminalAction, isTerminalRole = false, onLogout, loggedInUser }) => {
    const [pin, setPin] = useState('');
    const [error, setError] = useState('');
    const [activeOperator, setActiveOperator] = useState(null); 
    const [selectedMachine, setSelectedMachine] = useState(null); 

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
            <div className="flex flex-col h-screen bg-gray-900 text-white p-6">
                <div className="flex justify-between items-center mb-6 border-b border-gray-700 pb-4">
                    <div className="flex items-center">
                        <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center text-xl font-bold mr-4">
                            {activeOperator.name.charAt(0)}
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold">Merhaba, {activeOperator.name}</h2>
                            <p className="text-gray-400">Çalışacağınız tezgahı seçiniz.</p>
                        </div>
                    </div>
                    <button onClick={handleLogout} className="bg-red-600 hover:bg-red-700 px-6 py-3 rounded-xl font-bold flex items-center shadow-lg transition">
                        <LogOut className="w-5 h-5 mr-2" /> ÇIKIŞ
                    </button>
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
            <div className="flex flex-col h-screen bg-gray-900 text-white p-6">
                <div className="flex justify-between items-center mb-6 border-b border-gray-700 pb-4 shrink-0">
                    <div className="flex items-center gap-4">
                        <button onClick={() => setSelectedMachine(null)} className="bg-gray-800 hover:bg-gray-700 p-3 rounded-lg border border-gray-600 transition">
                            <ArrowLeft className="w-6 h-6 text-gray-300" />
                        </button>
                        <div>
                            <h2 className="text-3xl font-bold text-white tracking-wide">{selectedMachine.name}</h2>
                            <p className="text-gray-400 flex items-center gap-2 mt-1">
                                <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse"></span>
                                Operatör: <span className="text-blue-400 font-semibold">{activeOperator.name}</span>
                            </p>
                        </div>
                    </div>
                    <button onClick={handleLogout} className="bg-red-600 hover:bg-red-700 px-6 py-3 rounded-xl font-bold flex items-center shadow-lg transition">
                        <LogOut className="w-5 h-5 mr-2" /> ÇIKIŞ
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar pb-10 space-y-8">
                    
                    {/* VARDİYA İŞLEMLERİ PANELİ */}
                    <div className="bg-gray-800/80 border border-gray-700 rounded-2xl p-5 flex flex-col md:flex-row justify-between items-center gap-4 shadow-lg shrink-0">
                        <div>
                            <h4 className="text-lg font-bold text-white flex items-center gap-2">
                                <Clock className="w-5 h-5 text-orange-500 animate-pulse" /> Vardiya Kontrolü
                            </h4>
                            <p className="text-xs text-gray-400 mt-1">
                                Günlük çalışma sürenizin hesaplanması için vardiya başlangıcında ve sonunda bu butonları kullanın.
                            </p>
                        </div>
                        <div className="flex gap-4 w-full md:w-auto">
                            <button
                                onClick={() => {
                                    onAction(null, null, null, 'SHIFT_START', { machineName: selectedMachine.name });
                                    alert("İş Başı / Vardiya başlangıcı kaydı başarıyla oluşturuldu.");
                                }}
                                className="flex-1 md:flex-initial bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white px-6 py-3.5 rounded-xl font-bold text-sm transition-all shadow-md flex items-center justify-center gap-2"
                            >
                                <PlayCircle className="w-4 h-4" /> İş Başı Yap
                            </button>
                            <button
                                onClick={() => {
                                    onAction(null, null, null, 'SHIFT_END', { machineName: selectedMachine.name });
                                    alert("Vardiya Sonu kaydı başarıyla oluşturuldu.");
                                }}
                                className="flex-1 md:flex-initial bg-orange-600 hover:bg-orange-700 active:bg-orange-800 text-white px-6 py-3.5 rounded-xl font-bold text-sm transition-all shadow-md flex items-center justify-center gap-2"
                            >
                                <FastForward className="w-4 h-4" /> Vardiya Sonu
                            </button>
                        </div>
                    </div>
                    
                    {/* AKTİF İŞLER */}
                    <div>
                        <h3 className="text-xl font-bold text-gray-300 mb-4 flex items-center"><Activity className="w-5 h-5 mr-2" /> Mevcut İş</h3>
                        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                            {tasksOnMachine.length === 0 ? (
                                <div className="col-span-full flex flex-col items-center justify-center text-gray-500 h-48 bg-gray-800/50 rounded-2xl border border-gray-700 border-dashed">
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
        
        (task.pauseHistory || []).forEach(p => {
            timeline.push({ name: `Duraklama (${p.reason})`, time: parseDate(p.pausedAt), type: 'PAUSE' });
            timeline.push({ name: 'Devam Edildi', time: parseDate(p.resumedAt), type: 'RESUME' });
        });
        
        if (task.lastPausedAt && mode === 'PAUSED') {
            timeline.push({ name: `Duraklama (${task.lastPauseReason || ''})`, time: parseDate(task.lastPausedAt), type: 'PAUSE' });
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
            
            displayList.push({ id: i, label, duration: durationSec, isCurrent: i === timeline.length - 1 });
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

                    {displayList.length > 1 && (
                        <div className="bg-gray-900/50 rounded-xl p-3 space-y-1.5 max-h-32 overflow-y-auto custom-scrollbar border border-gray-700/50 shadow-inner">
                            {displayList.slice(0, -1).map(item => (
                                <div key={item.id} className="flex justify-between items-center text-xs border-b border-gray-800/80 pb-1.5 px-1">
                                    <span className="text-gray-400 font-medium truncate pr-2">{item.label}</span>
                                    <span className="font-mono text-gray-300 font-bold bg-gray-800 px-2 py-0.5 rounded">{formatDuration(item.duration)}</span>
                                </div>
                            ))}
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
                <div className="p-6 grid grid-cols-3 gap-4 bg-gray-800">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => <button key={num} onClick={() => handleNumPadClick(num.toString())} className="h-20 rounded-2xl bg-gray-700 text-white text-3xl font-bold shadow-lg border-b-4 border-gray-900 active:border-b-0 active:translate-y-1">{num}</button>)}
                    <button onClick={handleClear} className="h-20 rounded-2xl bg-red-900/50 text-red-400 text-lg font-bold shadow-lg border-b-4 border-gray-900 active:border-b-0 active:translate-y-1">SİL</button>
                    <button onClick={() => handleNumPadClick('0')} className="h-20 rounded-2xl bg-gray-700 text-white text-3xl font-bold shadow-lg border-b-4 border-gray-900 active:border-b-0 active:translate-y-1">0</button>
                    <button onClick={handleLogin} className="h-20 rounded-2xl bg-green-600 text-white text-lg font-bold shadow-lg border-b-4 border-green-800 active:border-b-0 active:translate-y-1 flex items-center justify-center"><LogIn className="w-8 h-8" /></button>
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