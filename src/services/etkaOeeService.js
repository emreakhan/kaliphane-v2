import * as signalR from '@microsoft/signalr';

const DEFAULT_BASE_URL = 'http://172.16.50.10:5185';
const STORAGE_KEY = 'etka_oee_base_url';
const ALIASES_STORAGE_KEY = 'etka_oee_machine_aliases';

export const getBaseUrl = () => {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return DEFAULT_BASE_URL;
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
// EVDEN ÇALIŞANLAR İÇİN DİNAMİK SİMÜLASYON VERİSİ
// ==========================================

export const generateDemoFleetData = () => {
  const aliases = getMachineAliases();
  
  return aliases.map((alias, idx) => {
    const states = ['Running', 'Running', 'Running', 'Idle', 'Down'];
    const currentState = states[idx % states.length];

    const isRunning = currentState === 'Running';
    const isIdle = currentState === 'Idle';

    const spindleRpm = isRunning ? Math.floor(3000 + Math.random() * 2500) : (isIdle ? 0 : null);
    const feedrate = isRunning ? Math.floor(600 + Math.random() * 1200) : (isIdle ? 0 : null);
    const programs = ['O1234_MENTESE', 'MOLD_TOP_PLATE', 'O9012_DISI_CELIK', 'CORE_BOTTOM_504', 'AP200_SLIDE'];
    
    // Operatör Override Yüzdeleri Simülasyonu
    const feedOverrides = [100, 80, 60, 100, 50];
    const rapidOverrides = [100, 50, 100, 25, 100];
    const spindleOverrides = [100, 100, 90, 100, 100];

    const feedOverridePct = isRunning || isIdle ? feedOverrides[idx % feedOverrides.length] : 100;
    const rapidOverridePct = isRunning || isIdle ? rapidOverrides[idx % rapidOverrides.length] : 100;
    const spindleOverridePct = isRunning || isIdle ? spindleOverrides[idx % spindleOverrides.length] : 100;

    const runningSec = isRunning ? 54000 + Math.floor(Math.random() * 10000) : 32000;
    const idleSec = isIdle ? 18000 : 4000;
    const downSec = currentState === 'Down' ? 12000 : 1000;
    const totalSec = runningSec + idleSec + downSec || 1;

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
      downSec,
      offlineSec: 0,
      vendor: alias.customName.includes('FANUC') ? 'FANUC' : (alias.customName.includes('HEIDENHAIN') ? 'HEIDENHAIN' : 'SIEMENS')
    };
  });
};

// Helper for HTTP requests with timeout
const fetchWithTimeout = async (endpoint, options = {}, timeoutMs = 6000, customBaseUrl = null) => {
  const baseUrl = customBaseUrl ? customBaseUrl.trim().replace(/\/+$/, '') : getBaseUrl();
  const url = `${baseUrl}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      },
      signal: controller.signal
    });
    clearTimeout(timeoutId);

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
    throw err;
  }
};

// ==========================================
// REST API ENDPOINTS
// ==========================================

export const checkHealth = async (customBaseUrl = null) => {
  return await fetchWithTimeout('/api/health', {}, 4000, customBaseUrl);
};

export const getServerInfo = async (customBaseUrl = null) => {
  return await fetchWithTimeout('/api/server/info', {}, 4000, customBaseUrl);
};

export const getDashboard = async () => {
  return await fetchWithTimeout('/api/dashboard');
};

export const getFleetOee = async () => {
  return await fetchWithTimeout('/api/oee/fleet');
};

export const getDevices = async () => {
  return await fetchWithTimeout('/api/devices');
};

export const getDeviceDetails = async (deviceId) => {
  return await fetchWithTimeout(`/api/devices/${deviceId}`);
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

// ==========================================
// SIGNALR REAL-TIME CLIENT
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
