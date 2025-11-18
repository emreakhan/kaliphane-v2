// src/pages/AnalysisPage.js

import React, { useState, useMemo } from 'react';

// İkonlar
import { Search, Users, Box, Calendar, Clock, CheckCircle, AlertTriangle, BarChart2, PieChart, Monitor, TrendingUp, CalendarDays } from 'lucide-react';

// Sabitler
import { OPERATION_STATUS, PERSONNEL_ROLES, MOLD_STATUS } from '../config/constants.js';

// Yardımcı Fonksiyonlar
import { formatDate } from '../utils/dateUtils.js';


// --- GÜNCELLENMİŞ: ANALİZ SAYFASI (V2.3.0 - Yıllık Analiz Eklendi) ---
const AnalysisPage = ({ projects, personnel }) => {
    
    const [activeTab, setActiveTab] = useState('general'); // Varsayılan olarak 'general' olsun
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedId, setSelectedId] = useState(null); 
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear()); // Yıllık analiz için

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

    // --- MEVCUT YILLARI HESAPLA ---
    const availableYears = useMemo(() => {
        const years = new Set();
        years.add(new Date().getFullYear()); // Mevcut yılı her zaman ekle
        
        allCompletedOperations.forEach(op => {
            if (op.finishDate) {
                years.add(new Date(op.finishDate).getFullYear());
            }
        });
        
        return Array.from(years).sort((a, b) => b - a); // Yeniden eskiye sırala
    }, [allCompletedOperations]);


    // --- 1. SEKME: GENEL / YILLIK ANALİZ MANTIĞI (YENİ) ---
    const yearlyStats = useMemo(() => {
        // Seçilen yıla ait operasyonları filtrele
        const operationsInYear = allCompletedOperations.filter(op => 
            op.finishDate && new Date(op.finishDate).getFullYear() === parseInt(selectedYear)
        );

        // 1. Toplam Efor (Saat)
        const totalHours = operationsInYear.reduce((acc, op) => acc + (parseFloat(op.durationInHours) || 0), 0);

        // 2. Tamamlanan Kalıp Sayısı (O yıl içinde son işlemi bitenler)
        // Not: Basitlik için o yıl içinde "TAMAMLANDI" statüsüne geçenleri sayıyoruz.
        const completedMoldsInYear = projects.filter(p => {
            if (p.status !== MOLD_STATUS.COMPLETED) return false;
            // Kalıbın son biten işine bak
            const allOps = p.tasks.flatMap(t => t.operations);
            const lastOpDate = allOps
                .filter(op => op.finishDate)
                .map(op => new Date(op.finishDate))
                .sort((a, b) => b - a)[0]; // En son tarih
            
            return lastOpDate && lastOpDate.getFullYear() === parseInt(selectedYear);
        }).length;

        // 3. Aylık Dağılım (Operasyon Sayısı ve Saat)
        const monthlyData = Array(12).fill(0).map(() => ({ ops: 0, hours: 0 }));
        
        operationsInYear.forEach(op => {
            const month = new Date(op.finishDate).getMonth(); // 0-11
            monthlyData[month].ops += 1;
            monthlyData[month].hours += (parseFloat(op.durationInHours) || 0);
        });

        // En yoğun ayı bul (Grafik ölçekleme için)
        const maxMonthlyOps = Math.max(...monthlyData.map(d => d.ops), 1);

        return {
            totalOps: operationsInYear.length,
            totalHours: totalHours.toFixed(0),
            completedMolds: completedMoldsInYear,
            monthlyData,
            maxMonthlyOps
        };
    }, [allCompletedOperations, projects, selectedYear]);


    // --- 2. SEKME: PERSONEL ANALİZİ MANTIĞI ---
    const filteredPersonnel = useMemo(() => {
        const lowerSearchTerm = searchTerm.toLowerCase();
        return personnel.filter(p => 
            p.name.toLowerCase().includes(lowerSearchTerm) ||
            p.role.toLowerCase().includes(lowerSearchTerm)
        ).sort((a, b) => a.name.localeCompare(b.name));
    }, [personnel, searchTerm]);

    const selectedPersonnelData = useMemo(() => {
        if (activeTab !== 'personnel' || !selectedId) return null;
        
        const person = personnel.find(p => p.id === selectedId);
        if (!person) return null;

        let relevantTasks = []; 
        let totalRatings = 0;
        let ratingCount = 0;
        
        if (person.role === PERSONNEL_ROLES.CAM_OPERATOR || person.role === PERSONNEL_ROLES.SUPERVISOR || person.role === PERSONNEL_ROLES.ADMIN) {
            relevantTasks = allCompletedOperations.filter(op => op.assignedOperator === person.name);
            relevantTasks.forEach(op => {
                if (op.supervisorRating) {
                    totalRatings += op.supervisorRating;
                    ratingCount++;
                }
            });
        } else if (person.role === PERSONNEL_ROLES.MACHINE_OPERATOR) {
            relevantTasks = allCompletedOperations.filter(op => op.machineOperatorName === person.name);
            relevantTasks.forEach(op => {
                if (op.camOperatorRatingForMachineOp) {
                    totalRatings += op.camOperatorRatingForMachineOp;
                    ratingCount++;
                }
            });
        }
        
        const averageRating = ratingCount > 0 ? (totalRatings / ratingCount).toFixed(1) : 0;

        return {
            ...person,
            completedTasks: relevantTasks.sort((a, b) => new Date(b.finishDate) - new Date(a.finishDate)),
            averageRating,
            ratingCount
        };
    }, [selectedId, personnel, allCompletedOperations, activeTab]);


    // --- 3. SEKME: KALIP KARNESİ MANTIĞI ---
    const filteredMolds = useMemo(() => {
        const lowerSearchTerm = searchTerm.toLowerCase();
        return projects.filter(p => 
            p.moldName.toLowerCase().includes(lowerSearchTerm) ||
            p.customer.toLowerCase().includes(lowerSearchTerm)
        ).sort((a, b) => a.moldName.localeCompare(b.moldName));
    }, [projects, searchTerm]);

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
        if (firstStartDate && lastFinishDate) {
            totalDurationDays = Math.ceil((lastFinishDate - firstStartDate) / (1000 * 60 * 60 * 24));
        }

        const totalManHours = completedOps.reduce((acc, op) => acc + (parseFloat(op.durationInHours) || 0), 0);

        let totalQuality = 0;
        let qualityCount = 0;
        completedOps.forEach(op => {
            if(op.supervisorRating) {
                totalQuality += op.supervisorRating;
                qualityCount++;
            }
        });
        const averageQuality = qualityCount > 0 ? (totalQuality / qualityCount).toFixed(1) : "---";

        let deadlineStatus = "Belirsiz";
        let deadlineColor = "text-gray-500";
        if (mold.moldDeadline && lastFinishDate) {
            const deadline = new Date(mold.moldDeadline);
            const diffTime = deadline - lastFinishDate;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
            
            if (diffDays >= 0) {
                deadlineStatus = `${diffDays} Gün Erken Bitti`;
                deadlineColor = "text-green-600";
            } else {
                deadlineStatus = `${Math.abs(diffDays)} Gün Gecikti`;
                deadlineColor = "text-red-600";
            }
        } else if (mold.moldDeadline) {
             deadlineStatus = "Devam Ediyor";
             deadlineColor = "text-blue-600";
        }

        const opDistribution = {};
        allOps.forEach(op => {
            opDistribution[op.type] = (opDistribution[op.type] || 0) + 1;
        });

        const opHourDistribution = {};
        completedOps.forEach(op => {
            const duration = parseFloat(op.durationInHours) || 0;
            opHourDistribution[op.type] = (opHourDistribution[op.type] || 0) + duration;
        });

        const machineHourDistribution = {};
        completedOps.forEach(op => {
            const duration = parseFloat(op.durationInHours) || 0;
            const machineName = op.machineName && op.machineName !== 'SEÇ' ? op.machineName : 'Tezgahsız / Diğer';
            machineHourDistribution[machineName] = (machineHourDistribution[machineName] || 0) + duration;
        });

        return {
            ...mold,
            stats: {
                firstStartDate,
                lastFinishDate,
                totalDurationDays,
                totalManHours: totalManHours.toFixed(1),
                averageQuality,
                deadlineStatus,
                deadlineColor,
                totalOps: allOps.length,
                completedOpsCount: completedOps.length,
                opDistribution,
                opHourDistribution,
                machineHourDistribution
            }
        };
    }, [selectedId, projects, activeTab]);


    // --- ARAYÜZ BİLEŞENLERİ ---

    // 1. Genel Analiz Kartı (YENİ)
    const GeneralAnalysisCard = () => {
        const months = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
        
        return (
            <div className="space-y-8 animate-fadeIn">
                {/* Üst Başlık ve Yıl Seçimi */}
                <div className="flex flex-col md:flex-row justify-between items-center bg-white dark:bg-gray-800 p-6 rounded-xl border border-gray-200 dark:border-gray-700">
                    <div>
                        <h3 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center">
                            <TrendingUp className="w-6 h-6 mr-2 text-blue-600" />
                            Yıllık Faaliyet Raporu
                        </h3>
                        <p className="text-gray-500 dark:text-gray-400 mt-1">
                            Şirketin genel performans ve üretim verileri
                        </p>
                    </div>
                    <div className="mt-4 md:mt-0 flex items-center">
                        <CalendarDays className="w-5 h-5 mr-2 text-gray-500 dark:text-gray-300" />
                        <select 
                            value={selectedYear}
                            onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                            className="bg-gray-50 border border-gray-300 text-gray-900 text-lg rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-32 p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                        >
                            {availableYears.map(year => (
                                <option key={year} value={year}>{year}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* KPI Kartları */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="p-6 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-lg transform hover:-translate-y-1 transition duration-300">
                        <div className="flex justify-between items-start">
                            <div>
                                <p className="text-blue-100 text-sm font-medium mb-1">Toplam Tamamlanan Kalıp</p>
                                <h4 className="text-4xl font-bold">{yearlyStats.completedMolds}</h4>
                            </div>
                            <Box className="w-8 h-8 text-blue-200 opacity-80" />
                        </div>
                        <p className="mt-4 text-sm text-blue-100 opacity-80">{selectedYear} yılında teslim edilen</p>
                    </div>

                    <div className="p-6 rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 text-white shadow-lg transform hover:-translate-y-1 transition duration-300">
                        <div className="flex justify-between items-start">
                            <div>
                                <p className="text-purple-100 text-sm font-medium mb-1">Toplam İşçilik Saati</p>
                                <h4 className="text-4xl font-bold">{yearlyStats.totalHours}</h4>
                            </div>
                            <Clock className="w-8 h-8 text-purple-200 opacity-80" />
                        </div>
                        <p className="mt-4 text-sm text-purple-100 opacity-80">Tüm tezgahlarda harcanan efor</p>
                    </div>

                    <div className="p-6 rounded-xl bg-gradient-to-br from-green-500 to-green-600 text-white shadow-lg transform hover:-translate-y-1 transition duration-300">
                        <div className="flex justify-between items-start">
                            <div>
                                <p className="text-green-100 text-sm font-medium mb-1">Tamamlanan Operasyon</p>
                                <h4 className="text-4xl font-bold">{yearlyStats.totalOps}</h4>
                            </div>
                            <CheckCircle className="w-8 h-8 text-green-200 opacity-80" />
                        </div>
                        <p className="mt-4 text-sm text-green-100 opacity-80">Bitirilen alt işlem adedi</p>
                    </div>
                </div>

                {/* Aylık Grafik */}
                <div className="bg-white dark:bg-gray-800 p-6 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
                    <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-6 flex items-center">
                        <BarChart2 className="w-5 h-5 mr-2" />
                        Aylık Üretim Yoğunluğu ({selectedYear})
                    </h4>
                    
                    <div className="h-64 flex items-end space-x-2 md:space-x-4">
                        {yearlyStats.monthlyData.map((data, index) => (
                            <div key={index} className="flex-1 flex flex-col items-center group relative">
                                {/* Tooltip */}
                                <div className="absolute bottom-full mb-2 hidden group-hover:block bg-gray-900 text-white text-xs rounded py-1 px-2 z-10 whitespace-nowrap">
                                    {data.ops} Operasyon<br/>{data.hours.toFixed(0)} Saat
                                </div>
                                
                                {/* Bar */}
                                <div 
                                    className="w-full bg-blue-200 dark:bg-blue-900/40 rounded-t-sm relative transition-all duration-500 hover:bg-blue-300 dark:hover:bg-blue-800"
                                    style={{ height: `${(data.ops / yearlyStats.maxMonthlyOps) * 100}%`, minHeight: data.ops > 0 ? '4px' : '0' }}
                                >
                                    <div 
                                        className="absolute bottom-0 left-0 right-0 bg-blue-500 dark:bg-blue-600 rounded-t-sm transition-all duration-500"
                                        style={{ height: `${(data.ops / yearlyStats.maxMonthlyOps) * 100}%` }}
                                    ></div>
                                </div>
                                
                                {/* Ay Adı */}
                                <span className="text-xs text-gray-500 dark:text-gray-400 mt-2 transform -rotate-45 md:rotate-0 origin-top-left md:origin-center">
                                    {months[index].substring(0, 3)}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    };

    // 2. Sol Menü (Liste)
    const SidebarList = () => (
        <div className="w-full lg:w-1/3 xl:w-1/4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg shadow-inner h-full min-h-[500px]">
            <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                    type="text"
                    placeholder={activeTab === 'personnel' ? "Personel ara..." : "Kalıp ara..."}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
            </div>
            <div className="max-h-[60vh] overflow-y-auto">
                <div className="divide-y divide-gray-200 dark:divide-gray-700">
                    {activeTab === 'personnel' ? (
                        filteredPersonnel.map(person => (
                            <button
                                key={person.id}
                                onClick={() => setSelectedId(person.id)}
                                className={`w-full text-left p-3 transition rounded-lg ${
                                    selectedId === person.id 
                                        ? 'bg-blue-600 text-white' 
                                        : 'hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-200'
                                }`}
                            >
                                <p className="font-medium">{person.name}</p>
                                <p className={`text-sm ${selectedId === person.id ? 'text-blue-200' : 'text-gray-500 dark:text-gray-400'}`}>
                                    {person.role}
                                </p>
                            </button>
                        ))
                    ) : (
                        filteredMolds.map(mold => (
                            <button
                                key={mold.id}
                                onClick={() => setSelectedId(mold.id)}
                                className={`w-full text-left p-3 transition rounded-lg ${
                                    selectedId === mold.id 
                                        ? 'bg-purple-600 text-white' 
                                        : 'hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-200'
                                }`}
                            >
                                <p className="font-medium">{mold.moldName}</p>
                                <p className={`text-sm ${selectedId === mold.id ? 'text-purple-200' : 'text-gray-500 dark:text-gray-400'}`}>
                                    {mold.customer}
                                </p>
                            </button>
                        ))
                    )}
                </div>
            </div>
        </div>
    );

    // 3. Kalıp Karnesi İçeriği
    const MoldReportCard = () => {
        if (!selectedMoldData) return <div className="flex-1 p-10 text-center text-gray-500">Lütfen soldan bir kalıp seçiniz.</div>;
        const stats = selectedMoldData.stats;
        return (
            <div className="flex-1 space-y-6 p-2">
                <div className="flex justify-between items-start border-b dark:border-gray-700 pb-4">
                    <div>
                        <h3 className="text-3xl font-bold text-gray-900 dark:text-white">{selectedMoldData.moldName}</h3>
                        <p className="text-lg text-gray-600 dark:text-gray-400">{selectedMoldData.customer} | {selectedMoldData.status}</p>
                    </div>
                    <div className={`text-right font-bold text-xl ${stats.deadlineColor}`}>
                        {stats.deadlineStatus}
                    </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800">
                        <div className="flex items-center text-blue-600 dark:text-blue-400 mb-2">
                            <Calendar className="w-5 h-5 mr-2" /> <span className="font-semibold">Toplam Süre</span>
                        </div>
                        <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.totalDurationDays} Gün</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">İlk işlemden teslime</p>
                    </div>
                    <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-200 dark:border-green-800">
                        <div className="flex items-center text-green-600 dark:text-green-400 mb-2">
                            <Clock className="w-5 h-5 mr-2" /> <span className="font-semibold">İşçilik Saati</span>
                        </div>
                        <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.totalManHours} Saat</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Toplam makine/insan saati</p>
                    </div>
                    <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-xl border border-purple-200 dark:border-purple-800">
                        <div className="flex items-center text-purple-600 dark:text-purple-400 mb-2">
                            <CheckCircle className="w-5 h-5 mr-2" /> <span className="font-semibold">Kalite Skoru</span>
                        </div>
                        <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.averageQuality} / 10</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Yetkili puan ortalaması</p>
                    </div>
                    <div className="p-4 bg-orange-50 dark:bg-orange-900/20 rounded-xl border border-orange-200 dark:border-orange-800">
                        <div className="flex items-center text-orange-600 dark:text-orange-400 mb-2">
                            <Box className="w-5 h-5 mr-2" /> <span className="font-semibold">Operasyonlar</span>
                        </div>
                        <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.completedOpsCount} / {stats.totalOps}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Tamamlanan / Toplam</p>
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="p-5 border rounded-xl dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                        <h4 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
                            <BarChart2 className="w-5 h-5 mr-2" /> Operasyon Adetleri
                        </h4>
                        <div className="space-y-3">
                            {Object.entries(stats.opDistribution).map(([type, count]) => (
                                <div key={type} className="flex justify-between items-center">
                                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate w-1/3">{type}</span>
                                    <div className="flex items-center w-2/3">
                                        <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700 mr-2">
                                            <div className="bg-blue-600 h-2.5 rounded-full" style={{ width: `${(count / stats.totalOps) * 100}%` }}></div>
                                        </div>
                                        <span className="text-sm font-bold text-gray-900 dark:text-white w-8 text-right">{count}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="p-5 border rounded-xl dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                        <h4 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
                            <PieChart className="w-5 h-5 mr-2" /> Operasyon Süreleri (Saat)
                        </h4>
                        <div className="space-y-3">
                            {Object.keys(stats.opHourDistribution).length === 0 ? (
                                <p className="text-gray-500 text-sm">Henüz tamamlanmış işlem süresi yok.</p>
                            ) : (
                                Object.entries(stats.opHourDistribution).map(([type, hours]) => (
                                    <div key={type} className="flex justify-between items-center">
                                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate w-1/3">{type}</span>
                                        <div className="flex items-center w-2/3">
                                            <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700 mr-2">
                                                <div className="bg-green-600 h-2.5 rounded-full" style={{ width: `${(hours / (parseFloat(stats.totalManHours) || 1)) * 100}%` }}></div>
                                            </div>
                                            <span className="text-sm font-bold text-gray-900 dark:text-white w-16 text-right">{hours.toFixed(1)} s</span>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                    <div className="p-5 border rounded-xl dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                        <h4 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
                            <Monitor className="w-5 h-5 mr-2" /> Tezgah/İstasyon Kullanımı (Saat)
                        </h4>
                        <div className="space-y-3">
                            {Object.keys(stats.machineHourDistribution).length === 0 ? (
                                <p className="text-gray-500 text-sm">Henüz makine verisi yok.</p>
                            ) : (
                                Object.entries(stats.machineHourDistribution).map(([machine, hours]) => (
                                    <div key={machine} className="flex justify-between items-center">
                                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate w-1/3">{machine}</span>
                                        <div className="flex items-center w-2/3">
                                            <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700 mr-2">
                                                <div className="bg-orange-500 h-2.5 rounded-full" style={{ width: `${(hours / (parseFloat(stats.totalManHours) || 1)) * 100}%` }}></div>
                                            </div>
                                            <span className="text-sm font-bold text-gray-900 dark:text-white w-16 text-right">{hours.toFixed(1)} s</span>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                    <div className="p-5 border rounded-xl dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                        <h4 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
                            <AlertTriangle className="w-5 h-5 mr-2" /> Kritik Bilgiler
                        </h4>
                        <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-300">
                            <li>• <strong>Başlangıç:</strong> {stats.firstStartDate ? formatDate(stats.firstStartDate) : 'Henüz başlamadı'}</li>
                            <li>• <strong>Bitiş (Son İşlem):</strong> {stats.lastFinishDate ? formatDate(stats.lastFinishDate) : 'Devam ediyor'}</li>
                            <li>• <strong>Hedeflenen Termin:</strong> {selectedMoldData.moldDeadline ? formatDate(selectedMoldData.moldDeadline) : 'Belirtilmemiş'}</li>
                            <li>• <strong>Proje Sorumlusu:</strong> {selectedMoldData.projectManager || 'Atanmamış'}</li>
                            <li>• <strong>Tasarım Sorumlusu:</strong> {selectedMoldData.moldDesigner || 'Atanmamış'}</li>
                        </ul>
                    </div>
                </div>
            </div>
        );
    };

    // 4. Personel Raporu İçeriği
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

    return (
        <div className="p-4 bg-white dark:bg-gray-800 rounded-xl shadow-xl min-h-[85vh]">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Performans ve Analiz Merkezi</h2>
            
            {/* Sekme Başlıkları */}
            <div className="flex space-x-4 border-b border-gray-200 dark:border-gray-700 mb-6 overflow-x-auto">
                <button
                    onClick={() => { setActiveTab('general'); setSelectedId(null); setSearchTerm(''); }}
                    className={`py-2 px-4 font-medium text-sm border-b-2 transition-colors whitespace-nowrap ${
                        activeTab === 'general'
                            ? 'border-green-500 text-green-600 dark:text-green-400'
                            : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                    }`}
                >
                    <TrendingUp className="w-4 h-4 inline mr-2" />
                    Genel / Yıllık Analiz
                </button>
                <button
                    onClick={() => { setActiveTab('personnel'); setSelectedId(null); setSearchTerm(''); }}
                    className={`py-2 px-4 font-medium text-sm border-b-2 transition-colors whitespace-nowrap ${
                        activeTab === 'personnel'
                            ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                            : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                    }`}
                >
                    <Users className="w-4 h-4 inline mr-2" />
                    Personel Analizi
                </button>
                <button
                    onClick={() => { setActiveTab('mold'); setSelectedId(null); setSearchTerm(''); }}
                    className={`py-2 px-4 font-medium text-sm border-b-2 transition-colors whitespace-nowrap ${
                        activeTab === 'mold'
                            ? 'border-purple-500 text-purple-600 dark:text-purple-400'
                            : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                    }`}
                >
                    <Box className="w-4 h-4 inline mr-2" />
                    Kalıp Karnesi
                </button>
            </div>

            {activeTab === 'general' ? (
                <GeneralAnalysisCard />
            ) : (
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