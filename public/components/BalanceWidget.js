function BalanceWidget() {
  try {
    const [balance, setBalance] = React.useState(null);
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState(null);
    const [lastUpdate, setLastUpdate] = React.useState(null);

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

    // Load balance from BingX
    const loadBalance = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await apiCall('/balance');
        const balanceData = response.data;

        setBalance(balanceData);
        setLastUpdate(new Date());

        console.log('BingX balance loaded:', balanceData);

      } catch (error) {
        console.error('Failed to load balance:', error);
        setError(error.message);
      } finally {
        setLoading(false);
      }
    };

    // Load balance on component mount
    React.useEffect(() => {
      loadBalance();

      // Auto-refresh every 30 seconds
      const interval = setInterval(loadBalance, 30000);

      return () => clearInterval(interval);
    }, []);

    const formatCurrency = (value) => {
      if (!value || isNaN(value)) return '0.00';
      return parseFloat(value).toFixed(2);
    };

    const formatPercent = (value) => {
      if (!value || isNaN(value)) return '0.00';
      return parseFloat(value).toFixed(2);
    };

    if (loading && !balance) {
      return (
        <div className="bg-gradient-to-r from-slate-800/80 to-slate-700/80 backdrop-blur-sm rounded-2xl p-6 border border-slate-700/50 shadow-xl">
          <div className="flex items-center justify-center py-8">
            <div className="w-8 h-8 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin"></div>
            <span className="ml-3 text-slate-300">Загрузка баланса...</span>
          </div>
        </div>
      );
    }

    if (error) {
      return (
        <div className="bg-gradient-to-r from-red-900/20 to-red-800/20 backdrop-blur-sm rounded-2xl p-6 border border-red-700/50 shadow-xl">
          <div className="text-center">
            <div className="w-12 h-12 bg-red-500/20 rounded-lg flex items-center justify-center mx-auto mb-4">
              <div className="icon-alert-triangle text-2xl text-red-400"></div>
            </div>
            <h3 className="text-lg font-semibold text-red-400 mb-2">Ошибка загрузки баланса</h3>
            <p className="text-red-300 text-sm mb-4">{error}</p>
            <button
              onClick={loadBalance}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
            >
              Повторить
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="bg-gradient-to-r from-slate-800/80 to-slate-700/80 backdrop-blur-sm rounded-2xl p-6 border border-slate-700/50 shadow-xl" data-name="balance-widget">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-emerald-600 rounded-lg flex items-center justify-center">
              <div className="icon-dollar-sign text-xl text-white"></div>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">BingX Баланс</h3>
              <p className="text-slate-400 text-sm">
                {lastUpdate ? `Обновлено: ${lastUpdate.toLocaleTimeString()}` : 'Загрузка...'}
              </p>
            </div>
          </div>
          <button
            onClick={loadBalance}
            disabled={loading}
            className="p-2 text-slate-400 hover:text-white transition-colors disabled:opacity-50"
            title="Обновить"
          >
            <div className={`icon-refresh-ccw text-lg ${loading ? 'animate-spin' : ''}`}></div>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Futures Account */}
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-slate-300 uppercase tracking-wide">Фьючерсный счет</h4>

            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Общий баланс</span>
                <span className="text-white font-semibold">
                  ${formatCurrency(balance?.futures?.balance)}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-slate-400">Доступно</span>
                <span className="text-green-400 font-semibold">
                  ${formatCurrency(balance?.futures?.availableBalance)}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-slate-400">Эквити</span>
                <span className="text-blue-400 font-semibold">
                  ${formatCurrency(balance?.futures?.equity)}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-slate-400">Нереализованная ПнЛ</span>
                <span className={`font-semibold ${parseFloat(balance?.futures?.unrealizedPnl || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  ${formatCurrency(balance?.futures?.unrealizedPnl)}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-slate-400">Используемая маржа</span>
                <span className="text-orange-400 font-semibold">
                  ${formatCurrency(balance?.futures?.marginUsed)}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-slate-400">Уровень маржи</span>
                <span className="text-yellow-400 font-semibold">
                  {formatPercent(balance?.futures?.marginRatio)}%
                </span>
              </div>
            </div>
          </div>

          {/* Spot Account */}
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-slate-300 uppercase tracking-wide">Спотовый счет</h4>

            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-slate-400">USDT Баланс</span>
                <span className="text-white font-semibold">
                  ${formatCurrency(balance?.spot?.total)}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-slate-400">Доступно</span>
                <span className="text-green-400 font-semibold">
                  ${formatCurrency(balance?.spot?.free)}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-slate-400">В ордерах</span>
                <span className="text-orange-400 font-semibold">
                  ${formatCurrency(balance?.spot?.locked)}
                </span>
              </div>
            </div>

            {/* Summary */}
            <div className="mt-6 pt-4 border-t border-slate-700/50">
              <div className="flex justify-between items-center">
                <span className="text-slate-300 font-medium">Общий баланс</span>
                <span className="text-white font-bold text-lg">
                  ${formatCurrency((parseFloat(balance?.futures?.balance || 0) + parseFloat(balance?.spot?.total || 0)))}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  } catch (error) {
    console.error('BalanceWidget component error:', error);
    return (
      <div className="bg-gradient-to-r from-red-900/20 to-red-800/20 backdrop-blur-sm rounded-2xl p-6 border border-red-700/50 shadow-xl">
        <div className="text-center">
          <h3 className="text-lg font-semibold text-red-400 mb-2">Ошибка компонента</h3>
          <p className="text-red-300 text-sm">{error.message}</p>
        </div>
      </div>
    );
  }
}

// Make BalanceWidget available globally for browser environment
if (typeof window !== 'undefined') {
  window.BalanceWidget = BalanceWidget;
}
