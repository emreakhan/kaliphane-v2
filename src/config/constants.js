// src/config/constants.js

// --- VERİTABANI KOLEKSİYON ADRESLERİ ---
const appId = 'default-app-id'; 
export const PROJECT_COLLECTION = `artifacts/${appId}/public/data/moldProjects`;
export const PERSONNEL_COLLECTION = `artifacts/${appId}/public/data/personnel`;
export const MACHINES_COLLECTION = `artifacts/${appId}/public/data/machines`;
export const MOLD_NOTES_COLLECTION = `artifacts/${appId}/public/data/moldNotes`;

// TAKIMHANE KOLEKSİYONLARI
export const INVENTORY_COLLECTION = `artifacts/${appId}/public/data/toolInventory`;
export const TOOL_TRANSACTIONS_COLLECTION = `artifacts/${appId}/public/data/toolTransactions`;
export const TOOL_CATEGORIES_COLLECTION = `artifacts/${appId}/public/data/toolCategories`;

// --- YENİ: KALIP BAKIM KOLEKSİYONLARI ---
export const MAINTENANCE_MOLDS_COLLECTION = `artifacts/${appId}/public/data/maintenanceMolds`;
export const MAINTENANCE_LOGS_COLLECTION = `artifacts/${appId}/public/data/maintenanceLogs`;

// --- DİĞER SABİTLER ---
export const initialAuthToken = null;

// --- ROLLER ---
export const ROLES = {
    ADMIN: 'Yönetici',
    CAM_OPERATOR: 'CAM Operatörü',
    SUPERVISOR: 'Kalıphane Yetkilisi',
    PROJE_SORUMLUSU: 'Proje Sorumlusu',
    KALIP_TASARIM_SORUMLUSU: 'Kalıp Tasarım Sorumlusu',
    TAKIMHANE_SORUMLUSU: 'Takımhane Sorumlusu',
};

export const PERSONNEL_ROLES = {
    ADMIN: 'Yönetici',
    CAM_OPERATOR: 'CAM Operatörü',
    SUPERVISOR: 'Kalıphane Yetkilisi',
    MACHINE_OPERATOR: 'Tezgah Operatörü',
    PROJE_SORUMLUSU: 'Proje Sorumlusu',
    KALIP_TASARIM_SORUMLUSU: 'Kalıp Tasarım Sorumlusu',
    TAKIMHANE_SORUMLUSU: 'Takımhane Sorumlusu',
};

export const OPERATION_STATUS = {
    NOT_STARTED: 'BAŞLAMADI',
    IN_PROGRESS: 'ÇALIŞIYOR',
    PAUSED: 'DURAKLATILDI',
    WAITING: 'BEKLEMEDE',
    WAITING_SUPERVISOR_REVIEW: 'YETKİLİ DEĞERLENDİRMESİ BEKLİYOR',
    COMPLETED: 'TAMAMLANDI',
    SUPERVISOR_APPROVED: 'ONAYLANDI',
    SUPERVISOR_REJECTED: 'REDDEDİLDİ'
};

export const TASK_STATUS = {
    BEKLIYOR: 'BEKLİYOR',
    CALISIYOR: 'ÇALIŞIYOR',
    DURAKLATILDI: 'DURAKLATILDI',
    ONAY_BEKLIYOR: 'ONAY BEKLİYOR',
    TAMAMLANDI: 'TAMAMLANDI',
};

// --- OPERASYON TİPLERİ ---
export const OPERATION_TYPES = {
    CNC: 'CNC',
    AYNA_POLISAJ: 'AYNA POLİSAJ',
    EROZYON_DESEN: 'EROZYON DESEN',
    ASIT_DESEN: 'ASİT DESEN',
    KUM_PARLATMA_600: '600 KUM PARLATMA',
    TAKIM_IZI_POLISAJ: 'TAKIM İZİ POLİSAJ',
    DERIN_DELIK_DELME: 'DERİN DELİK DELME',
};

// --- EK OPERASYON LİSTESİ ---
export const ADDABLE_OPERATION_TYPES = {
    AYNA_POLISAJ: 'AYNA POLİSAJ',
    EROZYON_DESEN: 'EROZYON DESEN',
    ASIT_DESEN: 'ASİT DESEN',
    KUM_PARLATMA_600: '600 KUM PARLATMA',
    TAKIM_IZI_POLISAJ: 'TAKIM İZİ POLİSAJ',
    DERIN_DELIK_DELME: 'DERİN DELİK DELME',
};

// --- KALIP DURUMLARI ---
export const MOLD_STATUS = {
    WAITING: 'BEKLEMEDE',
    TASARIM: 'TASARIM',
    CNC: 'CNC',
    EREZYON: 'EREZYON',
    POLISAJ: 'POLİSAJ',
    DESEN: 'DESEN',
    MOLD_ASSEMBLY: 'KALIP MONTAJ',
    TRIAL: 'DENEME\'DE',
    COMPLETED: 'TAMAMLANDI',
};

// --- AKTİF LİSTE ---
export const MOLD_STATUS_ACTIVE_LIST = [
    MOLD_STATUS.CNC,
    MOLD_STATUS.EREZYON,
    MOLD_STATUS.POLISAJ,
    MOLD_STATUS.DESEN,
    MOLD_STATUS.MOLD_ASSEMBLY,
];

