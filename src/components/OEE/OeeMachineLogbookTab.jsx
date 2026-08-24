// src/components/OEE/OeeMachineLogbookTab.jsx
import React, { useState, useMemo } from 'react';
import { 
  Calendar, Clock, PlayCircle, PauseCircle, WifiOff, 
  AlertTriangle, ChevronRight, BarChart3, Layers, 
  CheckCircle2, ArrowUpRight, Filter, Monitor, Search,
  X, ShieldAlert, User, Box, Zap
} from 'lucide-react';
import { getMachine24hTimeline, findActiveProductionJob } from '../../services/oeeTrackingService.js';

export const OeeMachineLogbookTab = ({ fleetData = [], projects = [] }) => {
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL'); // 'ALL' | 'Running' | 'Idle' | 'Down'
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

  // Tüm Tezgahların 24 Saatlik Zaman Çizelgesi Verilerini Hesapla
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
        runningSec: device.runningSec || (runningHours * 3600),
        idleSec: device.idleSec || (idleHours * 3600),
        runningPct: runningPctVal
      };
    });
  }, [fleetData, projects, selectedDate]);

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
        return 'bg-emerald-500 hover:bg-emerald-400 text-white';
      case 'Idle':
        return 'bg-amber-500 hover:bg-amber-400 text-white';
      case 'Down':
        return 'bg-red-500 hover:bg-red-400 text-white';
      case 'Offline':
        return 'bg-slate-700 hover:bg-slate-600 text-slate-400';
      default:
        return 'bg-slate-800 hover:bg-slate-700 text-slate-500';
    }
  };

  return (
    <div className="space-y-4">
      {/* 1. ÜST KONTROL, ARAMA VE RENK LEJANTI */}
      <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border dark:border-slate-700 shadow-xs flex flex-col lg:flex-row justify-between items-start lg:items-center gap-3">
        <div>
          <h2 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
            <Calendar className="text-blue-500 w-5 h-5" /> Tezgah Günlük & Saatlik Kayıt Defteri (24s Zaman Çizelgesi)
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Tüm tezgahların 24 saatlik çalışma, duruş ve verimlilik zaman şeritleri (Gantt Çizelgesi).
          </p>
        </div>

        {/* Aksiyon Butonları & Arama */}
        <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
          {/* Tarih Seçici */}
          <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-900 px-3 py-2 rounded-xl border dark:border-slate-700 text-xs">
            <Clock size={14} className="text-slate-400" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent font-bold text-slate-800 dark:text-slate-200 outline-none"
            />
          </div>

          {/* Durum Filtresi */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="p-2 text-xs font-bold border border-slate-300 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 outline-none"
          >
            <option value="ALL">Tüm Durumlar ({fleetTimelines.length})</option>
            <option value="Running">🟢 Sadece Çalışanlar</option>
            <option value="Idle">🟡 Sadece Boşta Olanlar</option>
            <option value="Down">🔴 Sadece Alarmlar</option>
          </select>

          {/* Arama Barı */}
          <div className="relative flex-1 sm:w-56">
            <Search size={14} className="absolute left-3 top-3 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Tezgah veya parça ara..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-2 text-xs font-bold border border-slate-300 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white outline-none"
            />
          </div>
        </div>
      </div>

      {/* RENK LEJANTI (AÇIKLAMA) */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-900/70 border dark:border-slate-800 text-xs">
        <div className="flex flex-wrap items-center gap-4">
          <span className="flex items-center gap-1.5 font-bold text-slate-700 dark:text-slate-300">
            <span className="w-3 h-3 rounded-md bg-emerald-500 inline-block" /> 🟢 Çalışıyor (Talaş Kaldırma)
          </span>
          <span className="flex items-center gap-1.5 font-bold text-slate-700 dark:text-slate-300">
            <span className="w-3 h-3 rounded-md bg-amber-500 inline-block" /> 🟡 Boşta / Duruş
          </span>
          <span className="flex items-center gap-1.5 font-bold text-slate-700 dark:text-slate-300">
            <span className="w-3 h-3 rounded-md bg-red-500 inline-block" /> 🔴 Alarm / Problem
          </span>
          <span className="flex items-center gap-1.5 font-bold text-slate-700 dark:text-slate-300">
            <span className="w-3 h-3 rounded-md bg-slate-700 inline-block" /> 🔌 Çevrimdışı / Kapalı
          </span>
        </div>
        <span className="text-[11px] text-slate-400 font-bold">
          * Detaylarını görmek için herhangi bir tezgah satırına tıklayın.
        </span>
      </div>

      {/* 2. TÜM TEZGAHLARIN ZAMAN ŞERİDİ MATRİSİ (GANTT TABLOSU) */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border dark:border-slate-800 shadow-xs overflow-hidden">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left text-xs border-collapse min-w-[1000px]">
            {/* 24 Saatlik Kolon Başlıkları (00:00 - 23:00) */}
            <thead>
              <tr className="bg-slate-100 dark:bg-slate-800 border-b dark:border-slate-700 text-slate-500 dark:text-slate-400 font-extrabold text-[10px]">
                <th className="p-3 w-64">TEZGAH & AKTİF İŞ</th>
                <th className="p-3 text-center">
                  <div className="grid grid-cols-24 gap-0.5 text-[9px] font-mono">
                    {hoursArray.map(h => (
                      <span key={h} className="text-center truncate" title={`${h}:00`}>{h}</span>
                    ))}
                  </div>
                </th>
                <th className="p-3 text-right w-40">24s ÇALIŞMA / VERİM</th>
              </tr>
            </thead>

            {/* Tezgah Satırları */}
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
                    <td className="p-3 w-64">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${isRunning ? 'bg-emerald-500 animate-ping' : 'bg-slate-400'}`} />
                          <span className="font-mono font-black text-slate-900 dark:text-white text-sm">
                            {item.name}
                          </span>
                          <span className={`text-[9px] font-black px-1.5 py-0.5 rounded uppercase ${
                            isRunning ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-slate-700 text-slate-400'
                          }`}>
                            {item.currentState}
                          </span>
                        </div>

                        {item.prodJob ? (
                          <div className="text-[11px] text-blue-600 dark:text-blue-400 font-bold truncate max-w-[220px]" title={`${item.prodJob.moldName} - ${item.prodJob.taskName}`}>
                            {item.prodJob.moldName} ({item.prodJob.taskName})
                          </div>
                        ) : (
                          <span className="text-[10px] text-slate-400 italic">Boşta</span>
                        )}
                      </div>
                    </td>

                    {/* 2. Kolon: 24 Saatlik Renkli Çubuk (Timeline Bar) */}
                    <td className="p-3">
                      <div className="grid grid-cols-24 gap-1 h-7">
                        {item.timeline.map((hBlock) => {
                          const blockCls = getHourBlockStyle(hBlock);
                          return (
                            <div
                              key={hBlock.hour}
                              className={`rounded-md flex items-center justify-center text-[9px] font-bold font-mono transition-transform hover:scale-110 shadow-2xs ${blockCls}`}
                              title={`${item.name} | Saat: ${hBlock.timeLabel} | Durum: ${hBlock.state || 'Veri Yok'}`}
                            >
                              {hBlock.state === 'Running' ? '✓' : ''}
                            </div>
                          );
                        })}
                      </div>
                    </td>

                    {/* 3. Kolon: Günlük Çalışma Saati ve Verim */}
                    <td className="p-3 text-right w-40 font-mono">
                      <div className="text-xs font-black text-emerald-600 dark:text-emerald-400">
                        {formatSeconds(item.runningSec)}
                      </div>
                      <div className="text-[10px] text-slate-400 font-bold">
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

      {/* 3. SEÇİLİ TEZGAHIN SAATLİK DETAYI (DRAWER / KUTU) */}
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
