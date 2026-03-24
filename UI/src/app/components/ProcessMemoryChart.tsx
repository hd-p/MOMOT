import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Card } from './ui/card';
import { motion } from 'motion/react';
import { Activity } from 'lucide-react';
import { useTheme } from 'next-themes';

export interface ProcessData {
  id: string;
  name: string;
  color: string;
  data: { time: string; memory: number }[];
  currentMemory: number;
}

interface ProcessMemoryChartProps {
  processes: ProcessData[];
  onProcessClick: (process: ProcessData) => void;
}

export function ProcessMemoryChart({ processes, onProcessClick }: ProcessMemoryChartProps) {
  const { theme } = useTheme();
  
  // 合并所有进程数据到一个数组中
  const mergedData = processes[0]?.data.map((point, index) => {
    const dataPoint: any = { time: point.time };
    processes.forEach(process => {
      dataPoint[process.id] = process.data[index]?.memory || 0;
    });
    return dataPoint;
  }) || [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.1 }}
    >
      <Card className="p-6 shadow-sm hover:shadow-md transition-shadow">
        <h2 className="mb-4">进程内存趋势</h2>
        
        {/* 进程列表 */}
        <div className="mb-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          {processes.map((process, index) => (
            <motion.button
              key={process.id}
              className="flex items-center gap-2 p-3 rounded-lg bg-card border border-border hover:border-primary/50 hover:bg-accent/50 transition-all cursor-pointer text-left"
              onClick={() => onProcessClick(process)}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <div 
                className="w-3 h-3 rounded-full flex-shrink-0" 
                style={{ backgroundColor: process.color }}
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{process.name}</div>
                <div className="text-xs text-muted-foreground">
                  {process.currentMemory.toFixed(2)} GB
                </div>
              </div>
              <Activity className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            </motion.button>
          ))}
        </div>

        {/* 趋势图 */}
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={mergedData}>
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
              formatter={(value: number) => `${value.toFixed(2)} GB`}
            />
            <Legend />
            {processes.map((process) => (
              <Line
                key={process.id}
                type="monotone"
                dataKey={process.id}
                stroke={process.color}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 5 }}
                name={process.name}
                animationDuration={1000}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </Card>
    </motion.div>
  );
}