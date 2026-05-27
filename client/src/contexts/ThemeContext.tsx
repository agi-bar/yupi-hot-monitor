import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';

export type Theme = 'dark' | 'light';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_STORAGE_KEY = 'hotpulse-theme';

function getSystemTheme(): Theme {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'dark';
}

function getStoredTheme(): Theme | null {
  if (typeof window !== 'undefined') {
    return localStorage.getItem(THEME_STORAGE_KEY) as Theme | null;
  }
  return null;
}

function storeTheme(theme: Theme): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    return getStoredTheme() || getSystemTheme();
  });

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
    storeTheme(newTheme);
  }, []);

  const toggleTheme = useCallback(() => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
  }, [theme, setTheme]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      const storedTheme = getStoredTheme();
      if (!storedTheme) {
        setThemeState(e.matches ? 'dark' : 'light');
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  const value = useMemo(() => ({
    theme,
    toggleTheme,
    setTheme,
    isDark: theme === 'dark',
  }), [theme, toggleTheme, setTheme]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextType {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

export function useThemeInit(): () => void {
  return useCallback(() => {
    const theme = getStoredTheme() || getSystemTheme();
    document.documentElement.setAttribute('data-theme', theme);
    document.body.classList.add('no-transition');
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        document.body.classList.remove('no-transition');
      });
    });
  }, []);
}
