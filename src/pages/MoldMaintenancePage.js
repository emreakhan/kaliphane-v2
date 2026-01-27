// src/pages/MoldMaintenancePage.js

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
    Wrench, Search, Plus, Filter, User, FileText, 
    Image as ImageIcon, CheckCircle, AlertTriangle, XCircle,
    ChevronRight, Camera, Trash2, LayoutDashboard, History, Settings, 
    MessageSquare, Send, ChevronLeft, X 
} from 'lucide-react';
import { 
    collection, query, onSnapshot, addDoc, updateDoc, doc, orderBy, where, arrayUnion 
} from '../config/firebase.js';
import { 
    MAINTENANCE_MOLDS_COLLECTION, MAINTENANCE_LOGS_COLLECTION, 
    MAINTENANCE_TYPES, MAINTENANCE_STATUS 
} from '../config/constants.js';
import { getCurrentDateTimeString, formatDateTR, formatDateTime } from '../utils/dateUtils.js';
import { storage, ref, uploadBytes, getDownloadURL } from '../config/firebase.js';

// --- MODAL BİLEŞENİ ---
const SimpleModal = ({ isOpen, onClose, title, children, size = "max-w-2xl" }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-in fade-in">
            <div className={`bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full ${size} border border-gray-200 dark:border-gray-700 flex flex-col max-h-[95vh]`}>
                <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900 rounded-t-xl shrink-0">
                    <h3 className="text-lg font-bold text-gray-800 dark:text-white">{title}</h3>
                    <button onClick={onClose} className="text-gray-500 hover:text-red-500"><XCircle className="w-6 h-6"/></button>
                </div>
                <div className="p-6 overflow-y-auto">{children}</div>
            </div>
        </div>
    );
};

