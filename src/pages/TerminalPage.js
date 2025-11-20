// src/pages/TerminalPage.js

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogIn, LogOut, PlayCircle, Hash, Settings, CheckCircle } from 'lucide-react'; 
import { OPERATION_STATUS } from '../config/constants';

const TerminalPage = ({ personnel, projects, machines, handleTerminalAction }) => {
    const navigate = useNavigate();
    const [pin, setPin] = useState('');
    const [error, setError] = useState('');
    const [activeOperator, setActiveOperator] = useState(null); 

    const handleNumPadClick = (num) => {
        if (pin.length < 4) {
            setPin(pin + num);
            setError('');
        }
    };

    const handleClear = () => { setPin(''); setError(''); };

    const handleLogin = () => {
        const operator = personnel.find(p => p.pinCode === pin);
        if (operator) { setActiveOperator(operator); setPin(''); setError(''); } 
        else { setError('Geçersiz PIN!'); setPin(''); }
    };

    const handleLogout = () => { setActiveOperator(null); setPin(''); };

    const OperatorDashboard = () => {
        const myTasks = projects.flatMap(p => 
            p.tasks.flatMap(t => 
                (t.operations || []).filter(op => 
                    (op.assignedOperator === activeOperator.name || op.machineOperatorName === activeOperator.name) && 
                    op.status !== OPERATION_STATUS.COMPLETED && 
                    op.status !== OPERATION_STATUS.WAITING_SUPERVISOR_REVIEW
                ).map(op => ({ ...op, moldName: p.moldName, taskName: t.taskName, moldId: p.id, taskId: t.id }))
            )
        );

        return (
            <div className="flex flex-col h-screen bg-gray-900 text-white p-6">
                <div className="flex justify-between items-center mb-8 border-b border-gray-700 pb-4">
                    <div className="flex items-center">
                        <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center text-2xl font-bold mr-4">{activeOperator.name.charAt(0)}</div>
                        <div><h2 className="text-3xl font-bold">{activeOperator.name}</h2><p className="text-gray-400">Terminal Girişi</p></div>
                    </div>
                    <button onClick={handleLogout} className="bg-red-600 hover:bg-red-700 px-8 py-4 rounded-xl text-xl font-bold flex items-center"><LogOut className="w-6 h-6 mr-2" /> ÇIKIŞ</button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6 overflow-y-auto pb-20">
                    {myTasks.length === 0 ? (
                        <div className="col-span-full flex flex-col items-center justify-center text-gray-500 h-96"><Hash className="w-16 h-16 mb-4 opacity-20" /><p className="text-2xl">Üzerinize atanmış aktif bir iş bulunmuyor.</p></div>
                    ) : (
                        myTasks.map(task => <TaskCard key={task.id} task={task} handleTerminalAction={handleTerminalAction} />)
                    )}
                </div>
            </div>
        );
    };

    const TaskCard = ({ task, handleTerminalAction }) => {
        let mode = 'WAITING'; 
        if (task.setupStartTime && !task.productionStartTime) mode = 'SETUP'; 
        if (task.productionStartTime) mode = 'PRODUCTION'; 

        return (
            <div className={`p-6 rounded-2xl border-l-8 shadow-lg transition-all ${mode === 'PRODUCTION' ? 'bg-gray-800 border-green-500' : mode === 'SETUP' ? 'bg-gray-800 border-yellow-500' : 'bg-gray-800 border-gray-600'}`}>
                <div className="flex justify-between items-start mb-4">
                    <div><h4 className="text-xl font-bold text-white">{task.moldName}</h4><p className="text-gray-400 text-lg">{task.taskName}</p><span className="text-sm bg-blue-900 text-blue-200 px-2 py-1 rounded mt-1 inline-block">{task.machineName}</span></div>
                    <div className="text-right"><span className={`px-3 py-1 rounded text-xs font-bold uppercase tracking-wider ${mode === 'PRODUCTION' ? 'bg-green-900 text-green-300' : mode === 'SETUP' ? 'bg-yellow-900 text-yellow-300' : 'bg-gray-700 text-gray-400'}`}>{mode === 'PRODUCTION' ? 'İMALAT SÜRÜYOR' : mode === 'SETUP' ? 'AYAR YAPILIYOR' : 'BAŞLAMADI'}</span></div>
                </div>
                <div className="mt-6">
                    {mode === 'WAITING' && <button onClick={() => handleTerminalAction(task.moldId, task.taskId, task.id, 'START_SETUP')} className="w-full bg-yellow-600 hover:bg-yellow-500 text-white font-bold py-4 rounded-xl text-lg shadow-lg flex items-center justify-center"><Settings className="w-6 h-6 mr-2" /> AYARA BAŞLA</button>}
                    {mode === 'SETUP' && <button onClick={() => handleTerminalAction(task.moldId, task.taskId, task.id, 'START_PRODUCTION')} className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-4 rounded-xl text-lg shadow-lg flex items-center justify-center animate-pulse"><PlayCircle className="w-6 h-6 mr-2" /> İMALATA GEÇ</button>}
                    {mode === 'PRODUCTION' && <button onClick={() => { if(window.confirm("İşi bitirmek istediğinize emin misiniz?")) handleTerminalAction(task.moldId, task.taskId, task.id, 'FINISH_JOB'); }} className="w-full bg-red-600 hover:bg-red-500 text-white font-bold py-4 rounded-xl text-lg shadow-lg flex items-center justify-center"><CheckCircle className="w-6 h-6 mr-2" /> İŞİ BİTİR</button>}
                </div>
            </div>
        );
    };

    if (activeOperator) return <OperatorDashboard />;

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