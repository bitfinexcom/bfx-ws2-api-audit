'use strict'

const steps = require('./all.js')

module.exports = (args = {}) => ({
  id: 'stop_limit',
  label: 'STOP LIMIT order tests',
  steps: steps.map(s => s(args))
})
