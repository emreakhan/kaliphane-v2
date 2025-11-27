// src/pages/AnalysisPage.js

import React, { useState, useMemo } from 'react';

// İkonlar
import { 
    Search, Users, Box, Calendar, Clock, CheckCircle, 
    AlertTriangle, BarChart2, PieChart, Monitor, TrendingUp, 
    CalendarDays, AlertOctagon, History, ClipboardList,
    ArrowRight, Activity, Layers, Filter, Table as TableIcon 
} from 'lucide-react';

// Sabitler
import { 
    OPERATION_STATUS, PERSONNEL_ROLES, MOLD_STATUS, ROLES, 
    PROJECT_TYPES, PROJECT_TYPE_CONFIG 
} from '../config/constants.js';

// Yardımcı Fonksiyonlar
import { formatDate, formatDateTime } from '../utils/dateUtils.js';


const AnalysisPage = ({ projects, personnel, loggedInUser }) => {
    
    const [activeTab, setActiveTab] = useState('general'); 
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedId, setSelectedId] = useState(null); 
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear()); 
    const [selectedTimelineMoldId, setSelectedTimelineMoldId] = useState('');

    // --- YETKİ KONTROLÜ ---
    const isAdmin = loggedInUser?.role === ROLES.ADMIN;
    const canViewReworkTab = 
        loggedInUser?.role === ROLES.ADMIN || 
        loggedInUser?.role === ROLES.KALIP_TASARIM_SORUMLUSU ||
        loggedInUser?.role === ROLES.SUPERVISOR;

    // --- ORTAK VERİ HAZIRLIĞI ---
    const allCompletedOperations = useMemo(() => {
        return projects.flatMap(mold => 
            mold.tasks.flatMap(task => 
                task.operations
                    .filter(op => op.status === OPERATION_STATUS.COMPLETED)
                    .map(op => ({ 
                        ...op, 
                        moldName: mold.moldName,
                        taskName: task.taskName,
                        moldId: mold.id
                    }))
            )
        );
    }, [projects]);

    const availableYears = useMemo(() => {
        const years = new Set();
        years.add(new Date().getFullYear()); 
        
        allCompletedOperations.forEach(op => {
            if (op.finishDate) {
                years.add(new Date(op.finishDate).getFullYear());
            }
        });

        projects.forEach(p => {
            if (p.createdAt) years.add(new Date(p.createdAt).getFullYear());
            if (p.moldDeadline) years.add(new Date(p.moldDeadline).getFullYear());
        });

        return Array.from(years).sort((a, b) => b - a); 
    }, [allCompletedOperations, projects]);


    // --- HESAPLAMALAR ---

    // 1. Yıllık İstatistikler
    const yearlyStats = useMemo(() => {
        const operationsInYear = allCompletedOperations.filter(op => 
            op.finishDate && new Date(op.finishDate).getFullYear() === parseInt(selectedYear)
        );
        const totalHours = operationsInYear.reduce((acc, op) => acc + (parseFloat(op.durationInHours) || 0), 0);
        const completedMoldsInYear = projects.filter(p => {
            if (p.status !== MOLD_STATUS.COMPLETED) return false;
            const allOps = p.tasks.flatMap(t => t.operations);
            const lastOpDate = allOps.filter(op => op.finishDate).map(op => new Date(op.finishDate)).sort((a, b) => b - a)[0]; 
            return lastOpDate && lastOpDate.getFullYear() === parseInt(selectedYear);
        }).length;
        const monthlyData = Array(12).fill(0).map(() => ({ ops: 0, hours: 0 }));
        operationsInYear.forEach(op => {
            const month = new Date(op.finishDate).getMonth(); 
            monthlyData[month].ops += 1;
            monthlyData[month].hours += (parseFloat(op.durationInHours) || 0);
        });
        const maxMonthlyOps = Math.max(...monthlyData.map(d => d.ops), 1);
        return { totalOps: operationsInYear.length, totalHours: totalHours.toFixed(0), completedMolds: completedMoldsInYear, monthlyData, maxMonthlyOps };
    }, [allCompletedOperations, projects, selectedYear]);

    // 2. Hata Analizi
    const reworkAnalysis = useMemo(() => {
        if (!canViewReworkTab) return null;
        const allReworks = projects.flatMap(mold => 
            mold.tasks.flatMap(task => 
                task.operations.flatMap(op => 
                    (op.reworkHistory || []).map(history => ({
                        ...history,
                        moldName: mold.moldName,
                        taskName: task.taskName,
                        opType: op.type,
                        machine: op.machineName || 'Belirsiz',
                        currentStatus: op.status
                    }))
                )
            )
        ).sort((a, b) => new Date(b.date) - new Date(a.date));

        const totalReworks = allReworks.length;
        const moldCounts = {}; allReworks.forEach(r => { moldCounts[r.moldName] = (moldCounts[r.moldName] || 0) + 1; });
        const mostProblematicMold = Object.entries(moldCounts).sort((a,b) => b[1] - a[1])[0];
        const reasonCounts = {}; allReworks.forEach(r => { reasonCounts[r.reason] = (reasonCounts[r.reason] || 0) + 1; });
        const mostCommonReason = Object.entries(reasonCounts).sort((a,b) => b[1] - a[1])[0];

        return {
            data: allReworks,
            totalReworks,
            mostProblematicMold: mostProblematicMold ? { name: mostProblematicMold[0], count: mostProblematicMold[1] } : null,
            mostCommonReason: mostCommonReason ? { name: mostCommonReason[0], count: mostCommonReason[1] } : null
        };
    }, [projects, canViewReworkTab]);

    // 3. Üretim Logları
    const productionLogs = useMemo(() => {
        const logs = projects.flatMap(mold => 
            mold.tasks.flatMap(task => 
                task.operations
                    .filter(op => op.setupStartTime || op.productionStartTime || op.finishTime)
                    .map(op => {
                        let setupDuration = 0;
                        if (op.setupStartTime && op.productionStartTime) {
                            setupDuration = new Date(op.productionStartTime) - new Date(op.setupStartTime);
                        }
                        let productionDuration = 0;
                        if (op.productionStartTime && op.finishTime) {
                            productionDuration = new Date(op.finishTime) - new Date(op.productionStartTime);
                        }
                        const totalDuration = setupDuration + productionDuration;

                        const formatMs = (ms) => {
                            if (!ms || ms <= 0) return '-';
                            const minutes = Math.floor(ms / (1000 * 60));
                            const h = Math.floor(minutes / 60);
                            const m = minutes % 60;
                            if (h > 0) return `${h}s ${m}dk`;
                            return `${m}dk`;
                        };

                        return {
                            id: op.id,
                            date: op.finishTime || op.productionStartTime || op.setupStartTime,
                            operator: op.assignedOperator || op.machineOperatorName || '?',
                            moldName: mold.moldName,
                            taskName: task.taskName,
                            opType: op.type,
                            machine: op.machineName || '-',
                            setupTimeText: formatMs(setupDuration),
                            productionTimeText: formatMs(productionDuration),
                            totalTimeText: formatMs(totalDuration),
                            status: op.status
                        };
                    })
            )
        ).sort((a, b) => new Date(b.date) - new Date(a.date));
        return logs;
    }, [projects]);

    // 4. Zaman Çizelgesi
    const timelineAnalysis = useMemo(() => {
        if (!selectedTimelineMoldId) return null;
        const mold = projects.find(p => p.id === selectedTimelineMoldId);
        if (!mold) return null;

        const ops = mold.tasks.flatMap(t => 
            t.operations
              .filter(op => op.startDate && (op.finishDate || op.status === OPERATION_STATUS.IN_PROGRESS))
              .map(op => ({
                  ...op,
                  taskName: t.taskName,
                  virtualFinishDate: op.finishDate ? new Date(op.finishDate) : new Date() 
              }))
        );

        if (ops.length === 0) return { moldName: mold.moldName, noData: true };

        const startTimes = ops.map(op => new Date(op.startDate).getTime());
        const endTimes = ops.map(op => op.virtualFinishDate.getTime());
        const minTime = Math.min(...startTimes);
        const maxTime = Math.max(...endTimes);
        const totalDurationMs = maxTime - minTime; 

        const totalEffortHours = ops.reduce((acc, op) => acc + (parseFloat(op.durationInHours) || 0), 0);
        const calendarDays = (totalDurationMs / (1000 * 60 * 60 * 24)).toFixed(1);
        const calendarHours = (totalDurationMs / (1000 * 60 * 60)).toFixed(1);

        const timelineData = ops.map(op => {
            const start = new Date(op.startDate).getTime();
            const end = op.virtualFinishDate.getTime();
            const offsetPercent = ((start - minTime) / totalDurationMs) * 100;
            const widthPercent = ((end - start) / totalDurationMs) * 100;
            return { ...op, offsetPercent, widthPercent: Math.max(widthPercent, 1) };
        }).sort((a, b) => new Date(a.startDate) - new Date(b.startDate));

        return { moldName: mold.moldName, noData: false, totalEffortHours, calendarDays, calendarHours, timelineData, minDate: new Date(minTime), maxDate: new Date(maxTime) };
    }, [selectedTimelineMoldId, projects]);

    // 5. Filtreleme
    const filteredPersonnel = useMemo(() => {
        const lowerSearchTerm = searchTerm.toLowerCase();
        return personnel.filter(p => p.name.toLowerCase().includes(lowerSearchTerm) || p.role.toLowerCase().includes(lowerSearchTerm)).sort((a, b) => a.name.localeCompare(b.name));
    }, [personnel, searchTerm]);

    const filteredMolds = useMemo(() => {
        const lowerSearchTerm = searchTerm.toLowerCase();
        return projects.filter(p => p.moldName.toLowerCase().includes(lowerSearchTerm) || p.customer.toLowerCase().includes(lowerSearchTerm)).sort((a, b) => a.moldName.localeCompare(b.moldName));
    }, [projects, searchTerm]);

    const selectedPersonnelData = useMemo(() => {
        if (activeTab !== 'personnel' || !selectedId) return null;
        const person = personnel.find(p => p.id === selectedId);
        if (!person) return null;
        let relevantTasks = []; let totalRatings = 0; let ratingCount = 0;
        if (person.role === PERSONNEL_ROLES.CAM_OPERATOR || person.role === PERSONNEL_ROLES.SUPERVISOR || person.role === PERSONNEL_ROLES.ADMIN) {
            relevantTasks = allCompletedOperations.filter(op => op.assignedOperator === person.name);
            relevantTasks.forEach(op => { if (op.supervisorRating) { totalRatings += op.supervisorRating; ratingCount++; } });
        } else if (person.role === PERSONNEL_ROLES.MACHINE_OPERATOR) {
            relevantTasks = allCompletedOperations.filter(op => op.machineOperatorName === person.name);
            relevantTasks.forEach(op => { if (op.camOperatorRatingForMachineOp) { totalRatings += op.camOperatorRatingForMachineOp; ratingCount++; } });
        }
        const averageRating = ratingCount > 0 ? (totalRatings / ratingCount).toFixed(1) : 0;
        return { ...person, completedTasks: relevantTasks.sort((a, b) => new Date(b.finishDate) - new Date(a.finishDate)), averageRating, ratingCount };
    }, [selectedId, personnel, allCompletedOperations, activeTab]);

    const selectedMoldData = useMemo(() => {
        if (activeTab !== 'mold' || !selectedId) return null;
        const mold = projects.find(p => p.id === selectedId);
        if (!mold) return null;
        const allOps = mold.tasks.flatMap(t => t.operations);
        const completedOps = allOps.filter(op => op.status === OPERATION_STATUS.COMPLETED);
        const startDates = allOps.map(op => op.startDate ? new Date(op.startDate).getTime() : null).filter(d => d);
        const endDates = completedOps.map(op => op.finishDate ? new Date(op.finishDate).getTime() : null).filter(d => d);
        const firstStartDate = startDates.length > 0 ? new Date(Math.min(...startDates)) : null;
        const lastFinishDate = endDates.length > 0 ? new Date(Math.max(...endDates)) : null;
        let totalDurationDays = 0;
        if (firstStartDate && lastFinishDate) totalDurationDays = Math.ceil((lastFinishDate - firstStartDate) / (1000 * 60 * 60 * 24));
        const totalManHours = completedOps.reduce((acc, op) => acc + (parseFloat(op.durationInHours) || 0), 0);
        let totalQuality = 0; let qualityCount = 0;
        completedOps.forEach(op => { if(op.supervisorRating) { totalQuality += op.supervisorRating; qualityCount++; } });
        const averageQuality = qualityCount > 0 ? (totalQuality / qualityCount).toFixed(1) : "---";
        let deadlineStatus = "Belirsiz"; let deadlineColor = "text-gray-500";
        if (mold.moldDeadline && lastFinishDate) {
            const deadline = new Date(mold.moldDeadline);
            const diffTime = deadline - lastFinishDate;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
            if (diffDays >= 0) { deadlineStatus = `${diffDays} Gün Erken Bitti`; deadlineColor = "text-green-600"; } 
            else { deadlineStatus = `${Math.abs(diffDays)} Gün Gecikti`; deadlineColor = "text-red-600"; }
        } else if (mold.moldDeadline) { deadlineStatus = "Devam Ediyor"; deadlineColor = "text-blue-600"; }
        const opDistribution = {}; allOps.forEach(op => { opDistribution[op.type] = (opDistribution[op.type] || 0) + 1; });
        const opHourDistribution = {}; completedOps.forEach(op => { const duration = parseFloat(op.durationInHours) || 0; opHourDistribution[op.type] = (opHourDistribution[op.type] || 0) + duration; });
        const machineHourDistribution = {}; completedOps.forEach(op => { const duration = parseFloat(op.durationInHours) || 0; const machineName = op.machineName && op.machineName !== 'SEÇ' ? op.machineName : 'Tezgahsız / Diğer'; machineHourDistribution[machineName] = (machineHourDistribution[machineName] || 0) + duration; });
        return { ...mold, stats: { firstStartDate, lastFinishDate, totalDurationDays, totalManHours: totalManHours.toFixed(1), averageQuality, deadlineStatus, deadlineColor, totalOps: allOps.length, completedOpsCount: completedOps.length, opDistribution, opHourDistribution, machineHourDistribution } };
    }, [selectedId, projects, activeTab]);


    // --- ALT BİLEŞENLER ---

    // --- İŞ TİPİ ANALİZİ ---
    const WorkTypeAnalysisCard = () => {
        const [analysisYear, setAnalysisYear] = useState(availableYears.length > 0 ? availableYears[0] : new Date().getFullYear());

        const analysisData = useMemo(() => {
            const monthlyStats = Array(12).fill(null).map(() => ({ total: 0 }));
            const yearlyTotals = {};
            
            const types = PROJECT_TYPES || {};
            const config = PROJECT_TYPE_CONFIG || {};

            Object.values(types).forEach(type => {
                yearlyTotals[type] = 0;
                monthlyStats.forEach(month => month[type] = 0);
            });

            projects.forEach(project => {
                const dateStr = project.createdAt || project.moldDeadline || new Date().toISOString();
                const date = new Date(dateStr);
                
                if (date.getFullYear() === analysisYear) {
                    const month = date.getMonth(); 
                    const type = project.projectType || types.NEW_MOLD || 'YENİ KALIP'; 

                    if (monthlyStats[month]) {
                        monthlyStats[month][type] = (monthlyStats[month][type] || 0) + 1;
                        monthlyStats[month].total += 1;
                    }
                    yearlyTotals[type] = (yearlyTotals[type] || 0) + 1;
                }
            });

            const totalProjects = Object.values(yearlyTotals).reduce((a, b) => a + b, 0);
            return { monthlyStats, yearlyTotals, totalProjects, types, config };
        }, [projects, analysisYear]);

        const months = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

        return (
            <div className="space-y-6 animate-fadeIn">
                <div className="flex flex-col md:flex-row justify-between items-center bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-4">
                        <h3 className="text-lg font-bold text-gray-800 dark:text-white flex items-center">
                            <PieChart className="w-5 h-5 mr-2 text-indigo-600" />
                            İş Tipi Dağılımı Analizi
                        </h3>
                        <select 
                            value={analysisYear} 
                            onChange={(e) => setAnalysisYear(parseInt(e.target.value))}
                            className="bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2"
                        >
                            {availableYears.map(year => (
                                <option key={year} value={year}>{year} Yılı</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex flex-wrap gap-2 justify-center">
                        {Object.values(analysisData.types).map(type => {
                            const conf = analysisData.config[type] || {};
                            const count = analysisData.yearlyTotals[type] || 0;
                            return (
                                <div key={type} className={`px-3 py-1 rounded-lg border ${conf.colorClass || 'bg-gray-100'} flex items-center shadow-sm`}>
                                    <span className="font-bold mr-2">{count}</span>
                                    <span className="text-xs font-medium uppercase">{conf.label || type}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    
                    {/* TABLO: AYLIK DETAYLI LİSTE (Grafik Yerine) */}
                    <div className="lg:col-span-2 bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700">
                        <h4 className="text-md font-semibold text-gray-700 dark:text-gray-300 mb-6 flex items-center">
                            <TableIcon className="w-4 h-4 mr-2" /> Aylık Detaylı Tablo
                        </h4>
                        
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm">
                                <thead>
                                    <tr className="bg-gray-50 dark:bg-gray-700">
                                        <th className="px-3 py-3 text-left font-bold text-gray-600 dark:text-gray-300">Ay</th>
                                        {Object.values(analysisData.types).map(type => (
                                            <th key={type} className="px-3 py-3 text-center font-bold text-gray-600 dark:text-gray-300">
                                                {analysisData.config[type]?.label || type}
                                            </th>
                                        ))}
                                        <th className="px-3 py-3 text-center font-bold text-gray-900 dark:text-white">TOPLAM</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                    {analysisData.monthlyStats.map((stat, index) => (
                                        <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition">
                                            <td className="px-3 py-3 font-medium text-gray-900 dark:text-white">
                                                {months[index]}
                                            </td>
                                            {Object.values(analysisData.types).map(type => {
                                                const count = stat[type] || 0;
                                                const conf = analysisData.config[type] || {};
                                                
                                                // Rengi Text Rengine Çevir (bg-blue-100 -> text-blue-600)
                                                let textColor = 'text-gray-600 dark:text-gray-400';
                                                if (count > 0 && conf.colorClass) {
                                                    if(conf.colorClass.includes('blue')) textColor = 'text-blue-600 font-bold';
                                                    else if(conf.colorClass.includes('orange')) textColor = 'text-orange-600 font-bold';
                                                    else if(conf.colorClass.includes('purple')) textColor = 'text-purple-600 font-bold';
                                                    else if(conf.colorClass.includes('teal')) textColor = 'text-teal-600 font-bold';
                                                    else if(conf.colorClass.includes('indigo')) textColor = 'text-indigo-600 font-bold';
                                                }

                                                return (
                                                    <td key={type} className="px-3 py-3 text-center">
                                                        {count > 0 ? (
                                                            <span className={textColor}>{count}</span>
                                                        ) : (
                                                            <span className="text-gray-300 dark:text-gray-600">-</span>
                                                        )}
                                                    </td>
                                                );
                                            })}
                                            <td className="px-3 py-3 text-center font-bold text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-700/30">
                                                {stat.total > 0 ? stat.total : ''}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* GRAFİK 2: YILLIK ORANLAR (SAĞ TARAF) */}
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700">
                        <h4 className="text-md font-semibold text-gray-700 dark:text-gray-300 mb-6 flex items-center">
                            <Activity className="w-4 h-4 mr-2" /> Yıllık Oranlar
                        </h4>
                        <div className="space-y-4">
                            {Object.values(analysisData.types).map(type => {
                                const count = analysisData.yearlyTotals[type];
                                if (count === 0) return null;
                                const percentage = analysisData.totalProjects > 0 ? ((count / analysisData.totalProjects) * 100).toFixed(1) : 0;
                                const conf = analysisData.config[type] || {};
                                
                                let progressColor = 'bg-gray-500';
                                if (conf.colorClass) {
                                    if(conf.colorClass.includes('blue')) progressColor = 'bg-blue-500';
                                    else if(conf.colorClass.includes('orange')) progressColor = 'bg-orange-500';
                                    else if(conf.colorClass.includes('purple')) progressColor = 'bg-purple-500';
                                    else if(conf.colorClass.includes('teal')) progressColor = 'bg-teal-500';
                                    else if(conf.colorClass.includes('indigo')) progressColor = 'bg-indigo-500';
                                }

                                return (
                                    <div key={type}>
                                        <div className="flex justify-between text-sm mb-1">
                                            <span className="font-medium text-gray-700 dark:text-gray-200 flex items-center">
                                                <span className={`w-3 h-3 rounded-full mr-2 ${progressColor}`}></span>
                                                {conf.label || type}
                                            </span>
                                            <span className="text-gray-500 dark:text-gray-400 font-bold">
                                                %{percentage} ({count})
                                            </span>
                                        </div>
                                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
                                            <div className={`h-3 rounded-full ${progressColor}`} style={{ width: `${percentage}%` }}></div>
                                        </div>
                                    </div>
                                );
                            })}
                            <div className="pt-4 mt-4 border-t border-gray-200 dark:border-gray-700 text-center">
                                <p className="text-sm text-gray-500">Toplam İş Hacmi</p>
                                <p className="text-4xl font-extrabold text-gray-800 dark:text-white mt-1">
                                    {analysisData.totalProjects} <span className="text-sm font-normal text-gray-400">Adet</span>
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    const GeneralAnalysisCard = () => {
        const months = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
        return (
            <div className="space-y-8 animate-fadeIn">
                <div className="flex flex-col md:flex-row justify-between items-center bg-white dark:bg-gray-800 p-6 rounded-xl border border-gray-200 dark:border-gray-700">
                    <div><h3 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center"><TrendingUp className="w-6 h-6 mr-2 text-blue-600" />Yıllık Faaliyet Raporu</h3><p className="text-gray-500 dark:text-gray-400 mt-1">Şirketin genel performans verileri</p></div>
                    <div className="mt-4 md:mt-0 flex items-center"><CalendarDays className="w-5 h-5 mr-2 text-gray-500 dark:text-gray-300" /><select value={selectedYear} onChange={(e) => setSelectedYear(parseInt(e.target.value))} className="bg-gray-50 border border-gray-300 text-gray-900 text-lg rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-32 p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:text-white">{availableYears.map(year => (<option key={year} value={year}>{year}</option>))}</select></div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="p-6 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-lg transform hover:-translate-y-1 transition duration-300"><div className="flex justify-between items-start"><div><p className="text-blue-100 text-sm font-medium mb-1">Toplam Tamamlanan Kalıp</p><h4 className="text-4xl font-bold">{yearlyStats.completedMolds}</h4></div><Box className="w-8 h-8 text-blue-200 opacity-80" /></div></div>
                    <div className="p-6 rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 text-white shadow-lg transform hover:-translate-y-1 transition duration-300"><div className="flex justify-between items-start"><div><p className="text-purple-100 text-sm font-medium mb-1">Toplam İşçilik Saati</p><h4 className="text-4xl font-bold">{yearlyStats.totalHours}</h4></div><Clock className="w-8 h-8 text-purple-200 opacity-80" /></div></div>
                    <div className="p-6 rounded-xl bg-gradient-to-br from-green-500 to-green-600 text-white shadow-lg transform hover:-translate-y-1 transition duration-300"><div className="flex justify-between items-start"><div><p className="text-green-100 text-sm font-medium mb-1">Tamamlanan Operasyon</p><h4 className="text-4xl font-bold">{yearlyStats.totalOps}</h4></div><CheckCircle className="w-8 h-8 text-green-200 opacity-80" /></div></div>
                </div>
                <div className="bg-white dark:bg-gray-800 p-6 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm"><h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-6 flex items-center"><BarChart2 className="w-5 h-5 mr-2" />Aylık Üretim Yoğunluğu ({selectedYear})</h4><div className="h-64 flex items-end space-x-2 md:space-x-4">{yearlyStats.monthlyData.map((data, index) => (<div key={index} className="flex-1 flex flex-col items-center group relative"><div className="absolute bottom-full mb-2 hidden group-hover:block bg-gray-900 text-white text-xs rounded py-1 px-2 z-10 whitespace-nowrap">{data.ops} Operasyon<br/>{data.hours.toFixed(0)} Saat</div><div className="w-full bg-blue-200 dark:bg-blue-900/40 rounded-t-sm relative transition-all duration-500 hover:bg-blue-300 dark:hover:bg-blue-800" style={{ height: `${(data.ops / yearlyStats.maxMonthlyOps) * 100}%`, minHeight: data.ops > 0 ? '4px' : '0' }}><div className="absolute bottom-0 left-0 right-0 bg-blue-500 dark:bg-blue-600 rounded-t-sm transition-all duration-500" style={{ height: `${(data.ops / yearlyStats.maxMonthlyOps) * 100}%` }}></div></div><span className="text-xs text-gray-500 dark:text-gray-400 mt-2 transform -rotate-45 md:rotate-0 origin-top-left md:origin-center">{months[index].substring(0, 3)}</span></div>))}</div></div>
            </div>
        );
    };

    const ReworkAnalysisCard = () => {
        if (!reworkAnalysis) return null;
        const { data, totalReworks, mostProblematicMold, mostCommonReason } = reworkAnalysis;
        return (
            <div className="space-y-8 animate-fadeIn">
                 <div className="bg-red-50 dark:bg-red-900/20 p-6 rounded-xl border border-red-200 dark:border-red-800"><h3 className="text-2xl font-bold text-red-800 dark:text-red-300 flex items-center"><AlertOctagon className="w-8 h-8 mr-3" />Hata ve Yeniden İşleme (Rework) Kayıtları</h3><p className="text-red-600 dark:text-red-400 mt-2">Aşağıdaki liste, operasyon sırasında bildirilen hataları ve sıfırlanan işlemleri gösterir.</p></div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6"><div className="p-6 bg-white dark:bg-gray-800 rounded-xl shadow border-l-4 border-red-500"><p className="text-gray-500 dark:text-gray-400 text-sm font-medium">Toplam Hata Kaydı</p><h4 className="text-4xl font-bold text-gray-900 dark:text-white mt-1">{totalReworks}</h4></div><div className="p-6 bg-white dark:bg-gray-800 rounded-xl shadow border-l-4 border-orange-500"><p className="text-gray-500 dark:text-gray-400 text-sm font-medium">En Sorunlu Kalıp</p><h4 className="text-xl font-bold text-gray-900 dark:text-white mt-1 truncate">{mostProblematicMold ? mostProblematicMold.name : '---'}</h4><p className="text-xs text-gray-400">{mostProblematicMold ? `${mostProblematicMold.count} Hata` : ''}</p></div><div className="p-6 bg-white dark:bg-gray-800 rounded-xl shadow border-l-4 border-yellow-500"><p className="text-gray-500 dark:text-gray-400 text-sm font-medium">En Sık Görülen Sebep</p><h4 className="text-xl font-bold text-gray-900 dark:text-white mt-1 truncate">{mostCommonReason ? mostCommonReason.name : '---'}</h4><p className="text-xs text-gray-400">{mostCommonReason ? `${mostCommonReason.count} Kez` : ''}</p></div></div>
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow overflow-hidden border dark:border-gray-700"><div className="overflow-x-auto"><table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700"><thead className="bg-gray-50 dark:bg-gray-700"><tr><th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider dark:text-gray-300">Tarih</th><th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider dark:text-gray-300">Kalıp / Parça</th><th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider dark:text-gray-300">Operasyon</th><th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider dark:text-gray-300">Hata Nedeni</th><th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider dark:text-gray-300">Bildiren</th></tr></thead><tbody className="bg-white divide-y divide-gray-200 dark:bg-gray-800 dark:divide-gray-700">{data.length === 0 ? (<tr><td colSpan="5" className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">Henüz hiç hata kaydı bulunmamaktadır.</td></tr>) : (data.map((log, idx) => (<tr key={idx} className="hover:bg-red-50 dark:hover:bg-red-900/10 transition"><td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{formatDateTime(log.date)}</td><td className="px-6 py-4 whitespace-nowrap"><div className="text-sm font-medium text-gray-900 dark:text-white">{log.moldName}</div><div className="text-xs text-gray-500 dark:text-gray-400">{log.taskName}</div></td><td className="px-6 py-4 whitespace-nowrap"><div className="text-sm text-gray-900 dark:text-white font-bold">{log.opType}</div><div className="text-xs text-gray-500">Tezgah: {log.machine}</div></td><td className="px-6 py-4"><span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">{log.reason}</span>{log.description && (<p className="text-xs text-gray-500 mt-1 italic max-w-xs truncate">"{log.description}"</p>)}</td><td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400"><div className="flex items-center"><Users className="w-4 h-4 mr-1 text-gray-400"/>{log.reportedBy}</div><div className="text-xs text-red-400 mt-1">Silinen İlerleme: %{log.previousProgress}</div></td></tr>)))}</tbody></table></div></div>
            </div>
        );
    };

    const ProductionLogsCard = () => {
        return (
            <div className="space-y-6 animate-fadeIn">
                <div className="bg-white dark:bg-gray-800 p-6 rounded-xl border border-gray-200 dark:border-gray-700">
                    <h3 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center">
                        <ClipboardList className="w-6 h-6 mr-2 text-blue-600" />
                        Üretim Logları (Gerçek Zamanlı)
                    </h3>
                    <p className="text-gray-500 dark:text-gray-400 mt-1">
                        Operatörlerin terminal girişlerine göre hesaplanan gerçek ayar ve imalat süreleri.
                    </p>
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-xl shadow overflow-hidden border dark:border-gray-700">
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                            <thead className="bg-gray-50 dark:bg-gray-700">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider dark:text-gray-300">Tarih</th>
                                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider dark:text-gray-300">Operatör</th>
                                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider dark:text-gray-300">Kalıp / Parça</th>
                                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider dark:text-gray-300">Tezgah</th>
                                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider dark:text-gray-300 text-yellow-600">⏱️ Ayar Süresi</th>
                                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider dark:text-gray-300 text-green-600">⏱️ İmalat Süresi</th>
                                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider dark:text-gray-300">Toplam</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200 dark:bg-gray-800 dark:divide-gray-700">
                                {productionLogs.length === 0 ? (
                                    <tr>
                                        <td colSpan="7" className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
                                            Henüz tamamlanmış ve zaman kaydı olan bir operasyon bulunmamaktadır.
                                        </td>
                                    </tr>
                                ) : (
                                    productionLogs.map((log, idx) => (
                                        <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition">
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                                {formatDateTime(log.date)}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                                                {log.operator}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="text-sm text-gray-900 dark:text-white font-bold">{log.moldName}</div>
                                                <div className="text-xs text-gray-500 dark:text-gray-400">{log.taskName} ({log.opType})</div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                                <span className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded border border-gray-200 dark:border-gray-600">
                                                    {log.machine}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-yellow-600 dark:text-yellow-400 font-bold">
                                                {log.setupTimeText}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-green-600 dark:text-green-400 font-bold">
                                                {log.productionTimeText}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900 dark:text-white font-bold border-l dark:border-gray-600 pl-4">
                                                {log.totalTimeText}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        );
    };

    const TimelineCard = () => {
        const moldList = projects.map(p => ({ id: p.id, name: p.moldName }));
        return (
            <div className="space-y-6 animate-fadeIn">
                <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 flex items-center justify-between">
                    <div><h3 className="text-xl font-bold text-gray-900 dark:text-white flex items-center"><Layers className="w-6 h-6 mr-2 text-blue-600" />Kalıp Zaman Çizelgesi</h3><p className="text-sm text-gray-500">Parça çakışmaları ve gerçek takvim süresi analizi.</p></div>
                    <select value={selectedTimelineMoldId} onChange={(e) => setSelectedTimelineMoldId(e.target.value)} className="bg-gray-50 border border-gray-300 text-gray-900 rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-64 p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:text-white"><option value="">Bir Kalıp Seçiniz...</option>{moldList.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
                </div>
                {timelineAnalysis && !timelineAnalysis.noData ? (
                    <>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6"><div className="p-6 bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-200 dark:border-green-800 flex justify-between items-center"><div><p className="text-sm font-bold text-green-800 dark:text-green-300 uppercase tracking-wider">Toplam Efor (Maliyet)</p><h4 className="text-3xl font-black text-green-900 dark:text-white mt-1">{timelineAnalysis.totalEffortHours.toFixed(1)} Saat</h4><p className="text-xs text-green-700 dark:text-green-400 mt-1">İşçilik ve makine saati toplamı</p></div><Clock className="w-12 h-12 text-green-300 opacity-80" /></div><div className="p-6 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800 flex justify-between items-center"><div><p className="text-sm font-bold text-blue-800 dark:text-blue-300 uppercase tracking-wider">Takvim Süresi (Termin)</p><h4 className="text-3xl font-black text-blue-900 dark:text-white mt-1">{timelineAnalysis.calendarDays} Gün <span className="text-lg text-blue-600">({timelineAnalysis.calendarHours} Sa)</span></h4><p className="text-xs text-blue-700 dark:text-blue-400 mt-1">Başlangıçtan bitişe geçen gerçek zaman</p></div><Calendar className="w-12 h-12 text-blue-300 opacity-80" /></div></div>
                        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden"><h4 className="font-bold text-gray-800 dark:text-white mb-4 flex justify-between"><span>İş Akış Şeması</span><span className="text-xs font-normal text-gray-500">{formatDate(timelineAnalysis.minDate)} <ArrowRight className="w-3 h-3 inline mx-1"/> {formatDate(timelineAnalysis.maxDate)}</span></h4><div className="space-y-3 overflow-x-auto pb-2">{timelineAnalysis.timelineData.map(item => (<div key={item.id} className="flex items-center text-xs group"><div className="w-48 flex-shrink-0 truncate text-gray-600 dark:text-gray-300 pr-2" title={`${item.taskName} - ${item.opType}`}><span className="font-bold">{item.taskName}</span> <span className="text-gray-400">- {item.opType}</span></div><div className="flex-1 h-6 bg-gray-100 dark:bg-gray-700 rounded relative min-w-[300px]"><div className={`absolute h-full rounded transition-all hover:opacity-80 cursor-pointer flex items-center justify-center text-[10px] text-white font-bold shadow-sm ${item.status === OPERATION_STATUS.COMPLETED ? 'bg-green-500' : 'bg-blue-500 animate-pulse'}`} style={{ left: `${item.offsetPercent}%`, width: `${item.widthPercent}%` }} title={`${formatDate(item.startDate)} - ${formatDate(item.finishDate || new Date())}\n${item.machineName} (${item.assignedOperator})`}>{item.widthPercent > 5 && item.machineName}</div></div></div>))}</div></div>
                    </>
                ) : selectedTimelineMoldId ? (<div className="text-center py-12 text-gray-500">Bu kalıp için henüz zaman verisi oluşmamış.</div>) : (<div className="text-center py-12 text-gray-500 flex flex-col items-center"><Activity className="w-12 h-12 mb-2 opacity-20" />Lütfen analiz etmek için yukarıdan bir kalıp seçiniz.</div>)}
            </div>
        );
    };

    const SidebarList = () => (
        <div className="w-full lg:w-1/3 xl:w-1/4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg shadow-inner h-full min-h-[500px]">
            <div className="relative mb-4"><Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" /><input type="text" placeholder={activeTab === 'personnel' ? "Personel ara..." : "Kalıp ara..."} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent" /></div>
            <div className="max-h-[60vh] overflow-y-auto"><div className="divide-y divide-gray-200 dark:divide-gray-700">{activeTab === 'personnel' ? ( filteredPersonnel.map(person => (<button key={person.id} onClick={() => setSelectedId(person.id)} className={`w-full text-left p-3 transition rounded-lg ${selectedId === person.id ? 'bg-blue-600 text-white' : 'hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-200'}`}><p className="font-medium">{person.name}</p><p className={`text-sm ${selectedId === person.id ? 'text-blue-200' : 'text-gray-500 dark:text-gray-400'}`}>{person.role}</p></button>)) ) : ( filteredMolds.map(mold => (<button key={mold.id} onClick={() => setSelectedId(mold.id)} className={`w-full text-left p-3 transition rounded-lg ${selectedId === mold.id ? 'bg-purple-600 text-white' : 'hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-200'}`}><p className="font-medium">{mold.moldName}</p><p className={`text-sm ${selectedId === mold.id ? 'text-purple-200' : 'text-gray-500 dark:text-gray-400'}`}>{mold.customer}</p></button>)) )}</div></div>
        </div>
    );

    const PersonnelReportCard = () => {
        if (!selectedPersonnelData) return <div className="flex-1 p-10 text-center text-gray-500">Lütfen soldan bir personel seçiniz.</div>;
        return (
            <div className="flex-1 space-y-6 p-2">
                <div className="flex justify-between items-start border-b dark:border-gray-700 pb-4">
                    <div>
                        <h3 className="text-3xl font-bold text-gray-900 dark:text-white">{selectedPersonnelData.name}</h3>
                        <p className="text-lg text-gray-600 dark:text-gray-400">{selectedPersonnelData.role}</p>
                    </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800">
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Toplam Tamamlanan İş</p>
                        <p className="text-3xl font-bold text-gray-900 dark:text-white">{selectedPersonnelData.completedTasks.length}</p>
                    </div>
                    <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-xl border border-purple-200 dark:border-purple-800">
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Puan Ortalaması</p>
                        <p className="text-3xl font-bold text-purple-600 dark:text-purple-400">
                            {selectedPersonnelData.ratingCount > 0 ? `${selectedPersonnelData.averageRating} / 10` : 'N/A'}
                        </p>
                    </div>
                </div>

                <div>
                    <h4 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">Tamamlanan Operasyonlar</h4>
                    <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-2">
                        {selectedPersonnelData.completedTasks.length === 0 ?
                        (
                            <p className="text-gray-500 dark:text-gray-400">Bu personel için tamamlanmış operasyon bulunmamaktadır.</p>
                        ) : (
                            selectedPersonnelData.completedTasks.map(op => (
                                <div key={op.id} className="p-4 border rounded-lg dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm">
                                    <div className="flex justify-between">
                                        <p className="font-semibold dark:text-white">{op.moldName}</p>
                                        <span className="text-xs bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">{formatDate(op.finishDate)}</span>
                                    </div>
                                    <p className="text-sm text-gray-600 dark:text-gray-300">{op.taskName} - <span className="text-blue-600 dark:text-blue-400 font-medium">{op.type}</span></p>
                                    
                                    <div className="mt-3 space-y-2">
                                        {selectedPersonnelData.role === PERSONNEL_ROLES.CAM_OPERATOR && (
                                            <div className="p-2 bg-purple-50 dark:bg-purple-900/20 rounded border border-purple-100 dark:border-purple-900">
                                                <div className="flex justify-between text-xs text-purple-800 dark:text-purple-300 mb-1">
                                                    <span className="font-bold">Yetkili Puanı: {op.supervisorRating || 'N/A'} / 10</span>
                                                </div>
                                                <p className="text-xs italic text-purple-700 dark:text-purple-400">"{op.supervisorComment || 'Yorum yok'}"</p>
                                            </div>
                                        )}
                                        
                                         {selectedPersonnelData.role === PERSONNEL_ROLES.MACHINE_OPERATOR && (
                                            <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded border border-blue-100 dark:border-blue-900">
                                                <div className="flex justify-between text-xs text-blue-800 dark:text-blue-300 mb-1">
                                                    <span className="font-bold">CAM ({op.assignedOperator}) Puanı: {op.camOperatorRatingForMachineOp || 'N/A'} / 10</span>
                                                </div>
                                                <p className="text-xs italic text-blue-700 dark:text-blue-400">"{op.camOperatorCommentForMachineOp || 'Yorum yok'}"</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        );
    };
    // ----------------------------

    const MoldReportCard = () => {
        if (!selectedMoldData) return <div className="flex-1 p-10 text-center text-gray-500">Lütfen soldan bir kalıp seçiniz.</div>;
        const stats = selectedMoldData.stats;
        return (
            <div className="flex-1 space-y-6 p-2">
                <div className="flex justify-between items-start border-b dark:border-gray-700 pb-4"><div><h3 className="text-3xl font-bold text-gray-900 dark:text-white">{selectedMoldData.moldName}</h3><p className="text-lg text-gray-600 dark:text-gray-400">{selectedMoldData.customer} | {selectedMoldData.status}</p></div><div className={`text-right font-bold text-xl ${stats.deadlineColor}`}>{stats.deadlineStatus}</div></div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4"><div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800"><div className="flex items-center text-blue-600 dark:text-blue-400 mb-2"><Calendar className="w-5 h-5 mr-2" /> <span className="font-semibold">Toplam Süre</span></div><p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.totalDurationDays} Gün</p><p className="text-xs text-gray-500 dark:text-gray-400">İlk işlemden teslime</p></div><div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-200 dark:border-green-800"><div className="flex items-center text-green-600 dark:text-green-400 mb-2"><Clock className="w-5 h-5 mr-2" /> <span className="font-semibold">İşçilik Saati</span></div><p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.totalManHours} Saat</p><p className="text-xs text-gray-500 dark:text-gray-400">Toplam makine/insan saati</p></div><div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-xl border border-purple-200 dark:border-purple-800"><div className="flex items-center text-purple-600 dark:text-purple-400 mb-2"><CheckCircle className="w-5 h-5 mr-2" /> <span className="font-semibold">Kalite Skoru</span></div><p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.averageQuality} / 10</p><p className="text-xs text-gray-500 dark:text-gray-400">Yetkili puan ortalaması</p></div><div className="p-4 bg-orange-50 dark:bg-orange-900/20 rounded-xl border border-orange-200 dark:border-orange-800"><div className="flex items-center text-orange-600 dark:text-orange-400 mb-2"><Box className="w-5 h-5 mr-2" /> <span className="font-semibold">Operasyonlar</span></div><p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.completedOpsCount} / {stats.totalOps}</p><p className="text-xs text-gray-500 dark:text-gray-400">Tamamlanan / Toplam</p></div></div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6"><div className="p-5 border rounded-xl dark:border-gray-700 bg-gray-50 dark:bg-gray-800"><h4 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center"><BarChart2 className="w-5 h-5 mr-2" /> Operasyon Adetleri</h4><div className="space-y-3">{Object.entries(stats.opDistribution).map(([type, count]) => (<div key={type} className="flex justify-between items-center"><span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate w-1/3">{type}</span><div className="flex items-center w-2/3"><div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700 mr-2"><div className="bg-blue-600 h-2.5 rounded-full" style={{ width: `${(count / stats.totalOps) * 100}%` }}></div></div><span className="text-sm font-bold text-gray-900 dark:text-white w-8 text-right">{count}</span></div></div>))}</div></div><div className="p-5 border rounded-xl dark:border-gray-700 bg-gray-50 dark:bg-gray-800"><h4 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center"><PieChart className="w-5 h-5 mr-2" /> Operasyon Süreleri (Saat)</h4><div className="space-y-3">{Object.keys(stats.opHourDistribution).length === 0 ? (<p className="text-gray-500 text-sm">Henüz tamamlanmış işlem süresi yok.</p>) : (Object.entries(stats.opHourDistribution).map(([type, hours]) => (<div key={type} className="flex justify-between items-center"><span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate w-1/3">{type}</span><div className="flex items-center w-2/3"><div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700 mr-2"><div className="bg-green-600 h-2.5 rounded-full" style={{ width: `${(hours / (parseFloat(stats.totalManHours) || 1)) * 100}%` }}></div></div><span className="text-sm font-bold text-gray-900 dark:text-white w-16 text-right">{hours.toFixed(1)} s</span></div></div>)))}</div></div><div className="p-5 border rounded-xl dark:border-gray-700 bg-gray-50 dark:bg-gray-800"><h4 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center"><Monitor className="w-5 h-5 mr-2" /> Tezgah/İstasyon Kullanımı (Saat)</h4><div className="space-y-3">{Object.keys(stats.machineHourDistribution).length === 0 ? (<p className="text-gray-500 text-sm">Henüz makine verisi yok.</p>) : (Object.entries(stats.machineHourDistribution).map(([machine, hours]) => (<div key={machine} className="flex justify-between items-center"><span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate w-1/3">{machine}</span><div className="flex items-center w-2/3"><div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700 mr-2"><div className="bg-orange-500 h-2.5 rounded-full" style={{ width: `${(hours / (parseFloat(stats.totalManHours) || 1)) * 100}%` }}></div></div><span className="text-sm font-bold text-gray-900 dark:text-white w-16 text-right">{hours.toFixed(1)} s</span></div></div>)))}</div></div><div className="p-5 border rounded-xl dark:border-gray-700 bg-gray-50 dark:bg-gray-800"><h4 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center"><AlertTriangle className="w-5 h-5 mr-2" /> Kritik Bilgiler</h4><ul className="space-y-2 text-sm text-gray-600 dark:text-gray-300"><li>• <strong>Başlangıç:</strong> {stats.firstStartDate ? formatDate(stats.firstStartDate) : 'Henüz başlamadı'}</li><li>• <strong>Bitiş (Son İşlem):</strong> {stats.lastFinishDate ? formatDate(stats.lastFinishDate) : 'Devam ediyor'}</li><li>• <strong>Hedeflenen Termin:</strong> {selectedMoldData.moldDeadline ? formatDate(selectedMoldData.moldDeadline) : 'Belirtilmemiş'}</li><li>• <strong>Proje Sorumlusu:</strong> {selectedMoldData.projectManager || 'Atanmamış'}</li><li>• <strong>Tasarım Sorumlusu:</strong> {selectedMoldData.moldDesigner || 'Atanmamış'}</li></ul></div></div></div>
        );
    };

    return (
        <div className="p-4 bg-white dark:bg-gray-800 rounded-xl shadow-xl min-h-[85vh]">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Performans ve Analiz Merkezi</h2>
            
            {/* Sekme Başlıkları */}
            <div className="flex space-x-4 border-b border-gray-200 dark:border-gray-700 mb-6 overflow-x-auto">
                <button onClick={() => { setActiveTab('general'); setSelectedId(null); }} className={`py-2 px-4 font-medium text-sm border-b-2 transition-colors whitespace-nowrap ${activeTab === 'general' ? 'border-green-500 text-green-600 dark:text-green-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'}`}><TrendingUp className="w-4 h-4 inline mr-2" /> Genel / Yıllık</button>
                
                {/* YENİ: İŞ TİPİ ANALİZİ SEKMESİ */}
                <button onClick={() => { setActiveTab('work_types'); }} className={`py-2 px-4 font-medium text-sm border-b-2 transition-colors whitespace-nowrap ${activeTab === 'work_types' ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'}`}><PieChart className="w-4 h-4 inline mr-2" /> İş Tipi Dağılımı</button>
                {/* ------------------------------- */}

                <button onClick={() => { setActiveTab('timeline'); setSelectedTimelineMoldId(''); }} className={`py-2 px-4 font-medium text-sm border-b-2 transition-colors whitespace-nowrap ${activeTab === 'timeline' ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'}`}><Activity className="w-4 h-4 inline mr-2" /> Zaman Çizelgesi</button>
                <button onClick={() => { setActiveTab('production_logs'); }} className={`py-2 px-4 font-medium text-sm border-b-2 transition-colors whitespace-nowrap ${activeTab === 'production_logs' ? 'border-orange-500 text-orange-600 dark:text-orange-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'}`}><ClipboardList className="w-4 h-4 inline mr-2" /> Üretim Logları</button>
                <button onClick={() => { setActiveTab('personnel'); setSelectedId(null); }} className={`py-2 px-4 font-medium text-sm border-b-2 transition-colors whitespace-nowrap ${activeTab === 'personnel' ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'}`}><Users className="w-4 h-4 inline mr-2" /> Personel</button>
                <button onClick={() => { setActiveTab('mold'); setSelectedId(null); }} className={`py-2 px-4 font-medium text-sm border-b-2 transition-colors whitespace-nowrap ${activeTab === 'mold' ? 'border-purple-500 text-purple-600 dark:text-purple-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'}`}><Box className="w-4 h-4 inline mr-2" /> Kalıp Karnesi</button>
                {canViewReworkTab && (
                    <button onClick={() => { setActiveTab('rework'); }} className={`py-2 px-4 font-medium text-sm border-b-2 transition-colors whitespace-nowrap ${activeTab === 'rework' ? 'border-red-500 text-red-600 dark:text-red-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'}`}><History className="w-4 h-4 inline mr-2" /> Hata & Kalite</button>
                )}
            </div>

            {/* İÇERİK RENDER */}
            {activeTab === 'general' ? <GeneralAnalysisCard /> :
             activeTab === 'work_types' ? <WorkTypeAnalysisCard /> : // <-- YENİ EKLENDİ
             activeTab === 'timeline' ? <TimelineCard /> :
             activeTab === 'production_logs' ? <ProductionLogsCard /> :
             activeTab === 'rework' ? <ReworkAnalysisCard /> : (
                <div className="flex flex-col lg:flex-row gap-6 h-full">
                    {/* Sol Menü (Liste) */}
                    <SidebarList />
                    
                    {/* Sağ Taraf (İçerik) */}
                    <div className="flex-1 border rounded-lg p-4 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-inner">
                        {activeTab === 'personnel' ? <PersonnelReportCard /> : <MoldReportCard />}
                    </div>
                </div>
            )}
        </div>
    );
};

export default AnalysisPage;