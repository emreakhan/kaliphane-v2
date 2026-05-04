// src/pages/CamOperatorAnalysis.js

import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, onSnapshot } from '../config/firebase.js';
import { 
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell, 
    PieChart, Pie, LineChart, Line 
} from 'recharts';
import { Clock, Filter, Layers, Zap, TrendingUp } from 'lucide-react';

// İlgili tarihin yıl içindeki haftasını hesaplayan yardımcı fonksiyon (ISO 8601 standardı)
const getISOWeek = (d) => {
    const date = new Date(d.getTime());
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
    const week1 = new Date(date.getFullYear(), 0, 4);
    return 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
};

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#8B5CF6'];

const CamOperatorAnalysis = ({ db }) => {
    const [logs, setLogs] = useState([]);
    
    // Yıl, Görünüm Tipi (Ay/Hafta) ve Değer Filtreleri
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
    const [filterType, setFilterType] = useState('MONTH'); // MONTH veya WEEK
    const [selectedMonth, setSelectedMonth] = useState((new Date().getMonth() + 1).toString());
    const [selectedWeek, setSelectedWeek] = useState(getISOWeek(new Date()).toString());
    const [selectedOperator, setSelectedOperator] = useState('ALL');

    useEffect(() => {
        if (!db) return;
        const q = query(collection(db, 'cam_operator_logs'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setLogs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });
        return () => unsubscribe();
    }, [db]);

    const uniqueOperators = useMemo(() => Array.from(new Set(logs.map(log => log.operatorName))), [logs]);

    // 1. ÜST KARTLAR VE ÇUBUK/PASTA GRAFİK İÇİN VERİ İŞLEME (Seçili Ay/Hafta'ya göre)
    const stats = useMemo(() => {
        let totalPrep = 0;
        let totalCam = 0;
        let totalOther = 0;
        const operatorMap = {};

        logs.forEach(log => {
            const logDate = new Date(log.date);
            const logYear = logDate.getFullYear().toString();
            const logMonth = (logDate.getMonth() + 1).toString();
            const logWeek = getISOWeek(logDate).toString();

            // Yıl Filtresi
            if (logYear !== selectedYear) return;
            
            // Görünüm Filtresi (Ay seçiliyse o aya, Hafta seçiliyse o haftaya uymayanları atla)
            if (filterType === 'MONTH' && logMonth !== selectedMonth) return;
            if (filterType === 'WEEK' && logWeek !== selectedWeek) return;
            
            // Personel Filtresi
            if (selectedOperator !== 'ALL' && log.operatorName !== selectedOperator) return;

            // Toplamlar (Saniye bazlı değil, dakika bazlı tutuluyor)
            totalPrep += (log.prepTime || 0);
            totalCam += (log.camTime || 0);
            totalOther += (log.otherTime || 0);

            // Grafik Verisi (Operatör bazlı kırılım)
            if (!operatorMap[log.operatorName]) {
                operatorMap[log.operatorName] = { name: log.operatorName, Hazırlık: 0, CAM: 0, Diğer: 0 };
            }
            operatorMap[log.operatorName].Hazırlık += (log.prepTime || 0) / 60;
            operatorMap[log.operatorName].CAM += (log.camTime || 0) / 60;
            operatorMap[log.operatorName].Diğer += (log.otherTime || 0) / 60;
        });

        const pieData = [
            { name: 'Hazırlık', value: totalPrep },
            { name: 'CAM Çıktı', value: totalCam },
            { name: 'Diğer / Toplantı', value: totalOther },
        ].filter(d => d.value > 0);

        return {
            prep: totalPrep,
            cam: totalCam,
            other: totalOther,
            chartData: Object.values(operatorMap),
            pieData: pieData
        };
    }, [logs, selectedYear, filterType, selectedMonth, selectedWeek, selectedOperator]);


    // 2. YENİ EKLENEN: GELİŞİM (TREND) GRAFİĞİ İÇİN VERİ İŞLEME (Tüm Yıla Göre Aydan Aya / Haftadan Haftaya)
    const trendData = useMemo(() => {
        const map = {};

        logs.forEach(log => {
            const logDate = new Date(log.date);
            const logYear = logDate.getFullYear().toString();

            // Trend sadece seçili yılı baz alır
            if (logYear !== selectedYear) return;
            
            // Personel Filtresi
            if (selectedOperator !== 'ALL' && log.operatorName !== selectedOperator) return;

            let periodKey, periodLabel;

            // Trendin x eksenini belirliyoruz
            if (filterType === 'MONTH') {
                const m = logDate.getMonth() + 1;
                periodKey = m;
                periodLabel = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"][m - 1];
            } else {
                const w = getISOWeek(logDate);
                periodKey = w;
                periodLabel = `${w}. Hafta`;
            }

            if (!map[periodKey]) {
                map[periodKey] = { periodKey, name: periodLabel, Hazırlık: 0, CAM: 0, Diğer: 0 };
            }

            map[periodKey].Hazırlık += (log.prepTime || 0) / 60;
            map[periodKey].CAM += (log.camTime || 0) / 60;
            map[periodKey].Diğer += (log.otherTime || 0) / 60;
        });

        // Periyot key'ine göre (Hafta 1, Hafta 2... veya Ay 1, Ay 2...) sıralama ve küsürat temizliği
        return Object.values(map)
            .sort((a, b) => a.periodKey - b.periodKey)
            .map(item => ({
                ...item,
                Hazırlık: parseFloat(item.Hazırlık.toFixed(1)),
                CAM: parseFloat(item.CAM.toFixed(1)),
                Diğer: parseFloat(item.Diğer.toFixed(1))
            }));

    }, [logs, selectedYear, filterType, selectedOperator]);


    const formatH = (mins) => `${Math.floor(mins / 60)}s ${mins % 60}dk`;

    const renderCustomizedLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
        const RADIAN = Math.PI / 180;
        const radius = outerRadius * 1.15;
        const x = cx + radius * Math.cos(-midAngle * RADIAN);
        const y = cy + radius * Math.sin(-midAngle * RADIAN);
        return (
            <text x={x} y={y} fill="#9CA3AF" textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central" fontSize="12" fontWeight="bold">
                {`${(percent * 100).toFixed(0)}%`}
            </text>
        );
    };

    return (
        <div className="space-y-6 animate-in fade-in">
            
            {/* FİLTRE PANELİ */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm">
                <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Yıl</label>
                    <select className="w-full p-2 border rounded-lg bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:text-white outline-none font-bold" value={selectedYear} onChange={e => setSelectedYear(e.target.value)}>
                        <option value="2024" className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white">2024</option>
                        <option value="2025" className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white">2025</option>
                        <option value="2026" className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white">2026</option>
                    </select>
                </div>
                <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Görünüm Tipi</label>
                    <select className="w-full p-2 border rounded-lg bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:text-white outline-none font-bold" value={filterType} onChange={e => setFilterType(e.target.value)}>
                        <option value="MONTH" className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white">Aylık Görünüm</option>
                        <option value="WEEK" className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white">Haftalık Görünüm</option>
                    </select>
                </div>
                
                {/* Seçilen Görünüme Göre Dinamik Seçici (Option etiketleri taşmaları engellemek için fixlendi) */}
                {filterType === 'MONTH' ? (
                    <div>
                        <label className="block text-[10px] font-black text-blue-500 uppercase mb-1">Ay Seçiniz</label>
                        <select className="w-full p-2 border rounded-lg bg-blue-50 dark:bg-blue-900/30 border-blue-100 dark:border-blue-800 text-blue-700 dark:text-blue-300 font-bold outline-none" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}>
                            {["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"].map((m, i) => (
                                <option key={i+1} value={(i+1).toString()} className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white">{m}</option>
                            ))}
                        </select>
                    </div>
                ) : (
                    <div>
                        <label className="block text-[10px] font-black text-indigo-500 uppercase mb-1">Hafta Seçiniz</label>
                        <select className="w-full p-2 border rounded-lg bg-indigo-50 dark:bg-indigo-900/30 border-indigo-100 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 font-bold outline-none" value={selectedWeek} onChange={e => setSelectedWeek(e.target.value)}>
                            {Array.from({length: 53}, (_, i) => i + 1).map(w => (
                                <option key={w} value={w.toString()} className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white">{w}. Hafta</option>
                            ))}
                        </select>
                    </div>
                )}

                <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Operatör</label>
                    <select className="w-full p-2 border rounded-lg bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:text-white outline-none font-bold" value={selectedOperator} onChange={e => setSelectedOperator(e.target.value)}>
                        <option value="ALL" className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white">Tüm Personel</option>
                        {uniqueOperators.map(op => <option key={op} value={op} className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white">{op}</option>)}
                    </select>
                </div>
                
                <div className="flex items-end">
                    <div className="bg-gray-100 dark:bg-gray-700 p-2 rounded-lg w-full text-center border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-bold">
                        {stats.chartData.length} Kayıt Gösteriliyor
                    </div>
                </div>
            </div>

            {/* SÜRE KARTLARI */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl border-l-8 border-l-blue-500 shadow-sm border border-gray-200 dark:border-gray-700">
                    <div className="text-gray-400 text-xs font-bold uppercase mb-1 flex items-center"><Layers className="w-4 h-4 mr-2"/> {filterType === 'MONTH' ? 'Aylık' : 'Haftalık'} Toplam Hazırlık</div>
                    <div className="text-3xl font-black text-gray-900 dark:text-white">{formatH(stats.prep)}</div>
                </div>
                <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl border-l-8 border-l-green-500 shadow-sm border border-gray-200 dark:border-gray-700">
                    <div className="text-gray-400 text-xs font-bold uppercase mb-1 flex items-center"><Zap className="w-4 h-4 mr-2"/> {filterType === 'MONTH' ? 'Aylık' : 'Haftalık'} CAM Süresi</div>
                    <div className="text-3xl font-black text-gray-900 dark:text-white">{formatH(stats.cam)}</div>
                </div>
                <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl border-l-8 border-l-orange-500 shadow-sm border border-gray-200 dark:border-gray-700">
                    <div className="text-gray-400 text-xs font-bold uppercase mb-1 flex items-center"><Clock className="w-4 h-4 mr-2"/> Toplantı / Diğer</div>
                    <div className="text-3xl font-black text-gray-900 dark:text-white">{formatH(stats.other)}</div>
                </div>
            </div>

            {/* GRAFİKLER (Mevcut Haftalık/Aylık Dağılımlar) */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Pasta Grafik */}
                <div className="lg:col-span-1 bg-white dark:bg-gray-800 p-6 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm">
                    <h3 className="font-bold text-gray-700 dark:text-gray-300 mb-6 flex items-center text-center justify-center">
                        Zaman Dağılım Özeti
                    </h3>
                    <div className="h-80 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie data={stats.pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={5} dataKey="value" label={renderCustomizedLabel}>
                                    {stats.pieData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                                </Pie>
                                <Tooltip 
                                    contentStyle={{ backgroundColor: '#1F2937', color: '#F3F4F6', borderRadius: '8px', border: '1px solid #374151' }} 
                                    itemStyle={{ color: '#F3F4F6' }}
                                    formatter={(value) => formatH(value)} 
                                />
                                <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Çubuk Grafik */}
                <div className="lg:col-span-2 bg-white dark:bg-gray-800 p-6 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm">
                    <h3 className="font-bold text-gray-700 dark:text-gray-300 mb-6 flex items-center">
                        <Filter className="w-5 h-5 mr-2 text-indigo-500"/> Personel Performans Karşılaştırması (Saat Bazlı)
                    </h3>
                    <div className="h-80 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={stats.chartData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" opacity={0.1} vertical={false} />
                                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#9CA3AF', fontSize: 12}} />
                                <YAxis axisLine={false} tickLine={false} tick={{fill: '#9CA3AF', fontSize: 12}} />
                                <Tooltip 
                                    cursor={{fill: 'rgba(156, 163, 175, 0.1)'}} 
                                    contentStyle={{ backgroundColor: '#1F2937', color: '#F3F4F6', borderRadius: '10px', border: '1px solid #374151', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.5)' }} 
                                    itemStyle={{ color: '#F3F4F6', fontWeight: 'bold' }} 
                                />
                                <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ fontSize: '12px', paddingBottom: '10px' }} />
                                
                                <Bar dataKey="Hazırlık" fill="#3B82F6" radius={[4, 4, 0, 0]} barSize={30} />
                                <Bar dataKey="CAM" fill="#10B981" radius={[4, 4, 0, 0]} barSize={30} />
                                <Bar dataKey="Diğer" fill="#F59E0B" radius={[4, 4, 0, 0]} barSize={30} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* GELİŞİM / TREND GRAFİĞİ (Tüm Yıla Göre Gelişim/Gerileme Analizi) */}
            <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm mt-6">
                <h3 className="font-bold text-gray-700 dark:text-gray-300 mb-6 flex items-center">
                    <TrendingUp className="w-5 h-5 mr-2 text-green-500"/> 
                    {filterType === 'MONTH' ? 'Aylara Göre Performans Trendi' : 'Haftalara Göre Performans Trendi'} (Saat Bazlı)
                </h3>
                <div className="h-80 w-full">
                    {trendData.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={trendData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" opacity={0.1} vertical={false} />
                                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#9CA3AF', fontSize: 12}} />
                                <YAxis axisLine={false} tickLine={false} tick={{fill: '#9CA3AF', fontSize: 12}} />
                                <Tooltip 
                                    cursor={{stroke: 'rgba(156, 163, 175, 0.2)', strokeWidth: 2}} 
                                    contentStyle={{ backgroundColor: '#1F2937', color: '#F3F4F6', borderRadius: '10px', border: '1px solid #374151', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.5)' }} 
                                    itemStyle={{ color: '#F3F4F6', fontWeight: 'bold' }} 
                                />
                                <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ fontSize: '12px', paddingBottom: '10px' }} />
                                
                                <Line type="monotone" dataKey="Hazırlık" stroke="#3B82F6" strokeWidth={3} dot={{r: 4, fill: '#3B82F6', strokeWidth: 2, stroke: '#fff'}} activeDot={{r: 6}} />
                                <Line type="monotone" dataKey="CAM" stroke="#10B981" strokeWidth={3} dot={{r: 4, fill: '#10B981', strokeWidth: 2, stroke: '#fff'}} activeDot={{r: 6}} />
                                <Line type="monotone" dataKey="Diğer" stroke="#F59E0B" strokeWidth={3} dot={{r: 4, fill: '#F59E0B', strokeWidth: 2, stroke: '#fff'}} activeDot={{r: 6}} />
                            </LineChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="flex items-center justify-center h-full text-gray-500 font-bold">
                            Bu yıl için gösterilecek trend verisi bulunmuyor.
                        </div>
                    )}
                </div>
            </div>

        </div>
    );
};

export default CamOperatorAnalysis;