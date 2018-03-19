'use strict'

const steps = [
  require('./cancel'),
  require('./immediate_exec'),
]

module.exports = (args = {}) => ({
  id: 'fok',
  label: 'FILL OR KILL order tests',
  steps: steps.map(s => s(args))
})
