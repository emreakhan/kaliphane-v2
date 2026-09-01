// src/pages/CanliDurum.jsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Monitor, RefreshCw, AlertTriangle, CheckCircle2, 
  Settings, Search, Clock, X, ShieldCheck, Server, 
  Wrench, Layers, Check, Edit3, PlusIcon, TrashIcon, 
  User, Box, BarChart3, Calendar, Lock, LogIn, LogOut, 
  UserCheck, AlertCircle, Info, Sliders, ChevronRight
} from 'lucide-react';
import { 
  getBaseUrl, setBaseUrl, getOeeHealth, getOeeFleet, checkPortalInfo,
  getAccessToken, getRefreshToken, getStoredUser, loginPortal, logoutPortal,
  getMachineAliases, setMachineAliases, findAlias, ensureAuthenticated, DEFAULT_CREDENTIALS,
  INTERNAL_BASE_URL, EXTERNAL_BASE_URL, PRESET_BASE_URLS
} from '../services/etkaOeeService.js';
import { 
  getActiveAssignments, saveActiveAssignments, assignPartToMachine,
  updateAssignmentDurations, recordLogbookSnapshot
} from '../services/oeeTrackingService.js';
import { doc, setDoc, onSnapshot } from '../config/firebase.js';

// Sekme Bileşenleri
import { OeeLiveFleetTab } from '../components/OEE/OeeLiveFleetTab.jsx';
import { OeePartTrackingTab } from '../components/OEE/OeePartTrackingTab.jsx';
import { OeeCamOperatorAnalysisTab } from '../components/OEE/OeeCamOperatorAnalysisTab.jsx';
import { OeeMachineLogbookTab } from '../components/OEE/OeeMachineLogbookTab.jsx';
import { OeeMachineMappingModal } from '../components/OEE/OeeMachineMappingModal.jsx';
import { OeeMachineDetailModal } from '../components/OEE/OeeMachineDetailModal.jsx';

