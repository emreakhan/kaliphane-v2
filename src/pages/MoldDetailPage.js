// src/pages/MoldDetailPage.js

import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

import { 
    Plus, CheckCircle, Zap, StickyNote, Save, PlayCircle, 
    ChevronDown, ChevronUp, FileText, Image as ImageIcon, 
    User, AlertTriangle, ShieldAlert, Box, Eye, UploadCloud, Loader, Trash2, Clock, HelpCircle,
    ListChecks, Layers, Timer, Check, ChevronLeft, ChevronRight, XCircle
} from 'lucide-react'; 

import { 
    MOLD_STATUS, ROLES, OPERATION_STATUS, TASK_STATUS, 
    PERSONNEL_ROLES, PROJECT_TYPES,
    PROJECT_COLLECTION, MOLD_NOTES_COLLECTION, MOLD_STATUS_ACTIVE_LIST
} from '../config/constants.js';

import { getStatusClasses, getOperationTypeClasses } from '../utils/styleUtils.js';
import { formatDate, formatDateTime, getCurrentDateTimeString } from '../utils/dateUtils.js';

import { 
    db, doc, onSnapshot, setDoc, updateDoc, 
    storage, ref, uploadBytes, getDownloadURL 
} from '../config/firebase.js';

import Modal from '../components/Modals/Modal.js';
import AssignOperationModal from '../components/Modals/AssignOperationModal.js';
import SupervisorReviewModal from '../components/Modals/SupervisorReviewModal.js';
import AddOperationModal from '../components/Modals/AddOperationModal.js';
import ReportIssueModal from '../components/Modals/ReportIssueModal.js'; 
import View3DModal from '../components/Modals/View3DModal.js';
import MoldEvaluationModal from '../components/Modals/MoldEvaluationModal.js'; 
import ImagePreviewModal from '../components/Modals/ImagePreviewModal.js'; 

import MaterialChecklistTab from '../components/Shared/MaterialChecklistTab.js';

const calculateDurationText = (startStr, endStr) => {
    if (!startStr) return "Hesaplanamıyor";
    const start = new Date(startStr);
    const end = endStr ? new Date(endStr) : new Date(); 
    const diffMs = Math.max(0, end - start);
    
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    let res = [];
    if (diffDays > 0) res.push(`${diffDays} gün`);
    if (diffHours > 0) res.push(`${diffHours} saat`);
    if (diffMins > 0 || res.length === 0) res.push(`${diffMins} dk`);

    return res.join(', ');
};

const getPauseReasonText = (reason) => {
    if (!reason) return 'Belirtilmedi';
    if (typeof reason === 'object') {
        const parts = [];
        if (reason.reason) parts.push(reason.reason);
        if (reason.description) parts.push(reason.description);
        return parts.join(' - ');
    }
    return reason;
};

const calculateTotalPauseDuration = (pauseHistory, lastPausedAt) => {
    let totalMs = 0;
    if (pauseHistory && pauseHistory.length > 0) {
        pauseHistory.forEach(ph => {
            if (ph.pausedAt && ph.resumedAt) {
                totalMs += Math.max(0, new Date(ph.resumedAt) - new Date(ph.pausedAt));
            }
        });
    }
    if (lastPausedAt) {
        totalMs += Math.max(0, new Date() - new Date(lastPausedAt));
    }

    if (totalMs === 0) return "0 dk";

    const diffDays = Math.floor(totalMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor((totalMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const diffMins = Math.floor((totalMs % (1000 * 60 * 60)) / (1000 * 60));

    let res = [];
    if (diffDays > 0) res.push(`${diffDays} gün`);
    if (diffHours > 0) res.push(`${diffHours} saat`);
    if (diffMins > 0 || res.length === 0) res.push(`${diffMins} dk`);

    return res.join(', ');
};

const compressImage = (file) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                const MAX_WIDTH = 1024;
                const MAX_HEIGHT = 1024;

                if (width > height) {
                    if (width > MAX_WIDTH) {
                        height = Math.round((height * MAX_WIDTH) / width);
                        width = MAX_WIDTH;
                    }
                } else {
                    if (height > MAX_HEIGHT) {
                        width = Math.round((width * MAX_HEIGHT) / height);
                        height = MAX_HEIGHT;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                canvas.toBlob((blob) => {
                    if (blob) {
                        resolve(blob);
                    } else {
                        reject(new Error("Canvas toBlob failed"));
                    }
                }, 'image/jpeg', 0.7);
            };
            img.onerror = (err) => reject(err);
        };
        reader.onerror = (err) => reject(err);
    });
};

const getTaskSummary = (operations, task) => {
    if (task && task.outsourced) {
        const firmName = task.outsourcedFirm || 'Dış Temin';
        if (task.outsourcedStatus === 'Tamamlandı') {
            return { 
                status: TASK_STATUS.TAMAMLANDI, 
                progress: 100, 
                operator: firmName, 
                type: 'DIŞ TEMİN (TMLD)' 
            };
        } else {
            return { 
                status: TASK_STATUS.CALISIYOR, 
                progress: 50, 
                operator: firmName, 
                type: 'DIŞ TEMİN' 
            };
        }
    }

    if (!operations || operations.length === 0) {
        return { status: TASK_STATUS.BEKLIYOR, progress: 0, operator: '---', type: '---' };
    }
    
    const totalProgress = operations.reduce((acc, op) => acc + (op.progressPercentage || 0), 0);
    const overallProgress = Math.round(totalProgress / operations.length);

    const allOperators = operations
        .map(op => op.assignedOperator)
        .filter(op => op && op !== 'SEÇ');
    
    const uniqueOperators = [...new Set(allOperators)];
    const activeOperator = uniqueOperators.length > 0 ? uniqueOperators.join(', ') : '---';

    if (overallProgress === 100) {
         return { status: TASK_STATUS.TAMAMLANDI, progress: 100, operator: activeOperator, type: 'TAMAMLANDI' };
    }

    const statuses = operations.map(op => op.status);
    let overallStatus = TASK_STATUS.BEKLIYOR;
    let activeType = '---';
    
    const inProgressOp = operations.find(op => op.status === OPERATION_STATUS.IN_PROGRESS);
    const pausedOp = operations.find(op => op.status === OPERATION_STATUS.PAUSED);
    const reviewOp = operations.find(op => op.status === OPERATION_STATUS.WAITING_SUPERVISOR_REVIEW);
    
    const nextWaitingOp = operations.find(op => op.status === OPERATION_STATUS.NOT_STARTED);

    if (inProgressOp) {
        overallStatus = TASK_STATUS.CALISIYOR;
        activeType = inProgressOp.type;
    } else if (pausedOp) {
        overallStatus = TASK_STATUS.DURAKLATILDI;
        activeType = pausedOp.type;
    } else if (reviewOp) {
        overallStatus = TASK_STATUS.ONAY_BEKLIYOR;
        activeType = reviewOp.type;
    } else if (statuses.every(s => s === OPERATION_STATUS.COMPLETED)) {
        overallStatus = TASK_STATUS.TAMAMLANDI;
        activeType = 'TAMAMLANDI';
    } else {
        overallStatus = TASK_STATUS.BEKLIYOR;
        if (nextWaitingOp) {
            activeType = `${nextWaitingOp.type} BEKLİYOR`;
        } else {
            activeType = 'BEKLİYOR';
        }
    }
    
    return { status: overallStatus, progress: overallProgress, operator: activeOperator, type: activeType };
};

