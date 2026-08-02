// src/pages/ProductDevPerformancePage.js

import React, { useMemo } from 'react';
import { TrendingUp, Award, CheckCircle2, Clock } from 'lucide-react';
import { DESIGN_JOB_STATUS } from '../config/constants.js';

const ProductDevPerformancePage = ({ designJobs = [], personnel = [] }) => {
    const designerPerformance = useMemo(() => {
        const map = {};
        designJobs.forEach(job => {
            const dName = job.assignedDesigner || 'Atanmamış';
            if (!map[dName]) map[dName] = { total: 0, completed: 0, totalEst: 0, totalSpent: 0 };
            map[dName].total += 1;
            if (job.status === DESIGN_JOB_STATUS.COMPLETED) map[dName].completed += 1;
            map[dName].totalEst += (parseFloat(job.estimatedHours) || 0);

            if (job.workSessions) {
                job.workSessions.forEach(s => {
                    if (s.startTime && s.endTime) {
                        const st = new Date(s.startTime);
                        const et = new Date(s.endTime);
                        if (st < et) map[dName].totalSpent += (et - st) / (1000 * 60 * 60);
                    }
                });
            }
        });

        return Object.entries(map).map(([name, data]) => {
            const completionRate = data.total > 0 ? (data.completed / data.total) * 100 : 0;
            const efficiencyRate = data.totalEst > 0 ? (data.totalSpent / data.totalEst) * 100 : 0;
            return { name, ...data, completionRate, efficiencyRate };
        });
    }, [designJobs]);

    return (
        <div className="p-4 max-w-7xl mx-auto space-y-6">
            <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 flex justify-between items-center">
                <div>
                    <h2 className="text-lg font-bold text-gray-800 dark:text-white flex items-center">
                        <TrendingUp className="w-5 h-5 mr-2 text-amber-500" /> Ürün Geliştirme Performans & Verimlilik Raporu
                    </h2>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Personellerin tamamladığı ürün geliştirme projeleri ve süre sapma analizi.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {designerPerformance.map((p) => (
                    <div key={p.name} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5 space-y-4">
                        <div className="flex justify-between items-center border-b border-gray-100 dark:border-gray-700 pb-3">
                            <h3 className="font-bold text-gray-900 dark:text-white text-base flex items-center">
                                <Award className="w-4 h-4 mr-2 text-amber-500" /> {p.name}
                            </h3>
                            <span className="px-2 py-1 bg-amber-50 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 rounded-lg text-xs font-bold">
                                {p.completed}/{p.total} İş Bitti
                            </span>
                        </div>

                        <div className="space-y-3 text-xs">
                            <div>
                                <div className="flex justify-between text-gray-600 dark:text-gray-300 font-bold mb-1">
                                    <span>Tamamlama Oranı</span>
                                    <span>%{p.completionRate.toFixed(0)}</span>
                                </div>
                                <div className="w-full bg-gray-200 dark:bg-gray-700 h-2.5 rounded-full overflow-hidden">
                                    <div className="bg-emerald-500 h-full rounded-full transition-all" style={{ width: `${p.completionRate}%` }} />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-100 dark:border-gray-700 text-gray-700 dark:text-gray-300">
                                <div className="bg-gray-50 dark:bg-gray-900 p-2.5 rounded-lg">
                                    <span className="text-[10px] text-gray-400 font-bold block uppercase">Planlanan Süre</span>
                                    <span className="text-sm font-black">{p.totalEst.toFixed(1)} Saat</span>
                                </div>
                                <div className="bg-gray-50 dark:bg-gray-900 p-2.5 rounded-lg">
                                    <span className="text-[10px] text-gray-400 font-bold block uppercase">Harcanan Süre</span>
                                    <span className="text-sm font-black text-amber-600 dark:text-amber-400">{p.totalSpent.toFixed(1)} Saat</span>
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default ProductDevPerformancePage;
