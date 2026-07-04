// src/config/permissionsConfig.js

import { ROLES } from './constants.js';

export const ALL_SYSTEM_PAGES = [
    { path: '/', label: 'Kalıp İmalat', iconName: 'List' },
    { path: '/canli-durum', label: 'Canlı Tezgah İzleme', iconName: 'Radio' },
    { path: '/vardiya-plani', label: 'Gece Vardiyası Planı', iconName: 'Moon' },
    { path: '/vardiya-takip', label: 'Vardiya & Servis Planı', iconName: 'Truck' },
    { path: '/project-management', label: 'Proje', iconName: 'Briefcase' },
    { path: '/design-office', label: 'Tasarım Ofisi', iconName: 'PenTool' },
    { path: '/machine-queue', label: 'İş Akış Planı', iconName: 'ListOrdered' },
    { path: '/mold-trial-reports', label: 'Deneme Raporları', iconName: 'ClipboardCheck' },
    { path: '/mold-maintenance', label: 'Bakım & Sicil', iconName: 'Wrench' },
    { path: '/machine-maintenance', label: 'Tezgah Bakımı', iconName: 'Wrench' },
    { path: '/active', label: 'Çalışan Parçalar', iconName: 'PlayCircle' },
    { path: '/tool-inventory', label: 'Depo & Stok', iconName: 'Package' },
    { path: '/tool-assignment', label: 'Takımhane', iconName: 'Wrench' },
    { path: '/mold-material-debits', label: 'Kalıp Malzeme Zimmetleri', iconName: 'Layers' },
    { path: '/tool-history', label: 'Takım Geçmişi', iconName: 'FileText' },
    { path: '/tool-analysis', label: 'Takım Analizi', iconName: 'TrendingUp' },
    { path: '/tool-lifecycle', label: 'Ömür Analizi', iconName: 'Activity' },
    { path: '/mold-tool-tracking', label: 'Kalıp Takım Takibi', iconName: 'FolderOpen' },
    { path: '/cam', label: 'Aktif İşlerim', iconName: 'Settings' },
    { path: '/cam-job-entry', label: 'İş Ekleme', iconName: 'Briefcase' },
    { path: '/cam-operator-dashboard', label: 'CAM Süre Takip', iconName: 'Clock' },
    { path: '/admin', label: 'Admin Paneli', iconName: 'LayoutDashboard' },
    { path: '/admin/layout', label: 'Yerleşim', iconName: 'MapIcon' },
    { path: '/history', label: 'Geçmiş İşler', iconName: 'History' },
    { path: '/analysis', label: 'Veri Analizi', iconName: 'BarChart2' },
    { path: '/terminal', label: 'Tezgah Terminali', iconName: 'Monitor' },
    { path: '/forklift', label: 'Forklift Paneli', iconName: 'Truck' },
    { path: '/assembly', label: 'Montaj Paneli', iconName: 'Wrench' },
    { path: '/continuous-improvement', label: 'Sürekli İyileştirme', iconName: 'Target' },
    { path: '/survey-evaluation', label: 'Anket & Değerlendirme', iconName: 'ClipboardCheck' },
    
    // CNC Torna Sayfaları
    { path: '/cnc-lathe-planning', label: 'Torna İş Planlama', iconName: 'List' },
    { path: '/cnc-raw-material', label: 'Torna Hammadde Planlama', iconName: 'Database' },
    { path: '/cnc-lathe-calendar', label: 'Torna Takvim', iconName: 'Calendar' },
    { path: '/cnc-torna', label: 'CNC Torna İşleri', iconName: 'Layers' },
    { path: '/cnc-part-manager', label: 'Torna Parça & Kalite Yönetimi', iconName: 'Box' },
    { path: '/cnc-spc-analysis', label: 'Torna SPC Analiz', iconName: 'Activity' },
    { path: '/cnc-inspection-report', label: 'Torna Raporlar (Form)', iconName: 'FileOutput' },
    { path: '/operator-performance', label: 'Torna Personel Takip', iconName: 'Users' },
    { path: '/cnc-torna-history', label: 'Torna Geçmiş İşler', iconName: 'Archive' },
];

