'use strict'

const steps = [
  require('./hidden'),
  require('./exec'),
  require('./ob_entry'),
  require('./as_market_beyond_ticker'),
  require('./postonly'),
  require('./oco_exec')
]

module.exports = (args = {}) => ({
  id: 'limit',
  label: 'LIMIT order tests',
  steps: steps.map(s => s(args))
})
