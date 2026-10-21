exports.ok = (res, data = {}, message = 'Success', status = 200) =>
  res.status(status).json({ status: true, message, data });
exports.fail = (res, status, message, code = 'ERROR') =>
  res.status(status).json({ status: false, message, code });
exports.id = (prefix) => `${prefix}_${require('crypto').randomBytes(8).toString('hex')}`;
exports.asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
