'use strict'

const steps = [
  // require('./oco_exec'),
  require('./hidden'),
  require('./exec'),
  require('./ob_entry'),
  require('./as_market_beyond_ticker'),
  require('./postonly')
]

module.exports = (args = {}) => ({
  id: 'limit',
  label: 'LIMIT order tests',
  steps: steps.map(s => s(args))
})
