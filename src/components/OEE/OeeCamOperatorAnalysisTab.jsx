// src/components/OEE/OeeCamOperatorAnalysisTab.jsx
import React, { useState, useMemo } from 'react';
import { 
  User, Award, Clock, PlayCircle, PauseCircle, 
  ChevronDown, ChevronUp, Box, Layers, Zap,
  TrendingUp, BarChart3, Search, CheckCircle2,
  Calendar, ArrowUpRight, Monitor, CalendarDays,
  Sparkles, Filter
} from 'lucide-react';
import { findActiveProductionJob, cleanMachineCode } from '../../services/oeeTrackingService.js';

export const OeeCamOperatorAnalysisTab = ({ projects = [], fleetData = [] }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedOperator, setExpandedOperator] = useState(null);
  const [selectedPeriod, setSelectedPeriod] = useState('ALL'); // 'ALL' | 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'

  const now = useMemo(() => new Date(), []);
  const startOfToday = useMemo(() => new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime(), [now]);
  const startOfWeek = useMemo(() => {
    const d = new Date(now);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Pazartesi
    return new Date(d.setDate(diff)).setHours(0,0,0,0);
  }, [now]);
  const startOfMonth = useMemo(() => new Date(now.getFullYear(), now.getMonth(), 1).getTime(), [now]);
  const startOfYear = useMemo(() => new Date(now.getFullYear(), 0, 1).getTime(), [now]);

  // Doğrudan Canlı Telemetri ve Sistem Geçmişi ile Günlük, Haftalık, Aylık, Yıllık Süre Hesaplama
  const operatorStats = useMemo(() => {
    const operatorMap = new Map();

    const getOrCreateOp = (name) => {
      const opName = (name || 'Belirtilmedi').trim();
      if (!operatorMap.has(opName)) {
        operatorMap.set(opName, {
          operatorName: opName,
          activeRunningCount: 0,
          idleCount: 0,
          totalAssignedCount: 0,
          dailyRunningSec: 0,
          dailyIdleSec: 0,
          weeklyRunningSec: 0,
          monthlyRunningSec: 0,
          yearlyRunningSec: 0,
          totalCompletedParts: 0,
          liveMachines: [],
          allTasks: []
        });
      }
      return operatorMap.get(opName);
    };

    // 1. Canlı Filo Telemetrisi (Bugünkü Anlık ve Günlük Sayaçlar)
    fleetData.forEach(device => {
      const searchKeys = [device.name, device.systemMachineCode, device.id, device.ip].filter(Boolean);
      let prodJob = null;
      for (const k of searchKeys) {
        prodJob = findActiveProductionJob(k, projects);
        if (prodJob) break;
      }

      if (prodJob) {
        const opData = getOrCreateOp(prodJob.camOperatorName);
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

        // Canlı telemetri günün net çalışma süresidir
        opData.dailyRunningSec += runSec;
        opData.dailyIdleSec += idleSec + downSec;

        // Haftalık, aylık, yıllığa da bugünün süresini ekle
        opData.weeklyRunningSec += runSec;
        opData.monthlyRunningSec += runSec;
        opData.yearlyRunningSec += runSec;

        opData.liveMachines.push({
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

    // 2. Projelerdeki Geçmiş Görev ve Operasyon Süreleri (Haftalık, Aylık, Yıllık Toplamlar)
    projects.forEach(project => {
      const moldName = project.moldName || project.name || '';
      const tasks = project.tasks || [];

      tasks.forEach(task => {
        const camOpName = task.assignedOperator || task.camOperator || task.camPreparation?.operator;
        if (!camOpName) return;

        const opData = getOrCreateOp(camOpName);
        const actualHours = parseFloat(task.actualCamTime || task.actualDuration || 0) || 0;
        const actualSec = actualHours * 3600;

        if (task.status === 'TAMAMLANDI') {
          opData.totalCompletedParts++;
        }

        // Tarih analizi
        let taskTime = null;
        if (task.completedDate) taskTime = new Date(task.completedDate).getTime();
        else if (task.startDate) taskTime = new Date(task.startDate).getTime();
        else if (project.createdAt) taskTime = new Date(project.createdAt).getTime();

        if (actualSec > 0) {
          if (taskTime) {
            if (taskTime >= startOfWeek) opData.weeklyRunningSec += actualSec;
            if (taskTime >= startOfMonth) opData.monthlyRunningSec += actualSec;
            if (taskTime >= startOfYear) opData.yearlyRunningSec += actualSec;
          } else {
            // Tarih bilinmiyorsa genel yıllık/aylık toplamda değerlendir
            opData.monthlyRunningSec += actualSec * 0.4;
            opData.yearlyRunningSec += actualSec;
          }
        }

        opData.allTasks.push({
          taskName: task.taskName || task.name || 'İsimsiz Parça',
          moldName,
          status: task.status,
          hours: actualHours,
          date: task.completedDate || task.startDate || project.createdAt
        });
      });
    });

    return Array.from(operatorMap.values()).map(op => {
      const totalWorkSec = op.dailyRunningSec + op.dailyIdleSec;
      const efficiencyPct = totalWorkSec > 0 ? (op.dailyRunningSec / totalWorkSec) * 100 : (op.dailyRunningSec > 0 ? 100 : 0);
      
      return {
        ...op,
        efficiencyPct: Math.round(efficiencyPct * 10) / 10,
        dailyHours: (op.dailyRunningSec / 3600).toFixed(1),
        weeklyHours: (op.weeklyRunningSec / 3600).toFixed(1),
        monthlyHours: (op.monthlyRunningSec / 3600).toFixed(1),
        yearlyHours: (op.yearlyRunningSec / 3600).toFixed(1)
      };
    }).sort((a, b) => {
      if (selectedPeriod === 'DAILY') return b.dailyRunningSec - a.dailyRunningSec;
      if (selectedPeriod === 'WEEKLY') return b.weeklyRunningSec - a.weeklyRunningSec;
      if (selectedPeriod === 'MONTHLY') return b.monthlyRunningSec - a.monthlyRunningSec;
      if (selectedPeriod === 'YEARLY') return b.yearlyRunningSec - a.yearlyRunningSec;
      return b.dailyRunningSec - a.dailyRunningSec || b.yearlyRunningSec - a.yearlyRunningSec;
    });
  }, [projects, fleetData, startOfToday, startOfWeek, startOfMonth, startOfYear, selectedPeriod]);

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
    let totalDailySec = 0;
    let totalWeeklySec = 0;
    let totalMonthlySec = 0;
    let totalYearlySec = 0;

    operatorStats.forEach(op => {
      totalRunningMachines += op.activeRunningCount || 0;
      totalAssignedMachines += op.totalAssignedCount || 0;
      totalDailySec += op.dailyRunningSec || 0;
      totalWeeklySec += op.weeklyRunningSec || 0;
      totalMonthlySec += op.monthlyRunningSec || 0;
      totalYearlySec += op.yearlyRunningSec || 0;
    });

    let displayHours = (totalDailySec / 3600).toFixed(1);
    let periodLabel = "Bugün Canlı Çalışma";
    if (selectedPeriod === 'WEEKLY') {
      displayHours = (totalWeeklySec / 3600).toFixed(1);
      periodLabel = "Bu Hafta Net Çalışma";
    } else if (selectedPeriod === 'MONTHLY') {
      displayHours = (totalMonthlySec / 3600).toFixed(1);
      periodLabel = "Bu Ay Net Çalışma";
    } else if (selectedPeriod === 'YEARLY') {
      displayHours = (totalYearlySec / 3600).toFixed(1);
      periodLabel = "Bu Yıl Net Çalışma";
    }

    const topOp = operatorStats.length > 0 ? operatorStats[0] : null;

    return {
      totalRunningMachines,
      totalAssignedMachines,
      displayHours,
      periodLabel,
      totalDailyHours: (totalDailySec / 3600).toFixed(1),
      totalWeeklyHours: (totalWeeklySec / 3600).toFixed(1),
      totalMonthlyHours: (totalMonthlySec / 3600).toFixed(1),
      totalYearlyHours: (totalYearlySec / 3600).toFixed(1),
      topOp
    };
  }, [operatorStats, selectedPeriod]);

  // Filtrelenmiş Operatörler
  const filteredOperators = useMemo(() => {
    if (!searchTerm.trim()) return operatorStats;
    const q = searchTerm.toLowerCase();
    return operatorStats.filter(op => {
      const matchName = op.operatorName.toLowerCase().includes(q);
      const matchMachine = op.liveMachines.some(m => 
        (m.machineName || '').toLowerCase().includes(q) ||
        (m.moldName || '').toLowerCase().includes(q) ||
        (m.taskName || '').toLowerCase().includes(q)
      );
      return matchName || matchMachine;
    });
  }, [operatorStats, searchTerm]);

  return (
    <div className="space-y-4">
      {/* 1. ÜST KPI ÖZET KARTLARI (GÜNLÜK, HAFTALIK, AYLIK, YILLIK) */}
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
            ⚡ {kpis.periodLabel}
          </span>
          <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1 flex items-baseline justify-between font-mono">
            <span>{kpis.displayHours}</span>
            <span className="text-xs font-bold opacity-80">Saat</span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-800 border dark:border-slate-700 shadow-xs flex flex-col justify-between">
          <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
            📅 Bu Ay Toplam Çalışma
          </span>
          <div className="text-2xl font-black text-blue-600 dark:text-blue-400 mt-1 flex items-baseline justify-between font-mono">
            <span>{kpis.totalMonthlyHours}</span>
            <span className="text-xs font-bold text-slate-400">Saat</span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-purple-500/10 dark:bg-purple-950/40 border border-purple-500/30 text-purple-900 dark:text-purple-100 shadow-xs flex flex-col justify-between">
          <span className="text-[10px] font-extrabold text-purple-600 dark:text-purple-400 uppercase tracking-wider flex items-center gap-1">
            <Award size={13} /> 🏆 Yıllık Lider CAM Operatörü
          </span>
          <div className="text-sm font-black text-purple-700 dark:text-purple-300 mt-1 truncate">
            {kpis.topOp ? `${kpis.topOp.operatorName} (${kpis.topOp.yearlyHours} sa)` : '-'}
          </div>
        </div>
      </div>

      {/* 2. BAŞLIK, DÖNEM FİLTRESİ VE ARAMA BARI */}
      <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border dark:border-slate-700 shadow-xs flex flex-col lg:flex-row justify-between items-start lg:items-center gap-3">
        <div>
          <h2 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
            <BarChart3 className="text-blue-500 w-5 h-5" /> CAM Operatörü Tezgah Süre & Performans Dağılımı
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Operatörlerin günlük (canlı), haftalık, aylık ve yıllık net tezgah işleme süreleri.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
          {/* Dönem Filtresi (Günlük / Haftalık / Aylık / Yıllık) */}
          <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-700 text-xs">
            <button
              onClick={() => setSelectedPeriod('ALL')}
              className={`px-3 py-1.5 font-bold rounded-lg transition ${
                selectedPeriod === 'ALL' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-white'
              }`}
            >
              Tüm Dönemler
            </button>
            <button
              onClick={() => setSelectedPeriod('DAILY')}
              className={`px-3 py-1.5 font-bold rounded-lg transition ${
                selectedPeriod === 'DAILY' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-white'
              }`}
            >
              📅 Günlük
            </button>
            <button
              onClick={() => setSelectedPeriod('WEEKLY')}
              className={`px-3 py-1.5 font-bold rounded-lg transition ${
                selectedPeriod === 'WEEKLY' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-white'
              }`}
            >
              📆 Haftalık
            </button>
            <button
              onClick={() => setSelectedPeriod('MONTHLY')}
              className={`px-3 py-1.5 font-bold rounded-lg transition ${
                selectedPeriod === 'MONTHLY' ? 'bg-purple-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-white'
              }`}
            >
              🗓️ Aylık
            </button>
            <button
              onClick={() => setSelectedPeriod('YEARLY')}
              className={`px-3 py-1.5 font-bold rounded-lg transition ${
                selectedPeriod === 'YEARLY' ? 'bg-amber-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-white'
              }`}
            >
              🏆 Yıllık
            </button>
          </div>

          {/* Arama Barı */}
          <div className="relative flex-1 sm:w-60">
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
      </div>

      {/* 3. OPERATÖR KARTLARI LİSTESİ (GÜNLÜK, HAFTALIK, AYLIK, YILLIK KUTULARIYLA) */}
      <div className="space-y-3">
        {filteredOperators.length === 0 ? (
          <div className="p-16 text-center text-slate-400 font-bold bg-white dark:bg-slate-800 rounded-2xl border dark:border-slate-700 space-y-2">
            <User size={32} className="mx-auto text-slate-400" />
            <p>CAM operatörü kaydı bulunamadı.</p>
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
                  className="p-4 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-750 transition"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-2xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center font-black text-base shrink-0">
                      <User size={22} />
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
                        Canlı: {op.totalAssignedCount} Tezgah • Tamamlanan: {op.totalCompletedParts} Parça
                      </span>
                    </div>
                  </div>

                  {/* 4 DÖNEMLİK SÜRE KUTUCUKLARI (GÜNLÜK, HAFTALIK, AYLIK, YILLIK) */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full xl:w-auto text-xs font-mono">
                    
                    {/* Günlük (Canlı) */}
                    <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-center">
                      <span className="text-[9px] font-extrabold text-emerald-600 dark:text-emerald-400 uppercase block font-sans">
                        📅 Günlük Net
                      </span>
                      <span className="text-sm font-black text-emerald-600 dark:text-emerald-300 mt-0.5 block">
                        {formatSeconds(op.dailyRunningSec)}
                      </span>
                    </div>

                    {/* Haftalık */}
                    <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-center">
                      <span className="text-[9px] font-extrabold text-blue-600 dark:text-blue-400 uppercase block font-sans">
                        📆 Bu Hafta
                      </span>
                      <span className="text-sm font-black text-blue-600 dark:text-blue-300 mt-0.5 block">
                        {op.weeklyHours} Saat
                      </span>
                    </div>

                    {/* Aylık */}
                    <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-center">
                      <span className="text-[9px] font-extrabold text-purple-600 dark:text-purple-400 uppercase block font-sans">
                        🗓️ Bu Ay
                      </span>
                      <span className="text-sm font-black text-purple-600 dark:text-purple-300 mt-0.5 block">
                        {op.monthlyHours} Saat
                      </span>
                    </div>

                    {/* Yıllık */}
                    <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-center">
                      <span className="text-[9px] font-extrabold text-amber-600 dark:text-amber-400 uppercase block font-sans">
                        🏆 Bu Yıl
                      </span>
                      <span className="text-sm font-black text-amber-600 dark:text-amber-300 mt-0.5 block">
                        {op.yearlyHours} Saat
                      </span>
                    </div>

                  </div>

                  <div className="p-1 rounded-lg text-slate-400 self-end xl:self-center">
                    {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                  </div>
                </div>

                {/* Açılır Parça ve Tezgah Detay Tablosu */}
                {isExpanded && (
                  <div className="p-4 bg-slate-50 dark:bg-slate-900 border-t dark:border-slate-700 space-y-3">
                    <div className="flex justify-between items-center text-xs font-black text-slate-500 uppercase tracking-wider">
                      <span>Operatörün Canlı Tezgahlardaki İşleme Durumu ({op.liveMachines.length} Tezgah):</span>
                      <span className="text-emerald-500">Günlük Verimlilik: %{op.efficiencyPct}</span>
                    </div>

                    {op.liveMachines.length === 0 ? (
                      <div className="py-4 text-center text-slate-400 text-xs italic">
                        Şu anda canlı çalışan tezgahı bulunmuyor.
                      </div>
                    ) : (
                      <div className="overflow-x-auto rounded-xl border dark:border-slate-700 bg-white dark:bg-slate-800">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="bg-slate-100 dark:bg-slate-850 text-slate-500 font-extrabold uppercase text-[10px]">
                              <th className="p-2.5">Tezgah</th>
                              <th className="p-2.5">Kalıp & Parça</th>
                              <th className="p-2.5">Tezgah Operatörü</th>
                              <th className="p-2.5">Canlı Durum</th>
                              <th className="p-2.5 text-right">🟢 Günlük Net Çalışma</th>
                              <th className="p-2.5 text-right">🟡 Boşta / Duruş</th>
                              <th className="p-2.5 text-right">Devir / İlerleme</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                            {op.liveMachines.map((m, idx) => (
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
                    )}
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
