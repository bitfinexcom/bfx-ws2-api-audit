'use strict'

const steps = [
  require('./limit_replication')
]

module.exports = (args = {}) => {
  const { primaryPair, virtualPair } = args

  return {
    id: `virtual_order_books_${primaryPair}_${virtualPair}`,
    label: `Virtual order book tests (${primaryPair} | ${virtualPair})`,
    steps: steps.map(s => s(args))
  }
}
