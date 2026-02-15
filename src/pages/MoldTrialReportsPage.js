// src/pages/MoldTrialReportsPage.js

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
    Search, Activity, Camera, Save, 
    Thermometer, Gauge, Clock, 
    CheckCircle, FileText, Trash2,
    Image as ImageIcon, Plus, PlayCircle,
    X, ChevronLeft, ChevronRight, // Galeri ikonları
    Edit3, Type, Circle as CircleIcon, Check // Editör ikonları
} from 'lucide-react';
import { 
    collection, addDoc, query, where, limit, orderBy, onSnapshot, updateDoc, doc 
} from '../config/firebase.js'; 
import { getCurrentDateTimeString } from '../utils/dateUtils.js';

// --- SABİTLER ---
const TRIAL_PHASES = ['T0', 'T1', 'T2', 'T3', 'T4', 'SERİ ONAY'];
const DEFECT_TYPES = [
    'Çapak (Flash)', 'Çöküntü (Sink Mark)', 'Yanık (Burn Mark)', 
    'Eksik Baskı (Short Shot)', 'İtici İzi', 'Akış İzi (Flow Mark)', 
    'Ölçü Hatası', 'Çarpılma (Warpage)', 'Yüzey Hatası'
];
const MOLD_TRIAL_REPORTS_COLLECTION = 'mold_trial_reports';

