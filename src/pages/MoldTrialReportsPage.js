// src/pages/MoldTrialReportsPage.js

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import html2pdf from 'html2pdf.js'; 
import { 
    Search, Activity, Camera, Save, 
    Gauge, Clock, 
    CheckCircle, FileText, Trash2,
    Image as ImageIcon, Plus, PlayCircle,
    X, ChevronLeft, ChevronRight, 
    Edit3, Type, Circle as CircleIcon, Check, 
    MessageSquare, ThumbsUp, ThumbsDown, AlertTriangle, Edit2, PlusCircle, Download, Calendar, Monitor
} from 'lucide-react';
import { 
    collection, addDoc, query, where, orderBy, onSnapshot, updateDoc, doc, deleteDoc,
    storage, ref, uploadBytes, getDownloadURL
} from '../config/firebase.js'; 
import { PROJECT_COLLECTION } from '../config/constants.js'; 
import { getCurrentDateTimeString } from '../utils/dateUtils.js';

const TRIAL_PHASES = ['T0', 'T1', 'T2', 'T3', 'T4', 'SERİ ONAY'];
const MOLD_TRIAL_REPORTS_COLLECTION = 'mold_trial_reports';

// --- Yardımcı Dosya Sıkıştırma ve Storage Yükleme Fonksiyonları ---
const compressImageToBlob = (file) => {
    return new Promise((resolve) => {
        if (!file.type.startsWith('image/')) {
            resolve(file);
            return;
        }

        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 1200; 
                const MAX_HEIGHT = 1200; 
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

                canvas.toBlob((blob) => {
                    if (blob) {
                        resolve(blob);
                    } else {
                        resolve(file); // canvas blob oluşturamazsa orijinal dosyayı kullan
                    }
                }, 'image/jpeg', 0.7);
            };
            img.onerror = () => resolve(file);
        };
        reader.onerror = () => resolve(file);
    });
};

const uploadFileToStorage = async (file, moldId) => {
    if (!file) return null;
    let fileToUpload = file;
    
    // Eğer görsel ise önce sıkıştırıyoruz
    if (file.type && file.type.startsWith('image/')) {
        try {
            fileToUpload = await compressImageToBlob(file);
        } catch (e) {
            console.error("Görsel sıkıştırma hatası, orijinal yüklenecek:", e);
        }
    }
    
    const cleanMoldId = moldId || 'general';
    const timestamp = Date.now();
    const cleanFileName = (file.name || 'file').replace(/[^a-zA-Z0-9.]/g, '_');
    const uniqueFileName = `mold_trial_reports/${cleanMoldId}/${timestamp}_${cleanFileName}`;
    const storageRef = ref(storage, uniqueFileName);
    
    await uploadBytes(storageRef, fileToUpload);
    const downloadURL = await getDownloadURL(storageRef);
    return downloadURL;
};

