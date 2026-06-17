import React, { useState, useMemo } from 'react';
import { Search, Clock, PauseCircle, Activity, Box, BarChart2, Layers, AlertTriangle, Settings } from 'lucide-react';

// --- YARDIMCI FONKSİYONLAR ---
const calcMs = (startStr, endStr) => {
    if (!startStr) return 0;
    const start = new Date(startStr).getTime();
    if (isNaN(start)) return 0;
    
    const end = endStr ? new Date(endStr).getTime() : Date.now();
    if (isNaN(end)) return Math.max(0, Date.now() - start);
    
    return Math.max(0, end - start);
};

const formatDuration = (ms) => {
    if (!ms || ms <= 0) return '0 dk';
    const totalMins = Math.floor(ms / 60000);
    const hours = Math.floor(totalMins / 60);
    const mins = totalMins % 60;
    if (hours > 0) return `${hours}s ${mins}d`;
    return `${mins} dk`;
};

const ProductionLogsView = ({ projects }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedMoldId, setSelectedMoldId] = useState(null);

    // --- TÜM VERİLERİ VE SÜRELERİ HESAPLAYAN MOTOR ---
    const moldsWithStats = useMemo(() => {
        if (!projects) return [];

        return projects.map(mold => {
            let moldWorkMs = 0;
            let moldSetupMs = 0;
            let moldProdMs = 0;
            let moldPauseMs = 0;
            let moldPauseReasons = {};
            let tasksStats = [];

            if (mold.tasks) {
                mold.tasks.forEach(task => {
                    let taskWorkMs = 0;
                    let taskSetupMs = 0;
                    let taskProdMs = 0;
                    let taskPauseMs = 0;
                    let taskPauseReasons = {};

                    if (task.operations) {
                        task.operations.forEach(op => {
                            if (!op.startDate) return; // Hiç başlamamışsa atla

                            let opPauseMs = 0;
                            let opPauseReasons = {};

                            // 1. Geçmişteki (kapanmış) duraklatmaları hesapla
                            if (op.pauseHistory && Array.isArray(op.pauseHistory)) {
                                op.pauseHistory.forEach(ph => {
                                    if (ph.pausedAt && ph.resumedAt) {
                                        const dur = calcMs(ph.pausedAt, ph.resumedAt);
                                        opPauseMs += dur;
                                        const reason = ph.reason || 'Belirtilmedi';
                                        opPauseReasons[reason] = (opPauseReasons[reason] || 0) + dur;
                                    }
                                });
                            }

                            // 2. Şu an aktif bir duraklatma varsa onu da süreye dahil et
                            if ((op.status === 'PAUSED' || op.status === 'DURAKLATILDI') && op.lastPausedAt) {
                                const dur = calcMs(op.lastPausedAt, null); // null => now
                                opPauseMs += dur;
                                const reason = op.lastPauseReason || 'Belirtilmedi';
                                opPauseReasons[reason] = (opPauseReasons[reason] || 0) + dur;
                            }

                            // 3. Toplam Süreyi Hesapla (Başlangıç ile Bitiş(veya Şu An) arası)
                            let endStr = op.finishDate;
                            if (!endStr && (op.status === 'COMPLETED' || op.status === 'TAMAMLANDI')) {
                                endStr = op.updatedAt || op.startDate; // Hata payını önlemek için
                            }
                            
                            const opTotalMs = calcMs(op.startDate, endStr);
                            
                            // 4. Net Çalışma Süresi = Toplam Geçen Zaman - Duraklatma Süreleri
                            const opWorkMs = Math.max(0, opTotalMs - opPauseMs);

                            // Ayar ve İmalat Sürelerini Ayrıştırma
                            let grossSetup = 0;
                            if (op.setupStartTime) {
                                grossSetup = calcMs(op.setupStartTime, op.productionStartTime || endStr);
                            }

                            let grossProd = 0;
                            if (op.productionStartTime) {
                                grossProd = calcMs(op.productionStartTime, endStr);
                            } else if (!op.setupStartTime) {
                                grossProd = opTotalMs;
                            }

                            let netProd = Math.max(0, grossProd - opPauseMs);
                            let remainingPause = Math.max(0, opPauseMs - grossProd);
                            let netSetup = Math.max(0, grossSetup - remainingPause);

                            if (!op.setupStartTime && !op.productionStartTime) {
                                netProd = opWorkMs;
                                netSetup = 0;
                            }

                            // Görev (Task) havuzuna ekle
                            taskWorkMs += opWorkMs;
                            taskSetupMs += netSetup;
                            taskProdMs += netProd;
                            taskPauseMs += opPauseMs;
                            Object.keys(opPauseReasons).forEach(r => {
                                taskPauseReasons[r] = (taskPauseReasons[r] || 0) + opPauseReasons[r];
                            });
                        });
                    }

                    // Kalıp (Mold) havuzuna ekle
                    moldWorkMs += taskWorkMs;
                moldSetupMs += taskSetupMs;
                moldProdMs += taskProdMs;
                    moldPauseMs += taskPauseMs;
                    Object.keys(taskPauseReasons).forEach(r => {
                        moldPauseReasons[r] = (moldPauseReasons[r] || 0) + taskPauseReasons[r];
                    });

                    // En çok durduran sebebi bul (Task için)
                    const topTaskReason = Object.entries(taskPauseReasons).sort((a, b) => b[1] - a[1])[0];

                    tasksStats.push({
                        ...task,
                        workMs: taskWorkMs,
                    setupMs: taskSetupMs,
                    prodMs: taskProdMs,
                        pauseMs: taskPauseMs,
                        topReason: topTaskReason ? topTaskReason[0] : '-'
                    });
                });
            }

            return {
                ...mold,
                workMs: moldWorkMs,
                setupMs: moldSetupMs,
                prodMs: moldProdMs,
                pauseMs: moldPauseMs,
                pauseReasons: moldPauseReasons,
                tasksStats
            };
        });
    }, [projects]);

    // --- FİLTRELEME VE SEÇİM ---
    const filteredMolds = useMemo(() => {
        if (!searchTerm) return moldsWithStats;
        const lower = searchTerm.toLowerCase();
        return moldsWithStats.filter(m => 
            m.moldName.toLowerCase().includes(lower) || 
            (m.customer && m.customer.toLowerCase().includes(lower))
        );
    }, [moldsWithStats, searchTerm]);

    const selectedMold = useMemo(() => {
        return moldsWithStats.find(m => m.id === selectedMoldId) || null;
    }, [moldsWithStats, selectedMoldId]);

    // Duruş Sebeplerini Sırala
    const sortedPauseReasons = useMemo(() => {
        if (!selectedMold || !selectedMold.pauseReasons) return [];
        return Object.entries(selectedMold.pauseReasons).sort((a, b) => b[1] - a[1]);
    }, [selectedMold]);

    return (
        <div className="flex h-[calc(100vh-100px)] overflow-hidden bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl">
            
            {/* SOL PANEL: LİSTE */}
            <div className="w-1/3 border-r border-gray-200 dark:border-gray-700 flex flex-col bg-white dark:bg-gray-800">
                <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                    <h2 className="text-lg font-bold text-gray-800 dark:text-white mb-3 flex items-center">
                        <Layers className="w-5 h-5 mr-2 text-indigo-500" /> Kalıp Logları
                    </h2>
                    <div className="relative">
                        <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                        <input 
                            type="text" 
                            placeholder="Kalıp Adı veya Müşteri Ara..." 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-9 p-2 text-sm border rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white border-gray-300 dark:border-gray-600 focus:ring-1 focus:ring-indigo-500"
                        />
                    </div>
                </div>
                
                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                    {filteredMolds.map(mold => (
                        <button
                            key={mold.id}
                            onClick={() => setSelectedMoldId(mold.id)}
                            className={`w-full text-left p-3 rounded-lg border transition-all ${
                                selectedMoldId === mold.id 
                                    ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-500 shadow-sm ring-1 ring-indigo-500' 
                                    : 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 hover:border-indigo-300 dark:hover:border-indigo-500'
                            }`}
                        >
                            <div className="font-bold text-gray-900 dark:text-white">{mold.moldName}</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">{mold.customer}</div>
                            
                            <div className="flex gap-3 text-xs font-semibold">
                                <span className="text-blue-600 dark:text-blue-400 flex items-center" title="Ayar Süresi"><Settings className="w-3 h-3 mr-1"/> {formatDuration(mold.setupMs)}</span>
                                <span className="text-green-600 dark:text-green-400 flex items-center" title="İmalat (Çalışıyor)"><Activity className="w-3 h-3 mr-1"/> {formatDuration(mold.prodMs)}</span>
                                <span className="text-orange-600 dark:text-orange-400 flex items-center" title="Duruş Kaybı"><PauseCircle className="w-3 h-3 mr-1"/> {formatDuration(mold.pauseMs)}</span>
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            {/* SAĞ PANEL: DETAY VE ANALİZ */}
            <div className="flex-1 overflow-y-auto p-6 bg-gray-50 dark:bg-gray-900">
                {selectedMold ? (
                    <div className="space-y-6">
                        <div className="flex justify-between items-end border-b border-gray-200 dark:border-gray-700 pb-4">
                            <div>
                                <h1 className="text-2xl font-black text-gray-900 dark:text-white">{selectedMold.moldName}</h1>
                                <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Müşteri: {selectedMold.customer}</p>
                            </div>
                        </div>

                        {/* KPI KARTLARI */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="bg-white dark:bg-gray-800 p-5 rounded-xl shadow-sm border border-blue-200 dark:border-blue-900/50">
                                <div className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase flex items-center"><Settings className="w-4 h-4 mr-1"/> Toplam Ayar Süresi</div>
                                <div className="text-3xl font-black text-gray-900 dark:text-white mt-2">{formatDuration(selectedMold.setupMs)}</div>
                            </div>
                            
                            <div className="bg-white dark:bg-gray-800 p-5 rounded-xl shadow-sm border border-green-200 dark:border-green-900/50">
                                <div className="text-xs font-bold text-green-600 dark:text-green-400 uppercase flex items-center"><Activity className="w-4 h-4 mr-1"/> Toplam İmalat (Çalışıyor)</div>
                                <div className="text-3xl font-black text-gray-900 dark:text-white mt-2">{formatDuration(selectedMold.prodMs)}</div>
                            </div>
                            
                            <div className="bg-white dark:bg-gray-800 p-5 rounded-xl shadow-sm border border-orange-200 dark:border-orange-900/50">
                                <div className="text-xs font-bold text-orange-600 dark:text-orange-400 uppercase flex items-center"><AlertTriangle className="w-4 h-4 mr-1"/> Toplam Duruş Kaybı</div>
                                <div className="text-3xl font-black text-gray-900 dark:text-white mt-2">{formatDuration(selectedMold.pauseMs)}</div>
                            </div>
                        </div>

                        {/* DURUŞ SEBEPLERİ ANALİZİ */}
                        <div className="bg-white dark:bg-gray-800 p-5 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                            <h3 className="font-bold text-gray-800 dark:text-white mb-4 border-b dark:border-gray-700 pb-2">Duruş Sebepleri Dağılımı</h3>
                            {sortedPauseReasons.length > 0 ? (
                                <div className="space-y-4">
                                    {sortedPauseReasons.map(([reason, duration]) => {
                                        const percentage = ((duration / selectedMold.pauseMs) * 100).toFixed(1);
                                        return (
                                            <div key={reason}>
                                                <div className="flex justify-between text-sm font-semibold mb-1">
                                                    <span className="text-gray-700 dark:text-gray-300">{reason}</span>
                                                    <span className="text-orange-600 dark:text-orange-400">{formatDuration(duration)} <span className="text-gray-400 text-xs">(%{percentage})</span></span>
                                                </div>
                                                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                                                    <div className="bg-orange-500 h-2.5 rounded-full" style={{ width: `${percentage}%` }}></div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <p className="text-gray-500 text-sm italic">Bu kalıpta henüz duraklatma kaydı bulunmamaktadır.</p>
                            )}
                        </div>

                        {/* ALT PARÇALAR LİSTESİ */}
                        <div className="bg-white dark:bg-gray-800 p-5 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                            <h3 className="font-bold text-gray-800 dark:text-white mb-4 border-b dark:border-gray-700 pb-2 flex items-center">
                                <Box className="w-5 h-5 mr-2 text-blue-500"/> Alt Parça (Task) Logları
                            </h3>
                            <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                                    <thead className="bg-gray-50 dark:bg-gray-800/50">
                                        <tr>
                                            <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider dark:text-gray-400">Parça Adı</th>
                                        <th className="px-4 py-3 text-left text-xs font-bold text-blue-500 uppercase tracking-wider dark:text-blue-400">Ayar Süresi</th>
                                        <th className="px-4 py-3 text-left text-xs font-bold text-green-500 uppercase tracking-wider dark:text-green-400">İmalat Süresi</th>
                                        <th className="px-4 py-3 text-left text-xs font-bold text-orange-500 uppercase tracking-wider dark:text-orange-400">Duruş Süresi</th>
                                            <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider dark:text-gray-400">En Çok Durduran Sebep</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200 dark:bg-gray-800 dark:divide-gray-700">
                                        {selectedMold.tasksStats.map(task => (
                                            <tr key={task.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition">
                                                <td className="px-4 py-3 text-sm font-bold text-gray-900 dark:text-white">{task.taskName}</td>
                                            <td className="px-4 py-3 text-sm font-semibold text-blue-600 dark:text-blue-400">{formatDuration(task.setupMs)}</td>
                                            <td className="px-4 py-3 text-sm font-semibold text-green-600 dark:text-green-400">{formatDuration(task.prodMs)}</td>
                                                <td className="px-4 py-3 text-sm font-semibold text-orange-600 dark:text-orange-400">{formatDuration(task.pauseMs)}</td>
                                                <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{task.topReason}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                    </div>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center text-gray-400 dark:text-gray-500 opacity-60">
                        <BarChart2 className="w-24 h-24 mb-4 text-gray-300 dark:text-gray-600" />
                        <p className="text-xl font-medium">Loglarını görmek istediğiniz kalıbı soldan seçin.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ProductionLogsView;