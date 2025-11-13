// src/config/initialData.js
import { OPERATION_STATUS, OPERATION_TYPES, MOLD_STATUS } from './constants.js';

// --- YENİ: SİMÜLASYON VERİSİ İÇİN TARİH OLUŞTURUCU ---
const getDateDaysAgo = (days) => {
    const date = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    return date.toISOString();
};
// Bunu App.js'de import edebilmek için export edelim
export { getDateDaysAgo }; 

// Örnek Görevler (Veritabanı boşsa eklenecek)
export const initialProjects = [
    {
        id: 'mold-1', moldName: '2847 FAN SHIELD RIGHT', customer: 'AGCO', 
        status: MOLD_STATUS.EREZYON,
        priority: 2,
        moldDeadline: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        tasks: [
            { id: 'task-1-1', taskName: 'ANA GÖVDE SOL', taskNumber: 1, operations: [
                { id: 'op-1-1-1', type: OPERATION_TYPES.CNC, assignedOperator: 'SEÇ', machineName: '', status: OPERATION_STATUS.NOT_STARTED, progressPercentage: 0, machineOperatorName: '', estimatedDueDate: '', startDate: '', finishDate: '', durationInHours: null, supervisorRating: null, supervisorReviewDate: null, supervisorComment: null, camOperatorRatingForMachineOp: null, camOperatorCommentForMachineOp: null, camOperatorReviewDate: null }
            ]},
            { id: 'task-1-2', taskName: 'SICAK YOLLUK NOZZLE', taskNumber: 2, operations: [
                { id: 'op-1-2-1', type: OPERATION_TYPES.CNC, assignedOperator: 'Emre Bey (CAM)', machineName: 'K70', machineOperatorName: 'Ali Yılmaz', status: OPERATION_STATUS.IN_PROGRESS, progressPercentage: 50, estimatedDueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], startDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), finishDate: '', durationInHours: null, supervisorRating: null, supervisorReviewDate: null, supervisorComment: null, camOperatorRatingForMachineOp: null, camOperatorCommentForMachineOp: null, camOperatorReviewDate: null }
            ]},
        ]
    },
    {
        id: 'mold-2', moldName: 'YENİ KALIP PROJESİ A', customer: 'DEMO', 
        status: MOLD_STATUS.WAITING,
        priority: 1,
        moldDeadline: '',
        tasks: [
            { id: 'task-2-1', taskName: 'ANA İŞ PARÇASI', taskNumber: 1, operations: [
                { id: 'op-2-1-1', type: OPERATION_TYPES.CNC, assignedOperator: 'SEÇ', machineName: '', status: OPERATION_STATUS.NOT_STARTED, progressPercentage: 0, machineOperatorName: '', estimatedDueDate: '', startDate: '', finishDate: '', durationInHours: null, supervisorRating: null, supervisorReviewDate: null, supervisorComment: null, camOperatorRatingForMachineOp: null, camOperatorCommentForMachineOp: null, camOperatorReviewDate: null }
            ]},
            { id: 'task-2-2', taskName: 'TEST PLAKASI', taskNumber: 2, operations: [
                { id: 'op-2-2-1', type: OPERATION_TYPES.CNC, assignedOperator: 'Can Bey (CAM)', machineName: 'K40', machineOperatorName: 'Burak Demir', status: OPERATION_STATUS.WAITING_SUPERVISOR_REVIEW, progressPercentage: 100, estimatedDueDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), finishDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), durationInHours: 96.0, supervisorRating: null, 
                supervisorReviewDate: null, supervisorComment: null, camOperatorRatingForMachineOp: 8, camOperatorCommentForMachineOp: "Hazırlık iyiydi", camOperatorReviewDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString() }
            ]},
        ]
    },
    {
        id: 'mold-sim-1', moldName: 'SIMULASYON KALIBI 1 (Son 30 Gün)', customer: 'SİMÜLASYON', 
        status: MOLD_STATUS.COMPLETED,
        priority: null,
        moldDeadline: getDateDaysAgo(5),
        tasks: [
            { id: 'task-sim-1-1', taskName: 'SİM-ANA GÖVDE', taskNumber: 1, operations: [
                { id: 'op-sim-1-1-1', type: OPERATION_TYPES.CNC, assignedOperator: 'Emre Bey (CAM)', machineName: 'K70', machineOperatorName: 'Ali Yılmaz', 
                  status: OPERATION_STATUS.COMPLETED, progressPercentage: 100, 
                  estimatedDueDate: getDateDaysAgo(10), startDate: getDateDaysAgo(15), finishDate: getDateDaysAgo(7), 
                  durationInHours: 120.5,
                  camOperatorRatingForMachineOp: 9, camOperatorCommentForMachineOp: "Süper, hızlı ve temiz iş.", camOperatorReviewDate: getDateDaysAgo(7),
                  supervisorRating: 10, supervisorReviewDate: getDateDaysAgo(6), supervisorComment: "Mükemmel hız, teşekkürler Emre."
                },
                { id: 'op-sim-1-1-2', type: OPERATION_TYPES.EROZYON_DESEN, assignedOperator: 'Emre Bey (CAM)', machineName: 'AG-500', machineOperatorName: 'Ali Yılmaz', 
                  status: OPERATION_STATUS.COMPLETED, progressPercentage: 100, 
                  estimatedDueDate: getDateDaysAgo(2), startDate: getDateDaysAgo(5), finishDate: getDateDaysAgo(1), 
                  durationInHours: 96.0,
                  camOperatorRatingForMachineOp: 10, camOperatorCommentForMachineOp: "Ali Bey yine harika.", camOperatorReviewDate: getDateDaysAgo(1),
                  supervisorRating: 10, supervisorReviewDate: getDateDaysAgo(0), supervisorComment: "Çok hızlısınız."
                }
            ]},
            { id: 'task-sim-1-2', taskName: 'SİM-İTİCİ PLAKA', taskNumber: 2, operations: [
                { id: 'op-sim-1-2-1', type: OPERATION_TYPES.CNC, assignedOperator: 'Can Bey (CAM)', machineName: 'K40', machineOperatorName: 'Burak Demir', 
                  status: OPERATION_STATUS.COMPLETED, progressPercentage: 100, 
                  estimatedDueDate: getDateDaysAgo(5), startDate: getDateDaysAgo(12), finishDate: getDateDaysAgo(4), 
                  durationInHours: 192.0,
                  camOperatorRatingForMachineOp: 7, camOperatorCommentForMachineOp: "İş bitti ama tezgah hazırlığı biraz yavaştı.", camOperatorReviewDate: getDateDaysAgo(4),
                  supervisorRating: 8, supervisorReviewDate: getDateDaysAgo(2), supervisorComment: "İyi iş, terminlere dikkat."
                }
            ]},
        ]
    },
    {
        id: 'mold-sim-2', moldName: 'SIMULASYON KALIBI 2 (Eski Veri)', customer: 'SİMÜLASYON', 
        status: MOLD_STATUS.COMPLETED,
        priority: null,
        moldDeadline: getDateDaysAgo(50),
        tasks: [
            { id: 'task-sim-2-1', taskName: 'SİM-ESKİ PARÇA 1', taskNumber: 1, operations: [
                { id: 'op-sim-2-1-1', type: OPERATION_TYPES.CNC, assignedOperator: 'Emre Bey (CAM)', machineName: 'K68', machineOperatorName: 'Deniz Kaya', 
                  status: OPERATION_STATUS.COMPLETED, progressPercentage: 100, 
                  estimatedDueDate: getDateDaysAgo(70), startDate: getDateDaysAgo(80), finishDate: getDateDaysAgo(65), 
                  durationInHours: 360.0,
                  camOperatorRatingForMachineOp: 10, camOperatorCommentForMachineOp: "Deniz Hanım ile çalışmak çok verimli.", camOperatorReviewDate: getDateDaysAgo(65),
                  supervisorRating: 9, supervisorReviewDate: getDateDaysAgo(64), supervisorComment: "Güzel iş, süre biraz uzun ama parça zordu."
                }
            ]},
            { id: 'task-sim-2-2', taskName: 'SİM-ESKİ PARÇA 2', taskNumber: 2, operations: [
                { id: 'op-sim-2-2-1', type: OPERATION_TYPES.CNC, assignedOperator: 'Can Bey (CAM)', machineName: 'K68', machineOperatorName: 'Deniz Kaya', 
                  status: OPERATION_STATUS.COMPLETED, progressPercentage: 100, 
                  estimatedDueDate: getDateDaysAgo(60), startDate: getDateDaysAgo(65), finishDate: getDateDaysAgo(55), 
                  durationInHours: 240.0,
                  camOperatorRatingForMachineOp: 9, camOperatorCommentForMachineOp: "", camOperatorReviewDate: getDateDaysAgo(55),
                  supervisorRating: 7, supervisorReviewDate: getDateDaysAgo(55), supervisorComment: "Termine uyuldu."
                }
            ]},
        ]
    }
];