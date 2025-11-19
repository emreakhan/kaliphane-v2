// src/pages/WorkshopEditorPage.js

import React, { useState, useEffect, useMemo } from 'react';
import { Responsive, WidthProvider } from 'react-grid-layout';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { Save, RotateCcw, LayoutDashboard } from 'lucide-react';
import { OPERATION_STATUS } from '../config/constants';

const ResponsiveGridLayout = WidthProvider(Responsive);

const WorkshopEditorPage = ({ machines, projects }) => {
    const [layout, setLayout] = useState([]);
    const [isSaving, setIsSaving] = useState(false);
    const [isLoaded, setIsLoaded] = useState(false);

    const machineStatusMap = useMemo(() => {
        const statusMap = {};
        const runningOps = projects.flatMap(mold => mold.tasks.flatMap(task => task.operations.filter(op => op.status === OPERATION_STATUS.IN_PROGRESS).map(op => ({ machineName: op.machineName }))));
        machines.forEach(m => {
            const isBusy = runningOps.some(op => op.machineName === m.name);
            statusMap[m.name] = isBusy;
        });
        return statusMap;
    }, [projects, machines]);

    useEffect(() => {
        const fetchLayout = async () => {
            try {
                const docRef = doc(db, 'workshop_settings', 'layout');
                const docSnap = await getDoc(docRef);
                let savedLayout = docSnap.exists() ? docSnap.data().layout || [] : [];
                const initialLayout = machines.map((machine, index) => {
                    const savedItem = savedLayout.find(item => item.i === machine.name);
                    return savedItem || { i: machine.name, x: (index * 2) % 12, y: Math.floor(index / 6) * 2, w: 2, h: 2 };
                });
                setLayout(initialLayout);
                setIsLoaded(true);
            } catch (error) { console.error("Hata:", error); }
        };
        if (machines.length > 0) fetchLayout();
    }, [machines]);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const layoutToSave = layout.map(item => ({ i: item.i, x: item.x, y: item.y, w: item.w, h: item.h }));
            await setDoc(doc(db, 'workshop_settings', 'layout'), { layout: layoutToSave, updatedAt: new Date().toISOString() });
            alert('Yerleşim kaydedildi!');
        } catch (error) { console.error("Hata:", error); } finally { setIsSaving(false); }
    };

    if (!isLoaded) return <div className="p-10 text-center">Yükleniyor...</div>;

    return (
        <div className="p-4 bg-gray-100 dark:bg-gray-900 min-h-screen flex flex-col">
            <div className="flex justify-between items-center mb-4 bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border-b-4 border-blue-500">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center"><LayoutDashboard className="mr-2" /> Atölye Mimarı</h2>
                <div className="flex space-x-3">
                     <button onClick={() => window.location.reload()} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg"><RotateCcw className="w-4 h-4" /></button>
                     <button onClick={handleSave} disabled={isSaving} className="flex items-center px-6 py-2 bg-blue-600 text-white font-bold rounded-lg shadow-lg"><Save className="w-4 h-4 mr-2" /> {isSaving ? '...' : 'Kaydet'}</button>
                </div>
            </div>
            <div className="flex-1 bg-gray-200 dark:bg-gray-900/50 p-6 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-700 overflow-hidden">
                <ResponsiveGridLayout className="layout" layouts={{ lg: layout }} breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }} cols={{ lg: 24, md: 20, sm: 12, xs: 8, xxs: 4 }} rowHeight={40} onLayoutChange={(newLayout) => setLayout(newLayout)} isDraggable={true} isResizable={true} compactType={null} preventCollision={true} margin={[10, 10]}>
                    {layout.map((item) => (
                        <div key={item.i} className={`rounded-lg shadow-md border border-white/20 flex flex-col items-center justify-center cursor-move transition-all ${machineStatusMap[item.i] ? 'bg-gradient-to-br from-green-500 to-green-600 text-white' : 'bg-gradient-to-br from-red-500 to-red-600 text-white'} hover:scale-[1.02] z-10`}>
                            <span className="font-black text-xl tracking-wider drop-shadow-md select-none">{item.i}</span>
                            <div className="absolute bottom-1 right-1 opacity-50"><svg width="10" height="10" viewBox="0 0 20 20" fill="white"><path d="M18 18v-8l-8 8h8z" /></svg></div>
                        </div>
                    ))}
                </ResponsiveGridLayout>
            </div>
        </div>
    );
};
export default WorkshopEditorPage;