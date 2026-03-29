import React, { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Activity, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { BioRecord } from '../hooks/useBioHistory';

interface BioHistoryChartProps {
  history: BioRecord[];
}

export function BioHistoryChart({ history }: BioHistoryChartProps) {
  const chartData = useMemo(() => {
    // Get last 7 days of data
    const now = Date.now();
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
    
    const recentHistory = history.filter(r => r.timestamp >= sevenDaysAgo);
    
    // Group by day and average
    const dailyData: Record<string, { bpmSum: number; hrvSum: number; count: number; dateStr: string }> = {};
    
    recentHistory.forEach(record => {
      const date = new Date(record.timestamp);
      const dateKey = `${date.getMonth() + 1}/${date.getDate()}`;
      
      if (!dailyData[dateKey]) {
        dailyData[dateKey] = { bpmSum: 0, hrvSum: 0, count: 0, dateStr: dateKey };
      }
      
      dailyData[dateKey].bpmSum += record.bpm;
      dailyData[dateKey].hrvSum += record.hrv;
      dailyData[dateKey].count += 1;
    });
    
    return Object.values(dailyData).map(day => ({
      date: day.dateStr,
      bpm: Math.round(day.bpmSum / day.count),
      hrv: Math.round(day.hrvSum / day.count),
    })).sort((a, b) => {
      // Simple sort by date string assuming same year for last 7 days
      return a.date.localeCompare(b.date);
    });
  }, [history]);

  const hrvTrend = useMemo(() => {
    if (chartData.length < 2) return null;
    const latest = chartData[chartData.length - 1].hrv;
    const previous = chartData[chartData.length - 2].hrv;
    const diff = latest - previous;
    
    if (diff > 5) return { type: 'up', text: 'تحسن ملحوظ في التوافق القلبي (HRV). استمر في جلسات الاسترخاء.', icon: TrendingUp, color: 'text-emerald-400' };
    if (diff < -5) return { type: 'down', text: 'انخفاض في التوافق القلبي (HRV). قد تحتاج لمزيد من الراحة أو التأمل.', icon: TrendingDown, color: 'text-rose-400' };
    return { type: 'stable', text: 'مستويات التوافق القلبي (HRV) مستقرة.', icon: Minus, color: 'text-blue-400' };
  }, [chartData]);

  if (history.length === 0) {
    return (
      <div className="bg-[#0d1318] border border-[#1e2d3d] rounded-xl p-6 text-center">
        <Activity className="w-8 h-8 text-[#3d5570] mx-auto mb-3" />
        <p className="text-xs text-[#6a8099]">لا توجد بيانات سابقة بعد. قم بأخذ قياساتك الأولى لرؤية التحليل.</p>
      </div>
    );
  }

  return (
    <div className="bg-[#0d1318] border border-[#1e2d3d] rounded-xl p-4 relative overflow-hidden space-y-6">
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[#263545] to-transparent" />
      
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 rounded-lg bg-[#00c8e8]/10 flex items-center justify-center">
          <Activity className="w-4 h-4 text-[#00c8e8]" />
        </div>
        <div>
          <h2 className="font-mono text-[10px] tracking-widest text-[#3d5570] uppercase">سجل القياسات (آخر 7 أيام)</h2>
          <p className="text-xs text-[#6a8099]">متوسط النبض اليومي (BPM)</p>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-[10px] font-mono text-[#6a8099]">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 bg-[#00c8e8] inline-block rounded-full" />
          النبض (BPM)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 bg-[#00e070] inline-block rounded-full" style={{borderTop:'2px dashed #00e070',background:'none'}} />
          التوافق القلبي (HRV ms)
        </span>
      </div>
      <div className="h-48 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e2d3d" vertical={false} />
            <XAxis 
              dataKey="date" 
              stroke="#6a8099" 
              fontSize={10} 
              tickLine={false}
              axisLine={false}
              fontFamily="monospace"
            />
            {/* Left Y-axis: BPM (40–180) */}
            <YAxis 
              yAxisId="bpm"
              orientation="left"
              stroke="#00c8e8" 
              fontSize={9} 
              tickLine={false}
              axisLine={false}
              domain={[40, 180]}
              fontFamily="monospace"
              tickFormatter={(v) => v}
            />
            {/* Right Y-axis: HRV (0–100ms) */}
            <YAxis 
              yAxisId="hrv"
              orientation="right"
              stroke="#00e070"
              fontSize={9}
              tickLine={false}
              axisLine={false}
              domain={[0, 100]}
              fontFamily="monospace"
              tickFormatter={(v) => v}
            />
            <Tooltip 
              contentStyle={{ backgroundColor: '#131a22', border: '1px solid #1e2d3d', borderRadius: '8px', fontSize: '11px' }}
              itemStyle={{ color: '#c8d8e8' }}
            />
            <Line 
              yAxisId="bpm"
              type="monotone" 
              dataKey="bpm" 
              name="النبض (BPM)"
              stroke="#00c8e8" 
              strokeWidth={2}
              dot={{ fill: '#00c8e8', strokeWidth: 1, r: 2.5, stroke: '#0d1318' }}
              activeDot={{ r: 4, fill: '#00e070', stroke: '#0d1318' }}
            />
            <Line 
              yAxisId="hrv"
              type="monotone" 
              dataKey="hrv" 
              name="HRV (ms)"
              stroke="#00e070"
              strokeWidth={2}
              strokeDasharray="5 3"
              dot={{ fill: '#00e070', strokeWidth: 1, r: 2.5, stroke: '#0d1318' }}
              activeDot={{ r: 4, fill: '#00c8e8', stroke: '#0d1318' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {hrvTrend && (
        <div className="p-3 rounded-lg bg-[#131a22] border border-[#1e2d3d] flex items-start gap-3">
          <hrvTrend.icon className={`w-4 h-4 mt-0.5 ${hrvTrend.color.replace('text-emerald-400', 'text-[#00e070]').replace('text-rose-400', 'text-[#e04040]').replace('text-blue-400', 'text-[#00c8e8]')}`} />
          <div>
            <h4 className="text-[11px] font-medium text-[#c8d8e8] mb-1">تحليل التوافق القلبي (HRV)</h4>
            <p className="text-[10px] text-[#6a8099] leading-relaxed">{hrvTrend.text}</p>
          </div>
        </div>
      )}
    </div>
  );
}
