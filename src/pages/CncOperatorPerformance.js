// src/pages/CncOperatorPerformance.js

import React, { useState, useEffect, useMemo } from 'react';
import { 
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell 
} from 'recharts';
import { 
    Users, Calendar, Filter, BarChart2, AlertTriangle, ShieldAlert 
} from 'lucide-react';
import { collection, query, where, getDocs, onSnapshot } from '../config/firebase.js';
import { CNC_MEASUREMENTS_COLLECTION, ROLES } from '../config/constants.js';

// --- TARİH YARDIMCILARI ---
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

const CncOperatorPerformance = ({ db, loggedInUser }) => {
    // 1. TÜM HOOK'LAR EN ÜSTTE TANIMLANMALI
    
    // State'ler
    const [measurements, setMeasurements] = useState([]);
    const [loading, setLoading] = useState(false);
    const [operators, setOperators] = useState([]);
    
    // Filtreler
    const [selectedOperator, setSelectedOperator] = useState('ALL');
    const [dateRange, setDateRange] = useState('WEEK'); // TODAY, WEEK, MONTH, CUSTOM
    const [customStartDate, setCustomStartDate] = useState(new Date().toISOString().split('T')[0]);
    const [customEndDate, setCustomEndDate] = useState(new Date().toISOString().split('T')[0]);

    // Yetki Kontrolü Değişkeni (Hook'lardan önce return YAPILMAZ)
    const isSupervisor = 
        loggedInUser?.role === ROLES.CNC_TORNA_SORUMLUSU || 
        loggedInUser?.role === 'CNC Torna Sorumlusu';

    // 2. Verileri Çek (useEffect içinde yetki kontrolü yapılır)
    useEffect(() => {
        if (!db || !isSupervisor) return; // Yetki yoksa işlem yapma

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

        // Sorgu
        const q = query(
            collection(db, CNC_MEASUREMENTS_COLLECTION),
            where('timestamp', '>=', start.toISOString()),
            where('timestamp', '<=', end.toISOString())
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map(d => d.data());
            setMeasurements(data);
            
            // Operatör Listesini Çıkar (Uniq)
            const ops = [...new Set(data.map(m => m.operator).filter(o => o))];
            setOperators(ops.sort());
            
            setLoading(false);
        });

        return () => unsubscribe();
    }, [db, dateRange, customStartDate, customEndDate, isSupervisor]);

    // 3. İstatistikleri Hesapla (useMemo içinde yetki kontrolü yapılır)
    const stats = useMemo(() => {
        if (!isSupervisor) return { totalCount: 0, machineData: [], chartData: [] };

        let filtered = measurements;
        if (selectedOperator !== 'ALL') {
            filtered = measurements.filter(m => m.operator === selectedOperator);
        }

        // A. Toplam Ölçüm Sayısı
        const totalCount = filtered.length;

        // B. Tezgah Bazlı Dağılım
        const machineCounts = {};
        filtered.forEach(m => {
            machineCounts[m.machine] = (machineCounts[m.machine] || 0) + 1;
        });
        const machineData = Object.keys(machineCounts).map(key => ({
            name: key,
            count: machineCounts[key]
        })).sort((a, b) => b.count - a.count);

        // C. Günlük Performans (Grafik İçin)
        const dailyCounts = {};
        filtered.forEach(m => {
            const dateKey = new Date(m.timestamp).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
            dailyCounts[dateKey] = (dailyCounts[dateKey] || 0) + 1;
        });
        
        const chartData = Object.keys(dailyCounts).map(key => ({
            date: key,
            count: dailyCounts[key]
        }));

        return { totalCount, machineData, chartData };
    }, [measurements, selectedOperator, isSupervisor]);

    // 4. RENDER KISMI (Koşullu render burada yapılır)
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
                        Operatör Performans Takibi
                    </h1>
                    <p className="text-gray-500 dark:text-gray-400 mt-1">
                        Personelin ölçüm sıklığı ve tezgah bazlı aktivite analizi.
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
            <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 mb-6 flex flex-col md:flex-row gap-4 items-end">
                
                {/* Tarih Seçimi (Custom ise göster) */}
                {dateRange === 'CUSTOM' && (
                    <div className="flex gap-2">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1">Başlangıç</label>
                            <input type="date" className="p-2 border rounded bg-gray-50 dark:bg-gray-700 dark:text-white" value={customStartDate} onChange={e => setCustomStartDate(e.target.value)} />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1">Bitiş</label>
                            <input type="date" className="p-2 border rounded bg-gray-50 dark:bg-gray-700 dark:text-white" value={customEndDate} onChange={e => setCustomEndDate(e.target.value)} />
                        </div>
                    </div>
                )}

                {/* Operatör Seçimi */}
                <div className="flex-1">
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
            </div>

            {loading ? (
                <div className="text-center py-20 text-gray-500">Veriler yükleniyor...</div>
            ) : (
                <>
                    {/* ÖZET KARTLARI */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                        {/* Toplam Ölçüm Kartı */}
                        <div className="bg-gradient-to-br from-blue-500 to-blue-700 rounded-xl p-6 text-white shadow-lg">
                            <div className="flex justify-between items-start">
                                <div>
                                    <p className="text-blue-100 font-medium text-sm mb-1">Toplam Kontrol Sayısı</p>
                                    <h2 className="text-4xl font-extrabold">{stats.totalCount}</h2>
                                    <p className="text-blue-200 text-xs mt-2">
                                        {selectedOperator === 'ALL' ? 'Tüm personel' : selectedOperator}
                                    </p>
                                </div>
                                <ActivityIcon className="w-10 h-10 opacity-30" />
                            </div>
                        </div>

                        {/* Tezgah Dağılım Kartı */}
                        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700 col-span-2">
                            <h3 className="font-bold text-gray-700 dark:text-gray-200 mb-4 text-sm uppercase">Tezgah Bazlı Kontrol Dağılımı</h3>
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                                {stats.machineData.length > 0 ? (
                                    stats.machineData.map((m) => (
                                        <div key={m.name} className="flex flex-col items-center p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-100 dark:border-gray-600">
                                            <span className="text-xs font-bold text-gray-500 mb-1">{m.name}</span>
                                            <span className="text-xl font-black text-blue-600 dark:text-blue-400">{m.count}</span>
                                            <span className="text-[10px] text-gray-400">Ölçüm</span>
                                        </div>
                                    ))
                                ) : (
                                    <div className="text-gray-400 text-sm col-span-4">Kayıt bulunamadı.</div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* GRAFİK ALANI */}
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 h-96">
                        <h3 className="font-bold text-gray-700 dark:text-gray-200 mb-6 flex items-center">
                            <BarChart2 className="w-5 h-5 mr-2 text-purple-600" />
                            Zaman Çizelgesi (Günlük Aktivite)
                        </h3>
                        {stats.chartData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={stats.chartData}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fill: '#888', fontSize: 12}} dy={10} />
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
                </>
            )}
        </div>
    );
};

// Basit ikon bileşeni
const ActivityIcon = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
);

export default CncOperatorPerformance;