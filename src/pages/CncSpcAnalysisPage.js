// src/pages/CncSpcAnalysisPage.js

import React, { useState, useEffect, useMemo } from 'react';
import { 
    Activity, Search, BarChart2, Info, Filter 
} from 'lucide-react';
import { collection, query, where, onSnapshot } from '../config/firebase.js';
import { CNC_PARTS_COLLECTION, CNC_MEASUREMENTS_COLLECTION, CNC_LATHE_MACHINES } from '../config/constants.js';
import { formatDateTime } from '../utils/dateUtils.js';

// --- SVG KONTROL GRAFİĞİ BİLEŞENİ ---
const SpcChart = ({ data, nominal, upper, lower }) => {
    if (!data || data.length === 0) return <div className="text-center text-gray-400 py-10">Veri yok</div>;

    const width = 800;
    const height = 300;
    const padding = 40;

    const USL = nominal + upper; 
    const LSL = nominal - Math.abs(lower);
    const toleranceRange = USL - LSL;
    
    const dataMin = Math.min(...data.map(d => d.value));
    const dataMax = Math.max(...data.map(d => d.value));

    // Grafiğin alt ve üst sınırlarını veriye veya toleransa göre ayarla (hangisi genişse)
    const yMax = Math.max(USL + (toleranceRange * 0.3), dataMax);
    const yMin = Math.min(LSL - (toleranceRange * 0.3), dataMin);
    
    const xScale = (index) => padding + (index * ((width - 2 * padding) / (data.length > 1 ? data.length - 1 : 1)));
    const safeYRange = (yMax - yMin) === 0 ? 1 : (yMax - yMin);
    const yScale = (val) => height - padding - ((val - yMin) / safeYRange) * (height - 2 * padding);

    const nominalY = yScale(nominal);
    const upperY = yScale(USL);
    const lowerY = yScale(LSL);

    const linePoints = data.map((d, i) => `${xScale(i)},${yScale(d.value)}`).join(' ');

    return (
        <div className="overflow-x-auto">
            <svg viewBox={`0 0 ${width} ${height}`} className="w-full min-w-[600px] h-auto bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700">
                {/* Tolerans Alanı */}
                <rect x={padding} y={upperY} width={width - 2 * padding} height={Math.abs(lowerY - upperY)} fill="rgba(34, 197, 94, 0.1)" />

                {/* Kılavuz Çizgiler */}
                <line x1={padding} y1={nominalY} x2={width - padding} y2={nominalY} stroke="#10B981" strokeWidth="2" strokeDasharray="5,5" />
                <line x1={padding} y1={upperY} x2={width - padding} y2={upperY} stroke="#EF4444" strokeWidth="1" strokeDasharray="4,2" />
                <line x1={padding} y1={lowerY} x2={width - padding} y2={lowerY} stroke="#EF4444" strokeWidth="1" strokeDasharray="4,2" />

                {/* Veri Çizgisi */}
                <polyline points={linePoints} fill="none" stroke="#3B82F6" strokeWidth="2" />

                {/* Veri Noktaları */}
                {data.map((d, i) => (
                    <g key={i} className="group">
                        <circle 
                            cx={xScale(i)} 
                            cy={yScale(d.value)} 
                            r="4" 
                            fill={d.value > USL || d.value < LSL ? "#EF4444" : "#3B82F6"}
                            className="hover:r-6 transition-all cursor-pointer"
                        />
                        <title>{`Değer: ${d.value}\nMakine: ${d.machine}\nOp: ${d.operator}\nTarih: ${formatDateTime(d.date)}`}</title>
                    </g>
                ))}

                <text x={10} y={upperY + 4} className="text-[10px] fill-red-500 font-bold">USL {USL.toFixed(2)}</text>
                <text x={10} y={nominalY + 4} className="text-[10px] fill-green-600 font-bold">NOM {nominal}</text>
                <text x={10} y={lowerY + 4} className="text-[10px] fill-red-500 font-bold">LSL {LSL.toFixed(2)}</text>
            </svg>
        </div>
    );
};

