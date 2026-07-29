// src/pages/ProcessImprovementPage.js

import React, { useState, useEffect } from 'react';
import { Lightbulb, FileText, Sparkles, CheckCircle2, MessageSquarePlus } from 'lucide-react';
import { collection, onSnapshot } from '../config/firebase.js';
import { IMPROVEMENT_REQUESTS_COLLECTION, PROCESS_INSTRUCTIONS_COLLECTION } from '../config/constants.js';

import ImprovementRequestsTab from './ImprovementRequestsTab.js';
import ProcessInstructionsTab from './ProcessInstructionsTab.js';

const ProcessImprovementPage = ({ db, loggedInUser, personnel = [] }) => {
    const [activeTab, setActiveTab] = useState('IMPROVEMENT_REQUESTS'); // 'IMPROVEMENT_REQUESTS' | 'PROCESS_INSTRUCTIONS'
    
    const [improvementRequests, setImprovementRequests] = useState([]);
    const [processInstructions, setProcessInstructions] = useState([]);

    // İYİLEŞTİRME TALEPLERİNİ CANLI DİNLEME
    useEffect(() => {
        if (!db) return;
        const colRef = collection(db, IMPROVEMENT_REQUESTS_COLLECTION);
        const unsubscribe = onSnapshot(colRef, (snapshot) => {
            const list = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setImprovementRequests(list);
        }, (err) => {
            console.error("İyileştirme talepleri dinleme hatası:", err);
        });

        return () => unsubscribe();
    }, [db]);

    // PROSES TALİMATLARINI CANLI DİNLEME
    useEffect(() => {
        if (!db) return;
        const colRef = collection(db, PROCESS_INSTRUCTIONS_COLLECTION);
        const unsubscribe = onSnapshot(colRef, (snapshot) => {
            const list = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setProcessInstructions(list);
        }, (err) => {
            console.error("Proses talimatları dinleme hatası:", err);
        });

        return () => unsubscribe();
    }, [db]);

    return (
        <div className="p-6 bg-gray-100 dark:bg-gray-900 min-h-screen">
            
            {/* BAŞLIK VE SEKME MENÜSÜ */}
            <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center mb-6 gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800 dark:text-white flex items-center gap-2">
                        <Sparkles className="w-7 h-7 text-amber-500" /> Süreç & İyileştirme Portalı
                    </h1>
                    <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">
                        Bölümler arası iyileştirme talepleri, kesici takım standartları ve teyitli proses talimatları paneli.
                    </p>
                </div>

                {/* SEKME BUTONLARI */}
                <div className="flex flex-wrap bg-white dark:bg-gray-800 p-1 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 gap-1">
                    
                    <button
                        onClick={() => setActiveTab('IMPROVEMENT_REQUESTS')}
                        className={`px-4 py-2.5 rounded-lg text-sm font-bold flex items-center transition ${
                            activeTab === 'IMPROVEMENT_REQUESTS'
                            ? 'bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-300 shadow-sm'
                            : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                        }`}
                    >
                        <Lightbulb className="w-4 h-4 mr-2 text-amber-500" /> 
                        İyileştirme & Öneri Talepleri ({improvementRequests.length})
                    </button>

                    <button
                        onClick={() => setActiveTab('PROCESS_INSTRUCTIONS')}
                        className={`px-4 py-2.5 rounded-lg text-sm font-bold flex items-center transition ${
                            activeTab === 'PROCESS_INSTRUCTIONS'
                            ? 'bg-indigo-100 text-indigo-900 dark:bg-indigo-900/50 dark:text-indigo-300 shadow-sm'
                            : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                        }`}
                    >
                        <FileText className="w-4 h-4 mr-2 text-indigo-500" /> 
                        CAM & Proses Talimatları ({processInstructions.length})
                    </button>

                </div>
            </div>

            {/* İÇERİK ALANI */}
            <div className="min-h-[500px]">
                {activeTab === 'IMPROVEMENT_REQUESTS' && (
                    <ImprovementRequestsTab 
                        db={db}
                        loggedInUser={loggedInUser}
                        improvementRequests={improvementRequests}
                    />
                )}

                {activeTab === 'PROCESS_INSTRUCTIONS' && (
                    <ProcessInstructionsTab 
                        db={db}
                        loggedInUser={loggedInUser}
                        personnel={personnel}
                        processInstructions={processInstructions}
                    />
                )}
            </div>

        </div>
    );
};

export default ProcessImprovementPage;
