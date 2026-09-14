// src/utils/workOrderUtils.js

import { PROJECT_TYPES } from '../config/constants.js';

/**
 * Kalıbın Sisteme İlk Eklenme Tarihini Tespit Eder
 * Öncelik: createdAt -> id içindeki timestamp (mold-17...) -> en erken operasyon startDate -> moldDeadline -> bugünün tarihi
 */
export const getMoldCreationDate = (mold) => {
  if (!mold) return new Date();
  if (mold.createdAt) {
    const d = new Date(mold.createdAt);
    if (!isNaN(d.getTime())) return d;
  }
  if (typeof mold.id === 'string' && mold.id.startsWith('mold-')) {
    const tsPart = mold.id.replace('mold-', '').split('-')[0];
    const ts = parseInt(tsPart, 10);
    if (!isNaN(ts) && ts > 1000000000000 && ts < 2500000000000) {
      return new Date(ts);
    }
  }
  if (mold.tasks && Array.isArray(mold.tasks)) {
    const opDates = mold.tasks
      .flatMap(t => t.operations || [])
      .map(op => (op.startDate ? new Date(op.startDate).getTime() : null))
      .filter(t => t && !isNaN(t));
    if (opDates.length > 0) return new Date(Math.min(...opDates));
  }
  if (mold.moldDeadline) {
    const d = new Date(mold.moldDeadline);
    if (!isNaN(d.getTime())) return d;
  }
  return new Date();
};

/**
 * Tarihi GGAAAYY (örn: 050326) Formatında Metne Dönüştürür
 */
export const formatDateToCode = (date) => {
  const d = date instanceof Date ? date : new Date(date || Date.now());
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = String(d.getFullYear()).slice(-2);
  return `${day}${month}${year}`;
};

/**
 * Kalıp Türünden 2-3 Harfli Standart Kod Üretir
 */
export const getProjectTypeCode = (projectType) => {
  if (!projectType) return 'YNK';
  const upper = String(projectType).toUpperCase().trim();

  if (upper.includes('YENİ') || upper.includes('NEW')) return 'YNK';
  if (upper.includes('REVİZYON') || upper.includes('REVISION')) return 'REV';
  if (upper.includes('PROJE') || upper.includes('FASON') || upper.includes('İMALAT')) return 'PRJ';
  if (upper.includes('T0')) return 'T0';
  if (upper.includes('İYİLEŞTİRME') || upper.includes('IMPROVEMENT')) return 'IYL';

  // Genel Kısaltma
  const clean = upper.replace(/[^A-Z0-9]/g, '');
  return clean.slice(0, 3) || 'GEN';
};

/**
 * Kalıp İş Emri Numarasını Üretir / Alır
 * Kural: [Sisteme Eklenme Tarihi]-[TÜR]-[KALIP KODU veya SAYAÇ]
 * Örn: 050326-YNK-1234 veya 090926-YNK-01
 */
