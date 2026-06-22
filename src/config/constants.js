// src/config/constants.js

// --- UYGULAMA VE VERİTABANI KİMLİĞİ ---
const appId = 'default-app-id'; 
export const initialAuthToken = null;

// ============================================================
// 1. VERİTABANI KOLEKSİYONLARI (KUTULAR)
// ============================================================

export const PROJECT_COLLECTION = `artifacts/${appId}/public/data/moldProjects`;
export const CNC_LATHE_JOBS_COLLECTION = `artifacts/${appId}/public/data/cncLatheJobs`;
export const DESIGN_JOBS_COLLECTION = `artifacts/${appId}/public/data/designJobs`;
export const MACHINE_TASKS_COLLECTION = `artifacts/${appId}/public/data/machineTasks`;

export const PERSONNEL_COLLECTION = `artifacts/${appId}/public/data/personnel`;
export const MACHINES_COLLECTION = `artifacts/${appId}/public/data/machines`;
export const MOLD_NOTES_COLLECTION = `artifacts/${appId}/public/data/moldNotes`;

export const INVENTORY_COLLECTION = `artifacts/${appId}/public/data/toolInventory`;
export const TOOL_TRANSACTIONS_COLLECTION = `artifacts/${appId}/public/data/toolTransactions`;
export const TOOL_CATEGORIES_COLLECTION = `artifacts/${appId}/public/data/toolCategories`;

export const MAINTENANCE_MOLDS_COLLECTION = `artifacts/${appId}/public/data/maintenanceMolds`;
export const MAINTENANCE_LOGS_COLLECTION = `artifacts/${appId}/public/data/maintenanceLogs`;

export const CNC_PARTS_COLLECTION = `artifacts/${appId}/public/data/cncParts`; 
export const CNC_MEASUREMENTS_COLLECTION = `artifacts/${appId}/public/data/cncMeasurements`; 
export const ACTIVITY_LOGS_COLLECTION = `artifacts/${appId}/public/data/activityLogs`; 

export const LOGISTICS_COLLECTION = `artifacts/${appId}/public/data/logisticsTasks`;

// ============================================================
// 2. ROLLER VE YETKİLER
// ============================================================

export const ROLES = {
    ADMIN: 'Yönetici',
    CAM_OPERATOR: 'CAM Operatörü',
    CAM_SORUMLUSU: 'CAM Sorumlusu',
    SUPERVISOR: 'Kalıphane Yetkilisi',
    PROJE_SORUMLUSU: 'Proje Sorumlusu',
    KALIP_TASARIM_SORUMLUSU: 'Kalıp Tasarım Sorumlusu',
    KALIP_TASARIM_YONETICISI: 'Kalıp Tasarım Yöneticisi',
    TAKIMHANE_SORUMLUSU: 'Takımhane Sorumlusu',
    MACHINE_OPERATOR: 'Tezgah Operatörü', 
    CNC_TORNA_OPERATORU: 'CNC Torna Operatörü',
    CNC_TORNA_SORUMLUSU: 'CNC Torna Sorumlusu',
    GIRIS_KALITE: 'Giriş Kalite',
    DEPO_SORUMLUSU: 'Depo Sorumlusu',
    FORKLIFT_OPERATORU: 'Forklift Operatörü',
    MONTAJ_ELEMANI: 'Montaj Elemanı',
    MONTAJ_SORUMLUSU: 'Montaj Sorumlusu',
    TERMINAL_USER: 'Tezgah Terminali',
};

export const PERSONNEL_ROLES = ROLES;

// ============================================================
// 3. DURUMLAR (STATUS)
// ============================================================

export const OPERATION_STATUS = {
    NOT_STARTED: 'BAŞLAMADI',
    IN_PROGRESS: 'ÇALIŞIYOR',
    PAUSED: 'DURAKLATILDI',
    WAITING: 'BEKLEMEDE',
    WAITING_SUPERVISOR_REVIEW: 'YETKİLİ DEĞERLENDİRMESİ BEKLİYOR',
    COMPLETED: 'TAMAMLANDI',
    SUPERVISOR_APPROVED: 'ONAYLANDI',
    SUPERVISOR_REJECTED: 'REDDEDİLDİ',
    HAMMADDE_BEKLIYOR: 'HAMMADDE BEKLİYOR',
    DEPODA: 'DEPODA',
    TASIMA_BEKLIYOR: 'TAŞIMA BEKLİYOR (FORKLİFT)',
    BUFFER_BEKLIYOR: 'İSTASYONDA BEKLİYOR',
    AYAR_YAPILIYOR: 'AYAR YAPILIYOR',
    MONTAJ_BUFFER: 'MONTAJ İÇİN BEKLİYOR',
    MONTAJ_EDILIYOR: 'MONTAJ EDİLİYOR'
};

