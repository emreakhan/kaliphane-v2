// src/components/Shared/MaterialChecklistTab.js

import React, { useState, useRef, useEffect } from 'react';
import { 
    ListChecks, Plus, CheckCircle, Trash2, PackageCheck, PackageX, QrCode, FileSpreadsheet, ListPlus, Printer, Truck, Edit2
} from 'lucide-react'; 
import { collection, query, onSnapshot, doc, updateDoc, addDoc } from '../../config/firebase.js'; 
import { OPERATION_STATUS, MATERIAL_TYPES, PROJECT_COLLECTION, LOGISTICS_COLLECTION, LOGISTICS_STATUS, MACHINES_COLLECTION } from '../../config/constants.js';
import { getCurrentDateTimeString } from '../../utils/dateUtils.js';
import Modal from '../Modals/Modal.js';
import { QRCodeSVG } from 'qrcode.react';
import { useReactToPrint } from 'react-to-print';
import * as XLSX from 'xlsx';

// --- BARKOD ETİKETİ BİLEŞENİ (99mm x 99mm Kare Format) ---
const BarcodeLabel = React.forwardRef(({ material, moldName }, ref) => {
    if (!material) return null;
    const qrData = JSON.stringify({ id: material.id, proj: moldName, mat: material.name, erp: material.erpCode || '' });

    // 0 veya boş olmayan ölçüleri kontrol etme
    const hasEn = material.dimObj?.en && String(material.dimObj.en).trim() !== '0';
    const hasBoy = material.dimObj?.boy && String(material.dimObj.boy).trim() !== '0';
    const hasKal = material.dimObj?.kal && String(material.dimObj.kal).trim() !== '0';
    const hasCap = material.dimObj?.cap && String(material.dimObj.cap).trim() !== '0';
    const hasAnyDim = hasEn || hasBoy || hasKal || hasCap;

    // "Çelik Blok" veya gereksiz uzatmaları temizle
    const cleanName = material.name.replace(/ÇELİK BLOK/gi, '').replace(/CELIK BLOK/gi, '').trim();

    return (
        <div style={{ display: 'none' }}>
            <div ref={ref} style={{
                width: '99mm', height: '99mm', padding: '5mm 5mm 5mm 8mm', margin: '0', backgroundColor: 'white',
                display: 'flex', flexDirection: 'column', fontFamily: 'sans-serif', boxSizing: 'border-box', overflow: 'hidden'
            }}>
                {/* YAZICI AYARLARI İÇİN CSS (2. sayfaya taşmayı engeller) */}
                <style type="text/css" media="print">
                    {`@page { size: 99mm 99mm; margin: 0; } body { margin: 0; }`}
                </style>

                {/* EN ÜST: KALIP NUMARASI */}
                <div style={{ fontSize: '24px', fontWeight: '900', textAlign: 'center', textTransform: 'uppercase', borderBottom: '3px solid black', paddingBottom: '4px', marginBottom: '8px' }}>
                    {moldName}
                </div>

                {/* ORTA: KALIP YÜZEYİ VE MALZEME TÜRÜ */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
                    <div style={{ fontSize: '30px', fontWeight: '900', textAlign: 'center', textTransform: 'uppercase', lineHeight: '1.1', marginBottom: '8px' }}>
                        {material.moldSurface || 'YÜZEY BELİRTİLMEDİ'}
                    </div>
                    <div style={{ fontSize: '14px', fontWeight: 'bold', textAlign: 'center', color: '#222', textTransform: 'uppercase' }}>
                        {cleanName}
                    </div>
                </div>

                {/* ALT KISIM: SOLDA ÖLÇÜLER, SAĞDA BARKOD */}
                <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', borderTop: '3px solid black', paddingTop: '6px' }}>
                    
                    {/* SOL TARAFTA ÖLÇÜLER */}
                    <div style={{ fontSize: '16px', fontWeight: '900', lineHeight: '1.4', display: 'flex', flexDirection: 'column', flex: 1 }}>
                        {hasEn && <div>EN: {material.dimObj.en}</div>}
                        {hasBoy && <div>BOY: {material.dimObj.boy}</div>}
                        {hasKal && <div>KALINLIK: {material.dimObj.kal}</div>}
                        {hasCap && <div>ÇAP: {material.dimObj.cap}</div>}
                        {!hasAnyDim && (
                            <div style={{ fontSize: '12px', color: '#888' }}>Ölçü Yok</div>
                        )}
                    </div>

                    {/* SAĞ TARAFTA BARKOD */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingLeft: '5px' }}>
                        <QRCodeSVG value={qrData} size={75} level={"H"} />
                        <div style={{ fontSize: '9px', fontWeight: 'bold', marginTop: '3px' }}>{material.erpCode || material.id.substring(0,8).toUpperCase()}</div>
                    </div>

                </div>
            </div>
        </div>
    );
});

