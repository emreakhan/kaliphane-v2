// src/services/etkaOeeService.js
import * as signalR from '@microsoft/signalr';

// ==========================================
// ETKA OEE — BASE URL VE BAĞLANTI SABİTLERİ
// ==========================================
export const INTERNAL_BASE_URL = 'http://etkacrm.agdc.com.tr:1106'; // Kurum İçi / Şirket VPN
export const EXTERNAL_BASE_URL = 'http://195.46.142.179:1106';     // Kurum Dışı / VPN'siz İnternet

export const PRESET_BASE_URLS = [
  {
    id: 'internal',
    label: 'Kurum İçi / Şirket VPN',
    url: INTERNAL_BASE_URL,
    badge: '🏢 Fabrika / VPN Ağında',
    description: 'Şirket yerel ağında veya kurumsal VPN açıkken kullanılır.'
  },
  {
    id: 'external',
    label: 'Kurum Dışı / İnternet (VPN\'siz)',
    url: EXTERNAL_BASE_URL,
    badge: '🌍 Dış Ağ / Mobil Veri',
    description: 'Ofis dışından, evden veya mobil cihazdan doğrudan internet üzerinden erişilir.'
  }
];

const STORAGE_KEY = 'etka_oee_base_url';
const ADMIN_TOKEN_KEY = 'etka_oee_admin_token';
const ALIASES_STORAGE_KEY = 'etka_oee_machine_aliases';

// Base URL Yönetimi
export const getBaseUrl = () => {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return INTERNAL_BASE_URL;
  return saved.trim().replace(/\/+$/, '');
};

export const setBaseUrl = (url) => {
  if (!url) {
    localStorage.removeItem(STORAGE_KEY);
  } else {
    const cleaned = url.trim().replace(/\/+$/, '');
    localStorage.setItem(STORAGE_KEY, cleaned);
  }
};

// Admin Token Yönetimi
export const getAdminToken = () => {
  return localStorage.getItem(ADMIN_TOKEN_KEY) || '';
};

export const setAdminToken = (token) => {
  if (!token) {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
  } else {
    localStorage.setItem(ADMIN_TOKEN_KEY, token.trim());
  }
};

// ==========================================
// TEZGAH İSİMLENDİRME & EŞLEŞTİRME (ALIASES)
// ==========================================
const DEFAULT_ALIASES = [
  { ipOrId: '192.168.2.72', customName: 'K22 — FANUC 0i-M', group: 'CNC Dik İşleme', location: 'Kalıphane A Blok' },
  { ipOrId: '192.168.2.73', customName: 'K40 — HEIDENHAIN 530', group: 'CNC Dik İşleme', location: 'Kalıphane A Blok' },
  { ipOrId: '192.168.2.74', customName: 'K15 — SIEMENS S7', group: 'CNC Torna', location: 'Kalıphane B Blok' },
  { ipOrId: '192.168.2.75', customName: 'K08 — FANUC Robodrill', group: 'CNC Hızlı İşleme', location: 'Kalıphane C Blok' },
  { ipOrId: '192.168.2.76', customName: 'K03 — MITSUBISHI EDM', group: 'Dalma Erezyon', location: 'Erezyon Bölümü' }
];

export const getMachineAliases = () => {
  try {
    const saved = localStorage.getItem(ALIASES_STORAGE_KEY);
    if (!saved) return DEFAULT_ALIASES;
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed : DEFAULT_ALIASES;
  } catch (e) {
    return DEFAULT_ALIASES;
  }
};

export const setMachineAliases = (aliases) => {
  try {
    localStorage.setItem(ALIASES_STORAGE_KEY, JSON.stringify(aliases));
  } catch (e) {
    console.error("Machine aliases save error:", e);
  }
};

export const findAlias = (ip, id, name) => {
  const aliases = getMachineAliases();
  const searchIp = (ip || '').trim().toLowerCase();
  const searchId = (id || '').trim().toLowerCase();
  const searchName = (name || '').trim().toLowerCase();

  return aliases.find(a => {
    const key = (a.ipOrId || '').trim().toLowerCase();
    return key === searchIp || key === searchId || key === searchName;
  });
};

