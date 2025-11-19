// src/pages/ActiveTasksPage.js

import React, { useState, useMemo, useEffect } from 'react';
import { Responsive, WidthProvider } from 'react-grid-layout'; // Harita için
import { doc, onSnapshot } from 'firebase/firestore'; // Veritabanı dinleme
import { db } from '../config/firebase';

// İkonlar
import { Users, Cpu, AlertTriangle, Map as MapIcon, List as ListIcon, Activity, Clock, Wrench, AlertOctagon } from 'lucide-react'; // Wrench eklendi

// Sabitler
import { OPERATION_STATUS, ROLES, PERSONNEL_ROLES, MACHINE_STATUS } from '../config/constants.js'; // MACHINE_STATUS eklendi

// Yardımcı Fonksiyonlar
import { formatDate } from '../utils/dateUtils';
import MachineStatusModal from '../components/Modals/MachineStatusModal'; // Modal import edildi

const ResponsiveGridLayout = WidthProvider(Responsive);

const ActiveTasksPage = ({ projects, machines, loggedInUser, personnel, handleUpdateMachineStatus }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [viewMode, setViewMode] = useState('list'); 
    const [savedLayout, setSavedLayout] = useState([]); 
    const [isLayoutLoaded, setIsLayoutLoaded] = useState(false);
    
    // Modal State
    const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
    const [selectedMachine, setSelectedMachine] = useState(null);

    // Harita verisini veritabanından çekme
    useEffect(() => {
        if (viewMode === 'map') {
            const docRef = doc(db, 'workshop_settings', 'layout');
            const unsubscribe = onSnapshot(docRef, (docSnap) => {
                if (docSnap.exists()) {
                    setSavedLayout(docSnap.data().layout || []);
                }
                setIsLayoutLoaded(true);
            });
            return () => unsubscribe();
        }
    }, [viewMode]);


    // Süreyi formatlayan yardımcı fonksiyon
    const formatDuration = (startDate) => {
        if (!startDate) return '---';
        const start = new Date(startDate);
        const now = new Date();
        const diffMs = now - start;
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        
        if (diffHours < 1) {
            const diffMin = Math.floor(diffMs / (1000 * 60));
            return `${diffMin} dk`;
        }
        if (diffHours < 24) return `${diffHours} sa`;
        const days = Math.floor(diffHours / 24);
        const hours = diffHours % 24;
        return `${days}g ${hours}s`;
    };

    const lowerSearchTerm = searchTerm.toLowerCase();
    
    // Çalışan İşler
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

    // --- TEZGAH DURUM HARİTASI (GÜNCELLENDİ) ---
    const machineStatusMap = useMemo(() => {
        const map = {};
        machines.forEach(machine => {
            const manualStatus = machine.currentStatus || MACHINE_STATUS.AVAILABLE;
            const manualReason = machine.statusReason || '';
            const statusTime = machine.statusStartTime || null;
            const runningTask = allRunningOperations.find(op => op.machineName === machine.name);
            
            if (manualStatus === MACHINE_STATUS.FAULT) {
                map[machine.name] = { status: 'FAULT', colorClass: 'bg-gradient-to-br from-orange-500 to-red-600 text-white animate-pulse', icon: <AlertOctagon className="w-5 h-5 animate-bounce" />, text: 'ARIZALI', detail: manualReason, time: statusTime, machineObj: machine };
            } else if (manualStatus === MACHINE_STATUS.MAINTENANCE) {
                map[machine.name] = { status: 'MAINTENANCE', colorClass: 'bg-gradient-to-br from-yellow-400 to-yellow-600 text-white', icon: <Wrench className="w-5 h-5" />, text: 'BAKIMDA', detail: manualReason, time: statusTime, machineObj: machine };
            } else if (runningTask) {
                map[machine.name] = { status: 'WORKING', colorClass: 'bg-gradient-to-br from-green-500 to-green-600 text-white animate-pulse-slow', icon: <Activity className="w-5 h-5" />, text: 'ÇALIŞIYOR', task: runningTask, time: runningTask.startDate, machineObj: machine };
            } else {
                map[machine.name] = { status: 'IDLE', colorClass: 'bg-gradient-to-br from-red-500 to-red-600 text-white', icon: <AlertTriangle className="w-4 h-4" />, text: 'BOŞTA', machineObj: machine };
            }
        });
        return map;
    }, [allRunningOperations, machines]);

    // Liste görünümü için veri
    const machineStatusList = useMemo(() => {
        return Object.entries(machineStatusMap).map(([name, status]) => ({
            machineName: name,
            statusType: status.status,
            task: status.task || null,
            detail: status.detail || '',
            startTime: status.time || null,
            isIdle: status.status === 'IDLE'
        })).sort((a, b) => a.machineName.localeCompare(b.machineName));
    }, [machineStatusMap]);

    // İş Dağılımı Listesi (Geri Getirildi)
    const canViewWorkDistribution = loggedInUser.role === ROLES.ADMIN || loggedInUser.role === ROLES.SUPERVISOR;
    const workDistribution = useMemo(() => {
        if (!canViewWorkDistribution) return [];
        const camOperators = personnel.filter(p => p.role === PERSONNEL_ROLES.CAM_OPERATOR);
        const workCounts = new Map();
        camOperators.forEach(op => { workCounts.set(op.name, 0); });
        allRunningOperations.forEach(op => {
            const operatorName = op.assignedOperator;
            if (workCounts.has(operatorName)) workCounts.set(operatorName, workCounts.get(operatorName) + 1);
        });
        const distributionList = Array.from(workCounts.entries()).map(([name, count]) => ({ name, count }));
        return distributionList.sort((a, b) => a.count - b.count);
    }, [personnel, canViewWorkDistribution, allRunningOperations]);

    // Modal Açma
    const openStatusModal = (machineName) => {
        if (loggedInUser.role === ROLES.MACHINE_OPERATOR) return; 
        const statusInfo = machineStatusMap[machineName];
        if (statusInfo && statusInfo.machineObj) {
            setSelectedMachine(statusInfo.machineObj);
            setIsStatusModalOpen(true);
        } else {
             const tempMachine = machines.find(m => m.name === machineName);
             if(tempMachine) { setSelectedMachine(tempMachine); setIsStatusModalOpen(true); }
        }
    };

    const WorkshopMap = () => {
        if (!isLayoutLoaded) return <div className="text-center p-10 text-gray-500">Harita yükleniyor...</div>;
        if (savedLayout.length === 0) return <div className="text-center p-10 text-red-500">Henüz yerleşim planı çizilmemiş. Admin panelinden düzenleyin.</div>;

        return (
            <div className="bg-gray-200 dark:bg-gray-900/30 p-6 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-700 overflow-hidden min-h-[600px] animate-fadeIn">
                <ResponsiveGridLayout
                    className="layout"
                    layouts={{ lg: savedLayout }}
                    breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
                    cols={{ lg: 24, md: 20, sm: 12, xs: 8, xxs: 4 }}
                    rowHeight={40}
                    isDraggable={false}
                    isResizable={false}
                    compactType={null}
                    margin={[10, 10]}
                >
                    {savedLayout.map((item) => {
                        const info = machineStatusMap[item.i] || { colorClass: 'bg-gray-400', text: '??' };

                        return (
                            <div 
                                key={item.i} 
                                onClick={() => openStatusModal(item.i)}
                                className={`group relative rounded-lg shadow-md border border-white/10 flex flex-col items-center justify-center transition-all duration-200 hover:z-50 hover:scale-105 cursor-pointer
                                    ${info.colorClass}`}
                            >
                                <span className="font-black text-xl tracking-wider drop-shadow-md select-none text-center p-1">
                                    {item.i}
                                </span>

                                {/* TOOLTIP */}
                                <div className="absolute opacity-0 group-hover:opacity-100 transition-opacity duration-200 bottom-full mb-2 left-1/2 transform -translate-x-1/2 z-50 w-64 pointer-events-none">
                                    <div className="bg-gray-900 text-white text-sm rounded-lg shadow-xl p-3 border border-gray-700">
                                        <div className="font-bold text-base mb-1 border-b border-gray-700 pb-1 flex justify-between"><span>{item.i}</span>{info.icon}</div>
                                        {info.status === 'WORKING' ? (
                                            <div className="space-y-1">
                                                <div className="font-semibold text-green-400">ÇALIŞIYOR</div>
                                                <div><span className="text-gray-400">Kalıp:</span> {info.task.moldName}</div>
                                                <div><span className="text-gray-400">İş:</span> {info.task.taskName}</div>
                                                <div className="text-xs text-right text-gray-500 mt-1"><Clock className="w-3 h-3 inline mr-1"/> {formatDuration(info.time)}</div>
                                            </div>
                                        ) : info.status === 'FAULT' || info.status === 'MAINTENANCE' ? (
                                            <div className="space-y-1">
                                                <div className={`font-bold ${info.status === 'FAULT' ? 'text-red-500' : 'text-yellow-500'}`}>{info.text}</div>
                                                <div className="text-gray-300 italic">"{info.detail}"</div>
                                                <div className="text-xs text-right text-gray-500 mt-1"><Clock className="w-3 h-3 inline mr-1"/> {formatDuration(info.time)}</div>
                                            </div>
                                        ) : ( <div className="text-red-400 font-semibold flex items-center"><AlertTriangle className="w-4 h-4 mr-1" /> BOŞTA</div> )}
                                        <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-8 border-transparent border-t-gray-900"></div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </ResponsiveGridLayout>
            </div>
        );
    };

    const totalActiveCount = Object.values(machineStatusMap).filter(s => s.status === 'WORKING').length;

    return (
        <div className="p-4 bg-white dark:bg-gray-800 rounded-xl shadow-xl space-y-8 min-h-[85vh]">
            {/* Başlık ve Kontroller */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4 md:mb-0">
                    Aktif İş Akışı ({totalActiveCount})
                </h2>
                <div className="flex items-center space-x-3 w-full md:w-auto">
                    <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
                        <button onClick={() => setViewMode('list')} className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all flex items-center ${viewMode === 'list' ? 'bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-300 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'}`}><ListIcon className="w-4 h-4 mr-2" /> Liste</button>
                        <button onClick={() => setViewMode('map')} className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all flex items-center ${viewMode === 'map' ? 'bg-white dark:bg-gray-600 text-purple-600 dark:text-purple-300 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'}`}><MapIcon className="w-4 h-4 mr-2" /> Harita</button>
                    </div>
                    {viewMode === 'list' && (
                        <div className="w-full md:w-64">
                            <input type="text" placeholder="Ara..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                        </div>
                    )}
                </div>
            </div>

            {/* İçerik */}
            {viewMode === 'map' ? <WorkshopMap /> : (
                <div>
                    {/* Liste Görünümü */}
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                        Tezgah Durumları ({machineStatusList.length})
                    </h3>
                     {/* --- DÜZELTİLMİŞ TABLO --- */}
                     <div className="overflow-x-auto border rounded-lg dark:border-gray-700 shadow-sm">
                        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                            <thead className="bg-gray-50 dark:bg-gray-700">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider dark:text-gray-300">Tezgah</th>
                                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider dark:text-gray-300">Durum</th>
                                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider dark:text-gray-300">İş Detayı / Açıklama</th>
                                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider dark:text-gray-300">İlerleme</th>
                                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider dark:text-gray-300">CAM Op.</th>
                                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider dark:text-gray-300">Tezgah Op.</th>
                                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider dark:text-gray-300">Başlangıç</th>
                                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider dark:text-gray-300">Geçen Süre</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200 dark:bg-gray-800 dark:divide-gray-700">
                                {machineStatusList.filter(item => {
                                    if (!searchTerm.trim()) return true;
                                    if (item.machineName.toLowerCase().includes(lowerSearchTerm)) return true;
                                    return false; 
                                }).map((item) => (
                                    <tr key={item.machineName} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition">
                                        <td className="px-4 py-4 font-bold text-gray-900 dark:text-white border-r dark:border-gray-700">{item.machineName}</td>
                                        <td className="px-4 py-4">
                                            {item.statusType === 'IDLE' && <span className="px-2 py-1 text-xs font-bold rounded-full bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">BOŞTA</span>}
                                            {item.statusType === 'WORKING' && <span className="px-2 py-1 text-xs font-bold rounded-full bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">ÇALIŞIYOR</span>}
                                            {item.statusType === 'FAULT' && <span className="px-2 py-1 text-xs font-bold rounded-full bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200 animate-pulse">ARIZALI</span>}
                                            {item.statusType === 'MAINTENANCE' && <span className="px-2 py-1 text-xs font-bold rounded-full bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">BAKIMDA</span>}
                                        </td>
                                        <td className="px-4 py-4">
                                            {item.task ? (
                                                <div>
                                                    <div className="text-sm font-bold text-gray-900 dark:text-white">{item.task.moldName}</div>
                                                    <div className="text-xs text-gray-600 dark:text-gray-400">{item.task.taskName}</div>
                                                    <div className="text-xs font-bold text-blue-600 dark:text-blue-400">{item.task.type}</div>
                                                </div>
                                            ) : (
                                                <span className="text-sm italic text-gray-500 dark:text-gray-400">{item.detail || '---'}</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-4 font-bold text-blue-600 dark:text-blue-400">
                                            {item.task ? `%${item.task.progressPercentage}` : '---'}
                                        </td>
                                        <td className="px-4 py-4 text-sm text-gray-700 dark:text-gray-300">
                                            {item.task ? item.task.assignedOperator : '---'}
                                        </td>
                                        <td className="px-4 py-4 text-sm text-gray-700 dark:text-gray-300">
                                            {item.task ? (item.task.machineOperatorName || '---') : '---'}
                                        </td>
                                        <td className="px-4 py-4 text-sm text-gray-600 dark:text-gray-400">
                                            {/* DÜZELTME: item.startTime alanı kullanıldı */}
                                            {item.startTime ? formatDate(item.startTime) : '---'}
                                        </td>
                                        <td className="px-4 py-4 font-medium text-gray-900 dark:text-white">
                                            {/* DÜZELTME: item.startTime alanı kullanıldı */}
                                            {item.startTime ? formatDuration(item.startTime) : '---'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* İŞ DAĞILIMI TABLOSU (GERİ GETİRİLDİ) */}
                    {canViewWorkDistribution && (
                        <div className="mt-8">
                            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                                CAM Operatörü İş Dağılımı
                            </h3>
                            <div className="overflow-x-auto max-w-lg border border-gray-200 dark:border-gray-700 rounded-lg">
                                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                                    <thead className="bg-gray-50 dark:bg-gray-700">
                                        <tr>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">CAM Operatörü</th>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">Aktif Görev Sayısı</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200 dark:bg-gray-800 dark:divide-gray-700">
                                        {workDistribution.map((item) => (
                                            <tr key={item.name} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                                <td className="px-4 py-3 font-semibold text-gray-900 dark:text-white">{item.name}</td>
                                                <td className="px-4 py-3">
                                                    <span className={`inline-flex px-3 py-1 text-sm font-bold rounded-full ${item.count === 0 ? 'bg-green-100 text-green-800' : (item.count <= 2 ? 'bg-blue-100 text-blue-800' : 'bg-yellow-100 text-yellow-800')}`}>
                                                        {item.count}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            )}

            <MachineStatusModal isOpen={isStatusModalOpen} onClose={() => setIsStatusModalOpen(false)} machine={selectedMachine} onSubmit={handleUpdateMachineStatus} />
        </div>
    );
};

export default ActiveTasksPage;