const CanliDurum = ({ db, projects = [], machines = [], personnel = [] }) => {
  // ANA SEKMELER: 'live' | 'parts' | 'cam' | 'logbook'
  const [activeTab, setActiveTab] = useState('live');

  // TELEMETRİ STATE'LERİ
  const [fleetData, setFleetData] = useState([]);
  const [healthInfo, setHealthInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdatedTime, setLastUpdatedTime] = useState(null);

  // AUTH STATE
  const [currentUser, setCurrentUser] = useState(() => getStoredUser());
  const [hasToken, setHasToken] = useState(() => !!getAccessToken());
  const [loginForm, setLoginForm] = useState({
    usernameOrEmail: 'KALIPHANE',
    password: '1234',
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

  // TEZGAH İSİMLENDİRME (ALIAS) MODAL
  const [isAliasModalOpen, setIsAliasModalOpen] = useState(false);
  const [aliasList, setAliasList] = useState(() => getMachineAliases());
  const [newAliasInput, setNewAliasInput] = useState({
    ipOrId: '',
    customName: '',
    group: 'CNC Dik İşleme',
    location: 'Kalıphane A Blok'
  });

  // BULUTTAN TEZGAH EŞLEŞTİRMELERİNİ TÜM BİLGİSAYARLAR İÇİN OTOMATİK SENKRONİZE ET
  useEffect(() => {
    if (!db) return;
    try {
      const unsub = onSnapshot(doc(db, 'config', 'oee_machine_mappings'), (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data && Array.isArray(data.mappings) && data.mappings.length > 0) {
            setAliasList(data.mappings);
            setMachineAliases(data.mappings);
          }
        }
      }, (err) => {
        console.warn("Cloud machine mapping sync error:", err);
      });
      return () => unsub();
    } catch (e) {
      console.warn("Cloud machine mapping setup error:", e);
    }
  }, [db]);

  const handleSaveAliasesCloud = async (newAliases) => {
    setAliasList(newAliases);
    setMachineAliases(newAliases);
    if (db) {
      try {
        await setDoc(doc(db, 'config', 'oee_machine_mappings'), {
          mappings: newAliases,
          updatedAt: new Date().toISOString(),
          updatedBy: currentUser?.name || currentUser?.username || 'User'
        }, { merge: true });
      } catch (err) {
        console.error("Firestore machine mappings save error:", err);
      }
    }
    loadOeeData(true);
  };

  // TEZGAHA PARÇA / İŞ EMRİ ATAMA MODALI STATE
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [assignForm, setAssignForm] = useState({
    machineKey: '',
    machineName: '',
    moldId: '',
    moldName: '',
    taskId: '',
    taskName: '',
    camOperatorName: '',
    notes: ''
  });

  // AKTİF PARÇA ATAMALARI
  const [activeAssignments, setActiveAssignments] = useState(() => getActiveAssignments());

  // 1. OEE FLEET & HEALTH VERİLERİNİ ÇEK (15 SANİYELİK POLLING)
  const loadOeeData = useCallback(async (isManualRefresh = false) => {
    try {
      if (isManualRefresh || fleetData.length === 0) {
        setLoading(true);
      }
      setError(null);

      // Paralel Health & Fleet çağrısı
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

      // Alias birleştirme
      const aliases = getMachineAliases();
      const processedKeys = new Set();
      const mergedList = [];

      const parseOverrideVal = (val) => {
        if (val === null || val === undefined || val === '') return null;
        const num = Number(val);
        if (isNaN(num)) return null;
        if (num > 0 && num <= 2.5) return Math.round(num * 100);
        return Math.round(num);
      };

      rawFleet.forEach(item => {
        const matchedAlias = findAlias(item.ip, item.id, item.name);
        const ipKey = (item.ip || '').trim().toLowerCase();
        const idKey = (item.id || '').trim().toLowerCase();
        if (ipKey) processedKeys.add(ipKey);
        if (idKey) processedKeys.add(idKey);

        const feedOv = parseOverrideVal(item.feedOverridePct) ??
                       parseOverrideVal(item.feedOverride) ??
                       parseOverrideVal(item.feedRateOverride) ??
                       parseOverrideVal(item.feedrateOverride) ??
                       parseOverrideVal(item.feed_override) ??
                       parseOverrideVal(item.ovFeed) ??
                       parseOverrideVal(item.feed_ov) ??
                       parseOverrideVal(item.override) ??
                       parseOverrideVal(item.overridePct) ??
                       100;

        const rapidOv = parseOverrideVal(item.rapidOverridePct) ??
                        parseOverrideVal(item.rapidOverride) ??
                        parseOverrideVal(item.rapidRateOverride) ??
                        parseOverrideVal(item.rapid_override) ??
                        parseOverrideVal(item.ovRapid) ??
                        parseOverrideVal(item.rapid_ov) ??
                        100;

        const spindleOv = parseOverrideVal(item.spindleOverridePct) ??
                          parseOverrideVal(item.spindleOverride) ??
                          parseOverrideVal(item.spindleRateOverride) ??
                          parseOverrideVal(item.spindle_override) ??
                          parseOverrideVal(item.ovSpindle) ??
                          parseOverrideVal(item.spindle_ov) ??
                          100;

        mergedList.push({
          ...item,
          feedOverridePct: feedOv,
          rapidOverridePct: rapidOv,
          spindleOverridePct: spindleOv,
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

      // PARÇA SÜRELERİNİ VE KAYIT DEFTERİ SNAPSHOTLARINI GÜNCELLE
      const updatedAssigns = updateAssignmentDurations(mergedList);
      setActiveAssignments(updatedAssigns);
      recordLogbookSnapshot(mergedList);

    } catch (err) {
      console.error("OEE Veri Çekme Hatası:", err);
      setError(err.message || 'ETKA Portal OEE servisine ulaşılamadı.');
    } finally {
      setLoading(false);
    }
  }, [fleetData.length]);

  // 2. PERİYODİK 15 SANİYELİK POLLING & OTOMATİK SESSİZ GİRİŞ (SILENT AUTH)
  useEffect(() => {
    ensureAuthenticated().then(() => {
      setHasToken(!!getAccessToken());
      setCurrentUser(getStoredUser());
      loadOeeData();
    }).catch(() => {
      loadOeeData();
    });

    const interval = setInterval(() => {
      loadOeeData();
    }, 15000);

    return () => clearInterval(interval);
  }, [loadOeeData]);

  // 3. MEVCUT GRUPLAR
  const availableGroups = useMemo(() => {
    const groups = new Set(fleetData.map(d => d.group || 'Genel'));
    return Array.from(groups).sort();
  }, [fleetData]);

  // 4. TOPLAM DURUM SAYILARI
  const counts = useMemo(() => {
    let running = 0, idle = 0, down = 0, offline = 0;
    fleetData.forEach(d => {
      const isConn = d.connected !== false;
      const st = isConn ? (d.currentState || 'Offline').toLowerCase() : 'offline';
      if (st === 'running') running++;
      else if (st === 'idle' || st === 'idling') idle++;
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

  // 5. PARÇA ATAMA MODALINI AÇMA
  const handleOpenAssignModal = (targetDevice = null) => {
    const defaultMachine = targetDevice || (fleetData.length > 0 ? fleetData[0] : null);
    const mKey = defaultMachine ? (defaultMachine.ip || defaultMachine.id) : '';
    const mName = defaultMachine ? (defaultMachine.name || defaultMachine.ip) : '';

    // Eğer tezgahta zaten atama varsa doldur
    const existing = activeAssignments.find(a => 
      (a.machineKey || '').toLowerCase() === (mKey || '').toLowerCase()
    );

    if (existing) {
      setAssignForm({
        machineKey: existing.machineKey,
        machineName: existing.machineName,
        moldId: existing.moldId,
        moldName: existing.moldName,
        taskId: existing.taskId,
        taskName: existing.taskName,
        camOperatorName: existing.camOperatorName,
        notes: existing.notes || ''
      });
    } else {
      setAssignForm({
        machineKey: mKey,
        machineName: mName,
        moldId: '',
        moldName: '',
        taskId: '',
        taskName: '',
        camOperatorName: '',
        notes: ''
      });
    }

    setIsAssignModalOpen(true);
  };

  // 6. PARÇA ATAMA KAYDET
  const handleSaveAssignment = (e) => {
    e.preventDefault();
    if (!assignForm.machineKey) {
      alert("Lütfen bir tezgah seçiniz!");
      return;
    }
    if (!assignForm.moldName.trim() || !assignForm.taskName.trim()) {
      alert("Lütfen kalıp adı ve parça adını belirtiniz!");
      return;
    }

    const currentDevice = fleetData.find(d => 
      (d.ip || '').toLowerCase() === assignForm.machineKey.toLowerCase() ||
      (d.id || '').toLowerCase() === assignForm.machineKey.toLowerCase()
    );

    assignPartToMachine({
      machineKey: assignForm.machineKey,
      machineName: assignForm.machineName || assignForm.machineKey,
      moldId: assignForm.moldId,
      moldName: assignForm.moldName,
      taskId: assignForm.taskId,
      taskName: assignForm.taskName,
      camOperatorName: assignForm.camOperatorName || 'Belirtilmedi',
      notes: assignForm.notes,
      currentDevice
    });

    setActiveAssignments(getActiveAssignments());
    setIsAssignModalOpen(false);
    loadOeeData(true);
  };

  // 7. KALIP SEÇİMİNDE PARÇALARI GETİR
  const selectedMoldTasks = useMemo(() => {
    if (!assignForm.moldId && !assignForm.moldName) return [];
    const matchedProject = projects.find(p => 
      p.id === assignForm.moldId || 
      (p.moldName || p.name) === assignForm.moldName
    );
    return matchedProject?.tasks || [];
  }, [assignForm.moldId, assignForm.moldName, projects]);

  // 8. KULLANICI GİRİŞİ / ÇIKIŞI
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

  // 9. BAĞLANTI TESTİ
  const handleTestConnection = async (urlToTest = null) => {
    const target = urlToTest || serverUrlInput;
    setIsTesting(true);
    setTestResult(null);
    try {
      const info = await checkPortalInfo(target).catch(() => null);
      if (info) {
        setTestResult({
          success: true,
          message: `Portal Bağlantısı Başarılı! (Sürüm: ${info?.data?.portalVersion || 'v3.0'})`
        });
        return;
      }

      const health = await getOeeHealth(target).catch(() => null);
      if (health) {
        setTestResult({
          success: true,
          message: `Bağlantı Başarılı! (Takip Edilen Cihaz: ${health.trackedDevices ?? 0})`
        });
        return;
      }

      setTestResult({
        success: false,
        message: `Sunucu yanıt vermedi (${target}). Port (1106) veya ağ/güvenlik duvarı izinlerini kontrol edin.`
      });
    } catch (err) {
      setTestResult({
        success: false,
        message: err.message || `Sunucuya ulaşılamadı (${target})`
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

  // 10. ALIAS KAYDET
  const handleSaveAlias = (e) => {
    e.preventDefault();
    if (!newAliasInput.ipOrId.trim() || !newAliasInput.customName.trim()) {
      alert("Lütfen IP ve Tezgah Adını doldurunuz!");
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
    if (window.confirm("Bu tezgah eşleştirmesini silmek istediğinize emin misiniz?")) {
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
              ETKA Portal — Canlı Tezgah & Parça İzleme Merkezi
            </h1>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                CNC tezgahları anlık çalışma telemetrisi, kalıp/parça işleme süreleri, CAM operatörü analizi ve kayıt defteri.
              </p>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold border dark:border-slate-600">
                {isInternal ? '🏢 Kurum İçi / VPN' : '🌍 Kurum Dışı / İnternet'} ({currentBaseUrl})
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Hızlı Parça Ata Butonu */}
            <button
              onClick={() => handleOpenAssignModal()}
              className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs rounded-xl shadow-md shadow-blue-500/20 transition flex items-center gap-1.5"
            >
              <PlusIcon size={15} /> + Tezgaha Parça Ata
            </button>

            {/* Tezgah İsimlendirme Butonu */}
            <button
              onClick={() => setIsAliasModalOpen(true)}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl shadow-md shadow-emerald-500/20 transition flex items-center gap-1.5"
            >
              <Edit3 size={15} /> ⚙️ Tezgahlar ({aliasList.length})
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

            {/* Kullanıcı Oturum Durumu */}
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

            {/* Sunucu Ayarları */}
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

        {/* 2. ANA NAVİGASYON SEKMELERİ (TABS) */}
        <div className="max-w-7xl mx-auto mt-4 flex items-center gap-2 border-t dark:border-slate-700 pt-3 overflow-x-auto custom-scrollbar">
          <button
            onClick={() => setActiveTab('live')}
            className={`px-4 py-2 text-xs font-black rounded-xl transition flex items-center gap-2 shrink-0 ${
              activeTab === 'live'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
            }`}
          >
            <Monitor size={15} /> 🖥️ Canlı Filo & Tezgah İzleme ({fleetData.length})
          </button>

          <button
            onClick={() => setActiveTab('parts')}
            className={`px-4 py-2 text-xs font-black rounded-xl transition flex items-center gap-2 shrink-0 ${
              activeTab === 'parts'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
            }`}
          >
            <Box size={15} /> ⚙️ Kalıp & Parça Gerçek Süre Özeti
          </button>

          <button
            onClick={() => setActiveTab('cam')}
            className={`px-4 py-2 text-xs font-black rounded-xl transition flex items-center gap-2 shrink-0 ${
              activeTab === 'cam'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
            }`}
          >
            <User size={15} /> 👨‍💻 CAM Operatörü Analizi
          </button>

          <button
            onClick={() => setActiveTab('logbook')}
            className={`px-4 py-2 text-xs font-black rounded-xl transition flex items-center gap-2 shrink-0 ${
              activeTab === 'logbook'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
            }`}
          >
            <Calendar size={15} /> 📅 Tezgah Kayıt Defteri (24s Zaman Çizelgesi)
          </button>
        </div>
      </div>

      {/* 3. ANA SAYFA İÇERİĞİ */}
      <div className="max-w-7xl mx-auto w-full p-4 md:p-6 space-y-4 flex-1">
        
        {/* Dış CNC Servisi Ulaşılamıyor Uyarısı */}
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
              <span>Canlı tezgah verilerini izlemek için ETKA Portal kullanıcı girişi yapılması gerekmektedir.</span>
            </div>
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs rounded-xl shadow-xs shrink-0 flex items-center gap-1.5"
            >
              <LogIn size={14} /> Giriş Yap
            </button>
          </div>
        )}

        {/* Hata Uyarısı */}
        {error && hasToken && (
          <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-950/50 border border-red-300 dark:border-red-800 text-red-900 dark:text-red-200 text-xs font-bold flex items-center gap-3">
            <AlertCircle size={18} className="text-red-500 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* ========================================================================= */}
        {/* SEKME 1: CANLI FİLO & TEZGAH İZLEME */}
        {/* ========================================================================= */}
        {activeTab === 'live' && (
          <OeeLiveFleetTab
            fleetData={fleetData}
            projects={projects}
            activeAssignments={activeAssignments}
            filterState={filterState}
            setFilterState={setFilterState}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            selectedGroup={selectedGroup}
            setSelectedGroup={setSelectedGroup}
            availableGroups={availableGroups}
            counts={counts}
            onSelectDevice={setSelectedDevice}
            onOpenAssignModal={handleOpenAssignModal}
            onOpenAliasModal={() => setIsAliasModalOpen(true)}
          />
        )}

        {/* ========================================================================= */}
        {/* SEKME 2: PARÇA & İŞ EMRİ TEZGAH SÜRE TAKİBİ */}
        {/* ========================================================================= */}
        {activeTab === 'parts' && (
          <OeePartTrackingTab
            fleetData={fleetData}
            projects={projects}
            personnel={personnel}
            onOpenAssignModal={handleOpenAssignModal}
            onRefreshData={() => loadOeeData(true)}
          />
        )}

        {/* ========================================================================= */}
        {/* SEKME 3: CAM OPERATÖRÜ PERFORMANS & SÜRE ANALİZİ */}
        {/* ========================================================================= */}
        {activeTab === 'cam' && (
          <OeeCamOperatorAnalysisTab
            projects={projects}
            fleetData={fleetData}
          />
        )}

        {/* ========================================================================= */}
        {/* SEKME 4: TEZGAH KAYIT DEFTERİ & 24s ZAMAN ÇİZELGESİ */}
        {/* ========================================================================= */}
        {activeTab === 'logbook' && (
          <OeeMachineLogbookTab
            fleetData={fleetData}
            projects={projects}
          />
        )}

      </div>

      {/* ========================================================================= */}
      {/* 4. TEZGAHA PARÇA / İŞ EMRİ ATAMA MODALI */}
      {/* ========================================================================= */}
      {isAssignModalOpen && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto animate-fadeIn">
          <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-2xl border dark:border-slate-700 max-w-xl w-full p-6 space-y-4 my-8 max-h-[90vh] overflow-y-auto custom-scrollbar">
            
            <div className="flex justify-between items-start border-b dark:border-slate-700 pb-3">
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <Box className="text-blue-500 w-5 h-5" /> Tezgaha Kalıp / Parça (İş Emri) Ata
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Parça bağlandığı andan itibaren tezgahın çalışma ve duruş süreleri bu parça için sayaçlanır.
                </p>
              </div>
              <button onClick={() => setIsAssignModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={22} />
              </button>
            </div>

            <form onSubmit={handleSaveAssignment} className="space-y-3">
              {/* 1. Hedef Tezgah */}
              <div>
                <label className="block text-xs font-black text-slate-700 dark:text-slate-200 mb-1">
                  1. İşlenecek Tezgah *
                </label>
                <select
                  required
                  value={assignForm.machineKey}
                  onChange={(e) => {
                    const selected = fleetData.find(d => (d.ip || d.id) === e.target.value);
                    setAssignForm({
                      ...assignForm,
                      machineKey: e.target.value,
                      machineName: selected ? (selected.name || selected.ip) : e.target.value
                    });
                  }}
                  className="w-full p-2.5 text-xs font-bold border dark:border-slate-600 rounded-xl bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
                >
                  <option value="">Tezgah Seçiniz...</option>
                  {fleetData.map(d => (
                    <option key={d.ip || d.id} value={d.ip || d.id}>
                      {d.name || d.ip} ({d.ip})
                    </option>
                  ))}
                </select>
              </div>

              {/* 2. Kalıp / Proje Seçimi */}
              <div>
                <label className="block text-xs font-black text-slate-700 dark:text-slate-200 mb-1">
                  2. Kalıp / Proje Adı *
                </label>
                {projects.length > 0 ? (
                  <div className="space-y-1.5">
                    <select
                      value={assignForm.moldId}
                      onChange={(e) => {
                        const proj = projects.find(p => p.id === e.target.value);
                        setAssignForm({
                          ...assignForm,
                          moldId: e.target.value,
                          moldName: proj ? (proj.moldName || proj.name) : '',
                          taskId: '',
                          taskName: ''
                        });
                      }}
                      className="w-full p-2.5 text-xs font-bold border dark:border-slate-600 rounded-xl bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
                    >
                      <option value="">Mevcut Kalıplardan Seçiniz...</option>
                      {projects.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.moldName || p.name || `Kalıp #${p.projectNumber}`}
                        </option>
                      ))}
                    </select>

                    <input
                      type="text"
                      placeholder="Veya elle serbest kalıp adı yazın..."
                      value={assignForm.moldName}
                      onChange={e => setAssignForm({ ...assignForm, moldName: e.target.value, moldId: '' })}
                      className="w-full p-2 text-xs border dark:border-slate-600 rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                    />
                  </div>
                ) : (
                  <input
                    type="text"
                    required
                    placeholder="Örn: 2026-A120 Şişe Kalıbı"
                    value={assignForm.moldName}
                    onChange={e => setAssignForm({ ...assignForm, moldName: e.target.value })}
                    className="w-full p-2.5 text-xs font-bold border dark:border-slate-600 rounded-xl bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
                  />
                )}
              </div>

              {/* 3. Parça / İş Emri Seçimi */}
              <div>
                <label className="block text-xs font-black text-slate-700 dark:text-slate-200 mb-1">
                  3. İşlenecek Parça Adı *
                </label>
                {selectedMoldTasks.length > 0 ? (
                  <div className="space-y-1.5">
                    <select
                      value={assignForm.taskId}
                      onChange={(e) => {
                        const t = selectedMoldTasks.find(task => task.id === e.target.value);
                        setAssignForm({
                          ...assignForm,
                          taskId: e.target.value,
                          taskName: t ? (t.taskName || t.name || t.partName) : '',
                          camOperatorName: t?.camOperator || assignForm.camOperatorName
                        });
                      }}
                      className="w-full p-2.5 text-xs font-bold border dark:border-slate-600 rounded-xl bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
                    >
                      <option value="">Kalıbın Parçalarından Seçiniz...</option>
                      {selectedMoldTasks.map(t => (
                        <option key={t.id} value={t.id}>
                          {t.taskName || t.name || t.partName || 'İsimsiz Parça'}
                        </option>
                      ))}
                    </select>

                    <input
                      type="text"
                      placeholder="Veya elle serbest parça adı yazın..."
                      value={assignForm.taskName}
                      onChange={e => setAssignForm({ ...assignForm, taskName: e.target.value, taskId: '' })}
                      className="w-full p-2 text-xs border dark:border-slate-600 rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                    />
                  </div>
                ) : (
                  <input
                    type="text"
                    required
                    placeholder="Örn: Dişi Çekirdek B-12"
                    value={assignForm.taskName}
                    onChange={e => setAssignForm({ ...assignForm, taskName: e.target.value })}
                    className="w-full p-2.5 text-xs font-bold border dark:border-slate-600 rounded-xl bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
                  />
                )}
              </div>

              {/* 4. CAM Operatörü Seçimi */}
              <div>
                <label className="block text-xs font-black text-slate-700 dark:text-slate-200 mb-1">
                  4. Parçayı Hazırlayan CAM Operatörü
                </label>
                {personnel.length > 0 ? (
                  <div className="space-y-1.5">
                    <select
                      value={assignForm.camOperatorName}
                      onChange={e => setAssignForm({ ...assignForm, camOperatorName: e.target.value })}
                      className="w-full p-2.5 text-xs font-bold border dark:border-slate-600 rounded-xl bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
                    >
                      <option value="">Personel Listesinden Seçiniz...</option>
                      {personnel.map(p => (
                        <option key={p.id || p.username} value={p.name || p.username}>
                          {p.name || p.username} {p.role ? `(${p.role})` : ''}
                        </option>
                      ))}
                    </select>

                    <input
                      type="text"
                      placeholder="Veya elle CAM operatörü adı yazın..."
                      value={assignForm.camOperatorName}
                      onChange={e => setAssignForm({ ...assignForm, camOperatorName: e.target.value })}
                      className="w-full p-2 text-xs border dark:border-slate-600 rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                    />
                  </div>
                ) : (
                  <input
                    type="text"
                    placeholder="Örn: Ahmet Usta"
                    value={assignForm.camOperatorName}
                    onChange={e => setAssignForm({ ...assignForm, camOperatorName: e.target.value })}
                    className="w-full p-2.5 text-xs font-bold border dark:border-slate-600 rounded-xl bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
                  />
                )}
              </div>

              {/* Notlar */}
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Not / Açıklama (Opsiyonel)</label>
                <textarea
                  rows={2}
                  placeholder="İşleme ile ilgili özel notlar..."
                  value={assignForm.notes}
                  onChange={e => setAssignForm({ ...assignForm, notes: e.target.value })}
                  className="w-full p-2 text-xs border dark:border-slate-600 rounded-xl bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setIsAssignModalOpen(false)}
                  className="py-2.5 px-4 bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold text-xs rounded-xl"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  className="py-2.5 px-5 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs rounded-xl shadow-md shadow-blue-500/20 flex items-center gap-1.5"
                >
                  <Check size={16} /> Parçayı Tezgaha Bağla & Başlat
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. TEZGAH İSİMLENDİRME & EŞLEŞTİRME MODALI */}
      {/* ========================================================================= */}
      <OeeMachineMappingModal
        isOpen={isAliasModalOpen}
        onClose={() => setIsAliasModalOpen(false)}
        systemMachines={machines}
        fleetData={fleetData}
        projects={projects}
        aliasList={aliasList}
        onSaveAliases={handleSaveAliasesCloud}
      />

      {/* ========================================================================= */}
      {/* 5.1. SEÇİLİ TEZGAH BÜYÜK DETAY PENCERESİ */}
      {/* ========================================================================= */}
      {selectedDevice && (
        <OeeMachineDetailModal
          device={selectedDevice}
          projects={projects}
          onClose={() => setSelectedDevice(null)}
        />
      )}

      {/* ========================================================================= */}
      {/* 6. SUNUCU BAĞLANTI & GİRİŞ MODALI */}
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

            {/* Host Seçimi */}
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

            {/* URL Input */}
            <div className="space-y-1.5">
              <label className="block text-xs font-black text-slate-700 dark:text-slate-200">
                🌐 Portal API Base URL
              </label>
              <input
                type="text"
                placeholder="Örn: http://etkacrm.agdc.com.tr:1106 veya http://195.46.142.179:1106/api"
                value={serverUrlInput}
                onChange={(e) => setServerUrlInput(e.target.value)}
                className="w-full p-2.5 text-xs font-mono font-bold border dark:border-slate-600 rounded-xl bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-[10px] text-slate-400">
                💡 Otomatik HTTPS & CORS Köprüsü devrededir; mobilde, tablette veya PC'de güvenlik engeline takılmadan bağlanır.
              </p>
            </div>

            {/* Test Sonucu */}
            {testResult && (
              <div className={`p-3 rounded-xl text-xs font-bold flex items-start gap-2 ${
                testResult.success ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300' : 'bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 border border-red-300'
              }`}>
                {testResult.success ? <CheckCircle2 size={16} className="shrink-0 mt-0.5" /> : <AlertTriangle size={16} className="shrink-0 mt-0.5 text-red-500" />}
                <span>{testResult.message}</span>
              </div>
            )}

            {/* Portal Kullanıcı Girişi */}
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