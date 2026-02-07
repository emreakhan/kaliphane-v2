// src/pages/CncLatheCalendarPage.js

import React, { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock, Layers, FileText, ZoomIn, ZoomOut, Wrench } from 'lucide-react';
import { CNC_LATHE_MACHINES } from '../config/constants.js';

// PDF Kütüphaneleri
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// --- ZAMAN MOTORU ---

const isWeekend = (date) => {
    const d = new Date(date);
    return d.getDay() === 0 || d.getDay() === 6; 
};

// İş süresini (saat) tarihe eklerken hafta sonlarını atlayan fonksiyon
const addHoursSkippingWeekends = (startDate, hoursToAdd) => {
    let currentDate = new Date(startDate);
    let remainingMinutes = hoursToAdd * 60; 

    while (remainingMinutes > 0) {
        currentDate.setMinutes(currentDate.getMinutes() + 15); // 15 dk hassasiyet
        remainingMinutes -= 15;

        // Cumartesi olduysa -> Pazartesi 08:00'e sar
        if (currentDate.getDay() === 6) { 
            currentDate.setDate(currentDate.getDate() + 2); 
            currentDate.setHours(8, 0, 0, 0); 
        } 
        // Pazar olduysa -> Pazartesi 08:00'e sar
        else if (currentDate.getDay() === 0) { 
            currentDate.setDate(currentDate.getDate() + 1);
            currentDate.setHours(8, 0, 0, 0);
        }
    }
    return currentDate;
};

// Belirli bir tarih aralığındaki günleri getir
const getDaysRange = (startDate, daysCount) => {
    const days = [];
    const current = new Date(startDate);
    current.setHours(0,0,0,0);
    
    for (let i = 0; i < daysCount; i++) {
        days.push(new Date(current));
        current.setDate(current.getDate() + 1);
    }
    return days;
};

