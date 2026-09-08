// src/services/etkaOeeService.js

// ==========================================
// ETKA PORTAL — BASE URL & HOST PRESETS
// ==========================================
export const INTERNAL_BASE_URL = 'http://etkacrm.agdc.com.tr:1106/api';
export const EXTERNAL_BASE_URL = 'http://195.46.142.179:1106/api';
export const DEFAULT_PUBLIC_FEED_KEY = '7ff3263e9bb0d9d051fa23bf7535b9343316ababa5588baa';

export const PRESET_BASE_URLS = [
  {
    id: 'external',
    label: 'Kurum Dışı / İnternet (Genel IP)',
    url: EXTERNAL_BASE_URL,
    badge: '🌍 Dış Ağ / Canlı Akış',
    description: 'Şifresiz doğrudan public-feed akışı ile tüm cihazlardan erişilir.'
  },
  {
    id: 'internal',
    label: 'Kurum İçi / Şirket VPN',
    url: INTERNAL_BASE_URL,
    badge: '🏢 Fabrika / VPN Ağında',
    description: 'Şirket yerel ağında veya kurumsal VPN açıkken kullanılır.'
  }
];

const BASE_URL_KEY = 'etka_portal_base_url';
const ACCESS_TOKEN_KEY = 'etka_portal_access_token';
const REFRESH_TOKEN_KEY = 'etka_portal_refresh_token';
const USER_INFO_KEY = 'etka_portal_user_info';
const ALIASES_STORAGE_KEY = 'etka_oee_machine_aliases';
const PUBLIC_FEED_KEY_STORAGE = 'etka_oee_public_feed_key';

// Base URL Normalizasyonu
export const getBaseUrl = () => {
  const saved = localStorage.getItem(BASE_URL_KEY);
  if (!saved) return EXTERNAL_BASE_URL;
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

export const getPublicFeedKey = () => {
  return localStorage.getItem(PUBLIC_FEED_KEY_STORAGE) || DEFAULT_PUBLIC_FEED_KEY;
};

export const setPublicFeedKey = (key) => {
  if (!key) localStorage.removeItem(PUBLIC_FEED_KEY_STORAGE);
  else localStorage.setItem(PUBLIC_FEED_KEY_STORAGE, key.trim());
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
  { ipOrId: '192.168.2.135', systemMachineCode: 'Gantry', customName: 'Gantry (K45)', group: 'CNC Dik İşleme', location: 'Kalıphane A Blok' },
  { ipOrId: '192.168.2.75', systemMachineCode: 'K18', customName: 'K18', group: 'CNC Dik İşleme', location: 'Kalıphane A Blok' },
  { ipOrId: '192.168.1.170', systemMachineCode: 'HH-170', customName: 'HH-170 (K43)', group: 'CNC Dik İşleme', location: 'Kalıphane A Blok' },
  { ipOrId: '192.168.2.66', systemMachineCode: 'K15', customName: 'K15', group: 'CNC Dik İşleme', location: 'Kalıphane A Blok' },
  { ipOrId: '192.168.1.171', systemMachineCode: 'HH-171', customName: 'HH-171 (K26)', group: 'CNC Dik İşleme', location: 'Kalıphane A Blok' },
  { ipOrId: '192.168.2.36', systemMachineCode: 'K36', customName: 'K36', group: 'CNC Dik İşleme', location: 'Kalıphane A Blok' },
  { ipOrId: '192.168.2.37', systemMachineCode: 'K28', customName: 'K28', group: 'CNC Dik İşleme', location: 'Kalıphane A Blok' },
  { ipOrId: '192.168.1.155', systemMachineCode: 'HH-155', customName: 'HH-155 (K17)', group: 'CNC Dik İşleme', location: 'Kalıphane A Blok' },
  { ipOrId: '192.168.2.68', systemMachineCode: 'K09', customName: 'K09', group: 'CNC Dik İşleme', location: 'Kalıphane A Blok' },
  { ipOrId: '192.168.2.72', systemMachineCode: 'K22', customName: 'K22 — FANUC 0i-M', group: 'CNC Dik İşleme', location: 'Kalıphane A Blok' },
  { ipOrId: '192.168.2.45', systemMachineCode: 'K24', customName: 'K24', group: 'CNC Dik İşleme', location: 'Kalıphane A Blok' },
  { ipOrId: '192.168.2.74', systemMachineCode: 'K33', customName: 'K33', group: 'CNC Torna', location: 'Kalıphane B Blok' },
  { ipOrId: '192.168.1.154', systemMachineCode: 'HH-154', customName: 'HH-154', group: 'Heidenhain', location: 'Kalıphane A Blok' },
  { ipOrId: '192.168.1.167', systemMachineCode: 'HH-167', customName: 'HH-167', group: 'Heidenhain', location: 'Kalıphane A Blok' },
  { ipOrId: '192.168.1.156', systemMachineCode: 'HH-156', customName: 'HH-156', group: 'Heidenhain', location: 'Kalıphane A Blok' },
  { ipOrId: '192.168.1.147', systemMachineCode: 'HH-147', customName: 'HH-147', group: 'Heidenhain', location: 'Kalıphane A Blok' },
  { ipOrId: '192.168.1.99', systemMachineCode: 'HH-99', customName: 'HH-99', group: 'Heidenhain', location: 'Kalıphane A Blok' },
  { ipOrId: '192.168.1.166', systemMachineCode: 'HH-166', customName: 'HH-166', group: 'Heidenhain', location: 'Kalıphane A Blok' },
  { ipOrId: '192.168.1.151', systemMachineCode: 'HH-151', customName: 'HH-151', group: 'Heidenhain', location: 'Kalıphane A Blok' },
  { ipOrId: '192.168.2.76', systemMachineCode: 'K03', customName: 'K03 — MITSUBISHI EDM', group: 'Dalma Erezyon', location: 'Erezyon Bölümü' }
];

export const IT_NGINX_CORS_SNIPPET = `# ETKA OEE Portal - Nginx CORS ve HTTPS Yapılandırması (Port 1106 veya 443)
# Nginx site ayar dosyasında location bloğuna eklenmelidir:

location /api/oee/ {
    # 1. CORS Başlıkları (Web Tarayıcıları için)
    add_header 'Access-Control-Allow-Origin' '*' always;
    add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS' always;
    add_header 'Access-Control-Allow-Headers' 'DNT,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Range,Authorization' always;
    add_header 'Access-Control-Expose-Headers' 'Content-Length,Content-Range' always;

    if ($request_method = 'OPTIONS') {
        add_header 'Access-Control-Allow-Origin' '*';
        add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS';
        add_header 'Access-Control-Allow-Headers' '*';
        add_header 'Access-Control-Max-Age' 1728000;
        add_header 'Content-Type' 'text/plain; charset=utf-8';
        add_header 'Content-Length' 0;
        return 204;
    }

    # 2. Proxy Yönlendirmesi
    proxy_pass http://127.0.0.1:1106/api/oee/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
`;

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
    throw new Error('Refresh token bulunamadı.');
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
    return '';
  }
};

