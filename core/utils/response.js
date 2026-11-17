function success(res, data = null, message = 'Success', statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    message,
    data
  });
}

function error(res, message = 'Internal Server Error', statusCode = 500, details = null) {
  const payload = {
    success: false,
    message
  };
  if (details) {
    payload.details = details;
  }
  return res.status(statusCode).json(payload);
}

module.exports = {
  success,
  error
};
