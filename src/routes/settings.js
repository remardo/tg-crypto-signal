const express = require('express');
const router = express.Router();
const { logger } = require('../utils/logger');
const fs = require('fs').promises;
const path = require('path');

// Path to store settings
const SETTINGS_FILE = path.join(__dirname, '../../settings.json');

// Default settings
const DEFAULT_SETTINGS = {
    riskManagementDisabled: false,
    autoExecute: true,
    defaultRisk: 2.0
};

// Load settings from file
async function loadSettings() {
    try {
        const data = await fs.readFile(SETTINGS_FILE, 'utf8');
        return { ...DEFAULT_SETTINGS, ...JSON.parse(data) };
    } catch (error) {
        // File doesn't exist or is invalid, return defaults
        return DEFAULT_SETTINGS;
    }
}

// Save settings to file
async function saveSettings(settings) {
    try {
        await fs.writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2));
        return true;
    } catch (error) {
        logger.error('Error saving settings:', error);
        return false;
    }
}

// Get current settings
router.get('/', async (req, res) => {
    try {
        const settings = await loadSettings();
        res.json({
            success: true,
            data: settings
        });
    } catch (error) {
        logger.error('Error getting settings:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load settings'
        });
    }
});

// Update risk management setting
router.post('/risk-management', async (req, res) => {
    try {
        const { disabled } = req.body;
        
        if (typeof disabled !== 'boolean') {
            return res.status(400).json({
                success: false,
                error: 'Invalid disabled value, must be boolean'
            });
        }
        
        // Load current settings
        const settings = await loadSettings();
        
        // Update risk management setting
        settings.riskManagementDisabled = disabled;
        
        // Save settings
        const saved = await saveSettings(settings);
        
        if (!saved) {
            return res.status(500).json({
                success: false,
                error: 'Failed to save settings'
            });
        }
        
        logger.info('Risk management setting updated:', {
            disabled,
            timestamp: new Date().toISOString()
        });
        
        res.json({
            success: true,
            data: {
                riskManagementDisabled: disabled,
                message: disabled ? 
                    'Risk management disabled - ALL signals will be accepted!' : 
                    'Risk management enabled - Quality checks active'
            }
        });
        
    } catch (error) {
        logger.error('Error updating risk management setting:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update risk management setting'
        });
    }
});

// Get risk management status
router.get('/risk-management', async (req, res) => {
    try {
        const settings = await loadSettings();
        res.json({
            success: true,
            data: {
                disabled: settings.riskManagementDisabled,
                status: settings.riskManagementDisabled ? 'disabled' : 'enabled'
            }
        });
    } catch (error) {
        logger.error('Error getting risk management status:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get risk management status'
        });
    }
});

// Update general settings
router.post('/general', async (req, res) => {
    try {
        const { autoExecute, defaultRisk } = req.body;
        
        // Validate inputs
        if (typeof autoExecute !== 'boolean') {
            return res.status(400).json({
                success: false,
                error: 'Invalid autoExecute value, must be boolean'
            });
        }
        
        if (typeof defaultRisk !== 'number' || defaultRisk < 0.1 || defaultRisk > 20) {
            return res.status(400).json({
                success: false,
                error: 'Invalid defaultRisk value, must be number between 0.1 and 20'
            });
        }
        
        // Load current settings
        const settings = await loadSettings();
        
        // Update settings
        settings.autoExecute = autoExecute;
        settings.defaultRisk = defaultRisk;
        
        // Save settings
        const saved = await saveSettings(settings);
        
        if (!saved) {
            return res.status(500).json({
                success: false,
                error: 'Failed to save settings'
            });
        }
        
        logger.info('General settings updated:', {
            autoExecute,
            defaultRisk,
            timestamp: new Date().toISOString()
        });
        
        res.json({
            success: true,
            data: {
                autoExecute,
                defaultRisk,
                message: 'General settings updated successfully'
            }
        });
        
    } catch (error) {
        logger.error('Error updating general settings:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update general settings'
        });
    }
});

// Export function to get current settings (for use in other modules)
async function getRiskManagementStatus() {
    try {
        const settings = await loadSettings();
        return settings.riskManagementDisabled;
    } catch (error) {
        logger.error('Error getting risk management status:', error);
        return false; // Default to enabled (false = not disabled)
    }
}

module.exports = {
    router,
    getRiskManagementStatus,
    loadSettings,
    saveSettings
};