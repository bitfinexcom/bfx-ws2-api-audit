'use strict'

const steps = [
  require('./partial_fill'),
  require('./hidden'),
  require('./no_immediate_trigger'),
  require('./market_trigger')
]

module.exports = (args = {}) => ({
  id: 'stop_limit',
  label: 'STOP LIMIT order tests',
  steps: steps.map(s => s(args))
})