const MoldTrialReportsPage = ({ db, loggedInUser, projects }) => {
    // --- STATE'LER ---
    const [selectedMold, setSelectedMold] = useState(null);
    const [listFilter, setListFilter] = useState('TRIALS'); 
    const [searchTerm, setSearchTerm] = useState('');
    const [activeTab, setActiveTab] = useState('QUICK_NOTES'); 
    const [isSaving, setIsSaving] = useState(false);
    const [reports, setReports] = useState([]); 

    // GALERİ STATE'İ
    const [lightboxIndex, setLightboxIndex] = useState(null); 
    const [previewImage, setPreviewImage] = useState(null); 

    // GÖRSEL DÜZENLEME STATE'LERİ
    const [isEditing, setIsEditing] = useState(false);
    const [editTool, setEditTool] = useState('PEN');
    const [drawingColor, setDrawingColor] = useState('#ef4444');

    // SATIR İÇİ YORUM/NOT DÜZENLEME STATE'LERİ
    const [commentingNoteId, setCommentingNoteId] = useState(null); 
    const [commentText, setCommentText] = useState(''); 
    const [editingNoteId, setEditingNoteId] = useState(null);
    const [editingNoteText, setEditingNoteText] = useState('');
    const [editingComment, setEditingComment] = useState({ noteId: null, commentId: null, text: '' });

    // PARAMETRE VE HATA LİSTESİ DÜZENLEME PENCERELERİ
    const [editingParamGroup, setEditingParamGroup] = useState(null); 
    const [isDefectEditorOpen, setIsDefectEditorOpen] = useState(false); 

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
        trialDate: new Date().toISOString().split('T')[0], // Kullanıcının girebileceği güncel tarih
        machine: '',
        material: '',
        cavity: '',
        parameterGroups: [
            { id: 'group_temp', name: 'Sıcaklıklar', icon: 'Thermometer', color: 'red', fields: [{ id: 'f1', label: 'Zone 1', value: '' }, { id: 'f2', label: 'Zone 2', value: '' }, { id: 'f3', label: 'Zone 3', value: '' }, { id: 'f4', label: 'Nozzle', value: '' }] },
            { id: 'group_press', name: 'Basınçlar', icon: 'Gauge', color: 'blue', fields: [{ id: 'f5', label: 'Enjeksiyon Basıncı', value: '' }, { id: 'f6', label: 'Ütüleme Basıncı', value: '' }, { id: 'f7', label: 'Geri Basınç', value: '' }] },
            { id: 'group_speed', name: 'Hız', icon: 'Activity', color: 'green', fields: [{ id: 'f8', label: 'Enjeksiyon Hızı', value: '' }, { id: 'f9', label: 'Geçiş Noktası', value: '' }] },
            { id: 'group_time', name: 'Zaman', icon: 'Clock', color: 'purple', fields: [{ id: 'f10', label: 'Soğutma Süresi', value: '' }, { id: 'f11', label: 'Çevrim Süresi', value: '' }] }
        ],
        defectTypes: [
            { id: 'd1', label: 'Çapak (Flash)', selected: false },
            { id: 'd2', label: 'Çöküntü (Sink Mark)', selected: false },
            { id: 'd3', label: 'Yanık (Burn Mark)', selected: false },
            { id: 'd4', label: 'Eksik Baskı (Short Shot)', selected: false },
            { id: 'd5', label: 'İtici İzi', selected: false },
            { id: 'd6', label: 'Ölçü Hatası', selected: false }
        ],
        media: [], 
        result: 'WAITING', 
        notes: '',
        quickNotes: [] 
    });

    const [trialData, setTrialData] = useState(getInitialTrialData());
    const [newQuickNoteText, setNewQuickNoteText] = useState('');
    const [newQuickNoteImage, setNewQuickNoteImage] = useState(null); 
    const [isUploadingNoteImage, setIsUploadingNoteImage] = useState(false);
    const [isUploadingMedia, setIsUploadingMedia] = useState(false); 

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
        });
        return () => unsubscribe();
    }, [selectedMold, db]);

    useEffect(() => {
        if (selectedMold) {
            if (reports.length > 0) {
                if (!trialData.id && trialData.machine === '') {
                    setTrialData({ ...getInitialTrialData(reports[0].phase || 'T0'), ...reports[0] });
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
            setTrialData({ ...getInitialTrialData(newPhase), ...existingReport });
        } else {
            setTrialData({
                ...getInitialTrialData(newPhase),
                moldId: selectedMold.id, 
                moldName: selectedMold.moldName,
                projectCode: selectedMold.projectCode
            });
        }
    };

    // --- FİLTRELEME ---
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

    const handleMoldSelect = (mold) => {
        setSelectedMold(mold);
        setReports([]); 
        setTrialData(getInitialTrialData('T0')); 
        setActiveTab('QUICK_NOTES'); 
    };

    // --- DİNAMİK PARAMETRE YÖNETİMİ ---
    const addParameterGroup = () => {
        const newGroupId = `group_${Date.now()}`;
        const newGroup = { id: newGroupId, name: 'Yeni Kategori', icon: 'FileText', color: 'gray', fields: [] };
        setTrialData(prev => ({ ...prev, parameterGroups: [...(prev.parameterGroups || []), newGroup] }));
        setEditingParamGroup(newGroupId); 
    };

    const deleteParameterGroup = (groupId) => {
        if(window.confirm("Bu parametre grubunu tamamen silmek istediğinize emin misiniz?")) {
            setTrialData(prev => ({ ...prev, parameterGroups: (prev.parameterGroups || []).filter(g => g.id !== groupId) }));
        }
    };

    const updateGroupName = (groupId, newName) => {
        setTrialData(prev => ({ ...prev, parameterGroups: (prev.parameterGroups || []).map(g => g.id === groupId ? { ...g, name: newName } : g) }));
    };

    const addParameterField = (groupId) => {
        const newField = { id: `fld_${Date.now()}`, label: 'Yeni Parametre', value: '' };
        setTrialData(prev => ({ ...prev, parameterGroups: (prev.parameterGroups || []).map(g => g.id === groupId ? { ...g, fields: [...(g.fields || []), newField] } : g) }));
    };

    const updateParameterField = (groupId, fieldId, key, newValue) => {
        setTrialData(prev => ({
            ...prev,
            parameterGroups: (prev.parameterGroups || []).map(g => {
                if (g.id === groupId) {
                    return { ...g, fields: (g.fields || []).map(f => f.id === fieldId ? { ...f, [key]: newValue } : f) };
                }
                return g;
            })
        }));
    };

    const deleteParameterField = (groupId, fieldId) => {
        setTrialData(prev => ({ ...prev, parameterGroups: (prev.parameterGroups || []).map(g => g.id === groupId ? { ...g, fields: (g.fields || []).filter(f => f.id !== fieldId) } : g) }));
    };

    // --- DİNAMİK HATA/SONUÇ YÖNETİMİ ---
    const addDefectType = () => {
        const newDefect = { id: `def_${Date.now()}`, label: 'Yeni Hata Kriteri', selected: false };
        setTrialData(prev => ({ ...prev, defectTypes: [...(prev.defectTypes || []), newDefect] }));
    };

    const updateDefectLabel = (defectId, newLabel) => {
        setTrialData(prev => ({ ...prev, defectTypes: (prev.defectTypes || []).map(d => d.id === defectId ? { ...d, label: newLabel } : d) }));
    };

    const toggleDefectSelection = (defectId) => {
        setTrialData(prev => ({ ...prev, defectTypes: (prev.defectTypes || []).map(d => d.id === defectId ? { ...d, selected: !d.selected } : d) }));
    };

    const deleteDefectType = (defectId) => {
        setTrialData(prev => ({ ...prev, defectTypes: (prev.defectTypes || []).filter(d => d.id !== defectId) }));
    };

    // --- DOSYA YÜKLEME ---
    const handleTriggerFileUpload = () => fileInputRef.current.click();

    const handleFileChange = async (event) => {
        const files = Array.from(event.target.files);
        if (files.length === 0) return;
        
        setIsUploadingMedia(true);
        try {
            const newMediaItems = await Promise.all(
                files.map(async (file) => {
                    const url = await uploadFileToStorage(file, selectedMold?.id);
                    return { 
                        id: Date.now() + Math.random(), 
                        url: url, 
                        type: file.type.startsWith('video') ? 'video' : 'image' 
                    };
                })
            );
            const validMediaItems = newMediaItems.filter(item => item.url !== null);
            setTrialData(prev => ({ ...prev, media: [...(prev.media || []), ...validMediaItems] }));
        } catch (error) {
            console.error("Medya dosyaları yükleme hatası:", error);
            alert("Hata: Dosyalar yüklenirken bir problem oluştu: " + error.message);
        } finally {
            setIsUploadingMedia(false);
            event.target.value = ''; 
        }
    };

    const handleRemoveMedia = (id) => {
        setTrialData(prev => ({ ...prev, media: (prev.media || []).filter(item => item.id !== id) }));
        if (lightboxIndex !== null) setLightboxIndex(null);
    };

    // --- Eski Base64 Verilerini Temizleme Yardımcı Fonksiyonları ---
    const dataURLtoBlob = (dataurl) => {
        try {
            let arr = dataurl.split(','), mime = arr[0].match(/:(.*?);/)[1],
                bstr = atob(arr[1]), n = bstr.length, u8arr = new Uint8Array(n);
            while(n--){
                u8arr[n] = bstr.charCodeAt(n);
            }
            return new Blob([u8arr], {type:mime});
        } catch (e) {
            console.error("Base64 ayrıştırma hatası:", e);
            return null;
        }
    };

    const uploadBase64ToStorage = async (base64String, moldId) => {
        try {
            const blob = dataURLtoBlob(base64String);
            if (!blob) return base64String;
            const timestamp = Date.now() + Math.floor(Math.random() * 1000);
            const extension = blob.type.split('/')[1] || 'jpg';
            const uniqueFileName = `mold_trial_reports/${moldId || 'legacy'}/${timestamp}_legacy_image.${extension}`;
            const storageRef = ref(storage, uniqueFileName);
            await uploadBytes(storageRef, blob);
            const downloadURL = await getDownloadURL(storageRef);
            return downloadURL;
        } catch (e) {
            console.error("Eski base64 Storage yükleme hatası:", e);
            return base64String; // Hata durumunda orijinali dön
        }
    };

    // --- KAYDETME MANTIĞI ---
    const saveTrialDataToDB = async (dataToSave, silent = false) => {
        if (!selectedMold) return;
        setIsSaving(true);
        try {
            const safeProjectCode = selectedMold.projectCode || '';
            const reportData = {
                ...dataToSave,
                moldId: selectedMold.id,
                moldName: selectedMold.moldName || '',
                projectCode: safeProjectCode,
                reporter: loggedInUser?.name || 'Bilinmeyen',
                savedAt: getCurrentDateTimeString()
            };

            // ESKİ BASE64 RESİMLERİ STORAGE'A YÜKLEYİP URL'LERLE DEĞİŞTİR (SELF-HEALING)
            if (reportData.media && reportData.media.length > 0) {
                reportData.media = await Promise.all(reportData.media.map(async (item) => {
                    if (item.url && item.url.startsWith('data:')) {
                        const storageUrl = await uploadBase64ToStorage(item.url, selectedMold.id);
                        return { ...item, url: storageUrl };
                    }
                    return item;
                }));
            }

            if (reportData.quickNotes && reportData.quickNotes.length > 0) {
                reportData.quickNotes = await Promise.all(reportData.quickNotes.map(async (note) => {
                    let updatedNote = { ...note };
                    if (updatedNote.images && updatedNote.images.length > 0) {
                        updatedNote.images = await Promise.all(updatedNote.images.map(async (imgUrl) => {
                            if (imgUrl && imgUrl.startsWith('data:')) {
                                return await uploadBase64ToStorage(imgUrl, selectedMold.id);
                            }
                            return imgUrl;
                        }));
                    }
                    if (updatedNote.image && updatedNote.image.startsWith('data:')) {
                        updatedNote.image = await uploadBase64ToStorage(updatedNote.image, selectedMold.id);
                    }
                    return updatedNote;
                }));
            }

            let docId = dataToSave.id;
            if (docId) {
                await updateDoc(doc(db, MOLD_TRIAL_REPORTS_COLLECTION, docId), reportData);
            } else {
                const docRef = await addDoc(collection(db, MOLD_TRIAL_REPORTS_COLLECTION), { ...reportData, createdAt: new Date().toISOString() });
                docId = docRef.id;
            }

            // State'i de temizlenmiş URL'lerle güncelle
            setTrialData(prev => ({ 
                ...prev, 
                id: docId, 
                media: reportData.media, 
                quickNotes: reportData.quickNotes 
            }));

            let newStatus = selectedMold.status;
            if (dataToSave.result === 'APPROVED') newStatus = 'ONAY';
            else if (dataToSave.result === 'REJECTED') newStatus = 'RET';
            else if (dataToSave.result === 'REVISION') newStatus = 'TASHİH';
            else if (dataToSave.result === 'WAITING') newStatus = 'DENEME';

            await updateDoc(doc(db, PROJECT_COLLECTION, selectedMold.id), { status: newStatus });

            if (!silent) alert(`${dataToSave.phase} fazı kaydedildi ve kalıp durumu "${newStatus}" olarak güncellendi!`);
        } catch (error) {
            console.error("Hata:", error);
            // Kaydetme hatasını her zaman gösteriyoruz ki sessizce kaybolmasın
            alert("Kaydetme Hatası: Rapor kaydedilemedi!\nHata Detayı: " + error.message);
        } finally {
            setIsSaving(false);
        }
    };

    // --- PDF OLUŞTURMA MANTIĞI ---
    const handleDownloadPresentation = async () => {
        const element = document.createElement('div');
        element.style.background = "#0f172a"; 
        
        // Tarih formatını (YYYY-MM-DD -> DD.MM.YYYY) çeviriyoruz
        const rawDate = trialData.trialDate || trialData.date.split(' ')[0];
        let formattedDate = rawDate;
        if (rawDate && rawDate.includes('-')) {
            const [y, m, d] = rawDate.split('-');
            formattedDate = `${d}.${m}.${y}`;
        }
        
        const styles = `
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Urbanist:wght@400;700;800&display=swap');
                * { margin: 0; padding: 0; box-sizing: border-box; }
                .pdf-root { background: #0f172a; width: 1123px; }
                .slide-container { 
                    width: 1123px; 
                    height: 792px; 
                    background: #0f172a; 
                    color: #f8fafc; 
                    padding: 50px; 
                    position: relative; 
                    display: flex; 
                    flex-direction: column;
                    overflow: hidden;
                    font-family: 'Urbanist', sans-serif;
                }
                .page-break { page-break-before: always; height: 0; display: block; width: 100%; border: none; margin: 0; padding: 0; }
                .slide-title { font-size: 38px; font-weight: 800; color: #deff9a; margin-bottom: 20px; border-bottom: 2px solid rgba(222, 255, 154, 0.2); padding-bottom: 10px; text-transform: uppercase; flex-shrink: 0; }
                .content-area { flex: 1; display: flex; flex-direction: column; justify-content: center; min-height: 0; }
                .cover-slide { text-align: center; justify-content: center; background: radial-gradient(circle at center, #1e293b 0%, #0f172a 100%); }
                .cover-slide h1 { font-size: 60px; margin-bottom: 10px; color: #deff9a; }
                .cover-slide p { font-size: 22px; color: #94a3b8; }
                
                .cover-details-box {
                    margin-top: 30px; 
                    display: inline-block; 
                    background: rgba(255,255,255,0.05); 
                    padding: 20px 40px; 
                    border-radius: 16px; 
                    border: 1px solid rgba(255,255,255,0.1);
                    text-align: left;
                }
                .cover-details-box div { margin-bottom: 8px; font-size: 18px; color: #cbd5e1; }
                .cover-details-box div strong { color: #f8fafc; margin-left: 10px; }

                .param-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; }
                .param-card { background: rgba(255,255,255,0.05); padding: 20px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.1); }
                .param-card h4 { color: #deff9a; margin-bottom: 15px; font-size: 18px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 8px; }
                .param-item { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 15px; border-bottom: 1px solid rgba(255,255,255,0.03); }
                .param-label { color: #94a3b8; }
                
                .observation-img-wrapper { 
                    width: 100%; 
                    height: 500px; 
                    display: flex; 
                    justify-content: center; 
                    align-items: center; 
                    background: #000; 
                    border-radius: 12px; 
                    border: 1px solid rgba(255,255,255,0.1); 
                    margin-bottom: 20px; 
                    overflow: hidden; 
                }
                .observation-img-wrapper img {
                    max-width: 100%;
                    max-height: 100%;
                    object-fit: contain;
                }

                .observation-text { font-size: 22px; font-weight: 500; line-height: 1.4; color: #f1f5f9; text-align: center; }
                .text-notes-list { list-style: none; width: 100%; }
                .text-notes-list li { margin-bottom: 15px; background: rgba(255,255,255,0.05); padding: 18px; border-radius: 12px; border-left: 6px solid #deff9a; }
                .full-image-slide { width: 100%; height: 580px; display: flex; justify-content: center; align-items: center; border-radius: 12px; overflow: hidden; background: #000; border: 1px solid rgba(255,255,255,0.1); }
                .full-image-slide img { max-width: 100%; max-height: 100%; object-fit: contain; }
                .footer { position: absolute; bottom: 25px; left: 50px; right: 50px; display: flex; justify-content: space-between; font-size: 12px; color: #64748b; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 10px; }
            </style>
        `;

        let html = `<div class="pdf-root">${styles}`;

        // Slide 1: Kapak
        html += `
            <div class="slide-container cover-slide">
                <p style="text-transform: uppercase; letter-spacing: 4px; color: #deff9a; font-weight: bold; margin-bottom: 20px;">Teknik Deneme Raporu</p>
                <h1>${selectedMold.moldName}</h1>
                <p>Faz: ${trialData.phase}</p>
                
                <div class="cover-details-box">
                    <div>Deneme Tarihi: <strong>${formattedDate}</strong></div>
                    <div>Deneme Makinesi: <strong>${trialData.machine || 'Belirtilmedi'}</strong></div>
                </div>

                <div style="margin-top: 40px; padding: 15px 40px; background: rgba(222, 255, 154, 0.1); display: inline-block; border-radius: 50px; font-weight: bold; color: #deff9a; font-size: 20px; border: 1px solid #deff9a;">
                    DURUM: ${trialData.result === 'APPROVED' ? 'ONAYLANDI' : trialData.result === 'REJECTED' ? 'REDDEDİLDİ' : 'TASHİH GEREKLİ'}
                </div>
                <div class="footer"><span>Hazırlayan: ${loggedInUser.name}</span></div>
            </div>
        `;

        // Slide 2: Proses Özeti
        const selectedDefects = (trialData.defectTypes || []).filter(d => d.selected);
        html += `
            <div class="page-break"></div>
            <div class="slide-container">
                <h2 class="slide-title">Proses Özeti</h2>
                <div class="content-area">
                    <div class="param-grid">
                        <div class="param-card">
                            <h4>Genel Bilgiler</h4>
                            <div class="param-item"><span class="param-label">Deneme Makinesi</span><span>${trialData.machine || '-'}</span></div>
                            <div class="param-item"><span class="param-label">Hammadde Tipi</span><span>${trialData.material || '-'}</span></div>
                            <div class="param-item"><span class="param-label">Göz Sayısı</span><span>${trialData.cavity || '-'}</span></div>
                        </div>
                        <div class="param-card">
                            <h4>İşaretlenen Hata Kriterleri</h4>
                            <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                                ${selectedDefects.length > 0 ? selectedDefects.map(d => `
                                    <div style="padding: 6px 12px; border-radius: 6px; font-size: 14px; font-weight: bold; background: #7f1d1d; color: #fecaca; border: 1px solid #ef4444;">
                                        ✖ ${d.label}
                                    </div>
                                `).join('') : '<div style="color: #a7f3d0; font-weight: bold; font-size: 16px;">✔ Herhangi bir hata tespit edilmedi.</div>'}
                            </div>
                        </div>
                    </div>
                    <div style="margin-top: 30px; background: rgba(255,255,255,0.03); padding: 25px; border-radius: 12px; border-left: 6px solid #deff9a; flex: 1; overflow: hidden;">
                        <h4 style="margin-bottom: 10px; color: #deff9a; font-size: 18px;">Genel Deneme Özeti</h4>
                        <p style="font-size: 18px; line-height: 1.6;">${trialData.notes || 'Genel değerlendirme notu girilmemiş.'}</p>
                    </div>
                </div>
                <div class="footer"><span>${selectedMold.moldName}</span><span>Sayfa 2</span></div>
            </div>
        `;

        // Slide 3: Parametreler
        html += `
            <div class="page-break"></div>
            <div class="slide-container">
                <h2 class="slide-title">Üretim Parametreleri</h2>
                <div class="content-area">
                    <div class="param-grid">
                        ${(trialData.parameterGroups || []).map(group => `
                            <div class="param-card">
                                <h4>${group.name}</h4>
                                ${(group.fields || []).map(f => `
                                    <div class="param-item"><span class="param-label">${f.label}</span><span style="font-weight: bold; color: white;">${f.value || '-'}</span></div>
                                `).join('')}
                            </div>
                        `).join('')}
                    </div>
                </div>
                <div class="footer"><span>Teknik Veri Sayfası</span><span>Sayfa 3</span></div>
            </div>
        `;

        let pageCounter = 4;
        const notesWithImages = (trialData.quickNotes || []).filter(n => (n.images && n.images.length > 0) || n.image);
        const notesWithoutImages = (trialData.quickNotes || []).filter(n => !((n.images && n.images.length > 0) || n.image));

        // Resimli Gözlemler (RESİM ORANI KORUNDU)
        notesWithImages.forEach((note, index) => {
            const noteImg = (note.images && note.images.length > 0) ? note.images[0] : note.image;
            
            html += `
                <div class="page-break"></div>
                <div class="slide-container">
                    <h2 class="slide-title">Kritik Gözlem #${index + 1}</h2>
                    <div class="content-area">
                        <div class="observation-img-wrapper">
                            <img src="${noteImg}" />
                        </div>
                        <div class="observation-text">${note.text}</div>
                    </div>
                    <div class="footer"><span>Gözlem Detayı | ${note.createdBy}</span><span>Sayfa ${pageCounter++}</span></div>
                </div>
            `;
        });

        // Resimsiz Notlar
        if (notesWithoutImages.length > 0) {
            const chunkSize = 3; 
            for (let i = 0; i < notesWithoutImages.length; i += chunkSize) {
                const chunk = notesWithoutImages.slice(i, i + chunkSize);
                html += `
                    <div class="page-break"></div>
                    <div class="slide-container">
                        <h2 class="slide-title">Diğer Gözlemler ve Notlar ${notesWithoutImages.length > chunkSize ? `(Kısım ${Math.floor(i/chunkSize) + 1})` : ''}</h2>
                        <div class="content-area" style="justify-content: flex-start; padding-top: 10px;">
                            <ul class="text-notes-list">
                                ${chunk.map(n => `
                                    <li>
                                        <strong style="font-size: 19px; display: block; color: white; line-height: 1.4;">${n.text}</strong>
                                        <div style="font-size: 13px; color: #64748b; margin-top: 6px;">Ekleyen: ${n.createdBy} | Tarih: ${n.createdAt}</div>
                                    </li>
                                `).join('')}
                            </ul>
                        </div>
                        <div class="footer"><span>Ek Gözlem Kayıtları</span><span>Sayfa ${pageCounter++}</span></div>
                    </div>
                `;
            }
        }

        // Galeri
        const galleryImages = (trialData.media || []).filter(m => m.type === 'image');
        galleryImages.forEach((img, index) => {
            html += `
                <div class="page-break"></div>
                <div class="slide-container">
                    <h2 class="slide-title">Süreç Medya Galerisi (${index + 1} / ${galleryImages.length})</h2>
                    <div class="content-area">
                        <div class="full-image-slide">
                            <img src="${img.url}" />
                        </div>
                    </div>
                    <div class="footer"><span>Genel Galeri</span><span>Sayfa ${pageCounter++}</span></div>
                </div>
            `;
        });

        html += `</div>`;
        element.innerHTML = html;

        const opt = {
            margin: 0,
            filename: `Kalıp_Deneme_Sunumu_${selectedMold.moldName.replace(/\s+/g, '_')}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { 
                scale: 2, 
                useCORS: true, 
                letterRendering: true, 
                width: 1123, 
                windowWidth: 1123,
                backgroundColor: '#0f172a' 
            },
            jsPDF: { unit: 'px', format: [1123, 793], orientation: 'landscape', compress: true },
            pagebreak: { mode: 'css', before: '.page-break' }
        };

        alert("PDF oluşturuluyor, lütfen bekleyin...");
        html2pdf().set(opt).from(element).save();
    };


    // --- NOT & YORUM İŞLEMLER ---
    const handleQuickNoteImageUpload = async (event) => {
        const file = event.target.files[0];
        if (!file) return;
        
        setIsUploadingNoteImage(true);
        try {
            const url = await uploadFileToStorage(file, selectedMold?.id);
            if (url) {
                setNewQuickNoteImage(url);
            } else {
                alert("Fotoğraf yüklenemedi. Lütfen tekrar deneyin.");
            }
        } catch (error) {
            console.error("Hızlı not resim yükleme hatası:", error);
            alert("Hata: Fotoğraf yüklenirken bir problem oluştu: " + error.message);
        } finally {
            setIsUploadingNoteImage(false);
            event.target.value = '';
        }
    };

    const handleAddQuickNote = async () => {
        if (!newQuickNoteText && !newQuickNoteImage) return;
        const newNote = {
            id: Date.now(),
            text: newQuickNoteText,
            images: newQuickNoteImage ? [newQuickNoteImage] : [],
            comments: [],
            createdAt: getCurrentDateTimeString(),
            createdBy: loggedInUser?.name || 'Anonim'
        };
        const updatedData = { ...trialData, quickNotes: [newNote, ...(trialData.quickNotes || [])] };
        setTrialData(updatedData);
        setNewQuickNoteText(''); setNewQuickNoteImage(null);
        await saveTrialDataToDB(updatedData, true); 
    };

    const handleDeleteQuickNote = async (noteId) => {
        if(!window.confirm("Bu notu tamamen silmek istediğinize emin misiniz?")) return;
        const updatedData = { ...trialData, quickNotes: (trialData.quickNotes || []).filter(n => n.id !== noteId) };
        setTrialData(updatedData);
        await saveTrialDataToDB(updatedData, true);
    };

    const startEditingNote = (note) => { setEditingNoteId(note.id); setEditingNoteText(note.text); };

    const saveEditedNoteText = async () => {
        const updatedData = { ...trialData, quickNotes: (trialData.quickNotes || []).map(note => note.id === editingNoteId ? { ...note, text: editingNoteText } : note) };
        setTrialData(updatedData);
        setEditingNoteId(null);
        await saveTrialDataToDB(updatedData, true);
    };

    const handleAddImageToExistingNote = async (noteId, event) => {
        const files = Array.from(event.target.files);
        if (files.length === 0) return;
        
        setIsUploadingNoteImage(true);
        try {
            const newImages = await Promise.all(
                files.map(async (file) => await uploadFileToStorage(file, selectedMold?.id))
            );
            const validImages = newImages.filter(url => url !== null);
            if (validImages.length === 0) {
                alert("Fotoğraflar yüklenemedi.");
                return;
            }
            
            const updatedData = { 
                ...trialData, 
                quickNotes: (trialData.quickNotes || []).map(note => 
                    note.id === noteId 
                        ? { 
                            ...note, 
                            images: [...(note.images || []), ...(note.image ? [note.image] : []), ...validImages].filter((v, i, a) => a.indexOf(v) === i), 
                            image: null 
                          } 
                        : note 
                ) 
            };
            setTrialData(updatedData);
            await saveTrialDataToDB(updatedData, true);
        } catch (error) {
            console.error("Mevcut nota fotoğraf ekleme hatası:", error);
            alert("Hata: Fotoğraflar yüklenirken bir problem oluştu: " + error.message);
        } finally {
            setIsUploadingNoteImage(false);
            event.target.value = '';
        }
    };

    const handleDeleteImageFromNote = async (noteId, imgIndex) => {
        const updatedData = { ...trialData, quickNotes: (trialData.quickNotes || []).map(note => { if (note.id === noteId) { const newImgs = [...(note.images || [])]; newImgs.splice(imgIndex, 1); return { ...note, images: newImgs }; } return note; }) };
        setTrialData(updatedData);
        await saveTrialDataToDB(updatedData, true);
    };

    const handleStartCommenting = (noteId) => { setCommentingNoteId(noteId); setCommentText(''); };
    
    const handleSubmitComment = async (noteId) => {
        if (!commentText.trim()) return;
        const updatedData = { ...trialData, quickNotes: (trialData.quickNotes || []).map(note => note.id === noteId ? { ...note, comments: [...(note.comments || []), { id: Date.now(), text: commentText, createdBy: loggedInUser?.name || 'Anonim', createdAt: getCurrentDateTimeString() }] } : note) };
        setTrialData(updatedData);
        setCommentingNoteId(null); setCommentText('');
        await saveTrialDataToDB(updatedData, true); 
    };

    const handleCancelComment = () => { setCommentingNoteId(null); setCommentText(''); };
    
    const startEditingComment = (noteId, comment) => {
        setEditingComment({ noteId, commentId: comment.id, text: comment.text });
    };

    const saveEditedComment = async () => {
        const updatedData = {
            ...trialData,
            quickNotes: (trialData.quickNotes || []).map(note => {
                if (note.id === editingComment.noteId) {
                    return { ...note, comments: (note.comments || []).map(c => c.id === editingComment.commentId ? { ...c, text: editingComment.text } : c) };
                }
                return note;
            })
        };
        setTrialData(updatedData);
        setEditingComment({ noteId: null, commentId: null, text: '' });
        await saveTrialDataToDB(updatedData, true);
    };

    const handleDeleteComment = async (noteId, commentId) => {
        if(!window.confirm("Bu yorumu silmek istediğinize emin misiniz?")) return;
        const updatedData = {
            ...trialData,
            quickNotes: (trialData.quickNotes || []).map(note => {
                if (note.id === noteId) { return { ...note, comments: (note.comments || []).filter(c => c.id !== commentId) }; }
                return note;
            })
        };
        setTrialData(updatedData);
        await saveTrialDataToDB(updatedData, true);
    };

    const handleResultChange = async (newResult) => {
        const updatedData = { ...trialData, result: newResult };
        setTrialData(updatedData);
        await saveTrialDataToDB(updatedData, true); 
    };

    // --- GÖRSEL DÜZENLEME (DRAWING) ---
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
        
        // Mobil dokunmatik desteği
        let clientX = e.clientX;
        let clientY = e.clientY;
        if (e.touches && e.touches.length > 0) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        }

        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
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
        // Mobilde sayfayı kaydırmayı engelle
        if (e.cancelable) e.preventDefault(); 
        
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
        setIsSaving(true);
        canvas.toBlob(async (blob) => {
            if (!blob) {
                alert("Düzenlenen görsel kaydedilemedi.");
                setIsSaving(false);
                return;
            }
            try {
                const timestamp = Date.now();
                const uniqueFileName = `mold_trial_reports/${selectedMold?.id || 'edited'}/${timestamp}_edited_drawing.jpg`;
                const storageRef = ref(storage, uniqueFileName);
                await uploadBytes(storageRef, blob);
                const downloadURL = await getDownloadURL(storageRef);

                const newMedia = [...trialData.media];
                newMedia[lightboxIndex] = { ...newMedia[lightboxIndex], url: downloadURL };
                const updatedData = { ...trialData, media: newMedia };
                setTrialData(updatedData);
                setIsEditing(false);
                await saveTrialDataToDB(updatedData, true);
            } catch (error) {
                console.error("Çizim kaydetme hatası:", error);
                alert("Hata: Çizim kaydedilirken Storage hatası oluştu: " + error.message);
            } finally {
                setIsSaving(false);
            }
        }, 'image/jpeg', 0.8);
    };

    const handleNextMedia = (e) => { if(e) e.stopPropagation(); if (trialData.media.length > 0) setLightboxIndex((prev) => (prev + 1) % trialData.media.length); };
    const handlePrevMedia = (e) => { if(e) e.stopPropagation(); if (trialData.media.length > 0) setLightboxIndex((prev) => (prev - 1 + trialData.media.length) % trialData.media.length); };

    // --- RENDER BİLEŞENLERİ ---
    const MoldListItem = ({ mold }) => (
        <div onClick={() => handleMoldSelect(mold)} className={`p-4 border-b border-gray-100 dark:border-gray-700 cursor-pointer hover:bg-blue-50 dark:hover:bg-gray-700 transition group ${selectedMold?.id === mold.id ? 'bg-blue-50 dark:bg-gray-700 border-l-4 border-l-blue-600' : ''}`}>
            <div className="flex justify-between items-start mb-1">
                <span className="font-bold text-gray-800 dark:text-gray-200 text-sm truncate w-2/3">{mold.moldName}</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                    (mold.status && (mold.status.includes('ONAY') || mold.status === 'APPROVED')) ? 'bg-green-100 text-green-800' : 
                    (mold.status && (mold.status.includes('RET') || mold.status === 'REJECTED')) ? 'bg-red-100 text-red-800' :
                    (mold.status && mold.status.toString().toUpperCase().includes('DENEME')) ? 'bg-yellow-100 text-yellow-800' : 
                    'bg-gray-100 text-gray-600'
                }`}>{mold.status || 'BELİRSİZ'}</span>
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 flex justify-between">
                <span>{mold.projectCode || 'Kod Yok'}</span><span>T{mold.trialCount || '0'}</span>
            </div>
        </div>
    );

    return (
        // RESPONSIVE ANA KAPLAYICI (gap-0 on mobile, gap-4 on desktop)
        <div className="flex h-[calc(100vh-64px)] bg-gray-100 dark:bg-gray-900 gap-0 md:gap-4 p-0 md:p-4 overflow-hidden font-sans text-sm relative">
            
            {/* DEFECT EDİTÖR MODAL */}
            {isDefectEditorOpen && (
                <div className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl w-[95%] md:w-full max-w-lg shadow-2xl flex flex-col overflow-hidden">
                        <div className="p-4 md:p-5 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900">
                            <h3 className="font-black text-gray-800 dark:text-white flex items-center text-sm md:text-base">Hata Kriterlerini Düzenle</h3>
                            <button onClick={() => setIsDefectEditorOpen(false)} className="text-gray-500 hover:text-red-500 transition"><X className="w-5 h-5 md:w-6 md:h-6"/></button>
                        </div>
                        <div className="p-4 md:p-6 flex-1 overflow-y-auto max-h-[60vh] space-y-3">
                            {(trialData.defectTypes || []).map(defect => (
                                <div key={defect.id} className="flex items-center gap-3 bg-gray-50 dark:bg-gray-900 p-3 rounded-xl border border-gray-200 dark:border-gray-700">
                                    <input type="text" className="flex-1 font-bold text-sm bg-transparent outline-none dark:text-white border-b border-dashed border-gray-300 dark:border-gray-600 focus:border-blue-500 px-1" value={defect.label} onChange={e => updateDefectLabel(defect.id, e.target.value)} placeholder="Hata Kriteri Adı..." />
                                    <button onClick={() => deleteDefectType(defect.id)} className="text-gray-400 hover:bg-red-50 hover:text-red-500 p-2 rounded transition"><Trash2 className="w-5 h-5"/></button>
                                </div>
                            ))}
                            <button onClick={addDefectType} className="w-full py-4 border-2 border-dashed border-gray-300 dark:border-gray-600 text-blue-600 dark:text-blue-400 rounded-xl hover:bg-blue-50 dark:hover:bg-gray-800 transition flex items-center justify-center font-bold text-sm mt-4"><Plus className="w-5 h-5 mr-2"/> Yeni Hata Sebebi Ekle</button>
                        </div>
                    </div>
                </div>
            )}

            {previewImage && (
                <div className="fixed inset-0 z-[60] bg-black/95 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in" onClick={() => setPreviewImage(null)}>
                    <button className="absolute top-4 right-4 text-white hover:text-red-500 transition"><X className="w-8 h-8 md:w-10 md:h-10" /></button>
                    <img src={previewImage} alt="Önizleme" className="max-w-full max-h-[90vh] rounded shadow-2xl object-contain" />
                </div>
            )}

            {lightboxIndex !== null && trialData.media && trialData.media[lightboxIndex] && (
                <div className="fixed inset-0 z-50 bg-black/95 flex flex-col items-center justify-center p-0 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="absolute top-0 left-0 right-0 p-2 md:p-4 flex justify-between items-center bg-gradient-to-b from-black/80 to-transparent z-50">
                        <div className="flex gap-2 flex-wrap">
                            {trialData.media[lightboxIndex].type === 'image' && (
                                !isEditing ? (
                                    <button onClick={handleStartEditing} className="flex items-center px-3 py-1.5 md:px-4 md:py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-full text-xs md:text-sm font-bold shadow-lg transition"><Edit3 className="w-3 h-3 md:w-4 md:h-4 mr-1 md:mr-2" /> Düzenle</button>
                                ) : (
                                    <div className="flex items-center gap-1 md:gap-2 animate-in slide-in-from-top-5 flex-wrap">
                                        <div className="flex bg-gray-800 rounded-full p-1 border border-gray-600">
                                            <button onClick={() => setEditTool('PEN')} className={`p-1.5 md:p-2 rounded-full transition ${editTool === 'PEN' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}><Edit3 className="w-4 h-4"/></button>
                                            <button onClick={() => setEditTool('CIRCLE')} className={`p-1.5 md:p-2 rounded-full transition ${editTool === 'CIRCLE' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}><CircleIcon className="w-4 h-4"/></button>
                                            <button onClick={() => setEditTool('TEXT')} className={`p-1.5 md:p-2 rounded-full transition ${editTool === 'TEXT' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}><Type className="w-4 h-4"/></button>
                                        </div>
                                        <div className="flex bg-gray-800 rounded-full p-1 border border-gray-600 gap-1 hidden md:flex">
                                            {['#ef4444', '#22c55e', '#eab308', '#3b82f6', '#ffffff'].map(color => (
                                                <button key={color} onClick={() => setDrawingColor(color)} className={`w-5 h-5 md:w-6 md:h-6 rounded-full border-2 transition ${drawingColor === color ? 'border-white scale-110' : 'border-transparent'}`} style={{ backgroundColor: color }} />
                                            ))}
                                        </div>
                                        <button 
                                            disabled={isSaving}
                                            onClick={handleSaveEdit} 
                                            className="flex items-center px-3 py-1.5 md:px-4 md:py-2 bg-green-600 hover:bg-green-700 text-white rounded-full text-xs md:text-sm font-bold ml-1 md:ml-2 disabled:opacity-50"
                                        >
                                            <Check className="w-3 h-3 md:w-4 md:h-4 mr-1" /> {isSaving ? 'Kaydediliyor...' : 'Kaydet'}
                                        </button>
                                        <button onClick={() => setIsEditing(false)} className="flex items-center px-3 py-1.5 md:px-4 md:py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-full text-xs md:text-sm font-bold"><X className="w-3 h-3 md:w-4 md:h-4 mr-1" /> İptal</button>
                                    </div>
                                )
                            )}
                        </div>
                        <button onClick={() => { setLightboxIndex(null); setIsEditing(false); }} className="text-white hover:text-red-500 transition p-1.5 md:p-2 bg-white/10 rounded-full hover:bg-white/20"><X className="w-6 h-6 md:w-8 md:h-8" /></button>
                    </div>

                    <div className="flex-1 flex items-center justify-center w-full h-full p-0 md:p-4 overflow-hidden relative" onClick={() => !isEditing && setLightboxIndex(null)}>
                        {!isEditing && <button onClick={handlePrevMedia} className="absolute left-2 md:left-4 z-10 text-white/50 hover:text-white transition hover:scale-110 p-2 md:p-4 bg-black/20 rounded-full hover:bg-black/50"><ChevronLeft className="w-8 h-8 md:w-12 md:h-12" /></button>}
                        <div className="relative max-w-full max-h-full flex items-center justify-center w-full h-full" onClick={(e) => e.stopPropagation()}>
                            {isEditing ? (
                                <canvas 
                                    ref={canvasRef} 
                                    onMouseDown={startDrawing} onMouseMove={draw} onMouseUp={stopDrawing} onMouseLeave={stopDrawing} 
                                    onTouchStart={startDrawing} onTouchMove={draw} onTouchEnd={stopDrawing}
                                    className="max-w-full max-h-[85vh] object-contain cursor-crosshair shadow-2xl border border-gray-700 bg-black touch-none" 
                                />
                            ) : (
                                trialData.media[lightboxIndex].type === 'image' ? <img src={trialData.media[lightboxIndex].url} alt="Büyük" className="max-w-full max-h-[85vh] object-contain md:rounded-lg shadow-2xl" /> : <video src={trialData.media[lightboxIndex].url} controls autoPlay className="max-w-full max-h-[85vh] rounded-lg shadow-2xl" />
                            )}
                        </div>
                        {!isEditing && <button onClick={handleNextMedia} className="absolute right-2 md:right-4 z-10 text-white/50 hover:text-white transition hover:scale-110 p-2 md:p-4 bg-black/20 rounded-full hover:bg-black/50"><ChevronRight className="w-8 h-8 md:w-12 md:h-12" /></button>}
                    </div>
                </div>
            )}

            {/* --- SOL PANEL (KALIP LİSTESİ) --- */}
            {/* MOBİL: Bir kalıp seçiliyse gizle. BİLGİSAYAR: Her zaman flex */}
            <div className={`${selectedMold ? 'hidden md:flex' : 'flex'} w-full md:w-72 lg:w-1/4 md:min-w-[300px] shrink-0 bg-white dark:bg-gray-800 md:rounded-xl shadow-lg border-r md:border border-gray-200 dark:border-gray-700 flex-col h-full z-10`}>
                <div className="p-4 border-b border-gray-200 dark:border-gray-700 mt-2 md:mt-0">
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

            {/* --- SAĞ PANEL (DETAYLAR VE FORMLAR) --- */}
            {/* MOBİL: Bir kalıp seçili değilse gizle. BİLGİSAYAR: Her zaman flex */}
            <div className={`${!selectedMold ? 'hidden md:flex' : 'flex'} flex-1 min-w-0 bg-white dark:bg-gray-800 md:rounded-xl shadow-lg border-l md:border border-gray-200 dark:border-gray-700 flex-col overflow-hidden h-full z-20`}>
                {selectedMold ? (
                    <>
                        <div className="px-4 md:px-5 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 transition-all duration-300">
                            
                            <div className={`flex flex-col md:flex-row justify-between items-start md:items-center ${activeTab !== 'QUICK_NOTES' ? 'mb-4' : ''}`}>
                                <div className="w-full flex items-center justify-between md:justify-start mb-2 md:mb-0">
                                    <div className="flex items-center">
                                        {/* YENİ: Mobilde Geri Dön Butonu */}
                                        <button onClick={() => setSelectedMold(null)} className="md:hidden mr-3 p-1.5 bg-gray-200 dark:bg-gray-700 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-300 transition">
                                            <ChevronLeft className="w-5 h-5" />
                                        </button>
                                        
                                        <div>
                                            <h1 className="text-xl md:text-2xl font-black text-gray-800 dark:text-white flex flex-wrap items-center gap-2">
                                                {selectedMold.moldName}
                                                <span className="text-xs md:text-sm font-normal text-gray-500 bg-white dark:bg-gray-800 px-2 py-1 rounded border border-gray-200 dark:border-gray-700">{selectedMold.projectCode}</span>
                                            </h1>
                                            <div className="flex items-center mt-1 space-x-2">
                                                <p className="text-[10px] md:text-xs text-gray-500">Müşteri: {selectedMold.customerName || 'Belirtilmemiş'}</p>
                                                <Link to={`/mold/${selectedMold.id}`} className="text-[10px] md:text-xs text-blue-600 hover:underline flex items-center bg-blue-50 px-2 py-0.5 rounded">
                                                    Kalıp Detayına Git <ChevronRight className="w-3 h-3 ml-1"/>
                                                </Link>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    {/* Faz rozeti (Sadece Raporda Sağ Üstte, mobilde küçük) */}
                                    {activeTab === 'QUICK_NOTES' && (
                                        <span className="text-[10px] md:text-xs font-bold text-blue-800 bg-blue-100 px-2 py-1 rounded ml-auto">Faz: {trialData.phase}</span>
                                    )}
                                </div>
                                
                                {activeTab !== 'QUICK_NOTES' && (
                                    <div className="flex flex-wrap gap-1 md:gap-2 w-full md:w-auto animate-in fade-in">
                                        {TRIAL_PHASES.map(phase => {
                                            const hasReport = reports.some(r => r.phase === phase);
                                            return (
                                                <button key={phase} onClick={() => handlePhaseChange(phase)} className={`px-2 py-1 md:px-3 text-[10px] md:text-xs font-bold rounded border transition flex-1 md:flex-none ${trialData.phase === phase ? 'bg-blue-600 text-white border-blue-600 shadow-md' : hasReport ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100' : 'bg-white text-gray-400 border-gray-200 hover:bg-gray-50'}`}>
                                                    {phase} {hasReport && '✓'}
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {activeTab !== 'QUICK_NOTES' && (
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4 animate-in slide-in-from-top-2 fade-in mt-2 md:mt-0">
                                    <div><label className="text-[9px] md:text-[10px] uppercase font-bold text-gray-400 block mb-1">Faz</label><select className="w-full p-1.5 md:p-2 text-xs md:text-sm border rounded bg-white dark:bg-gray-800 dark:text-white" value={trialData.phase} onChange={(e) => handlePhaseChange(e.target.value)}>{TRIAL_PHASES.map(p => <option key={p} value={p}>{p}</option>)}</select></div>
                                    
                                    {/* YENİ EKLENEN TARİH SEÇİCİ */}
                                    <div>
                                        <label className="text-[9px] md:text-[10px] uppercase font-bold text-gray-400 block mb-1 flex items-center"><Calendar className="w-3 h-3 mr-1" /> Tarih</label>
                                        <input type="date" className="w-full p-1.5 md:p-2 text-xs md:text-sm border rounded bg-white dark:bg-gray-800 dark:text-white" value={trialData.trialDate || new Date().toISOString().split('T')[0]} onChange={(e) => setTrialData({...trialData, trialDate: e.target.value})} />
                                    </div>

                                    {/* GÜNCELLENEN MAKİNE ALANI (İkona sahip) */}
                                    <div>
                                        <label className="text-[9px] md:text-[10px] uppercase font-bold text-gray-400 block mb-1 flex items-center"><Monitor className="w-3 h-3 mr-1" /> Makine</label>
                                        <input type="text" className="w-full p-1.5 md:p-2 text-xs md:text-sm border rounded bg-white dark:bg-gray-800 dark:text-white" value={trialData.machine} onChange={(e) => setTrialData({...trialData, machine: e.target.value})} />
                                    </div>
                                    
                                    <div><label className="text-[9px] md:text-[10px] uppercase font-bold text-gray-400 block mb-1">Hammadde</label><input type="text" className="w-full p-1.5 md:p-2 text-xs md:text-sm border rounded bg-white dark:bg-gray-800 dark:text-white" value={trialData.material} onChange={(e) => setTrialData({...trialData, material: e.target.value})} /></div>
                                </div>
                            )}
                        </div>

                        {/* SEKME MENÜSÜ (Mobilde yatay kaydırılabilir) */}
                        <div className="flex border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 md:px-4 overflow-x-auto hide-scrollbar">
                            <button onClick={() => setActiveTab('QUICK_NOTES')} className={`py-2.5 px-3 md:px-4 text-xs md:text-sm font-bold border-b-2 transition flex items-center whitespace-nowrap ${activeTab === 'QUICK_NOTES' ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-500'}`}><MessageSquare className="w-3.5 h-3.5 md:w-4 md:h-4 mr-1.5 md:mr-2" /> Rapor</button>
                            <button onClick={() => setActiveTab('PARAMS')} className={`py-2.5 px-3 md:px-4 text-xs md:text-sm font-bold border-b-2 transition flex items-center whitespace-nowrap ${activeTab === 'PARAMS' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500'}`}><Gauge className="w-3.5 h-3.5 md:w-4 md:h-4 mr-1.5 md:mr-2" /> Parametreler</button>
                            <button onClick={() => setActiveTab('GALLERY')} className={`py-2.5 px-3 md:px-4 text-xs md:text-sm font-bold border-b-2 transition flex items-center whitespace-nowrap ${activeTab === 'GALLERY' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500'}`}><Camera className="w-3.5 h-3.5 md:w-4 md:h-4 mr-1.5 md:mr-2" /> Görseller</button>
                            <button onClick={() => setActiveTab('RESULT')} className={`py-2.5 px-3 md:px-4 text-xs md:text-sm font-bold border-b-2 transition flex items-center whitespace-nowrap ${activeTab === 'RESULT' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500'}`}><FileText className="w-3.5 h-3.5 md:w-4 md:h-4 mr-1.5 md:mr-2" /> Sonuç</button>
                        </div>

                        {/* SEKME İÇERİKLERİ */}
                        <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-gray-50/50 dark:bg-gray-900/50">
                            
                            {/* RAPOR SEKMESİ */}
                            {activeTab === 'QUICK_NOTES' && (
                                <div className="space-y-4 md:space-y-6 animate-in fade-in">
                                    <div className="bg-white dark:bg-gray-800 p-3 md:p-4 rounded-xl shadow-sm border border-orange-200 dark:border-gray-700">
                                        <div className="mb-4 border-b pb-3 dark:border-gray-700">
                                            <h3 className="text-xs md:text-sm font-bold text-gray-800 dark:text-white mb-2">Kalıp Durumu (Onay/Ret)</h3>
                                            <div className="flex flex-col md:flex-row gap-2">
                                                <button onClick={() => handleResultChange('APPROVED')} className={`flex-1 py-2 text-xs md:text-sm rounded-lg border-2 font-bold flex items-center justify-center transition ${trialData.result === 'APPROVED' ? 'bg-green-600 border-green-600 text-white' : 'border-green-200 text-green-600 hover:bg-green-50'}`}><ThumbsUp className="w-3.5 h-3.5 md:w-4 md:h-4 mr-1.5" /> ONAYLA</button>
                                                <button onClick={() => handleResultChange('REJECTED')} className={`flex-1 py-2 text-xs md:text-sm rounded-lg border-2 font-bold flex items-center justify-center transition ${trialData.result === 'REJECTED' ? 'bg-red-600 border-red-600 text-white' : 'border-red-200 text-red-600 hover:bg-red-50'}`}><ThumbsDown className="w-3.5 h-3.5 md:w-4 md:h-4 mr-1.5" /> REDDET</button>
                                                <button onClick={() => handleResultChange('REVISION')} className={`flex-1 py-2 text-xs md:text-sm rounded-lg border-2 font-bold flex items-center justify-center transition ${trialData.result === 'REVISION' ? 'bg-orange-500 border-orange-500 text-white' : 'border-orange-200 text-orange-600 hover:bg-orange-50'}`}><AlertTriangle className="w-3.5 h-3.5 md:w-4 md:h-4 mr-1.5" /> TASHİH</button>
                                            </div>
                                        </div>
                                        
                                        <h3 className="text-xs md:text-sm font-bold text-orange-600 mb-2 flex items-center"><MessageSquare className="w-4 h-4 mr-2"/> Yeni Rapor Notu Ekle</h3>
                                        <div className="flex flex-col md:flex-row gap-2">
                                            <div className="flex gap-2">
                                                <input type="file" ref={quickNoteFileInputRef} className="hidden" accept="image/*" onChange={handleQuickNoteImageUpload} />
                                                <button 
                                                    disabled={isUploadingNoteImage}
                                                    onClick={() => quickNoteFileInputRef.current.click()} 
                                                    className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-600 border border-dashed border-gray-300 w-12 h-10 flex items-center justify-center shrink-0 disabled:opacity-50"
                                                >
                                                    {isUploadingNoteImage ? (
                                                        <div className="w-5 h-5 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
                                                    ) : newQuickNoteImage ? (
                                                        <img src={newQuickNoteImage} className="w-6 h-6 object-cover rounded" alt="secilen" />
                                                    ) : (
                                                        <Camera className="w-5 h-5" />
                                                    )}
                                                </button>
                                                <input type="text" className="flex-1 md:hidden p-2 text-sm border rounded-lg dark:bg-gray-700 dark:text-white" placeholder="Notunuz..." value={newQuickNoteText} onChange={(e) => setNewQuickNoteText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && !isUploadingNoteImage && handleAddQuickNote()} />
                                            </div>
                                            <div className="flex-1 flex gap-2 hidden md:flex">
                                                <input type="text" className="flex-1 p-2 text-sm border rounded-lg dark:bg-gray-700 dark:text-white" placeholder="Örn: Sol üst köşede çapak var..." value={newQuickNoteText} onChange={(e) => setNewQuickNoteText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && !isUploadingNoteImage && handleAddQuickNote()} />
                                                <button 
                                                    disabled={isUploadingNoteImage || (!newQuickNoteText && !newQuickNoteImage)}
                                                    onClick={handleAddQuickNote} 
                                                    className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-bold text-sm shrink-0 disabled:opacity-50"
                                                >
                                                    {isUploadingNoteImage ? 'Yükleniyor...' : 'Notu Kaydet'}
                                                </button>
                                            </div>
                                            <button 
                                                disabled={isUploadingNoteImage || (!newQuickNoteText && !newQuickNoteImage)}
                                                onClick={handleAddQuickNote} 
                                                className="md:hidden w-full py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-bold text-sm disabled:opacity-50"
                                            >
                                                {isUploadingNoteImage ? 'Yükleniyor...' : 'Notu Kaydet'}
                                            </button>
                                        </div>
                                    </div>
                                    
                                    <div className="space-y-4 pb-10">
                                        {(trialData.quickNotes || []).length > 0 ? (
                                            (trialData.quickNotes || []).map(note => (
                                                <div key={note.id} className="bg-white dark:bg-gray-800 p-3 md:p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 flex flex-col md:flex-row gap-3 md:gap-4">
                                                    
                                                    {(note.images || []).length > 0 && (
                                                        <div className="w-full md:w-32 flex md:flex-col gap-2 shrink-0 overflow-x-auto md:overflow-y-auto custom-scrollbar md:h-32">
                                                            {note.images.map((imgUrl, imgIdx) => (
                                                                <div key={imgIdx} className="w-24 h-24 md:w-full md:h-full shrink-0 relative group">
                                                                    <img src={imgUrl} alt="Not Görseli" className="w-full h-full object-cover rounded-lg border cursor-pointer hover:opacity-80" onClick={() => setPreviewImage(imgUrl)} />
                                                                    <button onClick={() => handleDeleteImageFromNote(note.id, imgIdx)} className="absolute top-1 right-1 bg-red-600/80 hover:bg-red-600 text-white p-1 rounded-full opacity-100 md:opacity-0 group-hover:opacity-100 transition"><X className="w-3 h-3"/></button>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                    
                                                    {/* Eski not uyumluluğu */}
                                                    {note.image && !(note.images && note.images.length > 0) && (
                                                        <div className="w-full md:w-32 h-32 flex-shrink-0 cursor-pointer" onClick={() => setPreviewImage(note.image)}><img src={note.image} alt="Not Görseli" className="w-full h-full object-cover rounded-lg border" /></div>
                                                    )}

                                                    <div className="flex-1">
                                                        <div className="flex justify-between items-start">
                                                            {editingNoteId === note.id ? (
                                                                <div className="flex-1 flex flex-col md:flex-row gap-2">
                                                                    <textarea className="w-full p-2 border rounded dark:bg-gray-700 dark:text-white text-sm" value={editingNoteText} onChange={e=>setEditingNoteText(e.target.value)}></textarea>
                                                                    <div className="flex gap-2">
                                                                        <button onClick={saveEditedNoteText} className="px-3 py-1.5 md:py-0 bg-green-500 text-white rounded font-bold flex-1"><Check className="w-4 h-4 mx-auto"/></button>
                                                                        <button onClick={()=>setEditingNoteId(null)} className="px-3 py-1.5 md:py-0 bg-gray-300 text-gray-700 rounded font-bold flex-1"><X className="w-4 h-4 mx-auto"/></button>
                                                                    </div>
                                                                </div>
                                                            ) : (
                                                                <p className="font-bold text-gray-800 dark:text-white text-base md:text-lg">{note.text}</p>
                                                            )}
                                                            
                                                            <div className="flex items-center gap-2 ml-2 md:ml-4 shrink-0">
                                                                <label className="cursor-pointer text-gray-400 hover:text-green-500 transition" title="Fotoğraf Ekle">
                                                                    <PlusCircle className="w-4 h-4 md:w-5 md:h-5"/>
                                                                    <input type="file" className="hidden" accept="image/*" multiple onChange={(e) => handleAddImageToExistingNote(note.id, e)} />
                                                                </label>
                                                                <button onClick={() => startEditingNote(note)} className="text-gray-400 hover:text-blue-500 transition"><Edit2 className="w-4 h-4"/></button>
                                                                <button onClick={() => handleDeleteQuickNote(note.id)} className="text-gray-400 hover:text-red-500 transition"><Trash2 className="w-4 h-4"/></button>
                                                            </div>
                                                        </div>
                                                        <div className="text-[10px] md:text-xs text-gray-500 mt-2 md:mt-1 flex items-center"><span>{note.createdBy}</span><span className="mx-2">•</span><span>{note.createdAt}</span></div>
                                                        
                                                        {/* ALT YORUMLAR */}
                                                        <div className="mt-3 bg-gray-50 dark:bg-gray-900/50 p-2 rounded-lg border border-gray-100 dark:border-gray-700">
                                                            {(note.comments || []).map(comment => (
                                                                <div key={comment.id} className="text-xs text-gray-600 dark:text-gray-300 border-b last:border-0 border-gray-200 dark:border-gray-700 py-1.5 flex flex-col md:flex-row justify-between group/comment gap-1">
                                                                    {editingComment.commentId === comment.id ? (
                                                                        <div className="flex gap-2 w-full">
                                                                            <input type="text" className="flex-1 p-1 bg-white dark:bg-gray-800 border rounded dark:text-white dark:border-gray-600" value={editingComment.text} onChange={e => setEditingComment({...editingComment, text: e.target.value})} autoFocus />
                                                                            <button onClick={saveEditedComment} className="text-green-600"><Check className="w-4 h-4"/></button>
                                                                            <button onClick={() => setEditingComment({noteId: null, commentId: null, text: ''})} className="text-gray-500"><X className="w-4 h-4"/></button>
                                                                        </div>
                                                                    ) : (
                                                                        <>
                                                                            <div><strong className="text-gray-800 dark:text-gray-200">{comment.createdBy}:</strong> {comment.text}</div>
                                                                            <div className="opacity-100 md:opacity-0 group-hover/comment:opacity-100 flex gap-3 md:gap-2 self-end md:self-auto">
                                                                                <button onClick={() => startEditingComment(note.id, comment)} className="text-gray-400 hover:text-blue-500"><Edit2 className="w-3 h-3"/></button>
                                                                                <button onClick={() => handleDeleteComment(note.id, comment.id)} className="text-gray-400 hover:text-red-500"><Trash2 className="w-3 h-3"/></button>
                                                                            </div>
                                                                        </>
                                                                    )}
                                                                </div>
                                                            ))}

                                                            {commentingNoteId === note.id ? (
                                                                <div className="mt-2 flex flex-col md:flex-row gap-2 animate-in fade-in">
                                                                    <input type="text" className="flex-1 p-1.5 text-xs border rounded dark:bg-gray-800 dark:text-white dark:border-gray-600" placeholder="Yorumunuzu yazın..." value={commentText} onChange={(e) => setCommentText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSubmitComment(note.id)} autoFocus />
                                                                    <div className="flex gap-2 w-full md:w-auto">
                                                                        <button onClick={() => handleSubmitComment(note.id)} className="flex-1 md:flex-none px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700">Kaydet</button>
                                                                        <button onClick={handleCancelComment} className="flex-1 md:flex-none px-2 py-1 bg-gray-300 text-gray-700 text-xs rounded hover:bg-gray-400">İptal</button>
                                                                    </div>
                                                                </div>
                                                            ) : (<button onClick={() => handleStartCommenting(note.id)} className="text-[10px] md:text-xs text-blue-500 hover:text-blue-700 mt-2 font-bold">+ Alt Yorum Ekle</button>)}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))
                                        ) : (<div className="text-center text-gray-400 py-10 font-medium">Henüz bir not eklenmemiş.</div>)}
                                    </div>
                                </div>
                            )}

                            {/* PARAMETRELER SEKMESİ */}
                            {activeTab === 'PARAMS' && (
                                <div className="space-y-6 animate-in fade-in">
                                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-2">
                                        <h3 className="text-base md:text-lg font-bold dark:text-white flex items-center"><FileText className="w-4 h-4 md:w-5 md:h-5 mr-2 text-blue-600"/> Üretim Parametreleri</h3>
                                        <button onClick={addParameterGroup} className="w-full md:w-auto justify-center px-3 py-2 bg-blue-100 text-blue-700 font-bold rounded-lg flex items-center hover:bg-blue-200 transition text-xs"><PlusCircle className="w-4 h-4 mr-1"/> Kategori Ekle</button>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 pb-20">
                                        {(trialData.parameterGroups || []).map(group => (
                                            <div key={group.id} className="h-full">
                                                {editingParamGroup === group.id ? (
                                                    // DÜZENLEME MODU
                                                    <div className="bg-blue-50 dark:bg-blue-900/20 p-4 md:p-5 rounded-xl border border-blue-200 dark:border-blue-800 shadow-sm h-full flex flex-col">
                                                        <div className="flex items-center gap-2 mb-4 border-b border-blue-200 dark:border-blue-800 pb-3">
                                                            <input type="text" className="font-black text-base md:text-lg text-gray-800 dark:text-white bg-transparent outline-none w-full border-b border-dashed border-gray-400 focus:border-blue-500 px-1 uppercase" value={group.name} onChange={e => updateGroupName(group.id, e.target.value)} placeholder="Kategori Adı" />
                                                            <button onClick={() => setEditingParamGroup(null)} className="text-blue-600 font-bold text-[10px] md:text-xs bg-white dark:bg-gray-800 border border-blue-200 px-2 py-1 md:px-3 md:py-1.5 rounded-lg shadow-sm hover:bg-blue-100 transition shrink-0">KAYDET</button>
                                                        </div>
                                                        <div className="flex flex-col gap-2 mb-4 flex-1">
                                                            {(group.fields || []).map(field => (
                                                                <div key={field.id} className="flex items-center gap-2 bg-white dark:bg-gray-800 p-2 rounded-lg border border-gray-200">
                                                                    <input type="text" className="flex-1 text-xs md:text-sm font-bold text-gray-700 dark:text-gray-200 bg-transparent outline-none px-1 md:px-2" value={field.label} onChange={e => updateParameterField(group.id, field.id, 'label', e.target.value)} placeholder="Parametre Adı" />
                                                                    <button onClick={() => deleteParameterField(group.id, field.id)} className="text-gray-400 hover:text-red-500 p-1 rounded transition shrink-0"><Trash2 className="w-4 h-4"/></button>
                                                                </div>
                                                            ))}
                                                        </div>
                                                        <div className="flex justify-between items-center mt-auto pt-2 border-t border-blue-100">
                                                            <button onClick={() => addParameterField(group.id)} className="text-[10px] md:text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center bg-white dark:bg-gray-800 px-2 md:px-3 py-1.5 rounded-lg border border-blue-100"><Plus className="w-3 h-3 mr-1"/> Param Ekle</button>
                                                            <button onClick={() => { deleteParameterGroup(group.id); setEditingParamGroup(null); }} className="text-[10px] md:text-xs font-bold text-red-500 flex items-center p-1.5 hover:underline"><Trash2 className="w-3 h-3 mr-1"/> Kategoriyi Sil</button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    // GÖRÜNÜM & VERİ GİRİŞ MODU
                                                    <div className="bg-white dark:bg-gray-800 p-4 md:p-5 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 h-full">
                                                        <div className="flex justify-between items-center mb-4 border-b dark:border-gray-700 pb-2">
                                                            <h3 className="font-bold text-gray-800 dark:text-gray-200 uppercase text-xs md:text-sm tracking-wider">{group.name}</h3>
                                                            <button onClick={() => setEditingParamGroup(group.id)} className="text-gray-400 hover:text-blue-500 transition p-1.5 rounded-md hover:bg-gray-100"><Edit2 className="w-3.5 h-3.5 md:w-4 md:h-4"/></button>
                                                        </div>
                                                        <div className="flex flex-col gap-2 md:gap-3">
                                                            {(group.fields || []).map(field => (
                                                                <div key={field.id} className="flex flex-col md:flex-row items-start md:items-center justify-between gap-1 md:gap-4">
                                                                    <label className="text-[10px] md:text-[11px] font-black text-gray-400 dark:text-gray-500 uppercase flex-1 w-full truncate" title={field.label}>{field.label}</label>
                                                                    <input type="text" className="w-full md:w-2/3 font-bold text-xs md:text-sm text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-900 p-2 md:p-2.5 rounded-lg border border-gray-200 dark:border-gray-700 outline-none focus:ring-2 focus:ring-blue-500 transition" value={field.value} onChange={e => updateParameterField(group.id, field.id, 'value', e.target.value)} placeholder="..." />
                                                                </div>
                                                            ))}
                                                            {(group.fields || []).length === 0 && <div className="text-xs text-gray-400 italic">Parametre bulunmuyor. Düzenleme ikonuna tıklayın.</div>}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                            
                            {/* GALERİ SEKMESİ */}
                            {activeTab === 'GALLERY' && (
                                <div className="space-y-6">
                                    <input type="file" multiple accept="image/*,video/*" ref={fileInputRef} className="hidden" onChange={handleFileChange} />
                                    <div className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-800/50 p-6 md:p-10 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition">
                                        {isUploadingMedia ? (
                                            <div className="flex flex-col items-center justify-center py-4">
                                                <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
                                                <p className="text-sm md:text-base font-bold text-blue-600">Medya dosyaları yükleniyor, lütfen bekleyin...</p>
                                            </div>
                                        ) : (
                                            <>
                                                <ImageIcon className="w-12 h-12 md:w-16 md:h-16 mb-2 md:mb-4 opacity-50" />
                                                <p className="text-sm md:text-lg font-medium text-center">Fotoğraf / Video Yükle</p>
                                                <button onClick={handleTriggerFileUpload} className="px-4 py-2 md:px-6 md:py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-md font-bold flex items-center transition mt-3 text-xs md:text-sm"><Plus className="w-4 h-4 mr-2" /> Dosya Seç</button>
                                            </>
                                        )}
                                    </div>
                                    {(trialData.media || []).length > 0 && (
                                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3 md:gap-4 animate-in fade-in pb-20">
                                            {(trialData.media || []).map((media, index) => (
                                                <div key={media.id} onClick={() => setLightboxIndex(index)} className="relative group rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 shadow-sm bg-black aspect-square cursor-zoom-in hover:brightness-110 transition">
                                                    <button onClick={(e) => { e.stopPropagation(); handleRemoveMedia(media.id); }} className="absolute top-1 right-1 md:top-2 md:right-2 bg-red-600 hover:bg-red-700 text-white p-1.5 rounded-full shadow-md z-20 opacity-100 md:opacity-0 group-hover:opacity-100 transition"><Trash2 className="w-3 h-3 md:w-4 md:h-4" /></button>
                                                    {media.type === 'image' ? <img src={media.url} className="w-full h-full object-cover" alt="img" /> : <div className="w-full h-full flex items-center justify-center bg-gray-900"><PlayCircle className="w-8 h-8 md:w-10 md:h-10 text-white opacity-80" /></div>}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* DİNAMİK SONUÇ SEKMESİ */}
                            {activeTab === 'RESULT' && (
                                <div className="space-y-4 md:space-y-6 pb-20">
                                    <div className="bg-white dark:bg-gray-800 p-4 md:p-5 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 md:mb-5 border-b dark:border-gray-700 pb-3 gap-2">
                                            <h3 className="text-xs md:text-sm font-bold text-gray-800 dark:text-white uppercase tracking-wider">Hata Kriterleri ve Uygunluk</h3>
                                            <button onClick={() => setIsDefectEditorOpen(true)} className="w-full md:w-auto justify-center px-3 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-bold rounded-lg flex items-center hover:bg-gray-200 transition text-[10px] md:text-xs border border-gray-200 dark:border-gray-600"><Edit2 className="w-3.5 h-3.5 mr-1.5"/> Listeyi Düzenle</button>
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 md:gap-3">
                                            {(trialData.defectTypes || []).map(defect => (
                                                <div key={defect.id} onClick={() => toggleDefectSelection(defect.id)} className={`p-2.5 md:p-3 rounded-xl border text-xs md:text-sm transition flex items-center cursor-pointer ${defect.selected ? 'bg-red-50 border-red-500 text-red-700 font-bold shadow-sm' : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100 dark:bg-gray-900 dark:border-gray-700 dark:text-gray-400'}`}>
                                                    <div className="mr-3 shrink-0">
                                                        {defect.selected ? <CheckCircle className="w-4 h-4 md:w-5 md:h-5"/> : <div className="w-4 h-4 md:w-5 md:h-5 border-2 border-gray-300 dark:border-gray-600 rounded-full"></div>}
                                                    </div>
                                                    <span className="truncate">{defect.label}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="bg-white dark:bg-gray-800 p-4 md:p-5 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                                        <h3 className="text-xs md:text-sm font-bold text-gray-800 dark:text-white mb-3 md:mb-4 uppercase tracking-wider">Genel Deneme Özeti</h3>
                                        <textarea className="w-full p-3 md:p-4 text-xs md:text-sm border rounded-xl h-32 md:h-40 bg-gray-50 dark:bg-gray-900 dark:text-white dark:border-gray-600 outline-none focus:ring-2 focus:ring-blue-500 transition" placeholder="Deneme sonucuna dair genel özet notları buraya girebilirsiniz..." value={trialData.notes} onChange={(e) => setTrialData({...trialData, notes: e.target.value})}></textarea>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* ALT PANEL (KAYDET & İNDİR) */}
                        {activeTab !== 'QUICK_NOTES' && (
                            <div className="p-3 md:p-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex flex-col md:flex-row justify-between items-center gap-3 animate-in fade-in slide-in-from-bottom-2 shrink-0">
                                <button onClick={handleDownloadPresentation} className="w-full md:w-auto justify-center px-4 md:px-5 py-2.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 font-bold rounded-xl flex items-center transition text-xs md:text-sm shadow-sm border border-blue-200 dark:border-blue-800">
                                    <Download className="w-4 h-4 md:w-5 md:h-5 mr-2" /> PDF İNDİR
                                </button>
                                <button onClick={() => saveTrialDataToDB(trialData, false)} disabled={isSaving || isUploadingMedia || isUploadingNoteImage} className="w-full md:w-auto justify-center px-6 md:px-8 py-2.5 bg-green-600 hover:bg-green-700 text-white font-black rounded-xl shadow-lg flex items-center transition disabled:opacity-50 text-xs md:text-sm">
                                    <Save className="w-4 h-4 md:w-5 md:h-5 mr-2" /> {isSaving ? 'KAYDEDİLİYOR...' : (isUploadingMedia || isUploadingNoteImage) ? 'YÜKLENİYOR...' : 'TÜMÜNÜ KAYDET'}
                                </button>
                            </div>
                        )}
                    </>
                ) : (
                    // HİÇBİR KALIP SEÇİLİ DEĞİLKEN ÇIKACAK EKRAN (SADECE BİLGİSAYARDA GÖRÜNÜR)
                    <div className="flex-1 flex flex-col items-center justify-center text-gray-400 bg-gray-50/30 dark:bg-gray-900/30 p-4">
                        <div className="w-24 h-24 mb-6 bg-white dark:bg-gray-800 rounded-full flex items-center justify-center shadow-sm border border-gray-100 dark:border-gray-700">
                            <FileText className="w-12 h-12 opacity-40 text-blue-500" />
                        </div>
                        <h2 className="text-xl font-black text-gray-800 dark:text-white mb-2 text-center">Kalıp Seçilmedi</h2>
                        <p className="text-sm text-center max-w-sm">Raporlarını görüntülemek veya yeni rapor girmek için soldaki listeden bir kalıp seçin.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default MoldTrialReportsPage;