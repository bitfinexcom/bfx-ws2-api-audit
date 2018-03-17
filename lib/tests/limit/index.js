'use strict'

const steps = require('./all.js')

module.exports = (args = {}) => ({
  id: 'limit',
  label: 'LIMIT order tests',
  steps: steps.map(s => s(args))
})
