// src/components/OEE/OeePartTrackingTab.jsx
import React, { useState, useMemo } from 'react';
import { 
  Box, CheckCircle2, Clock, PlayCircle, PauseCircle, 
  Search, Filter, User, Layers, Calendar, Check, 
  AlertTriangle, ArrowUpRight, BarChart3, TrendingUp,
  Cpu, Wrench, ChevronRight, Sparkles, PieChart, X,
  ArrowRight
} from 'lucide-react';
import { cleanMachineCode } from '../../services/oeeTrackingService.js';

export const OeePartTrackingTab = ({
  fleetData = [],
  projects = [],
  personnel = []
}) => {
  // Arama ve Seçili Kalıp (İlk açılışta tamamen boş)
  const [moldSearchTerm, setMoldSearchTerm] = useState('');
  const [selectedMold, setSelectedMold] = useState(null);
  const [statusFilter, setStatusFilter] = useState('ALL'); // 'ALL' | 'ÇALIŞIYOR' | 'TAMAMLANDI' | 'BEKLİYOR'

  // Canlı Filo Haritası (IP ve İsim Bazlı Sayaçlar)
  const fleetMap = useMemo(() => {
    const map = new Map();
    fleetData.forEach(d => {
      const k1 = cleanMachineCode(d.name);
      const k2 = cleanMachineCode(d.ip);
      const k3 = cleanMachineCode(d.id);
      if (k1) map.set(k1, d);
      if (k2) map.set(k2, d);
      if (k3) map.set(k3, d);
    });
    return map;
  }, [fleetData]);

  const formatSeconds = (sec) => {
    if (!sec || isNaN(sec)) return "0 dk";
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    if (h > 0) return `${h} sa ${m} dk`;
    return `${m} dk`;
  };

  // "İçersin" (Contains) Mantığı ile Eşleşen Kalıplar Listesi
  const searchResults = useMemo(() => {
    if (!moldSearchTerm.trim()) return [];
    const q = moldSearchTerm.toLowerCase().trim();

    return projects.filter(p => {
      const mName = (p.moldName || p.name || '').toLowerCase();
      const pNum = String(p.projectNumber || '').toLowerCase();
      const cust = (p.customer || '').toLowerCase();
      const desc = (p.description || '').toLowerCase();
      return mName.includes(q) || pNum.includes(q) || cust.includes(q) || desc.includes(q);
    }).slice(0, 20); // İlk 20 eşleşeni öner
  }, [projects, moldSearchTerm]);

  // Seçili Kalıbın Parçaları ve Gerçek Süreleri
  const moldParts = useMemo(() => {
    if (!selectedMold || !selectedMold.tasks) return [];

    const tasks = selectedMold.tasks || [];
    return tasks.map(task => {
      const ops = task.operations || [];
      const activeOp = ops.find(o => o.status === 'ÇALIŞIYOR' || o.status === 'IN_PROGRESS' || o.status === 'RUNNING') || ops[0] || null;

      const machineName = activeOp?.machineName || activeOp?.machine || task.assignedMachine || task.machine || '-';
      const cleanM = cleanMachineCode(machineName);
      const liveDevice = cleanM ? fleetMap.get(cleanM) : null;

      const camOp = task.assignedOperator || task.camOperator || task.camPreparation?.operator || activeOp?.camOperator || activeOp?.assignedOperator || activeOp?.operator || 'Belirtilmedi';
      const machineOp = activeOp?.machineOperator || activeOp?.operator || '-';

      // Durum Tespiti
      let status = 'BEKLİYOR';
      if (activeOp && (activeOp.status === 'ÇALIŞIYOR' || activeOp.status === 'IN_PROGRESS' || activeOp.status === 'RUNNING')) {
        status = 'ÇALIŞIYOR';
      } else if (task.status === 'TAMAMLANDI' || (ops.length > 0 && ops.every(o => o.status === 'COMPLETED' || o.status === 'TAMAMLANDI'))) {
        status = 'TAMAMLANDI';
      } else if (task.status === 'ÇALIŞIYOR') {
        status = 'ÇALIŞIYOR';
      }

      // Gerçek Süreler (Canlı telemetri veya operasyon kayıtları)
      let runningSec = 0;
      let idleSec = 0;

      if (liveDevice && status === 'ÇALIŞIYOR') {
        runningSec = liveDevice.runningSec || 0;
        idleSec = (liveDevice.idleSec || 0) + (liveDevice.downSec || 0);
      } else {
        runningSec = (parseFloat(task.actualCamTime || activeOp?.actualDuration || 0)) * 3600;
        idleSec = (parseFloat(activeOp?.idleDuration || 0)) * 3600;
      }

      const progress = parseFloat(activeOp?.progressPercentage || task.progress || (status === 'TAMAMLANDI' ? 100 : 0)) || 0;

      return {
        id: task.id,
        taskName: task.taskName || task.name || task.partName || 'İsimsiz Parça',
        taskNumber: task.taskNumber || '',
        operationName: activeOp?.name || activeOp?.type || 'CNC İşleme',
        machineName,
        liveDevice,
        camOperator: camOp,
        machineOperator: machineOp,
        status,
        progress,
        runningSec,
        idleSec,
        startDate: activeOp?.startTime || task.startDate || null
      };
    });
  }, [selectedMold, fleetMap]);

  // Seçili Kalıbın KPI Özeti
  const moldSummary = useMemo(() => {
    if (!selectedMold) return null;

    let totalParts = moldParts.length;
    let completedParts = 0;
    let workingParts = 0;
    let waitingParts = 0;
    let totalRunningSec = 0;
    let totalIdleSec = 0;

    moldParts.forEach(p => {
      if (p.status === 'TAMAMLANDI') completedParts++;
      else if (p.status === 'ÇALIŞIYOR') workingParts++;
      else waitingParts++;

      totalRunningSec += p.runningSec;
      totalIdleSec += p.idleSec;
    });

    const totalWorkSec = totalRunningSec + totalIdleSec;
    const efficiencyPct = totalWorkSec > 0 ? Math.round((totalRunningSec / totalWorkSec) * 100) : 0;
    const progressPct = totalParts > 0 ? Math.round((completedParts / totalParts) * 100) : 0;

    return {
      totalParts,
      completedParts,
      workingParts,
      waitingParts,
      totalRunningSec,
      totalIdleSec,
      totalHours: (totalRunningSec / 3600).toFixed(1),
      efficiencyPct,
      progressPct
    };
  }, [selectedMold, moldParts]);

  // Filtrelenmiş Parça Listesi
  const filteredParts = useMemo(() => {
    if (statusFilter === 'ALL') return moldParts;
    return moldParts.filter(p => p.status === statusFilter);
  }, [moldParts, statusFilter]);

  const handleSelectMold = (proj) => {
    setSelectedMold(proj);
    setMoldSearchTerm('');
  };

  const handleClearSelection = () => {
    setSelectedMold(null);
    setMoldSearchTerm('');
    setStatusFilter('ALL');
  };

  return (
    <div className="space-y-4">
      {/* 1. ÜST ARAMA VE KALIP SEÇİCİ BARI */}
      <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border dark:border-slate-700 shadow-xs flex flex-col md:flex-row justify-between items-stretch md:items-center gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-blue-500/10 text-blue-600 dark:text-blue-400 shrink-0">
            <Box size={24} />
          </div>
          <div>
            <h2 className="text-base font-black text-slate-900 dark:text-white">
              Kalıp & Parça Gerçek Süre Özeti
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              İncelemek istediğiniz kalıbı yazarak arayın veya listeden seçin.
            </p>
          </div>
        </div>

        {/* Yazarak Arama ve Kalıp Seçimi Barı */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Arama Kutusu (İçersin mantığı) */}
          <div className="relative flex-1 sm:w-80">
            <Search size={16} className="absolute left-3 top-3 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Kalıp adı veya no yazarak ara... (Örn: 3334)"
              value={moldSearchTerm}
              onChange={(e) => setMoldSearchTerm(e.target.value)}
              className="w-full pl-9 pr-8 py-2.5 text-xs font-bold border border-slate-300 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-slate-400"
            />
            {moldSearchTerm && (
              <button
                onClick={() => setMoldSearchTerm('')}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-200"
              >
                <X size={15} />
              </button>
            )}
          </div>

          {/* Hızlı Seçim Dropdown */}
          <select
            value={selectedMold ? selectedMold.id : ''}
            onChange={(e) => {
              const found = projects.find(p => p.id === e.target.value);
              if (found) handleSelectMold(found);
              else handleClearSelection();
            }}
            className="p-2.5 text-xs font-bold border border-slate-300 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-900 text-blue-600 dark:text-blue-400 outline-none focus:ring-2 focus:ring-blue-500 max-w-[240px]"
          >
            <option value="">Kalıp Listesinden Seçiniz...</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>
                {p.moldName || p.name || `Kalıp #${p.projectNumber}`}
              </option>
            ))}
          </select>

          {selectedMold && (
            <button
              onClick={handleClearSelection}
              className="py-2.5 px-3 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-slate-700 dark:text-slate-200 font-bold text-xs rounded-xl flex items-center gap-1 transition shrink-0"
              title="Seçimi Temizle"
            >
              <X size={14} /> Temizle
            </button>
          )}
        </div>
      </div>

      {/* 2. ARAMA SONUÇLARI ÖNERİ LİSTESİ (Kullanıcı arama yaptığında açılır) */}
      {moldSearchTerm.trim() && !selectedMold && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border dark:border-slate-700 shadow-md p-4 space-y-2 animate-fadeIn">
          <div className="flex justify-between items-center text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            <span>🔍 Arama Sonuçları ({searchResults.length} Kalıp Bulundu):</span>
            <span>Bir kalıba tıklayarak detayları açın</span>
          </div>

          {searchResults.length === 0 ? (
            <div className="py-6 text-center text-slate-400 text-xs font-bold">
              "{moldSearchTerm}" ile eşleşen kalıp bulunamadı.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-64 overflow-y-auto custom-scrollbar">
              {searchResults.map(p => (
                <div
                  key={p.id}
                  onClick={() => handleSelectMold(p)}
                  className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/80 hover:bg-blue-50 dark:hover:bg-blue-950/40 border border-slate-200 dark:border-slate-700 hover:border-blue-500/50 cursor-pointer transition flex items-center justify-between group"
                >
                  <div className="space-y-0.5 truncate pr-2">
                    <span className="text-xs font-black text-slate-900 dark:text-white group-hover:text-blue-500 transition block truncate">
                      {p.moldName || p.name || `Kalıp #${p.projectNumber}`}
                    </span>
                    <span className="text-[11px] text-slate-400 font-medium block truncate">
                      {p.customer ? `${p.customer} • ` : ''}{p.tasks?.length || 0} Parça
                    </span>
                  </div>
                  <ArrowRight size={16} className="text-slate-400 group-hover:text-blue-500 group-hover:translate-x-1 transition shrink-0" />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 3. EĞER HİÇBİR KALIP SEÇİLİ DEĞİLSE BOŞ DURUM EKRANI */}
      {!selectedMold && !moldSearchTerm.trim() && (
        <div className="p-16 text-center bg-white dark:bg-slate-800 rounded-3xl border dark:border-slate-700 shadow-xs space-y-4">
          <div className="w-16 h-16 rounded-3xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto">
            <Search size={32} />
          </div>
          <div className="max-w-md mx-auto space-y-1.5">
            <h3 className="text-base font-black text-slate-900 dark:text-white">
              İncelemek İstediğiniz Kalıbı Seçin
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Binlerce parça arasında kaybolmamak için yukarıdaki arama kutusuna kalıp adı/numarası yazabilir veya açılır menüden istediğiniz kalıbı seçebilirsiniz.
            </p>
          </div>

          {/* Hızlı Popüler / Aktif Kalıplar Önerisi */}
          {projects.length > 0 && (
            <div className="pt-4 max-w-2xl mx-auto space-y-2">
              <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider block">
                Örnek / Aktif Kalıplar:
              </span>
              <div className="flex flex-wrap justify-center gap-2">
                {projects.slice(0, 6).map(p => (
                  <button
                    key={p.id}
                    onClick={() => handleSelectMold(p)}
                    className="py-1.5 px-3 rounded-xl bg-slate-100 dark:bg-slate-900 hover:bg-blue-600 hover:text-white text-slate-700 dark:text-slate-300 text-xs font-bold transition border border-slate-200 dark:border-slate-700"
                  >
                    🎯 {p.moldName || p.name || `Kalıp #${p.projectNumber}`}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 4. SEÇİLEN KALIBIN GENEL ÖZETİ & DETAYLI PARÇA TABLOSU */}
      {selectedMold && moldSummary && (
        <div className="space-y-4 animate-fadeIn">
          
          {/* SEÇİLİ KALIP BİLGİ BARI */}
          <div className="p-4 rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/20 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-extrabold uppercase bg-white/20 px-2 py-0.5 rounded-md">Seçili Kalıp</span>
                <h3 className="text-lg font-black tracking-tight">
                  {selectedMold.moldName || selectedMold.name || `Kalıp #${selectedMold.projectNumber}`}
                </h3>
              </div>
              <p className="text-xs text-blue-100 mt-0.5">
                {selectedMold.customer ? `Müşteri: ${selectedMold.customer} • ` : ''}Toplam {moldSummary.totalParts} Parça
              </p>
            </div>

            <button
              onClick={handleClearSelection}
              className="py-2 px-3.5 bg-white/15 hover:bg-white/25 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 transition border border-white/20"
            >
              <X size={14} /> Başka Kalıp Seç
            </button>
          </div>

          {/* KALIP KPI KARTLARI */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-800 border dark:border-slate-700 shadow-xs flex flex-col justify-between">
              <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Toplam Parça</span>
              <div className="text-2xl font-black text-slate-900 dark:text-white mt-1 flex items-baseline justify-between">
                <span>{moldSummary.totalParts}</span>
                <span className="text-[11px] font-bold text-slate-400">Parça</span>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-emerald-500/10 dark:bg-emerald-950/40 border border-emerald-500/30 text-emerald-900 dark:text-emerald-100 shadow-xs flex flex-col justify-between">
              <span className="text-[10px] font-extrabold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">🟢 Gerçek Net Çalışma</span>
              <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1 flex items-baseline justify-between font-mono">
                <span>{formatSeconds(moldSummary.totalRunningSec)}</span>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-amber-500/10 dark:bg-amber-950/40 border border-amber-500/30 text-amber-900 dark:text-amber-100 shadow-xs flex flex-col justify-between">
              <span className="text-[10px] font-extrabold text-amber-600 dark:text-amber-400 uppercase tracking-wider">🟡 Toplam Duruş / Boşta</span>
              <div className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-1 flex items-baseline justify-between font-mono">
                <span>{formatSeconds(moldSummary.totalIdleSec)}</span>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-blue-500/10 dark:bg-blue-950/40 border border-blue-500/30 text-blue-900 dark:text-blue-100 shadow-xs flex flex-col justify-between">
              <span className="text-[10px] font-extrabold text-blue-600 dark:text-blue-400 uppercase tracking-wider">⚙️ İşlenen Parçalar</span>
              <div className="text-2xl font-black text-blue-600 dark:text-blue-400 mt-1 flex items-baseline justify-between">
                <span>{moldSummary.workingParts}</span>
                <span className="text-[11px] font-bold opacity-80">Tezgahta</span>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-purple-500/10 dark:bg-purple-950/40 border border-purple-500/30 text-purple-900 dark:text-purple-100 shadow-xs flex flex-col justify-between">
              <span className="text-[10px] font-extrabold text-purple-600 dark:text-purple-400 uppercase tracking-wider">✅ Biten Parçalar</span>
              <div className="text-2xl font-black text-purple-600 dark:text-purple-400 mt-1 flex items-baseline justify-between">
                <span>{moldSummary.completedParts}</span>
                <span className="text-[11px] font-bold opacity-80">/{moldSummary.totalParts}</span>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-800 border dark:border-slate-700 shadow-xs flex flex-col justify-between">
              <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">İşleme Verimliliği</span>
              <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1 flex items-baseline justify-between font-mono">
                <span>%{moldSummary.efficiencyPct}</span>
                <span className="text-[11px] font-bold text-slate-400">Verim</span>
              </div>
            </div>
          </div>

          {/* DURUM FİLTRE BUTONLARI */}
          <div className="bg-white dark:bg-slate-800 p-3 rounded-2xl border dark:border-slate-700 shadow-xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-700 text-xs">
              <button
                onClick={() => setStatusFilter('ALL')}
                className={`px-3 py-1.5 font-bold rounded-lg transition ${
                  statusFilter === 'ALL' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Tüm Parçalar ({moldSummary.totalParts})
              </button>
              <button
                onClick={() => setStatusFilter('ÇALIŞIYOR')}
                className={`px-3 py-1.5 font-bold rounded-lg transition ${
                  statusFilter === 'ÇALIŞIYOR' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                🟢 Tezgahta İşlenenler ({moldSummary.workingParts})
              </button>
              <button
                onClick={() => setStatusFilter('BEKLİYOR')}
                className={`px-3 py-1.5 font-bold rounded-lg transition ${
                  statusFilter === 'BEKLİYOR' ? 'bg-amber-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                ⏳ Sıradaki / Bekleyenler ({moldSummary.waitingParts})
              </button>
              <button
                onClick={() => setStatusFilter('TAMAMLANDI')}
                className={`px-3 py-1.5 font-bold rounded-lg transition ${
                  statusFilter === 'TAMAMLANDI' ? 'bg-purple-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                ✅ Tamamlananlar ({moldSummary.completedParts})
              </button>
            </div>

            <span className="text-xs text-slate-400 font-bold pr-2">
              Toplam <b>{filteredParts.length}</b> parça listeleniyor
            </span>
          </div>

          {/* PARÇA LİSTESİ VE GERÇEK SÜRELER TABLOSU */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border dark:border-slate-700 shadow-xs overflow-hidden">
            {filteredParts.length === 0 ? (
              <div className="p-12 text-center text-slate-400 font-bold space-y-2">
                <Box size={32} className="mx-auto text-slate-400" />
                <p>Bu filtreye uygun parça kaydı bulunamadı.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-900 border-b dark:border-slate-700 text-slate-500 dark:text-slate-400 font-extrabold uppercase text-[10px] tracking-wider">
                      <th className="p-3">Parça / İş Emri</th>
                      <th className="p-3">Operasyon</th>
                      <th className="p-3">Tezgah</th>
                      <th className="p-3">CAM Operatörü</th>
                      <th className="p-3">Tezgah Operatörü</th>
                      <th className="p-3">Durum</th>
                      <th className="p-3 text-right">🟢 Gerçek Çalışma</th>
                      <th className="p-3 text-right">🟡 Gerçek Duruş</th>
                      <th className="p-3 text-right">İlerleme %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700 font-medium">
                    {filteredParts.map(part => {
                      return (
                        <tr key={part.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-750 transition">
                          
                          {/* Parça Adı */}
                          <td className="p-3">
                            <div className="flex items-center gap-1.5">
                              <span className="font-black text-slate-900 dark:text-white text-xs">
                                {part.taskName}
                              </span>
                              {part.taskNumber && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 font-mono text-slate-500">
                                  #{part.taskNumber}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Operasyon */}
                          <td className="p-3 text-slate-600 dark:text-slate-300 font-bold">
                            {part.operationName}
                          </td>

                          {/* Tezgah */}
                          <td className="p-3 font-mono font-black text-blue-600 dark:text-blue-400">
                            {part.machineName}
                          </td>

                          {/* CAM Operatörü */}
                          <td className="p-3">
                            <span className="px-2 py-0.5 rounded-full bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 font-bold text-[11px]">
                              {part.camOperator}
                            </span>
                          </td>

                          {/* Tezgah Operatörü */}
                          <td className="p-3 text-slate-600 dark:text-slate-300">
                            {part.machineOperator}
                          </td>

                          {/* Durum Rozeti */}
                          <td className="p-3">
                            <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${
                              part.status === 'ÇALIŞIYOR'
                                ? 'bg-emerald-600 text-white animate-pulse'
                                : (part.status === 'TAMAMLANDI' ? 'bg-purple-600 text-white' : 'bg-amber-500 text-white')
                            }`}>
                              {part.status}
                            </span>
                          </td>

                          {/* Gerçek Net Çalışma Süresi */}
                          <td className="p-3 text-right font-mono font-black text-emerald-600 dark:text-emerald-400 text-sm">
                            {formatSeconds(part.runningSec)}
                          </td>

                          {/* Gerçek Duruş Süresi */}
                          <td className="p-3 text-right font-mono font-bold text-amber-600 dark:text-amber-400">
                            {formatSeconds(part.idleSec)}
                          </td>

                          {/* İlerleme Barı */}
                          <td className="p-3 text-right">
                            <div className="flex flex-col items-end gap-1">
                              <span className="font-mono font-black text-blue-600 dark:text-blue-400">
                                %{part.progress.toFixed(0)}
                              </span>
                              <div className="w-20 bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
                                <div 
                                  className="bg-blue-600 h-full transition-all" 
                                  style={{ width: `${part.progress}%` }} 
                                />
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>
      )}

    </div>
  );
};

export default OeePartTrackingTab;
