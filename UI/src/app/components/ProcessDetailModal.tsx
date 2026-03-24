import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import { X, TrendingUp, TrendingDown, Activity } from 'lucide-react';
import { ProcessData } from './ProcessMemoryChart';
import { useTheme } from 'next-themes';

interface ProcessDetailModalProps {
  process: ProcessData | null;
  onClose: () => void;
}

export function ProcessDetailModal({ process, onClose }: ProcessDetailModalProps) {
  const { theme } = useTheme();
  
  if (!process) return null;

  const memoryValues = process.data.map(d => d.memory);
  const avgMemory = memoryValues.reduce((a, b) => a + b, 0) / memoryValues.length;
  const maxMemory = Math.max(...memoryValues);
  const minMemory = Math.min(...memoryValues);
  const trend = memoryValues[memoryValues.length - 1] - memoryValues[0];

  return (
    <AnimatePresence>
      {process && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="bg-background border border-border rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-auto"
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="sticky top-0 bg-background/95 backdrop-blur-sm border-b border-border p-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div 
                  className="w-4 h-4 rounded-full" 
                  style={{ backgroundColor: process.color }}
                />
                <div>
                  <h2 className="text-2xl font-bold">{process.name}</h2>
                  <p className="text-sm text-muted-foreground">进程详细内存分析</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-accent transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Stats */}
            <div className="p-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <motion.div 
                  className="p-4 rounded-lg bg-card border border-border shadow-sm"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                >
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                    <Activity className="w-4 h-4" />
                    当前使用
                  </div>
                  <div className="text-2xl font-bold bg-gradient-to-br from-blue-500 to-purple-600 bg-clip-text text-transparent">
                    {process.currentMemory.toFixed(2)} GB
                  </div>
                </motion.div>

                <motion.div 
                  className="p-4 rounded-lg bg-card border border-border shadow-sm"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 }}
                >
                  <div className="text-sm text-muted-foreground mb-1">平均使用</div>
                  <div className="text-2xl font-bold text-foreground">
                    {avgMemory.toFixed(2)} GB
                  </div>
                </motion.div>

                <motion.div 
                  className="p-4 rounded-lg bg-card border border-border shadow-sm"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                >
                  <div className="text-sm text-muted-foreground mb-1">峰值</div>
                  <div className="text-2xl font-bold text-red-500">
                    {maxMemory.toFixed(2)} GB
                  </div>
                </motion.div>

                <motion.div 
                  className="p-4 rounded-lg bg-card border border-border shadow-sm"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.25 }}
                >
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                    {trend >= 0 ? (
                      <TrendingUp className="w-4 h-4 text-red-500" />
                    ) : (
                      <TrendingDown className="w-4 h-4 text-green-500" />
                    )}
                    趋势
                  </div>
                  <div className={`text-2xl font-bold ${trend >= 0 ? 'text-red-500' : 'text-green-500'}`}>
                    {trend >= 0 ? '+' : ''}{trend.toFixed(2)} GB
                  </div>
                </motion.div>
              </div>

              {/* Area Chart */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="mb-6"
              >
                <h3 className="text-lg font-semibold mb-3">内存使用趋势（面积图）</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <AreaChart data={process.data}>
                    <defs>
                      <linearGradient id={`gradient-${process.id}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={process.color} stopOpacity={0.8}/>
                        <stop offset="95%" stopColor={process.color} stopOpacity={0.1}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid 
                      strokeDasharray="3 3" 
                      stroke={theme === 'dark' ? '#333' : '#e5e7eb'} 
                      opacity={0.5} 
                    />
                    <XAxis 
                      dataKey="time" 
                      stroke={theme === 'dark' ? '#888' : '#6b7280'}
                      style={{ fontSize: '12px' }}
                    />
                    <YAxis 
                      stroke={theme === 'dark' ? '#888' : '#6b7280'}
                      style={{ fontSize: '12px' }}
                      label={{ 
                        value: 'GB', 
                        angle: -90, 
                        position: 'insideLeft', 
                        style: { fill: theme === 'dark' ? '#888' : '#6b7280' } 
                      }}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: theme === 'dark' ? 'rgba(0, 0, 0, 0.9)' : 'rgba(255, 255, 255, 0.95)', 
                        border: 'none',
                        borderRadius: '8px',
                        color: theme === 'dark' ? '#fff' : '#000',
                        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
                      }}
                      formatter={(value: number) => [`${value.toFixed(2)} GB`, '内存使用']}
                    />
                    <Area
                      type="monotone"
                      dataKey="memory"
                      stroke={process.color}
                      strokeWidth={3}
                      fill={`url(#gradient-${process.id})`}
                      animationDuration={1200}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </motion.div>

              {/* Line Chart */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
              >
                <h3 className="text-lg font-semibold mb-3">详细内存变化曲线</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={process.data}>
                    <CartesianGrid 
                      strokeDasharray="3 3" 
                      stroke={theme === 'dark' ? '#333' : '#e5e7eb'} 
                      opacity={0.5} 
                    />
                    <XAxis 
                      dataKey="time" 
                      stroke={theme === 'dark' ? '#888' : '#6b7280'}
                      style={{ fontSize: '12px' }}
                    />
                    <YAxis 
                      stroke={theme === 'dark' ? '#888' : '#6b7280'}
                      style={{ fontSize: '12px' }}
                      domain={[minMemory * 0.95, maxMemory * 1.05]}
                      label={{ 
                        value: 'GB', 
                        angle: -90, 
                        position: 'insideLeft', 
                        style: { fill: theme === 'dark' ? '#888' : '#6b7280' } 
                      }}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: theme === 'dark' ? 'rgba(0, 0, 0, 0.9)' : 'rgba(255, 255, 255, 0.95)', 
                        border: 'none',
                        borderRadius: '8px',
                        color: theme === 'dark' ? '#fff' : '#000',
                        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
                      }}
                      formatter={(value: number) => [`${value.toFixed(2)} GB`, '内存使用']}
                    />
                    <Line
                      type="monotone"
                      dataKey="memory"
                      stroke={process.color}
                      strokeWidth={3}
                      dot={{ fill: process.color, r: 3 }}
                      activeDot={{ r: 6 }}
                      animationDuration={1200}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </motion.div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}