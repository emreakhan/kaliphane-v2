// src/components/OEE/OeeMachineMappingModal.jsx
import React, { useState, useMemo } from 'react';
import { 
  PlusIcon, TrashIcon, Check, X, 
  ArrowRightLeft, Sparkles, Search, Monitor
} from 'lucide-react';
import { findActiveProductionJob } from '../../services/oeeTrackingService.js';

export const OeeMachineMappingModal = ({
  isOpen,
  onClose,
  systemMachines = [],
  fleetData = [],
  projects = [],
  aliasList = [],
  onSaveAliases
}) => {
  const [localAliases, setLocalAliases] = useState(() => [...aliasList]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedGroupFilter, setSelectedGroupFilter] = useState('ALL');

  // Canlı API'de bulunan tüm IP ve Cihaz ID'leri
  const liveIps = useMemo(() => {
    return fleetData.map(d => ({
      ip: d.ip,
      id: d.id,
      name: d.name,
      currentState: d.currentState,
      connected: d.connected !== false
    }));
  }, [fleetData]);

  // Sistem Tezgahlarını Otomatik İçe Aktar
  const handleImportSystemMachines = () => {
    const updated = [...localAliases];
    const existingCodes = new Set(updated.map(a => (a.systemMachineCode || a.customName || a.ipOrId || '').toLowerCase().trim()));

    let addedCount = 0;
    systemMachines.forEach(sm => {
      const smCode = (sm.code || sm.name || sm.id || '').trim();
      const smCodeLower = smCode.toLowerCase();

      if (smCode && !existingCodes.has(smCodeLower)) {
        existingCodes.add(smCodeLower);

        // Canlı filoda bu ada benzer bir IP var mı bak
        const matchedLive = fleetData.find(d => 
          (d.name || '').toLowerCase().includes(smCodeLower) ||
          (d.id || '').toLowerCase().includes(smCodeLower)
        );

        updated.push({
          ipOrId: matchedLive ? (matchedLive.ip || matchedLive.id) : '',
          systemMachineCode: smCode,
          customName: sm.name || smCode,
          group: sm.group || sm.department || sm.type || 'CNC Dik İşleme',
          location: sm.location || 'Kalıphane A Blok'
        });
        addedCount++;
      }
    });

    setLocalAliases(updated);
    if (addedCount > 0) {
      alert(`${addedCount} adet sistem tezgahı eşleştirme listesine aktarıldı. Şimdi IP adreslerini seçip kaydedebilirsiniz.`);
    } else {
      alert("Tüm sistem tezgahları zaten listede mevcut.");
    }
  };

  // Yeni Satır Ekle
  const handleAddRow = () => {
    setLocalAliases([
      {
        ipOrId: '',
        systemMachineCode: '',
        customName: '',
        group: 'CNC Dik İşleme',
        location: 'Kalıphane A Blok'
      },
      ...localAliases
    ]);
  };

  // Satır Güncelle
  const handleChangeRow = (index, field, value) => {
    const updated = [...localAliases];
    updated[index] = { ...updated[index], [field]: value };
    setLocalAliases(updated);
  };

  // Satır Sil
  const handleDeleteRow = (index) => {
    const updated = localAliases.filter((_, i) => i !== index);
    setLocalAliases(updated);
  };

  // Tümünü Kaydet
  const handleSaveAll = () => {
    const cleaned = localAliases.filter(a => (a.ipOrId || '').trim() || (a.systemMachineCode || '').trim());
    onSaveAliases(cleaned);
    onClose();
  };

  // Filtrelenmiş Liste
  const filteredList = localAliases.filter(item => {
    if (selectedGroupFilter !== 'ALL' && item.group !== selectedGroupFilter) return false;
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      const sCode = (item.systemMachineCode || '').toLowerCase();
      const cName = (item.customName || '').toLowerCase();
      const ip = (item.ipOrId || '').toLowerCase();
      return sCode.includes(q) || cName.includes(q) || ip.includes(q);
    }
    return true;
  });

  // Mevcut Gruplar
  const groups = useMemo(() => {
    const set = new Set(localAliases.map(a => a.group || 'CNC Dik İşleme'));
    return Array.from(set).sort();
  }, [localAliases]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4 overflow-y-auto animate-fadeIn">
      {/* GENİŞ VE FERAH EKRAN (max-w-[1440px] w-[96vw] h-[92vh]) */}
      <div className="bg-slate-900 text-slate-100 rounded-3xl shadow-2xl border border-slate-700/80 max-w-[1440px] w-[96vw] h-[92vh] p-5 sm:p-6 space-y-4 flex flex-col justify-between overflow-hidden">
        
        {/* 1. BAŞLIK */}
        <div className="flex justify-between items-start border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-xl font-black text-white flex items-center gap-2.5">
              <ArrowRightLeft className="text-emerald-400 w-6 h-6" /> ⚙️ Tezgah İsimlendirme & Eşleştirme Paneli
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Kalıphane v2 sisteminizdeki tezgahlar (K27, K45, K43 vb.) ile canlı ağdaki IP adreslerini eşleştirin. 
              Eşleştirilen tezgahların işledikleri kalıp, parça ve CAM operatörleri <b>otomatik olarak</b> panoda gösterilir.
            </p>
          </div>
          <button 
            onClick={onClose} 
            className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-slate-800 transition"
          >
            <X size={24} />
          </button>
        </div>

        {/* 2. AKSİYON VE ARAMA BARI */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-800/90 p-3.5 rounded-2xl border border-slate-700">
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={handleImportSystemMachines}
              className="py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs rounded-xl shadow-md shadow-blue-600/30 flex items-center gap-2 transition"
            >
              <Sparkles size={15} /> Tüm Sistem Tezgahlarını İçe Aktar ({systemMachines.length})
            </button>

            <button
              onClick={handleAddRow}
              className="py-2.5 px-4 bg-slate-700 hover:bg-slate-600 text-slate-200 font-bold text-xs rounded-xl flex items-center gap-1.5 transition border border-slate-600"
            >
              <PlusIcon size={15} /> + Yeni Tezgah Ekle
            </button>
          </div>

          <div className="flex items-center gap-2.5">
            {groups.length > 1 && (
              <select
                value={selectedGroupFilter}
                onChange={e => setSelectedGroupFilter(e.target.value)}
                className="p-2.5 text-xs font-bold border border-slate-700 rounded-xl bg-slate-900 text-slate-200 outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="ALL">Tüm Gruplar</option>
                {groups.map(g => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            )}

            <div className="relative">
              <Search size={15} className="absolute left-3 top-3 text-slate-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Tezgah kodu veya IP ara..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="pl-9 pr-3 py-2 text-xs font-bold border border-slate-700 rounded-xl bg-slate-900 text-white w-64 outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-slate-500"
              />
            </div>
          </div>
        </div>

        {/* 3. EŞLEŞTİRME TABLOSU (TAM KOYU MOD & YAZARAK ARAMA DESTEKLİ) */}
        <div className="overflow-x-auto border border-slate-800 rounded-2xl flex-1 custom-scrollbar bg-slate-950">
          
          {/* Otomatik Tamamlama Datalistleri */}
          <datalist id="system-machines-datalist">
            {systemMachines.map(sm => (
              <option key={sm.id || sm.name} value={sm.code || sm.name} />
            ))}
          </datalist>

          <datalist id="live-ips-datalist">
            {liveIps.map(live => (
              <option key={live.ip || live.id} value={live.ip || live.id} label={`${live.name || ''} (${live.currentState || ''})`} />
            ))}
          </datalist>

          <table className="w-full text-left text-xs border-collapse">
            <thead className="sticky top-0 bg-slate-800 border-b border-slate-700 text-slate-300 font-extrabold uppercase text-[10px] z-10 tracking-wider">
              <tr>
                <th className="p-3.5">Sistem Tezgahı (Yazarak Ara / Seç)</th>
                <th className="p-3.5">Canlı Ağ IP Adresi / ETKA ID</th>
                <th className="p-3.5">Özel Görünen Ad</th>
                <th className="p-3.5">Grup / Bölüm</th>
                <th className="p-3.5">Canlı Durum</th>
                <th className="p-3.5">Sistemdeki Aktif İş (Otomatik)</th>
                <th className="p-3.5 text-center">Sil</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 font-medium bg-slate-900/90">
              {filteredList.map((row, idx) => {
                // Eşleşen canlı cihaz
                const matchedLive = fleetData.find(d => 
                  (d.ip || '').toLowerCase() === (row.ipOrId || '').toLowerCase() ||
                  (d.id || '').toLowerCase() === (row.ipOrId || '').toLowerCase()
                );
                const isConn = matchedLive && matchedLive.connected !== false;

                // Sistemdeki aktif iş
                const prodJob = findActiveProductionJob(row.systemMachineCode || row.customName, projects);

                return (
                  <tr key={idx} className="hover:bg-slate-800/70 transition">
                    
                    {/* 1. Sistem Tezgahı (Yazarak Arama + Dropdown) */}
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <input
                          list="system-machines-datalist"
                          type="text"
                          placeholder="Yazarak ara veya seç (Örn: K27)"
                          value={row.systemMachineCode || ''}
                          onChange={e => {
                            const val = e.target.value;
                            handleChangeRow(idx, 'systemMachineCode', val);
                            if (!row.customName) {
                              handleChangeRow(idx, 'customName', val);
                            }
                          }}
                          className="p-2 text-xs font-mono font-black border border-slate-700 rounded-xl bg-slate-950 text-blue-400 outline-none focus:ring-2 focus:ring-blue-500 w-44 placeholder:text-slate-600"
                        />

                        <select
                          value={row.systemMachineCode || ''}
                          onChange={e => {
                            const val = e.target.value;
                            handleChangeRow(idx, 'systemMachineCode', val);
                            if (!row.customName) {
                              handleChangeRow(idx, 'customName', val);
                            }
                          }}
                          className="p-2 text-xs font-bold border border-slate-700 rounded-xl bg-slate-950 text-slate-300 outline-none focus:ring-2 focus:ring-blue-500 w-32"
                        >
                          <option value="">Seçiniz...</option>
                          {systemMachines.map(sm => (
                            <option key={sm.id || sm.name} value={sm.code || sm.name}>
                              {sm.code || sm.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </td>

                    {/* 2. Canlı IP / Cihaz (Yazarak Arama + Dropdown) */}
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <input
                          list="live-ips-datalist"
                          type="text"
                          placeholder="Örn: 192.168.2.73"
                          value={row.ipOrId || ''}
                          onChange={e => handleChangeRow(idx, 'ipOrId', e.target.value)}
                          className="p-2 text-xs font-mono font-bold border border-slate-700 rounded-xl bg-slate-950 text-emerald-400 outline-none focus:ring-2 focus:ring-blue-500 w-40 placeholder:text-slate-600"
                        />

                        <select
                          value={row.ipOrId || ''}
                          onChange={e => handleChangeRow(idx, 'ipOrId', e.target.value)}
                          className="p-2 text-xs font-mono font-bold border border-slate-700 rounded-xl bg-slate-950 text-slate-300 outline-none focus:ring-2 focus:ring-blue-500 w-44"
                        >
                          <option value="">IP Seçiniz...</option>
                          {liveIps.map(live => (
                            <option key={live.ip || live.id} value={live.ip || live.id}>
                              {live.ip} {live.name ? `(${live.name})` : ''} {live.connected ? '🟢' : '🔌'}
                            </option>
                          ))}
                        </select>
                      </div>
                    </td>

                    {/* 3. Özel İsim */}
                    <td className="p-3">
                      <input
                        type="text"
                        placeholder="Örn: K27"
                        value={row.customName || ''}
                        onChange={e => handleChangeRow(idx, 'customName', e.target.value)}
                        className="p-2 text-xs font-bold border border-slate-700 rounded-xl bg-slate-950 text-emerald-400 outline-none focus:ring-2 focus:ring-blue-500 w-36 placeholder:text-slate-600"
                      />
                    </td>

                    {/* 4. Grup */}
                    <td className="p-3">
                      <input
                        type="text"
                        placeholder="Grup"
                        value={row.group || 'CNC Dik İşleme'}
                        onChange={e => handleChangeRow(idx, 'group', e.target.value)}
                        className="p-2 text-xs font-bold border border-slate-700 rounded-xl bg-slate-950 text-slate-200 outline-none focus:ring-2 focus:ring-blue-500 w-36 placeholder:text-slate-600"
                      />
                    </td>

                    {/* 5. Canlı Ağ Durumu */}
                    <td className="p-3">
                      {matchedLive ? (
                        <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${
                          isConn ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : 'bg-slate-800 text-slate-400 border border-slate-700'
                        }`}>
                          {isConn ? matchedLive.currentState || 'BAĞLI' : 'BAĞLANTI YOK'}
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-500 italic">Tanımsız IP</span>
                      )}
                    </td>

                    {/* 6. Sistemdeki Aktif İş (Otomatik Tespit) */}
                    <td className="p-3">
                      {prodJob ? (
                        <div className="space-y-1 max-w-[260px]">
                          <span className="text-[11px] font-black text-white block truncate" title={prodJob.moldName}>
                            {prodJob.moldName}
                          </span>
                          <span className="text-[10px] font-bold text-blue-400 block truncate">
                            {prodJob.taskName} ({prodJob.camOperatorName})
                          </span>
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-500 italic">Aktif iş yok (Boşta)</span>
                      )}
                    </td>

                    {/* 7. Sil */}
                    <td className="p-3 text-center">
                      <button
                        onClick={() => handleDeleteRow(idx)}
                        className="p-2 text-slate-400 hover:text-red-400 transition rounded-xl hover:bg-red-950/40"
                        title="Eşleştirmeyi Kaldır"
                      >
                        <TrashIcon size={16} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* 4. ALT BUTONLAR */}
        <div className="pt-3 border-t border-slate-800 flex flex-col sm:flex-row justify-between items-center gap-3">
          <span className="text-xs text-slate-400 font-bold">
            Toplam <b>{localAliases.length}</b> tezgah eşleştirmesi tanımlı.
          </span>

          <div className="flex gap-2.5">
            <button
              onClick={onClose}
              className="py-2.5 px-5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl transition border border-slate-700"
            >
              İptal
            </button>

            <button
              onClick={handleSaveAll}
              className="py-2.5 px-6 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl shadow-lg shadow-emerald-600/30 flex items-center gap-2 transition"
            >
              <Check size={16} /> Tüm Eşleştirmeleri Kaydet & Uygula
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default OeeMachineMappingModal;
