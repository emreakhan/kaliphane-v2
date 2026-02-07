// src/components/Shared/TaskListSidebar.js

import React, { useState } from 'react';
import { List, Trash2, Edit2, Check, X } from 'lucide-react'; // Edit2, Check ve X ikonları eklendi
import { OPERATION_STATUS } from '../../config/constants.js';
import { getStatusClasses } from '../../utils/styleUtils.js';

const TaskListSidebar = ({ tasks, onDeleteTask, onUpdateTask, selectedMoldId }) => { // onUpdateTask prop'u eklendi
    const [taskToDelete, setTaskToDelete] = useState(null);
    
    // Düzenleme State'leri
    const [editingTaskId, setEditingTaskId] = useState(null);
    const [editName, setEditName] = useState('');

    const handleDeleteClick = (task) => {
        setTaskToDelete(task);
    };

    const handleConfirmDelete = async () => {
        if (taskToDelete && selectedMoldId) {
            await onDeleteTask(selectedMoldId, taskToDelete.id);
            setTaskToDelete(null);
        }
    };

    const handleCancelDelete = () => {
        setTaskToDelete(null);
    };

    // --- DÜZENLEME FONKSİYONLARI ---
    const handleStartEdit = (task) => {
        setEditingTaskId(task.id);
        setEditName(task.taskName);
    };

    const handleCancelEdit = () => {
        setEditingTaskId(null);
        setEditName('');
    };

    const handleSaveEdit = async () => {
        if (editName.trim() && selectedMoldId && editingTaskId) {
            // Üst bileşene (CamJobEntryPage) güncellemeyi bildir
            await onUpdateTask(selectedMoldId, editingTaskId, editName.trim());
            setEditingTaskId(null);
            setEditName('');
        }
    };

    const getOverallTaskStatus = (operations) => {
        if (!operations || operations.length === 0) return "Bilinmiyor";
        if (operations.every(op => op.status === OPERATION_STATUS.COMPLETED)) return "TAMAMLANDI";
        if (operations.some(op => op.status === OPERATION_STATUS.IN_PROGRESS)) return "ÇALIŞIYOR";
        if (operations.some(op => op.status === OPERATION_STATUS.WAITING_SUPERVISOR_REVIEW)) return "ONAY BEKLİYOR";
        return "BAŞLAMADI";
    };

    return (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center">
                    <List className="w-5 h-5 mr-2" />
                    Mevcut Parçalar ({tasks.length})
                </h3>
            </div>
            
            <div className="max-h-96 overflow-y-auto">
                {tasks.length === 0 ? (
                    <div className="p-4 text-center text-gray-500 dark:text-gray-400">
                        Bu kalıpta henüz parça bulunmuyor
                    </div>
                ) : (
                    <div className="divide-y divide-gray-200 dark:divide-gray-700">
                        {tasks.map((task, index) => {
                            const overallStatus = getOverallTaskStatus(task.operations);
                            const isEditing = editingTaskId === task.id;

                            return (
                                <div key={task.id} className="p-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition">
                                    <div className="flex justify-between items-center">
                                        <div className="flex-1 min-w-0 mr-2">
                                            {isEditing ? (
                                                // DÜZENLEME MODU
                                                <div className="flex items-center space-x-2 animate-fadeIn">
                                                    <input 
                                                        type="text" 
                                                        value={editName}
                                                        onChange={(e) => setEditName(e.target.value)}
                                                        className="w-full p-1.5 text-sm border rounded focus:ring-2 focus:ring-blue-500 outline-none dark:bg-gray-600 dark:border-gray-500 dark:text-white"
                                                        autoFocus
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') handleSaveEdit();
                                                            if (e.key === 'Escape') handleCancelEdit();
                                                        }}
                                                    />
                                                    <button onClick={handleSaveEdit} className="p-1 text-green-600 hover:bg-green-100 rounded dark:hover:bg-green-900/30" title="Kaydet">
                                                        <Check className="w-4 h-4" />
                                                    </button>
                                                    <button onClick={handleCancelEdit} className="p-1 text-gray-500 hover:bg-gray-100 rounded dark:hover:bg-gray-600" title="İptal">
                                                        <X className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            ) : (
                                                // GÖRÜNTÜLEME MODU
                                                <>
                                                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                                        {index + 1}. {task.taskName}
                                                    </p>
                                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${getStatusClasses(overallStatus)}`}>
                                                            {overallStatus}
                                                        </span>
                                                        <span className="ml-2">({task.operations.length} Op.)</span>
                                                    </p>
                                                </>
                                            )}
                                        </div>
                                        
                                        {!isEditing && (
                                            <div className="flex items-center space-x-1">
                                                <button
                                                    onClick={() => handleStartEdit(task)}
                                                    className="p-1.5 text-blue-600 hover:bg-blue-50 rounded dark:text-blue-400 dark:hover:bg-blue-900/30 transition"
                                                    title="Parça İsmini Düzenle"
                                                >
                                                    <Edit2 className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteClick(task)}
                                                    className="p-1.5 text-red-600 hover:bg-red-50 rounded dark:text-red-400 dark:hover:bg-red-900/30 transition"
                                                    title="Parçayı Sil"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Silme Onay Modalı */}
            {taskToDelete && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
                    <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-sm w-full shadow-2xl border border-gray-200 dark:border-gray-700">
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2 flex items-center">
                            <Trash2 className="w-5 h-5 mr-2 text-red-500" /> Parçayı Sil
                        </h3>
                        <p className="text-gray-600 dark:text-gray-400 mb-6 text-sm">
                            <span className="font-semibold text-gray-800 dark:text-gray-200">"{taskToDelete.taskName}"</span> parçasını ve tüm işlemlerini silmek istediğinize emin misiniz?
                        </p>
                        <div className="flex justify-end space-x-3">
                            <button
                                onClick={handleCancelDelete}
                                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition"
                            >
                                İptal
                            </button>
                            <button
                                onClick={handleConfirmDelete}
                                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition shadow-sm"
                            >
                                Evet, Sil
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default TaskListSidebar;