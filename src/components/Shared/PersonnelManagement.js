// src/components/Shared/PersonnelManagement.js

import React, { useState } from 'react';

// İkonlar
import { Users, AlertTriangle, Edit2, Trash2, Cpu } from 'lucide-react';

// Sabitler ('.js' uzantısını ekledim)
import { PERSONNEL_ROLES } from '../../config/constants.js';

// Yardımcı Fonksiyonlar
import { getCurrentDateTimeString } from '../../utils/dateUtils';

// Firebase ('.js' uzantısını ekledim)
import { 
    db, 
    PERSONNEL_COLLECTION, 
    MACHINES_COLLECTION, 
    setDoc, 
    doc, 
    updateDoc, 
    deleteDoc 
} from '../../config/firebase.js';

// Modal ('.js' uzantısını ekledim)
import Modal from '../Modals/Modal.js';


// --- GÜNCELLENMİŞ: PERSONEL YÖNETİMİ BİLEŞENİ ---
const PersonnelManagement = ({ personnel, setPersonnel, machines, setMachines }) => {
    const [newPersonnel, setNewPersonnel] = useState({ name: '', role: PERSONNEL_ROLES.CAM_OPERATOR, username: '', password: '' });
    const [newMachine, setNewMachine] = useState('');
    const [editingMachine, setEditingMachine] = useState(null);
    const [editMachineName, setEditMachineName] = useState('');
    const [editingPersonnel, setEditingPersonnel] = useState(null);
    const [editPersonnelData, setEditPersonnelData] = useState({ name: '', role: '', username: '', password: '' });

    const handleAddPersonnel = async () => {
        if (!newPersonnel.name.trim()) return;
        const isLoginRole = newPersonnel.role !== PERSONNEL_ROLES.MACHINE_OPERATOR;
        if (isLoginRole && (!newPersonnel.username.trim() || !newPersonnel.password.trim())) {
            alert("Yönetici, CAM Operatörü veya Yetkili rolleri için Kullanıcı Adı ve Şifre zorunludur.");
            return;
        }
        const personnelId = `person-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const personnelData = {
            id: personnelId,
            name: newPersonnel.name.trim(),
            role: newPersonnel.role,
            createdAt: getCurrentDateTimeString(),
            username: isLoginRole ? newPersonnel.username.trim() : null,
            password: isLoginRole ? newPersonnel.password.trim() : null,
        };
        try {
            await setDoc(doc(db, PERSONNEL_COLLECTION, personnelId), personnelData);
            setNewPersonnel({ name: '', role: PERSONNEL_ROLES.CAM_OPERATOR, username: '', password: '' });
        } catch (error) { console.error("Personel eklenirken hata:", error);
        }
    };

    const handleDeletePersonnel = async (personnelId) => {
        try { await deleteDoc(doc(db, PERSONNEL_COLLECTION, personnelId));
        }
        catch (error) { console.error("Personel silinirken hata:", error); }
    };

    const handleEditPersonnelClick = (person) => {
        setEditingPersonnel(person);
        setEditPersonnelData({ name: person.name, role: person.role, username: person.username || '', password: person.password || '' });
    };

    const handleUpdatePersonnel = async () => {
        if (!editingPersonnel || !editPersonnelData.name.trim()) return;
        const isLoginRole = editPersonnelData.role !== PERSONNEL_ROLES.MACHINE_OPERATOR;
        if (isLoginRole && (!editPersonnelData.username.trim() || !editPersonnelData.password.trim())) {
             alert("Yönetici, CAM Operatörü veya Yetkili rolleri için Kullanıcı Adı ve Şifre zorunludur.");
             return;
        }
        const updatedData = {
            name: editPersonnelData.name.trim(),
            role: editPersonnelData.role,
            username: isLoginRole ? editPersonnelData.username.trim() : null,
            password: isLoginRole ? editPersonnelData.password.trim() : null,
        };
        try {
            await updateDoc(doc(db, PERSONNEL_COLLECTION, editingPersonnel.id), updatedData);
            setEditingPersonnel(null);
            setEditPersonnelData({ name: '', role: '', username: '', password: '' });
        } catch (error) { console.error("Personel güncellenirken hata:", error);
        }
    };

    const handleAddMachine = async () => {
        if (!newMachine.trim()) return;
        const machineId = `machine-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const machineData = { id: machineId, name: newMachine.trim(), createdAt: getCurrentDateTimeString() };
        try {
            await setDoc(doc(db, MACHINES_COLLECTION, machineId), machineData);
            setNewMachine('');
        } catch (error) { console.error("Tezgah eklenirken hata:", error); }
    };

    const handleEditMachine = (machine) => {
        setEditingMachine(machine);
        setEditMachineName(machine.name);
    };

    const handleUpdateMachine = async () => {
        if (!editMachineName.trim() || !editingMachine) return;
        try {
            await updateDoc(doc(db, MACHINES_COLLECTION, editingMachine.id), { name: editMachineName.trim() });
            setEditingMachine(null);
            setEditMachineName('');
        } catch (error) { console.error("Tezgah güncellenirken hata:", error); }
    };
    
    const handleDeleteMachine = async (machineId) => {
        try { await deleteDoc(doc(db, MACHINES_COLLECTION, machineId));
        }
        catch (error) { console.error("Tezgah silinirken hata:", error); }
    };
    
    const isNewPersonnelLoginRole = newPersonnel.role !== PERSONNEL_ROLES.MACHINE_OPERATOR;

    return (
        <div className="space-y-8">
            {/* Personel Yönetimi */}
            <div className="p-6 border border-blue-200 dark:border-blue-700 rounded-lg bg-blue-50 dark:bg-blue-900/10">
                <h3 className="text-xl font-semibold dark:text-white mb-4 flex items-center">
                    <Users className="w-6 h-6 mr-2" />
                    Personel Yönetimi
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 items-end">
                    <input type="text" placeholder="Personel Adı Soyadı" value={newPersonnel.name} onChange={(e) => setNewPersonnel({ ...newPersonnel, name: e.target.value })}
                        className="rounded-lg border-gray-300 dark:bg-gray-700 dark:border-gray-600 dark:text-white px-3 py-2" />
                    <select value={newPersonnel.role} onChange={(e) => setNewPersonnel({ ...newPersonnel, role: e.target.value })}
                        className="rounded-lg border-gray-300 dark:bg-gray-700 dark:border-gray-600 dark:text-white px-3 py-2">
                        {Object.values(PERSONNEL_ROLES).map(role => (<option key={role} value={role}>{role}</option>))}
                    </select>
                     <button onClick={handleAddPersonnel} disabled={!newPersonnel.name.trim()}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium disabled:opacity-50">
                        Personel Ekle
                    </button>
                    
                    {isNewPersonnelLoginRole && (
                        <>
                            <input type="text" placeholder="Kullanıcı Adı" value={newPersonnel.username} onChange={(e) => setNewPersonnel({ ...newPersonnel, username: e.target.value })}
                                className="rounded-lg border-gray-300 dark:bg-gray-700 dark:border-gray-600 dark:text-white px-3 py-2" />
                            <input type="text" placeholder="Şifre (Güvensiz)" value={newPersonnel.password} onChange={(e) => setNewPersonnel({ ...newPersonnel, password: e.target.value })}
                                className="rounded-lg border-gray-300 dark:bg-gray-700 dark:border-gray-600 dark:text-white px-3 py-2" />
                             <div className="flex items-center text-xs text-red-600 dark:text-red-400">
                                <AlertTriangle className="w-4 h-4 mr-1 flex-shrink-0" />
                                Şifreler güvensiz olarak saklanır!
                            </div>
                        </>
                    )}
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                    <h4 className="p-4 border-b border-gray-200 dark:border-gray-700 font-semibold">
                        Mevcut Personel ({personnel.length})
                    </h4>
                    <div className="max-h-64 overflow-y-auto">
                        {personnel.length === 0 ? (
                            <p className="p-4 text-center text-gray-500 dark:text-gray-400">Henüz personel bulunmuyor</p>
                        ) : (
                            <div className="divide-y divide-gray-200 dark:divide-gray-700">
                                {personnel.map((person) => (
                                    <div key={person.id} className="p-4 flex justify-between items-center">
                                        <div>
                                            <p className="font-medium text-gray-900 dark:text-white">{person.name}</p>
                                            <p className="text-sm text-gray-500 dark:text-gray-400">{person.role}</p>
                                            {person.username && (<p className="text-xs text-blue-500 dark:text-blue-400">K.Adı: {person.username}</p>)}
                                        </div>
                                        <div className="flex space-x-2">
                                            <button onClick={() => handleEditPersonnelClick(person)} className="p-2 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 transition" title="Düzenle">
                                                <Edit2 className="w-4 h-4" />
                                            </button>
                                            <button onClick={() => handleDeletePersonnel(person.id)} className="p-2 text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 transition" title="Sil">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
            
            {editingPersonnel && (
                <Modal isOpen={!!editingPersonnel} onClose={() => setEditingPersonnel(null)} title={`Personel Düzenle: ${editingPersonnel.name}`}>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Adı Soyadı</label>
                            <input type="text" value={editPersonnelData.name} 
                            onChange={(e) => setEditPersonnelData({ ...editPersonnelData, name: e.target.value })}
                                className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Rol</label>
                            <select value={editPersonnelData.role} onChange={(e) => setEditPersonnelData({ ...editPersonnelData, role: e.target.value })}
                                className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                                {Object.values(PERSONNEL_ROLES).map(role => (<option key={role} value={role}>{role}</option>))}
                            </select>
                        </div>
                        
                        {editPersonnelData.role !== PERSONNEL_ROLES.MACHINE_OPERATOR && (
                            <>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Kullanıcı Adı</label>
                                    <input type="text" value={editPersonnelData.username} onChange={(e) => setEditPersonnelData({ ...editPersonnelData, username: e.target.value })}
                                        className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Şifre</label>
                                    <input type="text" value={editPersonnelData.password} onChange={(e) => setEditPersonnelData({ ...editPersonnelData, password: e.target.value })}
                                        className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                                </div>
                            </>
                        )}
                    </div>
                    <div className="mt-6 flex justify-end space-x-3">
                        <button onClick={() => setEditingPersonnel(null)}
                            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-700 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition">
                            İptal
                        </button>
                        <button onClick={handleUpdatePersonnel}
                            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition">
                            Kaydet
                        </button>
                    </div>
                </Modal>
            )}

            {/* Tezgah Yönetimi */}
            <div className="p-6 border border-green-200 dark:border-green-700 rounded-lg bg-green-50 dark:bg-green-900/10">
                <h3 className="text-xl font-semibold dark:text-white mb-4 flex items-center">
                    <Cpu className="w-6 h-6 mr-2" />
                    Tezgah Yönetimi
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                    <input type="text" placeholder="Yeni Tezgah Kodu" value={newMachine} onChange={(e) => setNewMachine(e.target.value)}
                        className="rounded-lg border-gray-300 dark:bg-gray-700 dark:border-gray-600 dark:text-white px-3 py-2 md:col-span-3" />
                    <button onClick={handleAddMachine} disabled={!newMachine.trim()}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-medium disabled:opacity-50">
                        Tezgah Ekle
                    </button>
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                    <h4 className="p-4 border-b border-gray-200 dark:border-gray-700 font-semibold">
                        Mevcut Tezgahlar ({machines.length})
                    </h4>
                    <div className="max-h-64 overflow-y-auto">
                        {machines.length === 0 ?
                        (
                            <p className="p-4 text-center text-gray-500 dark:text-gray-400">Henüz tezgah bulunmuyor</p>
                        ) : (
                            <div className="divide-y divide-gray-200 dark:divide-gray-700">
                                {machines.map((machine) => (
                                    <div key={machine.id} className="p-4 flex justify-between items-center">
                                        {editingMachine?.id === machine.id ? (
                                            <div className="flex-1 flex gap-2">
                                                <input type="text" value={editMachineName} onChange={(e) => setEditMachineName(e.target.value)}
                                                    className="flex-1 rounded-lg border-gray-300 dark:bg-gray-700 dark:border-gray-600 dark:text-white px-3 py-2" />
                                                <button onClick={handleUpdateMachine} className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition text-sm">
                                                    Kaydet
                                                </button>
                                                <button onClick={() => setEditingMachine(null)} className="px-3 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition text-sm">
                                                    İptal
                                                </button>
                                            </div>
                                        ) : (
                                            <>
                                                <p className="font-medium text-gray-900 dark:text-white">{machine.name}</p>
                                                <div className="flex gap-2">
                                                    <button onClick={() => handleEditMachine(machine)} className="p-2 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 transition">
                                                        <Edit2 className="w-4 h-4" />
                                                    </button>
                                                    <button onClick={() => handleDeleteMachine(machine.id)} className="p-2 text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 transition">
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PersonnelManagement;