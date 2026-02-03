// src/pages/CncLatheHistoryPage.js

import React, { useState, useEffect } from 'react';
import { Archive, Search, Trash2, Filter, PlayCircle, AlertTriangle, CheckCircle } from 'lucide-react'; // CheckCircle eklendi
import { 
    collection, query, where, onSnapshot, orderBy, doc, deleteDoc, getDocs, addDoc 
} from '../config/firebase.js';
import { CNC_LATHE_JOBS_COLLECTION, ROLES } from '../config/constants.js';
import { formatDateTime, getCurrentDateTimeString } from '../utils/dateUtils.js';

const CncLatheHistoryPage = ({ db, loggedInUser }) => {
    const [historyJobs, setHistoryJobs] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    
    const [showIncompleteOnly, setShowIncompleteOnly] = useState(false);

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
        const matchesSearch = 
            job.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
            job.partName.toLowerCase().includes(searchTerm.toLowerCase()) ||
            job.operator.toLowerCase().includes(searchTerm.toLowerCase());
        
        if (showIncompleteOnly) {
            // SADECE Gerçekten eksik kalan ve sonradan tamamlanmayanları göster
            const isIncomplete = (parseInt(job.producedQuantity) || 0) < (parseInt(job.targetQuantity) || 0);
            return matchesSearch && isIncomplete && !job.isCompletedLater;
        }

        return matchesSearch;
    });

    const isSupervisor = loggedInUser?.role === ROLES.CNC_TORNA_SORUMLUSU;
    const canResume = true; 

    return (
        <div className="p-6 max-w-7xl mx-auto min-h-screen bg-gray-100 dark:bg-gray-900 font-sans">
            <h1 className="text-3xl font-extrabold text-gray-900 dark:text-white flex items-center mb-6">
                <Archive className="w-8 h-8 mr-3 text-gray-600 dark:text-gray-300" />
                Geçmiş CNC İşleri
            </h1>

            <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 mb-6 flex flex-col md:flex-row gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-3 text-gray-400 w-5 h-5" />
                    <input 
                        type="text" 
                        placeholder="İş Emri, Parça veya Operatör Ara..." 
                        className="w-full pl-10 p-2 border rounded-lg bg-gray-50 dark:bg-gray-700 dark:text-white dark:border-gray-600 outline-none focus:ring-2 focus:ring-blue-500"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                
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
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400">
                        <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400">
                            <tr>
                                <th className="px-6 py-3">İş Emri</th>
                                <th className="px-6 py-3">Parça</th>
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

                                return (
                                    <tr key={job.id} className={`border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 ${showWarning ? 'bg-orange-50 dark:bg-orange-900/10' : 'bg-white dark:bg-gray-800'}`}>
                                        <td className="px-6 py-4 font-bold text-gray-900 dark:text-white">
                                            {job.orderNumber}
                                            {showWarning && <AlertTriangle className="w-4 h-4 text-orange-500 inline ml-2" title="Hedefe Ulaşmadı"/>}
                                            {/* Sonradan tamamlandıysa yeşil tik göster */}
                                            {isIncompleteReal && job.isCompletedLater && (
                                                <CheckCircle className="w-4 h-4 text-green-500 inline ml-2" title="Ek üretimle tamamlandı"/>
                                            )}
                                        </td>
                                        <td className="px-6 py-4">{job.partName}</td>
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
        </div>
    );
};

export default CncLatheHistoryPage;