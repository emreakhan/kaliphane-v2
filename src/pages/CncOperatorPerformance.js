// src/pages/CncOperatorPerformance.js

import React, { useState, useEffect, useMemo } from 'react';
import { 
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell 
} from 'recharts';
import { 
    Users, Filter, BarChart2, ShieldAlert, Clock, ChevronDown, ChevronUp, Activity, Calendar, AlertTriangle
} from 'lucide-react';
import { collection, query, where, onSnapshot } from '../config/firebase.js';
import { CNC_MEASUREMENTS_COLLECTION, ROLES, CNC_LATHE_MACHINES } from '../config/constants.js';

// --- YARDIMCI FONKSİYONLAR ---
const getStartOfDay = (date) => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
};

const getEndOfDay = (date) => {
    const d = new Date(date);
    d.setHours(23, 59, 59, 999);
    return d;
};

const formatTime = (isoString) => {
    if (!isoString) return '-';
    // Eğer date objesi gelirse stringe çevir, string gelirse direkt kullan
    const dateObj = typeof isoString === 'object' ? isoString : new Date(isoString);
    return dateObj.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
};

// Dakikayı "1sa 20dk" formatına çevirir
const formatDuration = (minutes) => {
    if (!minutes || isNaN(minutes) || minutes === Infinity) return '-';
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    if (h > 0) return `${h}sa ${m}dk`;
    return `${m}dk`;
};

