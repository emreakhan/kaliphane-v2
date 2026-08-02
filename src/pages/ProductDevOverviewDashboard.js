// src/pages/ProductDevOverviewDashboard.js

import React, { useMemo } from 'react';
import { Briefcase, PlayCircle, CheckCircle, Clock, Users, TrendingUp, Sparkles } from 'lucide-react';
import { DESIGN_JOB_STATUS } from '../config/constants.js';

const ProductDevOverviewDashboard = ({ designJobs = [], personnel = [] }) => {
    const stats = useMemo(() => {
        const totalJobs = designJobs.length;
        const activeJobs = designJobs.filter(j => j.status !== DESIGN_JOB_STATUS.COMPLETED);
        const runningJobs = designJobs.filter(j => j.status === DESIGN_JOB_STATUS.IN_PROGRESS);
        const completedJobs = designJobs.filter(j => j.status === DESIGN_JOB_STATUS.COMPLETED);

        const totalEst = designJobs.reduce((sum, j) => sum + (parseFloat(j.estimatedHours) || 0), 0);
        
        let totalSpent = 0;
        designJobs.forEach(job => {
            if (job.workSessions && Array.isArray(job.workSessions)) {
                job.workSessions.forEach(session => {
                    if (session.startTime && session.endTime) {
                        const start = new Date(session.startTime);
                        const end = new Date(session.endTime);
                        if (start < end) {
                            totalSpent += (end - start) / (1000 * 60 * 60);
                        }
                    }
                });
            }
        });

        return {
            totalJobs,
            activeCount: activeJobs.length,
            runningCount: runningJobs.length,
            completedCount: completedJobs.length,
            totalEst,
            totalSpent
        };
    }, [designJobs]);

    const designerStats = useMemo(() => {
        const map = {};
        designJobs.forEach(job => {
            const dName = job.assignedDesigner || 'Atanmamış';
            if (!map[dName]) map[dName] = { total: 0, completed: 0, running: 0, estHours: 0, spentHours: 0 };
            map[dName].total += 1;
            if (job.status === DESIGN_JOB_STATUS.COMPLETED) map[dName].completed += 1;
            if (job.status === DESIGN_JOB_STATUS.IN_PROGRESS) map[dName].running += 1;
            map[dName].estHours += (parseFloat(job.estimatedHours) || 0);

            if (job.workSessions) {
                job.workSessions.forEach(session => {
                    if (session.startTime && session.endTime) {
                        const s = new Date(session.startTime);
                        const e = new Date(session.endTime);
                        if (s < e) map[dName].spentHours += (e - s) / (1000 * 60 * 60);
                    }
                });
            }
        });
        return Object.entries(map).map(([name, val]) => ({ name, ...val }));
    }, [designJobs]);

    return (
        <div className="p-4 max-w-7xl mx-auto space-y-6">
            {/* KPI KARTLARI */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 flex items-center space-x-4">
                    <div className="p-3 bg-amber-100 dark:bg-amber-900/40 text-amber-600 rounded-lg">
                        <Briefcase className="w-6 h-6" />
                    </div>
                    <div>
                        <p className="text-xs text-gray-500 font-bold uppercase">Aktif Görevler</p>
                        <h3 className="text-2xl font-black text-gray-800 dark:text-white">{stats.activeCount}</h3>
                        <p className="text-[10px] text-gray-400">Toplam {stats.totalJobs} görev içerisinden</p>
                    </div>
                </div>

                <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 flex items-center space-x-4">
                    <div className="p-3 bg-green-100 dark:bg-green-900/40 text-green-600 rounded-lg">
                        <PlayCircle className="w-6 h-6" />
                    </div>
                    <div>
                        <p className="text-xs text-gray-500 font-bold uppercase">Şu An Devam Eden</p>
                        <h3 className="text-2xl font-black text-gray-800 dark:text-white">{stats.runningCount}</h3>
                        <p className="text-[10px] text-gray-400">Sayaç işleyen görev sayısı</p>
                    </div>
                </div>

                <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 flex items-center space-x-4">
                    <div className="p-3 bg-blue-100 dark:bg-blue-900/40 text-blue-600 rounded-lg">
                        <CheckCircle className="w-6 h-6" />
                    </div>
                    <div>
                        <p className="text-xs text-gray-500 font-bold uppercase">Tamamlanan Görevler</p>
                        <h3 className="text-2xl font-black text-gray-800 dark:text-white">{stats.completedCount}</h3>
                        <p className="text-[10px] text-gray-400">Başarıyla bitirilen işler</p>
                    </div>
                </div>

                <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 flex items-center space-x-4">
                    <div className="p-3 bg-purple-100 dark:bg-purple-900/40 text-purple-600 rounded-lg">
                        <Clock className="w-6 h-6" />
                    </div>
                    <div>
                        <p className="text-xs text-gray-500 font-bold uppercase">Toplam Harcanan Süre</p>
                        <h3 className="text-2xl font-black text-gray-800 dark:text-white">{stats.totalSpent.toFixed(1)} Saat</h3>
                        <p className="text-[10px] text-gray-400">Hedeflenen: {stats.totalEst.toFixed(1)} Saat</p>
                    </div>
                </div>
            </div>

            {/* PERSONEL BAZLI TABLO */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5 space-y-4">
                <h3 className="text-base font-bold text-gray-800 dark:text-white flex items-center">
                    <Users className="w-5 h-5 mr-2 text-amber-500" /> Personel Ürün Geliştirme İstatistikleri
                </h3>

                <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs text-gray-700 dark:text-gray-200">
                        <thead className="bg-gray-50 dark:bg-gray-900 text-gray-500 dark:text-gray-400 uppercase font-bold text-[10px]">
                            <tr>
                                <th className="p-3">Personel</th>
                                <th className="p-3">Toplam Görev</th>
                                <th className="p-3">Devam Eden</th>
                                <th className="p-3">Tamamlanan</th>
                                <th className="p-3">Planlanan Süre</th>
                                <th className="p-3">Harcanan Süre</th>
                                <th className="p-3">Performans Oranı</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                            {designerStats.map((row) => {
                                const ratio = row.estHours > 0 ? (row.spentHours / row.estHours) * 100 : 0;
                                return (
                                    <tr key={row.name} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                        <td className="p-3 font-bold text-gray-900 dark:text-white">{row.name}</td>
                                        <td className="p-3">{row.total}</td>
                                        <td className="p-3 text-amber-600 font-bold">{row.running}</td>
                                        <td className="p-3 text-green-600 font-bold">{row.completed}</td>
                                        <td className="p-3 font-medium">{row.estHours.toFixed(1)} Saat</td>
                                        <td className="p-3 font-bold text-indigo-600 dark:text-indigo-400">{row.spentHours.toFixed(1)} Saat</td>
                                        <td className="p-3">
                                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${ratio > 110 ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
                                                %{ratio.toFixed(0)}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                            {designerStats.length === 0 && (
                                <tr>
                                    <td colSpan="7" className="p-6 text-center text-gray-400">Veri bulunamadı.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default ProductDevOverviewDashboard;
