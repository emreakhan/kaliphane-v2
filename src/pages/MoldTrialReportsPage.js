// src/pages/MoldTrialReportsPage.js

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { 
    Search, Activity, Camera, Save, 
    Thermometer, Gauge, Clock, 
    CheckCircle, FileText, Trash2,
    Image as ImageIcon, Plus, PlayCircle,
    X, ChevronLeft, ChevronRight, 
    Edit3, Type, Circle as CircleIcon, Check, 
    MessageSquare, ThumbsUp, ThumbsDown, AlertTriangle
} from 'lucide-react';
import { 
    collection, addDoc, query, where, limit, orderBy, onSnapshot, updateDoc, doc 
} from '../config/firebase.js'; 
import { PROJECT_COLLECTION } from '../config/constants.js'; 
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
    
    // Varsayılan sekme 'QUICK_NOTES' (Rapor)
    const [activeTab, setActiveTab] = useState('QUICK_NOTES'); 
    const [isSaving, setIsSaving] = useState(false);
    
    // VERİ YÖNETİMİ
    const [reports, setReports] = useState([]); 

    // GALERİ (LIGHTBOX) STATE'İ
    const [lightboxIndex, setLightboxIndex] = useState(null); 
    const [previewImage, setPreviewImage] = useState(null); // Not görseli önizleme

    // GÖRSEL DÜZENLEME STATE'LERİ
    const [isEditing, setIsEditing] = useState(false);
    const [editTool, setEditTool] = useState('PEN');
    const [drawingColor, setDrawingColor] = useState('#ef4444');

    // SATIR İÇİ YORUM STATE'LERİ
    const [commentingNoteId, setCommentingNoteId] = useState(null); 
    const [commentText, setCommentText] = useState(''); 

    // Refler
    const fileInputRef = useRef(null);
    const quickNoteFileInputRef = useRef(null); 
    const canvasRef = useRef(null);
    const isDrawing = useRef(false);
    const startPos = useRef({ x: 0, y: 0 });
    const snapshot = useRef(null);

    // Form Verileri
    const getInitialTrialData = (phase = 'T0') => ({
        id: null,
        trialCode: `TRY-${new Date().getFullYear()}-${Math.floor(Math.random()*10000)}`,
        phase: phase,
        date: getCurrentDateTimeString(),
        machine: '',
        material: '',
        cavity: '',
        
        temps: { nozzle: '', zone1: '', zone2: '', zone3: '', zone4: '', moldFixed: '', moldMoving: '' },
        pressures: { injection: '', holding: '', holdingTime: '', backPressure: '' },
        speeds: { injectionSpeed: '', switchPoint: '', cushion: '' },
        times: { cooling: '', cycle: '' },
        
        media: [], 
        defects: [],
        result: 'WAITING', 
        notes: '',
        quickNotes: [] 
    });

    const [trialData, setTrialData] = useState(getInitialTrialData());
    const [newQuickNoteText, setNewQuickNoteText] = useState('');
    const [newQuickNoteImage, setNewQuickNoteImage] = useState(null); 

    // --- VERİ ÇEKME ---
    useEffect(() => {
        if (!selectedMold || !db) return;
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

    useEffect(() => {
        if (selectedMold) {
            if (reports.length > 0) {
                if (!trialData.id && trialData.machine === '') {
                    setTrialData({ ...reports[0] });
                }
            } else {
                if (!trialData.id && trialData.machine === '') {
                    setTrialData(getInitialTrialData('T0'));
                }
            }
        }
    }, [selectedMold, reports]);

    const handlePhaseChange = (newPhase) => {
        const existingReport = reports.find(r => r.phase === newPhase);
        if (existingReport) {
            setTrialData({ ...existingReport });
        } else {
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
                return (status.includes('DENEME') || status.includes('TRIAL') || status.includes('TASH') || status.includes('ALIŞTIRMA'));
            });
        } else if (listFilter === 'APPROVED') {
            filtered = projects.filter(p => {
                const status = p.status ? p.status.toString().toUpperCase().trim() : '';
                return (status === 'ONAY' || status === 'APPROVED' || status === 'SERİ ONAY');
            });
        } else if (listFilter === 'REJECTED') {
            filtered = projects.filter(p => {
                const status = p.status ? p.status.toString().toUpperCase().trim() : '';
                return (status === 'RET' || status === 'REJECTED' || status === 'İPTAL');
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
        setReports([]); 
        setTrialData(getInitialTrialData('T0')); 
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

    // --- DOSYA YÜKLEME VE SIKIŞTIRMA (TABLET/TELEFON HATASINI ÇÖZEN KISIM) ---
    const handleTriggerFileUpload = () => fileInputRef.current.click();

    // YENİ: Firebase boyut sınırına takılmamak için resmi yüklemeden önce küçültür
    const compressAndConvertToBase64 = (file) => {
        return new Promise((resolve, reject) => {
            if (file.type.startsWith('video/')) {
                const reader = new FileReader();
                reader.readAsDataURL(file);
                reader.onload = () => resolve(reader.result);
                reader.onerror = error => reject(error);
                return;
            }

            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = (event) => {
                const img = new Image();
                img.src = event.target.result;
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const MAX_WIDTH = 1200; // Maksimum genişlik
                    const MAX_HEIGHT = 1200; // Maksimum yükseklik
                    let width = img.width;
                    let height = img.height;

                    if (width > height) {
                        if (width > MAX_WIDTH) {
                            height *= MAX_WIDTH / width;
                            width = MAX_WIDTH;
                        }
                    } else {
                        if (height > MAX_HEIGHT) {
                            width *= MAX_HEIGHT / height;
                            height = MAX_HEIGHT;
                        }
                    }

                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);

                    // Kaliteyi %70'e düşür (Gözle fark edilmez ama boyutu çok düşürür)
                    const compressedBase64 = canvas.toDataURL('image/jpeg', 0.7);
                    resolve(compressedBase64);
                };
            };
            reader.onerror = error => reject(error);
        });
    };

    const handleFileChange = async (event) => {
        const files = Array.from(event.target.files);
        if (files.length === 0) return;
        const newMediaItems = await Promise.all(files.map(async (file) => {
            const base64 = await compressAndConvertToBase64(file); // SIKIŞTIRMA KULLANILIYOR
            return {
                id: Date.now() + Math.random(),
                url: base64, 
                type: file.type.startsWith('video') ? 'video' : 'image'
            };
        }));
        setTrialData(prev => ({ ...prev, media: [...prev.media, ...newMediaItems] }));
        event.target.value = ''; 
    };

    const handleRemoveMedia = (id) => {
        setTrialData(prev => ({ ...prev, media: prev.media.filter(item => item.id !== id) }));
        if (lightboxIndex !== null) setLightboxIndex(null);
    };

    // --- HIZLI NOT & YORUM İŞLEMLERİ ---
    const handleQuickNoteImageUpload = async (event) => {
        const file = event.target.files[0];
        if (!file) return;
        const base64 = await compressAndConvertToBase64(file); // SIKIŞTIRMA KULLANILIYOR
        setNewQuickNoteImage(base64);
        event.target.value = '';
    };

    const handleAddQuickNote = () => {
        if (!newQuickNoteText && !newQuickNoteImage) return;
        const newNote = {
            id: Date.now(),
            text: newQuickNoteText,
            image: newQuickNoteImage,
            comments: [],
            createdAt: getCurrentDateTimeString(),
            createdBy: loggedInUser?.name || 'Anonim'
        };
        setTrialData(prev => ({
            ...prev,
            quickNotes: [newNote, ...(prev.quickNotes || [])] 
        }));
        setNewQuickNoteText('');
        setNewQuickNoteImage(null);
    };

    const handleStartCommenting = (noteId) => {
        setCommentingNoteId(noteId);
        setCommentText('');
    };

    const handleSubmitComment = (noteId) => {
        if (!commentText.trim()) return;
        setTrialData(prev => ({
            ...prev,
            quickNotes: prev.quickNotes.map(note => {
                if (note.id === noteId) {
                    return {
                        ...note,
                        comments: [...(note.comments || []), {
                            id: Date.now(),
                            text: commentText,
                            createdBy: loggedInUser?.name || 'Anonim',
                            createdAt: getCurrentDateTimeString()
                        }]
                    };
                }
                return note;
            })
        }));
        setCommentingNoteId(null);
        setCommentText('');
    };

    const handleCancelComment = () => {
        setCommentingNoteId(null);
        setCommentText('');
    };
    
    const handleDeleteQuickNote = (noteId) => {
        if(!window.confirm("Bu notu silmek istediğinize emin misiniz?")) return;
        setTrialData(prev => ({
            ...prev,
            quickNotes: prev.quickNotes.filter(n => n.id !== noteId)
        }));
    };

    // --- GÖRSEL DÜZENLEME ---
    const handleStartEditing = () => { setIsEditing(true); setTimeout(loadImageToCanvas, 50); };

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
        return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
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

    const stopDrawing = () => { isDrawing.current = false; };

    const handleSaveEdit = () => {
        const canvas = canvasRef.current;
        const newDataUrl = canvas.toDataURL('image/jpeg', 0.8);
        const newMedia = [...trialData.media];
        newMedia[lightboxIndex] = { ...newMedia[lightboxIndex], url: newDataUrl };
        setTrialData({ ...trialData, media: newMedia });
        setIsEditing(false);
    };

    const handleNextMedia = (e) => {
        if(e) e.stopPropagation();
        if (trialData.media.length > 0) setLightboxIndex((prev) => (prev + 1) % trialData.media.length);
    };

    const handlePrevMedia = (e) => {
        if(e) e.stopPropagation();
        if (trialData.media.length > 0) setLightboxIndex((prev) => (prev - 1 + trialData.media.length) % trialData.media.length);
    };

    // --- KAYDETME ---
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

            if (trialData.id) {
                await updateDoc(doc(db, MOLD_TRIAL_REPORTS_COLLECTION, trialData.id), reportData);
            } else {
                const docRef = await addDoc(collection(db, MOLD_TRIAL_REPORTS_COLLECTION), {
                    ...reportData,
                    createdAt: new Date().toISOString()
                });
                setTrialData(prev => ({ ...prev, id: docRef.id }));
            }

            let newStatus = selectedMold.status;
            if (trialData.result === 'APPROVED') newStatus = 'ONAY';
            else if (trialData.result === 'REJECTED') newStatus = 'RET';
            else if (trialData.result === 'REVISION') newStatus = 'TASHİH';
            else if (trialData.result === 'WAITING') newStatus = 'DENEME';

            await updateDoc(doc(db, PROJECT_COLLECTION, selectedMold.id), {
                status: newStatus
            });

            alert(`${trialData.phase} fazı kaydedildi ve kalıp durumu "${newStatus}" olarak güncellendi!`);

        } catch (error) {
            console.error("Hata:", error);
            alert("Hata: " + error.message);
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
                    (mold.status && (mold.status.includes('ONAY') || mold.status === 'APPROVED')) ? 'bg-green-100 text-green-800' : 
                    (mold.status && (mold.status.includes('RET') || mold.status === 'REJECTED')) ? 'bg-red-100 text-red-800' :
                    (mold.status && mold.status.toString().toUpperCase().includes('DENEME')) ? 'bg-yellow-100 text-yellow-800' : 
                    'bg-gray-100 text-gray-600'
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
        <div className="flex flex-col md:flex-row h-[calc(100vh-64px)] bg-gray-100 dark:bg-gray-900 gap-4 p-4 overflow-hidden font-sans">
            
            {/* NOT GÖRSELİ ÖNİZLEME MODALI (TAM EKRAN LIGHTBOX) */}
            {previewImage && (
                <div 
                    className="fixed inset-0 z-[60] bg-black/95 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in"
                    onClick={() => setPreviewImage(null)}
                >
                    <button className="absolute top-4 right-4 text-white hover:text-red-500 transition"><X className="w-10 h-10" /></button>
                    <img src={previewImage} alt="Önizleme" className="max-w-full max-h-[90vh] rounded shadow-2xl object-contain" />
                </div>
            )}

            {/* LIGHTBOX & EDİTÖR (Galeri İçin) */}
            {lightboxIndex !== null && trialData.media[lightboxIndex] && (
                <div className="fixed inset-0 z-50 bg-black/95 flex flex-col items-center justify-center p-0 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center bg-gradient-to-b from-black/80 to-transparent z-50">
                        <div className="flex gap-2">
                            {trialData.media[lightboxIndex].type === 'image' && (
                                !isEditing ? (
                                    <button onClick={handleStartEditing} className="flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-full text-sm font-bold shadow-lg transition"><Edit3 className="w-4 h-4 mr-2" /> Düzenle</button>
                                ) : (
                                    <div className="flex items-center gap-2 animate-in slide-in-from-top-5">
                                        <div className="flex bg-gray-800 rounded-full p-1 border border-gray-600">
                                            <button onClick={() => setEditTool('PEN')} className={`p-2 rounded-full transition ${editTool === 'PEN' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}><Edit3 className="w-4 h-4"/></button>
                                            <button onClick={() => setEditTool('CIRCLE')} className={`p-2 rounded-full transition ${editTool === 'CIRCLE' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}><CircleIcon className="w-4 h-4"/></button>
                                            <button onClick={() => setEditTool('TEXT')} className={`p-2 rounded-full transition ${editTool === 'TEXT' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}><Type className="w-4 h-4"/></button>
                                        </div>
                                        <div className="flex bg-gray-800 rounded-full p-1 border border-gray-600 gap-1">
                                            {['#ef4444', '#22c55e', '#eab308', '#3b82f6', '#ffffff'].map(color => (
                                                <button key={color} onClick={() => setDrawingColor(color)} className={`w-6 h-6 rounded-full border-2 transition ${drawingColor === color ? 'border-white scale-110' : 'border-transparent'}`} style={{ backgroundColor: color }} />
                                            ))}
                                        </div>
                                        <button onClick={handleSaveEdit} className="flex items-center px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-full text-sm font-bold ml-2"><Check className="w-4 h-4 mr-1" /> Kaydet</button>
                                        <button onClick={() => setIsEditing(false)} className="flex items-center px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-full text-sm font-bold"><X className="w-4 h-4 mr-1" /> İptal</button>
                                    </div>
                                )
                            )}
                        </div>
                        <button onClick={() => { setLightboxIndex(null); setIsEditing(false); }} className="text-white hover:text-red-500 transition p-2 bg-white/10 rounded-full hover:bg-white/20"><X className="w-8 h-8" /></button>
                    </div>

                    <div className="flex-1 flex items-center justify-center w-full h-full p-4 overflow-hidden relative" onClick={() => !isEditing && setLightboxIndex(null)}>
                        {!isEditing && <button onClick={handlePrevMedia} className="absolute left-4 z-10 text-white/50 hover:text-white transition hover:scale-110 p-4 bg-black/20 rounded-full hover:bg-black/50"><ChevronLeft className="w-12 h-12" /></button>}
                        <div className="relative max-w-full max-h-full flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
                            {isEditing ? (
                                <canvas ref={canvasRef} onMouseDown={startDrawing} onMouseMove={draw} onMouseUp={stopDrawing} onMouseLeave={stopDrawing} className="max-w-full max-h-[85vh] object-contain cursor-crosshair shadow-2xl border border-gray-700 bg-black" />
                            ) : (
                                trialData.media[lightboxIndex].type === 'image' ? <img src={trialData.media[lightboxIndex].url} alt="Büyük" className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl" /> : <video src={trialData.media[lightboxIndex].url} controls autoPlay className="max-w-full max-h-[85vh] rounded-lg shadow-2xl" />
                            )}
                        </div>
                        {!isEditing && <button onClick={handleNextMedia} className="absolute right-4 z-10 text-white/50 hover:text-white transition hover:scale-110 p-4 bg-black/20 rounded-full hover:bg-black/50"><ChevronRight className="w-12 h-12" /></button>}
                    </div>
                </div>
            )}

            {/* SOL PANEL (TABLETTE GENİŞLİK AYARI VE MOBİLDE GİZLEME MANTIĞI) */}
            <div className="w-full md:w-72 lg:w-1/4 min-w-[300px] shrink-0 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 flex flex-col h-1/3 md:h-full">
                <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                    <h2 className="text-lg font-bold text-gray-800 dark:text-white mb-4 flex items-center"><Activity className="w-5 h-5 mr-2 text-blue-600" /> Deneme Listesi</h2>
                    <div className="flex flex-wrap gap-1 mb-3">
                        <button onClick={() => setListFilter('TRIALS')} className={`flex-1 py-1.5 px-1 text-[10px] font-bold rounded-md transition ${listFilter === 'TRIALS' ? 'bg-yellow-100 text-yellow-800 border border-yellow-300' : 'bg-gray-100 text-gray-500'}`}>Denemedekiler</button>
                        <button onClick={() => setListFilter('APPROVED')} className={`flex-1 py-1.5 px-1 text-[10px] font-bold rounded-md transition ${listFilter === 'APPROVED' ? 'bg-green-100 text-green-800 border border-green-300' : 'bg-gray-100 text-gray-500'}`}>Onaylananlar</button>
                        <button onClick={() => setListFilter('REJECTED')} className={`flex-1 py-1.5 px-1 text-[10px] font-bold rounded-md transition ${listFilter === 'REJECTED' ? 'bg-red-100 text-red-800 border border-red-300' : 'bg-gray-100 text-gray-500'}`}>Reddedilenler</button>
                        <button onClick={() => setListFilter('ALL')} className={`flex-1 py-1.5 px-1 text-[10px] font-bold rounded-md transition ${listFilter === 'ALL' ? 'bg-blue-100 text-blue-800 border border-blue-300' : 'bg-gray-100 text-gray-500'}`}>Tümü</button>
                    </div>
                    <div className="relative"><Search className="absolute left-3 top-2.5 text-gray-400 w-4 h-4" /><input type="text" placeholder="Kalıp adı veya kodu..." className="w-full pl-9 p-2 text-sm border rounded-lg bg-gray-50 dark:bg-gray-900 dark:text-white dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} /></div>
                </div>
                <div className="flex-1 overflow-y-auto">
                    {filteredMolds.map(mold => <MoldListItem key={mold.id} mold={mold} />)}
                </div>
            </div>

            {/* SAĞ PANEL */}
            <div className="flex-1 min-w-0 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden h-2/3 md:h-full">
                {selectedMold ? (
                    <>
                        <div className="p-5 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <h1 className="text-2xl font-black text-gray-800 dark:text-white flex items-center">
                                        {selectedMold.moldName}
                                        <span className="ml-3 text-sm font-normal text-gray-500 bg-white dark:bg-gray-800 px-2 py-1 rounded border border-gray-200 dark:border-gray-700">{selectedMold.projectCode}</span>
                                    </h1>
                                    <div className="flex items-center mt-1 space-x-2">
                                        <p className="text-sm text-gray-500">Müşteri: {selectedMold.customerName || 'Belirtilmemiş'}</p>
                                        <Link to={`/mold/${selectedMold.id}`} className="text-xs text-blue-600 hover:underline flex items-center bg-blue-50 px-2 py-0.5 rounded">
                                            Kalıp Detayına Git <ChevronRight className="w-3 h-3 ml-1"/>
                                        </Link>
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    {TRIAL_PHASES.map(phase => {
                                        const hasReport = reports.some(r => r.phase === phase);
                                        return (
                                            <button key={phase} onClick={() => handlePhaseChange(phase)} className={`px-3 py-1 text-xs font-bold rounded border transition ${trialData.phase === phase ? 'bg-blue-600 text-white border-blue-600 scale-105 shadow-md' : hasReport ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100' : 'bg-white text-gray-400 border-gray-200 hover:bg-gray-50'}`}>{phase} {hasReport && '✓'}</button>
                                        );
                                    })}
                                </div>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div><label className="text-[10px] uppercase font-bold text-gray-400 block mb-1">Deneme Fazı</label><select className="w-full p-2 text-sm border rounded bg-white dark:bg-gray-800 dark:text-white" value={trialData.phase} onChange={(e) => handlePhaseChange(e.target.value)}>{TRIAL_PHASES.map(p => <option key={p} value={p}>{p}</option>)}</select></div>
                                <div><label className="text-[10px] uppercase font-bold text-gray-400 block mb-1">Makine</label><input type="text" className="w-full p-2 text-sm border rounded bg-white dark:bg-gray-800 dark:text-white" value={trialData.machine} onChange={(e) => setTrialData({...trialData, machine: e.target.value})} /></div>
                                <div><label className="text-[10px] uppercase font-bold text-gray-400 block mb-1">Hammadde</label><input type="text" className="w-full p-2 text-sm border rounded bg-white dark:bg-gray-800 dark:text-white" value={trialData.material} onChange={(e) => setTrialData({...trialData, material: e.target.value})} /></div>
                                <div><label className="text-[10px] uppercase font-bold text-gray-400 block mb-1">Göz</label><input type="text" className="w-full p-2 text-sm border rounded bg-white dark:bg-gray-800 dark:text-white" value={trialData.cavity} onChange={(e) => setTrialData({...trialData, cavity: e.target.value})} /></div>
                            </div>
                        </div>

                        {/* YATAY KAYDIRILABİLİR TAB MENÜSÜ */}
                        <div className="flex border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 overflow-x-auto">
                            <button onClick={() => setActiveTab('QUICK_NOTES')} className={`py-3 px-4 text-sm font-bold border-b-2 transition flex items-center whitespace-nowrap ${activeTab === 'QUICK_NOTES' ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-500'}`}><MessageSquare className="w-4 h-4 mr-2" /> Rapor</button>
                            <button onClick={() => setActiveTab('PARAMS')} className={`py-3 px-4 text-sm font-bold border-b-2 transition flex items-center whitespace-nowrap ${activeTab === 'PARAMS' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500'}`}><Gauge className="w-4 h-4 mr-2" /> Parametreler</button>
                            <button onClick={() => setActiveTab('GALLERY')} className={`py-3 px-4 text-sm font-bold border-b-2 transition flex items-center whitespace-nowrap ${activeTab === 'GALLERY' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500'}`}><Camera className="w-4 h-4 mr-2" /> Görseller</button>
                            <button onClick={() => setActiveTab('RESULT')} className={`py-3 px-4 text-sm font-bold border-b-2 transition flex items-center whitespace-nowrap ${activeTab === 'RESULT' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500'}`}><FileText className="w-4 h-4 mr-2" /> Sonuç</button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 bg-gray-50/50 dark:bg-gray-900/50">
                            
                            {activeTab === 'QUICK_NOTES' && (
                                <div className="space-y-6 animate-in fade-in">
                                    <div className="bg-white dark:bg-gray-800 p-5 rounded-xl shadow-sm border border-orange-200 dark:border-gray-700">
                                        <div className="mb-6 border-b pb-4 dark:border-gray-700">
                                            <h3 className="text-sm font-bold text-gray-800 dark:text-white mb-3">Kalıp Durumu (Onay/Ret)</h3>
                                            <div className="flex gap-3">
                                                <button onClick={() => setTrialData({...trialData, result: 'APPROVED'})} className={`flex-1 py-3 rounded-xl border-2 font-bold flex items-center justify-center transition ${trialData.result === 'APPROVED' ? 'bg-green-600 border-green-600 text-white' : 'border-green-200 text-green-600 hover:bg-green-50'}`}><ThumbsUp className="w-5 h-5 mr-2" /> ONAYLA</button>
                                                <button onClick={() => setTrialData({...trialData, result: 'REJECTED'})} className={`flex-1 py-3 rounded-xl border-2 font-bold flex items-center justify-center transition ${trialData.result === 'REJECTED' ? 'bg-red-600 border-red-600 text-white' : 'border-red-200 text-red-600 hover:bg-red-50'}`}><ThumbsDown className="w-5 h-5 mr-2" /> REDDET</button>
                                                <button onClick={() => setTrialData({...trialData, result: 'REVISION'})} className={`flex-1 py-3 rounded-xl border-2 font-bold flex items-center justify-center transition ${trialData.result === 'REVISION' ? 'bg-orange-500 border-orange-500 text-white' : 'border-orange-200 text-orange-600 hover:bg-orange-50'}`}><AlertTriangle className="w-5 h-5 mr-2" /> TASHİH</button>
                                            </div>
                                        </div>
                                        <h3 className="text-sm font-bold text-orange-600 mb-3 flex items-center"><MessageSquare className="w-4 h-4 mr-2"/> Notlar</h3>
                                        <div className="flex gap-3">
                                            <input type="file" ref={quickNoteFileInputRef} className="hidden" accept="image/*" onChange={handleQuickNoteImageUpload} />
                                            <button onClick={() => quickNoteFileInputRef.current.click()} className="p-3 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-600 border border-dashed border-gray-300">{newQuickNoteImage ? <img src={newQuickNoteImage} className="w-8 h-8 object-cover rounded" alt="secilen" /> : <Camera className="w-6 h-6" />}</button>
                                            <div className="flex-1 flex gap-2"><input type="text" className="flex-1 p-3 border rounded-lg dark:bg-gray-700 dark:text-white" placeholder="Örn: Sol üst köşede çapak var..." value={newQuickNoteText} onChange={(e) => setNewQuickNoteText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAddQuickNote()} /><button onClick={handleAddQuickNote} className="px-4 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-bold">Ekle</button></div>
                                        </div>
                                    </div>
                                    <div className="space-y-4">
                                        {trialData.quickNotes && trialData.quickNotes.length > 0 ? (
                                            trialData.quickNotes.map(note => (
                                                <div key={note.id} className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 flex flex-col md:flex-row gap-4">
                                                    {note.image && (<div className="w-full md:w-32 h-32 flex-shrink-0 cursor-pointer" onClick={() => setPreviewImage(note.image)}><img src={note.image} alt="Not Görseli" className="w-full h-full object-cover rounded-lg border" /></div>)}
                                                    <div className="flex-1">
                                                        <div className="flex justify-between items-start"><p className="font-bold text-gray-800 dark:text-white text-lg">{note.text}</p><button onClick={() => handleDeleteQuickNote(note.id)} className="text-gray-400 hover:text-red-500"><Trash2 className="w-4 h-4"/></button></div>
                                                        <div className="text-xs text-gray-500 mt-1 flex items-center"><span>{note.createdBy}</span><span className="mx-2">•</span><span>{note.createdAt}</span></div>
                                                        <div className="mt-3 bg-gray-50 dark:bg-gray-900/50 p-2 rounded-lg border border-gray-100 dark:border-gray-700">
                                                            {note.comments && note.comments.map(comment => (<div key={comment.id} className="text-xs text-gray-600 dark:text-gray-300 border-b last:border-0 border-gray-200 dark:border-gray-700 py-1"><strong>{comment.createdBy}:</strong> {comment.text}</div>))}
                                                            {commentingNoteId === note.id ? (
                                                                <div className="mt-2 flex gap-2 animate-in fade-in">
                                                                    <input type="text" className="flex-1 p-1 text-xs border rounded dark:bg-gray-700 dark:text-white dark:border-gray-600" placeholder="Yorumunuzu yazın..." value={commentText} onChange={(e) => setCommentText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSubmitComment(note.id)} autoFocus />
                                                                    <button onClick={() => handleSubmitComment(note.id)} className="px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700">Kaydet</button>
                                                                    <button onClick={handleCancelComment} className="px-2 py-1 bg-gray-300 text-gray-700 text-xs rounded hover:bg-gray-400">İptal</button>
                                                                </div>
                                                            ) : (<button onClick={() => handleStartCommenting(note.id)} className="text-xs text-blue-500 hover:text-blue-700 mt-1 font-bold">+ Yorum Ekle</button>)}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))
                                        ) : (<div className="text-center text-gray-400 py-10">Henüz not eklenmemiş.</div>)}
                                    </div>
                                </div>
                            )}

                            {activeTab === 'PARAMS' && (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6 animate-in fade-in">
                                    <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                                        <h3 className="text-sm font-bold text-red-600 mb-3 flex items-center"><Thermometer className="w-4 h-4 mr-2"/> Sıcaklıklar</h3>
                                        <div className="grid grid-cols-2 gap-3">
                                            {Object.keys(trialData.temps).map(key => (<div key={key}><label className="text-xs text-gray-500 uppercase">{key}</label><input type="text" className="w-full p-2 border rounded" value={trialData.temps[key]} onChange={e => setTrialData({...trialData, temps: {...trialData.temps, [key]: e.target.value}})} /></div>))}
                                        </div>
                                    </div>
                                    <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                                        <h3 className="text-sm font-bold text-blue-600 mb-3 flex items-center"><Gauge className="w-4 h-4 mr-2"/> Basınçlar</h3>
                                        <div className="grid grid-cols-2 gap-3">
                                            {Object.keys(trialData.pressures).map(key => (<div key={key}><label className="text-xs text-gray-500 uppercase">{key}</label><input type="text" className="w-full p-2 border rounded" value={trialData.pressures[key]} onChange={e => setTrialData({...trialData, pressures: {...trialData.pressures, [key]: e.target.value}})} /></div>))}
                                        </div>
                                    </div>
                                    <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                                        <h3 className="text-sm font-bold text-green-600 mb-3 flex items-center"><Activity className="w-4 h-4 mr-2"/> Hız</h3>
                                        <div className="grid grid-cols-1 gap-3">
                                            {Object.keys(trialData.speeds).map(key => (<div key={key}><label className="text-xs text-gray-500 uppercase">{key}</label><input type="text" className="w-full p-2 border rounded" value={trialData.speeds[key]} onChange={e => setTrialData({...trialData, speeds: {...trialData.speeds, [key]: e.target.value}})} /></div>))}
                                        </div>
                                    </div>
                                    <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                                        <h3 className="text-sm font-bold text-purple-600 mb-3 flex items-center"><Clock className="w-4 h-4 mr-2"/> Zaman</h3>
                                        <div className="grid grid-cols-2 gap-3">
                                            {Object.keys(trialData.times).map(key => (<div key={key}><label className="text-xs text-gray-500 uppercase">{key}</label><input type="text" className="w-full p-2 border rounded" value={trialData.times[key]} onChange={e => setTrialData({...trialData, times: {...trialData.times, [key]: e.target.value}})} /></div>))}
                                        </div>
                                    </div>
                                </div>
                            )}
                            
                            {activeTab === 'GALLERY' && (
                                <div className="space-y-6">
                                    <input type="file" multiple accept="image/*,video/*" ref={fileInputRef} className="hidden" onChange={handleFileChange} />
                                    <div className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-800/50 p-10 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition">
                                        <ImageIcon className="w-16 h-16 mb-4 opacity-50" /><p className="text-lg font-medium">Fotoğraf / Video Yükle</p><button onClick={handleTriggerFileUpload} className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-md font-bold flex items-center transition"><Plus className="w-4 h-4 mr-2" /> Dosya Seç</button>
                                    </div>
                                    {trialData.media.length > 0 && (
                                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 animate-in fade-in">
                                            {trialData.media.map((media, index) => (
                                                <div key={media.id} onClick={() => setLightboxIndex(index)} className="relative group rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 shadow-sm bg-black aspect-square cursor-zoom-in hover:brightness-110 transition">
                                                    <button onClick={(e) => { e.stopPropagation(); handleRemoveMedia(media.id); }} className="absolute top-2 right-2 bg-red-600 hover:bg-red-700 text-white p-1.5 rounded-full shadow-md z-20 opacity-0 group-hover:opacity-100 transition"><Trash2 className="w-4 h-4" /></button>
                                                    {media.type === 'image' ? <img src={media.url} className="w-full h-full object-cover" alt="img" /> : <div className="w-full h-full flex items-center justify-center bg-gray-900"><PlayCircle className="w-10 h-10 text-white opacity-80" /></div>}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {activeTab === 'RESULT' && (
                                <div className="space-y-6">
                                    <div className="bg-white dark:bg-gray-800 p-5 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                                        <h3 className="text-sm font-bold text-gray-800 dark:text-white mb-4">Görülen Hatalar</h3>
                                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">{DEFECT_TYPES.map(defect => (<div key={defect} onClick={() => toggleDefect(defect)} className={`p-3 rounded-lg border text-sm cursor-pointer transition flex items-center ${trialData.defects.includes(defect) ? 'bg-red-50 border-red-500 text-red-700 font-bold' : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'}`}>{trialData.defects.includes(defect) ? <CheckCircle className="w-4 h-4 mr-2"/> : <div className="w-4 h-4 mr-2 border border-gray-400 rounded-full"></div>}{defect}</div>))}</div>
                                    </div>
                                    <div className="bg-white dark:bg-gray-800 p-5 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                                        <h3 className="text-sm font-bold text-gray-800 dark:text-white mb-4">Sonuç ve Rapor</h3>
                                        <textarea className="w-full p-3 border rounded-lg h-32 bg-gray-50 dark:bg-gray-900 dark:text-white dark:border-gray-600" placeholder="Genel notlar..." value={trialData.notes} onChange={(e) => setTrialData({...trialData, notes: e.target.value})}></textarea>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex justify-between items-center">
                            <div className="text-xs text-gray-500">Raporlayan: <strong>{loggedInUser.name}</strong></div>
                            <button onClick={handleSaveReport} disabled={isSaving} className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg shadow-lg flex items-center transition disabled:opacity-50"><Save className="w-5 h-5 mr-2" /> {isSaving ? 'Kaydediliyor...' : 'RAPORU KAYDET'}</button>
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-gray-400"><FileText className="w-20 h-20 mb-4 opacity-30" /><p className="text-lg">Soldaki listeden bir kalıp seçin.</p></div>
                )}
            </div>
        </div>
    );
};

export default MoldTrialReportsPage;