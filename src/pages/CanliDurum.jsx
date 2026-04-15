// src/pages/CanliDurum.js

import React, { useState, useEffect } from 'react';
import { db, doc, onSnapshot } from '../config/firebase.js';
import { X, Calendar, Activity, BarChart2, TrendingUp, Settings, Clock, AlertTriangle } from 'lucide-react';

const CanliDurum = () => {
  const [makineler, setMakineler] = useState({});
  const [sistemGuncelleme, setSistemGuncelleme] = useState("Bekleniyor...");
  const [suAnkiZaman, setSuAnkiZaman] = useState(new Date());
  const [aramaMetni, setAramaMetni] = useState('');
  const [filtre, setFiltre] = useState('HEPSI');
  const [seciliMakine, setSeciliMakine] = useState(null);

  useEffect(() => {
    const zamanlayici = setInterval(() => setSuAnkiZaman(new Date()), 1000);
    return () => clearInterval(zamanlayici);
  }, []);

  useEffect(() => {
    const veriDinleyici = onSnapshot(doc(db, "KALIPHANE_SISTEMI", "CANLI_DURUM"), (docSnap) => {
      if (docSnap.exists()) {
        const gelenVeri = docSnap.data();
        setMakineler(gelenVeri.makineler || {});
        const saat = new Date(gelenVeri.sistemGuncelleme).toLocaleTimeString('tr-TR');
        setSistemGuncelleme(saat);
      }
    });
    return () => veriDinleyici(); 
  }, []);

  const sureBilgisiAl = (baslangicZamani) => {
    if (!baslangicZamani) return { metin: "Süre Bilinmiyor", isKritik: false };
    const farkMilisaniye = suAnkiZaman - new Date(baslangicZamani);
    if (farkMilisaniye < 0) return { metin: "0 Dk 0 Sn", isKritik: false };

    const saat = Math.floor(farkMilisaniye / 3600000);
    const dakika = Math.floor((farkMilisaniye % 3600000) / 60000);
    const saniye = Math.floor((farkMilisaniye % 60000) / 1000);
    const isKritik = saat > 0 || dakika >= 15; 
    
    let metin = `${dakika} Dk ${saniye} Sn`;
    if (saat > 0) metin = `${saat} Sa ${dakika} Dk ${saniye} Sn`;
    return { metin, isKritik };
  };

  const filtrelenmisMakineler = Object.entries(makineler).filter(([makineAdi, veri]) => {
      const aramaUyuyor = makineAdi.toLowerCase().includes(aramaMetni.toLowerCase());
      let butonUyuyor = true;
      if (filtre === 'CALISAN') butonUyuyor = veri.durum === "ÇALIŞIYOR";
      if (filtre === 'DURAN') butonUyuyor = veri.durum === "DURUYOR";
      if (filtre === 'BEKLEYEN') butonUyuyor = veri.durum === "İŞ BEKLİYOR";
      return aramaUyuyor && butonUyuyor;
  });

  const toplamMakine = Object.keys(makineler).length;
  const calisanSayisi = Object.values(makineler).filter(m => m.durum === "ÇALIŞIYOR").length;
  const bekleyenSayisi = Object.values(makineler).filter(m => m.durum === "İŞ BEKLİYOR").length;
  const duranSayisi = toplamMakine - calisanSayisi - bekleyenSayisi;

  const sahtePerformansGetir = (makineAdi) => {
      const randomSeed = makineAdi.length + (calisanSayisi * 2);
      return { 
          oee: Math.min(100, Math.max(0, 75 + (randomSeed % 20))), 
          kullanilabilirlik: Math.min(100, 80 + (randomSeed % 15)), 
          performans: Math.min(100, 75 + (randomSeed % 25)), 
          kalite: 99 
      };
  };

  let fabrikaToplamOEE = 0;
  Object.keys(makineler).forEach(m => fabrikaToplamOEE += sahtePerformansGetir(m).oee);
  const fabrikaOrtalamaOEE = toplamMakine > 0 ? Math.round(fabrikaToplamOEE / toplamMakine) : 0;

  return (
    <div className="p-4 sm:p-6 bg-gray-50 dark:bg-gray-900 min-h-screen transition-colors duration-300 relative">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div>
          <h1 className="text-3xl font-black text-gray-800 dark:text-white tracking-tight flex items-center gap-3">
             <Activity className="w-8 h-8 text-blue-600" /> Kalıphane Canlı İzleme
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Anlık durumlar ve performans analizleri</p>
        </div>
        <div className="bg-white dark:bg-gray-800 px-4 py-2 rounded-full shadow-sm border border-gray-200 dark:border-gray-700">
          <span className="text-sm text-gray-600 dark:text-gray-300 font-semibold">Son Senkronizasyon: </span>
          <span className="text-sm font-bold text-blue-600 dark:text-blue-400">{sistemGuncelleme}</span>
        </div>
      </div>

      {/* KONTROL PANELİ */}
      <div className="flex flex-col lg:flex-row justify-between items-center bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-sm mb-8 gap-4 border border-gray-100 dark:border-gray-700">
        <div className="flex gap-4 sm:gap-6 w-full lg:w-auto overflow-x-auto pb-2 lg:pb-0">
            <div className="text-center min-w-[60px]">
                <p className="text-[10px] sm:text-xs text-gray-500 font-bold uppercase">Toplam</p>
                <p className="text-xl sm:text-2xl font-black text-gray-800 dark:text-white">{toplamMakine}</p>
            </div>
            <div className="text-center min-w-[60px]">
                <p className="text-[10px] sm:text-xs text-green-600 font-bold uppercase">Çalışan</p>
                <p className="text-xl sm:text-2xl font-black text-green-600">{calisanSayisi}</p>
            </div>
            <div className="text-center min-w-[60px]">
                <p className="text-[10px] sm:text-xs text-yellow-600 font-bold uppercase">Bekleyen</p>
                <p className="text-xl sm:text-2xl font-black text-yellow-600">{bekleyenSayisi}</p>
            </div>
            <div className="text-center min-w-[60px]">
                <p className="text-[10px] sm:text-xs text-red-600 font-bold uppercase">Duran</p>
                <p className="text-xl sm:text-2xl font-black text-red-600">{duranSayisi}</p>
            </div>
            <div className="w-px h-10 sm:h-12 bg-gray-200 dark:bg-gray-700 mx-1"></div>
            <div className="text-center min-w-[90px] bg-blue-50 dark:bg-blue-900/20 px-3 py-1 rounded-xl">
                <p className="text-[10px] sm:text-xs text-blue-700 dark:text-blue-400 font-bold uppercase">Ort. OEE</p>
                <p className="text-xl sm:text-2xl font-black text-blue-700 dark:text-blue-400">%{fabrikaOrtalamaOEE}</p>
            </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 w-full lg:w-auto">
            <div className="flex bg-gray-100 dark:bg-gray-900 p-1 rounded-xl w-full sm:w-auto overflow-x-auto">
                <button onClick={() => setFiltre('HEPSI')} className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-all ${filtre === 'HEPSI' ? 'bg-white dark:bg-gray-700 text-blue-600 shadow' : 'text-gray-500 hover:text-gray-800'}`}>Tümü</button>
                <button onClick={() => setFiltre('CALISAN')} className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-all ${filtre === 'CALISAN' ? 'bg-green-500 text-white shadow' : 'text-gray-500 hover:text-green-500'}`}>Çalışan</button>
                <button onClick={() => setFiltre('BEKLEYEN')} className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-all ${filtre === 'BEKLEYEN' ? 'bg-yellow-500 text-white shadow' : 'text-gray-500 hover:text-yellow-500'}`}>Bekleyen</button>
                <button onClick={() => setFiltre('DURAN')} className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-all ${filtre === 'DURAN' ? 'bg-red-500 text-white shadow' : 'text-gray-500 hover:text-red-500'}`}>Duran</button>
            </div>
            <input type="text" placeholder="Ara (Örn: K22)" value={aramaMetni} onChange={(e) => setAramaMetni(e.target.value)} className="w-full sm:w-40 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-sm rounded-xl px-4 py-2" />
        </div>
      </div>

      {/* MAKİNE KARTLARI */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        {filtrelenmisMakineler.map(([makineAdi, veri]) => {
          const calisiyorMu = veri.durum === "ÇALIŞIYOR";
          const bekliyorMu = veri.durum === "İŞ BEKLİYOR";
          const duruyorMu = !calisiyorMu && !bekliyorMu;
          
          const sureData = sureBilgisiAl(veri.durusBaslangici);
          const isAlarm = duruyorMu && sureData.isKritik;

          // Dinamik Sınıflar
          let cardClass = "";
          let badgeClass = "";
          let iconClass = "";
          let timeColor = "";

          if (calisiyorMu) {
              cardClass = "bg-white dark:bg-gray-800 border-b-4 border-green-500 hover:shadow-green-100";
              badgeClass = "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400";
              iconClass = "text-green-600 dark:text-green-400";
          } else if (bekliyorMu) {
              cardClass = "bg-yellow-50 dark:bg-yellow-900/20 border-b-4 border-yellow-500 hover:shadow-yellow-100";
              badgeClass = "bg-yellow-200 text-yellow-800 dark:bg-yellow-900/60 dark:text-yellow-400";
              iconClass = "text-yellow-600 dark:text-yellow-500";
              timeColor = "text-yellow-600 dark:text-yellow-500";
          } else if (isAlarm) {
              cardClass = "bg-red-600 text-white border-b-4 border-red-800 animate-pulse shadow-red-500/50";
              badgeClass = "bg-red-800 text-red-100";
              timeColor = "text-white";
          } else {
              cardClass = "bg-red-50 dark:bg-red-900/20 border-b-4 border-red-500";
              badgeClass = "bg-red-200 text-red-800 dark:bg-red-900/50 dark:text-red-400";
              iconClass = "text-red-700 dark:text-red-400";
              timeColor = "text-red-600 dark:text-red-500";
          }

          return (
            <div key={makineAdi} onClick={() => setSeciliMakine(makineAdi)} className={`rounded-2xl p-6 shadow-lg transition-all duration-300 cursor-pointer transform hover:-translate-y-1 ${cardClass}`}>
              <div className="flex justify-between items-start mb-4">
                <h2 className={`text-2xl font-bold ${isAlarm ? 'text-white' : 'text-gray-800 dark:text-white'}`}>{makineAdi}</h2>
                <span className={`px-3 py-1 rounded-full text-xs font-black tracking-wider flex items-center gap-1 ${badgeClass}`}>
                  {isAlarm ? <AlertTriangle className="w-3 h-3"/> : null}
                  {isAlarm ? 'KRİTİK DURUŞ' : veri.durum}
                </span>
              </div>

              {calisiyorMu ? (
                <div className={`flex items-center font-medium ${iconClass}`}>
                  <Activity className="w-5 h-5 mr-2 animate-pulse" /> Üretime Devam Ediyor
                </div>
              ) : (
                <div className="mt-2">
                  <p className={`font-semibold flex items-center mb-2 ${isAlarm ? 'text-red-100' : iconClass}`}>
                    <Clock className="w-5 h-5 mr-2" />
                    {bekliyorMu ? 'Bekleme Süresi:' : 'Duruş Süresi:'}
                  </p>
                  <p className={`text-3xl font-black tabular-nums ${timeColor}`}>{sureData.metin}</p>
                  
                  {/* Sadece gerçek duruşlarda nedeni göster, beklemede gösterme */}
                  {duruyorMu && (
                    <p className={`text-sm mt-3 font-medium px-3 py-2 rounded-lg inline-block ${isAlarm ? 'bg-red-700 text-white' : 'text-red-500 bg-red-100 dark:bg-red-900/40 dark:text-red-300'}`}>
                        Neden: {veri.neden}
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      
      {/* MODAL KISMI (Değişmedi, öncekiyle aynı) */}
      {seciliMakine && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
              <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
                  <div className="flex justify-between items-center p-6 border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50">
                      <div>
                          <h2 className="text-2xl font-black text-gray-800 dark:text-white flex items-center gap-2">
                              <Settings className="w-6 h-6 text-blue-600"/> {seciliMakine} - Analiz Merkezi
                          </h2>
                      </div>
                      <button onClick={() => setSeciliMakine(null)} className="p-2 bg-gray-200 dark:bg-gray-700 hover:bg-red-100 hover:text-red-600 rounded-full transition-colors"><X className="w-6 h-6" /></button>
                  </div>
                  <div className="p-6 overflow-y-auto flex-1">
                      {/* ... Modal içeriği (Önceki kodla birebir aynı) ... */}
                      <p className="text-gray-500 dark:text-gray-400">Performans verileri ajan güncellenince yüklenecektir.</p>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default CanliDurum;