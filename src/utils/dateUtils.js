// src/utils/dateUtils.js

// Tarihi YYYY-MM-DD formatına çevirir (Input type="date" için)
export const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleDateString('tr-TR', { year: 'numeric', month: '2-digit', day: '2-digit' }).split('.').reverse().join('-');
};

// YENİ: Tarihi Gün.Ay.Yıl (DD.MM.YYYY) formatında gösterir (Görsel için)
export const formatDateTR = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
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

// Hedef tarih ile bugün arasındaki gün sayısını verir (Takvim Günü)
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

// 6 İş Günü (Pazar Hariç) Kalan Gün Hesaplama (Bugünden İtibaren)
export const calculate6DayWorkRemaining = (targetDateStr) => {
    if (!targetDateStr) return 0;
    
    const today = new Date();
    const target = new Date(targetDateStr);

    // Saatleri sıfırla
    today.setHours(0, 0, 0, 0);
    target.setHours(0, 0, 0, 0);

    // Eğer tarih geçmişse veya bugünse 0 dön
    if (target <= today) return 0;

    let count = 0;
    const curDate = new Date(today);
    
    // Bugünden sonrakı günden saymaya başla
    curDate.setDate(curDate.getDate() + 1);

    while (curDate <= target) {
        const day = curDate.getDay();
        // Sadece Pazar (0) gününü sayma
        if (day !== 0) {
            count++;
        }
        curDate.setDate(curDate.getDate() + 1);
    }
    
    return count;
};

// YENİ: İki Tarih Arasındaki 6 Günlük İş Günü Farkı (Pazar Hariç)
// Tamamlanan işlerin gecikme hesabı için kullanılır
export const calculate6DayDiff = (startDateStr, endDateStr) => {
    if (!startDateStr || !endDateStr) return 0;

    const start = new Date(startDateStr);
    const end = new Date(endDateStr);
    
    start.setHours(0,0,0,0);
    end.setHours(0,0,0,0);

    if (start.getTime() === end.getTime()) return 0;

    // Hangi tarih büyükse ona göre döngü kuralım
    let s = new Date(start < end ? start : end);
    let e = new Date(start < end ? end : start);
    
    let count = 0;
    
    // Başlangıç gününü atla, son günü dahil et mantığı (veya tam tersi).
    // Genelde iş günü farkında aradaki günler sayılır. 
    // Basitlik için: Start'tan End'e kadar gün gün git.
    
    // Start tarihini bir gün ileri alarak saymaya başlıyoruz (fark hesabı olduğu için)
    s.setDate(s.getDate() + 1);

    while (s <= e) {
        if (s.getDay() !== 0) { // Pazar hariç
            count++;
        }
        s.setDate(s.getDate() + 1);
    }

    return count;
};

// Eski fonksiyon (geriye uyumluluk için tutuluyor, kullanılmayabilir)
export const calculateRemainingWorkDays = (dueDate) => {
    if (!dueDate) return 0;
    return calculate6DayWorkRemaining(dueDate);
};