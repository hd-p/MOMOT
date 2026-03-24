import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { Card } from './ui/card';
import { motion } from 'motion/react';
import { useTheme } from 'next-themes';

interface MemoryData {
  name: string;
  value: number;
  color: string;
}

interface MemoryRingChartProps {
  data: MemoryData[];
  totalMemory: number;
  usedMemory: number;
}

export function MemoryRingChart({ data, totalMemory, usedMemory }: MemoryRingChartProps) {
  const usagePercentage = ((usedMemory / totalMemory) * 100).toFixed(1);
  const { theme } = useTheme();

  return (
    <Card className="p-6 shadow-sm hover:shadow-md transition-shadow">
      <h2 className="mb-4">内存占比</h2>
      <div className="relative">
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={80}
              outerRadius={110}
              paddingAngle={2}
              dataKey="value"
              animationBegin={0}
              animationDuration={800}
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip 
              formatter={(value: number) => `${value.toFixed(2)} GB`}
              contentStyle={{ 
                backgroundColor: theme === 'dark' ? 'rgba(0, 0, 0, 0.9)' : 'rgba(255, 255, 255, 0.95)', 
                border: 'none',
                borderRadius: '8px',
                color: theme === 'dark' ? '#fff' : '#000',
                boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
              }}
            />
            <Legend 
              verticalAlign="bottom" 
              height={36}
              formatter={(value: string) => <span style={{ fontSize: '14px' }}>{value}</span>}
            />
          </PieChart>
        </ResponsiveContainer>
        
        <motion.div 
          className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.3, type: "spring", stiffness: 200 }}
          style={{ marginTop: '-18px' }}
        >
          <div className="text-4xl font-bold bg-gradient-to-br from-blue-500 to-purple-600 bg-clip-text text-transparent">{usagePercentage}%</div>
          <div className="text-sm text-muted-foreground mt-1">
            {usedMemory.toFixed(1)} / {totalMemory.toFixed(1)} GB
          </div>
        </motion.div>
      </div>
    </Card>
  );
}