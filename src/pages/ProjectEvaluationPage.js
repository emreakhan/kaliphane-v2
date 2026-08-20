// src/pages/ProjectEvaluationPage.js

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
    Award, Users, UserCheck, ArrowRightLeft, Settings, Plus, Trash2, Edit3, 
    CheckCircle2, Search, Trophy, ArrowUpRight, ArrowDownRight, Layers, Sparkles, Check, X,
    Calendar, Clock, AlertTriangle, ChevronDown, HelpCircle, ShieldCheck, FileText, CheckCircle, Info,
    Hand, UserPlus, CheckSquare, Square, MinusCircle, PlusCircle, Inbox, Crown, Cpu, Wrench, Eye
} from 'lucide-react';
import { 
    collection, onSnapshot, doc, updateDoc, setDoc, addDoc, deleteDoc, 
    serverTimestamp 
} from 'firebase/firestore';
import { 
    PROJECT_EVALUATIONS_COLLECTION, 
    EVALUATION_TEAMS_COLLECTION, 
    PART_TRANSFER_MARKET_COLLECTION, 
    MEMBER_POINT_LOGS_COLLECTION, 
    EVALUATION_SETTINGS_COLLECTION,
    ROLES
} from '../config/constants.js';

// --- YARDIMCI: İSİM KARŞILAŞTIRICI (TÜRKÇE KARAKTER DUYARLI) ---
const isNameMatch = (name1, name2) => {
    if (!name1 || !name2) return false;
    const n1 = String(name1).trim().toLocaleLowerCase('tr-TR');
    const n2 = String(name2).trim().toLocaleLowerCase('tr-TR');
    return n1 === n2 || n1.includes(n2) || n2.includes(n1);
};

// --- YARDIMCI: PARÇA ADI DEDEKTÖRÜ ---
const getTaskDisplayName = (task) => {
    if (!task) return 'İsimsiz Parça';
    return task.taskName || task.name || task.partName || (task.taskNumber ? `Parça #${task.taskNumber}` : 'İsimsiz Parça');
};

