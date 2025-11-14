// src/pages/MoldDetailPage.js

import React, { useState, useEffect } from 'react';

// İkonlar
import { Plus, CheckCircle, Zap, StickyNote, Save, PlayCircle, ChevronDown, ChevronUp, User } from 'lucide-react'; // İkonlar güncellendi

// Sabitler
import { MOLD_STATUS, ROLES, OPERATION_STATUS, TASK_STATUS } from '../config/constants.js'; // TASK_STATUS eklendi

// Yardımcı Fonksiyonlar
import { getStatusClasses, getOperationTypeClasses } from '../utils/styleUtils.js'; // getOperationTypeClasses eklendi
import { formatDate, formatDateTime, getCurrentDateTimeString } from '../utils/dateUtils.js';

// Firebase
import { db, MOLD_NOTES_COLLECTION, doc, onSnapshot, setDoc } from '../config/firebase.js';

// Bileşenler
import Modal from '../components/Modals/Modal.js';
import AssignOperationModal from '../components/Modals/AssignOperationModal.js';
import SupervisorReviewModal from '../components/Modals/SupervisorReviewModal.js';
import AddOperationModal from '../components/Modals/AddOperationModal.js';


// --- YENİ HESAPLAMA FONKSİYONU ---
// Bir parçanın tüm özet bilgilerini tek seferde hesaplar
// --- YENİ HESAPLAMA FONKSİYONLARI ---
// (Bu blok, 'import' satırları ile 'const MoldDetailPage' arasına eklenecek)

// Bir parçanın (task) tüm operasyonlarına bakarak genel durumunu hesaplar
const getTaskOverallStatus = (operations) => {
    if (!operations || operations.length === 0) return TASK_STATUS.BEKLIYOR;

    const statuses = operations.map(op => op.status);

    if (statuses.every(s => s === OPERATION_STATUS.COMPLETED)) return TASK_STATUS.TAMAMLANDI;
    if (statuses.some(s => s === OPERATION_STATUS.IN_PROGRESS)) return TASK_STATUS.CALISIYOR;
    if (statuses.some(s => s === OPERATION_STATUS.PAUSED)) return TASK_STATUS.DURAKLATILDI;
    if (statuses.some(s => s === OPERATION_STATUS.WAITING_SUPERVISOR_REVIEW)) return TASK_STATUS.ONAY_BEKLIYOR;
    
    return TASK_STATUS.BEKLIYOR; // Geri kalan her durum (hepsi NOT_STARTED ise)
};

// Bir parçanın genel ilerlemesini hesaplar
const getTaskOverallProgress = (operations) => {
    if (!operations || operations.length === 0) return 0;
    const totalProgress = operations.reduce((acc, op) => acc + (op.progressPercentage || 0), 0);
    return Math.round(totalProgress / operations.length);
};

// Bir parçada o an aktif çalışan operatörü bulur
const getActiveOperator = (operations) => {
    if (!operations) return '---';
    
    // Önce "ÇALIŞIYOR" olan operatörü ara
    let activeOp = operations.find(op => op.status === OPERATION_STATUS.IN_PROGRESS);
    
    // Yoksa, "DURAKLATILDI" olan operatörü ara
    if (!activeOp) {
        activeOp = operations.find(op => op.status === OPERATION_STATUS.PAUSED);
    }
    
    return activeOp ? activeOp.assignedOperator : '---';
};
// --- YENİ HESAPLAMA SONU ---
const getTaskSummary = (operations) => {
    if (!operations || operations.length === 0) {
        return {
            status: TASK_STATUS.BEKLIYOR,
            progress: 0,
            operator: '---',
            type: '---'
        };
    }

    const statuses = operations.map(op => op.status);
    let overallStatus = TASK_STATUS.BEKLIYOR;
    let activeOperator = '---';
    let activeType = '---';

    // Aktif durumları öncelik sırasına göre bul
    const inProgressOp = operations.find(op => op.status === OPERATION_STATUS.IN_PROGRESS);
    const pausedOp = operations.find(op => op.status === OPERATION_STATUS.PAUSED);
    const reviewOp = operations.find(op => op.status === OPERATION_STATUS.WAITING_SUPERVISOR_REVIEW);

    if (inProgressOp) {
        overallStatus = TASK_STATUS.CALISIYOR;
        activeOperator = inProgressOp.assignedOperator;
        activeType = inProgressOp.type;
    } else if (pausedOp) {
        overallStatus = TASK_STATUS.DURAKLATILDI;
        activeOperator = pausedOp.assignedOperator;
        activeType = pausedOp.type;
    } else if (reviewOp) {
        overallStatus = TASK_STATUS.ONAY_BEKLIYOR;
        activeOperator = reviewOp.assignedOperator;
        activeType = reviewOp.type;
    } else if (statuses.every(s => s === OPERATION_STATUS.COMPLETED)) {
        overallStatus = TASK_STATUS.TAMAMLANDI;
        activeType = 'TAMAMLANDI';
    } else {
        overallStatus = TASK_STATUS.BEKLIYOR;
        activeType = 'BEKLİYOR';
    }

    // Genel ilerleme
    const totalProgress = operations.reduce((acc, op) => acc + (op.progressPercentage || 0), 0);
    const overallProgress = Math.round(totalProgress / operations.length);

    return {
        status: overallStatus,
        progress: overallProgress,
        operator: activeOperator,
        type: activeType
    };
};
// --- YENİ FONKSİYON SONU ---