// ==========================================
// EVDEN TEST İÇİN DİNAMİK SİMÜLASYON VERİSİ
// ==========================================
export const generateDemoFleetData = () => {
  const aliases = getMachineAliases();
  
  return aliases.map((alias, idx) => {
    const states = ['Running', 'Running', 'Running', 'Idle', 'Down', 'Setup'];
    const currentState = states[idx % states.length];

    const isRunning = currentState === 'Running';
    const isIdle = currentState === 'Idle' || currentState === 'Idling';

    const spindleRpm = isRunning ? Math.floor(3000 + Math.random() * 2500) : (isIdle ? 0 : null);
    const feedrate = isRunning ? Math.floor(600 + Math.random() * 1200) : (isIdle ? 0 : null);
    const programs = ['O1234_MENTESE', 'MOLD_TOP_PLATE', 'O9012_DISI_CELIK', 'CORE_BOTTOM_504', 'AP200_SLIDE'];
    
    // Operatör Override Yüzdeleri
    const feedOverrides = [100, 80, 60, 100, 50, 100];
    const rapidOverrides = [100, 50, 100, 25, 100, 100];
    const spindleOverrides = [100, 100, 90, 100, 100, 100];

    const feedOverridePct = isRunning || isIdle ? feedOverrides[idx % feedOverrides.length] : 100;
    const rapidOverridePct = isRunning || isIdle ? rapidOverrides[idx % rapidOverrides.length] : 100;
    const spindleOverridePct = isRunning || isIdle ? spindleOverrides[idx % spindleOverrides.length] : 100;

    const runningSec = isRunning ? 54000 + Math.floor(Math.random() * 10000) : 32000;
    const idleSec = isIdle ? 18000 : 4000;
    const idlingSec = 1200;
    const downSec = currentState === 'Down' ? 12000 : 1000;
    const totalSec = runningSec + idleSec + idlingSec + downSec || 1;

    return {
      id: `demo-device-${idx + 1}`,
      name: alias.customName || alias.ipOrId,
      ip: alias.ipOrId,
      group: alias.group || 'CNC Dik İşleme',
      location: alias.location || 'Kalıphane',
      currentState,
      currentStateSec: Math.floor(Math.random() * 3600),
      spindleRpm,
      feedrate,
      feedOverridePct,
      rapidOverridePct,
      spindleOverridePct,
      program: programs[idx % programs.length],
      runningPct: runningSec / totalSec,
      runningSec,
      idleSec,
      idlingSec,
      downSec,
      offlineSec: 0,
      partsCount: Math.floor(15 + Math.random() * 80),
      avgCycleSec: Math.floor(200 + Math.random() * 300),
      connected: true,
      lastDataUtc: new Date().toISOString(),
      axes: [
        { name: 'X', position: (123.456 + Math.random() * 2).toFixed(3) },
        { name: 'Y', position: (-45.210 + Math.random()).toFixed(3) },
        { name: 'Z', position: (312.800 + Math.random() * 1.5).toFixed(3) },
        { name: 'C', position: '0.000' }
      ],
      vendor: alias.customName.includes('FANUC') ? 'FANUC' : (alias.customName.includes('HEIDENHAIN') ? 'HEIDENHAIN' : 'SIEMENS')
    };
  });
};