const CncLatheCalendarPage = ({ cncJobs }) => {
    const [viewDays, setViewDays] = useState(7); 
    const [startDate, setStartDate] = useState(new Date());

    // --- ZİNCİRLEME HESAPLAMA MOTORU (AYAR SÜRESİ DAHİL) ---
    const machineSchedules = useMemo(() => {
        if (!cncJobs) return {};
        const schedules = {};

        CNC_LATHE_MACHINES.forEach(machine => {
            let jobs = cncJobs.filter(j => 
                j.machine === machine && 
                j.status !== 'COMPLETED'
            );

            // SIRALAMA
            jobs.sort((a, b) => {
                if (a.status === 'RUNNING') return -1;
                if (b.status === 'RUNNING') return 1;
                const indexA = a.orderIndex !== undefined ? a.orderIndex : 9999;
                const indexB = b.orderIndex !== undefined ? b.orderIndex : 9999;
                return indexA - indexB;
            });

            // ZAMAN HESABI
            let cursorTime = new Date(); 

            if (isWeekend(cursorTime)) {
                cursorTime = addHoursSkippingWeekends(cursorTime, 0.1); 
                cursorTime.setHours(8, 0, 0, 0);
            }

            const plannedJobs = jobs.map((job, index) => {
                const cycleTime = parseFloat(job.cycleTime) || 0;
                const quantity = parseInt(job.targetQuantity) || 0;
                const productionHours = (cycleTime * quantity) / 3600;
                
                // Sabit Ayar Süresi (2 Saat)
                const SETUP_HOURS = 2;

                let setupStart = null;
                let setupEnd = null;
                let productionStart = null;
                let productionEnd = null;

                if (job.status === 'RUNNING') {
                    // Çalışan işin ayarı bitmiş varsayılır, direkt üretimden başlar
                    productionStart = job.startTime ? new Date(job.startTime) : new Date();
                    // Ayar süresi yok (veya geçmişte kaldı)
                    setupStart = productionStart; 
                    setupEnd = productionStart;
                } else {
                    // Bekleyen iş: Önce AYAR başlar
                    setupStart = new Date(cursorTime);
                    setupEnd = addHoursSkippingWeekends(setupStart, SETUP_HOURS);
                    productionStart = setupEnd;
                }

                // Üretim Bitişi
                productionEnd = addHoursSkippingWeekends(productionStart, productionHours);

                // İmleci güncelle
                cursorTime = new Date(productionEnd);

                return {
                    ...job,
                    setupStart,
                    setupEnd,
                    productionStart,
                    productionEnd,
                    productionDuration: productionHours,
                    totalDuration: productionHours + (job.status === 'RUNNING' ? 0 : SETUP_HOURS)
                };
            });

            schedules[machine] = plannedJobs;
        });

        return schedules;
    }, [cncJobs]);

    // --- PDF RAPORU ---
    const handleDownloadPdf = () => {
        const doc = new jsPDF('l', 'mm', 'a4'); 
        const primaryColor = [41, 98, 255]; 
        
        doc.setFillColor(...primaryColor);
        doc.rect(0, 0, 297, 30, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(20);
        doc.setFont("helvetica", "bold");
        doc.text("CNC TORNA URETIM PLANI (TIMELINE)", 14, 20);
        
        doc.setFontSize(10);
        doc.text(`Rapor Tarihi: ${new Date().toLocaleDateString('tr-TR')}`, 240, 20);

        let yPos = 40;

        CNC_LATHE_MACHINES.forEach(machine => {
            const jobs = machineSchedules[machine] || [];
            
            if (jobs.length > 0) {
                doc.setFontSize(14);
                doc.setTextColor(...primaryColor);
                doc.setFont("helvetica", "bold");
                doc.text(`TEZGAH: ${machine}`, 14, yPos);
                doc.setDrawColor(200, 200, 200);
                doc.line(14, yPos + 2, 283, yPos + 2);
                yPos += 7;

                const tableBody = jobs.map((job, index) => {
                    const durationStr = job.productionDuration.toFixed(1) + ' s.';
                    const setupStr = job.status === 'RUNNING' ? '-' : '2 s.';
                    
                    const startStr = job.productionStart.toLocaleString('tr-TR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute:'2-digit'});
                    const endStr = job.productionEnd.toLocaleString('tr-TR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute:'2-digit'});
                    
                    return [
                        index + 1,
                        job.partName,
                        job.targetQuantity,
                        setupStr,
                        startStr,
                        endStr,
                        durationStr
                    ];
                });

                autoTable(doc, {
                    startY: yPos,
                    head: [['#', 'PARCA', 'ADET', 'AYAR', 'URETIM BAS.', 'URETIM BIT.', 'SURE']],
                    body: tableBody,
                    theme: 'striped',
                    headStyles: { fillColor: [66, 66, 66], textColor: 255, fontStyle: 'bold', halign: 'center' },
                    bodyStyles: { textColor: 50, fontSize: 10, halign: 'center' },
                    alternateRowStyles: { fillColor: [245, 245, 245] },
                    margin: { left: 14, right: 14 }
                });
                yPos = doc.lastAutoTable.finalY + 15;
            }
        });

        doc.save(`CNC_Timeline_${new Date().toISOString().slice(0,10)}.pdf`);
    };

    // --- NAVİGASYON ---
    const handlePrev = () => {
        const newDate = new Date(startDate);
        newDate.setDate(newDate.getDate() - Math.floor(viewDays / 2));
        setStartDate(newDate);
    };
    const handleNext = () => {
        const newDate = new Date(startDate);
        newDate.setDate(newDate.getDate() + Math.floor(viewDays / 2));
        setStartDate(newDate);
    };
    const handleToday = () => setStartDate(new Date());

    const days = getDaysRange(startDate, viewDays);

    // --- POZİSYON HESAPLAMA (YÜZDE) ---
    const getPosition = (start, end, viewStart) => {
        const totalViewDuration = viewDays * 24 * 60 * 60 * 1000;
        const viewStartTime = viewStart.getTime();
        const sTime = start.getTime();
        const eTime = end.getTime();

        const offsetMs = sTime - viewStartTime;
        let leftPercent = (offsetMs / totalViewDuration) * 100;

        const durationMs = eTime - sTime;
        let widthPercent = (durationMs / totalViewDuration) * 100;

        // Kırpma (Görünüm Dışı)
        if (leftPercent < 0) {
            widthPercent += leftPercent; 
            leftPercent = 0;
        }
        if (leftPercent + widthPercent > 100) {
            widthPercent = 100 - leftPercent;
        }

        if (widthPercent <= 0) return null;

        return { left: `${leftPercent}%`, width: `${widthPercent}%` };
    };

    return (
        <div className="p-4 sm:p-6 min-h-screen bg-gray-100 dark:bg-gray-900 font-sans">
            
            {/* ÜST BAR */}
            <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
                <div className="flex items-center">
                    <CalendarIcon className="w-8 h-8 text-blue-600 mr-3" />
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">CNC Timeline</h1>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Üretim Akış Şeması (Ayar + Üretim)</p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button onClick={() => setViewDays(Math.max(3, viewDays - 2))} className="p-2 hover:bg-gray-200 rounded-full dark:text-white" title="Yaklaş"><ZoomIn className="w-5 h-5"/></button>
                    <button onClick={() => setViewDays(Math.min(30, viewDays + 2))} className="p-2 hover:bg-gray-200 rounded-full dark:text-white" title="Uzaklaş"><ZoomOut className="w-5 h-5"/></button>
                    <div className="h-6 w-px bg-gray-300 mx-2"></div>
                    <button onClick={handlePrev} className="p-2 hover:bg-gray-200 rounded-full dark:text-white"><ChevronLeft /></button>
                    <span className="font-bold text-sm min-w-[120px] text-center dark:text-white">
                        {startDate.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })} - {days[days.length-1].toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}
                    </span>
                    <button onClick={handleNext} className="p-2 hover:bg-gray-200 rounded-full dark:text-white"><ChevronRight /></button>
                    <button onClick={handleToday} className="ml-2 px-3 py-1 text-xs font-bold text-blue-600 border border-blue-200 rounded hover:bg-blue-50">Bugün</button>
                </div>

                <button onClick={handleDownloadPdf} className="flex items-center px-4 py-2 bg-red-600 text-white rounded-lg shadow hover:bg-red-700 transition text-sm">
                    <FileText className="w-4 h-4 mr-2" /> PDF Rapor
                </button>
            </div>

            {/* TIMELINE ALANI */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden overflow-x-auto">
                <div className="min-w-[1000px]">
                    
                    {/* ZAMAN CETVELİ */}
                    <div className="flex border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 h-12">
                        <div className="w-32 flex-shrink-0 border-r border-gray-200 dark:border-gray-700 flex items-center justify-center font-bold text-gray-500 sticky left-0 bg-gray-50 dark:bg-gray-900 z-20 shadow-md">
                            TEZGAH
                        </div>
                        <div className="flex-1 flex relative">
                            {days.map((day, i) => (
                                <div key={i} className={`flex-1 border-r border-gray-200 dark:border-gray-700 flex flex-col items-center justify-center ${isWeekend(day) ? 'bg-red-50/50 dark:bg-red-900/10' : ''}`}>
                                    <span className="text-[10px] font-bold text-gray-500 uppercase">{day.toLocaleDateString('tr-TR', { weekday: 'short' })}</span>
                                    <span className="text-sm font-bold text-gray-800 dark:text-gray-200">{day.getDate()}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* TEZGAH SATIRLARI */}
                    {CNC_LATHE_MACHINES.map(machine => {
                        const jobs = machineSchedules[machine] || [];

                        return (
                            <div key={machine} className="flex border-b border-gray-200 dark:border-gray-700 h-20 group hover:bg-gray-50 dark:hover:bg-gray-700/20 transition">
                                {/* Makine Adı */}
                                <div className="w-32 flex-shrink-0 border-r border-gray-200 dark:border-gray-700 flex flex-col items-center justify-center bg-white dark:bg-gray-800 sticky left-0 z-20 font-bold text-gray-700 dark:text-gray-300">
                                    <span>{machine}</span>
                                </div>

                                {/* İş Şeridi */}
                                <div className="flex-1 relative">
                                    {/* Arka Plan Izgarası */}
                                    <div className="absolute inset-0 flex pointer-events-none">
                                        {days.map((day, i) => (
                                            <div key={i} className={`flex-1 border-r border-gray-100 dark:border-gray-700 ${isWeekend(day) ? 'bg-red-50/30 dark:bg-red-900/5' : ''}`}></div>
                                        ))}
                                    </div>

                                    {/* İŞ ÇUBUKLARI */}
                                    <div className="absolute inset-y-0 left-0 right-0 top-4 bottom-4">
                                        {jobs.map(job => {
                                            const isRunning = job.status === 'RUNNING';
                                            
                                            // 1. AYAR BLOĞU (Setup)
                                            // Sadece RUNNING olmayan (yani bekleyen) işlerde ayar göster
                                            let setupPos = null;
                                            if (!isRunning) {
                                                setupPos = getPosition(job.setupStart, job.setupEnd, days[0]);
                                            }

                                            // 2. ÜRETİM BLOĞU
                                            const prodPos = getPosition(job.productionStart, job.productionEnd, days[0]);

                                            return (
                                                <React.Fragment key={job.id}>
                                                    {/* Ayar Bloğu (Sarı) */}
                                                    {setupPos && (
                                                        <div 
                                                            className="absolute top-0 bottom-0 bg-yellow-400 border-r border-yellow-600 rounded-l-md shadow-sm flex items-center justify-center cursor-help z-10 hover:brightness-110"
                                                            style={{ left: setupPos.left, width: setupPos.width }}
                                                            title={`AYAR\nBaşla: ${job.setupStart.toLocaleString()}\nBitir: ${job.setupEnd.toLocaleString()}`}
                                                        >
                                                            <Wrench className="w-3 h-3 text-yellow-900" />
                                                        </div>
                                                    )}

                                                    {/* Üretim Bloğu (Mavi/Yeşil) */}
                                                    {prodPos && (
                                                        <div 
                                                            className={`absolute top-0 bottom-0 shadow-md flex items-center px-2 text-white text-[10px] font-bold overflow-hidden cursor-pointer hover:brightness-110 hover:z-30 transition-all
                                                                ${isRunning ? 'bg-green-600 rounded-md' : 'bg-blue-600 rounded-r-md'}
                                                            `}
                                                            style={{ left: prodPos.left, width: prodPos.width }}
                                                            title={`ÜRETİM: ${job.partName}\nAdet: ${job.targetQuantity}\nBaşla: ${job.productionStart.toLocaleString()}\nBitir: ${job.productionEnd.toLocaleString()}`}
                                                        >
                                                            <div className="flex flex-col w-full">
                                                                <span className="truncate">{isRunning && "⚡ "}{job.partName}</span>
                                                                <span className="text-[9px] opacity-80 font-normal truncate">{job.targetQuantity} ad. ({job.productionDuration.toFixed(1)}s)</span>
                                                            </div>
                                                        </div>
                                                    )}
                                                </React.Fragment>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            <div className="mt-4 flex gap-4 text-xs text-gray-500">
                <div className="flex items-center"><div className="w-3 h-3 bg-green-600 rounded mr-2"></div> Aktif Çalışan</div>
                <div className="flex items-center"><div className="w-3 h-3 bg-blue-600 rounded mr-2"></div> Planlanan Üretim</div>
                <div className="flex items-center"><div className="w-3 h-3 bg-yellow-400 rounded mr-2"></div> 2 Saat Ayar (Setup)</div>
                <div className="flex items-center"><Layers className="w-4 h-4 mr-1"/> Timeline görünümü.</div>
            </div>
        </div>
    );
};

export default CncLatheCalendarPage;