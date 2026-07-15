// src/pages/SurveyEvaluationPage.js

import React, { useState, useMemo, useEffect } from 'react';
import { 
    ClipboardCheck, Award, MessageSquare, AlertTriangle, Users, Star, User, ChevronRight, ChevronDown, CheckCircle, Search, TrendingDown, Info, Trash2, Plus, Settings2, Calendar, Edit3
} from 'lucide-react';
import { 
    LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid 
} from 'recharts';
import { db, collection, setDoc, doc, deleteDoc, onSnapshot, query } from '../config/firebase.js';
import { getCurrentDateTimeString } from '../utils/dateUtils.js';

// --- ANKET SORULARI (CNC FREZE ATÖLYESİNE UYGUN) ---
const CAM_QUESTIONS = [
    { id: 'q1', text: 'Program Güvenirliği (Çarpma Güvenliği)', desc: 'G-kodlarında dalma, çarpma riski veya koordinat hatalarının olmaması' },
    { id: 'q2', text: 'Takım Yolu Optimizasyonu', desc: 'Kesme stratejileri (talaş derinliği, yan adım, boşta gezme süresi) verimliliği' },
    { id: 'q3', text: 'Setup Sheet (Kurulum Sayfası)', desc: 'İş sıfırı, takım listesi ve bağlama talimatlarının netliği ve doğruluğu' },
    { id: 'q4', text: 'Doğru Takım ve Tutucu Seçimi', desc: 'Tezgaha ve malzemeye uygun takım çapı, boyu ve tutucu seçimi' },
    { id: 'q5', text: 'Destek ve İletişim', desc: 'Programda revizyon gerektiğinde geri dönüş ve problem çözme hızı' }
];

const MACHINE_QUESTIONS = [
    { id: 'q1', text: 'Parça Kurulumu ve Sıfırlama', desc: 'Parçayı bağlama, hizalama ve sıfır alma hassasiyeti' },
    { id: 'q2', text: 'Kesici Takım ve Devir/İlerleme Kullanımı', desc: 'Verilen kesme parametrelerine uyum ve takım aşınma takibi' },
    { id: 'q3', text: 'Hata Bildirimi ve İletişim', desc: 'Programda hata gördüğünde CAM operatörüne zamanında ve net bildirim yapma' },
    { id: 'q4', text: 'Tezgah Temizliği ve Düzen', desc: 'Kabin içi, mengene temizliği ve takım sıfırlama disiplini' },
    { id: 'q5', text: 'İş ve Tezgah Güvenliği', desc: 'Korumaları aşmama, gözlük kullanma ve güvenlik kurallarına tam uyum' }
];

const CAM_BY_MANAGER_QUESTIONS = [
    { id: 'q1', text: 'CAM Programlama Hızı ve Zaman Yönetimi', desc: 'Tasarımı biten kalıpların CAM programlamasının zamanında yapılması ve üretim akışını aksatmaması' },
    { id: 'q2', text: 'Hassas ve Optimize Kesme Stratejileri', desc: 'Takım ömrünü koruyan, tezgah verimini artıran ve işleme sürelerini en aza indiren stratejilerin seçimi' },
    { id: 'q3', text: 'Tezgah Operatörlerine Teknik Destek ve Problem Çözme', desc: 'Atölyede karşılaşılan program veya işleme sorunlarına hızlı, doğru ve çözüm odaklı müdahale etmesi' },
    { id: 'q4', text: 'Program Hata Oranı ve Kalite Standartları', desc: 'Üretim esnasında CAM hatası kaynaklı çarpma, parça bozma ve fire oranlarının düşüklüğü' },
    { id: 'q5', text: 'Yeni Teknolojilere ve İşleme Yöntemlerine Uyum', desc: 'Yüksek hızlı işleme stratejilerini, yeni takım teknolojilerini araştırma ve uygulama istekliliği' }
];

// Tarih gruplama yardımcıları
const getWeekRange = (date) => {
    const temp = new Date(date);
    const day = temp.getDay();
    const diff = temp.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(temp.setDate(diff));
    return `${String(monday.getDate()).padStart(2, '0')}.${String(monday.getMonth()+1).padStart(2, '0')}`;
};

const getMonthName = (date) => {
    const months = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
    return `${months[date.getMonth()]} ${date.getFullYear()}`;
};

