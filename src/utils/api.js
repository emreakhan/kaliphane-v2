// src/utils/api.js

export const callGeminiApi = async (userQuery, systemInstruction = null, jsonSchema = null, maxRetries = 3) => {
    const apiKey = "";
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;

    const payload = {
        contents: [{ parts: [{ text: userQuery }] }],
    };
    if (systemInstruction) {
        payload.systemInstruction = {
            parts: [{ text: systemInstruction }]
        };
    }

    if (jsonSchema) {
        payload.generationConfig = {
            responseMimeType: "application/json",
            responseSchema: jsonSchema,
        };
    }

    let attempt = 0;
    while (attempt < maxRetries) {
        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`API isteği başarısız oldu: ${response.status} ${response.statusText}`);
            }

            const result = await response.json();
            const candidate = result.candidates?.[0];

            if (candidate && candidate.content?.parts?.[0]?.text) {
                return candidate.content.parts[0].text;
            } else {
                throw new Error("API'den beklenen formatta cevap alınamadı.");
            }

        } catch (error) {
            console.error(`Gemini API çağrı hatası (Deneme ${attempt + 1}/${maxRetries}):`, error);
            attempt++;
            if (attempt >= maxRetries) {
                return `Hata: ${error.message}`;
            }
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }
    }
    return "Hata: Maksimum yeniden deneme sayısına ulaşıldı.";
};