function LoginModal({ isOpen, onClose, onLogin }) {
  try {
    const [email, setEmail] = React.useState('');
    const [password, setPassword] = React.useState('');
    const [isLoading, setIsLoading] = React.useState(false);
    const [error, setError] = React.useState('');

    const handleSubmit = async (e) => {
      e.preventDefault();
      setIsLoading(true);
      setError('');

      try {
        // Simulate API call
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Simple authentication (replace with real API call)
        if (email === 'admin@cryptosignals.com' && password === 'admin123') {
          onLogin({ email, name: 'Администратор' });
          onClose();
        } else {
          setError('Неверный email или пароль');
        }
      } catch (err) {
        setError('Ошибка при входе в систему');
      } finally {
        setIsLoading(false);
      }
    };

    if (!isOpen) return null;

    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-[var(--surface-dark)] rounded-3xl p-8 w-full max-w-md border border-[var(--border-color)] shadow-2xl">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-gradient-to-br from-[var(--primary-color)] to-[var(--secondary-color)] rounded-2xl flex items-center justify-center mx-auto mb-4">
              <div className="icon-zap text-2xl text-white"></div>
            </div>
            <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-2">Вход в систему</h2>
            <p className="text-[var(--text-secondary)]">CryptoSignals Pro</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-field w-full"
                placeholder="admin@cryptosignals.com"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                Пароль
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field w-full"
                placeholder="••••••••"
                required
              />
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-6 py-3 border border-[var(--border-color)] rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--primary-color)] transition-all duration-200"
              >
                Отмена
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="flex-1 btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <div className="flex items-center justify-center space-x-2">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    <span>Вход...</span>
                  </div>
                ) : (
                  'Войти'
                )}
              </button>
            </div>
          </form>

          <div className="mt-6 text-center">
            <p className="text-[var(--text-secondary)] text-sm">
              Демо аккаунт: admin@cryptosignals.com / admin123
            </p>
          </div>
        </div>
      </div>
    );
  } catch (error) {
    console.error('LoginModal component error:', error);
    return null;
  }
}