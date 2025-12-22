// src/pages/EnhancedMoldList.js

import React, { useState, useMemo, useEffect } from 'react'; 
import { useNavigate } from 'react-router-dom';

// İkonlar
import { 
    RefreshCw, Settings, List, CheckCircle, 
    PlayCircle, Zap, Sparkles, HardHat, Edit2, Cpu, Filter, Search,
    LayoutGrid, ArrowRight 
} from 'lucide-react';

// Sabitler
import { MOLD_STATUS, MOLD_STATUS_ACTIVE_LIST, OPERATION_STATUS, PROJECT_TYPES, PROJECT_TYPE_CONFIG } from '../config/constants.js';

// Yardımcı Fonksiyonlar
import { getStatusClasses } from '../utils/styleUtils.js';
import { formatDateTR, calculate6DayWorkRemaining, calculate6DayDiff } from '../utils/dateUtils.js';

// --- GÜNCELLENMİŞ: GELİŞMİŞ KALIP LİSTESİ ---
const EnhancedMoldList = ({ projects }) => {
    
    // --- 1. DEĞİŞİKLİK: FİLTRE HAFIZASI ---
    // Başlangıçta hafızaya bak, yoksa varsayılan olarak 'ACTIVE_OVERVIEW' (Aktif Çalışan) yap.
    const [activeFilter, setActiveFilter] = useState(() => {
        return localStorage.getItem('moldListActiveFilter') || 'ACTIVE_OVERVIEW';
    });

    const [searchTerm, setSearchTerm] = useState('');
    
    // Görünüm Modu (LocalStorage'dan hatırlar)
    const [viewMode, setViewMode] = useState(() => {
        return localStorage.getItem('moldListViewMode') || 'card';
    });

    // --- 2. DEĞİŞİKLİK: FİLTREYİ KAYDETME ---
    // Filtre her değiştiğinde hafızaya yaz
    useEffect(() => {
        localStorage.setItem('moldListActiveFilter', activeFilter);
    }, [activeFilter]);

    // Görünüm modu her değiştiğinde hafızaya kaydet
    useEffect(() => {
        localStorage.setItem('moldListViewMode', viewMode);
    }, [viewMode]);
    
    const navigate = useNavigate();
    
    const calculateMoldProgress = (tasks) => {
        if (!tasks || tasks.length === 0) return 0;
        const allOperations = tasks.flatMap(t => t.operations);
        if (allOperations.length === 0) return 0;
        const totalProgress = allOperations.reduce((acc, op) => acc + op.progressPercentage, 0);
        return totalProgress / allOperations.length;
    };

    const getProjectTypeStyle = (type) => {
        const typeKey = type || PROJECT_TYPES.NEW_MOLD;
        return PROJECT_TYPE_CONFIG[typeKey] || PROJECT_TYPE_CONFIG[PROJECT_TYPES.NEW_MOLD];
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
            <div className="flex flex-wrap gap-4 mb-6">
                <FilterCard filterKey="all" title="Tüm Kalıplar" count={stats.total} icon={Filter} colorClass="border-blue-500 bg-blue-50"/>
                <FilterCard filterKey="ACTIVE_OVERVIEW" title="Aktif Çalışan" count={stats.activeOverview} icon={PlayCircle} colorClass="border-green-500 bg-green-50 text-green-500"/>
                <FilterCard filterKey={MOLD_STATUS.WAITING} title="Beklemede" count={stats.waiting} icon={RefreshCw} colorClass="border-yellow-500 bg-yellow-50 text-yellow-500"/>
                {/* TASARIM FİLTRESİ */}
                <FilterCard filterKey={MOLD_STATUS.TASARIM} title="Tasarım" count={stats[MOLD_STATUS.TASARIM]} icon={Edit2} colorClass="border-purple-500 bg-purple-50 text-purple-500"/>
                
                <FilterCard filterKey={MOLD_STATUS.CNC} title="CNC" count={stats[MOLD_STATUS.CNC]} icon={Cpu} colorClass="border-blue-500 bg-blue-50 text-blue-500"/>
                <FilterCard filterKey={MOLD_STATUS.EREZYON} title="Erezyon" count={stats[MOLD_STATUS.EREZYON]} icon={Zap} colorClass="border-blue-500 bg-blue-50 text-blue-500"/>
                <FilterCard filterKey={MOLD_STATUS.POLISAJ} title="Polisaj" count={stats[MOLD_STATUS.POLISAJ]} icon={Sparkles} colorClass="border-blue-500 bg-blue-50 text-blue-500"/>
                <FilterCard filterKey={MOLD_STATUS.DESEN} title="Desen" count={stats[MOLD_STATUS.DESEN]} icon={Edit2} colorClass="border-blue-500 bg-blue-50 text-blue-500"/>
                <FilterCard filterKey={MOLD_STATUS.MOLD_ASSEMBLY} title="Kalıp Montaj" count={stats[MOLD_STATUS.MOLD_ASSEMBLY]} icon={HardHat} colorClass="border-blue-500 bg-blue-50 text-blue-500"/>
                <FilterCard filterKey={MOLD_STATUS.TRIAL} title="Deneme'de" count={stats[MOLD_STATUS.TRIAL]} icon={Settings} colorClass="border-blue-500 bg-blue-50 text-blue-500"/>
                {/* REVİZYON BUTONU KALDIRILDI */}
                <FilterCard filterKey={MOLD_STATUS.COMPLETED} title="Tamamlanan" count={stats.completed} icon={CheckCircle} colorClass="border-green-500 bg-green-50 text-green-500"/>
            </div>

            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4 md:mb-0">
                    Kalıp Listesi
                    <span className="text-sm font-normal text-gray-500 dark:text-gray-400 ml-2">
                        ({filteredProjects.length} kalıp)
                    </span>
                </h2>
                
                <div className="flex items-center gap-3 w-full md:w-auto">
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

                    {/* GÖRÜNÜM DEĞİŞTİRME BUTONLARI */}
                    <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-1 border border-gray-200 dark:border-gray-600">
                        <button 
                            onClick={() => setViewMode('card')} 
                            className={`p-2 rounded-md transition ${viewMode === 'card' ? 'bg-white dark:bg-gray-600 text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'}`}
                            title="Kart Görünümü"
                        >
                            <LayoutGrid className="w-5 h-5" />
                        </button>
                        <button 
                            onClick={() => setViewMode('list')} 
                            className={`p-2 rounded-md transition ${viewMode === 'list' ? 'bg-white dark:bg-gray-600 text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'}`}
                            title="Liste Görünümü"
                        >
                            <List className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            </div>

            {viewMode === 'list' ? (
                // LİSTE GÖRÜNÜMÜ (TABLO)
                <div className="overflow-x-auto bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-900">
                            <tr>
                                <th scope="col" className="px-4 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-300 uppercase tracking-wider w-16">Öncelik</th>
                                <th scope="col" className="px-4 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-300 uppercase tracking-wider">Kalıp Adı</th>
                                <th scope="col" className="px-4 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-300 uppercase tracking-wider hidden md:table-cell">Müşteri</th>
                                <th scope="col" className="px-4 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-300 uppercase tracking-wider">Durum</th>
                                <th scope="col" className="px-4 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-300 uppercase tracking-wider hidden lg:table-cell">Tür</th>
                                <th scope="col" className="px-4 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-300 uppercase tracking-wider hidden sm:table-cell">Termin</th>
                                <th scope="col" className="px-4 py-3 text-center text-xs font-bold text-gray-500 dark:text-gray-300 uppercase tracking-wider w-32">İlerleme</th>
                                <th scope="col" className="px-4 py-3 text-right text-xs font-bold text-gray-500 dark:text-gray-300 uppercase tracking-wider w-16">Detay</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200 dark:bg-gray-800 dark:divide-gray-700">
                            {filteredProjects.length === 0 ? (
                                <tr>
                                    <td colSpan="8" className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
                                        Kayıt bulunamadı.
                                    </td>
                                </tr>
                            ) : (
                                filteredProjects.map((project) => {
                                    const totalProgress = calculateMoldProgress(project.tasks);
                                    const moldStatus = project.status || MOLD_STATUS.WAITING;
                                    const typeStyle = getProjectTypeStyle(project.projectType);

                                    return (
                                        <tr 
                                            key={project.id} 
                                            onClick={() => navigate(`/mold/${project.id}`)}
                                            className="hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors"
                                        >
                                            <td className="px-4 py-3 whitespace-nowrap">
                                                {project.priority ? (
                                                    <span className="inline-flex items-center justify-center w-6 h-6 bg-red-100 text-red-600 rounded-full text-xs font-bold border border-red-200">
                                                        {project.priority}
                                                    </span>
                                                ) : (
                                                    <span className="text-gray-400 text-xs">-</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="text-sm font-bold text-gray-900 dark:text-white">{project.moldName}</div>
                                                <div className="text-xs text-gray-500 md:hidden">{project.customer}</div>
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap hidden md:table-cell">
                                                <div className="text-sm text-gray-600 dark:text-gray-300">{project.customer}</div>
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap">
                                                <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusClasses(moldStatus)}`}>
                                                    {moldStatus}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap hidden lg:table-cell">
                                                <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded border ${typeStyle.colorClass}`}>
                                                    {typeStyle.label}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap hidden sm:table-cell">
                                                <div className="text-sm text-gray-700 dark:text-gray-300 font-medium">
                                                    {formatDateTR(project.moldDeadline) || '-'}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-center">
                                                <div className="flex items-center justify-center gap-2">
                                                    <div className="w-16 bg-gray-200 rounded-full h-1.5 dark:bg-gray-700">
                                                        <div 
                                                            className={`h-1.5 rounded-full ${totalProgress === 100 ? 'bg-green-500' : 'bg-blue-500'}`} 
                                                            style={{ width: `${totalProgress.toFixed(0)}%` }}
                                                        ></div>
                                                    </div>
                                                    <span className="text-xs font-bold text-gray-600 dark:text-gray-400">%{totalProgress.toFixed(0)}</span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-right text-gray-400 hover:text-blue-500">
                                                <ArrowRight className="w-5 h-5" />
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            ) : (
                // KART GÖRÜNÜMÜ
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
                            
                            const typeStyle = getProjectTypeStyle(project.projectType);

                            const assignedCamOperators = project.tasks
                                .flatMap(task => task.operations.map(op => op.assignedOperator))
                                .filter(op => op && op !== 'SEÇ');
    
                            const uniqueCamOperators = [...new Set(assignedCamOperators)];
                            
                            // --- TERMİN HESAPLAMALARI ---
                            const remainingDays = calculate6DayWorkRemaining(project.moldDeadline);
                            
                            // Termin geçmiş mi kontrolü (Takvim günü üzerinden)
                            const today = new Date();
                            today.setHours(0,0,0,0);
                            const deadlineDate = project.moldDeadline ? new Date(project.moldDeadline) : null;
                            if(deadlineDate) deadlineDate.setHours(0,0,0,0);
                            
                            const isOverdue = deadlineDate && deadlineDate < today;
                            const overdueDays = isOverdue ? Math.ceil((today - deadlineDate) / (1000 * 60 * 60 * 24)) : 0;

                            const isCritical = remainingDays !== 0 && 
                                                remainingDays <= 6 &&
                                                !isOverdue &&
                                                totalProgress <= 80 &&
                                                moldStatus !== MOLD_STATUS.COMPLETED;
                                                
                            // RENKLİ KENAR ÇİZGİSİ
                            const cardHighlightClasses = isCritical 
                                ? 'bg-red-100 dark:bg-red-900/30 border-red-600 dark:border-red-500 animate-pulse'
                                : `bg-white dark:bg-gray-800 ${typeStyle.borderClass}`; 
                                
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
                                    onClick={() => navigate(`/mold/${project.id}`)} 
                                    className={`p-4 rounded-xl shadow-lg hover:shadow-xl transition duration-300 transform hover:-translate-y-1 cursor-pointer border-t-4 border-l-4 flex flex-col ${cardHighlightClasses} relative`}
                                >
                                    {project.priority && (
                                        <div className="absolute -top-3 -left-3 w-8 h-8 bg-red-600 text-white rounded-full flex items-center justify-center font-bold text-sm shadow-lg border-2 border-white dark:border-gray-800 z-10">
                                            {project.priority}
                                        </div>
                                    )}
                            
                                    <div className="flex-grow">
                                        <div className="mb-2">
                                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${typeStyle.colorClass}`}>
                                                {typeStyle.label}
                                            </span>
                                        </div>

                                        <div className="flex justify-between items-start mb-3">
                                            <h3 className="text-lg font-bold text-gray-900 dark:text-white truncate">{project.moldName}</h3>
                                            <span className={`px-2 py-0.5 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusClasses(moldStatus)}`}>
                                                {moldStatus}
                                            </span>
                                        </div>
        
                                        <p className="text-gray-600 dark:text-gray-400 text-xs mb-1">
                                            Müşteri: <span className="font-semibold">{project.customer}</span>
                                        </p>
                                        
                                        {project.projectManager && (
                                            <p className="text-gray-600 dark:text-gray-400 text-xs mb-1">
                                                Proje Sor: <span className="font-semibold text-blue-700 dark:text-blue-300">{project.projectManager}</span>
                                            </p>
                                        )}
                                        {project.moldDesigner && (
                                            <p className="text-gray-600 dark:text-gray-400 text-xs mb-1">
                                                Tasarım Sor: <span className="font-semibold text-purple-700 dark:text-purple-300">{project.moldDesigner}</span>
                                            </p>
                                        )}
                                        
                                        <p className="text-gray-600 dark:text-gray-400 text-xs">
                                            Termin: <span className="font-semibold">{formatDateTR(project.moldDeadline) || '---'}</span>
                                        </p>
                                        
                                        {moldStatus === MOLD_STATUS.COMPLETED ? (
                                            (() => {
                                                let completionText = 'Tamamlandı';
                                                let diffText = '';
                                                
                                                let finishDateStr = project.completedAt;
                                                if (!finishDateStr && project.tasks) {
                                                    const allOps = project.tasks.flatMap(t => t.operations);
                                                    const completedOps = allOps.filter(op => op.status === OPERATION_STATUS.COMPLETED && (op.finishDate || op.supervisorReviewDate));
                                                    if (completedOps.length > 0) {
                                                        const maxTime = Math.max(...completedOps.map(op => new Date(op.finishDate || op.supervisorReviewDate).getTime()));
                                                        finishDateStr = new Date(maxTime).toISOString();
                                                    }
                                                }

                                                if (project.moldDeadline && finishDateStr) {
                                                    const deadline = new Date(project.moldDeadline);
                                                    const finish = new Date(finishDateStr);
                                                    deadline.setHours(0,0,0,0);
                                                    finish.setHours(0,0,0,0);

                                                    if (finish > deadline) {
                                                        const diff = calculate6DayDiff(deadline.toISOString(), finish.toISOString());
                                                        diffText = ` (${diff} gün geç)`;
                                                    } else if (finish < deadline) {
                                                        const diff = calculate6DayDiff(finish.toISOString(), deadline.toISOString());
                                                        diffText = ` (${diff} gün erken)`;
                                                    } else {
                                                        diffText = ` (Tam zamanında)`;
                                                    }
                                                }

                                                return (
                                                    <p className="text-xs mt-1 text-green-700 dark:text-green-500 font-semibold">
                                                        {completionText} <span className={diffText.includes('geç') ? 'text-red-600' : 'text-green-600'}>{diffText}</span>
                                                    </p>
                                                );
                                            })()
                                        ) : (
                                            (() => {
                                                if (!project.moldDeadline) return null;

                                                if (isOverdue) {
                                                    return (
                                                        <p className="text-xs mt-1 text-red-700 dark:text-red-500 font-bold">
                                                            TERMİN {overdueDays} GÜN GEÇTİ
                                                        </p>
                                                    );
                                                } else {
                                                    let remainingDaysText = `${remainingDays} iş günü kaldı`;
                                                    let remainingDaysColor = 'text-gray-500 dark:text-gray-400';

                                                    if (remainingDays === 0) {
                                                        remainingDaysText = 'SON GÜN';
                                                        remainingDaysColor = 'text-red-600 dark:text-red-400 font-bold animate-pulse';
                                                    } else if (remainingDays <= 5) {
                                                        remainingDaysText = `${remainingDays} iş günü kaldı (KRİTİK)`;
                                                        remainingDaysColor = 'text-yellow-600 dark:text-yellow-400 font-semibold';
                                                    } else {
                                                        remainingDaysColor = 'text-green-600 dark:text-green-400';
                                                    }

                                                    return (
                                                        <p className={`text-xs mt-1 ${remainingDaysColor}`}>
                                                            {remainingDaysText}
                                                        </p>
                                                    );
                                                }
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
            )}
        </div>
    );
};

export default EnhancedMoldList;