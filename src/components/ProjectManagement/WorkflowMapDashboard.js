// src/components/ProjectManagement/WorkflowMapDashboard.js

import React, { useState, useMemo } from 'react';
import { 
    CheckCircle, Clock, AlertTriangle, AlertCircle, ShieldCheck, 
    ArrowRight, ChevronRight, Check, X, FileText, User, Calendar, 
    Activity, ChevronDown, Layers, Cpu, Wrench, Sparkles, Box, HardHat, Settings, Eye, Search, RotateCcw
} from 'lucide-react';
import { formatDate } from '../../utils/dateUtils.js';

// Düğüm Tanımları (Workflow Nodes)
export const WORKFLOW_NODES = [
    // TRACK 1: KALIP İMALAT & HAZIRLIK SÜRECİ
    { id: 'productDesign', track: 1, label: 'ÜRÜN TAS', fullLabel: 'Ürün Tasarımı (Ürün Geliştirme)', icon: Box, isGate: false, requiredRole: 'Tasarım / Ar-Ge Sorumlusu' },
    { id: 'customerApproval', track: 1, label: 'TAS ONAYI', fullLabel: 'Müşteri Onayı (Proje Yöneticisi)', icon: ShieldCheck, isGate: true, requiredRole: 'Proje Sorumlusu' },
    { id: 'moldDesign', track: 1, label: 'KALP TAS', fullLabel: 'Kalıp Tasarımı (Tasarım Ofisi)', icon: FileText, isGate: false, requiredRole: 'Kalıp Tasarım Sorumlusu' },
    { id: 'moldDesignApproval', track: 1, label: 'KALP ONAYI', fullLabel: 'Kalıp Tasarım Yöneticisi Onayı', icon: ShieldCheck, isGate: true, requiredRole: 'Kalıp Tasarım Yöneticisi' },
    { id: 'materialOrder', track: 1, label: 'MALZEME TEMİN', fullLabel: 'Çelik & Standart Malzeme Temini', icon: Layers, isGate: true, requiredRole: 'Takımhane / Satınalma' },
    { id: 'cncMachining', track: 1, label: 'CNC', fullLabel: 'Hassas İşleme (CNC & Erozyon)', icon: Cpu, isGate: false, requiredRole: 'CNC & Erozyon Operatörü' },
    { id: 'polishing', track: 1, label: 'POLİSAJ/DESEN', fullLabel: 'Polisaj & Desen Operasyonu', icon: Sparkles, isGate: false, requiredRole: 'Polisaj Ekibi / Sorumlusu' },
    { id: 'assembly', track: 1, label: 'KALP TOPL.', fullLabel: 'Kalıp Montaj & Alıştırma', icon: HardHat, isGate: false, requiredRole: 'Kalıphane Montaj Ustası' },

    // TRACK 2: DENEME & SERİ ÜRETİM SÜRECİ
    { id: 't0Trial', track: 2, label: 'T0 DENEME', fullLabel: 'T0 Plastik Denemesi', icon: Settings, isGate: false, requiredRole: 'Enjeksiyon Deneme Sorumlusu' },
    { id: 't0Polishing', track: 2, label: 'POLİSAJ', fullLabel: 'Deneme Sonrası Polisaj & Desen Operasyonu', icon: Sparkles, isGate: false, requiredRole: 'Polisaj & Desen Ekibi' },
    { id: 'pilotProduction', track: 2, label: 'ÖN SERİ ÜRETİM', fullLabel: 'Ön Seri Üretim (Pilot Lot)', icon: Activity, isGate: false, requiredRole: 'Üretim & Kalite Sorumlusu' },
    { id: 'ppap', track: 2, label: 'PPAP', fullLabel: 'PPAP & Kalite Onayları', icon: FileText, isGate: false, requiredRole: 'Kalite Güvence Yöneticisi' },
    { id: 'massProductionApproval', track: 2, label: 'SERİ ONAY', fullLabel: 'Seri Üretim Final Onayı', icon: ShieldCheck, isGate: true, requiredRole: 'Yönetici / Kalite' },
    { id: 'massProduction', track: 2, label: 'SERİ ÜRETİM', fullLabel: 'Seri Üretim (Tamamlandı)', icon: CheckCircle, isGate: false, requiredRole: 'Seri Üretim Departmanı' }
];

