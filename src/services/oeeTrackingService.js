// src/services/oeeTrackingService.js

// =========================================================================
// OEE TAKİP SERVİSİ (İZLEME, PARÇA SÜRELERİ, CAM ANALİZİ, KAYIT DEFTERİ)
// =========================================================================

const ACTIVE_ASSIGNMENTS_KEY = 'oee_active_part_assignments_v1';
const HISTORY_ASSIGNMENTS_KEY = 'oee_history_part_assignments_v1';
const LOGBOOK_SNAPSHOTS_KEY = 'oee_logbook_snapshots_v1';
const METRIC_CONFIG_KEY = 'oee_metric_visibility_config_v1';

// Varsayılan Metrik Görünürlük Ayarları
export const DEFAULT_METRIC_CONFIG = {
  spindleRpm: true,          // Spindle Devir (RPM)
  feedrate: true,            // İlerleme Hızı (mm/min)
  feedOverridePct: true,     // Kesme İlerleme Yüzdesi (Feed Override %)
  rapidOverridePct: true,    // Boşta İlerleme Yüzdesi (Rapid Override %)
  spindleOverridePct: true,  // Spindle Devir Yüzdesi (Spindle Override %)
  program: true,             // Aktif NC Program Adı
  assignedPart: true,        // Bağlı Kalıp & Parça
  camOperator: true,         // CAM Operatörü
  partDurations: true,       // Parça Tezgah Çalışma/Duruş Süresi
  runningPct24h: true,       // 24s Çalışma / Verimlilik Oranı
  lastDataTime: true         // Son Veri Alınma Saati
};

// ==========================================
// 1. METRİK GÖRÜNÜRLÜK AYARLARI
// ==========================================

export const getMetricVisibilityConfig = (machineKey = 'default') => {
  try {
    const raw = localStorage.getItem(`${METRIC_CONFIG_KEY}_${machineKey}`);
    if (raw) return { ...DEFAULT_METRIC_CONFIG, ...JSON.parse(raw) };

    const globalRaw = localStorage.getItem(`${METRIC_CONFIG_KEY}_default`);
    if (globalRaw) return { ...DEFAULT_METRIC_CONFIG, ...JSON.parse(globalRaw) };

    return DEFAULT_METRIC_CONFIG;
  } catch (e) {
    return DEFAULT_METRIC_CONFIG;
  }
};

export const saveMetricVisibilityConfig = (config, machineKey = 'default') => {
  try {
    localStorage.setItem(`${METRIC_CONFIG_KEY}_${machineKey}`, JSON.stringify(config));
  } catch (e) {
    console.error("Metric config save error:", e);
  }
};

// ==========================================
// 2. PARÇA & İŞ EMRİ ATAMALARI & SİSTEM EŞLEŞTİRMESİ
// ==========================================

export const cleanMachineCode = (str) => {
  return String(str || '').replace(/[^a-zA-Z0-9çğıöşüÇĞİÖŞÜ]/g, '').toLowerCase();
};

/**
 * Kaliphane v2 veritabanındaki (projects koleksiyonu) aktif çalışan operasyon/parçayı
 * tezgah adına / koduna göre otomatik olarak bulur (Örn: K27 -> 3334 NGC DIŞ RADAR KAPAMA, S1.2-C, Ahmet Bulut)
 */
