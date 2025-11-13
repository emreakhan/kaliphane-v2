// src/components/Shared/TaskListSidebar.js

import React, { useState } from 'react';

// İkonlar
import { List, Trash2 } from 'lucide-react';

// Sabitler ('.js' uzantısını ekledim)
import { OPERATION_STATUS } from '../../config/constants.js';

// Yardımcı Fonksiyonlar ('.js' uzantısını ekledim)
import { getStatusClasses } from '../../utils/styleUtils.js';

// --- YENİ: PARÇA LİSTESİ BİLEŞENİ ---
const TaskListSidebar = ({ tasks, onDeleteTask, selectedMoldId }) => {
    const [taskToDelete, setTaskToDelete] = useState(null);

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

    // GÜNCELLEME: Parçanın genel durumunu göster
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
                            return (
                                <div key={task.id} className="p-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition">
                                    <div className="flex justify-between items-start">
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                                {index + 1}. {task.taskName}
                                            </p>
                                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                                Durum: <span className={`px-1 py-0.5 rounded text-xs ${getStatusClasses(overallStatus)}`}>
                                                    {overallStatus}
                                                </span>
                                                <span className="ml-2">({task.operations.length} Op.)</span>
                                            </p>
                                        </div>
                                        <button
                                            onClick={() => handleDeleteClick(task)}
                                            className="ml-2 p-1 text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 transition"
                                            title="Parçayı Sil"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Silme Onay Modalı */}
            {taskToDelete && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-sm w-full">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                            Parçayı Sil
                        </h3>
                        <p className="text-gray-600 dark:text-gray-400 mb-4">
                            "{taskToDelete.taskName}" parçasını (ve içindeki tüm operasyonları) silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.
                        </p>
                        <div className="flex justify-end space-x-3">
                            <button
                                onClick={handleCancelDelete}
                                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-700 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition"
                            >
                                İptal
                            </button>
                            <button
                                onClick={handleConfirmDelete}
                                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition flex items-center"
                            >
                                <Trash2 className="w-4 h-4 mr-2" />
                                Sil
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default TaskListSidebar;