export const mapTaskStatusToMoldStatus = (taskStatus) => {
    switch(taskStatus) {
        case OPERATION_STATUS.COMPLETED:
            return MOLD_STATUS.COMPLETED;
        case OPERATION_STATUS.NOT_STARTED:
        case OPERATION_STATUS.IN_PROGRESS:
        case OPERATION_STATUS.PAUSED:
        case OPERATION_STATUS.WAITING_SUPERVISOR_REVIEW:
        case OPERATION_STATUS.WAITING: 
            return MOLD_STATUS.WAITING;
        default:
            return MOLD_STATUS.WAITING;
    }
};

// --- TEZGAH DURUMLARI ---
export const MACHINE_STATUS = {
    AVAILABLE: 'MEVCUT',
    FAULT: 'ARIZALI',
    MAINTENANCE: 'BAKIMDA',
    BUSY: 'BUSY',
    WAITING: 'BEKLIYOR'
};

// --- PROJE TİPLERİ ---
export const PROJECT_TYPES = {
    NEW_MOLD: 'YENİ KALIP',
    REVISION: 'REVİZYON KALIBI',
    MACHINING: 'FASON / PROJE İMALAT',
    IMPROVEMENT: 'İYİLEŞTİRME',
    T0_IMPROVEMENT: 'T0-İYİLEŞTİRME'
};

export const PROJECT_TYPE_CONFIG = {
    'YENİ KALIP': { 
        label: 'YENİ KALIP', 
        colorClass: 'bg-blue-100 text-blue-800 border-blue-500', 
        borderClass: 'border-l-8 border-l-blue-600',
        icon: '🟦'
    },
    'REVİZYON KALIBI': { 
        label: '🛠️ REVİZYON', 
        colorClass: 'bg-orange-100 text-orange-800 border-orange-500', 
        borderClass: 'border-l-8 border-l-orange-500',
        icon: 'Rg'
    },
    'FASON / PROJE İMALAT': { 
        label: '⚙️ PROJE İMALAT', 
        colorClass: 'bg-purple-100 text-purple-800 border-purple-500', 
        borderClass: 'border-l-8 border-l-purple-500',
        icon: 'Pr' 
    },
    'İYİLEŞTİRME': { 
        label: '✨ İYİLEŞTİRME', 
        colorClass: 'bg-teal-100 text-teal-800 border-teal-500', 
        borderClass: 'border-l-8 border-l-teal-500',
        icon: 'Iy' 
    },
    'T0-İYİLEŞTİRME': { 
        label: '🚀 T0-İYİLEŞTİRME', 
        colorClass: 'bg-indigo-100 text-indigo-800 border-indigo-500', 
        borderClass: 'border-l-8 border-l-indigo-500',
        icon: 'T0' 
    }
};

// --- TAKIMHANE KATEGORİLERİ (Varsayılanlar) ---
export const TOOL_CATEGORIES = {
    FREZE: 'FREZE',
    MATKAP: 'MATKAP',
    KILAVUZ: 'KILAVUZ',
    KESICI_UC: 'KESİCİ UÇ (ELMAS)',
    TUTUCU: 'TUTUCU/BAĞLAMA',
    OLCU_ALETI: 'ÖLÇÜ ALETİ',
    SARF: 'SARF MALZEME',
    DIGER: 'DİĞER'
};

// TRANSFER TİPİ
export const TOOL_TRANSACTION_TYPES = {
    ADD_STOCK: 'STOK GİRİŞİ',
    ISSUE: 'TEZGAHA VERİLDİ',
    RETURN_HEALTHY: 'SAĞLAM İADE',
    RETURN_SCRAP: 'ISKARTA/HURDA', // Genel Hurda (Eski kayıtlar için)
    RETURN_SCRAP_WEAR: 'DOĞAL AŞINMA (HURDA)', // Yeni: Ömür Bitti
    RETURN_SCRAP_DAMAGE: 'KIRILMA/HASAR (HURDA)', // Yeni: Operatör Hatası/Kaza
    TRANSFER: 'TEZGAH TRANSFERİ',
    ADJUSTMENT: 'SAYIM DÜZELTME',
    STOCK_ENTRY: 'SATIN ALMA / GİRİŞ'
};

// --- TASARIM OFİSİ AKTİVİTE TAKİBİ ---
export const ACTIVITY_LOGS_COLLECTION = `artifacts/default-app-id/public/data/activityLogs`;

export const DESIGN_ACTIVITY_TYPES = {
    DESIGN: 'TASARIM / MODELLEME',
    MOLD_TRIAL: 'KALIP DENEMESİ',
    WORKSHOP: 'ATÖLYE / MONTAJ KONTROL',
    MEETING: 'TOPLANTI',
    OTHER: 'DİĞER / MANUEL GİRİŞ'
};

// --- YENİ: KALIP BAKIM MODÜLÜ SABİTLERİ ---
export const MAINTENANCE_TYPES = {
    FAULT: 'ARIZA MÜDAHALESİ',
    PERIODIC: 'PERİYODİK BAKIM',
    REVISION: 'REVİZYON / DEĞİŞİKLİK'
};

export const MAINTENANCE_STATUS = {
    READY: 'ÜRETİME HAZIR',
    IN_MAINTENANCE: 'BAKIMDA / TAMİRDE',
    SCRAP: 'HURDA'
};