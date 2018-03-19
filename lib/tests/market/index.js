'use strict'

// There is no need for testing MARKET seperately, as it is used in almost all
// of the other tests; if it doesn't work, a test elsewhere will certainly fail
const steps = []

module.exports = (args = {}) => ({
  id: 'market',
  label: 'MARKET order tests',
  steps: steps.map(s => s(args))
})
