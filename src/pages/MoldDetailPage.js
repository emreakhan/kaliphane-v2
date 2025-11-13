// src/pages/MoldDetailPage.js

import React, { useState, useEffect } from 'react';

// İkonlar
import { Plus, CheckCircle, Zap, StickyNote, Save } from 'lucide-react';

// Sabitler ('.js' uzantısını ekledim)
import { MOLD_STATUS, ROLES, OPERATION_STATUS } from '../config/constants.js';

// Yardımcı Fonksiyonlar
import { getStatusClasses } from '../utils/styleUtils';
import { formatDate, formatDateTime, getCurrentDateTimeString } from '../utils/dateUtils';

// Firebase ('.js' uzantısını ekledim)
import { db, MOLD_NOTES_COLLECTION, doc, onSnapshot, setDoc } from '../config/firebase.js';

// Bileşenler ('.js' uzantılarını ekledim)
import Modal from '../components/Modals/Modal.js';
import AssignOperationModal from '../components/Modals/AssignOperationModal.js';
import SupervisorReviewModal from '../components/Modals/SupervisorReviewModal.js';
import AddOperationModal from '../components/Modals/AddOperationModal.js';


// --- GÜNCELLENMİŞ: KALIP DETAY SAYFASI ---
const MoldDetailPage = ({ mold, onBack, loggedInUser, handleUpdateOperation, handleAddOperation, projects, personnel, machines, handleUpdateMoldStatus, handleUpdateMoldDeadline, handleUpdateMoldPriority }) => {
    const [modalState, setModalState] = useState({ isOpen: false, type: null, data: null });
    const [localDeadline, setLocalDeadline] = useState(mold.moldDeadline || '');
    const [localPriority, setLocalPriority] = useState(mold.priority || '');
    const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
    const [noteText, setNoteText] = useState('');
    const [newNoteContent, setNewNoteContent] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        setLocalDeadline(mold.moldDeadline || '');
    }, [mold.moldDeadline]);
    
    useEffect(() => {
        setLocalPriority(mold.priority || '');
    }, [mold.priority]);
    
    useEffect(() => {
        if (!db || !mold?.id) return;
        const noteRef = doc(db, MOLD_NOTES_COLLECTION, mold.id);
        const unsub = onSnapshot(noteRef, (snapshot) => {
          if (snapshot.exists()) {
            setNoteText(snapshot.data().text || '');
          } else {
            setNoteText('');
          }
        });
        return () => unsub();
    }, [db, mold?.id]);
    
    const handleSaveNote = async () => {
        if (!db || !mold?.id || !newNoteContent.trim()) {
            if (!newNoteContent.trim()) {
                setIsNoteModalOpen(false);
            }
            return;
        }
        setIsSaving(true);
        const today = new Date().toLocaleString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        const newEntry = `--- ${today} (${loggedInUser.name}) ---\n${newNoteContent.trim()}`;
        const separator = noteText.trim().length > 0 ? '\n\n--------------------\n\n' : '';
        const updatedFullText = `${newEntry}${separator}${noteText}`;

        try {
          await setDoc(doc(db, MOLD_NOTES_COLLECTION, mold.id), {
            text: updatedFullText,
            moldName: mold.moldName || '',
            updatedAt: getCurrentDateTimeString(),
          });
          setNewNoteContent('');
        } catch (err) {
          console.error('Not kaydedilemedi:', err);
        } finally {
          setIsSaving(false);
          setIsNoteModalOpen(false);
        }
    };
    
    const openNoteModal = () => {
        setNewNoteContent('');
        setIsNoteModalOpen(true);
    };

    const currentMoldStatus = mold.status || MOLD_STATUS.WAITING;
    const isAdmin = loggedInUser.role === ROLES.ADMIN;
    
    const onStatusChange = (e) => {
        handleUpdateMoldStatus(mold.id, e.target.value);
    };
    
    const onDeadlineChange = (e) => {
        const newDeadline = e.target.value;
        setLocalDeadline(newDeadline);
        handleUpdateMoldDeadline(mold.id, newDeadline);
    };

    const onPriorityChange = (e) => {
        const val = e.target.value;
        setLocalPriority(val); 
        
        const numVal = val === '' ? null : parseInt(val, 10);
        
        if (val === '' || (Number.isInteger(numVal) && numVal > 0)) {
             handleUpdateMoldPriority(mold.id, numVal);
        }
    };

    const handleOpenModal = (type, mold, task, operation) => {
        setModalState({ isOpen: true, type, data: { mold, task, operation } });
    };

    const handleCloseModal = () => {
        setModalState({ isOpen: false, type: null, data: null });
    };

    const renderModal = () => {
        const { isOpen, type, data } = modalState;
        if (!isOpen || !data) return null;

        const { mold, task, operation } = data;
        
        if (type === 'assign' && loggedInUser.role === ROLES.CAM_OPERATOR && operation.status === OPERATION_STATUS.NOT_STARTED) {
            return (
                <AssignOperationModal
                    isOpen={isOpen}
                    onClose={handleCloseModal}
                    mold={mold}
                    task={task}
                    operation={operation}
                    loggedInUser={loggedInUser}
                    onSubmit={handleUpdateOperation} 
                    projects={projects}
                    personnel={personnel}
                    machines={machines}
                />
            );
        }
        
        if (type === 'review' && loggedInUser.role === ROLES.SUPERVISOR && operation.status === OPERATION_STATUS.WAITING_SUPERVISOR_REVIEW) {
            return (
                <SupervisorReviewModal
                    isOpen={isOpen}
                    onClose={handleCloseModal}
                    mold={mold}
                    task={task}
                    operation={operation}
                    onSubmit={handleUpdateOperation} 
                />
            );
        }
        
        if (type === 'add_operation' && isAdmin) {
            return (
                <AddOperationModal
                    isOpen={isOpen}
                    onClose={handleCloseModal}
                    mold={mold}
                    task={task}
                    onSubmit={handleAddOperation} 
                />
            );
        }

        return null;
    };
    
    return (
        <div className="p-4 bg-white dark:bg-gray-800 rounded-xl shadow-xl relative">
            <button 
                onClick={onBack} 
                className="mb-4 text-blue-600 dark:text-blue-400 hover:underline flex items-center"
            >
                &larr; Kalıp Listesine Geri Dön
            </button>
            
            <button
                onClick={openNoteModal}
                className="absolute top-4 right-4 flex items-center px-3 py-2 text-sm font-semibold text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/40 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-800 transition z-10"
                title="Kalıp Notları"
            >
                <StickyNote className="w-4 h-4 mr-2" /> Notlar
            </button>
            
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">{mold.moldName} Kalıp Detayları</h2>
            
            <div className="text-gray-600 dark:text-gray-400 mb-6 flex flex-wrap items-center gap-4">
                <div>
                    <span>Müşteri: {mold.customer} |
                    Ana Durum:</span>
                    {isAdmin ?
                    (
                        <select
                            value={currentMoldStatus}
                            onChange={onStatusChange}
                            className={`ml-2 px-3 py-1 rounded-lg text-xs font-semibold appearance-none border-2 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:outline-none ${getStatusClasses(currentMoldStatus)}`}
                        >
                            <option value={MOLD_STATUS.WAITING}>BEKLEMEDE</option>
                            <option value={MOLD_STATUS.CNC}>CNC</option>
                            <option value={MOLD_STATUS.EREZYON}>EREZYON</option>
                            <option value={MOLD_STATUS.POLISAJ}>POLİSAJ</option>
                            <option value={MOLD_STATUS.DESEN}>DESEN</option>
                            <option value={MOLD_STATUS.MOLD_ASSEMBLY}>KALIP MONTAJ</option>
                            <option value={MOLD_STATUS.TRIAL}>DENEME'DE</option>
                            <option value={MOLD_STATUS.REVISION}>REVİZYON</option>
                            <option value={MOLD_STATUS.COMPLETED}>TAMAMLANDI</option>
                        </select>
                    ) : (
                        <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-semibold ${getStatusClasses(currentMoldStatus)}`}>
                            {currentMoldStatus}
                        </span>
                    )}
                </div>
                
                {isAdmin ? (
                    <div className="flex items-center gap-2">
                        <label htmlFor="moldDeadline" className="text-sm font-medium">Kalıp Termini:</label>
                        <input
                            type="date"
                            id="moldDeadline"
                            value={localDeadline}
                            onChange={onDeadlineChange}
                            className="px-3 py-1 rounded-lg text-xs font-semibold appearance-none border-2 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200"
                        />
                    </div>
                ) : (
                    mold.moldDeadline && (
                        <span className="text-sm">
                            Kalıp Termini: <span className="font-semibold">{formatDate(mold.moldDeadline)}</span>
                        </span>
                    )
                )}
                
                {isAdmin && (
                     <div className="flex items-center gap-2">
                        <label htmlFor="moldPriority" className="text-sm font-medium">Aciliyet Sırası:</label>
                        <input
                            type="number"
                            id="moldPriority"
                            value={localPriority === null ? '' : localPriority}
                            onChange={onPriorityChange}
                            min="1"
                            placeholder="Sıra No"
                            className="w-24 px-3 py-1 rounded-lg text-xs font-semibold appearance-none border-2 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200"
                        />
                    </div>
                )}
             </div>


            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">İş Parçaları</h3>
            <div className="space-y-6">
                {mold.tasks.length === 0 ?
                (
                    <p className="text-gray-500 dark:text-gray-400">Bu kalıba atanmış alt parça bulunmamaktadır.</p>
                ) : (
                    mold.tasks.map(task => {
                        const lastOperation = task.operations[task.operations.length - 1];
                        const canAddOperation = lastOperation.status === OPERATION_STATUS.COMPLETED;
                        
                        return (
                            <div key={task.id} className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 shadow-md">
                                <div className="flex justify-between items-center mb-3">
                                    <p className="font-bold text-lg text-gray-900 dark:text-white truncate">
                                        <span className="font-bold mr-2 text-blue-600">#{task.taskNumber}</span> {task.taskName}
                                    </p>
                                    {isAdmin && canAddOperation && (
                                        <button
                                            onClick={() => handleOpenModal('add_operation', mold, task, null)}
                                            className="ml-4 px-3 py-1 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700 transition flex items-center shadow-md"
                                        >
                                            <Plus className="w-4 h-4 mr-1"/> Yeni Operasyon Ekle
                                        </button>
                                    )}
                                </div>
                                
                                <div className="space-y-3 pl-4 border-l-2 border-gray-300 dark:border-gray-600">
                                    {(task.operations || []).map(operation => (
                                        <div key={operation.id} className="p-3 border border-gray-200 dark:border-gray-700 rounded-lg flex flex-col md:flex-row justify-between items-start md:items-center bg-white dark:bg-gray-700">
                                            <div className="flex-1 min-w-0 mb-2 md:mb-0">
                                                <p className="font-semibold text-blue-700 dark:text-blue-300">
                                                    Operasyon: {operation.type}
                                                </p>
                                                
                                                <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2 text-xs text-gray-600 dark:text-gray-400">
                                                    <div className="col-span-1">
                                                        <span className="font-medium">CAM Operatörü: </span>
                                                        <span className="font-semibold text-gray-800 dark:text-gray-200">{operation.assignedOperator}</span>
                                                    </div>
                                                    
                                                    <div className="col-span-1">
                                                        <span className="font-medium">Tezgah / Operatör: </span>
                                                        <span className="font-semibold text-gray-800 dark:text-gray-200">
                                                            {operation.machineName || 'YOK'} / {operation.machineOperatorName || 'SEÇİLMEMİŞ'}
                                                        </span>
                                                    </div>

                                                    <div className="col-span-1">
                                                        <span className="font-medium">Başlangıç Tarihi: </span>
                                                        <span className="font-semibold text-gray-800 dark:text-gray-200">{formatDateTime(operation.startDate)}</span>
                                                    </div>
                                                    
                                                    <div className="col-span-1">
                                                        <span className="font-medium">Tahmini Bitiş: </span>
                                                        <span className="font-semibold text-gray-800 dark:text-gray-200">{formatDate(operation.estimatedDueDate)}</span>
                                                    </div>

                                                    {operation.durationInHours && (
                                                        <div className="col-span-1">
                                                            <span className="font-medium text-green-700 dark:text-green-300">İş Süresi: </span>
                                                            <span className="font-semibold text-green-700 dark:text-green-300">
                                                                {operation.durationInHours} Saat
                                                            </span>
                                                        </div>
                                                    )}
                                                    
                                                    {operation.camOperatorRatingForMachineOp && (
                                                        <div className="col-span-1">
                                                            <span className="font-medium text-blue-600 dark:text-blue-400">CAM'in Puanı: </span>
                                                            <span className="font-semibold text-blue-600 dark:text-blue-400">
                                                                {operation.camOperatorRatingForMachineOp} / 10
                                                            </span>
                                                        </div>
                                                    )}

                                                    {operation.supervisorRating && (
                                                        <div className="col-span-1">
                                                            <span className="font-medium text-purple-600 dark:text-purple-400">Yetkili Puanı: </span>
                                                            <span className="font-bold text-lg text-purple-600 dark:text-purple-400">
                                                                {operation.supervisorRating} / 10
                                                            </span>
                                                        </div>
                                                    )}
                                                    
                                                    {operation.supervisorComment && (
                                                        <div className="col-span-2">
                                                            <span className="font-medium text-purple-600 dark:text-purple-400">Yetkili Yorumu: </span>
                                                            <span className="italic text-purple-700 dark:text-purple-300">
                                                                "{operation.supervisorComment}"
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>

                                                <span className={`mt-3 inline-block px-3 py-1 text-xs leading-5 font-semibold rounded-full ${getStatusClasses(operation.status)}`}>
                                                    {operation.status} %{operation.progressPercentage}
                                                </span>
                                            </div>
                                            
                                            {loggedInUser.role === ROLES.CAM_OPERATOR && operation.status === OPERATION_STATUS.NOT_STARTED && (
                                                <button
                                                    onClick={() => handleOpenModal('assign', mold, task, operation)}
                                                    className="ml-0 md:ml-4 px-3 py-1 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition flex items-center shadow-md"
                                                >
                                                    <Zap className="w-4 h-4 mr-1"/> İşi Kendine Ata
                                                </button>
                                            )}
                                            
                                            {loggedInUser.role === ROLES.SUPERVISOR && operation.status === OPERATION_STATUS.WAITING_SUPERVISOR_REVIEW && (
                                                <button
                                                    onClick={() => handleOpenModal('review', mold, task, operation)}
                                                    className="ml-0 md:ml-4 px-3 py-1 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 transition flex items-center shadow-md"
                                                >
                                                    <CheckCircle className="w-4 h-4 mr-1"/> Değerlendir
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )
                    })
                )}
            </div>
            
            {renderModal()}
            
            <Modal
                isOpen={isNoteModalOpen}
                onClose={() => setIsNoteModalOpen(false)}
                title={`${mold.moldName} - Ortak Notlar`}
            >
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Yeni Not Ekle ({loggedInUser.name})
                </label>
                <textarea
                  value={newNoteContent}
                  onChange={(e) => setNewNoteContent(e.target.value)}
                  placeholder="Yeni notunuzu buraya yazın..."
                  className="w-full h-24 p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                
                <div className="mt-4 mb-6 flex justify-end">
                  <button
                    onClick={handleSaveNote}
                    disabled={isSaving || !newNoteContent.trim()}
                    className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center disabled:opacity-50"
                  >
                    <Save className="w-4 h-4 mr-2" /> {isSaving ? 'Kaydediliyor...' : 'Yeni Notu Kaydet'}
                  </button>
                </div>

                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Not Geçmişi
                </label>
                 <div className="w-full h-48 p-3 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-100 dark:bg-gray-900 overflow-y-auto">
                    {noteText.trim().length > 0 ? (
                        <pre className="text-sm text-gray-800 dark:text-gray-300 whitespace-pre-wrap font-sans">
                            {noteText}
                        </pre>
                    ) : (
                        <p className="text-sm text-gray-500 dark:text-gray-400">Bu kalıp için henüz not girilmemiş.</p>
                    )}
                </div>
                
                 <div className="mt-4 flex justify-end">
                  <button
                    onClick={() => setIsNoteModalOpen(false)}
                    className="px-4 py-2 text-sm font-medium bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition"
                  >
                     Kapat
                  </button>
                </div>
            </Modal>
        </div>
    );
};

export default MoldDetailPage;