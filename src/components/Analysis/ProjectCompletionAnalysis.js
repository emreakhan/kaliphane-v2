// src/components/Analysis/ProjectCompletionAnalysis.js

import React, { useMemo } from 'react';
import { 
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, 
    PieChart, Pie, Cell, LabelList 
} from 'recharts';
import { 
    Trophy, Clock, Target, Calendar, Tag, BarChart3, TrendingUp, CheckCircle2, Layers 
} from 'lucide-react';

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4', '#F43F5E'];

const ProjectCompletionAnalysis = ({ projects }) => {

    const stats = useMemo(() => {
        // 1. Sadece BİTEN projeleri al (Durumunda ONAY, TAMAM vb. geçen tüm kelimeleri yakalar)
        const completedProjects = (projects || []).filter(p => {
            const st = p.status ? String(p.status).toUpperCase().trim() : '';
            return st.includes('ONAY') || 
                   st.includes('TAMAM') || 
                   st.includes('BİTTİ') || 
                   st.includes('BITTI') || 
                   st === 'COMPLETED' || 
                   st === 'DONE';
        });

        const labelMap = {};
        let totalDays = 0;
        let validProjectCount = 0;

        completedProjects.forEach(project => {
            const allOps = (project.tasks || []).flatMap(t => t.operations || []);

            // --- BAŞLANGIÇ TARİHİ HESAPLAMA ---
            let start = null;
            const opStartDates = allOps.map(op => op.startDate ? new Date(op.startDate).getTime() : null).filter(d => d && !isNaN(d));
            
            if (opStartDates.length > 0) {
                start = new Date(Math.min(...opStartDates)); // İlk operasyonun başlangıcı
            } else if (project.createdAt && !isNaN(new Date(project.createdAt).getTime())) {
                start = new Date(project.createdAt); // Kalıbın açılış tarihi
            } else if (project.updatedAt && !isNaN(new Date(project.updatedAt).getTime())) {
                start = new Date(project.updatedAt); // Güncellenme tarihi
            } else {
                start = new Date(); // Hiçbir tarih yoksa bugünü baz al (Hata vermemesi için)
            }

            // --- BİTİŞ TARİHİ HESAPLAMA ---
            let end = null;
            if (project.finishedAt && !isNaN(new Date(project.finishedAt).getTime())) {
                end = new Date(project.finishedAt); // Kalıp tamamlandı dendiği an
            } else {
                const opEndDates = allOps.map(op => op.finishDate ? new Date(op.finishDate).getTime() : null).filter(d => d && !isNaN(d));
                if (opEndDates.length > 0) {
                    end = new Date(Math.max(...opEndDates)); // Son biten operasyonun tarihi
                } else if (project.updatedAt && !isNaN(new Date(project.updatedAt).getTime())) {
                    end = new Date(project.updatedAt);
                } else {
                    end = new Date(); // Hiçbir tarih yoksa bugünü baz al
                }
            }

            // Güvenlik: Eğer başlangıç bitişten büyükse ters çevir (Eksi gün çıkmasını önler)
            if (start > end) {
                const temp = start;
                start = end;
                end = temp;
            }

            // Gün farkı hesabı
            const diffTime = Math.abs(end - start);
            const diffDays = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24))); // Süre çok kısaysa bile en az 1 Gün say
            
            totalDays += diffDays;
            validProjectCount++;

            // 2. Projenin Etiketine/Türüne göre grupla (YENİ KALIP, REVİZYON vb.)
            const tag = project.projectType || project.type || project.label || 'BELİRTİLMEMİŞ / DİĞER';
            const upperTag = String(tag).toUpperCase();

            if (!labelMap[upperTag]) {
                labelMap[upperTag] = { name: upperTag, totalDays: 0, count: 0 };
            }
            labelMap[upperTag].totalDays += diffDays;
            labelMap[upperTag].count++;
        });

        // 3. Grafik ve Tablo Verisini Hazırla
        const chartData = Object.values(labelMap).map(item => ({
            name: item.name,
            avgDays: parseFloat((item.totalDays / item.count).toFixed(1)),
            projectCount: item.count
        })).sort((a, b) => b.avgDays - a.avgDays);

        const sortedFastest = [...chartData].sort((a, b) => a.avgDays - b.avgDays);
        const fastestGroup = sortedFastest.length > 0 ? sortedFastest[0].name : '-';

        return {
            totalCompleted: validProjectCount, // Artık tam rakamı (98) verecektir.
            avgCompletionTime: validProjectCount > 0 ? (totalDays / validProjectCount).toFixed(1) : 0,
            chartData,
            pieData: chartData.map(d => ({ name: d.name, value: d.projectCount })),
            fastestGroup
        };
    }, [projects]);

    return (
        <div className="space-y-8 animate-in fade-in pb-10">
            
            {/* ÜST ÖZET KARTLARI */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl border-b-8 border-green-500 shadow-lg transition-transform hover:scale-[1.02]">
                    <div className="text-green-600 dark:text-green-400 text-xs font-black uppercase tracking-widest mb-2 flex items-center">
                        <CheckCircle2 className="w-4 h-4 mr-2"/> Toplam Tamamlanan
                    </div>
                    <div className="text-4xl font-black text-gray-900 dark:text-white">
                        {stats.totalCompleted} <span className="text-xl font-normal opacity-50">Kalıp</span>
                    </div>
                </div>

                <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl border-b-8 border-blue-500 shadow-lg transition-transform hover:scale-[1.02]">
                    <div className="text-blue-600 dark:text-blue-400 text-xs font-black uppercase tracking-widest mb-2 flex items-center">
                        <Clock className="w-4 h-4 mr-2"/> Genel Ortalama Teslim
                    </div>
                    <div className="text-4xl font-black text-blue-600">
                        {stats.avgCompletionTime} <span className="text-xl font-normal opacity-50">Gün</span>
                    </div>
                </div>

                <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl border-b-8 border-purple-500 shadow-lg transition-transform hover:scale-[1.02]">
                    <div className="text-purple-600 dark:text-purple-400 text-xs font-black uppercase tracking-widest mb-2 flex items-center">
                        <Trophy className="w-4 h-4 mr-2"/> En Hızlı Grup (Ortalama)
                    </div>
                    <div className="text-3xl font-black text-purple-600 truncate" title={stats.fastestGroup}>
                        {stats.fastestGroup}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                
                {/* ETİKET BAZLI ORTALAMA SÜRE GRAFİĞİ */}
                <div className="bg-white dark:bg-gray-800 p-8 rounded-3xl border border-gray-200 shadow-sm flex flex-col">
                    <h3 className="font-black text-gray-800 dark:text-white mb-8 flex items-center uppercase text-xs tracking-widest border-b pb-4 shrink-0">
                        <TrendingUp className="w-4 h-4 mr-2 text-indigo-500"/> Etiket Bazlı Ortalama Teslim Süresi
                    </h3>
                    
                    {stats.chartData.length > 0 ? (
                        <div className="flex-1 w-full min-h-[320px]">
                            {/* width 99% Recharts container hatasını engeller */}
                            <ResponsiveContainer width="99%" height={320}>
                                <BarChart data={stats.chartData} layout="vertical" margin={{ top: 5, right: 40, left: 0, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" opacity={0.05} horizontal={true} vertical={false} />
                                    <XAxis type="number" hide />
                                    <YAxis 
                                        dataKey="name" 
                                        type="category" 
                                        axisLine={false} 
                                        tickLine={false} 
                                        width={140}
                                        tick={{fill: '#6B7280', fontSize: 10, fontWeight: '900'}}
                                    />
                                    <Tooltip 
                                        cursor={{fill: 'rgba(59, 130, 246, 0.05)'}}
                                        contentStyle={{ backgroundColor: '#111827', color: '#F3F4F6', borderRadius: '12px', border: 'none' }}
                                        formatter={(value) => [`${value} Gün`, 'Ortalama Süre']}
                                    />
                                    <Bar dataKey="avgDays" fill="#3B82F6" radius={[0, 10, 10, 0]} barSize={24}>
                                        <LabelList dataKey="avgDays" position="right" fill="#3B82F6" fontSize={12} fontWeight="900" formatter={(v) => `${v} Gün`} />
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <div className="flex-1 flex items-center justify-center text-gray-400 font-bold min-h-[320px]">
                            Henüz tamamlanan kalıp verisi bulunmuyor.
                        </div>
                    )}
                </div>

                {/* PROJE DAĞILIMI (PASTA) */}
                <div className="bg-white dark:bg-gray-800 p-8 rounded-3xl border border-gray-200 shadow-sm flex flex-col">
                    <h3 className="font-black text-gray-800 dark:text-white mb-8 flex items-center uppercase text-xs tracking-widest border-b pb-4 shrink-0">
                        <Layers className="w-4 h-4 mr-2 text-emerald-500"/> Tamamlanan Kalıp Dağılımı (Adet)
                    </h3>
                    
                    {stats.pieData.length > 0 ? (
                        <div className="flex-1 w-full min-h-[320px]">
                            <ResponsiveContainer width="99%" height={320}>
                                <PieChart>
                                    <Pie
                                        data={stats.pieData}
                                        innerRadius={70}
                                        outerRadius={90}
                                        paddingAngle={5}
                                        dataKey="value"
                                    >
                                        {stats.pieData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip 
                                        contentStyle={{ backgroundColor: '#111827', color: '#F3F4F6', borderRadius: '12px', border: 'none' }}
                                        formatter={(value) => [`${value} Kalıp`, 'Adet']}
                                    />
                                    <Legend verticalAlign="bottom" align="center" wrapperStyle={{ paddingTop: '20px', fontWeight: 'bold', fontSize: '12px' }} />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <div className="flex-1 flex items-center justify-center text-gray-400 font-bold min-h-[320px]">
                            Henüz tamamlanan kalıp verisi bulunmuyor.
                        </div>
                    )}
                </div>

            </div>

            {/* DETAYLI LİSTE TABLOSU */}
            <div className="bg-white dark:bg-gray-800 p-8 rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
                <h3 className="font-black text-gray-800 dark:text-white mb-6 flex items-center uppercase text-xs tracking-widest border-b pb-4">
                    <Tag className="w-4 h-4 mr-2 text-blue-500"/> Etiket / Kategori Bazlı Performans Özeti
                </h3>
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="text-[10px] font-black text-gray-400 uppercase tracking-tighter border-b border-gray-100 dark:border-gray-700">
                                <th className="px-4 py-4">Kalıp Etiketi (Türü)</th>
                                <th className="px-4 py-4 text-center">Tamamlanan Adet</th>
                                <th className="px-4 py-4 text-right">Ortalama Bitirme Süresi</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                            {stats.chartData.length === 0 && (
                                <tr>
                                    <td colSpan="3" className="px-4 py-8 text-center text-gray-400 font-bold">Veri bulunamadı.</td>
                                </tr>
                            )}
                            {stats.chartData.map((item, idx) => (
                                <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors font-bold">
                                    <td className="px-4 py-4">
                                        <div className="inline-flex items-center px-3 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 text-sm uppercase tracking-tight">
                                            {item.name}
                                        </div>
                                    </td>
                                    <td className="px-4 py-4 text-center">
                                        <span className="text-gray-900 dark:text-white text-base">{item.projectCount} Adet</span>
                                    </td>
                                    <td className="px-4 py-4 text-right">
                                        <div className="text-xl font-black text-indigo-600 dark:text-indigo-400">
                                            {item.avgDays} <span className="text-xs font-normal opacity-60">Gün</span>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default ProjectCompletionAnalysis;