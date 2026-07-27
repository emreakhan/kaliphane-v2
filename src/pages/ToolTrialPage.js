// src/pages/ToolTrialPage.js

import React, { useState, useEffect, useMemo } from 'react';
import { 
    Wrench, PlusCircle, ListChecks, TrendingUp, Sliders, 
    Factory, Calculator, Save, Trash2, FileSpreadsheet, 
    Sparkles, Award, Star, Layers, Clock, DollarSign, 
    HelpCircle, Info, X, Zap, Edit2, RotateCcw, Target, CircleDot, Gem, Puzzle
} from 'lucide-react';
import { 
    ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid 
} from 'recharts';
import { collection, addDoc, deleteDoc, doc, onSnapshot, updateDoc } from '../config/firebase.js';
import { TOOL_TRIALS_COLLECTION } from '../config/constants.js';

const SAMPLE_DEMO_DATA = [
    {
        id: 'sample_1',
        title: '4140 Kaba Havuz İşleme (Takma Uçlu Toroid Freze)',
        material: '4140 Isıl İşlemli (32 HRC)',
        machine: 'Mazak VCN-530',
        coolant: 'Emülsiyon (Bor Yağı)',
        operationCategory: 'FREZELEME',
        millingToolType: 'RADIUS',
        constructionType: 'INSERT', // Takma Uçlu
        insertCorners: 4,
        cornerRadius: 1.5,
        brand: 'Iscar',
        model: 'HM90 E90AD-D16-R1.5',
        diameter: 16,
        flutes: 3,
        price: 36, // Uç kutu/adet fiyatı 36€
        currency: '€',
        machineHourlyRate: 35,
        lifeMeasurementMode: 'TIME',
        totalLifeMinutes: 180,
        vc: 180,
        fz: 0.12,
        ap: 2.5,
        ae: 10,
        cycleTime: 45,
        totalPieces: 4,
        wearType: 'Normal Yanak Aşınması',
        raValue: 1.8,
        vibrationRating: 5,
        notes: 'Takma uçlu freze. 4 köşe kullanılıyor, köşe başı maliyet 9€.',
        date: '2026-07-20'
    },
    {
        id: 'sample_2',
        title: 'Form Kalıbı Yüksek Hızlı Yüzey (Yekpare Karbür Küre)',
        material: '1.2344 Isıl İşlemli (52 HRC)',
        machine: 'DMG Mori CMX 600V',
        coolant: 'Hava Üfleme',
        operationCategory: 'FREZELEME',
        millingToolType: 'BALL',
        constructionType: 'SOLID', // Yekpare Karbür
        insertCorners: 1,
        cornerRadius: 0,
        brand: 'Sandvik',
        model: 'R216-12B16 (Yekpare Karbür)',
        diameter: 12,
        flutes: 2,
        price: 75, // Yekpare takım fiyatı 75€
        currency: '€',
        machineHourlyRate: 40,
        lifeMeasurementMode: 'TIME',
        totalLifeMinutes: 240,
        vc: 210,
        fz: 0.08,
        ap: 0.8,
        ae: 2.5,
        cycleTime: 120,
        totalPieces: 2,
        wearType: 'Normal Aşınma',
        raValue: 0.6,
        vibrationRating: 5,
        notes: 'Yekpare karbür küre freze. Ra 0.6 yüzey kalitesi sağlandı.',
        date: '2026-07-22'
    },
    {
        id: 'sample_3',
        title: 'Derin Delik Delme (Yekpare Karbür Matkap)',
        material: '4140 Isıl İşlemli (30 HRC)',
        machine: 'Hardinge GX 1000',
        coolant: 'Yüksek Basınçlı Sıvı',
        operationCategory: 'MATKAP',
        millingToolType: 'FLAT',
        constructionType: 'SOLID',
        insertCorners: 1,
        drillFeedPerRev: 0.18,
        brand: 'Walter',
        model: 'DC170-08-10.000A1-WJ30EJ',
        diameter: 10,
        flutes: 2,
        price: 85, // Yekpare karbür matkap
        currency: '€',
        machineHourlyRate: 45,
        lifeMeasurementMode: 'TIME',
        totalLifeMinutes: 120,
        vc: 110,
        fz: 0.09,
        ap: 80,
        ae: 10,
        cycleTime: 0.5,
        totalPieces: 240,
        wearType: 'Köşe Aşınması',
        raValue: 1.6,
        vibrationRating: 4,
        notes: 'İçten soğutmalı yekpare karbür matkap ile 240 adet delik delindi.',
        date: '2026-07-25'
    }
];

// F/P SKORU & METRİK HESAPLAMA YARDIMCI FONKSİYONU
const computeDetailedMetrics = (data) => {
    const category = data.operationCategory || 'FREZELEME';
    const toolType = data.millingToolType || 'FLAT';
    const constructionType = data.constructionType || 'SOLID';
    const insertCorners = parseInt(data.insertCorners) || 1;
    const cornerRadius = parseFloat(data.cornerRadius) || 0;
    const drillPitch = parseFloat(data.drillPitch) || 0;
    const drillFeedPerRev = parseFloat(data.drillFeedPerRev) || 0;

    const diameter = parseFloat(data.diameter) || 0;
    const flutes = parseFloat(data.flutes) || 0;
    const vc = parseFloat(data.vc) || 0;
    const fz = parseFloat(data.fz) || 0;
    const ap = parseFloat(data.ap) || 0;
    const ae = parseFloat(data.ae) || 0;
    const rawPrice = parseFloat(data.price) || 0;
    const machineHourlyRate = parseFloat(data.machineHourlyRate) || 0; // €/saat
    const mode = data.lifeMeasurementMode || 'TIME';

    // EFEKTİF TAKIM MALIYETİ (Takma uçlu ise uç fiyatı / köşe sayısı, Yekpare ise tam takım fiyatı)
    let effectiveToolPrice = rawPrice;
    if (constructionType === 'INSERT' && insertCorners > 0) {
        effectiveToolPrice = parseFloat((rawPrice / insertCorners).toFixed(2));
    }
    
    let totalLifeMinutes = parseFloat(data.totalLifeMinutes) || 0;
    const totalPieces = parseFloat(data.totalPieces) || 0;
    const cycleTime = parseFloat(data.cycleTime) || 0;

    if (mode === 'PIECES' && totalPieces > 0 && cycleTime > 0) {
        totalLifeMinutes = totalPieces * cycleTime;
    }

    let rpm = 0;
    let vf = 0;
    let mrr = 0;

    if (category === 'MATKAP') {
        // MATKAP (DRILLING)
        if (diameter > 0 && vc > 0) {
            rpm = Math.round((vc * 1000) / (Math.PI * diameter));
        }
        const feedPerRev = drillFeedPerRev > 0 ? drillFeedPerRev : (fz > 0 && flutes > 0 ? fz * flutes : 0.15);
        if (rpm > 0 && feedPerRev > 0) {
            vf = Math.round(feedPerRev * rpm);
        }
        if (diameter > 0 && vf > 0) {
            const crossAreaCm2 = (Math.PI * Math.pow(diameter / 10, 2)) / 4;
            mrr = parseFloat((crossAreaCm2 * (vf / 10)).toFixed(2));
        }
    } else if (category === 'KILAVUZ') {
        // KILAVUZ (TAPPING)
        if (diameter > 0 && vc > 0) {
            rpm = Math.round((vc * 1000) / (Math.PI * diameter));
        }
        const pitch = drillPitch > 0 ? drillPitch : 1.5;
        if (rpm > 0 && pitch > 0) {
            vf = Math.round(pitch * rpm);
        }
        if (diameter > 0 && vf > 0) {
            const threadCrossAreaCm2 = (Math.PI * (diameter / 10) * (pitch / 10)) / 4;
            mrr = parseFloat((threadCrossAreaCm2 * (vf / 10)).toFixed(2));
        }
    } else {
        // FREZELEME (MILLING)
        let effDiameter = diameter;
        if (toolType === 'BALL' && diameter > 0 && ap > 0) {
            if (ap < diameter / 2) {
                effDiameter = 2 * Math.sqrt(ap * (diameter - ap));
            }
        }

        if (effDiameter > 0 && vc > 0) {
            rpm = Math.round((vc * 1000) / (Math.PI * effDiameter));
        }

        if (rpm > 0 && fz > 0 && flutes > 0) {
            vf = Math.round(fz * flutes * rpm);
        }

        if (ap > 0 && ae > 0 && vf > 0) {
            let baseMRR = (ap * ae * vf) / 1000;

            if (toolType === 'RADIUS' && cornerRadius > 0) {
                const radiusFactor = Math.max(0.75, 1 - (0.15 * (cornerRadius / (diameter || 1))));
                baseMRR = baseMRR * radiusFactor;
            } else if (toolType === 'BALL') {
                baseMRR = baseMRR * 0.785;
            }

            mrr = parseFloat(baseMRR.toFixed(2));
        }
    }

    // Kaldırılan Toplam Talaş Hacmi V_toplam (cm³ ve dm³)
    const totalVolumeCm3 = Math.round(mrr * totalLifeMinutes);
    const totalVolumeDm3 = parseFloat((totalVolumeCm3 / 1000).toFixed(2));

    // Tezgah Süre Maliyeti (€) = (Ömür Dk / 60) * Tezgah Saat Ücreti (€/saat)
    const machineCost = parseFloat(((totalLifeMinutes / 60) * machineHourlyRate).toFixed(2));

    // Toplam Operasyon Maliyeti (Efektif Takım/Köşe Maliyeti + Tezgah Maliyeti)
    const totalOpCost = parseFloat((effectiveToolPrice + machineCost).toFixed(2));

    // Birim Talaş Kaldırma Maliyeti (€ / cm³)
    let costPerCm3 = 0;
    if (totalVolumeCm3 > 0) {
        costPerCm3 = parseFloat((totalOpCost / totalVolumeCm3).toFixed(4));
    }

    let costPerDm3 = 0;
    if (totalVolumeDm3 > 0) {
        costPerDm3 = parseFloat((totalOpCost / totalVolumeDm3).toFixed(2));
    }

    let costPerPiece = 0;
    if (effectiveToolPrice > 0 && totalPieces > 0) {
        costPerPiece = parseFloat((effectiveToolPrice / totalPieces).toFixed(2));
    }

    // BÜTÜNLEŞİK F/P SKORU
    const volumeScore = Math.min(400, Math.round((totalVolumeCm3 / 150) * (mrr / 25)));
    let econScore = 0;
    if (costPerCm3 > 0) {
        econScore = Math.min(400, Math.round((0.05 / (costPerCm3 + 0.001)) * 10));
    }

    const vib = parseInt(data.vibrationRating) || 3;
    const ra = parseFloat(data.raValue) || 1.6;
    const qualityScore = Math.min(200, Math.round((vib * 30) + Math.max(0, (3.2 - ra) * 20)));

    const fpScore = Math.min(1000, Math.max(50, volumeScore + econScore + qualityScore));

    return {
        rpm,
        vf,
        mrr,
        effectiveToolPrice,
        totalLifeMinutes,
        totalVolumeCm3,
        totalVolumeDm3,
        machineCost,
        totalOpCost,
        costPerCm3,
        costPerDm3,
        costPerPiece,
        volumeScore,
        econScore,
        qualityScore,
        fpScore
    };
};

