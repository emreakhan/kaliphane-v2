// src/pages/ActiveTasksPage.js

import React, { useState, useMemo } from 'react';

// İkonlar
import { Users, Cpu, AlertTriangle } from 'lucide-react';

// Sabitler
import { OPERATION_STATUS, ROLES, PERSONNEL_ROLES } from '../config/constants.js';

// Yardımcı Fonksiyonlar
import { formatDate } from '../utils/dateUtils';


// --- YENİ: ÇALIŞAN PARÇALAR SAYFASI (GÜNCELLENDİ) ---

/**
 * Çalışan Parçalar Listesi - Tüm kullanıcılar için
 * GÜNCELLEME: Artık operasyonları listeliyor
 */
const ActiveTasksPage = ({ projects, machines, loggedInUser, personnel }) => {
    const [searchTerm, setSearchTerm] = useState('');

    // Süreyi formatlayan yardımcı fonksiyon
    const formatDuration = (startDate) => {
        if (!startDate) return '---';
        const start = new Date(startDate);
        const now = new Date();
        const diffMs = now - start;
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        if (diffHours < 24) return `${diffHours} saat`;
        const days = Math.floor(diffHours / 24);
        const hours = diffHours % 24;
        return `${days}gün ${hours}saat`;
    };

    const lowerSearchTerm = searchTerm.toLowerCase();
    
    // GÜNCELLEME: Tüm 'ÇALIŞIYOR' operasyonlarını bul
    const allRunningOperations = useMemo(() => {
        return projects.flatMap(mold => 
            mold.tasks.flatMap(task => 
                task.operations
                    .filter(op => op.status === OPERATION_STATUS.IN_PROGRESS)
                    .map(op => ({
                        ...op,
                        moldName: mold.moldName,
                        moldCustomer: mold.customer,
                        taskName: task.taskName,
                    }))
            )
        );
    }, [projects]);

    // YENİ LİSTE 1: TEZGAH DURUMLARI (GÜNCELLENDİ)
    const machineStatusList = useMemo(() => {
        const allMachineNames = machines.map(m => m.name);
        
        const runningTasksMap = new Map();
        allRunningOperations.forEach(op => {
            if(op.machineName) {
                runningTasksMap.set(op.machineName, op);
            }
        });

        const statusList = allMachineNames.map(machineName => {
            const runningTask = runningTasksMap.get(machineName);
            if (runningTask) {
                return { machineName: machineName, isIdle: false, task: runningTask };
            } else {
                return { machineName: machineName, isIdle: true, task: null };
            }
        });

        statusList.sort((a, b) => {
            if (a.isIdle && !b.isIdle) return 1;
            if (!a.isIdle && b.isIdle) return -1;
            return a.machineName.localeCompare(b.machineName);
        });

        if (!searchTerm.trim()) return statusList;
        
        return statusList.filter(item => {
            if (item.machineName.toLowerCase().includes(lowerSearchTerm)) return true;
            if (item.isIdle) return false; 
            
            return (
                item.task.moldName.toLowerCase().includes(lowerSearchTerm) ||
                item.task.taskName.toLowerCase().includes(lowerSearchTerm) ||
                item.task.type.toLowerCase().includes(lowerSearchTerm) ||
                item.task.assignedOperator.toLowerCase().includes(lowerSearchTerm) ||
                (item.task.machineOperatorName && item.task.machineOperatorName.toLowerCase().includes(lowerSearchTerm))
            );
        });
    }, [allRunningOperations, machines, searchTerm, lowerSearchTerm]);

    // YENİ LİSTE 2: ONAY BEKLEYEN İŞLER (GÜNCELLENDİ)
    const waitingReviewTasks = useMemo(() => {
        const allWaitingTasks = projects.flatMap(mold => 
            mold.tasks.flatMap(task => 
                task.operations
                    .filter(op => op.status === OPERATION_STATUS.WAITING_SUPERVISOR_REVIEW)
                    .map(op => ({
                        ...op,
                        moldName: mold.moldName,
                        moldCustomer: mold.customer,
                        taskName: task.taskName,
                        moldId: mold.id,
                        taskId: task.id,
                    }))
            )
        );
        
        if (!searchTerm.trim()) return allWaitingTasks;

        return allWaitingTasks.filter(task => // 'task' burada 'operation' objesi
            task.moldName.toLowerCase().includes(lowerSearchTerm) ||
            task.taskName.toLowerCase().includes(lowerSearchTerm) ||
            task.type.toLowerCase().includes(lowerSearchTerm) ||
            task.assignedOperator.toLowerCase().includes(lowerSearchTerm) ||
            task.machineName.toLowerCase().includes(lowerSearchTerm) ||
            (task.machineOperatorName && task.machineOperatorName.toLowerCase().includes(lowerSearchTerm))
        );
    }, [projects, searchTerm, lowerSearchTerm]);

    // YENİ: Admin/Yetkili için İş Dağılımı Paneli
    const canViewWorkDistribution = loggedInUser.role === ROLES.ADMIN || loggedInUser.role === ROLES.SUPERVISOR;
    
    const workDistribution = useMemo(() => {
        if (!canViewWorkDistribution) return [];

        const camOperators = personnel.filter(p => p.role === PERSONNEL_ROLES.CAM_OPERATOR);
        const workCounts = new Map();
        camOperators.forEach(op => {
            workCounts.set(op.name, 0);
        });
        
        allRunningOperations.forEach(op => {
            const operatorName = op.assignedOperator;
            if (workCounts.has(operatorName)) {
                workCounts.set(operatorName, workCounts.get(operatorName) + 1);
            }
        });

        const distributionList = Array.from(workCounts.entries()).map(([name, count]) => ({ name, count }));
        distributionList.sort((a, b) => a.count - b.count);
        
        return distributionList;

    }, [personnel, canViewWorkDistribution, allRunningOperations]);

    const totalActiveCount = machineStatusList.filter(m => !m.isIdle).length + waitingReviewTasks.length;

    return (
        <div className="p-4 bg-white dark:bg-gray-800 rounded-xl shadow-xl space-y-8">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4 md:mb-0">
                    Aktif İş Akışı ({totalActiveCount})
                </h2>
                
                <div className="w-full md:w-64">
                    <input
                        type="text"
                        placeholder="Kalıp, parça, operatör veya tezgah ara..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                </div>
            </div>

            {/* BÖLÜM 1: TEZGAH DURUMLARI */}
            <div>
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                    Tezgah Durumları ({machineStatusList.filter(m => !m.isIdle).length} / {machineStatusList.length})
                </h3>
                {machineStatusList.length === 0 ?
                (
                    <div className="text-center py-8">
                        <Cpu className="w-16 h-16 text-gray-400 dark:text-gray-600 mx-auto mb-4" />
                        <p className="text-gray-500 dark:text-gray-400">
                            Sistemde kayıtlı tezgah bulunamadı. Lütfen Admin Panelinden tezgah ekleyin.
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                            <thead className="bg-gray-50 dark:bg-gray-700">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">
                                        Tezgah
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">
                                        Durum
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">
                                        Kalıp / Parça / Operasyon
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">
                                        % Durum
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">
                                        CAM Operatörü
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">
                                        Tezgah Operatörü
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">
                                        Başlangıç
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">
                                        Geçen Süre
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200 dark:bg-gray-800 dark:divide-gray-700">
                                {machineStatusList.map((item) => (
                                    <tr 
                                        key={item.machineName}
                                        className={item.isIdle ?
                                        'bg-red-50 dark:bg-red-900/10' : 'hover:bg-gray-50 dark:hover:bg-gray-700/50 transition'}
                                    >
                                        <td className="px-4 py-4 whitespace-nowrap">
                                            <div className={`text-sm font-semibold ${item.isIdle ?
                                            'text-red-700 dark:text-red-400' : 'text-gray-900 dark:text-white'}`}>
                                                {item.machineName}
                                            </div>
                                        </td>
                                        <td className="px-4 py-4 whitespace-nowrap">
                                            {item.isIdle ?
                                            (
                                                <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300">
                                                    BOŞTA
                                                </span>
                                            ) : (
                                                <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300">
                                                    ÇALIŞIYOR
                                                </span>
                                            )}
                                        </td>
                                        
                                        <td className="px-4 py-4 whitespace-nowrap">
                                            {item.task ?
                                            (
                                                <>
                                                    <div className="text-sm font-semibold text-gray-900 dark:text-white">
                                                        {item.task.moldName}
                                                    </div>
                                                    <div className="text-sm text-gray-600 dark:text-gray-400">
                                                        {item.task.taskName}
                                                    </div>
                                                    <div className="text-xs font-bold text-blue-600 dark:text-blue-400">
                                                        {item.task.type}
                                                    </div>
                                                </>
                                            ) : (
                                                <span className="text-gray-400 dark:text-gray-600">---</span>
                                            )}
                                        </td>
                                 
                                        <td className="px-4 py-4 whitespace-nowrap">
                                            {item.task ?
                                            (
                                                <div className="text-sm font-semibold text-blue-600 dark:text-blue-400">
                                                    %{item.task.progressPercentage}
                                                </div>
                                            ) : (
                                                <span className="text-gray-400 dark:text-gray-600">---</span>
                                            )}
                                        </td>

                                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-300">
                                            {item.task ? item.task.assignedOperator : '---'}
                                        </td>
                                        <td className="px-4 py-4 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">
                                            {item.task ? item.task.machineOperatorName : '---'}
                                        </td>
                                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                            {item.task ? formatDate(item.task.startDate) : '---'}
                                        </td>
                                        <td className="px-4 py-4 whitespace-nowrap">
                                            {item.task ?
                                            (
                                                <div className="text-sm font-semibold text-blue-600 dark:text-blue-400">
                                                    {formatDuration(item.task.startDate)}
                                                </div>
                                            ) : (
                                                <span className="text-gray-400 dark:text-gray-600">---</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* YENİ BÖLÜM: İŞ DAĞILIMI (SADECE ADMİN VE YETKİLİ) */}
            {canViewWorkDistribution && (
                <div>
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                        <Users className="w-6 h-6 inline-block mr-2" />
                        CAM Operatörü İş Dağılımı
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                        Operatörlerin mevcut "ÇALIŞIYOR" durumundaki operasyon sayıları. En az işi olan operatörler en üsttedir.
                    </p>
                    
                    {workDistribution.length === 0 ?
                    (
                        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                            Sistemde kayıtlı CAM Operatörü bulunamadı.
                        </div>
                    ) : (
                        <div className="overflow-x-auto max-w-lg border border-gray-200 dark:border-gray-700 rounded-lg">
                            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                                <thead className="bg-gray-50 dark:bg-gray-700">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">
                                            CAM Operatörü
                                        </th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">
                                            Aktif Görev Sayısı
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200 dark:bg-gray-800 dark:divide-gray-700">
                                    {workDistribution.map((item) => (
                                        <tr 
                                            key={item.name}
                                            className={
                                                item.count === 0
                                                ? 'bg-green-50 dark:bg-green-900/10'
                                                : 'hover:bg-gray-50 dark:hover:bg-gray-700/50 transition'
                                            }
                                        >
                                            <td className="px-4 py-4 whitespace-nowrap">
                                                <div className={`text-sm font-semibold ${item.count === 0 ?
                                                'text-green-700 dark:text-green-400' : 'text-gray-900 dark:text-white'}`}>
                                                    {item.name}
                                                </div>
                                            </td>
                                            <td className="px-4 py-4 whitespace-nowrap">
                                                <span className={`inline-flex px-3 py-1 text-sm font-bold rounded-full ${
                                                    item.count === 0
                                                    ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
                                                    : (item.count <= 2 ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300' : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300')
                                                }`}>
                                                    {item.count}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
            {/* YENİ BÖLÜM SONU */}

        </div>
    );
};

export default ActiveTasksPage;