import { NavLink } from 'react-router-dom';
import {
  Brain, Search, BarChart3, ScrollText, Users, Wrench, Activity,
  Sun, Moon, Monitor, LogOut,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';

const navItems = [
  { to: '/', icon: Brain, label: 'Memories' },
  { to: '/search', icon: Search, label: 'Search' },
  { to: '/stats', icon: BarChart3, label: 'Stats' },
  { to: '/requests', icon: ScrollText, label: 'Requests' },
  { to: '/entities', icon: Users, label: 'Entities' },
  { to: '/maintenance', icon: Wrench, label: 'Maintenance' },
  { to: '/health', icon: Activity, label: 'Health' },
];

const themeIcons = { light: Sun, dark: Moon, system: Monitor } as const;
const themeOrder: Array<'light' | 'dark' | 'system'> = ['light', 'dark', 'system'];

export default function Sidebar() {
  const { logout } = useAuth();
  const { theme, setTheme } = useTheme();

  const cycleTheme = () => {
    const idx = themeOrder.indexOf(theme);
    setTheme(themeOrder[(idx + 1) % themeOrder.length]);
  };

  const ThemeIcon = themeIcons[theme];

  return (
    <aside
      className="w-56 h-screen flex flex-col shrink-0 sticky top-0"
      style={{ backgroundColor: 'var(--color-bg-secondary)', borderRight: '1px solid var(--color-border)' }}
    >
      {/* Logo */}
      <div className="px-5 py-5 flex items-center gap-2.5">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: 'var(--color-accent)', color: '#fff' }}
        >
          <Brain size={18} />
        </div>
        <span className="font-semibold text-sm" style={{ color: 'var(--color-text-primary)' }}>
          mem0
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 flex flex-col gap-0.5">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${isActive ? 'font-medium' : ''}`
            }
            style={({ isActive }) => ({
              backgroundColor: isActive ? 'var(--color-bg-hover)' : 'transparent',
              color: isActive ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
            })}
          >
            <Icon size={16} />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-3 pb-4 flex flex-col gap-1">
        <button
          onClick={cycleTheme}
          className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors w-full text-left"
          style={{ color: 'var(--color-text-muted)' }}
          title={`Theme: ${theme}`}
        >
          <ThemeIcon size={16} />
          {theme.charAt(0).toUpperCase() + theme.slice(1)}
        </button>
        <button
          onClick={logout}
          className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors w-full text-left"
          style={{ color: 'var(--color-text-muted)' }}
        >
          <LogOut size={16} />
          Logout
        </button>
      </div>
    </aside>
  );
}
