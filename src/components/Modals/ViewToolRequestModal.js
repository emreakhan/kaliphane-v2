// src/components/Modals/ViewToolRequestModal.js

import React, { useState, useEffect, useRef } from 'react';
import { 
    Wrench, Check, Clock, AlertCircle, CheckCircle2, 
    MessageSquare, Send, X, ExternalLink, Monitor, Package, ShieldAlert, Plus
} from 'lucide-react';
import { 
    collection, query, where, onSnapshot, doc, updateDoc, arrayUnion 
} from 'firebase/firestore';
import { db } from '../../config/firebase.js';
import Modal from './Modal.js';

const ViewToolRequestModal = ({ isOpen, onClose, moldId, taskId, moldName, taskName, loggedInUser, onCreateRequest }) => {
    const [request, setRequest] = useState(null);
    const [loading, setLoading] = useState(true);
    const [chatInput, setChatInput] = useState('');
    const chatEndRef = useRef(null);

    useEffect(() => {
        if (!isOpen || !db || !moldId || !taskId) return;

        setLoading(true);
        const q = query(
            collection(db, 'artifacts/default-app-id/public/data/toolRequests'),
            where('moldId', '==', moldId),
            where('taskId', '==', taskId)
        );

        const unsub = onSnapshot(q, (snap) => {
            if (!snap.empty) {
                const reqDoc = snap.docs[0];
                setRequest({ id: reqDoc.id, ...reqDoc.data() });
            } else {
                setRequest(null);
            }
            setLoading(false);
        }, (err) => {
            console.error("Takım talebi yükleme hatası:", err);
            setLoading(false);
        });

        return () => unsub();
    }, [isOpen, moldId, taskId]);

    useEffect(() => {
        if (chatEndRef.current) {
            chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [request?.messages]);

    const handleSendMessage = async (e) => {
        e.preventDefault();
        if (!chatInput.trim() || !request) return;

        const messageData = {
            senderName: loggedInUser?.name || 'CAM Operatörü',
            senderRole: loggedInUser?.role || 'CAM Operatörü',
            text: chatInput.trim(),
            timestamp: new Date().toISOString()
        };

        try {
            await updateDoc(doc(db, 'artifacts/default-app-id/public/data/toolRequests', request.id), {
                messages: arrayUnion(messageData),
                updatedAt: new Date().toISOString()
            });
            setChatInput('');
        } catch (error) {
            console.error("Mesaj gönderilemedi:", error);
        }
    };

    const getRequestStatusBadge = (status) => {
        switch (status) {
            case 'PENDING':
                return <span className="px-3 py-1 text-xs font-black bg-amber-500/10 text-amber-600 border border-amber-500/30 rounded-full flex items-center gap-1.5"><Clock className="w-3.5 h-3.5"/> Takımhane Sırasında (Bekliyor)</span>;
            case 'PREPARING':
                return <span className="px-3 py-1 text-xs font-black bg-blue-500/10 text-blue-600 border border-blue-500/30 rounded-full animate-pulse flex items-center gap-1.5"><Wrench className="w-3.5 h-3.5"/> Takımhanede Hazırlanıyor</span>;
            case 'EDITED':
                return <span className="px-3 py-1 text-xs font-black bg-cyan-500/10 text-cyan-600 border border-cyan-500/30 rounded-full flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5"/> Talebiniz Düzenlendi</span>;
            case 'COMPLETED':
                return <span className="px-3 py-1 text-xs font-black bg-emerald-500/10 text-emerald-600 border border-emerald-500/30 rounded-full flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5"/> Takımlar Hazırlandı (Tamamlandı)</span>;
            default:
                return <span className="px-3 py-1 text-xs font-black bg-gray-500/10 text-gray-600 border border-gray-500/30 rounded-full">{status}</span>;
        }
    };

    const getToolStatusBadge = (status) => {
        switch (status) {
            case 'PENDING':
                return <span className="text-[11px] px-2 py-0.5 rounded font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">Bekliyor</span>;
            case 'READY':
                return <span className="text-[11px] px-2 py-0.5 rounded font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 flex items-center gap-1"><Check className="w-3 h-3"/> Hazır</span>;
            case 'MISSING':
                return <span className="text-[11px] px-2 py-0.5 rounded font-bold bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 flex items-center gap-1"><X className="w-3 h-3"/> Eksik / Stok Yok</span>;
            default:
                return <span className="text-[11px] px-2 py-0.5 rounded font-bold bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300">{status || 'Sırada'}</span>;
        }
    };

    if (!isOpen) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Takımhane Takım Hazırlama Talebi Canlı Durumu">
            {loading ? (
                <div className="p-10 text-center text-gray-500 font-bold animate-pulse">
                    Takımhane talep verisi yükleniyor...
                </div>
            ) : !request ? (
                <div className="p-8 text-center bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-dashed border-gray-300 dark:border-gray-700 space-y-4">
                    <Wrench className="w-12 h-12 text-gray-400 mx-auto opacity-60" />
                    <div>
                        <h4 className="text-lg font-bold text-gray-800 dark:text-gray-200 mb-1">Takım Talebi Bulunamadı</h4>
                        <p className="text-sm text-gray-500">Bu parça ({taskName || 'Parça'}) için henüz takımhaneye iletilmiş aktif bir takım hazırlama talebi bulunmuyor.</p>
                    </div>
                    {onCreateRequest && (
                        <button 
                            type="button"
                            onClick={() => { onClose(); onCreateRequest(moldId, taskId); }}
                            className="px-5 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl font-bold text-sm shadow-md transition inline-flex items-center active:scale-95"
                        >
                            <Plus className="w-4 h-4 mr-1.5" /> + Takım Talebi / Ön Hazırlık Oluştur
                        </button>
                    )}
                </div>
            ) : (
                <div className="space-y-6">
                    {/* Header Info */}
                    <div className="bg-gradient-to-r from-slate-900 to-indigo-950 text-white p-5 rounded-xl shadow-md border border-indigo-950">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-3">
                            <div>
                                <span className="text-xs font-bold text-indigo-300 uppercase tracking-wider">{request.moldName || moldName}</span>
                                <h3 className="text-xl font-black text-white">{request.taskName || taskName}</h3>
                            </div>
                            <div>{getRequestStatusBadge(request.status)}</div>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs pt-3 border-t border-indigo-800/50">
                            <div>
                                <span className="text-indigo-300 font-bold block">Hedef Tezgah:</span>
                                <span className="font-extrabold text-white text-sm flex items-center gap-1 mt-0.5"><Monitor className="w-3.5 h-3.5 text-indigo-400"/> {request.machineName}</span>
                            </div>
                            <div>
                                <span className="text-indigo-300 font-bold block">Talep Eden:</span>
                                <span className="font-extrabold text-white text-sm mt-0.5 block">{request.requesterName}</span>
                            </div>
                            <div>
                                <span className="text-indigo-300 font-bold block">Tarih:</span>
                                <span className="font-extrabold text-white text-sm mt-0.5 block">{new Date(request.createdAt).toLocaleDateString('tr-TR')} {new Date(request.createdAt).toLocaleTimeString('tr-TR', {hour:'2-digit', minute:'2-digit'})}</span>
                            </div>
                        </div>
                    </div>

                    {/* Tools List */}
                    <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-4 bg-white dark:bg-gray-800 shadow-sm">
                        <h4 className="font-bold text-gray-900 dark:text-white text-sm mb-3 flex items-center">
                            <Wrench className="w-4 h-4 mr-2 text-orange-500" /> Talep Edilen Takım Listesi ({request.tools?.length || 0})
                        </h4>

                        <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar pr-1">
                            {request.tools?.map((tool, idx) => (
                                <div key={tool.id || idx} className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                                    <div className="flex-1">
                                        <div className="font-bold text-sm text-gray-900 dark:text-white flex items-center gap-2 flex-wrap">
                                            <span>{tool.toolName}</span>
                                            {tool.holderType && <span className="text-[10px] bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300 px-1.5 py-0.5 rounded font-bold">{tool.holderType}</span>}
                                            {tool.length && <span className="text-[10px] bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300 px-1.5 py-0.5 rounded font-bold">L: {tool.length}</span>}
                                            {tool.shrinkLength && <span className="text-[10px] bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300 px-1.5 py-0.5 rounded font-bold">Shrink: {tool.shrinkLength}</span>}
                                            {tool.condition && tool.condition !== 'ANY' && <span className="text-[10px] bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-300 px-1.5 py-0.5 rounded font-bold">{tool.condition === 'NEW' ? 'Sıfır' : 'Az Kullanılmış'}</span>}
                                        </div>
                                        {tool.notes && <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 italic">Not: "{tool.notes}"</div>}
                                    </div>
                                    <div className="shrink-0">{getToolStatusBadge(tool.status)}</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Notes & Chat Section */}
                    {request.notes && (
                        <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg text-xs font-semibold text-amber-900 dark:text-amber-300">
                            <strong>Talimatlar / Notlar:</strong> {request.notes}
                        </div>
                    )}

                    {/* Takımhane İletişim / Mesajlaşma */}
                    <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-4 bg-gray-50 dark:bg-gray-800/40">
                        <h4 className="font-bold text-gray-900 dark:text-white text-xs mb-3 flex items-center">
                            <MessageSquare className="w-4 h-4 mr-2 text-blue-500" /> Takımhane Sorumlusu İle Canlı Mesajlaşma
                        </h4>

                        <div className="space-y-2 mb-3 max-h-40 overflow-y-auto custom-scrollbar p-2 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 min-h-[80px]">
                            {(!request.messages || request.messages.length === 0) ? (
                                <p className="text-xs text-gray-400 italic text-center py-4">Henüz bir mesaj gönderilmedi.</p>
                            ) : (
                                request.messages.map((msg, idx) => (
                                    <div key={idx} className={`p-2 rounded-lg text-xs ${msg.senderRole === 'Bildirim' ? 'bg-blue-50 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 text-center font-bold' : (msg.senderName === loggedInUser?.name ? 'bg-blue-600 text-white ml-8 text-right' : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white mr-8')}`}>
                                        <div className="font-bold text-[10px] opacity-75">{msg.senderName} ({msg.senderRole})</div>
                                        <div className="mt-0.5 font-medium">{msg.text}</div>
                                    </div>
                                ))
                            )}
                            <div ref={chatEndRef} />
                        </div>

                        <form onSubmit={handleSendMessage} className="flex gap-2">
                            <input 
                                type="text" 
                                placeholder="Takımhaneye mesaj yazın..." 
                                value={chatInput} 
                                onChange={(e) => setChatInput(e.target.value)} 
                                className="flex-1 p-2 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white" 
                            />
                            <button type="submit" disabled={!chatInput.trim()} className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg font-bold text-xs flex items-center transition">
                                <Send className="w-3.5 h-3.5 mr-1" /> Gönder
                            </button>
                        </form>
                    </div>

                </div>
            )}
        </Modal>
    );
};

export default ViewToolRequestModal;
