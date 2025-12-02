// src/pages/MoldDetailPage.js

import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

// Icons
import { 
    Plus, CheckCircle, Zap, StickyNote, Save, PlayCircle, 
    ChevronDown, ChevronUp, FileText, Image as ImageIcon, 
    User, AlertTriangle, ShieldAlert, Box, Eye, UploadCloud, Loader, Trash2 
} from 'lucide-react'; 

// Constants and Collection Addresses (CORRECTED: Collections imported from here)
import { 
    MOLD_STATUS, ROLES, OPERATION_STATUS, TASK_STATUS, 
    PERSONNEL_ROLES, PROJECT_TYPES,
    PROJECT_COLLECTION, MOLD_NOTES_COLLECTION 
} from '../config/constants.js';

// Helper Functions
import { getStatusClasses, getOperationTypeClasses } from '../utils/styleUtils.js';
import { formatDate, formatDateTime, getCurrentDateTimeString } from '../utils/dateUtils.js';

// Firebase (CORRECTED: Only functions imported from here)
import { 
    db, doc, onSnapshot, setDoc, updateDoc, 
    storage, ref, uploadBytes, getDownloadURL 
} from '../config/firebase.js';

// Components
import Modal from '../components/Modals/Modal.js';
import AssignOperationModal from '../components/Modals/AssignOperationModal.js';
import SupervisorReviewModal from '../components/Modals/SupervisorReviewModal.js';
import AddOperationModal from '../components/Modals/AddOperationModal.js';
import ReportIssueModal from '../components/Modals/ReportIssueModal.js'; 
import View3DModal from '../components/Modals/View3DModal.js';
import MoldEvaluationModal from '../components/Modals/MoldEvaluationModal.js'; 
import ImagePreviewModal from '../components/Modals/ImagePreviewModal.js'; 

// --- CALCULATION FUNCTION ---
const getTaskSummary = (operations) => {
    if (!operations || operations.length === 0) {
        return { status: TASK_STATUS.BEKLIYOR, progress: 0, operator: '---', type: '---' };
    }
    
    // Calculate Total Progress
    const totalProgress = operations.reduce((acc, op) => acc + (op.progressPercentage || 0), 0);
    const overallProgress = Math.round(totalProgress / operations.length);

    if (overallProgress === 100) {
         return { status: TASK_STATUS.TAMAMLANDI, progress: 100, operator: '---', type: 'TAMAMLANDI' };
    }

    const statuses = operations.map(op => op.status);
    let overallStatus = TASK_STATUS.BEKLIYOR;
    let activeOperator = '---';
    let activeType = '---';
    
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
    
    return { status: overallStatus, progress: overallProgress, operator: activeOperator, type: activeType };
};


