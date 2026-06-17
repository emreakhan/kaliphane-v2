import React, { useState, useEffect } from 'react';
import { Monitor, Wrench, FileText, Plus, Trash2, CheckCircle } from 'lucide-react';
import Modal from '../components/Modals/Modal';

const CamPreparationModal = ({ isOpen, onClose, mold, task, machines, loggedInUser, onSave }) => {
    const [selectedMachineId, setSelectedMachineId] = useState('');
    const [instructions, setInstructions] = useState('');
    const [selectedTools, setSelectedTools] = useState([]);
    const [manualToolName, setManualToolName] = useState('');

    // Eğer task'ın zaten bir hazırlığı varsa, onları formda göster (Düzenleme modu)
    useEffect(() => {
        if (isOpen && task?.camPreparation) {
            setSelectedMachineId(task.camPreparation.targetMachineId || '');
            setInstructions(task.camPreparation.instructions || '');
            setSelectedTools(task.camPreparation.requiredTools || []);
        } else if (isOpen) {
            setSelectedMachineId('');
            setInstructions('');
            setSelectedTools([]);
        }
        setManualToolName('');
    }, [isOpen, task]);

    // Manuel olarak listeye takım ekleme
    const handleAddManualTool = () => {
        if (!manualToolName.trim()) return;
        setSelectedTools([...selectedTools, {
            toolId: Date.now().toString(), // Benzersiz ID
            name: manualToolName.trim(),
            notes: ''
        }]);
        setManualToolName(''); // Inputu temizle
    };

    // Eklenen takımın notunu güncelleme
    const handleUpdateToolNote = (toolId, note) => {
        setSelectedTools(selectedTools.map(t => 
            t.toolId === toolId ? { ...t, notes: note } : t
        ));
    };

    // Eklenen takımı listeden çıkarma
    const handleRemoveTool = (toolId) => {
        setSelectedTools(selectedTools.filter(t => t.toolId !== toolId));
    };

    // Verileri kaydetme
    const handleSubmit = () => {
        if (!selectedMachineId) {
            alert("Lütfen hedef tezgahı seçiniz.");
            return;
        }

        const targetMachine = machines.find(m => m.id === selectedMachineId);

        const camPreparationData = {
            status: "HAZIRLANDI",
            preparedBy: loggedInUser?.name || "CAM Operatörü",
            preparedAt: new Date().toISOString(),
            targetMachineId: selectedMachineId,
            targetMachineName: targetMachine?.name || '',
            requiredTools: selectedTools,
            instructions: instructions
        };

        onSave(mold.id, task.id, camPreparationData);
    };

    if (!isOpen || !mold || !task) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="CAM Ön Hazırlık ve İş Atama">
            <div className="space-y-6">
                
                {/* 1. Kısım: Kalıp ve İş Bilgisi */}
                <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-100 dark:border-blue-800">
                    <h3 className="font-bold text-blue-900 dark:text-blue-300 text-lg">{mold.moldName}</h3>
                    <p className="text-blue-700 dark:text-blue-400 font-medium">İş Parçası: {task.taskName}</p>
                </div>

                {/* 2. Kısım: Hedef Tezgah Seçimi */}
                <div>
                    <label className="flex items-center text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
                        <Monitor className="w-4 h-4 mr-2 text-indigo-500" /> Hedef Tezgah
                    </label>
                    <select 
                        className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                        value={selectedMachineId}
                        onChange={(e) => setSelectedMachineId(e.target.value)}
                    >
                        <option value="">İşin Yapılacağı Tezgahı Seçin...</option>
                        {machines?.map(m => (
                            <option key={m.id} value={m.id}>{m.name}</option>
                        ))}
                    </select>
                </div>

                {/* 3. Kısım: Kullanılacak Takımlar */}
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-gray-50 dark:bg-gray-800/50">
                    <label className="flex items-center text-sm font-bold text-gray-700 dark:text-gray-300 mb-4">
                        <Wrench className="w-4 h-4 mr-2 text-orange-500" /> Kullanılacak Takımlar
                    </label>
                    
                    <div className="flex gap-4 mb-4">
                        <div className="relative flex-1">
                            <input 
                                type="text"
                                placeholder="Eklenecek takım adını yazın..."
                                value={manualToolName}
                                onChange={(e) => setManualToolName(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleAddManualTool()}
                                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500"
                            />
                        </div>
                        <button onClick={handleAddManualTool} className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-bold flex items-center transition">
                            <Plus className="w-4 h-4 mr-1" /> Ekle
                        </button>
                    </div>

                    {/* Seçilen Takımlar Listesi */}
                    <div className="space-y-2">
                        {selectedTools.length === 0 ? (
                            <p className="text-xs text-gray-500 dark:text-gray-400 italic text-center py-2">Henüz takım seçilmedi.</p>
                        ) : (
                            selectedTools.map(tool => (
                                <div key={tool.toolId} className="flex flex-col sm:flex-row gap-2 items-start sm:items-center bg-white dark:bg-gray-700 p-2 rounded border border-gray-200 dark:border-gray-600">
                                    <div className="flex-1 font-semibold text-sm text-gray-800 dark:text-gray-200">
                                        {tool.name}
                                    </div>
                                    <div className="w-full sm:w-1/2 flex gap-2">
                                        <input 
                                            type="text"
                                            placeholder="Takım için not (opsiyonel)"
                                            value={tool.notes}
                                            onChange={(e) => handleUpdateToolNote(tool.toolId, e.target.value)}
                                            className="flex-1 text-xs p-1.5 border border-gray-300 dark:border-gray-500 rounded bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white"
                                        />
                                        <button onClick={() => handleRemoveTool(tool.toolId)} className="text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 p-1.5 rounded transition">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* 4. Kısım: CAM Operatörü Talimatları */}
                <div>
                    <label className="flex items-center text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
                        <FileText className="w-4 h-4 mr-2 text-green-500" /> Operatör Talimatları / Notlar
                    </label>
                    <textarea 
                        rows="4"
                        placeholder="Tezgah operatörünün dikkat etmesi gereken noktaları, mengene bağlama talimatlarını vb. buraya yazabilirsiniz..."
                        value={instructions}
                        onChange={(e) => setInstructions(e.target.value)}
                        className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500 resize-none"
                    ></textarea>
                </div>

                <div className="flex justify-end pt-4 border-t dark:border-gray-700">
                    <button onClick={handleSubmit} className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-lg transition flex items-center">
                        <CheckCircle className="w-5 h-5 mr-2" /> Hazırlığı Tamamla ve Gönder
                    </button>
                </div>
            </div>
        </Modal>
    );
};

export default CamPreparationModal;