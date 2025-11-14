// src/config/constants.js

// Kullanıcı rolleri
export const ROLES = {
    ADMIN: 'Yönetici',
    CAM_OPERATOR: 'CAM Operatörü',
    SUPERVISOR: 'Kalıphane Yetkilisi',
};

// Personel Rolleri
export const PERSONNEL_ROLES = {
    ADMIN: 'Yönetici',
    CAM_OPERATOR: 'CAM Operatörü',
    SUPERVISOR: 'Kalıphane Yetkilisi',
    MACHINE_OPERATOR: 'Tezgah Operatörü'
};

// Operasyon Durumları (Bireysel)
export const OPERATION_STATUS = {
    NOT_STARTED: 'BAŞLAMADI',
    IN_PROGRESS: 'ÇALIŞIYOR',
    PAUSED: 'DURAKLATILDI',
    WAITING_SUPERVISOR_REVIEW: 'YETKİLİ DEĞERLENDİRMESİ BEKLİYOR',
    COMPLETED: 'TAMAMLANDI',
};

// --- YENİ EKLENDİ ---
// Parçanın Genel Durumu (Hesaplanmış)
export const TASK_STATUS = {
    BEKLIYOR: 'BEKLİYOR',           // Tüm operasyonlar BAŞLAMADI ise
    CALISIYOR: 'ÇALIŞIYOR',       // En az 1 operasyon ÇALIŞIYOR ise
    DURAKLATILDI: 'DURAKLATILDI', // ÇALIŞIYOR yok ama en az 1 operasyon DURAKLATILDI ise
    ONAY_BEKLIYOR: 'ONAY BEKLİYOR', // Diğerleri bitti, en az 1 operasyon ONAY BEKLİYOR ise
    TAMAMLANDI: 'TAMAMLANDI',     // Tüm operasyonlar TAMAMLANDI ise
};
// --- YENİ BİTTİ ---

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
            return MOLD_STATUS.WAITING;
        default:
            return MOLD_STATUS.WAITING;
    }
};