const CncOperatorPerformance = ({ db, loggedInUser }) => {
    // ----------------------------------------------------
    // 1. TÜM HOOK'LAR EN ÜSTTE TANIMLANMALI (KOŞULSUZ)
    // ----------------------------------------------------
    
    // State'ler
    const [measurements, setMeasurements] = useState([]);
    const [loading, setLoading] = useState(false);
    const [operators, setOperators] = useState([]);
    const [expandedRow, setExpandedRow] = useState(null); // Tablo detay açma/kapama için
    
    // Filtreler
    const [selectedOperator, setSelectedOperator] = useState('ALL');
    const [selectedMachine, setSelectedMachine] = useState('ALL'); 
    const [dateRange, setDateRange] = useState('WEEK'); // TODAY, WEEK, MONTH, CUSTOM
    const [customStartDate, setCustomStartDate] = useState(new Date().toISOString().split('T')[0]);
    const [customEndDate, setCustomEndDate] = useState(new Date().toISOString().split('T')[0]);

    // Yetki Kontrolü Değişkeni
    const isSupervisor = 
        loggedInUser?.role === ROLES.CNC_TORNA_SORUMLUSU || 
        loggedInUser?.role === 'CNC Torna Sorumlusu';

    // 2. Verileri Çek
    useEffect(() => {
        if (!db || !isSupervisor) return; 

        setLoading(true);

        let start = new Date();
        let end = new Date();

        if (dateRange === 'TODAY') {
            start = getStartOfDay(new Date());
            end = getEndOfDay(new Date());
        } else if (dateRange === 'WEEK') {
            const today = new Date();
            const day = today.getDay() || 7; 
            if (day !== 1) today.setHours(-24 * (day - 1)); 
            start = getStartOfDay(today);
            end = getEndOfDay(new Date());
        } else if (dateRange === 'MONTH') {
            const date = new Date();
            start = new Date(date.getFullYear(), date.getMonth(), 1);
            end = getEndOfDay(new Date());
        } else if (dateRange === 'CUSTOM') {
            start = getStartOfDay(customStartDate);
            end = getEndOfDay(customEndDate);
        }

        const q = query(
            collection(db, CNC_MEASUREMENTS_COLLECTION),
            where('timestamp', '>=', start.toISOString()),
            where('timestamp', '<=', end.toISOString())
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map(d => d.data());
            // Tarihe göre sırala (Eskiden yeniye)
            data.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
            setMeasurements(data);
            
            // Operatör Listesini Çıkar
            const ops = [...new Set(data.map(m => m.operator).filter(o => o))];
            setOperators(ops.sort());
            
            setLoading(false);
        });

        return () => unsubscribe();
    }, [db, dateRange, customStartDate, customEndDate, isSupervisor]);

    // 3. İstatistikleri Hesapla
    const stats = useMemo(() => {
        if (!isSupervisor) return { totalCount: 0, machineData: [], chartData: [], intervalStats: [], overallAvgInterval: 0 };

        let filtered = measurements;
        if (selectedOperator !== 'ALL') {
            filtered = measurements.filter(m => m.operator === selectedOperator);
        }
        if (selectedMachine !== 'ALL') {
            filtered = filtered.filter(m => m.machine === selectedMachine);
        }

        // A. Toplam Ölçüm Sayısı
        const totalCount = filtered.length;

        // B. Tezgah Dağılımı
        const machineCounts = {};
        filtered.forEach(m => {
            machineCounts[m.machine] = (machineCounts[m.machine] || 0) + 1;
        });
        const machineData = Object.keys(machineCounts).map(key => ({
            name: key,
            count: machineCounts[key]
        })).sort((a, b) => b.count - a.count);

        // C. Günlük Gruplama
        const dailyGroups = {};
        filtered.forEach(m => {
            const dateKey = new Date(m.timestamp).toLocaleDateString('tr-TR', { year: 'numeric', month: '2-digit', day: '2-digit' }).split('.').reverse().join('-');
            if (!dailyGroups[dateKey]) dailyGroups[dateKey] = [];
            dailyGroups[dateKey].push(new Date(m.timestamp));
        });

        // D. Detaylı Aralık Analizi (Gap Analysis)
        const intervalStats = [];
        let totalIntervalSum = 0;
        let validDayCount = 0;
        const chartData = [];

        Object.keys(dailyGroups).sort().forEach(dateKey => {
            const times = dailyGroups[dateKey].sort((a, b) => a - b);
            const count = times.length;
            
            let avgInterval = 0;
            let firstTime = null;
            let lastTime = null;
            let maxInterval = 0; // En uzun ara (dakika)
            const gaps = []; // 60 dk üzeri boşluklar

            if (count > 1) {
                firstTime = times[0];
                lastTime = times[count - 1];
                
                // Aralıkları tek tek gez ve büyük boşlukları bul
                for (let i = 1; i < count; i++) {
                    const diffMs = times[i] - times[i-1];
                    const diffMin = diffMs / (1000 * 60);
                    
                    if (diffMin > maxInterval) maxInterval = diffMin;

                    // EĞER 60 DAKİKADAN FAZLA ARA VARSA KAYDET
                    if (diffMin > 60) {
                        gaps.push({
                            start: times[i-1],
                            end: times[i],
                            duration: diffMin
                        });
                    }
                }

                // Genel Ortalama (Son - İlk / Aralık Sayısı)
                const totalDurationMs = lastTime - firstTime;
                const totalDurationMin = totalDurationMs / (1000 * 60);
                avgInterval = totalDurationMin / (count - 1);
                
                totalIntervalSum += avgInterval;
                validDayCount++;
            } else if (count === 1) {
                firstTime = times[0];
                lastTime = times[0];
            }

            // Grafik
            chartData.push({
                date: new Date(dateKey).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }),
                count: count
            });

            // Tablo Verisi
            intervalStats.push({
                date: dateKey,
                count: count,
                firstTime: firstTime,
                lastTime: lastTime,
                avgInterval: avgInterval,
                maxInterval: maxInterval,
                gaps: gaps, // Büyük boşluklar listesi
                timestamps: times 
            });
        });

        const overallAvgInterval = validDayCount > 0 ? (totalIntervalSum / validDayCount) : 0;

        return { totalCount, machineData, chartData, intervalStats: intervalStats.reverse(), overallAvgInterval };

    }, [measurements, selectedOperator, selectedMachine, isSupervisor]);

    // 4. RENDER KISMI
    if (!isSupervisor) {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-gray-100 dark:bg-gray-900 text-gray-500">
                <ShieldAlert className="w-20 h-20 mb-4 text-red-500" />
                <h2 className="text-2xl font-bold text-gray-800 dark:text-white">Erişim Reddedildi</h2>
                <p>Bu sayfayı görüntüleme yetkiniz yok.</p>
            </div>
        );
    }

    return (
        <div className="p-6 max-w-7xl mx-auto min-h-screen bg-gray-100 dark:bg-gray-900 font-sans">
            
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-extrabold text-gray-900 dark:text-white flex items-center">
                        <Users className="w-8 h-8 mr-3 text-blue-600" />
                        Operatör Performans & Sıklık Takibi
                    </h1>
                    <p className="text-gray-500 dark:text-gray-400 mt-1">
                        Kontrol sıklığı ve ihmal edilen zaman aralıklarının analizi.
                    </p>
                </div>
                
                {/* HIZLI TARİH FİLTRELERİ */}
                <div className="flex bg-white dark:bg-gray-800 p-1 rounded-lg border border-gray-200 dark:border-gray-700">
                    {['TODAY', 'WEEK', 'MONTH', 'CUSTOM'].map((range) => (
                        <button
                            key={range}
                            onClick={() => setDateRange(range)}
                            className={`px-4 py-2 text-sm font-bold rounded-md transition ${
                                dateRange === range 
                                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' 
                                : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700'
                            }`}
                        >
                            {range === 'TODAY' ? 'Bugün' : range === 'WEEK' ? 'Bu Hafta' : range === 'MONTH' ? 'Bu Ay' : 'Özel'}
                        </button>
                    ))}
                </div>
            </div>

            {/* FİLTRE PANELİ */}
            <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 mb-6 grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                
                {/* Tarih Seçimi (Custom ise göster) */}
                {dateRange === 'CUSTOM' ? (
                    <div className="flex gap-2 col-span-1">
                        <div className="w-1/2">
                            <label className="block text-xs font-bold text-gray-500 mb-1">Başlangıç</label>
                            <input type="date" className="w-full p-2 border rounded bg-gray-50 dark:bg-gray-700 dark:text-white" value={customStartDate} onChange={e => setCustomStartDate(e.target.value)} />
                        </div>
                        <div className="w-1/2">
                            <label className="block text-xs font-bold text-gray-500 mb-1">Bitiş</label>
                            <input type="date" className="w-full p-2 border rounded bg-gray-50 dark:bg-gray-700 dark:text-white" value={customEndDate} onChange={e => setCustomEndDate(e.target.value)} />
                        </div>
                    </div>
                ) : (
                    <div className="col-span-1 flex items-center text-gray-400 text-sm">
                        <Calendar className="w-4 h-4 mr-2" /> Tarih aralığı seçiniz
                    </div>
                )}

                {/* Operatör Seçimi */}
                <div className="col-span-1">
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Personel Seçimi</label>
                    <div className="relative">
                        <Filter className="absolute left-3 top-2.5 text-gray-400 w-4 h-4" />
                        <select 
                            className="w-full pl-9 p-2 border rounded bg-gray-50 dark:bg-gray-700 dark:text-white appearance-none"
                            value={selectedOperator}
                            onChange={(e) => setSelectedOperator(e.target.value)}
                        >
                            <option value="ALL">Tüm Personel</option>
                            {operators.map((op, idx) => (
                                <option key={idx} value={op}>{op}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Tezgah Seçimi */}
                <div className="col-span-1">
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Tezgah Filtresi</label>
                    <div className="relative">
                        <Filter className="absolute left-3 top-2.5 text-gray-400 w-4 h-4" />
                        <select 
                            className="w-full pl-9 p-2 border rounded bg-gray-50 dark:bg-gray-700 dark:text-white appearance-none"
                            value={selectedMachine}
                            onChange={(e) => setSelectedMachine(e.target.value)}
                        >
                            <option value="ALL">Tüm Tezgahlar</option>
                            {CNC_LATHE_MACHINES.map((m, idx) => (
                                <option key={idx} value={m}>{m}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            {loading ? (
                <div className="text-center py-20 text-gray-500">Veriler yükleniyor...</div>
            ) : (
                <>
                    {/* ÖZET KARTLARI */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
                        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
                            <div className="flex justify-between items-start">
                                <div>
                                    <p className="text-gray-500 font-bold text-xs uppercase mb-1">Toplam Kontrol</p>
                                    <h2 className="text-3xl font-extrabold text-gray-800 dark:text-white">{stats.totalCount}</h2>
                                </div>
                                <Activity className="w-8 h-8 text-blue-500 opacity-50" />
                            </div>
                        </div>

                        <div className="bg-gradient-to-br from-indigo-500 to-purple-700 rounded-xl p-6 text-white shadow-lg col-span-1 md:col-span-2">
                            <div className="flex justify-between items-center">
                                <div>
                                    <p className="text-indigo-100 font-medium text-xs uppercase mb-1">Genel Ortalama Sıklık</p>
                                    <div className="flex items-baseline">
                                        <h2 className="text-4xl font-extrabold">
                                            {formatDuration(stats.overallAvgInterval)}
                                        </h2>
                                        <span className="ml-2 text-indigo-200 text-sm">/ kontrol</span>
                                    </div>
                                    <p className="text-indigo-200 text-xs mt-2 opacity-80">
                                        (Günlük ilk ve son ölçüm arası ortalama)
                                    </p>
                                </div>
                                <Clock className="w-12 h-12 opacity-30" />
                            </div>
                        </div>

                        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
                            <div className="flex justify-between items-start">
                                <div>
                                    <p className="text-gray-500 font-bold text-xs uppercase mb-1">En Aktif Tezgah</p>
                                    <h2 className="text-2xl font-bold text-gray-800 dark:text-white">
                                        {stats.machineData.length > 0 ? stats.machineData[0].name : '-'}
                                    </h2>
                                    <p className="text-xs text-gray-400 mt-1">
                                        {stats.machineData.length > 0 ? `${stats.machineData[0].count} Ölçüm` : ''}
                                    </p>
                                </div>
                                <BarChart2 className="w-8 h-8 text-green-500 opacity-50" />
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        
                        {/* SOL: DETAYLI GÜNLÜK TABLO */}
                        <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                            <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
                                <h3 className="font-bold text-gray-800 dark:text-white flex items-center">
                                    <Clock className="w-5 h-5 mr-2 text-blue-600" />
                                    Günlük Aktivite & Aralık Analizi
                                </h3>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-gray-50 dark:bg-gray-900/50 text-xs uppercase text-gray-500">
                                        <tr>
                                            <th className="px-4 py-3">Tarih</th>
                                            <th className="px-4 py-3 text-center">Adet</th>
                                            <th className="px-4 py-3 text-center">Ort. Sıklık</th>
                                            <th className="px-4 py-3 text-center">En Uzun Ara</th>
                                            <th className="px-4 py-3 text-right">Detay</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                                        {stats.intervalStats.length > 0 ? (
                                            stats.intervalStats.map((day, idx) => (
                                                <React.Fragment key={idx}>
                                                    <tr className={`hover:bg-gray-50 dark:hover:bg-gray-700/50 transition ${expandedRow === idx ? 'bg-blue-50 dark:bg-blue-900/10' : ''}`}>
                                                        <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                                                            {new Date(day.date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}
                                                            <div className="text-xs text-gray-400 font-normal">
                                                                {formatTime(day.firstTime)} - {formatTime(day.lastTime)}
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-3 text-center">
                                                            <span className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-xs font-bold">
                                                                {day.count}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3 text-center">
                                                            {day.avgInterval > 0 ? (
                                                                <span className="font-bold text-gray-700 dark:text-gray-300">
                                                                    {formatDuration(day.avgInterval)}
                                                                </span>
                                                            ) : (
                                                                <span className="text-gray-400 text-xs">-</span>
                                                            )}
                                                        </td>
                                                        {/* EN UZUN ARA - EĞER 60DK ÜSTÜYSE KIRMIZI */}
                                                        <td className="px-4 py-3 text-center">
                                                            {day.maxInterval > 60 ? (
                                                                <span className="flex items-center justify-center text-red-600 font-bold bg-red-100 dark:bg-red-900/30 px-2 py-1 rounded">
                                                                    <AlertTriangle className="w-3 h-3 mr-1"/>
                                                                    {formatDuration(day.maxInterval)}
                                                                </span>
                                                            ) : (
                                                                <span className="text-green-600 font-medium">
                                                                    {formatDuration(day.maxInterval)}
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td className="px-4 py-3 text-right">
                                                            <button 
                                                                onClick={() => setExpandedRow(expandedRow === idx ? null : idx)}
                                                                className="text-blue-600 hover:text-blue-800 p-1 rounded hover:bg-blue-100 transition"
                                                            >
                                                                {expandedRow === idx ? <ChevronUp className="w-4 h-4"/> : <ChevronDown className="w-4 h-4"/>}
                                                            </button>
                                                        </td>
                                                    </tr>
                                                    {/* GENİŞLETİLMİŞ DETAY */}
                                                    {expandedRow === idx && (
                                                        <tr className="bg-gray-50 dark:bg-gray-800/50">
                                                            <td colSpan="5" className="px-4 py-3">
                                                                
                                                                {/* İHMAL LİSTESİ (Varsa) */}
                                                                {day.gaps.length > 0 && (
                                                                    <div className="mb-3 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded">
                                                                        <div className="text-xs font-bold text-red-700 dark:text-red-400 uppercase mb-1 flex items-center">
                                                                            <AlertTriangle className="w-3 h-3 mr-1"/>
                                                                            Dikkat: Uzun Süreli Duruşlar (60dk Üzeri)
                                                                        </div>
                                                                        <ul className="text-xs text-red-600 dark:text-red-300 list-disc list-inside">
                                                                            {day.gaps.map((g, gIdx) => (
                                                                                <li key={gIdx}>
                                                                                    {formatTime(g.start)} - {formatTime(g.end)} arasında 
                                                                                    <strong> {formatDuration(g.duration)} </strong> boşluk.
                                                                                </li>
                                                                            ))}
                                                                        </ul>
                                                                    </div>
                                                                )}

                                                                {/* TÜM SAATLER */}
                                                                <div className="text-xs text-gray-500 mb-2 font-bold uppercase">Tüm Kontrol Saatleri:</div>
                                                                <div className="flex flex-wrap gap-2">
                                                                    {day.timestamps.map((t, tIdx) => (
                                                                        <span key={tIdx} className="bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 px-2 py-1 rounded text-xs text-gray-700 dark:text-gray-300 font-mono shadow-sm">
                                                                            {formatTime(t)}
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    )}
                                                </React.Fragment>
                                            ))
                                        ) : (
                                            <tr>
                                                <td colSpan="5" className="px-4 py-8 text-center text-gray-400">Veri bulunamadı.</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* SAĞ: GRAFİK (Günlük Adet) */}
                        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 h-96">
                            <h3 className="font-bold text-gray-700 dark:text-gray-200 mb-6 flex items-center">
                                <BarChart2 className="w-5 h-5 mr-2 text-purple-600" />
                                Günlük Kontrol Adetleri
                            </h3>
                            {stats.chartData.length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={stats.chartData}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                                        <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fill: '#888', fontSize: 10}} dy={10} />
                                        <YAxis axisLine={false} tickLine={false} tick={{fill: '#888', fontSize: 12}} />
                                        <Tooltip 
                                            contentStyle={{ backgroundColor: '#1f2937', color: '#fff', border: 'none', borderRadius: '8px' }}
                                            itemStyle={{ color: '#fff' }}
                                            cursor={{ fill: 'rgba(0,0,0,0.05)' }}
                                        />
                                        <Bar dataKey="count" name="Ölçüm Sayısı" radius={[4, 4, 0, 0]}>
                                            {stats.chartData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={entry.count < 5 ? '#EF4444' : '#3B82F6'} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center text-gray-400">
                                    <BarChart2 className="w-16 h-16 mb-4 opacity-20" />
                                    <p>Görüntülenecek veri yok.</p>
                                </div>
                            )}
                        </div>

                    </div>
                </>
            )}
        </div>
    );
};

export default CncOperatorPerformance;