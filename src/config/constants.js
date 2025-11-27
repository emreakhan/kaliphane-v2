// src/config/constants.js

// Kullanıcı rolleri
export const ROLES = {
    ADMIN: 'Yönetici',
    CAM_OPERATOR: 'CAM Operatörü',
    SUPERVISOR: 'Kalıphane Yetkilisi',
    PROJE_SORUMLUSU: 'Proje Sorumlusu',
    KALIP_TASARIM_SORUMLUSU: 'Kalıp Tasarım Sorumlusu',
};

// Personel Rolleri
export const PERSONNEL_ROLES = {
    ADMIN: 'Yönetici',
    CAM_OPERATOR: 'CAM Operatörü',
    SUPERVISOR: 'Kalıphane Yetkilisi',
    MACHINE_OPERATOR: 'Tezgah Operatörü',
    PROJE_SORUMLUSU: 'Proje Sorumlusu',
    KALIP_TASARIM_SORUMLUSU: 'Kalıp Tasarım Sorumlusu',
};

// Operasyon Durumları
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

// Parçanın Genel Durumu
export const TASK_STATUS = {
    BEKLIYOR: 'BEKLİYOR',
    CALISIYOR: 'ÇALIŞIYOR',
    DURAKLATILDI: 'DURAKLATILDI',
    ONAY_BEKLIYOR: 'ONAY BEKLİYOR',
    TAMAMLANDI: 'TAMAMLANDI',
};

// Operasyon Tipleri
export const OPERATION_TYPES = {
    CNC: 'CNC',
    AYNA_POLISAJ: 'AYNA POLİSAJ',
    EROZYON_DESEN: 'EROZYON DESEN',
    ASIT_DESEN: 'ASİT DESEN',
    KUM_PARLATMA_600: '600 KUM PARLATMA',
    TAKIM_IZI_POLISAJ: 'TAKIM İZİ POLİSAJ',
};

// Adminin ekleyebileceği operasyon tipleri
export const ADDABLE_OPERATION_TYPES = {
    AYNA_POLISAJ: 'AYNA POLİSAJ',
    EROZYON_DESEN: 'EROZYON DESEN',
    ASIT_DESEN: 'ASİT DESEN',
    KUM_PARLATMA_600: '600 KUM PARLATMA',
    TAKIM_IZI_POLISAJ: 'TAKIM İZİ POLİSAJ',
};

// Kalıp Ana Durumları
export const MOLD_STATUS = {
    WAITING: 'BEKLEMEDE',
    CNC: 'CNC',
    EREZYON: 'EREZYON',
    POLISAJ: 'POLİSAJ',
    DESEN: 'DESEN',
    MOLD_ASSEMBLY: 'KALIP MONTAJ',
    TRIAL: 'DENEME\'DE',
    REVISION: 'REVİZYON',
    COMPLETED: 'TAMAMLANDI',
};

// "Aktif" sayılan durumların listesi
export const MOLD_STATUS_ACTIVE_LIST = [
    MOLD_STATUS.CNC,
    MOLD_STATUS.EREZYON,
    MOLD_STATUS.POLISAJ,
    MOLD_STATUS.DESEN,
    MOLD_STATUS.MOLD_ASSEMBLY,
    MOLD_STATUS.TRIAL,
    MOLD_STATUS.REVISION,
];

// Haritalama fonksiyonu
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

export const MACHINE_STATUS = {
    AVAILABLE: 'MEVCUT',
    FAULT: 'ARIZALI',
    MAINTENANCE: 'BAKIMDA'
};

// --- YENİ EKLENEN KISIMLAR: PROJE TİPLERİ ---
export const PROJECT_TYPES = {
    NEW_MOLD: 'YENİ KALIP',
    REVISION: 'REVİZYON KALIBI',
    MACHINING: 'FASON / PROJE İMALAT',
    IMPROVEMENT: 'İYİLEŞTİRME',          // <-- YENİ
    T0_IMPROVEMENT: 'T0-İYİLEŞTİRME'     // <-- YENİ
};

// Proje Tipi Tasarım Ayarları
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