export const getMoldWorkOrderNo = (mold, customMoldCode = null, existingProjects = []) => {
  if (!mold && !customMoldCode) return '';

  // 1. Sisteme eklenme tarihini bul (GGAAAYY)
  const creationDate = getMoldCreationDate(mold);
  const datePrefix = formatDateToCode(creationDate);
  const typeCode = getProjectTypeCode(mold?.projectType || 'YENİ KALIP');

  // 2. Kalıp kodunu belirle
  const codeCandidate = (customMoldCode !== null ? customMoldCode : (mold?.moldCode || '')).trim().toUpperCase();

  // Temel iş emri kökünü (baseCandidate) belirle
  let baseCandidate = '';
  if (codeCandidate) {
    if (/^\d{6}-[A-Z0-9]+-/.test(codeCandidate)) {
      baseCandidate = codeCandidate;
    } else {
      const cleanSuffix = codeCandidate.replace(/[^A-Z0-9_-]/g, '');
      baseCandidate = `${datePrefix}-${typeCode}-${cleanSuffix}`;
    }
  } else {
    // Kalıp kodu yoksa sayaçlı formatın ön eki
    baseCandidate = `${datePrefix}-${typeCode}`;
  }

  // 3. Mevcut Projeler Listesinde Çakışma / Sıralama Kontrolü
  if (Array.isArray(existingProjects) && existingProjects.length > 0) {
    const currentMoldTime = creationDate.getTime();
    
    // Kendisinden daha önce eklenmiş / var olan diğer projeleri filtrele
    const earlierOtherProjects = existingProjects.filter(p => {
      if (!p) return false;
      if (mold?.id && p.id === mold.id) return false; // Kendisi hariç
      
      // Eğer mevcut bir kalıp inceleniyorsa, sadece kendisinden daha önce açılmış olanları öncelikli gör
      if (mold?.id && p.id) {
        const pTime = getMoldCreationDate(p).getTime();
        if (pTime < currentMoldTime) return true;
        if (pTime === currentMoldTime && String(p.id).localeCompare(String(mold.id)) < 0) return true;
        return false;
      }
      
      // Yeni bir kalıp ekleniyorsa (henüz id'si yoksa), mevcut tüm projeleri tara
      return true;
    });

    if (codeCandidate) {
      // Özel kalıp kodu verilmişse (örn: 1111 -> 140926-YNK-1111)
      const baseEscaped = baseCandidate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const suffixRegex = new RegExp(`^${baseEscaped}-(\\d+)$`);

      // Kronolojik sırala (en eski en başta)
      earlierOtherProjects.sort((a, b) => {
        const tA = getMoldCreationDate(a).getTime();
        const tB = getMoldCreationDate(b).getTime();
        if (tA !== tB) return tA - tB;
        return String(a.id || '').localeCompare(String(b.id || ''));
      });

      let exactBaseFound = false;
      let maxSuffix = 0;

      earlierOtherProjects.forEach(p => {
        const pWorkOrder = String(p.workOrderNo || '').trim();
        const pMoldCode = String(p.moldCode || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
        const pDatePrefix = formatDateToCode(getMoldCreationDate(p));
        const pTypeCode = getProjectTypeCode(p.projectType || 'YENİ KALIP');
        const pCleanSuffix = (customMoldCode !== null ? customMoldCode : (mold?.moldCode || '')).trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');

        if (pWorkOrder) {
          const match = pWorkOrder.match(suffixRegex);
          if (match) {
            exactBaseFound = true;
            const num = parseInt(match[1], 10);
            if (!isNaN(num)) {
              maxSuffix = Math.max(maxSuffix, num);
            }
          } else if (pWorkOrder === baseCandidate) {
            if (exactBaseFound) {
              maxSuffix = Math.max(maxSuffix + 1, 1);
            } else {
              exactBaseFound = true;
            }
          }
        } else if (pMoldCode === pCleanSuffix && pDatePrefix === datePrefix && pTypeCode === typeCode) {
          if (exactBaseFound) {
            maxSuffix = Math.max(maxSuffix + 1, 1);
          } else {
            exactBaseFound = true;
          }
        }
      });

      if (exactBaseFound) {
        const nextSeq = String(maxSuffix + 1).padStart(2, '0');
        return `${baseCandidate}-${nextSeq}`;
      }
      return baseCandidate;
    } else {
      // Kalıp kodu verilmemişse sayaçlı mod (01, 02, 03...)
      const searchPrefix = `${baseCandidate}-`;
      let maxSeq = 0;
      earlierOtherProjects.forEach(p => {
        const wNo = String(p.workOrderNo || p.moldCode || '').trim();
        if (wNo.startsWith(searchPrefix)) {
          const parts = wNo.split('-');
          const lastPart = parts[parts.length - 1];
          const num = parseInt(lastPart, 10);
          if (!isNaN(num) && num > maxSeq) {
            maxSeq = num;
          }
        }
      });
      const nextSeq = String(maxSeq + 1).padStart(2, '0');
      return `${baseCandidate}-${nextSeq}`;
    }
  }

  // 4. Eğer kalıp üzerinde kayıtlı workOrderNo varsa ve çakışma kontrolü yapılmadıysa onu kullan
  if (customMoldCode === null && mold?.workOrderNo && typeof mold.workOrderNo === 'string' && mold.workOrderNo.trim() !== '') {
    return mold.workOrderNo.trim();
  }

  return baseCandidate;
};

/**
 * Geriye Dönük Uyumluluk İçin generateMoldCode (getMoldWorkOrderNo ile senkron)
 */
export const generateMoldCode = (projectType = PROJECT_TYPES.NEW_MOLD, existingProjects = [], targetDate = new Date()) => {
  return getMoldWorkOrderNo({ projectType }, null, existingProjects);
};

/**
 * Bir Kalıp Altındaki Tüm Operasyonları Tarayıp Sıradaki Eşsiz İş Emri Numarasını Üretir
 * Seçenek A Kuralı: [KALIP İŞ EMRİ]-[01], [02], [03]...
 */
export const generateNextWorkOrderNo = (mold) => {
  if (!mold) return `IE-${Date.now().toString().slice(-4)}`;

  const baseCode = getMoldWorkOrderNo(mold) || (mold.moldCode || mold.projectCode || mold.projectNumber || mold.moldName || 'IE').trim();

  // Kalıbın tüm görevlerindeki (parçalarındaki) operasyonları topla
  const existingWorkOrders = new Set();
  let totalOpsCount = 0;

  if (Array.isArray(mold.tasks)) {
    mold.tasks.forEach(task => {
      if (Array.isArray(task.operations)) {
        task.operations.forEach(op => {
          totalOpsCount++;
          if (op.workOrderNo) {
            existingWorkOrders.add(String(op.workOrderNo).trim());
          }
        });
      }
    });
  }

  // Kalıp iş emri önekli en yüksek sayaç numarasını bul
  const prefix = `${baseCode}-`;
  let maxSeq = 0;

  existingWorkOrders.forEach(wNo => {
    if (wNo.startsWith(prefix)) {
      const suffix = wNo.slice(prefix.length);
      const num = parseInt(suffix, 10);
      if (!isNaN(num) && num > maxSeq) {
        maxSeq = num;
      }
    }
  });

  const nextSeqNum = Math.max(maxSeq + 1, totalOpsCount + 1);
  const nextSeqStr = String(nextSeqNum).padStart(2, '0');

  return `${baseCode}-${nextSeqStr}`;
};

/**
 * Kalıp Görevleri/Parçaları İçindeki Tüm Operasyonlara Sırayla Eşsiz İş Emri Numarası Atar
 * Örn: [KALIP İŞ EMRİ]-01, [KALIP İŞ EMRİ]-02, ...
 */
export const assignWorkOrderNumbersToTasks = (tasks, baseWorkOrderNo, overwrite = false) => {
  if (!Array.isArray(tasks) || !baseWorkOrderNo) return tasks || [];

  let seq = 1;
  return tasks.map(task => {
    if (!task.operations || !Array.isArray(task.operations)) return task;
    const newOperations = task.operations.map(op => {
      if (!overwrite && op.workOrderNo && String(op.workOrderNo).trim() !== '') {
        return op;
      }
      const opWorkOrderNo = `${baseWorkOrderNo}-${String(seq).padStart(2, '0')}`;
      seq++;
      return {
        ...op,
        workOrderNo: opWorkOrderNo
      };
    });
    return {
      ...task,
      operations: newOperations
    };
  });
};

/**
 * Kalıp Görüntüleme Formatlayıcısı
 * Eğer kalıp kodu varsa: "[1234] Tutamak Kalıbı" veya "[090926-YNK-01] Tutamak Kalıbı"
 * Yoksa eski format: "Tutamak Kalıbı"
 */
export const formatMoldDisplay = (mold) => {
  if (!mold) return '';
  if (typeof mold === 'string') return mold;
  const code = (mold.moldCode || mold.projectCode || mold.workOrderNo || '').trim();
  const name = (mold.moldName || mold.name || '').trim();

  if (code && name) {
    if (name.includes(code)) return name;
    return `[${code}] ${name}`;
  }
  return code || name || 'İsimsiz Kalıp';
};
