function ChannelManager({ channels = [], onRefresh }) {
  try {
  const [showModal, setShowModal] = React.useState(false);
  const [editingChannel, setEditingChannel] = React.useState(null);
  const [formData, setFormData] = React.useState({
    name: '',
    telegramChannelId: '',
    isActive: true,
    isPaused: false,
  autoExecute: false,
    maxPositionPercentage: 100,
    riskPercentage: 2,
    tpPercentages: [25.0, 25.0, 50.0]
  });

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

        const data = await response.json();

        if (!response.ok) {
          // Extract the actual error message from the response body
          const errorMessage = data.error?.details || data.error?.message || data.message || `HTTP error! status: ${response.status}`;
          throw new Error(errorMessage);
        }

        return data;
      } catch (error) {
        console.error('API call failed:', error);
        throw error;
      }
    };

    const toggleChannelStatus = async (channel) => {
      try {
        // Determine which endpoint to call based on current channel state
        const endpoint = (channel.isActive && !channel.isPaused) ? 'pause' : 'resume';
        await apiCall(`/channels/${channel.id}/${endpoint}`, { method: 'POST' });
        if (onRefresh) onRefresh();
      } catch (error) {
        console.error('Failed to toggle channel status:', error);
        alert('Ошибка при изменении статуса канала');
      }
    };

    const openAddModal = () => {
      setEditingChannel(null);
      setFormData({
        name: '',
        telegramChannelId: '',
        isActive: true,
        isPaused: false,
  autoExecute: false,
        maxPositionPercentage: 100,
        riskPercentage: 2,
        tpPercentages: [25.0, 25.0, 50.0]
      });
      setShowModal(true);
    };

    const openEditModal = (channel) => {
      setEditingChannel(channel);
      setFormData({
        name: channel.name,
        telegramChannelId: channel.telegramChannelId,
        isActive: channel.isActive,
        isPaused: channel.isPaused,
  autoExecute: !!channel.autoExecute,
        maxPositionPercentage: channel.maxPositionPercentage || 100,
        riskPercentage: channel.riskPercentage || 2,
        tpPercentages: channel.tpPercentages || [25.0, 25.0, 50.0]
      });
      setShowModal(true);
    };

    const handleSubmit = async (e) => {
      e.preventDefault();
      try {
        if (editingChannel) {
          // Update existing channel
          await apiCall(`/channels/${editingChannel.id}`, {
            method: 'PUT',
            body: formData
          });
        } else {
          // Create new channel
          await apiCall('/channels', {
            method: 'POST',
            body: formData
          });
        }

        setShowModal(false);
        setEditingChannel(null);
        resetForm();
        if (onRefresh) onRefresh();

        // Show success message
        const message = editingChannel ? 'Канал успешно обновлен!' : 'Канал успешно добавлен!';
        if (typeof window !== 'undefined' && window.showNotification) {
          window.showNotification(message, 'success');
        } else {
          alert(message);
        }
      } catch (error) {
        console.error('Failed to save channel:', error);

        // Provide specific error messages based on the error
        let errorMessage = 'Ошибка при сохранении канала';

        if (error.message) {
          if (error.message.includes('уже существует') || error.message.includes('already exists')) {
            errorMessage = '❌ Канал с таким Telegram ID уже существует!\n\n💡 Решение: Используйте другой Telegram ID канала.';
          } else if (error.message.includes('required') || error.message.includes('обязательны')) {
            errorMessage = '❌ Пожалуйста, заполните все обязательные поля:\n• Название канала\n• Telegram Channel ID';
          } else if (error.message.includes('percentage') || error.message.includes('процент')) {
            errorMessage = '❌ Проверьте правильность процентных значений:\n• TP проценты должны суммироваться до 100%\n• Значения должны быть от 0.1 до 100';
          } else if (error.message.includes('Telegram') || error.message.includes('бот')) {
            errorMessage = '⚠️ Проблема с подключением к Telegram:\n• Проверьте корректность ID канала\n• Убедитесь, что бот имеет доступ к каналу';
          } else if (error.message.includes('BingX') || error.message.includes('суб-аккаунт')) {
            errorMessage = '⚠️ Проблема с созданием торгового аккаунта:\n• Повторите попытку позже\n• Свяжитесь с администратором если проблема persists';
          } else {
            errorMessage = `❌ Ошибка: ${error.message}`;
          }
        }

        alert(errorMessage);
      }
    };

    const resetForm = () => {
      setFormData({
        name: '',
        telegramChannelId: '',
        isActive: true,
        isPaused: false,
  autoExecute: false,
        maxPositionPercentage: 100,
        riskPercentage: 2,
        tpPercentages: [25.0, 25.0, 50.0]
      });
    };

    const deleteChannel = async (channelId) => {
      if (confirm('Вы уверены, что хотите удалить этот канал?')) {
        try {
          await apiCall(`/channels/${channelId}`, { method: 'DELETE' });
          if (onRefresh) onRefresh();
        } catch (error) {
          console.error('Failed to delete channel:', error);

          // Provide specific error messages based on the error
          let errorMessage = 'Ошибка при удалении канала';

          if (error.message) {
            if (error.message.includes('open positions') || error.message.includes('открытых позиций')) {
              errorMessage = '❌ Невозможно удалить канал с открытыми позициями!\n\n💡 Решение: Закройте все открытые позиции перед удалением канала.';
            } else if (error.message.includes('foreign key') || error.message.includes('внешнего ключа') || error.message.includes('FOREIGN_KEY_CONSTRAINT')) {
              errorMessage = '❌ Невозможно удалить канал из-за связанных данных!\n\n💡 Решение: Свяжитесь с администратором для принудительного удаления.';
            } else if (error.message.includes('not found') || error.message.includes('не найден')) {
              errorMessage = '❌ Канал не найден!\n\n💡 Решение: Обновите страницу и попробуйте снова.';
            } else if (error.message.includes('permission') || error.message.includes('доступ')) {
              errorMessage = '❌ Недостаточно прав для удаления канала!\n\n💡 Решение: Обратитесь к администратору.';
            } else {
              errorMessage = `❌ Ошибка: ${error.message}`;
            }
          }

          alert(errorMessage);
        }
      }
    };

    const toggleAutoExecute = async (channel) => {
      try {
        await apiCall(`/channels/${channel.id}`, {
          method: 'PUT',
          body: { autoExecute: !channel.autoExecute }
        });
        if (onRefresh) onRefresh();
      } catch (error) {
        console.error('Failed to toggle auto-execution:', error);
        alert('Ошибка при переключении режима следования сигналам');
      }
    };

    return (
      <div data-name="channel-manager" data-file="components/ChannelManager.js">
        {/* Add Channel Button */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-xl font-semibold text-[var(--text-primary)]">Подключенные каналы</h2>
            <p className="text-sm text-[var(--text-secondary)] mt-1">
              Всего каналов: {channels.length} | Активных: {channels.filter(ch => ch.isActive && !ch.isPaused).length}
            </p>
          </div>
          <button
            onClick={openAddModal}
            className="btn-secondary"
          >
            <div className="flex items-center space-x-2">
              <span className="text-lg">+</span>
              <span>Добавить канал</span>
            </div>
          </button>
        </div>

        {/* Channels Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {channels.map(channel => (
            <div key={channel.id} className="card hover:card-glow transition-all duration-300">
              {/* Channel Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 bg-gradient-to-br from-[var(--primary-color)] to-[var(--secondary-color)] rounded-lg flex items-center justify-center">
                    <span className="text-white text-xl">📡</span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-[var(--text-primary)]">{channel.name}</h3>
                    <p className="text-sm text-[var(--text-secondary)]">@{channel.telegramChannelId}</p>
                  </div>
                </div>
                
                  <div className="flex items-center space-x-2">
                    <div className={`px-3 py-1 rounded-full text-xs font-medium ${
                      channel.isActive && !channel.isPaused 
                        ? 'bg-[var(--secondary-color)]/20 text-[var(--secondary-color)]'
                        : 'bg-[var(--accent-color)]/20 text-[var(--accent-color)]'
                    }`}>
                      {channel.isActive && !channel.isPaused ? 'Активен' : 'Приостановлен'}
                    </div>
                    <div className={`px-3 py-1 rounded-full text-xs font-medium ${
                      channel.autoExecute
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'bg-sky-500/20 text-sky-400'
                    }`} title="Режим следования сигналам">
                      {channel.autoExecute ? 'Авто' : 'Ручной'}
                    </div>
                  </div>
              </div>

              {/* Channel Stats */}
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <div className="text-sm text-[var(--text-secondary)]">Сигналов</div>
                  <div className="font-semibold text-[var(--text-primary)]">{channel.signalCount || 0}</div>
                </div>
                <div>
                  <div className="text-sm text-[var(--text-secondary)]">Успешность</div>
                  <div className="font-semibold text-[var(--secondary-color)]">{channel.successRate || 0}%</div>
                </div>
                <div>
                  <div className="text-sm text-[var(--text-secondary)]">P&L</div>
                  <div className="font-semibold text-[var(--secondary-color)]">+{channel.totalPnL || 0}%</div>
                </div>
                <div>
                  <div className="text-sm text-[var(--text-secondary)]">Активных позиций</div>
                  <div className="font-semibold text-[var(--text-primary)]">{channel.activePositions || 0}</div>
                </div>
              </div>

              {/* Channel Actions */}
              <div className="flex space-x-2 pt-4 border-t border-[var(--border-color)]">
                <button
                  onClick={() => toggleAutoExecute(channel)}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    channel.autoExecute
                      ? 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
                      : 'bg-sky-500/10 text-sky-400 hover:bg-sky-500/20'
                  }`}
                  title="Переключить режим Авто/Ручной"
                >
                  {channel.autoExecute ? 'Отключить авто' : 'Включить авто'}
                </button>
                <button
                  onClick={() => toggleChannelStatus(channel)}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    channel.isActive && !channel.isPaused
                      ? 'bg-[var(--accent-color)]/10 text-[var(--accent-color)] hover:bg-[var(--accent-color)]/20'
                      : 'bg-[var(--secondary-color)]/10 text-[var(--secondary-color)] hover:bg-[var(--secondary-color)]/20'
                  }`}
                >
                  {channel.isActive && !channel.isPaused ? 'Приостановить' : 'Активировать'}
                </button>
                <button
                  onClick={() => openEditModal(channel)}
                  className="flex-1 px-3 py-2 bg-gradient-to-r from-[var(--primary-color)]/10 to-[var(--secondary-color)]/10 text-[var(--primary-color)] rounded-lg text-sm hover:from-[var(--primary-color)]/20 hover:to-[var(--secondary-color)]/20 transition-all duration-300 transform hover:scale-105"
                  title="Редактировать настройки канала"
                >
                  <div className="flex items-center justify-center space-x-2">
                    <span className="text-lg">⚙️</span>
                    <span>Настроить</span>
                  </div>
                </button>
                <button 
                  onClick={() => deleteChannel(channel.id)}
                  className="px-3 py-2 bg-[var(--danger-color)]/10 text-[var(--danger-color)] rounded-lg text-sm hover:bg-[var(--danger-color)]/20 transition-colors"
                >
                  <span className="text-sm">🗑️</span>
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Modal Form */}
        {showModal && (
          <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 pt-20">
            <div className="card max-w-md w-full">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-[var(--text-primary)]">
                  {editingChannel ? 'Редактировать канал' : 'Добавить канал'}
                </h3>
                <button 
                  onClick={() => setShowModal(false)}
                  className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                  <span className="text-xl">✕</span>
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                    Название канала
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    className="input-field w-full"
                    placeholder="Введите название канала"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                    Telegram Channel ID
                  </label>
                  <input
                    type="text"
                    value={formData.telegramChannelId}
                    onChange={(e) => setFormData({...formData, telegramChannelId: e.target.value})}
                    className={`input-field w-full ${editingChannel ? 'bg-[var(--surface-dark)] text-[var(--text-secondary)] cursor-not-allowed' : ''}`}
                    placeholder="@channel_name или channel_id"
                    required
                    readOnly={!!editingChannel}
                    disabled={!!editingChannel}
                  />
                  {editingChannel && (
                    <small className="text-[var(--text-secondary)] mt-1 block">
                      ID канала нельзя изменить после создания
                    </small>
                  )}
                  {!editingChannel && channels.length > 0 && (
                    <div className="mt-2 p-3 bg-[var(--surface-dark)] rounded-lg border border-[var(--border-color)]">
                      <small className="text-[var(--text-secondary)] block mb-2">
                        💡 <strong>Уже существующие каналы:</strong>
                      </small>
                      <div className="flex flex-wrap gap-1">
                        {channels.slice(0, 5).map(channel => (
                          <span key={channel.id} className="inline-block px-2 py-1 bg-[var(--primary-color)]/20 text-[var(--primary-color)] text-xs rounded">
                            {channel.telegramChannelId}
                          </span>
                        ))}
                        {channels.length > 5 && (
                          <span className="text-xs text-[var(--text-secondary)]">
                            ...и ещё {channels.length - 5}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                    Режим следования сигналам
                  </label>
                  <div className="flex items-center justify-between p-3 bg-[var(--surface-dark)] rounded-lg border border-[var(--border-color)]">
                    <span className="text-sm text-[var(--text-secondary)]">Автоматическое исполнение</span>
                    <label className="inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={!!formData.autoExecute}
                        onChange={(e) => setFormData({ ...formData, autoExecute: e.target.checked })}
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500 relative"></div>
                      <span className="ml-3 text-sm font-medium text-[var(--text-primary)]">{formData.autoExecute ? 'Включено' : 'Выключено'}</span>
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                    Максимальный размер позиции (%)
                  </label>
                  <input
                    type="number"
                    value={formData.maxPositionPercentage}
                    onChange={(e) => setFormData({...formData, maxPositionPercentage: Number(e.target.value)})}
                    className="input-field w-full"
                    min="1"
                    max="100"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                    Процент риска (%)
                  </label>
                  <input
                    type="number"
                    value={formData.riskPercentage}
                    onChange={(e) => setFormData({...formData, riskPercentage: Number(e.target.value)})}
                    className="input-field w-full"
                    min="0.1"
                    max="10"
                    step="0.1"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                    TP Проценты (%)
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[0, 1, 2].map(index => (
                      <input
                        key={index}
                        type="number"
                        value={formData.tpPercentages[index]}
                        onChange={(e) => {
                          const newTpPercentages = [...formData.tpPercentages];
                          newTpPercentages[index] = Number(e.target.value);
                          setFormData({...formData, tpPercentages: newTpPercentages});
                        }}
                        className="input-field w-full"
                        min="0.1"
                        max="100"
                        step="0.1"
                        placeholder={`TP${index + 1}`}
                        required
                      />
                    ))}
                  </div>
                </div>

                <div className="flex space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="flex-1 px-4 py-2 bg-[var(--surface-dark)] text-[var(--text-secondary)] rounded-lg border border-[var(--border-color)] hover:bg-[var(--background-dark)] transition-colors"
                  >
                    Отмена
                  </button>
                  <button
                    type="submit"
                    className="flex-1 btn-primary"
                  >
                    {editingChannel ? 'Сохранить' : 'Добавить'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  } catch (error) {
    console.error('ChannelManager component error:', error);
    return null;
  }
}

// Make ChannelManager available globally for browser environment
if (typeof window !== 'undefined') {
  window.ChannelManager = ChannelManager;
}