const MoldDetailPage = ({ mold, onBack, loggedInUser, handleUpdateOperation, handleAddOperation, projects, personnel, machines, handleUpdateMoldStatus, handleUpdateMoldDeadline, handleUpdateMoldPriority }) => {
    const [modalState, setModalState] = useState({ isOpen: false, type: null, data: null });
    const [localDeadline, setLocalDeadline] = useState(mold.moldDeadline || '');
    const [localPriority, setLocalPriority] = useState(mold.priority || '');
    const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
    const [noteText, setNoteText] = useState('');
    const [newNoteContent, setNewNoteContent] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    
    // YENİ: Hangi parçanın açık olduğunu tutan state
    const [expandedTasks, setExpandedTasks] = useState({});

    // --- (Mevcut kodunuz, değişiklik yok) ---
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

    // YENİ: Parça satırına tıklandığında aç/kapa yapar
    const toggleTaskExpansion = (taskId) => {
        setExpandedTasks(prev => ({
            ...prev,
            [taskId]: !prev[taskId]
        }));
    };
    // --- (Mevcut kod sonu) ---


    const renderModal = () => {
        const { isOpen, type, data } = modalState;
        if (!isOpen || !data) return null;

        const { mold, task, operation } = data;
        
        // --- DÜZELTME 1 ---
        // Admin artık "assign" (atama) modalını AÇAMAZ. Sadece CAM operatörü açabilir.
        // `|| isAdmin` kaldırıldı
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
        
        // Değerlendirme (Yetkili veya Admin - Bu doğru, Admin değerlendirebilir)
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
            {/* --- (Sayfa Başı - Değişiklik Yok) --- */}
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
             {/* --- (Sayfa Başı Son) --- */}


            {/* --- İŞ PARÇALARI (Akordiyon Tasarımı) --- */}
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">İş Parçaları</h3>
            <div className="space-y-2">
                
                {/* AKORDİYON BAŞLIKLARI (Grid) */}
                <div className="hidden md:grid grid-cols-12 gap-4 px-4 py-2 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase rounded-t-lg bg-gray-100 dark:bg-gray-700">
                    <div className="col-span-4">Parça Adı</div>
                    <div className="col-span-2">Durum</div>
                    <div className="col-span-3">Aktif Operatör</div>
                    <div className="col-span-2 text-center">İlerleme</div>
                    <div className="col-span-1 text-right">Detay</div>
                </div>

                {mold.tasks.length === 0 ? (
                    <p className="text-gray-500 dark:text-gray-400 p-4">Bu kalıba atanmış alt parça bulunmamaktadır.</p>
                ) : (
                    mold.tasks.map(task => {
                        
                        // Parça için özet bilgileri hesapla
                        const overallStatus = getTaskOverallStatus(task.operations);
                        const overallProgress = getTaskOverallProgress(task.operations);
                        const operator = getActiveOperator(task.operations);

                        const isExpanded = !!expandedTasks[task.id];

                        return (
                            <div key={task.id} className="border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm overflow-hidden">
                                
                                {/* --- ANA PARÇA SATIRI (ÖZET) --- */}
                                <div 
                                    className={`grid grid-cols-12 gap-4 px-4 py-3 items-center cursor-pointer ${isExpanded ? 'bg-blue-50 dark:bg-gray-700' : 'bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                                    onClick={() => toggleTaskExpansion(task.id)}
                                >
                                    
                                    {/* Parça Adı */}
                                    <div className="col-span-12 md:col-span-4 font-bold text-gray-900 dark:text-white">
                                        <span className="text-blue-600 mr-2">#{task.taskNumber}</span> {task.taskName}
                                    </div>
                                    
                                    {/* Genel Durum */}
                                    <div className="col-span-6 md:col-span-2">
                                        <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${getStatusClasses(overallStatus)}`}>
                                            {overallStatus}
                                        </span>
                                    </div>
                                    
                                    {/* Aktif Operatör */}
                                    <div className="col-span-6 md:col-span-3">
                                        <span className="flex items-center text-sm text-gray-700 dark:text-gray-300">
                                            {operator !== '---' && <User className="w-4 h-4 mr-1 text-gray-400" />}
                                            {operator}
                                        </span>
                                    </div>

                                    {/* İlerleme Çubuğu */}
                                    <div className="col-span-10 md:col-span-2">
                                        <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-600">
                                            <div className={`h-2.5 rounded-full ${overallProgress === 100 ? 'bg-green-500' : 'bg-blue-500'}`} style={{ width: `${overallProgress}%` }}></div>
                                        </div>
                                        <span className="text-xs text-gray-500 dark:text-gray-400 text-center block">{overallProgress}%</span>
                                    </div>

                                    {/* Aç/Kapa İkonu */}
                                    <div className="col-span-2 md:col-span-1 flex justify-end items-center">
                                        {isAdmin && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleOpenModal('add_operation', mold, task, null); }}
                                                className="mr-2 p-1 text-green-500 hover:text-green-700"
                                                title="Yeni Operasyon Ekle"
                                            >
                                                <Plus className="w-4 h-4" />
                                            </button>
                                        )}
                                        {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                                    </div>
                                </div>

                                {/* --- AÇILIR DETAY (OPERASYON LİSTESİ) --- */}
                                {isExpanded && (
                                    <div className="p-4 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
                                        <div className="space-y-3">
                                            {(task.operations || []).map(operation => (
                                                <div key={operation.id} className="p-3 border border-gray-200 dark:border-gray-700 rounded-lg flex flex-col md:flex-row justify-between items-start md:items-center bg-white dark:bg-gray-700">
                                                    {/* Operasyon Detayları (Aynen eski koddaki gibi) */}
                                                    <div className="flex-1 min-w-0 mb-2 md:mb-0">
                                                        <p className="font-semibold text-blue-700 dark:text-blue-300">Operasyon: {operation.type}</p>
                                                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2 text-xs text-gray-600 dark:text-gray-400">
                                                            <div><span className="font-medium">CAM Op:</span> <span className="font-semibold">{operation.assignedOperator}</span></div>
                                                            <div><span className="font-medium">Tezgah:</span> <span className="font-semibold">{operation.machineName || 'YOK'}</span></div>
                                                            <div><span className="font-medium">Tezgah Op:</span> <span className="font-semibold">{operation.machineOperatorName || 'YOK'}</span></div>
                                                            <div><span className="font-medium">Başlangıç:</span> <span className="font-semibold">{formatDateTime(operation.startDate)}</span></div>
                                                            <div><span className="font-medium">Termin:</span> <span className="font-semibold">{formatDate(operation.estimatedDueDate)}</span></div>
                                                        </div>
                                                        <span className={`mt-3 inline-block px-3 py-1 text-xs leading-5 font-semibold rounded-full ${getStatusClasses(operation.status)}`}>
                                                            {operation.status} %{operation.progressPercentage}
                                                        </span>
                                                    </div>
                                                    
                                                    {/* --- DÜZELTME 2 & 3 ---
                                                        'Ata' ve 'Devam Et' butonlarındaki '|| isAdmin' koşulu kaldırıldı.
                                                    */}
                                                    <div className="flex flex-col md:flex-row gap-2">
                                                        {/* Sadece CAM Operatörü Ata yapabilir */}
                                                        {loggedInUser.role === ROLES.CAM_OPERATOR && operation.status === OPERATION_STATUS.NOT_STARTED && (
                                                            <button
                                                                onClick={() => handleOpenModal('assign', mold, task, operation)}
                                                                className="px-3 py-1 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition flex items-center justify-center"
                                                            >
                                                                <Zap className="w-4 h-4 mr-1"/> Ata
                                                            </button>
                                                        )}
                                                        {/* Sadece CAM Operatörü Devam Et yapabilir */}
                                                        {loggedInUser.role === ROLES.CAM_OPERATOR && operation.status === OPERATION_STATUS.PAUSED && (
                                                            <button
                                                                onClick={() => handleOpenModal('assign', mold, task, operation)}
                                                                className="px-3 py-1 bg-orange-500 text-white text-sm font-medium rounded-lg hover:bg-orange-600 transition flex items-center justify-center"
                                                            >
                                                                <PlayCircle className="w-4 h-4 mr-1"/> Devam Et
                                                            </button>
                                                        )}
                                                        
                                                        {/* Yetkili veya Admin Değerlendirebilir (Bu doğru) */}
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
                                    </div>
                                )}
                            </div>
                        )
                    })
                )}
            </div>
            
            {renderModal()}
            
            {/* Notlar Modalı (Değişiklik Yok, 'LabeL' hatası düzeltildi) */}
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