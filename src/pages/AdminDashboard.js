// src/pages/AdminDashboard.js

import React, { useState, useMemo, useEffect } from 'react';
import { Users, Plus, List, AlertTriangle, Database, Edit, Trash2, Search, Save, Briefcase, RefreshCw, Tool, Settings, ChevronUp, ChevronDown, ListOrdered } from 'lucide-react';
// ROLES eklendi
import { MOLD_STATUS, OPERATION_TYPES, OPERATION_STATUS, PROJECT_TYPES, ROLES, PROJECT_TYPE_CONFIG } from '../config/constants.js';
import { db, setDoc, doc, updateDoc, collection, query, onSnapshot, deleteDoc } from '../config/firebase.js'; 
import { PROJECT_COLLECTION, DELETED_PROJECT_COLLECTION } from '../config/constants.js'; 
import { ALL_SYSTEM_PAGES, getDefaultPermissions } from '../config/permissionsConfig.js'; 

import PersonnelManagement from '../components/Shared/PersonnelManagement.js';
import TaskListSidebar from '../components/Shared/TaskListSidebar.js';
import Modal from '../components/Modals/Modal.js';

// --- BİLEŞEN: Kalıp Yönetimi (Düzenleme/Silme) ---
const MoldManagement = ({ db, projects, handleDeleteMold, handleUpdateMold }) => {
    const [subTab, setSubTab] = useState('active'); // 'active' or 'deleted'
    const [searchTerm, setSearchTerm] = useState('');
    const [editModalOpen, setEditModalOpen] = useState(false);
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [selectedMold, setSelectedMold] = useState(null);
    const [editFormData, setEditFormData] = useState({ moldName: '', customer: '' });

    const [deletedProjects, setDeletedProjects] = useState([]);
    const [isRestoring, setIsRestoring] = useState(false);

    // Load deleted projects when 'deleted' tab is active
    useEffect(() => {
        if (!db || subTab !== 'deleted') return;
        const q = query(collection(db, DELETED_PROJECT_COLLECTION));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            list.sort((a, b) => {
                const dateA = a.deletedAt ? new Date(a.deletedAt) : new Date(0);
                const dateB = b.deletedAt ? new Date(b.deletedAt) : new Date(0);
                return dateB - dateA; // Newest deleted first
            });
            setDeletedProjects(list);
        });
        return () => unsubscribe();
    }, [db, subTab]);

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
        if (subTab === 'active') {
            if (!searchTerm) return cleanProjects;
            const lowerSearch = searchTerm.toLowerCase();
            return cleanProjects.filter(p => 
                p.moldName.toLowerCase().includes(lowerSearch) || 
                p.customer.toLowerCase().includes(lowerSearch)
            );
        } else {
            if (!searchTerm) return deletedProjects;
            const lowerSearch = searchTerm.toLowerCase();
            return deletedProjects.filter(p => 
                p.moldName.toLowerCase().includes(lowerSearch) || 
                p.customer.toLowerCase().includes(lowerSearch)
            );
        }
    }, [cleanProjects, deletedProjects, searchTerm, subTab]);

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

    const handleRestoreConfirm = async (mold) => {
        if (!db || isRestoring) return;
        if (!window.confirm(`"${mold.moldName}" kalıbını silinenlerden geri yüklemek istediğinize emin misiniz?`)) return;
        setIsRestoring(true);
        try {
            const { deletedAt, ...originalData } = mold;
            await setDoc(doc(db, PROJECT_COLLECTION, mold.id), originalData);
            await deleteDoc(doc(db, DELETED_PROJECT_COLLECTION, mold.id));
        } catch (e) {
            console.error("Kalıp geri yüklenirken hata:", e);
            alert("Kalıp geri yüklenirken bir hata oluştu.");
        } finally {
            setIsRestoring(false);
        }
    };

    return (
        <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900/10">
            <h3 className="text-xl font-semibold dark:text-white mb-4 flex items-center">
                <Database className="w-5 h-5 mr-2 text-blue-500 animate-pulse" />
                Kalıp / Proje Yönetimi
            </h3>

            {/* Sub-tabs */}
            <div className="flex border-b border-gray-200 dark:border-gray-700 mb-4 gap-2">
                <button
                    onClick={() => { setSubTab('active'); setSearchTerm(''); }}
                    className={`px-4 py-2 text-sm font-bold rounded-t-lg border-t border-x -mb-[1px] transition-all duration-200 ${
                        subTab === 'active'
                            ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 border-gray-200 dark:border-gray-700'
                            : 'bg-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 border-transparent'
                    }`}
                >
                    Aktif Kalıplar ({cleanProjects.length})
                </button>
                <button
                    onClick={() => { setSubTab('deleted'); setSearchTerm(''); }}
                    className={`px-4 py-2 text-sm font-bold rounded-t-lg border-t border-x -mb-[1px] transition-all duration-200 ${
                        subTab === 'deleted'
                            ? 'bg-white dark:bg-gray-800 text-red-600 dark:text-red-400 border-gray-200 dark:border-gray-700'
                            : 'bg-transparent text-gray-500 hover:text-red-500 border-transparent'
                    }`}
                >
                    Silinen Kalıplar / Çöp Kutusu ({deletedProjects.length})
                </button>
            </div>
            
            <div className="mb-4 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                    type="text"
                    placeholder={subTab === 'active' ? "Kalıp adı veya müşteri ara..." : "Silinen kalıp adı veya müşteri ara..."}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 font-medium text-sm"
                />
            </div>

            <div className="max-h-[60vh] overflow-y-auto bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                <div className="divide-y divide-gray-200 dark:divide-gray-700">
                    {filteredProjects.length === 0 ? (
                        <p className="p-4 text-center text-gray-500 dark:text-gray-400 font-medium">Kayıt bulunamadı.</p>
                    ) : (
                        filteredProjects.map(mold => (
                            <div key={mold.id} className="p-3 flex justify-between items-center hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                <div>
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <p className="font-semibold text-gray-900 dark:text-white">{mold.moldName}</p>
                                        <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded uppercase shrink-0 ${
                                            PROJECT_TYPE_CONFIG[mold.projectType || 'YENİ KALIP']?.colorClass || 'bg-gray-100 text-gray-800'
                                        }`}>
                                            {PROJECT_TYPE_CONFIG[mold.projectType || 'YENİ KALIP']?.label || 'YENİ KALIP'}
                                        </span>
                                    </div>
                                    <p className="text-sm text-gray-600 dark:text-gray-400 font-medium">{mold.customer}</p>
                                    <p className="text-xs text-gray-400 dark:text-gray-500">
                                        ID: {mold.id} 
                                        {mold.deletedAt && ` • Silinme: ${new Date(mold.deletedAt).toLocaleString('tr-TR')}`}
                                    </p>
                                </div>
                                <div className="flex gap-2">
                                    {subTab === 'active' ? (
                                        <>
                                            <button onClick={() => openEditModal(mold)} className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition" title="Düzenle"><Edit className="w-4 h-4" /></button>
                                            <button onClick={() => openDeleteModal(mold)} className="p-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition" title="Sil"><Trash2 className="w-4 h-4" /></button>
                                        </>
                                    ) : (
                                        <button 
                                            onClick={() => handleRestoreConfirm(mold)} 
                                            disabled={isRestoring}
                                            className="px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white text-xs font-black rounded-lg transition flex items-center gap-1" 
                                            title="Geri Yükle"
                                        >
                                            <RefreshCw className={`w-3.5 h-3.5 ${isRestoring ? 'animate-spin' : ''}`} />
                                            Geri Yükle
                                        </button>
                                    )}
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
                        <div className="flex items-center gap-3 mb-4"><AlertTriangle className="w-12 h-12 text-red-500" /><p>**{selectedMold.moldName}** kalıbını silmek üzeresiniz. Bu işlem, kalıbı aktif listesinden kaldırıp Çöp Kutusu'na taşıyacaktır.</p></div>
                         <p className="font-semibold text-center font-bold">Bu kalıp daha sonra Çöp Kutusu'ndan geri yüklenebilir. Silmek istediğinize emin misiniz?</p>
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
                                                <span className="truncate flex items-center gap-2">
                                                    {selectedMoldId ? (() => {
                                                        const p = cleanProjects.find(item => item.id === selectedMoldId);
                                                        if (!p) return "Kalıp Seçiniz";
                                                        const cfg = PROJECT_TYPE_CONFIG[p.projectType || 'YENİ KALIP'];
                                                        return (
                                                            <>
                                                                <span>{p.moldName}</span>
                                                                <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase ${cfg?.colorClass || 'bg-gray-100 text-gray-800'}`}>
                                                                    {cfg?.label || 'YENİ KALIP'}
                                                                </span>
                                                            </>
                                                        );
                                                    })() : "Kalıp Seçiniz"}
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
                                                                .map(p => {
                                                                    const cfg = PROJECT_TYPE_CONFIG[p.projectType || 'YENİ KALIP'];
                                                                    return (
                                                                        <button
                                                                            key={p.id}
                                                                            type="button"
                                                                            onClick={() => {
                                                                                setSelectedMoldId(p.id);
                                                                                setBatchError('');
                                                                                setIsSearchableSelectOpen(false);
                                                                                setMoldSearchQuery('');
                                                                            }}
                                                                            className={`w-full text-left px-3 py-2 text-sm rounded font-medium transition-colors flex justify-between items-center ${
                                                                                selectedMoldId === p.id 
                                                                                    ? 'bg-blue-600 text-white' 
                                                                                    : 'text-gray-700 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-blue-900/30'
                                                                            }`}
                                                                        >
                                                                            <span>{p.moldName}</span>
                                                                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase shrink-0 ${
                                                                                selectedMoldId === p.id 
                                                                                    ? 'bg-blue-500 text-white' 
                                                                                    : cfg?.colorClass || 'bg-gray-150 text-gray-800'
                                                                            }`}>
                                                                                {cfg?.label || 'YENİ KALIP'}
                                                                            </span>
                                                                        </button>
                                                                    );
                                                                })
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
                        db={db}
                        projects={projects}
                        handleDeleteMold={handleDeleteMold}
                        handleUpdateMold={handleUpdateMold}
                    />
                );
            case 'permissions':
                return (
                    <RolePermissionsManagement db={db} />
                );
            case 'menu_layout':
                return (
                    <MenuLayoutManagement db={db} />
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

                    <button onClick={() => setActiveTab('menu_layout')} className={`py-2 px-1 border-b-2 font-medium text-sm ${activeTab === 'menu_layout' ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}><List className="w-4 h-4 inline mr-2" /> Menü Düzeni</button>
                </nav>
            </div>
            {renderActiveTab()}
        </div>
    );
};

// --- BİLEŞEN: Menü Düzeni Kategorizasyon Yönetimi ---
const MenuLayoutManagement = ({ db }) => {
    const DEFAULT_MENU_CATEGORIES = useMemo(() => [
        {
            id: "cat-1",
            title: "Kalıphane Planlama & İzleme",
            pagePaths: ["/", "/canli-durum", "/vardiya-plani", "/vardiya-takip", "/project-management", "/design-office", "/machine-queue", "/mold-trial-reports", "/mold-maintenance", "/machine-maintenance", "/active", "/workshop-supervisor"]
        },
        {
            id: "cat-2",
            title: "Depo & Stok Yönetimi",
            pagePaths: ["/tool-inventory", "/tool-assignment", "/mold-material-debits", "/tool-history", "/tool-analysis", "/tool-lifecycle", "/mold-tool-tracking"]
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

    const [selectedRole, setSelectedRole] = useState(Object.values(ROLES)[0] || 'Tezgah Operatörü');
    const [rawLayoutData, setRawLayoutData] = useState(null);
    const [roleLayouts, setRoleLayouts] = useState({});
    const [dbPermissions, setDbPermissions] = useState({});

    const [categories, setCategories] = useState([]);
    const [selectedCategoryId, setSelectedCategoryId] = useState(null);
    const [newCategoryTitle, setNewCategoryTitle] = useState('');
    const [editingCategoryId, setEditingCategoryId] = useState(null);
    const [editingCategoryTitle, setEditingCategoryTitle] = useState('');
    const [saving, setSaving] = useState(false);

    // 1. Listen to permissions config
    useEffect(() => {
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

    // 2. Listen to menuLayout config
    useEffect(() => {
        if (!db) return;
        const unsub = onSnapshot(doc(db, 'config', 'menuLayout'), (docSnap) => {
            if (docSnap.exists()) {
                setRawLayoutData(docSnap.data());
            } else {
                setRawLayoutData({ categories: DEFAULT_MENU_CATEGORIES, roleLayouts: {} });
            }
        });
        return () => unsub();
    }, [db, DEFAULT_MENU_CATEGORIES]);

    // 3. Initialize roleLayouts when database data loads
    useEffect(() => {
        if (!rawLayoutData) return;
        const initialLayouts = { ...(rawLayoutData.roleLayouts || {}) };
        
        // Populate Admin using the global field if not set
        if (rawLayoutData.categories && !initialLayouts[ROLES.ADMIN]) {
            initialLayouts[ROLES.ADMIN] = rawLayoutData.categories;
        }

        // For roles that don't have layouts, generate them
        Object.values(ROLES).forEach(role => {
            if (!initialLayouts[role]) {
                const rolePerms = dbPermissions[role] || getDefaultPermissions(role);
                initialLayouts[role] = DEFAULT_MENU_CATEGORIES.map(cat => {
                    const allowedPaths = (cat.pagePaths || []).filter(path => {
                        const perm = rolePerms[path] || { view: false };
                        return perm.view;
                    });
                    return {
                        ...cat,
                        pagePaths: allowedPaths
                    };
                }).filter(cat => cat.pagePaths.length > 0);
            }
        });

        setRoleLayouts(initialLayouts);
    }, [rawLayoutData, dbPermissions, DEFAULT_MENU_CATEGORIES]);

    const prevRoleRef = React.useRef(selectedRole);

    // 4. Handle selectedRole change
    useEffect(() => {
        const prevRole = prevRoleRef.current;
        if (prevRole !== selectedRole) {
            setRoleLayouts(prev => ({
                ...prev,
                [prevRole]: categories
            }));
            prevRoleRef.current = selectedRole;
        }

        if (roleLayouts[selectedRole]) {
            setCategories(roleLayouts[selectedRole]);
        } else {
            const rolePerms = dbPermissions[selectedRole] || getDefaultPermissions(selectedRole);
            const fallback = DEFAULT_MENU_CATEGORIES.map(cat => {
                const allowedPaths = (cat.pagePaths || []).filter(path => {
                    const perm = rolePerms[path] || { view: false };
                    return perm.view;
                });
                return {
                    ...cat,
                    pagePaths: allowedPaths
                };
            }).filter(cat => cat.pagePaths.length > 0);
            setCategories(fallback);
        }
    }, [selectedRole, roleLayouts, dbPermissions, DEFAULT_MENU_CATEGORIES]);

    // Select first category by default if none selected
    useEffect(() => {
        if (categories.length > 0) {
            if (!selectedCategoryId || !categories.some(cat => cat.id === selectedCategoryId)) {
                setSelectedCategoryId(categories[0].id);
            }
        } else {
            setSelectedCategoryId(null);
        }
    }, [categories, selectedCategoryId]);

    // Calculate active pages for selected role
    const activePagesForRole = useMemo(() => {
        const rolePerms = dbPermissions[selectedRole] || getDefaultPermissions(selectedRole);
        return ALL_SYSTEM_PAGES.filter(page => {
            const resolvedPerm = rolePerms[page.path] || { view: false };
            return resolvedPerm.view;
        });
    }, [dbPermissions, selectedRole]);

    const handleAddCategory = () => {
        if (!newCategoryTitle.trim()) return;
        const newCat = {
            id: `cat-${Date.now()}`,
            title: newCategoryTitle.trim(),
            pagePaths: []
        };
        setCategories(prev => [...prev, newCat]);
        setSelectedCategoryId(newCat.id);
        setNewCategoryTitle('');
    };

    const handleStartEdit = (cat) => {
        setEditingCategoryId(cat.id);
        setEditingCategoryTitle(cat.title);
    };

    const handleSaveEdit = (catId) => {
        if (!editingCategoryTitle.trim()) return;
        setCategories(prev => prev.map(cat => 
            cat.id === catId ? { ...cat, title: editingCategoryTitle.trim() } : cat
        ));
        setEditingCategoryId(null);
    };

    const handleDeleteCategory = (catId) => {
        if (window.confirm("Bu kategoriyi silmek istediğinizden emin misiniz? (İçindeki sayfalar kategori dışı kalacaktır)")) {
            setCategories(prev => prev.filter(cat => cat.id !== catId));
            if (selectedCategoryId === catId) {
                setSelectedCategoryId(null);
            }
        }
    };

    const handleMoveCategory = (index, direction) => {
        const nextIndex = direction === 'UP' ? index - 1 : index + 1;
        if (nextIndex < 0 || nextIndex >= categories.length) return;
        const nextCategories = [...categories];
        const temp = nextCategories[index];
        nextCategories[index] = nextCategories[nextIndex];
        nextCategories[nextIndex] = temp;
        setCategories(nextCategories);
    };

    const handleTogglePage = (pagePath) => {
        if (!selectedCategoryId) return;
        setCategories(prev => {
            return prev.map(cat => {
                if (cat.id !== selectedCategoryId) {
                    return {
                        ...cat,
                        pagePaths: (cat.pagePaths || []).filter(path => path !== pagePath)
                    };
                }
                const exists = (cat.pagePaths || []).includes(pagePath);
                return {
                    ...cat,
                    pagePaths: exists 
                        ? cat.pagePaths.filter(path => path !== pagePath)
                        : [...(cat.pagePaths || []), pagePath]
                };
            });
        });
    };

    const handleSaveLayout = async () => {
        try {
            setSaving(true);
            const finalLayouts = {
                ...roleLayouts,
                [selectedRole]: categories
            };

            const adminLayout = finalLayouts[ROLES.ADMIN] || categories;

            await setDoc(doc(db, 'config', 'menuLayout'), { 
                roleLayouts: finalLayouts,
                categories: adminLayout
            });
            alert("Rol bazlı menü yerleşimi başarıyla kaydedildi.");
        } catch (e) {
            console.error(e);
            alert("Menü kaydedilirken hata oluştu.");
        } finally {
            setSaving(false);
        }
    };

    const selectedCategory = categories.find(cat => cat.id === selectedCategoryId);

    return (
        <div className="space-y-6 text-gray-900 dark:text-white">
            <div className="flex justify-between items-center bg-gray-50 dark:bg-gray-900/50 p-4 rounded-xl border border-gray-250 dark:border-gray-700">
                <div>
                    <h3 className="text-lg font-bold flex items-center gap-2">
                        <List className="w-5 h-5 text-blue-500" /> Sol Menü Kategorizasyonu (Rol Bazlı)
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Menüyü her bir kullanıcı rolü için bağımsız olarak tasarlayabilir, sayfaların sıralamasını ve ana başlıklarını yönetebilirsiniz.
                    </p>
                </div>
                <button
                    onClick={handleSaveLayout}
                    disabled={saving}
                    className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-extrabold rounded-xl transition shadow-lg shadow-blue-500/20 flex items-center gap-2 text-sm disabled:opacity-50"
                >
                    <Save className="w-4 h-4" /> {saving ? "Kaydediliyor..." : "Düzeni Kaydet"}
                </button>
            </div>

            {/* ROL SEÇİM ALANI */}
            <div className="flex flex-wrap items-center gap-4 bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-250 dark:border-gray-700 shadow-sm justify-between">
                <div className="flex items-center gap-3">
                    <label className="text-sm font-extrabold text-gray-700 dark:text-gray-300 uppercase shrink-0">Düzenlenecek Rol:</label>
                    <select
                        value={selectedRole}
                        onChange={(e) => setSelectedRole(e.target.value)}
                        className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:text-white font-bold"
                    >
                        {Object.values(ROLES).map(roleVal => (
                            <option key={roleVal} value={roleVal}>{roleVal}</option>
                        ))}
                    </select>
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 font-bold bg-blue-50 dark:bg-blue-950/20 px-3 py-2 rounded-lg border border-blue-200 dark:border-blue-900">
                    Seçili role ait aktif sayfa sayısı: <span className="text-blue-600 dark:text-blue-400 font-black text-sm">{activePagesForRole.length}</span>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                
                {/* Sol Taraf: Kategoriler */}
                <div className="lg:col-span-5 space-y-4">
                    <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-250 dark:border-gray-700 space-y-4 shadow-sm">
                        <h4 className="font-extrabold text-sm text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                            Menü Ana Başlıkları
                        </h4>
                        
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={newCategoryTitle}
                                onChange={(e) => setNewCategoryTitle(e.target.value)}
                                placeholder="Yeni ana başlık adı..."
                                className="flex-1 p-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white text-sm outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <button
                                onClick={handleAddCategory}
                                className="px-4 py-2 bg-blue-100 hover:bg-blue-200 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 rounded-lg font-bold transition text-sm flex items-center gap-1"
                            >
                                <Plus className="w-4 h-4" /> Ekle
                            </button>
                        </div>

                        <div className="space-y-1.5 max-h-[500px] overflow-y-auto pr-1 custom-scrollbar">
                            {categories.map((cat, index) => {
                                const isSelected = cat.id === selectedCategoryId;
                                const isEditing = cat.id === editingCategoryId;
                                return (
                                    <div
                                        key={cat.id}
                                        onClick={() => !isEditing && setSelectedCategoryId(cat.id)}
                                        className={`p-3 rounded-lg border text-left flex items-center justify-between transition-all cursor-pointer ${
                                            isSelected
                                                ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-300 dark:border-blue-800 text-blue-900 dark:text-blue-200'
                                                : 'bg-gray-50 dark:bg-gray-900/20 border-gray-250 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-900/40 text-gray-700 dark:text-gray-300'
                                        }`}
                                    >
                                        <div className="flex-1 min-w-0 pr-2">
                                            {isEditing ? (
                                                <input
                                                    type="text"
                                                    value={editingCategoryTitle}
                                                    onChange={(e) => setEditingCategoryTitle(e.target.value)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') handleSaveEdit(cat.id);
                                                        if (e.key === 'Escape') setEditingCategoryId(null);
                                                    }}
                                                    onClick={(e) => e.stopPropagation()}
                                                    className="w-full p-1 border rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm outline-none focus:ring-1 focus:ring-blue-500 font-bold"
                                                    autoFocus
                                                />
                                            ) : (
                                                <div>
                                                    <span className="font-extrabold text-sm block truncate">{cat.title}</span>
                                                    <span className="text-[10px] text-gray-400 font-bold">
                                                        {(cat.pagePaths || []).length} Sayfa atandı
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                                            <button
                                                disabled={index === 0}
                                                onClick={() => handleMoveCategory(index, 'UP')}
                                                className="p-1 text-gray-400 hover:text-blue-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded disabled:opacity-30"
                                                title="Yukarı Taşı"
                                            >
                                                <ChevronUp className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                disabled={index === categories.length - 1}
                                                onClick={() => handleMoveCategory(index, 'DOWN')}
                                                className="p-1 text-gray-400 hover:text-blue-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded disabled:opacity-30"
                                                title="Aşağı Taşı"
                                            >
                                                <ChevronDown className="w-3.5 h-3.5" />
                                            </button>

                                            {isEditing ? (
                                                <button
                                                    onClick={() => handleSaveEdit(cat.id)}
                                                    className="p-1 text-green-600 hover:bg-green-50 dark:hover:bg-green-950/20 rounded"
                                                    title="Kaydet"
                                                >
                                                    <Save className="w-3.5 h-3.5" />
                                                </button>
                                            ) : (
                                                <button
                                                    onClick={() => handleStartEdit(cat)}
                                                    className="p-1 text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/20 rounded"
                                                    title="Adı Düzenle"
                                                >
                                                    <Edit className="w-3.5 h-3.5" />
                                                </button>
                                            )}
                                            <button
                                                onClick={() => handleDeleteCategory(cat.id)}
                                                className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/45 rounded"
                                                title="Kategoriyi Sil"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Sağ Taraf: Sayfa Atamaları ve Sıralama */}
                <div className="lg:col-span-7">
                    {selectedCategory ? (
                        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-250 dark:border-gray-700 space-y-6 shadow-sm">
                            <div className="border-b border-gray-150 dark:border-gray-700 pb-3 flex justify-between items-end">
                                <div>
                                    <h4 className="font-extrabold text-sm text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                        Seçili Başlık Düzeni
                                    </h4>
                                    <h3 className="text-xl font-black text-blue-600 dark:text-blue-400 mt-1">
                                        {selectedCategory.title}
                                    </h3>
                                </div>
                                <span className="text-xs bg-gray-100 dark:bg-gray-700 px-3 py-1 rounded-full font-bold text-gray-600 dark:text-gray-400">
                                    {(selectedCategory.pagePaths || []).length} Sayfa Aktif
                                </span>
                            </div>

                            {/* ATANAN SAYFALARIN SIRALAMASI */}
                            {(selectedCategory.pagePaths || []).length > 0 && (
                                <div className="border border-blue-200 dark:border-blue-800 bg-blue-50/20 dark:bg-blue-950/10 p-4 rounded-xl space-y-3">
                                    <h5 className="text-xs font-black text-blue-600 dark:text-blue-400 uppercase tracking-wider flex items-center gap-1.5">
                                        <ListOrdered className="w-4 h-4" /> Sayfa Sıralaması (Yukarı / Aşağı Taşı)
                                    </h5>
                                    <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1 custom-scrollbar">
                                        {(selectedCategory.pagePaths || []).map((path, idx) => {
                                            const pageInfo = ALL_SYSTEM_PAGES.find(p => p.path === path);
                                            if (!pageInfo) return null;
                                            return (
                                                <div key={path} className="flex items-center justify-between p-2 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[10px] font-bold text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded">
                                                            {idx + 1}
                                                        </span>
                                                        <div>
                                                            <span className="text-xs font-extrabold text-gray-800 dark:text-gray-200 block leading-tight">{pageInfo.label}</span>
                                                            <span className="text-[9px] text-gray-400 font-mono">{path}</span>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-0.5">
                                                        <button
                                                            type="button"
                                                            disabled={idx === 0}
                                                            onClick={() => {
                                                                const newPaths = [...(selectedCategory.pagePaths || [])];
                                                                const temp = newPaths[idx];
                                                                newPaths[idx] = newPaths[idx - 1];
                                                                newPaths[idx - 1] = temp;
                                                                
                                                                setCategories(prev => prev.map(cat => 
                                                                    cat.id === selectedCategoryId ? { ...cat, pagePaths: newPaths } : cat
                                                                ));
                                                            }}
                                                            className="p-1 text-gray-400 hover:text-blue-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded disabled:opacity-30"
                                                            title="Yukarı Taşı"
                                                        >
                                                            <ChevronUp className="w-4 h-4" />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            disabled={idx === (selectedCategory.pagePaths || []).length - 1}
                                                            onClick={() => {
                                                                const newPaths = [...(selectedCategory.pagePaths || [])];
                                                                const temp = newPaths[idx];
                                                                newPaths[idx] = newPaths[idx + 1];
                                                                newPaths[idx + 1] = temp;
                                                                
                                                                setCategories(prev => prev.map(cat => 
                                                                    cat.id === selectedCategoryId ? { ...cat, pagePaths: newPaths } : cat
                                                                ));
                                                            }}
                                                            className="p-1 text-gray-400 hover:text-blue-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded disabled:opacity-30"
                                                            title="Aşağı Taşı"
                                                        >
                                                            <ChevronDown className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* SAYFA EKLE / KALDIR LİSTESİ */}
                            <div className="space-y-3">
                                <h5 className="text-xs font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                    Sayfa Ekle / Kaldır (Bu Rol İçin Yetkili Sayfalar)
                                </h5>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[400px] overflow-y-auto pr-1 custom-scrollbar">
                                    {activePagesForRole.map(page => {
                                        const isAssignedToThis = (selectedCategory.pagePaths || []).includes(page.path);
                                        const assignedCat = categories.find(c => (c.pagePaths || []).includes(page.path));
                                        
                                        return (
                                            <button
                                                key={page.path}
                                                type="button"
                                                onClick={() => handleTogglePage(page.path)}
                                                className={`p-3 rounded-lg border text-left flex items-start gap-3 transition-all duration-150 ${
                                                    isAssignedToThis
                                                        ? 'bg-blue-50/50 dark:bg-blue-955 border-blue-300 dark:border-blue-800 text-blue-700 dark:text-blue-200'
                                                        : 'bg-gray-50 dark:bg-gray-900/20 border-gray-250 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-900/40 text-gray-700 dark:text-gray-300'
                                                }`}
                                            >
                                                <div className="pt-0.5">
                                                    <input
                                                        type="checkbox"
                                                        checked={isAssignedToThis}
                                                        readOnly
                                                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                                                    />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-xs font-extrabold truncate">{page.label}</p>
                                                    <p className="text-[9px] text-gray-400 font-mono truncate">{page.path}</p>
                                                    {assignedCat && assignedCat.id !== selectedCategoryId && (
                                                        <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider bg-orange-100 text-orange-850 dark:bg-orange-955 dark:text-orange-400 border border-orange-200 dark:border-orange-900">
                                                            {assignedCat.title} Altında
                                                        </span>
                                                    )}
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="h-64 flex flex-col items-center justify-center border border-dashed border-gray-300 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-800/10 text-gray-400">
                        t-gray-400">
                            <List className="w-10 h-10 mb-2 opacity-50" />
                            <p className="text-sm font-bold">Lütfen işlem yapmak için bir ana başlık seçin.</p>
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
};

export default AdminDashboard;