const MoldTrialReportsPage = ({ db, loggedInUser, projects }) => {
    // --- STATE'LER ---
    const [selectedMold, setSelectedMold] = useState(null);
    const [listFilter, setListFilter] = useState('TRIALS'); 
    const [searchTerm, setSearchTerm] = useState('');
    const [activeTab, setActiveTab] = useState('PARAMS'); 
    const [isSaving, setIsSaving] = useState(false);
    
    // VERİ YÖNETİMİ (YENİ EKLENDİ: Tüm fazları tutmak için)
    const [reports, setReports] = useState([]); 

    // GALERİ (LIGHTBOX) STATE'İ
    const [lightboxIndex, setLightboxIndex] = useState(null); 

    // GÖRSEL DÜZENLEME STATE'LERİ
    const [isEditing, setIsEditing] = useState(false);
    const [editTool, setEditTool] = useState('PEN'); // PEN, CIRCLE, TEXT
    const [drawingColor, setDrawingColor] = useState('#ef4444'); // Varsayılan Kırmızı

    // Refler
    const fileInputRef = useRef(null);
    const canvasRef = useRef(null);
    
    // Çizim Mantığı İçin Refler
    const isDrawing = useRef(false);
    const startPos = useRef({ x: 0, y: 0 });
    const snapshot = useRef(null);

    // Form Verileri (Varsayılan Boş Hali - Fonksiyonlaştırıldı)
    const getInitialTrialData = (phase = 'T0') => ({
        id: null, // Veritabanı ID'si (Yeni kayıt ise null)
        trialCode: `TRY-${new Date().getFullYear()}-${Math.floor(Math.random()*10000)}`,
        phase: phase,
        date: getCurrentDateTimeString(),
        machine: '',
        material: '',
        cavity: '',
        
        // Parametreler
        temps: { nozzle: '', zone1: '', zone2: '', zone3: '', zone4: '', moldFixed: '', moldMoving: '' },
        pressures: { injection: '', holding: '', holdingTime: '', backPressure: '' },
        speeds: { injectionSpeed: '', switchPoint: '', cushion: '' },
        times: { cooling: '', cycle: '' },
        
        // Medya (Foto/Video)
        media: [], // { id, url (base64), type }

        // Sonuçlar
        defects: [],
        result: 'WAITING', 
        notes: ''
    });

    const [trialData, setTrialData] = useState(getInitialTrialData());

    // Mock Geçmiş Denemeler (Artık reports state'inden dinamik gelecek, ama UI bozulmasın diye tutuyoruz)
    // const [history, setHistory] = ... (Aşağıda render kısmında reports kullanılacak)

    // --- VERİ ÇEKME (PERSISTENCE - GÜNCELLENDİ) ---
    useEffect(() => {
        if (!selectedMold || !db) return;

        // Seçilen kalıp için TÜM raporları (bütün fazları) çek
        const q = query(
            collection(db, MOLD_TRIAL_REPORTS_COLLECTION),
            where('moldId', '==', selectedMold.id),
            orderBy('createdAt', 'desc')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedReports = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setReports(fetchedReports);
        }, (error) => {
            console.error("Veri çekme hatası:", error);
        });

        return () => unsubscribe();
    }, [selectedMold, db]);

    // Kalıp değiştiğinde veya raporlar yüklendiğinde varsayılan formu (En sonuncuyu) aç
    useEffect(() => {
        if (selectedMold) {
            if (reports.length > 0) {
                // Eğer form henüz boşsa (kullanıcı bir şey yazmamışsa) en son raporu yükle
                if (!trialData.id && trialData.machine === '') {
                    setTrialData({ ...reports[0] });
                }
            } else {
                // Hiç rapor yoksa T0 boş form aç
                if (!trialData.id && trialData.machine === '') {
                    setTrialData(getInitialTrialData('T0'));
                }
            }
        }
    }, [selectedMold, reports]);

    // --- FAZ DEĞİŞTİRME MANTIĞI (YENİ) ---
    const handlePhaseChange = (newPhase) => {
        // 1. Bu faz için veritabanında kayıtlı bir rapor var mı?
        const existingReport = reports.find(r => r.phase === newPhase);

        if (existingReport) {
            // Varsa onu yükle
            setTrialData({ ...existingReport });
        } else {
            // Yoksa TEMİZ bir form aç (Kalıp ID'leri korunur)
            setTrialData({
                ...getInitialTrialData(newPhase),
                moldId: selectedMold.id, 
                moldName: selectedMold.moldName,
                projectCode: selectedMold.projectCode
            });
        }
    };

    // --- FİLTRELEME MANTIĞI ---
    const filteredMolds = useMemo(() => {
        if (!projects || projects.length === 0) return [];
        
        let filtered = projects;

        if (listFilter === 'TRIALS') {
            filtered = projects.filter(p => {
                const status = p.status ? p.status.toString().toUpperCase().trim() : '';
                return (
                    status === 'DENEME' || 
                    status === "DENEME'DE" ||
                    status === "DENEMEDE" ||
                    status === 'TRIAL' || 
                    status === 'IN_TRIAL' ||
                    status === 'TASHIH' || 
                    status === 'TASHİH' ||
                    status === 'ALISTIRMA' ||
                    status === 'ALIŞTIRMA' ||
                    status.includes('DENEME')
                );
            });
        }

        if (searchTerm) {
            filtered = filtered.filter(p => 
                (p.moldName && p.moldName.toLowerCase().includes(searchTerm.toLowerCase())) ||
                (p.projectCode && p.projectCode.toLowerCase().includes(searchTerm.toLowerCase()))
            );
        }

        return filtered;
    }, [projects, listFilter, searchTerm]);

    // --- TEMEL FONKSİYONLAR ---
    const handleMoldSelect = (mold) => {
        setSelectedMold(mold);
        setReports([]); // Önceki kalıbın raporlarını temizle
        setTrialData(getInitialTrialData('T0')); // Formu sıfırla
    };

    const toggleDefect = (defect) => {
        setTrialData(prev => {
            if (prev.defects.includes(defect)) {
                return { ...prev, defects: prev.defects.filter(d => d !== defect) };
            } else {
                return { ...prev, defects: [...prev.defects, defect] };
            }
        });
    };

    // --- DOSYA YÜKLEME (BASE64) ---
    const handleTriggerFileUpload = () => {
        fileInputRef.current.click();
    };

    const convertToBase64 = (file) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result);
            reader.onerror = error => reject(error);
        });
    };

    const handleFileChange = async (event) => {
        const files = Array.from(event.target.files);
        if (files.length === 0) return;

        const newMediaItems = await Promise.all(files.map(async (file) => {
            const base64 = await convertToBase64(file);
            return {
                id: Date.now() + Math.random(),
                url: base64, 
                type: file.type.startsWith('video') ? 'video' : 'image'
            };
        }));

        setTrialData(prev => ({
            ...prev,
            media: [...prev.media, ...newMediaItems]
        }));

        event.target.value = ''; 
    };

    const handleRemoveMedia = (id) => {
        setTrialData(prev => ({
            ...prev,
            media: prev.media.filter(item => item.id !== id)
        }));
        if (lightboxIndex !== null) setLightboxIndex(null);
    };

    // --- GÖRSEL DÜZENLEME (CANVAS MANTIĞI) ---
    
    const handleStartEditing = () => {
        setIsEditing(true);
        setTimeout(loadImageToCanvas, 50);
    };

    const loadImageToCanvas = () => {
        const canvas = canvasRef.current;
        if (!canvas || lightboxIndex === null) return;
        
        const ctx = canvas.getContext('2d');
        const img = new Image();
        img.src = trialData.media[lightboxIndex].url;
        img.onload = () => {
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            ctx.drawImage(img, 0, 0);
        };
    };

    const getCanvasPos = (e) => {
        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        return {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY
        };
    };

    const startDrawing = (e) => {
        if (!isEditing) return;
        
        if (editTool === 'TEXT') {
            const pos = getCanvasPos(e);
            const text = prompt("Notunuzu girin:", "");
            if (text) {
                const ctx = canvasRef.current.getContext('2d');
                ctx.font = "bold 40px Arial";
                ctx.fillStyle = drawingColor;
                ctx.fillText(text, pos.x, pos.y);
            }
            return;
        }

        isDrawing.current = true;
        const pos = getCanvasPos(e);
        startPos.current = pos;
        
        const ctx = canvasRef.current.getContext('2d');
        ctx.strokeStyle = drawingColor;
        ctx.lineWidth = 5;
        ctx.lineCap = 'round';
        
        if (editTool === 'CIRCLE') {
            snapshot.current = ctx.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height);
        } else {
            ctx.beginPath();
            ctx.moveTo(pos.x, pos.y);
        }
    };

    const draw = (e) => {
        if (!isDrawing.current) return;
        const ctx = canvasRef.current.getContext('2d');
        const pos = getCanvasPos(e);

        if (editTool === 'PEN') {
            ctx.lineTo(pos.x, pos.y);
            ctx.stroke();
        } else if (editTool === 'CIRCLE') {
            ctx.putImageData(snapshot.current, 0, 0);
            ctx.beginPath();
            const radius = Math.sqrt(Math.pow(pos.x - startPos.current.x, 2) + Math.pow(pos.y - startPos.current.y, 2));
            ctx.arc(startPos.current.x, startPos.current.y, radius, 0, 2 * Math.PI);
            ctx.stroke();
        }
    };

    const stopDrawing = () => {
        isDrawing.current = false;
    };

    const handleSaveEdit = () => {
        const canvas = canvasRef.current;
        const newDataUrl = canvas.toDataURL('image/jpeg', 0.8);
        
        const newMedia = [...trialData.media];
        newMedia[lightboxIndex] = {
            ...newMedia[lightboxIndex],
            url: newDataUrl
        };
        setTrialData({ ...trialData, media: newMedia });
        setIsEditing(false);
    };

    // --- GALERİ NAVİGASYONU ---
    const handleNextMedia = (e) => {
        if(e) e.stopPropagation();
        if (trialData.media.length > 0) {
            setLightboxIndex((prev) => (prev + 1) % trialData.media.length);
        }
    };

    const handlePrevMedia = (e) => {
        if(e) e.stopPropagation();
        if (trialData.media.length > 0) {
            setLightboxIndex((prev) => (prev - 1 + trialData.media.length) % trialData.media.length);
        }
    };

    // --- KAYDETME (FIRESTORE - GÜNCELLENDİ) ---
    const handleSaveReport = async () => {
        if (!selectedMold) return;
        setIsSaving(true);
        
        try {
            const safeProjectCode = selectedMold.projectCode || '';

            const reportData = {
                ...trialData,
                moldId: selectedMold.id,
                moldName: selectedMold.moldName || '',
                projectCode: safeProjectCode,
                reporter: loggedInUser?.name || 'Bilinmeyen',
                savedAt: getCurrentDateTimeString()
            };

            // EĞER BU FAZ İÇİN ID VARSA (UPDATE)
            if (trialData.id) {
                await updateDoc(doc(db, MOLD_TRIAL_REPORTS_COLLECTION, trialData.id), reportData);
                alert(`${trialData.phase} fazı başarıyla güncellendi!`);
            } 
            // EĞER YOKSA (CREATE)
            else {
                const docRef = await addDoc(collection(db, MOLD_TRIAL_REPORTS_COLLECTION), {
                    ...reportData,
                    createdAt: new Date().toISOString()
                });
                // Yeni ID'yi state'e kaydet
                setTrialData(prev => ({ ...prev, id: docRef.id }));
                alert(`${trialData.phase} fazı başarıyla oluşturuldu!`);
            }
        } catch (error) {
            console.error("Hata:", error);
            alert("Kaydetme sırasında bir hata oluştu: " + error.message);
        } finally {
            setIsSaving(false);
        }
    };

    // --- RENDER BİLEŞENLERİ ---

    const MoldListItem = ({ mold }) => (
        <div 
            onClick={() => handleMoldSelect(mold)}
            className={`p-4 border-b border-gray-100 dark:border-gray-700 cursor-pointer hover:bg-blue-50 dark:hover:bg-gray-700 transition group ${selectedMold?.id === mold.id ? 'bg-blue-50 dark:bg-gray-700 border-l-4 border-l-blue-600' : ''}`}
        >
            <div className="flex justify-between items-start mb-1">
                <span className="font-bold text-gray-800 dark:text-gray-200 text-sm truncate w-2/3">{mold.moldName}</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                    (mold.status && mold.status.toString().toUpperCase().includes('DENEME')) ? 'bg-yellow-100 text-yellow-800' : 
                    (mold.status === 'ONAY' || mold.status === 'COMPLETED') ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                }`}>
                    {mold.status || 'BELİRSİZ'}
                </span>
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 flex justify-between">
                <span>{mold.projectCode || 'Kod Yok'}</span>
                <span>T{mold.trialCount || '0'}</span>
            </div>
        </div>
    );

    return (
        <div className="flex h-[calc(100vh-100px)] bg-gray-100 dark:bg-gray-900 gap-4 p-4 overflow-hidden font-sans">
            
            {/* LIGHTBOX (MODAL) */}
            {lightboxIndex !== null && trialData.media[lightboxIndex] && (
                <div 
                    className="fixed inset-0 z-50 bg-black/95 flex flex-col items-center justify-center p-0 backdrop-blur-sm animate-in fade-in duration-200"
                >
                    {/* Üst Araç Çubuğu (Toolbar) */}
                    <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center bg-gradient-to-b from-black/80 to-transparent z-50">
                        
                        {/* Sol: Düzenleme Butonları */}
                        <div className="flex gap-2">
                            {trialData.media[lightboxIndex].type === 'image' && (
                                !isEditing ? (
                                    <button 
                                        onClick={handleStartEditing}
                                        className="flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-full text-sm font-bold shadow-lg transition"
                                    >
                                        <Edit3 className="w-4 h-4 mr-2" /> Düzenle
                                    </button>
                                ) : (
                                    <div className="flex items-center gap-2 animate-in slide-in-from-top-5">
                                        <div className="flex bg-gray-800 rounded-full p-1 border border-gray-600">
                                            <button onClick={() => setEditTool('PEN')} className={`p-2 rounded-full transition ${editTool === 'PEN' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`} title="Kalem"><Edit3 className="w-4 h-4"/></button>
                                            <button onClick={() => setEditTool('CIRCLE')} className={`p-2 rounded-full transition ${editTool === 'CIRCLE' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`} title="Daire"><CircleIcon className="w-4 h-4"/></button>
                                            <button onClick={() => setEditTool('TEXT')} className={`p-2 rounded-full transition ${editTool === 'TEXT' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`} title="Yazı"><Type className="w-4 h-4"/></button>
                                        </div>
                                        
                                        <div className="flex bg-gray-800 rounded-full p-1 border border-gray-600 gap-1">
                                            {['#ef4444', '#22c55e', '#eab308', '#3b82f6', '#ffffff'].map(color => (
                                                <button 
                                                    key={color} 
                                                    onClick={() => setDrawingColor(color)}
                                                    className={`w-6 h-6 rounded-full border-2 transition ${drawingColor === color ? 'border-white scale-110' : 'border-transparent'}`}
                                                    style={{ backgroundColor: color }}
                                                />
                                            ))}
                                        </div>

                                        <button onClick={handleSaveEdit} className="flex items-center px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-full text-sm font-bold ml-2">
                                            <Check className="w-4 h-4 mr-1" /> Kaydet
                                        </button>
                                        <button onClick={() => setIsEditing(false)} className="flex items-center px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-full text-sm font-bold">
                                            <X className="w-4 h-4 mr-1" /> İptal
                                        </button>
                                    </div>
                                )
                            )}
                        </div>

                        {/* Sağ: Kapatma */}
                        <button 
                            onClick={() => { setLightboxIndex(null); setIsEditing(false); }}
                            className="text-white hover:text-red-500 transition p-2 bg-white/10 rounded-full hover:bg-white/20"
                        >
                            <X className="w-8 h-8" />
                        </button>
                    </div>

                    {/* Orta: İçerik */}
                    <div className="flex-1 flex items-center justify-center w-full h-full p-4 overflow-hidden relative" onClick={() => !isEditing && setLightboxIndex(null)}>
                        {/* Sol Ok */}
                        {!isEditing && (
                            <button 
                                onClick={handlePrevMedia}
                                className="absolute left-4 z-10 text-white/50 hover:text-white transition hover:scale-110 p-4 bg-black/20 rounded-full hover:bg-black/50"
                            >
                                <ChevronLeft className="w-12 h-12" />
                            </button>
                        )}

                        {/* Medya */}
                        <div className="relative max-w-full max-h-full flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
                            {isEditing ? (
                                <canvas 
                                    ref={canvasRef}
                                    onMouseDown={startDrawing}
                                    onMouseMove={draw}
                                    onMouseUp={stopDrawing}
                                    onMouseLeave={stopDrawing}
                                    className="max-w-full max-h-[85vh] object-contain cursor-crosshair shadow-2xl border border-gray-700 bg-black"
                                />
                            ) : (
                                trialData.media[lightboxIndex].type === 'image' ? (
                                    <img 
                                        src={trialData.media[lightboxIndex].url} 
                                        alt="Büyük Boyut" 
                                        className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl border border-gray-800"
                                    />
                                ) : (
                                    <video 
                                        src={trialData.media[lightboxIndex].url} 
                                        controls 
                                        autoPlay
                                        className="max-w-full max-h-[85vh] rounded-lg shadow-2xl border border-gray-800"
                                    />
                                )
                            )}
                        </div>

                        {/* Sağ Ok */}
                        {!isEditing && (
                            <button 
                                onClick={handleNextMedia}
                                className="absolute right-4 z-10 text-white/50 hover:text-white transition hover:scale-110 p-4 bg-black/20 rounded-full hover:bg-black/50"
                            >
                                <ChevronRight className="w-12 h-12" />
                            </button>
                        )}
                    </div>

                    {/* Alt Bilgi */}
                    {!isEditing && (
                        <div className="absolute bottom-8 text-white/70 text-sm font-mono bg-black/50 px-4 py-1 rounded-full pointer-events-none">
                            {lightboxIndex + 1} / {trialData.media.length}
                        </div>
                    )}
                </div>
            )}

            {/* SOL PANEL: KALIP LİSTESİ */}
            <div className="w-1/4 min-w-[300px] bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 flex flex-col">
                <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                    <h2 className="text-lg font-bold text-gray-800 dark:text-white mb-4 flex items-center">
                        <Activity className="w-5 h-5 mr-2 text-blue-600" /> Deneme Listesi
                    </h2>
                    
                    <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-1 mb-3">
                        <button 
                            onClick={() => setListFilter('TRIALS')}
                            className={`flex-1 py-1.5 text-xs font-bold rounded-md transition ${listFilter === 'TRIALS' ? 'bg-white dark:bg-gray-600 text-blue-600 shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}
                        >
                            Denemedekiler
                        </button>
                        <button 
                            onClick={() => setListFilter('ALL')}
                            className={`flex-1 py-1.5 text-xs font-bold rounded-md transition ${listFilter === 'ALL' ? 'bg-white dark:bg-gray-600 text-blue-600 shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}
                        >
                            Tümü
                        </button>
                    </div>

                    <div className="relative">
                        <Search className="absolute left-3 top-2.5 text-gray-400 w-4 h-4" />
                        <input 
                            type="text" 
                            placeholder="Kalıp adı veya kodu..." 
                            className="w-full pl-9 p-2 text-sm border rounded-lg bg-gray-50 dark:bg-gray-900 dark:text-white dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto">
                    {filteredMolds.length === 0 ? (
                        <div className="p-8 text-center text-gray-400 text-sm">
                            <p>Kayıt bulunamadı.</p>
                            {listFilter === 'TRIALS' && <p className="text-xs mt-2 opacity-70">"Tümü" sekmesini kontrol edin.</p>}
                        </div>
                    ) : (
                        filteredMolds.map(mold => <MoldListItem key={mold.id} mold={mold} />)
                    )}
                </div>
            </div>

            {/* SAĞ PANEL: RAPOR DETAYI */}
            <div className="flex-1 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden">
                {selectedMold ? (
                    <>
                        {/* 1. HEADER (KÜNYE) */}
                        <div className="p-5 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <h1 className="text-2xl font-black text-gray-800 dark:text-white flex items-center">
                                        {selectedMold.moldName}
                                        <span className="ml-3 text-sm font-normal text-gray-500 bg-white dark:bg-gray-800 px-2 py-1 rounded border border-gray-200 dark:border-gray-700">
                                            {selectedMold.projectCode}
                                        </span>
                                    </h1>
                                    <p className="text-sm text-gray-500 mt-1">Müşteri: {selectedMold.customerName || 'Belirtilmemiş'}</p>
                                </div>
                                <div className="flex gap-2">
                                    {/* FAZ BUTONLARI (GÜNCELLENDİ) */}
                                    {TRIAL_PHASES.map(phase => {
                                        // Bu faz veritabanında var mı?
                                        const hasReport = reports.some(r => r.phase === phase);
                                        return (
                                            <button 
                                                key={phase} 
                                                onClick={() => handlePhaseChange(phase)}
                                                className={`px-3 py-1 text-xs font-bold rounded border transition 
                                                    ${trialData.phase === phase ? 'bg-blue-600 text-white border-blue-600 scale-105 shadow-md' : 
                                                    hasReport ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100' : 
                                                    'bg-white text-gray-400 border-gray-200 hover:bg-gray-50'}`}
                                            >
                                                {phase} {hasReport && '✓'}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div>
                                    <label className="text-[10px] uppercase font-bold text-gray-400 block mb-1">Deneme Fazı</label>
                                    <select 
                                        className="w-full p-2 text-sm border rounded bg-white dark:bg-gray-800 dark:text-white"
                                        value={trialData.phase}
                                        onChange={(e) => handlePhaseChange(e.target.value)} // BURASI GÜNCELLENDİ
                                    >
                                        {TRIAL_PHASES.map(p => <option key={p} value={p}>{p}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[10px] uppercase font-bold text-gray-400 block mb-1">Makine (Tonaj)</label>
                                    <input 
                                        type="text" 
                                        className="w-full p-2 text-sm border rounded bg-white dark:bg-gray-800 dark:text-white" 
                                        placeholder="Örn: 160 Ton"
                                        value={trialData.machine}
                                        onChange={(e) => setTrialData({...trialData, machine: e.target.value})}
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] uppercase font-bold text-gray-400 block mb-1">Hammadde</label>
                                    <input 
                                        type="text" 
                                        className="w-full p-2 text-sm border rounded bg-white dark:bg-gray-800 dark:text-white" 
                                        placeholder="Örn: PA6 GF30"
                                        value={trialData.material}
                                        onChange={(e) => setTrialData({...trialData, material: e.target.value})}
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] uppercase font-bold text-gray-400 block mb-1">Göz Sayısı</label>
                                    <input 
                                        type="number" 
                                        className="w-full p-2 text-sm border rounded bg-white dark:bg-gray-800 dark:text-white" 
                                        placeholder="Örn: 4"
                                        value={trialData.cavity}
                                        onChange={(e) => setTrialData({...trialData, cavity: e.target.value})}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* 2. TAB MENÜSÜ */}
                        <div className="flex border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4">
                            <button 
                                onClick={() => setActiveTab('PARAMS')}
                                className={`py-3 px-6 text-sm font-bold border-b-2 transition flex items-center ${activeTab === 'PARAMS' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                            >
                                <Gauge className="w-4 h-4 mr-2" /> Parametreler
                            </button>
                            <button 
                                onClick={() => setActiveTab('GALLERY')}
                                className={`py-3 px-6 text-sm font-bold border-b-2 transition flex items-center ${activeTab === 'GALLERY' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                            >
                                <Camera className="w-4 h-4 mr-2" /> Görseller
                            </button>
                            <button 
                                onClick={() => setActiveTab('RESULT')}
                                className={`py-3 px-6 text-sm font-bold border-b-2 transition flex items-center ${activeTab === 'RESULT' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                            >
                                <FileText className="w-4 h-4 mr-2" /> Sonuç & Rapor
                            </button>
                        </div>

                        {/* 3. İÇERİK ALANI */}
                        <div className="flex-1 overflow-y-auto p-6 bg-gray-50/50 dark:bg-gray-900/50">
                            
                            {/* A. PARAMETRELER SEKMESİ */}
                            {activeTab === 'PARAMS' && (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6 animate-in fade-in slide-in-from-bottom-2">
                                    {/* Sıcaklıklar */}
                                    <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                                        <h3 className="text-sm font-bold text-red-600 mb-3 flex items-center"><Thermometer className="w-4 h-4 mr-2"/> Sıcaklıklar (°C)</h3>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div><label className="text-xs text-gray-500">Nozzle (Meme)</label><input type="number" className="w-full p-2 border rounded" placeholder="240" value={trialData.temps.nozzle} onChange={e => setTrialData({...trialData, temps: {...trialData.temps, nozzle: e.target.value}})} /></div>
                                            <div><label className="text-xs text-gray-500">Zone 1 (Ön)</label><input type="number" className="w-full p-2 border rounded" placeholder="235" value={trialData.temps.zone1} onChange={e => setTrialData({...trialData, temps: {...trialData.temps, zone1: e.target.value}})} /></div>
                                            <div><label className="text-xs text-gray-500">Zone 2 (Orta)</label><input type="number" className="w-full p-2 border rounded" placeholder="230" value={trialData.temps.zone2} onChange={e => setTrialData({...trialData, temps: {...trialData.temps, zone2: e.target.value}})} /></div>
                                            <div><label className="text-xs text-gray-500">Zone 3 (Arka)</label><input type="number" className="w-full p-2 border rounded" placeholder="225" value={trialData.temps.zone3} onChange={e => setTrialData({...trialData, temps: {...trialData.temps, zone3: e.target.value}})} /></div>
                                            <div className="col-span-2 border-t pt-2 mt-1">
                                                <label className="text-xs text-blue-500 font-bold">Kalıp Şartlandırıcı</label>
                                                <div className="flex gap-2 mt-1">
                                                    <input type="number" className="w-full p-2 border rounded" placeholder="Sabit: 60" value={trialData.temps.moldFixed} onChange={e => setTrialData({...trialData, temps: {...trialData.temps, moldFixed: e.target.value}})} />
                                                    <input type="number" className="w-full p-2 border rounded" placeholder="Hareketli: 60" value={trialData.temps.moldMoving} onChange={e => setTrialData({...trialData, temps: {...trialData.temps, moldMoving: e.target.value}})} />
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Basınçlar */}
                                    <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                                        <h3 className="text-sm font-bold text-blue-600 mb-3 flex items-center"><Gauge className="w-4 h-4 mr-2"/> Basınçlar (Bar)</h3>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div><label className="text-xs text-gray-500">Enjeksiyon Basıncı</label><input type="number" className="w-full p-2 border rounded" value={trialData.pressures.injection} onChange={e => setTrialData({...trialData, pressures: {...trialData.pressures, injection: e.target.value}})} /></div>
                                            <div><label className="text-xs text-gray-500">Geri Basınç</label><input type="number" className="w-full p-2 border rounded" value={trialData.pressures.backPressure} onChange={e => setTrialData({...trialData, pressures: {...trialData.pressures, backPressure: e.target.value}})} /></div>
                                            <div className="col-span-2 bg-blue-50 p-2 rounded border border-blue-100">
                                                <label className="text-xs text-blue-700 font-bold block mb-1">Ütüleme (Holding)</label>
                                                <div className="flex gap-2">
                                                    <input type="number" className="w-full p-2 border rounded text-xs" placeholder="Basınç (Bar)" value={trialData.pressures.holding} onChange={e => setTrialData({...trialData, pressures: {...trialData.pressures, holding: e.target.value}})} />
                                                    <input type="number" className="w-full p-2 border rounded text-xs" placeholder="Süre (sn)" value={trialData.pressures.holdingTime} onChange={e => setTrialData({...trialData, pressures: {...trialData.pressures, holdingTime: e.target.value}})} />
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Hız ve Mesafe */}
                                    <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                                        <h3 className="text-sm font-bold text-green-600 mb-3 flex items-center"><Activity className="w-4 h-4 mr-2"/> Hız ve Pozisyon</h3>
                                        <div className="space-y-3">
                                            <div><label className="text-xs text-gray-500">Enjeksiyon Hızı (mm/s)</label><input type="number" className="w-full p-2 border rounded" value={trialData.speeds.injectionSpeed} onChange={e => setTrialData({...trialData, speeds: {...trialData.speeds, injectionSpeed: e.target.value}})} /></div>
                                            <div><label className="text-xs text-gray-500">Geçiş Noktası (Switch Point - mm)</label><input type="number" className="w-full p-2 border rounded" value={trialData.speeds.switchPoint} onChange={e => setTrialData({...trialData, speeds: {...trialData.speeds, switchPoint: e.target.value}})} /></div>
                                            <div><label className="text-xs text-gray-500">Yastık (Cushion - mm)</label><input type="number" className="w-full p-2 border rounded" value={trialData.speeds.cushion} onChange={e => setTrialData({...trialData, speeds: {...trialData.speeds, cushion: e.target.value}})} /></div>
                                        </div>
                                    </div>

                                    {/* Zamanlar */}
                                    <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                                        <h3 className="text-sm font-bold text-purple-600 mb-3 flex items-center"><Clock className="w-4 h-4 mr-2"/> Zamanlar (sn)</h3>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div><label className="text-xs text-gray-500">Soğuma Zamanı</label><input type="number" className="w-full p-2 border rounded font-mono" value={trialData.times.cooling} onChange={e => setTrialData({...trialData, times: {...trialData.times, cooling: e.target.value}})} /></div>
                                            <div><label className="text-xs text-gray-500">Toplam Çevrim</label><input type="number" className="w-full p-2 border rounded font-mono font-bold" value={trialData.times.cycle} onChange={e => setTrialData({...trialData, times: {...trialData.times, cycle: e.target.value}})} /></div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* B. GÖRSEL GALERİ SEKMESİ */}
                            {activeTab === 'GALLERY' && (
                                <div className="space-y-6">
                                    {/* Gizli Input */}
                                    <input 
                                        type="file" 
                                        multiple 
                                        accept="image/*,video/*"
                                        ref={fileInputRef} 
                                        className="hidden" 
                                        onChange={handleFileChange}
                                    />

                                    {/* Yükleme Alanı */}
                                    <div className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-800/50 p-10 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition">
                                        <ImageIcon className="w-16 h-16 mb-4 opacity-50" />
                                        <p className="text-lg font-medium">Fotoğraf veya Video Yükle</p>
                                        <p className="text-sm opacity-70 mb-4">Dosya seçmek için butona tıklayın.</p>
                                        <button 
                                            onClick={handleTriggerFileUpload}
                                            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-md font-bold flex items-center transition"
                                        >
                                            <Plus className="w-4 h-4 mr-2" /> Dosya Seç
                                        </button>
                                    </div>

                                    {/* Önizleme Galerisi */}
                                    {trialData.media.length > 0 && (
                                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 animate-in fade-in">
                                            {trialData.media.map((media, index) => (
                                                <div 
                                                    key={media.id} 
                                                    onClick={() => setLightboxIndex(index)} // TIKLAYINCA AÇILACAK
                                                    className="relative group rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 shadow-sm bg-black aspect-square cursor-zoom-in hover:brightness-110 transition"
                                                >
                                                    {/* Silme Butonu */}
                                                    <button 
                                                        onClick={(e) => { e.stopPropagation(); handleRemoveMedia(media.id); }}
                                                        className="absolute top-2 right-2 bg-red-600 hover:bg-red-700 text-white p-1.5 rounded-full shadow-md z-20 cursor-pointer transition-transform hover:scale-110 opacity-0 group-hover:opacity-100"
                                                        title="Sil"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>

                                                    {media.type === 'image' ? (
                                                        <img src={media.url} alt="Deneme Görseli" className="w-full h-full object-cover" />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center bg-gray-900">
                                                            <PlayCircle className="w-10 h-10 text-white opacity-80" />
                                                            <video src={media.url} className="absolute inset-0 w-full h-full object-cover opacity-50" />
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* C. SONUÇ VE RAPOR SEKMESİ */}
                            {activeTab === 'RESULT' && (
                                <div className="space-y-6 animate-in fade-in">
                                    {/* Hata Kontrol Listesi */}
                                    <div className="bg-white dark:bg-gray-800 p-5 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                                        <h3 className="text-sm font-bold text-gray-800 dark:text-white mb-4">Görülen Hatalar (Checklist)</h3>
                                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                            {DEFECT_TYPES.map(defect => (
                                                <div 
                                                    key={defect} 
                                                    onClick={() => toggleDefect(defect)}
                                                    className={`p-3 rounded-lg border text-sm cursor-pointer transition flex items-center ${trialData.defects.includes(defect) ? 'bg-red-50 border-red-500 text-red-700 font-bold' : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'}`}
                                                >
                                                    {trialData.defects.includes(defect) ? <CheckCircle className="w-4 h-4 mr-2"/> : <div className="w-4 h-4 mr-2 border border-gray-400 rounded-full"></div>}
                                                    {defect}
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Karar ve Notlar */}
                                    <div className="bg-white dark:bg-gray-800 p-5 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                                        <h3 className="text-sm font-bold text-gray-800 dark:text-white mb-4">Sonuç ve Aksiyon</h3>
                                        
                                        <div className="mb-4">
                                            <label className="block text-sm font-medium text-gray-600 mb-1">Deneme Sonucu</label>
                                            <div className="flex gap-2">
                                                {['WAITING', 'APPROVED', 'REVISION', 'REJECTED'].map(status => (
                                                    <button
                                                        key={status}
                                                        onClick={() => setTrialData({...trialData, result: status})}
                                                        className={`flex-1 py-3 rounded-lg font-bold text-sm border-2 transition ${
                                                            trialData.result === status 
                                                            ? (status === 'APPROVED' ? 'bg-green-600 border-green-600 text-white' : status === 'REVISION' ? 'bg-orange-500 border-orange-500 text-white' : status === 'REJECTED' ? 'bg-red-600 border-red-600 text-white' : 'bg-gray-600 border-gray-600 text-white')
                                                            : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
                                                        }`}
                                                    >
                                                        {status === 'APPROVED' ? 'ONAYLI (SERİ)' : status === 'REVISION' ? 'TASHİH (REVİZYON)' : status === 'REJECTED' ? 'RET (İPTAL)' : 'BEKLEMEDE'}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-600 mb-1">Rapor Notları / Yapılacak İşlemler</label>
                                            <textarea 
                                                className="w-full p-3 border rounded-lg h-32 bg-gray-50 dark:bg-gray-900 dark:text-white dark:border-gray-600"
                                                placeholder="Kalıp ile ilgili detaylı notlar, revizyon talepleri..."
                                                value={trialData.notes}
                                                onChange={(e) => setTrialData({...trialData, notes: e.target.value})}
                                            ></textarea>
                                        </div>
                                    </div>
                                </div>
                            )}

                        </div>

                        {/* 4. FOOTER (KAYDET BUTONU) */}
                        <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex justify-between items-center">
                            <div className="text-xs text-gray-500">
                                <span>Raporlayan: <strong>{loggedInUser.name}</strong></span>
                                <span className="mx-2">|</span>
                                <span>Dosya: {trialData.media.length} adet</span>
                            </div>
                            <button 
                                onClick={handleSaveReport}
                                disabled={isSaving}
                                className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg shadow-lg flex items-center transition transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <Save className="w-5 h-5 mr-2" /> 
                                {isSaving ? 'Kaydediliyor...' : 'RAPORU KAYDET'}
                            </button>
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
                        <FileText className="w-20 h-20 mb-4 opacity-30" />
                        <p className="text-lg">Soldaki listeden bir kalıp seçin.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default MoldTrialReportsPage;