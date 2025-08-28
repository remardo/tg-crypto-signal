function FeaturesSection() {
  try {
    const features = [
      {
        icon: 'bot',
        title: 'AI-анализ сигналов',
        description: 'Искусственный интеллект анализирует качество сигналов и отфильтровывает ложные срабатывания',
        color: 'var(--primary-color)'
      },
      {
        icon: 'settings',
        title: 'Гибкие настройки',
        description: 'Настройка размера позиций, стоп-лоссов, тейк-профитов для каждого канала индивидуально',
        color: 'var(--secondary-color)'
      },
      {
        icon: 'smartphone',
        title: 'Мобильное приложение',
        description: 'Контролируйте торги и получайте уведомления где бы вы ни находились',
        color: 'var(--accent-color)'
      },
      {
        icon: 'link',
        title: 'Интеграция с биржами',
        description: 'Поддержка всех популярных криптобирж: Binance, Bybit, OKX, Kucoin и других',
        color: 'var(--primary-color)'
      },
      {
        icon: 'bar-chart-3',
        title: 'Детальная отчетность',
        description: 'Полная статистика по каждому каналу, сигналу и сделке с визуализацией данных',
        color: 'var(--secondary-color)'
      },
      {
        icon: 'shield',
        title: 'Управление рисками',
        description: 'Продвинутые алгоритмы управления рисками для защиты вашего капитала',
        color: 'var(--accent-color)'
      }
    ];

    return (
      <section className="py-16 px-4 sm:px-6 lg:px-8" data-name="features-section" data-file="components/FeaturesSection.js">
        <div className="max-w-7xl mx-auto">
          {/* Section Header */}
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-[var(--text-primary)] mb-4">
              Мощные возможности для
              <span className="text-gradient"> профессиональных трейдеров</span>
            </h2>
            <p className="text-xl text-[var(--text-secondary)] max-w-3xl mx-auto">
              Все необходимые инструменты для автоматизации торговли криптовалютами
              на основе сигналов из Telegram каналов
            </p>
          </div>

          {/* Features Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <div key={index} className="card hover:card-glow transition-all duration-300 group">
                <div className="flex items-start space-x-4">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform duration-200"
                    style={{ backgroundColor: `${feature.color}20` }}
                  >
                    <div
                      className={`icon-${feature.icon} text-xl`}
                      style={{ color: feature.color }}
                    ></div>
                  </div>

                  <div>
                    <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-3">
                      {feature.title}
                    </h3>
                    <p className="text-[var(--text-secondary)] leading-relaxed">
                      {feature.description}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* CTA Section */}
          <div className="text-center mt-16">
            <div className="card max-w-2xl mx-auto bg-gradient-to-r from-[var(--primary-color)]/10 to-[var(--secondary-color)]/10 border border-[var(--primary-color)]/20">
              <h3 className="text-2xl font-bold text-[var(--text-primary)] mb-4">
                Готовы начать автоматическую торговлю?
              </h3>
              <p className="text-[var(--text-secondary)] mb-6">
                Присоединитесь к тысячам трейдеров, которые уже используют наш сервис
              </p>
              <button className="btn-primary mr-4">
                Создать аккаунт
              </button>
              <button className="text-[var(--primary-color)] hover:text-blue-300 font-medium">
                Узнать больше →
              </button>
            </div>
          </div>
        </div>
      </section>
    );
  } catch (error) {
    console.error('FeaturesSection component error:', error);
    return null;
  }
}