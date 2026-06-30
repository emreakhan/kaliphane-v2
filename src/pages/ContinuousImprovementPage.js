import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
    Lightbulb, CheckSquare, HelpCircle, Search, Plus, X, Save, 
    Image as ImageIcon, Download, Trash2, Calendar, Target, Award,
    ChevronDown, ChevronUp, Edit2, Coins, TrendingDown, ArrowRight,
    Factory, Settings, MessageSquare
} from 'lucide-react';
import { 
    db, storage, collection, addDoc, updateDoc, onSnapshot, 
    query, orderBy, deleteDoc, doc, ref, uploadBytes, getDownloadURL 
} from '../config/firebase.js';
import { getCurrentDateTimeString, formatDateTime } from '../utils/dateUtils.js';
import html2pdf from 'html2pdf.js';

const formatMinsToHM = (mins) => {
    if (mins === undefined || mins === null || isNaN(mins)) return '0 Dk';
    const absMins = Math.abs(mins);
    const h = Math.floor(absMins / 60);
    const m = parseFloat((absMins % 60).toFixed(1));
    const sign = mins < 0 ? '-' : '';
    if (h > 0 && m > 0) return `${sign}${h} Sa ${m} Dk`;
    if (h > 0) return `${sign}${h} Sa`;
    return `${sign}${m} Dk`;
};

