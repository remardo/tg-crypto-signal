# 🔧 Настройка Redis на VPS

## 🚨 Проблема
Redis сервер не запущен или не настроен правильно на вашем VPS.

## ✅ Решение

### Шаг 1: Проверить статус Redis
```bash
# Проверить статус Redis
sudo systemctl status redis-server

# Если не запущен, запустить
sudo systemctl start redis-server

# Включить автозапуск
sudo systemctl enable redis-server
```

### Шаг 2: Проверить конфигурацию Redis
```bash
# Проверить конфигурационный файл
sudo nano /etc/redis/redis.conf

# Основные настройки (убедитесь что установлены):
# bind 127.0.0.1 ::1    # Привязка к localhost
# port 6379             # Порт по умолчанию
# requirepass your_password  # Пароль (если нужен)
```

### Шаг 3: Проверить подключение к Redis
```bash
# Подключиться к Redis CLI
redis-cli ping

# Должен вернуть: PONG
```

### Шаг 4: Проверить .env файл
```bash
# Убедитесь что в .env файле правильные настройки Redis
nano .env

# Должно быть что-то вроде:
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=  # оставьте пустым если пароль не установлен
```

### Шаг 5: Перезапустить приложение
```bash
# Остановить PM2 процесс
pm2 stop tg-crypto-signal

# Перезапустить Redis (на всякий случай)
sudo systemctl restart redis-server

# Запустить приложение снова
pm2 start ecosystem.config.js

# Проверить статус
pm2 status
```

### Шаг 6: Проверить доступность
```bash
# Проверить Redis
redis-cli ping

# Проверить приложение
curl http://localhost:3000/health

# Проверить логи
pm2 logs tg-crypto-signal --lines 20
```

## 🔍 Диагностика проблем

### Если Redis не устанавливается:
```bash
# Установить Redis
sudo apt update
sudo apt install redis-server

# Проверить версию
redis-server --version
```

### Если проблема с памятью:
```bash
# Проверить использование памяти
free -h

# Очистить память если нужно
sudo systemctl restart redis-server
```

### Если проблема с биндингом:
```bash
# Проверить netstat
sudo netstat -tlnp | grep :6379

# Или ss
sudo ss -tlnp | grep :6379
```

## 🛠️ Альтернативные решения

### Использовать Docker Redis:
```bash
# Установить Docker
sudo apt install docker.io

# Запустить Redis в Docker
sudo docker run --name redis -p 6379:6379 -d redis:alpine

# Проверить
sudo docker ps
```

### Использовать Redis Cloud (бесплатный tier):
```bash
# Обновить .env файл
REDIS_HOST=your-redis-cloud-host
REDIS_PORT=6379
REDIS_PASSWORD=your-redis-cloud-password
```

## 📞 Быстрая проверка

Запустите эту команду на вашем VPS:
```bash
# Быстрая диагностика Redis
echo "=== Redis Status ==="
sudo systemctl status redis-server --no-pager -l

echo -e "\n=== Redis Ping ==="
redis-cli ping 2>/dev/null || echo "Redis not responding"

echo -e "\n=== Redis Memory ==="
redis-cli info memory 2>/dev/null | grep used_memory_human || echo "Cannot get memory info"

echo -e "\n=== Port Check ==="
sudo ss -tlnp | grep :6379 || echo "Port 6379 not listening"
```

## 🎯 Следующие шаги

После настройки Redis:

1. **Перезапустите приложение:**
   ```bash
   pm2 restart tg-crypto-signal
   ```

2. **Проверьте логи:**
   ```bash
   pm2 logs tg-crypto-signal --lines 30
   ```

3. **Проверьте доступность:**
   ```bash
   curl http://localhost:3000/health
   ```

4. **Проверьте веб-интерфейс:**
   Откройте браузер и перейдите на `http://your-vps-ip:3000`

## 📋 Полезные команды

```bash
# Управление Redis
sudo systemctl start redis-server     # Запустить
sudo systemctl stop redis-server      # Остановить
sudo systemctl restart redis-server   # Перезапустить
sudo systemctl status redis-server    # Статус

# Работа с Redis CLI
redis-cli ping                        # Проверка подключения
redis-cli info                        # Информация о сервере
redis-cli keys "*"                    # Список всех ключей
redis-cli flushall                    # Очистить все данные

# Мониторинг
redis-cli monitor                     # Мониторинг команд
redis-cli info stats                  # Статистика
```
