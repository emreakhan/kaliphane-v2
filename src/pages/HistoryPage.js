// src/pages/HistoryPage.js

import React, { useMemo } from 'react';

// Sabitler
import { OPERATION_STATUS } from '../config/constants.js';

// GÜNCELLEME: Artık operasyonları listeliyor
const HistoryPage = ({ projects }) => {
     const completedOperations = useMemo(() => {
        return projects.flatMap(mold => 
            mold.tasks.flatMap(task => 
                task.operations
                    .filter(op => op.status === OPERATION_STATUS.COMPLETED)
                    .map(op => ({ 
                        ...op, 
                        moldName: mold.moldName,
                        taskName: task.taskName
                    }))
            )
        ).sort((a, b) => new Date(b.finishDate) - new Date(a.finishDate));
    }, [projects]);

    return (
        <div className="p-4 bg-white dark:bg-gray-800 rounded-xl shadow-xl">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Geçmiş Tamamlanmış Operasyonlar ({completedOperations.length})</h2>
            
            {completedOperations.length === 0 ? (
                 <p className="text-gray-500 dark:text-gray-400">Şu ana kadar tamamlanmış operasyon bulunmamaktadır.</p>
            ) : 
            (
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-700">
                            <tr>
                                 <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">Kalıp / Parça / Operasyon</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">CAM Operatörü</th>
                                 <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">CAM -&gt; Tezgah Puanı</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">Süre (Saat)</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">Yetkili Puanı</th>
                                 <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">Yetkili Yorumu</th>
                            </tr>
                        </thead>
                         <tbody className="bg-white divide-y divide-gray-200 dark:bg-gray-800 dark:divide-gray-700">
                            {completedOperations.map(op => (
                                <tr key={op.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition">
                                     <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm font-medium text-gray-900 dark:text-white">{op.moldName}</div>
                                        <div className="text-xs text-gray-500 dark:text-gray-400">{op.taskName}</div>
                                        <div className="text-xs font-bold text-blue-600 dark:text-blue-400">{op.type}</div>
                                    </td>
                                     <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">{op.assignedOperator}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-blue-600 dark:text-blue-400 font-semibold">{op.camOperatorRatingForMachineOp || 'N/A'}/10</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600 dark:text-green-400 font-semibold">{op.durationInHours || 'N/A'}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-purple-600 dark:text-purple-400">{op.supervisorRating}/10</td>
                                    <td className="px-6 py-4 whitespace-normal text-xs text-gray-500 dark:text-gray-400 max-w-xs break-words">
                                         {op.supervisorComment || '---'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

export default HistoryPage;