import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Brush
} from 'recharts';
import { RefreshCw, Activity, Cpu, Server, X, Moon, Sun, Monitor, ChevronUp, ChevronDown } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Types ---
interface ProcessItem {
  pid: number;
  name: string;
  rss_mb: number;
  share_percent: number;
  delta_30s_mb: number;
  delta_since_start_mb: number;
  status: string;
  watch_score: number;
}
interface ShareItem { pid: number; name: string; rss_mb: number; share_percent: number; }
interface TrendPoint { timestamp: number; rss_mb: number; }
interface TrendSeries { pid: number; name: string; points: TrendPoint[]; }
interface Summary {
  used_percent: number; used_mb: number; total_mb: number; available_mb: number;
  pressure: string; top_holder: ProcessItem | null; top_riser: ProcessItem | null; watch_focus: ProcessItem | null;
}
interface StateInfo {
  code: string; message: string; snapshot_count: number;
  sample_interval_seconds: number; last_updated_at: number | null; runtime_error: string | null;
}
interface SystemTrendPoint { timestamp: number; used_mb: number; total_mb: number; }
interface DashboardPayload {
  state: StateInfo; summary: Summary; top_holders: ProcessItem[]; top_risers: ProcessItem[];
  memory_share: ShareItem[]; watchlist: ProcessItem[]; trend_series: TrendSeries[];
  system_trend: SystemTrendPoint[]; all_processes: ProcessItem[];
}

// --- Palette ---
const CHART_COLORS = ['#7c9af2', '#6dcdb1', '#e8c76a', '#d98e8e', '#b39ddb', '#80c4d4'];
const DONUT_COLORS = ['#7c9af2', '#6dcdb1', '#e8c76a', '#d98e8e', '#b39ddb', 'rgba(120,120,140,0.25)'];

