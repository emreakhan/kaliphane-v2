// src/pages/ForkliftDashboard.js

import React, { useState, useEffect, useRef } from 'react';
import { 
    Truck, Package, MapPin, ScanLine, CheckCircle, ArrowRight, Camera, X, AlertTriangle, Clock, Check
} from 'lucide-react';
import { collection, query, onSnapshot, doc, updateDoc, getDoc } from '../config/firebase.js';
import { LOGISTICS_COLLECTION, LOGISTICS_STATUS, PROJECT_COLLECTION, OPERATION_STATUS, ROLES } from '../config/constants.js';
import { getCurrentDateTimeString } from '../utils/dateUtils.js';

// Hazır arayüzlü Scanner yerine, doğrudan kameraya hükmeden Çekirdek kütüphaneyi içeri alıyoruz
import { Html5Qrcode } from 'html5-qrcode';

const ForkliftDashboard = ({ db, loggedInUser }) => {
    const [tasks, setTasks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('active'); // 'active' | 'completed'
    
    const [isScanning, setIsScanning] = useState(false);
    const [scannedCode, setScannedCode] = useState('');
    const [activeTask, setActiveTask] = useState(null); 

    const tasksRef = useRef([]);

    useEffect(() => {
        if (!db) return;
        
        const q = query(collection(db, LOGISTICS_COLLECTION));
        const unsub = onSnapshot(q, (snap) => {
            const allTasks = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
            setTasks(allTasks);
            tasksRef.current = allTasks; 
            
            const inTransitTask = allTasks.find(t => t.status === LOGISTICS_STATUS.IN_TRANSIT);
            setActiveTask(inTransitTask || null);
            setLoading(false);
        });

        return () => unsub();
    }, [db]);

    // --- KAMERA OKUYUCU (QR) DOĞRUDAN ETKİLEŞİMİ ---
    useEffect(() => {
        let html5QrCode = null;

        if (isScanning) {
            html5QrCode = new Html5Qrcode("qr-reader");
            
            html5QrCode.start(
                { facingMode: "environment" },
                { 
                    fps: 10, 
                    qrbox: { width: 250, height: 250 },
                    aspectRatio: 1.0 
                },
                async (decodedText) => {
                    let targetId = decodedText.trim();
                    try {
                        const parsed = JSON.parse(targetId);
                        if (parsed && parsed.id) targetId = parsed.id;
                    } catch (e) { /* JSON değilse düz ID'dir */ }

                    const matchedTask = tasksRef.current.find(t => t.status !== LOGISTICS_STATUS.COMPLETED && t.qrCode === targetId);

                    if (matchedTask) {
                        if (html5QrCode.isScanning) {
                            await html5QrCode.stop().catch(e => console.error("Durdurma hatası", e));
                        }
                        
                        try {
                            await updateDoc(doc(db, LOGISTICS_COLLECTION, matchedTask.id), {
                                status: LOGISTICS_STATUS.IN_TRANSIT,
                                pickedUpAt: getCurrentDateTimeString(),
                                operatorName: loggedInUser?.name || 'Forklift Operatörü'
                            });
                            
                            setIsScanning(false);
                        } catch (error) {
                            console.error("Güncelleme hatası", error);
                            alert("Görev başlatılamadı!");
                        }
                    } else {
                        alert("HATA: Okutulan koda ait bekleyen bir taşıma görevi bulunamadı!");
                        if (html5QrCode.isScanning) {
                            await html5QrCode.pause(true);
                            setTimeout(() => {
                                if (html5QrCode.isScanning) html5QrCode.resume();
                            }, 2000);
                        }
                    }
                },
                (errorMessage) => { }
            ).catch(err => {
                console.error("Kamera başlatma hatası:", err);
            });
        }

        return () => {
            if (html5QrCode && html5QrCode.isScanning) {
                html5QrCode.stop().catch(e => console.log(e));
            }
        };
    }, [isScanning, loggedInUser?.name, db]);

    // Görev durumunu güncelleme (Taşınıyor, Malzeme Yok, Tamamlandı)
    const handleUpdateTaskStatus = async (taskId, newStatus) => {
        try {
            const updateData = {
                status: newStatus,
                updatedAt: getCurrentDateTimeString()
            };

            if (newStatus === LOGISTICS_STATUS.IN_TRANSIT) {
                updateData.pickedUpAt = getCurrentDateTimeString();
                updateData.operatorName = loggedInUser?.name || 'Forklift Operatörü';
            }

            if (newStatus === LOGISTICS_STATUS.COMPLETED) {
                updateData.completedAt = getCurrentDateTimeString();
            }

            await updateDoc(doc(db, LOGISTICS_COLLECTION, taskId), updateData);

            const targetTask = tasks.find(t => t.id === taskId);
            if (newStatus === LOGISTICS_STATUS.COMPLETED && targetTask && targetTask.type === 'MATERIAL') {
                const moldRef = doc(db, PROJECT_COLLECTION, targetTask.moldId);
                const moldSnap = await getDoc(moldRef);
                if (moldSnap.exists()) {
                    const moldData = moldSnap.data();
                    const updatedMaterials = (moldData.materials || []).map(m => {
                        if (m.id === targetTask.referenceId) {
                            return { ...m, status: OPERATION_STATUS.BUFFER_BEKLIYOR, statusUpdatedAt: getCurrentDateTimeString() };
                        }
                        return m;
                    });
                    await updateDoc(moldRef, { materials: updatedMaterials });
                }
            }

            if (newStatus === LOGISTICS_STATUS.COMPLETED) {
                alert("Görev başarıyla tamamlandı ve 'Tamamlananlar' sekmesine aktarıldı.");
            }
        } catch (error) {
            console.error("Durum güncelleme hatası:", error);
            alert("İşlem sırasında bir hata oluştu.");
        }
    };

    const handleDropOff = async () => {
        if (!activeTask) return;
        await handleUpdateTaskStatus(activeTask.id, LOGISTICS_STATUS.COMPLETED);
        setActiveTask(null);
    };

    const handleManualSubmit = async (e) => {
        e.preventDefault();
        if (!scannedCode.trim()) return;

        const matchedTask = tasks.find(t => t.status !== LOGISTICS_STATUS.COMPLETED && t.qrCode === scannedCode.trim());

        if (matchedTask) {
            try {
                await updateDoc(doc(db, LOGISTICS_COLLECTION, matchedTask.id), {
                    status: LOGISTICS_STATUS.IN_TRANSIT,
                    pickedUpAt: getCurrentDateTimeString(),
                    operatorName: loggedInUser?.name || 'Forklift Operatörü'
                });
                setScannedCode('');
                setIsScanning(false);
            } catch (error) {
                console.error("Güncelleme hatası", error);
            }
        } else {
            alert("HATA: Girdiğiniz ID ile aktif bir görev eşleşmedi!");
        }
    };

    if (loggedInUser.role !== ROLES.FORKLIFT_OPERATORU && loggedInUser.role !== ROLES.ADMIN) {
        return <div className="p-8 text-center font-bold text-red-500 text-xl">Bu sayfayı görmeye yetkiniz yok.</div>;
    }

    if (loading) return <div className="p-10 text-center animate-pulse text-xl font-bold">Lojistik Verileri Yükleniyor...</div>;

    const activeTasks = tasks.filter(t => t.status !== LOGISTICS_STATUS.COMPLETED);
    const completedTasks = tasks.filter(t => t.status === LOGISTICS_STATUS.COMPLETED);

    return (
        <div className="p-4 md:p-8 max-w-5xl mx-auto min-h-screen bg-gray-50 dark:bg-gray-900">
            
            {/* Header */}
            <div className="bg-indigo-600 text-white p-6 rounded-2xl shadow-lg mb-6 flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-black flex items-center"><Truck className="w-10 h-10 mr-3" /> Forklift & Lojistik</h1>
                    <p className="text-indigo-100 mt-2 font-medium">Operatör: {loggedInUser.name}</p>
                </div>
            </div>

            {/* Sekme Seçimi */}
            <div className="flex gap-2 mb-6 border-b border-gray-200 dark:border-gray-700 pb-3">
                <button 
                    onClick={() => setActiveTab('active')}
                    className={`px-5 py-3 rounded-xl font-black text-sm transition flex items-center gap-2 ${activeTab === 'active' ? 'bg-indigo-600 text-white shadow-md' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-100'}`}
                >
                    <Truck className="w-4 h-4" /> Aktif Taşıma Görevleri ({activeTasks.length})
                </button>
                <button 
                    onClick={() => setActiveTab('completed')}
                    className={`px-5 py-3 rounded-xl font-black text-sm transition flex items-center gap-2 ${activeTab === 'completed' ? 'bg-green-600 text-white shadow-md' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-100'}`}
                >
                    <CheckCircle className="w-4 h-4" /> Tamamlanan Görevler ({completedTasks.length})
                </button>
            </div>

            {activeTab === 'active' ? (
                <>
                    {activeTask && (
                        /* --- ANLIK TAŞINAN ÖNCELİKLİ GÖREV --- */
                        <div className="bg-yellow-400 p-6 md:p-8 rounded-3xl shadow-2xl mb-8 border-4 border-yellow-500 animate-in slide-in-from-top-4">
                            <div className="flex justify-between items-start mb-4">
                                <span className="bg-yellow-900 text-yellow-100 px-4 py-1.5 rounded-full text-xs font-black animate-pulse flex items-center">
                                    <Truck className="w-4 h-4 mr-1.5" /> ŞU AN TAŞINIYOR
                                </span>
                            </div>
                            
                            <h2 className="text-3xl md:text-4xl font-black text-yellow-950 mb-1">{activeTask.itemName}</h2>
                            <p className="text-lg font-bold text-yellow-900 mb-6">Kalıp: {activeTask.moldName}</p>

                            <div className="flex flex-col md:flex-row items-center justify-between bg-white/50 p-5 rounded-2xl mb-6 gap-4">
                                <div className="text-center w-full md:w-auto">
                                    <p className="text-xs font-bold text-yellow-900 mb-1">Nereden Alındı?</p>
                                    <p className="text-xl font-black text-gray-900 flex items-center justify-center"><Package className="w-5 h-5 mr-2" /> {activeTask.fromLocation}</p>
                                </div>
                                <ArrowRight className="hidden md:block w-10 h-10 text-yellow-900 opacity-50" />
                                <div className="text-center w-full md:w-auto mt-2 md:mt-0">
                                    <p className="text-xs font-bold text-yellow-900 mb-1">Nereye Götürülecek?</p>
                                    <p className="text-2xl font-black text-red-700 flex items-center justify-center"><MapPin className="w-6 h-6 mr-2" /> {activeTask.toLocation}</p>
                                </div>
                            </div>

                            <button 
                                onClick={handleDropOff}
                                className="w-full py-4 md:py-5 bg-green-600 hover:bg-green-700 active:scale-95 text-white rounded-2xl text-xl md:text-2xl font-black shadow-xl flex items-center justify-center transition-all"
                            >
                                <CheckCircle className="w-7 h-7 mr-3" /> İSTASYONA BIRAKTIM (TAMAMLAYIN)
                            </button>
                        </div>
                    )}

                    {isScanning ? (
                        /* --- KAMERA OKUMA EKRANI --- */
                        <div className="bg-white dark:bg-gray-800 p-6 md:p-10 rounded-3xl shadow-xl mb-8 text-center border-4 border-blue-500 relative">
                            <button 
                                onClick={() => setIsScanning(false)} 
                                className="absolute top-4 right-4 p-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded-full text-gray-600 dark:text-gray-300 transition"
                            >
                                <X className="w-6 h-6" />
                            </button>
                            
                            <h2 className="text-2xl md:text-3xl font-black text-gray-800 dark:text-white mb-2"><Camera className="w-8 h-8 inline mr-2 text-blue-500 mb-1"/> Barkodu Okutun</h2>
                            <p className="text-gray-500 dark:text-gray-400 mb-6 text-sm font-semibold">Kamera barkodu gördüğü an görev taşınmaya başlayacaktır.</p>
                            
                            <div className="mb-8 border-2 border-blue-100 dark:border-blue-900 rounded-xl overflow-hidden bg-black max-w-md mx-auto">
                                <div id="qr-reader" className="w-full"></div>
                            </div>

                            <div className="border-t dark:border-gray-700 pt-6 mt-4">
                                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Veya Barkod ID'sini Manuel Girin</p>
                                <form onSubmit={handleManualSubmit} className="flex gap-2 max-w-md mx-auto">
                                    <input 
                                        type="text" 
                                        value={scannedCode}
                                        onChange={(e) => setScannedCode(e.target.value)}
                                        className="flex-1 p-3 border-2 border-gray-300 dark:border-gray-600 rounded-xl font-bold bg-white dark:bg-gray-700 dark:text-white outline-none focus:border-blue-500 text-sm"
                                        placeholder="mat-12345..."
                                    />
                                    <button type="submit" disabled={!scannedCode.trim()} className="px-6 py-3 bg-gray-800 disabled:opacity-50 text-white rounded-xl font-bold transition text-sm">Başlat</button>
                                </form>
                            </div>
                        </div>
                    ) : (
                        /* --- AKTİF GÖREVLER LİSTESİ --- */
                        <div className="mb-8">
                            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                                <div>
                                    <h2 className="text-2xl font-black text-gray-800 dark:text-white">Aktif Görevler ({activeTasks.length})</h2>
                                    <p className="text-xs text-gray-500 font-bold mt-1">İşlemi tamamlanana kadar görevler bu listede kalır.</p>
                                </div>
                                <button 
                                    onClick={() => setIsScanning(true)}
                                    className="w-full md:w-auto px-5 py-3 bg-blue-600 text-white font-black rounded-xl shadow-lg hover:bg-blue-700 active:scale-95 flex items-center justify-center transition-all text-base"
                                >
                                    <Camera className="w-5 h-5 mr-2" /> KAMERAYI AÇ VE OKUT
                                </button>
                            </div>

                            {activeTasks.length === 0 ? (
                                <div className="bg-white dark:bg-gray-800 p-12 rounded-2xl shadow-sm text-center text-gray-500 font-bold text-lg border border-gray-200 dark:border-gray-700">
                                    Şu an aktif bekleyen bir taşıma görevi yok.
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {activeTasks.map(task => {
                                        const isMaterialMissing = task.status === LOGISTICS_STATUS.MALZEME_YOK;
                                        const isInTransit = task.status === LOGISTICS_STATUS.IN_TRANSIT;

                                        return (
                                            <div key={task.id} className={`bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-sm border-2 relative overflow-hidden transition-all ${isMaterialMissing ? 'border-red-400 bg-red-50/20' : (isInTransit ? 'border-yellow-400 bg-yellow-50/20' : 'border-gray-200 dark:border-gray-700')}`}>
                                                <div className={`absolute left-0 top-0 bottom-0 w-2 ${isMaterialMissing ? 'bg-red-500' : (isInTransit ? 'bg-yellow-500' : 'bg-blue-500')}`}></div>
                                                
                                                <div className="flex justify-between items-start mb-3 pl-2">
                                                    <span className="text-xs font-black bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-gray-600 dark:text-gray-300">
                                                        {task.createdAt ? (task.createdAt.split(' ')[1] || task.createdAt) : ''}
                                                    </span>
                                                    
                                                    {/* Durum Rozeti */}
                                                    {isInTransit ? (
                                                        <span className="bg-yellow-100 text-yellow-900 dark:bg-yellow-900/40 dark:text-yellow-300 font-black text-xs px-2.5 py-1 rounded-full animate-pulse border border-yellow-300 flex items-center gap-1">
                                                            <Truck className="w-3.5 h-3.5" /> TAŞINIYOR
                                                        </span>
                                                    ) : isMaterialMissing ? (
                                                        <span className="bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-300 font-black text-xs px-2.5 py-1 rounded-full border border-red-300 flex items-center gap-1">
                                                            <AlertTriangle className="w-3.5 h-3.5 text-red-600" /> MALZEME YOK
                                                        </span>
                                                    ) : (
                                                        <span className="bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 font-black text-xs px-2.5 py-1 rounded-full">
                                                            BEKLİYOR
                                                        </span>
                                                    )}
                                                </div>

                                                <div className="pl-2 mb-4">
                                                    <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider block">{task.moldName}</span>
                                                    <h3 className="text-xl font-extrabold text-gray-900 dark:text-white mt-0.5">{task.itemName}</h3>
                                                </div>

                                                <div className="flex items-center text-sm font-bold text-gray-700 dark:text-gray-300 pl-2 bg-gray-50 dark:bg-gray-700/50 p-2.5 rounded-xl border border-gray-100 dark:border-gray-600/50">
                                                    <span className="text-red-500 font-black flex items-center"><Package className="w-4 h-4 mr-1 text-red-400"/> {task.fromLocation}</span>
                                                    <ArrowRight className="w-4 h-4 mx-2 text-gray-400" />
                                                    <span className="text-green-600 font-black flex items-center"><MapPin className="w-4 h-4 mr-1 text-green-500"/> {task.toLocation}</span>
                                                </div>

                                                {/* MANUEL AKSİYON BUTONLARI (KART KAPANMAZ, TAMAMLAYINCA KAPANIR) */}
                                                <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-700 flex flex-wrap gap-2">
                                                    <button 
                                                        onClick={() => handleUpdateTaskStatus(task.id, LOGISTICS_STATUS.IN_TRANSIT)}
                                                        className={`flex-1 min-w-[100px] py-2 px-2.5 rounded-xl font-bold text-xs flex items-center justify-center transition border ${isInTransit ? 'bg-yellow-500 text-white border-yellow-600 shadow-sm' : 'bg-yellow-50 text-yellow-800 hover:bg-yellow-100 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-300 dark:border-yellow-800'}`}
                                                    >
                                                        <Truck className="w-3.5 h-3.5 mr-1" /> Taşınıyor
                                                    </button>
                                                    <button 
                                                        onClick={() => handleUpdateTaskStatus(task.id, LOGISTICS_STATUS.MALZEME_YOK)}
                                                        className={`flex-1 min-w-[100px] py-2 px-2.5 rounded-xl font-bold text-xs flex items-center justify-center transition border ${isMaterialMissing ? 'bg-red-600 text-white border-red-700 shadow-sm' : 'bg-red-50 text-red-700 hover:bg-red-100 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800'}`}
                                                    >
                                                        <AlertTriangle className="w-3.5 h-3.5 mr-1" /> Malzeme Yok
                                                    </button>
                                                    <button 
                                                        onClick={() => handleUpdateTaskStatus(task.id, LOGISTICS_STATUS.COMPLETED)}
                                                        className="flex-1 min-w-[110px] py-2 px-2.5 bg-green-600 hover:bg-green-700 active:scale-95 text-white rounded-xl font-black text-xs flex items-center justify-center shadow-md transition"
                                                    >
                                                        <CheckCircle className="w-3.5 h-3.5 mr-1" /> Tamamlandı
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}
                </>
            ) : (
                /* --- TAMAMLANAN GÖREVLER SEKME GÖRÜNÜMÜ --- */
                <div className="animate-in fade-in">
                    <h2 className="text-2xl font-black text-gray-800 dark:text-white mb-4 flex items-center">
                        <CheckCircle className="w-6 h-6 mr-2 text-green-500" /> Tamamlanan Görevler ({completedTasks.length})
                    </h2>
                    
                    {completedTasks.length === 0 ? (
                        <div className="bg-white dark:bg-gray-800 p-12 rounded-2xl shadow-sm text-center text-gray-500 font-bold text-lg border border-gray-200 dark:border-gray-700">
                            Henüz tamamlanmış bir taşıma görevi bulunmuyor.
                        </div>
                    ) : (
                        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden divide-y divide-gray-100 dark:divide-gray-700">
                            {completedTasks.map(task => (
                                <div key={task.id} className="p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-750 transition">
                                    <div>
                                        <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider block">{task.moldName}</span>
                                        <h4 className="font-extrabold text-gray-900 dark:text-white text-base">{task.itemName}</h4>
                                        <p className="text-xs text-gray-500 font-medium mt-0.5">
                                            {task.fromLocation} ➔ {task.toLocation}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-3 text-xs shrink-0">
                                        <span className="font-bold text-gray-500">Teslim Eden: {task.operatorName || 'Operatör'}</span>
                                        <span className="font-bold text-green-600 bg-green-50 dark:bg-green-900/30 px-3 py-1.5 rounded-full flex items-center border border-green-200 dark:border-green-800">
                                            <CheckCircle className="w-3.5 h-3.5 mr-1" /> {task.completedAt ? (task.completedAt.split(' ')[1] || task.completedAt) : 'Tamamlandı'}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default ForkliftDashboard;