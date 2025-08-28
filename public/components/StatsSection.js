function StatsSection() {
  try {
    const stats = [
      {
        icon: 'users',
        value: '12,547',
        label: 'Активных пользователей',
        change: '+15%'
      },
      {
        icon: 'trending-up',
        value: '89.3%',
        label: 'Успешных сигналов',
        change: '+2.1%'
      },
      {
        icon: 'message-circle',
        value: '156',
        label: 'Подключенных каналов',
        change: '+8'
      },
      {
        icon: 'dollar-sign',
        value: '$2.4M',
        label: 'Объем торгов за месяц',
        change: '+23%'
      }
    ];

    return (
      <section className="py-16 px-4 sm:px-6 lg:px-8" data-name="stats-section" data-file="components/StatsSection.js">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {stats.map((stat, index) => (
              <div key={index} className="stats-card">
                <div className="flex items-center justify-center mb-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-[var(--primary-color)] to-[var(--secondary-color)] rounded-lg flex items-center justify-center">
                    <div className={`icon-${stat.icon} text-xl text-white`}></div>
                  </div>
                </div>

                <div className="text-3xl font-bold text-[var(--text-primary)] mb-1">
                  {stat.value}
                </div>

                <div className="text-[var(--text-secondary)] text-sm mb-3">
                  {stat.label}
                </div>

                <div className="flex items-center justify-center">
                  <div className="flex items-center space-x-1 text-[var(--secondary-color)] text-sm">
                    <div className="icon-trending-up text-xs"></div>
                    <span>{stat.change}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  } catch (error) {
    console.error('StatsSection component error:', error);
    return null;
  }
}