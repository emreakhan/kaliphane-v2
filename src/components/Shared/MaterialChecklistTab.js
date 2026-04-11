// src/components/Shared/MaterialChecklistTab.js

import React, { useState, useRef, useEffect } from 'react';
import { 
    ListChecks, Plus, CheckCircle, Trash2, PackageCheck, PackageX, QrCode, FileSpreadsheet, ListPlus, Loader, Printer, Truck, MapPin, Package, ArrowRight
} from 'lucide-react'; 
import { collection, query, onSnapshot, doc, updateDoc, addDoc, getDoc } from '../../config/firebase.js'; 
import { OPERATION_STATUS, MATERIAL_TYPES, PROJECT_COLLECTION, LOGISTICS_COLLECTION, LOGISTICS_STATUS, MACHINES_COLLECTION } from '../../config/constants.js';
import { getCurrentDateTimeString } from '../../utils/dateUtils.js';
import Modal from '../Modals/Modal.js';
import { QRCodeSVG } from 'qrcode.react';
import { useReactToPrint } from 'react-to-print';
import * as XLSX from 'xlsx';

// --- BARKOD ETİKETİ BİLEŞENİ (ARKA PLAN YEDEK) ---
const BarcodeLabel = React.forwardRef(({ material, moldName, customer }, ref) => {
    if (!material) return null;
    const qrData = JSON.stringify({ id: material.id, proj: moldName, mat: material.name, dim: material.dimensions, erp: material.erpCode || '' });

    return (
        <div style={{ display: 'none' }}>
            <div ref={ref} style={{
                width: '100mm', height: '50mm', padding: '4mm', margin: '0', backgroundColor: 'white',
                border: '1px solid black', display: 'flex', flexDirection: 'row', alignItems: 'center',
                justifyContent: 'space-between', fontFamily: 'sans-serif', boxSizing: 'border-box', pageBreakAfter: 'always'
            }}>
                <div style={{ flex: 1, paddingRight: '10px', display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'center' }}>
                    <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#555', textTransform: 'uppercase' }}>{customer || 'Müşteri'}</div>
                    <div style={{ fontSize: '14px', fontWeight: '900', color: '#000', marginBottom: '4px', textTransform: 'uppercase' }}>{moldName}</div>
                    <div style={{ width: '100%', height: '2px', backgroundColor: '#000', marginBottom: '4px' }}></div>
                    <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#000' }}>{material.name}</div>
                    <div style={{ fontSize: '10px', color: '#333', marginBottom: '2px' }}>Tür: {material.type}</div>
                    <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#000' }}>Ölçü: {material.dimensions || 'Belirtilmedi'}</div>
                    <div style={{ marginTop: 'auto', fontSize: '8px', color: '#888' }}>ID: {material.id.substring(0,8).toUpperCase()} {material.erpCode ? ` | ERP: ${material.erpCode}` : ''}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <QRCodeSVG value={qrData} size={85} level={"H"} />
                </div>
            </div>
        </div>
    );
});