const CncSpcAnalysisPage = ({ db }) => {
    const [parts, setParts] = useState([]);
    
    // Filtre State'leri
    const [selectedPartId, setSelectedPartId] = useState('');
    const [selectedCriterionId, setSelectedCriterionId] = useState('');
    const [selectedMachine, setSelectedMachine] = useState('ALL'); // YENİ: Makine Filtresi

    const [measurements, setMeasurements] = useState([]);
    
    // UI State
    const [selectedPart, setSelectedPart] = useState(null);
    const [chartData, setChartData] = useState([]);

    // 1. Parçaları Çek
    useEffect(() => {
        if (!db) return;
        const q = query(collection(db, CNC_PARTS_COLLECTION));
        const unsub = onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            data.sort((a, b) => a.partName.localeCompare(b.partName));
            setParts(data);
        });
        return () => unsub();
    }, [db]);

    // 2. Parça Seçimi
    useEffect(() => {
        if (selectedPartId) {
            const part = parts.find(p => p.id === selectedPartId);
            setSelectedPart(part);
            if (part && part.criteria) {
                const currentCritExists = part.criteria.some(c => c.id.toString() === selectedCriterionId);
                if (!currentCritExists) {
                    const firstNumCrit = part.criteria.find(c => (!c.type || c.type === 'NUMBER'));
                    if (firstNumCrit) setSelectedCriterionId(firstNumCrit.id);
                    else setSelectedCriterionId('');
                }
            }
        } else {
            setSelectedPart(null);
            setSelectedCriterionId('');
        }
    }, [selectedPartId, parts]);

    // 3. Ölçümleri Çek (Sadece PartId'ye göre - Client side filtreleme daha performanslı olur bu ölçekte)
    useEffect(() => {
        if (!db || !selectedPartId) return;
        const q = query(collection(db, CNC_MEASUREMENTS_COLLECTION), where('partId', '==', selectedPartId));
        const unsub = onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            setMeasurements(data);
        });
        return () => unsub();
    }, [db, selectedPartId]);

    // 4. Grafik Verisini Hazırla (Makine Filtresini Burada Uyguluyoruz)
    useEffect(() => {
        if (!selectedCriterionId || measurements.length === 0) {
            setChartData([]);
            return;
        }

        const dataPoints = [];
        measurements.forEach(m => {
            // MAKİNE FİLTRESİ
            if (selectedMachine !== 'ALL' && m.machine !== selectedMachine) return;

            if (m.details) {
                const detail = m.details.find(d => d.criterionId.toString() === selectedCriterionId.toString());
                if (detail && detail.value !== null && detail.type !== 'BOOL') {
                    const val = parseFloat(detail.value);
                    if(!isNaN(val)) {
                        dataPoints.push({
                            value: val,
                            date: m.timestamp,
                            operator: m.operator,
                            machine: m.machine
                        });
                    }
                }
            }
        });

        dataPoints.sort((a, b) => new Date(a.date) - new Date(b.date));
        setChartData(dataPoints);

    }, [measurements, selectedCriterionId, selectedMachine]);

    // İstatistik Hesapla
    const stats = useMemo(() => {
        if (chartData.length === 0 || !selectedPart || !selectedCriterionId) return null;
        
        const crit = selectedPart.criteria.find(c => c.id.toString() === selectedCriterionId.toString());
        if (!crit) return null;

        const values = chartData.map(d => d.value);
        const n = values.length;
        const mean = values.reduce((a, b) => a + b, 0) / n;
        
        let stdDev = 0;
        let Cp = 0;
        let Cpk = 0;

        if (n > 1) {
            const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (n - 1);
            stdDev = Math.sqrt(variance);

            const USL = parseFloat(crit.nominal) + parseFloat(crit.upperTol);
            const LSL = parseFloat(crit.nominal) - Math.abs(parseFloat(crit.lowerTol));

            if (stdDev > 0) {
                Cp = (USL - LSL) / (6 * stdDev);
                const Cpu = (USL - mean) / (3 * stdDev);
                const Cpl = (mean - LSL) / (3 * stdDev);
                Cpk = Math.min(Cpu, Cpl);
            }
        }

        return { 
            mean, stdDev, min: Math.min(...values), max: Math.max(...values), Cp, Cpk, 
            nominal: parseFloat(crit.nominal), 
            upperTol: parseFloat(crit.upperTol), 
            lowerTol: parseFloat(crit.lowerTol) 
        };
    }, [chartData, selectedPart, selectedCriterionId]);

    return (
        <div className="p-6 max-w-7xl mx-auto min-h-screen bg-gray-100 dark:bg-gray-900 font-sans">
            <h1 className="text-3xl font-extrabold text-gray-900 dark:text-white flex items-center mb-6">
                <Activity className="w-8 h-8 mr-3 text-purple-600" />
                İstatistiki Proses Kontrol (SPC)
            </h1>

            {/* FİLTRE PANELİ */}
            <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 mb-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Parça Seçimi</label>
                    <select 
                        className="w-full p-2 border rounded bg-gray-50 dark:bg-gray-700 dark:text-white"
                        value={selectedPartId}
                        onChange={(e) => setSelectedPartId(e.target.value)}
                    >
                        <option value="">Seçiniz...</option>
                        {parts.map(p => <option key={p.id} value={p.id}>{p.partName}</option>)}
                    </select>
                </div>
                
                {selectedPart && (
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Ölçü Kriteri</label>
                        <select 
                            className="w-full p-2 border rounded bg-gray-50 dark:bg-gray-700 dark:text-white"
                            value={selectedCriterionId}
                            onChange={(e) => setSelectedCriterionId(e.target.value)}
                        >
                            {selectedPart.criteria
                                .filter(c => !c.type || c.type === 'NUMBER') 
                                .map(c => <option key={c.id} value={c.id}>{c.name}</option>)
                            }
                        </select>
                    </div>
                )}

                {/* YENİ: MAKİNE FİLTRESİ */}
                {selectedPart && (
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Tezgah Filtresi</label>
                        <select 
                            className="w-full p-2 border rounded bg-gray-50 dark:bg-gray-700 dark:text-white"
                            value={selectedMachine}
                            onChange={(e) => setSelectedMachine(e.target.value)}
                        >
                            <option value="ALL">Tüm Tezgahlar</option>
                            {CNC_LATHE_MACHINES.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                    </div>
                )}
            </div>

            {/* İÇERİK: GRAFİK + BİLGİ KUTUSU */}
            {selectedPartId && selectedCriterionId && chartData.length > 0 ? (
                <div className="flex flex-col lg:flex-row gap-6">
                    
                    {/* SOL TARA: GRAFİK VE İSTATİSTİKLER (GENİŞ ALAN) */}
                    <div className="flex-1 space-y-6">
                        {/* Grafik */}
                        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                            <h3 className="font-bold text-gray-700 dark:text-gray-200 mb-4 flex items-center justify-between">
                                <span className="flex items-center"><BarChart2 className="w-5 h-5 mr-2" /> X-Bar Kontrol Grafiği</span>
                                <span className="text-xs font-normal text-gray-400">
                                    {selectedMachine === 'ALL' ? 'Tüm Tezgahlar' : selectedMachine}
                                </span>
                            </h3>
                            {stats && (
                                <SpcChart 
                                    data={chartData} 
                                    nominal={stats.nominal} 
                                    upper={stats.upperTol} 
                                    lower={stats.lowerTol} 
                                />
                            )}
                        </div>

                        {/* İstatistik Özet */}
                        {stats && (
                            <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded text-center">
                                    <div className="text-xs text-gray-500">Örnek Sayısı</div>
                                    <div className="font-bold text-lg dark:text-white">{chartData.length}</div>
                                </div>
                                <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded text-center">
                                    <div className="text-xs text-gray-500">Ortalama</div>
                                    <div className="font-bold text-lg dark:text-white">{stats.mean.toFixed(3)}</div>
                                </div>
                                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded text-center">
                                    <div className="text-xs text-blue-500 font-bold">Cp (Potansiyel)</div>
                                    <div className="font-bold text-lg text-blue-700 dark:text-blue-300">{stats.Cp.toFixed(2)}</div>
                                </div>
                                <div className={`p-3 rounded text-center ${stats.Cpk < 1.33 ? 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300' : 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300'}`}>
                                    <div className="text-xs font-bold">Cpk (Yeterlilik)</div>
                                    <div className="font-bold text-lg">{stats.Cpk.toFixed(2)}</div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* SAĞ TARAF: BİLGİ KUTUSU (SABİT) */}
                    <div className="w-full lg:w-80 space-y-6">
                        {/* Cpk Açıklama Kartı */}
                        <div className="bg-white dark:bg-gray-800 p-5 rounded-xl shadow-sm border border-blue-100 dark:border-gray-700">
                            <h4 className="font-bold text-gray-800 dark:text-white mb-3 flex items-center text-sm border-b pb-2">
                                <Info className="w-4 h-4 mr-2 text-blue-500" /> Cpk Değerleri Ne Anlatır?
                            </h4>
                            <div className="space-y-3 text-xs">
                                <div className="flex items-start">
                                    <span className="w-3 h-3 rounded-full bg-red-500 mt-0.5 mr-2 shrink-0"></span>
                                    <div>
                                        <span className="font-bold text-red-600">Cpk &lt; 1.00 (Yetersiz)</span>
                                        <p className="text-gray-500 mt-0.5">Süreç kontrolsüz. Parçalar tolerans dışına çıkıyor. %100 kontrol gerekli.</p>
                                    </div>
                                </div>
                                <div className="flex items-start">
                                    <span className="w-3 h-3 rounded-full bg-yellow-400 mt-0.5 mr-2 shrink-0"></span>
                                    <div>
                                        <span className="font-bold text-yellow-600">1.00 - 1.33 (Riskli)</span>
                                        <p className="text-gray-500 mt-0.5">Süreç sınırda. Yakın takip ve sık kontrol gerekli.</p>
                                    </div>
                                </div>
                                <div className="flex items-start">
                                    <span className="w-3 h-3 rounded-full bg-green-500 mt-0.5 mr-2 shrink-0"></span>
                                    <div>
                                        <span className="font-bold text-green-600">1.33 - 1.67 (İyi)</span>
                                        <p className="text-gray-500 mt-0.5">Süreç sağlıklı ve kararlı. Standart prosedür uygulanabilir.</p>
                                    </div>
                                </div>
                                <div className="flex items-start">
                                    <span className="w-3 h-3 rounded-full bg-blue-500 mt-0.5 mr-2 shrink-0"></span>
                                    <div>
                                        <span className="font-bold text-blue-600">Cpk &gt; 1.67 (Mükemmel)</span>
                                        <p className="text-gray-500 mt-0.5">Süreç çok hassas. Kontrol sıklığı azaltılabilir.</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Parça Bilgisi */}
                        {selectedPart && selectedPart.controlFrequency && (
                            <div className="bg-blue-50 dark:bg-blue-900/10 p-4 rounded-xl border border-blue-100 dark:border-blue-800">
                                <div className="text-xs font-bold text-blue-500 uppercase mb-1">Tanımlı Prosedür</div>
                                <div className="text-sm text-gray-700 dark:text-gray-300">
                                    Bu parça için belirlenen kontrol sıklığı: <br/>
                                    <span className="font-black text-lg text-blue-700">Her {selectedPart.controlFrequency} Adette Bir</span>
                                </div>
                            </div>
                        )}
                    </div>

                </div>
            ) : (
                <div className="text-center text-gray-400 py-20 bg-white dark:bg-gray-800 rounded-xl border border-dashed border-gray-300 dark:border-gray-700">
                    <Search className="w-16 h-16 mx-auto mb-4 opacity-20" />
                    <p>Analiz yapmak için yukarıdan parça ve ölçü kriteri seçiniz.</p>
                </div>
            )}
        </div>
    );
};

export default CncSpcAnalysisPage;