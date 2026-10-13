// src/components/ProjectManagement/MachiningQuoteTab.js

import React, { useState, useEffect, useMemo } from 'react';
import { 
    Plus, Search, Edit3, Trash2, X, Check, Clock, 
    Calculator, Layers, Box, Settings, Printer, 
    ArrowLeft, Image as ImageIcon, ZoomIn, Upload, 
    ChevronRight, Filter, RefreshCw, Clipboard
} from 'lucide-react';
import { 
    collection, onSnapshot, doc, updateDoc, setDoc, addDoc, deleteDoc, serverTimestamp 
} from 'firebase/firestore';
import { 
    MACHINING_QUOTES_COLLECTION, 
    MACHINING_MATERIALS_COLLECTION, 
    DEFAULT_MACHINING_MATERIALS, 
    DEFAULT_MACHINING_OPERATIONS 
} from '../../config/constants.js';
import ImagePreviewModal from '../Modals/ImagePreviewModal.js';

// Kütük Ağırlığı Hesaplama (Kg)
export const calculateStockWeightKg = (shape, dimensions = {}, density = 7.85) => {
    const dens = parseFloat(density) || 7.85; // g/cm³
    if (shape === 'CYLINDER') {
        const dia = parseFloat(dimensions.diameter) || 0; // mm
        const len = parseFloat(dimensions.length) || 0; // mm
        if (dia <= 0 || len <= 0) return 0;
        const radiusCm = (dia / 2) / 10;
        const lengthCm = len / 10;
        const volumeCm3 = Math.PI * Math.pow(radiusCm, 2) * lengthCm;
        return Number(((volumeCm3 * dens) / 1000).toFixed(2));
    } else {
        // Blok / Lama / Plaka
        const w = parseFloat(dimensions.width) || 0; // mm (En)
        const l = parseFloat(dimensions.length) || 0; // mm (Boy)
        const h = parseFloat(dimensions.height) || 0; // mm (Yükseklik/Kalınlık)
        if (w <= 0 || l <= 0 || h <= 0) return 0;
        const volumeCm3 = (w * l * h) / 1000;
        return Number(((volumeCm3 * dens) / 1000).toFixed(2));
    }
};

// Resim Sıkıştırma (Base64 WebP/JPEG)
const compressImageFile = (file, maxWidth = 1200, quality = 0.75) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                if (width > maxWidth) {
                    height = Math.round((height * maxWidth) / width);
                    width = maxWidth;
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
                resolve(compressedDataUrl);
            };
            img.onerror = (err) => reject(err);
        };
        reader.onerror = (err) => reject(err);
    });
};

// Göreceli Tarih Formatlayıcı (Örn: "2 hafta önce", "3 gün önce", "Bugün")
const formatRelativeTime = (timestamp) => {
    if (!timestamp) return 'Sabit Fiyat';
    let date;
    if (timestamp?.toDate) {
        date = timestamp.toDate();
    } else if (typeof timestamp === 'number') {
        date = new Date(timestamp);
    } else if (timestamp instanceof Date) {
        date = timestamp;
    } else {
        return 'Sabit Fiyat';
    }

    const diffMs = Date.now() - date.getTime();
    if (diffMs < 0 || isNaN(diffMs)) return 'Az önce';

    const diffMin = Math.floor(diffMs / (1000 * 60));
    const diffHour = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDay = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffWeek = Math.floor(diffDay / 7);
    const diffMonth = Math.floor(diffDay / 30);
    const diffYear = Math.floor(diffDay / 365);

    if (diffMin < 1) return 'Az önce';
    if (diffMin < 60) return `${diffMin} dk önce`;
    if (diffHour < 24) return `${diffHour} saat önce`;
    if (diffDay === 1) return 'Dün';
    if (diffDay < 7) return `${diffDay} gün önce`;
    if (diffWeek < 5) return `${diffWeek} hafta önce`;
    if (diffMonth < 12) return `${diffMonth} ay önce`;
    return `${diffYear} yıl önce`;
};

