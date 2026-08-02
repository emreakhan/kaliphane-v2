// src/pages/ProductDevTimelinePage.js

import React, { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays, Filter } from 'lucide-react';
import { DESIGN_JOB_STATUS } from '../config/constants.js';

const ProductDevTimelinePage = ({ designJobs = [], personnel = [] }) => {
    const [baseDate, setBaseDate] = useState(() => {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() - 2);
        return d;
    });

    const [selectedDesigner, setSelectedDesigner] = useState('ALL');
    const DAYS_TO_SHOW = 21;
    const DAY_WIDTH = 120;

    const days = useMemo(() => {
        const arr = [];
        for (let i = 0; i < DAYS_TO_SHOW; i++) {
            const d = new Date(baseDate);
            d.setDate(d.getDate() + i);
            arr.push(d);
        }
        return arr;
    }, [baseDate]);

    const timelineStartMs = days[0].getTime();
    const timelineEndMs = days[days.length - 1].getTime() + (24 * 60 * 60 * 1000);

    const filteredJobs = useMemo(() => {
        if (selectedDesigner === 'ALL') return designJobs;
        return designJobs.filter(j => j.assignedDesigner === selectedDesigner);
    }, [designJobs, selectedDesigner]);

    const prevPeriod = () => { const d = new Date(baseDate); d.setDate(d.getDate() - 7); setBaseDate(d); };
    const nextPeriod = () => { const d = new Date(baseDate); d.setDate(d.getDate() + 7); setBaseDate(d); };
    const today = () => { const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate() - 2); setBaseDate(d); };

    return (
        <div className="p-4 max-w-7xl mx-auto space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-3">
                    <h2 className="text-lg font-bold text-gray-800 dark:text-white flex items-center">
                        <CalendarDays className="w-5 h-5 mr-2 text-amber-500" /> Ürün Geliştirme Zaman Çizelgesi (Gantt)
                    </h2>
                </div>

                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 text-xs">
                        <Filter className="w-4 h-4 text-gray-400" />
                        <select 
                            value={selectedDesigner}
                            onChange={(e) => setSelectedDesigner(e.target.value)}
                            className="p-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg font-bold text-xs"
                        >
                            <option value="ALL">Tüm Personeller</option>
                            {personnel.map(p => (
                                <option key={p.id || p.name} value={p.name}>{p.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="flex items-center gap-1">
                        <button onClick={prevPeriod} className="p-1.5 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 rounded-lg transition"><ChevronLeft className="w-4 h-4" /></button>
                        <button onClick={today} className="px-3 py-1.5 bg-amber-50 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 text-xs font-bold rounded-lg transition">Bugün</button>
                        <button onClick={nextPeriod} className="p-1.5 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 rounded-lg transition"><ChevronRight className="w-4 h-4" /></button>
                    </div>
                </div>
            </div>

            {/* GANTT TABLO KONTEYNERİ */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-x-auto p-4">
                <div style={{ width: `${DAYS_TO_SHOW * DAY_WIDTH}px` }} className="relative min-w-max space-y-4">
                    {/* GÜNLER BAŞLIĞI */}
                    <div className="flex border-b border-gray-200 dark:border-gray-700 pb-2">
                        {days.map((day, idx) => {
                            const isWknd = day.getDay() === 0 || day.getDay() === 6;
                            const isToday = day.toDateString() === new Date().toDateString();
                            return (
                                <div key={idx} className={`flex-shrink-0 text-center border-l border-gray-200 dark:border-gray-700 ${isWknd ? 'bg-red-50/50 dark:bg-red-900/10' : ''}`} style={{ width: `${DAY_WIDTH}px` }}>
                                    <span className="block text-[10px] font-bold uppercase text-gray-400">{day.toLocaleDateString('tr-TR', { weekday: 'short' })}</span>
                                    <span className={`text-xs font-black ${isToday ? 'text-amber-600 dark:text-amber-400' : 'text-gray-800 dark:text-gray-200'}`}>{day.getDate()} {day.toLocaleDateString('tr-TR', { month: 'short' })}</span>
                                </div>
                            );
                        })}
                    </div>

                    {/* ÇİZELGE İÇERİĞİ */}
                    <div className="space-y-3 relative py-2">
                        {filteredJobs.map((job) => {
                            const createdDate = job.createdAt ? new Date(job.createdAt) : new Date();
                            const estH = parseFloat(job.estimatedHours) || 8;
                            const endDate = new Date(createdDate.getTime() + estH * 60 * 60 * 1000);

                            const leftPx = ((createdDate.getTime() - timelineStartMs) / (1000 * 60 * 60 * 24)) * DAY_WIDTH;
                            const widthPx = Math.max(80, (estH / 8) * DAY_WIDTH);

                            return (
                                <div key={job.id} className="relative h-10 flex items-center bg-gray-50/60 dark:bg-gray-900/40 rounded-lg p-1">
                                    <div 
                                        className={`absolute h-8 rounded-lg px-3 flex items-center justify-between text-white text-xs font-bold shadow border border-white/20 ${job.status === DESIGN_JOB_STATUS.IN_PROGRESS ? 'bg-amber-600' : job.status === DESIGN_JOB_STATUS.COMPLETED ? 'bg-emerald-600' : 'bg-indigo-600'}`}
                                        style={{ left: `${Math.max(0, leftPx)}px`, width: `${widthPx}px` }}
                                    >
                                        <span className="truncate">{job.projectName} ({job.assignedDesigner})</span>
                                        <span className="text-[10px] opacity-80">{job.estimatedHours}h</span>
                                    </div>
                                </div>
                            );
                        })}

                        {filteredJobs.length === 0 && (
                            <div className="py-12 text-center text-gray-400 text-sm">Çizelgede görüntülenecek görev bulunmuyor.</div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ProductDevTimelinePage;
