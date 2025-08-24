const Joi = require('joi');
const { ValidationError } = require('./errorHandler');

// Channel validation schemas
const channelSchemas = {
  create: Joi.object({
    telegramChannelId: Joi.string().required().messages({
      'string.empty': 'Telegram channel ID is required',
      'any.required': 'Telegram channel ID is required'
    }),
    name: Joi.string().min(1).max(100).required().messages({
      'string.empty': 'Channel name is required',
      'string.min': 'Channel name must be at least 1 character',
      'string.max': 'Channel name cannot exceed 100 characters',
      'any.required': 'Channel name is required'
    }),
    description: Joi.string().max(500).optional(),
    maxPositionPercentage: Joi.number().min(1).max(100).default(10).messages({
      'number.min': 'Max position percentage must be at least 1%',
      'number.max': 'Max position percentage cannot exceed 100%'
    }),
    autoExecute: Joi.boolean().default(false),
    riskPercentage: Joi.number().min(0.1).max(20).default(2).messages({
      'number.min': 'Risk percentage must be at least 0.1%',
      'number.max': 'Risk percentage cannot exceed 20%'
    }),
    initialBalance: Joi.number().min(0).default(0).messages({
      'number.min': 'Initial balance cannot be negative'
    }),
    tpPercentages: Joi.array().items(
      Joi.number().min(0.1).max(100)
    ).min(1).max(5).default([25.0, 25.0, 50.0]).messages({
      'array.min': 'At least one TP percentage is required',
      'array.max': 'Maximum 5 TP levels allowed',
      'number.min': 'TP percentage must be at least 0.1%',
      'number.max': 'TP percentage cannot exceed 100%'
    })
  }),

  update: Joi.object({
    name: Joi.string().min(1).max(100).optional(),
    description: Joi.string().max(500).optional(),
    maxPositionPercentage: Joi.number().min(1).max(100).optional(),
    autoExecute: Joi.boolean().optional(),
    riskPercentage: Joi.number().min(0.1).max(20).optional(),
    tpPercentages: Joi.array().items(
      Joi.number().min(0.1).max(100)
    ).min(1).max(5).optional().messages({
      'array.min': 'At least one TP percentage is required',
      'array.max': 'Maximum 5 TP levels allowed',
      'number.min': 'TP percentage must be at least 0.1%',
      'number.max': 'TP percentage cannot exceed 100%'
    })
  }).min(1).messages({
    'object.min': 'At least one field must be provided for update'
  }),

  transfer: Joi.object({
    amount: Joi.number().positive().required().messages({
      'number.positive': 'Amount must be positive',
      'any.required': 'Amount is required'
    }),
    asset: Joi.string().valid('USDT', 'BTC', 'ETH').default('USDT')
  })
};

// Signal validation schemas
const signalSchemas = {
  execute: Joi.object({
    positionSize: Joi.number().positive().optional().messages({
      'number.positive': 'Position size must be positive'
    }),
    leverage: Joi.number().integer().min(1).max(100).optional().messages({
      'number.integer': 'Leverage must be an integer',
      'number.min': 'Leverage must be at least 1',
      'number.max': 'Leverage cannot exceed 100'
    })
  }),

  query: Joi.object({
    channelId: Joi.string().uuid().optional(),
    status: Joi.string().valid('pending', 'approved', 'executed', 'ignored', 'failed', 'closed').optional(),
    signalType: Joi.string().valid('entry', 'update', 'close', 'general').optional(),
    coin: Joi.string().optional(),
    direction: Joi.string().valid('LONG', 'SHORT').optional(),
    limit: Joi.number().integer().min(1).max(100).default(50).optional(),
    offset: Joi.number().integer().min(0).default(0).optional(),
    timeRange: Joi.string().valid('1h', '24h', '7d', '30d').optional()
  }),

  ignore: Joi.object({
    reason: Joi.string().max(200).optional()
  })
};

// Position validation schemas
const positionSchemas = {
  close: Joi.object({
    reason: Joi.string().max(100).optional(),
    percentage: Joi.number().min(0.1).max(1).default(1).messages({
      'number.min': 'Percentage must be at least 0.1 (10%)',
      'number.max': 'Percentage cannot exceed 1 (100%)'
    })
  }),

  modify: Joi.object({
    stopLoss: Joi.number().positive().optional(),
    takeProfitLevels: Joi.array().items(Joi.number().positive()).optional()
  }).min(1).messages({
    'object.min': 'At least one field must be provided for modification'
  }),

  query: Joi.object({
    channelId: Joi.string().uuid().optional(),
    status: Joi.string().valid('open', 'closed', 'partially_closed').optional(),
    symbol: Joi.string().optional(),
    limit: Joi.number().integer().min(1).max(100).default(100).optional(),
    offset: Joi.number().integer().min(0).default(0).optional()
  })
};

