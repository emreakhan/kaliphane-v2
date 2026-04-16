import React, { useState, useEffect } from 'react';
import { db } from '../config/firebase'; 
import { doc, onSnapshot } from 'firebase/firestore';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';

// 👇 BURADAKİ // İŞARETLERİNİ KALDIRDIM, ARTIK CSS AKTİF!
import './CanliDurum.css'; 

const CanliDurum = () => {
    const [makineler, setMakineler] = useState({});
    const [yukleniyor, setYukleniyor] = useState(true);

    useEffect(() => {
        const unsub = onSnapshot(doc(db, 'KALIPHANE_SISTEMI', 'CANLI_DURUM'), (docSnap) => {
            if (docSnap.exists()) {
                setMakineler(docSnap.data().makineler);
            }
            setYukleniyor(false);
        });
        return () => unsub();
    }, []);

    if (yukleniyor) return <div className="loading">Veriler Trex'ten çekiliyor...</div>;

    return (
        <div className="canli-izleme-konteyner">
            <div className="ust-bar">
                <h2>Kalıphane Canlı İzleme</h2>
            </div>

            <div className="makine-grid">
                {Object.entries(makineler).map(([ad, veri]) => {
                    const chartData = [
                        { name: 'Net Çalışma', value: parseFloat(veri.analiz?.netCalisma || 0) },
                        { name: 'Toplam Duruş', value: parseFloat(veri.analiz?.toplamDurus || 0) }
                    ];

                    return (
                        <div key={ad} className={`makine-kart ${veri.durum === 'DURUYOR' ? 'durus-mod' : 'calis-mod'}`}>
                            
                            <div className="kart-header">
                                <h3>{ad}</h3>
                                <div className={`durum-sinyali ${veri.durum === 'DURUYOR' ? 'kirmizi' : 'yesil'}`}>
                                    {veri.durum}
                                </div>
                            </div>

                            <div className="rapor-tarih-alan">
                                <input type="date" defaultValue={new Date().toISOString().split('T')[0]} />
                                <span>-</span>
                                <input type="date" defaultValue={new Date().toISOString().split('T')[0]} />
                            </div>

                            <hr className="ayirici" />

                            <div className="analiz-icerik">
                                <div className="saat-bilgileri">
                                    <div className="saat-satir mavi">
                                        <span>Çalışma:</span> <strong>{veri.analiz?.toplamSure || 0}s</strong>
                                    </div>
                                    <div className="saat-satir turuncu">
                                        <span>Duruş:</span> <strong>{veri.analiz?.toplamDurus || 0}s</strong>
                                    </div>
                                    <div className="saat-satir yesil">
                                        <span>Net İş:</span> <strong>{veri.analiz?.netCalisma || 0}s</strong>
                                    </div>
                                </div>

                                <div className="grafik-bolumu">
                                    <ResponsiveContainer width="100%" height={100}>
                                        <PieChart>
                                            <Pie
                                                data={chartData}
                                                innerRadius={30}
                                                outerRadius={45}
                                                paddingAngle={2}
                                                dataKey="value"
                                                stroke="none"
                                            >
                                                <Cell fill="#00b894" />
                                                <Cell fill="#e67e22" />
                                            </Pie>
                                        </PieChart>
                                    </ResponsiveContainer>
                                    <div className="grafik-merkez-yuzde">
                                        %{veri.analiz?.yuzde || 0}
                                    </div>
                                </div>
                            </div>

                            <div className="kart-footer">
                                <p>{veri.neden || "Veri bekleniyor..."}</p>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default CanliDurum;