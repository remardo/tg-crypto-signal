# 🚀 VPS Deployment Guide

## Быстрое развертывание

### Автоматическое развертывание (рекомендуется)

```bash
# 1. Скачайте и запустите скрипт развертывания
curl -fsSL https://raw.githubusercontent.com/remardo/tg-crypto-signal/main/deploy-vps.sh | bash

# 2. Настройте переменные окружения
nano /var/www/tg-crypto-signal/.env

# 3. Перезапустите приложение
pm2 restart tg-crypto-signal
```

### Ручное развертывание

```bash
# 1. Обновите систему
sudo apt update && sudo apt upgrade -y

# 2. Установите Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 3. Установите PostgreSQL и Redis
sudo apt install -y postgresql postgresql-contrib redis-server

# 4. Установите PM2
sudo npm install -g pm2

# 5. Клонируйте репозиторий
git clone https://github.com/remardo/tg-crypto-signal.git /var/www/tg-crypto-signal
cd /var/www/tg-crypto-signal

# 6. Установите зависимости
npm install

# 7. Соберите фронтенд
npm run build

# 8. Настройте базу данных
sudo -u postgres createdb tg_crypto_signal
sudo -u postgres createuser --interactive --pwprompt tg_crypto_user
npm run migrate

# 9. Настройте .env файл
cp .env.example .env
nano .env

# 10. Запустите приложение
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

## 📋 Скрипты развертывания

### Основные скрипты

| Скрипт | Описание | Запуск |
|--------|----------|---------|
| `deploy-vps.sh` | Полное автоматическое развертывание | `bash deploy-vps.sh` |
| `update-vps.sh` | Обновление существующего развертывания | `bash update-vps.sh` |
| `setup-nginx.sh` | Настройка Nginx reverse proxy | `sudo bash setup-nginx.sh` |
| `setup-ssl.sh` | Настройка SSL с Let's Encrypt | `sudo bash setup-ssl.sh domain.com` |

### Дополнительные скрипты

- `backup.sh` - Создание резервных копий
- `monitor.sh` - Мониторинг системы

## ⚙️ Конфигурация

### Переменные окружения (.env)

Обязательные переменные:
```bash
# Database
DATABASE_URL=postgresql://username:password@localhost:5432/tg_crypto_signal

# Redis
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password

# JWT
JWT_SECRET=your_jwt_secret

# Telegram Bot
TELEGRAM_BOT_TOKEN=your_bot_token

# BingX API
BINGX_API_KEY=your_api_key
BINGX_SECRET_KEY=your_secret_key

# OpenAI
OPENAI_API_KEY=your_openai_key
```

### База данных

```bash
# Создание базы данных
sudo -u postgres createdb tg_crypto_signal

# Создание пользователя
sudo -u postgres createuser --interactive --pwprompt tg_crypto_user

# Запуск миграций
npm run migrate
```

### Redis

```bash
# Запуск Redis
sudo systemctl start redis-server
sudo systemctl enable redis-server

# Проверка статуса
sudo systemctl status redis-server
```

## 🌐 Настройка веб-сервера

### Nginx Reverse Proxy

```bash
# Запустите скрипт настройки
sudo bash setup-nginx.sh

# Проверьте конфигурацию
sudo nginx -t

# Перезапустите Nginx
sudo systemctl restart nginx
```

### SSL сертификат

```bash
# Получите SSL сертификат
sudo bash setup-ssl.sh yourdomain.com

# Проверьте сертификат
certbot certificates
```

## 📊 Мониторинг и управление

### PM2 команды

```bash
# Статус процессов
pm2 status

# Просмотр логов
pm2 logs tg-crypto-signal

# Перезапуск
pm2 restart tg-crypto-signal

# Мониторинг
pm2 monit

# Сохранение конфигурации
pm2 save
```

### Системный мониторинг

```bash
# Запустите скрипт мониторинга
./monitor.sh

# Проверка здоровья приложения
curl http://localhost:3000/health
```

## 🔧 Обновление

### Автоматическое обновление

```bash
# Запустите скрипт обновления
bash update-vps.sh
```

### Ручное обновление

```bash
cd /var/www/tg-crypto-signal

# Остановите приложение
pm2 stop tg-crypto-signal

# Получите обновления
git pull origin main

# Установите зависимости (если изменились)
npm install

# Соберите фронтенд
npm run build

# Запустите миграции (если есть новые)
npm run migrate

# Запустите приложение
pm2 start ecosystem.config.js
```

## 🔒 Безопасность

### Firewall

```bash
# Разрешить необходимые порты
sudo ufw allow ssh
sudo ufw allow 80
sudo ufw allow 443
sudo ufw allow 3000

# Включить firewall
sudo ufw --force enable
```

### Fail2Ban

```bash
# Установка
sudo apt install -y fail2ban

# Настройка
sudo cp /etc/fail2ban/jail.conf /etc/fail2ban/jail.local
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

## 🚨 Устранение неполадок

### Проблема: Приложение не запускается

```bash
# Проверьте логи
pm2 logs tg-crypto-signal

# Проверьте статус служб
sudo systemctl status postgresql
sudo systemctl status redis-server

# Проверьте переменные окружения
cat /var/www/tg-crypto-signal/.env
```

### Проблема: Ошибка подключения к базе данных

```bash
# Проверьте подключение
sudo -u postgres psql -c "SELECT version();"

# Проверьте права пользователя
sudo -u postgres psql -c "SELECT * FROM pg_user WHERE usename = 'tg_crypto_user';"
```

### Проблема: Ошибка сборки фронтенда

```bash
# Очистите node_modules
rm -rf node_modules package-lock.json

# Переустановите зависимости
npm install

# Соберите фронтенд
npm run build
```

## 📞 Поддержка

Если возникли проблемы:

1. Проверьте логи: `pm2 logs tg-crypto-signal`
2. Проверьте статус: `pm2 status`
3. Создайте issue на GitHub с описанием проблемы
4. Включите вывод команд диагностики

## 🎯 Быстрые команды

```bash
# Проверка статуса
pm2 status && sudo systemctl status postgresql redis-server nginx

# Просмотр логов
pm2 logs tg-crypto-signal --lines 50

# Перезапуск всех служб
pm2 restart tg-crypto-signal && sudo systemctl restart postgresql redis-server nginx

# Создание резервной копии
./backup.sh

# Мониторинг системы
./monitor.sh
```