export const MATERIAL_TYPES = {
    CELIK: 'Çelik Blok',
    STANDART_ELEMAN: 'Standart Kalıp Elemanı',
    SICAK_YOLLUK: 'Sıcak Yolluk Sistemi',
    DIGER: 'Diğer'
};

export const DESIGN_JOB_STATUS = {
    POOL: 'HAVUZDA_BEKLIYOR',
    ASSIGNED: 'ATANDI_BEKLIYOR',
    IN_PROGRESS: 'ÇALIŞIYOR',
    PAUSED: 'DURAKLATILDI',
    COMPLETED: 'TAMAMLANDI'
};

export const TASK_STATUS = {
    BEKLIYOR: 'BEKLİYOR',
    CALISIYOR: 'ÇALIŞIYOR',
    DURAKLATILDI: 'DURAKLATILDI',
    ONAY_BEKLIYOR: 'ONAY BEKLİYOR',
    TAMAMLANDI: 'TAMAMLANDI',
};

// İki ayrı listeyi birleştirdik
export const MOLD_STATUS = {
    WAITING: 'BEKLEMEDE',
    TASARIM: 'TASARIM',
    CNC: 'CNC',
    EREZYON: 'EREZYON',
    POLISAJ: 'POLİSAJ',
    DESEN: 'DESEN',
    MOLD_ASSEMBLY: 'KALIP MONTAJ',
    TRIAL: 'DENEME\'DE',
    MONTAJDA: 'MONTAJDA',
    DENEMEDE: 'DENEMEDE',
    COMPLETED: 'TAMAMLANDI',
};

export const MOLD_STATUS_ACTIVE_LIST = [
    MOLD_STATUS.TASARIM,
    MOLD_STATUS.CNC,
    MOLD_STATUS.EREZYON,
    MOLD_STATUS.POLISAJ,
    MOLD_STATUS.DESEN,
    MOLD_STATUS.MOLD_ASSEMBLY,
    MOLD_STATUS.TRIAL,
    MOLD_STATUS.MONTAJDA,
    MOLD_STATUS.DENEMEDE
];

export const MACHINE_STATUS = {
    AVAILABLE: 'MEVCUT',
    FAULT: 'ARIZALI',
    MAINTENANCE: 'BAKIMDA',
    BUSY: 'BUSY',
    WAITING: 'BEKLIYOR'
};

export const MAINTENANCE_STATUS = {
    READY: 'ÜRETİME HAZIR',
    IN_MAINTENANCE: 'BAKIMDA / TAMİRDE',
    SCRAP: 'HURDA'
};

export const LOGISTICS_STATUS = {
    PENDING: 'BEKLİYOR',
    IN_TRANSIT: 'TAŞINIYOR',
    COMPLETED: 'TESLİM EDİLDİ',
    CANCELLED: 'İPTAL EDİLDİ',
};

// ============================================================
// 4. TİPLER VE KONFİGÜRASYONLAR
// ============================================================

export const PROJECT_TYPES = {
    NEW_MOLD: 'YENİ KALIP',
    REVISION: 'REVİZYON KALIBI',
    MACHINING: 'FASON / PROJE İMALAT',
    IMPROVEMENT: 'İYİLEŞTİRME',
    T0_IMPROVEMENT: 'T0-İYİLEŞTİRME'
};

