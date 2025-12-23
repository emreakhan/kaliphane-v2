// src/pages/TerminalPage.js

import React, { useState, useMemo } from 'react';
import { LogIn, LogOut, PlayCircle, Hash, Settings, CheckCircle, ArrowLeft, PauseCircle, FastForward } from 'lucide-react'; 
import { OPERATION_STATUS } from '../config/constants';

const TerminalPage = ({ personnel, projects, machines, handleTerminalAction }) => {
    const [pin, setPin] = useState('');
    const [error, setError] = useState('');
    const [activeOperator, setActiveOperator] = useState(null); 
    const [selectedMachine, setSelectedMachine] = useState(null); 

    // --- PIN GİRİŞ İŞLEMLERİ ---
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
        setActiveOperator(null); 
        setSelectedMachine(null); 
        setPin(''); 
    };

    // --- TEZGAH SEÇİM EKRANI (GÜNCELLENDİ: DAHA SADE VE SIRALI) ---
    const MachineSelectionScreen = () => {
        // Tezgahları isme göre doğal sıralama ile (örn: CNC-1, CNC-2, CNC-10) sırala
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
                    <button onClick={handleLogout} className="bg-red-600 hover:bg-red-700 px-6 py-3 rounded-xl font-bold flex items-center">
                        <LogOut className="w-5 h-5 mr-2" /> ÇIKIŞ
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto">
                    {/* Daha yoğun grid yapısı: Tek sayfada çok tezgah */}
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
                                    {/* İkonu kaldırdık, ismi öne çıkardık */}
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

    // --- OPERASYON KONTROL PANELİ (DASHBOARD) ---
    const OperatorDashboard = () => {
        const tasksOnMachine = useMemo(() => {
            return projects.flatMap(p => 
                p.tasks.flatMap(t => 
                    (t.operations || []).filter(op => 
                        op.machineName === selectedMachine.name && 
                        op.status !== OPERATION_STATUS.COMPLETED &&
                        op.status !== OPERATION_STATUS.WAITING_SUPERVISOR_REVIEW 
                    ).map(op => ({ 
                        ...op, 
                        moldName: p.moldName, 
                        taskName: t.taskName, 
                        moldId: p.id, 
                        taskId: t.id 
                    }))
                )
            );
        }, [projects, selectedMachine]);

        const onAction = (moldId, taskId, opId, action) => {
            if (handleTerminalAction) {
                handleTerminalAction(moldId, taskId, opId, action, activeOperator.name);
            }
        };

        return (
            <div className="flex flex-col h-screen bg-gray-900 text-white p-6">
                {/* ÜST BAR */}
                <div className="flex justify-between items-center mb-6 border-b border-gray-700 pb-4">
                    <div className="flex items-center gap-4">
                        <button onClick={() => setSelectedMachine(null)} className="bg-gray-800 hover:bg-gray-700 p-3 rounded-lg border border-gray-600 transition">
                            <ArrowLeft className="w-6 h-6 text-gray-300" />
                        </button>
                        <div>
                            <h2 className="text-3xl font-bold text-white tracking-wide">{selectedMachine.name}</h2>
                            <p className="text-gray-400 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-green-500"></span>
                                Operatör: <span className="text-blue-400 font-semibold">{activeOperator.name}</span>
                            </p>
                        </div>
                    </div>
                    <button onClick={handleLogout} className="bg-red-600 hover:bg-red-700 px-6 py-3 rounded-xl font-bold flex items-center transition">
                        <LogOut className="w-5 h-5 mr-2" /> ÇIKIŞ
                    </button>
                </div>

                {/* İŞ LİSTESİ */}
                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6 overflow-y-auto pb-20">
                    {tasksOnMachine.length === 0 ? (
                        <div className="col-span-full flex flex-col items-center justify-center text-gray-500 h-96">
                            <Hash className="w-20 h-20 mb-6 opacity-20" />
                            <p className="text-2xl font-medium">Bu tezgahta bekleyen veya çalışan iş yok.</p>
                            <p className="text-sm mt-2 opacity-60">CAM operatörünün iş atamasını bekleyiniz.</p>
                        </div>
                    ) : (
                        tasksOnMachine.map(task => (
                            <TaskCard key={task.id} task={task} onAction={onAction} />
                        ))
                    )}
                </div>
            </div>
        );
    };

    // --- GÖREV KARTI BİLEŞENİ ---
    const TaskCard = ({ task, onAction }) => {
        let mode = 'WAITING'; 
        
        if (task.status === OPERATION_STATUS.PAUSED) {
            mode = 'PAUSED';
        } else if (task.status === OPERATION_STATUS.IN_PROGRESS) {
            if (task.productionStartTime) mode = 'PRODUCTION';
            else if (task.setupStartTime) mode = 'SETUP';
        } else if (task.setupStartTime && !task.productionStartTime) {
             mode = 'SETUP';
        }

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
            <div className={`p-6 rounded-2xl border-l-8 shadow-2xl transition-all relative overflow-hidden ${cardStyle}`}>
                <div className="absolute top-4 right-4">
                    <span className={`px-3 py-1 rounded text-xs font-bold uppercase tracking-wider shadow-sm ${statusColor}`}>
                        {statusLabel}
                    </span>
                </div>

                <div className="mb-6 pr-20">
                    <h4 className="text-xl font-bold text-white leading-tight mb-1">{task.moldName}</h4>
                    <p className="text-gray-400 text-lg">{task.taskName}</p>
                    <div className="mt-2 flex gap-2">
                        <span className="text-xs bg-blue-900/50 text-blue-200 px-2 py-1 rounded border border-blue-800">
                            {task.type}
                        </span>
                    </div>
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
                        <button 
                            onClick={() => onAction(task.moldId, task.taskId, task.id, 'START_PRODUCTION')} 
                            className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-4 rounded-xl text-lg shadow-lg flex items-center justify-center animate-pulse hover:animate-none transition-transform active:scale-95"
                        >
                            <PlayCircle className="w-6 h-6 mr-2" /> SERİYE AL (BAŞLA)
                        </button>
                    )}

                    {mode === 'PRODUCTION' && (
                        <div className="flex gap-3">
                            <button 
                                onClick={() => onAction(task.moldId, task.taskId, task.id, 'PAUSE_JOB')}
                                className="flex-1 bg-orange-600 hover:bg-orange-500 text-white font-bold py-4 rounded-xl text-lg shadow-lg flex items-center justify-center transition-transform active:scale-95"
                            >
                                <PauseCircle className="w-6 h-6 mr-2" /> DURAKLAT
                            </button> 
                            
                            <button 
                                onClick={() => { 
                                    if(window.confirm("Parça tamamlandı mı? İşlem yetkili onayına gönderilecek.")) 
                                        onAction(task.moldId, task.taskId, task.id, 'FINISH_JOB'); 
                                }} 
                                className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-xl text-lg shadow-lg flex items-center justify-center transition-transform active:scale-95"
                            >
                                <CheckCircle className="w-6 h-6 mr-2" /> TAMAMLA
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
                    <button onClick={() => { localStorage.removeItem('kaliphane_user'); window.location.href = '/'; }} className="text-gray-500 text-sm hover:text-white transition underline">Yönetici Paneline Dön</button>
                </div>
            </div>
        </div>
    );
};

export default TerminalPage;