// ==========================================
// HTTP İSTEK YARDIMCISI (TIMEOUT & ADMIN TOKEN)
// ==========================================
const fetchWithTimeout = async (endpoint, options = {}, timeoutMs = 6000, customBaseUrl = null) => {
  const baseUrl = customBaseUrl ? customBaseUrl.trim().replace(/\/+$/, '') : getBaseUrl();
  const url = `${baseUrl}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  const adminToken = getAdminToken();
  if (adminToken) {
    headers['Authorization'] = `Bearer ${adminToken}`;
    headers['X-Admin-Token'] = adminToken;
  }

  try {
    const response = await fetch(url, {
      ...options,
      headers,
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (response.status === 204) {
      return null;
    }

    if (!response.ok) {
      const errText = await response.text();
      let parsedErr = errText;
      try {
        const jsonErr = JSON.parse(errText);
        parsedErr = jsonErr.error || jsonErr.message || errText;
      } catch (e) {
        // ignore json parse error
      }
      throw new Error(`[HTTP ${response.status}] ${parsedErr}`);
    }

    return await response.json();
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error(`Sunucu yanıt vermedi (${baseUrl}). Zaman aşımı.`);
    }

    const isHttpsPage = typeof window !== 'undefined' && window.location && window.location.protocol === 'https:';
    const isHttpTarget = baseUrl.startsWith('http://');

    if ((err.message === 'Failed to fetch' || err.name === 'TypeError') && isHttpsPage && isHttpTarget) {
      throw new Error(`Tarayıcı Güvenlik Engeli (Mixed Content): Sayfa HTTPS ile açıldığı için HTTP sunucusuna (${baseUrl}) istek engellendi. Tarayıcı ayarlarından (Site Ayarları -> Güvenli Olmayan İçerik -> İzin Ver) seçeneğini açabilir veya sunucuya HTTPS ekleyebilirsiniz.`);
    }

    throw err;
  }
};

// ==========================================
// REST API ENDPOINTS (ETKA OEE v1)
// ==========================================

// §3 Sağlık / Meta
export const checkHealth = async (customBaseUrl = null) => {
  return await fetchWithTimeout('/api/health', {}, 4000, customBaseUrl);
};

export const getServerInfo = async (customBaseUrl = null) => {
  return await fetchWithTimeout('/api/server/info', {}, 4000, customBaseUrl);
};

export const getModules = async () => {
  return await fetchWithTimeout('/api/modules');
};

// §2 Kimlik Doğrulama (Admin / Portal)
export const getAuthStatus = async () => {
  return await fetchWithTimeout('/api/auth/status');
};

export const loginEtka = async (usernameOrEmail, password) => {
  const data = await fetchWithTimeout('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      username: usernameOrEmail,
      email: usernameOrEmail,
      password
    })
  });
  const token = data?.data?.token || data?.token || data?.accessToken;
  if (token) {
    setAdminToken(token);
  }
  return data;
};

export const loginAdmin = async (password) => {
  return await loginEtka('admin', password);
};

export const logoutAdmin = async () => {
  try {
    await fetchWithTimeout('/api/auth/logout', { method: 'POST' });
  } catch (e) {
    // ignore
  } finally {
    setAdminToken('');
  }
};

// §7 Dashboard & Metrikler
export const getDashboard = async () => {
  return await fetchWithTimeout('/api/dashboard');
};

export const getSystemMetrics = async () => {
  return await fetchWithTimeout('/api/system/metrics');
};

// §8 OEE / Canlı İzleme & Filo
export const getFleetOee = async () => {
  return await fetchWithTimeout('/api/oee/fleet');
};

export const getDeviceLive = async (deviceId) => {
  return await fetchWithTimeout(`/api/devices/${deviceId}/live`);
};

export const getDeviceOee = async (deviceId, hours = 24) => {
  return await fetchWithTimeout(`/api/devices/${deviceId}/oee?hours=${hours}`);
};

export const getDeviceTimeline = async (deviceId, hours = 24) => {
  return await fetchWithTimeout(`/api/devices/${deviceId}/timeline?hours=${hours}`);
};

// §4 Cihaz Yönetimi (Filo)
export const getDevices = async () => {
  return await fetchWithTimeout('/api/devices');
};

export const getDeviceDetails = async (deviceId) => {
  return await fetchWithTimeout(`/api/devices/${deviceId}`);
};

export const addDevice = async (deviceData) => {
  return await fetchWithTimeout('/api/devices', {
    method: 'POST',
    body: JSON.stringify(deviceData)
  });
};

export const updateDevice = async (deviceId, deviceData) => {
  return await fetchWithTimeout(`/api/devices/${deviceId}`, {
    method: 'PUT',
    body: JSON.stringify(deviceData)
  });
};

export const deleteDevice = async (deviceId) => {
  return await fetchWithTimeout(`/api/devices/${deviceId}`, {
    method: 'DELETE'
  });
};

export const rescanDevice = async (deviceId) => {
  return await fetchWithTimeout(`/api/devices/${deviceId}/rescan`, {
    method: 'POST'
  });
};

// §6 Ağ Keşfi (Subnet Tarama)
export const getNetworkRanges = async () => {
  return await fetchWithTimeout('/api/network/ranges');
};

export const scanNetwork = async (cidr = '') => {
  return await fetchWithTimeout('/api/network/scan', {
    method: 'POST',
    body: JSON.stringify({ cidr })
  });
};

// §9 İzleme & Kayıt Kontrolleri
export const getMonitoringStatus = async () => {
  return await fetchWithTimeout('/api/monitoring/status');
};

export const startMonitoring = async () => {
  return await fetchWithTimeout('/api/monitoring/start', { method: 'POST' });
};

export const stopMonitoring = async () => {
  return await fetchWithTimeout('/api/monitoring/stop', { method: 'POST' });
};

export const getRecordingStatus = async () => {
  return await fetchWithTimeout('/api/recording');
};

export const setRecording = async (enabled) => {
  return await fetchWithTimeout('/api/recording', {
    method: 'POST',
    body: JSON.stringify({ enabled })
  });
};

// §10 Ayarlar
export const getSettings = async () => {
  return await fetchWithTimeout('/api/settings');
};

export const updateSettings = async (settings) => {
  return await fetchWithTimeout('/api/settings', {
    method: 'PUT',
    body: JSON.stringify(settings)
  });
};

export const testDbConnection = async (connectionString) => {
  return await fetchWithTimeout('/api/settings/test-connection', {
    method: 'POST',
    body: JSON.stringify({ connectionString })
  });
};

// ==========================================
// SIGNALR REAL-TIME CLIENT (HUB: /hubs/discovery)
// ==========================================

let hubConnection = null;
let keepLiveInterval = null;

export const startSignalR = async ({ onRawData, onDeviceUpdated, onDeviceLog, onConnectionStateChange }) => {
  const baseUrl = getBaseUrl();
  const hubUrl = `${baseUrl}/hubs/discovery`;

  if (hubConnection) {
    try {
      await hubConnection.stop();
    } catch (e) {
      console.warn("SignalR stop warning:", e);
    }
    hubConnection = null;
  }

  const connection = new signalR.HubConnectionBuilder()
    .withUrl(hubUrl, {
      skipNegotiation: false,
      transport: signalR.HttpTransportType.WebSockets | signalR.HttpTransportType.LongPolling
    })
    .withAutomaticReconnect([0, 2000, 5000, 10000, 20000])
    .configureLogging(signalR.LogLevel.Warning)
    .build();

  connection.onreconnecting((error) => {
    console.warn("SignalR Reconnecting:", error);
    if (onConnectionStateChange) onConnectionStateChange('reconnecting');
  });

  connection.onreconnected((connectionId) => {
    console.log("SignalR Reconnected:", connectionId);
    if (onConnectionStateChange) onConnectionStateChange('connected');
  });

  connection.onclose((error) => {
    console.warn("SignalR Closed:", error);
    if (onConnectionStateChange) onConnectionStateChange('disconnected');
  });

  if (onRawData) {
    connection.on("rawData", (payload) => onRawData(payload));
  }

  if (onDeviceUpdated) {
    connection.on("deviceUpdated", (device) => onDeviceUpdated(device));
  }

  if (onDeviceLog) {
    connection.on("deviceLog", (log) => onDeviceLog(log));
  }

  try {
    await connection.start();
    console.log("ETKA OEE SignalR Connected:", hubUrl);
    hubConnection = connection;
    if (onConnectionStateChange) onConnectionStateChange('connected');
    return connection;
  } catch (err) {
    console.error("SignalR Connection Error:", err);
    if (onConnectionStateChange) onConnectionStateChange('error');
    throw err;
  }
};

export const sendKeepLiveSignal = async (managedDeviceId) => {
  if (!hubConnection || hubConnection.state !== signalR.HubConnectionState.Connected) {
    return;
  }
  try {
    await hubConnection.invoke("KeepLive", managedDeviceId);
  } catch (err) {
    console.warn("KeepLive invoke error:", err);
  }
};

export const startKeepLiveLoop = (managedDeviceId, intervalMs = 3000) => {
  stopKeepLiveLoop();
  if (!managedDeviceId) return;

  sendKeepLiveSignal(managedDeviceId);

  keepLiveInterval = setInterval(() => {
    sendKeepLiveSignal(managedDeviceId);
  }, intervalMs);
};

export const stopKeepLiveLoop = () => {
  if (keepLiveInterval) {
    clearInterval(keepLiveInterval);
    keepLiveInterval = null;
  }
};

export const stopSignalR = async () => {
  stopKeepLiveLoop();
  if (hubConnection) {
    try {
      await hubConnection.stop();
    } catch (e) {
      console.warn("SignalR stop error:", e);
    }
    hubConnection = null;
  }
};
