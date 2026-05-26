import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../lib/utils';

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className={cn(
        "relative p-2.5 rounded-xl transition-all duration-300 cursor-pointer",
        "hover:scale-105 active:scale-95",
        "focus:outline-none focus:ring-2 focus:ring-blue-500/50",
        theme === 'dark' 
          ? "bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20"
          : "bg-slate-200 hover:bg-slate-300 border border-slate-300 hover:border-slate-400",
        "group"
      )}
      aria-label={theme === 'dark' ? '切换到白天模式' : '切换到黑夜模式'}
      title={theme === 'dark' ? '切换到白天模式' : '切换到黑夜模式'}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={theme}
          initial={{ rotate: -90, opacity: 0, scale: 0.5 }}
          animate={{ rotate: 0, opacity: 1, scale: 1 }}
          exit={{ rotate: 90, opacity: 0, scale: 0.5 }}
          transition={{ duration: 0.2 }}
          className="relative w-5 h-5"
        >
          {theme === 'dark' ? (
            <Moon className={cn(
              "w-5 h-5 transition-colors",
              theme === 'dark' ? "text-slate-400 group-hover:text-slate-300" : "text-amber-600 group-hover:text-amber-700"
            )} />
          ) : (
            <Sun className={cn(
              "w-5 h-5 transition-colors",
              "text-amber-600 group-hover:text-amber-700"
            )} />
          )}
        </motion.div>
      </AnimatePresence>
    </button>
  );
}
