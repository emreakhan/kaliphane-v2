// src/pages/MoldDetailPage.js

import React, { useState, useEffect } from 'react';

// İkonlar
import { Plus, CheckCircle, Zap, StickyNote, Save, PlayCircle, ChevronDown, ChevronUp, FileText } from 'lucide-react'; // YENİ: FileText eklendi

// Sabitler ('.js' uzantısını ekledim)
import { MOLD_STATUS, ROLES, OPERATION_STATUS } from '../config/constants.js';

// Yardımcı Fonksiyonlar
import { getStatusClasses } from '../utils/styleUtils.js';
import { formatDate, formatDateTime, getCurrentDateTimeString } from '../utils/dateUtils.js';

// Firebase ('.js' uzantısını ekledim)
import { db, MOLD_NOTES_COLLECTION, doc, onSnapshot, setDoc } from '../config/firebase.js';

// Bileşenler ('.js' uzantılarını ekledim)
import Modal from '../components/Modals/Modal.js';
import AssignOperationModal from '../components/Modals/AssignOperationModal.js';
import SupervisorReviewModal from '../components/Modals/SupervisorReviewModal.js';
import AddOperationModal from '../components/Modals/AddOperationModal.js';


// --- GÜNCELLENMİŞ: KALIP DETAY SAYFASI ---
const MoldDetailPage = ({ 
    mold, onBack, loggedInUser, 
    handleUpdateOperation, handleAddOperation, 
    projects, personnel, machines, 
    handleUpdateMoldStatus, handleUpdateMoldDeadline, handleUpdateMoldPriority,
    handleUpdateTrialReportUrl // YENİ: App.js'den gelen fonksiyon
}) => {
    
    // --- YENİ STATE'LER ---
    const [localTrialReportUrl, setLocalTrialReportUrl] = useState(mold.trialReportUrl || '');
    // --- YENİ BİTTİ ---

    const [modalState, setModalState] = useState({ isOpen: false, type: null, data: null });
    const [localDeadline, setLocalDeadline] = useState(mold.moldDeadline || '');
    const [localPriority, setLocalPriority] = useState(mold.priority || '');
    const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
    const [noteText, setNoteText] = useState('');
    const [newNoteContent, setNewNoteContent] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [expandedTasks, setExpandedTasks] = useState({});

    useEffect(() => {
        setLocalDeadline(mold.moldDeadline || '');
    }, [mold.moldDeadline]);
    
    useEffect(() => {
        setLocalPriority(mold.priority || '');
    }, [mold.priority]);

    // --- YENİ EFFECT ---
    // Kalıp değiştiğinde Rapor Linki state'ini güncelle
    useEffect(() => {
        setLocalTrialReportUrl(mold.trialReportUrl || '');
    }, [mold.trialReportUrl]);
    // --- YENİ BİTTİ ---
    
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

    // --- YENİ FONKSİYON ---
    // Input'tan çıkıldığında (onBlur) linki veritabanına kaydeder
    const handleReportUrlBlur = () => {
        // Eğer link değişmemişse boşuna güncelleme yapma
        if (localTrialReportUrl !== (mold.trialReportUrl || '')) {
            handleUpdateTrialReportUrl(mold.id, localTrialReportUrl);
        }
    };
    // --- YENİ BİTTİ ---

    const handleOpenModal = (type, mold, task, operation) => {
        setModalState({ isOpen: true, type, data: { mold, task, operation } });
    };

    const handleCloseModal = () => {
        setModalState({ isOpen: false, type: null, data: null });
    };

    // Parça açma/kapama
    const toggleTaskExpansion = (taskId) => {
        setExpandedTasks(prev => ({
            ...prev,
            [taskId]: !prev[taskId]
        }));
    };

    const renderModal = () => {
        const { isOpen, type, data } = modalState;
        if (!isOpen || !data) return null;

        const { mold, task, operation } = data;
        
        // Admin'in "Ata" butonu (kaldırılmıştı, doğru)
        if (type === 'assign' && loggedInUser.role === ROLES.CAM_OPERATOR && (operation.status === OPERATION_STATUS.NOT_STARTED || operation.status === OPERATION_STATUS.PAUSED)) {
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
        
        // Değerlendirme (Yetkili veya Admin - Bu doğru)
        if (type === 'review' && (loggedInUser.role === ROLES.SUPERVISOR || isAdmin) && operation.status === OPERATION_STATUS.WAITING_SUPERVISOR_REVIEW) {
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
        
        // Admin - Yeni Operasyon Ekleme (Bu doğru)
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
            
            {/* --- YENİ BUTONLAR --- */}
            <div className="absolute top-4 right-4 flex gap-2">
                {/* Kalıp Deneme Raporu Butonu (Sadece link varsa görünür) */}
                {mold.trialReportUrl && (
                    <a
                        href={mold.trialReportUrl}
                        target="_blank" // Yeni sekmede açar
                        rel="noopener noreferrer" // Güvenlik için
                        className="flex items-center px-3 py-2 text-sm font-semibold text-green-700 dark:text-green-300 bg-green-100 dark:bg-green-900/40 rounded-lg hover:bg-green-200 dark:hover:bg-green-800 transition z-10"
                    >
                        <FileText className="w-4 h-4 mr-2" /> KALIP DENEME RAPORU
                    </a>
                )}

                {/* Notlar Butonu */}
                <button
                    onClick={openNoteModal}
                    className="flex items-center px-3 py-2 text-sm font-semibold text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/40 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-800 transition z-10"
                    title="Kalıp Notları"
                >
                    <StickyNote className="w-4 h-4 mr-2" /> Notlar
                </button>
            </div>
            {/* --- YENİ BİTTİ --- */}
            
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">{mold.moldName} Kalıp Detayları</h2>
            
            {/* --- YENİ GİRİŞ KUTUSU EKLENDİ --- */}
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

                {/* YENİ: Rapor Linki Giriş Kutusu (Sadece Admin) */}
                {isAdmin && (
                    <div className="flex items-center gap-2 w-full mt-2">
                        <label htmlFor="trialReportUrl" className="text-sm font-medium whitespace-nowrap">Deneme Raporu Linki:</label>
                        <input
                            type="text"
                            id="trialReportUrl"
                            value={localTrialReportUrl}
                            onChange={(e) => setLocalTrialReportUrl(e.target.value)}
                            onBlur={handleReportUrlBlur} // Kaydetmek için
                            placeholder="E-Tablo linkini buraya yapıştırın..."
                            className="w-full px-3 py-1 rounded-lg text-xs font-semibold appearance-none border-2 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200"
                        />
                    </div>
                )}
             </div>
             {/* --- YENİ BİTTİ --- */}


            {/* --- İŞ PARÇALARI (Orijinal Kutu Tasarımı - Değişiklik Yok) --- */}
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">İş Parçaları</h3>
            <div className="space-y-6">
                {mold.tasks.length === 0 ?
                (
                    <p className="text-gray-500 dark:text-gray-400">Bu kalıba atanmış alt parça bulunmamaktadır.</p>
                ) : (
                    mold.tasks.map(task => {
                        
                        return (
                            <div key={task.id} className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 shadow-md">
                                {/* PARÇA BAŞLIĞI */}
                                <div className="flex justify-between items-center mb-3">
                                    <p className="font-bold text-lg text-gray-900 dark:text-white truncate">
                                        <span className="font-bold mr-2 text-blue-600">#{task.taskNumber}</span> {task.taskName}
                                    </p>
                                    
                                    {isAdmin && (
                                        <button
                                            onClick={() => handleOpenModal('add_operation', mold, task, null)}
                                            className="ml-4 px-3 py-1 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700 transition flex items-center shadow-md"
                                        >
                                            <Plus className="w-4 h-4 mr-1"/> Yeni Operasyon Ekle
                                        </button>
                                    )}
                                </div>
                                
                                {/* OPERASYON LİSTESİ (Aç/Kapa eklendi) */}
                                <div className="flex justify-end mb-2">
                                     <button 
                                        onClick={() => toggleTaskExpansion(task.id)} 
                                        className="text-xs text-blue-500 hover:underline flex items-center"
                                    >
                                        {expandedTasks[task.id] ? 'Gizle' : 'Göster'}
                                        {expandedTasks[task.id] ? <ChevronUp className="w-4 h-4 ml-1" /> : <ChevronDown className="w-4 h-4 ml-1" />}
                                    </button>
                                </div>

                                {expandedTasks[task.id] && (
                                    <div className="space-y-3 pl-4 border-l-2 border-gray-300 dark:border-gray-600">
                                        {(task.operations || []).map(operation => (
                                            <div key={operation.id} className="p-3 border border-gray-200 dark:border-gray-700 rounded-lg flex flex-col md:flex-row justify-between items-start md:items-center bg-white dark:bg-gray-700">
                                                <div className="flex-1 min-w-0 mb-2 md:mb-0">
                                                    <p className="font-semibold text-blue-700 dark:text-blue-300">
                                                        Operasyon: {operation.type}
                                                    </p>
                                                    
                                                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2 text-xs text-gray-600 dark:text-gray-400">
                                                        <div><span className="font-medium">CAM Op:</span> <span className="font-semibold">{operation.assignedOperator}</span></div>
                                                        <div><span className="font-medium">Tezgah:</span> <span className="font-semibold">{operation.machineName || 'YOK'}</span></div>
                                                        <div><span className="font-medium">Tezgah Op:</span> <span className="font-semibold">{operation.machineOperatorName || 'YOK'}</span></div>
                                                        <div><span className="font-medium">Başlangıç:</span> <span className="font-semibold">{formatDateTime(operation.startDate)}</span></div>
                                                        <div><span className="font-medium">Termin:</span> <span className="font-semibold">{formatDate(operation.estimatedDueDate)}</span></div>
                                                        {operation.durationInHours && (
                                                            <div><span className="font-medium text-green-700 dark:text-green-300">İş Süresi:</span> <span className="font-semibold">{operation.durationInHours} Saat</span></div>
                                                        )}
                                                        {operation.camOperatorRatingForMachineOp && (
                                                            <div><span className="font-medium text-blue-600 dark:text-blue-400">CAM Puanı:</span> <span className="font-semibold">{operation.camOperatorRatingForMachineOp} / 10</span></div>
                                                        )}
                                                        {operation.supervisorRating && (
                                                            <div><span className="font-medium text-purple-600 dark:text-purple-400">Yetkili Puanı:</span> <span className="font-bold text-lg">{operation.supervisorRating} / 10</span></div>
                                                        )}
                                                        {operation.supervisorComment && (
                                                            <div className="col-span-2"><span className="font-medium text-purple-600 dark:text-purple-400">Yorum:</span> <span className="italic">"{operation.supervisorComment}"</span></div>
                                                        )}
                                                    </div>

                                                    <span className={`mt-3 inline-block px-3 py-1 text-xs leading-5 font-semibold rounded-full ${getStatusClasses(operation.status)}`}>
                                                        {operation.status} %{operation.progressPercentage}
                                                    </span>
                                                </div>
                                                
                                                {/* Admin'in Ata/DevamEt butonları burada gizlendi (Değişiklik Yok) */}
                                                <div className="flex flex-col md:flex-row gap-2">
                                                    {loggedInUser.role === ROLES.CAM_OPERATOR && operation.status === OPERATION_STATUS.NOT_STARTED && (
                                                        <button
                                                            onClick={() => handleOpenModal('assign', mold, task, operation)}
                                                            className="px-3 py-1 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition flex items-center justify-center"
                                                        >
                                                            <Zap className="w-4 h-4 mr-1"/> Ata
                                                        </button>
                                                    )}
                                                    {loggedInUser.role === ROLES.CAM_OPERATOR && operation.status === OPERATION_STATUS.PAUSED && (
                                                        <button
                                                            onClick={() => handleOpenModal('assign', mold, task, operation)}
                                                            className="px-3 py-1 bg-orange-500 text-white text-sm font-medium rounded-lg hover:bg-orange-600 transition flex items-center justify-center"
                                                        >
                                                            <PlayCircle className="w-4 h-4 mr-1"/> Devam Et
                                                        </button>
                                                    )}
                                                    {(loggedInUser.role === ROLES.SUPERVISOR || isAdmin) && operation.status === OPERATION_STATUS.WAITING_SUPERVISOR_REVIEW && (
                                                        <button
                                                            onClick={() => handleOpenModal('review', mold, task, operation)}
                                                            className="px-3 py-1 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 transition flex items-center justify-center"
                                                        >
                                                            <CheckCircle className="w-4 h-4 mr-1"/> Değerlendir
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )
                    })
                )}
            </div>
            
            {renderModal()}
            
            {/* Notlar Modalı */}
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