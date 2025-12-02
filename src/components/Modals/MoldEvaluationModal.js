// src/components/Modals/MoldEvaluationModal.js

import React, { useState, useEffect } from 'react';
import Modal from './Modal.js';
import { Users, Star, Save, UserCheck, MessageSquare } from 'lucide-react';
import { updateDoc, doc } from '../../config/firebase.js'; // SADECE FONKSİYONLAR
import { PROJECT_COLLECTION } from '../../config/constants.js'; // ADRES BURADAN

const MoldEvaluationModal = ({ isOpen, onClose, mold, db, onComplete }) => {
    const [personnelRatings, setPersonnelRatings] = useState({});
    const [personnelList, setPersonnelList] = useState([]);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (isOpen && mold) {
            const workers = new Set();
            
            mold.tasks.forEach(task => {
                task.operations.forEach(op => {
                    if (op.assignedOperator && op.assignedOperator !== 'SEÇ') {
                        workers.add(op.assignedOperator);
                    }
                });
            });

            const list = Array.from(workers).sort();
            setPersonnelList(list);

            const initialRatings = {};
            list.forEach(p => {
                initialRatings[p] = { score: '', comment: '' };
            });
            setPersonnelRatings(initialRatings);
        }
    }, [isOpen, mold]);

    const handleRatingChange = (personName, field, value) => {
        setPersonnelRatings(prev => ({
            ...prev,
            [personName]: {
                ...prev[personName],
                [field]: value
            }
        }));
    };

    const handleSave = async () => {
        const missingScores = personnelList.some(p => !personnelRatings[p].score);
        if (missingScores) {
            alert("Lütfen listedeki tüm personel için bir puan giriniz.");
            return;
        }

        setIsSaving(true);

        try {
            const updatedTasks = mold.tasks.map(task => {
                const updatedOperations = task.operations.map(op => {
                    let newOp = { ...op };
                    if (op.assignedOperator && personnelRatings[op.assignedOperator]) {
                        newOp.supervisorRating = parseInt(personnelRatings[op.assignedOperator].score);
                        newOp.supervisorComment = personnelRatings[op.assignedOperator].comment;
                        newOp.supervisorReviewDate = new Date().toISOString(); 
                    }
                    return newOp;
                });
                return { ...task, operations: updatedOperations };
            });

            const moldRef = doc(db, PROJECT_COLLECTION, mold.id);
            await updateDoc(moldRef, {
                tasks: updatedTasks,
                status: 'TAMAMLANDI',
                completedAt: new Date().toISOString()
            });

            alert("Değerlendirme başarıyla kaydedildi ve kalıp tamamlandı!");
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
                <div className="bg-blue-50 border border-blue-200 text-blue-800 p-4 rounded-lg text-sm flex items-start">
                    <UserCheck className="w-5 h-5 mr-3 mt-0.5 flex-shrink-0" />
                    <div>
                        <span className="font-bold block mb-1">Emeği Geçen CAM Operatörleri</span>
                        Bu kalıpta görev alan CAM operatörleri aşağıdadır. Lütfen performanslarına göre puan veriniz.
                    </div>
                </div>

                <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-2">
                    {personnelList.length === 0 ? (
                        <p className="text-gray-500 text-center py-4">Bu kalıpta kayıtlı bir CAM operatörü bulunamadı.</p>
                    ) : (
                        personnelList.map(person => (
                            <div key={person} className="p-4 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 shadow-sm transition hover:shadow-md">
                                <div className="flex flex-col md:flex-row gap-4 items-center">
                                    <div className="flex items-center w-full md:w-1/3">
                                        <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 flex items-center justify-center font-bold mr-3 text-lg">
                                            {person.charAt(0)}
                                        </div>
                                        <span className="font-bold text-gray-800 dark:text-white text-lg">{person}</span>
                                    </div>

                                    <div className="flex-1 w-full grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1 uppercase">Performans Puanı (1-10)</label>
                                            <div className="relative">
                                                <Star className="w-5 h-5 absolute left-3 top-2.5 text-yellow-500" />
                                                <input 
                                                    type="number" 
                                                    min="1" max="10"
                                                    value={personnelRatings[person]?.score || ''}
                                                    onChange={(e) => {
                                                        const val = parseInt(e.target.value);
                                                        if (val > 10) e.target.value = 10;
                                                        if (val < 1) e.target.value = '';
                                                        handleRatingChange(person, 'score', e.target.value);
                                                    }}
                                                    className="w-full pl-10 p-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 dark:bg-gray-700 dark:text-white font-bold"
                                                    placeholder="-"
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1 uppercase">Yorum (Opsiyonel)</label>
                                            <div className="relative">
                                                <MessageSquare className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
                                                <input 
                                                    type="text" 
                                                    value={personnelRatings[person]?.comment || ''}
                                                    onChange={(e) => handleRatingChange(person, 'comment', e.target.value)}
                                                    className="w-full pl-9 p-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white text-sm"
                                                    placeholder="Örn: Çok temiz işçilik..."
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                <div className="flex justify-end pt-4 border-t dark:border-gray-700">
                    <button 
                        onClick={handleSave}
                        disabled={isSaving || personnelList.length === 0}
                        className="flex items-center px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-bold shadow-lg transition transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Save className="w-5 h-5 mr-2" />
                        {isSaving ? 'Kaydediliyor...' : 'Değerlendirmeyi Bitir ve Kalıbı Kapat'}
                    </button>
                </div>
            </div>
        </Modal>
    );
};

export default MoldEvaluationModal;