// src/pages/TechnicalDrawingsPage.js

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { 
    Search, FileText, Calendar, User, ExternalLink, 
    X, Clock, FolderOpen, AlertCircle, Sparkles, ChevronRight, Bell, CheckCircle2, ArrowLeft
} from 'lucide-react';
import { PROJECT_TYPE_CONFIG } from '../config/constants.js';

const TechnicalDrawingsPage = ({ db, projects, loggedInUser }) => {
    const [activeTab, setActiveTab] = useState('grouped'); // 'grouped' or 'timeline'
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('ALL'); // 'ALL' or specific MOLD_STATUS value
    const [timeRangeFilter, setTimeRangeFilter] = useState('ALL'); // 'ALL', '1D', '1W', '1M'
    const [selectedDrawing, setSelectedDrawing] = useState(null);
    const [seenDrawings, setSeenDrawings] = useState(() => {
        try {
            const saved = localStorage.getItem('seen_technical_drawings');
            return saved ? JSON.parse(saved) : [];
        } catch {
            return [];
        }
    });
    const [showNewNotifications, setShowNewNotifications] = useState(true);
    const [isNotificationDropdownOpen, setIsNotificationDropdownOpen] = useState(false);
    const dropdownRef = useRef(null);

    // Save seen drawings to localStorage when state changes
    useEffect(() => {
        try {
            localStorage.setItem('seen_technical_drawings', JSON.stringify(seenDrawings));
        } catch (e) {
            console.error("localStorage save error:", e);
        }
    }, [seenDrawings]);

    // Close notification dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsNotificationDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Helper: Extract or return upload timestamp
    const getUploadTime = (url, uploadedAt) => {
        if (uploadedAt) return new Date(uploadedAt).getTime();
        try {
            const decodedUrl = decodeURIComponent(url);
            const match = decodedUrl.match(/_(\d{13})_/);
            if (match) {
                return parseInt(match[1]);
            }
        } catch (e) {
            console.error("Timestamp extraction error:", e);
        }
        return 0; // Default baseline
    };

    // Helper: Format date
    const formatUploadDate = (url, uploadedAt) => {
        const ms = getUploadTime(url, uploadedAt);
        if (ms === 0) return 'Tarih Bilgisi Yok';
        return new Date(ms).toLocaleString('tr-TR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    // Helper: Calculate task status (checks operations & outsource status)
    const getTaskStatus = (task) => {
        if (!task) return 'BEKLİYOR';
        
        if (task.outsourced) {
            return task.outsourcedStatus === 'Tamamlandı' ? 'TAMAMLANDI' : 'DIŞ TEMİNDE';
        }

        const operations = task.operations || [];
        if (operations.length === 0) return 'BEKLEYEN';

        const totalProgress = operations.reduce((acc, op) => acc + (op.progressPercentage || 0), 0);
        const overallProgress = Math.round(totalProgress / operations.length);

        if (overallProgress === 100) return 'TAMAMLANDI';

        const statuses = operations.map(op => op.status);
        if (statuses.every(s => s === 'COMPLETED' || s === 'TAMAMLANDI')) {
            return 'TAMAMLANDI';
        }

        const inProgressOp = operations.find(op => op.status === 'IN_PROGRESS' || op.status === 'ÇALIŞIYOR');
        if (inProgressOp) return 'ÇALIŞIYOR';

        const reviewOp = operations.find(op => op.status === 'WAITING_SUPERVISOR_REVIEW');
        if (reviewOp) return 'ONAY BEKLİYOR';

        const pausedOp = operations.find(op => op.status === 'PAUSED' || op.status === 'DURDURULDU');
        if (pausedOp) return 'DURDURULDU';

        return 'BEKLİYOR';
    };

    // Flatten all drawings from all projects
    const allDrawings = useMemo(() => {
        if (!projects || !Array.isArray(projects)) return [];
        const drawings = [];
        projects.forEach(p => {
            if (p.tasks && Array.isArray(p.tasks)) {
                p.tasks.forEach(t => {
                    if (t.technicalDrawingUrl) {
                        drawings.push({
                            moldId: p.id,
                            moldName: p.moldName,
                            projectType: p.projectType || 'YENİ KALIP',
                            customer: p.customer || 'Belirtilmemiş',
                            moldStatus: p.status || 'BEKLEMEDE',
                            partId: t.id,
                            partName: t.taskName || 'İsimsiz Parça',
                            partNumber: t.taskNumber || 1,
                            url: t.technicalDrawingUrl,
                            uploadedAt: t.technicalDrawingUploadedAt || null,
                            uploadedBy: t.technicalDrawingUploadedBy || 'Bilinmeyen Kullanıcı',
                            partStatus: getTaskStatus(t) // Calculated status of the part
                        });
                    }
                });
            }
        });
        return drawings;
    }, [projects]);

    // Extract all unique statuses present in drawings list
    const availableStatuses = useMemo(() => {
        const statuses = new Set();
        allDrawings.forEach(d => {
            if (d.moldStatus) statuses.add(d.moldStatus);
        });
        return Array.from(statuses).sort();
    }, [allDrawings]);

    // Filter drawings based on search query AND mold status
    const filteredDrawings = useMemo(() => {
        let list = allDrawings;

        // Apply status filter
        if (statusFilter !== 'ALL') {
            list = list.filter(d => d.moldStatus === statusFilter);
        }

        // Apply text search filter
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase().trim();
            list = list.filter(d => 
                d.moldName.toLowerCase().includes(q) ||
                d.partName.toLowerCase().includes(q) ||
                d.customer.toLowerCase().includes(q)
            );
        }

        return list;
    }, [allDrawings, searchQuery, statusFilter]);

    // Drawings grouped by Mold, sorted by newest technical drawing upload time
    const groupedDrawings = useMemo(() => {
        const groups = {};
        filteredDrawings.forEach(d => {
            if (!groups[d.moldId]) {
                groups[d.moldId] = {
                    moldId: d.moldId,
                    moldName: d.moldName,
                    projectType: d.projectType,
                    customer: d.customer,
                    moldStatus: d.moldStatus,
                    drawings: []
                };
            }
            groups[d.moldId].drawings.push(d);
        });

        const list = Object.values(groups);

        // Sort groups: newest drawing upload time first
        list.sort((a, b) => {
            const timeA = Math.max(...a.drawings.map(d => getUploadTime(d.url, d.uploadedAt)));
            const timeB = Math.max(...b.drawings.map(d => getUploadTime(d.url, d.uploadedAt)));
            return timeB - timeA;
        });

        return list;
    }, [filteredDrawings]);

    // Timeline view (newest to oldest, with optional time range filter)
    const timelineDrawings = useMemo(() => {
        let list = [...filteredDrawings];

        // Apply time range filter
        if (timeRangeFilter !== 'ALL') {
            const now = Date.now();
            let threshold = 0;
            if (timeRangeFilter === '1D') threshold = 24 * 60 * 60 * 1000;
            else if (timeRangeFilter === '1W') threshold = 7 * 24 * 60 * 60 * 1000;
            else if (timeRangeFilter === '1M') threshold = 30 * 24 * 60 * 60 * 1000;

            list = list.filter(d => {
                const uploadTime = getUploadTime(d.url, d.uploadedAt);
                return (now - uploadTime) <= threshold && uploadTime > 0;
            });
        }

        // Sort descending by upload time
        list.sort((a, b) => {
            const timeA = getUploadTime(a.url, a.uploadedAt);
            const timeB = getUploadTime(b.url, b.uploadedAt);
            return timeB - timeA; // Descending
        });
        return list;
    }, [filteredDrawings, timeRangeFilter]);

    // Newly uploaded drawings (uploaded in last 48 hours and not seen)
    const newDrawingsList = useMemo(() => {
        const now = Date.now();
        const fortyEightHours = 48 * 60 * 60 * 1000;
        return allDrawings.filter(d => {
            const uploadTime = getUploadTime(d.url, d.uploadedAt);
            const isRecent = (now - uploadTime) < fortyEightHours && uploadTime > 0;
            const isNotSeen = !seenDrawings.includes(d.partId);
            return isRecent && isNotSeen;
        });
    }, [allDrawings, seenDrawings]);

    // Mark a drawing as read/seen when selected
    const handleSelectDrawing = (drawing) => {
        setSelectedDrawing(drawing);
        if (!seenDrawings.includes(drawing.partId)) {
            setSeenDrawings(prev => [...prev, drawing.partId]);
        }
        setIsNotificationDropdownOpen(false);
    };

    // Mark all as read
    const handleMarkAllAsRead = () => {
        const allIds = allDrawings.map(d => d.partId);
        setSeenDrawings(allIds);
        setShowNewNotifications(false);
        setIsNotificationDropdownOpen(false);
    };

    return (
        <div className="flex flex-col h-[calc(100vh-80px)] overflow-hidden bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white relative">
            
            {/* Newly Uploaded Floating Notification Panel */}
            {showNewNotifications && newDrawingsList.length > 0 && (
                <div className="mx-3 lg:mx-6 mt-3 lg:mt-4 p-3.5 bg-gradient-to-r from-orange-500/15 to-amber-500/15 dark:from-orange-500/10 dark:to-amber-500/10 border border-orange-500/30 dark:border-orange-500/20 rounded-xl flex items-center justify-between shadow-sm animate-fade-in shrink-0">
                    <div className="flex items-center gap-3">
                        <span className="flex h-3 w-3 relative">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-orange-500"></span>
                        </span>
                        <div className="flex items-center gap-2">
                            <Sparkles className="w-5 h-5 text-orange-500 animate-pulse" />
                            <p className="text-xs font-bold text-gray-800 dark:text-orange-300">
                                Son 48 saat içinde <span className="underline decoration-2 font-black">{newDrawingsList.length} adet yeni teknik resim</span> yüklendi!
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <button 
                            onClick={handleMarkAllAsRead}
                            className="px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white font-extrabold text-[10px] rounded-lg shadow-sm transition"
                        >
                            Tümünü Okundu
                        </button>
                        <button 
                            onClick={() => setShowNewNotifications(false)}
                            className="p-1 hover:bg-orange-200 dark:hover:bg-orange-950/30 rounded text-gray-500 dark:text-gray-400"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}

            {/* Main Panel container - Split Screen Grid with Mobile-First toggle views */}
            <div className="flex-1 grid grid-cols-1 lg:grid-cols-5 overflow-hidden p-3 lg:p-6 gap-3 lg:gap-6">
                
                {/* LEFT COLUMN: Drawing list, filters, tabs (Span 2) */}
                <div className={`lg:col-span-2 flex flex-col bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden shadow-sm ${selectedDrawing ? 'hidden lg:flex' : 'flex'}`}>
                    
                    {/* Search, Notifications & Tabs header */}
                    <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/35 space-y-3">
                        <div className="flex items-center gap-2">
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                                <input
                                    type="text"
                                    placeholder="Kalıp adı, parça adı veya müşteri ara..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full pl-9 pr-4 py-2 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none transition"
                                />
                            </div>

                            {/* Premium Notification Center dropdown */}
                            <div className="relative shrink-0" ref={dropdownRef}>
                                <button
                                    onClick={() => setIsNotificationDropdownOpen(!isNotificationDropdownOpen)}
                                    className={`p-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition relative flex items-center justify-center ${
                                        newDrawingsList.length > 0 ? 'text-orange-500 dark:text-orange-400' : 'text-gray-400'
                                    }`}
                                    title="Yeni Yüklenen Resimler"
                                >
                                    <Bell className={`w-5 h-5 ${newDrawingsList.length > 0 ? 'animate-swing' : ''}`} />
                                    {newDrawingsList.length > 0 && (
                                        <span className="absolute -top-1 -right-1 bg-red-500 text-white font-extrabold text-[9px] w-5 h-5 rounded-full flex items-center justify-center border border-white dark:border-gray-850 shadow-sm animate-pulse">
                                            {newDrawingsList.length}
                                        </span>
                                    )}
                                </button>

                                {/* Dropdown panel overlay */}
                                {isNotificationDropdownOpen && (
                                    <div className="absolute right-0 mt-2 w-72 sm:w-80 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl z-55 overflow-hidden animate-fade-in">
                                        <div className="p-3 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
                                            <span className="text-[11px] font-black text-gray-700 dark:text-gray-300 flex items-center gap-1">
                                                <Sparkles className="w-3.5 h-3.5 text-orange-500 animate-pulse" />
                                                Yeni Teknik Resimler
                                            </span>
                                            {newDrawingsList.length > 0 && (
                                                <button
                                                    onClick={handleMarkAllAsRead}
                                                    className="text-[9px] text-blue-600 dark:text-blue-400 hover:underline font-extrabold"
                                                >
                                                    Tümünü Okundu Yap
                                                </button>
                                            )}
                                        </div>
                                        <div className="max-h-60 overflow-y-auto divide-y divide-gray-150 dark:divide-gray-700 custom-scrollbar">
                                            {newDrawingsList.length === 0 ? (
                                                <p className="p-4 text-center text-xs text-gray-500 dark:text-gray-400 font-bold">
                                                    Yeni yüklenmiş resim yok.
                                                </p>
                                            ) : (
                                                newDrawingsList.map(item => (
                                                    <button
                                                        key={item.partId}
                                                        onClick={() => handleSelectDrawing(item)}
                                                        className="w-full p-2.5 hover:bg-orange-50/30 dark:hover:bg-orange-950/10 text-left text-[11px] font-bold block transition"
                                                    >
                                                        <div className="flex justify-between items-start gap-1">
                                                            <span className="text-[9px] text-gray-400 uppercase tracking-wider">{item.moldName}</span>
                                                            <span className="bg-red-500 text-white font-black text-[8px] px-1 py-0.2 rounded shrink-0">YENİ</span>
                                                        </div>
                                                        <p className="text-gray-800 dark:text-gray-200 truncate mt-0.5">{item.partName}</p>
                                                        <p className="text-[9px] text-gray-550 dark:text-gray-455 mt-0.5">
                                                            {item.uploadedBy} • {formatUploadDate(item.url, item.uploadedAt)}
                                                        </p>
                                                    </button>
                                                ))
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Filters row: status filter and optional time range filter */}
                        <div className={`grid gap-2 ${activeTab === 'timeline' ? 'grid-cols-2' : 'grid-cols-1'}`}>
                            <div>
                                <label className="block text-[10px] font-black text-gray-500 dark:text-gray-400 mb-1 uppercase">Kalıp Durumu</label>
                                <select
                                    value={statusFilter}
                                    onChange={(e) => setStatusFilter(e.target.value)}
                                    className="w-full text-xs font-bold py-1.5 px-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-1 focus:ring-blue-500 outline-none cursor-pointer"
                                >
                                    <option value="ALL">Tüm Durumlar</option>
                                    {availableStatuses.map(st => (
                                        <option key={st} value={st}>{st}</option>
                                    ))}
                                </select>
                            </div>
                            {activeTab === 'timeline' && (
                                <div>
                                    <label className="block text-[10px] font-black text-gray-500 dark:text-gray-400 mb-1 uppercase">Yükleme Zamanı</label>
                                    <select
                                        value={timeRangeFilter}
                                        onChange={(e) => setTimeRangeFilter(e.target.value)}
                                        className="w-full text-xs font-bold py-1.5 px-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-1 focus:ring-blue-500 outline-none cursor-pointer"
                                    >
                                        <option value="ALL">Tüm Zamanlar</option>
                                        <option value="1D">Son 1 Gün (24 Saat)</option>
                                        <option value="1W">Son 1 Hafta</option>
                                        <option value="1M">Son 1 Ay</option>
                                    </select>
                                </div>
                            )}
                        </div>

                        {/* Views tabs selector */}
                        <div className="flex bg-gray-100 dark:bg-gray-900/60 p-1 rounded-xl">
                            <button
                                onClick={() => setActiveTab('grouped')}
                                className={`flex-1 py-1.5 text-center text-xs font-black rounded-lg transition-all duration-200 ${
                                    activeTab === 'grouped'
                                        ? 'bg-white dark:bg-gray-850 text-blue-600 dark:text-blue-400 shadow-sm'
                                        : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                                }`}
                            >
                                <div className="flex items-center justify-center gap-1.5">
                                    <FolderOpen className="w-3.5 h-3.5" />
                                    Kalıba Göre Gruplu
                                </div>
                            </button>
                            <button
                                onClick={() => setActiveTab('timeline')}
                                className={`flex-1 py-1.5 text-center text-xs font-black rounded-lg transition-all duration-200 ${
                                    activeTab === 'timeline'
                                        ? 'bg-white dark:bg-gray-850 text-blue-600 dark:text-blue-400 shadow-sm'
                                        : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                                }`}
                            >
                                <div className="flex items-center justify-center gap-1.5">
                                    <Clock className="w-3.5 h-3.5" />
                                    Son Yüklenenler
                                </div>
                            </button>
                        </div>
                    </div>

                    {/* Scrollable list items */}
                    <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-4">
                        {activeTab === 'grouped' ? (
                            groupedDrawings.length === 0 ? (
                                <div className="text-center py-10 text-gray-500 dark:text-gray-400">
                                    <FileText className="w-10 h-10 mx-auto mb-2 text-gray-350 dark:text-gray-600" />
                                    <p className="text-xs font-bold">Arama veya filtrelere uygun kalıp bulunamadı.</p>
                                </div>
                            ) : (
                                groupedDrawings.map(group => (
                                    <div 
                                        key={group.moldId} 
                                        className="border border-gray-150 dark:border-gray-700 rounded-xl overflow-hidden shadow-sm bg-gray-50/20 dark:bg-gray-900/10"
                                    >
                                        {/* Mold header */}
                                        <div className="px-4 py-3 bg-gray-100/40 dark:bg-gray-900/30 border-b border-gray-150 dark:border-gray-700 flex justify-between items-center gap-3">
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap text-left">
                                                    <h4 className="font-extrabold text-xs text-gray-900 dark:text-white truncate">{group.moldName}</h4>
                                                    <span className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase ${
                                                        PROJECT_TYPE_CONFIG[group.projectType]?.colorClass || 'bg-gray-100 text-gray-800'
                                                    }`}>
                                                        {PROJECT_TYPE_CONFIG[group.projectType]?.label || 'YENİ'}
                                                    </span>
                                                    <span className="text-[8px] font-black px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 uppercase truncate max-w-[80px]">
                                                        {group.moldStatus}
                                                    </span>
                                                </div>
                                                <span className="text-[10px] text-gray-500 dark:text-gray-450 font-bold block mt-0.5 text-left">{group.customer}</span>
                                            </div>
                                            <Link 
                                                to={`/mold/${group.moldId}`} 
                                                className="shrink-0 text-[10px] bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 text-blue-600 dark:text-blue-400 font-extrabold px-2 py-1 rounded transition flex items-center gap-0.5 border border-blue-200 dark:border-blue-800"
                                            >
                                                Detay <ChevronRight className="w-3 h-3" />
                                            </Link>
                                        </div>

                                        {/* Mold drawings parts list */}
                                        <div className="divide-y divide-gray-150 dark:divide-gray-700">
                                            {group.drawings.map(d => {
                                                const isSelected = selectedDrawing?.partId === d.partId;
                                                const uploadTime = getUploadTime(d.url, d.uploadedAt);
                                                const isNew = (Date.now() - uploadTime) < 48 * 60 * 60 * 1000 && uploadTime > 0 && !seenDrawings.includes(d.partId);
                                                const isCompleted = d.partStatus === 'TAMAMLANDI';

                                                return (
                                                    <button
                                                        key={d.partId}
                                                        onClick={() => handleSelectDrawing(d)}
                                                        className={`w-full p-3 text-left text-xs font-bold transition flex items-center justify-between gap-3 ${
                                                            isSelected 
                                                                ? 'bg-blue-50/50 dark:bg-blue-900/20 border-l-4 border-l-blue-600' 
                                                                : 'hover:bg-gray-50 dark:hover:bg-gray-700/30'
                                                        }`}
                                                    >
                                                        <div className="min-w-0 flex items-center gap-2">
                                                            <FileText className={`w-4 h-4 shrink-0 ${isSelected ? 'text-blue-500' : 'text-gray-400'}`} />
                                                            <div className="truncate">
                                                                <p className={`truncate text-gray-800 dark:text-gray-200 flex items-center gap-1.5 ${isSelected ? 'font-black text-blue-600 dark:text-blue-400' : ''}`}>
                                                                    <span>{d.partName}</span>
                                                                    {isCompleted && (
                                                                        <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0 inline" title="İşlem Tamamlandı" />
                                                                    )}
                                                                </p>
                                                                <p className="text-[10px] text-gray-500 dark:text-gray-450 mt-0.5">
                                                                    Yükleme: {formatUploadDate(d.url, d.uploadedAt)}
                                                                </p>
                                                            </div>
                                                        </div>
                                                        <div className="shrink-0 flex items-center gap-1">
                                                            {isCompleted && (
                                                                <span className="bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-400 text-[8px] font-black px-1.5 py-0.5 rounded">
                                                                    TAMAMLANDI
                                                                </span>
                                                            )}
                                                            {isNew && (
                                                                <span className="bg-red-500 text-white font-black text-[9px] px-1.5 py-0.5 rounded animate-pulse shadow-sm">
                                                                    YENİ
                                                                </span>
                                                            )}
                                                        </div>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))
                            )
                        ) : (
                            /* Timeline view content */
                            timelineDrawings.length === 0 ? (
                                <div className="text-center py-10 text-gray-500 dark:text-gray-400">
                                    <Clock className="w-10 h-10 mx-auto mb-2 text-gray-350 dark:text-gray-600" />
                                    <p className="text-xs font-bold">Arama veya filtrelere uygun parça bulunamadı.</p>
                                </div>
                            ) : (
                                <div className="space-y-2.5">
                                    {timelineDrawings.map(d => {
                                        const isSelected = selectedDrawing?.partId === d.partId;
                                        const uploadTime = getUploadTime(d.url, d.uploadedAt);
                                        const isNew = (Date.now() - uploadTime) < 48 * 60 * 60 * 1000 && uploadTime > 0 && !seenDrawings.includes(d.partId);
                                        const isCompleted = d.partStatus === 'TAMAMLANDI';

                                        return (
                                            <button
                                                key={d.partId}
                                                onClick={() => handleSelectDrawing(d)}
                                                className={`w-full p-3.5 border border-gray-150 dark:border-gray-700 rounded-xl text-left text-xs font-bold transition flex items-center justify-between gap-3 shadow-sm ${
                                                    isSelected
                                                        ? 'bg-blue-50/50 dark:bg-blue-900/20 border-l-4 border-l-blue-600'
                                                        : 'bg-gray-50/20 dark:bg-gray-900/5 hover:bg-gray-50 dark:hover:bg-gray-700/30'
                                                }`}
                                            >
                                                <div className="min-w-0 space-y-1.5">
                                                    {/* Mold info row */}
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                        <span className="text-[10px] text-gray-500 dark:text-gray-400 font-extrabold uppercase truncate max-w-[120px]">
                                                            {d.moldName}
                                                        </span>
                                                        <span className="text-[9px] text-gray-405">•</span>
                                                        <span className="text-[10px] text-gray-500 dark:text-gray-450 italic truncate max-w-[100px]">
                                                            {d.customer}
                                                        </span>
                                                    </div>

                                                    {/* Part name */}
                                                    <div className={`text-sm text-gray-900 dark:text-white truncate flex items-center gap-1.5 ${isSelected ? 'font-black text-blue-600 dark:text-blue-400' : ''}`}>
                                                        <span className="truncate">{d.partName}</span>
                                                        {isCompleted && (
                                                            <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0 inline" title="İşlem Tamamlandı" />
                                                        )}
                                                    </div>

                                                    {/* Uploader and date metadata */}
                                                    <div className="flex items-center gap-3 text-[10px] text-gray-500 dark:text-gray-450 font-bold">
                                                        <span className="flex items-center gap-0.5">
                                                            <User className="w-3.5 h-3.5 text-gray-400" />
                                                            {d.uploadedBy}
                                                        </span>
                                                        <span className="flex items-center gap-0.5">
                                                            <Calendar className="w-3.5 h-3.5 text-gray-400" />
                                                            {formatUploadDate(d.url, d.uploadedAt)}
                                                        </span>
                                                    </div>
                                                </div>

                                                <div className="shrink-0 flex flex-col items-end gap-2">
                                                    {isCompleted ? (
                                                        <span className="bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-400 text-[8px] font-black px-1.5 py-0.5 rounded">
                                                            TAMAMLANDI
                                                        </span>
                                                    ) : isNew ? (
                                                        <span className="bg-red-500 text-white font-black text-[9px] px-1.5 py-0.5 rounded animate-pulse shadow-sm">
                                                            YENİ
                                                        </span>
                                                    ) : null}
                                                    <span className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase ${
                                                        PROJECT_TYPE_CONFIG[d.projectType]?.colorClass || 'bg-gray-100 text-gray-800'
                                                    }`}>
                                                        {PROJECT_TYPE_CONFIG[d.projectType]?.label || 'YENİ'}
                                                    </span>
                                                    <span className="text-[8px] font-black px-1.5 py-0.5 rounded bg-gray-250 dark:bg-gray-700 text-gray-600 dark:text-gray-300 uppercase truncate max-w-[80px]">
                                                        {d.moldStatus}
                                                    </span>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            )
                        )}
                    </div>
                </div>

                {/* RIGHT COLUMN: PDF Previewer Container (Span 3) */}
                <div className={`lg:col-span-3 flex flex-col bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden shadow-sm ${selectedDrawing ? 'flex' : 'hidden lg:flex'}`}>
                    {selectedDrawing ? (
                        <div className="flex flex-col h-full overflow-hidden">
                            {/* File title details header */}
                            <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/35 flex flex-col gap-3 shrink-0">
                                <div className="flex items-center justify-between gap-3">
                                    <div className="flex items-center min-w-0 gap-2">
                                        <button 
                                            onClick={() => setSelectedDrawing(null)} 
                                            className="lg:hidden p-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-650 rounded-xl text-gray-700 dark:text-gray-200 transition flex items-center gap-1 font-bold text-xs shrink-0"
                                        >
                                            <ArrowLeft className="w-4 h-4" />
                                            Geri
                                        </button>
                                        <div className="min-w-0">
                                            <h3 className="font-extrabold text-sm text-gray-900 dark:text-white truncate flex items-center gap-2">
                                                <span>{selectedDrawing.partName}</span>
                                                {selectedDrawing.partStatus === 'TAMAMLANDI' && (
                                                    <span className="px-2 py-0.5 bg-green-600 text-white text-[9px] font-black rounded uppercase shrink-0">
                                                        TAMAMLANDI
                                                    </span>
                                                )}
                                            </h3>
                                        </div>
                                    </div>
                                    <span className={`text-[9px] font-black px-1.5 py-0.5 rounded uppercase shrink-0 ${
                                        PROJECT_TYPE_CONFIG[selectedDrawing.projectType]?.colorClass || 'bg-gray-100 text-gray-800'
                                    }`}>
                                        {PROJECT_TYPE_CONFIG[selectedDrawing.projectType]?.label || 'YENİ KALIP'}
                                    </span>
                                </div>

                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                                    <div className="text-xs text-gray-500 dark:text-gray-455 font-bold space-y-1 text-left">
                                        <p>Kalıp: {selectedDrawing.moldName} • Müşteri: {selectedDrawing.customer} • Durum: {selectedDrawing.moldStatus}</p>
                                        <div className="flex items-center gap-2.5 text-[10px] text-gray-400">
                                            <span className="flex items-center gap-0.5">
                                                <User className="w-3.5 h-3.5" />
                                                Yükleyen: {selectedDrawing.uploadedBy}
                                            </span>
                                            <span>•</span>
                                            <span className="flex items-center gap-0.5">
                                                <Calendar className="w-3.5 h-3.5" />
                                                Tarih: {formatUploadDate(selectedDrawing.url, selectedDrawing.uploadedAt)}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="flex gap-2 justify-end w-full md:w-auto">
                                        <Link 
                                            to={`/mold/${selectedDrawing.moldId}`}
                                            className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 text-xs font-black rounded-lg transition border border-gray-200 dark:border-gray-600 flex items-center gap-1 flex-1 sm:flex-initial justify-center"
                                        >
                                            <FolderOpen className="w-3.5 h-3.5" />
                                            Kalıp Detayı
                                        </Link>
                                        <a
                                            href={selectedDrawing.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black rounded-lg transition flex items-center gap-1 shadow-sm flex-1 sm:flex-initial justify-center"
                                        >
                                            <ExternalLink className="w-3.5 h-3.5" />
                                            Aç / İndir
                                        </a>
                                    </div>
                                </div>
                            </div>

                            {/* Embed PDF Viewer */}
                            <div className="flex-1 bg-gray-100 dark:bg-gray-900 p-2 overflow-hidden relative flex justify-center items-center">
                                <iframe
                                    src={`${selectedDrawing.url}#toolbar=1&navpanes=0`}
                                    title={selectedDrawing.partName}
                                    className="w-full h-full border-0 rounded-xl bg-white dark:bg-gray-850 shadow-sm"
                                    accept="application/pdf"
                                />
                            </div>
                        </div>
                    ) : (
                        /* Empty state placeholder */
                        <div className="flex-1 flex flex-col justify-center items-center text-center p-8 bg-gray-50/20 dark:bg-gray-900/5">
                            <div className="w-20 h-20 bg-blue-50 dark:bg-blue-950/30 rounded-full flex items-center justify-center mb-4 border border-blue-100 dark:border-blue-900/40">
                                <FileText className="w-10 h-10 text-blue-500 animate-pulse" />
                            </div>
                            <h3 className="font-extrabold text-sm text-gray-800 dark:text-white">Teknik Resim Önizleme</h3>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 max-w-sm font-medium leading-relaxed">
                                PDF formatındaki teknik resmi tarayıcı içinde doğrudan görüntülemek, yazdırmak veya indirmek için sol listeden bir parça seçiniz.
                            </p>
                            
                            {/* Alert panel for zero selection */}
                            <div className="mt-8 p-3.5 max-w-sm rounded-xl border border-blue-100 dark:border-blue-950 bg-blue-50/30 dark:bg-blue-950/20 flex items-start gap-2.5 text-left text-[11px] text-blue-800 dark:text-blue-300 font-bold leading-normal">
                                <AlertCircle className="w-4 h-4 shrink-0 text-blue-500" />
                                <div>
                                    <p className="font-black text-xs mb-0.5">Kısayol İpucu</p>
                                    Kalıp detaylarındaki parça listelerine gitmek için listedeki kalıp kartlarının sağ üstündeki "Detay" butonunu kullanabilirsiniz.
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default TechnicalDrawingsPage;
