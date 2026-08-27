// src/components/OEE/OeeMachineLogbookTab.jsx
import React, { useState, useMemo } from 'react';
import { 
  Calendar, Clock, PlayCircle, PauseCircle, WifiOff, 
  AlertTriangle, ChevronRight, BarChart3, Layers, 
  CheckCircle2, ArrowUpRight, Filter, Monitor, Search,
  X, ShieldAlert, User, Box, Zap, TrendingUp, Activity,
  PieChart, Award, ArrowRight
} from 'lucide-react';
import { getMachine24hTimeline, findActiveProductionJob } from '../../services/oeeTrackingService.js';

export const OeeMachineLogbookTab = ({ fleetData = [], projects = [] }) => {
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL'); // 'ALL' | 'Running' | 'Idle' | 'Down'
  const [selectedPeriod, setSelectedPeriod] = useState('DAILY'); // 'DAILY' | 'WEEKLY' | 'MONTHLY'
  const [selectedMachineForDetail, setSelectedMachineForDetail] = useState(null);

  const hoursArray = useMemo(() => {
    return Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));
  }, []);

  const formatSeconds = (sec) => {
    if (!sec || isNaN(sec)) return "0 dk";
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    if (h > 0) return `${h} sa ${m} dk`;
    return `${m} dk`;
  };

  // Tüm Tezgahların 24 Saatlik Zaman Çizelgesi ve Metrik Verilerini Hesapla
  const fleetTimelines = useMemo(() => {
    return fleetData.map(device => {
      const key = device.ip || device.id;
      const timeline = getMachine24hTimeline(key, selectedDate);
      
      const searchKeys = [device.name, device.systemMachineCode, device.id, device.ip].filter(Boolean);
      let prodJob = null;
      for (const k of searchKeys) {
        prodJob = findActiveProductionJob(k, projects);
        if (prodJob) break;
      }

      const isConn = device.connected !== false;
      const currSt = isConn ? (device.currentState || 'Offline') : 'Offline';

      let runningHours = 0;
      let idleHours = 0;
      let downHours = 0;

      timeline.forEach(item => {
        if (item.state === 'Running') runningHours++;
        else if (item.state === 'Idle') idleHours++;
        else if (item.state === 'Down') downHours++;
      });

      const runningPctVal = (device.runningPct !== undefined && device.runningPct !== null)
        ? (device.runningPct > 1 ? device.runningPct.toFixed(0) : (device.runningPct * 100).toFixed(0))
        : 0;

      const dailyRunSec = device.runningSec || (runningHours * 3600);
      const dailyIdleSec = device.idleSec || (idleHours * 3600);

      // Haftalık ve Aylık çarpanlı projeksiyonlar
      const weeklyRunHours = parseFloat((dailyRunSec * 5.2 / 3600).toFixed(1));
      const monthlyRunHours = parseFloat((dailyRunSec * 22 / 3600).toFixed(1));

      return {
        device,
        key,
        name: device.name || device.ip,
        ip: device.ip,
        group: device.group || 'CNC Dik İşleme',
        currentState: currSt,
        connected: isConn,
        prodJob,
        timeline,
        runningHours,
        idleHours,
        downHours,
        runningSec: dailyRunSec,
        idleSec: dailyIdleSec,
        runningPct: runningPctVal,
        weeklyRunHours,
        monthlyRunHours
      };
    });
  }, [fleetData, projects, selectedDate]);

  // Saatlik Eşzamanlı Çalışan Tezgah Sayısı Analizi (00:00 - 23:00)
  const hourlyConcurrentStats = useMemo(() => {
    const hourlyCounts = Array.from({ length: 24 }, (_, hour) => {
      let runningCount = 0;
      let idleCount = 0;
      let downCount = 0;

      fleetTimelines.forEach(item => {
        const hourData = item.timeline[hour];
        if (hourData) {
          if (hourData.state === 'Running') runningCount++;
          else if (hourData.state === 'Idle') idleCount++;
          else if (hourData.state === 'Down') downCount++;
        }
      });

      return {
        hour: hour.toString().padStart(2, '0'),
        timeLabel: `${hour.toString().padStart(2, '0')}:00`,
        runningCount,
        idleCount,
        downCount,
        totalActive: runningCount + idleCount
      };
    });

    // Ortalama ve Maksimum Eşzamanlı Çalışma
    const activeWorkingHours = hourlyCounts.filter(h => h.runningCount > 0);
    const avgConcurrent = activeWorkingHours.length > 0
      ? (activeWorkingHours.reduce((acc, h) => acc + h.runningCount, 0) / activeWorkingHours.length).toFixed(1)
      : (fleetTimelines.filter(t => t.currentState.toLowerCase() === 'running').length || 1).toFixed(1);

    const peakHour = [...hourlyCounts].sort((a, b) => b.runningCount - a.runningCount)[0] || null;

    return {
      hourlyCounts,
      avgConcurrent,
      peakHour
    };
  }, [fleetTimelines]);

  // Genel Filo Analitik KPI'ları (Seçilen Periyoda Göre)
  const fleetAnalytics = useMemo(() => {
    let totalFleetRunSec = 0;
    let totalFleetIdleSec = 0;
    let runningMachineCount = 0;

    fleetTimelines.forEach(t => {
      if (t.currentState.toLowerCase() === 'running') runningMachineCount++;
      totalFleetRunSec += t.runningSec;
      totalFleetIdleSec += t.idleSec;
    });

    let displayRunHours = (totalFleetRunSec / 3600).toFixed(1);
    let displayIdleHours = (totalFleetIdleSec / 3600).toFixed(1);
    let multiplier = 1;

    if (selectedPeriod === 'WEEKLY') {
      multiplier = 5.2;
      displayRunHours = (parseFloat(displayRunHours) * multiplier).toFixed(1);
      displayIdleHours = (parseFloat(displayIdleHours) * multiplier).toFixed(1);
    } else if (selectedPeriod === 'MONTHLY') {
      multiplier = 22;
      displayRunHours = (parseFloat(displayRunHours) * multiplier).toFixed(1);
      displayIdleHours = (parseFloat(displayIdleHours) * multiplier).toFixed(1);
    }

    const totalWork = parseFloat(displayRunHours) + parseFloat(displayIdleHours);
    const fleetAvailability = totalWork > 0 ? Math.round((parseFloat(displayRunHours) / totalWork) * 100) : 0;

    // En verimli ve en çok çalışan tezgahlar
    const sortedByWork = [...fleetTimelines].sort((a, b) => b.runningSec - a.runningSec);
    const topMachine = sortedByWork[0] || null;

    return {
      runningMachineCount,
      totalMachines: fleetTimelines.length,
      displayRunHours,
      displayIdleHours,
      fleetAvailability,
      topMachine,
      multiplier
    };
  }, [fleetTimelines, selectedPeriod]);

  // Filtrelenmiş Liste
  const filteredFleetTimelines = useMemo(() => {
    return fleetTimelines.filter(item => {
      if (statusFilter !== 'ALL') {
        if (statusFilter === 'Running' && item.currentState.toLowerCase() !== 'running') return false;
        if (statusFilter === 'Idle' && item.currentState.toLowerCase() !== 'idle' && item.currentState.toLowerCase() !== 'idling') return false;
        if (statusFilter === 'Down' && item.currentState.toLowerCase() !== 'down') return false;
      }

      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const mName = (item.name || '').toLowerCase();
        const ip = (item.ip || '').toLowerCase();
        const mold = (item.prodJob?.moldName || '').toLowerCase();
        const task = (item.prodJob?.taskName || '').toLowerCase();
        const cam = (item.prodJob?.camOperatorName || '').toLowerCase();
        return mName.includes(q) || ip.includes(q) || mold.includes(q) || task.includes(q) || cam.includes(q);
      }

      return true;
    });
  }, [fleetTimelines, statusFilter, searchTerm]);

  // Saatlik Blok Rengi
  const getHourBlockStyle = (item) => {
    switch (item.state) {
      case 'Running':
        return 'bg-emerald-500 hover:bg-emerald-400';
      case 'Idle':
        return 'bg-amber-500 hover:bg-amber-400';
      case 'Down':
        return 'bg-red-500 hover:bg-red-400';
      case 'Offline':
        return 'bg-slate-700/80 hover:bg-slate-600';
      default:
        return 'bg-slate-800 hover:bg-slate-700';
    }
  };

  return (
    <div className="space-y-4">
      {/* 1. ÜST ANALİTİK DASHBOARD (METRİKLER & EŞZAMANLI ÇALIŞMA) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        
        {/* Eşzamanlı Çalışan Tezgah */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-800 border dark:border-slate-700 shadow-xs flex flex-col justify-between">
          <span className="text-[10px] font-extrabold text-blue-600 dark:text-blue-400 uppercase tracking-wider flex items-center gap-1">
            <Zap size={13} /> Ortalama Eşzamanlı Tezgah
          </span>
          <div className="text-2xl font-black text-slate-900 dark:text-white mt-1 flex items-baseline justify-between font-mono">
            <span>{hourlyConcurrentStats.avgConcurrent}</span>
            <span className="text-xs font-bold text-slate-400">Tezgah / Saat</span>
          </div>
          <span className="text-[10px] text-slate-400 font-medium mt-1">
            Pik Noktası: {hourlyConcurrentStats.peakHour ? `${hourlyConcurrentStats.peakHour.timeLabel} (${hourlyConcurrentStats.peakHour.runningCount} Tezgah)` : '-'}
          </span>
        </div>

        {/* Toplam Filo Net Çalışma */}
        <div className="p-4 rounded-2xl bg-emerald-500/10 dark:bg-emerald-950/40 border border-emerald-500/30 text-emerald-900 dark:text-emerald-100 shadow-xs flex flex-col justify-between">
          <span className="text-[10px] font-extrabold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
            🟢 Toplam Talaş Kaldırma
          </span>
          <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1 flex items-baseline justify-between font-mono">
            <span>{fleetAnalytics.displayRunHours}</span>
            <span className="text-xs font-bold opacity-80">Saat</span>
          </div>
          <span className="text-[10px] text-emerald-700 dark:text-emerald-300/80 font-medium mt-1">
            {selectedPeriod === 'DAILY' ? 'Bugün (24 Saat)' : (selectedPeriod === 'WEEKLY' ? 'Bu Hafta (5 Gün)' : 'Bu Ay')}
          </span>
        </div>

        {/* Toplam Duruş / Boşta */}
        <div className="p-4 rounded-2xl bg-amber-500/10 dark:bg-amber-950/40 border border-amber-500/30 text-amber-900 dark:text-amber-100 shadow-xs flex flex-col justify-between">
          <span className="text-[10px] font-extrabold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
            🟡 Toplam Duruş / Boşta
          </span>
          <div className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-1 flex items-baseline justify-between font-mono">
            <span>{fleetAnalytics.displayIdleHours}</span>
            <span className="text-xs font-bold opacity-80">Saat</span>
          </div>
          <span className="text-[10px] text-amber-700 dark:text-amber-300/80 font-medium mt-1">
            Ayar, parça bağlama ve boşta bekleme
          </span>
        </div>

        {/* Filo Verimlilik Oranı */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-800 border dark:border-slate-700 shadow-xs flex flex-col justify-between">
          <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
            📊 Filo OEE Verimliliği
          </span>
          <div className="text-2xl font-black text-blue-600 dark:text-blue-400 mt-1 flex items-baseline justify-between font-mono">
            <span>%{fleetAnalytics.fleetAvailability}</span>
            <span className="text-xs font-bold text-slate-400">Kullanılabilirlik</span>
          </div>
          <div className="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden mt-1">
            <div className="bg-blue-600 h-full" style={{ width: `${fleetAnalytics.fleetAvailability}%` }} />
          </div>
        </div>

        {/* En Çok Çalışan Tezgah */}
        <div className="p-4 rounded-2xl bg-purple-500/10 dark:bg-purple-950/40 border border-purple-500/30 text-purple-900 dark:text-purple-100 shadow-xs flex flex-col justify-between">
          <span className="text-[10px] font-extrabold text-purple-600 dark:text-purple-400 uppercase tracking-wider flex items-center gap-1">
            <Award size={13} /> 🏆 En Yüksek Çalışan
          </span>
          <div className="text-lg font-black text-purple-700 dark:text-purple-300 mt-1 truncate">
            {fleetAnalytics.topMachine ? fleetAnalytics.topMachine.name : '-'}
          </div>
          <span className="text-[10px] text-purple-600 dark:text-purple-300/80 font-mono mt-1">
            {fleetAnalytics.topMachine ? `${formatSeconds(fleetAnalytics.topMachine.runningSec * fleetAnalytics.multiplier)} (%${fleetAnalytics.topMachine.runningPct})` : '-'}
          </span>
        </div>

      </div>

      {/* 2. GÖRSEL ANALİTİK GRAFİKLERİ BÖLÜMÜ (EŞZAMANLI ÇALIŞMA & TEZGAH DAĞILIMI) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        
        {/* Grafik 1: 24 Saatlik Eşzamanlı Çalışan Tezgah Sayısı (Bar Chart) */}
        <div className="lg:col-span-2 p-4 rounded-2xl bg-white dark:bg-slate-800 border dark:border-slate-700 shadow-xs space-y-3">
          <div className="flex justify-between items-center border-b dark:border-slate-700 pb-2">
            <div className="flex items-center gap-2">
              <Activity size={16} className="text-blue-500" />
              <span className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider">
                Saatlik Eşzamanlı Çalışan Tezgah Sayısı (Yoğunluk Analizi)
              </span>
            </div>
            <span className="text-[11px] font-bold text-slate-400 font-mono">
              Ort: {hourlyConcurrentStats.avgConcurrent} Tezgah / Saat
            </span>
          </div>

          {/* 24 Saatlik Bar Grafiği */}
          <div className="h-32 flex items-end gap-1 pt-4 pb-2 px-1">
            {hourlyConcurrentStats.hourlyCounts.map((hData) => {
              const maxScale = Math.max(8, fleetTimelines.length / 2);
              const heightPct = Math.min(100, Math.round((hData.runningCount / maxScale) * 100));
              const isPeak = hourlyConcurrentStats.peakHour?.hour === hData.hour && hData.runningCount > 0;

              return (
                <div key={hData.hour} className="flex-1 flex flex-col items-center gap-1 group relative">
                  {/* Tooltip Hover */}
                  <div className="absolute bottom-full mb-1 hidden group-hover:flex flex-col items-center bg-slate-900 text-white text-[10px] p-1.5 rounded-lg shadow-xl z-20 whitespace-nowrap pointer-events-none border border-slate-700">
                    <span className="font-bold">{hData.timeLabel}</span>
                    <span className="text-emerald-400">🟢 {hData.runningCount} Tezgah Çalışıyor</span>
                    <span className="text-amber-400">🟡 {hData.idleCount} Tezgah Boşta</span>
                  </div>

                  {/* Bar Çubuğu */}
                  <div className="w-full bg-slate-100 dark:bg-slate-700/60 rounded-t-md h-24 flex items-end overflow-hidden">
                    <div 
                      className={`w-full transition-all rounded-t-md ${
                        isPeak ? 'bg-emerald-400 shadow-lg shadow-emerald-500/50' : 
                        (hData.runningCount > 0 ? 'bg-blue-500 hover:bg-blue-400' : 'bg-slate-600/30')
                      }`}
                      style={{ height: `${Math.max(6, heightPct)}%` }}
                    />
                  </div>
                  <span className="text-[8px] font-mono text-slate-400">{hData.hour}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Grafik 2: Tezgah Bazında Çalışma & Duruş Oranı Dağılımı (Top Tezgahlar) */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-800 border dark:border-slate-700 shadow-xs space-y-3 flex flex-col justify-between">
          <div className="flex justify-between items-center border-b dark:border-slate-700 pb-2">
            <span className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
              <BarChart3 size={15} className="text-emerald-500" /> Tezgah Verimlilik Sıralaması
            </span>
            <span className="text-[10px] text-slate-400 font-bold">Top 5</span>
          </div>

          <div className="space-y-2.5 flex-1 justify-center flex flex-col">
            {fleetTimelines.slice(0, 5).map(item => {
              return (
                <div key={item.key} className="space-y-1">
                  <div className="flex justify-between text-[11px] font-bold">
                    <span className="font-mono text-slate-800 dark:text-slate-200">{item.name}</span>
                    <span className="font-mono text-emerald-600 dark:text-emerald-400">{formatSeconds(item.runningSec)} (%{item.runningPct})</span>
                  </div>
                  <div className="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden flex">
                    <div className="bg-emerald-500 h-full" style={{ width: `${item.runningPct}%` }} />
                    <div className="bg-amber-500 h-full" style={{ width: `${Math.max(0, 100 - item.runningPct)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </div>

      {/* 3. BAŞLIK, FİLTRE VE DÖNEM SEÇİCİ BARI */}
      <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border dark:border-slate-700 shadow-xs flex flex-col lg:flex-row justify-between items-start lg:items-center gap-3">
        <div>
          <h2 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
            <Clock className="text-blue-500 w-5 h-5" /> Tezgah 24 Saatlik Zaman Çizelgesi (Tek Çizgi Timeline)
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Her tezgahın gün içerisindeki saat saat çalışma çizgisi. Ayrıntı için tezgah satırına tıklayın.
          </p>
        </div>

        {/* Filtreler */}
        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
          {/* Periyot Seçici */}
          <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-700 text-xs">
            <button
              onClick={() => setSelectedPeriod('DAILY')}
              className={`px-3 py-1.5 font-bold rounded-lg transition ${
                selectedPeriod === 'DAILY' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-white'
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
                selectedPeriod === 'MONTHLY' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-white'
              }`}
            >
              🗓️ Aylık
            </button>
          </div>

          {/* Tarih Seçici */}
          <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-900 px-3 py-2 rounded-xl border dark:border-slate-700 text-xs">
            <Calendar size={14} className="text-slate-400" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent font-bold text-slate-800 dark:text-slate-200 outline-none"
            />
          </div>

          {/* Arama Barı */}
          <div className="relative flex-1 sm:w-48">
            <Search size={14} className="absolute left-3 top-2.5 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Tezgah ara..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs font-bold border border-slate-300 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white outline-none"
            />
          </div>
        </div>
      </div>

      {/* 4. TEZGAHLAR İÇİN TEK SATIR (SINGLE-ROW) TIMELINE MATRIX */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border dark:border-slate-800 shadow-xs overflow-hidden">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left text-xs border-collapse min-w-[950px]">
            {/* 24 Saatlik Kolon Başlıkları */}
            <thead>
              <tr className="bg-slate-100 dark:bg-slate-800 border-b dark:border-slate-700 text-slate-500 dark:text-slate-400 font-extrabold text-[10px]">
                <th className="p-3 w-56">TEZGAH & BAĞLI İŞ</th>
                <th className="p-3 text-center">
                  <div className="flex justify-between text-[9px] font-mono px-1">
                    <span>00:00</span>
                    <span>04:00</span>
                    <span>08:00</span>
                    <span>12:00</span>
                    <span>16:00</span>
                    <span>20:00</span>
                    <span>23:59</span>
                  </div>
                </th>
                <th className="p-3 text-right w-36">SÜRE & VERİM</th>
              </tr>
            </thead>

            {/* Tezgah Satırları (Her Tezgah Tek Satır Timeline Çizgisi) */}
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-medium">
              {filteredFleetTimelines.map(item => {
                const isSelected = selectedMachineForDetail?.key === item.key;
                const isRunning = item.currentState.toLowerCase() === 'running';

                return (
                  <tr 
                    key={item.key} 
                    onClick={() => setSelectedMachineForDetail(isSelected ? null : item)}
                    className={`cursor-pointer transition hover:bg-slate-50 dark:hover:bg-slate-800/80 ${
                      isSelected ? 'bg-blue-50/70 dark:bg-blue-950/40 border-l-4 border-l-blue-500' : ''
                    }`}
                  >
                    {/* 1. Kolon: Tezgah Bilgisi & Anlık Durum */}
                    <td className="p-2.5 w-56">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${isRunning ? 'bg-emerald-500 animate-ping' : 'bg-slate-400'}`} />
                          <span className="font-mono font-black text-slate-900 dark:text-white text-xs">
                            {item.name}
                          </span>
                          <span className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase ${
                            isRunning ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-slate-700 text-slate-400'
                          }`}>
                            {item.currentState}
                          </span>
                        </div>

                        {item.prodJob ? (
                          <div className="text-[10px] text-blue-600 dark:text-blue-400 font-bold truncate max-w-[200px]" title={`${item.prodJob.moldName} - ${item.prodJob.taskName}`}>
                            {item.prodJob.moldName} ({item.prodJob.taskName})
                          </div>
                        ) : (
                          <span className="text-[9px] text-slate-400 italic">Boşta</span>
                        )}
                      </div>
                    </td>

                    {/* 2. Kolon: TEK SATIR KESİNTİSİZ ZAMAN ÇİZGİSİ (SINGLE BAR TIMELINE) */}
                    <td className="p-2.5">
                      <div className="w-full h-5 rounded-md bg-slate-800/60 overflow-hidden flex gap-[1px] p-[1px] border border-slate-700/50 shadow-inner">
                        {item.timeline.map((hBlock) => {
                          const blockCls = getHourBlockStyle(hBlock);
                          return (
                            <div
                              key={hBlock.hour}
                              className={`flex-1 h-full transition-all rounded-[2px] ${blockCls}`}
                              title={`${item.name} | Saat: ${hBlock.timeLabel} | Durum: ${hBlock.state || 'Veri Yok'}`}
                            />
                          );
                        })}
                      </div>
                    </td>

                    {/* 3. Kolon: Günlük Çalışma Saati ve Verim */}
                    <td className="p-2.5 text-right w-36 font-mono">
                      <div className="text-xs font-black text-emerald-600 dark:text-emerald-400">
                        {formatSeconds(item.runningSec * (selectedPeriod === 'WEEKLY' ? 5.2 : (selectedPeriod === 'MONTHLY' ? 22 : 1)))}
                      </div>
                      <div className="text-[9px] text-slate-400 font-bold">
                        Verim: <b className="text-slate-200">%{item.runningPct}</b>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 5. SEÇİLİ TEZGAHIN SAATLİK DETAYI (DRAWER / KUTU) */}
      {selectedMachineForDetail && (
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-800 border-2 border-blue-500/40 shadow-xl space-y-4 animate-fadeIn">
          <div className="flex justify-between items-start border-b dark:border-slate-700 pb-3">
            <div>
              <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                <Monitor className="text-blue-500 w-5 h-5" /> {selectedMachineForDetail.name} — Saatlik Kayıt Defteri ({selectedDate})
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                IP: <b>{selectedMachineForDetail.ip}</b> • Grup: <b>{selectedMachineForDetail.group}</b>
              </p>
            </div>
            <button
              onClick={() => setSelectedMachineForDetail(null)}
              className="text-slate-400 hover:text-white p-1 rounded-lg"
            >
              <X size={20} />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 font-mono text-xs">
              <span className="text-[10px] text-emerald-400 font-bold uppercase block">🟢 Günlük Net Çalışma</span>
              <span className="text-lg font-black text-emerald-400 mt-1 block">{formatSeconds(selectedMachineForDetail.runningSec)}</span>
            </div>

            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 font-mono text-xs">
              <span className="text-[10px] text-amber-400 font-bold uppercase block">🟡 Günlük Duruş / Boşta</span>
              <span className="text-lg font-black text-amber-400 mt-1 block">{formatSeconds(selectedMachineForDetail.idleSec)}</span>
            </div>

            <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-900 border dark:border-slate-700 font-mono text-xs">
              <span className="text-[10px] text-slate-400 font-bold uppercase block">📊 Günlük Verimlilik</span>
              <span className="text-lg font-black text-blue-400 mt-1 block">%{selectedMachineForDetail.runningPct}</span>
            </div>
          </div>

          {/* Saat Saat Detay Tablosu */}
          <div className="overflow-x-auto rounded-xl border dark:border-slate-700">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100 dark:bg-slate-900 text-slate-500 font-extrabold uppercase text-[10px]">
                  <th className="p-2.5">Zaman Aralığı</th>
                  <th className="p-2.5">Durum</th>
                  <th className="p-2.5">Örneklem Sayısı</th>
                  <th className="p-2.5">Spindle / Devir</th>
                  <th className="p-2.5">İlerleme (Feed)</th>
                  <th className="p-2.5">NC Program</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700 font-mono">
                {selectedMachineForDetail.timeline.map((h, i) => (
                  <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                    <td className="p-2.5 font-bold text-slate-300">{h.timeLabel}</td>
                    <td className="p-2.5">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                        h.state === 'Running' ? 'bg-emerald-500/20 text-emerald-400' :
                        (h.state === 'Idle' ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-700 text-slate-400')
                      }`}>
                        {h.state || 'Veri Yok'}
                      </span>
                    </td>
                    <td className="p-2.5 text-slate-400">{h.samples} örnek</td>
                    <td className="p-2.5 text-emerald-400">{h.spindleRpm ? `${h.spindleRpm} RPM` : '-'}</td>
                    <td className="p-2.5 text-blue-400">{h.feedrate ? `${h.feedrate} mm/dk` : '-'}</td>
                    <td className="p-2.5 text-amber-400 text-[11px] truncate max-w-[200px]">{h.program || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
};

export default OeeMachineLogbookTab;
