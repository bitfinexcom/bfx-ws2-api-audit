'use strict'

const steps = require('./all.js')

module.exports = (args = {}) => ({
  id: 'trailing_stop',
  label: 'TRAILING STOP order tests',
  steps: steps.map(s => s(args))
})