const pressureColor = (p: string) => {
  if (p === 'critical') return 'text-red-400';
  if (p === 'elevated') return 'text-amber-400';
  return 'text-emerald-400';
};
const fmtDelta = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)} MB`;
const fmtTime = (ts: number) => {
  const d = new Date(ts * 1000);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
};

// --- Tooltip for line/area charts ---
const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md p-2.5 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-xl text-xs">
      <p className="text-zinc-400 mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} className="font-semibold" style={{ color: p.color }}>
          {p.name}: {Number(p.value).toFixed(1)} MB
        </p>
      ))}
    </div>
  );
};

// --- Pie tooltip: rendered outside the ring via absolute positioning ---
const PieTooltipContent = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div className="bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md px-3 py-2 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-xl text-xs whitespace-nowrap">
      <span className="font-semibold" style={{ color: d.payload?.fill }}>{d.name}</span>
      <span className="text-zinc-500 ml-2">{Number(d.value).toFixed(1)}% &middot; {d.payload?.rss_mb?.toFixed(1)} MB</span>
    </div>
  );
};

// --- Sort types ---
type SortKey = 'name' | 'pid' | 'rss_mb' | 'share_percent' | 'delta_30s_mb' | 'delta_since_start_mb' | 'status';
type SortDir = 'asc' | 'desc';

// --- Main App ---
export default function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [wsStatus, setWsStatus] = useState<'connecting' | 'live' | 'disconnected'>('connecting');
  const [lastUpdate, setLastUpdate] = useState('--');
  const wsRef = useRef<WebSocket | null>(null);

  // Sort state
  const [sortKey, setSortKey] = useState<SortKey>('rss_mb');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // Modal state
  const [selectedProcess, setSelectedProcess] = useState<ProcessItem | null>(null);
  const [modalTrend, setModalTrend] = useState<{ time: string; value: number }[]>([]);
  const [modalLoading, setModalLoading] = useState(false);
  const modalIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const selectedPidRef = useRef<number | null>(null);

  useEffect(() => {
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) setTheme('dark');
  }, []);
  useEffect(() => { document.documentElement.classList.toggle('dark', theme === 'dark'); }, [theme]);
  useEffect(() => { return () => { if (modalIntervalRef.current) clearInterval(modalIntervalRef.current); }; }, []);

  // WebSocket
  const connect = useCallback(() => {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws/dashboard`);
    wsRef.current = ws;
    ws.onopen = () => setWsStatus('live');
    ws.onmessage = (e) => {
      try {
        setData(JSON.parse(e.data));
        setLastUpdate(new Date().toLocaleTimeString('zh-CN', { hour12: false }));
      } catch {}
    };
    ws.onclose = () => { setWsStatus('disconnected'); setTimeout(connect, 2000); };
    ws.onerror = () => ws.close();
  }, []);
  useEffect(() => { connect(); return () => wsRef.current?.close(); }, [connect]);

  // --- Fetch modal trend ---
  const fetchTrend = useCallback(async (pid: number) => {
    try {
      const res = await fetch(`/api/process/${pid}/trend`);
      const json = await res.json();
      if (selectedPidRef.current !== pid) return;
      setModalTrend((json.points ?? []).map((p: TrendPoint) => ({ time: fmtTime(p.timestamp), value: p.rss_mb })));
    } catch {}
  }, []);

  const openProcessModal = useCallback((proc: ProcessItem) => {
    setSelectedProcess(proc);
    setModalTrend([]);
    setModalLoading(true);
    selectedPidRef.current = proc.pid;
    fetchTrend(proc.pid).then(() => setModalLoading(false));
    // Real-time refresh every 2s
    if (modalIntervalRef.current) clearInterval(modalIntervalRef.current);
    modalIntervalRef.current = setInterval(() => fetchTrend(proc.pid), 2000);
  }, [fetchTrend]);

  const closeModal = useCallback(() => {
    setSelectedProcess(null);
    selectedPidRef.current = null;
    if (modalIntervalRef.current) { clearInterval(modalIntervalRef.current); modalIntervalRef.current = null; }
  }, []);

  useEffect(() => { return () => { if (modalIntervalRef.current) clearInterval(modalIntervalRef.current); }; }, []);

  // --- Sorted processes ---
  const sortedProcesses = useMemo(() => {
    const list = [...(data?.all_processes ?? [])];
    list.sort((a, b) => {
      let va: any = a[sortKey], vb: any = b[sortKey];
      if (typeof va === 'string') { va = va.toLowerCase(); vb = (vb as string).toLowerCase(); }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [data?.all_processes, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) { setSortDir(d => d === 'asc' ? 'desc' : 'asc'); }
    else { setSortKey(key); setSortDir(key === 'name' || key === 'status' ? 'asc' : 'desc'); }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ChevronUp size={12} className="opacity-0 group-hover:opacity-30 ml-0.5 inline" />;
    return sortDir === 'asc'
      ? <ChevronUp size={12} className="ml-0.5 inline text-[#7c9af2]" />
      : <ChevronDown size={12} className="ml-0.5 inline text-[#7c9af2]" />;
  };

  const toggleTheme = () => setTheme(t => t === 'light' ? 'dark' : 'light');
  const gridColor = theme === 'dark' ? '#2a2a35' : '#e5e7eb';
  const textColor = theme === 'dark' ? '#8890a5' : '#71717a';
  const summary = data?.summary;
  const pColor = pressureColor(summary?.pressure ?? 'normal');

  // --- Build system trend data (total used memory) ---
  const systemTrendData = useMemo(() => {
    if (!data?.system_trend?.length) return [];
    return data.system_trend.map(p => ({
      time: fmtTime(p.timestamp),
      used: p.used_mb,
    }));
  }, [data?.system_trend]);

  const thCls = "text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-500 border-b border-zinc-100 dark:border-zinc-800/50 select-none cursor-pointer group";

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-[#0e1118] text-zinc-900 dark:text-zinc-100 transition-colors duration-300 font-sans relative overflow-x-hidden">
      <div className="max-w-7xl mx-auto px-6 py-10 relative z-10">

        {/* Header */}
        <header className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-6 mb-10">
          <div>
            <h1 className="text-5xl sm:text-6xl font-bold tracking-tight text-zinc-900 dark:text-white">MOMOT</h1>
            <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-500">实时监控系统内存使用情况，追踪进程内存占用变化趋势。</p>
          </div>
          <div className="flex flex-col items-end gap-2.5 shrink-0">
            <button onClick={toggleTheme} className="p-2 rounded-full border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
              {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
            </button>
            <div className={cn("px-3 py-1.5 rounded-full border flex items-center gap-2",
              wsStatus === 'live' ? "border-emerald-300/40 dark:border-emerald-800/40 bg-emerald-50 dark:bg-emerald-900/10"
              : wsStatus === 'connecting' ? "border-amber-300/40 dark:border-amber-800/40 bg-amber-50 dark:bg-amber-900/10"
              : "border-red-300/40 dark:border-red-800/40 bg-red-50 dark:bg-red-900/10"
            )}>
              <span className={cn("w-2 h-2 rounded-full",
                wsStatus === 'live' && "bg-emerald-500 animate-pulse shadow-[0_0_6px_rgba(16,185,129,0.6)]",
                wsStatus === 'connecting' && "bg-amber-500 animate-pulse",
                wsStatus === 'disconnected' && "bg-red-400",
              )} />
              <span className={cn("text-xs font-semibold tracking-wider",
                wsStatus === 'live' && "text-emerald-700 dark:text-emerald-400",
                wsStatus === 'connecting' && "text-amber-700 dark:text-amber-400",
                wsStatus === 'disconnected' && "text-red-600 dark:text-red-400",
              )}>{wsStatus === 'live' ? 'LIVE' : wsStatus === 'connecting' ? 'CONNECTING' : 'DISCONNECTED'}</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-zinc-400 dark:text-zinc-600">
              <RefreshCw size={12} className={wsStatus === 'live' ? "animate-spin" : ""} style={{ animationDuration: '3s' }} />
              <span>更新于 {lastUpdate}</span>
            </div>
          </div>
        </header>

        {/* Top: Donut + Trend */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }}
          className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-6">

          {/* Donut */}
          <div className="bg-white dark:bg-[#161921] rounded-2xl p-6 border border-zinc-200/80 dark:border-zinc-800/60 shadow-sm">
            <h3 className="text-sm font-semibold flex items-center gap-2 mb-4 text-zinc-600 dark:text-zinc-400">
              <Activity className="text-[#7c9af2]" size={16} /> 系统内存占比
            </h3>
            {summary ? (<>
              <div className="h-[200px] relative">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={data?.memory_share ?? []} cx="50%" cy="50%" innerRadius={58} outerRadius={82}
                      paddingAngle={2} dataKey="share_percent" nameKey="name" stroke="none" animationDuration={800}>
                      {(data?.memory_share ?? []).map((_e, i) => (
                        <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                      ))}
                    </Pie>
                    <RechartsTooltip content={<PieTooltipContent />} wrapperStyle={{ zIndex: 20, pointerEvents: 'none' }} offset={25} />
                  </PieChart>
                </ResponsiveContainer>
                {/* Center label */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className={cn("text-2xl font-bold", pColor)}>{summary.used_percent.toFixed(1)}%</span>
                  <span className="text-[11px] text-zinc-400 dark:text-zinc-500">{summary.used_mb.toFixed(0)} / {summary.total_mb.toFixed(0)} MB</span>
                </div>
              </div>
              <div className="flex flex-wrap justify-center gap-3 mt-2">
                {(data?.memory_share ?? []).map((item, i) => (
                  <div key={item.name} className="flex items-center gap-1.5 text-[11px]">
                    <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: DONUT_COLORS[i % DONUT_COLORS.length] }} />
                    <span className="text-zinc-500 dark:text-zinc-400">{item.name}</span>
                  </div>
                ))}
              </div>
            </>) : (
              <div className="h-[200px] flex items-center justify-center text-zinc-400 text-sm">等待数据...</div>
            )}
          </div>

          {/* System Memory Trend */}
          <div className="lg:col-span-2 bg-white dark:bg-[#161921] rounded-2xl p-6 border border-zinc-200/80 dark:border-zinc-800/60 shadow-sm flex flex-col">
            <h3 className="text-sm font-semibold flex items-center gap-2 mb-4 text-zinc-600 dark:text-zinc-400">
              <Monitor className="text-[#7c9af2]" size={16} /> 总内存使用趋势
            </h3>
            {systemTrendData.length > 1 ? (
              <div className="flex-1 min-h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={systemTrendData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="sysGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#7c9af2" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#7c9af2" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
                    <XAxis dataKey="time" tick={{ fill: textColor, fontSize: 10 }} axisLine={false} tickLine={false} minTickGap={50} />
                    <YAxis tick={{ fill: textColor, fontSize: 10 }} axisLine={false} tickLine={false}
                      domain={['dataMin - 200', 'dataMax + 200']}
                      tickFormatter={(v: number) => `${(v / 1024).toFixed(1)}G`} />
                    <RechartsTooltip content={<ChartTooltip />} />
                    <Area type="monotone" dataKey="used" name="已用内存"
                      stroke="#7c9af2" strokeWidth={2} fillOpacity={1} fill="url(#sysGrad)"
                      dot={false} isAnimationActive={false} />
                    <Brush dataKey="time" height={22} stroke="rgba(124,154,242,0.3)"
                      fill={theme === 'dark' ? '#12151d' : '#f8f8fa'} travellerWidth={8} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex-1 min-h-[240px] flex items-center justify-center text-zinc-400 text-sm">积累趋势数据中...</div>
            )}
          </div>
        </motion.div>

        {/* Process Table */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.2 }}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold flex items-center gap-2 text-zinc-800 dark:text-zinc-200">
              <Cpu className="text-zinc-400 dark:text-zinc-500" size={20} /> 所有进程
            </h3>
            <span className="text-xs text-zinc-400 dark:text-zinc-600">{sortedProcesses.length} 个进程</span>
          </div>

          <div className="bg-white dark:bg-[#161921] rounded-2xl border border-zinc-200/80 dark:border-zinc-800/60 shadow-sm overflow-hidden">
            <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
              <table className="w-full">
                <thead className="sticky top-0 bg-zinc-50 dark:bg-[#1a1e28] z-10">
                  <tr>
                    <th className={cn(thCls, "text-left px-5 py-2.5")} onClick={() => handleSort('name')}>进程名<SortIcon col="name" /></th>
                    <th className={cn(thCls, "text-right px-5 py-2.5")} onClick={() => handleSort('pid')}>PID<SortIcon col="pid" /></th>
                    <th className={cn(thCls, "text-right px-5 py-2.5")} onClick={() => handleSort('rss_mb')}>RSS<SortIcon col="rss_mb" /></th>
                    <th className={cn(thCls, "text-right px-5 py-2.5")} onClick={() => handleSort('share_percent')}>占比<SortIcon col="share_percent" /></th>
                    <th className={cn(thCls, "text-right px-5 py-2.5")} onClick={() => handleSort('delta_30s_mb')}>30s<SortIcon col="delta_30s_mb" /></th>
                    <th className={cn(thCls, "text-right px-5 py-2.5")} onClick={() => handleSort('delta_since_start_mb')}>启动以来<SortIcon col="delta_since_start_mb" /></th>
                    <th className={cn(thCls, "text-center px-5 py-2.5")} onClick={() => handleSort('status')}>状态<SortIcon col="status" /></th>
                  </tr>
                </thead>
                <tbody>
                  {sortedProcesses.map((proc) => (
                    <tr key={proc.pid} onClick={() => openProcessModal(proc)}
                      className="cursor-pointer hover:bg-zinc-50 dark:hover:bg-[#1c2030] transition-colors border-b border-zinc-50 dark:border-zinc-800/30 last:border-b-0">
                      <td className="px-5 py-2.5 text-sm font-medium text-zinc-900 dark:text-zinc-100">{proc.name}</td>
                      <td className="px-5 py-2.5 text-xs font-mono text-zinc-400 dark:text-zinc-600 text-right">{proc.pid}</td>
                      <td className="px-5 py-2.5 text-sm font-semibold text-zinc-800 dark:text-zinc-200 text-right tabular-nums">{proc.rss_mb.toFixed(1)}</td>
                      <td className="px-5 py-2.5 text-xs text-zinc-500 text-right tabular-nums">{proc.share_percent.toFixed(1)}%</td>
                      <td className={cn("px-5 py-2.5 text-xs text-right tabular-nums font-medium",
                        proc.delta_30s_mb > 0.1 ? "text-red-400" : proc.delta_30s_mb < -0.1 ? "text-emerald-400" : "text-zinc-400 dark:text-zinc-600"
                      )}>{fmtDelta(proc.delta_30s_mb)}</td>
                      <td className={cn("px-5 py-2.5 text-xs text-right tabular-nums font-medium",
                        proc.delta_since_start_mb > 0.1 ? "text-red-400" : proc.delta_since_start_mb < -0.1 ? "text-emerald-400" : "text-zinc-400 dark:text-zinc-600"
                      )}>{fmtDelta(proc.delta_since_start_mb)}</td>
                      <td className="px-5 py-2.5 text-center">
                        <span className={cn("text-[11px] font-medium px-2 py-0.5 rounded-full",
                          proc.status === 'rising' && "bg-red-100 text-red-600 dark:bg-red-900/20 dark:text-red-400",
                          proc.status === 'spiky' && "bg-amber-100 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400",
                          proc.status === 'steady' && "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400",
                        )}>{proc.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </motion.div>

        {/* Modal */}
        <AnimatePresence>
          {selectedProcess && (
            <>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={closeModal} className="fixed inset-0 bg-zinc-900/50 backdrop-blur-sm z-40" />
              <div className="fixed inset-0 flex items-center justify-center p-4 z-50 pointer-events-none">
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 20 }} transition={{ type: "spring", damping: 25, stiffness: 300 }}
                  className="bg-white dark:bg-[#161921] w-full max-w-3xl rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden pointer-events-auto">
                  {/* Header */}
                  <div className="px-6 py-4 border-b border-zinc-100 dark:border-zinc-800/60 flex justify-between items-center">
                    <div>
                      <h2 className="text-lg font-bold flex items-center gap-2">
                        <Server size={18} className="text-[#7c9af2]" />{selectedProcess.name}
                      </h2>
                      <p className="text-xs text-zinc-500 font-mono mt-1">
                        PID: {selectedProcess.pid} &middot; {selectedProcess.rss_mb.toFixed(1)} MB &middot; {selectedProcess.status}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={closeModal} className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors">
                        <X size={18} className="text-zinc-400" />
                      </button>
                    </div>
                  </div>
                  {/* Stats */}
                  <div className="p-6">
                    <div className="grid grid-cols-3 gap-3 mb-5">
                      <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800/40">
                        <div className="text-[11px] text-zinc-500 mb-1">当前占用</div>
                        <div className="text-lg font-bold text-[#7c9af2]">{selectedProcess.rss_mb.toFixed(1)} MB</div>
                      </div>
                      <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800/40">
                        <div className="text-[11px] text-zinc-500 mb-1">30s 变化</div>
                        <div className={cn("text-lg font-bold", selectedProcess.delta_30s_mb > 0 ? "text-red-400" : "text-emerald-400")}>
                          {fmtDelta(selectedProcess.delta_30s_mb)}
                        </div>
                      </div>
                      <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800/40">
                        <div className="text-[11px] text-zinc-500 mb-1">启动以来</div>
                        <div className={cn("text-lg font-bold", selectedProcess.delta_since_start_mb > 0 ? "text-red-400" : "text-emerald-400")}>
                          {fmtDelta(selectedProcess.delta_since_start_mb)}
                        </div>
                      </div>
                    </div>
                    {/* Chart */}
                    {modalLoading ? (
                      <div className="h-[300px] flex items-center justify-center text-zinc-400 text-sm">加载趋势数据...</div>
                    ) : modalTrend.length > 1 ? (
                      <div className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={modalTrend} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                            <defs>
                              <linearGradient id="modalGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#7c9af2" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="#7c9af2" stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
                            <XAxis dataKey="time" tick={{ fill: textColor, fontSize: 10 }} axisLine={false} tickLine={false} minTickGap={50} />
                            <YAxis tick={{ fill: textColor, fontSize: 10 }} axisLine={false} tickLine={false} />
                            <RechartsTooltip content={<ChartTooltip />} />
                            <Area type="monotone" dataKey="value" name="RSS" stroke="#7c9af2" strokeWidth={2} fillOpacity={1} fill="url(#modalGrad)" isAnimationActive={false} />
                            <Brush dataKey="time" height={20} stroke="rgba(124,154,242,0.3)"
                              fill={theme === 'dark' ? '#12151d' : '#f8f8fa'} travellerWidth={8} />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      <div className="h-[300px] flex items-center justify-center text-zinc-400 text-sm">该进程暂无趋势数据</div>
                    )}
                    <div className="flex items-center justify-end gap-1.5 mt-2 text-[11px] text-zinc-400 dark:text-zinc-600">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      实时更新中 &middot; {modalTrend.length} 个数据点
                    </div>
                  </div>
                </motion.div>
              </div>
            </>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}
