// src/components/Analysis/CamMonthlyComparisonTab.js

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { collection, doc, setDoc, query, onSnapshot } from '../../config/firebase.js';
import { PROJECT_COLLECTION, MACHINES_COLLECTION, CAM_SETTINGS_COLLECTION } from '../../config/constants.js';
import { 
    ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    LabelList
} from 'recharts';
import { 
    Calendar, TrendingUp, Clock, Monitor, Box, User, ArrowUpRight, 
    Layers, Zap, BarChart3, Filter, ChevronRight, CheckCircle2, 
    Calculator, Award, Sparkles, ChevronDown, ChevronUp, Search, Info, ShieldAlert,
    PauseCircle, PlayCircle, Cpu, CheckSquare, Square, X, Check, Save, CloudCheck
} from 'lucide-react';

const MONTH_NAMES = [
    "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
    "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"
];

// Hariç tutulacak tezgahlar: K41, K60, K65
const isExcludedMachine = (machineName) => {
    if (!machineName) return false;
    const clean = String(machineName).replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    return clean === 'k41' || clean === 'k60' || clean === 'k65';
};

const parseSafeDate = (dateVal) => {
    if (!dateVal) return null;
    let d = null;
    if (typeof dateVal === 'object' && typeof dateVal.seconds === 'number') {
        d = new Date(dateVal.seconds * 1000);
    } else if (typeof dateVal === 'object' && typeof dateVal.toDate === 'function') {
        d = dateVal.toDate();
    } else {
        d = new Date(dateVal);
    }
    if (!d || isNaN(d.getTime())) return null;
    return d;
};

