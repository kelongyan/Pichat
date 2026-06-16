import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Settings,
  PlusCircle,
  Menu,
  X,
  Sun,
  Moon,
} from 'lucide-react';
import { useThemeStore } from '../lib/theme';
import styles from './Header.module.css';

interface HeaderProps {
  activeTab?: string;
  showNewChat?: boolean;
}

const TABS = [
  { id: 'create', label: 'Create' },
  { id: 'gallery', label: 'Gallery' },
  { id: 'history', label: 'History' },
];

export function Header({ activeTab = 'create', showNewChat = false }: HeaderProps) {
  const navigate = useNavigate();
  const darkMode = useThemeStore((s) => s.isDark);
  const toggle = useThemeStore((s) => s.toggle);
  const [menuOpen, setMenuOpen] = useState(false);
  const headerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function handleDocClick(e: MouseEvent) {
      if (headerRef.current && !headerRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('click', handleDocClick);
    return () => document.removeEventListener('click', handleDocClick);
  }, [menuOpen]);

  function handleTab(tabId: string) {
    navigate(`/${tabId}`);
    setMenuOpen(false);
  }

  function handleThemeToggle(e: React.MouseEvent<HTMLButtonElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    toggle(cx, cy);
  }

  return (
    <div className={styles.header} ref={headerRef}>
      <div className={styles.logo} onClick={() => navigate('/create')}>
        <img src="assets/logo.png" alt="Pichat" className={styles.logoIcon} />
        <span className={styles.logoText}>Pichat</span>
      </div>
      <div className={styles.actions}>
        {showNewChat && (
          <button className={styles.btn} onClick={() => handleTab('create')}>
            <PlusCircle size={16} />
            <span className={styles.btnLabel}>New</span>
          </button>
        )}
        <div className={styles.tabs}>
          {TABS.map((t) => (
            <div
              key={t.id}
              className={`${styles.tab}${t.id === activeTab ? ` ${styles.tabActive}` : ''}`}
              onClick={() => handleTab(t.id)}
            >
              {t.label}
            </div>
          ))}
        </div>
        <button
          className={styles.iconBtn}
          data-action="menu"
          title="Menu"
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((v) => !v);
          }}
        >
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
        <button
          className={styles.iconBtn}
          title={darkMode ? 'Light mode' : 'Dark mode'}
          onClick={handleThemeToggle}
        >
          {darkMode ? <Sun size={18} /> : <Moon size={18} />}
        </button>
        <button
          className={styles.settingsBtn}
          onClick={() => navigate('/settings')}
        >
          <Settings size={16} />
          <span>Settings</span>
        </button>
      </div>
      <div className={`${styles.mobileMenu}${menuOpen ? ` ${styles.mobileMenuOpen}` : ''}`}>
        {TABS.map((t) => (
          <div
            key={t.id}
            className={`${styles.mobileMenuItem}${t.id === activeTab ? ` ${styles.mobileMenuItemActive}` : ''}`}
            onClick={() => handleTab(t.id)}
          >
            {t.label}
          </div>
        ))}
      </div>
      <div className={styles.gradientLine} />
    </div>
  );
}
