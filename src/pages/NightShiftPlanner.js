import React, { useState, useEffect } from 'react';
import { collection, addDoc, onSnapshot, query, orderBy, deleteDoc, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { PlusIcon, TrashIcon, MonitorIcon, PencilIcon, XIcon, SaveIcon, HistoryIcon, UserIcon } from 'lucide-react';

const NightShiftPlanner = ({ db, loggedInUser }) => {
  const [activeTab, setActiveTab] = useState('planning');
  const [plans, setPlans] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    machineId: '', moldName: '', partName: '', toolInfo: '', description: '', priority: 1
  });

  // Verileri Canlı Çek
  useEffect(() => {
    const q = query(collection(db, "night_shift_plans"), orderBy("priority", "asc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setPlans(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, [db]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.machineId || !formData.moldName) return;

    if (editingId) {
      await updateDoc(doc(db, "night_shift_plans", editingId), { ...formData });
      setEditingId(null);
    } else {
      await addDoc(collection(db, "night_shift_plans"), {
        ...formData,
        addedBy: loggedInUser?.name || "Belirtilmedi", // İşi ekleyen kişi
        status: 'BEKLIYOR',
        createdAt: serverTimestamp()
      });
    }
    setFormData({ machineId: '', moldName: '', partName: '', toolInfo: '', description: '', priority: 1 });
  };

  const handleEdit = (plan) => {
    setFormData({
      machineId: plan.machineId, moldName: plan.moldName, partName: plan.partName || '',
      toolInfo: plan.toolInfo || '', description: plan.description || '', priority: plan.priority
    });
    setEditingId(plan.id);
  };

  const deletePlan = async (id) => {
    if(window.confirm("Bu kaydı silmek istediğinize emin misiniz?")) {
      await deleteDoc(doc(db, "night_shift_plans", id));
    }
  };

  const updateStatus = async (id, newStatus) => {
    await updateDoc(doc(db, "night_shift_plans", id), { 
      status: newStatus,
      completedAt: newStatus === 'TAMAMLANDI' ? new Date() : null 
    });
  };

  // Veri Filtreleme
  const activePlans = plans.filter(p => p.status !== 'TAMAMLANDI');
  const completedPlans = plans.filter(p => p.status === 'TAMAMLANDI');

  // TV Modu Gruplama (Ekleyen Kişiye Göre)
  const groupedByPerson = activePlans.reduce((acc, plan) => {
    const person = plan.addedBy || "Diğer";
    if (!acc[person]) acc[person] = [];
    acc[person].push(plan);
    return acc;
  }, {});

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-900 overflow-hidden transition-colors text-slate-900 dark:text-slate-100">
      
      {/* Üst Menü */}
      {activeTab !== 'tv' && (
        <div className="bg-white dark:bg-slate-800 shadow-sm px-4 py-2 flex gap-4 border-b dark:border-slate-700 shrink-0">
          <button onClick={() => setActiveTab('planning')} className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-bold transition ${activeTab === 'planning' ? 'bg-blue-600 text-white' : 'hover:bg-gray-100 dark:hover:bg-slate-700'}`}>
            <PencilIcon size={16} /> Planlama
          </button>
          <button onClick={() => setActiveTab('history')} className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-bold transition ${activeTab === 'history' ? 'bg-blue-600 text-white' : 'hover:bg-gray-100 dark:hover:bg-slate-700'}`}>
            <HistoryIcon size={16} /> Kayıt Defteri
          </button>
          <button onClick={() => setActiveTab('tv')} className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-bold transition ${activeTab === 'tv' ? 'bg-blue-600 text-white' : 'hover:bg-gray-100 dark:hover:bg-slate-700'}`}>
            <MonitorIcon size={16} /> TV Modu
          </button>
        </div>
      )}

      {/* --- 1. PLANLAMA EKRANI --- */}
      {activeTab === 'planning' && (
        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
          <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow border dark:border-slate-700 grid grid-cols-1 md:grid-cols-4 gap-3">
            <input type="text" placeholder="Tezgah" required className="p-2 border dark:border-slate-600 rounded bg-gray-50 dark:bg-slate-900" value={formData.machineId} onChange={e => setFormData({...formData, machineId: e.target.value.toUpperCase()})} />
            <input type="text" placeholder="Kalıp Adı" required className="p-2 border dark:border-slate-600 rounded bg-gray-50 dark:bg-slate-900" value={formData.moldName} onChange={e => setFormData({...formData, moldName: e.target.value})} />
            <input type="text" placeholder="Parça Adı" className="p-2 border dark:border-slate-600 rounded bg-gray-50 dark:bg-slate-900" value={formData.partName} onChange={e => setFormData({...formData, partName: e.target.value})} />
            <input type="text" placeholder="Takım" className="p-2 border dark:border-slate-600 rounded bg-gray-50 dark:bg-slate-900" value={formData.toolInfo} onChange={e => setFormData({...formData, toolInfo: e.target.value})} />
            <input type="number" placeholder="Sıra" className="p-2 border dark:border-slate-600 rounded bg-gray-50 dark:bg-slate-900" value={formData.priority} onChange={e => setFormData({...formData, priority: parseInt(e.target.value) || 1})} />
            <textarea placeholder="Açıklama / Notlar" className="p-2 border dark:border-slate-600 rounded bg-gray-50 dark:bg-slate-900 md:col-span-2" rows="1" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} />
            <button type="submit" className="bg-blue-600 text-white font-bold rounded hover:bg-blue-700 transition flex items-center justify-center gap-2">
              {editingId ? <><SaveIcon size={16}/> Güncelle</> : <><PlusIcon size={16}/> Ekle</>}
            </button>
          </form>

          {/* PLANLAMA TABLOSU */}
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow overflow-hidden border dark:border-slate-700">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-100 dark:bg-slate-900 text-slate-500 uppercase text-xs font-bold border-b dark:border-slate-700">
                <tr>
                  <th className="p-3 w-12 text-center">Sıra</th>
                  <th className="p-3 w-24">Tezgah</th>
                  <th className="p-3 w-1/6">Kalıp Adı</th>
                  <th className="p-3 w-1/6">Parça Adı</th>
                  <th className="p-3 w-32">Takım</th>
                  <th className="p-3">Açıklama</th>
                  <th className="p-3 w-32">Sorumlu</th>
                  <th className="p-3 w-32">Durum</th>
                  <th className="p-3 w-20 text-right">İşlem</th>
                </tr>
              </thead>
              <tbody className="divide-y dark:divide-slate-700">
                {activePlans.length === 0 ? (
                  <tr><td colSpan="9" className="p-4 text-center text-slate-500">Kayıtlı iş bulunmuyor.</td></tr>
                ) : (
                  activePlans.map(plan => (
                  <tr key={plan.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors">
                    <td className="p-3 text-center font-black text-lg">{plan.priority}</td>
                    <td className="p-3 font-mono font-bold text-blue-600 dark:text-blue-400">{plan.machineId}</td>
                    <td className="p-3 font-bold text-slate-800 dark:text-slate-200">{plan.moldName}</td>
                    <td className="p-3 font-semibold text-slate-600 dark:text-slate-300">{plan.partName || '-'}</td>
                    <td className="p-3 text-xs font-mono text-emerald-600 dark:text-emerald-400">{plan.toolInfo || '-'}</td>
                    <td className="p-3 text-xs text-slate-500 italic">{plan.description || '-'}</td>
                    <td className="p-3 text-xs font-medium text-slate-400">{plan.addedBy}</td>
                    <td className="p-3">
                      <select 
                        value={plan.status} 
                        onChange={(e) => updateStatus(plan.id, e.target.value)} 
                        className="bg-transparent font-bold text-xs outline-none cursor-pointer dark:text-slate-200"
                      >
                        <option value="BEKLIYOR" className="bg-white text-slate-900 dark:bg-slate-800 dark:text-slate-100">BEKLİYOR</option>
                        <option value="ISLENIYOR" className="bg-white text-slate-900 dark:bg-slate-800 dark:text-slate-100">İŞLENİYOR</option>
                        <option value="TAMAMLANDI" className="bg-white text-slate-900 dark:bg-slate-800 dark:text-slate-100">TAMAMLANDI</option>
                      </select>
                    </td>
                    <td className="p-3 text-right">
                      <button onClick={() => handleEdit(plan)} className="p-1 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded mr-2"><PencilIcon size={16} /></button>
                      <button onClick={() => deletePlan(plan.id)} className="p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded"><TrashIcon size={16} /></button>
                    </td>
                  </tr>
                )))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* --- 2. TV LİSTE EKRANI --- */}
      {activeTab === 'tv' && (
        <div className="flex-1 flex flex-col bg-slate-950 p-2 text-white">
          <div className="flex justify-between items-center mb-2 px-2 shrink-0 border-b border-slate-800 pb-1">
            <h1 className="text-xl font-black text-blue-500 tracking-tighter uppercase">Gece Vardiyası İş Akışı</h1>
            <div className="text-lg font-mono font-bold text-slate-400">{new Date().toLocaleTimeString().slice(0,5)}</div>
          </div>
          
          <div className="flex-1 overflow-hidden flex flex-col gap-2">
            {Object.entries(groupedByPerson).map(([person, personPlans]) => (
              <div key={person} className="flex flex-col border border-slate-800 rounded-lg bg-slate-900/50 overflow-hidden">
                <div className="bg-slate-800 px-3 py-1.5 flex items-center gap-2 border-b border-slate-700 shadow-md z-10">
                   <UserIcon size={14} className="text-blue-400" />
                   <span className="text-sm font-black uppercase text-slate-200 tracking-wider">{person} - SORUMLULUĞUNDAKİ İŞLER</span>
                </div>
                
                {/* TV Tablo Başlıkları (Fontları Büyütüldü) */}
                <div className="flex px-3 py-2 bg-slate-900 border-b border-slate-800 text-xs font-bold text-slate-500 uppercase tracking-wider">
                  <div className="w-8 text-center">Sıra</div>
                  <div className="w-16">Tezgah</div>
                  <div className="w-2/12 px-2">Kalıp Adı</div>
                  <div className="w-2/12 px-2">Parça Adı</div>
                  <div className="w-32 px-2">Takım</div>
                  <div className="flex-1 px-2">Açıklama / Not</div>
                  <div className="w-28 text-right">Durum</div>
                </div>

                <div className="divide-y divide-slate-800/80">
                  {personPlans.map((plan) => (
                    <div key={plan.id} className={`flex items-center px-3 py-3 transition-all ${plan.status === 'ISLENIYOR' ? 'bg-blue-900/40 border-l-4 border-blue-500' : 'border-l-4 border-transparent'}`}>
                      
                      {/* Sıra */}
                      <div className="w-8 text-base font-mono text-slate-400 font-black text-center">#{plan.priority}</div>
                      
                      {/* Tezgah */}
                      <div className="w-16 font-black text-blue-400 text-lg font-mono uppercase">{plan.machineId}</div>
                      
                      {/* Kalıp Adı */}
                      <div className="w-2/12 px-2 font-black text-yellow-500 text-base uppercase truncate" title={plan.moldName}>
                        {plan.moldName}
                      </div>
                      
                      {/* Parça Adı */}
                      <div className="w-2/12 px-2 font-bold text-slate-300 text-base uppercase truncate" title={plan.partName}>
                        {plan.partName || '-'}
                      </div>
                      
                      {/* Takım */}
                      <div className="w-32 px-2 text-base font-mono text-emerald-400 font-bold uppercase truncate" title={plan.toolInfo}>
                        {plan.toolInfo || '-'}
                      </div>
                      
                      {/* Açıklama */}
                      <div className="flex-1 px-2 text-sm font-medium text-slate-400 italic truncate" title={plan.description}>
                        {plan.description || '-'}
                      </div>
                      
                      {/* Durum */}
                      <div className="w-28 text-right shrink-0">
                        <span className={`text-xs font-black px-2.5 py-1 rounded uppercase tracking-wide ${plan.status === 'ISLENIYOR' ? 'bg-blue-600 text-white animate-pulse shadow-lg' : 'bg-slate-700 text-slate-400'}`}>
                          {plan.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <button onClick={() => setActiveTab('planning')} className="fixed bottom-2 right-2 opacity-5 hover:opacity-100 transition"><PencilIcon size={12} /></button>
        </div>
      )}

      {/* --- 3. KAYIT DEFTERİ (GEÇMİŞ) --- */}
      {activeTab === 'history' && (
        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow border dark:border-slate-700">
            <div className="p-4 border-b dark:border-slate-700 font-bold flex items-center gap-2">
              <HistoryIcon className="text-blue-500" /> Tamamlanan İş Arşivi
            </div>
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 dark:bg-slate-900 text-slate-500 uppercase text-xs font-bold border-b dark:border-slate-700">
                <tr>
                  <th className="p-3">Tezgah</th>
                  <th className="p-3">Kalıp / Parça</th>
                  <th className="p-3">Açıklama</th>
                  <th className="p-3">Sorumlu</th>
                  <th className="p-3">Tamamlanma Tarihi</th>
                  <th className="p-3 text-right">İşlem</th>
                </tr>
              </thead>
              <tbody className="divide-y dark:divide-slate-700 text-xs">
                {completedPlans.length === 0 ? (
                  <tr><td colSpan="6" className="p-4 text-center text-slate-500">Geçmiş kayıt bulunmuyor.</td></tr>
                ) : (
                  completedPlans.map(plan => (
                  <tr key={plan.id} className="opacity-70 grayscale hover:grayscale-0 transition">
                    <td className="p-3 font-mono font-bold text-blue-500">{plan.machineId}</td>
                    <td className="p-3"><b className="text-slate-800 dark:text-slate-200">{plan.moldName}</b> / {plan.partName}</td>
                    <td className="p-3 text-slate-500 italic">{plan.description || '-'}</td>
                    <td className="p-3 italic">{plan.addedBy}</td>
                    <td className="p-3 text-slate-400">{plan.completedAt?.toDate().toLocaleString()}</td>
                    <td className="p-3 text-right">
                       <button onClick={() => updateStatus(plan.id, 'BEKLIYOR')} className="text-blue-500 underline mr-2 hover:text-blue-700 font-bold">Geri Al</button>
                       <button onClick={() => deletePlan(plan.id)} className="text-red-500 hover:text-red-700"><TrashIcon size={14} /></button>
                    </td>
                  </tr>
                )))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default NightShiftPlanner;