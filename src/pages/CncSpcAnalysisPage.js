// src/pages/CncInspectionReport.js

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
    Activity, Search, BarChart2, Info, Trash2, RotateCcw, FileText, Download 
} from 'lucide-react';
import { 
    collection, query, where, onSnapshot, getDocs, deleteDoc, doc, updateDoc 
} from '../config/firebase.js';
import { 
    CNC_PARTS_COLLECTION, CNC_MEASUREMENTS_COLLECTION, CNC_LATHE_MACHINES 
} from '../config/constants.js';
import { formatDateTime } from '../utils/dateUtils.js';
import html2pdf from 'html2pdf.js'; 

// --- SVG KONTROL GRAFİĞİ BİLEŞENİ ---
const SpcChart = ({ data, nominal, upper, lower, width = 800, height = 300 }) => {
    if (!data || data.length === 0) return <div className="text-center text-gray-400 py-10">Veri yok</div>;

    const padding = 40;

    const USL = nominal + upper; 
    const LSL = nominal - Math.abs(lower);
    
    const dataMin = Math.min(...data.map(d => d.value));
    const dataMax = Math.max(...data.map(d => d.value));
    const allValues = [USL, LSL, dataMin, dataMax];
    
    const chartMin = Math.min(...allValues);
    const chartMax = Math.max(...allValues);
    const range = chartMax - chartMin;
    
    const yMax = chartMax + (range * 0.2);
    const yMin = chartMin - (range * 0.2);
    
    const xScale = (index) => padding + (index * ((width - 2 * padding) / (data.length > 1 ? data.length - 1 : 1)));
    const safeYRange = (yMax - yMin) === 0 ? 1 : (yMax - yMin);
    const yScale = (val) => height - padding - ((val - yMin) / safeYRange) * (height - 2 * padding);

    const nominalY = yScale(nominal);
    const upperY = yScale(USL);
    const lowerY = yScale(LSL);

    const linePoints = data.map((d, i) => `${xScale(i)},${yScale(d.value)}`).join(' ');

    return (
        <div className="overflow-x-auto flex justify-center">
            <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700">
                <rect x={padding} y={upperY} width={width - 2 * padding} height={Math.abs(lowerY - upperY)} fill="rgba(34, 197, 94, 0.1)" />
                <line x1={padding} y1={nominalY} x2={width - padding} y2={nominalY} stroke="#10B981" strokeWidth="2" strokeDasharray="5,5" />
                <line x1={padding} y1={upperY} x2={width - padding} y2={upperY} stroke="#EF4444" strokeWidth="1" strokeDasharray="4,2" />
                <line x1={padding} y1={lowerY} x2={width - padding} y2={lowerY} stroke="#EF4444" strokeWidth="1" strokeDasharray="4,2" />
                <polyline points={linePoints} fill="none" stroke="#3B82F6" strokeWidth="2" />
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
    const [selectedPartId, setSelectedPartId] = useState('');
    const [selectedCriterionId, setSelectedCriterionId] = useState('');
    const [selectedMachine, setSelectedMachine] = useState('ALL'); 
    const [measurements, setMeasurements] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selectedPart, setSelectedPart] = useState(null);
    const [chartData, setChartData] = useState([]);

    // Rapor Referansı
    const reportRef = useRef(null);

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

    // 2. Seçim Yönetimi
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

    // 3. Verileri Dinle
    useEffect(() => {
        if (!db || !selectedPartId) return;
        const q = query(collection(db, CNC_MEASUREMENTS_COLLECTION), where('partId', '==', selectedPartId));
        const unsub = onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            setMeasurements(data);
        });
        return () => unsub();
    }, [db, selectedPartId]);

    // 4. Grafik Verisini Hazırlama
    useEffect(() => {
        if (!selectedCriterionId || measurements.length === 0) {
            setChartData([]);
            return;
        }

        const dataPoints = [];
        measurements.forEach(m => {
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

    // --- SADECE SEÇİLEN ÖLÇÜYÜ SIFIRLA ---
    const handleResetCriterionData = async () => {
        if (!selectedPartId || !selectedCriterionId) return;
        
        const critName = selectedPart?.criteria?.find(c => c.id.toString() === selectedCriterionId)?.name || 'Seçili Kriter';
        if (!window.confirm(`DİKKAT: Sadece "${critName}" için geçmiş veriler silinecek! Onaylıyor musunuz?`)) return;

        setLoading(true);
        try {
            const q = query(collection(db, CNC_MEASUREMENTS_COLLECTION), where('partId', '==', selectedPartId));
            const snapshot = await getDocs(q);
            
            const updatePromises = snapshot.docs.map(async (docSnapshot) => {
                const docData = docSnapshot.data();
                if (!docData.details) return;
                const newDetails = docData.details.filter(d => d.criterionId.toString() !== selectedCriterionId.toString());
                if (newDetails.length !== docData.details.length) {
                    if (newDetails.length === 0) return deleteDoc(doc(db, CNC_MEASUREMENTS_COLLECTION, docSnapshot.id));
                    else return updateDoc(doc(db, CNC_MEASUREMENTS_COLLECTION, docSnapshot.id), { details: newDetails });
                }
            });

            await Promise.all(updatePromises);
            alert(`${critName} verileri temizlendi.`);
        } catch (error) { console.error("Silme hatası:", error); } 
        finally { setLoading(false); }
    };

    // --- RAPOR İNDİRME ---
    const handleDownloadReport = () => {
        const element = reportRef.current;
        if (!element) return;

        const opt = {
            margin: 5,
            filename: `SPC_Raporu_${selectedPart?.partName}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true }, // useCORS eklendi (resimler için önemli)
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }
        };

        html2pdf().set(opt).from(element).save();
    };

    // İstatistikler
    const stats = useMemo(() => {
        if (chartData.length === 0 || !selectedPart || !selectedCriterionId) return null;
        
        const crit = selectedPart.criteria.find(c => c.id.toString() === selectedCriterionId.toString());
        if (!crit) return null;

        const values = chartData.map(d => d.value);
        const n = values.length;
        const mean = values.reduce((a, b) => a + b, 0) / n;
        
        let stdDev = 0, Cp = 0, Cpk = 0;

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
            lowerTol: parseFloat(crit.lowerTol),
            critName: crit.name
        };
    }, [chartData, selectedPart, selectedCriterionId]);

    return (
        <div className="p-6 max-w-7xl mx-auto min-h-screen bg-gray-100 dark:bg-gray-900 font-sans">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-extrabold text-gray-900 dark:text-white flex items-center">
                    <Activity className="w-8 h-8 mr-3 text-purple-600" />
                    İstatistiki Proses Kontrol (SPC)
                </h1>
                
                {/* PDF İNDİR BUTONU */}
                {selectedPart && selectedCriterionId && chartData.length > 0 && (
                    <button 
                        onClick={handleDownloadReport}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg shadow-lg flex items-center font-bold transition transform active:scale-95"
                    >
                        <FileText className="w-5 h-5 mr-2" />
                        Raporu İndir
                    </button>
                )}
            </div>

            {/* FİLTRE PANELİ */}
            <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 mb-6 grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                {/* 1. PARÇA */}
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
                
                {/* 2. KRİTER */}
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

                {/* 3. TEZGAH */}
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

                {/* 4. SIFIRLAMA BUTONU */}
                {selectedPart && selectedCriterionId && (
                    <div>
                        <button 
                            onClick={handleResetCriterionData}
                            disabled={loading}
                            className="w-full p-2 bg-red-100 hover:bg-red-200 text-red-700 border border-red-200 rounded font-bold flex items-center justify-center transition whitespace-nowrap"
                        >
                            {loading ? <span>İşleniyor...</span> : <><Trash2 className="w-4 h-4 mr-2"/> Ölçüyü Sıfırla</>}
                        </button>
                    </div>
                )}
            </div>

            {/* İÇERİK */}
            {selectedPartId && selectedCriterionId && chartData.length > 0 ? (
                <div className="flex flex-col lg:flex-row gap-6">
                    <div className="flex-1 space-y-6">
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

                    <div className="w-full lg:w-80 space-y-6">
                        <div className="bg-white dark:bg-gray-800 p-5 rounded-xl shadow-sm border border-blue-100 dark:border-gray-700">
                            <h4 className="font-bold text-gray-800 dark:text-white mb-3 flex items-center text-sm border-b pb-2">
                                <Info className="w-4 h-4 mr-2 text-blue-500" /> Cpk Değerleri Ne Anlatır?
                            </h4>
                            <div className="space-y-3 text-xs">
                                <div className="flex items-start">
                                    <span className="w-3 h-3 rounded-full bg-red-500 mt-0.5 mr-2 shrink-0"></span>
                                    <div><span className="font-bold text-red-600">Cpk &lt; 1.00 (Yetersiz)</span><p className="text-gray-500 mt-0.5">Süreç kontrolsüz.</p></div>
                                </div>
                                <div className="flex items-start">
                                    <span className="w-3 h-3 rounded-full bg-yellow-400 mt-0.5 mr-2 shrink-0"></span>
                                    <div><span className="font-bold text-yellow-600">1.00 - 1.33 (Riskli)</span><p className="text-gray-500 mt-0.5">Sınırda süreç.</p></div>
                                </div>
                                <div className="flex items-start">
                                    <span className="w-3 h-3 rounded-full bg-green-500 mt-0.5 mr-2 shrink-0"></span>
                                    <div><span className="font-bold text-green-600">1.33 - 1.67 (İyi)</span><p className="text-gray-500 mt-0.5">Süreç kararlı.</p></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="text-center text-gray-400 py-20 bg-white dark:bg-gray-800 rounded-xl border border-dashed border-gray-300 dark:border-gray-700">
                    <Search className="w-16 h-16 mx-auto mb-4 opacity-20" />
                    <p>Analiz yapmak için yukarıdan parça ve ölçü kriteri seçiniz.</p>
                </div>
            )}

            {/* --- GİZLİ RAPOR ŞABLONU (Ekranda görünmez, PDF için kullanılır) --- */}
            <div style={{ position: 'absolute', top: '-9999px', left: '-9999px' }}>
                <div ref={reportRef} className="bg-white p-8 w-[297mm] h-[210mm] mx-auto text-black">
                    
                    {/* Header */}
                    <div className="flex justify-between items-center border-b-2 border-black pb-4 mb-4">
                        <div>
                            {/* LOGO BURAYA GELECEK - 'public/logo.png' varsayılmıştır */}
                            <img src="/logo512.png" alt="Firma Logosu" className="h-12 object-contain" />
                        </div>
                        <div className="text-center">
                            <h2 className="text-2xl font-bold">SPC PROSES YETERLİLİK RAPORU</h2>
                            <p className="text-sm font-mono">{formatDateTime(new Date().toISOString())}</p>
                        </div>
                        <div className="text-right text-xs">
                            <div><strong>Rapor No:</strong> SPC-{new Date().getTime().toString().slice(-6)}</div>
                            <div><strong>Analiz:</strong> {chartData.length} Örnek</div>
                        </div>
                    </div>

                    {/* Bilgiler & İstatistikler */}
                    <div className="grid grid-cols-3 gap-6 mb-6">
                        <div className="border border-gray-300 p-3 rounded bg-gray-50">
                            <h3 className="font-bold border-b border-gray-300 mb-2 pb-1 text-sm">PARÇA BİLGİLERİ</h3>
                            <div className="text-xs space-y-1">
                                <div className="flex justify-between"><span>Parça Adı:</span> <strong>{selectedPart?.partName}</strong></div>
                                <div className="flex justify-between"><span>Stok Kodu:</span> <strong>{selectedPart?.orderNumber}</strong></div>
                                <div className="flex justify-between"><span>Analiz Kriteri:</span> <strong>{stats?.critName}</strong></div>
                                <div className="flex justify-between"><span>Nominal / Tol:</span> <strong>{stats?.nominal} ({stats?.upperTol > 0 ? '+' : ''}{stats?.upperTol} / {stats?.lowerTol})</strong></div>
                            </div>
                        </div>

                        <div className="border border-gray-300 p-3 rounded bg-gray-50">
                            <h3 className="font-bold border-b border-gray-300 mb-2 pb-1 text-sm">YETERLİLİK ANALİZİ</h3>
                            <div className="grid grid-cols-2 gap-4 text-center">
                                <div>
                                    <div className="text-[10px] text-gray-500">Cp</div>
                                    <div className="text-xl font-black">{stats?.Cp.toFixed(2)}</div>
                                </div>
                                <div>
                                    <div className="text-[10px] text-gray-500">Cpk</div>
                                    <div className={`text-xl font-black ${stats?.Cpk < 1.33 ? 'text-red-600' : 'text-green-600'}`}>{stats?.Cpk.toFixed(2)}</div>
                                </div>
                            </div>
                            <div className={`mt-2 text-center text-[10px] font-bold text-white p-1 rounded ${stats?.Cpk >= 1.33 ? 'bg-green-600' : 'bg-red-600'}`}>
                                {stats?.Cpk >= 1.33 ? 'PROSES YETERLİ' : 'İYİLEŞTİRME GEREKLİ'}
                            </div>
                        </div>

                        <div className="border border-gray-300 p-3 rounded bg-gray-50">
                            <h3 className="font-bold border-b border-gray-300 mb-2 pb-1 text-sm">İSTATİSTİK ÖZETİ</h3>
                            <div className="text-xs space-y-1">
                                <div className="flex justify-between"><span>Ortalama:</span> <strong>{stats?.mean.toFixed(3)}</strong></div>
                                <div className="flex justify-between"><span>Std. Sapma:</span> <strong>{stats?.stdDev.toFixed(4)}</strong></div>
                                <div className="flex justify-between"><span>Min / Max:</span> <strong>{stats?.min} / {stats?.max}</strong></div>
                                <div className="flex justify-between"><span>Aralık (R):</span> <strong>{(stats?.max - stats?.min).toFixed(3)}</strong></div>
                            </div>
                        </div>
                    </div>

                    {/* Grafik */}
                    <div className="mb-6 border border-gray-300 p-2 rounded flex justify-center">
                        <div className="w-full">
                            <h3 className="font-bold text-sm mb-2 ml-2">KONTROL GRAFİĞİ (X-Bar)</h3>
                            {stats && (
                                <SpcChart 
                                    data={chartData} 
                                    nominal={stats.nominal} 
                                    upper={stats.upperTol} 
                                    lower={stats.lowerTol} 
                                    width={1000} 
                                    height={250} 
                                />
                            )}
                        </div>
                    </div>

                    {/* Alt Tablo */}
                    <div>
                        <h3 className="font-bold text-sm border-b border-black mb-2">SON ÖLÇÜM VERİLERİ (Özet)</h3>
                        <div className="grid grid-cols-4 gap-x-4 gap-y-1 text-[9px]">
                            {[...measurements].reverse().slice(0, 24).map((m, i) => {
                                const val = m.details?.find(d => d.criterionId.toString() === selectedCriterionId)?.value;
                                return (
                                    <div key={i} className="border-b border-gray-200 flex justify-between px-1">
                                        <span className="text-gray-500">{formatDateTime(m.timestamp)}</span>
                                        <span className="font-bold">{val}</span>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                    
                    {/* Footer */}
                    <div className="mt-auto border-t-2 border-black pt-4 grid grid-cols-3 gap-10 text-center text-sm">
                        <div><div className="mb-6 font-bold">Hazırlayan</div><div className="border-t border-black w-24 mx-auto"></div></div>
                        <div><div className="mb-6 font-bold">Kalite Sorumlusu</div><div className="border-t border-black w-24 mx-auto"></div></div>
                        <div><div className="mb-6 font-bold">Onay</div><div className="border-t border-black w-24 mx-auto"></div></div>
                    </div>
                </div>
            </div>

        </div>
    );
};

export default CncSpcAnalysisPage;