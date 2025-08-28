function AdminPanel({ channels = [], positions = [], signals = [], onRefresh }) {
  try {
  const [activeSection, setActiveSection] = React.useState('channels');

  // API call function
  const apiCall = async (endpoint, options = {}) => {
    try {
      const response = await fetch(`${window.location.origin}/api${endpoint}`, {
        method: options.method || 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...options.headers
        },
        body: options.body ? JSON.stringify(options.body) : undefined
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('API call failed:', error);
      throw error;
    }
  };

  // Quick cleanup function
  const quickCleanup = async () => {
    if (!confirm('Вы уверены, что хотите выполнить быструю очистку?\nБудут удалены сигналы старше 30 дней, сохранено 500 последних.')) {
      return;
    }

    try {
      const response = await apiCall('/signals/cleanup', {
        method: 'POST',
        body: {
          olderThanDays: 30,
          keepRecent: 500
        }
      });

      alert(`✅ Быстрая очистка завершена!\nУдалено: ${response.data.deleted} сигналов\nСохранено: ${response.data.kept} сигналов`);

      if (onRefresh) onRefresh();
    } catch (error) {
      console.error('Failed to cleanup signals:', error);
      alert('❌ Ошибка при очистке сигналов: ' + error.message);
    }
  };

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
              {activeSection === 'signals' && (
                <div>
                  {/* Quick Actions for Signals */}
                  <div className="mb-6 p-4 bg-gradient-to-r from-amber-500/10 to-orange-500/10 rounded-xl border border-amber-500/20">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-semibold text-amber-400 mb-1">Быстрые действия</h3>
                        <p className="text-slate-300 text-sm">Очистка старых сигналов для оптимизации базы данных</p>
                      </div>
                      <button
                        onClick={quickCleanup}
                        className="px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-600 text-white rounded-lg font-medium hover:from-amber-600 hover:to-orange-700 transition-all duration-200 flex items-center space-x-2"
                      >
                        <div className="icon-trash text-lg"></div>
                        <span>Очистить старые сигналы</span>
                      </button>
                    </div>
                  </div>
                  <SignalsPanel signals={signals} onRefresh={onRefresh} />
                </div>
              )}
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