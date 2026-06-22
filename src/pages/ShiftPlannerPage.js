// src/pages/ShiftPlannerPage.js

import React, { useState, useEffect, useMemo } from 'react';
import { collection, addDoc, onSnapshot, query, deleteDoc, doc, setDoc } from 'firebase/firestore';
import { Calendar, Users, Moon, Clock, MapPin, Search, Download, Info, Check, X, Edit, Trash2 } from 'lucide-react';
import html2pdf from 'html2pdf.js';

const ShiftPlannerPage = ({ db, loggedInUser, personnel }) => {
  const [activeTab, setActiveTab] = useState('weekly');
  const [weeklyMode, setWeeklyMode] = useState('mesai'); // 'mesai' veya 'gece'
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [plans, setPlans] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Tabloda manuel eklenen ve geçici olarak gösterilen personeller
  const [manuallyAddedIds, setManuallyAddedIds] = useState([]);

  // Semt Düzenleme State
  const [editingDistrictId, setEditingDistrictId] = useState(null);
  const [editDistrictValue, setEditDistrictValue] = useState('');

  // Filtre ve Sıralama State'leri
  const [selectedDistrictFilter, setSelectedDistrictFilter] = useState('');
  const [sortBy, setSortBy] = useState('name'); // 'name' veya 'district'

  // Arama özellikli dropdown state'leri
  const [isSelectorOpen, setIsSelectorOpen] = useState(false);
  const [selectorSearchQuery, setSelectorSearchQuery] = useState('');

  // Haftalık semt geçersiz kılmaları state'i
  const [weeklyOverrides, setWeeklyOverrides] = useState({});

  // Verileri Canlı Dinle
  useEffect(() => {
    if (!db) return;
    const qPlans = query(collection(db, "shift_plans"));
    const unsubscribePlans = onSnapshot(qPlans, (snapshot) => {
      setPlans(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const qDistricts = query(collection(db, "personnel_districts"));
    const unsubscribeDistricts = onSnapshot(qDistricts, (snapshot) => {
      setDistricts(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const qOverrides = query(collection(db, "weekly_district_overrides"));
    const unsubscribeOverrides = onSnapshot(qOverrides, (snapshot) => {
      const map = {};
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        map[`${data.personnelId}_${data.weekStartDate}`] = data.district;
      });
      setWeeklyOverrides(map);
    });

    return () => {
      unsubscribePlans();
      unsubscribeDistricts();
      unsubscribeOverrides();
    };
  }, [db]);

  // Hafta değişince manuel eklenenleri sıfırla
  useEffect(() => {
    setManuallyAddedIds([]);
  }, [selectedDate]);

  // Semt eşleşme haritası (Hızlı erişim için)
  const districtMap = useMemo(() => {
    const map = {};
    districts.forEach(d => {
      map[d.personnelId] = d.district;
    });
    return map;
  }, [districts]);

  // Benzersiz Semt Listesi (Filtreleme ve seçimler için)
  const uniqueDistricts = useMemo(() => {
    const set = new Set();
    districts.forEach(d => {
      if (d.district && d.district.trim().toUpperCase() !== "KENDİ") {
        set.add(d.district.trim().toUpperCase());
      }
    });
    return Array.from(set).sort();
  }, [districts]);

  // Vardiya planlaması yapılacak tüm personeller
  const eligiblePersonnel = useMemo(() => {
    return personnel.filter(p => 
      p.role === 'CAM Operatörü' || 
      p.role === 'CAM Sorumlusu' || 
      p.role === 'Tezgah Operatörü' || 
      p.role === 'CNC Torna Operatörü' ||
      p.role === 'CNC Torna Sorumlusu' ||
      p.role === 'Montaj Elemanı' ||
      p.role === 'Montaj Sorumlusu'
    ).sort((a, b) => a.name.localeCompare(b.name));
  }, [personnel]);

  // Haftanın ilk gününü (Pazartesi) bul
  const getStartOfWeek = (d) => {
    const date = new Date(d);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(date.setDate(diff));
  };

  // Seçili tarihin ait olduğu haftanın 7 gününü hesapla
  const weekDays = useMemo(() => {
    const start = getStartOfWeek(selectedDate);
    const days = [];
    for (let i = 0; i < 7; i++) {
      const current = new Date(start);
      current.setDate(start.getDate() + i);
      days.push({
        dateStr: current.toISOString().split('T')[0],
        label: current.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }),
        dayName: current.toLocaleDateString('tr-TR', { weekday: 'long' }),
        dayShort: current.toLocaleDateString('tr-TR', { weekday: 'short' })
      });
    }
    return days;
  }, [selectedDate]);

  // Haftanın başlangıç ve bitiş tarihleri
  const weekLabel = useMemo(() => {
    if (weekDays.length === 0) return "";
    const start = new Date(weekDays[0].dateStr);
    const end = new Date(weekDays[6].dateStr);
    return `${start.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })} - ${end.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}`;
  }, [weekDays]);

  // Hafta Numarasını Hesapla (Kağıttaki "26. HAFTA" ifadesi için)
  const getWeekNumber = (d) => {
    const date = new Date(d);
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
    const week1 = new Date(date.getFullYear(), 0, 4);
    return 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
  };

  // Seçili tarihin ait olduğu haftanın Pazartesi gününün YYYY-MM-DD formatında string'i
  const selectedMondayStr = useMemo(() => {
    const start = getStartOfWeek(selectedDate);
    return start.toISOString().split('T')[0];
  }, [selectedDate]);

  // Eğer seçili tarih cari yılın dışındaysa (örn. geçmiş yıllarda kalmışsa), tarihi bugüne sıfırla
  useEffect(() => {
    const currentYear = new Date().getFullYear();
    const selectedYear = new Date(selectedDate).getFullYear();
    if (selectedYear !== currentYear) {
      setSelectedDate(new Date().toISOString().split('T')[0]);
    }
  }, [selectedDate]);

  // Hafta seçimi listesi için sadece cari (bulunulan) yılın tüm haftaları
  const yearWeeks = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const weeks = [];
    
    const jan4 = new Date(currentYear, 0, 4);
    const day = jan4.getDay();
    const diff = jan4.getDate() - day + (day === 0 ? -6 : 1);
    const firstMonday = new Date(jan4.setDate(diff));
    
    for (let i = 0; i < 53; i++) {
      const start = new Date(firstMonday);
      start.setDate(firstMonday.getDate() + i * 7);
      
      if (start.getFullYear() > currentYear) {
        break;
      }
      
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      
      const weekNum = i + 1;
      const startStr = start.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
      const endStr = end.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
      
      weeks.push({
        weekNum,
        year: currentYear,
        startDateStr: start.toISOString().split('T')[0],
        label: `${weekNum}. Hafta (${startStr} - ${endStr})`
      });
    }
    return weeks;
  }, []);

  // Seçili haftada kaydı olan personellerin ID'leri
  const plannedIdsInWeek = useMemo(() => {
    if (weekDays.length === 0) return [];
    const startStr = weekDays[0].dateStr;
    const endStr = weekDays[6].dateStr;
    const weekPlans = plans.filter(p => p.date >= startStr && p.date <= endStr);
    return Array.from(new Set(weekPlans.map(p => p.personnelId)));
  }, [plans, weekDays]);

  const activePersonnelList = useMemo(() => {
    const allIds = Array.from(new Set([...plannedIdsInWeek, ...manuallyAddedIds]));
    let list = eligiblePersonnel.filter(p => allIds.includes(p.id));
    
    // Arama filtrelemesi
    if (searchQuery.trim()) {
      list = list.filter(p => 
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
        (districtMap[p.id] || "").toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    
    // Semt filtrelemesi
    if (selectedDistrictFilter) {
      list = list.filter(p => {
        const d = (districtMap[p.id] || "KENDİ").toUpperCase();
        return d === selectedDistrictFilter.toUpperCase();
      });
    }
    
    // Sıralama
    if (sortBy === 'district') {
      list.sort((a, b) => {
        const distA = (districtMap[a.id] || "KENDİ").toUpperCase();
        const distB = (districtMap[b.id] || "KENDİ").toUpperCase();
        if (distA === distB) {
          return a.name.localeCompare(b.name);
        }
        return distA.localeCompare(distB);
      });
    } else {
      // Varsayılan: İsim sırası
      list.sort((a, b) => a.name.localeCompare(b.name));
    }
    
    return list;
  }, [eligiblePersonnel, plannedIdsInWeek, manuallyAddedIds, searchQuery, districtMap, selectedDistrictFilter, sortBy]);

  const filteredPersonnel = useMemo(() => {
    return eligiblePersonnel.filter(p => {
      if (!searchQuery.trim()) return true;
      const nameMatch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
      const roleMatch = (p.role || "").toLowerCase().includes(searchQuery.toLowerCase());
      const districtMatchVal = (districtMap[p.id] || "").toLowerCase().includes(searchQuery.toLowerCase());
      return nameMatch || roleMatch || districtMatchVal;
    });
  }, [eligiblePersonnel, searchQuery, districtMap]);

  // Semtlerine göre gruplanmış personel listesi
  const groupedDistricts = useMemo(() => {
    const groups = {};
    
    filteredPersonnel.forEach(p => {
      const dist = (districtMap[p.id] || "KENDİ").trim().toUpperCase();
      if (!groups[dist]) {
        groups[dist] = [];
      }
      groups[dist].push(p);
    });
    
    // Sıralama (KENDİ en sonda, diğerleri alfabetik)
    return Object.keys(groups)
      .sort((a, b) => {
        if (a === "KENDİ") return 1;
        if (b === "KENDİ") return -1;
        return a.localeCompare(b);
      })
      .reduce((obj, key) => {
        obj[key] = groups[key];
        return obj;
      }, {});
  }, [filteredPersonnel, districtMap]);

  // Semt bazlı renk şemaları
  const getDistrictColor = (districtName) => {
    const colors = [
      { bg: 'bg-red-50/50 dark:bg-red-950/10', border: 'border-red-200 dark:border-red-900/50', text: 'text-red-700 dark:text-red-400', badge: 'bg-red-500 text-white' },
      { bg: 'bg-blue-50/50 dark:bg-blue-950/10', border: 'border-blue-200 dark:border-blue-900/50', text: 'text-blue-700 dark:text-blue-400', badge: 'bg-blue-500 text-white' },
      { bg: 'bg-green-50/50 dark:bg-green-950/10', border: 'border-green-200 dark:border-green-900/50', text: 'text-green-700 dark:text-green-400', badge: 'bg-green-500 text-white' },
      { bg: 'bg-amber-50/50 dark:bg-amber-950/10', border: 'border-amber-200 dark:border-amber-900/50', text: 'text-amber-700 dark:text-amber-400', badge: 'bg-amber-500 text-black font-extrabold' },
      { bg: 'bg-purple-50/50 dark:bg-purple-950/10', border: 'border-purple-200 dark:border-purple-900/50', text: 'text-purple-700 dark:text-purple-400', badge: 'bg-purple-500 text-white' },
      { bg: 'bg-pink-50/50 dark:bg-pink-950/10', border: 'border-pink-200 dark:border-pink-900/50', text: 'text-pink-700 dark:text-pink-400', badge: 'bg-pink-500 text-white' },
      { bg: 'bg-indigo-50/50 dark:bg-indigo-950/10', border: 'border-indigo-200 dark:border-indigo-900/50', text: 'text-indigo-700 dark:text-indigo-400', badge: 'bg-indigo-500 text-white' },
      { bg: 'bg-teal-50/50 dark:bg-teal-950/10', border: 'border-teal-200 dark:border-teal-900/50', text: 'text-teal-700 dark:text-teal-400', badge: 'bg-teal-500 text-white' },
      { bg: 'bg-cyan-50/50 dark:bg-cyan-950/10', border: 'border-cyan-200 dark:border-cyan-900/50', text: 'text-cyan-700 dark:text-cyan-400', badge: 'bg-cyan-500 text-white' },
      { bg: 'bg-rose-50/50 dark:bg-rose-950/10', border: 'border-rose-200 dark:border-rose-900/50', text: 'text-rose-700 dark:text-rose-400', badge: 'bg-rose-500 text-white' }
    ];
    
    const dUpper = districtName.toUpperCase();
    if (dUpper === "KENDİ") {
      return { bg: 'bg-slate-50/50 dark:bg-slate-800/20', border: 'border-slate-200 dark:border-slate-700', text: 'text-slate-700 dark:text-slate-300', badge: 'bg-slate-600 text-white' };
    }
    
    let hash = 0;
    for (let i = 0; i < dUpper.length; i++) {
      hash = dUpper.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % colors.length;
    return colors[index];
  };

  // Hücredeki Tıklama (Toggle) İşlemi
  const handleTogglePlan = async (person, dateStr, shiftType) => {
    const existingPlan = plans.find(p => p.personnelId === person.id && p.date === dateStr && p.shiftType === shiftType);

    if (existingPlan) {
      try {
        await deleteDoc(doc(db, "shift_plans", existingPlan.id));
      } catch (err) {
        console.error("Plan silinemedi:", err);
      }
    } else {
      try {
        const activeDist = weeklyOverrides[`${person.id}_${selectedMondayStr}`] || districtMap[person.id] || "KENDİ";
        await addDoc(collection(db, "shift_plans"), {
          date: dateStr,
          personnelId: person.id,
          personnelName: person.name,
          personnelRole: person.role || "Belirtilmemiş",
          shiftType: shiftType,
          district: activeDist,
          updatedBy: loggedInUser?.name || "Bilinmiyor",
          createdAt: new Date().toISOString()
        });
      } catch (err) {
        console.error("Plan oluşturulamadı:", err);
      }
    }
  };

  // Tablodan personeli tamamen kaldır (Vardiya kayıtlarını silip listeden çıkarır)
  const handleRemovePersonFromWeek = async (personId) => {
    if (window.confirm("Bu personelin bu haftaya ait tüm vardiya/mesai planlarını silmek istediğinize emin misiniz?")) {
      const startStr = weekDays[0].dateStr;
      const endStr = weekDays[6].dateStr;
      const personPlans = plans.filter(p => p.personnelId === personId && p.date >= startStr && p.date <= endStr);
      
      try {
        const deletePromises = personPlans.map(p => deleteDoc(doc(db, "shift_plans", p.id)));
        await Promise.all(deletePromises);
        
        setManuallyAddedIds(prev => prev.filter(id => id !== personId));
      } catch (err) {
        console.error("Haftalık planlar temizlenemedi:", err);
      }
    }
  };

  // Semt Bilgisi Güncelleme
  const handleSaveDistrict = async (personnelId, personnelName, val) => {
    const districtValue = val !== undefined ? val : editDistrictValue;
    if (!districtValue || !districtValue.trim()) return;
    try {
      await setDoc(doc(db, "personnel_districts", personnelId), {
        personnelId,
        personnelName,
        district: districtValue.trim(),
        updatedAt: new Date().toISOString()
      });
      setEditingDistrictId(null);
      setEditDistrictValue('');
    } catch (err) {
      console.error("Semt kaydedilemedi:", err);
    }
  };

  // Haftalık Semt Bilgisini Geçici Olarak Kaydetme (Override)
  const handleSaveWeeklyOverride = async (personnelId, val) => {
    const docId = `${personnelId}_${selectedMondayStr}`;
    try {
      await setDoc(doc(db, "weekly_district_overrides", docId), {
        personnelId,
        weekStartDate: selectedMondayStr,
        district: val,
        updatedAt: new Date().toISOString()
      });
      
      // Ayrıca bu personelin bu haftaki shift_plans kayıtlarındaki semt alanını da güncelleyelim.
      const startStr = weekDays[0].dateStr;
      const endStr = weekDays[6].dateStr;
      const personPlans = plans.filter(p => p.personnelId === personnelId && p.date >= startStr && p.date <= endStr);
      const updatePromises = personPlans.map(p => 
        setDoc(doc(db, "shift_plans", p.id), { district: val }, { merge: true })
      );
      await Promise.all(updatePromises);
    } catch (err) {
      console.error("Haftalık semt override kaydedilemedi:", err);
    }
  };

  // Haftalık Gece Vardiyası Personeli Ekleme (Haftanın 7 gününe birden ekler)
  const handleAddNightShiftWeek = async (person) => {
    const activeDist = weeklyOverrides[`${person.id}_${selectedMondayStr}`] || districtMap[person.id] || "KENDİ";
    const promises = weekDays.map(day => {
      // Zaten o güne ait gece vardiyası kaydı varsa ekleme
      const existing = plans.find(p => p.personnelId === person.id && p.date === day.dateStr && p.shiftType === 'GECE_VARDIYASI');
      if (existing) return Promise.resolve();

      return addDoc(collection(db, "shift_plans"), {
        date: day.dateStr,
        personnelId: person.id,
        personnelName: person.name,
        personnelRole: person.role || "Belirtilmemiş",
        shiftType: 'GECE_VARDIYASI',
        district: activeDist,
        updatedBy: loggedInUser?.name || "Bilinmiyor",
        createdAt: new Date().toISOString()
      });
    });
    try {
      await Promise.all(promises);
    } catch (err) {
      console.error("Haftalık gece vardiyası eklenemedi:", err);
    }
  };

  // PDF Olarak Çıktı Alma
  const handleExportPDF = () => {
    const element = document.getElementById('weekly-plan-print-area');
    if (!element) return;

    // PDF modunu aktif et (Yüksek kontrast için sınıf ekle)
    element.classList.add('pdf-print-mode');

    const opt = {
      margin:       [4, 4, 4, 4],
      filename:     `${getWeekNumber(selectedDate)}_Hafta_Kalıphane_Vardiya_Plani.pdf`,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2.5, useCORS: true, logging: false },
      jsPDF:        { unit: 'mm', format: 'a4', orientation: 'landscape' }
    };

    html2pdf().from(element).set(opt).save().then(() => {
      // PDF modunu kaldır
      element.classList.remove('pdf-print-mode');
    });
  };

  // --- VARDİYA TAKİBİ MATRİS PARAMETRELERİ ---
  const daysInMonth = useMemo(() => {
    if (!selectedMonth) return [];
    const [year, month] = selectedMonth.split('-').map(Number);
    const date = new Date(year, month, 0);
    const numDays = date.getDate();
    return Array.from({ length: numDays }, (_, i) => i + 1);
  }, [selectedMonth]);

  const monthName = useMemo(() => {
    if (!selectedMonth) return "";
    const [year, month] = selectedMonth.split('-').map(Number);
    const date = new Date(year, month - 1, 1);
    return date.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' });
  }, [selectedMonth]);

  const monthlyPlans = useMemo(() => {
    return plans.filter(p => p.date.startsWith(selectedMonth));
  }, [plans, selectedMonth]);

  const attendanceMap = useMemo(() => {
    const map = {};
    monthlyPlans.forEach(plan => {
      const dayNum = parseInt(plan.date.split('-')[2], 10);
      if (!map[plan.personnelId]) {
        map[plan.personnelId] = {};
      }
      map[plan.personnelId][dayNum] = plan;
    });
    return map;
  }, [monthlyPlans]);

  return (
    <div className="p-4 bg-white dark:bg-gray-800 rounded-xl shadow-xl min-h-[85vh] flex flex-col transition-colors duration-200 text-gray-900 dark:text-gray-100">
      
      {/* Özel PDF Yazdırma Stilleri */}
      <style>{`
        .pdf-print-mode {
          background-color: #ffffff !important;
          padding: 2px !important;
        }
        .pdf-print-mode * {
          color: #000000 !important;
          text-shadow: none !important;
          box-shadow: none !important;
        }
        .pdf-print-mode table {
          border: 1.5px solid #000000 !important;
          width: 100% !important;
          border-collapse: collapse !important;
          background-color: #ffffff !important;
        }
        .pdf-print-mode th, .pdf-print-mode td {
          border: 1px solid #000000 !important;
          padding: 3px 2px !important;
          text-align: center !important;
          vertical-align: middle !important;
          font-family: sans-serif !important;
        }
        .pdf-print-mode th {
          background-color: #e5e7eb !important;
          font-weight: 800 !important;
          font-size: 9px !important;
        }
        .pdf-print-mode td {
          font-size: 8px !important;
          font-weight: 700;
          background-color: #ffffff !important;
        }
        .pdf-print-mode td div {
          font-size: 9px !important;
        }
        .pdf-print-mode .sticky {
          position: static !important;
          box-shadow: none !important;
          background-color: #ffffff !important;
        }
        .pdf-print-mode .pdf-show {
          display: block !important;
          text-align: center !important;
          margin-bottom: 8px !important;
        }
        .pdf-print-mode .print-hide-btn {
          display: none !important;
        }
        .pdf-print-mode .pdf-active-cell {
          background-color: #f3f4f6 !important;
          font-weight: 900 !important;
          font-size: 8px !important;
        }
      `}</style>

      {/* SEKMELER */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-6 border-b pb-4 dark:border-gray-700 shrink-0">
        <div>
          <h2 className="text-2xl font-black text-gray-900 dark:text-white flex items-center">
            <Calendar className="w-7 h-7 mr-2.5 text-blue-600 dark:text-blue-400" />
            Vardiya & Servis Planlama
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 font-bold mt-1">
            Tek sayfaya sığdırılabilir haftalık planlar ve personel semt kayıtları.
          </p>
        </div>
        <div className="flex gap-2 bg-gray-100 dark:bg-gray-700 p-1 rounded-lg w-full lg:w-auto">
          <button 
            onClick={() => setActiveTab('weekly')} 
            className={`flex-1 lg:flex-none px-5 py-2 rounded-md text-sm font-bold transition-all ${activeTab === 'weekly' ? 'bg-white dark:bg-gray-600 shadow text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}`}
          >
            <Calendar className="w-4 h-4 inline mr-1.5" /> Haftalık Excel Planı
          </button>
          <button 
            onClick={() => setActiveTab('districts')} 
            className={`flex-1 lg:flex-none px-5 py-2 rounded-md text-sm font-bold transition-all ${activeTab === 'districts' ? 'bg-white dark:bg-gray-600 shadow text-green-600 dark:text-green-400' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}`}
          >
            <MapPin className="w-4 h-4 inline mr-1.5" /> Personel Semt Bilgileri
          </button>
          <button 
            onClick={() => setActiveTab('tracking')} 
            className={`flex-1 lg:flex-none px-5 py-2 rounded-md text-sm font-bold transition-all ${activeTab === 'tracking' ? 'bg-white dark:bg-gray-600 shadow text-purple-600 dark:text-purple-400' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}`}
          >
            <Users className="w-4 h-4 inline mr-1.5" /> Vardiya Takibi
          </button>
        </div>
      </div>

      {/* --- TAB 1: HAFTALIK VARDİYA PLANI (EXCEL STİLİ) --- */}
      {activeTab === 'weekly' && (
        <div className="space-y-6 flex-1 flex flex-col min-h-0">
          
          {/* FİLTRE VE ÇIKTI ALMA BARBARI */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-gray-50 dark:bg-gray-700/30 p-4 rounded-xl border dark:border-gray-700 shrink-0">
            <div className="flex items-center gap-3 flex-wrap flex-1 w-full">
              <Calendar className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0" />
              <span className="font-bold text-gray-700 dark:text-gray-300 shrink-0 text-sm">Hafta Seçimi:</span>
              <select
                value={selectedMondayStr}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-950 dark:text-white font-extrabold outline-none focus:ring-2 focus:ring-blue-500 text-xs"
              >
                {yearWeeks.map(w => (
                  <option key={`${w.year}-${w.weekNum}`} value={w.startDateStr} className="bg-white dark:bg-gray-800 text-gray-950 dark:text-white">
                    {w.label}
                  </option>
                ))}
              </select>
              
              {/* RAPOR TİPİ SEÇİCİ (MESAI VEYA GV) */}
              <div className="flex items-center bg-gray-200 dark:bg-gray-700 p-0.5 rounded-lg text-xs font-bold shadow-inner">
                <button
                  type="button"
                  onClick={() => setWeeklyMode('mesai')}
                  className={`px-3 py-1.5 rounded-md transition-all ${weeklyMode === 'mesai' ? 'bg-white dark:bg-gray-600 text-purple-600 dark:text-purple-400 shadow' : 'text-gray-500 hover:text-gray-700 dark:text-gray-300'}`}
                >
                  Mesai Listesi
                </button>
                <button
                  type="button"
                  onClick={() => setWeeklyMode('gece')}
                  className={`px-3 py-1.5 rounded-md transition-all ${weeklyMode === 'gece' ? 'bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-400 shadow' : 'text-gray-500 hover:text-gray-700 dark:text-gray-300'}`}
                >
                  Gece Vardiyası
                </button>
              </div>

              {/* GÜZERGAH FİLTRESİ */}
              <select
                value={selectedDistrictFilter}
                onChange={(e) => setSelectedDistrictFilter(e.target.value)}
                className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-950 dark:text-white font-extrabold outline-none focus:ring-2 focus:ring-blue-500 text-xs"
              >
                <option value="" className="bg-white dark:bg-gray-800 text-gray-950 dark:text-white">Tüm Güzergahlar</option>
                <option value="KENDİ" className="bg-white dark:bg-gray-800 text-gray-950 dark:text-white">KENDİ</option>
                {uniqueDistricts.map(dist => (
                  <option key={dist} value={dist} className="bg-white dark:bg-gray-800 text-gray-950 dark:text-white">{dist}</option>
                ))}
              </select>

              {/* SIRALAMA TİPİ */}
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-950 dark:text-white font-extrabold outline-none focus:ring-2 focus:ring-blue-500 text-xs"
              >
                <option value="name" className="bg-white dark:bg-gray-800 text-gray-950 dark:text-white">İsme Göre Sırala</option>
                <option value="district" className="bg-white dark:bg-gray-800 text-gray-950 dark:text-white">Semte Göre Sırala</option>
              </select>

              {/* HIZLI ARAMA KUTUSU */}
              <div className="relative flex-1 min-w-[150px] max-w-xs">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                <input 
                  type="text"
                  placeholder="Personelde ara..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-950 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 text-xs font-bold"
                />
              </div>
            </div>
            <button
              onClick={handleExportPDF}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold flex items-center gap-2 transition shadow-md active:scale-95 shrink-0"
            >
              <Download className="w-4 h-4" /> PDF Çıktısı Al
            </button>
          </div>

          {/* HAFTALIK PLAN PANAROMASI (PDF YAZDIRILACAK ALAN) */}
          <div id="weekly-plan-print-area" className="flex-1 min-h-0 overflow-auto border dark:border-gray-700 rounded-2xl bg-white dark:bg-gray-800 shadow-sm relative">
            
            {/* Yazdırma Esnasında Üst Bilgi Banner'ı (PDF'te görünmesi için) */}
            <div className="hidden pdf-show mb-6 p-4 border-b-2 border-black text-center">
              <h1 className="text-xl font-extrabold text-black uppercase tracking-wide">
                {getWeekNumber(selectedDate)}. HAFTA KALIPHANE {weeklyMode === 'mesai' ? 'MESAİ' : 'GECE VARDİYASI'} LİSTESİ
              </h1>
              <p className="text-xs text-gray-600 font-bold mt-1">{weekLabel}</p>
            </div>

            <table className="w-full border-collapse text-xs text-left min-w-[900px]">
              <thead className="bg-gray-100 dark:bg-slate-900 text-gray-700 dark:text-gray-200 uppercase text-[10px] font-black tracking-wider border-b dark:border-slate-700 sticky top-0 z-10">
                <tr>
                  <th className="p-3 sticky left-0 bg-gray-100 dark:bg-slate-900 border-r dark:border-gray-700 w-48 shadow-md">Adı Soyadı</th>
                  {weeklyMode === 'mesai' && weekDays.map(day => (
                    <th key={day.dateStr} className="p-2 border-r dark:border-gray-700 text-center w-32">
                      <div className="text-[10px] text-gray-400">{day.dateStr.split('-').reverse().join('.')}</div>
                      <div className="font-black text-blue-600 dark:text-blue-400">{day.dayName.toUpperCase()}</div>
                    </th>
                  ))}
                  <th className="p-3 border-r dark:border-gray-700 w-40">Güzergah (Semt)</th>
                  <th className="p-3 text-right w-14 print-hide-btn"></th>
                </tr>
              </thead>
              <tbody className="divide-y dark:divide-slate-700 font-bold text-gray-800 dark:text-gray-200">
                {activePersonnelList.map(person => {
                  const currentWeekDistrict = weeklyOverrides[`${person.id}_${selectedMondayStr}`] || districtMap[person.id] || "KENDİ";
                  const registeredSemt = districtMap[person.id] || "KENDİ";

                  return (
                    <tr key={person.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors">
                      {/* Personel İsmi (Sabit Sol Kolon) */}
                      <td className="p-3 sticky left-0 bg-white dark:bg-gray-800 border-r dark:border-gray-700 shadow-md">
                        <div className="font-extrabold text-sm text-gray-900 dark:text-white">{person.name.toUpperCase()}</div>
                        <div className="text-[9px] text-gray-500 dark:text-gray-400 font-medium print-hide-btn">{person.role}</div>
                      </td>

                      {/* Günlük Seçim Hücreleri (Sadece Mesai Modunda) */}
                      {weeklyMode === 'mesai' && weekDays.map(day => {
                        const isPlanned = plans.some(p => p.personnelId === person.id && p.date === day.dateStr && p.shiftType === 'MESAI');

                        return (
                          <td 
                            key={day.dateStr} 
                            onClick={() => handleTogglePlan(person, day.dateStr, 'MESAI')}
                            className={`p-2 border-r dark:border-gray-700 text-center cursor-pointer transition-all select-none ${
                              isPlanned 
                                ? 'bg-blue-50/30 dark:bg-blue-900/20 pdf-active-cell' 
                                : ''
                            }`}
                          >
                            {/* Ekrandaki Görünüm (Butonlar/Göstergeler) */}
                            <div className="print-hide-btn flex items-center justify-center">
                              {isPlanned ? (
                                <span className="w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 flex items-center justify-center border border-purple-300 dark:border-purple-800 text-sm"><Check className="w-5 h-5" /></span>
                              ) : (
                                <span className="w-8 h-8 rounded-full border border-dashed border-gray-300 dark:border-gray-700 hover:border-gray-500 text-gray-300 hover:text-gray-500 flex items-center justify-center text-xs">+</span>
                              )}
                            </div>

                            {/* PDF Çıktısındaki Yazı */}
                            <span className="hidden pdf-show active-cell-text">
                              {isPlanned ? '✓' : ''}
                            </span>
                          </td>
                        );
                      })}

                      {/* Semt Bilgisi (Güzergah) */}
                      <td className="p-3 border-r dark:border-gray-700 text-gray-700 dark:text-gray-300">
                        {/* Ekranda dropdown seçim kutusu */}
                        <div className="print-hide-btn flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                          <div className="relative inline-block w-32">
                            <select
                              value={currentWeekDistrict}
                              onChange={async (e) => {
                                const val = e.target.value;
                                await handleSaveWeeklyOverride(person.id, val);
                              }}
                              className="w-full bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded pl-2 pr-6 py-0.5 text-[11px] font-extrabold text-gray-900 dark:text-white outline-none cursor-pointer appearance-none"
                            >
                              <option value={registeredSemt} className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-bold">{registeredSemt}</option>
                              {registeredSemt !== "KENDİ" && (
                                <option value="KENDİ" className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-bold">KENDİ</option>
                              )}
                            </select>
                            <span className="absolute right-2 top-2 text-[8px] text-gray-400 pointer-events-none">▼</span>
                          </div>
                        </div>
                        {/* PDF Yazdırılırken Statik Text */}
                        <div className="hidden pdf-show flex items-center justify-center font-bold">
                          <span>{currentWeekDistrict}</span>
                        </div>
                      </td>

                      {/* Satırı Tamamen Kaldırma Butonu (PDF'te gizlenir) */}
                      <td className="p-3 text-right print-hide-btn">
                        <button 
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleRemovePersonFromWeek(person.id); }}
                          className="text-red-500 hover:text-red-700 p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/30 transition"
                          title="Haftalık Listeden Kaldır"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>

                    </tr>
                  );
                })}

                {/* Personel Ekleme Alt Satırı (Doldurdukça Satır Ekleme) - PDF'te Gizlenir */}
                <tr className="print-hide-btn bg-gray-50/50 dark:bg-gray-800/10">
                  <td className="p-3 sticky left-0 bg-white dark:bg-gray-800 border-r dark:border-gray-700 shadow-md">
                    {!isSelectorOpen ? (
                      <button
                        type="button"
                        onClick={() => {
                          setIsSelectorOpen(true);
                          setSelectorSearchQuery('');
                        }}
                        className="w-full p-2 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg bg-transparent text-gray-500 dark:text-gray-400 font-extrabold text-xs text-left hover:border-gray-500 flex items-center justify-between"
                      >
                        <span>+ Personel Seçin (Yeni Satır)...</span>
                        <span className="text-[10px] text-gray-400">▼</span>
                      </button>
                    ) : (
                      <div className="relative w-full z-20">
                        <div className="border border-blue-500 dark:border-blue-400 rounded-lg bg-white dark:bg-gray-800 shadow-xl p-2 flex flex-col gap-2 max-w-xs">
                          <div className="flex items-center justify-between gap-2">
                            <input
                              type="text"
                              placeholder="İsimle ara..."
                              value={selectorSearchQuery}
                              onChange={(e) => setSelectorSearchQuery(e.target.value)}
                              className="w-full p-1.5 border border-gray-300 dark:border-gray-600 rounded bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white text-xs font-bold outline-none focus:ring-1 focus:ring-blue-500"
                              autoFocus
                            />
                            <button 
                              type="button"
                              onClick={() => setIsSelectorOpen(false)}
                              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                          <div className="max-h-48 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700 pr-1">
                            {eligiblePersonnel
                              .filter(p => !activePersonnelList.some(ap => ap.id === p.id))
                              .filter(p => p.name.toLowerCase().includes(selectorSearchQuery.toLowerCase()))
                              .map(p => (
                                <button
                                  key={p.id}
                                  type="button"
                                  onClick={() => {
                                    if (weeklyMode === 'gece') {
                                      handleAddNightShiftWeek(p);
                                    } else {
                                      setManuallyAddedIds(prev => [...prev, p.id]);
                                    }
                                    setIsSelectorOpen(false);
                                  }}
                                  className="w-full text-left px-2 py-1.5 text-xs text-gray-700 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded font-black transition-colors"
                                >
                                  {p.name.toUpperCase()} <span className="text-[9px] font-normal text-gray-500 dark:text-gray-400">({p.role})</span>
                                </button>
                              ))
                            }
                            {eligiblePersonnel
                              .filter(p => !activePersonnelList.some(ap => ap.id === p.id))
                              .filter(p => p.name.toLowerCase().includes(selectorSearchQuery.toLowerCase())).length === 0 && (
                                <div className="text-[10px] text-gray-400 dark:text-gray-500 py-2 text-center">Eşleşen personel bulunamadı</div>
                              )
                            }
                          </div>
                        </div>
                      </div>
                    )}
                  </td>
                  {weeklyMode === 'mesai' && weekDays.map(day => (
                    <td key={day.dateStr} className="p-2 border-r dark:border-gray-700 text-center text-gray-400 font-bold">
                      -
                    </td>
                  ))}
                  <td className="p-3 border-r dark:border-gray-700 text-gray-400 italic">
                    Giriş bekleniyor
                  </td>
                  <td className="p-3 text-right"></td>
                </tr>

                {/* TOPLAM MESAİYE/VARDİYAYA KALAN KİŞİ SAYISI */}
                {weeklyMode === 'mesai' ? (
                  <tr className="bg-gray-100 dark:bg-slate-900 border-t-2 border-black dark:border-gray-700 font-black">
                    <td className="p-3 sticky left-0 bg-gray-100 dark:bg-slate-900 border-r dark:border-gray-700 shadow-md text-gray-900 dark:text-white uppercase text-[10px]">
                      TOPLAM MESAİYE KALAN KİŞİ SAYISI:
                    </td>
                    {weekDays.map(day => {
                      const count = plans.filter(p => p.date === day.dateStr && p.shiftType === 'MESAI' && activePersonnelList.some(ap => ap.id === p.personnelId)).length;
                      return (
                        <td key={day.dateStr} className="p-2 border-r dark:border-gray-700 text-center text-sm text-blue-600 dark:text-blue-400 bg-blue-50/20 dark:bg-blue-900/10">
                          {count}
                        </td>
                      );
                    })}
                    <td className="p-3 border-r dark:border-gray-700"></td>
                    <td className="p-3 print-hide-btn"></td>
                  </tr>
                ) : (
                  <tr className="bg-gray-100 dark:bg-slate-900 border-t-2 border-black dark:border-gray-700 font-black">
                    <td className="p-3 sticky left-0 bg-gray-100 dark:bg-slate-900 border-r dark:border-gray-700 shadow-md text-gray-900 dark:text-white uppercase text-[10px]">
                      TOPLAM VARDİYAYA KALAN KİŞİ SAYISI:
                    </td>
                    <td className="p-3 text-center text-sm text-blue-600 dark:text-blue-400 bg-blue-50/20 dark:bg-blue-900/10 border-r dark:border-gray-700">
                      {activePersonnelList.length}
                    </td>
                    <td className="p-3 print-hide-btn"></td>
                  </tr>
                )}

              </tbody>
            </table>
          </div>

          {/* LEJAND */}
          <div className="bg-gray-50 dark:bg-gray-700/20 p-4 rounded-xl border dark:border-gray-700 shrink-0 text-xs flex flex-wrap gap-6 items-center">
            <div className="font-bold text-gray-700 dark:text-gray-300">Açıklamalar:</div>
            <div className="flex items-center gap-1.5"><span className="w-4 h-4 bg-gray-100 dark:bg-gray-700 border border-dashed rounded-full text-center text-[10px] text-gray-400">+</span> <span className="text-gray-600 dark:text-gray-400">Atamak için hücreye tıklayın</span></div>
            <div className="flex items-center gap-1.5"><span className="text-[11px] text-blue-600 bg-blue-50/30 px-2 py-0.5 rounded font-black">VARDİYE</span> <span className="text-gray-600 dark:text-gray-400">Gece Vardiyası Ataması</span></div>
            <div className="flex items-center gap-1.5"><span className="text-purple-600 font-black">✓</span> <span className="text-gray-600 dark:text-gray-400">Mesai Ataması</span></div>
            <div className="text-gray-400 ml-auto">* Doldurdukça en altta yeni boş satır açılır. PDF çıktısı tüm tabloyu tek sayfaya yatay sığdıracak şekilde basılır.</div>
          </div>

        </div>
      )}

      {/* --- TAB 2: PERSONEL SEMT BİLGİLERİ --- */}
      {activeTab === 'districts' && (
        <div className="space-y-6 flex-1 flex flex-col min-h-0">
          
          <div className="bg-gray-50 dark:bg-gray-700/30 p-4 rounded-xl border dark:border-gray-700 shrink-0 text-sm flex items-center gap-2">
            <Info className="w-5 h-5 text-green-600 dark:text-green-400 shrink-0" />
            <span className="font-medium text-gray-700 dark:text-gray-300">
              Personellerin oturdukları semt/güzergah bilgilerini buradan güncelleyebilirsiniz. Bu bilgiler haftalık tablolarda otomatik görünür.
            </span>
          </div>

          {/* HIZLI ARAMA KUTUSU */}
          <div className="relative max-w-md shrink-0">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
            <input 
              type="text"
              placeholder="Personel veya semt adı ile ara..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 text-xs font-bold"
            />
          </div>

          {/* KÜMELENMİŞ SEMT GRUPLARI */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 overflow-y-auto flex-1 min-h-0">
            {Object.entries(groupedDistricts).map(([groupName, members]) => {
              const theme = getDistrictColor(groupName);
              
              return (
                <div key={groupName} className={`p-4 rounded-xl border ${theme.border} ${theme.bg} flex flex-col shadow-sm max-h-[450px]`}>
                  <div className="flex justify-between items-center mb-3 pb-2 border-b dark:border-gray-750 shrink-0">
                    <h3 className={`font-black text-xs uppercase tracking-wider flex items-center gap-1.5 ${theme.text}`}>
                      <MapPin className="w-4 h-4 shrink-0" />
                      {groupName}
                    </h3>
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black ${theme.badge}`}>
                      {members.length} Kişi
                    </span>
                  </div>
                  
                  <div className="space-y-2 overflow-y-auto flex-1 pr-1">
                    {members.map(person => {
                      const isEditing = editingDistrictId === person.id;
                      const currentDistrict = districtMap[person.id] || "";
                      
                      return (
                        <div key={person.id} className="bg-white dark:bg-gray-800 p-2.5 rounded-lg border dark:border-gray-700/60 shadow-sm flex items-center justify-between gap-2 text-xs font-bold text-gray-900 dark:text-white transition hover:shadow-md">
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-black text-gray-850 dark:text-gray-150">{person.name.toUpperCase()}</div>
                            <div className="text-[10px] text-gray-500 dark:text-gray-400 font-medium mt-0.5">{person.role}</div>
                          </div>
                          
                          <div className="shrink-0 flex items-center gap-1">
                            {isEditing ? (
                              <div className="flex items-center gap-1">
                                <input 
                                  type="text"
                                  value={editDistrictValue}
                                  onChange={(e) => setEditDistrictValue(e.target.value)}
                                  placeholder="Semt..."
                                  className="w-20 px-1.5 py-1 border dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-950 dark:text-white font-bold outline-none text-[10px] focus:ring-1 focus:ring-blue-500"
                                  autoFocus
                                />
                                <button
                                  type="button"
                                  onClick={() => handleSaveDistrict(person.id, person.name, editDistrictValue)}
                                  className="p-1 bg-green-600 hover:bg-green-700 text-white rounded transition"
                                  title="Kaydet"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingDistrictId(null)}
                                  className="p-1 bg-gray-250 dark:bg-gray-750 text-gray-750 dark:text-gray-250 rounded hover:bg-gray-300 transition"
                                  title="İptal"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingDistrictId(person.id);
                                  setEditDistrictValue(currentDistrict || "KENDİ");
                                }}
                                className="text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 px-2 py-1 rounded inline-flex items-center gap-0.5 text-[10px] font-black transition"
                              >
                                <Edit className="w-3 h-3" /> Düzenle
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {Object.keys(groupedDistricts).length === 0 && (
              <div className="col-span-full py-12 text-center text-gray-400 dark:text-gray-500 font-bold">
                Arama kriterlerine uygun semt/personel kaydı bulunamadı.
              </div>
            )}
          </div>

        </div>
      )}

      {/* --- TAB 3: PERSONEL VARDİYA TAKİBİ (AYLIK MATRİS) --- */}
      {activeTab === 'tracking' && (
        <div className="space-y-6 flex-1 flex flex-col min-h-0">
          
          {/* AY SEÇİCİ */}
          <div className="flex justify-between items-center bg-gray-50 dark:bg-gray-700/30 p-4 rounded-xl border dark:border-gray-700 shrink-0">
            <div className="flex items-center gap-3">
              <Calendar className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              <span className="font-bold text-gray-700 dark:text-gray-300">İzleme Ayı:</span>
              <input 
                type="month" 
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-bold outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
            <div className="text-sm font-black text-purple-600 dark:text-purple-400">
              {monthName} Vardiya Matrisi
            </div>
          </div>

          {/* MATRİS TABLOSU */}
          <div className="flex-1 overflow-auto border dark:border-gray-700 rounded-2xl bg-white dark:bg-gray-800 shadow-sm relative">
            <table className="w-full border-collapse text-xs text-left min-w-[1200px]">
              <thead className="bg-gray-100 dark:bg-slate-900 text-slate-500 uppercase text-[10px] font-black tracking-wider border-b dark:border-slate-700 sticky top-0 z-10">
                <tr>
                  <th className="p-3 sticky left-0 bg-gray-100 dark:bg-slate-900 border-r dark:border-gray-700 w-48 shadow-md">Personel Adı</th>
                  <th className="p-3 border-r dark:border-gray-700 w-32">Rolü</th>
                  {daysInMonth.map(day => (
                    <th key={day} className="p-1 border-r dark:border-gray-700 text-center w-8">{day}</th>
                  ))}
                  <th className="p-3 text-center w-20 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">Top. GV</th>
                  <th className="p-3 text-center w-20 bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400">Top. MS</th>
                </tr>
              </thead>
              <tbody className="divide-y dark:divide-slate-700">
                {eligiblePersonnel.map(person => {
                  let totalNightShifts = 0;
                  let totalOvertimes = 0;

                  return (
                    <tr key={person.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors">
                      {/* Personel İsmi (Sabit Sol Kolon) */}
                      <td className="p-3 sticky left-0 bg-white dark:bg-gray-800 border-r dark:border-gray-700 font-bold text-gray-900 dark:text-white shadow-md">
                        {person.name.toUpperCase()}
                      </td>
                      <td className="p-3 border-r dark:border-gray-700 text-gray-500 italic">
                        {person.role}
                      </td>
                      {/* Günler */}
                      {daysInMonth.map(day => {
                        const plan = attendanceMap[person.id]?.[day];
                        let cellContent = "";
                        let tooltipText = "";
                        
                        if (plan) {
                          if (plan.shiftType === 'GECE_VARDIYASI') {
                            cellContent = "🌙";
                            tooltipText = "Gece Vardiyası - Semt: " + (plan.district || "Bilinmiyor");
                            totalNightShifts++;
                          } else if (plan.shiftType === 'MESAI') {
                            cellContent = "⏰";
                            tooltipText = "Mesaiye Kalıyor - Semt: " + (plan.district || "Bilinmiyor");
                            totalOvertimes++;
                          }
                        }

                        return (
                          <td 
                            key={day} 
                            title={tooltipText}
                            className={`p-1 border-r dark:border-gray-700 text-center text-sm font-bold w-8 ${plan ? 'bg-blue-50/20 dark:bg-blue-900/10 cursor-help' : ''}`}
                          >
                            {cellContent}
                          </td>
                        );
                      })}
                      {/* Toplam GV */}
                      <td className="p-3 text-center font-black text-blue-600 bg-blue-50/50 dark:bg-blue-900/20 text-sm">
                        {totalNightShifts > 0 ? totalNightShifts : '-'}
                      </td>
                      {/* Toplam MS */}
                      <td className="p-3 text-center font-black text-purple-600 bg-purple-50/50 dark:bg-purple-900/20 text-sm">
                        {totalOvertimes > 0 ? totalOvertimes : '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* LEJAND */}
          <div className="bg-gray-50 dark:bg-gray-700/20 p-4 rounded-xl border dark:border-gray-700 shrink-0 text-xs flex flex-wrap gap-6 items-center">
            <div className="font-bold text-gray-700 dark:text-gray-300">Lejand (Göstergeler):</div>
            <div className="flex items-center gap-1.5"><span className="text-sm">🌙</span> <span className="text-gray-600 dark:text-gray-400">Gece Vardiyası</span></div>
            <div className="flex items-center gap-1.5"><span className="text-sm">⏰</span> <span className="text-gray-600 dark:text-gray-400">Mesaiye Kalıyor</span></div>
            <div className="text-gray-400 ml-auto">* Gün kutularının üstüne gelerek detaylı semt bilgisini görüntüleyebilirsiniz.</div>
          </div>

        </div>
      )}

    </div>
  );
};

export default ShiftPlannerPage;
