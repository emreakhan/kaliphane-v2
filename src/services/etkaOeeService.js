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
  return url;
};

export const setBaseUrl = (url) => {
  if (!url) {
    localStorage.removeItem(BASE_URL_KEY);
  } else {
    let cleaned = url.trim().replace(/\/+$/, '');
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
export const DEFAULT_ALIASES = [
  { ipOrId: '192.168.2.73', systemMachineCode: 'K27', customName: 'K27', group: 'CNC Dik İşleme', location: 'Kalıphane A Blok' },
  { ipOrId: '192.168.2.135', systemMachineCode: 'K45', customName: 'K45', group: 'CNC Dik İşleme', location: 'Kalıphane A Blok' },
  { ipOrId: '192.168.2.75', systemMachineCode: 'K18', customName: 'K18', group: 'CNC Dik İşleme', location: 'Kalıphane A Blok' },
  { ipOrId: '192.168.1.170', systemMachineCode: 'K43', customName: 'K43', group: 'CNC Dik İşleme', location: 'Kalıphane A Blok' },
  { ipOrId: '192.168.2.66', systemMachineCode: 'K15', customName: 'K15', group: 'CNC Dik İşleme', location: 'Kalıphane A Blok' },
  { ipOrId: '192.168.1.171', systemMachineCode: 'K26', customName: 'K26', group: 'CNC Dik İşleme', location: 'Kalıphane A Blok' },
  { ipOrId: '192.168.2.36', systemMachineCode: 'K36', customName: 'K36', group: 'CNC Dik İşleme', location: 'Kalıphane A Blok' },
  { ipOrId: '192.168.2.37', systemMachineCode: 'K28', customName: 'K28', group: 'CNC Dik İşleme', location: 'Kalıphane A Blok' },
  { ipOrId: '192.168.1.155', systemMachineCode: 'K17', customName: 'K17', group: 'CNC Dik İşleme', location: 'Kalıphane A Blok' },
  { ipOrId: '192.168.2.68', systemMachineCode: 'K09', customName: 'K09', group: 'CNC Dik İşleme', location: 'Kalıphane A Blok' },
  { ipOrId: '192.168.2.72', systemMachineCode: 'K22', customName: 'K22 — FANUC 0i-M', group: 'CNC Dik İşleme', location: 'Kalıphane A Blok' },
  { ipOrId: '192.168.2.74', systemMachineCode: 'K15-2', customName: 'K15-2', group: 'CNC Torna', location: 'Kalıphane B Blok' },
  { ipOrId: '192.168.2.76', systemMachineCode: 'K03', customName: 'K03 — MITSUBISHI EDM', group: 'Dalma Erezyon', location: 'Erezyon Bölümü' }
];

export const getMachineAliases = () => {
  try {
    const saved = localStorage.getItem(ALIASES_STORAGE_KEY);
    if (!saved) return DEFAULT_ALIASES;
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_ALIASES;
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

export const cleanMachineStr = (str) => {
  return String(str || '').replace(/[^a-zA-Z0-9çğıöşüÇĞİÖŞÜ]/g, '').toLowerCase();
};

export const findAlias = (ip, id, name) => {
  const aliases = getMachineAliases();
  const searchIp = (ip || '').trim().toLowerCase();
  const searchId = (id || '').trim().toLowerCase();
  const searchName = (name || '').trim().toLowerCase();
  const cleanSearch = cleanMachineStr(name || id || ip);

  return aliases.find(a => {
    const key = (a.ipOrId || '').trim().toLowerCase();
    const cName = (a.customName || '').trim().toLowerCase();
    const sCode = (a.systemMachineCode || '').trim().toLowerCase();
    const cleanSys = cleanMachineStr(a.systemMachineCode || a.customName || a.ipOrId);

    return key === searchIp || key === searchId || key === searchName ||
           cName === searchIp || cName === searchName ||
           sCode === searchIp || sCode === searchName || sCode === searchId ||
           (cleanSearch && cleanSys && (cleanSearch === cleanSys || cleanSys.includes(cleanSearch) || cleanSearch.includes(cleanSys)));
  });
};

// ==========================================
// HTTP İSTEK, CORS & HTTPS PROXY KÖPRÜSÜ
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

  const result = await fetchWithAuth('/auth/refresh', {
    method: 'POST',
    body: JSON.stringify({ refreshToken })
  });

  const newToken = result?.accessToken || result?.token || result?.data?.accessToken || result?.data?.token;
  if (newToken) {
    setAccessToken(newToken);
    if (result.refreshToken || result.data?.refreshToken) {
      setRefreshToken(result.refreshToken || result.data?.refreshToken);
    }
    return newToken;
  } else {
    clearAuth();
    throw new Error('Token yenilenemedi.');
  }
};

// ==========================================
// OTOMATİK GİRİŞ BİLGİLERİ (SILENT AUTH)
// ==========================================
export const DEFAULT_CREDENTIALS = {
  usernameOrEmail: 'KALIPHANE',
  password: '1234'
};

export const ensureAuthenticated = async () => {
  const token = getAccessToken();
  if (token) return token;

  try {
    const res = await loginPortal(DEFAULT_CREDENTIALS.usernameOrEmail, DEFAULT_CREDENTIALS.password, true);
    return res?.accessToken || res?.token || res?.data?.token || '';
  } catch (err) {
    console.warn("Otomatik ETKA Portal girişi uyarısı:", err?.message);
    return '';
  }
};

/**
 * HTTPS Mixed Content ve CORS Engellerini Aşan Gelişmiş Fetch Motoru
 */
export const fetchWithAuth = async (endpoint, options = {}, timeoutMs = 9000, customBaseUrl = null) => {
  let rawBaseUrl = customBaseUrl ? customBaseUrl.trim().replace(/\/+$/, '') : getBaseUrl();
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;

  // Eğer rawBaseUrl sonu /api değilse ve endpoint /auth veya /oee içeriyorsa URL'i düzenle
  let url = `${rawBaseUrl}${cleanEndpoint}`;
  url = url.replace(/\/api\/api\//g, '/api/');

  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  let token = getAccessToken();
  if (!token && !endpoint.includes('login')) {
    try {
      token = await ensureAuthenticated();
    } catch (e) {
      // ignore
    }
  }

  if (token && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const isHttpsPage = typeof window !== 'undefined' && window.location && window.location.protocol === 'https:';
  const isHttpTarget = url.startsWith('http://');

  // Bir isteği çalıştırma yardımcı fonksiyonu
  const executeSingleFetch = async (targetUrl) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(targetUrl, {
        ...options,
        headers,
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      return response;
    } catch (err) {
      clearTimeout(timeoutId);
      throw err;
    }
  };

  let response = null;

  // 1. ADIM: Doğrudan veya HTTPS Proxy ile İstek Yap
  try {
    if (isHttpsPage && isHttpTarget) {
      // Sayfa HTTPS (kaliphane-v2.web.app) ve hedef HTTP ise tarayıcı güvenlik engeli koyar.
      // Önce doğrudan dener; Mixed Content / CORS engeline takılırsa otomatik HTTPS CORS Proxy üzerinden geçer!
      try {
        response = await executeSingleFetch(url);
      } catch (directErr) {
        // Otomatik 1. Proxy Köprüsü (corsproxy.io)
        const proxyUrl = `https://corsproxy.io/?url=${encodeURIComponent(url)}`;
        response = await executeSingleFetch(proxyUrl);
      }
    } else {
      response = await executeSingleFetch(url);
    }
  } catch (err) {
    if (isHttpsPage && isHttpTarget) {
      try {
        // Otomatik 2. Proxy Köprüsü (allorigins)
        const altProxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
        response = await executeSingleFetch(altProxyUrl);
      } catch (altErr) {
        throw new Error(`ETKA Portal Sunucusuna Ulaşılamadı (${url}). Ağ/VPN bağlantınızı kontrol edin.`);
      }
    } else {
      throw err;
    }
  }

  if (!response) {
    throw new Error('Sunucudan yanıt alınamadı.');
  }

  // 401 Unauthorized durumunda Token Refresh Mekanizması
  if (response.status === 401 && !endpoint.includes('login')) {
    if (!isRefreshing) {
      isRefreshing = true;
      try {
        let newToken = '';
        if (getRefreshToken()) {
          try {
            newToken = await refreshAccessToken();
          } catch (rErr) {
            const autoLoginRes = await loginPortal(DEFAULT_CREDENTIALS.usernameOrEmail, DEFAULT_CREDENTIALS.password, true);
            newToken = autoLoginRes?.accessToken || autoLoginRes?.token || '';
          }
        } else {
          const autoLoginRes = await loginPortal(DEFAULT_CREDENTIALS.usernameOrEmail, DEFAULT_CREDENTIALS.password, true);
          newToken = autoLoginRes?.accessToken || autoLoginRes?.token || '';
        }
        isRefreshing = false;
        onRefreshed(newToken);
      } catch (refreshErr) {
        isRefreshing = false;
        refreshSubscribers = [];
        throw refreshErr;
      }
    }

    const retryPromise = new Promise((resolve) => {
      subscribeTokenRefresh((newToken) => {
        headers['Authorization'] = `Bearer ${newToken}`;
        resolve(executeSingleFetch(url));
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
      // ignore
    }

    if (response.status === 401) {
      throw new Error('Yetkisiz Erişim (401): Kullanıcı adı veya şifre geçersiz.');
    }
    if (response.status === 403) {
      throw new Error('Yetki Hatası (403): Kullanıcınıza Portal admin panelinden "OEE" modülü izni verilmelidir.');
    }
    if (response.status === 404) {
      throw new Error(`Uç Nokta Bulunamadı (404): ${cleanEndpoint}`);
    }

    throw new Error(`[HTTP ${response.status}] ${parsedMsg}`);
  }

  return await response.json();
};

// ==========================================
// 1. KİMLİK DOĞRULAMA (AUTH) ENDPOINTS
// ==========================================

export const loginPortal = async (usernameOrEmail, password, rememberMe = true) => {
  const payload = {
    usernameOrEmail: usernameOrEmail.trim(),
    username: usernameOrEmail.trim(),
    email: usernameOrEmail.trim(),
    password,
    rememberMe
  };

  // Farklı backend URL rotalarını sırayla dener (/auth/login, /api/auth/login, /login, /api/login)
  const candidateEndpoints = ['/auth/login', '/api/auth/login', '/login', '/api/login'];
  let result = null;
  let lastError = null;

  for (const ep of candidateEndpoints) {
    try {
      result = await fetchWithAuth(ep, {
        method: 'POST',
        body: JSON.stringify(payload)
      }, 7000);

      if (result && (result.accessToken || result.token || result.data?.accessToken || result.data?.token || result.success)) {
        break;
      }
    } catch (err) {
      lastError = err;
    }
  }

  if (!result && lastError) {
    throw lastError;
  }

  const token = result?.accessToken || result?.token || result?.data?.accessToken || result?.data?.token;
  if (token) {
    setAccessToken(token);
    const refToken = result?.refreshToken || result?.data?.refreshToken;
    if (refToken) {
      setRefreshToken(refToken);
    }
    const usr = result?.user || result?.data?.user;
    if (usr) {
      setStoredUser(usr);
    } else {
      setStoredUser({ username: usernameOrEmail.trim() });
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
  try {
    return await fetchWithAuth('/portal/info', {}, 4000, customBaseUrl);
  } catch (e) {
    return await fetchWithAuth('/api/portal/info', {}, 4000, customBaseUrl);
  }
};

// ==========================================
// 2. OEE ENDPOINTS (ETKA PORTAL BACKEND)
// ==========================================

/**
 * GET /api/oee/health
 */
export const getOeeHealth = async (customBaseUrl = null) => {
  try {
    const res = await fetchWithAuth('/oee/health', {}, 5000, customBaseUrl);
    return res?.data || res;
  } catch (e) {
    const res = await fetchWithAuth('/api/oee/health', {}, 5000, customBaseUrl);
    return res?.data || res;
  }
};

/**
 * GET /api/oee/fleet
 */
export const getOeeFleet = async (customBaseUrl = null) => {
  let res = null;
  try {
    res = await fetchWithAuth('/oee/fleet', {}, 7000, customBaseUrl);
  } catch (e) {
    res = await fetchWithAuth('/api/oee/fleet', {}, 7000, customBaseUrl);
  }

  if (res && Array.isArray(res.data)) {
    return res.data;
  }
  if (Array.isArray(res)) {
    return res;
  }
  return [];
};