const WorkflowMapDashboard = ({ 
    selectedProject, 
    projects = [], 
    onSelectProject,
    setSelectedProject, 
    onUpdateWorkflowStep,
    loggedInUser 
}) => {
    const handleSelectProject = onSelectProject || setSelectedProject || (() => {});

    const [activeNodeModal, setActiveNodeModal] = useState(null);
    const [approvalNote, setApprovalNote] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [isSearchDropdownOpen, setIsSearchDropdownOpen] = useState(false);

    // Filtrelenmiş Kalıplar
    const filteredProjects = useMemo(() => {
        if (!searchQuery.trim()) return projects;
        const q = searchQuery.toLowerCase();
        return projects.filter(p => 
            (p.moldName && p.moldName.toLowerCase().includes(q)) ||
            (p.customer && p.customer.toLowerCase().includes(q)) ||
            (p.id && p.id.toLowerCase().includes(q))
        );
    }, [projects, searchQuery]);

    // Mevcut projenin süreç verileri
    const steps = useMemo(() => {
        if (!selectedProject) return {};
        return selectedProject.workflowSteps || {};
    }, [selectedProject]);

    // Proje Sağlık Skoru Hesabı
    const healthData = useMemo(() => {
        if (!selectedProject) return { score: 100, status: 'On Track', color: 'text-green-600 bg-green-50' };
        
        let completedCount = 0;
        const totalNodes = WORKFLOW_NODES.length;

        WORKFLOW_NODES.forEach(node => {
            const step = steps[node.id];
            if (step && (step.status === 'COMPLETED' || step.status === 'SKIPPED')) {
                completedCount++;
            }
        });

        const progressPercent = Math.round((completedCount / totalNodes) * 100);

        // Termin gecikmesi kontrolü
        const deadline = selectedProject.moldDeadline ? new Date(selectedProject.moldDeadline) : null;
        const today = new Date();
        const isLate = deadline && deadline < today && progressPercent < 100;

        if (isLate) {
            return { score: Math.max(30, progressPercent), status: 'Gecikmede (Delay)', color: 'text-red-600 bg-red-50 border-red-200' };
        } else if (progressPercent < 40 && deadline && (deadline - today) / (1000 * 3600 * 24) < 7) {
            return { score: 75, status: 'Dikkat (Warning)', color: 'text-amber-600 bg-amber-50 border-amber-200' };
        }

        return { score: 92, status: 'On Track', color: 'text-green-600 bg-green-50 border-green-200' };
    }, [selectedProject, steps]);

    // Aktif Uyarılar
    const activeAlerts = useMemo(() => {
        if (!selectedProject) return [];
        const alerts = [];

        const matStep = steps['materialOrder'];
        if (!matStep || (!matStep.isOrdered && matStep.status !== 'SKIPPED' && matStep.status !== 'COMPLETED')) {
            alerts.push({ id: 1, type: 'WARNING', title: 'Malzeme Siparişi Verilmedi', desc: 'Çelik & Standart malzeme temin onayı bekleniyor.' });
        }

        const custStep = steps['customerApproval'];
        if (custStep && custStep.status === 'PENDING') {
            alerts.push({ id: 2, type: 'INFO', title: 'Müşteri Onayı Bekliyor', desc: 'Ürün geliştirme tamamlandı, müşteri onayı onay bekliyor.' });
        }

        const moldDesignStep = steps['moldDesignApproval'];
        if (moldDesignStep && moldDesignStep.status === 'PENDING' && steps['moldDesign']?.status === 'COMPLETED') {
            alerts.push({ id: 3, type: 'INFO', title: 'Tasarım Yöneticisi Onayı Bekliyor', desc: 'Kalıp tasarımı bitti, yönetici onayı bekleniyor.' });
        }

        if (alerts.length === 0) {
            alerts.push({ id: 0, type: 'SUCCESS', title: 'Aşama Tıkırında', desc: 'Şu an engellenmiş kritik bir süreç bulunmuyor.' });
        }

        return alerts;
    }, [selectedProject, steps]);

    // Node Durum Belirleyici Yardımcı
    const getNodeState = (nodeId) => {
        const step = steps[nodeId];
        if (!step) return { status: 'PENDING', badge: 'PENDING', colorClass: 'border-gray-300 dark:border-gray-600 text-gray-400 dark:text-gray-400 bg-gray-50 dark:bg-gray-800' };

        if (step.status === 'COMPLETED') {
            return { status: 'COMPLETED', badge: 'COMPLETED', colorClass: 'border-green-500 bg-green-500 text-white shadow-lg shadow-green-500/20 ring-4 ring-green-100 dark:ring-green-900/30' };
        }
        if (step.status === 'SKIPPED') {
            return { status: 'SKIPPED', badge: 'PAS GEÇİLDİ', colorClass: 'border-blue-400 bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200' };
        }
        if (step.status === 'IN_PROGRESS') {
            return { status: 'IN_PROGRESS', badge: 'IN PROGRESS', colorClass: 'border-amber-500 bg-amber-400 text-gray-900 font-bold shadow-xl shadow-amber-500/30 animate-pulse ring-4 ring-amber-200 dark:ring-amber-900/40' };
        }
        if (step.status === 'BLOCKED') {
            return { status: 'BLOCKED', badge: 'ENGELLENDİ', colorClass: 'border-red-500 bg-red-500 text-white shadow-lg shadow-red-500/20 ring-4 ring-red-100 dark:ring-red-900/30' };
        }

        return { status: 'PENDING', badge: 'PENDING', colorClass: 'border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-400' };
    };

    const handleOpenNodeModal = (node) => {
        setActiveNodeModal(node);
        setApprovalNote('');
    };

    const handleStepAction = (nodeId, newStatus, isMaterialOrdered = false) => {
        if (!selectedProject) return;
        onUpdateWorkflowStep(selectedProject.id, nodeId, {
            status: newStatus,
            approvedBy: loggedInUser?.name || 'Sistem',
            approvedAt: new Date().toISOString(),
            note: approvalNote.trim(),
            isOrdered: isMaterialOrdered
        });
        setActiveNodeModal(null);
    };

    if (!selectedProject) {
        return (
            <div className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow border border-gray-200 dark:border-gray-700 text-center">
                <p className="text-gray-500 dark:text-gray-400">Lütfen üst listeden takip edilecek bir kalıp projesi seçiniz.</p>
            </div>
        );
    }

    const track1Nodes = WORKFLOW_NODES.filter(n => n.track === 1);
    const track2Nodes = WORKFLOW_NODES.filter(n => n.track === 2);

    return (
        <div className="space-y-6">
            
            {/* 1. ÜST BAR: PROJE BİLGİ KARTLARI & ARAMALI SEÇİM */}
            <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-md border border-gray-200 dark:border-gray-700 flex flex-col lg:flex-row justify-between items-stretch lg:items-center gap-4">
                
                {/* Sol: Arama Seçenekli Kalıp Seçici & Başlıklar */}
                <div className="flex flex-wrap items-center gap-4">
                    
                    {/* ARAMALI KALIP SEÇİCİ DROPDOWN */}
                    <div className="relative min-w-[280px] sm:min-w-[340px]">
                        {isSearchDropdownOpen && (
                            <div 
                                className="fixed inset-0 z-40" 
                                onClick={() => setIsSearchDropdownOpen(false)} 
                            />
                        )}
                        <div 
                            onClick={() => setIsSearchDropdownOpen(!isSearchDropdownOpen)}
                            className="flex items-center justify-between gap-2 bg-gray-50 dark:bg-gray-700/80 border border-gray-300 dark:border-gray-600 hover:border-blue-500 dark:hover:border-blue-400 p-2.5 rounded-xl cursor-pointer shadow-sm transition"
                        >
                            <div className="flex items-center gap-2 truncate">
                                <Box className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                                <div className="truncate">
                                    <span className="text-[10px] text-gray-400 dark:text-gray-400 uppercase font-extrabold block leading-none mb-0.5">Seçili Kalıp Projesi</span>
                                    <span className="text-xs font-black text-gray-900 dark:text-white truncate block">
                                        Kalıp: {selectedProject.moldName} {selectedProject.customer ? `(${selectedProject.customer})` : ''}
                                    </span>
                                </div>
                            </div>
                            <ChevronDown className="w-4 h-4 text-gray-500 dark:text-gray-400 shrink-0" />
                        </div>

                        {isSearchDropdownOpen && (
                            <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 z-50 overflow-hidden max-h-80 flex flex-col animate-fadeIn">
                                {/* Arama İnput Kutusu */}
                                <div className="p-2 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/90 sticky top-0">
                                    <div className="relative">
                                        <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400 dark:text-gray-400" />
                                        <input 
                                            type="text"
                                            autoFocus
                                            placeholder="Kalıp adı veya müşteri yazarak ara..."
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            className="w-full pl-9 pr-3 py-1.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-xs font-bold text-gray-900 dark:text-white placeholder-gray-400 outline-none focus:ring-2 focus:ring-blue-500"
                                        />
                                    </div>
                                </div>

                                {/* Liste */}
                                <div className="overflow-y-auto max-h-60 p-1 divide-y divide-gray-100 dark:divide-gray-700/50">
                                    {filteredProjects.length === 0 ? (
                                        <div className="p-4 text-center text-xs font-semibold text-gray-400">
                                            Aramaya uygun kalıp bulunamadı.
                                        </div>
                                    ) : (
                                        filteredProjects.map(p => {
                                            const isSelected = p.id === selectedProject.id;
                                            return (
                                                <div 
                                                    key={p.id}
                                                    onClick={() => {
                                                        handleSelectProject(p);
                                                        setIsSearchDropdownOpen(false);
                                                    }}
                                                    className={`p-2.5 rounded-lg flex items-center justify-between cursor-pointer transition text-xs ${
                                                        isSelected 
                                                            ? 'bg-blue-50 dark:bg-blue-900/40 text-blue-900 dark:text-blue-100 font-extrabold' 
                                                            : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 font-semibold'
                                                    }`}
                                                >
                                                    <div className="truncate pr-2">
                                                        <div className="font-black text-gray-900 dark:text-white truncate">{p.moldName}</div>
                                                        <div className="text-[10px] text-gray-500 dark:text-gray-400 flex items-center gap-2 mt-0.5">
                                                            <span>Müşteri: {p.customer || '-'}</span>
                                                            <span>•</span>
                                                            <span>Termin: {formatDate(p.moldDeadline)}</span>
                                                        </div>
                                                    </div>
                                                    {isSelected && <Check className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />}
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-4 text-xs font-bold text-gray-700 dark:text-gray-200 divide-x divide-gray-200 dark:divide-gray-700">
                        <div className="pr-3">
                            <span className="text-gray-400 uppercase block text-[10px]">Proje İsmi</span>
                            <span className="text-sm font-black text-gray-900 dark:text-white">{selectedProject.moldName}</span>
                        </div>
                        <div className="px-3">
                            <span className="text-gray-400 uppercase block text-[10px]">Müşteri</span>
                            <span className="text-sm font-black text-gray-900 dark:text-white">{selectedProject.customer || '-'}</span>
                        </div>
                        <div className="px-3">
                            <span className="text-gray-400 uppercase block text-[10px]">Termin</span>
                            <span className="text-sm font-black text-blue-600 dark:text-blue-400">{formatDate(selectedProject.moldDeadline)}</span>
                        </div>
                    </div>
                </div>

                {/* Sağ: Canlı Rozet & Proje Sağlık Skoru */}
                <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-extrabold text-xs rounded-full border border-emerald-200 dark:border-emerald-800">
                        <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-ping"></span>
                        LIVE MONITORING
                    </span>

                    <div className={`px-4 py-2 rounded-xl border flex items-center gap-3 ${healthData.color}`}>
                        <div>
                            <span className="text-[10px] uppercase font-black tracking-wider block opacity-75">Project Health</span>
                            <span className="text-lg font-black">{healthData.score}% ({healthData.status})</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* 2. ANA AKIŞ ŞEMASI PANELİ (RESİM 2 LIVE PRODUCTION WORKFLOW MONITORING) */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                
                {/* SOL 3 KOLON: CANLI AKIŞ ŞEMASI (TRACK 1 & TRACK 2) */}
                <div className="lg:col-span-3 bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 p-6 space-y-8 relative overflow-hidden">
                    
                    <div className="flex justify-between items-center border-b border-gray-100 dark:border-gray-700 pb-4">
                        <h2 className="text-lg font-black text-gray-900 dark:text-white tracking-wide uppercase flex items-center gap-2">
                            <Activity className="w-5 h-5 text-blue-500" />
                            Live Production Workflow Monitoring
                        </h2>
                        <span className="text-xs font-bold text-gray-400">Düğümlere tıklayarak durum onaylayabilirsiniz.</span>
                    </div>

                    {/* TRACK 1: MOLD MANUFACTURING */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2">
                            <span className="px-2.5 py-1 bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 text-xs font-black rounded-lg">TRACK 1</span>
                            <h3 className="font-extrabold text-xs text-gray-600 dark:text-gray-300 uppercase tracking-wider">MOLD MANUFACTURING (Kalıp İmalat & Hazırlık Süreci)</h3>
                        </div>

                        <div className="flex items-center justify-between gap-2 overflow-x-auto py-4 px-2 no-scrollbar">
                            {track1Nodes.map((node, idx) => {
                                const state = getNodeState(node.id);
                                const IconComponent = node.icon;

                                // Yüzdelik Oran Hesabı
                                let pct = 0;
                                if (node.id === 'productDesign') {
                                    pct = steps?.productDesign?.progressPercent ?? (steps?.productDesign?.status === 'COMPLETED' ? 100 : 0);
                                } else {
                                    const nodeStep = steps?.[node.id];
                                    pct = nodeStep?.progressPercent !== undefined ? nodeStep.progressPercent : (state.status === 'COMPLETED' ? 100 : (state.status === 'IN_PROGRESS' ? 50 : 0));
                                }
                                pct = Math.min(100, Math.max(0, parseInt(pct) || 0));

                                // SVG Dairesel Halka Matematik Tanımı (R=36, C=2*PI*36 ~ 226.19)
                                const radius = 36;
                                const circumference = 2 * Math.PI * radius;
                                const strokeDashoffset = circumference - (circumference * pct) / 100;

                                // 0-100 Yüzde Renk Skalası (Glow & Gradient)
                                let ringGradStart = '#94a3b8';
                                let ringGradEnd = '#64748b';
                                let badgeBg = 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700';
                                let ringGlow = '';

                                if (pct > 0 && pct <= 25) {
                                    ringGradStart = '#ef4444'; // Kırmızı
                                    ringGradEnd = '#f97316';   // Turuncu
                                    badgeBg = 'bg-gradient-to-r from-red-500 to-orange-500 text-white font-black shadow-md shadow-red-500/40 border-red-400';
                                    ringGlow = 'drop-shadow-[0_0_10px_rgba(239,68,68,0.7)]';
                                } else if (pct > 25 && pct <= 50) {
                                    ringGradStart = '#f59e0b'; // Kehribar
                                    ringGradEnd = '#eab308';   // Altın Sarısı
                                    badgeBg = 'bg-gradient-to-r from-amber-500 to-yellow-500 text-white font-black shadow-md shadow-amber-500/40 border-amber-400';
                                    ringGlow = 'drop-shadow-[0_0_12px_rgba(245,158,11,0.8)]';
                                } else if (pct > 50 && pct <= 75) {
                                    ringGradStart = '#0284c7'; // Mavi
                                    ringGradEnd = '#3b82f6';   // Parlak Mavi
                                    badgeBg = 'bg-gradient-to-r from-sky-500 to-blue-600 text-white font-black shadow-md shadow-blue-500/40 border-blue-400';
                                    ringGlow = 'drop-shadow-[0_0_12px_rgba(59,130,246,0.8)]';
                                } else if (pct > 75 && pct < 100) {
                                    ringGradStart = '#0d9488'; // Turkuaz
                                    ringGradEnd = '#10b981';   // Zümrüt Yeşili
                                    badgeBg = 'bg-gradient-to-r from-teal-500 to-emerald-500 text-white font-black shadow-md shadow-teal-500/40 border-emerald-400';
                                    ringGlow = 'drop-shadow-[0_0_12px_rgba(16,185,129,0.8)]';
                                } else if (pct >= 100) {
                                    ringGradStart = '#10b981'; // Zümrüt Yeşili
                                    ringGradEnd = '#34d399';   // Mint Yeşili
                                    badgeBg = 'bg-gradient-to-r from-emerald-500 to-teal-400 text-white font-black shadow-md shadow-emerald-500/50 border-emerald-300 ring-2 ring-emerald-400/50';
                                    ringGlow = 'drop-shadow-[0_0_14px_rgba(16,185,129,0.9)]';
                                }

                                const ringId = `svg-ring-grad-t1-${node.id}`;

                                return (
                                    <React.Fragment key={node.id}>
                                        <div 
                                            onClick={() => handleOpenNodeModal(node)}
                                            className="flex flex-col items-center cursor-pointer group flex-shrink-0 transition-transform duration-200 hover:scale-105"
                                        >
                                            {/* Düğüm Dairesi & SVG İlerleme Halkası */}
                                            <div className={`relative w-24 h-24 flex items-center justify-center ${ringGlow} transition-all duration-500`}>
                                                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 88 88">
                                                    <defs>
                                                        <linearGradient id={ringId} x1="0%" y1="0%" x2="100%" y2="100%">
                                                            <stop offset="0%" stopColor={ringGradStart} />
                                                            <stop offset="100%" stopColor={ringGradEnd} />
                                                        </linearGradient>
                                                    </defs>
                                                    
                                                    {/* Arka Plan Gri Dairesel Ray */}
                                                    <circle
                                                        cx="44"
                                                        cy="44"
                                                        r={radius}
                                                        stroke="currentColor"
                                                        strokeWidth="4.5"
                                                        fill="transparent"
                                                        className="text-gray-200 dark:text-gray-700/60"
                                                    />
                                                    
                                                    {/* İlerleme Halkası */}
                                                    {pct > 0 && (
                                                        <circle
                                                            cx="44"
                                                            cy="44"
                                                            r={radius}
                                                            stroke={`url(#${ringId})`}
                                                            strokeWidth="5.5"
                                                            strokeLinecap="round"
                                                            fill="transparent"
                                                            strokeDasharray={circumference}
                                                            strokeDashoffset={strokeDashoffset}
                                                            className="transition-all duration-1000 ease-out"
                                                        />
                                                    )}
                                                </svg>

                                                {/* İç Daire Düğüm İçeriği */}
                                                <div className={`absolute inset-2.5 rounded-full flex flex-col items-center justify-center p-1.5 text-center transition-all shadow-inner ${state.colorClass}`}>
                                                    <IconComponent className="w-4 h-4 mb-0.5" />
                                                    <span className="text-[9px] font-black leading-tight tracking-tight uppercase line-clamp-2 px-0.5">
                                                        {node.label}
                                                    </span>

                                                    {/* Belirgin Yüzdelik Rozeti */}
                                                    <span className={`text-[9px] px-1.5 py-0.2 rounded-full mt-0.5 border shadow-sm transition-all transform group-hover:scale-110 ${badgeBg}`}>
                                                        %{pct}
                                                    </span>
                                                </div>
                                            </div>
                                            
                                            {/* Durum Etiketi (COMPLETED / IN PROGRESS / PENDING) */}
                                            <span className={`mt-2 text-[9px] font-black px-2 py-0.5 rounded-full uppercase border transition-colors ${
                                                state.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700' :
                                                state.status === 'IN_PROGRESS' ? 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300 font-bold border-amber-300 dark:border-amber-700' :
                                                state.status === 'SKIPPED' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 border-blue-300' :
                                                'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400 border-gray-200 dark:border-gray-600'
                                            }`}>
                                                {state.badge}
                                            </span>
                                        </div>

                                        {/* Ok Çizgisi (Son elemanda çizilmez) */}
                                        {idx < track1Nodes.length - 1 && (
                                            <div className="flex-1 min-w-[24px] h-[3px] bg-gray-200 dark:bg-gray-700 relative flex items-center justify-center">
                                                <div className="w-2 h-2 border-t-2 border-r-2 border-gray-400 transform rotate-45"></div>
                                            </div>
                                        )}
                                    </React.Fragment>
                                );
                            })}
                        </div>
                    </div>

                    {/* AKTARMALI ÇİZGİ SEPARATÖRÜ */}
                    <div className="border-t border-dashed border-gray-200 dark:border-gray-700 my-4"></div>

                    {/* TRACK 2: PILOT & MASS PRODUCTION */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2">
                            <span className="px-2.5 py-1 bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300 text-xs font-black rounded-lg">TRACK 2</span>
                            <h3 className="font-extrabold text-xs text-gray-600 dark:text-gray-300 uppercase tracking-wider">PILOT & MASS PRODUCTION (Deneme & Seri Üretim Süreci)</h3>
                        </div>

                        <div className="flex items-center justify-between gap-2 overflow-x-auto py-4 px-2 no-scrollbar">
                            {track2Nodes.map((node, idx) => {
                                const state = getNodeState(node.id);
                                const IconComponent = node.icon;

                                // Yüzdelik Oran Hesabı
                                const nodeStep = steps?.[node.id];
                                let pct = nodeStep?.progressPercent !== undefined ? nodeStep.progressPercent : (state.status === 'COMPLETED' ? 100 : (state.status === 'IN_PROGRESS' ? 50 : 0));
                                pct = Math.min(100, Math.max(0, parseInt(pct) || 0));

                                const radius = 36;
                                const circumference = 2 * Math.PI * radius;
                                const strokeDashoffset = circumference - (circumference * pct) / 100;

                                let ringGradStart = '#94a3b8';
                                let ringGradEnd = '#64748b';
                                let badgeBg = 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700';
                                let ringGlow = '';

                                if (pct > 0 && pct <= 25) {
                                    ringGradStart = '#ef4444';
                                    ringGradEnd = '#f97316';
                                    badgeBg = 'bg-gradient-to-r from-red-500 to-orange-500 text-white font-black shadow-md shadow-red-500/40 border-red-400';
                                    ringGlow = 'drop-shadow-[0_0_10px_rgba(239,68,68,0.7)]';
                                } else if (pct > 25 && pct <= 50) {
                                    ringGradStart = '#f59e0b';
                                    ringGradEnd = '#eab308';
                                    badgeBg = 'bg-gradient-to-r from-amber-500 to-yellow-500 text-white font-black shadow-md shadow-amber-500/40 border-amber-400';
                                    ringGlow = 'drop-shadow-[0_0_12px_rgba(245,158,11,0.8)]';
                                } else if (pct > 50 && pct <= 75) {
                                    ringGradStart = '#0284c7';
                                    ringGradEnd = '#3b82f6';
                                    badgeBg = 'bg-gradient-to-r from-sky-500 to-blue-600 text-white font-black shadow-md shadow-blue-500/40 border-blue-400';
                                    ringGlow = 'drop-shadow-[0_0_12px_rgba(59,130,246,0.8)]';
                                } else if (pct > 75 && pct < 100) {
                                    ringGradStart = '#0d9488';
                                    ringGradEnd = '#10b981';
                                    badgeBg = 'bg-gradient-to-r from-teal-500 to-emerald-500 text-white font-black shadow-md shadow-teal-500/40 border-emerald-400';
                                    ringGlow = 'drop-shadow-[0_0_12px_rgba(16,185,129,0.8)]';
                                } else if (pct >= 100) {
                                    ringGradStart = '#10b981';
                                    ringGradEnd = '#34d399';
                                    badgeBg = 'bg-gradient-to-r from-emerald-500 to-teal-400 text-white font-black shadow-md shadow-emerald-500/50 border-emerald-300 ring-2 ring-emerald-400/50';
                                    ringGlow = 'drop-shadow-[0_0_14px_rgba(16,185,129,0.9)]';
                                }

                                const ringId = `svg-ring-grad-t2-${node.id}`;

                                return (
                                    <React.Fragment key={node.id}>
                                        <div 
                                            onClick={() => handleOpenNodeModal(node)}
                                            className="flex flex-col items-center cursor-pointer group flex-shrink-0 transition-transform duration-200 hover:scale-105"
                                        >
                                            {/* Düğüm Dairesi & SVG İlerleme Halkası */}
                                            <div className={`relative w-24 h-24 flex items-center justify-center ${ringGlow} transition-all duration-500`}>
                                                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 88 88">
                                                    <defs>
                                                        <linearGradient id={ringId} x1="0%" y1="0%" x2="100%" y2="100%">
                                                            <stop offset="0%" stopColor={ringGradStart} />
                                                            <stop offset="100%" stopColor={ringGradEnd} />
                                                        </linearGradient>
                                                    </defs>
                                                    
                                                    {/* Arka Plan Gri Dairesel Ray */}
                                                    <circle
                                                        cx="44"
                                                        cy="44"
                                                        r={radius}
                                                        stroke="currentColor"
                                                        strokeWidth="4.5"
                                                        fill="transparent"
                                                        className="text-gray-200 dark:text-gray-700/60"
                                                    />
                                                    
                                                    {/* İlerleme Halkası */}
                                                    {pct > 0 && (
                                                        <circle
                                                            cx="44"
                                                            cy="44"
                                                            r={radius}
                                                            stroke={`url(#${ringId})`}
                                                            strokeWidth="5.5"
                                                            strokeLinecap="round"
                                                            fill="transparent"
                                                            strokeDasharray={circumference}
                                                            strokeDashoffset={strokeDashoffset}
                                                            className="transition-all duration-1000 ease-out"
                                                        />
                                                    )}
                                                </svg>

                                                {/* İç Daire Düğüm İçeriği */}
                                                <div className={`absolute inset-2.5 rounded-full flex flex-col items-center justify-center p-1.5 text-center transition-all shadow-inner ${state.colorClass}`}>
                                                    <IconComponent className="w-4 h-4 mb-0.5" />
                                                    <span className="text-[9px] font-black leading-tight tracking-tight uppercase line-clamp-2 px-0.5">
                                                        {node.label}
                                                    </span>

                                                    {/* Belirgin Yüzdelik Rozeti */}
                                                    <span className={`text-[9px] px-1.5 py-0.2 rounded-full mt-0.5 border shadow-sm transition-all transform group-hover:scale-110 ${badgeBg}`}>
                                                        %{pct}
                                                    </span>
                                                </div>
                                            </div>
                                            
                                            {/* Durum Etiketi */}
                                            <span className={`mt-2 text-[9px] font-black px-2 py-0.5 rounded-full uppercase border transition-colors ${
                                                state.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700' :
                                                state.status === 'IN_PROGRESS' ? 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300 font-bold border-amber-300 dark:border-amber-700' :
                                                state.status === 'SKIPPED' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 border-blue-300' :
                                                'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400 border-gray-200 dark:border-gray-600'
                                            }`}>
                                                {state.badge}
                                            </span>
                                        </div>

                                        {/* Ok Çizgisi */}
                                        {idx < track2Nodes.length - 1 && (
                                            <div className="flex-1 min-w-[24px] h-[3px] bg-gray-200 dark:bg-gray-700 relative flex items-center justify-center">
                                                <div className="w-2 h-2 border-t-2 border-r-2 border-gray-400 transform rotate-45"></div>
                                            </div>
                                        )}
                                    </React.Fragment>
                                );
                            })}
                        </div>
                    </div>

                </div>

                {/* SAĞ 1 KOLON: PROJE SAĞLIĞI & AKTİF UYARILAR & RECENT ACTIVITIES (RESİM 1 & 2 SAĞ PANEL) */}
                <div className="space-y-6">
                    
                    {/* AKTİF UYARILAR PANELLERİ */}
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-md border border-gray-200 dark:border-gray-700 p-5 space-y-4">
                        <h3 className="font-extrabold text-xs text-red-600 dark:text-red-400 uppercase tracking-wider flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4" />
                            ACTIVE ALERTS & ISSUES
                        </h3>

                        <div className="space-y-3">
                            {activeAlerts.map(alert => (
                                <div key={alert.id} className={`p-3 rounded-xl border text-xs space-y-1 ${
                                    alert.type === 'WARNING' ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900 text-red-900 dark:text-red-200' :
                                    alert.type === 'INFO' ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900 text-amber-900 dark:text-amber-200' :
                                    'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-900 text-green-900 dark:text-green-200'
                                }`}>
                                    <h4 className="font-bold flex items-center gap-1.5">
                                        <AlertCircle className="w-3.5 h-3.5" />
                                        {alert.title}
                                    </h4>
                                    <p className="opacity-80 text-[11px] leading-relaxed">{alert.desc}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* RECENT ACTIVITIES LOGS */}
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-md border border-gray-200 dark:border-gray-700 p-5 space-y-4">
                        <h3 className="font-extrabold text-xs text-gray-600 dark:text-gray-300 uppercase tracking-wider flex items-center gap-2">
                            <Clock className="w-4 h-4 text-blue-500" />
                            RECENT ACTIVITIES
                        </h3>

                        <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1 text-xs">
                            {Object.entries(steps).length === 0 ? (
                                <p className="text-gray-400 text-center py-4">Henüz aktivite kaydı yok.</p>
                            ) : (
                                Object.entries(steps).map(([key, val]) => {
                                    const nodeDef = WORKFLOW_NODES.find(n => n.id === key);
                                    if (!val || !val.approvedAt) return null;
                                    return (
                                        <div key={key} className="p-2.5 bg-gray-50 dark:bg-gray-700/40 rounded-lg border border-gray-100 dark:border-gray-700 space-y-1">
                                            <div className="flex justify-between items-center">
                                                <span className="font-bold text-gray-900 dark:text-white text-[11px]">{nodeDef?.fullLabel || key}</span>
                                                <span className="text-[9px] font-bold text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30 px-1.5 py-0.5 rounded">{val.status}</span>
                                            </div>
                                            <div className="flex justify-between text-[10px] text-gray-500 dark:text-gray-400">
                                                <span>Onaylayan: {val.approvedBy || 'Sistem'}</span>
                                                <span>{formatDate(val.approvedAt)}</span>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* 3. ALT BÖLÜM: İSTASYON YÜK GRAFİĞİ VE DURUM DAĞILIMI (RESİM 1 & RESİM 2 BOTTOM PANELS) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* BAR GRAFİK: ACTIVE JOBS BY STATION */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-md border border-gray-200 dark:border-gray-700 p-5 space-y-4">
                    <h3 className="font-extrabold text-xs text-gray-700 dark:text-gray-200 uppercase tracking-wider flex items-center justify-between">
                        <span>ACTIVE JOBS BY STATION (İstasyon Yükü)</span>
                        <span className="text-[10px] font-bold text-gray-400">Canlı İstasyon Dağılımı</span>
                    </h3>

                    <div className="flex items-end justify-between gap-3 h-40 pt-6 px-4 border-b border-gray-100 dark:border-gray-700">
                        {[
                            { label: 'T0', val: 22, color: 'bg-blue-500' },
                            { label: 'PO', val: 17, color: 'bg-cyan-500' },
                            { label: 'TI', val: 8, color: 'bg-green-500' },
                            { label: 'JJ', val: 13, color: 'bg-amber-500' },
                            { label: 'K', val: 12, color: 'bg-purple-500' },
                            { label: 'LL', val: 10, color: 'bg-indigo-500' },
                            { label: '1M', val: 5, color: 'bg-red-500' }
                        ].map(bar => (
                            <div key={bar.label} className="flex-1 flex flex-col items-center gap-1 group">
                                <span className="text-[10px] font-black text-gray-600 dark:text-gray-400 group-hover:text-blue-500 transition">{bar.val}</span>
                                <div 
                                    className={`w-full rounded-t-md transition-all duration-500 ${bar.color} group-hover:opacity-80`}
                                    style={{ height: `${(bar.val / 25) * 100}%` }}
                                ></div>
                                <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 mt-1">{bar.label}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* PASTA/HALKA GRAFİK: JOB STATUS DISTRIBUTION */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-md border border-gray-200 dark:border-gray-700 p-5 space-y-4">
                    <h3 className="font-extrabold text-xs text-gray-700 dark:text-gray-200 uppercase tracking-wider flex items-center justify-between">
                        <span>JOB STATUS DISTRIBUTION (Durum Dağılımı)</span>
                        <span className="text-[10px] font-bold text-gray-400">Süreç Oranları</span>
                    </h3>

                    <div className="flex items-center justify-around h-40">
                        <div className="relative w-28 h-28 rounded-full border-8 border-blue-500 border-t-amber-500 border-r-green-500 border-l-purple-500 flex items-center justify-center shadow-inner">
                            <span className="text-xs font-black text-gray-800 dark:text-white">100% Total</span>
                        </div>

                        <div className="space-y-2 text-xs font-bold">
                            <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                                <span className="w-3 h-3 bg-blue-500 rounded-full"></span>
                                <span>Polisaj (%35)</span>
                            </div>
                            <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                                <span className="w-3 h-3 bg-green-500 rounded-full"></span>
                                <span>Tamamlanan (%30)</span>
                            </div>
                            <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                                <span className="w-3 h-3 bg-amber-500 rounded-full"></span>
                                <span>Kalıp Tasarım (%20)</span>
                            </div>
                            <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                                <span className="w-3 h-3 bg-purple-500 rounded-full"></span>
                                <span>PPAP & Seri (%15)</span>
                            </div>
                        </div>
                    </div>
                </div>

            </div>

            {/* DÜĞÜM DETAY & ONAY MODALI */}
            {activeNodeModal && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fadeIn">
                    <div className="bg-white dark:bg-gray-800 max-w-lg w-full rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                        
                        {/* MODAL HEADER */}
                        <div className="p-5 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-800/80">
                            <div>
                                <span className="text-[10px] font-black uppercase tracking-wider text-blue-600 dark:text-blue-400">SÜREÇ ADIMI ONAYI</span>
                                <h3 className="text-base font-black text-gray-900 dark:text-white flex items-center gap-2 mt-0.5">
                                    {activeNodeModal.fullLabel}
                                </h3>
                            </div>
                            <button 
                                onClick={() => setActiveNodeModal(null)} 
                                className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-white rounded-full transition"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* MODAL BODY */}
                        <div className="p-6 space-y-4 text-xs">
                            <div className="p-4 bg-slate-100 dark:bg-slate-900/90 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
                                <div className="flex items-center justify-between">
                                    <span className="font-bold text-gray-700 dark:text-gray-200">Mevcut Durum:</span>
                                    <span className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider ${
                                        getNodeState(activeNodeModal.id).status === 'COMPLETED' ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20' :
                                        getNodeState(activeNodeModal.id).status === 'IN_PROGRESS' ? 'bg-amber-500 text-gray-950 font-black shadow-md shadow-amber-500/20' :
                                        getNodeState(activeNodeModal.id).status === 'SKIPPED' ? 'bg-blue-500 text-white' :
                                        getNodeState(activeNodeModal.id).status === 'BLOCKED' ? 'bg-red-500 text-white' :
                                        'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                                    }`}>
                                        {getNodeState(activeNodeModal.id).badge}
                                    </span>
                                </div>

                                {/* YETKİLİ SORUMLU BİLGİSİ - YÜKSEK KONTRAST VE BELDİRİCİ TASARIM */}
                                <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-700/80">
                                    <span className="font-bold text-gray-700 dark:text-gray-300">Yetkili Sorumlu:</span>
                                    <span className="px-3 py-1 rounded-lg bg-blue-600 dark:bg-blue-600 text-white font-extrabold text-xs shadow-sm tracking-wide">
                                        {activeNodeModal.requiredRole || 'Üretim / Kalıphane Sorumlusu'}
                                    </span>
                                </div>

                                {/* SON İŞLEM YAPAN / ONAYLAYAN BİLGİSİ (VARSA) */}
                                {steps[activeNodeModal.id] && steps[activeNodeModal.id].approvedBy && (
                                    <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-700/80">
                                        <span className="font-bold text-gray-700 dark:text-gray-300">Son İşlem Yapan:</span>
                                        <span className="px-2.5 py-1 rounded-lg bg-slate-200 dark:bg-slate-800 text-gray-900 dark:text-gray-100 font-extrabold border border-slate-300 dark:border-slate-600 text-xs flex items-center gap-1">
                                            <User className="w-3.5 h-3.5 text-blue-500" />
                                            {steps[activeNodeModal.id].approvedBy} 
                                            {steps[activeNodeModal.id].approvedAt && ` (${formatDate(steps[activeNodeModal.id].approvedAt)})`}
                                        </span>
                                    </div>
                                )}

                                {activeNodeModal.isGate && (
                                    <div className="flex items-start gap-2.5 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg text-gray-800 dark:text-gray-100 text-xs leading-relaxed mt-2">
                                        <ShieldCheck className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                                        <div>
                                            <span>Bu adım bölümler arası bir <strong className="font-extrabold text-blue-600 dark:text-blue-400 underline">Onay Kapısı (Gate)</strong> durumundadır.</span>
                                        </div>
                                    </div>
                                )}
                                
                                {activeNodeModal.id === 'productDesign' && (
                                    <div className="p-3 bg-blue-50 dark:bg-blue-950/40 rounded-xl border border-blue-200 dark:border-blue-800 space-y-2">
                                        <div className="flex justify-between items-center text-xs font-bold text-blue-900 dark:text-blue-200">
                                            <span>🎨 Ürün Geliştirme İlerleme Oranı:</span>
                                            <span className="text-sm font-black text-blue-600 dark:text-blue-400">%{steps?.productDesign?.progressPercent || (steps?.productDesign?.status === 'COMPLETED' ? 100 : 0)}</span>
                                        </div>
                                        <div className="w-full bg-gray-200 dark:bg-gray-700 h-2.5 rounded-full overflow-hidden">
                                            <div 
                                                className="bg-blue-600 h-full transition-all duration-300" 
                                                style={{ width: `${steps?.productDesign?.progressPercent || (steps?.productDesign?.status === 'COMPLETED' ? 100 : 0)}%` }}
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                                    Onay / İşlem Notu (Opsiyonel):
                                </label>
                                <textarea 
                                    rows="3" 
                                    value={approvalNote}
                                    onChange={(e) => setApprovalNote(e.target.value)}
                                    placeholder="Revizyon, sipariş no veya onay gerekçesi girebilirsiniz..."
                                    className="w-full p-2.5 border border-gray-300 dark:border-gray-600 rounded-xl dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                />
                            </div>

                            {/* ÖZEL SEÇENEKLER: MALZEME TEMİNİ */}
                            {activeNodeModal.id === 'materialOrder' && (
                                <div className="p-3 bg-amber-50 dark:bg-amber-950/30 rounded-xl border border-amber-200 dark:border-amber-900 space-y-2">
                                    <span className="font-bold text-amber-900 dark:text-amber-200 block">📦 Çelik & Malzeme Sipariş Durumu</span>
                                    <div className="flex gap-2">
                                        <button 
                                            onClick={() => handleStepAction('materialOrder', 'COMPLETED', true)}
                                            className="flex-1 py-2 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg transition text-xs"
                                        >
                                            ✅ Sipariş Verildi Olarak Onayla
                                        </button>
                                        <button 
                                            onClick={() => handleStepAction('materialOrder', 'BLOCKED', false)}
                                            className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg transition text-xs"
                                        >
                                            ❌ Sipariş Verilmedi / Bekliyor
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* MODAL FOOTER ACTION BUTTONS */}
                        <div className="p-4 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80 flex flex-wrap gap-2 justify-end">
                            <button 
                                onClick={() => handleStepAction(activeNodeModal.id, 'PENDING')}
                                className="px-3.5 py-2 bg-slate-600 hover:bg-slate-700 text-white font-bold rounded-xl transition text-xs flex items-center gap-1.5 shadow-sm"
                                title="Test için adımı varsayılan bekliyor (PENDING) durumuna sıfırlar"
                            >
                                <RotateCcw className="w-4 h-4" />
                                Sıfırla (Bekliyor Yap)
                            </button>

                            <button 
                                onClick={() => handleStepAction(activeNodeModal.id, 'IN_PROGRESS')}
                                className="px-3.5 py-2 bg-amber-500 hover:bg-amber-600 text-gray-950 font-bold rounded-xl transition text-xs flex items-center gap-1.5 shadow-sm"
                            >
                                ⏳ Devam Ediyor Yap
                            </button>
                            
                            <button 
                                onClick={() => handleStepAction(activeNodeModal.id, 'COMPLETED')}
                                className="px-3.5 py-2 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl transition text-xs flex items-center gap-1.5 shadow-sm"
                            >
                                <CheckCircle className="w-4 h-4" />
                                Adımı Onayla & Tamamla
                            </button>
                        </div>

                    </div>
                </div>
            )}

        </div>
    );
};

export default WorkflowMapDashboard;
