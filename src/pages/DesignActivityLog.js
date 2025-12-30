// src/pages/DesignActivityLog.js

import React, { useState, useEffect, useMemo } from 'react';
import { 
    Play, Clock, Users, PenTool, Plus, Monitor, Settings, StopCircle, List, 
    Search, Calendar as CalendarIcon, Download, Filter, ChevronDown, ChevronLeft, ChevronRight
} from 'lucide-react';
import { 
    addDoc, collection, query, where, updateDoc, doc, onSnapshot, orderBy 
} from '../config/firebase.js';
import { 
    ACTIVITY_LOGS_COLLECTION, DESIGN_ACTIVITY_TYPES, ROLES 
} from '../config/constants.js';
import { getCurrentDateTimeString } from '../utils/dateUtils.js';

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// DÜZELTME: 'personnel' prop'u eklendi
const DesignActivityLog = ({ db, loggedInUser, projects, personnel }) => {
    // --- STATE ---
    const [myActiveLog, setMyActiveLog] = useState(null);
    const [logsList, setLogsList] = useState([]);
    
    // GÖRÜNÜM MODU: 'LIST' (Günlük Liste) veya 'CALENDAR' (Haftalık Takvim)
    const [viewMode, setViewMode] = useState('CALENDAR'); 

    // Filtreler
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [currentWeekStart, setCurrentWeekStart] = useState(new Date()); 
    const [selectedPersonnelFilter, setSelectedPersonnelFilter] = useState('ALL');

    // İş Başlatma Formu
    const [selectedType, setSelectedType] = useState(DESIGN_ACTIVITY_TYPES.DESIGN);
    const [selectedProjectId, setSelectedProjectId] = useState('');
    const [description, setDescription] = useState('');
    const [projectSearchTerm, setProjectSearchTerm] = useState('');
    const [isProjectDropdownOpen, setIsProjectDropdownOpen] = useState(false);

    // Yetki Kontrolü
    const isManager = loggedInUser.role === ROLES.ADMIN || 
                      loggedInUser.role === ROLES.PROJE_SORUMLUSU || 
                      loggedInUser.role === ROLES.SUPERVISOR;

    // --- 1. VERİLERİ DİNLE ---
    useEffect(() => {
        if (!db) return;

        // A. Benim Aktif İşim
        const qActive = query(
            collection(db, ACTIVITY_LOGS_COLLECTION),
            where('userId', '==', loggedInUser.id),
            where('status', '==', 'ACTIVE')
        );

        const unsubActive = onSnapshot(qActive, (snapshot) => {
            if (!snapshot.empty) {
                setMyActiveLog({ id: snapshot.docs[0].id, ...snapshot.docs[0].data() });
            } else {
                setMyActiveLog(null);
            }
        });

        // B. TÜM LOGLARI ÇEK
        const qAll = query(
            collection(db, ACTIVITY_LOGS_COLLECTION),
            orderBy('startTime', 'desc')
        );

        const unsubAll = onSnapshot(qAll, (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setLogsList(data);
        });

        return () => { unsubActive(); unsubAll(); };
    }, [db, loggedInUser]);

    // --- YARDIMCI: HAFTA HESAPLAMA ---
    const getStartOfWeek = (date) => {
        const d = new Date(date);
        const day = d.getDay(); 
        const diff = d.getDate() - day + (day === 0 ? -6 : 1); 
        return new Date(d.setDate(diff));
    };

    const changeWeek = (direction) => {
        const newDate = new Date(currentWeekStart);
        newDate.setDate(newDate.getDate() + (direction * 7));
        setCurrentWeekStart(newDate);
    };

    // --- FİLTRELENMİŞ LİSTE ---
    const displayedLogs = useMemo(() => {
        return logsList.filter(log => {
            const logDate = new Date(log.startTime);
            const logDateStr = logDate.toISOString().split('T')[0];
            
            // 1. Personel Filtresi
            const userMatch = selectedPersonnelFilter === 'ALL' || log.userId === selectedPersonnelFilter;
            if (!userMatch) return false;

            // 2. Tarih Filtresi (Moda Göre)
            if (viewMode === 'LIST') {
                return logDateStr === selectedDate;
            } else {
                const startOfWeek = getStartOfWeek(currentWeekStart);
                startOfWeek.setHours(0,0,0,0);
                const endOfWeek = new Date(startOfWeek);
                endOfWeek.setDate(endOfWeek.getDate() + 7);
                return logDate >= startOfWeek && logDate < endOfWeek;
            }
        });
    }, [logsList, viewMode, selectedDate, currentWeekStart, selectedPersonnelFilter]);

    // --- PROJE ARAMA ---
    const filteredProjects = useMemo(() => {
        if (!projectSearchTerm) return projects;
        const lowerTerm = projectSearchTerm.toLowerCase();
        return projects.filter(p => 
            (p.moldName || '').toLowerCase().includes(lowerTerm) ||
            (p.customerName || '').toLowerCase().includes(lowerTerm)
        );
    }, [projects, projectSearchTerm]);

    const selectedProjectObj = useMemo(() => {
        return projects.find(p => p.id === selectedProjectId);
    }, [projects, selectedProjectId]);

    // --- İŞLEM FONKSİYONLARI ---
    const handleStartActivity = async () => {
        if (!selectedType) return alert("Lütfen bir aktivite tipi seçin.");
        if (selectedType !== DESIGN_ACTIVITY_TYPES.OTHER && !selectedProjectId) return alert("Lütfen üzerinde çalışılan projeyi seçiniz.");
        if (selectedType === DESIGN_ACTIVITY_TYPES.OTHER && !description.trim()) return alert("Lütfen manuel giriş için açıklama yazınız.");

        try {
            const now = getCurrentDateTimeString();
            if (myActiveLog) {
                const duration = Math.round((new Date(now) - new Date(myActiveLog.startTime)) / 1000 / 60);
                await updateDoc(doc(db, ACTIVITY_LOGS_COLLECTION, myActiveLog.id), { endTime: now, status: 'COMPLETED', duration });
            }
            await addDoc(collection(db, ACTIVITY_LOGS_COLLECTION), {
                userId: loggedInUser.id,
                userName: loggedInUser.name,
                userRole: loggedInUser.role,
                type: selectedType,
                projectId: selectedProjectId || null,
                projectName: selectedProjectObj ? selectedProjectObj.moldName : '', 
                moldName: selectedProjectObj ? selectedProjectObj.moldName : '',
                description: description,
                startTime: now,
                endTime: null,
                status: 'ACTIVE'
            });
            setSelectedProjectId(''); setDescription(''); setProjectSearchTerm(''); setIsProjectDropdownOpen(false);
        } catch (error) { console.error("Hata:", error); alert("İşlem kaydedilemedi."); }
    };

    const handleStopDay = async () => {
        if (!myActiveLog) return;
        if (!window.confirm("Günü bitirmek istiyor musunuz?")) return;
        const now = getCurrentDateTimeString();
        const duration = Math.round((new Date(now) - new Date(myActiveLog.startTime)) / 1000 / 60);
        await updateDoc(doc(db, ACTIVITY_LOGS_COLLECTION, myActiveLog.id), { endTime: now, status: 'COMPLETED', duration });
    };

    // --- PDF RAPOR (DÜZELTİLDİ: Font ayarı ile boşluk sorunu çözüldü) ---
    const generatePDF = () => {
        const doc = new jsPDF();
        
        // Fontu Helvetica olarak ayarla (Boşluk sorununu çözer)
        doc.setFont("helvetica", "bold");
        doc.setFontSize(16);
        
        const title = viewMode === 'LIST' ? "TASARIM OFISI GUNLUK RAPORU" : "TASARIM OFISI HAFTALIK RAPORU";
        doc.text(title, 14, 20);
        
        doc.setFont("helvetica", "normal");
        doc.setFontSize(11);
        
        const dateText = viewMode === 'LIST'
            ? `Tarih: ${new Date(selectedDate).toLocaleDateString('tr-TR')}`
            : `Hafta: ${getStartOfWeek(currentWeekStart).toLocaleDateString('tr-TR')} Baslayan`;
        doc.text(dateText, 14, 28);
        
        const personnelName = selectedPersonnelFilter === 'ALL' 
            ? "Tum Ekip" 
            : personnel?.find(p => p.id === selectedPersonnelFilter)?.name || "Personel";
        doc.text(`Personel: ${personnelName}`, 14, 34);

        const sortedLogs = [...displayedLogs].sort((a, b) => new Date(a.startTime) - new Date(b.startTime));

        const tableBody = sortedLogs.map(log => [
            new Date(log.startTime).toLocaleDateString('tr-TR'),
            log.userName,
            new Date(log.startTime).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}),
            log.endTime ? new Date(log.endTime).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : 'DEVAM',
            log.duration ? `${log.duration} dk` : '-',
            log.type,
            log.moldName || log.projectName || '-', 
            log.description || '-'
        ]);

        autoTable(doc, {
            startY: 40,
            head: [['Tarih', 'Personel', 'Basla', 'Bitis', 'Sure', 'Aktivite', 'Kalip', 'Aciklama']],
            body: tableBody,
            theme: 'grid',
            styles: { 
                fontSize: 8, 
                cellPadding: 2, 
                font: "helvetica", // FONT SABİTLENDİ
                halign: 'left'     // HİZALAMA SOL
            },
            headStyles: { fillColor: [41, 128, 185], textColor: 255, fontStyle: 'bold', font: "helvetica" },
            columnStyles: {
                0: { cellWidth: 20 },
                1: { cellWidth: 25 },
                5: { cellWidth: 30 },
                6: { cellWidth: 30 },
                7: { cellWidth: 'auto' }
            }
        });

        let totalMinutes = 0;
        displayedLogs.forEach(l => totalMinutes += (l.duration || 0));
        const hours = Math.floor(totalMinutes / 60);
        const mins = totalMinutes % 60;

        const finalY = (doc).lastAutoTable?.finalY || 150;
        doc.setFont("helvetica", "bold");
        doc.text(`Toplam Calisma: ${hours} saat ${mins} dakika`, 14, finalY + 10);

        doc.save(`Tasarim_Raporu_${viewMode}.pdf`);
    };

    const LiveTimer = ({ startTime }) => {
        const [elapsed, setElapsed] = useState('');
        useEffect(() => {
            const interval = setInterval(() => {
                const diff = Math.floor((new Date() - new Date(startTime)) / 1000 / 60);
                const h = Math.floor(diff / 60);
                const m = diff % 60;
                setElapsed(`${h} sa ${m} dk`);
            }, 1000 * 30);
            return () => clearInterval(interval);
        }, [startTime]);
        return <span className="font-mono font-bold text-xl text-green-600">{elapsed || '0 dk'}</span>;
    };

    // --- TAKVİM RENDER ---
    const renderCalendar = () => {
        const startOfWeek = getStartOfWeek(currentWeekStart);
        startOfWeek.setHours(0,0,0,0);
        const days = [];
        for (let i = 0; i < 7; i++) {
            const d = new Date(startOfWeek);
            d.setDate(d.getDate() + i);
            days.push(d);
        }

        return (
            <div className="flex flex-col h-full">
                <div className="flex justify-between items-center mb-4 bg-gray-50 dark:bg-gray-700 p-3 rounded-lg">
                    <button onClick={() => changeWeek(-1)} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-full"><ChevronLeft /></button>
                    <span className="font-bold text-lg dark:text-white">
                        {days[0].toLocaleDateString('tr-TR')} - {days[6].toLocaleDateString('tr-TR')} Haftası
                    </span>
                    <button onClick={() => changeWeek(1)} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-full"><ChevronRight /></button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-7 gap-2 h-full">
                    {days.map((day, index) => {
                        const dateStr = day.toISOString().split('T')[0];
                        const dayLogs = displayedLogs.filter(l => new Date(l.startTime).toISOString().split('T')[0] === dateStr)
                                                     .sort((a,b) => new Date(a.startTime) - new Date(b.startTime));
                        const isToday = dateStr === new Date().toISOString().split('T')[0];

                        return (
                            <div key={index} className={`border border-gray-200 dark:border-gray-700 rounded-lg flex flex-col min-h-[400px] ${isToday ? 'bg-blue-50/50 dark:bg-blue-900/10 border-blue-200' : 'bg-gray-50 dark:bg-gray-800'}`}>
                                <div className={`p-2 text-center border-b border-gray-200 dark:border-gray-700 ${index === 5 || index === 6 ? 'bg-orange-100/50 dark:bg-orange-900/20' : ''}`}>
                                    <div className="font-bold text-sm text-gray-700 dark:text-gray-200">{day.toLocaleDateString('tr-TR', { weekday: 'long' })}</div>
                                    <div className="text-xs text-gray-500">{day.toLocaleDateString('tr-TR')}</div>
                                </div>
                                <div className="p-2 flex-1 space-y-2 overflow-y-auto">
                                    {dayLogs.map(log => (
                                        <div key={log.id} className="bg-white dark:bg-gray-900 p-2 rounded border border-gray-200 dark:border-gray-600 shadow-sm text-xs group hover:shadow-md transition">
                                            <div className="flex justify-between text-gray-500 mb-1 font-mono">
                                                <span>{new Date(log.startTime).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                                                <span className="font-bold text-blue-600">{log.duration ? `${log.duration}dk` : '...'}</span>
                                            </div>
                                            <div className="font-bold text-gray-800 dark:text-gray-100 mb-1 truncate" title={log.userName}>{log.userName}</div>
                                            <div className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold mb-1 truncate max-w-full bg-gray-100 text-gray-800`}>
                                                {log.type}
                                            </div>
                                            <div className="text-gray-600 dark:text-gray-400 truncate font-medium">{log.moldName || log.projectName}</div>
                                        </div>
                                    ))}
                                    {dayLogs.length === 0 && <div className="text-center text-gray-300 text-[10px] mt-10">-</div>}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    return (
        <div className="flex flex-col gap-6 animate-in fade-in duration-300">
            {/* ÜST PANEL */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-6">
                <div className="flex flex-col md:flex-row justify-between items-center mb-8 pb-6 border-b border-gray-100 dark:border-gray-700">
                    <div className="flex items-center gap-4 w-full md:w-auto">
                        <div className={`p-4 rounded-full ${myActiveLog ? 'bg-green-100 text-green-600 animate-pulse' : 'bg-gray-100 text-gray-400'}`}>
                            <Clock className="w-8 h-8" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-gray-800 dark:text-white">{myActiveLog ? 'Şu An Çalışılıyor' : 'Şu An Boşta'}</h2>
                            {myActiveLog && (
                                <div className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                                    <div className="font-bold text-blue-600 mb-1">{myActiveLog.type}</div>
                                    <div className="font-bold">{myActiveLog.moldName || myActiveLog.projectName}</div>
                                    <div className="text-gray-500 italic">{myActiveLog.description}</div>
                                </div>
                            )}
                        </div>
                    </div>
                    {myActiveLog && (
                        <div className="flex items-center gap-6 mt-4 md:mt-0">
                            <div className="text-center">
                                <div className="text-xs text-gray-400 uppercase font-bold mb-1">GEÇEN SÜRE</div>
                                <LiveTimer startTime={myActiveLog.startTime} />
                            </div>
                            <button onClick={handleStopDay} className="bg-red-50 hover:bg-red-100 text-red-600 px-6 py-3 rounded-lg font-bold flex items-center transition border border-red-200">
                                <StopCircle className="w-5 h-5 mr-2" /> Günü Bitir
                            </button>
                        </div>
                    )}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    <div className="lg:col-span-12">
                        <p className="text-xs font-bold text-gray-400 uppercase mb-3">1. Aktivite Tipi Seçin</p>
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                            {Object.entries(DESIGN_ACTIVITY_TYPES).map(([key, label]) => (
                                <button key={key} onClick={() => setSelectedType(label)} className={`p-3 rounded-xl border text-xs font-bold flex flex-col items-center justify-center transition-all h-24 text-center ${selectedType === label ? 'bg-blue-600 text-white border-blue-600 shadow-md transform scale-105' : 'bg-gray-50 dark:bg-gray-700 text-gray-600 border-gray-200 hover:bg-white'}`}>
                                    {key === 'DESIGN' && <Monitor className="w-6 h-6 mb-2"/>}
                                    {key === 'MOLD_TRIAL' && <Settings className="w-6 h-6 mb-2"/>}
                                    {key === 'WORKSHOP' && <PenTool className="w-6 h-6 mb-2"/>}
                                    {key === 'MEETING' && <Users className="w-6 h-6 mb-2"/>}
                                    {key === 'OTHER' && <Plus className="w-6 h-6 mb-2"/>}
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="lg:col-span-12 bg-blue-50 dark:bg-blue-900/10 p-5 rounded-xl border border-blue-100 dark:border-blue-800">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                            {selectedType !== DESIGN_ACTIVITY_TYPES.OTHER && (
                                <div className="relative">
                                    <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Proje / Kalıp Seçimi</label>
                                    <div className="relative">
                                        <div className="w-full p-3 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg cursor-pointer flex justify-between items-center" onClick={() => setIsProjectDropdownOpen(!isProjectDropdownOpen)}>
                                            <span className={`text-sm ${!selectedProjectId ? 'text-gray-400' : 'text-gray-900 dark:text-white font-bold'}`}>
                                                {selectedProjectObj ? `${selectedProjectObj.moldName} - ${selectedProjectObj.customerName || ''}` : "Listeden Seçiniz..."}
                                            </span>
                                            <ChevronDown className="w-4 h-4 text-gray-500" />
                                        </div>
                                        {isProjectDropdownOpen && (
                                            <div className="absolute z-50 mt-1 w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-xl max-h-60 overflow-hidden flex flex-col">
                                                <div className="p-2 border-b border-gray-100 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-800">
                                                    <input type="text" className="w-full pl-2 p-1 text-sm border rounded bg-gray-50 dark:bg-gray-700 text-gray-900 focus:outline-none" placeholder="Kalıp adı ara..." value={projectSearchTerm} onChange={(e) => setProjectSearchTerm(e.target.value)} autoFocus />
                                                </div>
                                                <div className="overflow-y-auto flex-1">
                                                    {filteredProjects.map(p => (
                                                        <div key={p.id} className="p-3 text-sm cursor-pointer hover:bg-blue-50 dark:hover:bg-gray-700 border-b border-gray-50 dark:border-gray-700" onClick={() => { setSelectedProjectId(p.id); setIsProjectDropdownOpen(false); setProjectSearchTerm(''); }}>
                                                            <div className="font-bold text-gray-800 dark:text-white">{p.moldName}</div>
                                                            <div className="text-xs text-gray-500">{p.customerName}</div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                            <div className={selectedType === DESIGN_ACTIVITY_TYPES.OTHER ? "col-span-2" : ""}>
                                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Açıklama</label>
                                <input type="text" className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none" placeholder="Not..." value={description} onChange={(e) => setDescription(e.target.value)} />
                            </div>
                        </div>
                        <div className="flex justify-end">
                            <button onClick={handleStartActivity} className="w-full md:w-auto px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold shadow-lg flex items-center justify-center transition transform active:scale-95">
                                <Play className="w-5 h-5 mr-2 fill-current" /> {myActiveLog ? 'Bunu Bitir & Yeniye Geç' : 'İşi Başlat'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* --- ALT BÖLÜM --- */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col">
                <div className="p-4 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 flex flex-col md:flex-row justify-between items-center gap-4">
                    <div className="flex gap-4">
                        <button onClick={() => setViewMode('LIST')} className={`px-4 py-2 rounded-lg font-bold text-sm flex items-center ${viewMode === 'LIST' ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:bg-gray-200'}`}>
                            <List className="w-4 h-4 mr-2"/> Günlük Liste
                        </button>
                        <button onClick={() => setViewMode('CALENDAR')} className={`px-4 py-2 rounded-lg font-bold text-sm flex items-center ${viewMode === 'CALENDAR' ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:bg-gray-200'}`}>
                            <CalendarIcon className="w-4 h-4 mr-2"/> Haftalık Takvim
                        </button>
                    </div>

                    <div className="flex flex-wrap gap-2 w-full sm:w-auto items-center justify-end">
                        {viewMode === 'LIST' && (
                            <div className="flex items-center bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1">
                                <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="bg-transparent text-sm text-gray-700 dark:text-white focus:outline-none" />
                            </div>
                        )}

                        {isManager && (
                            <>
                                <div className="flex items-center bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1 min-w-[200px]">
                                    <Filter className="w-4 h-4 text-gray-500 mr-2" />
                                    <select value={selectedPersonnelFilter} onChange={(e) => setSelectedPersonnelFilter(e.target.value)} className="bg-transparent text-sm text-gray-700 dark:text-white focus:outline-none cursor-pointer w-full">
                                        <option value="ALL">Tüm Ekip</option>
                                        {/* DÜZELTME: Filtresiz Personel Listesi */}
                                        {personnel && personnel.map(p => (
                                            <option key={p.id} value={p.id}>{p.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <button onClick={generatePDF} className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded-lg text-sm font-bold flex items-center transition">
                                    <Download className="w-4 h-4 mr-1" /> PDF
                                </button>
                            </>
                        )}
                    </div>
                </div>

                <div className="flex-1 p-4 bg-gray-100 dark:bg-gray-900/50 min-h-[500px]">
                    {viewMode === 'CALENDAR' ? renderCalendar() : (
                        <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
                            <table className="w-full text-left text-sm text-gray-600 dark:text-gray-300">
                                <thead className="bg-gray-100 dark:bg-gray-900 text-xs uppercase font-bold sticky top-0 z-10 text-gray-600 dark:text-gray-400">
                                    <tr>
                                        <th className="p-3">Saat</th>
                                        <th className="p-3">Personel</th>
                                        <th className="p-3">Aktivite</th>
                                        <th className="p-3">Kalıp Adı</th>
                                        <th className="p-3">Açıklama</th>
                                        <th className="p-3 text-center">Süre</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                                    {displayedLogs.length === 0 ? (
                                        <tr><td colSpan="6" className="p-8 text-center text-gray-400 italic">Kayıt bulunamadı.</td></tr>
                                    ) : (
                                        displayedLogs.map(log => (
                                            <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition">
                                                <td className="p-3 font-mono text-xs whitespace-nowrap">
                                                    {new Date(log.startTime).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
                                                    <span className="mx-1">-</span>
                                                    {log.endTime ? new Date(log.endTime).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : <span className="text-green-600 font-bold">DEVAM</span>}
                                                </td>
                                                <td className="p-3 font-bold text-gray-900 dark:text-white">{log.userName}</td>
                                                <td className="p-3">
                                                    <span className="px-2 py-1 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-100">
                                                        {log.type}
                                                    </span>
                                                </td>
                                                <td className="p-3 font-bold text-gray-800 dark:text-gray-200">
                                                    {log.moldName || log.projectName || '-'}
                                                </td>
                                                <td className="p-3 text-gray-500 italic">
                                                    {log.description || ''}
                                                </td>
                                                <td className="p-3 text-center font-mono font-bold">
                                                    {log.duration ? `${log.duration} dk` : '-'}
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
        </div>
    );
};

export default DesignActivityLog;