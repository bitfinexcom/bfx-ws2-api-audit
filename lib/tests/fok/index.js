'use strict'

const steps = require('./all.js')

module.exports = (args = {}) => ({
  id: 'fok',
  label: 'FILL OR KILL order tests',
  steps: steps.map(s => s(args))
})
