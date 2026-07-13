// src/App.js

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';

// Firebase
import { 
    db, auth, onAuthStateChanged, 
    signInWithCustomToken, signInAnonymously, 
    collection, query, getDocs, setDoc, 
    updateDoc, deleteDoc, doc, onSnapshot, where, getDoc
} from './config/firebase.js';

// Sabitler
import { 
    ROLES, OPERATION_STATUS, mapTaskStatusToMoldStatus,
    PERSONNEL_ROLES, INVENTORY_COLLECTION,
    PROJECT_COLLECTION, 
    CNC_LATHE_JOBS_COLLECTION, 
    DESIGN_JOBS_COLLECTION,  
    PERSONNEL_COLLECTION,
    MACHINES_COLLECTION,
    MOLD_NOTES_COLLECTION,
    initialAuthToken 
} from './config/constants.js';

import { getCurrentDateTimeString } from './utils/dateUtils.js';

// İkonlar (Clock ve Moon eklendi)
import { 
    RefreshCw, LayoutDashboard, Settings, BarChart2, History, List, 
    LogOut, PlayCircle, Map as MapIcon, Monitor, Briefcase, PenTool,
    Package, Wrench, FileText, TrendingUp, Activity, Layers, Archive, Box, FileOutput, Users, Calendar, ClipboardCheck, Database, ListOrdered, Truck,
    Menu, X, Radio, Clock, Sun, Moon, Target, FolderOpen, ChevronDown, ChevronRight
} from 'lucide-react';

// Sayfalar
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
import MoldMaintenancePage from './pages/MoldMaintenancePage.js';
import MoldTrialReportsPage from './pages/MoldTrialReportsPage.js';
import MachineQueuePage from './pages/MachineQueuePage.js';
import ForkliftDashboard from './pages/ForkliftDashboard.js';
import AssemblyDashboard from './pages/AssemblyDashboard.js'; 

import CncLatheDashboard from './pages/CncLatheDashboard.js';
import CncLatheHistoryPage from './pages/CncLatheHistoryPage.js';
import CncPartManager from './pages/CncPartManager.js'; 
import CncSpcAnalysisPage from './pages/CncSpcAnalysisPage.js'; 
import CncInspectionReport from './pages/CncInspectionReport.js'; 
import CncOperatorPerformance from './pages/CncOperatorPerformance.js';
import CncLathePlanningPage from './pages/CncLathePlanningPage.js';
import CncLatheCalendarPage from './pages/CncLatheCalendarPage.js';
import CncLatheRawMaterialPlanningPage from './pages/CncLatheRawMaterialPlanningPage.js';
import { ALL_SYSTEM_PAGES, getDefaultPermissions } from './config/permissionsConfig.js';

// YENİ EKLENEN SAYFALAR
import CanliDurum from './pages/CanliDurum.jsx';
import CamOperatorDashboard from './pages/CamOperatorDashboard.js';
import NightShiftPlanner from './pages/NightShiftPlanner.js'; // <-- GECE VARDİYASI EKLENDİ
import ContinuousImprovementPage from './pages/ContinuousImprovementPage.js';
import ShiftPlannerPage from './pages/ShiftPlannerPage.js';
import MoldMaterialDebitsPage from './pages/MoldMaterialDebitsPage.js';
import SurveyEvaluationPage from './pages/SurveyEvaluationPage.js';
import ToolRequestBridgePage from './pages/ToolRequestBridgePage.js';
import MachineMaintenancePage from './pages/MachineMaintenancePage.js';
import MoldBasedToolTracking from './pages/MoldBasedToolTracking.js';
import WorkshopSupervisorPage from './pages/WorkshopSupervisorPage.js';

import { initialProjects } from './config/initialData.js';

// SIDEBAR NAV ITEM BİLEŞENİ
const SidebarNavItem = ({ icon: Icon, label, isActive, onClick }) => {
    return (
        <button
            onClick={onClick}
            className={`w-full flex items-center px-4 py-3 mb-2 rounded-xl transition-all duration-200 ${
                isActive 
                ? 'bg-blue-600 text-white font-bold shadow-md' 
                : 'text-gray-600 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-gray-800 hover:text-blue-600 dark:hover:text-white font-medium'
            }`}
        >
            <Icon className={`w-5 h-5 mr-3 ${isActive ? 'text-white' : 'text-gray-500 dark:text-gray-400'}`} />
            <span className="text-sm">{label}</span>
        </button>
    );
};


