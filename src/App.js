// src/App.js

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';

// Firebase
import { 
    db, auth, onAuthStateChanged, 
    signInWithCustomToken, signInAnonymously, 
    collection, query, getDocs, setDoc, 
    updateDoc, deleteDoc, doc, onSnapshot, where
} from './config/firebase.js';

// Sabitler
import { 
    ROLES, OPERATION_STATUS, mapTaskStatusToMoldStatus,
    PERSONNEL_ROLES, INVENTORY_COLLECTION 
} from './config/constants.js';

// Yardımcılar
import { getCurrentDateTimeString } from './utils/dateUtils.js';

// İkonlar
import { 
    RefreshCw, LayoutDashboard, Settings, BarChart2, History, List, 
    LogOut, PlayCircle, Map as MapIcon, Monitor, Briefcase, PenTool,
    Package, Wrench, FileText, TrendingUp, Activity
} from 'lucide-react';

// Sayfalar
// --- DÜZELTME BURADA YAPILDI: Artık 'DesignProjectsView' DEĞİL, çatı dosya olan 'DesignOfficePage' import ediliyor ---
import DesignOfficePage from './pages/DesignOfficePage.js'; 
import CredentialLoginScreen from './pages/CredentialLoginScreen.js';
import EnhancedMoldList from './pages/EnhancedMoldList.js';
import MoldDetailPage from './pages/MoldDetailPage.js';
import ActiveTasksPage from './pages/ActiveTasksPage.js';
import CamDashboard from './pages/CamDashboard.js';
import AdminDashboard from './pages/AdminDashboard.js';
import HistoryPage from './pages/HistoryPage.js';
import AnalysisPage from './pages/AnalysisPage.js';
import WorkshopEditorPage from './pages/WorkshopEditorPage.js'; 
import TerminalPage from './pages/TerminalPage.js'; 
import ProjectManagementPage from './pages/ProjectManagementPage.js'; 
import CamJobEntryPage from './pages/CamJobEntryPage.js'; 
import ToolInventoryPage from './pages/ToolInventoryPage.js';
import ToolAssignmentPage from './pages/ToolAssignmentPage.js';
import ToolHistoryPage from './pages/ToolHistoryPage.js';
import ToolAnalysisPage from './pages/ToolAnalysisPage.js';
import ToolLifecycleAnalysis from './pages/ToolLifecycleAnalysis.js'; 

// Bileşenler
import NavItem from './components/Shared/NavItem.js';
import { initialProjects } from './config/initialData.js';

// --- Veritabanı Adresleri ---
const appId = 'default-app-id'; 
const initialAuthToken = null;
const PROJECT_COLLECTION = `artifacts/${appId}/public/data/moldProjects`;
const PERSONNEL_COLLECTION = `artifacts/${appId}/public/data/personnel`;
const MACHINES_COLLECTION = `artifacts/${appId}/public/data/machines`;
const MOLD_NOTES_COLLECTION = `artifacts/${appId}/public/data/moldNotes`;


// --- MAIN APP COMPONENT ---

