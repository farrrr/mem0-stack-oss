import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Brain, Search, BarChart3, ScrollText, Users, Wrench, Activity,
  Sun, Moon, Monitor, LogOut, Globe,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { languages, changeLanguage } from '../i18n';

const navItems = [
  { to: '/', icon: Brain, labelKey: 'nav.memories' },
  { to: '/search', icon: Search, labelKey: 'nav.search' },
  { to: '/stats', icon: BarChart3, labelKey: 'nav.stats' },
  { to: '/requests', icon: ScrollText, labelKey: 'nav.requests' },
  { to: '/entities', icon: Users, labelKey: 'nav.entities' },
  { to: '/maintenance', icon: Wrench, labelKey: 'nav.maintenance' },
  { to: '/health', icon: Activity, labelKey: 'nav.health' },
];

const themeIcons = { light: Sun, dark: Moon, system: Monitor } as const;
const themeOrder: Array<'light' | 'dark' | 'system'> = ['light', 'dark', 'system'];

export default function Sidebar() {
  const { t, i18n } = useTranslation();
  const { logout } = useAuth();
  const { theme, setTheme } = useTheme();

  const cycleTheme = () => {
    const idx = themeOrder.indexOf(theme);
    setTheme(themeOrder[(idx + 1) % themeOrder.length]);
  };

  const cycleLang = () => {
    const idx = languages.findIndex((l) => l.code === i18n.language);
    const next = languages[(idx + 1) % languages.length];
    changeLanguage(next.code);
  };

  const ThemeIcon = themeIcons[theme];
  const currentLang = languages.find((l) => l.code === i18n.language)?.label || 'English';

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
        {navItems.map(({ to, icon: Icon, labelKey }) => (
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
            {t(labelKey)}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-3 pb-4 flex flex-col gap-1">
        <button
          onClick={cycleLang}
          className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors w-full text-left"
          style={{ color: 'var(--color-text-muted)' }}
          title={t('common.language')}
        >
          <Globe size={16} />
          {currentLang}
        </button>
        <button
          onClick={cycleTheme}
          className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors w-full text-left"
          style={{ color: 'var(--color-text-muted)' }}
          title={t(`theme.${theme}`)}
        >
          <ThemeIcon size={16} />
          {t(`theme.${theme}`)}
        </button>
        <button
          onClick={logout}
          className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors w-full text-left"
          style={{ color: 'var(--color-text-muted)' }}
        >
          <LogOut size={16} />
          {t('nav.logout')}
        </button>
      </div>
    </aside>
  );
}
