// Web Interface for Crypto Trading Bot
class TradingBotInterface {
    constructor() {
        this.apiBaseUrl = '/api';
        this.socket = null;
        this.currentPage = 'dashboard';
        this.isConnected = false;
        this.refreshInterval = null;
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.setupNavigation();
        this.setupModals();
        this.loadDashboard();
        this.startAutoRefresh();
        this.checkConnectionStatus();
    }

    // Event Listeners Setup
    setupEventListeners() {
        // Refresh button
        document.getElementById('refresh-btn').addEventListener('click', () => {
            this.refreshCurrentPage();
        });

        // Add channel button
        document.getElementById('add-channel-btn').addEventListener('click', () => {
            this.openModal('add-channel-modal');
        });

        // Add channel form
        document.getElementById('add-channel-form').addEventListener('submit', (e) => {
            this.handleAddChannel(e);
        });

        // Edit channel form
        document.getElementById('edit-channel-form').addEventListener('submit', (e) => {
            this.handleEditChannel(e);
        });

        // Settings form
        document.getElementById('general-settings-form').addEventListener('submit', (e) => {
            this.handleSaveSettings(e);
        });
        
        // Risk management toggle
        document.getElementById('save-risk-settings').addEventListener('click', () => {
            this.handleRiskManagementToggle();
        });
        
        // Risk management checkbox change
        document.getElementById('disable-risk-management').addEventListener('change', (e) => {
            this.updateRiskStatus(e.target.checked);
        });

        // Filter changes
        document.getElementById('signal-filter-channel').addEventListener('change', () => {
            this.loadSignals();
        });

        document.getElementById('signal-filter-status').addEventListener('change', () => {
            this.loadSignals();
        });
        
        // TP percentage management
        document.getElementById('add-tp-level').addEventListener('click', () => {
            const container = document.querySelector('.tp-percentages-container');
            this.addTPLevel(container);
        });
        
        // TP percentage input listeners for add channel modal
        document.addEventListener('input', (e) => {
            if (e.target.classList.contains('tp-input')) {
                this.updateTPSummaryFromContainer();
            }
        });
    }

