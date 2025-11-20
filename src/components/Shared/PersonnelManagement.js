// src/components/Shared/PersonnelManagement.js

import React, { useState } from 'react';

// İkonlar (DÜZELTME: Keypad yerine Hash kullanıldı)
import { Users, AlertTriangle, Edit2, Trash2, Cpu, Hash } from 'lucide-react';

// Sabitler
import { PERSONNEL_ROLES } from '../../config/constants.js';

// Yardımcı Fonksiyonlar
import { getCurrentDateTimeString } from '../../utils/dateUtils';

// Firebase
import { 
    db, 
    PERSONNEL_COLLECTION, 
    MACHINES_COLLECTION, 
    setDoc, 
    doc, 
    updateDoc, 
    deleteDoc 
} from '../../config/firebase.js';

// Modal
import Modal from '../Modals/Modal.js';


// --- GÜNCELLENMİŞ: PERSONEL YÖNETİMİ BİLEŞENİ (PIN Kodu Eklendi) ---
const PersonnelManagement = ({ personnel, setPersonnel, machines, setMachines }) => {
    // State'e pinCode eklendi
    const [newPersonnel, setNewPersonnel] = useState({ name: '', role: PERSONNEL_ROLES.CAM_OPERATOR, username: '', password: '', pinCode: '' });
    const [newMachine, setNewMachine] = useState('');
    const [editingMachine, setEditingMachine] = useState(null);
    const [editMachineName, setEditMachineName] = useState('');
    
    // Personel Düzenleme State'leri
    const [editingPersonnel, setEditingPersonnel] = useState(null);
    const [editPersonnelData, setEditPersonnelData] = useState({ name: '', role: '', username: '', password: '', pinCode: '' });

    // --- PERSONEL İŞLEMLERİ ---
    const handleAddPersonnel = async () => {
        if (!newPersonnel.name || !newPersonnel.role) {
            alert("Lütfen isim ve rol giriniz.");
            return;
        }
        
        // Eğer makine operatörü ise kullanıcı adı/şifre zorunlu değil, ama PIN olabilir.
        if (newPersonnel.role !== PERSONNEL_ROLES.MACHINE_OPERATOR) {
             if (!newPersonnel.username || !newPersonnel.password) {
                alert("Bu rol için Kullanıcı Adı ve Şifre zorunludur.");
                return;
             }
        }

        try {
            const newId = `person-${Date.now()}`;
            const personnelData = {
                id: newId,
                ...newPersonnel,
                createdAt: getCurrentDateTimeString()
            };

            await setDoc(doc(db, PERSONNEL_COLLECTION, newId), personnelData);
            
            // Formu sıfırla
            setNewPersonnel({ name: '', role: PERSONNEL_ROLES.CAM_OPERATOR, username: '', password: '', pinCode: '' });
            alert("Personel başarıyla eklendi.");
        } catch (error) {
            console.error("Personel ekleme hatası:", error);
            alert("Hata oluştu.");
        }
    };

    const handleDeletePersonnel = async (id) => {
        if (window.confirm("Bu personeli silmek istediğinize emin misiniz?")) {
            try {
                await deleteDoc(doc(db, PERSONNEL_COLLECTION, id));
            } catch (error) {
                console.error("Silme hatası:", error);
            }
        }
    };
    
    const handleEditPersonnel = (person) => {
        setEditingPersonnel(person);
        setEditPersonnelData({
            name: person.name,
            role: person.role,
            username: person.username || '',
            password: person.password || '',
            pinCode: person.pinCode || '' // Varsa PIN'i getir
        });
    };
    
    const handleUpdatePersonnel = async () => {
        if (!editingPersonnel || !db) return;
        
        try {
            const personRef = doc(db, PERSONNEL_COLLECTION, editingPersonnel.id);
            await updateDoc(personRef, {
                name: editPersonnelData.name,
                role: editPersonnelData.role,
                username: editPersonnelData.username,
                password: editPersonnelData.password,
                pinCode: editPersonnelData.pinCode
            });
            setEditingPersonnel(null); // Modalı kapat
        } catch (error) {
            console.error("Güncelleme hatası:", error);
            alert("Güncellenemedi.");
        }
    };


    // --- MAKİNE İŞLEMLERİ (Değişiklik Yok) ---
    const handleAddMachine = async () => {
        if (!newMachine.trim()) return;
        try {
            const newId = `machine-${newMachine.trim().replace(/\s+/g, '-')}`;
            await setDoc(doc(db, MACHINES_COLLECTION, newId), {
                id: newId,
                name: newMachine.trim(),
                createdAt: getCurrentDateTimeString()
            });
            setNewMachine('');
        } catch (error) {
            console.error("Makine ekleme hatası:", error);
        }
    };

    const handleDeleteMachine = async (id) => {
        if (window.confirm("Bu tezgahı silmek istediğinize emin misiniz?")) {
            try {
                await deleteDoc(doc(db, MACHINES_COLLECTION, id));
            } catch (error) {
                console.error("Silme hatası:", error);
            }
        }
    };
    
    const handleEditMachine = (machine) => {
        setEditingMachine(machine);
        setEditMachineName(machine.name);
    };
    
    const handleUpdateMachine = async () => {
        if (!editingMachine || !editMachineName.trim()) return;
        try {
            await updateDoc(doc(db, MACHINES_COLLECTION, editingMachine.id), {
                name: editMachineName.trim()
            });
            setEditingMachine(null);
            setEditMachineName('');
        } catch (error) {
            console.error("Güncelleme hatası:", error);
        }
    };


    return (
        <div className="space-y-8">
            
            {/* --- 1. PERSONEL YÖNETİMİ --- */}
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center">
                    <Users className="w-5 h-5 mr-2" /> Personel Listesi
                </h3>
                
                {/* Ekleme Formu */}
                <div className="grid grid-cols-1 md:grid-cols-6 gap-3 mb-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                    <div className="md:col-span-1">
                         <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Ad Soyad</label>
                        <input 
                            type="text" 
                            placeholder="Ad Soyad" 
                            value={newPersonnel.name} 
                            onChange={(e) => setNewPersonnel({ ...newPersonnel, name: e.target.value })} 
                            className="w-full p-2 text-sm border rounded dark:bg-gray-600 dark:border-gray-500 dark:text-white" 
                        />
                    </div>
                    <div className="md:col-span-1">
                         <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Rol</label>
                        <select 
                            value={newPersonnel.role} 
                            onChange={(e) => setNewPersonnel({ ...newPersonnel, role: e.target.value })} 
                            className="w-full p-2 text-sm border rounded dark:bg-gray-600 dark:border-gray-500 dark:text-white"
                        >
                            {Object.values(PERSONNEL_ROLES).map(role => (
                                <option key={role} value={role}>{role}</option>
                            ))}
                        </select>
                    </div>
                    
                    {/* Kullanıcı Adı / Şifre */}
                    <div className="md:col-span-1">
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Kullanıcı Adı (Giriş)</label>
                        <input 
                            type="text" 
                            placeholder="Kullanıcı Adı" 
                            value={newPersonnel.username} 
                            onChange={(e) => setNewPersonnel({ ...newPersonnel, username: e.target.value })} 
                            className="w-full p-2 text-sm border rounded dark:bg-gray-600 dark:border-gray-500 dark:text-white" 
                        />
                    </div>
                    <div className="md:col-span-1">
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Şifre (Giriş)</label>
                        <input 
                            type="text" 
                            placeholder="Şifre" 
                            value={newPersonnel.password} 
                            onChange={(e) => setNewPersonnel({ ...newPersonnel, password: e.target.value })} 
                            className="w-full p-2 text-sm border rounded dark:bg-gray-600 dark:border-gray-500 dark:text-white" 
                        />
                    </div>

                    {/* YENİ: PIN KODU ALANI (DÜZELTİLDİ: Hash İkonu) */}
                    <div className="md:col-span-1">
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Terminal PIN</label>
                        <div className="relative">
                            <Hash className="absolute left-2 top-2 w-4 h-4 text-gray-400" />
                            <input 
                                type="text" 
                                placeholder="Örn: 1234" 
                                value={newPersonnel.pinCode} 
                                onChange={(e) => setNewPersonnel({ ...newPersonnel, pinCode: e.target.value })} 
                                className="w-full p-2 pl-8 text-sm border rounded dark:bg-gray-600 dark:border-gray-500 dark:text-white font-mono" 
                                maxLength="4"
                            />
                        </div>
                    </div>

                    <div className="md:col-span-1 flex items-end">
                        <button onClick={handleAddPersonnel} className="w-full p-2 bg-green-600 text-white rounded hover:bg-green-700 transition text-sm font-medium">
                            Ekle
                        </button>
                    </div>
                </div>

                {/* Liste */}
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-700">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-300 uppercase">İsim</th>
                                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-300 uppercase">Rol</th>
                                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-300 uppercase">Kullanıcı Adı</th>
                                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-300 uppercase">PIN</th>
                                <th className="px-4 py-3 text-right text-xs font-bold text-gray-500 dark:text-gray-300 uppercase">İşlem</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200 dark:bg-gray-800 dark:divide-gray-700">
                            {personnel.map(p => (
                                <tr key={p.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-white font-medium">{p.name}</td>
                                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                                        <span className="px-2 py-1 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 text-xs font-semibold">
                                            {p.role}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{p.username || '-'}</td>
                                    <td className="px-4 py-3 text-sm font-mono text-gray-900 dark:text-white">
                                        {p.pinCode ? (
                                            <span className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded border dark:border-gray-600">
                                                {p.pinCode}
                                            </span>
                                        ) : (
                                            <span className="text-gray-400 text-xs italic">Yok</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-right text-sm font-medium space-x-2">
                                        <button onClick={() => handleEditPersonnel(p)} className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"><Edit2 className="w-4 h-4" /></button>
                                        <button onClick={() => handleDeletePersonnel(p.id)} className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"><Trash2 className="w-4 h-4" /></button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>


            {/* --- 2. TEZGAH YÖNETİMİ --- */}
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center">
                    <Cpu className="w-5 h-5 mr-2" /> Tezgah Listesi
                </h3>
                <div className="flex gap-4 mb-6">
                    <input 
                        type="text" 
                        placeholder="Yeni Tezgah Adı (Örn: K-40)" 
                        value={newMachine} 
                        onChange={(e) => setNewMachine(e.target.value)} 
                        className="flex-1 p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    />
                    <button onClick={handleAddMachine} className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 transition">Ekle</button>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                    {machines.map(machine => (
                        <div key={machine.id} className="p-3 border rounded-lg flex flex-col items-center justify-between bg-gray-50 dark:bg-gray-700 dark:border-gray-600 hover:shadow-md transition">
                             {editingMachine && editingMachine.id === machine.id ? (
                                <div className="flex flex-col w-full gap-2">
                                    <input 
                                        type="text" 
                                        value={editMachineName} 
                                        onChange={(e) => setEditMachineName(e.target.value)}
                                        className="w-full p-1 text-sm border rounded"
                                    />
                                    <div className="flex justify-between">
                                        <button onClick={handleUpdateMachine} className="text-xs bg-green-500 text-white px-2 py-1 rounded">Kaydet</button>
                                        <button onClick={() => setEditingMachine(null)} className="text-xs bg-gray-400 text-white px-2 py-1 rounded">İptal</button>
                                    </div>
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
            </div>

            {/* --- PERSONEL DÜZENLEME MODALI --- */}
            <Modal isOpen={!!editingPersonnel} onClose={() => setEditingPersonnel(null)} title="Personel Düzenle">
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Ad Soyad</label>
                        <input type="text" value={editPersonnelData.name} onChange={(e) => setEditPersonnelData({...editPersonnelData, name: e.target.value})} className="w-full p-2 border rounded dark:bg-gray-700 dark:text-white" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Rol</label>
                        <select value={editPersonnelData.role} onChange={(e) => setEditPersonnelData({...editPersonnelData, role: e.target.value})} className="w-full p-2 border rounded dark:bg-gray-700 dark:text-white">
                             {Object.values(PERSONNEL_ROLES).map(role => (<option key={role} value={role}>{role}</option>))}
                        </select>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Kullanıcı Adı</label>
                            <input type="text" value={editPersonnelData.username} onChange={(e) => setEditPersonnelData({...editPersonnelData, username: e.target.value})} className="w-full p-2 border rounded dark:bg-gray-700 dark:text-white" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Şifre</label>
                            <input type="text" value={editPersonnelData.password} onChange={(e) => setEditPersonnelData({...editPersonnelData, password: e.target.value})} className="w-full p-2 border rounded dark:bg-gray-700 dark:text-white" />
                        </div>
                    </div>

                    {/* YENİ: PIN KODU DÜZENLEME (DÜZELTİLDİ: Hash İkonu) */}
                    <div className="bg-gray-50 dark:bg-gray-900 p-3 rounded border dark:border-gray-700">
                        <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1 flex items-center">
                            <Hash className="w-4 h-4 mr-2" /> Terminal PIN Kodu
                        </label>
                        <input 
                            type="text" 
                            value={editPersonnelData.pinCode} 
                            onChange={(e) => setEditPersonnelData({...editPersonnelData, pinCode: e.target.value})} 
                            placeholder="4 haneli PIN"
                            className="w-full p-2 border rounded dark:bg-gray-700 dark:text-white font-mono tracking-widest text-center text-lg" 
                            maxLength="4"
                        />
                        <p className="text-xs text-gray-500 mt-1">Bu kod ile operatör tablet/terminal üzerinden hızlı giriş yapabilir.</p>
                    </div>

                    <div className="flex justify-end pt-4">
                        <button onClick={handleUpdatePersonnel} className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">Güncelle</button>
                    </div>
                </div>
            </Modal>

        </div>
    );
};

export default PersonnelManagement;