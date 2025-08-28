function PnLDashboard({ positions = [], channels = [] }) {
  try {
  const [selectedPeriod, setSelectedPeriod] = React.useState('7d');
  const [selectedChannel, setSelectedChannel] = React.useState('all');

  const periods = [
    { id: '1d', label: '24ч' },
    { id: '7d', label: '7 дней' },
      { id: '30d', label: '30 дней' },
      { id: '90d', label: '3 месяца' }
    ];

    // Create channels array from real data
    const channelOptions = [
      { id: 'all', label: 'Все каналы' },
      ...channels.map(channel => ({
        id: channel.id,
        label: channel.name
      }))
    ];

    // Calculate real P&L data from positions
    const calculatePnLSummary = () => {
      if (!positions || positions.length === 0) {
        return {
          totalPnL: 0,
          totalTrades: 0,
          winRate: 0,
          avgProfit: 0,
          bestTrade: 0,
          worstTrade: 0
        };
      }

      const totalPnL = positions.reduce((sum, pos) => {
        const pnl = parseFloat(pos.unrealizedPnl || 0) + parseFloat(pos.realizedPnl || 0);
        return sum + pnl;
      }, 0);

      const winningTrades = positions.filter(pos => {
        const pnl = parseFloat(pos.unrealizedPnl || 0) + parseFloat(pos.realizedPnl || 0);
        return pnl > 0;
      }).length;

      const winRate = positions.length > 0 ? (winningTrades / positions.length) * 100 : 0;

      const profits = positions.map(pos => {
        const pnl = parseFloat(pos.unrealizedPnl || 0) + parseFloat(pos.realizedPnl || 0);
        return pnl;
      });

      const bestTrade = profits.length > 0 ? Math.max(...profits) : 0;
      const worstTrade = profits.length > 0 ? Math.min(...profits) : 0;
      const avgProfit = positions.length > 0 ? totalPnL / positions.length : 0;

      return {
        totalPnL,
        totalTrades: positions.length,
        winRate: Math.round(winRate * 10) / 10,
        avgProfit: Math.round(avgProfit * 100) / 100,
        bestTrade: Math.round(bestTrade * 100) / 100,
        worstTrade: Math.round(worstTrade * 100) / 100
      };
    };

    // Calculate channel performance from real data
    const calculateChannelPerformance = () => {
      if (!channels || channels.length === 0) return [];

      const colors = ['var(--primary-color)', 'var(--secondary-color)', 'var(--accent-color)', 'var(--danger-color)'];

      return channels.map((channel, index) => {
        // Find positions for this channel
        const channelPositions = positions.filter(pos => pos.channelId === channel.id);
        const pnl = channelPositions.reduce((sum, pos) => {
          const posPnl = parseFloat(pos.unrealizedPnl || 0) + parseFloat(pos.realizedPnl || 0);
          return sum + posPnl;
        }, 0);

        const winningTrades = channelPositions.filter(pos => {
          const posPnl = parseFloat(pos.unrealizedPnl || 0) + parseFloat(pos.realizedPnl || 0);
          return posPnl > 0;
        }).length;

        const winRate = channelPositions.length > 0 ? (winningTrades / channelPositions.length) * 100 : 0;

        return {
          name: channel.name,
          pnl: Math.round(pnl * 100) / 100,
          trades: channelPositions.length,
          winRate: Math.round(winRate * 10) / 10,
          color: colors[index % colors.length]
        };
      });
    };

    // Get recent trades from positions
    const getRecentTrades = () => {
      if (!positions || positions.length === 0) return [];

      return positions.slice(0, 4).map((pos, index) => ({
        id: pos.id || index,
        channel: channels.find(ch => ch.id === pos.channelId)?.name || 'Неизвестный канал',
        pair: pos.symbol || 'N/A',
        type: pos.side || 'N/A',
        pnl: Math.round((parseFloat(pos.unrealizedPnl || 0) + parseFloat(pos.realizedPnl || 0)) * 100) / 100,
        percentage: 0, // Would need entry price to calculate
        time: pos.createdAt ? new Date(pos.createdAt).toLocaleString('ru-RU') : 'Недавно'
      }));
    };

    const pnlSummary = calculatePnLSummary();
    const channelPerformance = calculateChannelPerformance();
    const recentTrades = getRecentTrades();

    return (
      <div data-name="pnl-dashboard" data-file="components/PnLDashboard.js">
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 mb-8">
          <div className="flex gap-2">
            {periods.map(period => (
              <button
                key={period.id}
                onClick={() => setSelectedPeriod(period.id)}
                className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
                  selectedPeriod === period.id
                    ? 'bg-[var(--primary-color)] text-white'
                    : 'bg-[var(--surface-dark)] text-[var(--text-secondary)] border border-[var(--border-color)]'
                }`}
              >
                {period.label}
              </button>
            ))}
          </div>
          
          <select
            value={selectedChannel}
            onChange={(e) => setSelectedChannel(e.target.value)}
            className="input-field"
          >
            {channelOptions.map(channel => (
              <option key={channel.id} value={channel.id}>{channel.label}</option>
            ))}
          </select>
        </div>

        {/* PnL Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
          <div className="stats-card">
            <div className="text-2xl font-bold text-[var(--secondary-color)] mb-1">
              ${pnlSummary.totalPnL.toFixed(2)}
            </div>
            <div className="text-[var(--text-secondary)] text-sm">Общий P&L</div>
          </div>
          
          <div className="stats-card">
            <div className="text-2xl font-bold text-[var(--text-primary)] mb-1">
              {pnlSummary.totalTrades}
            </div>
            <div className="text-[var(--text-secondary)] text-sm">Сделок</div>
          </div>
          
          <div className="stats-card">
            <div className="text-2xl font-bold text-[var(--secondary-color)] mb-1">
              {pnlSummary.winRate}%
            </div>
            <div className="text-[var(--text-secondary)] text-sm">Win Rate</div>
          </div>
          
          <div className="stats-card">
            <div className="text-2xl font-bold text-[var(--accent-color)] mb-1">
              {pnlSummary.avgProfit}%
            </div>
            <div className="text-[var(--text-secondary)] text-sm">Средняя прибыль</div>
          </div>
          
          <div className="stats-card">
            <div className="text-2xl font-bold text-[var(--secondary-color)] mb-1">
              ${pnlSummary.bestTrade}
            </div>
            <div className="text-[var(--text-secondary)] text-sm">Лучшая сделка</div>
          </div>
          
          <div className="stats-card">
            <div className="text-2xl font-bold text-[var(--danger-color)] mb-1">
              ${pnlSummary.worstTrade}
            </div>
            <div className="text-[var(--text-secondary)] text-sm">Худшая сделка</div>
          </div>
        </div>

        {/* Channel Performance */}
        <div className="card mb-8">
          <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-6">Производительность по каналам</h3>
          <div className="space-y-4">
            {channelPerformance.map((channel, index) => (
              <div key={index} className="flex items-center justify-between p-4 bg-[var(--background-dark)] rounded-lg">
                <div className="flex items-center space-x-4">
                  <div 
                    className="w-4 h-4 rounded-full"
                    style={{ backgroundColor: channel.color }}
                  ></div>
                  <div>
                    <div className="font-medium text-[var(--text-primary)]">{channel.name}</div>
                    <div className="text-sm text-[var(--text-secondary)]">{channel.trades} сделок • {channel.winRate}% win rate</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className={`font-bold ${channel.pnl > 0 ? 'text-[var(--secondary-color)]' : 'text-[var(--danger-color)]'}`}>
                    ${channel.pnl.toFixed(2)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Trades */}
        <div className="card">
          <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-6">Последние сделки</h3>
          <div className="space-y-3">
            {recentTrades.map(trade => (
              <div key={trade.id} className="flex items-center justify-between p-4 bg-[var(--background-dark)] rounded-lg">
                <div className="flex items-center space-x-4">
                  <div className={`px-2 py-1 rounded text-xs font-medium ${
                    trade.type === 'LONG' ? 'bg-[var(--secondary-color)]/20 text-[var(--secondary-color)]' : 'bg-[var(--danger-color)]/20 text-[var(--danger-color)]'
                  }`}>
                    {trade.type}
                  </div>
                  <div>
                    <div className="font-medium text-[var(--text-primary)]">{trade.pair}</div>
                    <div className="text-sm text-[var(--text-secondary)]">{trade.channel} • {trade.time}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className={`font-bold ${trade.pnl > 0 ? 'text-[var(--secondary-color)]' : 'text-[var(--danger-color)]'}`}>
                    ${trade.pnl.toFixed(2)}
                  </div>
                  <div className={`text-sm ${trade.percentage > 0 ? 'text-[var(--secondary-color)]' : 'text-[var(--danger-color)]'}`}>
                    {trade.percentage > 0 ? '+' : ''}{trade.percentage}%
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  } catch (error) {
    console.error('PnLDashboard component error:', error);
    return null;
  }
}

// Make PnLDashboard available globally for browser environment
if (typeof window !== 'undefined') {
  window.PnLDashboard = PnLDashboard;
}