export const CamMonthlyComparisonTab = ({ db, projects: initialProjects = [], loggedInUser }) => {
    const [logs, setLogs] = useState([]);
    const [liveProjects, setLiveProjects] = useState(initialProjects || []);
    const [rawMachines, setRawMachines] = useState([]);
    
    // Filtre State'leri
    const [selectedYear, setSelectedYear] = useState(() => new Date().getFullYear().toString());
    const [selectedOperator, setSelectedOperator] = useState('ALL');
    const [selectedMachines, setSelectedMachines] = useState([]); // Buluttan gelecek veya tümü
    const [hasLoadedSavedSettings, setHasLoadedSavedSettings] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [saveSuccessNotice, setSaveSuccessNotice] = useState(false);

    const [machineDropdownOpen, setMachineDropdownOpen] = useState(false);
    const [machineSearchTerm, setMachineSearchTerm] = useState('');
    const machineDropdownRef = useRef(null);

    const [selectedMonthDetail, setSelectedMonthDetail] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');

    // Dışarı tıklandığında tezgah açılır menüsünü kapat
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (machineDropdownRef.current && !machineDropdownRef.current.contains(event.target)) {
                setMachineDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // 1. CAM Loglarını Dinle
    useEffect(() => {
        if (!db) return;
        const q = query(collection(db, 'cam_operator_logs'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setLogs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });
        return () => unsubscribe();
    }, [db]);

    // 2. Proje ve Kalıp İmalat Verilerini Canlı Dinle
    useEffect(() => {
        if (!db) return;
        try {
            const q = query(collection(db, PROJECT_COLLECTION));
            const unsubscribe = onSnapshot(q, (snapshot) => {
                const molds = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setLiveProjects(molds);
            }, (err) => {
                console.warn("Molds snapshot error:", err);
            });
            return () => unsubscribe();
        } catch (e) {
            console.warn("Molds setup error:", e);
        }
    }, [db]);

    // 3. Tezgah Tanımlarını Dinle
    useEffect(() => {
        if (!db) return;
        try {
            const q = query(collection(db, MACHINES_COLLECTION));
            const unsubscribe = onSnapshot(q, (snapshot) => {
                const list = snapshot.docs.map(doc => {
                    const data = doc.data();
                    return data.name || data.id || doc.id;
                });
                setRawMachines(list);
            }, (err) => {
                console.warn("Machines snapshot error:", err);
            });
            return () => unsubscribe();
        } catch (e) {
            console.warn("Machines setup error:", e);
        }
    }, [db]);

    // 4. BULUTTAN KAYITLI TEZGAH FİLTRESİNİ CANLI DİNLE (TÜM CİHAZLAR VE KULLANICILAR İÇİN)
    useEffect(() => {
        if (!db) return;
        try {
            const settingsDocRef = doc(db, CAM_SETTINGS_COLLECTION, 'machineFilterSettings');
            const unsubscribe = onSnapshot(settingsDocRef, (snap) => {
                if (snap.exists()) {
                    const data = snap.data();
                    if (data && Array.isArray(data.selectedMachines)) {
                        setSelectedMachines(data.selectedMachines);
                        setHasLoadedSavedSettings(true);
                    }
                }
            }, (err) => {
                console.warn("Kayıtlı tezgah ayarları okuma uyarısı:", err);
            });
            return () => unsubscribe();
        } catch (e) {
            console.warn("Kayıtlı ayar dinleme hatası:", e);
        }
    }, [db]);

    const activeProjects = liveProjects.length > 0 ? liveProjects : initialProjects;

    // Dinamik Operatör Listesi
    const uniqueOperators = useMemo(() => {
        const ops = new Set();
        logs.forEach(l => { if (l.operatorName) ops.add(l.operatorName); });
        activeProjects.forEach(p => {
            (p.tasks || []).forEach(t => {
                const op = t.assignedOperator || t.camOperator || t.camPreparation?.operator;
                if (op) ops.add(op);
            });
        });
        return Array.from(ops).sort();
    }, [logs, activeProjects]);

    // Dinamik Tezgah Listesi (K41, K60, K65 Otomatik Hariç)
    const uniqueMachines = useMemo(() => {
        const set = new Set();
        rawMachines.forEach(m => {
            if (m && !isExcludedMachine(m) && m !== 'SEÇ') set.add(m);
        });
        activeProjects.forEach(p => {
            (p.tasks || []).forEach(t => {
                if (t.assignedMachine && !isExcludedMachine(t.assignedMachine) && t.assignedMachine !== 'SEÇ') set.add(t.assignedMachine);
                if (t.machine && !isExcludedMachine(t.machine) && t.machine !== 'SEÇ') set.add(t.machine);
                (t.operations || []).forEach(op => {
                    const m = op.machineName || op.machine;
                    if (m && !isExcludedMachine(m) && m !== 'SEÇ') set.add(m);
                });
            });
        });
        logs.forEach(l => {
            if (l.machineName && !isExcludedMachine(l.machineName) && l.machineName !== 'SEÇ') set.add(l.machineName);
        });
        return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    }, [rawMachines, activeProjects, logs]);

    // Eğer veritabanında henüz hiç kayıt yoksa tüm tezgahları varsayılan olarak seç
    useEffect(() => {
        if (!hasLoadedSavedSettings && uniqueMachines.length > 0 && selectedMachines.length === 0) {
            setSelectedMachines(uniqueMachines);
        }
    }, [uniqueMachines, hasLoadedSavedSettings, selectedMachines.length]);

    // Tezgah İzin Kontrol Fonksiyonu (Çoklu Seçim Kontrolü)
    const isMachineAllowed = useMemo(() => {
        const isAll = selectedMachines.length === 0 || selectedMachines.length === uniqueMachines.length;
        const selectedSet = new Set(selectedMachines.map(m => String(m).toLowerCase().trim()));

        return (mName) => {
            if (!mName || mName === '-') return false;
            if (isExcludedMachine(mName)) return false; // K41, K60, K65 daima hariç
            if (isAll) return true;
            return selectedSet.has(String(mName).toLowerCase().trim());
        };
    }, [selectedMachines, uniqueMachines]);

    // Tezgah Çoklu Seçim Fonksiyonları
    const handleToggleMachine = (mName) => {
        if (selectedMachines.includes(mName)) {
            setSelectedMachines(selectedMachines.filter(m => m !== mName));
        } else {
            setSelectedMachines([...selectedMachines, mName]);
        }
    };

    const handleSelectAllMachines = () => {
        setSelectedMachines([...uniqueMachines]);
    };

    const handleClearAllMachines = () => {
        setSelectedMachines([]);
    };

    // UYGULA VE TÜM CİHAZLAR İÇİN VERİTABANINA KALICI KAYDET
    const handleApplyAndSaveToCloud = async () => {
        setIsSaving(true);
        setMachineDropdownOpen(false);
        try {
            if (db) {
                const settingsDocRef = doc(db, CAM_SETTINGS_COLLECTION, 'machineFilterSettings');
                await setDoc(settingsDocRef, {
                    selectedMachines: selectedMachines,
                    updatedAt: new Date().toISOString(),
                    updatedBy: loggedInUser?.name || loggedInUser?.username || 'Kullanıcı'
                }, { merge: true });

                setSaveSuccessNotice(true);
                setTimeout(() => setSaveSuccessNotice(false), 3000);
            }
        } catch (err) {
            console.error("Tezgah filtre ayarları kaydedilemedi:", err);
        } finally {
            setIsSaving(false);
        }
    };

    // Filtrelenmiş Tezgah Listesi (Arama için)
    const filteredMachinesForPicker = useMemo(() => {
        if (!machineSearchTerm.trim()) return uniqueMachines;
        const q = machineSearchTerm.toLowerCase().trim();
        return uniqueMachines.filter(m => m.toLowerCase().includes(q));
    }, [uniqueMachines, machineSearchTerm]);

    const isAllMachinesSelected = selectedMachines.length === uniqueMachines.length && uniqueMachines.length > 0;

    // 12 Aylık CAM vs Tezgah Süresi & Duraklama Süresi Hesaplama (TEZGAH ÇOKLU FİLTRELEME & ZAMAN DİLİMLEME)
    const monthlyData = useMemo(() => {
        const targetYearNum = parseInt(selectedYear);
        const nowMs = Date.now();

        // 12 Ay için başlangıç matrisi ve takvim sınırları
        const months = MONTH_NAMES.map((name, idx) => {
            const start = new Date(targetYearNum, idx, 1, 0, 0, 0, 0);
            const end = new Date(targetYearNum, idx + 1, 0, 23, 59, 59, 999);
            return {
                monthIndex: idx,
                monthNumber: idx + 1,
                monthName: name,
                shortName: name.slice(0, 3),
                startMs: start.getTime(),
                endMs: end.getTime(),
                camHours: 0,
                prepCamHours: 0,
                directCamHours: 0,
                machineHours: 0,
                pauseHours: 0,
                partsCount: 0,
                opsCount: 0,
                multiplier: 0,
                partsListMap: new Map() // Aynı parçayı ay içinde tekilleştirmek için
            };
        });

        // 1. CAM Loglarından Aylık CAM Sürelerini Topla
        logs.forEach(log => {
            if (!log) return;
            const logDate = parseSafeDate(log.date || log.timestamp || log.createdAt);
            if (!logDate) return;

            if (logDate.getFullYear() !== targetYearNum) return;
            if (selectedOperator !== 'ALL' && log.operatorName !== selectedOperator) return;

            // Tezgah Çoklu Filtresi (Eğer tezgah belirtilmişse ve seçili değilse atla)
            if (log.machineName && !isMachineAllowed(log.machineName)) return;

            const mIdx = logDate.getMonth();
            if (mIdx < 0 || mIdx > 11) return;

            const prepMins = log.prepTime || 0;
            const camMins = log.camTime || 0;
            const totalMins = prepMins + camMins;
            const totalHours = totalMins / 60;

            months[mIdx].camHours += totalHours;
            months[mIdx].prepCamHours += prepMins / 60;
            months[mIdx].directCamHours += camMins / 60;
        });

        // 2. Projelerden (Kalıplar & Parçalar) Gerçek İmalat ve Duraklamaları Aylara Dilimle (Time-Slicing)
        activeProjects.forEach(project => {
            const moldName = project.moldName || project.name || `Kalıp #${project.projectNumber || ''}`;
            const tasks = project.tasks || [];

            tasks.forEach(task => {
                const camOp = task.assignedOperator || task.camOperator || task.camPreparation?.operator || 'Belirtilmedi';
                if (selectedOperator !== 'ALL' && camOp !== selectedOperator) return;

                const ops = task.operations || [];
                let primaryMachine = task.assignedMachine || task.machine || '-';

                // CAM Süresi (Proje Görevi Seviyesinde)
                let taskCamHours = 0;
                if (task.actualCamTime) taskCamHours = parseFloat(task.actualCamTime);
                else if (task.camDuration) taskCamHours = parseFloat(task.camDuration);
                else if (task.camPreparation?.duration) taskCamHours = parseFloat(task.camPreparation.duration);

                // Her operasyonu gerçek çalıştığı gün ve aylara paylaştır
                ops.forEach(op => {
                    const mName = op.machineName || op.machine || primaryMachine;
                    
                    // ÇOKLU TEZGAH FİLTRESİ: Seçilmeyen tezgahlar hesaba katılmaz!
                    if (!isMachineAllowed(mName)) return;

                    if (mName && mName !== '-') {
                        primaryMachine = mName;
                    }

                    // Operasyonun Başlangıç ve Bitiş Tarihlerini Çözümle
                    let opStart = parseSafeDate(op.productionStartTime || op.setupStartTime || op.startDate);
                    let opFinish = parseSafeDate(op.finishDate || op.completedDate || op.supervisorReviewDate || op.camOperatorReviewDate);

                    // Eğer başlangıç veya bitiş yoksa parça seviyesinden çek
                    if (!opStart && !opFinish) {
                        opStart = parseSafeDate(task.productionStartTime || task.setupStartTime || task.startDate);
                        opFinish = parseSafeDate(task.completedDate || task.finishDate);
                    }

                    // Eğer hala bitiş yoksa: Eğer duraklamış veya devam ediyorsa şu anki zamana kadar sınırla (en fazla 30 gün)
                    if (opStart && !opFinish) {
                        if (op.status === 'COMPLETED' || op.status === 'TAMAMLANDI') {
                            const recordedHours = parseFloat(op.durationInHours || op.actualDuration || op.duration || 8);
                            opFinish = new Date(opStart.getTime() + recordedHours * 3600000);
                        } else {
                            // Devam eden işleri şu anki zamanla sınırla (aşırı şişmeyi önler)
                            const maxLimitMs = opStart.getTime() + (30 * 24 * 3600000);
                            opFinish = new Date(Math.min(nowMs, maxLimitMs));
                        }
                    } else if (!opStart && opFinish) {
                        const recordedHours = parseFloat(op.durationInHours || op.actualDuration || op.duration || 8);
                        opStart = new Date(opFinish.getTime() - recordedHours * 3600000);
                    }

                    if (!opStart || !opFinish || opFinish <= opStart) return;

                    const opStartMs = opStart.getTime();
                    const opFinishMs = opFinish.getTime();

                    // Operasyonun Duraklamaları (pauseHistory)
                    const pauses = (op.pauseHistory || []).map(ph => {
                        const pStart = parseSafeDate(ph.pausedAt);
                        const pEnd = parseSafeDate(ph.resumedAt) || opFinish;
                        return (pStart && pEnd && pEnd > pStart) ? { startMs: pStart.getTime(), endMs: pEnd.getTime() } : null;
                    }).filter(Boolean);

                    // 12 Ayın her biri ile bu operasyonun kesişimini (overlap) hesapla
                    months.forEach(mObj => {
                        const sliceStart = Math.max(opStartMs, mObj.startMs);
                        const sliceEnd = Math.min(opFinishMs, mObj.endMs);

                        if (sliceEnd > sliceStart) {
                            const grossSliceHours = (sliceEnd - sliceStart) / 3600000;

                            // Bu ayın sınırlarına denk gelen duraklamaları hesapla
                            let pauseSliceHours = 0;
                            pauses.forEach(p => {
                                const pSliceStart = Math.max(p.startMs, sliceStart);
                                const pSliceEnd = Math.min(p.endMs, sliceEnd);
                                if (pSliceEnd > pSliceStart) {
                                    pauseSliceHours += (pSliceEnd - pSliceStart) / 3600000;
                                }
                            });

                            // Net Talaş Kaldırma Süresi (Brüt - Duraklama)
                            const netSliceHours = Math.max(0, grossSliceHours - pauseSliceHours);

                            mObj.machineHours += netSliceHours;
                            mObj.pauseHours += pauseSliceHours;
                            mObj.opsCount += 1;

                            // Parçayı ay detay listesine ekle / güncelle
                            const taskId = task.id || `${moldName}-${task.taskName}`;
                            if (!mObj.partsListMap.has(taskId)) {
                                mObj.partsListMap.set(taskId, {
                                    id: taskId,
                                    moldName,
                                    partName: task.taskName || task.name || 'İsimsiz Parça',
                                    machineName: isExcludedMachine(primaryMachine) ? `${primaryMachine} (Hariç)` : primaryMachine,
                                    camOperator: camOp,
                                    camHours: parseFloat(taskCamHours.toFixed(1)),
                                    machineHours: 0,
                                    grossMachineHours: 0,
                                    pauseHours: 0,
                                    opsCount: 0,
                                    status: task.status || 'TAMAMLANDI',
                                    date: new Date(sliceStart).toLocaleDateString('tr-TR'),
                                    source: 'PROJECT_TASK'
                                });
                            }

                            const pEntry = mObj.partsListMap.get(taskId);
                            pEntry.machineHours += netSliceHours;
                            pEntry.grossMachineHours += grossSliceHours;
                            pEntry.pauseHours += pauseSliceHours;
                            pEntry.opsCount += 1;
                        }
                    });
                });
            });
        });

        // Çarpan ve Sayı Formatlama
        return months.map(m => {
            const partsList = Array.from(m.partsListMap.values()).map(p => ({
                ...p,
                machineHours: parseFloat(p.machineHours.toFixed(1)),
                grossMachineHours: parseFloat(p.grossMachineHours.toFixed(1)),
                pauseHours: parseFloat(p.pauseHours.toFixed(1))
            }));

            const camH = parseFloat(m.camHours.toFixed(1));
            const machH = parseFloat(m.machineHours.toFixed(1));
            const pauseH = parseFloat(m.pauseHours.toFixed(1));
            const multiplier = camH > 0 ? parseFloat((machH / camH).toFixed(2)) : 0;

            return {
                ...m,
                camHours: camH,
                machineHours: machH,
                pauseHours: pauseH,
                partsCount: partsList.length,
                partsList,
                multiplier,
                displayMultiplier: multiplier > 0 ? `${multiplier}x` : '-'
            };
        });
    }, [logs, activeProjects, selectedYear, selectedOperator, selectedMachines, isMachineAllowed]);

    // Yıllık Toplam KPI'lar
    const yearlyKPIs = useMemo(() => {
        let totalCam = 0;
        let totalMachine = 0;
        let totalPause = 0;
        let totalParts = 0;

        monthlyData.forEach(m => {
            totalCam += m.camHours;
            totalMachine += m.machineHours;
            totalPause += m.pauseHours;
            totalParts += m.partsList.length;
        });

        const avgMultiplier = totalCam > 0 ? (totalMachine / totalCam).toFixed(2) : '0.00';
        const bestMonth = [...monthlyData].sort((a, b) => b.machineHours - a.machineHours)[0] || null;

        return {
            totalCam: totalCam.toFixed(1),
            totalMachine: totalMachine.toFixed(1),
            totalPause: totalPause.toFixed(1),
            totalParts,
            avgMultiplier,
            bestMonth
        };
    }, [monthlyData]);

    // Seçili Ayın Filtrelenmiş Parça Listesi
    const detailPartsList = useMemo(() => {
        if (!selectedMonthDetail) return [];
        const month = monthlyData.find(m => m.monthNumber === selectedMonthDetail);
        if (!month) return [];

        if (!searchTerm.trim()) return month.partsList;
        const q = searchTerm.toLowerCase();

        return month.partsList.filter(p => 
            p.moldName.toLowerCase().includes(q) ||
            p.partName.toLowerCase().includes(q) ||
            p.camOperator.toLowerCase().includes(q) ||
            p.machineName.toLowerCase().includes(q)
        );
    }, [monthlyData, selectedMonthDetail, searchTerm]);

    return (
        <div className="space-y-6 animate-in fade-in pb-16 text-sm min-w-0">
            
            {/* 1. ÜST BAŞLIK VE FİLTRE PANELİ */}
            <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl border border-gray-200 dark:border-gray-700 shadow-xl flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                <div>
                    <div className="flex items-center gap-3">
                        <div className="p-3 rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                            <BarChart3 size={28} />
                        </div>
                        <div>
                            <h2 className="text-xl font-black text-gray-900 dark:text-white flex items-center gap-2 flex-wrap">
                                <span>Aylık CAM, Tezgah Çalışma ve Duraklama Süreleri Analizi</span>
                                {!isAllMachinesSelected && (
                                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 font-bold">
                                        {selectedMachines.length} Tezgah Seçili (Ortak Kayıtlı)
                                    </span>
                                )}
                                {saveSuccessNotice && (
                                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-green-500 text-white font-bold animate-bounce flex items-center gap-1 shadow">
                                        <Check size={12} /> Tüm Cihazlara Kaydedildi!
                                    </span>
                                )}
                            </h2>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
                                <span>Tüm kullanıcılar ve cihazlar için ortak senkronize edilen tezgah havuzu ve net imalat süreleri.</span>
                                <span className="text-amber-500 font-bold bg-amber-500/10 px-2 py-0.5 rounded-md">
                                    ⚠️ K41, K60 ve K65 Hariçtir
                                </span>
                            </p>
                        </div>
                    </div>
                </div>

                {/* Filtre Kontrolleri */}
                <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
                    {/* Yıl Seçici */}
                    <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-700/60 px-3 py-2 rounded-xl border dark:border-gray-600 text-xs">
                        <Calendar size={15} className="text-indigo-500" />
                        <span className="font-bold text-gray-400">Yıl:</span>
                        <select
                            value={selectedYear}
                            onChange={(e) => setSelectedYear(e.target.value)}
                            className="bg-transparent font-black text-gray-900 dark:text-white outline-none cursor-pointer"
                        >
                            <option value="2024">2024</option>
                            <option value="2025">2025</option>
                            <option value="2026">2026</option>
                            <option value="2027">2027</option>
                        </select>
                    </div>

                    {/* ÇOKLU TEZGAH SEÇİCİ DROPDOWN (ORTAK KAYDEDİLEBİLİR) */}
                    <div className="relative" ref={machineDropdownRef}>
                        <button
                            type="button"
                            onClick={() => setMachineDropdownOpen(!machineDropdownOpen)}
                            className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-bold transition shadow-sm ${
                                !isAllMachinesSelected
                                    ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500/40 text-emerald-700 dark:text-emerald-300'
                                    : 'bg-gray-50 dark:bg-gray-700/60 border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
                            }`}
                        >
                            <Cpu size={15} className="text-emerald-500" />
                            <span>
                                {isAllMachinesSelected
                                    ? `Tüm Tezgahlar (${uniqueMachines.length})`
                                    : selectedMachines.length === 0
                                    ? 'Tezgah Seçilmedi'
                                    : `${selectedMachines.length} Tezgah Seçili`}
                            </span>
                            <ChevronDown size={14} className={`text-gray-400 transition-transform ${machineDropdownOpen ? 'rotate-180' : ''}`} />
                        </button>

                        {/* Açılır Çoklu Tezgah Seçim Menüsü */}
                        {machineDropdownOpen && (
                            <div className="absolute right-0 top-full mt-2 w-72 sm:w-80 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 p-3 z-50 animate-in fade-in space-y-3">
                                
                                {/* Arama Kutusu */}
                                <div className="relative">
                                    <Search size={13} className="absolute left-2.5 top-2.5 text-gray-400" />
                                    <input
                                        type="text"
                                        placeholder="Tezgah ara (Örn: K27, K45)..."
                                        value={machineSearchTerm}
                                        onChange={(e) => setMachineSearchTerm(e.target.value)}
                                        className="w-full pl-8 pr-3 py-1.5 text-xs font-bold border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-emerald-500"
                                    />
                                </div>

                                {/* Hızlı İşlem Butonları */}
                                <div className="flex items-center justify-between gap-2 border-b dark:border-gray-700 pb-2">
                                    <button
                                        type="button"
                                        onClick={handleSelectAllMachines}
                                        className="text-[11px] font-black text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1"
                                    >
                                        <CheckSquare size={13} /> Tümünü Seç ({uniqueMachines.length})
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleClearAllMachines}
                                        className="text-[11px] font-bold text-red-500 hover:underline flex items-center gap-1"
                                    >
                                        <X size={13} /> Temizle
                                    </button>
                                </div>

                                {/* Tezgah Listesi (Yüksek Kontrast & Net Okunabilirlik) */}
                                <div className="max-h-60 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                                    {filteredMachinesForPicker.length === 0 ? (
                                        <div className="py-6 text-center text-xs text-gray-400 font-bold">Tezgah bulunamadı.</div>
                                    ) : (
                                        filteredMachinesForPicker.map(mName => {
                                            const isChecked = selectedMachines.includes(mName);
                                            return (
                                                <label
                                                    key={mName}
                                                    onClick={() => handleToggleMachine(mName)}
                                                    className={`flex items-center justify-between p-2 rounded-xl cursor-pointer transition select-none ${
                                                        isChecked
                                                            ? 'bg-emerald-50 dark:bg-emerald-950/40 text-gray-900 dark:text-white font-black'
                                                            : 'hover:bg-gray-100 dark:hover:bg-gray-700/60 text-gray-600 dark:text-gray-300 font-medium'
                                                    }`}
                                                >
                                                    <div className="flex items-center gap-2.5">
                                                        <input
                                                            type="checkbox"
                                                            checked={isChecked}
                                                            onChange={() => {}} // onClick ile yönetilir
                                                            className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer accent-emerald-600"
                                                        />
                                                        <span className="text-xs font-mono font-bold">{mName}</span>
                                                    </div>
                                                    {isChecked && (
                                                        <Check size={14} className="text-emerald-500 shrink-0" />
                                                    )}
                                                </label>
                                            );
                                        })
                                    )}
                                </div>

                                {/* Alt Kapanış & Ortak Kaydet Butonu */}
                                <div className="pt-2 border-t dark:border-gray-700 flex justify-between items-center text-xs">
                                    <span className="text-[11px] font-bold text-gray-400">
                                        {selectedMachines.length} / {uniqueMachines.length} Seçili
                                    </span>
                                    <button
                                        type="button"
                                        onClick={handleApplyAndSaveToCloud}
                                        disabled={isSaving}
                                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs shadow-md transition flex items-center gap-1.5"
                                    >
                                        <Save size={13} />
                                        <span>{isSaving ? 'Kaydediliyor...' : 'Uygula & Kaydet'}</span>
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Operatör Seçici */}
                    <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-700/60 px-3 py-2 rounded-xl border dark:border-gray-600 text-xs">
                        <User size={15} className="text-purple-500" />
                        <span className="font-bold text-gray-400">Operatör:</span>
                        <select
                            value={selectedOperator}
                            onChange={(e) => setSelectedOperator(e.target.value)}
                            className="bg-transparent font-black text-gray-900 dark:text-white outline-none cursor-pointer max-w-[160px]"
                        >
                            <option value="ALL">Tüm Operatörler</option>
                            {uniqueOperators.map(op => (
                                <option key={op} value={op}>{op}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            {/* 2. YILLIK GENEL KPI KARTLARI */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                
                <div className="p-5 rounded-3xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-lg flex flex-col justify-between transition-transform hover:scale-[1.01]">
                    <span className="text-[10px] font-extrabold text-blue-600 dark:text-blue-400 uppercase tracking-wider flex items-center gap-1.5">
                        <Clock size={14} /> Yıllık Toplam CAM Süresi
                    </span>
                    <div className="text-3xl font-black text-blue-600 dark:text-blue-400 mt-2 font-mono flex items-baseline justify-between">
                        <span>{yearlyKPIs.totalCam}</span>
                        <span className="text-sm font-normal text-gray-400">Saat</span>
                    </div>
                    <span className="text-[11px] text-gray-400 mt-1 font-medium">Programlama & Hazırlık</span>
                </div>

                <div className="p-5 rounded-3xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-lg flex flex-col justify-between transition-transform hover:scale-[1.01]">
                    <span className="text-[10px] font-extrabold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                        <Monitor size={14} /> {isAllMachinesSelected ? 'Tezgahlarda İmalat Süresi' : `Seçili ${selectedMachines.length} Tezgah`}
                    </span>
                    <div className="text-3xl font-black text-emerald-600 dark:text-emerald-400 mt-2 font-mono flex items-baseline justify-between">
                        <span>{yearlyKPIs.totalMachine}</span>
                        <span className="text-sm font-normal text-gray-400">Saat</span>
                    </div>
                    <span className="text-[11px] text-emerald-600 dark:text-emerald-400/80 mt-1 font-medium font-mono">
                        {isAllMachinesSelected ? 'Net Talaş (K41, K60, K65 Hariç)' : `Seçilen ${selectedMachines.length} Tezgahın Toplamı`}
                    </span>
                </div>

                <div className="p-5 rounded-3xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-lg flex flex-col justify-between transition-transform hover:scale-[1.01]">
                    <span className="text-[10px] font-extrabold text-amber-500 uppercase tracking-wider flex items-center gap-1.5">
                        <PauseCircle size={14} /> Toplam Duraklama Süresi
                    </span>
                    <div className="text-3xl font-black text-amber-500 mt-2 font-mono flex items-baseline justify-between">
                        <span>{yearlyKPIs.totalPause}</span>
                        <span className="text-sm font-normal text-gray-400">Saat</span>
                    </div>
                    <span className="text-[11px] text-gray-400 mt-1 font-medium">İş Bekleme & Duraklamalar</span>
                </div>

                <div className="p-5 rounded-3xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-lg flex flex-col justify-between transition-transform hover:scale-[1.01]">
                    <span className="text-[10px] font-extrabold text-purple-600 dark:text-purple-400 uppercase tracking-wider flex items-center gap-1.5">
                        <Zap size={14} /> CAM / Tezgah Çarpan Oranı
                    </span>
                    <div className="text-3xl font-black text-purple-600 dark:text-purple-400 mt-2 font-mono flex items-baseline justify-between">
                        <span>{yearlyKPIs.avgMultiplier}x</span>
                        <span className="text-xs font-bold text-purple-500">Katı Talaş</span>
                    </div>
                    <span className="text-[11px] text-gray-400 mt-1 font-medium">1 sa CAM ➔ {yearlyKPIs.avgMultiplier} sa Tezgah</span>
                </div>

            </div>

            {/* 3. AYNI GRAFİKTE 12 AYLIK KARŞILAŞTIRMA (COMPOSED CHART: 3 BARS + LINE) */}
            <div className="bg-white dark:bg-gray-800 p-6 md:p-8 rounded-3xl border border-gray-200 dark:border-gray-700 shadow-xl space-y-4 min-w-0">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b dark:border-gray-700 pb-4">
                    <div>
                        <h3 className="text-base font-black text-gray-900 dark:text-white flex items-center gap-2">
                            <TrendingUp className="text-indigo-500 w-5 h-5" />
                            {selectedYear} Yılı Aylık Dağılım {!isAllMachinesSelected ? `(Seçili ${selectedMachines.length} Tezgah)` : ''}
                        </h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                            Mavi: CAM Saati • Yeşil: Net Talaş Saati {!isAllMachinesSelected ? `[${selectedMachines.length} Tezgah]` : '(K41, K60, K65 Hariç)'} • Turuncu: Duraklama Saati • Mor Çizgi: CAM/Tezgah Çarpanı
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-4 text-xs font-bold">
                        <span className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400">
                            <span className="w-3 h-3 rounded-md bg-blue-500 inline-block" /> CAM Süresi
                        </span>
                        <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                            <span className="w-3 h-3 rounded-md bg-emerald-500 inline-block" /> {!isAllMachinesSelected ? `${selectedMachines.length} Tezgah Süresi` : 'Tezgah Süresi'}
                        </span>
                        <span className="flex items-center gap-1.5 text-amber-500">
                            <span className="w-3 h-3 rounded-md bg-amber-500 inline-block" /> Duraklama Süresi
                        </span>
                        <span className="flex items-center gap-1.5 text-purple-600 dark:text-purple-400">
                            <span className="w-3 h-1 bg-purple-500 inline-block" /> Çarpan (x)
                        </span>
                    </div>
                </div>

                {/* Grafik Konteyneri */}
                <div className="h-[450px] w-full min-w-0" style={{ minHeight: '380px' }}>
                    <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={300}>
                        <ComposedChart data={monthlyData} margin={{ top: 25, right: 30, left: 0, bottom: 10 }}>
                            <CartesianGrid strokeDasharray="3 3" opacity={0.07} vertical={false} />
                            <XAxis 
                                dataKey="shortName" 
                                axisLine={false} 
                                tickLine={false} 
                                tick={{ fill: '#9CA3AF', fontSize: 11, fontWeight: 'bold' }} 
                            />
                            {/* Sol Y Ekseni: Saatler */}
                            <YAxis 
                                yAxisId="hours"
                                axisLine={false} 
                                tickLine={false} 
                                tick={{ fill: '#9CA3AF', fontSize: 11 }} 
                                unit="s" 
                            />
                            {/* Sağ Y Ekseni: Çarpan (x) */}
                            <YAxis 
                                yAxisId="multiplier"
                                orientation="right"
                                axisLine={false} 
                                tickLine={false} 
                                tick={{ fill: '#A855F7', fontSize: 11, fontWeight: 'bold' }} 
                                unit="x" 
                            />
                            <Tooltip 
                                contentStyle={{ 
                                    backgroundColor: '#111827', 
                                    color: '#F3F4F6', 
                                    borderRadius: '16px', 
                                    border: 'none', 
                                    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)' 
                                }}
                                formatter={(value, name) => {
                                    if (name === 'CAM Süresi' || name === 'Tezgah Süresi' || name === 'Duraklama Süresi' || name.includes('Süresi')) return [`${value} Saat`, name];
                                    if (name === 'Çarpan Katsayısı') return [`${value}x Katı`, name];
                                    return [value, name];
                                }}
                            />

                            {/* 1. Bar: CAM Süresi (Mavi) */}
                            <Bar 
                                yAxisId="hours"
                                dataKey="camHours" 
                                name="CAM Süresi" 
                                fill="#3B82F6" 
                                radius={[5, 5, 0, 0]} 
                                barSize={20}
                            >
                                <LabelList 
                                    dataKey="camHours" 
                                    position="top" 
                                    fill="#3B82F6" 
                                    fontSize={10} 
                                    fontWeight="bold" 
                                    formatter={(v) => v > 0 ? `${v}s` : ''} 
                                />
                            </Bar>

                            {/* 2. Bar: Tezgah Süresi (Yeşil) */}
                            <Bar 
                                yAxisId="hours"
                                dataKey="machineHours" 
                                name={!isAllMachinesSelected ? `Seçili Tezgahlar (${selectedMachines.length})` : 'Tezgah Süresi'}
                                fill="#10B981" 
                                radius={[5, 5, 0, 0]} 
                                barSize={20}
                            >
                                <LabelList 
                                    dataKey="machineHours" 
                                    position="top" 
                                    fill="#10B981" 
                                    fontSize={10} 
                                    fontWeight="bold" 
                                    formatter={(v) => v > 0 ? `${v}s` : ''} 
                                />
                            </Bar>

                            {/* 3. Bar: Duraklama Süresi (Turuncu / Amber) */}
                            <Bar 
                                yAxisId="hours"
                                dataKey="pauseHours" 
                                name="Duraklama Süresi" 
                                fill="#F59E0B" 
                                radius={[5, 5, 0, 0]} 
                                barSize={20}
                            >
                                <LabelList 
                                    dataKey="pauseHours" 
                                    position="top" 
                                    fill="#F59E0B" 
                                    fontSize={10} 
                                    fontWeight="bold" 
                                    formatter={(v) => v > 0 ? `${v}s` : ''} 
                                />
                            </Bar>

                            {/* 4. Line: Çarpan Katsayısı (Mor) */}
                            <Line 
                                yAxisId="multiplier"
                                type="monotone" 
                                dataKey="multiplier" 
                                name="Çarpan Katsayısı" 
                                stroke="#A855F7" 
                                strokeWidth={3} 
                                dot={{ r: 4, fill: '#A855F7', strokeWidth: 2, stroke: '#fff' }} 
                                activeDot={{ r: 7 }} 
                            />
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* 4. AYLIK ÖZET TABLOSU (MONTH-BY-MONTH SUMMARY & DRILL-DOWN) */}
            <div className="bg-white dark:bg-gray-800 p-6 md:p-8 rounded-3xl border border-gray-200 dark:border-gray-700 shadow-xl space-y-4">
                <div className="flex justify-between items-center border-b dark:border-gray-700 pb-3">
                    <h3 className="text-base font-black text-gray-900 dark:text-white flex items-center gap-2">
                        <Calendar className="text-indigo-500 w-5 h-5" /> 12 Aylık Karşılaştırma Tablosu {!isAllMachinesSelected ? `(${selectedMachines.length} Tezgah)` : ''}
                    </h3>
                    <span className="text-xs text-gray-400 font-bold">
                        * Ayrıntılı parça ve duraklama dökümü için ay satırına tıklayın
                    </span>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                        <thead>
                            <tr className="bg-gray-50 dark:bg-gray-900/60 border-b dark:border-gray-700 text-gray-500 dark:text-gray-400 font-extrabold uppercase text-[10px] tracking-wider">
                                <th className="p-3">Ay</th>
                                <th className="p-3 text-center">🔵 Toplam CAM (Saat)</th>
                                <th className="p-3 text-center">🟢 {!isAllMachinesSelected ? `İmalat (${selectedMachines.length} Tzg)` : 'Tezgah İmalat (Saat)'}</th>
                                <th className="p-3 text-center">🟠 Duraklama (Saat)</th>
                                <th className="p-3 text-center">🟣 CAM / Tezgah Çarpanı</th>
                                <th className="p-3 text-center">📦 Parça & Operasyon</th>
                                <th className="p-3 text-right">Detay İncele</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-700 font-medium">
                            {monthlyData.map(m => {
                                const isSelected = selectedMonthDetail === m.monthNumber;

                                return (
                                    <tr 
                                        key={m.monthNumber}
                                        onClick={() => setSelectedMonthDetail(isSelected ? null : m.monthNumber)}
                                        className={`cursor-pointer transition hover:bg-indigo-50/50 dark:hover:bg-indigo-950/30 ${
                                            isSelected ? 'bg-indigo-50 dark:bg-indigo-950/50 font-bold' : ''
                                        }`}
                                    >
                                        <td className="p-3">
                                            <span className="font-black text-gray-900 dark:text-white text-sm">
                                                {m.monthName} {selectedYear}
                                            </span>
                                        </td>
                                        <td className="p-3 text-center font-mono font-black text-blue-600 dark:text-blue-400 text-sm">
                                            {m.camHours > 0 ? `${m.camHours} sa` : '-'}
                                        </td>
                                        <td className="p-3 text-center font-mono font-black text-emerald-600 dark:text-emerald-400 text-sm">
                                            {m.machineHours > 0 ? `${m.machineHours} sa` : '-'}
                                        </td>
                                        <td className="p-3 text-center font-mono font-black text-amber-500 text-sm">
                                            {m.pauseHours > 0 ? `${m.pauseHours} sa` : '-'}
                                        </td>
                                        <td className="p-3 text-center">
                                            {m.multiplier > 0 ? (
                                                <span className="px-2.5 py-1 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 font-mono font-black text-xs">
                                                    {m.multiplier}x Katı
                                                </span>
                                            ) : '-'}
                                        </td>
                                        <td className="p-3 text-center font-mono">
                                            {m.partsList.length > 0 ? (
                                                <div>
                                                    <span className="font-black text-gray-900 dark:text-white text-xs">{m.partsList.length} Parça</span>
                                                    <span className="text-[10px] text-indigo-500 font-bold block">({m.opsCount} Operasyon)</span>
                                                </div>
                                            ) : '-'}
                                        </td>
                                        <td className="p-3 text-right">
                                            <button className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 ml-auto">
                                                {isSelected ? 'Kapat' : 'Parçaları Gör'}
                                                <ChevronRight size={14} className={isSelected ? 'rotate-90 transition-transform' : ''} />
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* 5. SEÇİLİ AYIN AYRINTILI PARÇA LİSTESİ (DRILL-DOWN) */}
            {selectedMonthDetail && (
                <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl border-2 border-indigo-500/40 shadow-2xl space-y-4 animate-fadeIn">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b dark:border-gray-700 pb-3">
                        <div>
                            <h3 className="text-base font-black text-gray-900 dark:text-white flex items-center gap-2">
                                <Box className="text-indigo-500 w-5 h-5" />
                                {MONTH_NAMES[selectedMonthDetail - 1]} {selectedYear} — Ayında İşlenen Parçalar ({detailPartsList.length}) {!isAllMachinesSelected ? `[Seçili ${selectedMachines.length} Tezgah]` : ''}
                            </h3>
                            <p className="text-xs text-gray-400 mt-0.5">
                                Bu ay yapılan CAM, tezgah çalışma ve duraklama sürelerinin parça bazında dökümü {!isAllMachinesSelected ? `(Sadece Seçili ${selectedMachines.length} Tezgah)` : '(K41, K60, K65 Hariç)'}.
                            </p>
                        </div>

                        {/* Parça Arama Kutusu */}
                        <div className="relative w-full sm:w-64">
                            <Search size={14} className="absolute left-3 top-3 text-gray-400 pointer-events-none" />
                            <input
                                type="text"
                                placeholder="Kalıp veya parça ara..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-8 pr-3 py-2 text-xs font-bold border border-gray-300 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white outline-none"
                            />
                        </div>
                    </div>

                    {detailPartsList.length === 0 ? (
                        <div className="py-12 text-center text-gray-400 font-bold text-xs">
                            Seçili filtrelerde bu ay için kayıtlı parça bulunamadı.
                        </div>
                    ) : (
                        <div className="overflow-x-auto rounded-2xl border dark:border-gray-700">
                            <table className="w-full text-left text-xs border-collapse">
                                <thead>
                                    <tr className="bg-gray-50 dark:bg-gray-900 text-gray-500 font-extrabold uppercase text-[10px]">
                                        <th className="p-3">Kalıp Adı</th>
                                        <th className="p-3">Parça Adı</th>
                                        <th className="p-3">CAM Operatörü</th>
                                        <th className="p-3">Tezgah</th>
                                        <th className="p-3 text-right">🔵 CAM Süresi</th>
                                        <th className="p-3 text-right">🟢 Net Talaş Süresi</th>
                                        <th className="p-3 text-right">🟠 Duraklama</th>
                                        <th className="p-3 text-right">Brüt Süre</th>
                                        <th className="p-3 text-right">Tarih</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 dark:divide-gray-700 font-medium">
                                    {detailPartsList.map((p, idx) => (
                                        <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                            <td className="p-3 font-black text-gray-900 dark:text-white">{p.moldName}</td>
                                            <td className="p-3 text-indigo-600 dark:text-indigo-400 font-bold">{p.partName}</td>
                                            <td className="p-3 text-purple-600 dark:text-purple-300 font-bold">{p.camOperator}</td>
                                            <td className="p-3 font-mono font-bold text-gray-700 dark:text-gray-300">{p.machineName}</td>
                                            <td className="p-3 text-right font-mono font-black text-blue-600 dark:text-blue-400">{p.camHours} sa</td>
                                            <td className="p-3 text-right font-mono font-black text-emerald-600 dark:text-emerald-400">{p.machineHours} sa</td>
                                            <td className="p-3 text-right font-mono font-black text-amber-500">{p.pauseHours > 0 ? `${p.pauseHours} sa` : '-'}</td>
                                            <td className="p-3 text-right font-mono text-gray-400">{p.grossMachineHours > 0 ? `${p.grossMachineHours} sa` : '-'}</td>
                                            <td className="p-3 text-right font-mono text-gray-400 text-[11px]">{p.date}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

        </div>
    );
};

export default CamMonthlyComparisonTab;
