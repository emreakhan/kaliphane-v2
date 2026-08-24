// src/services/etkaOeeService.js

// ==========================================
// ETKA PORTAL — BASE URL & HOST PRESETS
// ==========================================
export const INTERNAL_BASE_URL = 'http://etkacrm.agdc.com.tr:1106/api';
export const EXTERNAL_BASE_URL = 'http://195.46.142.179:1106/api';

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

const BASE_URL_KEY = 'etka_portal_base_url';
const ACCESS_TOKEN_KEY = 'etka_portal_access_token';
const REFRESH_TOKEN_KEY = 'etka_portal_refresh_token';
const USER_INFO_KEY = 'etka_portal_user_info';
const ALIASES_STORAGE_KEY = 'etka_oee_machine_aliases';

// Base URL Normalizasyonu
export const getBaseUrl = () => {
  const saved = localStorage.getItem(BASE_URL_KEY);
  if (!saved) return INTERNAL_BASE_URL;
  let url = saved.trim().replace(/\/+$/, '');
  if (!url.endsWith('/api')) {
    url = `${url}/api`;
  }
  return url;
};

export const setBaseUrl = (url) => {
  if (!url) {
    localStorage.removeItem(BASE_URL_KEY);
  } else {
    let cleaned = url.trim().replace(/\/+$/, '');
    if (!cleaned.endsWith('/api')) {
      cleaned = `${cleaned}/api`;
    }
    localStorage.setItem(BASE_URL_KEY, cleaned);
  }
};

// Token Yönetimi
export const getAccessToken = () => localStorage.getItem(ACCESS_TOKEN_KEY) || '';
export const setAccessToken = (token) => {
  if (!token) localStorage.removeItem(ACCESS_TOKEN_KEY);
  else localStorage.setItem(ACCESS_TOKEN_KEY, token.trim());
};

export const getRefreshToken = () => localStorage.getItem(REFRESH_TOKEN_KEY) || '';
export const setRefreshToken = (token) => {
  if (!token) localStorage.removeItem(REFRESH_TOKEN_KEY);
  else localStorage.setItem(REFRESH_TOKEN_KEY, token.trim());
};

export const getStoredUser = () => {
  try {
    const data = localStorage.getItem(USER_INFO_KEY);
    return data ? JSON.parse(data) : null;
  } catch (e) {
    return null;
  }
};

export const setStoredUser = (user) => {
  if (!user) localStorage.removeItem(USER_INFO_KEY);
  else localStorage.setItem(USER_INFO_KEY, JSON.stringify(user));
};

export const clearAuth = () => {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(USER_INFO_KEY);
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
// HTTP İSTEK VE OTOMATİK TOKEN YENİLEME
// ==========================================
let isRefreshing = false;
let refreshSubscribers = [];

const subscribeTokenRefresh = (cb) => {
  refreshSubscribers.push(cb);
};

const onRefreshed = (token) => {
  refreshSubscribers.forEach((cb) => cb(token));
  refreshSubscribers = [];
};

export const refreshAccessToken = async () => {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    clearAuth();
    throw new Error('Refresh token bulunamadı, lütfen tekrar giriş yapın.');
  }

  const baseUrl = getBaseUrl();
  const url = `${baseUrl}/auth/refresh`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken })
  });

  if (!response.ok) {
    clearAuth();
    throw new Error('Oturum süresi doldu, lütfen tekrar giriş yapın.');
  }

  const result = await response.json();
  if (result && result.accessToken) {
    setAccessToken(result.accessToken);
    if (result.refreshToken) {
      setRefreshToken(result.refreshToken);
    }
    return result.accessToken;
  } else {
    clearAuth();
    throw new Error('Token yenilenemedi.');
  }
};

