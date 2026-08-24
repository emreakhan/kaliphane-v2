// src/components/OEE/OeeCamOperatorAnalysisTab.jsx
import React, { useState, useMemo } from 'react';
import { 
  User, Award, Clock, PlayCircle, PauseCircle, 
  ChevronDown, ChevronUp, Box, Layers, Zap,
  TrendingUp, BarChart3, Search, CheckCircle2,
  Calendar, ArrowUpRight, Monitor
} from 'lucide-react';
import { findActiveProductionJob, cleanMachineCode } from '../../services/oeeTrackingService.js';

export const OeeCamOperatorAnalysisTab = ({ projects = [], fleetData = [] }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedOperator, setExpandedOperator] = useState(null);

  // Doğrudan Canlı Telemetriye ve Gerçek Tezgah Durumuna Göre Hesaplanan İstatistikler
  const operatorStats = useMemo(() => {
    const operatorMap = new Map();

    // Sadece canlı filodaki cihazları ve telemetriyi tara
    fleetData.forEach(device => {
      const searchKeys = [device.name, device.systemMachineCode, device.id, device.ip].filter(Boolean);
      let prodJob = null;
      for (const k of searchKeys) {
        prodJob = findActiveProductionJob(k, projects);
        if (prodJob) break;
      }

      // Eğer bu tezgahta aktif bir iş varsa
      if (prodJob) {
        const opName = (prodJob.camOperatorName || 'Belirtilmedi').trim();
        if (!operatorMap.has(opName)) {
          operatorMap.set(opName, {
            operatorName: opName,
            activeRunningCount: 0,
            idleCount: 0,
            totalAssignedCount: 0,
            totalRunningSeconds: 0,
            totalIdleSeconds: 0,
            totalDownSeconds: 0,
            machines: []
          });
        }

        const opData = operatorMap.get(opName);
        opData.totalAssignedCount++;

        const isConn = device.connected !== false;
        const st = isConn ? (device.currentState || 'Offline').toLowerCase() : 'offline';
        const isRunning = st === 'running';

        if (isRunning) {
          opData.activeRunningCount++;
        } else {
          opData.idleCount++;
        }

        const runSec = device.runningSec || 0;
        const idleSec = device.idleSec || 0;
        const downSec = device.downSec || 0;

        opData.totalRunningSeconds += runSec;
        opData.totalIdleSeconds += idleSec;
        opData.totalDownSeconds += downSec;

        opData.machines.push({
          machineName: device.name || device.ip,
          ip: device.ip,
          currentState: device.currentState || 'Offline',
          connected: isConn,
          isRunning,
          moldName: prodJob.moldName,
          taskName: prodJob.taskName,
          machineOperator: prodJob.machineOperatorName,
          progress: prodJob.progressPercentage || 0,
          runningSec: runSec,
          idleSec: idleSec,
          downSec: downSec,
          spindleRpm: device.spindleRpm,
          feedrate: device.feedrate
        });
      }
    });

    return Array.from(operatorMap.values()).map(op => {
      const totalWorkSec = op.totalRunningSeconds + op.totalIdleSeconds + op.totalDownSeconds;
      const efficiencyPct = totalWorkSec > 0 ? (op.totalRunningSeconds / totalWorkSec) * 100 : 0;
      return {
        ...op,
        efficiencyPct: Math.round(efficiencyPct * 10) / 10,
        totalHours: (op.totalRunningSeconds / 3600).toFixed(1)
      };
    }).sort((a, b) => b.totalRunningSeconds - a.totalRunningSeconds);
  }, [projects, fleetData]);

  const formatSeconds = (sec) => {
    if (!sec || isNaN(sec)) return "0 dk";
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    if (h > 0) return `${h} sa ${m} dk`;
    return `${m} dk`;
  };

  // KPI Hesaplamaları
  const kpis = useMemo(() => {
    let totalRunningMachines = 0;
    let totalAssignedMachines = 0;
    let totalRunningSec = 0;
    let totalIdleSec = 0;

    operatorStats.forEach(op => {
      totalRunningMachines += op.activeRunningCount || 0;
      totalAssignedMachines += op.totalAssignedCount || 0;
      totalRunningSec += op.totalRunningSeconds || 0;
      totalIdleSec += op.totalIdleSeconds || 0;
    });

    const totalWork = totalRunningSec + totalIdleSec;
    const avgEff = totalWork > 0 ? Math.round((totalRunningSec / totalWork) * 100) : 0;
    const topOp = operatorStats.length > 0 ? operatorStats[0] : null;

    return {
      totalRunningMachines,
      totalAssignedMachines,
      totalRunningSec,
      totalHours: (totalRunningSec / 3600).toFixed(1),
      avgEff,
      topOp
    };
  }, [operatorStats]);

  // Filtrelenmiş Operatörler
  const filteredOperators = useMemo(() => {
    if (!searchTerm.trim()) return operatorStats;
    const q = searchTerm.toLowerCase();
    return operatorStats.filter(op => {
      const matchName = op.operatorName.toLowerCase().includes(q);
      const matchMachine = op.machines.some(m => 
        (m.machineName || '').toLowerCase().includes(q) ||
        (m.moldName || '').toLowerCase().includes(q) ||
        (m.taskName || '').toLowerCase().includes(q)
      );
      return matchName || matchMachine;
    });
  }, [operatorStats, searchTerm]);

  return (
    <div className="space-y-4">
      {/* 1. ÜST KPI ÖZET KARTLARI (CANLI TELEMETRİ BAZLI) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-800 border dark:border-slate-700 shadow-xs flex flex-col justify-between">
          <span className="text-[10px] font-extrabold text-blue-600 dark:text-blue-400 uppercase tracking-wider">
            🟢 Anlık Çalışan CAM Parçası
          </span>
          <div className="text-2xl font-black text-slate-900 dark:text-white mt-1 flex items-baseline justify-between">
            <span>{kpis.totalRunningMachines}</span>
            <span className="text-xs font-bold text-slate-400">/{kpis.totalAssignedMachines} Tezgahta</span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-emerald-500/10 dark:bg-emerald-950/40 border border-emerald-500/30 text-emerald-900 dark:text-emerald-100 shadow-xs flex flex-col justify-between">
          <span className="text-[10px] font-extrabold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
            ⚡ Toplam Canlı Çalışma
          </span>
          <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1 flex items-baseline justify-between font-mono">
            <span>{kpis.totalHours}</span>
            <span className="text-xs font-bold opacity-80">Saat</span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-800 border dark:border-slate-700 shadow-xs flex flex-col justify-between">
          <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
            Ortalama İşleme Verimi
          </span>
          <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1 flex items-baseline justify-between font-mono">
            <span>%{kpis.avgEff}</span>
            <span className="text-xs font-bold text-slate-400">Verimlilik</span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-purple-500/10 dark:bg-purple-950/40 border border-purple-500/30 text-purple-900 dark:text-purple-100 shadow-xs flex flex-col justify-between">
          <span className="text-[10px] font-extrabold text-purple-600 dark:text-purple-400 uppercase tracking-wider flex items-center gap-1">
            <Award size={13} /> En Yüksek Canlı Çalışma
          </span>
          <div className="text-sm font-black text-purple-700 dark:text-purple-300 mt-1 truncate">
            {kpis.topOp ? `${kpis.topOp.operatorName} (${kpis.topOp.totalHours} sa)` : '-'}
          </div>
        </div>
      </div>

      {/* 2. BAŞLIK VE ARAMA */}
      <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border dark:border-slate-700 shadow-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h2 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
            <BarChart3 className="text-blue-500 w-5 h-5" /> CAM Operatörü Tezgah Süre & Performans Dağılımı
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            CAM operatörünün hazırladığı programların canlı tezgahlardaki net talaş kaldırma (Running) ve duruş (Idle) süreleri.
          </p>
        </div>

        <div className="relative w-full sm:w-64">
          <Search size={15} className="absolute left-3 top-3 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="CAM operatörü veya parça ara..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs font-bold border dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* 3. OPERATÖR KARTLARI LİSTESİ */}
      <div className="space-y-3">
        {filteredOperators.length === 0 ? (
          <div className="p-16 text-center text-slate-400 font-bold bg-white dark:bg-slate-800 rounded-2xl border dark:border-slate-700 space-y-2">
            <User size={32} className="mx-auto text-slate-400" />
            <p>Canlı telemetri verisine sahip CAM operatörü bulunamadı.</p>
          </div>
        ) : (
          filteredOperators.map(op => {
            const isExpanded = expandedOperator === op.operatorName;

            return (
              <div 
                key={op.operatorName}
                className="bg-white dark:bg-slate-800 rounded-2xl border dark:border-slate-700 shadow-xs overflow-hidden transition"
              >
                {/* Kart Üst Başlığı (Tıklanabilir) */}
                <div
                  onClick={() => setExpandedOperator(isExpanded ? null : op.operatorName)}
                  className="p-4 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-750 transition"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center font-black text-sm">
                      <User size={20} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-black text-slate-900 dark:text-white">
                          {op.operatorName}
                        </h3>
                        {op.activeRunningCount > 0 ? (
                          <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 text-[10px] font-black flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                            {op.activeRunningCount} Tezgahta Çalışıyor
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-400 text-[10px] font-bold">
                            Boşta / Duruşta
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-slate-400 font-medium">
                        Toplam {op.totalAssignedCount} Tezgahta Programı Tanımlı
                      </span>
                    </div>
                  </div>

                  {/* İstatistikler */}
                  <div className="flex flex-wrap items-center gap-4 text-xs">
                    <div className="text-right">
                      <span className="text-[10px] text-slate-400 font-bold uppercase block">Net İşleme Süresi</span>
                      <span className="font-mono font-black text-emerald-600 dark:text-emerald-400 text-sm">
                        {formatSeconds(op.totalRunningSeconds)}
                      </span>
                    </div>

                    <div className="text-right">
                      <span className="text-[10px] text-slate-400 font-bold uppercase block">Duruş / Boşta</span>
                      <span className="font-mono font-bold text-amber-600 dark:text-amber-400 text-sm">
                        {formatSeconds(op.totalIdleSeconds)}
                      </span>
                    </div>

                    <div className="text-right">
                      <span className="text-[10px] text-slate-400 font-bold uppercase block">Verimlilik</span>
                      <span className="font-mono font-black text-blue-600 dark:text-blue-400 text-sm">
                        %{op.efficiencyPct}
                      </span>
                    </div>

                    <div className="p-1 rounded-lg text-slate-400">
                      {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </div>
                  </div>
                </div>

                {/* Açılır Parça ve Tezgah Detay Tablosu */}
                {isExpanded && (
                  <div className="p-4 bg-slate-50 dark:bg-slate-900 border-t dark:border-slate-700 space-y-2">
                    <span className="text-xs font-black text-slate-500 uppercase tracking-wider block">
                      Operatörün Canlı Tezgahlardaki İşleme Durumu:
                    </span>

                    <div className="overflow-x-auto rounded-xl border dark:border-slate-700 bg-white dark:bg-slate-800">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-slate-100 dark:bg-slate-850 text-slate-500 font-extrabold uppercase text-[10px]">
                            <th className="p-2.5">Tezgah</th>
                            <th className="p-2.5">Kalıp & Parça</th>
                            <th className="p-2.5">Tezgah Operatörü</th>
                            <th className="p-2.5">Canlı Durum</th>
                            <th className="p-2.5 text-right">🟢 Net Çalışma</th>
                            <th className="p-2.5 text-right">🟡 Boşta / Duruş</th>
                            <th className="p-2.5 text-right">Devir / İlerleme</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                          {op.machines.map((m, idx) => (
                            <tr key={idx} className="hover:bg-slate-50/60 dark:hover:bg-slate-700/50">
                              <td className="p-2.5 font-mono font-black text-blue-600 dark:text-blue-400">
                                {m.machineName} ({m.ip})
                              </td>
                              <td className="p-2.5">
                                <span className="font-bold text-slate-900 dark:text-white block">{m.moldName}</span>
                                <span className="text-[11px] text-blue-500">{m.taskName}</span>
                              </td>
                              <td className="p-2.5 text-slate-600 dark:text-slate-300">
                                {m.machineOperator || '-'}
                              </td>
                              <td className="p-2.5">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                                  m.isRunning 
                                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 animate-pulse'
                                    : 'bg-slate-200 dark:bg-slate-700 text-slate-400'
                                }`}>
                                  {m.isRunning ? 'ÇALIŞIYOR' : m.currentState}
                                </span>
                              </td>
                              <td className="p-2.5 text-right font-mono font-black text-emerald-600 dark:text-emerald-400">
                                {formatSeconds(m.runningSec)}
                              </td>
                              <td className="p-2.5 text-right font-mono font-bold text-amber-600 dark:text-amber-400">
                                {formatSeconds(m.idleSec)}
                              </td>
                              <td className="p-2.5 text-right font-mono text-slate-400 text-[11px]">
                                {m.spindleRpm ? `${m.spindleRpm} RPM` : '-'} / {m.feedrate ? `${m.feedrate} mm/dk` : '-'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

              </div>
            );
          })
        )}
      </div>

    </div>
  );
};

export default OeeCamOperatorAnalysisTab;