const SurveyEvaluationPage = ({ loggedInUser, personnel = [] }) => {
    const isAdmin = loggedInUser?.role === 'Yönetici' || loggedInUser?.role === 'Admin';

    // State definitions
    const [surveys, setSurveys] = useState([]);
    const [targetId, setTargetId] = useState('');
    const [ratings, setRatings] = useState({});
    const [comment, setComment] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [message, setMessage] = useState('');
    
    // Searchable dropdown states
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [dropdownSearch, setDropdownSearch] = useState('');
    
    // Admin states
    const [adminActiveTab, setAdminActiveTab] = useState('summary'); // 'summary', 'details', 'common_issues', 'questions'
    const [selectedPersonnelId, setSelectedPersonnelId] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [trendPeriod, setTrendPeriod] = useState('weekly'); // 'weekly', 'monthly', 'yearly'

    // Question Management states
    const [newQuestionText, setNewQuestionText] = useState('');
    const [newQuestionDesc, setNewQuestionDesc] = useState('');
    const [newQuestionTarget, setNewQuestionTarget] = useState('MACHINE'); // 'MACHINE' or 'CAM'
    const [isQuestionSaving, setIsQuestionSaving] = useState(false);
    const [editingQuestionId, setEditingQuestionId] = useState(null);
    const [editText, setEditText] = useState('');
    const [editDesc, setEditDesc] = useState('');

    const [surveysLoaded, setSurveysLoaded] = useState(false);

    // Load surveys from Firestore
    useEffect(() => {
        if (!db) return;
        const q = query(collection(db, 'operatorSurveys'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setSurveys(snapshot.docs.map(doc => doc.data()));
            setSurveysLoaded(true);
        });
        return () => unsubscribe();
    }, []);

    // Seed sample manager evaluations for CAM operators if none exist
    useEffect(() => {
        if (!db || !surveysLoaded) return;
        
        const hasManagerCamSurveys = surveys.some(s => 
            s.evaluatorId === 'person-admin' && 
            s.targetRole?.toUpperCase().includes('CAM')
        );
        
        if (!hasManagerCamSurveys) {
            const sampleSurveys = [
                {
                    id: 'sample-mgr-survey-1',
                    evaluatorId: 'person-admin',
                    evaluatorName: 'Ayşe Hanım (Yönetici)',
                    evaluatorRole: 'Yönetici',
                    targetId: 'person-cam1',
                    targetName: 'Emre Bey (CAM)',
                    targetRole: 'CAM Operatörü',
                    ratings: {
                        'system-cam-mgr-1': 4,
                        'system-cam-mgr-2': 5,
                        'system-cam-mgr-3': 4,
                        'system-cam-mgr-4': 5,
                        'system-cam-mgr-5': 4
                    },
                    averageScore: 4.4,
                    comment: 'CAM programlama hızı gayet iyi, hata oranı çok düşük. Yeni işleme yöntemlerine hızlı uyum sağlıyor.',
                    timestamp: '2026-07-08 14:00:00'
                },
                {
                    id: 'sample-mgr-survey-2',
                    evaluatorId: 'person-admin',
                    evaluatorName: 'Ayşe Hanım (Yönetici)',
                    evaluatorRole: 'Yönetici',
                    targetId: 'person-cam1',
                    targetName: 'Emre Bey (CAM)',
                    targetRole: 'CAM Operatörü',
                    ratings: {
                        'system-cam-mgr-1': 5,
                        'system-cam-mgr-2': 4,
                        'system-cam-mgr-3': 4,
                        'system-cam-mgr-4': 5,
                        'system-cam-mgr-5': 5
                    },
                    averageScore: 4.6,
                    comment: 'Talaş kaldırma verimliliği yüksek. Takım ömrünü artırıcı stratejileri başarıyla uyguluyor.',
                    timestamp: '2026-07-01 10:30:00'
                },
                {
                    id: 'sample-mgr-survey-3',
                    evaluatorId: 'person-admin',
                    evaluatorName: 'Ayşe Hanım (Yönetici)',
                    evaluatorRole: 'Yönetici',
                    targetId: 'person-cam2',
                    targetName: 'Can Bey (CAM)',
                    targetRole: 'CAM Operatörü',
                    ratings: {
                        'system-cam-mgr-1': 5,
                        'system-cam-mgr-2': 4,
                        'system-cam-mgr-3': 5,
                        'system-cam-mgr-4': 4,
                        'system-cam-mgr-5': 4
                    },
                    averageScore: 4.4,
                    comment: 'Operatörlerle olan iletişimi ve problem çözme hızı mükemmel. Programları güvenli.',
                    timestamp: '2026-07-09 11:15:00'
                },
                {
                    id: 'sample-mgr-survey-4',
                    evaluatorId: 'person-admin',
                    evaluatorName: 'Ayşe Hanım (Yönetici)',
                    evaluatorRole: 'Yönetici',
                    targetId: 'person-cam-sorumlu',
                    targetName: 'Murat Bey (CAM Sorumlusu)',
                    targetRole: 'CAM Sorumlusu',
                    ratings: {
                        'system-cam-mgr-1': 5,
                        'system-cam-mgr-2': 5,
                        'system-cam-mgr-3': 5,
                        'system-cam-mgr-4': 5,
                        'system-cam-mgr-5': 5
                    },
                    averageScore: 5.0,
                    comment: 'Bölüm liderliği ve teknik donanımı üst düzey. İş kalitesi standartlarimizi başarıyla koruyor.',
                    timestamp: '2026-07-10 15:45:00'
                }
            ];

            sampleSurveys.forEach(async (survey) => {
                try {
                    await setDoc(doc(db, 'operatorSurveys', survey.id), survey);
                } catch (e) {
                    console.error("Örnek değerlendirme yüklenemedi:", e);
                }
            });
        }
    }, [surveys, surveysLoaded]);

    const [questions, setQuestions] = useState([]);

    // Load and seed questions from Firestore
    useEffect(() => {
        if (!db) return;
        const q = query(collection(db, 'operatorSurveyQuestions'));
        const unsubscribe = onSnapshot(q, async (snapshot) => {
            const hasSystemQuestions = snapshot.docs.some(doc => doc.id === 'system-cam-1');
            const hasManagerQuestions = snapshot.docs.some(doc => doc.id === 'system-cam-mgr-1');
            if (snapshot.empty || !hasSystemQuestions || !hasManagerQuestions) {
                const defaults = [
                    ...CAM_QUESTIONS.map((item, idx) => ({ 
                        id: `system-cam-${idx + 1}`, 
                        text: item.text, 
                        desc: item.desc, 
                        target: 'CAM', 
                        isSystem: true,
                        order: idx
                    })),
                    ...MACHINE_QUESTIONS.map((item, idx) => ({ 
                        id: `system-machine-${idx + 1}`, 
                        text: item.text, 
                        desc: item.desc, 
                        target: 'MACHINE', 
                        isSystem: true,
                        order: idx
                    })),
                    ...CAM_BY_MANAGER_QUESTIONS.map((item, idx) => ({ 
                        id: `system-cam-mgr-${idx + 1}`, 
                        text: item.text, 
                        desc: item.desc, 
                        target: 'CAM_BY_MANAGER', 
                        isSystem: true,
                        order: idx
                    }))
                ];
                for (const d of defaults) {
                    await setDoc(doc(db, 'operatorSurveyQuestions', d.id), d);
                }
            } else {
                const list = snapshot.docs.map(doc => doc.data());
                list.sort((a, b) => {
                    if (a.target !== b.target) return a.target.localeCompare(b.target);
                    if (a.order !== undefined && b.order !== undefined) return a.order - b.order;
                    return a.id.localeCompare(b.id);
                });
                setQuestions(list);
            }
        });
        return () => unsubscribe();
    }, []);

    // Determine target personnel based on evaluator's role
    const targetPersonnelList = useMemo(() => {
        if (!loggedInUser || !personnel) return [];
        const role = loggedInUser.role;

        let filtered = [];
        if (isAdmin) {
            // Admin evaluates anyone except admins
            filtered = personnel.filter(p => p.role !== 'Yönetici' && p.role !== 'Admin');
        } else {
            const isCam = role.toUpperCase().includes('CAM');
            if (isCam) {
                // CAM evaluates Machine Operators
                filtered = personnel.filter(p => p.role && (
                    p.role.toUpperCase().includes('TEZGAH') || 
                    p.role.toUpperCase().includes('OPERATÖR') || 
                    p.role.toUpperCase().includes('CNC') || 
                    p.role.toUpperCase().includes('MONTAJ')
                ));
            } else {
                // Machine Operators evaluate CAM operators
                filtered = personnel.filter(p => p.role && p.role.toUpperCase().includes('CAM'));
            }
        }

        // Kişinin kendisini değerlendirmesini engelle (haksızlık/kafa karışıklığı önleme)
        return filtered.filter(p => p.id !== loggedInUser.id && p.name !== loggedInUser.name);
    }, [loggedInUser, personnel, isAdmin]);

    // Filter target personnel list based on dropdown search input
    const filteredDropdownList = useMemo(() => {
        if (!targetPersonnelList) return [];
        return targetPersonnelList.filter(p => {
            const nameMatch = p.name?.toLowerCase().includes(dropdownSearch.toLowerCase());
            const roleMatch = p.role?.toLowerCase().includes(dropdownSearch.toLowerCase());
            return nameMatch || roleMatch;
        });
    }, [targetPersonnelList, dropdownSearch]);

    // Selected target details
    const selectedTarget = useMemo(() => {
        return personnel.find(p => p.id === targetId) || null;
    }, [personnel, targetId]);

    // Get active questions based on target's role
    const activeQuestions = useMemo(() => {
        if (!selectedTarget) return [];
        const isCam = selectedTarget.role?.toUpperCase().includes('CAM');
        let targetType = isCam ? 'CAM' : 'MACHINE';
        if (isAdmin && isCam) {
            targetType = 'CAM_BY_MANAGER';
        }
        return questions.filter(q => q.target === targetType);
    }, [selectedTarget, questions, isAdmin]);

    // Helper to check if two timestamp dates fall in the same calendar week
    const isSameCalendarWeek = (dateStr1, dateStr2) => {
        if (!dateStr1 || !dateStr2) return false;
        const getWeekKey = (str) => {
            const datePart = str.substring(0, 10);
            const dateObj = new Date(datePart);
            if (isNaN(dateObj.getTime())) return '';
            return `${dateObj.getFullYear()}-${getWeekRange(dateObj)}`;
        };
        return getWeekKey(dateStr1) === getWeekKey(dateStr2);
    };

    // Check if the current evaluator has evaluated the selected target this calendar week
    const hasEvaluatedThisWeek = useMemo(() => {
        if (!targetId || !loggedInUser) return false;
        return surveys.some(s => 
            s.evaluatorId === loggedInUser.id && 
            s.targetId === targetId && 
            isSameCalendarWeek(s.timestamp, getCurrentDateTimeString())
        );
    }, [targetId, loggedInUser, surveys]);

    // Reset ratings on target change, dynamically sizing to the number of active questions
    useEffect(() => {
        const initialRatings = {};
        activeQuestions.forEach(q => {
            initialRatings[q.id] = null;
        });
        setRatings(initialRatings);
        setComment('');
        setMessage('');
    }, [targetId, activeQuestions]);

    const handleRatingClick = (qId, val) => {
        setRatings(prev => ({ ...prev, [qId]: val }));
    };

    const isFormValid = useMemo(() => {
        return targetId !== '' && !hasEvaluatedThisWeek && activeQuestions.length > 0 && activeQuestions.every(q => ratings[q.id] !== null && ratings[q.id] !== undefined);
    }, [targetId, hasEvaluatedThisWeek, activeQuestions, ratings]);

    // Save evaluation to Firestore
    const handleSave = async (e) => {
        e.preventDefault();
        if (!isFormValid || isSaving) return;
        setIsSaving(true);

        const values = Object.values(ratings);
        const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
        const now = getCurrentDateTimeString();
        const docId = `${loggedInUser.id}-${targetId}-${Date.now()}`;

        const newSurvey = {
            id: docId,
            evaluatorId: loggedInUser.id,
            evaluatorName: loggedInUser.name,
            evaluatorRole: loggedInUser.role,
            targetId,
            targetName: selectedTarget.name,
            targetRole: selectedTarget.role || 'Tezgah Operatörü',
            ratings: { ...ratings },
            averageScore: parseFloat(avg.toFixed(2)),
            comment: comment.trim(),
            timestamp: now,
            date: now.substring(0, 10)
        };

        try {
            await setDoc(doc(db, 'operatorSurveys', docId), newSurvey);
            setMessage('Değerlendirmeniz başarıyla kaydedilmiştir. Katkınız için teşekkürler!');
            setTargetId('');
            setRatings({});
            setComment('');
        } catch (error) {
            console.error("Anket kaydetme hatası:", error);
            setMessage('Bir hata oluştu, lütfen tekrar deneyin.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteSurvey = async (surveyId) => {
        if (!window.confirm("Bu değerlendirme kaydını kalıcı olarak silmek istediğinize emin misiniz?")) return;
        try {
            await deleteDoc(doc(db, 'operatorSurveys', surveyId));
        } catch (error) {
            console.error("Değerlendirme silinemedi:", error);
        }
    };

    // Add dynamic question
    const handleAddQuestion = async (e) => {
        e.preventDefault();
        if (!newQuestionText.trim() || isQuestionSaving) return;
        setIsQuestionSaving(true);

        const qId = `custom-q-${Date.now()}`;
        const newQ = {
            id: qId,
            text: newQuestionText.trim(),
            desc: newQuestionDesc.trim(),
            target: newQuestionTarget,
            createdAt: getCurrentDateTimeString()
        };

        try {
            await setDoc(doc(db, 'operatorSurveyQuestions', qId), newQ);
            setNewQuestionText('');
            setNewQuestionDesc('');
            alert('Soru başarıyla eklendi ve tüm aktif anket formlarında devreye alındı!');
        } catch (error) {
            console.error("Soru eklenemedi:", error);
        } finally {
            setIsQuestionSaving(false);
        }
    };

    const handleDeleteQuestion = async (qId) => {
        if (!window.confirm("Bu soruyu silmek istediğinize emin misiniz? (Bu işlem eski anket cevaplarını etkilemez ancak yeni formlardan kaldırır)")) return;
        try {
            await deleteDoc(doc(db, 'operatorSurveyQuestions', qId));
        } catch (error) {
            console.error("Soru silinemedi:", error);
        }
    };

    const handleUpdateQuestion = async (qId) => {
        if (!editText.trim()) return;
        try {
            await setDoc(doc(db, 'operatorSurveyQuestions', qId), {
                text: editText.trim(),
                desc: editDesc.trim()
            }, { merge: true });
            setEditingQuestionId(null);
        } catch (error) {
            console.error("Soru güncellenemedi:", error);
        }
    };

    // --- ADMİN HESAPLAMALARI VE ANALİZLERİ ---
    const adminStats = useMemo(() => {
        const personnelStats = {};

        personnel.forEach(p => {
            if (p.role !== 'Yönetici' && p.role !== 'Admin') {
                personnelStats[p.id] = {
                    id: p.id,
                    name: p.name,
                    role: p.role || 'Tezgah Operatörü',
                    totalScore: 0,
                    count: 0,
                    questionSums: {},
                    questionCounts: {},
                    surveys: []
                };
            }
        });

        surveys.forEach(s => {
            const stats = personnelStats[s.targetId];
            if (stats) {
                stats.count += 1;
                stats.totalScore += s.averageScore;
                stats.surveys.push(s);

                // Dinamik soru bazlı puan toplamları
                Object.entries(s.ratings).forEach(([qId, val]) => {
                    stats.questionSums[qId] = (stats.questionSums[qId] || 0) + val;
                    stats.questionCounts[qId] = (stats.questionCounts[qId] || 0) + 1;
                });
            }
        });

        return Object.values(personnelStats).map(p => {
            const avg = p.count > 0 ? (p.totalScore / p.count) : 0;
            const qAverages = {};
            Object.keys(p.questionSums).forEach(qId => {
                qAverages[qId] = parseFloat((p.questionSums[qId] / p.questionCounts[qId]).toFixed(2));
            });

            return {
                ...p,
                average: parseFloat(avg.toFixed(2)),
                qAverages
            };
        }).sort((a, b) => b.average - a.average);
    }, [surveys, personnel]);

    const filteredAdminStats = useMemo(() => {
        if (!searchTerm.trim()) return adminStats;
        const queryStr = searchTerm.toLowerCase().trim();
        return adminStats.filter(p => 
            p.name.toLowerCase().includes(queryStr) || 
            p.role.toLowerCase().includes(queryStr)
        );
    }, [adminStats, searchTerm]);

    const selectedPersonStats = useMemo(() => {
        if (!selectedPersonnelId) return null;
        return adminStats.find(p => p.id === selectedPersonnelId) || null;
    }, [adminStats, selectedPersonnelId]);

    // --- ZAMAN SERİSİ / PERFORMANS EĞRİSİ HESAPLAMA ---
    const performanceTrendData = useMemo(() => {
        if (!selectedPersonStats || selectedPersonStats.surveys.length === 0) return [];
        
        const groups = {};
        
        selectedPersonStats.surveys.forEach(s => {
            const date = new Date(s.timestamp);
            if (isNaN(date.getTime())) return;
            
            let key = '';
            let sortVal = date.getTime();
            
            if (trendPeriod === 'weekly') {
                key = getWeekRange(date);
            } else if (trendPeriod === 'monthly') {
                key = getMonthName(date);
            } else {
                key = String(date.getFullYear());
            }
            
            if (!groups[key]) {
                groups[key] = { key, sum: 0, count: 0, sortVal };
            }
            groups[key].sum += s.averageScore;
            groups[key].count += 1;
            // En erken kayda göre sıralama desteği
            if (sortVal < groups[key].sortVal) {
                groups[key].sortVal = sortVal;
            }
        });
        
        return Object.values(groups)
            .sort((a, b) => a.sortVal - b.sortVal)
            .map(item => ({
                name: item.key,
                "Ortalama Performans": parseFloat((item.sum / item.count).toFixed(2))
            }));
    }, [selectedPersonStats, trendPeriod]);

    // Genel Ortak Sorunlar Analizi
    const commonIssuesAnalysis = useMemo(() => {
        const camIssues = [];
        const machineIssues = [];

        const camQStats = {};
        const machineQStats = {};

        surveys.forEach(s => {
            const isCam = s.targetRole?.toUpperCase().includes('CAM');
            const stats = isCam ? camQStats : machineQStats;

            Object.entries(s.ratings).forEach(([qId, val]) => {
                if (!stats[qId]) stats[qId] = { sum: 0, count: 0 };
                stats[qId].sum += val;
                stats[qId].count += 1;
            });
        });

        const allCamQuestions = questions.filter(q => q.target === 'CAM' || q.target === 'CAM_BY_MANAGER');
        const allMachineQuestions = questions.filter(q => q.target === 'MACHINE');

        allCamQuestions.forEach(q => {
            const stat = camQStats[q.id];
            if (stat) {
                const avg = stat.sum / stat.count;
                if (avg < 3.8) {
                    camIssues.push({
                        question: q.text,
                        desc: q.desc,
                        average: parseFloat(avg.toFixed(2)),
                        count: stat.count,
                        level: avg < 3.0 ? 'CRITICAL' : 'WARNING'
                    });
                }
            }
        });

        allMachineQuestions.forEach(q => {
            const stat = machineQStats[q.id];
            if (stat) {
                const avg = stat.sum / stat.count;
                if (avg < 3.8) {
                    machineIssues.push({
                        question: q.text,
                        desc: q.desc,
                        average: parseFloat(avg.toFixed(2)),
                        count: stat.count,
                        level: avg < 3.0 ? 'CRITICAL' : 'WARNING'
                    });
                }
            }
        });

        const criticalComments = [];
        const keywords = ['çarp', 'dalma', 'hata', 'yanlış', 'eksik', 'kirli', 'temiz', 'geç', 'yavaş', 'iletişim'];
        surveys.forEach(s => {
            if (s.comment && s.comment.length > 5) {
                const lowerComment = s.comment.toLowerCase();
                const matched = keywords.some(k => lowerComment.includes(k));
                if (matched) {
                    criticalComments.push(s);
                }
            }
        });

        return {
            camIssues: camIssues.sort((a, b) => a.average - b.average),
            machineIssues: machineIssues.sort((a, b) => a.average - b.average),
            criticalComments: criticalComments.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        };
    }, [surveys, questions]);

    const renderEvaluationForm = () => {
        return (
            <div className="max-w-3xl mx-auto">
                {message && (
                    <div className="mb-6 p-4 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-250 dark:border-emerald-900/50 rounded-xl text-emerald-800 dark:text-emerald-300 font-bold text-sm text-center flex items-center justify-center gap-2">
                        <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0" />
                        {message}
                    </div>
                )}

                <form onSubmit={handleSave} className="bg-white dark:bg-gray-800 p-6 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm space-y-6">
                    <h3 className="text-lg font-black text-gray-855 dark:text-white border-b dark:border-gray-700 pb-3 flex items-center gap-2">
                        <Star className="w-5 h-5 text-orange-500" /> Yeni Değerlendirme Formu
                    </h3>

                    {/* Personel Seçimi */}
                    <div className="space-y-2">
                        <label className="block text-xs font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider">Değerlendirilecek Personel Seçin</label>
                        
                        <div className="relative">
                            {/* Dropdown Toggle Button */}
                            <button
                                type="button"
                                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                                className="w-full p-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-xs outline-none focus:ring-2 focus:ring-orange-500 font-bold flex justify-between items-center transition shadow-sm"
                            >
                                <span>
                                    {selectedTarget ? `${selectedTarget.name} (${selectedTarget.role || 'Tezgah Operatörü'})` : 'Değerlendirilecek Personel Seçin...'}
                                </span>
                                <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`} />
                            </button>

                            {/* Dropdown Menu */}
                            {isDropdownOpen && (
                                <div className="absolute z-50 mt-1.5 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl p-2.5 space-y-2">
                                    <div className="relative">
                                        <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-gray-400" />
                                        <input 
                                            type="text" 
                                            placeholder="İsim veya rol ara..." 
                                            value={dropdownSearch} 
                                            onChange={(e) => setDropdownSearch(e.target.value)} 
                                            className="w-full pl-8 pr-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white text-xs outline-none focus:ring-2 focus:ring-orange-500 font-bold"
                                        />
                                    </div>
                                    
                                    <div className="max-h-48 overflow-y-auto space-y-1 custom-scrollbar pt-1">
                                        {filteredDropdownList.length === 0 ? (
                                            <div className="text-center py-4 text-xs text-gray-400 dark:text-gray-500 italic">Sonuç bulunamadı</div>
                                        ) : (
                                            filteredDropdownList.map(p => {
                                                const evaluatedThisWeek = surveys.some(s => 
                                                    s.evaluatorId === loggedInUser?.id && 
                                                    s.targetId === p.id && 
                                                    isSameCalendarWeek(s.timestamp, getCurrentDateTimeString())
                                                );
                                                
                                                const evaluatedEver = surveys.some(s => 
                                                    s.evaluatorId === loggedInUser?.id && 
                                                    s.targetId === p.id
                                                );

                                                return (
                                                    <button
                                                        key={p.id}
                                                        type="button"
                                                        onClick={() => {
                                                            setTargetId(p.id);
                                                            setIsDropdownOpen(false);
                                                            setDropdownSearch('');
                                                        }}
                                                        className={`w-full flex items-center justify-between p-2 rounded-lg text-left text-xs transition-colors ${
                                                            targetId === p.id 
                                                                ? 'bg-orange-500 text-white font-bold' 
                                                                : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-755 dark:text-gray-300'
                                                        }`}
                                                    >
                                                        <div>
                                                            <div className="font-bold">{p.name}</div>
                                                            <div className={`text-[9px] ${targetId === p.id ? 'text-orange-100' : 'text-gray-450 dark:text-gray-400'}`}>{p.role || 'Tezgah Operatörü'}</div>
                                                        </div>
                                                        
                                                        <div className="flex gap-1.5 shrink-0">
                                                            {evaluatedThisWeek ? (
                                                                <span className="text-[8px] font-black bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400 px-1.5 py-0.5 rounded border border-red-200/50 dark:border-red-900/30">
                                                                    BU HAFTA YAPILDI
                                                                </span>
                                                            ) : evaluatedEver ? (
                                                                <span className="text-[8px] font-black bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-200/50 dark:border-emerald-900/30">
                                                                    DEĞERLENDİRİLDİ
                                                                </span>
                                                            ) : (
                                                                <span className="text-[8px] font-black bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 px-1.5 py-0.5 rounded border border-gray-200/50 dark:border-gray-650">
                                                                    YAPILMADI
                                                                </span>
                                                            )}
                                                        </div>
                                                    </button>
                                                );
                                            })
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {selectedTarget && (
                        <>
                            {hasEvaluatedThisWeek ? (
                                <div className="p-6 bg-red-50 dark:bg-red-950/15 border border-red-200 dark:border-red-900/30 rounded-xl text-center space-y-3 shadow-sm">
                                    <AlertTriangle className="w-12 h-12 text-red-500 mx-auto animate-pulse" />
                                    <h4 className="font-extrabold text-sm text-red-800 dark:text-red-455">Haftalık Limit Aşıldı</h4>
                                    <p className="text-xs text-gray-650 dark:text-gray-400 leading-relaxed max-w-md mx-auto">
                                        <strong>{selectedTarget.name}</strong> personeli için bu hafta zaten değerlendirme yaptınız. Kurallar gereği her personel haftada en fazla 1 kez değerlendirilebilir. Yeni değerlendirme yapabilmek için pazartesi gününü beklemelisiniz.
                                    </p>
                                </div>
                            ) : (
                                <>
                                    <div className="p-4 bg-orange-50/50 dark:bg-orange-950/10 border border-orange-100 dark:border-orange-900/30 rounded-xl text-xs text-orange-800 dark:text-orange-300 font-semibold leading-relaxed flex gap-2">
                                        <Info className="w-4.5 h-4.5 text-orange-500 shrink-0 mt-0.5" />
                                        <span>
                                            <strong>{selectedTarget.name}</strong> personeli için CNC Freze atölyesi iş standartlarına uygun soruları aşağıda değerlendirin.
                                        </span>
                                    </div>

                                    {/* Sorular */}
                                    <div className="space-y-6 pt-2">
                                        {activeQuestions.map((q, idx) => (
                                            <div key={q.id} className="space-y-2.5 p-4 bg-gray-50 dark:bg-gray-700/30 rounded-xl border border-gray-200/50 dark:border-gray-700/50">
                                                <div>
                                                    <h4 className="text-xs font-black text-gray-855 dark:text-white">{idx + 1}. {q.text}</h4>
                                                    <p className="text-[10px] text-gray-450 dark:text-gray-400 mt-0.5">{q.desc}</p>
                                                </div>
                                                
                                                <div className="flex gap-2">
                                                    {[1, 2, 3, 4, 5].map((val) => {
                                                        const isSelected = ratings[q.id] === val;
                                                        return (
                                                            <button
                                                                key={val}
                                                                type="button"
                                                                onClick={() => handleRatingClick(q.id, val)}
                                                                className={`flex-1 py-2.5 rounded-lg border font-black text-xs transition-all ${
                                                                    isSelected 
                                                                        ? 'bg-blue-600 border-blue-600 text-white shadow scale-105' 
                                                                        : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-blue-300'
                                                                }`}
                                                            >
                                                                {val}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        ))}

                                        {/* Yorum Alanı */}
                                        <div className="space-y-2">
                                            <label className="block text-xs font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider">Yorum / Öneri (Opsiyonel)</label>
                                            <textarea
                                                value={comment}
                                                onChange={(e) => setComment(e.target.value)}
                                                rows="3"
                                                placeholder="Değerlendirdiğiniz personel hakkında varsa geri bildirim ve ek notlarınızı buraya yazın..."
                                                className="w-full p-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-xs outline-none focus:ring-2 focus:ring-orange-500 font-bold"
                                            ></textarea>
                                        </div>

                                        <button
                                            type="submit"
                                            disabled={!isFormValid || isSaving}
                                            className="w-full bg-green-600 hover:bg-green-700 active:bg-green-800 text-white font-bold py-4 rounded-xl text-sm shadow-md transition disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed"
                                        >
                                            {isSaving ? 'Kaydediliyor...' : 'Değerlendirmeyi Gönder'}
                                        </button>
                                    </div>
                                </>
                            )}
                        </>
                    )}
                </form>
            </div>
        );
    };

    return (
        <div className="space-y-6">
            
            {/* Sayfa Başlığı */}
            <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-black text-gray-900 dark:text-white flex items-center gap-3">
                        <ClipboardCheck className="w-8 h-8 text-orange-500" /> Anket ve Değerlendirmeler
                    </h1>
                    <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
                        Atölye içi iş koordinasyonu, program kalitesi ve operasyonel performansı değerlendirme paneli.
                    </p>
                </div>
                
                {isAdmin && (
                    <div className="flex bg-gray-100 dark:bg-gray-700 p-1 rounded-xl border dark:border-gray-600 shrink-0 overflow-x-auto">
                        <button 
                            onClick={() => setAdminActiveTab('summary')}
                            className={`py-2 px-4 text-xs font-black rounded-lg transition-all ${
                                adminActiveTab === 'summary' 
                                    ? 'bg-white dark:bg-gray-600 text-orange-600 dark:text-white shadow' 
                                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'
                            }`}
                        >
                            Özet Puanlar
                        </button>
                        <button 
                            onClick={() => {
                                setAdminActiveTab('details');
                                if (!selectedPersonnelId && adminStats.length > 0) {
                                    setSelectedPersonnelId(adminStats[0].id);
                                }
                            }}
                            className={`py-2 px-4 text-xs font-black rounded-lg transition-all ${
                                adminActiveTab === 'details' 
                                    ? 'bg-white dark:bg-gray-600 text-orange-600 dark:text-white shadow' 
                                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'
                            }`}
                        >
                            Performans Eğrisi
                        </button>
                        <button 
                            onClick={() => setAdminActiveTab('common_issues')}
                            className={`py-2 px-4 text-xs font-black rounded-lg transition-all ${
                                adminActiveTab === 'common_issues' 
                                    ? 'bg-white dark:bg-gray-600 text-orange-600 dark:text-white shadow' 
                                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'
                            }`}
                        >
                            Ortak Sorunlar
                        </button>
                        <button 
                            onClick={() => setAdminActiveTab('questions')}
                            className={`py-2 px-4 text-xs font-black rounded-lg transition-all flex items-center gap-1.5 ${
                                adminActiveTab === 'questions' 
                                    ? 'bg-white dark:bg-gray-600 text-orange-600 dark:text-white shadow' 
                                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'
                            }`}
                        >
                            <Settings2 className="w-3.5 h-3.5" /> Soru Ekle / Yönet
                        </button>
                        <button 
                            onClick={() => setAdminActiveTab('evaluate')}
                            className={`py-2 px-4 text-xs font-black rounded-lg transition-all flex items-center gap-1.5 ${
                                adminActiveTab === 'evaluate' 
                                    ? 'bg-white dark:bg-gray-600 text-orange-600 dark:text-white shadow' 
                                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'
                            }`}
                        >
                            <ClipboardCheck className="w-3.5 h-3.5" /> Değerlendirme Yap
                        </button>
                    </div>
                )}
            </div>

            {/* ADMİN EKRANI VE KULLANICI EKRANI AYRIMI */}
            {isAdmin ? (
                // ================= ADMİN EKSELENİ =================
                <div className="space-y-6">
                    {adminActiveTab === 'summary' && (
                        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
                            <div className="p-5 border-b border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row justify-between items-center gap-4 bg-gray-50/50 dark:bg-gray-900/50">
                                <h3 className="font-extrabold text-sm text-gray-800 dark:text-white flex items-center gap-2">
                                    <Award className="w-5 h-5 text-orange-500" /> Operatör Performans Özet Sıralaması
                                </h3>
                                <div className="relative w-full sm:w-64">
                                    <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                                    <input 
                                        type="text" 
                                        placeholder="Personel ara..." 
                                        value={searchTerm} 
                                        onChange={(e) => setSearchTerm(e.target.value)} 
                                        className="w-full pl-9 pr-4 py-2 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-xs outline-none focus:ring-2 focus:ring-orange-500 font-bold" 
                                    />
                                </div>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-xs">
                                    <thead className="bg-gray-50 dark:bg-gray-900/50">
                                        <tr>
                                            <th className="px-6 py-3.5 text-left font-black text-gray-500 dark:text-gray-400 uppercase">İsim Soyisim</th>
                                            <th className="px-6 py-3.5 text-left font-black text-gray-500 dark:text-gray-400 uppercase">Rol</th>
                                            <th className="px-6 py-3.5 text-center font-black text-gray-500 dark:text-gray-400 uppercase">Yapılan Değerlendirme</th>
                                            <th className="px-6 py-3.5 text-center font-black text-gray-500 dark:text-gray-400 uppercase">Ortalama Puan</th>
                                            <th className="px-6 py-3.5 text-center font-black text-gray-500 dark:text-gray-400 uppercase">Aksiyon</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                                        {filteredAdminStats.map((p, idx) => (
                                            <tr key={p.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition">
                                                <td className="px-6 py-4 whitespace-nowrap font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                                    <span className="text-gray-400 font-normal w-5">#{idx + 1}</span>
                                                    {p.name}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap font-semibold text-gray-500 dark:text-gray-400">
                                                    {p.role}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-center font-black text-gray-800 dark:text-gray-200">
                                                    {p.count > 0 ? `${p.count} adet` : <span className="text-gray-400 font-normal italic">Henüz yok</span>}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-center font-black">
                                                    {p.count > 0 ? (
                                                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs ${
                                                            p.average >= 4.0 
                                                                ? 'bg-green-500/10 text-green-600 dark:text-green-400' 
                                                                : p.average >= 3.0 
                                                                ? 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400'
                                                                : 'bg-red-500/10 text-red-600 dark:text-red-400'
                                                        }`}>
                                                            <Star className="w-3.5 h-3.5 fill-current" />
                                                            {p.average} / 5.0
                                                        </span>
                                                    ) : (
                                                        <span className="text-gray-400">-</span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-center">
                                                    <button
                                                        onClick={() => {
                                                            setSelectedPersonnelId(p.id);
                                                            setAdminActiveTab('details');
                                                        }}
                                                        className="text-xs font-black text-orange-600 dark:text-orange-400 hover:underline flex items-center gap-1 mx-auto"
                                                    >
                                                        Detaylar <ChevronRight className="w-3 h-3" />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {adminActiveTab === 'details' && (
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            {/* Personel Listesi */}
                            <div className="lg:col-span-1 bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm flex flex-col max-h-[650px]">
                                <h3 className="font-extrabold text-sm text-gray-800 dark:text-white mb-3">Personel Seçimi</h3>
                                <div className="space-y-1.5 overflow-y-auto flex-1 custom-scrollbar">
                                    {adminStats.map(p => (
                                        <button
                                            key={p.id}
                                            onClick={() => setSelectedPersonnelId(p.id)}
                                            className={`w-full flex items-center justify-between p-3 rounded-lg border transition-all text-left ${
                                                selectedPersonnelId === p.id 
                                                    ? 'bg-orange-500 text-white font-bold border-orange-500 shadow' 
                                                    : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-orange-300'
                                            }`}
                                        >
                                            <div className="min-w-0 flex-1">
                                                <div className="text-sm truncate font-bold">{p.name}</div>
                                                <div className={`text-[10px] truncate ${selectedPersonnelId === p.id ? 'text-orange-100' : 'text-gray-400'}`}>{p.role}</div>
                                            </div>
                                            {p.count > 0 && (
                                                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                                                    selectedPersonnelId === p.id ? 'bg-white/20 text-white' : 'bg-orange-50 dark:bg-orange-950/20 text-orange-600'
                                                }`}>
                                                    {p.average} ★
                                                </span>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Detay Paneli */}
                            <div className="lg:col-span-2 space-y-6">
                                {selectedPersonStats ? (
                                    <>
                                        {/* 1. PERFORMANS EĞRİSİ GRAFİĞİ */}
                                        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm space-y-4">
                                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b dark:border-gray-700 pb-3">
                                                <div>
                                                    <h3 className="font-extrabold text-sm text-gray-800 dark:text-white flex items-center gap-2">
                                                        <Calendar className="w-4.5 h-4.5 text-orange-500" /> Performans Eğrisi (Zaman Serisi)
                                                    </h3>
                                                    <p className="text-[10px] text-gray-450 dark:text-gray-400 mt-0.5">Operatörün puan gelişim grafiği</p>
                                                </div>
                                                
                                                {/* Zaman Period Seçimi */}
                                                <div className="flex bg-gray-100 dark:bg-gray-700 p-1 rounded-lg border dark:border-gray-700 shrink-0 text-[10px] font-bold">
                                                    <button 
                                                        onClick={() => setTrendPeriod('weekly')}
                                                        className={`py-1 px-3 rounded ${trendPeriod === 'weekly' ? 'bg-white dark:bg-gray-600 text-orange-600 dark:text-white shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                                                    >
                                                        Haftalık
                                                    </button>
                                                    <button 
                                                        onClick={() => setTrendPeriod('monthly')}
                                                        className={`py-1 px-3 rounded ${trendPeriod === 'monthly' ? 'bg-white dark:bg-gray-600 text-orange-600 dark:text-white shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                                                    >
                                                        Aylık
                                                    </button>
                                                    <button 
                                                        onClick={() => setTrendPeriod('yearly')}
                                                        className={`py-1 px-3 rounded ${trendPeriod === 'yearly' ? 'bg-white dark:bg-gray-600 text-orange-600 dark:text-white shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                                                    >
                                                        Yıllık
                                                    </button>
                                                </div>
                                            </div>

                                            {performanceTrendData.length === 0 ? (
                                                <p className="text-xs text-gray-400 dark:text-gray-500 italic py-6 text-center">Bu periyot kırılımı için yeterli eğri verisi bulunmuyor.</p>
                                            ) : (
                                                <div className="h-56 w-full pt-2">
                                                    <ResponsiveContainer width="100%" height="100%">
                                                        <LineChart data={performanceTrendData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" className="dark:stroke-gray-700" />
                                                            <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#6B7280' }} />
                                                            <YAxis domain={[1, 5]} tickCount={5} tick={{ fontSize: 9, fill: '#6B7280' }} />
                                                            <Tooltip contentStyle={{ fontSize: '10px', borderRadius: '8px' }} />
                                                            <Line type="monotone" dataKey="Ortalama Performans" stroke="#F97316" strokeWidth={3} activeDot={{ r: 6 }} />
                                                        </LineChart>
                                                    </ResponsiveContainer>
                                                </div>
                                            )}
                                        </div>

                                        {/* Soru Bazlı Grafikler/Ortalamalar */}
                                        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm space-y-6">
                                            <div className="border-b dark:border-gray-700 pb-4">
                                                <h2 className="text-xl font-black text-gray-900 dark:text-white">{selectedPersonStats.name}</h2>
                                                <p className="text-xs text-gray-450 dark:text-gray-400 mt-1">{selectedPersonStats.role} • Toplam {selectedPersonStats.count} Değerlendirme</p>
                                            </div>

                                            <div className="space-y-4">
                                                <h3 className="font-extrabold text-sm text-gray-850 dark:text-white flex items-center gap-2">
                                                    <Info className="w-4 h-4 text-orange-500" /> Soru Bazlı Genel Puan Dağılımı
                                                </h3>
                                                <div className="space-y-3">
                                                    {(selectedPersonStats.role?.toUpperCase().includes('CAM') 
                                                        ? questions.filter(q => q.target === 'CAM' || q.target === 'CAM_BY_MANAGER') 
                                                        : questions.filter(q => q.target === 'MACHINE')
                                                    ).map((q, idx) => {
                                                        const score = selectedPersonStats.qAverages[q.id] || 0;
                                                        const percent = (score / 5) * 100;
                                                        return (
                                                            <div key={q.id} className="space-y-1">
                                                                <div className="flex justify-between text-xs font-bold text-gray-750 dark:text-gray-300">
                                                                    <span>{idx + 1}. {q.text}</span>
                                                                    <span className="text-orange-600 dark:text-orange-400">{score > 0 ? `${score} / 5.0` : 'Veri Yok'}</span>
                                                                </div>
                                                                <div className="h-2 w-full bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                                                                    {score > 0 && (
                                                                        <div 
                                                                            className={`h-full rounded-full transition-all duration-300 ${
                                                                                score >= 4.0 ? 'bg-green-500' : score >= 3.0 ? 'bg-yellow-500' : 'bg-red-500'
                                                                            }`}
                                                                            style={{ width: `${percent}%` }}
                                                                        />
                                                                    )}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Yorumlar ve Bireysel Formlar */}
                                        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
                                            <div className="p-5 border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/50">
                                                <h3 className="font-extrabold text-sm text-gray-850 dark:text-white flex items-center gap-2">
                                                    <MessageSquare className="w-5 h-5 text-orange-500" /> Yapılan Değerlendirmeler ve Yorumlar
                                                </h3>
                                            </div>

                                            <div className="divide-y divide-gray-100 dark:divide-gray-700 p-5 space-y-4 max-h-[350px] overflow-y-auto custom-scrollbar">
                                                {selectedPersonStats.surveys.length === 0 ? (
                                                    <p className="text-xs text-gray-400 dark:text-gray-500 italic text-center py-6">Personel için yapılmış bir değerlendirme bulunmuyor.</p>
                                                ) : (
                                                    selectedPersonStats.surveys.map(s => (
                                                        <div key={s.id} className="pt-4 first:pt-0 space-y-2 relative group">
                                                            <button 
                                                                onClick={() => handleDeleteSurvey(s.id)}
                                                                className="absolute top-0 right-0 p-1.5 text-gray-400 hover:text-red-500 rounded opacity-0 group-hover:opacity-100 transition-all"
                                                                title="Değerlendirmeyi Sil"
                                                            >
                                                                <Trash2 className="w-4 h-4" />
                                                            </button>

                                                            <div className="flex justify-between items-center text-xs font-bold">
                                                                <span className="text-gray-750 dark:text-gray-300">Değerlendiren: {s.evaluatorName} <span className="text-gray-400 font-normal">({s.evaluatorRole})</span></span>
                                                                <span className="text-orange-600 bg-orange-50 dark:bg-orange-950/20 px-2 py-0.5 rounded font-black">{s.averageScore} ★</span>
                                                            </div>

                                                            {s.comment && (
                                                                <p className="text-xs text-gray-600 dark:text-gray-350 bg-gray-50 dark:bg-gray-900/40 p-3 rounded-lg border dark:border-gray-700 italic">
                                                                    "{s.comment}"
                                                                </p>
                                                            )}
                                                            <div className="text-[10px] text-gray-400">{new Date(s.timestamp).toLocaleString('tr-TR')}</div>
                                                        </div>
                                                    ))
                                                )}
                                            </div>
                                        </div>
                                    </>
                                ) : (
                                    <div className="bg-white dark:bg-gray-800 p-12 text-center border border-gray-200 dark:border-gray-700 rounded-xl">
                                        <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                                        <h3 className="font-bold text-gray-800 dark:text-gray-350">Personel Seçilmedi</h3>
                                        <p className="text-xs text-gray-450 mt-1">Detayları ve performans eğrisini görmek için sol panelden bir personel seçiniz.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {adminActiveTab === 'common_issues' && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Düşük Puan Alan Alanlar */}
                            <div className="bg-white dark:bg-gray-800 p-5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm space-y-4">
                                <h3 className="font-extrabold text-sm text-gray-800 dark:text-white flex items-center gap-2">
                                    <TrendingDown className="w-5 h-5 text-red-500" /> Gözlem Altındaki Konular (Ortalaması Zayıf Alanlar)
                                </h3>

                                <div className="space-y-4">
                                    {/* CAM Zayıf Noktalar */}
                                    <div>
                                        <h4 className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">CAM OPERASYONLARI</h4>
                                        {commonIssuesAnalysis.camIssues.length === 0 ? (
                                            <p className="text-xs text-green-600 dark:text-green-400 font-bold bg-green-500/10 p-3 rounded-lg">✓ CAM operasyonlarında kritik seviyede düşük puanlı bir alan bulunmuyor.</p>
                                        ) : (
                                            <div className="space-y-2.5">
                                                {commonIssuesAnalysis.camIssues.map(issue => (
                                                    <div key={issue.question} className="p-3.5 bg-red-50/50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30 rounded-xl flex justify-between items-center gap-4">
                                                        <div className="min-w-0 flex-1">
                                                            <div className="text-xs font-extrabold text-gray-900 dark:text-gray-100">{issue.question}</div>
                                                            <div className="text-[10px] text-gray-550 dark:text-gray-400 mt-1 leading-normal">{issue.desc}</div>
                                                        </div>
                                                        <span className="shrink-0 text-xs font-black text-red-700 dark:text-red-400 bg-red-100 dark:bg-red-950 px-3 py-1 rounded-lg border border-red-200 dark:border-red-900/50 shadow-sm">
                                                            {issue.average} / 5
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {/* Tezgah Zayıf Noktalar */}
                                    <div className="pt-2">
                                        <h4 className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">TEZGAH / ATÖLYE OPERASYONLARI</h4>
                                        {commonIssuesAnalysis.machineIssues.length === 0 ? (
                                            <p className="text-xs text-green-600 dark:text-green-400 font-bold bg-green-500/10 p-3 rounded-lg">✓ Tezgah/Atölye operasyonlarında kritik seviyede düşük puanlı bir alan bulunmuyor.</p>
                                        ) : (
                                            <div className="space-y-2.5">
                                                {commonIssuesAnalysis.machineIssues.map(issue => (
                                                    <div key={issue.question} className="p-3.5 bg-red-50/50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30 rounded-xl flex justify-between items-center gap-4">
                                                        <div className="min-w-0 flex-1">
                                                            <div className="text-xs font-extrabold text-gray-900 dark:text-gray-100">{issue.question}</div>
                                                            <div className="text-[10px] text-gray-550 dark:text-gray-400 mt-1 leading-normal">{issue.desc}</div>
                                                        </div>
                                                        <span className="shrink-0 text-xs font-black text-red-700 dark:text-red-400 bg-red-100 dark:bg-red-950 px-3 py-1 rounded-lg border border-red-200 dark:border-red-900/50 shadow-sm">
                                                            {issue.average} / 5
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Kritik Yorumlar */}
                            <div className="bg-white dark:bg-gray-800 p-5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm space-y-4">
                                <h3 className="font-extrabold text-sm text-gray-800 dark:text-white flex items-center gap-2">
                                    <AlertTriangle className="w-5 h-5 text-orange-500 animate-pulse" /> Önemli Yorumlar & Şikayet İpuçları
                                </h3>

                                <div className="space-y-3 max-h-[550px] overflow-y-auto custom-scrollbar">
                                    {commonIssuesAnalysis.criticalComments.length === 0 ? (
                                        <p className="text-xs text-gray-400 dark:text-gray-500 italic text-center py-8">Kritik anahtar kelime içeren bir geri bildirim yorumu bulunmuyor.</p>
                                    ) : (
                                        commonIssuesAnalysis.criticalComments.map(s => (
                                            <div key={s.id} className="p-3.5 bg-yellow-50/60 dark:bg-yellow-950/15 border border-yellow-250 dark:border-yellow-900/30 rounded-xl space-y-2">
                                                <div className="flex justify-between items-center text-xs font-bold text-gray-800 dark:text-gray-200">
                                                    <span>Değerlendirilen: <span className="text-orange-600 dark:text-orange-400 font-extrabold">{s.targetName}</span> <span className="text-gray-500 dark:text-gray-400 font-normal">({s.targetRole})</span></span>
                                                    <span className="bg-yellow-100 dark:bg-yellow-950/65 text-yellow-800 dark:text-yellow-400 px-2 py-0.5 rounded font-black text-[10px]">{s.averageScore} ★</span>
                                                </div>
                                                <p className="text-xs text-gray-800 dark:text-gray-150 italic bg-white dark:bg-gray-900 p-2.5 rounded border border-gray-100 dark:border-gray-700">
                                                    "{s.comment}"
                                                </p>
                                                <div className="flex justify-between text-[9px] text-gray-500 dark:text-gray-400">
                                                    <span>Yazan: {s.evaluatorName}</span>
                                                    <span>{new Date(s.timestamp).toLocaleString('tr-TR')}</span>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {adminActiveTab === 'questions' && (
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            {/* Yeni Soru Ekleme Formu */}
                            <div className="lg:col-span-1 bg-white dark:bg-gray-800 p-5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm space-y-4">
                                <h3 className="font-extrabold text-sm text-gray-800 dark:text-white flex items-center gap-2 border-b dark:border-gray-700 pb-2">
                                    <Plus className="w-5 h-5 text-orange-500" /> Yeni Soru Ekle
                                </h3>
                                
                                <form onSubmit={handleAddQuestion} className="space-y-4">
                                    <div className="space-y-1">
                                        <label className="block text-xs font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider">Soru Metni</label>
                                        <input 
                                            type="text" 
                                            required
                                            value={newQuestionText}
                                            onChange={(e) => setNewQuestionText(e.target.value)}
                                            placeholder="Örn: Sıfırlama ve Hizalama Hassasiyeti"
                                            className="w-full p-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-xs outline-none focus:ring-2 focus:ring-orange-500 font-bold"
                                        />
                                    </div>

                                    <div className="space-y-1">
                                        <label className="block text-xs font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider">Açıklama / Detay</label>
                                        <textarea 
                                            value={newQuestionDesc}
                                            onChange={(e) => setNewQuestionDesc(e.target.value)}
                                            placeholder="Örn: Parça sıfırlarının ve bağlama hassasiyetlerinin kurallara uygunluğu"
                                            rows="3"
                                            className="w-full p-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-xs outline-none focus:ring-2 focus:ring-orange-500 font-bold"
                                        />
                                    </div>

                                    <div className="space-y-1">
                                        <label className="block text-xs font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider">Değerlendirilecek Rol (Hedef)</label>
                                        <select
                                            value={newQuestionTarget}
                                            onChange={(e) => setNewQuestionTarget(e.target.value)}
                                            className="w-full p-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-xs outline-none focus:ring-2 focus:ring-orange-500 font-bold"
                                        >
                                            <option value="MACHINE" className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-bold">Tezgah Operatörleri İçin</option>
                                            <option value="CAM" className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-bold">CAM Operatörleri İçin (Tezgah Operatörü Puanlar)</option>
                                            <option value="CAM_BY_MANAGER" className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-bold">CAM Operatörleri İçin (Yönetici Puanlar)</option>
                                        </select>
                                    </div>

                                    <button
                                        type="submit"
                                        disabled={isQuestionSaving || !newQuestionText.trim()}
                                        className="w-full bg-orange-500 hover:bg-orange-600 text-white font-black py-3 rounded-xl text-xs transition shadow disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed"
                                    >
                                        {isQuestionSaving ? 'Kaydediliyor...' : 'Soruyu Ekle ve Devreye Al'}
                                    </button>
                                </form>
                            </div>
                            <div className="lg:col-span-2 bg-white dark:bg-gray-800 p-5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm space-y-4">
                                <h3 className="font-extrabold text-sm text-gray-850 dark:text-white flex items-center gap-2 border-b dark:border-gray-700 pb-2">
                                    <Settings2 className="w-5 h-5 text-orange-500" /> Aktif Soru Setleri ve Yönetim
                                </h3>

                                <div className="space-y-4 max-h-[500px] overflow-y-auto custom-scrollbar">
                                    {/* CAM Soru Seti */}
                                    <div>
                                        <h4 className="text-xs font-black text-gray-400 uppercase tracking-wider mb-2">CAM Değerlendirme Soruları</h4>
                                        <div className="space-y-2">
                                            {questions.filter(q => q.target === 'CAM').map((q, idx) => {
                                                const isEditing = editingQuestionId === q.id;
                                                return (
                                                    <div key={q.id} className="p-3.5 bg-gray-50/50 dark:bg-gray-900/50 rounded-xl border border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                                                        {isEditing ? (
                                                            <div className="flex-1 w-full space-y-2">
                                                                <input 
                                                                    type="text" 
                                                                    value={editText} 
                                                                    onChange={(e) => setEditText(e.target.value)} 
                                                                    className="w-full p-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-xs font-bold text-gray-900 dark:text-white"
                                                                />
                                                                <input 
                                                                    type="text" 
                                                                    value={editDesc} 
                                                                    onChange={(e) => setEditDesc(e.target.value)} 
                                                                    className="w-full p-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-xs text-gray-900 dark:text-white"
                                                                />
                                                                <div className="flex gap-2 justify-end">
                                                                    <button 
                                                                        onClick={() => setEditingQuestionId(null)}
                                                                        className="px-3 py-1 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded text-[10px] font-bold text-gray-700 dark:text-gray-300"
                                                                    >
                                                                        İptal
                                                                    </button>
                                                                    <button 
                                                                        onClick={() => handleUpdateQuestion(q.id)}
                                                                        className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-[10px] font-bold"
                                                                    >
                                                                        Kaydet
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <>
                                                                <div className="min-w-0 flex-1">
                                                                    <div className="text-xs font-bold text-gray-850 dark:text-white flex items-center gap-2">
                                                                        <span>{idx + 1}. {q.text}</span>
                                                                        <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${
                                                                            q.isSystem 
                                                                                ? 'text-blue-500 bg-blue-50 dark:bg-blue-950/45' 
                                                                                : 'text-orange-500 bg-orange-50 dark:bg-orange-950/45'
                                                                        }`}>
                                                                            {q.isSystem ? 'SİSTEM' : 'ÖZEL'}
                                                                        </span>
                                                                    </div>
                                                                    <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-1 leading-normal">{q.desc}</div>
                                                                </div>
                                                                <div className="flex gap-2 shrink-0">
                                                                    <button 
                                                                        onClick={() => {
                                                                            setEditingQuestionId(q.id);
                                                                            setEditText(q.text);
                                                                            setEditDesc(q.desc);
                                                                        }}
                                                                        className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 p-1.5 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 hover:scale-105 transition-all"
                                                                        title="Soruyu Düzenle"
                                                                    >
                                                                        <Edit3 className="w-4 h-4" />
                                                                    </button>
                                                                    <button 
                                                                        onClick={() => handleDeleteQuestion(q.id)}
                                                                        className="text-red-650 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 p-1.5 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 hover:scale-105 transition-all"
                                                                        title="Soruyu Sil"
                                                                    >
                                                                        <Trash2 className="w-4 h-4" />
                                                                    </button>
                                                                </div>
                                                            </>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* CAM Yönetici Soru Seti */}
                                    <div className="pt-2">
                                        <h4 className="text-xs font-black text-gray-400 uppercase tracking-wider mb-2">CAM Değerlendirme Soruları (Yönetici Puanlama)</h4>
                                        <div className="space-y-2">
                                            {questions.filter(q => q.target === 'CAM_BY_MANAGER').map((q, idx) => {
                                                const isEditing = editingQuestionId === q.id;
                                                return (
                                                    <div key={q.id} className="p-3.5 bg-gray-50/50 dark:bg-gray-900/50 rounded-xl border border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                                                        {isEditing ? (
                                                            <div className="flex-1 w-full space-y-2">
                                                                <input 
                                                                    type="text" 
                                                                    value={editText} 
                                                                    onChange={(e) => setEditText(e.target.value)} 
                                                                    className="w-full p-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-xs font-bold text-gray-900 dark:text-white"
                                                                />
                                                                <input 
                                                                    type="text" 
                                                                    value={editDesc} 
                                                                    onChange={(e) => setEditDesc(e.target.value)} 
                                                                    className="w-full p-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-xs text-gray-900 dark:text-white"
                                                                />
                                                                <div className="flex gap-2 justify-end">
                                                                    <button 
                                                                        onClick={() => setEditingQuestionId(null)}
                                                                        className="px-3 py-1 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded text-[10px] font-bold text-gray-700 dark:text-gray-300"
                                                                    >
                                                                        İptal
                                                                    </button>
                                                                    <button 
                                                                        onClick={() => handleUpdateQuestion(q.id)}
                                                                        className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-[10px] font-bold"
                                                                    >
                                                                        Kaydet
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <>
                                                                <div className="min-w-0 flex-1">
                                                                    <div className="text-xs font-bold text-gray-850 dark:text-white flex items-center gap-2">
                                                                        <span>{idx + 1}. {q.text}</span>
                                                                        <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${
                                                                            q.isSystem 
                                                                                ? 'text-blue-500 bg-blue-50 dark:bg-blue-950/45' 
                                                                                : 'text-orange-500 bg-orange-50 dark:bg-orange-950/45'
                                                                        }`}>
                                                                            {q.isSystem ? 'SİSTEM' : 'ÖZEL'}
                                                                        </span>
                                                                    </div>
                                                                    <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-1 leading-normal">{q.desc}</div>
                                                                </div>
                                                                <div className="flex gap-2 shrink-0">
                                                                    <button 
                                                                        onClick={() => {
                                                                            setEditingQuestionId(q.id);
                                                                            setEditText(q.text);
                                                                            setEditDesc(q.desc);
                                                                        }}
                                                                        className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 p-1.5 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 hover:scale-105 transition-all"
                                                                        title="Soruyu Düzenle"
                                                                    >
                                                                        <Edit3 className="w-4 h-4" />
                                                                    </button>
                                                                    <button 
                                                                        onClick={() => handleDeleteQuestion(q.id)}
                                                                        className="text-red-650 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 p-1.5 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 hover:scale-105 transition-all"
                                                                        title="Soruyu Sil"
                                                                    >
                                                                        <Trash2 className="w-4 h-4" />
                                                                    </button>
                                                                </div>
                                                            </>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* Tezgah Soru Seti */}
                                    <div className="pt-2">
                                        <h4 className="text-xs font-black text-gray-400 uppercase tracking-wider mb-2">Tezgah Operatörü Değerlendirme Soruları</h4>
                                        <div className="space-y-2">
                                            {questions.filter(q => q.target === 'MACHINE').map((q, idx) => {
                                                const isEditing = editingQuestionId === q.id;
                                                return (
                                                    <div key={q.id} className="p-3.5 bg-gray-50/50 dark:bg-gray-900/50 rounded-xl border border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                                                        {isEditing ? (
                                                            <div className="flex-1 w-full space-y-2">
                                                                <input 
                                                                    type="text" 
                                                                    value={editText} 
                                                                    onChange={(e) => setEditText(e.target.value)} 
                                                                    className="w-full p-2 border border-gray-350 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-xs font-bold text-gray-900 dark:text-white"
                                                                />
                                                                <input 
                                                                    type="text" 
                                                                    value={editDesc} 
                                                                    onChange={(e) => setEditDesc(e.target.value)} 
                                                                    className="w-full p-2 border border-gray-350 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-xs text-gray-900 dark:text-white"
                                                                />
                                                                <div className="flex gap-2 justify-end">
                                                                    <button 
                                                                        onClick={() => setEditingQuestionId(null)}
                                                                        className="px-3 py-1 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-650 rounded text-[10px] font-bold text-gray-700 dark:text-gray-300"
                                                                    >
                                                                        İptal
                                                                    </button>
                                                                    <button 
                                                                        onClick={() => handleUpdateQuestion(q.id)}
                                                                        className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-[10px] font-bold"
                                                                    >
                                                                        Kaydet
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <>
                                                                <div className="min-w-0 flex-1">
                                                                    <div className="text-xs font-bold text-gray-850 dark:text-white flex items-center gap-2">
                                                                        <span>{idx + 1}. {q.text}</span>
                                                                        <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${
                                                                            q.isSystem 
                                                                                ? 'text-blue-500 bg-blue-50 dark:bg-blue-950/45' 
                                                                                : 'text-orange-500 bg-orange-50 dark:bg-orange-950/45'
                                                                        }`}>
                                                                            {q.isSystem ? 'SİSTEM' : 'ÖZEL'}
                                                                        </span>
                                                                    </div>
                                                                    <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-1 leading-normal">{q.desc}</div>
                                                                </div>
                                                                <div className="flex gap-2 shrink-0">
                                                                    <button 
                                                                        onClick={() => {
                                                                            setEditingQuestionId(q.id);
                                                                            setEditText(q.text);
                                                                            setEditDesc(q.desc);
                                                                        }}
                                                                        className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 p-1.5 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 hover:scale-105 transition-all"
                                                                        title="Soruyu Düzenle"
                                                                    >
                                                                        <Edit3 className="w-4 h-4" />
                                                                    </button>
                                                                    <button 
                                                                        onClick={() => handleDeleteQuestion(q.id)}
                                                                        className="text-red-650 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 p-1.5 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 hover:scale-105 transition-all"
                                                                        title="Soruyu Sil"
                                                                    >
                                                                        <Trash2 className="w-4 h-4" />
                                                                    </button>
                                                                </div>
                                                            </>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                    {adminActiveTab === 'evaluate' && renderEvaluationForm()}
                </div>
            ) : (
                // ================= KULLANICI EKRANI (ANKET DOLDURMA) =================
                renderEvaluationForm()
            )}
        </div>
    );
};

export default SurveyEvaluationPage;
