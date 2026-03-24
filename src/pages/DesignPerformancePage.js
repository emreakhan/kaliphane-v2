// src/pages/DesignPerformancePage.js

import React, { useState, useMemo } from 'react';
import { UserCircle, Star, Clock, Calendar as CalendarIcon, CheckCircle, XCircle, AlertTriangle, TrendingUp, Award, Target } from 'lucide-react';
import { DESIGN_JOB_STATUS, PERSONNEL_ROLES } from '../config/constants.js';

// Tarihleri güvenli parse etmek için yardımcı fonksiyon
const safeParseDate = (dateStr) => {
    if (!dateStr) return null;
    if (dateStr.includes('.')) {
        const parts = dateStr.split(' ');
        const dateParts = parts[0].split('.');
        const timePart = parts[1] || '00:00:00';
        return new Date(`${dateParts[2]}-${dateParts[1]}-${dateParts[0]}T${timePart}`);
    }
    return new Date(dateStr);
};

const formatHours = (hours) => {
    if (!hours || isNaN(hours)) return "0 Saat";
    return `${hours.toFixed(1)} Saat`;
};

const DesignPerformancePage = ({ designJobs, personnel }) => {
    
    // Tasarımcıları filtrele
    const designers = useMemo(() => {
        return personnel
            .filter(p => p.role === PERSONNEL_ROLES.KALIP_TASARIM_SORUMLUSU)
            .map(p => p.name)
            .sort((a, b) => a.localeCompare(b, 'tr'));
    }, [personnel]);

    const [selectedDesigner, setSelectedDesigner] = useState(designers[0] || '');

    // Seçili personelin tamamlanmış işlerini analiz et
    const performanceData = useMemo(() => {
        if (!designJobs || !selectedDesigner) return { jobs: [], stats: null };

        const completedJobs = designJobs.filter(j => 
            j.assignedDesigner === selectedDesigner && 
            j.status === DESIGN_JOB_STATUS.COMPLETED
        ).sort((a, b) => safeParseDate(b.completedAt) - safeParseDate(a.completedAt)); // En son biten en üstte

        let totalScore = 0;
        let perfectCount = 0;
        let halfPointCount = 0;
        let failCount = 0;

        const evaluatedJobs = completedJobs.map(job => {
            // Gerçek Harcanan Süreyi Hesapla (Net Çalışma)
            let actualHours = 0;
            if (job.workSessions) {
                job.workSessions.forEach(ws => {
                    if (ws.startTime && ws.endTime) {
                        const start = new Date(ws.startTime);
                        const end = new Date(ws.endTime);
                        actualHours += (end - start) / (1000 * 60 * 60);
                    }
                });
            }

            const estimated = parseFloat(job.estimatedHours) || 0;
            // 0.1 saatlik (6 dk) ufak esneme payı (tolerans) eklenebilir
            const isHoursOk = actualHours <= estimated + 0.1; 

            // Termin Tarihi Değerlendirmesi
            let isDeadlineOk = true;
            if (job.deadlineDate && job.completedAt) {
                const deadline = new Date(job.deadlineDate + 'T23:59:59'); // O günün sonu
                const completed = safeParseDate(job.completedAt);
                if (completed && completed > deadline) {
                    isDeadlineOk = false;
                }
            }

            // Puanlama Algoritması
            let score = 0;
            let statusText = '';
            let statusColor = '';

            if (isHoursOk && isDeadlineOk) {
                score = 100;
                perfectCount++;
                statusText = 'Kusursuz (Süre ve Termin Tuttu)';
                statusColor = 'bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800';
            } else if (isHoursOk && !isDeadlineOk) {
                score = 50;
                halfPointCount++;
                statusText = 'Yarım Puan (Süre Tuttu, Termin Kaçtı)';
                statusColor = 'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800';
            } else if (!isHoursOk && isDeadlineOk) {
                score = 50;
                halfPointCount++;
                statusText = 'Yarım Puan (Termin Tuttu, Süre Aşıldı)';
                statusColor = 'bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800';
            } else {
                score = 0;
                failCount++;
                statusText = 'Başarısız (Süre ve Termin Aşıldı)';
                statusColor = 'bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800';
            }

            totalScore += score;

            return {
                ...job,
                actualHours,
                isHoursOk,
                isDeadlineOk,
                score,
                statusText,
                statusColor
            };
        });

        const avgScore = completedJobs.length > 0 ? Math.round(totalScore / completedJobs.length) : 0;

        return {
            jobs: evaluatedJobs,
            stats: {
                totalCount: completedJobs.length,
                avgScore,
                perfectCount,
                halfPointCount,
                failCount
            }
        };

    }, [designJobs, selectedDesigner]);

    const stats = performanceData.stats;

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            
            {/* ÜST KONTROL BAR */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 flex flex-col md:flex-row justify-between items-center gap-4">
                <div className="flex items-center">
                    <TrendingUp className="w-6 h-6 text-indigo-500 mr-3" />
                    <div>
                        <h2 className="font-bold text-gray-800 dark:text-white text-lg">Personel Performans Analizi</h2>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Tamamlanan işlerin saat ve termin uyumu değerlendirmesi.</p>
                    </div>
                </div>

                <div className="flex items-center w-full md:w-auto">
                    <UserCircle className="w-5 h-5 text-gray-400 mr-2" />
                    <select 
                        value={selectedDesigner} 
                        onChange={(e) => setSelectedDesigner(e.target.value)}
                        className="p-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg font-bold text-gray-700 dark:text-gray-200 outline-none focus:ring-2 focus:ring-indigo-500 flex-1 md:w-64 cursor-pointer shadow-sm"
                    >
                        {designers.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                </div>
            </div>

            {stats && stats.totalCount === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 text-center px-4">
                    <Award className="w-16 h-16 text-gray-300 dark:text-gray-600 mb-4" />
                    <h3 className="text-xl font-bold text-gray-700 dark:text-gray-300 mb-2">Henüz Tamamlanan İş Yok</h3>
                    <p className="text-gray-500 dark:text-gray-500">Bu personelin değerlendirilecek bitmiş bir tasarım görevi bulunmuyor.</p>
                </div>
            ) : stats ? (
                <>
                    {/* ÖZET KARTLARI */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        
                        {/* Genel Puan */}
                        <div className="bg-white dark:bg-gray-800 p-5 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 flex flex-col justify-center items-center text-center relative overflow-hidden">
                            <div className={`absolute inset-0 opacity-10 ${stats.avgScore >= 80 ? 'bg-green-500' : stats.avgScore >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}></div>
                            <span className="text-sm font-bold text-gray-500 dark:text-gray-400 mb-1 z-10">Genel Performans</span>
                            <div className="flex items-end justify-center z-10">
                                <span className={`text-5xl font-black ${stats.avgScore >= 80 ? 'text-green-600 dark:text-green-400' : stats.avgScore >= 50 ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-600 dark:text-red-400'}`}>
                                    {stats.avgScore}
                                </span>
                                <span className="text-lg font-bold text-gray-400 mb-1 ml-1">/100</span>
                            </div>
                            <div className="mt-2 text-xs font-semibold text-gray-500 dark:text-gray-400 z-10">Toplam {stats.totalCount} İş Değerlendirildi</div>
                        </div>

                        {/* Kusursuz İşler */}
                        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 flex items-center">
                            <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-green-600 dark:text-green-400 mr-4">
                                <Star className="w-6 h-6 fill-current" />
                            </div>
                            <div>
                                <p className="text-2xl font-black text-gray-800 dark:text-white">{stats.perfectCount}</p>
                                <p className="text-xs font-bold text-gray-500 uppercase">Kusursuz İş (100 Puan)</p>
                            </div>
                        </div>

                        {/* Yarım Puanlık İşler */}
                        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 flex items-center">
                            <div className="w-12 h-12 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center text-orange-600 dark:text-orange-400 mr-4">
                                <AlertTriangle className="w-6 h-6" />
                            </div>
                            <div>
                                <p className="text-2xl font-black text-gray-800 dark:text-white">{stats.halfPointCount}</p>
                                <p className="text-xs font-bold text-gray-500 uppercase">Gecikmeli (50 Puan)</p>
                            </div>
                        </div>

                        {/* Başarısız İşler */}
                        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 flex items-center">
                            <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center text-red-600 dark:text-red-400 mr-4">
                                <XCircle className="w-6 h-6" />
                            </div>
                            <div>
                                <p className="text-2xl font-black text-gray-800 dark:text-white">{stats.failCount}</p>
                                <p className="text-xs font-bold text-gray-500 uppercase">Başarısız (0 Puan)</p>
                            </div>
                        </div>

                    </div>

                    {/* İŞ LİSTESİ (DETAYLAR) */}
                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                        <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                            <h3 className="font-bold text-gray-800 dark:text-white text-sm">Değerlendirilen İş Geçmişi</h3>
                        </div>
                        <div className="divide-y divide-gray-200 dark:divide-gray-700">
                            {performanceData.jobs.map(job => (
                                <div key={job.id} className="p-4 sm:p-5 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition flex flex-col lg:flex-row gap-4 lg:items-center">
                                    
                                    {/* Sol Taraf: Proje Bilgileri */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <h4 className="text-base font-bold text-gray-900 dark:text-white truncate">{job.projectName}</h4>
                                            <span className="text-[10px] font-bold px-2 py-0.5 bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded">
                                                {job.taskType}
                                            </span>
                                        </div>
                                        {/* Status Badge */}
                                        <div className={`inline-flex px-2 py-1 rounded border text-[10px] font-black uppercase tracking-wider ${job.statusColor}`}>
                                            {job.statusText} • {job.score} Puan
                                        </div>
                                    </div>

                                    {/* Orta Kısım: Süre ve Termin Hedefleri vs Gerçekleşenler */}
                                    <div className="flex flex-wrap lg:flex-nowrap gap-6 lg:gap-8 bg-gray-50 dark:bg-gray-900/50 p-3 rounded-lg border border-gray-100 dark:border-gray-700 lg:w-[450px]">
                                        
                                        {/* SÜRE KIYASLAMASI */}
                                        <div className="flex-1">
                                            <div className="flex items-center text-xs font-bold text-gray-500 dark:text-gray-400 mb-1.5 uppercase">
                                                <Clock className="w-3.5 h-3.5 mr-1" /> Süre Hedefi
                                            </div>
                                            <div className="flex justify-between text-sm">
                                                <span className="text-gray-600 dark:text-gray-300">Hedeflenen:</span>
                                                <span className="font-bold text-gray-800 dark:text-gray-200">{formatHours(job.estimatedHours)}</span>
                                            </div>
                                            <div className="flex justify-between text-sm mt-0.5">
                                                <span className="text-gray-600 dark:text-gray-300">Harcanan:</span>
                                                <span className={`font-bold ${job.isHoursOk ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                                    {formatHours(job.actualHours)}
                                                </span>
                                            </div>
                                        </div>

                                        {/* TERMİN KIYASLAMASI */}
                                        <div className="flex-1 border-t lg:border-t-0 lg:border-l border-gray-200 dark:border-gray-700 pt-3 lg:pt-0 lg:pl-6">
                                            <div className="flex items-center text-xs font-bold text-gray-500 dark:text-gray-400 mb-1.5 uppercase">
                                                <CalendarIcon className="w-3.5 h-3.5 mr-1" /> Termin Hedefi
                                            </div>
                                            <div className="flex justify-between text-sm">
                                                <span className="text-gray-600 dark:text-gray-300">Termin:</span>
                                                <span className="font-bold text-gray-800 dark:text-gray-200">
                                                    {job.deadlineDate ? safeParseDate(job.deadlineDate).toLocaleDateString('tr-TR') : 'Belirtilmedi'}
                                                </span>
                                            </div>
                                            <div className="flex justify-between text-sm mt-0.5">
                                                <span className="text-gray-600 dark:text-gray-300">Bitiş:</span>
                                                <span className={`font-bold ${job.isDeadlineOk ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                                    {safeParseDate(job.completedAt)?.toLocaleDateString('tr-TR')}
                                                </span>
                                            </div>
                                        </div>

                                    </div>

                                </div>
                            ))}
                        </div>
                    </div>
                </>
            ) : null}

        </div>
    );
};

export default DesignPerformancePage;