const MoldMaintenancePage = ({ db, loggedInUser }) => {
    // --- STATE ---
    const [molds, setMolds] = useState([]);
    const [logs, setLogs] = useState([]);
    const [selectedMoldId, setSelectedMoldId] = useState(null);
    
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('ALL');

    // Modals
    const [isAddMoldOpen, setIsAddMoldOpen] = useState(false);
    const [isAddLogOpen, setIsAddLogOpen] = useState(false);

    // Yükleme Durumları
    const [isUploading, setIsUploading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    
    const [uploadingForLogId, setUploadingForLogId] = useState(null); 
    const [commentText, setCommentText] = useState({});

    // --- LIGHTBOX (RESİM ÖNİZLEME) STATE ---
    const [lightbox, setLightbox] = useState({ isOpen: false, images: [], currentIndex: 0 });

    // --- FORM STATES ---
    const [newMoldData, setNewMoldData] = useState({ moldCode: '', moldName: '', customer: '' });
    const [newMoldImage, setNewMoldImage] = useState(null); 

    const [newLogData, setNewLogData] = useState({ 
        type: MAINTENANCE_TYPES.FAULT,
        issueTitle: '', 
        description: '', 
        performedBy: loggedInUser?.name || ''
    });
    
    const [processedPartsList, setProcessedPartsList] = useState([
        { code: '', process: '' }, { code: '', process: '' }, { code: '', process: '' }
    ]);
    const [changedPartsList, setChangedPartsList] = useState([
        { code: '', desc: '' }, { code: '', desc: '' }, { code: '', desc: '' }
    ]);

    const [logImagesBefore, setLogImagesBefore] = useState([]); 
    const [logImagesAfter, setLogImagesAfter] = useState([]); 

    // --- 1. VERİLERİ DİNLE ---
    useEffect(() => {
        if (!db) return;
        const qMolds = query(collection(db, MAINTENANCE_MOLDS_COLLECTION), orderBy('moldName'));
        const unsubMolds = onSnapshot(qMolds, (snapshot) => {
            setMolds(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
        });
        return () => unsubMolds();
    }, [db]);

    useEffect(() => {
        if (!db || !selectedMoldId) {
            setLogs([]);
            return;
        }
        const qLogs = query(
            collection(db, MAINTENANCE_LOGS_COLLECTION),
            where('moldId', '==', selectedMoldId)
        );
        const unsubLogs = onSnapshot(qLogs, (snapshot) => {
            const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            data.sort((a, b) => new Date(b.date) - new Date(a.date));
            setLogs(data);
        });
        return () => unsubLogs();
    }, [db, selectedMoldId]);

    // --- LIGHTBOX FONKSİYONLARI ---
    const openLightbox = (images, index) => {
        setLightbox({ isOpen: true, images, currentIndex: index });
    };

    const closeLightbox = () => {
        setLightbox({ isOpen: false, images: [], currentIndex: 0 });
    };

    const nextImage = useCallback((e) => {
        if(e) e.stopPropagation();
        setLightbox(prev => ({
            ...prev,
            currentIndex: (prev.currentIndex + 1) % prev.images.length
        }));
    }, []);

    const prevImage = useCallback((e) => {
        if(e) e.stopPropagation();
        setLightbox(prev => ({
            ...prev,
            currentIndex: (prev.currentIndex - 1 + prev.images.length) % prev.images.length
        }));
    }, []);

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (!lightbox.isOpen) return;
            if (e.key === 'ArrowRight') nextImage();
            if (e.key === 'ArrowLeft') prevImage();
            if (e.key === 'Escape') closeLightbox();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [lightbox.isOpen, nextImage, prevImage]);


    // --- SEÇİLİ KALIP VE ANALİZ ---
    const selectedMold = useMemo(() => molds.find(m => m.id === selectedMoldId), [molds, selectedMoldId]);

    const moldStats = useMemo(() => {
        if (!logs || logs.length === 0) return null;

        let totalProcessedCount = 0;
        let totalChangedCount = 0;
        const partFrequency = {};

        logs.forEach(log => {
            if (log.processedParts && Array.isArray(log.processedParts)) {
                totalProcessedCount += log.processedParts.length;
                log.processedParts.forEach(p => {
                    if (p.code) {
                        const code = p.code.toUpperCase();
                        partFrequency[code] = (partFrequency[code] || 0) + 1;
                    }
                });
            }
            if (log.changedParts && Array.isArray(log.changedParts)) {
                totalChangedCount += log.changedParts.length;
                log.changedParts.forEach(p => {
                    if (p.code) {
                        const code = p.code.toUpperCase();
                        partFrequency[code] = (partFrequency[code] || 0) + 1;
                    }
                });
            }
        });

        const topParts = Object.entries(partFrequency)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);

        return {
            totalMaintenance: logs.length,
            totalProcessed: totalProcessedCount,
            totalChanged: totalChangedCount,
            topParts
        };
    }, [logs]);

    // --- FİLTRELEME ---
    const filteredMolds = useMemo(() => {
        return molds.filter(m => {
            const matchesSearch = (m.moldName || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
                                  (m.moldCode || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                                  (m.customer || '').toLowerCase().includes(searchTerm.toLowerCase());
            const matchesStatus = statusFilter === 'ALL' || m.currentStatus === statusFilter;
            return matchesSearch && matchesStatus;
        });
    }, [molds, searchTerm, statusFilter]);

    // --- İŞLEMLER ---

    const handleCreateMold = async () => {
        if (!newMoldData.moldName || !newMoldData.moldCode) return alert("Kalıp Adı ve Kodu zorunludur.");
        setIsSaving(true);
        try {
            let photoUrl = '';
            if (newMoldImage) {
                const storageRef = ref(storage, `maintenance_molds/${Date.now()}_${newMoldImage.name}`);
                await uploadBytes(storageRef, newMoldImage);
                photoUrl = await getDownloadURL(storageRef);
            }

            await addDoc(collection(db, MAINTENANCE_MOLDS_COLLECTION), {
                ...newMoldData,
                currentStatus: MAINTENANCE_STATUS.READY,
                createdAt: getCurrentDateTimeString(),
                photoUrl: photoUrl
            });
            setIsAddMoldOpen(false);
            setNewMoldData({ moldCode: '', moldName: '', customer: '' });
            setNewMoldImage(null);
        } catch (error) { console.error(error); alert("Hata oluştu."); }
        finally { setIsSaving(false); }
    };

    const handleAddLog = async () => {
        if (!newLogData.issueTitle) return alert("Lütfen Arıza/Şikayet başlığını giriniz.");
        if (!newLogData.description) return alert("Yapılan işlemi açıklayınız.");
        setIsSaving(true);
        
        try {
            const now = getCurrentDateTimeString();
            
            const validProcessedParts = processedPartsList.filter(p => p.code.trim() !== '');
            const validChangedParts = changedPartsList.filter(p => p.code.trim() !== '');

            await addDoc(collection(db, MAINTENANCE_LOGS_COLLECTION), {
                moldId: selectedMoldId,
                date: now,
                ...newLogData,
                processedParts: validProcessedParts,
                changedParts: validChangedParts,
                photosBefore: logImagesBefore, 
                photosAfter: logImagesAfter,
                comments: []
            });

            if (newLogData.type === MAINTENANCE_TYPES.FAULT) {
                await updateDoc(doc(db, MAINTENANCE_MOLDS_COLLECTION, selectedMoldId), {
                    currentStatus: MAINTENANCE_STATUS.IN_MAINTENANCE
                });
            }

            setIsAddLogOpen(false);
            setNewLogData({ type: MAINTENANCE_TYPES.FAULT, issueTitle: '', description: '', performedBy: loggedInUser?.name });
            setProcessedPartsList([{ code: '', process: '' }, { code: '', process: '' }, { code: '', process: '' }]);
            setChangedPartsList([{ code: '', desc: '' }, { code: '', desc: '' }, { code: '', desc: '' }]);
            setLogImagesBefore([]);
            setLogImagesAfter([]);

        } catch (error) { console.error(error); alert("Hata oluştu."); }
        finally { setIsSaving(false); }
    };

    const handleToggleStatus = async (newStatus) => {
        if (!selectedMold) return;
        await updateDoc(doc(db, MAINTENANCE_MOLDS_COLLECTION, selectedMoldId), {
            currentStatus: newStatus
        });
    };

    const handleLogImageUpload = async (e, category) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;
        setIsUploading(true);
        const uploadedUrls = [];
        try {
            for (const file of files) {
                const storageRef = ref(storage, `maintenance_logs/${selectedMoldId}/${category}_${Date.now()}_${file.name}`);
                await uploadBytes(storageRef, file);
                const url = await getDownloadURL(storageRef);
                uploadedUrls.push(url);
            }
            if (category === 'BEFORE') {
                setLogImagesBefore([...logImagesBefore, ...uploadedUrls]);
            } else {
                setLogImagesAfter([...logImagesAfter, ...uploadedUrls]);
            }
        } catch (error) { console.error(error); alert("Resim yüklenemedi."); } 
        finally { setIsUploading(false); }
    };

    const handleAddImageToExistingLog = async (e, log, category) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;
        
        setUploadingForLogId(log.id); 
        const uploadedUrls = [];

        try {
            for (const file of files) {
                const storageRef = ref(storage, `maintenance_logs/${selectedMoldId}/${category}_${Date.now()}_${file.name}`);
                await uploadBytes(storageRef, file);
                const url = await getDownloadURL(storageRef);
                uploadedUrls.push(url);
            }

            const fieldToUpdate = category === 'BEFORE' ? 'photosBefore' : 'photosAfter';
            await updateDoc(doc(db, MAINTENANCE_LOGS_COLLECTION, log.id), {
                [fieldToUpdate]: arrayUnion(...uploadedUrls)
            });

        } catch (error) {
            console.error("Sonradan resim ekleme hatası:", error);
            alert("Resim yüklenirken hata oluştu.");
        } finally {
            setUploadingForLogId(null);
        }
    };

    const handleSendComment = async (logId) => {
        const text = commentText[logId];
        if (!text || !text.trim()) return;

        try {
            const commentData = {
                id: Date.now(),
                user: loggedInUser.name,
                text: text.trim(),
                date: getCurrentDateTimeString()
            };

            await updateDoc(doc(db, MAINTENANCE_LOGS_COLLECTION, logId), {
                comments: arrayUnion(commentData)
            });
            setCommentText(prev => ({ ...prev, [logId]: '' }));

        } catch (error) {
            console.error("Yorum ekleme hatası:", error);
            alert("Yorum eklenemedi.");
        }
    };

    const updatePartRow = (listType, index, field, value) => {
        if (listType === 'PROCESSED') {
            const newList = [...processedPartsList];
            newList[index][field] = value;
            setProcessedPartsList(newList);
        } else {
            const newList = [...changedPartsList];
            newList[index][field] = value;
            setChangedPartsList(newList);
        }
    };

    const addPartRow = (listType) => {
        if (listType === 'PROCESSED') {
            setProcessedPartsList([...processedPartsList, { code: '', process: '' }]);
        } else {
            setChangedPartsList([...changedPartsList, { code: '', desc: '' }]);
        }
    };

    return (
        <div className="flex h-[calc(100vh-80px)] bg-gray-100 dark:bg-gray-900 overflow-hidden">
            
            {/* SOL PANEL (Tablet/Mobilde gizlenebilir veya daraltılabilir ama şimdilik standart bırakıyoruz) */}
            <div className="w-1/3 md:w-1/4 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col">
                <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                    <button 
                        onClick={() => setIsAddMoldOpen(true)}
                        className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold flex items-center justify-center mb-3 shadow-md transition"
                    >
                        <Plus className="w-5 h-5 mr-2" /> Yeni Kalıp Kartı
                    </button>
                    <div className="relative mb-3">
                        <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                        <input 
                            type="text" 
                            placeholder="Kalıp Ara..." 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-9 p-2 text-sm border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => setStatusFilter('ALL')} className={`flex-1 text-xs font-bold py-1 rounded ${statusFilter === 'ALL' ? 'bg-gray-200 dark:bg-gray-600' : 'text-gray-500'}`}>Tümü</button>
                        <button onClick={() => setStatusFilter(MAINTENANCE_STATUS.READY)} className={`flex-1 text-xs font-bold py-1 rounded ${statusFilter === MAINTENANCE_STATUS.READY ? 'bg-green-100 text-green-700' : 'text-gray-500'}`}>Hazır</button>
                        <button onClick={() => setStatusFilter(MAINTENANCE_STATUS.IN_MAINTENANCE)} className={`flex-1 text-xs font-bold py-1 rounded ${statusFilter === MAINTENANCE_STATUS.IN_MAINTENANCE ? 'bg-red-100 text-red-700' : 'text-gray-500'}`}>Bakımda</button>
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                    {filteredMolds.map(mold => (
                        <div 
                            key={mold.id} 
                            onClick={() => setSelectedMoldId(mold.id)}
                            className={`p-3 rounded-lg border cursor-pointer transition hover:shadow-md ${selectedMoldId === mold.id ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-500 ring-1 ring-blue-500' : 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600'}`}
                        >
                            <div className="flex justify-between items-start">
                                <div>
                                    <div className="font-bold text-sm text-gray-900 dark:text-white">{mold.moldCode}</div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400">{mold.moldName}</div>
                                </div>
                                {mold.currentStatus === MAINTENANCE_STATUS.READY ? (
                                    <CheckCircle className="w-5 h-5 text-green-500" />
                                ) : (
                                    <Wrench className="w-5 h-5 text-red-500 animate-pulse" />
                                )}
                            </div>
                            <div className="mt-2 flex justify-between items-center text-[10px] text-gray-400">
                                <span>{mold.customer}</span>
                                <ChevronRight className="w-3 h-3" />
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* SAĞ PANEL: DETAY */}
            <div className="flex-1 flex flex-col bg-gray-50 dark:bg-gray-900 overflow-hidden">
                {selectedMold ? (
                    <>
                        {/* HEADER - RESPONSIVE (DÜZELTME BURADA) */}
                        <div className="bg-white dark:bg-gray-800 p-4 shadow-sm border-b border-gray-200 dark:border-gray-700">
                            {/* Ana Flex Konteyner: Büyük ekranda tek satır, tablette satırlara bölünür */}
                            <div className="flex flex-col lg:flex-row gap-4">
                                
                                {/* 1. Bölüm: Resim ve Bilgi (Sol Üst) */}
                                <div className="flex items-start gap-3 flex-1">
                                    <div className="w-20 h-20 bg-gray-200 dark:bg-gray-700 rounded-lg flex items-center justify-center text-gray-400 overflow-hidden border border-gray-300 dark:border-gray-600 shrink-0">
                                        {selectedMold.photoUrl ? <img src={selectedMold.photoUrl} alt="Kalıp" className="w-full h-full object-cover" /> : <ImageIcon className="w-8 h-8" />}
                                    </div>
                                    <div className="min-w-0">
                                        <h1 className="text-xl font-bold text-gray-900 dark:text-white truncate">{selectedMold.moldName}</h1>
                                        <p className="text-md text-gray-600 dark:text-gray-300 font-mono font-bold">{selectedMold.moldCode}</p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{selectedMold.customer}</p>
                                        <div className="mt-2">
                                            <span className={`px-3 py-1 text-xs font-bold rounded-full flex items-center w-fit ${selectedMold.currentStatus === MAINTENANCE_STATUS.READY ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                                {selectedMold.currentStatus === MAINTENANCE_STATUS.READY ? <CheckCircle className="w-3 h-3 mr-1"/> : <Wrench className="w-3 h-3 mr-1"/>}
                                                {selectedMold.currentStatus}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Tablette Yan Yana Durması Gereken Alan (Analiz + Butonlar) */}
                                <div className="flex flex-col md:flex-row lg:items-start gap-4 shrink-0 w-full lg:w-auto">
                                    
                                    {/* 2. Bölüm: İstatistik Kartı (Orta) */}
                                    {moldStats && (
                                        <div className="bg-blue-50 dark:bg-blue-900/30 p-2 rounded-lg border border-blue-100 dark:border-blue-800 text-sm flex-1 md:w-64 min-w-[200px]">
                                            <h4 className="font-bold text-blue-800 dark:text-blue-200 mb-2 flex items-center text-xs"><LayoutDashboard className="w-3 h-3 mr-1"/> Kalıp Analizi</h4>
                                            <div className="grid grid-cols-3 gap-1 text-center mb-1">
                                                <div className="bg-white dark:bg-gray-800 p-1 rounded shadow-sm">
                                                    <div className="text-[10px] text-gray-500 dark:text-gray-400">Bakım</div>
                                                    <div className="font-bold text-sm text-gray-900 dark:text-white">{moldStats.totalMaintenance}</div>
                                                </div>
                                                <div className="bg-white dark:bg-gray-800 p-1 rounded shadow-sm">
                                                    <div className="text-[10px] text-gray-500 dark:text-gray-400">İşlem</div>
                                                    <div className="font-bold text-sm text-gray-900 dark:text-white">{moldStats.totalProcessed}</div>
                                                </div>
                                                <div className="bg-white dark:bg-gray-800 p-1 rounded shadow-sm">
                                                    <div className="text-[10px] text-gray-500 dark:text-gray-400">Değişen</div>
                                                    <div className="font-bold text-sm text-red-600 dark:text-red-400">{moldStats.totalChanged}</div>
                                                </div>
                                            </div>
                                            {moldStats.topParts.length > 0 && (
                                                <div className="mt-1">
                                                    <p className="text-[10px] font-bold text-gray-600 dark:text-gray-300 mb-0.5">⚠️ Sorunlu Parçalar:</p>
                                                    <ul className="text-[10px] space-y-0.5">
                                                        {moldStats.topParts.slice(0, 2).map(([code, count]) => ( // Tablette yer kazanmak için sadece ilk 2'yi göster
                                                            <li key={code} className="flex justify-between px-1">
                                                                <span className="font-mono text-gray-800 dark:text-gray-300 truncate max-w-[80px]">{code}</span>
                                                                <span className="font-bold text-red-500 dark:text-red-400">{count} kez</span>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* 3. Bölüm: Büyük Aksiyon Butonları (Sağ) */}
                                    <div className="flex flex-row md:flex-col gap-2 w-full md:w-40 shrink-0">
                                        <button 
                                            onClick={() => setIsAddLogOpen(true)}
                                            className="flex-1 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-bold shadow-sm flex items-center justify-center transition active:scale-95 text-xs md:text-sm"
                                        >
                                            <Plus className="w-4 h-4 mr-1 md:mr-2" /> İşlem Ekle
                                        </button>

                                        {selectedMold.currentStatus === MAINTENANCE_STATUS.READY ? (
                                            <button 
                                                onClick={() => handleToggleStatus(MAINTENANCE_STATUS.IN_MAINTENANCE)}
                                                className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold shadow-sm flex items-center justify-center transition active:scale-95 text-xs md:text-sm"
                                            >
                                                <Wrench className="w-4 h-4 mr-1 md:mr-2" /> BAKIMA AL
                                            </button>
                                        ) : (
                                            <button 
                                                onClick={() => handleToggleStatus(MAINTENANCE_STATUS.READY)}
                                                className="flex-1 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-bold shadow-sm flex items-center justify-center transition active:scale-95 text-xs md:text-sm"
                                            >
                                                <CheckCircle className="w-4 h-4 mr-1 md:mr-2" /> BAKIMI BİTİR
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* TİMELİNE */}
                        <div className="flex-1 overflow-y-auto p-4 md:p-6">
                            <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-4 flex items-center">
                                <History className="w-5 h-5 mr-2" /> Geçmiş İşlemler
                            </h3>
                            
                            <div className="relative border-l-2 border-gray-200 dark:border-gray-700 ml-3 space-y-8">
                                {logs.map((log) => (
                                    <div key={log.id} className="relative pl-8">
                                        <div className={`absolute -left-[9px] top-0 w-4 h-4 rounded-full border-2 border-white dark:border-gray-900 ${
                                            log.type === MAINTENANCE_TYPES.FAULT ? 'bg-red-500' : 
                                            log.type === MAINTENANCE_TYPES.PERIODIC ? 'bg-blue-500' : 'bg-purple-500'
                                        }`}></div>
                                        
                                        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
                                            {/* Header */}
                                            <div className="flex justify-between items-start mb-2">
                                                <div>
                                                    <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                                                        log.type === MAINTENANCE_TYPES.FAULT ? 'bg-red-100 text-red-800' : 
                                                        log.type === MAINTENANCE_TYPES.PERIODIC ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'
                                                    }`}>
                                                        {log.type}
                                                    </span>
                                                    <span className="text-xs text-gray-400 ml-2 font-mono">{formatDateTR(log.date)}</span>
                                                </div>
                                                <div className="text-xs font-medium text-gray-500 flex items-center">
                                                    <User className="w-3 h-3 mr-1" /> {log.performedBy}
                                                </div>
                                            </div>
                                            
                                            {log.issueTitle && (
                                                <h4 className="text-md font-bold text-gray-900 dark:text-white mb-2 border-b border-gray-100 dark:border-gray-700 pb-1">
                                                    {log.issueTitle}
                                                </h4>
                                            )}

                                            <p className="text-gray-800 dark:text-gray-200 text-sm whitespace-pre-wrap mb-4">
                                                {log.description}
                                            </p>

                                            {/* PARÇA LİSTELERİ */}
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                                {log.processedParts && log.processedParts.length > 0 && (
                                                    <div className="bg-blue-50 dark:bg-blue-900/10 p-3 rounded-lg border border-blue-100 dark:border-blue-900/30">
                                                        <h5 className="text-xs font-bold text-blue-700 dark:text-blue-300 mb-2 flex items-center"><Settings className="w-3 h-3 mr-1"/> İşlem Gören Parçalar</h5>
                                                        <ul className="space-y-1">
                                                            {log.processedParts.map((p, i) => (
                                                                <li key={i} className="text-xs flex justify-between border-b border-blue-100 dark:border-blue-800/30 last:border-0 pb-1">
                                                                    <span className="font-mono font-bold text-gray-700 dark:text-gray-300">{p.code}</span>
                                                                    <span className="text-gray-500">{p.process}</span>
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                )}
                                                
                                                {(log.changedParts && (typeof log.changedParts === 'string' ? log.changedParts : log.changedParts.length > 0)) && (
                                                    <div className="bg-red-50 dark:bg-red-900/10 p-3 rounded-lg border border-red-100 dark:border-red-900/30">
                                                        <h5 className="text-xs font-bold text-red-700 dark:text-red-300 mb-2 flex items-center"><Trash2 className="w-3 h-3 mr-1"/> Değişen Parçalar</h5>
                                                        {Array.isArray(log.changedParts) ? (
                                                            <ul className="space-y-1">
                                                                {log.changedParts.map((p, i) => (
                                                                    <li key={i} className="text-xs flex justify-between border-b border-red-100 dark:border-red-800/30 last:border-0 pb-1">
                                                                        <span className="font-mono font-bold text-gray-700 dark:text-gray-300">{p.code}</span>
                                                                        <span className="text-gray-500">{p.desc}</span>
                                                                    </li>
                                                                ))}
                                                            </ul>
                                                        ) : (
                                                            <p className="text-xs text-gray-600">{log.changedParts}</p>
                                                        )}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Resimler: ÖNCE ve SONRA */}
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                {/* Önce */}
                                                <div>
                                                    <div className="flex justify-between items-center mb-2">
                                                        <p className="text-xs font-bold text-gray-500">📸 Geliş Hali (Sorun)</p>
                                                        <label className="cursor-pointer text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-3 py-1 rounded transition">
                                                            {uploadingForLogId === log.id ? '...' : '+ Foto Ekle'}
                                                            <input type="file" multiple accept="image/*" className="hidden" onChange={(e) => handleAddImageToExistingLog(e, log, 'BEFORE')} disabled={!!uploadingForLogId} />
                                                        </label>
                                                    </div>
                                                    {log.photosBefore && log.photosBefore.length > 0 ? (
                                                        <div className="flex gap-2 overflow-x-auto pb-2">
                                                            {log.photosBefore.map((url, idx) => (
                                                                <button 
                                                                    key={idx} 
                                                                    onClick={() => openLightbox(log.photosBefore, idx)}
                                                                    className="block w-20 h-20 flex-shrink-0 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-600 hover:opacity-80 transition group relative"
                                                                >
                                                                    <img src={url} alt="Önce" className="w-full h-full object-cover" />
                                                                </button>
                                                            ))}
                                                        </div>
                                                    ) : <span className="text-xs text-gray-400 italic">- Fotoğraf yok -</span>}
                                                </div>
                                                
                                                {/* Sonra */}
                                                <div>
                                                    <div className="flex justify-between items-center mb-2">
                                                        <p className="text-xs font-bold text-green-600">✨ Bitiş Hali (Çözüm)</p>
                                                        <label className="cursor-pointer text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-3 py-1 rounded transition">
                                                            {uploadingForLogId === log.id ? '...' : '+ Foto Ekle'}
                                                            <input type="file" multiple accept="image/*" className="hidden" onChange={(e) => handleAddImageToExistingLog(e, log, 'AFTER')} disabled={!!uploadingForLogId} />
                                                        </label>
                                                    </div>
                                                    {log.photosAfter && log.photosAfter.length > 0 ? (
                                                        <div className="flex gap-2 overflow-x-auto pb-2">
                                                            {log.photosAfter.map((url, idx) => (
                                                                <button 
                                                                    key={idx} 
                                                                    onClick={() => openLightbox(log.photosAfter, idx)}
                                                                    className="block w-20 h-20 flex-shrink-0 rounded-lg overflow-hidden border-2 border-green-200 dark:border-green-800 hover:opacity-80 transition group relative"
                                                                >
                                                                    <img src={url} alt="Sonra" className="w-full h-full object-cover" />
                                                                </button>
                                                            ))}
                                                        </div>
                                                    ) : <span className="text-xs text-gray-400 italic">- Fotoğraf yok -</span>}
                                                </div>
                                            </div>

                                            {/* YORUMLAR */}
                                            <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-700">
                                                <h6 className="text-xs font-bold text-gray-600 dark:text-gray-400 mb-2 flex items-center">
                                                    <MessageSquare className="w-3 h-3 mr-1"/> Yorumlar ({log.comments ? log.comments.length : 0})
                                                </h6>
                                                
                                                {/* Yorum Listesi */}
                                                {log.comments && log.comments.length > 0 && (
                                                    <div className="space-y-2 mb-3 max-h-32 overflow-y-auto bg-gray-50 dark:bg-gray-900/30 p-2 rounded">
                                                        {log.comments.map((comment) => (
                                                            <div key={comment.id} className="text-xs">
                                                                <span className="font-bold text-gray-800 dark:text-gray-300">{comment.user}: </span>
                                                                <span className="text-gray-600 dark:text-gray-400">{comment.text}</span>
                                                                <span className="text-[10px] text-gray-400 ml-2 block">{formatDateTime(comment.date)}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}

                                                {/* Yorum Yazma */}
                                                <div className="flex gap-2">
                                                    <input 
                                                        type="text" 
                                                        placeholder="Yorum yaz..." 
                                                        value={commentText[log.id] || ''}
                                                        onChange={(e) => setCommentText(prev => ({...prev, [log.id]: e.target.value}))}
                                                        className="flex-1 text-xs p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                                    />
                                                    <button 
                                                        onClick={() => handleSendComment(log.id)}
                                                        disabled={!commentText[log.id]}
                                                        className="p-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                                                    >
                                                        <Send className="w-3 h-3" />
                                                    </button>
                                                </div>
                                            </div>

                                        </div>
                                    </div>
                                ))}
                                {logs.length === 0 && (
                                    <div className="pl-8 text-gray-400 italic text-sm">Henüz kayıt girilmemiş.</div>
                                )}
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center text-gray-400 opacity-60">
                        <Wrench className="w-24 h-24 mb-4" />
                        <p className="text-xl font-medium">Sol menüden bir kalıp seçiniz.</p>
                    </div>
                )}
            </div>

            {/* --- LIGHTBOX (TAM EKRAN RESİM) --- */}
            {lightbox.isOpen && (
                <div className="fixed inset-0 bg-black/95 z-[100] flex items-center justify-center animate-in fade-in duration-200" onClick={closeLightbox}>
                    <button onClick={closeLightbox} className="absolute top-4 right-4 text-white hover:text-gray-300 z-50 p-2">
                        <X className="w-8 h-8" />
                    </button>
                    
                    <div className="relative flex items-center justify-center w-full h-full" onClick={e => e.stopPropagation()}>
                        {lightbox.images.length > 1 && (
                            <button onClick={prevImage} className="absolute left-4 p-3 text-white hover:bg-white/10 rounded-full transition z-50">
                                <ChevronLeft className="w-10 h-10" />
                            </button>
                        )}
                        
                        <img 
                            src={lightbox.images[lightbox.currentIndex]} 
                            alt="Full View" 
                            className="max-h-[90vh] max-w-[90vw] object-contain rounded shadow-2xl"
                        />

                        {lightbox.images.length > 1 && (
                            <button onClick={nextImage} className="absolute right-4 p-3 text-white hover:bg-white/10 rounded-full transition z-50">
                                <ChevronRight className="w-10 h-10" />
                            </button>
                        )}
                        
                        {/* Resim Sayacı */}
                        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 text-white bg-black/50 px-3 py-1 rounded-full text-sm">
                            {lightbox.currentIndex + 1} / {lightbox.images.length}
                        </div>
                    </div>
                </div>
            )}

            {/* --- MODAL: YENİ KALIP EKLE --- */}
            <SimpleModal isOpen={isAddMoldOpen} onClose={() => setIsAddMoldOpen(false)} title="Yeni Kalıp Kartı Aç">
                <div className="space-y-4">
                    <div className="flex justify-center mb-4">
                        <label className="cursor-pointer flex flex-col items-center justify-center w-32 h-32 bg-gray-100 dark:bg-gray-700 rounded-lg border-2 border-dashed border-gray-300 hover:border-blue-500 transition relative overflow-hidden">
                            {newMoldImage ? (
                                <img src={URL.createObjectURL(newMoldImage)} alt="Preview" className="w-full h-full object-cover" />
                            ) : (
                                <>
                                    <Camera className="w-8 h-8 text-gray-400 mb-1" />
                                    <span className="text-xs text-gray-500">Resim Seç</span>
                                </>
                            )}
                            <input type="file" className="hidden" accept="image/*" onChange={(e) => setNewMoldImage(e.target.files[0])} />
                        </label>
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Kalıp Kodu</label>
                        <input type="text" value={newMoldData.moldCode} onChange={e => setNewMoldData({...newMoldData, moldCode: e.target.value})} className="w-full p-2 border rounded dark:bg-gray-700 dark:text-white" placeholder="Örn: K-105" />
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Kalıp Adı</label>
                        <input type="text" value={newMoldData.moldName} onChange={e => setNewMoldData({...newMoldData, moldName: e.target.value})} className="w-full p-2 border rounded dark:bg-gray-700 dark:text-white" placeholder="Örn: Gövde Kalıbı" />
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Müşteri</label>
                        <input type="text" value={newMoldData.customer} onChange={e => setNewMoldData({...newMoldData, customer: e.target.value})} className="w-full p-2 border rounded dark:bg-gray-700 dark:text-white" placeholder="Firma Adı" />
                    </div>
                    <button onClick={handleCreateMold} disabled={isSaving} className="w-full py-2 bg-blue-600 text-white rounded font-bold hover:bg-blue-700 mt-4 disabled:opacity-50">
                        {isSaving ? 'Kaydediliyor...' : 'KAYDET'}
                    </button>
                </div>
            </SimpleModal>

            {/* --- MODAL: BAKIM KAYDI EKLE --- */}
            <SimpleModal isOpen={isAddLogOpen} onClose={() => setIsAddLogOpen(false)} title="Yeni İşlem / Bakım Kaydı" size="max-w-4xl">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">İşlem Tipi</label>
                                <select 
                                    value={newLogData.type} 
                                    onChange={e => setNewLogData({...newLogData, type: e.target.value})} 
                                    className="w-full p-2 border rounded dark:bg-gray-700 dark:text-white"
                                >
                                    {Object.values(MAINTENANCE_TYPES).map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Arıza/Şikayet Başlığı</label>
                                <input 
                                    type="text"
                                    value={newLogData.issueTitle} 
                                    onChange={e => setNewLogData({...newLogData, issueTitle: e.target.value})} 
                                    className="w-full p-2 border rounded dark:bg-gray-700 dark:text-white"
                                    placeholder="Örn: Su Kaçağı"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Yapılan İşlemler (Detaylı)</label>
                            <textarea 
                                value={newLogData.description} 
                                onChange={e => setNewLogData({...newLogData, description: e.target.value})} 
                                className="w-full p-2 border rounded h-32 dark:bg-gray-700 dark:text-white resize-none" 
                                placeholder="Örn: İtici pimler yağlandı, maça yüzeyi parlatıldı..."
                            />
                        </div>
                        
                        {/* RESİM YÜKLEME ALANI (İKİ BÖLÜM) */}
                        <div className="grid grid-cols-2 gap-4">
                            {/* ÖNCE */}
                            <div className="border border-dashed border-gray-300 dark:border-gray-600 rounded p-2 bg-gray-50 dark:bg-gray-700/50">
                                <label className="block text-xs font-bold text-gray-500 mb-1 text-center">📷 İlk Hali (Geliş)</label>
                                <label className="cursor-pointer block text-center p-4 bg-white dark:bg-gray-600 rounded border hover:bg-gray-100 transition">
                                    <span className="text-sm font-bold text-blue-600">{isUploading ? '...' : '+ Foto Ekle'}</span>
                                    <input type="file" multiple accept="image/*" className="hidden" onChange={(e) => handleLogImageUpload(e, 'BEFORE')} disabled={isUploading} />
                                </label>
                                {logImagesBefore.length > 0 && (
                                    <div className="flex gap-1 mt-2 overflow-x-auto">
                                        {logImagesBefore.map((url, i) => (
                                            <div key={i} className="relative w-10 h-10 flex-shrink-0">
                                                <img src={url} alt="before" className="w-full h-full object-cover rounded" />
                                                <button onClick={() => setLogImagesBefore(logImagesBefore.filter((_, idx) => idx !== i))} className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 w-3 h-3 flex items-center justify-center text-[8px]">x</button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* SONRA */}
                            <div className="border border-dashed border-green-300 dark:border-green-800 rounded p-2 bg-green-50 dark:bg-green-900/10">
                                <label className="block text-xs font-bold text-green-700 mb-1 text-center">✨ Son Hali (Bitiş)</label>
                                <label className="cursor-pointer block text-center p-4 bg-white dark:bg-gray-600 rounded border hover:bg-gray-100 transition">
                                    <span className="text-sm font-bold text-blue-600">{isUploading ? '...' : '+ Foto Ekle'}</span>
                                    <input type="file" multiple accept="image/*" className="hidden" onChange={(e) => handleLogImageUpload(e, 'AFTER')} disabled={isUploading} />
                                </label>
                                {logImagesAfter.length > 0 && (
                                    <div className="flex gap-1 mt-2 overflow-x-auto">
                                        {logImagesAfter.map((url, i) => (
                                            <div key={i} className="relative w-10 h-10 flex-shrink-0">
                                                <img src={url} alt="after" className="w-full h-full object-cover rounded" />
                                                <button onClick={() => setLogImagesAfter(logImagesAfter.filter((_, idx) => idx !== i))} className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 w-3 h-3 flex items-center justify-center text-[8px]">x</button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="space-y-6 overflow-y-auto max-h-[60vh] pr-2">
                        {/* İŞLEM GÖREN PARÇALAR */}
                        <div className="bg-blue-50 dark:bg-blue-900/10 p-4 rounded-lg border border-blue-100 dark:border-blue-800">
                            <div className="flex justify-between items-center mb-2">
                                <h4 className="font-bold text-blue-800 dark:text-blue-300 text-sm">🛠️ İşlem Gören Parçalar (Tamir)</h4>
                                <button onClick={() => addPartRow('PROCESSED')} className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700">+ Ekle</button>
                            </div>
                            <div className="space-y-2">
                                {processedPartsList.map((part, index) => (
                                    <div key={index} className="flex gap-2">
                                        <input 
                                            type="text" 
                                            placeholder="Parça Kodu (H1)" 
                                            className="w-1/3 p-1.5 text-sm border rounded dark:bg-gray-700 dark:text-white"
                                            value={part.code}
                                            onChange={(e) => updatePartRow('PROCESSED', index, 'code', e.target.value)}
                                        />
                                        <input 
                                            type="text" 
                                            placeholder="İşlem (Kaynak, Parlatma...)" 
                                            className="w-2/3 p-1.5 text-sm border rounded dark:bg-gray-700 dark:text-white"
                                            value={part.process}
                                            onChange={(e) => updatePartRow('PROCESSED', index, 'process', e.target.value)}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* DEĞİŞEN PARÇALAR */}
                        <div className="bg-red-50 dark:bg-red-900/10 p-4 rounded-lg border border-red-100 dark:border-red-800">
                            <div className="flex justify-between items-center mb-2">
                                <h4 className="font-bold text-red-800 dark:text-red-300 text-sm">🗑️ Değişen Parçalar (Yenisi Takıldı)</h4>
                                <button onClick={() => addPartRow('CHANGED')} className="text-xs bg-red-600 text-white px-2 py-1 rounded hover:bg-red-700">+ Ekle</button>
                            </div>
                            <div className="space-y-2">
                                {changedPartsList.map((part, index) => (
                                    <div key={index} className="flex gap-2">
                                        <input 
                                            type="text" 
                                            placeholder="Parça Kodu (Pim-2)" 
                                            className="w-1/3 p-1.5 text-sm border rounded dark:bg-gray-700 dark:text-white"
                                            value={part.code}
                                            onChange={(e) => updatePartRow('CHANGED', index, 'code', e.target.value)}
                                        />
                                        <input 
                                            type="text" 
                                            placeholder="Açıklama (Kırıldı, Ezildi...)" 
                                            className="w-2/3 p-1.5 text-sm border rounded dark:bg-gray-700 dark:text-white"
                                            value={part.desc}
                                            onChange={(e) => updatePartRow('CHANGED', index, 'desc', e.target.value)}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
                
                <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700 flex justify-end">
                    <button onClick={handleAddLog} disabled={isSaving || isUploading} className="px-8 py-3 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700 disabled:opacity-50 shadow-lg">
                        {isSaving ? 'KAYDEDİLİYOR...' : 'KAYDET VE BİTİR'}
                    </button>
                </div>
            </SimpleModal>

        </div>
    );
};

export default MoldMaintenancePage;