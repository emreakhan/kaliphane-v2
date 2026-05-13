// src/pages/CanliDurum.jsx

import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, getDocs } from '../config/firebase';
import { 
    Monitor, Clock, CheckCircle2, 
    Wifi, WifiOff, LayoutDashboard, Cpu, History, PauseCircle
} from 'lucide-react';

const CanliDurum = ({ db }) => {
    const [machines, setMachines] = useState([]);
    const [dailyStats, setDailyStats] = useState({});
    const [loading, setLoading] = useState(true);

    // 1. ANLIK DURUMLARI DİNLE
    useEffect(() => {
        if (!db) return;
        const q = query(collection(db, "cnc_live_status"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const machineList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setMachines(machineList);
            setLoading(false);
        }, (error) => {
            console.error("Firestore Dinleme Hatası:", error);
            setLoading(false);
        });
        return () => unsubscribe();
    }, [db]);

    // 2. GÜNLÜK SÜRELERİ (SADECE ÇALIŞMA VE BEKLEME) HESAPLA
    useEffect(() => {
        if (!db || machines.length === 0) return;

        const fetchDailyLogs = async () => {
            const todayStr = new Date().toISOString().split('T')[0];
            const logsRef = collection(db, "cnc_daily_logs", todayStr, "logs");
            const snapshot = await getDocs(logsRef);
            
            const logsByMachine = {};
            
            snapshot.docs.forEach(doc => {
                const data = doc.data();
                if (!logsByMachine[data.machineId]) logsByMachine[data.machineId] = [];
                logsByMachine[data.machineId].push(data);
            });

            const stats = {};
            const currentTime = Math.floor(Date.now() / 1000);

            for (const [mId, logs] of Object.entries(logsByMachine)) {
                logs.sort((a, b) => a.timestamp - b.timestamp);
                
                let totalWorkSec = 0;
                let totalIdleSec = 0;

                for (let i = 0; i < logs.length; i++) {
                    const currentLog = logs[i];
                    const nextTimestamp = (i + 1 < logs.length) ? logs[i + 1].timestamp : currentTime;
                    const durationSec = nextTimestamp - currentLog.timestamp;

                    if (currentLog.status === 'CALISIYOR') {
                        totalWorkSec += durationSec;
                    } else {
                        totalIdleSec += durationSec; // Bekliyor veya diğer her durum "Boşta" sayılır
                    }
                }

                const totalSec = totalWorkSec + totalIdleSec || 1;
                
                stats[mId] = {
                    workSec: totalWorkSec,
                    idleSec: totalIdleSec,
                    workPercent: ((totalWorkSec / totalSec) * 100).toFixed(1),
                    idlePercent: ((totalIdleSec / totalSec) * 100).toFixed(1)
                };
            }
            setDailyStats(stats);
        };

        fetchDailyLogs();
        const interval = setInterval(fetchDailyLogs, 10000); 
        return () => clearInterval(interval);

    }, [db, machines]);

    // UI DURUMLARI (Sadece 2 Durum)
    const getStatusUI = (status) => {
        if (status === 'CALISIYOR') {
            return { color: 'text-green-500', bar: 'bg-green-500', bg: 'bg-green-500/10', border: 'border-green-500/20', icon: <CheckCircle2 className="w-5 h-5" />, label: 'ÇALIŞIYOR' };
        } else if (status === 'BEKLIYOR') {
            return { color: 'text-yellow-500', bar: 'bg-yellow-500', bg: 'bg-yellow-500/10', border: 'border-yellow-500/20', icon: <PauseCircle className="w-5 h-5" />, label: 'DURDU / BOŞTA' };
        } else {
            return { color: 'text-gray-400', bar: 'bg-gray-400', bg: 'bg-gray-400/10', border: 'border-gray-400/20', icon: <WifiOff className="w-5 h-5" />, label: 'BAĞLANTI YOK' };
        }
    };

    const formatTime = (totalSeconds) => {
        if (!totalSeconds) return "0 dk";
        const h = Math.floor(totalSeconds / 3600);
        const m = Math.floor((totalSeconds % 3600) / 60);
        return h > 0 ? `${h} sa ${m} dk` : `${m} dk`;
    };

    if (loading) {
        return (
            <div className="flex h-screen items-center justify-center bg-gray-100 dark:bg-gray-900">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
            </div>
        );
    }

    return (
        <div className="p-4 md:p-8 min-h-screen bg-gray-100 dark:bg-gray-900 font-sans">
            {/* Üst Başlık */}
            <div className="max-w-7xl mx-auto mb-8">
                <div className="flex items-center justify-between bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-sm border border-gray-200 dark:border-gray-700">
                    <div>
                        <h1 className="text-2xl md:text-3xl font-black text-gray-900 dark:text-white flex items-center">
                            <Monitor className="w-8 h-8 mr-3 text-blue-600" /> 
                            Tezgah İzleme & Verimlilik
                        </h1>
                        <p className="text-gray-500 dark:text-gray-400 mt-1 font-medium">Tezgahların günlük çalışma ve durma süreleri.</p>
                    </div>
                    <div className="hidden md:flex items-center gap-4 bg-gray-50 dark:bg-gray-900 p-3 rounded-2xl border dark:border-gray-700">
                        <div className="flex flex-col items-end">
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Takip Edilen</span>
                            <span className="text-xl font-black text-blue-600">{machines.length} Tezgah</span>
                        </div>
                        <LayoutDashboard className="w-8 h-8 text-blue-500/20" />
                    </div>
                </div>
            </div>

            {/* Kartlar */}
            <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-6">
                {machines.map((cnc) => {
                    const ui = getStatusUI(cnc.statusText);
                    const stats = dailyStats[cnc.id] || { workSec: 0, idleSec: 0, workPercent: 0, idlePercent: 0 };

                    return (
                        <div key={cnc.id} className="bg-white dark:bg-gray-800 rounded-3xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col">
                            
                            {/* Header */}
                            <div className={`p-6 ${ui.bg} border-b ${ui.border} flex justify-between items-start`}>
                                <div className="flex items-center gap-4">
                                    <div className={`p-3 rounded-2xl bg-white dark:bg-gray-900 shadow-sm ${ui.color}`}>
                                        <Cpu className="w-8 h-8" />
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-black text-gray-900 dark:text-white uppercase leading-tight">{cnc.machineName}</h3>
                                        <div className="flex items-center text-[11px] font-bold text-gray-500 mt-1">
                                            <Wifi className="w-3 h-3 mr-1" /> {cnc.ip}
                                        </div>
                                    </div>
                                </div>
                                <div className={`flex flex-col items-end`}>
                                    <div className={`flex items-center gap-2 px-4 py-2 rounded-full bg-white dark:bg-gray-900 shadow-sm ${ui.color} font-black text-xs uppercase tracking-wider border ${ui.border}`}>
                                        {ui.icon} {ui.label}
                                    </div>
                                    <span className="text-[10px] text-gray-400 mt-2 font-bold animate-pulse">Son sinyal: {cnc.lastUpdate?.split(' ')[1]}</span>
                                </div>
                            </div>

                            {/* Performans İstatistikleri */}
                            <div className="p-6 flex-1 flex flex-col justify-center">
                                <h4 className="text-xs font-black text-gray-500 uppercase flex items-center mb-4"><History className="w-4 h-4 mr-2" /> Bugünkü Üretim Özeti</h4>
                                
                                {/* 2 Renkli Progress Bar */}
                                <div className="w-full h-5 bg-gray-200 dark:bg-gray-700 rounded-full flex overflow-hidden mb-5">
                                    <div style={{ width: `${stats.workPercent}%` }} className="bg-green-500 h-full transition-all duration-1000" title={`Çalışma: %${stats.workPercent}`}></div>
                                    <div style={{ width: `${stats.idlePercent}%` }} className="bg-yellow-500 h-full transition-all duration-1000" title={`Boşta: %${stats.idlePercent}`}></div>
                                </div>

                                {/* Saat/Dakika Kutuları */}
                                <div className="grid grid-cols-2 gap-4 text-center">
                                    <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-2xl border border-green-100 dark:border-green-800">
                                        <div className="text-[10px] font-black text-green-600 uppercase mb-1">Çalışma Süresi</div>
                                        <div className="font-bold text-xl text-gray-800 dark:text-gray-200">{formatTime(stats.workSec)}</div>
                                        <div className="text-xs text-green-500 font-bold mt-1">%{stats.workPercent}</div>
                                    </div>
                                    <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-2xl border border-yellow-100 dark:border-yellow-800">
                                        <div className="text-[10px] font-black text-yellow-600 uppercase mb-1">Durma / Boşta Süresi</div>
                                        <div className="font-bold text-xl text-gray-800 dark:text-gray-200">{formatTime(stats.idleSec)}</div>
                                        <div className="text-xs text-yellow-500 font-bold mt-1">%{stats.idlePercent}</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default CanliDurum;