export const fetchWithAuth = async (endpoint, options = {}, timeoutMs = 8000, customBaseUrl = null) => {
  const baseUrl = customBaseUrl ? customBaseUrl.trim().replace(/\/+$/, '') : getBaseUrl();
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const url = `${baseUrl}${cleanEndpoint}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  const token = getAccessToken();
  if (token && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    let response = await fetch(url, {
      ...options,
      headers,
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    // 401 Unauthorized durumunda Token Refresh Mekanizması
    if (response.status === 401 && getRefreshToken() && !endpoint.includes('/auth/')) {
      if (!isRefreshing) {
        isRefreshing = true;
        try {
          const newToken = await refreshAccessToken();
          isRefreshing = false;
          onRefreshed(newToken);
        } catch (refreshErr) {
          isRefreshing = false;
          refreshSubscribers = [];
          throw refreshErr;
        }
      }

      // Yeni token geldikten sonra isteği yeniden dene
      const retryPromise = new Promise((resolve) => {
        subscribeTokenRefresh((newToken) => {
          headers['Authorization'] = `Bearer ${newToken}`;
          resolve(fetch(url, { ...options, headers }));
        });
      });
      response = await retryPromise;
    }

    if (response.status === 204) {
      return null;
    }

    if (!response.ok) {
      const errText = await response.text();
      let parsedMsg = errText;
      try {
        const jsonErr = JSON.parse(errText);
        parsedMsg = jsonErr.error || jsonErr.message || errText;
      } catch (e) {
        // ignore json parse
      }

      if (response.status === 401) {
        throw new Error('Yetkisiz Erişim (401): Lütfen ETKA Portal kullanıcı girişi yapınız.');
      }
      if (response.status === 403) {
        throw new Error('Yetki Hatası (403): Kullanıcınıza Portal admin panelinden "OEE" modülü / "OEE_FILO" sayfa izni verilmelidir.');
      }
      if (response.status === 404) {
        throw new Error(`Uç Nokta Bulunamadı (404): ${cleanEndpoint}`);
      }

      throw new Error(`[HTTP ${response.status}] ${parsedMsg}`);
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
      throw new Error(`Tarayıcı Güvenlik Engeli (Mixed Content): Sayfa HTTPS ile açıldığı için HTTP sunucusuna (${baseUrl}) istek engellendi. Tarayıcınızda Site Ayarları > Güvenli Olmayan İçerik > İzin Ver yapabilir veya HTTPS kullanabilirsiniz.`);
    }

    throw err;
  }
};

// ==========================================
// 1. KİMLİK DOĞRULAMA (AUTH) ENDPOINTS
// ==========================================

export const loginPortal = async (usernameOrEmail, password, rememberMe = true) => {
  const result = await fetchWithAuth('/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      usernameOrEmail: usernameOrEmail.trim(),
      password,
      rememberMe
    })
  });

  if (result && result.accessToken) {
    setAccessToken(result.accessToken);
    if (result.refreshToken) {
      setRefreshToken(result.refreshToken);
    }
    if (result.user) {
      setStoredUser(result.user);
    }
  }
  return result;
};

export const logoutPortal = async () => {
  try {
    await fetchWithAuth('/auth/logout', { method: 'POST' }).catch(() => {});
  } finally {
    clearAuth();
  }
};

export const checkPortalInfo = async (customBaseUrl = null) => {
  return await fetchWithAuth('/portal/info', {}, 4000, customBaseUrl);
};

// ==========================================
// 2. OEE ENDPOINTS (ETKA PORTAL BACKEND)
// ==========================================

/**
 * GET /api/oee/health
 * Dış CNC servisinin durumunu döner.
 * Yanıt formatı: { success: true, data: { configured, reachable, monitoringRunning, trackedDevices, error } }
 */
export const getOeeHealth = async (customBaseUrl = null) => {
  const res = await fetchWithAuth('/oee/health', {}, 5000, customBaseUrl);
  return res?.data || res;
};

/**
 * GET /api/oee/fleet
 * Tüm tezgahların anlık durum ve çalışma metriklerini döner.
 * Yanıt formatı: { success: true, count: number, data: Device[] }
 */
export const getOeeFleet = async (customBaseUrl = null) => {
  const res = await fetchWithAuth('/oee/fleet', {}, 7000, customBaseUrl);
  if (res && Array.isArray(res.data)) {
    return res.data;
  }
  if (Array.isArray(res)) {
    return res;
  }
  return [];
};
