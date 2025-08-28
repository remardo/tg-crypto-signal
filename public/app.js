class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[var(--background-dark)]">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-4">Что-то пошло не так</h1>
            <p className="text-[var(--text-secondary)] mb-4">Извините, произошла непредвиденная ошибка.</p>
            <button
              onClick={() => window.location.reload()}
              className="btn-primary"
            >
              Перезагрузить страницу
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

function App() {
  try {
    // Function to get current tab from URL hash
    const getCurrentTabFromHash = () => {
      const hash = window.location.hash.replace('#', '');
      return hash || 'dashboard';
    };

    const [activeTab, setActiveTab] = React.useState(getCurrentTabFromHash());
    const [isLoggedIn, setIsLoggedIn] = React.useState(false);
    const [user, setUser] = React.useState(null);
    const [showLoginModal, setShowLoginModal] = React.useState(false);

    // Data state
    const [channels, setChannels] = React.useState([]);
    const [positions, setPositions] = React.useState([]);
    const [signals, setSignals] = React.useState([]);
    const [loading, setLoading] = React.useState(false);

    // Navigation function that updates both state and URL
    const navigateToTab = (tabId) => {
      setActiveTab(tabId);
      window.location.hash = tabId;
    };

    // Listen for hash changes (browser back/forward buttons)
    React.useEffect(() => {
      const handleHashChange = () => {
        const newTab = getCurrentTabFromHash();
        setActiveTab(newTab);
      };

      window.addEventListener('hashchange', handleHashChange);
      return () => window.removeEventListener('hashchange', handleHashChange);
    }, []);

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

    // Load channels from backend
    const loadChannels = async () => {
      try {
        const response = await apiCall('/channels');
        const channelsData = response.data?.channels || response;
        setChannels(Array.isArray(channelsData) ? channelsData : []);
      } catch (error) {
        console.error('Failed to load channels:', error);
        setChannels([]);
      }
    };

    // Load positions from backend
    const loadPositions = async () => {
      try {
        const response = await apiCall('/positions');
        const positionsData = response.data || response;
        setPositions(Array.isArray(positionsData) ? positionsData : []);
      } catch (error) {
        console.error('Failed to load positions:', error);
        setPositions([]);
      }
    };

    // Load signals from backend
    const loadSignals = async () => {
      try {
        const response = await apiCall('/signals?limit=50');
        const signalsData = response.data?.signals || response;
        setSignals(Array.isArray(signalsData) ? signalsData : []);
      } catch (error) {
        console.error('Failed to load signals:', error);
        setSignals([]);
      }
    };

    // Load all data
    const loadAllData = async () => {
      setLoading(true);
      try {
        await Promise.all([
          loadChannels(),
          loadPositions(),
          loadSignals()
        ]);
      } catch (error) {
        console.error('Failed to load data:', error);
      } finally {
        setLoading(false);
      }
    };

    // Load data on component mount
    React.useEffect(() => {
      loadAllData();
    }, []);

    // Refresh data function
    const refreshData = () => {
      loadAllData();
    };

    const handleLogin = (userData) => {
      setIsLoggedIn(true);
      setUser(userData);
      navigateToTab('admin'); // Redirect to admin panel after login
      // Load fresh data after login
      loadAllData();
    };

    const handleLogout = () => {
      setIsLoggedIn(false);
      setUser(null);
      navigateToTab('dashboard');
    };

    const handleLoginClick = () => {
      if (isLoggedIn) {
        handleLogout();
      } else {
        setShowLoginModal(true);
      }
    };

    return (
      <div className="min-h-screen gradient-bg" data-name="app" data-file="app.js">
        <Header
          activeTab={activeTab}
          setActiveTab={navigateToTab}
          isLoggedIn={isLoggedIn}
          user={user}
          onLoginClick={handleLoginClick}
        />

        {activeTab === 'dashboard' && (
          <main>
            <HeroSection />
            <StatsSection />
            <FeaturesSection />
          </main>
        )}

        {activeTab === 'signals' && (
          <main className="pt-20">
            <SignalsPanel signals={signals} onRefresh={refreshData} />
          </main>
        )}

        {activeTab === 'admin' && isLoggedIn && (
          <main className="pt-20">
            <AdminPanel
              channels={channels}
              positions={positions}
              signals={signals}
              onRefresh={refreshData}
            />
          </main>
        )}

        {activeTab === 'admin' && !isLoggedIn && (
          <main className="pt-20">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
              <div className="text-center">
                <div className="w-24 h-24 bg-gradient-to-br from-[var(--primary-color)] to-[var(--secondary-color)] rounded-3xl flex items-center justify-center mx-auto mb-8">
                  <div className="icon-shield-check text-3xl text-white"></div>
                </div>
                <h2 className="text-3xl font-bold text-[var(--text-primary)] mb-4">
                  Доступ ограничен
                </h2>
                <p className="text-xl text-[var(--text-secondary)] mb-8 max-w-2xl mx-auto">
                  Для доступа к административной панели необходимо войти в систему
                </p>
                <button
                  onClick={() => setShowLoginModal(true)}
                  className="btn-primary text-lg px-8 py-4"
                >
                  <div className="flex items-center justify-center space-x-2">
                    <div className="icon-log-in text-xl"></div>
                    <span>Войти</span>
                  </div>
                </button>
              </div>
            </div>
          </main>
        )}

        <Footer />

        <LoginModal
          isOpen={showLoginModal}
          onClose={() => setShowLoginModal(false)}
          onLogin={handleLogin}
        />
      </div>
    );
  } catch (error) {
    console.error('App component error:', error);
    return null;
  }
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);