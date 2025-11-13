// src/config/constants.js

// Kullanıcı rolleri (Giriş yapabilen roller)
export const ROLES = {
    ADMIN: 'Yönetici',
    CAM_OPERATOR: 'CAM Operatörü',
    SUPERVISOR: 'Kalıphane Yetkilisi',
};

// Personel Rolleri (Tüm roller)
export const PERSONNEL_ROLES = {
    ADMIN: 'Yönetici',
    CAM_OPERATOR: 'CAM Operatörü',
    SUPERVISOR: 'Kalıphane Yetkilisi',
    MACHINE_OPERATOR: 'Tezgah Operatörü'
};

// YENİ: Operasyon Durumları (Eski Parça Durumları)
export const OPERATION_STATUS = {
    NOT_STARTED: 'BAŞLAMADI',
    IN_PROGRESS: 'ÇALIŞIYOR',
    WAITING_SUPERVISOR_REVIEW: 'YETKİLİ DEĞERLENDİRMESİ BEKLİYOR',
    COMPLETED: 'TAMAMLANDI',
};

// YENİ: Operasyon Tipleri
export const OPERATION_TYPES = {
    CNC: 'CNC',
    AYNA_POLISAJ: 'AYNA POLİSAJ',
    EROZYON_DESEN: 'EROZYON DESEN',
    ASIT_DESEN: 'ASİT DESEN',
    KUM_PARLATMA_600: '600 KUM PARLATMA',
    TAKIM_IZI_POLISAJ: 'TAKIM İZİ POLİSAJ',
};

// Adminin ekleyebileceği operasyon tipleri (CNC hariç)
export const ADDABLE_OPERATION_TYPES = {
    AYNA_POLISAJ: 'AYNA POLİSAJ',
    EROZYON_DESEN: 'EROZYON DESEN',
    ASIT_DESEN: 'ASİT DESEN',
    KUM_PARLATMA_600: '600 KUM PARLATMA',
    TAKIM_IZI_POLISAJ: 'TAKIM İZİ POLİSAJ',
};

// YENİ: Kalıp Ana Durumları (Manuel Admin Kontrolü)
export const MOLD_STATUS = {
    WAITING: 'BEKLEMEDE',
    CNC: 'CNC', // YENİ EKLENDİ
    EREZYON: 'EREZYON',
    POLISAJ: 'POLİSAJ',
    DESEN: 'DESEN',
    MOLD_ASSEMBLY: 'KALIP MONTAJ',
    TRIAL: 'DENEME\'DE',
    REVISION: 'REVİZYON',
    COMPLETED: 'TAMAMLANDI',
};

// "Aktif" sayılan durumların listesi (filtreleme için)
export const MOLD_STATUS_ACTIVE_LIST = [
    MOLD_STATUS.CNC, // YENİ EKLENDİ
    MOLD_STATUS.EREZYON,
    MOLD_STATUS.POLISAJ,
    MOLD_STATUS.DESEN,
    MOLD_STATUS.MOLD_ASSEMBLY,
    MOLD_STATUS.TRIAL,
    MOLD_STATUS.REVISION,
];

// Haritalama fonksiyonu (Sadece seed için)
// GÜNCELLEME: Artık sadece BEKLEMEDE veya TAMAMLANDI olarak ayarlar
export const mapTaskStatusToMoldStatus = (taskStatus) => {
    switch(taskStatus) {
        case OPERATION_STATUS.COMPLETED:
            return MOLD_STATUS.COMPLETED;
        // Diğer tüm durumlar (IN_PROGRESS, NOT_STARTED vs.) BEKLEMEDE başlar
        case OPERATION_STATUS.NOT_STARTED:
        case OPERATION_STATUS.IN_PROGRESS:
        case OPERATION_STATUS.WAITING_SUPERVISOR_REVIEW:
            return MOLD_STATUS.WAITING;
        default:
            return MOLD_STATUS.WAITING;
    }
};