const MoldDetailPage = ({ 
    loggedInUser, handleUpdateOperation, handleAddOperation, handleReportOperationIssue, handleSetCriticalTask,
    projects, personnel, machines, handleUpdateMoldStatus, handleUpdateMoldDeadline, handleUpdateMoldPriority,
    handleUpdateTrialReportUrl, handleUpdateProductImageUrl, handleUpdateProjectManager, handleUpdateMoldDesigner,
    handleUpdateCamResponsible, db 
}) => {
    
    const { moldId } = useParams();
    const navigate = useNavigate();
    
    const mold = useMemo(() => projects.find(p => p.id === moldId), [projects, moldId]);
    
    const cleanProjects = useMemo(() => {
        if (!projects || !Array.isArray(projects)) return [];
        return projects.filter(p => 
            p && 
            p.moldName && 
            typeof p.moldName === 'string' && 
            p.moldName.trim() !== ''
        );
    }, [projects]);

    const filteredProjects = useMemo(() => {
        const activeFilter = localStorage.getItem('moldListActiveFilter') || 'ACTIVE_OVERVIEW';
        const searchTerm = localStorage.getItem('moldListSearchTerm') || '';
        
        let filtered = cleanProjects;

        if (activeFilter !== 'all') {
            if (activeFilter === 'ACTIVE_OVERVIEW') {
                filtered = filtered.filter(project => 
                    MOLD_STATUS_ACTIVE_LIST.includes(project.status)
                );
            } else {
                filtered = filtered.filter(project => 
                    project.status === activeFilter
                );
            }
        }

        if (searchTerm.trim()) {
            const lowerSearchTerm = searchTerm.toLowerCase();
            filtered = filtered.filter(project => 
                (project.moldName || '').toLowerCase().includes(lowerSearchTerm) ||
                (project.customer || '').toLowerCase().includes(lowerSearchTerm)
            );
        }
        
        filtered.sort((a, b) => {
            const priorityA = a.priority;
            const priorityB = b.priority;

            if (priorityA && priorityB) {
                return priorityA - priorityB;
            }
            if (priorityA && !priorityB) {
                return -1;
            }
            if (!priorityA && priorityB) {
                return 1;
            }
            return (a.moldName || '').localeCompare(b.moldName || '');
        });
        
        return filtered;
    }, [cleanProjects]);

    const currentMoldIndex = useMemo(() => {
        return filteredProjects.findIndex(p => p.id === moldId);
    }, [filteredProjects, moldId]);

    const prevMoldId = currentMoldIndex > 0 ? filteredProjects[currentMoldIndex - 1].id : null;
    const nextMoldId = currentMoldIndex !== -1 && currentMoldIndex < filteredProjects.length - 1 ? filteredProjects[currentMoldIndex + 1].id : null;

    const projectManagers = useMemo(() => personnel.filter(p => p.role === PERSONNEL_ROLES.PROJE_SORUMLUSU), [personnel]);
    const moldDesigners = useMemo(() => personnel.filter(p => p.role === PERSONNEL_ROLES.KALIP_TASARIM_SORUMLUSU || p.role === PERSONNEL_ROLES.KALIP_TASARIM_YONETICISI), [personnel]);
    const camOperators = useMemo(() => personnel.filter(p => p.role === PERSONNEL_ROLES.CAM_OPERATOR || p.role === PERSONNEL_ROLES.CAM_SORUMLUSU), [personnel]);

    const [activeTab, setActiveTab] = useState('operations'); 

    const [localTrialReportUrl, setLocalTrialReportUrl] = useState('');
    const [localProductImageUrl, setLocalProductImageUrl] = useState(''); 
    const [localProjectManager, setLocalProjectManager] = useState('');
    const [localMoldDesigner, setLocalMoldDesigner] = useState('');
    const [localCamResponsible, setLocalCamResponsible] = useState('');

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
    const [uploadingPdfTaskId, setUploadingPdfTaskId] = useState(null);

    // YENİ: Parça süresi giriş state'leri
    const [taskTimeInputs, setTaskTimeInputs] = useState({}); // { taskId: { h: '', m: '' } }
    const [taskOutsourceInputs, setTaskOutsourceInputs] = useState({}); // { taskId: { outsourced: false, outsourcedFirm: '', outsourcedStatus: 'İşleniyor', outsourcedComment: '' } }

    // YENİ: Parça görsel uyarı state'leri ve operatör onay state'leri
    const [editingWarningId, setEditingWarningId] = useState(null);
    const [warningEditDesc, setWarningEditDesc] = useState('');
    const [uploadingWarningId, setUploadingWarningId] = useState(null);
    const [confirmedWarnings, setConfirmedWarnings] = useState({});
    const [activeWarningTask, setActiveWarningTask] = useState(null); // Kritik uyarıları inceleme modali için

    useEffect(() => {
        if (mold) {
            setLocalTrialReportUrl(mold.trialReportUrl || '');
            setProductImageUrlState(mold.productImageUrl || '');
            setLocalProjectManager(mold.projectManager || '');
            setLocalMoldDesigner(mold.moldDesigner || '');
            setLocalCamResponsible(mold.camResponsible || ''); 
            setLocalDeadline(mold.moldDeadline || '');
            setLocalPriority(mold.priority || '');

            // Mevcut süreleri inputlara yükle
            const initialInputs = {};
            const initialOutsource = {};
            mold.tasks?.forEach(t => {
                const totalMins = Math.round((parseFloat(t.estimatedCamTime) || 0) * 60);
                initialInputs[t.id] = {
                    h: Math.floor(totalMins / 60).toString(),
                    m: (totalMins % 60).toString()
                };
                initialOutsource[t.id] = {
                    outsourced: !!t.outsourced,
                    outsourcedFirm: t.outsourcedFirm || '',
                    outsourcedStatus: t.outsourcedStatus || 'İşleniyor',
                    outsourcedComment: t.outsourcedComment || ''
                };
            });
            setTaskTimeInputs(initialInputs);
            setTaskOutsourceInputs(initialOutsource);
        }
    }, [mold]);

    const setProductImageUrlState = (url) => setLocalProductImageUrl(url);

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
    
    const [, setTick] = useState(0);
    useEffect(() => {
        const interval = setInterval(() => setTick(t => t + 1), 60000); 
        return () => clearInterval(interval);
    }, []);

    const isAdmin = loggedInUser.role === ROLES.ADMIN || loggedInUser.role === ROLES.KALIP_TASARIM_YONETICISI;
    const isManager = loggedInUser.role === ROLES.ADMIN || loggedInUser.role === ROLES.PROJE_SORUMLUSU || loggedInUser.role === ROLES.KALIP_TASARIM_SORUMLUSU || loggedInUser.role === ROLES.KALIP_TASARIM_YONETICISI;
    const canAddOperations = loggedInUser.role === ROLES.ADMIN || 
                             loggedInUser.role === ROLES.KALIP_TASARIM_SORUMLUSU || 
                             loggedInUser.role === ROLES.KALIP_TASARIM_YONETICISI ||
                             loggedInUser.role === ROLES.CAM_OPERATOR ||
                             loggedInUser.role === 'CAM Sorumlusu';
    const canSetCritical = loggedInUser.role === ROLES.ADMIN || loggedInUser.role === ROLES.KALIP_TASARIM_SORUMLUSU || loggedInUser.role === ROLES.KALIP_TASARIM_YONETICISI;
    const canManageDrawings = loggedInUser.role === ROLES.ADMIN || loggedInUser.role === ROLES.PROJE_SORUMLUSU || loggedInUser.role === ROLES.KALIP_TASARIM_SORUMLUSU || loggedInUser.role === ROLES.KALIP_TASARIM_YONETICISI;
    const canManageMaterials = isAdmin || loggedInUser.role === ROLES.GIRIS_KALITE || loggedInUser.role === ROLES.DEPO_SORUMLUSU || loggedInUser.role === ROLES.TAKIMHANE_SORUMLUSU || loggedInUser.role === ROLES.KALIP_TASARIM_SORUMLUSU;

    if (!mold) return <div className="p-8 text-center dark:text-white">Kalıp yükleniyor veya bulunamadı...</div>;

    // --- YENİ: Parça Bazlı Dış Temin Bilgilerini Kaydetme Fonksiyonu ---
    const handleSaveTaskOutsourcing = async (taskId) => {
        const input = taskOutsourceInputs[taskId] || {
            outsourced: false,
            outsourcedFirm: '',
            outsourcedStatus: 'İşleniyor',
            outsourcedComment: ''
        };
        
        try {
            const updatedTasks = mold.tasks.map(t => {
                if (t.id === taskId) {
                    return { 
                        ...t, 
                        outsourced: !!input.outsourced,
                        outsourcedFirm: input.outsourcedFirm || '',
                        outsourcedStatus: input.outsourcedStatus || 'İşleniyor',
                        outsourcedComment: input.outsourcedComment || ''
                    };
                }
                return t;
            });
            const moldRef = doc(db, PROJECT_COLLECTION, mold.id);
            await updateDoc(moldRef, { tasks: updatedTasks });
            alert("Dış temin bilgileri başarıyla güncellendi.");
        } catch (error) {
            console.error("Dış temin kaydetme hatası:", error);
            alert("Kaydedilirken bir hata oluştu.");
        }
    };

    // --- YENİ: Parça Bazlı Tahmini Süreyi Kaydetme Fonksiyonu ---
    const handleSaveTaskEstimatedTime = async (taskId) => {
        const input = taskTimeInputs[taskId] || { h: '0', m: '0' };
        const totalHours = parseFloat(input.h || 0) + (parseFloat(input.m || 0) / 60);
        
        try {
            const updatedTasks = mold.tasks.map(t => {
                if (t.id === taskId) return { ...t, estimatedCamTime: totalHours.toFixed(1) };
                return t;
            });
            const moldRef = doc(db, PROJECT_COLLECTION, mold.id);
            await updateDoc(moldRef, { tasks: updatedTasks });
            alert("Öngörülen süre başarıyla güncellendi.");
        } catch (error) {
            console.error("Süre kaydetme hatası:", error);
            alert("Kaydedilirken bir hata oluştu.");
        }
    };

    const handleDeleteOperation = async (task, operationId) => {
        if (!window.confirm("Bu operasyonu silmek istediğinize emin misiniz? Bu işlem geri alınamaz.")) return;
        try {
            const updatedOperations = task.operations.filter(op => op.id !== operationId);
            const updatedTasks = mold.tasks.map(t => {
                if (t.id === task.id) return { ...t, operations: updatedOperations };
                return t;
            });
            const moldRef = doc(db, PROJECT_COLLECTION, mold.id);
            await updateDoc(moldRef, { tasks: updatedTasks });
        } catch (error) {
            console.error("Operasyon silme hatası:", error);
        }
    };

    const handlePdfUpload = async (e, task) => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.type !== 'application/pdf') return alert("Lütfen sadece PDF dosyası yükleyiniz.");
        if (file.size > 10 * 1024 * 1024) return alert("Dosya boyutu 10MB'dan büyük olamaz.");

        setUploadingPdfTaskId(task.id);
        try {
            const uniqueFileName = `mold_drawings/${mold.id}/${task.id}_${Date.now()}_${file.name}`;
            const storageRef = ref(storage, uniqueFileName);
            await uploadBytes(storageRef, file);
            const downloadURL = await getDownloadURL(storageRef);

            const updatedTasks = mold.tasks.map(t => {
                if (t.id === task.id) return { 
                    ...t, 
                    technicalDrawingUrl: downloadURL,
                    technicalDrawingUploadedAt: new Date().toISOString(),
                    technicalDrawingUploadedBy: loggedInUser?.name || 'Bilinmeyen Kullanıcı'
                };
                return t;
            });
            const moldRef = doc(db, PROJECT_COLLECTION, mold.id);
            await updateDoc(moldRef, { tasks: updatedTasks });
        } catch (error) {
            console.error("PDF yükleme hatası:", error);
        } finally {
            setUploadingPdfTaskId(null);
        }
    };

    const handleDeletePdf = async (task) => {
        if (!window.confirm("Bu teknik resmi silmek istediğinize emin misiniz?")) return;
        try {
            const updatedTasks = mold.tasks.map(t => {
                if (t.id === task.id) {
                    const newTask = { ...t };
                    delete newTask.technicalDrawingUrl;
                    return newTask;
                }
                return t;
            });
            const moldRef = doc(db, PROJECT_COLLECTION, mold.id);
            await updateDoc(moldRef, { tasks: updatedTasks });
        } catch (error) {
            console.error("PDF silme hatası:", error);
        }
    };
    
    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file || !mold.id) return;
        if (file.size > 10 * 1024 * 1024) return alert("Dosya boyutu 10MB'dan büyük olamaz.");

        setIsUploading(true);
        try {
            const uniqueFileName = `mold_images/${mold.id}_${Date.now()}_${file.name}`;
            const storageRef = ref(storage, uniqueFileName);
            await uploadBytes(storageRef, file);
            const downloadURL = await getDownloadURL(storageRef);
            await handleUpdateProductImageUrl(mold.id, downloadURL);
        } catch (error) {
            console.error("Yükleme hatası:", error);
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
            await updateDoc(moldRef, { projectType: newType });
        } catch (error) {
            console.error("Proje tipi güncellenirken hata:", error);
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

    // --- GÖRSEL UYARI YÖNETİM METOTLARI ---
    const handleAddNewWarning = async (taskId) => {
        try {
            const newWarning = {
                id: Date.now().toString(),
                description: 'Yeni Kritik Uyarı Açıklaması',
                imageUrls: []
            };

            const updatedTasks = mold.tasks.map(t => {
                if (t.id === taskId) {
                    const warnings = t.visualWarnings ? [...t.visualWarnings] : [];
                    return { ...t, visualWarnings: [...warnings, newWarning] };
                }
                return t;
            });

            const moldRef = doc(db, PROJECT_COLLECTION, mold.id);
            await updateDoc(moldRef, { tasks: updatedTasks });

            // Otomatik düzenleme moduna al
            setEditingWarningId(newWarning.id);
            setWarningEditDesc(newWarning.description);
        } catch (error) {
            console.error("Uyarı ekleme hatası:", error);
            alert("Uyarı eklenirken hata oluştu.");
        }
    };

    const handleStartWarningEdit = (warning) => {
        setEditingWarningId(warning.id);
        setWarningEditDesc(warning.description || '');
    };

    const handleCancelWarningEdit = () => {
        setEditingWarningId(null);
        setWarningEditDesc('');
    };

    const handleSaveWarningEdit = async (taskId, warningId) => {
        if (!warningEditDesc.trim()) {
            return alert("Açıklama boş bırakılamaz.");
        }
        try {
            const updatedTasks = mold.tasks.map(t => {
                if (t.id === taskId) {
                    const warnings = (t.visualWarnings || []).map(w => {
                        if (w.id === warningId) return { ...w, description: warningEditDesc.trim() };
                        return w;
                    });
                    return { ...t, visualWarnings: warnings };
                }
                return t;
            });

            const moldRef = doc(db, PROJECT_COLLECTION, mold.id);
            await updateDoc(moldRef, { tasks: updatedTasks });

            setEditingWarningId(null);
            setWarningEditDesc('');
        } catch (error) {
            console.error("Uyarı kaydetme hatası:", error);
            alert("Uyarı kaydedilirken hata oluştu.");
        }
    };

    const handleDeleteWarning = async (taskId, warningId) => {
        if (!window.confirm("Bu görsel uyarı maddesini tamamen silmek istediğinize emin misiniz?")) return;
        try {
            const updatedTasks = mold.tasks.map(t => {
                if (t.id === taskId) {
                    const warnings = (t.visualWarnings || []).filter(w => w.id !== warningId);
                    return { ...t, visualWarnings: warnings };
                }
                return t;
            });

            const moldRef = doc(db, PROJECT_COLLECTION, mold.id);
            await updateDoc(moldRef, { tasks: updatedTasks });
        } catch (error) {
            console.error("Uyarı silme hatası:", error);
            alert("Uyarı silinirken hata oluştu.");
        }
    };

    const handleWarningImageUpload = async (e, taskId, warningId) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        setUploadingWarningId(warningId);
        try {
            const newUrls = [];
            for (let file of files) {
                // Resmi sıkıştır (Canvas ile)
                let compressedBlob;
                try {
                    compressedBlob = await compressImage(file);
                } catch (compressErr) {
                    console.error("Görsel sıkıştırma hatası, orijinali yükleniyor:", compressErr);
                    compressedBlob = file;
                }

                const timestamp = Date.now();
                const uniqueFileName = `mold_warning_images/${mold.id}/${taskId}/${warningId}_${timestamp}_${file.name.replace(/\s+/g, '_')}`;
                const storageRef = ref(storage, uniqueFileName);
                await uploadBytes(storageRef, compressedBlob);
                const downloadURL = await getDownloadURL(storageRef);
                newUrls.push(downloadURL);
            }

            const updatedTasks = mold.tasks.map(t => {
                if (t.id === taskId) {
                    const warnings = (t.visualWarnings || []).map(w => {
                        if (w.id === warningId) {
                            const urls = w.imageUrls ? [...w.imageUrls] : [];
                            return { ...w, imageUrls: [...urls, ...newUrls] };
                        }
                        return w;
                    });
                    return { ...t, visualWarnings: warnings };
                }
                return t;
            });

            const moldRef = doc(db, PROJECT_COLLECTION, mold.id);
            await updateDoc(moldRef, { tasks: updatedTasks });
        } catch (error) {
            console.error("Görsel yükleme hatası:", error);
            alert("Görseller yüklenirken hata oluştu.");
        } finally {
            setUploadingWarningId(null);
        }
    };

    const handleDeleteWarningImage = async (taskId, warningId, imageUrl) => {
        if (!window.confirm("Bu görseli silmek istediğinize emin misiniz?")) return;
        try {
            const updatedTasks = mold.tasks.map(t => {
                if (t.id === taskId) {
                    const warnings = (t.visualWarnings || []).map(w => {
                        if (w.id === warningId) {
                            const urls = (w.imageUrls || []).filter(url => url !== imageUrl);
                            return { ...w, imageUrls: urls };
                        }
                        return w;
                    });
                    return { ...t, visualWarnings: warnings };
                }
                return t;
            });

            const moldRef = doc(db, PROJECT_COLLECTION, mold.id);
            await updateDoc(moldRef, { tasks: updatedTasks });
        } catch (error) {
            console.error("Görsel silme hatası:", error);
            alert("Görsel silinirken hata oluştu.");
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

    const handleCamResponsibleChange = (e) => {
        const newResponsible = e.target.value;
        setLocalCamResponsible(newResponsible);
        if(handleUpdateCamResponsible) {
            handleUpdateCamResponsible(mold.id, newResponsible);
        }
    };

    const handleOpenModal = (type, mold, task, operation) => {
        if (type === 'assign') {
            const hasVisualWarnings = task?.visualWarnings && task.visualWarnings.some(w => w.imageUrls && w.imageUrls.length > 0);
            if (hasVisualWarnings && !confirmedWarnings[task.id]) {
                setActiveWarningTask({ mold, task, operation });
                return;
            }
        }
        setModalState({ isOpen: true, type, data: { mold, task, operation } });
    };

    const handleConfirmWarnings = () => {
        if (!activeWarningTask) return;
        const { mold, task, operation } = activeWarningTask;
        setConfirmedWarnings(prev => ({ ...prev, [task.id]: true }));
        setActiveWarningTask(null);
        setModalState({ isOpen: true, type: 'assign', data: { mold, task, operation } });
    };

    const handleCloseWarningModal = () => {
        setActiveWarningTask(null);
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
        
        if (type === 'assign' && (loggedInUser.role === ROLES.CAM_OPERATOR || loggedInUser.role === ROLES.CAM_SORUMLUSU) && (operation.status === OPERATION_STATUS.NOT_STARTED || operation.status === OPERATION_STATUS.PAUSED)) {
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
        <div className="p-4 bg-white dark:bg-gray-800 rounded-xl shadow-xl relative min-h-screen">
            {/* Sabitlenen (Sticky) Başlık ve Bilgi Alanı */}
            <div className="sticky top-0 bg-white dark:bg-gray-800 z-30 pb-3 border-b border-gray-200 dark:border-gray-700 pt-1 relative shadow-sm mb-6 min-h-[148px]">
                <button 
                    onClick={() => navigate('/')} 
                    className="mb-2 text-blue-600 dark:text-blue-400 hover:underline flex items-center text-xs font-bold"
                >
                    &larr; Kalıp Listesine Geri Dön
                </button>
                
                {/* Sağ Üst Hızlı İşlem Butonları ve Resim Kutusu */}
                <div className="absolute top-0 right-0 flex items-center gap-2">
                    <button 
                        onClick={() => setIs3DModalOpen(true)}
                        className="flex items-center px-3 py-1.5 text-xs font-bold text-white bg-gradient-to-r from-blue-600 to-cyan-500 rounded-lg hover:from-blue-700 hover:to-cyan-600 transition shadow-md transform hover:scale-105" 
                        title="3D Model Görüntüle"
                    >
                        <Box className="w-4 h-4 mr-1.5" /> 3D
                    </button>

                    {mold.trialReportUrl && (
                        <a href={mold.trialReportUrl} target="_blank" rel="noopener noreferrer" className="flex items-center px-3 py-1.5 text-xs font-bold text-green-700 dark:text-green-300 bg-green-100 dark:bg-green-900/40 rounded-lg hover:bg-green-200 dark:hover:bg-green-800 transition">
                            <FileText className="w-4 h-4 mr-1.5" /> Rapor
                        </a>
                    )}
                    
                    <button onClick={openNoteModal} className="flex items-center px-3 py-1.5 text-xs font-bold text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/40 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-800 transition" title="Kalıp Notları">
                        <StickyNote className="w-4 h-4 mr-1.5" /> Notlar
                    </button>

                    {/* Ürün Resim Kutucuğu */}
                    {mold.productImageUrl && (
                        <div 
                            onClick={() => setPreviewImage(mold.productImageUrl)}
                            className="w-32 h-32 rounded-lg border-2 border-purple-500 overflow-hidden cursor-pointer hover:scale-105 transition-all shadow-md bg-gray-100 dark:bg-gray-700 relative group shrink-0 ml-1"
                            title="Resmi Büyütmek İçin Tıklayın"
                        >
                            <img src={mold.productImageUrl} alt="Kalıp Ürün Görseli" className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-black/45 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                <Eye className="w-6 h-6 text-white" />
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex items-center mb-3 pr-0 md:pr-[360px]">
                    {prevMoldId && (
                        <button 
                            onClick={() => navigate(`/mold/${prevMoldId}`)} 
                            className="mr-3 p-1 bg-gray-100 dark:bg-gray-700 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600 transition text-gray-600 dark:text-gray-300 shrink-0"
                            title="Önceki Kalıp"
                        >
                            <ChevronLeft className="w-5 h-5" />
                        </button>
                    )}
                    <h2 className="text-xl font-black text-gray-900 dark:text-white truncate">{mold.moldName} Kalıp Detayları</h2>
                    {nextMoldId && (
                        <button 
                            onClick={() => navigate(`/mold/${nextMoldId}`)} 
                            className="ml-3 p-1 bg-gray-100 dark:bg-gray-700 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600 transition text-gray-600 dark:text-gray-300 shrink-0"
                            title="Sonraki Kalıp"
                        >
                            <ChevronRight className="w-5 h-5" />
                        </button>
                    )}
                </div>
                
                <div className="text-gray-600 dark:text-gray-400 flex flex-wrap items-center gap-3 text-xs font-semibold">
                    <div className="flex items-center">
                        <span className="mr-1.5 font-bold">Tür:</span>
                        {isAdmin ? (
                            <select 
                                value={mold.projectType || PROJECT_TYPES.NEW_MOLD} 
                                onChange={handleProjectTypeChange}
                                className="px-2 py-0.5 rounded text-xs font-bold border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 dark:text-white"
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

                    <div className="h-4 w-px bg-gray-300 dark:bg-gray-600 mx-1"></div>

                    <div>
                        <span>Müşteri: <span className="font-bold text-gray-800 dark:text-gray-200">{mold.customer}</span> | Durum:</span>
                        {isAdmin ? (
                            <select value={mold.status || MOLD_STATUS.WAITING} onChange={onStatusChange} className={`ml-1.5 px-2 py-0.5 rounded text-[11px] font-bold appearance-none border border-gray-300 dark:border-gray-600 focus:outline-none ${getStatusClasses(mold.status || MOLD_STATUS.WAITING)}`}>
                               {Object.values(MOLD_STATUS).map(status => <option key={status} value={status}>{status}</option>)}
                            </select>
                        ) : (
                            <span className={`ml-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold ${getStatusClasses(mold.status || MOLD_STATUS.WAITING)}`}>
                                {mold.status || MOLD_STATUS.WAITING}
                            </span>
                        )}
                    </div>

                    <div className="h-4 w-px bg-gray-300 dark:bg-gray-600 mx-1"></div>

                    {isManager ? (
                        <div className="flex items-center gap-1.5">
                            <span className="font-bold">Termin:</span>
                            <input type="date" id="moldDeadline" value={localDeadline} onChange={onDeadlineChange} className="px-2 py-0.5 rounded text-xs font-bold border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 focus:outline-none" />
                        </div>
                    ) : (
                        mold.moldDeadline && <span className="text-xs">Termin: <span className="font-bold text-gray-800 dark:text-gray-200">{formatDate(mold.moldDeadline)}</span></span>
                    )}

                    <div className="h-4 w-px bg-gray-300 dark:bg-gray-600 mx-1"></div>

                    {isManager && (
                         <div className="flex items-center gap-1.5">
                            <span className="font-bold">Aciliyet:</span>
                            <input type="number" id="moldPriority" value={localPriority === null ? '' : localPriority} onChange={onPriorityChange} min="1" placeholder="Sıra" className="w-12 px-2 py-0.5 rounded text-xs font-bold border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 focus:outline-none" />
                        </div>
                    )}
                </div>
            </div>
             
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6 border-t dark:border-gray-700 pt-4">
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

                {isAdmin ? (
                    <div className="flex items-center gap-2">
                        <label htmlFor="camResponsible" className="text-sm font-medium whitespace-nowrap text-gray-700 dark:text-gray-300">CAM Sorumlusu:</label>
                        <select id="camResponsible" value={localCamResponsible} onChange={handleCamResponsibleChange} className="w-full px-3 py-1 rounded-lg text-xs font-semibold appearance-none border-2 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200">
                            <option value="">Seçiniz...</option>
                            {camOperators.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                        </select>
                    </div>
                ) : (
                    mold.camResponsible && <p className="text-sm dark:text-gray-300">CAM Sor.: <span className="font-semibold dark:text-white">{mold.camResponsible}</span></p>
                )}
                
                {isManager && (
                    <div className="flex items-center gap-2 w-full lg:col-span-3">
                        <label htmlFor="trialReportUrl" className="text-sm font-medium whitespace-nowrap text-gray-700 dark:text-gray-300">Deneme Raporu Linki:</label>
                        <input type="text" id="trialReportUrl" value={localTrialReportUrl} onChange={(e) => setLocalTrialReportUrl(e.target.value)} onBlur={handleReportUrlBlur} placeholder="E-Tablo linkini buraya yapıştırın..." className="w-full px-3 py-1 rounded-lg text-xs font-semibold appearance-none border-2 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200" />
                    </div>
                )}

                {isManager && (
                    <div className="w-full border-t lg:col-span-3 dark:border-gray-700 pt-4 mt-2">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Ürün Görseli</label>
                        
                        <div className="flex items-center gap-2">
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
                        
                        <p className="text-[10px] text-gray-400 mt-1">
                            {mold.productImageUrl ? "✅ Görsel yüklü. Değiştirmek için yeni dosya seçin." : "⚠️ Henüz görsel yüklenmemiş."}
                        </p>
                    </div>
                )}
            </div>

            {/* --- TAB MENÜSÜ --- */}
            <div className="flex border-b border-gray-200 dark:border-gray-700 mb-6">
                <button 
                    onClick={() => setActiveTab('operations')}
                    className={`px-4 py-3 text-sm font-bold border-b-2 flex items-center transition-colors ${activeTab === 'operations' ? 'border-blue-600 text-blue-600 dark:text-blue-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'}`}
                >
                    <Layers className="w-4 h-4 mr-2" /> İş Parçaları ve Operasyonlar
                </button>
                <button 
                    onClick={() => setActiveTab('materials')}
                    className={`px-4 py-3 text-sm font-bold border-b-2 flex items-center transition-colors ${activeTab === 'materials' ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'}`}
                >
                    <ListChecks className="w-4 h-4 mr-2" /> Malzeme & Çelik Check-List
                </button>
            </div>

            {/* TAB İÇERİĞİ: OPERASYONLAR */}
            {activeTab === 'operations' && (
                <>
                    <div className="flex justify-between items-center mb-3">
                        <h3 className="text-xl font-semibold text-gray-900 dark:text-white">İş Parçaları</h3>
                        <button 
                            onClick={() => navigate(`/cam-job-entry?moldId=${mold.id}`)}
                            className="flex items-center px-4 py-2 text-xs font-black text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition shadow-md active:scale-95 transform hover:-translate-y-0.5"
                            title="Yeni Parça Ekle / Düzenle"
                        >
                            <Plus className="w-4 h-4 mr-1.5" /> PARÇA EKLE / DÜZENLE
                        </button>
                    </div>
                    <div className="space-y-1">
                        <div className="hidden md:grid grid-cols-12 gap-4 px-4 py-2 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase rounded-t-lg bg-gray-100 dark:bg-gray-700">
                            <div className="col-span-3">Parça Adı</div>
                            <div className="col-span-2">Durum</div>
                            <div className="col-span-2">Aktif Operasyon</div> 
                            <div className="col-span-2">Aktif Operatör</div>
                            <div className="col-span-2 text-center">İlerleme</div>
                            <div className="col-span-1 text-right">Detay</div>
                        </div>

                        {(!mold.tasks || mold.tasks.length === 0) ? (
                            <p className="text-gray-500 dark:text-gray-400 p-4">Bu kalıba atanmış alt parça bulunmamaktadır.</p>
                        ) : (
                            mold.tasks.map(task => {
                                const summary = getTaskSummary(task.operations, task);
                                const isExpanded = !!expandedTasks[task.id];
                                const isCritical = task.isCritical;
                                const hasVisualWarnings = task.visualWarnings && task.visualWarnings.some(w => w.imageUrls && w.imageUrls.length > 0);

                                return (
                                    <div key={task.id} className={`border ${isCritical || hasVisualWarnings ? 'border-red-400 dark:border-red-800 bg-red-50/20 dark:bg-red-950/5' : 'border-gray-200 dark:border-gray-700'} overflow-hidden first:rounded-t-lg last:rounded-b-lg shadow-sm`}>
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
                                                {hasVisualWarnings && (
                                                    <span className="ml-2 flex items-center text-[10px] bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 px-2 py-0.5 rounded-full font-extrabold border border-red-300 dark:border-red-800 animate-pulse" title="Görsel Kritik Uyarı Yüklü!">
                                                        <AlertTriangle className="w-3 h-3 mr-1 text-red-650" />
                                                        GÖRSEL UYARI
                                                    </span>
                                                )}
                                            {task.technicalDrawingUrl && (
                                                <span className="ml-2 flex items-center text-[10px] bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 px-2 py-0.5 rounded-full" title="Teknik Resim Yüklü">
                                                    <FileText className="w-3 h-3 mr-1" />
                                                    T.RESİM
                                                </span>
                                            )}
                                                {/* TOPLAM TAHMİNİ SÜRE GÖSTERİMİ */}
                                                {task.estimatedCamTime > 0 && (
                                                    <span className="ml-2 flex items-center text-[10px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full" title="Öngörülen İşleme Süresi">
                                                        <Timer className="w-3 h-3 mr-1" />
                                                        {task.estimatedCamTime}s
                                                    </span>
                                                )}
                                                {task.outsourced && (
                                                    <span className={`ml-2 inline-flex items-center text-[10px] px-2 py-0.5 rounded-full font-bold ${task.outsourcedStatus === 'Tamamlandı' ? 'bg-green-150 text-green-800 border border-green-300' : 'bg-amber-100 text-amber-800 animate-pulse border border-amber-300'}`} title={`Firma: ${task.outsourcedFirm || 'Belirtilmedi'} ${task.outsourcedComment ? `- Not: ${task.outsourcedComment}` : ''}`}>
                                                        Dış Temin: {task.outsourcedFirm || 'Bilinmiyor'} ({task.outsourcedStatus || 'İşleniyor'})
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

                                                {/* PARÇA GÖRSEL UYARILARI & AÇIKLAMALARI */}
                                                <div className="mb-4 bg-red-50/30 dark:bg-red-950/5 p-4 rounded-xl border border-red-100 dark:border-red-900/30">
                                                    <div className="flex items-center justify-between mb-3 border-b border-red-100 dark:border-red-900/20 pb-2">
                                                        <div className="flex items-center">
                                                            <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 mr-2" />
                                                            <span className="text-sm font-bold text-gray-800 dark:text-gray-200">Parça Görsel Uyarıları & Kritik Açıklamalar:</span>
                                                        </div>
                                                        {isManager && (
                                                            <button 
                                                                onClick={() => handleAddNewWarning(task.id)}
                                                                className="flex items-center px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-xs font-black rounded-lg transition shadow-sm"
                                                            >
                                                                <Plus className="w-3 h-3 mr-1" /> UYARI EKLE
                                                            </button>
                                                        )}
                                                    </div>

                                                    {/* Uyarı Maddeleri Listesi */}
                                                    <div className="space-y-4">
                                                        {(!task.visualWarnings || task.visualWarnings.length === 0) ? (
                                                            <p className="text-xs text-gray-500 italic">Bu parça için henüz eklenmiş görsel bir uyarı bulunmuyor.</p>
                                                        ) : (
                                                            task.visualWarnings.map((warning, wIdx) => (
                                                                <div key={warning.id || wIdx} className="bg-white dark:bg-gray-800 p-3 rounded-lg border border-red-100 dark:border-red-900/20 space-y-3 relative group">
                                                                    {/* Başlık ve İşlemler */}
                                                                    <div className="flex justify-between items-start">
                                                                        <div className="flex-1 mr-4">
                                                                            {editingWarningId === warning.id ? (
                                                                                <textarea 
                                                                                    value={warningEditDesc}
                                                                                    onChange={(e) => setWarningEditDesc(e.target.value)}
                                                                                    className="w-full p-2 text-sm border rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white border-gray-300 dark:border-gray-600 focus:outline-none"
                                                                                    placeholder="Kritik uyarı veya açıklamayı yazın..."
                                                                                    rows="2"
                                                                                />
                                                                            ) : (
                                                                                <p className="text-sm font-semibold text-gray-700 dark:text-gray-200 whitespace-pre-line">
                                                                                    <span className="text-red-600 mr-1.5">⚠️ Madde {wIdx + 1}:</span>
                                                                                    {warning.description || 'Açıklama belirtilmedi.'}
                                                                                </p>
                                                                            )}
                                                                        </div>

                                                                        {isManager && (
                                                                            <div className="flex gap-1">
                                                                                {editingWarningId === warning.id ? (
                                                                                    <>
                                                                                        <button 
                                                                                            onClick={() => handleSaveWarningEdit(task.id, warning.id)}
                                                                                            className="px-2 py-1 bg-green-600 hover:bg-green-700 text-white text-[10px] font-bold rounded"
                                                                                        >
                                                                                            Kaydet
                                                                                        </button>
                                                                                        <button 
                                                                                            onClick={handleCancelWarningEdit}
                                                                                            className="px-2 py-1 bg-gray-400 hover:bg-gray-500 text-white text-[10px] font-bold rounded"
                                                                                        >
                                                                                            İptal
                                                                                        </button>
                                                                                    </>
                                                                                ) : (
                                                                                    <>
                                                                                        <button 
                                                                                            onClick={() => handleStartWarningEdit(warning)}
                                                                                            className="p-1 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded"
                                                                                            title="Açıklamayı Düzenle"
                                                                                        >
                                                                                            <FileText className="w-3.5 h-3.5" />
                                                                                        </button>
                                                                                        <button 
                                                                                            onClick={() => handleDeleteWarning(task.id, warning.id)}
                                                                                            className="p-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded"
                                                                                            title="Uyarıyı Tamamen Sil"
                                                                                        >
                                                                                            <Trash2 className="w-3.5 h-3.5" />
                                                                                        </button>
                                                                                    </>
                                                                                )}
                                                                            </div>
                                                                        )}
                                                                    </div>

                                                                    {/* Görseller */}
                                                                    <div className="flex flex-wrap items-center gap-3 pt-1">
                                                                        {warning.imageUrls && warning.imageUrls.map((url, imgIdx) => (
                                                                            <div key={imgIdx} className="relative w-20 h-20 rounded border border-gray-200 dark:border-gray-700 overflow-hidden group/img">
                                                                                <img src={url} alt="Uyarı Görseli" className="w-full h-full object-cover cursor-pointer" onClick={() => setPreviewImage(url)} />
                                                                                {isManager && (
                                                                                    <button 
                                                                                        onClick={() => handleDeleteWarningImage(task.id, warning.id, url)}
                                                                                        className="absolute top-0 right-0 bg-red-600 text-white p-0.5 rounded-bl hover:bg-red-700 opacity-0 group-hover/img:opacity-100 transition-opacity"
                                                                                        title="Görseli Sil"
                                                                                    >
                                                                                        <Trash2 className="w-3.5 h-3.5" />
                                                                                    </button>
                                                                                )}
                                                                            </div>
                                                                        ))}

                                                                        {/* Resim Yükleme Butonu */}
                                                                        {isManager && (
                                                                            <label className={`w-20 h-20 flex flex-col items-center justify-center border-2 border-dashed border-red-300 dark:border-red-800 rounded cursor-pointer hover:bg-red-50 dark:hover:bg-red-950/10 transition ${uploadingWarningId === warning.id ? 'opacity-50 cursor-not-allowed' : ''}`}>
                                                                                {uploadingWarningId === warning.id ? (
                                                                                    <Loader className="w-4 h-4 animate-spin text-red-600" />
                                                                                ) : (
                                                                                    <>
                                                                                        <UploadCloud className="w-5 h-5 text-red-500" />
                                                                                        <span className="text-[9px] font-bold text-red-500 mt-1">Görsel Ekle</span>
                                                                                    </>
                                                                                )}
                                                                                <input 
                                                                                    type="file" 
                                                                                    className="hidden" 
                                                                                    accept="image/*"
                                                                                    multiple
                                                                                    onChange={(e) => handleWarningImageUpload(e, task.id, warning.id)}
                                                                                    disabled={uploadingWarningId === warning.id}
                                                                                />
                                                                            </label>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            ))
                                                        )}
                                                    </div>
                                                </div>

                                                {/* YENİ: PARÇA BAZLI TAHMİNİ SÜRE GİRİŞ ALANI */}
                                                <div className="mb-4 bg-indigo-50 dark:bg-indigo-900/20 p-4 rounded-xl border border-indigo-100 dark:border-indigo-800/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
                                                    <div className="flex items-center">
                                                        <Timer className="w-5 h-5 text-indigo-600 dark:text-indigo-400 mr-2" />
                                                        <span className="text-sm font-bold text-gray-800 dark:text-gray-200">Öngörülen CAM İşleme Süresi:</span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <div className="flex items-center gap-1">
                                                            <input 
                                                                type="number" 
                                                                placeholder="Saat" 
                                                                className="w-16 p-2 text-center border rounded-lg dark:bg-gray-700 dark:text-white text-sm font-bold"
                                                                value={taskTimeInputs[task.id]?.h || ''}
                                                                onChange={(e) => setTaskTimeInputs({
                                                                    ...taskTimeInputs,
                                                                    [task.id]: { ...taskTimeInputs[task.id], h: e.target.value }
                                                                })}
                                                            />
                                                            <span className="text-xs text-gray-500 font-bold uppercase">S</span>
                                                        </div>
                                                        <div className="flex items-center gap-1">
                                                            <input 
                                                                type="number" 
                                                                placeholder="Dk" 
                                                                max="59"
                                                                className="w-16 p-2 text-center border rounded-lg dark:bg-gray-700 dark:text-white text-sm font-bold"
                                                                value={taskTimeInputs[task.id]?.m || ''}
                                                                onChange={(e) => setTaskTimeInputs({
                                                                    ...taskTimeInputs,
                                                                    [task.id]: { ...taskTimeInputs[task.id], m: e.target.value }
                                                                })}
                                                            />
                                                            <span className="text-xs text-gray-500 font-bold uppercase">D</span>
                                                        </div>
                                                        <button 
                                                            onClick={() => handleSaveTaskEstimatedTime(task.id)}
                                                            className="ml-2 flex items-center px-4 py-2 bg-indigo-600 text-white text-xs font-black rounded-lg hover:bg-indigo-700 transition shadow-sm"
                                                        >
                                                            <Check className="w-3 h-3 mr-1" /> SÜREYİ GÜNCELLE
                                                        </button>
                                                    </div>
                                                </div>

                                                <div className="mb-4 flex items-center justify-between bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg border border-blue-100 dark:border-blue-800">
                                                    <div className="flex items-center">
                                                        <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400 mr-2" />
                                                        <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Teknik Resim:</span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        {task.technicalDrawingUrl ? (
                                                            <>
                                                                <a 
                                                                    href={task.technicalDrawingUrl} 
                                                                    target="_blank" 
                                                                    rel="noopener noreferrer"
                                                                    className="flex items-center px-3 py-1.5 bg-blue-600 text-white text-xs font-bold rounded hover:bg-blue-700 transition"
                                                                >
                                                                    <Eye className="w-3 h-3 mr-1" /> Görüntüle / İndir
                                                                </a>
                                                                {canManageDrawings && (
                                                                    <button 
                                                                        onClick={() => handleDeletePdf(task)}
                                                                        className="p-1.5 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition"
                                                                        title="Resmi Sil"
                                                                    >
                                                                        <Trash2 className="w-4 h-4" />
                                                                    </button>
                                                                )}
                                                            </>
                                                        ) : (
                                                            <span className="text-xs text-gray-500 italic">Yüklü değil</span>
                                                        )}

                                                        {canManageDrawings && !task.technicalDrawingUrl && (
                                                            <label className={`cursor-pointer flex items-center px-3 py-1.5 bg-green-600 text-white text-xs font-bold rounded hover:bg-green-700 transition ${uploadingPdfTaskId === task.id ? 'opacity-50 cursor-not-allowed' : ''}`}>
                                                                {uploadingPdfTaskId === task.id ? <Loader className="w-3 h-3 mr-1 animate-spin" /> : <UploadCloud className="w-3 h-3 mr-1" />}
                                                                {uploadingPdfTaskId === task.id ? 'Yükleniyor...' : 'Yükle'}
                                                                <input 
                                                                    type="file" 
                                                                    className="hidden" 
                                                                    accept="application/pdf" 
                                                                    onChange={(e) => handlePdfUpload(e, task)}
                                                                    disabled={uploadingPdfTaskId === task.id}
                                                                />
                                                            </label>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* YENİ: DIŞ TEMİN BİLGİLERİ ALANI */}
                                                <div className="mb-4 bg-orange-50 dark:bg-orange-950/20 p-4 rounded-xl border border-orange-100 dark:border-orange-900/50">
                                                    <div className="flex items-center justify-between mb-3">
                                                        <div className="flex items-center">
                                                            <Layers className="w-5 h-5 text-orange-600 dark:text-orange-400 mr-2" />
                                                            <span className="text-sm font-bold text-gray-800 dark:text-gray-200">Dış Temin / Fason İşlem Bilgisi:</span>
                                                        </div>
                                                        {task.outsourced && (
                                                            <span className={`px-2 py-0.5 text-xs font-black rounded-full ${task.outsourcedStatus === 'Tamamlandı' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800 animate-pulse'}`}>
                                                                {task.outsourcedStatus || 'İşleniyor'}
                                                            </span>
                                                        )}
                                                    </div>

                                                    {isManager ? (
                                                        <div className="space-y-3">
                                                            <div className="flex items-center gap-2 mb-2">
                                                                <input 
                                                                    type="checkbox"
                                                                    id={`outsourced-${task.id}`}
                                                                    className="w-4 h-4 text-orange-600 border-gray-300 rounded focus:ring-orange-500"
                                                                    checked={taskOutsourceInputs[task.id]?.outsourced || false}
                                                                    onChange={(e) => setTaskOutsourceInputs({
                                                                        ...taskOutsourceInputs,
                                                                        [task.id]: { ...taskOutsourceInputs[task.id], outsourced: e.target.checked }
                                                                    })}
                                                                />
                                                                <label htmlFor={`outsourced-${task.id}`} className="text-sm font-semibold text-gray-700 dark:text-gray-300 cursor-pointer">
                                                                    Bu parça dışarıdan temin ediliyor / dışarıda işleniyor
                                                                </label>
                                                            </div>

                                                            {(taskOutsourceInputs[task.id]?.outsourced) && (
                                                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
                                                                    <div>
                                                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Firma Adı:</label>
                                                                        <input 
                                                                            type="text"
                                                                            placeholder="Örn: A Firması, Lazer Kesim vb."
                                                                            className="w-full p-2 border rounded-lg dark:bg-gray-700 dark:text-white text-sm"
                                                                            value={taskOutsourceInputs[task.id]?.outsourcedFirm || ''}
                                                                            onChange={(e) => setTaskOutsourceInputs({
                                                                                ...taskOutsourceInputs,
                                                                                [task.id]: { ...taskOutsourceInputs[task.id], outsourcedFirm: e.target.value }
                                                                            })}
                                                                        />
                                                                    </div>
                                                                    <div>
                                                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Durum:</label>
                                                                        <select 
                                                                            className="w-full p-2 border rounded-lg dark:bg-gray-700 dark:text-white text-sm"
                                                                            value={taskOutsourceInputs[task.id]?.outsourcedStatus || 'İşleniyor'}
                                                                            onChange={(e) => setTaskOutsourceInputs({
                                                                                ...taskOutsourceInputs,
                                                                                [task.id]: { ...taskOutsourceInputs[task.id], outsourcedStatus: e.target.value }
                                                                            })}
                                                                        >
                                                                            <option value="İşleniyor">Dışarıda İşleniyor</option>
                                                                            <option value="Tamamlandı">Tamamlandı</option>
                                                                        </select>
                                                                    </div>
                                                                    <div>
                                                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Açıklama / Detaylar:</label>
                                                                        <input 
                                                                            type="text"
                                                                            placeholder="Örn: A firması tamamladı, vb."
                                                                            className="w-full p-2 border rounded-lg dark:bg-gray-700 dark:text-white text-sm"
                                                                            value={taskOutsourceInputs[task.id]?.outsourcedComment || ''}
                                                                            onChange={(e) => setTaskOutsourceInputs({
                                                                                ...taskOutsourceInputs,
                                                                                [task.id]: { ...taskOutsourceInputs[task.id], outsourcedComment: e.target.value }
                                                                            })}
                                                                        />
                                                                    </div>
                                                                </div>
                                                            )}

                                                            <div className="flex justify-end pt-2">
                                                                <button 
                                                                    onClick={() => handleSaveTaskOutsourcing(task.id)}
                                                                    className="flex items-center px-4 py-2 bg-orange-600 text-white text-xs font-black rounded-lg hover:bg-orange-700 transition shadow-sm"
                                                                >
                                                                    <Check className="w-3 h-3 mr-1" /> BİLGİLERİ GÜNCELLE
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div>
                                                            {task.outsourced ? (
                                                                <div className="bg-white dark:bg-gray-800 p-3 rounded-lg border border-orange-100 dark:border-orange-900/30 text-sm space-y-1">
                                                                    <p className="text-gray-700 dark:text-gray-300">
                                                                        <span className="font-bold">Firma / Süreç:</span> {task.outsourcedFirm || 'Belirtilmedi'}
                                                                    </p>
                                                                    <p className="text-gray-700 dark:text-gray-300">
                                                                        <span className="font-bold">Durum:</span> {task.outsourcedStatus || 'İşleniyor'}
                                                                    </p>
                                                                    {task.outsourcedComment && (
                                                                        <p className="text-gray-700 dark:text-gray-300">
                                                                            <span className="font-bold">Açıklama / Detaylar:</span> <span className="italic">"{task.outsourcedComment}"</span>
                                                                        </p>
                                                                    )}
                                                                </div>
                                                            ) : (
                                                                <span className="text-xs text-gray-500 italic">Bu parça dışarıda işlem görmüyor (kendi bünyemizde üretiliyor).</span>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="space-y-3">
                                                    {(task.operations || []).map(operation => {
                                                        const hasPauseHistory = (operation.pauseHistory && operation.pauseHistory.length > 0) || operation.lastPausedAt;

                                                        return (
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
                                                                            {isAdmin && (
                                                                                <button 
                                                                                    onClick={() => handleDeleteOperation(task, operation.id)} 
                                                                                    className="px-3 py-1 bg-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-300 transition flex items-center justify-center"
                                                                                    title="Operasyonu Sil"
                                                                                >
                                                                                    <Trash2 className="w-4 h-4" />
                                                                                </button>
                                                                            )}
                                                                            
                                                                            {(loggedInUser.role === ROLES.CAM_OPERATOR || loggedInUser.role === ROLES.CAM_SORUMLUSU) && operation.status === OPERATION_STATUS.NOT_STARTED && (
                                                                                <button onClick={() => handleOpenModal('assign', mold, task, operation)} className="px-3 py-1 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition flex items-center justify-center"><Zap className="w-4 h-4 mr-1"/> Ata</button>
                                                                            )}
                                                                            
                                                                            {(loggedInUser.role === ROLES.CAM_OPERATOR || loggedInUser.role === ROLES.CAM_SORUMLUSU) && operation.status === OPERATION_STATUS.PAUSED && (
                                                                                <button onClick={() => handleOpenModal('assign', mold, task, operation)} className="px-3 py-1 bg-orange-500 text-white text-sm font-medium rounded-lg hover:bg-orange-600 transition flex items-center justify-center"><PlayCircle className="w-4 h-4 mr-1"/> Devam Et</button>
                                                                            )}
                                                                            
                                                                            {(loggedInUser.role === ROLES.SUPERVISOR || isAdmin) && operation.status === OPERATION_STATUS.WAITING_SUPERVISOR_REVIEW && (
                                                                                <button onClick={() => handleOpenModal('review', mold, task, operation)} className="px-3 py-1 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 transition flex items-center justify-center"><CheckCircle className="w-4 h-4 mr-1"/> Değerlendir</button>
                                                                            )}
                                                                            
                                                                            {(loggedInUser.role === ROLES.CAM_OPERATOR || loggedInUser.role === ROLES.CAM_SORUMLUSU || isAdmin) && 
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

                                                                {hasPauseHistory && (
                                                                    <div className="mt-3 pt-3 border-t border-orange-100 dark:border-orange-900/30">
                                                                        <p className="text-xs font-bold text-orange-800 dark:text-orange-300 mb-2 flex items-center">
                                                                            <Clock className="w-3 h-3 mr-1" /> 
                                                                            Duraklatma Geçmişi (Toplam Bekleme: {calculateTotalPauseDuration(operation.pauseHistory, operation.lastPausedAt)})
                                                                        </p>
                                                                        <div className="space-y-2">
                                                                            {operation.pauseHistory && operation.pauseHistory.map((ph, idx) => (
                                                                                <div key={idx} className="bg-orange-50 dark:bg-orange-900/10 p-2 rounded text-xs border border-orange-100 dark:border-orange-900/30">
                                                                                    <div className="flex justify-between text-orange-800 dark:text-orange-400 font-medium">
                                                                                        <span>{formatDateTime(ph.pausedAt)} - {formatDateTime(ph.resumedAt)}</span>
                                                                                        <span className="font-bold">{calculateDurationText(ph.pausedAt, ph.resumedAt)}</span>
                                                                                    </div>
                                                                                    <div className="mt-1 text-orange-600 dark:text-orange-300 flex items-start">
                                                                                        <HelpCircle className="w-3 h-3 mr-1 mt-0.5 flex-shrink-0" />
                                                                                        <span className="italic">Neden: {getPauseReasonText(ph.reason)}</span>
                                                                                    </div>
                                                                                </div>
                                                                            ))}
                                                                            {operation.lastPausedAt && (
                                                                                <div className="bg-orange-100 dark:bg-orange-900/20 p-2 rounded text-xs border border-orange-300 dark:border-orange-700 animate-pulse-slow">
                                                                                    <div className="flex justify-between text-orange-800 dark:text-orange-300 font-medium">
                                                                                        <span>{formatDateTime(operation.lastPausedAt)} - Şu an devam ediyor...</span>
                                                                                        <span className="font-bold text-red-600 dark:text-red-400">{calculateDurationText(operation.lastPausedAt, null)}</span>
                                                                                    </div>
                                                                                    <div className="mt-1 text-orange-700 dark:text-orange-400 flex items-start font-medium">
                                                                                        <HelpCircle className="w-3 h-3 mr-1 mt-0.5 flex-shrink-0" />
                                                                                        <span className="italic">Neden: {getPauseReasonText(operation.lastPauseReason)}</span>
                                                                                    </div>
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                )}
                                                                
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )
                            })
                        )}
                    </div>
                </>
            )}

            {activeTab === 'materials' && (
                <MaterialChecklistTab 
                    mold={mold} 
                    materials={mold.materials || []} 
                    canManageMaterials={canManageMaterials} 
                    loggedInUser={loggedInUser} 
                    db={db} 
                />
            )}

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

            {activeWarningTask && (
                <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-[100] p-4 backdrop-blur-sm animate-in fade-in zoom-in duration-200">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col max-h-[90vh]">
                        {/* Modal Başlığı */}
                        <div className="p-5 border-b border-gray-200 dark:border-gray-700 bg-red-50 dark:bg-red-950/20 flex items-center justify-between">
                            <h3 className="text-lg font-bold text-red-700 dark:text-red-400 flex items-center gap-2">
                                <AlertTriangle className="w-6 h-6 text-red-600 animate-pulse" />
                                DİKKAT: Kritik Parça Görsel Uyarıları
                            </h3>
                            <button 
                                onClick={handleCloseWarningModal}
                                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                            >
                                <XCircle className="w-6 h-6" />
                            </button>
                        </div>

                        {/* Modal İçeriği */}
                        <div className="p-6 overflow-y-auto space-y-6 flex-1">
                            <div className="bg-amber-50 dark:bg-amber-950/20 p-4 rounded-xl border border-amber-100 dark:border-amber-900/40 text-sm text-amber-800 dark:text-amber-300">
                                <strong>Önemli Açıklama:</strong> Bu parçaya ait kritik görsel uyarılar bulunmaktadır. Lütfen aşağıdaki tüm uyarıları ve resimleri dikkatlice inceleyin.
                            </div>

                            <div className="space-y-4">
                                {activeWarningTask.task.visualWarnings && activeWarningTask.task.visualWarnings.map((warning, wIdx) => (
                                    <div key={warning.id || wIdx} className="p-4 rounded-lg bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 space-y-3">
                                        <h4 className="text-sm font-extrabold text-gray-800 dark:text-white flex items-center gap-1.5">
                                            <span className="text-red-600">⚠️ Madde {wIdx + 1}:</span>
                                            {warning.description}
                                        </h4>

                                        {/* Görseller */}
                                        <div className="flex flex-wrap gap-3">
                                            {warning.imageUrls && warning.imageUrls.map((url, imgIdx) => (
                                                <div key={imgIdx} className="w-24 h-24 rounded-lg overflow-hidden border border-gray-300 dark:border-gray-600 shadow-sm hover:scale-105 transition-all">
                                                    <img 
                                                        src={url} 
                                                        alt="Uyarı Görseli" 
                                                        className="w-full h-full object-cover cursor-pointer" 
                                                        onClick={() => setPreviewImage(url)} 
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Modal Butonları ve Onay */}
                        <div className="p-5 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 flex flex-col sm:flex-row justify-between items-center gap-4">
                            <label className="flex items-center gap-2 cursor-pointer select-none">
                                <input 
                                    type="checkbox"
                                    id="confirmWarningsCheckbox"
                                    className="w-5 h-5 text-red-600 border-gray-300 rounded focus:ring-red-500 cursor-pointer"
                                />
                                <span className="text-xs font-bold text-gray-700 dark:text-gray-300">
                                    Belirtilen tüm görsel uyarıları inceledim ve anladım.
                                </span>
                            </label>

                            <div className="flex gap-2 w-full sm:w-auto shrink-0 justify-end">
                                <button 
                                    onClick={handleCloseWarningModal}
                                    className="px-4 py-2 border rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-sm font-semibold transition text-gray-600 dark:text-gray-300"
                                >
                                    İptal
                                </button>
                                <button 
                                    onClick={() => {
                                        const chk = document.getElementById('confirmWarningsCheckbox');
                                        if (chk && chk.checked) {
                                            handleConfirmWarnings();
                                        } else {
                                            alert("Lütfen görselleri incelediğinizi onaylayan kutucuğu işaretleyin.");
                                        }
                                    }}
                                    className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-bold shadow-md transition"
                                >
                                    Onayla ve İşe Başla
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};

export default MoldDetailPage;