// src/pages/CamOperatorAnalysis.js

import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, onSnapshot } from '../config/firebase.js';
import { 
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell, 
    PieChart, Pie, LineChart, Line 
} from 'recharts';
import { Clock, Filter, Layers, Zap, TrendingUp, Calendar, ListOrdered, Monitor, Percent, Calculator, ArrowRight } from 'lucide-react';

const getISOWeek = (d) => {
    const date = new Date(d.getTime());
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
    const week1 = new Date(date.getFullYear(), 0, 4);
    return 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
};

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4'];

const CamOperatorAnalysis = ({ db }) => {
    const [logs, setLogs] = useState([]);
    
    // Filtre State'leri
    const [filterType, setFilterType] = useState('DAILY'); 
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
    const [selectedMonth, setSelectedMonth] = useState((new Date().getMonth() + 1).toString());
    const [selectedWeek, setSelectedWeek] = useState(getISOWeek(new Date()).toString());
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]); 
    const [selectedOperator, setSelectedOperator] = useState('ALL');
    
    const [machineCount, setMachineCount] = useState(1);

    useEffect(() => {
        if (!db) return;
        const q = query(collection(db, 'cam_operator_logs'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setLogs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });
        return () => unsubscribe();
    }, [db]);

    const uniqueOperators = useMemo(() => Array.from(new Set(logs.map(log => log.operatorName))), [logs]);

    // --- VERİ İŞLEME ---
    const stats = useMemo(() => {
        let totalPrep = 0;
        let totalCam = 0;
        let totalOther = 0;
        const operatorMap = {};
        const machineMap = {};

        logs.forEach(log => {
            const logDate = new Date(log.date);
            const logDateStr = logDate.toISOString().split('T')[0];
            const logYear = logDate.getFullYear().toString();
            const logMonth = (logDate.getMonth() + 1).toString();
            const logWeek = getISOWeek(logDate).toString();

            if (filterType === 'DAILY') {
                if (logDateStr !== selectedDate) return;
            } else {
                if (logYear !== selectedYear) return;
                if (filterType === 'MONTH' && logMonth !== selectedMonth) return;
                if (filterType === 'WEEK' && logWeek !== selectedWeek) return;
            }
            
            if (selectedOperator !== 'ALL' && log.operatorName !== selectedOperator) return;

            const prepMins = (log.prepTime || 0);
            const camMins = (log.camTime || 0);
            const otherMins = (log.otherTime || 0);

            totalPrep += prepMins;
            totalCam += camMins;
            totalOther += otherMins;

            if (!operatorMap[log.operatorName]) {
                operatorMap[log.operatorName] = { 
                    name: log.operatorName, 
                    Hazırlık: 0, 
                    CAM: 0, 
                    Diğer: 0, 
                    totalMins: 0,
                    workedMachines: new Set() 
                };
            }
            operatorMap[log.operatorName].Hazırlık += prepMins / 60;
            operatorMap[log.operatorName].CAM += camMins / 60;
            operatorMap[log.operatorName].Diğer += otherMins / 60;
            operatorMap[log.operatorName].totalMins += (prepMins + camMins + otherMins);
            
            if (log.machineName) {
                operatorMap[log.operatorName].workedMachines.add(log.machineName);
            }

            if (log.category === 'CAM' && log.machineName) {
                if (!machineMap[log.machineName]) machineMap[log.machineName] = 0;
                machineMap[log.machineName] += camMins / 60;
            }
        });

        let periodHours = filterType === 'DAILY' ? 24 : filterType === 'WEEK' ? 168 : 720;

        const sortedOperators = Object.values(operatorMap)
            .sort((a, b) => b.CAM - a.CAM)
            .map(op => ({
                ...op,
                machineCount: op.workedMachines.size,
                utilization: ((op.totalMins / 60) / (machineCount * periodHours) * 100).toFixed(1)
            }));

        const sortedMachines = Object.entries(machineMap)
            .map(([name, time]) => ({ name, time: parseFloat(time.toFixed(1)) }))
            .sort((a, b) => b.time - a.time);

        return {
            prep: totalPrep,
            cam: totalCam,
            other: totalOther,
            chartData: sortedOperators,
            pieData: [
                { name: 'Hazırlık', value: totalPrep },
                { name: 'CAM Çıktı', value: totalCam },
                { name: 'Diğer', value: totalOther },
            ].filter(d => d.value > 0),
            sortedOperators,
            sortedMachines,
            avgPerMachine: (totalCam / 60) / (machineCount || 1)
        };
    }, [logs, selectedYear, filterType, selectedMonth, selectedWeek, selectedDate, selectedOperator, machineCount]);

    const trendData = useMemo(() => {
        const map = {};
        logs.forEach(log => {
            const logDate = new Date(log.date);
            if (selectedOperator !== 'ALL' && log.operatorName !== selectedOperator) return;

            let periodKey, periodLabel;
            if (filterType === 'MONTH') {
                if (logDate.getFullYear().toString() !== selectedYear) return;
                const m = logDate.getMonth() + 1;
                periodKey = m;
                periodLabel = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"][m - 1];
            } else if (filterType === 'WEEK') {
                if (logDate.getFullYear().toString() !== selectedYear) return;
                const w = getISOWeek(logDate);
                periodKey = w;
                periodLabel = `${w}. Hf`;
            } else {
                const targetDate = new Date(selectedDate);
                if (logDate.getMonth() !== targetDate.getMonth() || logDate.getFullYear() !== targetDate.getFullYear()) return;
                const d = logDate.getDate();
                periodKey = d;
                periodLabel = `${d}.${logDate.getMonth() + 1}`;
            }

            if (!map[periodKey]) map[periodKey] = { periodKey, name: periodLabel, Hazırlık: 0, CAM: 0, Diğer: 0 };
            map[periodKey].Hazırlık += (log.prepTime || 0) / 60;
            map[periodKey].CAM += (log.camTime || 0) / 60;
            map[periodKey].Diğer += (log.otherTime || 0) / 60;
        });

        return Object.values(map).sort((a, b) => a.periodKey - b.periodKey).map(item => ({
            ...item,
            Hazırlık: parseFloat(item.Hazırlık.toFixed(1)),
            CAM: parseFloat(item.CAM.toFixed(1)),
            Diğer: parseFloat(item.Diğer.toFixed(1))
        }));
    }, [logs, selectedYear, filterType, selectedDate, selectedOperator]);

    return (
        <div className="space-y-8 animate-in fade-in pb-20">
            
            {/* FİLTRE PANELİ */}
            <div className="grid grid-cols-1 md:grid-cols-6 gap-4 bg-white dark:bg-gray-800 p-6 rounded-3xl border border-gray-200 dark:border-gray-700 shadow-xl items-end">
                <div className="md:col-span-1">
                    <label className="block text-[10px] font-black text-gray-400 uppercase mb-2 ml-1">Görünüm</label>
                    <select className="w-full p-3 border rounded-xl bg-gray-50 dark:bg-gray-700 dark:text-white outline-none font-bold text-sm" value={filterType} onChange={e => setFilterType(e.target.value)}>
                        <option value="DAILY">GÜNLÜK</option>
                        <option value="WEEK">HAFTALIK</option>
                        <option value="MONTH">AYLIK</option>
                    </select>
                </div>

                {filterType === 'DAILY' ? (
                    <div className="md:col-span-2">
                        <label className="block text-[10px] font-black text-teal-500 uppercase mb-2 ml-1">Tarih Seçin</label>
                        <input type="date" className="w-full p-3 border rounded-xl bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-300 font-bold outline-none" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} />
                    </div>
                ) : (
                    <>
                        <div>
                            <label className="block text-[10px] font-black text-gray-400 uppercase mb-2 ml-1">Yıl</label>
                            <select className="w-full p-3 border rounded-xl bg-gray-50 dark:bg-gray-700 font-bold dark:text-white outline-none" value={selectedYear} onChange={e => setSelectedYear(e.target.value)}>
                                <option value="2024">2024</option><option value="2025">2025</option><option value="2026">2026</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-[10px] font-black text-blue-500 uppercase mb-2 ml-1">Dönem</label>
                            {filterType === 'MONTH' ? (
                                <select className="w-full p-3 border rounded-xl bg-blue-50 dark:bg-blue-900/30 text-blue-700 font-bold outline-none" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}>
                                    {["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"].map((m, i) => <option key={i+1} value={(i+1).toString()}>{m}</option>)}
                                </select>
                            ) : (
                                <select className="w-full p-3 border rounded-xl bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 font-bold outline-none" value={selectedWeek} onChange={e => setSelectedWeek(e.target.value)}>
                                    {Array.from({length: 53}, (_, i) => i + 1).map(w => <option key={w} value={w.toString()}>{w}. Hafta</option>)}
                                </select>
                            )}
                        </div>
                    </>
                )}

                <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase mb-2 ml-1">Personel</label>
                    <select className="w-full p-3 border rounded-xl bg-gray-50 dark:bg-gray-700 font-bold dark:text-white outline-none" value={selectedOperator} onChange={e => setSelectedOperator(e.target.value)}>
                        <option value="ALL">Tümü</option>
                        {uniqueOperators.map(op => <option key={op} value={op}>{op}</option>)}
                    </select>
                </div>

                <div>
                    <label className="block text-[10px] font-black text-orange-500 uppercase mb-2 ml-1 flex items-center"><Monitor className="w-3 h-3 mr-1"/> Aktif Tezgahlar</label>
                    <input type="number" min="1" className="w-full p-3 border rounded-xl bg-orange-50 dark:bg-orange-900/20 text-orange-700 font-black outline-none" value={machineCount} onChange={e => setMachineCount(parseInt(e.target.value) || 1)} />
                </div>
            </div>

            {/* BÜYÜK YATAY KARTLAR */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="bg-white dark:bg-gray-800 p-8 rounded-3xl border-b-8 border-b-blue-500 shadow-lg flex flex-col justify-center transition-transform hover:scale-[1.02]">
                    <div className="text-blue-500 dark:text-blue-400 text-xs font-black uppercase tracking-widest mb-2">Hazırlık Süresi</div>
                    <div className="text-4xl font-black text-gray-900 dark:text-white">{(stats.prep / 60).toFixed(1)} <span className="text-xl font-normal opacity-50">Saat</span></div>
                </div>
                <div className="bg-white dark:bg-gray-800 p-8 rounded-3xl border-b-8 border-b-green-500 shadow-lg flex flex-col justify-center transition-transform hover:scale-[1.02]">
                    <div className="text-green-500 dark:text-green-400 text-xs font-black uppercase tracking-widest mb-2">CAM İşleme Süresi</div>
                    <div className="text-4xl font-black text-green-600">{(stats.cam / 60).toFixed(1)} <span className="text-xl font-normal opacity-50">Saat</span></div>
                </div>
                <div className="bg-white dark:bg-gray-800 p-8 rounded-3xl border-b-8 border-b-orange-500 shadow-lg flex flex-col justify-center transition-transform hover:scale-[1.02]">
                    <div className="text-orange-500 dark:text-orange-400 text-xs font-black uppercase tracking-widest mb-2">Tezgah Başı Ort.</div>
                    <div className="text-4xl font-black text-orange-600">{stats.avgPerMachine.toFixed(1)} <span className="text-xl font-normal opacity-50">Saat</span></div>
                </div>
                <div className="bg-white dark:bg-gray-800 p-8 rounded-3xl border-b-8 border-b-purple-500 shadow-lg flex flex-col justify-center transition-transform hover:scale-[1.02]">
                    <div className="text-purple-500 dark:text-purple-400 text-xs font-black uppercase tracking-widest mb-2">Toplam Verimlilik</div>
                    <div className="text-4xl font-black text-purple-600">
                        {((stats.cam + stats.prep) / 60 / (machineCount * (filterType === 'DAILY' ? 24 : filterType === 'WEEK' ? 168 : 720)) * 100).toFixed(1)}%
                    </div>
                </div>
            </div>

            {/* GRAFİK (TAM GENİŞLİK) */}
            <div className="bg-white dark:bg-gray-800 p-8 rounded-3xl border border-gray-200 shadow-sm">
                <h3 className="font-black text-gray-800 dark:text-white mb-8 flex items-center uppercase text-xs tracking-widest border-b pb-4"><TrendingUp className="w-4 h-4 mr-2 text-indigo-500"/> Dönemsel Karşılaştırma Analizi</h3>
                <div className="h-[500px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={stats.chartData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" opacity={0.05} vertical={false} />
                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#9CA3AF', fontSize: 11, fontWeight: 'bold'}} />
                            <YAxis axisLine={false} tickLine={false} tick={{fill: '#9CA3AF', fontSize: 11}} unit="s" />
                            <Tooltip 
                                cursor={{fill: 'rgba(156, 163, 175, 0.05)'}} 
                                contentStyle={{ backgroundColor: '#111827', color: '#F3F4F6', borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)' }}
                                formatter={(value) => [`${value.toFixed(1)} Saat`]}
                            />
                            <Legend verticalAlign="top" align="right" wrapperStyle={{paddingBottom: '20px'}} />
                            <Bar dataKey="Hazırlık" fill="#3B82F6" radius={[6, 6, 0, 0]} barSize={45} />
                            <Bar dataKey="CAM" fill="#10B981" radius={[6, 6, 0, 0]} barSize={45} />
                            <Bar dataKey="Diğer" fill="#F59E0B" radius={[6, 6, 0, 0]} barSize={45} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* PERSONEL VERİMLİLİK TABLOSU (TAM GENİŞLİK) */}
            <div className="bg-white dark:bg-gray-800 p-8 rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
                <h3 className="font-black text-gray-800 dark:text-white mb-6 flex items-center uppercase text-xs tracking-widest border-b pb-4"><ListOrdered className="w-4 h-4 mr-2 text-blue-500"/> Personel Verimlilik Sıralaması</h3>
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="text-[10px] font-black text-gray-400 uppercase tracking-tighter border-b border-gray-100 dark:border-gray-700">
                                <th className="px-4 py-4 w-16">Sıra</th>
                                <th className="px-4 py-4">Personel Adı</th>
                                {filterType === 'DAILY' && <th className="px-4 py-4">Tezgah</th>}
                                <th className="px-4 py-4 text-center">Hazırlık</th>
                                <th className="px-4 py-4 text-center">Diğer İşler</th>
                                <th className="px-4 py-4 text-center">Kapasite %</th>
                                <th className="px-4 py-4 text-right">CAM Süresi</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                            {stats.sortedOperators.map((op, idx) => (
                                <tr key={op.name} className="group hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                                    <td className="px-4 py-4">
                                        <span className="w-8 h-8 flex items-center justify-center bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300 text-xs font-black rounded-xl group-hover:bg-blue-600 group-hover:text-white transition-colors">{idx + 1}</span>
                                    </td>
                                    <td className="px-4 py-4">
                                        <div className="font-black text-sm text-gray-900 dark:text-white uppercase tracking-tight">{op.name}</div>
                                    </td>
                                    {filterType === 'DAILY' && (
                                        <td className="px-4 py-4">
                                            <span className="text-[10px] font-bold bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 px-2.5 py-1 rounded-full">{op.machineCount} Farklı Tezgah</span>
                                        </td>
                                    )}
                                    <td className="px-4 py-4 text-center font-bold text-blue-600 dark:text-blue-400 text-sm">
                                        {op.Hazırlık.toFixed(1)}s
                                    </td>
                                    <td className="px-4 py-4 text-center font-bold text-orange-600 dark:text-orange-400 text-sm">
                                        {op.Diğer.toFixed(1)}s
                                    </td>
                                    <td className="px-4 py-4 text-center">
                                        <div className="flex flex-col items-center">
                                            <span className="text-sm font-black text-purple-600 dark:text-purple-400">%{op.utilization}</span>
                                            <div className="w-16 h-1 bg-gray-100 dark:bg-gray-700 rounded-full mt-1 overflow-hidden">
                                                <div className="h-full bg-purple-500" style={{width: `${Math.min(op.utilization, 100)}%`}}></div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-4 py-4 text-right">
                                        <div className="text-lg font-black text-green-600 dark:text-green-400">{op.CAM.toFixed(1)} <span className="text-xs font-normal opacity-60">Saat</span></div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* TEZGAH BAZLI LİSTE (TAM GENİŞLİK) */}
            <div className="bg-white dark:bg-gray-800 p-8 rounded-3xl border border-gray-200 shadow-sm">
                <h3 className="font-black text-gray-800 dark:text-white mb-8 flex items-center uppercase text-xs tracking-widest border-b pb-4"><Monitor className="w-5 h-5 mr-2 text-indigo-500"/> Tezgah Bazlı İşleme Dağılımı</h3>
                <div className="flex flex-col gap-3">
                    {stats.sortedMachines.map((m) => (
                        <div key={m.name} className="flex items-center justify-between p-5 bg-gray-50 dark:bg-gray-900/80 rounded-2xl border border-gray-100 dark:border-gray-700 hover:scale-[1.01] transition-transform shadow-sm">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-white dark:bg-gray-800 rounded-xl flex items-center justify-center shadow-sm">
                                    <Monitor className="w-6 h-6 text-indigo-500" />
                                </div>
                                <div className="text-xl font-black text-gray-800 dark:text-white uppercase tracking-tight">{m.name}</div>
                            </div>
                            <div className="flex items-center gap-10">
                                <div className="text-right">
                                    <div className="text-xs text-gray-400 font-bold uppercase mb-1">Toplam CAM Süresi</div>
                                    <div className="text-2xl font-black text-indigo-600 dark:text-indigo-400">{m.time} <span className="text-sm font-normal opacity-60">Saat</span></div>
                                </div>
                                <ArrowRight className="w-6 h-6 text-gray-300" />
                            </div>
                        </div>
                    ))}
                    {stats.sortedMachines.length === 0 && <div className="text-center text-gray-400 py-10 italic border-2 border-dashed rounded-3xl">Seçili periyotta herhangi bir tezgah verisi girişi bulunamadı.</div>}
                </div>
            </div>

            {/* TREND AKIŞI */}
            <div className="bg-white dark:bg-gray-800 p-8 rounded-3xl border border-gray-200 shadow-sm">
                <h3 className="font-black text-gray-800 dark:text-white mb-8 flex items-center uppercase text-xs tracking-widest border-b pb-4"><Calculator className="w-5 h-5 mr-2 text-green-500"/> Dönemsel Performans Akışı</h3>
                <div className="h-80 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={trendData}>
                            <CartesianGrid strokeDasharray="3 3" opacity={0.05} />
                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#9CA3AF', fontSize: 10, fontWeight: 'bold'}} />
                            <YAxis axisLine={false} tickLine={false} tick={{fill: '#9CA3AF', fontSize: 10}} unit="s" />
                            <Tooltip 
                                contentStyle={{ backgroundColor: '#111827', color: '#F3F4F6', borderRadius: '12px', border: 'none' }}
                                formatter={(value) => [`${value.toFixed(1)} Saat`]}
                            />
                            <Legend verticalAlign="top" align="right" />
                            <Line type="monotone" dataKey="Hazırlık" stroke="#3B82F6" strokeWidth={4} dot={{r: 5, fill: '#3B82F6', strokeWidth: 2, stroke: '#fff'}} activeDot={{r: 8}} />
                            <Line type="monotone" dataKey="CAM" stroke="#10B981" strokeWidth={4} dot={{r: 5, fill: '#10B981', strokeWidth: 2, stroke: '#fff'}} activeDot={{r: 8}} />
                            <Line type="monotone" dataKey="Diğer" stroke="#F59E0B" strokeWidth={4} dot={{r: 5, fill: '#F59E0B', strokeWidth: 2, stroke: '#fff'}} activeDot={{r: 8}} />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>

        </div>
    );
};

export default CamOperatorAnalysis;