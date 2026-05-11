// src/components/Analysis/CamOperatorEvaluationTab.js

import React, { useState, useEffect, useMemo } from 'react';
import { 
    User, Award, Star, Clock, Activity, Box, Lock, Save, X, ThumbsUp, Calendar, Filter
} from 'lucide-react';
import { collection, query, onSnapshot, doc, updateDoc } from '../../config/firebase';

const CamOperatorEvaluationTab = ({ db, loggedInUser }) => {
    const [logs, setLogs] = useState([]);
    const [selectedOperator, setSelectedOperator] = useState('');
    const [evaluatingLogId, setEvaluatingLogId] = useState(null);
    const [evalForm, setEvalForm] = useState({ setupRating: '', camRating: '', score: 5 });
    const [isSaving, setIsSaving] = useState(false);
    const [loading, setLoading] = useState(true);
    
    // Tarih Filtresi State (Varsayılan boş - tümünü gösterir)
    const [filterDate, setFilterDate] = useState('');

    // YETKİ KONTROLÜ
    const userRole = (loggedInUser?.role || "").toUpperCase().trim();
    const isAdminOrSupervisor = 
        userRole === 'ADMIN' || 
        userRole === 'YÖNETİCİ' || 
        userRole === 'MANAGER' || 
        userRole === 'SORUMLU' || 
        userRole === 'SUPERVISOR' ||
        userRole.includes('ADMIN') ||
        userRole.includes('YÖNET');

    // Verileri Dinle
    useEffect(() => {
        if (!db) return;

        const q = query(collection(db, 'cam_operator_logs'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const allLogs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            const camLogs = allLogs.filter(log => 
                log.category === 'CAM' || !log.category
            ).sort((a, b) => b.timestamp - a.timestamp);
            
            setLogs(camLogs);
            setLoading(false);
        }, (err) => {
            console.error("Firestore Hatası:", err);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [db]);

    // Operatör Listesi
    const operators = useMemo(() => {
        const uniqueOps = new Set();
        logs.forEach(l => { if (l.operatorName) uniqueOps.add(l.operatorName); });
        return Array.from(uniqueOps).sort();
    }, [logs]);

    // Seçili Operatörün Verileri (Tarih Filtreli)
    const operatorLogs = useMemo(() => {
        if (!selectedOperator) return [];
        let filtered = logs.filter(l => l.operatorName === selectedOperator);
        if (filterDate) {
            filtered = filtered.filter(l => l.date === filterDate);
        }
        return filtered;
    }, [logs, selectedOperator, filterDate]);

    // İstatistikler (Ayrıştırılmış Dağılım)
    const operatorStats = useMemo(() => {
        const allOperatorLogs = logs.filter(l => l.operatorName === selectedOperator);
        if (!allOperatorLogs.length) return null;

        const evaluated = allOperatorLogs.filter(l => l.evaluation);
        const avgScore = evaluated.length > 0 
            ? (evaluated.reduce((acc, curr) => acc + (curr.evaluation.score || 0), 0) / evaluated.length).toFixed(1) 
            : 0;
        
        // Hazırlık ve CAM ayrı ayrı sayılacak
        const setupCounts = { cokIyi: 0, yeterli: 0, yetersiz: 0 };
        const camCounts = { cokIyi: 0, yeterli: 0, yetersiz: 0 };

        evaluated.forEach(l => {
            const r = l.evaluation;
            // Hazırlık Dağılımı
            if (r.setupRating === 'Çok İyi') setupCounts.cokIyi++;
            else if (r.setupRating === 'Yeterli') setupCounts.yeterli++;
            else if (r.setupRating === 'Yetersiz') setupCounts.yetersiz++;
            
            // CAM Dağılımı
            if (r.camRating === 'Çok İyi') camCounts.cokIyi++;
            else if (r.camRating === 'Yeterli') camCounts.yeterli++;
            else if (r.camRating === 'Yetersiz') camCounts.yetersiz++;
        });

        return {
            total: allOperatorLogs.length,
            evaluatedCount: evaluated.length,
            pendingCount: allOperatorLogs.length - evaluated.length,
            avgScore,
            setupCounts,
            camCounts
        };
    }, [logs, selectedOperator]);

    const handleSaveEvaluation = async (logId) => {
        if (!evalForm.setupRating || !evalForm.camRating) {
            return alert("Lütfen hazırlık ve işleme değerlendirmelerini seçin.");
        }
        
        setIsSaving(true);
        try {
            const evaluationData = {
                setupRating: evalForm.setupRating,
                camRating: evalForm.camRating,
                score: evalForm.score,
                evaluatedBy: loggedInUser?.name || 'Yönetici',
                evaluatedAt: new Date().toISOString()
            };

            await updateDoc(doc(db, 'cam_operator_logs', logId), { evaluation: evaluationData });
            setEvaluatingLogId(null);
            alert("Değerlendirme kaydedildi!");
        } catch (error) {
            alert("Hata: " + error.message);
        } finally {
            setIsSaving(false);
        }
    };

    const formatMins = (mins) => {
        if (!mins) return '0dk';
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        return `${h > 0 ? h+'s ' : ''}${m}dk`;
    };

    if (!isAdminOrSupervisor) {
        return (
            <div className="flex flex-col items-center justify-center p-20 bg-gray-900 rounded-3xl border border-red-900/30">
                <Lock className="w-16 h-16 text-red-500 mb-4 opacity-50" />
                <h3 className="text-xl font-bold text-white">Bu sekmeyi görmeye yetkiniz yok.</h3>
                <p className="text-gray-500 mt-2">Sistem rolünüz: {loggedInUser?.role}</p>
            </div>
        );
    }

    const DistributionBlock = ({ title, counts, totalEvaluated, icon: Icon, color }) => (
        <div className="bg-[#111827] rounded-3xl p-5 border border-gray-800 shadow-lg">
            <h4 className={`text-${color}-500 text-[10px] font-black uppercase tracking-widest mb-5 flex items-center`}>
                <Icon className="w-3 h-3 mr-2" /> {title}
            </h4>
            <div className="space-y-4">
                {[
                    { key: 'cokIyi', label: 'Çok İyi', barColor: 'bg-green-500', textColor: 'text-green-400' },
                    { key: 'yeterli', label: 'Yeterli', barColor: 'bg-blue-500', textColor: 'text-blue-400' },
                    { key: 'yetersiz', label: 'Yetersiz', barColor: 'bg-red-500', textColor: 'text-red-400' }
                ].map(item => {
                    const count = counts[item.key];
                    const percent = totalEvaluated > 0 ? (count / totalEvaluated) * 100 : 0;
                    return (
                        <div key={item.key}>
                            <div className="flex justify-between text-[11px] font-bold mb-1.5">
                                <span className="text-gray-400">{item.label}</span>
                                <span className={item.textColor}>{count} İş</span>
                            </div>
                            <div className="w-full bg-gray-800/50 rounded-full h-1.5 overflow-hidden">
                                <div className={`${item.barColor} h-full transition-all duration-1000 shadow-[0_0_8px_rgba(0,0,0,0.5)]`} style={{ width: `${percent}%` }}></div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );

    const RatingButton = ({ label, value, currentVal, onClick }) => (
        <button 
            onClick={() => onClick(value)}
            className={`flex-1 py-3 text-[11px] font-black rounded-xl border-2 transition-all ${
                currentVal === value 
                ? (value === 'Çok İyi' ? 'bg-green-500/20 border-green-500 text-green-400 shadow-[0_0_15px_rgba(34,197,94,0.2)]' : value === 'Yeterli' ? 'bg-blue-500/20 border-blue-500 text-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.2)]' : 'bg-red-500/20 border-red-500 text-red-400 shadow-[0_0_15px_rgba(239,68,68,0.2)]')
                : 'bg-gray-800 border-gray-700 text-gray-500 hover:border-gray-600 hover:text-gray-400'
            }`}
        >
            {label}
        </button>
    );

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Üst Seçici Panel */}
            <div className="bg-[#111827] p-6 rounded-3xl border border-gray-800 flex flex-col md:flex-row justify-between items-center gap-6 shadow-2xl">
                <div className="flex items-center gap-4">
                    <div className="bg-indigo-500/10 p-3 rounded-2xl border border-indigo-500/20">
                        <Award className="w-8 h-8 text-indigo-500" />
                    </div>
                    <div>
                        <h2 className="text-2xl font-black text-white tracking-tight">Performans Değerlendirme</h2>
                        <p className="text-gray-500 text-sm font-bold">CAM operatör işlerini süre ve verimlilik bazlı puanlayın.</p>
                    </div>
                </div>
                
                <div className="w-full md:w-80 relative group">
                    <User className="absolute left-4 top-4 text-gray-500 w-5 h-5 group-focus-within:text-indigo-500 transition-colors" />
                    <select 
                        value={selectedOperator} 
                        onChange={(e) => { setSelectedOperator(e.target.value); setEvaluatingLogId(null); }}
                        className="w-full pl-12 pr-4 py-4 bg-gray-800 border border-gray-700 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 font-black text-white appearance-none cursor-pointer transition-all shadow-inner"
                    >
                        <option value="">Operatör Seçiniz...</option>
                        {operators.map(op => <option key={op} value={op}>{op}</option>)}
                    </select>
                </div>
            </div>

            {selectedOperator && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    {/* SOL PANEL: AYRILMIŞ İSTATİSTİKLER */}
                    <div className="lg:col-span-4 space-y-6">
                        {/* Genel Puan Kartı */}
                        <div className="bg-gradient-to-br from-indigo-600 to-purple-700 rounded-3xl p-8 text-white shadow-xl relative overflow-hidden group">
                            <Star className="absolute -right-8 -bottom-8 w-40 h-40 opacity-10 group-hover:rotate-12 transition-transform duration-700" />
                            <h3 className="text-indigo-100 font-bold text-[10px] uppercase tracking-[0.2em]">Genel Verimlilik</h3>
                            <div className="text-7xl font-black mt-2 flex items-baseline tracking-tighter">
                                {operatorStats?.avgScore || '0'}
                                <span className="text-2xl opacity-40 ml-2 font-bold">/10</span>
                            </div>
                            <div className="mt-8 grid grid-cols-2 gap-4 border-t border-white/10 pt-6">
                                <div>
                                    <div className="text-indigo-200 text-[10px] font-black uppercase">Puanlanan</div>
                                    <div className="text-2xl font-black">{operatorStats?.evaluatedCount} İş</div>
                                </div>
                                <div>
                                    <div className="text-indigo-200 text-[10px] font-black uppercase">Kalan</div>
                                    <div className="text-2xl font-black text-orange-300">{operatorStats?.pendingCount} İş</div>
                                </div>
                            </div>
                        </div>

                        {/* Hazırlık Performansı */}
                        <DistributionBlock 
                            title="Hazırlık Süresi Dağılımı" 
                            counts={operatorStats?.setupCounts} 
                            totalEvaluated={operatorStats?.evaluatedCount}
                            icon={Clock}
                            color="blue"
                        />

                        {/* CAM Performansı */}
                        <DistributionBlock 
                            title="CAM İşleme Dağılımı" 
                            counts={operatorStats?.camCounts} 
                            totalEvaluated={operatorStats?.evaluatedCount}
                            icon={Activity}
                            color="green"
                        />
                    </div>

                    {/* SAĞ PANEL: FİLTRELENEBİLİR İŞ LİSTESİ */}
                    <div className="lg:col-span-8 space-y-6">
                        {/* Tarih Filtresi */}
                        <div className="bg-[#111827] p-4 rounded-2xl border border-gray-800 flex items-center justify-between shadow-lg">
                            <div className="flex items-center gap-3">
                                <Filter className="w-4 h-4 text-indigo-500" />
                                <span className="text-xs font-black text-gray-400 uppercase tracking-widest">Kayıt Filtrele</span>
                            </div>
                            <div className="flex items-center gap-3">
                                {filterDate && (
                                    <button 
                                        onClick={() => setFilterDate('')}
                                        className="text-[10px] font-black text-red-400 hover:text-red-300 uppercase transition-colors mr-2"
                                    >
                                        Temizle
                                    </button>
                                )}
                                <div className="relative">
                                    <Calendar className="absolute left-3 top-2.5 w-4 h-4 text-gray-500" />
                                    <input 
                                        type="date" 
                                        value={filterDate}
                                        onChange={(e) => setFilterDate(e.target.value)}
                                        className="bg-gray-800 border border-gray-700 text-white text-xs font-bold rounded-xl pl-9 pr-3 py-2 outline-none focus:ring-1 focus:ring-indigo-500 transition-all cursor-pointer"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="space-y-4 max-h-[800px] overflow-y-auto pr-2 custom-scrollbar pb-10">
                            {operatorLogs.length === 0 ? (
                                <div className="text-center py-20 bg-[#111827] rounded-3xl border border-dashed border-gray-800">
                                    <Box className="w-12 h-12 text-gray-700 mx-auto mb-4 opacity-20" />
                                    <div className="text-gray-600 font-black uppercase tracking-widest text-sm">Eşleşen Kayıt Bulunamadı</div>
                                </div>
                            ) : (
                                operatorLogs.map(log => (
                                    <div key={log.id} className={`p-6 rounded-3xl border-2 transition-all duration-300 ${evaluatingLogId === log.id ? 'border-indigo-500 bg-indigo-500/5 shadow-2xl' : log.evaluation ? 'border-gray-800 bg-[#111827] hover:border-gray-700' : 'border-dashed border-orange-500/30 bg-orange-500/5 hover:bg-orange-500/10'}`}>
                                        
                                        <div className="flex flex-col md:flex-row justify-between items-start gap-6">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-3 mb-4">
                                                    <span className="bg-gray-800 text-gray-400 text-[10px] font-black px-3 py-1 rounded-full border border-gray-700 flex items-center shadow-sm">
                                                        <Calendar className="w-3 h-3 mr-1.5" /> {log.date}
                                                    </span>
                                                    {log.machineName && (
                                                        <span className="bg-indigo-500/10 text-indigo-400 text-[10px] font-black px-3 py-1 rounded-full border border-indigo-500/20 flex items-center shadow-sm">
                                                            <Activity className="w-3 h-3 mr-1.5" /> {log.machineName}
                                                        </span>
                                                    )}
                                                </div>
                                                <h4 className="text-2xl font-black text-white mb-1 tracking-tight">{log.moldName}</h4>
                                                <p className="text-gray-500 font-bold text-sm mb-5 flex items-center"><Box className="w-3.5 h-3.5 mr-2 text-indigo-500/50" /> {log.partName}</p>
                                                
                                                <div className="flex gap-4">
                                                    <div className="bg-gray-800/40 p-4 rounded-2xl border border-gray-700/50 shadow-inner min-w-[100px]">
                                                        <span className="text-[9px] text-gray-500 font-black uppercase block mb-1">Hazırlık</span>
                                                        <span className="text-base font-mono font-black text-blue-400">{formatMins(log.prepTime)}</span>
                                                    </div>
                                                    <div className="bg-gray-800/40 p-4 rounded-2xl border border-gray-700/50 shadow-inner min-w-[100px]">
                                                        <span className="text-[9px] text-gray-500 font-black uppercase block mb-1">CAM İşleme</span>
                                                        <span className="text-base font-mono font-black text-green-400">{formatMins(log.camTime)}</span>
                                                    </div>
                                                </div>
                                            </div>

                                            {!evaluatingLogId && log.evaluation && (
                                                <div className="bg-indigo-500/5 p-5 rounded-3xl border border-indigo-500/20 text-center min-w-[140px] shadow-lg">
                                                    <div className="text-[9px] text-indigo-400 font-black uppercase mb-1 tracking-widest">Puanı</div>
                                                    <div className="text-4xl font-black text-indigo-500">{log.evaluation.score}<span className="text-xs opacity-50 ml-1">/10</span></div>
                                                </div>
                                            )}
                                        </div>

                                        {evaluatingLogId === log.id ? (
                                            <div className="mt-8 space-y-6 animate-in slide-in-from-top-4 duration-500 p-6 bg-gray-800/20 rounded-3xl border border-gray-800">
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                                    <div className="space-y-4">
                                                        <label className="text-[11px] font-black text-blue-500 uppercase tracking-widest flex items-center">
                                                            <Clock className="w-3.5 h-3.5 mr-2" /> Hazırlık Süresi Performansı
                                                        </label>
                                                        <div className="flex gap-2">
                                                            {['Çok İyi', 'Yeterli', 'Yetersiz'].map(v => (
                                                                <RatingButton key={v} label={v} value={v} currentVal={evalForm.setupRating} onClick={(val) => setEvalForm({...evalForm, setupRating: val})} />
                                                            ))}
                                                        </div>
                                                    </div>
                                                    <div className="space-y-4">
                                                        <label className="text-[11px] font-black text-green-500 uppercase tracking-widest flex items-center">
                                                            <Activity className="w-3.5 h-3.5 mr-2" /> CAM İşleme Performansı
                                                        </label>
                                                        <div className="flex gap-2">
                                                            {['Çok İyi', 'Yeterli', 'Yetersiz'].map(v => (
                                                                <RatingButton key={v} label={v} value={v} currentVal={evalForm.camRating} onClick={(val) => setEvalForm({...evalForm, camRating: val})} />
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="bg-[#111827] p-6 rounded-3xl border border-gray-800 shadow-inner">
                                                    <div className="flex justify-between items-center mb-5">
                                                        <span className="text-[11px] font-black text-gray-400 uppercase tracking-widest">Genel Verimlilik Puanı</span>
                                                        <div className="bg-indigo-600 text-white px-4 py-1 rounded-full text-xl font-black shadow-lg shadow-indigo-600/20">{evalForm.score}</div>
                                                    </div>
                                                    <input 
                                                        type="range" min="1" max="10" 
                                                        value={evalForm.score} 
                                                        onChange={(e) => setEvalForm({...evalForm, score: parseInt(e.target.value)})} 
                                                        className="w-full h-2 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                                                    />
                                                    <div className="flex justify-between mt-3 text-[9px] font-black text-gray-600 uppercase">
                                                        <span>1 (Kritik)</span>
                                                        <span>10 (Mükemmel)</span>
                                                    </div>
                                                </div>

                                                <div className="flex justify-end gap-3 pt-4">
                                                    <button onClick={() => setEvaluatingLogId(null)} className="px-6 py-3 text-xs font-black text-gray-500 hover:text-white transition-colors uppercase tracking-widest">İptal</button>
                                                    <button onClick={() => handleSaveEvaluation(log.id)} disabled={isSaving} className="px-10 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-2xl shadow-xl shadow-indigo-600/30 transition-all active:scale-95 flex items-center text-xs uppercase tracking-widest">
                                                        <Save className="w-4 h-4 mr-2" /> {isSaving ? 'Kaydediliyor...' : 'Değerlendirmeyi Kaydet'}
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="mt-6 flex items-center justify-between border-t border-gray-800/50 pt-5">
                                                {log.evaluation ? (
                                                    <div className="flex gap-6">
                                                        <div className="flex items-center text-[10px] font-black text-gray-500 uppercase tracking-tight">
                                                            <div className={`w-2 h-2 rounded-full mr-2 ${log.evaluation.setupRating === 'Çok İyi' ? 'bg-green-500' : log.evaluation.setupRating === 'Yetersiz' ? 'bg-red-500' : 'bg-blue-500'}`} />
                                                            Hazırlık: <span className="text-gray-300 ml-1.5">{log.evaluation.setupRating}</span>
                                                        </div>
                                                        <div className="flex items-center text-[10px] font-black text-gray-500 uppercase tracking-tight">
                                                            <div className={`w-2 h-2 rounded-full mr-2 ${log.evaluation.camRating === 'Çok İyi' ? 'bg-green-500' : log.evaluation.camRating === 'Yetersiz' ? 'bg-red-500' : 'bg-blue-500'}`} />
                                                            CAM: <span className="text-gray-200 ml-1.5">{log.evaluation.camRating}</span>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center text-[10px] font-bold text-orange-500/40 uppercase tracking-widest animate-pulse italic">
                                                        <Star className="w-3 h-3 mr-2" /> Değerlendirme Bekliyor
                                                    </div>
                                                )}
                                                
                                                <button 
                                                    onClick={() => { 
                                                        setEvaluatingLogId(log.id); 
                                                        setEvalForm(log.evaluation || { setupRating: '', camRating: '', score: 5 }); 
                                                    }} 
                                                    className={`px-8 py-2.5 rounded-xl font-black text-[10px] tracking-[0.1em] transition-all border uppercase ${log.evaluation ? 'bg-gray-800/50 border-gray-700 text-gray-400 hover:text-white hover:border-gray-500' : 'bg-orange-500 border-orange-400 text-white shadow-lg shadow-orange-500/20 active:scale-95'}`}
                                                >
                                                    {log.evaluation ? 'GÜNCELLE' : 'PUANLA'}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CamOperatorEvaluationTab;