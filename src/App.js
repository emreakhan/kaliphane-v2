// src/App.js

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';

// Firebase
import { 
    db, auth, onAuthStateChanged, initialAuthToken, 
    signInWithCustomToken, signInAnonymously, 
    collection, query, getDocs, setDoc, 
    updateDoc, deleteDoc, doc, onSnapshot, where,
    PROJECT_COLLECTION, PERSONNEL_COLLECTION, MACHINES_COLLECTION,
    MOLD_NOTES_COLLECTION
} from './config/firebase.js';

// Sabitler
import { 
    ROLES, OPERATION_STATUS, mapTaskStatusToMoldStatus,
    PERSONNEL_ROLES
} from './config/constants.js';

// Yardımcılar
import { getCurrentDateTimeString } from './utils/dateUtils.js';

// İkonlar (Map ikonu eklendi)
import { RefreshCw, LayoutDashboard, Settings, BarChart2, History, List, LogOut, CheckCircle, PlayCircle, Map } from 'lucide-react';

// Sayfalar
import CredentialLoginScreen from './pages/CredentialLoginScreen.js';
import EnhancedMoldList from './pages/EnhancedMoldList.js';
import MoldDetailPage from './pages/MoldDetailPage.js';
import ActiveTasksPage from './pages/ActiveTasksPage.js';
import CamDashboard from './pages/CamDashboard.js';
import SupervisorReviewPage from './pages/SupervisorReviewPage.js';
import AdminDashboard from './pages/AdminDashboard.js';
import HistoryPage from './pages/HistoryPage.js';
import AnalysisPage from './pages/AnalysisPage.js';
import WorkshopEditorPage from './pages/WorkshopEditorPage.js'; 

// Bileşenler
import NavItem from './components/Shared/NavItem.js';
import { initialProjects } from './config/initialData.js';


// --- MAIN APP COMPONENT ---

