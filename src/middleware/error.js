module.exports = (err, req, res, next) => {
  console.error(err);
  if (err && err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ status: false, message: 'A record with these details already exists', code: 'DUPLICATE_ENTRY' });
  }
  const status = Number(err.status || 500);
  res.status(status).json({
    status: false,
    message: status === 500 ? 'Internal server error' : (err.message || 'Request failed'),
    code: err.code || 'INTERNAL_ERROR'
  });
};
