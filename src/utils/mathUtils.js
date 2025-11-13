// src/utils/mathUtils.js

export const calculateDurationInHours = (start, end) => {
    if (!start || !end) return null;
    try {
        const startDate = new Date(start);
        const endDate = new Date(end);
        if (isNaN(startDate) || isNaN(endDate)) return null;
        const diffTime = Math.abs(endDate - startDate);
        return (diffTime / (1000 * 60 * 60)).toFixed(1);
    } catch (e) {
        console.error("Süre hesaplama hatası:", e);
        return null;
    }
};