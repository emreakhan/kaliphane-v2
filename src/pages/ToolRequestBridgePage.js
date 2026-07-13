// src/pages/ToolRequestBridgePage.js

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
    Plus, Trash2, ClipboardList, Send, MessageSquare, AlertCircle, 
    CheckCircle2, Loader2, Play, Check, X, ShieldAlert, User, Search
} from 'lucide-react';
import { 
    collection, addDoc, onSnapshot, query, orderBy, doc, updateDoc, arrayUnion 
} from 'firebase/firestore';
import { ROLES } from '../config/constants.js';

const ToolRequestBridgePage = ({ db, loggedInUser, machines = [], projects = [] }) => {
    // Role checkers
    const isManagerOrToolroom = useMemo(() => {
        if (!loggedInUser?.role) return false;
        return [ROLES.ADMIN, ROLES.SUPERVISOR, ROLES.TAKIMHANE_SORUMLUSU].includes(loggedInUser.role);
    }, [loggedInUser]);

    // Tab and Active states
    const [activeTab, setActiveTab] = useState('active'); // 'active' | 'my' | 'completed' | 'create'
    const [requests, setRequests] = useState([]);
    const [selectedRequest, setSelectedRequest] = useState(null);
    const [loading, setLoading] = useState(true);

    // Create Request Form states
    const [targetMachine, setTargetMachine] = useState('');
    const [machineSearchQuery, setMachineSearchQuery] = useState('');
    const [isMachineDropdownOpen, setIsMachineDropdownOpen] = useState(false);
    
    const [selectedMoldId, setSelectedMoldId] = useState('');
    const [selectedTaskId, setSelectedTaskId] = useState('');
    const [generalNotes, setGeneralNotes] = useState('');
    
    // Dynamic tools list in form
    const [formTools, setFormTools] = useState([
        { id: '1', toolName: '', holderType: '', length: '', shrinkLength: '', isShrink: false, condition: 'ANY', notes: '' }
    ]);

    const [editingRequestId, setEditingRequestId] = useState(null);

    const startEditingRequest = (req) => {
        setEditingRequestId(req.id);
        setTargetMachine(req.machineName);
        setMachineSearchQuery(req.machineName);
        setSelectedMoldId(req.moldId || '');
        setSelectedTaskId(req.taskId || '');
        setGeneralNotes(req.notes || '');
        setFormTools(req.tools.map(t => ({
            id: t.id,
            toolName: t.toolName,
            holderType: t.holderType || '',
            length: t.length || '',
            shrinkLength: t.shrinkLength || '',
            isShrink: !!t.isShrink,
            condition: t.condition,
            notes: t.notes || '',
            status: t.status || 'PENDING'
        })));
        setActiveTab('create');
    };

    // Chat input state
    const [chatInput, setChatInput] = useState('');
    const chatEndRef = useRef(null);

    // Real-time Tool Requests Listener
    useEffect(() => {
        if (!db) return;
        setLoading(true);
        const q = query(
            collection(db, 'artifacts/default-app-id/public/data/toolRequests'),
            orderBy('createdAt', 'desc')
        );

        const unsub = onSnapshot(q, (snapshot) => {
            const list = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setRequests(list);
            setLoading(false);
        }, (err) => {
            console.error("Firestore loading error:", err);
            setLoading(false);
        });

        return () => unsub();
    }, [db]);

    // Keep selected request updated if the requests list changes
    useEffect(() => {
        if (selectedRequest) {
            const updated = requests.find(r => r.id === selectedRequest.id);
            if (updated && JSON.stringify(updated) !== JSON.stringify(selectedRequest)) {
                setSelectedRequest(updated);
            }
        }
    }, [requests, selectedRequest]);

    // Scroll chat to bottom
    useEffect(() => {
        if (chatEndRef.current) {
            chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [selectedRequest?.messages]);

    // Filter projects to list molds and their tasks
    const activeMolds = useMemo(() => {
        return projects.filter(p => p.status !== 'COMPLETED' && p.status !== 'TAMAMLANDI');
    }, [projects]);

    const activeTasks = useMemo(() => {
        if (!selectedMoldId) return [];
        const mold = projects.find(p => p.id === selectedMoldId);
        return mold?.tasks || [];
    }, [selectedMoldId, projects]);

    // Categorized requests
    const filteredRequests = useMemo(() => {
        const isCamOperator = [ROLES.CAM_OPERATOR, 'CAM Sorumlusu'].includes(loggedInUser?.role);
        return requests.filter(req => {
            // CAM Operatörü ise sadece kendi açtığı talepleri görebilir
            if (isCamOperator && req.requesterName !== loggedInUser?.name) {
                return false;
            }

            if (activeTab === 'completed') {
                return req.status === 'COMPLETED';
            }
            if (activeTab === 'my') {
                return req.status !== 'COMPLETED' && req.requesterName === loggedInUser?.name;
            }
            // 'active' tab shows everything currently pending/preparing
            return req.status !== 'COMPLETED';
        });
    }, [requests, activeTab, loggedInUser]);

    // Handle form dynamic tools actions
    const addFormToolRow = () => {
        setFormTools(prev => [
            ...prev,
            { id: Date.now().toString(), toolName: '', holderType: '', length: '', shrinkLength: '', isShrink: false, condition: 'ANY', notes: '' }
        ]);
    };

    const removeFormToolRow = (id) => {
        if (formTools.length === 1) return;
        setFormTools(prev => prev.filter(t => t.id !== id));
    };

    const updateFormToolValue = (id, field, value) => {
        setFormTools(prev => prev.map(t => t.id === id ? { ...t, [field]: value } : t));
    };

    // Submit request to Firestore (Create or Edit)
    const handleCreateRequest = async (e) => {
        e.preventDefault();
        if (!targetMachine) {
            alert("Lütfen bir tezgah seçiniz!");
            return;
        }

        // Validate tools list
        const validTools = formTools.filter(t => t.toolName.trim() !== '');
        if (validTools.length === 0) {
            alert("En az bir adet takım adı/tanımı girmelisiniz!");
            return;
        }

        const mold = projects.find(p => p.id === selectedMoldId);
        const task = mold?.tasks?.find(t => t.id === selectedTaskId);

        if (editingRequestId) {
            // Update existing request
            const updatedRequest = {
                machineName: targetMachine,
                moldId: selectedMoldId || null,
                moldName: mold?.moldName || null,
                taskId: selectedTaskId || null,
                taskName: task?.name || null,
                status: 'EDITED', // Mark request as EDITED (Düzenlendi) so toolroom operator sees it
                notes: generalNotes,
                updatedAt: new Date().toISOString(),
                tools: validTools.map(t => ({
                    id: t.id,
                    toolName: t.toolName.trim(),
                    holderType: t.holderType.trim() || null,
                    length: t.length.trim() || null,
                    shrinkLength: t.shrinkLength.trim() || null,
                    isShrink: !!t.isShrink,
                    condition: t.condition,
                    status: t.status || 'PENDING', // Preserve status if editing
                    notes: t.notes.trim() || null
                }))
            };

            try {
                const requestDocRef = doc(db, 'artifacts/default-app-id/public/data/toolRequests', editingRequestId);
                await updateDoc(requestDocRef, updatedRequest);
                
                // Append notification/system message to chat log
                const systemMessage = {
                    senderName: 'Sistem',
                    senderRole: 'Bildirim',
                    text: `Bu talep ${loggedInUser?.name || 'Kullanıcı'} tarafından yeniden düzenlendi.`,
                    timestamp: new Date().toISOString()
                };
                await updateDoc(requestDocRef, {
                    messages: arrayUnion(systemMessage)
                });

                alert("Talep başarıyla güncellendi ve 'Düzenlendi' olarak işaretlendi!");
                
                // Clear state
                setEditingRequestId(null);
                setTargetMachine('');
                setMachineSearchQuery('');
                setSelectedMoldId('');
                setSelectedTaskId('');
                setGeneralNotes('');
                setFormTools([{ id: '1', toolName: '', holderType: '', length: '', shrinkLength: '', isShrink: false, condition: 'ANY', notes: '' }]);
                setActiveTab('active');
            } catch (error) {
                console.error("Talep güncellenirken hata oluştu:", error);
                alert("Talep güncellenemedi: " + error.message);
            }
        } else {
            // Create new request
            const newRequest = {
                requesterName: loggedInUser?.name || 'Bilinmeyen Kullanıcı',
                requesterRole: loggedInUser?.role || 'Operatör',
                machineName: targetMachine,
                moldId: selectedMoldId || null,
                moldName: mold?.moldName || null,
                taskId: selectedTaskId || null,
                taskName: task?.name || null,
                status: 'PENDING', // PENDING -> PREPARING -> COMPLETED
                notes: generalNotes,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                tools: validTools.map(t => ({
                    id: t.id,
                    toolName: t.toolName.trim(),
                    holderType: t.holderType.trim() || null,
                    length: t.length.trim() || null,
                    shrinkLength: t.shrinkLength.trim() || null,
                    isShrink: !!t.isShrink,
                    condition: t.condition,
                    status: 'PENDING', // PENDING -> READY -> MISSING
                    notes: t.notes.trim() || null
                })),
                messages: []
            };

            try {
                await addDoc(collection(db, 'artifacts/default-app-id/public/data/toolRequests'), newRequest);
                alert("Takım talebiniz başarıyla takımhaneye iletildi!");
                // Reset Form
                setTargetMachine('');
                setMachineSearchQuery('');
                setSelectedMoldId('');
                setSelectedTaskId('');
                setGeneralNotes('');
                setFormTools([{ id: '1', toolName: '', holderType: '', length: '', shrinkLength: '', isShrink: false, condition: 'ANY', notes: '' }]);
                setActiveTab('active');
            } catch (error) {
                console.error("Talebi gönderirken hata oluştu:", error);
                alert("Talep iletilemedi: " + error.message);
            }
        }
    };

    // Update entire request status
    const updateRequestStatus = async (reqId, newStatus) => {
        try {
            await updateDoc(doc(db, 'artifacts/default-app-id/public/data/toolRequests', reqId), {
                status: newStatus,
                updatedAt: new Date().toISOString()
            });
        } catch (error) {
            console.error("Status update error:", error);
            alert("Durum güncellenemedi.");
        }
    };

    // Update single tool status inside the request
    const updateToolStatus = async (request, toolId, newToolStatus) => {
        const updatedTools = request.tools.map(t => 
            t.id === toolId ? { ...t, status: newToolStatus } : t
        );

        // Auto-check: If any tool status is MISSING, we can set the general status to PENDING or flag it
        // Or if all tools are READY, we can suggest marking as COMPLETED
        try {
            await updateDoc(doc(db, 'artifacts/default-app-id/public/data/toolRequests', request.id), {
                tools: updatedTools,
                updatedAt: new Date().toISOString()
            });
        } catch (error) {
            console.error("Tool status update error:", error);
        }
    };

    // Send chat message
    const handleSendMessage = async (e) => {
        e.preventDefault();
        if (!chatInput.trim() || !selectedRequest) return;

        const messageData = {
            senderName: loggedInUser?.name || 'Bilinmeyen',
            senderRole: loggedInUser?.role || 'Kullanıcı',
            text: chatInput.trim(),
            timestamp: new Date().toISOString()
        };

        try {
            await updateDoc(doc(db, 'artifacts/default-app-id/public/data/toolRequests', selectedRequest.id), {
                messages: arrayUnion(messageData),
                updatedAt: new Date().toISOString()
            });
            setChatInput('');
        } catch (error) {
            console.error("Mesaj gönderilemedi:", error);
        }
    };

    // Status styling helpers
    const getRequestStatusBadge = (status) => {
        switch (status) {
            case 'PENDING':
                return <span className="px-2.5 py-1 text-xs font-black bg-amber-500/10 text-amber-500 border border-amber-500/20 rounded-full">Sırada (Bekliyor)</span>;
            case 'PREPARING':
                return <span className="px-2.5 py-1 text-xs font-black bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-full animate-pulse">Hazırlanıyor</span>;
            case 'EDITED':
                return <span className="px-2.5 py-1 text-xs font-black bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 rounded-full">Düzenlendi</span>;
            case 'COMPLETED':
                return <span className="px-2.5 py-1 text-xs font-black bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full">Tamamlandı</span>;
            default:
                return <span className="px-2.5 py-1 text-xs font-black bg-gray-500/10 text-gray-400 border border-gray-500/20 rounded-full">{status}</span>;
        }
    };

    const getToolStatusBadge = (status) => {
        switch (status) {
            case 'PENDING':
                return <span className="text-[10px] px-2 py-0.5 rounded font-bold bg-amber-500/10 text-amber-500">Sırada</span>;
            case 'READY':
                return <span className="text-[10px] px-2 py-0.5 rounded font-bold bg-emerald-500/10 text-emerald-400 flex items-center gap-1 w-fit"><Check className="w-3 h-3" /> Hazır</span>;
            case 'MISSING':
                return <span className="text-[10px] px-2 py-0.5 rounded font-bold bg-rose-500/10 text-rose-500 flex items-center gap-1 w-fit"><X className="w-3 h-3" /> Eksik / Yok</span>;
            default:
                return <span className="text-[10px] px-2 py-0.5 rounded font-bold bg-gray-500/10 text-gray-400">{status}</span>;
        }
    };

    return (
        <div className="flex flex-col h-[calc(100vh-64px)] overflow-hidden bg-gray-900 text-gray-100 font-sans">
            {/* ÜST BİLGİ VE TAB MENÜSÜ */}
            <div className="bg-gray-800 border-b border-gray-700 px-6 py-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shrink-0">
                <div>
                    <h1 className="text-xl font-black tracking-wide text-white flex items-center gap-2">
                        <ClipboardList className="w-6 h-6 text-blue-500" /> CAM & Takımhane Köprüsü
                    </h1>
                    <p className="text-xs text-gray-400 mt-1">
                        CAM operatörlerinin takım taleplerini anlık oluşturduğu ve takımhanenin hazırlık durumunu izlediği panel.
                    </p>
                </div>

                {/* Tab Butonları */}
                <div className="flex gap-2 bg-gray-900 p-1 rounded-xl border border-gray-700">
                    <button 
                        onClick={() => { setActiveTab('active'); setSelectedRequest(null); }}
                        className={`px-4 py-1.5 text-xs font-black rounded-lg transition-all ${activeTab === 'active' ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-400 hover:text-gray-200'}`}
                    >
                        Aktif Talepler
                    </button>
                    <button 
                        onClick={() => { setActiveTab('my'); setSelectedRequest(null); }}
                        className={`px-4 py-1.5 text-xs font-black rounded-lg transition-all ${activeTab === 'my' ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-400 hover:text-gray-200'}`}
                    >
                        Taleplerim
                    </button>
                    <button 
                        onClick={() => { setActiveTab('completed'); setSelectedRequest(null); }}
                        className={`px-4 py-1.5 text-xs font-black rounded-lg transition-all ${activeTab === 'completed' ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-400 hover:text-gray-200'}`}
                    >
                        Tamamlananlar
                    </button>
                    <button 
                        onClick={() => { setActiveTab('create'); setSelectedRequest(null); }}
                        className={`px-4 py-1.5 text-xs font-black rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-all flex items-center gap-1 shadow-md`}
                    >
                        <Plus className="w-3.5 h-3.5" /> Yeni Talep
                    </button>
                </div>
            </div>

            {/* ANA ALAN */}
            <div className="flex-1 flex overflow-hidden">
                {activeTab === 'create' ? (
                    /* YENİ TALEP OLUŞTURMA SAYFASI */
                    <div className="flex-1 overflow-auto p-6 md:p-10 max-w-4xl mx-auto">
                        <form onSubmit={handleCreateRequest} className="bg-gray-800 border border-gray-700 rounded-2xl p-6 shadow-xl space-y-6">
                            <h2 className="text-lg font-black text-white border-b border-gray-700 pb-3 flex items-center gap-2">
                                <Plus className="w-5 h-5 text-emerald-500" /> Yeni Takım Hazırlama Talebi Oluştur
                            </h2>

                            {/* Üst Alan: Tezgah, Kalıp, Operasyon Seçimi */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="space-y-1.5 relative">
                                    <label className="text-[10px] font-black text-gray-400 uppercase">Talep Edilen Tezgah *</label>
                                    <div className="relative">
                                        <input 
                                            required
                                            type="text"
                                            placeholder="Tezgah Ara/Seç..."
                                            value={machineSearchQuery}
                                            onFocus={() => setIsMachineDropdownOpen(true)}
                                            onBlur={() => setTimeout(() => setIsMachineDropdownOpen(false), 200)}
                                            onChange={(e) => {
                                                setMachineSearchQuery(e.target.value);
                                                setTargetMachine(e.target.value);
                                                setIsMachineDropdownOpen(true);
                                            }}
                                            className="w-full bg-gray-900 border border-gray-700 rounded-xl pl-3.5 pr-10 py-2.5 text-sm font-bold text-white focus:outline-none focus:border-blue-500"
                                        />
                                        <Search className="w-4 h-4 text-gray-400 absolute right-3.5 top-3.5 pointer-events-none" />
                                    </div>
                                    
                                    {isMachineDropdownOpen && (
                                        <div className="absolute left-0 right-0 mt-1 bg-gray-800 border border-gray-750 rounded-xl shadow-2xl z-50 max-h-60 overflow-y-auto divide-y divide-gray-750">
                                            {machines
                                                .filter(m => m.name.toLowerCase().includes(machineSearchQuery.toLowerCase()))
                                                .map(m => (
                                                    <div 
                                                        key={m.id}
                                                        onMouseDown={() => {
                                                            setTargetMachine(m.name);
                                                            setMachineSearchQuery(m.name);
                                                            setIsMachineDropdownOpen(false);
                                                        }}
                                                        className="px-4 py-2.5 hover:bg-blue-600 hover:text-white cursor-pointer text-sm font-bold transition text-gray-200"
                                                    >
                                                        {m.name}
                                                    </div>
                                                ))}
                                            {machines.filter(m => m.name.toLowerCase().includes(machineSearchQuery.toLowerCase())).length === 0 && (
                                                <div className="px-4 py-2.5 text-xs text-gray-500 italic">Sonuç bulunamadı.</div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-gray-400 uppercase">İlişkili Kalıp (Opsiyonel)</label>
                                    <select 
                                        value={selectedMoldId} 
                                        onChange={(e) => { setSelectedMoldId(e.target.value); setSelectedTaskId(''); }}
                                        className="w-full bg-gray-900 border border-gray-700 rounded-xl px-3.5 py-2.5 text-sm font-bold text-white focus:outline-none focus:border-blue-500"
                                    >
                                        <option value="">Seçiniz...</option>
                                        {activeMolds.map(p => (
                                            <option key={p.id} value={p.id}>{p.moldName}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-gray-400 uppercase">İlişkili Parça/Operasyon (Opsiyonel)</label>
                                    <select 
                                        disabled={!selectedMoldId}
                                        value={selectedTaskId} 
                                        onChange={(e) => setSelectedTaskId(e.target.value)}
                                        className="w-full bg-gray-900 border border-gray-700 rounded-xl px-3.5 py-2.5 text-sm font-bold text-white focus:outline-none focus:border-blue-500 disabled:opacity-40"
                                    >
                                        <option value="">Seçiniz...</option>
                                        {activeTasks.map(t => (
                                            <option key={t.id} value={t.id}>{t.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {/* Takım Tablosu */}
                            <div className="space-y-3">
                                <div className="flex justify-between items-center">
                                    <label className="text-[10px] font-black text-gray-400 uppercase">Talep Edilen Takımlar Listesi</label>
                                    <button 
                                        type="button"
                                        onClick={addFormToolRow}
                                        className="px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 border border-blue-500/20 rounded-lg text-xs font-black transition flex items-center gap-1"
                                    >
                                        <Plus className="w-3.5 h-3.5" /> Takım Ekle
                                    </button>
                                </div>

                                <div className="border border-gray-700 rounded-xl overflow-hidden shadow-inner bg-gray-900 p-2 space-y-2">
                                    {/* Kolon Başlıkları */}
                                    <div className="hidden md:flex items-center gap-2 px-3 py-1 text-[10px] font-black text-gray-400 uppercase tracking-wider border-b border-gray-800 pb-2">
                                        <div className="w-[3%] text-center">#</div>
                                        <div className="w-[22%]">Takım Adı / Çapı *</div>
                                        <div className="w-[13%]">Tutucu Tipi</div>
                                        <div className="w-[10%]">Shrink?</div>
                                        <div className="w-[10%]">Takım Boyu</div>
                                        <div className="w-[10%]">Shrink Boyu</div>
                                        <div className="w-[12%]">Kondisyon</div>
                                        <div className="w-[16%]">Özel Açıklama / Not</div>
                                        <div className="w-[4%] text-center"></div>
                                    </div>

                                    {formTools.map((t, idx) => (
                                        <div key={t.id} className="flex flex-col md:flex-row items-start md:items-center gap-2 p-3 bg-gray-800/50 border border-gray-700 rounded-lg relative">
                                            <span className="absolute md:static top-2 left-2 text-[10px] font-black text-gray-500 bg-gray-900 w-5 h-5 rounded-full flex items-center justify-center shrink-0 w-[3%]">
                                                {idx + 1}
                                            </span>
                                            
                                            <div className="w-full md:w-[22%]">
                                                <input 
                                                    required
                                                    type="text" 
                                                    placeholder="Takım adı girin"
                                                    value={t.toolName}
                                                    onChange={(e) => updateFormToolValue(t.id, 'toolName', e.target.value)}
                                                    className="w-full bg-gray-900 border border-gray-750 rounded-lg px-2.5 py-2 text-xs text-white placeholder-gray-550 focus:outline-none focus:border-blue-500 font-bold"
                                                />
                                            </div>

                                            <div className="w-full md:w-[13%]">
                                                <input 
                                                    type="text" 
                                                    placeholder="Örn: HSK63"
                                                    value={t.holderType}
                                                    onChange={(e) => updateFormToolValue(t.id, 'holderType', e.target.value)}
                                                    className="w-full bg-gray-900 border border-gray-750 rounded-lg px-2.5 py-2 text-xs text-white placeholder-gray-550 focus:outline-none focus:border-blue-500 font-semibold"
                                                />
                                            </div>

                                            <div className="w-full md:w-[10%]">
                                                <select
                                                    value={t.isShrink ? 'YES' : 'NO'}
                                                    onChange={(e) => {
                                                        const val = e.target.value === 'YES';
                                                        updateFormToolValue(t.id, 'isShrink', val);
                                                        if (!val) {
                                                            updateFormToolValue(t.id, 'shrinkLength', ''); // reset shrink length if turned off
                                                        }
                                                    }}
                                                    className="w-full bg-gray-900 border border-gray-750 rounded-lg px-2.5 py-2 text-xs text-white focus:outline-none focus:border-blue-500 font-semibold"
                                                >
                                                    <option value="NO">Hayır</option>
                                                    <option value="YES">Evet</option>
                                                </select>
                                            </div>

                                            <div className="w-full md:w-[10%]">
                                                <input 
                                                    type="text" 
                                                    placeholder="Örn: 45mm"
                                                    value={t.length}
                                                    onChange={(e) => updateFormToolValue(t.id, 'length', e.target.value)}
                                                    className="w-full bg-gray-900 border border-gray-750 rounded-lg px-2.5 py-2 text-xs text-white placeholder-gray-550 focus:outline-none focus:border-blue-500 font-semibold"
                                                />
                                            </div>

                                            <div className="w-full md:w-[10%]">
                                                <input 
                                                    disabled={!t.isShrink}
                                                    type="text" 
                                                    placeholder={t.isShrink ? "Örn: 60mm" : "Gerekmez"}
                                                    value={t.shrinkLength}
                                                    onChange={(e) => updateFormToolValue(t.id, 'shrinkLength', e.target.value)}
                                                    className="w-full bg-gray-900 border border-gray-750 rounded-lg px-2.5 py-2 text-xs text-white placeholder-gray-550 focus:outline-none focus:border-blue-500 disabled:opacity-30 disabled:bg-gray-950/20"
                                                />
                                            </div>

                                            <div className="w-full md:w-[12%]">
                                                <select
                                                    value={t.condition}
                                                    onChange={(e) => updateFormToolValue(t.id, 'condition', e.target.value)}
                                                    className="w-full bg-gray-900 border border-gray-750 rounded-lg px-2.5 py-2 text-xs text-white focus:outline-none focus:border-blue-500 font-semibold"
                                                >
                                                    <option value="ANY">Fark Etmez</option>
                                                    <option value="NEW">Sıfır</option>
                                                    <option value="USED">Az Kullanılmış</option>
                                                </select>
                                            </div>

                                            <div className="w-full md:w-[16%]">
                                                <input 
                                                    type="text" 
                                                    placeholder="Açıklama girin..."
                                                    value={t.notes}
                                                    onChange={(e) => updateFormToolValue(t.id, 'notes', e.target.value)}
                                                    className="w-full bg-gray-900 border border-gray-750 rounded-lg px-2.5 py-2 text-xs text-white placeholder-gray-550 focus:outline-none focus:border-blue-500 font-medium"
                                                />
                                            </div>

                                            <button 
                                                type="button"
                                                disabled={formTools.length === 1}
                                                onClick={() => removeFormToolRow(t.id)}
                                                className="absolute md:static top-2 right-2 text-rose-500 hover:text-rose-400 p-1.5 hover:bg-rose-500/10 rounded-lg disabled:opacity-30 transition w-[4%] flex justify-center"
                                                title="Satırı Sil"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Genel Talep Açıklaması */}
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-gray-400 uppercase">Genel Talep Notu / Sipariş Notu</label>
                                <textarea 
                                    placeholder="Takımhaneye iletmek istediğiniz genel sipariş açıklamasını buraya yazın..."
                                    rows="2"
                                    value={generalNotes}
                                    onChange={(e) => setGeneralNotes(e.target.value)}
                                    className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                                />
                            </div>

                            {/* Form Gönderim Düğmeleri */}
                            <div className="flex justify-end gap-3 border-t border-gray-700 pt-5">
                                <button 
                                    type="button"
                                    onClick={() => { setActiveTab('active'); }}
                                    className="px-5 py-2.5 bg-gray-700 hover:bg-gray-600 rounded-xl text-sm font-bold text-gray-300 transition"
                                >
                                    İptal Et
                                </button>
                                <button 
                                    type="submit"
                                    className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 rounded-xl text-sm font-black text-white shadow-lg transition flex items-center gap-1.5"
                                >
                                    <Send className="w-4 h-4" /> Talebi Takımhaneye Gönder
                                </button>
                            </div>
                        </form>
                    </div>
                ) : (
                    /* DİĞER TABLAR: LİSTELENEN TALEPLER VE KÖPRÜ DETAYI */
                    <div className="flex-1 flex overflow-hidden">
                        {/* Sol Taraf: Talepler Listesi */}
                        <div className="w-full md:w-2/5 border-r border-gray-700 flex flex-col overflow-hidden bg-gray-900">
                            <div className="p-4 border-b border-gray-700 bg-gray-800/40">
                                <div className="text-xs font-black text-gray-400 uppercase tracking-wider">
                                    {activeTab === 'active' && 'TÜM AKTİF TALEPLER'}
                                    {activeTab === 'my' && 'KENDİ TALEPLERİM'}
                                    {activeTab === 'completed' && 'TAMAMLANAN TALEPLER'}
                                </div>
                            </div>

                            <div className="flex-1 overflow-auto divide-y divide-gray-800 p-2 space-y-1">
                                {loading ? (
                                    <div className="flex flex-col items-center justify-center py-20 text-gray-500 space-y-3">
                                        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                                        <span className="text-xs">Talepler yükleniyor...</span>
                                    </div>
                                ) : filteredRequests.length === 0 ? (
                                    <div className="text-center py-20 text-gray-500 italic text-xs">
                                        Listelenecek herhangi bir talep bulunamadı.
                                    </div>
                                ) : (
                                    filteredRequests.map(req => {
                                        const isSelected = selectedRequest?.id === req.id;
                                        const missingCount = req.tools?.filter(t => t.status === 'MISSING').length || 0;
                                        
                                        return (
                                            <div 
                                                key={req.id}
                                                onClick={() => setSelectedRequest(req)}
                                                className={`p-4 rounded-xl cursor-pointer transition-all ${
                                                    isSelected 
                                                        ? 'bg-blue-600/10 border border-blue-500/50 text-white' 
                                                        : 'bg-gray-800/40 hover:bg-gray-800/80 border border-transparent text-gray-300'
                                                }`}
                                            >
                                                <div className="flex justify-between items-start gap-2">
                                                    <div>
                                                        <h3 className="font-extrabold text-sm text-white flex items-center gap-1.5">
                                                            {req.machineName}
                                                        </h3>
                                                        {req.moldName && (
                                                            <p className="text-[11px] font-bold text-gray-400 mt-0.5">
                                                                {req.moldName} - <span className="text-gray-500">{req.taskName}</span>
                                                            </p>
                                                        )}
                                                    </div>
                                                    {getRequestStatusBadge(req.status)}
                                                </div>

                                                <div className="flex justify-between items-center mt-3 pt-2.5 border-t border-gray-800 text-[10px] text-gray-400">
                                                    <span className="flex items-center gap-1"><User className="w-3 h-3 text-blue-400" /> {req.requesterName}</span>
                                                    <span>{new Date(req.createdAt).toLocaleDateString('tr-TR')} {new Date(req.createdAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</span>
                                                </div>

                                                <div className="flex justify-between items-center mt-2.5">
                                                    <span className="text-[10px] px-2 py-0.5 bg-gray-900 rounded-full text-gray-400 font-bold">
                                                        {req.tools?.length || 0} Adet Takım
                                                    </span>
                                                    {missingCount > 0 && (
                                                        <span className="text-[9px] px-2 py-0.5 bg-rose-500/10 text-rose-500 border border-rose-500/20 rounded font-black flex items-center gap-0.5 animate-bounce">
                                                            <ShieldAlert className="w-2.5 h-2.5" /> {missingCount} EKSİK TAKIM VAR!
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>

                        {/* Sağ Taraf: Detaylar, Hazırlık Kontrolleri ve Sipariş Sohbet Kutusu */}
                        <div className="hidden md:flex flex-1 flex-col overflow-hidden bg-gray-850">
                            {selectedRequest ? (
                                <div className="flex-1 flex flex-col overflow-hidden">
                                    {/* Detay Başlığı */}
                                    <div className="p-5 border-b border-gray-700 bg-gray-800/60 flex justify-between items-start shrink-0">
                                        <div>
                                            <h2 className="text-lg font-black text-white flex items-center gap-2">
                                                {selectedRequest.machineName} Takım İhtiyaç Listesi
                                            </h2>
                                            <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs text-gray-400">
                                                <span>Talep Eden: <strong className="text-gray-300">{selectedRequest.requesterName} ({selectedRequest.requesterRole})</strong></span>
                                                <span>•</span>
                                                <span>Kalıp: <strong className="text-gray-300">{selectedRequest.moldName || 'Belirtilmedi'}</strong></span>
                                                {selectedRequest.taskName && (
                                                    <>
                                                        <span>•</span>
                                                        <span>Operasyon: <strong className="text-gray-300">{selectedRequest.taskName}</strong></span>
                                                    </>
                                                )}
                                            </div>
                                        </div>

                                        {/* Takımhane & CAM Aksiyon Butonları */}
                                        <div className="flex gap-2 shrink-0">
                                            {selectedRequest.status !== 'COMPLETED' && (loggedInUser?.role === ROLES.ADMIN || loggedInUser?.role === ROLES.SUPERVISOR || selectedRequest.requesterName === loggedInUser?.name) && (
                                                <button 
                                                    onClick={() => startEditingRequest(selectedRequest)}
                                                    className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-black text-xs rounded-xl shadow-lg transition"
                                                >
                                                    Talebi Düzenle
                                                </button>
                                            )}
                                            {isManagerOrToolroom && (selectedRequest.status === 'PENDING' || selectedRequest.status === 'EDITED') && (
                                                <button 
                                                    onClick={() => updateRequestStatus(selectedRequest.id, 'PREPARING')}
                                                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs rounded-xl shadow-lg transition flex items-center gap-1"
                                                >
                                                    <Play className="w-3.5 h-3.5" /> Hazırlamaya Başla
                                                </button>
                                            )}
                                            {isManagerOrToolroom && selectedRequest.status === 'PREPARING' && (
                                                <button 
                                                    onClick={() => updateRequestStatus(selectedRequest.id, 'COMPLETED')}
                                                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl shadow-lg transition flex items-center gap-1"
                                                >
                                                    <CheckCircle2 className="w-3.5 h-3.5" /> Hazırlığı Tamamla
                                                </button>
                                            )}
                                            {selectedRequest.status === 'COMPLETED' && (
                                                <div className="px-4 py-2 bg-emerald-950/40 text-emerald-400 border border-emerald-900 font-black text-xs rounded-xl flex items-center gap-1.5">
                                                    <CheckCircle2 className="w-3.5 h-3.5" /> Teslim Edildi / Tamamlandı
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Detay İçeriği - İki Sütunlu (Sol: Takımlar Listesi, Sağ: Konuşma Penceresi) */}
                                    <div className="flex-1 flex overflow-hidden">
                                        {/* Takım Listesi ve Detay Notu */}
                                        <div className="w-1/2 p-5 overflow-auto space-y-4 border-r border-gray-700">
                                            {selectedRequest.notes && (
                                                <div className="p-3.5 bg-gray-900/60 border border-gray-700 rounded-xl space-y-1">
                                                    <span className="text-[10px] font-black text-blue-400 uppercase tracking-wider flex items-center gap-1">
                                                        <AlertCircle className="w-3 h-3" /> Talep Açıklaması / Sipariş Notu
                                                    </span>
                                                    <p className="text-xs text-gray-300 font-medium whitespace-pre-wrap">{selectedRequest.notes}</p>
                                                </div>
                                            )}

                                            <div className="space-y-2">
                                                <span className="text-[10px] font-black text-gray-400 uppercase">Talep Edilen Takımların Hazırlık Durumu</span>
                                                <div className="space-y-2.5">
                                                    {selectedRequest.tools?.map((tool) => (
                                                        <div key={tool.id} className="p-4 bg-gray-800 border border-gray-700 rounded-xl flex flex-col justify-between gap-3">
                                                            <div className="flex justify-between items-start gap-2">
                                                                <div>
                                                                    <h4 className="text-base md:text-lg font-black text-white tracking-wide">{tool.toolName}</h4>
                                                                    <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs md:text-sm font-bold text-gray-300 mt-1.5">
                                                                        {tool.holderType && <span>Tutucu: <strong className="text-white bg-gray-900 px-1.5 py-0.5 rounded">{tool.holderType}</strong></span>}
                                                                        {tool.length && <span>Standart Boy: <strong className="text-white bg-gray-900 px-1.5 py-0.5 rounded">{tool.length}</strong></span>}
                                                                        {tool.shrinkLength && <span>Shrink Boyu: <strong className="text-amber-400 bg-gray-900 px-1.5 py-0.5 rounded">{tool.shrinkLength}</strong></span>}
                                                                        <span>Tercih: <strong className="text-white bg-gray-900 px-1.5 py-0.5 rounded">{
                                                                            tool.condition === 'NEW' ? 'Sıfır' : (tool.condition === 'USED' ? 'Az Kullanılmış' : 'Fark Etmez')
                                                                        }</strong></span>
                                                                    </div>
                                                                    {tool.notes && (
                                                                        <p className="text-xs text-amber-400 font-bold bg-amber-950/20 border border-amber-900/40 px-2 py-0.5 rounded mt-1.5 w-fit">
                                                                            Not: {tool.notes}
                                                                        </p>
                                                                    )}
                                                                </div>
                                                                {getToolStatusBadge(tool.status)}
                                                            </div>

                                                            {/* Takımhane Sorumlusu İçin Takım Durum Güncelleme Butonları */}
                                                            {isManagerOrToolroom && selectedRequest.status !== 'COMPLETED' && (
                                                                <div className="flex gap-1.5 border-t border-gray-750 pt-2.5 justify-end">
                                                                    <button 
                                                                        onClick={() => updateToolStatus(selectedRequest, tool.id, 'PENDING')}
                                                                        className={`px-2.5 py-1 text-[9px] font-extrabold rounded transition ${
                                                                            tool.status === 'PENDING' 
                                                                                ? 'bg-amber-600 text-white font-black' 
                                                                                : 'bg-gray-700 hover:bg-gray-650 text-gray-300'
                                                                        }`}
                                                                    >
                                                                        Beklet
                                                                    </button>
                                                                    <button 
                                                                        onClick={() => updateToolStatus(selectedRequest, tool.id, 'MISSING')}
                                                                        className={`px-2.5 py-1 text-[9px] font-extrabold rounded transition flex items-center gap-0.5 ${
                                                                            tool.status === 'MISSING' 
                                                                                ? 'bg-rose-600 text-white font-black' 
                                                                                : 'bg-gray-700 hover:bg-gray-650 text-gray-300'
                                                                        }`}
                                                                    >
                                                                        <X className="w-2.5 h-2.5" /> Eksik / Yok
                                                                    </button>
                                                                    <button 
                                                                        onClick={() => updateToolStatus(selectedRequest, tool.id, 'READY')}
                                                                        className={`px-2.5 py-1 text-[9px] font-extrabold rounded transition flex items-center gap-0.5 ${
                                                                            tool.status === 'READY' 
                                                                                ? 'bg-emerald-600 text-white font-black' 
                                                                                : 'bg-gray-700 hover:bg-gray-650 text-gray-300'
                                                                        }`}
                                                                    >
                                                                        <Check className="w-2.5 h-2.5" /> Hazır
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Sipariş Sohbet / Konuşma Penceresi */}
                                        <div className="w-1/2 flex flex-col overflow-hidden bg-gray-900">
                                            {/* Sohbet Başlığı */}
                                            <div className="p-3 border-b border-gray-800 bg-gray-800/20 shrink-0 flex items-center gap-1.5 text-xs font-black text-gray-300">
                                                <MessageSquare className="w-4 h-4 text-blue-400" /> Sipariş Özel İletişim Hattı
                                            </div>

                                            {/* Mesaj Alanı */}
                                            <div className="flex-1 overflow-auto p-4 space-y-3">
                                                {selectedRequest.messages && selectedRequest.messages.length > 0 ? (
                                                    selectedRequest.messages.map((msg, idx) => {
                                                        const isMe = msg.senderName === loggedInUser?.name;
                                                        return (
                                                            <div 
                                                                key={idx} 
                                                                className={`flex flex-col max-w-[80%] ${isMe ? 'ml-auto items-end' : 'mr-auto items-start'}`}
                                                            >
                                                                <div className="flex items-center gap-1.5 text-[9px] font-bold text-gray-500 mb-0.5">
                                                                    <span>{msg.senderName} ({msg.senderRole})</span>
                                                                    <span>•</span>
                                                                    <span>{new Date(msg.timestamp).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</span>
                                                                </div>
                                                                <div className={`p-2.5 rounded-2xl text-xs font-medium ${
                                                                    isMe 
                                                                        ? 'bg-blue-600 text-white rounded-tr-none shadow' 
                                                                        : 'bg-gray-800 text-gray-200 rounded-tl-none border border-gray-700'
                                                                }`}>
                                                                    {msg.text}
                                                                </div>
                                                            </div>
                                                        );
                                                    })
                                                ) : (
                                                    <div className="flex flex-col items-center justify-center py-20 text-gray-500 space-y-2 text-center">
                                                        <MessageSquare className="w-8 h-8 text-gray-750" />
                                                        <p className="text-[11px] italic">Elinizde olmayan veya sormak istediğiniz takımlar hakkında buradan konuşabilirsiniz.</p>
                                                    </div>
                                                )}
                                                <div ref={chatEndRef} />
                                            </div>

                                            {/* Mesaj Gönderme Formu */}
                                            <form onSubmit={handleSendMessage} className="p-3 border-t border-gray-800 bg-gray-850 shrink-0 flex gap-2">
                                                <input 
                                                    type="text" 
                                                    placeholder="Sipariş hakkında bir mesaj yazın..."
                                                    value={chatInput}
                                                    onChange={(e) => setChatInput(e.target.value)}
                                                    className="flex-1 bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                                                />
                                                <button 
                                                    type="submit"
                                                    disabled={!chatInput.trim()}
                                                    className="p-2 bg-blue-600 hover:bg-blue-700 rounded-xl text-white disabled:opacity-40 disabled:hover:bg-blue-600 transition"
                                                >
                                                    <Send className="w-3.5 h-3.5" />
                                                </button>
                                            </form>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex-1 flex flex-col items-center justify-center text-gray-500 py-20 space-y-3">
                                    <ClipboardList className="w-12 h-12 text-gray-700" />
                                    <h3 className="font-bold text-sm">Detayları Görüntüle</h3>
                                    <p className="text-xs text-gray-600 max-w-xs text-center">
                                        Soldaki listeden bir talep seçerek içerisindeki takımları görüntüleyebilir ve durumlarını güncelleyebilirsiniz.
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ToolRequestBridgePage;
