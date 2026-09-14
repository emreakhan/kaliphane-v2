// src/components/Modals/MoldEvaluationModal.js

import React, { useState, useEffect } from 'react';
import Modal from './Modal.js';
import { Star, Save, UserCheck, MessageSquare, ChevronDown, ChevronUp, CheckCircle } from 'lucide-react';
import { updateDoc, doc } from '../../config/firebase.js'; 
import { PROJECT_COLLECTION } from '../../config/constants.js'; 

const MoldEvaluationModal = ({ isOpen, onClose, mold, db, onComplete }) => {
    // Veri yapısı: { "Ali Yılmaz": { generalScore: 8, generalComment: "İyiydi", taskOverrides: { "task-id-123": { score: 9, comment: "Zor parçaydı" } } } }
    const [evaluations, setEvaluations] = useState({});
    const [personnelList, setPersonnelList] = useState([]);
    const [expandedPerson, setExpandedPerson] = useState(null); // Hangi personelin detayları açık?
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (isOpen && mold) {
            const workersMap = {}; // { "Ali Yılmaz": [ {opId, taskId, taskName, opType}... ] }
            
            mold.tasks.forEach(task => {
                task.operations.forEach(op => {
                    if (op.assignedOperator && op.assignedOperator !== 'SEÇ') {
                        if (!workersMap[op.assignedOperator]) {
                            workersMap[op.assignedOperator] = [];
                        }
                        workersMap[op.assignedOperator].push({
                            opId: op.id,
                            taskId: task.id,
                            taskName: task.taskName,
                            opType: op.type,
                            currentScore: op.supervisorRating || '',
                            currentComment: op.supervisorComment || ''
                        });
                    }
                });
            });

            const list = Object.keys(workersMap).sort();
            setPersonnelList(list);

            const initialEvaluations = {};
            list.forEach(p => {
                initialEvaluations[p] = { 
                    generalScore: '', 
                    generalComment: '', 
                    tasks: workersMap[p], // O personelin yaptığı işler listesi
                    taskOverrides: {} // Özel puan/yorum girilirse buraya dolacak
                };
            });
            setEvaluations(initialEvaluations);
        }
    }, [isOpen, mold]);

    const handleGeneralChange = (personName, field, value) => {
        setEvaluations(prev => ({
            ...prev,
            [personName]: {
                ...prev[personName],
                [field]: value
            }
        }));
    };

    const handleTaskOverrideChange = (personName, opId, field, value) => {
        setEvaluations(prev => ({
            ...prev,
            [personName]: {
                ...prev[personName],
                taskOverrides: {
                    ...prev[personName].taskOverrides,
                    [opId]: {
                        ...prev[personName].taskOverrides[opId],
                        [field]: value
                    }
                }
            }
        }));
    };

    const toggleExpand = (personName) => {
        setExpandedPerson(expandedPerson === personName ? null : personName);
    };

    const handleSkipEvaluationAndComplete = async () => {
        if (!window.confirm("Kalıbı değerlendirme yapmadan 'Tamamlandı' durumuna almak istediğinize emin misiniz?")) {
            return;
        }

        setIsSaving(true);
        try {
            const moldRef = doc(db, PROJECT_COLLECTION, mold.id);
            await updateDoc(moldRef, {
                status: 'TAMAMLANDI',
                completedAt: new Date().toISOString()
            });

            alert("Kalıp değerlendirme yapılmadan tamamlandı olarak işaretlendi.");
            if (onComplete) onComplete();
            onClose();
        } catch (error) {
            console.error("Kalıbı tamamlama hatası:", error);
            alert("Kalıp tamamlanırken bir hata oluştu.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleSave = async () => {
        // Kontrol: Eğer personel varsa herkesin genel puanı var mı?
        if (personnelList.length > 0) {
            const missingScores = personnelList.some(p => !evaluations[p]?.generalScore);
            if (missingScores) {
                alert("Lütfen listedeki tüm personel için en azından bir 'Genel Puan' giriniz. Puanlama yapmadan kalıbı kapatmak istiyorsanız 'Değerlendirme Yapmadan Devam Et' seçeneğini kullanabilirsiniz.");
                return;
            }
        }

        setIsSaving(true);

        try {
            // 1. Görevleri ve Operasyonları Güncelle
            let updatedTasks = mold.tasks || [];
            let projectLevelEvaluations = [];

            if (personnelList.length > 0) {
                updatedTasks = (mold.tasks || []).map(task => {
                    const updatedOperations = (task.operations || []).map(op => {
                        let newOp = { ...op };
                        
                        // Eğer bu operasyonun operatörü listemizde varsa
                        if (op.assignedOperator && evaluations[op.assignedOperator]) {
                            const personEval = evaluations[op.assignedOperator];
                            const override = personEval.taskOverrides?.[op.id];

                            // Mantık: Varsa özel puanı al, yoksa genel puanı bas.
                            const finalScore = (override && override.score) 
                                ? parseInt(override.score, 10) 
                                : parseInt(personEval.generalScore, 10);

                            // Mantık: Varsa özel yorumu al. YOKSA BOŞ BIRAK (Genel yorumu kopyalama!)
                            const finalComment = (override && override.comment) 
                                ? override.comment 
                                : ''; 

                            if (!isNaN(finalScore)) {
                                newOp.supervisorRating = finalScore;
                            }
                            newOp.supervisorComment = finalComment;
                            newOp.supervisorReviewDate = new Date().toISOString();
                        }
                        return newOp;
                    });
                    return { ...task, operations: updatedOperations };
                });

                // 2. Genel Yorumları "completedEvaluations" olarak Kalıp Dosyasına Kaydet
                projectLevelEvaluations = personnelList.map(p => ({
                    operator: p,
                    generalScore: parseInt(evaluations[p].generalScore, 10) || 0,
                    generalComment: evaluations[p].generalComment || '',
                    date: new Date().toISOString()
                }));
            }

            const moldRef = doc(db, PROJECT_COLLECTION, mold.id);
            const updatePayload = {
                tasks: updatedTasks,
                status: 'TAMAMLANDI',
                completedAt: new Date().toISOString()
            };

            if (projectLevelEvaluations.length > 0) {
                updatePayload.personnelEvaluations = projectLevelEvaluations;
            }

            await updateDoc(moldRef, updatePayload);

            alert(personnelList.length > 0 
                ? "Değerlendirme başarıyla kaydedildi! Genel yorumlar kalıp karnesine, özel yorumlar parçalara işlendi."
                : "Kalıp başarıyla tamamlandı olarak işaretlendi."
            );
            if (onComplete) onComplete();
            onClose();

        } catch (error) {
            console.error("Değerlendirme hatası:", error);
            alert("Kaydedilirken bir hata oluştu.");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Proje Sonu Değerlendirme: ${mold?.moldName}`}>
            <div className="space-y-6">
                <div className="bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-300 p-4 rounded-lg text-sm flex items-start">
                    <UserCheck className="w-5 h-5 mr-3 mt-0.5 flex-shrink-0" />
                    <div>
                        <span className="font-bold block mb-1">Nasıl Değerlendirilir?</span>
                        <ul className="list-disc list-inside space-y-1">
                            <li><strong>Genel Puan:</strong> Operatörün yaptığı <u>tüm parçalara</u> otomatik olarak işlenir.</li>
                            <li><strong>Genel Yorum:</strong> Sadece proje karnesine yazılır, parçalara kopyalanmaz (kirlilik önlenir).</li>
                            <li><strong>Detay (Ok İşareti):</strong> Sadece belirli bir parçaya özel not düşmek isterseniz listeyi açınız.</li>
                            <li><strong>Değerlendirme İsteğe Bağlı:</strong> Dilerseniz değerlendirme yapmadan doğrudan kalıbı kapatabilirsiniz.</li>
                        </ul>
                    </div>
                </div>

                <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
                    {personnelList.length === 0 ? (
                        <p className="text-gray-500 text-center py-4">Bu kalıpta kayıtlı bir CAM operatörü bulunamadı.</p>
                    ) : (
                        personnelList.map(person => {
                            const data = evaluations[person];
                            const isExpanded = expandedPerson === person;

                            return (
                                <div key={person} className="border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 shadow-sm transition hover:shadow-md overflow-hidden">
                                    {/* ÜST KISIM: GENEL DEĞERLENDİRME */}
                                    <div className="p-4 flex flex-col md:flex-row gap-4 items-center bg-gray-50 dark:bg-gray-800/50">
                                        <div className="flex items-center w-full md:w-1/3">
                                            <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 flex items-center justify-center font-bold mr-3 text-lg">
                                                {person.charAt(0)}
                                            </div>
                                            <div>
                                                <span className="font-bold text-gray-800 dark:text-white text-lg block leading-none">{person}</span>
                                                <span className="text-xs text-gray-500">{data.tasks.length} Parça Tamamladı</span>
                                            </div>
                                        </div>

                                        <div className="flex-1 w-full grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div>
                                                <div className="relative">
                                                    <Star className="w-5 h-5 absolute left-3 top-2.5 text-yellow-500" />
                                                    <input 
                                                        type="number" min="1" max="10"
                                                        value={data.generalScore}
                                                        onChange={(e) => {
                                                             let val = parseInt(e.target.value, 10);
                                                            if (val > 10) val = 10;
                                                            if (val < 1) val = '';
                                                            handleGeneralChange(person, 'generalScore', val);
                                                        }}
                                                        className="w-full pl-10 p-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 dark:bg-gray-700 dark:text-white font-bold"
                                                        placeholder="Genel Puan (1-10)"
                                                    />
                                                </div>
                                            </div>
                                            <div>
                                                <div className="relative">
                                                    <MessageSquare className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
                                                    <input 
                                                        type="text" 
                                                        value={data.generalComment}
                                                        onChange={(e) => handleGeneralChange(person, 'generalComment', e.target.value)}
                                                        className="w-full pl-9 p-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white text-sm"
                                                        placeholder="Genel Yorum (Örn: Başarılı)"
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        <button 
                                            onClick={() => toggleExpand(person)}
                                            className="p-2 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition"
                                            title="Parçaları Göster / Detaylı Puanla"
                                        >
                                            {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                                        </button>
                                    </div>

                                    {/* ALT KISIM: DETAYLI PARÇA LİSTESİ (ACCORDION) */}
                                    {isExpanded && (
                                        <div className="border-t border-gray-200 dark:border-gray-700 p-4 bg-white dark:bg-gray-800 animate-fadeIn">
                                            <p className="text-xs text-gray-500 mb-3 font-semibold uppercase tracking-wider">
                                                Parça Bazlı Özelleştirme (İsteğe Bağlı)
                                            </p>
                                            <div className="space-y-2">
                                                {data.tasks.map((taskItem) => {
                                                    const override = data.taskOverrides[taskItem.opId] || {};
                                                    return (
                                                        <div key={taskItem.opId} className="flex flex-col sm:flex-row gap-3 items-start sm:items-center p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-700/50 border border-gray-100 dark:border-gray-700/50">
                                                            <div className="w-full sm:w-1/3 text-sm">
                                                                <span className="font-bold text-gray-800 dark:text-gray-200 block">{taskItem.taskName}</span>
                                                                <span className="text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">{taskItem.opType}</span>
                                                            </div>
                                                            
                                                            <div className="flex gap-2 w-full sm:w-2/3">
                                                                <input 
                                                                    type="number" min="1" max="10"
                                                                    value={override.score || ''}
                                                                    onChange={(e) => handleTaskOverrideChange(person, taskItem.opId, 'score', e.target.value)}
                                                                    className="w-16 p-1.5 text-center border border-gray-300 dark:border-gray-600 rounded text-sm dark:bg-gray-700 dark:text-white"
                                                                    placeholder={data.generalScore || 'Puan'}
                                                                />
                                                                <input 
                                                                    type="text"
                                                                    value={override.comment || ''}
                                                                    onChange={(e) => handleTaskOverrideChange(person, taskItem.opId, 'comment', e.target.value)}
                                                                    className="flex-1 p-1.5 border border-gray-300 dark:border-gray-600 rounded text-sm dark:bg-gray-700 dark:text-white"
                                                                    placeholder="Bu parçaya özel yorum..."
                                                                />
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>

                <div className="flex flex-col-reverse sm:flex-row sm:justify-between items-center gap-3 pt-4 border-t dark:border-gray-700">
                    <button 
                        type="button"
                        onClick={handleSkipEvaluationAndComplete}
                        disabled={isSaving}
                        className="w-full sm:w-auto px-4 py-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-600 rounded-lg font-medium text-sm transition flex items-center justify-center disabled:opacity-50"
                    >
                        <CheckCircle className="w-4 h-4 mr-2 text-gray-500 dark:text-gray-400" />
                        Değerlendirme Yapmadan Devam Et
                    </button>

                    <button 
                        type="button"
                        onClick={handleSave}
                        disabled={isSaving}
                        className="w-full sm:w-auto flex items-center justify-center px-6 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg font-bold shadow-md hover:shadow-lg transition transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                    >
                        <Save className="w-5 h-5 mr-2" />
                        {isSaving 
                            ? 'Kaydediliyor...' 
                            : (personnelList.length === 0 ? 'Kalıbı Tamamla ve Kapat' : 'Değerlendirmeyi Bitir ve Kalıbı Kapat')
                        }
                    </button>
                </div>
            </div>
        </Modal>
    );
};

export default MoldEvaluationModal;