export const findActiveProductionJob = (machineCodeOrName, projects = []) => {
  if (!machineCodeOrName || !projects || projects.length === 0) return null;

  const targetClean = cleanMachineCode(machineCodeOrName);
  if (!targetClean) return null;

  let activeJob = null;

  for (const project of projects) {
    if (project.status === 'TAMAMLANDI' || project.status === 'IPTAL') continue;

    if (project.tasks && Array.isArray(project.tasks)) {
      for (const task of project.tasks) {
        if (task.operations && Array.isArray(task.operations)) {
          for (const op of task.operations) {
            const isWorking = op.status === 'ÇALIŞIYOR' || op.status === 'IN_PROGRESS' || op.status === 'RUNNING';
            if (isWorking) {
              const opM1 = cleanMachineCode(op.machineName);
              const opM2 = cleanMachineCode(op.machine);
              const opM3 = cleanMachineCode(op.assignedMachine);
              const opM4 = cleanMachineCode(op.machineId);

              if (
                (opM1 && (opM1 === targetClean || opM1.includes(targetClean) || targetClean.includes(opM1))) ||
                (opM2 && (opM2 === targetClean || opM2.includes(targetClean) || targetClean.includes(opM2))) ||
                (opM3 && (opM3 === targetClean || opM3.includes(targetClean) || targetClean.includes(opM3))) ||
                (opM4 && (opM4 === targetClean || opM4.includes(targetClean) || targetClean.includes(opM4)))
              ) {
                activeJob = {
                  id: `prod_${project.id}_${task.id}_${op.id || Date.now()}`,
                  source: 'PRODUCTION',
                  machineKey: machineCodeOrName,
                  machineName: op.machineName || op.machine || machineCodeOrName,
                  moldId: project.id,
                  moldName: project.moldName || project.name || `Kalıp #${project.projectNumber}`,
                  taskId: task.id,
                  taskName: task.taskName || task.name || task.partName || 'İşlenen Parça',
                  camOperatorName: task.assignedOperator || task.camOperator || task.camPreparation?.operator || op.camOperator || op.assignedOperator || op.operator || 'Belirtilmedi',
                  machineOperatorName: op.machineOperator || op.operator || op.assignedOperator || '',
                  progressPercentage: parseFloat(op.progressPercentage) || 0,
                  assignedAt: op.startTime || op.createdAt || task.startDate || new Date().toISOString(),
                  operationName: op.name || op.type || op.operationName || 'CNC İşleme',
                  status: 'ACTIVE'
                };
                return activeJob;
              }
            }
          }
        }

        // Eğer task seviyesinde doğrudan makine ataması ve çalışma durumu varsa
        if (task.status === 'ÇALIŞIYOR' || task.status === 'IN_PROGRESS') {
          const tM1 = cleanMachineCode(task.assignedMachine);
          const tM2 = cleanMachineCode(task.machine);
          if (tM1 === targetClean || tM2 === targetClean) {
            activeJob = {
              id: `prod_${project.id}_${task.id}`,
              source: 'PRODUCTION',
              machineKey: machineCodeOrName,
              machineName: task.assignedMachine || task.machine || machineCodeOrName,
              moldId: project.id,
              moldName: project.moldName || project.name || `Kalıp #${project.projectNumber}`,
              taskId: task.id,
              taskName: task.taskName || task.name || task.partName || 'İşlenen Parça',
              camOperatorName: task.assignedOperator || task.camOperator || task.camPreparation?.operator || 'Belirtilmedi',
              machineOperatorName: '',
              progressPercentage: parseFloat(task.progress) || 0,
              assignedAt: task.startDate || new Date().toISOString(),
              operationName: 'CNC İşleme',
              status: 'ACTIVE'
            };
            return activeJob;
          }
        }
      }
    }
  }

  return activeJob;
};

