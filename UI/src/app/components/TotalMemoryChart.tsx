import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Card } from './ui/card';
import { motion } from 'motion/react';
import { useTheme } from 'next-themes';

interface MemoryPoint {
  time: string;
  used: number;
  total: number;
}

interface TotalMemoryChartProps {
  data: MemoryPoint[];
}

export function TotalMemoryChart({ data }: TotalMemoryChartProps) {
  const { theme } = useTheme();
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <Card className="p-6 shadow-sm hover:shadow-md transition-shadow">
        <h2 className="mb-4">总内存变化趋势</h2>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data}>
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
              formatter={(value: number) => [`${value.toFixed(2)} GB`, '']}
            />
            <Legend />
            <Line 
              type="monotone" 
              dataKey="used" 
              stroke="#8b5cf6" 
              strokeWidth={3}
              dot={{ fill: '#8b5cf6', r: 4 }}
              activeDot={{ r: 6 }}
              name="已使用"
              animationDuration={1000}
            />
            <Line 
              type="monotone" 
              dataKey="total" 
              stroke="#64748b" 
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={false}
              name="总内存"
              animationDuration={1000}
            />
          </LineChart>
        </ResponsiveContainer>
      </Card>
    </motion.div>
  );
}