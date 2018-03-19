'use strict'

const steps = [
  require('./partial_fill'),
  require('./hidden'),
  require('./no_immediate_trigger'),
  require('./market_trigger')
]

module.exports = steps
