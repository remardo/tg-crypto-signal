const OpenAI = require('openai');
const config = require('../config/app');
const { logger, signal: signalLog } = require('../utils/logger');
const BingXService = require('./bingxService');

class SignalRecognitionService {
  constructor() {
    this.openai = null;
    this.initialized = false;
    this.bingxService = new BingXService();
  }

  async initialize() {
    try {
      if (!config.openai.apiKey) {
        throw new Error('OpenAI API key is required');
      }

      this.openai = new OpenAI({
        apiKey: config.openai.apiKey,
        timeout: config.openai.timeout,
      });

      // Initialize BingX service for coin validation
      await this.bingxService.initialize();

      this.initialized = true;
      logger.info('Signal recognition service initialized successfully');
      
      return true;
    } catch (error) {
      logger.error('Failed to initialize signal recognition service:', error);
      throw error;
    }
  }

  async analyzeMessage(messageData) {
    try {
      if (!this.initialized) {
        throw new Error('Service not initialized');
      }

      const { text, channelName, date } = messageData;
      
      if (!text || text.trim().length === 0) {
        return {
          isSignal: false,
          signalType: 'general',
          confidence: 0,
          reason: 'Empty or no text content'
        };
      }

      // Use System of Thought (SOT) approach for signal analysis
      const analysisResult = await this.performSOTAnalysis(text, channelName);
      
      signalLog('analyzed', {
        channelName,
        textLength: text.length,
        isSignal: analysisResult.isSignal,
        confidence: analysisResult.confidence,
        signalType: analysisResult.signalType
      });

      return analysisResult;

    } catch (error) {
      logger.error('Error analyzing message:', error);
      throw error;
    }
  }