    // Navigation Setup
    setupNavigation() {
        const menuLinks = document.querySelectorAll('.menu-link');
        menuLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const page = link.getAttribute('data-page');
                this.navigateToPage(page);
            });
        });
    }

    navigateToPage(page) {
        // Update active menu item
        document.querySelectorAll('.menu-link').forEach(link => {
            link.classList.remove('active');
        });
        document.querySelector(`[data-page="${page}"]`).classList.add('active');

        // Update page title
        const titles = {
            dashboard: 'Дашборд',
            channels: 'Каналы',
            signals: 'Сигналы',
            positions: 'Позиции',
            settings: 'Настройки'
        };
        document.getElementById('page-title').textContent = titles[page] || page;

        // Show/hide pages
        document.querySelectorAll('.page').forEach(pageEl => {
            pageEl.classList.remove('active');
        });
        document.getElementById(`${page}-page`).classList.add('active');

        this.currentPage = page;
        this.loadPageData(page);
    }

    loadPageData(page) {
        switch (page) {
            case 'dashboard':
                this.loadDashboard();
                break;
            case 'channels':
                this.loadChannels();
                break;
            case 'signals':
                this.loadSignals();
                break;
            case 'positions':
                this.loadPositions();
                break;
            case 'settings':
                this.loadSettings();
                break;
        }
    }

    // Modal Management
    setupModals() {
        // Close modal buttons
        document.querySelectorAll('.modal-close, #cancel-add-channel, #cancel-edit-channel').forEach(btn => {
            btn.addEventListener('click', () => {
                this.closeAllModals();
            });
        });

        // Close modal on outside click
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.closeAllModals();
                }
            });
        });

        // Escape key to close modals
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeAllModals();
            }
        });
    }

    openModal(modalId) {
        document.getElementById(modalId).classList.add('active');
    }

    closeAllModals() {
        document.querySelectorAll('.modal').forEach(modal => {
            modal.classList.remove('active');
        });
    }

    // API Calls
    async apiCall(endpoint, options = {}) {
        try {
            console.log('API Call:', endpoint, options);
            
            const response = await fetch(`${this.apiBaseUrl}${endpoint}`, {
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                },
                ...options
            });

            console.log('Response status:', response.status);
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({
                    message: `HTTP error! status: ${response.status}`
                }));
                console.log('Error response:', errorData);
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            console.log('Response data:', data);
            return data;
        } catch (error) {
            console.error('API call failed:', error);
            this.showError(`API call failed: ${error.message}`);
            throw error;
        }
    }

    // Dashboard Management
    async loadDashboard() {
        try {
            this.showLoading('recent-signals', 'Загрузка данных дашборда...');
            
            // Load statistics
            await this.loadStatistics();
            
            // Load system status
            await this.loadSystemStatus();
            
            // Load recent signals
            await this.loadRecentSignals();
            
            // Load P&L by channel
            await this.loadPnLByChannel();
            
        } catch (error) {
            console.error('Failed to load dashboard:', error);
        }
    }

    async loadStatistics() {
        try {
            const response = await this.apiCall('/dashboard/stats');
            const stats = response.data || response; // Handle both wrapped and direct response
            
            document.getElementById('total-channels').textContent = stats.totalChannels || 0;
            document.getElementById('total-signals').textContent = stats.signalsToday || 0;
            document.getElementById('open-positions').textContent = stats.openPositions || 0;
            
            const pnl = parseFloat(stats.totalPnl) || 0;
            const pnlElement = document.getElementById('total-pnl');
            pnlElement.textContent = `$${pnl.toFixed(2)}`;
            pnlElement.style.color = pnl >= 0 ? '#28a745' : '#dc3545';
            
        } catch (error) {
            console.error('Failed to load statistics:', error);
        }
    }

    async loadSystemStatus() {
        try {
            const response = await this.apiCall('/dashboard/system-status');
            const status = response.data || response; // Handle both wrapped and direct response
            
            const services = ['telegram', 'redis', 'postgres', 'bingx'];
            services.forEach(service => {
                const element = document.getElementById(`${service}-status`);
                const isActive = status[service]?.active || false;
                
                element.textContent = isActive ? 'Активен' : 'Неактивен';
                element.className = `status-badge ${isActive ? 'active' : 'inactive'}`;
            });
            
        } catch (error) {
            console.error('Failed to load system status:', error);
            this.setSystemStatusLoading();
        }
    }

    setSystemStatusLoading() {
        const services = ['telegram', 'redis', 'postgres', 'bingx'];
        services.forEach(service => {
            const element = document.getElementById(`${service}-status`);
            element.textContent = 'Загрузка...';
            element.className = 'status-badge loading';
        });
    }

    async loadRecentSignals() {
        try {
            const response = await this.apiCall('/signals?limit=10');
            const container = document.getElementById('recent-signals');
            
            // Handle different response structures
            let signalsData = [];
            if (response.data && response.data.signals && Array.isArray(response.data.signals)) {
                signalsData = response.data.signals;
            } else if (response.data && Array.isArray(response.data)) {
                signalsData = response.data;
            } else if (Array.isArray(response)) {
                signalsData = response;
            } else if (response.signals && Array.isArray(response.signals)) {
                signalsData = response.signals;
            }
            
            console.log('Recent signals API response:', response); // Debug log
            console.log('Recent signals data:', signalsData); // Debug log
            
            if (!signalsData || signalsData.length === 0) {
                container.innerHTML = '<p class="loading">Нет недавних сигналов</p>';
                return;
            }
            
            container.innerHTML = signalsData.map(signal => `
                <div class="signal-item">
                    <div class="signal-header">
                        <span class="signal-coin">${signal.coin}</span>
                        <span class="signal-direction ${signal.direction.toLowerCase()}">${signal.direction}</span>
                    </div>
                    <div class="signal-details">
                        Цена входа: $${signal.entryPrice || 'N/A'} | 
                        Плечо: ${signal.leverage || 'N/A'}x | 
                        ${this.formatDateTime(signal.processedAt)}
                    </div>
                </div>
            `).join('');
            
        } catch (error) {
            console.error('Failed to load recent signals:', error);
            document.getElementById('recent-signals').innerHTML = 
                '<p class="error">Ошибка загрузки сигналов</p>';
        }
    }

    async loadPnLByChannel() {
        try {
            const response = await this.apiCall('/dashboard/pnl-by-channel');
            const channelsPnL = response.data || [];
            
            const container = document.getElementById('channels-pnl');
            
            if (!channelsPnL || channelsPnL.length === 0) {
                container.innerHTML = '<p class="loading">Нет данных по каналам</p>';
                return;
            }
            
            // Sort by P&L descending
            channelsPnL.sort((a, b) => b.totalPnL - a.totalPnL);
            
            container.innerHTML = `
                <div class="channels-pnl-header">
                    <h3>P&L по каналам</h3>
                    <button id="reset-pnl-btn" class="btn btn-danger btn-sm">Очистить позиции и P&L</button>
                </div>
                <div class="channels-pnl-grid">
                    ${channelsPnL.map(channel => `
                        <div class="channel-pnl-item">
                            <div class="channel-name">${channel.channelName || 'Неизвестный канал'}</div>
                            <div class="channel-pnl-values">
                                <div class="pnl-value">
                                    <span class="pnl-label">Общий P&L:</span>
                                    <span class="pnl-amount ${(parseFloat(channel.totalPnL) || 0) >= 0 ? 'positive' : 'negative'}">
                                        $${(parseFloat(channel.totalPnL) || 0).toFixed(2)}
                                    </span>
                                </div>
                                <div class="pnl-value">
                                    <span class="pnl-label">Реализованный:</span>
                                    <span class="pnl-amount ${(parseFloat(channel.totalRealizedPnl) || 0) >= 0 ? 'positive' : 'negative'}">
                                        $${(parseFloat(channel.totalRealizedPnl) || 0).toFixed(2)}
                                    </span>
                                </div>
                                <div class="pnl-value">
                                    <span class="pnl-label">Нереализованный:</span>
                                    <span class="pnl-amount ${(parseFloat(channel.totalUnrealizedPnl) || 0) >= 0 ? 'positive' : 'negative'}">
                                        $${(parseFloat(channel.totalUnrealizedPnl) || 0).toFixed(2)}
                                    </span>
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
            
            // Add event listener to reset button
            document.getElementById('reset-pnl-btn').addEventListener('click', this.handleResetPnL.bind(this));
            
        } catch (error) {
            console.error('Failed to load P&L by channel:', error);
            document.getElementById('channels-pnl').innerHTML = 
                '<p class="error">Ошибка загрузки P&L по каналам</p>';
        }
    }

    // Channels Management
    async loadChannels() {
        try {
            this.showLoading('channels-table', 'Загрузка каналов...');
            
            console.log('Loading channels...'); // Debug log
            const response = await this.apiCall('/channels');
            console.log('Raw API response:', response); // Debug log
            
            const container = document.getElementById('channels-table');
            
            // Handle API response structure: {success: true, data: {channels: [...], total: n}}
            let channelsData = [];
            if (response.data && response.data.channels && Array.isArray(response.data.channels)) {
                channelsData = response.data.channels;
            } else if (response.data && Array.isArray(response.data)) {
                channelsData = response.data;
            } else if (Array.isArray(response)) {
                channelsData = response;
            }
            
            console.log('Parsed channels data:', channelsData); // Debug log
            
            if (!channelsData || channelsData.length === 0) {
                container.innerHTML = '<p class="loading">Нет добавленных каналов</p>';
                return;
            }
            
            container.innerHTML = `
                <table class="table">
                    <thead>
                        <tr>
                            <th>Название</th>
                            <th>Telegram ID</th>
                            <th>Статус</th>
                            <th>Авто-исполнение</th>
                            <th>Риск %</th>
                            <th>Действия</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${channelsData.map(channel => {
                            // Channel data is already in the top level for getAllChannels
                            // but might be nested for getChannelDetails
                            const channelInfo = channel.channel || channel;
                            console.log('Processing channel:', JSON.stringify(channelInfo, null, 2)); // Debug log with proper formatting
                            return `
                            <tr>
                                <td>${channelInfo.name || 'N/A'}</td>
                                <td>${channelInfo.telegramChannelId || 'N/A'}</td>
                                <td>
                                    <span class="status-badge ${channelInfo.isActive && !channelInfo.isPaused ? 'active' : 'inactive'}">
                                        ${channelInfo.isActive ? (channelInfo.isPaused ? 'Приостановлен' : 'Активен') : 'Неактивен'}
                                    </span>
                                </td>
                                <td>${channelInfo.autoExecute ? 'Да' : 'Нет'}</td>
                                <td>${channelInfo.riskPercentage || 'N/A'}%</td>
                                <td>
                                    <div class="action-buttons">
                                        <button class="btn btn-sm btn-primary" onclick="app.editChannel('${channelInfo.id}')">
                                            ✏️
                                        </button>
                                        <button class="btn btn-sm ${channelInfo.isPaused ? 'btn-success' : 'btn-warning'}" 
                                                onclick="app.toggleChannel('${channelInfo.id}', ${channelInfo.isPaused})">
                                            ${channelInfo.isPaused ? '▶️' : '⏸️'}
                                        </button>
                                    </div>
                                </td>
                            </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            `;
            
        } catch (error) {
            console.error('Failed to load channels:', error);
            this.showError('Ошибка загрузки каналов');
        }
    }

    async handleAddChannel(event) {
        event.preventDefault();
        
        const formData = new FormData(event.target);
        
        // Получаем и валидируем данные
        const telegramChannelId = formData.get('telegramChannelId')?.trim();
        const name = formData.get('name')?.trim();
        const description = formData.get('description')?.trim() || '';
        const riskPercentageStr = formData.get('riskPercentage')?.trim();
        const autoExecute = formData.get('autoExecute') === 'on';
        
        // Проверяем обязательные поля
        if (!telegramChannelId) {
            this.showError('Telegram Channel ID обязателен');
            return;
        }
        
        if (!name) {
            this.showError('Название канала обязательно');
            return;
        }
        
        // Валидируем и конвертируем riskPercentage
        const riskPercentage = parseFloat(riskPercentageStr);
        if (isNaN(riskPercentage) || riskPercentage < 0.1 || riskPercentage > 20) {
            this.showError('Риск должен быть числом от 0.1 до 20');
            return;
        }
        
        // Собираем и валидируем TP проценты
        const tpPercentages = [];
        const tpInputs = document.querySelectorAll('.tp-input');
        let totalPercentage = 0;
        
        for (let input of tpInputs) {
            if (input.value.trim()) {
                const percentage = parseFloat(input.value);
                if (isNaN(percentage) || percentage < 0.1 || percentage > 100) {
                    this.showError('Все TP проценты должны быть числами от 0.1 до 100');
                    return;
                }
                tpPercentages.push(percentage);
                totalPercentage += percentage;
            }
        }
        
        if (tpPercentages.length === 0) {
            this.showError('Необходимо указать хотя бы один TP процент');
            return;
        }
        
        if (Math.abs(totalPercentage - 100) > 0.1) {
            this.showError(`Сумма TP процентов должна быть 100%, а сейчас ${totalPercentage.toFixed(1)}%`);
            return;
        }
        
        const channelData = {
            telegramChannelId,
            name,
            description,
            riskPercentage,
            autoExecute,
            tpPercentages
        };
        
        // Debug logging
        console.log('Sending channel data:', channelData);
        console.log('Form data raw:', {
            telegramChannelId: formData.get('telegramChannelId'),
            name: formData.get('name'),
            description: formData.get('description'),
            riskPercentage: formData.get('riskPercentage'),
            autoExecute: formData.get('autoExecute')
        });
        
        try {
            console.log('Sending API request to add channel...'); // Debug log
            const result = await this.apiCall('/channels', {
                method: 'POST',
                body: JSON.stringify(channelData)
            });
            console.log('Channel added successfully:', result); // Debug log
            
            this.showSuccess('Канал успешно добавлен');
            this.closeAllModals();
            event.target.reset();
            
            // Always reload channels after successful addition
            console.log('Reloading channels list...'); // Debug log
            await this.loadChannels();
            
            // Switch to channels page if not already there
            if (this.currentPage !== 'channels') {
                this.showPage('channels');
            }
            
        } catch (error) {
            console.error('Failed to add channel:', error);
            this.showError('Ошибка добавления канала');
        }
    }

    async toggleChannel(channelId, isPaused) {
        try {
            console.log(`Toggling channel ${channelId} - current isPaused: ${isPaused}`);
            
            // If currently paused, resume it. If currently running, pause it.
            const endpoint = isPaused ? 'resume' : 'pause';
            const result = await this.apiCall(`/channels/${channelId}/${endpoint}`, {
                method: 'POST'
            });
            
            console.log('Toggle result:', result);
            
            this.showSuccess(`Канал ${isPaused ? 'возобновлен' : 'приостановлен'}`);
            this.loadChannels();
            
        } catch (error) {
            console.error('Failed to toggle channel:', error);
            this.showError('Ошибка изменения статуса канала');
        }
    }

    // Channel editing function
    async editChannel(channelId) {
        try {
            console.log('Loading channel data for editing:', channelId);
            
            // Load channel details
            const response = await this.apiCall(`/channels/${channelId}`);
            const channelData = response.data.channel || response.data;
            
            console.log('Channel data loaded:', channelData);
            
            // Populate the form
            document.getElementById('edit-channel-telegram-id').value = channelData.telegramChannelId || '';
            document.getElementById('edit-channel-name').value = channelData.name || '';
            document.getElementById('edit-channel-description').value = channelData.description || '';
            document.getElementById('edit-channel-risk').value = channelData.riskPercentage || 2;
            document.getElementById('edit-channel-max-position').value = channelData.maxPositionPercentage || 10;
            document.getElementById('edit-channel-auto-execute').checked = channelData.autoExecute || false;
            
            // Populate TP percentages
            this.populateTPPercentages(channelData.tpPercentages || [25.0, 25.0, 50.0]);
            
            // Store channel ID for submission
            document.getElementById('edit-channel-form').dataset.channelId = channelId;
            
            // Show the modal
            this.openModal('edit-channel-modal');
            
        } catch (error) {
            console.error('Failed to load channel for editing:', error);
            this.showError('Ошибка загрузки данных канала');
        }
    }

    // Handle edit channel form submission
    async handleEditChannel(event) {
        event.preventDefault();
        
        const channelId = event.target.dataset.channelId;
        if (!channelId) {
            this.showError('Ошибка: ID канала не найден');
            return;
        }
        
        const formData = new FormData(event.target);
        
        // Validate and collect data
        const name = formData.get('name')?.trim();
        const description = formData.get('description')?.trim() || '';
        const riskPercentageStr = formData.get('riskPercentage')?.trim();
        const maxPositionPercentageStr = formData.get('maxPositionPercentage')?.trim();
        const autoExecute = formData.get('autoExecute') === 'on';
        
        // Validation
        if (!name) {
            this.showError('Название канала обязательно');
            return;
        }
        
        const riskPercentage = parseFloat(riskPercentageStr);
        if (isNaN(riskPercentage) || riskPercentage < 0.1 || riskPercentage > 20) {
            this.showError('Риск должен быть числом от 0.1 до 20');
            return;
        }
        
        const maxPositionPercentage = parseFloat(maxPositionPercentageStr);
        if (isNaN(maxPositionPercentage) || maxPositionPercentage < 1 || maxPositionPercentage > 100) {
            this.showError('Максимальный размер позиции должен быть от 1 до 100');
            return;
        }
        
        // Собираем и валидируем TP проценты
        const tpPercentages = [];
        const tpInputs = document.querySelectorAll('#edit-tp-container .tp-input');
        let totalPercentage = 0;
        
        for (let input of tpInputs) {
            if (input.value.trim()) {
                const percentage = parseFloat(input.value);
                if (isNaN(percentage) || percentage < 0.1 || percentage > 100) {
                    this.showError('Все TP проценты должны быть числами от 0.1 до 100');
                    return;
                }
                tpPercentages.push(percentage);
                totalPercentage += percentage;
            }
        }
        
        if (tpPercentages.length === 0) {
            this.showError('Необходимо указать хотя бы один TP процент');
            return;
        }
        
        if (Math.abs(totalPercentage - 100) > 0.1) {
            this.showError(`Сумма TP процентов должна быть 100%, а сейчас ${totalPercentage.toFixed(1)}%`);
            return;
        }
        
        const updateData = {
            name,
            description,
            riskPercentage,
            maxPositionPercentage,
            autoExecute,
            tpPercentages
        };
        
        console.log('Updating channel:', channelId, updateData);
        
        try {
            const result = await this.apiCall(`/channels/${channelId}`, {
                method: 'PUT',
                body: JSON.stringify(updateData)
            });
            
            console.log('Channel updated successfully:', result);
            
            this.showSuccess('Канал успешно обновлен');
            this.closeAllModals();
            
            // Reload channels list
            if (this.currentPage === 'channels') {
                this.loadChannels();
            }
            
        } catch (error) {
            console.error('Failed to update channel:', error);
            this.showError('Ошибка обновления канала');
        }
    }

    // Signals Management
    async loadSignals() {
        try {
            this.showLoading('signals-table', 'Загрузка сигналов...');
            
            const channelFilter = document.getElementById('signal-filter-channel').value;
            const statusFilter = document.getElementById('signal-filter-status').value;
            
            let query = '?limit=50';
            if (channelFilter) query += `&channelId=${channelFilter}`;
            if (statusFilter) query += `&status=${statusFilter}`;
            
            const response = await this.apiCall(`/signals${query}`);
            const container = document.getElementById('signals-table');
            
            console.log('Signals API response:', response); // Debug log
            
            // Handle different response structures
            let signalsData = [];
            if (response.data && response.data.signals && Array.isArray(response.data.signals)) {
                signalsData = response.data.signals;
            } else if (response.data && Array.isArray(response.data)) {
                signalsData = response.data;
            } else if (Array.isArray(response)) {
                signalsData = response;
            } else if (response.signals && Array.isArray(response.signals)) {
                signalsData = response.signals;
            }
            
            console.log('Parsed signals data:', signalsData); // Debug log
            
            if (!signalsData || signalsData.length === 0) {
                container.innerHTML = '<p class="loading">Нет сигналов для отображения</p>';
                return;
            }
            
            container.innerHTML = `
                <table class="table">
                    <thead>
                        <tr>
                            <th>Время</th>
                            <th>Монета</th>
                            <th>Направление</th>
                            <th>Цена входа</th>
                            <th>Плечо</th>
                            <th>Статус</th>
                            <th>Действия</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${signalsData.map(signal => `
                            <tr>
                                <td>${this.formatDateTime(signal.processedAt)}</td>
                                <td>${signal.coin}</td>
                                <td>
                                    <span class="signal-direction ${signal.direction.toLowerCase()}">
                                        ${signal.direction}
                                    </span>
                                </td>
                                <td>$${signal.entryPrice || 'N/A'}</td>
                                <td>${signal.leverage || 'N/A'}x</td>
                                <td>
                                    <span class="status-badge ${this.getStatusClass(signal.status)}">
                                        ${this.getStatusText(signal.status)}
                                    </span>
                                </td>
                                <td>
                                    <div class="action-buttons">
                                        ${signal.status === 'pending' ? `
                                            <button class="btn btn-sm btn-success" onclick="app.executeSignal('${signal.id}')">
                                                <i class="fas fa-play"></i>
                                            </button>
                                            <button class="btn btn-sm btn-danger" onclick="app.ignoreSignal('${signal.id}')">
                                                <i class="fas fa-times"></i>
                                            </button>
                                        ` : ''}
                                    </div>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
            
        } catch (error) {
            console.error('Failed to load signals:', error);
            this.showError('Ошибка загрузки сигналов');
        }
    }

    async executeSignal(signalId) {
        try {
            await this.apiCall(`/signals/${signalId}/execute`, {
                method: 'POST'
            });
            
            this.showSuccess('Сигнал отправлен на исполнение');
            this.loadSignals();
            
        } catch (error) {
            console.error('Failed to execute signal:', error);
            this.showError('Ошибка выполнения сигнала');
        }
    }

    async ignoreSignal(signalId) {
        try {
            await this.apiCall(`/signals/${signalId}/ignore`, {
                method: 'POST'
            });
            
            this.showSuccess('Сигнал проигнорирован');
            this.loadSignals();
            
        } catch (error) {
            console.error('Failed to ignore signal:', error);
            this.showError('Ошибка игнорирования сигнала');
        }
    }

    // Positions Management
    async loadPositions() {
        try {
            this.showLoading('positions-table', 'Загрузка позиций...');
            
            const positions = await this.apiCall('/positions');
            const container = document.getElementById('positions-table');
            
            if (!positions.data || positions.data.length === 0) {
                container.innerHTML = '<p class="loading">Нет открытых позиций</p>';
                return;
            }
            
            container.innerHTML = `
                <table class="table">
                    <thead>
                        <tr>
                            <th>Символ</th>
                            <th>Сторона</th>
                            <th>Размер</th>
                            <th>Цена входа</th>
                            <th>Текущая цена</th>
                            <th>P&L</th>
                            <th>Статус</th>
                            <th>Действия</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${positions.data.map(position => `
                            <tr>
                                <td>${position.symbol}</td>
                                <td>
                                    <span class="signal-direction ${position.side.toLowerCase()}">
                                        ${position.side}
                                    </span>
                                </td>
                                <td>${position.quantity}</td>
                                <td>$${position.entry_price || 'N/A'}</td>
                                <td>$${position.current_price || 'N/A'}</td>
                                <td style="color: ${this.getPnlColor(position)}">
                                    $${this.getPnlValue(position)}
                                </td>
                                <td>
                                    <span class="status-badge ${this.getStatusClass(position.status)}">
                                        ${this.getStatusText(position.status)}
                                    </span>
                                </td>
                                <td>
                                    <div class="action-buttons">
                                        ${position.status === 'open' ? `
                                            <button class="btn btn-sm btn-danger" onclick="app.closePosition('${position.id}')">
                                                <i class="fas fa-times"></i> Закрыть
                                            </button>
                                        ` : ''}
                                    </div>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
            
        } catch (error) {
            console.error('Failed to load positions:', error);
            this.showError('Ошибка загрузки позиций');
        }
    }

    async closePosition(positionId) {
        if (!confirm('Вы уверены, что хотите закрыть эту позицию?')) {
            return;
        }
        
        try {
            await this.apiCall(`/positions/${positionId}/close`, {
                method: 'POST'
            });
            
            this.showSuccess('Позиция закрыта');
            this.loadPositions();
            
        } catch (error) {
            console.error('Failed to close position:', error);
            this.showError('Ошибка закрытия позиции');
        }
    }

    // Settings Management
    async loadSettings() {
        try {
            // Load current settings (implement if API exists)
            console.log('Loading settings...');
            
            // Load risk management status
            await this.loadRiskManagementStatus();
            
        } catch (error) {
            console.error('Failed to load settings:', error);
        }
    }
    
    async loadRiskManagementStatus() {
        try {
            // Get current risk management status from localStorage or API
            const riskDisabled = localStorage.getItem('riskManagementDisabled') === 'true';
            document.getElementById('disable-risk-management').checked = riskDisabled;
            this.updateRiskStatus(riskDisabled);
        } catch (error) {
            console.error('Failed to load risk management status:', error);
        }
    }
    
    updateRiskStatus(disabled) {
        const statusElement = document.getElementById('risk-management-status');
        const statusContainer = statusElement.closest('.risk-status');
        
        if (disabled) {
            statusElement.innerHTML = `
                <span class="status-icon">⚠️</span>
                <span class="status-text">Отключен</span>
            `;
            statusContainer.classList.add('disabled');
        } else {
            statusElement.innerHTML = `
                <span class="status-icon">🛡️</span>
                <span class="status-text">Активен</span>
            `;
            statusContainer.classList.remove('disabled');
        }
    }
    
    async handleRiskManagementToggle() {
        const disabled = document.getElementById('disable-risk-management').checked;
        
        try {
            // Show confirmation dialog for disabling risk management
            if (disabled) {
                const confirmed = confirm(
                    'ВНИМАНИЕ!\n\n' +
                    'Вы действительно хотите отключить все проверки риск-менеджмента?\n\n' +
                    'При отключении бот будет принимать ВСЕ сигналы без проверки качества и риска!\n\n' +
                    'Это может привести к значительным убыткам!'
                );
                
                if (!confirmed) {
                    document.getElementById('disable-risk-management').checked = false;
                    this.updateRiskStatus(false);
                    return;
                }
            }
            
            // Save to localStorage
            localStorage.setItem('riskManagementDisabled', disabled.toString());
            
            // Call API to update backend setting
            await this.apiCall('/settings/risk-management', {
                method: 'POST',
                body: JSON.stringify({ disabled })
            });
            
            this.updateRiskStatus(disabled);
            
            if (disabled) {
                this.showNotification('⚠️ Риск-менеджмент отключен! Будьте осторожны!', 'error');
            } else {
                this.showSuccess('🛡️ Риск-менеджмент включен');
            }
            
        } catch (error) {
            console.error('Failed to update risk management setting:', error);
            this.showError('Ошибка изменения настроек риск-менеджмента');
            
            // Revert checkbox state on error
            document.getElementById('disable-risk-management').checked = !disabled;
            this.updateRiskStatus(!disabled);
        }
    }
    
    async handleResetPnL() {
        // Show confirmation dialog before resetting
        const confirmed = confirm(
            '⚠️ ВНИМАНИЕ! ⚠️\n\n' +
            'Вы действительно хотите очистить все позиции?\n\n' +
            'Это действие:\n' +
            '- Удаляет все закрытые и частично закрытые позиции\n' +
            '- Очищает кэш позиций\n\n' +
            'Это действие необратимо.'
        );
        
        if (!confirmed) {
            return;
        }
        
        try {
            this.showLoading('channels-pnl', 'Очистка позиций и P&L...');
            
            // Call API to reset positions and P&L
            const result = await this.apiCall('/positions/reset', {
                method: 'POST'
            });
            
            console.log('Reset result:', result);
            
            this.showSuccess(`Позиции успешно очищены. Удалено ${result.data.deletedPositions} позиций.`);
            
            // Reload dashboard data
            await this.loadDashboard();
            
        } catch (error) {
            console.error('Failed to reset positions and P&L:', error);
            this.showError('Ошибка очистки позиций и P&L');
        }
    }

    async handleSaveSettings(event) {
        event.preventDefault();
        
        const formData = new FormData(event.target);
        const settings = {
            autoExecute: formData.get('autoExecute') === 'on',
            defaultRisk: parseFloat(formData.get('defaultRisk'))
        };
        
        try {
            // Save settings (implement if API exists)
            console.log('Saving settings:', settings);
            this.showSuccess('Настройки сохранены');
            
        } catch (error) {
            console.error('Failed to save settings:', error);
            this.showError('Ошибка сохранения настроек');
        }
    }

    // Connection Status
    async checkConnectionStatus() {
        try {
            // Use the correct health endpoint path
            const response = await fetch('/health');
            if (response.ok) {
                this.setConnectionStatus(true);
            } else {
                this.setConnectionStatus(false);
            }
        } catch (error) {
            this.setConnectionStatus(false);
        }
        
        // Check again in 30 seconds
        setTimeout(() => this.checkConnectionStatus(), 30000);
    }

    setConnectionStatus(connected) {
        this.isConnected = connected;
        const statusElement = document.getElementById('connection-status');
        
        statusElement.className = `status-indicator ${connected ? 'connected' : 'disconnected'}`;
        statusElement.innerHTML = `
            ${connected ? '🟢' : '🔴'}
            <span>${connected ? 'Подключено' : 'Отключено'}</span>
        `;
    }

    // Auto Refresh
    startAutoRefresh() {
        this.refreshInterval = setInterval(() => {
            if (this.isConnected) {
                this.refreshCurrentPage();
            }
        }, 30000); // Refresh every 30 seconds
    }

    refreshCurrentPage() {
        this.loadPageData(this.currentPage);
    }

    // Utility Methods
    showLoading(containerId, message = 'Загрузка...') {
        document.getElementById(containerId).innerHTML = 
            `<p class="loading">${message}</p>`;
    }

    showError(message) {
        this.showNotification(message, 'error');
    }

    showSuccess(message) {
        this.showNotification(message, 'success');
    }

    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <span>${message}</span>
            <button class="notification-close">&times;</button>
        `;
        
        // Add to page
        document.body.appendChild(notification);
        
        // Auto remove after 5 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 5000);
        
        // Manual close
        notification.querySelector('.notification-close').addEventListener('click', () => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        });
    }

    formatDateTime(dateString) {
        if (!dateString) return 'N/A';
        
        const date = new Date(dateString);
        return date.toLocaleString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    getStatusClass(status) {
        const classes = {
            pending: 'loading',
            approved: 'active',
            executed: 'active',
            ignored: 'inactive',
            failed: 'inactive',
            closed: 'inactive',
            open: 'active'
        };
        return classes[status] || 'inactive';
    }

    getStatusText(status) {
        const texts = {
            pending: 'Ожидание',
            approved: 'Одобрено',
            executed: 'Выполнено',
            ignored: 'Игнорировано',
            failed: 'Ошибка',
            closed: 'Закрыто',
            open: 'Открыто',
            partially_closed: 'Частично закрыто'
        };
        return texts[status] || status;
    }

    // Helper method to get PnL value based on position status
    getPnlValue(position) {
        // For closed positions, use realizedPnl
        if (position.status === 'closed') {
            return (parseFloat(position.realizedPnl) || 0).toFixed(2);
        }
        // For partially closed positions, sum both values
        else if (position.status === 'partially_closed') {
            const total = (parseFloat(position.realizedPnl) || 0) + (parseFloat(position.unrealizedPnl) || 0);
            return total.toFixed(2);
        }
        // For open positions, use unrealizedPnl
        else {
            return (parseFloat(position.unrealizedPnl) || 0).toFixed(2);
        }
    }

    // Helper method to get PnL color based on value
    getPnlColor(position) {
        let pnlValue = 0;
        
        // Determine which PnL value to use based on position status
        if (position.status === 'closed') {
            pnlValue = parseFloat(position.realizedPnl) || 0;
        } else if (position.status === 'partially_closed') {
            pnlValue = (parseFloat(position.realizedPnl) || 0) + (parseFloat(position.unrealizedPnl) || 0);
        } else {
            pnlValue = parseFloat(position.unrealizedPnl) || 0;
        }
        
        return pnlValue >= 0 ? '#28a745' : '#dc3545';
    }

    // TP Percentage Management
    populateTPPercentages(percentages) {
        const container = document.getElementById('edit-tp-container');
        container.innerHTML = '';
        
        percentages.forEach((percentage, index) => {
            this.addTPRow(container, percentage, index + 1, percentages.length > 3);
        });
        
        // Add the "Add TP" button
        if (percentages.length < 5) {
            const addButton = document.createElement('button');
            addButton.type = 'button';
            addButton.className = 'btn btn-small btn-secondary';
            addButton.textContent = '+ Добавить TP';
            addButton.onclick = () => this.addTPLevel(container);
            container.appendChild(addButton);
        }
        
        this.updateTPSummary(container);
    }
    
    addTPRow(container, value = '', index = 1, removable = false) {
        const row = document.createElement('div');
        row.className = 'tp-row';
        
        row.innerHTML = `
            <label>TP${index} (%):</label>
            <input type="number" class="tp-input" min="0.1" max="100" step="0.1" value="${value}">
            ${removable ? '<button type="button" class="remove-tp" onclick="this.parentElement.remove(); app.updateTPSummaryFromContainer();">✕</button>' : ''}
        `;
        
        // Add event listener to update summary when value changes
        const input = row.querySelector('.tp-input');
        input.addEventListener('input', () => this.updateTPSummaryFromContainer());
        
        container.insertBefore(row, container.querySelector('.btn-small') || null);
        return row;
    }
    
    addTPLevel(container) {
        const currentRows = container.querySelectorAll('.tp-row').length;
        if (currentRows >= 5) return;
        
        this.addTPRow(container, '', currentRows + 1, true);
        
        // Remove add button if we've reached the limit
        if (currentRows + 1 >= 5) {
            const addButton = container.querySelector('.btn-small');
            if (addButton) addButton.remove();
        }
        
        this.updateTPSummary(container);
    }
    
    updateTPSummaryFromContainer() {
        const container = document.getElementById('edit-tp-container') || 
                         document.querySelector('.tp-percentages-container');
        if (container) {
            this.updateTPSummary(container);
        }
    }
    
    updateTPSummary(container) {
        let summaryElement = container.querySelector('.tp-summary');
        if (!summaryElement) {
            summaryElement = document.createElement('div');
            summaryElement.className = 'tp-summary';
            container.appendChild(summaryElement);
        }
        
        const inputs = container.querySelectorAll('.tp-input');
        let total = 0;
        let validInputs = 0;
        
        for (let input of inputs) {
            const value = parseFloat(input.value);
            if (!isNaN(value) && value > 0) {
                total += value;
                validInputs++;
            }
        }
        
        const isValid = Math.abs(total - 100) < 0.1 && validInputs > 0;
        summaryElement.className = `tp-summary ${isValid ? 'valid' : 'invalid'}`;
        summaryElement.textContent = `Общий процент: ${total.toFixed(1)}% ${isValid ? '✓' : '(должно быть 100%)'}`;
    }
}

// CSS for notifications
const notificationStyles = `
    .notification {
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 1rem 1.5rem;
        border-radius: 6px;
        color: white;
        display: flex;
        align-items: center;
        gap: 1rem;
        z-index: 3000;
        animation: slideInRight 0.3s ease;
        max-width: 400px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.15);
    }
    
    .notification.success {
        background: #28a745;
    }
    
    .notification.error {
        background: #dc3545;
    }
    
    .notification.info {
        background: #17a2b8;
    }
    
    .notification-close {
        background: none;
        border: none;
        color: white;
        font-size: 1.2rem;
        cursor: pointer;
        padding: 0;
        margin: 0;
        line-height: 1;
    }
    
    @keyframes slideInRight {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
`;

// Add notification styles to document
const styleSheet = document.createElement('style');
styleSheet.textContent = notificationStyles;
document.head.appendChild(styleSheet);

// Initialize the application
const app = new TradingBotInterface();

// Make app globally available for onclick handlers
window.app = app;