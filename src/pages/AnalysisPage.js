// src/pages/AnalysisPage.js

import React, { useState, useMemo } from 'react';

// İkonlar
import { Search } from 'lucide-react';

// Sabitler ('.js' uzantısı eklendi)
import { OPERATION_STATUS, PERSONNEL_ROLES } from '../config/constants.js';

// Yardımcı Fonksiyonlar ('.js' uzantısı eklendi)
import { formatDate } from '../utils/dateUtils.js';


// --- GÜNCELLENMİŞ: ANALİZ SAYFASI ---
const AnalysisPage = ({ projects, personnel }) => {
    
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedPersonnelId, setSelectedPersonnelId] = useState(null);

    // GÜNCELLEME: Tüm tamamlanmış *operasyonları* al
    const allCompletedOperations = useMemo(() => {
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
        );
    }, [projects]);

    const filteredPersonnel = useMemo(() => {
        const lowerSearchTerm = searchTerm.toLowerCase();
        return personnel.filter(p => 
            p.name.toLowerCase().includes(lowerSearchTerm) ||
            p.role.toLowerCase().includes(lowerSearchTerm)
        ).sort((a, b) => a.name.localeCompare(b.name));
    }, [personnel, searchTerm]);

    // GÜNCELLEME: Operasyonlara göre veri bul
    const selectedPersonnelData = useMemo(() => {
        if (!selectedPersonnelId) return null;
        
        const person = personnel.find(p => p.id === selectedPersonnelId);
        if (!person) return null;

        let relevantTasks = []; 
        let averageRating = 0;
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
        
        if (ratingCount > 0) {
            averageRating = (totalRatings / ratingCount).toFixed(1);
        }

        return {
            ...person,
            completedTasks: relevantTasks.sort((a, b) => new Date(b.finishDate) - new Date(a.finishDate)),
            averageRating: averageRating,
            ratingCount: ratingCount
        };
    }, [selectedPersonnelId, personnel, allCompletedOperations]);


    // --- Bileşenler ---

    // 1. Sol Taraf: Arama ve Personel Listesi
    const PersonnelSidebar = () => (
        <div className="w-full lg:w-1/3 xl:w-1/4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg shadow-inner">
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Personel Listesi</h3>
            <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                    type="text"
                    placeholder="Personel ara..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
            </div>
            <div className="max-h-[60vh] overflow-y-auto">
                <div className="divide-y divide-gray-200 dark:divide-gray-700">
                    {filteredPersonnel.length === 0 ?
                    (
                        <p className="p-4 text-sm text-center text-gray-500 dark:text-gray-400">Personel bulunamadı.</p>
                    ) : (
                        filteredPersonnel.map(person => (
                            <button
                                key={person.id}
                                onClick={() => setSelectedPersonnelId(person.id)}
                                className={`w-full text-left p-3 transition ${
                                    selectedPersonnelId === person.id 
                                        ? 'bg-blue-600 text-white rounded-lg' 
                                        : 'hover:bg-gray-200 dark:hover:bg-gray-700'
                                }`}
                            >
                                <p className="font-medium">{person.name}</p>
                                <p className={`text-sm ${selectedPersonnelId === person.id ? 'text-blue-200' : 'text-gray-500 dark:text-gray-400'}`}>
                                    {person.role}
                                </p>
                            </button>
                        ))
                    )}
                </div>
            </div>
        </div>
    );

    // 2. Sağ Taraf (Varsayılan): Genel Bakış Dashboard'u (GÜNCELLENDİ)
    const DashboardContent = () => {
        const dashboardData = useMemo(() => {
            const camOperatorData = {};
            const machineOperatorData = {};
            const monthlyCamData = {};
            
            const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

            allCompletedOperations.forEach(op => {
                const camOp = op.assignedOperator;
                const machineOp = op.machineOperatorName;

                // 1. Yetkili -> CAM Puanları
                if (camOp && camOp !== 'SEÇ' && op.supervisorRating) {
                    if (!camOperatorData[camOp]) {
                        camOperatorData[camOp] = { total: 0, count: 0 };
                    }
                    camOperatorData[camOp].total += op.supervisorRating;
                    camOperatorData[camOp].count++;
                }

                // 2. CAM -> Tezgah Puanları
                if (machineOp && machineOp !== 'SEÇ' && op.camOperatorRatingForMachineOp) {
                     if (!machineOperatorData[machineOp]) {
                        machineOperatorData[machineOp] = { total: 0, count: 0 };
                    }
                    machineOperatorData[machineOp].total += op.camOperatorRatingForMachineOp;
                    machineOperatorData[machineOp].count++;
                }
                
                // 3. Aylık CAM Grafiği
                const finishDate = new Date(op.finishDate);
                if (camOp && camOp !== 'SEÇ' && finishDate >= thirtyDaysAgo) {
                    if (!monthlyCamData[camOp]) {
                        monthlyCamData[camOp] = 0;
                    }
                    monthlyCamData[camOp]++;
                }
            });
            
            const formatData = (data) => Object.fromEntries(
                Object.entries(data).map(([key, val]) => [key, (val.total / val.count).toFixed(1)])
            );
            
            return {
                camAverages: formatData(camOperatorData),
                machineOpAverages: formatData(machineOperatorData),
                monthlyCamCounts: monthlyCamData
            };
        }, [allCompletedOperations]);
        
        const maxMonthlyCount = Math.max(0, ...Object.values(dashboardData.monthlyCamCounts));

        return (
            <div className="space-y-6">
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white">Performans Genel Bakış</h3>
                
                <div className="p-4 border rounded-lg dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
                    <h4 className="text-lg font-semibold dark:text-white mb-3">Son 30 Günde Biten Operasyon Sayısı (CAM Operatörleri)</h4>
                    <div className="space-y-2">
                        {Object.keys(dashboardData.monthlyCamCounts).length === 0 ? (
                            <p className="text-sm text-gray-500 dark:text-gray-400">Son 30 günde tamamlanan operasyon yok.</p>
                        ) : (
                            Object.entries(dashboardData.monthlyCamCounts)
                                .sort((a, b) => b[1] - a[1])
                                .map(([operator, count]) => (
                                <div key={operator}>
                                    <div className="flex justify-between text-sm font-medium dark:text-gray-300 mb-1">
                                        <span>{operator}</span>
                                        <span>{count} operasyon</span>
                                    </div>
                                    <div className="w-full bg-gray-200 rounded-full h-4 dark:bg-gray-600">
                                        <div 
                                            className="bg-blue-600 h-4 rounded-full text-xs font-bold text-white text-center" 
                                            style={{ width: `${(count / (maxMonthlyCount || 1)) * 100}%` }}
                                        >
                                            {count}
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="p-4 border rounded-lg dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
                        <h4 className="text-lg font-semibold dark:text-white mb-3">Tezgah Operatörü Puan Ortalamaları (CAM Puanlarına Göre)</h4>
                        <div className="space-y-2">
                            {Object.keys(dashboardData.machineOpAverages).length === 0 ?
                            (
                                <p className="text-sm text-gray-500 dark:text-gray-400">Puanlanmış tezgah operatörü işi yok.</p>
                            ) : (
                                Object.entries(dashboardData.machineOpAverages).map(([operator, avg]) => (
                                    <div key={operator} className="flex justify-between items-center">
                                        <span className="font-medium dark:text-gray-300">{operator}</span>
                                        <span className="font-bold text-lg text-blue-600 dark:text-blue-400">{avg} / 10</span>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                    
                    <div className="p-4 border rounded-lg dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
                        <h4 className="text-lg font-semibold dark:text-white mb-3">CAM Operatörü Puan Ortalamaları (Yetkili Puanlarına Göre)</h4>
                        <div className="space-y-2">
                            {Object.keys(dashboardData.camAverages).length === 0 ?
                            (
                                <p className="text-sm text-gray-500 dark:text-gray-400">Puanlanmış CAM operatörü işi yok.</p>
                            ) : (
                                Object.entries(dashboardData.camAverages).map(([operator, avg]) => (
                                    <div key={operator} className="flex justify-between items-center">
                                        <span className="font-medium dark:text-gray-300">{operator}</span>
                                        <span className="font-bold text-lg text-purple-600 dark:text-purple-400">{avg} / 10</span>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    // 3. Sağ Taraf (Seçim Var): Detaylı Performans Raporu (GÜNCELLENDİ)
    const ReportContent = () => (
        <div className="space-y-6">
            <div className="flex justify-between items-start">
                <div>
                    <h3 className="text-2xl font-bold text-gray-900 dark:text-white">Performans Raporu: {selectedPersonnelData.name}</h3>
                    <p className="text-lg text-gray-600 dark:text-gray-400">{selectedPersonnelData.role}</p>
                </div>
                 <button 
                    onClick={() => setSelectedPersonnelId(null)}
                    className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                >
                    &larr; Genel Bakışa Dön
                </button>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-gray-100 dark:bg-gray-700 rounded-lg">
                    <p className="text-sm text-gray-600 dark:text-gray-400">Toplam Tamamlanan Operasyon</p>
                    <p className="text-3xl font-bold text-gray-900 dark:text-white">{selectedPersonnelData.completedTasks.length}</p>
                </div>
                <div className="p-4 bg-gray-100 dark:bg-gray-700 rounded-lg">
                    <p className="text-sm text-gray-600 dark:text-gray-400">Puan Ortalaması</p>
                    <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                        {selectedPersonnelData.ratingCount > 0 ?
                        `${selectedPersonnelData.averageRating} / 10` : 'N/A'}
                    </p>
                </div>
            </div>

            <div>
                <h4 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">Tamamlanan Operasyon Dökümü ve Yorumlar</h4>
                <div className="space-y-4 max-h-[50vh] overflow-y-auto">
                    {selectedPersonnelData.completedTasks.length === 0 ?
                    (
                        <p className="text-gray-500 dark:text-gray-400">Bu personel için tamamlanmış operasyon bulunmamaktadır.</p>
                    ) : (
                        selectedPersonnelData.completedTasks.map(op => (
                            <div key={op.id} className="p-4 border rounded-lg dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
                                <p className="font-semibold dark:text-white">{op.moldName} - {op.taskName}</p>
                                <p className="font-medium text-blue-600 dark:text-blue-400">{op.type}</p>
                                <p className="text-xs text-gray-500 dark:text-gray-400">Bitiş Tarihi: {formatDate(op.finishDate)}</p>
                                
                                <div className="mt-3 space-y-2">
                                    {selectedPersonnelData.role === PERSONNEL_ROLES.CAM_OPERATOR && (
                                        <div className="p-2 bg-purple-100 dark:bg-purple-900/20 rounded-md">
                                            <p className="text-xs font-semibold text-purple-800 dark:text-purple-300">Yetkili Değerlendirmesi:</p>
                                            <p className="text-sm font-bold text-purple-700 dark:text-purple-300">Puan: {op.supervisorRating || 'N/A'} / 10</p>
                                            <p className="text-sm text-purple-700 dark:text-purple-300 italic">Yorum: "{op.supervisorComment || 'Yorum yok'}"</p>
                                        </div>
                                    )}
                                    
                                     {selectedPersonnelData.role === PERSONNEL_ROLES.MACHINE_OPERATOR && (
                                        <div className="p-2 bg-blue-100 dark:bg-blue-900/20 rounded-md">
                                            <p className="text-xs font-semibold text-blue-800 dark:text-blue-300">CAM Değerlendirmesi ({op.assignedOperator}):</p>
                                            <p className="text-sm font-bold text-blue-700 dark:text-blue-300">Puan: {op.camOperatorRatingForMachineOp || 'N/A'} / 10</p>
                                            <p className="text-sm text-blue-700 dark:text-blue-300 italic">Yorum: "{op.camOperatorCommentForMachineOp || 'Yorum yok'}"</p>
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

    return (
        <div className="p-4 bg-white dark:bg-gray-800 rounded-xl shadow-xl">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Performans Merkezi</h2>
            
            <div className="flex flex-col lg:flex-row gap-6">
                <PersonnelSidebar />
                <div className="flex-1">
                    {selectedPersonnelId ? <ReportContent /> : <DashboardContent />}
                </div>
            </div>
        </div>
    );
};
// --- GÜNCELLENMİŞ ANALİZ SAYFASI SONU ---

export default AnalysisPage;