// src/pages/WorkshopEditorPage.js

import React, { useState, useEffect, useMemo } from 'react';
import GridLayout from 'react-grid-layout';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { Save, RotateCcw, LayoutDashboard, Monitor, Map as MapIcon, Copy } from 'lucide-react';
import { OPERATION_STATUS } from '../config/constants';

const WorkshopEditorPage = ({ machines, projects }) => {
    const [activeTab, setActiveTab] = useState('standard'); 
    
    const [layout, setLayout] = useState([]);
    const [isSaving, setIsSaving] = useState(false);
    const [isLoaded, setIsLoaded] = useState(false);

    const collectionName = 'workshop_settings';
    const docId = activeTab === 'tv' ? 'tv_layout' : 'layout';

    // Canlı Durum Hesaplama (Sadece editörde renkleri görmek için)
    const machineStatusMap = useMemo(() => {
        const statusMap = {};
        const runningOps = projects.flatMap(mold => 
            mold.tasks.flatMap(task => 
                task.operations
                    .filter(op => op.status === OPERATION_STATUS.IN_PROGRESS)
                    .map(op => ({ machineName: op.machineName }))
            )
        );
        machines.forEach(m => {
            const isBusy = runningOps.some(op => op.machineName === m.name);
            statusMap[m.name] = isBusy;
        });
        return statusMap;
    }, [projects, machines]);

    // Veritabanından Yerleşimi Çek
    useEffect(() => {
        setIsLoaded(false);
        const fetchLayout = async () => {
            try {
                const docRef = doc(db, collectionName, docId);
                const docSnap = await getDoc(docRef);
                
                let savedLayout = [];
                if (docSnap.exists()) {
                    savedLayout = docSnap.data().layout || [];
                }

                // Makineleri yerleşime eşle, yeni makine varsa ekle (Varsayılan Konumlandırma)
                const mergedLayout = machines.map((machine, index) => {
                    const savedItem = savedLayout.find(item => item.i === machine.name);
                    if (savedItem) return savedItem;
                    
                    return {
                        i: machine.name,
                        x: (index * 2) % 24,
                        y: Math.floor(index / 12) * 2,
                        w: 2,
                        h: 2,
                    };
                });

                setLayout(mergedLayout);
                setIsLoaded(true);
            } catch (error) {
                console.error("Hata:", error);
                setIsLoaded(true);
            }
        };
        if (machines.length > 0) fetchLayout();
    }, [machines, activeTab, docId]);

    // --- YENİ: STANDARTTAN KOPYALA ÖZELLİĞİ ---
    const copyFromStandard = async () => {
        if (!window.confirm("Standart harita düzenini TV düzeninin üzerine yazmak istediğinize emin misiniz?")) return;
        
        try {
            const stdDocRef = doc(db, collectionName, 'layout');
            const stdDocSnap = await getDoc(stdDocRef);
            
            if (stdDocSnap.exists()) {
                const stdLayout = stdDocSnap.data().layout || [];
                setLayout(stdLayout); // Ekrana yansıt
                alert("Standart düzen kopyalandı. Kaydetmeyi unutmayın.");
            } else {
                alert("Kopyalanacak standart düzen bulunamadı.");
            }
        } catch (error) {
            console.error("Kopyalama hatası:", error);
            alert("Hata oluştu.");
        }
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const layoutToSave = layout.map(item => ({
                i: item.i, x: item.x, y: item.y, w: item.w, h: item.h
            }));
            
            await setDoc(doc(db, collectionName, docId), {
                layout: layoutToSave,
                updatedAt: new Date().toISOString()
            });
            
            alert(`${activeTab === 'tv' ? 'TV' : 'Standart'} yerleşim başarıyla kaydedildi!`);
        } catch (error) {
            console.error("Hata:", error);
            alert("Kaydedilirken bir hata oluştu.");
        } finally {
            setIsSaving(false);
        }
    };

    if (!isLoaded) return <div className="p-10 text-center dark:text-white">Yerleşim verileri yükleniyor...</div>;

    const MAP_WIDTH = 1200;

    return (
        <div className={`p-4 min-h-screen flex flex-col transition-colors duration-500 ${activeTab === 'tv' ? 'bg-gray-900' : 'bg-gray-100 dark:bg-gray-900'}`}>
            
            {/* Üst Panel */}
            <div className="flex flex-col md:flex-row justify-between items-center mb-4 bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border-b-4 border-blue-500">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center">
                        <LayoutDashboard className="mr-2" /> Atölye Mimarı
                    </h2>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                        {activeTab === 'tv' 
                            ? 'TV ekranı için görünümü düzenliyorsunuz. Kutuları daha büyük yapmanız önerilir.' 
                            : 'Standart harita görünümünü düzenliyorsunuz.'}
                    </p>
                </div>
                
                <div className="flex flex-col md:flex-row gap-4 items-center mt-4 md:mt-0">
                    {/* Sekme Değiştirici */}
                    <div className="flex bg-gray-100 dark:bg-gray-700 p-1 rounded-lg">
                        <button 
                            onClick={() => setActiveTab('standard')}
                            className={`flex items-center px-4 py-2 text-sm font-bold rounded-md transition-all ${activeTab === 'standard' ? 'bg-white text-blue-600 shadow' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'}`}
                        >
                            <MapIcon className="w-4 h-4 mr-2" /> Standart
                        </button>
                        <button 
                            onClick={() => setActiveTab('tv')}
                            className={`flex items-center px-4 py-2 text-sm font-bold rounded-md transition-all ${activeTab === 'tv' ? 'bg-purple-600 text-white shadow' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'}`}
                        >
                            <Monitor className="w-4 h-4 mr-2" /> TV Modu
                        </button>
                    </div>

                    <div className="flex space-x-2">
                        {/* YENİ: Kopyala Butonu (Sadece TV modunda görünür) */}
                        {activeTab === 'tv' && (
                            <button onClick={copyFromStandard} className="px-4 py-2 bg-yellow-500 text-white font-bold rounded-lg hover:bg-yellow-600 shadow-sm" title="Standart Haritayı Kopyala">
                                <Copy className="w-4 h-4" />
                            </button>
                        )}

                        <button onClick={() => window.location.reload()} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300" title="Sıfırla"><RotateCcw className="w-4 h-4" /></button>
                        <button onClick={handleSave} disabled={isSaving} className="flex items-center px-6 py-2 bg-blue-600 text-white font-bold rounded-lg shadow-lg hover:bg-blue-700 disabled:opacity-50">
                            <Save className="w-4 h-4 mr-2" /> {isSaving ? '...' : 'Kaydet'}
                        </button>
                    </div>
                </div>
            </div>

            {/* Harita Alanı */}
            <div className={`flex-1 p-6 rounded-xl border-2 border-dashed overflow-auto transition-colors duration-500 ${activeTab === 'tv' ? 'bg-black border-gray-800' : 'bg-gray-200 dark:bg-gray-900/50 border-gray-300 dark:border-gray-700'}`}>
                <div style={{ width: `${MAP_WIDTH}px`, minHeight: '600px' }}>
                    <div className={`text-center mb-4 font-mono text-sm ${activeTab === 'tv' ? 'text-gray-500' : 'text-gray-400'}`}>
                        --- {activeTab === 'tv' ? 'TV EKRANI SİMÜLASYONU' : 'ATÖLYE PLANI'} ---
                    </div>

                    <GridLayout
                        className="layout"
                        layout={layout}
                        width={MAP_WIDTH}
                        cols={24}
                        rowHeight={40}
                        onLayoutChange={(newLayout) => setLayout(newLayout)}
                        isDraggable={true}
                        isResizable={true}
                        compactType={null}
                        preventCollision={true}
                        margin={[10, 10]}
                    >
                        {layout.map((item) => {
                            const isBusy = machineStatusMap[item.i];
                            return (
                                <div 
                                    key={item.i} 
                                    className={`rounded-lg shadow-md flex flex-col items-center justify-center cursor-move transition-all overflow-hidden
                                        ${activeTab === 'tv' 
                                            ? 'bg-gray-800 border-2 border-gray-600 text-gray-200' 
                                            : (isBusy ? 'bg-gradient-to-br from-green-500 to-green-600 text-white' : 'bg-gradient-to-br from-red-500 to-red-600 text-white')
                                        } hover:scale-[1.02] z-10`}
                                >
                                    {activeTab === 'tv' ? (
                                        <div className="w-full h-full p-2 flex flex-col justify-between text-center pointer-events-none opacity-70">
                                            <div className="font-black text-lg truncate border-b border-gray-600 pb-1">{item.i}</div>
                                            <div className="text-[10px] space-y-1">
                                                <div className="bg-white/10 h-2 rounded w-3/4 mx-auto"></div>
                                                <div className="bg-white/10 h-2 rounded w-1/2 mx-auto"></div>
                                            </div>
                                            <div className="bg-green-900/50 h-1.5 rounded-full w-full mt-1"></div>
                                        </div>
                                    ) : (
                                        <>
                                            <span className="font-black text-xl tracking-wider drop-shadow-md select-none">
                                                {item.i}
                                            </span>
                                            <div className="absolute bottom-1 right-1 opacity-50">
                                                <svg width="10" height="10" viewBox="0 0 20 20" fill="white"><path d="M18 18v-8l-8 8h8z" /></svg>
                                            </div>
                                        </>
                                    )}
                                </div>
                            );
                        })}
                    </GridLayout>
                </div>
            </div>
        </div>
    );
};

export default WorkshopEditorPage;