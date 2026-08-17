import React, { useState, useEffect, useMemo, useRef } from 'react';
import { collection, addDoc, onSnapshot, query, orderBy, deleteDoc, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { 
  PlusIcon, TrashIcon, MonitorIcon, PencilIcon, XIcon, SaveIcon, HistoryIcon, UserIcon, 
  CheckCircle, PlayCircle, AlertTriangle, Clock, Filter, Wrench, Ruler,
  Check, UserCheck, Layers, ListPlus, ChevronDown, RefreshCw, ArrowUp, ArrowDown
} from 'lucide-react';

const NightShiftPlanner = ({ db, loggedInUser, machines = [], canEdit }) => {
  // Kullanıcı Rol Kontrolü (Tezgah Operatörü Tespiti)
  const userRoleLower = (loggedInUser?.role || loggedInUser?.userRole || loggedInUser?.jobTitle || '').toLowerCase();
  
  const isMachineOperator = useMemo(() => {
    if (!loggedInUser) return false;
    const isCamOrAdmin = userRoleLower.includes('cam') || userRoleLower.includes('admin') || userRoleLower.includes('yönetici') || userRoleLower.includes('müdür') || userRoleLower.includes('sorumlu');
    if (isCamOrAdmin) return false;
    return userRoleLower.includes('operatör') || userRoleLower.includes('operator') || userRoleLower.includes('tezgah') || userRoleLower.includes('cnc') || userRoleLower.includes('torna') || canEdit === false;
  }, [loggedInUser, userRoleLower, canEdit]);

  // Sıralama Yetkisi Kontrolü (Admin, CAM Operatörü, CAM Sorumlusu)
  const canReorderJobs = useMemo(() => {
    if (!loggedInUser) return false;
    const roleStr = (loggedInUser?.role || loggedInUser?.userRole || loggedInUser?.jobTitle || '').toLowerCase();
    return (
      roleStr.includes('admin') ||
      roleStr.includes('cam') ||
      roleStr.includes('yönetici') ||
      roleStr.includes('müdür') ||
      roleStr.includes('sorumlu') ||
      loggedInUser?.role === 'Admin' ||
      loggedInUser?.role === 'CAM Operatörü' ||
      loggedInUser?.role === 'CAM Sorumlusu'
    );
  }, [loggedInUser]);

  // Tezgah Grubunun Öncelik Sırasını Yukarı veya Aşağı Taşıma Fonksiyonu
  const handleMoveMachineGroup = async (groupIdx, direction) => {
    if (!groupedOperatorPlans || groupedOperatorPlans.length < 2 || !db) return;
    const targetIdx = direction === 'up' ? groupIdx - 1 : groupIdx + 1;
    if (targetIdx < 0 || targetIdx >= groupedOperatorPlans.length) return;

    try {
      const currentGroup = groupedOperatorPlans[groupIdx];
      const targetGroup = groupedOperatorPlans[targetIdx];

      // Üste geçecek olan gruba daha küçük öncelik numaraları verilir
      const topGroup = direction === 'up' ? currentGroup : targetGroup;
      const bottomGroup = direction === 'up' ? targetGroup : currentGroup;

      const sortedTop = [...topGroup.plans].sort((a, b) => (a.priority || 0) - (b.priority || 0));
      const sortedBottom = [...bottomGroup.plans].sort((a, b) => (a.priority || 0) - (b.priority || 0));

      const minPriTop = Math.min(...sortedTop.map(p => p.priority || 1));
      const minPriBottom = Math.min(...sortedBottom.map(p => p.priority || 1));
      const startPriority = Math.min(minPriTop, minPriBottom);

      const updates = [];
      let currentPri = startPriority;

      // Üste geçen grup öncelikle küçük numaraları alır
      sortedTop.forEach(plan => {
        updates.push(
          updateDoc(doc(db, "night_shift_plans", plan.id), {
            priority: currentPri++,
            updatedAt: serverTimestamp()
          })
        );
      });

      // Alta geçen grup sonraki numaraları alır
      sortedBottom.forEach(plan => {
        updates.push(
          updateDoc(doc(db, "night_shift_plans", plan.id), {
            priority: currentPri++,
            updatedAt: serverTimestamp()
          })
        );
      });

      await Promise.all(updates);
    } catch (err) {
      console.error("Tezgah öncelik sıralaması güncelleme hatası:", err);
    }
  };

  // Genel Vardiya Notunu Çekme Yardımcısı (Grup Başlığının Altında Gösterim İçin)
  const getGroupGeneralNote = (group) => {
    if (!group) return '';
    if (group.generalDescription) return group.generalDescription;
    const planWithNote = group.plans?.find(p => p.generalDescription);
    if (planWithNote?.generalDescription) return planWithNote.generalDescription;

    // Geçmiş birleşik verilerden genel notu ayıkla
    for (const p of (group.plans || [])) {
      if (p.description) {
        const match = p.description.match(/\[Genel Not:\s*(.*?)\]|\(Genel Not:\s*(.*?)\)/i);
        if (match && (match[1] || match[2])) {
          return (match[1] || match[2]).trim();
        }
      }
    }
    return '';
  };

  // Takıma Özel Açıklamayı Temizleme Yardımcısı (Takım Satırında Gösterim İçin)
  const getCleanToolDescription = (plan) => {
    if (!plan?.description) return '';
    let desc = plan.description.replace(/\[Genel Not:.*?\]|\(Genel Not:.*?\)/gi, '').trim();
    return desc;
  };

  // Varsayılan Sekme: Tezgah Operatörü ise 'operator', Değilse 'planning'
  const [activeTab, setActiveTab] = useState(() => isMachineOperator ? 'operator' : 'planning');
  
  // Tezgah Operatörünün Planlama Sekmesine Erişmesini Engelle
  useEffect(() => {
    if (isMachineOperator && activeTab === 'planning') {
      setActiveTab('operator');
    }
  }, [isMachineOperator, activeTab]);

  const [plans, setPlans] = useState([]);
  const [firestoreMachines, setFirestoreMachines] = useState([]);
  const [editingId, setEditingId] = useState(null);
  
  // Modal State (Formun Pencere Şeklinde Açılması)
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  
  // Operatör Sekmesi Tezgah Filtresi & Operatör Adı
  const [operatorMachineFilter, setOperatorMachineFilter] = useState('all');
  const [operatorNameInput, setOperatorNameInput] = useState(() => loggedInUser?.name || '');

  // TV Modu Arşiv Filtresi & Otomatik Sayfa Döngüsü (Auto-Pager)
  const [tvShiftOnly, setTvShiftOnly] = useState(true);
  const [currentTvPage, setCurrentTvPage] = useState(0);

  // Kayıt Defteri Filtreleme State'leri (Günlük, Haftalık, Aylık, Tezgah & Arama)
  const [historyDateFilter, setHistoryDateFilter] = useState('all'); // 'today', 'week', 'month', 'all'
  const [historyMachineFilter, setHistoryMachineFilter] = useState('all');
  const [historySearchTerm, setHistorySearchTerm] = useState('');

  // ARANABİLİR TEZGAH DROPDOWN STATE
  const [isMachineDropdownOpen, setIsMachineDropdownOpen] = useState(false);
  const machineDropdownRef = useRef(null);

  // SIRALI PLANLAMA FORMU STATE
  const [mainForm, setMainForm] = useState({
    machineId: '',
    moldName: '',
    partName: '',
    generalDescription: '',
    tools: [
      { toolInfo: '', toolLength: '', description: '' },
      { toolInfo: '', toolLength: '', description: '' }
    ]
  });

  // Düzenleme Modu (Tekil Satır Düzenleme State'i)
  const [editSingleData, setEditSingleData] = useState({
    machineId: '',
    moldName: '',
    partName: '',
    toolInfo: '',
    toolLength: '',
    description: '',
    priority: 1
  });

  // Operatör İsim & Durum Güncelleme Modal State
  const [statusModal, setStatusModal] = useState({
    open: false,
    plan: null,
    targetStatus: '',
    operatorName: '',
    note: ''
  });

  const currentUserDisplay = loggedInUser?.name || loggedInUser?.displayName || loggedInUser?.username || '';

  // Dışarıya Tıklanınca Tezgah Dropdown'unu Kapat
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (machineDropdownRef.current && !machineDropdownRef.current.contains(event.target)) {
        setIsMachineDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // 1. Plan Verilerini Canlı Çek (Firestore)
  useEffect(() => {
    if (!db) return;
    const q = query(collection(db, "night_shift_plans"), orderBy("priority", "asc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setPlans(snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() })));
    }, (err) => {
      console.error("Gece vardiyası verileri dinleme hatası:", err);
    });
    return () => unsubscribe();
  }, [db]);

  // 2. Tezgah Listesini Canlı Çek (Firestore Canlı Dinleyici)
  useEffect(() => {
    if (!db) return;
    const unsub = onSnapshot(collection(db, "machines"), (snap) => {
      const list = snap.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
      setFirestoreMachines(list);
    }, (err) => {
      console.error("Tezgah listesi dinleme hatası:", err);
    });
    return () => unsub();
  }, [db]);

  // Birleştirilmiş & Alfabetik Sıralı Tezgah Listesi
  const mergedMachines = useMemo(() => {
    const combined = [...machines, ...firestoreMachines];
    const map = new Map();
    combined.forEach(m => {
      const name = (m.name || m.code || m.id || String(m)).trim().toUpperCase();
      if (name && !map.has(name)) {
        map.set(name, { name, type: m.type || m.category || '' });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [machines, firestoreMachines]);

  // Arama İletisi İçerisinde Filtrelenmiş Tezgahlar
  const filteredMachinesList = useMemo(() => {
    const input = (mainForm.machineId || '').toLowerCase().trim();
    if (!input) return mergedMachines;
    return mergedMachines.filter(m => 
      m.name.toLowerCase().includes(input) || 
      (m.type && m.type.toLowerCase().includes(input))
    );
  }, [mergedMachines, mainForm.machineId]);

  // Takım Satırı Ekle
  const addToolRow = () => {
    setMainForm(prev => ({
      ...prev,
      tools: [...prev.tools, { toolInfo: '', toolLength: '', description: '' }]
    }));
  };

  // Takım Satırı Sil
  const removeToolRow = (index) => {
    setMainForm(prev => ({
      ...prev,
      tools: prev.tools.filter((_, i) => i !== index)
    }));
  };

  // Satır Girdi Değişimi
  const updateToolRow = (index, field, value) => {
    setMainForm(prev => {
      const updated = [...prev.tools];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, tools: updated };
    });
  };

  // BİRLEŞİK SIRALI PLAN KAYDI (GÖNDERİM)
  const handleSubmitMainForm = async (e) => {
    e.preventDefault();

    // DÜZENLEME MODU (TEKİL KAYIT GÜNCELLEME)
    if (editingId) {
      if (!editSingleData.machineId || !editSingleData.moldName) return;

      const payload = {
        machineId: editSingleData.machineId.toUpperCase().trim(),
        moldName: editSingleData.moldName.trim(),
        partName: editSingleData.partName.trim(),
        toolInfo: editSingleData.toolInfo.trim(),
        toolLength: editSingleData.toolLength.trim(),
        description: editSingleData.description.trim(),
        priority: parseInt(editSingleData.priority) || 1,
        updatedAt: serverTimestamp()
      };

      await updateDoc(doc(db, "night_shift_plans", editingId), payload);
      setEditingId(null);
      setIsAddModalOpen(false);
      return;
    }

    // YENİ SIRALI PLAN EKLEME MODU
    if (!mainForm.machineId || !mainForm.moldName) {
      alert("Lütfen Tezgah Adı ve Kalıp Adını giriniz!");
      return;
    }

    const validTools = mainForm.tools.filter(t => t.toolInfo.trim() !== '' || t.description.trim() !== '' || t.toolLength.trim() !== '');
    if (validTools.length === 0) {
      alert("Lütfen en az 1 adet Takım Bilgisi tanımlayınız!");
      return;
    }

    const machineIdUpper = mainForm.machineId.toUpperCase().trim();
    const moldNameTrim = mainForm.moldName.trim();
    const partNameTrim = mainForm.partName.trim();
    const generalDesc = mainForm.generalDescription.trim();

    // Seçilen Tezgah İçin Mevcut En Yüksek Sıra Numarasını Bul
    const existingMachinePlans = plans.filter(p => p.machineId === machineIdUpper && p.status !== 'TAMAMLANDI');
    let startPriority = 1;
    if (existingMachinePlans.length > 0) {
      startPriority = Math.max(...existingMachinePlans.map(p => p.priority || 0)) + 1;
    }

    // Her sıralı takım adımı için Firestore kaydı oluştur
    for (let i = 0; i < validTools.length; i++) {
      const tool = validTools[i];
      const stepToolDesc = tool.description.trim();

      await addDoc(collection(db, "night_shift_plans"), {
        machineId: machineIdUpper,
        moldName: moldNameTrim,
        partName: partNameTrim,
        toolInfo: tool.toolInfo.trim(),
        toolLength: tool.toolLength.trim(),
        description: stepToolDesc,
        generalDescription: generalDesc,
        priority: startPriority + i,
        addedBy: currentUserDisplay || "Belirtilmedi",
        addedByUserId: loggedInUser?.id || loggedInUser?.uid || null,
        status: 'BEKLIYOR',
        operatorNote: '',
        operatorName: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    }

    // Formu Sıfırla ve Modalı Kapat
    setMainForm({
      machineId: '',
      moldName: '',
      partName: '',
      generalDescription: '',
      tools: [
        { toolInfo: '', toolLength: '', description: '' },
        { toolInfo: '', toolLength: '', description: '' }
      ]
    });
    setIsMachineDropdownOpen(false);
    setIsAddModalOpen(false);
  };

  // Düzenleme Başlat
  const handleEdit = (plan) => {
    setEditSingleData({
      machineId: plan.machineId || '',
      moldName: plan.moldName || '',
      partName: plan.partName || '',
      toolInfo: plan.toolInfo || '',
      toolLength: plan.toolLength || '',
      description: plan.description || '',
      priority: plan.priority || 1
    });
    setEditingId(plan.id);
    setIsAddModalOpen(true);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setIsAddModalOpen(false);
  };

  // Plan Sil
  const deletePlan = async (id) => {
    if (window.confirm("Bu kaydı silmek istediğinize emin misiniz?")) {
      await deleteDoc(doc(db, "night_shift_plans", id));
    }
  };

  // Status Modal Açma (Operatör İsmi İsteme)
  const openStatusModal = (plan, targetStatus) => {
    setStatusModal({
      open: true,
      plan,
      targetStatus,
      operatorName: operatorNameInput || plan.operatorName || loggedInUser?.name || '',
      note: plan.operatorNote || ''
    });
  };

  // Status Modal Onaylama (Firestore Güncelleme)
  const confirmStatusUpdate = async (e) => {
    e?.preventDefault();
    if (!statusModal.plan) return;
    if (!statusModal.operatorName.trim()) {
      alert("Lütfen işi işaretleyen operatör adını giriniz!");
      return;
    }

    const opName = statusModal.operatorName.trim();
    setOperatorNameInput(opName);

    const updatePayload = {
      status: statusModal.targetStatus,
      operatorName: opName,
      operatorNote: statusModal.note.trim(),
      updatedAt: new Date()
    };

    if (statusModal.targetStatus === 'TAMAMLANDI') {
      updatePayload.completedAt = new Date();
    }

    await updateDoc(doc(db, "night_shift_plans", statusModal.plan.id), updatePayload);

    setStatusModal({
      open: false,
      plan: null,
      targetStatus: '',
      operatorName: '',
      note: ''
    });
  };

  // Doğrudan Status Değiştirme
  const updateStatusDirect = async (id, newStatus) => {
    const updatePayload = {
      status: newStatus,
      updatedAt: new Date()
    };
    if (newStatus === 'TAMAMLANDI') {
      updatePayload.completedAt = new Date();
    }
    await updateDoc(doc(db, "night_shift_plans", id), updatePayload);
  };

  // --- GECE VARDİYASI KESİM SAATİ (HER GÜN ÖĞLEN 12:00 SIFIRLANMA MANTIĞI) ---
  const getActiveShiftCutoffTime = () => {
    const now = new Date();
    const currentHour = now.getHours();
    
    const cutoff = new Date(now);
    cutoff.setMinutes(0);
    cutoff.setSeconds(0);
    cutoff.setMilliseconds(0);

    if (currentHour < 12) {
      // Öğlen 12:00'den önceyiz (Örn: Salı 08:30 AM):
      // Vardiya döngüsü dün öğlen 12:00'de başladı
      cutoff.setDate(cutoff.getDate() - 1);
      cutoff.setHours(12);
    } else {
      // Öğlen 12:00'den sonrayız (Örn: Salı 14:00 PM):
      // Vardiya döngüsü bugün öğlen 12:00'de başladı
      cutoff.setHours(12);
    }
    
    return cutoff.getTime();
  };

  const isCurrentShiftJob = (plan) => {
    // Tamamlanmamış (Bekliyor / İşleniyor / Problem) işler HER ZAMAN görünür
    if (plan.status !== 'TAMAMLANDI') return true;

    let compTime = null;
    if (plan.completedAt?.toDate) {
      compTime = plan.completedAt.toDate().getTime();
    } else if (plan.completedAt) {
      compTime = new Date(plan.completedAt).getTime();
    }

    if (!compTime) return true;

    // İş, mevcut vardiya döngüsü başladıktan (öğlen 12:00'den) sonra mı bitti?
    const cutoffTime = getActiveShiftCutoffTime();
    return compTime >= cutoffTime;
  };

  // 1. Bekleyen & Devam Eden Aktif İşler
  const uncompletedPlans = plans.filter(p => p.status !== 'TAMAMLANDI');

  // 2. Geçmiş Tüm Tamamlanan İşler (Kayıt Defteri Arşivi)
  const allCompletedPlans = plans.filter(p => p.status === 'TAMAMLANDI');

  // 3. TV MODU VE OPERATÖR TAKİP İŞ LİSTESİ (Güncel Vardiya İşleri - 12:00 Sıfırlanma Mantıklı)
  const tvShiftPlans = plans.filter(plan => {
    if (tvShiftOnly) {
      return isCurrentShiftJob(plan);
    }
    return true;
  });

  // 4. KAYIT DEFTERİ FİLTRELENMİŞ İŞ LİSTESİ (GÜNLÜK / HAFTALIK / AYLIK)
  const filteredHistoryPlans = useMemo(() => {
    return allCompletedPlans.filter(plan => {
      // Tezgah Filtresi
      if (historyMachineFilter !== 'all' && plan.machineId !== historyMachineFilter) {
        return false;
      }

      // Arama Filtresi
      if (historySearchTerm.trim()) {
        const queryStr = historySearchTerm.toLowerCase().trim();
        const combined = `${plan.machineId} ${plan.moldName} ${plan.partName || ''} ${plan.toolInfo || ''} ${plan.operatorName || ''} ${plan.addedBy || ''} ${plan.description || ''} ${plan.generalDescription || ''}`.toLowerCase();
        if (!combined.includes(queryStr)) return false;
      }

      // Tarih Filtresi
      if (historyDateFilter === 'all') return true;

      let compTime = null;
      if (plan.completedAt?.toDate) {
        compTime = plan.completedAt.toDate().getTime();
      } else if (plan.completedAt) {
        compTime = new Date(plan.completedAt).getTime();
      }

      if (!compTime) return true;

      const now = new Date();

      if (historyDateFilter === 'today') {
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        return compTime >= startOfToday;
      }

      if (historyDateFilter === 'week') {
        const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
        return (now.getTime() - compTime) <= ONE_WEEK_MS;
      }

      if (historyDateFilter === 'month') {
        const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
        return (now.getTime() - compTime) <= THIRTY_DAYS_MS;
      }

      return true;
    });
  }, [allCompletedPlans, historyDateFilter, historyMachineFilter, historySearchTerm]);

  // 4. PLANLAMA SEKME LİSTESİ (SADECE GİRİŞ YAPAN CAM OPERATÖRÜNÜN İŞLERİ)
  const planningPlans = uncompletedPlans.filter(plan => {
    if (currentUserDisplay) {
      return (plan.addedBy || '').toLowerCase().trim() === currentUserDisplay.toLowerCase().trim();
    }
    return true;
  });

  // CAM Planlama Sekmesi İçin Gruplanmış İşler (Tezgah + Kalıp/Parça Bazında Gruplanır)
  const groupedPlanningPlans = useMemo(() => {
    const map = new Map();
    planningPlans.forEach(plan => {
      const key = `${plan.machineId}_${plan.moldName}_${plan.partName || ''}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          machineId: plan.machineId,
          moldName: plan.moldName,
          partName: plan.partName,
          addedBy: plan.addedBy,
          plans: []
        });
      }
      map.get(key).plans.push(plan);
    });
    return Array.from(map.values()).sort((a, b) => {
      const minPriA = Math.min(...a.plans.map(p => p.priority || 9999));
      const minPriB = Math.min(...b.plans.map(p => p.priority || 9999));
      return minPriA - minPriB;
    });
  }, [planningPlans]);

  // 5. TEZGAH OPERATÖRÜ TAKİP LİSTESİ
  const operatorPlans = tvShiftPlans.filter(plan => {
    if (operatorMachineFilter !== 'all') {
      return plan.machineId === operatorMachineFilter;
    }
    return true;
  });

  // Tezgah Operatörü Sekmesi İçin Gruplanmış İşler
  const groupedOperatorPlans = useMemo(() => {
    const map = new Map();
    operatorPlans.forEach(plan => {
      const key = `${plan.machineId}_${plan.moldName}_${plan.partName || ''}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          machineId: plan.machineId,
          moldName: plan.moldName,
          partName: plan.partName,
          addedBy: plan.addedBy,
          plans: []
        });
      }
      map.get(key).plans.push(plan);
    });
    return Array.from(map.values()).sort((a, b) => {
      const minPriA = Math.min(...a.plans.map(p => p.priority || 9999));
      const minPriB = Math.min(...b.plans.map(p => p.priority || 9999));
      return minPriA - minPriB;
    });
  }, [operatorPlans]);

  // TV MODU İÇİN GRUPLANMIŞ SATIR SATIR LİSTE VERİSİ
  const groupedTvEntries = useMemo(() => {
    const map = new Map();
    tvShiftPlans.forEach(plan => {
      const key = `${plan.addedBy || 'Diğer'}_${plan.machineId}_${plan.moldName}_${plan.partName || ''}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          addedBy: plan.addedBy || 'Diğer Operatörler',
          machineId: plan.machineId,
          moldName: plan.moldName,
          partName: plan.partName,
          plans: []
        });
      }
      map.get(key).plans.push(plan);
    });
    return Array.from(map.values());
  }, [tvShiftPlans]);

  // TV MODU OTOMATİK SAYFA DÖNGÜSÜ (AUTO-PAGER CAROUSEL)
  const TV_GROUPS_PER_PAGE = 4;
  const totalTvPages = Math.ceil(groupedTvEntries.length / TV_GROUPS_PER_PAGE) || 1;

  useEffect(() => {
    if (activeTab !== 'tv' || totalTvPages <= 1) return;
    const interval = setInterval(() => {
      setCurrentTvPage(prev => (prev + 1) % totalTvPages);
    }, 10000);
    return () => clearInterval(interval);
  }, [activeTab, totalTvPages]);

  const visibleTvEntries = useMemo(() => {
    if (totalTvPages <= 1) return groupedTvEntries;
    const start = currentTvPage * TV_GROUPS_PER_PAGE;
    return groupedTvEntries.slice(start, start + TV_GROUPS_PER_PAGE);
  }, [groupedTvEntries, currentTvPage, totalTvPages]);

  // Tezgah Filtreleme Listesi (Aktif Vardiyadaki Tezgahlar)
  const availableMachinesInActive = [...new Set(tvShiftPlans.map(p => p.machineId))].sort();

  // TV Modu KPI İstatistikleri
  const totalShiftPlans = tvShiftPlans.length;
  const completedCount = tvShiftPlans.filter(p => p.status === 'TAMAMLANDI').length;
  const inProgressCount = tvShiftPlans.filter(p => p.status === 'ISLENIYOR').length;
  const problemCount = tvShiftPlans.filter(p => p.status === 'PROBLEM' || p.status === 'DURDU').length;
  const pendingCount = tvShiftPlans.filter(p => p.status === 'BEKLIYOR').length;
  const successRate = totalShiftPlans > 0 ? ((completedCount / totalShiftPlans) * 100).toFixed(0) : 0;

  const getStatusBadge = (status) => {
    switch (status) {
      case 'TAMAMLANDI':
        return { label: '✅ TAMAMLANDI', bg: 'bg-emerald-600 text-white shadow-md shadow-emerald-600/50', border: 'border-emerald-500', icon: CheckCircle };
      case 'ISLENIYOR':
        return { label: '▶️ İŞLENİYOR', bg: 'bg-blue-600 text-white animate-pulse shadow-md shadow-blue-500/50', border: 'border-blue-500', icon: PlayCircle };
      case 'PROBLEM':
      case 'DURDU':
        return { label: '⚠️ PROBLEM', bg: 'bg-red-600 text-white animate-pulse shadow-md shadow-red-500/50', border: 'border-red-500', icon: AlertTriangle };
      case 'YAPILAMADI':
        return { label: '❌ YAPILAMADI', bg: 'bg-slate-700 text-slate-200', border: 'border-slate-600', icon: XIcon };
      default:
        return { label: '⏳ BEKLİYOR', bg: 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-300 dark:border-amber-700', border: 'border-amber-400', icon: Clock };
    }
  };

  return (
    <div className="h-screen flex flex-col bg-slate-50 dark:bg-slate-900 overflow-hidden transition-colors text-slate-900 dark:text-slate-100">
      
      {/* ÜST MENÜ VE SEKMELER */}
      {activeTab !== 'tv' && (
        <div className="bg-white dark:bg-slate-800 shadow-sm px-4 py-2.5 flex flex-wrap justify-between items-center gap-3 border-b dark:border-slate-700 shrink-0">
          <div className="flex items-center gap-2">
            
            {/* SADECE CAM OPERATÖRÜ VEYA YÖNETİCİ GÖREBİLİR */}
            {!isMachineOperator && (
              <button 
                onClick={() => setActiveTab('planning')} 
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-black transition ${
                  activeTab === 'planning' 
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-500/30' 
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                }`}
              >
                <PencilIcon size={15} /> 📋 Planlama (CAM Operatör)
              </button>
            )}

            {/* TEZGAH OPERATÖRÜ VE TÜM KULLANICILAR GÖREBİLİR */}
            <button 
              onClick={() => setActiveTab('operator')} 
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-black transition ${
                activeTab === 'operator' 
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-500/30' 
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
              }`}
            >
              <Wrench size={15} /> 🔧 Tezgah Operatörü Takip
            </button>

            <button 
              onClick={() => setActiveTab('tv')} 
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-black transition ${
                activeTab === 'tv' 
                  ? 'bg-purple-600 text-white shadow-md shadow-purple-500/30' 
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
              }`}
            >
              <MonitorIcon size={15} /> 📺 TV Modu (Canlı İzleme)
            </button>

            {!isMachineOperator && (
              <button 
                onClick={() => setActiveTab('history')} 
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-black transition ${
                  activeTab === 'history' 
                    ? 'bg-slate-800 text-white shadow-md' 
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                }`}
              >
                <HistoryIcon size={15} /> 📜 Kayıt Defteri ({allCompletedPlans.length})
              </button>
            )}
          </div>

          {/* AKTİF KULLANICI ROZETİ */}
          <div className="flex items-center gap-2 text-xs font-bold bg-slate-100 dark:bg-slate-700 px-3 py-1 rounded-lg border border-slate-200 dark:border-slate-600">
            <UserIcon size={14} className="text-blue-500" />
            <span className="text-slate-500 dark:text-slate-400">Kullanıcı:</span>
            <span className="font-black text-slate-900 dark:text-white">{currentUserDisplay || 'Misafir Operatör'}</span>
            {isMachineOperator && (
              <span className="text-[10px] bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-bold px-1.5 py-0.5 rounded">
                Tezgah Operatörü Yetkisi
              </span>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 1. CAM OPERATÖRÜ PLANLAMA EKRANI (GRUPLANMIŞ LİSTE GÖRÜNÜMÜ) */}
      {/* ========================================================================= */}
      {activeTab === 'planning' && !isMachineOperator && (
        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
          
          {/* FİLTRELEME VE YENİ PLAN POPUP PENCERE AÇMA BUTONU */}
          <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-sm border dark:border-slate-700 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
            <div>
              <h2 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                <PencilIcon className="text-blue-600 w-5 h-5" /> Gece Vardiyası CAM Planlama Paneli
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Kendi eklediğiniz sıralı iş programlarını gruplanmış olarak yönetin.
              </p>
            </div>

            <div className="flex items-center gap-3">
              {/* YENİ PLAN AÇMA MODAL BUTONU */}
              <button 
                type="button"
                onClick={() => {
                  setEditingId(null);
                  setIsAddModalOpen(true);
                }}
                className="px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-black text-xs rounded-xl shadow-md shadow-blue-500/20 flex items-center gap-2 transition transform hover:scale-[1.02]"
              >
                <ListPlus size={18} className="text-purple-300" />
                ⚡ Sıralı İş / Takım Programı Ekle
              </button>

              <div className="text-xs font-black bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 px-3 py-2 rounded-xl border border-blue-200 dark:border-blue-800 flex items-center gap-1.5">
                <UserIcon size={14} /> Sadece Benim Planladığım İşler ({planningPlans.length})
              </div>
            </div>
          </div>

          {/* CAM PLANLAMA GRUPLANMIŞ LİSTE GÖRÜNÜMÜ */}
          <div className="space-y-4">
            {groupedPlanningPlans.length === 0 ? (
              <div className="p-12 text-center text-slate-500 bg-white dark:bg-slate-800 rounded-2xl border dark:border-slate-700 font-bold">
                Henüz sizin tarafınızdan planlanmış gece vardiyası işi bulunmuyor.
              </div>
            ) : (
              groupedPlanningPlans.map(group => (
                <div key={group.key} className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
                  {/* GRUP BAŞLIĞI */}
                  <div className="bg-slate-100 dark:bg-slate-900 px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex flex-wrap justify-between items-center gap-2">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="font-mono font-black text-lg text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/80 px-3 py-1 rounded-xl border border-blue-200 dark:border-blue-800">
                        🖥️ {group.machineId}
                      </span>
                      <div>
                        <span className="font-black text-base text-slate-900 dark:text-white uppercase mr-2">
                          📦 {group.moldName}
                        </span>
                        {group.partName && (
                          <span className="font-bold text-xs text-slate-500 dark:text-slate-400">
                            ⚙️ {group.partName}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-xs font-black bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 px-2.5 py-1 rounded-xl border border-purple-200 dark:border-purple-800">
                        {group.plans.length} Sıralı Takım Programı
                      </span>
                    </div>
                  </div>

                  {/* GENEL VARDİYA NOTU BANNERI (GRUP SEVİYESİNDE EN ÜSTTE) */}
                  {getGroupGeneralNote(group) && (
                    <div className="bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-900/60 px-4 py-2 flex items-center gap-2 text-xs text-amber-900 dark:text-amber-200">
                      <span className="text-amber-500 text-sm">💡</span>
                      <span className="font-black uppercase text-[10px] text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/60 px-2 py-0.5 rounded-md border border-amber-300 dark:border-amber-700 shrink-0">
                        Genel Vardiya Notu
                      </span>
                      <span className="italic font-bold">"{getGroupGeneralNote(group)}"</span>
                    </div>
                  )}

                  {/* GRUP İÇİNDEKİ TAKIMLARIN DERLİ TOPLU SATIR LİSTESİ */}
                  <div className="divide-y divide-slate-100 dark:divide-slate-700/60">
                    {group.plans.map(plan => (
                      <div key={plan.id} className="p-3.5 hover:bg-slate-50/50 dark:hover:bg-slate-700/30 transition flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                        {/* Sol Taraf: Sıra No, Takım, Boy, Not */}
                        <div className="flex items-start md:items-center gap-3 flex-1 min-w-0">
                          <span className="text-xs font-mono font-black text-amber-500 bg-amber-100 dark:bg-amber-950/80 px-2.5 py-1 rounded-lg border border-amber-300 dark:border-amber-700 shrink-0">
                            #{plan.priority}
                          </span>

                          <div className="space-y-0.5 min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-3 text-xs">
                              <span className="font-mono font-black text-emerald-600 dark:text-emerald-400 text-sm">
                                🛠️ {plan.toolInfo || 'Takım Belirtilmedi'}
                              </span>
                              {plan.toolLength && (
                                <span className="font-mono font-black text-purple-600 dark:text-purple-400 text-xs">
                                  📏 Boy: {plan.toolLength}
                                </span>
                              )}
                            </div>

                            {getCleanToolDescription(plan) && (
                              <div className="text-[11px] text-slate-600 dark:text-slate-400 italic truncate" title={getCleanToolDescription(plan)}>
                                💡 Takım Notu: "{getCleanToolDescription(plan)}"
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Sağ Taraf: Durum Seçimi, Düzenle & Sil Butonları */}
                        <div className="flex items-center gap-2 shrink-0 w-full md:w-auto justify-end border-t md:border-t-0 pt-2 md:pt-0 dark:border-slate-700">
                          <select 
                            value={plan.status} 
                            onChange={(e) => updateStatusDirect(plan.id, e.target.value)} 
                            className="bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 font-bold text-[11px] rounded-lg p-1.5 text-slate-900 dark:text-white focus:outline-none"
                          >
                            <option value="BEKLIYOR">⏳ BEKLİYOR</option>
                            <option value="ISLENIYOR">▶️ İŞLENİYOR</option>
                            <option value="PROBLEM">⚠️ PROBLEM VAR</option>
                            <option value="YAPILAMADI">❌ YAPILAMADI</option>
                            <option value="TAMAMLANDI">✅ TAMAMLANDI</option>
                          </select>

                          <button 
                            onClick={() => handleEdit(plan)} 
                            className="p-1.5 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg"
                            title="Düzenle"
                          >
                            <PencilIcon size={16} />
                          </button>
                          <button 
                            onClick={() => deletePlan(plan.id)} 
                            className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg"
                            title="Sil"
                          >
                            <TrashIcon size={16} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* POPUP PENCERE ŞEKLİNDE AÇILAN SIRALI PLANLAMA MODALI */}
      {/* ========================================================================= */}
      {isAddModalOpen && !isMachineOperator && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto animate-fadeIn">
          <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-700 max-w-4xl w-full p-6 space-y-4 my-auto max-h-[90vh] overflow-y-auto custom-scrollbar">
            
            <div className="flex justify-between items-start border-b dark:border-slate-700 pb-3">
              <div>
                <h3 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <ListPlus className="text-purple-600 w-6 h-6" /> 
                  {editingId ? 'Gece Vardiyası İş Kaydını Güncelle' : '⚡ Gece Vardiyasına Sıralı İş / Takım Programı Ekle'}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Tezgah ve kalıp bilgilerini tanımlayın, sırasıyla çalışacak takımları ekleyin.
                </p>
              </div>
              <button 
                type="button"
                onClick={cancelEdit}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white p-1 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700"
              >
                <XIcon size={22} />
              </button>
            </div>

            <form onSubmit={handleSubmitMainForm} className="space-y-4">
              {!editingId ? (
                <>
                  {/* 1. GENEL BİLGİLER: TEZGAH, KALIP, PARÇA VE GENEL AÇIKLAMA */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                    {/* Tezgah Adı */}
                    <div className="relative" ref={machineDropdownRef}>
                      <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">Tezgah Adı *</label>
                      <div className="relative">
                        <input 
                          type="text" 
                          placeholder="Tezgah seçin (Örn: K40)..." 
                          required 
                          onFocus={() => setIsMachineDropdownOpen(true)}
                          className="w-full p-2.5 text-xs font-bold border dark:border-slate-600 rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 uppercase pr-8" 
                          value={mainForm.machineId} 
                          onChange={e => {
                            setMainForm({ ...mainForm, machineId: e.target.value.toUpperCase() });
                            setIsMachineDropdownOpen(true);
                          }} 
                        />
                        <ChevronDown size={16} className="absolute right-2.5 top-3 text-slate-400 pointer-events-none" />
                      </div>

                      {isMachineDropdownOpen && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl z-50 max-h-48 overflow-y-auto custom-scrollbar">
                          {filteredMachinesList.length === 0 ? (
                            <div className="p-3 text-xs text-slate-400 text-center italic">
                              "{mainForm.machineId}" ile eşleşen tezgah bulunamadı.
                            </div>
                          ) : (
                            filteredMachinesList.map(m => (
                              <button
                                key={m.name}
                                type="button"
                                onClick={() => {
                                  setMainForm({ ...mainForm, machineId: m.name });
                                  setIsMachineDropdownOpen(false);
                                }}
                                className="w-full text-left px-3.5 py-2 text-xs font-bold hover:bg-blue-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border-b border-slate-100 dark:border-slate-700/50 flex justify-between items-center transition"
                              >
                                <span className="font-mono text-blue-600 dark:text-blue-400 font-black">{m.name}</span>
                                {m.type && <span className="text-[10px] opacity-70">{m.type}</span>}
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </div>

                    {/* Kalıp Adı */}
                    <div>
                      <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">Kalıp Adı *</label>
                      <input 
                        type="text" 
                        placeholder="Örn: AP504 MENTEŞE" 
                        required 
                        className="w-full p-2.5 text-xs font-bold border dark:border-slate-600 rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500" 
                        value={mainForm.moldName} 
                        onChange={e => setMainForm({ ...mainForm, moldName: e.target.value })} 
                      />
                    </div>

                    {/* Parça Adı */}
                    <div>
                      <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">Parça Adı</label>
                      <input 
                        type="text" 
                        placeholder="Örn: Dişi Çelik" 
                        className="w-full p-2.5 text-xs font-bold border dark:border-slate-600 rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500" 
                        value={mainForm.partName} 
                        onChange={e => setMainForm({ ...mainForm, partName: e.target.value })} 
                      />
                    </div>

                    {/* Genel Vardiya Notu */}
                    <div>
                      <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">💡 Genel Vardiya Notu</label>
                      <input 
                        type="text" 
                        placeholder="Tüm takımlar için ortak not..." 
                        className="w-full p-2.5 text-xs font-medium border dark:border-slate-600 rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500" 
                        value={mainForm.generalDescription} 
                        onChange={e => setMainForm({ ...mainForm, generalDescription: e.target.value })} 
                      />
                    </div>
                  </div>

                  {/* 2. SIRASIYLA ÇALIŞACAK TAKIMLAR PANENLİ */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center px-1">
                      <span className="text-xs font-black text-slate-700 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                        <Layers size={15} className="text-emerald-500" />
                        Sırasıyla Çalışacak Takımlar ({mainForm.tools.length} Takım)
                      </span>
                      <button
                        type="button"
                        onClick={addToolRow}
                        className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-xl transition flex items-center gap-1 shadow-xs"
                      >
                        <PlusIcon size={14} /> + Takım Satırı Ekle
                      </button>
                    </div>

                    <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar pr-1">
                      {mainForm.tools.map((tool, idx) => (
                        <div key={idx} className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 grid grid-cols-12 gap-2 items-center">
                          <div className="col-span-1 text-center font-black text-xs text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-950 py-2 rounded-xl border border-purple-200 dark:border-purple-800">
                            #{idx + 1}
                          </div>

                          <div className="col-span-4">
                            <input
                              type="text"
                              placeholder={`Takım #${idx + 1} (Örn: D20 R0.5 Torik)`}
                              className="w-full p-2 text-xs font-mono font-bold border dark:border-slate-600 rounded-xl bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 focus:ring-2 focus:ring-emerald-500"
                              value={tool.toolInfo}
                              onChange={e => updateToolRow(idx, 'toolInfo', e.target.value)}
                            />
                          </div>

                          <div className="col-span-3">
                            <input
                              type="text"
                              placeholder="Boy (Örn: L60 mm)"
                              className="w-full p-2 text-xs font-mono font-bold border dark:border-slate-600 rounded-xl bg-white dark:bg-slate-800 text-purple-600 dark:text-purple-400 focus:ring-2 focus:ring-purple-500"
                              value={tool.toolLength}
                              onChange={e => updateToolRow(idx, 'toolLength', e.target.value)}
                            />
                          </div>

                          <div className="col-span-3">
                            <input
                              type="text"
                              placeholder="Takıma Özel Not (Örn: Kaba paso)"
                              className="w-full p-2 text-xs font-medium border dark:border-slate-600 rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                              value={tool.description}
                              onChange={e => updateToolRow(idx, 'description', e.target.value)}
                            />
                          </div>

                          <div className="col-span-1 text-center">
                            {mainForm.tools.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removeToolRow(idx)}
                                className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-xl transition"
                                title="Satırı Sil"
                              >
                                <TrashIcon size={16} />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                /* Düzenleme Modu */
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-slate-50 dark:bg-slate-900 rounded-xl border dark:border-slate-700">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">🛠️ Takım Bilgisi</label>
                    <input 
                      type="text" 
                      className="w-full p-2 text-xs font-mono font-bold border dark:border-slate-600 rounded-xl bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400" 
                      value={editSingleData.toolInfo} 
                      onChange={e => setEditSingleData({ ...editSingleData, toolInfo: e.target.value })} 
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">📏 Boy (mm)</label>
                    <input 
                      type="text" 
                      className="w-full p-2 text-xs font-mono font-bold border dark:border-slate-600 rounded-xl bg-white dark:bg-slate-800 text-purple-600 dark:text-purple-400" 
                      value={editSingleData.toolLength} 
                      onChange={e => setEditSingleData({ ...editSingleData, toolLength: e.target.value })} 
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">Sıra No</label>
                    <input 
                      type="number" 
                      min="1"
                      className="w-full p-2 text-xs font-bold border dark:border-slate-600 rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-white" 
                      value={editSingleData.priority} 
                      onChange={e => setEditSingleData({ ...editSingleData, priority: parseInt(e.target.value) || 1 })} 
                    />
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-2 justify-end border-t dark:border-slate-700">
                <button 
                  type="button" 
                  onClick={cancelEdit}
                  className="py-2.5 px-4 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs rounded-xl hover:bg-slate-300"
                >
                  İptal
                </button>
                <button 
                  type="submit" 
                  className="py-2.5 px-6 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-black text-xs rounded-xl shadow-md shadow-blue-500/20 flex items-center justify-center gap-2"
                >
                  {editingId ? <><SaveIcon size={16}/> Güncellemeyi Kaydet</> : <><PlusIcon size={16}/> 🚀 Planı Vardiyaya Kaydet ({mainForm.tools.length} Takım)</>}
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. TEZGAH OPERATÖRÜ TAKİP & İŞARETLEME EKRANI */}
      {/* ========================================================================= */}
      {activeTab === 'operator' && (
        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
          
          <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-sm border dark:border-slate-700 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
            <div>
              <h2 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                <Wrench className="text-emerald-600 w-5 h-5" /> Tezgah Operatörü Gece Vardiyası İş Takibi
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Tezgahlara ait sıralı takım programları gruplanmış liste halinde aşağıda sunulmaktadır.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-900 p-1.5 rounded-xl border border-slate-200 dark:border-slate-700">
                <UserCheck size={14} className="text-emerald-500" />
                <span className="text-xs font-bold text-slate-500">Varsayılan Operatör:</span>
                <input 
                  type="text"
                  placeholder="İsminiz..."
                  value={operatorNameInput}
                  onChange={(e) => setOperatorNameInput(e.target.value)}
                  className="bg-transparent text-xs font-black text-slate-900 dark:text-white outline-none w-32"
                />
              </div>

              <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-900 p-1.5 rounded-xl border border-slate-200 dark:border-slate-700">
                <Filter size={14} className="text-blue-500" />
                <span className="text-xs font-bold text-slate-500">Tezgah Filtresi:</span>
                <select
                  value={operatorMachineFilter}
                  onChange={(e) => setOperatorMachineFilter(e.target.value)}
                  className="bg-transparent text-xs font-black text-slate-900 dark:text-white outline-none"
                >
                  <option value="all" className="dark:bg-slate-800">🖥️ Tüm Tezgahlar ({tvShiftPlans.length})</option>
                  {availableMachinesInActive.map(mId => (
                    <option key={mId} value={mId} className="dark:bg-slate-800">🖥️ {mId}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* TEZGAH OPERATÖRÜ GRUPLANMIŞ LİSTE GÖRÜNÜMÜ */}
          <div className="space-y-4">
            {groupedOperatorPlans.length === 0 ? (
              <div className="p-12 text-center text-slate-500 bg-white dark:bg-slate-800 rounded-2xl border dark:border-slate-700 font-bold">
                Seçilen tezgahta aktif bekleyen veya tamamlanan gece vardiyası işi bulunmuyor.
              </div>
            ) : (
              groupedOperatorPlans.map((group, groupIdx) => (
                <div 
                  key={group.key} 
                  className={`bg-white dark:bg-slate-800 rounded-2xl shadow-sm border overflow-hidden transition-all ${
                    groupIdx === 0 
                      ? 'border-red-500/80 ring-2 ring-red-500/30' 
                      : groupIdx === 1 
                      ? 'border-amber-400/80' 
                      : 'border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <div className={`px-4 py-3 border-b flex flex-wrap justify-between items-center gap-2 ${
                    groupIdx === 0 
                      ? 'bg-gradient-to-r from-red-950/40 via-slate-900 to-slate-900 border-red-500/40' 
                      : 'bg-slate-100 dark:bg-slate-900 border-slate-200 dark:border-slate-700'
                  }`}>
                    <div className="flex flex-wrap items-center gap-3">
                      {/* YÖNETİCİ & CAM YETKİLİLERİ İÇİN TEZGAH GRUBU SIRALAMA DÜĞMELERİ */}
                      {canReorderJobs && (
                        <div className="flex items-center gap-1 bg-slate-200 dark:bg-slate-800 p-1 rounded-xl border border-slate-300 dark:border-slate-700">
                          <button
                            type="button"
                            disabled={groupIdx === 0}
                            onClick={() => handleMoveMachineGroup(groupIdx, 'up')}
                            className="p-1 rounded-lg bg-white dark:bg-slate-700 hover:bg-blue-100 dark:hover:bg-blue-900 text-slate-700 dark:text-slate-200 disabled:opacity-20 transition shadow-xs"
                            title="Tezgah Sırasını Yukarı Taşı"
                          >
                            <ArrowUp size={14} />
                          </button>
                          <button
                            type="button"
                            disabled={groupIdx === groupedOperatorPlans.length - 1}
                            onClick={() => handleMoveMachineGroup(groupIdx, 'down')}
                            className="p-1 rounded-lg bg-white dark:bg-slate-700 hover:bg-blue-100 dark:hover:bg-blue-900 text-slate-700 dark:text-slate-200 disabled:opacity-20 transition shadow-xs"
                            title="Tezgah Sırasını Aşağı Taşı"
                          >
                            <ArrowDown size={14} />
                          </button>
                        </div>
                      )}

                      {/* TEZGAH KODU */}
                      <span className="font-mono font-black text-lg text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/80 px-3 py-1 rounded-xl border border-blue-200 dark:border-blue-800">
                        🖥️ {group.machineId}
                      </span>

                      {/* ÖNCELİKLİ TEZGAH BELİRGİN ROZETLERİ */}
                      {groupIdx === 0 ? (
                        <span className="text-xs font-black bg-gradient-to-r from-red-600 via-orange-600 to-amber-600 text-white px-3 py-1 rounded-xl shadow-md shadow-red-500/30 animate-pulse border border-red-400 flex items-center gap-1.5">
                          🔥 1. ACİL ÖNCELİKLİ TEZGAH
                        </span>
                      ) : groupIdx === 1 ? (
                        <span className="text-xs font-black bg-amber-500 text-slate-950 px-3 py-1 rounded-xl shadow-xs border border-amber-300 flex items-center gap-1.5">
                          ⭐ 2. ÖNCELİKLİ TEZGAH
                        </span>
                      ) : groupIdx === 2 ? (
                        <span className="text-xs font-black bg-blue-600 text-white px-3 py-1 rounded-xl border border-blue-400 flex items-center gap-1.5">
                          📌 3. SIRADA
                        </span>
                      ) : (
                        <span className="text-xs font-bold bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2.5 py-1 rounded-xl border dark:border-slate-700">
                          📌 {groupIdx + 1}. SIRADA
                        </span>
                      )}

                      <div>
                        <span className="font-black text-base text-slate-900 dark:text-white uppercase mr-2">
                          📦 {group.moldName}
                        </span>
                        {group.partName && (
                          <span className="font-bold text-xs text-slate-500 dark:text-slate-400">
                            ⚙️ {group.partName}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-xs font-semibold text-slate-500">
                        CAM Sorumlu: <b className="text-slate-800 dark:text-slate-200">{group.addedBy}</b>
                      </span>
                      <span className="text-xs font-black bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 px-2.5 py-1 rounded-xl border border-purple-200 dark:border-purple-800">
                        {group.plans.length} Sıralı Takım Programı
                      </span>
                    </div>
                  </div>

                  {/* GENEL VARDİYA NOTU BANNERI (GRUP SEVİYESİNDE EN ÜSTTE) */}
                  {getGroupGeneralNote(group) && (
                    <div className="bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-900/60 px-4 py-2 flex items-center gap-2 text-xs text-amber-900 dark:text-amber-200">
                      <span className="text-amber-500 text-sm">💡</span>
                      <span className="font-black uppercase text-[10px] text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/60 px-2 py-0.5 rounded-md border border-amber-300 dark:border-amber-700 shrink-0">
                        Genel Vardiya Notu
                      </span>
                      <span className="italic font-bold">"{getGroupGeneralNote(group)}"</span>
                    </div>
                  )}

                  <div className="divide-y divide-slate-100 dark:divide-slate-700/60">
                    {group.plans.map(plan => {
                      return (
                        <div key={plan.id} className="p-3.5 hover:bg-slate-50/50 dark:hover:bg-slate-700/30 transition flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                          <div className="flex items-start md:items-center gap-3 flex-1 min-w-0">
                            <span className="text-xs font-mono font-black text-amber-500 bg-amber-100 dark:bg-amber-950/80 px-2.5 py-1 rounded-lg border border-amber-300 dark:border-amber-700 shrink-0">
                              #{plan.priority}
                            </span>

                            <div className="space-y-0.5 min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-3 text-xs">
                                <span className="font-mono font-black text-emerald-600 dark:text-emerald-400 text-sm">
                                  🛠️ {plan.toolInfo || 'Takım Belirtilmedi'}
                                </span>
                                {plan.toolLength && (
                                  <span className="font-mono font-black text-purple-600 dark:text-purple-400 text-xs">
                                    📏 Boy: {plan.toolLength}
                                  </span>
                                )}
                              </div>

                              {getCleanToolDescription(plan) && (
                                <div className="text-[11px] text-slate-600 dark:text-slate-400 italic truncate" title={getCleanToolDescription(plan)}>
                                  💡 Takım Notu: "{getCleanToolDescription(plan)}"
                                </div>
                              )}

                              {(plan.operatorName || plan.operatorNote) && (
                                <div className="text-[11px] text-emerald-700 dark:text-emerald-300 font-bold truncate">
                                  ✍️ Yapan: <b>{plan.operatorName || 'Operatör'}</b> {plan.operatorNote ? `("${plan.operatorNote}")` : ''}
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5 shrink-0 w-full md:w-auto justify-end border-t md:border-t-0 pt-2 md:pt-0 dark:border-slate-700">
                            <button
                              type="button"
                              onClick={() => openStatusModal(plan, 'ISLENIYOR')}
                              className={`py-1.5 px-2.5 rounded-xl text-xs font-black transition flex items-center gap-1 ${
                                plan.status === 'ISLENIYOR'
                                  ? 'bg-blue-600 text-white shadow-md'
                                  : 'bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-300'
                              }`}
                            >
                              <PlayCircle size={13} /> ▶️ İşleniyor
                            </button>

                            <button
                              type="button"
                              onClick={() => openStatusModal(plan, 'TAMAMLANDI')}
                              className={`py-1.5 px-2.5 rounded-xl text-xs font-black transition flex items-center gap-1 ${
                                plan.status === 'TAMAMLANDI'
                                  ? 'bg-emerald-600 text-white shadow-md'
                                  : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300'
                              }`}
                            >
                              <CheckCircle size={13} /> ✅ Tamamlandı
                            </button>

                            <button
                              type="button"
                              onClick={() => openStatusModal(plan, 'PROBLEM')}
                              className={`py-1.5 px-2.5 rounded-xl text-xs font-black transition flex items-center gap-1 ${
                                plan.status === 'PROBLEM' || plan.status === 'DURDU'
                                  ? 'bg-red-600 text-white shadow-md'
                                  : 'bg-red-50 text-red-700 hover:bg-red-100 dark:bg-red-950 dark:text-red-300'
                              }`}
                            >
                              <AlertTriangle size={13} /> ⚠️ Problem
                            </button>

                            <button
                              type="button"
                              onClick={() => openStatusModal(plan, 'BEKLIYOR')}
                              className={`py-1.5 px-2.5 rounded-xl text-xs font-black transition flex items-center gap-1 ${
                                plan.status === 'BEKLIYOR'
                                  ? 'bg-amber-600 text-white shadow-md'
                                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200'
                              }`}
                            >
                              <Clock size={13} /> ⏳ Bekliyor
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* OPERATÖR İSİM VE NOT İSTEME MODAL POPUP */}
      {/* ========================================================================= */}
      {statusModal.open && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-2xl border dark:border-slate-700 max-w-md w-full p-6 space-y-4">
            
            <div className="flex justify-between items-start border-b dark:border-slate-700 pb-3">
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <UserCheck className="text-emerald-500 w-5 h-5" /> İş Durumu & Operatör Bilgisi
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  <b>{statusModal.plan?.moldName}</b> ({statusModal.plan?.machineId})
                </p>
              </div>
              <button 
                onClick={() => setStatusModal({ open: false, plan: null, targetStatus: '', operatorName: '', note: '' })}
                className="text-slate-400 hover:text-slate-600"
              >
                <XIcon size={20} />
              </button>
            </div>

            <form onSubmit={confirmStatusUpdate} className="space-y-3">
              <div className="p-3 rounded-2xl bg-slate-100 dark:bg-slate-900 flex justify-between items-center border dark:border-slate-700">
                <span className="text-xs font-bold text-slate-500">Seçilen Durum:</span>
                <span className="text-xs font-black px-3 py-1 rounded-xl bg-blue-600 text-white uppercase">
                  {statusModal.targetStatus}
                </span>
              </div>

              <div>
                <label className="block text-xs font-black text-slate-700 dark:text-slate-200 mb-1">
                  👤 İşi Yapan Operatör Adı Soyadı *
                </label>
                <input 
                  type="text"
                  required
                  placeholder="Örn: Ahmet Yılmaz"
                  value={statusModal.operatorName}
                  onChange={(e) => setStatusModal({ ...statusModal, operatorName: e.target.value })}
                  className="w-full p-2.5 text-xs font-black border dark:border-slate-600 rounded-xl bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">
                  ✍️ Operatör Notu / Açıklama (İsteğe Bağlı)
                </label>
                <textarea
                  rows="2"
                  placeholder="Örn: 03:30'da bitti, paso miktarı düşürüldü..."
                  value={statusModal.note}
                  onChange={(e) => setStatusModal({ ...statusModal, note: e.target.value })}
                  className="w-full p-2.5 text-xs font-medium border dark:border-slate-600 rounded-xl bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setStatusModal({ open: false, plan: null, targetStatus: '', operatorName: '', note: '' })}
                  className="flex-1 py-2.5 px-4 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs rounded-xl hover:bg-slate-300"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 px-4 bg-emerald-600 text-white font-black text-xs rounded-xl hover:bg-emerald-700 shadow-md shadow-emerald-500/20 flex items-center justify-center gap-1.5"
                >
                  <Check size={16} /> Durumu ve İsim Kaydet
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. TV MODU CANLI İZLEME EKRANI */}
      {/* ========================================================================= */}
      {activeTab === 'tv' && (
        <div className="h-screen max-h-screen flex flex-col bg-slate-950 p-4 text-white overflow-hidden justify-between">
          
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 px-2 shrink-0 border-b border-slate-800 pb-2.5">
            <div>
              <h1 className="text-xl font-black text-blue-500 tracking-tighter uppercase flex items-center gap-2">
                <MonitorIcon className="w-6 h-6 text-blue-400 animate-pulse" />
                CANLI GECE VARDİYASI İŞ AKIŞI & SABAH İZLEME PANOSU
              </h1>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Tezgahlara ait işler gruplanmış satır satır liste görünümünde sunulmaktadır.
              </p>
            </div>
            
            <div className="flex items-center gap-3">
              {totalTvPages > 1 && (
                <div className="flex items-center gap-2 bg-purple-950/80 border border-purple-700 px-3 py-1 rounded-xl text-xs font-mono font-black text-purple-300">
                  <RefreshCw size={13} className="animate-spin text-purple-400" />
                  <span>SAYFA {currentTvPage + 1} / {totalTvPages}</span>
                  <span className="text-[10px] opacity-75 font-sans">(10sn Otomatik Geçiş)</span>
                </div>
              )}

              <button
                type="button"
                onClick={() => setTvShiftOnly(!tvShiftOnly)}
                className={`px-2.5 py-1 rounded-xl text-xs font-black transition flex items-center gap-1 border ${
                  tvShiftOnly ? 'bg-blue-900/60 text-blue-300 border-blue-700' : 'bg-slate-800 text-slate-300 border-slate-700'
                }`}
              >
                <Clock size={13} /> {tvShiftOnly ? 'Son Vardiya' : 'Tüm Bitenler'}
              </button>

              <div className="text-right">
                <div className="text-xl font-mono font-black text-slate-100">{new Date().toLocaleTimeString().slice(0,5)}</div>
              </div>

              <button 
                onClick={() => setActiveTab(isMachineOperator ? 'operator' : 'planning')}
                className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition"
                title="Çıkış"
              >
                <XIcon size={16} />
              </button>
            </div>
          </div>

          {/* SABAH VARDİYA ÖZET KPİ KARTLARI */}
          <div className="grid grid-cols-5 gap-2 my-2 shrink-0">
            <div className="p-2 rounded-xl bg-slate-900 border border-slate-800">
              <span className="text-[10px] font-extrabold text-slate-400 uppercase">Vardiya İşi</span>
              <div className="text-xl font-black text-white">{totalShiftPlans}</div>
            </div>

            <div className="p-2 rounded-xl bg-emerald-950/80 border border-emerald-700/60 text-emerald-100">
              <span className="text-[10px] font-extrabold uppercase text-emerald-300">✅ Tamamlanan</span>
              <div className="text-xl font-black text-emerald-300">{completedCount} <span className="text-[10px]">(%{successRate})</span></div>
            </div>

            <div className="p-2 rounded-xl bg-blue-950/80 border border-blue-700/60 text-blue-100">
              <span className="text-[10px] font-extrabold uppercase text-blue-300">▶️ Çalışan</span>
              <div className="text-xl font-black text-blue-300">{inProgressCount}</div>
            </div>

            <div className="p-2 rounded-xl bg-red-950/80 border border-red-700/60 text-red-100">
              <span className="text-[10px] font-extrabold uppercase text-red-300">⚠️ Problem</span>
              <div className="text-xl font-black text-red-300">{problemCount}</div>
            </div>

            <div className="p-2 rounded-xl bg-slate-900 border border-slate-800">
              <span className="text-[10px] font-extrabold text-amber-400 uppercase">⏳ Bekleyen</span>
              <div className="text-xl font-black text-amber-300">{pendingCount}</div>
            </div>
          </div>

          {/* TV MODU SATIR SATIR GRUPLANMIŞ LİSTE GÖRÜNÜMÜ */}
          <div className="flex-1 overflow-hidden space-y-3">
            {visibleTvEntries.length === 0 ? (
              <div className="h-full flex items-center justify-center p-8 text-center text-slate-500 bg-slate-900/50 rounded-2xl border border-slate-800 font-bold">
                Gece vardiyası için kayıtlı iş bulunmuyor.
              </div>
            ) : (
              visibleTvEntries.map((group) => (
                <div key={group.key} className="border border-slate-800 rounded-2xl bg-slate-900/90 overflow-hidden shadow-xl">
                  <div className="bg-slate-800/90 px-4 py-2 flex items-center justify-between border-b border-slate-700">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-mono text-amber-400 font-black bg-amber-950/80 border border-amber-500/40 px-2.5 py-0.5 rounded-lg">
                        🖥️ {group.machineId}
                      </span>
                      <span className="text-base font-black uppercase text-yellow-300">
                        📦 {group.moldName} {group.partName ? `(${group.partName})` : ''}
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold text-slate-300">
                        👤 CAM: <b>{group.addedBy}</b>
                      </span>
                      <span className="text-xs font-black bg-purple-950 text-purple-300 px-2.5 py-0.5 rounded-xl border border-purple-800">
                        {group.plans.length} Sıralı Takım Programı
                      </span>
                    </div>
                  </div>

                  {/* GENEL VARDİYA NOTU BANNERI (TV MODU EN ÜSTTE) */}
                  {getGroupGeneralNote(group) && (
                    <div className="bg-amber-950/60 border-b border-amber-800/60 px-4 py-1.5 flex items-center gap-2 text-xs text-amber-200">
                      <span className="text-amber-400 text-sm">💡</span>
                      <span className="font-black uppercase text-[10px] text-amber-400 bg-amber-900/80 px-2 py-0.5 rounded-md border border-amber-700 shrink-0">
                        Genel Vardiya Notu
                      </span>
                      <span className="italic font-bold">"{getGroupGeneralNote(group)}"</span>
                    </div>
                  )}

                  <div className="divide-y divide-slate-800/80">
                    {group.plans.map((plan) => {
                      const statusBadge = getStatusBadge(plan.status);

                      return (
                        <div 
                          key={plan.id} 
                          className={`grid grid-cols-12 items-center px-4 py-2.5 transition-all text-xs ${
                            plan.status === 'TAMAMLANDI'
                              ? 'bg-emerald-950/30 border-l-4 border-emerald-500'
                              : plan.status === 'ISLENIYOR' 
                              ? 'bg-blue-900/30 border-l-4 border-blue-500' 
                              : plan.status === 'PROBLEM' || plan.status === 'DURDU'
                              ? 'bg-red-900/30 border-l-4 border-red-500'
                              : 'border-l-4 border-transparent'
                          }`}
                        >
                          <div className="col-span-4 flex items-center gap-2 min-w-0">
                            <span className="text-xs font-mono text-amber-400 font-black shrink-0">
                              #{plan.priority}
                            </span>
                            <span className="text-sm font-mono text-emerald-400 font-black flex items-center gap-1.5 truncate">
                              <Wrench size={15} className="shrink-0 text-emerald-400" />
                              <span>{plan.toolInfo || 'Takım Belirtilmedi'}</span>
                            </span>
                          </div>

                          <div className="col-span-2 font-mono text-purple-300 font-extrabold flex items-center gap-1 text-xs truncate">
                            {plan.toolLength ? (
                              <>
                                <Ruler size={14} className="shrink-0 text-purple-400" />
                                <span>Boy: {plan.toolLength}</span>
                              </>
                            ) : '-'}
                          </div>

                          <div className="col-span-3 truncate text-xs">
                            {plan.operatorName ? (
                              <span className="text-emerald-300 font-black flex items-center gap-1 truncate">
                                <UserCheck size={14} className="shrink-0 text-emerald-400" />
                                <span>YAPAN: {plan.operatorName}</span>
                                {plan.operatorNote && <span className="text-slate-400 font-normal italic">("{plan.operatorNote}")</span>}
                              </span>
                            ) : getCleanToolDescription(plan) ? (
                              <span className="text-slate-400 italic truncate" title={getCleanToolDescription(plan)}>
                                💡 Takım Notu: {getCleanToolDescription(plan)}
                              </span>
                            ) : (
                              <span className="text-slate-600 italic text-[11px]">Bekliyor</span>
                            )}
                          </div>

                          <div className="col-span-3 text-right flex items-center justify-end gap-2">
                            <span className={`text-[11px] font-black px-2.5 py-1 rounded-lg uppercase tracking-wider ${statusBadge.bg}`}>
                              {statusBadge.label}
                            </span>
                            {plan.completedAt && (
                              <span className="text-[10px] font-mono text-emerald-400 font-bold shrink-0">
                                ⏱️ {new Date(plan.completedAt.toDate ? plan.completedAt.toDate() : plan.completedAt).toLocaleTimeString().slice(0,5)}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="text-center text-[10px] text-slate-500 font-bold border-t border-slate-900 pt-1 shrink-0">
            TV MODU CANLI İZLEME PANELİ • SATIR SATIR GRUPLANMIŞ LİSTE VE OTOMATİK SAYFALAMA AKTİF
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. KAYIT DEFTERİ (GEÇMİŞ TAMAMLANAN İŞLER ARŞİVİ) */}
      {/* ========================================================================= */}
      {activeTab === 'history' && !isMachineOperator && (
        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-4">
          
          {/* FİLTRELEME VE ARAMA ÜST BARI */}
          <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-sm border dark:border-slate-700 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
            <div>
              <h2 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                <HistoryIcon className="text-blue-600 w-5 h-5" /> Geçmiş Gece Vardiyası Kayıt Defteri
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Gündüz, haftalık veya aylık bazda tamamlanan tüm işleri inceleyin.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* TARİH FİLTRE DÜĞMELERİ */}
              <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setHistoryDateFilter('today')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black transition ${
                    historyDateFilter === 'today'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800'
                  }`}
                >
                  📅 Bugün
                </button>

                <button
                  type="button"
                  onClick={() => setHistoryDateFilter('week')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black transition ${
                    historyDateFilter === 'week'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800'
                  }`}
                >
                  🗓️ Bu Hafta
                </button>

                <button
                  type="button"
                  onClick={() => setHistoryDateFilter('month')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black transition ${
                    historyDateFilter === 'month'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800'
                  }`}
                >
                  📆 Bu Ay
                </button>

                <button
                  type="button"
                  onClick={() => setHistoryDateFilter('all')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black transition ${
                    historyDateFilter === 'all'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800'
                  }`}
                >
                  📜 Tüm Zamanlar
                </button>
              </div>

              {/* TEZGAH SEÇİMİ */}
              <select
                value={historyMachineFilter}
                onChange={(e) => setHistoryMachineFilter(e.target.value)}
                className="bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-800 dark:text-slate-200 rounded-xl p-2 focus:outline-none"
              >
                <option value="all">🖥️ Tüm Tezgahlar</option>
                {mergedMachines.map(m => (
                  <option key={m.name} value={m.name}>🖥️ {m.name}</option>
                ))}
              </select>

              {/* ARAMA İNPUTU */}
              <input
                type="text"
                placeholder="Kalıp, parça veya operatör ara..."
                value={historySearchTerm}
                onChange={(e) => setHistorySearchTerm(e.target.value)}
                className="bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-800 dark:text-slate-200 rounded-xl p-2 w-48 focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>

          {/* TABLO KARTI */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border dark:border-slate-700 overflow-hidden">
            <div className="p-4 border-b dark:border-slate-700 font-bold flex justify-between items-center bg-slate-50/50 dark:bg-slate-900/50">
              <span className="flex items-center gap-2 text-slate-900 dark:text-white text-xs uppercase tracking-wider font-black">
                📋 Gösterilen Kayıt Sayısı: {filteredHistoryPlans.length} / {allCompletedPlans.length}
              </span>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 dark:bg-slate-900 text-slate-500 uppercase text-[10px] font-black border-b dark:border-slate-700">
                  <tr>
                    <th className="p-3">Tezgah</th>
                    <th className="p-3">Kalıp / Parça</th>
                    <th className="p-3">Takım & Boy</th>
                    <th className="p-3">Vardiya & Takım Notları</th>
                    <th className="p-3">İşi Yapan Operatör</th>
                    <th className="p-3">CAM Sorumlu</th>
                    <th className="p-3">Bitiş Tarihi</th>
                    <th className="p-3 text-right">İşlem</th>
                  </tr>
                </thead>
                <tbody className="divide-y dark:divide-slate-700">
                  {filteredHistoryPlans.length === 0 ? (
                    <tr><td colSpan="8" className="p-8 text-center text-slate-500 font-bold">Seçilen filtrelere uygun geçmiş tamamlanmış gece vardiyası kaydı bulunmuyor.</td></tr>
                  ) : (
                    filteredHistoryPlans.map(plan => (
                      <tr key={plan.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition">
                        <td className="p-3 font-mono font-black text-blue-600 dark:text-blue-400">{plan.machineId}</td>
                        <td className="p-3">
                          <div className="font-extrabold text-slate-900 dark:text-white">{plan.moldName}</div>
                          <div className="text-slate-500">{plan.partName || '-'}</div>
                        </td>
                        <td className="p-3 font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                          {plan.toolInfo ? `🛠️ ${plan.toolInfo}` : ''} {plan.toolLength ? `| 📏 ${plan.toolLength}` : ''}
                        </td>
                        <td className="p-3">
                          {plan.generalDescription && (
                            <div className="text-[11px] text-amber-700 dark:text-amber-300 font-bold">
                              💡 Genel Vardiya: "{plan.generalDescription}"
                            </div>
                          )}
                          {getCleanToolDescription(plan) && (
                            <div className="text-[11px] text-slate-600 dark:text-slate-400 italic">
                              🔧 Takım Notu: "{getCleanToolDescription(plan)}"
                            </div>
                          )}
                          {!plan.generalDescription && !getCleanToolDescription(plan) && <span className="text-slate-400">-</span>}
                        </td>
                        <td className="p-3 font-black text-emerald-600 dark:text-emerald-400">
                          {plan.operatorName ? `👤 ${plan.operatorName}` : '-'}
                          {plan.operatorNote && <div className="text-[10px] text-slate-400 italic font-normal">"{plan.operatorNote}"</div>}
                        </td>
                        <td className="p-3 font-semibold text-slate-500">{plan.addedBy}</td>
                        <td className="p-3 text-slate-400 font-mono text-[11px]">
                          {plan.completedAt?.toDate ? plan.completedAt.toDate().toLocaleString() : (plan.completedAt ? new Date(plan.completedAt).toLocaleString() : '-')}
                        </td>
                        <td className="p-3 text-right">
                          <button onClick={() => updateStatusDirect(plan.id, 'BEKLIYOR')} className="text-blue-500 hover:text-blue-700 font-bold mr-3">Geri Al</button>
                          <button onClick={() => deletePlan(plan.id)} className="text-red-500 hover:text-red-700"><TrashIcon size={15} /></button>
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
    </div>
  );
};

export default NightShiftPlanner;