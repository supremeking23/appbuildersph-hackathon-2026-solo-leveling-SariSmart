export type DashboardSection = "Dashboard" | "Inventory" | "Transactions" | "Settings";

interface HeaderProps {
  activeSection: DashboardSection;
  onNavigate: (section: DashboardSection) => void;
}

const sections: DashboardSection[] = ["Dashboard", "Inventory", "Transactions", "Settings"];

function Header({ activeSection, onNavigate }: HeaderProps) {
  return (
    <header className="site-header">
      <a className="brand" href="#dashboard" onClick={() => onNavigate("Dashboard")} aria-label="SariSmart dashboard">
        <span className="brand-mark">S</span>
        <span className="brand-name">sari<span>smart</span><small>YOUR STORE, IN SYNC</small></span>
      </a>
      <nav className="main-nav" aria-label="Main navigation">
        {sections.map((section) => (
          <button
            type="button"
            className={`nav-link${activeSection === section ? " active" : ""}`}
            key={section}
            onClick={() => onNavigate(section)}
            aria-current={activeSection === section ? "page" : undefined}
          >
            {section}
            {section === "Transactions" && <span className="nav-count">3</span>}
          </button>
        ))}
      </nav>
      <div className="header-actions">
        <button className="icon-button notification-button" type="button" aria-label="Notifications">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
          </svg>
          <span className="notification-dot" />
        </button>
        <span className="header-divider" />
        <button className="profile-button" type="button" aria-label="Aling Maria profile">
          <span className="avatar">M</span>
          <span className="profile-copy"><strong>Aling Maria</strong><small>Store owner</small></span>
          <span className="profile-chevron" aria-hidden="true">⌄</span>
        </button>
      </div>
    </header>
  );
}

export default Header;