export const PROJECT_TYPE_CONFIG = {
    'YENİ KALIP': { label: 'YENİ KALIP', colorClass: 'bg-blue-100 text-blue-800 border-blue-500', borderClass: 'border-l-8 border-l-blue-600', icon: '🟦' },
    'REVİZYON KALIBI': { label: '🛠️ REVİZYON', colorClass: 'bg-orange-100 text-orange-800 border-orange-500', borderClass: 'border-l-8 border-l-orange-500', icon: 'Rg' },
    'FASON / PROJE İMALAT': { label: '⚙️ PROJE İMALAT', colorClass: 'bg-purple-100 text-purple-800 border-purple-500', borderClass: 'border-l-8 border-l-purple-500', icon: 'Pr' },
    'İYİLEŞTİRME': { label: '✨ İYİLEŞTİRME', colorClass: 'bg-teal-100 text-teal-800 border-teal-500', borderClass: 'border-l-8 border-l-teal-500', icon: 'Iy' },
    'T0-İYİLEŞTİRME': { label: '🚀 T0-İYİLEŞTİRME', colorClass: 'bg-indigo-100 text-indigo-800 border-indigo-500', borderClass: 'border-l-8 border-l-indigo-500', icon: 'T0' }
};

export const OPERATION_TYPES = {
    CNC: 'CNC',
    WIRE_EROSION: 'TEL EREZYON',
    SINKER_EROSION: 'DALMA EREZYON',
    POLISHING: 'POLISAJ',
    GRINDING: 'TAŞLAMA',
    ASSEMBLY: 'MONTAJ',
    QUALITY_CONTROL: 'KALİTE KONTROL',
    HEAT_TREATMENT: 'ISIL İŞLEM',
    COATING: 'KAPLAMA',
    TEXTURE: 'DESEN',
    WELDING: 'KAYNAK',
    MANUAL_LATHING: 'MANUEL TORNA',
    MANUEL_MILLING: 'MANUEL FREZE',
    DRILLING: 'DELİK DELME'
};

export const DESIGN_TASK_TYPES = {
    CONCEPT: 'KALIP TASARIM',
    DETAIL: 'KALIP TASARIM KONTROLÜ',
    REVISION: 'REVİZYON',
    ELECTRODE: 'ELEKTROT TASARIMI',
    DRAWING: 'TEKNİK RESİM',
    ANALYSIS: 'ANALİZ',
    OTHER: 'DİĞER'
};

export const ADDABLE_OPERATION_TYPES = {
    AYNA_POLISAJ: 'AYNA POLİSAJ',
    EROZYON_DESEN: 'EROZYON DESEN',
    ASIT_DESEN: 'ASİT DESEN',
    KUM_PARLATMA_600: '600 KUM PARLATMA',
    TAKIM_IZI_POLISAJ: 'TAKIM İZİ POLİSAJ',
    DERIN_DELIK_DELME: 'DERİN DELİK DELME',
};

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

export const TOOL_TRANSACTION_TYPES = {
    ADD_STOCK: 'STOK GİRİŞİ',
    ISSUE: 'TEZGAHA VERİLDİ',
    RETURN_HEALTHY: 'SAĞLAM İADE',
    RETURN_SCRAP: 'ISKARTA/HURDA',
    RETURN_SCRAP_WEAR: 'DOĞAL AŞINMA (HURDA)',
    RETURN_SCRAP_DAMAGE: 'KIRILMA/HASAR (HURDA)',
    TRANSFER: 'TEZGAH TRANSFERİ',
    ADJUSTMENT: 'SAYIM DÜZELTME',
    STOCK_ENTRY: 'SATIN ALMA / GİRİŞ'
};

export const DESIGN_ACTIVITY_TYPES = {
    DESIGN: 'TASARIM / MODELLEME',
    MOLD_TRIAL: 'KALIP DENEMESİ',
    WORKSHOP: 'ATÖLYE / MONTAJ KONTROL',
    MEETING: 'TOPLANTI',
    OTHER: 'DİĞER / MANUEL GİRİŞ'
};

export const MAINTENANCE_TYPES = {
    FAULT: 'ARIZA MÜDAHALESİ',
    PERIODIC: 'PERİYODİK BAKIM',
    REVISION: 'REVİZYON / DEĞİŞİKLİK'
};

export const CNC_LATHE_MACHINES = ['K41', 'K60', 'K65'];

export const mapTaskStatusToMoldStatus = (taskStatus) => {
    switch(taskStatus) {
        case OPERATION_STATUS.COMPLETED: return MOLD_STATUS.COMPLETED;
        case OPERATION_STATUS.IN_PROGRESS: return MOLD_STATUS.CNC; 
        case OPERATION_STATUS.WAITING_SUPERVISOR_REVIEW: return MOLD_STATUS.MOLD_ASSEMBLY; 
        default: return MOLD_STATUS.WAITING;
    }
}