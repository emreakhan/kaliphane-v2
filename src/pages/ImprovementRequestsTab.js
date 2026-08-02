// src/pages/ImprovementRequestsTab.js

import React, { useState, useMemo } from 'react';
import { 
    Plus, Search, Filter, Lightbulb, Clock, CheckCircle, XCircle, 
    AlertTriangle, Eye, Image as ImageIcon, UserCircle, MessageSquare, 
    Send, ChevronDown, ChevronUp, Trash2, X 
} from 'lucide-react';
import { doc, updateDoc, arrayUnion } from '../config/firebase.js';
import { IMPROVEMENT_REQUESTS_COLLECTION } from '../config/constants.js';
import NewImprovementRequestModal from '../components/Modals/NewImprovementRequestModal.js';
import ReviewImprovementRequestModal from '../components/Modals/ReviewImprovementRequestModal.js';

// YORUM & TARTIŞMA AKIŞI BİLEŞENİ
const RequestCommentsThread = ({ req, db, loggedInUser, onPreviewImage }) => {
    const [expanded, setExpanded] = useState(false);
    const [commentText, setCommentText] = useState('');
    const [commentImage, setCommentImage] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const comments = req.comments || [];

    const handleImageUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            alert('Lütfen geçerli bir resim dosyası yükleyiniz.');
            return;
        }
        const reader = new FileReader();
        reader.onloadend = () => {
            setCommentImage(reader.result);
        };
        reader.readAsDataURL(file);
    };

    const handleAddComment = async (e) => {
        e.preventDefault();
        if (!commentText.trim() && !commentImage) return;

        setIsSubmitting(true);
        try {
            const newComment = {
                id: `comment-${Date.now()}`,
                userName: loggedInUser?.name || 'Anonim',
                userRole: loggedInUser?.role || 'Kullanıcı',
                text: commentText.trim(),
                imageUrl: commentImage || null,
                createdAt: new Date().toISOString()
            };

            const docRef = doc(db, IMPROVEMENT_REQUESTS_COLLECTION, req.id);
            await updateDoc(docRef, {
                comments: arrayUnion(newComment)
            });

            setCommentText('');
            setCommentImage(null);
            setExpanded(true);
        } catch (err) {
            console.error("Yorum eklenirken hata oluştu:", err);
            alert("Yorum eklenemedi.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeleteComment = async (commentId) => {
        if (!window.confirm("Bu yorumu silmek istediğinize emin misiniz?")) return;
        try {
            const updatedComments = comments.filter(c => c.id !== commentId);
            const docRef = doc(db, IMPROVEMENT_REQUESTS_COLLECTION, req.id);
            await updateDoc(docRef, {
                comments: updatedComments
            });
        } catch (err) {
            console.error("Yorum silinirken hata oluştu:", err);
            alert("Yorum silinemedi.");
        }
    };

    return (
        <div className="mt-3 border-t border-gray-100 dark:border-gray-700/80 pt-3 space-y-3">
            {/* BAŞLIK VE AÇILIR-KAPANIR BUTON */}
            <div className="flex items-center justify-between text-xs">
                <button
                    type="button"
                    onClick={() => setExpanded(!expanded)}
                    className="flex items-center gap-1.5 font-bold text-gray-700 dark:text-gray-300 hover:text-amber-500 dark:hover:text-amber-400 transition"
                >
                    <MessageSquare className="w-3.5 h-3.5 text-amber-500" />
                    <span>Tartışma & Yorumlar ({comments.length})</span>
                    {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
                {comments.length > 0 && !expanded && (
                    <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">Son yorum: {comments[comments.length - 1].userName}</span>
                )}
            </div>

            {/* YORUM LİSTESİ */}
            {expanded && (
                <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1 custom-scrollbar">
                    {comments.length === 0 ? (
                        <p className="text-[11px] text-gray-400 italic py-1">Henüz yorum yapılmadı. Görüşünüzü ekleyerek tartışmayı başlatın.</p>
                    ) : (
                        comments.map((c) => {
                            const canDelete = loggedInUser?.name === c.userName || loggedInUser?.role === 'ADMIN' || loggedInUser?.role === 'Yönetici';
                            return (
                                <div key={c.id} className="p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-700 space-y-1.5 text-xs">
                                    <div className="flex items-center justify-between gap-2 text-[10px]">
                                        <span className="font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
                                            💬 {c.userName} <span className="text-gray-400 font-normal">({c.userRole})</span>
                                        </span>
                                        <div className="flex items-center gap-2">
                                            <span className="text-gray-400">{new Date(c.createdAt).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                                            {canDelete && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleDeleteComment(c.id)}
                                                    className="text-gray-400 hover:text-red-500 transition"
                                                    title="Yorumu Sil"
                                                >
                                                    <Trash2 className="w-3 h-3" />
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {c.text && (
                                        <p className="text-gray-800 dark:text-gray-200 text-xs leading-relaxed whitespace-pre-wrap">{c.text}</p>
                                    )}

                                    {c.imageUrl && (
                                        <div className="pt-1">
                                            <img
                                                src={c.imageUrl}
                                                alt="Yorum görseli"
                                                onClick={() => onPreviewImage(c.imageUrl)}
                                                className="max-h-36 rounded-lg border border-gray-300 dark:border-gray-600 cursor-pointer hover:opacity-90 object-cover"
                                            />
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
            )}

            {/* YORUM VE GÖRSEL EKLEME FORMU */}
            <form onSubmit={handleAddComment} className="space-y-2 pt-1">
                <div className="relative">
                    <textarea
                        rows="2"
                        placeholder="Bu talebe yanıt verin, teknik detay veya görsel ekleyin..."
                        value={commentText}
                        onChange={(e) => setCommentText(e.target.value)}
                        className="w-full p-2.5 bg-gray-50 dark:bg-gray-700/80 border border-gray-300 dark:border-gray-600 rounded-lg text-xs font-medium text-gray-800 dark:text-gray-200 outline-none focus:ring-2 focus:ring-amber-500"
                    />
                </div>

                {commentImage && (
                    <div className="relative inline-block">
                        <img src={commentImage} alt="Yorum görseli önizleme" className="w-16 h-16 rounded-lg border border-amber-400 object-cover" />
                        <button
                            type="button"
                            onClick={() => setCommentImage(null)}
                            className="absolute -top-1.5 -right-1.5 bg-red-600 text-white rounded-full p-0.5 shadow hover:bg-red-700"
                        >
                            <X className="w-3 h-3" />
                        </button>
                    </div>
                )}

                <div className="flex justify-between items-center gap-2">
                    <label className="cursor-pointer px-2.5 py-1.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition">
                        <ImageIcon className="w-3.5 h-3.5 text-amber-500" /> Görsel Ekle
                        <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                    </label>

                    <button
                        type="submit"
                        disabled={isSubmitting || (!commentText.trim() && !commentImage)}
                        className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-[11px] font-bold shadow transition flex items-center gap-1 disabled:opacity-40 cursor-pointer"
                    >
                        <Send className="w-3 h-3" /> {isSubmitting ? 'Gönderiliyor...' : 'Yorum Yap'}
                    </button>
                </div>
            </form>
        </div>
    );
};

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

                        {/* YORUM & TARTIŞMA AKIŞI PLATFORMU */}
                        <RequestCommentsThread 
                            req={req}
                            db={db}
                            loggedInUser={loggedInUser}
                            onPreviewImage={(url) => setSelectedPreviewImage(url)}
                        />

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
