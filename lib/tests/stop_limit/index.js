'use strict'

const steps = [
  require('./no_immediate_trigger'),
  require('./market_trigger'),
  require('./partial_fill'),
  require('./hidden')
]

module.exports = (args = {}) => ({
  id: 'stop_limit',
  label: 'STOP LIMIT order tests',
  steps: steps.map(s => s(args))
})
