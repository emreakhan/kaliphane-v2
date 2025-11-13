// src/utils/styleUtils.js
import { OPERATION_STATUS, MOLD_STATUS } from '../config/constants.js';

export const getStatusClasses = (status) => {
    switch (status) {
        // OPERASYON DURUMLARI
        case OPERATION_STATUS.NOT_STARTED:
            return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
        case OPERATION_STATUS.IN_PROGRESS:
            return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
        case OPERATION_STATUS.WAITING_SUPERVISOR_REVIEW:
            return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300 animate-pulse';
        case OPERATION_STATUS.COMPLETED:
            return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
        // KALIP ANA DURUMLARI
        case MOLD_STATUS.WAITING:
            return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
        case MOLD_STATUS.CNC:
        case MOLD_STATUS.EREZYON:
        case MOLD_STATUS.POLISAJ:
        case MOLD_STATUS.DESEN:
        case MOLD_STATUS.MOLD_ASSEMBLY:
        case MOLD_STATUS.TRIAL:
        case MOLD_STATUS.REVISION:
            return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
        case MOLD_STATUS.COMPLETED:
            return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
        default:
            return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
    }
};