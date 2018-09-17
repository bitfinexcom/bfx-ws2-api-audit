'use strict'

const steps = [
  require('./no_immediate_exec'),
  require('./market_trigger'),
]

module.exports = (args = {}) => ({
  id: 'stop',
  label: 'STOP order tests',
  steps: steps.map(s => s(args))
})
