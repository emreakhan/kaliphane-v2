// src/pages/ForkliftDashboard.js

import React, { useState, useEffect, useRef } from 'react';
import { 
    Truck, Package, MapPin, ScanLine, CheckCircle, ArrowRight 
} from 'lucide-react';
import { collection, query, onSnapshot, doc, updateDoc, getDoc } from '../config/firebase.js';
import { LOGISTICS_COLLECTION, LOGISTICS_STATUS, PROJECT_COLLECTION, OPERATION_STATUS, ROLES } from '../config/constants.js';
import { getCurrentDateTimeString } from '../utils/dateUtils.js';

const ForkliftDashboard = ({ db, loggedInUser }) => {
    const [tasks, setTasks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isScanning, setIsScanning] = useState(false);
    const [scannedCode, setScannedCode] = useState('');
    const [activeTask, setActiveTask] = useState(null); // Şuan taşınan görev

    // Barkod okuyucu için input referansı
    const scanInputRef = useRef(null);

    useEffect(() => {
        if (!db) return;
        
        // Görevleri çek (En eskiden en yeniye)
        const q = query(collection(db, LOGISTICS_COLLECTION));
        const unsub = onSnapshot(q, (snap) => {
            const allTasks = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => a.createdAt.localeCompare(b.createdAt));
            setTasks(allTasks);
            
            // Eğer operatörün halihazırda 'TAŞINIYOR' durumunda bir görevi varsa onu aktif yap
            const inTransitTask = allTasks.find(t => t.status === LOGISTICS_STATUS.IN_TRANSIT);
            setActiveTask(inTransitTask || null);
            setLoading(false);
        });

        return () => unsub();
    }, [db]);

    // Barkod okutma modunu aç
    const startScanning = () => {
        setIsScanning(true);
        setTimeout(() => {
            if (scanInputRef.current) scanInputRef.current.focus();
        }, 100);
    };

    // Fiziksel barkod okuyucu kodu okuduğunda tetiklenir (Enter'a basınca)
    const handleBarcodeSubmit = async (e) => {
        e.preventDefault();
        if (!scannedCode.trim()) return;

        // Okutulan QR Kod ile eşleşen 'BEKLİYOR' durumunda bir görev var mı bul
        const matchedTask = tasks.find(t => t.status === LOGISTICS_STATUS.PENDING && t.qrCode === scannedCode.trim());

        if (matchedTask) {
            try {
                // Lojistik Görevini Güncelle
                await updateDoc(doc(db, LOGISTICS_COLLECTION, matchedTask.id), {
                    status: LOGISTICS_STATUS.IN_TRANSIT,
                    pickedUpAt: getCurrentDateTimeString(),
                    operatorName: loggedInUser.name
                });
                alert("Barkod eşleşti! Taşıma işlemi başladı.");
            } catch (error) {
                console.error("Güncelleme hatası", error);
            }
        } else {
            alert("HATA: Okutulan barkoda ait bekleyen bir taşıma görevi bulunamadı!");
        }

        setScannedCode('');
        setIsScanning(false);
    };

    // İstasyona Bırakma ve Tamamlama İşlemi
    const handleDropOff = async () => {
        if (!activeTask) return;

        try {
            // 1. Lojistik Görevini Tamamla
            await updateDoc(doc(db, LOGISTICS_COLLECTION, activeTask.id), {
                status: LOGISTICS_STATUS.COMPLETED,
                completedAt: getCurrentDateTimeString()
            });

            // 2. Asıl Malzemenin Durumunu Güncelle (Proje içine girip malzemeyi bulmalıyız)
            if (activeTask.type === 'MATERIAL') {
                const moldRef = doc(db, PROJECT_COLLECTION, activeTask.moldId);
                const moldSnap = await getDoc(moldRef);
                
                if (moldSnap.exists()) {
                    const moldData = moldSnap.data();
                    const updatedMaterials = moldData.materials.map(m => {
                        if (m.id === activeTask.referenceId) {
                            return { ...m, status: OPERATION_STATUS.BUFFER_BEKLIYOR, statusUpdatedAt: getCurrentDateTimeString() };
                        }
                        return m;
                    });
                    await updateDoc(moldRef, { materials: updatedMaterials });
                }
            }

            alert("Görev Tamamlandı! İstasyona bırakıldı.");
            setActiveTask(null);
        } catch (error) {
            console.error("Teslimat hatası:", error);
            alert("Sistemsel bir hata oluştu.");
        }
    };

    if (loggedInUser.role !== ROLES.FORKLIFT_OPERATORU && loggedInUser.role !== ROLES.ADMIN) {
        return <div className="p-8 text-center font-bold text-red-500 text-xl">Bu sayfayı görmeye yetkiniz yok.</div>;
    }

    if (loading) return <div className="p-10 text-center animate-pulse text-xl font-bold">Lojistik Verileri Yükleniyor...</div>;

    const pendingTasks = tasks.filter(t => t.status === LOGISTICS_STATUS.PENDING);
    const completedTasks = tasks.filter(t => t.status === LOGISTICS_STATUS.COMPLETED).slice(-5); // Son 5 teslimat

    return (
        <div className="p-4 md:p-8 max-w-5xl mx-auto min-h-screen bg-gray-50 dark:bg-gray-900">
            
            <div className="bg-indigo-600 text-white p-6 rounded-2xl shadow-lg mb-8 flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-black flex items-center"><Truck className="w-10 h-10 mr-3" /> Forklift & Lojistik Paneli</h1>
                    <p className="text-indigo-100 mt-2 font-medium">Operatör: {loggedInUser.name}</p>
                </div>
            </div>

            {/* ŞU ANKİ AKTİF GÖREV (Devasa Kutu) */}
            {activeTask ? (
                <div className="bg-yellow-400 p-8 rounded-3xl shadow-2xl mb-8 transform transition-all border-4 border-yellow-500">
                    <div className="flex justify-between items-start mb-6">
                        <span className="bg-yellow-800 text-yellow-100 px-4 py-1.5 rounded-full text-sm font-black animate-pulse">TAŞINIYOR</span>
                    </div>
                    
                    <h2 className="text-4xl font-black text-yellow-900 mb-2">{activeTask.itemName}</h2>
                    <p className="text-xl font-bold text-yellow-800 mb-8">Kalıp: {activeTask.moldName}</p>

                    <div className="flex items-center justify-between bg-white/40 p-6 rounded-2xl mb-8">
                        <div className="text-center">
                            <p className="text-sm font-bold text-yellow-800 mb-1">Alınan Yer</p>
                            <p className="text-2xl font-black text-gray-900 flex items-center justify-center"><Package className="w-6 h-6 mr-2" /> {activeTask.fromLocation}</p>
                        </div>
                        <ArrowRight className="w-12 h-12 text-yellow-800 opacity-50" />
                        <div className="text-center">
                            <p className="text-sm font-bold text-yellow-800 mb-1">Götürülecek Hedef</p>
                            <p className="text-3xl font-black text-red-600 flex items-center justify-center"><MapPin className="w-8 h-8 mr-2" /> {activeTask.toLocation}</p>
                        </div>
                    </div>

                    <button 
                        onClick={handleDropOff}
                        className="w-full py-6 bg-green-600 hover:bg-green-700 active:bg-green-800 text-white rounded-2xl text-3xl font-black shadow-xl flex items-center justify-center transition-all"
                    >
                        <CheckCircle className="w-10 h-10 mr-3" /> İSTASYONA BIRAKTIM
                    </button>
                </div>
            ) : (
                /* BARKOD OKUMA EKRANI HOOK'U */
                isScanning ? (
                    <div className="bg-white dark:bg-gray-800 p-10 rounded-3xl shadow-xl mb-8 text-center border-4 border-blue-500">
                        <ScanLine className="w-24 h-24 text-blue-500 mx-auto mb-6 animate-pulse" />
                        <h2 className="text-3xl font-black text-gray-800 dark:text-white mb-4">Lütfen Barkodu Okutun</h2>
                        <p className="text-gray-500 mb-8">Fiziksel okuyucu ile malzemenin üzerindeki QR kodu okutun.</p>
                        
                        <form onSubmit={handleBarcodeSubmit}>
                            <input 
                                ref={scanInputRef}
                                type="text" 
                                value={scannedCode}
                                onChange={(e) => setScannedCode(e.target.value)}
                                className="w-full text-center p-4 border-2 border-gray-300 rounded-xl text-xl font-bold mb-6"
                                placeholder="Veya manuel ID girin..."
                                autoFocus
                            />
                            <div className="flex gap-4">
                                <button type="button" onClick={() => setIsScanning(false)} className="flex-1 py-4 bg-gray-200 text-gray-700 rounded-xl font-bold text-xl">İptal</button>
                                <button type="submit" className="flex-1 py-4 bg-blue-600 text-white rounded-xl font-bold text-xl">Doğrula</button>
                            </div>
                        </form>
                    </div>
                ) : (
                    /* BEKLEYEN GÖREVLER LİSTESİ */
                    <div className="mb-8">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-2xl font-black text-gray-800 dark:text-white">Bekleyen Görevler ({pendingTasks.length})</h2>
                            <button 
                                onClick={startScanning}
                                className="px-6 py-3 bg-blue-600 text-white font-black rounded-xl shadow-md hover:bg-blue-700 flex items-center transition-all"
                            >
                                <ScanLine className="w-6 h-6 mr-2" /> BARKOD OKUT VE AL
                            </button>
                        </div>

                        {pendingTasks.length === 0 ? (
                            <div className="bg-white dark:bg-gray-800 p-10 rounded-2xl shadow text-center text-gray-500 font-bold text-xl">
                                Şu an bekleyen bir taşıma görevi yok.
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {pendingTasks.map(task => (
                                    <div key={task.id} className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700">
                                        <div className="flex justify-between items-start mb-4">
                                            <span className="text-xs font-black bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-gray-600 dark:text-gray-300">{task.createdAt.split(' ')[1]}</span>
                                            <span className="text-xs font-black bg-blue-100 text-blue-800 px-2 py-1 rounded">{task.moldName}</span>
                                        </div>
                                        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">{task.itemName}</h3>
                                        <div className="flex items-center text-sm font-bold text-gray-600 dark:text-gray-400">
                                            <span className="text-red-500">{task.fromLocation}</span>
                                            <ArrowRight className="w-4 h-4 mx-3" />
                                            <span className="text-green-600">{task.toLocation}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )
            )}

            {/* GEÇMİŞ TESLİMATLAR */}
            {completedTasks.length > 0 && (
                <div>
                    <h2 className="text-xl font-black text-gray-800 dark:text-white mb-4">Son Teslimatlar</h2>
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                        {completedTasks.map(task => (
                            <div key={task.id} className="p-4 border-b last:border-0 border-gray-100 dark:border-gray-700 flex justify-between items-center opacity-70">
                                <div>
                                    <h4 className="font-bold text-gray-800 dark:text-white">{task.itemName}</h4>
                                    <p className="text-xs text-gray-500">{task.fromLocation} -> {task.toLocation}</p>
                                </div>
                                <span className="text-xs font-bold text-green-600 flex items-center"><CheckCircle className="w-3 h-3 mr-1" /> {task.completedAt?.split(' ')[1]}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default ForkliftDashboard;