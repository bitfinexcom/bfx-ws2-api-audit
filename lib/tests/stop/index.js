'use strict'

const steps = require('./all.js')

module.exports = (args = {}) => ({
  id: 'stop',
  label: 'STOP order tests',
  steps: steps.map(s => s(args))
})