/**
 * HTTPS Mixed Content ve CORS Engellerini Aşan Gelişmiş Fetch Motoru
 */
export const fetchWithAuth = async (endpoint, options = {}, timeoutMs = 9000, customBaseUrl = null) => {
  let rawBaseUrl = customBaseUrl ? customBaseUrl.trim().replace(/\/+$/, '') : getBaseUrl();
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;

  let url = `${rawBaseUrl}${cleanEndpoint}`;
  url = url.replace(/\/api\/api\//g, '/api/');

  const isPublicFeed = endpoint.includes('public-feed');

  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  let token = getAccessToken();
  if (!token && !endpoint.includes('login') && !isPublicFeed) {
    try {
      token = await ensureAuthenticated();
    } catch (e) {
      // ignore
    }
  }

  if (token && !headers['Authorization'] && !isPublicFeed) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const isHttpsPage = typeof window !== 'undefined' && window.location && window.location.protocol === 'https:';
  const isHttpTarget = url.startsWith('http://');

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

  try {
    if (isHttpsPage && isHttpTarget) {
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
        throw new Error(`ETKA Portal Sunucusuna Ulaşılamadı (${url}).`);
      }
    } else {
      throw err;
    }
  }

  if (!response) {
    throw new Error('Sunucudan yanıt alınamadı.');
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
    } catch (e) {}

    if (response.status === 401) {
      throw new Error('Yetkisiz Erişim (401)');
    }
    if (response.status === 403) {
      throw new Error('Yetki Hatası (403)');
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
  const key = getPublicFeedKey();
  if (key) {
    try {
      const feedRes = await fetchWithAuth(`/oee/public-feed?key=${key}`, {}, 6000, customBaseUrl);
      if (feedRes) {
        const count = Array.isArray(feedRes.data) ? feedRes.data.length : Array.isArray(feedRes) ? feedRes.length : (feedRes.count || 0);
        return {
          success: true,
          portalVersion: 'v3.0 (Public Feed)',
          count
        };
      }
    } catch (e) {
      // fallback
    }
  }

  try {
    return await fetchWithAuth('/portal/info', {}, 4000, customBaseUrl);
  } catch (e) {
    return await fetchWithAuth('/api/portal/info', {}, 4000, customBaseUrl);
  }
};

// ==========================================
// 2. OEE ENDPOINTS (ETKA PORTAL BACKEND)
// ==========================================

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
 * GET /api/oee/public-feed?key=... veya /api/oee/fleet
 * Şifre gerekmeden genel API anahtarı ile veya oturum ile tezgahların anlık durum ve telemetrilerini döner.
 */
export const getOeeFleet = async (customBaseUrl = null) => {
  const key = getPublicFeedKey();
  let res = null;

  // 1. ÖNCELİK: Genel API Anahtarı ile Doğrudan Public Feed Akışı (Şifresiz)
  if (key) {
    try {
      res = await fetchWithAuth(`/oee/public-feed?key=${key}`, {}, 8000, customBaseUrl);
      if (res) {
        if (Array.isArray(res.data)) return res.data;
        if (Array.isArray(res)) return res;
        if (res.devices && Array.isArray(res.devices)) return res.devices;
      }
    } catch (pubErr) {
      console.warn("Public feed isteği başarısız, /oee/fleet deneniyor:", pubErr?.message);
    }
  }

  // 2. ALTERNATİF: /oee/fleet
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
  if (res?.devices && Array.isArray(res.devices)) {
    return res.devices;
  }
  return [];
};
