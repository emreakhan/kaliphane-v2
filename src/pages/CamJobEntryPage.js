// src/pages/CamJobEntryPage.js

import React, { useState, useMemo } from 'react';
import { Plus, AlertTriangle, List, Briefcase } from 'lucide-react';
import { MOLD_STATUS, OPERATION_TYPES, OPERATION_STATUS, PROJECT_TYPES, PROJECT_COLLECTION } from '../config/constants.js';
import { db, setDoc, doc, updateDoc } from '../config/firebase.js'; 

import TaskListSidebar from '../components/Shared/TaskListSidebar.js';

const CamJobEntryPage = ({ projects, personnel, loggedInUser }) => {
    const [newMoldName, setNewMoldName] = useState('');
    const [newCustomer, setNewCustomer] = useState('');
    const [newProjectType, setNewProjectType] = useState(PROJECT_TYPES.NEW_MOLD); 

    const [batchTaskNames, setBatchTaskNames] = useState('');
    const [selectedMoldId, setSelectedMoldId] = useState('');
    const [moldError, setMoldError] = useState('');
    const [batchError, setBatchError] = useState('');

    // --- GÜVENLİK ÖNLEMİ: Hatalı verileri filtrele ---
    const cleanProjects = useMemo(() => {
        if (!projects || !Array.isArray(projects)) return [];
        return projects.filter(p => 
            p && 
            p.moldName && 
            typeof p.moldName === 'string' &&
            p.moldName.trim() !== ''
        );
    }, [projects]);

    const checkDuplicateMold = (moldName) => {
        return cleanProjects.some(project => 
            project.moldName.toLowerCase() === moldName.toLowerCase().trim()
        );
    };

    const handleAddNewMold = async () => {
        if (!newMoldName || !newCustomer) return;
        if (checkDuplicateMold(newMoldName)) {
            setMoldError(`⚠️ "${newMoldName}" isminde bir kalıp zaten mevcut!`);
            return;
        }
        const newId = `mold-${Date.now()}`;
        const newMold = {
            id: newId,
            moldName: newMoldName.trim(),
            customer: newCustomer.trim(),
            tasks: [],
            status: MOLD_STATUS.WAITING,
            moldDeadline: '',
            priority: null,
            projectType: newProjectType,
            createdBy: loggedInUser?.name || 'CAM Operator'
        };
        try {
            await setDoc(doc(db, PROJECT_COLLECTION, newId), newMold);
            setNewMoldName('');
            setNewCustomer('');
            setNewProjectType(PROJECT_TYPES.NEW_MOLD);
            setMoldError('');
            console.log("Yeni Kalıp Eklendi:", newMold.moldName);
        } catch (e) {
            console.error("Kalıp eklenirken hata: ", e);
        }
    };

    const handleBatchAddTasks = async () => {
        if (!selectedMoldId || !batchTaskNames.trim()) return;
        const moldToUpdate = cleanProjects.find(p => p.id === selectedMoldId);
        if (!moldToUpdate) {
            setBatchError("Hata: Kalıp bulunamadı.");
            return;
        }
        const taskNames = batchTaskNames.split('\n').map(name => name.trim()).filter(name => name.length > 0);
        if (taskNames.length === 0) return;

        let newTasksList = [...moldToUpdate.tasks];
        let addedCount = 0;
        let errorMessages = [];
        let currentTaskNumber = moldToUpdate.tasks.length;

        for (const taskName of taskNames) {
            const isDuplicate = newTasksList.some(task => task.taskName.toLowerCase() === taskName.toLowerCase());
            if (isDuplicate) {
                errorMessages.push(`"${taskName}" (zaten var)`);
            } else {
                currentTaskNumber++;
                const newOperationId = `op-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                const defaultOperation = {
                    id: newOperationId,
                    type: OPERATION_TYPES.CNC,
                    status: OPERATION_STATUS.NOT_STARTED,
                    progressPercentage: 0,
                    assignedOperator: 'SEÇ',
                    machineName: '',
                    machineOperatorName: '', 
                    estimatedDueDate: '', startDate: '', finishDate: '', 
                    durationInHours: null, supervisorRating: null, supervisorReviewDate: null, supervisorComment: null,
                    camOperatorRatingForMachineOp: null, camOperatorCommentForMachineOp: null, camOperatorReviewDate: null
                };
                const newTask = {
                    id: `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    taskName: taskName,
                    taskNumber: currentTaskNumber,
                    operations: [defaultOperation]
                };
                newTasksList.push(newTask);
                addedCount++;
            }
        }

        if (addedCount > 0) {
            try {
                await updateDoc(doc(db, PROJECT_COLLECTION, selectedMoldId), { tasks: newTasksList });
                setBatchTaskNames('');
                setBatchError('');
                if (errorMessages.length > 0) {
                    setBatchError(`ℹ️ ${addedCount} parça eklendi. ${errorMessages.join(', ')} eklenemedi (zaten mevcuttu).`);
                }
            } catch (e) {
                console.error("Toplu parça eklerken hata: ", e);
                setBatchError("Hata: Parça güncellenemedi.");
            }
        } else {
            setBatchTaskNames('');
            if(errorMessages.length > 0) {
                setBatchError(`⚠️ Parçalar eklenemedi. ${errorMessages.join(', ')}`);
            } else {
                setBatchError('');
            }
        }
    };

    // --- YENİ EKLENEN FONKSİYON: Parça Adı Güncelleme ---
    const handleUpdateTaskName = async (moldId, taskId, newName) => {
        const moldToUpdate = cleanProjects.find(p => p.id === moldId);
        if (!moldToUpdate) return;

        const updatedTasks = moldToUpdate.tasks.map(task => {
            if (task.id === taskId) {
                return { ...task, taskName: newName };
            }
            return task;
        });

        try {
            await updateDoc(doc(db, PROJECT_COLLECTION, moldId), { tasks: updatedTasks });
            console.log("Parça ismi güncellendi:", taskId, newName);
        } catch (e) {
            console.error("Parça güncellenirken hata: ", e);
        }
    };

    const handleDeleteTask = async (moldId, taskId) => {
        const moldToUpdate = cleanProjects.find(p => p.id === moldId);
        if (!moldToUpdate) return;
        const updatedTasks = moldToUpdate.tasks.filter(t => t.id !== taskId);
        const renumberedTasks = updatedTasks.map((task, index) => ({
            ...task,
            taskNumber: index + 1,
        }));
        try {
            await updateDoc(doc(db, PROJECT_COLLECTION, moldId), { tasks: renumberedTasks });
        } catch (e) {
            console.error("Parça silinirken hata: ", e);
        }
    };

    const selectedMold = cleanProjects.find(p => p.id === selectedMoldId);

    return (
        <div className="p-4 sm:p-8 bg-white dark:bg-gray-800 rounded-xl shadow-xl space-y-8 min-h-[85vh]">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center">
                <Briefcase className="w-6 h-6 mr-2 text-blue-600"/>
                Proje ve İş Girişi
            </h2>
            
            {/* Üst Kısım: Yeni Kalıp Ekleme */}
            <div className="p-4 border border-blue-200 dark:border-blue-700 rounded-lg bg-blue-50 dark:bg-blue-900/10">
                <h3 className="text-xl font-semibold dark:text-white mb-3 flex items-center"><Plus className="w-5 h-5 mr-2"/> Yeni İş / Kalıp Ekle</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Proje Türü</label>
                        <select value={newProjectType} onChange={(e) => setNewProjectType(e.target.value)} className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500 h-[42px]">
                            <option value={PROJECT_TYPES.NEW_MOLD}>YENİ KALIP</option>
                            <option value={PROJECT_TYPES.REVISION}>REVİZYON</option>
                            <option value={PROJECT_TYPES.MACHINING}>PROJE İMALAT</option>
                            <option value={PROJECT_TYPES.IMPROVEMENT}>İYİLEŞTİRME</option>
                            <option value={PROJECT_TYPES.T0_IMPROVEMENT}>T0-İYİLEŞTİRME</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Kalıp / İş Adı</label>
                        <input type="text" placeholder={newProjectType === PROJECT_TYPES.REVISION ? "Kalıp Adı (Örn: Vazo Kalıbı Revizyon)" : "Kalıp Numarası / İş Adı"} value={newMoldName} onChange={(e) => { setNewMoldName(e.target.value); setMoldError(''); }} className="w-full rounded-lg border-gray-300 dark:bg-gray-700 dark:border-gray-600 dark:text-white px-3 py-2" />
                        {moldError && (<div className="mt-2 flex items-center text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-2 rounded-lg"><AlertTriangle className="w-4 h-4 mr-2" />{moldError}</div>)}
                    </div>
                    <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Müşteri</label><input type="text" placeholder="Müşteri Adı" value={newCustomer} onChange={(e) => setNewCustomer(e.target.value)} className="w-full rounded-lg border-gray-300 dark:bg-gray-700 dark:border-gray-600 dark:text-white px-3 py-2" /></div>
                </div>
                <div className="mt-4 flex justify-end"><button onClick={handleAddNewMold} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium disabled:opacity-50" disabled={!newMoldName || !newCustomer}>Kaydet ve Ekle</button></div>
            </div>

            {/* Alt Kısım: İş Parçası Ekleme ve Liste */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                    <div className="p-4 border border-purple-200 dark:border-purple-700 rounded-lg bg-purple-50 dark:bg-purple-900/10">
                        <h3 className="text-xl font-semibold dark:text-white mb-3 flex items-center"><Plus className="w-5 h-5 mr-2"/> İŞ PARÇASI EKLEME</h3>
                        <div className="space-y-4">
                            <select value={selectedMoldId} onChange={(e) => { setSelectedMoldId(e.target.value); setBatchError(''); }} className="w-full rounded-lg border-gray-300 dark:bg-gray-700 dark:border-gray-600 dark:text-white px-3 py-2">
                                <option value="">Kalıp Seçiniz</option>
                                {/* Liste render edilirken cleanProjects kullan */}
                                {cleanProjects.map(p => <option key={p.id} value={p.id}>{p.moldName}</option>)}
                            </select>
                            <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Parça İsimleri (Her satıra bir parça)</label><textarea value={batchTaskNames} onChange={(e) => { setBatchTaskNames(e.target.value); setBatchError(''); }} rows={6} placeholder={`Örnek:\nANA GÖVDE SOL\nANA GÖVDE SAĞ\nSICAK YOLLUK\n...`} className="w-full rounded-lg border-gray-300 shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white px-3 py-2" /></div>
                            {batchError && (<div className={`flex items-center text-sm p-3 rounded-lg ${batchError.startsWith('ℹ️') ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20' : 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20'}`}><AlertTriangle className="w-4 h-4 mr-2" />{batchError}</div>)}
                            <button onClick={handleBatchAddTasks} className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition font-medium disabled:opacity-50" disabled={!selectedMoldId || !batchTaskNames.trim()}>Toplu Parça Ekle ({batchTaskNames.split('\n').filter(name => name.trim().length > 0).length} parça)</button>
                        </div>
                    </div>
                </div>
                <div className="lg:col-span-1">
                    {/* onUpdateTask prop'u eklendi */}
                    {selectedMold ? (
                        <TaskListSidebar 
                            tasks={selectedMold.tasks.sort((a,b) => a.taskNumber - b.taskNumber)} 
                            onDeleteTask={handleDeleteTask} 
                            onUpdateTask={handleUpdateTaskName}
                            selectedMoldId={selectedMoldId} 
                        />
                    ) : (
                        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-6 text-center">
                            <List className="w-12 h-12 text-gray-400 dark:text-gray-600 mx-auto mb-3" />
                            <p className="text-gray-500 dark:text-gray-400">Parça listesini görmek için bir kalıp seçin</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default CamJobEntryPage;