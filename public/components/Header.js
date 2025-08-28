function Header({ activeTab, setActiveTab, isLoggedIn, user, onLoginClick }) {
  try {
    const [isMenuOpen, setIsMenuOpen] = React.useState(false);

    const menuItems = [
      { id: 'dashboard', label: 'Главная', icon: 'home' },
      { id: 'signals', label: 'Сигналы', icon: 'trending-up' },
      { id: 'channels', label: 'Каналы', icon: 'message-circle' },
      { id: 'analytics', label: 'Аналитика', icon: 'bar-chart-3' },
      { id: 'admin', label: 'Админка', icon: 'settings' }
    ];

    return (
      <header className="fixed top-0 left-0 right-0 bg-[var(--surface-dark)]/95 backdrop-blur-sm border-b border-[var(--border-color)] z-50" data-name="header" data-file="components/Header.js">
        <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <div className="flex items-center">
              <div className="w-8 h-8 bg-gradient-to-br from-[var(--primary-color)] to-[var(--secondary-color)] rounded-lg flex items-center justify-center mr-3">
                <div className="icon-zap text-white text-lg"></div>
              </div>
              <span className="text-xl font-bold text-gradient">CryptoSignals Pro</span>
            </div>

            {/* Desktop Navigation */}
            <div className="hidden md:block">
              <div className="flex items-center space-x-8">
                {menuItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id)}
                    className={`flex items-center space-x-2 px-3 py-2 rounded-lg transition-all duration-200 ${
                      activeTab === item.id
                        ? 'bg-[var(--primary-color)] text-white'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-dark)]'
                    }`}
                  >
                    <div className={`icon-${item.icon} text-lg`}></div>
                    <span className="font-medium">{item.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* User Actions */}
            <div className="hidden md:flex items-center space-x-4">
              {isLoggedIn ? (
                <div className="flex items-center space-x-4">
                  <div className="flex items-center space-x-3 text-white">
                    <div className="w-10 h-10 bg-gradient-to-r from-green-500 to-emerald-500 rounded-full flex items-center justify-center">
                      <div className="icon-user text-lg"></div>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">{user?.name || 'Пользователь'}</span>
                      <span className="text-xs text-slate-300">Администратор</span>
                    </div>
                  </div>
                  <button
                    onClick={onLoginClick}
                    className="relative bg-gradient-to-r from-red-500 to-pink-600 text-white px-6 py-3 rounded-xl font-medium hover:from-red-600 hover:to-pink-700 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
                  >
                    <span className="relative z-10">Выйти</span>
                    <div className="absolute inset-0 bg-gradient-to-r from-red-500 to-pink-600 rounded-xl blur opacity-30"></div>
                  </button>
                </div>
              ) : (
                <button
                  onClick={onLoginClick}
                  className="relative bg-gradient-to-r from-blue-500 to-purple-600 text-white px-8 py-3 rounded-xl font-medium hover:from-blue-600 hover:to-purple-700 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
                >
                  <span className="relative z-10">Войти</span>
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl blur opacity-30"></div>
                </button>
              )}
            </div>

            {/* Mobile menu button */}
            <div className="md:hidden">
              <button
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                <div className="icon-menu text-xl"></div>
              </button>
            </div>
          </div>

          {/* Mobile Navigation */}
          {isMenuOpen && (
            <div className="md:hidden border-t border-[var(--border-color)] mt-2 pt-4 pb-4">
              <div className="space-y-2">
                {menuItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveTab(item.id);
                      setIsMenuOpen(false);
                    }}
                    className={`w-full flex items-center space-x-3 px-3 py-3 rounded-lg transition-all duration-200 ${
                      activeTab === item.id
                        ? 'bg-[var(--primary-color)] text-white'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-dark)]'
                    }`}
                  >
                    <div className={`icon-${item.icon} text-lg`}></div>
                    <span className="font-medium">{item.label}</span>
                  </button>
                ))}
                <div className="pt-4 border-t border-[var(--border-color)]">
                  {isLoggedIn ? (
                    <div className="space-y-3">
                      <div className="flex items-center space-x-3 text-white px-3 py-2">
                        <div className="w-8 h-8 bg-gradient-to-r from-green-500 to-emerald-500 rounded-full flex items-center justify-center">
                          <div className="icon-user text-sm"></div>
                        </div>
                        <div>
                          <div className="text-sm font-medium">{user?.name || 'Пользователь'}</div>
                          <div className="text-xs text-slate-300">Администратор</div>
                        </div>
                      </div>
                      <button
                        onClick={onLoginClick}
                        className="w-full bg-gradient-to-r from-red-500 to-pink-600 text-white px-6 py-3 rounded-xl font-medium hover:from-red-600 hover:to-pink-700 transition-all duration-300"
                      >
                        Выйти
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={onLoginClick}
                      className="w-full btn-primary"
                    >
                      Войти
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </nav>
      </header>
    );
  } catch (error) {
    console.error('Header component error:', error);
    return null;
  }
}