function Footer() {
  try {
    const currentYear = new Date().getFullYear();

    return (
      <footer className="bg-[var(--surface-dark)] border-t border-[var(--border-color)] mt-16" data-name="footer" data-file="components/Footer.js">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {/* Company Info */}
            <div className="col-span-1 md:col-span-2">
              <div className="flex items-center mb-4">
                <div className="w-8 h-8 bg-gradient-to-br from-[var(--primary-color)] to-[var(--secondary-color)] rounded-lg flex items-center justify-center mr-3">
                  <div className="icon-zap text-white text-lg"></div>
                </div>
                <span className="text-xl font-bold text-gradient">CryptoSignals Pro</span>
              </div>
              <p className="text-[var(--text-secondary)] mb-6 max-w-md">
                Профессиональная платформа для автоматического копирования торговых сигналов
                из Telegram каналов. Торгуйте как профи с минимальными усилиями.
              </p>
              <div className="flex space-x-4">
                <button className="w-10 h-10 bg-[var(--background-dark)] border border-[var(--border-color)] rounded-lg flex items-center justify-center hover:border-[var(--primary-color)] transition-colors">
                  <div className="icon-twitter text-lg text-[var(--text-secondary)]"></div>
                </button>
                <button className="w-10 h-10 bg-[var(--background-dark)] border border-[var(--border-color)] rounded-lg flex items-center justify-center hover:border-[var(--primary-color)] transition-colors">
                  <div className="icon-send text-lg text-[var(--text-secondary)]"></div>
                </button>
                <button className="w-10 h-10 bg-[var(--background-dark)] border border-[var(--border-color)] rounded-lg flex items-center justify-center hover:border-[var(--primary-color)] transition-colors">
                  <div className="icon-youtube text-lg text-[var(--text-secondary)]"></div>
                </button>
              </div>
            </div>

            {/* Quick Links */}
            <div>
              <h3 className="font-semibold text-[var(--text-primary)] mb-4">Платформа</h3>
              <ul className="space-y-2">
                <li><a href="#" className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">Главная</a></li>
                <li><a href="#" className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">Сигналы</a></li>
                <li><a href="#" className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">Каналы</a></li>
                <li><a href="#" className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">Аналитика</a></li>
              </ul>
            </div>

            {/* Support */}
            <div>
              <h3 className="font-semibold text-[var(--text-primary)] mb-4">Поддержка</h3>
              <ul className="space-y-2">
                <li><a href="#" className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">Справка</a></li>
                <li><a href="#" className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">API документация</a></li>
                <li><a href="#" className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">Контакты</a></li>
                <li><a href="#" className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">Обратная связь</a></li>
              </ul>
            </div>
          </div>

          {/* Bottom Section */}
          <div className="border-t border-[var(--border-color)] mt-8 pt-8 flex flex-col md:flex-row justify-between items-center">
            <p className="text-[var(--text-secondary)] text-sm">
              © {currentYear} CryptoSignals Pro. Все права защищены.
            </p>
            <div className="flex space-x-6 mt-4 md:mt-0">
              <a href="#" className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-sm transition-colors">
                Политика конфиденциальности
              </a>
              <a href="#" className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-sm transition-colors">
                Условия использования
              </a>
            </div>
          </div>
        </div>
      </footer>
    );
  } catch (error) {
    console.error('Footer component error:', error);
    return null;
  }
}