// --- BARKOD ÖNİZLEME MODALI (99mm x 99mm) ---
const BarcodePreviewModal = ({ isOpen, onClose, materials, moldName }) => {
    const contentRef = useRef(null);
    const handlePrint = useReactToPrint({ contentRef: contentRef, content: () => contentRef.current, documentTitle: `Etiketler_${moldName || 'Kalıp'}` });

    if (!isOpen || !materials || materials.length === 0) return null;

    // Her malzemeyi adeti kadar kopyalayarak listeye ekle
    const itemsToPrint = [];
    materials.forEach(mat => {
        const qty = parseInt(mat.quantity) || 1;
        for (let i = 0; i < qty; i++) {
            itemsToPrint.push(mat);
        }
    });

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Etiket Önizleme (${itemsToPrint.length} Adet Etiket)`}>
            <div className="flex flex-col items-center space-y-5">
                {/* Önizleme Alanı: Kaydırılabilir */}
                <div className="bg-gray-100 dark:bg-gray-700 p-4 rounded-xl flex flex-col items-center w-full max-h-[400px] overflow-y-auto gap-6 border dark:border-gray-600">
                    <p className="text-xs font-bold text-gray-500 dark:text-gray-400 text-center">Yazdırılacak toplam etiket adeti: {itemsToPrint.length}</p>
                    {itemsToPrint.map((material, idx) => {
                        const qrData = JSON.stringify({ id: material.id, proj: moldName, mat: material.name, erp: material.erpCode || '' });
                        const hasEn = material.dimObj?.en && String(material.dimObj.en).trim() !== '0';
                        const hasBoy = material.dimObj?.boy && String(material.dimObj.boy).trim() !== '0';
                        const hasKal = material.dimObj?.kal && String(material.dimObj.kal).trim() !== '0';
                        const hasCap = material.dimObj?.cap && String(material.dimObj.cap).trim() !== '0';
                        const hasAnyDim = hasEn || hasBoy || hasKal || hasCap;
                        const cleanName = material.name.replace(/ÇELİK BLOK/gi, '').replace(/CELIK BLOK/gi, '').trim();

                        return (
                            <div key={idx} className="border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg bg-white p-2 relative">
                                <span className="absolute top-1 right-2 text-[10px] font-black text-gray-400">Kopya: {idx + 1} / {itemsToPrint.length}</span>
                                <div style={{
                                    width: '99mm', height: '99mm', padding: '5mm 5mm 5mm 8mm', backgroundColor: '#FFFFFF',
                                    color: '#000000', display: 'flex', flexDirection: 'column', fontFamily: 'Arial, sans-serif', boxSizing: 'border-box', overflow: 'hidden'
                                }}>
                                    <div style={{ fontSize: '24px', fontWeight: '900', textAlign: 'center', textTransform: 'uppercase', borderBottom: '3px solid black', paddingBottom: '4px', marginBottom: '8px' }}>
                                        {moldName}
                                    </div>
                                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
                                        <div style={{ fontSize: '30px', fontWeight: '900', textAlign: 'center', textTransform: 'uppercase', lineHeight: '1.1', marginBottom: '8px' }}>
                                            {material.moldSurface || 'YÜZEY BELİRTİLMEDİ'}
                                        </div>
                                        <div style={{ fontSize: '14px', fontWeight: 'bold', textAlign: 'center', color: '#222', textTransform: 'uppercase' }}>
                                            {cleanName}
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', borderTop: '3px solid black', paddingTop: '6px' }}>
                                        <div style={{ fontSize: '16px', fontWeight: '900', lineHeight: '1.4', display: 'flex', flexDirection: 'column', flex: 1 }}>
                                            {hasEn && <div>EN: {material.dimObj.en}</div>}
                                            {hasBoy && <div>BOY: {material.dimObj.boy}</div>}
                                            {hasKal && <div>KALINLIK: {material.dimObj.kal}</div>}
                                            {hasCap && <div>ÇAP: {material.dimObj.cap}</div>}
                                            {!hasAnyDim && <div style={{ fontSize: '12px', color: '#888' }}>Ölçü Yok</div>}
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingLeft: '5px' }}>
                                            <QRCodeSVG value={qrData} size={75} level={"H"} />
                                            <div style={{ fontSize: '9px', fontWeight: 'bold', marginTop: '3px' }}>{material.erpCode || material.id.substring(0,8).toUpperCase()}</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* YAZDIRILACAK GERÇEK GİZLİ ALAN */}
                <div style={{ display: 'none' }}>
                    <div ref={contentRef}>
                        <style type="text/css" media="print">
                            {`
                            @page { size: 99mm 99mm; margin: 0; }
                            body { margin: 0; }
                            .page-break { page-break-after: always; break-after: page; }
                            `}
                        </style>
                        {itemsToPrint.map((material, idx) => {
                            const qrData = JSON.stringify({ id: material.id, proj: moldName, mat: material.name, erp: material.erpCode || '' });
                            const hasEn = material.dimObj?.en && String(material.dimObj.en).trim() !== '0';
                            const hasBoy = material.dimObj?.boy && String(material.dimObj.boy).trim() !== '0';
                            const hasKal = material.dimObj?.kal && String(material.dimObj.kal).trim() !== '0';
                            const hasCap = material.dimObj?.cap && String(material.dimObj.cap).trim() !== '0';
                            const hasAnyDim = hasEn || hasBoy || hasKal || hasCap;
                            const cleanName = material.name.replace(/ÇELİK BLOK/gi, '').replace(/CELIK BLOK/gi, '').trim();

                            return (
                                <div key={idx} className="page-break" style={{
                                    width: '99mm', height: '99mm', padding: '5mm 5mm 5mm 8mm', margin: '0', backgroundColor: '#FFFFFF',
                                    color: '#000000', display: 'flex', flexDirection: 'column', fontFamily: 'Arial, sans-serif', boxSizing: 'border-box', overflow: 'hidden'
                                }}>
                                    <div style={{ fontSize: '24px', fontWeight: '900', textAlign: 'center', textTransform: 'uppercase', borderBottom: '3px solid black', paddingBottom: '4px', marginBottom: '8px' }}>
                                        {moldName}
                                    </div>
                                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
                                        <div style={{ fontSize: '30px', fontWeight: '900', textAlign: 'center', textTransform: 'uppercase', lineHeight: '1.1', marginBottom: '8px' }}>
                                            {material.moldSurface || 'YÜZEY BELİRTİLMEDİ'}
                                        </div>
                                        <div style={{ fontSize: '14px', fontWeight: 'bold', textAlign: 'center', color: '#222', textTransform: 'uppercase' }}>
                                            {cleanName}
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', borderTop: '3px solid black', paddingTop: '6px' }}>
                                        <div style={{ fontSize: '16px', fontWeight: '900', lineHeight: '1.4', display: 'flex', flexDirection: 'column', flex: 1 }}>
                                            {hasEn && <div>EN: {material.dimObj.en}</div>}
                                            {hasBoy && <div>BOY: {material.dimObj.boy}</div>}
                                            {hasKal && <div>KALINLIK: {material.dimObj.kal}</div>}
                                            {hasCap && <div>ÇAP: {material.dimObj.cap}</div>}
                                            {!hasAnyDim && <div style={{ fontSize: '12px', color: '#888' }}>Ölçü Yok</div>}
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingLeft: '5px' }}>
                                            <QRCodeSVG value={qrData} size={75} level={"H"} />
                                            <div style={{ fontSize: '9px', fontWeight: 'bold', marginTop: '3px' }}>{material.erpCode || material.id.substring(0,8).toUpperCase()}</div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className="flex justify-end gap-3 w-full border-t dark:border-gray-700 pt-4">
                    <button onClick={onClose} className="px-5 py-2 text-gray-600 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 rounded-lg font-bold transition text-sm">İptal</button>
                    <button onClick={handlePrint} className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-md transition flex items-center text-sm"><Printer className="w-5 h-5 mr-2" /> Yazdır</button>
                </div>
            </div>
        </Modal>
    );
};

const MaterialChecklistTab = ({ mold, materials, canManageMaterials, loggedInUser, db }) => {
    // Manuel Malzeme Ekleme State
    const [isAddMaterialModalOpen, setIsAddMaterialModalOpen] = useState(false);
    const [newMaterial, setNewMaterial] = useState({ 
        name: '', type: MATERIAL_TYPES.CELIK, moldSurface: '', en: '', boy: '', kalinlik: '', cap: '', quantity: 1, erpCode: '' 
    });
    
    // Düzenleme State'i
    const [isEditMaterialModalOpen, setIsEditMaterialModalOpen] = useState(false);
    const [editingMaterial, setEditingMaterial] = useState(null);

    const [isSaving, setIsSaving] = useState(false);
    
    const [isBarcodePreviewOpen, setIsBarcodePreviewOpen] = useState(false);
    const [selectedMaterialsForPrint, setSelectedMaterialsForPrint] = useState([]);
    const [selectedMaterialIds, setSelectedMaterialIds] = useState([]);

    const [isErpModalOpen, setIsErpModalOpen] = useState(false);
    const [erpPreviewData, setErpPreviewData] = useState([]);

    const [machines, setMachines] = useState([]);
    const [isForkliftModalOpen, setIsForkliftModalOpen] = useState(false);
    const [selectedMaterialForForklift, setSelectedMaterialForForklift] = useState(null);
    const [selectedTargetMachine, setSelectedTargetMachine] = useState('');

    const listPrintRef = useRef(null);

    useEffect(() => {
        setSelectedMaterialIds([]);
    }, [mold.id]);

    const handlePrintList = useReactToPrint({ 
        contentRef: listPrintRef, 
        content: () => listPrintRef.current, 
        documentTitle: `Malzeme_Listesi_${mold?.moldName || 'Kalıp'}` 
    });

    const handleOpenBarcodePreview = (material) => { 
        setSelectedMaterialsForPrint([material]); 
        setIsBarcodePreviewOpen(true); 
    };

    useEffect(() => {
        const unsub = onSnapshot(query(collection(db, MACHINES_COLLECTION)), (snap) => {
            setMachines(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => a.name.localeCompare(b.name)));
        });
        return () => unsub();
    }, [db]);

    const formatDimensions = (en, boy, kal, cap) => {
        let dims = [];
        if (en && en !== '0') dims.push(`E:${en}`);
        if (boy && boy !== '0') dims.push(`B:${boy}`);
        if (kal && kal !== '0') dims.push(`K:${kal}`);
        if (cap && cap !== '0') dims.push(`Ç:${cap}`);
        return dims.join(' x ');
    };

    const handleAddMaterial = async () => {
        if (!newMaterial.name || !newMaterial.quantity) return alert("Malzeme adı ve adeti zorunludur.");
        setIsSaving(true);
        try {
            const safeEn = String(newMaterial.en).trim();
            const safeBoy = String(newMaterial.boy).trim();
            const safeKal = String(newMaterial.kalinlik).trim();
            const safeCap = String(newMaterial.cap).trim();

            const dimensionsStr = formatDimensions(safeEn, safeBoy, safeKal, safeCap);
            
            const materialEntry = {
                id: `mat-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                name: newMaterial.name, 
                type: newMaterial.type, 
                moldSurface: newMaterial.moldSurface.toUpperCase(),
                dimensions: dimensionsStr,
                dimObj: { en: safeEn, boy: safeBoy, kal: safeKal, cap: safeCap },
                quantity: parseInt(newMaterial.quantity), 
                status: OPERATION_STATUS.HAMMADDE_BEKLIYOR,
                addedAt: getCurrentDateTimeString(), 
                addedBy: loggedInUser.name, 
                erpCode: newMaterial.erpCode || ''
            };

            const moldRef = doc(db, PROJECT_COLLECTION, mold.id);
            await updateDoc(moldRef, { materials: [...materials, materialEntry] });
            
            setIsAddMaterialModalOpen(false);
            setNewMaterial({ name: '', type: MATERIAL_TYPES.CELIK, moldSurface: '', en: '', boy: '', kalinlik: '', cap: '', quantity: 1, erpCode: '' });
        } catch (error) { console.error(error); } finally { setIsSaving(false); }
    };

    const handleOpenEditModal = (mat) => {
        setEditingMaterial({
            ...mat,
            en: mat.dimObj?.en || '',
            boy: mat.dimObj?.boy || '',
            kalinlik: mat.dimObj?.kal || '',
            cap: mat.dimObj?.cap || ''
        });
        setIsEditMaterialModalOpen(true);
    };

    const handleSaveEditMaterial = async () => {
        if (!editingMaterial.name || !editingMaterial.quantity) return alert("Malzeme adı ve adeti zorunludur.");
        setIsSaving(true);
        try {
            const safeEn = String(editingMaterial.en).trim();
            const safeBoy = String(editingMaterial.boy).trim();
            const safeKal = String(editingMaterial.kalinlik).trim();
            const safeCap = String(editingMaterial.cap).trim();

            const dimensionsStr = formatDimensions(safeEn, safeBoy, safeKal, safeCap);

            const updatedMaterials = materials.map(m => m.id === editingMaterial.id ? {
                ...m,
                name: editingMaterial.name,
                type: editingMaterial.type,
                moldSurface: editingMaterial.moldSurface.toUpperCase(),
                dimensions: dimensionsStr,
                dimObj: { en: safeEn, boy: safeBoy, kal: safeKal, cap: safeCap },
                quantity: parseInt(editingMaterial.quantity),
                erpCode: editingMaterial.erpCode || ''
            } : m);

            const moldRef = doc(db, PROJECT_COLLECTION, mold.id);
            await updateDoc(moldRef, { materials: updatedMaterials });
            setIsEditMaterialModalOpen(false);
        } catch (error) { console.error(error); } finally { setIsSaving(false); }
    };

    const handleDeleteMaterial = async (materialId) => {
        if(!window.confirm("Bu malzemeyi silmek istediğinize emin misiniz?")) return;
        try {
            const moldRef = doc(db, PROJECT_COLLECTION, mold.id);
            await updateDoc(moldRef, { materials: materials.filter(m => m.id !== materialId) });
        } catch (error) { console.error(error); }
    };

    const handleUpdateMaterialStatus = async (materialId, newStatus) => {
        if (!canManageMaterials) return alert("Bu işlem için yetkiniz yok.");
        try {
            const updatedMaterials = materials.map(m => m.id === materialId ? { ...m, status: newStatus, statusUpdatedAt: getCurrentDateTimeString() } : m);
            const moldRef = doc(db, PROJECT_COLLECTION, mold.id);
            await updateDoc(moldRef, { materials: updatedMaterials });
        } catch (error) { console.error(error); }
    };

    const handleCallForklift = async () => {
        if (!selectedTargetMachine) return alert("Lütfen hedef tezgahı/istasyonu seçin.");
        setIsSaving(true);
        try {
            await addDoc(collection(db, LOGISTICS_COLLECTION), {
                type: 'MATERIAL',
                referenceId: selectedMaterialForForklift.id,
                moldId: mold.id,
                moldName: mold.moldName,
                itemName: selectedMaterialForForklift.name,
                dimensions: selectedMaterialForForklift.dimensions || '',
                fromLocation: 'DEPO',
                toLocation: selectedTargetMachine,
                status: LOGISTICS_STATUS.PENDING,
                qrCode: selectedMaterialForForklift.id,
                createdAt: getCurrentDateTimeString(),
                createdBy: loggedInUser.name
            });

            const updatedMaterials = materials.map(m => m.id === selectedMaterialForForklift.id ? { ...m, status: OPERATION_STATUS.TASIMA_BEKLIYOR } : m);
            const moldRef = doc(db, PROJECT_COLLECTION, mold.id);
            await updateDoc(moldRef, { materials: updatedMaterials });

            setIsForkliftModalOpen(false);
            setSelectedTargetMachine('');
            setSelectedMaterialForForklift(null);
            alert("Forklift görevi başarıyla oluşturuldu! Operatör yolda.");
        } catch (error) {
            console.error("Forklift çağırma hatası:", error);
            alert("Görev oluşturulamadı.");
        } finally {
            setIsSaving(false);
        }
    };



    // YENİ FORMATLI EXCEL VERİSİNİ OKUMA (Ölçü 0 ise atlama eklendi, Çap Eklendi)
    const handleExcelFileUpload = (e) => { 
        const file = e.target.files[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            const data = new Uint8Array(event.target.result); const workbook = XLSX.read(data, { type: 'array' });
            const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { raw: false, defval: '' });
            const parsedData = [];
            
            jsonData.forEach(row => {
                const obj = {}; Object.keys(row).forEach(k => { obj[k.toLowerCase().trim()] = String(row[k]).trim(); });
                
                const stokAdi = obj['stokadi'] || obj['stok_adi'] || obj['isim'] || obj['name'] || ''; 
                if (!stokAdi) return;

                const miktar = parseInt(obj['imiktar'] || obj['miktar'] || obj['adet'] || 1);
                
                const moldSurface = obj['kalıp yüzeyi'] || obj['kalipyuzeyi'] || obj['kalıp yuzeyi'] || obj['kalip yuzeyi'] || '';

                const rawEn = String(obj['en'] || '').trim();
                const rawBoy = String(obj['boy'] || '').trim();
                const rawKal = String(obj['kalinlik'] || '').trim();
                const rawCap = String(obj['çap'] || obj['cap'] || obj['discap'] || obj['iccap'] || '').trim();

                const en = (rawEn && rawEn !== '0') ? rawEn : '';
                const boy = (rawBoy && rawBoy !== '0') ? rawBoy : '';
                const kalinlik = (rawKal && rawKal !== '0') ? rawKal : '';
                const cap = (rawCap && rawCap !== '0') ? rawCap : '';

                const dimensionsStr = formatDimensions(en, boy, kalinlik, cap);
                
                const type = stokAdi.toUpperCase().includes('ÇELİK') || stokAdi.toUpperCase().includes('CELIK') ? MATERIAL_TYPES.CELIK : MATERIAL_TYPES.STANDART_ELEMAN;
                
                parsedData.push({ 
                    name: stokAdi, 
                    erpCode: obj['stokkodu'] || obj['kodu'] || '', 
                    type, 
                    moldSurface: moldSurface.toUpperCase(),
                    dimensions: dimensionsStr, 
                    dimObj: { en, boy, kal: kalinlik, cap }, 
                    quantity: isNaN(miktar) ? 1 : miktar 
                });
            });
            if (parsedData.length > 0) { setErpPreviewData(parsedData); setIsErpModalOpen(true); } else { alert("Uygun veri bulunamadı."); }
        };
        reader.readAsArrayBuffer(file); e.target.value = null;
    };

    const handleSaveErpData = async () => {
        setIsSaving(true);
        try {
            const newEntries = erpPreviewData.map((item, index) => ({
                id: `mat-erp-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 5)}`,
                name: item.name, 
                type: item.type, 
                moldSurface: item.moldSurface,
                dimensions: item.dimensions, 
                dimObj: item.dimObj,
                quantity: item.quantity,
                erpCode: item.erpCode, 
                status: OPERATION_STATUS.HAMMADDE_BEKLIYOR, 
                addedAt: getCurrentDateTimeString(), 
                addedBy: loggedInUser.name + ' (ERP)'
            }));
            await updateDoc(doc(db, PROJECT_COLLECTION, mold.id), { materials: [...materials, ...newEntries] });
            setIsErpModalOpen(false); setErpPreviewData([]);
        } catch (error) { console.error(error); } finally { setIsSaving(false); }
    };

    return (
        <div>
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-3">
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white flex items-center">
                    <ListChecks className="w-5 h-5 mr-2 text-indigo-600" /> Siparişi Verilen / Gelen Malzemeler
                </h3>
                <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                    {selectedMaterialIds.length > 0 && (
                        <button 
                            onClick={() => {
                                const selectedObjects = materials.filter(m => selectedMaterialIds.includes(m.id));
                                setSelectedMaterialsForPrint(selectedObjects);
                                setIsBarcodePreviewOpen(true);
                            }} 
                            className="flex items-center justify-center px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-black rounded-lg shadow-md transition flex-1 md:flex-none animate-bounce-short"
                        >
                            <QrCode className="w-4 h-4 mr-2" /> Seçilen Etiketleri Çıkar ({selectedMaterialIds.length})
                        </button>
                    )}
                    <button onClick={handlePrintList} className="flex items-center justify-center px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white text-sm font-bold rounded-lg shadow-md transition flex-1 md:flex-none">
                        <Printer className="w-4 h-4 mr-2" /> Listeyi Yazdır
                    </button>
                    {canManageMaterials && (
                        <>
                            <label className="flex items-center justify-center px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-lg shadow-md transition cursor-pointer flex-1 md:flex-none">
                                <FileSpreadsheet className="w-4 h-4 mr-2" /> ERP Yükle (.xlsx)
                                <input type="file" accept=".xlsx, .xls, .csv" className="hidden" onChange={handleExcelFileUpload} />
                            </label>
                            <button onClick={() => setIsAddMaterialModalOpen(true)} className="flex items-center justify-center px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-lg shadow-md transition flex-1 md:flex-none">
                                <Plus className="w-4 h-4 mr-2" /> Tekil Ekle
                            </button>
                        </>
                    )}
                </div>
            </div>

            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden shadow-sm overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-900/50">
                        <tr>
                            <th className="px-4 py-3 text-left w-10">
                                <input 
                                    type="checkbox"
                                    checked={materials.length > 0 && selectedMaterialIds.length === materials.length}
                                    onChange={(e) => {
                                        if (e.target.checked) {
                                            setSelectedMaterialIds(materials.map(m => m.id));
                                        } else {
                                            setSelectedMaterialIds([]);
                                        }
                                    }}
                                    className="rounded border-gray-300 dark:border-gray-600 text-indigo-600 focus:ring-indigo-500 bg-white dark:bg-gray-700"
                                />
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider">Malzeme Adı & Yüzeyi</th>
                            <th className="px-6 py-3 text-left text-xs font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider">Tür / Ölçü</th>
                            <th className="px-6 py-3 text-center text-xs font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider">Durum</th>
                            <th className="px-6 py-3 text-right text-xs font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider">İşlemler</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                        {materials.length === 0 ? (
                            <tr><td colSpan="5" className="px-6 py-8 text-center text-sm text-gray-500">Henüz malzeme kaydı girilmemiş.</td></tr>
                        ) : (
                            materials.map(mat => (
                                <tr key={mat.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition">
                                    <td className="px-4 py-4 whitespace-nowrap text-left">
                                        <input 
                                            type="checkbox"
                                            checked={selectedMaterialIds.includes(mat.id)}
                                            onChange={(e) => {
                                                if (e.target.checked) {
                                                    setSelectedMaterialIds([...selectedMaterialIds, mat.id]);
                                                } else {
                                                    setSelectedMaterialIds(selectedMaterialIds.filter(id => id !== mat.id));
                                                }
                                            }}
                                            className="rounded border-gray-300 dark:border-gray-600 text-indigo-600 focus:ring-indigo-500 bg-white dark:bg-gray-700"
                                        />
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-white">
                                        <div className="font-bold flex items-center">
                                            {mat.name} <span className="text-gray-500 text-xs ml-2">x{mat.quantity}</span>
                                        </div>
                                        {mat.moldSurface && (
                                            <div className="mt-1 inline-block bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 font-black text-[10px] px-2 py-0.5 rounded border border-indigo-100 dark:border-indigo-800">
                                                YÜZEY: {mat.moldSurface}
                                            </div>
                                        )}
                                        <div className="text-[10px] text-gray-400 font-normal mt-1">ID: {mat.id.substring(0,8)} {mat.erpCode && `| ERP: ${mat.erpCode}`}</div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                                        <span className="font-bold">{mat.type}</span> <br/>
                                        <span className="text-xs text-gray-500">{mat.dimensions || 'Ölçü Yok'}</span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-center">
                                        {mat.status === OPERATION_STATUS.HAMMADDE_BEKLIYOR && <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-orange-100 text-orange-800"><PackageX className="w-3.5 h-3.5 inline mr-1" /> Siparişte</span>}
                                        {mat.status === OPERATION_STATUS.DEPODA && <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-green-100 text-green-800"><PackageCheck className="w-3.5 h-3.5 inline mr-1" /> Depoda</span>}
                                        {mat.status === OPERATION_STATUS.TASIMA_BEKLIYOR && <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-blue-100 text-blue-800 animate-pulse"><Truck className="w-3.5 h-3.5 inline mr-1" /> Forklift Bekliyor</span>}
                                        {mat.status === OPERATION_STATUS.BUFFER_BEKLIYOR && <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-purple-100 text-purple-800"><CheckCircle className="w-3.5 h-3.5 inline mr-1" /> İstasyon'a Bırakıldı</span>}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        <div className="flex items-center justify-end gap-1.5">
                                            {canManageMaterials && mat.status === OPERATION_STATUS.HAMMADDE_BEKLIYOR && (
                                                <button onClick={() => handleUpdateMaterialStatus(mat.id, OPERATION_STATUS.DEPODA)} className="p-1.5 bg-green-50 text-green-600 hover:bg-green-100 rounded transition" title="Depoya Alındı">
                                                    <CheckCircle className="w-4 h-4" />
                                                </button>
                                            )}
                                            
                                            {(mat.status === OPERATION_STATUS.DEPODA || mat.status === OPERATION_STATUS.BUFFER_BEKLIYOR) && (
                                                <button 
                                                    onClick={() => { setSelectedMaterialForForklift(mat); setIsForkliftModalOpen(true); }}
                                                    className="p-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/30 rounded transition flex items-center"
                                                    title="Forklift Çağır / Transfer Et"
                                                >
                                                    <Truck className="w-4 h-4" />
                                                </button>
                                            )}

                                            <button onClick={() => handleOpenBarcodePreview(mat)} className="p-1.5 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded transition flex items-center" title="Etiket Yazdır">
                                                <QrCode className="w-4 h-4" />
                                            </button>

                                            {/* DÜZENLEME BUTONU */}
                                            {canManageMaterials && (
                                                <button onClick={() => handleOpenEditModal(mat)} className="p-1.5 bg-gray-50 text-gray-500 hover:bg-gray-100 rounded transition" title="Düzenle">
                                                    <Edit2 className="w-4 h-4" />
                                                </button>
                                            )}

                                            {canManageMaterials && (
                                                <button onClick={() => handleDeleteMaterial(mat.id)} className="p-1.5 text-red-500 hover:bg-red-50 rounded transition" title="Sil"><Trash2 className="w-4 h-4" /></button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* FORKLİFT HEDEF SEÇİM MODALI */}
            {isForkliftModalOpen && (
                <Modal isOpen={isForkliftModalOpen} onClose={() => setIsForkliftModalOpen(false)} title="Taşıma Hedefi Seç">
                    <div className="space-y-4">
                        <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 text-sm text-blue-800">
                            <strong>{selectedMaterialForForklift?.name}</strong> parçası için forklift operatörüne taşıma emri gönderilecektir.
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Nereye Götürülecek?</label>
                            <select 
                                value={selectedTargetMachine} 
                                onChange={(e) => setSelectedTargetMachine(e.target.value)}
                                className="w-full p-3 border rounded-lg bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 font-bold"
                            >
                                <option value="">Hedef Tezgah veya İstasyon Seçin...</option>
                                <option value="TEST_ALANI">Test Alanı</option>
                                <option value="MONTAJ_ALANI">Montaj Alanı</option>
                                {machines.map(m => <option key={m.id} value={m.name}>{m.name} ({m.category})</option>)}
                            </select>
                        </div>
                        <div className="pt-4 flex justify-end gap-3 border-t dark:border-gray-700">
                            <button onClick={() => setIsForkliftModalOpen(false)} className="px-5 py-2 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg font-bold text-sm">İptal</button>
                            <button onClick={handleCallForklift} disabled={isSaving || !selectedTargetMachine} className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-md transition disabled:opacity-50 text-sm">
                                {isSaving ? 'Gönderiliyor...' : 'Forklift Çağır'}
                            </button>
                        </div>
                    </div>
                </Modal>
            )}

            {/* YENİ MALZEME KAYDI MODALI */}
            {isAddMaterialModalOpen && (
                <Modal isOpen={isAddMaterialModalOpen} onClose={() => setIsAddMaterialModalOpen(false)} title="Yeni Malzeme Kaydı">
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Malzeme Türü</label>
                                <select 
                                    value={newMaterial.type} 
                                    onChange={(e) => setNewMaterial({...newMaterial, type: e.target.value})}
                                    className="w-full p-2.5 border rounded-lg bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 font-semibold text-sm"
                                >
                                    {Object.values(MATERIAL_TYPES).map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Adet <span className="text-red-500">*</span></label>
                                <input type="number" min="1" value={newMaterial.quantity} onChange={(e) => setNewMaterial({...newMaterial, quantity: e.target.value})} className="w-full p-2.5 border rounded-lg bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-sm text-center" />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Malzeme / Stok Adı <span className="text-red-500">*</span></label>
                            <input type="text" value={newMaterial.name} onChange={(e) => setNewMaterial({...newMaterial, name: e.target.value})} placeholder="Örn: 2738 Dişi Çekirdek Çeliği" className="w-full p-2.5 border rounded-lg bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-sm" />
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-indigo-600 dark:text-indigo-400 mb-1">Kalıp Yüzeyi (Hangi Parça?)</label>
                            <input type="text" value={newMaterial.moldSurface} onChange={(e) => setNewMaterial({...newMaterial, moldSurface: e.target.value})} placeholder="Örn: MAÇA 1, ERKEK ÇEKİRDEK..." className="w-full p-2.5 border border-indigo-200 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 dark:border-indigo-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 font-black text-sm uppercase" />
                        </div>

                        <div className="grid grid-cols-4 gap-2 border p-3 rounded-lg bg-gray-50 dark:bg-gray-800 dark:border-gray-700">
                            <div>
                                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">En</label>
                                <input type="number" value={newMaterial.en} onChange={(e) => setNewMaterial({...newMaterial, en: e.target.value})} className="w-full p-2 border rounded outline-none font-bold text-sm" />
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Boy</label>
                                <input type="number" value={newMaterial.boy} onChange={(e) => setNewMaterial({...newMaterial, boy: e.target.value})} className="w-full p-2 border rounded outline-none font-bold text-sm" />
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Kalınlık</label>
                                <input type="number" value={newMaterial.kalinlik} onChange={(e) => setNewMaterial({...newMaterial, kalinlik: e.target.value})} className="w-full p-2 border rounded outline-none font-bold text-sm" />
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Çap</label>
                                <input type="number" value={newMaterial.cap} onChange={(e) => setNewMaterial({...newMaterial, cap: e.target.value})} className="w-full p-2 border rounded outline-none font-bold text-sm" />
                            </div>
                        </div>

                        <div className="pt-4 flex justify-end gap-3 border-t dark:border-gray-700">
                            <button onClick={() => setIsAddMaterialModalOpen(false)} className="px-5 py-2 text-gray-600 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 rounded-lg font-bold transition text-sm">İptal</button>
                            <button onClick={handleAddMaterial} disabled={isSaving || !newMaterial.name || !newMaterial.quantity} className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-md transition disabled:opacity-50 text-sm">Listeye Ekle</button>
                        </div>
                    </div>
                </Modal>
            )}

            {/* MEVCUT MALZEMEYİ DÜZENLEME MODALI */}
            {isEditMaterialModalOpen && editingMaterial && (
                <Modal isOpen={isEditMaterialModalOpen} onClose={() => setIsEditMaterialModalOpen(false)} title="Malzeme Kaydını Düzenle">
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Malzeme Türü</label>
                                <select 
                                    value={editingMaterial.type} 
                                    onChange={(e) => setEditingMaterial({...editingMaterial, type: e.target.value})}
                                    className="w-full p-2.5 border rounded-lg bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 font-semibold text-sm"
                                >
                                    {Object.values(MATERIAL_TYPES).map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Adet <span className="text-red-500">*</span></label>
                                <input type="number" min="1" value={editingMaterial.quantity} onChange={(e) => setEditingMaterial({...editingMaterial, quantity: e.target.value})} className="w-full p-2.5 border rounded-lg bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-sm text-center" />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Malzeme / Stok Adı <span className="text-red-500">*</span></label>
                            <input type="text" value={editingMaterial.name} onChange={(e) => setEditingMaterial({...editingMaterial, name: e.target.value})} placeholder="Örn: 2738 Dişi Çekirdek Çeliği" className="w-full p-2.5 border rounded-lg bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-sm" />
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-indigo-600 dark:text-indigo-400 mb-1">Kalıp Yüzeyi (Hangi Parça?)</label>
                            <input type="text" value={editingMaterial.moldSurface} onChange={(e) => setEditingMaterial({...editingMaterial, moldSurface: e.target.value})} placeholder="Örn: MAÇA 1, ERKEK ÇEKİRDEK..." className="w-full p-2.5 border border-indigo-200 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 dark:border-indigo-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 font-black text-sm uppercase" />
                        </div>

                        <div className="grid grid-cols-4 gap-2 border p-3 rounded-lg bg-gray-50 dark:bg-gray-800 dark:border-gray-700">
                            <div>
                                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">En</label>
                                <input type="number" value={editingMaterial.en} onChange={(e) => setEditingMaterial({...editingMaterial, en: e.target.value})} className="w-full p-2 border rounded outline-none font-bold text-sm" />
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Boy</label>
                                <input type="number" value={editingMaterial.boy} onChange={(e) => setEditingMaterial({...editingMaterial, boy: e.target.value})} className="w-full p-2 border rounded outline-none font-bold text-sm" />
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Kalınlık</label>
                                <input type="number" value={editingMaterial.kalinlik} onChange={(e) => setEditingMaterial({...editingMaterial, kalinlik: e.target.value})} className="w-full p-2 border rounded outline-none font-bold text-sm" />
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Çap</label>
                                <input type="number" value={editingMaterial.cap} onChange={(e) => setEditingMaterial({...editingMaterial, cap: e.target.value})} className="w-full p-2 border rounded outline-none font-bold text-sm" />
                            </div>
                        </div>

                        <div className="pt-4 flex justify-end gap-3 border-t dark:border-gray-700">
                            <button onClick={() => setIsEditMaterialModalOpen(false)} className="px-5 py-2 text-gray-600 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 rounded-lg font-bold transition text-sm">İptal</button>
                            <button onClick={handleSaveEditMaterial} disabled={isSaving || !editingMaterial.name || !editingMaterial.quantity} className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-md transition disabled:opacity-50 text-sm">Değişiklikleri Kaydet</button>
                        </div>
                    </div>
                </Modal>
            )}

            {/* ERP ÖNİZLEME MODALI */}
            {isErpModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-5xl max-h-[80vh] shadow-2xl flex flex-col overflow-hidden">
                        <div className="p-4 border-b dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900">
                            <h2 className="text-lg font-black text-gray-800 dark:text-white flex items-center">
                                <ListPlus className="w-5 h-5 mr-2 text-emerald-600" /> ERP Verisi Önizleme ({erpPreviewData.length} Kayıt)
                            </h2>
                            <button onClick={() => {setIsErpModalOpen(false); setErpPreviewData([]);}} className="text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 p-1 rounded-md transition">✕</button>
                        </div>
                        <div className="p-0 overflow-y-auto flex-1 bg-gray-100 dark:bg-gray-900">
                            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                                <thead className="bg-gray-200 dark:bg-gray-700 sticky top-0 shadow-sm z-10">
                                    <tr>
                                        <th className="px-4 py-2 text-left text-xs font-black text-gray-600 dark:text-gray-300">Stok Kodu / İsim</th>
                                        <th className="px-4 py-2 text-left text-xs font-black text-indigo-600 dark:text-indigo-400">Kalıp Yüzeyi (Parça)</th>
                                        <th className="px-4 py-2 text-left text-xs font-black text-gray-600 dark:text-gray-300">Tür / Ölçüler</th>
                                        <th className="px-4 py-2 text-center text-xs font-black text-gray-600 dark:text-gray-300">Miktar</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                                    {erpPreviewData.map((item, idx) => (
                                        <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                                            <td className="px-4 py-2"><div className="text-xs font-bold text-gray-900 dark:text-white">{item.name}</div>{item.erpCode && <div className="text-[10px] text-gray-500">{item.erpCode}</div>}</td>
                                            <td className="px-4 py-2">
                                                {item.moldSurface ? <span className="text-xs font-black text-indigo-700 bg-indigo-50 px-2 py-1 rounded">{item.moldSurface}</span> : <span className="text-[10px] text-gray-400">-</span>}
                                            </td>
                                            <td className="px-4 py-2">
                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded mr-2 ${item.type === MATERIAL_TYPES.CELIK ? 'bg-orange-100 text-orange-800' : 'bg-blue-100 text-blue-800'}`}>{item.type}</span>
                                                <span className="text-xs font-mono text-gray-600 dark:text-gray-300">{item.dimensions || '-'}</span>
                                            </td>
                                            <td className="px-4 py-2 text-center text-sm font-black text-gray-800 dark:text-gray-200">{item.quantity}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div className="p-4 border-t dark:border-gray-700 bg-white dark:bg-gray-800 flex justify-between items-center">
                            <span className="text-xs text-gray-500 font-bold">⚠️ Sistem {erpPreviewData.length} adet geçerli satır buldu. Onaylıyor musunuz?</span>
                            <div className="flex gap-2">
                                <button onClick={() => {setIsErpModalOpen(false); setErpPreviewData([]);}} className="px-5 py-2 text-gray-600 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 rounded-lg font-bold transition text-sm">İptal</button>
                                <button onClick={handleSaveErpData} disabled={isSaving} className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow-md transition disabled:opacity-50 text-sm flex items-center"><CheckCircle className="w-4 h-4 mr-2" /> Onayla ve Ekle</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <BarcodePreviewModal isOpen={isBarcodePreviewOpen} onClose={() => setIsBarcodePreviewOpen(false)} materials={selectedMaterialsForPrint} moldName={mold.moldName} />
            
            {/* YENİ: YAZDIRILABİLİR MALZEME LİSTESİ ÇEK LİSTESİ (GİZLİ) */}
            <div style={{ display: 'none' }}>
                <div ref={listPrintRef} style={{ padding: '15mm', fontFamily: 'Arial, sans-serif', width: '210mm', color: '#000', backgroundColor: '#fff' }}>
                    <style type="text/css" media="print">
                        {`@page { size: A4 portrait; margin: 0; } body { margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }`}
                    </style>
                    <div style={{ textAlign: 'center', marginBottom: '20px', borderBottom: '2px solid #000', paddingBottom: '10px' }}>
                        <h2 style={{ margin: '0 0 5px 0', fontSize: '24px', textTransform: 'uppercase' }}>{mold?.moldName} - MALZEME LİSTESİ</h2>
                        <p style={{ margin: 0, fontSize: '14px', color: '#555' }}>Müşteri: {mold?.customer || 'Belirtilmedi'} | Çıktı Tarihi: {new Date().toLocaleDateString('tr-TR')}</p>
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                        <thead>
                            <tr style={{ backgroundColor: '#f0f0f0' }}>
                                <th style={{ border: '1px solid #000', padding: '8px', textAlign: 'left', width: '5%' }}>No</th>
                                <th style={{ border: '1px solid #000', padding: '8px', textAlign: 'left', width: '35%' }}>Malzeme Adı & Yüzeyi</th>
                                <th style={{ border: '1px solid #000', padding: '8px', textAlign: 'left', width: '25%' }}>Tür / Ölçü</th>
                                <th style={{ border: '1px solid #000', padding: '8px', textAlign: 'center', width: '10%' }}>Miktar</th>
                                <th style={{ border: '1px solid #000', padding: '8px', textAlign: 'center', width: '12.5%' }}>Geldi</th>
                                <th style={{ border: '1px solid #000', padding: '8px', textAlign: 'center', width: '12.5%' }}>Gelmedi</th>
                            </tr>
                        </thead>
                        <tbody>
                            {materials.map((mat, index) => (
                                <tr key={mat.id}>
                                    <td style={{ border: '1px solid #000', padding: '8px', textAlign: 'center' }}>{index + 1}</td>
                                    <td style={{ border: '1px solid #000', padding: '8px' }}>
                                        <strong>{mat.name}</strong>
                                        {mat.moldSurface && <div style={{ fontSize: '10px', marginTop: '2px' }}>YÜZEY: {mat.moldSurface}</div>}
                                        {mat.erpCode && <div style={{ fontSize: '10px', color: '#666', marginTop: '2px' }}>ERP: {mat.erpCode}</div>}
                                    </td>
                                    <td style={{ border: '1px solid #000', padding: '8px' }}>
                                        {mat.type}<br/>
                                        <span style={{ fontSize: '10px', color: '#555' }}>{mat.dimensions || 'Ölçü Yok'}</span>
                                    </td>
                                    <td style={{ border: '1px solid #000', padding: '8px', textAlign: 'center', fontWeight: 'bold' }}>
                                        {mat.quantity}
                                    </td>
                                    <td style={{ border: '1px solid #000', padding: '8px', textAlign: 'center', verticalAlign: 'middle' }}>
                                        <div style={{ width: '16px', height: '16px', border: '1px solid #000', margin: '0 auto' }}></div>
                                    </td>
                                    <td style={{ border: '1px solid #000', padding: '8px', textAlign: 'center', verticalAlign: 'middle' }}>
                                        <div style={{ width: '16px', height: '16px', border: '1px solid #000', margin: '0 auto' }}></div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {materials.length === 0 && (
                        <div style={{ textAlign: 'center', padding: '20px', border: '1px solid #000', borderTop: 'none' }}>
                            Malzeme bulunamadı.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default MaterialChecklistTab;