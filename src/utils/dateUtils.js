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

// Saat değerini Gün ve Saat formatında gösterir (Örn: 36 -> "1 Gün 12 Saat (36s)", 8 -> "8 Saat", 48 -> "2 Gün (48s)")
export const formatDurationHours = (totalHours) => {
    const hoursNum = parseFloat(totalHours);
    if (isNaN(hoursNum) || hoursNum <= 0) return '0 Saat';
    
    const days = Math.floor(hoursNum / 24);
    const remHours = Number((hoursNum % 24).toFixed(1));

    if (days > 0 && remHours > 0) {
        return `${days} Gün ${remHours} Saat (${hoursNum}s)`;
    } else if (days > 0) {
        return `${days} Gün (${hoursNum}s)`;
    } else {
        return `${remHours} Saat`;
    }
};

// Toplam saati gün ve saat değerlerine böler (Modal formları için)
export const splitHoursToDaysAndHours = (totalHours) => {
    const hoursNum = parseFloat(totalHours);
    if (isNaN(hoursNum) || hoursNum <= 0) {
        return { days: '', hours: '' };
    }
    const days = Math.floor(hoursNum / 24);
    const remHours = Number((hoursNum % 24).toFixed(1));
    return {
        days: days > 0 ? String(days) : '',
        hours: remHours > 0 ? String(remHours) : (days > 0 ? '0' : '')
    };
};

// Gün ve saat değerlerinden toplam saati hesaplar
export const calculateTotalHoursFromDaysAndHours = (days, hours) => {
    const d = parseFloat(days) || 0;
    const h = parseFloat(hours) || 0;
    const total = (d * 24) + h;
    return Number(total.toFixed(2));
};

// Tezgahın tahmini boşa çıkış tarihini okunaklı Türkçe formatta verir (Örn: "28 Eyl Pzt, 14:30")
export const formatFreeAtDate = (dateOrHours) => {
    if (!dateOrHours && dateOrHours !== 0) return 'Boşta / Hemen Müsait';
    let targetDate;
    if (dateOrHours instanceof Date) {
        targetDate = dateOrHours;
    } else if (typeof dateOrHours === 'number') {
        if (dateOrHours <= 0) return 'Boşta / Hemen Müsait';
        targetDate = new Date(Date.now() + dateOrHours * 3600 * 1000);
    } else if (typeof dateOrHours === 'string') {
        const parsed = parseFloat(dateOrHours);
        if (!isNaN(parsed) && String(parsed) === dateOrHours.trim()) {
            if (parsed <= 0) return 'Boşta / Hemen Müsait';
            targetDate = new Date(Date.now() + parsed * 3600 * 1000);
        } else {
            targetDate = new Date(dateOrHours);
        }
    }
    if (!targetDate || isNaN(targetDate.getTime())) return 'Boşta / Hemen Müsait';

    const dayNames = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
    const monthNames = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
    const day = targetDate.getDate();
    const month = monthNames[targetDate.getMonth()];
    const dayName = dayNames[targetDate.getDay()];
    const hours = String(targetDate.getHours()).padStart(2, '0');
    const minutes = String(targetDate.getMinutes()).padStart(2, '0');
    return `${day} ${month} ${dayName}, ${hours}:${minutes}`;
};