// --- GELİŞMİŞ YAZARAK ARAMALI SEÇİM BİLEŞENİ (SEARCHABLE SELECT) ---
const SearchableSelect = ({ 
    options = [], 
    value = '', 
    onChange, 
    placeholder = 'Seçiniz...', 
    searchPlaceholder = 'Yazarak ara...',
    getOptionLabel = opt => (typeof opt === 'string' ? opt : opt.name || opt.label),
    getOptionValue = opt => (typeof opt === 'string' ? opt : opt.id || opt.value || opt.name),
    getOptionSub = opt => (typeof opt === 'object' ? opt.sub || opt.role || opt.customer : ''),
    className = ''
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const wrapperRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const filteredOptions = useMemo(() => {
        const term = searchTerm.toLowerCase().trim();
        if (!term) return options;
        return options.filter(opt => {
            const label = String(getOptionLabel(opt) || '').toLowerCase();
            const sub = String(getOptionSub(opt) || '').toLowerCase();
            return label.includes(term) || sub.includes(term);
        });
    }, [options, searchTerm, getOptionLabel, getOptionSub]);

    const selectedOption = useMemo(() => {
        return options.find(opt => getOptionValue(opt) === value);
    }, [options, value, getOptionValue]);

    return (
        <div ref={wrapperRef} className={`relative ${className}`}>
            <div
                onClick={() => setIsOpen(!isOpen)}
                className="w-full p-2.5 bg-slate-900 border border-slate-700 hover:border-slate-600 rounded-xl text-xs font-bold text-white cursor-pointer flex justify-between items-center transition shadow-sm"
            >
                <span className={selectedOption ? 'text-white' : 'text-slate-500'}>
                    {selectedOption ? getOptionLabel(selectedOption) : placeholder}
                </span>
                <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </div>

            {isOpen && (
                <div className="absolute z-50 left-0 right-0 mt-1.5 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in">
                    <div className="p-2 border-b border-slate-800 bg-slate-950/80">
                        <div className="relative">
                            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                            <input 
                                type="text"
                                autoFocus
                                placeholder={searchPlaceholder}
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="w-full pl-8 pr-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs font-bold text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                        </div>
                    </div>

                    <div className="max-h-56 overflow-y-auto custom-scrollbar divide-y divide-slate-800/60 p-1">
                        {filteredOptions.length === 0 ? (
                            <div className="p-3 text-center text-xs text-slate-500 italic">Eşleşen sonuç bulunamadı</div>
                        ) : (
                            filteredOptions.map((opt, idx) => {
                                const val = getOptionValue(opt);
                                const label = getOptionLabel(opt);
                                const sub = getOptionSub(opt);
                                const isSelected = val === value;

                                return (
                                    <div
                                        key={val || idx}
                                        onClick={() => {
                                            onChange(val, opt);
                                            setIsOpen(false);
                                            setSearchTerm('');
                                        }}
                                        className={`p-2.5 text-xs font-bold rounded-lg cursor-pointer flex justify-between items-center transition ${
                                            isSelected ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'
                                        }`}
                                    >
                                        <div>
                                            <div className="font-extrabold">{label}</div>
                                            {sub && <div className={`text-[10px] ${isSelected ? 'text-blue-200' : 'text-slate-400'}`}>{sub}</div>}
                                        </div>
                                        {isSelected && <Check className="w-4 h-4 text-white" />}
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

// --- HAFTA VE GÜN KALAN SÜRE HESAPLAYICI ---
const calculateWeeksAndDays = (targetDateStr, isCompleted = false, finishDateStr = null) => {
    if (!targetDateStr) return { text: 'Termin Yok', isOverdue: false, totalDays: 0, badgeColor: 'bg-slate-800 text-slate-400' };
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(targetDateStr);
    target.setHours(0, 0, 0, 0);

    const compareDate = isCompleted && finishDateStr ? new Date(finishDateStr) : today;
    compareDate.setHours(0, 0, 0, 0);

    const diffTime = target.getTime() - compareDate.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

    if (isCompleted) {
        if (diffDays >= 0) {
            return { text: 'Zamanında Tamamlandı', isOverdue: false, totalDays: diffDays, badgeColor: 'bg-emerald-950 text-emerald-300 border-emerald-800' };
        } else {
            const absD = Math.abs(diffDays);
            const w = Math.floor(absD / 7);
            const d = absD % 7;
            const text = w > 0 && d > 0 ? `${w} hf ${d} gün` : w > 0 ? `${w} hf` : `${d} gün`;
            return { text: `${text} geç tamamlandı`, isOverdue: true, totalDays: diffDays, badgeColor: 'bg-rose-950 text-rose-300 border-rose-800' };
        }
    }

    if (diffDays === 0) {
        return { text: 'Bugün Son Gün', isOverdue: false, totalDays: 0, isToday: true, badgeColor: 'bg-amber-950 text-amber-300 border-amber-800 animate-pulse' };
    }

    const isOverdue = diffDays < 0;
    const absDays = Math.abs(diffDays);
    const weeks = Math.floor(absDays / 7);
    const remainingDays = absDays % 7;

    let timeText = '';
    if (weeks > 0 && remainingDays > 0) {
        timeText = `${weeks} Hafta ${remainingDays} Gün`;
    } else if (weeks > 0) {
        timeText = `${weeks} Hafta`;
    } else {
        timeText = `${remainingDays} Gün`;
    }

    return {
        text: isOverdue ? `${timeText} Geçti` : `${timeText} Kaldı`,
        isOverdue,
        totalDays: diffDays,
        weeks,
        remainingDays,
        badgeColor: isOverdue 
            ? 'bg-rose-950 text-rose-300 border-rose-800' 
            : 'bg-emerald-950 text-emerald-300 border-emerald-800'
    };
};

// --- KALIP VE EKİP PERFORMANS ÖZETİ HESAPLAYICI (DEVREDİLEN PUAN KESİNTİSİ İLE) ---
const getMoldPerformanceSummary = (mold, evaluation, marketTransfers = []) => {
    const tasks = mold?.tasks || [];
    const totalParts = tasks.length;
    const allOps = tasks.flatMap(t => t.operations || []);

    const startDates = allOps
        .map(op => op.startDate)
        .filter(Boolean)
        .map(d => new Date(d).getTime())
        .filter(t => !isNaN(t));
    const firstStartTimestamp = startDates.length > 0 ? Math.min(...startDates) : null;
    const firstStartDateStr = firstStartTimestamp 
        ? new Date(firstStartTimestamp).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) 
        : 'Başlama Kaydı Yok';

    const finishDates = allOps
        .map(op => op.finishDate || op.supervisorReviewDate || op.completedDate)
        .filter(Boolean)
        .map(d => new Date(d).getTime())
        .filter(t => !isNaN(t));
    const lastFinishTimestamp = finishDates.length > 0 ? Math.max(...finishDates) : null;
    const lastFinishDateStr = lastFinishTimestamp 
        ? new Date(lastFinishTimestamp).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) 
        : (mold?.completedAt ? new Date(mold.completedAt).toLocaleDateString('tr-TR') : 'Tamamlanmadı');

    // Dışarıya Devredilen Parçalar (Bu takımdan çıkan ve kabul edilenler)
    const transferredOutList = marketTransfers.filter(m => 
        m.moldId === mold?.id && 
        m.fromTeamId === evaluation?.assignedTeamId &&
        m.status === 'ACCEPTED'
    );
    const transferredOutPoints = transferredOutList.reduce((sum, m) => sum + (parseInt(m.pointsOffered) || 0), 0);

    // Başka Takımlardan Alınan Parçalar (Bu takıma gelen ve kabul edilenler)
    const transferredInList = marketTransfers.filter(m => 
        m.moldId === mold?.id && 
        m.acceptedByTeamId === evaluation?.assignedTeamId &&
        m.status === 'ACCEPTED'
    );
    const transferredInPoints = transferredInList.reduce((sum, m) => sum + (parseInt(m.pointsOffered) || 0), 0);

    const completedTasksCount = tasks.filter(t => 
        t.status === 'TAMAMLANDI' || 
        (t.operations && t.operations.length > 0 && t.operations.every(op => op.status === 'COMPLETED'))
    ).length;

    const targetDeadline = evaluation?.targetDeadline || mold?.moldDeadline;
    const isCompleted = mold?.status === 'TAMAMLANDI' || mold?.status === 'COMPLETED' || (totalParts > 0 && completedTasksCount === totalParts);
    const timeInfo = calculateWeeksAndDays(targetDeadline, isCompleted, lastFinishTimestamp ? new Date(lastFinishTimestamp).toISOString() : null);

    return {
        totalParts,
        completedParts: completedTasksCount,
        allOperationsCount: allOps.length,
        firstStartDateStr,
        lastFinishDateStr,
        transferredOutCount: transferredOutList.length,
        transferredOutPoints,
        transferredInCount: transferredInList.length,
        transferredInPoints,
        transferredOutList,
        timeInfo,
        isCompleted,
        targetDeadline
    };
};

const ProjectEvaluationPage = ({ db, loggedInUser, projects = [], personnel = [], canEdit }) => {
    // --- ROL VE YETKİ KONTROLLERİ ---
    const userRoleLower = (loggedInUser?.role || loggedInUser?.userRole || loggedInUser?.jobTitle || '').toLowerCase();
    const userNameTrim = (loggedInUser?.name || loggedInUser?.displayName || loggedInUser?.username || '').trim();

    const isAdminOrManager = useMemo(() => {
        return (
            userRoleLower.includes('admin') || 
            userRoleLower.includes('yönetici') || 
            userRoleLower.includes('müdür') || 
            userRoleLower.includes('sorumlu') ||
            loggedInUser?.role === ROLES.ADMIN ||
            loggedInUser?.role === ROLES.SUPERVISOR ||
            loggedInUser?.role === ROLES.KALIP_TASARIM_SORUMLUSU ||
            loggedInUser?.role === ROLES.KALIP_TASARIM_YONETICISI ||
            loggedInUser?.role === ROLES.PROJE_SORUMLUSU
        );
    }, [userRoleLower, loggedInUser]);

    // --- TAB STATE'İ ---
    const [activeTab, setActiveTab] = useState(() => {
        return isAdminOrManager ? 'molds' : 'my_team';
    });

    // --- VERİTABANI STATE'LERİ ---
    const [evaluations, setEvaluations] = useState([]);
    const [teams, setTeams] = useState([]);
    const [marketTransfers, setMarketTransfers] = useState([]);
    const [memberPointLogs, setMemberPointLogs] = useState([]);
    
    // Dinamik Tanımlı Kurallar Listesi (CRUD Destekli)
    const [rules, setRules] = useState([
        { id: 'rule_1', title: 'Zamanında / Erken Teslim', type: 'BONUS', percentage: 10, description: 'Termin tarihinde veya öncesinde teslim edilirse eklenir.' },
        { id: 'rule_2', title: 'Gecikmeli Teslim', type: 'PENALTY', percentage: 10, description: 'Termin tarihi aşıldığında ceza kesintisi yapılır.' },
        { id: 'rule_3', title: 'Sıfır Parça Devri Bonusu', type: 'BONUS', percentage: 5, description: 'Hiçbir parçayı devretmeden tam bitirme bonusu.' }
    ]);

    // --- ARAMA VE FİLTRE STATE'LERİ ---
    const [moldSearchTerm, setMoldSearchTerm] = useState('');
    const [selectedTeamFilter, setSelectedTeamFilter] = useState('ALL');

    // --- MODAL STATE'LERİ ---
    // 1. Ekip Oluştur / Düzenle Modalı
    const [isTeamModalOpen, setIsTeamModalOpen] = useState(false);
    const [editingTeam, setEditingTeam] = useState(null);
    const [teamForm, setTeamForm] = useState({
        name: '',
        leader: '',
        members: []
    });

    // 2. Ekip Organizasyon & Hiyerarşi Şeması Modalı (YENİ!)
    const [isOrgChartModalOpen, setIsOrgChartModalOpen] = useState(false);
    const [selectedOrgTeamId, setSelectedOrgTeamId] = useState('');

    // 3. Değerlendirmeye Yeni Proje Ekle Modalı (Havuz Destekli)
    const [isAddMoldModalOpen, setIsAddMoldModalOpen] = useState(false);
    const [addMoldForm, setAddMoldForm] = useState({
        moldId: '',
        baseScore: 80,
        targetDeadline: '',
        assignedTeamId: ''
    });

    // 4. YÖNETİCİ ÇOKLU KURAL VE DİNAMİK MANUEL ÇARPAN SATIRLARI MODALI
    const [isManagerEvaluationModalOpen, setIsManagerEvaluationModalOpen] = useState(false);
    const [evaluatingTarget, setEvaluatingTarget] = useState(null);
    const [managerEvalForm, setManagerEvalForm] = useState({
        baseScore: 80,
        selectedRuleIds: [],
        customAdjustments: [],
        managerFinalScore: 80,
        managerNotes: ''
    });

    // 5. Ekip Lideri / CAM Operatörü Puan Dağıtım Modalı
    const [isDistributeModalOpen, setIsDistributeModalOpen] = useState(false);
    const [distributingMold, setDistributingMold] = useState(null);
    const [distributeScores, setDistributeScores] = useState({});

    // 6. Parça Transfer Teklifi Modalı
    const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
    const [transferForm, setTransferForm] = useState({
        moldId: '',
        moldName: '',
        taskId: '',
        partName: '',
        fromTeamId: '',
        toTeamId: 'PUBLIC_POOL',
        pointsOffered: 15,
        note: ''
    });

    // 7. Dinamik Kural Yönetim Modalı (Yönetici)
    const [isRulesModalOpen, setIsRulesModalOpen] = useState(false);
    const [tempRules, setTempRules] = useState([]);
    const [newRuleForm, setNewRuleForm] = useState({
        title: '',
        type: 'BONUS',
        percentage: 10,
        description: ''
    });

    // --- 1. FİRESTORE SUBSCRİPTİONS ---
    useEffect(() => {
        if (!db) return;

        const unsubEvals = onSnapshot(collection(db, PROJECT_EVALUATIONS_COLLECTION), (snap) => {
            setEvaluations(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        }, (err) => console.error("Evaluations hatası:", err));

        const unsubTeams = onSnapshot(collection(db, EVALUATION_TEAMS_COLLECTION), (snap) => {
            setTeams(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        }, (err) => console.error("Teams hatası:", err));

        const unsubMarket = onSnapshot(collection(db, PART_TRANSFER_MARKET_COLLECTION), (snap) => {
            setMarketTransfers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        }, (err) => console.error("Market hatası:", err));

        const unsubLogs = onSnapshot(collection(db, MEMBER_POINT_LOGS_COLLECTION), (snap) => {
            setMemberPointLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        }, (err) => console.error("Member point logs hatası:", err));

        const unsubSettings = onSnapshot(doc(db, EVALUATION_SETTINGS_COLLECTION, 'generalSettings'), (snap) => {
            if (snap.exists()) {
                const data = snap.data();
                if (data.rules && Array.isArray(data.rules) && data.rules.length > 0) {
                    setRules(data.rules);
                }
            }
        }, (err) => console.error("Settings hatası:", err));

        return () => {
            unsubEvals();
            unsubTeams();
            unsubMarket();
            unsubLogs();
            unsubSettings();
        };
    }, [db]);

    // --- MAPLER ---
    const evalMap = useMemo(() => {
        const map = new Map();
        evaluations.forEach(ev => {
            if (ev.moldId) map.set(ev.moldId, ev);
        });
        return map;
    }, [evaluations]);

    const teamMap = useMemo(() => {
        const map = new Map();
        teams.forEach(t => map.set(t.id, t));
        return map;
    }, [teams]);

    const projectMap = useMemo(() => {
        const map = new Map();
        projects.forEach(p => map.set(p.id, p));
        return map;
    }, [projects]);

    // Giriş Yapan Kullanıcının Bulunduğu Ekipler (Türkçe karakter duyarlı)
    const myTeams = useMemo(() => {
        if (!userNameTrim) return [];
        return teams.filter(t => 
            isNameMatch(t.leader, userNameTrim) ||
            (t.members || []).some(m => isNameMatch(m.name, userNameTrim))
        );
    }, [teams, userNameTrim]);

    // Kullanıcının Görebileceği Ekipler Listesi
    const userAccessibleTeams = useMemo(() => {
        if (isAdminOrManager) return teams;
        if (myTeams.length > 0) return myTeams;
        return teams;
    }, [isAdminOrManager, myTeams, teams]);

    const [selectedTeamId, setSelectedTeamId] = useState('');
    useEffect(() => {
        if (userAccessibleTeams.length > 0) {
            if (!selectedTeamId || !userAccessibleTeams.some(t => t.id === selectedTeamId)) {
                setSelectedTeamId(userAccessibleTeams[0].id);
            }
        }
    }, [userAccessibleTeams, selectedTeamId]);

    // --- PUAN HESAPLAMA MOTORU ---
    const calculateMoldScoreWithRules = (mold, evaluation) => {
        const baseScore = evaluation?.baseScore ? parseInt(evaluation.baseScore) : 0;
        
        if (evaluation?.managerFinalScore !== undefined && evaluation?.managerFinalScore !== null) {
            return {
                baseScore,
                finalScore: parseInt(evaluation.managerFinalScore),
                statusLabel: 'Yönetici Onaylı Puan',
                isManagerApproved: true,
                isCalculated: true
            };
        }

        if (!baseScore) return { baseScore: 0, finalScore: 0, statusLabel: 'Puan Belirtilmedi', isCalculated: false };

        const targetDeadline = evaluation?.targetDeadline || mold?.moldDeadline;
        const isCompleted = mold?.status === 'TAMAMLANDI' || mold?.status === 'COMPLETED';
        const finishDate = mold?.completedAt || mold?.updatedAt;

        const timeInfo = calculateWeeksAndDays(targetDeadline, isCompleted, finishDate);
        const bonusRule = rules.find(r => r.type === 'BONUS') || { percentage: 10 };
        const penaltyRule = rules.find(r => r.type === 'PENALTY') || { percentage: 10 };

        if (!targetDeadline) {
            return {
                baseScore,
                finalScore: baseScore,
                statusLabel: 'Terminsiz (Baz Puan)',
                timeInfo,
                isCalculated: true
            };
        }

        if (!timeInfo.isOverdue) {
            if (isCompleted) {
                const bonusAmount = Math.round((baseScore * (bonusRule.percentage || 10)) / 100);
                return {
                    baseScore,
                    finalScore: baseScore + bonusAmount,
                    statusLabel: `Zamanında Tamamlandı (+%${bonusRule.percentage})`,
                    bonusRatio: bonusRule.percentage,
                    isBonus: true,
                    timeInfo,
                    isCalculated: true
                };
            } else {
                return {
                    baseScore,
                    finalScore: baseScore,
                    statusLabel: `Hedef Sürede Devam Ediyor`,
                    timeInfo,
                    isCalculated: true
                };
            }
        } else {
            const penaltyAmount = Math.round((baseScore * (penaltyRule.percentage || 10)) / 100);
            const netScore = Math.max(0, baseScore - penaltyAmount);
            return {
                baseScore,
                finalScore: netScore,
                statusLabel: `Gecikmeli (-%${penaltyRule.percentage})`,
                bonusRatio: -penaltyRule.percentage,
                isPenalty: true,
                timeInfo,
                isCalculated: true
            };
        }
    };

    // --- SADECE DEĞERLENDİRMEYE EKLENEN PROJELERİN LİSTESİ ---
    const evaluatedProjectsList = useMemo(() => {
        return evaluations
            .map(ev => {
                const mold = projectMap.get(ev.moldId) || { id: ev.moldId, moldName: ev.moldName || 'Kalıp', customer: ev.customer || '', tasks: [] };
                return { evaluation: ev, mold };
            })
            .filter(({ mold, evaluation }) => {
                const search = moldSearchTerm.toLowerCase().trim();
                if (search) {
                    const matchName = String(mold.moldName || '').toLowerCase().includes(search);
                    const matchCust = String(mold.customer || '').toLowerCase().includes(search);
                    const team = teamMap.get(evaluation.assignedTeamId);
                    const matchTeam = String(team?.name || '').toLowerCase().includes(search);
                    if (!matchName && !matchCust && !matchTeam) return false;
                }

                if (selectedTeamFilter !== 'ALL') {
                    if (evaluation.assignedTeamId !== selectedTeamFilter) return false;
                }

                return true;
            });
    }, [evaluations, projectMap, moldSearchTerm, selectedTeamFilter, teamMap]);

    // --- AÇIK PROJE HAVUZUNDAKİ PROJELER (ATANMAMIŞ KALIPLAR) ---
    const poolProjectsList = useMemo(() => {
        return evaluations
            .filter(ev => !ev.assignedTeamId)
            .map(ev => {
                const mold = projectMap.get(ev.moldId) || { id: ev.moldId, moldName: ev.moldName || 'Kalıp', customer: ev.customer || '', tasks: [] };
                return { evaluation: ev, mold };
            });
    }, [evaluations, projectMap]);

    // --- YENİ PROJEYİ DEĞERLENDİRMEYE EKLEME ---
    const handleAddMoldToEvaluation = async (e) => {
        e.preventDefault();
        if (!addMoldForm.moldId) {
            alert("Lütfen kalıp seçiniz!");
            return;
        }

        const selectedM = projectMap.get(addMoldForm.moldId);
        try {
            const existing = evalMap.get(addMoldForm.moldId);
            const payload = {
                moldId: addMoldForm.moldId,
                moldName: selectedM?.moldName || 'Kalıp',
                customer: selectedM?.customer || '',
                baseScore: parseInt(addMoldForm.baseScore) || 80,
                targetDeadline: addMoldForm.targetDeadline || selectedM?.moldDeadline || '',
                assignedTeamId: addMoldForm.assignedTeamId || null,
                claimRequests: existing?.claimRequests || [],
                updatedAt: serverTimestamp(),
                updatedBy: userNameTrim
            };

            if (existing?.id) {
                await updateDoc(doc(db, PROJECT_EVALUATIONS_COLLECTION, existing.id), payload);
            } else {
                await addDoc(collection(db, PROJECT_EVALUATIONS_COLLECTION), {
                    ...payload,
                    createdAt: serverTimestamp()
                });
            }

            setIsAddMoldModalOpen(false);
            setAddMoldForm({ moldId: '', baseScore: 80, targetDeadline: '', assignedTeamId: '' });
            alert(payload.assignedTeamId ? "Kalıp değerlendirme listesine eklendi ve ekibe atandı!" : "Kalıp Açık Proje Havuzuna eklendi! Takımlar işi talep edebilir.");
        } catch (err) {
            console.error("Kalıp ekleme hatası:", err);
            alert("Kalıp eklenemedi: " + err.message);
        }
    };

    // --- TAKIMIN HAVUZDAKİ BİR İŞİ TALEP ETMESİ (CLAIM REQUEST) ---
    const handleClaimProjectFromPool = async (evaluationId, moldName) => {
        const teamToClaim = teamMap.get(selectedTeamId) || userAccessibleTeams[0];
        if (!teamToClaim) {
            alert("Lütfen işi talep etmek istediğiniz takımınızı seçiniz!");
            return;
        }

        if (!window.confirm(`"${moldName}" projesini ${teamToClaim.name} olarak üstlenmek için yöneticiye talep göndermek istiyor musunuz?`)) {
            return;
        }

        try {
            const evDoc = evaluations.find(e => e.id === evaluationId);
            const existingRequests = evDoc?.claimRequests || [];

            if (existingRequests.some(r => r.teamId === teamToClaim.id)) {
                alert("Takımınız bu iş için zaten talep göndermiş!");
                return;
            }

            const newRequest = {
                teamId: teamToClaim.id,
                teamName: teamToClaim.name || 'Takım',
                leader: teamToClaim.leader || '',
                requestedBy: userNameTrim,
                requestedAt: new Date().toISOString()
            };

            await updateDoc(doc(db, PROJECT_EVALUATIONS_COLLECTION, evaluationId), {
                claimRequests: [...existingRequests, newRequest]
            });

            alert(`Talebiniz yöneticiye iletildi! Yönetici onayladığında proje resmi olarak takımınıza atanacaktır.`);
        } catch (err) {
            console.error("İş talep hatası:", err);
            alert("Talep iletilemedi: " + err.message);
        }
    };

    // --- YÖNETİCİNİN TAKIM TALEBİNİ ONAYLAMASI VE ATAMASI ---
    const handleApproveTeamClaim = async (evaluationId, teamId, teamName) => {
        try {
            await updateDoc(doc(db, PROJECT_EVALUATIONS_COLLECTION, evaluationId), {
                assignedTeamId: teamId,
                assignedTeamName: teamName,
                assignedAt: serverTimestamp(),
                assignedBy: userNameTrim,
                claimRequests: []
            });
            alert(`Proje resmi olarak "${teamName}" takımına atandı!`);
        } catch (err) {
            console.error("Takım atama onayı hatası:", err);
            alert("Atama yapılamadı: " + err.message);
        }
    };

    // --- DEĞERLENDİRMEDEN KALIP SİLME ---
    const handleDeleteEvaluation = async (evalId) => {
        if (!window.confirm("Bu kalıbı puan değerlendirme listesinden kaldırmak istediğinize emin misiniz?")) return;
        try {
            await deleteDoc(doc(db, PROJECT_EVALUATIONS_COLLECTION, evalId));
        } catch (err) {
            console.error("Kalıp silme hatası:", err);
        }
    };

    // --- YÖNETİCİ DEĞERLENDİRME MODALINI AÇMA ---
    const handleOpenManagerEvaluationModal = (mold, evaluation) => {
        const summary = getMoldPerformanceSummary(mold, evaluation, marketTransfers);
        const calculated = calculateMoldScoreWithRules(mold, evaluation);
        
        setEvaluatingTarget({ mold, evaluation, summary, calculated });

        const defaultRuleIds = [];
        if (!summary.timeInfo.isOverdue && summary.isCompleted) {
            const onTimeRule = rules.find(r => r.type === 'BONUS');
            if (onTimeRule) defaultRuleIds.push(onTimeRule.id);
        } else if (summary.timeInfo.isOverdue) {
            const overdueRule = rules.find(r => r.type === 'PENALTY');
            if (overdueRule) defaultRuleIds.push(overdueRule.id);
        }

        const base = evaluation.baseScore || 80;
        const netBaseAfterTransfers = Math.max(0, base - summary.transferredOutPoints + summary.transferredInPoints);

        let initialFinal = netBaseAfterTransfers;
        if (evaluation.managerFinalScore !== undefined) {
            initialFinal = evaluation.managerFinalScore;
        } else {
            const selectedRules = rules.filter(r => defaultRuleIds.includes(r.id));
            const totalPct = selectedRules.reduce((sum, r) => sum + (r.type === 'BONUS' ? r.percentage : -r.percentage), 0);
            initialFinal = Math.max(0, Math.round(netBaseAfterTransfers * (1 + totalPct / 100)));
        }

        setManagerEvalForm({
            baseScore: base,
            selectedRuleIds: defaultRuleIds,
            customAdjustments: evaluation.customAdjustments || [
                { id: 'custom_1', description: 'Ekstra Performans / İşçilik', type: 'BONUS', percentage: 5, isChecked: false }
            ],
            managerFinalScore: initialFinal,
            managerNotes: evaluation.managerNotes || ''
        });

        setIsManagerEvaluationModalOpen(true);
    };

    // --- ANLIK PUAN HESAPLAYICI YARDIMCISI ---
    const calculateLiveScore = (base, selectedRuleIds, customAdjustments, summary) => {
        const baseNum = parseInt(base) || 0;
        const netBase = Math.max(0, baseNum - (summary?.transferredOutPoints || 0) + (summary?.transferredInPoints || 0));

        const definedRulesPercent = rules
            .filter(r => selectedRuleIds.includes(r.id))
            .reduce((sum, r) => sum + (r.type === 'BONUS' ? r.percentage : -r.percentage), 0);

        const customRulesPercent = customAdjustments
            .filter(r => r.isChecked)
            .reduce((sum, r) => sum + (r.type === 'BONUS' ? (parseInt(r.percentage) || 0) : -(parseInt(r.percentage) || 0)), 0);

        const totalPercentDelta = definedRulesPercent + customRulesPercent;
        return Math.max(0, Math.round(netBase * (1 + totalPercentDelta / 100)));
    };

    // --- YÖNETİCİ STANDART KURAL SEÇİMİ ---
    const handleToggleRuleInEvaluation = (ruleId) => {
        const currentSelected = managerEvalForm.selectedRuleIds || [];
        const nextSelected = currentSelected.includes(ruleId)
            ? currentSelected.filter(id => id !== ruleId)
            : [...currentSelected, ruleId];

        const autoFinal = calculateLiveScore(
            managerEvalForm.baseScore, 
            nextSelected, 
            managerEvalForm.customAdjustments, 
            evaluatingTarget?.summary
        );

        setManagerEvalForm({
            ...managerEvalForm,
            selectedRuleIds: nextSelected,
            managerFinalScore: autoFinal
        });
    };

    // --- MANUEL ÇARPAN SATIRLARINI DÜZENLEME & TİKLEME ---
    const handleAddCustomAdjustmentRow = () => {
        const newRow = {
            id: 'custom_' + Date.now(),
            description: '',
            type: 'BONUS',
            percentage: 5,
            isChecked: true
        };
        const updated = [...managerEvalForm.customAdjustments, newRow];
        const autoFinal = calculateLiveScore(
            managerEvalForm.baseScore, 
            managerEvalForm.selectedRuleIds, 
            updated, 
            evaluatingTarget?.summary
        );
        setManagerEvalForm({
            ...managerEvalForm,
            customAdjustments: updated,
            managerFinalScore: autoFinal
        });
    };

    const handleUpdateCustomAdjustmentRow = (rowId, field, val) => {
        const updated = managerEvalForm.customAdjustments.map(row => {
            if (row.id === rowId) {
                return { ...row, [field]: val };
            }
            return row;
        });

        const autoFinal = calculateLiveScore(
            managerEvalForm.baseScore, 
            managerEvalForm.selectedRuleIds, 
            updated, 
            evaluatingTarget?.summary
        );

        setManagerEvalForm({
            ...managerEvalForm,
            customAdjustments: updated,
            managerFinalScore: autoFinal
        });
    };

    const handleDeleteCustomAdjustmentRow = (rowId) => {
        const updated = managerEvalForm.customAdjustments.filter(row => row.id !== rowId);
        const autoFinal = calculateLiveScore(
            managerEvalForm.baseScore, 
            managerEvalForm.selectedRuleIds, 
            updated, 
            evaluatingTarget?.summary
        );
        setManagerEvalForm({
            ...managerEvalForm,
            customAdjustments: updated,
            managerFinalScore: autoFinal
        });
    };

    // --- YÖNETİCİ DEĞERLENDİRMESİNİ KAYDETME VE ONAYLAMA ---
    const handleSaveManagerEvaluation = async () => {
        if (!evaluatingTarget) return;
        const { evaluation, mold } = evaluatingTarget;

        try {
            const payload = {
                managerFinalScore: parseInt(managerEvalForm.managerFinalScore) || 0,
                baseScore: parseInt(managerEvalForm.baseScore) || 0,
                selectedRuleIds: managerEvalForm.selectedRuleIds || [],
                customAdjustments: managerEvalForm.customAdjustments || [],
                transferredOutDeduction: evaluatingTarget.summary.transferredOutPoints || 0,
                managerNotes: managerEvalForm.managerNotes.trim(),
                isEvaluatedByManager: true,
                evaluatedAt: serverTimestamp(),
                evaluatedBy: userNameTrim
            };

            await updateDoc(doc(db, PROJECT_EVALUATIONS_COLLECTION, evaluation.id), payload);
            setIsManagerEvaluationModalOpen(false);
            alert(`"${mold.moldName}" projesinin değerlendirmesi onaylandı! Belirlenen ${payload.managerFinalScore} puan artık Ekip Lideri / CAM Operatörü tarafından dağıtılabilir.`);
        } catch (err) {
            console.error("Yönetici değerlendirme hatası:", err);
            alert("Değerlendirme kaydedilemedi: " + err.message);
        }
    };

    // --- DİNAMİK KURALLAR CRUD ---
    const handleSaveRules = async () => {
        try {
            await setDoc(doc(db, EVALUATION_SETTINGS_COLLECTION, 'generalSettings'), {
                rules: tempRules,
                updatedAt: serverTimestamp(),
                updatedBy: userNameTrim
            });
            setRules(tempRules);
            setIsRulesModalOpen(false);
            alert("Termin & Bonus/Ceza kuralları başarıyla kaydedildi!");
        } catch (err) {
            console.error("Kural kaydetme hatası:", err);
            alert("Kurallar kaydedilemedi: " + err.message);
        }
    };

    const handleAddNewRule = () => {
        if (!newRuleForm.title.trim()) {
            alert("Lütfen kural başlığı giriniz!");
            return;
        }
        const newRule = {
            id: 'rule_' + Date.now(),
            title: newRuleForm.title.trim(),
            type: newRuleForm.type,
            percentage: parseInt(newRuleForm.percentage) || 10,
            description: newRuleForm.description.trim()
        };
        setTempRules([...tempRules, newRule]);
        setNewRuleForm({ title: '', type: 'BONUS', percentage: 10, description: '' });
    };

    const handleDeleteRule = (ruleId) => {
        setTempRules(tempRules.filter(r => r.id !== ruleId));
    };

    // --- EKİP (TAKIM) KAYDETME / DÜZENLEME ---
    const handleSaveTeam = async (e) => {
        e.preventDefault();
        if (!teamForm.name.trim()) {
            alert("Lütfen takım adı giriniz!");
            return;
        }
        if (!teamForm.leader.trim()) {
            alert("Lütfen takım lideri seçiniz!");
            return;
        }

        try {
            const payload = {
                name: teamForm.name.trim(),
                leader: teamForm.leader.trim(),
                members: teamForm.members.filter(m => m && m.name && m.name.trim() !== ''),
                updatedAt: serverTimestamp()
            };

            if (editingTeam?.id) {
                await updateDoc(doc(db, EVALUATION_TEAMS_COLLECTION, editingTeam.id), payload);
            } else {
                await addDoc(collection(db, EVALUATION_TEAMS_COLLECTION), {
                    ...payload,
                    totalPoints: 0,
                    createdAt: serverTimestamp()
                });
            }

            setIsTeamModalOpen(false);
            setEditingTeam(null);
            setTeamForm({ name: '', leader: '', members: [] });
            alert("Takım başarıyla kaydedildi!");
        } catch (err) {
            console.error("Takım kaydetme hatası:", err);
            alert("Takım kaydedilemedi: " + err.message);
        }
    };

    const handleDeleteTeam = async (teamId) => {
        if (!window.confirm("Bu takımı silmek istediğinize emin misiniz?")) return;
        try {
            await deleteDoc(doc(db, EVALUATION_TEAMS_COLLECTION, teamId));
        } catch (err) {
            console.error("Takım silme hatası:", err);
        }
    };

    // --- EKİP İÇİ PUAN DAĞITIMI (CAM VE LİDERLER) ---
    const handleOpenDistributeModal = (mold, calculated, evaluation) => {
        setDistributingMold({ mold, calculated, evaluation });
        const assignedTeam = teamMap.get(evaluation?.assignedTeamId);
        const members = assignedTeam?.members || [];
        
        const effectiveScore = evaluation?.managerFinalScore !== undefined 
            ? evaluation.managerFinalScore 
            : calculated.finalScore;

        const initial = {};
        const count = members.length || 1;
        const each = Math.floor(effectiveScore / count);
        members.forEach((m, i) => {
            initial[m.name] = (i === 0) ? (effectiveScore - (each * (count - 1))) : each;
        });
        setDistributeScores(initial);
        setIsDistributeModalOpen(true);
    };

    const handleSavePointDistribution = async () => {
        if (!distributingMold) return;
        const { mold, calculated, evaluation } = distributingMold;
        
        const effectiveScore = evaluation?.managerFinalScore !== undefined 
            ? evaluation.managerFinalScore 
            : calculated.finalScore;

        const totalAssigned = Object.values(distributeScores).reduce((a, b) => a + (parseInt(b) || 0), 0);

        if (totalAssigned > effectiveScore) {
            alert(`Toplam dağıtılan puan (${totalAssigned}), onaylanan puanı (${effectiveScore}) aşamaz!`);
            return;
        }

        try {
            const teamId = evaluation?.assignedTeamId;
            const batchOps = [];

            for (const [personName, score] of Object.entries(distributeScores)) {
                if (score > 0) {
                    batchOps.push(
                        addDoc(collection(db, MEMBER_POINT_LOGS_COLLECTION), {
                            personnelName: personName,
                            teamId: teamId || 'OTHER',
                            moldId: mold.id,
                            moldName: mold.moldName,
                            pointsAwarded: parseInt(score),
                            assignedBy: userNameTrim,
                            assignedDate: new Date().toISOString(),
                            createdAt: serverTimestamp()
                        })
                    );
                }
            }

            if (teamId && teamMap.has(teamId)) {
                const currentTeamPts = teamMap.get(teamId).totalPoints || 0;
                batchOps.push(
                    updateDoc(doc(db, EVALUATION_TEAMS_COLLECTION, teamId), {
                        totalPoints: currentTeamPts + totalAssigned,
                        updatedAt: serverTimestamp()
                    })
                );
            }

            if (evaluation?.id) {
                batchOps.push(
                    updateDoc(doc(db, PROJECT_EVALUATIONS_COLLECTION, evaluation.id), {
                        isPointsDistributed: true,
                        distributedTotal: totalAssigned,
                        distributedAt: serverTimestamp(),
                        distributedBy: userNameTrim
                    })
                );
            }

            await Promise.all(batchOps);
            setIsDistributeModalOpen(false);
            alert("Puanlar ekip üyelerine başarıyla dağıtıldı!");
        } catch (err) {
            console.error("Puan dağıtım hatası:", err);
            alert("Puanlar dağıtılamadı: " + err.message);
        }
    };

    // --- PARÇA TRANSFER TEKLİFİ ---
    const handleCreateTransferOffer = async (e) => {
        e.preventDefault();
        if (!transferForm.moldId || !transferForm.taskId) {
            alert("Lütfen transfer edilecek parçayı seçiniz!");
            return;
        }
        if (!transferForm.pointsOffered || parseInt(transferForm.pointsOffered) <= 0) {
            alert("Lütfen geçerli bir puan miktarı giriniz!");
            return;
        }

        try {
            await addDoc(collection(db, PART_TRANSFER_MARKET_COLLECTION), {
                ...transferForm,
                pointsOffered: parseInt(transferForm.pointsOffered),
                fromTeamName: teamMap.get(transferForm.fromTeamId)?.name || 'Ekip',
                status: transferForm.toTeamId === 'PUBLIC_POOL' ? 'OPEN' : 'PENDING_APPROVAL',
                createdBy: userNameTrim,
                createdAt: serverTimestamp()
            });

            setIsTransferModalOpen(false);
            setTransferForm({
                moldId: '',
                moldName: '',
                taskId: '',
                partName: '',
                fromTeamId: '',
                toTeamId: 'PUBLIC_POOL',
                pointsOffered: 15,
                note: ''
            });
            alert("Parça transfer teklifi başarıyla açıldı!");
        } catch (err) {
            console.error("Transfer teklifi hatası:", err);
            alert("Transfer teklifi oluşturulamadı: " + err.message);
        }
    };

    const handleAcceptTransfer = async (transfer) => {
        if (!selectedTeamId) {
            alert("Lütfen transferi kabul edecek kendi takımınızı seçiniz!");
            return;
        }
        if (transfer.fromTeamId === selectedTeamId) {
            alert("Kendi takımınızın teklifini kendiniz kabul edemezsiniz!");
            return;
        }

        const targetTeam = teamMap.get(selectedTeamId);
        if (!window.confirm(`"${transfer.partName}" parçasını ${transfer.pointsOffered} Puan karşılığında ${targetTeam?.name} takımına devralmak istiyor musunuz?`)) {
            return;
        }

        try {
            await updateDoc(doc(db, PART_TRANSFER_MARKET_COLLECTION, transfer.id), {
                status: 'ACCEPTED',
                acceptedByTeamId: selectedTeamId,
                acceptedByTeamName: targetTeam?.name || 'Takım',
                acceptedByUserName: userNameTrim,
                acceptedAt: serverTimestamp()
            });

            alert(`Parça ve ${transfer.pointsOffered} Puan başarıyla ${targetTeam?.name} takımına transfer edildi!`);
        } catch (err) {
            console.error("Transfer kabul hatası:", err);
            alert("Transfer kabul edilemedi: " + err.message);
        }
    };

    const handleRejectOrCancelTransfer = async (transferId, newStatus) => {
        try {
            await updateDoc(doc(db, PART_TRANSFER_MARKET_COLLECTION, transferId), {
                status: newStatus,
                cancelledBy: userNameTrim,
                cancelledAt: serverTimestamp()
            });
        } catch (err) {
            console.error("Transfer durumu güncelleme hatası:", err);
        }
    };

    return (
        <div className="flex flex-col h-[calc(100vh-64px)] overflow-hidden bg-slate-900 text-slate-100 font-sans">
            {/* ÜST BAŞLIK VE TAB BUTONLARI */}
            <div className="bg-slate-800 border-b border-slate-700 px-6 py-3.5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shrink-0">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-yellow-400 flex items-center justify-center shadow-lg shadow-amber-500/20 text-slate-950 font-black">
                        <Award className="w-6 h-6" />
                    </div>
                    <div>
                        <h1 className="text-lg font-black tracking-wide text-white flex items-center gap-2">
                            Proje Değerlendirme & Puanlama Sistemi
                        </h1>
                        <p className="text-xs text-slate-400">
                            Açık proje havuzu, transfer kesintileri, çoklu dinamik çarpanlar ve görsel ekip hiyerarşi şeması.
                        </p>
                    </div>
                </div>

                {/* SEKME BUTONLARI */}
                <div className="flex flex-wrap gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-700/80">
                    {isAdminOrManager && (
                        <button
                            onClick={() => setActiveTab('molds')}
                            className={`px-3.5 py-1.5 text-xs font-black rounded-lg transition-all flex items-center gap-1.5 ${
                                activeTab === 'molds' 
                                    ? 'bg-blue-600 text-white shadow-md' 
                                    : 'text-slate-400 hover:text-slate-200'
                            }`}
                        >
                            <Layers className="w-3.5 h-3.5" /> Kalıp Puanlama & Ekipler
                        </button>
                    )}

                    <button
                        onClick={() => setActiveTab('pool')}
                        className={`px-3.5 py-1.5 text-xs font-black rounded-lg transition-all flex items-center gap-1.5 ${
                            activeTab === 'pool' 
                                ? 'bg-indigo-600 text-white shadow-md' 
                                : 'text-slate-400 hover:text-slate-200'
                        }`}
                    >
                        <Inbox className="w-3.5 h-3.5 text-indigo-400" /> Proje İş Havuzu ({poolProjectsList.length})
                    </button>

                    <button
                        onClick={() => setActiveTab('my_team')}
                        className={`px-3.5 py-1.5 text-xs font-black rounded-lg transition-all flex items-center gap-1.5 ${
                            activeTab === 'my_team' 
                                ? 'bg-blue-600 text-white shadow-md' 
                                : 'text-slate-400 hover:text-slate-200'
                        }`}
                    >
                        <Users className="w-3.5 h-3.5" /> Ekip İş Takibi & Puan Dağıtımı
                    </button>

                    <button
                        onClick={() => setActiveTab('market')}
                        className={`px-3.5 py-1.5 text-xs font-black rounded-lg transition-all flex items-center gap-1.5 ${
                            activeTab === 'market' 
                                ? 'bg-blue-600 text-white shadow-md' 
                                : 'text-slate-400 hover:text-slate-200'
                        }`}
                    >
                        <ArrowRightLeft className="w-3.5 h-3.5" /> Parça Transfer Pazarı ({marketTransfers.filter(m => m.status === 'OPEN').length})
                    </button>

                    <button
                        onClick={() => setActiveTab('leaderboard')}
                        className={`px-3.5 py-1.5 text-xs font-black rounded-lg transition-all flex items-center gap-1.5 ${
                            activeTab === 'leaderboard' 
                                ? 'bg-amber-500 text-slate-950 shadow-md font-extrabold' 
                                : 'text-slate-400 hover:text-slate-200'
                        }`}
                    >
                        <Trophy className="w-3.5 h-3.5" /> Skor Tablosu
                    </button>
                </div>
            </div>

            {/* ANA İÇERİK ALANI */}
            <div className="flex-1 overflow-y-auto p-4 md:p-6 custom-scrollbar">
                
                {/* ============================================================ */}
                {/* 1. SEKME: KALIP PUANLAMA & EKİP YÖNETİMİ (YÖNETİCİ / ADMIN) */}
                {/* ============================================================ */}
                {activeTab === 'molds' && isAdminOrManager && (
                    <div className="space-y-6">
                        {/* HIZLI ÖZET VE AYAR ÇUBUĞU */}
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            {/* KART 1: ATAMASI YAPILAN PROJELER */}
                            <div className="p-4 rounded-2xl bg-slate-800 border border-slate-700/80 flex items-center justify-between">
                                <div>
                                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Ataması Yapılan Projeler</div>
                                    <div className="text-2xl font-black text-emerald-400 mt-0.5">
                                        {evaluations.filter(ev => !!ev.assignedTeamId).length} Kalıp
                                    </div>
                                </div>
                                <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-xl">
                                    <CheckCircle2 className="w-5 h-5" />
                                </div>
                            </div>

                            {/* KART 2: HAVUZDA BEKLEYEN PROJELER */}
                            <div className="p-4 rounded-2xl bg-slate-800 border border-slate-700/80 flex items-center justify-between">
                                <div>
                                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Havuzda Bekleyen</div>
                                    <div className="text-2xl font-black text-amber-400 mt-0.5">{poolProjectsList.length} Proje</div>
                                </div>
                                <div className="p-3 bg-amber-500/10 text-amber-400 rounded-xl">
                                    <Inbox className="w-5 h-5" />
                                </div>
                            </div>

                            {/* KART 3: AKTİF EKİPLER (TIKLANABİLİR & ŞEMA AÇAR) */}
                            <div 
                                onClick={() => {
                                    setSelectedOrgTeamId(teams[0]?.id || '');
                                    setIsOrgChartModalOpen(true);
                                }}
                                className="p-4 rounded-2xl bg-slate-800 border border-slate-700/80 hover:border-purple-500 cursor-pointer flex items-center justify-between transition group shadow-md"
                                title="Ekip organizasyon ve hiyerarşi şemasını incelemek için tıklayınız"
                            >
                                <div>
                                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider group-hover:text-purple-300 transition">
                                        Aktif Ekipler
                                    </div>
                                    <div className="text-2xl font-black text-purple-400 mt-0.5 flex items-center gap-1.5">
                                        {teams.length} Takım
                                        <span className="text-[10px] text-purple-300 font-bold bg-purple-950 px-2 py-0.5 rounded-full border border-purple-800 flex items-center gap-1">
                                            <Eye className="w-3 h-3" /> Şemayı Gör
                                        </span>
                                    </div>
                                </div>
                                <div className="p-3 bg-purple-500/10 text-purple-400 group-hover:bg-purple-500 group-hover:text-white rounded-xl transition">
                                    <Users className="w-5 h-5" />
                                </div>
                            </div>

                            {/* KART 4: TANIMLI KURALLAR */}
                            <div className="p-4 rounded-2xl bg-slate-800 border border-slate-700/80 flex items-center justify-between">
                                <div>
                                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Tanımlı Kurallar</div>
                                    <div className="text-2xl font-black text-blue-400 mt-0.5">{rules.length} Kural</div>
                                </div>
                                <button
                                    onClick={() => { setTempRules(rules); setIsRulesModalOpen(true); }}
                                    className="p-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-xs font-bold transition flex items-center gap-1 shadow-sm"
                                    title="Termin kurallarını ve oranlarını düzenle"
                                >
                                    <Settings className="w-4 h-4" /> Kurallar
                                </button>
                            </div>
                        </div>

                        {/* AKSİYON ÇUBUĞU (ARAMA & PROJE EKLEME & EKİP KURMA) */}
                        <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 bg-slate-800/80 p-4 rounded-2xl border border-slate-700">
                            <div className="flex flex-wrap items-center gap-3 flex-1">
                                <div className="relative flex-1 min-w-[240px]">
                                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                                    <input 
                                        type="text"
                                        placeholder="Kalıp adı, müşteri veya ekip adı ile ara..."
                                        value={moldSearchTerm}
                                        onChange={e => setMoldSearchTerm(e.target.value)}
                                        className="w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs font-bold text-white focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>

                                <select
                                    value={selectedTeamFilter}
                                    onChange={e => setSelectedTeamFilter(e.target.value)}
                                    className="p-2 bg-slate-900 border border-slate-700 rounded-xl text-xs font-bold text-slate-200 focus:ring-2 focus:ring-blue-500"
                                >
                                    <option value="ALL">Tüm Ekipler & Havuz</option>
                                    {teams.map(t => (
                                        <option key={t.id} value={t.id}>{t.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => { setEditingTeam(null); setTeamForm({ name: '', leader: '', members: [] }); setIsTeamModalOpen(true); }}
                                    className="px-3.5 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-black rounded-xl transition flex items-center justify-center gap-1.5 shadow-md"
                                >
                                    <Plus className="w-4 h-4" /> Ekip (Takım) Kur
                                </button>

                                <button
                                    onClick={() => {
                                        setAddMoldForm({ moldId: '', baseScore: 80, targetDeadline: '', assignedTeamId: '' });
                                        setIsAddMoldModalOpen(true);
                                    }}
                                    className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs font-black rounded-xl transition flex items-center justify-center gap-1.5 shadow-md shadow-blue-600/20"
                                >
                                    <Plus className="w-4 h-4" /> Değerlendirmeye Proje Ekle
                                </button>
                            </div>
                        </div>

                        {/* SADECE EKLENEN PROJELERİN PUANLAMA VE TERMİN TABLOSU */}
                        <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden shadow-xl">
                            <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-850">
                                <span className="text-xs font-black uppercase tracking-wider text-slate-300">
                                    📋 Puan Değerlendirme & Ekip Görevlendirme Listesi ({evaluatedProjectsList.length})
                                </span>
                            </div>

                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-xs">
                                    <thead className="bg-slate-900/80 text-slate-400 uppercase text-[10px] font-black border-b border-slate-700">
                                        <tr>
                                            <th className="p-3.5">Kalıp Adı / Müşteri</th>
                                            <th className="p-3.5">Hedef Termin</th>
                                            <th className="p-3.5">Kalan Süre (Hafta & Gün)</th>
                                            <th className="p-3.5">Baz Puan</th>
                                            <th className="p-3.5">Sorumlu Ekip / Havuz Talepleri</th>
                                            <th className="p-3.5">Nihai Puan Durumu</th>
                                            <th className="p-3.5 text-right">İşlemler</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-700/60">
                                        {evaluatedProjectsList.length === 0 ? (
                                            <tr>
                                                <td colSpan={7} className="p-8 text-center text-slate-500 italic">
                                                    Henüz değerlendirme listesine eklenmiş kalıp bulunmuyor. Yukarıdaki "➕ Değerlendirmeye Proje Ekle" butonuna basarak kalıp ekleyebilirsiniz.
                                                </td>
                                            </tr>
                                        ) : (
                                            evaluatedProjectsList.map(({ mold, evaluation }) => {
                                                const calculated = calculateMoldScoreWithRules(mold, evaluation);
                                                const assignedTeam = teamMap.get(evaluation.assignedTeamId);
                                                const targetDate = evaluation.targetDeadline || mold.moldDeadline;
                                                const timeInfo = calculated.timeInfo || calculateWeeksAndDays(targetDate, mold.status === 'TAMAMLANDI');
                                                const isEvaluated = evaluation.isEvaluatedByManager;
                                                const claimRequests = evaluation.claimRequests || [];

                                                return (
                                                    <tr key={evaluation.id} className="hover:bg-slate-750/50 transition">
                                                        <td className="p-3.5 font-bold">
                                                            <div className="text-white text-sm flex items-center gap-1.5">
                                                                {mold.moldName}
                                                                {isEvaluated && (
                                                                    <CheckCircle className="w-3.5 h-3.5 text-emerald-400" title="Yönetici Değerlendirmesi Tamamlandı" />
                                                                )}
                                                            </div>
                                                            <div className="text-slate-400 text-[11px]">{mold.customer || 'Müşteri Yok'}</div>
                                                        </td>

                                                        <td className="p-3.5 font-mono text-slate-300">
                                                            {targetDate ? targetDate.slice(0, 10) : '---'}
                                                        </td>

                                                        <td className="p-3.5">
                                                            <span className={`px-2.5 py-1 rounded-full text-[11px] font-black border ${timeInfo.badgeColor} flex items-center gap-1.5 w-max`}>
                                                                <Clock className="w-3.5 h-3.5" />
                                                                {timeInfo.text}
                                                            </span>
                                                        </td>

                                                        <td className="p-3.5">
                                                            <span className="font-black text-amber-400 text-sm">
                                                                {evaluation.baseScore} Puan
                                                            </span>
                                                        </td>

                                                        <td className="p-3.5">
                                                            {assignedTeam ? (
                                                                <span className="px-2.5 py-1 rounded-xl text-xs font-bold bg-purple-950 text-purple-300 border border-purple-800">
                                                                    {assignedTeam.name}
                                                                </span>
                                                            ) : (
                                                                <div className="space-y-1.5">
                                                                    <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-slate-800 text-amber-300 border border-amber-500/30 flex items-center gap-1 w-max">
                                                                        🌐 Açık Havuzda
                                                                    </span>
                                                                    
                                                                    {claimRequests.length > 0 && (
                                                                        <div className="space-y-1 mt-1 bg-slate-900/90 p-2 rounded-xl border border-purple-500/40">
                                                                            <span className="text-[10px] font-black text-purple-300 block">
                                                                                🙋‍♂️ İşi İsteyen Ekipler ({claimRequests.length}):
                                                                            </span>
                                                                            {claimRequests.map((req, rIdx) => (
                                                                                <div key={rIdx} className="flex items-center justify-between gap-2 text-[11px]">
                                                                                    <span className="font-bold text-white truncate">{req.teamName}</span>
                                                                                    <button
                                                                                        onClick={() => handleApproveTeamClaim(evaluation.id, req.teamId, req.teamName)}
                                                                                        className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[10px] rounded transition shadow-sm shrink-0"
                                                                                        title="Bu takıma ata ve onayla"
                                                                                    >
                                                                                        ✅ Ata / Onayla
                                                                                    </button>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </td>

                                                        <td className="p-3.5">
                                                            <div className="flex flex-col gap-0.5">
                                                                <div className="font-extrabold text-sm text-amber-400 flex items-center gap-1">
                                                                    🏆 {calculated.finalScore} Puan
                                                                    {isEvaluated && (
                                                                        <span className="text-[10px] text-emerald-400 bg-emerald-950 px-1.5 py-0.5 rounded border border-emerald-800 font-mono">
                                                                            Onaylandı
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <span className="text-[10px] text-slate-400">{calculated.statusLabel}</span>
                                                            </div>
                                                        </td>

                                                        <td className="p-3.5 text-right">
                                                            <div className="flex items-center justify-end gap-2">
                                                                <button
                                                                    onClick={() => handleOpenManagerEvaluationModal(mold, evaluation)}
                                                                    className="px-3 py-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-black text-xs rounded-xl transition shadow-sm flex items-center gap-1"
                                                                    title="Projeyi ve Ekip Performansını Değerlendir"
                                                                >
                                                                    <FileText className="w-3.5 h-3.5" /> Değerlendir & Puanla
                                                                </button>

                                                                <button
                                                                    onClick={() => handleDeleteEvaluation(evaluation.id)}
                                                                    className="p-1.5 text-slate-400 hover:text-red-400 rounded-lg hover:bg-slate-700 transition"
                                                                    title="Değerlendirmeden Kaldır"
                                                                >
                                                                    <Trash2 className="w-4 h-4" />
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}

                {/* ============================================================ */}
                {/* 2. SEKME: PROJE İŞ HAVUZU (CAM OPERATÖRLERİ & TÜM EKİPLER) */}
                {/* ============================================================ */}
                {activeTab === 'pool' && (
                    <div className="space-y-6">
                        <div className="p-4 rounded-2xl bg-slate-800 border border-slate-700 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                            <div>
                                <h2 className="text-base font-black text-white flex items-center gap-2">
                                    <Inbox className="w-5 h-5 text-indigo-400" /> Açık Proje İş Havuzu
                                </h2>
                                <p className="text-xs text-slate-400 mt-0.5">
                                    Henüz bir takıma atanmamış yeni kalıp projelerini inceleyebilir ve takımınız adına işi üstlenmek için talep açabilirsiniz.
                                </p>
                            </div>

                            {userAccessibleTeams.length > 1 && (
                                <div className="flex items-center gap-2">
                                    <label className="text-xs font-bold text-slate-400">İş İsteyen Ekibiniz:</label>
                                    <select
                                        value={selectedTeamId}
                                        onChange={e => setSelectedTeamId(e.target.value)}
                                        className="p-2 bg-slate-900 border border-slate-600 rounded-xl text-xs font-black text-purple-300 focus:ring-2 focus:ring-purple-500 min-w-[150px]"
                                    >
                                        {userAccessibleTeams.map(t => (
                                            <option key={t.id} value={t.id}>{t.name}</option>
                                        ))}
                                    </select>
                                </div>
                            )}
                        </div>

                        {/* HAVUZDAKİ PROJELER KARTLARI */}
                        {poolProjectsList.length === 0 ? (
                            <div className="p-12 text-center bg-slate-800/40 rounded-2xl border border-slate-700 text-slate-400 space-y-2">
                                <Inbox className="w-8 h-8 text-slate-500 mx-auto" />
                                <div className="text-sm font-bold text-slate-300">Şu anda Açık Proje Havuzunda bekleyen iş bulunmuyor.</div>
                                <div className="text-xs text-slate-500">Yönetici yeni bir kalıp değerlendirmeye eklediğinde burada listelenecektir.</div>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {poolProjectsList.map(({ mold, evaluation }) => {
                                    const timeInfo = calculateWeeksAndDays(evaluation.targetDeadline || mold.moldDeadline);
                                    const isAlreadyClaimed = (evaluation.claimRequests || []).some(r => r.teamId === selectedTeamId);

                                    return (
                                        <div key={evaluation.id} className="p-5 rounded-2xl bg-slate-800 border border-slate-700/80 hover:border-indigo-500/50 transition flex flex-col justify-between shadow-xl space-y-4">
                                            <div>
                                                <div className="flex justify-between items-start">
                                                    <div>
                                                        <span className="font-black text-base text-white">{mold.moldName}</span>
                                                        <div className="text-xs text-slate-400 mt-0.5">Müşteri: <b className="text-slate-300">{mold.customer || '---'}</b></div>
                                                    </div>
                                                    <span className="px-3 py-1 rounded-full text-xs font-black bg-amber-950 text-amber-300 border border-amber-700">
                                                        🏆 {evaluation.baseScore} Puan
                                                    </span>
                                                </div>

                                                <div className="mt-3 p-3 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2 text-xs">
                                                    <div className="flex justify-between">
                                                        <span className="text-slate-400">Hedef Termin:</span>
                                                        <span className="font-mono font-bold text-slate-200">
                                                            {evaluation.targetDeadline ? evaluation.targetDeadline.slice(0, 10) : 'Terminsiz'}
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-slate-400">Kalan Süre:</span>
                                                        <span className={`px-2 py-0.5 rounded text-[11px] font-black border ${timeInfo.badgeColor}`}>
                                                            {timeInfo.text}
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span className="text-slate-400">Alt Parça Sayısı:</span>
                                                        <span className="font-bold text-slate-200">{mold.tasks?.length || 0} Parça</span>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="pt-3 border-t border-slate-700/80 flex justify-between items-center">
                                                <span className="text-[11px] text-slate-400 font-bold">
                                                    {evaluation.claimRequests?.length ? `${evaluation.claimRequests.length} Takım Talep Etti` : 'Henüz Talep Yok'}
                                                </span>

                                                {isAlreadyClaimed ? (
                                                    <span className="px-3 py-1.5 bg-purple-950 text-purple-300 border border-purple-800 text-xs font-bold rounded-xl flex items-center gap-1 shadow-sm">
                                                        ⏳ Talebiniz İletildi
                                                    </span>
                                                ) : (
                                                    <button
                                                        onClick={() => handleClaimProjectFromPool(evaluation.id, mold.moldName)}
                                                        className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white font-black text-xs rounded-xl transition shadow-md shadow-indigo-600/20 flex items-center gap-1.5"
                                                    >
                                                        <Hand className="w-3.5 h-3.5" /> Bu İşi Ekibimiz Almak İstiyor
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {/* ============================================================ */}
                {/* 3. SEKME: EKİP İŞ TAKİBİ & TAMAMLANAN PROJELERİN PUAN DAĞITIMI */}
                {/* ============================================================ */}
                {activeTab === 'my_team' && (
                    <div className="space-y-6">
                        {/* TAKIM SEÇİCİ HEADER */}
                        <div className="p-4 rounded-2xl bg-slate-800 border border-slate-700 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                            <div>
                                <h2 className="text-base font-black text-white flex items-center gap-2">
                                    <Users className="w-5 h-5 text-purple-400" /> Ekip İçi İş Takibi & Puan Dağıtım Paneli
                                </h2>
                                <p className="text-xs text-slate-400 mt-0.5">
                                    Devam eden parçaları inceleyebilir, tamamlanan ve yönetici tarafından onaylanan projelerin puanlarını ekibinize dağıtabilirsiniz.
                                </p>
                            </div>

                            <div className="flex items-center gap-2">
                                {userAccessibleTeams.length > 1 ? (
                                    <div className="flex items-center gap-2">
                                        <label className="text-xs font-bold text-slate-400">Görüntülenen Ekip:</label>
                                        <select
                                            value={selectedTeamId}
                                            onChange={e => setSelectedTeamId(e.target.value)}
                                            className="p-2 bg-slate-900 border border-slate-600 rounded-xl text-xs font-black text-purple-300 focus:ring-2 focus:ring-purple-500 min-w-[160px]"
                                        >
                                            {userAccessibleTeams.map(t => (
                                                <option key={t.id} value={t.id}>{t.name} (Lider: {t.leader})</option>
                                            ))}
                                        </select>
                                    </div>
                                ) : userAccessibleTeams.length === 1 ? (
                                    <div className="px-3 py-1.5 bg-purple-950 text-purple-300 border border-purple-800 rounded-xl text-xs font-black">
                                        {userAccessibleTeams[0].name} (Lider: {userAccessibleTeams[0].leader})
                                    </div>
                                ) : null}

                                <button
                                    onClick={() => {
                                        setSelectedOrgTeamId(selectedTeamId || teams[0]?.id || '');
                                        setIsOrgChartModalOpen(true);
                                    }}
                                    className="px-3 py-2 bg-purple-950 hover:bg-purple-900 text-purple-300 border border-purple-700/60 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
                                    title="Ekip Şemasını Aç"
                                >
                                    <Eye className="w-3.5 h-3.5" /> Ekip Şeması
                                </button>
                            </div>
                        </div>

                        {/* SEÇİLİ TAKIMIN PROJELERİ */}
                        {(() => {
                            const currentTeam = teamMap.get(selectedTeamId);
                            const teamEvaluations = evaluations.filter(ev => ev.assignedTeamId === selectedTeamId);

                            if (!currentTeam) {
                                return (
                                    <div className="p-8 text-center bg-slate-800/50 rounded-2xl border border-slate-700 text-slate-400">
                                        Henüz bir takım oluşturulmamış veya sistemde kayıtlı takımınız bulunmuyor.
                                    </div>
                                );
                            }

                            // Tamamlanan ve Yönetici Onaylı Projeler
                            const approvedCompletedEvals = teamEvaluations.filter(ev => ev.isEvaluatedByManager);
                            // Devam Eden Projeler (Henüz Yönetici Puanı Onaylamadı)
                            const inProgressEvals = teamEvaluations.filter(ev => !ev.isEvaluatedByManager);

                            return (
                                <div className="space-y-6">
                                    {/* TAKIM BİLGİ KARTI */}
                                    <div className="p-4 rounded-2xl bg-gradient-to-r from-purple-900/30 to-blue-900/30 border border-purple-700/50 flex flex-wrap justify-between items-center gap-4">
                                        <div>
                                            <span className="text-[11px] font-bold text-purple-400 uppercase tracking-wider">Takım Lideri</span>
                                            <div className="text-lg font-black text-white">{currentTeam.leader}</div>
                                        </div>

                                        <div className="flex flex-wrap gap-2">
                                            {(currentTeam.members || []).map((m, idx) => (
                                                <span key={idx} className="px-3 py-1 bg-slate-800 text-slate-200 border border-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5">
                                                    <UserCheck className="w-3.5 h-3.5 text-blue-400" />
                                                    {m.name} <span className="text-[10px] text-slate-400 font-mono">({m.role})</span>
                                                </span>
                                            ))}
                                        </div>

                                        <div>
                                            <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider">Kazanılan Toplam Puan</span>
                                            <div className="text-xl font-black text-amber-300">🏆 {currentTeam.totalPoints || 0} Puan</div>
                                        </div>
                                    </div>

                                    {/* BÖLÜM 1: TAMAMLANAN VE YÖNETİCİ ONAYLI PROJELER (PUAN DAĞITIM HAVUZU) */}
                                    {approvedCompletedEvals.length > 0 && (
                                        <div className="p-5 rounded-2xl bg-slate-800 border-2 border-emerald-500/50 space-y-4 shadow-xl">
                                            <div className="flex justify-between items-center border-b border-slate-700/80 pb-3">
                                                <div className="flex items-center gap-2">
                                                    <Trophy className="w-5 h-5 text-amber-400" />
                                                    <h3 className="font-black text-base text-emerald-300">
                                                        🏆 Tamamlanan & Puanı Onaylanan Projeler (Puan Dağıtım Bölümü)
                                                    </h3>
                                                </div>
                                                <span className="text-xs font-bold text-slate-400">
                                                    {approvedCompletedEvals.length} Proje Puan Dağıtımına Hazır
                                                </span>
                                            </div>

                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                {approvedCompletedEvals.map(ev => {
                                                    const mold = projectMap.get(ev.moldId) || { id: ev.moldId, moldName: ev.moldName, customer: ev.customer, tasks: [] };
                                                    const calculated = calculateMoldScoreWithRules(mold, ev);
                                                    const isDistributed = ev.isPointsDistributed;

                                                    return (
                                                        <div key={ev.id} className="p-4 rounded-xl bg-slate-900 border border-slate-700 flex flex-col justify-between shadow-md">
                                                            <div>
                                                                <div className="flex justify-between items-start">
                                                                    <div>
                                                                        <span className="font-extrabold text-sm text-white">{mold.moldName}</span>
                                                                        <div className="text-xs text-slate-400">{mold.customer || 'Müşteri Yok'}</div>
                                                                    </div>

                                                                    <div className="text-right">
                                                                        <span className="px-2.5 py-1 rounded-full text-xs font-black bg-amber-950 text-amber-400 border border-amber-700 block">
                                                                            🏆 {ev.managerFinalScore} Puan
                                                                        </span>
                                                                        {ev.transferredOutDeduction > 0 && (
                                                                            <span className="text-[10px] text-rose-400 block mt-0.5">
                                                                                (-{ev.transferredOutDeduction} Puan Devredildi)
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </div>

                                                                {ev.managerNotes && (
                                                                    <div className="mt-2.5 p-2 rounded-lg bg-slate-950 text-[11px] text-slate-300 border border-slate-800 italic">
                                                                        Yönetici Notu: "{ev.managerNotes}"
                                                                    </div>
                                                                )}
                                                            </div>

                                                            <div className="mt-4 pt-3 border-t border-slate-800 flex justify-between items-center">
                                                                {isDistributed ? (
                                                                    <span className="px-3 py-1 bg-emerald-950 text-emerald-300 border border-emerald-800 text-xs font-bold rounded-lg flex items-center gap-1.5">
                                                                        <CheckCircle2 className="w-4 h-4" /> Puanlar Ekibe Dağıtıldı
                                                                    </span>
                                                                ) : (
                                                                    <button
                                                                        onClick={() => handleOpenDistributeModal(mold, calculated, ev)}
                                                                        className="px-4 py-2 bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-600 hover:to-yellow-500 text-slate-950 font-black text-xs rounded-xl transition shadow-md flex items-center gap-1.5"
                                                                    >
                                                                        🎯 Puanları Ekibe Dağıt ({ev.managerFinalScore} Puan)
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}

                                    {/* BÖLÜM 2: DEVAM EDEN PROJELER & PARÇA GÖREVLENDİRMELERİ */}
                                    <div className="space-y-4">
                                        <div className="text-xs font-black text-slate-400 uppercase tracking-wider px-1">
                                            ⏳ İmalatı Devam Eden Projeler ({inProgressEvals.length})
                                        </div>

                                        {inProgressEvals.length === 0 && approvedCompletedEvals.length === 0 ? (
                                            <div className="p-8 text-center bg-slate-800/40 rounded-2xl border border-slate-700 text-slate-400">
                                                Bu takıma henüz resmi olarak atanmış bir kalıp projesi bulunmuyor. "Proje İş Havuzu" sekmesinden yeni iş talep edebilirsiniz.
                                            </div>
                                        ) : inProgressEvals.length === 0 ? (
                                            <div className="p-4 text-center bg-slate-800/40 rounded-xl border border-slate-700 text-xs text-slate-400 italic">
                                                Şu anda devam eden proje yok. Tüm projeler tamamlanmış ve yönetici onayındadır.
                                            </div>
                                        ) : (
                                            inProgressEvals.map(ev => {
                                                const mold = projectMap.get(ev.moldId) || { id: ev.moldId, moldName: ev.moldName, customer: ev.customer, tasks: [] };
                                                const calculated = calculateMoldScoreWithRules(mold, ev);
                                                const targetDate = ev.targetDeadline || mold.moldDeadline;
                                                const timeInfo = calculated.timeInfo || calculateWeeksAndDays(targetDate, mold.status === 'TAMAMLANDI');

                                                return (
                                                    <div key={ev.id} className="p-5 rounded-2xl bg-slate-800 border border-slate-700 space-y-4 shadow-lg">
                                                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-700/80 pb-3.5">
                                                            <div>
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-base font-black text-white">{mold.moldName}</span>
                                                                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-blue-950 text-blue-400 border border-blue-800">
                                                                        {mold.customer || 'Müşteri Yok'}
                                                                    </span>
                                                                </div>
                                                                <div className="text-xs text-slate-400 mt-1 flex flex-wrap items-center gap-3">
                                                                    <span>Termin: <b className="text-slate-200">{targetDate?.slice(0, 10) || '---'}</b></span>
                                                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${timeInfo.badgeColor}`}>
                                                                        {timeInfo.text}
                                                                    </span>
                                                                </div>
                                                            </div>

                                                            <div className="text-right">
                                                                <span className="text-xs font-bold text-amber-400 bg-amber-950/60 px-3 py-1 rounded-xl border border-amber-700/60 inline-flex items-center gap-1.5">
                                                                    <Clock className="w-3.5 h-3.5" /> İmalat Sürüyor (Tahmini: {ev.baseScore} Puan)
                                                                </span>
                                                                <div className="text-[10px] text-slate-400 mt-1">
                                                                    Puan dağıtımı imalat bitip yönetici değerlendirince açılacaktır.
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* ALT PARÇALAR LİSTESİ VE GÖREVLENDİRME */}
                                                        <div>
                                                            <div className="text-xs font-black text-slate-400 uppercase tracking-wider mb-2">
                                                                🧩 Kalıp Parçaları & Görevlendirme ({mold.tasks?.length || 0} Parça)
                                                            </div>

                                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                                                                {(mold.tasks || []).map(task => {
                                                                    const partName = getTaskDisplayName(task);
                                                                    return (
                                                                        <div key={task.id} className="p-3 rounded-xl bg-slate-900/90 border border-slate-700/80 flex justify-between items-center">
                                                                            <div className="pr-2 truncate">
                                                                                <div className="font-extrabold text-xs text-slate-200 truncate" title={partName}>
                                                                                {partName}
                                                                            </div>
                                                                            <div className="text-[10px] text-slate-400 mt-0.5">
                                                                                Durum: <span className="font-bold text-blue-400">{task.status || 'BEKLIYOR'}</span>
                                                                            </div>
                                                                        </div>

                                                                        <button
                                                                            onClick={() => {
                                                                                setTransferForm({
                                                                                    moldId: mold.id,
                                                                                    moldName: mold.moldName,
                                                                                    taskId: task.id,
                                                                                    partName: partName,
                                                                                    fromTeamId: selectedTeamId,
                                                                                    toTeamId: 'PUBLIC_POOL',
                                                                                    pointsOffered: 15,
                                                                                    note: ''
                                                                                });
                                                                                setIsTransferModalOpen(true);
                                                                            }}
                                                                            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-amber-400 hover:text-amber-300 border border-amber-500/30 rounded-lg text-[11px] font-bold transition flex items-center gap-1 shrink-0"
                                                                            title="Bu parçayı puan karşılığında diğer takımlara transfer et"
                                                                        >
                                                                            <ArrowRightLeft className="w-3 h-3" /> Devret
                                                                        </button>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </div>
                        );
                    })()}
                </div>
            )}

                {/* ============================================================ */}
                {/* 4. SEKME: PARÇA TRANSFER HAVUZU & TAKAS (PUAN PAZARI) */}
                {/* ============================================================ */}
                {activeTab === 'market' && (
                    <div className="space-y-6">
                        <div className="p-4 rounded-2xl bg-slate-800 border border-slate-700 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                            <div>
                                <h2 className="text-base font-black text-white flex items-center gap-2">
                                    <ArrowRightLeft className="w-5 h-5 text-amber-400" /> Takımlar Arası Parça & Puan Transfer Pazarı
                                </h2>
                                <p className="text-xs text-slate-400 mt-0.5">
                                    Yoğun olan takımlar parçalarını puan karşılığı havuza bırakabilir veya diğer takımlar bu parçaları alarak ekibine puan kazandırabilir.
                                </p>
                            </div>

                            <button
                                onClick={() => {
                                    setTransferForm({
                                        moldId: '',
                                        moldName: '',
                                        taskId: '',
                                        partName: '',
                                        fromTeamId: selectedTeamId || teams[0]?.id || '',
                                        toTeamId: 'PUBLIC_POOL',
                                        pointsOffered: 15,
                                        note: ''
                                    });
                                    setIsTransferModalOpen(true);
                                }}
                                className="px-4 py-2 bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-600 hover:to-yellow-500 text-slate-950 font-black text-xs rounded-xl transition flex items-center gap-1.5 shadow-md shadow-amber-500/20"
                            >
                                <Plus className="w-4 h-4" /> Parça Transfer Teklifi Aç
                            </button>
                        </div>

                        {/* AÇIK HAVUZ TEKLİFLERİ */}
                        <div className="space-y-3">
                            <div className="text-xs font-black text-slate-400 uppercase tracking-wider px-1 flex items-center gap-1.5">
                                <Sparkles className="w-4 h-4 text-yellow-400" /> Açık Parça Transfer Havuzu (Pazar)
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {marketTransfers.filter(m => m.status === 'OPEN').length === 0 ? (
                                    <div className="col-span-full p-8 text-center bg-slate-800/40 rounded-2xl border border-slate-700 text-slate-500 italic">
                                        Şu anda açık transfer havuzunda bekleyen parça teklifi bulunmuyor.
                                    </div>
                                ) : (
                                    marketTransfers.filter(m => m.status === 'OPEN').map(item => (
                                        <div key={item.id} className="p-4 rounded-2xl bg-slate-800 border border-slate-700/80 hover:border-amber-500/50 transition flex flex-col justify-between shadow-lg">
                                            <div>
                                                <div className="flex justify-between items-start">
                                                    <span className="text-xs font-bold text-purple-400">{item.fromTeamName}</span>
                                                    <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-amber-950 text-amber-400 border border-amber-800">
                                                        +{item.pointsOffered} Puan
                                                    </span>
                                                </div>
                                                <div className="mt-2 text-sm font-black text-white">{item.partName}</div>
                                                <div className="text-xs text-slate-400">📦 {item.moldName}</div>
                                                {item.note && (
                                                    <div className="mt-2 p-2 rounded-lg bg-slate-900/80 text-[11px] text-slate-300 italic">
                                                        "{item.note}"
                                                    </div>
                                                )}
                                            </div>

                                            <div className="mt-4 pt-3 border-t border-slate-700 flex justify-between items-center">
                                                <span className="text-[10px] text-slate-500">{item.createdBy}</span>
                                                
                                                {item.fromTeamId === selectedTeamId ? (
                                                    <button
                                                        onClick={() => handleRejectOrCancelTransfer(item.id, 'CANCELLED')}
                                                        className="px-3 py-1 bg-red-950 hover:bg-red-900 text-red-400 border border-red-800 text-[11px] font-bold rounded-lg transition"
                                                    >
                                                        Teklifi İptal Et
                                                    </button>
                                                ) : (
                                                    <button
                                                        onClick={() => handleAcceptTransfer(item)}
                                                        className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-xl transition flex items-center gap-1 shadow-sm"
                                                    >
                                                        <Check className="w-3.5 h-3.5" /> İşi ve Puanı Al
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>

                        {/* TAMAMLANMIŞ / KABUL EDİLMİŞ TRANSFERLER GEÇMİŞİ */}
                        <div className="space-y-3 pt-4">
                            <div className="text-xs font-black text-slate-400 uppercase tracking-wider px-1">
                                📜 Geçmiş Parça Transferleri
                            </div>

                            <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden">
                                <table className="w-full text-left text-xs">
                                    <thead className="bg-slate-900 text-slate-400 uppercase text-[10px] font-black border-b border-slate-700">
                                        <tr>
                                            <th className="p-3">Kalıp / Parça</th>
                                            <th className="p-3">Gönderen Takım</th>
                                            <th className="p-3">Devralan Takım</th>
                                            <th className="p-3">Transfer Puanı</th>
                                            <th className="p-3">Durum</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-700/60">
                                        {marketTransfers.filter(m => m.status !== 'OPEN').length === 0 ? (
                                            <tr>
                                                <td colSpan={5} className="p-4 text-center text-slate-500 italic">
                                                    Geçmiş transfer kaydı bulunmuyor.
                                                </td>
                                            </tr>
                                        ) : (
                                            marketTransfers.filter(m => m.status !== 'OPEN').map(t => (
                                                <tr key={t.id} className="hover:bg-slate-750/30">
                                                    <td className="p-3 font-bold text-white">
                                                        {t.partName} <span className="text-[10px] text-slate-400">({t.moldName})</span>
                                                    </td>
                                                    <td className="p-3 text-purple-400 font-bold">{t.fromTeamName}</td>
                                                    <td className="p-3 text-emerald-400 font-bold">{t.acceptedByTeamName || '---'}</td>
                                                    <td className="p-3 font-black text-amber-400">🏆 {t.pointsOffered} Puan</td>
                                                    <td className="p-3">
                                                        {t.status === 'ACCEPTED' ? (
                                                            <span className="px-2 py-0.5 rounded text-[10px] font-black bg-emerald-950 text-emerald-400 border border-emerald-800">
                                                                Transfer Edildi
                                                            </span>
                                                        ) : (
                                                            <span className="px-2 py-0.5 rounded text-[10px] font-black bg-slate-700 text-slate-400">
                                                                {t.status}
                                                            </span>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}

                {/* ============================================================ */}
                {/* 5. SEKME: SKOR TABLOSU & LİDERLİK (LEADERBOARD) */}
                {/* ============================================================ */}
                {activeTab === 'leaderboard' && (
                    <div className="space-y-6">
                        <div className="space-y-3">
                            <div className="text-xs font-black text-slate-400 uppercase tracking-wider px-1 flex items-center gap-1.5">
                                <Trophy className="w-4 h-4 text-amber-400" /> Takım Genel Sıralaması
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                {[...teams].sort((a, b) => (b.totalPoints || 0) - (a.totalPoints || 0)).map((team, rank) => (
                                    <div 
                                        key={team.id} 
                                        className={`p-5 rounded-2xl border flex flex-col justify-between shadow-xl relative overflow-hidden ${
                                            rank === 0 
                                                ? 'bg-gradient-to-b from-amber-950/40 to-slate-900 border-amber-500' 
                                                : rank === 1 
                                                    ? 'bg-gradient-to-b from-slate-800 to-slate-900 border-slate-400' 
                                                    : 'bg-slate-800 border-slate-700'
                                        }`}
                                    >
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <span className="text-xs font-black text-slate-400">#{rank + 1}. Sıra</span>
                                                <h3 className="text-lg font-black text-white mt-0.5">{team.name}</h3>
                                                <div className="text-xs text-slate-400 mt-1">Lider: <b className="text-purple-400">{team.leader}</b></div>
                                            </div>
                                            <div className="text-2xl">
                                                {rank === 0 ? '🥇' : rank === 1 ? '🥈' : rank === 2 ? '🥉' : '⭐'}
                                            </div>
                                        </div>

                                        <div className="mt-4 pt-3 border-t border-slate-700/80 flex justify-between items-center">
                                            <span className="text-xs text-slate-400">{team.members?.length || 0} Üye</span>
                                            <span className="text-xl font-black text-amber-400">🏆 {team.totalPoints || 0} Puan</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-3 pt-4">
                            <div className="text-xs font-black text-slate-400 uppercase tracking-wider px-1 flex items-center gap-1.5">
                                <Award className="w-4 h-4 text-emerald-400" /> Bireysel Personel Puan Sıralaması
                            </div>

                            <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden">
                                {(() => {
                                    const personTotals = {};
                                    memberPointLogs.forEach(log => {
                                        if (log.personnelName) {
                                            personTotals[log.personnelName] = (personTotals[log.personnelName] || 0) + (log.pointsAwarded || 0);
                                        }
                                    });

                                    const sortedPersonnel = Object.entries(personTotals).sort((a, b) => b[1] - a[1]);

                                    return (
                                        <table className="w-full text-left text-xs">
                                            <thead className="bg-slate-900 text-slate-400 uppercase text-[10px] font-black border-b border-slate-700">
                                                <tr>
                                                    <th className="p-3">Sıra</th>
                                                    <th className="p-3">Personel Adı</th>
                                                    <th className="p-3">Kazanılan Toplam Puan</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-700/60">
                                                {sortedPersonnel.length === 0 ? (
                                                    <tr>
                                                        <td colSpan={3} className="p-4 text-center text-slate-500 italic">
                                                            Henüz bireysel puan dağıtımı yapılmadı.
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    sortedPersonnel.map(([name, score], idx) => (
                                                        <tr key={name} className="hover:bg-slate-750/30">
                                                            <td className="p-3 font-bold text-slate-400">#{idx + 1}</td>
                                                            <td className="p-3 font-extrabold text-white text-sm">{name}</td>
                                                            <td className="p-3 font-black text-amber-400 text-sm">🏆 {score} Puan</td>
                                                        </tr>
                                                    ))
                                                )}
                                            </tbody>
                                        </table>
                                    );
                                })()}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* ============================================================ */}
            {/* MODAL 0: EKİP ORGANİZASYON & HİYERARŞİ ŞEMASI MODALI (YENİ!) */}
            {/* ============================================================ */}
            {isOrgChartModalOpen && (
                <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
                    <div className="bg-slate-850 border border-slate-700 rounded-3xl w-full max-w-4xl overflow-hidden shadow-2xl animate-in fade-in flex flex-col max-h-[92vh]">
                        {/* BAŞLIK */}
                        <div className="p-5 border-b border-slate-700 flex justify-between items-center bg-slate-900 shrink-0">
                            <div>
                                <h3 className="font-black text-base text-white flex items-center gap-2">
                                    <Users className="w-5 h-5 text-purple-400" /> Ekip Organizasyon & Hiyerarşi Şeması
                                </h3>
                                <p className="text-xs text-slate-400 mt-0.5">
                                    Ekip lideri, CAM programcıları ve tezgah operatörlerinin görsel hiyerarşi ağacı.
                                </p>
                            </div>
                            <button onClick={() => setIsOrgChartModalOpen(false)} className="p-1.5 text-slate-400 hover:text-white rounded-lg">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* EKİP SEÇİM PİLLERİ */}
                        <div className="p-3 bg-slate-950/80 border-b border-slate-800 flex flex-wrap gap-2 shrink-0">
                            {teams.map(t => (
                                <button
                                    key={t.id}
                                    onClick={() => setSelectedOrgTeamId(t.id)}
                                    className={`px-3.5 py-1.5 text-xs font-black rounded-xl transition flex items-center gap-1.5 ${
                                        (selectedOrgTeamId || teams[0]?.id) === t.id
                                            ? 'bg-purple-600 text-white shadow-md'
                                            : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-750'
                                    }`}
                                >
                                    <Crown className="w-3.5 h-3.5" />
                                    {t.name}
                                </button>
                            ))}
                        </div>

                        {/* ŞEMA İÇERİK ALANI */}
                        {(() => {
                            const activeOrgTeam = teams.find(t => t.id === (selectedOrgTeamId || teams[0]?.id)) || teams[0];
                            if (!activeOrgTeam) {
                                return (
                                    <div className="p-12 text-center text-slate-400 italic">
                                        Görüntülenecek ekip bulunamadı.
                                    </div>
                                );
                            }

                            const allMembers = activeOrgTeam.members || [];
                            const camMembers = allMembers.filter(m => String(m.role || '').toLowerCase().includes('cam'));
                            const machineMembers = allMembers.filter(m => !String(m.role || '').toLowerCase().includes('cam'));

                            return (
                                <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-6">
                                    {/* TAKIM BİLGİ ÖZETİ */}
                                    <div className="flex flex-wrap justify-between items-center p-3.5 rounded-2xl bg-gradient-to-r from-purple-950/40 to-slate-900 border border-purple-800/60">
                                        <div>
                                            <span className="text-[11px] font-bold text-purple-400 uppercase tracking-wider">İncelenen Takım</span>
                                            <div className="text-base font-black text-white">{activeOrgTeam.name}</div>
                                        </div>
                                        <div className="flex items-center gap-4 text-xs">
                                            <span className="text-slate-300">👥 <b>{allMembers.length + 1}</b> Personel</span>
                                            <span className="text-amber-400 font-black">🏆 <b>{activeOrgTeam.totalPoints || 0}</b> Kazanılan Puan</span>
                                        </div>
                                    </div>

                                    {/* 1. KADEME: EKİP LİDERİ (EN ÜSTTE MERKEZDE) */}
                                    <div className="flex flex-col items-center">
                                        <div className="p-4 rounded-2xl bg-gradient-to-b from-amber-500/20 to-slate-900 border-2 border-amber-500 shadow-xl w-64 text-center space-y-1.5 relative">
                                            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-amber-500 to-yellow-400 text-slate-950 font-black flex items-center justify-center mx-auto shadow-md">
                                                <Crown className="w-5 h-5" />
                                            </div>
                                            <div className="text-[10px] font-black text-amber-400 uppercase tracking-widest">👑 EKİP LİDERİ</div>
                                            <div className="text-sm font-black text-white">{activeOrgTeam.leader}</div>
                                            <div className="text-[10px] text-slate-400 font-bold">Takım Yönetimi & Puan Dağıtımı</div>
                                        </div>

                                        {/* DİKEY BAĞLANTI ÇİZGİSİ */}
                                        <div className="w-0.5 h-6 bg-gradient-to-b from-amber-500 to-blue-500"></div>
                                    </div>

                                    {/* 2. KADEME: CAM OPERATÖRLERİ (ORTADA) */}
                                    <div className="flex flex-col items-center">
                                        <div className="text-center mb-2">
                                            <span className="text-[11px] font-black text-blue-400 uppercase tracking-wider bg-blue-950/80 px-3 py-1 rounded-full border border-blue-800">
                                                💻 CAM & Programlama Kadrosu ({camMembers.length > 0 ? camMembers.length : 'Lider Harici Yok'})
                                            </span>
                                        </div>

                                        <div className="flex flex-wrap justify-center gap-3 w-full max-w-2xl">
                                            {camMembers.length === 0 ? (
                                                <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-xs text-slate-500 italic">
                                                    Ekipte ayrı bir CAM operatörü tanımlanmamış (Lider CAM sürecini yürütüyor).
                                                </div>
                                            ) : (
                                                camMembers.map((member, idx) => (
                                                    <div key={idx} className="p-3.5 rounded-xl bg-slate-900 border border-blue-500/60 shadow-lg w-56 text-center space-y-1">
                                                        <div className="w-7 h-7 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center mx-auto">
                                                            <Cpu className="w-4 h-4" />
                                                        </div>
                                                        <div className="text-xs font-black text-white">{member.name}</div>
                                                        <div className="text-[10px] text-blue-400 font-bold">{member.role || 'CAM Operatörü'}</div>
                                                    </div>
                                                ))
                                            )}
                                        </div>

                                        {/* DİKEY BAĞLANTI ÇİZGİSİ */}
                                        <div className="w-0.5 h-6 bg-gradient-to-b from-blue-500 to-purple-500 mt-2"></div>
                                    </div>

                                    {/* 3. KADEME: TEZGAH OPERATÖRLERİ (YAN YANA KUTULAR HALİNDE EN ALTTA) */}
                                    <div className="space-y-3 pt-2">
                                        <div className="text-center">
                                            <span className="text-[11px] font-black text-purple-400 uppercase tracking-wider bg-purple-950/80 px-3 py-1 rounded-full border border-purple-800">
                                                ⚙️ Tezgah Operatörleri Kadrosu ({machineMembers.length} Personel)
                                            </span>
                                        </div>

                                        {machineMembers.length === 0 ? (
                                            <div className="p-4 text-center bg-slate-900/60 rounded-xl border border-slate-800 text-xs text-slate-500 italic">
                                                Ekipte kayıtlı tezgah operatörü bulunmuyor.
                                            </div>
                                        ) : (
                                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                                                {machineMembers.map((member, idx) => (
                                                    <div key={idx} className="p-3 rounded-xl bg-slate-900/90 border border-slate-700/80 hover:border-purple-500/60 transition flex flex-col justify-between items-center text-center space-y-1 shadow-md">
                                                        <div className="w-7 h-7 rounded-lg bg-purple-500/20 text-purple-400 flex items-center justify-center">
                                                            <Wrench className="w-4 h-4" />
                                                        </div>
                                                        <div className="text-xs font-extrabold text-slate-100 truncate w-full" title={member.name}>
                                                            {member.name}
                                                        </div>
                                                        <div className="text-[10px] text-slate-400 font-medium">
                                                            {member.role || 'Tezgah Operatörü'}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })()}

                        <div className="p-4 border-t border-slate-700 flex justify-end bg-slate-900 shrink-0">
                            <button
                                onClick={() => setIsOrgChartModalOpen(false)}
                                className="px-5 py-2 bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold rounded-xl transition"
                            >
                                Kapat
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ============================================================ */}
            {/* MODAL 1: YÖNETİCİ ÇOKLU KURAL VE DİNAMİK MANUEL ÇARPAN SATIRLARI MODALI */}
            {/* ============================================================ */}
            {isManagerEvaluationModalOpen && evaluatingTarget && (
                <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-slate-850 border border-slate-700 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl animate-in fade-in flex flex-col max-h-[92vh]">
                        <div className="p-5 border-b border-slate-700 flex justify-between items-center bg-slate-900 shrink-0">
                            <div>
                                <h3 className="font-black text-base text-white flex items-center gap-2">
                                    <FileText className="w-5 h-5 text-blue-400" /> Proje & Ekip Performansı Değerlendirme
                                </h3>
                                <p className="text-xs text-slate-400 mt-0.5">📦 {evaluatingTarget.mold?.moldName} ({evaluatingTarget.mold?.customer || 'Müşteri Yok'})</p>
                            </div>
                            <button onClick={() => setIsManagerEvaluationModalOpen(false)} className="p-1.5 text-slate-400 hover:text-white rounded-lg">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-5 space-y-5 overflow-y-auto custom-scrollbar flex-1">
                            {/* 1. PERFORMANS KISA ÖZET KARTI */}
                            <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-700 space-y-3 shadow-inner">
                                <div className="text-xs font-black text-blue-400 uppercase tracking-wider flex items-center gap-1.5">
                                    <Info className="w-4 h-4" /> Proje İmalat & Termin Performans Özeti
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                                    <div className="p-2.5 rounded-xl bg-slate-850 border border-slate-700/80">
                                        <span className="text-slate-400 text-[11px] block">Termin Başarısı</span>
                                        <span className={`font-black text-xs ${evaluatingTarget.summary.timeInfo.isOverdue ? 'text-rose-400' : 'text-emerald-400'}`}>
                                            {evaluatingTarget.summary.timeInfo.isOverdue ? '❌ Gecikti: ' : '✅ Yetiştirildi: '}
                                            {evaluatingTarget.summary.timeInfo.text}
                                        </span>
                                    </div>

                                    <div className="p-2.5 rounded-xl bg-slate-850 border border-slate-700/80">
                                        <span className="text-slate-400 text-[11px] block">Alt Parça Sayısı</span>
                                        <span className="font-bold text-white text-xs">
                                            {evaluatingTarget.summary.totalParts} Parça ({evaluatingTarget.summary.completedParts} Tamamlandı)
                                        </span>
                                    </div>

                                    <div className="p-2.5 rounded-xl bg-slate-850 border border-slate-700/80">
                                        <span className="text-slate-400 text-[11px] block">İlk Parça Başlama Tarihi</span>
                                        <span className="font-bold text-slate-200 text-xs">
                                            {evaluatingTarget.summary.firstStartDateStr}
                                        </span>
                                    </div>

                                    <div className="p-2.5 rounded-xl bg-slate-850 border border-slate-700/80">
                                        <span className="text-slate-400 text-[11px] block">Son Parça Bitiş Tarihi</span>
                                        <span className="font-bold text-slate-200 text-xs">
                                            {evaluatingTarget.summary.lastFinishDateStr}
                                        </span>
                                    </div>

                                    {/* DIŞARIYA DEVREDİLEN PARÇALAR VE OTOMATİK PUAN KESİNTİSİ */}
                                    <div className="sm:col-span-2 p-2.5 rounded-xl bg-slate-850 border border-slate-700/80 flex justify-between items-center">
                                        <div>
                                            <span className="text-slate-400 text-[11px] block">Dışarıya Devredilen Parçalar & Kesinti</span>
                                            <span className={`font-bold text-xs ${evaluatingTarget.summary.transferredOutPoints > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                                                {evaluatingTarget.summary.transferredOutPoints > 0 
                                                    ? `${evaluatingTarget.summary.transferredOutCount} parça başka takımlara devredildi (-${evaluatingTarget.summary.transferredOutPoints} Puan baz puandan otomatik düşüldü)` 
                                                    : 'Hiçbir parça devredilmedi (0 Puan kesinti)'}
                                            </span>
                                        </div>
                                        <span className="text-base">🔄</span>
                                    </div>
                                </div>
                            </div>

                            {/* 2. STANDART KURALLAR (CHECKBOX) */}
                            <div className="space-y-4">
                                <div className="text-xs font-black text-slate-300 uppercase tracking-wider flex items-center justify-between">
                                    <span>⚖️ Uygulanacak Sistem Kuralları (Tik Atarak Seçiniz)</span>
                                </div>

                                <div className="grid grid-cols-1 gap-2">
                                    {rules.map(rule => {
                                        const isChecked = (managerEvalForm.selectedRuleIds || []).includes(rule.id);
                                        return (
                                            <div 
                                                key={rule.id}
                                                onClick={() => handleToggleRuleInEvaluation(rule.id)}
                                                className={`p-3 rounded-xl border text-xs font-bold flex justify-between items-center cursor-pointer transition select-none ${
                                                    isChecked 
                                                        ? (rule.type === 'BONUS' ? 'bg-emerald-950/60 border-emerald-500 text-emerald-100 shadow-md' : 'bg-rose-950/60 border-rose-500 text-rose-100 shadow-md')
                                                        : 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800'
                                                }`}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-5 h-5 rounded-lg flex items-center justify-center border transition ${
                                                        isChecked 
                                                            ? (rule.type === 'BONUS' ? 'bg-emerald-500 border-emerald-400 text-slate-950' : 'bg-rose-500 border-rose-400 text-white')
                                                            : 'border-slate-600 bg-slate-800 text-transparent'
                                                    }`}>
                                                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                                                    </div>
                                                    <div>
                                                        <div className="font-extrabold text-sm">{rule.title}</div>
                                                        {rule.description && <div className="text-[11px] text-slate-400 mt-0.5">{rule.description}</div>}
                                                    </div>
                                                </div>

                                                <span className={`px-2.5 py-1 rounded-full text-xs font-black shrink-0 ${
                                                    rule.type === 'BONUS' ? 'bg-emerald-900/80 text-emerald-300 border border-emerald-700' : 'bg-rose-900/80 text-rose-300 border border-rose-700'
                                                }`}>
                                                    {rule.type === 'BONUS' ? `+ %${rule.percentage} Bonus` : `- %${rule.percentage} Ceza`}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* 3. DİNAMİK MANUEL ÇARPAN / BONUS-CEZA SATIRLARI */}
                                <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-700 space-y-3">
                                    <div className="flex justify-between items-center">
                                        <span className="text-xs font-black text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                                            <Sparkles className="w-3.5 h-3.5 text-amber-400" /> Manuel Bonus / Ceza Çarpanları
                                        </span>
                                        <button
                                            type="button"
                                            onClick={handleAddCustomAdjustmentRow}
                                            className="px-2.5 py-1 bg-blue-600/30 hover:bg-blue-600/50 text-blue-400 hover:text-blue-300 border border-blue-500/40 rounded-lg text-xs font-bold transition flex items-center gap-1"
                                        >
                                            <Plus className="w-3.5 h-3.5" /> Manuel Çarpan Ekle
                                        </button>
                                    </div>

                                    <div className="space-y-2 max-h-56 overflow-y-auto custom-scrollbar p-1">
                                        {managerEvalForm.customAdjustments.length === 0 ? (
                                            <div className="p-3 text-center bg-slate-950/60 rounded-xl border border-slate-800 text-slate-500 text-xs italic">
                                                Henüz manuel çarpan eklenmedi. Yukarıdaki "Manuel Çarpan Ekle" butonu ile ekleyebilirsiniz.
                                            </div>
                                        ) : (
                                            managerEvalForm.customAdjustments.map((row) => (
                                                <div key={row.id} className="p-2.5 rounded-xl bg-slate-950 border border-slate-700/80 flex flex-wrap sm:flex-nowrap items-center gap-2">
                                                    <div 
                                                        onClick={() => handleUpdateCustomAdjustmentRow(row.id, 'isChecked', !row.isChecked)}
                                                        className={`w-5 h-5 rounded-lg flex items-center justify-center border cursor-pointer shrink-0 transition ${
                                                            row.isChecked 
                                                                ? (row.type === 'BONUS' ? 'bg-emerald-500 border-emerald-400 text-slate-950' : 'bg-rose-500 border-rose-400 text-white')
                                                                : 'border-slate-600 bg-slate-900 text-transparent'
                                                        }`}
                                                        title="Bu çarpanı puana etki ettirmek için tikleyin"
                                                    >
                                                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                                                    </div>

                                                    <input 
                                                        type="text"
                                                        placeholder="Açıklama (Örn: Titiz İşçilik)"
                                                        value={row.description}
                                                        onChange={e => handleUpdateCustomAdjustmentRow(row.id, 'description', e.target.value)}
                                                        className="flex-1 min-w-[140px] p-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs font-bold text-white focus:ring-1 focus:ring-blue-500"
                                                    />

                                                    <select
                                                        value={row.type}
                                                        onChange={e => handleUpdateCustomAdjustmentRow(row.id, 'type', e.target.value)}
                                                        className={`p-1.5 bg-slate-900 border rounded-lg text-xs font-black shrink-0 ${
                                                            row.type === 'BONUS' ? 'text-emerald-400 border-emerald-800' : 'text-rose-400 border-rose-800'
                                                        }`}
                                                    >
                                                        <option value="BONUS">🟢 BONUS (+)</option>
                                                        <option value="PENALTY">🔴 CEZA (-)</option>
                                                    </select>

                                                    <div className="flex items-center gap-1 shrink-0">
                                                        <span className="text-xs font-black text-slate-400">%</span>
                                                        <input 
                                                            type="number"
                                                            min="1"
                                                            max="100"
                                                            placeholder="%"
                                                            value={row.percentage || ''}
                                                            onChange={e => handleUpdateCustomAdjustmentRow(row.id, 'percentage', parseInt(e.target.value) || 0)}
                                                            className="w-14 p-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs font-black text-amber-400 text-center"
                                                        />
                                                    </div>

                                                    <button
                                                        type="button"
                                                        onClick={() => handleDeleteCustomAdjustmentRow(row.id)}
                                                        className="p-1.5 text-slate-400 hover:text-red-400 rounded-lg hover:bg-slate-900 transition shrink-0"
                                                        title="Çarpanı Kaldır"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>

                                {/* 4. NİHAİ ONAYLANAN PUAN KARTI */}
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 mb-1">
                                        Nihai Onaylanan Toplam Puan (Ekibe Dağıtılacak Tutar) *
                                    </label>
                                    <div className="p-4 rounded-2xl bg-amber-950/40 border border-amber-700 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 shadow-lg">
                                        <div>
                                            <span className="text-xs font-bold text-amber-300 block">Ekibin Kazanacağı Nihai Puan:</span>
                                            <span className="text-[11px] text-slate-400">
                                                İlk Baz: {managerEvalForm.baseScore} 
                                                {evaluatingTarget.summary.transferredOutPoints > 0 && ` - ${evaluatingTarget.summary.transferredOutPoints} Devir Kesintisi`}
                                                {` | Çarpanlarla otomatik hesaplandı`}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <input 
                                                type="number"
                                                min="0"
                                                value={managerEvalForm.managerFinalScore}
                                                onChange={e => setManagerEvalForm({ ...managerEvalForm, managerFinalScore: parseInt(e.target.value) || 0 })}
                                                className="w-24 p-2 bg-slate-900 border-2 border-amber-500 rounded-xl text-base font-black text-amber-400 text-center shadow-inner"
                                            />
                                            <span className="text-sm font-black text-amber-400">Puan</span>
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-400 mb-1">Yönetici Değerlendirme Yorumu / Notu</label>
                                    <textarea 
                                        rows={2}
                                        placeholder="Örn: Ekip zamanında bitirdi, parça transferi az oldu, tebrikler..."
                                        value={managerEvalForm.managerNotes}
                                        onChange={e => setManagerEvalForm({ ...managerEvalForm, managerNotes: e.target.value })}
                                        className="w-full p-2.5 bg-slate-900 border border-slate-700 rounded-xl text-xs font-medium text-white focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="p-4 border-t border-slate-700 flex justify-end gap-2 bg-slate-900 shrink-0">
                            <button
                                type="button"
                                onClick={() => setIsManagerEvaluationModalOpen(false)}
                                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-bold rounded-xl"
                            >
                                İptal
                            </button>
                            <button
                                type="button"
                                onClick={handleSaveManagerEvaluation}
                                className="px-5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-black rounded-xl shadow-md flex items-center gap-1.5"
                            >
                                <Check className="w-4 h-4" /> Değerlendirmeyi Onayla ve Ekip Dağıtımına Aç
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ============================================================ */}
            {/* MODAL 2: EKİP (TAKIM) KURMA / DÜZENLEME MODALI */}
            {/* ============================================================ */}
            {isTeamModalOpen && (
                <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-slate-850 border border-slate-700 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl animate-in fade-in flex flex-col max-h-[90vh]">
                        <div className="p-5 border-b border-slate-700 flex justify-between items-center bg-slate-900 shrink-0">
                            <h3 className="font-black text-base text-white flex items-center gap-2">
                                <Users className="w-5 h-5 text-purple-400" /> 
                                {editingTeam ? 'Ekibi (Takımı) Düzenle' : 'Yeni Ekip (Takım) Kur'}
                            </h3>
                            <button onClick={() => setIsTeamModalOpen(false)} className="p-1.5 text-slate-400 hover:text-white rounded-lg">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={handleSaveTeam} className="p-5 space-y-4 overflow-y-auto custom-scrollbar flex-1">
                            <div>
                                <label className="block text-xs font-bold text-slate-400 mb-1">Takım Adı *</label>
                                <input 
                                    type="text"
                                    required
                                    placeholder="Örn: 1. Takım veya Alfa Ekibi"
                                    value={teamForm.name}
                                    onChange={e => setTeamForm({ ...teamForm, name: e.target.value })}
                                    className="w-full p-2.5 bg-slate-900 border border-slate-700 rounded-xl text-xs font-bold text-white focus:ring-2 focus:ring-purple-500"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-400 mb-1">Ekip Lideri (Yazarak Arayın) *</label>
                                <SearchableSelect 
                                    options={personnel}
                                    value={teamForm.leader}
                                    onChange={val => setTeamForm({ ...teamForm, leader: val })}
                                    placeholder="-- Lider Seçiniz --"
                                    searchPlaceholder="Lider ara (İsim / Rol)..."
                                    getOptionLabel={p => p.name}
                                    getOptionValue={p => p.name}
                                    getOptionSub={p => p.role || 'Personel'}
                                />
                            </div>

                            <div>
                                <div className="flex justify-between items-center mb-1.5">
                                    <label className="text-xs font-bold text-slate-400">Ekip Üyeleri (Kutulu & Arama Seçenekli)</label>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setTeamForm({
                                                ...teamForm,
                                                members: [...teamForm.members, { name: '', role: 'CAM Operatörü' }]
                                            });
                                        }}
                                        className="text-xs font-black text-purple-400 hover:text-purple-300 flex items-center gap-1"
                                    >
                                        <Plus className="w-3.5 h-3.5" /> Ekip Üyesi Ekle
                                    </button>
                                </div>

                                <div className="space-y-2 max-h-56 overflow-y-auto custom-scrollbar p-1">
                                    {teamForm.members.length === 0 ? (
                                        <div className="p-3 text-center bg-slate-900/50 rounded-xl border border-slate-800 text-slate-500 text-xs italic">
                                            Henüz üye eklenmedi. Yukarıdaki "Ekip Üyesi Ekle" butonuna basarak üye kutuları açabilirsiniz.
                                        </div>
                                    ) : (
                                        teamForm.members.map((member, idx) => (
                                            <div key={idx} className="p-2.5 rounded-xl bg-slate-900 border border-slate-700/80 flex items-center gap-2">
                                                <div className="flex-1">
                                                    <SearchableSelect 
                                                        options={personnel}
                                                        value={member.name}
                                                        onChange={(val, selectedPerson) => {
                                                            const updated = [...teamForm.members];
                                                            updated[idx] = {
                                                                name: val,
                                                                role: selectedPerson?.role || member.role || 'Operatör'
                                                            };
                                                            setTeamForm({ ...teamForm, members: updated });
                                                        }}
                                                        placeholder="Personel seçiniz..."
                                                        searchPlaceholder="Personel ara..."
                                                        getOptionLabel={p => p.name}
                                                        getOptionValue={p => p.name}
                                                        getOptionSub={p => p.role || 'Personel'}
                                                    />
                                                </div>

                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const updated = teamForm.members.filter((_, i) => i !== idx);
                                                        setTeamForm({ ...teamForm, members: updated });
                                                    }}
                                                    className="p-2 text-slate-400 hover:text-red-400 rounded-lg hover:bg-slate-800 transition"
                                                    title="Üyeyi Kaldır"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>

                            <div className="flex justify-end gap-2 pt-3 border-t border-slate-700">
                                <button
                                    type="button"
                                    onClick={() => setIsTeamModalOpen(false)}
                                    className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-bold rounded-xl"
                                >
                                    İptal
                                </button>
                                <button
                                    type="submit"
                                    className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-black rounded-xl shadow-md"
                                >
                                    Kaydet
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ============================================================ */}
            {/* MODAL 3: DEĞERLENDİRMEYE PROJE EKLE MODALI (HAVUZ DESTEKLİ) */}
            {/* ============================================================ */}
            {isAddMoldModalOpen && (
                <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-slate-850 border border-slate-700 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl animate-in fade-in">
                        <div className="p-5 border-b border-slate-700 flex justify-between items-center bg-slate-900">
                            <h3 className="font-black text-base text-white flex items-center gap-2">
                                <Plus className="w-5 h-5 text-blue-400" /> Değerlendirmeye Proje Ekle
                            </h3>
                            <button onClick={() => setIsAddMoldModalOpen(false)} className="p-1.5 text-slate-400 hover:text-white rounded-lg">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={handleAddMoldToEvaluation} className="p-5 space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-400 mb-1">Kalıp Seçiniz (Yazarak Arayın) *</label>
                                <SearchableSelect 
                                    options={projects}
                                    value={addMoldForm.moldId}
                                    onChange={(val, selectedMold) => {
                                        setAddMoldForm({
                                            ...addMoldForm,
                                            moldId: val,
                                            targetDeadline: selectedMold?.moldDeadline || ''
                                        });
                                    }}
                                    placeholder="-- Kalıp Seçiniz --"
                                    searchPlaceholder="Kalıp adı veya müşteri ara..."
                                    getOptionLabel={p => p.moldName}
                                    getOptionValue={p => p.id}
                                    getOptionSub={p => `Müşteri: ${p.customer || '---'}`}
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 mb-1">Baz Puan *</label>
                                    <input 
                                        type="number"
                                        min="1"
                                        required
                                        placeholder="Örn: 80"
                                        value={addMoldForm.baseScore}
                                        onChange={e => setAddMoldForm({ ...addMoldForm, baseScore: e.target.value })}
                                        className="w-full p-2.5 bg-slate-900 border border-slate-700 rounded-xl text-xs font-black text-amber-400 focus:ring-2 focus:ring-amber-500"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-400 mb-1">Hedef Termin Tarihi</label>
                                    <input 
                                        type="date"
                                        value={addMoldForm.targetDeadline ? addMoldForm.targetDeadline.slice(0, 10) : ''}
                                        onChange={e => setAddMoldForm({ ...addMoldForm, targetDeadline: e.target.value })}
                                        className="w-full p-2.5 bg-slate-900 border border-slate-700 rounded-xl text-xs font-bold text-white focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>
                            </div>

                            {addMoldForm.targetDeadline && (
                                <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-700 flex items-center justify-between">
                                    <span className="text-xs font-bold text-slate-400">Bugünden İtibaren Kalan Süre:</span>
                                    <span className="text-xs font-black text-emerald-400">
                                        {calculateWeeksAndDays(addMoldForm.targetDeadline).text}
                                    </span>
                                </div>
                            )}

                            <div>
                                <label className="block text-xs font-bold text-slate-400 mb-1">
                                    Sorumlu Ekip Ataması (Boş bırakılırsa Açık Havuzda başlar)
                                </label>
                                <select
                                    value={addMoldForm.assignedTeamId}
                                    onChange={e => setAddMoldForm({ ...addMoldForm, assignedTeamId: e.target.value })}
                                    className="w-full p-2.5 bg-slate-900 border border-slate-700 rounded-xl text-xs font-bold text-purple-300 focus:ring-2 focus:ring-purple-500"
                                >
                                    <option value="">🌐 Açık Proje Havuzuna Bırak (Takımlar Talep Etsin)</option>
                                    {teams.map(t => (
                                        <option key={t.id} value={t.id}>{t.name} (Lider: {t.leader})</option>
                                    ))}
                                </select>
                            </div>

                            <div className="flex justify-end gap-2 pt-3 border-t border-slate-700">
                                <button
                                    type="button"
                                    onClick={() => setIsAddMoldModalOpen(false)}
                                    className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-bold rounded-xl"
                                >
                                    İptal
                                </button>
                                <button
                                    type="submit"
                                    className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black rounded-xl shadow-md"
                                >
                                    Listeye / Havuza Ekle
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ============================================================ */}
            {/* MODAL 4: DİNAMİK KURAL YÖNETİM MODALI */}
            {/* ============================================================ */}
            {isRulesModalOpen && (
                <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-slate-850 border border-slate-700 rounded-3xl w-full max-w-xl overflow-hidden shadow-2xl animate-in fade-in flex flex-col max-h-[90vh]">
                        <div className="p-5 border-b border-slate-700 flex justify-between items-center bg-slate-900 shrink-0">
                            <h3 className="font-black text-base text-white flex items-center gap-2">
                                <Settings className="w-5 h-5 text-blue-400" /> Termin Bonus & Ceza Kuralları Yönetimi
                            </h3>
                            <button onClick={() => setIsRulesModalOpen(false)} className="p-1.5 text-slate-400 hover:text-white rounded-lg">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-5 space-y-5 overflow-y-auto custom-scrollbar flex-1">
                            <div className="space-y-2">
                                <label className="block text-xs font-black text-slate-400 uppercase tracking-wider">Tanımlı Kurallar ({tempRules.length})</label>
                                
                                {tempRules.map((rule, idx) => (
                                    <div key={rule.id || idx} className="p-3.5 rounded-2xl bg-slate-900 border border-slate-700/80 flex justify-between items-center">
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className="font-black text-xs text-white">{rule.title}</span>
                                                <span className={`px-2 py-0.5 rounded text-[10px] font-black ${
                                                    rule.type === 'BONUS' 
                                                        ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' 
                                                        : 'bg-rose-950 text-rose-400 border border-rose-800'
                                                }`}>
                                                    {rule.type === 'BONUS' ? `+ %${rule.percentage} Bonus` : `- %${rule.percentage} Ceza`}
                                                </span>
                                            </div>
                                            {rule.description && <div className="text-[11px] text-slate-400 mt-0.5">{rule.description}</div>}
                                        </div>

                                        <button
                                            type="button"
                                            onClick={() => handleDeleteRule(rule.id)}
                                            className="p-1.5 text-slate-400 hover:text-red-400 rounded-lg hover:bg-slate-800 transition"
                                            title="Kuralı Sil"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))}
                            </div>

                            <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-700/80 space-y-3">
                                <div className="text-xs font-black text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                                    <Plus className="w-4 h-4 text-blue-400" /> Yeni Kural Ekle
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    <div className="sm:col-span-2">
                                        <input 
                                            type="text"
                                            placeholder="Kural Başlığı (Örn: Zamanında Teslimat Bonusu)"
                                            value={newRuleForm.title}
                                            onChange={e => setNewRuleForm({ ...newRuleForm, title: e.target.value })}
                                            className="w-full p-2 bg-slate-950 border border-slate-700 rounded-xl text-xs font-bold text-white focus:ring-1 focus:ring-blue-500"
                                        />
                                    </div>

                                    <div>
                                        <select
                                            value={newRuleForm.type}
                                            onChange={e => setNewRuleForm({ ...newRuleForm, type: e.target.value })}
                                            className="w-full p-2 bg-slate-950 border border-slate-700 rounded-xl text-xs font-bold text-white focus:ring-1 focus:ring-blue-500"
                                        >
                                            <option value="BONUS">🟢 BONUS (+)</option>
                                            <option value="PENALTY">🔴 CEZA (-)</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    <div>
                                        <div className="flex items-center gap-1">
                                            <input 
                                                type="number"
                                                min="1"
                                                max="100"
                                                placeholder="Oran (%)"
                                                value={newRuleForm.percentage}
                                                onChange={e => setNewRuleForm({ ...newRuleForm, percentage: e.target.value })}
                                                className="w-full p-2 bg-slate-950 border border-slate-700 rounded-xl text-xs font-black text-amber-400 text-center"
                                            />
                                            <span className="text-xs font-black text-slate-400">%</span>
                                        </div>
                                    </div>

                                    <div className="sm:col-span-2">
                                        <input 
                                            type="text"
                                            placeholder="Açıklama (İsteğe bağlı)"
                                            value={newRuleForm.description}
                                            onChange={e => setNewRuleForm({ ...newRuleForm, description: e.target.value })}
                                            className="w-full p-2 bg-slate-950 border border-slate-700 rounded-xl text-xs font-bold text-white"
                                        />
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    onClick={handleAddNewRule}
                                    className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-blue-400 hover:text-blue-300 border border-blue-500/30 rounded-xl text-xs font-black transition flex items-center justify-center gap-1.5"
                                >
                                    <Plus className="w-3.5 h-3.5" /> Kuralı Listeye Ekle
                                </button>
                            </div>
                        </div>

                        <div className="p-4 border-t border-slate-700 flex justify-end gap-2 bg-slate-900 shrink-0">
                            <button
                                type="button"
                                onClick={() => setIsRulesModalOpen(false)}
                                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-bold rounded-xl"
                            >
                                İptal
                            </button>
                            <button
                                type="button"
                                onClick={handleSaveRules}
                                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black rounded-xl shadow-md"
                            >
                                Tüm Kuralları Kaydet
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ============================================================ */}
            {/* MODAL 5: EKİP İÇİ PUAN DAĞITIM MODALI (CAM VE LİDERLER) */}
            {/* ============================================================ */}
            {isDistributeModalOpen && distributingMold && (
                <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-slate-850 border border-slate-700 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl animate-in fade-in">
                        <div className="p-5 border-b border-slate-700 flex justify-between items-center bg-slate-900">
                            <div>
                                <h3 className="font-black text-base text-white flex items-center gap-2">
                                    <Award className="w-5 h-5 text-amber-400" /> Ekip İçi Bireysel Puan Dağıtımı
                                </h3>
                                <p className="text-xs text-slate-400 mt-0.5">📦 {distributingMold.mold?.moldName}</p>
                            </div>
                            <button onClick={() => setIsDistributeModalOpen(false)} className="p-1.5 text-slate-400 hover:text-white rounded-lg">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-5 space-y-4">
                            <div className="p-3.5 bg-amber-950/40 border border-amber-800/60 rounded-2xl flex justify-between items-center">
                                <span className="text-xs font-bold text-amber-300">Yönetici Onaylı Dağıtılacak Toplam Puan:</span>
                                <span className="text-xl font-black text-amber-400">
                                    🏆 {distributingMold.evaluation?.managerFinalScore !== undefined ? distributingMold.evaluation.managerFinalScore : distributingMold.calculated?.finalScore} Puan
                                </span>
                            </div>

                            <div className="space-y-2">
                                <label className="block text-xs font-bold text-slate-400">Ekip Üyelerine Puan Paylaştırma:</label>
                                <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar p-1">
                                    {Object.keys(distributeScores).map(personName => (
                                        <div key={personName} className="p-2.5 rounded-xl bg-slate-900 border border-slate-700 flex justify-between items-center">
                                            <span className="font-bold text-xs text-white">{personName}</span>
                                            <div className="flex items-center gap-1">
                                                <input 
                                                    type="number"
                                                    min="0"
                                                    value={distributeScores[personName] || ''}
                                                    onChange={e => setDistributeScores({ ...distributeScores, [personName]: parseInt(e.target.value) || 0 })}
                                                    className="w-20 p-1.5 bg-slate-800 border border-slate-600 rounded-lg text-xs font-black text-amber-400 text-center focus:ring-2 focus:ring-amber-500"
                                                />
                                                <span className="text-xs text-slate-400 font-bold">Puan</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="flex justify-between items-center text-xs font-bold text-slate-400 pt-2">
                                <span>Toplam Dağıtılan: <b className="text-white">{Object.values(distributeScores).reduce((a, b) => a + (parseInt(b) || 0), 0)} Puan</b></span>
                                <span>Kalan: <b className="text-amber-400">{(distributingMold.evaluation?.managerFinalScore !== undefined ? distributingMold.evaluation.managerFinalScore : distributingMold.calculated?.finalScore) - Object.values(distributeScores).reduce((a, b) => a + (parseInt(b) || 0), 0)} Puan</b></span>
                            </div>

                            <div className="flex justify-end gap-2 pt-2 border-t border-slate-700">
                                <button
                                    type="button"
                                    onClick={() => setIsDistributeModalOpen(false)}
                                    className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-bold rounded-xl"
                                >
                                    İptal
                                </button>
                                <button
                                    type="button"
                                    onClick={handleSavePointDistribution}
                                    className="px-5 py-2 bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-600 hover:to-yellow-500 text-slate-950 font-black text-xs rounded-xl shadow-md"
                                >
                                    Puanları Onayla ve Dağıt
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ============================================================ */}
            {/* MODAL 6: PARÇA TRANSFER TEKLİFİ MODALI */}
            {/* ============================================================ */}
            {isTransferModalOpen && (
                <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-slate-850 border border-slate-700 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl animate-in fade-in">
                        <div className="p-5 border-b border-slate-700 flex justify-between items-center bg-slate-900">
                            <h3 className="font-black text-base text-white flex items-center gap-2">
                                <ArrowRightLeft className="w-5 h-5 text-amber-400" /> Parça Transfer Teklifi Oluştur
                            </h3>
                            <button onClick={() => setIsTransferModalOpen(false)} className="p-1.5 text-slate-400 hover:text-white rounded-lg">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={handleCreateTransferOffer} className="p-5 space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-400 mb-1">Kalıp Seçiniz (Yazarak Arayın) *</label>
                                <SearchableSelect 
                                    options={projects}
                                    value={transferForm.moldId}
                                    onChange={(val, selectedM) => {
                                        setTransferForm({
                                            ...transferForm,
                                            moldId: val,
                                            moldName: selectedM?.moldName || '',
                                            taskId: '',
                                            partName: ''
                                        });
                                    }}
                                    placeholder="-- Kalıp Seçiniz --"
                                    searchPlaceholder="Kalıp adı ara..."
                                    getOptionLabel={p => p.moldName}
                                    getOptionValue={p => p.id}
                                    getOptionSub={p => `Müşteri: ${p.customer || '---'}`}
                                />
                            </div>

                            {transferForm.moldId && (
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 mb-1">Devredilecek Parça *</label>
                                    <select
                                        required
                                        value={transferForm.taskId}
                                        onChange={e => {
                                            const m = projectMap.get(transferForm.moldId);
                                            const t = (m?.tasks || []).find(task => task.id === e.target.value);
                                            setTransferForm({
                                                ...transferForm,
                                                taskId: e.target.value,
                                                partName: getTaskDisplayName(t)
                                            });
                                        }}
                                        className="w-full p-2.5 bg-slate-900 border border-slate-700 rounded-xl text-xs font-bold text-white focus:ring-2 focus:ring-amber-500"
                                    >
                                        <option value="">-- Parça Seçiniz --</option>
                                        {(projectMap.get(transferForm.moldId)?.tasks || []).map(t => (
                                            <option key={t.id} value={t.id}>{getTaskDisplayName(t)}</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 mb-1">Devredilecek Puan *</label>
                                    <input 
                                        type="number"
                                        min="1"
                                        required
                                        value={transferForm.pointsOffered}
                                        onChange={e => setTransferForm({ ...transferForm, pointsOffered: e.target.value })}
                                        className="w-full p-2.5 bg-slate-900 border border-slate-700 rounded-xl text-xs font-black text-amber-400 focus:ring-2 focus:ring-amber-500"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-400 mb-1">Hedef *</label>
                                    <select
                                        value={transferForm.toTeamId}
                                        onChange={e => setTransferForm({ ...transferForm, toTeamId: e.target.value })}
                                        className="w-full p-2.5 bg-slate-900 border border-slate-700 rounded-xl text-xs font-bold text-purple-300 focus:ring-2 focus:ring-purple-500"
                                    >
                                        <option value="PUBLIC_POOL">🌐 Açık Transfer Havuzu (Herkes)</option>
                                        {teams.filter(t => t.id !== transferForm.fromTeamId).map(t => (
                                            <option key={t.id} value={t.id}>{t.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-400 mb-1">Açıklama / Not</label>
                                <textarea 
                                    rows={2}
                                    placeholder="Örn: Tel erezyon işi kaldı, yetişmesi için devrediyoruz..."
                                    value={transferForm.note}
                                    onChange={e => setTransferForm({ ...transferForm, note: e.target.value })}
                                    className="w-full p-2.5 bg-slate-900 border border-slate-700 rounded-xl text-xs font-medium text-white focus:ring-2 focus:ring-amber-500"
                                />
                            </div>

                            <div className="flex justify-end gap-2 pt-2 border-t border-slate-700">
                                <button
                                    type="button"
                                    onClick={() => setIsTransferModalOpen(false)}
                                    className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-bold rounded-xl"
                                >
                                    İptal
                                </button>
                                <button
                                    type="submit"
                                    className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-black rounded-xl shadow-md"
                                >
                                    Teklifi Yayınla
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ProjectEvaluationPage;
