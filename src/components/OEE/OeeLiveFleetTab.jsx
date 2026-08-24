// src/components/OEE/OeeLiveFleetTab.jsx
import React, { useState } from 'react';
import { 
  PlayCircle, PauseCircle, WifiOff, AlertTriangle, 
  Search, Sliders, CheckSquare, Square, Clock,
  User, Box, ShieldAlert, ChevronRight, Layers,
  Check, X, Sparkles, Plus, Eye
} from 'lucide-react';
import { 
  getMetricVisibilityConfig, saveMetricVisibilityConfig, DEFAULT_METRIC_CONFIG,
  findActiveProductionJob
} from '../../services/oeeTrackingService.js';

export const OeeLiveFleetTab = ({
  fleetData = [],
  projects = [],
  activeAssignments = [],
  filterState = 'ALL',
  setFilterState,
  searchQuery = '',
  setSearchQuery,
  selectedGroup = 'ALL',
  setSelectedGroup,
  availableGroups = [],
  counts = {},
  onSelectDevice,
  onOpenAssignModal,
  onOpenAliasModal
}) => {
  // Metrik Görünürlük Ayarları State
  const [isMetricSettingsOpen, setIsMetricSettingsOpen] = useState(false);
  const [metricConfig, setMetricConfig] = useState(() => getMetricVisibilityConfig('default'));

  const handleToggleMetric = (key) => {
    const updated = { ...metricConfig, [key]: !metricConfig[key] };
    setMetricConfig(updated);
    saveMetricVisibilityConfig(updated, 'default');
  };

  const handleResetMetrics = () => {
    setMetricConfig(DEFAULT_METRIC_CONFIG);
    saveMetricVisibilityConfig(DEFAULT_METRIC_CONFIG, 'default');
  };

  const formatSeconds = (sec) => {
    if (!sec || isNaN(sec)) return "0 dk";
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    if (h > 0) return `${h} sa ${m} dk`;
    return `${m} dk`;
  };

  const formatTimeAgo = (utcString) => {
    if (!utcString) return 'Bilinmiyor';
    try {
      const diffMs = Date.now() - new Date(utcString).getTime();
      const diffSec = Math.floor(diffMs / 1000);
      if (diffSec < 60) return `${Math.max(1, diffSec)} sn önce`;
      const diffMin = Math.floor(diffSec / 60);
      if (diffMin < 60) return `${diffMin} dk önce`;
      const diffHour = Math.floor(diffMin / 60);
      if (diffHour < 24) return `${diffHour} sa önce`;
      return new Date(utcString).toLocaleDateString('tr-TR');
    } catch (e) {
      return 'Bilinmiyor';
    }
  };

  // Tezgah Durumu Rozetleri
  const getStateBadge = (device) => {
    if (device.connected === false) {
      return { label: 'BAĞLANTI KOPUK', bg: 'bg-slate-100 dark:bg-slate-800/80', border: 'border-slate-300 dark:border-slate-700', text: 'text-slate-500 dark:text-slate-400', badgeBg: 'bg-slate-500', dot: 'bg-slate-400' };
    }
    const st = (device.currentState || 'Offline').toLowerCase();
    switch (st) {
      case 'running':
        return { label: 'ÇALIŞIYOR', bg: 'bg-emerald-500/10 dark:bg-emerald-950/50', border: 'border-emerald-500/40', text: 'text-emerald-600 dark:text-emerald-400', badgeBg: 'bg-emerald-600', dot: 'bg-emerald-500 animate-ping' };
      case 'idle':
      case 'idling':
        return { label: 'BOŞTA / DURDU', bg: 'bg-amber-500/10 dark:bg-amber-950/50', border: 'border-amber-500/40', text: 'text-amber-600 dark:text-amber-400', badgeBg: 'bg-amber-500', dot: 'bg-amber-500' };
      case 'down':
        return { label: 'ALARM / PROBLEM', bg: 'bg-red-500/10 dark:bg-red-950/50', border: 'border-red-500/40', text: 'text-red-600 dark:text-red-400', badgeBg: 'bg-red-600', dot: 'bg-red-500 animate-pulse' };
      default:
        return { label: 'ÇEVRİMDİŞİ', bg: 'bg-slate-100 dark:bg-slate-800/80', border: 'border-slate-300 dark:border-slate-700', text: 'text-slate-500 dark:text-slate-400', badgeBg: 'bg-slate-500', dot: 'bg-slate-400' };
    }
  };

  // Aktif Atama / Canlı Üretim İşi Bulucu
  const getDeviceAssignment = (device) => {
    // 1. Önce Kaliphane v2 sistemindeki aktif üretim işini ara (K27 -> 3334 NGC DIŞ RADAR KAPAMA, S1.2-C vb.)
    const searchKeys = [
      device.name,
      device.systemMachineCode,
      device.id,
      device.ip
    ].filter(Boolean);

    for (const key of searchKeys) {
      const prodJob = findActiveProductionJob(key, projects);
      if (prodJob) return prodJob;
    }

    // 2. Manuel atama varsa getir
    const key1 = (device.ip || '').trim().toLowerCase();
    const key2 = (device.id || '').trim().toLowerCase();
    const key3 = (device.name || '').trim().toLowerCase();

    return activeAssignments.find(a => {
      const aKey = (a.machineKey || a.machineName || '').trim().toLowerCase();
      return aKey === key1 || aKey === key2 || aKey === key3;
    });
  };

  // Filtrelenmiş Liste
  const filteredFleet = fleetData.filter(device => {
    const isConn = device.connected !== false;
    const st = isConn ? (device.currentState || 'Offline').toLowerCase() : 'offline';

    if (filterState !== 'ALL') {
      const target = filterState.toLowerCase();
      if (target === 'reduced') {
        const fOv = device.feedOverridePct ?? 100;
        const rOv = device.rapidOverridePct ?? 100;
        if (fOv >= 100 && rOv >= 100) return false;
      } else if (target === 'running' && st !== 'running') return false;
      else if (target === 'idle' && (st !== 'idle' && st !== 'idling')) return false;
      else if (target === 'down' && st !== 'down') return false;
      else if (target === 'offline' && st !== 'offline') return false;
    }

    if (selectedGroup !== 'ALL') {
      if ((device.group || 'Genel') !== selectedGroup) return false;
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const assignment = getDeviceAssignment(device);
      const nameMatch = (device.name || '').toLowerCase().includes(q);
      const ipMatch = (device.ip || '').toLowerCase().includes(q);
      const progMatch = (device.program || '').toLowerCase().includes(q);
      const moldMatch = (assignment?.moldName || '').toLowerCase().includes(q);
      const taskMatch = (assignment?.taskName || '').toLowerCase().includes(q);
      const opMatch = (assignment?.camOperatorName || '').toLowerCase().includes(q);
      return nameMatch || ipMatch || progMatch || moldMatch || taskMatch || opMatch;
    }

    return true;
  });

  return (
    <div className="space-y-4">
      {/* 1. KPİ ÖZET KARTLARI */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-800 border dark:border-slate-700 shadow-xs flex flex-col justify-between">
          <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Toplam Tezgah</span>
          <div className="text-2xl font-black text-slate-900 dark:text-white mt-1 flex items-baseline justify-between">
            <span>{counts.total || 0}</span>
            <span className="text-[11px] font-bold text-slate-400">Adet</span>
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-emerald-500/10 dark:bg-emerald-950/40 border border-emerald-500/30 text-emerald-900 dark:text-emerald-100 shadow-xs flex flex-col justify-between">
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-extrabold uppercase text-emerald-600 dark:text-emerald-400">✅ Çalışıyor</span>
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
          </div>
          <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1 flex items-baseline justify-between">
            <span>{counts.running || 0}</span>
            <span className="text-[11px] font-bold opacity-80">Tezgah</span>
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-amber-500/10 dark:bg-amber-950/40 border border-amber-500/30 text-amber-900 dark:text-amber-100 shadow-xs flex flex-col justify-between">
          <span className="text-[10px] font-extrabold uppercase text-amber-600 dark:text-amber-400">⏳ Boşta / Durdu</span>
          <div className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-1 flex items-baseline justify-between">
            <span>{counts.idle || 0}</span>
            <span className="text-[11px] font-bold opacity-80">Tezgah</span>
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-red-500/10 dark:bg-red-950/40 border border-red-500/30 text-red-900 dark:text-red-100 shadow-xs flex flex-col justify-between">
          <span className="text-[10px] font-extrabold uppercase text-red-600 dark:text-red-400">⚠️ Problem / Alarm</span>
          <div className="text-2xl font-black text-red-600 dark:text-red-400 mt-1 flex items-baseline justify-between">
            <span>{counts.down || 0}</span>
            <span className="text-[11px] font-bold opacity-80">Kayıt</span>
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-blue-500/10 dark:bg-blue-950/40 border border-blue-500/30 text-blue-900 dark:text-blue-100 shadow-xs flex flex-col justify-between">
          <span className="text-[10px] font-extrabold uppercase text-blue-600 dark:text-blue-400">⚙️ Bağlı Parçalar</span>
          <div className="text-2xl font-black text-blue-600 dark:text-blue-400 mt-1 flex items-baseline justify-between">
            <span>{activeAssignments.length}</span>
            <span className="text-[11px] font-bold opacity-80">İş Emri</span>
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-800 border dark:border-slate-700 shadow-xs flex flex-col justify-between">
          <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">🔌 Bağlantı Kopuk</span>
          <div className="text-2xl font-black text-slate-400 mt-1 flex items-baseline justify-between">
            <span>{counts.offline || 0}</span>
            <span className="text-[11px] font-bold opacity-80">Tezgah</span>
          </div>
        </div>
      </div>

      {/* 2. FİLTRE, ARAMA & GÖSTERGE ÖZELLEŞTİRME BARI */}
      <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border dark:border-slate-700 shadow-xs flex flex-col md:flex-row justify-between items-stretch md:items-center gap-3">
        <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
          <button
            onClick={() => setFilterState('ALL')}
            className={`px-3 py-1.5 text-xs font-black rounded-lg transition ${
              filterState === 'ALL' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Tümü ({counts.total || 0})
          </button>
          <button
            onClick={() => setFilterState('Running')}
            className={`px-3 py-1.5 text-xs font-black rounded-lg transition ${
              filterState === 'Running' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            ✅ Çalışan ({counts.running || 0})
          </button>
          <button
            onClick={() => setFilterState('Idle')}
            className={`px-3 py-1.5 text-xs font-black rounded-lg transition ${
              filterState === 'Idle' ? 'bg-amber-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            ⏳ Boşta ({counts.idle || 0})
          </button>
          <button
            onClick={() => setFilterState('Down')}
            className={`px-3 py-1.5 text-xs font-black rounded-lg transition ${
              filterState === 'Down' ? 'bg-red-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            ⚠️ Alarm ({counts.down || 0})
          </button>
          <button
            onClick={() => setFilterState('Offline')}
            className={`px-3 py-1.5 text-xs font-black rounded-lg transition ${
              filterState === 'Offline' ? 'bg-slate-700 text-white shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            🔌 Çevrimdışı ({counts.offline || 0})
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Metrik Göster/Gizle Butonu */}
          <button
            onClick={() => setIsMetricSettingsOpen(!isMetricSettingsOpen)}
            className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-xs font-bold transition flex items-center gap-1.5"
            title="Kartlarda Görünecek Metrikleri Özelleştir"
          >
            <Sliders size={14} className="text-blue-500" />
            <span>Göstergeler (Tik ile Seç)</span>
          </button>

          {availableGroups.length > 1 && (
            <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-900 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs">
              <Layers size={14} className="text-slate-400" />
              <select
                value={selectedGroup}
                onChange={(e) => setSelectedGroup(e.target.value)}
                className="bg-transparent font-bold text-slate-800 dark:text-slate-200 outline-none"
              >
                <option value="ALL" className="dark:bg-slate-800">Tüm Gruplar</option>
                {availableGroups.map(g => (
                  <option key={g} value={g} className="dark:bg-slate-800">{g}</option>
                ))}
              </select>
            </div>
          )}

          <div className="relative flex-1 md:w-60">
            <Search size={15} className="absolute left-3 top-3 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Tezgah, kalıp, parça veya CAM..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs font-bold border dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {/* GÖSTERGE SEÇİM PANELİ (METRİK TİKLERİ) */}
      {isMetricSettingsOpen && (
        <div className="p-4 bg-white dark:bg-slate-800 rounded-2xl border-2 border-blue-500/40 shadow-lg animate-fadeIn space-y-3">
          <div className="flex justify-between items-center border-b dark:border-slate-700 pb-2">
            <div className="flex items-center gap-2">
              <Sliders size={16} className="text-blue-500" />
              <span className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider">
                Tezgah Kartlarında Görünecek Verileri Seçin:
              </span>
            </div>
            <button
              onClick={handleResetMetrics}
              className="text-[11px] font-bold text-blue-600 hover:underline"
            >
              Varsayılana Sıfırla
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 text-xs">
            <label className="flex items-center gap-2 cursor-pointer p-2 rounded-xl bg-slate-50 dark:bg-slate-900/60 border dark:border-slate-700">
              <input
                type="checkbox"
                checked={metricConfig.spindleRpm}
                onChange={() => handleToggleMetric('spindleRpm')}
                className="rounded text-blue-600"
              />
              <span className="font-bold text-slate-700 dark:text-slate-200">🔄 Spindle RPM</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer p-2 rounded-xl bg-slate-50 dark:bg-slate-900/60 border dark:border-slate-700">
              <input
                type="checkbox"
                checked={metricConfig.feedrate}
                onChange={() => handleToggleMetric('feedrate')}
                className="rounded text-blue-600"
              />
              <span className="font-bold text-slate-700 dark:text-slate-200">⚡ İlerleme (mm/min)</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer p-2 rounded-xl bg-slate-50 dark:bg-slate-900/60 border dark:border-slate-700">
              <input
                type="checkbox"
                checked={metricConfig.feedOverridePct}
                onChange={() => handleToggleMetric('feedOverridePct')}
                className="rounded text-blue-600"
              />
              <span className="font-bold text-slate-700 dark:text-slate-200">📉 İlerleme Yüzdesi (Feed %)</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer p-2 rounded-xl bg-slate-50 dark:bg-slate-900/60 border dark:border-slate-700">
              <input
                type="checkbox"
                checked={metricConfig.rapidOverridePct}
                onChange={() => handleToggleMetric('rapidOverridePct')}
                className="rounded text-blue-600"
              />
              <span className="font-bold text-slate-700 dark:text-slate-200">🚀 Boşta Hız (Rapid %)</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer p-2 rounded-xl bg-slate-50 dark:bg-slate-900/60 border dark:border-slate-700">
              <input
                type="checkbox"
                checked={metricConfig.program}
                onChange={() => handleToggleMetric('program')}
                className="rounded text-blue-600"
              />
              <span className="font-bold text-slate-700 dark:text-slate-200">📄 NC Program</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer p-2 rounded-xl bg-slate-50 dark:bg-slate-900/60 border dark:border-slate-700">
              <input
                type="checkbox"
                checked={metricConfig.assignedPart}
                onChange={() => handleToggleMetric('assignedPart')}
                className="rounded text-blue-600"
              />
              <span className="font-bold text-slate-700 dark:text-slate-200">📦 Bağlı Kalıp & Parça</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer p-2 rounded-xl bg-slate-50 dark:bg-slate-900/60 border dark:border-slate-700">
              <input
                type="checkbox"
                checked={metricConfig.camOperator}
                onChange={() => handleToggleMetric('camOperator')}
                className="rounded text-blue-600"
              />
              <span className="font-bold text-slate-700 dark:text-slate-200">👨‍💻 CAM Operatörü</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer p-2 rounded-xl bg-slate-50 dark:bg-slate-900/60 border dark:border-slate-700">
              <input
                type="checkbox"
                checked={metricConfig.partDurations}
                onChange={() => handleToggleMetric('partDurations')}
                className="rounded text-blue-600"
              />
              <span className="font-bold text-slate-700 dark:text-slate-200">⏱️ Parça İşleme Süresi</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer p-2 rounded-xl bg-slate-50 dark:bg-slate-900/60 border dark:border-slate-700">
              <input
                type="checkbox"
                checked={metricConfig.runningPct24h}
                onChange={() => handleToggleMetric('runningPct24h')}
                className="rounded text-blue-600"
              />
              <span className="font-bold text-slate-700 dark:text-slate-200">📊 24s Verimlilik Barı</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer p-2 rounded-xl bg-slate-50 dark:bg-slate-900/60 border dark:border-slate-700">
              <input
                type="checkbox"
                checked={metricConfig.lastDataTime}
                onChange={() => handleToggleMetric('lastDataTime')}
                className="rounded text-blue-600"
              />
              <span className="font-bold text-slate-700 dark:text-slate-200">🕒 Son Veri Saati</span>
            </label>
          </div>
        </div>
      )}

      {/* 3. TEZGAH KARTLARI GRİDİ */}
      {filteredFleet.length === 0 ? (
        <div className="p-16 text-center text-slate-500 bg-white dark:bg-slate-800 rounded-2xl border dark:border-slate-700 font-bold space-y-2">
          <p>Filtreye uygun tezgah bulunamadı.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredFleet.map(device => {
            const badge = getStateBadge(device);
            const isConnected = device.connected !== false;
            const assignment = getDeviceAssignment(device);

            const runningPctVal = (device.runningPct !== undefined && device.runningPct !== null)
              ? (device.runningPct > 1 ? device.runningPct.toFixed(0) : (device.runningPct * 100).toFixed(0))
              : 0;

            const fOv = device.feedOverridePct ?? 100;
            const rOv = device.rapidOverridePct ?? 100;
            const sOv = device.spindleOverridePct ?? 100;

            const isSpeedReduced = fOv < 100 || rOv < 100;

            return (
              <div
                key={device.id || device.ip}
                onClick={() => onSelectDevice(device)}
                className={`p-4 rounded-2xl border-2 shadow-xs hover:shadow-lg transition-all cursor-pointer flex flex-col justify-between space-y-3 bg-white dark:bg-slate-800 ${badge.border} hover:scale-[1.01]`}
              >
                <div>
                  {/* Başlık ve Durum */}
                  <div className="flex justify-between items-start pb-2 border-b dark:border-slate-700">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${badge.dot}`} />
                        <h3 className="text-base font-black text-slate-900 dark:text-white font-mono tracking-tight hover:text-blue-500 transition">
                          {device.name || device.ip}
                        </h3>
                      </div>
                      <span className="text-[11px] font-semibold text-slate-400 font-mono block">
                        {device.ip} {device.group ? `• ${device.group}` : ''}
                      </span>
                    </div>

                    <div className="text-right flex flex-col items-end gap-1">
                      <span className={`text-[10px] font-black px-2.5 py-1 rounded-lg uppercase tracking-wider ${badge.badgeBg} text-white shadow-xs`}>
                        {badge.label}
                      </span>
                      {device.currentStateSec > 0 && isConnected && (
                        <span className="text-[10px] text-slate-400 font-bold">
                          {formatSeconds(device.currentStateSec)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Operatör Hızı Kıstı Uyarısı */}
                  {isSpeedReduced && isConnected && (
                    <div className="mt-2 p-1.5 rounded-xl bg-orange-500/10 border border-orange-500/40 text-orange-700 dark:text-orange-300 text-[10px] font-black flex items-center justify-between">
                      <span className="flex items-center gap-1">
                        <ShieldAlert size={13} className="text-orange-500" />
                        <span>HIZ KISILDI</span>
                      </span>
                      <span className="font-mono">Feed: %{fOv}</span>
                    </div>
                  )}

                  {/* BAĞLI KALIP & PARÇA BİLGİSİ (SİSTEMDEN OTOMATİK) */}
                  {metricConfig.assignedPart && (
                    <div className="mt-2.5 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 space-y-1">
                      <div className="flex justify-between items-center text-[10px] text-slate-400 font-bold">
                        <span className="flex items-center gap-1 uppercase tracking-wider">
                          <Box size={12} className="text-blue-500" /> Bağlı Parça (İş Emri)
                        </span>
                        {assignment && (
                          <span className="text-[10px] font-mono text-blue-500 font-bold">
                            %{assignment.progressPercentage ?? 0}
                          </span>
                        )}
                      </div>

                      {assignment ? (
                        <div className="space-y-1">
                          <div className="text-xs font-black text-slate-900 dark:text-white truncate">
                            {assignment.moldName} → <span className="text-blue-600 dark:text-blue-400">{assignment.taskName}</span>
                          </div>

                          {metricConfig.camOperator && (
                            <div className="flex justify-between items-center text-[10px] text-slate-500 font-medium">
                              <span className="flex items-center gap-1">
                                <User size={11} className="text-purple-500" /> {assignment.camOperatorName}
                              </span>
                              {assignment.machineOperatorName && (
                                <span className="text-slate-400 font-medium truncate max-w-[100px]">
                                  {assignment.machineOperatorName}
                                </span>
                              )}
                            </div>
                          )}

                          {metricConfig.partDurations && (
                            <div className="grid grid-cols-2 gap-1.5 pt-1 text-[10px] font-mono">
                              <div className="p-1 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-bold flex justify-between">
                                <span>Çalışma:</span>
                                <span>{formatSeconds(assignment.runningSeconds || device.runningSec)}</span>
                              </div>
                              <div className="p-1 rounded bg-amber-500/10 text-amber-700 dark:text-amber-300 font-bold flex justify-between">
                                <span>Duruş:</span>
                                <span>{formatSeconds((assignment.idleSeconds || device.idleSec || 0) + (assignment.downSeconds || device.downSec || 0))}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-[11px] text-slate-400 italic py-1">
                          Aktif iş atanmamış (Boşta)
                        </div>
                      )}
                    </div>
                  )}

                  {/* SPINDLE DEVİR & İLERLEME HIZI */}
                  {(metricConfig.spindleRpm || metricConfig.feedrate) && (
                    <div className="mt-2.5 grid grid-cols-2 gap-2">
                      {metricConfig.spindleRpm && (
                        <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                          <span className="text-[9px] font-extrabold text-slate-400 uppercase block">Spindle Devir</span>
                          <div className="text-xs font-mono font-black text-emerald-600 dark:text-emerald-400 mt-0.5 truncate">
                            {device.spindleRpm !== null && device.spindleRpm !== undefined && isConnected 
                              ? `${device.spindleRpm} RPM` 
                              : '-'}
                          </div>
                        </div>
                      )}

                      {metricConfig.feedrate && (
                        <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                          <span className="text-[9px] font-extrabold text-slate-400 uppercase block">İlerleme (Feed)</span>
                          <div className="text-xs font-mono font-black text-blue-600 dark:text-blue-400 mt-0.5 truncate">
                            {device.feedrate !== null && device.feedrate !== undefined && isConnected 
                              ? `${device.feedrate} mm/min` 
                              : '-'}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* OVERRIDE YÜZDELERİ (FEED %, RAPID %, SPINDLE %) */}
                  {(metricConfig.feedOverridePct || metricConfig.rapidOverridePct || metricConfig.spindleOverridePct) && (
                    <div className="mt-2 grid grid-cols-3 gap-1 text-center">
                      {metricConfig.feedOverridePct && (
                        <div className={`p-1 rounded-xl border text-[9px] font-bold ${
                          fOv < 100 && isConnected ? 'bg-orange-500/10 border-orange-500/40 text-orange-600 font-black' : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                        }`}>
                          <span className="block text-[8px] text-slate-400 uppercase">⚡ İlerleme %</span>
                          <span className="font-mono text-[11px] font-black">%{fOv}</span>
                        </div>
                      )}

                      {metricConfig.rapidOverridePct && (
                        <div className={`p-1 rounded-xl border text-[9px] font-bold ${
                          rOv < 100 && isConnected ? 'bg-amber-500/10 border-amber-500/40 text-amber-600 font-black' : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                        }`}>
                          <span className="block text-[8px] text-slate-400 uppercase">🚀 Boşta Hız %</span>
                          <span className="font-mono text-[11px] font-black">%{rOv}</span>
                        </div>
                      )}

                      {metricConfig.spindleOverridePct && (
                        <div className={`p-1 rounded-xl border text-[9px] font-bold ${
                          sOv < 100 && isConnected ? 'bg-purple-500/10 border-purple-500/40 text-purple-600 font-black' : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                        }`}>
                          <span className="block text-[8px] text-slate-400 uppercase">🔄 Devir %</span>
                          <span className="font-mono text-[11px] font-black">%{sOv}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* NC PROGRAM ADI */}
                  {metricConfig.program && (
                    <div className="mt-2 p-1.5 rounded-xl bg-slate-100 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700 flex justify-between items-center text-xs">
                      <span className="font-extrabold text-[10px] text-slate-500">NC Program:</span>
                      <span className="font-mono font-black text-[11px] text-yellow-600 dark:text-yellow-400 truncate max-w-[130px]" title={device.program}>
                        {device.program && isConnected ? device.program : 'Seçili Değil'}
                      </span>
                    </div>
                  )}

                  {/* SON VERİ SAATİ */}
                  {metricConfig.lastDataTime && device.lastDataUtc && (
                    <div className="mt-1 flex justify-between items-center text-[10px] text-slate-400 px-1">
                      <span>Son Veri:</span>
                      <span className="font-mono">{formatTimeAgo(device.lastDataUtc)}</span>
                    </div>
                  )}
                </div>

                {/* 24 SAATLİK VERİMLİLİK BARI */}
                {metricConfig.runningPct24h && (
                  <div className="pt-2 border-t dark:border-slate-700 space-y-1">
                    <div className="flex justify-between items-center text-[10px] font-extrabold">
                      <span className="text-slate-500">24s Çalışma Oranı:</span>
                      <span className="text-emerald-600 dark:text-emerald-400 font-mono font-black">%{runningPctVal}</span>
                    </div>

                    <div className="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden flex">
                      <div 
                        className="bg-emerald-500 h-full transition-all duration-500" 
                        style={{ width: `${runningPctVal}%` }} 
                        title={`Çalışma: ${formatSeconds(device.runningSec)}`}
                      />
                    </div>
                  </div>
                )}

              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default OeeLiveFleetTab;
