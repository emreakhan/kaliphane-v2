// src/pages/CncLiveStatusPage.js

import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot } from '../config/firebase';
import { 
    Monitor, Activity, AlertCircle, Clock, CheckCircle2, 
    Wifi, WifiOff, LayoutDashboard, Cpu
} from 'lucide-react';

const CncLiveStatusPage = ({ db }) => {
    const [machines, setMachines] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!db) return;

        // Python ajanının veri yazdığı koleksiyonu dinliyoruz
        const q = query(collection(db, "cnc_live_status"));
        
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const machineList = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setMachines(machineList);
            setLoading(false);
        }, (error) => {
            console.error("Firestore Dinleme Hatası:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [db]);

    // Duruma göre renk ve ikon belirleme yardımcı fonksiyonu
    const getStatusUI = (status) => {
        switch (status) {
            case 'CALISIYOR':
                return { color: 'text-green-500', bg: 'bg-green-500/10', border: 'border-green-500/20', icon: <CheckCircle2 className="w-5 h-5" />, label: 'Çalışıyor' };
            case 'ALARM':
                return { color: 'text-red-500', bg: 'bg-red-500/10', border: 'border-red-500/20', icon: <AlertCircle className="w-5 h-5" />, label: 'Alarm' };
            case 'BEKLIYOR':
                return { color: 'text-yellow-500', bg: 'bg-yellow-500/10', border: 'border-yellow-500/20', icon: <Clock className="w-5 h-5" />, label: 'Boşta' };
            default:
                return { color: 'text-gray-400', bg: 'bg-gray-400/10', border: 'border-gray-400/20', icon: <WifiOff className="w-5 h-5" />, label: 'Bağlantı Yok' };
        }
    };

    if (loading) {
        return (
            <div className="flex h-screen items-center justify-center bg-gray-100 dark:bg-gray-900">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
            </div>
        );
    }

    return (
        <div className="p-4 md:p-8 min-h-screen bg-gray-100 dark:bg-gray-900 font-sans">
            {/* Üst Başlık */}
            <div className="max-w-7xl mx-auto mb-8">
                <div className="flex items-center justify-between bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-sm border border-gray-200 dark:border-gray-700">
                    <div>
                        <h1 className="text-2xl md:text-3xl font-black text-gray-900 dark:text-white flex items-center">
                            <Monitor className="w-8 h-8 mr-3 text-blue-600" /> 
                            CNC Canlı İzleme Merkezi
                        </h1>
                        <p className="text-gray-500 dark:text-gray-400 mt-1 font-medium">Atölyedeki tezgahların anlık çalışma verileri.</p>
                    </div>
                    <div className="hidden md:flex items-center gap-4 bg-gray-50 dark:bg-gray-900 p-3 rounded-2xl border dark:border-gray-700">
                        <div className="flex flex-col items-end">
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Aktif Tezgah</span>
                            <span className="text-xl font-black text-blue-600">{machines.length}</span>
                        </div>
                        <LayoutDashboard className="w-8 h-8 text-blue-500/20" />
                    </div>
                </div>
            </div>

            {/* Tezgah Kartları Izgarası */}
            <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {machines.length === 0 ? (
                    <div className="col-span-full text-center py-20 bg-white dark:bg-gray-800 rounded-3xl border-2 border-dashed border-gray-300 dark:border-gray-700">
                        <WifiOff className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                        <p className="text-gray-500 font-bold uppercase tracking-widest">Veri Bekleniyor...</p>
                        <p className="text-gray-400 text-sm mt-1 text-center px-10">Lütfen Python Ajanının çalıştığından ve Firebase'e veri gönderdiğinden emin olun.</p>
                    </div>
                ) : (
                    machines.map((cnc) => {
                        const ui = getStatusUI(cnc.statusText);
                        return (
                            <div key={cnc.id} className="bg-white dark:bg-gray-800 rounded-3xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden transition-all hover:scale-[1.02] hover:shadow-xl">
                                {/* Kart Üst Kısmı */}
                                <div className={`p-6 ${ui.bg} border-b ${ui.border}`}>
                                    <div className="flex justify-between items-start">
                                        <div className="flex items-center gap-3">
                                            <div className={`p-3 rounded-2xl bg-white dark:bg-gray-900 shadow-sm ${ui.color}`}>
                                                <Cpu className="w-6 h-6" />
                                            </div>
                                            <div>
                                                <h3 className="text-lg font-black text-gray-900 dark:text-white uppercase leading-tight">{cnc.machineName || cnc.id}</h3>
                                                <div className="flex items-center text-[10px] font-bold text-gray-400 mt-1">
                                                    <Wifi className="w-3 h-3 mr-1" /> {cnc.ip}
                                                </div>
                                            </div>
                                        </div>
                                        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white dark:bg-gray-900 shadow-sm ${ui.color} font-black text-[10px] uppercase tracking-wider border ${ui.border}`}>
                                            {ui.icon} {ui.label}
                                        </div>
                                    </div>
                                </div>

                                {/* Kart Detayları */}
                                <div className="p-6 space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="bg-gray-50 dark:bg-gray-900 p-3 rounded-2xl border dark:border-gray-700">
                                            <span className="text-[9px] font-bold text-gray-400 uppercase block mb-1">Çalışma Modu</span>
                                            <span className="text-sm font-bold text-gray-700 dark:text-gray-200">{cnc.runStatus === 3 ? 'Otomatik' : 'Manuel/Duraklatıldı'}</span>
                                        </div>
                                        <div className="bg-gray-50 dark:bg-gray-900 p-3 rounded-2xl border dark:border-gray-700">
                                            <span className="text-[9px] font-bold text-gray-400 uppercase block mb-1">Acil Durum</span>
                                            <span className={`text-sm font-bold ${cnc.emergencyStatus === 1 ? 'text-red-500' : 'text-green-500'}`}>
                                                {cnc.emergencyStatus === 1 ? 'BASILI' : 'AÇIK'}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between pt-2 border-t dark:border-gray-700">
                                        <div className="flex items-center text-[10px] font-bold text-gray-400">
                                            <Clock className="w-3 h-3 mr-1.5" />
                                            Son Güncelleme: {cnc.lastUpdate ? cnc.lastUpdate.split(' ')[1] : '--:--'}
                                        </div>
                                        <div className="flex gap-1">
                                            <div className={`w-2 h-2 rounded-full animate-pulse ${ui.color.replace('text', 'bg')}`}></div>
                                            <div className={`w-2 h-2 rounded-full ${ui.color.replace('text', 'bg')} opacity-50`}></div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
};

export default CncLiveStatusPage;