// General validation schemas
const commonSchemas = {
  uuid: Joi.string().uuid().required().messages({
    'string.guid': 'Invalid ID format',
    'any.required': 'ID is required'
  }),

  pagination: Joi.object({
    limit: Joi.number().integer().min(1).max(100).default(50),
    offset: Joi.number().integer().min(0).default(0)
  }),

  timeRange: Joi.string().valid('1h', '24h', '7d', '30d').default('24h')
};

// Validation middleware factory
const validate = (schema, property = 'body') => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[property], {
      abortEarly: false,
      allowUnknown: false,
      stripUnknown: true
    });

    if (error) {
      const details = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context?.value
      }));

      return next(new ValidationError('Validation failed', details));
    }

    // Replace the original data with validated data
    req[property] = value;
    next();
  };
};

// Specific validation middlewares
const validateChannelCreate = validate(channelSchemas.create);
const validateChannelUpdate = validate(channelSchemas.update);
const validateChannelTransfer = validate(channelSchemas.transfer);

const validateSignalExecute = validate(signalSchemas.execute);
const validateSignalQuery = validate(signalSchemas.query, 'query');
const validateSignalIgnore = validate(signalSchemas.ignore);

const validatePositionClose = validate(positionSchemas.close);
const validatePositionModify = validate(positionSchemas.modify);
const validatePositionQuery = validate(positionSchemas.query, 'query');

const validateUuid = validate(commonSchemas.uuid, 'params');
const validatePagination = validate(commonSchemas.pagination, 'query');
const validateTimeRange = validate(commonSchemas.timeRange, 'query');

// UUID parameter validation
const validateUuidParam = (paramName = 'id') => {
  return validate(Joi.object({
    [paramName]: commonSchemas.uuid
  }), 'params');
};

// Custom validation functions
const validatePositiveNumber = (value, fieldName) => {
  if (isNaN(value) || value <= 0) {
    throw new ValidationError(`${fieldName} must be a positive number`);
  }
  return parseFloat(value);
};

const validateInteger = (value, fieldName, min = null, max = null) => {
  const num = parseInt(value);
  if (isNaN(num)) {
    throw new ValidationError(`${fieldName} must be an integer`);
  }
  if (min !== null && num < min) {
    throw new ValidationError(`${fieldName} must be at least ${min}`);
  }
  if (max !== null && num > max) {
    throw new ValidationError(`${fieldName} cannot exceed ${max}`);
  }
  return num;
};

const validateEnum = (value, allowedValues, fieldName) => {
  if (!allowedValues.includes(value)) {
    throw new ValidationError(`${fieldName} must be one of: ${allowedValues.join(', ')}`);
  }
  return value;
};

// Request sanitization
const sanitizeRequest = (req, res, next) => {
  // Remove null and undefined values
  const sanitizeObject = (obj) => {
    if (obj && typeof obj === 'object') {
      Object.keys(obj).forEach(key => {
        if (obj[key] === null || obj[key] === undefined) {
          delete obj[key];
        } else if (typeof obj[key] === 'object') {
          sanitizeObject(obj[key]);
        } else if (typeof obj[key] === 'string') {
          obj[key] = obj[key].trim();
        }
      });
    }
  };

  sanitizeObject(req.body);
  sanitizeObject(req.query);
  sanitizeObject(req.params);

  next();
};

module.exports = {
  // Schema validation
  validate,
  
  // Channel validations
  validateChannelCreate,
  validateChannelUpdate,
  validateChannelTransfer,
  
  // Signal validations
  validateSignalExecute,
  validateSignalQuery,
  validateSignalIgnore,
  
  // Position validations
  validatePositionClose,
  validatePositionModify,
  validatePositionQuery,
  
  // Common validations
  validateUuid,
  validateUuidParam,
  validatePagination,
  validateTimeRange,
  
  // Custom validators
  validatePositiveNumber,
  validateInteger,
  validateEnum,
  
  // Sanitization
  sanitizeRequest,
  
  // Schemas (for external use)
  schemas: {
    channel: channelSchemas,
    signal: signalSchemas,
    position: positionSchemas,
    common: commonSchemas
  }
};