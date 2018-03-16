'use strict'

let _cid = 0

const { Order } = require('bitfinex-api-node/lib/models')
const ocid = () => _cid++

const genOrder = (params, ws) => {
  const o = new Order({
    cid: ocid(),

    ...params
  }, ws)

  if (ws) {
    o.registerListeners()
  }

  return o
}

module.exports = (symbol, amount) => {
  return {
    genOrder,
    genBuy (params, ws) {
      if (!params.symbol) params.symbol = symbol
      if (!params.amount) params.amount = amount

      return genOrder(params, ws)
    },

    genSell (params, ws) {
      if (!params.symbol) params.symbol = symbol
      if (!params.amount) params.amount = amount * -1

      return genOrder(params, ws)
    }
  }
}