const MachiningQuoteTab = ({ db, loggedInUser }) => {
    // 1. Ana State'ler
    const [quotes, setQuotes] = useState([]);
    const [materials, setMaterials] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedQuoteId, setSelectedQuoteId] = useState(null);
    const [activeTab, setActiveTab] = useState('LIST'); // 'LIST' | 'EDITOR' | 'PRESENTATION'

    // Filtre & Arama
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('ALL');

    // Modallar
    const [isNewQuoteModalOpen, setIsNewQuoteModalOpen] = useState(false);
    const [isMaterialModalOpen, setIsMaterialModalOpen] = useState(false);
    const [previewImage, setPreviewImage] = useState({ isOpen: false, url: '', title: '' });

    // Yeni Teklif Form State'i (Varsayılan Para Birimi EUR)
    const [newQuoteData, setNewQuoteData] = useState({
        companyName: '',
        projectName: '',
        contactPerson: '',
        currency: 'EUR', // 'EUR' | 'USD' | 'TRY'
        validityDays: 30,
        notes: ''
    });

    // Malzeme Yönetim Form State'i (Euro bazlı)
    const [editingMaterial, setEditingMaterial] = useState(null);
    const [matFormData, setMatFormData] = useState({
        name: '',
        code: '',
        density: 7.85,
        pricePerKg: 2.80,
        category: 'Çelik'
    });

    // ============================================================
    // 2. FİREBASE CANLI VERİ DİNLEME (SUBSCRIPTION)
    // ============================================================

    // Teklifleri Dinle
    useEffect(() => {
        if (!db) return;
        const qRef = collection(db, MACHINING_QUOTES_COLLECTION);
        const unsubscribe = onSnapshot(qRef, (snapshot) => {
            const list = [];
            snapshot.forEach((docSnap) => {
                list.push({ id: docSnap.id, ...docSnap.data() });
            });
            list.sort((a, b) => (b.createdAt?.toMillis?.() || b.createdTimestamp || 0) - (a.createdAt?.toMillis?.() || a.createdTimestamp || 0));
            setQuotes(list);
            setLoading(false);
        }, (err) => {
            console.error("Teklifler dinlenirken hata:", err);
            setLoading(false);
        });
        return () => unsubscribe();
    }, [db]);

    // Malzeme Kütüphanesini Dinle (İlk açılışta boşsa varsayılanları kaydet)
    useEffect(() => {
        if (!db) return;
        const matRef = collection(db, MACHINING_MATERIALS_COLLECTION);
        const unsubscribe = onSnapshot(matRef, (snapshot) => {
            const list = [];
            snapshot.forEach((docSnap) => {
                list.push({ id: docSnap.id, ...docSnap.data() });
            });
            if (list.length === 0) {
                // Varsayılan malzemeleri yükle
                DEFAULT_MACHINING_MATERIALS.forEach(async (m) => {
                    await setDoc(doc(db, MACHINING_MATERIALS_COLLECTION, m.id), m);
                });
                setMaterials(DEFAULT_MACHINING_MATERIALS);
            } else {
                list.sort((a, b) => a.name.localeCompare(b.name, 'tr'));
                setMaterials(list);
            }
        }, (err) => {
            console.error("Malzemeler dinlenirken hata:", err);
        });
        return () => unsubscribe();
    }, [db]);

    // Seçili Teklif Nesnesi
    const currentQuote = useMemo(() => {
        return quotes.find(q => q.id === selectedQuoteId) || null;
    }, [quotes, selectedQuoteId]);

    // ============================================================
    // 3. YENİ TEKLİF OLUŞTURMA
    // ============================================================
    const handleCreateQuote = async (e) => {
        e.preventDefault();
        if (!newQuoteData.companyName.trim() || !newQuoteData.projectName.trim()) {
            alert("Lütfen Firma Adı ve Proje Adını doldurunuz.");
            return;
        }

        const dateStr = new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: '2-digit' }).replace(/\./g, '');
        const randomSuffix = Math.floor(100 + Math.random() * 900);
        const quoteNo = `TKL-${dateStr}-${randomSuffix}`;

        // Varsayılan Saatlik Ücretler (Euro cinsinden)
        const hourlyRates = {
            cnc3Axis: 35,
            cnc5Axis: 65,
            cncLathe: 35,
            wireEdm: 30,
            sinkerEdm: 28,
            grinding: 25,
            welding: 30,
            manual: 22
        };

        const newDoc = {
            quoteNo,
            companyName: newQuoteData.companyName.trim(),
            projectName: newQuoteData.projectName.trim(),
            contactPerson: newQuoteData.contactPerson.trim(),
            currency: newQuoteData.currency || 'EUR',
            validityDays: parseInt(newQuoteData.validityDays) || 30,
            status: 'DRAFT', // 'DRAFT' | 'OFFERED' | 'APPROVED' | 'REVISED' | 'CANCELLED'
            notes: newQuoteData.notes.trim(),
            hourlyRates,
            setupHourlyRate: 30, // Varsayılan Tezgah Hazırlık/Ayar Saat Ücreti (€/s)
            riskMarginPercent: 10, // % Güvenlik Payı
            profitMarginPercent: 25, // % Kar Marjı
            discountPercent: 0,
            parts: [],
            createdBy: loggedInUser?.name || 'Kullanıcı',
            createdAt: serverTimestamp(),
            createdTimestamp: Date.now()
        };

        try {
            const docRef = await addDoc(collection(db, MACHINING_QUOTES_COLLECTION), newDoc);
            setIsNewQuoteModalOpen(false);
            setNewQuoteData({ companyName: '', projectName: '', contactPerson: '', currency: 'EUR', validityDays: 30, notes: '' });
            setSelectedQuoteId(docRef.id);
            setActiveTab('EDITOR');
        } catch (err) {
            console.error("Teklif oluşturulurken hata:", err);
            alert("Teklif oluşturulamadı: " + err.message);
        }
    };

    // Teklifi Sil
    const handleDeleteQuote = async (quoteId, e) => {
        if (e) e.stopPropagation();
        if (!window.confirm("Bu değerlendirme teklifini silmek istediğinize emin misiniz?")) return;
        try {
            await deleteDoc(doc(db, MACHINING_QUOTES_COLLECTION, quoteId));
            if (selectedQuoteId === quoteId) {
                setSelectedQuoteId(null);
                setActiveTab('LIST');
            }
        } catch (err) {
            console.error("Teklif silinirken hata:", err);
            alert("Silinemedi: " + err.message);
        }
    };

    // Teklif Durumunu Güncelle
    const handleUpdateQuoteStatus = async (quoteId, newStatus) => {
        try {
            await updateDoc(doc(db, MACHINING_QUOTES_COLLECTION, quoteId), {
                status: newStatus,
                updatedAt: serverTimestamp()
            });
        } catch (err) {
            console.error("Durum güncellenirken hata:", err);
        }
    };

    // ============================================================
    // 4. MALZEME KÜTÜPHANESİ YÖNETİMİ (EKLE / DÜZENLE / SİL)
    // ============================================================
    const handleSaveMaterial = async (e) => {
        e.preventDefault();
        if (!matFormData.name.trim()) {
            alert("Lütfen malzeme adını giriniz.");
            return;
        }

        const dataToSave = {
            name: matFormData.name.trim(),
            code: matFormData.code.trim(),
            density: parseFloat(matFormData.density) || 7.85,
            pricePerKg: parseFloat(matFormData.pricePerKg) || 0,
            category: matFormData.category || 'Çelik',
            updatedAt: serverTimestamp(),
            updatedAtMs: Date.now()
        };

        try {
            if (editingMaterial) {
                await updateDoc(doc(db, MACHINING_MATERIALS_COLLECTION, editingMaterial.id), dataToSave);
            } else {
                const newId = `mat-${Date.now()}`;
                await setDoc(doc(db, MACHINING_MATERIALS_COLLECTION, newId), {
                    ...dataToSave,
                    id: newId
                });
            }
            setEditingMaterial(null);
            setMatFormData({ name: '', code: '', density: 7.85, pricePerKg: 2.80, category: 'Çelik' });
        } catch (err) {
            console.error("Malzeme kaydedilirken hata:", err);
            alert("Malzeme kaydedilemedi: " + err.message);
        }
    };

    // Varsayılan Piyasa Fiyatlarına Eşitleme
    const handleResetDefaultMaterials = async () => {
        if (!window.confirm("Kütüphanedeki varsayılan malzemelerin fiyatlarını güncel piyasa Euro fiyatlarına eşitlemek istiyor musunuz? Özel eklediğiniz malzemeler korunacaktır.")) return;
        try {
            for (const defMat of DEFAULT_MACHINING_MATERIALS) {
                await setDoc(doc(db, MACHINING_MATERIALS_COLLECTION, defMat.id), {
                    ...defMat,
                    updatedAt: serverTimestamp(),
                    updatedAtMs: Date.now()
                }, { merge: true });
            }
            alert("Tüm varsayılan malzemeler güncel Euro piyasa fiyatlarıyla yenilendi.");
        } catch (err) {
            console.error("Malzeme sıfırlama hatası:", err);
            alert("Hata oluştu: " + err.message);
        }
    };

    const handleDeleteMaterial = async (matId) => {
        if (!window.confirm("Bu malzemeyi kütüphaneden silmek istediğinize emin misiniz?")) return;
        try {
            await deleteDoc(doc(db, MACHINING_MATERIALS_COLLECTION, matId));
        } catch (err) {
            console.error("Malzeme silinirken hata:", err);
        }
    };

    // ============================================================
    // 5. PARÇA YÖNETİMİ & OTOMATİK HESAPLAMALAR
    // ============================================================

    // Teklife Yeni Parça Ekle
    const handleAddPartToQuote = async () => {
        if (!currentQuote) return;
        const defaultMat = materials[0] || { id: 'mat-1', name: '4140 Islah Çeliği', density: 7.85, pricePerKg: 2.80 };
        const partNumber = (currentQuote.parts?.length || 0) + 1;
        const initialHourlyRate = currentQuote.hourlyRates?.cnc3Axis || 35;

        const newPart = {
            id: `part-${Date.now()}`,
            partName: `İş Parçası #${partNumber}`,
            partCode: `P-${String(partNumber).padStart(2, '0')}`,
            quantity: 1,
            images: [],
            // Malzeme & Kütük
            materialId: defaultMat.id,
            materialName: defaultMat.name,
            materialDensity: defaultMat.density || 7.85,
            materialPricePerKg: defaultMat.pricePerKg || 2.80,
            stockShape: 'BLOCK', // 'BLOCK' | 'CYLINDER'
            dimensions: {
                length: 150,
                width: 100,
                height: 30,
                diameter: 0
            },
            stockWeightKg: 3.53,
            materialCostTotal: Number((3.53 * (defaultMat.pricePerKg || 2.80)).toFixed(2)),
            // Operasyonlar
            operations: [
                {
                    id: `op-${Date.now()}-1`,
                    type: 'cnc_3_axis',
                    name: '3 Eksen CNC Freze',
                    isOutsourced: false,
                    durationHours: 1.5,
                    hourlyRate: initialHourlyRate,
                    cost: Number((1.5 * initialHourlyRate).toFixed(2)),
                    notes: ''
                }
            ],
            setupTimeHours: 0,
            notes: ''
        };

        const updatedParts = [...(currentQuote.parts || []), newPart];
        try {
            await updateDoc(doc(db, MACHINING_QUOTES_COLLECTION, currentQuote.id), {
                parts: updatedParts,
                updatedAt: serverTimestamp()
            });
        } catch (err) {
            console.error("Parça eklenirken hata:", err);
            alert("Parça eklenemedi: " + err.message);
        }
    };

    // Parça Güncelleme Fonksiyonu
    const handleUpdatePart = async (partId, updatedFields) => {
        if (!currentQuote) return;

        const updatedParts = (currentQuote.parts || []).map(p => {
            if (p.id === partId) {
                const merged = { ...p, ...updatedFields };

                // Kütük Ağırlığı ve Malzeme Maliyetini Yeniden Hesapla
                const weight = calculateStockWeightKg(
                    merged.stockShape, 
                    merged.dimensions, 
                    merged.materialDensity
                );
                merged.stockWeightKg = weight;
                merged.materialCostTotal = Number((weight * (parseFloat(merged.materialPricePerKg) || 0)).toFixed(2));

                return merged;
            }
            return p;
        });

        try {
            await updateDoc(doc(db, MACHINING_QUOTES_COLLECTION, currentQuote.id), {
                parts: updatedParts,
                updatedAt: serverTimestamp()
            });
        } catch (err) {
            console.error("Parça güncellenirken hata:", err);
        }
    };

    // Parça Sil
    const handleDeletePart = async (partId) => {
        if (!currentQuote) return;
        if (!window.confirm("Bu parçayı tekliften silmek istediğinize emin misiniz?")) return;

        const updatedParts = (currentQuote.parts || []).filter(p => p.id !== partId);
        try {
            await updateDoc(doc(db, MACHINING_QUOTES_COLLECTION, currentQuote.id), {
                parts: updatedParts,
                updatedAt: serverTimestamp()
            });
        } catch (err) {
            console.error("Parça silinirken hata:", err);
        }
    };

    // Parçaya Resim Yükleme (Dosyadan)
    const handleUploadPartImage = async (partId, e) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;

        try {
            const compressedUrls = [];
            for (const file of files) {
                if (file.type.startsWith('image/')) {
                    const compressed = await compressImageFile(file, 1400, 0.8);
                    compressedUrls.push(compressed);
                }
            }

            const currentPart = currentQuote.parts?.find(p => p.id === partId);
            const existingImages = currentPart?.images || [];
            await handleUpdatePart(partId, { images: [...existingImages, ...compressedUrls] });
        } catch (err) {
            console.error("Resim sıkıştırma hatası:", err);
            alert("Resim yüklenirken bir sorun oluştu.");
        }
    };

    // Ekran Görüntüsü / Panodan Resim Yapıştırma (Clipboard Paste)
    const handlePasteFromClipboard = async (partId) => {
        try {
            if (navigator.clipboard && navigator.clipboard.read) {
                const clipboardItems = await navigator.clipboard.read();
                let foundImage = false;
                for (const item of clipboardItems) {
                    const imageType = item.types.find(type => type.startsWith('image/'));
                    if (imageType) {
                        const blob = await item.getType(imageType);
                        const file = new File([blob], `screenshot-${Date.now()}.png`, { type: imageType });
                        const compressed = await compressImageFile(file, 1400, 0.8);
                        const currentPart = currentQuote.parts?.find(p => p.id === partId);
                        const existingImages = currentPart?.images || [];
                        await handleUpdatePart(partId, { images: [...existingImages, compressed] });
                        foundImage = true;
                        break;
                    }
                }
                if (!foundImage) {
                    alert("Panoda kopyalanmış bir ekran görüntüsü/resim bulunamadı. Lütfen klavyenizden (Win+Shift+S veya PrintScreen) ile ekran görüntüsü aldıktan sonra butona tıklayın.");
                }
            } else {
                alert("Doğrudan pano erişimi tarayıcınızda desteklenmiyor. Lütfen bu parça üzerine tıklayıp klavyenizden Ctrl+V tuşlarına basarak yapıştırın.");
            }
        } catch (err) {
            console.warn("Clipboard read hatası:", err);
            alert("Panodan okuma izni alınamadı. Ekran görüntüsünü yapıştırmak için lütfen bu kartın üzerine tıklayıp klavyenizden Ctrl + V yapınız.");
        }
    };

    // Karta Tıklanıp Ctrl+V Yapıldığında Otomatik Algılama
    const handleContainerPaste = async (partId, e) => {
        const items = e.clipboardData?.items;
        if (!items) return;
        for (let i = 0; i < items.length; i++) {
            if (items[i].type && items[i].type.startsWith('image/')) {
                e.preventDefault();
                const file = items[i].getAsFile();
                if (file) {
                    try {
                        const compressed = await compressImageFile(file, 1400, 0.8);
                        const currentPart = currentQuote.parts?.find(p => p.id === partId);
                        const existingImages = currentPart?.images || [];
                        await handleUpdatePart(partId, { images: [...existingImages, compressed] });
                    } catch (err) {
                        console.error("Paste resim sıkıştırma hatası:", err);
                    }
                    break;
                }
            }
        }
    };

    // Parçadan Resim Sil
    const handleDeletePartImage = async (partId, imgIdx, e) => {
        if (e) e.stopPropagation();
        const currentPart = currentQuote.parts?.find(p => p.id === partId);
        if (!currentPart) return;
        const updatedImages = (currentPart.images || []).filter((_, i) => i !== imgIdx);
        await handleUpdatePart(partId, { images: updatedImages });
    };

    // Parçaya Operasyon Ekle
    const handleAddOperationToPart = (partId, opType) => {
        const currentPart = currentQuote.parts?.find(p => p.id === partId);
        if (!currentPart) return;

        const defaultOp = DEFAULT_MACHINING_OPERATIONS.find(o => o.id === opType) || DEFAULT_MACHINING_OPERATIONS[0];
        const isOutsourced = !!defaultOp.isOutsourced;
        const hourlyRate = currentQuote.hourlyRates?.[opType] || defaultOp.defaultHourlyRate || 35;
        const defaultCost = defaultOp.defaultCost || 50;

        const newOp = {
            id: `op-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            type: defaultOp.id,
            name: defaultOp.name,
            isOutsourced,
            durationHours: isOutsourced ? 0 : 1.0,
            hourlyRate: isOutsourced ? 0 : hourlyRate,
            cost: isOutsourced ? defaultCost : Number((1.0 * hourlyRate).toFixed(2)),
            notes: ''
        };

        const updatedOps = [...(currentPart.operations || []), newOp];
        handleUpdatePart(partId, { operations: updatedOps });
    };

    // Operasyon Güncelle (Süre, Saatlik Ücret ve Fason Bedeli)
    const handleUpdateOperation = (partId, opId, updatedFields) => {
        const currentPart = currentQuote.parts?.find(p => p.id === partId);
        if (!currentPart) return;

        const updatedOps = (currentPart.operations || []).map(op => {
            if (op.id === opId) {
                const merged = { ...op, ...updatedFields };
                if (!merged.isOutsourced) {
                    if ('durationHours' in updatedFields || 'hourlyRate' in updatedFields) {
                        const dur = parseFloat(merged.durationHours) || 0;
                        const rate = parseFloat(merged.hourlyRate) || 0;
                        merged.cost = Number((dur * rate).toFixed(2));
                    } else if ('cost' in updatedFields) {
                        merged.cost = parseFloat(updatedFields.cost) || 0;
                    }
                } else {
                    merged.cost = parseFloat(merged.cost) || 0;
                }
                return merged;
            }
            return op;
        });

        handleUpdatePart(partId, { operations: updatedOps });
    };

    // Operasyon Sil
    const handleDeleteOperation = (partId, opId) => {
        const currentPart = currentQuote.parts?.find(p => p.id === partId);
        if (!currentPart) return;

        const updatedOps = (currentPart.operations || []).filter(op => op.id !== opId);
        handleUpdatePart(partId, { operations: updatedOps });
    };

    // ============================================================
    // 6. TOPLAM MALİYET & FİYAT ANALİZİ MOTORU (CAM HESAPLAMA ÇIKARILDI)
    // ============================================================
    const quoteFinancials = useMemo(() => {
        if (!currentQuote) return null;

        const parts = currentQuote.parts || [];
        const riskPct = parseFloat(currentQuote.riskMarginPercent) || 0;
        const profitPct = parseFloat(currentQuote.profitMarginPercent) || 0;
        const discountPct = parseFloat(currentQuote.discountPercent) || 0;

        let totalMaterialCost = 0;
        let totalInternalMachiningCost = 0;
        let totalInternalHours = 0;
        let totalOutsourcedCost = 0;
        let totalSetupCost = 0;
        let totalPartsCount = 0;

        const partsAnalysis = parts.map(part => {
            const qty = Math.max(1, parseInt(part.quantity) || 1);
            totalPartsCount += qty;

            // 1. Malzeme Maliyeti (Adet ile çarpılır)
            const singlePartMatCost = parseFloat(part.materialCostTotal) || 0;
            const partTotalMatCost = singlePartMatCost * qty;
            totalMaterialCost += partTotalMatCost;

            // 2. Operasyonlar Maliyeti
            let partOpsInternalCost = 0;
            let partOpsInternalHours = 0;
            let partOpsOutsourcedCost = 0;

            (part.operations || []).forEach(op => {
                if (op.isOutsourced) {
                    partOpsOutsourcedCost += (parseFloat(op.cost) || 0);
                } else {
                    const h = parseFloat(op.durationHours) || 0;
                    const c = parseFloat(op.cost) || 0;
                    partOpsInternalHours += h;
                    partOpsInternalCost += c;
                }
            });

            // Parça başına operasyon maliyetleri x Adet
            const totalOpsInternalCostForPart = partOpsInternalCost * qty;
            const totalOpsOutsourcedCostForPart = partOpsOutsourcedCost * qty;
            const totalOpsHoursForPart = partOpsInternalHours * qty;

            totalInternalMachiningCost += totalOpsInternalCostForPart;
            totalInternalHours += totalOpsHoursForPart;
            totalOutsourcedCost += totalOpsOutsourcedCostForPart;

            // 3. Setup (Ayar) - CAM tamamen dikkate alınmaz
            const setupHours = parseFloat(part.setupTimeHours) || 0;
            const setupRate = parseFloat(currentQuote.setupHourlyRate ?? currentQuote.hourlyRates?.setup ?? 30);
            const setupCost = setupHours * setupRate;
            totalSetupCost += setupCost;

            // Parçanın Toplam Taban Maliyeti
            const partBaseCost = partTotalMatCost + totalOpsInternalCostForPart + totalOpsOutsourcedCostForPart + setupCost;
            const partUnitPriceBase = partBaseCost / qty;

            // Risk ve Kar Eklemesi (Birim Fiyat)
            const unitRisk = partUnitPriceBase * (riskPct / 100);
            const unitProfit = (partUnitPriceBase + unitRisk) * (profitPct / 100);
            const unitFinalPrice = Number((partUnitPriceBase + unitRisk + unitProfit).toFixed(2));
            const totalFinalPrice = Number((unitFinalPrice * qty).toFixed(2));

            return {
                ...part,
                qty,
                singlePartMatCost,
                partTotalMatCost,
                partOpsInternalHours,
                totalOpsHoursForPart,
                partOpsInternalCost,
                partOpsOutsourcedCost,
                setupCost,
                partBaseCost,
                unitFinalPrice,
                totalFinalPrice
            };
        });

        // Proje Toplam Taban Maliyeti
        const projectBaseCost = totalMaterialCost + totalInternalMachiningCost + totalOutsourcedCost + totalSetupCost;
        const totalRiskAmount = projectBaseCost * (riskPct / 100);
        const subtotalWithRisk = projectBaseCost + totalRiskAmount;
        const totalProfitAmount = subtotalWithRisk * (profitPct / 100);
        const rawGrandTotal = subtotalWithRisk + totalProfitAmount;
        const discountAmount = rawGrandTotal * (discountPct / 100);
        const grandTotal = Number((rawGrandTotal - discountAmount).toFixed(2));

        return {
            partsAnalysis,
            totalPartsCount,
            totalMaterialCost: Number(totalMaterialCost.toFixed(2)),
            totalInternalHours: Number(totalInternalHours.toFixed(1)),
            totalInternalMachiningCost: Number(totalInternalMachiningCost.toFixed(2)),
            totalOutsourcedCost: Number(totalOutsourcedCost.toFixed(2)),
            totalSetupCost: Number(totalSetupCost.toFixed(2)),
            projectBaseCost: Number(projectBaseCost.toFixed(2)),
            totalRiskAmount: Number(totalRiskAmount.toFixed(2)),
            totalProfitAmount: Number(totalProfitAmount.toFixed(2)),
            discountAmount: Number(discountAmount.toFixed(2)),
            grandTotal
        };
    }, [currentQuote]);

    // Para Birimi Simgesi (Varsayılan EUR: €)
    const getCurrencySymbol = (cur = 'EUR') => {
        switch (cur) {
            case 'USD': return '$';
            case 'TRY': return '₺';
            case 'EUR':
            default: return '€';
        }
    };

    // Filtrelenmiş Teklifler Listesi
    const filteredQuotes = useMemo(() => {
        return quotes.filter(q => {
            const matchesSearch = !searchTerm || 
                q.companyName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                q.projectName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                q.quoteNo?.toLowerCase().includes(searchTerm.toLowerCase());
            const matchesStatus = statusFilter === 'ALL' || q.status === statusFilter;
            return matchesSearch && matchesStatus;
        });
    }, [quotes, searchTerm, statusFilter]);

    // ============================================================
    // 7. RENDER: GÖRÜNÜMLER
    // ============================================================

    return (
        <div className="space-y-6">
            {/* ÜST BAŞLIK VE HIZLI EYLEMLER */}
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xs">
                <div>
                    <div className="flex items-center gap-2.5">
                        <span className="p-2.5 rounded-xl bg-indigo-600 text-white shadow-xs">
                            <Calculator className="w-6 h-6" />
                        </span>
                        <div>
                            <h2 className="text-xl font-black text-gray-900 dark:text-white flex items-center gap-2">
                                <span>Talaşlı İmalat Teklif & Değerlendirme</span>
                                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 uppercase tracking-wider">
                                    İzole Modül
                                </span>
                            </h2>
                            <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mt-0.5">
                                Parça bazlı resimler, kütük ölçüleri, tezgah operasyon süreleri ve canlı maliyet/kar analizi
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2.5 flex-wrap">
                    {activeTab !== 'LIST' && (
                        <button
                            type="button"
                            onClick={() => {
                                setSelectedQuoteId(null);
                                setActiveTab('LIST');
                            }}
                            className="px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 font-bold text-xs transition flex items-center gap-1.5 shadow-2xs"
                        >
                            <ArrowLeft className="w-4 h-4" />
                            <span>Teklif Listesine Dön</span>
                        </button>
                    )}

                    <button
                        type="button"
                        onClick={() => setIsMaterialModalOpen(true)}
                        className="px-3.5 py-2 rounded-xl border border-amber-300 dark:border-amber-700/80 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 text-amber-900 dark:text-amber-200 font-bold text-xs transition flex items-center gap-1.5 shadow-2xs"
                    >
                        <Settings className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                        <span>Malzeme Kütüphanesi ({materials.length})</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => setIsNewQuoteModalOpen(true)}
                        className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs transition flex items-center gap-1.5 shadow-sm active:scale-95"
                    >
                        <Plus className="w-4 h-4" />
                        <span>Yeni Proje Teklifi Aç</span>
                    </button>
                </div>
            </div>

            {/* ============================================================ */}
            {/* GÖRÜNÜM 1: TEKLİFLER LİSTESİ */}
            {/* ============================================================ */}
            {activeTab === 'LIST' && (
                <div className="space-y-4">
                    {/* Arama & Durum Filtreleri */}
                    <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 bg-white dark:bg-gray-800 p-3.5 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-2xs">
                        <div className="relative flex-1 max-w-md">
                            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                            <input
                                type="text"
                                placeholder="Firma adı, proje adı veya teklif no ara..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-9 pr-3 py-2 text-xs font-bold bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>

                        <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar text-xs">
                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider mr-1 shrink-0">
                                <Filter className="w-3 h-3 inline mr-1" /> Durum:
                            </span>
                            {[
                                { key: 'ALL', label: 'Tümü' },
                                { key: 'DRAFT', label: 'Taslak' },
                                { key: 'OFFERED', label: 'Teklif Verildi' },
                                { key: 'APPROVED', label: 'Onaylandı' },
                                { key: 'REVISED', label: 'Revizyon' }
                            ].map(st => (
                                <button
                                    key={st.key}
                                    type="button"
                                    onClick={() => setStatusFilter(st.key)}
                                    className={`px-2.5 py-1 rounded-lg font-bold text-xs transition shrink-0 ${
                                        statusFilter === st.key
                                            ? 'bg-indigo-600 text-white shadow-xs'
                                            : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200'
                                    }`}
                                >
                                    {st.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Teklif Kartları Listesi */}
                    {loading ? (
                        <div className="p-16 text-center text-gray-400 font-bold text-sm flex items-center justify-center gap-2">
                            <RefreshCw className="w-5 h-5 animate-spin text-indigo-500" />
                            <span>Teklif verileri yükleniyor...</span>
                        </div>
                    ) : filteredQuotes.length === 0 ? (
                        <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700 p-16 text-center">
                            <Calculator className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                            <h3 className="text-base font-bold text-gray-800 dark:text-gray-200">Kayıtlı Teklif Bulunamadı</h3>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-sm mx-auto">
                                Henüz bir talaşlı imalat teklifi açmadınız veya arama kriterine uygun teklif yok.
                            </p>
                            <button
                                type="button"
                                onClick={() => setIsNewQuoteModalOpen(true)}
                                className="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs rounded-xl shadow-xs inline-flex items-center gap-1.5 transition"
                            >
                                <Plus className="w-4 h-4" /> İlk Teklifi Başlat
                            </button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                            {filteredQuotes.map(quote => {
                                const partsCount = quote.parts?.length || 0;
                                const currencySym = getCurrencySymbol(quote.currency);

                                // Hızlı tahmini toplam hesabı
                                const totalCost = (quote.parts || []).reduce((acc, p) => {
                                    const qty = p.quantity || 1;
                                    const mat = (parseFloat(p.materialCostTotal) || 0) * qty;
                                    const ops = (p.operations || []).reduce((sum, o) => sum + (parseFloat(o.cost) || 0), 0) * qty;
                                    return acc + mat + ops;
                                }, 0);
                                const estGrandTotal = totalCost * (1 + (parseFloat(quote.riskMarginPercent) || 0) / 100) * (1 + (parseFloat(quote.profitMarginPercent) || 0) / 100);

                                return (
                                    <div
                                        key={quote.id}
                                        onClick={() => {
                                            setSelectedQuoteId(quote.id);
                                            setActiveTab('EDITOR');
                                        }}
                                        className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 hover:border-indigo-500 dark:hover:border-indigo-500 transition-all p-5 shadow-xs hover:shadow-md cursor-pointer flex flex-col justify-between group"
                                    >
                                        <div className="space-y-3">
                                            {/* Üst Başlık & Durum */}
                                            <div className="flex justify-between items-start gap-2">
                                                <div>
                                                    <span className="font-mono text-[10px] font-black px-2 py-0.5 rounded bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                                                        {quote.quoteNo}
                                                    </span>
                                                    <h3 className="font-black text-base text-gray-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition mt-1.5 truncate max-w-[240px]" title={quote.projectName}>
                                                        {quote.projectName}
                                                    </h3>
                                                    <p className="text-xs font-bold text-gray-600 dark:text-gray-300 truncate" title={quote.companyName}>
                                                        {quote.companyName}
                                                    </p>
                                                </div>

                                                <span className={`text-[10px] font-black px-2.5 py-1 rounded-full shrink-0 uppercase tracking-wider ${
                                                    quote.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' :
                                                    quote.status === 'OFFERED' ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300' :
                                                    quote.status === 'REVISED' ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' :
                                                    'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                                                }`}>
                                                    {quote.status === 'APPROVED' ? 'Onaylandı' :
                                                     quote.status === 'OFFERED' ? 'Teklif Verildi' :
                                                     quote.status === 'REVISED' ? 'Revizyon' : 'Taslak'}
                                                </span>
                                            </div>

                                            {/* Parça Önizleme Küçük Resimleri */}
                                            <div className="flex items-center gap-1.5 overflow-x-auto py-1">
                                                {partsCount === 0 ? (
                                                    <span className="text-[11px] text-gray-400 font-semibold italic">Henüz parça eklenmedi</span>
                                                ) : (
                                                    quote.parts.slice(0, 5).map((part, pIdx) => {
                                                        const firstImg = part.images?.[0];
                                                        return (
                                                            <div 
                                                                key={part.id || pIdx} 
                                                                className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 overflow-hidden shrink-0 flex items-center justify-center relative"
                                                                title={part.partName}
                                                            >
                                                                {firstImg ? (
                                                                    <img src={firstImg} alt={part.partName} className="w-full h-full object-cover" />
                                                                ) : (
                                                                    <Box className="w-4 h-4 text-gray-400" />
                                                                )}
                                                            </div>
                                                        );
                                                    })
                                                )}
                                                {partsCount > 5 && (
                                                    <span className="text-[10px] font-bold text-gray-400">+{partsCount - 5}</span>
                                                )}
                                            </div>

                                            {/* Özet Metrikler */}
                                            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-100 dark:border-gray-700 text-xs">
                                                <div className="bg-gray-50 dark:bg-slate-800 p-2 rounded-xl border border-gray-200/60 dark:border-slate-700">
                                                    <span className="text-[10px] text-gray-400 font-semibold block">Parça Çeşidi</span>
                                                    <strong className="text-gray-900 dark:text-white font-black text-sm">{partsCount} Parça</strong>
                                                </div>
                                                <div className="bg-indigo-50/60 dark:bg-indigo-950/40 p-2 rounded-xl">
                                                    <span className="text-[10px] text-indigo-500 dark:text-indigo-400 font-semibold block">Tahmini Teklif</span>
                                                    <strong className="text-indigo-700 dark:text-indigo-300 font-black text-sm">
                                                        {estGrandTotal.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} {currencySym}
                                                    </strong>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Alt Butonlar */}
                                        <div className="flex justify-between items-center pt-3 mt-3 border-t border-gray-100 dark:border-gray-700 text-[11px]">
                                            <span className="text-gray-400 font-medium">
                                                {quote.createdBy} • {quote.createdAt?.toDate ? quote.createdAt.toDate().toLocaleDateString('tr-TR') : 'Bugün'}
                                            </span>

                                            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                                <button
                                                    type="button"
                                                    onClick={(e) => handleDeleteQuote(quote.id, e)}
                                                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50 transition"
                                                    title="Teklifi Sil"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                                <span className="text-indigo-600 dark:text-indigo-400 font-bold flex items-center gap-0.5 group-hover:translate-x-0.5 transition-transform">
                                                    İncele <ChevronRight className="w-4 h-4" />
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* ============================================================ */}
            {/* GÖRÜNÜM 2 & 3: TEKLİF DÜZENLEYİCİ VE MÜŞTERİ SUNUMU */}
            {/* ============================================================ */}
            {currentQuote && activeTab !== 'LIST' && (
                <div className="space-y-6">
                    {/* Teklif Başlığı & Üst Kontrol Paneli */}
                    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 shadow-xs space-y-4">
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                            <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-mono text-xs font-black px-2.5 py-0.5 rounded-lg bg-indigo-600 text-white shadow-xs">
                                        {currentQuote.quoteNo}
                                    </span>
                                    <select
                                        value={currentQuote.status}
                                        onChange={(e) => handleUpdateQuoteStatus(currentQuote.id, e.target.value)}
                                        className="text-xs font-black px-2.5 py-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-white outline-none"
                                    >
                                        <option value="DRAFT">Taslak (Hazırlanıyor)</option>
                                        <option value="OFFERED">Teklif Verildi</option>
                                        <option value="APPROVED">Müşteri Onayladı</option>
                                        <option value="REVISED">Revizyon İstendi</option>
                                        <option value="CANCELLED">İptal / Reddedildi</option>
                                    </select>
                                    <span className="text-xs text-gray-400">
                                        Para Birimi: <strong>{currentQuote.currency} ({getCurrencySymbol(currentQuote.currency)})</strong>
                                    </span>
                                </div>
                                <h2 className="text-2xl font-black text-gray-900 dark:text-white mt-1">
                                    {currentQuote.projectName}
                                </h2>
                                <p className="text-sm font-bold text-gray-600 dark:text-gray-300">
                                    Müşteri / Firma: <span className="text-indigo-600 dark:text-indigo-400">{currentQuote.companyName}</span>
                                    {currentQuote.contactPerson && ` • İlgili: ${currentQuote.contactPerson}`}
                                </p>
                            </div>

                            {/* Sekme Değiştirici: Düzenleyici vs Müşteri Sunumu */}
                            <div className="flex items-center gap-2">
                                <div className="flex bg-gray-100 dark:bg-gray-700 p-1 rounded-xl border border-gray-200 dark:border-gray-600 text-xs font-black">
                                    <button
                                        type="button"
                                        onClick={() => setActiveTab('EDITOR')}
                                        className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                                            activeTab === 'EDITOR'
                                                ? 'bg-indigo-600 text-white shadow-xs'
                                                : 'text-gray-600 dark:text-gray-300 hover:text-gray-900'
                                        }`}
                                    >
                                        <Edit3 className="w-3.5 h-3.5" />
                                        <span>Maliyet & İmalat Düzenleyici</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setActiveTab('PRESENTATION')}
                                        className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                                            activeTab === 'PRESENTATION'
                                                ? 'bg-indigo-600 text-white shadow-xs'
                                                : 'text-gray-600 dark:text-gray-300 hover:text-gray-900'
                                        }`}
                                    >
                                        <Printer className="w-3.5 h-3.5" />
                                        <span>Müşteri Teklif Sunumu (PDF)</span>
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Genel Marj, Setup Ücreti & Güvenlik Payı Ayarları (Sadece Editör Modunda) */}
                        {activeTab === 'EDITOR' && (
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 pt-3 border-t border-gray-200 dark:border-gray-700 text-xs">
                                <div className="bg-gray-50 dark:bg-slate-800 p-2.5 rounded-xl border border-gray-200 dark:border-slate-700">
                                    <label className="block text-[10px] font-bold text-gray-600 dark:text-slate-300 mb-1">
                                        Ayar (Setup) Saat Ücreti
                                    </label>
                                    <div className="flex items-center gap-1.5">
                                        <input
                                            type="number"
                                            min="0"
                                            step="1"
                                            value={currentQuote.setupHourlyRate ?? 30}
                                            onChange={(e) => updateDoc(doc(db, MACHINING_QUOTES_COLLECTION, currentQuote.id), { setupHourlyRate: parseFloat(e.target.value) || 0 })}
                                            className="w-18 p-1.5 text-xs font-black bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-700 rounded-lg text-indigo-600 dark:text-indigo-400 outline-none focus:ring-1 focus:ring-indigo-500"
                                        />
                                        <span className="font-bold text-gray-500 dark:text-slate-400">{getCurrencySymbol(currentQuote.currency)}/saat</span>
                                    </div>
                                </div>

                                <div className="bg-gray-50 dark:bg-slate-800 p-2.5 rounded-xl border border-gray-200 dark:border-slate-700">
                                    <label className="block text-[10px] font-bold text-gray-600 dark:text-slate-300 mb-1">
                                        Güvenlik / Risk Payı (%)
                                    </label>
                                    <div className="flex items-center gap-1.5">
                                        <input
                                            type="number"
                                            min="0"
                                            max="100"
                                            value={currentQuote.riskMarginPercent || 0}
                                            onChange={(e) => updateDoc(doc(db, MACHINING_QUOTES_COLLECTION, currentQuote.id), { riskMarginPercent: parseFloat(e.target.value) || 0 })}
                                            className="w-18 p-1.5 text-xs font-black bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-700 rounded-lg text-gray-900 dark:text-white outline-none focus:ring-1 focus:ring-indigo-500"
                                        />
                                        <span className="font-bold text-gray-500 dark:text-slate-400">%</span>
                                    </div>
                                </div>

                                <div className="bg-gray-50 dark:bg-slate-800 p-2.5 rounded-xl border border-gray-200 dark:border-slate-700">
                                    <label className="block text-[10px] font-bold text-gray-600 dark:text-slate-300 mb-1">
                                        Hedef Kar Marjı (%)
                                    </label>
                                    <div className="flex items-center gap-1.5">
                                        <input
                                            type="number"
                                            min="0"
                                            max="200"
                                            value={currentQuote.profitMarginPercent || 0}
                                            onChange={(e) => updateDoc(doc(db, MACHINING_QUOTES_COLLECTION, currentQuote.id), { profitMarginPercent: parseFloat(e.target.value) || 0 })}
                                            className="w-18 p-1.5 text-xs font-black bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-700 rounded-lg text-gray-900 dark:text-white outline-none focus:ring-1 focus:ring-indigo-500"
                                        />
                                        <span className="font-bold text-gray-500 dark:text-slate-400">%</span>
                                    </div>
                                </div>

                                <div className="bg-gray-50 dark:bg-slate-800 p-2.5 rounded-xl border border-gray-200 dark:border-slate-700">
                                    <label className="block text-[10px] font-bold text-gray-600 dark:text-slate-300 mb-1">
                                        Özel İskonto (%)
                                    </label>
                                    <div className="flex items-center gap-1.5">
                                        <input
                                            type="number"
                                            min="0"
                                            max="50"
                                            value={currentQuote.discountPercent || 0}
                                            onChange={(e) => updateDoc(doc(db, MACHINING_QUOTES_COLLECTION, currentQuote.id), { discountPercent: parseFloat(e.target.value) || 0 })}
                                            className="w-18 p-1.5 text-xs font-black bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-700 rounded-lg text-gray-900 dark:text-white outline-none focus:ring-1 focus:ring-indigo-500"
                                        />
                                        <span className="font-bold text-gray-500 dark:text-slate-400">%</span>
                                    </div>
                                </div>

                                <div className="bg-indigo-50/70 dark:bg-indigo-950/50 p-2.5 rounded-xl border border-indigo-200 dark:border-indigo-800 flex flex-col justify-between">
                                    <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400">Genel Teklif Tutarı</span>
                                    <div className="text-base font-black text-indigo-700 dark:text-indigo-300">
                                        {quoteFinancials?.grandTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {getCurrencySymbol(currentQuote.currency)}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* ======================================================== */}
                    {/* DÜZENLEYİCİ MODU: PARÇALAR VE CANLI MALİYETLER */}
                    {/* ======================================================== */}
                    {activeTab === 'EDITOR' && (
                        <div className="space-y-6">
                            {/* Parçalar Başlığı & Parça Ekle Butonu */}
                            <div className="flex justify-between items-center">
                                <div>
                                    <h3 className="text-lg font-black text-gray-900 dark:text-white flex items-center gap-2">
                                        <Layers className="w-5 h-5 text-indigo-600" />
                                        <span>Teklif Edilen Parçalar ({currentQuote.parts?.length || 0})</span>
                                    </h3>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                        Her parçanın kütük boyutlarını, malzemesini ve talaşlı imalat sürelerini girin
                                    </p>
                                </div>

                                <button
                                    type="button"
                                    onClick={handleAddPartToQuote}
                                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs rounded-xl shadow-xs transition flex items-center gap-1.5 active:scale-95"
                                >
                                    <Plus className="w-4 h-4" />
                                    <span>Yeni Parça Ekle</span>
                                </button>
                            </div>

                            {/* Parça Kartları */}
                            {(currentQuote.parts || []).length === 0 ? (
                                <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-dashed border-gray-300 dark:border-gray-700 p-12 text-center">
                                    <Box className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                                    <p className="text-sm font-bold text-gray-700 dark:text-gray-300">Bu teklife henüz parça eklenmedi.</p>
                                    <p className="text-xs text-gray-400 mt-1">Yukarıdaki "Yeni Parça Ekle" butonuna tıklayarak ilk parçayı ekleyin.</p>
                                </div>
                            ) : (
                                <div className="space-y-5">
                                    {quoteFinancials?.partsAnalysis.map((part, pIdx) => {
                                        const currencySym = getCurrencySymbol(currentQuote.currency);

                                        return (
                                            <div
                                                key={part.id || pIdx}
                                                onPaste={(e) => handleContainerPaste(part.id, e)}
                                                className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-xs overflow-hidden transition-all hover:border-gray-300 dark:hover:border-slate-600"
                                            >
                                                {/* Parça Başlık Şeridi */}
                                                <div className="p-4 bg-gray-50 dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                                        <span className="w-7 h-7 rounded-lg bg-indigo-600 text-white font-black text-xs flex items-center justify-center shrink-0">
                                                            {pIdx + 1}
                                                        </span>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                <input
                                                                    type="text"
                                                                    value={part.partName}
                                                                    onChange={(e) => handleUpdatePart(part.id, { partName: e.target.value })}
                                                                    placeholder="Parça Adı..."
                                                                    className="font-black text-base text-gray-900 dark:text-white bg-transparent border-b border-dashed border-gray-300 dark:border-slate-600 focus:border-indigo-500 outline-none px-1 py-0.5"
                                                                />
                                                                <input
                                                                    type="text"
                                                                    value={part.partCode || ''}
                                                                    onChange={(e) => handleUpdatePart(part.id, { partCode: e.target.value })}
                                                                    placeholder="Parça No/Kodu"
                                                                    className="w-24 font-mono text-xs font-bold text-gray-600 dark:text-slate-300 bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-700 rounded-lg px-2 py-0.5 outline-none"
                                                                />
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Adet ve Sil Butonu */}
                                                    <div className="flex items-center gap-3">
                                                        <div className="flex items-center gap-1.5 bg-white dark:bg-slate-900 px-2.5 py-1 rounded-xl border border-gray-200 dark:border-slate-700">
                                                            <span className="text-[11px] font-bold text-gray-500 dark:text-slate-400">Adet:</span>
                                                            <input
                                                                type="number"
                                                                min="1"
                                                                step="1"
                                                                value={part.quantity || 1}
                                                                onChange={(e) => handleUpdatePart(part.id, { quantity: Math.max(1, parseInt(e.target.value) || 1) })}
                                                                className="w-14 font-black text-xs bg-transparent text-gray-900 dark:text-white text-center outline-none"
                                                            />
                                                        </div>

                                                        <div className="text-right">
                                                            <span className="text-[10px] text-gray-400 font-bold block">Önerilen Birim / Toplam</span>
                                                            <span className="text-xs font-black text-indigo-600 dark:text-indigo-400">
                                                                {part.unitFinalPrice.toLocaleString('tr-TR')} {currencySym} 
                                                                <span className="text-gray-400 font-medium ml-1">({part.totalFinalPrice.toLocaleString('tr-TR')} {currencySym})</span>
                                                            </span>
                                                        </div>

                                                        <button
                                                            type="button"
                                                            onClick={() => handleDeletePart(part.id)}
                                                            className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition"
                                                            title="Parçayı Sil"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* Parça Gövdesi: 3 Kolonlu Grid */}
                                                <div className="p-5 grid grid-cols-1 lg:grid-cols-12 gap-5">
                                                    
                                                    {/* KOLON 1 (lg:3): RESİMLER & LIGHTBOX & PANO */}
                                                    <div className="lg:col-span-3 space-y-2 border-b lg:border-b-0 lg:border-r border-gray-100 dark:border-slate-800 pb-4 lg:pb-0 lg:pr-4 flex flex-col justify-between">
                                                        <div>
                                                            <div className="flex justify-between items-center mb-1.5">
                                                                <label className="text-xs font-black text-gray-700 dark:text-slate-200 flex items-center gap-1">
                                                                    <ImageIcon className="w-3.5 h-3.5 text-indigo-500" />
                                                                    <span>Teknik Resim / Görseller</span>
                                                                </label>
                                                                <span className="text-[10px] text-gray-400">
                                                                    ({part.images?.length || 0})
                                                                </span>
                                                            </div>

                                                            {/* Yüklenen Resim(ler) Alanı - Alanı Doldurur */}
                                                            {(part.images || []).length > 0 ? (
                                                                <div className="space-y-2">
                                                                    {/* Büyük Önizleme (Alanı Tam Doldurur) */}
                                                                    <div
                                                                        onClick={() => setPreviewImage({ isOpen: true, url: part.images[0], title: `${part.partName} - Görsel` })}
                                                                        className="group relative w-full h-44 sm:h-48 bg-slate-950 rounded-2xl overflow-hidden border border-gray-200 dark:border-slate-700 cursor-pointer shadow-xs hover:border-indigo-500 transition"
                                                                        title="Tam ekran incelemek için tıklayınız"
                                                                    >
                                                                        <img
                                                                            src={part.images[0]}
                                                                            alt={part.partName}
                                                                            className="w-full h-full object-contain p-1 group-hover:scale-102 transition duration-200"
                                                                        />
                                                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                                                                            <ZoomIn className="w-6 h-6 text-white drop-shadow" />
                                                                        </div>
                                                                        <button
                                                                            type="button"
                                                                            onClick={(e) => handleDeletePartImage(part.id, 0, e)}
                                                                            className="absolute top-2 right-2 p-1.5 rounded-lg bg-red-600/90 hover:bg-red-700 text-white opacity-0 group-hover:opacity-100 transition shadow"
                                                                            title="Resmi Sil"
                                                                        >
                                                                            <X className="w-3.5 h-3.5" />
                                                                        </button>
                                                                    </div>

                                                                    {/* Birden fazla görsel varsa küçük şerit */}
                                                                    {part.images.length > 1 && (
                                                                        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 custom-scrollbar">
                                                                            {part.images.slice(1).map((imgUrl, extraIdx) => (
                                                                                <div
                                                                                    key={extraIdx + 1}
                                                                                    onClick={() => setPreviewImage({ isOpen: true, url: imgUrl, title: `${part.partName} - Görsel #${extraIdx + 2}` })}
                                                                                    className="group relative w-12 h-12 rounded-lg bg-slate-900 border border-slate-700 overflow-hidden shrink-0 cursor-pointer"
                                                                                >
                                                                                    <img src={imgUrl} alt="Ek" className="w-full h-full object-cover" />
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={(e) => handleDeletePartImage(part.id, extraIdx + 1, e)}
                                                                                        className="absolute top-0.5 right-0.5 p-0.5 rounded bg-red-600 text-white opacity-0 group-hover:opacity-100 transition"
                                                                                    >
                                                                                        <X className="w-2.5 h-2.5" />
                                                                                    </button>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            ) : (
                                                                /* Resim Yokken Kompakt Yükleme Kutusu */
                                                                <label className="w-full h-40 border-2 border-dashed border-gray-300 dark:border-slate-700 hover:border-indigo-500 rounded-2xl flex flex-col items-center justify-center cursor-pointer text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition bg-gray-50/50 dark:bg-slate-800/40 p-4">
                                                                    <Upload className="w-6 h-6 mb-1 text-indigo-500" />
                                                                    <span className="text-xs font-bold text-gray-700 dark:text-slate-300">Teknik Resim Yükle</span>
                                                                    <span className="text-[10px] text-gray-400 mt-0.5">+ Dosyadan Seç</span>
                                                                    <input
                                                                        type="file"
                                                                        accept="image/*"
                                                                        multiple
                                                                        onChange={(e) => handleUploadPartImage(part.id, e)}
                                                                        className="hidden"
                                                                    />
                                                                </label>
                                                            )}
                                                        </div>

                                                        {/* Kompakt Küçük Butonlar (Altta Kenarda Zarif Görünüm) */}
                                                        <div className="pt-2">
                                                            <div className="flex items-center gap-1.5">
                                                                <label className="flex-1 py-1.5 px-2 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-300 border border-gray-300 dark:border-slate-700 rounded-xl text-[10px] font-bold flex items-center justify-center gap-1 cursor-pointer transition">
                                                                    <Upload className="w-3 h-3 text-indigo-500" />
                                                                    <span>+ Dosya Seç</span>
                                                                    <input
                                                                        type="file"
                                                                        accept="image/*"
                                                                        multiple
                                                                        onChange={(e) => handleUploadPartImage(part.id, e)}
                                                                        className="hidden"
                                                                    />
                                                                </label>

                                                                <button
                                                                    type="button"
                                                                    onClick={() => handlePasteFromClipboard(part.id)}
                                                                    className="flex-1 py-1.5 px-2 bg-indigo-50 dark:bg-slate-800 hover:bg-indigo-100 dark:hover:bg-slate-700 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-slate-700 rounded-xl text-[10px] font-black flex items-center justify-center gap-1 transition active:scale-95 shadow-2xs"
                                                                    title="Panodan doğrudan yapıştırır (Ctrl+V)"
                                                                >
                                                                    <Clipboard className="w-3 h-3 text-indigo-500" />
                                                                    <span>📋 Yapıştır (Ctrl+V)</span>
                                                                </button>
                                                            </div>
                                                            <p className="text-[9px] text-gray-400 italic text-center mt-1">
                                                                Tıklayarak tam ekran inceleyebilirsiniz.
                                                            </p>
                                                        </div>
                                                    </div>

                                                    {/* KOLON 2 (lg:4): HAMMADDE & KÜTÜK HESAPLAYICI */}
                                                    <div className="lg:col-span-4 space-y-3 border-b lg:border-b-0 lg:border-r border-gray-100 dark:border-slate-800 pb-4 lg:pb-0 lg:pr-4">
                                                        <div className="flex justify-between items-center">
                                                            <label className="text-xs font-black text-gray-700 dark:text-slate-200 flex items-center gap-1">
                                                                <Box className="w-3.5 h-3.5 text-amber-500" />
                                                                <span>Kütük & Hammadde</span>
                                                            </label>
                                                            {/* Form Seçici: Blok vs Mil */}
                                                            <div className="flex bg-gray-100 dark:bg-slate-800 p-0.5 rounded-lg text-[10px] font-bold border border-gray-200 dark:border-slate-700">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleUpdatePart(part.id, { stockShape: 'BLOCK' })}
                                                                    className={`px-2 py-0.5 rounded ${part.stockShape !== 'CYLINDER' ? 'bg-amber-500 text-white shadow-2xs' : 'text-gray-500 dark:text-slate-400'}`}
                                                                >
                                                                    Lama/Blok
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleUpdatePart(part.id, { stockShape: 'CYLINDER' })}
                                                                    className={`px-2 py-0.5 rounded ${part.stockShape === 'CYLINDER' ? 'bg-amber-500 text-white shadow-2xs' : 'text-gray-500 dark:text-slate-400'}`}
                                                                >
                                                                    Dolu Mil
                                                                </button>
                                                            </div>
                                                        </div>

                                                        {/* Malzeme Seçimi */}
                                                        <div>
                                                            <label className="block text-[10px] font-bold text-gray-500 dark:text-slate-400 mb-0.5">Malzeme Cinsi</label>
                                                            <select
                                                                value={part.materialId || ''}
                                                                onChange={(e) => {
                                                                    const foundMat = materials.find(m => m.id === e.target.value);
                                                                    if (foundMat) {
                                                                        handleUpdatePart(part.id, {
                                                                            materialId: foundMat.id,
                                                                            materialName: foundMat.name,
                                                                            materialDensity: foundMat.density,
                                                                            materialPricePerKg: foundMat.pricePerKg
                                                                        });
                                                                    }
                                                                }}
                                                                className="w-full p-2 text-xs font-bold border border-gray-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-gray-900 dark:text-white outline-none focus:ring-1 focus:ring-amber-500"
                                                            >
                                                                {materials.map(m => (
                                                                    <option key={m.id} value={m.id}>
                                                                        {m.name} ({m.density} g/cm³ - {m.pricePerKg} {currencySym}/kg)
                                                                    </option>
                                                                ))}
                                                            </select>
                                                        </div>

                                                        {/* Kütük Ölçüleri */}
                                                        {part.stockShape === 'CYLINDER' ? (
                                                            <div className="grid grid-cols-2 gap-2">
                                                                <div>
                                                                    <label className="block text-[10px] font-bold text-gray-500 dark:text-slate-400 mb-0.5">Çap Ø (mm)</label>
                                                                    <input
                                                                        type="number"
                                                                        min="1"
                                                                        value={part.dimensions?.diameter || ''}
                                                                        onChange={(e) => handleUpdatePart(part.id, { dimensions: { ...part.dimensions, diameter: parseFloat(e.target.value) || 0 } })}
                                                                        placeholder="Örn: 80"
                                                                        className="w-full p-1.5 text-xs font-bold border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white outline-none"
                                                                    />
                                                                </div>
                                                                <div>
                                                                    <label className="block text-[10px] font-bold text-gray-500 dark:text-slate-400 mb-0.5">Boy (mm)</label>
                                                                    <input
                                                                        type="number"
                                                                        min="1"
                                                                        value={part.dimensions?.length || ''}
                                                                        onChange={(e) => handleUpdatePart(part.id, { dimensions: { ...part.dimensions, length: parseFloat(e.target.value) || 0 } })}
                                                                        placeholder="Örn: 200"
                                                                        className="w-full p-1.5 text-xs font-bold border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white outline-none"
                                                                    />
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <div className="grid grid-cols-3 gap-1.5">
                                                                <div>
                                                                    <label className="block text-[10px] font-bold text-gray-500 dark:text-slate-400 mb-0.5">En (mm)</label>
                                                                    <input
                                                                        type="number"
                                                                        min="1"
                                                                        value={part.dimensions?.width || ''}
                                                                        onChange={(e) => handleUpdatePart(part.id, { dimensions: { ...part.dimensions, width: parseFloat(e.target.value) || 0 } })}
                                                                        placeholder="En"
                                                                        className="w-full p-1.5 text-xs font-bold border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white outline-none"
                                                                    />
                                                                </div>
                                                                <div>
                                                                    <label className="block text-[10px] font-bold text-gray-500 dark:text-slate-400 mb-0.5">Boy (mm)</label>
                                                                    <input
                                                                        type="number"
                                                                        min="1"
                                                                        value={part.dimensions?.length || ''}
                                                                        onChange={(e) => handleUpdatePart(part.id, { dimensions: { ...part.dimensions, length: parseFloat(e.target.value) || 0 } })}
                                                                        placeholder="Boy"
                                                                        className="w-full p-1.5 text-xs font-bold border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white outline-none"
                                                                    />
                                                                </div>
                                                                <div>
                                                                    <label className="block text-[10px] font-bold text-gray-500 dark:text-slate-400 mb-0.5">Yük. (mm)</label>
                                                                    <input
                                                                        type="number"
                                                                        min="1"
                                                                        value={part.dimensions?.height || ''}
                                                                        onChange={(e) => handleUpdatePart(part.id, { dimensions: { ...part.dimensions, height: parseFloat(e.target.value) || 0 } })}
                                                                        placeholder="Yük."
                                                                        className="w-full p-1.5 text-xs font-bold border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white outline-none"
                                                                    />
                                                                </div>
                                                            </div>
                                                        )}

                                                        {/* Otomatik Ağırlık & Malzeme Tutarı Rozeti */}
                                                        <div className="bg-amber-50/70 dark:bg-amber-950/40 p-2.5 rounded-xl border border-amber-200 dark:border-amber-900/60 flex justify-between items-center text-xs">
                                                            <div>
                                                                <span className="text-[10px] text-amber-700 dark:text-amber-300 font-semibold block">Kütük Ağırlığı</span>
                                                                <strong className="text-amber-900 dark:text-amber-200 font-black">
                                                                    {part.stockWeightKg || 0} kg / adet
                                                                </strong>
                                                            </div>
                                                            <div className="text-right">
                                                                <span className="text-[10px] text-amber-700 dark:text-amber-300 font-semibold block">Malzeme Tutarı</span>
                                                                <strong className="text-amber-900 dark:text-amber-200 font-black">
                                                                    {part.singlePartMatCost.toLocaleString('tr-TR')} {currencySym}
                                                                </strong>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* KOLON 3 (lg:5): İMALAT OPERASYONLARI & SÜRELER */}
                                                    <div className="lg:col-span-5 space-y-3">
                                                        <div className="flex justify-between items-center">
                                                            <label className="text-xs font-black text-gray-700 dark:text-gray-300 flex items-center gap-1">
                                                                <Clock className="w-3.5 h-3.5 text-indigo-500" />
                                                                <span>İmalat & Fason Operasyonları</span>
                                                            </label>

                                                            {/* Hızlı Operasyon Ekle Açılır Menüsü */}
                                                            <select
                                                                onChange={(e) => {
                                                                    if (e.target.value) {
                                                                        handleAddOperationToPart(part.id, e.target.value);
                                                                        e.target.value = '';
                                                                    }
                                                                }}
                                                                className="text-[11px] font-black bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 rounded-lg px-2 py-1 outline-none"
                                                            >
                                                                <option value="">+ Operasyon Ekle...</option>
                                                                <optgroup label="İç Talaşlı İmalat">
                                                                    {DEFAULT_MACHINING_OPERATIONS.filter(o => !o.isOutsourced).map(o => (
                                                                        <option key={o.id} value={o.id}>{o.name}</option>
                                                                    ))}
                                                                </optgroup>
                                                                <optgroup label="Dış / Fason Operasyonlar">
                                                                    {DEFAULT_MACHINING_OPERATIONS.filter(o => o.isOutsourced).map(o => (
                                                                        <option key={o.id} value={o.id}>{o.name}</option>
                                                                    ))}
                                                                </optgroup>
                                                            </select>
                                                        </div>

                                                        {/* Operasyonlar Listesi */}
                                                        <div className="space-y-2 max-h-56 overflow-y-auto custom-scrollbar pr-1">
                                                            {(part.operations || []).length === 0 ? (
                                                                <p className="text-[11px] text-gray-400 italic py-2 text-center">Operasyon eklenmedi. Yukarıdan seçiniz.</p>
                                                            ) : (
                                                                part.operations.map(op => (
                                                                    <div
                                                                        key={op.id}
                                                                        className={`p-2.5 rounded-xl border text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
                                                                            op.isOutsourced
                                                                                ? 'bg-purple-50/60 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800/60'
                                                                                : 'bg-gray-50 dark:bg-slate-800/90 border-gray-200 dark:border-slate-700'
                                                                        }`}
                                                                    >
                                                                        <div className="flex-1 min-w-0">
                                                                            <div className="flex items-center gap-1.5">
                                                                                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded uppercase ${op.isOutsourced ? 'bg-purple-200 dark:bg-purple-900 text-purple-800 dark:text-purple-200' : 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200'}`}>
                                                                                    {op.isOutsourced ? 'Fason' : 'İç İmalat'}
                                                                                </span>
                                                                                <strong className="text-gray-900 dark:text-white font-bold truncate">
                                                                                    {op.name}
                                                                                </strong>
                                                                            </div>
                                                                        </div>

                                                                        {/* Süre & Saat Ücreti veya Manuel Fason Maliyeti */}
                                                                        <div className="flex items-center gap-2 shrink-0 flex-wrap sm:flex-nowrap">
                                                                            {!op.isOutsourced ? (() => {
                                                                                const dHours = parseFloat(op.durationHours) || 0;
                                                                                const hVal = Math.floor(dHours);
                                                                                const mVal = Math.round((dHours - hVal) * 60);
                                                                                return (
                                                                                    <div className="flex items-center gap-1.5">
                                                                                        {/* Saat & Dakika Kutusu */}
                                                                                        <div className="flex items-center gap-1 bg-white dark:bg-slate-900 px-1.5 py-0.5 rounded-lg border border-gray-300 dark:border-slate-700">
                                                                                            <input
                                                                                                type="number"
                                                                                                min="0"
                                                                                                value={hVal || ''}
                                                                                                onChange={(e) => {
                                                                                                    const newH = Math.max(0, parseInt(e.target.value) || 0);
                                                                                                    const newTotal = newH + (mVal / 60);
                                                                                                    handleUpdateOperation(part.id, op.id, { durationHours: Number(newTotal.toFixed(4)) });
                                                                                                }}
                                                                                                className="w-7 text-xs font-black bg-transparent text-gray-900 dark:text-white text-center outline-none"
                                                                                                placeholder="0"
                                                                                                title="Saat"
                                                                                            />
                                                                                            <span className="text-[10px] text-gray-400 font-bold">sa</span>
                                                                                            <span className="text-gray-300 dark:text-slate-600 font-bold">:</span>
                                                                                            <input
                                                                                                type="number"
                                                                                                min="0"
                                                                                                max="59"
                                                                                                value={mVal || ''}
                                                                                                onChange={(e) => {
                                                                                                    const newM = Math.max(0, Math.min(59, parseInt(e.target.value) || 0));
                                                                                                    const newTotal = hVal + (newM / 60);
                                                                                                    handleUpdateOperation(part.id, op.id, { durationHours: Number(newTotal.toFixed(4)) });
                                                                                                }}
                                                                                                className="w-7 text-xs font-black bg-transparent text-gray-900 dark:text-white text-center outline-none"
                                                                                                placeholder="0"
                                                                                                title="Dakika"
                                                                                            />
                                                                                            <span className="text-[10px] text-gray-400 font-bold">dk</span>
                                                                                        </div>
                                                                                        <span className="text-gray-400 dark:text-slate-500 font-bold">×</span>
                                                                                        <div className="flex items-center gap-1">
                                                                                            <input
                                                                                                type="number"
                                                                                                min="0"
                                                                                                step="1"
                                                                                                value={op.hourlyRate || ''}
                                                                                                onChange={(e) => handleUpdateOperation(part.id, op.id, { hourlyRate: parseFloat(e.target.value) || 0 })}
                                                                                                className="w-12 p-1 text-xs font-black bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-700 text-indigo-600 dark:text-indigo-400 rounded-lg text-center"
                                                                                                placeholder="€/s"
                                                                                                title="Tezgah Saat Ücreti (€/saat)"
                                                                                            />
                                                                                            <span className="text-[10px] text-gray-500 dark:text-slate-400 font-bold">{currencySym}/s</span>
                                                                                        </div>
                                                                                    </div>
                                                                                );
                                                                            })() : (
                                                                                <div className="flex items-center gap-1">
                                                                                    <span className="text-[10px] text-purple-700 dark:text-purple-300 font-bold">Fason Bedeli:</span>
                                                                                    <input
                                                                                        type="number"
                                                                                        min="0"
                                                                                        step="1"
                                                                                        value={op.cost || ''}
                                                                                        onChange={(e) => handleUpdateOperation(part.id, op.id, { cost: parseFloat(e.target.value) || 0 })}
                                                                                        className="w-20 p-1 text-xs font-black bg-white dark:bg-slate-900 border border-purple-300 dark:border-purple-700 text-purple-700 dark:text-purple-300 rounded-lg text-right"
                                                                                        placeholder="Fason Tutarı"
                                                                                        title="Manuel Dış Fason Bedeli"
                                                                                    />
                                                                                    <span className="text-[10px] text-gray-500 dark:text-slate-400 font-bold">{currencySym}</span>
                                                                                </div>
                                                                            )}

                                                                            <strong className="font-black text-gray-800 dark:text-gray-100 min-w-[65px] text-right">
                                                                                {(op.cost || 0).toLocaleString('tr-TR')} {currencySym}
                                                                            </strong>

                                                                            <button
                                                                                type="button"
                                                                                onClick={() => handleDeleteOperation(part.id, op.id)}
                                                                                className="p-1 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/50 transition"
                                                                                title="Operasyonu Sil"
                                                                            >
                                                                                <X className="w-3.5 h-3.5" />
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                ))
                                                            )}
                                                        </div>

                                                        {/* Parça Tezgah Ayar / Setup Saati & Dakikası */}
                                                        {(() => {
                                                            const sTotal = parseFloat(part.setupTimeHours) || 0;
                                                            const sH = Math.floor(sTotal);
                                                            const sM = Math.round((sTotal - sH) * 60);
                                                            const setupRate = parseFloat(currentQuote.setupHourlyRate ?? 30);
                                                            const partSetupCost = sTotal * setupRate;
                                                            return (
                                                                <div className="pt-2 border-t border-gray-100 dark:border-slate-700 flex items-center justify-between bg-gray-50 dark:bg-slate-800 px-3 py-1.5 rounded-xl text-xs">
                                                                    <span className="text-gray-600 dark:text-slate-300 font-bold flex items-center gap-1.5">
                                                                        <Clock className="w-3.5 h-3.5 text-indigo-500" />
                                                                        <span>Tezgah Hazırlık / Ayar (Setup):</span>
                                                                    </span>
                                                                    <div className="flex items-center gap-2">
                                                                        <div className="flex items-center gap-1 bg-white dark:bg-slate-900 px-2 py-0.5 rounded-lg border border-gray-300 dark:border-slate-700">
                                                                            <input
                                                                                type="number"
                                                                                min="0"
                                                                                value={sH || ''}
                                                                                onChange={(e) => {
                                                                                    const newH = Math.max(0, parseInt(e.target.value) || 0);
                                                                                    const newTotal = newH + (sM / 60);
                                                                                    handleUpdatePart(part.id, { setupTimeHours: Number(newTotal.toFixed(4)) });
                                                                                }}
                                                                                className="w-7 text-xs font-black bg-transparent text-gray-900 dark:text-white text-center outline-none"
                                                                                placeholder="0"
                                                                                title="Setup Saati"
                                                                            />
                                                                            <span className="text-[10px] text-gray-400 font-bold">sa</span>
                                                                            <span className="text-gray-300 dark:text-slate-600 font-bold">:</span>
                                                                            <input
                                                                                type="number"
                                                                                min="0"
                                                                                max="59"
                                                                                value={sM || ''}
                                                                                onChange={(e) => {
                                                                                    const newM = Math.max(0, Math.min(59, parseInt(e.target.value) || 0));
                                                                                    const newTotal = sH + (newM / 60);
                                                                                    handleUpdatePart(part.id, { setupTimeHours: Number(newTotal.toFixed(4)) });
                                                                                }}
                                                                                className="w-7 text-xs font-black bg-transparent text-gray-900 dark:text-white text-center outline-none"
                                                                                placeholder="0"
                                                                                title="Setup Dakikası"
                                                                            />
                                                                            <span className="text-[10px] text-gray-400 font-bold">dk</span>
                                                                        </div>
                                                                        <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 min-w-[50px] text-right">
                                                                            ({partSetupCost.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} {currencySym})
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })()}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {/* CANLI TOPLAM MALİYET ÖZETİ (FOOTER PANOSU) */}
                            {quoteFinancials && (
                                <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-6 shadow-xl border border-indigo-800/50 space-y-4">
                                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-slate-700 pb-3">
                                        <div>
                                            <h4 className="text-base font-black text-white flex items-center gap-2">
                                                <Calculator className="w-5 h-5 text-indigo-400" />
                                                <span>Fiyatlandırma & Maliyet Analiz Özeti</span>
                                            </h4>
                                            <span className="text-xs text-slate-400">
                                                {quoteFinancials.totalPartsCount} Adet Toplam Parça • {quoteFinancials.totalInternalHours} Saat Tezgah Yükü
                                            </span>
                                        </div>
                                        <div className="text-right">
                                            <span className="text-xs text-indigo-300 font-bold block">NET TEKLİF BEDELİ</span>
                                            <span className="text-2xl font-black text-emerald-400">
                                                {quoteFinancials.grandTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {getCurrencySymbol(currentQuote.currency)}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
                                        <div className="bg-slate-800/80 p-2.5 rounded-xl border border-slate-700">
                                            <span className="text-[10px] text-slate-400 block">Hammadde Maliyeti</span>
                                            <strong className="text-sm font-black text-white">
                                                {quoteFinancials.totalMaterialCost.toLocaleString('tr-TR')} {getCurrencySymbol(currentQuote.currency)}
                                            </strong>
                                        </div>

                                        <div className="bg-slate-800/80 p-2.5 rounded-xl border border-slate-700">
                                            <span className="text-[10px] text-slate-400 block">Talaşlı İmalat ({quoteFinancials.totalInternalHours}s)</span>
                                            <strong className="text-sm font-black text-white">
                                                {quoteFinancials.totalInternalMachiningCost.toLocaleString('tr-TR')} {getCurrencySymbol(currentQuote.currency)}
                                            </strong>
                                        </div>

                                        <div className="bg-slate-800/80 p-2.5 rounded-xl border border-slate-700">
                                            <span className="text-[10px] text-slate-400 block">Dış / Fason Hizmetler</span>
                                            <strong className="text-sm font-black text-white">
                                                {quoteFinancials.totalOutsourcedCost.toLocaleString('tr-TR')} {getCurrencySymbol(currentQuote.currency)}
                                            </strong>
                                        </div>

                                        <div className="bg-slate-800/80 p-2.5 rounded-xl border border-slate-700">
                                            <span className="text-[10px] text-slate-400 block">Tezgah Hazırlık / Ayar</span>
                                            <strong className="text-sm font-black text-white">
                                                {quoteFinancials.totalSetupCost.toLocaleString('tr-TR')} {getCurrencySymbol(currentQuote.currency)}
                                            </strong>
                                        </div>

                                        <div className="bg-slate-800/80 p-2.5 rounded-xl border border-slate-700">
                                            <span className="text-[10px] text-amber-300 block">Risk / Güvenlik (%{currentQuote.riskMarginPercent})</span>
                                            <strong className="text-sm font-black text-amber-300">
                                                +{quoteFinancials.totalRiskAmount.toLocaleString('tr-TR')} {getCurrencySymbol(currentQuote.currency)}
                                            </strong>
                                        </div>

                                        <div className="bg-slate-800/80 p-2.5 rounded-xl border border-slate-700">
                                            <span className="text-[10px] text-emerald-300 block">Hesaplanan Kar (%{currentQuote.profitMarginPercent})</span>
                                            <strong className="text-sm font-black text-emerald-300">
                                                +{quoteFinancials.totalProfitAmount.toLocaleString('tr-TR')} {getCurrencySymbol(currentQuote.currency)}
                                            </strong>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ======================================================== */}
                    {/* GÖRÜNÜM 3: MÜŞTERİ TEKLİF SUNUMU & YAZDIRMA (PDF) */}
                    {/* ======================================================== */}
                    {activeTab === 'PRESENTATION' && (
                        <div className="space-y-4">
                            <div className="flex justify-between items-center bg-white dark:bg-gray-800 p-3 rounded-xl border border-gray-200 dark:border-gray-700 no-print">
                                <span className="text-xs text-gray-500 dark:text-gray-400 font-semibold">
                                    Bu görünüm iç maliyetleri gizleyerek müşteriye sunulacak resmi teklif mektubu formatıdır.
                                </span>
                                <button
                                    type="button"
                                    onClick={() => window.print()}
                                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs rounded-xl shadow-xs transition flex items-center gap-1.5"
                                >
                                    <Printer className="w-4 h-4" />
                                    <span>Teklifi Yazdır / PDF Kaydet</span>
                                </button>
                            </div>

                            {/* Yazdırılabilir Antetli Form */}
                            <div className="bg-white text-gray-900 p-8 rounded-2xl shadow-lg border border-gray-200 max-w-4xl mx-auto space-y-6 printable-quote-sheet">
                                {/* Antet & Başlık */}
                                <div className="flex justify-between items-start border-b-2 border-indigo-600 pb-5">
                                    <div>
                                        <h1 className="text-2xl font-black tracking-tight text-indigo-900">FİYAT TEKLİFİ</h1>
                                        <p className="text-xs text-gray-500 font-bold mt-0.5">TALAŞLI İMALAT & HASSAS MEKANİK</p>
                                    </div>
                                    <div className="text-right text-xs space-y-0.5">
                                        <p className="font-mono font-black text-indigo-700 text-sm">#{currentQuote.quoteNo}</p>
                                        <p className="text-gray-500">Tarih: {new Date().toLocaleDateString('tr-TR')}</p>
                                        <p className="text-gray-500">Geçerlilik: {currentQuote.validityDays || 30} Gün</p>
                                    </div>
                                </div>

                                {/* Müşteri Bilgileri */}
                                <div className="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded-xl text-xs">
                                    <div>
                                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Sayın / Firma</span>
                                        <strong className="text-sm font-black text-gray-900 block mt-0.5">{currentQuote.companyName}</strong>
                                        {currentQuote.contactPerson && <p className="text-gray-600 mt-0.5">İlgili: {currentQuote.contactPerson}</p>}
                                    </div>
                                    <div>
                                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Proje Adı</span>
                                        <strong className="text-sm font-black text-indigo-900 block mt-0.5">{currentQuote.projectName}</strong>
                                        <p className="text-gray-500 mt-0.5">Para Birimi: {currentQuote.currency} ({getCurrencySymbol(currentQuote.currency)})</p>
                                    </div>
                                </div>

                                {/* Parçalar Tablosu */}
                                <div className="overflow-x-auto">
                                    <table className="w-full text-xs text-left border-collapse">
                                        <thead>
                                            <tr className="bg-indigo-900 text-white font-black text-[11px]">
                                                <th className="p-2.5 rounded-l-lg">Sıra</th>
                                                <th className="p-2.5">Görsel</th>
                                                <th className="p-2.5">Parça Tanımı</th>
                                                <th className="p-2.5">Malzeme / Kütük</th>
                                                <th className="p-2.5 text-center">Adet</th>
                                                <th className="p-2.5 text-right">Birim Fiyat</th>
                                                <th className="p-2.5 text-right rounded-r-lg">Toplam Tutar</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-200">
                                            {quoteFinancials?.partsAnalysis.map((p, idx) => (
                                                <tr key={p.id} className="hover:bg-gray-50">
                                                    <td className="p-2.5 font-bold text-gray-500">{idx + 1}</td>
                                                    <td className="p-2.5">
                                                        {p.images?.[0] ? (
                                                            <img 
                                                                src={p.images[0]} 
                                                                alt={p.partName} 
                                                                onClick={() => setPreviewImage({ isOpen: true, url: p.images[0], title: p.partName })}
                                                                className="w-12 h-12 object-cover rounded-lg border border-gray-300 cursor-pointer shadow-2xs hover:scale-110 transition"
                                                            />
                                                        ) : (
                                                            <div className="w-12 h-12 rounded-lg bg-gray-100 border border-gray-300 flex items-center justify-center text-gray-400">
                                                                <ImageIcon className="w-4 h-4" />
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className="p-2.5 font-bold">
                                                        <div className="text-gray-900 font-black">{p.partName}</div>
                                                        {p.partCode && <div className="text-[10px] text-gray-500 font-mono">#{p.partCode}</div>}
                                                    </td>
                                                    <td className="p-2.5">
                                                        <span className="font-bold text-gray-800">{p.materialName}</span>
                                                        <div className="text-[10px] text-gray-500">
                                                            {p.stockShape === 'CYLINDER' ? `Ø${p.dimensions?.diameter}x${p.dimensions?.length}mm` : `${p.dimensions?.width}x${p.dimensions?.length}x${p.dimensions?.height}mm`}
                                                        </div>
                                                    </td>
                                                    <td className="p-2.5 text-center font-black">{p.qty}</td>
                                                    <td className="p-2.5 text-right font-black">
                                                        {p.unitFinalPrice.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {getCurrencySymbol(currentQuote.currency)}
                                                    </td>
                                                    <td className="p-2.5 text-right font-black text-indigo-900">
                                                        {p.totalFinalPrice.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {getCurrencySymbol(currentQuote.currency)}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Alt Toplamlar & Notlar */}
                                <div className="flex flex-col sm:flex-row justify-between items-start gap-4 pt-4 border-t-2 border-gray-200">
                                    <div className="text-xs text-gray-500 space-y-1 max-w-md">
                                        <h5 className="font-bold text-gray-700">Teklif Şartları:</h5>
                                        <p>• Fiyatlarımıza KDV dahil değildir.</p>
                                        <p>• Teklifimiz yukarıda belirtilen geçerlilik süresi sonuna kadar geçerlidir.</p>
                                        <p>• Teslimat süresi sipariş teyidi ve malzeme teminine müteakip belirlenecektir.</p>
                                    </div>

                                    <div className="w-full sm:w-64 space-y-1.5 text-xs bg-gray-50 p-3.5 rounded-xl border border-gray-200">
                                        <div className="flex justify-between">
                                            <span className="text-gray-500">Ara Toplam:</span>
                                            <strong className="font-bold">
                                                {quoteFinancials?.grandTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {getCurrencySymbol(currentQuote.currency)}
                                            </strong>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-gray-500">KDV (%20):</span>
                                            <strong className="font-bold">
                                                {(quoteFinancials?.grandTotal * 0.2).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {getCurrencySymbol(currentQuote.currency)}
                                            </strong>
                                        </div>
                                        <div className="flex justify-between pt-2 border-t border-gray-300 text-sm font-black text-indigo-900">
                                            <span>GENEL TOPLAM:</span>
                                            <span>
                                                {(quoteFinancials?.grandTotal * 1.2).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {getCurrencySymbol(currentQuote.currency)}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ============================================================ */}
            {/* MODAL 1: YENİ TEKLİF AÇMA MODALI */}
            {/* ============================================================ */}
            {isNewQuoteModalOpen && (
                <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
                    <div className="bg-white dark:bg-gray-800 rounded-3xl border border-gray-200 dark:border-gray-700 shadow-2xl w-full max-w-lg overflow-hidden">
                        <div className="p-5 bg-indigo-50 dark:bg-indigo-950/40 border-b border-indigo-100 dark:border-indigo-900/60 flex justify-between items-center">
                            <div className="flex items-center gap-2.5">
                                <span className="p-2 rounded-xl bg-indigo-600 text-white shadow-xs">
                                    <Plus className="w-5 h-5" />
                                </span>
                                <div>
                                    <h3 className="font-black text-base text-gray-900 dark:text-white">
                                        Yeni Talaşlı İmalat Projesi Değerlendir
                                    </h3>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                        Firma ve proje adını girerek teklif hazırlığına başlayın
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsNewQuoteModalOpen(false)}
                                className="p-1.5 rounded-xl text-gray-400 hover:text-gray-700 dark:hover:text-white"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={handleCreateQuote} className="p-5 space-y-4 text-xs">
                            <div>
                                <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">
                                    Firma / Müşteri Adı <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    required
                                    placeholder="Örn: ABC Otomotiv San. Tic. A.Ş."
                                    value={newQuoteData.companyName}
                                    onChange={(e) => setNewQuoteData(prev => ({ ...prev, companyName: e.target.value }))}
                                    className="w-full p-2.5 font-bold border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                            </div>

                            <div>
                                <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">
                                    Proje / İş Adı <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    required
                                    placeholder="Örn: Robot Tutucu Gövde ve Çeneleri"
                                    value={newQuoteData.projectName}
                                    onChange={(e) => setNewQuoteData(prev => ({ ...prev, projectName: e.target.value }))}
                                    className="w-full p-2.5 font-bold border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">
                                        İlgili Kişi (Opsiyonel)
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="Örn: Ahmet Bey"
                                        value={newQuoteData.contactPerson}
                                        onChange={(e) => setNewQuoteData(prev => ({ ...prev, contactPerson: e.target.value }))}
                                        className="w-full p-2.5 font-bold border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none"
                                    />
                                </div>

                                <div>
                                    <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">
                                        Para Birimi
                                    </label>
                                    <select
                                        value={newQuoteData.currency}
                                        onChange={(e) => setNewQuoteData(prev => ({ ...prev, currency: e.target.value }))}
                                        className="w-full p-2.5 font-black border border-gray-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 text-gray-900 dark:text-white outline-none"
                                    >
                                        <option value="EUR">Euro (€ - EUR)</option>
                                        <option value="USD">Amerikan Doları ($ - USD)</option>
                                        <option value="TRY">Türk Lirası (₺ - TRY)</option>
                                    </select>
                                </div>
                            </div>

                            <div className="p-4 bg-gray-50 dark:bg-slate-800 -mx-5 -mb-5 border-t border-gray-200 dark:border-slate-700 flex justify-end gap-2 mt-4">
                                <button
                                    type="button"
                                    onClick={() => setIsNewQuoteModalOpen(false)}
                                    className="px-4 py-2 font-bold text-gray-700 dark:text-slate-300 bg-gray-200 dark:bg-slate-700 rounded-xl hover:bg-gray-300 dark:hover:bg-slate-600 transition"
                                >
                                    Vazgeç
                                </button>
                                <button
                                    type="submit"
                                    className="px-5 py-2 font-black text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition flex items-center gap-1.5 shadow-sm"
                                >
                                    <Check className="w-4 h-4" />
                                    <span>Teklifi Başlat ve Parça Ekle</span>
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ============================================================ */}
            {/* MODAL 2: MANUEL MALZEME KÜTÜPHANESİ YÖNETİMİ */}
            {/* ============================================================ */}
            {isMaterialModalOpen && (
                <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
                    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-gray-200 dark:border-slate-800 shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh]">
                        <div className="p-5 bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200/80 dark:border-amber-900/60 flex justify-between items-center shrink-0">
                            <div className="flex items-center gap-2.5">
                                <span className="p-2 rounded-xl bg-amber-500 text-white shadow-xs">
                                    <Settings className="w-5 h-5" />
                                </span>
                                <div>
                                    <h3 className="font-black text-base text-gray-900 dark:text-white">
                                        Talaşlı İmalat Malzeme Kütüphanesi
                                    </h3>
                                    <p className="text-xs text-amber-700 dark:text-amber-300">
                                        Yeni malzeme tanımlayın, özgül ağırlık (g/cm³) ve €/kg birim fiyatlarını güncelleyin
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={handleResetDefaultMaterials}
                                    className="px-2.5 py-1.5 rounded-xl bg-amber-100 dark:bg-amber-900/50 hover:bg-amber-200 dark:hover:bg-amber-800 text-amber-900 dark:text-amber-200 font-bold text-[11px] transition flex items-center gap-1 shadow-2xs"
                                    title="Tüm varsayılan çelik/alüminyum malzemelerini güncel Euro piyasa fiyatlarına günceller"
                                >
                                    <RefreshCw className="w-3.5 h-3.5 text-amber-600 dark:text-amber-300" />
                                    <span>Piyasa Fiyatlarını Yenile</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsMaterialModalOpen(false);
                                        setEditingMaterial(null);
                                    }}
                                    className="p-1.5 rounded-xl text-gray-400 hover:text-gray-700 dark:hover:text-white"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        </div>

                        <div className="p-5 overflow-y-auto custom-scrollbar flex-1 space-y-5 text-xs">
                            {/* Malzeme Ekleme / Düzenleme Formu */}
                            <form onSubmit={handleSaveMaterial} className="bg-gray-50 dark:bg-slate-800/90 p-4 rounded-2xl border border-gray-200 dark:border-slate-700 space-y-3">
                                <div className="flex justify-between items-center">
                                    <h4 className="font-black text-xs text-gray-800 dark:text-gray-200 flex items-center gap-1.5">
                                        {editingMaterial ? <Edit3 className="w-3.5 h-3.5 text-amber-500" /> : <Plus className="w-3.5 h-3.5 text-indigo-500" />}
                                        <span>{editingMaterial ? 'Malzemeyi Düzenle' : 'Yeni Malzeme Ekle'}</span>
                                    </h4>
                                    {editingMaterial && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setEditingMaterial(null);
                                                setMatFormData({ name: '', code: '', density: 7.85, pricePerKg: 2.80, category: 'Çelik' });
                                            }}
                                            className="text-[10px] text-gray-500 hover:text-red-500 font-bold"
                                        >
                                            Düzenlemeyi İptal Et
                                        </button>
                                    )}
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 mb-0.5">Malzeme Adı *</label>
                                        <input
                                            type="text"
                                            required
                                            placeholder="Örn: 4140 Islah Çeliği"
                                            value={matFormData.name}
                                            onChange={(e) => setMatFormData(prev => ({ ...prev, name: e.target.value }))}
                                            className="w-full p-2 font-bold border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-gray-900 dark:text-white outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 mb-0.5">Norm / Standart Kod</label>
                                        <input
                                            type="text"
                                            placeholder="Örn: 42CrMo4 veya 1.7225"
                                            value={matFormData.code}
                                            onChange={(e) => setMatFormData(prev => ({ ...prev, code: e.target.value }))}
                                            className="w-full p-2 font-bold border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-gray-900 dark:text-white outline-none"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-3 gap-3">
                                    <div>
                                        <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 mb-0.5">Özgül Ağırlık (g/cm³)</label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            min="0.1"
                                            required
                                            value={matFormData.density}
                                            onChange={(e) => setMatFormData(prev => ({ ...prev, density: e.target.value }))}
                                            className="w-full p-2 font-black border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-gray-900 dark:text-white outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 mb-0.5">Birim Fiyat (€/Kg)</label>
                                        <input
                                            type="number"
                                            step="0.1"
                                            min="0"
                                            required
                                            value={matFormData.pricePerKg}
                                            onChange={(e) => setMatFormData(prev => ({ ...prev, pricePerKg: e.target.value }))}
                                            className="w-full p-2 font-black border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-gray-900 dark:text-white outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 mb-0.5">Kategori</label>
                                        <select
                                            value={matFormData.category}
                                            onChange={(e) => setMatFormData(prev => ({ ...prev, category: e.target.value }))}
                                            className="w-full p-2 font-bold border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-gray-900 dark:text-white outline-none"
                                        >
                                            <option value="Çelik">Çelik</option>
                                            <option value="Takım Çeliği">Takım Çeliği</option>
                                            <option value="Alüminyum">Alüminyum</option>
                                            <option value="Paslanmaz">Paslanmaz</option>
                                            <option value="Sarı/Bakır">Sarı/Bakır</option>
                                            <option value="Plastik/Polimer">Plastik/Polimer</option>
                                            <option value="Döküm">Döküm</option>
                                            <option value="Diğer">Diğer</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="text-right">
                                    <button
                                        type="submit"
                                        className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-black rounded-lg shadow-xs transition"
                                    >
                                        {editingMaterial ? 'Malzemeyi Güncelle' : 'Malzemeyi Kütüphaneye Ekle'}
                                    </button>
                                </div>
                            </form>

                            {/* Mevcut Malzemeler Tablosu */}
                            <div>
                                <h4 className="font-black text-xs text-gray-700 dark:text-gray-300 mb-2">
                                    Kütüphanedeki Malzemeler ({materials.length})
                                </h4>
                                <div className="divide-y divide-gray-200 dark:divide-slate-700 border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden">
                                    {materials.map(mat => (
                                        <div key={mat.id} className="p-3 bg-white dark:bg-slate-800 flex justify-between items-center hover:bg-gray-50 dark:hover:bg-slate-700/60 transition text-xs">
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <strong className="text-gray-900 dark:text-white font-bold">{mat.name}</strong>
                                                    {mat.code && (
                                                        <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300">
                                                            {mat.code}
                                                        </span>
                                                    )}
                                                    <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.2 rounded">
                                                        {mat.category || 'Çelik'}
                                                    </span>
                                                </div>
                                                <div className="text-[11px] text-gray-400 mt-0.5 flex items-center gap-2 flex-wrap">
                                                    <span>Özgül Ağırlık: <strong className="text-gray-600 dark:text-slate-300">{mat.density} g/cm³</strong></span>
                                                    <span>•</span>
                                                    <span>Fiyat: <strong className="text-indigo-600 dark:text-indigo-400">{mat.pricePerKg} €/kg</strong></span>
                                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700/60 text-slate-500 dark:text-slate-300 font-semibold flex items-center gap-1">
                                                        <Clock className="w-3 h-3 text-slate-400" />
                                                        <span>{formatRelativeTime(mat.updatedAt || mat.updatedAtMs)} güncellendi</span>
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-1">
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setEditingMaterial(mat);
                                                        setMatFormData({
                                                            name: mat.name,
                                                            code: mat.code || '',
                                                            density: mat.density || 7.85,
                                                            pricePerKg: mat.pricePerKg || 0,
                                                            category: mat.category || 'Çelik'
                                                        });
                                                    }}
                                                    className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 transition"
                                                    title="Düzenle"
                                                >
                                                    <Edit3 className="w-3.5 h-3.5" />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleDeleteMaterial(mat.id)}
                                                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50 transition"
                                                    title="Sil"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* LIGHTBOX TAM EKRAN RESİM ÖNİZLEME MODALI */}
            <ImagePreviewModal
                isOpen={previewImage.isOpen}
                imageUrl={previewImage.url}
                title={previewImage.title}
                onClose={() => setPreviewImage({ isOpen: false, url: '', title: '' })}
            />
        </div>
    );
};

export default MachiningQuoteTab;