const App = () => {
    const [userId, setUserId] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isProjectsLoading, setIsProjectsLoading] = useState(true);
    const [projects, setProjects] = useState([]);
    const [personnel, setPersonnel] = useState([]);
    const [machines, setMachines] = useState([]);
    const [loggedInUser, setLoggedInUser] = useState(null);
    
    const navigate = useNavigate(); 
    const location = useLocation();

    // ... (Seed Fonksiyonları - Değişiklik Yok) ...
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

                if(Object.keys(updates).length > 0) await updateDoc(doc(db, PROJECT_COLLECTION, project.id), updates);
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
    }, [db]); 
    
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
        return () => { unsubscribePersonnel(); unsubscribeMachines(); };
    }, [db, userId, seedInitialData]); 
    
    useEffect(() => {
        if (!db || !userId || !loggedInUser) return;
        setIsProjectsLoading(true);
        const unsubscribe = onSnapshot(query(collection(db, PROJECT_COLLECTION)), (snapshot) => {
            setProjects(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
            setIsProjectsLoading(false);
        });
        return () => unsubscribe();
    }, [db, userId, loggedInUser]);
    
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
    }, [db, projects]);

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
    }, [db, projects]);

    const handleUpdateMoldStatus = useCallback(async (moldId, newStatus) => {
        if (!db) return;
        try { await updateDoc(doc(db, PROJECT_COLLECTION, moldId), { status: newStatus }); } 
        catch (e) { console.error("Hata:", e); }
    }, [db]);
    const handleUpdateMoldDeadline = useCallback(async (moldId, newDeadline) => {
        if (!db) return;
        try { await updateDoc(doc(db, PROJECT_COLLECTION, moldId), { moldDeadline: newDeadline }); } 
        catch (e) { console.error("Hata:", e); }
    }, [db]);
    const handleUpdateMoldPriority = useCallback(async (moldId, newPriority) => {
        if (!db) return;
        try { await updateDoc(doc(db, PROJECT_COLLECTION, moldId), { priority: newPriority }); } 
        catch (e) { console.error("Hata:", e); }
    }, [db]);
    const handleUpdateTrialReportUrl = useCallback(async (moldId, newUrl) => {
        if (!db || !moldId) return;
        try { await updateDoc(doc(db, PROJECT_COLLECTION, moldId), { trialReportUrl: newUrl || '' }); } 
        catch (e) { console.error("Hata:", e); }
    }, [db]);
    const handleUpdateProductImageUrl = useCallback(async (moldId, newUrl) => {
        if (!db || !moldId) return;
        try { await updateDoc(doc(db, PROJECT_COLLECTION, moldId), { productImageUrl: newUrl || '' }); } 
        catch (e) { console.error("Hata:", e); }
    }, [db]);
    const handleUpdateProjectManager = useCallback(async (moldId, managerName) => {
        if (!db || !moldId) return;
        try { await updateDoc(doc(db, PROJECT_COLLECTION, moldId), { projectManager: managerName || '' }); } 
        catch (e) { console.error("Hata:", e); }
    }, [db]);
    const handleUpdateMoldDesigner = useCallback(async (moldId, designerName) => {
        if (!db || !moldId) return;
        try { await updateDoc(doc(db, PROJECT_COLLECTION, moldId), { moldDesigner: designerName || '' }); } 
        catch (e) { console.error("Hata:", e); }
    }, [db]);
    const handleDeleteMold = useCallback(async (moldId) => {
        if (!db || !moldId) return;
        try { 
            await deleteDoc(doc(db, PROJECT_COLLECTION, moldId));
            await deleteDoc(doc(db, MOLD_NOTES_COLLECTION, moldId)); 
            if (location.pathname.includes(moldId)) {
                navigate('/');
            }
        } catch (e) { console.error("Hata:", e); }
    }, [db, location.pathname, navigate]);
    const handleUpdateMold = useCallback(async (moldId, updatedData) => {
        if (!db || !moldId) return;
        try { await updateDoc(doc(db, PROJECT_COLLECTION, moldId), updatedData); } 
        catch (e) { console.error("Hata:", e); }
    }, [db]);


    const tasksWaitingSupervisorReviewCount = useMemo(() => {
        return projects.flatMap(p => p.tasks.flatMap(t => t.operations))
                       .filter(op => op.status === OPERATION_STATUS.WAITING_SUPERVISOR_REVIEW).length;
    }, [projects]);
    
    // --- GÜNCELLENMİŞ MENÜ YAPISI (ATÖLYE YERLEŞİMİ EKLENDİ) ---
    const navItems = useMemo(() => {
        if (!loggedInUser) return [];
        const allLoginRoles = Object.values(ROLES);
        const finalBaseItems = [
            { path: '/', label: 'Kalıp Listesi', icon: List, roles: allLoginRoles },
            { path: '/active', label: 'Çalışan Parçalar', icon: PlayCircle, roles: allLoginRoles },
            { path: '/cam', label: 'CAM İşlerim', icon: Settings, roles: [ROLES.CAM_OPERATOR] },
            { path: '/review', label: 'Değerlendirme', icon: CheckCircle, roles: [ROLES.SUPERVISOR, ROLES.ADMIN] },
            { path: '/admin', label: 'Admin Paneli', icon: LayoutDashboard, roles: [ROLES.ADMIN, ROLES.KALIP_TASARIM_SORUMLUSU] },
            
            // YENİ EKLENEN MENÜ BUTONU
            { path: '/admin/layout', label: 'Atölye Yerleşimi', icon: Map, roles: [ROLES.ADMIN] },

            { path: '/history', label: 'Geçmiş İşler', icon: History, roles: allLoginRoles },
            { path: '/analysis', label: 'Analiz', icon: BarChart2, roles: allLoginRoles },
        ];
        return finalBaseItems.filter(item => item.roles.includes(loggedInUser.role));
    }, [loggedInUser]);

    if (!userId) return <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900"><RefreshCw className="w-8 h-8 text-blue-500 animate-spin" /><p className="ml-3 text-lg text-gray-600 dark:text-gray-400">Kimlik doğrulanıyor...</p></div>;
    if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900"><RefreshCw className="w-8 h-8 text-blue-500 animate-spin" /><p className="ml-3 text-lg text-gray-600 dark:text-gray-400">Personel verisi yükleniyor...</p></div>;
    
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
                            onClick={() => {setLoggedInUser(null); navigate('/');}}
                            className="flex items-center text-sm px-3 py-1 bg-red-500 text-white rounded-lg hover:bg-red-600 transition"
                         >
                            <LogOut className="w-4 h-4 mr-1"/> Çıkış
                        </button>
                    </div>
                 </div>

                <nav className="mt-4 flex flex-wrap gap-2">
                    {navItems.map(item => {
                        let taskCount = 0;
                        if (item.label === 'Değerlendirme') taskCount = tasksWaitingSupervisorReviewCount;
                        return (
                            <NavItem
                                key={item.path}
                                icon={item.icon}
                                label={item.label}
                                isActive={location.pathname === item.path}
                                path={item.path}
                                taskCount={taskCount}
                             />
                        );
                    })}
                </nav>
            </header>

            <Routes>
                <Route path="/" element={<EnhancedMoldList projects={projects} loggedInUser={loggedInUser} handleDeleteMold={handleDeleteMold} handleUpdateMold={handleUpdateMold} />} />
                <Route path="/active" element={<ActiveTasksPage projects={projects} machines={machines} loggedInUser={loggedInUser} personnel={personnel} />} />
                <Route path="/cam" element={<CamDashboard loggedInUser={loggedInUser} projects={projects} handleUpdateOperation={handleUpdateOperation} personnel={personnel} machines={machines} />} />
                <Route path="/review" element={<SupervisorReviewPage loggedInUser={loggedInUser} projects={projects} handleUpdateOperation={handleUpdateOperation} />} />
                <Route path="/admin" element={<AdminDashboard db={db} projects={projects} setProjects={setProjects} personnel={personnel} setPersonnel={setPersonnel} machines={machines} setMachines={setMachines} handleDeleteMold={handleDeleteMold} handleUpdateMold={handleUpdateMold} />} />
                
                {/* YENİ: Yerleşim Editörü Rotası */}
                <Route path="/admin/layout" element={<WorkshopEditorPage machines={machines} projects={projects} />} />
                
                <Route path="/history" element={<HistoryPage projects={projects} />} />
                <Route path="/analysis" element={<AnalysisPage projects={projects} personnel={personnel} />} />
                
                <Route path="/mold/:moldId" element={
                    <MoldDetailPage 
                        loggedInUser={loggedInUser} 
                        handleUpdateOperation={handleUpdateOperation} 
                        handleAddOperation={handleAddOperation} 
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