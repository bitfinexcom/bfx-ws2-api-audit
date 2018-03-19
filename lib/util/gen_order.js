'use strict'

let _cid = Date.now()

const { Order } = require('bitfinex-api-node/lib/models')
const { prepareAmount, preparePrice } = require('./precision')
const isFinite = require('lodash/isFinite')
const delayPromise = require('./delay_promise')
const ocid = () => _cid++

const genOrder = (params, ws) => {
  if (!params.type) throw new Error('type required')
  if (params.price) params.price = preparePrice(params.price)
  if (params.amount) params.amount = prepareAmount(params.amount)

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
    if (!isFinite(params.amount)) params.amount = amount
    if (params.amount < 0) params.amount *= -1 // ensure buy

    return genOrder(params, ws)
  }

  const genSell = (params = {}, ws) => {
    if (!params.symbol) params.symbol = symbol
    if (!isFinite(params.amount)) params.amount = amount * -1
    if (params.amount > 0) params.amount *= -1 // ensure sell

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

    genStopBuy (params = {}, ws) {
      return genBuy({
        type: Order.type.EXCHANGE_STOP,
        ...params
      }, ws)
    },

    genStopSell (params = {}, ws) {
      return genSell({
        type: Order.type.EXCHANGE_STOP,
        ...params
      }, ws)
    },

    genStopLimitBuy (params = {}, ws) {
      return genBuy({
        type: Order.type.EXCHANGE_STOP_LIMIT,
        ...params
      }, ws)
    },

    genStopLimitSell (params = {}, ws) {
      return genSell({
        type: Order.type.EXCHANGE_STOP_LIMIT,
        ...params
      }, ws)
    },

    genFOKBuy (params = {}, ws) {
      return genBuy({
        type: Order.type.EXCHANGE_FOK,
        ...params
      }, ws)
    },

    genFOKSell (params = {}, ws) {
      return genSell({
        type: Order.type.EXCHANGE_FOK,
        ...params
      }, ws)
    },

    cancelOrder (o, ws, dataset) {
      return delayPromise(ws.cancelOrder(o), dataDelay).then(() => {
        if (dataset && dataset.updateOrder) {
          dataset.updateOrder(o)
        }
      })
    },

    submitOrder (o, ws, dataset) {
      return delayPromise(ws.submitOrder(o), dataDelay).then(() => {
        if (dataset && dataset.updateOrder) {
          dataset.updateOrder(o)
        }
      })
    },

    submitOrders (orders, ws, dataset) {
      const p = Promise.all(orders.map(o => ws.submitOrder(o))).then(() => {
        if (dataset && dataset.updateOrder) {
          orders.forEach(o => dataset.updateOrder(o))
        }
      })

      return delayPromise(p, dataDelay)
    },

    cancelOrders (orders, ws, dataset) {
      const p = Promise.all(orders.map(o => ws.cancelOrder(o))).then(() => {
        if (dataset && dataset.updateOrder) {
          orders.forEach(o => dataset.updateOrder(o))
        }
      })

      return delayPromise(p, dataDelay)
    }
  }
}
