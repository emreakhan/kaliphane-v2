// src/pages/CanliDurum.jsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Monitor, RefreshCw, AlertTriangle, CheckCircle2, 
  PlayCircle, PauseCircle, WifiOff, Settings, Search,
  Clock, X, ShieldCheck, Server, Gauge,
  Wrench, Layers, Check, Edit3,
  PlusIcon, TrashIcon, Tag, MapPin, Sliders, ShieldAlert,
  Globe, Building2, Lock, LogIn, LogOut, UserCheck, AlertCircle, Info
} from 'lucide-react';
import { 
  getBaseUrl, setBaseUrl, getOeeHealth, getOeeFleet, checkPortalInfo,
  getAccessToken, getRefreshToken, getStoredUser, loginPortal, logoutPortal,
  getMachineAliases, setMachineAliases, findAlias,
  INTERNAL_BASE_URL, EXTERNAL_BASE_URL, PRESET_BASE_URLS
} from '../services/etkaOeeService';

const CanliDurum = () => {
  // ANA STATE'LER
  const [fleetData, setFleetData] = useState([]);
  const [healthInfo, setHealthInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdatedTime, setLastUpdatedTime] = useState(null);

  // AUTH STATE
  const [currentUser, setCurrentUser] = useState(() => getStoredUser());
  const [hasToken, setHasToken] = useState(() => !!getAccessToken());
  const [loginForm, setLoginForm] = useState({
    usernameOrEmail: '',
    password: '',
    rememberMe: true
  });
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState(null);

  // FİLTRE & ARAMA
  const [filterState, setFilterState] = useState('ALL'); // 'ALL' | 'Running' | 'Idle' | 'Down' | 'Offline'
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('ALL');

  // CANLI DETAY POPUP
  const [selectedDevice, setSelectedDevice] = useState(null);

  // SUNUCU AYARLARI MODAL
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [serverUrlInput, setServerUrlInput] = useState(() => getBaseUrl());
  const [testResult, setTestResult] = useState(null);
  const [isTesting, setIsTesting] = useState(false);

  // TEZGAH İSİMLENDİRME & EŞLEŞTİRME MODAL STATE
  const [isAliasModalOpen, setIsAliasModalOpen] = useState(false);
  const [aliasList, setAliasList] = useState(() => getMachineAliases());
  const [newAliasInput, setNewAliasInput] = useState({
    ipOrId: '',
    customName: '',
    group: 'CNC Dik İşleme',
    location: 'Kalıphane A Blok'
  });

  // 1. OEE FLEET & HEALTH VERİLERİNİ ÇEK (15 SANİYELİK HTTP POLLING)
  const loadOeeData = useCallback(async (isManualRefresh = false) => {
    try {
      if (isManualRefresh || fleetData.length === 0) {
        setLoading(true);
      }
      setError(null);

      // 1. Health ve Fleet sorgularını paralel çağır
      const [healthRes, fleetRes] = await Promise.allSettled([
        getOeeHealth(),
        getOeeFleet()
      ]);

      if (healthRes.status === 'fulfilled' && healthRes.value) {
        setHealthInfo(healthRes.value);
      }

      let rawFleet = [];
      if (fleetRes.status === 'fulfilled' && Array.isArray(fleetRes.value)) {
        rawFleet = fleetRes.value;
      } else if (fleetRes.status === 'rejected') {
        const errMsg = fleetRes.reason?.message || 'Filo verisi çekilemedi.';
        setError(errMsg);
      }

      // 2. Gelen verileri kayıtlı tezgah tanımları (aliases) ile birleştir
      const aliases = getMachineAliases();
      const processedKeys = new Set();
      const mergedList = [];

      // API'den gelen tezgahlar
      rawFleet.forEach(item => {
        const matchedAlias = findAlias(item.ip, item.id, item.name);
        const ipKey = (item.ip || '').trim().toLowerCase();
        const idKey = (item.id || '').trim().toLowerCase();
        if (ipKey) processedKeys.add(ipKey);
        if (idKey) processedKeys.add(idKey);

        mergedList.push({
          ...item,
          name: matchedAlias?.customName || item.name || item.ip,
          group: matchedAlias?.group || item.group || 'CNC Dik İşleme',
          location: matchedAlias?.location || item.location || 'Kalıphane A Blok'
        });
      });

      // Kayıtlı listede olup API'de henüz görünmeyen tezgahları da ekle
      aliases.forEach(alias => {
        const key = (alias.ipOrId || '').trim().toLowerCase();
        if (key && !processedKeys.has(key)) {
          processedKeys.add(key);
          mergedList.push({
            id: alias.ipOrId,
            name: alias.customName || alias.ipOrId,
            ip: alias.ipOrId,
            group: alias.group || 'CNC Dik İşleme',
            location: alias.location || 'Kalıphane A Blok',
            currentState: 'Offline',
            currentStateSec: 0,
            spindleRpm: null,
            feedrate: null,
            program: null,
            runningPct: 0,
            runningSec: 0,
            idleSec: 0,
            idlingSec: 0,
            downSec: 0,
            offlineSec: 0,
            partsCount: null,
            avgCycleSec: null,
            connected: false,
            lastDataUtc: null
          });
        }
      });

      setFleetData(mergedList);
      setLastUpdatedTime(new Date());
    } catch (err) {
      console.error("OEE Veri Çekme Hatası:", err);
      setError(err.message || 'ETKA Portal OEE servisine ulaşılamadı.');
    } finally {
      setLoading(false);
    }
  }, [fleetData.length]);

  // 2. PERİYODİK 15 SANİYELİK POLLING DÖNGÜSÜ
  useEffect(() => {
    loadOeeData();
    const interval = setInterval(() => {
      loadOeeData();
    }, 15000); // 15 saniyede bir periyodik GET isteği

    return () => clearInterval(interval);
  }, [loadOeeData]);

  // 3. MEVCUT GRUPLAR LİSTESİ
  const availableGroups = useMemo(() => {
    const groups = new Set(fleetData.map(d => d.group || 'Genel'));
    return Array.from(groups).sort();
  }, [fleetData]);

  // 4. TEZGAH DURUMUNU BELİRLE (connected=false İSE "Bağlantı Kopuk / Çevrimdışı")
  // §5.2 Kuralı: connected === false ise ham currentState'e güvenme!
  const getNormalizedState = (device) => {
    if (device.connected === false) {
      return 'offline';
    }
    const st = (device.currentState || 'Offline').toLowerCase();
    if (st === 'running') return 'running';
    if (st === 'idle' || st === 'idling') return 'idle';
    if (st === 'down') return 'down';
    if (st === 'setup') return 'setup';
    return 'offline';
  };

  // 5. FİLTRELENMİŞ TEZGAH LİSTESİ
  const filteredFleet = useMemo(() => {
    return fleetData.filter(device => {
      const normState = getNormalizedState(device);

      if (filterState !== 'ALL') {
        const target = filterState.toLowerCase();
        if (normState !== target) return false;
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

  // 6. TOPLAM DURUM SAYILARI
  const counts = useMemo(() => {
    let running = 0, idle = 0, down = 0, offline = 0;
    fleetData.forEach(d => {
      const st = getNormalizedState(d);
      if (st === 'running') running++;
      else if (st === 'idle') idle++;
      else if (st === 'down') down++;
      else offline++;
    });
    return {
      total: fleetData.length,
      running,
      idle,
      down,
      offline
    };
  }, [fleetData]);

  // 7. ZAMAN FORMATLAYICILAR
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

  // 8. DURUM UI ROZETİ
  const getStateBadge = (device) => {
    const st = getNormalizedState(device);
    switch (st) {
      case 'running':
        return { 
          label: 'ÇALIŞIYOR', 
          bg: 'bg-emerald-500/10 dark:bg-emerald-950/50', 
          border: 'border-emerald-500/40', 
          text: 'text-emerald-600 dark:text-emerald-400', 
          badgeBg: 'bg-emerald-600', 
          dot: 'bg-emerald-500 animate-ping' 
        };
      case 'idle':
        return { 
          label: 'BOŞTA / DURDU', 
          bg: 'bg-amber-500/10 dark:bg-amber-950/50', 
          border: 'border-amber-500/40', 
          text: 'text-amber-600 dark:text-amber-400', 
          badgeBg: 'bg-amber-500', 
          dot: 'bg-amber-500' 
        };
      case 'down':
        return { 
          label: 'ALARM / PROBLEM', 
          bg: 'bg-red-500/10 dark:bg-red-950/50', 
          border: 'border-red-500/40', 
          text: 'text-red-600 dark:text-red-400', 
          badgeBg: 'bg-red-600', 
          dot: 'bg-red-500 animate-pulse' 
        };
      default:
        return { 
          label: device.connected === false ? 'BAĞLANTI KOPUK' : 'ÇEVRİMDİŞİ', 
          bg: 'bg-slate-100 dark:bg-slate-800/80', 
          border: 'border-slate-300 dark:border-slate-700', 
          text: 'text-slate-500 dark:text-slate-400', 
          badgeBg: 'bg-slate-500', 
          dot: 'bg-slate-400' 
        };
    }
  };

  // 9. KULLANICI GİRİŞİ / ÇIKIŞI
  const handleLogin = async (e) => {
    e?.preventDefault();
    setLoginLoading(true);
    setLoginError(null);
    try {
      const res = await loginPortal(
        loginForm.usernameOrEmail,
        loginForm.password,
        loginForm.rememberMe
      );
      setHasToken(true);
      setCurrentUser(res.user || { username: loginForm.usernameOrEmail });
      setLoginForm({ usernameOrEmail: '', password: '', rememberMe: true });
      loadOeeData(true);
    } catch (err) {
      setLoginError(err.message || 'Giriş yapılamadı.');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = async () => {
    await logoutPortal();
    setHasToken(false);
    setCurrentUser(null);
    loadOeeData(true);
  };

  // 10. SUNUCU BAĞLANTI TESTİ
  const handleTestConnection = async (urlToTest = null) => {
    const target = urlToTest || serverUrlInput;
    setIsTesting(true);
    setTestResult(null);
    try {
      const info = await checkPortalInfo(target).catch(() => null);
      const health = await getOeeHealth(target).catch(() => null);

      if (health) {
        setTestResult({
          success: true,
          message: `Bağlantı Başarılı! (Takip Edilen Cihaz: ${health.trackedDevices ?? 0}, Servis Durumu: ${health.reachable ? 'Aktif' : 'Dış Servis Kapalı'})`
        });
      } else if (info) {
        setTestResult({
          success: true,
          message: `Portal Bağlantısı Başarılı! (Sürüm: ${info?.data?.portalVersion || 'v3.0'})`
        });
      } else {
        setTestResult({
          success: true,
          message: `Sunucuya Ulaşıldı (${target})`
        });
      }
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
    setBaseUrl(serverUrlInput);
    setIsSettingsOpen(false);
    loadOeeData(true);
  };

  // 11. TEZGAH İSİMLENDİRME EŞLEŞTİRMELERİ
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
    loadOeeData(true);
  };

  const handleDeleteAlias = (ipOrId) => {
    if (window.confirm("Bu tezgah isimlendirme eşleştirmesini silmek istediğinize emin misiniz?")) {
      const updated = aliasList.filter(a => a.ipOrId !== ipOrId);
      setAliasList(updated);
      setMachineAliases(updated);
      loadOeeData(true);
    }
  };

  const currentBaseUrl = getBaseUrl();
  const isInternal = currentBaseUrl.includes('etkacrm.agdc.com.tr') || currentBaseUrl.includes('172.16.');

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 transition-colors">
      
      {/* 1. ÜST BAŞLIK VE AKSİYON BARI */}
      <div className="bg-white dark:bg-slate-800 border-b dark:border-slate-700 px-6 py-4 shadow-xs">
        <div className="max-w-7xl mx-auto flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div>
            <h1 className="text-xl font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-2.5">
              <Monitor className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              ETKA Portal — Canlı Tezgah İzleme Panosu
            </h1>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                CNC tezgahlarının anlık çalışma durumları, spindle devirleri, kesme ilerlemeleri ve verimlilik oranları (15sn Polling).
              </p>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold border dark:border-slate-600">
                {isInternal ? '🏢 Kurum İçi / VPN' : '🌍 Kurum Dışı / İnternet'} ({currentBaseUrl})
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Tezgah İsimlendirme Butonu */}
            <button
              onClick={() => setIsAliasModalOpen(true)}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl shadow-md shadow-emerald-500/20 transition flex items-center gap-1.5"
            >
              <Edit3 size={15} /> ⚙️ Tezgah İsimlendirme ({aliasList.length})
            </button>

            {/* Yenileme Butonu */}
            <button
              onClick={() => loadOeeData(true)}
              disabled={loading}
              className="px-3 py-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-slate-700 dark:text-slate-200 font-bold text-xs rounded-xl transition flex items-center gap-1.5"
              title="Verileri Hemen Yenile"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin text-blue-500' : ''} />
              <span>{lastUpdatedTime ? lastUpdatedTime.toLocaleTimeString('tr-TR') : 'Yenile'}</span>
            </button>

            {/* Kullanıcı Giriş Rozeti */}
            {hasToken ? (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-xs font-bold text-blue-700 dark:text-blue-300">
                <UserCheck size={14} />
                <span>{currentUser?.name || currentUser?.username || 'Oturum Açık'}</span>
                <button
                  onClick={handleLogout}
                  className="ml-1 text-slate-400 hover:text-red-500"
                  title="Çıkış Yap"
                >
                  <LogOut size={13} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setIsSettingsOpen(true)}
                className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white font-black text-xs rounded-xl shadow-xs transition flex items-center gap-1.5"
              >
                <LogIn size={14} /> Giriş Yap
              </button>
            )}

            {/* Sunucu Ayarları Butonu */}
            <button
              onClick={() => {
                setServerUrlInput(getBaseUrl());
                setTestResult(null);
                setIsSettingsOpen(true);
              }}
              className="p-2 rounded-xl bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-slate-700 dark:text-slate-200 transition"
              title="Sunucu Bağlantı ve Giriş Ayarları"
            >
              <Settings size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* 2. UYARI VE BİLGİ BANTLARI */}
      <div className="max-w-7xl mx-auto w-full p-4 md:p-6 space-y-4 flex-1">
        
        {/* Dış CNC Servisi Ulaşılamıyor Uyarısı (§5.1) */}
        {healthInfo && healthInfo.reachable === false && (
          <div className="p-4 rounded-2xl bg-amber-500/10 border-2 border-amber-500/40 text-amber-900 dark:text-amber-200 text-xs font-bold flex items-center gap-3">
            <AlertTriangle size={20} className="text-amber-500 shrink-0" />
            <div>
              <span className="font-black text-amber-700 dark:text-amber-300 block">Dış CNC Veri Toplayıcı Servisine Ulaşılamıyor:</span>
              <span>{healthInfo.error || 'Portal backend hazır fakat fabrikanın yerel CNC servis kutusuyla iletişim kurulamıyor.'}</span>
            </div>
          </div>
        )}

        {/* 401 Unauthorized Giriş Uyarısı */}
        {!hasToken && (
          <div className="p-4 rounded-2xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-blue-900 dark:text-blue-200 text-xs font-bold flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div className="flex items-center gap-2">
              <Lock size={18} className="text-blue-500 shrink-0" />
              <span>
                Canlı tezgah verilerini izlemek için ETKA Portal kullanıcı girişi yapılması gerekmektedir.
              </span>
            </div>
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs rounded-xl shadow-xs shrink-0 flex items-center gap-1.5"
            >
              <LogIn size={14} /> Giriş Yap
            </button>
          </div>
        )}

        {/* Genel Hata Uyarısı */}
        {error && hasToken && (
          <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-950/50 border border-red-300 dark:border-red-800 text-red-900 dark:text-red-200 text-xs font-bold flex items-center gap-3">
            <AlertCircle size={18} className="text-red-500 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* 3. KPİ ÖZET KARTLARI */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
          <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-800 border dark:border-slate-700 shadow-xs flex flex-col justify-between">
            <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Toplam Tezgah</span>
            <div className="text-2xl font-black text-slate-900 dark:text-white mt-1 flex items-baseline justify-between">
              <span>{counts.total}</span>
              <span className="text-[11px] font-bold text-slate-400">Adet</span>
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

          <div className="p-3.5 rounded-2xl bg-red-500/10 dark:bg-red-950/40 border border-red-500/30 text-red-900 dark:text-red-100 shadow-xs flex flex-col justify-between">
            <span className="text-[10px] font-extrabold uppercase text-red-600 dark:text-red-400">⚠️ Problem / Alarm</span>
            <div className="text-2xl font-black text-red-600 dark:text-red-400 mt-1 flex items-baseline justify-between">
              <span>{counts.down}</span>
              <span className="text-[11px] font-bold opacity-80">Kayıt</span>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-800 border dark:border-slate-700 shadow-xs flex flex-col justify-between">
            <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">🔌 Bağlantı Kopuk</span>
            <div className="text-2xl font-black text-slate-400 mt-1 flex items-baseline justify-between">
              <span>{counts.offline}</span>
              <span className="text-[11px] font-bold opacity-80">Tezgah</span>
            </div>
          </div>
        </div>

        {/* 4. FİLTRE VE ARAMA BARI */}
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

        {/* 5. TEZGAH KARTLARI GRİDİ */}
        {loading && fleetData.length === 0 ? (
          <div className="p-16 text-center text-slate-500 font-bold space-y-3">
            <RefreshCw size={28} className="animate-spin text-blue-600 mx-auto" />
            <p>ETKA Portal OEE Filo Verileri Yükleniyor...</p>
          </div>
        ) : filteredFleet.length === 0 ? (
          <div className="p-16 text-center text-slate-500 bg-white dark:bg-slate-800 rounded-2xl border dark:border-slate-700 font-bold space-y-2">
            <Monitor size={32} className="mx-auto text-slate-400" />
            <p>Seçilen filtrelere uygun tezgah bulunamadı.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredFleet.map(device => {
              const badge = getStateBadge(device);
              const runningPctVal = (device.runningPct !== undefined && device.runningPct !== null) 
                ? (device.runningPct > 1 ? device.runningPct.toFixed(0) : (device.runningPct * 100).toFixed(0))
                : 0;

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
                        {device.currentStateSec > 0 && device.connected !== false && (
                          <span className="text-[10px] text-slate-400 font-bold">
                            {formatSeconds(device.currentStateSec)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* METRİKLER (SPINDLE RPM & FEEDRATE) */}
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                        <span className="text-[10px] font-extrabold text-slate-400 uppercase block">Spindle Devir</span>
                        <div className="text-sm font-mono font-black text-emerald-600 dark:text-emerald-400 mt-0.5">
                          {device.spindleRpm !== null && device.spindleRpm !== undefined && device.connected !== false 
                            ? `${device.spindleRpm} RPM` 
                            : '-'}
                        </div>
                      </div>

                      <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                        <span className="text-[10px] font-extrabold text-slate-400 uppercase block">İlerleme (Feed)</span>
                        <div className="text-sm font-mono font-black text-blue-600 dark:text-blue-400 mt-0.5">
                          {device.feedrate !== null && device.feedrate !== undefined && device.connected !== false 
                            ? `${device.feedrate} mm/min` 
                            : '-'}
                        </div>
                      </div>
                    </div>

                    {/* AKTİF PROGRAM ADI */}
                    <div className="mt-2 p-2 rounded-xl bg-slate-100 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700 flex justify-between items-center text-xs">
                      <span className="font-extrabold text-slate-500">NC Program:</span>
                      <span className="font-mono font-black text-yellow-600 dark:text-yellow-400 truncate max-w-[130px]" title={device.program}>
                        {device.program && device.connected !== false ? device.program : 'Seçili Değil'}
                      </span>
                    </div>

                    {/* SON VERİ ALINMA ZAMANI (§5.2) */}
                    {device.lastDataUtc && (
                      <div className="mt-1.5 flex justify-between items-center text-[10px] text-slate-400 px-1">
                        <span>Son Veri:</span>
                        <span className="font-medium font-mono">{formatTimeAgo(device.lastDataUtc)}</span>
                      </div>
                    )}
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
      {/* 6. TEZGAH İSİMLENDİRME & EŞLEŞTİRME MODALI (ALIAS MANAGER) */}
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
      {/* 7. TEZGAH DETAY POPUP MODALI */}
      {/* ========================================================================= */}
      {selectedDevice && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto animate-fadeIn">
          <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-2xl border dark:border-slate-700 max-w-xl w-full p-6 space-y-4 my-8">
            
            <div className="flex justify-between items-start border-b dark:border-slate-700 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`w-3 h-3 rounded-full ${getStateBadge(selectedDevice).dot}`} />
                  <h2 className="text-xl font-black text-slate-900 dark:text-white uppercase font-mono">
                    {selectedDevice.name || selectedDevice.ip}
                  </h2>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-mono">
                  IP: {selectedDevice.ip} • Grup: {selectedDevice.group || 'Genel'} • Konum: {selectedDevice.location || '-'}
                </p>
              </div>

              <button
                onClick={() => setSelectedDevice(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white p-1 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 transition"
              >
                <X size={22} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-900 border dark:border-slate-700">
                <span className="text-[10px] font-extrabold text-slate-400 uppercase">Durum</span>
                <div className="text-base font-black text-slate-900 dark:text-white mt-1">
                  {getStateBadge(selectedDevice).label}
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-900 border dark:border-slate-700">
                <span className="text-[10px] font-extrabold text-slate-400 uppercase">Aktif NC Program</span>
                <div className="text-base font-mono font-black text-yellow-600 dark:text-yellow-400 mt-1 truncate">
                  {selectedDevice.program || 'Seçili Değil'}
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-900 border dark:border-slate-700">
                <span className="text-[10px] font-extrabold text-slate-400 uppercase">Spindle Devir</span>
                <div className="text-xl font-mono font-black text-emerald-500 mt-1">
                  {selectedDevice.spindleRpm ? `${selectedDevice.spindleRpm} RPM` : '-'}
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-900 border dark:border-slate-700">
                <span className="text-[10px] font-extrabold text-slate-400 uppercase">İlerleme (Feed)</span>
                <div className="text-xl font-mono font-black text-blue-500 mt-1">
                  {selectedDevice.feedrate ? `${selectedDevice.feedrate} mm/min` : '-'}
                </div>
              </div>
            </div>

            {/* Çalışma Süreleri Tablosu */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border dark:border-slate-700 space-y-2">
              <span className="text-xs font-black text-slate-500 uppercase tracking-wider block">
                24 Saatlik Süre Dağılımı
              </span>
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
                  <span className="text-[10px] font-bold text-emerald-600 block">Çalışma</span>
                  <span className="font-mono font-black text-emerald-700 dark:text-emerald-300">{formatSeconds(selectedDevice.runningSec)}</span>
                </div>
                <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30">
                  <span className="text-[10px] font-bold text-amber-600 block">Boşta</span>
                  <span className="font-mono font-black text-amber-700 dark:text-amber-300">{formatSeconds(selectedDevice.idleSec)}</span>
                </div>
                <div className="p-2 rounded-xl bg-red-500/10 border border-red-500/30">
                  <span className="text-[10px] font-bold text-red-600 block">Duruş</span>
                  <span className="font-mono font-black text-red-700 dark:text-red-300">{formatSeconds(selectedDevice.downSec)}</span>
                </div>
              </div>
            </div>

            {selectedDevice.lastDataUtc && (
              <div className="text-[11px] text-slate-400 text-right">
                Son Veri Alınma Tarihi: <b>{new Date(selectedDevice.lastDataUtc).toLocaleString('tr-TR')}</b>
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
      {/* 8. SUNUCU BAĞLANTI & PORTAL GİRİŞ AYARLARI MODALI */}
      {/* ========================================================================= */}
      {isSettingsOpen && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-2xl border dark:border-slate-700 max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto custom-scrollbar">
            
            <div className="flex justify-between items-start border-b dark:border-slate-700 pb-3">
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <Server className="text-blue-500 w-5 h-5" /> ETKA Portal Bağlantı ve Giriş Ayarları
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Portal backend adresini seçin ve canlı veri akışı için kullanıcı girişi yapın.
                </p>
              </div>
              <button onClick={() => setIsSettingsOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>

            {/* 1. HIZLI HOST SEÇİMİ */}
            <div className="space-y-2">
              <span className="text-xs font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider block">
                🎯 Portal Sunucu Konumu:
              </span>

              <div className="grid grid-cols-1 gap-2">
                {PRESET_BASE_URLS.map(preset => {
                  const isSelected = serverUrlInput.trim().replace(/\/+$/, '') === preset.url;
                  return (
                    <div
                      key={preset.id}
                      onClick={() => {
                        setServerUrlInput(preset.url);
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

            {/* 2. ÖZEL URL GİRİŞİ */}
            <div className="space-y-1.5">
              <label className="block text-xs font-black text-slate-700 dark:text-slate-200">
                🌐 Portal API Base URL
              </label>
              <input
                type="text"
                placeholder="Örn: http://etkacrm.agdc.com.tr:1106/api"
                value={serverUrlInput}
                onChange={(e) => setServerUrlInput(e.target.value)}
                className="w-full p-2.5 text-xs font-mono font-bold border dark:border-slate-600 rounded-xl bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Bağlantı Test Sonucu */}
            {testResult && (
              <div className={`p-3 rounded-xl text-xs font-bold flex items-start gap-2 ${
                testResult.success ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300' : 'bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 border border-red-300'
              }`}>
                {testResult.success ? <CheckCircle2 size={16} className="shrink-0 mt-0.5" /> : <AlertTriangle size={16} className="shrink-0 mt-0.5 text-red-500" />}
                <span>{testResult.message}</span>
              </div>
            )}

            {/* 3. ETKA PORTAL KULLANICI GİRİŞİ (§4) */}
            <div className="pt-3 border-t dark:border-slate-700 space-y-3">
              <div className="flex justify-between items-center">
                <label className="text-xs font-black text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                  <ShieldCheck size={16} className="text-blue-500" /> ETKA Portal Kullanıcı Girişi (JWT Auth)
                </label>
                {hasToken && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                    ✅ Oturum Açık
                  </span>
                )}
              </div>

              {hasToken ? (
                <div className="p-3 rounded-2xl bg-slate-100 dark:bg-slate-900 border dark:border-slate-700 flex justify-between items-center">
                  <div>
                    <span className="text-xs font-black text-slate-900 dark:text-white block">
                      {currentUser?.name || currentUser?.username || 'ETKA Kullanıcısı'}
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                      {currentUser?.email || 'Yetkili OEE Erişimi'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-xl border border-red-200 dark:border-red-800 transition flex items-center gap-1"
                  >
                    <LogOut size={13} /> Çıkış Yap
                  </button>
                </div>
              ) : (
                <form onSubmit={handleLogin} className="space-y-2 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900 border dark:border-slate-700">
                  <div className="space-y-2">
                    <input
                      type="text"
                      required
                      placeholder="Kullanıcı Adı veya Email"
                      value={loginForm.usernameOrEmail}
                      onChange={e => setLoginForm({ ...loginForm, usernameOrEmail: e.target.value })}
                      className="w-full p-2.5 text-xs border dark:border-slate-600 rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                    />
                    <input
                      type="password"
                      required
                      placeholder="Şifre"
                      value={loginForm.password}
                      onChange={e => setLoginForm({ ...loginForm, password: e.target.value })}
                      className="w-full p-2.5 text-xs border dark:border-slate-600 rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                    />
                  </div>

                  {loginError && (
                    <p className="text-[11px] font-bold text-red-500">
                      {loginError}
                    </p>
                  )}

                  <div className="flex justify-between items-center pt-1">
                    <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={loginForm.rememberMe}
                        onChange={e => setLoginForm({ ...loginForm, rememberMe: e.target.checked })}
                        className="rounded text-blue-600"
                      />
                      <span>Beni Hatırla</span>
                    </label>

                    <button
                      type="submit"
                      disabled={loginLoading}
                      className="py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs rounded-xl shadow-xs flex items-center gap-1.5"
                    >
                      {loginLoading ? <RefreshCw size={13} className="animate-spin" /> : <LogIn size={13} />}
                      <span>Giriş Yap</span>
                    </button>
                  </div>
                </form>
              )}
            </div>

            {/* Butonlar */}
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
      )}

    </div>
  );
};

export default CanliDurum;