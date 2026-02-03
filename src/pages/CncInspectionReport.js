// src/pages/CncInspectionReport.js

import React, { useState, useEffect, useRef } from 'react';
import html2pdf from 'html2pdf.js'; 
import { 
    FileText, Download, Search
} from 'lucide-react';
import { collection, query, where, getDocs, orderBy, doc, getDoc } from '../config/firebase.js';
import { CNC_LATHE_JOBS_COLLECTION, CNC_MEASUREMENTS_COLLECTION, CNC_PARTS_COLLECTION } from '../config/constants.js';
import { formatDateTime } from '../utils/dateUtils.js';

const CncInspectionReport = ({ db }) => {
    const [jobs, setJobs] = useState([]);
    const [selectedJobId, setSelectedJobId] = useState('');
    const [reportData, setReportData] = useState(null);
    const [loading, setLoading] = useState(false);
    
    const reportRef = useRef(null);

    // 1. İş Emirlerini Çek
    useEffect(() => {
        if (!db) return;
        const fetchJobs = async () => {
            const q = query(collection(db, CNC_LATHE_JOBS_COLLECTION), orderBy('startTime', 'desc'));
            const snapshot = await getDocs(q);
            setJobs(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
        };
        fetchJobs();
    }, [db]);

    // 2. Rapor Verisini Hazırla
    const handleGenerateReport = async () => {
        if (!selectedJobId) return;
        setLoading(true);
        setReportData(null);

        try {
            const jobData = jobs.find(j => j.id === selectedJobId);
            
            let partCriteria = [];
            let partData = {};
            if (jobData.partId) {
                const partRef = doc(db, CNC_PARTS_COLLECTION, jobData.partId);
                const partSnap = await getDoc(partRef);
                if (partSnap.exists()) {
                    partData = partSnap.data();
                    partCriteria = partData.criteria || [];
                }
            }

            const mQuery = query(
                collection(db, CNC_MEASUREMENTS_COLLECTION), 
                where('jobId', '==', selectedJobId),
                orderBy('timestamp', 'asc')
            );
            const mSnap = await getDocs(mQuery);
            const measurements = mSnap.docs.map(d => d.data());

            setReportData({
                job: jobData,
                part: partData,
                measurements: measurements,
                criteria: partCriteria
            });

        } catch (error) {
            console.error("Rapor hatası:", error);
            alert("Rapor verisi çekilemedi.");
        } finally {
            setLoading(false);
        }
    };

    // 3. İNDİRME FONKSİYONU
    const handleDownloadPdf = () => {
        const element = reportRef.current;
        if (!element) return;

        const opt = {
            margin:       [2, 5, 2, 5], 
            filename:     `Kontrol_Formu_${reportData.job.orderNumber}.pdf`,
            image:        { type: 'jpeg', quality: 0.98 },
            html2canvas:  { 
                scale: 2, 
                useCORS: true, 
                scrollY: 0 
            }, 
            jsPDF:        { unit: 'mm', format: 'a4', orientation: 'landscape' },
            pagebreak:    { mode: ['avoid-all', 'css', 'legacy'] }
        };

        html2pdf().set(opt).from(element).save();
    };

    // --- YARDIMCI: HÜCRE BOYAMA ---
    const renderMeasurementCell = (measurement, criteriaId, criteria) => {
        if (!measurement) return <td className="border border-black p-1">-</td>;

        const detail = measurement.details?.find(d => d.criterionId.toString() === criteriaId.toString());
        let cellContent = '-';
        let cellClass = 'text-center align-middle';

        if (detail) {
            if (detail.type === 'BOOL') {
                cellContent = detail.value === 1 ? 'OK' : 'RET';
                cellClass += detail.value === 1 ? ' text-green-700 font-bold' : ' text-red-600 font-bold bg-red-100';
            } else {
                cellContent = detail.value;
                const val = parseFloat(detail.value);
                const nom = parseFloat(criteria.nominal);
                const upper = parseFloat(criteria.upperTol);
                const lower = parseFloat(criteria.lowerTol);
                
                if (val > (nom + upper) || val < (nom - Math.abs(lower))) {
                    cellClass += ' text-red-600 font-extrabold bg-red-100';
                } else {
                    cellClass += ' font-bold text-gray-800';
                }
            }
        }

        return (
            <td className={`border border-black p-1 text-xs ${cellClass}`}>
                {cellContent}
            </td>
        );
    };

    // --- SAYFALAMA MANTIĞI ---
    const getPaginatedMeasurements = () => {
        if (!reportData || !reportData.measurements) return [];
        
        const firstMeasurement = reportData.measurements[0]; 
        const otherMeasurements = reportData.measurements.slice(1); 
        
        const chunks = [];
        const chunkSize = 10; 

        if (otherMeasurements.length === 0) {
            chunks.push([]);
        } else {
            for (let i = 0; i < otherMeasurements.length; i += chunkSize) {
                chunks.push(otherMeasurements.slice(i, i + chunkSize));
            }
        }

        return { first: firstMeasurement, chunks };
    };

    const paginatedData = reportData ? getPaginatedMeasurements() : null;

    return (
        <div className="p-6 max-w-7xl mx-auto min-h-screen bg-gray-100 dark:bg-gray-900 font-sans">
            
            <h1 className="text-3xl font-extrabold text-gray-900 dark:text-white flex items-center mb-6">
                <FileText className="w-8 h-8 mr-3 text-blue-600" />
                Kalite Kontrol Formları
            </h1>

            {/* SEÇİM ALANI */}
            <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 mb-6 flex flex-col md:flex-row gap-4 items-end" data-html2canvas-ignore="true">
                <div className="flex-1 w-full">
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Raporlanacak İş Emri</label>
                    <select 
                        className="w-full p-2 border rounded bg-gray-50 dark:bg-gray-700 dark:text-white"
                        value={selectedJobId}
                        onChange={(e) => {
                            setSelectedJobId(e.target.value);
                            setReportData(null); 
                        }}
                    >
                        <option value="">Seçiniz...</option>
                        {jobs.map(j => (
                            <option key={j.id} value={j.id}>
                                {j.orderNumber} - {j.partName} ({formatDateTime(j.startTime)})
                            </option>
                        ))}
                    </select>
                </div>
                <button 
                    onClick={handleGenerateReport}
                    disabled={!selectedJobId || loading}
                    className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg disabled:opacity-50 flex items-center"
                >
                    {loading ? 'Hazırlanıyor...' : <><Search className="w-4 h-4 mr-2"/> Formu Getir</>}
                </button>
            </div>

            {/* İNDİRME BUTONU */}
            {reportData && (
                <div className="flex justify-end mb-4" data-html2canvas-ignore="true">
                    <button 
                        onClick={handleDownloadPdf} 
                        className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg shadow-lg flex items-center transition transform active:scale-95"
                    >
                        <Download className="w-5 h-5 mr-2"/> PDF OLARAK İNDİR
                    </button>
                </div>
            )}

            {/* RAPOR GÖRÜNÜMÜ */}
            {reportData && paginatedData ? (
                <div className="overflow-auto bg-gray-200 p-4 rounded-lg border border-gray-300">
                    <div ref={reportRef} className="bg-white text-black mx-auto">
                        
                        {paginatedData.chunks.map((chunk, pageIndex) => (
                            <div 
                                key={pageIndex}
                                className="p-4 relative"
                                style={{ 
                                    width: '290mm',
                                    height: '195mm', 
                                    overflow: 'hidden', 
                                    pageBreakAfter: 'always', 
                                    marginBottom: '0', 
                                    backgroundColor: 'white'
                                }} 
                            >
                                {/* HEADER ALANI */}
                                <div className="border-2 border-black mb-1">
                                    <div className="grid grid-cols-4 text-center border-b border-black">
                                        <div className="p-2 border-r border-black flex items-center justify-center">
                                            {/* LOGO GÜNCELLEMESİ - BOYUT ARTIRILDI (h-24) */}
                                            <img src="/logo512.png" alt="ETKA-D Logo" className="h-24 object-contain" />
                                        </div>
                                        <div className="col-span-3 p-2 font-bold text-2xl flex items-center justify-center">
                                            TALAŞLI İMALAT KONTROL FORMU
                                        </div>
                                    </div>

                                    {/* PARÇA VE DOKÜMAN BİLGİLERİ */}
                                    <div className="grid grid-cols-12 border-b border-black text-xs">
                                        <div className="col-span-1 border-r border-black flex items-center justify-center font-bold bg-gray-100">Parça<br/>Bilgileri</div>
                                        <div className="col-span-10 grid grid-cols-2">
                                            <div className="p-1 border-r border-black border-b border-black flex items-center"><span className="font-bold mr-2">Parça Adı:</span> <span>{reportData.part.partName}</span></div>
                                            <div className="p-1 border-b border-black flex items-center"><span className="font-bold mr-2">Teknik Resim NO:</span> <span>{reportData.part.technicalDrawingNo || '-'}</span></div>
                                            <div className="p-1 border-r border-black flex items-center"><span className="font-bold mr-2">Parça Kodu:</span> <span>{reportData.part.orderNumber}</span></div>
                                            <div className="p-1 flex items-center"><span className="font-bold mr-2">Revizyon No/Tarih:</span> <span>{reportData.part.revisionInfo || '-'}</span></div>
                                        </div>
                                        <div className="col-span-1 flex flex-col items-center justify-center bg-gray-100 border-l border-black">
                                            <div className="font-bold text-[9px] border-b border-black w-full text-center">Talimat NO:</div>
                                            <div className="font-bold text-lg">{reportData.part.instructionNo || '-'}</div>
                                        </div>
                                    </div>

                                    {/* UYARI METNİ */}
                                    <div className="text-[8px] p-1 border-b border-black text-center bg-gray-50">
                                        Kontroller TL04 - Numune Alma Planına göre yapılacaktır. Uygunsuzlukta PR05 - UYGUN OLMAYAN ÜRÜN VE SAHTE PARÇA KONTROL PROSEDÜRÜ uygulanır. Kontrol maddeleri, üretimi yapılan ürünün üretim ve kontrol talimatında yer alan maddelere istinaden doldurulacaktır.
                                    </div>

                                    {/* ALT TABLO: Üretim ve Hammalzeme Bilgileri */}
                                    <div className="grid grid-cols-12 text-xs">
                                        <div className="col-span-1 border-r border-black flex items-center justify-center font-bold bg-gray-100">Üretim<br/>Bilgileri</div>
                                        <div className="col-span-11 grid grid-cols-2">
                                            <div className="p-1 border-r border-black border-b border-black flex items-center"><span className="font-bold mr-2">Üretim Başlangıç Tarih/Saat:</span> <span>{formatDateTime(reportData.job.startTime)}</span></div>
                                            <div className="p-1 border-b border-black flex items-center"><span className="font-bold mr-2">İş Emri No:</span> <span>{reportData.job.orderNumber}</span></div>
                                            <div className="p-1 border-r border-black border-b border-black flex items-center"><span className="font-bold mr-2">Üretim Bitiş Tarih/Saat:</span> <span>{reportData.job.endTime ? formatDateTime(reportData.job.endTime) : '(Devam Ediyor)'}</span></div>
                                            <div className="p-1 border-b border-black flex items-center"><span className="font-bold mr-2">Makine No:</span> <span>{reportData.job.machine}</span></div>
                                            <div className="p-1 border-r border-black flex items-center"><span className="font-bold mr-2">Hammalzeme Stok Kodu:</span> <span>{reportData.part.rawMaterialCode || '-'}</span></div>
                                            <div className="p-1 flex items-center"><span className="font-bold mr-2">Hammalzeme Lot:</span> <div className="border-b border-black border-dashed w-32 h-4"></div></div>
                                        </div>
                                    </div>
                                </div>

                                {/* TABLO ALANI */}
                                <div className="w-full mt-1">
                                    <table className="w-full border-collapse border border-black text-center text-[10px]">
                                        <thead>
                                            <tr className="bg-gray-200">
                                                <th className="border border-black p-1 w-8">NO</th>
                                                <th className="border border-black p-1">KONTROL KRİTERİ (Nominal / Tol)</th>
                                                <th className="border border-black p-1 w-24">METOT</th>
                                                
                                                {/* SERİ BAŞLANGIÇ (Her Sayfada Görünür) */}
                                                <th className="border border-black p-1 w-24 bg-yellow-50 align-top">
                                                    <div className="font-bold border-b border-black pb-1 mb-1">SERİ BAŞ.<br/>ONAYI</div>
                                                    {paginatedData.first && (
                                                        <>
                                                            <span className="font-normal text-[9px] text-gray-600 block">
                                                                {new Date(paginatedData.first.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                                            </span>
                                                            <span className="text-[8px] font-black text-blue-900 uppercase block mt-1 bg-blue-50 rounded px-1">
                                                                {paginatedData.first.operator ? paginatedData.first.operator.split(' ')[0] : '-'}
                                                            </span>
                                                        </>
                                                    )}
                                                </th>

                                                {/* DINAMIK KONTROLLER */}
                                                {chunk.map((m, idx) => {
                                                    const realIndex = (pageIndex * 10) + (idx + 1);
                                                    return (
                                                        <th key={idx} className="border border-black p-1 min-w-[45px] align-top">
                                                            <div className="font-bold border-b border-gray-400 pb-1 mb-1">{realIndex}. KONTROL</div>
                                                            <span className="font-normal text-[9px] text-gray-600 block">
                                                                {new Date(m.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                                            </span>
                                                            <span className="text-[8px] font-black text-blue-900 uppercase block mt-1 bg-blue-50 rounded px-1">
                                                                {m.operator ? m.operator.split(' ')[0] : '-'}
                                                            </span>
                                                        </th>
                                                    );
                                                })}
                                                
                                                {/* Boş Sütunlar */}
                                                {Array.from({ length: Math.max(0, 10 - chunk.length) }).map((_, i) => (
                                                    <th key={`empty-${i}`} className="border border-black p-1 w-10 bg-gray-50"></th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {reportData.criteria.map((crit, idx) => (
                                                <tr key={crit.id}>
                                                    <td className="border border-black p-1 font-bold">{idx + 1}</td>
                                                    <td className="border border-black p-1 text-left px-2">
                                                        <span className="font-bold text-xs">{crit.name}</span>
                                                        {crit.type !== 'BOOL' && (
                                                            <span className="block text-[9px] text-gray-600">
                                                                {crit.nominal} (+{crit.upperTol} / -{Math.abs(crit.lowerTol)})
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="border border-black p-1 font-bold uppercase text-blue-800">
                                                        {crit.method || '-'}
                                                    </td>
                                                    
                                                    {renderMeasurementCell(paginatedData.first, crit.id, crit)}

                                                    {chunk.map((m, mIdx) => (
                                                        <React.Fragment key={mIdx}>
                                                            {renderMeasurementCell(m, crit.id, crit)}
                                                        </React.Fragment>
                                                    ))}
                                                    
                                                    {Array.from({ length: Math.max(0, 10 - chunk.length) }).map((_, i) => (
                                                        <td key={`empty-cell-${i}`} className="border border-black p-1"></td>
                                                    ))}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                {/* FOOTER (SABİT KONUMDA) */}
                                <div className="absolute bottom-4 left-4 right-4 border-t border-black pt-2">
                                    <div className="grid grid-cols-3 gap-8 text-center text-sm">
                                        <div>
                                            <div className="font-bold mb-6">Hazırlayan</div>
                                            <div className="border-t border-black w-32 mx-auto"></div>
                                        </div>
                                        <div>
                                            <div className="font-bold mb-6">Kontrol Eden</div>
                                            <div className="border-t border-black w-32 mx-auto"></div>
                                        </div>
                                        <div>
                                            <div className="font-bold mb-6">Onaylayan</div>
                                            <div className="border-t border-black w-32 mx-auto"></div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ) : (
                <div className="flex flex-col items-center justify-center h-64 text-gray-400 bg-white dark:bg-gray-800 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-700">
                    <FileText className="w-16 h-16 mb-4 opacity-20" />
                    <p>Raporu görüntülemek için yukarıdan bir iş seçip "Formu Getir" butonuna basın.</p>
                </div>
            )}
        </div>
    );
};

export default CncInspectionReport;