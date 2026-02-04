// src/components/Analysis/PersonnelPerformanceAnalysis.js

import React, { useState, useMemo } from 'react';
import { Search, User, CheckCircle, AlertOctagon, Star, MessageSquare, Award, Filter, X } from 'lucide-react';
import { PERSONNEL_ROLES, OPERATION_STATUS } from '../../config/constants.js'; 
import { formatDate, formatDateTime } from '../../utils/dateUtils.js';

const PersonnelPerformanceAnalysis = ({ personnel, projects }) => {
    const [personnelSearchTerm, setPersonnelSearchTerm] = useState(''); 
    const [selectedPersonId, setSelectedPersonId] = useState(null);
    const [unifiedFilter, setUnifiedFilter] = useState(''); 

    // 1. Personel Listesini Filtrele
    const filteredPersonnel = useMemo(() => {
        if (!personnel) return [];
        const lowerSearch = (personnelSearchTerm || '').toLowerCase();
        return personnel
            .filter(p => 
                (p.role === PERSONNEL_ROLES.CAM_OPERATOR || p.role === PERSONNEL_ROLES.MACHINE_OPERATOR) &&
                (
                    (p.name || '').toLowerCase().includes(lowerSearch) || 
                    (p.role || '').toLowerCase().includes(lowerSearch)
                )
            )
            .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    }, [personnel, personnelSearchTerm]);

    // 2. Seçilen Personelin Verilerini Hazırla
    const rawPersonData = useMemo(() => {
        if (!selectedPersonId || !personnel) return null;
        const person = personnel.find(p => p.id === selectedPersonId);
        if (!person) return null;

        // Parent bileşenden zaten filtrelenmiş (CNC olmayan) veriler geliyor
        // Ama yine de undefined kontrolü (?. ve || []) eklemek iyi pratiktir.
        
        // A) Operasyonlar
        const allCompletedOps = (projects || []).flatMap(mold => 
            (mold.tasks || []).flatMap(task => 
                (task.operations || [])
                    .filter(op => op.status === OPERATION_STATUS.COMPLETED)
                    .filter(op => {
                        if (person.role === PERSONNEL_ROLES.CAM_OPERATOR) return op.assignedOperator === person.name;
                        if (person.role === PERSONNEL_ROLES.MACHINE_OPERATOR) return op.machineOperatorName === person.name;
                        return false;
                    })
                    .map(op => ({
                        ...op,
                        moldName: mold.moldName,
                        taskName: task.taskName,
                        moldId: mold.id
                    }))
            )
        ).sort((a, b) => new Date(b.finishDate || 0) - new Date(a.finishDate || 0));

        // B) Değerlendirmeler
        const projectEvaluations = [];
        (projects || []).forEach(mold => {
            if (mold.personnelEvaluations && Array.isArray(mold.personnelEvaluations)) {
                const evaluation = mold.personnelEvaluations.find(ev => ev.operator === person.name);
                if (evaluation) {
                    projectEvaluations.push({
                        moldName: mold.moldName,
                        score: evaluation.generalScore,
                        comment: evaluation.generalComment,
                        date: evaluation.date
                    });
                }
            }
        });
        projectEvaluations.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

        // C) Hatalar
        const reworks = (projects || []).flatMap(mold => 
            (mold.tasks || []).flatMap(task => 
                (task.operations || []).flatMap(op => 
                    (op.reworkHistory || [])
                        .filter(history => {
                            if (person.role === PERSONNEL_ROLES.CAM_OPERATOR) return op.assignedOperator === person.name;
                            if (person.role === PERSONNEL_ROLES.MACHINE_OPERATOR) return op.machineOperatorName === person.name;
                            return false;
                        })
                        .map(history => ({
                            ...history,
                            moldName: mold.moldName,
                            taskName: task.taskName,
                            opType: op.type
                        }))
                )
            )
        ).sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

        return { person, allCompletedOps, projectEvaluations, reworks };
    }, [selectedPersonId, personnel, projects]);

    // 3. Mevcut Kalıpları Listele
    const availableMolds = useMemo(() => {
        if (!rawPersonData) return [];
        const molds = new Set();
        rawPersonData.allCompletedOps.forEach(op => { if(op.moldName) molds.add(op.moldName) });
        rawPersonData.reworks.forEach(rw => { if(rw.moldName) molds.add(rw.moldName) });
        rawPersonData.projectEvaluations.forEach(ev => { if(ev.moldName) molds.add(ev.moldName) });
        return Array.from(molds).sort();
    }, [rawPersonData]);

    // 4. Filtrelenmiş Veriyi Hesapla
    const displayedData = useMemo(() => {
        if (!rawPersonData) return null;

        let ops = rawPersonData.allCompletedOps;
        let evals = rawPersonData.projectEvaluations;
        let rws = rawPersonData.reworks;

        if (unifiedFilter) {
            const lowerTerm = (unifiedFilter || '').toLowerCase();
            
            ops = ops.filter(op => 
                (op.moldName || '').toLowerCase().includes(lowerTerm) ||
                (op.taskName || '').toLowerCase().includes(lowerTerm) ||
                (op.supervisorComment && (op.supervisorComment || '').toLowerCase().includes(lowerTerm)) ||
                (op.camOperatorCommentForMachineOp && (op.camOperatorCommentForMachineOp || '').toLowerCase().includes(lowerTerm))
            );

            evals = evals.filter(ev => 
                (ev.moldName || '').toLowerCase().includes(lowerTerm) ||
                (ev.comment && (ev.comment || '').toLowerCase().includes(lowerTerm))
            );

            rws = rws.filter(rw => 
                (rw.moldName || '').toLowerCase().includes(lowerTerm) ||
                (rw.taskName || '').toLowerCase().includes(lowerTerm) ||
                (rw.reason || '').toLowerCase().includes(lowerTerm)
            );
        }

        // Puan Ortalaması
        let totalRatings = 0; 
        let ratingCount = 0;

        ops.forEach(op => {
            if (rawPersonData.person.role === PERSONNEL_ROLES.CAM_OPERATOR && op.supervisorRating) {
                totalRatings += parseInt(op.supervisorRating);
                ratingCount++;
            } else if (rawPersonData.person.role === PERSONNEL_ROLES.MACHINE_OPERATOR && op.camOperatorRatingForMachineOp) {
                totalRatings += parseInt(op.camOperatorRatingForMachineOp);
                ratingCount++;
            }
        });

        const averageRating = ratingCount > 0 ? (totalRatings / ratingCount).toFixed(1) : 0;

        return {
            person: rawPersonData.person,
            completedOps: ops,
            projectEvaluations: evals,
            reworks: rws,
            averageRating,
            ratingCount
        };
    }, [rawPersonData, unifiedFilter]);

    useMemo(() => {
        setUnifiedFilter('');
    }, [selectedPersonId]);


    return (
        <div className="flex flex-col lg:flex-row gap-6 h-full min-h-[600px]">
            
            {/* SOL MENÜ */}
            <div className="w-full lg:w-1/3 xl:w-1/4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg shadow-inner border border-gray-200 dark:border-gray-700">
                <div className="relative mb-4">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 w-4 h-4" />
                    <input 
                        type="text" 
                        placeholder="Personel ara..." 
                        value={personnelSearchTerm} 
                        onChange={(e) => setPersonnelSearchTerm(e.target.value)} 
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg bg-white text-gray-900 placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm" 
                    />
                </div>
                <div className="max-h-[60vh] overflow-y-auto space-y-2">
                    {filteredPersonnel.length === 0 ? <p className="text-center text-gray-500 text-sm py-4">Operatör bulunamadı.</p> : filteredPersonnel.map(person => (
                        <button key={person.id} onClick={() => setSelectedPersonId(person.id)} className={`w-full text-left p-3 transition rounded-lg flex items-center space-x-3 ${selectedPersonId === person.id ? 'bg-blue-600 text-white shadow-md' : 'bg-white dark:bg-gray-700 hover:bg-blue-50 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-200 border border-transparent hover:border-blue-200'}`}>
                            <div className={`p-2 rounded-full ${selectedPersonId === person.id ? 'bg-blue-500' : 'bg-gray-200 dark:bg-gray-600'}`}><User className="w-5 h-5" /></div>
                            <div><p className="font-semibold text-sm">{person.name}</p><p className={`text-xs ${selectedPersonId === person.id ? 'text-blue-200' : 'text-gray-500 dark:text-gray-400'}`}>{person.role === PERSONNEL_ROLES.CAM_OPERATOR ? 'CAM Operatörü' : 'Tezgah Operatörü'}</p></div>
                        </button>
                    ))}
                </div>
            </div>

            {/* SAĞ TARAF */}
            <div className="flex-1 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-6">
                {displayedData ? (
                    <div className="space-y-8 animate-fadeIn">
                        
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b dark:border-gray-700 pb-4 gap-4">
                            <div>
                                <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center">
                                    {displayedData.person.name}
                                    <span className="ml-3 px-3 py-1 text-xs bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 rounded-full font-medium">{displayedData.person.role}</span>
                                </h2>
                                <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Performans Özeti</p>
                            </div>
                            
                            <div className="relative w-full md:w-80">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    {unifiedFilter ? <Filter className="h-5 w-5 text-blue-500" /> : <Search className="h-5 w-5 text-gray-400" />}
                                </div>
                                <input 
                                    type="text" 
                                    list="mold-options" 
                                    placeholder="Kalıp seçin veya arayın..." 
                                    value={unifiedFilter}
                                    onChange={(e) => setUnifiedFilter(e.target.value)}
                                    className="block w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg leading-5 bg-white text-gray-900 placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 sm:text-sm shadow-sm"
                                />
                                <datalist id="mold-options">
                                    {availableMolds.map(m => (
                                        <option key={m} value={m} />
                                    ))}
                                </datalist>

                                {unifiedFilter && (
                                    <button 
                                        onClick={() => setUnifiedFilter('')}
                                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 cursor-pointer"
                                    >
                                        <X className="h-4 w-4" />
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-xl border border-purple-200 dark:border-purple-800 flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-purple-800 dark:text-purple-300 font-medium">
                                        {unifiedFilter ? 'Filtrelenmiş Ort. Puan' : 'Genel Ort. Puan'}
                                    </p>
                                    <p className="text-3xl font-bold text-purple-700 dark:text-purple-400 mt-1">{displayedData.ratingCount > 0 ? `${displayedData.averageRating} / 10` : 'N/A'}</p>
                                    <p className="text-xs text-purple-600 dark:text-purple-500 mt-1">{displayedData.ratingCount} işlem üzerinden</p>
                                </div>
                                <Star className="w-10 h-10 text-purple-300 opacity-50" />
                            </div>
                            <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-200 dark:border-red-800 flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-red-800 dark:text-red-300 font-medium">
                                        {unifiedFilter ? 'Filtrelenmiş Hata' : 'Toplam Hata / Rework'}
                                    </p>
                                    <p className="text-3xl font-bold text-red-700 dark:text-red-400 mt-1">{displayedData.reworks.length}</p>
                                </div>
                                <AlertOctagon className="w-10 h-10 text-red-300 opacity-50" />
                            </div>
                        </div>

                        {displayedData.projectEvaluations.length > 0 && (
                            <div className="bg-indigo-50 dark:bg-indigo-900/10 border border-indigo-200 dark:border-indigo-800 rounded-xl p-4">
                                <h3 className="text-lg font-bold text-indigo-800 dark:text-indigo-300 mb-3 flex items-center">
                                    <Award className="w-5 h-5 mr-2" /> Proje Sonu Genel Değerlendirmeleri
                                </h3>
                                <div className="space-y-3 max-h-60 overflow-y-auto pr-2">
                                    {displayedData.projectEvaluations.map((evalItem, idx) => (
                                        <div key={idx} className="bg-white dark:bg-gray-800 p-3 rounded-lg border border-indigo-100 dark:border-indigo-900 shadow-sm">
                                            <div className="flex justify-between items-center mb-1">
                                                <span className="font-bold text-gray-900 dark:text-white">{evalItem.moldName}</span>
                                                <span className="text-xs text-gray-500">{formatDate(evalItem.date)}</span>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-100 text-indigo-800">
                                                    Genel Puan: {evalItem.score} / 10
                                                </span>
                                                {evalItem.comment && (
                                                    <span className="text-sm text-gray-600 dark:text-gray-300 italic flex items-center">
                                                        <MessageSquare className="w-3 h-3 mr-1" /> "{evalItem.comment}"
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {displayedData.reworks.length > 0 && (
                            <div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-xl p-4">
                                <h3 className="text-lg font-bold text-red-700 dark:text-red-400 mb-3 flex items-center"><AlertOctagon className="w-5 h-5 mr-2" /> Hata & Rework Kayıtları</h3>
                                <div className="space-y-3 max-h-60 overflow-y-auto pr-2">
                                    {displayedData.reworks.map((rw, idx) => (
                                        <div key={idx} className="bg-white dark:bg-gray-800 p-3 rounded-lg border-l-4 border-red-500 shadow-sm text-sm">
                                            <div className="flex justify-between font-semibold text-gray-900 dark:text-white"><span>{rw.moldName} - {rw.taskName}</span><span className="text-xs text-gray-500">{formatDateTime(rw.date)}</span></div>
                                            <div className="mt-1 text-red-600 dark:text-red-400 font-medium">Sebep: {rw.reason}</div>
                                            {rw.description && <div className="text-gray-600 dark:text-gray-400 text-xs italic mt-1">"{rw.description}"</div>}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div>
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-lg font-bold text-gray-800 dark:text-white flex items-center">
                                    <CheckCircle className="w-5 h-5 mr-2 text-green-600" /> 
                                    {unifiedFilter ? 'Filtrelenmiş İşler' : 'Tamamlanan Tüm İşler'} 
                                    <span className="ml-2 text-sm font-normal text-gray-500">({displayedData.completedOps.length} adet)</span>
                                </h3>
                            </div>
                            
                            <div className="overflow-hidden border border-gray-200 dark:border-gray-700 rounded-xl">
                                <div className="max-h-[500px] overflow-y-auto">
                                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                                        <thead className="bg-gray-50 dark:bg-gray-700 sticky top-0 z-10">
                                            <tr>
                                                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider dark:text-gray-300">Tarih</th>
                                                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider dark:text-gray-300">Kalıp Adı</th>
                                                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider dark:text-gray-300">Parça / İş</th>
                                                <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider dark:text-gray-300 w-24">Puan</th>
                                                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider dark:text-gray-300">Özel Yorum</th>
                                            </tr>
                                        </thead>
                                        <tbody className="bg-white divide-y divide-gray-200 dark:bg-gray-800 dark:divide-gray-700">
                                            {displayedData.completedOps.length === 0 ? <tr><td colSpan="5" className="px-4 py-8 text-center text-gray-500">Kayıt bulunamadı.</td></tr> : displayedData.completedOps.map((op, idx) => {
                                                let rating = null; let comment = null;
                                                if (displayedData.person.role === PERSONNEL_ROLES.CAM_OPERATOR) { rating = op.supervisorRating; comment = op.supervisorComment; } 
                                                else if (displayedData.person.role === PERSONNEL_ROLES.MACHINE_OPERATOR) { rating = op.camOperatorRatingForMachineOp; comment = op.camOperatorCommentForMachineOp; }
                                                return (
                                                    <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition">
                                                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{formatDate(op.finishDate)}</td>
                                                        <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{op.moldName}</td>
                                                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600 dark:text-gray-300">{op.taskName}</td>
                                                        <td className="px-4 py-3 whitespace-nowrap text-center">{rating ? <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${rating >= 8 ? 'bg-green-100 text-green-800' : rating >= 5 ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}`}>{rating} / 10</span> : <span className="text-gray-400 text-xs">-</span>}</td>
                                                        <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 italic">{comment ? <div className="flex items-start max-w-xs truncate" title={comment}><MessageSquare className="w-3 h-3 mr-1 mt-1 flex-shrink-0 opacity-50" />{comment}</div> : <span className="opacity-50">-</span>}</td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center text-gray-400 opacity-60"><User className="w-16 h-16 mb-4" /><p className="text-lg font-medium">Detayları görmek için listeden bir operatör seçiniz.</p></div>
                )}
            </div>
        </div>
    );
};

export default PersonnelPerformanceAnalysis;