export const getDefaultPermissions = (role) => {
    const allLoginRoles = Array.from(new Set([...Object.values(ROLES), 'CAM Sorumlusu']));
    const canSeeAdmin = [ROLES.ADMIN, ROLES.KALIP_TASARIM_SORUMLUSU, ROLES.KALIP_TASARIM_YONETICISI, ROLES.PROJE_SORUMLUSU];
    const canSeeAnalysis = [ROLES.ADMIN, ROLES.SUPERVISOR, ROLES.PROJE_SORUMLUSU, ROLES.KALIP_TASARIM_SORUMLUSU, ROLES.KALIP_TASARIM_YONETICISI];
    const canSeeTools = [ROLES.TAKIMHANE_SORUMLUSU];
    
    const rolesExceptToolRoomAndCnc = allLoginRoles.filter(r => 
        r !== ROLES.TAKIMHANE_SORUMLUSU && r !== ROLES.CNC_TORNA_OPERATORU && r !== ROLES.CNC_TORNA_SORUMLUSU
    );
    const rolesExceptCnc = allLoginRoles.filter(r => 
        r !== ROLES.CNC_TORNA_OPERATORU && r !== ROLES.CNC_TORNA_SORUMLUSU
    );

    const permissions = {};
    
    // Initialize all to false
    ALL_SYSTEM_PAGES.forEach(p => {
        permissions[p.path] = { view: false, edit: false };
    });

    if (role === ROLES.ADMIN) {
        // Admin has access to all pages and can edit them
        ALL_SYSTEM_PAGES.forEach(p => {
            permissions[p.path] = { view: true, edit: true };
        });
        return permissions;
    }

    // Role specific view permissions based on hardcoded App.js logic
    if (role === ROLES.MACHINE_OPERATOR) {
        permissions['/terminal'] = { view: true, edit: true };
        permissions['/tool-assignment'] = { view: true, edit: true };
        permissions['/tool-history'] = { view: true, edit: false };
        permissions['/survey-evaluation'] = { view: true, edit: true };
        return permissions;
    }

    if (role === ROLES.CNC_TORNA_OPERATORU) {
        permissions['/cnc-torna'] = { view: true, edit: true };
        permissions['/cnc-torna-history'] = { view: true, edit: false };
        permissions['/survey-evaluation'] = { view: true, edit: true };
        return permissions;
    }

    if (role === ROLES.CNC_TORNA_SORUMLUSU) {
        permissions['/cnc-lathe-planning'] = { view: true, edit: true };
        permissions['/cnc-raw-material'] = { view: true, edit: true };
        permissions['/cnc-lathe-calendar'] = { view: true, edit: true };
        permissions['/cnc-torna'] = { view: true, edit: true };
        permissions['/cnc-part-manager'] = { view: true, edit: true };
        permissions['/cnc-spc-analysis'] = { view: true, edit: true };
        permissions['/cnc-inspection-report'] = { view: true, edit: true };
        permissions['/operator-performance'] = { view: true, edit: true };
        permissions['/cnc-torna-history'] = { view: true, edit: false };
        permissions['/survey-evaluation'] = { view: true, edit: true };
        return permissions;
    }

    // General roles view permissions
    if (rolesExceptCnc.includes(role)) permissions['/'] = { view: true, edit: false };
    if (rolesExceptToolRoomAndCnc.includes(role)) permissions['/canli-durum'] = { view: true, edit: false };
    if (allLoginRoles.includes(role)) permissions['/vardiya-plani'] = { view: true, edit: false };
    if ([ROLES.CAM_OPERATOR, 'CAM Sorumlusu', ROLES.ADMIN].includes(role)) permissions['/vardiya-takip'] = { view: true, edit: false };
    if ([ROLES.ADMIN, ROLES.PROJE_SORUMLUSU, ROLES.KALIP_TASARIM_YONETICISI].includes(role)) permissions['/project-management'] = { view: true, edit: false };
    if ([ROLES.ADMIN, ROLES.KALIP_TASARIM_SORUMLUSU, ROLES.KALIP_TASARIM_YONETICISI].includes(role)) permissions['/design-office'] = { view: true, edit: false };
    if (rolesExceptToolRoomAndCnc.includes(role)) permissions['/machine-queue'] = { view: true, edit: false };
    if (rolesExceptToolRoomAndCnc.includes(role)) permissions['/mold-trial-reports'] = { view: true, edit: false };
    if ([ROLES.ADMIN, ROLES.SUPERVISOR, ROLES.TAKIMHANE_SORUMLUSU].includes(role)) permissions['/mold-maintenance'] = { view: true, edit: false };
    if ([ROLES.ADMIN, ROLES.SUPERVISOR].includes(role)) permissions['/machine-maintenance'] = { view: true, edit: false };
    if (allLoginRoles.includes(role)) permissions['/active'] = { view: true, edit: false };
    if (canSeeTools.includes(role)) permissions['/tool-inventory'] = { view: true, edit: false };
    if (canSeeTools.includes(role)) permissions['/tool-assignment'] = { view: true, edit: false };
    if (canSeeTools.includes(role)) permissions['/mold-material-debits'] = { view: true, edit: false };
    if ([...canSeeTools, ROLES.MACHINE_OPERATOR, ROLES.ADMIN, ROLES.SUPERVISOR].includes(role)) permissions['/tool-history'] = { view: true, edit: false };
    if (canSeeTools.includes(role)) permissions['/tool-analysis'] = { view: true, edit: false };
    if (canSeeTools.includes(role)) permissions['/tool-lifecycle'] = { view: true, edit: false };
    if ([...canSeeTools, ROLES.ADMIN, ROLES.SUPERVISOR].includes(role)) permissions['/mold-tool-tracking'] = { view: true, edit: false };
    if ([ROLES.CAM_OPERATOR, 'CAM Sorumlusu'].includes(role)) permissions['/cam'] = { view: true, edit: false };
    if ([ROLES.CAM_OPERATOR, 'CAM Sorumlusu'].includes(role)) permissions['/cam-job-entry'] = { view: true, edit: false };
    if ([ROLES.ADMIN, ROLES.CAM_OPERATOR, 'CAM Sorumlusu', ROLES.KALIP_TASARIM_YONETICISI].includes(role)) permissions['/cam-operator-dashboard'] = { view: true, edit: false };
    if (canSeeAdmin.includes(role)) permissions['/admin'] = { view: true, edit: false };
    if ([ROLES.ADMIN].includes(role)) permissions['/admin/layout'] = { view: true, edit: false };
    if (rolesExceptToolRoomAndCnc.includes(role)) permissions['/history'] = { view: true, edit: false };
    if (canSeeAnalysis.includes(role)) permissions['/analysis'] = { view: true, edit: false };
    if ([ROLES.ADMIN, ROLES.SUPERVISOR].includes(role)) permissions['/terminal'] = { view: true, edit: false };
    if ([ROLES.ADMIN].includes(role)) permissions['/forklift'] = { view: true, edit: false };
    if ([ROLES.ADMIN].includes(role)) permissions['/assembly'] = { view: true, edit: false };
    if (rolesExceptToolRoomAndCnc.includes(role)) permissions['/continuous-improvement'] = { view: true, edit: false };
    if ([ROLES.ADMIN, ROLES.CAM_OPERATOR, 'CAM Sorumlusu', ROLES.MACHINE_OPERATOR, ROLES.CNC_TORNA_OPERATORU, ROLES.CNC_TORNA_SORUMLUSU].includes(role)) permissions['/survey-evaluation'] = { view: true, edit: false };

    // Edit permission default logic based on role authority
    const isEditUser = [ROLES.ADMIN, ROLES.SUPERVISOR, ROLES.KALIP_TASARIM_SORUMLUSU, ROLES.KALIP_TASARIM_YONETICISI, ROLES.PROJE_SORUMLUSU, 'CAM Sorumlusu'].includes(role);
    if (isEditUser) {
        ALL_SYSTEM_PAGES.forEach(p => {
            if (permissions[p.path].view) {
                permissions[p.path].edit = true;
            }
        });
    }

    return permissions;
};
