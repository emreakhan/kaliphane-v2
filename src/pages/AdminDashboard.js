// src/pages/AdminDashboard.js

import React, { useState } from 'react';

// İkonlar
import { LayoutDashboard, Users, Plus, List, AlertTriangle } from 'lucide-react';

// Sabitler
import { MOLD_STATUS, OPERATION_TYPES, OPERATION_STATUS } from '../config/constants.js';

// Firebase (Bu sayfada doğrudan db'ye yazma işlemi var)
import { db, PROJECT_COLLECTION, setDoc, doc, updateDoc } from '../config/firebase';

// ----------------------------------------------------------------
// ---- HENÜZ OLUŞTURULMAYAN BİLEŞENLER ----
// (Bunlar şimdilik HATA VERECEK, sonraki adımlarda düzelteceğiz)
// ----------------------------------------------------------------
import PersonnelManagement from '../components/Shared/PersonnelManagement.js';
import TaskListSidebar from '../components/Shared/TaskListSidebar.js';
// ----------------------------------------------------------------


// --- (GÜNCELLENMİŞ) ADMIN DASHBOARD ---
const AdminDashboard = ({ projects, setProjects, personnel, setPersonnel, machines, setMachines }) => {
    const [newMoldName, setNewMoldName] = useState('');
    const [newCustomer, setNewCustomer] = useState('');
    const [newTaskName, setNewTaskName] = useState('');
    const [batchTaskNames, setBatchTaskNames] = useState('');
    const [selectedMoldId, setSelectedMoldId] = useState('');
    const [moldError, setMoldError] = useState('');
    const [batchError, setBatchError] = useState('');
    const [activeTab, setActiveTab] = useState('projects');

    // Aynı kalıp ismi kontrolü
    const checkDuplicateMold = (moldName) => {
        return projects.some(project => 
            project.moldName.toLowerCase() === moldName.toLowerCase().trim()
        );
    };

    // Aynı parça ismi kontrolü
    const checkDuplicateTask = (moldId, taskName) => {
        const mold = projects.find(p => p.id === moldId);
        if (!mold) return false;
        
        return mold.tasks.some(task => 
            task.taskName.toLowerCase() === taskName.toLowerCase().trim()
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
            priority: null, // YENİ: priority alanı eklendi
        };
        try {
            await setDoc(doc(db, PROJECT_COLLECTION, newId), newMold);
            setNewMoldName('');
            setNewCustomer('');
            setMoldError('');
            console.log("Yeni Kalıp Eklendi:", newMold.moldName);
        } catch (e) {
            console.error("Kalıp eklenirken hata: ", e);
        }
    };
    
    // GÜNCELLEME: Artık varsayılan bir CNC operasyonu ile ekliyor
    const handleAddNewTask = async () => {
        if (!selectedMoldId || !newTaskName) return;
        const moldToUpdate = projects.find(p => p.id === selectedMoldId);
         if (!moldToUpdate) {
            console.error("Kalıp bulunamadı:", selectedMoldId);
            setBatchError("Hata: Kalıp bulunamadı.");
            return;
        }
        
        if (checkDuplicateTask(selectedMoldId, newTaskName)) {
            setBatchError(`⚠️ "${newTaskName}" isminde bir parça zaten mevcut!`);
            return;
        }

        const newTaskNumber = moldToUpdate.tasks.length + 1;
        // YENİ: Varsayılan Operasyon
        const newOperationId = `op-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const defaultOperation = {
            id: newOperationId,
            type: OPERATION_TYPES.CNC,
            status: OPERATION_STATUS.NOT_STARTED,
            progressPercentage: 0,
            assignedOperator: 'SEÇ',
            machineName: '',
            machineOperatorName: '', estimatedDueDate: '', startDate: '', finishDate: 
            '', durationInHours: null, supervisorRating: null, supervisorReviewDate: null, supervisorComment: null,
            camOperatorRatingForMachineOp: null, camOperatorCommentForMachineOp: null, camOperatorReviewDate: null
        };
        // YENİ: Yeni Task Yapısı
        const newTask = {
            id: `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            taskName: newTaskName.trim(),
            taskNumber: newTaskNumber,
            operations: [defaultOperation] // Operasyon dizisi ile başla
        };
        const updatedTasks = [...moldToUpdate.tasks, newTask];

        try {
            await updateDoc(doc(db, PROJECT_COLLECTION, selectedMoldId), {
                tasks: updatedTasks,
            });
            setNewTaskName('');
            setBatchError('');
            console.log("Yeni Alt Parça Eklendi (operasyonlu):", newTaskName);
        } catch (e) {
            console.error("Alt parça eklenirken hata: ", e);
            setBatchError("Hata: Parça eklenemedi.");
        }
    };

    // GÜNCELLEME: Artık varsayılan bir CNC operasyonu ile ekliyor
    const handleBatchAddTasks = async () => {
        if (!selectedMoldId || !batchTaskNames.trim()) return;
        const moldToUpdate = projects.find(p => p.id === selectedMoldId);
        if (!moldToUpdate) {
            console.error("Kalıp bulunamadı:", selectedMoldId);
            setBatchError("Hata: Kalıp bulunamadı.");
            return;
        }

        const taskNames = batchTaskNames.split('\n')
            .map(name => name.trim())
            .filter(name => name.length > 0);
        if (taskNames.length === 0) return;

        let newTasksList = [...moldToUpdate.tasks];
        let addedCount = 0;
        let errorMessages = [];
        let currentTaskNumber = moldToUpdate.tasks.length;

        for (const taskName of taskNames) {
            const isDuplicate = newTasksList.some(task => 
                task.taskName.toLowerCase() === taskName.toLowerCase()
            );
            if (isDuplicate) {
                errorMessages.push(`"${taskName}" (zaten var)`);
            } else {
                currentTaskNumber++;
                // YENİ: Varsayılan Operasyon
                const newOperationId = `op-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                const defaultOperation = {
                    id: newOperationId,
                    type: OPERATION_TYPES.CNC,
                    status: OPERATION_STATUS.NOT_STARTED,
                    progressPercentage: 0,
                    assignedOperator: 'SEÇ',
                    machineName: '',
                    machineOperatorName: '', estimatedDueDate: '', startDate: '', finishDate: '', durationInHours: null, supervisorRating: null, supervisorReviewDate: null, supervisorComment: null,
                    camOperatorRatingForMachineOp: null, camOperatorCommentForMachineOp: null, camOperatorReviewDate: null
                };

                // YENİ: Yeni Task Yapısı
                const newTask = {
                    id: `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    taskName: taskName,
                    taskNumber: currentTaskNumber,
                    operations: [defaultOperation] // Operasyon dizisi ile başla
                };
                newTasksList.push(newTask);
                addedCount++;
            }
        }

        if (addedCount > 0) {
            try {
                await updateDoc(doc(db, PROJECT_COLLECTION, selectedMoldId), {
                    tasks: newTasksList,
                });
                setBatchTaskNames('');
                setBatchError('');
                console.log(`Toplu parça ekleme tamamlandı: ${addedCount} parça eklendi.`);
                
                if (errorMessages.length > 0) {
                    setBatchError(`ℹ️ ${addedCount} parça eklendi. ${errorMessages.join(', ')} eklenemedi (zaten mevcuttu).`);
                }

            } catch (e) {
                console.error("Toplu parça eklerken hata: ", e);
                setBatchError("Hata: Parçalar güncellenemedi.");
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
    // --- GÜNCELLEME SONU ---

    // GÜNCELLEME: Bu fonksiyon artık bir TASK'ı (ve içindeki tüm operasyonları) siler
    const handleDeleteTask = async (moldId, taskId) => {
        const moldToUpdate = projects.find(p => p.id === moldId);
        if (!moldToUpdate) return;

        const updatedTasks = moldToUpdate.tasks.filter(t => t.id !== taskId);
        const renumberedTasks = updatedTasks.map((task, index) => ({
            ...task,
            taskNumber: index + 1,
        }));
        try {
            await updateDoc(doc(db, PROJECT_COLLECTION, moldId), {
                tasks: renumberedTasks,
            });
            console.log("Parça silindi:", taskId);
        } catch (e) {
            console.error("Parça silinirken hata: ", e);
        }
    };

    const selectedMold = projects.find(p => p.id === selectedMoldId);

    return (
        <div className="p-4 bg-white dark:bg-gray-800 rounded-xl shadow-xl space-y-8">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Admin Paneli</h2>

            <div className="border-b border-gray-200 dark:border-gray-700">
                <nav className="flex space-x-8">
                    <button
                         onClick={() => setActiveTab('projects')}
                        className={`py-2 px-1 border-b-2 font-medium text-sm ${
                            activeTab === 'projects'
                             ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                                : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                        }`}
                    >
                        <LayoutDashboard className="w-4 h-4 inline mr-2" />
                        Proje ve İş Ekleme
                    </button>
                    <button
                         onClick={() => setActiveTab('personnel')}
                        className={`py-2 px-1 border-b-2 font-medium text-sm ${
                            activeTab === 'personnel'
                                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                                : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                        }`}
                    >
                        <Users className="w-4 h-4 inline mr-2" />
                        Personel Yönetimi
                    </button>
                </nav>
            </div>

            {/* ŞİMDİLİK HATA VERECEK KISIMLAR:
                'PersonnelManagement' ve 'TaskListSidebar' bileşenlerini henüz taşımadık.
            */}

            {activeTab === 'projects' ?
            (
                <>
                    <div className="p-4 border border-blue-200 dark:border-blue-700 rounded-lg bg-blue-50 dark:bg-blue-900/10">
                        <h3 className="text-xl font-semibold dark:text-white mb-3 flex items-center"><Plus className="w-5 h-5 mr-2"/> Yeni Kalıp Ekle</h3>
                         <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <input 
                                    type="text" 
                                    placeholder="Kalıp Numarası (Örn: 2847 FAN)" 
                                    value={newMoldName} 
                                    onChange={(e) => {
                                        setNewMoldName(e.target.value);
                                        setMoldError('');
                                    }} 
                                    className="w-full rounded-lg border-gray-300 dark:bg-gray-700 dark:border-gray-600 dark:text-white px-3 py-2" 
                                />
                                {moldError && (
                                    <div className="mt-2 flex items-center text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-2 rounded-lg">
                                        <AlertTriangle className="w-4 h-4 mr-2" />
                                        {moldError}
                                    </div>
                                )}
                            </div>
                            <input type="text" placeholder="Müşteri Adı" value={newCustomer} onChange={(e) => setNewCustomer(e.target.value)} className="rounded-lg border-gray-300 dark:bg-gray-700 dark:border-gray-600 dark:text-white px-3 py-2" />
                            <button onClick={handleAddNewMold} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium disabled:opacity-50" disabled={!newMoldName || !newCustomer}>
                                Kalıp Ekle
                            </button>
                        </div>
                     </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div className="lg:col-span-2 space-y-6">
                            <div className="p-4 border border-green-200 dark:border-green-700 rounded-lg bg-green-50 dark:bg-green-900/10">
                                <h3 className="text-xl font-semibold dark:text-white mb-3 flex items-center"><Plus className="w-5 h-5 mr-2"/> Tek Parça Ekle</h3>
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                    <select value={selectedMoldId} onChange={(e) => setSelectedMoldId(e.target.value)} className="rounded-lg border-gray-300 dark:bg-gray-700 dark:border-gray-600 dark:text-white px-3 py-2 col-span-4 md:col-span-1">
                                        <option value="">Kalıp Seçiniz</option>
                                        {projects.map(p => <option key={p.id} value={p.id}>{p.moldName}</option>)}
                                    </select>
                                    <input type="text" placeholder="Yeni Alt Parça Adı (Örn: ANA GÖVDE)" value={newTaskName} onChange={(e) => { setNewTaskName(e.target.value); setBatchError(''); }} className="rounded-lg border-gray-300 dark:bg-gray-700 dark:border-gray-600 dark:text-white px-3 py-2 col-span-4 md:col-span-2" />
                                    <button onClick={handleAddNewTask} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-medium disabled:opacity-50 col-span-4 md:col-span-1" disabled={!selectedMoldId || !newTaskName}>
                                        Parça Ekle
                                    </button>
                                </div>
                            </div>

                            <div className="p-4 border border-purple-200 dark:border-purple-700 rounded-lg bg-purple-50 dark:bg-purple-900/10">
                                <h3 className="text-xl font-semibold dark:text-white mb-3 flex items-center"><Plus className="w-5 h-5 mr-2"/> Toplu Parça Ekle</h3>
                                <div className="space-y-4">
                                    <select value={selectedMoldId} onChange={(e) => { setSelectedMoldId(e.target.value); setBatchError(''); }} className="w-full rounded-lg border-gray-300 dark:bg-gray-700 dark:border-gray-600 dark:text-white px-3 py-2">
                                        <option value="">Kalıp Seçiniz</option>
                                        {projects.map(p => <option key={p.id} value={p.id}>{p.moldName}</option>)}
                                    </select>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                            Parça İsimleri (Her satıra bir parça)
                                        </label>
                                        <textarea
                                            value={batchTaskNames}
                                            onChange={(e) => { setBatchTaskNames(e.target.value); setBatchError(''); }}
                                            rows={6}
                                            placeholder={`Örnek:
ANA GÖVDE SOL
ANA GÖVDE SAĞ
SICAK YOLLUK
TEST PLAKASI
...`}
                                            className="w-full rounded-lg border-gray-300 shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white px-3 py-2"
                                        />
                                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                            Her satıra bir parça ismi yazın. Boş satırlar göz ardı edilecektir.
                                        </p>
                                    </div>
                                    {batchError && (
                                        <div className={`flex items-center text-sm p-3 rounded-lg ${batchError.startsWith('ℹ️') ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20' : 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20'}`}>
                                            <AlertTriangle className="w-4 h-4 mr-2" />
                                            {batchError}
                                        </div>
                                    )}
                                    <button 
                                        onClick={handleBatchAddTasks} 
                                        className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition font-medium disabled:opacity-50"
                                        disabled={!selectedMoldId || !batchTaskNames.trim()}
                                    >
                                        Toplu Parça Ekle ({batchTaskNames.split('\n').filter(name => name.trim().length > 0).length} parça)
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Sağ Taraf - Mevcut Parça Listesi */}
                        <div className="lg:col-span-1">
                            {selectedMold ?
                            (
                                <TaskListSidebar 
                                    tasks={selectedMold.tasks.sort((a,b) => a.taskNumber - b.taskNumber)} // Sıralı göster
                                    onDeleteTask={handleDeleteTask} // Bu, ana TASK'ı siler
                                    selectedMoldId={selectedMoldId}
                                />
                             ) : (
                                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-6 text-center">
                                    <List className="w-12 h-12 text-gray-400 dark:text-gray-600 mx-auto mb-3" />
                                    <p className="text-gray-500 dark:text-gray-400">
                                        Parça listesini görmek için bir kalıp seçin
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </>
            ) : (
                <PersonnelManagement 
                    db={db} // db'yi doğrudan App.js'den alıp buraya paslıyoruz
                    personnel={personnel} 
                    setPersonnel={setPersonnel}
                    machines={machines}
                    setMachines={setMachines}
                />
            )}
        </div>
    );
};
// --- (DÜZELTİLMİŞ) ADMIN DASHBOARD SONU ---


// Bu satır çok önemli, App.js'in bu dosyayı "import" edebilmesini sağlar
export default AdminDashboard;