// src/pages/CamOperatorDashboard.js

import React, { useState, useEffect } from 'react';
import { Clock, PlusCircle, LayoutDashboard, BarChart2, Save, Trash2, Calendar, FileText } from 'lucide-react';
import { collection, addDoc, query, onSnapshot, deleteDoc, doc } from '../config/firebase.js';
import CamOperatorAnalysis from './CamOperatorAnalysis.js';

const CamOperatorDashboard = ({ db, loggedInUser }) => {
    const [activeTab, setActiveTab] = useState('ENTRY');
    const [todayLogs, setTodayLogs] = useState([]);
    const [saving, setSaving] = useState(false);

    // Form State
    const [category, setCategory] = useState('CAM'); 
    const [entryDate, setEntryDate] = useState(new Date().toISOString().split('T')[0]);
    const [description, setDescription] = useState(''); 
    
    const [moldName, setMoldName] = useState('');
    const [partName, setPartName] = useState('');
    const [prepH, setPrepH] = useState('');
    const [prepM, setPrepM] = useState('');
    const [camH, setCamH] = useState('');
    const [camM, setCamM] = useState('');
    const [otherH, setOtherH] = useState('');
    const [otherM, setOtherM] = useState('');

    const [viewDate, setViewDate] = useState(new Date().toISOString().split('T')[0]);

    useEffect(() => {
        if (!db || !loggedInUser?.name) return;
        const q = query(collection(db, 'cam_operator_logs'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const allLogs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            const filteredAndSorted = allLogs
                .filter(log => log.operatorName === loggedInUser.name && log.date === viewDate)
                .sort((a, b) => b.timestamp - a.timestamp);
            setTodayLogs(filteredAndSorted);
        });
        return () => unsubscribe();
    }, [db, loggedInUser, viewDate]);

    const handleSaveLog = async () => {
        if (category === 'CAM' && (!moldName.trim() || !partName.trim())) return alert("Lütfen kalıp ve parça adını giriniz.");

        setSaving(true);
        try {
            const logData = {
                operatorName: loggedInUser.name,
                date: entryDate,
                category: category,
                description: description,
                timestamp: Date.now()
            };

            if (category === 'CAM') {
                logData.moldName = moldName;
                logData.partName = partName;
                logData.prepTime = (parseInt(prepH) || 0) * 60 + (parseInt(prepM) || 0);
                logData.camTime = (parseInt(camH) || 0) * 60 + (parseInt(camM) || 0);
            } else {
                logData.otherTime = (parseInt(otherH) || 0) * 60 + (parseInt(otherM) || 0);
            }

            await addDoc(collection(db, 'cam_operator_logs'), logData);

            // Formu Temizle (Kullanıcıya alert ile uyarı vermiyoruz, liste anında güncelleniyor)
            setMoldName(''); setPartName(''); setPrepH(''); setPrepM(''); setCamH(''); setCamM('');
            setDescription(''); setOtherH(''); setOtherM('');

        } catch (error) {
            alert("Kayıt sırasında bir hata oluştu.");
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteLog = async (id) => {
        if(window.confirm("Bu kaydı silmek istediğinize emin misiniz?")) {
            await deleteDoc(doc(db, 'cam_operator_logs', id));
        }
    };

    const formatMins = (mins) => {
        if (!mins) return '-';
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        return `${h > 0 ? h+'s ' : ''}${m}dk`;
    };

    return (
        <div className="p-4 md:p-8 max-w-7xl mx-auto min-h-screen bg-gray-100 dark:bg-gray-900 font-sans text-sm">
            
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-extrabold text-gray-900 dark:text-white flex items-center">
                    <Clock className="w-8 h-8 mr-3 text-blue-600" /> CAM Süre Takip Sistemi
                </h1>
            </div>

            <div className="flex bg-white dark:bg-gray-800 p-1 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 w-fit mb-6">
                <button onClick={() => setActiveTab('ENTRY')} className={`px-6 py-2.5 rounded-lg font-bold transition flex items-center ${activeTab === 'ENTRY' ? 'bg-blue-100 text-blue-800' : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
                    <LayoutDashboard className="w-4 h-4 mr-2" /> Zaman Girişi
                </button>
                <button onClick={() => setActiveTab('ANALYSIS')} className={`px-6 py-2.5 rounded-lg font-bold transition flex items-center ${activeTab === 'ANALYSIS' ? 'bg-indigo-100 text-indigo-800' : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
                    <BarChart2 className="w-4 h-4 mr-2" /> Analiz & Raporlar
                </button>
            </div>

            {activeTab === 'ANALYSIS' ? (
                <CamOperatorAnalysis db={db} />
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in">
                    
                    {/* SOL TARAF: FORM */}
                    <div className="lg:col-span-1 bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 h-fit">
                        <h2 className="text-lg font-bold mb-6 border-b pb-2 dark:text-white flex items-center">
                            <PlusCircle className="w-5 h-5 mr-2 text-blue-500"/> Yeni Kayıt
                        </h2>

                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 mb-1">Tarih</label>
                                    <input type="date" className="w-full p-2.5 border rounded-lg bg-gray-50 dark:bg-gray-700 dark:text-white outline-none" value={entryDate} onChange={e => setEntryDate(e.target.value)} />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 mb-1">İş Türü</label>
                                    <select className="w-full p-2.5 border rounded-lg bg-gray-50 dark:bg-gray-700 dark:text-white outline-none font-bold" value={category} onChange={e => setCategory(e.target.value)}>
                                        <option value="CAM">CAM İşleri</option>
                                        <option value="MEETING">Toplantı</option>
                                        <option value="OTHER">Diğer</option>
                                    </select>
                                </div>
                            </div>

                            {category === 'CAM' && (
                                <div className="space-y-4 p-4 bg-gray-50 dark:bg-gray-900/50 rounded-xl border dark:border-gray-700">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Kalıp Adı</label>
                                        <input type="text" className="w-full p-2.5 border rounded-lg dark:bg-gray-700 dark:text-white outline-none" value={moldName} onChange={e => setMoldName(e.target.value)} />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Parça Adı</label>
                                        <input type="text" className="w-full p-2.5 border rounded-lg dark:bg-gray-700 dark:text-white outline-none" value={partName} onChange={e => setPartName(e.target.value)} />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                                            <label className="block text-[10px] font-black text-blue-800 dark:text-blue-300 mb-1 uppercase">Hazırlık Süresi</label>
                                            <div className="flex gap-1">
                                                <input type="number" placeholder="Saat" className="w-full p-1.5 text-center border rounded outline-none" value={prepH} onChange={e => setPrepH(e.target.value)} />
                                                <input type="number" placeholder="Dk" className="w-full p-1.5 text-center border rounded outline-none" value={prepM} onChange={e => setPrepM(e.target.value)} />
                                            </div>
                                        </div>
                                        <div className="p-2 bg-green-50 dark:bg-green-900/20 rounded-lg">
                                            <label className="block text-[10px] font-black text-green-800 dark:text-green-300 mb-1 uppercase">CAM İşlem Süresi</label>
                                            <div className="flex gap-1">
                                                <input type="number" placeholder="Saat" className="w-full p-1.5 text-center border rounded outline-none" value={camH} onChange={e => setCamH(e.target.value)} />
                                                <input type="number" placeholder="Dk" className="w-full p-1.5 text-center border rounded outline-none" value={camM} onChange={e => setCamM(e.target.value)} />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {category !== 'CAM' && (
                                <div className="p-4 bg-orange-50 dark:bg-orange-900/20 rounded-xl border dark:border-gray-700">
                                    <label className="block text-xs font-bold text-orange-800 dark:text-orange-300 mb-2 uppercase">Harcanan Süre</label>
                                    <div className="flex gap-4">
                                        <input type="number" placeholder="Saat" className="w-full p-2.5 text-center border rounded-lg outline-none" value={otherH} onChange={e => setOtherH(e.target.value)} />
                                        <input type="number" placeholder="Dakika" className="w-full p-2.5 text-center border rounded-lg outline-none" value={otherM} onChange={e => setOtherM(e.target.value)} />
                                    </div>
                                </div>
                            )}

                            {/* AÇIKLAMA (ZORUNLULUK KALDIRILDI) */}
                            <div className="pt-2 border-t dark:border-gray-700">
                                <label className="flex items-center text-xs font-bold text-gray-500 dark:text-gray-400 mb-1 uppercase">
                                    <FileText className="w-3 h-3 mr-1"/> Açıklama / Not (İsteğe Bağlı)
                                </label>
                                <textarea 
                                    className="w-full p-3 border rounded-lg bg-gray-50 dark:bg-gray-700 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                                    rows="2"
                                    placeholder="Yapılan işin detayını buraya yazabilirsiniz..."
                                    value={description}
                                    onChange={e => setDescription(e.target.value)}
                                ></textarea>
                            </div>

                            <button onClick={handleSaveLog} disabled={saving} className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-xl shadow-lg flex items-center justify-center transition active:scale-95 disabled:opacity-50">
                                <Save className="w-5 h-5 mr-2" /> {saving ? 'KAYDEDİLİYOR...' : 'KAYDI TAMAMLA'}
                            </button>
                        </div>
                    </div>

                    {/* SAĞ TARAF: GEÇMİŞ */}
                    <div className="lg:col-span-2 flex flex-col gap-4">
                        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 flex-1 flex flex-col">
                            <div className="flex justify-between items-center mb-6 border-b pb-4">
                                <h2 className="text-lg font-bold dark:text-white">Kayıt İzleme</h2>
                                <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-700 p-2 rounded-xl">
                                    <Calendar className="w-4 h-4 text-gray-500" />
                                    <input type="date" className="bg-transparent border-none outline-none font-bold text-sm cursor-pointer dark:text-white" value={viewDate} onChange={e => setViewDate(e.target.value)} />
                                </div>
                            </div>
                            
                            <div className="space-y-3 overflow-y-auto pr-2 max-h-[650px]">
                                {todayLogs.length === 0 ? (
                                    <div className="text-center py-20 text-gray-400 font-medium">Bu tarihte henüz bir kayıt bulunmuyor.</div>
                                ) : (
                                    todayLogs.map(log => (
                                        <div key={log.id} className="p-4 rounded-xl border bg-white dark:bg-gray-800 shadow-sm flex flex-col sm:flex-row justify-between items-start gap-4">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2 mb-2">
                                                    <span className={`text-[9px] font-black px-2 py-0.5 rounded uppercase ${log.category === 'CAM' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>
                                                        {log.category}
                                                    </span>
                                                    <span className="text-[10px] text-gray-400">{new Date(log.timestamp).toLocaleTimeString('tr-TR')}</span>
                                                </div>
                                                {log.category === 'CAM' && <div className="font-bold text-gray-900 dark:text-white text-base">{log.moldName} <span className="text-gray-400 font-normal text-sm">/ {log.partName}</span></div>}
                                                {log.description && <p className="text-gray-600 dark:text-gray-300 text-sm mt-1 italic">"{log.description}"</p>}
                                            </div>
                                            <div className="flex items-center gap-4 shrink-0">
                                                {log.category === 'CAM' ? (
                                                    <>
                                                        <div className="text-center border-r pr-4">
                                                            <div className="text-[9px] text-gray-400 uppercase">Hazırlık</div>
                                                            <div className="font-mono font-bold text-blue-600">{formatMins(log.prepTime)}</div>
                                                        </div>
                                                        <div className="text-center">
                                                            <div className="text-[9px] text-gray-400 uppercase">İşlem</div>
                                                            <div className="font-mono font-bold text-green-600">{formatMins(log.camTime)}</div>
                                                        </div>
                                                    </>
                                                ) : (
                                                    <div className="text-center">
                                                        <div className="text-[9px] text-gray-400 uppercase">Süre</div>
                                                        <div className="font-mono font-bold text-orange-600">{formatMins(log.otherTime)}</div>
                                                    </div>
                                                )}
                                                <button onClick={() => handleDeleteLog(log.id)} className="p-2 text-gray-300 hover:text-red-500 transition"><Trash2 className="w-5 h-5"/></button>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>

                </div>
            )}
        </div>
    );
};

export default CamOperatorDashboard;