const MoldDetailPage = ({ 
    loggedInUser, 
    handleUpdateOperation, 
    handleAddOperation, 
    handleReportOperationIssue, 
    handleSetCriticalTask,
    projects, 
    personnel, 
    machines, 
    handleUpdateMoldStatus, 
    handleUpdateMoldDeadline, 
    handleUpdateMoldPriority,
    handleUpdateTrialReportUrl,
    handleUpdateProductImageUrl,
    handleUpdateProjectManager,
    handleUpdateMoldDesigner,
    db 
}) => {
    
    const { moldId } = useParams();
    const navigate = useNavigate();
    
    // --- HOOKS AT THE TOP ---
    const mold = useMemo(() => projects.find(p => p.id === moldId), [projects, moldId]);
    
    const projectManagers = useMemo(() => personnel.filter(p => p.role === PERSONNEL_ROLES.PROJE_SORUMLUSU), [personnel]);
    const moldDesigners = useMemo(() => personnel.filter(p => p.role === PERSONNEL_ROLES.KALIP_TASARIM_SORUMLUSU), [personnel]);

    const [localTrialReportUrl, setLocalTrialReportUrl] = useState('');
    const [localProjectManager, setLocalProjectManager] = useState('');
    const [localMoldDesigner, setLocalMoldDesigner] = useState('');
    const [modalState, setModalState] = useState({ isOpen: false, type: null, data: null });
    const [localDeadline, setLocalDeadline] = useState('');
    const [localPriority, setLocalPriority] = useState('');
    const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
    
    const [is3DModalOpen, setIs3DModalOpen] = useState(false);
    const [isEvalModalOpen, setIsEvalModalOpen] = useState(false); 
    
    const [previewImage, setPreviewImage] = useState(null); 

    const [noteText, setNoteText] = useState('');
    const [newNoteContent, setNewNoteContent] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [expandedTasks, setExpandedTasks] = useState({});
    
    const [isCriticalModalOpen, setIsCriticalModalOpen] = useState(false);
    const [criticalNote, setCriticalNote] = useState('');
    const [selectedTaskForCritical, setSelectedTaskForCritical] = useState(null);

    // --- EFFECTS ---
    useEffect(() => {
        if (mold) {
            setLocalTrialReportUrl(mold.trialReportUrl || '');
            setLocalProjectManager(mold.projectManager || '');
            setLocalMoldDesigner(mold.moldDesigner || '');
            setLocalDeadline(mold.moldDeadline || '');
            setLocalPriority(mold.priority || '');
        }
    }, [mold]);

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
    
    // --- EARLY RETURN ---
    if (!mold) {
        return <div className="p-8 text-center dark:text-white">Kalıp yükleniyor veya bulunamadı...</div>;
    }

    // --- HANDLER FUNCTIONS ---
    
    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file || !mold.id) return;

        if (file.size > 10 * 1024 * 1024) {
            alert("Dosya boyutu 10MB'dan büyük olamaz.");
            return;
        }

        setIsUploading(true);

        try {
            const uniqueFileName = `mold_images/${mold.id}_${Date.now()}_${file.name}`;
            const storageRef = ref(storage, uniqueFileName);
            await uploadBytes(storageRef, file);
            const downloadURL = await getDownloadURL(storageRef);
            await handleUpdateProductImageUrl(mold.id, downloadURL);
            
            alert("Görsel başarıyla yüklendi!");
        } catch (error) {
            console.error("Yükleme hatası:", error);
            alert("Resim yüklenirken bir hata oluştu.");
        } finally {
            setIsUploading(false);
        }
    };

    const handleRemoveImage = async () => {
        if (window.confirm("Mevcut görseli kaldırmak istediğinize emin misiniz?")) {
            await handleUpdateProductImageUrl(mold.id, '');
        }
    };

    const handleProjectTypeChange = async (e) => {
        const newType = e.target.value;
        if (!mold.id) return;
        
        try {
            const moldRef = doc(db, PROJECT_COLLECTION, mold.id);
            await updateDoc(moldRef, {
                projectType: newType
            });
        } catch (error) {
            console.error("Proje tipi güncellenirken hata:", error);
            alert("Proje tipi güncellenemedi.");
        }
    };

    const handleSaveNote = async () => {
        if (!db || !mold?.id || !newNoteContent.trim()) {
            if (!newNoteContent.trim()) setIsNoteModalOpen(false);
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

    const isAdmin = loggedInUser.role === ROLES.ADMIN;
    const isManager = loggedInUser.role === ROLES.ADMIN || loggedInUser.role === ROLES.PROJE_SORUMLUSU || loggedInUser.role === ROLES.KALIP_TASARIM_SORUMLUSU;
    const canAddOperations = loggedInUser.role === ROLES.ADMIN || loggedInUser.role === ROLES.KALIP_TASARIM_SORUMLUSU;
    const canSetCritical = loggedInUser.role === ROLES.ADMIN || loggedInUser.role === ROLES.KALIP_TASARIM_SORUMLUSU;

    const openCriticalModal = (task) => {
        setSelectedTaskForCritical(task);
        setCriticalNote(task.criticalNote || ''); 
        setIsCriticalModalOpen(true);
    };

    const saveCriticalStatus = () => {
        if (selectedTaskForCritical) {
            handleSetCriticalTask(mold.id, selectedTaskForCritical.id, true, criticalNote);
            setIsCriticalModalOpen(false);
            setCriticalNote('');
            setSelectedTaskForCritical(null);
        }
    };
    
    const removeCriticalStatus = () => {
         if (selectedTaskForCritical) {
            handleSetCriticalTask(mold.id, selectedTaskForCritical.id, false, '');
            setIsCriticalModalOpen(false);
            setCriticalNote('');
            setSelectedTaskForCritical(null);
        }
    };

    const onStatusChange = (e) => { 
        const newStatus = e.target.value;
        if (newStatus === MOLD_STATUS.COMPLETED) {
            setIsEvalModalOpen(true);
        } else {
            handleUpdateMoldStatus(mold.id, newStatus);
        }
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
    const handleReportUrlBlur = () => {
        if (localTrialReportUrl !== (mold.trialReportUrl || '')) {
            handleUpdateTrialReportUrl(mold.id, localTrialReportUrl);
        }
    };
    const handleProjectManagerChange = (e) => {
        const newManager = e.target.value;
        setLocalProjectManager(newManager);
        handleUpdateProjectManager(mold.id, newManager);
    };
    const handleMoldDesignerChange = (e) => {
        const newDesigner = e.target.value;
        setLocalMoldDesigner(newDesigner);
        handleUpdateMoldDesigner(mold.id, newDesigner);
    };

    const handleOpenModal = (type, mold, task, operation) => {
        setModalState({ isOpen: true, type, data: { mold, task, operation } });
    };
    const handleCloseModal = () => {
        setModalState({ isOpen: false, type: null, data: null });
    };
    const toggleTaskExpansion = (taskId) => {
        setExpandedTasks(prev => ({ ...prev, [taskId]: !prev[taskId] }));
    };

    const renderModal = () => {
        const { isOpen, type, data } = modalState;
        if (!isOpen || !data) return null;
        const { mold, task, operation } = data;
        
        if (type === 'assign' && loggedInUser.role === ROLES.CAM_OPERATOR && (operation.status === OPERATION_STATUS.NOT_STARTED || operation.status === OPERATION_STATUS.PAUSED)) {
            return <AssignOperationModal isOpen={isOpen} onClose={handleCloseModal} mold={mold} task={task} operation={operation} loggedInUser={loggedInUser} onSubmit={handleUpdateOperation} projects={projects} personnel={personnel} machines={machines} />;
        }
        if (type === 'review' && (loggedInUser.role === ROLES.SUPERVISOR || isAdmin) && operation.status === OPERATION_STATUS.WAITING_SUPERVISOR_REVIEW) {
            return <SupervisorReviewModal isOpen={isOpen} onClose={handleCloseModal} mold={mold} task={task} operation={operation} onSubmit={handleUpdateOperation} />;
        }
        if (type === 'add_operation' && canAddOperations) {
            return <AddOperationModal isOpen={isOpen} onClose={handleCloseModal} mold={mold} task={task} onSubmit={handleAddOperation} />;
        }
        if (type === 'report_issue') {
            return <ReportIssueModal isOpen={isOpen} onClose={handleCloseModal} mold={mold} task={task} operation={operation} onSubmit={handleReportOperationIssue} />;
        }
        return null;
    };
    
    return (
        <div className="p-4 bg-white dark:bg-gray-800 rounded-xl shadow-xl relative">
            <button 
                onClick={() => navigate('/')} 
                className="mb-4 text-blue-600 dark:text-blue-400 hover:underline flex items-center"
            >
                &larr; Kalıp Listesine Geri Dön
            </button>
            
            {/* Top Right Action Buttons */}
            <div className="absolute top-4 right-4 flex gap-2">
                <button 
                    onClick={() => setIs3DModalOpen(true)}
                    className="flex items-center px-3 py-2 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-cyan-500 rounded-lg hover:from-blue-700 hover:to-cyan-600 transition z-10 shadow-md transform hover:scale-105" 
                    title="3D Model Görüntüle"
                >
                    <Box className="w-4 h-4 mr-2" /> 3D
                </button>

                {mold.productImageUrl && (
                    <button 
                        onClick={() => setPreviewImage(mold.productImageUrl)}
                        className="flex items-center px-3 py-2 text-sm font-semibold text-purple-700 dark:text-purple-300 bg-purple-100 dark:bg-purple-900/40 rounded-lg hover:bg-purple-200 dark:hover:bg-purple-800 transition z-10"
                    >
                        <ImageIcon className="w-4 h-4 mr-2" /> ÜRÜN GÖRSELİ
                    </button>
                )}

                {mold.trialReportUrl && (
                    <a href={mold.trialReportUrl} target="_blank" rel="noopener noreferrer" className="flex items-center px-3 py-2 text-sm font-semibold text-green-700 dark:text-green-300 bg-green-100 dark:bg-green-900/40 rounded-lg hover:bg-green-200 dark:hover:bg-green-800 transition z-10">
                        <FileText className="w-4 h-4 mr-2" /> KALIP DENEME RAPORU
                    </a>
                )}
                <button onClick={openNoteModal} className="flex items-center px-3 py-2 text-sm font-semibold text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/40 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-800 transition z-10" title="Kalıp Notları">
                    <StickyNote className="w-4 h-4 mr-2" /> Notlar
                </button>
            </div>
            
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">{mold.moldName} Kalıp Detayları</h2>
            
            <div className="text-gray-600 dark:text-gray-400 mb-6 flex flex-wrap items-center gap-4">
                <div className="flex items-center">
                    <span className="mr-2">Tür:</span>
                    {isAdmin ? (
                        <select 
                            value={mold.projectType || PROJECT_TYPES.NEW_MOLD} 
                            onChange={handleProjectTypeChange}
                            className="px-2 py-1 rounded-lg text-xs font-bold border-2 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-white"
                        >
                            <option value={PROJECT_TYPES.NEW_MOLD}>YENİ KALIP</option>
                            <option value={PROJECT_TYPES.REVISION}>REVİZYON</option>
                            <option value={PROJECT_TYPES.MACHINING}>PROJE İMALAT</option>
                            <option value={PROJECT_TYPES.IMPROVEMENT}>İYİLEŞTİRME</option>
                            <option value={PROJECT_TYPES.T0_IMPROVEMENT}>T0-İYİLEŞTİRME</option>
                        </select>
                    ) : (
                        <span className="font-bold text-gray-800 dark:text-gray-200">
                            {mold.projectType || PROJECT_TYPES.NEW_MOLD}
                        </span>
                    )}
                </div>

                <div className="h-6 w-px bg-gray-300 dark:bg-gray-600 mx-2"></div>

                <div>
                    <span>Müşteri: {mold.customer} | Durum:</span>
                    {isAdmin ? (
                        <select value={mold.status || MOLD_STATUS.WAITING} onChange={onStatusChange} className={`ml-2 px-3 py-1 rounded-lg text-xs font-semibold appearance-none border-2 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:outline-none ${getStatusClasses(mold.status || MOLD_STATUS.WAITING)}`}>
                           {Object.values(MOLD_STATUS).map(status => <option key={status} value={status}>{status}</option>)}
                        </select>
                    ) : (
                        <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-semibold ${getStatusClasses(mold.status || MOLD_STATUS.WAITING)}`}>
                            {mold.status || MOLD_STATUS.WAITING}
                        </span>
                    )}
                </div>
                {isManager ? (
                    <div className="flex items-center gap-2">
                        <label htmlFor="moldDeadline" className="text-sm font-medium">Termin:</label>
                        <input type="date" id="moldDeadline" value={localDeadline} onChange={onDeadlineChange} className="px-3 py-1 rounded-lg text-xs font-semibold appearance-none border-2 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200" />
                    </div>
                ) : (
                    mold.moldDeadline && <span className="text-sm">Termin: <span className="font-semibold">{formatDate(mold.moldDeadline)}</span></span>
                )}
                {isManager && (
                     <div className="flex items-center gap-2">
                        <label htmlFor="moldPriority" className="text-sm font-medium">Aciliyet:</label>
                        <input type="number" id="moldPriority" value={localPriority === null ? '' : localPriority} onChange={onPriorityChange} min="1" placeholder="Sıra No" className="w-16 px-3 py-1 rounded-lg text-xs font-semibold appearance-none border-2 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200" />
                    </div>
                )}
             </div>
             
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 border-t dark:border-gray-700 pt-4">
                {isAdmin ? (
                    <div className="flex items-center gap-2">
                        <label htmlFor="projectManager" className="text-sm font-medium whitespace-nowrap text-gray-700 dark:text-gray-300">Proje Sorumlusu:</label>
                        <select id="projectManager" value={localProjectManager} onChange={handleProjectManagerChange} className="w-full px-3 py-1 rounded-lg text-xs font-semibold appearance-none border-2 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200">
                            <option value="">Seçiniz...</option>
                            {projectManagers.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                        </select>
                    </div>
                ) : (
                    mold.projectManager && <p className="text-sm dark:text-gray-300">Proje Sor.: <span className="font-semibold dark:text-white">{mold.projectManager}</span></p>
                )}
                {isAdmin ? (
                    <div className="flex items-center gap-2">
                        <label htmlFor="moldDesigner" className="text-sm font-medium whitespace-nowrap text-gray-700 dark:text-gray-300">Kalıp Tasarımcısı:</label>
                        <select id="moldDesigner" value={localMoldDesigner} onChange={handleMoldDesignerChange} className="w-full px-3 py-1 rounded-lg text-xs font-semibold appearance-none border-2 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200">
                            <option value="">Seçiniz...</option>
                            {moldDesigners.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                        </select>
                    </div>
                ) : (
                    mold.moldDesigner && <p className="text-sm dark:text-gray-300">Tasarım Sor.: <span className="font-semibold dark:text-white">{mold.moldDesigner}</span></p>
                )}
                
                {isManager && (
                    <div className="flex items-center gap-2 w-full">
                        <label htmlFor="trialReportUrl" className="text-sm font-medium whitespace-nowrap text-gray-700 dark:text-gray-300">Deneme Raporu Linki:</label>
                        <input type="text" id="trialReportUrl" value={localTrialReportUrl} onChange={(e) => setLocalTrialReportUrl(e.target.value)} onBlur={handleReportUrlBlur} placeholder="E-Tablo linkini buraya yapıştırın..." className="w-full px-3 py-1 rounded-lg text-xs font-semibold appearance-none border-2 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200" />
                    </div>
                )}

                {/* --- IMAGE UPLOAD AREA --- */}
                {isManager && (
                    <div className="w-full border-t md:border-t-0 md:border-l dark:border-gray-700 md:pl-4 mt-2 md:mt-0">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Ürün Görseli</label>
                        
                        <div className="flex items-center gap-2">
                            {/* Upload Button */}
                            <label className={`flex items-center px-4 py-2 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-lg cursor-pointer border border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-800 transition ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}`}>
                                {isUploading ? <Loader className="w-4 h-4 mr-2 animate-spin" /> : <UploadCloud className="w-4 h-4 mr-2" />}
                                <span className="text-xs font-bold">{isUploading ? 'Yükleniyor...' : 'Görsel Seç ve Yükle'}</span>
                                <input 
                                    type="file" 
                                    className="hidden" 
                                    accept="image/*" 
                                    onChange={handleFileUpload}
                                    disabled={isUploading}
                                />
                            </label>

                            {/* Delete Button */}
                            {mold.productImageUrl && (
                                <button 
                                    onClick={handleRemoveImage}
                                    className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition"
                                    title="Görseli Kaldır"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                        
                        {/* Info Text */}
                        <p className="text-[10px] text-gray-400 mt-1">
                            {mold.productImageUrl ? "✅ Görsel yüklü. Değiştirmek için yeni dosya seçin." : "⚠️ Henüz görsel yüklenmemiş."}
                        </p>
                    </div>
                )}
                {/* ------------------------------------- */}
             </div>


            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">İş Parçaları</h3>
            <div className="space-y-1">
                <div className="hidden md:grid grid-cols-12 gap-4 px-4 py-2 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase rounded-t-lg bg-gray-100 dark:bg-gray-700">
                    <div className="col-span-3">Parça Adı</div>
                    <div className="col-span-2">Durum</div>
                    <div className="col-span-2">Aktif Operasyon</div> 
                    <div className="col-span-2">Aktif Operatör</div>
                    <div className="col-span-2 text-center">İlerleme</div>
                    <div className="col-span-1 text-right">Detay</div>
                </div>

                {mold.tasks.length === 0 ? (
                    <p className="text-gray-500 dark:text-gray-400 p-4">Bu kalıba atanmış alt parça bulunmamaktadır.</p>
                ) : (
                    mold.tasks.map(task => {
                        const summary = getTaskSummary(task.operations);
                        const isExpanded = !!expandedTasks[task.id];
                        const isCritical = task.isCritical;

                        return (
                            <div key={task.id} className={`border ${isCritical ? 'border-red-500 bg-red-50 dark:bg-red-900/10' : 'border-gray-200 dark:border-gray-700'} overflow-hidden first:rounded-t-lg last:rounded-b-lg shadow-sm`}>
                                <div 
                                    className={`grid grid-cols-12 gap-4 px-4 py-3 items-center cursor-pointer ${isExpanded ? 'border-b border-gray-200 dark:border-gray-600' : ''}`}
                                    onClick={() => toggleTaskExpansion(task.id)}
                                >
                                    <div className="col-span-12 md:col-span-3 font-bold text-gray-900 dark:text-white flex items-center">
                                        <span className="text-blue-600 mr-2">#{task.taskNumber}</span> {task.taskName}
                                        {isCritical && (
                                            <span className="ml-2 text-red-600 animate-pulse" title={`Kritik: ${task.criticalNote}`}>
                                                <ShieldAlert className="w-5 h-5" />
                                            </span>
                                        )}
                                    </div>
                                    <div className="col-span-6 md:col-span-2">
                                        <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${getStatusClasses(summary.status)}`}>
                                            {summary.status}
                                        </span>
                                    </div>
                                    <div className="col-span-6 md:col-span-2">
                                        {summary.type !== '---' && <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${getOperationTypeClasses(summary.type)}`}>{summary.type}</span>}
                                    </div>
                                    <div className="col-span-6 md:col-span-2">
                                        <span className="flex items-center text-sm text-gray-700 dark:text-gray-300">
                                            {summary.operator !== '---' && <User className="w-4 h-4 mr-1 text-gray-400" />}
                                            {summary.operator}
                                        </span>
                                    </div>
                                    <div className="col-span-10 md:col-span-2 text-center">
                                        <div className="w-full bg-gray-200 rounded-full h-1.5 dark:bg-gray-600">
                                            <div className={`h-1.5 rounded-full ${summary.progress === 100 ? 'bg-green-500' : 'bg-blue-500'}`} style={{ width: `${summary.progress}%` }}></div>
                                        </div>
                                        <span className="text-xs text-gray-500 dark:text-gray-400">{summary.progress}%</span>
                                    </div>
                                    <div className="col-span-2 md:col-span-1 flex justify-end items-center space-x-2">
                                        {canSetCritical && (
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); openCriticalModal(task); }}
                                                className={`p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 ${isCritical ? 'text-red-600' : 'text-gray-400'}`}
                                                title="Kritik Olarak İşaretle"
                                            >
                                                <ShieldAlert className="w-4 h-4" />
                                            </button>
                                        )}

                                        {canAddOperations && (
                                            <button onClick={(e) => { e.stopPropagation(); handleOpenModal('add_operation', mold, task, null); }} className="mr-2 p-1 text-green-500 hover:text-green-700" title="Yeni Operasyon Ekle">
                                                <Plus className="w-4 h-4" />
                                            </button>
                                        )}
                                        {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                                    </div>
                                </div>

                                {isExpanded && (
                                    <div className="bg-gray-50 dark:bg-gray-800/50 p-3">
                                        {isCritical && (
                                            <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border-l-4 border-red-600 text-red-800 dark:text-red-200 rounded text-sm flex items-start">
                                                <ShieldAlert className="w-5 h-5 mr-2 flex-shrink-0 mt-0.5" />
                                                <div>
                                                    <span className="font-bold block">⚠️ DİKKAT: KRİTİK PARÇA</span>
                                                    {task.criticalNote}
                                                </div>
                                            </div>
                                        )}

                                        <div className="space-y-3">
                                            {(task.operations || []).map(operation => (
                                                <div key={operation.id} className="p-3 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-700">
                                                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center">
                                                        <div className="flex-1 min-w-0 mb-2 md:mb-0">
                                                            <div className="flex items-center">
                                                                <p className="font-semibold text-blue-700 dark:text-blue-300 mr-2">Operasyon: {operation.type}</p>
                                                                {operation.reworkHistory && operation.reworkHistory.length > 0 && (
                                                                    <span className="bg-red-100 text-red-800 text-xs font-bold px-2 py-0.5 rounded flex items-center">
                                                                        <AlertTriangle className="w-3 h-3 mr-1" />
                                                                        {operation.reworkHistory.length}. Hata Kaydı
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2 text-xs text-gray-600 dark:text-gray-400">
                                                                <div><span className="font-medium">CAM Op:</span> <span className="font-semibold">{operation.assignedOperator}</span></div>
                                                                <div><span className="font-medium">Tezgah:</span> <span className="font-semibold">{operation.machineName || 'YOK'}</span></div>
                                                                <div><span className="font-medium">Tezgah Op:</span> <span className="font-semibold">{operation.machineOperatorName || 'YOK'}</span></div>
                                                                <div><span className="font-medium">Başlangıç:</span> <span className="font-semibold">{formatDateTime(operation.startDate)}</span></div>
                                                                <div><span className="font-medium">Termin:</span> <span className="font-semibold">{formatDate(operation.estimatedDueDate)}</span></div>
                                                                {operation.durationInHours && <div><span className="font-medium text-green-700 dark:text-green-300">İş Süresi:</span> <span className="font-semibold">{operation.durationInHours} Saat</span></div>}
                                                                {operation.camOperatorRatingForMachineOp && <div><span className="font-medium text-blue-600 dark:text-blue-400">CAM Puanı:</span> <span className="font-semibold">{operation.camOperatorRatingForMachineOp} / 10</span></div>}
                                                                {operation.supervisorRating && <div><span className="font-medium text-purple-600 dark:text-purple-400">Yetkili Puanı:</span> <span className="font-bold text-lg">{operation.supervisorRating} / 10</span></div>}
                                                                {operation.supervisorComment && <div className="col-span-2"><span className="font-medium text-purple-600 dark:text-purple-400">Yorum:</span> <span className="italic">"{operation.supervisorComment}"</span></div>}
                                                            </div>
                                                            <span className={`mt-3 inline-block px-3 py-1 text-xs leading-5 font-semibold rounded-full ${getStatusClasses(operation.status)}`}>{operation.status} %{operation.progressPercentage}</span>
                                                        </div>

                                                        <div className="flex flex-col gap-2 mt-2 md:mt-0">
                                                            <div className="flex flex-col md:flex-row gap-2">
                                                                {loggedInUser.role === ROLES.CAM_OPERATOR && operation.status === OPERATION_STATUS.NOT_STARTED && (
                                                                    <button onClick={() => handleOpenModal('assign', mold, task, operation)} className="px-3 py-1 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition flex items-center justify-center"><Zap className="w-4 h-4 mr-1"/> Ata</button>
                                                                )}
                                                                {loggedInUser.role === ROLES.CAM_OPERATOR && operation.status === OPERATION_STATUS.PAUSED && (
                                                                    <button onClick={() => handleOpenModal('assign', mold, task, operation)} className="px-3 py-1 bg-orange-500 text-white text-sm font-medium rounded-lg hover:bg-orange-600 transition flex items-center justify-center"><PlayCircle className="w-4 h-4 mr-1"/> Devam Et</button>
                                                                )}
                                                                {(loggedInUser.role === ROLES.SUPERVISOR || isAdmin) && operation.status === OPERATION_STATUS.WAITING_SUPERVISOR_REVIEW && (
                                                                    <button onClick={() => handleOpenModal('review', mold, task, operation)} className="px-3 py-1 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 transition flex items-center justify-center"><CheckCircle className="w-4 h-4 mr-1"/> Değerlendir</button>
                                                                )}
                                                                
                                                                {(loggedInUser.role === ROLES.CAM_OPERATOR || isAdmin) && 
                                                                  (operation.status === OPERATION_STATUS.IN_PROGRESS || operation.status === OPERATION_STATUS.PAUSED || operation.status === OPERATION_STATUS.WAITING_SUPERVISOR_REVIEW) && (
                                                                    <button 
                                                                        onClick={() => handleOpenModal('report_issue', mold, task, operation)}
                                                                        className="px-3 py-1 bg-red-100 text-red-700 text-sm font-medium rounded-lg hover:bg-red-200 transition flex items-center justify-center border border-red-300"
                                                                        title="Hata Bildir ve Sıfırla"
                                                                    >
                                                                        <AlertTriangle className="w-4 h-4" />
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {operation.reworkHistory && operation.reworkHistory.length > 0 && (
                                                        <div className="mt-3 pt-3 border-t border-red-100 dark:border-red-900/30">
                                                            <p className="text-xs font-bold text-red-800 dark:text-red-300 mb-2">⚠️ Hata ve Yeniden İşleme Geçmişi:</p>
                                                            <div className="space-y-2">
                                                                {operation.reworkHistory.map((history) => (
                                                                    <div key={history.id} className="bg-red-50 dark:bg-red-900/10 p-2 rounded text-xs border border-red-100 dark:border-red-900/30">
                                                                        <div className="flex justify-between text-red-700 dark:text-red-400 font-semibold">
                                                                            <span>{history.reason}</span>
                                                                            <span>{formatDateTime(history.date)}</span>
                                                                        </div>
                                                                        <div className="text-gray-600 dark:text-gray-400 mt-1">
                                                                            {history.description}
                                                                        </div>
                                                                        <div className="text-gray-500 dark:text-gray-500 mt-1 italic">
                                                                            Bildiren: {history.reportedBy} (Sıfırlanan İlerleme: %{history.previousProgress})
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                    
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
            
            {isCriticalModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-[60] p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md border-l-8 border-red-600 p-6">
                        <h3 className="text-lg font-bold text-red-600 flex items-center mb-4">
                            <ShieldAlert className="w-6 h-6 mr-2" />
                            Kritik Parça İşaretle
                        </h3>
                        <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
                            Bu parçayı "Kritik" olarak işaretlemek üzeresiniz. Operatörler işi almadan önce bu notu görüp onaylamak zorunda kalacaklar.
                        </p>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Kritik Uyarı Notu:</label>
                        <textarea 
                            value={criticalNote}
                            onChange={(e) => setCriticalNote(e.target.value)}
                            placeholder="Örn: Yüzey hassasiyeti yüksek, soğutmaya dikkat!"
                            className="w-full p-3 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white resize-none h-24 mb-4"
                        />
                        <div className="flex justify-end space-x-3">
                             {selectedTaskForCritical?.isCritical && (
                                <button onClick={removeCriticalStatus} className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition text-sm">
                                    İşareti Kaldır
                                </button>
                            )}
                            <button onClick={() => setIsCriticalModalOpen(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition">İptal</button>
                            <button onClick={saveCriticalStatus} disabled={!criticalNote.trim()} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-bold disabled:opacity-50">Kaydet</button>
                        </div>
                    </div>
                </div>
            )}

            <Modal isOpen={isNoteModalOpen} onClose={() => setIsNoteModalOpen(false)} title={`${mold.moldName} - Ortak Notlar`}>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Yeni Not Ekle ({loggedInUser.name})</label>
                <textarea value={newNoteContent} onChange={(e) => setNewNoteContent(e.target.value)} placeholder="Yeni notunuzu buraya yazın..." className="w-full h-24 p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                <div className="mt-4 mb-6 flex justify-end">
                  <button onClick={handleSaveNote} disabled={isSaving || !newNoteContent.trim()} className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center disabled:opacity-50"><Save className="w-4 h-4 mr-2" /> {isSaving ? 'Kaydediliyor...' : 'Yeni Notu Kaydet'}</button>
                </div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Not Geçmişi</label>
                 <div className="w-full h-48 p-3 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-100 dark:bg-gray-900 overflow-y-auto">
                    {noteText.trim().length > 0 ? <pre className="text-sm text-gray-800 dark:text-gray-300 whitespace-pre-wrap font-sans">{noteText}</pre> : <p className="text-sm text-gray-500 dark:text-gray-400">Bu kalıp için henüz not girilmemiş.</p>}
                </div>
                 <div className="mt-4 flex justify-end">
                  <button onClick={() => setIsNoteModalOpen(false)} className="px-4 py-2 text-sm font-medium bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition">Kapat</button>
                </div>
            </Modal>
            
            <View3DModal 
                isOpen={is3DModalOpen}
                onClose={() => setIs3DModalOpen(false)}
                mold={mold}
            />

            {isEvalModalOpen && (
                <MoldEvaluationModal 
                    isOpen={isEvalModalOpen}
                    onClose={() => setIsEvalModalOpen(false)}
                    mold={mold}
                    db={db}
                    onComplete={() => {
                        setIsEvalModalOpen(false);
                    }}
                />
            )}

            {previewImage && (
                <ImagePreviewModal 
                    isOpen={!!previewImage} 
                    imageUrl={previewImage} 
                    title={mold.moldName || 'Ürün Görseli'} 
                    onClose={() => setPreviewImage(null)} 
                />
            )}

        </div>
    );
};

export default MoldDetailPage;