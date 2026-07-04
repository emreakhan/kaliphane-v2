// src/pages/AdminDashboard.js

import React, { useState, useMemo } from 'react';
import { Users, Plus, List, AlertTriangle, Database, Edit, Trash2, Search, Save, Briefcase, RefreshCw, Tool, Settings } from 'lucide-react';
// ROLES eklendi
import { MOLD_STATUS, OPERATION_TYPES, OPERATION_STATUS, PROJECT_TYPES, ROLES } from '../config/constants.js';
import { db, setDoc, doc, updateDoc, collection, query, onSnapshot } from '../config/firebase.js'; 
import { PROJECT_COLLECTION } from '../config/constants.js'; 
import { ALL_SYSTEM_PAGES, getDefaultPermissions } from '../config/permissionsConfig.js'; 

import PersonnelManagement from '../components/Shared/PersonnelManagement.js';
import TaskListSidebar from '../components/Shared/TaskListSidebar.js';
import Modal from '../components/Modals/Modal.js';

// --- BİLEŞEN: Kalıp Yönetimi (Düzenleme/Silme) ---
const MoldManagement = ({ projects, handleDeleteMold, handleUpdateMold }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [editModalOpen, setEditModalOpen] = useState(false);
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [selectedMold, setSelectedMold] = useState(null);
    const [editFormData, setEditFormData] = useState({ moldName: '', customer: '' });

    // HATA DÜZELTME: Veri Temizliği
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
        if (!searchTerm) return cleanProjects;
        const lowerSearch = searchTerm.toLowerCase();
        return cleanProjects.filter(p => 
            p.moldName.toLowerCase().includes(lowerSearch) || 
            p.customer.toLowerCase().includes(lowerSearch)
        );
    }, [cleanProjects, searchTerm]);

    const openEditModal = (mold) => {
        setSelectedMold(mold);
        setEditFormData({ moldName: mold.moldName, customer: mold.customer });
        setEditModalOpen(true);
    };

    const openDeleteModal = (mold) => {
        setSelectedMold(mold);
        setDeleteModalOpen(true);
    };

    const closeModals = () => {
        setEditModalOpen(false);
        setDeleteModalOpen(false);
        setSelectedMold(null);
    };

    const handleEditSubmit = () => {
        if (!selectedMold || !editFormData.moldName || !editFormData.customer) return;
        handleUpdateMold(selectedMold.id, editFormData);
        closeModals();
    };

    const handleDeleteConfirm = () => {
        if (!selectedMold) return;
        handleDeleteMold(selectedMold.id);
        closeModals();
    };

    return (
        <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900/10">
            <h3 className="text-xl font-semibold dark:text-white mb-4 flex items-center">
                <Database className="w-5 h-5 mr-2" />
                Kalıp Yönetimi
            </h3>
            
            <div className="mb-4 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                    type="text"
                    placeholder="Kalıp adı veya müşteri ara..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500"
                />
            </div>

            <div className="max-h-[60vh] overflow-y-auto bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                <div className="divide-y divide-gray-200 dark:divide-gray-700">
                    {filteredProjects.length === 0 ? (
                        <p className="p-4 text-center text-gray-500 dark:text-gray-400">Kalıp bulunamadı.</p>
                    ) : (
                        filteredProjects.map(mold => (
                            <div key={mold.id} className="p-3 flex justify-between items-center hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                <div>
                                    <p className="font-semibold text-gray-900 dark:text-white">{mold.moldName}</p>
                                    <p className="text-sm text-gray-600 dark:text-gray-400">{mold.customer}</p>
                                    <p className="text-xs text-gray-400 dark:text-gray-500">ID: {mold.id}</p>
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={() => openEditModal(mold)} className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition" title="Düzenle"><Edit className="w-4 h-4" /></button>
                                    <button onClick={() => openDeleteModal(mold)} className="p-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition" title="Sil"><Trash2 className="w-4 h-4" /></button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {editModalOpen && selectedMold && (
                <Modal isOpen={editModalOpen} onClose={closeModals} title="Kalıp Bilgilerini Düzenle">
                    <div className="space-y-4">
                        <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Kalıp Adı</label><input type="text" value={editFormData.moldName} onChange={(e) => setEditFormData({ ...editFormData, moldName: e.target.value })} className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white" /></div>
                        <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Müşteri</label><input type="text" value={editFormData.customer} onChange={(e) => setEditFormData({ ...editFormData, customer: e.target.value })} className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white" /></div>
                    </div>
                    <div className="mt-6 flex justify-end gap-3"><button onClick={closeModals} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-600 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-500 transition">İptal</button><button onClick={handleEditSubmit} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition flex items-center"><Save className="w-4 h-4 mr-2" /> Kaydet</button></div>
                </Modal>
            )}

            {deleteModalOpen && selectedMold && (
                <Modal isOpen={deleteModalOpen} onClose={closeModals} title="Kalıbı Sil">
                    <div className="text-gray-800 dark:text-gray-200">
                        <div className="flex items-center gap-3 mb-4"><AlertTriangle className="w-12 h-12 text-red-500" /><p>**{selectedMold.moldName}** kalıbını silmek üzeresiniz. Bu işlem, kalıba ait tüm parçaları, operasyonları ve notları kalıcı olarak silecektir.</p></div>
                         <p className="font-semibold text-center">Bu işlem geri alınamaz. Emin misiniz?</p>
                    </div>
                    <div className="mt-6 flex justify-end gap-3"><button onClick={closeModals} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-600 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-500 transition">İptal</button><button onClick={handleDeleteConfirm} className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition flex items-center"><Trash2 className="w-4 h-4 mr-2" /> Evet, Sil</button></div>
                </Modal>
            )}
        </div>
    );
};

const RolePermissionsManagement = ({ db }) => {
    const [dbPermissions, setDbPermissions] = useState({});
    const [selectedRole, setSelectedRole] = useState(Object.values(ROLES)[0] || 'Tezgah Operatörü');
    const [localPermissions, setLocalPermissions] = useState(null);
    const [saving, setSaving] = useState(false);

    // Listen to firestore permissions
    React.useEffect(() => {
        if (!db) return;
        const q = query(collection(db, 'role_permissions'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data = {};
            snapshot.docs.forEach(doc => {
                data[doc.id] = doc.data().permissions;
            });
            setDbPermissions(data);
        });
        return () => unsubscribe();
    }, [db]);

    // Update local state when selectedRole or dbPermissions changes
    React.useEffect(() => {
        const defaultPerms = getDefaultPermissions(selectedRole);
        const savedPerms = dbPermissions[selectedRole] || {};
        
        // Merge saved permissions with defaults to make sure all pages are present
        const merged = {};
        ALL_SYSTEM_PAGES.forEach(p => {
            merged[p.path] = {
                view: savedPerms[p.path]?.view !== undefined ? savedPerms[p.path].view : defaultPerms[p.path].view,
                edit: savedPerms[p.path]?.edit !== undefined ? savedPerms[p.path].edit : defaultPerms[p.path].edit,
            };
        });
        setLocalPermissions(merged);
    }, [selectedRole, dbPermissions]);

    const handleCheckboxChange = (path, type) => {
        if (!localPermissions) return;
        const updated = {
            ...localPermissions,
            [path]: {
                ...localPermissions[path],
                [type]: !localPermissions[path][type]
            }
        };
        // If view is disabled, edit should be disabled as well
        if (type === 'view' && !updated[path].view) {
            updated[path].edit = false;
        }
        // If edit is enabled, view should be enabled as well
        if (type === 'edit' && updated[path].edit) {
            updated[path].view = true;
        }
        setLocalPermissions(updated);
    };

    const handleSave = async () => {
        if (!db || !localPermissions) return;
        setSaving(true);
        try {
            await setDoc(doc(db, 'role_permissions', selectedRole), {
                permissions: localPermissions,
                updatedAt: new Date().toISOString()
            });
            alert(`${selectedRole} yetkileri başarıyla kaydedildi.`);
        } catch (error) {
            console.error("Yetki kaydetme hatası:", error);
            alert("İzinler kaydedilirken hata oluştu.");
        } finally {
            setSaving(false);
        }
    };

    const handleResetToDefault = () => {
        if (window.confirm(`${selectedRole} rolü yetkilerini varsayılana döndürmek istediğinize emin misiniz?`)) {
            setLocalPermissions(getDefaultPermissions(selectedRole));
        }
    };

    if (!localPermissions) return <div className="text-center p-8 text-gray-500 font-bold">Yükleniyor...</div>;

    return (
        <div className="p-6 bg-gray-50 dark:bg-gray-900/10 border border-gray-250 dark:border-gray-700 rounded-xl space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b dark:border-gray-800 pb-4">
                <div>
                    <h3 className="text-xl font-bold dark:text-white flex items-center">
                        <Users className="w-5 h-5 mr-2 text-blue-500" />
                        Rol Bazlı Sayfa Yetkileri
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 font-semibold">
                        Kullanıcı rollerinin hangi sayfaları görebileceğini ve düzenleyebileceğini buradan yönetebilirsiniz.
                    </p>
                </div>
                <div className="flex items-center gap-2 w-full md:w-auto">
                    <label className="text-sm font-bold text-gray-705 dark:text-gray-300 whitespace-nowrap">Rol Seçin:</label>
                    <select 
                        value={selectedRole} 
                        onChange={(e) => setSelectedRole(e.target.value)} 
                        className="bg-white border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:text-white font-bold"
                    >
                        {Object.values(ROLES).map(roleVal => (
                            <option key={roleVal} value={roleVal}>{roleVal}</option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="max-h-[60vh] overflow-y-auto bg-white dark:bg-gray-800 rounded-lg border border-gray-250 dark:border-gray-700 shadow-sm custom-scrollbar">
                <table className="w-full text-sm text-left">
                    <thead className="bg-gray-50 dark:bg-gray-900 text-gray-700 dark:text-gray-300 uppercase text-xs font-bold border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10">
                        <tr>
                            <th className="px-6 py-3">Sayfa / Bölüm Adı</th>
                            <th className="px-6 py-3">Sayfa Yolu (Path)</th>
                            <th className="px-6 py-3 text-center">Görüntüleyebilir (View)</th>
                            <th className="px-6 py-3 text-center">Düzenleyebilir (Edit)</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-250 dark:divide-gray-700">
                        {ALL_SYSTEM_PAGES.map(page => {
                            const perms = localPermissions[page.path] || { view: false, edit: false };
                            return (
                                <tr key={page.path} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition">
                                    <td className="px-6 py-4 font-bold text-gray-950 dark:text-white">{page.label}</td>
                                    <td className="px-6 py-4 font-mono text-xs text-gray-500 dark:text-gray-400">{page.path}</td>
                                    <td className="px-6 py-4 text-center">
                                        <input 
                                            type="checkbox" 
                                            checked={perms.view} 
                                            onChange={() => handleCheckboxChange(page.path, 'view')}
                                            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 bg-white dark:bg-gray-700 cursor-pointer"
                                        />
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <input 
                                            type="checkbox" 
                                            checked={perms.edit} 
                                            disabled={!perms.view}
                                            onChange={() => handleCheckboxChange(page.path, 'edit')}
                                            className="w-4 h-4 text-green-600 border-gray-300 rounded focus:ring-green-500 dark:focus:ring-green-600 dark:ring-offset-gray-800 bg-white dark:bg-gray-700 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                                        />
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            <div className="flex justify-between items-center pt-2">
                <button 
                    onClick={handleResetToDefault}
                    className="px-4 py-2 text-sm bg-gray-150 hover:bg-gray-200 text-gray-700 dark:bg-gray-700 dark:hover:bg-gray-650 dark:text-gray-200 font-bold rounded-lg transition"
                >
                    Varsayılana Sıfırla
                </button>
                <button 
                    onClick={handleSave} 
                    disabled={saving}
                    className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-extrabold rounded-lg shadow-md transition disabled:opacity-50 flex items-center"
                >
                    {saving && <RefreshCw className="w-4 h-4 mr-2 animate-spin" />}
                    AYARLARI KAYDET
                </button>
            </div>
        </div>
    );
};

const AdminDashboard = ({ 
    db, projects, setProjects, personnel, setPersonnel, machines, setMachines,
    handleDeleteMold, handleUpdateMold, loggedInUser 
}) => {
    const [newMoldName, setNewMoldName] = useState('');
    const [newCustomer, setNewCustomer] = useState('');
    const [newProjectType, setNewProjectType] = useState(PROJECT_TYPES.NEW_MOLD); 

    const [batchTaskNames, setBatchTaskNames] = useState('');
    const [selectedMoldId, setSelectedMoldId] = useState('');
    const [isSearchableSelectOpen, setIsSearchableSelectOpen] = useState(false);
    const [moldSearchQuery, setMoldSearchQuery] = useState('');
    const [moldError, setMoldError] = useState('');
    const [batchError, setBatchError] = useState('');
    const [activeTab, setActiveTab] = useState('projects');

    // HATA DÜZELTME: Veri Temizliği
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
        // cleanProjects kullanarak kontrol et
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
            projectType: newProjectType
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
        // cleanProjects içinden ara
        const moldToUpdate = cleanProjects.find(p => p.id === selectedMoldId);
        if (!moldToUpdate) {
            console.error("Kalıp bulunamadı:", selectedMoldId);
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
                    machineOperatorName: '', estimatedDueDate: '', startDate: '', finishDate: '', durationInHours: null, supervisorRating: null, supervisorReviewDate: null, supervisorComment: null,
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
                console.log(`Toplu parça ekleme tamamlandı: ${addedCount} parça eklendi.`);
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
            console.log("Parça silindi:", taskId);
        } catch (e) {
            console.error("Parça silinirken hata: ", e);
        }
    };

    const selectedMold = cleanProjects.find(p => p.id === selectedMoldId);

    // Personel Tabını Görebilecek Roller
    const canViewPersonnelTab = loggedInUser && (loggedInUser.role === ROLES.ADMIN || loggedInUser.role === ROLES.KALIP_TASARIM_SORUMLUSU);

    const renderActiveTab = () => {
        switch (activeTab) {
            case 'projects':
                return (
                    <>
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
                        
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            <div className="lg:col-span-2 space-y-6">
                                <div className="p-4 border border-purple-200 dark:border-purple-700 rounded-lg bg-purple-50 dark:bg-purple-900/10">
                                    <h3 className="text-xl font-semibold dark:text-white mb-3 flex items-center"><Plus className="w-5 h-5 mr-2"/> İŞ PARÇASI EKLEME</h3>
                                    <div className="space-y-4">
                                        <div className="relative">
                                            <button
                                                type="button"
                                                onClick={() => setIsSearchableSelectOpen(!isSearchableSelectOpen)}
                                                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 text-left flex justify-between items-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            >
                                                <span className="truncate">
                                                    {selectedMoldId 
                                                        ? (cleanProjects.find(p => p.id === selectedMoldId)?.moldName || "Kalıp Seçiniz") 
                                                        : "Kalıp Seçiniz"}
                                                </span>
                                                <span className="text-gray-400 text-xs">▼</span>
                                            </button>
                                            {isSearchableSelectOpen && (
                                                <>
                                                    <div 
                                                        className="fixed inset-0 z-20" 
                                                        onClick={() => { setIsSearchableSelectOpen(false); setMoldSearchQuery(''); }}
                                                    />
                                                    <div className="absolute z-30 mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 shadow-lg p-2 flex flex-col gap-2">
                                                        <div className="flex items-center gap-2 relative">
                                                            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-gray-400" />
                                                            <input
                                                                type="text"
                                                                placeholder="Kalıp adı ara..."
                                                                value={moldSearchQuery}
                                                                onChange={(e) => setMoldSearchQuery(e.target.value)}
                                                                className="w-full pl-9 pr-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm outline-none focus:ring-1 focus:ring-blue-500"
                                                                autoFocus
                                                            />
                                                        </div>
                                                        <div className="max-h-60 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-600 pr-1 custom-scrollbar">
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    setSelectedMoldId('');
                                                                    setBatchError('');
                                                                    setIsSearchableSelectOpen(false);
                                                                    setMoldSearchQuery('');
                                                                }}
                                                                className="w-full text-left px-3 py-2 text-sm text-gray-500 dark:text-gray-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded font-medium transition-colors"
                                                            >
                                                                Kalıp Seçiniz (Seçimi Temizle)
                                                            </button>
                                                            {cleanProjects
                                                                .filter(p => p.moldName.toLowerCase().includes(moldSearchQuery.toLowerCase()))
                                                                .map(p => (
                                                                    <button
                                                                        key={p.id}
                                                                        type="button"
                                                                        onClick={() => {
                                                                            setSelectedMoldId(p.id);
                                                                            setBatchError('');
                                                                            setIsSearchableSelectOpen(false);
                                                                            setMoldSearchQuery('');
                                                                        }}
                                                                        className={`w-full text-left px-3 py-2 text-sm rounded font-medium transition-colors ${
                                                                            selectedMoldId === p.id 
                                                                                ? 'bg-blue-600 text-white' 
                                                                                : 'text-gray-700 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-blue-900/30'
                                                                        }`}
                                                                    >
                                                                        {p.moldName}
                                                                    </button>
                                                                ))
                                                            }
                                                            {cleanProjects.filter(p => p.moldName.toLowerCase().includes(moldSearchQuery.toLowerCase())).length === 0 && (
                                                                <div className="text-sm text-gray-400 dark:text-gray-500 py-2 text-center">Eşleşen kalıp bulunamadı</div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                        <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Parça İsimleri (Her satıra bir parça)</label><textarea value={batchTaskNames} onChange={(e) => { setBatchTaskNames(e.target.value); setBatchError(''); }} rows={6} placeholder={`Örnek:\nANA GÖVDE SOL\nANA GÖVDE SAĞ\nSICAK YOLLUK\n...`} className="w-full rounded-lg border-gray-300 shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white px-3 py-2" /></div>
                                        {batchError && (<div className={`flex items-center text-sm p-3 rounded-lg ${batchError.startsWith('ℹ️') ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20' : 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20'}`}><AlertTriangle className="w-4 h-4 mr-2" />{batchError}</div>)}
                                        <button onClick={handleBatchAddTasks} className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition font-medium disabled:opacity-50" disabled={!selectedMoldId || !batchTaskNames.trim()}>Toplu Parça Ekle ({batchTaskNames.split('\n').filter(name => name.trim().length > 0).length} parça)</button>
                                    </div>
                                </div>
                            </div>
                            <div className="lg:col-span-1">
                                {selectedMold ? (<TaskListSidebar tasks={selectedMold.tasks.sort((a,b) => a.taskNumber - b.taskNumber)} onDeleteTask={handleDeleteTask} selectedMoldId={selectedMoldId} />) : (<div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-6 text-center"><List className="w-12 h-12 text-gray-400 dark:text-gray-600 mx-auto mb-3" /><p className="text-gray-500 dark:text-gray-400">Parça listesini görmek için bir kalıp seçin</p></div>)}
                            </div>
                        </div>
                    </>
                );
            case 'personnel':
                if (!canViewPersonnelTab) return <div className="p-4 text-red-500">Yetkisiz erişim.</div>;
                return (
                    <PersonnelManagement 
                        db={db}
                        personnel={personnel} 
                        setPersonnel={setPersonnel}
                        machines={machines}
                        setMachines={setMachines}
                    />
                );
            case 'mold_management':
                return (
                    <MoldManagement
                        projects={projects}
                        handleDeleteMold={handleDeleteMold}
                        handleUpdateMold={handleUpdateMold}
                    />
                );
            case 'permissions':
                return (
                    <RolePermissionsManagement db={db} />
                );
            default:
                return null;
        }
    };

    return (
        <div className="p-4 bg-white dark:bg-gray-800 rounded-xl shadow-xl space-y-8">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Admin Paneli</h2>
            <div className="border-b border-gray-200 dark:border-gray-700">
                <nav className="flex flex-wrap -mb-px gap-x-8">
                    <button onClick={() => setActiveTab('projects')} className={`py-2 px-1 border-b-2 font-medium text-sm ${activeTab === 'projects' ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}><Plus className="w-4 h-4 inline mr-2" /> Proje ve İş Ekleme</button>
                    
                    {/* Personel Sekmesi: Sadece Admin ve Kalıp Tasarım Sorumlusu */}
                    {canViewPersonnelTab && (
                        <button onClick={() => setActiveTab('personnel')} className={`py-2 px-1 border-b-2 font-medium text-sm ${activeTab === 'personnel' ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}><Users className="w-4 h-4 inline mr-2" /> Personel Yönetimi</button>
                    )}

                    <button onClick={() => setActiveTab('mold_management')} className={`py-2 px-1 border-b-2 font-medium text-sm ${activeTab === 'mold_management' ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}><Database className="w-4 h-4 inline mr-2" /> Kalıp Yönetimi</button>
                    
                    <button onClick={() => setActiveTab('permissions')} className={`py-2 px-1 border-b-2 font-medium text-sm ${activeTab === 'permissions' ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}><Settings className="w-4 h-4 inline mr-2" /> Sayfa Yetkileri</button>
                </nav>
            </div>
            {renderActiveTab()}
        </div>
    );
};

export default AdminDashboard;