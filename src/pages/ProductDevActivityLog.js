// src/pages/ProductDevActivityLog.js

import React, { useMemo } from 'react';
import { History, Clock, PauseCircle, PlayCircle, CheckCircle, User } from 'lucide-react';

const ProductDevActivityLog = ({ designJobs = [] }) => {
    const logs = useMemo(() => {
        const list = [];
        designJobs.forEach(job => {
            if (job.workSessions) {
                job.workSessions.forEach(session => {
                    if (session.startTime) {
                        list.push({
                            id: `${job.id}-start-${session.startTime}`,
                            jobName: job.projectName,
                            designer: job.assignedDesigner,
                            taskType: job.taskType,
                            action: 'BAŞLATILDI / DEVAM EDİLDİ',
                            type: 'START',
                            timestamp: session.startTime,
                            endTime: session.endTime
                        });
                    }
                });
            }
            if (job.pauseHistory) {
                job.pauseHistory.forEach(p => {
                    list.push({
                        id: `${job.id}-pause-${p.pausedAt}`,
                        jobName: job.projectName,
                        designer: job.assignedDesigner,
                        taskType: job.taskType,
                        action: `DURAKLATILDI (${p.reason || 'Belirtilmedi'})`,
                        type: 'PAUSE',
                        timestamp: p.pausedAt,
                        note: p.note
                    });
                });
            }
            if (job.completedAt) {
                list.push({
                    id: `${job.id}-complete-${job.completedAt}`,
                    jobName: job.projectName,
                    designer: job.assignedDesigner,
                    taskType: job.taskType,
                    action: 'TAMAMLANDI',
                    type: 'COMPLETE',
                    timestamp: job.completedAt,
                    note: job.completionNote
                });
            }
        });

        return list.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    }, [designJobs]);

    return (
        <div className="p-4 max-w-7xl mx-auto space-y-6">
            <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 flex justify-between items-center">
                <div>
                    <h2 className="text-lg font-bold text-gray-800 dark:text-white flex items-center">
                        <History className="w-5 h-5 mr-2 text-amber-500" /> Ürün Geliştirme İş Hareket Günlüğü (Loglar)
                    </h2>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Personellerin başlattığı, duraklattığı ve bitirdiği tüm ürün geliştirme hareketleri.</p>
                </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 space-y-3">
                {logs.map((log) => (
                    <div key={log.id} className="p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 text-xs">
                        <div className="flex items-center gap-3">
                            {log.type === 'START' ? (
                                <div className="p-2 bg-green-100 text-green-700 rounded-lg"><PlayCircle className="w-4 h-4" /></div>
                            ) : log.type === 'PAUSE' ? (
                                <div className="p-2 bg-amber-100 text-amber-700 rounded-lg"><PauseCircle className="w-4 h-4" /></div>
                            ) : (
                                <div className="p-2 bg-blue-100 text-blue-700 rounded-lg"><CheckCircle className="w-4 h-4" /></div>
                            )}

                            <div>
                                <h4 className="font-bold text-gray-900 dark:text-white text-sm">{log.jobName}</h4>
                                <div className="flex items-center gap-2 text-gray-500 text-[11px] mt-0.5">
                                    <span className="font-semibold text-amber-600 dark:text-amber-400">{log.designer}</span>
                                    <span>•</span>
                                    <span>{log.taskType}</span>
                                    <span>•</span>
                                    <span className="font-bold text-gray-700 dark:text-gray-300">{log.action}</span>
                                </div>
                                {log.note && <p className="text-[11px] text-gray-400 italic mt-1">"{log.note}"</p>}
                            </div>
                        </div>

                        <span className="text-[11px] font-mono text-gray-400 font-bold bg-white dark:bg-gray-800 px-2 py-1 rounded border border-gray-200 dark:border-gray-700">
                            {log.timestamp ? new Date(log.timestamp).toLocaleString('tr-TR') : '-'}
                        </span>
                    </div>
                ))}

                {logs.length === 0 && (
                    <div className="py-12 text-center text-gray-400 text-sm">Henüz kayıtlı iş hareketi bulunmuyor.</div>
                )}
            </div>
        </div>
    );
};

export default ProductDevActivityLog;
