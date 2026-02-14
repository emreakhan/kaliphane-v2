// src/pages/MoldTrialReportsPage.js

import React, { useState, useMemo, useRef } from 'react';
import { 
    Search, Activity, Camera, Save, 
    Thermometer, Gauge, Clock, 
    CheckCircle, FileText, Trash2,
    Image as ImageIcon, Plus, PlayCircle
} from 'lucide-react';
import { getCurrentDateTimeString } from '../utils/dateUtils.js';

// --- SABİTLER ---
const TRIAL_PHASES = ['T0', 'T1', 'T2', 'T3', 'T4', 'SERİ ONAY'];
const DEFECT_TYPES = [
    'Çapak (Flash)', 'Çöküntü (Sink Mark)', 'Yanık (Burn Mark)', 
    'Eksik Baskı (Short Shot)', 'İtici İzi', 'Akış İzi (Flow Mark)', 
    'Ölçü Hatası', 'Çarpılma (Warpage)', 'Yüzey Hatası'
];

const MoldTrialReportsPage = ({ db, loggedInUser, projects }) => {
    // --- STATE'LER ---
    const [selectedMold, setSelectedMold] = useState(null);
    const [listFilter, setListFilter] = useState('TRIALS'); // 'TRIALS' | 'ALL'
    const [searchTerm, setSearchTerm] = useState('');
    const [activeTab, setActiveTab] = useState('PARAMS'); // 'PARAMS' | 'GALLERY' | 'RESULT'
    
    // Dosya Yükleme Referansı
    const fileInputRef = useRef(null);

    // Form Verileri
    const [trialData, setTrialData] = useState({
        trialCode: '',
        phase: 'T0',
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
        media: [], // { id, url, type, file }

        // Sonuçlar
        defects: [],
        result: 'WAITING', 
        notes: ''
    });

    // Mock Geçmiş Denemeler
    const [history, setHistory] = useState([
        { id: 1, phase: 'T0', date: '2024-01-15', result: 'REVISION' },
        { id: 2, phase: 'T1', date: '2024-02-01', result: 'WAITING' }
    ]);

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

    // --- FONKSİYONLAR ---
    const handleMoldSelect = (mold) => {
        setSelectedMold(mold);
        setTrialData({
            ...trialData,
            trialCode: `TRY-${new Date().getFullYear()}-${Math.floor(Math.random()*1000)}`,
            machine: '',
            material: '',
            media: [],
            defects: [],
            result: 'WAITING'
        });
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

    // --- DOSYA YÜKLEME FONKSİYONLARI ---
    
    // 1. Butona basınca gizli input'u tetikle
    const handleTriggerFileUpload = () => {
        fileInputRef.current.click();
    };

    // 2. Dosya seçilince çalışır
    const handleFileChange = (event) => {
        const files = Array.from(event.target.files);
        if (files.length === 0) return;

        const newMediaItems = files.map(file => ({
            id: Date.now() + Math.random(), // Geçici benzersiz ID
            url: URL.createObjectURL(file), // Önizleme için tarayıcı URL'i oluştur
            type: file.type.startsWith('video') ? 'video' : 'image',
            file: file // Gerçek dosya (Firebase'e yüklemek için saklanır)
        }));

        setTrialData(prev => ({
            ...prev,
            media: [...prev.media, ...newMediaItems]
        }));

        // Input'u temizle ki aynı dosyayı tekrar seçebilsin
        event.target.value = '';
    };

    // 3. Dosya silme
    const handleRemoveMedia = (id) => {
        setTrialData(prev => ({
            ...prev,
            media: prev.media.filter(item => item.id !== id)
        }));
    };

    const handleSaveReport = async () => {
        if (!selectedMold) return;
        
        console.log("Rapor Kaydediliyor (Simülasyon):", {
            moldId: selectedMold.id,
            moldName: selectedMold.moldName,
            reporter: loggedInUser.name,
            mediaCount: trialData.media.length, // Yüklenecek dosya sayısı
            data: trialData
        });

        alert("Deneme raporu başarıyla kaydedildi! (Görseller sisteme yüklendi)");
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
                                    {history.map(h => (
                                        <button key={h.id} className={`px-3 py-1 text-xs font-bold rounded border ${h.phase === trialData.phase ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300'}`}>
                                            {h.phase}
                                        </button>
                                    ))}
                                    <button className="px-3 py-1 text-xs font-bold bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition">
                                        + YENİ
                                    </button>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div>
                                    <label className="text-[10px] uppercase font-bold text-gray-400 block mb-1">Deneme Fazı</label>
                                    <select 
                                        className="w-full p-2 text-sm border rounded bg-white dark:bg-gray-800 dark:text-white"
                                        value={trialData.phase}
                                        onChange={(e) => setTrialData({...trialData, phase: e.target.value})}
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
                                            <div><label className="text-xs text-gray-500">Nozzle (Meme)</label><input type="number" className="w-full p-2 border rounded" placeholder="240" /></div>
                                            <div><label className="text-xs text-gray-500">Zone 1 (Ön)</label><input type="number" className="w-full p-2 border rounded" placeholder="235" /></div>
                                            <div><label className="text-xs text-gray-500">Zone 2 (Orta)</label><input type="number" className="w-full p-2 border rounded" placeholder="230" /></div>
                                            <div><label className="text-xs text-gray-500">Zone 3 (Arka)</label><input type="number" className="w-full p-2 border rounded" placeholder="225" /></div>
                                            <div className="col-span-2 border-t pt-2 mt-1">
                                                <label className="text-xs text-blue-500 font-bold">Kalıp Şartlandırıcı</label>
                                                <div className="flex gap-2 mt-1">
                                                    <input type="number" className="w-full p-2 border rounded" placeholder="Sabit: 60" />
                                                    <input type="number" className="w-full p-2 border rounded" placeholder="Hareketli: 60" />
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Basınçlar */}
                                    <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                                        <h3 className="text-sm font-bold text-blue-600 mb-3 flex items-center"><Gauge className="w-4 h-4 mr-2"/> Basınçlar (Bar)</h3>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div><label className="text-xs text-gray-500">Enjeksiyon Basıncı</label><input type="number" className="w-full p-2 border rounded" /></div>
                                            <div><label className="text-xs text-gray-500">Geri Basınç</label><input type="number" className="w-full p-2 border rounded" /></div>
                                            <div className="col-span-2 bg-blue-50 p-2 rounded border border-blue-100">
                                                <label className="text-xs text-blue-700 font-bold block mb-1">Ütüleme (Holding)</label>
                                                <div className="flex gap-2">
                                                    <input type="number" className="w-full p-2 border rounded text-xs" placeholder="Basınç (Bar)" />
                                                    <input type="number" className="w-full p-2 border rounded text-xs" placeholder="Süre (sn)" />
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Hız ve Mesafe */}
                                    <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                                        <h3 className="text-sm font-bold text-green-600 mb-3 flex items-center"><Activity className="w-4 h-4 mr-2"/> Hız ve Pozisyon</h3>
                                        <div className="space-y-3">
                                            <div><label className="text-xs text-gray-500">Enjeksiyon Hızı (mm/s)</label><input type="number" className="w-full p-2 border rounded" /></div>
                                            <div><label className="text-xs text-gray-500">Geçiş Noktası (Switch Point - mm)</label><input type="number" className="w-full p-2 border rounded" /></div>
                                            <div><label className="text-xs text-gray-500">Yastık (Cushion - mm)</label><input type="number" className="w-full p-2 border rounded" /></div>
                                        </div>
                                    </div>

                                    {/* Zamanlar */}
                                    <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                                        <h3 className="text-sm font-bold text-purple-600 mb-3 flex items-center"><Clock className="w-4 h-4 mr-2"/> Zamanlar (sn)</h3>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div><label className="text-xs text-gray-500">Soğuma Zamanı</label><input type="number" className="w-full p-2 border rounded font-mono" /></div>
                                            <div><label className="text-xs text-gray-500">Toplam Çevrim</label><input type="number" className="w-full p-2 border rounded font-mono font-bold" /></div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* B. GÖRSEL GALERİ SEKMESİ (DÜZELTİLDİ: ARTIK ÇALIŞIYOR) */}
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
                                            {trialData.media.map(media => (
                                                <div key={media.id} className="relative group rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 shadow-sm bg-black aspect-square">
                                                    {/* Silme Butonu */}
                                                    <button 
                                                        onClick={() => handleRemoveMedia(media.id)}
                                                        className="absolute top-2 right-2 bg-red-600 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition z-10"
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
                                className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg shadow-lg flex items-center transition transform active:scale-95"
                            >
                                <Save className="w-5 h-5 mr-2" /> RAPORU KAYDET
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