'use strict'

let _cid = Date.now()

const { Order } = require('bitfinex-api-node/lib/models')
const delayPromise = require('./delay_promise')
const ocid = () => _cid++

const genOrder = (params, ws) => {
  if (!params.type) throw new Error('type required')

  const o = new Order({
    cid: ocid(),

    ...params
  }, ws)

  if (ws) {
    o.registerListeners()
  }

  return o
}

module.exports = (symbol, amount, dataDelay) => {
  const genBuy = (params = {}, ws) => {
    if (!params.symbol) params.symbol = symbol
    if (!params.amount) params.amount = amount

    return genOrder(params, ws)
  }

  const genSell = (params = {}, ws) => {
    if (!params.symbol) params.symbol = symbol
    if (!params.amount) params.amount = amount * -1

    return genOrder(params, ws)
  }

  return {
    genOrder,
    genBuy,
    genSell,

    genMarketBuy (params = {}, ws) {
      return genBuy({
        type: Order.type.EXCHANGE_MARKET,
        ...params
      }, ws)
    },

    genMarketSell (params = {}, ws) {
      return genSell({
        type: Order.type.EXCHANGE_MARKET,
        ...params
      }, ws)
    },

    genLimitBuy (params = {}, ws) {
      return genBuy({
        type: Order.type.EXCHANGE_LIMIT,
        ...params
      }, ws)
    },

    genLimitSell (params = {}, ws) {
      return genSell({
        type: Order.type.EXCHANGE_LIMIT,
        ...params
      }, ws)
    },

    submitOrder (o, ws, dataset) {
      return delayPromise(ws.submitOrder(o), dataDelay).then(() => {
        if (dataset && dataset.updateOrder) {
          dataset.updateOrder(o)
        }
      })
    }
  }
}
