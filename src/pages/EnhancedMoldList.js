// src/pages/EnhancedMoldList.js

import React, { useState, useMemo } from 'react';

// İkonlar
import { 
    RefreshCw, Settings, List, CheckCircle, 
    PlayCircle, Zap, Sparkles, HardHat, Edit2, Cpu, Filter, Search 
} from 'lucide-react';

// Sabitler ('.js' uzantısını ekledim)
import { MOLD_STATUS, MOLD_STATUS_ACTIVE_LIST, OPERATION_STATUS } from '../config/constants.js';

// Yardımcı Fonksiyonlar ('.js' uzantısını ekledim)
import { getStatusClasses } from '../utils/styleUtils.js';
import { formatDate, calculateRemainingWorkDays, calculateWorkDayDifference } from '../utils/dateUtils.js';


// --- GÜNCELLENMİŞ: GELİŞMİŞ KALIP LİSTESİ ---
const EnhancedMoldList = ({ projects, onSelectMold }) => {
    const [activeFilter, setActiveFilter] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');
    
    // GÜNCELLEME: Parça ilerlemesini hesaplar
    const calculateMoldProgress = (tasks) => {
        if (!tasks || tasks.length === 0) return 0;
        const allOperations = tasks.flatMap(t => t.operations);
        if (allOperations.length === 0) return 0;
        const totalProgress = allOperations.reduce((acc, op) => acc + op.progressPercentage, 0);
        return totalProgress / allOperations.length;
    };

    const filteredProjects = useMemo(() => {
        let filtered = projects;
        if (activeFilter !== 'all') {
            if (activeFilter === 'ACTIVE_OVERVIEW') { 
                filtered = filtered.filter(project => 
                    MOLD_STATUS_ACTIVE_LIST.includes(project.status)
                );
            } else {
                filtered = filtered.filter(project => 
                    project.status === activeFilter
                );
            
            }
        }
        if (searchTerm.trim()) {
            const lowerSearchTerm = searchTerm.toLowerCase();
            filtered = filtered.filter(project => 
                project.moldName.toLowerCase().includes(lowerSearchTerm) ||
                project.customer.toLowerCase().includes(lowerSearchTerm)
            );
        }
        
        // YENİ: Aciliyet sırasına göre sırala
        filtered.sort((a, b) => {
            const priorityA = a.priority;
            const priorityB = b.priority;

            if (priorityA && priorityB) {
                return priorityA - priorityB;
            }
            if (priorityA && !priorityB) {
                return -1;
            }
            if (!priorityA && priorityB) {
                return 1;
            }
            return a.moldName.localeCompare(b.moldName);
        });
        
        return filtered;
    }, [projects, activeFilter, searchTerm]);

    const stats = useMemo(() => {
        const counts = {
            total: projects.length,
            waiting: 0,
            completed: 0,
            activeOverview: 0,
        };
  
        Object.values(MOLD_STATUS).forEach(status => {
            counts[status] = 0;
        });
        for (const project of projects) {
            const status = project.status || MOLD_STATUS.WAITING;
            if (counts[status] !== undefined) {
                counts[status]++;
            }
            if (MOLD_STATUS_ACTIVE_LIST.includes(status)) {
                counts.activeOverview++;
            }
        }
        counts.waiting = counts[MOLD_STATUS.WAITING];
        counts.completed = counts[MOLD_STATUS.COMPLETED];
        return counts;
    }, [projects]);

    const FilterCard = ({ filterKey, title, count, icon: Icon, colorClass }) => {
        const isActive = activeFilter === filterKey;
        return (
            <div 
                className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${
                    isActive 
                        ? `${colorClass} dark:bg-opacity-20` 
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
                onClick={() => setActiveFilter(filterKey)}
            >
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-sm font-medium text-gray-600 dark:text-gray-400">{title}</p>
                        <p className="text-2xl font-bold text-gray-900 dark:text-white">{count}</p>
                    </div>
                    {Icon && <Icon className={`w-8 h-8 ${isActive ? '' : 'text-gray-400'}`} />}
                </div>
            </div>
        );
    };

    return (
        <div className="p-4 bg-white dark:bg-gray-800 rounded-xl shadow-xl">
            {/* Filtreleme Kutucukları */}
            <div className="flex flex-wrap gap-4 mb-6">
                <FilterCard 
                    filterKey="all" 
                    title="Tüm Kalıplar" 
                    count={stats.total} 
                    icon={Filter}
                    colorClass="border-blue-500 bg-blue-50"
                />
                <FilterCard 
                    filterKey="ACTIVE_OVERVIEW"
                    title="Aktif Çalışan" 
                    count={stats.activeOverview} 
                    icon={PlayCircle}
                    colorClass="border-green-500 bg-green-50 text-green-500"
                />
                <FilterCard 
                    filterKey={MOLD_STATUS.WAITING}
                    title="Beklemede" 
                    count={stats.waiting} 
                    icon={RefreshCw}
                    colorClass="border-yellow-500 bg-yellow-50 text-yellow-500"
                />
                <FilterCard 
                    filterKey={MOLD_STATUS.CNC}
                    title="CNC" 
                    count={stats[MOLD_STATUS.CNC]} 
                    icon={Cpu}
                    colorClass="border-blue-500 bg-blue-50 text-blue-500"
                />
                <FilterCard 
                    filterKey={MOLD_STATUS.EREZYON}
                    title="Erezyon" 
                    count={stats[MOLD_STATUS.EREZYON]} 
                    icon={Zap}
                    colorClass="border-blue-500 bg-blue-50 text-blue-500"
                />
                <FilterCard 
                    filterKey={MOLD_STATUS.POLISAJ}
                    title="Polisaj" 
                    count={stats[MOLD_STATUS.POLISAJ]} 
                    icon={Sparkles}
                    colorClass="border-blue-500 bg-blue-50 text-blue-500"
                />
                 <FilterCard 
                    filterKey={MOLD_STATUS.DESEN}
                    title="Desen" 
                    count={stats[MOLD_STATUS.DESEN]} 
                    icon={Edit2}
                    colorClass="border-blue-500 bg-blue-50 text-blue-500"
                />
                 <FilterCard 
                    filterKey={MOLD_STATUS.MOLD_ASSEMBLY}
                    title="Kalıp Montaj" 
                    count={stats[MOLD_STATUS.MOLD_ASSEMBLY]} 
                    icon={HardHat}
                    colorClass="border-blue-500 bg-blue-50 text-blue-500"
                />
                 <FilterCard 
                    filterKey={MOLD_STATUS.TRIAL}
                    title="Deneme'de" 
                    count={stats[MOLD_STATUS.TRIAL]} 
                    icon={Settings}
                    colorClass="border-blue-500 bg-blue-50 text-blue-500"
                />
                 <FilterCard 
                    filterKey={MOLD_STATUS.REVISION}
                    title="Revizyon" 
                    count={stats[MOLD_STATUS.REVISION]} 
                    icon={Settings}
                    colorClass="border-blue-500 bg-blue-50 text-blue-500"
                />
                <FilterCard 
                    filterKey={MOLD_STATUS.COMPLETED}
                    title="Tamamlanan" 
                    count={stats.completed} 
                    icon={CheckCircle}
                    colorClass="border-green-500 bg-green-50 text-green-500"
                />
            </div>

            {/* Arama Çubuğu */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4 md:mb-0">
                    Kalıp Listesi
                    <span className="text-sm font-normal text-gray-500 dark:text-gray-400 ml-2">
                        ({filteredProjects.length} kalıp)
                    </span>
                </h2>
                
                <div className="w-full md:w-64 relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <input
                        type="text"
                        placeholder="Kalıp no veya firma ara..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                </div>
            </div>

            {/* Kalıp Listesi */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                {filteredProjects.length === 0 ? (
                    <div className="col-span-full text-center py-8">
                        <List className="w-16 h-16 text-gray-400 dark:text-gray-600 mx-auto mb-4" />
                        <p className="text-gray-500 dark:text-gray-400">
                            Arama kriterlerinize uygun kalıp bulunamadı.
                        </p>
                    </div>
                ) : (
                    filteredProjects.map(project => {
                        const totalProgress = calculateMoldProgress(project.tasks);
                        const moldStatus = project.status || MOLD_STATUS.WAITING;
                        
                        
                        const assignedCamOperators = project.tasks
                            .flatMap(task => task.operations.map(op => op.assignedOperator))
                            .filter(op => op && op !== 'SEÇ');
 
                        const uniqueCamOperators = [...new Set(assignedCamOperators)];
                        
                        const remainingDays = calculateRemainingWorkDays(project.moldDeadline);
                        const isCritical = remainingDays !== null && 
                                         remainingDays <= 6 &&
                                         remainingDays >= 0 &&
                                         totalProgress <= 80 &&
                                         moldStatus !== MOLD_STATUS.COMPLETED;
                                         
                        const cardHighlightClasses = isCritical 
                            ? 'bg-red-100 dark:bg-red-900/30 border-red-600 dark:border-red-500 animate-pulse'
                            : 'bg-white dark:bg-gray-800 border-blue-500 dark:border-blue-600';
                            
                        const progressBarClass = moldStatus === MOLD_STATUS.COMPLETED 
                            ? 'bg-green-600'
                            : 'bg-blue-600';
                            
                        const activeOperationCounts = {};
                        let workingPartCount = 0;
                        let idlePartCount = 0;

                        project.tasks.forEach(task => {
                            const operations = task.operations || [];
                            
                            const inProgressOps = operations.filter(op => op.status === OPERATION_STATUS.IN_PROGRESS);
                            const notStartedOps = operations.filter(op => op.status === OPERATION_STATUS.NOT_STARTED);

                            if (inProgressOps.length > 0) {
                                workingPartCount++;
                            }

                            if (operations.length > 0 && notStartedOps.length === operations.length) {
                                idlePartCount++;
                            }

                            inProgressOps.forEach(op => {
                                activeOperationCounts[op.type] = (activeOperationCounts[op.type] || 0) + 1;
                            });
                        });

                        const activeOperationEntries = Object.entries(activeOperationCounts);

                        return (
                            <div
                                key={project.id}
                                onClick={() => onSelectMold(project)}
                                className={`p-4 rounded-xl shadow-lg hover:shadow-xl transition duration-300 transform hover:-translate-y-1 cursor-pointer border-t-4 flex flex-col ${cardHighlightClasses} relative`}
                            >
                                {project.priority && (
                                    <div className="absolute -top-3 -left-3 w-8 h-8 bg-red-600 text-white rounded-full flex items-center justify-center font-bold text-sm shadow-lg border-2 border-white dark:border-gray-800 z-10">
                                        {project.priority}
                                    </div>
                                )}
                        
                                <div className="flex-grow">
                                    <div className="flex justify-between items-start mb-3">
                                        <h3 className="text-lg font-bold text-gray-900 dark:text-white">{project.moldName}</h3>
                                        <span className={`px-2 py-0.5 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusClasses(moldStatus)}`}>
                                            {moldStatus}
                                        </span>
                                    </div>
       
                                    <p className="text-gray-600 dark:text-gray-400 text-xs mb-1">
                                        Müşteri: <span className="font-semibold">{project.customer}</span>
                                    </p>
                                    
                                    <p className="text-gray-600 dark:text-gray-400 text-xs">
                                        Termin: <span className="font-semibold">{formatDate(project.moldDeadline) || '---'}</span>
                                    </p>
                                    
                                    {moldStatus === MOLD_STATUS.COMPLETED ?
                                    (
                                        (() => {
                                            let latestCompletion = null;
                                            try {
                                                const reviewDates = project.tasks
                                                    .flatMap(t => t.operations)
                                                    .filter(op => op.status === OPERATION_STATUS.COMPLETED && op.supervisorReviewDate)
                                                    .map(op => new Date(op.supervisorReviewDate).getTime());

                                                if (reviewDates.length > 0) {
                                                    const maxDate = Math.max(...reviewDates);
                                                    latestCompletion = new Date(maxDate).toISOString();
                                                }
                                            } catch (e) {
                                                console.error("Tamamlanma tarihi ayrıştırılamadı", e, project.tasks);
                                            }

                                            let completionText = latestCompletion 
                                                ? `Tamamlandı: ${formatDate(latestCompletion)}` 
                                                : 'Tamamlandı (Tarih Yok)';
                                            
                                            const diff = calculateWorkDayDifference(latestCompletion, project.moldDeadline);
                                            
                                            let diffText = '';
                                            if (diff !== null) {
                                                if (diff > 0) {
                                                    diffText = `<span class="text-green-700 dark:text-green-500 font-semibold"> (${diff} iş günü erken)</span>`;
                                                } else if (diff < 0) {
                                                    diffText = `<span class="text-red-700 dark:text-red-500 font-semibold"> (${Math.abs(diff)} iş günü geç)</span>`;
                                                } else if (diff === 0) {
                                                    diffText = `<span class="text-gray-600 dark:text-gray-400 font-semibold"> (Tam zamanında)</span>`;
                                                }
                                            }
                                                
                                            return (
                                                <p 
                                                    className="text-xs mt-1 text-green-700 dark:text-green-500 font-semibold"
                                                    dangerouslySetInnerHTML={{ __html: completionText + diffText }}
                                                >
                                                </p>
                                            );
                                        })()
                                    ) : (
                                        (() => {
                                            let remainingDaysText = 'Termin Belirsiz';
                                            let remainingDaysColor = 'text-gray-500 dark:text-gray-400';
                        
                                            if (remainingDays !== null) {
                                                if (remainingDays > 5) {
                                                    remainingDaysText = `${remainingDays} iş günü kaldı`;
                                                    remainingDaysColor = 'text-green-600 dark:text-green-400';
                                                } else if (remainingDays > 0) {
                                                    remainingDaysText = `${remainingDays} iş günü kaldı (KRİTİK)`;
                                                    remainingDaysColor = 'text-yellow-600 dark:text-yellow-400 font-semibold';
                                                } else if (remainingDays === 0) {
                                                    remainingDaysText = 'SON GÜN';
                                                    remainingDaysColor = 'text-red-600 dark:text-red-400 font-bold animate-pulse';
                                                } else {
                                                    remainingDaysText = `TERMİN ${Math.abs(remainingDays)} GÜN GEÇTİ`;
                                                    remainingDaysColor = 'text-red-700 dark:text-red-500 font-bold';
                                                }
                                            }
                                            return (
                                                <p className={`text-xs mt-1 ${remainingDaysColor}`}>
                                                    {remainingDaysText}
                                                </p>
                                            );
                                        })()
                                    )}

                                    <p className="text-gray-600 dark:text-gray-400 text-xs mt-2">
                                        Alt Parça Sayısı: <span className="font-semibold">{project.tasks.length}</span>
                                    </p>
                                    
                                    <div className="text-xs mt-1 space-y-0.5">
                                        <p className="text-blue-600 dark:text-blue-400">
                                            <PlayCircle className="w-3 h-3 inline-block mr-1" />
                                            Çalışan Parça: <span className="font-semibold">{workingPartCount}</span>
                                        </p>
                                        
                                        {activeOperationEntries.length > 0 && (
                                            <div className="pl-4">
                                                {activeOperationEntries.map(([type, count]) => (
                                                    <p key={type} className="text-gray-700 dark:text-gray-300">
                                                        <Cpu className="w-3 h-3 inline-block mr-1" />
                                                        {type}: <span className="font-semibold">{count}</span>
                                                    </p>
                                                ))}
                                            </div>
                                        )}

                                        <p className="text-red-600 dark:text-red-400">
                                            <RefreshCw className="w-3 h-3 inline-block mr-1" />
                                            Boşta Parça: <span className="font-semibold">{idlePartCount}</span>
                                        </p>
                                    </div>
                
                                    {uniqueCamOperators.length > 0 && (
                                        <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                                            <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-1">
                                                Sorumlu CAM Operatörleri:
                                            </p>
                                            <ul className="space-y-0.5">
                                                {uniqueCamOperators.map(operator => (
                                                    <li key={operator} className="text-xs text-gray-800 dark:text-gray-300 font-semibold truncate">
                                                        - {operator}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </div>
                          
                                <div className="mt-3">
                                    <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400 mb-1">
                                        <span>Toplam Operasyon İlerlemesi</span>
                                        <span>%{totalProgress.toFixed(0)}</span>
                                    </div>
                                    <div className="w-full bg-gray-200 rounded-full h-2 dark:bg-gray-700">
                                        <div 
                                            className={`${progressBarClass} h-2 rounded-full`} 
                                            style={{ width: `${totalProgress.toFixed(0)}%` }}>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
};

export default EnhancedMoldList;