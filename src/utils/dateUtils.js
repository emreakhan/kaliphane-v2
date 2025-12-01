// src/utils/dateUtils.js

// Tarihi YYYY-MM-DD formatına çevirir (Input type="date" için)
export const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleDateString('tr-TR', { year: 'numeric', month: '2-digit', day: '2-digit' }).split('.').reverse().join('-');
};

// Tarih ve Saati okunaklı gösterir (DD.MM.YYYY HH:mm)
export const formatDateTime = (isoString) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleString('tr-TR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
};

// Şu anki zamanı ISO formatında verir
export const getCurrentDateTimeString = () => {
    return new Date().toISOString();
};

// Hedef tarih ile bugün arasındaki gün sayısını verir (Basit Fark)
export const getDaysDifference = (targetDateStr) => {
    if (!targetDateStr) return 0;
    
    const today = new Date();
    const target = new Date(targetDateStr);

    // Saatleri sıfırla
    today.setHours(0, 0, 0, 0);
    target.setHours(0, 0, 0, 0);

    const diffTime = target - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return diffDays; 
};

// İki tarih arasındaki İŞ GÜNÜ sayısını hesaplar (Cumartesi-Pazar hariç)
// (EnhancedMoldList.js sayfasının ihtiyaç duyduğu fonksiyon)
export const calculateWorkDayDifference = (startDateStr, endDateStr) => {
    if (!startDateStr || !endDateStr) return 0;

    const start = new Date(startDateStr);
    const end = new Date(endDateStr);
    
    // Tarihler geçersizse 0 dön
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;

    // Bitiş tarihi başlangıçtan önceyse 0 dön
    if (end < start) return 0;

    let count = 0;
    const curDate = new Date(start);

    while (curDate <= end) {
        const dayOfWeek = curDate.getDay();
        // 0 = Pazar, 6 = Cumartesi (Bunları sayma)
        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
            count++;
        }
        curDate.setDate(curDate.getDate() + 1);
    }
    
    return count;
};

// Kalan iş gününü hesaplayan yardımcı fonksiyon
export const calculateRemainingWorkDays = (dueDate) => {
    if (!dueDate) return 0;
    const todayStr = new Date().toISOString().split('T')[0];
    return calculateWorkDayDifference(todayStr, dueDate);
};