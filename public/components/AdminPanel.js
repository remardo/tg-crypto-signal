function AdminPanel({ channels = [], positions = [], signals = [], onRefresh }) {
  try {
  const [activeSection, setActiveSection] = React.useState('channels');

  const sections = [
    { id: 'channels', label: 'Управление каналами', icon: 'message-circle' },
    { id: 'signals', label: 'Торговые сигналы', icon: 'trending-up' },
    { id: 'pnl', label: 'Аналитика PnL', icon: 'bar-chart-3' }
  ];

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900" data-name="admin-panel" data-file="components/AdminPanel.js">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          {/* Header */}
          <div className="mb-12">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 to-purple-600/20 rounded-3xl blur-3xl"></div>
              <div className="relative bg-gradient-to-r from-slate-800/80 to-slate-700/80 backdrop-blur-sm rounded-3xl p-8 border border-slate-700/50 shadow-2xl">
                <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-emerald-400 bg-clip-text text-transparent mb-4">
                  Административная панель
                </h1>
                <p className="text-slate-300 text-lg">
                  Управление каналами и анализ торговых результатов
                </p>
              </div>
            </div>
          </div>

          {/* Section Navigation */}
          <div className="flex flex-wrap gap-4 mb-12">
            {sections.map(section => (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`relative flex items-center space-x-3 px-6 py-4 rounded-2xl font-medium transition-all duration-300 group overflow-hidden ${
                  activeSection === section.id
                    ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-xl transform scale-105'
                    : 'bg-gradient-to-r from-slate-800/80 to-slate-700/80 text-slate-300 hover:text-white hover:from-slate-700/80 hover:to-slate-600/80 border border-slate-600/50 hover:border-slate-500/50 backdrop-blur-sm'
                }`}
              >
                <div className={`icon-${section.icon} text-xl transition-transform group-hover:scale-110`}></div>
                <span className="text-lg">{section.label}</span>
                {activeSection === section.id && (
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-500/30 to-purple-600/30 rounded-2xl blur-xl"></div>
                )}
              </button>
            ))}
          </div>

          {/* Content Sections */}
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-purple-600/10 rounded-3xl blur-3xl"></div>
            <div className="relative bg-gradient-to-r from-slate-800/60 to-slate-700/60 backdrop-blur-sm rounded-3xl p-8 border border-slate-700/50 shadow-2xl">
              {activeSection === 'channels' && <ChannelManager channels={channels} onRefresh={onRefresh} />}
              {activeSection === 'signals' && <SignalsPanel signals={signals} onRefresh={onRefresh} />}
              {activeSection === 'pnl' && <PnLDashboard positions={positions} channels={channels} />}
            </div>
          </div>
        </div>
      </div>
    );
  } catch (error) {
    console.error('AdminPanel component error:', error);
    return null;
  }
}

// Make AdminPanel available globally for browser environment
if (typeof window !== 'undefined') {
  window.AdminPanel = AdminPanel;
}