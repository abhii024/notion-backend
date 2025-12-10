export const errorHandler = (err, req, res, next) => {
  console.error('Error:', err);

  // Default error
  let statusCode = 500;
  let message = 'Internal Server Error';
  let errors = null;

  // Handle different error types
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = 'Validation Error';
    errors = Object.values(err.errors).map(e => e.message);
  } else if (err.code === '23505') { // PostgreSQL unique violation
    statusCode = 409;
    message = 'Duplicate entry';
  } else if (err.code === '23503') { // PostgreSQL foreign key violation
    statusCode = 400;
    message = 'Referenced record not found';
  } else if (err.code === '22P02') { // PostgreSQL invalid input syntax
    statusCode = 400;
    message = 'Invalid input data';
  } else if (err.message && err.message.includes('not found')) {
    statusCode = 404;
    message = err.message;
  } else if (err.message && err.message.includes('invalid') || err.message.includes('Invalid')) {
    statusCode = 400;
    message = err.message;
  } else if (err.statusCode) {
    statusCode = err.statusCode;
    message = err.message || message;
  }

  // Development error response
  if (process.env.NODE_ENV === 'development') {
    return res.status(statusCode).json({
      success: false,
      error: message,
      message: err.message,
      stack: err.stack,
      errors
    });
  }

  // Production error response
  res.status(statusCode).json({
    success: false,
    error: message,
    errors
  });
};

// 404 handler
export const notFound = (req, res, next) => {
  const error = new Error(`Not Found - ${req.originalUrl}`);
  error.statusCode = 404;
  next(error);
};

// Async error wrapper
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
