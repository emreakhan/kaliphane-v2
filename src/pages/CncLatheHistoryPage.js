// src/pages/CncLatheHistoryPage.js

import React, { useState, useEffect, useMemo } from 'react';
import { Archive, Search, Trash2, Filter, PlayCircle, AlertTriangle, CheckCircle, BarChart2 } from 'lucide-react';
import { 
    collection, query, where, onSnapshot, orderBy, doc, deleteDoc, getDocs, addDoc 
} from '../config/firebase.js';
import { CNC_LATHE_JOBS_COLLECTION, CNC_PARTS_COLLECTION, ROLES } from '../config/constants.js';
import { formatDateTime, getCurrentDateTimeString } from '../utils/dateUtils.js';

const CncLatheHistoryPage = ({ db, loggedInUser }) => {
    const [historyJobs, setHistoryJobs] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    
    const [activeTab, setActiveTab] = useState('HISTORY'); // YENİ: Sekme kontrolü
    const [showIncompleteOnly, setShowIncompleteOnly] = useState(false);
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
    const [parts, setParts] = useState([]); // Parça veritabanı için

    useEffect(() => {
        if (!db) return;
        const q = query(
            collection(db, CNC_LATHE_JOBS_COLLECTION), 
            where('status', '==', 'COMPLETED'),
            orderBy('endTime', 'desc')
        );
        
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const jobs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setHistoryJobs(jobs);
        });

        return () => unsubscribe();
    }, [db]);

    // Parça koleksiyonunu (Stok/Resim no bilgileri için) çek
    useEffect(() => {
        if (!db) return;
        const unsubParts = onSnapshot(collection(db, CNC_PARTS_COLLECTION), (snapshot) => {
            setParts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });
        return () => unsubParts();
    }, [db]);

    const handleDeleteJob = async (jobId) => {
        if (!window.confirm("Bu geçmiş iş kaydını silmek istediğinize emin misiniz? Bu işlem geri alınamaz.")) return;
        try {
            await deleteDoc(doc(db, CNC_LATHE_JOBS_COLLECTION, jobId));
        } catch (error) {
            console.error("Silme hatası:", error);
            alert("Silinemedi.");
        }
    };

    const handleResumeJob = async (job) => {
        const remainingQty = parseInt(job.targetQuantity) - parseInt(job.producedQuantity);
        
        if (remainingQty <= 0) {
            alert("Bu iş zaten hedeflenen adede ulaşmış veya geçmiş.");
            return;
        }

        if (!window.confirm(`Bu iş emrini "${job.machine}" tezgahında tekrar başlatmak istiyor musunuz?\n\nKalan Hedef: ${remainingQty} Adet`)) return;

        try {
            const qActive = query(
                collection(db, CNC_LATHE_JOBS_COLLECTION),
                where('status', '==', 'RUNNING'),
                where('machine', '==', job.machine)
            );
            const activeSnap = await getDocs(qActive);

            if (!activeSnap.empty) {
                alert(`HATA: ${job.machine} tezgahında şu an çalışan başka bir iş var! Önce onu bitirmelisiniz.`);
                return;
            }

            await addDoc(collection(db, CNC_LATHE_JOBS_COLLECTION), {
                machine: job.machine,
                orderNumber: job.orderNumber,
                partName: job.partName,
                partId: job.partId || '',
                targetQuantity: remainingQty, 
                startTime: getCurrentDateTimeString(),
                operator: loggedInUser.name,
                status: 'RUNNING',
                isResumed: true,              
                parentJobId: job.id           
            });

            alert(`İş Emri ${job.machine} tezgahında tekrar başlatıldı!`);

        } catch (error) {
            console.error("İş sürdürme hatası:", error);
            alert("İş başlatılamadı.");
        }
    };

    const filteredJobs = historyJobs.filter(job => {
        const part = parts.find(p => p.id === job.partId);
        const stockNo = part?.orderNumber || part?.technicalDrawingNo || '';

        const matchesSearch = 
            (job.orderNumber || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (job.partName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (job.operator || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            stockNo.toLowerCase().includes(searchTerm.toLowerCase());
        
        if (showIncompleteOnly) {
            // SADECE Gerçekten eksik kalan ve sonradan tamamlanmayanları göster
            const isIncomplete = (parseInt(job.producedQuantity) || 0) < (parseInt(job.targetQuantity) || 0);
            return matchesSearch && isIncomplete && !job.isCompletedLater;
        }

        return matchesSearch;
    });

    const availableYears = useMemo(() => {
        const years = new Set(historyJobs.map(job => {
            if (!job.endTime) return new Date().getFullYear();
            return new Date(job.endTime).getFullYear();
        }));
        years.add(new Date().getFullYear()); // Her zaman mevcut yılı ekle
        return Array.from(years).sort((a, b) => b - a).map(String);
    }, [historyJobs]);

    // --- İSTATİSTİKLERİN HESAPLANMASI ---
    const partStats = useMemo(() => {
        const stats = {};
        const currentYearStr = new Date().getFullYear().toString();
        const currentMonth = new Date().getMonth() + 1; 
        let totalYearlyProduction = 0;

        historyJobs.forEach(job => {
            // İlgili parçayı veritabanından bul ve stok/resim numarasını al
            const part = parts.find(p => p.id === job.partId);
            const stockNo = part?.orderNumber || part?.technicalDrawingNo || 'Belirtilmedi';
            
            const key = job.partId || job.partName || 'Bilinmiyor';
            const jobYear = job.endTime ? new Date(job.endTime).getFullYear().toString() : currentYearStr;

            if (!stats[key]) {
                stats[key] = {
                    partName: job.partName || 'Bilinmiyor',
                    stockNo: stockNo,
                    totalProduced: 0,
                    yearProduced: 0,
                    jobCount: 0,
                    totalDurationMins: 0
                };
            }
            
            const produced = parseInt(job.producedQuantity) || 0;
            stats[key].totalProduced += produced;
            if (jobYear === selectedYear) {
                stats[key].yearProduced += produced;
                totalYearlyProduction += produced;
            }
            stats[key].jobCount += 1;
            stats[key].totalDurationMins += (parseInt(job.durationMinutes) || 0);
        });
        
        let filteredStats = Object.values(stats);
        if (searchTerm) {
            filteredStats = filteredStats.filter(s => s.partName.toLowerCase().includes(searchTerm.toLowerCase()) || s.stockNo.toLowerCase().includes(searchTerm.toLowerCase()));
        }
        
        const monthsToDivide = selectedYear === currentYearStr ? currentMonth : 12;

        return {
            list: filteredStats.sort((a, b) => b.yearProduced - a.yearProduced),
            totalYearlyProduction,
            monthsToDivide
        };
    }, [historyJobs, parts, searchTerm, selectedYear]);

    const isSupervisor = loggedInUser?.role === ROLES.CNC_TORNA_SORUMLUSU;
    const canResume = true; 

    return (
        <div className="p-6 max-w-7xl mx-auto min-h-screen bg-gray-100 dark:bg-gray-900 font-sans">
            <h1 className="text-3xl font-extrabold text-gray-900 dark:text-white flex items-center mb-6">
                <Archive className="w-8 h-8 mr-3 text-gray-600 dark:text-gray-300" />
                Geçmiş CNC İşleri
            </h1>

            {/* SEKMELER */}
            <div className="flex bg-white dark:bg-gray-800 p-1.5 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 w-fit mb-6 gap-1 overflow-x-auto">
                <button 
                    onClick={() => setActiveTab('HISTORY')} 
                    className={`px-5 py-2.5 rounded-lg font-bold transition flex items-center whitespace-nowrap text-sm ${activeTab === 'HISTORY' ? 'bg-blue-100 text-blue-800' : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                >
                    <Archive className="w-4 h-4 mr-2" /> İş Geçmişi
                </button>
                <button 
                    onClick={() => setActiveTab('STATS')} 
                    className={`px-5 py-2.5 rounded-lg font-bold transition flex items-center whitespace-nowrap text-sm ${activeTab === 'STATS' ? 'bg-green-100 text-green-800' : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                >
                    <BarChart2 className="w-4 h-4 mr-2" /> Parça Üretim İstatistikleri
                </button>
            </div>

            <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 mb-6 flex flex-col md:flex-row gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-3 text-gray-400 w-5 h-5" />
                    <input 
                        type="text" 
                        placeholder={activeTab === 'HISTORY' ? "İş Emri, Parça veya Operatör Ara..." : "Stok / Resim No veya Parça Ara..."} 
                        className="w-full pl-10 p-2 border rounded-lg bg-gray-50 dark:bg-gray-700 dark:text-white dark:border-gray-600 outline-none focus:ring-2 focus:ring-blue-500"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                
                {activeTab === 'STATS' && (
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-gray-500 dark:text-gray-400">Yıl:</span>
                        <select 
                            value={selectedYear} 
                            onChange={e => setSelectedYear(e.target.value)}
                            className="p-2 border rounded-lg bg-gray-50 dark:bg-gray-700 dark:text-white dark:border-gray-600 outline-none focus:ring-2 focus:ring-blue-500 font-bold"
                        >
                            {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                    </div>
                )}

                {activeTab === 'HISTORY' && (
                    <button 
                        onClick={() => setShowIncompleteOnly(!showIncompleteOnly)}
                        className={`px-4 py-2 rounded-lg font-bold flex items-center transition ${
                            showIncompleteOnly 
                            ? 'bg-orange-100 text-orange-700 border border-orange-300' 
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200 border border-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600'
                        }`}
                    >
                        <Filter className="w-4 h-4 mr-2" />
                        {showIncompleteOnly ? 'Tümünü Göster' : 'Eksik Kalanları Göster'}
                    </button>
                )}
            </div>

            {activeTab === 'HISTORY' && (
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400">
                            <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400">
                                <tr>
                                    <th className="px-6 py-3">Stok / Resim No</th>
                                    <th className="px-6 py-3">Parça & İş Emri</th>
                                    <th className="px-6 py-3">Tezgah</th>
                                    <th className="px-6 py-3">Bitiş Zamanı</th>
                                    {/* YENİ: SÜTUNLAR AYRILDI */}
                                    <th className="px-6 py-3 text-center bg-gray-100 dark:bg-gray-600">Hedef</th>
                                    <th className="px-6 py-3 text-center bg-gray-100 dark:bg-gray-600">Üretilen</th>
                                    <th className="px-6 py-3">Süre</th>
                                    <th className="px-6 py-3">Operatör</th>
                                    <th className="px-6 py-3 text-right">İşlem</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredJobs.length > 0 ? filteredJobs.map(job => {
                                    const produced = parseInt(job.producedQuantity) || 0;
                                    const target = parseInt(job.targetQuantity) || 0;
                                    
                                    // Eksik mi? (Ama sonradan tamamlanmışsa eksik sayma)
                                    const isIncompleteReal = produced < target;
                                    const showWarning = isIncompleteReal && !job.isCompletedLater;

                                    const part = parts.find(p => p.id === job.partId);
                                    const stockNo = part?.orderNumber || part?.technicalDrawingNo || job.orderNumber || 'Belirtilmedi';

                                    return (
                                        <tr key={job.id} className={`border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 ${showWarning ? 'bg-orange-50 dark:bg-orange-900/10' : 'bg-white dark:bg-gray-800'}`}>
                                            <td className="px-6 py-4 font-bold text-gray-900 dark:text-white">
                                                {stockNo}
                                                {showWarning && <AlertTriangle className="w-4 h-4 text-orange-500 inline ml-2" title="Hedefe Ulaşmadı"/>}
                                                {/* Sonradan tamamlandıysa yeşil tik göster */}
                                                {isIncompleteReal && job.isCompletedLater && (
                                                    <CheckCircle className="w-4 h-4 text-green-500 inline ml-2" title="Ek üretimle tamamlandı"/>
                                                )}
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="font-medium text-gray-900 dark:text-white">{job.partName}</div>
                                                {job.orderNumber && job.orderNumber !== stockNo && (
                                                    <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">İş Emri: {job.orderNumber}</div>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 font-mono">{job.machine}</td>
                                            <td className="px-6 py-4">{formatDateTime(job.endTime)}</td>
                                            
                                            {/* AYRI SÜTUNLAR */}
                                            <td className="px-6 py-4 text-center font-bold text-gray-600 bg-gray-50 dark:bg-gray-700/50">
                                                {target}
                                            </td>
                                            <td className={`px-6 py-4 text-center font-bold bg-gray-50 dark:bg-gray-700/50 ${showWarning ? 'text-red-600' : 'text-green-600'}`}>
                                                {produced}
                                            </td>

                                            <td className="px-6 py-4">{job.durationMinutes ? `${Math.floor(job.durationMinutes / 60)}s ${job.durationMinutes % 60}dk` : '-'}</td>
                                            <td className="px-6 py-4">{job.operator}</td>
                                            
                                            <td className="px-6 py-4 text-right flex justify-end gap-2">
                                                {/* İŞİ SÜRDÜR (Eğer gerçekten eksikse ve sonradan tamamlanmadıysa) */}
                                                {canResume && showWarning && (
                                                    <button 
                                                        onClick={() => handleResumeJob(job)}
                                                        className="text-blue-600 hover:text-blue-800 p-2 hover:bg-blue-50 rounded transition flex items-center"
                                                        title="Kalan Adet İle Devam Et"
                                                    >
                                                        <PlayCircle className="w-5 h-5 mr-1" />
                                                        <span className="text-xs font-bold">SÜRDÜR</span>
                                                    </button>
                                                )}

                                                {isSupervisor && (
                                                    <button 
                                                        onClick={() => handleDeleteJob(job.id)}
                                                        className="text-red-500 hover:text-red-700 p-2 hover:bg-red-50 rounded transition"
                                                        title="Kaydı Sil"
                                                    >
                                                        <Trash2 className="w-5 h-5" />
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                }) : (
                                    <tr>
                                        <td colSpan="9" className="px-6 py-8 text-center text-gray-400">
                                            Kayıt bulunamadı.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {activeTab === 'STATS' && (
                <>
                    {/* TOPLAM ÜRETİM KARTI */}
                    <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl flex items-center justify-between shadow-sm">
                        <span className="font-bold text-blue-800 dark:text-blue-300 text-lg">{selectedYear} Yılı Toplam Parça Üretimi:</span>
                        <span className="text-3xl font-black text-blue-600 dark:text-blue-400">{partStats.totalYearlyProduction.toLocaleString('tr-TR')} <span className="text-sm font-bold">Adet</span></span>
                    </div>

                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400">
                            <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400">
                                <tr>
                                    <th className="px-6 py-3">Stok / Resim No (Parça)</th>
                                    <th className="px-6 py-3 text-center">Toplam Üretim (Tümü)</th>
                                    <th className="px-6 py-3 text-center">{selectedYear} Üretimi</th>
                                    <th className="px-6 py-3 text-center">Aylık Ortalama ({selectedYear})</th>
                                    <th className="px-6 py-3 text-center">İş Emri Sayısı</th>
                                    <th className="px-6 py-3 text-center">Toplam Çalışma Süresi</th>
                                </tr>
                            </thead>
                            <tbody>
                                {partStats.list.length > 0 ? partStats.list.map((stat, idx) => {
                                    const hours = Math.floor(stat.totalDurationMins / 60);
                                    const mins = stat.totalDurationMins % 60;
                                    const monthlyAvg = Math.round(stat.yearProduced / partStats.monthsToDivide);
                                    return (
                                        <tr key={idx} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 bg-white dark:bg-gray-800">
                                            <td className="px-6 py-4">
                                                <div className="font-bold text-gray-900 dark:text-white text-base">{stat.stockNo}</div>
                                                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{stat.partName}</div>
                                            </td>
                                            <td className="px-6 py-4 text-center font-black text-blue-600 dark:text-blue-400">{stat.totalProduced.toLocaleString('tr-TR')}</td>
                                            <td className="px-6 py-4 text-center font-bold text-green-600 dark:text-green-400">{stat.yearProduced.toLocaleString('tr-TR')}</td>
                                            <td className="px-6 py-4 text-center font-bold text-orange-600 dark:text-orange-400">{monthlyAvg.toLocaleString('tr-TR')} / Ay</td>
                                            <td className="px-6 py-4 text-center font-bold text-gray-700 dark:text-gray-300">{stat.jobCount}</td>
                                            <td className="px-6 py-4 text-center font-medium">
                                                {hours}s {mins}dk
                                            </td>
                                        </tr>
                                    );
                                }) : (
                                    <tr>
                                        <td colSpan="6" className="px-6 py-8 text-center text-gray-400">
                                            Veri bulunamadı.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
                </>
            )}

        </div>
    );
};

export default CncLatheHistoryPage;