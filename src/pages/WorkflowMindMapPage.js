// src/pages/WorkflowMindMapPage.js

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Plus, Save, Trash2, Edit3, ChevronRight, ChevronLeft, Lock, ZoomIn, ZoomOut, Maximize2, FolderPlus } from 'lucide-react';
import { collection, onSnapshot, doc, setDoc, addDoc, deleteDoc } from '../config/firebase.js';
import { WORKFLOW_MAPS_COLLECTION } from '../config/constants.js';
import Modal from '../components/Modals/Modal.js';

const COLOR_THEMES = [
    { id: 'purple', name: 'Mor', bg: 'bg-purple-600', text: 'text-purple-600', border: 'border-purple-500', badge: 'bg-purple-100 text-purple-900 dark:bg-purple-900/60 dark:text-purple-200' },
    { id: 'emerald', name: 'Zümrüt Yeşili', bg: 'bg-emerald-600', text: 'text-emerald-600', border: 'border-emerald-500', badge: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/60 dark:text-emerald-200' },
    { id: 'blue', name: 'Mavi', bg: 'bg-blue-600', text: 'text-blue-600', border: 'border-blue-500', badge: 'bg-blue-100 text-blue-900 dark:bg-blue-900/60 dark:text-blue-200' },
    { id: 'amber', name: 'Kehribar', bg: 'bg-amber-600', text: 'text-amber-600', border: 'border-amber-500', badge: 'bg-amber-100 text-amber-900 dark:bg-amber-900/60 dark:text-amber-200' },
    { id: 'rose', name: 'Gül Kurusu', bg: 'bg-rose-600', text: 'text-rose-600', border: 'border-rose-500', badge: 'bg-rose-100 text-rose-900 dark:bg-rose-900/60 dark:text-rose-200' },
    { id: 'cyan', name: 'Turkuaz', bg: 'bg-cyan-600', text: 'text-cyan-600', border: 'border-cyan-500', badge: 'bg-cyan-100 text-cyan-900 dark:bg-cyan-900/60 dark:text-cyan-200' }
];

const INITIAL_MIND_MAP = {
    title: "Yeni İş Akış Haritası",
    nodes: [
        {
            id: "root",
            title: "Yeni İş Akış Haritası (Başlık)",
            parentId: null,
            color: "purple",
            collapsed: false,
            note: "Buraya tıklayarak düzenleyebilir veya 'Alt Dal Ekle' ile haritanızı oluşturabilirsiniz."
        }
    ]
};

const WorkflowMindMapPage = ({ db, loggedInUser }) => {
    const [mapsList, setMapsList] = useState([]);
    const [selectedMapId, setSelectedMapId] = useState(null);
    const [activeMap, setActiveMap] = useState(INITIAL_MIND_MAP);

    const [selectedNodeId, setSelectedNodeId] = useState("root");
    const [isSaving, setIsSaving] = useState(false);
    const [zoom, setZoom] = useState(1);

    // KANVAS SÜRÜKLEME (PANNING) STATE'LERİ
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const dragStartRef = useRef({ x: 0, y: 0 });
    const canvasContainerRef = useRef(null);

    // DÜĞÜM DÜZENLEME MODALI STATE'LERİ
    const [editModalOpen, setEditModalOpen] = useState(false);
    const [nodeTitle, setNodeTitle] = useState('');
    const [nodeColor, setNodeColor] = useState('purple');
    const [nodeNote, setNodeNote] = useState('');

    // YENİ HARİTA TASLAĞI MODALI
    const [newMapModalOpen, setNewMapModalOpen] = useState(false);
    const [newMapTitle, setNewMapTitle] = useState('');

    // HARİTA YÜKLENDİĞİNDE VEYA AÇILDIĞINDA DALLARI KAPALI GETİRME HAPSEDİCİSİ
    const prepareMapOnLoad = (mapData) => {
        if (!mapData || !mapData.nodes) return mapData;
        const nodesWithCollapsedSubbranches = mapData.nodes.map(n => 
            (n.id === 'root' || n.parentId === null) 
            ? { ...n, collapsed: false } 
            : { ...n, collapsed: true }
        );
        return { ...mapData, nodes: nodesWithCollapsedSubbranches };
    };

    // FARE ORTA TUŞU (WHEEL SCROLL) İLE ZOOM IN / ZOOM OUT DİNLEYİCİSİ
    useEffect(() => {
        const el = canvasContainerRef.current;
        if (!el) return;

        const handleWheelZoom = (e) => {
            e.preventDefault();
            const delta = e.deltaY < 0 ? 0.08 : -0.08;
            setZoom(prev => Math.min(2.0, Math.max(0.4, parseFloat((prev + delta).toFixed(2)))));
        };

        el.addEventListener('wheel', handleWheelZoom, { passive: false });
        return () => el.removeEventListener('wheel', handleWheelZoom);
    }, []);

    // FARE İLE BOŞ ALANDAN TUTUP SÜRÜKLEME (PANNING) HANDLERLARI
    const handleMouseDown = (e) => {
        // Sadece sol fare tuşunda (button === 0) sürüklemeyi başlat
        if (e.button === 0) {
            setIsDragging(true);
            dragStartRef.current = {
                x: e.clientX - pan.x,
                y: e.clientY - pan.y
            };
        }
    };

    const handleMouseMove = (e) => {
        if (!isDragging) return;
        setPan({
            x: e.clientX - dragStartRef.current.x,
            y: e.clientY - dragStartRef.current.y
        });
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    const handleResetView = () => {
        setZoom(1);
        setPan({ x: 0, y: 0 });
    };

    // FIRESTORE CANLI DİNLEME
    useEffect(() => {
        if (!db) return;
        const colRef = collection(db, WORKFLOW_MAPS_COLLECTION);
        const unsubscribe = onSnapshot(colRef, (snapshot) => {
            const list = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setMapsList(list);

            if (list.length > 0 && !selectedMapId) {
                setSelectedMapId(list[0].id);
                setActiveMap(prepareMapOnLoad(list[0]));
            }
        }, (err) => {
            console.error("Zihin haritaları dinleme hatası:", err);
        });

        return () => unsubscribe();
    }, [db, selectedMapId]);

    const handleSelectMap = (mapId) => {
        const found = mapsList.find(m => m.id === mapId);
        if (found) {
            setSelectedMapId(mapId);
            setActiveMap(prepareMapOnLoad(found));
            setSelectedNodeId("root");
            setPan({ x: 0, y: 0 });
        }
    };

    const handleCreateNewMapDraft = async () => {
        if (!newMapTitle.trim()) {
            alert("Lütfen harita taslak başlığı giriniz.");
            return;
        }

        setIsSaving(true);
        try {
            const newMapData = {
                title: newMapTitle.trim(),
                nodes: [
                    {
                        id: "root",
                        title: newMapTitle.trim(),
                        parentId: null,
                        color: "purple",
                        collapsed: false,
                        note: "Ana başlık"
                    }
                ],
                createdBy: loggedInUser?.name || 'Yönetici',
                createdAt: new Date().toISOString()
            };

            if (db) {
                const docRef = await addDoc(collection(db, WORKFLOW_MAPS_COLLECTION), newMapData);
                setSelectedMapId(docRef.id);
                setActiveMap(prepareMapOnLoad({ id: docRef.id, ...newMapData }));
            } else {
                setActiveMap(prepareMapOnLoad(newMapData));
            }

            setNewMapTitle('');
            setNewMapModalOpen(false);
            setPan({ x: 0, y: 0 });
        } catch (error) {
            console.error("Yeni harita oluşturulamadı:", error);
            alert("Harita oluşturulurken hata oluştu.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleSaveMap = async () => {
        setIsSaving(true);
        try {
            if (db && selectedMapId) {
                const docRef = doc(db, WORKFLOW_MAPS_COLLECTION, selectedMapId);
                await setDoc(docRef, {
                    ...activeMap,
                    updatedAt: new Date().toISOString()
                }, { merge: true });
                alert("İş Akış Haritası başarıyla veritabanına kaydedildi! 💾");
            } else if (db && !selectedMapId) {
                const docRef = await addDoc(collection(db, WORKFLOW_MAPS_COLLECTION), {
                    ...activeMap,
                    createdBy: loggedInUser?.name || 'Yönetici',
                    createdAt: new Date().toISOString()
                });
                setSelectedMapId(docRef.id);
                alert("Yeni İş Akış Haritası kaydedildi! 💾");
            }
        } catch (error) {
            console.error("Harita kaydedilemedi:", error);
            alert("Kaydetme işlemi başarısız.");
        } finally {
            setIsSaving(false);
        }
    };

    // HARİTAYI VERİTABANINDAN TAMAMEN SİLME
    const handleDeleteEntireMap = async () => {
        if (!selectedMapId) {
            alert("Silinecek kaydedilmiş bir harita seçili değil.");
            return;
        }
        const mapToDelete = mapsList.find(m => m.id === selectedMapId);
        const mapName = mapToDelete ? mapToDelete.title : 'Bu haritayı';

        if (!window.confirm(`"${mapName}" haritasını ve tüm dallarını veritabanından kalıcı olarak silmek istediğinize emin misiniz?`)) return;

        setIsSaving(true);
        try {
            if (db) {
                await deleteDoc(doc(db, WORKFLOW_MAPS_COLLECTION, selectedMapId));
                alert("Harita veritabanından başarıyla silindi! 🗑️");
                const remaining = mapsList.filter(m => m.id !== selectedMapId);
                if (remaining.length > 0) {
                    setSelectedMapId(remaining[0].id);
                    setActiveMap(prepareMapOnLoad(remaining[0]));
                } else {
                    setSelectedMapId(null);
                    setActiveMap(INITIAL_MIND_MAP);
                }
            } else {
                setActiveMap(INITIAL_MIND_MAP);
            }
            setPan({ x: 0, y: 0 });
        } catch (err) {
            console.error("Harita silinirken hata:", err);
            alert("Harita silinemedi.");
        } finally {
            setIsSaving(false);
        }
    };

    // ALT DÜĞÜM EKLEME
    const handleAddChildNode = (targetParentId) => {
        const parentId = targetParentId || selectedNodeId;
        if (!parentId) return;
        const parentNode = activeMap.nodes.find(n => n.id === parentId);
        if (!parentNode) return;

        const newNodeId = `node-${Date.now()}`;
        const newNode = {
            id: newNodeId,
            title: "Yeni Alt Dal / Fikir",
            parentId: parentId,
            color: parentNode.color || 'blue',
            collapsed: false,
            note: ""
        };

        const updatedNodes = [...activeMap.nodes, newNode];
        // Parent node'un collapsed durumunu aç (yeni eklenen dal hemen görünsün)
        const finalNodes = updatedNodes.map(n => n.id === parentId ? { ...n, collapsed: false } : n);
        
        setActiveMap({ ...activeMap, nodes: finalNodes });
        setSelectedNodeId(newNodeId);
    };

    // DÜĞÜM DARALTMA / GENİŞLETME
    const handleToggleCollapse = (nodeId, e) => {
        e.stopPropagation();
        const updatedNodes = activeMap.nodes.map(n => 
            n.id === nodeId ? { ...n, collapsed: !n.collapsed } : n
        );
        setActiveMap({ ...activeMap, nodes: updatedNodes });
    };

    // DÜĞÜM SİLME
    const handleDeleteNode = (nodeId) => {
        if (nodeId === 'root') {
            alert("Ana merkez düğümü silemezsiniz!");
            return;
        }
        if (!window.confirm("Bu düğümü ve altındaki tüm bağlı dalları silmek istediğinize emin misiniz?")) return;

        const idsToDelete = new Set([nodeId]);
        let changed = true;

        while (changed) {
            changed = false;
            activeMap.nodes.forEach(n => {
                if (n.parentId && idsToDelete.has(n.parentId) && !idsToDelete.has(n.id)) {
                    idsToDelete.add(n.id);
                    changed = true;
                }
            });
        }

        const filteredNodes = activeMap.nodes.filter(n => !idsToDelete.has(n.id));
        setActiveMap({ ...activeMap, nodes: filteredNodes });
        setSelectedNodeId("root");
    };

    // DÜĞÜM DÜZENLEME MODALINI AÇMA
    const openEditNodeModal = (node) => {
        setNodeTitle(node.title);
        setNodeColor(node.color || 'purple');
        setNodeNote(node.note || '');
        setEditModalOpen(true);
    };

    const handleSaveNodeEdit = () => {
        if (!nodeTitle.trim()) return;
        const updatedNodes = activeMap.nodes.map(n => 
            n.id === selectedNodeId 
            ? { ...n, title: nodeTitle.trim(), color: nodeColor, note: nodeNote.trim() } 
            : n
        );
        setActiveMap({ ...activeMap, nodes: updatedNodes });
        setEditModalOpen(false);
    };

    // AĞAÇ YAPISINI VE HİYERARŞİYİ OLUŞTURMA
    const nodeTree = useMemo(() => {
        const map = {};
        activeMap.nodes.forEach(n => {
            map[n.id] = { ...n, children: [] };
        });

        const rootNodes = [];
        activeMap.nodes.forEach(n => {
            if (n.parentId && map[n.parentId]) {
                map[n.parentId].children.push(map[n.id]);
            } else if (n.id === 'root' || !n.parentId) {
                rootNodes.push(map[n.id]);
            }
        });

        return rootNodes[0] || null;
    }, [activeMap]);

    const selectedNodeObj = activeMap.nodes.find(n => n.id === selectedNodeId);

    // RECURSIVE DÜĞÜM RENDER BİLEŞENİ
    const RenderNodeTree = ({ node, level = 0 }) => {
        if (!node) return null;
        const isSelected = selectedNodeId === node.id;
        const hasChildren = node.children && node.children.length > 0;
        const colorObj = COLOR_THEMES.find(c => c.id === node.color) || COLOR_THEMES[0];

        return (
            <div className="flex items-center gap-6 my-3 relative">
                {/* DÜĞÜM KARTI (Düğüm içi tıklamalarda tuval sürükleme olmasın diye stopPropagation ekli) */}
                <div 
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); setSelectedNodeId(node.id); }}
                    className={`relative p-3.5 rounded-xl border-2 transition-all cursor-pointer shadow-md select-none group min-w-[200px] max-w-[300px] ${
                        isSelected 
                        ? `${colorObj.border} bg-white dark:bg-gray-800 ring-4 ring-indigo-500/20 scale-105 z-10` 
                        : `bg-white dark:bg-gray-800/90 border-gray-200 dark:border-gray-700 hover:border-indigo-400`
                    }`}
                >
                    <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                            <span className={`w-3 h-3 rounded-full ${colorObj.bg} shrink-0`} />
                            <h4 className="font-bold text-xs text-gray-900 dark:text-white leading-snug">{node.title}</h4>
                        </div>

                        {/* DARALTMA / GENİŞLETME OKU */}
                        {hasChildren && (
                            <button 
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={(e) => handleToggleCollapse(node.id, e)}
                                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-gray-500 transition shrink-0 flex items-center gap-0.5"
                                title={node.collapsed ? 'Dalları Göster (Genişlet)' : 'Dalları Gizle (Daralt)'}
                            >
                                <span className="text-[10px] font-bold text-indigo-500">{node.children.length}</span>
                                {node.collapsed ? <ChevronRight className="w-4 h-4 text-amber-500 font-bold" /> : <ChevronLeft className="w-4 h-4 text-indigo-500 font-bold" />}
                            </button>
                        )}
                    </div>

                    {node.note && (
                        <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1.5 italic border-t border-gray-100 dark:border-gray-700/60 pt-1">
                            {node.note}
                        </p>
                    )}

                    {/* HIZLI EYLEM BUTONLARI (Alt dal ekleme, düzenleme, silme) */}
                    {isSelected && (
                        <div 
                            onMouseDown={(e) => e.stopPropagation()}
                            className="absolute -bottom-3 right-2 flex items-center gap-1 bg-gray-900 text-white rounded-lg p-1 shadow-lg border border-gray-700 text-[10px] z-20"
                        >
                            <button 
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={(e) => { e.stopPropagation(); openEditNodeModal(node); }}
                                className="p-1 hover:bg-indigo-600 rounded"
                                title="Metin / Renk Düzenle"
                            >
                                <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button 
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={(e) => { e.stopPropagation(); handleAddChildNode(node.id); }}
                                className="p-1 hover:bg-green-600 bg-emerald-600 rounded text-white font-bold"
                                title="Alt Dal Ekle"
                            >
                                <Plus className="w-3.5 h-3.5" />
                            </button>
                            {node.id !== 'root' && (
                                <button 
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onClick={(e) => { e.stopPropagation(); handleDeleteNode(node.id); }}
                                    className="p-1 hover:bg-red-600 rounded"
                                    title="Düğümü Sil"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {/* DÜZ BAĞLANTI ÇİZGİLERİ (STRAIGHT CONNECTOR LINES) */}
                {hasChildren && !node.collapsed && (
                    <div className="flex items-center relative">
                        {/* Parent Node'dan Çıkan Düz Yatay Bağlantı Çizgisi */}
                        <div className="w-8 h-0.5 bg-indigo-500 dark:bg-indigo-400 shrink-0 shadow-sm" />

                        {/* Dikey Dal Çizgisi ve Alt Düğümler */}
                        <div className="flex flex-col border-l-2 border-indigo-500 dark:border-indigo-400 pl-6 space-y-3 relative py-2">
                            {node.children.map(child => (
                                <div key={child.id} className="relative flex items-center">
                                    {/* Dikey Dal Çizgisinden Alt Düğüme Giden Düz Yatay Bağlantı Çizgisi */}
                                    <div className="absolute -left-6 w-6 h-0.5 bg-indigo-500 dark:bg-indigo-400 shadow-sm" />
                                    {/* Bağlantı Noktası (Dot) */}
                                    <div className="absolute -left-6.5 w-1.5 h-1.5 rounded-full bg-indigo-600 dark:bg-indigo-300" />
                                    
                                    <RenderNodeTree node={child} level={level + 1} />
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="p-6 bg-gray-100 dark:bg-gray-900 min-h-screen space-y-6">
            
            {/* YÖNETİCİ GİZLİLİK BANNERİ */}
            <div className="bg-indigo-900 text-white p-3.5 rounded-2xl shadow-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-indigo-700 rounded-xl flex items-center justify-center shrink-0 border border-indigo-500/50">
                        <Lock className="w-5 h-5 text-amber-300" />
                    </div>
                    <div>
                        <h2 className="font-bold text-sm flex items-center gap-2">
                            İş Akış Haritası <span className="px-2 py-0.5 bg-amber-400 text-gray-900 rounded text-[10px] font-black uppercase">Sadece Yönetici Erişimi</span>
                        </h2>
                        <p className="text-xs text-indigo-200 mt-0.5">
                            Boş alanda fareye basılı tutarak sürükleyebilir, kutulara tıklayarak dalları rahatça oluşturabilirsiniz.
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap self-end sm:self-auto">
                    {/* Harita Seçici Dropdown */}
                    <select 
                        value={selectedMapId || ''}
                        onChange={(e) => handleSelectMap(e.target.value)}
                        className="p-2 bg-indigo-800 border border-indigo-600 rounded-xl font-bold text-xs text-white outline-none cursor-pointer"
                    >
                        <option value="">🗺️ {activeMap.title || 'Varsayılan Harita'}</option>
                        {mapsList.map(m => (
                            <option key={m.id} value={m.id}>{m.title}</option>
                        ))}
                    </select>

                    <button 
                        onClick={() => setNewMapModalOpen(true)}
                        className="px-3 py-2 bg-indigo-700 hover:bg-indigo-600 border border-indigo-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5"
                    >
                        <FolderPlus className="w-4 h-4 text-amber-300" /> Yeni Harita Taslağı
                    </button>

                    {selectedMapId && (
                        <button 
                            onClick={handleDeleteEntireMap}
                            disabled={isSaving}
                            className="px-3 py-2 bg-rose-700 hover:bg-rose-600 border border-rose-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5"
                            title="Mevcut Haritayı Sil"
                        >
                            <Trash2 className="w-4 h-4" /> Haritayı Sil
                        </button>
                    )}
                </div>
            </div>

            {/* KONTROL BUTONLARI & BİLGİ ŞERİDİ */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 flex flex-col md:flex-row justify-between items-center gap-4">
                
                <div className="flex items-center gap-2 flex-wrap">
                    <button 
                        onClick={() => handleAddChildNode(selectedNodeId)}
                        className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow transition flex items-center gap-1.5"
                    >
                        <Plus className="w-4 h-4" /> Seçili Düğüme Alt Dal Ekle
                    </button>

                    {selectedNodeObj && (
                        <button 
                            onClick={() => openEditNodeModal(selectedNodeObj)}
                            className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow transition flex items-center gap-1.5"
                        >
                            <Edit3 className="w-4 h-4" /> Düğüm Metnini / Rengini Düzenle
                        </button>
                    )}

                    {selectedNodeObj && selectedNodeId !== 'root' && (
                        <button 
                            onClick={() => handleDeleteNode(selectedNodeId)}
                            className="px-3.5 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-bold shadow transition flex items-center gap-1.5"
                        >
                            <Trash2 className="w-4 h-4" /> Düğümü Sil
                        </button>
                    )}
                </div>

                <div className="flex items-center gap-3">
                    {/* Sürükleme ve Zoom Kontrolleri */}
                    <div className="flex items-center bg-gray-100 dark:bg-gray-700 p-1 rounded-xl gap-1">
                        <button onClick={() => setZoom(z => Math.max(0.4, z - 0.1))} className="p-1.5 hover:bg-white dark:hover:bg-gray-600 rounded text-gray-600 dark:text-gray-200" title="Uzaklaş"><ZoomOut className="w-4 h-4" /></button>
                        <span className="text-xs font-bold px-2 text-gray-600 dark:text-gray-300" title="Boş alanda basılı tutarak sürükleyebilir, tekerlek ile yakınlaşabilirsiniz">%{Math.round(zoom * 100)}</span>
                        <button onClick={() => setZoom(z => Math.min(2.0, z + 0.1))} className="p-1.5 hover:bg-white dark:hover:bg-gray-600 rounded text-gray-600 dark:text-gray-200" title="Yakınlaş"><ZoomIn className="w-4 h-4" /></button>
                        <button onClick={handleResetView} className="p-1.5 hover:bg-white dark:hover:bg-gray-600 rounded text-gray-600 dark:text-gray-200" title="Konum ve Zoom Sıfırla"><Maximize2 className="w-3.5 h-3.5" /></button>
                    </div>

                    <button 
                        onClick={handleSaveMap}
                        disabled={isSaving}
                        className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-lg transition flex items-center gap-2 disabled:opacity-50"
                    >
                        <Save className="w-4 h-4" />
                        {isSaving ? 'Kaydediliyor...' : 'Haritayı Veritabanına Kaydet'}
                    </button>
                </div>
            </div>

            {/* ZİHİN HARİTASI CANLI TUVAL ALANI */}
            <div 
                ref={canvasContainerRef}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                className={`bg-white dark:bg-gray-800/80 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-8 min-h-[600px] overflow-hidden relative select-none ${
                    isDragging ? 'cursor-grabbing' : 'cursor-grab'
                }`}
            >
                <div 
                    style={{ 
                        transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, 
                        transformOrigin: 'top left', 
                        transition: isDragging ? 'none' : 'transform 0.1s ease-out' 
                    }}
                >
                    {nodeTree ? (
                        <RenderNodeTree node={nodeTree} />
                    ) : (
                        <div className="py-20 text-center text-gray-400">Haritada gösterilecek düğüm bulunmuyor.</div>
                    )}
                </div>
            </div>

            {/* DÜĞÜM DÜZENLEME MODALI */}
            {editModalOpen && selectedNodeObj && (
                <Modal isOpen={editModalOpen} onClose={() => setEditModalOpen(false)} title="✏️ Düğüm Metnini ve Rengini Düzenle">
                    <div className="space-y-4 text-xs text-gray-800 dark:text-gray-200">
                        <div>
                            <label className="block font-bold mb-1">Düğüm / Dal Başlığı *</label>
                            <input 
                                type="text" 
                                value={nodeTitle}
                                onChange={(e) => setNodeTitle(e.target.value)}
                                className="w-full p-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg font-bold text-xs"
                            />
                        </div>

                        <div>
                            <label className="block font-bold mb-1">Düğüm Renk Teması</label>
                            <div className="grid grid-cols-3 gap-2">
                                {COLOR_THEMES.map(theme => (
                                    <button
                                        key={theme.id}
                                        type="button"
                                        onClick={() => setNodeColor(theme.id)}
                                        className={`p-2 rounded-lg font-bold text-xs flex items-center gap-2 border transition ${nodeColor === theme.id ? 'ring-2 ring-indigo-500 border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30' : 'bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600'}`}
                                    >
                                        <span className={`w-3.5 h-3.5 rounded-full ${theme.bg}`} />
                                        <span>{theme.name}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <label className="block font-bold mb-1">Özel Not / Açıklama (Opsiyonel)</label>
                            <textarea 
                                rows="3"
                                placeholder="Düğümün altına eklenecek kısa not..."
                                value={nodeNote}
                                onChange={(e) => setNodeNote(e.target.value)}
                                className="w-full p-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-xs"
                            />
                        </div>

                        <div className="flex justify-end gap-2 pt-3 border-t border-gray-200 dark:border-gray-700">
                            <button onClick={() => setEditModalOpen(false)} className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg font-bold">İptal</button>
                            <button onClick={handleSaveNodeEdit} className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-bold">Kaydet</button>
                        </div>
                    </div>
                </Modal>
            )}

            {/* YENİ HARİTA TASLAĞI MODALI */}
            {newMapModalOpen && (
                <Modal isOpen={newMapModalOpen} onClose={() => setNewMapModalOpen(false)} title="🗺️ Yeni Harita Taslağı Oluştur">
                    <div className="space-y-4 text-xs text-gray-800 dark:text-gray-200">
                        <div>
                            <label className="block font-bold mb-1">Harita Taslak Adı *</label>
                            <input 
                                type="text" 
                                placeholder="Örn: 2026 3. Çeyrek Kalıp İmalat Otomasyon Planı"
                                value={newMapTitle}
                                onChange={(e) => setNewMapTitle(e.target.value)}
                                className="w-full p-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg font-bold text-xs"
                            />
                        </div>

                        <div className="flex justify-end gap-2 pt-3 border-t border-gray-200 dark:border-gray-700">
                            <button onClick={() => setNewMapModalOpen(false)} className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg font-bold">İptal</button>
                            <button onClick={handleCreateNewMapDraft} disabled={isSaving} className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-bold">Taslağı Başlat</button>
                        </div>
                    </div>
                </Modal>
            )}

        </div>
    );
};

export default WorkflowMindMapPage;
