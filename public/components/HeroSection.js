function HeroSection() {
  try {
    return (
      <section className="pt-24 pb-16 px-4 sm:px-6 lg:px-8" data-name="hero-section" data-file="components/HeroSection.js">
        <div className="max-w-7xl mx-auto">
          <div className="text-center">
            {/* Main Heading */}
            <h1 className="text-4xl md:text-6xl font-bold mb-6">
              <span className="text-gradient">Автоматическое</span>
              <br />
              <span className="text-[var(--text-primary)]">копирование сигналов</span>
            </h1>

            {/* Subheading */}
            <p className="text-xl text-[var(--text-secondary)] mb-8 max-w-3xl mx-auto">
              Подключайтесь к лучшим Telegram каналам с торговыми сигналами и автоматически
              копируйте сделки на ваш криптовалютный обменник
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
              <button className="btn-primary text-lg px-8 py-4">
                <div className="flex items-center justify-center space-x-2">
                  <div className="icon-play text-xl"></div>
                  <span>Начать бесплатно</span>
                </div>
              </button>
              <button className="btn-secondary text-lg px-8 py-4">
                <div className="flex items-center justify-center space-x-2">
                  <div className="icon-video text-xl"></div>
                  <span>Смотреть демо</span>
                </div>
              </button>
            </div>

            {/* Feature Highlights */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
              <div className="flex flex-col items-center">
                <div className="w-16 h-16 bg-[var(--primary-color)]/10 rounded-xl flex items-center justify-center mb-4">
                  <div className="icon-zap text-2xl text-[var(--primary-color)]"></div>
                </div>
                <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">Мгновенное копирование</h3>
                <p className="text-[var(--text-secondary)] text-center">
                  Сигналы копируются автоматически в режиме реального времени
                </p>
              </div>

              <div className="flex flex-col items-center">
                <div className="w-16 h-16 bg-[var(--secondary-color)]/10 rounded-xl flex items-center justify-center mb-4">
                  <div className="icon-shield-check text-2xl text-[var(--secondary-color)]"></div>
                </div>
                <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">Безопасность</h3>
                <p className="text-[var(--text-secondary)] text-center">
                  Полный контроль над рисками с настройкой лимитов и стоп-лоссов
                </p>
              </div>

              <div className="flex flex-col items-center">
                <div className="w-16 h-16 bg-[var(--accent-color)]/10 rounded-xl flex items-center justify-center mb-4">
                  <div className="icon-trending-up text-2xl text-[var(--accent-color)]"></div>
                </div>
                <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">Аналитика</h3>
                <p className="text-[var(--text-secondary)] text-center">
                  Детальная статистика по каждому каналу и сигналу
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  } catch (error) {
    console.error('HeroSection component error:', error);
    return null;
  }
}