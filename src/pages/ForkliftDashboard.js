// src/pages/ForkliftDashboard.js

import React, { useState, useEffect, useRef } from 'react';
import { 
    Truck, Package, MapPin, ScanLine, CheckCircle, ArrowRight, Camera 
} from 'lucide-react';
import { collection, query, onSnapshot, doc, updateDoc, getDoc } from '../config/firebase.js';
import { LOGISTICS_COLLECTION, LOGISTICS_STATUS, PROJECT_COLLECTION, OPERATION_STATUS, ROLES } from '../config/constants.js';
import { getCurrentDateTimeString } from '../utils/dateUtils.js';

// Kamera Okuyucu Kütüphanesi
import { Html5QrcodeScanner } from 'html5-qrcode';

const ForkliftDashboard = ({ db, loggedInUser }) => {
    const [tasks, setTasks] = useState([]);
    const [loading, setLoading] = useState(true);
    
    const [isScanning, setIsScanning] = useState(false);
    const [useCamera, setUseCamera] = useState(false);
    const [scannedCode, setScannedCode] = useState('');
    
    const [activeTask, setActiveTask] = useState(null); 

    const scanInputRef = useRef(null);

    useEffect(() => {
        if (!db) return;
        
        const q = query(collection(db, LOGISTICS_COLLECTION));
        const unsub = onSnapshot(q, (snap) => {
            const allTasks = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => a.createdAt.localeCompare(b.createdAt));
            setTasks(allTasks);
            
            const inTransitTask = allTasks.find(t => t.status === LOGISTICS_STATUS.IN_TRANSIT);
            setActiveTask(inTransitTask || null);
            setLoading(false);
        });

        return () => unsub();
    }, [db]);

    // --- KAMERA OKUYUCU (QR) ETKİLEŞİMİ ---
    useEffect(() => {
        let scanner = null;

        if (isScanning && useCamera) {
            scanner = new Html5QrcodeScanner(
                "qr-reader",
                { 
                    fps: 10, 
                    qrbox: { width: 250, height: 250 },
                    aspectRatio: 1.0, 
                    showTorchButtonIfSupported: true 
                },
                false
            );

            scanner.render(
                (decodedText) => {
                    // Kod başarıyla okunduğunda:
                    setScannedCode(decodedText);
                    setUseCamera(false); 
                    if (scanner) {
                        scanner.clear().catch(e => console.error(e));
                    }
                },
                (error) => {
                    // Okuma devam ederken anlık hataları yoksay
                }
            );
        }

        // Temizleme işlemi (Bileşen kapanırken kamerayı serbest bırak)
        return () => {
            if (scanner) {
                scanner.clear().catch(e => console.error("Kamera temizlenirken hata:", e));
            }
        };
    }, [isScanning, useCamera]);

    const startScanning = () => {
        setIsScanning(true);
        setUseCamera(false);
        setScannedCode('');
        setTimeout(() => {
            if (scanInputRef.current) scanInputRef.current.focus();
        }, 100);
    };

    const handleBarcodeSubmit = async (e) => {
        if (e) e.preventDefault();
        if (!scannedCode.trim()) return alert("Lütfen bir barkod okutun veya girin.");

        const matchedTask = tasks.find(t => t.status === LOGISTICS_STATUS.PENDING && t.qrCode === scannedCode.trim());

        if (matchedTask) {
            try {
                await updateDoc(doc(db, LOGISTICS_COLLECTION, matchedTask.id), {
                    status: LOGISTICS_STATUS.IN_TRANSIT,
                    pickedUpAt: getCurrentDateTimeString(),
                    operatorName: loggedInUser.name
                });
                alert("Barkod eşleşti! Taşıma işlemi başladı.");
                setScannedCode('');
                setIsScanning(false);
                setUseCamera(false);
            } catch (error) {
                console.error("Güncelleme hatası", error);
            }
        } else {
            alert("HATA: Okutulan barkoda ait bekleyen bir taşıma görevi bulunamadı!");
        }
    };

    const handleDropOff = async () => {
        if (!activeTask) return;

        try {
            await updateDoc(doc(db, LOGISTICS_COLLECTION, activeTask.id), {
                status: LOGISTICS_STATUS.COMPLETED,
                completedAt: getCurrentDateTimeString()
            });

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
    const completedTasks = tasks.filter(t => t.status === LOGISTICS_STATUS.COMPLETED).slice(-5);

    return (
        <div className="p-4 md:p-8 max-w-5xl mx-auto min-h-screen bg-gray-50 dark:bg-gray-900">
            
            {/* HTML5-QRCODE KÜTÜPHANESİ İÇİN ÖZEL STİL DOSYASI (Yazıların görünmez olmasını engeller) */}
            <style>{`
                #qr-reader {
                    border: none !important;
                    color: #1f2937;
                }
                @media (prefers-color-scheme: dark) {
                    #qr-reader { color: #f3f4f6; }
                }
                #qr-reader button {
                    background-color: #2563eb !important; 
                    color: white !important;
                    padding: 10px 20px !important;
                    border-radius: 8px !important;
                    border: none !important;
                    font-weight: bold !important;
                    margin: 10px 0 !important;
                    cursor: pointer !important;
                    transition: background-color 0.2s;
                }
                #qr-reader button:hover {
                    background-color: #1d4ed8 !important;
                }
                #qr-reader a {
                    color: #3b82f6 !important;
                    text-decoration: none !important;
                }
                #qr-reader__dashboard_section_csr span {
                    color: inherit !important;
                }
            `}</style>

            <div className="bg-indigo-600 text-white p-6 rounded-2xl shadow-lg mb-8 flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-black flex items-center"><Truck className="w-10 h-10 mr-3" /> Forklift & Lojistik</h1>
                    <p className="text-indigo-100 mt-2 font-medium">Operatör: {loggedInUser.name}</p>
                </div>
            </div>

            {activeTask ? (
                <div className="bg-yellow-400 p-8 rounded-3xl shadow-2xl mb-8 transform transition-all border-4 border-yellow-500">
                    <div className="flex justify-between items-start mb-6">
                        <span className="bg-yellow-800 text-yellow-100 px-4 py-1.5 rounded-full text-sm font-black animate-pulse">TAŞINIYOR</span>
                    </div>
                    
                    <h2 className="text-4xl font-black text-yellow-900 mb-2">{activeTask.itemName}</h2>
                    <p className="text-xl font-bold text-yellow-800 mb-8">Kalıp: {activeTask.moldName}</p>

                    <div className="flex flex-col md:flex-row items-center justify-between bg-white/40 p-6 rounded-2xl mb-8 gap-4">
                        <div className="text-center w-full md:w-auto">
                            <p className="text-sm font-bold text-yellow-800 mb-1">Alınan Yer</p>
                            <p className="text-2xl font-black text-gray-900 flex items-center justify-center"><Package className="w-6 h-6 mr-2" /> {activeTask.fromLocation}</p>
                        </div>
                        <ArrowRight className="hidden md:block w-12 h-12 text-yellow-800 opacity-50" />
                        <div className="text-center w-full md:w-auto mt-4 md:mt-0">
                            <p className="text-sm font-bold text-yellow-800 mb-1">Götürülecek Hedef</p>
                            <p className="text-3xl font-black text-red-600 flex items-center justify-center"><MapPin className="w-8 h-8 mr-2" /> {activeTask.toLocation}</p>
                        </div>
                    </div>

                    <button 
                        onClick={handleDropOff}
                        className="w-full py-6 bg-green-600 hover:bg-green-700 active:bg-green-800 text-white rounded-2xl text-2xl md:text-3xl font-black shadow-xl flex items-center justify-center transition-all"
                    >
                        <CheckCircle className="w-8 h-8 md:w-10 md:h-10 mr-3" /> İSTASYONA BIRAKTIM
                    </button>
                </div>
            ) : (
                isScanning ? (
                    <div className="bg-white dark:bg-gray-800 p-6 md:p-10 rounded-3xl shadow-xl mb-8 text-center border-4 border-blue-500">
                        <h2 className="text-2xl md:text-3xl font-black text-gray-800 dark:text-white mb-6">Barkod / QR Okut</h2>
                        
                        <div className="flex gap-2 mb-6 bg-gray-100 dark:bg-gray-700 p-1.5 rounded-xl">
                            <button 
                                type="button" 
                                onClick={() => { setUseCamera(false); setTimeout(() => scanInputRef.current?.focus(), 100); }} 
                                className={`flex-1 py-3 rounded-lg font-bold text-sm md:text-base flex items-center justify-center transition-colors ${!useCamera ? 'bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'}`}
                            >
                                <ScanLine className="w-5 h-5 mr-2"/> Tabanca (Fiziksel)
                            </button>
                            <button 
                                type="button" 
                                onClick={() => setUseCamera(true)} 
                                className={`flex-1 py-3 rounded-lg font-bold text-sm md:text-base flex items-center justify-center transition-colors ${useCamera ? 'bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'}`}
                            >
                                <Camera className="w-5 h-5 mr-2"/> Kamera ile Okut
                            </button>
                        </div>
                        
                        {useCamera ? (
                            <div className="mb-6 border-2 border-blue-100 dark:border-blue-900 rounded-xl overflow-hidden bg-white dark:bg-gray-800 p-4">
                                <div id="qr-reader" className="w-full max-w-md mx-auto"></div>
                            </div>
                        ) : (
                            <div className="mb-6">
                                <ScanLine className="w-16 h-16 text-blue-500 mx-auto mb-4 animate-pulse" />
                                <p className="text-gray-500 dark:text-gray-400 mb-4 text-sm">Fiziksel okuyucu ile malzemenin üzerindeki QR kodu okutun.</p>
                            </div>
                        )}

                        <form onSubmit={handleBarcodeSubmit}>
                            <input 
                                ref={scanInputRef}
                                type="text" 
                                value={scannedCode}
                                onChange={(e) => setScannedCode(e.target.value)}
                                className={`w-full text-center p-4 border-2 border-gray-300 dark:border-gray-600 rounded-xl text-xl font-bold mb-6 bg-white dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none ${useCamera ? 'opacity-50' : ''}`}
                                placeholder="Barkod kodu buraya düşecek..."
                                autoFocus={!useCamera}
                            />
                            <div className="flex flex-col md:flex-row gap-4">
                                <button type="button" onClick={() => {setIsScanning(false); setUseCamera(false);}} className="flex-1 py-4 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-xl font-bold text-lg md:text-xl transition">İptal</button>
                                <button type="submit" disabled={!scannedCode.trim()} className="flex-1 py-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl font-bold text-lg md:text-xl transition">Görevi Doğrula ve Başla</button>
                            </div>
                        </form>
                    </div>
                ) : (
                    <div className="mb-8">
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                            <h2 className="text-2xl font-black text-gray-800 dark:text-white">Bekleyen Görevler ({pendingTasks.length})</h2>
                            <button 
                                onClick={startScanning}
                                className="w-full md:w-auto px-6 py-4 bg-blue-600 text-white font-black rounded-xl shadow-md hover:bg-blue-700 flex items-center justify-center transition-all text-lg"
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

            {completedTasks.length > 0 && (
                <div>
                    <h2 className="text-xl font-black text-gray-800 dark:text-white mb-4">Son Teslimatlar</h2>
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                        {completedTasks.map(task => (
                            <div key={task.id} className="p-4 border-b last:border-0 border-gray-100 dark:border-gray-700 flex flex-col md:flex-row justify-between items-start md:items-center opacity-70 gap-2">
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