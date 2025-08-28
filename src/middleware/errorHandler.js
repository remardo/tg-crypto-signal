const { logger } = require('../utils/logger');
const config = require('../config/app');

const errorHandler = (err, req, res, next) => {
  // Log the error
  logger.error('API Error:', {
    error: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    requestId: req.id
  });

  // Default error
  let error = {
    message: 'Internal Server Error',
    status: 500,
    code: 'INTERNAL_ERROR'
  };

  // Handle specific error types
  if (err.name === 'ValidationError') {
    error = {
      message: 'Validation Error',
      details: err.details || err.message,
      status: 400,
      code: 'VALIDATION_ERROR'
    };
  } else if (err.name === 'CastError') {
    error = {
      message: 'Invalid ID format',
      status: 400,
      code: 'INVALID_ID'
    };
  } else if (err.code === 'ECONNREFUSED') {
    error = {
      message: 'Database connection failed',
      status: 503,
      code: 'DATABASE_ERROR'
    };
  } else if (err.message.includes('not found')) {
    error = {
      message: err.message,
      status: 404,
      code: 'NOT_FOUND'
    };
  } else if (err.message.includes('already exists')) {
    error = {
      message: err.message,
      status: 409,
      code: 'CONFLICT'
    };
  } else if (err.message.includes('foreign key') || err.message.includes('внешнего ключа') || err.code === '23503') {
    error = {
      message: 'Cannot delete record due to existing references',
      details: 'This record is referenced by other data and cannot be deleted',
      status: 409,
      code: 'FOREIGN_KEY_CONSTRAINT'
    };
  } else if (err.message.includes('unauthorized') || err.message.includes('permission')) {
    error = {
      message: 'Unauthorized access',
      status: 401,
      code: 'UNAUTHORIZED'
    };
  } else if (err.message.includes('forbidden')) {
    error = {
      message: 'Forbidden',
      status: 403,
      code: 'FORBIDDEN'
    };
  } else if (err.message.includes('rate limit')) {
    error = {
      message: 'Rate limit exceeded',
      status: 429,
      code: 'RATE_LIMIT'
    };
  } else if (err.status) {
    // Use provided status
    error = {
      message: err.message,
      status: err.status,
      code: err.code || 'ERROR'
    };
  }

  // Prepare response
  const response = {
    success: false,
    error: {
      message: error.message,
      code: error.code,
      timestamp: new Date().toISOString(),
      requestId: req.id
    }
  };

  // Add details in development mode
  if (config.isDevelopment()) {
    response.error.details = err.message;
    response.error.stack = err.stack;
  }

  // Add validation details if available
  if (error.details) {
    response.error.details = error.details;
  }

  res.status(error.status).json(response);
};

// Async error wrapper
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Custom error classes
class ApiError extends Error {
  constructor(message, statusCode = 500, code = 'API_ERROR') {
    super(message);
    this.name = 'ApiError';
    this.status = statusCode;
    this.code = code;
  }
}

class ValidationError extends Error {
  constructor(message, details = null) {
    super(message);
    this.name = 'ValidationError';
    this.status = 400;
    this.code = 'VALIDATION_ERROR';
    this.details = details;
  }
}

class NotFoundError extends Error {
  constructor(resource = 'Resource') {
    super(`${resource} not found`);
    this.name = 'NotFoundError';
    this.status = 404;
    this.code = 'NOT_FOUND';
  }
}

class ConflictError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConflictError';
    this.status = 409;
    this.code = 'CONFLICT';
  }
}

class UnauthorizedError extends Error {
  constructor(message = 'Unauthorized access') {
    super(message);
    this.name = 'UnauthorizedError';
    this.status = 401;
    this.code = 'UNAUTHORIZED';
  }
}

class ForbiddenError extends Error {
  constructor(message = 'Forbidden') {
    super(message);
    this.name = 'ForbiddenError';
    this.status = 403;
    this.code = 'FORBIDDEN';
  }
}

module.exports = {
  errorHandler,
  asyncHandler,
  ApiError,
  ValidationError,
  NotFoundError,
  ConflictError,
  UnauthorizedError,
  ForbiddenError
};