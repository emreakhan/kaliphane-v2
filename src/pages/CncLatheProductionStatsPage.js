// src/pages/CncLatheProductionStatsPage.js
import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot, orderBy } from '../config/firebase.js';
import { CNC_LATHE_JOBS_COLLECTION } from '../config/constants.js';
import { formatDateTime } from '../utils/dateUtils.js';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts';

const CncLatheProductionStatsPage = ({ db }) => {
    const [allJobs, setAllJobs] = useState([]);
    const [selectedPart, setSelectedPart] = useState('all');
    const [timeRange, setTimeRange] = useState('monthly'); // daily, weekly, monthly, yearly

    // Tüm tamamlanmış işleri çek
    useEffect(() => {
        if (!db) return;
        const q = query(
            collection(db, CNC_LATHE_JOBS_COLLECTION),
            where('status', '==', 'COMPLETED'),
            orderBy('endTime', 'desc')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const jobs = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setAllJobs(jobs);
        });

        return () => unsubscribe();
    }, [db]);

    // Benzersiz parça listesi (Resim No öncelikli)
    const uniqueParts = useMemo(() => {
        const parts = allJobs
            .filter(job => job.technicalDrawingNo || job.partName)
            .map(job => ({
                value: job.technicalDrawingNo || job.partName,
                label: job.technicalDrawingNo ? `${job.technicalDrawingNo} - ${job.partName}` : job.partName
            }));
        
        // Tekrarları kaldır
        const unique = Array.from(new Map(parts.map(item => [item.value, item])).values());
        return [{ value: 'all', label: 'Tüm Parçalar' }, ...unique];
    }, [allJobs]);

    // Filtreli veriler
    const filteredJobs = useMemo(() => {
        return allJobs.filter(job => {
            if (selectedPart === 'all') return true;
            return (job.technicalDrawingNo === selectedPart) || (job.partName === selectedPart);
        });
    }, [allJobs, selectedPart]);

    // Zaman aralığına göre gruplanmış üretim verisi
    const productionData = useMemo(() => {
        // Bu kısım daha sonra detaylandıracağız
        return [];
    }, [filteredJobs, timeRange]);

    return (
        <div className="p-6 max-w-7xl mx-auto">
            <h1 className="text-3xl font-extrabold text-gray-900 dark:text-white mb-8 flex items-center">
                📊 Üretim İstatistikleri & Öngörü
            </h1>

            {/* Filtreler */}
            <div className="bg-white dark:bg-gray-800 p-5 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 mb-8">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <label className="block text-sm font-medium mb-2">Parça Seç</label>
                        <select 
                            value={selectedPart}
                            onChange={(e) => setSelectedPart(e.target.value)}
                            className="w-full p-3 border rounded-lg bg-gray-50 dark:bg-gray-700 dark:text-white"
                        >
                            {uniqueParts.map(part => (
                                <option key={part.value} value={part.value}>
                                    {part.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-2">Zaman Aralığı</label>
                        <div className="flex gap-2">
                            {['daily', 'weekly', 'monthly', 'yearly'].map(range => (
                                <button
                                    key={range}
                                    onClick={() => setTimeRange(range)}
                                    className={`flex-1 py-3 rounded-lg font-medium transition ${
                                        timeRange === range 
                                            ? 'bg-blue-600 text-white' 
                                            : 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600'
                                    }`}
                                >
                                    {range === 'daily' && 'Günlük'}
                                    {range === 'weekly' && 'Haftalık'}
                                    {range === 'monthly' && 'Aylık'}
                                    {range === 'yearly' && 'Yıllık'}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Grafikler */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border">
                    <h2 className="text-xl font-bold mb-4">Üretim Miktarı Grafiği</h2>
                    <ResponsiveContainer width="100%" height={400}>
                        <BarChart data={productionData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="period" />
                            <YAxis />
                            <Tooltip />
                            <Legend />
                            <Bar dataKey="produced" fill="#3b82f6" name="Üretilen Adet" />
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border">
                    <h2 className="text-xl font-bold mb-4">Üretim Trendi & Öngörü</h2>
                    <ResponsiveContainer width="100%" height={400}>
                        <LineChart data={productionData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="period" />
                            <YAxis />
                            <Tooltip />
                            <Legend />
                            <Line type="monotone" dataKey="produced" stroke="#3b82f6" strokeWidth={3} name="Gerçek Üretim" />
                            <Line type="monotone" dataKey="forecast" stroke="#ef4444" strokeDasharray="5 5" name="Öngörü" />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Özet Kartlar */}
            <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border text-center">
                    <p className="text-gray-500">Toplam Üretim</p>
                    <p className="text-4xl font-bold text-blue-600 mt-2">
                        {filteredJobs.reduce((sum, job) => sum + (parseInt(job.producedQuantity) || 0), 0)}
                    </p>
                </div>
                {/* Diğer kartlar eklenebilir */}
            </div>
        </div>
    );
};

export default CncLatheProductionStatsPage;