const ContinuousImprovementPage = ({ loggedInUser }) => {
    const [activeTab, setActiveTab] = useState('KAIZEN');
    const [kaizens, setKaizens] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [is5sModalOpen, setIs5sModalOpen] = useState(false);
    const [isWhyModalOpen, setIsWhyModalOpen] = useState(false);
    const [isRoiModalOpen, setIsRoiModalOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const [editingKaizenId, setEditingKaizenId] = useState(null);
    const [expandedKaizenId, setExpandedKaizenId] = useState(null);
    const [editing5sId, setEditing5sId] = useState(null);
    const [expanded5sId, setExpanded5sId] = useState(null);
    const [editingWhyId, setEditingWhyId] = useState(null);
    const [viewingWhy, setViewingWhy] = useState(null);
    
    const [rois, setRois] = useState([]);
    const [editingRoiId, setEditingRoiId] = useState(null);
    const [viewingRoi, setViewingRoi] = useState(null);

    // Resim Önizleme (Tam Ekran) State'i
    const [previewImage, setPreviewImage] = useState(null);

    // Yeni Fabrika Kapasite Ayarları State'leri
    const [factorySettings, setFactorySettings] = useState(() => {
        const saved = localStorage.getItem('ci_factory_settings');
        return saved ? JSON.parse(saved) : { machinesCount: 10, workingDays: 300, dailyHours: 24 };
    });
    const [isFactorySettingsOpen, setIsFactorySettingsOpen] = useState(false);

    // Yeni Kaizen Formu State'leri
    const [formData, setFormData] = useState({
        title: '',
        problem: '',
        solution: '',
        benefitType: 'Zaman Tasarrufu', // Zaman, Maliyet, İş Güvenliği, Kalite
        benefitDescription: ''
    });
    const [beforeImage, setBeforeImage] = useState(null);
    const [afterImage, setAfterImage] = useState(null);

    // Yeni 5S Formu State'leri
    const [audits5s, setAudits5s] = useState([]);
    const [formData5s, setFormData5s] = useState({
        area: '', score1: '', score2: '', score3: '', score4: '', score5: '', notes: ''
    });

    // Yeni 5 Neden Formu State'leri
    const [whys, setWhys] = useState([]);
    const [formDataWhy, setFormDataWhy] = useState({
        problem: '', why1: '', why2: '', why3: '', why4: '', why5: '', rootCause: '', actionTaken: ''
    });

    // Yeni ROI / Maliyet Formu State'leri
    const [formDataRoi, setFormDataRoi] = useState({
        title: '', partName: '', description: '', machineHourlyRate: '', annualVolume: '', oldTimeH: '', oldTimeM: '', newTimeH: '', newTimeM: '', investmentCost: '', oldSetupTimeH: '', oldSetupTimeM: '', newSetupTimeH: '', newSetupTimeM: ''
    });


    // --- MODAL AÇMA / KAPAMA YARDIMCILARI ---
    const closeKaizenModal = () => {
        setIsModalOpen(false);
        setEditingKaizenId(null);
        setFormData({ title: '', problem: '', solution: '', benefitType: 'Zaman Tasarrufu', benefitDescription: '' });
        setBeforeImage(null);
        setAfterImage(null);
    };
    const openEditKaizen = (kz) => {
        setFormData({ title: kz.title, problem: kz.problem, solution: kz.solution, benefitType: kz.benefitType, benefitDescription: kz.benefitDescription || '' });
        setEditingKaizenId(kz.id);
        setIsModalOpen(true);
    };
    const close5sModal = () => {
        setIs5sModalOpen(false);
        setEditing5sId(null);
        setFormData5s({ area: '', score1: '', score2: '', score3: '', score4: '', score5: '', notes: '' });
    };
    const openEdit5s = (audit) => {
        setFormData5s({ area: audit.area, score1: audit.score1, score2: audit.score2, score3: audit.score3, score4: audit.score4, score5: audit.score5, notes: audit.notes || '' });
        setEditing5sId(audit.id);
        setIs5sModalOpen(true);
    };
    const closeWhyModal = () => {
        setIsWhyModalOpen(false);
        setEditingWhyId(null);
        setFormDataWhy({ problem: '', why1: '', why2: '', why3: '', why4: '', why5: '', rootCause: '', actionTaken: '' });
    };
    const openEditWhy = (why) => {
        setFormDataWhy({ problem: why.problem, why1: why.why1, why2: why.why2, why3: why.why3, why4: why.why4, why5: why.why5, rootCause: why.rootCause || '', actionTaken: why.actionTaken || '' });
        setEditingWhyId(why.id);
        setIsWhyModalOpen(true);
    };
    const closeRoiModal = () => {
        setIsRoiModalOpen(false);
        setEditingRoiId(null);
        setFormDataRoi({ title: '', partName: '', description: '', machineHourlyRate: '', annualVolume: '', oldTimeH: '', oldTimeM: '', newTimeH: '', newTimeM: '', investmentCost: '', oldSetupTimeH: '', oldSetupTimeM: '', newSetupTimeH: '', newSetupTimeM: '' });
    };
    const openEditRoi = (roi) => {
        const getH = (mins) => mins ? Math.floor(parseFloat(mins) / 60).toString() : '';
        const getM = (mins) => mins ? parseFloat((parseFloat(mins) % 60).toFixed(1)).toString() : '';
        setFormDataRoi({ title: roi.title, partName: roi.partName, description: roi.description, machineHourlyRate: roi.machineHourlyRate, annualVolume: roi.annualVolume || (roi.monthlyVolume ? roi.monthlyVolume * 12 : ''), oldTimeH: getH(roi.oldTime), oldTimeM: getM(roi.oldTime), newTimeH: getH(roi.newTime), newTimeM: getM(roi.newTime), investmentCost: roi.investmentCost, oldSetupTimeH: getH(roi.oldSetupTime), oldSetupTimeM: getM(roi.oldSetupTime), newSetupTimeH: getH(roi.newSetupTime), newSetupTimeM: getM(roi.newSetupTime) });
        setEditingRoiId(roi.id);
        setIsRoiModalOpen(true);
    };

    // --- FABRİKA KAPASİTE HESAPLAMALARI ---
    const handleSaveFactorySettings = (newSettings) => {
        setFactorySettings(newSettings);
        localStorage.setItem('ci_factory_settings', JSON.stringify(newSettings));
        setIsFactorySettingsOpen(false);
    };

    const factoryImpact = useMemo(() => {
        const totalAnnualHoursSaved = rois.reduce((sum, roi) => {
            const hours = parseFloat(roi.annualHoursSaved) || ((parseFloat(roi.monthlyHoursSaved) || 0) * 12);
            return sum + hours;
        }, 0);
        const totalFactoryCapacity = (parseInt(factorySettings.machinesCount) || 1) * (parseInt(factorySettings.workingDays) || 1) * (parseInt(factorySettings.dailyHours) || 1);
        const capacityIncreasePercent = totalFactoryCapacity > 0 ? (totalAnnualHoursSaved / totalFactoryCapacity) * 100 : 0;

        return {
            totalAnnualHoursSaved,
            totalFactoryCapacity,
            capacityIncreasePercent
        };
    }, [rois, factorySettings]);

    // --- VERİ ÇEKME (KAIZENS) ---
    useEffect(() => {
        if (!db) return;
        const q = query(collection(db, 'ci_kaizens'), orderBy('createdAt', 'desc'));
        const unsub = onSnapshot(q, (snapshot) => {
            setKaizens(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            setLoading(false);
        });
        return () => unsub();
    }, [db]);

    // --- VERİ ÇEKME (5S) ---
    useEffect(() => {
        if (!db) return;
        const q = query(collection(db, 'ci_5s_audits'), orderBy('createdAt', 'desc'));
        const unsub = onSnapshot(q, (snapshot) => {
            setAudits5s(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });
        return () => unsub();
    }, [db]);

    // --- VERİ ÇEKME (5 NEDEN) ---
    useEffect(() => {
        if (!db) return;
        const q = query(collection(db, 'ci_5whys'), orderBy('createdAt', 'desc'));
        const unsub = onSnapshot(q, (snapshot) => {
            setWhys(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });
        return () => unsub();
    }, [db]);

    // --- VERİ ÇEKME (ROI ANALİZİ) ---
    useEffect(() => {
        if (!db) return;
        const q = query(collection(db, 'ci_roi_analysis'), orderBy('createdAt', 'desc'));
        const unsub = onSnapshot(q, (snapshot) => {
            setRois(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });
        return () => unsub();
    }, [db]);

    // --- FOTOĞRAF YÜKLEME VE KAYDETME ---
    const handleSaveKaizen = async () => {
        if (!formData.title || !formData.problem || !formData.solution) {
            return alert("Lütfen başlık, problem ve çözüm alanlarını doldurunuz.");
        }
        setIsSaving(true);
        try {
            const kaizenData = {
                ...formData,
            };

            if (beforeImage) {
                const beforeRef = ref(storage, `kaizens/before_${Date.now()}_${beforeImage.name}`);
                await uploadBytes(beforeRef, beforeImage);
                kaizenData.beforeImageUrl = await getDownloadURL(beforeRef);
            }
            if (afterImage) {
                const afterRef = ref(storage, `kaizens/after_${Date.now()}_${afterImage.name}`);
                await uploadBytes(afterRef, afterImage);
                kaizenData.afterImageUrl = await getDownloadURL(afterRef);
            }

            if (editingKaizenId) {
                await updateDoc(doc(db, 'ci_kaizens', editingKaizenId), kaizenData);
            } else {
                kaizenData.reportedBy = loggedInUser?.name || 'Bilinmiyor';
                kaizenData.reportedById = loggedInUser?.id || '';
                kaizenData.createdAt = getCurrentDateTimeString();
                if (!kaizenData.beforeImageUrl) kaizenData.beforeImageUrl = '';
                if (!kaizenData.afterImageUrl) kaizenData.afterImageUrl = '';
                await addDoc(collection(db, 'ci_kaizens'), kaizenData);
            }

            closeKaizenModal();
            alert("Kaizen başarıyla kaydedildi!");
        } catch (error) {
            console.error("Kaizen kaydetme hatası:", error);
            alert("Kaydedilirken bir hata oluştu.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteKaizen = async (id) => {
        if (window.confirm("Bu Kaizen raporunu silmek istediğinize emin misiniz?")) {
            await deleteDoc(doc(db, 'ci_kaizens', id));
        }
    };

    const handleEvaluateKaizen = async (kz) => {
        const evaluation = window.prompt("Kaizen Değerlendirmesini Girin:", kz.evaluation || "");
        if (evaluation === null) return; // Kullanıcı iptal etti
        
        try {
            await updateDoc(doc(db, 'ci_kaizens', kz.id), { 
                evaluation: evaluation.trim(),
                evaluatedBy: loggedInUser?.name || 'Yönetici',
                evaluatedAt: getCurrentDateTimeString()
            });
            alert("Değerlendirme başarıyla kaydedildi!");
        } catch (error) {
            console.error("Değerlendirme kaydedilemedi:", error);
            alert("Hata: Değerlendirme kaydedilemedi. " + error.message);
        }
    };

    // --- 5S KAYDETME ---
    const handleSave5s = async () => {
        if (!formData5s.area) return alert("Lütfen denetim yapılan alanı giriniz.");
        setIsSaving(true);
        try {
            const totalScore = 
                (parseInt(formData5s.score1) || 0) + 
                (parseInt(formData5s.score2) || 0) + 
                (parseInt(formData5s.score3) || 0) + 
                (parseInt(formData5s.score4) || 0) + 
                (parseInt(formData5s.score5) || 0);

            const dataToSave = {
                ...formData5s,
                totalScore,
                auditor: loggedInUser?.name || 'Bilinmiyor'
            };
            if (editing5sId) {
                await updateDoc(doc(db, 'ci_5s_audits', editing5sId), dataToSave);
            } else {
                dataToSave.createdAt = getCurrentDateTimeString();
                await addDoc(collection(db, 'ci_5s_audits'), dataToSave);
            }
            close5sModal();
        } catch (error) {
            console.error("5S Kaydetme hatası:", error);
            alert("Kaydedilirken bir hata oluştu.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete5s = async (id) => {
        if (window.confirm("Bu denetim kaydını silmek istediğinize emin misiniz?")) {
            await deleteDoc(doc(db, 'ci_5s_audits', id));
        }
    };

    // --- 5 NEDEN KAYDETME ---
    const handleSaveWhy = async () => {
        if (!formDataWhy.problem || !formDataWhy.why1) return alert("Lütfen problemi ve en azından ilk nedeni (1. Neden) giriniz.");
        setIsSaving(true);
        try {
            const dataToSave = {
                ...formDataWhy,
                reportedBy: loggedInUser?.name || 'Bilinmiyor'
            };
            if (editingWhyId) {
                await updateDoc(doc(db, 'ci_5whys', editingWhyId), dataToSave);
            } else {
                dataToSave.createdAt = getCurrentDateTimeString();
                await addDoc(collection(db, 'ci_5whys'), dataToSave);
            }
            closeWhyModal();
        } catch (error) {
            console.error("5 Neden Kaydetme hatası:", error);
            alert("Kaydedilirken bir hata oluştu.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteWhy = async (id) => {
        if (window.confirm("Bu kök neden analizini silmek istediğinize emin misiniz?")) {
            await deleteDoc(doc(db, 'ci_5whys', id));
            if (viewingWhy?.id === id) setViewingWhy(null);
        }
    };

    // --- ROI (MALİYET/KAZANÇ) KAYDETME ---
    const handleSaveRoi = async () => {
        if (!formDataRoi.title || !formDataRoi.annualVolume || !formDataRoi.machineHourlyRate) {
            return alert("Lütfen zorunlu alanları (Başlık, Yıllık Adet, Tezgah Saat Ücreti) doldurunuz.");
        }
        setIsSaving(true);
        try {
            const oldT = (parseFloat(formDataRoi.oldTimeH) || 0) * 60 + (parseFloat(formDataRoi.oldTimeM) || 0);
            const newT = (parseFloat(formDataRoi.newTimeH) || 0) * 60 + (parseFloat(formDataRoi.newTimeM) || 0);
            const oldS = (parseFloat(formDataRoi.oldSetupTimeH) || 0) * 60 + (parseFloat(formDataRoi.oldSetupTimeM) || 0);
            const newS = (parseFloat(formDataRoi.newSetupTimeH) || 0) * 60 + (parseFloat(formDataRoi.newSetupTimeM) || 0);
            const vol = parseFloat(formDataRoi.annualVolume) || 0;
            const rate = parseFloat(formDataRoi.machineHourlyRate) || 0;
            const inv = parseFloat(formDataRoi.investmentCost) || 0;

            const totalOldMins = (oldT * vol) + oldS;
            const totalNewMins = (newT * vol) + newS;
            const timeSavedMins = oldT - newT; 
            const setupSavedMins = oldS - newS;
            const annualHoursSaved = (totalOldMins - totalNewMins) / 60;
            const annualGain = annualHoursSaved * rate;
            const roiMonths = (inv > 0 && annualGain > 0) ? (inv / (annualGain / 12)) : 0;

            const dataToSave = {
                title: formDataRoi.title, partName: formDataRoi.partName, description: formDataRoi.description,
                machineHourlyRate: formDataRoi.machineHourlyRate, annualVolume: formDataRoi.annualVolume,
                investmentCost: formDataRoi.investmentCost,
                oldTime: oldT, newTime: newT, oldSetupTime: oldS, newSetupTime: newS,
                timeSavedMins,
                setupSavedMins,
                annualHoursSaved,
                annualGain,
                roiMonths,
                reportedBy: loggedInUser?.name || 'Bilinmiyor'
            };
            if (editingRoiId) {
                await updateDoc(doc(db, 'ci_roi_analysis', editingRoiId), dataToSave);
            } else {
                dataToSave.createdAt = getCurrentDateTimeString();
                await addDoc(collection(db, 'ci_roi_analysis'), dataToSave);
            }
            closeRoiModal();
            alert("Kazanç/Maliyet Analizi başarıyla kaydedildi!");
        } catch (error) {
            console.error("ROI Kaydetme hatası:", error);
            alert("Kaydedilirken bir hata oluştu.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteRoi = async (id) => {
        if (window.confirm("Bu analizi silmek istediğinize emin misiniz?")) {
            await deleteDoc(doc(db, 'ci_roi_analysis', id));
            if (viewingRoi?.id === id) setViewingRoi(null);
        }
    };

    // --- PDF ÇIKTISI (A3 RAPOR FORMATI) ---
    const handleDownloadPdf = (id, type = 'kaizen') => {
        const element = document.getElementById(`${type}-card-${id}`);
        if (!element) return;
        
        const prefix = type === 'kaizen' ? 'Kaizen' : type === 'roi' ? 'ROI_Analizi' : '5Neden';

        const opt = {
            margin: 5,
            filename: `${prefix}_A3_Raporu_${id.substring(0, 5)}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }
        };
        html2pdf().set(opt).from(element).save();
    };

    const renderTabContent = () => {
        if (activeTab === '5S') {
            return (
                <div className="space-y-6 animate-in fade-in">
                    <div className="flex justify-between items-center bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                        <div>
                            <h2 className="text-xl font-bold text-gray-800 dark:text-white flex items-center">
                                <CheckSquare className="w-6 h-6 mr-2 text-indigo-500" /> 5S Saha Denetimleri
                            </h2>
                            <p className="text-sm text-gray-500 mt-1">Sınıflandırma, Düzen, Temizlik, Standartlaştırma ve Disiplin denetimlerinizi kaydedin.</p>
                        </div>
                        <button onClick={() => setIs5sModalOpen(true)} className="px-5 py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white font-bold rounded-lg shadow-md transition flex items-center">
                            <Plus className="w-5 h-5 mr-2"/> Yeni 5S Denetimi
                        </button>
                    </div>

                    {audits5s.length === 0 ? (
                        <div className="text-center py-20 bg-white dark:bg-gray-800 rounded-xl border border-dashed border-gray-300 dark:border-gray-700">
                            <CheckSquare className="w-16 h-16 mx-auto text-gray-300 mb-4 opacity-50" />
                            <p className="text-gray-500 font-medium">Henüz bir 5S denetimi girilmemiş.</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {audits5s.map(audit => {
                                const isExpanded = expanded5sId === audit.id;
                                return (
                                    <div key={audit.id} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden transition-all">
                                        <div 
                                            onClick={() => setExpanded5sId(isExpanded ? null : audit.id)}
                                            className={`p-4 cursor-pointer flex justify-between items-center hover:bg-gray-50 dark:hover:bg-gray-700 transition ${isExpanded ? 'bg-gray-50 dark:bg-gray-700' : ''}`}
                                        >
                                            <div className="flex items-center gap-3">
                                                <CheckSquare className="w-5 h-5 text-indigo-500" />
                                                <div>
                                                    <h3 className="font-bold text-gray-800 dark:text-white text-base">{audit.area}</h3>
                                                    <p className="text-[10px] text-gray-500">{audit.createdAt.split(' ')[0]}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-4">
                                                <div className={`text-sm font-black px-3 py-1 rounded-full ${audit.totalScore >= 20 ? 'bg-green-100 text-green-700' : audit.totalScore >= 12 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                                                    {audit.totalScore} / 25
                                                </div>
                                                {isExpanded ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
                                            </div>
                                        </div>

                                        {isExpanded && (
                                            <div className="border-t border-gray-200 dark:border-gray-700 p-5 bg-white dark:bg-gray-800 animate-in slide-in-from-top-2">
                                                <div className="space-y-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
                                                    <div className="flex justify-between"><span>Sınıflandırma (1S):</span> <span className="font-bold">{audit.score1}/5</span></div>
                                                    <div className="flex justify-between"><span>Düzenleme (2S):</span> <span className="font-bold">{audit.score2}/5</span></div>
                                                    <div className="flex justify-between"><span>Temizlik (3S):</span> <span className="font-bold">{audit.score3}/5</span></div>
                                                    <div className="flex justify-between"><span>Standartlaştırma (4S):</span> <span className="font-bold">{audit.score4}/5</span></div>
                                                    <div className="flex justify-between"><span>Disiplin (5S):</span> <span className="font-bold">{audit.score5}/5</span></div>
                                                </div>
                                                {audit.notes && <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg text-xs text-gray-600 dark:text-gray-400 italic">"{audit.notes}"</div>}
                                                <div className="mt-4 pt-3 border-t dark:border-gray-700 flex justify-between items-center">
                                                    <span className="text-xs text-gray-500 font-bold">Denetçi: {audit.auditor}</span>
                                                    <div className="flex gap-2">
                                                        <button onClick={() => openEdit5s(audit)} className="text-yellow-600 hover:text-yellow-700 bg-yellow-50 hover:bg-yellow-100 p-2 rounded transition" title="Düzenle"><Edit2 className="w-4 h-4" /></button>
                                                        <button onClick={() => handleDelete5s(audit.id)} className="text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 p-2 rounded transition" title="Sil"><Trash2 className="w-4 h-4" /></button>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            );
        }
        if (activeTab === '5WHY') {
            return (
                <div className="space-y-6 animate-in fade-in">

                    <div className="flex justify-between items-center bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                        <div>
                            <h2 className="text-xl font-bold text-gray-800 dark:text-white flex items-center">
                                <HelpCircle className="w-6 h-6 mr-2 text-rose-500" /> 5 Neden Kök Neden Analizi
                            </h2>
                            <p className="text-sm text-gray-500 mt-1">Saha problemlerini kök nedenlerine inerek kalıcı çözümler planlayın.</p>
                        </div>
                        <button onClick={() => setIsWhyModalOpen(true)} className="px-5 py-2.5 bg-rose-500 hover:bg-rose-600 text-white font-bold rounded-lg shadow-md transition flex items-center">
                            <Plus className="w-5 h-5 mr-2"/> Yeni Analiz
                        </button>
                    </div>

                    {whys.length === 0 ? (
                        <div className="text-center py-20 bg-white dark:bg-gray-800 rounded-xl border border-dashed border-gray-300 dark:border-gray-700">
                            <HelpCircle className="w-16 h-16 mx-auto text-gray-300 mb-4 opacity-50" />
                            <p className="text-gray-500 font-medium">Henüz bir kök neden analizi girilmemiş.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                            {whys.map(why => (
                                <div 
                                    key={why.id} 
                                    onClick={() => setViewingWhy(why)}
                                    className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5 cursor-pointer hover:border-rose-400 dark:hover:border-rose-500 hover:shadow-md transition-all group flex flex-col"
                                >
                                    <div className="flex items-start gap-3 mb-3">
                                        <div className="bg-rose-100 dark:bg-rose-900/30 p-2.5 rounded-lg text-rose-600 dark:text-rose-400 shrink-0">
                                            <HelpCircle className="w-6 h-6" />
                                        </div>
                                        <h3 className="font-bold text-gray-900 dark:text-white text-base line-clamp-2">{why.problem}</h3>
                                    </div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-4 line-clamp-2 flex-1">
                                        <span className="font-bold text-gray-700 dark:text-gray-300 mr-1">Kök Neden:</span>
                                        {why.rootCause || '-'}
                                    </div>
                                    <div className="flex items-center justify-between mt-auto pt-3 border-t border-gray-100 dark:border-gray-700 text-[10px] text-gray-500 font-bold">
                                        <span className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">{why.createdAt.split(' ')[0]}</span>
                                        <span className="truncate max-w-[100px] text-right">{why.reportedBy}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            );
        }
        if (activeTab === 'ROI') {
            return (
                <div className="space-y-6 animate-in fade-in">
                    {/* FABRİKA KAPASİTE ETKİSİ ÖZETİ */}
                    <div className="bg-gradient-to-br from-emerald-600 to-teal-700 rounded-xl p-6 shadow-lg text-white relative overflow-hidden">
                        <div className="absolute top-0 right-0 opacity-10">
                            <TrendingDown className="w-48 h-48 -mt-10 -mr-10" />
                        </div>
                        <div className="relative z-10">
                            <div className="flex justify-between items-start mb-4">
                                <h3 className="text-xl font-black flex items-center">
                                    <Factory className="w-6 h-6 mr-2" /> Yıllık Fabrika Kapasite Etkisi
                                </h3>
                                <button 
                                    onClick={() => setIsFactorySettingsOpen(true)}
                                    className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition"
                                    title="Fabrika Parametrelerini Ayarla"
                                >
                                    <Settings className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div className="bg-black/20 p-4 rounded-xl">
                                    <div className="text-emerald-100 text-xs font-bold uppercase mb-1">Toplam Yıllık Kazanç (Süre)</div>
                                    <div className="text-3xl font-black">{factoryImpact.totalAnnualHoursSaved.toFixed(0)} <span className="text-sm font-medium">Saat/Yıl</span></div>
                                </div>
                                <div className="bg-black/20 p-4 rounded-xl">
                                    <div className="text-emerald-100 text-xs font-bold uppercase mb-1">Fabrika Mevcut Kapasitesi</div>
                                    <div className="text-3xl font-black">{factoryImpact.totalFactoryCapacity.toLocaleString('tr-TR')} <span className="text-sm font-medium">Saat/Yıl</span></div>
                                </div>
                                <div className="bg-white/20 p-4 rounded-xl border border-white/30 backdrop-blur-sm shadow-sm">
                                    <div className="text-white text-xs font-bold uppercase mb-1">Kapasite Artış Oranı</div>
                                    <div className="text-3xl font-black text-yellow-300">+{factoryImpact.capacityIncreasePercent.toFixed(2)}%</div>
                                </div>
                            </div>
                            <p className="text-xs text-emerald-100 mt-4 opacity-80">
                                Hesaplama Parametreleri: {factorySettings.machinesCount} Tezgah x {factorySettings.workingDays} Gün x {factorySettings.dailyHours} Saat
                            </p>
                        </div>
                    </div>

                    <div className="flex justify-between items-center bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                        <div>
                            <h2 className="text-xl font-bold text-gray-800 dark:text-white flex items-center">
                                <Coins className="w-6 h-6 mr-2 text-emerald-500" /> Kapasite & ROI (Kazanç) Analizi
                            </h2>
                            <p className="text-sm text-gray-500 mt-1">İyileştirmelerin sağladığı zaman tasarrufu, kapasite artışı ve yatırımın geri dönüş süresi (Amortisman).</p>
                        </div>
                        <button onClick={() => setIsRoiModalOpen(true)} className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-lg shadow-md transition flex items-center">
                            <Plus className="w-5 h-5 mr-2"/> Yeni Analiz
                        </button>
                    </div>

                    {rois.length === 0 ? (
                        <div className="text-center py-20 bg-white dark:bg-gray-800 rounded-xl border border-dashed border-gray-300 dark:border-gray-700">
                            <Coins className="w-16 h-16 mx-auto text-gray-300 mb-4 opacity-50" />
                            <p className="text-gray-500 font-medium">Henüz bir kazanç / ROI analizi girilmemiş.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                            {rois.map(roi => (
                                <div 
                                    key={roi.id} 
                                    onClick={() => setViewingRoi(roi)}
                                    className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5 cursor-pointer hover:border-emerald-400 dark:hover:border-emerald-500 hover:shadow-md transition-all group flex flex-col"
                                >
                                    <div className="flex items-start gap-3 mb-4 border-b border-gray-100 dark:border-gray-700 pb-3">
                                        <div className="bg-emerald-100 dark:bg-emerald-900/30 p-2.5 rounded-lg text-emerald-600 dark:text-emerald-400 shrink-0">
                                            <TrendingDown className="w-6 h-6" />
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-gray-900 dark:text-white text-base line-clamp-2 leading-tight">{roi.title}</h3>
                                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{roi.partName}</p>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3 mb-4">
                                        <div className="bg-gray-50 dark:bg-gray-900 p-2 rounded-lg text-center">
                                            <div className="text-[10px] font-bold text-gray-500 uppercase">Kapasite Kazancı</div>
                                            <div className="font-black text-blue-600 dark:text-blue-400">+{roi.annualHoursSaved ? roi.annualHoursSaved.toFixed(0) : (roi.monthlyHoursSaved * 12)?.toFixed(0)} Sa/Yıl</div>
                                        </div>
                                        <div className="bg-emerald-50 dark:bg-emerald-900/20 p-2 rounded-lg text-center border border-emerald-100 dark:border-emerald-800">
                                            <div className="text-[10px] font-bold text-emerald-600 uppercase">Finansal Kazanç</div>
                                            <div className="font-black text-emerald-700 dark:text-emerald-400">+{Intl.NumberFormat('tr-TR').format(roi.annualGain || (roi.monthlyGain * 12))} €/Yıl</div>
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between mt-auto pt-3 border-t border-gray-100 dark:border-gray-700 text-[10px] text-gray-500 font-bold">
                                        <span className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">{roi.createdAt.split(' ')[0]}</span>
                                        <span className={`${roi.roiMonths > 0 ? 'text-orange-500' : 'text-gray-400'}`}>
                                            {roi.roiMonths > 0 ? `Amortisman: ${roi.roiMonths.toFixed(1)} Ay` : 'Yatırımsız Kazanç'}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            );
        }

        return (
            <div className="space-y-6 animate-in fade-in">
                <div className="flex justify-between items-center bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                    <div>
                        <h2 className="text-xl font-bold text-gray-800 dark:text-white flex items-center">
                            <Lightbulb className="w-6 h-6 mr-2 text-yellow-500" /> Önce / Sonra (Kaizen) Panosu
                        </h2>
                        <p className="text-sm text-gray-500 mt-1">Sahadaki problemleri ve bulduğunuz pratik çözümleri görselleştirin.</p>
                    </div>
                    <button 
                        onClick={() => setIsModalOpen(true)}
                        className="px-5 py-2.5 bg-yellow-500 hover:bg-yellow-600 text-white font-bold rounded-lg shadow-md transition flex items-center"
                    >
                        <Plus className="w-5 h-5 mr-2"/> Yeni Kaizen Ekle
                    </button>
                </div>

                {loading ? (
                    <div className="text-center py-10 text-gray-500">Yükleniyor...</div>
                ) : kaizens.length === 0 ? (
                    <div className="text-center py-20 bg-white dark:bg-gray-800 rounded-xl border border-dashed border-gray-300 dark:border-gray-700">
                        <Lightbulb className="w-16 h-16 mx-auto text-gray-300 mb-4 opacity-50" />
                        <p className="text-gray-500 font-medium">Henüz bir Kaizen (İyileştirme) girilmemiş.</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {kaizens.map(kz => {
                            const isExpanded = expandedKaizenId === kz.id;
                            const isOwnerOrAdmin = loggedInUser && (
                                loggedInUser.role === 'Yönetici' || 
                                loggedInUser.role === 'Admin' || 
                                kz.reportedById === loggedInUser.id || 
                                kz.reportedBy === loggedInUser.name
                            );

                            return (
                                <div key={kz.id} className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden transition-all duration-300">
                                    {/* Liste Satırı (Başlık, İsim ve Özet) */}
                                    <div 
                                        onClick={() => setExpandedKaizenId(isExpanded ? null : kz.id)}
                                        className="p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 cursor-pointer hover:bg-gray-50/50 dark:hover:bg-gray-750/30 transition-colors select-none"
                                    >
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="text-lg font-extrabold text-gray-900 dark:text-white hover:text-indigo-600 transition-colors truncate">
                                                    {kz.title}
                                                </span>
                                                <span className="bg-yellow-100 dark:bg-yellow-950/45 text-yellow-800 dark:text-yellow-400 text-[10px] font-black px-2 py-0.5 rounded uppercase">
                                                    {kz.benefitType}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-4 text-xs font-bold text-gray-400 dark:text-gray-500 mt-1 uppercase">
                                                <span>Öneren: <strong className="text-gray-700 dark:text-gray-300 font-extrabold">{kz.reportedBy}</strong></span>
                                                <span>•</span>
                                                <span>{formatDateTime(kz.createdAt).split(' ')[0]}</span>
                                                {kz.evaluation && (
                                                    <>
                                                        <span>•</span>
                                                        <span className="text-purple-600 dark:text-purple-400 flex items-center font-black">
                                                            <Award className="w-3.5 h-3.5 mr-0.5" /> Değerlendirildi
                                                        </span>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                        
                                        <div className="flex items-center gap-3 self-end sm:self-center shrink-0">
                                            {isExpanded ? (
                                                <span className="text-xs font-black text-indigo-600 dark:text-indigo-400 flex items-center gap-1 bg-indigo-50 dark:bg-indigo-950/30 px-3 py-1.5 rounded-lg border border-indigo-200/50 dark:border-indigo-900/50">
                                                    Detayları Kapat <ChevronUp className="w-4 h-4" />
                                                </span>
                                            ) : (
                                                <span className="text-xs font-black text-gray-500 dark:text-gray-400 flex items-center gap-1 bg-gray-50 dark:bg-gray-750 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700">
                                                    Detayları Göster <ChevronDown className="w-4 h-4" />
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Genişleyen Detay (A3 Formu Tasarımı) */}
                                    {isExpanded && (
                                        <div className="border-t border-gray-150 dark:border-gray-700 transition-all duration-300">
                                            {/* A3 Formu Tasarımı (Burası PDF'e dönüşecek) */}
                                            <div id={`kaizen-card-${kz.id}`} className="bg-white text-gray-900 p-6">
                                                {/* A3 Rapor Başlığı */}
                                                <div className="border-b-2 border-gray-800 pb-3 mb-4 flex justify-between items-end">
                                                    <div>
                                                        <h3 className="text-2xl font-black uppercase tracking-tight text-gray-900">{kz.title}</h3>
                                                        <div className="flex items-center flex-wrap gap-y-1 text-xs font-bold text-gray-500 mt-1 uppercase">
                                                            <span className="bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded mr-3">KAIZEN / ÖNCE-SONRA</span>
                                                            <Calendar className="w-3 h-3 mr-1"/> {formatDateTime(kz.createdAt).split(' ')[0]}
                                                            {kz.evaluation && (
                                                                <span className="bg-purple-100 text-purple-800 border border-purple-200 px-2 py-0.5 rounded ml-0 md:ml-3 mt-1 md:mt-0 flex items-center shadow-sm">
                                                                    <Award className="w-3.5 h-3.5 mr-1" /> Değerlendirme: {kz.evaluation}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="flex flex-col items-end gap-1">
                                                        {(loggedInUser?.role === 'Yönetici' || loggedInUser?.role === 'Admin') && (
                                                            <button 
                                                                onClick={() => handleEvaluateKaizen(kz)}
                                                                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-[10px] font-extrabold uppercase transition shadow-sm flex items-center gap-1 shrink-0"
                                                                data-html2canvas-ignore="true"
                                                            >
                                                                <MessageSquare className="w-3.5 h-3.5" /> Değerlendir
                                                            </button>
                                                        )}
                                                        <div className="text-right text-xs font-bold text-gray-500 mt-1">
                                                            Öneren / Yapan:
                                                        </div>
                                                        <div className="text-sm text-gray-900 bg-gray-100 px-3 py-1 rounded font-black mt-0.5 inline-block whitespace-nowrap">
                                                            {kz.reportedBy}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                    {/* ÖNCEKI DURUM */}
                                                    <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex flex-col h-full">
                                                        <div className="font-black text-red-700 uppercase mb-2 flex items-center border-b border-red-200 pb-2">
                                                            <X className="w-5 h-5 mr-1"/> Mevcut Problem (Önce)
                                                        </div>
                                                        {kz.beforeImageUrl ? (
                                                            <div 
                                                                className="w-full h-64 bg-gray-100 rounded-lg overflow-hidden mb-3 border border-red-200 shadow-sm shrink-0 cursor-pointer hover:opacity-90 transition-opacity flex items-center justify-center"
                                                                onClick={() => setPreviewImage(kz.beforeImageUrl)}
                                                            >
                                                                <img src={kz.beforeImageUrl} alt="Önce" className="max-w-full max-h-full object-contain" crossOrigin="anonymous"/>
                                                            </div>
                                                        ) : (
                                                            <div className="w-full h-64 bg-red-50 rounded-lg flex items-center justify-center text-red-300 mb-3 border border-red-200 shrink-0">
                                                                <ImageIcon className="w-10 h-10" />
                                                            </div>
                                                        )}
                                                        <p className="text-sm font-medium text-gray-800 flex-1 whitespace-pre-wrap">{kz.problem}</p>
                                                    </div>

                                                    {/* SONRAKİ DURUM */}
                                                    <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex flex-col h-full">
                                                        <div className="font-black text-green-700 uppercase mb-2 flex items-center border-b border-green-200 pb-2">
                                                            <CheckSquare className="w-5 h-5 mr-1"/> Çözüm (Sonra)
                                                        </div>
                                                        {kz.afterImageUrl ? (
                                                            <div 
                                                                className="w-full h-64 bg-gray-100 rounded-lg overflow-hidden mb-3 border border-green-200 shadow-sm shrink-0 cursor-pointer hover:opacity-90 transition-opacity flex items-center justify-center"
                                                                onClick={() => setPreviewImage(kz.afterImageUrl)}
                                                            >
                                                                <img src={kz.afterImageUrl} alt="Sonra" className="max-w-full max-h-full object-contain" crossOrigin="anonymous"/>
                                                            </div>
                                                        ) : (
                                                            <div className="w-full h-64 bg-green-50 rounded-lg flex items-center justify-center text-green-300 mb-3 border border-green-200 shrink-0">
                                                                <ImageIcon className="w-10 h-10" />
                                                            </div>
                                                        )}
                                                        <p className="text-sm font-medium text-gray-800 flex-1 whitespace-pre-wrap">{kz.solution}</p>
                                                    </div>
                                                </div>

                                                {/* KAZANÇ / SONUÇ */}
                                                <div className="mt-6 bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start">
                                                    <Award className="w-8 h-8 text-blue-500 mr-4 shrink-0" />
                                                    <div>
                                                        <div className="font-black text-blue-800 uppercase mb-1 flex items-center">
                                                            Sağlanan Fayda: <span className="ml-2 bg-blue-600 text-white px-2 py-0.5 rounded text-xs">{kz.benefitType}</span>
                                                        </div>
                                                        <p className="text-sm font-bold text-gray-700">{kz.benefitDescription || 'Belirtilmedi'}</p>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* SADECE EKRANDA GÖRÜNEN BUTONLAR (PDF'TE GİZLENİR) */}
                                            <div className="bg-gray-50 dark:bg-gray-900 border-t dark:border-gray-700 p-4 flex justify-between items-center" data-html2canvas-ignore="true">
                                                <div>
                                                    <button 
                                                        onClick={() => handleDownloadPdf(kz.id)}
                                                        className="px-4 py-2 bg-blue-100 dark:bg-blue-900/30 hover:bg-blue-200 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-400 font-bold rounded-lg transition text-xs flex items-center gap-1"
                                                    >
                                                        <Download className="w-4 h-4"/> A3 Rapor İndir
                                                    </button>
                                                </div>
                                                
                                                <div className="flex gap-2">
                                                    {isOwnerOrAdmin && (
                                                        <>
                                                            <button 
                                                                onClick={() => openEditKaizen(kz)}
                                                                className="px-3.5 py-2 bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-250 dark:border-yellow-900/50 hover:bg-yellow-100 dark:hover:bg-yellow-950/45 text-yellow-700 dark:text-yellow-400 font-bold rounded-lg transition text-xs flex items-center gap-1.5"
                                                            >
                                                                <Edit2 className="w-3.5 h-3.5" /> Düzenle
                                                            </button>
                                                            <button 
                                                                onClick={() => handleDeleteKaizen(kz.id)}
                                                                className="px-3.5 py-2 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 hover:bg-red-100 dark:hover:bg-red-950/45 text-red-650 dark:text-red-400 font-bold rounded-lg transition text-xs flex items-center gap-1"
                                                                title="Kaizen Raporunu Sil"
                                                            >
                                                                <Trash2 className="w-3.5 h-3.5 mr-1" /> Sil
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="p-4 md:p-6 max-w-7xl mx-auto min-h-screen bg-gray-100 dark:bg-gray-900 font-sans">
            
            <div className="mb-6">
                <h1 className="text-3xl font-extrabold text-gray-900 dark:text-white flex items-center">
                    <Target className="w-8 h-8 mr-3 text-indigo-500" /> Sürekli İyileştirme (CI)
                </h1>
                <p className="text-gray-500 dark:text-gray-400 mt-1">Fabrika genelindeki iyileştirme projeleri, 5S denetimleri ve kök neden analizleri.</p>
            </div>

            {/* SEKME MENÜSÜ */}
            <div className="flex bg-white dark:bg-gray-800 p-1 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 w-fit mb-6">
                <button onClick={() => setActiveTab('KAIZEN')} className={`px-6 py-2.5 rounded-lg font-bold transition flex items-center ${activeTab === 'KAIZEN' ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300' : 'text-gray-500 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-700'}`}>
                    Kaizen (Önce/Sonra)
                </button>
                <button onClick={() => setActiveTab('5S')} className={`px-6 py-2.5 rounded-lg font-bold transition flex items-center ${activeTab === '5S' ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300' : 'text-gray-500 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-700'}`}>
                    5S Denetimleri
                </button>
                <button onClick={() => setActiveTab('5WHY')} className={`px-6 py-2.5 rounded-lg font-bold transition flex items-center ${activeTab === '5WHY' ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300' : 'text-gray-500 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-700'}`}>
                    5 Neden Analizi
                </button>
                <button onClick={() => setActiveTab('ROI')} className={`px-6 py-2.5 rounded-lg font-bold transition flex items-center ${activeTab === 'ROI' ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300' : 'text-gray-500 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-700'}`}>
                    Kapasite & ROI
                </button>
            </div>

            {/* İÇERİK */}
            {renderTabContent()}

            {/* YENİ KAIZEN MODALI */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col overflow-hidden max-h-[90vh]">
                        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900">
                            <h2 className="text-lg font-black text-gray-800 dark:text-white flex items-center">
                                <Lightbulb className="w-5 h-5 mr-2 text-yellow-500" /> {editingKaizenId ? 'İyileştirmeyi (Kaizen) Düzenle' : 'Yeni İyileştirme (Kaizen) Formu'}
                            </h2>
                            <button onClick={closeKaizenModal} className="text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 p-2 rounded-xl transition">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto flex-1 space-y-5">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">İyileştirme Başlığı *</label>
                                <input 
                                    type="text" 
                                    className="w-full p-2.5 border rounded-lg bg-gray-50 dark:bg-gray-700 dark:text-white outline-none focus:ring-2 focus:ring-yellow-500 font-bold"
                                    placeholder="Örn: Torna Takım Dolabı Düzeni"
                                    value={formData.title}
                                    onChange={e => setFormData({...formData, title: e.target.value})}
                                />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* ÖNCE */}
                                <div className="space-y-3 p-4 bg-red-50 dark:bg-red-900/10 rounded-xl border border-red-200 dark:border-red-800/50">
                                    <label className="block text-xs font-black text-red-700 dark:text-red-400 uppercase flex items-center">
                                        <X className="w-4 h-4 mr-1"/> Mevcut Durum (Önce) *
                                    </label>
                                    <textarea 
                                        className="w-full p-2.5 border border-red-200 rounded-lg outline-none text-sm resize-none dark:bg-gray-800 dark:text-white focus:ring-1 focus:ring-red-500"
                                        rows="3"
                                        placeholder="Problem nedir?"
                                        value={formData.problem}
                                        onChange={e => setFormData({...formData, problem: e.target.value})}
                                    ></textarea>
                                    <div>
                                        <label className="block text-[10px] font-bold text-red-500 mb-1">Öncesi Fotoğrafı (Opsiyonel)</label>
                                        <input 
                                            type="file" 
                                            accept="image/*"
                                            onChange={e => setBeforeImage(e.target.files[0])}
                                            className="w-full text-xs text-gray-500 file:mr-4 file:py-1 file:px-3 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-red-100 file:text-red-700 hover:file:bg-red-200"
                                        />
                                    </div>
                                </div>

                                {/* SONRA */}
                                <div className="space-y-3 p-4 bg-green-50 dark:bg-green-900/10 rounded-xl border border-green-200 dark:border-green-800/50">
                                    <label className="block text-xs font-black text-green-700 dark:text-green-400 uppercase flex items-center">
                                        <CheckSquare className="w-4 h-4 mr-1"/> Çözüm (Sonra) *
                                    </label>
                                    <textarea 
                                        className="w-full p-2.5 border border-green-200 rounded-lg outline-none text-sm resize-none dark:bg-gray-800 dark:text-white focus:ring-1 focus:ring-green-500"
                                        rows="3"
                                        placeholder="Nasıl çözüldü?"
                                        value={formData.solution}
                                        onChange={e => setFormData({...formData, solution: e.target.value})}
                                    ></textarea>
                                    <div>
                                        <label className="block text-[10px] font-bold text-green-500 mb-1">Sonrası Fotoğrafı (Opsiyonel)</label>
                                        <input 
                                            type="file" 
                                            accept="image/*"
                                            onChange={e => setAfterImage(e.target.files[0])}
                                            className="w-full text-xs text-gray-500 file:mr-4 file:py-1 file:px-3 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-green-100 file:text-green-700 hover:file:bg-green-200"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="p-4 bg-blue-50 dark:bg-blue-900/10 rounded-xl border border-blue-200 dark:border-blue-800/50">
                                <label className="block text-xs font-black text-blue-700 dark:text-blue-400 uppercase mb-3 flex items-center">
                                    <Award className="w-4 h-4 mr-1"/> Sağlanan Fayda / Kazanç
                                </label>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-[10px] font-bold text-blue-500 mb-1">Fayda Kategorisi</label>
                                        <select 
                                            className="w-full p-2 border border-blue-200 rounded-lg outline-none text-sm dark:bg-gray-800 dark:text-white font-bold"
                                            value={formData.benefitType}
                                            onChange={e => setFormData({...formData, benefitType: e.target.value})}
                                        >
                                            <option>Zaman Tasarrufu</option>
                                            <option>Maliyet Tasarrufu</option>
                                            <option>İş Güvenliği</option>
                                            <option>Kalite Artışı</option>
                                            <option>5S ve Düzen</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold text-blue-500 mb-1">Kısaca Açıklayın</label>
                                        <input 
                                            type="text" 
                                            className="w-full p-2 border border-blue-200 rounded-lg outline-none text-sm dark:bg-gray-800 dark:text-white"
                                            placeholder="Örn: Günde 10 dk arama süresi bitti."
                                            value={formData.benefitDescription}
                                            onChange={e => setFormData({...formData, benefitDescription: e.target.value})}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 flex justify-end gap-3">
                            <button 
                                onClick={closeKaizenModal}
                                className="px-5 py-2.5 text-gray-600 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 rounded-lg font-bold transition"
                            >
                                İptal
                            </button>
                            <button 
                                onClick={handleSaveKaizen}
                                disabled={isSaving}
                                className="px-6 py-2.5 bg-yellow-500 hover:bg-yellow-600 text-white font-bold rounded-lg shadow-md transition flex items-center disabled:opacity-50"
                            >
                                <Save className="w-4 h-4 mr-2"/> {isSaving ? 'Yükleniyor...' : 'Kaizen Raporunu Kaydet'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* FABRİKA AYARLARI MODALI */}
            {isFactorySettingsOpen && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-sm shadow-2xl flex flex-col overflow-hidden">
                        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900">
                            <h2 className="text-lg font-black text-gray-800 dark:text-white flex items-center">
                                <Factory className="w-5 h-5 mr-2 text-emerald-500" /> Fabrika Parametreleri
                            </h2>
                            <button onClick={() => setIsFactorySettingsOpen(false)} className="text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 p-2 rounded-xl transition">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Toplam Tezgah Sayısı</label>
                                <input 
                                    type="number" 
                                    value={factorySettings.machinesCount} 
                                    onChange={e => setFactorySettings({...factorySettings, machinesCount: parseInt(e.target.value) || 0})}
                                    className="w-full p-2.5 border rounded-lg dark:bg-gray-700 dark:text-white outline-none font-bold focus:ring-2 focus:ring-emerald-500"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Yıllık Çalışma Günü</label>
                                <input 
                                    type="number" 
                                    value={factorySettings.workingDays} 
                                    onChange={e => setFactorySettings({...factorySettings, workingDays: parseInt(e.target.value) || 0})}
                                    className="w-full p-2.5 border rounded-lg dark:bg-gray-700 dark:text-white outline-none font-bold focus:ring-2 focus:ring-emerald-500"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Günlük Çalışma Saati</label>
                                <input 
                                    type="number" 
                                    value={factorySettings.dailyHours} 
                                    onChange={e => setFactorySettings({...factorySettings, dailyHours: parseInt(e.target.value) || 0})}
                                    className="w-full p-2.5 border rounded-lg dark:bg-gray-700 dark:text-white outline-none font-bold focus:ring-2 focus:ring-emerald-500"
                                />
                            </div>
                        </div>
                        <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 flex justify-end gap-3">
                            <button onClick={() => setIsFactorySettingsOpen(false)} className="px-5 py-2.5 text-gray-600 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 rounded-lg font-bold transition">İptal</button>
                            <button onClick={() => handleSaveFactorySettings(factorySettings)} className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow-md transition">Kaydet</button>
                        </div>
                    </div>
                </div>
            )}

            {/* YENİ 5S DENETİM MODALI */}
            {is5sModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col overflow-hidden max-h-[90vh]">
                        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900">
                            <h2 className="text-lg font-black text-gray-800 dark:text-white flex items-center">
                                <CheckSquare className="w-5 h-5 mr-2 text-indigo-500" /> {editing5sId ? '5S Denetimini Düzenle' : 'Yeni 5S Denetimi'}
                            </h2>
                            <button onClick={close5sModal} className="text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 p-2 rounded-xl transition">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6 overflow-y-auto flex-1 space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Denetim Alanı *</label>
                                <input type="text" className="w-full p-2.5 border rounded-lg bg-gray-50 dark:bg-gray-700 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 font-bold" placeholder="Örn: Kalıphane Montaj Masası" value={formData5s.area} onChange={e => setFormData5s({...formData5s, area: e.target.value})} />
                            </div>
                            
                            <div className="bg-indigo-50 dark:bg-indigo-900/10 p-4 rounded-xl border border-indigo-100 dark:border-indigo-800/50 space-y-4">
                                <p className="text-xs font-black text-indigo-800 dark:text-indigo-300 uppercase text-center border-b border-indigo-200 dark:border-indigo-800 pb-2">Puanlama (0 ile 5 Arası)</p>
                                <div className="grid grid-cols-2 gap-4">
                                    <div><label className="block text-[10px] font-bold text-gray-600 dark:text-gray-400 mb-1">1. Sınıflandırma (Seiri)</label><input type="number" min="0" max="5" className="w-full p-2 border rounded-lg dark:bg-gray-700 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-center" value={formData5s.score1} onChange={e => setFormData5s({...formData5s, score1: e.target.value})} /></div>
                                    <div><label className="block text-[10px] font-bold text-gray-600 dark:text-gray-400 mb-1">2. Düzenleme (Seiton)</label><input type="number" min="0" max="5" className="w-full p-2 border rounded-lg dark:bg-gray-700 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-center" value={formData5s.score2} onChange={e => setFormData5s({...formData5s, score2: e.target.value})} /></div>
                                    <div><label className="block text-[10px] font-bold text-gray-600 dark:text-gray-400 mb-1">3. Temizlik (Seiso)</label><input type="number" min="0" max="5" className="w-full p-2 border rounded-lg dark:bg-gray-700 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-center" value={formData5s.score3} onChange={e => setFormData5s({...formData5s, score3: e.target.value})} /></div>
                                    <div><label className="block text-[10px] font-bold text-gray-600 dark:text-gray-400 mb-1">4. Standartlaştırma (Seiketsu)</label><input type="number" min="0" max="5" className="w-full p-2 border rounded-lg dark:bg-gray-700 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-center" value={formData5s.score4} onChange={e => setFormData5s({...formData5s, score4: e.target.value})} /></div>
                                    <div className="col-span-2"><label className="block text-[10px] font-bold text-gray-600 dark:text-gray-400 mb-1">5. Disiplin (Shitsuke)</label><input type="number" min="0" max="5" className="w-full p-2 border rounded-lg dark:bg-gray-700 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-center" value={formData5s.score5} onChange={e => setFormData5s({...formData5s, score5: e.target.value})} /></div>
                                </div>
                            </div>
                            
                            <div>
                                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Notlar ve Eksikler</label>
                                <textarea className="w-full p-2.5 border rounded-lg dark:bg-gray-700 dark:text-white outline-none resize-none focus:ring-2 focus:ring-indigo-500" rows="3" placeholder="Görülen aksaklıklar ve yapılması gerekenler..." value={formData5s.notes} onChange={e => setFormData5s({...formData5s, notes: e.target.value})}></textarea>
                            </div>
                        </div>
                        <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 flex justify-end gap-3">
                            <button onClick={close5sModal} className="px-5 py-2.5 text-gray-600 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 rounded-lg font-bold transition">İptal</button>
                            <button onClick={handleSave5s} disabled={isSaving} className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-md transition flex items-center disabled:opacity-50"><Save className="w-4 h-4 mr-2"/> {isSaving ? 'Kaydediliyor...' : 'Denetimi Kaydet'}</button>
                        </div>
                    </div>
                </div>
            )}

            {/* YENİ 5 NEDEN MODALI */}
            {isWhyModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col overflow-hidden max-h-[90vh]">
                        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900">
                            <h2 className="text-lg font-black text-gray-800 dark:text-white flex items-center">
                                <HelpCircle className="w-5 h-5 mr-2 text-rose-500" /> {editingWhyId ? 'Kök Neden Analizini Düzenle' : 'Yeni Kök Neden Analizi (5 Neden)'}
                            </h2>
                            <button onClick={closeWhyModal} className="text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 p-2 rounded-xl transition">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        
                        <div className="p-6 overflow-y-auto flex-1 space-y-5">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Problem Tanımı *</label>
                                <input type="text" className="w-full p-2.5 border rounded-lg bg-gray-50 dark:bg-gray-700 dark:text-white outline-none focus:ring-2 focus:ring-rose-500 font-bold" placeholder="Örn: CNC tezgahında parça ölçüden çıktı" value={formDataWhy.problem} onChange={e => setFormDataWhy({...formDataWhy, problem: e.target.value})} />
                            </div>

                            <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-xl border border-gray-200 dark:border-gray-700 space-y-3">
                                <p className="text-xs font-black text-gray-500 dark:text-gray-400 uppercase mb-2">Problemin Nedenlerini Sorgulayın</p>
                                
                                <div className="flex gap-2">
                                    <span className="font-bold text-rose-500 mt-2 shrink-0">1. Neden?</span>
                                    <input type="text" className="w-full p-2 border rounded-lg dark:bg-gray-800 dark:text-white outline-none focus:border-rose-400 text-sm" placeholder="Problem neden oldu?" value={formDataWhy.why1} onChange={e => setFormDataWhy({...formDataWhy, why1: e.target.value})} />
                                </div>
                                <div className="flex gap-2 ml-4">
                                    <span className="font-bold text-rose-500 mt-2 shrink-0">2. Neden?</span>
                                    <input type="text" className="w-full p-2 border rounded-lg dark:bg-gray-800 dark:text-white outline-none focus:border-rose-400 text-sm" placeholder="1. Neden'deki durum neden oldu?" value={formDataWhy.why2} onChange={e => setFormDataWhy({...formDataWhy, why2: e.target.value})} />
                                </div>
                                <div className="flex gap-2 ml-8">
                                    <span className="font-bold text-rose-500 mt-2 shrink-0">3. Neden?</span>
                                    <input type="text" className="w-full p-2 border rounded-lg dark:bg-gray-800 dark:text-white outline-none focus:border-rose-400 text-sm" placeholder="2. Neden'deki durum neden oldu?" value={formDataWhy.why3} onChange={e => setFormDataWhy({...formDataWhy, why3: e.target.value})} />
                                </div>
                                <div className="flex gap-2 ml-12">
                                    <span className="font-bold text-rose-500 mt-2 shrink-0">4. Neden?</span>
                                    <input type="text" className="w-full p-2 border rounded-lg dark:bg-gray-800 dark:text-white outline-none focus:border-rose-400 text-sm" placeholder="3. Neden'deki durum neden oldu?" value={formDataWhy.why4} onChange={e => setFormDataWhy({...formDataWhy, why4: e.target.value})} />
                                </div>
                                <div className="flex gap-2 ml-16">
                                    <span className="font-bold text-rose-500 mt-2 shrink-0">5. Neden?</span>
                                    <input type="text" className="w-full p-2 border rounded-lg dark:bg-gray-800 dark:text-white outline-none focus:border-rose-400 text-sm" placeholder="4. Neden'deki durum neden oldu?" value={formDataWhy.why5} onChange={e => setFormDataWhy({...formDataWhy, why5: e.target.value})} />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="bg-rose-50 dark:bg-rose-900/10 p-4 rounded-xl border border-rose-200 dark:border-rose-800/50">
                                    <label className="block text-xs font-black text-rose-700 dark:text-rose-400 uppercase mb-2">Bulunan Kök Neden</label>
                                    <textarea className="w-full p-2.5 border border-rose-200 dark:border-rose-700 rounded-lg outline-none text-sm resize-none dark:bg-gray-800 dark:text-white focus:ring-1 focus:ring-rose-500" rows="2" placeholder="Gerçek sorunun kaynağı nedir?" value={formDataWhy.rootCause} onChange={e => setFormDataWhy({...formDataWhy, rootCause: e.target.value})}></textarea>
                                </div>
                                <div className="bg-green-50 dark:bg-green-900/10 p-4 rounded-xl border border-green-200 dark:border-green-800/50">
                                    <label className="block text-xs font-black text-green-700 dark:text-green-400 uppercase mb-2">Alınan / Alınacak Aksiyon</label>
                                    <textarea className="w-full p-2.5 border border-green-200 dark:border-green-700 rounded-lg outline-none text-sm resize-none dark:bg-gray-800 dark:text-white focus:ring-1 focus:ring-green-500" rows="2" placeholder="Sorunu kalıcı olarak nasıl çözeceğiz?" value={formDataWhy.actionTaken} onChange={e => setFormDataWhy({...formDataWhy, actionTaken: e.target.value})}></textarea>
                                </div>
                            </div>
                        </div>

                        <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 flex justify-end gap-3">
                            <button onClick={closeWhyModal} className="px-5 py-2.5 text-gray-600 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 rounded-lg font-bold transition">İptal</button>
                            <button onClick={handleSaveWhy} disabled={isSaving} className="px-6 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg shadow-md transition flex items-center disabled:opacity-50"><Save className="w-4 h-4 mr-2"/> {isSaving ? 'Kaydediliyor...' : 'Analizi Kaydet'}</button>
                        </div>
                    </div>
                </div>
            )}

            {/* 5 NEDEN TAM EKRAN GÖRÜNTÜLEME MODALI */}
            {viewingWhy && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in zoom-in duration-200">
                    <div className="bg-gray-100 dark:bg-gray-900 rounded-2xl w-full max-w-5xl shadow-2xl flex flex-col overflow-hidden max-h-[95vh]">
                        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-white dark:bg-gray-800 shrink-0">
                            <h2 className="text-lg font-black text-gray-800 dark:text-white flex items-center">
                                <HelpCircle className="w-5 h-5 mr-2 text-rose-500" /> Kök Neden Analizi (5 Neden) Detayı
                            </h2>
                            <button onClick={() => setViewingWhy(null)} className="text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 p-2 rounded-xl transition">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        
                        <div className="overflow-y-auto flex-1 p-2 md:p-4 flex flex-col justify-center">
                            <div id={`why-card-${viewingWhy.id}`} className="bg-white text-gray-900 p-4 md:p-6 shadow-sm rounded-xl border border-gray-200 w-full max-w-4xl mx-auto">
                                {/* Rapor Başlığı */}
                                <div className="border-b-2 border-gray-800 pb-2 md:pb-3 mb-4 flex justify-between items-end">
                                    <div>
                                        <h3 className="text-xl md:text-2xl font-black uppercase tracking-tight text-gray-900">{viewingWhy.problem}</h3>
                                        <div className="flex items-center text-xs md:text-sm font-bold text-gray-500 mt-2 uppercase">
                                            <span className="bg-rose-100 text-rose-800 px-2 py-0.5 rounded mr-3">5 NEDEN SORGULAMASI</span>
                                            <Calendar className="w-4 h-4 mr-1"/> {formatDateTime(viewingWhy.createdAt).split(' ')[0]}
                                        </div>
                                    </div>
                                    <div className="text-right text-[10px] md:text-xs font-bold text-gray-500">
                                        <div className="mb-1">Raporlayan / Ekip:</div>
                                        <div className="text-sm md:text-base text-gray-900 bg-gray-100 px-3 py-1 rounded">{viewingWhy.reportedBy}</div>
                                    </div>
                                </div>

                                {/* Akış Şeması (Flowchart) */}
                                <div className="flex flex-col items-center max-w-3xl mx-auto">
                                    
                                    <div className="w-full bg-rose-50 border-2 border-rose-200 p-3 rounded-xl text-center relative z-10 shadow-sm">
                                        <div className="text-[10px] md:text-xs font-black text-rose-600 uppercase mb-1">Mevcut Problem</div>
                                        <div className="text-lg md:text-xl font-bold text-gray-800">{viewingWhy.problem}</div>
                                    </div>

                                    {[viewingWhy.why1, viewingWhy.why2, viewingWhy.why3, viewingWhy.why4, viewingWhy.why5].map((whyText, index) => whyText && (
                                        <React.Fragment key={`flow-${index}`}>
                                            <div className="w-1 h-3 md:h-4 bg-gray-300"></div>
                                            <div className="w-0 h-0 border-l-[5px] border-r-[5px] border-t-[6px] border-l-transparent border-r-transparent border-t-gray-300"></div>
                                            <div className="w-11/12 bg-white border-2 border-gray-200 p-2.5 md:p-3 rounded-xl shadow-sm relative z-10 hover:border-rose-300 transition-colors flex items-center">
                                                <div className="text-lg md:text-xl font-black text-rose-300 mr-3 italic">{index + 1}.</div>
                                                <div className="text-sm md:text-base font-semibold text-gray-700">{whyText}</div>
                                            </div>
                                        </React.Fragment>
                                    ))}

                                    <div className="w-1 h-4 md:h-6 bg-gray-300"></div>
                                    <div className="w-0 h-0 border-l-[6px] border-r-[6px] border-t-[8px] border-l-transparent border-r-transparent border-t-gray-300"></div>

                                    <div className="w-full grid grid-cols-2 gap-4 md:gap-6 mt-1">
                                        <div className="bg-red-50 border-2 border-red-300 p-3 md:p-4 rounded-xl shadow-sm relative overflow-hidden">
                                            <Target className="absolute -right-2 -bottom-2 w-16 h-16 text-red-100 opacity-50 pointer-events-none" />
                                            <div className="text-[10px] md:text-xs font-black text-red-600 uppercase mb-1.5 flex items-center relative z-10">
                                                <Target className="w-3 h-3 md:w-4 md:h-4 mr-1" /> Tespit Edilen Kök Neden
                                            </div>
                                            <div className="text-sm md:text-base font-bold text-gray-800 relative z-10">{viewingWhy.rootCause || '-'}</div>
                                        </div>
                                        <div className="bg-green-50 border-2 border-green-300 p-3 md:p-4 rounded-xl shadow-sm relative overflow-hidden">
                                            <CheckSquare className="absolute -right-2 -bottom-2 w-16 h-16 text-green-100 opacity-50 pointer-events-none" />
                                            <div className="text-[10px] md:text-xs font-black text-green-700 uppercase mb-1.5 flex items-center relative z-10">
                                                <CheckSquare className="w-3 h-3 md:w-4 md:h-4 mr-1" /> Alınan / Planlanan Aksiyon
                                            </div>
                                            <div className="text-sm md:text-base font-bold text-gray-800 relative z-10">{viewingWhy.actionTaken || '-'}</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex justify-between gap-3 shrink-0">
                            <button onClick={() => handleDeleteWhy(viewingWhy.id)} className="px-5 py-2.5 bg-red-100 hover:bg-red-200 text-red-600 font-bold rounded-lg transition text-sm flex items-center">
                                <Trash2 className="w-4 h-4 mr-2" /> Sil
                            </button>
                            <div className="flex gap-2">
                                <button onClick={() => { const whyToEdit = viewingWhy; setViewingWhy(null); openEditWhy(whyToEdit); }} className="px-5 py-2.5 bg-yellow-100 hover:bg-yellow-200 text-yellow-700 font-bold rounded-lg transition text-sm flex items-center">
                                    <Edit2 className="w-4 h-4 mr-2"/> Düzenle
                                </button>
                                <button onClick={() => handleDownloadPdf(viewingWhy.id, 'why')} className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg transition text-sm flex items-center shadow-md">
                                    <Download className="w-4 h-4 mr-2"/> A3 Rapor İndir
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* YENİ ROI / MALİYET MODALI */}
            {isRoiModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col overflow-hidden max-h-[90vh]">
                        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900">
                            <h2 className="text-lg font-black text-gray-800 dark:text-white flex items-center">
                                <Coins className="w-5 h-5 mr-2 text-emerald-500" /> {editingRoiId ? 'Analizi Düzenle' : 'Yeni Kapasite & ROI Analizi'}
                            </h2>
                            <button onClick={closeRoiModal} className="text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 p-2 rounded-xl transition">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        
                        <div className="p-6 overflow-y-auto flex-1 space-y-5">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="md:col-span-2">
                                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">İyileştirme Başlığı *</label>
                                    <input type="text" className="w-full p-2.5 border rounded-lg bg-gray-50 dark:bg-gray-700 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500 font-bold" placeholder="Örn: Yeni Karbür Freze Kullanımı" value={formDataRoi.title} onChange={e => setFormDataRoi({...formDataRoi, title: e.target.value})} />
                                </div>
                                <div className="md:col-span-2">
                                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Parça / Proje Adı</label>
                                    <input type="text" className="w-full p-2.5 border rounded-lg bg-gray-50 dark:bg-gray-700 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500 font-bold" placeholder="Örn: X Firması Alt Gövde" value={formDataRoi.partName} onChange={e => setFormDataRoi({...formDataRoi, partName: e.target.value})} />
                                </div>
                                
                                <div className="bg-red-50 dark:bg-red-900/10 p-4 rounded-xl border border-red-200 dark:border-red-800/50 grid grid-cols-2 gap-3">
                                    <div className="col-span-2"><label className="block text-xs font-black text-red-700 dark:text-red-400 uppercase mb-1">Eski Süreler *</label></div>
                                    <div>
                                        <label className="block text-[10px] font-bold text-red-500 mb-1">İşlem Süresi (/Adet)</label>
                                        <div className="flex gap-1">
                                            <input type="number" min="0" className="w-full p-2.5 border rounded-lg dark:bg-gray-800 dark:text-white outline-none font-bold text-center" placeholder="Sa" value={formDataRoi.oldTimeH} onChange={e => setFormDataRoi({...formDataRoi, oldTimeH: e.target.value})} />
                                            <input type="number" min="0" step="0.1" className="w-full p-2.5 border rounded-lg dark:bg-gray-800 dark:text-white outline-none font-bold text-center" placeholder="Dk" value={formDataRoi.oldTimeM} onChange={e => setFormDataRoi({...formDataRoi, oldTimeM: e.target.value})} />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold text-red-500 mb-1">Ayar Süresi (/Toplam)</label>
                                        <div className="flex gap-1">
                                            <input type="number" min="0" className="w-full p-2.5 border rounded-lg dark:bg-gray-800 dark:text-white outline-none font-bold text-center" placeholder="Sa" value={formDataRoi.oldSetupTimeH} onChange={e => setFormDataRoi({...formDataRoi, oldSetupTimeH: e.target.value})} />
                                            <input type="number" min="0" step="0.1" className="w-full p-2.5 border rounded-lg dark:bg-gray-800 dark:text-white outline-none font-bold text-center" placeholder="Dk" value={formDataRoi.oldSetupTimeM} onChange={e => setFormDataRoi({...formDataRoi, oldSetupTimeM: e.target.value})} />
                                        </div>
                                    </div>
                                </div>
                                <div className="bg-green-50 dark:bg-green-900/10 p-4 rounded-xl border border-green-200 dark:border-green-800/50 grid grid-cols-2 gap-3">
                                    <div className="col-span-2"><label className="block text-xs font-black text-green-700 dark:text-green-400 uppercase mb-1">Yeni Süreler *</label></div>
                                    <div>
                                        <label className="block text-[10px] font-bold text-green-500 mb-1">İşlem Süresi (/Adet)</label>
                                        <div className="flex gap-1">
                                            <input type="number" min="0" className="w-full p-2.5 border rounded-lg dark:bg-gray-800 dark:text-white outline-none font-bold text-center" placeholder="Sa" value={formDataRoi.newTimeH} onChange={e => setFormDataRoi({...formDataRoi, newTimeH: e.target.value})} />
                                            <input type="number" min="0" step="0.1" className="w-full p-2.5 border rounded-lg dark:bg-gray-800 dark:text-white outline-none font-bold text-center" placeholder="Dk" value={formDataRoi.newTimeM} onChange={e => setFormDataRoi({...formDataRoi, newTimeM: e.target.value})} />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold text-green-500 mb-1">Ayar Süresi (/Toplam)</label>
                                        <div className="flex gap-1">
                                            <input type="number" min="0" className="w-full p-2.5 border rounded-lg dark:bg-gray-800 dark:text-white outline-none font-bold text-center" placeholder="Sa" value={formDataRoi.newSetupTimeH} onChange={e => setFormDataRoi({...formDataRoi, newSetupTimeH: e.target.value})} />
                                            <input type="number" min="0" step="0.1" className="w-full p-2.5 border rounded-lg dark:bg-gray-800 dark:text-white outline-none font-bold text-center" placeholder="Dk" value={formDataRoi.newSetupTimeM} onChange={e => setFormDataRoi({...formDataRoi, newSetupTimeM: e.target.value})} />
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Yıllık Üretim (Adet) *</label>
                                    <input type="number" className="w-full p-2.5 border rounded-lg bg-gray-50 dark:bg-gray-700 dark:text-white outline-none font-bold" placeholder="Örn: 50000" value={formDataRoi.annualVolume} onChange={e => setFormDataRoi({...formDataRoi, annualVolume: e.target.value})} />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Tezgah Saat Ücreti (€) *</label>
                                    <input type="number" className="w-full p-2.5 border rounded-lg bg-gray-50 dark:bg-gray-700 dark:text-white outline-none font-bold" placeholder="Örn: 20" value={formDataRoi.machineHourlyRate} onChange={e => setFormDataRoi({...formDataRoi, machineHourlyRate: e.target.value})} />
                                </div>
                                
                                <div className="md:col-span-2 bg-orange-50 dark:bg-orange-900/10 p-4 rounded-xl border border-orange-200 dark:border-orange-800/50">
                                    <label className="block text-xs font-black text-orange-700 dark:text-orange-400 uppercase mb-1">Yatırım Maliyeti (€) - Varsa</label>
                                    <input type="number" className="w-full p-2.5 border rounded-lg dark:bg-gray-800 dark:text-white outline-none font-bold" placeholder="Örn: 150 (Yeni takım maliyeti)" value={formDataRoi.investmentCost} onChange={e => setFormDataRoi({...formDataRoi, investmentCost: e.target.value})} />
                                </div>

                                <div className="md:col-span-2">
                                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Detaylı Açıklama</label>
                                    <textarea className="w-full p-2.5 border rounded-lg bg-gray-50 dark:bg-gray-700 dark:text-white outline-none resize-none h-20" placeholder="Yapılan işlemi detaylandırın..." value={formDataRoi.description} onChange={e => setFormDataRoi({...formDataRoi, description: e.target.value})}></textarea>
                                </div>
                            </div>
                        </div>

                        <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 flex justify-end gap-3">
                            <button onClick={closeRoiModal} className="px-5 py-2.5 text-gray-600 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 rounded-lg font-bold transition">İptal</button>
                            <button onClick={handleSaveRoi} disabled={isSaving} className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow-md transition flex items-center disabled:opacity-50"><Save className="w-4 h-4 mr-2"/> {isSaving ? 'Kaydediliyor...' : 'Analizi Kaydet'}</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ROI TAM EKRAN GÖRÜNTÜLEME MODALI */}
            {viewingRoi && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in zoom-in duration-200">
                    <div className="bg-gray-100 dark:bg-gray-900 rounded-2xl w-full max-w-5xl shadow-2xl flex flex-col overflow-hidden max-h-[95vh]">
                        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-white dark:bg-gray-800 shrink-0">
                            <h2 className="text-lg font-black text-gray-800 dark:text-white flex items-center">
                                <Coins className="w-5 h-5 mr-2 text-emerald-500" /> Kapasite & ROI (Kazanç) Raporu
                            </h2>
                            <button onClick={() => setViewingRoi(null)} className="text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 p-2 rounded-xl transition">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        
                        <div className="overflow-y-auto flex-1 p-2 md:p-6 flex flex-col">
                            <div id={`roi-card-${viewingRoi.id}`} className="bg-white text-gray-900 p-6 md:p-10 shadow-sm rounded-xl border border-gray-200 w-full max-w-4xl mx-auto">
                                {/* Rapor Başlığı */}
                                <div className="border-b-2 border-gray-800 pb-4 mb-6 flex justify-between items-end">
                                    <div>
                                        <h3 className="text-2xl md:text-3xl font-black uppercase tracking-tight text-gray-900">{viewingRoi.title}</h3>
                                        <div className="flex items-center text-xs md:text-sm font-bold text-gray-500 mt-2 uppercase">
                                            <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded mr-3">MALİYET & KAPASİTE ANALİZİ</span>
                                            <Calendar className="w-4 h-4 mr-1"/> {formatDateTime(viewingRoi.createdAt).split(' ')[0]}
                                        </div>
                                    </div>
                                    <div className="text-right text-[10px] md:text-xs font-bold text-gray-500">
                                        <div className="mb-1">Raporlayan / Ekip:</div>
                                        <div className="text-sm md:text-base text-gray-900 bg-gray-100 px-3 py-1 rounded">{viewingRoi.reportedBy}</div>
                                    </div>
                                </div>

                                <div className="mb-8">
                                    <h4 className="font-bold text-gray-500 uppercase tracking-widest text-xs mb-1">Parça / Proje Bilgisi</h4>
                                    <div className="text-xl font-bold text-gray-800">{viewingRoi.partName || '-'}</div>
                                </div>

                                {/* ANA SONUÇ KARTLARI */}
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                                    <div className="bg-blue-50 border border-blue-200 p-4 rounded-xl text-center">
                                        <div className="text-[10px] md:text-xs font-bold text-blue-600 uppercase mb-1">Yıllık Kazanılan Süre</div>
                                        <div className="text-xl md:text-3xl font-black text-blue-700">+{viewingRoi.annualHoursSaved ? viewingRoi.annualHoursSaved.toFixed(0) : (viewingRoi.monthlyHoursSaved * 12)?.toFixed(0)} <span className="text-sm font-bold">Saat</span></div>
                                    </div>
                                    <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-xl text-center">
                                        <div className="text-[10px] md:text-xs font-bold text-emerald-600 uppercase mb-1">Yıllık Net Kazanç</div>
                                        <div className="text-xl md:text-2xl font-black text-emerald-700">+{Intl.NumberFormat('tr-TR').format(viewingRoi.annualGain || (viewingRoi.monthlyGain * 12))} €</div>
                                    </div>
                                    <div className="bg-green-50 border border-green-200 p-4 rounded-xl text-center">
                                        <div className="text-[10px] md:text-xs font-bold text-green-600 uppercase mb-1">Aylık Kazanç Projeksiyonu</div>
                                        <div className="text-xl md:text-2xl font-black text-green-700">+{Intl.NumberFormat('tr-TR').format((viewingRoi.annualGain / 12) || viewingRoi.monthlyGain)} €</div>
                                    </div>
                                    <div className={`p-4 rounded-xl text-center border ${viewingRoi.roiMonths > 0 ? 'bg-orange-50 border-orange-200' : 'bg-gray-50 border-gray-200'}`}>
                                        <div className={`text-[10px] md:text-xs font-bold uppercase mb-1 ${viewingRoi.roiMonths > 0 ? 'text-orange-600' : 'text-gray-500'}`}>Amortisman (ROI)</div>
                                        <div className={`text-xl md:text-2xl font-black ${viewingRoi.roiMonths > 0 ? 'text-orange-700' : 'text-gray-600'}`}>
                                            {viewingRoi.roiMonths > 0 ? `${viewingRoi.roiMonths.toFixed(1)} Ay` : 'Yatırımsız'}
                                        </div>
                                    </div>
                                </div>

                                {/* DETAY TABLOSU */}
                                <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 mb-6">
                                    <h4 className="font-bold text-gray-800 mb-4 border-b border-gray-200 pb-2">Hesaplama Parametreleri</h4>
                                    <div className="grid grid-cols-2 gap-y-4 gap-x-8 text-sm">
                                        <div><span className="text-gray-500 block text-xs">Eski Süre (İşlem / Ayar)</span><span className="font-bold text-red-600">{formatMinsToHM(viewingRoi.oldTime)}/ad / {formatMinsToHM(viewingRoi.oldSetupTime)}</span></div>
                                        <div><span className="text-gray-500 block text-xs">Yeni Süre (İşlem / Ayar)</span><span className="font-bold text-green-600">{formatMinsToHM(viewingRoi.newTime)}/ad / {formatMinsToHM(viewingRoi.newSetupTime)}</span></div>
                                        <div><span className="text-gray-500 block text-xs">Kazanılan İşlem (Adet)</span><span className="font-bold text-blue-600">{formatMinsToHM(viewingRoi.timeSavedMins)}/ad</span></div>
                                        <div><span className="text-gray-500 block text-xs">Kazanılan Ayar (Toplam)</span><span className="font-bold text-purple-600">{formatMinsToHM(viewingRoi.setupSavedMins)}</span></div>
                                        <div><span className="text-gray-500 block text-xs">Yıllık Üretim Hacmi</span><span className="font-bold">{Intl.NumberFormat('tr-TR').format(viewingRoi.annualVolume || (viewingRoi.monthlyVolume * 12))} Adet</span></div>
                                        <div><span className="text-gray-500 block text-xs">Tezgah Saat Ücreti</span><span className="font-bold">{Intl.NumberFormat('tr-TR').format(viewingRoi.machineHourlyRate)} €/Sa</span></div>
                                        <div className="col-span-2"><span className="text-gray-500 block text-xs">Yapılan Yatırım Maliyeti</span><span className="font-bold text-orange-600">{viewingRoi.investmentCost > 0 ? `${Intl.NumberFormat('tr-TR').format(viewingRoi.investmentCost)} €` : '0 €'}</span></div>
                                    </div>
                                </div>

                                {/* AÇIKLAMA */}
                                {viewingRoi.description && (
                                    <div>
                                        <h4 className="font-bold text-gray-500 uppercase tracking-widest text-xs mb-2">Detaylı İyileştirme Açıklaması</h4>
                                        <p className="text-sm font-medium text-gray-800 whitespace-pre-wrap leading-relaxed bg-gray-50 p-4 rounded-lg border border-gray-100">{viewingRoi.description}</p>
                                    </div>
                                )}
                            </div>
                        </div>
                        
                        <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex justify-between gap-3 shrink-0">
                            <button onClick={() => handleDeleteRoi(viewingRoi.id)} className="px-5 py-2.5 bg-red-100 hover:bg-red-200 text-red-600 font-bold rounded-lg transition text-sm flex items-center">
                                <Trash2 className="w-4 h-4 mr-2" /> Sil
                            </button>
                            <div className="flex gap-2">
                                <button onClick={() => { const roiToEdit = viewingRoi; setViewingRoi(null); openEditRoi(roiToEdit); }} className="px-5 py-2.5 bg-yellow-100 hover:bg-yellow-200 text-yellow-700 font-bold rounded-lg transition text-sm flex items-center">
                                    <Edit2 className="w-4 h-4 mr-2"/> Düzenle
                                </button>
                                <button onClick={() => handleDownloadPdf(viewingRoi.id, 'roi')} className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg transition text-sm flex items-center shadow-md">
                                    <Download className="w-4 h-4 mr-2"/> Raporu İndir
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* RESİM ÖNİZLEME (TAM EKRAN LIGHTBOX) MODALI */}
            {previewImage && (
                <div 
                    className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm animate-in fade-in zoom-in duration-200"
                    onClick={() => setPreviewImage(null)}
                >
                    <button 
                        onClick={() => setPreviewImage(null)} 
                        className="absolute top-4 right-4 text-white hover:text-red-500 transition"
                    >
                        <X className="w-10 h-10" />
                    </button>
                    <img 
                        src={previewImage} 
                        alt="Tam Ekran Önizleme" 
                        className="max-w-full max-h-[90vh] object-contain rounded shadow-2xl" 
                        onClick={e => e.stopPropagation()} 
                    />
                </div>
            )}
        </div>
    );
};

export default ContinuousImprovementPage;