// --- BARKOD ÖNİZLEME MODALI ---
const BarcodePreviewModal = ({ isOpen, onClose, material, moldName, customer }) => {
    const contentRef = useRef(null);
    const handlePrint = useReactToPrint({ contentRef: contentRef, content: () => contentRef.current, documentTitle: `Barkod_${material?.name || 'Malzeme'}` });

    if (!isOpen || !material) return null;
    const qrData = JSON.stringify({ id: material.id, proj: moldName, mat: material.name, dim: material.dimensions, erp: material.erpCode || '' });

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Barkod / Etiket Önizleme">
            <div className="flex flex-col items-center space-y-5">
                <div className="bg-gray-200 dark:bg-gray-700 p-6 rounded-xl flex justify-center w-full overflow-auto">
                    <div ref={contentRef} style={{
                        width: '100mm', height: '50mm', padding: '4mm', margin: '0', backgroundColor: '#FFFFFF',
                        color: '#000000', display: 'flex', flexDirection: 'row', alignItems: 'center',
                        justifyContent: 'space-between', fontFamily: 'Arial, sans-serif', boxSizing: 'border-box'
                    }}>
                        <div style={{ flex: 1, paddingRight: '10px', display: 'flex', flexDirection: 'column', height: '100%', justifyItems: 'flex-start' }}>
                            <div style={{ fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '2px' }}>{customer || 'MÜŞTERİ BELİRTİLMEDİ'}</div>
                            <div style={{ fontSize: '16px', fontWeight: '900', marginBottom: '4px', textTransform: 'uppercase', lineHeight: '1.1' }}>{moldName}</div>
                            <div style={{ width: '100%', height: '2px', backgroundColor: '#000000', marginBottom: '6px' }}></div>
                            <div style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '2px', lineHeight: '1.2' }}>{material.name}</div>
                            <div style={{ fontSize: '11px', marginBottom: '4px' }}>Tür: {material.type}</div>
                            <div style={{ fontSize: '12px', fontWeight: 'bold' }}>Ölçü: {material.dimensions || 'Belirtilmedi'}</div>
                            <div style={{ marginTop: 'auto', fontSize: '9px', fontWeight: 'bold' }}>ID: {material.id.substring(0,8).toUpperCase()} {material.erpCode ? `| ERP: ${material.erpCode}` : ''}</div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '35%' }}>
                            <QRCodeSVG value={qrData} size={90} level={"H"} />
                        </div>
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
    const [isAddMaterialModalOpen, setIsAddMaterialModalOpen] = useState(false);
    const [newMaterial, setNewMaterial] = useState({ name: '', type: MATERIAL_TYPES.CELIK, dimensions: '', quantity: 1, erpCode: '' });
    const [isSaving, setIsSaving] = useState(false);
    
    const [isBarcodePreviewOpen, setIsBarcodePreviewOpen] = useState(false);
    const [selectedMaterialForPrint, setSelectedMaterialForPrint] = useState(null);

    const [isErpModalOpen, setIsErpModalOpen] = useState(false);
    const [erpPreviewData, setErpPreviewData] = useState([]);

    const [machines, setMachines] = useState([]);
    const [isForkliftModalOpen, setIsForkliftModalOpen] = useState(false);
    const [selectedMaterialForForklift, setSelectedMaterialForForklift] = useState(null);
    const [selectedTargetMachine, setSelectedTargetMachine] = useState('');

    const printRef = useRef();

    useEffect(() => {
        const unsub = onSnapshot(query(collection(db, MACHINES_COLLECTION)), (snap) => {
            setMachines(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => a.name.localeCompare(b.name)));
        });
        return () => unsub();
    }, [db]);

    const handleAddMaterial = async () => {
        if (!newMaterial.name || !newMaterial.quantity) return alert("Malzeme adı ve adeti zorunludur.");
        setIsSaving(true);
        try {
            const materialEntry = {
                id: `mat-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                name: newMaterial.name, type: newMaterial.type, dimensions: newMaterial.dimensions,
                quantity: parseInt(newMaterial.quantity), status: OPERATION_STATUS.HAMMADDE_BEKLIYOR,
                addedAt: getCurrentDateTimeString(), addedBy: loggedInUser.name, erpCode: newMaterial.erpCode || ''
            };
            const moldRef = doc(db, PROJECT_COLLECTION, mold.id);
            await updateDoc(moldRef, { materials: [...materials, materialEntry] });
            setIsAddMaterialModalOpen(false);
            setNewMaterial({ name: '', type: MATERIAL_TYPES.CELIK, dimensions: '', quantity: 1, erpCode: '' });
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

    const handleOpenBarcodePreview = (material) => { setSelectedMaterialForPrint(material); setIsBarcodePreviewOpen(true); };

    const handleExcelFileUpload = (e) => { 
        const file = e.target.files[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            const data = new Uint8Array(event.target.result); const workbook = XLSX.read(data, { type: 'array' });
            const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { raw: false, defval: '' });
            const parsedData = [];
            jsonData.forEach(row => {
                const obj = {}; Object.keys(row).forEach(k => { obj[k.toLowerCase().trim()] = String(row[k]).trim(); });
                const stokAdi = obj['stokadi'] || obj['stok_adi'] || obj['isim'] || obj['name'] || ''; if (!stokAdi) return;
                const miktar = parseInt(obj['imiktar'] || obj['miktar'] || obj['adet'] || 1);
                let dims = [];
                if (obj['en'] && obj['en'] !== '0') dims.push(`E:${obj['en']}`);
                if (obj['boy'] && obj['boy'] !== '0') dims.push(`B:${obj['boy']}`);
                if (obj['kalinlik'] && obj['kalinlik'] !== '0') dims.push(`K:${obj['kalinlik']}`);
                const dimensionsStr = dims.length > 0 ? dims.join(' x ') : (obj['olculer'] || '');
                const type = stokAdi.toUpperCase().includes('ÇELİK') || stokAdi.toUpperCase().includes('CELIK') ? MATERIAL_TYPES.CELIK : MATERIAL_TYPES.STANDART_ELEMAN;
                parsedData.push({ name: stokAdi, erpCode: obj['stokkodu'] || '', type, dimensions: dimensionsStr, quantity: isNaN(miktar) ? 1 : miktar });
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
                name: item.name, type: item.type, dimensions: item.dimensions, quantity: item.quantity,
                erpCode: item.erpCode, status: OPERATION_STATUS.HAMMADDE_BEKLIYOR, addedAt: getCurrentDateTimeString(), addedBy: loggedInUser.name + ' (ERP)'
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
                {canManageMaterials && (
                    <div className="flex items-center gap-2 w-full md:w-auto">
                        <label className="flex items-center justify-center px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-lg shadow-md transition cursor-pointer flex-1 md:flex-none">
                            <FileSpreadsheet className="w-4 h-4 mr-2" /> ERP Yükle (.xlsx)
                            <input type="file" accept=".xlsx, .xls, .csv" className="hidden" onChange={handleExcelFileUpload} />
                        </label>
                        <button onClick={() => setIsAddMaterialModalOpen(true)} className="flex items-center justify-center px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-lg shadow-md transition flex-1 md:flex-none">
                            <Plus className="w-4 h-4 mr-2" /> Tekil Ekle
                        </button>
                    </div>
                )}
            </div>

            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden shadow-sm overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-900/50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider">Malzeme Adı</th>
                            <th className="px-6 py-3 text-left text-xs font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider">Tür / Ölçü</th>
                            <th className="px-6 py-3 text-center text-xs font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider">Durum</th>
                            <th className="px-6 py-3 text-right text-xs font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider">İşlemler</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                        {materials.length === 0 ? (
                            <tr><td colSpan="4" className="px-6 py-8 text-center text-sm text-gray-500">Henüz malzeme kaydı girilmemiş.</td></tr>
                        ) : (
                            materials.map(mat => (
                                <tr key={mat.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900 dark:text-white">
                                        {mat.name} <span className="text-gray-500 text-xs ml-2">x{mat.quantity}</span>
                                        <div className="text-[10px] text-gray-400 font-normal mt-0.5">ID: {mat.id.substring(0,8)} {mat.erpCode && `| ERP: ${mat.erpCode}`}</div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                                        {mat.type} <br/><span className="text-xs text-gray-500">{mat.dimensions || '-'}</span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-center">
                                        {mat.status === OPERATION_STATUS.HAMMADDE_BEKLIYOR && <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-orange-100 text-orange-800"><PackageX className="w-3.5 h-3.5 inline mr-1" /> Siparişte</span>}
                                        {mat.status === OPERATION_STATUS.DEPODA && <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-green-100 text-green-800"><PackageCheck className="w-3.5 h-3.5 inline mr-1" /> Depoda</span>}
                                        {mat.status === OPERATION_STATUS.TASIMA_BEKLIYOR && <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-blue-100 text-blue-800 animate-pulse"><Truck className="w-3.5 h-3.5 inline mr-1" /> Forklift Bekliyor</span>}
                                        {mat.status === OPERATION_STATUS.BUFFER_BEKLIYOR && <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-purple-100 text-purple-800"><CheckCircle className="w-3.5 h-3.5 inline mr-1" /> İstasyon'a Bırakıldı</span>}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        <div className="flex items-center justify-end gap-2">
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
                                                    <Truck className="w-4 h-4 mr-1" /> <span className="text-xs font-bold">Taşı</span>
                                                </button>
                                            )}

                                            {(mat.status === OPERATION_STATUS.DEPODA || mat.status === OPERATION_STATUS.TASIMA_BEKLIYOR || mat.status === OPERATION_STATUS.BUFFER_BEKLIYOR) && (
                                                <button onClick={() => handleOpenBarcodePreview(mat)} className="p-1.5 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded transition flex items-center" title="Etiket Yazdır">
                                                    <QrCode className="w-4 h-4 mr-1" /> <span className="text-xs font-bold">Barkod</span>
                                                </button>
                                            )}

                                            {canManageMaterials && (
                                                <button onClick={() => handleDeleteMaterial(mat.id)} className="p-1.5 text-red-500 hover:bg-red-50 rounded transition"><Trash2 className="w-4 h-4" /></button>
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

            {/* EKSİK OLAN MODALLAR EKLENDİ */}
            {isAddMaterialModalOpen && (
                <Modal isOpen={isAddMaterialModalOpen} onClose={() => setIsAddMaterialModalOpen(false)} title="Yeni Malzeme Kaydı">
                    <div className="space-y-4">
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
                            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Malzeme / Parça Adı <span className="text-red-500">*</span></label>
                            <input type="text" value={newMaterial.name} onChange={(e) => setNewMaterial({...newMaterial, name: e.target.value})} placeholder="Örn: 2738 Dişi Çekirdek Çeliği" className="w-full p-2.5 border rounded-lg bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-sm" />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Ölçüler (Opsiyonel)</label>
                                <input type="text" value={newMaterial.dimensions} onChange={(e) => setNewMaterial({...newMaterial, dimensions: e.target.value})} placeholder="Örn: E:400 B:500 K:120" className="w-full p-2.5 border rounded-lg bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-sm" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Adet</label>
                                <input type="number" min="1" value={newMaterial.quantity} onChange={(e) => setNewMaterial({...newMaterial, quantity: e.target.value})} className="w-full p-2.5 border rounded-lg bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-sm text-center" />
                            </div>
                        </div>
                        <div className="pt-4 flex justify-end gap-3 border-t dark:border-gray-700">
                            <button onClick={() => setIsAddMaterialModalOpen(false)} className="px-5 py-2 text-gray-600 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 rounded-lg font-bold transition text-sm">İptal</button>
                            <button onClick={handleAddMaterial} disabled={isSaving || !newMaterial.name || !newMaterial.quantity} className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-md transition disabled:opacity-50 text-sm">Listeye Ekle</button>
                        </div>
                    </div>
                </Modal>
            )}

            {isErpModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-4xl max-h-[80vh] shadow-2xl flex flex-col overflow-hidden">
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
                                        <th className="px-4 py-2 text-left text-xs font-black text-gray-600 dark:text-gray-300">Algılanan Tür</th>
                                        <th className="px-4 py-2 text-left text-xs font-black text-gray-600 dark:text-gray-300">Ölçüler</th>
                                        <th className="px-4 py-2 text-center text-xs font-black text-gray-600 dark:text-gray-300">Miktar</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                                    {erpPreviewData.map((item, idx) => (
                                        <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                                            <td className="px-4 py-2"><div className="text-xs font-bold text-gray-900 dark:text-white">{item.name}</div>{item.erpCode && <div className="text-[10px] text-indigo-500">{item.erpCode}</div>}</td>
                                            <td className="px-4 py-2"><span className={`text-[10px] font-bold px-2 py-0.5 rounded ${item.type === MATERIAL_TYPES.CELIK ? 'bg-orange-100 text-orange-800' : 'bg-blue-100 text-blue-800'}`}>{item.type}</span></td>
                                            <td className="px-4 py-2 text-xs font-mono text-gray-600 dark:text-gray-300">{item.dimensions || '-'}</td>
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

            <BarcodePreviewModal isOpen={isBarcodePreviewOpen} onClose={() => setIsBarcodePreviewOpen(false)} material={selectedMaterialForPrint} moldName={mold.moldName} customer={mold.customer} />
            <BarcodeLabel ref={printRef} material={selectedMaterialForPrint} moldName={mold.moldName} customer={mold.customer} />
        </div>
    );
};

export default MaterialChecklistTab;