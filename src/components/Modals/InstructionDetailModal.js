// src/components/Modals/InstructionDetailModal.js

import React, { useState } from 'react';
import { CheckCircle, ShieldCheck, Clock, User, Sliders, Users, AlertCircle, Eye } from 'lucide-react';
import Modal from './Modal.js';
import { doc, updateDoc } from '../../config/firebase.js';
import { PROCESS_INSTRUCTIONS_COLLECTION } from '../../config/constants.js';

const InstructionDetailModal = ({ isOpen, onClose, instruction, db, loggedInUser, personnel = [] }) => {
    const [isConfirming, setIsConfirming] = useState(false);
    const [selectedImage, setSelectedImage] = useState(null);

    if (!instruction) return null;

    const currentUserName = loggedInUser?.name || '';
    const currentUserRole = loggedInUser?.role || '';

    const isConfirmed = (instruction.acknowledgments || []).some(
        a => a.userName === currentUserName
    );

    const userConfirmationDate = (instruction.acknowledgments || []).find(
        a => a.userName === currentUserName
    )?.confirmedAt;

    const handleConfirm = async () => {
        if (!currentUserName) {
            alert('Kullanıcı bilgisi okunamadı.');
            return;
        }

        setIsConfirming(true);
        try {
            const updatedAcks = [
                ...(instruction.acknowledgments || []),
                {
                    userName: currentUserName,
                    role: currentUserRole,
                    confirmedAt: new Date().toISOString()
                }
            ];

            if (db) {
                const docRef = doc(db, PROCESS_INSTRUCTIONS_COLLECTION, instruction.id);
                await updateDoc(docRef, {
                    acknowledgments: updatedAcks
                });
            }
        } catch (error) {
            console.error("Teyit işlemi başarısız:", error);
            alert("Teyit kaydedilirken hata oluştu.");
        } finally {
            setIsConfirming(false);
        }
    };

    // İlgili hedef personelleri bulma
    const targetPersonnel = personnel.filter(p => 
        (instruction.targetRoles || []).includes(p.role)
    );

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="📜 CAM & Proses Talimat Detayı">
            <div className="space-y-5 text-xs text-gray-800 dark:text-gray-200">
                
                {/* ÜST BİLGİ BANNERİ */}
                <div className="flex flex-wrap justify-between items-start gap-2 border-b border-gray-200 dark:border-gray-700 pb-3">
                    <div>
                        <span className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 dark:bg-indigo-900/60 dark:text-indigo-300 font-bold text-[10px]">
                            {instruction.category}
                        </span>
                        <h2 className="text-base font-bold text-gray-900 dark:text-white mt-1 leading-snug">{instruction.title}</h2>
                        <p className="text-[11px] text-gray-500 mt-0.5">Yayınlayan: <b>{instruction.createdBy}</b> ({new Date(instruction.createdAt).toLocaleDateString('tr-TR')})</p>
                    </div>

                    {isConfirmed ? (
                        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 rounded-lg font-bold">
                            <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" /> Okundu & Teyit Edildi
                        </div>
                    ) : (
                        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 rounded-lg font-bold">
                            <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400" /> Teyit Bekliyor
                        </div>
                    )}
                </div>

                {/* HEDEF ROLLER */}
                <div>
                    <span className="font-bold text-gray-500 uppercase tracking-wider text-[10px] block mb-1">Okuması Gereken Roller</span>
                    <div className="flex flex-wrap gap-1">
                        {(instruction.targetRoles || []).map(r => (
                            <span key={r} className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-gray-700 dark:text-gray-300 font-bold text-[10px]">
                                {r}
                            </span>
                        ))}
                    </div>
                </div>

                {/* KESİCİ TAKIM PARAMETRE KARTI */}
                {instruction.parameters && (
                    <div className="bg-gray-50 dark:bg-gray-800/80 p-4 rounded-xl border border-gray-200 dark:border-gray-700 space-y-2">
                        <h4 className="font-bold text-xs text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
                            <Sliders className="w-4 h-4" /> Standart İşleme Parametreleri
                        </h4>
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-1 text-center">
                            <div className="bg-white dark:bg-gray-700 p-2 rounded-lg border border-gray-100 dark:border-gray-600">
                                <span className="text-[10px] text-gray-400 block font-bold">Vc (Kesme Hızı)</span>
                                <span className="font-black text-sm text-indigo-600 dark:text-indigo-400">{instruction.parameters.vc} m/dk</span>
                            </div>
                            <div className="bg-white dark:bg-gray-700 p-2 rounded-lg border border-gray-100 dark:border-gray-600">
                                <span className="text-[10px] text-gray-400 block font-bold">fz (İlerleme)</span>
                                <span className="font-black text-sm text-indigo-600 dark:text-indigo-400">{instruction.parameters.fz} mm/diş</span>
                            </div>
                            <div className="bg-white dark:bg-gray-700 p-2 rounded-lg border border-gray-100 dark:border-gray-600">
                                <span className="text-[10px] text-gray-400 block font-bold">ae (Yan Adım)</span>
                                <span className="font-black text-sm text-indigo-600 dark:text-indigo-400">{instruction.parameters.ae} mm</span>
                            </div>
                            <div className="bg-white dark:bg-gray-700 p-2 rounded-lg border border-gray-100 dark:border-gray-600">
                                <span className="text-[10px] text-gray-400 block font-bold">ap (Derinlik)</span>
                                <span className="font-black text-sm text-indigo-600 dark:text-indigo-400">{instruction.parameters.ap} mm</span>
                            </div>
                            <div className="bg-white dark:bg-gray-700 p-2 rounded-lg border border-gray-100 dark:border-gray-600 col-span-2 sm:col-span-1">
                                <span className="text-[10px] text-gray-400 block font-bold">Soğutma Tipi</span>
                                <span className="font-bold text-xs text-indigo-600 dark:text-indigo-400 truncate">{instruction.parameters.coolant || '-'}</span>
                            </div>
                        </div>
                    </div>
                )}

                {/* ÖZEL AÇIKLAMALAR & DİKKAT EDİLECEK HUSUSLAR */}
                {instruction.instructionNote && (
                    <div className="bg-amber-50/70 dark:bg-amber-900/20 p-3 rounded-xl border border-amber-200 dark:border-amber-800">
                        <span className="font-bold text-amber-800 dark:text-amber-300 block mb-1">📌 Özel Talimat Notu:</span>
                        <p className="text-amber-900 dark:text-amber-200 leading-relaxed italic">{instruction.instructionNote}</p>
                    </div>
                )}

                {/* FOTOĞRAFLAR VE GÖRSELLER */}
                {instruction.images && instruction.images.length > 0 && (
                    <div>
                        <span className="font-bold text-gray-500 uppercase tracking-wider text-[10px] block mb-2">Takım & Bağlama Görselleri ({instruction.images.length})</span>
                        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                            {instruction.images.map((img, idx) => (
                                <div key={idx} onClick={() => setSelectedImage(img)} className="relative group rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 h-24 bg-black cursor-pointer">
                                    <img src={img} alt={`görsel-${idx}`} className="w-full h-full object-cover group-hover:scale-105 transition" />
                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
                                        <Eye className="w-5 h-5 text-white" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* TEYİT VERME BUTONU VEYA ONAY BİLGİSİ */}
                <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
                    {!isConfirmed ? (
                        <button
                            onClick={handleConfirm}
                            disabled={isConfirming}
                            className="w-full py-3 bg-green-600 hover:bg-green-500 text-white rounded-xl font-bold text-sm shadow-lg transition flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            <ShieldCheck className="w-5 h-5" />
                            {isConfirming ? 'Teyit Ediliyor...' : '✅ Bu Talimatı Okudum, Anladım ve Operasyonlarımda Uygulayacağımı Teyit Ediyorum'}
                        </button>
                    ) : (
                        <div className="p-3 bg-green-50 dark:bg-green-900/30 rounded-xl border border-green-200 dark:border-green-800 text-center space-y-1">
                            <p className="font-bold text-green-800 dark:text-green-300 text-xs flex items-center justify-center gap-1.5">
                                <CheckCircle className="w-4 h-4 text-green-600" /> Teyidiniz Alınmıştır
                            </p>
                            <p className="text-[10px] text-green-700 dark:text-green-400">
                                {new Date(userConfirmationDate).toLocaleString('tr-TR')} tarihinde bu talimatı okuyup onayladınız.
                            </p>
                        </div>
                    )}
                </div>

                {/* YÖNETİCİ CANLI OKUMA MATRİSİ (KİMLER OKUDU / KİMLER OKUMADI) */}
                <div className="bg-gray-50 dark:bg-gray-800/60 p-4 rounded-xl border border-gray-200 dark:border-gray-700 space-y-3">
                    <h4 className="font-bold text-xs text-gray-700 dark:text-gray-300 flex items-center justify-between">
                        <span className="flex items-center gap-1.5"><Users className="w-4 h-4 text-indigo-500" /> Personel Okunma & Teyit Durumu</span>
                        <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400">
                            {(instruction.acknowledgments || []).length} / {targetPersonnel.length || (instruction.acknowledgments || []).length} Onay
                        </span>
                    </h4>

                    <div className="max-h-40 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700/50">
                        {targetPersonnel.length > 0 ? (
                            targetPersonnel.map(p => {
                                const ack = (instruction.acknowledgments || []).find(a => a.userName === p.name);
                                return (
                                    <div key={p.name} className="py-1.5 flex items-center justify-between text-[11px]">
                                        <div className="flex items-center gap-2">
                                            <User className="w-3.5 h-3.5 text-gray-400" />
                                            <span className="font-bold text-gray-800 dark:text-gray-200">{p.name}</span>
                                            <span className="text-[9px] text-gray-400">({p.role})</span>
                                        </div>
                                        {ack ? (
                                            <span className="font-bold text-green-600 dark:text-green-400 text-[10px] flex items-center gap-1">
                                                <CheckCircle className="w-3 h-3" /> {new Date(ack.confirmedAt).toLocaleDateString('tr-TR')} {new Date(ack.confirmedAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        ) : (
                                            <span className="font-bold text-red-500 text-[10px] bg-red-50 dark:bg-red-900/30 px-2 py-0.5 rounded">
                                                Okumadı (Bekliyor)
                                            </span>
                                        )}
                                    </div>
                                );
                            })
                        ) : (
                            (instruction.acknowledgments || []).map(ack => (
                                <div key={ack.userName} className="py-1.5 flex items-center justify-between text-[11px]">
                                    <span className="font-bold text-gray-800 dark:text-gray-200">{ack.userName} ({ack.role})</span>
                                    <span className="font-bold text-green-600 dark:text-green-400 text-[10px]">{new Date(ack.confirmedAt).toLocaleString('tr-TR')}</span>
                                </div>
                            ))
                        )}
                    </div>
                </div>

            </div>

            {/* BÜYÜK RESİM İNCELEME MODALI */}
            {selectedImage && (
                <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" onClick={() => setSelectedImage(null)}>
                    <img src={selectedImage} alt="büyük-görsel" className="max-w-full max-h-full rounded-lg object-contain" />
                </div>
            )}
        </Modal>
    );
};

export default InstructionDetailModal;