const App = () => {
    const [userId, setUserId] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isProjectsLoading, setIsProjectsLoading] = useState(true);
    
    // SİDEBAR STATE'İ
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    
    const [projects, setProjects] = useState([]); 
    const [cncJobs, setCncJobs] = useState([]);   
    const [designJobs, setDesignJobs] = useState([]); 
    
    const [personnel, setPersonnel] = useState([]);
    const [machines, setMachines] = useState([]);
    const [tools, setTools] = useState([]);
    const [rolePermissions, setRolePermissions] = useState({});
    const [menuLayout, setMenuLayout] = useState(null);
    const [expandedCategories, setExpandedCategories] = useState(() => {
        try {
            const saved = localStorage.getItem('kaliphane_expanded_categories');
            return saved ? JSON.parse(saved) : { "cat-1": true };
        } catch {
            return { "cat-1": true };
        }
    });

    const [darkMode, setDarkMode] = useState(() => {
        try {
            const saved = localStorage.getItem('kaliphane_dark_mode');
            return saved !== null ? saved === 'true' : true;
        } catch {
            return true;
        }
    });

    useEffect(() => {
        try {
            if (darkMode) {
                document.documentElement.classList.add('dark');
            } else {
                document.documentElement.classList.remove('dark');
            }
            localStorage.setItem('kaliphane_dark_mode', darkMode.toString());
        } catch (e) {
            console.error("Koyu mod ayarlanamadı:", e);
        }
    }, [darkMode]);

    const [theme, setTheme] = useState(() => {
        try {
            const saved = localStorage.getItem('kaliphane_color_theme');
            return saved !== null ? saved : 'blue';
        } catch {
            return 'blue';
        }
    });

    useEffect(() => {
        try {
            localStorage.setItem('kaliphane_color_theme', theme);
            const themeClasses = ['theme-blue', 'theme-emerald', 'theme-purple', 'theme-amber', 'theme-cobalt', 'theme-mint'];
            themeClasses.forEach(tc => document.documentElement.classList.remove(tc));
            document.documentElement.classList.add(`theme-${theme}`);
        } catch (e) {
            console.error("Renk teması uygulanamadı:", e);
        }
    }, [theme]);



    const [loggedInUser, setLoggedInUser] = useState(() => {
        try {
            const savedUser = localStorage.getItem('kaliphane_user');
            return savedUser ? JSON.parse(savedUser) : null;
        } catch (error) {
            console.error("Kullanıcı verisi okunamadı:", error);
            return null;
        }
    });

    const activeUserPermissions = useMemo(() => {
        if (!loggedInUser || !loggedInUser.role) return {};
        const savedPerms = rolePermissions[loggedInUser.role] || {};
        const defaultPerms = getDefaultPermissions(loggedInUser.role);
        
        const resolved = {};
        ALL_SYSTEM_PAGES.forEach(p => {
            resolved[p.path] = {
                view: savedPerms[p.path]?.view !== undefined ? savedPerms[p.path].view : defaultPerms[p.path].view,
                edit: savedPerms[p.path]?.edit !== undefined ? savedPerms[p.path].edit : defaultPerms[p.path].edit,
            };
        });
        return resolved;
    }, [loggedInUser, rolePermissions]);

    const navigate = useNavigate(); 
    const location = useLocation();

    // Sidebar'ı kapatma fonksiyonu (sayfa değişince otomatik kapansın diye)
    useEffect(() => {
        setIsSidebarOpen(false);
    }, [location.pathname]);

    useEffect(() => {
        if (loggedInUser && !loggedInUser.role) {
            console.warn("Kullanıcı verisi bozuk, otomatik çıkış yapılıyor.");
            setLoggedInUser(null);
            localStorage.removeItem('kaliphane_user');
            navigate('/');
        }
    }, [loggedInUser, navigate]);

    // Tezgah Operatörleri için rota sınırlandırma
    useEffect(() => {
        if (loggedInUser && loggedInUser.role === ROLES.MACHINE_OPERATOR) {
            const allowedPaths = ['/terminal', '/survey-evaluation', '/tool-history', '/tool-assignment'];
            if (!allowedPaths.includes(location.pathname)) {
                navigate('/terminal', { replace: true });
            }
        }
    }, [loggedInUser, location.pathname, navigate]);

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
        } 
        
        const personnelQuery = query(collection(db, PERSONNEL_COLLECTION), where("username", "==", "admin"));
        const adminUserSnapshot = await getDocs(personnelQuery);
        if (adminUserSnapshot.empty) {
            const samplePersonnel = [
                { id: 'person-admin', name: 'Ayşe Hanım (Yönetici)', role: PERSONNEL_ROLES.ADMIN, createdAt: getCurrentDateTimeString(), username: 'admin', password: '123' },
                { id: 'person-cam1', name: 'Emre Bey (CAM)', role: PERSONNEL_ROLES.CAM_OPERATOR, createdAt: getCurrentDateTimeString(), username: 'emre', password: '123' },
                { id: 'person-cam2', name: 'Can Bey (CAM)', role: PERSONNEL_ROLES.CAM_OPERATOR, createdAt: getCurrentDateTimeString(), username: 'can', password: '123' },
                { id: 'person-cam-sorumlu', name: 'Murat Bey (CAM Sorumlusu)', role: 'CAM Sorumlusu', createdAt: getCurrentDateTimeString(), username: 'murat', password: '123' },
                { id: 'person-sup1', name: 'Fatma Hanım (Yetkili)', role: PERSONNEL_ROLES.SUPERVISOR, createdAt: getCurrentDateTimeString(), username: 'fatma', password: '123' },
                { id: 'person-takim1', name: 'Ahmet Usta (Takımhane)', role: PERSONNEL_ROLES.TAKIMHANE_SORUMLUSU, createdAt: getCurrentDateTimeString(), username: 'ahmet', password: '123' }, 
                { id: 'person-machine1', name: 'Ali Yılmaz', role: PERSONNEL_ROLES.MACHINE_OPERATOR, createdAt: getCurrentDateTimeString(), username: null, password: null },
                { id: 'person-machine2', name: 'Burak Demir', role: PERSONNEL_ROLES.MACHINE_OPERATOR, createdAt: getCurrentDateTimeString(), username: null, password: null },
                { id: 'person-machine3', name: 'Deniz Kaya', role: PERSONNEL_ROLES.MACHINE_OPERATOR, createdAt: getCurrentDateTimeString(), username: null, password: null },
            ];
            for (const person of samplePersonnel) await setDoc(doc(db, PERSONNEL_COLLECTION, person.id), person);
        }
        
        const HARDCODED_MACHINES = [
            { name: 'K41', ekBilgi: 'CNC TORNA TEZGAHI' },
            { name: 'K60', ekBilgi: 'CNC TORNA TEZGAHI' },
            { name: 'K65', ekBilgi: 'CNC TORNA TEZGAHI' }
        ];
        
        for (const m of HARDCODED_MACHINES) {
            const machineId = `machine-${m.name}`;
            const machineRef = doc(db, MACHINES_COLLECTION, machineId);
            const machineSnap = await getDoc(machineRef);
            if (!machineSnap.exists()) {
                await setDoc(machineRef, { 
                    id: machineId, 
                    name: m.name, 
                    ekBilgi: m.ekBilgi || '',
                    createdAt: getCurrentDateTimeString() 
                });
            }
        }

        // Clean up unwanted sample machines from database
        const UNWANTED_MACHINES = ['K40', 'K70', 'Fİ-200', 'AG-500', 'DECKEL-50'];
        for (const name of UNWANTED_MACHINES) {
            await deleteDoc(doc(db, MACHINES_COLLECTION, `machine-${name}`));
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
        const unsubscribePermissions = onSnapshot(query(collection(db, 'role_permissions')), (snapshot) => {
            const data = {};
            snapshot.docs.forEach(doc => {
                data[doc.id] = doc.data().permissions;
            });
            setRolePermissions(data);
        });

        const unsubscribeMenuLayout = onSnapshot(doc(db, 'config', 'menuLayout'), (docSnap) => {
            if (docSnap.exists()) {
                setMenuLayout(docSnap.data());
            } else {
                setMenuLayout(null);
            }
        });

        return () => { 
            unsubscribePersonnel(); 
            unsubscribeMachines(); 
            unsubscribeInventory(); 
            unsubscribePermissions();
            unsubscribeMenuLayout();
        };
    }, [userId, seedInitialData]); 
    
    useEffect(() => {
        if (!db || !userId || !loggedInUser) return;
        setIsProjectsLoading(true);

        const unsubscribeProjects = onSnapshot(query(collection(db, PROJECT_COLLECTION)), (snapshot) => {
            const cleanData = [];
            snapshot.docs.forEach(d => {
                const data = d.data();
                if (data.moldName && typeof data.moldName === 'string' && data.moldName.trim() !== '') {
                    cleanData.push({ id: d.id, ...data });
                }
            });
            setProjects(cleanData); 
            setIsProjectsLoading(false);
        });

        const unsubscribeCncJobs = onSnapshot(query(collection(db, CNC_LATHE_JOBS_COLLECTION)), (snapshot) => {
            setCncJobs(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        const unsubscribeDesignJobs = onSnapshot(query(collection(db, DESIGN_JOBS_COLLECTION)), (snapshot) => {
            setDesignJobs(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        return () => {
            unsubscribeProjects();
            unsubscribeCncJobs();
            unsubscribeDesignJobs(); 
        };
    }, [userId, loggedInUser]);

    const handleUpdateOperation = useCallback(async (moldId, taskId, updatedOperationData, actionType = null, pauseReason = null) => {
        if (!db) return;
        const currentProject = projects.find(p => p.id === moldId);
        if (!currentProject) return;
        const taskIndex = currentProject.tasks.findIndex(t => t.id === taskId);
        if (taskIndex === -1) return;
        const currentTask = currentProject.tasks[taskIndex];
        const operationIndex = currentTask.operations.findIndex(op => op.id === updatedOperationData.id);
        if (operationIndex === -1) return;

        const oldOperation = currentTask.operations[operationIndex];
        const now = getCurrentDateTimeString();

        if (actionType === 'PAUSE_JOB' || (oldOperation.status !== OPERATION_STATUS.PAUSED && updatedOperationData.status === OPERATION_STATUS.PAUSED)) {
            if (!updatedOperationData.lastPausedAt) {
                updatedOperationData.lastPausedAt = now;
            }
            if (pauseReason) {
                updatedOperationData.lastPauseReason = pauseReason;
            }
        } 
        else if (actionType === 'RESUME_JOB' || (oldOperation.status === OPERATION_STATUS.PAUSED && updatedOperationData.status === OPERATION_STATUS.IN_PROGRESS)) {
            if (oldOperation.lastPausedAt && updatedOperationData.lastPausedAt !== null) {
                
                const pauseHistory = (oldOperation.pauseHistory && Array.isArray(oldOperation.pauseHistory)) 
                    ? [...oldOperation.pauseHistory] 
                    : [];

                pauseHistory.push({
                    pausedAt: oldOperation.lastPausedAt,
                    resumedAt: now,
                    reason: pauseReason || oldOperation.lastPauseReason || 'Belirtilmedi'
                });
                
                updatedOperationData.pauseHistory = pauseHistory;
                updatedOperationData.lastPausedAt = null; 
                updatedOperationData.lastPauseReason = null; 
            }
        }

        const newOperations = [...currentTask.operations];
        newOperations[operationIndex] = updatedOperationData;
        const newTasks = [...currentProject.tasks];
        newTasks[taskIndex] = { ...currentTask, operations: newOperations };
        
        try { await updateDoc(doc(db, PROJECT_COLLECTION, moldId), { tasks: newTasks }); } catch (e) { console.error("Hata:", e); }
    }, [projects]);
    
    const handleUpdatePauseReason = useCallback(async (moldId, taskId, opId, pauseIndex, newReason) => {
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

        if (pauseIndex === 'current') {
            updatedOp.lastPauseReason = newReason;
        } else {
            const pauseHistory = (currentOp.pauseHistory && Array.isArray(currentOp.pauseHistory))
                ? [...currentOp.pauseHistory]
                : [];
            if (pauseHistory[pauseIndex]) {
                pauseHistory[pauseIndex].reason = newReason;
            }
            updatedOp.pauseHistory = pauseHistory;
        }

        const newOps = [...currentTask.operations];
        newOps[opIndex] = updatedOp;
        const newTasks = [...currentProject.tasks];
        newTasks[taskIndex] = { ...currentTask, operations: newOps };

        try {
            await updateDoc(moldRef, { tasks: newTasks });
        } catch (e) {
            console.error("Duraklatma sebebi güncellenemedi:", e);
        }
    }, [projects]);

    const handleTerminalAction = useCallback(async (moldId, taskId, opId, actionType, operatorName, pauseReason = null) => {
        if (!db) return;
        
        if (actionType === 'SHIFT_START' || actionType === 'SHIFT_END') {
            const now = getCurrentDateTimeString();
            const today = now.substring(0, 10);
            const logId = `${operatorName.replace(/\s+/g, '_')}-${Date.now()}`;
            const machineName = (pauseReason && pauseReason.machineName) ? pauseReason.machineName : 'Bilinmeyen Tezgah';
            
            try {
                await setDoc(doc(db, `artifacts/default-app-id/public/data/operatorShiftLogs`, logId), {
                    id: logId,
                    operatorName,
                    machineName,
                    action: actionType,
                    timestamp: now,
                    date: today
                });
            } catch (err) {
                console.error("Vardiya logu kaydedilemedi:", err);
            }
            return;
        }
        
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
            updatedOp.productionStartTime = null;
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
            updatedOp.lastPausedAt = now;
            if (pauseReason) {
                updatedOp.lastPauseReason = pauseReason;
            }
        }
        else if (actionType === 'RESUME_JOB') { 
            updatedOp.status = OPERATION_STATUS.IN_PROGRESS;
            if (updatedOp.lastPausedAt) {
                const pauseHistory = (currentOp.pauseHistory && Array.isArray(currentOp.pauseHistory)) 
                    ? [...currentOp.pauseHistory] 
                    : [];

                pauseHistory.push({
                    pausedAt: updatedOp.lastPausedAt,
                    resumedAt: now,
                    reason: pauseReason || currentOp.lastPauseReason || 'Belirtilmedi'
                });

                updatedOp.pauseHistory = pauseHistory;
                updatedOp.lastPausedAt = null; 
                updatedOp.lastPauseReason = null; 
            }
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

        try { await updateDoc(moldRef, { tasks: newTasks }); } catch (e) { console.error("Terminal işlemi hatası:", e); }
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
        
        updatedOp.lastPausedAt = null; 
        updatedOp.lastPauseReason = null;

        const newOps = [...currentTask.operations];
        newOps[opIndex] = updatedOp;
        const newTasks = [...currentProject.tasks];
        newTasks[taskIndex] = { ...currentTask, operations: newOps };
        await updateDoc(moldRef, { tasks: newTasks });
    }, [projects, loggedInUser]);

    const handleChangeMachineOperator = useCallback(async (moldId, taskId, opId, newOperatorName, rating, comment) => {
        if (!db) return;
        const currentProject = projects.find(p => p.id === moldId);
        if (!currentProject) return;
        const taskIndex = currentProject.tasks.findIndex(t => t.id === taskId);
        if (taskIndex === -1) return;
        const currentTask = currentProject.tasks[taskIndex];
        const operationIndex = currentTask.operations.findIndex(op => op.id === opId);
        if (operationIndex === -1) return;

        const currentOp = currentTask.operations[operationIndex];
        const oldOperatorName = currentOp.machineOperatorName;
        
        const newHistoryRecord = {
            operatorName: oldOperatorName,
            rating: rating,
            comment: comment || '',
            changedAt: getCurrentDateTimeString(),
            changedBy: loggedInUser.name
        };

        const updatedOp = { 
            ...currentOp, 
            machineOperatorName: newOperatorName,
            operatorHistory: currentOp.operatorHistory ? [...currentOp.operatorHistory, newHistoryRecord] : [newHistoryRecord]
        };

        const newOperations = [...currentTask.operations];
        newOperations[operationIndex] = updatedOp;
        const newTasks = [...currentProject.tasks];
        newTasks[taskIndex] = { ...currentTask, operations: newOperations };

        try { await updateDoc(doc(db, PROJECT_COLLECTION, moldId), { tasks: newTasks }); } catch (e) { console.error("Operatör değiştirme hatası:", e); }
    }, [projects, loggedInUser]);

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
    const handleUpdateCamResponsible = useCallback(async (id, val) => { if(db) await updateDoc(doc(db, PROJECT_COLLECTION, id), { camResponsible: val || '' }); }, []);
    const handleUpdateMoldDesigner = useCallback(async (id, val) => { if(db) await updateDoc(doc(db, PROJECT_COLLECTION, id), { moldDesigner: val || '' }); }, []);
    const handleDeleteMold = useCallback(async (id) => { if(db) { await deleteDoc(doc(db, PROJECT_COLLECTION, id)); await deleteDoc(doc(db, MOLD_NOTES_COLLECTION, id)); if (location.pathname.includes(id)) navigate('/'); } }, [location.pathname, navigate]);
    const handleUpdateMold = useCallback(async (id, data) => { if(db) await updateDoc(doc(db, PROJECT_COLLECTION, id), data); }, []);

    const isForkliftOp = loggedInUser?.role === ROLES.FORKLIFT_OPERATORU;
    const isAssemblyOp = loggedInUser?.role === ROLES.MONTAJ_SORUMLUSU; 

    // --- DEFAULT MENU LAYOUT FALLBACK ---
    const DEFAULT_MENU_CATEGORIES = useMemo(() => [
        {
            id: "cat-1",
            title: "Kalıphane Planlama & İzleme",
            pagePaths: ["/", "/canli-durum", "/vardiya-plani", "/vardiya-takip", "/project-management", "/design-office", "/machine-queue", "/mold-trial-reports", "/mold-maintenance", "/machine-maintenance", "/active", "/workshop-supervisor"]
        },
        {
            id: "cat-2",
            title: "Depo & Stok Yönetimi",
            pagePaths: ["/tool-inventory", "/tool-assignment", "/tool-requests", "/mold-material-debits", "/tool-history", "/tool-analysis", "/tool-lifecycle", "/mold-tool-tracking"]
        },
        {
            id: "cat-3",
            title: "CNC Torna Bölümü",
            pagePaths: ["/cnc-lathe-planning", "/cnc-raw-material", "/cnc-lathe-calendar", "/cnc-torna", "/cnc-part-manager", "/cnc-spc-analysis", "/cnc-inspection-report", "/operator-performance", "/cnc-torna-history"]
        },
        {
            id: "cat-4",
            title: "Yönetim & Diğer",
            pagePaths: ["/admin", "/admin/layout", "/history", "/analysis", "/terminal", "/forklift", "/assembly", "/continuous-improvement", "/survey-evaluation"]
        }
    ], []);

    const menuCategories = useMemo(() => {
        const userRole = loggedInUser?.role;
        const categories = menuLayout?.roleLayouts?.[userRole] || menuLayout?.categories || DEFAULT_MENU_CATEGORIES;
        if (!loggedInUser || !loggedInUser.role) return [];
        if (loggedInUser.role === ROLES.FORKLIFT_OPERATORU || loggedInUser.role === ROLES.MONTAJ_SORUMLUSU) return [];

        const iconMap = {
            List: List,
            Radio: Radio,
            Moon: Moon,
            Truck: Truck,
            Briefcase: Briefcase,
            PenTool: PenTool,
            ListOrdered: ListOrdered,
            ClipboardCheck: ClipboardCheck,
            Wrench: Wrench,
            PlayCircle: PlayCircle,
            Package: Package,
            Layers: Layers,
            FileText: FileText,
            TrendingUp: TrendingUp,
            Activity: Activity,
            FolderOpen: FolderOpen,
            Settings: Settings,
            Clock: Clock,
            LayoutDashboard: LayoutDashboard,
            MapIcon: MapIcon,
            History: History,
            BarChart2: BarChart2,
            Monitor: Monitor,
            Target: Target,
            Database: Database,
            Calendar: Calendar,
            Box: Box,
            FileOutput: FileOutput,
            Users: Users,
            Archive: Archive
        };

        // 1. Build a lookup map of all pages that the active user is allowed to view
        const allowedPagesMap = {};
        ALL_SYSTEM_PAGES.forEach(page => {
            const permission = activeUserPermissions[page.path] || { view: false, edit: false };
            if (permission.view) {
                allowedPagesMap[page.path] = {
                    path: page.path,
                    label: page.label,
                    icon: iconMap[page.iconName] || Settings
                };
            }
        });

        // 2. Map categories and keep track of which paths have been categorized
        const categorizedPaths = new Set();
        const result = categories.map(cat => {
            const items = [];
            cat.pagePaths.forEach(path => {
                if (allowedPagesMap[path]) {
                    items.push(allowedPagesMap[path]);
                    categorizedPaths.add(path);
                }
            });
            return {
                id: cat.id,
                title: cat.title,
                items
            };
        }).filter(cat => cat.items.length > 0);

        // 3. Any allowed page that is NOT categorized goes to a fallback category at the bottom
        const uncategorizedItems = [];
        Object.keys(allowedPagesMap).forEach(path => {
            if (!categorizedPaths.has(path)) {
                uncategorizedItems.push(allowedPagesMap[path]);
            }
        });

        if (uncategorizedItems.length > 0) {
            result.push({
                id: "uncategorized",
                title: "Diğer İşlemler",
                items: uncategorizedItems
            });
        }

        return result;
    }, [loggedInUser, activeUserPermissions, menuLayout, DEFAULT_MENU_CATEGORIES]);

    const toggleCategory = (catId) => {
        setExpandedCategories(prev => {
            const next = { ...prev, [catId]: !prev[catId] };
            localStorage.setItem('kaliphane_expanded_categories', JSON.stringify(next));
            return next;
        });
    };

    if (!userId) return <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900"><RefreshCw className="w-8 h-8 text-blue-500 animate-spin" /><p className="ml-3 text-lg text-gray-600 dark:text-gray-400">Kimlik doğrulanıyor...</p></div>;
    if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900"><RefreshCw className="w-8 h-8 text-blue-500 animate-spin" /><p className="ml-3 text-lg text-gray-600 dark:text-gray-400">Personel verisi yükleniyor...</p></div>;
    
    if (loggedInUser && loggedInUser.role === ROLES.TERMINAL_USER) {
        const handleLogoutApp = () => {
            setLoggedInUser(null);
            localStorage.removeItem('kaliphane_user');
            navigate('/');
        };
        return (
            <TerminalPage 
                db={db}
                personnel={personnel} 
                projects={projects} 
                machines={machines} 
                handleTerminalAction={handleTerminalAction} 
                handleUpdatePauseReason={handleUpdatePauseReason}
                isTerminalRole={true}
                onLogout={handleLogoutApp}
            />
        );
    }

    if (location.pathname === '/terminal' && loggedInUser?.role !== ROLES.MACHINE_OPERATOR) {
        return <TerminalPage db={db} personnel={personnel} projects={projects} machines={machines} handleTerminalAction={handleTerminalAction} handleUpdatePauseReason={handleUpdatePauseReason} />;
    }

    if (!loggedInUser) {
        return <CredentialLoginScreen db={db} setLoggedInUser={setLoggedInUser} personnel={personnel} />;
    }
    
    if (isProjectsLoading) return <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900"><RefreshCw className="w-8 h-8 text-blue-500 animate-spin" /><p className="ml-3 text-lg text-gray-600 dark:text-gray-400">Sistem verileri yükleniyor...</p></div>;

    return (
        <div className="flex h-screen bg-[var(--app-bg-light)] dark:bg-[var(--app-bg-dark)] font-sans overflow-hidden">
            
            {/* GÖLGELENDİRME (Açıkken arkayı karartır ve tıklanınca menüyü kapatır) */}
            {isSidebarOpen && !isForkliftOp && !isAssemblyOp && (
                <div 
                    className="fixed inset-0 bg-black/50 z-40 transition-opacity"
                    onClick={() => setIsSidebarOpen(false)}
                />
            )}

            {/* SİDEBAR (Sol Menü - ÇEKMECE) */}
            {(!isForkliftOp && !isAssemblyOp) && (
                <aside 
                    className={`fixed top-0 left-0 h-full w-64 bg-[var(--sidebar-bg-light)] dark:bg-[var(--sidebar-bg-dark)] border-r border-[var(--border-light)] dark:border-[var(--border-dark)] z-50 transform transition-transform duration-300 ease-in-out flex flex-col shadow-2xl ${
                        isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
                    }`}
                >
                    {/* Üst Logo/Başlık Alanı */}
                    <div className="p-6 flex items-center justify-between border-b border-[var(--border-light)] dark:border-[var(--border-dark)] shrink-0">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-500/30">
                                <LayoutDashboard className="w-5 h-5 text-white" />
                            </div>
                            <span className="font-black text-xl text-gray-900 dark:text-white tracking-tight">Kalıphane<span className="text-blue-500">.io</span></span>
                        </div>
                        <button onClick={() => setIsSidebarOpen(false)} className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition">
                            <X className="w-6 h-6" />
                        </button>
                    </div>

                    {/* Menü Elemanları */}
                    <nav className="flex-1 overflow-y-auto custom-scrollbar p-2">
                        <div className="space-y-3">
                            {menuCategories.map(cat => {
                                const isExpanded = !!expandedCategories[cat.id];
                                return (
                                    <div key={cat.id} className="space-y-1">
                                        <button
                                            onClick={() => toggleCategory(cat.id)}
                                            className="w-full px-3 py-1.5 flex items-center justify-between text-[11px] font-black uppercase tracking-wider text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors pt-2"
                                        >
                                            <span>{cat.title}</span>
                                            {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                                        </button>
                                        {isExpanded && (
                                            <div className="space-y-0.5 pl-1.5 border-l-2 border-gray-100 dark:border-gray-800 ml-2">
                                                {cat.items.map(item => (
                                                    <SidebarNavItem
                                                        key={item.path}
                                                        icon={item.icon}
                                                        label={item.label}
                                                        isActive={location.pathname === item.path}
                                                        onClick={() => {
                                                            navigate(item.path);
                                                            setIsSidebarOpen(false); // Close sidebar on mobile
                                                        }}
                                                    />
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </nav>

                    {/* Alt Kullanıcı Kartı */}
                    <div className="p-4 border-t dark:border-gray-800 shrink-0 bg-gray-50 dark:bg-gray-800/30 m-4 rounded-2xl">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center shrink-0">
                                <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{loggedInUser.name}</p>
                                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{loggedInUser.role}</p>
                            </div>
                        </div>
                        <button
                            onClick={() => {
                                setLoggedInUser(null); 
                                localStorage.removeItem('kaliphane_user'); 
                                navigate('/');
                            }}
                            className="w-full flex items-center justify-center text-sm py-2 bg-red-50 hover:bg-red-100 text-red-600 dark:bg-red-900/20 dark:hover:bg-red-900/40 dark:text-red-400 rounded-xl font-bold transition-colors"
                        >
                            <LogOut className="w-4 h-4 mr-2"/> Güvenli Çıkış
                        </button>
                        
                        <div className="mt-3 pt-3 border-t border-gray-250 dark:border-gray-700 space-y-2.5">
                            {/* Dark/Light Mode Toggle */}
                            <button
                                onClick={() => setDarkMode(!darkMode)}
                                className="w-full flex items-center justify-center gap-2 text-xs py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700 dark:text-gray-200 rounded-xl font-bold transition-colors"
                            >
                                {darkMode ? (
                                    <>
                                        <Sun className="w-4 h-4 text-amber-555" /> Açık Tema
                                    </>
                                ) : (
                                    <>
                                        <Moon className="w-4 h-4 text-indigo-400" /> Koyu Tema
                                    </>
                                )}
                            </button>

                            {/* Theme Presets */}
                            <div className="flex items-center justify-between px-1.5 pt-1">
                                <span className="text-[10px] font-black uppercase text-gray-400 dark:text-gray-500 tracking-wider">Arayüz Stili:</span>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setTheme('blue')}
                                        className={`w-5 h-5 rounded-full bg-[#3b82f6] border-2 transition-all ${theme === 'blue' ? 'border-white dark:border-gray-900 ring-2 ring-blue-500 scale-115 shadow-md' : 'border-transparent hover:scale-110'}`}
                                        title="Klasik Mavi"
                                    />
                                    <button
                                        onClick={() => setTheme('cobalt')}
                                        className={`w-5 h-5 rounded-full bg-[#327ec2] border-2 transition-all ${theme === 'cobalt' ? 'border-white dark:border-gray-900 ring-2 ring-blue-600 scale-115 shadow-md' : 'border-transparent hover:scale-110'}`}
                                        title="Endüstriyel Çelik Mavi"
                                    />
                                    <button
                                        onClick={() => setTheme('mint')}
                                        className={`w-5 h-5 rounded-full bg-[#10b981] border-2 transition-all ${theme === 'mint' ? 'border-white dark:border-gray-900 ring-2 ring-emerald-500 scale-115 shadow-md' : 'border-transparent hover:scale-110'}`}
                                        title="Nane Temiz Oda"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </aside>
            )}

            {/* ANA İÇERİK ALANI (Sağ Taraf) */}
            <main className="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-[var(--content-bg-light)] dark:bg-[var(--content-bg-dark)] w-full">
                
                {/* ÜST BAR (Header) */}
                <header className="h-16 flex items-center justify-between px-4 sm:px-6 lg:px-8 border-b border-[var(--border-light)] dark:border-[var(--border-dark)] bg-[var(--sidebar-bg-light)]/50 dark:bg-[var(--sidebar-bg-dark)]/50 backdrop-blur-md sticky top-0 z-30 shrink-0 w-full">
                    <div className="flex items-center">
                        {(!isForkliftOp && !isAssemblyOp) && (
                            <button 
                                onClick={() => setIsSidebarOpen(true)}
                                className="mr-4 p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
                            >
                                <Menu className="w-6 h-6" />
                            </button>
                        )}
                        <h1 className="text-xl font-black text-gray-800 dark:text-white truncate">
                            {(isForkliftOp || isAssemblyOp) ? 'Kalıphane İş Akışı Takibi' : ALL_SYSTEM_PAGES.find(item => item.path === location.pathname)?.label || 'Gösterge Paneli'}
                        </h1>
                    </div>
                    
                    <div className="flex items-center gap-4">
                        <div className="hidden sm:flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                            <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{getCurrentDateTimeString().split(' ')[0]}</span>
                        </div>
                    </div>
                </header>

                {/* SAYFA İÇERİKLERİ (Scroll edilebilir alan) */}
                <div className="flex-1 overflow-y-auto custom-scrollbar w-full">
                    <Routes>
                        <Route path="/" element={
                            isForkliftOp ? <Navigate to="/forklift" replace />
                            : isAssemblyOp ? <Navigate to="/assembly" replace />
                            : (loggedInUser?.role === ROLES.CNC_TORNA_OPERATORU || loggedInUser?.role === ROLES.CNC_TORNA_SORUMLUSU)
                            ? <Navigate to="/cnc-torna" replace /> 
                            : <EnhancedMoldList projects={projects} loggedInUser={loggedInUser} handleDeleteMold={handleDeleteMold} handleUpdateMold={handleUpdateMold} />
                        } />

                        {/* YENİ EKLENEN CANLI DURUM VE VARDİYA PLANI ROTALARI */}
                        <Route path="/canli-durum" element={<CanliDurum db={db} />} />
                        <Route path="/vardiya-plani" element={<NightShiftPlanner db={db} loggedInUser={loggedInUser} />} />
                        <Route path="/vardiya-takip" element={
                            (loggedInUser?.role === ROLES.CAM_OPERATOR || loggedInUser?.role === 'CAM Sorumlusu' || loggedInUser?.role === ROLES.ADMIN)
                            ? <ShiftPlannerPage db={db} loggedInUser={loggedInUser} personnel={personnel} />
                            : <Navigate to="/" replace />
                        } />
                        <Route path="/continuous-improvement" element={<ContinuousImprovementPage loggedInUser={loggedInUser} />} />

                        {/* ROTALAR VE YETKİLENDİRME KORUMALARI */}
                        <Route path="/" element={
                            activeUserPermissions['/']?.view 
                            ? <EnhancedMoldList projects={projects} loggedInUser={loggedInUser} canEdit={activeUserPermissions['/']?.edit} /> 
                            : <Navigate to={activeUserPermissions['/terminal']?.view ? '/terminal' : (activeUserPermissions['/cnc-torna']?.view ? '/cnc-torna' : '/')} replace />
                        } />

                        <Route path="/canli-durum" element={
                            activeUserPermissions['/canli-durum']?.view
                            ? <CanliDurum db={db} projects={projects} machines={machines} personnel={personnel} />
                            : <Navigate to="/" replace />
                        } />

                        <Route path="/vardiya-plani" element={
                            activeUserPermissions['/vardiya-plani']?.view
                            ? <NightShiftPlanner db={db} loggedInUser={loggedInUser} canEdit={activeUserPermissions['/vardiya-plani']?.edit} />
                            : <Navigate to="/" replace />
                        } />

                        <Route path="/vardiya-takip" element={
                            activeUserPermissions['/vardiya-takip']?.view
                            ? <ShiftPlannerPage db={db} loggedInUser={loggedInUser} canEdit={activeUserPermissions['/vardiya-takip']?.edit} />
                            : <Navigate to="/" replace />
                        } />

                        <Route path="/forklift" element={
                            activeUserPermissions['/forklift']?.view
                            ? <ForkliftDashboard db={db} loggedInUser={loggedInUser} canEdit={activeUserPermissions['/forklift']?.edit} />
                            : <Navigate to="/" replace />
                        } />

                        <Route path="/assembly" element={
                            activeUserPermissions['/assembly']?.view
                            ? <AssemblyDashboard db={db} loggedInUser={loggedInUser} canEdit={activeUserPermissions['/assembly']?.edit} />
                            : <Navigate to="/" replace />
                        } />

                        <Route path="/active" element={
                            activeUserPermissions['/active']?.view
                            ? <ActiveTasksPage projects={projects} machines={machines} loggedInUser={loggedInUser} personnel={personnel} handleUpdateMachineStatus={handleUpdateMachineStatus} canEdit={activeUserPermissions['/active']?.edit} />
                            : <Navigate to="/" replace />
                        } />

                        <Route path="/cam" element={
                            activeUserPermissions['/cam']?.view
                            ? <CamDashboard loggedInUser={loggedInUser} projects={projects} handleUpdateOperation={handleUpdateOperation} handleAddOperation={handleAddOperation} handleChangeMachineOperator={handleChangeMachineOperator} personnel={personnel} machines={machines} canEdit={activeUserPermissions['/cam']?.edit} />
                            : <Navigate to="/" replace />
                        } />

                        <Route path="/project-management" element={
                            activeUserPermissions['/project-management']?.view
                            ? <ProjectManagementPage projects={projects} personnel={personnel} loggedInUser={loggedInUser} canEdit={activeUserPermissions['/project-management']?.edit} />
                            : <Navigate to="/" replace />
                        } />

                        <Route path="/design-office" element={
                            activeUserPermissions['/design-office']?.view
                            ? <DesignOfficePage projects={projects} personnel={personnel} loggedInUser={loggedInUser} db={db} designJobs={designJobs} canEdit={activeUserPermissions['/design-office']?.edit} />
                            : <Navigate to="/" replace />
                        } />

                        <Route path="/machine-queue" element={
                            activeUserPermissions['/machine-queue']?.view
                            ? <MachineQueuePage db={db} loggedInUser={loggedInUser} canEdit={activeUserPermissions['/machine-queue']?.edit} />
                            : <Navigate to="/" replace />
                        } />

                        <Route path="/mold-trial-reports" element={
                            activeUserPermissions['/mold-trial-reports']?.view
                            ? <MoldTrialReportsPage db={db} loggedInUser={loggedInUser} projects={projects} canEdit={activeUserPermissions['/mold-trial-reports']?.edit} />
                            : <Navigate to="/" replace />
                        } />

                        <Route path="/tool-inventory" element={
                            activeUserPermissions['/tool-inventory']?.view
                            ? <ToolInventoryPage tools={tools} loggedInUser={loggedInUser} db={db} machines={machines} personnel={personnel} canEdit={activeUserPermissions['/tool-inventory']?.edit} />
                            : <Navigate to="/" replace />
                        } />

                        <Route path="/tool-assignment" element={
                            activeUserPermissions['/tool-assignment']?.view
                            ? <ToolAssignmentPage tools={tools} machines={machines} personnel={personnel} loggedInUser={loggedInUser} db={db} projects={projects} canEdit={activeUserPermissions['/tool-assignment']?.edit} />
                            : <Navigate to="/" replace />
                        } />

                        <Route path="/tool-requests" element={
                            activeUserPermissions['/tool-requests']?.view
                            ? <ToolRequestBridgePage db={db} loggedInUser={loggedInUser} machines={machines} projects={projects} />
                            : <Navigate to="/" replace />
                        } />

                        <Route path="/mold-material-debits" element={
                            activeUserPermissions['/mold-material-debits']?.view
                            ? <MoldMaterialDebitsPage loggedInUser={loggedInUser} personnel={personnel} canEdit={activeUserPermissions['/mold-material-debits']?.edit} />
                            : <Navigate to="/" replace />
                        } />

                        <Route path="/tool-history" element={
                            activeUserPermissions['/tool-history']?.view
                            ? <ToolHistoryPage machines={machines} db={db} tools={tools} />
                            : <Navigate to="/" replace />
                        } />

                        <Route path="/tool-analysis" element={
                            activeUserPermissions['/tool-analysis']?.view
                            ? <ToolAnalysisPage db={db} />
                            : <Navigate to="/" replace />
                        } />

                        <Route path="/tool-lifecycle" element={
                            activeUserPermissions['/tool-lifecycle']?.view
                            ? <ToolLifecycleAnalysis db={db} />
                            : <Navigate to="/" replace />
                        } /> 

                        <Route path="/mold-tool-tracking" element={
                            activeUserPermissions['/mold-tool-tracking']?.view
                            ? <MoldBasedToolTracking db={db} />
                            : <Navigate to="/" replace />
                        } />

                        <Route path="/mold-maintenance" element={
                            activeUserPermissions['/mold-maintenance']?.view
                            ? <MoldMaintenancePage db={db} loggedInUser={loggedInUser} canEdit={activeUserPermissions['/mold-maintenance']?.edit} />
                            : <Navigate to="/" replace />
                        } />

                        <Route path="/machine-maintenance" element={
                            activeUserPermissions['/machine-maintenance']?.view
                            ? <MachineMaintenancePage db={db} machines={machines} loggedInUser={loggedInUser} canEdit={activeUserPermissions['/machine-maintenance']?.edit} />
                            : <Navigate to="/" replace />
                        } />
                        
                        <Route path="/cam-operator-dashboard" element={
                            activeUserPermissions['/cam-operator-dashboard']?.view
                            ? <CamOperatorDashboard db={db} loggedInUser={loggedInUser} />
                            : <Navigate to="/" replace />
                        } />

                        <Route path="/cnc-torna" element={
                            activeUserPermissions['/cnc-torna']?.view
                            ? <CncLatheDashboard db={db} loggedInUser={loggedInUser} cncJobs={cncJobs} canEdit={activeUserPermissions['/cnc-torna']?.edit} />
                            : <Navigate to="/" replace />
                        } />

                        <Route path="/cnc-torna-history" element={
                            activeUserPermissions['/cnc-torna-history']?.view
                            ? <CncLatheHistoryPage db={db} loggedInUser={loggedInUser} cncJobs={cncJobs} />
                            : <Navigate to="/" replace />
                        } />

                        <Route path="/cnc-part-manager" element={
                            activeUserPermissions['/cnc-part-manager']?.view
                            ? <CncPartManager db={db} canEdit={activeUserPermissions['/cnc-part-manager']?.edit} />
                            : <Navigate to="/" replace />
                        } />

                        <Route path="/cnc-spc-analysis" element={
                            activeUserPermissions['/cnc-spc-analysis']?.view
                            ? <CncSpcAnalysisPage db={db} />
                            : <Navigate to="/" replace />
                        } />

                        <Route path="/cnc-inspection-report" element={
                            activeUserPermissions['/cnc-inspection-report']?.view
                            ? <CncInspectionReport db={db} />
                            : <Navigate to="/" replace />
                        } />

                        <Route path="/operator-performance" element={
                            activeUserPermissions['/operator-performance']?.view
                            ? <CncOperatorPerformance db={db} loggedInUser={loggedInUser} cncJobs={cncJobs} />
                            : <Navigate to="/" replace />
                        } />

                        <Route path="/cnc-lathe-planning" element={
                            activeUserPermissions['/cnc-lathe-planning']?.view
                            ? <CncLathePlanningPage db={db} cncJobs={cncJobs} canEdit={activeUserPermissions['/cnc-lathe-planning']?.edit} />
                            : <Navigate to="/" replace />
                        } />

                        <Route path="/cnc-raw-material" element={
                            activeUserPermissions['/cnc-raw-material']?.view
                            ? <CncLatheRawMaterialPlanningPage db={db} canEdit={activeUserPermissions['/cnc-raw-material']?.edit} />
                            : <Navigate to="/" replace />
                        } />

                        <Route path="/cnc-lathe-calendar" element={
                            activeUserPermissions['/cnc-lathe-calendar']?.view
                            ? <CncLatheCalendarPage cncJobs={cncJobs} />
                            : <Navigate to="/" replace />
                        } />

                        <Route path="/admin" element={
                            activeUserPermissions['/admin']?.view
                            ? <AdminDashboard db={db} projects={projects} setProjects={setProjects} personnel={personnel} setPersonnel={setPersonnel} machines={machines} setMachines={setMachines} handleDeleteMold={handleDeleteMold} handleUpdateMold={handleUpdateMold} loggedInUser={loggedInUser} canEdit={activeUserPermissions['/admin']?.edit} />
                            : <Navigate to="/" replace />
                        } />

                        <Route path="/admin/layout" element={
                            activeUserPermissions['/admin/layout']?.view
                            ? <WorkshopEditorPage machines={machines} projects={projects} />
                            : <Navigate to="/" replace />
                        } />

                        <Route path="/history" element={
                            activeUserPermissions['/history']?.view
                            ? <HistoryPage projects={projects} />
                            : <Navigate to="/" replace />
                        } />

                        <Route path="/analysis" element={
                            activeUserPermissions['/analysis']?.view
                            ? <AnalysisPage projects={projects} personnel={personnel} loggedInUser={loggedInUser} />
                            : <Navigate to="/" replace />
                        } />

                        <Route path="/terminal" element={
                            activeUserPermissions['/terminal']?.view
                            ? <TerminalPage 
                                db={db}
                                personnel={personnel} 
                                projects={projects} 
                                machines={machines} 
                                handleTerminalAction={handleTerminalAction} 
                                handleUpdatePauseReason={handleUpdatePauseReason}
                                loggedInUser={loggedInUser}
                                onLogout={() => {
                                    setLoggedInUser(null);
                                    localStorage.removeItem('kaliphane_user');
                                    navigate('/');
                                }}
                              />
                            : <Navigate to="/" replace />
                        } />

                        <Route path="/cam-job-entry" element={
                            activeUserPermissions['/cam-job-entry']?.view
                            ? <CamJobEntryPage projects={projects} personnel={personnel} loggedInUser={loggedInUser} />
                            : <Navigate to="/" replace />
                        } />

                        <Route path="/survey-evaluation" element={
                            activeUserPermissions['/survey-evaluation']?.view
                            ? <SurveyEvaluationPage loggedInUser={loggedInUser} personnel={personnel} />
                            : <Navigate to="/" replace />
                        } />

                        <Route path="/workshop-supervisor" element={
                            activeUserPermissions['/workshop-supervisor']?.view
                            ? <WorkshopSupervisorPage db={db} projects={projects} personnel={personnel} machines={machines} />
                            : <Navigate to="/" replace />
                        } />

                        <Route path="/mold/:moldId" element={<MoldDetailPage loggedInUser={loggedInUser} handleUpdateOperation={handleUpdateOperation} handleAddOperation={handleAddOperation} handleReportOperationIssue={handleReportOperationIssue} handleSetCriticalTask={handleSetCriticalTask} handleUpdateMoldStatus={handleUpdateMoldStatus} handleUpdateMoldDeadline={handleUpdateMoldDeadline} handleUpdateMoldPriority={handleUpdateMoldPriority} handleUpdateTrialReportUrl={handleUpdateTrialReportUrl} handleUpdateProductImageUrl={handleUpdateProductImageUrl} handleUpdateProjectManager={handleUpdateProjectManager} handleUpdateMoldDesigner={handleUpdateMoldDesigner} handleUpdateCamResponsible={handleUpdateCamResponsible} projects={projects} personnel={personnel} machines={machines} db={db} />} />
                        <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                </div>
            </main>
        </div>
    );
};

export default App;