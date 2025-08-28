function SignalsPanel({ signals = [], onRefresh }) {
  try {
  const [activeFilter, setActiveFilter] = React.useState('all');
  const [showDetailsModal, setShowDetailsModal] = React.useState(false);
  const [selectedSignal, setSelectedSignal] = React.useState(null);
  const [viewMode, setViewMode] = React.useState('cards'); // 'cards' or 'table'

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

  // Execute signal
  const executeSignal = async (signalId) => {
    try {
      await apiCall(`/signals/${signalId}/execute`, { method: 'POST' });
      if (onRefresh) onRefresh();
    } catch (error) {
      console.error('Failed to execute signal:', error);
      alert('Ошибка при выполнении сигнала');
    }
  };

  // Ignore signal
  const ignoreSignal = async (signalId) => {
    try {
      await apiCall(`/signals/${signalId}/ignore`, { method: 'POST' });
      if (onRefresh) onRefresh();
    } catch (error) {
      console.error('Failed to ignore signal:', error);
      alert('Ошибка при игнорировании сигнала');
    }
  };

  // Show signal details
  const showSignalDetails = (signal) => {
    setSelectedSignal(signal);
    setShowDetailsModal(true);
  };

  const formatDateTime = (dateString) => {
    if (!dateString) return 'Неизвестно';
    try {
      const date = new Date(dateString);
      return date.toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (e) {
      return dateString;
    }
  };

  const formatPrice = (price) => {
    if (price === null || price === undefined) return 'N/A';
    const numPrice = parseFloat(price);
    return isNaN(numPrice) ? 'N/A' : numPrice.toFixed(2);
  };

    const getStatusColor = (direction) => {
      return direction === 'LONG' ? 'text-[var(--secondary-color)]' : 'text-[var(--danger-color)]';
    };

    const getStatusBadge = (direction) => {
      return direction === 'LONG' ? 'bg-[var(--secondary-color)]/20 text-[var(--secondary-color)]' : 'bg-[var(--danger-color)]/20 text-[var(--danger-color)]';
    };

    const filteredSignals = signals.filter(signal => {
      if (activeFilter === 'all') return true;
      // Add more filtering logic as needed
      return true;
    });

    const filters = [
      { id: 'all', label: 'Все сигналы', count: signals.length },
      { id: 'active', label: 'Активные', count: signals.filter(s => s.status === 'pending' || s.status === 'active').length },
      { id: 'executed', label: 'Выполненные', count: signals.filter(s => s.status === 'executed').length },
      { id: 'failed', label: 'Проваленные', count: signals.filter(s => s.status === 'failed').length }
    ];

    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8" data-name="signals-panel" data-file="components/SignalsPanel.js">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-[var(--text-primary)] mb-2">
              Торговые сигналы
            </h1>
            <p className="text-[var(--text-secondary)]">
              Управляйте копированием сигналов из Telegram каналов
            </p>
          </div>

          <div className="flex items-center space-x-4 mt-4 md:mt-0">
            {/* View Mode Toggle */}
            <div className="flex items-center bg-[var(--surface-dark)] rounded-lg p-1 border border-[var(--border-color)]">
              <button
                onClick={() => setViewMode('cards')}
                className={`px-3 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
                  viewMode === 'cards'
                    ? 'bg-[var(--primary-color)] text-white'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <div className="icon-grid text-lg"></div>
                  <span>Карточки</span>
                </div>
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`px-3 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
                  viewMode === 'table'
                    ? 'bg-[var(--primary-color)] text-white'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <div className="icon-list text-lg"></div>
                  <span>Таблица</span>
                </div>
              </button>
            </div>

            <button className="btn-secondary">
              <div className="flex items-center space-x-2">
                <div className="icon-plus text-lg"></div>
                <span>Добавить канал</span>
              </div>
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 mb-8">
          {filters.map(filter => (
            <button
              key={filter.id}
              onClick={() => setActiveFilter(filter.id)}
              className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
                activeFilter === filter.id
                  ? 'bg-[var(--primary-color)] text-white'
                  : 'bg-[var(--surface-dark)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-color)]'
              }`}
            >
              {filter.label} ({filter.count})
            </button>
          ))}
        </div>

        {/* Signals Content */}
        {viewMode === 'cards' ? (
          /* Cards View */
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
            {filteredSignals.length > 0 ? filteredSignals.map(signal => (
              <div key={signal.id} className="card hover:card-glow transition-all duration-300">
                {/* Signal Header */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-[var(--primary-color)] to-[var(--secondary-color)] rounded-lg flex items-center justify-center">
                      <div className="icon-trending-up text-white"></div>
                    </div>
                    <div>
                      <div className="font-semibold text-[var(--text-primary)]">{signal.channelName || signal.channel || 'Неизвестный канал'}</div>
                      <div className="text-sm text-[var(--text-secondary)]">{formatDateTime(signal.processedAt || signal.createdAt)}</div>
                    </div>
                  </div>

                  <div className={`px-2 py-1 rounded text-xs font-medium ${
                    signal.status === 'pending' ? 'bg-[var(--accent-color)]/20 text-[var(--accent-color)]' :
                    signal.status === 'executed' ? 'bg-[var(--secondary-color)]/20 text-[var(--secondary-color)]' :
                    signal.status === 'failed' ? 'bg-[var(--danger-color)]/20 text-[var(--danger-color)]' :
                    'bg-[var(--text-secondary)]/20 text-[var(--text-secondary)]'
                  }`}>
                    {signal.status === 'pending' ? 'Ожидает' :
                     signal.status === 'executed' ? 'Выполнен' :
                     signal.status === 'failed' ? 'Провален' : signal.status}
                  </div>
                </div>

                {/* Trading Pair */}
                <div className="mb-4">
                  <div className="flex items-center justify-between">
                    <span className="text-lg font-bold text-[var(--text-primary)]">{signal.coin || signal.symbol || 'Неизвестно'}</span>
                    <span className={`px-2 py-1 rounded text-sm font-medium ${getStatusBadge(signal.direction)}`}>
                      {signal.direction || 'Неизвестно'}
                    </span>
                  </div>
                </div>

                {/* Signal Details */}
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-[var(--text-secondary)]">Вход:</span>
                    <span className="text-[var(--text-primary)] font-medium">${formatPrice(signal.entryPrice)}</span>
                  </div>
                  {signal.takeProfitLevels && signal.takeProfitLevels.length > 0 && (
                    <div className="flex justify-between">
                      <span className="text-[var(--text-secondary)]">Цель:</span>
                      <span className="text-[var(--text-primary)] font-medium">${formatPrice(signal.takeProfitLevels[0])}</span>
                    </div>
                  )}
                  {signal.stopLoss && (
                    <div className="flex justify-between">
                      <span className="text-[var(--text-secondary)]">Стоп-лосс:</span>
                      <span className="text-[var(--text-primary)] font-medium">${formatPrice(signal.stopLoss)}</span>
                    </div>
                  )}
                </div>

                {/* Leverage */}
                {signal.leverage && (
                  <div className="mt-4 pt-4 border-t border-[var(--border-color)]">
                    <div className="flex items-center justify-between">
                      <span className="text-[var(--text-secondary)]">Плечо:</span>
                      <span className="font-bold text-[var(--accent-color)]">{signal.leverage}x</span>
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="mt-4 flex space-x-2">
                  <button
                    onClick={() => showSignalDetails(signal)}
                    className="flex-1 px-3 py-2 bg-[var(--primary-color)]/10 text-[var(--primary-color)] rounded-lg text-sm hover:bg-[var(--primary-color)]/20 transition-colors"
                  >
                    Детали
                  </button>
                  {signal.status === 'pending' && (
                    <button
                      onClick={() => executeSignal(signal.id)}
                      className="px-3 py-2 bg-[var(--secondary-color)]/10 text-[var(--secondary-color)] rounded-lg text-sm hover:bg-[var(--secondary-color)]/20 transition-colors"
                    >
                      Выполнить
                    </button>
                  )}
                </div>
              </div>
            )) : (
              <div className="col-span-full text-center py-12">
                <div className="text-6xl mb-4">📊</div>
                <h3 className="text-xl font-semibold text-[var(--text-primary)] mb-2">Нет сигналов</h3>
                <p className="text-[var(--text-secondary)]">Сигналы появятся здесь после их получения из каналов</p>
              </div>
            )}
          </div>
        ) : (
          /* Table View */
          <div className="card">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-[var(--surface-dark)] border-b border-[var(--border-color)]">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">Канал</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">Символ</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">Направление</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">Вход</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">Цель</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">Стоп</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">Статус</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">Время</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">Действия</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-color)]">
                  {filteredSignals.length > 0 ? filteredSignals.map(signal => (
                    <tr key={signal.id} className="hover:bg-[var(--surface-dark)]/50 transition-colors">
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-[var(--text-primary)]">
                          {signal.channelName || signal.channel || 'Неизвестный канал'}
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="text-sm font-bold text-[var(--text-primary)]">
                          {signal.coin || signal.symbol || 'Неизвестно'}
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-medium rounded ${getStatusBadge(signal.direction)}`}>
                          {signal.direction || 'Неизвестно'}
                        </span>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-[var(--text-primary)]">
                        ${formatPrice(signal.entryPrice)}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-[var(--text-primary)]">
                        {signal.takeProfitLevels && signal.takeProfitLevels.length > 0
                          ? `$${formatPrice(signal.takeProfitLevels[0])}`
                          : '-'}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-[var(--text-primary)]">
                        {signal.stopLoss ? `$${formatPrice(signal.stopLoss)}` : '-'}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-medium rounded ${
                          signal.status === 'pending' ? 'bg-[var(--accent-color)]/20 text-[var(--accent-color)]' :
                          signal.status === 'executed' ? 'bg-[var(--secondary-color)]/20 text-[var(--secondary-color)]' :
                          signal.status === 'failed' ? 'bg-[var(--danger-color)]/20 text-[var(--danger-color)]' :
                          'bg-[var(--text-secondary)]/20 text-[var(--text-secondary)]'
                        }`}>
                          {signal.status === 'pending' ? 'Ожидает' :
                           signal.status === 'executed' ? 'Выполнен' :
                           signal.status === 'failed' ? 'Провален' : signal.status}
                        </span>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-[var(--text-secondary)]">
                        {formatDateTime(signal.processedAt || signal.createdAt)}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex space-x-2">
                          <button
                            onClick={() => showSignalDetails(signal)}
                            className="px-2 py-1 bg-[var(--primary-color)]/10 text-[var(--primary-color)] rounded text-xs hover:bg-[var(--primary-color)]/20 transition-colors"
                          >
                            Детали
                          </button>
                          {signal.status === 'pending' && (
                            <>
                              <button
                                onClick={() => executeSignal(signal.id)}
                                className="px-2 py-1 bg-[var(--secondary-color)]/10 text-[var(--secondary-color)] rounded text-xs hover:bg-[var(--secondary-color)]/20 transition-colors"
                              >
                                Выполнить
                              </button>
                              <button
                                onClick={() => ignoreSignal(signal.id)}
                                className="px-2 py-1 bg-[var(--danger-color)]/10 text-[var(--danger-color)] rounded text-xs hover:bg-[var(--danger-color)]/20 transition-colors"
                              >
                                Игнорировать
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan="9" className="px-4 py-12 text-center">
                        <div className="text-6xl mb-4">📊</div>
                        <h3 className="text-xl font-semibold text-[var(--text-primary)] mb-2">Нет сигналов</h3>
                        <p className="text-[var(--text-secondary)]">Сигналы появятся здесь после их получения из каналов</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Empty State */}
        {filteredSignals.length === 0 && (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-[var(--surface-dark)] rounded-xl flex items-center justify-center mx-auto mb-4">
              <div className="icon-inbox text-2xl text-[var(--text-secondary)]"></div>
            </div>
            <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">Нет активных сигналов</h3>
            <p className="text-[var(--text-secondary)] mb-6">Добавьте Telegram каналы для получения торговых сигналов</p>
            <button className="btn-primary">
              Добавить первый канал
            </button>
          </div>
        )}

        {/* Signal Details Modal */}
        {showDetailsModal && selectedSignal && (
          <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 pt-20">
            <div className="card max-w-4xl w-full max-h-[80vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-semibold text-[var(--text-primary)]">
                  Детали сигнала
                </h3>
                <button
                  onClick={() => setShowDetailsModal(false)}
                  className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                  <span className="text-2xl">✕</span>
                </button>
              </div>

              <div className="space-y-6">
                {/* Basic Information */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="text-lg font-medium text-[var(--text-primary)] mb-4">Основная информация</h4>
                    <div className="space-y-3">
                      <div className="flex justify-between">
                        <span className="text-[var(--text-secondary)]">Канал:</span>
                        <span className="text-[var(--text-primary)] font-medium">{selectedSignal.channelName || selectedSignal.channel || 'Неизвестный канал'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[var(--text-secondary)]">Символ:</span>
                        <span className="text-[var(--text-primary)] font-medium">{selectedSignal.coin || selectedSignal.symbol || 'Неизвестно'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[var(--text-secondary)]">Направление:</span>
                        <span className={`font-medium ${getStatusColor(selectedSignal.direction)}`}>
                          {selectedSignal.direction || 'Неизвестно'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[var(--text-secondary)]">Статус:</span>
                        <span className={`font-medium ${
                          selectedSignal.status === 'pending' ? 'text-[var(--accent-color)]' :
                          selectedSignal.status === 'executed' ? 'text-[var(--secondary-color)]' :
                          selectedSignal.status === 'failed' ? 'text-[var(--danger-color)]' :
                          'text-[var(--text-secondary)]'
                        }`}>
                          {selectedSignal.status === 'pending' ? 'Ожидает' :
                           selectedSignal.status === 'executed' ? 'Выполнен' :
                           selectedSignal.status === 'failed' ? 'Провален' : selectedSignal.status}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[var(--text-secondary)]">Время получения:</span>
                        <span className="text-[var(--text-primary)] font-medium">{formatDateTime(selectedSignal.processedAt || selectedSignal.createdAt)}</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-lg font-medium text-[var(--text-primary)] mb-4">Торговые параметры</h4>
                    <div className="space-y-3">
                      <div className="flex justify-between">
                        <span className="text-[var(--text-secondary)]">Цена входа:</span>
                        <span className="text-[var(--text-primary)] font-medium">${formatPrice(selectedSignal.entryPrice)}</span>
                      </div>
                      {selectedSignal.takeProfitLevels && Array.isArray(selectedSignal.takeProfitLevels) && selectedSignal.takeProfitLevels.length > 0 && (
                        <div>
                          <span className="text-[var(--text-secondary)]">Цели:</span>
                          <div className="mt-1 space-y-1">
                            {selectedSignal.takeProfitLevels.map((level, index) => (
                              <div key={index} className="text-[var(--text-primary)] font-medium">
                                TP{index + 1}: ${formatPrice(level)}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {selectedSignal.stopLoss && (
                        <div className="flex justify-between">
                          <span className="text-[var(--text-secondary)]">Стоп-лосс:</span>
                          <span className="text-[var(--text-primary)] font-medium">${formatPrice(selectedSignal.stopLoss)}</span>
                        </div>
                      )}
                      {selectedSignal.leverage && (
                        <div className="flex justify-between">
                          <span className="text-[var(--text-secondary)]">Плечо:</span>
                          <span className="text-[var(--accent-color)] font-medium">{selectedSignal.leverage}x</span>
                        </div>
                      )}
                      {selectedSignal.suggestedVolume && (
                        <div className="flex justify-between">
                          <span className="text-[var(--text-secondary)]">Рекомендуемый объем:</span>
                          <span className="text-[var(--text-primary)] font-medium">{selectedSignal.suggestedVolume}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Raw Message */}
                <div>
                  <h4 className="text-lg font-medium text-[var(--text-primary)] mb-4">Исходное сообщение</h4>
                  <div className="bg-[var(--surface-dark)] rounded-lg p-4 border border-[var(--border-color)]">
                    <pre className="text-[var(--text-primary)] whitespace-pre-wrap text-sm">
                      {typeof selectedSignal.rawMessage === 'object'
                        ? JSON.stringify(selectedSignal.rawMessage, null, 2)
                        : selectedSignal.rawMessage || 'Сообщение недоступно'}
                    </pre>
                  </div>
                </div>

                {/* Analysis Results */}
                {selectedSignal.parsedData && typeof selectedSignal.parsedData === 'object' && (
                  <div>
                    <h4 className="text-lg font-medium text-[var(--text-primary)] mb-4">Результаты анализа</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <h5 className="font-medium text-[var(--text-primary)] mb-2">Анализ ChatGPT</h5>
                        <div className="bg-[var(--surface-dark)] rounded-lg p-4 border border-[var(--border-color)]">
                          <pre className="text-[var(--text-secondary)] whitespace-pre-wrap text-sm">
                            {typeof selectedSignal.parsedData.analysis === 'object'
                              ? JSON.stringify(selectedSignal.parsedData.analysis, null, 2)
                              : selectedSignal.parsedData.analysis || 'Анализ недоступен'}
                          </pre>
                        </div>
                      </div>
                      <div>
                        <h5 className="font-medium text-[var(--text-primary)] mb-2">Обоснование</h5>
                        <div className="bg-[var(--surface-dark)] rounded-lg p-4 border border-[var(--border-color)]">
                          <pre className="text-[var(--text-secondary)] whitespace-pre-wrap text-sm">
                            {typeof selectedSignal.parsedData.reasoning === 'object'
                              ? JSON.stringify(selectedSignal.parsedData.reasoning, null, 2)
                              : selectedSignal.parsedData.reasoning || 'Обоснование недоступно'}
                          </pre>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Confidence Score */}
                {selectedSignal.confidenceScore && (
                  <div>
                    <h4 className="text-lg font-medium text-[var(--text-primary)] mb-4">Уверенность в сигнале</h4>
                    <div className="flex items-center space-x-4">
                      <div className="flex-1">
                        <div className="flex justify-between text-sm mb-1">
                          <span>Уровень уверенности</span>
                          <span>{(selectedSignal.confidenceScore * 100).toFixed(1)}%</span>
                        </div>
                        <div className="w-full bg-[var(--surface-dark)] rounded-full h-2">
                          <div
                            className="bg-gradient-to-r from-[var(--primary-color)] to-[var(--secondary-color)] h-2 rounded-full"
                            style={{ width: `${selectedSignal.confidenceScore * 100}%` }}
                          ></div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex justify-end space-x-3 pt-4 border-t border-[var(--border-color)]">
                  <button
                    onClick={() => setShowDetailsModal(false)}
                    className="px-6 py-2 bg-[var(--surface-dark)] text-[var(--text-secondary)] rounded-lg border border-[var(--border-color)] hover:bg-[var(--background-dark)] transition-colors"
                  >
                    Закрыть
                  </button>
                  {selectedSignal.status === 'pending' && (
                    <>
                      <button
                        onClick={() => {
                          executeSignal(selectedSignal.id);
                          setShowDetailsModal(false);
                        }}
                        className="px-6 py-2 bg-[var(--secondary-color)]/10 text-[var(--secondary-color)] rounded-lg hover:bg-[var(--secondary-color)]/20 transition-colors"
                      >
                        Выполнить
                      </button>
                      <button
                        onClick={() => {
                          ignoreSignal(selectedSignal.id);
                          setShowDetailsModal(false);
                        }}
                        className="px-6 py-2 bg-[var(--danger-color)]/10 text-[var(--danger-color)] rounded-lg hover:bg-[var(--danger-color)]/20 transition-colors"
                      >
                        Игнорировать
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  } catch (error) {
    console.error('SignalsPanel component error:', error);
    return null;
  }
}

// Make SignalsPanel available globally for browser environment
if (typeof window !== 'undefined') {
  window.SignalsPanel = SignalsPanel;
}
