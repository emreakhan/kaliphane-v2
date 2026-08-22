// src/pages/CanliDurum.jsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Monitor, Cpu, RefreshCw, Activity, AlertTriangle, CheckCircle2, 
  PlayCircle, PauseCircle, Wifi, WifiOff, Settings, Search, Filter, 
  Clock, Zap, X, ShieldCheck, Database, Server, Gauge, Radio, 
  ArrowUpRight, BarChart3, Wrench, Layers, Check, ChevronRight, Edit3,
  PlusIcon, TrashIcon, Tag, MapPin, Sliders, ShieldAlert, FastForward,
  Globe, Building2, BellRing, Info
} from 'lucide-react';
import { 
  getBaseUrl, setBaseUrl, checkHealth, getServerInfo, getDashboard, 
  getFleetOee, getDevices, getDeviceLive, getDeviceOee, getDeviceTimeline, 
  startSignalR, stopSignalR, startKeepLiveLoop, stopKeepLiveLoop,
  getMachineAliases, setMachineAliases, findAlias,
  getAdminToken, setAdminToken, loginEtka, logoutAdmin,
  INTERNAL_BASE_URL, EXTERNAL_BASE_URL, PRESET_BASE_URLS
} from '../services/etkaOeeService';

const CanliDurum = () => {
  // ANA STATE'LER
  const [fleetData, setFleetData] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // FİLTRE & ARAMA
  const [filterState, setFilterState] = useState('ALL'); // 'ALL' | 'Running' | 'Idle' | 'Down' | 'Offline' | 'Reduced' | 'Setup'
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('ALL');

  // CANLI DETAY POPUP / MODAL STATE
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [liveDetails, setLiveDetails] = useState(null);
  const [deviceOeeStats, setDeviceOeeStats] = useState(null);
  const [deviceTimeline, setDeviceTimeline] = useState([]);
  const [liveRawPoints, setLiveRawPoints] = useState([]);
  const [activeDetailTab, setActiveDetailTab] = useState('live'); // 'live' | 'oee' | 'timeline'

  // SIGNALR & REST API BAĞLANTI DURUMU
  const [signalRStatus, setSignalRStatus] = useState('disconnected');
  const [apiConnected, setApiConnected] = useState(false);

  // SUNUCU AYARLARI MODAL
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [serverIpInput, setServerIpInput] = useState(() => getBaseUrl());
  const [testResult, setTestResult] = useState(null);
  const [isTesting, setIsTesting] = useState(false);

  // ETKA AUTH STATE
  const [adminTokenState, setAdminTokenState] = useState(() => getAdminToken());
  const [authUsername, setAuthUsername] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authStatusMsg, setAuthStatusMsg] = useState(null);

  // TEZGAH İSİMLENDİRME & EŞLEŞTİRME MODAL STATE
  const [isAliasModalOpen, setIsAliasModalOpen] = useState(false);
  const [aliasList, setAliasList] = useState(() => getMachineAliases());
  const [newAliasInput, setNewAliasInput] = useState({
    ipOrId: '',
    customName: '',
    group: 'CNC Dik İşleme',
    location: 'Kalıphane A Blok'
  });

  // 1. TÜM FİLO VERİLERİNİ VE METRİKLERİ ÇEK (REST API)
  const loadFleetData = useCallback(async () => {
    try {
      setLoading(prev => fleetData.length === 0 ? true : prev);
      setError(null);

      // Sunucu sağlık kontrolü
      const health = await checkHealth().catch(() => null);
      if (health && health.status === 'ok') {
        setApiConnected(true);
      }

      const [fleetRes, dashboardRes, devicesRes] = await Promise.allSettled([
        getFleetOee(),
        getDashboard(),
        getDevices()
      ]);

      let combinedFleet = [];

      if (fleetRes.status === 'fulfilled' && Array.isArray(fleetRes.value)) {
        combinedFleet = fleetRes.value;
      }

      if (devicesRes.status === 'fulfilled' && Array.isArray(devicesRes.value)) {
        const deviceMap = new Map(devicesRes.value.map(d => [d.id, d]));
        
        if (combinedFleet.length === 0) {
          combinedFleet = devicesRes.value.map(d => ({
            id: d.id,
            name: d.name || d.ipAddress,
            ip: d.ipAddress,
            group: d.group || 'Genel',
            currentState: d.connectionStatus === 'online' ? (d.state || 'Running') : 'Offline',
            currentStateSec: 0,
            spindleRpm: null,
            feedrate: null,
            feedOverridePct: 100,
            rapidOverridePct: 100,
            spindleOverridePct: 100,
            program: null,
            runningPct: 0,
            runningSec: 0,
            idleSec: 0,
            idlingSec: 0,
            downSec: 0,
            offlineSec: 0,
            connected: d.connectionStatus === 'online',
            lastDataUtc: d.lastUpdatedUtc
          }));
        } else {
          combinedFleet = combinedFleet.map(fItem => {
            const devInfo = deviceMap.get(fItem.id);
            return {
              ...fItem,
              group: fItem.group || devInfo?.group || 'Genel',
              location: devInfo?.location || fItem.location || '',
              vendor: devInfo?.vendor || fItem.vendor || '',
              feedOverridePct: fItem.feedOverridePct ?? 100,
              rapidOverridePct: fItem.rapidOverridePct ?? 100,
              spindleOverridePct: fItem.spindleOverridePct ?? 100,
              connected: fItem.connected !== undefined ? fItem.connected : (devInfo?.connectionStatus === 'online'),
              lastDataUtc: fItem.lastDataUtc || devInfo?.lastUpdatedUtc
            };
          });
        }
      }

      // Eşleştirmeleri (Aliases) ve Filo Verilerini Akıllıca Birleştir
      const aliases = getMachineAliases();
      const processedKeys = new Set();
      let mergedFleet = [];

      // 1. API'den gelen cihazlar
      combinedFleet.forEach(item => {
        const matchedAlias = findAlias(item.ip, item.id, item.name);
        const ipKey = (item.ip || '').trim().toLowerCase();
        const idKey = (item.id || '').trim().toLowerCase();
        if (ipKey) processedKeys.add(ipKey);
        if (idKey) processedKeys.add(idKey);

        mergedFleet.push({
          ...item,
          name: matchedAlias?.customName || item.name || item.ip,
          group: matchedAlias?.group || item.group || 'CNC Dik İşleme',
          location: matchedAlias?.location || item.location || 'Kalıphane A Blok'
        });
      });

      // 2. Kullanıcının tanımladığı 24 tezgahın eksik olanlarını listeye dahil et
      aliases.forEach(alias => {
        const key = (alias.ipOrId || '').trim().toLowerCase();
        if (key && !processedKeys.has(key)) {
          processedKeys.add(key);
          // Varsa önceki state'teki canlı verileri koru
          const existing = fleetData.find(f => 
            (f.ip || '').toLowerCase() === key || 
            (f.id || '').toLowerCase() === key
          );

          mergedFleet.push(existing || {
            id: alias.ipOrId,
            name: alias.customName || alias.ipOrId,
            ip: alias.ipOrId,
            group: alias.group || 'CNC Dik İşleme',
            location: alias.location || 'Kalıphane A Blok',
            currentState: 'Offline',
            currentStateSec: 0,
            spindleRpm: null,
            feedrate: null,
            feedOverridePct: 100,
            rapidOverridePct: 100,
            spindleOverridePct: 100,
            program: null,
            runningPct: 0,
            runningSec: 0,
            idleSec: 0,
            idlingSec: 0,
            downSec: 0,
            offlineSec: 0,
            connected: false,
            lastDataUtc: null,
            axes: []
          });
        }
      });

      setFleetData(prevFleet => {
        const prevMap = new Map(prevFleet.map(f => [(f.ip || f.id || '').toLowerCase(), f]));
        return mergedFleet.map(m => {
          const prev = prevMap.get((m.ip || m.id || '').toLowerCase());
          if (prev && prev.connected && !m.connected) {
            return { ...prev, ...m, currentState: prev.currentState, spindleRpm: prev.spindleRpm, feedrate: prev.feedrate };
          }
          return m;
        });
      });

      if (dashboardRes.status === 'fulfilled' && dashboardRes.value) {
        setMetrics(dashboardRes.value);
      }
    } catch (err) {
      console.error("ETKA OEE Veri Çekme Hatası:", err);
      // Hata olsa dahi kayıtlı 24 tezgahı göster
      const aliases = getMachineAliases();
      if (aliases.length > 0) {
        setFleetData(prev => {
          if (prev.length > 0) return prev;
          return aliases.map(alias => ({
            id: alias.ipOrId,
            name: alias.customName || alias.ipOrId,
            ip: alias.ipOrId,
            group: alias.group || 'CNC Dik İşleme',
            location: alias.location || 'Kalıphane A Blok',
            currentState: 'Offline',
            currentStateSec: 0,
            spindleRpm: null,
            feedrate: null,
            feedOverridePct: 100,
            rapidOverridePct: 100,
            spindleOverridePct: 100,
            program: null,
            runningPct: 0,
            runningSec: 0,
            idleSec: 0,
            idlingSec: 0,
            downSec: 0,
            offlineSec: 0,
            connected: false,
            lastDataUtc: null,
            axes: []
          }));
        });
      }
      setError(err.message || "ETKA OEE Sunucusuna ulaşılamadı. Lütfen sunucu bağlantı ayarlarını kontrol ediniz.");
    } finally {
      setLoading(false);
    }
  }, []);

  // 2. İLK YÜKLEME VE SIGNALR CANLI YAYIN BAĞLANTISI
  useEffect(() => {
    loadFleetData();
    const pollInterval = setInterval(loadFleetData, 15000);

    setSignalRStatus('connecting');
    startSignalR({
      onRawData: (payload) => {
        if (payload) {
          setLiveRawPoints(prev => [payload, ...prev.slice(0, 49)]);

          setFleetData(prevFleet => {
            return prevFleet.map(item => {
              if (item.id === payload.deviceId || item.ip === payload.deviceId) {
                const newSpindle = payload.data?.find(d => d.key === 'spindle_speed' || d.key === 'spindleRpm')?.value;
                const newFeed = payload.data?.find(d => d.key === 'feedrate')?.value;
                const newProg = payload.data?.find(d => d.key === 'selected_program' || d.key === 'program')?.value;
                const newFeedOverride = payload.data?.find(d => d.key === 'feed_override_pct' || d.key === 'feedOverridePct')?.value;
                const newRapidOverride = payload.data?.find(d => d.key === 'rapid_override_pct' || d.key === 'rapidOverridePct')?.value;
                const newSpindleOverride = payload.data?.find(d => d.key === 'spindle_override_pct' || d.key === 'spindleOverridePct')?.value;
                
                return {
                  ...item,
                  spindleRpm: newSpindle !== undefined ? newSpindle : item.spindleRpm,
                  feedrate: newFeed !== undefined ? newFeed : item.feedrate,
                  program: newProg !== undefined ? newProg : item.program,
                  feedOverridePct: newFeedOverride !== undefined ? newFeedOverride : item.feedOverridePct,
                  rapidOverridePct: newRapidOverride !== undefined ? newRapidOverride : item.rapidOverridePct,
                  spindleOverridePct: newSpindleOverride !== undefined ? newSpindleOverride : item.spindleOverridePct,
                  connected: true,
                  lastDataUtc: new Date().toISOString()
                };
              }
              return item;
            });
          });
        }
      },
      onDeviceUpdated: (deviceSummary) => {
        if (deviceSummary) {
          setFleetData(prevFleet => {
            return prevFleet.map(item => {
              if (item.id === deviceSummary.id || item.ip === deviceSummary.host) {
                return {
                  ...item,
                  currentState: deviceSummary.isReachable ? (item.currentState || 'Running') : 'Offline',
                  connected: !!deviceSummary.isReachable
                };
              }
              return item;
            });
          });
        }
      },
      onConnectionStateChange: (state) => {
        setSignalRStatus(state);
      }
    }).catch(err => {
      console.warn("SignalR bağlantısı kurulamadı:", err);
      setSignalRStatus('error');
    });

    return () => {
      clearInterval(pollInterval);
      stopSignalR();
    };
  }, [loadFleetData]);

  // 3. TEZGAH DETAY MODALI AÇILDIĞINDA (KEEPLIVE LOOP İLE CANLI AKIŞ)
  useEffect(() => {
    if (!selectedDevice) {
      stopKeepLiveLoop();
      setLiveDetails(null);
      setDeviceOeeStats(null);
      setDeviceTimeline([]);
      setLiveRawPoints([]);
      return;
    }

    const deviceId = selectedDevice.id;
    startKeepLiveLoop(deviceId, 3000);

    const fetchDetails = async () => {
      try {
        const [liveRes, oeeRes, timelineRes] = await Promise.allSettled([
          getDeviceLive(deviceId),
          getDeviceOee(deviceId, 24),
          getDeviceTimeline(deviceId, 24)
        ]);

        if (liveRes.status === 'fulfilled') setLiveDetails(liveRes.value);
        if (oeeRes.status === 'fulfilled') setDeviceOeeStats(oeeRes.value);
        if (timelineRes.status === 'fulfilled' && Array.isArray(timelineRes.value)) setDeviceTimeline(timelineRes.value);
      } catch (err) {
        console.error("Cihaz canlı detayı çekme hatası:", err);
      }
    };

    fetchDetails();
    const detailInterval = setInterval(fetchDetails, 3000);

    return () => {
      clearInterval(detailInterval);
      stopKeepLiveLoop();
    };
  }, [selectedDevice]);

  // MEVCUT GRUPLARIN LİSTESİ
  const availableGroups = useMemo(() => {
    const groups = new Set(fleetData.map(d => d.group || 'Genel'));
    return Array.from(groups).sort();
  }, [fleetData]);

  // FİLTRELENMİŞ TEZGAH LİSTESİ
  const filteredFleet = useMemo(() => {
    return fleetData.filter(device => {
      if (filterState !== 'ALL') {
        const devState = (device.currentState || 'Offline').toLowerCase();
        const targetState = filterState.toLowerCase();
        
        if (targetState === 'reduced') {
          const fOv = device.feedOverridePct ?? 100;
          const rOv = device.rapidOverridePct ?? 100;
          if (fOv >= 100 && rOv >= 100) return false;
        } else if (targetState === 'running' && devState !== 'running') return false;
        else if (targetState === 'idle' && (devState !== 'idle' && devState !== 'idling')) return false;
        else if (targetState === 'down' && devState !== 'down') return false;
        else if (targetState === 'setup' && devState !== 'setup') return false;
        else if (targetState === 'offline' && devState !== 'offline' && devState !== 'unknown') return false;
      }

      if (selectedGroup !== 'ALL') {
        if ((device.group || 'Genel') !== selectedGroup) return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const nameMatch = (device.name || '').toLowerCase().includes(q);
        const ipMatch = (device.ip || '').toLowerCase().includes(q);
        const progMatch = (device.program || '').toLowerCase().includes(q);
        const groupMatch = (device.group || '').toLowerCase().includes(q);
        return nameMatch || ipMatch || progMatch || groupMatch;
      }

      return true;
    });
  }, [fleetData, filterState, selectedGroup, searchQuery]);

  // TOPLAM DURUM SAYILARI
  const counts = useMemo(() => {
    let running = 0, idle = 0, down = 0, setup = 0, offline = 0, reduced = 0;
    fleetData.forEach(d => {
      const st = (d.currentState || 'Offline').toLowerCase();
      if (st === 'running') running++;
      else if (st === 'idle' || st === 'idling') idle++;
      else if (st === 'down') down++;
      else if (st === 'setup') setup++;
      else offline++;

      const fOv = d.feedOverridePct ?? 100;
      const rOv = d.rapidOverridePct ?? 100;
      if (fOv < 100 || rOv < 100) {
        reduced++;
      }
    });
    return {
      total: fleetData.length,
      running,
      idle,
      down,
      setup,
      offline,
      reduced
    };
  }, [fleetData]);

  // SUNUCU AYARLARI TEST ET & KAYDET
  const handleTestConnection = async (urlToTest = null) => {
    const targetUrl = urlToTest || serverIpInput;
    setIsTesting(true);
    setTestResult(null);
    try {
      const health = await checkHealth(targetUrl);
      setTestResult({
        success: true,
        message: `Bağlantı Başarılı! (PostgreSQL: ${health.postgresConnected ? 'Bağlı' : 'Kapalı'}, Durum: ${health.status || 'OK'})`
      });
    } catch (err) {
      setTestResult({
        success: false,
        message: err.message
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSaveSettings = () => {
    setBaseUrl(serverIpInput);
    setIsSettingsOpen(false);
    loadFleetData();
  };

  // ETKA PORTAL / API GİRİŞİ
  const handleAuthLogin = async (e) => {
    e?.preventDefault();
    if (!authUsername.trim() || !authPassword.trim()) {
      setAuthStatusMsg({ success: false, message: 'Kullanıcı adı/email ve şifre gereklidir.' });
      return;
    }
    setAuthLoading(true);
    setAuthStatusMsg(null);
    try {
      const res = await loginEtka(authUsername, authPassword);
      setAdminTokenState(getAdminToken());
      setAuthStatusMsg({ success: true, message: 'Giriş Başarılı! Token kaydedildi.' });
      loadFleetData();
    } catch (err) {
      setAuthStatusMsg({ success: false, message: `Giriş Hatası: ${err.message}` });
    } finally {
      setAuthLoading(false);
    }
  };

  const handleAuthLogout = async () => {
    await logoutAdmin();
    setAdminTokenState('');
    setAuthStatusMsg({ success: true, message: 'Çıkış yapıldı.' });
    loadFleetData();
  };

  // TEZGAH İSİMLENDİRME (ALIAS) İŞLEMLERİ
  const handleSaveAlias = (e) => {
    e.preventDefault();
    if (!newAliasInput.ipOrId.trim() || !newAliasInput.customName.trim()) {
      alert("Lütfen IP / Cihaz ID ve Özel Tezgah Adını doldurunuz!");
      return;
    }

    const updated = [...aliasList];
    const existingIdx = updated.findIndex(a => a.ipOrId.toLowerCase() === newAliasInput.ipOrId.toLowerCase().trim());
    
    if (existingIdx >= 0) {
      updated[existingIdx] = { ...newAliasInput };
    } else {
      updated.push({ ...newAliasInput });
    }

    setAliasList(updated);
    setMachineAliases(updated);

    setNewAliasInput({
      ipOrId: '',
      customName: '',
      group: 'CNC Dik İşleme',
      location: 'Kalıphane A Blok'
    });
    loadFleetData();
  };

  const handleDeleteAlias = (ipOrId) => {
    if (window.confirm("Bu tezgah isimlendirme eşleştirmesini silmek istediğinize emin misiniz?")) {
      const updated = aliasList.filter(a => a.ipOrId !== ipOrId);
      setAliasList(updated);
      setMachineAliases(updated);
      loadFleetData();
    }
  };

  // DURUM UI ROZETİ VE RENK HARİTASI
  const getStateBadge = (stateStr) => {
    const st = (stateStr || 'Offline').toLowerCase();
    switch (st) {
      case 'running':
        return { label: 'ÇALIŞIYOR', bg: 'bg-emerald-500/10 dark:bg-emerald-950/50', border: 'border-emerald-500/40', text: 'text-emerald-600 dark:text-emerald-400', badgeBg: 'bg-emerald-600', icon: PlayCircle, dot: 'bg-emerald-500 animate-ping' };
      case 'idle':
      case 'idling':
        return { label: 'BOŞTA / DURDU', bg: 'bg-amber-500/10 dark:bg-amber-950/50', border: 'border-amber-500/40', text: 'text-amber-600 dark:text-amber-400', badgeBg: 'bg-amber-500', icon: PauseCircle, dot: 'bg-amber-500' };
      case 'down':
        return { label: 'ALARM / PROBLEM', bg: 'bg-red-500/10 dark:bg-red-950/50', border: 'border-red-500/40', text: 'text-red-600 dark:text-red-400', badgeBg: 'bg-red-600', icon: AlertTriangle, dot: 'bg-red-500 animate-pulse' };
      case 'setup':
        return { label: 'KURULUM / SETUP', bg: 'bg-blue-500/10 dark:bg-blue-950/50', border: 'border-blue-500/40', text: 'text-blue-600 dark:text-blue-400', badgeBg: 'bg-blue-600', icon: Wrench, dot: 'bg-blue-500' };
      default:
        return { label: 'ÇEVRİMDİŞİ', bg: 'bg-slate-100 dark:bg-slate-800/80', border: 'border-slate-300 dark:border-slate-700', text: 'text-slate-500 dark:text-slate-400', badgeBg: 'bg-slate-500', icon: WifiOff, dot: 'bg-slate-400' };
    }
  };

  const formatSeconds = (sec) => {
    if (!sec || isNaN(sec)) return "0 dk";
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    if (h > 0) return `${h} sa ${m} dk`;
    return `${m} dk`;
  };

  const currentBaseUrl = getBaseUrl();
  const isInternalUrl = currentBaseUrl.includes('etkacrm.agdc.com.tr') || currentBaseUrl.includes('172.16.');

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 transition-colors">
      
      {/* ÜST BİLGİ VE BAŞLIK BARI */}
      <div className="bg-white dark:bg-slate-800 border-b dark:border-slate-700 px-6 py-4 shadow-xs">
        <div className="max-w-7xl mx-auto flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div>
            <h1 className="text-xl font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-2.5">
              <Monitor className="w-6 h-6 text-blue-600 dark:text-blue-400 animate-pulse" />
              ETKA OEE — Canlı Tezgah İzleme Panosu
            </h1>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Fabrika CNC tezgahlarının anlık durumu, spindle devirleri, kesme ve boşta ilerleme override yüzdeleri.
              </p>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold border dark:border-slate-600">
                {isInternalUrl ? '🏢 Kurum İçi Ağ / VPN' : '🌍 Kurum Dışı / İnternet'} ({currentBaseUrl})
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => setIsAliasModalOpen(true)}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl shadow-md shadow-emerald-500/20 transition flex items-center gap-1.5"
            >
              <Edit3 size={15} /> ⚙️ Tezgah İsimlendirme ({aliasList.length})
            </button>

            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-bold">
              <span className={`w-2.5 h-2.5 rounded-full ${
                signalRStatus === 'connected' 
                  ? 'bg-emerald-500 animate-pulse' 
                  : (apiConnected 
                      ? 'bg-emerald-500' 
                      : (signalRStatus === 'connecting' ? 'bg-amber-500 animate-ping' : 'bg-red-500'))
              }`} />
              <span className="text-slate-600 dark:text-slate-300">
                {signalRStatus === 'connected' 
                  ? '⚡ Canlı SignalR Bağlı' 
                  : (apiConnected 
                      ? '🟢 Sunucu Bağlı (REST)' 
                      : (signalRStatus === 'connecting' ? 'Bağlanıyor...' : 'Çevrimdışı'))}
              </span>
            </div>

            <button
              onClick={() => {
                setServerIpInput(getBaseUrl());
                setTestResult(null);
                setIsSettingsOpen(true);
              }}
              className="p-2 rounded-xl bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 transition"
              title="Sunucu Bağlantı ve URL Ayarları"
            >
              <Settings size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* ANA İÇERİK KONTEYNERİ */}
      <div className="max-w-7xl mx-auto w-full p-4 md:p-6 space-y-6 flex-1">

        {error && (
          <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-xs font-bold flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div className="flex items-center gap-2">
              <AlertTriangle size={18} className="text-amber-500 shrink-0" />
              <span>
                Sunucuya ({getBaseUrl()}) erişilemedi. Kurum dışındaysanız Ayarlar'dan <b>"Kurum Dışı (195.46.142.179:1106)"</b> seçeneğini işaretleyebilirsiniz.
              </span>
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={() => {
                  setServerIpInput(EXTERNAL_BASE_URL);
                  setBaseUrl(EXTERNAL_BASE_URL);
                  loadFleetData();
                }}
                className="px-3 py-1.5 bg-blue-600 text-white font-black rounded-xl text-xs shadow-xs"
              >
                🌍 Kurum Dışına Geç
              </button>
              <button
                onClick={() => {
                  setServerIpInput(INTERNAL_BASE_URL);
                  setBaseUrl(INTERNAL_BASE_URL);
                  loadFleetData();
                }}
                className="px-3 py-1.5 bg-slate-700 text-white font-black rounded-xl text-xs shadow-xs"
              >
                🏢 Kurum İçi / VPN'e Geç
              </button>
            </div>
          </div>
        )}

        {/* 1. KPİ ÖZET KARTLARI */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-800 border dark:border-slate-700 shadow-xs flex flex-col justify-between">
            <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Toplam Cihaz</span>
            <div className="text-2xl font-black text-slate-900 dark:text-white mt-1 flex items-baseline justify-between">
              <span>{counts.total}</span>
              <span className="text-[11px] font-bold text-slate-400">Tezgah</span>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-emerald-500/10 dark:bg-emerald-950/40 border border-emerald-500/30 text-emerald-900 dark:text-emerald-100 shadow-xs flex flex-col justify-between">
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-extrabold uppercase text-emerald-600 dark:text-emerald-400">✅ Çalışıyor</span>
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
            </div>
            <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1 flex items-baseline justify-between">
              <span>{counts.running}</span>
              <span className="text-[11px] font-bold opacity-80">Tezgah</span>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-amber-500/10 dark:bg-amber-950/40 border border-amber-500/30 text-amber-900 dark:text-amber-100 shadow-xs flex flex-col justify-between">
            <span className="text-[10px] font-extrabold uppercase text-amber-600 dark:text-amber-400">⏳ Boşta / Durdu</span>
            <div className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-1 flex items-baseline justify-between">
              <span>{counts.idle}</span>
              <span className="text-[11px] font-bold opacity-80">Tezgah</span>
            </div>
          </div>

          {/* KISILMIŞ İLERLEME UYARI KPİ KARTI */}
          <div className="p-3.5 rounded-2xl bg-orange-500/10 dark:bg-orange-950/40 border border-orange-500/30 text-orange-900 dark:text-orange-100 shadow-xs flex flex-col justify-between">
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-extrabold uppercase text-orange-600 dark:text-orange-400">📉 Düşük Override</span>
              {counts.reduced > 0 && <span className="w-2.5 h-2.5 rounded-full bg-orange-500 animate-pulse" />}
            </div>
            <div className="text-2xl font-black text-orange-600 dark:text-orange-400 mt-1 flex items-baseline justify-between">
              <span>{counts.reduced}</span>
              <span className="text-[11px] font-bold opacity-80">Tezgah</span>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-red-500/10 dark:bg-red-950/40 border border-red-500/30 text-red-900 dark:text-red-100 shadow-xs flex flex-col justify-between">
            <span className="text-[10px] font-extrabold uppercase text-red-600 dark:text-red-400">⚠️ Problem / Alarm</span>
            <div className="text-2xl font-black text-red-600 dark:text-red-400 mt-1 flex items-baseline justify-between">
              <span>{counts.down}</span>
              <span className="text-[11px] font-bold opacity-80">Kayıt</span>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-800 border dark:border-slate-700 shadow-xs flex flex-col justify-between">
            <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">🔌 Çevrimdışı</span>
            <div className="text-2xl font-black text-slate-400 mt-1 flex items-baseline justify-between">
              <span>{counts.offline}</span>
              <span className="text-[11px] font-bold opacity-80">Tezgah</span>
            </div>
          </div>
        </div>

        {/* 2. FİLTRE VE ARAMA BARI */}
        <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border dark:border-slate-700 shadow-xs flex flex-col md:flex-row justify-between items-stretch md:items-center gap-3">
          <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
            <button
              onClick={() => setFilterState('ALL')}
              className={`px-3 py-1.5 text-xs font-black rounded-lg transition ${
                filterState === 'ALL' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Tümü ({counts.total})
            </button>
            <button
              onClick={() => setFilterState('Running')}
              className={`px-3 py-1.5 text-xs font-black rounded-lg transition ${
                filterState === 'Running' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              ✅ Çalışan ({counts.running})
            </button>
            <button
              onClick={() => setFilterState('Reduced')}
              className={`px-3 py-1.5 text-xs font-black rounded-lg transition ${
                filterState === 'Reduced' ? 'bg-orange-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              📉 Hızı Kısılanlar ({counts.reduced})
            </button>
            <button
              onClick={() => setFilterState('Idle')}
              className={`px-3 py-1.5 text-xs font-black rounded-lg transition ${
                filterState === 'Idle' ? 'bg-amber-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              ⏳ Boşta ({counts.idle})
            </button>
            <button
              onClick={() => setFilterState('Down')}
              className={`px-3 py-1.5 text-xs font-black rounded-lg transition ${
                filterState === 'Down' ? 'bg-red-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              ⚠️ Alarm ({counts.down})
            </button>
            <button
              onClick={() => setFilterState('Offline')}
              className={`px-3 py-1.5 text-xs font-black rounded-lg transition ${
                filterState === 'Offline' ? 'bg-slate-700 text-white shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              🔌 Çevrimdışı ({counts.offline})
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
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

            <div className="relative flex-1 md:w-64">
              <Search size={15} className="absolute left-3 top-3 text-slate-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Tezgah adı, IP veya program..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs font-bold border dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* 3. TEZGAH KARTLARI GRİDİ */}
        {loading && fleetData.length === 0 ? (
          <div className="p-16 text-center text-slate-500 font-bold space-y-3">
            <RefreshCw size={28} className="animate-spin text-blue-600 mx-auto" />
            <p>ETKA OEE Sunucusuna Bağlanılıyor ve Tezgah Verileri Yükleniyor...</p>
          </div>
        ) : filteredFleet.length === 0 ? (
          <div className="p-16 text-center text-slate-500 bg-white dark:bg-slate-800 rounded-2xl border dark:border-slate-700 font-bold space-y-2">
            <Monitor size={32} className="mx-auto text-slate-400" />
            <p>Seçilen filtrelere uygun tezgah bulunamadı.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredFleet.map(device => {
              const badge = getStateBadge(device.currentState);
              const runningPctVal = (device.runningPct !== undefined && device.runningPct !== null) 
                ? (device.runningPct * 100).toFixed(0) 
                : 0;

              const fOv = device.feedOverridePct ?? 100;
              const rOv = device.rapidOverridePct ?? 100;
              const sOv = device.spindleOverridePct ?? 100;

              const isSpeedReduced = fOv < 100 || rOv < 100;

              return (
                <div
                  key={device.id || device.ip}
                  onClick={() => setSelectedDevice(device)}
                  className={`p-4 rounded-2xl border-2 shadow-xs transition-all cursor-pointer hover:shadow-lg hover:scale-[1.01] flex flex-col justify-between space-y-3 bg-white dark:bg-slate-800 ${badge.border}`}
                >
                  <div>
                    <div className="flex justify-between items-start pb-2 border-b dark:border-slate-700">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className={`w-2.5 h-2.5 rounded-full ${badge.dot}`} />
                          <h3 className="text-base font-black text-slate-900 dark:text-white font-mono tracking-tight">
                            {device.name || device.ip}
                          </h3>
                        </div>
                        <span className="text-[11px] font-semibold text-slate-400 font-mono">
                          {device.ip} {device.group ? `• ${device.group}` : ''}
                        </span>
                      </div>

                      <div className="text-right flex flex-col items-end gap-1">
                        <span className={`text-[10px] font-black px-2.5 py-1 rounded-lg uppercase tracking-wider ${badge.badgeBg} text-white shadow-xs`}>
                          {badge.label}
                        </span>
                        {device.currentStateSec > 0 && (
                          <span className="text-[10px] text-slate-400 font-bold">
                            {formatSeconds(device.currentStateSec)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* HIZ KISILDI UYARI ROZETİ (EĞER OPERATÖR İLERLEMEYİ KISTIYSA) */}
                    {isSpeedReduced && (
                      <div className="mt-2.5 p-2 rounded-xl bg-orange-500/10 border border-orange-500/40 text-orange-700 dark:text-orange-300 text-[11px] font-extrabold flex items-center justify-between animate-pulse">
                        <span className="flex items-center gap-1.5">
                          <ShieldAlert size={14} className="text-orange-500 shrink-0" />
                          <span>OPERATÖR HIZI KISTI!</span>
                        </span>
                        <span className="font-mono font-black text-xs">Feed: %{fOv}</span>
                      </div>
                    )}

                    {/* METRİKLER (SPINDLE RPM & FEEDRATE) */}
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                        <span className="text-[10px] font-extrabold text-slate-400 uppercase block">Spindle Devir</span>
                        <div className="text-sm font-mono font-black text-emerald-600 dark:text-emerald-400 mt-0.5">
                          {device.spindleRpm !== null && device.spindleRpm !== undefined ? `${device.spindleRpm} RPM` : '-'}
                        </div>
                      </div>

                      <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                        <span className="text-[10px] font-extrabold text-slate-400 uppercase block">İlerleme (Feed)</span>
                        <div className="text-sm font-mono font-black text-blue-600 dark:text-blue-400 mt-0.5">
                          {device.feedrate !== null && device.feedrate !== undefined ? `${device.feedrate} mm/min` : '-'}
                        </div>
                      </div>
                    </div>

                    {/* CANLI OVERRIDE ÇARPANLARI (FEED %, RAPID %, SPINDLE %) */}
                    <div className="mt-2 grid grid-cols-3 gap-1.5 text-center">
                      {/* Feed Override */}
                      <div className={`p-1.5 rounded-xl border text-[10px] font-bold ${
                        fOv < 100 ? 'bg-orange-500/10 border-orange-500/40 text-orange-600 dark:text-orange-400 font-black' : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                      }`}>
                        <span className="block text-[9px] text-slate-400 uppercase">⚡ İlerleme %</span>
                        <span className="font-mono text-xs font-black">%{fOv}</span>
                      </div>

                      {/* Rapid / Boşta Override */}
                      <div className={`p-1.5 rounded-xl border text-[10px] font-bold ${
                        rOv < 100 ? 'bg-amber-500/10 border-amber-500/40 text-amber-600 dark:text-amber-400 font-black' : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                      }`}>
                        <span className="block text-[9px] text-slate-400 uppercase">🚀 Boşta Hız %</span>
                        <span className="font-mono text-xs font-black">%{rOv}</span>
                      </div>

                      {/* Spindle Override */}
                      <div className={`p-1.5 rounded-xl border text-[10px] font-bold ${
                        sOv < 100 ? 'bg-purple-500/10 border-purple-500/40 text-purple-600 dark:text-purple-400 font-black' : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                      }`}>
                        <span className="block text-[9px] text-slate-400 uppercase">🔄 Devir %</span>
                        <span className="font-mono text-xs font-black">%{sOv}</span>
                      </div>
                    </div>

                    {/* AKTİF PROGRAM ADI */}
                    <div className="mt-2 p-2 rounded-xl bg-slate-100 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700 flex justify-between items-center text-xs">
                      <span className="font-extrabold text-slate-500">NC Program:</span>
                      <span className="font-mono font-black text-yellow-600 dark:text-yellow-400 truncate max-w-[130px]" title={device.program}>
                        {device.program || 'Seçili Değil'}
                      </span>
                    </div>
                  </div>

                  {/* 24 SAATLİK ÇALIŞMA VE VERİMLİLİK BAR */}
                  <div className="pt-2 border-t dark:border-slate-700 space-y-1.5">
                    <div className="flex justify-between items-center text-[11px] font-extrabold">
                      <span className="text-slate-500">24s Çalışma Oranı:</span>
                      <span className="text-emerald-600 dark:text-emerald-400 font-mono font-black">%{runningPctVal}</span>
                    </div>

                    <div className="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden flex">
                      <div 
                        className="bg-emerald-500 h-full transition-all duration-500" 
                        style={{ width: `${runningPctVal}%` }} 
                        title={`Çalışma: ${formatSeconds(device.runningSec)}`}
                      />
                    </div>

                    <div className="flex justify-between items-center text-[10px] text-slate-400 font-semibold pt-0.5">
                      <span>Çalışma: {formatSeconds(device.runningSec)}</span>
                      <span>Boşta: {formatSeconds(device.idleSec)}</span>
                    </div>
                  </div>

                </div>
              );
            })}
          </div>
        )}

      </div>

      {/* ========================================================================= */}
      {/* 4. TEZGAH İSİMLENDİRME & EŞLEŞTİRME MODALI (ALIAS MANAGER) */}
      {/* ========================================================================= */}
      {isAliasModalOpen && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto animate-fadeIn">
          <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-2xl border dark:border-slate-700 max-w-3xl w-full p-6 space-y-4 my-8 max-h-[90vh] overflow-y-auto custom-scrollbar">
            
            <div className="flex justify-between items-start border-b dark:border-slate-700 pb-3">
              <div>
                <h3 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <Edit3 className="text-emerald-500 w-5 h-5" /> ⚙️ Tezgah İsimlendirme & Eşleştirme Paneli
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  IP adreslerini veya cihaz kimliklerini özel tezgah adları ve bölümler ile eşleştirin.
                </p>
              </div>
              <button onClick={() => setIsAliasModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={22} />
              </button>
            </div>

            {/* YENİ EŞLEŞTİRME FORMU */}
            <form onSubmit={handleSaveAlias} className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border dark:border-slate-700 space-y-3">
              <span className="text-xs font-black text-slate-700 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                <PlusIcon size={16} className="text-emerald-500" /> Yeni / Güncellenecek Tezgah Tanımı
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">IP Adresi veya Cihaz ID *</label>
                  <input
                    type="text"
                    required
                    placeholder="Örn: 192.168.2.72"
                    value={newAliasInput.ipOrId}
                    onChange={e => setNewAliasInput({ ...newAliasInput, ipOrId: e.target.value })}
                    className="w-full p-2 text-xs font-mono font-bold border dark:border-slate-600 rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">Verilecek Özel Tezgah Adı *</label>
                  <input
                    type="text"
                    required
                    placeholder="Örn: K22 — FANUC 0i-M"
                    value={newAliasInput.customName}
                    onChange={e => setNewAliasInput({ ...newAliasInput, customName: e.target.value })}
                    className="w-full p-2 text-xs font-bold border dark:border-slate-600 rounded-xl bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">Grup / Departman</label>
                  <input
                    type="text"
                    placeholder="Örn: CNC Dik İşleme"
                    value={newAliasInput.group}
                    onChange={e => setNewAliasInput({ ...newAliasInput, group: e.target.value })}
                    className="w-full p-2 text-xs font-bold border dark:border-slate-600 rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">Konum / Bölüm</label>
                  <input
                    type="text"
                    placeholder="Örn: Kalıphane A Blok"
                    value={newAliasInput.location}
                    onChange={e => setNewAliasInput({ ...newAliasInput, location: e.target.value })}
                    className="w-full p-2 text-xs font-bold border dark:border-slate-600 rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="submit"
                  className="py-2 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl shadow-md flex items-center gap-1.5"
                >
                  <Check size={16} /> Eşleştirmeyi Kaydet
                </button>
              </div>
            </form>

            {/* MEVCUT EŞLEŞTİRME LİSTESİ */}
            <div className="space-y-2">
              <span className="text-xs font-black text-slate-500 uppercase tracking-wider">
                Kayıtlı Tezgah Eşleştirmeleri ({aliasList.length})
              </span>

              <div className="divide-y divide-slate-200 dark:divide-slate-700 max-h-64 overflow-y-auto custom-scrollbar border dark:border-slate-700 rounded-2xl bg-white dark:bg-slate-900">
                {aliasList.map(item => (
                  <div key={item.ipOrId} className="p-3 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800 transition text-xs">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-black text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/80 px-2 py-0.5 rounded border border-blue-200 dark:border-blue-800">
                          {item.ipOrId}
                        </span>
                        <span className="font-black text-slate-900 dark:text-white text-sm">
                          {item.customName}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 font-medium">
                        Grup: <b>{item.group}</b> • Konum: {item.location}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setNewAliasInput({ ...item })}
                        className="p-1.5 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg"
                        title="Düzenle"
                      >
                        <Edit3 size={15} />
                      </button>
                      <button
                        onClick={() => handleDeleteAlias(item.ipOrId)}
                        className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg"
                        title="Sil"
                      >
                        <TrashIcon size={15} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-2 border-t dark:border-slate-700 flex justify-end">
              <button
                onClick={() => setIsAliasModalOpen(false)}
                className="py-2.5 px-5 bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold text-xs rounded-xl"
              >
                Kapat
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. TEZGAH CANLI DETAY POPUP MODALI */}
      {/* ========================================================================= */}
      {selectedDevice && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto animate-fadeIn">
          <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-2xl border dark:border-slate-700 max-w-3xl w-full p-6 space-y-4 my-8 max-h-[90vh] overflow-y-auto custom-scrollbar">
            
            <div className="flex justify-between items-start border-b dark:border-slate-700 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-emerald-500 animate-ping" />
                  <h2 className="text-xl font-black text-slate-900 dark:text-white uppercase font-mono">
                    {selectedDevice.name || selectedDevice.ip}
                  </h2>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-mono">
                  IP: {selectedDevice.ip} • Grup: {selectedDevice.group || 'Genel'} • Protokol: {liveDetails?.protocols?.join(', ') || 'FANUC / Modbus'}
                </p>
              </div>

              <button
                onClick={() => setSelectedDevice(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white p-1 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 transition"
              >
                <X size={22} />
              </button>
            </div>

            <div className="flex border-b dark:border-slate-700 gap-2">
              <button
                onClick={() => setActiveDetailTab('live')}
                className={`px-4 py-2 text-xs font-black rounded-t-xl transition border-b-2 ${
                  activeDetailTab === 'live' 
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-950/30' 
                    : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                ⚡ Canlı Eksen & Devir Verileri
              </button>

              <button
                onClick={() => setActiveDetailTab('oee')}
                className={`px-4 py-2 text-xs font-black rounded-t-xl transition border-b-2 ${
                  activeDetailTab === 'oee' 
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-950/30' 
                    : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                📊 24s OEE & Verimlilik
              </button>

              <button
                onClick={() => setActiveDetailTab('timeline')}
                className={`px-4 py-2 text-xs font-black rounded-t-xl transition border-b-2 ${
                  activeDetailTab === 'timeline' 
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-950/30' 
                    : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                📜 Zaman Çizelgesi ({deviceTimeline.length})
              </button>
            </div>

            {activeDetailTab === 'live' && (
              <div className="space-y-4">
                {/* CNC Alarm Bildirimi */}
                {liveDetails?.alarm ? (
                  <div className="p-3 rounded-2xl bg-red-500/15 border-2 border-red-500 text-red-600 dark:text-red-400 text-xs font-black flex items-center justify-between animate-pulse">
                    <span className="flex items-center gap-2">
                      <BellRing size={18} className="text-red-500" />
                      <span>TEZGAHTA AKTİF CNC ALARMI MEVCUT!</span>
                    </span>
                    <span className="font-mono font-black text-sm">Kod / Değer: {liveDetails.alarm}</span>
                  </div>
                ) : null}

                {/* 3 TEMEL HIZ OVERRIDE METRİK KARTLARI */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-900 border dark:border-slate-700">
                    <span className="text-[10px] font-extrabold text-slate-400 uppercase">Spindle RPM</span>
                    <div className="text-xl font-mono font-black text-emerald-500 mt-1">
                      {liveDetails?.spindleRpm ?? selectedDevice.spindleRpm ?? '-'}
                    </div>
                  </div>

                  <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-900 border dark:border-slate-700">
                    <span className="text-[10px] font-extrabold text-slate-400 uppercase">İlerleme (Feed)</span>
                    <div className="text-xl font-mono font-black text-blue-500 mt-1">
                      {liveDetails?.feedrate ?? selectedDevice.feedrate ?? '-'} <span className="text-xs">mm/min</span>
                    </div>
                  </div>

                  {/* Feed Override */}
                  <div className={`p-3 rounded-2xl border ${
                    (liveDetails?.feedOverridePct ?? selectedDevice.feedOverridePct ?? 100) < 100 
                      ? 'bg-orange-500/10 border-orange-500/50 text-orange-600 dark:text-orange-400' 
                      : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700'
                  }`}>
                    <span className="text-[10px] font-extrabold uppercase block">⚡ Kesme İlerleme %</span>
                    <div className="text-xl font-mono font-black mt-1">
                      %{liveDetails?.feedOverridePct ?? selectedDevice.feedOverridePct ?? 100}
                    </div>
                  </div>

                  {/* Rapid (Boşta İlerleme) Override */}
                  <div className={`p-3 rounded-2xl border ${
                    (liveDetails?.rapidOverridePct ?? selectedDevice.rapidOverridePct ?? 100) < 100 
                      ? 'bg-amber-500/10 border-amber-500/50 text-amber-600 dark:text-amber-400' 
                      : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700'
                  }`}>
                    <span className="text-[10px] font-extrabold uppercase block">🚀 Boşta (Rapid) %</span>
                    <div className="text-xl font-mono font-black mt-1">
                      %{liveDetails?.rapidOverridePct ?? selectedDevice.rapidOverridePct ?? 100}
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border dark:border-slate-700">
                  <h4 className="text-xs font-black uppercase text-slate-500 dark:text-slate-400 mb-2 flex items-center gap-1.5">
                    <Gauge size={15} className="text-blue-500" /> Canlı Eksen Pozisyonları
                  </h4>

                  {liveDetails?.axes && liveDetails.axes.length > 0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {liveDetails.axes.map(axis => (
                        <div key={axis.name} className="p-3 rounded-xl bg-white dark:bg-slate-800 border dark:border-slate-700 text-center">
                          <span className="text-xs font-mono font-black text-blue-500 block">Eksen {axis.name}</span>
                          <span className="text-lg font-mono font-black text-slate-900 dark:text-white mt-0.5 block">
                            {typeof axis.position === 'number' ? axis.position.toFixed(3) : axis.position}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 italic">Eksen pozisyon verisi bekleniyor...</p>
                  )}
                </div>
              </div>
            )}

            {activeDetailTab === 'oee' && (
              <div className="space-y-4">
                {deviceOeeStats?.availability ? (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30">
                      <span className="text-xs font-extrabold text-emerald-600 dark:text-emerald-400 uppercase">Kullanılabilirlik (Availability)</span>
                      <div className="text-3xl font-black text-emerald-600 dark:text-emerald-400 mt-1 font-mono">
                        %{(deviceOeeStats.availability.availability * 100).toFixed(1)}
                      </div>
                    </div>

                    <div className="p-4 rounded-2xl bg-blue-500/10 border border-blue-500/30">
                      <span className="text-xs font-extrabold text-blue-600 dark:text-blue-400 uppercase">Faydalanma (Utilization)</span>
                      <div className="text-3xl font-black text-blue-600 dark:text-blue-400 mt-1 font-mono">
                        %{(deviceOeeStats.availability.utilization * 100).toFixed(1)}
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 italic">OEE İstatistikleri çekiliyor...</p>
                )}
              </div>
            )}

            {activeDetailTab === 'timeline' && (
              <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar">
                {deviceTimeline.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">Zaman çizelgesi geçmiş kaydı bulunmuyor.</p>
                ) : (
                  deviceTimeline.map((item, idx) => (
                    <div key={idx} className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border dark:border-slate-700 flex justify-between items-center text-xs">
                      <span className="font-mono font-bold text-slate-400">
                        {new Date(item.startUtc).toLocaleTimeString()} - {item.endUtc ? new Date(item.endUtc).toLocaleTimeString() : 'Devam Ediyor'}
                      </span>
                      <span className="font-black uppercase px-2 py-0.5 rounded bg-blue-600 text-white">
                        {item.state}
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}

            <div className="pt-2 border-t dark:border-slate-700 flex justify-end">
              <button
                onClick={() => setSelectedDevice(null)}
                className="py-2 px-4 bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold text-xs rounded-xl"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 6. SUNUCU BAĞLANTI AYARLARI MODALI */}
      {/* ========================================================================= */}
      {isSettingsOpen && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-2xl border dark:border-slate-700 max-w-lg w-full p-6 space-y-4">
            
            <div className="flex justify-between items-start border-b dark:border-slate-700 pb-3">
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <Server className="text-blue-500 w-5 h-5" /> ETKA OEE Sunucu Bağlantısı
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Bağlantı ortamınıza uygun sunucu adresini seçin veya özel URL girin.
                </p>
              </div>
              <button onClick={() => setIsSettingsOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>

            {/* HIZLI ADRES SEÇİMİ (PRESETS) */}
            <div className="space-y-2">
              <span className="text-xs font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider block">
                🎯 Hızlı Sunucu Konumu Seçin:
              </span>

              <div className="grid grid-cols-1 gap-2.5">
                {PRESET_BASE_URLS.map(preset => {
                  const isSelected = serverIpInput.trim().replace(/\/+$/, '') === preset.url;
                  return (
                    <div
                      key={preset.id}
                      onClick={() => {
                        setServerIpInput(preset.url);
                        handleTestConnection(preset.url);
                      }}
                      className={`p-3 rounded-2xl border-2 transition cursor-pointer flex justify-between items-center ${
                        isSelected 
                          ? 'border-blue-500 bg-blue-50/60 dark:bg-blue-950/40 text-blue-900 dark:text-blue-100 shadow-sm' 
                          : 'border-slate-200 dark:border-slate-700 hover:border-slate-400 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-xs">{preset.label}</span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                            {preset.badge}
                          </span>
                        </div>
                        <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                          {preset.url}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {preset.description}
                        </div>
                      </div>

                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                        isSelected ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-400'
                      }`}>
                        {isSelected && <Check size={12} strokeWidth={3} />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <div>
                <label className="block text-xs font-black text-slate-700 dark:text-slate-200 mb-1">
                  🌐 Özel Sunucu Base URL
                </label>
                <input
                  type="text"
                  placeholder="Örn: http://etkacrm.agdc.com.tr:1106"
                  value={serverIpInput}
                  onChange={(e) => setServerIpInput(e.target.value)}
                  className="w-full p-2.5 text-xs font-mono font-bold border dark:border-slate-600 rounded-xl bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {testResult && (
                <div className={`p-3 rounded-xl text-xs font-bold flex flex-col gap-2 ${
                  testResult.success ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300' : 'bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 border border-red-300'
                }`}>
                  <div className="flex items-start gap-2">
                    {testResult.success ? <CheckCircle2 size={16} className="shrink-0 mt-0.5" /> : <AlertTriangle size={16} className="shrink-0 mt-0.5 text-red-500" />}
                    <span>{testResult.message}</span>
                  </div>

                  {!testResult.success && typeof window !== 'undefined' && window.location.protocol === 'https:' && (
                    <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/80 border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200 text-[11px] font-medium space-y-1">
                      <p className="font-bold flex items-center gap-1 text-amber-700 dark:text-amber-300">
                        <Info size={14} /> Tarayıcıda 10 Saniyede İzin Verme Çözümü:
                      </p>
                      <ol className="list-decimal list-inside space-y-0.5 pl-1">
                        <li>Tarayıcınızın adres çubuğundaki sol taraftaki <b>Kilit 🔒 / Ayarlar</b> simgesine tıklayın.</li>
                        <li><b>Site Ayarları (Site Settings)</b> seçeneğine girin.</li>
                        <li><b>Güvenli Olmayan İçerik (Insecure Content)</b> ayarını <b>"İzin Ver (Allow)"</b> yapın.</li>
                        <li>Sayfayı yenileyin.</li>
                      </ol>
                    </div>
                  )}
                </div>
              )}

              {/* ETKA PORTAL / API GİRİŞİ (YETKİLENDİRME) */}
              <div className="pt-2 border-t dark:border-slate-700 space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-black text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                    <ShieldCheck size={15} className="text-blue-500" /> ETKA Portal / API Yetkilendirmesi (Opsiyonel)
                  </label>
                  {adminTokenState && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                      ✅ Token Kayıtlı
                    </span>
                  )}
                </div>

                {adminTokenState ? (
                  <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-900 border dark:border-slate-700 flex justify-between items-center">
                    <div className="text-[11px] font-mono text-slate-600 dark:text-slate-300 truncate max-w-[240px]">
                      Bearer Token: {adminTokenState.slice(0, 16)}...
                    </div>
                    <button
                      type="button"
                      onClick={handleAuthLogout}
                      className="px-2 py-1 text-[11px] font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg"
                    >
                      Çıkış Yap
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      placeholder="Kullanıcı Adı / Email"
                      value={authUsername}
                      onChange={e => setAuthUsername(e.target.value)}
                      className="p-2 text-xs border dark:border-slate-600 rounded-xl bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
                    />
                    <div className="flex gap-1.5">
                      <input
                        type="password"
                        placeholder="Şifre"
                        value={authPassword}
                        onChange={e => setAuthPassword(e.target.value)}
                        className="w-full p-2 text-xs border dark:border-slate-600 rounded-xl bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
                      />
                      <button
                        type="button"
                        onClick={handleAuthLogin}
                        disabled={authLoading}
                        className="px-3 py-2 bg-slate-800 dark:bg-slate-700 text-white font-bold text-xs rounded-xl hover:bg-slate-900 shrink-0"
                      >
                        {authLoading ? '...' : 'Giriş'}
                      </button>
                    </div>
                  </div>
                )}

                {authStatusMsg && (
                  <p className={`text-[11px] font-bold ${authStatusMsg.success ? 'text-emerald-500' : 'text-red-500'}`}>
                    {authStatusMsg.message}
                  </p>
                )}
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => handleTestConnection()}
                  disabled={isTesting}
                  className="flex-1 py-2.5 px-3 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-slate-800 dark:text-slate-200 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5"
                >
                  <RefreshCw size={14} className={isTesting ? 'animate-spin' : ''} /> Test Et
                </button>

                <button
                  type="button"
                  onClick={handleSaveSettings}
                  className="flex-1 py-2.5 px-3 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs rounded-xl shadow-md shadow-blue-500/20 flex items-center justify-center gap-1.5"
                >
                  <Check size={16} /> Kaydet ve Bağlan
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};

export default CanliDurum;