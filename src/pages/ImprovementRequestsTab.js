// src/pages/ImprovementRequestsTab.js

import React, { useState, useMemo } from 'react';
import { Plus, Search, Filter, Lightbulb, Clock, CheckCircle, XCircle, AlertTriangle, Eye, Image as ImageIcon, UserCircle } from 'lucide-react';
import NewImprovementRequestModal from '../components/Modals/NewImprovementRequestModal.js';
import ReviewImprovementRequestModal from '../components/Modals/ReviewImprovementRequestModal.js';

const ImprovementRequestsTab = ({ db, loggedInUser, improvementRequests = [] }) => {
    const [statusFilter, setStatusFilter] = useState('ALL'); // ALL, PENDING, APPROVED, REJECTED
    const [deptFilter, setDeptFilter] = useState('ALL');
    const [searchTerm, setSearchTerm] = useState('');

    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [selectedReviewRequest, setSelectedReviewRequest] = useState(null);
    const [selectedPreviewImage, setSelectedPreviewImage] = useState(null);

    const isManagerOrAdmin = loggedInUser?.role === 'ADMIN' || loggedInUser?.role === 'Yönetici' || loggedInUser?.role?.includes('Yöneticisi') || loggedInUser?.role?.includes('Sorumlusu');

    const filteredRequests = useMemo(() => {
        return improvementRequests.filter(req => {
            if (statusFilter !== 'ALL' && req.status !== statusFilter) return false;
            if (deptFilter !== 'ALL' && req.targetDepartment !== deptFilter) return false;
            if (searchTerm.trim()) {
                const term = searchTerm.toLowerCase();
                const titleMatch = req.title?.toLowerCase().includes(term);
                const descMatch = req.description?.toLowerCase().includes(term);
                const creatorMatch = req.createdByName?.toLowerCase().includes(term);
                if (!titleMatch && !descMatch && !creatorMatch) return false;
            }
            return true;
        }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }, [improvementRequests, statusFilter, deptFilter, searchTerm]);

    const getStatusBadge = (status) => {
        switch (status) {
            case 'APPROVED':
                return <span className="px-2.5 py-1 bg-green-100 text-green-800 dark:bg-green-900/60 dark:text-green-300 rounded-full text-[10px] font-bold flex items-center gap-1"><CheckCircle className="w-3 h-3 text-green-600" /> Kabul Edildi & Yayınlandı</span>;
            case 'UNDER_REVIEW':
                return <span className="px-2.5 py-1 bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300 rounded-full text-[10px] font-bold flex items-center gap-1"><Clock className="w-3 h-3 text-blue-600" /> İncelemede</span>;
            case 'REJECTED':
                return <span className="px-2.5 py-1 bg-red-100 text-red-800 dark:bg-red-900/60 dark:text-red-300 rounded-full text-[10px] font-bold flex items-center gap-1"><XCircle className="w-3 h-3 text-red-600" /> Uygun Görülmedi</span>;
            default:
                return <span className="px-2.5 py-1 bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300 rounded-full text-[10px] font-bold flex items-center gap-1"><Clock className="w-3 h-3 text-amber-600" /> Değerlendirme Bekliyor</span>;
        }
    };

    const getPriorityBadge = (priority) => {
        switch (priority) {
            case 'KRİTİK':
                return <span className="px-2 py-0.5 bg-red-500 text-white rounded text-[9px] font-black">🔴 KRİTİK</span>;
            case 'YÜKSEK':
                return <span className="px-2 py-0.5 bg-amber-500 text-white rounded text-[9px] font-black">🟠 YÜKSEK</span>;
            case 'ORTA':
                return <span className="px-2 py-0.5 bg-yellow-500 text-white rounded text-[9px] font-black">🟡 ORTA</span>;
            default:
                return <span className="px-2 py-0.5 bg-blue-500 text-white rounded text-[9px] font-black">🟢 DÜŞÜK</span>;
        }
    };

    return (
        <div className="space-y-6">
            
            {/* ÜST FİLTRE VE EYLEM BANNERİ */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 flex flex-col md:flex-row justify-between items-center gap-4">
                
                <div className="flex items-center gap-3 w-full md:w-auto flex-wrap">
                    {/* Arama Kutusu */}
                    <div className="relative">
                        <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                        <input 
                            type="text"
                            placeholder="Talep başlığı veya açıklama ara..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-9 pr-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-xs font-bold text-gray-700 dark:text-gray-200 outline-none focus:ring-2 focus:ring-amber-500 w-full sm:w-64"
                        />
                    </div>

                    {/* Durum Filtresi */}
                    <select 
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="p-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-xs font-bold text-gray-700 dark:text-gray-200 outline-none cursor-pointer"
                    >
                        <option value="ALL">🔍 Tüm Durumlar</option>
                        <option value="PENDING">🟡 Değerlendirme Bekleyenler</option>
                        <option value="APPROVED">🟢 Kabul Edilenler & Yayınlananlar</option>
                        <option value="REJECTED">🔴 Reddedilenler</option>
                    </select>

                    {/* Bölüm Filtresi */}
                    <select 
                        value={deptFilter}
                        onChange={(e) => setDeptFilter(e.target.value)}
                        className="p-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-xs font-bold text-gray-700 dark:text-gray-200 outline-none cursor-pointer"
                    >
                        <option value="ALL">🏢 Tüm Departmanlar</option>
                        <option value="Kalıp Tasarım">Kalıp Tasarım</option>
                        <option value="CAM">CAM</option>
                        <option value="CNC">CNC</option>
                        <option value="Erezyon">Erezyon</option>
                        <option value="Kalite & Ölçüm">Kalite & Ölçüm</option>
                    </select>
                </div>

                <button 
                    onClick={() => setIsCreateModalOpen(true)}
                    className="w-full md:w-auto px-4 py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold shadow-md transition flex items-center justify-center gap-2"
                >
                    <Plus className="w-4 h-4" /> Yeni İyileştirme / Öneri Talebi Gir
                </button>
            </div>

            {/* İYİLEŞTİRME TALEPLERİ LİSTESİ */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredRequests.map((req) => (
                    <div key={req.id} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5 space-y-3 flex flex-col justify-between transition hover:border-amber-300">
                        <div className="space-y-2">
                            <div className="flex justify-between items-start gap-2">
                                <div className="flex items-center gap-2">
                                    <span className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-300 font-bold text-[10px]">
                                        {req.targetDepartment}
                                    </span>
                                    {getPriorityBadge(req.priority)}
                                </div>
                                {getStatusBadge(req.status)}
                            </div>

                            <h3 className="font-bold text-sm text-gray-900 dark:text-white leading-snug">{req.title}</h3>
                            <p className="text-xs text-gray-600 dark:text-gray-300 line-clamp-3 leading-relaxed">{req.description}</p>
                        </div>

                        {/* FOTOĞRAFLAR */}
                        {req.images && req.images.length > 0 && (
                            <div className="flex items-center gap-2 pt-1">
                                {req.images.map((img, idx) => (
                                    <div key={idx} onClick={() => setSelectedPreviewImage(img)} className="w-12 h-12 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden bg-black cursor-pointer hover:opacity-80">
                                        <img src={img} alt="thumbnail" className="w-full h-full object-cover" />
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* YÖNETİCİ KARAR NOTU (EĞER YAZILDISA) */}
                        {req.managerResponseNote && (
                            <div className={`p-3 rounded-lg border text-xs space-y-1 ${req.status === 'APPROVED' ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-900 dark:text-green-200' : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-900 dark:text-red-200'}`}>
                                <span className="font-bold block text-[11px]">💬 {req.reviewedByName || 'Yönetici'} Yanıtı:</span>
                                <p className="italic">{req.managerResponseNote}</p>
                            </div>
                        )}

                        <div className="flex justify-between items-center pt-3 border-t border-gray-100 dark:border-gray-700 text-[11px] text-gray-400">
                            <span className="flex items-center gap-1 font-bold">
                                <UserCircle className="w-3.5 h-3.5" /> {req.createdByName} ({req.createdByRole})
                            </span>
                            <span>{new Date(req.createdAt).toLocaleDateString('tr-TR')}</span>
                        </div>

                        {/* YÖNETİCİ EYLEM BUTONU */}
                        {isManagerOrAdmin && (
                            <div className="pt-2">
                                <button
                                    onClick={() => setSelectedReviewRequest(req)}
                                    className="w-full py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5"
                                >
                                    <Eye className="w-4 h-4 text-indigo-500" /> Talebi Değerlendir & Karar Yaz
                                </button>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {filteredRequests.length === 0 && (
                <div className="py-16 text-center text-gray-500 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
                    <Lightbulb className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                    <p className="font-bold text-sm">Gösterilecek iyileştirme talebi bulunmuyor.</p>
                </div>
            )}

            {/* YENİ TALEP MODALI */}
            <NewImprovementRequestModal 
                isOpen={isCreateModalOpen}
                onClose={() => setIsCreateModalOpen(false)}
                db={db}
                loggedInUser={loggedInUser}
            />

            {/* DEĞERLENDİRME MODALI */}
            {selectedReviewRequest && (
                <ReviewImprovementRequestModal 
                    isOpen={Boolean(selectedReviewRequest)}
                    onClose={() => setSelectedReviewRequest(null)}
                    request={selectedReviewRequest}
                    db={db}
                    loggedInUser={loggedInUser}
                />
            )}

            {/* BÜYÜK RESİM İNCELEME */}
            {selectedPreviewImage && (
                <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" onClick={() => setSelectedPreviewImage(null)}>
                    <img src={selectedPreviewImage} alt="preview" className="max-w-full max-h-full rounded-lg object-contain" />
                </div>
            )}
        </div>
    );
};

export default ImprovementRequestsTab;