const INITIAL_EMPTY_FORM_STATE = {
    title: '',
    material: '',
    machine: '',
    coolant: 'Emülsiyon (Bor Yağı)',
    operationCategory: 'FREZELEME', // 'FREZELEME' | 'MATKAP' | 'KILAVUZ'
    millingToolType: 'FLAT', // 'FLAT' | 'RADIUS' | 'BALL'
    constructionType: 'SOLID', // 'SOLID' (Yekpare Karbür) | 'INSERT' (Takma Uçlu)
    insertCorners: 4, // Takma uçlu ise köşe sayısı
    cornerRadius: '',
    drillPitch: '',
    drillFeedPerRev: '',
    brand: '',
    model: '',
    diameter: '',
    flutes: '',
    price: '',
    currency: '€',
    machineHourlyRate: '',
    lifeMeasurementMode: 'TIME', // 'TIME' | 'PIECES'
    totalLifeMinutes: '',
    vc: '',
    fz: '',
    ap: '',
    ae: '',
    cycleTime: '',
    totalPieces: '',
    wearType: 'Normal Yanak Aşınması',
    raValue: '',
    vibrationRating: 5,
    notes: '',
    date: new Date().toISOString().split('T')[0]
};

const ToolTrialPage = ({ db: firestoreDb, loggedInUser }) => {
    const [activeTab, setActiveTab] = useState('form'); // 'form' | 'list' | 'compare'
    const [trials, setTrials] = useState([]);
    const [selectedTrialIds, setSelectedTrialIds] = useState(new Set());
    const [searchTerm, setSearchTerm] = useState('');
    const [toastMessage, setToastMessage] = useState(null);
    const [showInfoModal, setShowInfoModal] = useState(false);
    const [editingTrialId, setEditingTrialId] = useState(null);

    // Form Girdileri (Boş Başlar)
    const [formData, setFormData] = useState(INITIAL_EMPTY_FORM_STATE);

    const triggerToast = (msg, type = 'success') => {
        setToastMessage({ text: msg, type });
        setTimeout(() => setToastMessage(null), 3500);
    };

    // Firestore & LocalStorage Senkronizasyonu
    useEffect(() => {
        if (!firestoreDb) {
            const saved = localStorage.getItem('cnc_trials_v6');
            if (saved) {
                try {
                    setTrials(JSON.parse(saved));
                } catch (e) {
                    setTrials(SAMPLE_DEMO_DATA);
                }
            } else {
                setTrials(SAMPLE_DEMO_DATA);
                localStorage.setItem('cnc_trials_v6', JSON.stringify(SAMPLE_DEMO_DATA));
            }
            return;
        }

        const colRef = collection(firestoreDb, TOOL_TRIALS_COLLECTION);
        const unsubscribe = onSnapshot(colRef, (snapshot) => {
            if (snapshot.empty) {
                SAMPLE_DEMO_DATA.forEach(async (item) => {
                    await addDoc(colRef, { ...item, createdAt: new Date().toISOString() });
                });
            } else {
                const list = snapshot.docs.map(docSnap => ({
                    id: docSnap.id,
                    ...docSnap.data()
                }));
                list.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
                setTrials(list);
            }
        }, (err) => {
            console.error("Takım denemeleri yükleme hatası:", err);
        });

        return () => unsubscribe();
    }, [firestoreDb]);

    // Anlık Hesaplanan Metrikler
    const calculated = useMemo(() => {
        return computeDetailedMetrics(formData);
    }, [formData]);

    const handleFormSubmit = async (e) => {
        e.preventDefault();
        const metrics = computeDetailedMetrics(formData);

        const newTrial = {
            title: formData.title,
            material: formData.material,
            machine: formData.machine,
            coolant: formData.coolant,
            operationCategory: formData.operationCategory,
            millingToolType: formData.millingToolType,
            constructionType: formData.constructionType,
            insertCorners: parseInt(formData.insertCorners) || 1,
            cornerRadius: parseFloat(formData.cornerRadius) || 0,
            drillPitch: parseFloat(formData.drillPitch) || 0,
            drillFeedPerRev: parseFloat(formData.drillFeedPerRev) || 0,
            brand: formData.brand,
            model: formData.model,
            diameter: parseFloat(formData.diameter) || 0,
            flutes: parseInt(formData.flutes) || 0,
            price: parseFloat(formData.price) || 0,
            effectiveToolPrice: metrics.effectiveToolPrice,
            currency: formData.currency,
            machineHourlyRate: parseFloat(formData.machineHourlyRate) || 0,
            lifeMeasurementMode: formData.lifeMeasurementMode,
            totalLifeMinutes: metrics.totalLifeMinutes,
            vc: parseFloat(formData.vc) || 0,
            fz: parseFloat(formData.fz) || 0,
            ap: parseFloat(formData.ap) || 0,
            ae: parseFloat(formData.ae) || 0,
            rpm: metrics.rpm,
            vf: metrics.vf,
            mrr: metrics.mrr,
            totalVolumeCm3: metrics.totalVolumeCm3,
            totalVolumeDm3: metrics.totalVolumeDm3,
            totalOpCost: metrics.totalOpCost,
            costPerCm3: metrics.costPerCm3,
            costPerDm3: metrics.costPerDm3,
            cycleTime: parseFloat(formData.cycleTime) || 0,
            totalPieces: parseInt(formData.totalPieces) || 0,
            costPerPc: metrics.costPerPiece,
            wearType: formData.wearType,
            raValue: parseFloat(formData.raValue) || 0,
            vibrationRating: parseInt(formData.vibrationRating),
            notes: formData.notes,
            date: formData.date,
            fpScore: metrics.fpScore
        };

        try {
            if (editingTrialId) {
                // DÜZENLEME MODU
                if (firestoreDb) {
                    await updateDoc(doc(firestoreDb, TOOL_TRIALS_COLLECTION, editingTrialId), {
                        ...newTrial,
                        updatedAt: new Date().toISOString()
                    });
                } else {
                    const updated = trials.map(t => t.id === editingTrialId ? { ...t, ...newTrial } : t);
                    setTrials(updated);
                    localStorage.setItem('cnc_trials_v6', JSON.stringify(updated));
                }
                triggerToast("Takım deneme kaydı başarıyla güncellendi!");
                setEditingTrialId(null);
            } else {
                // YENİ EKLEME MODU
                if (firestoreDb) {
                    const colRef = collection(firestoreDb, TOOL_TRIALS_COLLECTION);
                    await addDoc(colRef, { ...newTrial, createdAt: new Date().toISOString() });
                } else {
                    const item = { id: 'trial_' + Date.now(), ...newTrial };
                    const updated = [item, ...trials];
                    setTrials(updated);
                    localStorage.setItem('cnc_trials_v6', JSON.stringify(updated));
                }
                triggerToast("Yeni takım deneme kaydı ve maliyet analizi kaydedildi!");
            }

            setFormData(INITIAL_EMPTY_FORM_STATE);
            setActiveTab('list');
        } catch (error) {
            console.error("Veri kaydetme hatası:", error);
            triggerToast("Hata oluştu, kayıt işlenemedi.", "error");
        }
    };

    const handleEdit = (trial) => {
        setEditingTrialId(trial.id);
        setFormData({
            title: trial.title || '',
            material: trial.material || '',
            machine: trial.machine || '',
            coolant: trial.coolant || 'Emülsiyon (Bor Yağı)',
            operationCategory: trial.operationCategory || 'FREZELEME',
            millingToolType: trial.millingToolType || 'FLAT',
            constructionType: trial.constructionType || 'SOLID',
            insertCorners: trial.insertCorners || 4,
            cornerRadius: trial.cornerRadius ?? '',
            drillPitch: trial.drillPitch ?? '',
            drillFeedPerRev: trial.drillFeedPerRev ?? '',
            brand: trial.brand || '',
            model: trial.model || '',
            diameter: trial.diameter ?? '',
            flutes: trial.flutes ?? '',
            price: trial.price ?? '',
            currency: trial.currency || '€',
            machineHourlyRate: trial.machineHourlyRate ?? '',
            lifeMeasurementMode: trial.lifeMeasurementMode || 'TIME',
            totalLifeMinutes: trial.totalLifeMinutes ?? '',
            vc: trial.vc ?? '',
            fz: trial.fz ?? '',
            ap: trial.ap ?? '',
            ae: trial.ae ?? '',
            cycleTime: trial.cycleTime ?? '',
            totalPieces: trial.totalPieces ?? '',
            wearType: trial.wearType || 'Normal Yanak Aşınması',
            raValue: trial.raValue ?? '',
            vibrationRating: trial.vibrationRating || 5,
            notes: trial.notes || '',
            date: trial.date || new Date().toISOString().split('T')[0]
        });
        setActiveTab('form');
        triggerToast("Kayıt düzenleme moduna alındı.", "info");
    };

    const cancelEdit = () => {
        setEditingTrialId(null);
        setFormData(INITIAL_EMPTY_FORM_STATE);
        triggerToast("Düzenleme iptal edildi.", "info");
    };

    const handleDelete = async (id) => {
        if (!window.confirm("Bu deneme kaydını silmek istediğinize emin misiniz?")) return;
        try {
            if (firestoreDb) {
                await deleteDoc(doc(firestoreDb, TOOL_TRIALS_COLLECTION, id));
            } else {
                const updated = trials.filter(t => t.id !== id);
                setTrials(updated);
                localStorage.setItem('cnc_trials_v6', JSON.stringify(updated));
            }
            setSelectedTrialIds(prev => {
                const next = new Set(prev);
                next.delete(id);
                return next;
            });
            triggerToast("Kayıt silindi.", "info");
        } catch (error) {
            console.error("Silme hatası:", error);
        }
    };

    const toggleSelect = (id) => {
        setSelectedTrialIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const toggleSelectAll = () => {
        if (selectedTrialIds.size === trials.length) {
            setSelectedTrialIds(new Set());
        } else {
            setSelectedTrialIds(new Set(trials.map(t => t.id)));
        }
    };

    const filteredTrials = useMemo(() => {
        if (!searchTerm.trim()) return trials;
        const lower = searchTerm.toLowerCase();
        return trials.filter(t => 
            (t.title || '').toLowerCase().includes(lower) ||
            (t.brand || '').toLowerCase().includes(lower) ||
            (t.model || '').toLowerCase().includes(lower) ||
            (t.material || '').toLowerCase().includes(lower) ||
            (t.operationCategory || '').toLowerCase().includes(lower)
        );
    }, [trials, searchTerm]);

    const comparisonData = useMemo(() => {
        const set = selectedTrialIds.size === 0 ? trials : trials.filter(t => selectedTrialIds.has(t.id));
        return set.map(t => {
            const m = computeDetailedMetrics(t);
            return { ...t, ...m };
        });
    }, [trials, selectedTrialIds]);

    const chartData = useMemo(() => {
        return comparisonData.map(t => ({
            name: `${t.brand} ${t.model}`,
            mrr: t.mrr,
            costPerCm3: t.costPerCm3,
            totalLifeMinutes: t.totalLifeMinutes,
            totalOpCost: t.totalOpCost,
            fpScore: t.fpScore
        }));
    }, [comparisonData]);

    const exportToCSV = () => {
        if (trials.length === 0) return alert("Dışa aktarılacak veri yok.");
        const headers = ["Başlık", "Operasyon", "Takım Gövdesi", "Takım Tipi", "Marka", "Model", "Malzeme", "Çap(mm)", "Efektif Takım Fiyatı(€)", "Tezgah Saat Ücreti(€/st)", "Vc", "fz", "ap", "ae", "RPM", "Vf", "MRR(cm3/dk)", "Toplam Ömür(dk)", "Toplam Talaş(cm3)", "Birim Talaş Maliyeti(€/cm3)", "F/P Skoru", "Tarih"];
        const rows = trials.map(t => {
            const m = computeDetailedMetrics(t);
            return [
                `"${t.title || ''}"`, `"${t.operationCategory || 'FREZELEME'}"`, `"${t.constructionType === 'INSERT' ? 'Takma Uçlu' : 'Yekpare Karbür'}"`, `"${t.millingToolType || 'FLAT'}"`, `"${t.brand || ''}"`, `"${t.model || ''}"`, `"${t.material || ''}"`,
                t.diameter, m.effectiveToolPrice, t.machineHourlyRate || 0, t.vc, t.fz, t.ap, t.ae, m.rpm, m.vf, m.mrr,
                m.totalLifeMinutes, m.totalVolumeCm3, m.costPerCm3, m.fpScore, t.date
            ];
        });
        const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `Takim_Deneme_FP_Analiz_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="p-4 sm:p-6 bg-slate-900 min-h-screen text-slate-100 font-sans">
            
            {/* TOAST BİLDİRİMİ */}
            {toastMessage && (
                <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-2xl border font-bold text-sm flex items-center gap-2 animate-bounce ${
                    toastMessage.type === 'error' ? 'bg-red-900 text-red-100 border-red-700' :
                    toastMessage.type === 'info' ? 'bg-blue-900 text-blue-100 border-blue-700' :
                    'bg-emerald-900 text-emerald-100 border-emerald-700'
                }`}>
                    <Sparkles className="w-4 h-4" />
                    {toastMessage.text}
                </div>
            )}

            {/* F/P PUANLAMA MANTIĞI AÇIKLAMA MODALI */}
            {showInfoModal && (
                <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-slate-800 border border-slate-700 rounded-3xl max-w-2xl w-full p-6 space-y-6 shadow-2xl overflow-y-auto max-h-[90vh]">
                        <div className="flex justify-between items-center border-b border-slate-700 pb-4">
                            <div className="flex items-center gap-3">
                                <div className="bg-blue-600 p-2.5 rounded-xl shadow-lg">
                                    <HelpCircle className="w-6 h-6 text-white" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-white">Yekpare vs Takma Uçlu Takım Maliyet Hesabı</h3>
                                    <p className="text-xs text-slate-400">Yekpare Takım Tam Fiyatı & Takma Uçlu Köşe Başı Maliyet Denklemi</p>
                                </div>
                            </div>
                            <button onClick={() => setShowInfoModal(false)} className="text-slate-400 hover:text-white p-1">
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <div className="space-y-4 text-xs text-slate-300 leading-relaxed">
                            <p className="bg-slate-900/60 p-3.5 rounded-xl border border-slate-700 text-slate-200">
                                💡 <b>Maliyet Farkı Nasıl Hesaplanır?</b><br/>
                                • <b>Yekpare Karbür / HSS Takım:</b> Takımın kendisi tek parça olduğu için tüm takım fiyatı (örn: 75 €) operasyon maliyetine yazılır.<br/>
                                • <b>Takma Uçlu (Taramalı) Takım:</b> Gövde aşınmaz, sadece takma uç çevrilir. Bu yüzden uç fiyatı kullanılabilir köşe sayısına bölünerek <b>Efektif Köşe Maliyeti (örn: 36 € / 4 Köşe = 9 €/köşe)</b> bulunur.
                            </p>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div className="bg-blue-950/40 p-3.5 rounded-2xl border border-blue-500/30">
                                    <div className="flex items-center gap-2 font-bold text-blue-400 mb-1">
                                        <Zap className="w-4 h-4" /> 1. Talaş Verimi (%40)
                                    </div>
                                    <p className="text-[11px] text-slate-400">
                                        Takımın dakikada kaldırdığı talaş hacmi (MRR) ile toplam ömrü boyunca söktüğü toplam talaş (cm³) çarpılır.
                                    </p>
                                </div>

                                <div className="bg-emerald-950/40 p-3.5 rounded-2xl border border-emerald-500/30">
                                    <div className="flex items-center gap-2 font-bold text-emerald-400 mb-1">
                                        <DollarSign className="w-4 h-4" /> 2. Maliyet Etkinliği (%35)
                                    </div>
                                    <p className="text-[11px] text-slate-400">
                                        <b>Tezgah Saat Ücreti (€/saat)</b> dikkate alınır. Hızlı kesen pahalı bir takım tezgah süresinden tasarruf ettirerek kendini amorti eder.
                                    </p>
                                </div>

                                <div className="bg-purple-950/40 p-3.5 rounded-2xl border border-purple-500/30">
                                    <div className="flex items-center gap-2 font-bold text-purple-400 mb-1">
                                        <Star className="w-4 h-4" /> 3. Kalite & Ses (%25)
                                    </div>
                                    <p className="text-[11px] text-slate-400">
                                        Titreşim seviyesi (1-5 Yıldız) ve yüzey pürüzlülüğü (Ra µm) puana doğrudan eklenir.
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-end">
                            <button 
                                onClick={() => setShowInfoModal(false)}
                                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs transition"
                            >
                                Anlaşıldı, Kapat
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ÜST BAŞLIK & SEKME MENÜSÜ */}
            <header className="bg-slate-800/90 border border-slate-700/80 rounded-2xl p-4 mb-6 shadow-xl sticky top-4 z-40 backdrop-blur-md">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div className="flex items-center gap-3">
                        <div className="bg-blue-600 p-3 rounded-xl shadow-lg shadow-blue-500/30">
                            <Wrench className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h1 className="text-xl font-black text-white leading-tight">
                                    CNC Takım Deneme & F/P Analiz Portalı
                                </h1>
                                <button 
                                    onClick={() => setShowInfoModal(true)}
                                    className="p-1 text-blue-400 hover:text-blue-300 transition"
                                    title="Puanlama Mantığını Gör"
                                >
                                    <HelpCircle className="w-5 h-5" />
                                </button>
                            </div>
                            <p className="text-xs text-slate-400">Yekpare Karbür vs Takma Uçlu Köşe Maliyet Analizi & Performans Hesaplayıcı</p>
                        </div>
                    </div>

                    {/* SEKME BUTONLARI */}
                    <div className="flex gap-2 bg-slate-900/80 p-1.5 rounded-xl border border-slate-700/60 w-full md:w-auto overflow-x-auto">
                        <button 
                            onClick={() => {
                                if (editingTrialId) cancelEdit();
                                setActiveTab('form');
                            }}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                                activeTab === 'form' 
                                ? 'bg-blue-600 text-white shadow-md' 
                                : 'text-slate-400 hover:text-white hover:bg-slate-800'
                            }`}
                        >
                            {editingTrialId ? <Edit2 className="w-4 h-4 text-amber-400" /> : <PlusCircle className="w-4 h-4" />}
                            {editingTrialId ? 'Kayıt Düzenle' : 'Yeni Deneme'}
                        </button>

                        <button 
                            onClick={() => setActiveTab('list')}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                                activeTab === 'list' 
                                ? 'bg-blue-600 text-white shadow-md' 
                                : 'text-slate-400 hover:text-white hover:bg-slate-800'
                            }`}
                        >
                            <ListChecks className="w-4 h-4" /> Kayıtlar 
                            <span className="bg-slate-700 text-slate-200 text-[10px] px-2 py-0.5 rounded-full">{trials.length}</span>
                        </button>

                        <button 
                            onClick={() => setActiveTab('compare')}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                                activeTab === 'compare' 
                                ? 'bg-blue-600 text-white shadow-md' 
                                : 'text-slate-400 hover:text-white hover:bg-slate-800'
                            }`}
                        >
                            <TrendingUp className="w-4 h-4" /> Kıyaslama & Grafik
                        </button>
                    </div>
                </div>
            </header>

            {/* SEKME 1: YENİ DENEME / DÜZENLEME FORMU */}
            {activeTab === 'form' && (
                <div className="space-y-6">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-800/80 p-5 rounded-2xl border border-slate-700/80 shadow-md">
                        <div>
                            <h2 className="text-lg font-bold text-white flex items-center gap-2">
                                {editingTrialId ? (
                                    <>
                                        <Edit2 className="w-5 h-5 text-amber-400" /> Takım Deneme Kaydını Düzenle
                                    </>
                                ) : (
                                    <>
                                        <PlusCircle className="w-5 h-5 text-blue-400" /> Yeni Takım Deneme & Maliyet Kaydı
                                    </>
                                )}
                            </h2>
                            <p className="text-slate-400 text-xs mt-1">
                                Yekpare karbür veya takma uçlu gövde yapısını seçin; köşe başı maliyet ve operasyon süresi otomatik hesaplansın.
                            </p>
                        </div>
                        <div className="flex gap-2">
                            <button 
                                type="button"
                                onClick={() => setShowInfoModal(true)}
                                className="px-3.5 py-2 bg-blue-900/40 hover:bg-blue-900/60 text-blue-300 text-xs font-bold rounded-lg border border-blue-500/30 transition flex items-center gap-1.5"
                            >
                                <Info className="w-4 h-4 text-blue-400" /> Maliyet Mantığı
                            </button>
                            {editingTrialId && (
                                <button 
                                    type="button" 
                                    onClick={cancelEdit}
                                    className="px-3.5 py-2 bg-rose-900/40 hover:bg-rose-900/60 text-rose-300 text-xs font-bold rounded-lg border border-rose-500/30 transition flex items-center gap-1.5"
                                >
                                    <RotateCcw className="w-4 h-4" /> Düzenlemeyi İptal Et
                                </button>
                            )}
                        </div>
                    </div>

                    <form onSubmit={handleFormSubmit} className="space-y-6">
                        
                        {/* OPERASYON TİPİ VE GEOMETRİ SEÇİM BANNERİ */}
                        <div className="bg-slate-800/80 p-5 rounded-2xl border border-slate-700/80 space-y-4 shadow-md">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                
                                {/* Operasyon Türü Seçimi */}
                                <div>
                                    <label className="block text-xs font-bold text-blue-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                                        <Target className="w-4 h-4" /> Operasyon Türü
                                    </label>
                                    <div className="grid grid-cols-3 gap-2">
                                        <button 
                                            type="button"
                                            onClick={() => setFormData({...formData, operationCategory: 'FREZELEME'})}
                                            className={`py-2.5 px-3 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-2 ${
                                                formData.operationCategory === 'FREZELEME' 
                                                ? 'bg-blue-600 border-blue-400 text-white shadow-lg shadow-blue-600/30' 
                                                : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white'
                                            }`}
                                        >
                                            🌀 Frezeleme
                                        </button>

                                        <button 
                                            type="button"
                                            onClick={() => setFormData({...formData, operationCategory: 'MATKAP'})}
                                            className={`py-2.5 px-3 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-2 ${
                                                formData.operationCategory === 'MATKAP' 
                                                ? 'bg-blue-600 border-blue-400 text-white shadow-lg shadow-blue-600/30' 
                                                : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white'
                                            }`}
                                        >
                                            🔩 Matkap (Delme)
                                        </button>

                                        <button 
                                            type="button"
                                            onClick={() => setFormData({...formData, operationCategory: 'KILAVUZ'})}
                                            className={`py-2.5 px-3 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-2 ${
                                                formData.operationCategory === 'KILAVUZ' 
                                                ? 'bg-blue-600 border-blue-400 text-white shadow-lg shadow-blue-600/30' 
                                                : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white'
                                            }`}
                                        >
                                            🧵 Kılavuz (Diş)
                                        </button>
                                    </div>
                                </div>

                                {/* Freze Uç Geometrisi Seçimi */}
                                {formData.operationCategory === 'FREZELEME' ? (
                                    <div>
                                        <label className="block text-xs font-bold text-emerald-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                                            <CircleDot className="w-4 h-4" /> Freze Uç Geometrisi
                                        </label>
                                        <div className="grid grid-cols-3 gap-2">
                                            <button 
                                                type="button"
                                                onClick={() => setFormData({...formData, millingToolType: 'FLAT'})}
                                                className={`py-2.5 px-2 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                                                    formData.millingToolType === 'FLAT' 
                                                    ? 'bg-emerald-600 border-emerald-400 text-white shadow-lg shadow-emerald-600/30' 
                                                    : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white'
                                                }`}
                                            >
                                                🟩 Düz Parmak
                                            </button>

                                            <button 
                                                type="button"
                                                onClick={() => setFormData({...formData, millingToolType: 'RADIUS'})}
                                                className={`py-2.5 px-2 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                                                    formData.millingToolType === 'RADIUS' 
                                                    ? 'bg-emerald-600 border-emerald-400 text-white shadow-lg shadow-emerald-600/30' 
                                                    : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white'
                                                }`}
                                            >
                                                🟨 Köşe Radyüslü
                                            </button>

                                            <button 
                                                type="button"
                                                onClick={() => setFormData({...formData, millingToolType: 'BALL'})}
                                                className={`py-2.5 px-2 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                                                    formData.millingToolType === 'BALL' 
                                                    ? 'bg-emerald-600 border-emerald-400 text-white shadow-lg shadow-emerald-600/30' 
                                                    : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white'
                                                }`}
                                            >
                                                🔵 Küre Uçlu
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="bg-slate-900/60 p-3.5 rounded-xl border border-slate-700 text-xs text-slate-400 flex items-center">
                                        ℹ️ {formData.operationCategory === 'MATKAP' ? 'Matkap operasyonu için tur başı ilerleme (fn) veya diş başı ilerleme (fz) kullanılır.' : 'Kılavuz operasyonu için Diş Adımı (P) otomatik ilerleme hızını belirler.'}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* 3 KOLONLU GİRDİ GRUBU */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            
                            {/* 1. Operasyon & Tezgah Maliyet Girdileri */}
                            <div className="bg-slate-800/50 p-5 rounded-2xl border border-slate-700/60 space-y-4 shadow-md">
                                <h3 className="text-xs font-bold uppercase tracking-wider text-blue-400 border-b border-slate-700/80 pb-2 flex items-center gap-2">
                                    <Factory className="w-4 h-4" /> Operasyon & Tezgah Şartları
                                </h3>
                                <div>
                                    <label className="block text-xs font-bold text-slate-300 mb-1">Deneme Başlığı / Kod</label>
                                    <input 
                                        type="text" 
                                        required 
                                        placeholder="Örn: 4140 Kaba Havuz Boşaltma Denemesi" 
                                        value={formData.title} 
                                        onChange={(e) => setFormData({...formData, title: e.target.value})}
                                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 transition"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-300 mb-1">İşlenen Malzeme & Sertlik</label>
                                    <input 
                                        type="text" 
                                        required 
                                        placeholder="Örn: AISI 4140 (30 HRC)" 
                                        value={formData.material} 
                                        onChange={(e) => setFormData({...formData, material: e.target.value})}
                                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 transition"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-300 mb-1">Tezgah / Model</label>
                                        <input 
                                            type="text" 
                                            placeholder="Örn: Mazak VCN-530" 
                                            value={formData.machine} 
                                            onChange={(e) => setFormData({...formData, machine: e.target.value})}
                                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 transition"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-amber-400 mb-1">Tezgah Saat Ücreti (€/saat)</label>
                                        <input 
                                            type="number" 
                                            step="1" 
                                            required 
                                            placeholder="Örn: 35" 
                                            value={formData.machineHourlyRate} 
                                            onChange={(e) => setFormData({...formData, machineHourlyRate: e.target.value})}
                                            className="w-full bg-slate-900 border border-amber-500/50 rounded-lg px-3 py-2 text-xs text-amber-300 font-bold focus:outline-none focus:border-amber-400 transition"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-300 mb-1">Soğutma Tipi</label>
                                    <select 
                                        value={formData.coolant} 
                                        onChange={(e) => setFormData({...formData, coolant: e.target.value})}
                                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 transition"
                                    >
                                        <option value="Emülsiyon (Bor Yağı)">Emülsiyon (Bor Yağı)</option>
                                        <option value="Yüksek Basınçlı Sıvı">Yüksek Basınçlı Sıvı</option>
                                        <option value="Hava Üfleme">Hava Üfleme</option>
                                        <option value="MQL (Minimum Yağlama)">MQL (Minimum Yağlama)</option>
                                        <option value="Kuru Kesim">Kuru Kesim</option>
                                    </select>
                                </div>
                            </div>

                            {/* 2. Takım Bilgileri, Gövde Tipi & Maliyet */}
                            <div className="bg-slate-800/50 p-5 rounded-2xl border border-slate-700/60 space-y-4 shadow-md">
                                <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400 border-b border-slate-700/80 pb-2 flex items-center justify-between">
                                    <span className="flex items-center gap-2"><Wrench className="w-4 h-4" /> Takım Yapısı & Fiyat</span>
                                </h3>

                                {/* YEKPARE VS TAKMA UÇLU GÖVDE SEÇİMİ */}
                                <div>
                                    <label className="block text-xs font-bold text-slate-300 mb-1.5">Takım Gövde Tipi</label>
                                    <div className="grid grid-cols-2 gap-2">
                                        <button 
                                            type="button"
                                            onClick={() => setFormData({...formData, constructionType: 'SOLID'})}
                                            className={`py-2 px-3 rounded-lg border text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                                                formData.constructionType === 'SOLID' 
                                                ? 'bg-purple-600 border-purple-400 text-white shadow-md' 
                                                : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white'
                                            }`}
                                        >
                                            <Gem className="w-3.5 h-3.5 text-purple-300" /> Yekpare Karbür / HSS
                                        </button>

                                        <button 
                                            type="button"
                                            onClick={() => setFormData({...formData, constructionType: 'INSERT'})}
                                            className={`py-2 px-3 rounded-lg border text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                                                formData.constructionType === 'INSERT' 
                                                ? 'bg-purple-600 border-purple-400 text-white shadow-md' 
                                                : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white'
                                            }`}
                                        >
                                            <Puzzle className="w-3.5 h-3.5 text-amber-300" /> Takma Uçlu / Taramalı
                                        </button>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-300 mb-1">Takım Markası</label>
                                        <input 
                                            type="text" 
                                            required 
                                            placeholder="Örn: Iscar, Sandvik" 
                                            value={formData.brand} 
                                            onChange={(e) => setFormData({...formData, brand: e.target.value})}
                                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 transition"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-300 mb-1">Takım / Uç Kodu</label>
                                        <input 
                                            type="text" 
                                            required 
                                            placeholder="Örn: HM90 E90AD-D16" 
                                            value={formData.model} 
                                            onChange={(e) => setFormData({...formData, model: e.target.value})}
                                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 transition"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-300 mb-1">Takım Çapı D (mm)</label>
                                        <input 
                                            type="number" 
                                            step="0.1" 
                                            required 
                                            placeholder="Örn: 16"
                                            value={formData.diameter} 
                                            onChange={(e) => setFormData({...formData, diameter: e.target.value})}
                                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 transition font-bold text-blue-400"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-300 mb-1">
                                            Ağız Sayısı Z {formData.constructionType === 'INSERT' ? '(Gövdedeki Takılı Uç Adedi)' : ''}
                                        </label>
                                        <input 
                                            type="number" 
                                            required 
                                            placeholder="Örn: 3"
                                            value={formData.flutes} 
                                            onChange={(e) => setFormData({...formData, flutes: e.target.value})}
                                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 transition font-bold text-blue-400"
                                        />
                                    </div>
                                </div>

                                {/* YEKPARE İSE TEK FİYAT, TAKMA UÇLU İSE UÇ FİYATI + TEK UCUN KÖŞE SAYISI */}
                                {formData.constructionType === 'INSERT' ? (
                                    <div className="space-y-2.5 bg-slate-900/80 p-3.5 rounded-xl border border-amber-500/40 shadow-inner">
                                        <div className="text-[11px] font-bold text-amber-400 border-b border-slate-800 pb-1.5 flex items-center justify-between">
                                            <span>🧩 Takma Uç & Köşe Değişim Hesabı:</span>
                                            <span className="text-[10px] text-slate-400 font-normal">({formData.flutes || 1} Ağızlı Gövde)</span>
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="block text-[11px] font-bold text-slate-300 mb-1">1 Adet Uç Fiyatı (€)</label>
                                                <input 
                                                    type="number" 
                                                    step="0.01" 
                                                    required 
                                                    placeholder="Örn: 10"
                                                    value={formData.price} 
                                                    onChange={(e) => setFormData({...formData, price: e.target.value})}
                                                    className="w-full bg-slate-950 border border-amber-500/50 rounded-lg px-2.5 py-1.5 text-xs text-amber-300 font-bold focus:outline-none focus:border-amber-400"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-[11px] font-bold text-slate-300 mb-1">Tek Uçtaki Köşe Sayısı</label>
                                                <input 
                                                    type="number" 
                                                    required 
                                                    placeholder="Örn: 4 (APMT=4, WNMG=4)"
                                                    value={formData.insertCorners} 
                                                    onChange={(e) => setFormData({...formData, insertCorners: e.target.value})}
                                                    className="w-full bg-slate-950 border border-amber-500/50 rounded-lg px-2.5 py-1.5 text-xs text-amber-300 font-bold focus:outline-none focus:border-amber-400"
                                                />
                                            </div>
                                        </div>
                                        <div className="bg-slate-950/80 p-2 rounded-lg border border-slate-800 text-[11px] text-slate-300 space-y-1">
                                            <div className="flex justify-between text-slate-400">
                                                <span>• Tek 1 ucun 1 köşe maliyeti:</span>
                                                <span className="font-bold text-slate-200">{formData.price && formData.insertCorners ? (parseFloat(formData.price) / parseFloat(formData.insertCorners)).toFixed(2) : 0} €</span>
                                            </div>
                                            <div className="flex justify-between text-emerald-400 font-bold pt-1 border-t border-slate-800/80">
                                                <span>👉 Tüm Gövde ({formData.flutes || 1} Uç) Köşe Yenileme Maliyeti:</span>
                                                <span className="text-xs">{calculated.effectiveToolPrice} € / Set</span>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-xs font-bold text-emerald-400 mb-1">Yekpare Takım Fiyatı (€)</label>
                                            <input 
                                                type="number" 
                                                step="0.01" 
                                                required 
                                                placeholder="Örn: 75"
                                                value={formData.price} 
                                                onChange={(e) => setFormData({...formData, price: e.target.value})}
                                                className="w-full bg-slate-900 border border-emerald-500/50 rounded-lg px-3 py-2 text-xs text-emerald-300 font-bold focus:outline-none focus:border-emerald-400 transition"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-300 mb-1">Para Birimi</label>
                                            <select 
                                                value={formData.currency} 
                                                onChange={(e) => setFormData({...formData, currency: e.target.value})}
                                                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 transition font-bold"
                                            >
                                                <option value="€">EUR (€)</option>
                                                <option value="₺">TL (₺)</option>
                                                <option value="$">USD ($)</option>
                                            </select>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* 3. Kesme Şartları (Girdi) */}
                            <div className="bg-slate-800/50 p-5 rounded-2xl border border-slate-700/60 space-y-4 shadow-md">
                                <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400 border-b border-slate-700/80 pb-2 flex items-center gap-2">
                                    <Sliders className="w-4 h-4" /> Kesme Şartları & Özel Geometri
                                </h3>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-300 mb-1">Kesme Hızı Vc (m/dk)</label>
                                        <input 
                                            type="number" 
                                            step="1" 
                                            required 
                                            placeholder="Örn: 180"
                                            value={formData.vc} 
                                            onChange={(e) => setFormData({...formData, vc: e.target.value})}
                                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 transition font-bold"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-300 mb-1">
                                            {formData.operationCategory === 'MATKAP' ? 'Tur Başı İlerleme fn (mm/dev)' : 'Diş Başı İlerleme fz (mm)'}
                                        </label>
                                        <input 
                                            type="number" 
                                            step="0.001" 
                                            required 
                                            placeholder={formData.operationCategory === 'MATKAP' ? 'Örn: 0.15' : 'Örn: 0.12'}
                                            value={formData.operationCategory === 'MATKAP' && formData.drillFeedPerRev ? formData.drillFeedPerRev : formData.fz} 
                                            onChange={(e) => {
                                                if (formData.operationCategory === 'MATKAP') {
                                                    setFormData({...formData, drillFeedPerRev: e.target.value, fz: e.target.value});
                                                } else {
                                                    setFormData({...formData, fz: e.target.value});
                                                }
                                            }}
                                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 transition font-bold"
                                        />
                                    </div>
                                </div>

                                {formData.operationCategory === 'FREZELEME' && (
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-xs font-bold text-slate-300 mb-1">Eksenel Derinlik ap (mm)</label>
                                            <input 
                                                type="number" 
                                                step="0.01" 
                                                required 
                                                placeholder="Örn: 2.5"
                                                value={formData.ap} 
                                                onChange={(e) => setFormData({...formData, ap: e.target.value})}
                                                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 transition font-bold"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-300 mb-1">Radyal Genişlik ae (mm)</label>
                                            <input 
                                                type="number" 
                                                step="0.01" 
                                                required 
                                                placeholder="Örn: 10"
                                                value={formData.ae} 
                                                onChange={(e) => setFormData({...formData, ae: e.target.value})}
                                                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 transition font-bold"
                                            />
                                        </div>
                                    </div>
                                )}

                                {/* KÖŞE RADYÜSÜ / KILAVUZ ADIMI İLE İLGİLİ ÖZEL GİRDİ */}
                                {formData.operationCategory === 'FREZELEME' && formData.millingToolType === 'RADIUS' && (
                                    <div>
                                        <label className="block text-xs font-bold text-amber-300 mb-1">Köşe Radyüsü R (mm)</label>
                                        <input 
                                            type="number" 
                                            step="0.1" 
                                            placeholder="Örn: 1.5"
                                            value={formData.cornerRadius} 
                                            onChange={(e) => setFormData({...formData, cornerRadius: e.target.value})}
                                            className="w-full bg-slate-900 border border-amber-500/50 rounded-lg px-3 py-2 text-xs text-amber-300 font-bold focus:outline-none focus:border-amber-400 transition"
                                        />
                                    </div>
                                )}

                                {formData.operationCategory === 'KILAVUZ' && (
                                    <div>
                                        <label className="block text-xs font-bold text-amber-300 mb-1">Diş Adımı Pitch P (mm)</label>
                                        <input 
                                            type="number" 
                                            step="0.1" 
                                            placeholder="Örn: 1.5 (M10 için)"
                                            value={formData.drillPitch} 
                                            onChange={(e) => setFormData({...formData, drillPitch: e.target.value})}
                                            className="w-full bg-slate-900 border border-amber-500/50 rounded-lg px-3 py-2 text-xs text-amber-300 font-bold focus:outline-none focus:border-amber-400 transition"
                                        />
                                    </div>
                                )}

                                <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-700/80 flex justify-between items-center text-xs">
                                    <span className="text-slate-400">Deneme Tarihi:</span>
                                    <input 
                                        type="date" 
                                        value={formData.date} 
                                        onChange={(e) => setFormData({...formData, date: e.target.value})}
                                        className="bg-transparent text-slate-200 focus:outline-none font-bold text-xs"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* CANLI HESAPLANAN TEKNİK & MALİYET METRİKLERİ BANNERİ */}
                        <div className="bg-gradient-to-r from-blue-950/80 via-indigo-950/80 to-slate-900/90 p-5 rounded-2xl border border-blue-500/40 grid grid-cols-2 sm:grid-cols-5 gap-4 shadow-xl">
                            <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-700/60">
                                <p className="text-[11px] text-slate-400 font-medium">Devir ($n$)</p>
                                <p className="text-lg font-black text-blue-400 mt-1">{calculated.rpm.toLocaleString('tr-TR')} <span className="text-[10px] font-normal text-slate-400">dev/dk</span></p>
                            </div>
                            <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-700/60">
                                <p className="text-[11px] text-slate-400 font-medium">İlerleme ($V_f$)</p>
                                <p className="text-lg font-black text-emerald-400 mt-1">{calculated.vf.toLocaleString('tr-TR')} <span className="text-[10px] font-normal text-slate-400">mm/dk</span></p>
                            </div>
                            <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-700/60">
                                <p className="text-[11px] text-slate-400 font-medium">Talaş Hızı ($MRR$)</p>
                                <p className="text-lg font-black text-amber-400 mt-1">{calculated.mrr.toLocaleString('tr-TR')} <span className="text-[10px] font-normal text-slate-400">cm³/dk</span></p>
                            </div>
                            <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-700/60">
                                <p className="text-[11px] text-slate-400 font-medium">Toplam Sökülen Talaş</p>
                                <p className="text-lg font-black text-indigo-300 mt-1">{calculated.totalVolumeCm3.toLocaleString('tr-TR')} <span className="text-[10px] font-normal text-slate-400">cm³</span></p>
                            </div>
                            <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-700/60">
                                <p className="text-[11px] text-slate-400 font-medium">Efektif Köşe / Takım Maliyeti</p>
                                <p className="text-lg font-black text-purple-400 mt-1">{calculated.effectiveToolPrice} <span className="text-[10px] font-normal text-slate-400">€/köşe</span></p>
                            </div>
                        </div>

                        {/* DENEME SONUÇLARI, ÖMÜR & SÜRE ANALİZİ */}
                        <div className="bg-slate-800/50 p-5 rounded-2xl border border-slate-700/60 space-y-4 shadow-md">
                            <div className="flex flex-col sm:flex-row justify-between sm:items-center border-b border-slate-700/80 pb-2 gap-2">
                                <h3 className="text-xs font-bold uppercase tracking-wider text-purple-400 flex items-center gap-2">
                                    <Clock className="w-4 h-4" /> Takım Ömrü, Süre & Dayanım Performansı
                                </h3>
                                
                                {/* ÖMÜR ÖLÇÜM MODU SEÇİMİ */}
                                <div className="flex items-center gap-2 bg-slate-900/80 p-1 rounded-lg border border-slate-700">
                                    <button 
                                        type="button"
                                        onClick={() => setFormData({...formData, lifeMeasurementMode: 'TIME'})}
                                        className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition ${
                                            formData.lifeMeasurementMode === 'TIME' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                                        }`}
                                    >
                                        Dakika / Saat Bazlı (Kalıp)
                                    </button>
                                    <button 
                                        type="button"
                                        onClick={() => setFormData({...formData, lifeMeasurementMode: 'PIECES'})}
                                        className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition ${
                                            formData.lifeMeasurementMode === 'PIECES' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                                        }`}
                                    >
                                        Adet Bazlı (Seri Parça)
                                    </button>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                {formData.lifeMeasurementMode === 'TIME' ? (
                                    <div className="bg-blue-950/30 p-3 rounded-xl border border-blue-500/30">
                                        <label className="block text-xs font-bold text-blue-300 mb-1">Toplam Takım Ömrü Süresi (Dakika)</label>
                                        <input 
                                            type="number" 
                                            required 
                                            placeholder="Örn: 180"
                                            value={formData.totalLifeMinutes} 
                                            onChange={(e) => setFormData({...formData, totalLifeMinutes: e.target.value})}
                                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 transition font-bold text-blue-400"
                                        />
                                        <span className="text-[10px] text-slate-400 mt-1 block font-mono">
                                            = {formData.totalLifeMinutes ? (parseFloat(formData.totalLifeMinutes) / 60).toFixed(1) : 0} saat çalıştı
                                        </span>
                                    </div>
                                ) : (
                                    <>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-300 mb-1">Parça Başı Süre (dk)</label>
                                            <input 
                                                type="number" 
                                                step="0.1" 
                                                required 
                                                placeholder="Örn: 45"
                                                value={formData.cycleTime} 
                                                onChange={(e) => setFormData({...formData, cycleTime: e.target.value})}
                                                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 transition font-bold"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-300 mb-1">İşlenen Toplam Parça Adedi</label>
                                            <input 
                                                type="number" 
                                                required 
                                                placeholder="Örn: 4"
                                                value={formData.totalPieces} 
                                                onChange={(e) => setFormData({...formData, totalPieces: e.target.value})}
                                                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 transition font-bold text-emerald-400"
                                            />
                                        </div>
                                    </>
                                )}

                                <div>
                                    <label className="block text-xs font-bold text-slate-300 mb-1">Aşınma Türü / Durum</label>
                                    <select 
                                        value={formData.wearType} 
                                        onChange={(e) => setFormData({...formData, wearType: e.target.value})}
                                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 transition"
                                    >
                                        <option value="Normal Yanak Aşınması">Normal Yanak Aşınması</option>
                                        <option value="Çentik Aşınması">Çentik Aşınması</option>
                                        <option value="Uç Kırılması / Tereddüt">Uç Kırılması / Kırılma</option>
                                        <option value="Termal Çatlama">Termal Çatlama</option>
                                        <option value="Plastik Deformasyon">Plastik Deformasyon</option>
                                        <option value="Talaş Kaynaması (BUE)">Talaş Kaynaması (BUE)</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-300 mb-1">Yüzey Kalitesi Ra (µm)</label>
                                    <input 
                                        type="number" 
                                        step="0.1" 
                                        placeholder="Örn: 1.8"
                                        value={formData.raValue} 
                                        onChange={(e) => setFormData({...formData, raValue: e.target.value})}
                                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 transition font-bold"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                                <div>
                                    <label className="block text-xs font-bold text-slate-300 mb-1">Ses / Titreşim / Talaş Tahliyesi Değerlendirmesi</label>
                                    <select 
                                        value={formData.vibrationRating} 
                                        onChange={(e) => setFormData({...formData, vibrationRating: e.target.value})}
                                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 transition font-bold text-amber-400"
                                    >
                                        <option value="5">⭐⭐⭐⭐⭐ Mükemmel (Sessiz, Titreşimsiz, İdeal Talaş)</option>
                                        <option value="4">⭐⭐⭐⭐ İyi (Kabul edilebilir ses ve talaş)</option>
                                        <option value="3">⭐⭐⭐ Orta (Hafif titreşim var)</option>
                                        <option value="2">⭐⭐ Zayıf (Yüksek ses ve kötü talaş kırıcı)</option>
                                        <option value="1">⭐ Çok Kötü (Aşırı Zırıltı / Tehdit Edici)</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-300 mb-1">Mühendis / Operatör Notları</label>
                                    <input 
                                        type="text" 
                                        placeholder="Örn: 2. saatten sonra talaş rengi değişti, kaplama başarılı." 
                                        value={formData.notes} 
                                        onChange={(e) => setFormData({...formData, notes: e.target.value})}
                                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 transition"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* ANLIK F/P PUAN SKORU BANNERİ */}
                        <div className="bg-slate-800/80 p-5 rounded-2xl border border-slate-700 flex flex-col sm:flex-row items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                                <div className="bg-emerald-600 p-3 rounded-xl text-white shadow-lg">
                                    <Award className="w-6 h-6" />
                                </div>
                                <div>
                                    <h4 className="text-sm font-bold text-white">Bütünleşik F/P İndeksi Skoru</h4>
                                    <p className="text-xs text-slate-400">Talaş Hacmi, Tezgah Maliyet Tasarrufu ve Kalite Faktörlerinin Birleşimi</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="text-right">
                                    <span className="text-3xl font-black text-emerald-400">{calculated.fpScore}</span>
                                    <span className="text-xs text-slate-400"> / 1000 Puan</span>
                                </div>
                                <button 
                                    type="submit" 
                                    className={`px-6 py-3 font-bold rounded-xl shadow-lg transition flex items-center gap-2 text-sm ml-4 ${
                                        editingTrialId 
                                        ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-600/30' 
                                        : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-600/30'
                                    }`}
                                >
                                    <Save className="w-4 h-4" /> 
                                    {editingTrialId ? 'Değişiklikleri Güncelle' : 'Kaydı Kaydet'}
                                </button>
                            </div>
                        </div>
                    </form>
                </div>
            )}

            {/* SEKME 2: KAYITLI TAKIM DENEMELERİ LİSTESİ */}
            {activeTab === 'list' && (
                <div className="space-y-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-800/80 p-5 rounded-2xl border border-slate-700/80 shadow-md">
                        <div>
                            <h2 className="text-lg font-bold text-white flex items-center gap-2">
                                <ListChecks className="w-5 h-5 text-blue-400" /> Kayıtlı Takım Denemeleri ({trials.length})
                            </h2>
                            <p className="text-slate-400 text-xs mt-1">Tüm takım denemelerini listeleyin, arama yapın, düzenleyin veya kıyaslamak istediğiniz kayıtları seçin.</p>
                        </div>
                        <div className="flex items-center gap-3">
                            <input 
                                type="text" 
                                placeholder="Marka, malzeme veya başlık ara..." 
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 w-48 sm:w-64"
                            />
                            <button 
                                onClick={exportToCSV}
                                className="px-3.5 py-2 bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600 hover:text-white border border-emerald-500/30 rounded-lg text-xs font-bold transition flex items-center gap-1.5"
                            >
                                <FileSpreadsheet className="w-4 h-4" /> Excel/CSV Aktar
                            </button>
                        </div>
                    </div>

                    <div className="bg-slate-800/50 rounded-2xl border border-slate-700/60 overflow-hidden shadow-xl">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs text-slate-300">
                                <thead className="bg-slate-900/90 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-700">
                                    <tr>
                                        <th className="p-3.5 w-10">
                                            <input 
                                                type="checkbox" 
                                                checked={selectedTrialIds.size === trials.length && trials.length > 0} 
                                                onChange={toggleSelectAll} 
                                                className="rounded bg-slate-900 border-slate-700 cursor-pointer"
                                            />
                                        </th>
                                        <th className="p-3.5">Başlık / Operasyon</th>
                                        <th className="p-3.5">Marka / Takım Yapısı</th>
                                        <th className="p-3.5">Malzeme</th>
                                        <th className="p-3.5">Parametreler (Vc / fz)</th>
                                        <th className="p-3.5">Talaş Hızı (MRR)</th>
                                        <th className="p-3.5">Toplam Ömür (Süre / Talaş)</th>
                                        <th className="p-3.5">Birim Talaş Maliyeti</th>
                                        <th className="p-3.5">F/P Skoru</th>
                                        <th className="p-3.5 text-right">İşlemler</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-700/50">
                                    {filteredTrials.map(t => {
                                        const m = computeDetailedMetrics(t);
                                        const isChecked = selectedTrialIds.has(t.id);
                                        return (
                                            <tr key={t.id} className="hover:bg-slate-800/80 transition border-b border-slate-700/40">
                                                <td className="p-3.5">
                                                    <input 
                                                        type="checkbox" 
                                                        checked={isChecked} 
                                                        onChange={() => toggleSelect(t.id)} 
                                                        className="rounded bg-slate-900 border-slate-700 cursor-pointer"
                                                    />
                                                </td>
                                                <td className="p-3.5 font-medium text-white">
                                                    <div className="font-bold text-sm text-white">{t.title}</div>
                                                    <div className="flex items-center gap-1.5 mt-0.5">
                                                        <span className="text-[10px] bg-slate-900 text-blue-300 px-1.5 py-0.5 rounded font-bold border border-slate-700">{t.operationCategory || 'FREZELEME'}</span>
                                                        <span className="text-[10px] text-slate-400">{t.date}</span>
                                                    </div>
                                                </td>
                                                <td className="p-3.5">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="inline-block px-2 py-0.5 bg-blue-900/40 text-blue-300 rounded border border-blue-700/30 text-[11px] font-bold">{t.brand}</span>
                                                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${t.constructionType === 'INSERT' ? 'bg-amber-950 text-amber-300 border border-amber-800/50' : 'bg-purple-950 text-purple-300 border border-purple-800/50'}`}>
                                                            {t.constructionType === 'INSERT' ? `Takma Uç (${t.insertCorners || 4} Köşe)` : 'Yekpare'}
                                                        </span>
                                                    </div>
                                                    <div className="text-slate-400 text-[11px] mt-0.5 font-mono">
                                                        {t.model} (Ø{t.diameter} {t.millingToolType === 'BALL' ? 'Küre' : t.millingToolType === 'RADIUS' ? `R${t.cornerRadius}` : ''})
                                                    </div>
                                                </td>
                                                <td className="p-3.5 font-semibold text-slate-200">{t.material}</td>
                                                <td className="p-3.5 text-slate-300">
                                                    <div>Vc: {t.vc} m/dk | fz: {t.fz}</div>
                                                    <div className="text-[10px] text-slate-400">n: {m.rpm} dev | Vf: {m.vf} mm/dk</div>
                                                </td>
                                                <td className="p-3.5 font-black text-amber-400">{m.mrr} cm³/dk</td>
                                                <td className="p-3.5 text-slate-200">
                                                    <div className="font-bold text-emerald-400">{m.totalLifeMinutes} dk ({(m.totalLifeMinutes / 60).toFixed(1)} st)</div>
                                                    <div className="text-[10px] text-indigo-300 font-bold">{m.totalVolumeCm3.toLocaleString('tr-TR')} cm³ talaş</div>
                                                </td>
                                                <td className="p-3.5 font-bold text-purple-300">{m.costPerCm3} €/cm³</td>
                                                <td className="p-3.5">
                                                    <span className="px-2.5 py-1 bg-slate-900 rounded-lg text-emerald-400 font-black border border-slate-700">{m.fpScore} pts</span>
                                                </td>
                                                <td className="p-3.5 text-right space-x-1">
                                                    <button 
                                                        onClick={() => handleEdit(t)} 
                                                        className="text-amber-400 hover:text-amber-300 p-1.5 hover:bg-slate-700 rounded transition" 
                                                        title="Düzenle"
                                                    >
                                                        <Edit2 className="w-4 h-4" />
                                                    </button>
                                                    <button 
                                                        onClick={() => handleDelete(t.id)} 
                                                        className="text-rose-400 hover:text-rose-300 p-1.5 hover:bg-slate-700 rounded transition" 
                                                        title="Sil"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {filteredTrials.length === 0 && (
                            <div className="p-12 text-center text-slate-500">
                                <ListChecks className="w-12 h-12 mx-auto mb-3 text-slate-600" />
                                <p className="font-bold text-sm text-slate-400">Kayıtlı takım deneme verisi bulunamadı.</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* SEKME 3: KIYASLAMA VE GRAFİKLER */}
            {activeTab === 'compare' && (
                <div className="space-y-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-800/80 p-5 rounded-2xl border border-slate-700/80 shadow-md">
                        <div>
                            <h2 className="text-lg font-bold text-white flex items-center gap-2">
                                <TrendingUp className="w-5 h-5 text-blue-400" /> Takım Karşılaştırma & Grafik Analizleri
                            </h2>
                            <p className="text-slate-400 text-xs mt-1">
                                {selectedTrialIds.size > 0 
                                    ? `Seçilen ${selectedTrialIds.size} takım kıyaslanıyor.` 
                                    : 'Tüm kayıtlar grafiklerde kıyaslanıyor. (Listedeki kutucukları işaretleyerek özel seçim yapabilirsiniz.)'}
                            </p>
                        </div>
                        <button 
                            onClick={() => setShowInfoModal(true)}
                            className="px-3.5 py-2 bg-blue-900/40 hover:bg-blue-900/60 text-blue-300 text-xs font-bold rounded-lg border border-blue-500/30 transition flex items-center gap-1.5"
                        >
                            <HelpCircle className="w-4 h-4 text-blue-400" /> Puanlama & Geometri Metodolojisi
                        </button>
                    </div>

                    {/* RECHARTS PERFORMANS GRAFİKLERİ */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        
                        {/* Grafik 1: Birim Talaş Maliyeti (cm³) */}
                        <div className="bg-slate-800/50 p-5 rounded-2xl border border-slate-700/60 shadow-lg">
                            <h3 className="text-xs font-bold uppercase tracking-wider text-purple-400 mb-4 flex items-center gap-2">
                                <Calculator className="w-4 h-4" /> Birim Talaş Kaldırma Maliyeti (€/cm³ - Düşük İyidir)
                            </h3>
                            <div className="h-64">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={chartData}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                                        <XAxis dataKey="name" stroke="#94a3b8" tick={{ fontSize: 10 }} />
                                        <YAxis stroke="#94a3b8" />
                                        <Tooltip contentStyle={{ backgroundColor: '#1e293b', borderColor: '#475569', borderRadius: '8px' }} />
                                        <Bar dataKey="costPerCm3" name="Birim Talaş Maliyeti (€/cm³)" fill="#c084fc" radius={[6, 6, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* Grafik 2: Toplam Takım Ömrü Süresi */}
                        <div className="bg-slate-800/50 p-5 rounded-2xl border border-slate-700/60 shadow-lg">
                            <h3 className="text-xs font-bold uppercase tracking-wider text-blue-400 mb-4 flex items-center gap-2">
                                <Clock className="w-4 h-4" /> Toplam Takım Ömrü Süresi (Dakika - Yüksek İyidir)
                            </h3>
                            <div className="h-64">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={chartData}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                                        <XAxis dataKey="name" stroke="#94a3b8" tick={{ fontSize: 10 }} />
                                        <YAxis stroke="#94a3b8" />
                                        <Tooltip contentStyle={{ backgroundColor: '#1e293b', borderColor: '#475569', borderRadius: '8px' }} />
                                        <Bar dataKey="totalLifeMinutes" name="Ömür Süresi (Dakika)" fill="#60a5fa" radius={[6, 6, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* Grafik 3: MRR Talaş Kaldırma Hızı */}
                        <div className="bg-slate-800/50 p-5 rounded-2xl border border-slate-700/60 shadow-lg">
                            <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400 mb-4 flex items-center gap-2">
                                <Sliders className="w-4 h-4" /> Talaş Kaldırma Hızı MRR (cm³/dk - Yüksek İyidir)
                            </h3>
                            <div className="h-64">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={chartData}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                                        <XAxis dataKey="name" stroke="#94a3b8" tick={{ fontSize: 10 }} />
                                        <YAxis stroke="#94a3b8" />
                                        <Tooltip contentStyle={{ backgroundColor: '#1e293b', borderColor: '#475569', borderRadius: '8px' }} />
                                        <Bar dataKey="mrr" name="MRR (cm³/dk)" fill="#fbbf24" radius={[6, 6, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* Grafik 4: Bütünleşik F/P Skoru */}
                        <div className="bg-slate-800/50 p-5 rounded-2xl border border-slate-700/60 shadow-lg">
                            <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400 mb-4 flex items-center gap-2">
                                <Star className="w-4 h-4" /> Bütünleşik F/P Verimlilik Skoru (Max 1000 Puan)
                            </h3>
                            <div className="h-64">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={chartData}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                                        <XAxis dataKey="name" stroke="#94a3b8" tick={{ fontSize: 10 }} />
                                        <YAxis stroke="#94a3b8" />
                                        <Tooltip contentStyle={{ backgroundColor: '#1e293b', borderColor: '#475569', borderRadius: '8px' }} />
                                        <Bar dataKey="fpScore" name="F/P Skoru" fill="#34d399" radius={[6, 6, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>

                    {/* YAN YANA DETAYLI KARŞILAŞTIRMA MATRİS TABLOSU */}
                    <div className="bg-slate-800/50 p-5 rounded-2xl border border-slate-700/60 shadow-lg space-y-4">
                        <h3 className="text-sm font-bold text-white flex items-center gap-2 border-b border-slate-700 pb-3">
                            <Layers className="w-4 h-4 text-blue-400" /> Yan Yana Detaylı Karşılaştırma Matrisi
                        </h3>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs text-slate-300">
                                <thead className="bg-slate-900/80 text-slate-400 border-b border-slate-700">
                                    <tr>
                                        <th className="p-3 font-bold text-slate-400 border-r border-slate-700 w-52">Parametre / Özellik</th>
                                        {comparisonData.map(t => (
                                            <th key={t.id} className="p-3 font-bold text-white text-center border-r border-slate-700/50">
                                                {t.brand} <br/>
                                                <span className="text-[10px] font-normal text-slate-400">{t.model}</span>
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-700/50">
                                    <tr className="hover:bg-slate-800/40">
                                        <td className="p-3 font-semibold text-slate-300 border-r border-slate-700 bg-slate-900/30">Operasyon & Uç Geometrisi</td>
                                        {comparisonData.map(t => (
                                            <td key={t.id} className="p-3 text-center border-r border-slate-700/30 font-bold text-blue-300">
                                                {t.operationCategory || 'FREZELEME'} - {t.millingToolType === 'BALL' ? 'Küre Uç' : t.millingToolType === 'RADIUS' ? `R${t.cornerRadius} Toroid` : 'Düz Uç'}
                                            </td>
                                        ))}
                                    </tr>
                                    <tr className="hover:bg-slate-800/40">
                                        <td className="p-3 font-semibold text-slate-300 border-r border-slate-700 bg-slate-900/30">Takım Gövde Tipi</td>
                                        {comparisonData.map(t => (
                                            <td key={t.id} className="p-3 text-center border-r border-slate-700/30 font-bold">
                                                {t.constructionType === 'INSERT' ? <span className="text-amber-400">Takma Uçlu ({t.insertCorners || 4} Köşe)</span> : <span className="text-purple-400">Yekpare Karbür</span>}
                                            </td>
                                        ))}
                                    </tr>
                                    <tr className="hover:bg-slate-800/40">
                                        <td className="p-3 font-semibold text-slate-300 border-r border-slate-700 bg-slate-900/30">Takım Çapı / Ağız</td>
                                        {comparisonData.map(t => <td key={t.id} className="p-3 text-center border-r border-slate-700/30 font-mono">Ø{t.diameter} mm / {t.flutes} Ağız</td>)}
                                    </tr>
                                    <tr className="hover:bg-slate-800/40">
                                        <td className="p-3 font-semibold text-slate-300 border-r border-slate-700 bg-slate-900/30">Efektif Köşe/Takım Fiyatı</td>
                                        {comparisonData.map(t => <td key={t.id} className="p-3 text-center border-r border-slate-700/30 font-bold text-emerald-400">{t.effectiveToolPrice} {t.currency || '€'} {t.constructionType === 'INSERT' ? '/ köşe' : ''}</td>)}
                                    </tr>
                                    <tr className="hover:bg-slate-800/40">
                                        <td className="p-3 font-semibold text-amber-400 border-r border-slate-700 bg-slate-900/30">Tezgah Saat Ücreti</td>
                                        {comparisonData.map(t => <td key={t.id} className="p-3 text-center border-r border-slate-700/30 font-bold text-amber-300">{t.machineHourlyRate || 35} €/saat</td>)}
                                    </tr>
                                    <tr className="hover:bg-slate-800/40">
                                        <td className="p-3 font-semibold text-slate-300 border-r border-slate-700 bg-slate-900/30">Kesme Şartları (Vc / fz)</td>
                                        {comparisonData.map(t => <td key={t.id} className="p-3 text-center border-r border-slate-700/30">Vc: {t.vc} m/dk | fz: {t.fz} mm</td>)}
                                    </tr>
                                    <tr className="hover:bg-slate-800/40">
                                        <td className="p-3 font-semibold text-slate-300 border-r border-slate-700 bg-slate-900/30">Derinlik (ap x ae)</td>
                                        {comparisonData.map(t => <td key={t.id} className="p-3 text-center border-r border-slate-700/30">{t.ap} mm x {t.ae} mm</td>)}
                                    </tr>
                                    <tr className="hover:bg-slate-800/40">
                                        <td className="p-3 font-semibold text-slate-300 border-r border-slate-700 bg-slate-900/30">Hesaplanan Devir (n)</td>
                                        {comparisonData.map(t => <td key={t.id} className="p-3 text-center border-r border-slate-700/30 text-blue-400 font-bold">{t.rpm} dev/dk</td>)}
                                    </tr>
                                    <tr className="hover:bg-slate-800/40">
                                        <td className="p-3 font-semibold text-slate-300 border-r border-slate-700 bg-slate-900/30">Hesaplanan İlerleme (Vf)</td>
                                        {comparisonData.map(t => <td key={t.id} className="p-3 text-center border-r border-slate-700/30 text-emerald-400 font-bold">{t.vf} mm/dk</td>)}
                                    </tr>
                                    <tr className="hover:bg-slate-800/40">
                                        <td className="p-3 font-semibold text-slate-300 border-r border-slate-700 bg-slate-900/30">Talaş Kaldırma Hızı (MRR)</td>
                                        {comparisonData.map(t => <td key={t.id} className="p-3 text-center border-r border-slate-700/30 text-amber-400 font-bold">{t.mrr} cm³/dk</td>)}
                                    </tr>
                                    <tr className="hover:bg-slate-800/40">
                                        <td className="p-3 font-semibold text-slate-300 border-r border-slate-700 bg-slate-900/30">Takım Ömrü Süresi</td>
                                        {comparisonData.map(t => <td key={t.id} className="p-3 text-center border-r border-slate-700/30 font-bold text-blue-400">{t.totalLifeMinutes} dk ({(t.totalLifeMinutes / 60).toFixed(1)} st)</td>)}
                                    </tr>
                                    <tr className="hover:bg-slate-800/40">
                                        <td className="p-3 font-semibold text-slate-300 border-r border-slate-700 bg-slate-900/30">Kaldırılan Toplam Talaş Hacmi</td>
                                        {comparisonData.map(t => <td key={t.id} className="p-3 text-center border-r border-slate-700/30 font-bold text-indigo-300">{t.totalVolumeCm3.toLocaleString('tr-TR')} cm³</td>)}
                                    </tr>
                                    <tr className="hover:bg-slate-800/40">
                                        <td className="p-3 font-semibold text-slate-300 border-r border-slate-700 bg-slate-900/30">Ömür Boyunca Tezgah Maliyeti</td>
                                        {comparisonData.map(t => <td key={t.id} className="p-3 text-center border-r border-slate-700/30 font-bold text-slate-300">{t.machineCost} €</td>)}
                                    </tr>
                                    <tr className="hover:bg-slate-800/40">
                                        <td className="p-3 font-semibold text-slate-300 border-r border-slate-700 bg-slate-900/30">Toplam Operasyon Maliyeti</td>
                                        {comparisonData.map(t => <td key={t.id} className="p-3 text-center border-r border-slate-700/30 font-bold text-purple-300">{t.totalOpCost} €</td>)}
                                    </tr>
                                    <tr className="hover:bg-slate-800/40">
                                        <td className="p-3 font-semibold text-slate-300 border-r border-slate-700 bg-slate-900/30">Birim Talaş Başına Maliyet</td>
                                        {comparisonData.map(t => <td key={t.id} className="p-3 text-center border-r border-slate-700/30 text-purple-400 font-bold">{t.costPerCm3} €/cm³</td>)}
                                    </tr>
                                    <tr className="hover:bg-slate-800/40">
                                        <td className="p-3 font-semibold text-slate-300 border-r border-slate-700 bg-slate-900/30">Aşınma Türü</td>
                                        {comparisonData.map(t => <td key={t.id} className="p-3 text-center border-r border-slate-700/30 text-xs">{t.wearType}</td>)}
                                    </tr>
                                    <tr className="hover:bg-slate-800/40">
                                        <td className="p-3 font-semibold text-slate-300 border-r border-slate-700 bg-slate-900/30">Bütünleşik F/P Skoru</td>
                                        {comparisonData.map(t => <td key={t.id} className="p-3 text-center border-r border-slate-700/30 font-bold"><span className="bg-emerald-900/60 text-emerald-300 font-black px-2.5 py-1 rounded-lg border border-emerald-600/40">{t.fpScore} Puan</span></td>)}
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ToolTrialPage;