export const getActiveAssignments = () => {
  try {
    const raw = localStorage.getItem(ACTIVE_ASSIGNMENTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
};

export const saveActiveAssignments = (assignments) => {
  try {
    localStorage.setItem(ACTIVE_ASSIGNMENTS_KEY, JSON.stringify(assignments));
  } catch (e) {
    console.error("Active assignments save error:", e);
  }
};

export const getAssignmentHistory = () => {
  try {
    const raw = localStorage.getItem(HISTORY_ASSIGNMENTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
};

export const saveAssignmentHistory = (history) => {
  try {
    localStorage.setItem(HISTORY_ASSIGNMENTS_KEY, JSON.stringify(history));
  } catch (e) {
    console.error("Assignment history save error:", e);
  }
};

/**
 * Tezgaha Kalıp & Parça Ataması Yapar
 */
export const assignPartToMachine = ({
  machineKey,
  machineName,
  moldId,
  moldName,
  taskId,
  taskName,
  camOperatorName,
  notes = '',
  currentDevice = null
}) => {
  const active = getActiveAssignments();
  
  // Eğer bu tezgahta zaten aktif bir parça varsa, onu tamamla/arşive kaldır
  const existingIdx = active.findIndex(a => 
    (a.machineKey || '').toLowerCase() === (machineKey || '').toLowerCase()
  );

  const now = new Date().toISOString();

  if (existingIdx >= 0) {
    const prev = active[existingIdx];
    prev.completedAt = now;
    prev.status = 'COMPLETED';
    
    // Arşive ekle
    const history = getAssignmentHistory();
    history.unshift(prev);
    saveAssignmentHistory(history.slice(0, 500));
    
    active.splice(existingIdx, 1);
  }

  const newAssignment = {
    id: `assign_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    machineKey,
    machineName: machineName || machineKey,
    moldId: moldId || '',
    moldName: moldName || 'Genel Proje',
    taskId: taskId || '',
    taskName: taskName || 'Genel Parça',
    camOperatorName: camOperatorName || 'Belirtilmedi',
    notes,
    assignedAt: now,
    completedAt: null,
    status: 'ACTIVE',
    runningSeconds: 0,
    idleSeconds: 0,
    downSeconds: 0,
    lastCalculatedAt: now,
    initialRunningSec: currentDevice?.runningSec || 0,
    initialIdleSec: currentDevice?.idleSec || 0
  };

  active.unshift(newAssignment);
  saveActiveAssignments(active);
  return newAssignment;
};

/**
 * Aktif Parça Atamasını Tamamlar ve Arşivler
 */
export const completePartAssignment = (assignmentId, completionNote = '') => {
  const active = getActiveAssignments();
  const idx = active.findIndex(a => a.id === assignmentId);
  if (idx === -1) return null;

  const assignment = active[idx];
  assignment.completedAt = new Date().toISOString();
  assignment.status = 'COMPLETED';
  if (completionNote) {
    assignment.completionNote = completionNote;
  }

  active.splice(idx, 1);
  saveActiveAssignments(active);

  const history = getAssignmentHistory();
  history.unshift(assignment);
  saveAssignmentHistory(history.slice(0, 500));

  return assignment;
};

/**
 * Atamayı İptal Eder / Siler
 */
export const removePartAssignment = (assignmentId) => {
  const active = getActiveAssignments().filter(a => a.id !== assignmentId);
  saveActiveAssignments(active);
};

/**
 * Anlık Telemetri Verileri ile Parçaların Çalışma/Duruş Sayaçlarını Günceller
 */
export const updateAssignmentDurations = (currentFleetData = []) => {
  const active = getActiveAssignments();
  if (!active || active.length === 0) return active;

  const fleetMap = new Map();
  currentFleetData.forEach(d => {
    const key1 = (d.ip || '').trim().toLowerCase();
    const key2 = (d.id || '').trim().toLowerCase();
    if (key1) fleetMap.set(key1, d);
    if (key2) fleetMap.set(key2, d);
  });

  const now = new Date();
  let hasChanges = false;

  const updatedAssignments = active.map(assignment => {
    const key = (assignment.machineKey || '').trim().toLowerCase();
    const device = fleetMap.get(key);

    const lastCalc = assignment.lastCalculatedAt ? new Date(assignment.lastCalculatedAt) : now;
    const diffSec = Math.max(0, Math.floor((now.getTime() - lastCalc.getTime()) / 1000));

    if (diffSec >= 5 && diffSec <= 300) {
      hasChanges = true;
      const isConnected = device && device.connected !== false;
      const state = isConnected ? (device.currentState || 'Offline').toLowerCase() : 'offline';

      let newRunningSec = assignment.runningSeconds || 0;
      let newIdleSec = assignment.idleSeconds || 0;
      let newDownSec = assignment.downSeconds || 0;

      if (state === 'running') {
        newRunningSec += diffSec;
      } else if (state === 'down') {
        newDownSec += diffSec;
      } else {
        // Idle, Idling, Setup veya Offline
        newIdleSec += diffSec;
      }

      return {
        ...assignment,
        runningSeconds: newRunningSec,
        idleSeconds: newIdleSec,
        downSeconds: newDownSec,
        lastCalculatedAt: now.toISOString()
      };
    }

    return assignment;
  });

  if (hasChanges) {
    saveActiveAssignments(updatedAssignments);
  }

  return updatedAssignments;
};

// ==========================================
// 3. CAM OPERATÖRÜ ANALİZ HESAPLAMALARI
// ==========================================

export const getCamOperatorStats = () => {
  const active = getActiveAssignments();
  const history = getAssignmentHistory();
  const all = [...active, ...history];

  const operatorMap = new Map();

  all.forEach(item => {
    const opName = (item.camOperatorName || 'Belirtilmedi').trim();
    if (!operatorMap.has(opName)) {
      operatorMap.set(opName, {
        operatorName: opName,
        activePartsCount: 0,
        completedPartsCount: 0,
        totalPartsCount: 0,
        totalRunningSeconds: 0,
        totalIdleSeconds: 0,
        totalDownSeconds: 0,
        partsList: []
      });
    }

    const opData = operatorMap.get(opName);
    opData.totalPartsCount++;
    if (item.status === 'ACTIVE') {
      opData.activePartsCount++;
    } else {
      opData.completedPartsCount++;
    }

    const runSec = item.runningSeconds || 0;
    const idleSec = item.idleSeconds || 0;
    const downSec = item.downSeconds || 0;

    opData.totalRunningSeconds += runSec;
    opData.totalIdleSeconds += idleSec;
    opData.totalDownSeconds += downSec;

    opData.partsList.push({ ...item });
  });

  // Verimlilik Oranı Hesabı
  return Array.from(operatorMap.values()).map(op => {
    const totalWorkingSec = op.totalRunningSeconds + op.totalIdleSeconds + op.totalDownSeconds;
    const efficiencyPct = totalWorkingSec > 0 ? (op.totalRunningSeconds / totalWorkingSec) * 100 : 0;
    return {
      ...op,
      efficiencyPct: Math.round(efficiencyPct * 10) / 10,
      totalHours: (op.totalRunningSeconds / 3600).toFixed(1)
    };
  }).sort((a, b) => b.totalRunningSeconds - a.totalRunningSeconds);
};

// ==========================================
// 4. TEZGAH GÜNLÜK / HAFTALIK KAYIT DEFTERİ
// ==========================================

export const getLogbookSnapshots = () => {
  try {
    const raw = localStorage.getItem(LOGBOOK_SNAPSHOTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
};

export const saveLogbookSnapshots = (snapshots) => {
  try {
    localStorage.setItem(LOGBOOK_SNAPSHOTS_KEY, JSON.stringify(snapshots));
  } catch (e) {
    console.error("Logbook snapshots save error:", e);
  }
};

/**
 * Periyodik Tezgah Durum Logu Kaydeder
 */
export const recordLogbookSnapshot = (fleetData = []) => {
  if (!fleetData || fleetData.length === 0) return;

  const snapshots = getLogbookSnapshots();
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const hour = now.getHours();

  fleetData.forEach(device => {
    const machineKey = (device.ip || device.id || '').trim().toLowerCase();
    const isConnected = device.connected !== false;
    const state = isConnected ? (device.currentState || 'Offline') : 'Offline';

    const existingIdx = snapshots.findIndex(s => 
      s.machineKey === machineKey && s.date === dateStr && s.hour === hour
    );

    if (existingIdx >= 0) {
      const snap = snapshots[existingIdx];
      snap.samples = (snap.samples || 1) + 1;
      if (state.toLowerCase() === 'running') {
        snap.runningSamples = (snap.runningSamples || 0) + 1;
      } else if (state.toLowerCase() === 'idle' || state.toLowerCase() === 'idling') {
        snap.idleSamples = (snap.idleSamples || 0) + 1;
      } else if (state.toLowerCase() === 'down') {
        snap.downSamples = (snap.downSamples || 0) + 1;
      } else {
        snap.offlineSamples = (snap.offlineSamples || 0) + 1;
      }
      snap.lastState = state;
      snap.lastSpindleRpm = device.spindleRpm || snap.lastSpindleRpm;
      snap.lastFeedrate = device.feedrate || snap.lastFeedrate;
      snap.program = device.program || snap.program;
    } else {
      snapshots.unshift({
        id: `snap_${dateStr}_${hour}_${machineKey}`,
        machineKey,
        machineName: device.name || device.ip,
        date: dateStr,
        hour,
        samples: 1,
        runningSamples: state.toLowerCase() === 'running' ? 1 : 0,
        idleSamples: (state.toLowerCase() === 'idle' || state.toLowerCase() === 'idling') ? 1 : 0,
        downSamples: state.toLowerCase() === 'down' ? 1 : 0,
        offlineSamples: state.toLowerCase() === 'offline' ? 1 : 0,
        lastState: state,
        lastSpindleRpm: device.spindleRpm || null,
        lastFeedrate: device.feedrate || null,
        program: device.program || null
      });
    }
  });

  // En son 1000 saatlik logu sakla
  saveLogbookSnapshots(snapshots.slice(0, 1000));
};

/**
 * Belirli Bir Tezgahın 24 Saatlik Zaman Çizelgesini Oluşturur
 */
export const getMachine24hTimeline = (machineKey, targetDate = null) => {
  const snapshots = getLogbookSnapshots();
  const dateStr = targetDate || new Date().toISOString().slice(0, 10);
  const key = (machineKey || '').trim().toLowerCase();

  const machineSnapshots = snapshots.filter(s => 
    s.machineKey === key && s.date === dateStr
  );

  const hourMap = new Map();
  machineSnapshots.forEach(s => {
    hourMap.set(s.hour, s);
  });

  const timeline = [];
  for (let h = 0; h < 24; h++) {
    const snap = hourMap.get(h);
    if (!snap) {
      timeline.push({
        hour: h,
        label: `${String(h).padStart(2, '0')}:00`,
        state: 'NoData',
        runningPct: 0,
        samples: 0
      });
    } else {
      const total = snap.samples || 1;
      const runningCount = snap.runningSamples || 0;
      const idleCount = snap.idleSamples || 0;
      const downCount = snap.downSamples || 0;
      const runningPct = Math.round((runningCount / total) * 100);

      let dominantState = snap.lastState || 'Offline';
      if (runningCount > idleCount && runningCount > downCount) dominantState = 'Running';
      else if (idleCount >= runningCount && idleCount > downCount) dominantState = 'Idle';
      else if (downCount > 0) dominantState = 'Down';

      timeline.push({
        hour: h,
        label: `${String(h).padStart(2, '0')}:00`,
        state: dominantState,
        runningPct,
        samples: total,
        spindleRpm: snap.lastSpindleRpm,
        feedrate: snap.lastFeedrate,
        program: snap.program
      });
    }
  }

  return timeline;
};
