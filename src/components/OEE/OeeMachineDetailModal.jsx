// src/components/OEE/OeeMachineDetailModal.jsx
import React from 'react';
import { 
  Monitor, X, Box, User, Clock, Cpu, 
  Activity, Zap, ShieldAlert, CheckCircle2, 
  AlertTriangle, PlayCircle, PauseCircle, WifiOff,
  Layers, MapPin, BarChart3, TrendingUp
} from 'lucide-react';
import { findActiveProductionJob } from '../../services/oeeTrackingService.js';

export const OeeMachineDetailModal = ({
  device,
  projects = [],
  onClose
}) => {
  if (!device) return null;

  const isConnected = device.connected !== false;
  const stateStr = (device.currentState || 'Offline').toLowerCase();
  
  // Durum Rozeti
  const getStateInfo = () => {
    if (!isConnected) {
      return { label: 'BAĞLANTI KOPUK', color: 'text-slate-400', bg: 'bg-slate-800', border: 'border-slate-700', badge: 'bg-slate-600' };
    }
    switch (stateStr) {
      case 'running':
        return { label: 'ÇALIŞIYOR', color: 'text-emerald-400', bg: 'bg-emerald-950/40', border: 'border-emerald-500/40', badge: 'bg-emerald-500 animate-ping' };
      case 'idle':
      case 'idling':
        return { label: 'BOŞTA / DURDU', color: 'text-amber-400', bg: 'bg-amber-950/40', border: 'border-amber-500/40', badge: 'bg-amber-500' };
      case 'down':
        return { label: 'ALARM / PROBLEM', color: 'text-red-400', bg: 'bg-red-950/40', border: 'border-red-500/40', badge: 'bg-red-500 animate-pulse' };
      default:
        return { label: 'ÇEVRİMDİŞİ', color: 'text-slate-400', bg: 'bg-slate-800', border: 'border-slate-700', badge: 'bg-slate-600' };
    }
  };

  const stInfo = getStateInfo();

  // Otomatik Sistem Üretim İşi
  const searchKeys = [device.name, device.systemMachineCode, device.id, device.ip].filter(Boolean);
  let prodJob = null;
  for (const k of searchKeys) {
    prodJob = findActiveProductionJob(k, projects);
    if (prodJob) break;
  }

  const formatSeconds = (sec) => {
    if (!sec || isNaN(sec)) return "0 dk";
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    if (h > 0) return `${h} sa ${m} dk`;
    return `${m} dk`;
  };

  const fOv = device.feedOverridePct ?? 100;
  const rOv = device.rapidOverridePct ?? 100;
  const sOv = device.spindleOverridePct ?? 100;
  const isSpeedReduced = fOv < 100 || rOv < 100;

  const runningPctVal = (device.runningPct !== undefined && device.runningPct !== null)
    ? (device.runningPct > 1 ? device.runningPct.toFixed(0) : (device.runningPct * 100).toFixed(0))
    : 0;

  return (
    <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-fadeIn">
      <div className="bg-slate-900 text-slate-100 rounded-3xl shadow-2xl border border-slate-700/80 max-w-5xl w-full p-6 space-y-5 my-auto max-h-[92vh] overflow-y-auto custom-scrollbar">
        
        {/* 1. ÜST BAŞLIK & DURUM ROZETİ */}
        <div className="flex justify-between items-start border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className={`p-3 rounded-2xl ${stInfo.bg} border ${stInfo.border}`}>
              <Monitor size={28} className={stInfo.color} />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-2xl font-black text-white font-mono tracking-tight">
                  {device.name || device.ip}
                </h2>
                <span className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider ${stInfo.bg} ${stInfo.color} border ${stInfo.border}`}>
                  ● {stInfo.label}
                </span>
                {isSpeedReduced && isConnected && (
                  <span className="px-2.5 py-0.5 rounded-full bg-orange-500/20 text-orange-400 border border-orange-500/40 text-[11px] font-black flex items-center gap-1">
                    <ShieldAlert size={13} /> HIZ KISILDI (%{fOv})
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 mt-1 font-medium">
                <span>IP: <b className="font-mono text-slate-300">{device.ip || '-'}</b></span>
                <span>•</span>
                <span>Grup: <b className="text-slate-300">{device.group || 'CNC Dik İşleme'}</b></span>
                <span>•</span>
                <span>Konum: <b className="text-slate-300">{device.location || 'Kalıphane A Blok'}</b></span>
              </div>
            </div>
          </div>

          <button 
            onClick={onClose}
            className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-slate-800 transition"
          >
            <X size={24} />
          </button>
        </div>

        {/* 2. CANLI TELEMETRİ GÖSTERGELERİ */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col justify-between">
            <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">🔄 Spindle Devir</span>
            <div className="text-xl font-black font-mono text-emerald-400 mt-1">
              {device.spindleRpm !== null && device.spindleRpm !== undefined && isConnected ? `${device.spindleRpm} RPM` : '-'}
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col justify-between">
            <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">⚡ İlerleme Hızı</span>
            <div className="text-xl font-black font-mono text-blue-400 mt-1 truncate">
              {device.feedrate !== null && device.feedrate !== undefined && isConnected ? `${device.feedrate} mm/dk` : '-'}
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col justify-between">
            <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">⚡ Feed Override %</span>
            <div className={`text-xl font-black font-mono mt-1 ${fOv < 100 ? 'text-orange-400' : 'text-emerald-400'}`}>
              %{fOv}
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col justify-between">
            <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">🚀 Rapid Override %</span>
            <div className={`text-xl font-black font-mono mt-1 ${rOv < 100 ? 'text-orange-400' : 'text-slate-200'}`}>
              %{rOv}
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col justify-between">
            <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">🔄 Spindle Override %</span>
            <div className="text-xl font-black font-mono text-slate-200 mt-1">
              %{sOv}
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col justify-between">
            <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">📄 NC Program</span>
            <div className="text-xs font-black font-mono text-amber-400 mt-1 truncate" title={device.program || '-'}>
              {device.program || '-'}
            </div>
          </div>
        </div>

        {/* 3. BAĞLI AKTİF İŞ (SİSTEMDEN OTOMATİK) & 24 SAATLİK PERFORMANS */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          
          {/* Sol Kutu: Aktif Üretim İşi */}
          <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
            <div className="flex justify-between items-center border-b border-slate-800 pb-2">
              <span className="text-xs font-black text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Box size={16} className="text-blue-400" /> Sistemdeki Aktif İş Emri (Otomatik)
              </span>
              {prodJob && (
                <span className="px-2 py-0.5 rounded-full bg-blue-900/60 text-blue-300 text-[10px] font-bold">
                  Sistemden Bağlı
                </span>
              )}
            </div>

            {prodJob ? (
              <div className="space-y-2.5 text-xs">
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">Kalıp Adı:</span>
                  <span className="text-sm font-black text-white">{prodJob.moldName}</span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Parça Adı:</span>
                    <span className="font-bold text-blue-400 text-xs">{prodJob.taskName}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Operasyon:</span>
                    <span className="font-bold text-slate-200">{prodJob.operationName}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-800/80">
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">CAM Operatörü:</span>
                    <span className="font-bold text-purple-400 flex items-center gap-1">
                      <User size={13} /> {prodJob.camOperatorName}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Tezgah Operatörü:</span>
                    <span className="font-bold text-slate-300">{prodJob.machineOperatorName}</span>
                  </div>
                </div>

                {prodJob.progressPercentage !== undefined && (
                  <div className="space-y-1 pt-1">
                    <div className="flex justify-between text-[11px] font-bold">
                      <span className="text-slate-400">İlerleme:</span>
                      <span className="text-blue-400 font-mono">%{prodJob.progressPercentage}</span>
                    </div>
                    <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                      <div className="bg-blue-500 h-full transition-all" style={{ width: `${prodJob.progressPercentage}%` }} />
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="py-8 text-center text-slate-500 font-bold text-xs space-y-1">
                <p>Bu tezgaha sistemde atanmış aktif bir operasyon bulunmuyor.</p>
                <p className="text-[11px] text-slate-600">Tezgah boşta / serbest çalışıyor olabilir.</p>
              </div>
            )}
          </div>

          {/* Sağ Kutu: 24 Saatlik Süreler & Verimlilik */}
          <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
            <div className="flex justify-between items-center border-b border-slate-800 pb-2">
              <span className="text-xs font-black text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <BarChart3 size={16} className="text-emerald-400" /> 24 Saatlik Sayaçlar & Dağılım
              </span>
              <span className="font-mono font-black text-emerald-400 text-xs">
                Verim: %{runningPctVal}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2.5 rounded-xl bg-emerald-950/30 border border-emerald-500/30">
                <span className="text-[10px] text-emerald-400 font-bold block">🟢 Net Çalışma</span>
                <span className="text-sm font-mono font-black text-emerald-300 mt-0.5 block">
                  {formatSeconds(device.runningSec)}
                </span>
              </div>

              <div className="p-2.5 rounded-xl bg-amber-950/30 border border-amber-500/30">
                <span className="text-[10px] text-amber-400 font-bold block">🟡 Boşta / Durdu</span>
                <span className="text-sm font-mono font-black text-amber-300 mt-0.5 block">
                  {formatSeconds(device.idleSec)}
                </span>
              </div>

              <div className="p-2.5 rounded-xl bg-red-950/30 border border-red-500/30">
                <span className="text-[10px] text-red-400 font-bold block">🔴 Alarm / Arıza</span>
                <span className="text-sm font-mono font-black text-red-300 mt-0.5 block">
                  {formatSeconds(device.downSec)}
                </span>
              </div>
            </div>

            {/* 24 Saatlik Görsel Mini Çubuk */}
            <div className="space-y-1.5 pt-2">
              <div className="flex justify-between text-[10px] text-slate-400 font-bold">
                <span>24 Saatlik Zaman Dağılımı:</span>
                <span>%{runningPctVal} Çalışma</span>
              </div>
              <div className="w-full bg-slate-800 h-3 rounded-full overflow-hidden flex">
                <div 
                  className="bg-emerald-500 h-full" 
                  style={{ width: `${runningPctVal}%` }} 
                  title={`Net Çalışma: %${runningPctVal}`} 
                />
                <div 
                  className="bg-amber-500 h-full" 
                  style={{ width: `${Math.max(0, 100 - runningPctVal)}%` }} 
                  title="Boşta / Diğer" 
                />
              </div>
            </div>
          </div>

        </div>

        {/* 4. ALT BİLGİ VE KAPAT BUTONU */}
        <div className="pt-3 border-t border-slate-800 flex justify-between items-center text-xs text-slate-500">
          <span>Son güncelleme: <b>{device.lastUpdatedUtc ? new Date(device.lastUpdatedUtc).toLocaleTimeString('tr-TR') : 'Bilinmiyor'}</b></span>
          <button
            onClick={onClose}
            className="py-2 px-5 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl transition border border-slate-700"
          >
            Kapat
          </button>
        </div>

      </div>
    </div>
  );
};

export default OeeMachineDetailModal;
