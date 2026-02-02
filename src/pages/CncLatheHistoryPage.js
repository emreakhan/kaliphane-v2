// src/pages/CncLatheHistoryPage.js

import React, { useState, useEffect, useMemo } from 'react';
import { 
    History, Search, FileText, Calendar, User, Clock
} from 'lucide-react';
import { collection, query, where, onSnapshot } from '../config/firebase.js';
import { CNC_LATHE_JOBS_COLLECTION } from '../config/constants.js';
import { formatDateTime } from '../utils/dateUtils.js';

const CncLatheHistoryPage = ({ db }) => {
    const [jobs, setJobs] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!db) return;

        // Sadece 'COMPLETED' olanları çekiyoruz.
        // Sıralamayı (orderBy) client tarafında yapacağız ki index hatası almayalım.
        const q = query(
            collection(db, CNC_LATHE_JOBS_COLLECTION), 
            where('status', '==', 'COMPLETED')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            // Tarihe göre yeniden eskiye sırala
            data.sort((a, b) => new Date(b.endTime) - new Date(a.endTime));
            setJobs(data);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [db]);

    const filteredJobs = useMemo(() => {
        if (!searchTerm) return jobs;
        const lowerTerm = searchTerm.toLowerCase();
        return jobs.filter(job => 
            (job.orderNumber && job.orderNumber.toLowerCase().includes(lowerTerm)) ||
            (job.partName && job.partName.toLowerCase().includes(lowerTerm)) ||
            (job.operator && job.operator.toLowerCase().includes(lowerTerm)) ||
            (job.machine && job.machine.toLowerCase().includes(lowerTerm))
        );
    }, [jobs, searchTerm]);

    return (
        <div className="p-4 sm:p-8 min-h-screen bg-gray-100 dark:bg-gray-900 font-sans">
            <div className="mb-8 flex flex-col md:flex-row justify-between items-center gap-4">
                <div>
                    <h1 className="text-3xl font-extrabold text-gray-900 dark:text-white flex items-center">
                        <History className="w-8 h-8 mr-3 text-blue-600" />
                        Geçmiş CNC İşleri
                    </h1>
                    <p className="text-gray-500 dark:text-gray-400 mt-1">
                        Tamamlanan tüm torna işlerinin arşivi.
                    </p>
                </div>

                <div className="relative w-full md:w-1/3">
                    <Search className="absolute left-3 top-2.5 w-5 h-5 text-gray-400" />
                    <input 
                        type="text" 
                        placeholder="İş Emri, Parça, Operatör Ara..." 
                        className="w-full pl-10 p-3 border rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-700 dark:text-white"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                {loading ? (
                    <div className="p-10 text-center text-gray-500">Yükleniyor...</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm text-gray-600 dark:text-gray-300">
                            <thead className="bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white uppercase font-bold text-xs">
                                <tr>
                                    <th className="p-4">Bitiş Tarihi</th>
                                    <th className="p-4">Tezgah</th>
                                    <th className="p-4">İş Emri</th>
                                    <th className="p-4">Parça Adı</th>
                                    <th className="p-4 text-center">Hedef / Üretilen</th>
                                    <th className="p-4 text-center">Süre</th>
                                    <th className="p-4">Operatör</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                                {filteredJobs.length === 0 ? (
                                    <tr>
                                        <td colSpan="7" className="p-8 text-center text-gray-400">
                                            Kayıt bulunamadı.
                                        </td>
                                    </tr>
                                ) : (
                                    filteredJobs.map((job) => (
                                        <tr key={job.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition">
                                            <td className="p-4 text-xs font-mono">
                                                <div className="flex items-center">
                                                    <Calendar className="w-3 h-3 mr-1 text-gray-400"/>
                                                    {formatDateTime(job.endTime)}
                                                </div>
                                            </td>
                                            <td className="p-4 font-bold text-orange-600">
                                                {job.machine}
                                            </td>
                                            <td className="p-4 font-mono font-bold">
                                                {job.orderNumber}
                                            </td>
                                            <td className="p-4 font-medium text-gray-900 dark:text-white">
                                                {job.partName}
                                            </td>
                                            <td className="p-4 text-center">
                                                <span className="text-gray-400 text-xs mr-1">{job.targetQuantity} /</span>
                                                <span className="font-bold text-green-600 text-lg">{job.producedQuantity}</span>
                                            </td>
                                            <td className="p-4 text-center">
                                                <div className="flex items-center justify-center text-gray-500">
                                                    <Clock className="w-3 h-3 mr-1"/>
                                                    {job.durationMinutes} dk
                                                </div>
                                            </td>
                                            <td className="p-4 text-xs">
                                                <div className="flex items-center">
                                                    <User className="w-3 h-3 mr-1 text-gray-400"/>
                                                    {job.operator}
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

export default CncLatheHistoryPage;