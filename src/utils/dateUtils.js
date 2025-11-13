// src/utils/dateUtils.js

// --- YENİ: SİMÜLASYON VERİSİ İÇİN TARİH OLUŞTURUCU ---
export const getDateDaysAgo = (days) => {
    const date = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    return date.toISOString();
};


// Helper functions for date/time
export const formatDateTime = (isoString) => isoString ?
    new Date(isoString).toLocaleString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '---';

export const formatDate = (isoString) => isoString ? new Date(isoString).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' }) : '---';

export const getCurrentDateTimeString = () => new Date().toISOString();

export const calculateRemainingWorkDays = (deadlineString) => {
    if (!deadlineString) return null;
    try {
        const deadlineDate = new Date(deadlineString);
        const today = new Date();
        deadlineDate.setHours(23, 59, 59, 999);
        today.setHours(0, 0, 0, 0); 

        if (isNaN(deadlineDate.getTime())) {
            return null;
        }

        let workDays = 0;
        if (deadlineDate < today) {
            let currentDate = new Date(deadlineDate);
            currentDate.setDate(currentDate.getDate() + 1); 
            
            while(currentDate <= today) {
                if (currentDate.getDay() !== 0) {
                    workDays++;
                }
                currentDate.setDate(currentDate.getDate() + 1);
            }
            return -workDays;
        } else {
            let currentDate = new Date(today);
            if (currentDate.getTime() === deadlineDate.getTime() && currentDate.getDay() !== 0) {
                 return 0;
            }
            
            currentDate.setDate(currentDate.getDate() + 1);
            while(currentDate <= deadlineDate) {
                if (currentDate.getDay() !== 0) {
                    workDays++;
                }
                currentDate.setDate(currentDate.getDate() + 1);
            }
            return workDays;
        }
        
    } catch (e) {
        console.error("İş günü hesaplama hatası:", e);
        return null;
    }
};

export const calculateWorkDayDifference = (completionDateString, deadlineString) => {
    if (!completionDateString || !deadlineString) return null;
    try {
        const completionDate = new Date(completionDateString);
        const deadlineDate = new Date(deadlineString);
        completionDate.setHours(0, 0, 0, 0);
        deadlineDate.setHours(0, 0, 0, 0); 

        if (isNaN(completionDate.getTime()) || isNaN(deadlineDate.getTime())) {
            return null;
        }

        if (completionDate.getTime() === deadlineDate.getTime()) {
            return 0;
        }

        let workDays = 0;
        if (completionDate < deadlineDate) {
            let currentDate = new Date(completionDate);
            currentDate.setDate(currentDate.getDate() + 1);

            while(currentDate <= deadlineDate) {
                if (currentDate.getDay() !== 0) {
                    workDays++;
                }
                currentDate.setDate(currentDate.getDate() + 1);
            }
            return workDays;
        } else {
            let currentDate = new Date(deadlineDate);
            currentDate.setDate(currentDate.getDate() + 1);
            
            while(currentDate <= completionDate) {
                if (currentDate.getDay() !== 0) {
                    workDays++;
                }
                currentDate.setDate(currentDate.getDate() + 1);
            }
            return -workDays;
        }
        
    } catch (e) {
        console.error("İş günü farkı hesaplama hatası:", e);
        return null;
    }
};