  async performSOTAnalysis(text, channelName) {
    try {
      // System of Thought: Multi-step reasoning process
      const prompt = this.buildSOTPrompt(text, channelName);
      
      const response = await this.openai.chat.completions.create({
        model: config.openai.model,
        messages: [
          {
            role: 'system',
            content: this.getSystemPrompt()
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: config.openai.maxTokens,
        temperature: config.openai.temperature,
        response_format: { type: 'json_object' }
      });

      const result = JSON.parse(response.choices[0].message.content);
      
      // Validate and normalize the result
      return this.validateAndNormalizeResult(result, text);

    } catch (error) {
      logger.error('Error in SOT analysis:', error);
      return {
        isSignal: false,
        signalType: 'general',
        confidence: 0,
        reason: `Analysis error: ${error.message}`,
        rawAnalysis: null
      };
    }
  }

  getSystemPrompt() {
    return `You are an expert cryptocurrency trading signal analyzer with a System of Thought (SOT) approach. Your task is to analyze Telegram messages from crypto trading channels and determine if they contain trading signals.

SYSTEM OF THOUGHT PROCESS:
1. IDENTIFY: First identify if this is a trading-related message
2. CLASSIFY: Classify the type of content (entry signal, position update, general discussion, etc.)
3. EXTRACT: Extract specific trading parameters if present
4. VALIDATE: Validate the completeness and coherence of extracted data
5. ASSESS: Assess confidence level based on clarity and completeness

SIGNAL TYPES:
- "entry": New position entry signal with coin, direction, entry price, TP, SL
- "update": Updates to existing positions (TP modifications, SL changes, hold instructions)
- "close": Instructions to close or partially close positions
- "general": General market commentary, not actionable trading signals

CONFIDENCE SCORING (0.0 - 1.0):
- 0.9-1.0: Complete signal with all required parameters clearly stated
- 0.7-0.9: Most parameters present but some ambiguity or missing minor details
- 0.5-0.7: Basic signal structure but missing important parameters
- 0.3-0.5: Mentions trading but lacks clear actionable information
- 0.0-0.3: Non-trading content or extremely unclear

You must respond with valid JSON only. No additional text or explanation outside the JSON structure.`;
  }

  buildSOTPrompt(text, channelName) {
    return `Analyze this message from channel "${channelName}" using the System of Thought approach:

MESSAGE TEXT:
"""
${text}
"""

ANALYSIS STEPS:

Step 1 - IDENTIFY: Is this trading-related content?
- Look for cryptocurrency names, trading terms, price levels, directions (LONG/SHORT)

Step 2 - CLASSIFY: What type of content is this?
- Entry signal: New position with entry price, direction, TP, SL
- Position update: Modifications to existing positions
- Close signal: Instructions to close positions
- General: Market commentary, news, non-actionable content

Step 3 - EXTRACT: If trading signal, extract parameters:
- Coin/Symbol (e.g., SAND, BTC, ETH)
- Direction (LONG/SHORT)
- Leverage (e.g., x25, x50)
- Entry price or entry range
- Take profit levels (multiple levels possible)
- Stop loss level
- Suggested position size/volume

Step 4 - VALIDATE: Check completeness and coherence:
- Are required parameters present for the signal type?
- Do the price levels make logical sense?
- Is the direction consistent with TP/SL levels?

Step 5 - ASSESS: Calculate confidence score:
- Consider completeness, clarity, and logical consistency

Respond with JSON in this exact format:
{
  "sot_analysis": {
    "step1_identify": "Brief assessment of whether this is trading-related",
    "step2_classify": "Classification of content type",
    "step3_extract": "Summary of extracted parameters",
    "step4_validate": "Validation of completeness and logic",
    "step5_assess": "Confidence assessment reasoning"
  },
  "isSignal": boolean,
  "signalType": "entry|update|close|general",
  "confidence": float between 0.0 and 1.0,
  "extractedData": {
    "coin": "string or null",
    "direction": "LONG|SHORT or null",
    "leverage": integer or null,
    "entryPrice": float or null,
    "entryPriceRange": [float, float] or null,
    "takeProfitLevels": [float array] or null,
    "stopLoss": float or null,
    "suggestedVolume": string or null,
    "additionalNotes": "string or null"
  },
  "reasoning": "Brief explanation of the analysis result"
}`;
  }

  // Fuzzy coin matching against supported symbols
  fuzzyCoinMatch(extractedCoin) {
    if (!extractedCoin || !this.bingxService.supportedSymbols.length) {
      return extractedCoin;
    }

    const normalizedCoin = extractedCoin.toUpperCase().replace(/[^A-Z0-9]/g, '');
    
    // Exact match first
    const exactMatch = this.bingxService.supportedSymbols.find(s => 
      s.symbol === normalizedCoin || 
      s.baseAsset === normalizedCoin ||
      s.symbol.replace('-', '') === normalizedCoin
    );
    
    if (exactMatch) {
      return exactMatch.symbol;
    }

    // Fuzzy matching with Levenshtein distance
    let bestMatch = null;
    let bestDistance = Infinity;
    
    for (const symbol of this.bingxService.supportedSymbols) {
      if (!symbol.baseAsset) continue;
      
      const symbolBase = symbol.baseAsset;
      const distance = this.levenshteinDistance(normalizedCoin, symbolBase);
      
      // Allow up to 2 character differences for short symbols, 3 for longer
      const maxDistance = symbolBase.length <= 4 ? 2 : 3;
      
      if (distance <= maxDistance && distance < bestDistance) {
        bestDistance = distance;
        bestMatch = symbol.symbol;
      }
    }
    
    return bestMatch || extractedCoin;
  }

  // Calculate Levenshtein distance for fuzzy matching
  levenshteinDistance(str1, str2) {
    if (!str1 || !str2) return Infinity;
    
    const matrix = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1,     // insertion
            matrix[i - 1][j] + 1      // deletion
          );
        }
      }
    }
    
    return matrix[str2.length][str1.length];
  }

  validateAndNormalizeResult(result, originalText) {
    try {
      // Ensure required fields exist
      const normalized = {
        isSignal: Boolean(result.isSignal),
        signalType: result.signalType || 'general',
        confidence: Math.max(0, Math.min(1, parseFloat(result.confidence) || 0)),
        reasoning: result.reasoning || 'No reasoning provided',
        sotAnalysis: result.sot_analysis || {},
        extractedData: result.extractedData || {},
        rawAnalysis: result
      };

      // Validate signal type
      const validSignalTypes = ['entry', 'update', 'close', 'general'];
      if (!validSignalTypes.includes(normalized.signalType)) {
        normalized.signalType = 'general';
      }

      // If marked as signal, ensure minimum data requirements
      if (normalized.isSignal && normalized.signalType === 'entry') {
        const extracted = normalized.extractedData;
        
        // For entry signals, we need at least coin and direction
        if (!extracted.coin || !extracted.direction) {
          normalized.isSignal = false;
          normalized.confidence = Math.min(0.3, normalized.confidence);
          normalized.reasoning += ' (Missing essential parameters for entry signal)';
        }

        // Validate direction
        if (extracted.direction && !['LONG', 'SHORT'].includes(extracted.direction.toUpperCase())) {
          extracted.direction = null;
        }

        // Normalize and fuzzy match coin symbol
        if (extracted.coin) {
          const normalizedCoin = extracted.coin.toUpperCase().replace(/[^A-Z0-9]/g, '');
          extracted.coin = this.fuzzyCoinMatch(normalizedCoin);
        }

        // Validate take profit levels
        if (extracted.takeProfitLevels && Array.isArray(extracted.takeProfitLevels)) {
          extracted.takeProfitLevels = extracted.takeProfitLevels
            .map(tp => parseFloat(tp))
            .filter(tp => !isNaN(tp) && tp > 0)
            .sort((a, b) => {
              // Sort based on direction
              return extracted.direction === 'LONG' ? a - b : b - a;
            });
        }

        // Validate price levels logic
        if (extracted.entryPrice && extracted.stopLoss && extracted.takeProfitLevels?.length > 0) {
          const entryPrice = parseFloat(extracted.entryPrice);
          const stopLoss = parseFloat(extracted.stopLoss);
          const firstTP = parseFloat(extracted.takeProfitLevels[0]);

          let validLogic = true;

          if (extracted.direction === 'LONG') {
            // For LONG: TP > Entry > SL
            if (!(firstTP > entryPrice && entryPrice > stopLoss)) {
              validLogic = false;
            }
          } else if (extracted.direction === 'SHORT') {
            // For SHORT: SL > Entry > TP
            if (!(stopLoss > entryPrice && entryPrice > firstTP)) {
              validLogic = false;
            }
          }

          if (!validLogic) {
            normalized.confidence = Math.min(0.4, normalized.confidence);
            normalized.reasoning += ' (Price levels logic inconsistency)';
          }
        }
      }

      // Apply confidence threshold for signal classification
      if (normalized.confidence < config.trading.minSignalConfidence) {
        normalized.isSignal = false;
      }

      return normalized;

    } catch (error) {
      logger.error('Error validating analysis result:', error);
      return {
        isSignal: false,
        signalType: 'general',
        confidence: 0,
        reasoning: `Validation error: ${error.message}`,
        sotAnalysis: {},
        extractedData: {},
        rawAnalysis: result
      };
    }
  }

  async batchAnalyze(messages) {
    try {
      const results = [];
      
      for (const message of messages) {
        try {
          const result = await this.analyzeMessage(message);
          results.push({
            messageId: message.messageId,
            ...result
          });
        } catch (error) {
          logger.error(`Error analyzing message ${message.messageId}:`, error);
          results.push({
            messageId: message.messageId,
            isSignal: false,
            signalType: 'general',
            confidence: 0,
            reasoning: `Analysis error: ${error.message}`
          });
        }
        
        // Add delay to respect rate limits
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      return results;

    } catch (error) {
      logger.error('Error in batch analysis:', error);
      throw error;
    }
  }

  async testSignalRecognition(testMessage) {
    try {
      const testData = {
        text: testMessage,
        channelName: 'Test Channel',
        date: new Date()
      };

      return await this.analyzeMessage(testData);

    } catch (error) {
      logger.error('Error testing signal recognition:', error);
      throw error;
    }
  }

  getStats() {
    return {
      initialized: this.initialized,
      model: config.openai.model,
      confidenceThreshold: config.trading.minSignalConfidence,
      supportedSignalTypes: ['entry', 'update', 'close', 'general']
    };
  }
}

// Example usage patterns for testing
const EXAMPLE_SIGNALS = {
  VALID_ENTRY: `
Монета: SAND SHORT Х25 ⤴️

🔵Цена входа: 0.29889

✅Тэйки: 0.29618 0.29293 0.27341

🛑Стоп: 0.31235

Входим на 10$
🏦Банк: 158.7$
  `,
  
  POSITION_UPDATE: `
SAND SHORT позиция:
Убираем стоп временно, держим до первого тейка
Текущая цена: 0.29500
  `,
  
  CLOSE_SIGNAL: `
SAND SHORT - закрываем 50% позиции по текущей цене
Остальное держим до второго тейка
  `,
  
  GENERAL_POST: `
Сегодня рынок очень волатильный, будьте осторожны с новыми позициями.
Биткоин тестирует важный уровень поддержки.
  `
};

module.exports = { SignalRecognitionService, EXAMPLE_SIGNALS };