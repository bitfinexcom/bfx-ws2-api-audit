'use strict'

const steps = require('./all.js')

module.exports = (args = {}) => ({
  id: 'market',
  label: 'MARKET order tests',
  steps: steps.map(s => s(args))
})