const App = () => {
    const [userId, setUserId] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isProjectsLoading, setIsProjectsLoading] = useState(true);
    
    // VERİ STATELERİ
    const [projects, setProjects] = useState([]);
    const [personnel, setPersonnel] = useState([]);
    const [machines, setMachines] = useState([]);
    const [tools, setTools] = useState([]); 
    
    const [loggedInUser, setLoggedInUser] = useState(() => {
        try {
            const savedUser = localStorage.getItem('kaliphane_user');
            return savedUser ? JSON.parse(savedUser) : null;
        } catch (error) {
            console.error("Kullanıcı verisi okunamadı:", error);
            return null;
        }
    });
    
    const navigate = useNavigate(); 
    const location = useLocation();

    useEffect(() => {
        if (loggedInUser && !loggedInUser.role) {
            console.warn("Kullanıcı verisi bozuk, otomatik çıkış yapılıyor.");
            setLoggedInUser(null);
            localStorage.removeItem('kaliphane_user');
            navigate('/');
        }
    }, [loggedInUser, navigate]);

    // Seed Data
    const getMoldStatusFromTasksForSeed = (tasks) => {
        if (!tasks || tasks.length === 0) return OPERATION_STATUS.NOT_STARTED;
        const allOps = tasks.flatMap(t => t.operations || []);
        if (allOps.length === 0) {
             if (tasks.every(t => t.status === OPERATION_STATUS.COMPLETED)) return OPERATION_STATUS.COMPLETED;
             if (tasks.some(t => t.status && [OPERATION_STATUS.IN_PROGRESS, OPERATION_STATUS.WAITING_SUPERVISOR_REVIEW].includes(t.status))) return OPERATION_STATUS.IN_PROGRESS;
             return OPERATION_STATUS.IN_PROGRESS;
        }
        if (allOps.every(op => op.status === OPERATION_STATUS.COMPLETED)) return OPERATION_STATUS.COMPLETED;
        if (allOps.some(op => op.status === OPERATION_STATUS.IN_PROGRESS || op.status === OPERATION_STATUS.WAITING_SUPERVISOR_REVIEW)) return OPERATION_STATUS.IN_PROGRESS;
        if (allOps.every(op => op.status === OPERATION_STATUS.NOT_STARTED)) return OPERATION_STATUS.NOT_STARTED;
        return OPERATION_STATUS.IN_PROGRESS;
    };
    
    const seedInitialData = useCallback(async () => {
        if (!db) return;
        const q = query(collection(db, PROJECT_COLLECTION));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            for (const project of initialProjects) {
                await setDoc(doc(db, PROJECT_COLLECTION, project.id), { 
                    ...project, status: project.status,
                    trialReportUrl: project.trialReportUrl || '',
                    productImageUrl: project.productImageUrl || '',
                    projectManager: '', moldDesigner: '',
                });
            }
        } else {
            for (const docSnapshot of querySnapshot.docs) {
                const project = docSnapshot.data();
                let updates = {};
                let needsMigration = false;
                if (!project.tasks) continue; 

                const migratedTasks = project.tasks.map(task => {
                    if (task.operations === undefined) { 
                        needsMigration = true;
                        const cncOperation = {
                           id: task.id || `op-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                            type: "CNC", status: task.status, progressPercentage: task.progressPercentage, assignedOperator: task.assignedOperator, machineName: task.machineName, machineOperatorName: task.machineOperatorName, estimatedDueDate: task.estimatedDueDate, startDate: task.startDate, finishDate: task.finishDate, durationInHours: task.durationInHours, supervisorRating: task.supervisorRating, supervisorReviewDate: task.supervisorReviewDate, supervisorComment: task.supervisorComment, camOperatorRatingForMachineOp: task.camOperatorRatingForMachineOp, camOperatorCommentForMachineOp: task.camOperatorCommentForMachineOp, camOperatorReviewDate: task.camOperatorReviewDate
                        };
                        return { id: task.id, taskName: task.taskName, taskNumber: task.taskNumber, operations: [cncOperation] };
                    }
                    return task;
                });
                if (needsMigration) updates.tasks = migratedTasks;
                if (project.status === undefined || project.status === 'AKTİF') {
                    const calculatedTaskStatus = getMoldStatusFromTasksForSeed(migratedTasks);
                    updates.status = mapTaskStatusToMoldStatus(calculatedTaskStatus);
                }
                if (project.moldDeadline === undefined) updates.moldDeadline = '';
                if (project.priority === undefined) updates.priority = null;
                if (project.trialReportUrl === undefined) updates.trialReportUrl = '';
                if (project.productImageUrl === undefined) updates.productImageUrl = '';
                if (project.projectManager === undefined) updates.projectManager = '';
                if (project.moldDesigner === undefined) updates.moldDesigner = '';

                if(Object.keys(updates).length > 0) await updateDoc(doc(db, PROJECT_COLLECTION, docSnapshot.id), updates);
            }
        }

        const personnelQuery = query(collection(db, PERSONNEL_COLLECTION), where("username", "==", "admin"));
        const adminUserSnapshot = await getDocs(personnelQuery);
        if (adminUserSnapshot.empty) {
            const allPersonnelQuery = query(collection(db, PERSONNEL_COLLECTION));
            const allPersonnelSnapshot = await getDocs(allPersonnelQuery);
            if (!allPersonnelSnapshot.empty) {
                for (const docSnapshot of allPersonnelSnapshot.docs) await deleteDoc(doc(db, PERSONNEL_COLLECTION, docSnapshot.id));
            }
            const samplePersonnel = [
                { id: 'person-admin', name: 'Ayşe Hanım (Yönetici)', role: PERSONNEL_ROLES.ADMIN, createdAt: getCurrentDateTimeString(), username: 'admin', password: '123' },
                { id: 'person-cam1', name: 'Emre Bey (CAM)', role: PERSONNEL_ROLES.CAM_OPERATOR, createdAt: getCurrentDateTimeString(), username: 'emre', password: '123' },
                { id: 'person-cam2', name: 'Can Bey (CAM)', role: PERSONNEL_ROLES.CAM_OPERATOR, createdAt: getCurrentDateTimeString(), username: 'can', password: '123' },
                { id: 'person-sup1', name: 'Fatma Hanım (Yetkili)', role: PERSONNEL_ROLES.SUPERVISOR, createdAt: getCurrentDateTimeString(), username: 'fatma', password: '123' },
                { id: 'person-takim1', name: 'Ahmet Usta (Takımhane)', role: PERSONNEL_ROLES.TAKIMHANE_SORUMLUSU, createdAt: getCurrentDateTimeString(), username: 'ahmet', password: '123' }, 
                { id: 'person-machine1', name: 'Ali Yılmaz', role: PERSONNEL_ROLES.MACHINE_OPERATOR, createdAt: getCurrentDateTimeString(), username: null, password: null },
                { id: 'person-machine2', name: 'Burak Demir', role: PERSONNEL_ROLES.MACHINE_OPERATOR, createdAt: getCurrentDateTimeString(), username: null, password: null },
                { id: 'person-machine3', name: 'Deniz Kaya', role: PERSONNEL_ROLES.MACHINE_OPERATOR, createdAt: getCurrentDateTimeString(), username: null, password: null },
            ];
            for (const person of samplePersonnel) await setDoc(doc(db, PERSONNEL_COLLECTION, person.id), person);
        }
        const HARDCODED_MACHINES = ['K40', 'K68', 'K70', 'Fİ-200', 'AG-500', 'DECKEL-50'];
        const machinesQuery = query(collection(db, MACHINES_COLLECTION));
        const machinesSnapshot = await getDocs(machinesQuery);
        if (machinesSnapshot.empty) {
            for (const machine of HARDCODED_MACHINES) {
                const machineId = `machine-${machine}`;
                await setDoc(doc(db, MACHINES_COLLECTION, machineId), { id: machineId, name: machine, createdAt: getCurrentDateTimeString() });
            }
        }
    }, []); 
    
    useEffect(() => {
        try {
            const authenticate = async () => {
                 if (initialAuthToken) {
                    try { await signInWithCustomToken(auth, initialAuthToken); } 
                    catch (error) { await signInAnonymously(auth); }
                } else { await signInAnonymously(auth); }
            };
            const unsubscribe = onAuthStateChanged(auth, (user) => {
                if (!user) authenticate();
                else setUserId(user.uid);
             });
            return () => unsubscribe();
        } catch (error) { setLoading(false); }
    }, []); 

    useEffect(() => {
        if (!db || !userId) return;
        let personnelListenerFired = false;
        let machinesListenerFired = false;
        let dataSeeded = false;
        const checkCoreLoadingDone = async () => {
             if (personnelListenerFired && machinesListenerFired && !dataSeeded) {
                dataSeeded = true;
                await seedInitialData(); 
                setLoading(false);
            }
        };
        const unsubscribePersonnel = onSnapshot(query(collection(db, PERSONNEL_COLLECTION)), (snapshot) => {
            setPersonnel(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            personnelListenerFired = true;
            checkCoreLoadingDone();
        });
        const unsubscribeMachines = onSnapshot(query(collection(db, MACHINES_COLLECTION)), (snapshot) => {
            setMachines(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            machinesListenerFired = true;
            checkCoreLoadingDone();
        });
        const unsubscribeInventory = onSnapshot(query(collection(db, INVENTORY_COLLECTION)), (snapshot) => {
            setTools(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });

        return () => { 
            unsubscribePersonnel(); 
            unsubscribeMachines(); 
            unsubscribeInventory(); 
        };
    }, [userId, seedInitialData]); 
    
    useEffect(() => {
        if (!db || !userId || !loggedInUser) return;
        setIsProjectsLoading(true);
        const unsubscribe = onSnapshot(query(collection(db, PROJECT_COLLECTION)), (snapshot) => {
            setProjects(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
            setIsProjectsLoading(false);
        });
        return () => unsubscribe();
    }, [userId, loggedInUser]);

    const handleTerminalAction = useCallback(async (moldId, taskId, opId, actionType, operatorName) => {
        if (!db) return;
        const moldRef = doc(db, PROJECT_COLLECTION, moldId);
        
        const currentProject = projects.find(p => p.id === moldId);
        if (!currentProject) return;
        const taskIndex = currentProject.tasks.findIndex(t => t.id === taskId);
        if (taskIndex === -1) return;
        
        const currentTask = currentProject.tasks[taskIndex];
        const opIndex = currentTask.operations.findIndex(op => op.id === opId);
        if (opIndex === -1) return;
        
        const currentOp = currentTask.operations[opIndex];
        let updatedOp = { ...currentOp };
        const now = getCurrentDateTimeString();

        if (operatorName) {
            updatedOp.machineOperatorName = operatorName;
        }

        if (actionType === 'START_SETUP') {
            updatedOp.status = OPERATION_STATUS.IN_PROGRESS;
            updatedOp.setupStartTime = now;
            updatedOp.isSettingUp = true;
            updatedOp.isOperatorFinished = false; 
        } 
        else if (actionType === 'START_PRODUCTION') {
            updatedOp.isSettingUp = false;
            updatedOp.productionStartTime = now;
            updatedOp.isOperatorFinished = false;
        } 
        else if (actionType === 'PAUSE_JOB') { 
            updatedOp.status = OPERATION_STATUS.PAUSED;
        }
        else if (actionType === 'RESUME_JOB') { 
            updatedOp.status = OPERATION_STATUS.IN_PROGRESS;
        }
        else if (actionType === 'FINISH_JOB') { 
            updatedOp.status = OPERATION_STATUS.PAUSED;
            updatedOp.isOperatorFinished = true; 
            updatedOp.progressPercentage = 99; 
            updatedOp.isSettingUp = false;
        }

        const newOps = [...currentTask.operations];
        newOps[opIndex] = updatedOp;
        const newTasks = [...currentProject.tasks];
        newTasks[taskIndex] = { ...currentTask, operations: newOps };

        try {
            await updateDoc(moldRef, { tasks: newTasks });
        } catch (e) {
            console.error("Terminal işlemi hatası:", e);
        }
    }, [projects]);

    const handleSetCriticalTask = useCallback(async (moldId, taskId, isCritical, criticalNote) => {
        if (!db) return;
        const moldRef = doc(db, PROJECT_COLLECTION, moldId);
        const currentProject = projects.find(p => p.id === moldId);
        if (!currentProject) return;
        const taskIndex = currentProject.tasks.findIndex(t => t.id === taskId);
        if (taskIndex === -1) return;
        const currentTask = currentProject.tasks[taskIndex];
        const updatedTask = { ...currentTask, isCritical: isCritical, criticalNote: criticalNote || '', criticalSetBy: loggedInUser.name, criticalSetDate: getCurrentDateTimeString() };
        const newTasks = [...currentProject.tasks];
        newTasks[taskIndex] = updatedTask;
        try { await updateDoc(moldRef, { tasks: newTasks }); } catch (e) { console.error("Kritik durum güncelleme hatası:", e); }
    }, [projects, loggedInUser]);

    const handleUpdateMachineStatus = useCallback(async (machineId, newStatus, reason) => {
        if (!db) return;
        try {
            const machineRef = doc(db, MACHINES_COLLECTION, machineId);
            await updateDoc(machineRef, { currentStatus: newStatus, statusReason: reason, statusStartTime: getCurrentDateTimeString() });
        } catch (e) { console.error("Tezgah durumu güncelleme hatası:", e); }
    }, []); 
    
    const handleReportOperationIssue = useCallback(async (moldId, taskId, opId, reason, description) => {
        if (!db) return;
        const moldRef = doc(db, PROJECT_COLLECTION, moldId);
        const currentProject = projects.find(p => p.id === moldId);
        if (!currentProject) return;
        const taskIndex = currentProject.tasks.findIndex(t => t.id === taskId);
        if (taskIndex === -1) return;
        const opIndex = currentProject.tasks[taskIndex].operations.findIndex(op => op.id === opId);
        if (opIndex === -1) return;
        const currentTask = currentProject.tasks[taskIndex];
        const currentOp = currentTask.operations[opIndex];
        const newHistoryEntry = { id: Date.now(), reason, description, reportedBy: loggedInUser.name, date: getCurrentDateTimeString(), previousProgress: currentOp.progressPercentage };
        const updatedOp = { ...currentOp, status: OPERATION_STATUS.NOT_STARTED, progressPercentage: 0, reworkHistory: currentOp.reworkHistory ? [...currentOp.reworkHistory, newHistoryEntry] : [newHistoryEntry] };
        const newOps = [...currentTask.operations];
        newOps[opIndex] = updatedOp;
        const newTasks = [...currentProject.tasks];
        newTasks[taskIndex] = { ...currentTask, operations: newOps };
        await updateDoc(moldRef, { tasks: newTasks });
    }, [projects, loggedInUser]);

    const handleUpdateOperation = useCallback(async (moldId, taskId, updatedOperationData) => {
        if (!db) return;
        const currentProject = projects.find(p => p.id === moldId);
        if (!currentProject) return;
        const taskIndex = currentProject.tasks.findIndex(t => t.id === taskId);
        if (taskIndex === -1) return;
        const currentTask = currentProject.tasks[taskIndex];
        const operationIndex = currentTask.operations.findIndex(op => op.id === updatedOperationData.id);
        if (operationIndex === -1) return;
        const newOperations = [...currentTask.operations];
        newOperations[operationIndex] = updatedOperationData;
        const newTasks = [...currentProject.tasks];
        newTasks[taskIndex] = { ...currentTask, operations: newOperations };
        try { await updateDoc(doc(db, PROJECT_COLLECTION, moldId), { tasks: newTasks }); } 
        catch (e) { console.error("Hata:", e); }
    }, [projects]);

    const handleAddOperation = useCallback(async (moldId, taskId, newOperationData) => {
        if (!db) return;
        const currentProject = projects.find(p => p.id === moldId);
        if (!currentProject) return;
        const taskIndex = currentProject.tasks.findIndex(t => t.id === taskId);
        if (taskIndex === -1) return;
        const currentTask = currentProject.tasks[taskIndex];
        const newOperations = [...currentTask.operations, newOperationData];
        const newTasks = [...currentProject.tasks];
        newTasks[taskIndex] = { ...currentTask, operations: newOperations };
        try { await updateDoc(doc(db, PROJECT_COLLECTION, moldId), { tasks: newTasks }); } 
        catch (e) { console.error("Hata:", e); }
    }, [projects]);

    const handleUpdateMoldStatus = useCallback(async (id, val) => { if(db) await updateDoc(doc(db, PROJECT_COLLECTION, id), { status: val }); }, []);
    const handleUpdateMoldDeadline = useCallback(async (id, val) => { if(db) await updateDoc(doc(db, PROJECT_COLLECTION, id), { moldDeadline: val }); }, []);
    const handleUpdateMoldPriority = useCallback(async (id, val) => { if(db) await updateDoc(doc(db, PROJECT_COLLECTION, id), { priority: val }); }, []);
    const handleUpdateTrialReportUrl = useCallback(async (id, val) => { if(db) await updateDoc(doc(db, PROJECT_COLLECTION, id), { trialReportUrl: val || '' }); }, []);
    const handleUpdateProductImageUrl = useCallback(async (id, val) => { if(db) await updateDoc(doc(db, PROJECT_COLLECTION, id), { productImageUrl: val || '' }); }, []);
    const handleUpdateProjectManager = useCallback(async (id, val) => { if(db) await updateDoc(doc(db, PROJECT_COLLECTION, id), { projectManager: val || '' }); }, []);
    const handleUpdateMoldDesigner = useCallback(async (id, val) => { if(db) await updateDoc(doc(db, PROJECT_COLLECTION, id), { moldDesigner: val || '' }); }, []);
    const handleDeleteMold = useCallback(async (id) => { if(db) { await deleteDoc(doc(db, PROJECT_COLLECTION, id)); await deleteDoc(doc(db, MOLD_NOTES_COLLECTION, id)); if (location.pathname.includes(id)) navigate('/'); } }, [location.pathname, navigate]);
    const handleUpdateMold = useCallback(async (id, data) => { if(db) await updateDoc(doc(db, PROJECT_COLLECTION, id), data); }, []);
    
    // --- NAVİGASYON ---
    const navItems = useMemo(() => {
        if (!loggedInUser || !loggedInUser.role) return [];
        const allLoginRoles = Object.values(ROLES);
        
        // Rol Grupları
        const canSeeAdmin = [ROLES.ADMIN, ROLES.KALIP_TASARIM_SORUMLUSU, ROLES.PROJE_SORUMLUSU];
        const canSeeAnalysis = [ROLES.ADMIN, ROLES.SUPERVISOR, ROLES.PROJE_SORUMLUSU, ROLES.KALIP_TASARIM_SORUMLUSU];
        const canSeeTools = [ROLES.TAKIMHANE_SORUMLUSU]; // Sadece Takımhane Sorumlusu

        // Takımhane Sorumlusunun GÖRMEMESİ gerekenler için liste
        const rolesExceptToolRoom = allLoginRoles.filter(r => r !== ROLES.TAKIMHANE_SORUMLUSU);
        
        const finalBaseItems = [
            // Kalıp İmalat: Takımhane görmeyecek
            { path: '/', label: 'Kalıp İmalat', icon: List, roles: rolesExceptToolRoom },

            { path: '/project-management', label: 'PROJE', icon: Briefcase, roles: [ROLES.ADMIN, ROLES.PROJE_SORUMLUSU] },
            { 
                path: '/design-office', 
                label: 'Tasarım Ofisi', 
                icon: PenTool, 
                roles: [ROLES.ADMIN, ROLES.KALIP_TASARIM_SORUMLUSU] 
            },
            
            // Çalışan Parçalar: Herkes görecek (Takımhane dahil)
            { path: '/active', label: 'Çalışan Parçalar', icon: PlayCircle, roles: allLoginRoles },
            
            // Takımhane Menüleri
            { path: '/tool-inventory', label: 'Depo & Stok', icon: Package, roles: canSeeTools },
            { path: '/tool-assignment', label: 'Takımhane', icon: Wrench, roles: canSeeTools },
            { path: '/tool-history', label: 'Geçmiş & Takip', icon: FileText, roles: canSeeTools },
            { path: '/tool-analysis', label: 'Analiz Raporu', icon: TrendingUp, roles: canSeeTools },
            // YENİ EKLENEN MENÜ: Detaylı Analiz
            { path: '/tool-lifecycle', label: 'Detaylı Analiz', icon: Activity, roles: canSeeTools },

            { path: '/cam', label: 'Aktif İşlerim', icon: Settings, roles: [ROLES.CAM_OPERATOR] },
            { 
                path: '/cam-job-entry', 
                label: 'Proje ve İş Ekleme', 
                icon: Briefcase, 
                roles: [ROLES.CAM_OPERATOR] 
            },

            { 
                path: '/admin', 
                label: 'Admin Paneli', 
                icon: LayoutDashboard, 
                roles: canSeeAdmin 
            },

            { path: '/admin/layout', label: 'Atölye Yerleşimi', icon: MapIcon, roles: [ROLES.ADMIN] },
            
            // Geçmiş İşler: Takımhane görmeyecek
            { path: '/history', label: 'Geçmiş İşler', icon: History, roles: rolesExceptToolRoom },

            { 
                path: '/analysis', 
                label: 'Analiz', 
                icon: BarChart2, 
                roles: canSeeAnalysis 
            },
            { path: '/terminal', label: 'Tezgah Terminali', icon: Monitor, roles: [ROLES.ADMIN, ROLES.SUPERVISOR] },
        ];
        return finalBaseItems.filter(item => item.roles.includes(loggedInUser.role));
    }, [loggedInUser]);

    if (!userId) return <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900"><RefreshCw className="w-8 h-8 text-blue-500 animate-spin" /><p className="ml-3 text-lg text-gray-600 dark:text-gray-400">Kimlik doğrulanıyor...</p></div>;
    if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900"><RefreshCw className="w-8 h-8 text-blue-500 animate-spin" /><p className="ml-3 text-lg text-gray-600 dark:text-gray-400">Personel verisi yükleniyor...</p></div>;
    
    if (location.pathname === '/terminal') {
        return <TerminalPage personnel={personnel} projects={projects} machines={machines} handleTerminalAction={handleTerminalAction} />;
    }

    if (!loggedInUser) {
        return <CredentialLoginScreen db={db} setLoggedInUser={setLoggedInUser} personnel={personnel} />;
    }
    
    if (isProjectsLoading) return <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900"><RefreshCw className="w-8 h-8 text-blue-500 animate-spin" /><p className="ml-3 text-lg text-gray-600 dark:text-gray-400">Sistem verileri yükleniyor...</p></div>;

    return (
        <div className="p-4 sm:p-8 min-h-screen bg-gray-100 dark:bg-gray-900 font-sans">
            <header className="mb-8 border-b pb-4 dark:border-gray-700">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center">
                    <h1 className="text-3xl font-extrabold text-gray-900 dark:text-white">Kalıphane İş Akışı Takibi</h1>
                      <div className="mt-4 sm:mt-0 flex items-center space-x-3">
                        <span className="text-sm font-medium text-blue-600 dark:text-blue-400">
                            Giriş Yapan: {loggedInUser.name} ({loggedInUser.role})
                         </span>
                        <button
                            onClick={() => {
                                setLoggedInUser(null); 
                                localStorage.removeItem('kaliphane_user'); 
                                navigate('/');
                            }}
                            className="flex items-center text-sm px-3 py-1 bg-red-500 text-white rounded-lg hover:bg-red-600 transition"
                         >
                            <LogOut className="w-4 h-4 mr-1"/> Çıkış
                        </button>
                    </div>
                 </div>

                <nav className="mt-4 flex flex-wrap gap-2">
                    {navItems.map(item => (
                        <NavItem
                            key={item.path}
                            icon={item.icon}
                            label={item.label}
                            isActive={location.pathname === item.path}
                            path={item.path}
                         />
                    ))}
                </nav>
            </header>

            <Routes>
                <Route path="/" element={<EnhancedMoldList projects={projects} loggedInUser={loggedInUser} handleDeleteMold={handleDeleteMold} handleUpdateMold={handleUpdateMold} />} />
                <Route path="/active" element={<ActiveTasksPage projects={projects} machines={machines} loggedInUser={loggedInUser} personnel={personnel} handleUpdateMachineStatus={handleUpdateMachineStatus} />} />
                <Route path="/cam" element={<CamDashboard loggedInUser={loggedInUser} projects={projects} handleUpdateOperation={handleUpdateOperation} personnel={personnel} machines={machines} />} />
                <Route path="/project-management" element={<ProjectManagementPage projects={projects} personnel={personnel} loggedInUser={loggedInUser} />} />
                
                <Route path="/design-office" element={<DesignOfficePage projects={projects} personnel={personnel} loggedInUser={loggedInUser} db={db} />} />
                
                {/* YENİ ROUTE'LAR */}
                <Route path="/tool-inventory" element={<ToolInventoryPage tools={tools} loggedInUser={loggedInUser} db={db} />} />
                <Route path="/tool-assignment" element={<ToolAssignmentPage tools={tools} machines={machines} personnel={personnel} loggedInUser={loggedInUser} db={db} />} />
                <Route path="/tool-history" element={<ToolHistoryPage machines={machines} db={db} />} />
                
                {/* RAPORLAR */}
                <Route path="/tool-analysis" element={<ToolAnalysisPage db={db} />} />
                <Route path="/tool-lifecycle" element={<ToolLifecycleAnalysis db={db} />} /> {/* YENİ EKLENEN ROUTE */}

                <Route path="/admin" element={<AdminDashboard 
                    db={db} 
                    projects={projects} 
                    setProjects={setProjects} 
                    personnel={personnel} 
                    setPersonnel={setPersonnel} 
                    machines={machines} 
                    setMachines={setMachines} 
                    handleDeleteMold={handleDeleteMold} 
                    handleUpdateMold={handleUpdateMold} 
                    loggedInUser={loggedInUser} 
                />} />

                <Route path="/admin/layout" element={<WorkshopEditorPage machines={machines} projects={projects} />} />
                <Route path="/history" element={<HistoryPage projects={projects} />} />
                <Route path="/analysis" element={<AnalysisPage projects={projects} personnel={personnel} loggedInUser={loggedInUser} />} />
                <Route path="/terminal" element={<TerminalPage personnel={personnel} projects={projects} machines={machines} handleTerminalAction={handleTerminalAction} />} />
                
                <Route path="/cam-job-entry" element={<CamJobEntryPage projects={projects} personnel={personnel} loggedInUser={loggedInUser} />} />

                <Route path="/mold/:moldId" element={
                    <MoldDetailPage 
                        loggedInUser={loggedInUser} 
                        handleUpdateOperation={handleUpdateOperation} 
                        handleAddOperation={handleAddOperation} 
                        handleReportOperationIssue={handleReportOperationIssue} 
                        handleSetCriticalTask={handleSetCriticalTask} 
                        handleUpdateMoldStatus={handleUpdateMoldStatus}
                        handleUpdateMoldDeadline={handleUpdateMoldDeadline}
                        handleUpdateMoldPriority={handleUpdateMoldPriority} 
                        handleUpdateTrialReportUrl={handleUpdateTrialReportUrl}
                        handleUpdateProductImageUrl={handleUpdateProductImageUrl} 
                        handleUpdateProjectManager={handleUpdateProjectManager}
                        handleUpdateMoldDesigner={handleUpdateMoldDesigner}
                        projects={projects} 
                        personnel={personnel} 
                        machines={machines}
                        db={db}
                    />
                } />
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            
            <footer className="mt-8 text-center text-xs text-gray-500 dark:text-gray-600 border-t pt-4 dark:border-gray-700">
                 Veritabanı Kimliği: {userId}
            </footer>
        </div>
    );
};

export default App;