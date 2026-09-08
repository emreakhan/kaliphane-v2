// src/components/OEE/OeeExternalFeedInspectorTab.jsx
import React, { useState, useMemo } from 'react';
import { 
  Server, RefreshCw, CheckCircle2, AlertTriangle, AlertCircle, 
  HelpCircle, Copy, Check, ExternalLink, ShieldAlert, Cpu, 
  Search, Sliders, ChevronDown, ChevronUp, Code, Edit3, 
  Plus, Eye, Clock, Activity, Wifi, WifiOff, FileText, ArrowRight
} from 'lucide-react';
import { 
  getBaseUrl, getPublicFeedKey, IT_NGINX_CORS_SNIPPET, findAlias
} from '../../services/etkaOeeService.js';

export const OeeExternalFeedInspectorTab = ({
  rawFleet = [],
  fleetData = [],
  aliases = [],
  onOpenAliasModal,
  onReload,
  loading = false,
  error = null,
  lastUpdatedTime = null
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('ALL'); // 'ALL' | 'DEFINED' | 'UNDEFINED' | 'RUNNING' | 'IDLE' | 'DOWN'
  const [selectedRawDevice, setSelectedRawDevice] = useState(null);
  const [showRawJsonModal, setShowRawJsonModal] = useState(false);
  const [showItSnippetModal, setShowItSnippetModal] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [showMissingAliases, setShowMissingAliases] = useState(false);

  // Doğrudan Tarayıcı Testi State'i
  const [testStatus, setTestStatus] = useState(null); // null | 'testing' | 'success' | 'error'
  const [testResult, setTestResult] = useState(null);

  const baseUrl = getBaseUrl();
  const feedKey = getPublicFeedKey();
  const targetFeedUrl = `${baseUrl.replace(/\/+$/, '')}/oee/public-feed?key=${feedKey}`;

  // 1. CİHAZLARI TANIMLI / TANIMSIZ OLARAK ZENGİNLEŞTİR
  const inspectedDevices = useMemo(() => {
    return rawFleet.map((dev, idx) => {
      const matchedAlias = findAlias(dev.ip, dev.id, dev.name);
      const isDefined = !!matchedAlias;

      return {
        ...dev,
        uniqueKey: dev.id || dev.ip || `dev-${idx}`,
        matchedAlias,
        isDefined,
        displayName: matchedAlias?.customName || dev.name || dev.ip || 'Bilinmeyen Cihaz',
        displayGroup: matchedAlias?.group || dev.group || 'Genel',
        displayLocation: matchedAlias?.location || dev.location || 'Kalıphane'
      };
    });
  }, [rawFleet, aliases]);

  // 2. SUNUCUDA OLUP BİZDE TANIMLANMAMIŞ OLANLAR & TERSİ
  const counts = useMemo(() => {
    let defined = 0;
    let undefinedCount = 0;
    let running = 0;
    let idle = 0;
    let down = 0;
    let offline = 0;

    inspectedDevices.forEach(d => {
      if (d.isDefined) defined++;
      else undefinedCount++;

      const st = (d.currentState || 'offline').toLowerCase();
      if (st === 'running') running++;
      else if (st === 'idle' || st === 'idling') idle++;
      else if (st === 'down') down++;
      else offline++;
    });

    return {
      total: inspectedDevices.length,
      defined,
      undefinedCount,
      running,
      idle,
      down,
      offline
    };
  }, [inspectedDevices]);

  // Kayıtlı listemizde olup da sunucudan gelmeyenler
  const missingFromFeed = useMemo(() => {
    if (inspectedDevices.length === 0) return aliases;
    const feedKeys = new Set();
    inspectedDevices.forEach(d => {
      if (d.ip) feedKeys.add(d.ip.trim().toLowerCase());
      if (d.id) feedKeys.add(d.id.trim().toLowerCase());
      if (d.name) feedKeys.add(d.name.trim().toLowerCase());
    });

    return aliases.filter(a => {
      const key = (a.ipOrId || '').trim().toLowerCase();
      const name = (a.customName || '').trim().toLowerCase();
      const code = (a.systemMachineCode || '').trim().toLowerCase();
      return !feedKeys.has(key) && !feedKeys.has(name) && !feedKeys.has(code);
    });
  }, [aliases, inspectedDevices]);

  // Filtreleme
  const filteredDevices = useMemo(() => {
    return inspectedDevices.filter(d => {
      // Metin araması
      const q = searchQuery.toLowerCase().trim();
      if (q) {
        const matchName = (d.displayName || '').toLowerCase().includes(q);
        const matchIp = (d.ip || '').toLowerCase().includes(q);
        const matchGroup = (d.displayGroup || '').toLowerCase().includes(q);
        const matchProg = (d.program || '').toLowerCase().includes(q);
        const matchSys = (d.name || '').toLowerCase().includes(q);
        if (!matchName && !matchIp && !matchGroup && !matchProg && !matchSys) return false;
      }

      // Kategori filtresi
      if (filterType === 'DEFINED') return d.isDefined;
      if (filterType === 'UNDEFINED') return !d.isDefined;
      if (filterType === 'RUNNING') return (d.currentState || '').toLowerCase() === 'running';
      if (filterType === 'IDLE') return ['idle', 'idling'].includes((d.currentState || '').toLowerCase());
      if (filterType === 'DOWN') return (d.currentState || '').toLowerCase() === 'down';
      if (filterType === 'OFFLINE') return (d.currentState || '').toLowerCase() === 'offline' || d.connected === false;

      return true;
    });
  }, [inspectedDevices, searchQuery, filterType]);

  // 3. TARAYICIDAN DOĞRUDAN TEST ET
  const handleRunBrowserTest = async () => {
    setTestStatus('testing');
    setTestResult(null);
    const startTime = performance.now();

    try {
      const response = await fetch(targetFeedUrl, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(6000)
      });

      const elapsed = Math.round(performance.now() - startTime);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} - ${response.statusText}`);
      }

      const json = await response.json();
      const count = Array.isArray(json.data) ? json.data.length : Array.isArray(json) ? json.length : (json.count || 0);

      setTestStatus('success');
      setTestResult({
        ok: true,
        elapsed,
        count,
        httpStatus: response.status,
        message: `Başarılı! Sunucudan ${count} adet tezgah telemetrisi alındı (${elapsed} ms).`
      });

      if (onReload) onReload();

    } catch (err) {
      const elapsed = Math.round(performance.now() - startTime);
      let errType = 'Genel Ağ Hatası';
      let advice = 'Sunucu adresi veya port erişimi kontrol edilmelidir.';

      const isFailedToFetch = (err.message || '').toLowerCase().includes('failed to fetch') || (err.message || '').includes('networkerror') || err.name === 'TypeError';
      const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';

      if (isFailedToFetch || (isHttps && targetFeedUrl.startsWith('http://'))) {
        errType = 'Tarayıcı Güvenlik Koruması (CORS & Mixed Content Engeli)';
        advice = 'Web siteniz HTTPS (https://kaliphane-v2.web.app) üzerinden çalıştığı için, Chrome/Edge şifresiz HTTP (http://195.46.142.179:1106) adresine veri isteğini ve sunucuda Access-Control-Allow-Origin başlığı bulunmamasını güvenlik gerekçesiyle durdurdu.\n\nKalıcı Çözüm: Bilgi İşlem ekibine yukarıdaki "Bilgi İşlem (IT) Ayar Notu" butonundaki 2 satırlık Nginx CORS ayarını iletiniz.';
      } else if (err.name === 'AbortError' || err.name === 'TimeoutError') {
        errType = 'Zaman Aşımı (Timeout)';
        advice = '195.46.142.179:1106 portuna ulaşılamadı. Güvenlik duvarı veya port yönlendirmesini kontrol edin.';
      }

      setTestStatus('error');
      setTestResult({
        ok: false,
        elapsed,
        errorName: err.name,
        errorMessage: err.message,
        errType,
        advice
      });
    }
  };

  const handleCopySnippet = () => {
    navigator.clipboard.writeText(IT_NGINX_CORS_SNIPPET);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2500);
  };

  return (
    <div className="space-y-6">
      
      {/* 1. ÜST BİLGİ VE TEŞHİS KARTI */}
      <div className="p-5 md:p-6 rounded-3xl bg-white dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-700/80 shadow-sm space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b dark:border-slate-700 pb-5">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-blue-500/10 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold">
                <Server size={20} />
              </div>
              <div>
                <h2 className="text-base md:text-lg font-black text-slate-800 dark:text-white flex items-center gap-2">
                  Dış Veri Akışı & Cihaz Kontrolü (OEE Public Feed)
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300">
                    {inspectedDevices.length} Cihaz
                  </span>
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                  Fabrika dış sunucusundan gelen ham telemetrileri, tanımlı ve tanımsız tüm tezgahları canlı denetleyin.
                </p>
              </div>
            </div>
          </div>

          {/* Aksiyon Butonları */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleRunBrowserTest}
              disabled={testStatus === 'testing'}
              className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-bold transition flex items-center gap-2 shadow-sm disabled:opacity-50"
            >
              <Activity size={14} className={testStatus === 'testing' ? 'animate-spin' : ''} />
              <span>{testStatus === 'testing' ? 'Test Ediliyor...' : 'Tarayıcıdan Canlı Test Et'}</span>
            </button>

            <button
              onClick={() => setShowItSnippetModal(true)}
              className="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-xs font-bold transition flex items-center gap-2"
            >
              <Code size={14} />
              <span>Bilgi İşlem (IT) Ayar Notu</span>
            </button>

            <button
              onClick={() => setShowRawJsonModal(true)}
              className="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-xs font-bold transition flex items-center gap-2"
            >
              <FileText size={14} />
              <span>Ham JSON Gör</span>
            </button>
          </div>
        </div>

        {/* Canlı Test Sonuç Alanı */}
        {testResult && (
          <div className={`p-4 rounded-2xl border text-xs font-semibold ${
            testResult.ok 
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200' 
              : 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-200'
          }`}>
            <div className="flex items-start gap-3">
              {testResult.ok ? (
                <CheckCircle2 size={20} className="text-emerald-500 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle size={20} className="text-rose-500 shrink-0 mt-0.5" />
              )}
              <div className="space-y-1 flex-1">
                <div className="flex items-center justify-between">
                  <span className="font-black text-sm">
                    {testResult.ok ? 'Bağlantı Başarılı!' : `Bağlantı Hatası: ${testResult.errType}`}
                  </span>
                  <span className="text-[11px] opacity-75 font-mono">{testResult.elapsed} ms</span>
                </div>
                <p>{testResult.ok ? testResult.message : testResult.errorMessage}</p>
                {!testResult.ok && (
                  <div className="mt-2 p-2.5 rounded-xl bg-white/70 dark:bg-black/30 text-slate-700 dark:text-slate-300 font-normal space-y-1">
                    <span className="font-bold block text-rose-600 dark:text-rose-400">💡 Çözüm Adımı:</span>
                    <span>{testResult.advice}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Bağlantı Detayı Metrik Çubuğu */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border dark:border-slate-700">
            <span className="text-slate-400 font-bold block text-[10px] uppercase">Akış Uç Noktası (Endpoint)</span>
            <span className="font-mono text-slate-700 dark:text-slate-200 break-all select-all font-semibold">
              {targetFeedUrl}
            </span>
          </div>

          <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border dark:border-slate-700">
            <span className="text-slate-400 font-bold block text-[10px] uppercase">Akış Güvenliği & Kimlik</span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span className="font-bold text-slate-700 dark:text-slate-200">Şifresiz Genel Akış (Public Key)</span>
            </div>
            <span className="font-mono text-[10px] text-slate-400 block truncate">Anahtar: {feedKey.slice(0, 16)}...</span>
          </div>

          <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border dark:border-slate-700 flex items-center justify-between">
            <div>
              <span className="text-slate-400 font-bold block text-[10px] uppercase">Son Veri Yenileme</span>
              <span className="font-bold text-slate-700 dark:text-slate-200">
                {lastUpdatedTime ? lastUpdatedTime.toLocaleTimeString('tr-TR') : 'Bekleniyor...'}
              </span>
            </div>
            <button
              onClick={onReload}
              disabled={loading}
              className="p-2 rounded-xl bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 hover:bg-blue-100 transition"
              title="Yeniden Çek"
            >
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>
      </div>

      {/* 2. ÖZET METRİK KARTLARI */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div 
          onClick={() => setFilterType('ALL')}
          className={`p-4 rounded-2xl border transition cursor-pointer ${
            filterType === 'ALL' 
              ? 'bg-blue-500/10 border-blue-500 text-blue-600 dark:text-blue-400 shadow-sm' 
              : 'bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
          }`}
        >
          <span className="text-[10px] font-black uppercase tracking-wider block opacity-70">Toplam Algılanan</span>
          <span className="text-2xl font-black">{counts.total}</span>
          <span className="text-[11px] block opacity-60">Dış Cihaz</span>
        </div>

        <div 
          onClick={() => setFilterType('DEFINED')}
          className={`p-4 rounded-2xl border transition cursor-pointer ${
            filterType === 'DEFINED' 
              ? 'bg-emerald-500/10 border-emerald-500 text-emerald-600 dark:text-emerald-400 shadow-sm' 
              : 'bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
          }`}
        >
          <span className="text-[10px] font-black uppercase tracking-wider block opacity-70">✅ Kalıphanede Tanımlı</span>
          <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">{counts.defined}</span>
          <span className="text-[11px] block opacity-60">Eşleştirilmiş</span>
        </div>

        <div 
          onClick={() => setFilterType('UNDEFINED')}
          className={`p-4 rounded-2xl border transition cursor-pointer ${
            filterType === 'UNDEFINED' 
              ? 'bg-amber-500/10 border-amber-500 text-amber-600 dark:text-amber-400 shadow-sm' 
              : 'bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
          }`}
        >
          <span className="text-[10px] font-black uppercase tracking-wider block opacity-70">⚠️ Tanımsız Yeni</span>
          <span className="text-2xl font-black text-amber-600 dark:text-amber-400">{counts.undefinedCount}</span>
          <span className="text-[11px] block opacity-60">İsimlendirilmeli</span>
        </div>

        <div 
          onClick={() => setFilterType('RUNNING')}
          className={`p-4 rounded-2xl border transition cursor-pointer ${
            filterType === 'RUNNING' 
              ? 'bg-emerald-500/10 border-emerald-500 text-emerald-600 dark:text-emerald-400 shadow-sm' 
              : 'bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
          }`}
        >
          <span className="text-[10px] font-black uppercase tracking-wider block opacity-70">🟢 Çalışıyor</span>
          <span className="text-2xl font-black text-emerald-500">{counts.running}</span>
          <span className="text-[11px] block opacity-60">Aktif İşleme</span>
        </div>

        <div 
          onClick={() => setFilterType('IDLE')}
          className={`p-4 rounded-2xl border transition cursor-pointer ${
            filterType === 'IDLE' 
              ? 'bg-amber-500/10 border-amber-500 text-amber-600 dark:text-amber-400 shadow-sm' 
              : 'bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
          }`}
        >
          <span className="text-[10px] font-black uppercase tracking-wider block opacity-70">🟡 Boşta / Durdu</span>
          <span className="text-2xl font-black text-amber-500">{counts.idle}</span>
          <span className="text-[11px] block opacity-60">İş Bekliyor</span>
        </div>

        <div 
          onClick={() => setFilterType('DOWN')}
          className={`p-4 rounded-2xl border transition cursor-pointer ${
            filterType === 'DOWN' 
              ? 'bg-rose-500/10 border-rose-500 text-rose-600 dark:text-rose-400 shadow-sm' 
              : 'bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
          }`}
        >
          <span className="text-[10px] font-black uppercase tracking-wider block opacity-70">🔴 Duruş / Alarm</span>
          <span className="text-2xl font-black text-rose-500">{counts.down}</span>
          <span className="text-[11px] block opacity-60">Arıza / Duruş</span>
        </div>
      </div>

      {/* 3. ARAMA VE FİLTRE ÇUBUĞU */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cihaz adı, IP, grup veya program ara..."
            className="w-full pl-9 pr-4 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:border-blue-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
            >
              ×
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
          <span className="text-xs text-slate-500 font-medium">
            Listelenen: <b className="text-slate-800 dark:text-slate-200">{filteredDevices.length}</b> / {inspectedDevices.length}
          </span>
          {onOpenAliasModal && (
            <button
              onClick={() => onOpenAliasModal()}
              className="px-3 py-2 rounded-xl bg-blue-50 dark:bg-blue-900/40 hover:bg-blue-100 text-blue-600 dark:text-blue-400 text-xs font-bold transition flex items-center gap-1.5"
            >
              <Plus size={13} />
              <span>Yeni Eşleştirme Ekle</span>
            </button>
          )}
        </div>
      </div>

      {/* 4. GELEN CİHAZLAR LİSTESİ / TABLOSU */}
      {filteredDevices.length === 0 ? (
        <div className="p-12 text-center rounded-3xl bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-500 mx-auto flex items-center justify-center font-bold">
            <AlertCircle size={24} />
          </div>
          <h3 className="text-sm font-black text-slate-800 dark:text-slate-200">
            {inspectedDevices.length === 0 
              ? 'Dış Sunucudan Henüz Canlı Telemetri Alınamadı' 
              : 'Filtreye Uygun Cihaz Bulunamadı'}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            {inspectedDevices.length === 0
              ? 'Tarayıcınız HTTPS üzerinden şifresiz HTTP adresine istek atarken Mixed Content / CORS engeline takılmış olabilir. Yukarıdaki "Tarayıcıdan Canlı Test Et" butonu ile kontrol edebilirsiniz.'
              : 'Arama kriterinizi veya durum filtresini değiştirerek tekrar deneyebilirsiniz.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredDevices.map((dev) => {
            const st = (dev.currentState || 'offline').toLowerCase();
            const isRunning = st === 'running';
            const isIdle = ['idle', 'idling'].includes(st);
            const isDown = st === 'down';

            return (
              <div 
                key={dev.uniqueKey}
                className={`p-4 rounded-2xl border transition hover:shadow-md flex flex-col justify-between space-y-3 ${
                  dev.isDefined
                    ? 'bg-white dark:bg-slate-800/90 border-slate-200 dark:border-slate-700'
                    : 'bg-amber-50/40 dark:bg-amber-950/20 border-amber-300 dark:border-amber-800/60'
                }`}
              >
                {/* Üst Başlık & Durum */}
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-0.5 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full ${
                        isRunning ? 'bg-emerald-500 animate-pulse' :
                        isIdle ? 'bg-amber-500' :
                        isDown ? 'bg-rose-500' : 'bg-slate-400'
                      }`}></span>
                      <h4 className="font-black text-sm text-slate-800 dark:text-white truncate">
                        {dev.displayName}
                      </h4>
                    </div>

                    <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                      <span>IP: {dev.ip || 'Bilinmiyor'}</span>
                      {dev.name && dev.name !== dev.displayName && (
                        <>
                          <span>•</span>
                          <span className="text-slate-400">Sunucu Kodu: {dev.name}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Tanımlı / Tanımsız Rozeti */}
                  <div>
                    {dev.isDefined ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 flex items-center gap-1 shrink-0">
                        <Check size={10} /> Tanımlı
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 flex items-center gap-1 shrink-0 animate-pulse">
                        <AlertTriangle size={10} /> Tanımsız Cihaz
                      </span>
                    )}
                  </div>
                </div>

                {/* Telemetri Değerleri */}
                <div className="grid grid-cols-2 gap-2 text-xs p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-700/60">
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold block">DURUM</span>
                    <span className={`font-black text-xs uppercase ${
                      isRunning ? 'text-emerald-600 dark:text-emerald-400' :
                      isIdle ? 'text-amber-600 dark:text-amber-400' :
                      isDown ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400'
                    }`}>
                      {dev.currentState || 'Çevrimdışı'}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-400 font-bold block">GRUP / KONTROL</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-200 truncate block">
                      {dev.group || dev.displayGroup}
                    </span>
                  </div>

                  <div className="col-span-2">
                    <span className="text-[10px] text-slate-400 font-bold block">AKTİF NC PROGRAM</span>
                    <span className="font-mono text-[11px] text-slate-800 dark:text-slate-200 truncate block">
                      {dev.program || '— (Seçili Değil)'}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-400 font-bold block">SPINDLE / FEED</span>
                    <span className="font-mono font-bold text-slate-700 dark:text-slate-200">
                      {dev.spindleRpm !== null && dev.spindleRpm !== undefined ? `${dev.spindleRpm} RPM` : '—'} 
                      {' / '}
                      {dev.feedrate !== null && dev.feedrate !== undefined ? `${dev.feedrate}` : '—'}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-400 font-bold block">24S ÇALIŞMA %</span>
                    <span className="font-bold text-slate-700 dark:text-slate-200">
                      {dev.runningPct ? `%${Math.round(dev.runningPct * 100)}` : '%0'}
                      {dev.partsCount ? ` (${dev.partsCount} pç)` : ''}
                    </span>
                  </div>
                </div>

                {/* Alt Aksiyon Butonları */}
                <div className="flex items-center justify-between gap-2 pt-1">
                  <button
                    onClick={() => setSelectedRawDevice(dev)}
                    className="text-[11px] font-bold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 flex items-center gap-1 transition"
                  >
                    <Eye size={12} />
                    <span>Ham Veri</span>
                  </button>

                  {onOpenAliasModal && (
                    <button
                      onClick={() => onOpenAliasModal(dev)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                        dev.isDefined
                          ? 'bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-slate-700 dark:text-slate-200'
                          : 'bg-amber-600 hover:bg-amber-700 text-white shadow-sm'
                      }`}
                    >
                      <Edit3 size={12} />
                      <span>{dev.isDefined ? 'İsmi Düzenle' : 'Kalıphaneye Tanımla'}</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 5. KAYITLI LİSTEDE OLUP DA AKIŞTA GÖRÜNMEYENLER BÖLÜMÜ */}
      {missingFromFeed.length > 0 && (
        <div className="p-4 md:p-5 rounded-3xl bg-slate-100/80 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 space-y-3">
          <button
            onClick={() => setShowMissingAliases(!showMissingAliases)}
            className="w-full flex items-center justify-between text-left text-xs font-bold text-slate-600 dark:text-slate-300"
          >
            <div className="flex items-center gap-2">
              <AlertCircle size={15} className="text-slate-400" />
              <span>
                Kalıphanede Kayıtlı Olup Şu An Dış Akışta Görünmeyen Cihazlar ({missingFromFeed.length})
              </span>
            </div>
            {showMissingAliases ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          {showMissingAliases && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 pt-2">
              {missingFromFeed.map(alias => (
                <div 
                  key={alias.ipOrId}
                  className="p-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs flex items-center justify-between"
                >
                  <div>
                    <span className="font-black text-slate-800 dark:text-slate-200 block">{alias.customName}</span>
                    <span className="text-[10px] text-slate-400 font-mono">{alias.ipOrId}</span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 font-bold">
                    Kayıtlı Şablon
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* MODAL 1: BİLGİ İŞLEM (IT) AYAR NOTU */}
      {showItSnippetModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b dark:border-slate-700 pb-3">
              <div className="flex items-center gap-2">
                <Code size={18} className="text-blue-500" />
                <h3 className="font-black text-slate-800 dark:text-white text-sm md:text-base">
                  Bilgi İşlem (IT) Ekibi İçin Nginx CORS & SSL Ayar Kılavuzu
                </h3>
              </div>
              <button 
                onClick={() => setShowItSnippetModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Modern web tarayıcıları HTTPS çalışan bir siteden (<code className="font-mono bg-slate-100 dark:bg-slate-700 px-1 py-0.5 rounded">https://kaliphane-v2.web.app</code>) şifresiz HTTP adresine istek atarken Mixed Content ve CORS kurallarını zorunlu tutar.
              <br /><br />
              Sunucuda (<code className="font-mono bg-slate-100 dark:bg-slate-700 px-1 py-0.5 rounded">195.46.142.179:1106</code>) çalışan Nginx yapılandırmasına aşağıdaki satırlar eklendiğinde tarayıcılar hiçbir ek ayar gerekmeden verileri anında okuyabilecektir:
            </p>

            <div className="relative">
              <pre className="p-4 rounded-2xl bg-slate-950 text-slate-200 font-mono text-[11px] overflow-x-auto max-h-60 custom-scrollbar select-all">
                {IT_NGINX_CORS_SNIPPET}
              </pre>
              <button
                onClick={handleCopySnippet}
                className="absolute right-3 top-3 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-md"
              >
                {isCopied ? <Check size={13} /> : <Copy size={13} />}
                <span>{isCopied ? 'Kopyalandı!' : 'Metni Kopyala'}</span>
              </button>
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setShowItSnippetModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-xs font-bold text-slate-700 dark:text-slate-200"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: SEÇİLİ CİHAZ HAM JSON */}
      {selectedRawDevice && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-xl bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b dark:border-slate-700 pb-3">
              <div className="flex items-center gap-2">
                <Cpu size={18} className="text-blue-500" />
                <h3 className="font-black text-slate-800 dark:text-white text-sm md:text-base">
                  Cihaz Ham Telemetri Paketi: {selectedRawDevice.displayName}
                </h3>
              </div>
              <button 
                onClick={() => setSelectedRawDevice(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <pre className="p-4 rounded-2xl bg-slate-950 text-slate-200 font-mono text-[11px] overflow-x-auto max-h-80 custom-scrollbar select-all">
              {JSON.stringify(selectedRawDevice, null, 2)}
            </pre>

            <div className="flex items-center justify-between">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(JSON.stringify(selectedRawDevice, null, 2));
                  alert('Cihaz JSON verisi kopyalandı!');
                }}
                className="px-3.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5"
              >
                <Copy size={13} /> JSON Kopyala
              </button>
              <button
                onClick={() => setSelectedRawDevice(null)}
                className="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: TÜM HAM AKIŞ JSON */}
      {showRawJsonModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-3xl bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b dark:border-slate-700 pb-3">
              <div className="flex items-center gap-2">
                <FileText size={18} className="text-blue-500" />
                <h3 className="font-black text-slate-800 dark:text-white text-sm md:text-base">
                  Dış OEE Servisinden Alınan Tüm Ham JSON ({rawFleet.length} Cihaz)
                </h3>
              </div>
              <button 
                onClick={() => setShowRawJsonModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <pre className="p-4 rounded-2xl bg-slate-950 text-slate-200 font-mono text-[11px] overflow-x-auto max-h-96 custom-scrollbar select-all">
              {JSON.stringify(rawFleet, null, 2)}
            </pre>

            <div className="flex items-center justify-between">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(JSON.stringify(rawFleet, null, 2));
                  alert('Tüm JSON kopyalandı!');
                }}
                className="px-3.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5"
              >
                <Copy size={13} /> Tümünü Kopyala
              </button>
              <button
                onClick={() => setShowRawJsonModal(false)}
                className="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
